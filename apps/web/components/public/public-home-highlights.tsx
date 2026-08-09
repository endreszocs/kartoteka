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
 * A hero alatti, gyorsan áttekinthető információs sáv.
 *
 * 2026-08-10 két javítás:
 *  - a három kártya NEM `<h2>`-vel rendereli a metaadatot. Korábban a hero
 *    h1-je után rögtön három tartalmatlan h2 jött (értelmezhetetlen
 *    dokumentum-vázlat), amit a CSS `!important`-tal vissza is tört
 *    body-fontra — vagyis vizuálisan sem címsornak szánták.
 *  - megszűnt a hero-ra lógó `margin-top: -7.25rem`, ami eltakarta a hero
 *    saját záró elemeit. Helyette hajszálvonalakkal tagolt, sík sáv.
 *
 * Az alkalom és a kapcsolati adat mindig az adott publikus oldal mentett
 * adataiból jön; üres alkalomlistánál nem jelenítünk meg feltételezett
 * vasárnapi időpontot.
 */
export function PublicHomeHighlights({ site }: { site: PublicSiteData }) {
  const highlights = buildHighlights(site)

  return (
    <section className={styles.section} aria-label="Gyors információk">
      <div className="public-container">
        <div className={styles.grid}>
          {highlights.map((item) => {
            const Icon = item.icon

            return (
              <article key={item.eyebrow} className={styles.card}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon />
                </span>
                <div className={styles.copy}>
                  <p className={`public-eyebrow ${styles.eyebrow}`}>
                    {item.eyebrow}
                  </p>
                  <p className={styles.title}>{item.title}</p>
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
