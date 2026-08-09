import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react'

import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { buildMapSearchUrl } from '@/lib/public-site/map-link'

import { PublicEmptyState } from './public-empty-state'
import { PublicSectionHeader } from './public-section-header'

/**
 * A nap nevéből tipográfiai horgony: „Vasárnap" → V, „Szerda" → SZE.
 * A mező szabad szöveg (pl. „Minden hónap 1. vasárnapja"), ezért ismeretlen
 * értéknél az első két betű marad.
 */
const DAY_ANCHORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^vas/i, 'V'],
  [/^hét|^het/i, 'H'],
  [/^kedd/i, 'K'],
  [/^szer/i, 'SZE'],
  [/^csüt|^csut/i, 'CS'],
  [/^pén|^pen/i, 'P'],
  [/^szom/i, 'SZO'],
]

function dayAnchor(day: string): string {
  const trimmed = day.trim()
  const match = DAY_ANCHORS.find(([pattern]) => pattern.test(trimmed))
  if (match) return match[1]
  return trimmed.slice(0, 2).toUpperCase()
}

/**
 * Istentiszteleti rend + elérhetőség.
 *
 * 2026-08-10 — a két gradienssel töltött ikoncsempés kártya helyett valódi
 * menetrend-lista: bal oldalon a nap nagybetűs rövidítése tipográfiai
 * horgonyként, mellette idő + megnevezés + helyszín, hajszálvonalakkal
 * elválasztva. Az alkalmak kizárólag a gyülekezet által mentett, validált
 * adatokból jönnek; üres listánál nem jelenítünk meg feltételezett időpontot.
 */
export function PublicServiceTimes({ site }: { site: PublicSiteData }) {
  const mapUrl = buildMapSearchUrl(site.address)
  const hasContact = Boolean(
    site.address || site.contact_phone || site.contact_email,
  )

  return (
    <section className="public-section" id="alkalmak">
      <div className="public-container">
        <PublicSectionHeader
          eyebrow="Istentiszteleti rend"
          title="Alkalmaink"
          subtitle="Rendszeres alkalmaink és elérhetőségünk — szeretettel várunk mindenkit."
        />

        <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
          {/* Menetrend */}
          <div>
            {site.service_times.length > 0 ? (
              <ul className="public-schedule">
                {site.service_times.map((serviceTime) => (
                  <li key={serviceTime.id} className="public-schedule-item">
                    <span className="public-schedule-day" aria-hidden="true">
                      {dayAnchor(serviceTime.day)}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-[1.05rem] leading-snug"
                        style={{
                          color: 'var(--public-ink)',
                          fontFamily: 'var(--public-heading-font)',
                          fontSize: '1.3rem',
                        }}
                      >
                        {serviceTime.title}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: 'var(--public-muted)' }}>
                        <span className="public-schedule-time">
                          {serviceTime.day} {serviceTime.time}
                        </span>
                        {serviceTime.location && (
                          <>
                            {' · '}
                            {serviceTime.location}
                          </>
                        )}
                      </p>
                      {serviceTime.note && (
                        <p
                          className="mt-1 text-sm italic"
                          style={{ color: 'var(--public-muted)' }}
                        >
                          {serviceTime.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <PublicEmptyState
                title="A rendszeres alkalmak időpontjai még nincsenek közzétéve."
                description="Az aktuális időpontokról szívesen adunk felvilágosítást az elérhetőségeinken."
              />
            )}
          </div>

          {/* Elérhetőség */}
          <aside
            className="public-panel h-fit p-7 sm:p-8"
            aria-label="Elérhetőségeink"
          >
            <p className="public-eyebrow">Látogass meg</p>
            <h3 className="mt-3" style={{ color: 'var(--public-ink)' }}>
              Hol találsz minket
            </h3>
            <span aria-hidden="true" className="public-rule-start public-rule my-5" />

            {hasContact ? (
              <ul className="space-y-4">
                {site.address && (
                  <li className="flex items-start gap-3">
                    <MapPin
                      className="mt-0.5 size-5 shrink-0"
                      style={{ color: 'var(--public-accent-ink)' }}
                      aria-hidden="true"
                    />
                    <span style={{ color: 'var(--public-ink)' }}>
                      {site.address}
                      {mapUrl && (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-4"
                          style={{ color: 'var(--public-primary-on-surface)' }}
                        >
                          Megnyitás térképen
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </span>
                  </li>
                )}
                {site.contact_phone && (
                  <li className="flex items-start gap-3">
                    <Phone
                      className="mt-0.5 size-5 shrink-0"
                      style={{ color: 'var(--public-accent-ink)' }}
                      aria-hidden="true"
                    />
                    <a
                      href={`tel:${site.contact_phone.replace(/\s/g, '')}`}
                      className="inline-flex min-h-11 items-center hover:underline"
                      style={{ color: 'var(--public-ink)' }}
                    >
                      {site.contact_phone}
                    </a>
                  </li>
                )}
                {site.contact_email && (
                  <li className="flex items-start gap-3">
                    <Mail
                      className="mt-0.5 size-5 shrink-0"
                      style={{ color: 'var(--public-accent-ink)' }}
                      aria-hidden="true"
                    />
                    <a
                      href={`mailto:${site.contact_email}`}
                      className="inline-flex min-h-11 items-center break-all hover:underline"
                      style={{ color: 'var(--public-ink)' }}
                    >
                      {site.contact_email}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm italic" style={{ color: 'var(--public-muted)' }}>
                Az elérhetőségi adatok hamarosan felkerülnek erre az oldalra.
              </p>
            )}
          </aside>
        </div>
      </div>
    </section>
  )
}
