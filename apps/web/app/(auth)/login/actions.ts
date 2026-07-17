'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { logAuditEvent } from '@/lib/audit/log'
import { resolvePostLoginDestination } from '@/lib/auth/post-login-destination'
import {
  SESSION_MODE_COOKIE,
  buildSessionModeCookieOptions,
} from '@/lib/auth/session-mode'

export async function signIn(data: LoginInput) {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // Hibakódok fordítása
    if (error.message.includes('Email not confirmed')) {
      return { error: 'Kérem, erősítse meg az e-mail címét a fiókjába küldött linkkel!' }
    }

    // Szándékosan azonos választ adunk a nem létező e-mailre, a hibás
    // jelszóra és a még nem aktív fiókra. A korábbi
    // `login_email_status` RPC a belépés előtt e-mail-/státusz-felsorolást
    // tett lehetővé. Saját fiókstátuszt csak sikeres hitelesítés után
    // szabad megjeleníteni.
    return {
      error:
        'Az e-mail-cím vagy a jelszó hibás, illetve a fiók még nem aktív. Próbálja újra, vagy használja az „Elfelejtett jelszó” oldalt.',
    }
  }

  // Egységes belépés-utáni döntés — UGYANAZ a logika, mint a Google (OAuth)
  // flow-ban (auth/callback), hogy mindkét belépési mód azonosan viselkedjen.
  // `via: 'password'`: idáig kizárólag sikeres hitelesítés jut el, így a
  // saját fiók állapota biztonságosan ellenőrizhető.
  const dest = await resolvePostLoginDestination(supabase, authData.user, { via: 'password' })

  // Nem aktív, de már megadta az adatait → jóváhagyásra vár (kijelentkeztetés)
  if (dest === 'pending') {
    await supabase.auth.signOut()
    return {
      error:
        'Fiókja még jóváhagyásra vár — a rendszergazda értesítve van. Türelmét kérjük.',
    }
  }

  // 'home' vagy 'complete' → a session megmarad, beállítjuk a session-mode
  // cookie-t ("Maradjak bejelentkezve" alapján).
  // - true  → persistent (1 év, csak a Supabase saját refresh token expiry korlátozza)
  // - false → session (24 óra; a middleware redirectel /login-ra ha lejár)
  const cookieStore = await cookies()
  const { mode, options } = buildSessionModeCookieOptions(parsed.data.rememberMe ?? false)
  cookieStore.set(SESSION_MODE_COOKIE, mode, options)

  // Nem aktív + még nem adta meg az adatait → profil-kiegészítő űrlap
  // (ugyanaz, ahova a friss Google-belépés is megy).
  if (dest === 'complete') {
    redirect('/oauth-complete')
  }

  // Aktív → audit + aktivitás, majd a profil-választóra.
  // (A redirect() alább kivételt dob, ezért az audit/last_seen-t előtte hívjuk.)
  await logAuditEvent({ action: 'login', metadata: { method: 'password' } }, supabase)
  await supabase.rpc('touch_last_seen')

  // 2026-05-25: ha a felhasználónak több jóváhagyott profile_roles sora van,
  // a /valassz-profilt mutatja a választót. Egyébként automatikusan átküld
  // a megfelelő dashboardra (1 vagy 0 szerep → az aktív profil-scope szerint).
  redirect('/valassz-profilt')
}
