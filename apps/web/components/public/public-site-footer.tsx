import Link from 'next/link'
import { Mail, Phone, MapPin, Heart } from 'lucide-react'
import type { PublicSiteData } from '@/lib/public-site/site-loader'

export function PublicSiteFooter({ site }: { site: PublicSiteData }) {
  const year = new Date().getFullYear()

  return (
    <footer
      className="mt-20 border-t relative overflow-hidden"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--public-soft) 55%, transparent)',
        borderColor: 'color-mix(in srgb, var(--public-ink) 10%, transparent)',
      }}
    >
      {/* Dekoratív gradient vonal a tetején */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, var(--public-accent) 50%, transparent 100%)`,
        }}
      />

      <div className="public-container py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              {site.crest_image_url ? (
                <img
                  src={site.crest_image_url}
                  alt={site.display_name}
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-md"
                  style={{
                    background: `linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)))`,
                  }}
                >
                  {site.display_name.charAt(0)}
                </div>
              )}
              <div
                className="font-serif text-xl leading-tight"
                style={{ color: 'var(--public-ink)' }}
              >
                {site.display_name}
              </div>
            </div>
            {site.tagline && (
              <p
                className="text-sm italic font-serif"
                style={{ color: 'var(--public-muted)' }}
              >
                &bdquo;{site.tagline}&rdquo;
              </p>
            )}
          </div>

          {/* Elérhetőség */}
          <div>
            <h4
              className="mb-4 text-sm font-semibold uppercase tracking-widest"
              style={{ color: 'var(--public-accent)' }}
            >
              Elérhetőség
            </h4>
            <ul className="space-y-3">
              {site.contact_email && (
                <li className="flex items-start gap-2.5">
                  <Mail
                    className="w-4 h-4 mt-1 shrink-0"
                    style={{ color: 'var(--public-muted)' }}
                  />
                  <a
                    href={`mailto:${site.contact_email}`}
                    className="hover:underline text-sm break-all"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_email}
                  </a>
                </li>
              )}
              {site.contact_phone && (
                <li className="flex items-start gap-2.5">
                  <Phone
                    className="w-4 h-4 mt-1 shrink-0"
                    style={{ color: 'var(--public-muted)' }}
                  />
                  <a
                    href={`tel:${site.contact_phone.replace(/\s/g, '')}`}
                    className="hover:underline text-sm"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_phone}
                  </a>
                </li>
              )}
              {site.address && (
                <li className="flex items-start gap-2.5">
                  <MapPin
                    className="w-4 h-4 mt-1 shrink-0"
                    style={{ color: 'var(--public-muted)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--public-ink)' }}>
                    {site.address}
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Hasznos linkek */}
          <div>
            <h4
              className="mb-4 text-sm font-semibold uppercase tracking-widest"
              style={{ color: 'var(--public-accent)' }}
            >
              Menü
            </h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { href: `/gy/${site.slug}`, label: 'Kezdőlap' },
                { href: `/gy/${site.slug}/posts`, label: 'Hírek' },
                { href: `/gy/${site.slug}/magazin`, label: 'Magazin' },
                { href: `/gy/${site.slug}/rolunk`, label: 'Rólunk' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:underline"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Alsó sáv */}
        <div
          className="mt-12 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          style={{
            borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
            color: 'var(--public-muted)',
          }}
        >
          <div>
            © {year} {site.display_name}. Minden jog fenntartva.
          </div>
          <div className="flex items-center gap-1.5">
            <span>Működik a</span>
            <span
              className="font-semibold"
              style={{ color: 'var(--public-primary)' }}
            >
              Kartotéka
            </span>
            <span>rendszerrel</span>
            <Heart
              className="w-3.5 h-3.5 ml-1"
              style={{ color: 'var(--public-accent)' }}
              fill="currentColor"
            />
          </div>
        </div>
      </div>
    </footer>
  )
}
