'use server'

import { revalidatePath } from 'next/cache'
import { programSchema, batchRowSchema, type ProgramInput } from '@/lib/validations/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

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
