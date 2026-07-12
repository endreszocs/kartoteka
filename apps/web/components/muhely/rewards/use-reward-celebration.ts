'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { MissionRewardOutcome } from '@/lib/missions/gamification'
import { BADGE_UNLOCK_QUERY_PARAM } from '@/lib/missions/badges'

/** A szerveres jutalomkimenetet kedves, egységes Műhely-visszajelzéssé alakítja. */
export function useRewardCelebration() {
  const router = useRouter()

  return useCallback(
    (reward: MissionRewardOutcome | null | undefined) => {
      if (!reward?.applied) return

      const firstBadge = reward.newBadges[0]
      if (firstBadge) {
        toast.success('Új jelvényt szereztél!', {
          description: `+${reward.points} pont · Nyissuk ki együtt a jelvényszekrényt.`,
        })
        router.push(
          `/misszios-muhely/jutalmak?${BADGE_UNLOCK_QUERY_PARAM}=${encodeURIComponent(firstBadge)}`,
        )
        return
      }

      if (
        reward.newLevel &&
        reward.previousLevel &&
        reward.newLevel !== reward.previousLevel
      ) {
        toast.success(`Új állomás: ${reward.newLevel}`, {
          description: `+${reward.points} pont a közös szolgálati úton.`,
        })
        return
      }

      if (reward.points > 0) {
        toast.success(`+${reward.points} műhelypont`, {
          description: 'Köszönjük, hogy gazdagítod a közösséget.',
        })
      }
    },
    [router],
  )
}
