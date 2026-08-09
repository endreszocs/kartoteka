import 'server-only'

import { getEffectiveAccessContext, type EffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * Egyházmegyei / egyházkerületi SCOPE-feloldó helperek (2026-08-09 diagnosztika).
 *
 * HIBAOSZTÁLY, amit ez a modul megszüntet:
 *   A diocese/district felületek (dashboard-egyhazmegye, dashboard-kerulet,
 *   eves-jelentes esperesi ág, admin hozzárendelés-listák) korábban KIZÁRÓLAG a
 *   skalár `profiles.diocese_id` / `profiles.district_id` mezőből vették a
 *   hatókört, és a lekérdezéseket a "ha van id, szűrünk" mintával építették:
 *
 *     if (dioceseId && !access.master) query = query.eq('diocese_id', dioceseId)
 *
 *   Ha a skalár NULL (a szerepkör-kiosztás pipeline ezt rendszeresen előállítja:
 *   a syncProfileRoleToLegacy csak a profiles.role-t írta, az admin_activate_user
 *   pedig régen csak pending profilnál propagálta az org-mezőket), a szűrő
 *   NÉMÁN ELTŰNT, és — mivel a congregations/dioceses SELECT RLS USING(true) —
 *   az esperes az EGÉSZ EGYHÁZ összes gyülekezetét látta. Divergencia-variáns:
 *   X egyházmegye lelkésze Y egyházmegye esperesévé kinevezve a skalár szerint
 *   továbbra is X adatait látta, miközben Y nevében járt el.
 *
 * HELYES FELOLDÁSI SORREND (a lib/auth/finance-scope.ts mintája szerint):
 *   1. Az AKTÍV profile_role (access.activeProfileRole) scope_id-ja, ha a
 *      scope 'diocese' / 'district' — ez az, amiben a felhasználó ÉPPEN eljár.
 *   2. A profile_roles approved+active diocese/district sorai (több is lehet).
 *   3. A skalár profiles.diocese_id / profiles.district_id — CSAK FALLBACK.
 *
 * FAIL-CLOSED ELV: ha egy diocese/district szintű felhasználónak így SEM
 * oldható fel scope-azonosítója, a hívó felület KÖTELES üres állapotot /
 * magyarázó kártyát mutatni — SOHA nem futtathat szűretlen lekérdezést.
 * A master / rendszergazda (system admin) explicit, feliratozott ágon láthat
 * mindent — az soha nem lehet egy NULL-scope néma mellékhatása.
 */

type LevelScopeAccess = Pick<
  EffectiveAccessContext,
  | 'supabase'
  | 'user'
  | 'master'
  | 'admin'
  | 'egyhazkeruletiAdmin'
  | 'esperes'
  | 'profile'
  | 'profileRoles'
  | 'activeProfileRole'
>

export interface DioceseScopeContext {
  supabase: EffectiveAccessContext['supabase']
  user: EffectiveAccessContext['user']
  access: EffectiveAccessContext
  /**
   * A feloldott egyházmegye-azonosító (aktív szerep → profile_roles → skalár).
   * `null` = a felhasználónak NINCS feloldható egyházmegye-hatóköre →
   * a hívónak fail-closed módon kell viselkednie (üres állapot, NEM szűretlen
   * lekérdezés). Master/admin esetén is lehet null — ők a saját, feliratozott
   * "minden egyházmegye" águkon mehetnek tovább.
   */
  scopeId: string | null
  isMaster: boolean
  isAdmin: boolean
}

export interface DistrictScopeContext {
  supabase: EffectiveAccessContext['supabase']
  user: EffectiveAccessContext['user']
  access: EffectiveAccessContext
  /** Az elsődleges (aktív) egyházkerület-azonosító — null, ha nem feloldható. */
  scopeId: string | null
  /**
   * A TELJES kerület-hatókör (aktív szerep + profile_roles district sorok +
   * profiles.district_id fallback, deduplikálva; az aktív az első) — a
   * getAdminDistrictScope (lib/auth/admin-scope.ts) mintája szerint. Több
   * kerületes admin mindegyikét látja. Üres tömb = nincs hatókör → fail-closed.
   */
  districtIds: string[]
  isMaster: boolean
  isAdmin: boolean
}

/**
 * Pure feloldó: a felhasználó egyházmegye-hatóköre (union, aktív szerep elöl).
 * Sorrend: aktív diocese-szerep scope_id → profile_roles diocese sorok →
 * profiles.diocese_id skalár (fallback).
 */
export function resolveDioceseScopeIds(access: LevelScopeAccess): string[] {
  const ids: string[] = []
  const push = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (access.activeProfileRole?.scope === 'diocese') {
    push(access.activeProfileRole.scopeId)
  }
  let hasRoleScope = false
  for (const r of access.profileRoles) {
    if (r.active && r.approval_status === 'approved' && r.scope === 'diocese') {
      push(r.scope_id)
      hasRoleScope = true
    }
  }
  // 2026-08-09 (review-fix): a skalár CSAK fallback — ha van érvényes
  // egyházmegyei szerepkör-sor, a (esetleg elavult) profiles.diocese_id NEM
  // bővíti a hatókört. Enélkül egy régi, más megyéhez tartozó skalár érték a
  // szerepkör visszavonása után is hozzáférést adna.
  if (!hasRoleScope) push(access.profile?.diocese_id ?? null)
  return ids
}

/** Az elsődleges (aktív) egyházmegye-azonosító — null, ha nem feloldható. */
export function resolveDioceseScopeId(access: LevelScopeAccess): string | null {
  return resolveDioceseScopeIds(access)[0] ?? null
}

/**
 * Pure feloldó: a felhasználó egyházkerület-hatóköre (union, aktív szerep elöl).
 * Sorrend: aktív district-szerep scope_id → profile_roles district sorok →
 * profiles.district_id skalár (fallback).
 */
export function resolveDistrictScopeIds(access: LevelScopeAccess): string[] {
  const ids: string[] = []
  const push = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (access.activeProfileRole?.scope === 'district') {
    push(access.activeProfileRole.scopeId)
  }
  let hasRoleScope = false
  for (const r of access.profileRoles) {
    if (r.active && r.approval_status === 'approved' && r.scope === 'district') {
      push(r.scope_id)
      hasRoleScope = true
    }
  }
  // 2026-08-09 (review-fix): a skalár CSAK fallback (lásd a megyei párját).
  if (!hasRoleScope) push(access.profile?.district_id ?? null)
  return ids
}

/** Az elsődleges (aktív) egyházkerület-azonosító — null, ha nem feloldható. */
export function resolveDistrictScopeId(access: LevelScopeAccess): string | null {
  return resolveDistrictScopeIds(access)[0] ?? null
}

/**
 * Egyházmegyei scope-kontextus szerver akciókhoz / oldalakhoz.
 *
 * Használat (a fail-closed minta):
 *   const ctx = await getDioceseScopeContext()
 *   if (ctx.isMaster) { … szűretlen, feliratozott master-ág … }
 *   else if (ctx.scopeId) { query = query.eq('diocese_id', ctx.scopeId) }
 *   else if (ctx.isAdmin) { … szűretlen, feliratozott admin-ág … }
 *   else return []   // ← SOHA nem szűretlen lekérdezés!
 */
export async function getDioceseScopeContext(): Promise<DioceseScopeContext> {
  const access = await getEffectiveAccessContext()
  return {
    supabase: access.supabase,
    user: access.user,
    access,
    scopeId: access.user ? resolveDioceseScopeId(access) : null,
    isMaster: access.master,
    isAdmin: access.admin,
  }
}

/**
 * Egyházkerületi scope-kontextus szerver akciókhoz / oldalakhoz.
 * A `districtIds` a teljes hatókör (több kerület is lehet) — listaszűréshez;
 * a `scopeId` az elsődleges (hero-cím, alapértelmezett nézet).
 */
export async function getDistrictScopeContext(): Promise<DistrictScopeContext> {
  const access = await getEffectiveAccessContext()
  const districtIds = access.user ? resolveDistrictScopeIds(access) : []
  return {
    supabase: access.supabase,
    user: access.user,
    access,
    scopeId: districtIds[0] ?? null,
    districtIds,
    isMaster: access.master,
    isAdmin: access.admin,
  }
}
