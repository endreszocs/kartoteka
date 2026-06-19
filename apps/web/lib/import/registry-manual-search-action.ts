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

  const parts = trimmed.split(/\s+/).filter(Boolean)
  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, sz_datum, ferfi, szcs_nev, foglalkozas, c_utcaid, c_szam')
    .eq('congregation_id', targetCongregationId)
    .eq('isvisible', true)
    .eq('meghalt', false)

  if (options.ferfi !== null && options.ferfi !== undefined) {
    q = q.eq('ferfi', options.ferfi)
  }

  if (parts.length === 1) {
    const term = parts[0]
    q = q.or(
      `csaladnev.ilike.%${term}%,k_nev.ilike.%${term}%,szcs_nev.ilike.%${term}%`,
    )
  } else {
    const csaladnev = parts[0]
    const knev = parts.slice(1).join(' ')
    q = q.or(
      `and(csaladnev.ilike.%${csaladnev}%,k_nev.ilike.%${knev}%),` +
      `and(szcs_nev.ilike.%${csaladnev}%,k_nev.ilike.%${knev}%)`,
    )
  }

  const { data, error } = await q.limit(15)
  if (error) return { error: `Keresési hiba: ${error.message}` }

  // Utcanevek feloldása (c_utcaid → adrstreet) egy batch-query-vel, a cím megjelenítéséhez.
  const utcaIds = Array.from(
    new Set(
      (data || [])
        .map((p) => (p as { c_utcaid?: number | null }).c_utcaid)
        .filter((id): id is number => typeof id === 'number'),
    ),
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

  const results: CandidatePerson[] = (data || []).map((p) => {
    const rec = p as typeof p & { foglalkozas?: string | null; c_utcaid?: number | null; c_szam?: string | null }
    const utca = typeof rec.c_utcaid === 'number' ? utcaNevById.get(rec.c_utcaid) || '' : ''
    const cim = [utca, rec.c_szam || ''].filter(Boolean).join(' ').trim() || null
    return {
      id: p.id,
      csaladnev: p.csaladnev,
      k_nev: p.k_nev,
      sz_datum: p.sz_datum,
      ferfi: p.ferfi,
      szcs_nev: p.szcs_nev,
      cim,
      foglalkozas: rec.foglalkozas ?? null,
      score: 0,
      reasons: ['Manuális találat'],
    }
  })

  return { success: true, results }
}
