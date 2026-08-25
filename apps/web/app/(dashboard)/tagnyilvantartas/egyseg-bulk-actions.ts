'use server'

/**
 * Tömeges egység-besorolás település szerint (2026-08-25, gyülekezeti egységek).
 *
 * getEgysegBesorolasInput(): a gyülekezet aktív tagjainak település szerinti
 *   csoportosítása a tömeges besoroló dialógushoz. A település a
 *   szemely.c_helysegid; ennek hiányában a c_utcaid → adrstreet.localityid →
 *   adrlocality lánc (a street-locality-fallback bevált mintája). Lapozott
 *   olvasás (.order('id') + range), minden hiba HANGOS { error } — a néma-üres
 *   hibaosztály ellen.
 *
 * applyEgysegBesorolas(): a kiválasztott településeken lakó aktív tagok
 *   szemely.egyseg_id-jának beállítása 100-as chunkokban, .select('id')
 *   darabszám-ellenőrzéssel + EGY összegző audit-eseménnyel. felulir=false
 *   esetén csak a még besorolatlan (egyseg_id IS NULL) tagokat írja át.
 *
 * MINTA: district-auto-actions.ts (getAutoDistrictInput / applyDistrictPlan).
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'

const CHUNK = 100
const LAP_MERET = 1000
const MAX_SOR = 100_000

/** A lelkészi jelentés I.10 kanonikus aktív-szűrőjével egyező kizárt státuszok. */
const KIZART_STATUSZOK = new Set(['elhunyt', 'elköltözött', 'elkoltozott', 'kitért', 'törölt'])

// A 2026-08-25-gyulekezeti-egysegek.sql migráció előtti séma felismerése —
// ilyenkor barátságos, magyar hibaüzenetet adunk, nem nyers PostgREST-hibát.
const HIANYZO_SEMA_MINTA = /relation .* does not exist|column|does not exist|schema cache|could not find/i
const HIANYZO_SEMA_UZENET =
  'A gyülekezeti egységek adatbázis-migrációja még nem futott le ' +
  '(2026-08-25-gyulekezeti-egysegek.sql) — futtatás után a tömeges besorolás elérhető.'

export interface EgysegBesorolasTelepules {
  localityId: number
  nev: string
  /** Az itt lakó aktív tagok száma. */
  tagszam: number
  /** Az itt lakó, MÉG besorolatlan (egyseg_id NULL) aktív tagok száma. */
  besorolatlan: number
  /** Az első legfeljebb 3 itt lakó tag neve (minta a dialógushoz). */
  mintaTagok: string[]
}

export interface EgysegBesorolasInput {
  telepulesek?: EgysegBesorolasTelepules[]
  egysegek?: Array<{ id: string; nev: string; tipus: string }>
  /** Az egység nélküli (anyaközponti címkéjű) aktív tagok száma összesen. */
  besorolatlanSzam?: number
  /** Aktív tagok, akiknek egyik láncból sem oldható fel település. */
  telepulesNelkuliSzam?: number
  error?: string
}

type TagSor = {
  id: number
  csaladnev: string | null
  k_nev: string | null
  namepattern: string | null
  member_status: string | null
  egyseg_id: string | null
  c_helysegid: number | null
  helyseg: { id: number; name: string | null } | Array<{ id: number; name: string | null }> | null
  utca:
    | { adrlocality: { id: number; name: string | null } | Array<{ id: number; name: string | null }> | null }
    | Array<{ adrlocality: { id: number; name: string | null } | Array<{ id: number; name: string | null }> | null }>
    | null
}

function egy<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function* darabok<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size)
}

/** A tag effektív települése: c_helysegid → (c_utcaid → adrstreet.localityid). */
function effektivTelepules(sor: TagSor): { id: number; name: string | null } | null {
  const kozvetlen = egy(sor.helyseg)
  if (kozvetlen) return kozvetlen
  const utca = egy(sor.utca)
  return utca ? egy(utca.adrlocality) : null
}

function tagNev(sor: TagSor): string {
  return [sor.namepattern, sor.csaladnev, sor.k_nev].filter(Boolean).join(' ').trim() || `Személy #${sor.id}`
}

/**
 * A gyülekezet aktív tagjai lapozva, a település-feloldáshoz szükséges
 * joinokkal. Hiba esetén DOB — a hívó { error }-ként adja tovább.
 */
async function loadAktivTagok(
  supabase: Awaited<ReturnType<typeof getEffectiveCongregationContext>>['supabase'],
  congregationId: string,
): Promise<TagSor[]> {
  const sorok: TagSor[] = []
  let vege = false
  for (let from = 0; from < MAX_SOR; ) {
    const { data, error } = await supabase
      .from('szemely')
      .select(
        'id, csaladnev, k_nev, namepattern, member_status, egyseg_id, c_helysegid, '
        + 'helyseg:adrlocality!c_helysegid(id, name), '
        + 'utca:adrstreet!c_utcaid(adrlocality!localityid(id, name))',
      )
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false)
      .order('id', { ascending: true })
      .range(from, from + LAP_MERET - 1)
    if (error) {
      if (HIANYZO_SEMA_MINTA.test(error.message)) throw new Error(HIANYZO_SEMA_UZENET)
      throw new Error(`A tagok lekérdezése sikertelen: ${error.message}`)
    }
    const lap = (data ?? []) as unknown as TagSor[]
    sorok.push(...lap)
    // Csak az ÜRES lap a biztos stop (leszállított szerver-plafon ellen),
    // a lépésköz a ténylegesen kapott sorszám.
    if (lap.length === 0) {
      vege = true
      break
    }
    from += lap.length
  }
  // Fail-closed: a biztonsági plafon elérése HANGOS hiba, nem néma csonkolás.
  if (!vege) {
    throw new Error(`A tagok lekérdezése túllépte a biztonsági sorlimitet (${MAX_SOR}).`)
  }
  // A státusz-kizárás JS-ben (az ékezetes értékek URL-szűrője törékeny volna).
  return sorok.filter((sor) => !KIZART_STATUSZOK.has((sor.member_status ?? '').trim()))
}

export async function getEgysegBesorolasInput(): Promise<EgysegBesorolasInput> {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezeti hatókör.' }

  // 1) Aktív egységek — RLS-őrzött tábla; hiba (pl. hiányzó tábla) HANGOS.
  const egysegekRes = await supabase
    .from('gyulekezeti_egysegek')
    .select('id, nev, tipus')
    .eq('congregation_id', congregationId)
    .eq('aktiv', true)
    .order('sorrend', { ascending: true })
    .order('nev', { ascending: true })
  if (egysegekRes.error) {
    if (HIANYZO_SEMA_MINTA.test(egysegekRes.error.message)) return { error: HIANYZO_SEMA_UZENET }
    return { error: `Az egységek betöltése sikertelen: ${egysegekRes.error.message}` }
  }

  // 2) Aktív tagok, település szerint csoportosítva.
  let tagok: TagSor[]
  try {
    tagok = await loadAktivTagok(supabase, congregationId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'A tagok lekérdezése sikertelen.' }
  }

  const csoportok = new Map<number, EgysegBesorolasTelepules>()
  let besorolatlanSzam = 0
  let telepulesNelkuliSzam = 0
  for (const sor of tagok) {
    if (sor.egyseg_id == null) besorolatlanSzam += 1
    const telepules = effektivTelepules(sor)
    if (!telepules) {
      telepulesNelkuliSzam += 1
      continue
    }
    const meglevo = csoportok.get(telepules.id)
    if (meglevo) {
      meglevo.tagszam += 1
      if (sor.egyseg_id == null) meglevo.besorolatlan += 1
      if (meglevo.mintaTagok.length < 3) meglevo.mintaTagok.push(tagNev(sor))
    } else {
      csoportok.set(telepules.id, {
        localityId: telepules.id,
        nev: telepules.name?.trim() || `Település #${telepules.id}`,
        tagszam: 1,
        besorolatlan: sor.egyseg_id == null ? 1 : 0,
        mintaTagok: [tagNev(sor)],
      })
    }
  }

  const huCollator = new Intl.Collator('hu', { sensitivity: 'base' })
  const telepulesek = [...csoportok.values()].sort(
    (a, b) => b.tagszam - a.tagszam || huCollator.compare(a.nev, b.nev),
  )

  return {
    telepulesek,
    egysegek: (egysegekRes.data ?? []) as Array<{ id: string; nev: string; tipus: string }>,
    besorolatlanSzam,
    telepulesNelkuliSzam,
  }
}

const applySchema = z.object({
  /** 'kozpont' = anyaközpont (egyseg_id → NULL), különben az egység uuid-ja. */
  egysegId: z.union([z.literal('kozpont'), z.string().uuid()]),
  localityIds: z.array(z.number().int().positive()).min(1).max(500),
  /** false = csak a még besorolatlan (egyseg_id NULL) tagokat írjuk át. */
  felulir: z.boolean(),
})

export async function applyEgysegBesorolas(
  input: z.input<typeof applySchema>,
): Promise<{ ok?: true; modositott?: number; error?: string }> {
  const parsed = applySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Hiányos vagy érvénytelen besorolási kérés.' }
  }

  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezeti hatókör.' }

  const { egysegId, localityIds } = parsed.data
  // Védőháló: kozpont célnál a „csak besorolatlan" (felulir=false) halmaz
  // definíció szerint üres volna (a besorolatlan tag már a központé), ezért
  // a felulir=false-t felulir=true-ként értelmezzük.
  const felulir = egysegId === 'kozpont' ? true : parsed.data.felulir
  const celErtek = egysegId === 'kozpont' ? null : egysegId

  // BIZTONSÁG: a cél-egység a SAJÁT gyülekezeté és aktív legyen — a kliensről
  // érkező uuid önmagában nem bizonyíték.
  if (celErtek) {
    const egysegRes = await supabase
      .from('gyulekezeti_egysegek')
      .select('id')
      .eq('id', celErtek)
      .eq('congregation_id', congregationId)
      .eq('aktiv', true)
      .maybeSingle()
    if (egysegRes.error) {
      if (HIANYZO_SEMA_MINTA.test(egysegRes.error.message)) return { error: HIANYZO_SEMA_UZENET }
      return { error: `Az egység ellenőrzése sikertelen: ${egysegRes.error.message}` }
    }
    if (!egysegRes.data) {
      return { error: 'A kiválasztott egység nem található ebben a gyülekezetben (vagy inaktív).' }
    }
  }

  // A célzott tagok szerver-oldali újra-származtatása: a település-feloldás
  // (c_helysegid → utca-lánc) nem fejezhető ki egyszerű DB-szűrőként, ezért a
  // teljes aktív taglistából számoljuk az érintett ID-kat.
  let tagok: TagSor[]
  try {
    tagok = await loadAktivTagok(supabase, congregationId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'A tagok lekérdezése sikertelen.' }
  }

  const kertTelepulesek = new Set(localityIds)
  const celIds = tagok
    .filter((sor) => {
      const telepules = effektivTelepules(sor)
      if (!telepules || !kertTelepulesek.has(telepules.id)) return false
      if (!felulir && sor.egyseg_id != null) return false
      // Ami már a célértéken áll, azt nem írjuk feleslegesen.
      return sor.egyseg_id !== celErtek
    })
    .map((sor) => sor.id)

  if (celIds.length === 0) {
    return { ok: true, modositott: 0 }
  }

  let modositott = 0
  for (const resz of darabok(celIds, CHUNK)) {
    const updated = await supabase
      .from('szemely')
      .update({ egyseg_id: celErtek })
      .eq('congregation_id', congregationId)
      .in('id', resz)
      .select('id')
    if (updated.error) {
      if (HIANYZO_SEMA_MINTA.test(updated.error.message)) return { error: HIANYZO_SEMA_UZENET }
      return { error: `A besorolás mentése sikertelen: ${updated.error.message}` }
    }
    modositott += updated.data?.length ?? 0
  }

  await logAuditEvent(
    {
      action: 'member.egyseg_bulk_assigned',
      targetTable: 'szemely',
      metadata: {
        egysegId,
        telepulesSzam: localityIds.length,
        localityIds: localityIds.slice(0, 100),
        kijelolt: celIds.length,
        modositott,
        felulir,
      },
    },
    supabase,
  )

  revalidatePath('/tagnyilvantartas')
  return { ok: true, modositott }
}
