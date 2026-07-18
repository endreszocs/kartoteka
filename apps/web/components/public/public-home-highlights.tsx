import { CalendarDays, MapPin, UsersRound } from 'lucide-react'

import type { PublicSiteData } from '@/lib/public-site/site-loader'

import styles from './public-home-highlights.module.css'

interface HighlightItem {
  eyebrow: string
  title: string
  detail: string
  icon: typeof CalendarDays
}

function buildHighlights(site: PublicSiteData): HighlightItem[] {
  const nextService = site.service_times[0]
  const meetingTitle = site.address?.trim() || 'Kapcsolódj hozzánk'
  const meetingDetail =
    site.contact_phone?.trim() ||
    site.contact_email?.trim() ||
    'Szeretettel várunk'

  return [
    {
      icon: CalendarDays,
      eyebrow: 'Következő alkalom',
      title: nextService
        ? `${nextService.day} ${nextService.time}`
        : 'Hamarosan',
      detail:
        nextService?.title || 'Az időpontok feltöltése folyamatban van',
    },
    {
      icon: UsersRound,
      eyebrow: 'Nyitott közösség',
      title: 'Minden korosztálynak',
      detail: 'Gyermekekkel együtt is',
    },
    {
      icon: MapPin,
      eyebrow: 'Találkozzunk',
      title: meetingTitle,
      detail: meetingDetail,
    },
  ]
}

/**
 * A hero ele lebego, gyorsan attekintheto informacios sav.
 *
 * Az alkalom es a kapcsolati adat mindig az adott publikus oldal mentett
 * adataibol jon. Ures alkalomlistanal nem jelenitunk meg feltetelezett
 * vasarnapi idopontot.
 */
export function PublicHomeHighlights({ site }: { site: PublicSiteData }) {
  const highlights = buildHighlights(site)

  return (
    <section className={styles.section} aria-label="Gyors információk">
      <div className="public-container">
        <div className={styles.grid}>
          {highlights.map((item, index) => {
            const Icon = item.icon

            return (
              <article
                key={item.eyebrow}
                className={`public-card public-anim-fade-up public-delay-${index + 1}00 ${styles.card}`}
              >
                <span className={styles.icon} aria-hidden="true">
                  <Icon />
                </span>
                <div className={styles.copy}>
                  <p className={styles.eyebrow}>{item.eyebrow}</p>
                  <h2 className={styles.title}>{item.title}</h2>
                  <p className={styles.detail}>{item.detail}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
