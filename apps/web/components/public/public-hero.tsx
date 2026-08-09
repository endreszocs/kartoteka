import Image from 'next/image'
import { CalendarDays } from 'lucide-react'

import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { getPublicVisualTheme } from '@/lib/public-site/visual-theme-registry'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'

import { PublicCrest } from './public-crest'

/**
 * 2026-08-10 — Újratervezett hero: „névtábla" a kép alsó harmadában.
 *
 * Mit javít a korábbi változathoz képest:
 *  - a gyülekezet CÍMERE mindig megjelenik (korábban csak a soha nem
 *    használt `hero_style === 'crest'` ágon), méghozzá pajzs-keretben,
 *    `object-contain`-nel — nem négyzetre vágva;
 *  - eltűntek az elmosott, lebegő színes körök (generikus SaaS-szótár),
 *    helyettük egy arany hajszálvonal zárja a szekciót;
 *  - eltűnt a „Görgess" jelzés, amit a lebegő infó-kártyák amúgy is
 *    eltakartak;
 *  - kép nélkül is erős a kontraszt (a régi 0.1→0.35 overlay fehér szöveg
 *    alatt megbukott, főleg a `gradient` hero-stíluson).
 */
export function PublicHero({ site }: { site: PublicSiteData }) {
  const visualTheme = getPublicVisualTheme(site.theme.preset_key)
  const heroImageUrl = site.hero_image_url || visualTheme?.assets.hero || null
  const hasImage = !!heroImageUrl
  const heroStyle = site.theme.hero_style
  const nextService = site.service_times[0]

  return (
    <section className="relative isolate overflow-hidden">
      {/* ── Háttér ─────────────────────────────────────────── */}
      {hasImage ? (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="public-anim-ken-burns absolute inset-0">
            <Image
              src={heroImageUrl}
              alt=""
              fill
              preload
              sizes="100vw"
              unoptimized={shouldBypassPublicImageOptimization(heroImageUrl)}
              className="object-cover"
              style={{
                objectPosition: visualTheme?.hero.backgroundPosition || 'center',
              }}
            />
          </div>
        </div>
      ) : (
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              heroStyle === 'gradient'
                ? // Fehér szöveg SOHA nem kerül nyers aranyra: a gradiens
                  // vége a mély tinta-primary, nem az akcentus.
                  `linear-gradient(150deg, var(--public-primary) 0%, color-mix(in srgb, var(--public-primary) 62%, var(--public-accent)) 46%, var(--public-primary-deep) 100%)`
                : `linear-gradient(150deg, var(--public-primary) 0%, var(--public-primary-deep) 100%)`,
          }}
        />
      )}

      {/* Olvashatósági fátyol — képnél és kép nélkül is legalább 4.5:1 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background: hasImage
            ? visualTheme?.hero.overlay ||
              'linear-gradient(175deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.58) 45%, rgba(0,0,0,0.82) 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.52) 100%)',
        }}
      />

      {/* Diszkrét, gravírozott minta a fotó nélküli változaton */}
      {!hasImage && (
        <svg
          className="absolute inset-0 -z-10 h-full w-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="hero-engrave"
              x="0"
              y="0"
              width="72"
              height="72"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M36 14v44M22 30h28"
                stroke="white"
                strokeWidth="1"
                strokeLinecap="round"
                fill="none"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-engrave)" />
        </svg>
      )}

      {/* ── Névtábla ───────────────────────────────────────── */}
      <div className="public-container pb-14 pt-24 sm:pb-20 sm:pt-32 lg:pb-24 lg:pt-44">
        <div className="max-w-3xl">
          <div className="public-anim-fade-up mb-6 flex items-center gap-4">
            <PublicCrest
              src={site.crest_image_url}
              name={site.display_name}
              size={72}
              shape="shield"
              tone="onDark"
            />
            <span className="public-eyebrow public-eyebrow-on-dark">
              {site.address?.trim() || 'Erdélyi Református Egyházkerület'}
            </span>
          </div>

          <h1 className="public-anim-fade-up public-delay-100 text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]">
            {site.display_name}
          </h1>

          {site.tagline && (
            <p
              className="public-anim-fade-up public-delay-200 mt-5 max-w-2xl text-[clamp(1.1rem,1rem+0.7vw,1.5rem)] italic leading-relaxed text-white/90"
              style={{ fontFamily: 'var(--public-heading-font)' }}
            >
              &bdquo;{site.tagline}&rdquo;
            </p>
          )}

          <div className="public-anim-fade-up public-delay-300 mt-8 flex flex-wrap items-center gap-3">
            {nextService && (
              <a
                href="#alkalmak"
                className="public-btn public-btn-on-dark"
              >
                <CalendarDays className="size-4" aria-hidden="true" />
                {nextService.day} {nextService.time} · {nextService.title}
              </a>
            )}
            <a href="#alkalmak" className="public-btn public-btn-on-dark">
              {nextService ? 'Minden alkalmunk' : 'Alkalmaink és elérhetőségünk'}
            </a>
          </div>
        </div>
      </div>

      {/* Arany hajszálvonal a szekcióhatáron — a blur-körök helyett */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 block h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in srgb, var(--public-accent) 85%, transparent), transparent)',
        }}
      />
    </section>
  )
}
