import { redirect } from 'next/navigation'

import { TwoFactorLoginForm } from '@/components/auth/two-factor-login-form'
import { createClient } from '@/lib/supabase/server'

/**
 * Belépés — 2. lépcső (2026-08-15, 8. pont): a jelszó után a hitelesítő app
 * 6 jegyű kódja (vagy mentőkód). Ide a bejelentkezés-akció és a middleware
 * aal-őre irányít, ha a fióknak van ellenőrzött TOTP-faktora, de a
 * munkamenet még csak aal1-es.
 */
export default async function LoginEllenorzesPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect('/login')

  // Ha nincs (már) faktor, vagy a munkamenet már aal2 → nincs itt dolgunk.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.nextLevel !== 'aal2' || aal.currentLevel === 'aal2') {
    redirect('/valassz-profilt')
  }

  return <TwoFactorLoginForm />
}
