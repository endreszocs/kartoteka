'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, X } from 'lucide-react'

import {
  BADGE_UNLOCK_QUERY_PARAM,
  type MissionBadgeDefinition,
} from '@/lib/missions/badges'

import { MissionBadge } from './mission-badge'
import styles from './rewards.module.css'

const CEREMONY_DURATION_MS = 1200

interface BadgeUnlockCeremonyProps {
  badge: MissionBadgeDefinition
  /** A komponens kizárólag tudatosan átadott `true` értéknél játszik le. */
  active?: boolean
}

/**
 * Rövid, egyszeri feloldás: a végén eltávolítja a query paramétert az URL-ből,
 * ezért egy későbbi normál oldallátogatás nem játssza le ismét a ceremóniát.
 */
export function BadgeUnlockCeremony({ badge, active = false }: BadgeUnlockCeremonyProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [dismissed, setDismissed] = useState(false)

  const dismiss = useCallback(() => {
    setDismissed(true)
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    nextSearchParams.delete(BADGE_UNLOCK_QUERY_PARAM)
    const query = nextSearchParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    if (!active) return

    const timeout = window.setTimeout(dismiss, CEREMONY_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [active, badge.code, dismiss])

  if (!active || dismissed) return null

  return (
    <div className={styles.ceremonyOverlay}>
      <button type="button" className={styles.skipCeremony} onClick={dismiss}>
        <X aria-hidden="true" />
        Animáció kihagyása
      </button>

      <div
        className={styles.ceremonyStage}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={styles.ceremonyKicker}>
          <Sparkles aria-hidden="true" />
          Új jelvény született
        </span>

        <div className={styles.ceremonyBadge} aria-hidden="true">
          <MissionBadge
            badge={badge}
            state="new"
            idPrefix={`ceremony-${badge.code}`}
            decorative
          />
        </div>

        <h2 className={styles.ceremonyTitle}>{badge.name}</h2>
        <p className={styles.ceremonyDescription}>{badge.description}</p>

        <span className={`${styles.particle} ${styles.particleOne}`} aria-hidden="true" />
        <span className={`${styles.particle} ${styles.particleTwo}`} aria-hidden="true" />
        <span className={`${styles.particle} ${styles.particleThree}`} aria-hidden="true" />
        <span className={`${styles.particle} ${styles.particleFour}`} aria-hidden="true" />
      </div>
    </div>
  )
}
