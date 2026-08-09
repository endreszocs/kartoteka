import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Clock3,
  DoorOpen,
  HeartHandshake,
  Mail,
  MapPin,
  Newspaper,
  Phone,
  Quote,
  UsersRound,
} from 'lucide-react'

import type { MagazineWithIssues } from '@/lib/public-site/magazine-loader'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'
import type {
  PublicPostListItem,
  PublicSiteData,
} from '@/lib/public-site/site-loader'
import {
  CINEMATIC_PUBLIC_THEME_KEY,
  PUBLIC_VISUAL_THEMES,
} from '@/lib/public-site/visual-theme-registry'

import { resolveThemeColors } from '@/lib/public-site/theme-presets'

import { PublicAgeDistribution } from './public-age-distribution'
import { PublicCrest } from './public-crest'
import { PublicEmptyState } from './public-empty-state'
import { PublicMobileNav } from './public-mobile-nav'
import styles from './public-site-cinematic-preview.module.css'

interface PublicCinematicStats {
  members: number
  presbyters: number
  families: number
}

interface PublicCinematicAgeDistribution {
  under18: number
  age18To35: number
  age36To59: number
  age60Plus: number
  total: number
}

interface PublicCinematicHomeProps {
  site: PublicSiteData
  recentPosts?: readonly PublicPostListItem[]
  magazine?: MagazineWithIssues | null
  stats?: PublicCinematicStats
  ageDistribution?: PublicCinematicAgeDistribution | null
  safeAboutHtml?: string | null
  memberPortalEnabled?: boolean
}

const CINEMATIC_ASSETS = PUBLIC_VISUAL_THEMES[CINEMATIC_PUBLIC_THEME_KEY].assets

function formatPublishedDate(value: string | null): string | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('hu-HU', {
    dateStyle: 'long',
    timeZone: 'Europe/Bucharest',
  }).format(date)
}

export function PublicCinematicHome({
  site,
  recentPosts = [],
  magazine = null,
  stats,
  ageDistribution = null,
  safeAboutHtml = null,
  memberPortalEnabled = false,
}: PublicCinematicHomeProps) {
  const nextService = site.service_times[0]
  const latestIssue = magazine?.issues[0] ?? null
  // 2026-08-10: a három nagy képhely a gyülekezet SAJÁT feltöltött képét
  // használja; ha nincs, a téma dekoratív textúrája jön (mindig `alt=""`,
  // erős fátyol alatt). A korábbi, Barátosi-specifikus generált fotókat
  // („Hangulati illusztráció a mi közösségünkről") kivezettük — minden más
  // gyülekezet oldalán hitelesség-rombolók voltak.
  const heroImage = site.hero_image_url || CINEMATIC_ASSETS.hero
  const communityImage = heroImage
  const heritageImage = heroImage
  const resolvedColors = resolveThemeColors(
    site.theme,
    site.custom_primary_color,
    site.custom_accent_color,
  )
  const contactHref = site.contact_email
    ? `mailto:${site.contact_email}`
    : site.contact_phone
      ? `tel:${site.contact_phone.replace(/\s/g, '')}`
      : `/gy/${site.slug}/rolunk`
  const contactLabel = site.contact_email || site.contact_phone || 'Kapcsolat és bemutatkozás'
  const highlights = [
    {
      icon: CalendarDays,
      eyebrow: 'Következő alkalom',
      value: nextService ? `${nextService.day} ${nextService.time}` : 'Hamarosan',
      label: nextService?.title || 'Az időpontok feltöltése folyamatban van',
    },
    {
      icon: UsersRound,
      eyebrow: 'Nyitott közösség',
      value: 'Minden korosztálynak',
      label: 'Gyermekekkel együtt is szeretettel várunk',
    },
    {
      icon: MapPin,
      eyebrow: 'Találkozzunk',
      value: site.address || 'Kapcsolódj hozzánk',
      label: site.contact_phone || site.contact_email || 'Szeretettel várunk',
    },
  ]
  const statItems = stats
    ? [
        site.show_member_count
          ? { value: stats.members, label: 'aktív gyülekezeti tag' }
          : null,
        site.show_presbyter_count
          ? { value: stats.presbyters, label: 'presbiter' }
          : null,
        site.show_family_count
          ? { value: stats.families, label: 'család' }
          : null,
      ].filter((item): item is { value: number; label: string } => Boolean(item))
    : []

  return (
    <div className={styles.cinematicPage}>
      <a className={styles.skipLink} href="#public-main-content">
        Ugrás a fő tartalomra
      </a>

      <header className={styles.siteHeader}>
        <Link
          className={styles.brand}
          href={`/gy/${site.slug}`}
          aria-label={`${site.display_name} kezdőlap`}
        >
          <PublicCrest
            src={site.crest_image_url}
            name={site.display_name}
            size={44}
            shape="shield"
            tone="onDark"
          />
          <span className={styles.brandCopy}>
            <strong>{site.display_name}</strong>
            <small>{site.tagline || 'Hitben · reménységben · közösségben'}</small>
          </span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Fő navigáció">
          <Link href={`/gy/${site.slug}`}>Kezdőlap</Link>
          <Link href={`/gy/${site.slug}/posts`}>Hírek</Link>
          <Link href={`/gy/${site.slug}/magazin`}>Magazin</Link>
          <Link href={`/gy/${site.slug}/rolunk`}>Rólunk</Link>
          {memberPortalEnabled && (
            <Link href={`/gy/${site.slug}/tagi-portal`}>Tagi portál</Link>
          )}
        </nav>

        <a className={styles.headerCta} href="#alkalmak">
          <span>Találkozzunk</span>
          <ArrowRight aria-hidden="true" />
        </a>

        {/* 2026-08-10: valódi mobil menü a korábbi „hamburger helyén álló
            naptár-ikon + vízszintesen görgethető chip-sor" helyett. Ugyanaz a
            fókuszcsapdás, Escape-kezelő, aria-current-es komponens fut, mint a
            többi témán — nincs többé két külön navigáció-implementáció. */}
        <PublicMobileNav
          slug={site.slug}
          displayName={site.display_name}
          crestImageUrl={site.crest_image_url}
          primaryColor={resolvedColors.primary}
          primaryOnSurfaceColor={resolvedColors.primaryOnSurface}
          inkColor={resolvedColors.ink}
          memberPortalEnabled={memberPortalEnabled}
          tone="onDark"
        />
      </header>

      <main id="public-main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="cinematic-title">
          <div className={styles.heroMedia} aria-hidden="true">
            <Image
              src={heroImage}
              alt=""
              fill
              preload
              sizes="100vw"
              unoptimized={shouldBypassPublicImageOptimization(heroImage)}
              className={styles.heroImage}
            />
          </div>
          <div className={styles.heroVeil} aria-hidden="true" />
          <div className={styles.heroGlow} aria-hidden="true" />

          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>
              <span aria-hidden="true" />
              {site.address || 'Hit · reménység · közösség'}
            </p>
            {/* 2026-08-10: a h1 a GYÜLEKEZET NEVE. Korábban minden ezt a
                témát választó gyülekezet ugyanazzal a bedrótozott h1-gyel
                („Hazaérkezni a közösségbe.") indexelődött, és a látogató a
                hero-ból nem tudta meg, melyik gyülekezet oldalán jár. */}
            <h1 id="cinematic-title">{site.display_name}</h1>
            <p className={styles.heroLead}>
              {site.tagline ? `„${site.tagline}”` : 'Hazaérkezni a közösségbe.'}
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryAction} href="#kozosseg">
                Fedezd fel közösségünket
                <ArrowRight aria-hidden="true" />
              </a>
              <a className={styles.textAction} href="#alkalmak">
                {nextService ? `${nextService.day} ${nextService.time}` : 'Alkalmaink'}
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
              <strong>{nextService?.title || 'Az időpont hamarosan elérhető'}</strong>
              <span>
                {nextService
                  ? `${nextService.day} ${nextService.time}${nextService.location ? ` · ${nextService.location}` : ''}`
                  : 'Érdeklődj az elérhetőségeinken'}
              </span>
            </span>
          </aside>

          <a className={styles.scrollCue} href="#gyors-informaciok" aria-label="Tovább a gyors információkhoz">
            <span>Görgess</span>
            <i aria-hidden="true" />
          </a>
        </section>

        <section
          className={styles.valuesStrip}
          id="gyors-informaciok"
          aria-label="Gyors információk"
        >
          {highlights.map((item) => {
            const Icon = item.icon
            return (
              <article key={item.eyebrow} className={styles.valueItem}>
                <Icon aria-hidden="true" />
                <span>
                  <small>{item.eyebrow}</small>
                  <strong>{item.value}</strong>
                  <span className={styles.valueDetail}>{item.label}</span>
                </span>
              </article>
            )
          })}
        </section>

        <section className={styles.communitySection} id="kozosseg">
          <div className={`${styles.communityVisual} ${styles.scrollReveal}`}>
            <Image
              src={communityImage}
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
            {safeAboutHtml ? (
              <div
                className={styles.aboutProse}
                dangerouslySetInnerHTML={{ __html: safeAboutHtml }}
              />
            ) : (
              <p className={styles.sectionLead}>
                Fiatalok és idősek, családok és egyedül érkezők: nem nézői, hanem
                részei vagyunk annak, amit együtt építünk.
              </p>
            )}
            <div className={styles.communityPoints}>
              <article>
                <DoorOpen aria-hidden="true" />
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
            <Link className={styles.inlineLink} href={`/gy/${site.slug}/rolunk`}>
              Ismerj meg minket közelebbről
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        {statItems.length > 0 && (
          <section className={styles.statsSection} aria-labelledby="cinematic-stats-title">
            <div className={styles.statsHeading}>
              <p className={styles.sectionNumber}>Közösségünk számokban</p>
              <h2 id="cinematic-stats-title">Együtt vagyunk otthon.</h2>
            </div>
            <div className={styles.statsGrid}>
              {statItems.map((item) => (
                <article key={item.label} className={styles.statItem}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          </section>
        )}

        {site.show_age_distribution && ageDistribution && (
          <PublicAgeDistribution
            distribution={ageDistribution}
            themeKey={CINEMATIC_PUBLIC_THEME_KEY}
          />
        )}

        <section className={styles.interlude} aria-label="Küldetésünk">
          <div className={`${styles.interludeInner} ${styles.scrollReveal}`}>
            <Quote aria-hidden="true" />
            <p>„{site.tagline || 'Hitben, reménységben, közösségben.'}”</p>
            <span>{site.display_name}</span>
          </div>
        </section>

        <section className={styles.newsSection} id="hirek" aria-labelledby="cinematic-news-title">
          <div className={styles.newsHeading}>
            <div>
              <p className={styles.sectionNumber}>02 · Hírek</p>
              <h2 id="cinematic-news-title">Történetek közösségünk életéből.</h2>
            </div>
            <Link href={`/gy/${site.slug}/posts`}>
              Összes hír <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          {recentPosts.length > 0 ? (
            <div className={styles.newsGrid}>
              {recentPosts.map((post) => {
                // 2026-08-10: borítókép hiányában NEM töltjük fel a kártyát a
                // téma fotójával — az idegen gyülekezet fényképét sugallta.
                const publishedDate = formatPublishedDate(post.published_at)

                return (
                  <article key={post.id} className={`${styles.newsCard} ${styles.scrollReveal}`}>
                    <Link href={`/gy/${site.slug}/posts/${post.slug}`}>
                      <span className={styles.newsMedia}>
                        {post.cover_image_url ? (
                          <Image
                            src={post.cover_image_url}
                            alt=""
                            fill
                            sizes="(min-width: 960px) 33vw, (min-width: 640px) 50vw, 100vw"
                            unoptimized={shouldBypassPublicImageOptimization(
                              post.cover_image_url,
                            )}
                            className={styles.newsImage}
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              inset: 0,
                              display: 'grid',
                              placeItems: 'center',
                              background:
                                'linear-gradient(155deg, var(--public-primary), var(--public-primary-deep))',
                              color: 'rgba(255,255,255,0.28)',
                              fontFamily: 'var(--public-heading-font)',
                              fontSize: '4.5rem',
                              lineHeight: 1,
                            }}
                          >
                            {post.title.charAt(0)}
                          </span>
                        )}
                        <span aria-hidden="true" />
                      </span>
                      <span className={styles.newsCopy}>
                        {publishedDate && <small>{publishedDate}</small>}
                        <strong>{post.title}</strong>
                        {post.excerpt && <span>{post.excerpt}</span>}
                        <i>
                          Tovább olvasom <ArrowRight aria-hidden="true" />
                        </i>
                      </span>
                    </Link>
                  </article>
                )
              })}
            </div>
          ) : (
            <PublicEmptyState
              title="Hamarosan itt jelennek meg közösségünk első hírei."
              description="Addig is szeretettel várunk a rendszeres alkalmainkon."
              actionHref="#alkalmak"
              actionLabel="Alkalmaink megtekintése"
            />
          )}
        </section>

        <section className={styles.heritageSection} id="orokseg">
          <div className={styles.heritageMedia} aria-hidden="true">
            <Image
              src={heritageImage}
              alt=""
              fill
              sizes="100vw"
              className={styles.heritageImage}
            />
            <div className={styles.heritageVeil} />
          </div>

          <div className={`${styles.heritageContent} ${styles.scrollReveal}`}>
            <p className={styles.sectionNumber}>03 · Örökség</p>
            <h2>{latestIssue ? 'Lapozz bele közös történetünkbe.' : 'Ami megtartott, ma is utat mutat.'}</h2>
            <p>
              {latestIssue
                ? latestIssue.notes || `${magazine?.magazine.title || 'Gyülekezeti magazinunk'} legfrissebb lapszáma már olvasható.`
                : 'Az Ige, az ének és az előttünk járók hűsége olyan alap, amelyből ma is bátorságot meríthetünk.'}
            </p>
            <div className={styles.heritageDetail}>
              {latestIssue ? <Newspaper aria-hidden="true" /> : <BookOpenText aria-hidden="true" />}
              <span>
                <small>{latestIssue ? 'Gyülekezeti magazin' : 'Élő református örökség'}</small>
                <strong>{latestIssue?.title || latestIssue?.issue_number || 'Nemzedékről nemzedékre'}</strong>
              </span>
            </div>
            <Link className={styles.heritageLink} href={`/gy/${site.slug}/magazin`}>
              {latestIssue ? 'Legfrissebb lapszám' : 'Magazin megnyitása'}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className={styles.gatherSection} id="alkalmak">
          <div className={`${styles.gatherHeading} ${styles.scrollReveal}`}>
            <p className={styles.sectionNumber}>04 · Találkozás</p>
            <h2>Gyere úgy, ahogy vagy.</h2>
            <p>
              Az első lépés lehet egy istentisztelet, egy közösségi alkalom vagy
              egyszerűen egy beszélgetés. Szeretettel várunk.
            </p>
          </div>

          {site.service_times.length > 0 ? (
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
                  {serviceTime.note && <p>{serviceTime.note}</p>}
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.scheduleEmpty}>
              <CalendarDays aria-hidden="true" />
              <div>
                <strong>Az alkalmak időpontjai még nincsenek közzétéve.</strong>
                <p>Az aktuális időpontokról érdeklődj az elérhetőségeinken.</p>
              </div>
            </div>
          )}

          <div className={`${styles.contactRibbon} ${styles.scrollReveal}`}>
            <span className={styles.contactIcon} aria-hidden="true">
              <Clock3 />
            </span>
            <div>
              <small>Bizonytalan vagy, melyik alkalom neked való?</small>
              <strong>{contactLabel}</strong>
            </div>
            <a href={contactHref}>
              Kapcsolatfelvétel
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.siteFooter}>
        <div className={styles.footerBrand}>
          {/* 2026-08-10: a lábléc is a gyülekezet címerét mutatja — korábban
              itt mindig templom-ikon volt, miközben a fejléc a címert. */}
          <PublicCrest
            src={site.crest_image_url}
            name={site.display_name}
            size={44}
            shape="shield"
          />
          <span>
            <strong>{site.display_name}</strong>
            <small>{site.tagline || 'Hitben · reménységben · közösségben'}</small>
          </span>
        </div>
        <div className={styles.footerContact}>
          {site.address && <span><MapPin aria-hidden="true" />{site.address}</span>}
          {site.contact_phone && <a href={`tel:${site.contact_phone.replace(/\s/g, '')}`}><Phone aria-hidden="true" />{site.contact_phone}</a>}
          {site.contact_email && <a href={`mailto:${site.contact_email}`}><Mail aria-hidden="true" />{site.contact_email}</a>}
        </div>
        <a href="#public-main-content">
          Vissza az elejére <ArrowRight aria-hidden="true" />
        </a>
        <p>© {new Date().getFullYear()} {site.display_name} · Működik a Kartotéka rendszerrel</p>
      </footer>
    </div>
  )
}
