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
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  assertScopeTargetInScope,
  darabolIdListat,
  getAdminDistrictScope,
  getScopedCongregationIds,
  getScopedDioceseIds,
  getScopedDioceseIdsResult,
} from '@/lib/auth/admin-scope'
import { canReadDioceseScope, resolveDioceseReadScopeIds } from '@/lib/auth/level-scope'
import { logAuditEvent } from '@/lib/audit/log'
import { feladoMezok } from '@/lib/notifications/felado'
import { insertErtesites } from '@/lib/notifications/ertesites-insert'
import { ROLE_TEMPLATES } from '@/lib/profile-roles/permissions'
import type {
  ApprovalStatus,
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

/**
 * Egy EGYHÁZMEGYE VALÓDI szerepkör-listája (csak olvasás).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KELLETT (2026-08-22, 4. pont)
 * ════════════════════════════════════════════════════════════════════════════
 * A megyei irányítópult „Szerepkörök" füle valójában a `profile_congregations`
 * táblát (könyvelői/számvevői HOZZÁRENDELÉSEK) mutatta — szerepkört nem. A
 * felirat és a tartalom széthúzott. Ez a listázó adja a hiányzó felet: a
 * `profile_roles` sorokat, a KÉPERNYŐN LÁTOTT egyházmegyére szűrve.
 *
 * Miért nem a meglévő `listProfileRoles`: az `requireAdminAccess`-t követel
 * (a megyei olvasó ott elbukik), és EGYHÁZKERÜLETRE szűr, nem megyére.
 *
 * HATÓKÖR (FAIL-CLOSED): korlátlan admin; kerületi admin, akinek a feloldott
 * megyéi közt van ez a megye; vagy megyei OLVASÓ (esperes / megyei admin /
 * megyei számvevő), akinek a szerep-szűrt olvasói hatókörében szerepel. Bárki
 * más HIBÁT kap — nem üres listát.
 *
 * Amit hoz: a `scope='diocese'` sorok erre a megyére + a megye gyülekezeteire
 * eső `scope='congregation'` sorok. A `system` és a `district` szint SOHA.
 */
export type DioceseProfileRoleRow = {
  id: string
  profile_id: string
  profile_full_name: string | null
  profile_email: string | null
  scope: 'diocese' | 'congregation'
  scope_id: string
  /** Az egyházmegye vagy a gyülekezet neve — a listában ez látszik. */
  scope_name: string | null
  role: ProfileRoleType
  custom_label: string | null
  approval_status: ApprovalStatus
  active: boolean
  granted_at: string
}

export async function listProfileRolesForDiocese(
  dioceseId: string,
): Promise<{ data?: DioceseProfileRoleRow[]; error?: string }> {
  if (!dioceseId) return { error: 'Nincs kiválasztott egyházmegye.' }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  // ── Hatókör-kapu ──────────────────────────────────────────────────────────
  const adminScope = getAdminDistrictScope(access)
  let engedelyezett = adminScope.unrestricted

  if (!engedelyezett && access.egyhazkeruletiAdmin) {
    // A „nem tudjuk" NEM lehet néma üres lista (lásd admin-scope ScopedIdsResult).
    const megyek = await getScopedDioceseIdsResult(access)
    if (!megyek.feloldhato) {
      return {
        error:
          'Az egyházkerületi hatókörét most nem sikerült feloldani, ezért a szerepköröket nem tudjuk megmutatni.' +
          (megyek.hiba ? ` (Részlet: ${megyek.hiba})` : ''),
      }
    }
    if (megyek.indok === 'nincs_kerulet') {
      return {
        error:
          'Nincs feloldható egyházkerületi hatóköre, ezért a szerepkörök nem listázhatók. ' +
          'Kérje a rendszergazdát, hogy állítsa be az egyházkerületét.',
      }
    }
    engedelyezett = !!megyek.ids && megyek.ids.includes(dioceseId)
  }

  if (!engedelyezett && canReadDioceseScope(access)) {
    engedelyezett = resolveDioceseReadScopeIds(access).includes(dioceseId)
  }

  if (!engedelyezett) {
    return { error: 'Ehhez az egyházmegyéhez nincs jogosultsága a szerepkörök megtekintéséhez.' }
  }

  const supabase = access.supabase
  const OSZLOPOK = 'id, profile_id, scope, scope_id, role, custom_label, approval_status, active, granted_at'
  type Nyers = {
    id: string
    profile_id: string
    scope: 'diocese' | 'congregation'
    scope_id: string
    role: ProfileRoleType
    custom_label: string | null
    approval_status: ApprovalStatus
    active: boolean
    granted_at: string
  }

  // (1) Az egyházmegye neve — a megyei sorok mellé.
  const { data: megyeSor } = await supabase
    .from('dioceses')
    .select('name')
    .eq('id', dioceseId)
    .maybeSingle()
  const megyeNev = ((megyeSor as { name?: string | null } | null)?.name ?? null) as string | null

  // (2) A MEGYEI szintű szerepkör-sorok.
  const { data: megyeiSorok, error: megyeiErr } = await supabase
    .from('profile_roles')
    .select(OSZLOPOK)
    .eq('scope', 'diocese')
    .eq('scope_id', dioceseId)
  if (megyeiErr) return { error: megyeiErr.message }

  // (3) A megye gyülekezetei (név is, hogy a lista olvasható legyen).
  const { data: congs, error: congErr } = await supabase
    .from('congregations')
    .select('id, nev_hu, name')
    .eq('diocese_id', dioceseId)
  if (congErr) return { error: congErr.message }
  const congNev = new Map<string, string | null>(
    (congs ?? []).map((c): [string, string | null] => {
      const sor = c as { id: string; nev_hu: string | null; name: string | null }
      return [sor.id, sor.nev_hu || sor.name || null]
    }),
  )

  // (4) A GYÜLEKEZETI szintű sorok — 80-asával DARABOLVA (414-védelem: egy nagy
  //     megye gyülekezet-listája is az URL-be kerülne).
  const gyulekezetiSorok: Nyers[] = []
  for (const darab of darabolIdListat([...congNev.keys()])) {
    const { data, error } = await supabase
      .from('profile_roles')
      .select(OSZLOPOK)
      .eq('scope', 'congregation')
      .in('scope_id', darab)
    if (error) return { error: error.message }
    gyulekezetiSorok.push(...((data ?? []) as unknown as Nyers[]))
  }

  const osszes: Nyers[] = [...((megyeiSorok ?? []) as unknown as Nyers[]), ...gyulekezetiSorok]
  if (osszes.length === 0) return { data: [] }

  // (5) A nevek — szintén darabolva.
  const profilIds = [...new Set(osszes.map((r) => r.profile_id))]
  const profilNev = new Map<string, { full_name: string | null; email: string | null }>()
  for (const darab of darabolIdListat(profilIds)) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', darab)
    if (error) return { error: error.message }
    for (const p of data ?? []) {
      const sor = p as { id: string; full_name: string | null; email: string | null }
      profilNev.set(sor.id, { full_name: sor.full_name, email: sor.email })
    }
  }

  const rows: DioceseProfileRoleRow[] = osszes.map((r) => ({
    id: r.id,
    profile_id: r.profile_id,
    profile_full_name: profilNev.get(r.profile_id)?.full_name ?? null,
    profile_email: profilNev.get(r.profile_id)?.email ?? null,
    scope: r.scope,
    scope_id: r.scope_id,
    scope_name: r.scope === 'diocese' ? megyeNev : (congNev.get(r.scope_id) ?? null),
    role: r.role,
    custom_label: r.custom_label,
    approval_status: r.approval_status,
    active: r.active,
    granted_at: r.granted_at,
  }))

  // A darabolt lekérdezések után a rendezést itt állítjuk elő. A visszavont /
  // függő sorokat NEM rejtjük el (az elhallgatás is félrevezetés), csak hátra
  // soroljuk — elöl az legyen, aki tényleg dolgozik a megyében.
  const elol = (r: DioceseProfileRoleRow) => (r.active && r.approval_status === 'approved' ? 0 : 1)
  rows.sort(
    (a, b) => elol(a) - elol(b) || (b.granted_at || '').localeCompare(a.granted_at || ''),
  )

  return { data: rows }
}

// BIZTONSÁGI FIX 2026-08-11 (#15): a `listAssignableProfiles` export TÖRÖLVE.
// A `profiles` táblát `.in('status', ['active','pending'])` szűréssel kérdezte le,
// hatókör-szűrés NÉLKÜL — miközben a fájl minden más listázója (listProfileRoles,
// listScopeOptions) `getAdminDistrictScope`-pal szűkít. Hívója nem volt (a
// components/admin/users/unified-users-tab.tsx fejléce is „eltávolítottként"
// említi), de egy `'use server'` export akkor is ÉLŐ POST-végpont: egy
// `egyhazkeruleti_admin` így az ORSZÁG ÖSSZES felhasználójának — köztük minden
// függőben lévő regisztrálónak — a nevét és e-mail-címét lekérhette volna, a
// saját kerületén kívülről is (admin-scope.ts: „más kerületet NE is lásson").

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
  // 2026-08-15 (egyházkerületi S1): a kerületi SZÁMVEVŐ (ellenőr) is district
  // hatókörű. Enélkül a szerep létezne a típusokban, de KIOSZTHATÓ nem lenne.
  if (
    input.scope === 'district' &&
    !['egyhazkeruleti_admin', 'egyhazkeruleti_szamvevo', 'custom'].includes(input.role)
  ) {
    return {
      error:
        'Egyházkerületi scope-hoz csak egyházkerületi admin, egyházkerületi számvevő ' +
        'vagy egyedi szerep rendelhető.',
    }
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

      const cimzettek = (pastors || []).map((p) => p.id).filter((id): id is string => !!id)
      if (cimzettek.length > 0) {
        // Egy hívás, minden címzettnek; a feladó a kérelmező felhasználó.
        // A hibát a segéd naplózza — a szerepkör-sor már létrejött.
        await insertErtesites(
          supabase,
          cimzettek.map((uid) => ({
            user_id: uid,
            congregation_id: input.scopeId,
            cim: `Új hozzáférési kérés: ${roleLabel}`,
            uzenet: `${targetName} ${roleLabel} szerepkörrel szeretne hozzáférést kapni a gyülekezethez. A saját profilján tudja jóváhagyni vagy elutasítani.`,
            tipus: 'info',
            hivatkozas: '/profile/kapcsolatok',
            ...feladoMezok('felhasznalo', targetName, input.profileId),
          })),
          { forras: 'szerepkor-keres' },
        )
      }
    } catch (e) {
      // A létrehozás már sikeres — de a hallgatás tilos.
      console.warn('[profile-roles] a lelkész-értesítés nem ment ki:', e instanceof Error ? e.message : e)
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

// 2026-08-11 (K5 P2 #6) — TÖRÖLVE: `updateProfileRolePermissions`. Hívója sehol
// nem volt a repóban; a jogosultság-mátrix szerkesztője
// (components/admin/users/role-permissions-dialog.tsx) NEM ezt hívja. Egy
// `use server` export hívó nélkül is ÉLŐ POST-végpont: ez konkrétan a
// `profile_roles.permissions` mezőt írta felül tetszőleges tartalommal, ezért a
// törlése nem csak takarítás.
