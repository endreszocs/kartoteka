import {
  BookOpen,
  Check,
  HeartHandshake,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Sprout,
} from 'lucide-react'

import {
  getMissionProgress,
  MISSION_LEVELS,
  type MissionUserStats,
} from '@/lib/missions/gamification'

import styles from './rewards.module.css'

interface RewardsOverviewProps {
  stats: MissionUserStats
}
export function RewardsOverview({ stats }: RewardsOverviewProps) {
  const points = Math.max(0, stats.osszpontszam || 0)
  const progress = getMissionProgress(points)
  const remaining = progress.next ? Math.max(0, progress.next.minPoints - points) : 0

  return (
    <>
      <div className={styles.overviewGrid}>
        <section className={`${styles.paperPanel} ${styles.progressPanel}`} aria-labelledby="level-title">
          <div className={styles.levelSeal} aria-hidden="true">
            <div className={styles.levelSealInner}>
              <Sprout />
            </div>
          </div>

          <div>
            <p className={styles.sectionKicker}>A szolgálati utad</p>
            <h2 id="level-title" className={styles.levelName}>
              {progress.current.name}
            </h2>
            <p className={styles.levelDescription}>{progress.current.description}</p>

            <div className={styles.progressMeta}>
              <span className={styles.pointTotal}>{points} pont</span>
              <span>{progress.next ? progress.next.name : 'A legmagasabb szint'}</span>
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label={
                progress.next
                  ? `Haladás a(z) ${progress.next.name} szint felé`
                  : 'A legmagasabb szint elérve'
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
            </div>
            <p className={styles.nextLevelText}>
              {progress.next
                ? `Még ${remaining} pont, és új szint nyílik meg.`
                : 'A közösség egyik példaadó missziói bajnoka vagy.'}
            </p>
          </div>
        </section>

        <section className={`${styles.paperPanel} ${styles.levelTrailPanel}`} aria-labelledby="level-trail-title">
          <div className={styles.panelHeadingRow}>
            <div>
              <p className={styles.sectionKicker}>Lépésről lépésre</p>
              <h2 id="level-trail-title" className={styles.panelTitle}>
                Szintrendszer
              </h2>
            </div>
          </div>

          <ol className={styles.levelTrail}>
            {MISSION_LEVELS.map((level) => {
              const reached = points >= level.minPoints
              const current = level.name === progress.current.name

              return (
                <li
                  key={level.name}
                  className={styles.levelTrailItem}
                  data-reached={reached}
                  data-current={current}
                  aria-current={current ? 'step' : undefined}
                >
                  <span className={styles.levelDot} aria-hidden="true">
                    {reached ? <Check size={12} /> : null}
                  </span>
                  <span className={styles.levelTrailName}>{level.name}</span>
                  <span className={styles.levelTrailPoints}>{level.minPoints}+ p</span>
                </li>
              )
            })}
          </ol>
        </section>
      </div>

      <Contributions stats={stats} />
    </>
  )
}

function Contributions({ stats }: RewardsOverviewProps) {
  const contributions = [
    { label: 'beküldött ötlet', value: stats.otletek_szama || 0, icon: Lightbulb },
    { label: 'adott támogatás', value: stats.tamogatasok_adva || 0, icon: HeartHandshake },
    { label: 'megosztott anyag', value: stats.segedanyagok_feltoltve || 0, icon: BookOpen },
    { label: 'hozzászólás', value: stats.hozzaszolasok_szama || 0, icon: MessageCircle },
    { label: 'teljesített feladat', value: stats.feladatok_teljesitve || 0, icon: ListChecks },
    { label: 'megvalósult ötlet', value: stats.megvalosult_otletek || 0, icon: Sprout },
  ]

  return (
    <section className={`${styles.paperPanel} ${styles.contributionPanel}`} aria-labelledby="contributions-title">
      <div className={styles.panelHeadingRow}>
        <div>
          <p className={styles.sectionKicker}>Minden mozdulat számít</p>
          <h2 id="contributions-title" className={styles.panelTitle}>
            Hozzájárulásaid
          </h2>
        </div>
      </div>

      <div className={styles.contributionGrid}>
        {contributions.map(({ label, value, icon: Icon }) => (
          <div key={label} className={styles.contributionCard}>
            <span className={styles.contributionIcon} aria-hidden="true">
              <Icon />
            </span>
            <div>
              <div className={styles.contributionValue}>{value}</div>
              <div className={styles.contributionLabel}>{label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
