import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

const ROLE_PRIORITY = [
  'admin',
  'egyhazkeruleti_admin',
  // 2026-08-15: a kerületi számvevő az ellenőr — a kerületi ADMIN alatt, de a
  // megyei szintek FÖLÖTT áll, mert a hatóköre egy egész egyházkerület.
  'egyhazkeruleti_szamvevo',
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

  // 2026-08-09: a scope + scope_id is kell — a győztes szerep org-skalárját
  // (profiles.diocese_id / district_id) is szinkronban kell tartani, különben
  // a diocese/district felületek hatóköre elcsúszik (divergencia-hibaosztály,
  // lásd lib/auth/level-scope.ts).
  const { data: rolesData, error } = await supabase
    .from('profile_roles')
    .select('role, scope, scope_id')
    .eq('profile_id', profileId)
    .eq('approval_status', 'approved')
    .eq('active', true)
    .order('granted_at', { ascending: false })

  if (error) {
    console.warn(`[SYNC] profile_roles lekérdezés hibája (${profileId}): ${error.message}`)
    return { syncedTo: null, previousRole: null, changed: false }
  }

  type RoleRow = { role: string; scope: string | null; scope_id: string | null }
  const rows = (rolesData || []) as RoleRow[]
  const activeRoles = new Set<string>(rows.map((r) => r.role))

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

  // 2026-08-09: org-skalár szinkron (best-effort) — a győztes szerep
  // diocese/district scope_id-ja kerül a profiles.diocese_id / district_id
  // mezőbe, MÁR AKTÍV fióknál is. Ez zárja a hibaosztályt, hogy egy
  // szerepkör-kiosztás/visszavonás után a skalár NULL-on vagy egy KORÁBBI
  // egyházmegyén/kerületen ragadjon, és a dashboard szűretlen / idegen-scope
  // adatot mutasson (2026-08-09 diagnosztika).
  await syncOrgScalarsForChosenRole(supabase, profileId, chosen, rows)

  return {
    syncedTo: chosen,
    previousRole: result.previous_role,
    changed: result.was_updated,
  }
}

/**
 * A győztes (legacy) szerephez tartozó profile_roles sor scope_id-ját
 * propagálja a profiles.diocese_id / district_id skalárokra a SECURITY DEFINER
 * `admin_activate_user` RPC-n keresztül (az 2026-07-01 óta már aktív fióknál
 * is írja az org-mezőket). Best-effort: hiba esetén csak console.warn — a fő
 * role-szinkron eredményét nem befolyásolja.
 *
 * FONTOS: csak MÁR AKTÍV profilnál fut — pending profilt az RPC aktiválna,
 * azt a döntést viszont a kiosztási folyamat (activateAccountOnRoleAssign)
 * hozza meg, nem ez a helper.
 */
async function syncOrgScalarsForChosenRole(
  supabase: SupabaseClient,
  profileId: string,
  chosen: LegacyRole,
  rows: Array<{ role: string; scope: string | null; scope_id: string | null }>,
): Promise<void> {
  try {
    // A győztes szerep legfrissebb, scope_id-val rendelkező sora
    const winnerRow =
      rows.find((r) => r.role === chosen && r.scope === 'district' && r.scope_id) ||
      rows.find((r) => r.role === chosen && r.scope === 'diocese' && r.scope_id) ||
      null
    if (!winnerRow) return

    let p_diocese_id: string | null = null
    let p_district_id: string | null = null

    if (winnerRow.scope === 'district') {
      p_district_id = winnerRow.scope_id
    } else if (winnerRow.scope === 'diocese') {
      p_diocese_id = winnerRow.scope_id
      // A kerület is propagálódik az egyházmegye alapján (best-effort)
      const { data: dio } = await supabase
        .from('dioceses')
        .select('district_id')
        .eq('id', winnerRow.scope_id!)
        .maybeSingle()
      p_district_id = (dio?.district_id as string | null) || null
    }

    if (!p_diocese_id && !p_district_id) return

    // Csak aktív profilnál — és csak ha tényleg eltér a skalár
    const { data: prof } = await supabase
      .from('profiles')
      .select('status, diocese_id, district_id')
      .eq('id', profileId)
      .maybeSingle()
    if (!prof || (prof as { status?: string | null }).status !== 'active') return

    const current = prof as { diocese_id: string | null; district_id: string | null }
    const dioceseDiverges = !!p_diocese_id && current.diocese_id !== p_diocese_id
    const districtDiverges = !!p_district_id && current.district_id !== p_district_id
    if (!dioceseDiverges && !districtDiverges) return

    const { error: rpcErr } = await supabase.rpc('admin_activate_user', {
      p_user_id: profileId,
      p_congregation_id: null,
      p_diocese_id,
      p_district_id,
    })
    if (rpcErr) {
      console.warn(
        `[SYNC] org-skalár szinkron RPC hiba (${profileId}): ${rpcErr.message}`,
      )
    }
  } catch (err) {
    console.warn(
      `[SYNC] org-skalár szinkron hiba (${profileId}): ${
        err instanceof Error ? err.message : 'ismeretlen'
      }`,
    )
  }
}
