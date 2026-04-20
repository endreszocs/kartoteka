import { createClient } from '@/lib/supabase/server'
import {
  isAdminRole,
  isEgyhazkeruletiAdminRole,
  isEsperesRole,
  isKonyveloRole,
  isMasterAdmin,
  isSzamvevoRole,
} from '@/lib/auth/roles'
import type { Profile, Role } from '@/lib/types/auth'
import type { Permissions, ProfileRoleRow, ProfileRoleScope, ProfileRoleType } from '@/lib/profile-roles/types'
import { ROLE_TEMPLATES, mergePermissions } from '@/lib/profile-roles/permissions'
import { cache } from 'react'
import { cookies } from 'next/headers'

// Cookie neve az aktív profile_role azonosítójához
const ACTIVE_PROFILE_ROLE_COOKIE = 'kartoteka_active_profile_role'

/**
 * Csak akkor aktiválható admin override, ha a master admin aktív god mode
 * sessionben van. Ez megakadályozza, hogy egy deactivate után ott maradt
 * (expirálatlan) admin_access_requests sor automatikusan átléptessen egy
 * új sessionben.
 */
async function hasActiveGodModeSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const cookie = cookieStore.get('god_mode_until')
    if (!cookie?.value) return false
    const expiresAt = Number(cookie.value)
    return Number.isFinite(expiresAt) && Date.now() < expiresAt
  } catch {
    return false
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type CongregationSummary = {
  id: string
  nev_hu: string | null
  name: string | null
  cimer_url: string | null
}

type OverrideRow = {
  congregation_id: string
  expires_at: string | null
  congregations: CongregationSummary | CongregationSummary[] | null
}

type RedirectProfile = Pick<Profile, 'role' | 'congregation_id'> | null

export interface EffectiveOverrideInfo {
  active: boolean
  congregationId?: string
  congregationName?: string
  congregationLogo?: string | null
  remainingMinutes?: number
  expiresAt?: string | null
}

export type AssignedCongregationScope = 'konyvelo' | 'egyhazmegyei_szamvevo'

export interface AssignedCongregation {
  id: string
  nev_hu: string | null
  name: string | null
  cimer_url: string | null
  roleScope: AssignedCongregationScope
  approvedAt: string | null
}

export interface ActiveProfileRoleContext {
  id: string
  scope: ProfileRoleScope
  scopeId: string | null
  role: ProfileRoleType
  customLabel: string | null
  /** A szerepkör-sablon + egyedi permissions egyesítve */
  permissions: Permissions
}

export interface EffectiveAccessContext {
  supabase: SupabaseServerClient
  user: { id: string; email?: string | null } | null
  userId: string | null
  profile: Profile | null
  fullName: string
  role: Role
  master: boolean
  admin: boolean
  /** Egyházkerületi admin (új szerepkör 2026-04-16). Magában foglalja az `admin`-t és a master admint is. */
  egyhazkeruletiAdmin: boolean
  esperes: boolean
  /** Könyvelő (gyülekezeti szintű pénzügyi review, many-to-many a profile_congregations-ön). */
  konyvelo: boolean
  /** Egyházmegyei számvevő (auditori szerep). */
  szamvevo: boolean
  profileCongregationId: string | null
  effectiveCongregationId: string | null
  congregationName: string | null
  congregationLogo: string | null
  hasCongregation: boolean
  /** Approved profile_congregations sorok (csak konyvelo / szamvevo szerepkör esetén nem üres). */
  assignedCongregations: AssignedCongregation[]
  override: EffectiveOverrideInfo
  /** Minden approved profile_roles sor (multi-role, 2026-04-17) */
  profileRoles: ProfileRoleRow[]
  /** Az éppen aktív kontextus (profile switcher-rel választható).
   *  Ha nincs cookie, az elsődleges (profiles.role) alapján kerül feloldásra. */
  activeProfileRole: ActiveProfileRoleContext | null
}

function pickCongregation(data: CongregationSummary | CongregationSummary[] | null): CongregationSummary | null {
  if (!data) return null
  return Array.isArray(data) ? data[0] ?? null : data
}

function calculateRemainingMinutes(expiresAt: string | null | undefined): number | undefined {
  if (!expiresAt) return undefined
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
}

async function getCongregationSummary(
  supabase: SupabaseServerClient,
  congregationId: string | null,
): Promise<CongregationSummary | null> {
  if (!congregationId) return null

  const { data } = await supabase
    .from('congregations')
    .select('id, nev_hu, name, cimer_url')
    .eq('id', congregationId)
    .maybeSingle()

  return data ?? null
}

async function getAssignedCongregations(
  supabase: SupabaseServerClient,
  userId: string,
  role: Role,
): Promise<AssignedCongregation[]> {
  // Csak a konyvelo és egyhazmegyei_szamvevo szerepkörökre releváns
  if (role !== 'konyvelo' && role !== 'egyhazmegyei_szamvevo') {
    return []
  }

  const { data, error } = await supabase
    .from('profile_congregations')
    .select('role_scope, approved_at, congregation:congregations(id, nev_hu, name, cimer_url)')
    .eq('profile_id', userId)
    .eq('active', true)
    .eq('approval_status', 'approved')

  if (error || !data) return []

  type Row = {
    role_scope: AssignedCongregationScope
    approved_at: string | null
    congregation: CongregationSummary | CongregationSummary[] | null
  }

  return (data as Row[])
    .map((row) => {
      const cong = pickCongregation(row.congregation)
      if (!cong) return null
      return {
        id: cong.id,
        nev_hu: cong.nev_hu,
        name: cong.name,
        cimer_url: cong.cimer_url,
        roleScope: row.role_scope,
        approvedAt: row.approved_at,
      } satisfies AssignedCongregation
    })
    .filter((item): item is AssignedCongregation => item !== null)
}

async function getActiveOverride(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<EffectiveOverrideInfo> {
  const { data } = await supabase
    .from('admin_access_requests')
    .select('congregation_id, expires_at, congregations(id, nev_hu, name, cimer_url)')
    .eq('admin_user_id', userId)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
    .order('approved_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const overrideRow = data as OverrideRow | null
  if (!overrideRow?.congregation_id) {
    return { active: false }
  }

  const congregation = pickCongregation(overrideRow.congregations)

  return {
    active: true,
    congregationId: overrideRow.congregation_id,
    congregationName: congregation?.nev_hu || congregation?.name || 'Ismeretlen',
    congregationLogo: congregation?.cimer_url || null,
    remainingMinutes: calculateRemainingMinutes(overrideRow.expires_at),
    expiresAt: overrideRow.expires_at,
  }
}

export async function resolvePostAuthRedirectPath(
  supabase: SupabaseServerClient,
  user: { id: string; email?: string | null } | null,
  profile: RedirectProfile,
): Promise<string> {
  if (!user) return '/login'

  const role = (profile?.role || 'lelkesz') as Role
  const master = isMasterAdmin(user.email)
  const godModeActive = master ? await hasActiveGodModeSession() : false
  const override = godModeActive ? await getActiveOverride(supabase, user.id) : { active: false }
  const effectiveCongregationId = override.congregationId || profile?.congregation_id || null

  if (effectiveCongregationId) return '/dashboard'
  if (master || role === 'admin') return '/dashboard-kerulet'
  if (role === 'egyhazkeruleti_admin') return '/dashboard-kerulet'
  if (role === 'esperes' || role === 'egyhazmegyei_admin') return '/dashboard-egyhazmegye'
  // Konyvelo / szamvevo nem rendelkezik saját congregation-nel, a hozzárendelt
  // gyülekezetek (profile_congregations) választó oldalra irányítjuk.
  if (role === 'konyvelo' || role === 'egyhazmegyei_szamvevo') return '/profile'
  return '/dashboard'
}

export const getEffectiveAccessContext = cache(async (): Promise<EffectiveAccessContext> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      supabase,
      user: null,
      userId: null,
      profile: null,
      fullName: '',
      role: 'lelkesz',
      master: false,
      admin: false,
      egyhazkeruletiAdmin: false,
      esperes: false,
      konyvelo: false,
      szamvevo: false,
      profileCongregationId: null,
      effectiveCongregationId: null,
      congregationName: null,
      congregationLogo: null,
      hasCongregation: false,
      assignedCongregations: [],
      override: { active: false },
      profileRoles: [],
      activeProfileRole: null,
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const role = (profile?.role || 'lelkesz') as Role
  const master = isMasterAdmin(user.email)
  const admin = isAdminRole(role, user.email)
  const egyhazkeruletiAdmin = isEgyhazkeruletiAdminRole(role, user.email)
  const esperes = isEsperesRole(role, user.email)
  const konyvelo = isKonyveloRole(role)
  const szamvevo = isSzamvevoRole(role)
  const profileCongregationId = profile?.congregation_id || null

  // BIZTONSÁGI: override csak aktív god mode sessionnel érvényes
  const godModeActive = master ? await hasActiveGodModeSession() : false
  const override = godModeActive ? await getActiveOverride(supabase, user.id) : { active: false }

  // FÁZIS 3 (2026-04-17): multi-role és aktív kontextus feloldás — ELSŐ a scope döntéshez
  const profileRoles = await loadProfileRoles(supabase, user.id)
  const activeProfileRole = await resolveActiveProfileRole(profileRoles, role, profileCongregationId, profile?.diocese_id || null, profile?.district_id || null)

  // 2026-04-19 BUGFIX (Endre): ha az aktív profile_role scope-ja NEM 'congregation'
  // (pl. system=admin, diocese=esperes, district=kerületi admin), akkor a gyülekezet
  // kontextust NE propagáljuk — különben az admin/esperes látná a saját
  // gyülekezete adatait ott is, ahol nem kellene.
  //
  // A fallback (activeProfileRole hiányában vagy 'congregation' scope-ban) a
  // meglévő profiles.congregation_id (+ opcionális god-mode override).
  let effectiveCongregationId: string | null
  if (activeProfileRole && activeProfileRole.scope !== 'congregation') {
    // Admin/diocese/district scope — nincs saját gyülekezet kontextus
    effectiveCongregationId = null
  } else if (activeProfileRole && activeProfileRole.scope === 'congregation' && activeProfileRole.scopeId) {
    // Explicit congregation scope — a kiválasztott gyülekezet
    effectiveCongregationId = override.congregationId || activeProfileRole.scopeId
  } else {
    // Fallback: nincs activeProfileRole, vagy a meglévő default viselkedés
    effectiveCongregationId = override.congregationId || profileCongregationId
  }

  // Konyvelo / szamvevo számára: approved hozzárendelések betöltése
  const assignedCongregations = await getAssignedCongregations(supabase, user.id, role)

  const congregation = effectiveCongregationId
    ? override.active && override.congregationId === effectiveCongregationId
      ? {
          id: override.congregationId,
          nev_hu: override.congregationName || null,
          name: override.congregationName || null,
          cimer_url: override.congregationLogo || null,
        }
      : await getCongregationSummary(supabase, effectiveCongregationId)
    : null

  return {
    supabase,
    user,
    userId: user.id,
    profile: profile ?? null,
    fullName: profile?.full_name || '',
    role,
    master,
    admin,
    egyhazkeruletiAdmin,
    esperes,
    konyvelo,
    szamvevo,
    profileCongregationId,
    effectiveCongregationId,
    congregationName: congregation?.nev_hu || congregation?.name || null,
    congregationLogo: congregation?.cimer_url || null,
    hasCongregation: !!effectiveCongregationId,
    assignedCongregations,
    override,
    profileRoles,
    activeProfileRole,
  }
})

// ---------------------------------------------------------------------------
// Multi-role helperek (Fázis 3)
// ---------------------------------------------------------------------------

async function loadProfileRoles(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ProfileRoleRow[]> {
  const { data, error } = await supabase
    .from('profile_roles')
    .select('*')
    .eq('profile_id', userId)
    .eq('approval_status', 'approved')
    .eq('active', true)
    .order('granted_at', { ascending: false })

  if (error) return []
  return (data || []) as ProfileRoleRow[]
}

async function resolveActiveProfileRole(
  profileRoles: ProfileRoleRow[],
  fallbackRole: Role,
  fallbackCongregationId: string | null,
  fallbackDioceseId: string | null,
  fallbackDistrictId: string | null,
): Promise<ActiveProfileRoleContext | null> {
  if (profileRoles.length === 0) return null

  // 1. Cookie-ból olvasunk aktív profile_role ID-t
  let cookieRoleId: string | null = null
  try {
    const cookieStore = await cookies()
    cookieRoleId = cookieStore.get(ACTIVE_PROFILE_ROLE_COOKIE)?.value || null
  } catch {
    // ignore
  }

  // 2. Ha van cookie és érvényes → használjuk azt
  if (cookieRoleId) {
    const found = profileRoles.find((r) => r.id === cookieRoleId)
    if (found) return toActiveContext(found)
  }

  // 3. Fallback: a profiles.role alapján megtaláljuk az elsődleges profile_roles sort
  const primary = profileRoles.find((r) => {
    if (r.role !== fallbackRole) return false
    // Scope egyezés a fallback ID-kkel
    if (r.scope === 'system') return true
    if (r.scope === 'district') return r.scope_id === fallbackDistrictId
    if (r.scope === 'diocese') return r.scope_id === fallbackDioceseId
    if (r.scope === 'congregation') return r.scope_id === fallbackCongregationId
    return false
  })
  if (primary) return toActiveContext(primary)

  // 4. Egyéb: az első elérhető (legfrissebb granted_at szerint rendezve)
  return toActiveContext(profileRoles[0])
}

function toActiveContext(row: ProfileRoleRow): ActiveProfileRoleContext {
  // A szerepkör-sablon + egyedi permissions egyesítve — az egyedi mindig felülírja
  const templatePerms = row.role === 'custom' ? {} : (ROLE_TEMPLATES[row.role] || {})
  const merged = mergePermissions(templatePerms, row.permissions || {})
  return {
    id: row.id,
    scope: row.scope,
    scopeId: row.scope_id,
    role: row.role,
    customLabel: row.custom_label,
    permissions: merged,
  }
}

export async function getEffectiveCongregationContext() {
  const context = await getEffectiveAccessContext()

  return {
    supabase: context.supabase,
    user: context.user,
    userId: context.userId,
    congregationId: context.effectiveCongregationId,
    fullName: context.fullName,
    role: context.role,
    master: context.master,
    admin: context.admin,
    esperes: context.esperes,
    override: context.override,
  }
}
