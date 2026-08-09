import Link from 'next/link'
import Image from 'next/image'
import { Mail, Phone, MapPin, ExternalLink } from 'lucide-react'
import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { PublicCrest } from './public-crest'
import { buildMapSearchUrl } from '@/lib/public-site/map-link'

/**
 * 2026-08-10 — Szerkesztőségi lábléc.
 *
 * Változások: pajzs-keretes címer (object-contain), arany „eyebrow"-k a
 * valóban olvasható `--public-accent-ink` tokennel, térkép-hivatkozás a
 * címhez, és korrekt kettős kredit (EREK + Kartotéka).
 */
export function PublicSiteFooter({ site }: { site: PublicSiteData }) {
  const year = new Date().getFullYear()
  const mapUrl = buildMapSearchUrl(site.address)

  return (
    <footer
      className="relative mt-24 border-t"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--public-soft) 62%, transparent)',
        borderColor: 'var(--public-line)',
      }}
    >
      <div
        aria-hidden="true"
        className="public-rule absolute inset-x-0 top-0"
      />

      <div className="public-container py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          {/* Márkajel */}
          <div>
            <div className="mb-4 flex items-center gap-3">
              <PublicCrest
                src={site.crest_image_url}
                name={site.display_name}
                size={52}
                shape="shield"
              />
              <div
                className="text-[1.15rem] leading-tight"
                style={{
                  color: 'var(--public-ink)',
                  fontFamily: 'var(--public-heading-font)',
                }}
              >
                {site.display_name}
              </div>
            </div>
            {site.tagline && (
              <p
                className="max-w-sm text-[0.95rem] italic"
                style={{
                  color: 'var(--public-muted)',
                  fontFamily: 'var(--public-heading-font)',
                }}
              >
                &bdquo;{site.tagline}&rdquo;
              </p>
            )}
          </div>

          {/* Elérhetőség */}
          <div>
            <h2 className="public-eyebrow mb-4">Elérhetőség</h2>
            <ul className="space-y-3">
              {site.address && (
                <li className="flex items-start gap-2.5">
                  <MapPin
                    className="mt-1 size-4 shrink-0"
                    style={{ color: 'var(--public-accent-ink)' }}
                    aria-hidden="true"
                  />
                  <span className="text-sm" style={{ color: 'var(--public-ink)' }}>
                    {site.address}
                    {mapUrl && (
                      <>
                        {' '}
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline underline-offset-4"
                          style={{ color: 'var(--public-primary-on-surface)' }}
                        >
                          Térkép
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      </>
                    )}
                  </span>
                </li>
              )}
              {site.contact_phone && (
                <li className="flex items-start gap-2.5">
                  <Phone
                    className="mt-1 size-4 shrink-0"
                    style={{ color: 'var(--public-accent-ink)' }}
                    aria-hidden="true"
                  />
                  <a
                    href={`tel:${site.contact_phone.replace(/\s/g, '')}`}
                    className="text-sm hover:underline"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_phone}
                  </a>
                </li>
              )}
              {site.contact_email && (
                <li className="flex items-start gap-2.5">
                  <Mail
                    className="mt-1 size-4 shrink-0"
                    style={{ color: 'var(--public-accent-ink)' }}
                    aria-hidden="true"
                  />
                  <a
                    href={`mailto:${site.contact_email}`}
                    className="break-all text-sm hover:underline"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_email}
                  </a>
                </li>
              )}
              {!site.address && !site.contact_phone && !site.contact_email && (
                <li className="text-sm italic" style={{ color: 'var(--public-muted)' }}>
                  Az elérhetőségek hamarosan felkerülnek.
                </li>
              )}
            </ul>
          </div>

          {/* Menü */}
          <div>
            <h2 className="public-eyebrow mb-4">Menü</h2>
            <ul className="space-y-1 text-sm">
              {[
                { href: `/gy/${site.slug}`, label: 'Kezdőlap' },
                { href: `/gy/${site.slug}/posts`, label: 'Hírek' },
                { href: `/gy/${site.slug}/magazin`, label: 'Magazin' },
                { href: `/gy/${site.slug}/rolunk`, label: 'Rólunk' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center hover:underline"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Alsó sáv — EREK + Kartotéka kettős kredit */}
        <div
          className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 text-xs sm:flex-row"
          style={{
            borderColor: 'var(--public-line)',
            color: 'var(--public-muted)',
          }}
        >
          <div className="text-center sm:text-left">
            © {year} {site.display_name}. Minden jog fenntartva.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2">
              <Image
                src="/EREK.png"
                alt=""
                width={18}
                height={29}
                className="h-6 w-auto opacity-80"
              />
              Erdélyi Református Egyházkerület
            </span>
            <span
              aria-hidden="true"
              className="hidden h-3 w-px sm:block"
              style={{ backgroundColor: 'var(--public-line-strong)' }}
            />
            <span>
              Működik a{' '}
              <span
                className="font-semibold"
                style={{ color: 'var(--public-primary-on-surface)' }}
              >
                Kartotéka
              </span>{' '}
              rendszerrel
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
