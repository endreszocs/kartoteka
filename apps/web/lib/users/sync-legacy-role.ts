import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

const ROLE_PRIORITY = [
  'admin',
  'egyhazkeruleti_admin',
  'esperes',
  'egyhazmegyei_admin',
  'egyhazmegyei_szamvevo',
  'lelkesz',
  'konyvelo',
] as const

type LegacyRole = (typeof ROLE_PRIORITY)[number]

export interface SyncResult {
  syncedTo: LegacyRole | null
  previousRole: string | null
  changed: boolean
}

export async function syncProfileRoleToLegacy(
  profileId: string,
  client?: SupabaseClient,
): Promise<SyncResult> {
  const supabase = client ?? (await createClient())

  const { data: rolesData, error } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('profile_id', profileId)
    .eq('approval_status', 'approved')
    .eq('active', true)

  if (error) {
    console.warn(`[SYNC] profile_roles lekérdezés hibája (${profileId}): ${error.message}`)
    return { syncedTo: null, previousRole: null, changed: false }
  }

  const activeRoles = new Set<string>((rolesData || []).map((r) => r.role as string))

  let chosen: LegacyRole | null = null
  for (const role of ROLE_PRIORITY) {
    if (activeRoles.has(role)) {
      chosen = role
      break
    }
  }

  if (!chosen) {
    return { syncedTo: null, previousRole: null, changed: false }
  }

  // FIX 2026-05-04: SECURITY DEFINER RPC megkerüli az RLS-t és a GRANT-okat.
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_sync_legacy_role', { p_user_id: profileId, p_new_role: chosen })
    .single()

  if (rpcErr) {
    console.warn(`[SYNC] admin_sync_legacy_role RPC hiba (${profileId}): ${rpcErr.message}`)
    return { syncedTo: null, previousRole: null, changed: false }
  }

  const result = rpcRes as
    | { user_id: string; previous_role: string | null; new_role: string; was_updated: boolean }
    | null

  if (!result) {
    return { syncedTo: null, previousRole: null, changed: false }
  }

  return {
    syncedTo: chosen,
    previousRole: result.previous_role,
    changed: result.was_updated,
  }
}
