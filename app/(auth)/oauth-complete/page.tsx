import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OAuthCompleteForm } from '@/components/auth/oauth-complete-form'
import { isMasterAdmin } from '@/lib/auth/roles'
import { resolvePostAuthRedirectPath } from '@/lib/auth/effective-access'

export default async function OAuthCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Ha nincs bejelentkezve → login
  if (!user) redirect('/login')

  // Ha már van profilja → dashboard
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, status, role, congregation_id')
    .eq('id', user.id)
    .single()

  if (profile) {
    const master = isMasterAdmin(user.email)
    const isActive = profile.status === 'active'

    if (!master && !isActive) {
      await supabase.auth.signOut()
      redirect('/login?error=pending')
    }

    const destination = await resolvePostAuthRedirectPath(supabase, user, profile)
    redirect(destination)
  }

  // Név előtöltése az OAuth adatokból
  const defaultName = user.user_metadata?.full_name || user.user_metadata?.name || ''

  return <OAuthCompleteForm defaultName={defaultName} />
}
