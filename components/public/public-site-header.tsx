import Link from 'next/link'
import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { PublicMobileNav } from './public-mobile-nav'

export function PublicSiteHeader({ site }: { site: PublicSiteData }) {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--public-surface) 85%, transparent)',
        borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
      }}
    >
      <div className="public-container flex items-center justify-between gap-4 py-4">
        {/* Brand */}
        <Link
          href={`/gy/${site.slug}`}
          className="flex items-center gap-3 min-w-0 group"
        >
          {site.crest_image_url ? (
            <img
              src={site.crest_image_url}
              alt={site.display_name}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover shrink-0 transition-transform group-hover:scale-105"
            />
          ) : (
            <div
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl shrink-0 flex items-center justify-center text-white text-lg sm:text-xl font-bold shadow-lg transition-transform group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)))`,
              }}
            >
              {site.display_name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div
              className="font-serif text-xl sm:text-[1.6rem] leading-[1.05] truncate"
              style={{ color: 'var(--public-ink)' }}
            >
              {site.display_name}
            </div>
            {site.tagline && (
              <div
                className="text-xs sm:text-[0.78rem] truncate hidden sm:block mt-0.5"
                style={{ color: 'var(--public-muted)' }}
              >
                {site.tagline}
              </div>
            )}
          </div>
        </Link>

        {/* Desktop navigáció */}
        <nav className="hidden lg:flex items-center gap-1 text-sm shrink-0">
          {[
            { href: `/gy/${site.slug}`, label: 'Kezdőlap' },
            { href: `/gy/${site.slug}/posts`, label: 'Hírek' },
            { href: `/gy/${site.slug}/magazin`, label: 'Magazin' },
            { href: `/gy/${site.slug}/rolunk`, label: 'Rólunk' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-4 py-2 rounded-full font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--public-primary)_8%,transparent)]"
              style={{ color: 'var(--public-ink)' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobil navigáció */}
        <PublicMobileNav slug={site.slug} displayName={site.display_name} crestImageUrl={site.crest_image_url} />
      </div>
    </header>
  )
}
