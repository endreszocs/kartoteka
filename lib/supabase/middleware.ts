import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Lelkészi auth útvonalak — bejelentkezett usernek nem kell ide visszamennie
const PASTOR_AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/oauth-complete', '/auth/callback']

// Standalone első indítási varázsló útvonalai
const SETUP_ROUTES = ['/welcome', '/api/standalone/']

function isPastorAuthRoute(pathname: string): boolean {
  return PASTOR_AUTH_ROUTES.some(route => pathname.startsWith(route))
}

function isSetupRoute(pathname: string): boolean {
  return SETUP_ROUTES.some(route => pathname.startsWith(route))
}

// Publikus gyülekezeti oldalak — bárki látja, auth nem kell
function isPublicCongregationRoute(pathname: string): boolean {
  return pathname.startsWith('/gy/') || pathname === '/gy'
}

/**
 * Standalone mode check — a lelkész saját gépén fut-e.
 * A middleware Edge runtime-on fut, ami nem támogatja a `fs`-t,
 * ezért csak env var alapján döntünk.
 */
function isStandaloneMode(): boolean {
  return process.env.KARTOTEKA_STANDALONE === 'true'
}

/**
 * Standalone módban: létezik-e már a license.dat?
 * Ez csak a szerveren működik (ahol fs elérhető), ezért a middleware
 * csak az env var-ot olvassa — a tényleges fs check a welcome page-en
 * történik server-side.
 *
 * A `KARTOTEKA_LICENSE_OK` env var-t a Node server process indulás után
 * állítja be (első license-check után), hogy a middleware Edge runtime-on
 * is tudjon róla.
 */
function hasLicenseFlag(): boolean {
  return process.env.KARTOTEKA_LICENSE_OK === 'true'
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  let supabaseResponse = NextResponse.next({ request })

  // ─────────────────────────────────────────────────────────────
  // STANDALONE MODE FAST-PATH
  // Ha standalone vagyunk + van licensz, a license = auth.
  // NEM hívunk supabase.auth.getUser()-t (offline-ban timeout-ra futna),
  // és NEM redirect-elünk /login-ra (ott nincs is mit csinálni).
  // ─────────────────────────────────────────────────────────────
  if (isStandaloneMode()) {
    if (!hasLicenseFlag()) {
      // Nincs licensz → /welcome wizard
      if (!isSetupRoute(pathname) && !isPublicCongregationRoute(pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = '/welcome'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    // Van licensz → welcome page tiltott (ne csinálj duplikált setup-ot)
    if (pathname === '/welcome') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    // Standalone + license + bármely route → átengedjük
    // (a session/auth a license.dat-ban van, az actions.ts-ek a wrapper-en
    // keresztül onnan veszik fel)
    return supabaseResponse
  }

  // ─────────────────────────────────────────────────────────────
  // SERVER MODE (web deploy, Railway EU Amsterdam) — normál Supabase auth flow
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

  // Lelkészi védett útvonal + nincs user → redirect /login
  if (!isPastorAuthRoute(pathname) && !isSetupRoute(pathname) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Bejelentkezett user lelkészi auth oldalra navigál → redirect /dashboard
  if (isPastorAuthRoute(pathname) && user && pathname !== '/auth/callback') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
