'use server'

/**
 * Romániai cím-hierarchia autocomplete server actions.
 *
 * Használat a 3 wizard StepAddress komponenseiben:
 *   - listCounties()          → megye dropdown (42 romániai megye + "Külföldi")
 *   - searchLocalities(...)   → helység autocomplete (a kiválasztott megyén belül)
 *   - searchStreets(...)      → utca autocomplete (a kiválasztott helységben)
 *   - getLocalityDetails(...) → postakód + alapadatok lekérés
 *
 * Adatforrás: 2026-04-21-adr-seed-*.sql (Poșta Română + GeoNames).
 * Nyelvek: magyar + román, a `lang` paraméter szabja meg melyik a preferált.
 *
 * Jogosultság: minden authenticated user lekérdezheti — a reference adat
 * publikus jellegű (megyék, helységek, postakódok).
 */

import { createClient } from '@/lib/supabase/server'

// ────────────────────────────────────────────────────────────────────
// Típusok
// ────────────────────────────────────────────────────────────────────

export interface CountyRow {
  id: number
  name_hu: string | null
  name_ro: string
  auto_code: string | null
  siruta_code: string | null
}

export interface LocalityRow {
  id: number
  name_hu: string | null
  name_ro: string
  default_postalcode: string | null
  siruta_code: string | null
  countyid: number
  /** Ha alias-on keresztül találtuk, itt van az alias-név ("Telek" → match) */
  matched_via_alias?: string
}

export interface StreetRow {
  id: number
  name_hu: string | null
  name_ro: string
  street_type_ro: string | null
  postalcode: string | null
  localityid: number
}

// ────────────────────────────────────────────────────────────────────
// listCounties — összes romániai megye
// ────────────────────────────────────────────────────────────────────

export async function listCounties(): Promise<CountyRow[]> {
  const supabase = await createClient()

  // A Romániai country_id = 1 (a seed fix-en rakta).
  // A `not('name_ro', 'is', null)` kiszűri a régi seed-ből maradt "zombi"
  // sort (ami nem rendelkezik name_ro-val, mert az oszlop a 2026-04-21-i
  // schema-bővítéssel került be). Így a 42 valódi romániai megye marad.
  const { data, error } = await supabase
    .from('adrcounty')
    .select('id, name_hu, name_ro, auto_code, siruta_code')
    .eq('countryid', 1)
    .not('name_ro', 'is', null)
    .order('name_ro')

  if (error) {
    console.error('[listCounties]', error)
    return []
  }
  return (data || []) as CountyRow[]
}

// ────────────────────────────────────────────────────────────────────
// searchLocalities — helység autocomplete egy megyén belül
// ────────────────────────────────────────────────────────────────────

export async function searchLocalities(
  countyId: number,
  query: string,
  opts: { limit?: number } = {}
): Promise<LocalityRow[]> {
  const limit = opts.limit ?? 20
  const q = query.trim()
  if (!countyId || q.length < 1) return []

  const supabase = await createClient()

  // 1. lépés: közvetlen név-match (name_hu vagy name_ro, prefix)
  const { data: direct, error } = await supabase
    .from('adrlocality')
    .select('id, name_hu, name_ro, default_postalcode, siruta_code, countyid')
    .eq('countyid', countyId)
    .or(`name_hu.ilike.${q}%,name_ro.ilike.${q}%`)
    .order('name_ro')
    .limit(limit)

  if (error) {
    console.error('[searchLocalities:direct]', error)
    return []
  }

  const results: LocalityRow[] = (direct || []) as LocalityRow[]

  // 2. lépés: ha kevés a találat, próbáljuk alias-okon keresztül is (pl. Telek → Orbaitelek)
  if (results.length < Math.ceil(limit / 2)) {
    const { data: aliasMatches, error: aliasErr } = await supabase
      .from('adrlocality_alias')
      .select(`
        alias_name,
        adrlocality!inner (
          id, name_hu, name_ro, default_postalcode, siruta_code, countyid
        )
      `)
      .eq('adrlocality.countyid', countyId)
      .ilike('alias_name', `${q}%`)
      .limit(limit)

    if (!aliasErr && aliasMatches) {
      const existingIds = new Set(results.map((r) => r.id))
      for (const m of aliasMatches) {
        const loc = (m as unknown as { adrlocality: LocalityRow; alias_name: string }).adrlocality
        if (loc && !existingIds.has(loc.id)) {
          results.push({
            ...loc,
            matched_via_alias: (m as unknown as { alias_name: string }).alias_name,
          })
          existingIds.add(loc.id)
          if (results.length >= limit) break
        }
      }
    }
  }

  return results.slice(0, limit)
}

// ────────────────────────────────────────────────────────────────────
// searchStreets — utca autocomplete egy helségen belül
// ────────────────────────────────────────────────────────────────────

export async function searchStreets(
  localityId: number,
  query: string,
  opts: { limit?: number } = {}
): Promise<StreetRow[]> {
  const limit = opts.limit ?? 25
  const q = query.trim()
  if (!localityId || q.length < 1) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('adrstreet')
    .select('id, name_hu, name_ro, street_type_ro, postalcode, localityid')
    .eq('localityid', localityId)
    .or(`name_hu.ilike.${q}%,name_ro.ilike.${q}%`)
    .order('name_ro')
    .limit(limit)

  if (error) {
    console.error('[searchStreets]', error)
    return []
  }
  return (data || []) as StreetRow[]
}

// ────────────────────────────────────────────────────────────────────
// getLocalityDetails — konkrét helség minden adata (postakód, megye, stb.)
// ────────────────────────────────────────────────────────────────────

export async function getLocalityDetails(
  localityId: number
): Promise<
  | (LocalityRow & { county: CountyRow })
  | null
> {
  if (!localityId) return null
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('adrlocality')
    .select(`
      id, name_hu, name_ro, default_postalcode, siruta_code, countyid,
      adrcounty:countyid (
        id, name_hu, name_ro, auto_code, siruta_code
      )
    `)
    .eq('id', localityId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[getLocalityDetails]', error)
    return null
  }

  // A JOIN-eredményből a county-t kicsomagoljuk
  const raw = data as unknown as LocalityRow & { adrcounty: CountyRow | CountyRow[] | null }
  const county = Array.isArray(raw.adrcounty) ? raw.adrcounty[0] : raw.adrcounty
  if (!county) return null

  return {
    id: raw.id,
    name_hu: raw.name_hu,
    name_ro: raw.name_ro,
    default_postalcode: raw.default_postalcode,
    siruta_code: raw.siruta_code,
    countyid: raw.countyid,
    county,
  }
}
