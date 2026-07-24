import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  HeartHandshake,
  Mail,
  MapPin,
  Phone,
  UsersRound,
} from 'lucide-react'

import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { getPublicVisualTheme } from '@/lib/public-site/visual-theme-registry'

import styles from './public-home-visual-story.module.css'

export function PublicHomeVisualStory({ site }: { site: PublicSiteData }) {
  const visualTheme = getPublicVisualTheme(site.theme.preset_key)
  const { community, heritage, invitation } = visualTheme?.assets ?? {}

  if (!community || !heritage || !invitation) return null

  const nextService = site.service_times[0]
  const phoneHref = site.contact_phone
    ? `tel:${site.contact_phone.replace(/\s/g, '')}`
    : null

  return (
    <section className={styles.section} aria-label="Közösségünk bemutatása">
      <div className={`public-container ${styles.container}`}>
        <div className={styles.communityGrid} id="kozosseg">
          <div className={`${styles.communityMedia} ${styles.reveal}`}>
            <Image
              src={community}
              alt="Hangulati illusztráció több nemzedék gyülekezeti találkozásáról"
              fill
              sizes="(min-width: 64rem) 58vw, 100vw"
              className={styles.storyImage}
            />
            <div className={styles.imageVeil} aria-hidden="true" />
            <div className={styles.imageCaption}>
              <HeartHandshake aria-hidden="true" />
              <span>
                <small>Nem csak vasárnap</small>
                <strong>Közösség a hétköznapokban is.</strong>
              </span>
            </div>
          </div>

          <div className={`${styles.communityCopy} ${styles.reveal}`}>
            <p className={styles.eyebrow}>Közösség</p>
            <h2>Ahol minden történet helyet kap.</h2>
            <p className={styles.lead}>
              Fiatalok és idősek, családok és egyedül érkezők: együtt formáljuk
              azt a közösséget, ahol a figyelem, a hit és a szolgálat valódi
              kapcsolattá válik.
            </p>

            <div className={styles.communityPoints}>
              <article>
                <UsersRound aria-hidden="true" />
                <span>
                  <strong>Nyitott ajtó</strong>
                  <small>Minden kereső és kapcsolódni vágyó embernek.</small>
                </span>
              </article>
              <article>
                <HeartHandshake aria-hidden="true" />
                <span>
                  <strong>Közös szolgálat</strong>
                  <small>Egymás mellett, egymásért a hétköznapokban is.</small>
                </span>
              </article>
            </div>

            {nextService && (
              <a className={styles.nextService} href="#alkalmak">
                <CalendarDays aria-hidden="true" />
                <span>
                  <small>Következő közzétett alkalom</small>
                  <strong>
                    {nextService.day} {nextService.time} · {nextService.title}
                  </strong>
                </span>
                <ArrowRight aria-hidden="true" />
              </a>
            )}
          </div>
        </div>

        <div className={styles.heritagePanel} id="orokseg">
          <div className={styles.heritageMedia}>
            <Image
              src={heritage}
              alt="Hangulati illusztráció nyitott Bibliáról egy református templom padján"
              fill
              sizes="(min-width: 64rem) 50vw, 100vw"
              className={styles.heritageImage}
            />
            <div className={styles.heritageVeil} aria-hidden="true" />
          </div>

          <div className={`${styles.heritageCopy} ${styles.reveal}`}>
            <BookOpenText aria-hidden="true" />
            <p className={styles.eyebrow}>Élő örökség</p>
            <h2>Ami megtartott, ma is utat mutat.</h2>
            <p>
              Az Ige, az ének és az előttünk járók hűsége nem lezárt emlék,
              hanem olyan alap, amelyből ma is reménységet és bátorságot
              meríthetünk.
            </p>
            <Link href={`/gy/${site.slug}/rolunk`}>
              Ismerd meg történetünket
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className={`${styles.invitation} ${styles.reveal}`}>
          <Image
            src={invitation}
            alt="Hangulati illusztráció templomhoz érkező gyülekezeti tagokról"
            fill
            sizes="100vw"
            className={styles.invitationImage}
          />
          <div className={styles.invitationVeil} aria-hidden="true" />

          <div className={styles.invitationCopy}>
            <p className={styles.eyebrow}>Találkozzunk</p>
            <h2>{site.display_name}</h2>
            {site.tagline && <p>{site.tagline}</p>}

            <div className={styles.contactList}>
              {site.address && (
                <span>
                  <MapPin aria-hidden="true" />
                  {site.address}
                </span>
              )}
              {site.contact_phone && phoneHref && (
                <a href={phoneHref}>
                  <Phone aria-hidden="true" />
                  {site.contact_phone}
                </a>
              )}
              {site.contact_email && (
                <a href={`mailto:${site.contact_email}`}>
                  <Mail aria-hidden="true" />
                  {site.contact_email}
                </a>
              )}
            </div>

            <a className={styles.invitationAction} href="#alkalmak">
              Alkalmaink megtekintése
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
