import { notFound } from 'next/navigation'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { sanitizeAboutHtml } from '@/lib/public-site/sanitize'
import { BookOpen, Mail, Phone, MapPin } from 'lucide-react'

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

  return (
    <>
      {/* Page hero */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, var(--public-primary) 95%, black) 0%, color-mix(in srgb, var(--public-primary) 80%, var(--public-accent)) 100%)`,
        }}
      >
        <div
          className="absolute top-0 left-1/3 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-25 public-anim-float pointer-events-none"
          style={{ backgroundColor: 'var(--public-accent)' }}
        />

        <div className="relative public-container py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5 text-xs sm:text-sm font-medium text-white/90 bg-white/12 backdrop-blur-sm border border-white/20 public-anim-fade-up">
            <BookOpen className="w-4 h-4" />
            Ismerj meg minket
          </div>
          <h1 className="text-white mb-4 public-anim-fade-up public-delay-100 drop-shadow-lg">
            Rólunk
          </h1>
          {site.tagline && (
            <p className="max-w-2xl mx-auto text-white/85 text-lg sm:text-xl public-anim-fade-up public-delay-200 italic font-serif">
              &bdquo;{site.tagline}&rdquo;
            </p>
          )}
        </div>
      </section>

      {/* About content */}
      <section className="public-section">
        <div className="public-container">
          {safeAboutHtml ? (
            <div
              className="public-prose mx-auto text-base sm:text-lg public-anim-fade-up"
              style={{ color: 'var(--public-ink)' }}
              dangerouslySetInnerHTML={{ __html: safeAboutHtml }}
            />
          ) : (
            <div className="max-w-2xl mx-auto text-center py-8">
              <p
                className="italic text-lg"
                style={{ color: 'var(--public-muted)' }}
              >
                Hamarosan bemutatkozó szöveget találsz itt a gyülekezetünkről.
                Addig is szeretettel várunk istentiszteleteinken!
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Elérhetőség */}
      {(site.contact_email || site.contact_phone || site.address) && (
        <section
          className="public-section"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--public-soft) 40%, transparent)',
          }}
        >
          <div className="public-container">
            <div className="text-center mb-10 public-anim-fade-up">
              <div
                className="text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3"
                style={{ color: 'var(--public-accent-on-surface)' }}
              >
                Kapcsolat
              </div>
              <h2 style={{ color: 'var(--public-ink)' }}>
                Lépj velünk kapcsolatba
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-3 max-w-4xl mx-auto">
              {site.address && (
                <div
                  className="public-card rounded-[var(--public-radius)] p-6 border text-center public-anim-fade-up"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--public-surface) 96%, white)',
                    borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
                  }}
                >
                  <div
                    className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)))`,
                    }}
                  >
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--public-muted)' }}
                  >
                    Cím
                  </div>
                  <div
                    className="text-base font-medium"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.address}
                  </div>
                </div>
              )}

              {site.contact_phone && (
                <div
                  className="public-card rounded-[var(--public-radius)] p-6 border text-center public-anim-fade-up public-delay-100"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--public-surface) 96%, white)',
                    borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
                  }}
                >
                  <div
                    className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)))`,
                    }}
                  >
                    <Phone className="w-6 h-6 text-white" />
                  </div>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--public-muted)' }}
                  >
                    Telefon
                  </div>
                  <a
                    href={`tel:${site.contact_phone.replace(/\s/g, '')}`}
                    className="text-base font-medium hover:underline"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_phone}
                  </a>
                </div>
              )}

              {site.contact_email && (
                <div
                  className="public-card rounded-[var(--public-radius)] p-6 border text-center public-anim-fade-up public-delay-200"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--public-surface) 96%, white)',
                    borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
                  }}
                >
                  <div
                    className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)))`,
                    }}
                  >
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--public-muted)' }}
                  >
                    E-mail
                  </div>
                  <a
                    href={`mailto:${site.contact_email}`}
                    className="text-base font-medium hover:underline break-all"
                    style={{ color: 'var(--public-ink)' }}
                  >
                    {site.contact_email}
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
