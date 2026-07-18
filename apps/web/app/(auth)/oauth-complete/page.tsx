import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OAuthCompleteForm } from '@/components/auth/oauth-complete-form'
import { resolvePostLoginDestination } from '@/lib/auth/post-login-destination'

export default async function OAuthCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Ha nincs bejelentkezve → login
  if (!user) redirect('/login')

  // A saját státuszt és kérelmet kizárólag az auth.uid()-hoz kötött,
  // e-mail-paraméter nélküli staff_my_access_request_state() RPC oldja fel.
  const destination = await resolvePostLoginDestination(supabase, user)

  if (destination === 'home') redirect('/valassz-profilt')

  // Már beadott kérelemnél (vagy nem ellenőrizhető állapotnál) fail closed:
  // ne mutassuk újra az űrlapot, és ne tartsuk meg a pending sessiont.
  if (destination === 'pending') {
    await supabase.auth.signOut()
    redirect('/login?error=pending')
  }

  // Csak a P0 allowlisten szereplő, nem jogosultsági profilmezőt olvassuk az
  // űrlap előtöltéséhez. Státusz/szerepkör/scope nincs ebben a lekérdezésben.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const defaultName =
    profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || ''

  return <OAuthCompleteForm defaultName={defaultName} />
}
