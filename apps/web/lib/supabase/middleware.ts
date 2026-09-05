import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_MODE_COOKIE } from '@/lib/auth/session-mode'

// Lelkészi auth útvonalak — bejelentkezett usernek nem kell ide visszamennie
const PASTOR_AUTH_ROUTES = ['/login', '/forgot-password', '/oauth-complete', '/auth/callback']

// Publikus auth-related útvonalak — anonim user is elérheti (pl. hozzáférés-kérő űrlap).
// A `(public)` Next.js route-group NEM jelenik meg a pathname-ben, ezért szükség
// van explicit whitelistre. (2026-05-01: a `/login` page-en a "Kérjen hozzáférést"
// gomb mutatott ide, de a middleware visszairányított /login-ra → loop.)
//
// 2026-05-18: a `/reset-password` IS publikus, mert a Supabase recovery-email
// linkjére kattintáskor a user (még) nincs bejelentkezve, és a middleware
// különben /login-ra dobta volna át a query stringgel együtt
// (`?error=access_denied&error_code=otp_expired&...`). A page maga
// kliens-oldalon ellenőrzi a recovery-session érvényességét.
//
// 2026-07-25 (F8d): a `/m/feltoltes/{token}` mobil feltöltő oldal IS publikus.
// A desktopon megjelenített QR-kódot a lelkész telefonja olvassa be, ahol
// senki sincs bejelentkezve — a rövid életű token az egyetlen belépő. Enélkül
// a middleware /login-ra dobná a telefont (ugyanaz a csapda, mint a
// /reset-password-nél). A tényleges jogosultság-ellenőrzés a DB-ben van:
// qr_session_lookup / qr_register_upload (SECURITY DEFINER, token-hash +
// lejárat + darab-limit) és a qr-staging storage-policy.
const PUBLIC_AUTH_ROUTES = ['/hozzaferes-kerese', '/reset-password', '/m/feltoltes']

// Web-onboarding wizard útvonala (M6.3 2026-04-22 óta a /api/standalone/*
// route-ok kivezetve — a portable Inno Setup build megszüntetve).
const SETUP_ROUTES = ['/welcome']

function isPastorAuthRoute(pathname: string): boolean {
  return PASTOR_AUTH_ROUTES.some(route => pathname.startsWith(route))
}

function isPublicAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_ROUTES.some(route => pathname.startsWith(route))
}

function isSetupRoute(pathname: string): boolean {
  return SETUP_ROUTES.some(route => pathname.startsWith(route))
}

function canAuthenticatedUserStayOnAuthRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/oauth-complete') ||
    // 2026-08-15 (8. pont): a 2FA második lépcsője — bejelentkezett (aal1-es)
    // usernek pont itt VAN dolga.
    pathname.startsWith('/login/ellenorzes')
  )
}

// Publikus gyülekezeti oldalak — bárki látja, auth nem kell
function isPublicCongregationRoute(pathname: string): boolean {
  return pathname.startsWith('/gy/') || pathname === '/gy'
}

// Nyilvános naptár-feed (ICS) — tokenes URL, a Google/Apple/Outlook naptár
// szervere auth nélkül tölti le; a hozzáférést maga a kitalálhatatlan token
// kapuzza (2026-08-02, PR-20).
function isPublicCalendarRoute(pathname: string): boolean {
  return pathname.startsWith('/api/calendar/')
}

// ASZTALI ESZKÖZ-KAPCSOLÁS API (2026-09-05) — az asztali alkalmazás hívja,
// ahol MÉG NINCS munkamenet (épp azt hozzuk létre). A védelem az útvonalban
// van: 256 bites, csak hash-ben tárolt kód + IP-hash spam-fék + 10 perces
// lejárat; jóváhagyni CSAK bejelentkezve, a /desktop-kapcsolas oldalon lehet,
// ami a rendes (dashboard) kapuk mögött él.
//
// ⛔ PONTOS ALLOWLIST, NEM ELŐTAG (2026-09-05, a bíráló P3 találata): az első
// változat `startsWith('/api/desktop-kapcsolas/')` alapon engedett át, tehát
// egy JÖVŐBELI útvonal (pl. egy `/api/desktop-kapcsolas/torles`) magától,
// döntés nélkül lett volna munkamenet nélkül elérhető. Itt CSAK az a három
// útvonal nyilvános, amelyik a saját kapujával (kód-hash, spam-fék, lejárat)
// védi magát; minden más — al-útvonal, záró perjeles alak, új végpont —
// ALAPBÓL a bejelentkezés-kapura esik (fail-closed). Új nyilvános útvonal
// csak ide beírva lesz az. (A záró perjeles alakot a Next beépített
// átirányítása a proxy ELŐTT leveszi — a pontos egyezés emiatt nem szigorúbb
// a kelleténél.) Őrszem: scripts/selftest-desktop-kapcsolas.mjs M1/M1n.
//
// ⚠️ AZ ÚTVONAL-SZÖVEG HÁROM HELYEN ÉL (itt, az asztali kliensben —
// apps/desktop/src/lib/desktop-kapcsolas.ts — és a route-mappák nevében). A
// pontos allowlist a prefixnél SZOROSABBAN kötődik a fájlrendszerhez: egy
// átnevezett mappa vagy egy elgépelt bejegyzés NÉMÁN a bejelentkezés-kapura
// ejtené az asztali POST-ot (307 → /login HTML → az app a lejáratig újrapróbál).
// Ezért az őr (M1b/M1bn/M1c) minden bejegyzéshez LÉTEZŐ route.ts-t követel,
// és minden létező route-mappához döntést (nyilvános VAGY munkamenet-köteles).
// Egy közös `DESKTOP_KAPCSOLAS_UTVONALAK` konstans a @kartoteka/supabase-client
// csomagban (az asztali kliens és a proxy ugyanonnan) egy későbbi kör dolga —
// barrel-bővítés, helyi web build a push előtt.
const DESKTOP_KAPCSOLAS_NYILVANOS_UTVONALAK: ReadonlySet<string> = new Set([
  '/api/desktop-kapcsolas/inditas',
  '/api/desktop-kapcsolas/allapot',
  '/api/desktop-kapcsolas/nyit',
])
function isDesktopKapcsolasApiRoute(pathname: string): boolean {
  return DESKTOP_KAPCSOLAS_NYILVANOS_UTVONALAK.has(pathname)
}

// Éves beszámoló kivetítő/prezenter oldalak — más eszközről (telefon/tablet/
// okos-TV) is elérhetők, a tartalmat a valós idejű csatornán kapják, ezért
// auth nélkül átengedjük (2026-06-08).
function isEloadasRoute(pathname: string): boolean {
  return pathname.startsWith('/eloadas/')
}

// BELSŐ WORKER-ÚTVONALAK (2026-08-11) — gépi hívók, böngésző-session NÉLKÜL.
//
// ⚠️ MIÉRT KELL: a Railway cron (és bármely más ütemező) `Authorization: Bearer`
// fejléccel POST-ol, de Supabase session-cookie-ja SOHA nincs. A proxy matcher
// ezeket az útvonalakat illeszti (nincs fájl-kiterjesztésük), tehát enélkül a
// lenti „nincs user → /login" ág 307-tel elterelné a kérést: a worker kódja EL
// SEM INDULNA, a hívó pedig egy HTML bejelentkező oldalt kapna JSON helyett.
// Ez a napi biztonsági mentést, a hírlevél- és a lejárat-emlékeztető workert
// egyaránt NÉMÁN kikapcsolná.
//
// ⚠️ MIÉRT NEM GYENGÍT: ezek a route-ok SAJÁT kapuval védettek (Bearer +
// SHA-256 + `timingSafeEqual`), és 32 karakternél rövidebb titoknál 503-mal
// megtagadják a futást. A proxy-átengedés tehát nem nyit új felületet — csak
// nem takarja el a route saját ellenőrzését egy átirányítással.
function isInternalWorkerRoute(pathname: string): boolean {
  return pathname.startsWith('/api/internal/')
}

// FEJLESZTŐI PRÓBAPAD (2026-08-25) — KIZÁRÓLAG development módban él.
// A /dev-proba oldal izolált komponens- és PDF-motor-tesztekhez való
// (auth-mentes, mock-adatokkal), hogy a vizuális/renderelési hibák a beépített
// böngészővel reprodukálhatók legyenek. Élesben a NODE_ENV 'production',
// tehát ez az ág HALOTT — a route a normál auth-kapura esik.
function isDevProbapadRoute(pathname: string): boolean {
  return process.env.NODE_ENV === 'development' && pathname.startsWith('/dev-proba')
}

// ════════════════════════════════════════════════════════════════════════════
// 2FA-KAPU — A DÖNTÉS (2026-08-24, biztonsági javító kör)
// ════════════════════════════════════════════════════════════════════════════
//
// ⛔ MIÉRT TISZTA FÜGGVÉNY: a kétlépcsős belépés EGYETLEN kikényszerítő pontja
// ez a kapu. Ami itt eldől, azt önellenőrzéssel mérni kell tudni — a döntés
// ezért kiemelve él, és a `scripts/selftest-2fa-kapu.mjs` határesetekkel
// futtatja (a hamisított sütis támadás újrajátszásával együtt).
//
// ⛔ MIÉRT NEM A KÖNYVTÁR `nextLevel` MEZŐJE DÖNT (a javítás lényege):
// a `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` ARGUMENTUM NÉLKÜL a
// `getSession()`-ből dolgozik. Ott a `currentLevel` az ALÁÍRT JWT `aal`
// claim-jéből jön (az hiteles), DE a `nextLevel` a `session.user.factors`
// tömbből — ami a SÜTIBŐL visszaolvasott, ALÁÍRATLAN JSON. A @supabase/ssr
// saját kódja meg is jelöli: „isServer: true — coming from a server
// environment and their value should not be trusted".
//
// A TÁMADÁS, amit ez a javítás lezár: a támadó ismeri az áldozat jelszavát, de
// a telefonját nem. Bejelentkezik → érvényes, aláírt, aal1-es access_token +
// átirányítás a /login/ellenorzes-re. A böngésző eszköztárában kiveszi az
// `sb-<projekt>-auth-token` sütit, base64url-ből dekódolja, a `user.factors`
// tömböt KIÜRÍTI (`"factors":[]`), visszakódolja. Az access_token és a
// refresh_token VÁLTOZATLAN marad, tehát az aláírás érvényes — de a kapu már
// nem követelte a második faktort. Innentől a támadó bent van.
//
// A JAVÍTÁS: a faktor-listát a SZERVERTŐL vesszük. A `supabase.auth.getUser()`
// hálózati `/user` hívás, a válasza hiteles — ugyanaz a forrás, amiből a
// könyvtár `mfa.listFactors()`-a is dolgozik. A `currentLevel` maradhat a
// könyvtártól: az az ALÁÍRT tokenből jön, azt nem lehet hamisítani.

/** Egy MFA-faktor a döntés szempontjából — csak az számít, ellenőrzött-e. */
export type MfaFaktor = { status?: string | null }

/**
 * A SZERVERTŐL kapott, hitelesített felhasználó-objektum vázlata.
 * A `factors` mező a `supabase.auth.getUser()` HÁLÓZATI válaszából származik.
 */
export type SzerverFelhasznalo = { factors?: MfaFaktor[] | null }

/**
 * KELL-E MÁSODIK FAKTOR? — a 2FA-kapu tiszta döntése.
 *
 * @param szerverFelhasznalo a `getUser()` hálózati válaszának felhasználója
 *   (`null`/`undefined` = nem tudjuk, ki ez → FAIL-CLOSED)
 * @param jelenlegiSzint az ALÁÍRT access_token `aal` claim-je
 * @returns `true`, ha a kérést a második lépcsőre kell terelni
 *
 * A három szabály, ebben a sorrendben:
 *  1. FAIL-CLOSED — hitelesített szerver-válasz nélkül SOHA nem mondunk
 *     „átengedhető"-t. (Ez az az ág, ahol a régi kód a sütinek hitt.)
 *  2. OPT-IN ÍGÉRET — ha a szerver szerint NINCS ellenőrzött faktor, semmi nem
 *     változik. Akinek nincs 2FA-ja, azt ez a kapu soha nem téríti el.
 *     Az „enrollment" alatti, még ELLENŐRIZETLEN faktor sem számít: az még nem
 *     használható belépésre, tehát nem is szabad vele kizárni senkit.
 *  3. Ha van ellenőrzött faktor, csak aal2-es munkamenettel megyünk tovább.
 */
export function kellEMasodikFaktor(
  szerverFelhasznalo: SzerverFelhasznalo | null | undefined,
  jelenlegiSzint: string | null | undefined,
): boolean {
  if (!szerverFelhasznalo) return true
  const ellenorzottFaktorok = (szerverFelhasznalo.factors ?? []).filter(
    (faktor) => faktor?.status === 'verified',
  )
  if (ellenorzottFaktorok.length === 0) return false
  return jelenlegiSzint !== 'aal2'
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  let supabaseResponse = NextResponse.next({ request })

  // ⚠️ A BELSŐ WORKER-ÚTVONALAK A LEGELSŐ KAPU ELŐTT ÁTMENNEK.
  // Szándékosan a Supabase-kliens LÉTREHOZÁSA ELŐTT: egy gépi hívónak nincs
  // cookie-ja, tehát a `getUser()` hálózati kör is fölösleges lenne. A route
  // saját Bearer + `timingSafeEqual` kapuja dönt.
  if (isInternalWorkerRoute(pathname)) {
    return supabaseResponse
  }

  // ─────────────────────────────────────────────────────────────
  // SERVER MODE (web deploy, Railway EU Amsterdam) — Supabase auth flow
  // M6.3 (2026-04-22): a korábbi STANDALONE MODE fast-path (portable Inno
  // Setup + license.dat) kivezetve. A Tauri desktop saját auth-flow-val
  // (Tauri keyring) működik, NEM ezen a proxy-middleware-en keresztül.
  // ─────────────────────────────────────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fejlesztői próbapad → CSAK development módban engedjük át
  if (isDevProbapadRoute(pathname)) {
    return supabaseResponse
  }

  // Publikus gyülekezeti oldalak → mindig átengedünk
  if (isPublicCongregationRoute(pathname)) {
    return supabaseResponse
  }

  // Nyilvános naptár-feed (ICS) → mindig átengedünk (token kapuzza)
  if (isPublicCalendarRoute(pathname)) {
    return supabaseResponse
  }

  // Asztali eszköz-kapcsolás API → átengedjük (a kód és a spam-fék kapuzza)
  if (isDesktopKapcsolasApiRoute(pathname)) {
    return supabaseResponse
  }

  // Éves beszámoló kivetítő/prezenter (cross-device) → mindig átengedünk
  if (isEloadasRoute(pathname)) {
    return supabaseResponse
  }

  // Publikus auth-related oldalak (hozzáférés-kérő űrlap stb.) → mindig átengedünk
  if (isPublicAuthRoute(pathname)) {
    return supabaseResponse
  }

  // Session-mode lejárat ellenőrzés — "Maradjak bejelentkezve" funkció.
  // Ha a user be van jelentkezve DE a session-mode cookie HIÁNYZIK,
  // az azt jelenti hogy a 24-órás session lejárt → automatikus signOut.
  // (Ha "Maradjak bejelentkezve" volt pipálva, a cookie max-age 1 év, így ott
  //  szinte sosem fut le.) A /login és /auth/callback route-okon nem fut le
  //  ez a check, hogy ne csapjuk le a friss bejelentkezést.
  if (
    user
    && !isPastorAuthRoute(pathname)
    && !isSetupRoute(pathname)
    && !request.cookies.get(SESSION_MODE_COOKIE)
  ) {
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('reason', 'session-expired')
    return NextResponse.redirect(url)
  }

  // Lelkészi védett útvonal + nincs user → redirect /login
  if (!isPastorAuthRoute(pathname) && !isSetupRoute(pathname) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── 2FA aal-őr (2026-08-15, 8. pont — Endre 4. döntése: opt-in) ─────────
  // Ha a fióknak van ellenőrzött TOTP-faktora, de a munkamenet még aal1-es
  // (jelszó/OAuth után), MINDEN védett út a 2. lépcsőre irányít. Ez fogja az
  // összes belépési pontot (jelszó, OAuth, nyitva felejtett fül). Faktor
  // nélküli fióknál nem fut — az opt-in ígéret: akinek nincs 2FA-ja, annak
  // semmi nem változik.
  // Az alacsony AAL nem hiba, hanem állapot → átirányítás, nem hibakód.
  // 2026-08-24: a „van-e faktor" kérdést a SZERVER válaszolja meg, nem a süti
  // (lásd a fájl elején a `kellEMasodikFaktor()` melletti magyarázatot).
  if (user && !isPastorAuthRoute(pathname) && !isSetupRoute(pathname)) {
    // A `currentLevel` az ALÁÍRT JWT `aal` claim-je → hiteles, ezt átvesszük.
    // A `nextLevel`-t SZÁNDÉKOSAN NEM használjuk: azt a könyvtár a sütiből
    // visszaolvasott `session.user.factors` tömbből számolná (lásd a fenti
    // magyarázatot). A faktorokat a `user`-ből vesszük, ami a fenti
    // `supabase.auth.getUser()` HÁLÓZATI válasza — plusz kérés nélkül.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (kellEMasodikFaktor(user, aal?.currentLevel)) {
      // ── A SÜTI HOZZÁIGAZÍTÁSA A SZERVERHEZ (pattogás-védelem) ───────────
      // A /login/ellenorzes oldal SAJÁT őre még a süti-beli
      // `session.user.factors` tömbből dolgozik. Ha a süti elavult (a 2FA-t
      // másik eszközön kapcsolták be, vagy a token-frissítés válasza nem hozta
      // vissza a faktorokat), az az oldal visszadobna a /valassz-profilt-ra,
      // a kapu pedig újra ide — oda-vissza pattogás lenne. Ezért MIELŐTT
      // odaküldenénk, a `setSession()`-nel újraíratjuk a sütit a SZERVERTŐL
      // kapott felhasználó-objektummal. A tokenek VÁLTOZATLANOK maradnak
      // (a `setSession` le nem járt tokennél csak a `/user`-t kéri le), tehát
      // ez nem léptet ki senkit. Csak akkor fut, amikor tényleg széthúz a
      // kettő — utána a süti egyezik, és a következő kérésnél már el sem indul.
      // Best-effort: a hibája NEM változtat a fenti (fail-closed) döntésen.
      if (aal?.nextLevel !== 'aal2') {
        try {
          const { data: sutiMunkamenet } = await supabase.auth.getSession()
          const munkamenet = sutiMunkamenet?.session
          if (munkamenet?.access_token && munkamenet?.refresh_token) {
            await supabase.auth.setSession({
              access_token: munkamenet.access_token,
              refresh_token: munkamenet.refresh_token,
            })
          }
        } catch {
          // szándékosan néma — a kapu attól még fail-closed marad
        }
      }

      const url = request.nextUrl.clone()
      url.pathname = '/login/ellenorzes'
      url.search = ''
      const atiranyitas = NextResponse.redirect(url)
      // ⚠️ A fenti `setSession()` a `supabaseResponse`-ra írta a frissített
      // auth-sütiket. Egy ÚJ válaszobjektum ezeket elveszítené (a @supabase/ssr
      // middleware-mintájának klasszikus csapdája), ezért átmásoljuk.
      for (const suti of supabaseResponse.cookies.getAll()) {
        atiranyitas.cookies.set(suti)
      }
      return atiranyitas
    }
  }

  // Bejelentkezett user lelkészi auth oldalra navigál → a root resolver
  // dönti el az aktív profil-scope szerinti kezdőoldalt.
  if (isPastorAuthRoute(pathname) && user && !canAuthenticatedUserStayOnAuthRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
