import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import { LockKeyhole } from 'lucide-react'

import type {
  MissionBadgeDefinition,
  MissionBadgeState,
} from '@/lib/missions/badges'

import styles from './rewards.module.css'

interface MissionBadgeProps {
  badge: MissionBadgeDefinition
  state: MissionBadgeState
  /** Visszafelé kompatibilis az SVG-verzió ceremónia-hívásaival. */
  idPrefix?: string
  className?: string
  decorative?: boolean
}

type BadgeCssProperties = CSSProperties & {
  '--badge-accent': string
}

const BADGE_STATE_LABEL: Record<MissionBadgeState, string> = {
  locked: 'zárolva',
  earned: 'elnyerve',
  new: 'újonnan elnyerve',
}

export function MissionBadge({
  badge,
  state,
  className = '',
  decorative = false,
}: MissionBadgeProps) {
  const cssProperties: BadgeCssProperties = {
    '--badge-accent': badge.color,
  }

  return (
    <span
      className={`${styles.badgeRoot} ${styles[state]} ${className}`}
      style={cssProperties}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `${badge.name} jelvény, ${BADGE_STATE_LABEL[state]}`}
      aria-hidden={decorative || undefined}
    >
      <span className={styles.badgeHalo} aria-hidden="true" />
      <span className={styles.badgeImageShell} aria-hidden="true">
        <Image
          src={badge.imageSrc}
          alt=""
          fill
          sizes="(max-width: 389px) 160px, (max-width: 640px) 42vw, 224px"
          loading={state === 'new' ? 'eager' : 'lazy'}
          className={styles.badgeImage}
        />
      </span>
      {state === 'locked' && (
        <span className={styles.badgeLockOverlay} aria-hidden="true">
          <LockKeyhole />
        </span>
      )}
      <span className={styles.badgeSweep} aria-hidden="true" />
    </span>
  )
}

export function BadgeArtFrame({ children }: { children: ReactNode }) {
  return <span className={styles.badgeArtFrame}>{children}</span>
}
