'use server'

/**
 * Tagnyilvántartás auto-link — server action wrapper-ek a 4 RPC-hez:
 *   - previewFamilyLinks: dry_run elemzés (semmit nem ír DB-be)
 *   - applyFamilyLinks: tényleges insert + audit log batch-id-vel
 *   - revertFamilyLinkBatch: egy batch teljes visszavonása
 *   - listFamilyLinkBatches: az utolsó N batch listázása
 *
 * Az alapok az `import_family_head_batch` RPC után futnak — amikor
 * a szemely-ek és a "családfő" csalad rekordok már léteznek, az auto-link
 * keresi meg a házastárs és gyerek kapcsolatokat cím + szülő-név alapján.
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

// ─── Típusok ─────────────────────────────────────────────────────────────

export type FamilyLinkMode = 'conservative' | 'moderate' | 'aggressive'

export interface FamilyLinkSummary {
  spouse_confirmed: number
  spouse_uncertain: number
  child_confirmed: number
  child_uncertain: number
  floating: number
}

export interface SpouseConfirmedDetail {
  csalad_id: number
  spouse_szemely_id: number
  head_name: string
  spouse_name: string
}

export interface SpouseUncertainDetail {
  csalad_id: number
  head_name: string
  candidate_count: number
  reason: string
}

export interface ChildConfirmedDetail {
  gyerek_szemely_id: number
  name: string
  parent_name: string
  parent_role: 'apja' | 'anyja'
  csalad_id: number
}

export interface ChildUncertainDetail {
  szemely_id: number
  name: string
  apjaneve: string | null
  anyjaneve: string | null
  reason: string
}

export interface FloatingPersonDetail {
  szemely_id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  ferfi: boolean | null
  csaladfo: boolean | null
  c_szcim: string | null
}

export interface FamilyLinkResponse {
  batch_id: string | null
  dry_run: boolean
  mode: FamilyLinkMode
  summary: FamilyLinkSummary
  details: {
    spouse_confirmed: SpouseConfirmedDetail[]
    spouse_uncertain: SpouseUncertainDetail[]
    child_confirmed: ChildConfirmedDetail[]
    child_uncertain: ChildUncertainDetail[]
    floating: FloatingPersonDetail[]
  }
}

export interface FamilyLinkActionResult {
  success?: boolean
  error?: string
  data?: FamilyLinkResponse
}

export interface FamilyLinkBatchListItem {
  batch_id: string
  created_at: string
  user_id: string | null
  spouse_count: number
  child_count: number
  reverted: boolean
}

// ─── 1. Preview (dry_run) ────────────────────────────────────────────────

export async function previewFamilyLinks(
  congregationId?: string,
  mode: FamilyLinkMode = 'conservative',
): Promise<FamilyLinkActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const targetCongId = congregationId || access.effectiveCongregationId
  if (!targetCongId) {
    return { error: 'Nincs cél gyülekezet kiválasztva.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('infer_family_links_for_congregation', {
    target_congregation_id: targetCongId,
    mode,
    dry_run: true,
  })

  if (error) {
    return { error: `A családszerkezet-elemzés sikertelen: ${error.message}` }
  }

  return { success: true, data: data as FamilyLinkResponse }
}

// ─── 2. Apply (commit) ───────────────────────────────────────────────────

export async function applyFamilyLinks(
  congregationId?: string,
  mode: FamilyLinkMode = 'conservative',
): Promise<FamilyLinkActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const targetCongId = congregationId || access.effectiveCongregationId
  if (!targetCongId) {
    return { error: 'Nincs cél gyülekezet kiválasztva.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('infer_family_links_for_congregation', {
    target_congregation_id: targetCongId,
    mode,
    dry_run: false,
  })

  if (error) {
    return { error: `A családszerkezet összeállítása sikertelen: ${error.message}` }
  }

  // A wizard fő útja a /tagnyilvantartas oldalra mutat — frissítés
  revalidatePath('/tagnyilvantartas')

  return { success: true, data: data as FamilyLinkResponse }
}

// ─── 3. Revert egy konkrét batch ─────────────────────────────────────────

export async function revertFamilyLinkBatch(
  batchId: string,
): Promise<{ success?: boolean; error?: string; revertedCount?: number }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (!batchId || batchId.trim() === '') {
    return { error: 'Hiányzó batch_id.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('revert_family_link_batch', {
    target_batch_id: batchId,
  })

  if (error) {
    return { error: `A visszavonás sikertelen: ${error.message}` }
  }

  revalidatePath('/tagnyilvantartas')

  const revertedCount = (data as { reverted_count?: number })?.reverted_count ?? 0
  return { success: true, revertedCount }
}

// ─── 4. Batch lista (admin/lelkész nézet) ────────────────────────────────

export async function listFamilyLinkBatches(
  congregationId?: string,
  limit = 20,
): Promise<{ data?: FamilyLinkBatchListItem[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const targetCongId = congregationId || access.effectiveCongregationId
  if (!targetCongId) {
    return { error: 'Nincs cél gyülekezet kiválasztva.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_family_link_batches', {
    target_congregation_id: targetCongId,
    limit_count: limit,
  })

  if (error) {
    return { error: `A batch-lista lekérése sikertelen: ${error.message}` }
  }

  return { data: (data as FamilyLinkBatchListItem[]) || [] }
}
