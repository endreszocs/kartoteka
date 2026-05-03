import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .maybeSingle()

  const previousRole = (profile?.role as string | null) ?? null

  const { data: rolesData, error } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('profile_id', profileId)
    .eq('approval_status', 'approved')
    .eq('active', true)

  if (error) {
    console.warn(`[SYNC] profile_roles lekérdezés hibája (${profileId}): ${error.message}`)
    return { syncedTo: null, previousRole, changed: false }
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
    return { syncedTo: null, previousRole, changed: false }
  }

  if (chosen === previousRole) {
    return { syncedTo: chosen, previousRole, changed: false }
  }

  // FIX 2026-05-04 (RLS-bug): service-role kliens a profiles.role update-hez.
  let writeClient: SupabaseClient
  try {
    writeClient = getSupabaseAdminClient()
  } catch {
    writeClient = supabase // fallback ha service-role kulcs nincs
  }

  const { error: updateErr } = await writeClient
    .from('profiles')
    .update({ role: chosen })
    .eq('id', profileId)

  if (updateErr) {
    console.warn(`[SYNC] profiles.role frissítés hibája (${profileId}): ${updateErr.message}`)
    return { syncedTo: null, previousRole, changed: false }
  }

  return { syncedTo: chosen, previousRole, changed: true }
}
