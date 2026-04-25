'use server'

/**
 * Utca-postakód-egyeztetés server actions a tagnyilvántartás-import wizardhoz.
 *
 * Két fő export:
 *   - isMultiPostalcodeLocality: a `is_multi_postalcode_locality` RPC wrapper
 *   - findStreetsWithPostalcode: a `find_streets_with_postalcode` RPC wrapper
 *     (autocomplete-hez)
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

// ─── Típusok ─────────────────────────────────────────────────────────────

export interface StreetCandidate {
  street_id: number
  street_name: string
  postalcode: string | null
  similarity: number
}

// ─── 1. is_multi_postalcode_locality wrapper ─────────────────────────────

export async function isMultiPostalcodeLocality(
  localityId: number,
): Promise<{ data?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_multi_postalcode_locality', {
    p_locality_id: localityId,
  })

  if (error) {
    return { error: `Multi-postakód ellenőrzés sikertelen: ${error.message}` }
  }

  return { data: data as boolean }
}

// ─── 2. find_streets_with_postalcode wrapper ──────────────────────────────

export async function findStreetsWithPostalcode(
  localityId: number,
  streetPattern: string | null = null,
  limit: number = 20,
): Promise<{ data?: StreetCandidate[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('find_streets_with_postalcode', {
    p_locality_id: localityId,
    p_street_pattern: streetPattern,
    p_limit: limit,
  })

  if (error) {
    return { error: `Utca-keresés sikertelen: ${error.message}` }
  }

  return { data: (data as StreetCandidate[]) || [] }
}
