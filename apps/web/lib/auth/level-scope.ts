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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2026-08-11 (számvevő-kör) — KÉT MEGYEI SZINT: OLVASÓ és ÍRÓ
 * ─────────────────────────────────────────────────────────────────────────────
 * TÜNET VOLT: az `egyhazmegyei_szamvevo` belépett a megyei felületre, és ÜRES
 * képernyőt kapott. Az ok egy néma réteg-divergencia:
 *   · az APP (`resolveDioceseScopeIds`, lentebb) BÁRMELY jóváhagyott,
 *     aktív `diocese` hatókörű `profile_roles` sort elfogadott — a számvevőét is,
 *   · az ADATBÁZIS (`current_user_diocese_ids()`) viszont CSAK az
 *     `esperes` / `egyhazmegyei_admin` szerepűeket adta vissza.
 * Az app tehát feloldott egy egyházmegyét, lefuttatta rá a lekérdezéseket, az
 * RLS pedig 0 sort adott vissza — hibaüzenet nélkül.
 *
 * A TULAJDONOS DÖNTÉSE: „segítsük hogy tudja használni a felületet!" → az
 * adatbázist tágítjuk (migration-docs/sql/2026-08-11-szamvevo-megyei-
 * hozzaferes.sql). DE a számvevő dolga pénzügyi ELLENŐRZÉS, ezért CSAK
 * OLVASÁST kap. Az SQL-oldalon ez két külön feloldó függvény:
 *   · `current_user_diocese_ids()`        → ÍRÁSI hatókör (esperes, megyei admin)
 *   · `current_user_diocese_olvaso_ids()` → OLVASÁSI hatókör (+ számvevő)
 *
 * EZ A MODUL UGYANEZT A KÉT SZINTET TÜKRÖZI, hogy a két réteg soha többé ne
 * húzzon szét:
 *   · `resolveDioceseReadScopeIds`  ⇄ current_user_diocese_olvaso_ids()
 *   · `resolveDioceseWriteScopeIds` ⇄ current_user_diocese_ids()
 * A `canWriteDioceseScope()` az a kapu, amivel a felület a MENTŐ gombokat
 * letiltja — hogy a számvevő ELŐRE lássa, mit nem tehet, ne pedig egy néma
 * 0-soros mentés után.
 *
 * ⚠️ A `custom` (és `konyvelo` / `lelkesz`) szerepű `diocese` sorok EGYIK
 *    szintre sem kerülnek be — pontosan úgy, ahogy az SQL sem engedi be őket.
 *    A `custom` jelentése a `permissions` JSONB-ben él, amit az RLS nem tud
 *    értelmezni; beengedésük korlátlan tágítás lenne. Aki megyei rálátást kap,
 *    kapjon NEVESÍTETT `egyhazmegyei_szamvevo` szerepkör-sort.
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
  /**
   * 2026-08-15 (S1 biztonsági szelet, 0.3): SZEREP-SZŰRT megyei hatókörök.
   *
   * MIÉRT KÉT KÜLÖN MEZŐ A `scopeId` MELLETT: a `scopeId` a TÁG feloldóból
   * (resolveDioceseScopeIds) jön, ami szerep-SZŰRETLEN és skalár-fallbackes —
   * MEGJELENÍTÉSRE (hero-cím) még jó, de LISTASZŰRÉSRE nem: egy kerületi
   * admin ELAVULT `profiles.diocese_id` skalárral (akár MÁSIK kerület
   * megyéje!) diocese-szerepkör nélkül is kapott rajta feloldott megyét, és
   * azon át MÁS MEGYE adatait látta. A hívók listaszűrésre KIZÁRÓLAG ezt a
   * két szerep-szűrt mezőt használhatják — pontosan azt a szerep-listát
   * tükrözik, amit az adatbázis kanonikus függvényei
   * (current_user_diocese_olvaso_ids / current_user_diocese_ids) engednek,
   * így az app és az RLS nem húzhat szét. Üres tömb = nincs hatókör →
   * fail-closed (üres állapot, SOHA nem szűretlen lekérdezés).
   */
  readScopeIds: string[]
  /** Szerep-szűrt ÍRÁSI megyei hatókör (esperes / egyházmegyei admin) — lásd a readScopeIds kommentjét. */
  writeScopeIds: string[]
  isMaster: boolean
  isAdmin: boolean
  /**
   * 2026-08-11 (számvevő-kör): írhat-e a hívó ezen a megyei hatókörön?
   * `false` = ellenőri (számvevői) nézet — az adatbázis is csak olvasást enged
   * (lásd a modul fejlécét). A felület KÖTELES a mentő/elbíráló gombokat ELŐRE
   * letiltani, magyarázattal — nem néma 0-soros mentés után hibázni.
   */
  canWrite: boolean
  /**
   * Beszédes magyar magyarázat, ha `canWrite === false` — tooltipre, letiltott
   * gomb feliratára és szerver-oldali `{ error }`-ra egyaránt alkalmas.
   * `null`, ha a hívó írhat.
   */
  readOnlyReason: string | null
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

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-11 (számvevő-kör): OLVASÓ és ÍRÓ megyei hatókör — az SQL tükörképe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ÍRÁSI megyei szerepek — pontosan az a lista, amit a
 * `current_user_diocese_ids()` szerep-szűrője használ (2026-08-11-globalis-
 * hozzaferes-szukites.sql:824). Ha ez a két lista széthúz, visszatér a néma
 * 0-soros mentés hibaosztálya.
 */
const DIOCESE_WRITE_ROLES: readonly string[] = ['esperes', 'egyhazmegyei_admin']

/**
 * OLVASÁSI megyei szerepek = az írók + a számvevő (ellenőr).
 * Az SQL párja: `current_user_diocese_olvaso_ids()`.
 */
const DIOCESE_READ_ROLES: readonly string[] = [
  ...DIOCESE_WRITE_ROLES,
  'egyhazmegyei_szamvevo',
]

/**
 * Közös feloldó a két szinthez. PONTOSAN azt a három szabályt követi, amit az
 * SQL-oldali függvények:
 *   (a) az AKTÍV szerep számít elsőként, ha `diocese` hatókörű ÉS a szerepe
 *       benne van az engedélyezett listában;
 *   (b) SZEREP-SZŰRT visszaadás a `profile_roles` sorokból;
 *   (c) SZEREP-FÜGGETLEN skalár-elnyomás: ha van BÁRMILYEN érvényes `diocese`
 *       sor, a (esetleg elavult) `profiles.diocese_id` NEM bővíti a hatókört —
 *       különben egy visszavont szerep melletti régi skalár tovább nyitna.
 */
function resolveDioceseIdsForRoles(
  access: LevelScopeAccess,
  allowedRoles: readonly string[],
): string[] {
  const ids: string[] = []
  const push = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }

  // (a) aktív szerep
  if (
    access.activeProfileRole?.scope === 'diocese' &&
    allowedRoles.includes(access.activeProfileRole.role)
  ) {
    push(access.activeProfileRole.scopeId)
  }

  // (b) profile_roles sorok — és közben (c) a szerep-FÜGGETLEN elnyomás jelzése
  let hasAnyDioceseRow = false
  for (const r of access.profileRoles) {
    if (!r.active || r.approval_status !== 'approved' || r.scope !== 'diocese') continue
    if (r.scope_id) hasAnyDioceseRow = true
    if (allowedRoles.includes(r.role)) push(r.scope_id)
  }

  // (c) skalár tartalék — csak ha EGYÁLTALÁN nincs megyei szerepkör-sor
  if (!hasAnyDioceseRow && access.profile?.role && allowedRoles.includes(access.profile.role)) {
    push(access.profile.diocese_id ?? null)
  }

  return ids
}

/**
 * A hívó ÍRÁSI megyei hatóköre (esperes / egyházmegyei admin).
 * Az SQL párja: `current_user_diocese_ids()`.
 */
export function resolveDioceseWriteScopeIds(access: LevelScopeAccess): string[] {
  return resolveDioceseIdsForRoles(access, DIOCESE_WRITE_ROLES)
}

/**
 * A hívó OLVASÁSI megyei hatóköre (írók + egyházmegyei számvevő).
 * Az SQL párja: `current_user_diocese_olvaso_ids()`.
 */
export function resolveDioceseReadScopeIds(access: LevelScopeAccess): string[] {
  return resolveDioceseIdsForRoles(access, DIOCESE_READ_ROLES)
}

/**
 * Van-e a hívónak megyei OLVASÁSI jogosultsága? Ezt használja a megyei felület
 * belépő-kapuja a korábbi `(!esperes && !admin && !master)` feltétel helyett.
 *
 * SZIGORÚAN BŐVÍTÉS a régihez képest: aki eddig beléphetett, ezután is belép
 * (`access.esperes` az `isEsperesRole()` eredménye, ami lefedi az `esperes`,
 * `egyhazmegyei_admin`, `egyhazkeruleti_admin`, `admin` és master eseteket) —
 * ÚJ csak a `profile_roles`-alapú egyházmegyei számvevő.
 */
export function canReadDioceseScope(access: LevelScopeAccess): boolean {
  if (access.master || access.admin || access.egyhazkeruletiAdmin || access.esperes) return true
  return resolveDioceseReadScopeIds(access).length > 0
}

/**
 * Írhat-e a hívó megyei szinten?
 *
 * `access.esperes` az `isEsperesRole()` eredménye: lefedi az `esperes`,
 * `egyhazmegyei_admin`, `egyhazkeruleti_admin`, `admin` és master szerepeket
 * (skalár láb). Mellé a `profile_roles` láb kell, mert egy „profile_roles-only"
 * esperesnek a skalárja `lelkesz` is lehet.
 *
 * 2026-08-11 (számvevő-kör, review-fix): OPCIONÁLIS `dioceseId` paraméter.
 * ─────────────────────────────────────────────────────────────────────────
 * MIÉRT KELL: van, aki EGYSZERRE esperes az A megyében és SZÁMVEVŐ a B-ben.
 * A hatókör-FÜGGETLEN változat rá `true`-t ad — vagyis a B megye felületén
 * úgy tűnne, hogy írhat, pedig ott csak ellenőr. Ha a hívó megmondja, MELYIK
 * megyéről van szó, a szerep-szűrt `profile_roles` láb arra a megyére szűr.
 * A paraméter NÉLKÜLI hívás viselkedése VÁLTOZATLAN (a meglévő hívók —
 * dashboard-egyhazmegye/page.tsx, document-actions.ts, actions.ts — nem
 * változnak).
 */
export function canWriteDioceseScope(
  access: LevelScopeAccess,
  dioceseId?: string | null,
): boolean {
  // Szint-FÜGGETLEN írási jog (rendszergazda / kerületi admin) — nincs megyéhez kötve.
  if (access.master || access.admin || access.egyhazkeruletiAdmin) return true
  // Skalár esperes / megyei admin: a SAJÁT (profiles.diocese_id) megyéjére ír.
  if (access.esperes && (!dioceseId || access.profile?.diocese_id === dioceseId)) return true
  const ids = resolveDioceseWriteScopeIds(access)
  return dioceseId ? ids.includes(dioceseId) : ids.length > 0
}

/**
 * Miért nem írhat a hívó — LELKÉSZ-BARÁT magyar szöveg, tegezve.
 * `null`, ha írhat.
 *
 * Ugyanez a szöveg megy a letiltott gomb tooltipjébe ÉS a szerver akció
 * `{ error }`-ába, hogy a felhasználó ugyanazt olvassa mindkét helyen.
 *
 * 2026-08-11 (review-fix): a `dioceseId` opcionális — ha megadod, a
 * `canWriteDioceseScope` ugyanarra a megyére szűrve dönt (lásd ott).
 */
export function describeDioceseWriteBlock(
  access: LevelScopeAccess,
  dioceseId?: string | null,
): string | null {
  if (canWriteDioceseScope(access, dioceseId)) return null
  if (resolveDioceseReadScopeIds(access).length > 0) {
    return (
      'Számvevőként (ellenőrként) az egyházmegye adatait megtekintheted és kinyomtathatod, ' +
      'de nem módosíthatod. Az iratok átvétele, véglegesítése, visszaküldése, a kérelmek ' +
      'elbírálása és a pénzügyi rögzítés (bevétel, kiadás, költségvetés, számadás-zárás) az ' +
      'esperes vagy az egyházmegyei adminisztrátor feladata. Ha úgy látod, hogy javítani kell ' +
      'valamit, jelezd nekik — az ellenőrzés és a rögzítés szándékosan két külön kézben van.'
    )
  }
  return (
    'Ehhez a művelethez egyházmegyei (esperesi vagy egyházmegyei adminisztrátori) ' +
    'jogosultság kell. Ha úgy gondolod, hogy neked járna, kérd a rendszergazdától.'
  )
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
 *
 * ÍRÁS ELŐTT (2026-08-11, számvevő-kör):
 *   if (!ctx.canWrite) return { error: ctx.readOnlyReason! }
 */
export async function getDioceseScopeContext(): Promise<DioceseScopeContext> {
  const access = await getEffectiveAccessContext()
  const canWrite = access.user ? canWriteDioceseScope(access) : false
  return {
    supabase: access.supabase,
    user: access.user,
    access,
    scopeId: access.user ? resolveDioceseScopeId(access) : null,
    // 2026-08-15 (S1, 0.3): listaszűrésre a hívók KIZÁRÓLAG ezt a két
    // szerep-szűrt mezőt használhatják (lásd a mezők JSDoc-ját) — a tág
    // `scopeId` csak megjelenítésre való.
    readScopeIds: access.user ? resolveDioceseReadScopeIds(access) : [],
    writeScopeIds: access.user ? resolveDioceseWriteScopeIds(access) : [],
    isMaster: access.master,
    isAdmin: access.admin,
    canWrite,
    readOnlyReason: canWrite ? null : describeDioceseWriteBlock(access),
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
