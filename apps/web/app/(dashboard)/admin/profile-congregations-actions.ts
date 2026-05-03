'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * profile_congregations hozzárendelések kezelése — admin / kerületi admin oldali actions.
 *
 * Alapelv (gyülekezeti autonómia):
 * Az admin/kerületi admin **kezdeményezhet** könyvelő vagy számvevő hozzárendelést egy
 * gyülekezethez, de a hozzáférés `pending` státusszal jön létre. A gyülekezet lelkésze
 * az /profile/kapcsolatok oldalon jóváhagyja vagy elutasítja a kérést.
 *
 * A lelkész explicit jóváhagyása nélkül az érintett könyvelő/számvevő NEM lát adatot.
 */

export type AssignmentRoleScope = 'konyvelo' | 'egyhazmegyei_szamvevo'

export type AssignmentRow = {
  id: string
  profile_id: string
  congregation_id: string
  role_scope: AssignmentRoleScope
  approval_status: 'pending' | 'approved' | 'rejected' | 'revoked'
  approval_reason: string | null
  assigned_by: string
  assigned_at: string
  approved_at: string | null
  approved_by: string | null
  active: boolean
  revoked_at: string | null
  revoked_by: string | null
  revoked_reason: string | null
  // JOIN-ok
  profile_full_name: string | null
  profile_email: string | null
  profile_role: string
  congregation_name: string | null
}

/**
 * Lista minden hozzárendelésről, opcionális szűréssel.
 * Jogosultság: admin, egyházkerületi admin, esperes, egyházmegyei admin (CSAK olvasás).
 * A szerepkör KIOSZTÁSA viszont csak admin / egyházkerületi admin jogosultsága
 * (lásd `createAssignment`, `revokeAssignment`).
 */
export async function listAssignments(options?: {
  congregationId?: string
  profileId?: string
  status?: 'pending' | 'approved' | 'rejected' | 'revoked'
}): Promise<{ data?: AssignmentRow[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  const role = access.profile?.role
  const isDioceseLevel = role === 'esperes' || role === 'egyhazmegyei_admin'
  if (!access.admin && !access.egyhazkeruletiAdmin && !isDioceseLevel) {
    return { error: 'Nincs jogosultsága a listázáshoz.' }
  }

  const supabase = access.supabase

  let query = supabase
    .from('profile_congregations')
    .select(`
      id, profile_id, congregation_id, role_scope, approval_status, approval_reason,
      assigned_by, assigned_at, approved_at, approved_by, active,
      revoked_at, revoked_by, revoked_reason,
      profile:profiles!profile_congregations_profile_id_fkey(full_name, email, role),
      congregation:congregations(nev_hu, name)
    `)
    .order('assigned_at', { ascending: false })

  if (options?.congregationId) query = query.eq('congregation_id', options.congregationId)
  if (options?.profileId) query = query.eq('profile_id', options.profileId)
  if (options?.status) query = query.eq('approval_status', options.status)

  const { data, error } = await query
  if (error) return { error: error.message }

  type Row = {
    id: string
    profile_id: string
    congregation_id: string
    role_scope: AssignmentRoleScope
    approval_status: AssignmentRow['approval_status']
    approval_reason: string | null
    assigned_by: string
    assigned_at: string
    approved_at: string | null
    approved_by: string | null
    active: boolean
    revoked_at: string | null
    revoked_by: string | null
    revoked_reason: string | null
    profile: { full_name: string | null; email: string | null; role: string } | { full_name: string | null; email: string | null; role: string }[] | null
    congregation: { nev_hu: string | null; name: string | null } | { nev_hu: string | null; name: string | null }[] | null
  }

  const rows: AssignmentRow[] = ((data ?? []) as unknown as Row[]).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
    const cong = Array.isArray(row.congregation) ? row.congregation[0] : row.congregation
    return {
      id: row.id,
      profile_id: row.profile_id,
      congregation_id: row.congregation_id,
      role_scope: row.role_scope,
      approval_status: row.approval_status,
      approval_reason: row.approval_reason,
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      active: row.active,
      revoked_at: row.revoked_at,
      revoked_by: row.revoked_by,
      revoked_reason: row.revoked_reason,
      profile_full_name: profile?.full_name ?? null,
      profile_email: profile?.email ?? null,
      profile_role: profile?.role ?? '',
      congregation_name: cong?.nev_hu || cong?.name || null,
    }
  })

  return { data: rows }
}

/**
 * Új hozzárendelés kezdeményezése (pending).
 * Értesítés jön létre a gyülekezet lelkészének.
 *
 * FIX 2026-05-04: az insert/update most SECURITY DEFINER RPC-n
 * (admin_create_or_reinit_assignment) megy, hogy a kerületi admin is
 * tudjon szerepkört kiosztani RLS/GRANT problémák nélkül. A validációk
 * az RPC-ben történnek; a TS oldalon csak a target profile lekérdezés
 * (read-only) marad az értesítés-küldéshez.
 */
export async function createAssignment(args: {
  profileId: string
  congregationId: string
  roleScope: AssignmentRoleScope
  reason: string
}): Promise<{ success?: boolean; error?: string; assignmentId?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // JS-szintű előzetes check (a végleges védelem az RPC-ben)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Szerepkör kiosztása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.' }
  }

  const supabase = access.supabase

  // SECURITY DEFINER RPC — minden validáció és UPSERT egy hívásban
  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_create_or_reinit_assignment', {
      p_profile_id: args.profileId,
      p_congregation_id: args.congregationId,
      p_role_scope: args.roleScope,
      p_reason: args.reason,
    })
    .single()

  if (rpcErr) return { error: `Hiba: ${rpcErr.message}` }

  const result = rpcRes as
    | { assignment_id: string; action: string; was_reactivated: boolean }
    | null

  if (!result?.assignment_id) {
    return { error: 'Az RPC nem adott vissza assignment_id-t.' }
  }

  // Értesítés a lelkésznek (best-effort, read-only target profile)
  try {
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', args.profileId)
      .maybeSingle()

    await sendPastorNotification(supabase, {
      congregationId: args.congregationId,
      assignmentId: result.assignment_id,
      targetFullName: targetProfile?.full_name ?? null,
      targetEmail: targetProfile?.email ?? null,
      roleScope: args.roleScope,
      reason: args.reason.trim(),
    })
  } catch {
    // best-effort — a hozzárendelés már él
  }

  revalidatePath('/admin')
  return { success: true, assignmentId: result.assignment_id }
}

/**
 * Admin visszavonása egy approved hozzárendelésnek.
 * A lelkészi oldal is tud visszavonni, de az admin is visszavonhatja (pl. kilépett könyvelő).
 *
 * FIX 2026-05-04: SECURITY DEFINER RPC (admin_revoke_assignment) — kerületi
 * admin is használhatja RLS/GRANT problémák nélkül.
 */
export async function revokeAssignment(args: {
  assignmentId: string
  reason: string
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // JS-szintű előzetes check (a végleges védelem az RPC-ben)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Szerepkör visszavonása csak rendszergazdai vagy egyházkerületi admin jogosultsággal lehetséges.' }
  }

  const supabase = access.supabase

  const { data: rpcRes, error: rpcErr } = await supabase
    .rpc('admin_revoke_assignment', {
      p_assignment_id: args.assignmentId,
      p_reason: args.reason,
    })
    .single()

  if (rpcErr) return { error: `Hiba: ${rpcErr.message}` }

  const result = rpcRes as { assignment_id: string; was_revoked: boolean } | null
  if (!result) {
    return { error: 'Az RPC nem adott vissza eredményt.' }
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard-egyhazmegye')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Értesítés helper — a lelkésznek, amikor új pending kérés érkezik
// ---------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof createClient>>

async function sendPastorNotification(
  supabase: Supabase,
  args: {
    congregationId: string
    assignmentId: string
    targetFullName: string | null
    targetEmail: string | null
    roleScope: AssignmentRoleScope
    reason: string
  },
) {
  // 1. Gyülekezet lelkésze (első találat)
  const { data: pastor } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('congregation_id', args.congregationId)
    .eq('role', 'lelkesz')
    .eq('status', 'active')
    .maybeSingle()

  if (!pastor?.id) return // nincs lelkész — az értesítés kihagyható

  const targetName = args.targetFullName || args.targetEmail || 'Egy új felhasználó'
  const roleLabel = args.roleScope === 'konyvelo' ? 'könyvelő' : 'egyházmegyei számvevő'

  await supabase.from('ertesitesek').insert({
    user_id: pastor.id,
    congregation_id: args.congregationId,
    cim: `Hozzáférési kérés: ${roleLabel}`,
    uzenet:
      `${targetName} ${roleLabel} szerepkörben szeretne hozzáférni a gyülekezeted pénzügyi adataihoz. ` +
      `Indok: "${args.reason}". ` +
      `A te engedélyed nélkül nem fogja látni a gyülekezet adatait. ` +
      `Nézd át a kérést a Profilom oldaladon.`,
    tipus: 'info',
    hivatkozas: '/profile/kapcsolatok',
  })
}

// ---------------------------------------------------------------------------
// Segéd: konyvelo és szamvevo szerepkörű aktív felhasználók listája
// ---------------------------------------------------------------------------

export async function listAssignableUsers(): Promise<{
  data?: Array<{ id: string; full_name: string | null; email: string | null; role: string }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // Csak admin / egyházkerületi admin oszthat szerepkört (új ALAPELV 2026-04-17)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Nincs jogosultsága.' }
  }

  const { data, error } = await access.supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['konyvelo', 'egyhazmegyei_szamvevo'])
    .eq('status', 'active')
    .order('full_name')

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

/**
 * Gyülekezetek listája a hozzárendelés-formhoz. Ha kerületi admin, csak a saját
 * kerülete alatti gyülekezetek (a RLS is szűri, de explicit jobb).
 */
export async function listCongregationsForAssignment(): Promise<{
  data?: Array<{ id: string; nev_hu: string | null; name: string | null; diocese_id: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  // Csak admin / egyházkerületi admin oszthat szerepkört (új ALAPELV 2026-04-17)
  if (!access.admin && !access.egyhazkeruletiAdmin) {
    return { error: 'Nincs jogosultsága.' }
  }

  // Egyházkerületi admin: csak a saját kerülete alatti gyülekezetek
  if (access.egyhazkeruletiAdmin && !access.admin && access.profile?.district_id) {
    const { data, error } = await access.supabase
      .from('congregations')
      .select('id, nev_hu, name, diocese_id, dioceses!inner(district_id)')
      .eq('dioceses.district_id', access.profile.district_id)
      .order('nev_hu')

    if (error) return { error: error.message }
    return { data: (data ?? []).map((c) => ({ id: c.id, nev_hu: c.nev_hu, name: c.name, diocese_id: c.diocese_id })) }
  }

  // Admin vagy master — minden
  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, nev_hu, name, diocese_id')
    .order('nev_hu')

  if (error) return { error: error.message }
  return { data: data ?? [] }
}
