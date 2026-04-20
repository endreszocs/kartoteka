import { notFound } from 'next/navigation'
import Link from 'next/link'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { loadPublishedMagazine } from '@/lib/public-site/magazine-loader'
import { Newspaper, Download } from 'lucide-react'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
    })
  } catch {
    return ''
  }
}

export default async function MagazinePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const data = await loadPublishedMagazine(site.congregation_id)

  return (
    <>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, var(--public-primary) 95%, black) 0%, color-mix(in srgb, var(--public-primary) 80%, var(--public-accent)) 100%)`,
        }}
      >
        <div
          className="absolute top-0 right-0 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-25 public-anim-float pointer-events-none"
          style={{ backgroundColor: 'var(--public-accent)' }}
        />

        <div className="relative public-container py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5 text-xs sm:text-sm font-medium text-white/90 bg-white/12 backdrop-blur-sm border border-white/20 public-anim-fade-up">
            <Newspaper className="w-4 h-4" />
            Gyülekezeti újság
          </div>
          <h1 className="text-white mb-4 public-anim-fade-up public-delay-100 drop-shadow-lg">
            {data?.magazine.title || 'Gyülekezeti újság'}
          </h1>
          {data?.magazine.description && (
            <p className="max-w-2xl mx-auto text-white/85 text-lg public-anim-fade-up public-delay-200 italic font-serif">
              {data.magazine.description}
            </p>
          )}
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          {!data || data.issues.length === 0 ? (
            <div
              className="rounded-[var(--public-radius)] p-12 sm:p-20 text-center max-w-2xl mx-auto public-anim-fade-up"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--public-soft) 50%, transparent)',
                color: 'var(--public-muted)',
              }}
            >
              <Newspaper
                className="w-16 h-16 mx-auto mb-6 opacity-40"
                style={{ color: 'var(--public-accent)' }}
              />
              <h3 className="mb-3" style={{ color: 'var(--public-ink)' }}>
                Hamarosan elérhető lesz az első lapszám
              </h3>
              <p className="italic">
                Dolgozunk rajta — nézz vissza hamarosan!
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.issues.map((issue, idx) => (
                <Link
                  key={issue.id}
                  href={`/gy/${site.slug}/magazin/${encodeURIComponent(issue.issue_number)}`}
                  className={`public-card group block rounded-[var(--public-radius)] overflow-hidden border public-anim-fade-up public-delay-${((idx % 3) + 1) * 100}`}
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--public-surface) 94%, white)',
                    borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
                  }}
                >
                  {issue.cover_image_url ? (
                    <div className="aspect-[3/4] overflow-hidden">
                      <img
                        src={issue.cover_image_url}
                        alt={issue.issue_number}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    </div>
                  ) : (
                    <div
                      className="aspect-[3/4] relative flex items-center justify-center overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, var(--public-primary) 0%, var(--public-accent) 100%)`,
                      }}
                    >
                      <div className="absolute inset-0 opacity-20">
                        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <defs>
                            <pattern id={`mag-${issue.id}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                              <circle cx="20" cy="20" r="1.5" fill="white" />
                            </pattern>
                          </defs>
                          <rect width="100%" height="100%" fill={`url(#mag-${issue.id})`} />
                        </svg>
                      </div>
                      <Newspaper className="w-20 h-20 text-white/40 relative" />
                    </div>
                  )}

                  <div className="p-5 sm:p-6">
                    <div
                      className="text-xs font-semibold uppercase tracking-widest mb-2"
                      style={{ color: 'var(--public-accent)' }}
                    >
                      {issue.issue_number}
                    </div>
                    {issue.title && (
                      <h3
                        className="mb-2 transition-colors group-hover:[color:var(--public-primary)] leading-tight"
                        style={{ color: 'var(--public-ink)' }}
                      >
                        {issue.title}
                      </h3>
                    )}
                    {issue.published_at && (
                      <div
                        className="text-xs"
                        style={{ color: 'var(--public-muted)' }}
                      >
                        {formatDate(issue.published_at)}
                      </div>
                    )}
                    <div
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                      style={{ color: 'var(--public-primary)' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Megnyitom
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
