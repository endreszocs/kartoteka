import { CalendarDays, MapPin, UsersRound } from 'lucide-react'

import type { PublicSiteData } from '@/lib/public-site/site-loader'
import type { PublicEsemeny } from '@/lib/public-site/tisztsegek-events-loader'
import { formazDatum, formazIdo } from '@/lib/public-site/esemeny-format'

import styles from './public-home-highlights.module.css'

interface HighlightItem {
  eyebrow: string
  title: string
  detail: string
  icon: typeof CalendarDays
}

/**
 * A „Következő alkalom" kártya tartalma.
 *
 * ⛔ MI VOLT A HIBA (Endre jelezte): „A következő alkalom üres, pedig a
 * határidőnaplóban a dashboardon mentettem a vakációs bibliahetet."
 * A kártya KIZÁRÓLAG a weboldal külön szerkesztett, ISMÉTLŐDŐ istentiszteleti
 * rendjét (`service_times`) nézte — a határidőnaplóban nyilvánosnak jelölt,
 * KONKRÉT alkalmakról nem tudott. Márpedig egy dátumhoz kötött alkalom
 * (vakációs bibliahét, evangelizáció) pontosan az, ami a látogatót érdekli.
 *
 * MOSTANTÓL a legközelebbi KONKRÉT alkalom az erősebb; ha nincs ilyen, a
 * rendszeres alkalom; ha az sincs, marad a becsületes „Hamarosan".
 */
function kovetkezoAlkalom(
  site: PublicSiteData,
  kovetkezoEsemeny: PublicEsemeny | null,
): { title: string; detail: string } {
  if (kovetkezoEsemeny) {
    const ido = formazIdo(kovetkezoEsemeny.ido_kezdes, kovetkezoEsemeny.ido_befejezes)
    return {
      title: kovetkezoEsemeny.cim,
      detail: ido
        ? `${formazDatum(kovetkezoEsemeny.datum)} · ${ido}`
        : formazDatum(kovetkezoEsemeny.datum),
    }
  }

  const nextService = site.service_times[0]
  if (nextService) {
    return {
      title: `${nextService.day} ${nextService.time}`,
      detail: nextService.title || 'Rendszeres alkalmunk',
    }
  }

  return { title: 'Hamarosan', detail: 'Az időpontok feltöltése folyamatban van' }
}

function buildHighlights(
  site: PublicSiteData,
  kovetkezoEsemeny: PublicEsemeny | null,
): HighlightItem[] {
  const alkalom = kovetkezoAlkalom(site, kovetkezoEsemeny)
  const meetingTitle = site.address?.trim() || 'Kapcsolódj hozzánk'
  const meetingDetail =
    site.contact_phone?.trim() ||
    site.contact_email?.trim() ||
    'Szeretettel várunk'

  return [
    {
      icon: CalendarDays,
      eyebrow: 'Következő alkalom',
      title: alkalom.title,
      detail: alkalom.detail,
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
 * Az alkalom és a kapcsolati adat mindig MENTETT adatból jön (a weboldalé,
 * ennek híján a gyülekezeti adatoké); üres alkalomlistánál nem jelenítünk meg
 * feltételezett vasárnapi időpontot.
 */
export function PublicHomeHighlights({
  site,
  kovetkezoEsemeny = null,
}: {
  site: PublicSiteData
  /** A legközelebbi, nyilvánosnak jelölt konkrét alkalom (ha van). */
  kovetkezoEsemeny?: PublicEsemeny | null
}) {
  const highlights = buildHighlights(site, kovetkezoEsemeny)

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
