import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OAuthCompleteForm } from '@/components/auth/oauth-complete-form'
import { isMasterAdmin } from '@/lib/auth/roles'

export default async function OAuthCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Ha nincs bejelentkezve → login
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, status, role, congregation_id, diocese_id, full_name')
    .eq('id', user.id)
    .single()

  const master = isMasterAdmin(user.email)
  const isActive = profile?.status === 'active'

  // Aktív (vagy master) → kész, mehet tovább
  if (master || isActive) redirect('/valassz-profilt')

  // Nem aktív, de az org-adatokat már kitöltötte (van egyházmegye) → csak
  // jóváhagyásra vár; ne mutassuk újra az űrlapot.
  if (profile?.diocese_id) {
    await supabase.auth.signOut()
    redirect('/login?error=pending')
  }

  // Egyébként (hiányos vagy hiányzó profil) → kiegészítő űrlap.
  // Név előtöltése a profilból vagy az OAuth-metaadatokból.
  const defaultName =
    profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || ''

  return <OAuthCompleteForm defaultName={defaultName} />
}
