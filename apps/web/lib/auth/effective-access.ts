import { createClient } from '@/lib/supabase/server'
import {
  isAdminRole,
  isEgyhazkeruletiAdminRole,
  isEsperesRole,
  isKonyveloRole,
  isKnownRole,
  isMasterAdmin,
  isSzamvevoRole,
} from '@/lib/auth/roles'
import type { Profile, Role } from '@/lib/types/auth'
import type { Permissions, ProfileRoleRow, ProfileRoleScope, ProfileRoleType } from '@/lib/profile-roles/types'
import { ROLE_TEMPLATES, mergePermissions } from '@/lib/profile-roles/permissions'
import { GOD_MODE_COOKIE, verifyGodModeCookieValue } from '@/lib/auth/god-mode-session'
import { cache } from 'react'
import { cookies } from 'next/headers'

// Cookie neve az aktív profile_role azonosítójához
const ACTIVE_PROFILE_ROLE_COOKIE = 'kartoteka_active_profile_role'

/**
 * Csak akkor aktiválható admin override, ha a master admin aktív god mode
 * sessionben van. Ez megakadályozza, hogy egy deactivate után ott maradt
 * (expirálatlan) admin_access_requests sor automatikusan átléptessen egy
 * új sessionben.
 *
 * 2026-08-15 (8. pont D): a süti értéke HMAC-aláírt és a felhasználóhoz
 * kötött (god-mode-session.ts) — a kliens által beírt nyers epoch többé nem
 * elég. Örökölt/aláíratlan érték: érvénytelen (fail-closed).
 */
async function hasActiveGodModeSession(userId: string): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const cookie = cookieStore.get(GOD_MODE_COOKIE)
    return verifyGodModeCookieValue(cookie?.value, userId) !== null
  } catch {
    return false
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type CongregationSummary = {
  id: string
  nev_hu: string | null
  name: string | null
  /**
   * 2026-08-23 (kisebb rések, 1.): a gyülekezet HIVATALOS ROMÁN neve
   * (`congregations.nev_ro`) — a román nyomtatványok (Registru inventar, Lista
   * de inventariere, Registru Casa…) fejlécébe.
   *
   * MIÉRT KELLETT IDE: a 6. pont a megyei és a kerületi szint román nevét
   * bekötötte, a GYÜLEKEZETIT viszont nem — mert az egyetlen forrás, ez a
   * lekérés, `nev_ro`-t nem olvasott. A `module-scope.ts` gyülekezeti ága ezért
   * hardkódolt `null`-t adott, és a gyülekezeti leltár-ív ROMÁN fejléce magyar
   * maradt.
   *
   * ⚠️ CSAK FELIRAT — jogosultságról soha nem dönt, és a hiánya SEM tilt: üres
   * román névnél a magyar áll a lapon EGYEDÜL, sablon-kiegészítés nélkül
   * (kitalált román nevet aláírható iratra SOHA nem írunk).
   */
  nev_ro: string | null
  cimer_url: string | null
  /** A gyülekezet egyházmegyéjének neve (header-chip secondary felirathoz). */
  diocese_name: string | null
}

type OverrideRow = {
  congregation_id: string
  expires_at: string | null
  congregations: CongregationSummary | CongregationSummary[] | null
}

type RedirectProfile = {
  role?: string | null
  congregation_id?: string | null
} | null

/**
 * A `getActiveOverride` hatókör-újraellenőrzéséhez szükséges minimális kontextus
 * (az `admin-scope.ts` ScopeAccess-ének megfelelő részhalmaz). Külön típus, hogy
 * ne kelljen a még össze nem állított `EffectiveAccessContext`-et átadni.
 */
type OverrideScopeAccess = Pick<
  EffectiveAccessContext,
  'supabase' | 'master' | 'admin' | 'egyhazkeruletiAdmin' | 'profileRoles' | 'profile'
>

export interface EffectiveOverrideInfo {
  active: boolean
  congregationId?: string
  congregationName?: string
  /** 2026-08-23 (kisebb rések, 1.): a belépett gyülekezet ROMÁN neve — enélkül a
   *  „Belépés a gyülekezetbe" úton a román ívek fejléce némán magyar maradna,
   *  miközben a rendes gyülekezeti úton már kétnyelvű. Két úton EGY viselkedés. */
  congregationNameRo?: string | null
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
  // 2026-07-10 (S4-avatar): user_metadata is átjön (futásidőben mindig a teljes
  // Supabase User van itt) — a header-avatár a metadata avatar_url/picture-ből él.
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null
  userId: string | null
  profile: Profile | null
  fullName: string
  role: Role
  master: boolean
  /**
   * A profil `status` mezője `'active'` — VAGY a fő rendszergazdáról van szó.
   *
   * 2026-09-04 (P0·2): ez a mező hordozza azt a feltételt, amitől az összes
   * lenti származtatott jog (`admin`, `egyhazkeruletiAdmin`, `esperes`,
   * `konyvelo`, `szamvevo`) függ. Külön mezőként azért van itt, hogy a hívó
   * meg tudja KÜLÖNBÖZTETNI a „nincs joga" és a „még nincs jóváhagyva"
   * esetet — a `role` szándékosan változatlan marad, hogy a `/pending` oldal
   * továbbra is meg tudja mutatni, milyen szerepkört kért a felhasználó.
   */
  statusActive: boolean
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
  /**
   * 2026-08-23 (kisebb rések, 1.): a gyülekezet HIVATALOS ROMÁN neve
   * (`congregations.nev_ro`), `null`, ha nincs rögzítve.
   *
   * A név a FELSŐ szinteken a `module-scope.ts` / `finance-scope.ts`
   * `scopeNameRo` mezőjén át jut a nyomtatványokhoz; a gyülekezeti ág eddig
   * itt szakadt meg (ez a lekérés `nev_ro`-t nem olvasott), ezért a gyülekezeti
   * román leltár-fejléc magyar maradt.
   *
   * ⚠️ CSAK FELIRAT: jogosultságról soha nem dönt, és a hiánya SEM tilt.
   */
  congregationNameRo: string | null
  congregationLogo: string | null
  /** A gyülekezet egyházmegyéjének neve (header chip secondary felirathoz). */
  congregationDioceseName: string | null
  hasCongregation: boolean
  /** Approved profile_congregations sorok (csak konyvelo / szamvevo szerepkör esetén nem üres). */
  assignedCongregations: AssignedCongregation[]
  override: EffectiveOverrideInfo
  /** A profil aktív, de nincs érvényes elsődleges szerepkör rendelve hozzá. */
  missingPrimaryRole: boolean
  /** Minden approved profile_roles sor (multi-role, 2026-04-17) */
  profileRoles: ProfileRoleRow[]
  /**
   * SIKERÜLT-E EGYÁLTALÁN BEOLVASNI a `profile_roles` sorokat (2026-08-11).
   *
   * ⚠️ MIÉRT KELL KÜLÖN MEZŐ. A `profileRoles: []` és az `activeProfileRole: null`
   * KÉT, GYÖKERESEN MÁS dolgot jelenthet:
   *   (a) „bizonyítottan nincs sora" — a felhasználó még nem kapott multi-role
   *       sorokat, tehát a jogosultsága MAGA az aktív kontextus,
   *   (b) „nem tudtuk beolvasni" — tranziens Supabase/RLS-hiba a lekérdezésen.
   * A `loadProfileRoles` korábban MINDKETTŐRE `[]`-t adott, és a hívók az (a)
   * ágat feltételezték. Egy pillanatnyi olvasási hiba így NÉMÁN TÁGÍTOTT: a
   * megjelenítési hatókör visszaesett a jogosultságira, vagyis a tulajdonos a
   * barátosi profiljában újra 784 hatókört és idegen gyülekezet-neveket látott
   * volna — pontosan az a „hiba esetén tágabb jog" hibaosztály, amit a projekt
   * már megszenvedett.
   *
   * `false` = NEM TUDJUK. Aki hatókört számol belőle, fail-closed ágra menjen.
   */
  profileRolesFeloldhato: boolean
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

  // 2026-08-23 (kisebb rések, 1.): a `nev_ro` IS jön. Az oszlop a `congregations`
  // táblában 2026-07 óta létezik (a welcome-varázsló és a gyülekezeti alapadat-
  // szerkesztő is írja), tehát ez nem „még nem futott le az SQL" eset.
  const { data } = await supabase
    .from('congregations')
    .select('id, nev_hu, name, nev_ro, cimer_url, dioceses:diocese_id(name)')
    .eq('id', congregationId)
    .maybeSingle()

  if (!data) return null

  // A `dioceses` lehet objektum vagy tömb (a Supabase relációs select néha tömböt ad vissza)
  const diocesesRel = (data as { dioceses?: { name?: string | null } | { name?: string | null }[] | null }).dioceses
  const dioceseName = diocesesRel
    ? Array.isArray(diocesesRel)
      ? diocesesRel[0]?.name ?? null
      : diocesesRel.name ?? null
    : null

  return {
    id: data.id as string,
    nev_hu: (data.nev_hu as string | null) ?? null,
    name: (data.name as string | null) ?? null,
    // Üres/whitespace-only érték = NINCS román név (a fejléc-építők ilyenkor a
    // magyart írják ki egyedül) — a `''` némán „van, csak üres"-nek látszana.
    nev_ro: ((data.nev_ro as string | null) ?? '').trim() || null,
    cimer_url: (data.cimer_url as string | null) ?? null,
    diocese_name: dioceseName,
  }
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
  scopeAccess: OverrideScopeAccess,
): Promise<EffectiveOverrideInfo> {
  const { data } = await supabase
    .from('admin_access_requests')
    .select('congregation_id, expires_at, congregations(id, nev_hu, name, nev_ro, cimer_url)')
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

  // 2026-08-11 (#14): a hatókört a sor FELHASZNÁLÁSAKOR is újra kikényszerítjük.
  // Az `enterCongregation` ugyan ellenőriz belépéskor, de az `admin_access_requests`
  // sor 2 óráig él, és a kerületi admin hatóköre közben elveszhet (szerepkör-
  // visszavonás, kerület-átsorolás) — vagy a sor a lelkészi jóváhagyó ágon
  // keletkezett. Fail-closed: ha a gyülekezet nem esik az admin hatókörébe,
  // az override egyszerűen nem aktív.
  try {
    const { assertCongregationInScope } = await import('@/lib/auth/admin-scope')
    await assertCongregationInScope(scopeAccess, overrideRow.congregation_id)
  } catch {
    return { active: false }
  }

  const congregation = pickCongregation(overrideRow.congregations)

  return {
    active: true,
    congregationId: overrideRow.congregation_id,
    congregationName: congregation?.nev_hu || congregation?.name || 'Ismeretlen',
    // ⚠️ A román névnek NINCS „Ismeretlen" tartaléka: kitalált/helykitöltő román
    // szöveg hivatalos, aláírható iratra nem kerülhet. Hiányzik → `null`.
    congregationNameRo: (congregation?.nev_ro ?? '').trim() || null,
    congregationLogo: congregation?.cimer_url || null,
    remainingMinutes: calculateRemainingMinutes(overrideRow.expires_at),
    expiresAt: overrideRow.expires_at,
  }
}

export async function resolvePostAuthRedirectPath(
  _supabase: SupabaseServerClient,
  user: { id: string; email?: string | null } | null,
  profile: RedirectProfile,
): Promise<string> {
  if (!user) return '/login'

  const master = isMasterAdmin(user.email)
  if (!master && !isKnownRole(profile?.role)) return '/pending?reason=no-role'
  return '/'
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
      statusActive: false,
      admin: false,
      egyhazkeruletiAdmin: false,
      esperes: false,
      konyvelo: false,
      szamvevo: false,
      profileCongregationId: null,
      effectiveCongregationId: null,
      congregationName: null,
      congregationNameRo: null,
      congregationLogo: null,
      congregationDioceseName: null,
      hasCongregation: false,
      assignedCongregations: [],
      override: { active: false },
      missingPrimaryRole: false,
      profileRoles: [],
      // Nincs bejelentkezett felhasználó — nem hiba, hanem bizonyítottan üres.
      profileRolesFeloldhato: true,
      activeProfileRole: null,
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const master = isMasterAdmin(user.email)
  const hasPrimaryRole = isKnownRole(profile?.role)
  const missingPrimaryRole = Boolean(profile && !master && !hasPrimaryRole)
  const role = (hasPrimaryRole ? profile.role : 'lelkesz') as Role

  // ══════════════════════════════════════════════════════════════════════════
  // STÁTUSZ-KAPU (2026-09-04, P0·2) — a jóváhagyás az API-n is kapu, nem csak
  // a felületen.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ AMI ROSSZ VOLT: a származtatott jogok KIZÁRÓLAG a `profiles.role`
  //    értékéből jöttek (`const admin = isAdminRole(role, user.email)`), a
  //    `profiles.status` megkérdezése nélkül. A státusz-kapu csak a
  //    `(dashboard)/layout.tsx:144-148`-ban élt — az viszont OLDAL-renderelést
  //    kapuz, NEM szerver-akciót. A Next.js szerver-akció önálló POST-végpont:
  //    a layout soha nem fut le előtte. Egy `status='pending'` profil tehát a
  //    teljes `/admin` szerver-akció felületet elérte, holott a felületet magát
  //    sosem látta volna.
  //
  // ⛔ MIÉRT VOLT EZ SÚLYOS: az élő `handle_new_user()` trigger a regisztráló
  //    metaadatából tölti a `profiles.role`-t (lásd a 2026-09-03-i
  //    felülvizsgálat P0·1-ét), a `status` viszont fixen `'pending'`. A
  //    `'pending'` tehát PONTOSAN az a fék, ami a metaadat-injektálást
  //    ártalmatlanná tenné — csak épp senki nem húzta be az alkalmazásban.
  //
  // ✅ MIÉRT ITT, EGY HELYEN: `access.admin`-t 74 hely olvassa, az
  //    `egyhazkeruletiAdmin`-t 41. Ha a kaput a hívókba tennénk, a következő
  //    új hívási hely megint kifelejtené. A származtatott jog KELETKEZÉSÉNÉL
  //    zárva a kérdés fel sem merül a hívónál.
  //
  // ✅ MIÉRT NEM ZÁR KI SENKIT: a `(dashboard)/layout.tsx:145` és a
  //    `(setup)/layout.tsx:53` már ma is `status='active'`-ot követel
  //    (a `master` kivételével) — aki nem aktív, az MA SEM tud dolgozni.
  //    Ez a változás tehát nem szűkít, hanem a felületi szabályt kiterjeszti
  //    az API-ra is.
  //
  // ⚠️ A `role` SZÁNDÉKOSAN VÁLTOZATLAN MARAD: a `/pending` oldal abból
  //    mutatja meg, milyen szerepkört kért a felhasználó. Csak a származtatott
  //    JOG esik el, az igény nem.
  const statusActive = master || profile?.status === 'active'

  const admin = statusActive && isAdminRole(role, user.email)
  const egyhazkeruletiAdmin = statusActive && isEgyhazkeruletiAdminRole(role, user.email)
  const esperes = statusActive && isEsperesRole(role, user.email)
  const konyvelo = statusActive && isKonyveloRole(role)
  const szamvevo = statusActive && isSzamvevoRole(role)
  const profileCongregationId = profile?.congregation_id || null

  // FÁZIS 3 (2026-04-17): multi-role és aktív kontextus feloldás — ELSŐ a scope döntéshez
  //
  // 2026-08-11: a betöltés `null`-t ad, ha a lekérdezés HIBÁZOTT (lásd
  // `profileRolesFeloldhato` a kontextus-típusban). A `profileRoles` marad üres
  // tömb a meglévő fogyasztóknak, de a „nem tudjuk" tényt külön mező hordozza.
  const profileRolesBetoltve = missingPrimaryRole ? [] : await loadProfileRoles(supabase, user.id)
  const profileRolesFeloldhato = profileRolesBetoltve !== null
  const profileRoles = profileRolesBetoltve ?? []
  const activeProfileRole = missingPrimaryRole
    ? null
    : await resolveActiveProfileRole(
        profileRoles,
        role,
        profileCongregationId,
        profile?.diocese_id || null,
        profile?.district_id || null,
      )

  // BIZTONSÁGI: a master admin override-ja továbbra is CSAK aktív god mode
  // sessionnel érvényes (lásd a hasActiveGodModeSession docblockját).
  //
  // 2026-08-11 (#14) FIX: eddig ez volt az EGYETLEN feltétel, ezért a
  // `admin_access_requests` táblát a master+god mode páron kívül SENKI nem
  // fogyasztotta. Következmény: a kerületi admin „Belépés a gyülekezetbe" gombja
  // `{success:true}`-t és „2 órás hozzáférés jött létre" üzenetet adott, de az
  // `effectiveCongregationId` sosem változott; a lelkészi jóváhagyáson alapuló
  // (consent) hozzáférés-kérés teljes folyamata — értesítés, jóváhagyás, e-mail —
  // szintén hatástalan volt. Mostantól a teljes (system) admin és az egyházkerületi
  // admin override-ja is érvényes, a hatókört pedig a `getActiveOverride`
  // gyülekezetenként ÚJRA ellenőrzi (fail-closed).
  const godModeActive = master ? await hasActiveGodModeSession(user.id) : false
  const overrideAllowed =
    !missingPrimaryRole && (master ? godModeActive : admin || egyhazkeruletiAdmin)
  const override = overrideAllowed
    ? await getActiveOverride(supabase, user.id, {
        supabase,
        master,
        admin,
        egyhazkeruletiAdmin,
        profileRoles,
        profile: profile ?? null,
      })
    : { active: false }

  // 2026-04-19 BUGFIX (Endre): ha az aktív profile_role scope-ja NEM 'congregation'
  // (pl. system=admin, diocese=esperes, district=kerületi admin), akkor a gyülekezet
  // kontextust NE propagáljuk — különben az admin/esperes látná a saját
  // gyülekezete adatait ott is, ahol nem kellene.
  //
  // A fallback (activeProfileRole hiányában vagy 'congregation' scope-ban) a
  // meglévő profiles.congregation_id (+ opcionális god-mode override).
  let effectiveCongregationId: string | null
  if (missingPrimaryRole) {
    effectiveCongregationId = null
  } else if (override.active && override.congregationId) {
    // 2026-08-11 (#14): az AKTÍV admin-override MINDEN más szabályt megelőz.
    // Enélkül a kerületi/teljes admin belépése akkor is hatástalan maradt volna,
    // ha az override-sor létrejön: az aktív profile_role scope-ja ugyanis
    // 'district'/'system', amire a következő ág `null`-t adna — pontosan ezért
    // tűnt „sikeresnek, de semmit nem csinálónak" a Belépés a gyülekezetbe.
    // A sor hatókörét a getActiveOverride már újraellenőrizte.
    effectiveCongregationId = override.congregationId
  } else if (activeProfileRole && activeProfileRole.scope !== 'congregation') {
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
  const assignedCongregations = missingPrimaryRole
    ? []
    : await getAssignedCongregations(supabase, user.id, role)

  const congregation = effectiveCongregationId
    ? override.active && override.congregationId === effectiveCongregationId
      ? {
          id: override.congregationId,
          nev_hu: override.congregationName || null,
          name: override.congregationName || null,
          // 2026-08-23 (kisebb rések, 1.): a `getActiveOverride` már beolvassa —
          // enélkül az admin-override úton a román fejléc némán magyar maradna.
          nev_ro: override.congregationNameRo || null,
          cimer_url: override.congregationLogo || null,
          diocese_name: null,
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
    statusActive,
    admin,
    egyhazkeruletiAdmin,
    esperes,
    konyvelo,
    szamvevo,
    profileCongregationId,
    effectiveCongregationId,
    congregationName: congregation?.nev_hu || congregation?.name || null,
    congregationNameRo: congregation?.nev_ro || null,
    congregationLogo: congregation?.cimer_url || null,
    congregationDioceseName: congregation?.diocese_name || null,
    hasCongregation: !!effectiveCongregationId,
    assignedCongregations,
    override,
    missingPrimaryRole,
    profileRoles,
    profileRolesFeloldhato,
    activeProfileRole,
  }
})

// ---------------------------------------------------------------------------
// Multi-role helperek (Fázis 3)
// ---------------------------------------------------------------------------

/**
 * @returns a sorok listája, vagy `null`, ha a lekérdezés HIBÁZOTT.
 *
 * ⚠️ A `null` és a `[]` KÜLÖNBÖZŐ: az üres tömb bizonyíték („nincs sora"), a
 * `null` a „nem tudjuk" jelzés. Korábban mindkettő `[]` volt, és aki hatókört
 * számolt belőle, hiba esetén a TÁGABB (jogosultsági) ágra futott.
 */
async function loadProfileRoles(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ProfileRoleRow[] | null> {
  const { data, error } = await supabase
    .from('profile_roles')
    .select('*')
    .eq('profile_id', userId)
    .eq('approval_status', 'approved')
    .eq('active', true)
    .order('granted_at', { ascending: false })

  if (error) {
    console.error('[effective-access] a profile_roles nem olvasható:', error.message)
    return null
  }
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
