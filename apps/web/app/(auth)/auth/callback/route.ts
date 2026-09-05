import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit/log'
import { resolvePostLoginDestination } from '@/lib/auth/post-login-destination'
import {
  SESSION_MODE_COOKIE,
  buildSessionModeCookieOptions,
} from '@/lib/auth/session-mode'
import { getPublicOrigin } from '@/lib/utils/public-origin'

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

/**
 * A "kifelé látható" origin (2026-04-28 KRITIKUS FIX — Railway mögött a
 * `request.url` origója a BELSŐ `localhost:8080`) 2026-09-05 óta a közös
 * `@/lib/utils/public-origin` modulban él: ugyanazt használja a Google Drive
 * OAuth-visszatérés és az asztali eszköz-kapcsolás `nyit` útvonala is —
 * egy igazságforrás, hogy a hibaosztály ne bukkanjon fel újra másolatban.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = getPublicOrigin(request)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Session kész — profil ellenőrzés
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Egységes döntés (ugyanaz a logika, mint az email+jelszó login-nál).
        // `via: 'oauth'` → ismeretlen (nem regisztrált) e-mailnél 'not_registered'-t
        // ad vissza, NEM 'complete'-et (nem küldjük regisztrációs űrlapra).
        const dest = await resolvePostLoginDestination(supabase, user, { via: 'oauth' })

        // Aktív (vagy master) → mehet a kezdőoldalra
        if (dest === 'home') {
          // Audit + aktivitás: OAuth-bejelentkezés naplózása + last_seen.
          await logAuditEvent({ action: 'login', metadata: { method: 'oauth' } }, supabase)
          await supabase.rpc('touch_last_seen')
          return applySessionModeCookie(NextResponse.redirect(`${origin}/valassz-profilt`))
        }

        // Ismeretlen e-mail Google-lel (nincs regisztráció) → NE regisztráljon úgy, mintha
        // új felhasználó lenne: jelentkeztessük ki és írjuk ki, hogy „nincs regisztrálva".
        // (Endre kérése, 2026-07-01 — a friss OAuth-userre a trigger auto-létrehoz egy
        // pending profilt, ezért látszana „hiányos regisztrációnak".)
        if (dest === 'not_registered') {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=not_registered`)
        }

        // Nem aktív + még nem adta meg az adatait → profil-kiegészítő űrlap
        // (jelszavas úton fordulhat elő; OAuth-nál a fenti 'not_registered' viszi el).
        if (dest === 'complete') {
          return applySessionModeCookie(NextResponse.redirect(`${origin}/oauth-complete`))
        }

        // Nem aktív, de már megadta az adatait → jóváhagyásra vár
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=pending`)
      }
    }
  }

  // Hiba → vissza a login-ra
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
