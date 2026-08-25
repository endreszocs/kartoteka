'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { programSchema, batchRowSchema, type ProgramInput } from '@/lib/validations/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'
import { isMissingDeletedColumn } from '@/lib/worklog/registry-sync'

export async function getProgramsForYear(year: number): Promise<Program[]> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return []
  const [{ data, error }, recurringRes] = await Promise.all([
    supabase
      .from('gyulekezeti_programok')
      .select('*')
      .eq('congregation_id', congregationId)
      .gte('datum', `${year}-01-01`)
      .lte('datum', `${year}-12-31`)
      .order('datum')
      .order('ido_kezdes'),
    // 2026-08-02 (PR-20): a KORÁBBI években indult ISMÉTLŐDŐ sorozatok is
    // kellenek — a heti bibliaóra eddig az új évre lapozva egyszerűen eltűnt
    // (a kibontás horizontja + a betöltés év-szűrése együtt vágta el).
    // Legfeljebb 5 évre visszamenőleg (a kibontás-plafon így is bőven fedi).
    supabase
      .from('gyulekezeti_programok')
      .select('*')
      .eq('congregation_id', congregationId)
      .not('ismetlodes_tipus', 'is', null)
      .gte('datum', `${year - 5}-01-01`)
      .lt('datum', `${year}-01-01`)
      .order('datum'),
  ])
  // 2026-06-07: a hibát nem nyeljük el csendben — feldobjuk, hogy a kliens
  // egyértelmű üzenetet adhasson és a „Betöltés…" ne ragadjon be.
  if (error) throw new Error(error.message)
  if (recurringRes.error) throw new Error(recurringRes.error.message)
  return [...((recurringRes.data || []) as Program[]), ...((data || []) as Program[])]
}

/**
 * A gyülekezet naptár-feed tokenje (Google Naptár összekötéshez) —
 * 2026-08-02 (PR-20). A token a congregations.calendar_feed_token oszlopban
 * él (2026-08-02-pr20-naptar-feed.sql hozza létre).
 */
export async function getCalendarFeedToken(): Promise<{ token: string | null; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { token: null, error: 'Nincs aktív gyülekezet kiválasztva.' }
  const { data, error } = await supabase
    .from('congregations')
    .select('calendar_feed_token')
    .eq('id', congregationId)
    .maybeSingle()
  if (error) {
    // Tipikusan: az oszlop még nem létezik → hangos, cselekvésre mutató hiba
    return { token: null, error: 'A naptár-hivatkozás nem érhető el. (Lefutott már a 2026-08-02-es naptár-feed adatbázis-migráció?)' }
  }
  const token = (data as { calendar_feed_token?: string | null } | null)?.calendar_feed_token ?? null
  if (!token) {
    return { token: null, error: 'A gyülekezetnek még nincs naptár-hivatkozása — futtasd le a 2026-08-02-es naptár-feed migrációt.' }
  }
  return { token }
}

/**
 * Egy program-bemenetből a `gyulekezeti_programok` táblába írható mező-objektum.
 * A `saveProgram` és a `saveBatchPrograms` is ezt használja (korábban a két
 * helyen duplikálva volt — 2026-06-07).
 */
function buildProgramRecord(d: ProgramInput): Record<string, unknown> {
  return {
    cim: d.cim,
    datum: d.datum,
    datum_vege: d.datum_vege || null,
    ido_kezdes: d.ido_kezdes || null,
    ido_befejezes: d.ido_befejezes || null,
    helyszin: d.helyszin || null,
    tipus: d.tipus,
    prioritas: d.prioritas,
    ismetlodes_tipus: d.ismetlodes_tipus || null,
    'ismétlődő': !!d.ismetlodes_tipus,
    egyedi_tipus_nev: d.tipus === 'egyeb' ? (d.egyedi_tipus_nev || null) : null,
    egyedi_emoji: d.tipus === 'egyeb' ? (d.egyedi_emoji || null) : null,
    megjegyzes: d.megjegyzes || null,
  }
}

export async function saveProgram(data: ProgramInput) {
  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  const parsed = programSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const d = parsed.data
  const record: Record<string, unknown> = {
    ...buildProgramRecord(d),
    updated_at: new Date().toISOString(),
  }

  if (d.id) {
    // UPDATE
    const { error } = await supabase.from('gyulekezeti_programok').update(record).eq('id', d.id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    // INSERT — profil adatok hozzáfűzése
    record.letrehozta_id = user.id
    record.letrehozta_nev = fullName || ''
    record.congregation_id = congregationId

    const { error } = await supabase.from('gyulekezeti_programok').insert(record)
    if (error) return { error: `Hiba: ${error.message}` }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteProgram(id: string) {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const { error } = await supabase.from('gyulekezeti_programok').delete().eq('id', id).eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function toggleProgramDone(id: string, done: boolean) {
  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const { error } = await supabase.from('gyulekezeti_programok').update({
    teljesitett: done,
    teljesites_datum: done ? new Date().toISOString() : null,
  }).eq('id', id).eq('congregation_id', congregationId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard')
  return { success: true }
}

// ── Imahét → munkanapló (2026-08-25) ─────────────────────────────────────────

// A munkanapló KANONIKUS Imahét-értéke. PONTOSAN ezt számolja a lelkészi
// jelentés III.5 „Imaheti alkalmak" aggregátora
// (lib/lelkeszi-jelentes/worklog-auto.ts: `jellege === 'Imahét'`) és a
// hivatalos munkanapló 17. oszlopa (lib/worklog/print-columns.ts EGYEB_TYPES),
// valamint szerepel a lib/constants/worklog.ts WORKLOG_TYPES.szolgalat
// listájában is. NE változtasd meg — a jelentés-rubrika elveszítené a sorokat.
const IMAHET_JELLEGE = 'Imahét'

const imahetNaplosorokSchema = z.object({
  napok: z
    .array(
      z.object({
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum a napi beosztásban'),
        szolgalo: z.string().max(120, 'A szolgáló lelkész neve legfeljebb 120 karakter lehet'),
      }),
    )
    .min(1, 'Legalább egy nap szükséges a napi beosztáshoz')
    .max(9, 'Legfeljebb 9 nap adható meg a napi beosztásban'),
})

/** Az insert-hiba magyarra fordítása (hiányzó oszlop / egyéb DB-hiba). */
function imahetInsertHiba(error: { message?: string } | null | undefined): string {
  const msg = error?.message || ''
  const lower = msg.toLowerCase()
  const hianyzoOszlop =
    (lower.includes('column') && lower.includes('does not exist')) || lower.includes('schema cache')
  if (hianyzoOszlop && /egyseg_id/.test(lower)) {
    return 'A munkanapló-sorok nem jöttek létre: az adatbázisból még hiányzik a munkanaplo.egyseg_id oszlop. Futtassa le a 2026-08-25-gyulekezeti-egysegek.sql migrációt, majd próbálja újra.'
  }
  if (hianyzoOszlop) {
    return `A munkanapló-sorok nem jöttek létre — hiányzó adatbázis-oszlop: ${msg}`
  }
  return `A munkanapló-sorok létrehozása nem sikerült: ${msg}`
}

/**
 * Az Imahét napi vendéglelkész-beosztásából munkanapló-sorok létrehozása —
 * a program-dialógus hívja a saveProgram SIKERE után. Üres szolgálójú napot
 * kihagyunk; ugyanarra a napra már létező (nem törölt) 'Imahét'-sor esetén a
 * nap kimarad (duplikátum-őr). Válasz: { ok, letrehozva, kihagyva } vagy
 * { error } magyarul.
 */
export async function createImahetNaplosorok(input: {
  napok: Array<{ datum: string; szolgalo: string }>
}): Promise<{ ok: true; letrehozva: number; kihagyva: number } | { error: string }> {
  const parsed = imahetNaplosorokSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user, congregationId } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  // Üres szolgálójú napok kihagyása — csak a ténylegesen beosztott napokból
  // lesz munkanapló-sor (a lelkész a többit maga rögzíti, ha akarja).
  const napok = parsed.data.napok
    .map((n) => ({ datum: n.datum, szolgalo: n.szolgalo.trim() }))
    .filter((n) => n.szolgalo.length > 0)
  if (napok.length === 0) return { ok: true, letrehozva: 0, kihagyva: 0 }

  // DUPLIKÁTUM-ŐR: ugyanarra a napra már létező (nem törölt) 'Imahét'-sor →
  // a nap kimarad. A `deleted`-szűrő fallback-kel fut (a munkanapló-actions
  // mintája): ha az oszlop még nem létezik, szűrő nélkül kérdezünk.
  const datumok = napok.map((n) => n.datum)
  const minDatum = datumok.reduce((a, b) => (a < b ? a : b))
  const maxDatum = datumok.reduce((a, b) => (a > b ? a : b))
  const runExisting = (withDeletedFilter: boolean) => {
    let q = supabase
      .from('munkanaplo')
      .select('idopont')
      .eq('congregation_id', congregationId)
      .eq('jellege', IMAHET_JELLEGE)
      .gte('idopont', minDatum)
      .lte('idopont', maxDatum)
    if (withDeletedFilter) q = q.eq('deleted', false)
    return q
  }
  let existing = await runExisting(true)
  if (existing.error && isMissingDeletedColumn(existing.error)) existing = await runExisting(false)
  if (existing.error) {
    return { error: `A meglévő munkanapló-sorok ellenőrzése nem sikerült: ${existing.error.message}` }
  }
  const foglaltNapok = new Set(
    ((existing.data || []) as Array<{ idopont: string | null }>).map((r) =>
      String(r.idopont || '').slice(0, 10),
    ),
  )

  const ujak = napok.filter((n) => !foglaltNapok.has(n.datum))
  const kihagyva = napok.length - ujak.length
  if (ujak.length === 0) return { ok: true, letrehozva: 0, kihagyva }

  const most = new Date().toISOString()
  const records = ujak.map((n) => ({
    idopont: n.datum,
    jellege: IMAHET_JELLEGE,
    kategoria: 'szolgalat',
    cim: 'Egyetemes imahét — vendégszolgálat',
    szolgalt: n.szolgalo,
    // A jelenlétet a lelkész tölti ki utólag — a jelenlet_osszesen NOT NULL,
    // ezért 0 (a bontás-mezők üresen maradnak).
    jelenlet_ferfi: null,
    jelenlet_no: null,
    jelenlet_gyermek: null,
    jelenlet_osszesen: 0,
    persely: null,
    du: false,
    megjegyzes: 'Imahét — a határidőnaplóból létrehozva',
    deleted: false,
    created: most,
    congregation_id: congregationId,
  }))

  let ins = await supabase.from('munkanaplo').insert(records).select('id')
  if (ins.error && isMissingDeletedColumn(ins.error)) {
    // A `deleted` oszlop még nem létezik (migráció előtt) → oszlop nélkül újra.
    const deletedNelkul = records.map(({ deleted: _d, ...tobbi }) => tobbi)
    ins = await supabase.from('munkanaplo').insert(deletedNelkul).select('id')
  }
  if (ins.error) return { error: imahetInsertHiba(ins.error) }
  const letrehozva = ins.data?.length ?? 0
  if (letrehozva === 0) {
    return { error: 'A munkanapló-sorok beszúrása nem erősíthető meg — egyetlen sor sem jött létre.' }
  }

  await logAuditEvent(
    {
      action: 'program.imahet_naplosorok',
      targetTable: 'munkanaplo',
      metadata: { letrehozva, kihagyva, datumok: ujak.map((n) => n.datum) },
    },
    supabase,
  )
  revalidatePath('/munkanaplo')
  return { ok: true, letrehozva, kihagyva }
}

export async function saveBatchPrograms(records: ProgramInput[]) {
  // Üres sorok kiszűrése
  const nonEmpty = records.filter(r => r.cim?.trim() || r.datum)

  if (nonEmpty.length === 0) {
    return { error: 'Nincs kitöltött sor a mentéshez!' }
  }

  // Validáció minden sorra
  const errors: string[] = []
  nonEmpty.forEach((r, i) => {
    const parsed = batchRowSchema.safeParse(r)
    if (!parsed.success) {
      errors.push(`${i + 1}. sor: ${parsed.error.issues[0].message}`)
    }
  })

  if (errors.length > 0) {
    return { error: errors.join('\n') }
  }

  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  const dbRecords = nonEmpty.map(d => ({
    ...buildProgramRecord(d),
    letrehozta_id: user.id,
    letrehozta_nev: fullName || '',
    congregation_id: congregationId,
  }))

  const { error } = await supabase.from('gyulekezeti_programok').insert(dbRecords)
  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard')
  return { success: true, count: dbRecords.length }
}
