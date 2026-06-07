'use server'

/**
 * profile_roles CRUD — admin / egyházkerületi admin számára.
 *
 * Alapelv (7): szerepkört CSAK admin / egyházkerületi admin oszthat ki.
 * A gyülekezeti lelkészi hozzárendelés (konyvelo, titkar, custom gyülekezeti
 * scope-ra) PENDING státuszban jön létre — a lelkész jóváhagyja a saját
 * /profile/kapcsolatok oldalán.
 *
 * Sprint U.5 (2026-05-03):
 *   - guard: `canManage` helyett `requireAdminAccess` (egységes szabály)
 *   - audit-log: minden create/revoke művelet `audit_log`-ba
 *   - D6 auto-activate: ha pending user kap approved szerepkört, a fiókja is aktiválódik
 *   - sync-helper: a `profiles.role` legacy mező automatikusan tükröződik
 */

import { revalidatePath } from 'next/cache'
import { requireAdminAccess } from '@/lib/auth/admin-access'
import {
  assertScopeTargetInScope,
  getAdminDistrictScope,
  getScopedCongregationIds,
  getScopedDioceseIds,
} from '@/lib/auth/admin-scope'
import { logAuditEvent } from '@/lib/audit/log'
import { ROLE_TEMPLATES } from '@/lib/profile-roles/permissions'
import type {
  Permissions,
  ProfileRoleRow,
  ProfileRoleScope,
  ProfileRoleType,
} from '@/lib/profile-roles/types'
import { activateAccountOnRoleAssign } from '@/lib/users/activate-on-role-assign'
import { syncProfileRoleToLegacy } from '@/lib/users/sync-legacy-role'

export interface CreateProfileRoleInput {
  profileId: string
  scope: ProfileRoleScope
  scopeId: string | null
  role: ProfileRoleType
  customLabel?: string | null
  /** Ha NEM adott, a ROLE_TEMPLATES[role] alapértelmezettje kerül mentésre */
  permissions?: Permissions
  reason?: string
}

// ---------------------------------------------------------------------------
// Listázók
// ---------------------------------------------------------------------------

export async function listProfileRoles(): Promise<{ data?: ProfileRoleRow[]; error?: string }> {
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Nincs jogosultsága.' }
  }

  const { data, error } = await access.supabase
    .from('profile_roles')
    .select('*')
    .order('granted_at', { ascending: false })

  if (error) return { error: error.message }
  const rows = (data || []) as ProfileRoleRow[]

  // #2: kerületi admin → csak a saját egyházkerületébe eső szerepkörök
  // (system szint sosem; district/diocese/congregation a hatókör szerint).
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return { data: rows }

  const districtSet = new Set(scope.districtIds)
  const dioceseSet = new Set((await getScopedDioceseIds(access)) ?? [])
  const congSet = new Set((await getScopedCongregationIds(access)) ?? [])
  const filtered = rows.filter((r) => {
    if (!r.scope_id) return false
    if (r.scope === 'district') return districtSet.has(r.scope_id)
    if (r.scope === 'diocese') return dioceseSet.has(r.scope_id)
    if (r.scope === 'congregation') return congSet.has(r.scope_id)
    return false // 'system' — kerületi admin nem látja
  })
  return { data: filtered }
}

export async function listAssignableProfiles(): Promise<{
  data?: Array<{ id: string; full_name: string | null; email: string | null; role: string; status?: string }>
  error?: string
}> {
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Nincs jogosultsága.' }
  }

  // 2026-05-02 (v0.9.41) — Felhasználó panasza: az új regisztrált+elfogadott
  // user nem jelenik meg a Szerepkörök fülön. Az ok: az `eq('status', 'active')`
  // szűrő kizárja a 'pending' user-eket — még akkor is, ha őket az admin az
  // /admin/hozzaferes-kerelmek-ben elfogadta (mert ott csak az access_request
  // státusz változik, nem feltétlenül a profile.status).
  //
  // Most engedjük át a 'pending' és 'active' user-eket egyaránt — az UI
  // jelölje meg melyik a pending. A 'denied'/'rejected' továbbra is kihagyva.
  const { data, error } = await access.supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .in('status', ['active', 'pending'])
    .order('full_name', { nullsFirst: false })

  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function listScopeOptions(): Promise<{
  data?: {
    congregations: Array<{ id: string; name: string; diocese_id: string | null }>
    dioceses: Array<{ id: string; name: string; district_id: string | null }>
    districts: Array<{ id: string; name: string }>
  }
  error?: string
}> {
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Nincs jogosultsága.' }
  }

  // #2: kerületi admin → csak a saját egyházkerülete egységei jelenjenek meg a
  // szerepkör-form legördülőiben.
  const adminScope = getAdminDistrictScope(access)
  const scopedDioceseIds = await getScopedDioceseIds(access)

  const congQ = access.supabase.from('congregations').select('id, name, nev_hu, diocese_id').order('nev_hu')
  const dioQ = access.supabase.from('dioceses').select('id, name, district_id').order('name')
  const distQ = access.supabase.from('districts').select('id, name').order('name')
  if (scopedDioceseIds) congQ.in('diocese_id', scopedDioceseIds)
  if (scopedDioceseIds) dioQ.in('id', scopedDioceseIds)
  if (!adminScope.unrestricted) distQ.in('id', adminScope.districtIds.length ? adminScope.districtIds : ['00000000-0000-0000-0000-000000000000'])

  const [congs, dioceses, districts] = await Promise.all([congQ, dioQ, distQ])

  return {
    data: {
      congregations: (congs.data || []).map((c) => ({
        id: c.id as string,
        name: (c.nev_hu as string | null) || (c.name as string | null) || '—',
        diocese_id: (c.diocese_id as string | null) || null,
      })),
      dioceses: (dioceses.data || []) as Array<{ id: string; name: string; district_id: string | null }>,
      districts: (districts.data || []) as Array<{ id: string; name: string }>,
    },
  }
}

// ---------------------------------------------------------------------------
// Új kiosztás
// ---------------------------------------------------------------------------

export async function createProfileRole(
  input: CreateProfileRoleInput,
): Promise<{ success?: boolean; error?: string; id?: string; accountActivated?: boolean }> {
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Nincs jogosultsága szerepkört kiosztani.' }
  }

  // Validáció
  if (!input.profileId) return { error: 'Válasszon felhasználót.' }
  if (!input.role) return { error: 'Válasszon szerepkört.' }

  if (input.scope === 'system' && input.scopeId) {
    return { error: 'System scope-nál nem adhat meg scope_id-t.' }
  }
  if (input.scope !== 'system' && !input.scopeId) {
    return { error: 'A kiválasztott scope-hoz tartozó egységet (gyülekezet / egyházmegye / egyházkerület) adja meg.' }
  }

  if (input.role === 'custom' && !input.customLabel?.trim()) {
    return { error: 'Egyedi szerepkörnél a nevet meg kell adni.' }
  }
  if (input.role !== 'custom' && input.customLabel) {
    return { error: 'Csak egyedi szerepkörnél adható meg név.' }
  }

  // Scope és role kompatibilitás
  if (input.scope === 'system' && input.role !== 'admin') {
    return { error: 'System scope-hoz csak admin szerep rendelhető.' }
  }
  if (input.scope === 'district' && !['egyhazkeruleti_admin', 'custom'].includes(input.role)) {
    return { error: 'Egyházkerületi scope-hoz csak egyházkerületi admin vagy egyedi szerep rendelhető.' }
  }
  if (input.scope === 'diocese' && !['egyhazmegyei_admin', 'esperes', 'egyhazmegyei_szamvevo', 'custom'].includes(input.role)) {
    return { error: 'Egyházmegyei scope-hoz csak esperes, egyházmegyei admin/számvevő vagy egyedi szerep rendelhető.' }
  }
  if (input.scope === 'congregation' && !['lelkesz', 'konyvelo', 'custom'].includes(input.role)) {
    return { error: 'Gyülekezeti scope-hoz csak lelkész, könyvelő vagy egyedi szerep rendelhető.' }
  }

  // #2: kerületi admin csak a saját egyházkerületébe eső hatókörre oszthat
  // szerepkört (system szintet egyáltalán nem).
  try {
    await assertScopeTargetInScope(access, input.scope, input.scopeId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága ehhez a hatókörhöz.' }
  }

  // Engedélyek — ha nincs megadva, a sablon használása
  const permissions = input.permissions ?? (input.role === 'custom' ? {} : ROLE_TEMPLATES[input.role])

  // Gyülekezeti scope-nál lelkészi jóváhagyás kell (pending state)
  const pastorApprovalNeeded = input.scope === 'congregation' && input.role !== 'lelkesz'
  const approvalStatus = pastorApprovalNeeded ? 'pending' : 'approved'

  const { supabase, user } = access
  const { data: inserted, error } = await supabase
    .from('profile_roles')
    .insert({
      profile_id: input.profileId,
      scope: input.scope,
      scope_id: input.scopeId,
      role: input.role,
      custom_label: input.customLabel?.trim() || null,
      permissions,
      approval_status: approvalStatus,
      approval_reason: input.reason?.trim() || null,
      granted_by: user!.id,
      approved_by: pastorApprovalNeeded ? null : user!.id,
      approved_at: pastorApprovalNeeded ? null : new Date().toISOString(),
      active: !pastorApprovalNeeded,
    })
    .select('id')
    .single()

  if (error) return { error: `Hiba: ${error.message}` }

  // Audit-log a kiosztásról
  await logAuditEvent({
    action: 'profile_role.assign',
    targetTable: 'profile_roles',
    targetId: inserted?.id ?? null,
    metadata: {
      profile_id: input.profileId,
      scope: input.scope,
      scope_id: input.scopeId,
      role: input.role,
      custom_label: input.customLabel?.trim() || null,
      pastor_approval_needed: pastorApprovalNeeded,
    },
  })

  // D6: ha approved kiosztás, és a user pending — automatikusan aktiváljuk a fiókot.
  // Lelkészi jóváhagyás-igénylős (pending) ágon NEM aktiválunk.
  let accountActivated = false
  if (!pastorApprovalNeeded) {
    try {
      const result = await activateAccountOnRoleAssign(
        input.profileId,
        input.scope,
        input.scopeId,
        supabase,
        input.role,
        input.customLabel,
      )
      if (result.activated) {
        accountActivated = true
        await logAuditEvent({
          action: 'user.activate_via_role_assign',
          targetTable: 'profiles',
          targetId: input.profileId,
          metadata: {
            via_profile_role_id: inserted?.id ?? null,
            role: input.role,
            scope: input.scope,
            scope_id: input.scopeId,
            previous_status: result.previousStatus,
            set_fields: result.setFields,
          },
        })
      }
    } catch (err) {
      console.warn(
        `[ACTIVATE] activateAccountOnRoleAssign hibája (${input.profileId}): ${
          err instanceof Error ? err.message : 'ismeretlen'
        }`,
      )
    }

    // Legacy profiles.role szinkron a multi-role-ból (D2)
    try {
      await syncProfileRoleToLegacy(input.profileId, supabase)
    } catch {
      // best-effort
    }
  }

  // Ha pending (lelkészi jóváhagyás kell), értesítés a gyülekezet lelkészeinek
  if (pastorApprovalNeeded && input.scopeId) {
    try {
      const { data: pastors } = await supabase
        .from('profiles')
        .select('id')
        .eq('congregation_id', input.scopeId)
        .eq('status', 'active')

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', input.profileId)
        .maybeSingle()

      const targetName = targetProfile?.full_name || targetProfile?.email || 'Egy felhasználó'
      const roleLabel = input.role === 'custom' ? input.customLabel : input.role

      for (const p of pastors || []) {
        if (!p.id) continue
        await supabase.from('ertesitesek').insert({
          user_id: p.id,
          congregation_id: input.scopeId,
          cim: `Új hozzáférési kérés: ${roleLabel}`,
          uzenet: `${targetName} ${roleLabel} szerepkörrel szeretne hozzáférést kapni a gyülekezethez. A saját profilján tudja jóváhagyni vagy elutasítani.`,
          tipus: 'info',
          hivatkozas: '/profile/kapcsolatok',
        })
      }
    } catch {
      // Csendes — a létrehozás már sikeres
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/felhasznalok')
  revalidatePath('/', 'layout')
  return { success: true, id: inserted?.id, accountActivated }
}

// ---------------------------------------------------------------------------
// Visszavonás
// ---------------------------------------------------------------------------

export async function revokeProfileRole(args: {
  profileRoleId: string
  reason: string
}): Promise<{ success?: boolean; error?: string }> {
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Nincs jogosultsága visszavonni.' }
  }

  if (!args.reason?.trim() || args.reason.trim().length < 5) {
    return { error: 'A visszavonás indoklása legalább 5 karakter legyen.' }
  }

  // A profile_id-t a rekordból olvassuk ki, hogy a sync később tudjon róla
  const { data: rowSnapshot } = await access.supabase
    .from('profile_roles')
    .select('profile_id, scope, scope_id, role')
    .eq('id', args.profileRoleId)
    .maybeSingle()

  if (!rowSnapshot) return { error: 'A szerepkör nem található.' }

  // #2: kerületi admin csak a saját egyházkerületébe eső szerepkört vonhat vissza.
  try {
    await assertScopeTargetInScope(
      access,
      rowSnapshot.scope as ProfileRoleScope,
      (rowSnapshot.scope_id as string | null) ?? null,
    )
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága ehhez a szerepkörhöz.' }
  }

  const { error } = await access.supabase
    .from('profile_roles')
    .update({
      approval_status: 'revoked',
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: access.user!.id,
      revoked_reason: args.reason.trim(),
    })
    .eq('id', args.profileRoleId)

  if (error) return { error: `Hiba: ${error.message}` }

  await logAuditEvent({
    action: 'profile_role.revoke',
    targetTable: 'profile_roles',
    targetId: args.profileRoleId,
    metadata: {
      profile_id: rowSnapshot?.profile_id ?? null,
      scope: rowSnapshot?.scope ?? null,
      scope_id: rowSnapshot?.scope_id ?? null,
      role: rowSnapshot?.role ?? null,
      reason: args.reason.trim(),
    },
  })

  // Sync a legacy profiles.role mezőre — a visszavont szerep eltűnik a számításból
  if (rowSnapshot?.profile_id) {
    try {
      await syncProfileRoleToLegacy(rowSnapshot.profile_id, access.supabase)
    } catch {
      // best-effort
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/felhasznalok')
  revalidatePath('/', 'layout')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Permissions frissítés (x-elés)
// ---------------------------------------------------------------------------

export async function updateProfileRolePermissions(args: {
  profileRoleId: string
  permissions: Permissions
}): Promise<{ success?: boolean; error?: string }> {
  let access: Awaited<ReturnType<typeof requireAdminAccess>>
  try {
    access = await requireAdminAccess()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Nincs jogosultsága.' }
  }

  // #2: kerületi admin csak a saját egyházkerületébe eső szerepkör engedélyeit
  // módosíthatja.
  const { data: roleSnapshot } = await access.supabase
    .from('profile_roles')
    .select('scope, scope_id')
    .eq('id', args.profileRoleId)
    .maybeSingle()
  if (!roleSnapshot) return { error: 'A szerepkör nem található.' }
  try {
    await assertScopeTargetInScope(
      access,
      roleSnapshot.scope as ProfileRoleScope,
      (roleSnapshot.scope_id as string | null) ?? null,
    )
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nincs jogosultsága ehhez a szerepkörhöz.' }
  }

  const { error } = await access.supabase
    .from('profile_roles')
    .update({ permissions: args.permissions })
    .eq('id', args.profileRoleId)

  if (error) return { error: `Hiba: ${error.message}` }

  await logAuditEvent({
    action: 'profile_role.permissions_update',
    targetTable: 'profile_roles',
    targetId: args.profileRoleId,
    metadata: { permissions: args.permissions },
  })

  revalidatePath('/admin')
  revalidatePath('/admin/felhasznalok')
  revalidatePath('/', 'layout')
  return { success: true }
}
