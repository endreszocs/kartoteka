import { redirect } from 'next/navigation'

import { BadgeCabinet, type BadgeCabinetItem } from '@/components/muhely/rewards/badge-cabinet'
import { BadgeUnlockCeremony } from '@/components/muhely/rewards/badge-unlock-ceremony'
import { CommunityCelebration } from '@/components/muhely/rewards/community-celebration'
import { RewardsOverview } from '@/components/muhely/rewards/rewards-overview'
import styles from '@/components/muhely/rewards/rewards.module.css'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  BADGE_UNLOCK_QUERY_PARAM,
  getMissionBadge,
  isMissionBadgeCode,
  MISSION_BADGES,
  type MissionBadgeCode,
} from '@/lib/missions/badges'

import { loadRewardsPage } from '../community-actions'

interface RewardsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function JutalmakPage({ searchParams }: RewardsPageProps) {
  const [{ user }, query, data] = await Promise.all([
    getEffectiveAccessContext(),
    searchParams,
    loadRewardsPage(),
  ])

  if (!user || 'error' in data) redirect('/login')

  const catalogCodeById = new Map<number, MissionBadgeCode>()
  for (const badge of data.badgeCatalog) {
    if (isMissionBadgeCode(badge.kod)) catalogCodeById.set(badge.id, badge.kod)
  }

  const earnedAtByCode = new Map<MissionBadgeCode, string | null>()
  for (const earnedBadge of data.myBadges) {
    const relatedCode = earnedBadge.mm_jelveny_tipusok?.kod
    const code = isMissionBadgeCode(relatedCode)
      ? relatedCode
      : catalogCodeById.get(earnedBadge.jelveny_id)

    if (code) earnedAtByCode.set(code, earnedBadge.elnyerve || null)
  }

  const unlockParam = firstQueryValue(query[BADGE_UNLOCK_QUERY_PARAM])
  const requestedUnlock = isMissionBadgeCode(unlockParam) ? unlockParam : null
  // Csak valóban elnyert jelvényhez engedünk ünneplést; egy kézzel írt URL nem old fel semmit.
  const newBadgeCode =
    requestedUnlock && earnedAtByCode.has(requestedUnlock) ? requestedUnlock : null

  const cabinetItems: BadgeCabinetItem[] = MISSION_BADGES.map((badge) => {
    const earned = earnedAtByCode.has(badge.code)
    const current = badge.progress ? Number(data.myStats[badge.progress.stat] || 0) : null

    return {
      badge,
      state: badge.code === newBadgeCode ? 'new' : earned ? 'earned' : 'locked',
      earnedAt: earnedAtByCode.get(badge.code) ?? null,
      progress:
        badge.progress && current !== null && Number.isFinite(current)
          ? {
              current: Math.max(0, current),
              goal: badge.progress.goal,
              unit: badge.progress.unit,
            }
          : undefined,
    }
  })

  const newBadge = newBadgeCode ? getMissionBadge(newBadgeCode) : null

  return (
    <div className={styles.page}>
      {newBadge ? <BadgeUnlockCeremony key={newBadge.code} badge={newBadge} active /> : null}

      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>Jutalmak és mérföldkövek</span>
        <h1 className={styles.pageTitle}>Jelvényszekrény</h1>
        <p className={styles.pageLead}>
          Minden ötlet, bátorítás és megosztott tapasztalat nyomot hagy. Itt láthatod,
          hogyan növekszik a közösség a te szolgálatod által is.
        </p>
        <span className={styles.ornament} aria-hidden="true">
          <span className={styles.ornamentMark}>✦</span>
        </span>
      </header>

      <RewardsOverview stats={data.myStats} />
      <BadgeCabinet items={cabinetItems} />
      <CommunityCelebration entries={data.leaderboard} currentUserId={user.id} />
    </div>
  )
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
