'use server'

import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'

export async function resetPassword(data: ForgotPasswordInput) {
  const parsed = forgotPasswordSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // 2026-05-02 (v0.9.44) — KRITIKUS FIX: a redirectTo eddig hiányzott!
  // A Supabase a magic-link kattintáskor a default Site URL-re vitte
  // a user-t (vagy egy nemlétező oldalra), és az új jelszó megadása
  // soha nem történt meg.
  //
  // Most explicit: /reset-password — ott egy ÚJ JELSZÓ form fogadja a tokent.
  const PRODUCTION_FALLBACK = 'https://kartotekaweb-production.up.railway.app'
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_FALLBACK : 'http://localhost:3000')

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/reset-password`,
  })

  if (error) {
    // Nem árulunk el semmit arról, létezik-e az email (adatvédelem)
    return { error: 'Hiba történt. Kérem, próbálja újra később.' }
  }

  // Mindig sikeres üzenetet adunk (akkor is ha az email nem létezik)
  return {
    success: 'A jelszó-visszaállító linket sikeresen elküldtük az e-mail címére!',
  }
}

// 2026-05-02 (v0.9.44): új jelszó beállítása a recovery-token után.
// A Supabase a `?code=...&type=recovery` paramétert visszaadja, az
// `exchangeCodeForSession`-nel session jön létre, és onnan az
// `updateUser({ password })` állítja be az új jelszót.
//
// Ezt a `/reset-password` oldalon hívjuk a kliens-oldalról (server action helyett
// kliens kód, mert a session fogad a kliens-oldalon kell hogy lefusson).
export async function setNewPassword(newPassword: string): Promise<{
  success?: string
  error?: string
}> {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'A jelszó legalább 8 karakter hosszú legyen.' }
  }
  if (newPassword.length > 72) {
    return { error: 'A jelszó legfeljebb 72 karakter lehet (bcrypt limit).' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'A token már lejárt vagy érvénytelen. Kérjen új jelszó-visszaállító linket.' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: `A jelszó frissítése nem sikerült: ${error.message}` }

  return { success: 'A jelszót sikeresen beállítottuk. Most már be tud lépni az új jelszóval.' }
}
