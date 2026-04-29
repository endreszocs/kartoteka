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
    .select('id, csaladnev, k_nev, sz_datum, ferfi, szcs_nev')
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

  const results: CandidatePerson[] = (data || []).map(p => ({
    id: p.id,
    csaladnev: p.csaladnev,
    k_nev: p.k_nev,
    sz_datum: p.sz_datum,
    ferfi: p.ferfi,
    szcs_nev: p.szcs_nev,
    score: 0,
    reasons: ['Manuális találat'],
  }))

  return { success: true, results }
}
