import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveDefaultDashboardPath } from '@/app/(dashboard)/profile/profile-preferences-actions'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 2026-04-18: a felhasználó szerepköreinek megfelelő dashboard-ra
  // irányítunk (esperes → egyházmegye, rendszergazda → admin, stb.).
  // A `profile_preferences.default_dashboard` alapján a felhasználó
  // átállíthatja az alapértelmezést (pl. multi-role lelkész+esperes).
  const path = await resolveDefaultDashboardPath()
  redirect(path)
}
