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
  return pathname.startsWith('/auth/callback') || pathname.startsWith('/oauth-complete')
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

  // Publikus gyülekezeti oldalak → mindig átengedünk
  if (isPublicCongregationRoute(pathname)) {
    return supabaseResponse
  }

  // Nyilvános naptár-feed (ICS) → mindig átengedünk (token kapuzza)
  if (isPublicCalendarRoute(pathname)) {
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

  // Bejelentkezett user lelkészi auth oldalra navigál → a root resolver
  // dönti el az aktív profil-scope szerinti kezdőoldalt.
  if (isPastorAuthRoute(pathname) && user && !canAuthenticatedUserStayOnAuthRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
