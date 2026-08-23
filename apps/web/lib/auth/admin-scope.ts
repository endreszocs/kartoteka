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
 * PostgREST `.in()` biztonságos darabmérete.
 *
 * HIBAOSZTÁLY (2026-08-16): a `.in()` szűrő az URL-be kerül; kb. 100 azonosító
 * fölött a proxy 414-gyel eldobja a kérést — a hívó tehát NEM nulla sort kap,
 * hanem HIBÁT. Egy kerületben több száz gyülekezet is lehet, ezért minden
 * gyülekezet-azonosítós szűrőt DARABOLNI kell.
 *
 * Közös konstans, hogy a két felület (hozzárendelés-listázó és
 * szerepkör-listázó) ne húzzon némán szét egy későbbi hangoláskor.
 */
export const IN_SZURO_DARAB = 80

/** Azonosító-lista feldarabolása `.in()`-barát darabokra (414-védelem). */
export function darabolIdListat(ids: string[], meret: number = IN_SZURO_DARAB): string[][] {
  const biztosMeret = Math.max(1, Math.floor(meret))
  const darabok: string[][] = []
  for (let i = 0; i < ids.length; i += biztosMeret) {
    darabok.push(ids.slice(i, i + biztosMeret))
  }
  return darabok
}

/**
 * Egy hatókör-feloldás EREDMÉNYE — a puszta tömb helyett.
 *
 * 2026-08-22 (4. pont): a `getScopedDioceseIds` / `getScopedCongregationIds`
 * KÉT gyökeresen különböző okra adta ugyanazt az üres tömböt:
 *   (a) a kerületi adminnak nincs beállított egyházkerülete → tényleg nem lát
 *       semmit (ez FAIL-CLOSED, helyes);
 *   (b) a feloldó LEKÉRDEZÉS HIBÁZOTT → nem tudjuk, mit láthatna.
 *
 * A hívó a kettőt nem tudta megkülönböztetni, ezért a (b) esetben is NÉMA ÜRES
 * LISTÁT mutatott: „nincs hozzárendelés" — miközben a valóság az volt, hogy
 * „nem tudjuk". Ez a projekt visszatérő, már kétszer megfizetett hibaosztálya
 * (lásd `effective-access.ts` → `profileRolesFeloldhato`, illetve a
 * megjelenítési hatókör `fail_closed` indoka).
 *
 * A régi, tömböt adó exportok VÁLTOZATLANUL működnek (vékony burkolók), hogy a
 * meglévő ~10 hívóhely viselkedése egy betűt se mozduljon.
 */
export interface ScopedIdsResult {
  /** Az azonosítók. `null` = KORLÁTLAN (master / teljes admin). */
  ids: string[] | null
  /** `false` → a hatókört NEM tudtuk feloldani (a lekérdezés hibázott). */
  feloldhato: boolean
  /** Miért ez az eredmény — ebből tud a hívó beszédes üzenetet írni. */
  indok: 'korlatlan' | 'nincs_kerulet' | 'feloldva' | 'lekerdezes_hiba'
  /** A feloldó lekérdezés hibaüzenete (csak `lekerdezes_hiba` esetén). */
  hiba?: string
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
 * A hatókörbe eső egyházmegye-azonosítók — MEGKÜLÖNBÖZTETHETŐ eredménnyel.
 * A „nincs kerülete" és a „a lekérdezés hibázott" eset NEM ugyanaz.
 */
export async function getScopedDioceseIdsResult(access: ScopeAccess): Promise<ScopedIdsResult> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return { ids: null, feloldhato: true, indok: 'korlatlan' }
  if (scope.districtIds.length === 0) return { ids: [], feloldhato: true, indok: 'nincs_kerulet' }

  const { data, error } = await access.supabase
    .from('dioceses')
    .select('id')
    .in('district_id', scope.districtIds)

  if (error) return { ids: [], feloldhato: false, indok: 'lekerdezes_hiba', hiba: error.message }
  return { ids: (data ?? []).map((d) => d.id as string), feloldhato: true, indok: 'feloldva' }
}

/**
 * A hatókörbe eső gyülekezet-azonosítók — MEGKÜLÖNBÖZTETHETŐ eredménnyel.
 * A „nincs kerülete" és a „a lekérdezés hibázott" eset NEM ugyanaz.
 */
export async function getScopedCongregationIdsResult(access: ScopeAccess): Promise<ScopedIdsResult> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return { ids: null, feloldhato: true, indok: 'korlatlan' }
  if (scope.districtIds.length === 0) return { ids: [], feloldhato: true, indok: 'nincs_kerulet' }

  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, dioceses!inner(district_id)')
    .in('dioceses.district_id', scope.districtIds)

  if (error) return { ids: [], feloldhato: false, indok: 'lekerdezes_hiba', hiba: error.message }
  return {
    ids: (data ?? []).map((c) => (c as { id: string }).id),
    feloldhato: true,
    indok: 'feloldva',
  }
}

/**
 * A hatókörbe eső egyházmegye-azonosítók. `null` = korlátlan (minden).
 * Üres tömb = a kerületi adminnak nincs beállított kerülete → semmit nem lát.
 *
 * ⚠️ Ez a burkoló ELNYELI a „nem tudjuk" esetet (hibánál is üres tömböt ad).
 * ÚJ hívóhelyen a `getScopedDioceseIdsResult`-ot használd, és írj ki hibát.
 */
export async function getScopedDioceseIds(access: ScopeAccess): Promise<string[] | null> {
  return (await getScopedDioceseIdsResult(access)).ids
}

/**
 * A hatókörbe eső gyülekezet-azonosítók. `null` = korlátlan (minden).
 * Üres tömb = nincs beállított kerület → semmit nem lát.
 *
 * ⚠️ Ez a burkoló ELNYELI a „nem tudjuk" esetet (hibánál is üres tömböt ad).
 * ÚJ hívóhelyen a `getScopedCongregationIdsResult`-ot használd, és írj ki hibát.
 */
export async function getScopedCongregationIds(access: ScopeAccess): Promise<string[] | null> {
  return (await getScopedCongregationIdsResult(access)).ids
}

/**
 * A hatókörbe eső AKTÍV felhasználók azonosító-halmaza. `null` = korlátlan.
 * Broadcast-célzás utószűréséhez: a kerületi admin bármilyen célzás mellett is
 * csak a saját egyházkerülete tagjait érheti el. A tagság forrásai: közvetlen
 * district_id, közvetlen diocese_id, vagy a kerület gyülekezeteinek tagsága.
 */
export async function getScopedActiveUserIds(access: ScopeAccess): Promise<Set<string> | null> {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return null
  const ids = new Set<string>()
  if (scope.districtIds.length === 0) return ids

  const [scopedDioceseIds, scopedCongIds] = await Promise.all([
    getScopedDioceseIds(access),
    getScopedCongregationIds(access),
  ])

  const { data: byDistrict } = await access.supabase
    .from('profiles')
    .select('id')
    .eq('status', 'active')
    .in('district_id', scope.districtIds)
  for (const r of byDistrict ?? []) ids.add((r as { id: string }).id)

  if (scopedDioceseIds && scopedDioceseIds.length > 0) {
    const { data: byDiocese } = await access.supabase
      .from('profiles')
      .select('id')
      .eq('status', 'active')
      .in('diocese_id', scopedDioceseIds)
    for (const r of byDiocese ?? []) ids.add((r as { id: string }).id)
  }

  if (scopedCongIds && scopedCongIds.length > 0) {
    const { data: byCong } = await access.supabase
      .from('profiles')
      .select('id')
      .eq('status', 'active')
      .in('congregation_id', scopedCongIds)
    for (const r of byCong ?? []) ids.add((r as { id: string }).id)
  }

  return ids
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
    .select('email, district_id, congregations:congregation_id(dioceses:diocese_id(district_id))')
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
  if (districtId && scope.districtIds.includes(districtId)) return

  // Pending (gyülekezet nélküli) felhasználó: a regisztrációs kérelem KÉRT
  // egyházkerülete dönt — a kerületi admin csak a saját kerületébe jelentkezőt
  // hagyhatja jóvá / utasíthatja el.
  //
  // BIZTONSÁGI FIX 2026-08-11 (#13): a korábbi ág a cél profil e-mail-címét NYERSEN
  // adta át az `ilike`-nak. A PostgREST `ilike`-ban az `_` és a `%` JOKER, ráadásul
  // `order(created_at desc) + limit 1` miatt a LEGÚJABB illeszkedő sor nyert. Egy „A"
  // kerületi admin tehát a publikus /hozzaferes-kerese űrlapon beküldhetett egy
  // `nagyXpeter@ref.ro` kérelmet `requested_district_id = A`-val, és ezzel hatókört
  // szerzett a „B" kerületi `nagy_peter@ref.ro` fölé — onnan pedig nyílt a deleteUser
  // (anonimizálás + belépés-tiltás), a rejectPendingUser, az updateUserRole és a
  // quickApproveUser. Ez pontosan a fájl fejlécében rögzített döntést („más kerületet
  // NE is lásson") ütötte ki.
  //
  // Elsődlegesen ezért a SZÖVEGES e-mail helyett a `resulting_user_id` FK-n
  // párosítunk (a publikus kérelem-beszúrás óta minden sorban ki van töltve —
  // hozzaferes-kerese/actions.ts, oauth-complete/actions.ts, access-requests-actions.ts),
  // és csak ha az nem hoz találatot (régi, még nem visszatöltött sorok), esünk vissza
  // az e-mailes keresésre — ott is escape-elt mintával ÉS pontos, kisbetűs
  // egyenlőség-újraellenőrzéssel.
  const { data: reqById } = await access.supabase
    .from('access_requests')
    .select('requested_district_id')
    .eq('resulting_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const reqDistById =
    (reqById as { requested_district_id?: string | null } | null)?.requested_district_id ?? null
  if (reqDistById && scope.districtIds.includes(reqDistById)) return

  const email = ((data as { email?: string | null }).email || '').trim().toLowerCase()
  if (email) {
    const pattern = email.replace(/[\\%_]/g, (m) => `\\${m}`)
    const { data: reqRows } = await access.supabase
      .from('access_requests')
      .select('email, requested_district_id')
      .ilike('email', pattern)
      .order('created_at', { ascending: false })
      .limit(20)
    const exact = ((reqRows || []) as Array<{ email?: string | null; requested_district_id?: string | null }>)
      .find((r) => (r.email || '').trim().toLowerCase() === email)
    const reqDist = exact?.requested_district_id ?? null
    if (reqDist && scope.districtIds.includes(reqDist)) return
  }

  throw new Error('Ehhez a felhasználóhoz nincs jogosultsága (másik egyházkerület).')
}

/** Dob, ha a megadott egyházkerület NEM esik az admin hatókörébe. */
export function assertDistrictInScope(access: ScopeAccess, districtId: string | null): void {
  const scope = getAdminDistrictScope(access)
  if (scope.unrestricted) return
  if (!districtId || !scope.districtIds.includes(districtId)) {
    throw new Error('Ehhez az egyházkerülethez nincs jogosultsága.')
  }
}

/**
 * Dob, ha a megadott (scope, scopeId) cél NEM esik az admin hatókörébe.
 * Szerepkör-kiosztáshoz/visszavonáshoz. A 'system' szint csak korlátlan
 * (master/teljes) adminnak engedélyezett.
 */
export async function assertScopeTargetInScope(
  access: ScopeAccess,
  scope: 'system' | 'district' | 'diocese' | 'congregation',
  scopeId: string | null,
): Promise<void> {
  const adminScope = getAdminDistrictScope(access)
  if (adminScope.unrestricted) return
  if (scope === 'system') {
    throw new Error('Rendszerszintű (admin) szerepkört csak a fő rendszergazda kezelhet.')
  }
  if (scope === 'district') return assertDistrictInScope(access, scopeId)
  if (scope === 'diocese') return assertDioceseInScope(access, scopeId ?? '')
  return assertCongregationInScope(access, scopeId ?? '')
}
