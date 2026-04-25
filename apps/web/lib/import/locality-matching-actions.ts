'use server'

/**
 * Helység-egyeztetés (locality matching) server actions a tagnyilvántartás-import wizardhoz.
 *
 * 3 export:
 *   - findLocalityMatch: egy helység-név → találatok lista
 *   - findLocalityMatchBatch: több helység-név → összes találat (egy körben)
 *   - addLocalityForReview: új helység beszúrás "needs_review" jelöléssel
 *
 * Az `import_family_head_batch` RPC fogad egy `resolved_locality_map` paramétert,
 * amit a wizard "Helység-egyeztetés" step-jében épít fel.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

// ─── Típusok ─────────────────────────────────────────────────────────────

export type LocalityMatchType = 'exact_hu' | 'exact_ro' | 'exact_name' | 'alias' | 'fuzzy'

export interface LocalityCandidate {
  locality_id: number
  name: string
  name_hu: string | null
  name_ro: string | null
  county_id: number
  county_name: string
  country_id: number
  country_name: string
  default_postalcode: string | null
  siruta_code: string | null
  match_type: LocalityMatchType
  similarity: number
}

export interface LocalitySearchResult {
  input: string
  candidates: LocalityCandidate[]
  /** A keresés eredménye:
   *   'exact_single'   — pontosan 1 exact match → automatikus
   *   'exact_multiple' — 2+ exact match → manuális választás
   *   'fuzzy_only'     — csak fuzzy találatok → "Talán?" review
   *   'no_match'       — semmi → új helység vagy külföld
   */
  resolution: 'exact_single' | 'exact_multiple' | 'fuzzy_only' | 'no_match'
}

// ─── 1. Egyetlen helység keresése ─────────────────────────────────────────

export async function findLocalityMatch(
  input: string,
  countryCode: string = 'RO',
  minSimilarity: number = 0.6,
): Promise<{ data?: LocalitySearchResult; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (!input || input.trim() === '') {
    return { data: { input: '', candidates: [], resolution: 'no_match' } }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_locality_match', {
    p_input: input,
    p_country_code: countryCode,
    p_min_similarity: minSimilarity,
  })

  if (error) {
    return { error: `A helység-keresés sikertelen: ${error.message}` }
  }

  const candidates = (data as LocalityCandidate[]) || []
  const exactMatches = candidates.filter((c) =>
    ['exact_hu', 'exact_ro', 'exact_name', 'alias'].includes(c.match_type),
  )

  let resolution: LocalitySearchResult['resolution']
  if (exactMatches.length === 1) {
    resolution = 'exact_single'
  } else if (exactMatches.length > 1) {
    resolution = 'exact_multiple'
  } else if (candidates.length > 0) {
    resolution = 'fuzzy_only'
  } else {
    resolution = 'no_match'
  }

  return { data: { input, candidates, resolution } }
}

// ─── 2. Batch keresés — wizardhoz több helység egy körben ─────────────────

export async function findLocalityMatchBatch(
  inputs: string[],
  countryCode: string = 'RO',
  minSimilarity: number = 0.6,
): Promise<{ data?: LocalitySearchResult[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Egyedi értékek (pl. 615 sorból ~30 unikális helység)
  const uniqueInputs = Array.from(
    new Set(inputs.map((i) => i?.trim()).filter((i): i is string => !!i)),
  )

  // Sequenciális futtatás (max ~50 unikális helység, gyors)
  const results: LocalitySearchResult[] = []
  for (const input of uniqueInputs) {
    const result = await findLocalityMatch(input, countryCode, minSimilarity)
    if (result.data) {
      results.push(result.data)
    }
  }

  return { data: results }
}

// ─── 3. Új helység (needs_review jelöléssel) ──────────────────────────────

export async function addLocalityForReview(
  name: string,
  options?: {
    countyId?: number
    countryCode?: string
    reviewSource?: string
  },
): Promise<{ localityId?: number; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (!name || name.trim() === '') {
    return { error: 'Hiányzó helység-név.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_locality_for_review', {
    p_name: name,
    p_county_id: options?.countyId ?? null,
    p_country_code: options?.countryCode ?? 'RO',
    p_review_source: options?.reviewSource ?? 'tagnyilvantartas-import',
  })

  if (error) {
    return { error: `Új helység beszúrás sikertelen: ${error.message}` }
  }

  return { localityId: data as number }
}

// ─── 4. Országlista (külföldi cím választáshoz) ────────────────────────────

export async function listCountries(): Promise<{
  data?: Array<{ id: number; name: string; sname: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('adrcountry')
    .select('id, name, sname')
    .order('name')

  if (error) {
    return { error: `Országlista lekérése sikertelen: ${error.message}` }
  }

  return { data: data || [] }
}

// ─── 5. Megyelista (új helység beszúrásnál) ───────────────────────────────

export async function listCounties(
  countryCode: string = 'RO',
): Promise<{
  data?: Array<{ id: number; name: string; sname: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()

  // Country lookup
  const { data: country } = await supabase
    .from('adrcountry')
    .select('id')
    .or(`sname.eq.${countryCode.toUpperCase()},name.eq.${countryCode}`)
    .limit(1)
    .maybeSingle()

  if (!country) {
    return { error: `Ország nem található: ${countryCode}` }
  }

  const { data, error } = await supabase
    .from('adrcounty')
    .select('id, name, sname')
    .eq('countryid', country.id)
    .order('name')

  if (error) {
    return { error: `Megyelista lekérése sikertelen: ${error.message}` }
  }

  return { data: data || [] }
}
