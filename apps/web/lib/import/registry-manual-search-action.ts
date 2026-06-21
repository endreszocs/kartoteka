'use server'

/**
 * Anyakönyvi import — manuális tag-kereső a person-link lépésén.
 *
 * Endre kérése (2026-04-29): "Lehessen keresni a menyasszonynál és a
 * vőlegénynél ha nincs az ajánlott személyek között."
 *
 * A TOP-5 jelöltlista mellett a lelkész manuálisan rákereshet név-részlet
 * alapján a tagnyilvántartásban (ugyanazon a gyülekezeten belül, csakis
 * látható tagok). A találatok a TOP-5 picker formátumában jönnek vissza,
 * hogy a UI ugyanúgy meg tudja jeleníteni őket.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { personSearchScore, tokenize } from './person-search-match'
import type { CandidatePerson } from './registry-candidates-action'

export interface ManualSearchResult {
  success?: boolean
  error?: string
  results?: CandidatePerson[]
}

export async function searchPersonsForManualPickAction(
  query: string,
  options: {
    /** Ha megadott, csak ezt a nemet adja vissza (true=férfi, false=nő, null=nincs szűrés). */
    ferfi?: boolean | null
    targetCongregationId?: string | null
  } = {},
): Promise<ManualSearchResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const trimmed = (query || '').trim()
  if (trimmed.length < 2) return { success: true, results: [] }

  const targetCongregationId = options.targetCongregationId || access.effectiveCongregationId
  if (!targetCongregationId) return { error: 'Nincs cél gyülekezet.' }

  const supabase = await createClient()

  const tokens = tokenize(trimmed)
  if (tokens.length === 0) return { success: true, results: [] }

  // A gyülekezet látható, élő tagjai (a buildAllPersonsLookupMap bevált mintája:
  // betöltjük, majd JS-ben szűrünk — így a keresés ékezet- és pozíció-független).
  let pq = supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, szcs_nev, ferjk_nev, sz_datum, ferfi, foglalkozas, c_utcaid, c_szam')
    .eq('congregation_id', targetCongregationId)
    .eq('isvisible', true)
    .eq('meghalt', false)
  if (options.ferfi !== null && options.ferfi !== undefined) {
    pq = pq.eq('ferfi', options.ferfi)
  }
  const { data, error } = await pq.limit(5000)
  if (error) return { error: `Keresési hiba: ${error.message}` }

  type PersonRow = {
    id: number
    csaladnev: string | null
    k_nev: string | null
    szcs_nev: string | null
    ferjk_nev: string | null
    sz_datum: string | null
    ferfi: boolean | null
    foglalkozas: string | null
    c_utcaid: number | null
    c_szam: string | null
  }
  const persons = (data || []) as PersonRow[]

  // Utcanevek (a cím szerinti kereséshez ÉS a megjelenítéshez) — egy batch-query.
  const utcaIds = Array.from(
    new Set(persons.map((p) => p.c_utcaid).filter((id): id is number => typeof id === 'number')),
  )
  const utcaNevById = new Map<number, string>()
  if (utcaIds.length > 0) {
    const { data: utcaRows } = await supabase
      .from('adrstreet')
      .select('id, name, name_hu')
      .in('id', utcaIds)
    for (const u of utcaRows || []) {
      const row = u as { id: number; name?: string | null; name_hu?: string | null }
      utcaNevById.set(row.id, (row.name_hu || row.name || '') as string)
    }
  }

  // JS-szűrés: MINDEN beírt token szerepeljen valahol — a teljes néven (vezeték-,
  // kereszt-, LÁNYKORI és FÉRJEZETT név), a foglalkozáson VAGY a LAKCÍMEN. Így a
  // „Beder Csilla Timea" megtalálja a férjhez ment „Kovács Csilla Tímea (szül. Beder)"-t,
  // és egyetlen keresztnév vagy a cím is elég a kereséshez.
  type Scored = { p: PersonRow; cim: string | null; score: number }
  const scored: Scored[] = []
  for (const p of persons) {
    const utca = typeof p.c_utcaid === 'number' ? utcaNevById.get(p.c_utcaid) || '' : ''
    const cim = [utca, p.c_szam || ''].filter(Boolean).join(' ').trim() || null
    const score = personSearchScore(
      {
        nameParts: [p.csaladnev, p.k_nev, p.szcs_nev, p.ferjk_nev],
        addressParts: [utca, p.c_szam, p.foglalkozas],
      },
      tokens,
    )
    if (score === null) continue // valamelyik token sehol sem szerepel → nem találat
    scored.push({ p, cim, score })
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.p.csaladnev || '').localeCompare(b.p.csaladnev || '', 'hu') ||
      (a.p.k_nev || '').localeCompare(b.p.k_nev || '', 'hu'),
  )

  const results: CandidatePerson[] = scored.slice(0, 25).map(({ p, cim }) => ({
    id: p.id,
    csaladnev: p.csaladnev,
    k_nev: p.k_nev,
    sz_datum: p.sz_datum,
    ferfi: p.ferfi,
    szcs_nev: p.szcs_nev,
    cim,
    foglalkozas: p.foglalkozas ?? null,
    score: 0,
    reasons: ['Manuális találat'],
  }))

  return { success: true, results }
}
