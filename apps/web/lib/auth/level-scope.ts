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
   *
   * ⚠️ 2026-08-15 (kerületi S1): ez a mező SZEREP-SZŰRETLEN (lásd
   * `resolveDistrictScopeIds` JSDoc-ját). MEGJELENÍTÉSRE (hero-cím) való.
   * LISTASZŰRÉSRE a `readScopeIds` / `writeScopeIds` mezőket használd.
   */
  districtIds: string[]
  /**
   * 2026-08-15 (kerületi S1): SZEREP-SZŰRT kerületi OLVASÁSI hatókör.
   * Pontosan azt a szerep-listát tükrözi, amit az adatbázis kanonikus
   * `current_user_district_olvaso_ids()` függvénye enged, így az app és az RLS
   * nem húzhat szét. Üres tömb = nincs hatókör → fail-closed (üres állapot,
   * SOHA nem szűretlen lekérdezés).
   */
  readScopeIds: string[]
  /** Szerep-szűrt kerületi ÍRÁSI hatókör — lásd a readScopeIds kommentjét. */
  writeScopeIds: string[]
  isMaster: boolean
  isAdmin: boolean
  /**
   * Írhat-e a hívó ezen a kerületi hatókörön? `false` = ellenőri (számvevői)
   * nézet. A felület KÖTELES a mentő/elbíráló gombokat ELŐRE letiltani,
   * magyarázattal — nem néma 0-soros mentés után hibázni.
   */
  canWrite: boolean
  /**
   * Beszédes magyar magyarázat, ha `canWrite === false` — tooltipre, letiltott
   * gomb feliratára és szerver-oldali `{ error }`-ra egyaránt alkalmas.
   * `null`, ha a hívó írhat.
   */
  readOnlyReason: string | null
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
 *
 * ⚠️ 2026-08-15 (kerületi S1): EZ A FELOLDÓ SZEREP-SZŰRETLEN — bármely
 * `district` hatókörű `profile_roles` sor (akár `custom`, `lelkesz`,
 * `konyvelo`) kerületi hatókörnek számít. Az adatbázis kanonikus
 * `current_user_district_ids()` függvénye viszont KIZÁRÓLAG az
 * `egyhazkeruleti_admin` szerepűeket adja vissza. Ez pontosan az a
 * réteg-divergencia, ami a megyei számvevőnél ÜRES KÉPERNYŐT okozott
 * hibaüzenet nélkül (az app feloldott egy hatókört, az RLS 0 sort adott rá).
 *
 * ⇒ LISTASZŰRÉSRE EZT NE HASZNÁLD. Használd a lentebbi szerep-szűrt párokat:
 *   · `resolveDistrictReadScopeIds`  ⇄ current_user_district_olvaso_ids()
 *   · `resolveDistrictWriteScopeIds` ⇄ current_user_district_ids()
 * Ez a tág változat MEGJELENÍTÉSRE (hero-cím, alapértelmezett nézet) marad —
 * pontosan úgy, ahogy a megyei `resolveDioceseScopeIds` párja.
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

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-15 (EGYHÁZKERÜLETI S1): OLVASÓ és ÍRÓ kerületi hatókör — az SQL tükre
// ─────────────────────────────────────────────────────────────────────────────
//
// Ez a blokk a fenti megyei blokk (DIOCESE_WRITE_ROLES / DIOCESE_READ_ROLES /
// resolveDioceseIdsForRoles) BETŰHŰ tükörképe, a 3. szintre. Azért betűhű, mert
// a projekt visszatérő hibaosztálya éppen az, hogy „a második felület a régi
// implementációt őrzi": ha a kerületi ág önálló, kicsit másképp működő logikát
// kapna, a két szint idővel némán széthúzna.
//
// A KÉT SZINT INDOKA (a megyei számvevő-kör tanulsága):
//   · az ÍRÓ a kerület hivatalos ügyvivője (egyházkerületi adminisztrátor),
//   · az OLVASÓ mellé fér a kerületi SZÁMVEVŐ (ellenőr), aki megnézhet és
//     kinyomtathat mindent, de nem rögzít és nem bírál el.
// Az ellenőrzés és a rögzítés SZÁNDÉKOSAN két külön kézben van.

/**
 * ÍRÁSI kerületi szerepek — pontosan az a lista, amit az adatbázis kanonikus
 * `current_user_district_ids()` függvényének szerep-szűrője használ
 * (2026-08-11-globalis-hozzaferes-szukites.sql:888). Ha ez a két lista
 * széthúz, visszatér a néma 0-soros mentés hibaosztálya.
 */
const DISTRICT_WRITE_ROLES: readonly string[] = ['egyhazkeruleti_admin']

/**
 * OLVASÁSI kerületi szerepek = az írók + a kerületi számvevő (ellenőr).
 * Az SQL párja: `current_user_district_olvaso_ids()` (a kerületi S1 SQL hozza
 * létre, az `current_user_diocese_olvaso_ids()` mintájára).
 */
const DISTRICT_READ_ROLES: readonly string[] = [
  ...DISTRICT_WRITE_ROLES,
  'egyhazkeruleti_szamvevo',
]

/**
 * Közös feloldó a két kerületi szinthez — a `resolveDioceseIdsForRoles`
 * betűhű párja. PONTOSAN azt a három szabályt követi, amit az SQL:
 *   (a) az AKTÍV szerep számít elsőként, ha `district` hatókörű ÉS a szerepe
 *       benne van az engedélyezett listában;
 *   (b) SZEREP-SZŰRT visszaadás a `profile_roles` sorokból;
 *   (c) SZEREP-FÜGGETLEN skalár-elnyomás: ha van BÁRMILYEN érvényes `district`
 *       sor, a (esetleg elavult) `profiles.district_id` NEM bővíti a hatókört —
 *       különben egy visszavont szerep melletti régi skalár tovább nyitna.
 *       Ez a `current_user_district_ids()` `barmely_keruleti_sor` CTE-je.
 */
function resolveDistrictIdsForRoles(
  access: LevelScopeAccess,
  allowedRoles: readonly string[],
): string[] {
  const ids: string[] = []
  const push = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }

  // (a) aktív szerep
  if (
    access.activeProfileRole?.scope === 'district' &&
    allowedRoles.includes(access.activeProfileRole.role)
  ) {
    push(access.activeProfileRole.scopeId)
  }

  // (b) profile_roles sorok — és közben (c) a szerep-FÜGGETLEN elnyomás jelzése
  let hasAnyDistrictRow = false
  for (const r of access.profileRoles) {
    if (!r.active || r.approval_status !== 'approved' || r.scope !== 'district') continue
    if (r.scope_id) hasAnyDistrictRow = true
    if (allowedRoles.includes(r.role)) push(r.scope_id)
  }

  // (c) skalár tartalék — csak ha EGYÁLTALÁN nincs kerületi szerepkör-sor
  if (!hasAnyDistrictRow && access.profile?.role && allowedRoles.includes(access.profile.role)) {
    push(access.profile.district_id ?? null)
  }

  return ids
}

/**
 * A hívó ÍRÁSI kerületi hatóköre (egyházkerületi adminisztrátor).
 * Az SQL párja: `current_user_district_ids()`.
 */
export function resolveDistrictWriteScopeIds(access: LevelScopeAccess): string[] {
  return resolveDistrictIdsForRoles(access, DISTRICT_WRITE_ROLES)
}

/**
 * A hívó OLVASÁSI kerületi hatóköre (írók + egyházkerületi számvevő).
 * Az SQL párja: `current_user_district_olvaso_ids()`.
 */
export function resolveDistrictReadScopeIds(access: LevelScopeAccess): string[] {
  return resolveDistrictIdsForRoles(access, DISTRICT_READ_ROLES)
}

/**
 * Van-e a hívónak kerületi OLVASÁSI jogosultsága? EZT hívja a kerületi felület
 * belépő-kapuja a korábbi puszta `access.egyhazkeruletiAdmin` feltétel helyett.
 *
 * MIÉRT NEM AZ `egyhazkeruletiAdmin` MEZŐT BŐVÍTETTÜK KI (a brief két
 * lehetőséget kínált):
 * ─────────────────────────────────────────────────────────────────────────
 * Az `access.egyhazkeruletiAdmin` KIZÁRÓLAG a `profiles.role` skalárból jön
 * (effective-access.ts). Kézenfekvő lett volna `profile_roles` district-lábat
 * adni neki — DE ez a mező kb. két tucat helyen dönt, és köztük olyanokban is,
 * amelyek NEM kerületi hatókörre vonatkoznak:
 *   · `canWriteDioceseScope()` (uo. feljebb) `true`-t ad rá — hatókör nélkül,
 *     BÁRMELYIK egyházmegyére;
 *   · az admin-override („Belépés a gyülekezetbe") engedélyezése;
 *   · `getAdminDistrictScope()` belépő-feltétele.
 * A mező kibővítése tehát nem a kerületi kaput nyitná ki, hanem EGYSZERRE
 * tágítana egy tucat, egymástól független jogosultságot — pontosan az a fajta
 * néma tágítás, amit a projekt már kétszer megszenvedett.
 *
 * Ezért a SZŰK megoldást választottuk: a `profile_roles` district-láb ott
 * kapcsolódik be, ahol tényleg kell — a kerületi kapukban, ezen a függvényen
 * keresztül. A `egyhazkeruletiAdmin` mező viselkedése BYTE-RA VÁLTOZATLAN.
 *
 * SZIGORÚAN BŐVÍTÉS a régihez képest: aki eddig beléphetett (skalár kerületi
 * admin, rendszergazda, master), ezután is belép — ÚJ csak a `profile_roles`
 * alapú kerületi admin és a kerületi számvevő.
 */
export function canReadDistrictScope(access: LevelScopeAccess): boolean {
  if (access.master || access.admin || access.egyhazkeruletiAdmin) return true
  return resolveDistrictReadScopeIds(access).length > 0
}

/**
 * Írhat-e a hívó kerületi szinten?
 *
 * `access.egyhazkeruletiAdmin` az `isEgyhazkeruletiAdminRole()` eredménye:
 * lefedi az `egyhazkeruleti_admin`, `admin` és master szerepeket (skalár láb).
 * Mellé kell a `profile_roles` láb, mert egy „profile_roles-only" kerületi
 * adminnak a skalárja akár `lelkesz` is lehet.
 *
 * OPCIONÁLIS `districtId` paraméter — a megyei párjával azonos okból: van, aki
 * EGYSZERRE kerületi adminisztrátor az egyikben és SZÁMVEVŐ a másikban. A
 * hatókör-FÜGGETLEN változat rá `true`-t adna, vagyis a második kerület
 * felületén úgy tűnne, hogy írhat, pedig ott csak ellenőr.
 */
export function canWriteDistrictScope(
  access: LevelScopeAccess,
  districtId?: string | null,
): boolean {
  // Szint-FÜGGETLEN írási jog (rendszergazda / master) — nincs kerülethez kötve.
  if (access.master || access.admin) return true
  // Skalár kerületi admin: a SAJÁT (profiles.district_id) kerületére ír.
  if (
    access.egyhazkeruletiAdmin &&
    (!districtId || access.profile?.district_id === districtId)
  ) {
    return true
  }
  const ids = resolveDistrictWriteScopeIds(access)
  return districtId ? ids.includes(districtId) : ids.length > 0
}

/**
 * Miért nem írhat a hívó kerületi szinten — LELKÉSZ-BARÁT magyar szöveg,
 * tegezve. `null`, ha írhat.
 *
 * Ugyanez a szöveg megy a letiltott gomb tooltipjébe ÉS a szerver akció
 * `{ error }`-ába, hogy a felhasználó ugyanazt olvassa mindkét helyen.
 */
export function describeDistrictWriteBlock(
  access: LevelScopeAccess,
  districtId?: string | null,
): string | null {
  if (canWriteDistrictScope(access, districtId)) return null
  if (resolveDistrictReadScopeIds(access).length > 0) {
    return (
      'Kerületi számvevőként (ellenőrként) az egyházkerület adatait megtekintheted és ' +
      'kinyomtathatod, de nem módosíthatod. Az egyházmegyék felterjesztéseinek átvétele, ' +
      'visszaküldése, a feloldás-kérések elbírálása és a kerületi pénzügyi rögzítés az ' +
      'egyházkerületi adminisztrátor feladata. Ha úgy látod, hogy javítani kell valamit, ' +
      'jelezd neki — az ellenőrzés és a rögzítés szándékosan két külön kézben van.'
    )
  }
  return (
    'Ehhez a művelethez egyházkerületi adminisztrátori jogosultság kell. ' +
    'Ha úgy gondolod, hogy neked járna, kérd a rendszergazdától.'
  )
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
 *
 * Használat (a fail-closed minta, a megyei párjával azonos):
 *   const ctx = await getDistrictScopeContext()
 *   if (ctx.isMaster) { … szűretlen, feliratozott master-ág … }
 *   else if (ctx.readScopeIds.length) { query = query.in('district_id', ctx.readScopeIds) }
 *   else if (ctx.isAdmin) { … szűretlen, feliratozott admin-ág … }
 *   else return []   // ← SOHA nem szűretlen lekérdezés!
 *
 * ÍRÁS ELŐTT:
 *   if (!ctx.canWrite) return { error: ctx.readOnlyReason! }
 *
 * ⚠️ A `districtIds` / `scopeId` MEGJELENÍTÉSRE való (szerep-szűretlen);
 *    listaszűrésre KIZÁRÓLAG a `readScopeIds` / `writeScopeIds` használható.
 */
export async function getDistrictScopeContext(): Promise<DistrictScopeContext> {
  const access = await getEffectiveAccessContext()
  const districtIds = access.user ? resolveDistrictScopeIds(access) : []
  const canWrite = access.user ? canWriteDistrictScope(access) : false
  return {
    supabase: access.supabase,
    user: access.user,
    access,
    scopeId: districtIds[0] ?? null,
    districtIds,
    readScopeIds: access.user ? resolveDistrictReadScopeIds(access) : [],
    writeScopeIds: access.user ? resolveDistrictWriteScopeIds(access) : [],
    isMaster: access.master,
    isAdmin: access.admin,
    canWrite,
    readOnlyReason: canWrite ? null : describeDistrictWriteBlock(access),
  }
}
