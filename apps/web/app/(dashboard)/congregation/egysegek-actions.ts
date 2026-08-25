'use server'

// 2026-08-25: Gyülekezeti egységek (leány/szórvány az anya kartotékán belül) —
// CRUD server actionök. Adat-kontraktus: lib/gyulekezet/egysegek-shared.ts.
//
// Az egységeket a SAJÁT gyülekezet kezeli (lelkész/gondnok) — az RLS a
// gyulekezeti_egysegek táblán (skalár + profile_roles-láb + rendszergazda)
// a végső őr; itt minden mutáció .select('id')-vel ellenőrzi, hogy tényleg
// megtörtént-e (RLS-elutasításnál a Supabase nem hibát ad, hanem 0 sort).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import type { GyulekezetiEgyseg } from '@/lib/gyulekezet/egysegek-shared'

const HIANYZO_TABLA_MINTA = /relation .* does not exist|schema cache|could not find/i

function hianyzoTablaUzenet(): string {
  return (
    'A gyülekezeti egységek táblája még nincs létrehozva az adatbázisban. ' +
    'Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt, majd próbálja újra.'
  )
}

const egysegSchema = z.object({
  id: z.string().uuid().optional(),
  nev: z.string().trim().min(2, 'Az egység neve legalább 2 karakter legyen.').max(120),
  tipus: z.enum(['leany', 'szorvany']),
  adrlocality_id: z.number().int().positive().nullable().optional(),
  sorrend: z.number().int().min(0).max(9999).optional(),
  aktiv: z.boolean().optional(),
  megjegyzes: z.string().trim().max(500).nullable().optional(),
})

export type EgysegInput = z.infer<typeof egysegSchema>

const EGYSEG_SELECT =
  'id, congregation_id, nev, tipus, adrlocality_id, linked_congregation_id, sorrend, aktiv, megjegyzes'

/**
 * A saját gyülekezet egységei (alapból csak az aktívak).
 * Hibánál { error } — a hívó SOHA ne kezelje üres listaként a hibát.
 */
export async function listGyulekezetiEgysegek(opts?: {
  inaktivakIs?: boolean
}): Promise<{ egysegek?: GyulekezetiEgyseg[]; error?: string }> {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezeti hatókör.' }

  let q = supabase
    .from('gyulekezeti_egysegek')
    .select(EGYSEG_SELECT)
    .eq('congregation_id', congregationId)
    .order('sorrend', { ascending: true })
    .order('nev', { ascending: true })
  if (!opts?.inaktivakIs) q = q.eq('aktiv', true)

  const { data, error } = await q
  if (error) {
    if (HIANYZO_TABLA_MINTA.test(error.message)) return { error: hianyzoTablaUzenet() }
    return { error: `Az egységek betöltése sikertelen: ${error.message}` }
  }
  return { egysegek: (data || []) as GyulekezetiEgyseg[] }
}

/** Egység létrehozása vagy módosítása (id nélkül = új). */
export async function saveGyulekezetiEgyseg(
  input: EgysegInput,
): Promise<{ ok?: true; id?: string; error?: string }> {
  const parsed = egysegSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Hiányos vagy érvénytelen adat.' }
  }

  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezeti hatókör.' }

  const mezok = {
    nev: parsed.data.nev,
    tipus: parsed.data.tipus,
    adrlocality_id: parsed.data.adrlocality_id ?? null,
    ...(parsed.data.sorrend !== undefined ? { sorrend: parsed.data.sorrend } : {}),
    ...(parsed.data.aktiv !== undefined ? { aktiv: parsed.data.aktiv } : {}),
    megjegyzes: parsed.data.megjegyzes?.trim() || null,
  }

  if (parsed.data.id) {
    // Módosítás — a congregation_id-szűrő megakadályozza, hogy idegen
    // gyülekezet egységét írjuk át; .select('id') a néma-no-op ellen.
    const updated = await supabase
      .from('gyulekezeti_egysegek')
      .update(mezok)
      .eq('id', parsed.data.id)
      .eq('congregation_id', congregationId)
      .select('id')
    if (updated.error) {
      if (HIANYZO_TABLA_MINTA.test(updated.error.message)) return { error: hianyzoTablaUzenet() }
      return { error: `Az egység mentése sikertelen: ${updated.error.message}` }
    }
    if (!updated.data || updated.data.length === 0) {
      return {
        error:
          'A mentés nem történt meg (az egység nem található, vagy az adatbázis jogosultság-szabálya elutasította).',
      }
    }
    await logAuditEvent(
      {
        action: 'egyseg.updated',
        targetTable: 'gyulekezeti_egysegek',
        targetId: parsed.data.id,
        metadata: { nev: parsed.data.nev, tipus: parsed.data.tipus },
      },
      supabase,
    )
    revalidatePath('/munkanaplo')
    revalidatePath('/tagnyilvantartas')
    return { ok: true, id: parsed.data.id }
  }

  const inserted = await supabase
    .from('gyulekezeti_egysegek')
    .insert({ ...mezok, congregation_id: congregationId })
    .select('id')
    .maybeSingle()
  if (inserted.error) {
    if (HIANYZO_TABLA_MINTA.test(inserted.error.message)) return { error: hianyzoTablaUzenet() }
    if (inserted.error.code === '23505') {
      return { error: 'Ilyen nevű egység már létezik ebben a gyülekezetben.' }
    }
    return { error: `Az egység létrehozása sikertelen: ${inserted.error.message}` }
  }
  if (!inserted.data?.id) {
    return { error: 'Az egység létrehozása nem történt meg (az adatbázis jogosultság-szabálya elutasította).' }
  }
  await logAuditEvent(
    {
      action: 'egyseg.created',
      targetTable: 'gyulekezeti_egysegek',
      targetId: inserted.data.id,
      metadata: { nev: parsed.data.nev, tipus: parsed.data.tipus },
    },
    supabase,
  )
  revalidatePath('/munkanaplo')
  revalidatePath('/tagnyilvantartas')
  return { ok: true, id: inserted.data.id }
}

/**
 * Egység törlése. A címkék (munkanaplo.egyseg_id, szemely.egyseg_id) az
 * ON DELETE SET NULL miatt az anyaközpontra esnek vissza — ezért a hívó UI
 * megerősítést kér, és ha az egységen van adat, az inaktiválást ajánlja.
 */
export async function deleteGyulekezetiEgyseg(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) return { error: 'Érvénytelen egység-azonosító.' }

  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezeti hatókör.' }

  const torolt = await supabase
    .from('gyulekezeti_egysegek')
    .delete()
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .select('id')
  if (torolt.error) {
    if (HIANYZO_TABLA_MINTA.test(torolt.error.message)) return { error: hianyzoTablaUzenet() }
    return { error: `Az egység törlése sikertelen: ${torolt.error.message}` }
  }
  if (!torolt.data || torolt.data.length === 0) {
    return {
      error:
        'A törlés nem történt meg (az egység nem található, vagy az adatbázis jogosultság-szabálya elutasította).',
    }
  }
  await logAuditEvent(
    { action: 'egyseg.deleted', targetTable: 'gyulekezeti_egysegek', targetId: id },
    supabase,
  )
  revalidatePath('/munkanaplo')
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

/**
 * Hány címkézett adat-sor tartozik az egységhez (törlés/inaktiválás előtti
 * tájékoztatáshoz). Hibánál null-okat ad — a hívó „nem tudjuk"-ként jelzi,
 * SOHA nem 0-ként.
 */
export async function getEgysegHasznalat(
  id: string,
): Promise<{ tagok: number | null; naploSorok: number | null; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { tagok: null, naploSorok: null, error: 'Érvénytelen egység-azonosító.' }
  }
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user || !congregationId) {
    return { tagok: null, naploSorok: null, error: 'Nincs aktív gyülekezeti hatókör.' }
  }

  const [tagokRes, naploRes] = await Promise.all([
    supabase
      .from('szemely')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId)
      .eq('egyseg_id', id),
    supabase
      .from('munkanaplo')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId)
      .eq('egyseg_id', id),
  ])

  return {
    tagok: tagokRes.error ? null : (tagokRes.count ?? 0),
    naploSorok: naploRes.error ? null : (naploRes.count ?? 0),
    error: tagokRes.error?.message || naploRes.error?.message || undefined,
  }
}
