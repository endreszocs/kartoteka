'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { isMasterAdmin } from '@/lib/auth/roles'
import { logAuditEvent } from '@/lib/audit/log'
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

    // Explicit "nincs regisztrálva" megkülönböztetés (Endre kérése).
    // A Supabase generikus "Invalid login credentials"-t ad mind a nem létező
    // email-re, mind a rossz jelszóra. Egy SECURITY DEFINER RPC
    // (login_email_status) megnézi, létezik-e a profil az adott email-lel, így
    // pontosabb üzenetet adhatunk. Lásd: 2026-06-03-login-email-status-rpc.sql
    const { data: emailStatus } = await supabase.rpc('login_email_status', {
      p_email: parsed.data.email,
    })

    if (emailStatus === 'not_registered') {
      return {
        error:
          'Ez az e-mail cím nincs regisztrálva a rendszerben. Kérjük, először igényeljen hozzáférést a Regisztráció oldalon.',
      }
    }
    if (emailStatus && emailStatus !== 'active') {
      // Létezik, de még nem aktív (pl. pending) → jóváhagyásra vár
      return {
        error:
          'Fiókja még jóváhagyásra vár — a rendszergazda értesítve van. Türelmét kérjük.',
      }
    }
    // Létezik és aktív (vagy az RPC nem elérhető) → hibás jelszó
    return {
      error:
        'Hibás jelszó. Kérjük, próbálja újra, vagy állítsa vissza az „Elfelejtett jelszó" oldalon.',
    }
  }

  // Profil ellenőrzés
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role, congregation_id')
    .eq('id', authData.user.id)
    .single()

  const master = isMasterAdmin(authData.user.email)
  const isActive = profile?.status === 'active'

  if (!master && !isActive) {
    await supabase.auth.signOut()
    return {
      error:
        'Fiókja még jóváhagyásra vár — a rendszergazda értesítve van. Türelmét kérjük.',
    }
  }

  // Session-mode cookie beállítása ("Maradjak bejelentkezve" alapján).
  // - true  → persistent (1 év, csak a Supabase saját refresh token expiry korlátozza)
  // - false → session (24 óra; a middleware redirectel /login-ra ha lejár)
  const cookieStore = await cookies()
  const { mode, options } = buildSessionModeCookieOptions(parsed.data.rememberMe ?? false)
  cookieStore.set(SESSION_MODE_COOKIE, mode, options)

  // Audit + aktivitás: bejelentkezés naplózása és a last_seen frissítése.
  // (A redirect() alább kivételt dob, ezért ezeket előtte hívjuk.)
  await logAuditEvent({ action: 'login', metadata: { method: 'password' } }, supabase)
  await supabase.rpc('touch_last_seen')

  // 2026-05-25: ha a felhasználónak több jóváhagyott profile_roles sora van,
  // a /valassz-profilt mutatja a választót. Egyébként automatikusan átküld
  // a megfelelő dashboardra (1 vagy 0 szerep → az aktív profil-scope szerint).
  redirect('/valassz-profilt')
}
