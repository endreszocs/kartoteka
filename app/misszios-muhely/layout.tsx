import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getMissionProgress } from '@/lib/missions/gamification'
import { MuhelyNavbar } from '@/components/muhely/layout/muhely-navbar'
import { MuhelyFooter } from '@/components/muhely/layout/muhely-footer'
import { createClient } from '@/lib/supabase/server'

export default async function MuhelyLayout({ children }: { children: React.ReactNode }) {
  const { user, fullName, profile, master } = await getEffectiveAccessContext()

  // Auth védelem: csak bejelentkezett, aktív lelkészi profil érheti el
  if (!user || !profile) redirect('/login')
  if (profile.status !== 'active' && !master) redirect('/login')

  const supabase = await createClient()

  const { data: stats } = await supabase
    .from('mm_felhasznalo_statisztika')
    .select('osszpontszam')
    .eq('user_id', user.id)
    .maybeSingle()

  const points = stats?.osszpontszam ?? 0
  const progress = getMissionProgress(points)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50/80 via-teal-50/20 to-amber-50/10">
      <MuhelyNavbar
        viewer={{
          fullName: fullName || 'Felhasználó',
          level: progress.current,
          points,
          percent: progress.percent,
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      <MuhelyFooter />
    </div>
  )
}
