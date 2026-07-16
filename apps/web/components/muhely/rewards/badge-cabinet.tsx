import { Check, LockKeyhole, Sparkles } from 'lucide-react'

import type {
  MissionBadgeDefinition,
  MissionBadgeState,
} from '@/lib/missions/badges'

import { BadgeArtFrame, MissionBadge } from './mission-badge'
import styles from './rewards.module.css'

export interface BadgeCabinetItem {
  badge: MissionBadgeDefinition
  state: MissionBadgeState
  earnedAt?: string | null
  progress?: {
    current: number
    goal: number
    unit: string
  }
}
interface BadgeCabinetProps {
  items: readonly BadgeCabinetItem[]
}

export function BadgeCabinet({ items }: BadgeCabinetProps) {
  const earnedCount = items.filter((item) => item.state !== 'locked').length

  return (
    <section className={styles.cabinetSection} aria-labelledby="badge-cabinet-title">
      <div className={styles.cabinetHeading}>
        <div>
          <p className={styles.sectionKicker}>A szolgálat apró mérföldkövei</p>
          <h2 id="badge-cabinet-title" className={styles.panelTitle}>
            A te jelvénygyűjteményed
          </h2>
          <p className={styles.panelSubtitle}>
            Nem a versenyről szólnak: minden jelvény egy közösségnek adott ajándék emléke.
          </p>
        </div>
        <span className={styles.collectionCount}>
          {earnedCount} / {items.length} jelvény elnyerve
        </span>
      </div>

      <div className={styles.cabinet}>
        <div className={styles.cabinetInner}>
          {items.map((item) => (
            <BadgeCard key={item.badge.code} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}

function BadgeCard({ item }: { item: BadgeCabinetItem }) {
  const { badge, state, progress, earnedAt } = item
  const titleId = `badge-${badge.code}-title`
  const descriptionId = `badge-${badge.code}-description`
  const safeCurrent = Math.max(0, progress?.current ?? 0)
  const percent = progress
    ? Math.min(100, Math.round((safeCurrent / Math.max(progress.goal, 1)) * 100))
    : 0

  return (
    <article
      className={styles.badgeCard}
      data-state={state}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <BadgeStatePill state={state} />

      <BadgeArtFrame>
        <MissionBadge badge={badge} state={state} decorative />
      </BadgeArtFrame>

      <h3 id={titleId} className={styles.badgeName}>
        {badge.name}
      </h3>
      <p id={descriptionId} className={styles.badgeDescription}>
        {badge.description}
      </p>
      <span className={styles.badgeCondition}>{badge.condition}</span>

      {state === 'locked' && progress ? (
        <div
          className={styles.badgeProgress}
          aria-label={`${safeCurrent} / ${progress.goal} ${progress.unit}`}
        >
          <div className={styles.badgeProgressMeta} aria-hidden="true">
            <span>Haladás</span>
            <span>
              {Math.min(safeCurrent, progress.goal)} / {progress.goal}
            </span>
          </div>
          <div
            className={styles.badgeProgressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.goal}
            aria-valuenow={Math.min(safeCurrent, progress.goal)}
          >
            <div className={styles.badgeProgressFill} style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : earnedAt ? (
        <p className={styles.earnedDate}>
          Elnyerve: <time dateTime={earnedAt}>{formatEarnedDate(earnedAt)}</time>
        </p>
      ) : state !== 'locked' ? (
        <p className={styles.earnedDate}>A gyűjteményed része</p>
      ) : null}
    </article>
  )
}

function BadgeStatePill({ state }: { state: MissionBadgeState }) {
  if (state === 'new') {
    return (
      <span className={styles.badgeStatePill} aria-label="Újonnan elnyert jelvény">
        <Sparkles aria-hidden="true" />
        Új
      </span>
    )
  }

  if (state === 'earned') {
    return (
      <span className={styles.badgeStatePill} aria-label="Elnyert jelvény">
        <Check aria-hidden="true" />
        Elnyerve
      </span>
    )
  }

  return (
    <span className={styles.badgeStatePill} aria-label="Még nem elnyert jelvény">
      <LockKeyhole aria-hidden="true" />
      Zárolva
    </span>
  )
}

function formatEarnedDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'korábban'

  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
