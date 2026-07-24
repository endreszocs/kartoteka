import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

type JsonObject = Record<string, unknown>

export interface StaffAccessRequestState {
  hasProfile: boolean
  profileStatus: string | null
  isActiveStaff: boolean
  hasAccessRequest: boolean
  accessRequestStatus: string | null
}

export type StaffAccessRequestStateResult =
  | { ok: true; state: StaffAccessRequestState }
  | { ok: false }

function asJsonObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function isMissingSelfStateRpc(code: string | undefined): boolean {
  return code === 'PGRST202' || code === '42883'
}

async function loadLegacyOwnStaffState(
  supabase: SupabaseClient,
): Promise<StaffAccessRequestStateResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return { ok: false }

  const byUser = await supabase
    .from('access_requests')
    .select('status')
    .eq('resulting_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byUser.error) return { ok: false }

  let ownRequest = byUser.data
  if (!ownRequest && user.email) {
    const byVerifiedEmail = await supabase
      .from('access_requests')
      .select('status')
      .eq('email', user.email.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (byVerifiedEmail.error) return { ok: false }
    ownRequest = byVerifiedEmail.data
  }

  return {
    ok: true,
    state: {
      hasProfile: Boolean(profile),
      profileStatus: profile?.status ?? null,
      isActiveStaff: profile?.status === 'active',
      hasAccessRequest: Boolean(ownRequest),
      accessRequestStatus: ownRequest?.status ?? null,
    },
  }
}

/**
 * A bejelentkezett staff/pending felhasználó saját állapota.
 *
 * Az RPC nem fogad e-mail-paramétert: az auth.uid() alapján, adatbázison belül
 * oldja fel a saját profilt és hozzáférési kérelmet. Így ezt a helper-t nem
 * lehet más felhasználók e-mail-/státusz-enumerálására használni.
 */
export async function loadStaffAccessRequestState(
  supabase: SupabaseClient,
): Promise<StaffAccessRequestStateResult> {
  const { data, error } = await supabase.rpc('staff_my_access_request_state')

  if (error) {
    // Expand/contract rollout: kizárólag addig használjuk a korábbi,
    // hitelesített sajátprofil-olvasást, amíg az új self-only RPC még
    // nincs telepítve. E-mailt nem fogadunk paraméterként; az esetleges
    // fallback-cím kizárólag auth.getUser() ellenőrzött saját e-mailje.
    // Jogosultsági vagy futási hibát nem kerülünk meg.
    if (isMissingSelfStateRpc(error.code)) {
      console.warn(
        '[auth] A staff sajátállapot-RPC még nem érhető el; átmeneti sajátprofil-olvasás fut.',
      )
      return loadLegacyOwnStaffState(supabase)
    }
    console.error('[auth] A saját hozzáférési állapot lekérése sikertelen:', error.message)
    return { ok: false }
  }

  const root = asJsonObject(data)
  if (
    !root ||
    typeof root.has_profile !== 'boolean' ||
    typeof root.is_active_staff !== 'boolean' ||
    typeof root.has_access_request !== 'boolean'
  ) {
    console.error('[auth] A saját hozzáférési állapot válasza érvénytelen.')
    return { ok: false }
  }

  const profile = asJsonObject(root.profile)
  const accessRequest = asJsonObject(root.access_request)

  return {
    ok: true,
    state: {
      hasProfile: root.has_profile,
      profileStatus: typeof profile?.status === 'string' ? profile.status : null,
      isActiveStaff: root.is_active_staff,
      hasAccessRequest: root.has_access_request,
      accessRequestStatus:
        typeof accessRequest?.status === 'string' ? accessRequest.status : null,
    },
  }
}

/**
 * Egységes belépés-utáni döntés a Google/OAuth és az e-mail+jelszó flow-ban.
 *
 * Visszatérés:
 *   - 'home'           → DB-live aktív profil: mehet a /valassz-profilt-ra.
 *   - 'complete'       → hitelesített, nem aktív felhasználó, akinek még nincs
 *                        hozzáférési kérelme: /oauth-complete.
 *   - 'pending'        → van már hozzáférési kérelme, vagy az állapot biztonságosan
 *                        nem ellenőrizhető: kijelentkeztetés, jóváhagyásra vár.
 *   - 'not_registered' → csak OAuth-ágnál: nincs saját hozzáférési kérelem.
 *
 * A döntés nem olvassa közvetlenül a profiles/access_requests táblákat, és nem
 * keres e-mail alapján kliensoldali paraméterrel. A DB-live állapotot kizárólag
 * a self-only staff_my_access_request_state() RPC szolgáltatja.
 */
export type PostLoginDestination = 'home' | 'complete' | 'pending' | 'not_registered'

export async function resolvePostLoginDestination(
  supabase: SupabaseClient,
  _user: { id: string; email?: string | null },
  opts?: { via?: 'oauth' | 'password' },
): Promise<PostLoginDestination> {
  const result = await loadStaffAccessRequestState(supabase)

  // Fail closed: ismeretlen adatbázis-állapotból nem engedünk dashboard-hozzáférést,
  // és nem mutatunk új kérelmi űrlapot sem.
  if (!result.ok) return 'pending'

  if (result.state.isActiveStaff) return 'home'
  if (result.state.hasAccessRequest) return 'pending'

  if (opts?.via === 'oauth') return 'not_registered'
  return 'complete'
}
