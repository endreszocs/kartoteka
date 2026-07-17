import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { getPublicVisualTheme } from '@/lib/public-site/visual-theme-registry'
import { ChevronDown } from 'lucide-react'
import Image from 'next/image'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'

export function PublicHero({ site }: { site: PublicSiteData }) {
  const visualTheme = getPublicVisualTheme(site.theme.preset_key)
  const heroImageUrl = site.hero_image_url || visualTheme?.assets.hero || null
  const hasImage = !!heroImageUrl
  const heroStyle = site.theme.hero_style

  return (
    <section className="relative overflow-hidden">
      {/* ── Háttér réteg ────────────────────────── */}
      {hasImage ? (
        <div
          className="absolute inset-0 z-0 public-anim-drift"
          style={{
            transform: 'scale(1.05)',
          }}
        >
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
      ) : (
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              heroStyle === 'gradient'
                ? `linear-gradient(135deg, var(--public-primary) 0%, color-mix(in srgb, var(--public-primary) 55%, var(--public-accent)) 50%, var(--public-accent) 100%)`
                : `linear-gradient(140deg, var(--public-primary) 0%, color-mix(in srgb, var(--public-primary) 80%, #000) 100%)`,
          }}
        />
      )}

      {/* Overlay — kontraszt a szöveghez */}
      <div
        className="absolute inset-0 z-10"
        style={{
          background: hasImage
            ? visualTheme?.hero.overlay ||
              'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {/* Dekoratív SVG pattern (csak ha NINCS kép) */}
      {!hasImage && (heroStyle === 'pattern' || heroStyle === 'crest') && (
        <svg
          className="absolute inset-0 z-10 w-full h-full opacity-[0.08]"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="hero-pattern"
              x="0"
              y="0"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="30" cy="30" r="1.5" fill="white" />
              <circle cx="0" cy="0" r="1" fill="white" />
              <circle cx="60" cy="60" r="1" fill="white" />
              <path
                d="M30 15 L35 27 L47 27 L37 35 L41 47 L30 40 L19 47 L23 35 L13 27 L25 27 Z"
                fill="white"
                opacity="0.3"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-pattern)" />
        </svg>
      )}

      {/* Dekoratív körök — parallax-szerű float */}
      <div
        className="absolute z-10 rounded-full blur-3xl public-anim-float opacity-30 pointer-events-none"
        style={{
          backgroundColor: 'var(--public-accent)',
          width: 'min(32rem, 60vw)',
          height: 'min(32rem, 60vw)',
          top: '-10%',
          right: '-15%',
          animationDelay: '0s',
        }}
      />
      <div
        className="absolute z-10 rounded-full blur-3xl public-anim-float opacity-20 pointer-events-none hidden sm:block"
        style={{
          backgroundColor: 'white',
          width: 'min(24rem, 50vw)',
          height: 'min(24rem, 50vw)',
          bottom: '-10%',
          left: '-15%',
          animationDelay: '3s',
        }}
      />

      {/* ── Tartalom ────────────────────────── */}
      <div className="relative z-20 public-container py-20 sm:py-28 lg:py-36 text-center">
        {/* Címer, ha crest stílus */}
        {site.crest_image_url && heroStyle === 'crest' && (
          <div className="relative mx-auto mb-8 size-24 overflow-hidden rounded-2xl shadow-2xl ring-4 ring-white/20 public-anim-scale-in sm:size-32">
            <Image
              src={site.crest_image_url}
              alt={`${site.display_name} címere`}
              fill
              sizes="(min-width: 640px) 128px, 96px"
              unoptimized={shouldBypassPublicImageOptimization(site.crest_image_url)}
              className="object-cover"
            />
          </div>
        )}

        {/* Kicsi welcome badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-xs sm:text-sm font-medium text-white/90 public-anim-fade-up"
          style={{
            backgroundColor: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.18)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
          Békesség Istentől!
        </div>

        <h1 className="text-white mb-5 public-anim-fade-up public-delay-100 drop-shadow-[0_2px_20px_rgba(0,0,0,0.3)]">
          {site.display_name}
        </h1>

        {site.tagline && (
          <p className="text-white/85 text-lg sm:text-xl lg:text-2xl max-w-2xl mx-auto leading-relaxed public-anim-fade-up public-delay-200 italic font-serif">
            &bdquo;{site.tagline}&rdquo;
          </p>
        )}

        {/* Scroll indicator */}
        <div className="mt-12 sm:mt-16 flex justify-center public-anim-fade-in public-delay-500">
          <div className="flex flex-col items-center gap-2 text-white/60">
            <span className="text-xs uppercase tracking-widest">Görgess</span>
            <ChevronDown className="w-5 h-5 public-anim-float" />
          </div>
        </div>
      </div>
    </section>
  )
}
