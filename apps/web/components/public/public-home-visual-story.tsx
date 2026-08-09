import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BookOpenText, CalendarDays, HeartHandshake, UsersRound } from 'lucide-react'

import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'

import { PublicCrest } from './public-crest'
import styles from './public-home-visual-story.module.css'

/**
 * Kezdőlapi történet-blokk (Közösség → Örökség).
 *
 * 2026-08-10-i átdolgozás, három javítással:
 *  - KÉP NÉLKÜL IS RENDERELŐDIK. Korábban `if (!community || !heritage ||
 *    !invitation) return null` volt, és ezeket az assetseket csak két téma
 *    kapta meg — a másik két témát választó gyülekezet kezdőlapjának a fele
 *    egyszerűen eltűnt. Most a gyülekezet SAJÁT hero-képe kerül ide, ha van;
 *    ha nincs, tervezett, címer-vízjeles felület, nem idegen fénykép.
 *  - a blokk többé nem tölt be Barátosi-specifikus generált fotókat minden
 *    gyülekezet oldalán;
 *  - a CSS bedrótozott sötétzöld/arany értékei helyett `--public-*` tokenek,
 *    így az egyedi primary/accent színt beállító gyülekezetnél is átszíneződik.
 */
export function PublicHomeVisualStory({ site }: { site: PublicSiteData }) {
  const ownPhoto = site.hero_image_url
  const nextService = site.service_times[0]

  return (
    <section className={styles.section} aria-label="Közösségünk bemutatása">
      <div className="public-container">
        <div className={styles.communityGrid} id="kozosseg">
          <div className={styles.media}>
            {ownPhoto ? (
              <>
                <Image
                  src={ownPhoto}
                  alt=""
                  fill
                  sizes="(min-width: 64rem) 46vw, 100vw"
                  unoptimized={shouldBypassPublicImageOptimization(ownPhoto)}
                  className={styles.mediaImage}
                />
                <span className={styles.mediaWash} aria-hidden="true" />
              </>
            ) : (
              <span className={styles.mediaPlaceholder} aria-hidden="true">
                <PublicCrest
                  src={site.crest_image_url}
                  name={site.display_name}
                  size={112}
                  shape="shield"
                  tone="onDark"
                />
              </span>
            )}

            <span className={styles.mediaCaption}>
              <HeartHandshake aria-hidden="true" />
              <span>
                <small>Nem csak vasárnap</small>
                <strong>Közösség a hétköznapokban is.</strong>
              </span>
            </span>
          </div>

          <div className={styles.copy}>
            <p className="public-eyebrow">01 · Közösség</p>
            <h2>
              Ahol minden történet <em>helyet kap.</em>
            </h2>
            <span aria-hidden="true" className="public-rule-start public-rule" />
            <p className={styles.lead}>
              Fiatalok és idősek, családok és egyedül érkezők: együtt formáljuk
              azt a közösséget, ahol a figyelem, a hit és a szolgálat valódi
              kapcsolattá válik.
            </p>

            <div className={styles.points}>
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
      </div>

      {/* 02 · Örökség — teljes szélességű tinta-sáv */}
      <div className={`public-band ${styles.heritage}`} id="orokseg">
        <span aria-hidden="true" className="public-band-hairline top-0" />
        <div className="public-container">
          <div className={styles.heritageInner}>
            <BookOpenText className={styles.heritageIcon} aria-hidden="true" />
            <p className="public-eyebrow public-eyebrow-on-dark">02 · Élő örökség</p>
            <h2>
              Ami megtartott, <em>ma is utat mutat.</em>
            </h2>
            <p>
              Az Ige, az ének és az előttünk járók hűsége nem lezárt emlék,
              hanem olyan alap, amelyből ma is reménységet és bátorságot
              meríthetünk.
            </p>
            <Link className="public-btn public-btn-on-dark" href={`/gy/${site.slug}/rolunk`}>
              Ismerd meg történetünket
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <span aria-hidden="true" className="public-band-hairline bottom-0" />
      </div>
    </section>
  )
}
