import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getMissionProgress } from '@/lib/missions/gamification'
import { loadHomePageData, loadWhatsNew } from './community-actions'
import { MuhelyHero } from '@/components/muhely/home/muhely-hero'
import { MuhelyEncouragement } from '@/components/muhely/home/muhely-encouragement'
import { MuhelyQuickStats } from '@/components/muhely/home/muhely-quick-stats'
import { MuhelyRecentActivity } from '@/components/muhely/home/muhely-recent-activity'
import { MuhelyWhatsNew } from '@/components/muhely/home/muhely-whats-new'

export default async function MissziosMuhelyPage() {
  const { user } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const [data, whatsNew] = await Promise.all([
    loadHomePageData(),
    loadWhatsNew(),
  ])

  if ('error' in data) redirect('/login')

  const progress = getMissionProgress(data.myStats.osszpontszam || 0)

  return (
    <div className="space-y-8">
      <MuhelyHero
        viewer={{ fullName: data.viewer.fullName }}
        level={progress.current}
        points={data.myStats.osszpontszam || 0}
        percent={progress.percent}
        nextLevel={progress.next}
      />

      {/* What's new since last visit */}
      <MuhelyWhatsNew items={whatsNew.items} lastVisit={whatsNew.lastVisit} />

      <MuhelyEncouragement />

      <MuhelyQuickStats stats={data.communityStats} />

      <MuhelyRecentActivity
        materials={data.recentMaterials}
        ideas={data.recentIdeas}
        topContributors={data.topContributors}
      />
    </div>
  )
}
