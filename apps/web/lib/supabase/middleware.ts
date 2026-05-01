import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_MODE_COOKIE } from '@/lib/auth/session-mode'

// Lelkészi auth útvonalak — bejelentkezett usernek nem kell ide visszamennie
const PASTOR_AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/oauth-complete', '/auth/callback']

// Publikus auth-related útvonalak — anonim user is elérheti (pl. hozzáférés-kérő űrlap).
// A `(public)` Next.js route-group NEM jelenik meg a pathname-ben, ezért szükség
// van explicit whitelistre. (2026-05-01: a `/login` page-en a "Kérjen hozzáférést"
// gomb mutatott ide, de a middleware visszairányított /login-ra → loop.)
const PUBLIC_AUTH_ROUTES = ['/hozzaferes-kerese']

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

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  let supabaseResponse = NextResponse.next({ request })

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
