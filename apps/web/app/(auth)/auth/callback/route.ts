import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isMasterAdmin } from '@/lib/auth/roles'
import {
  SESSION_MODE_COOKIE,
  buildSessionModeCookieOptions,
} from '@/lib/auth/session-mode'

/**
 * OAuth callback — a Supabase exchangeCodeForSession után beállítjuk a
 * session-mode cookie-t is, hogy a "Maradjak bejelentkezve" rendszer működjön.
 * Az OAuth flow-ban nincs checkbox, ezért default `session` (24 óra). A
 * felhasználó a következő login-on bekapcsolhatja a "Maradjak bejelentkezve"-t.
 */
function applySessionModeCookie(response: NextResponse, rememberMe = false): NextResponse {
  const { mode, options } = buildSessionModeCookieOptions(rememberMe)
  response.cookies.set(SESSION_MODE_COOKIE, mode, options)
  return response
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session kész — profil ellenőrzés
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, status, role, congregation_id')
          .eq('id', user.id)
          .single()

        // Nincs profil → kiegészítő adatbekérés
        if (!profile) {
          return applySessionModeCookie(NextResponse.redirect(`${origin}/oauth-complete`))
        }

        const master = isMasterAdmin(user.email)
        const isActive = profile.status === 'active'

        if (!master && !isActive) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=pending`)
        }

        return applySessionModeCookie(NextResponse.redirect(`${origin}/`))
      }
    }
  }

  // Hiba → vissza a login-ra
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
