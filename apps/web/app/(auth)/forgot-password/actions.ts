'use server'

import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'

export async function resetPassword(data: ForgotPasswordInput) {
  const parsed = forgotPasswordSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email)

  if (error) {
    // Nem árulunk el semmit arról, létezik-e az email (adatvédelem)
    return { error: 'Hiba történt. Kérem, próbálja újra később.' }
  }

  // Mindig sikeres üzenetet adunk (akkor is ha az email nem létezik)
  return {
    success: 'A jelszó-visszaállító linket sikeresen elküldtük az e-mail címére!',
  }
}
