import Image from 'next/image'
import type { CSSProperties } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Church,
  Clock3,
  HeartHandshake,
  MapPin,
  Quote,
  Sparkles,
  UsersRound,
} from 'lucide-react'

import type { PublicSiteData } from '@/lib/public-site/site-loader'

import { PublicThemeRoot } from './public-theme-root'
import styles from './public-site-cinematic-preview.module.css'

const CINEMATIC_ASSETS = {
  hero: '/public-site/themes/elo-kert/baratosi-hero-v2.png',
  community: '/public-site/themes/elo-kert/baratosi-community-v2.png',
  heritage: '/public-site/themes/elo-kert/baratosi-heritage-v2.png',
} as const

const COMMUNITY_VALUES = [
  { icon: Church, value: 'Nyitott ajtó', label: 'Minden kereső embernek' },
  { icon: UsersRound, value: 'Élő közösség', label: 'Egymás mellett, egymásért' },
  { icon: HeartHandshake, value: 'Közös szolgálat', label: 'Hittel a hétköznapokban' },
] as const

interface PublicSiteCinematicPreviewProps {
  site: PublicSiteData
}

export function PublicSiteCinematicPreview({ site }: PublicSiteCinematicPreviewProps) {
  return (
    <PublicThemeRoot presetKey="elo-kert">
      <div className={styles.cinematicPage}>
        <a className={styles.skipLink} href="#cinematic-main">
          Ugrás a fő tartalomra
        </a>

        <header className={styles.siteHeader}>
          <a className={styles.brand} href="#cinematic-main" aria-label={`${site.display_name} kezdőlap`}>
            <span className={styles.brandMark} aria-hidden="true">
              <Church />
            </span>
            <span className={styles.brandCopy}>
              <strong>Barátos</strong>
              <small>Református Egyházközség</small>
            </span>
          </a>

          <nav className={styles.desktopNav} aria-label="Fő navigáció">
            <a href="#kozosseg">Közösség</a>
            <a href="#orokseg">Örökség</a>
            <a href="#alkalmak">Alkalmaink</a>
          </nav>

          <a className={styles.headerCta} href="#alkalmak">
            <span>Találkozzunk</span>
            <ArrowRight aria-hidden="true" />
          </a>

          <a className={styles.mobileMenu} href="#alkalmak" aria-label="Ugrás az alkalmakhoz">
            <CalendarDays aria-hidden="true" />
          </a>
        </header>

        <main id="cinematic-main" tabIndex={-1}>
          <section className={styles.hero} aria-labelledby="cinematic-title">
            <div className={styles.heroMedia} aria-hidden="true">
              <Image
                src={CINEMATIC_ASSETS.hero}
                alt=""
                fill
                preload
                sizes="100vw"
                className={styles.heroImage}
              />
            </div>
            <div className={styles.heroVeil} aria-hidden="true" />
            <div className={styles.heroGlow} aria-hidden="true" />

            <div className={styles.heroContent}>
              <p className={styles.heroEyebrow}>
                <span aria-hidden="true" />
                Barátos · hit · közösség
              </p>
              <h1 id="cinematic-title">
                Hazaérkezni
                <em>a közösségbe.</em>
              </h1>
              <p className={styles.heroLead}>
                Egy hely, ahol az örökség nem a múltban marad, hanem szeretetté,
                szolgálattá és közös jövővé válik.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryAction} href="#kozosseg">
                  Fedezd fel közösségünket
                  <ArrowRight aria-hidden="true" />
                </a>
                <a className={styles.textAction} href="#alkalmak">
                  Vasárnap 10:00
                  <ArrowDown aria-hidden="true" />
                </a>
              </div>
            </div>

            <aside className={styles.heroEvent} aria-label="Következő alkalom">
              <span className={styles.eventIcon} aria-hidden="true">
                <CalendarDays />
              </span>
              <span className={styles.eventCopy}>
                <small>Következő találkozás</small>
                <strong>Vasárnapi istentisztelet</strong>
                <span>10:00 · Református templom</span>
              </span>
              <ArrowRight className={styles.eventArrow} aria-hidden="true" />
            </aside>

            <a className={styles.scrollCue} href="#kozosseg" aria-label="Tovább a közösség bemutatásához">
              <span>Görgess</span>
              <i aria-hidden="true" />
            </a>
          </section>

          <section className={styles.valuesStrip} aria-label="Közösségi értékek">
            {COMMUNITY_VALUES.map((item) => {
              const Icon = item.icon
              return (
                <article key={item.value} className={styles.valueItem}>
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{item.value}</strong>
                    <small>{item.label}</small>
                  </span>
                </article>
              )
            })}
          </section>

          <section className={styles.communitySection} id="kozosseg">
            <div className={`${styles.communityVisual} ${styles.scrollReveal}`}>
              <Image
                src={CINEMATIC_ASSETS.community}
                alt="Filmszerű illusztráció egy többnemzedékes gyülekezeti találkozásról"
                fill
                sizes="(min-width: 960px) 56vw, 100vw"
                className={styles.communityImage}
              />
              <div className={styles.imageWash} aria-hidden="true" />
              <div className={styles.communityCaption}>
                <span>Nem csak vasárnap</span>
                <strong>Közösség a hétköznapokban is.</strong>
              </div>
            </div>

            <div className={`${styles.communityCopy} ${styles.scrollReveal}`}>
              <p className={styles.sectionNumber}>01 · Közösség</p>
              <h2>Ahol minden történet helyet kap.</h2>
              <p className={styles.sectionLead}>
                Fiatalok és idősek, családok és egyedül érkezők: nem nézői, hanem
                részei vagyunk annak, amit együtt építünk.
              </p>
              <div className={styles.communityPoints}>
                <article>
                  <Sparkles aria-hidden="true" />
                  <div>
                    <strong>Kapcsolódás</strong>
                    <p>Olyan alkalmak, ahol ismerőssé válik az idegenből érkező is.</p>
                  </div>
                </article>
                <article>
                  <HeartHandshake aria-hidden="true" />
                  <div>
                    <strong>Gondoskodás</strong>
                    <p>Figyelem a csendes szükségletekre és öröm a közös szolgálatban.</p>
                  </div>
                </article>
              </div>
              <a className={styles.inlineLink} href="#alkalmak">
                Nézd meg, mikor találkozunk
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>

          <section className={styles.interlude} aria-label="Küldetésünk">
            <div className={`${styles.interludeInner} ${styles.scrollReveal}`}>
              <Quote aria-hidden="true" />
              <p>
                „A templom falai őrzik a múltat. A közösség szeretete teszi élővé a jelent.”
              </p>
              <span>Látványtervi vezérgondolat</span>
            </div>
          </section>

          <section className={styles.heritageSection} id="orokseg">
            <div className={styles.heritageMedia} aria-hidden="true">
              <Image
                src={CINEMATIC_ASSETS.heritage}
                alt=""
                fill
                sizes="100vw"
                className={styles.heritageImage}
              />
              <div className={styles.heritageVeil} />
            </div>

            <div className={`${styles.heritageContent} ${styles.scrollReveal}`}>
              <p className={styles.sectionNumber}>02 · Örökség</p>
              <h2>Ami megtartott, ma is utat mutat.</h2>
              <p>
                Az Ige, az ének és az előttünk járók hűsége nem vitrinekbe zárt emlék.
                Olyan alap, amelyből ma is bátorságot meríthetünk.
              </p>
              <div className={styles.heritageDetail}>
                <BookOpenText aria-hidden="true" />
                <span>
                  <small>Élő református örökség</small>
                  <strong>Nemzedékről nemzedékre</strong>
                </span>
              </div>
            </div>
          </section>

          <section className={styles.gatherSection} id="alkalmak">
            <div className={`${styles.gatherHeading} ${styles.scrollReveal}`}>
              <p className={styles.sectionNumber}>03 · Találkozás</p>
              <h2>Gyere úgy, ahogy vagy.</h2>
              <p>
                Az első lépés lehet egy vasárnapi istentisztelet, egy bibliaóra vagy
                egyszerűen egy beszélgetés. Szeretettel várunk.
              </p>
            </div>

            <div className={styles.scheduleGrid}>
              {site.service_times.map((serviceTime, index) => (
                <article
                  key={serviceTime.id}
                  className={`${styles.scheduleCard} ${styles.scrollReveal}`}
                  style={{ '--card-index': index } as CSSProperties}
                >
                  <span className={styles.scheduleDay}>{serviceTime.day}</span>
                  <strong>{serviceTime.time}</strong>
                  <h3>{serviceTime.title}</h3>
                  {serviceTime.location && (
                    <p>
                      <MapPin aria-hidden="true" />
                      {serviceTime.location}
                    </p>
                  )}
                  <ArrowRight aria-hidden="true" />
                </article>
              ))}
            </div>

            <div className={`${styles.contactRibbon} ${styles.scrollReveal}`}>
              <span className={styles.contactIcon} aria-hidden="true">
                <Clock3 />
              </span>
              <div>
                <small>Bizonytalan vagy, melyik alkalom neked való?</small>
                <strong>Írj nekünk, segítünk megtalálni az első kapcsolódási pontot.</strong>
              </div>
              <a href="#cinematic-main">
                Kapcsolatfelvétel
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>
        </main>

        <footer className={styles.siteFooter}>
          <div className={styles.footerBrand}>
            <span className={styles.brandMark} aria-hidden="true">
              <Church />
            </span>
            <span>
              <strong>{site.display_name}</strong>
              <small>Hitben · reménységben · közösségben</small>
            </span>
          </div>
          <p>Jóváhagyásra szánt látványterv · a tartalom mintaadat</p>
          <a href="#cinematic-main">Vissza az elejére <ArrowRight aria-hidden="true" /></a>
        </footer>
      </div>
    </PublicThemeRoot>
  )
}
