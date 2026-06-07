import 'server-only'

import type { EffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Egyházkerületi admin hatókör-korlátozás (#2, 2026-06-07).
 *
 * Az `egyhazkeruleti_admin` csak a SAJÁT egyházkerülete adatait láthatja és
 * módosíthatja. A master és a teljes (system) admin korlátlan — náluk minden
 * helper "unrestricted"-et ad / nem dob.
 *
 * Az adat-lánc: congregations.diocese_id → dioceses.id, dioceses.district_id →
 * districts.id. A kerületi admin hatóköre a `profile_roles` district-scope
 * sorai (több kerület is lehet) + a `profiles.district_id` fallback.
 *
 * Döntések (rögzítve): más kerületet NE is lásson; több kerület → mindegyik;
 * a wipe csak master/teljes adminé (külön kezelve a hívási helyen).
 */

// A helperek elfogadják a teljes effective-access kontextust (az AdminAccessResult
// is ezt terjeszti ki), így a guard-választól függetlenül használhatók.
type ScopeAccess = Pick<
  EffectiveAccessContext,
  'supabase' | 'master' | 'admin' | 'egyhazkeruletiAdmin' | 'profileRoles' | 'profile'
>

export interface AdminDistrictScope {
  /** true → master vagy teljes (system) admin: nincs korlátozás. */
  unrestricted: boolean
  /** Az egyházkerület-azonosítók, amelyekhez a kerületi admin hozzáfér. */
  districtIds: string[]
}

/**
 * Megállapítja az admin hatókörét. Master/teljes admin → korlátlan. Kerületi
 * admin → a district-scope szerepkörei (+ profile.district_id fallback).
 * Bárki más → korlátozott, üres hatókörrel (semmit nem lát).
 */
export function getAdminDistrictScope(access: ScopeAccess): AdminDistrictScope {
  if (access.master || access.admin) {
    return { unrestricted: true, districtIds: [] }
  }
  if (!access.egyhazkeruletiAdmin) {
    return { unrestricted: false, districtIds: [] }
  }
  const ids = new Set<string>()
  for (const r of access.profileRoles) {
    if (r.scope === 'district' && r.scope_id) ids.add(r.scope_id)
  }
  if (access.profile?.district_id) ids.add(access.profile.district_id)
  return { unrestricted: false, districtIds: [...ids] }
}

/**
 * A hatókörbe eső egyházmegye-azonosítók. `null` = korlátlan (minden).
 * Üres tömb = a kerületi adminnak nincs beállított kerülete → semmit nem lát.
 */
export async function getScopedDioceseIds(access: ScopeAccess): Promise<string[] | null> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return null
  if (scope.districtIds.length === 0) return []

  const { data, error } = await access.supabase
    .from('dioceses')
    .select('id')
    .in('district_id', scope.districtIds)

  if (error) return []
  return (data ?? []).map((d) => d.id as string)
}

/**
 * A hatókörbe eső gyülekezet-azonosítók. `null` = korlátlan (minden).
 * Üres tömb = nincs beállított kerület → semmit nem lát.
 */
export async function getScopedCongregationIds(access: ScopeAccess): Promise<string[] | null> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return null
  if (scope.districtIds.length === 0) return []

  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, dioceses!inner(district_id)')
    .in('dioceses.district_id', scope.districtIds)

  if (error) return []
  return (data ?? []).map((c) => (c as { id: string }).id)
}

function pickDistrictId(diocesesRel: unknown): string | null {
  if (!diocesesRel) return null
  if (Array.isArray(diocesesRel)) {
    return (diocesesRel[0] as { district_id?: string | null })?.district_id ?? null
  }
  return (diocesesRel as { district_id?: string | null }).district_id ?? null
}

/**
 * Dob, ha a megadott gyülekezet NEM esik az admin hatókörébe. Master/teljes
 * admin esetén soha nem dob. Használat: minden gyülekezetet érintő MUTÁCIÓ elején.
 */
export async function assertCongregationInScope(
  access: ScopeAccess,
  congregationId: string,
): Promise<void> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return
  if (scope.districtIds.length === 0) {
    throw new Error('Ehhez a gyülekezethez nincs jogosultsága.')
  }

  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, dioceses!inner(district_id)')
    .eq('id', congregationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const districtId = pickDistrictId((data as { dioceses?: unknown } | null)?.dioceses)
  if (!data || !districtId || !scope.districtIds.includes(districtId)) {
    throw new Error('Ehhez a gyülekezethez nincs jogosultsága (másik egyházkerület).')
  }
}

/**
 * Dob, ha a megadott egyházmegye NEM esik az admin hatókörébe. Master/teljes
 * admin esetén soha nem dob.
 */
export async function assertDioceseInScope(
  access: ScopeAccess,
  dioceseId: string,
): Promise<void> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return
  if (scope.districtIds.length === 0) {
    throw new Error('Ehhez az egyházmegyéhez nincs jogosultsága.')
  }

  const { data, error } = await access.supabase
    .from('dioceses')
    .select('district_id')
    .eq('id', dioceseId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const districtId = (data as { district_id?: string | null } | null)?.district_id ?? null
  if (!districtId || !scope.districtIds.includes(districtId)) {
    throw new Error('Ehhez az egyházmegyéhez nincs jogosultsága (másik egyházkerület).')
  }
}

/**
 * Dob, ha a megadott (cél) felhasználó NEM esik az admin hatókörébe.
 *
 * A felhasználó kerülete: a `profiles.district_id`, vagy ha az hiányzik, a
 * gyülekezete egyházmegyéjén keresztül (congregation → diocese → district).
 * Pending (még gyülekezet nélküli) felhasználónál a hívó oldalon az
 * access_request kért kerületét kell ellenőrizni — lásd assertDistrictInScope.
 */
export async function assertUserInScope(
  access: ScopeAccess,
  userId: string,
): Promise<void> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return
  if (scope.districtIds.length === 0) {
    throw new Error('Ehhez a felhasználóhoz nincs jogosultsága.')
  }

  const { data, error } = await access.supabase
    .from('profiles')
    .select('district_id, congregations:congregation_id(dioceses:diocese_id(district_id))')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('A felhasználó nem található.')

  let districtId = (data as { district_id?: string | null }).district_id ?? null
  if (!districtId) {
    const congRel = (data as { congregations?: unknown }).congregations
    const cong = Array.isArray(congRel) ? congRel[0] : congRel
    districtId = pickDistrictId((cong as { dioceses?: unknown } | null)?.dioceses)
  }

  if (!districtId || !scope.districtIds.includes(districtId)) {
    throw new Error('Ehhez a felhasználóhoz nincs jogosultsága (másik egyházkerület).')
  }
}

/** Dob, ha a megadott egyházkerület NEM esik az admin hatókörébe. */
export function assertDistrictInScope(access: ScopeAccess, districtId: string | null): void {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return
  if (!districtId || !scope.districtIds.includes(districtId)) {
    throw new Error('Ehhez az egyházkerülethez nincs jogosultsága.')
  }
}
