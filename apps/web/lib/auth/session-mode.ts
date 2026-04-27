/**
 * Session-mode cookie helpers — "Maradjak bejelentkezve" funkció backendje.
 *
 * Két érték:
 *   - 'session'    → 24 órás max-age (alapértelmezett, ha NEM volt remember-me)
 *   - 'persistent' → 1 éves max-age (ha pipálta a "Maradjak bejelentkezve")
 *
 * A middleware (`lib/supabase/middleware.ts`) ellenőrzi: ha user be van
 * jelentkezve DE a `session-mode` cookie HIÁNYZIK → ez azt jelenti hogy a
 * 24-órás session lejárt → automatikus signOut + redirect /login.
 *
 * Ha a felhasználó az OAuth bejelentkezést használja (Google), a callback-ben
 * default 'session' (24h) cookie-t állítunk be (mert ott nincs remember-me
 * checkbox a flow-ban).
 */

export const SESSION_MODE_COOKIE = 'session-mode'
export type SessionMode = 'session' | 'persistent'

const ONE_DAY_SECONDS = 24 * 60 * 60
const ONE_YEAR_SECONDS = 365 * ONE_DAY_SECONDS

export interface SessionCookieOptions {
  maxAge: number
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax'
}

/**
 * Generálja a cookie-set paramétereket egy `rememberMe` flag alapján.
 *
 * @param rememberMe true → persistent (1 év); false → session (24 óra)
 */
export function buildSessionModeCookieOptions(rememberMe: boolean): {
  mode: SessionMode
  options: SessionCookieOptions
} {
  const mode: SessionMode = rememberMe ? 'persistent' : 'session'
  return {
    mode,
    options: {
      maxAge: rememberMe ? ONE_YEAR_SECONDS : ONE_DAY_SECONDS,
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  }
}
