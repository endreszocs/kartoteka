import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react'

import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { sanitizeAboutHtml } from '@/lib/public-site/sanitize'
import { buildMapSearchUrl } from '@/lib/public-site/map-link'
import { PublicPageHero } from '@/components/public/public-page-hero'
import { PublicSectionHeader } from '@/components/public/public-section-header'
import { PublicCrest } from '@/components/public/public-crest'

// A gyülekezet nevét a layout `title.template`-je fűzi a cím mögé.
export const metadata: Metadata = {
  title: 'Rólunk',
  description: 'Gyülekezetünk bemutatkozása és elérhetőségei.',
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()
  const safeAboutHtml = site.about_html
    ? sanitizeAboutHtml(site.about_html)
    : null
  const mapUrl = buildMapSearchUrl(site.address)

  const contactItems = [
    site.address
      ? {
          key: 'address',
          icon: MapPin,
          label: 'Cím',
          value: site.address,
          href: null as string | null,
          external: mapUrl,
        }
      : null,
    site.contact_phone
      ? {
          key: 'phone',
          icon: Phone,
          label: 'Telefon',
          value: site.contact_phone,
          href: `tel:${site.contact_phone.replace(/\s/g, '')}`,
          external: null,
        }
      : null,
    site.contact_email
      ? {
          key: 'email',
          icon: Mail,
          label: 'E-mail',
          value: site.contact_email,
          href: `mailto:${site.contact_email}`,
          external: null,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <>
      <PublicPageHero
        eyebrow="Ismerj meg minket"
        title="Rólunk"
        lead={site.tagline ? `„${site.tagline}”` : null}
      />

      {/* Bemutatkozás — címer + szöveg szerkesztőségi hasábban */}
      <section className="public-section">
        <div className="public-container">
          <div className="grid gap-9 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <PublicCrest
                src={site.crest_image_url}
                name={site.display_name}
                size={104}
                shape="shield"
                decorative={false}
              />
              <h2
                className="mt-6 text-[clamp(1.45rem,1.2rem+1vw,2rem)]"
                style={{ color: 'var(--public-ink)' }}
              >
                {site.display_name}
              </h2>
              <span aria-hidden="true" className="public-rule-start public-rule my-5" />
              {site.address && (
                <p className="text-sm" style={{ color: 'var(--public-muted)' }}>
                  {site.address}
                </p>
              )}
            </div>

            <div>
              {safeAboutHtml ? (
                <div
                  className="public-prose public-anim-fade-up text-base sm:text-lg"
                  style={{ color: 'var(--public-ink)' }}
                  dangerouslySetInnerHTML={{ __html: safeAboutHtml }}
                />
              ) : (
                <p
                  className="text-lg italic"
                  style={{ color: 'var(--public-muted)' }}
                >
                  Hamarosan bemutatkozó szöveget találsz itt a gyülekezetünkről.
                  Addig is szeretettel várunk istentiszteleteinken!
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Kapcsolat */}
      {contactItems.length > 0 && (
        <section
          className="public-section"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--public-soft) 45%, transparent)',
          }}
        >
          <div className="public-container">
            <PublicSectionHeader
              eyebrow="Kapcsolat"
              title="Lépj velünk kapcsolatba"
              center
            />

            <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
              {contactItems.map((item, idx) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.key}
                    className={`public-card public-panel p-6 text-center public-anim-fade-up public-delay-${(idx + 1) * 100}`}
                  >
                    <Icon
                      className="mx-auto mb-4 size-6"
                      style={{ color: 'var(--public-accent-ink)' }}
                      aria-hidden="true"
                    />
                    <p className="public-eyebrow mb-2">{item.label}</p>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="inline-flex min-h-11 items-center justify-center break-all text-base font-medium hover:underline"
                        style={{ color: 'var(--public-ink)' }}
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p
                        className="text-base font-medium"
                        style={{ color: 'var(--public-ink)' }}
                      >
                        {item.value}
                      </p>
                    )}
                    {item.external && (
                      <a
                        href={item.external}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-4"
                        style={{ color: 'var(--public-primary-on-surface)' }}
                      >
                        Megnyitás térképen
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
