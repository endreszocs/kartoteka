import { Crown, Sparkles } from 'lucide-react'

import styles from './rewards.module.css'

export interface CelebrationEntry {
  userId: string
  fullName: string
  congregationName: string
  score: number
  level: string
  ideas: number
  materials: number
  comments: number
}
interface CommunityCelebrationProps {
  entries: readonly CelebrationEntry[]
  currentUserId: string
}

export function CommunityCelebration({ entries, currentUserId }: CommunityCelebrationProps) {
  const podium = entries.slice(0, 3)
  const community = entries.slice(3)

  return (
    <section
      className={`${styles.paperPanel} ${styles.celebrationPanel}`}
      aria-labelledby="community-celebration-title"
    >
      <div className={styles.panelHeadingRow}>
        <div>
          <p className={styles.sectionKicker}>Együtt több fényt adunk</p>
          <h2 id="community-celebration-title" className={styles.panelTitle}>
            Közösségi ünneptér
          </h2>
          <p className={styles.panelSubtitle}>
            Itt nem győzteseket hirdetünk, hanem megköszönjük, amit egymás szolgálatához adunk.
          </p>
        </div>
        <span className={styles.celebrationIcon} aria-hidden="true">
          <Crown />
        </span>
      </div>

      {entries.length === 0 ? (
        <div className={styles.emptyCelebration}>
          <Sparkles size={18} aria-hidden="true" />
          <p>Az első közösségi fények hamarosan megjelennek itt.</p>
        </div>
      ) : (
        <>
          <ol className={styles.podium} aria-label="A közösség első három helyezettje">
            {podium.map((entry, index) => (
              <li
                key={entry.userId}
                className={styles.podiumCard}
                data-rank={index + 1}
                data-self={entry.userId === currentUserId}
              >
                <span className={styles.rankMedal} aria-label={`${index + 1}. hely`}>
                  {index + 1}
                </span>
                <span className={styles.avatar} aria-hidden="true">
                  {getInitials(entry.fullName)}
                </span>
                <span className={styles.personName}>
                  {entry.fullName}
                  {entry.userId === currentUserId ? ' (te)' : ''}
                </span>
                <span className={styles.personCongregation}>
                  {entry.congregationName || 'Közösségi tér'}
                </span>
                <span className={styles.personScore}>{entry.score} pont</span>
              </li>
            ))}
          </ol>

          {community.length > 0 ? (
            <ol className={styles.communityList} start={4} aria-label="További közösségi hozzájárulók">
              {community.map((entry, index) => (
                <li
                  key={entry.userId}
                  className={styles.communityRow}
                  data-self={entry.userId === currentUserId}
                >
                  <span className={styles.communityRank}>{index + 4}.</span>
                  <span className={styles.communityAvatar} aria-hidden="true">
                    {getInitials(entry.fullName)}
                  </span>
                  <span className={styles.communityIdentity}>
                    <span className={styles.communityName}>
                      {entry.fullName}
                      {entry.userId === currentUserId ? ' (te)' : ''}
                    </span>
                    <span className={styles.communityLevel}>{entry.level}</span>
                  </span>
                  <span className={styles.communityScore}>{entry.score} p</span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  )
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'K'

  return words
    .slice(-2)
    .map((word) => word[0]?.toLocaleUpperCase('hu-HU'))
    .join('')
}
