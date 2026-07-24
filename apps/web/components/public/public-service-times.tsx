import type { PublicSiteData } from '@/lib/public-site/site-loader'
import { Calendar, Clock, MapPin, Mail, Phone } from 'lucide-react'

/**
 * Istentiszteleti időpontok + elérhetőség blokk.
 * Az alkalmak kizárólag a gyülekezet által mentett, validált adatokból jönnek.
 * Üres listánál nem jelenítünk meg feltételezett időpontot.
 */
export function PublicServiceTimes({ site }: { site: PublicSiteData }) {
  return (
    <section className="public-section" id="alkalmak">
      <div className="public-container">
        <div className="grid gap-6 md:grid-cols-2 lg:gap-10">
          {/* Istentiszteletek */}
          <div
            className="public-card rounded-[var(--public-radius)] p-8 lg:p-10 border public-anim-fade-up"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--public-surface) 96%, white)',
              borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
              style={{
                background: `linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)))`,
              }}
            >
              <Calendar className="w-7 h-7 text-white" />
            </div>
            <h3 className="mb-3" style={{ color: 'var(--public-ink)' }}>
              Istentiszteleteink
            </h3>
            <p className="mb-5 text-base" style={{ color: 'var(--public-muted)' }}>
              Közösségünk állandó alkalmai — szeretettel várunk mindenkit.
            </p>

            {site.service_times.length > 0 ? (
              <ul className="space-y-3">
                {site.service_times.map((serviceTime, index) => (
                  <li
                    key={serviceTime.id}
                    className={
                      index < site.service_times.length - 1
                        ? 'flex items-start gap-3 border-b pb-3'
                        : 'flex items-start gap-3'
                    }
                    style={{ borderColor: 'color-mix(in srgb, var(--public-ink) 6%, transparent)' }}
                  >
                    <Clock
                      className="mt-0.5 size-5 shrink-0"
                      style={{ color: 'var(--public-accent-on-surface)' }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold" style={{ color: 'var(--public-ink)' }}>
                        {serviceTime.day} · {serviceTime.time}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--public-muted)' }}>
                        {serviceTime.title}
                      </div>
                      {serviceTime.location && (
                        <div className="mt-1 flex items-start gap-1.5 text-sm" style={{ color: 'var(--public-muted)' }}>
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          <span>{serviceTime.location}</span>
                        </div>
                      )}
                      {serviceTime.note && (
                        <p className="mt-1 text-sm italic" style={{ color: 'var(--public-muted)' }}>
                          {serviceTime.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div
                className="rounded-xl border border-dashed p-4 text-sm leading-6"
                style={{
                  borderColor: 'color-mix(in srgb, var(--public-ink) 14%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--public-soft) 55%, transparent)',
                  color: 'var(--public-muted)',
                }}
              >
                A rendszeres alkalmak időpontjai még nincsenek közzétéve.
                Az aktuális időpontokról érdeklődj az elérhetőségeinken.
              </div>
            )}
          </div>

          {/* Elérhetőség */}
          <div
            className="public-card rounded-[var(--public-radius)] p-8 lg:p-10 border public-anim-fade-up public-delay-100"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--public-surface) 96%, white)',
              borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
              style={{
                background: `linear-gradient(135deg, var(--public-accent-strong), color-mix(in srgb, var(--public-accent-strong) 70%, var(--public-primary)))`,
              }}
            >
              <MapPin className="w-7 h-7 text-white" />
            </div>
            <h3 className="mb-3" style={{ color: 'var(--public-ink)' }}>
              Látogass meg
            </h3>
            <p className="mb-5 text-base" style={{ color: 'var(--public-muted)' }}>
              Bármikor szívesen fogadunk, ha kérdésed van vagy kapcsolatba szeretnél lépni velünk.
            </p>

            <ul className="space-y-3">
              {site.address && (
                <li className="flex items-start gap-3">
                  <MapPin
                    className="w-5 h-5 mt-0.5 shrink-0"
                    style={{ color: 'var(--public-accent-on-surface)' }}
                  />
                  <span style={{ color: 'var(--public-ink)' }}>{site.address}</span>
                </li>
              )}
              {site.contact_phone && (
                <li className="flex items-start gap-3">
                  <Phone
                    className="w-5 h-5 mt-0.5 shrink-0"
                    style={{ color: 'var(--public-accent-on-surface)' }}
                  />
                  <a
                    href={`tel:${site.contact_phone.replace(/\s/g, '')}`}
                    className="hover:underline"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_phone}
                  </a>
                </li>
              )}
              {site.contact_email && (
                <li className="flex items-start gap-3">
                  <Mail
                    className="w-5 h-5 mt-0.5 shrink-0"
                    style={{ color: 'var(--public-accent-on-surface)' }}
                  />
                  <a
                    href={`mailto:${site.contact_email}`}
                    className="hover:underline break-all"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_email}
                  </a>
                </li>
              )}
              {!site.address && !site.contact_phone && !site.contact_email && (
                <li className="text-sm italic" style={{ color: 'var(--public-muted)' }}>
                  Az elérhetőségi adatok hamarosan elérhetőek lesznek.
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
