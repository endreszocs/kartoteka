import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { loadPublicSiteBySlug, loadPublishedPosts } from '@/lib/public-site/site-loader'
import { loadPublishedMagazine } from '@/lib/public-site/magazine-loader'
import { loadPublicSiteStats } from '@/lib/public-site/stats-loader'
import { sanitizeAboutHtml } from '@/lib/public-site/sanitize'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'
import { PublicHero } from '@/components/public/public-hero'
import { PublicHomeHighlights } from '@/components/public/public-home-highlights'
import { PublicHomeVisualStory } from '@/components/public/public-home-visual-story'
import { PublicPostCard } from '@/components/public/public-post-card'
import { PublicVerseBlock } from '@/components/public/public-verse-block'
import { PublicServiceTimes } from '@/components/public/public-service-times'
import { PublicSectionHeader } from '@/components/public/public-section-header'
import { PublicAgeDistribution } from '@/components/public/public-age-distribution'
import { PublicCinematicHome } from '@/components/public/public-cinematic-home'
import { CINEMATIC_PUBLIC_THEME_KEY } from '@/lib/public-site/visual-theme-registry'
import { isMemberPortalAuthEnabled } from './tagi-portal/auth-enabled'
import { ArrowRight, BookOpen, Newspaper, Sparkles, Users, UserCheck, Home } from 'lucide-react'

export default async function CongregationHomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const [recentPosts, magazine, stats] = await Promise.all([
    loadPublishedPosts(site.congregation_id, 3),
    loadPublishedMagazine(site.congregation_id, { pageSize: 1 }),
    loadPublicSiteStats(site),
  ])
  const latestIssue = magazine?.issues[0] || null
  // A DB-ben levo HTML-t minden rendereleskor ujra tisztitjuk. Igy egy
  // PostgREST-en, importon vagy regi migracion at bekerult ertek sem valhat
  // tarolt XSS-sze, akkor sem, ha megkerulte a szerkesztesi Server Actiont.
  const safeAboutHtml = site.about_html
    ? sanitizeAboutHtml(site.about_html)
    : null

  // A számok szűk, aggregált RPC-ből jönnek; nincs publikus base-table olvasás.
  const showCountStats = site.show_member_count || site.show_presbyter_count || site.show_family_count

  if (site.theme.preset_key === CINEMATIC_PUBLIC_THEME_KEY) {
    return (
      <PublicCinematicHome
        site={site}
        recentPosts={recentPosts}
        magazine={magazine}
        stats={stats}
        ageDistribution={stats.ageDistribution}
        safeAboutHtml={safeAboutHtml}
        memberPortalEnabled={isMemberPortalAuthEnabled()}
      />
    )
  }

  return (
    <>
      <PublicHero site={site} />
      <PublicHomeHighlights site={site} />

      {/* Statisztikák — dizájnos szekció */}
      {showCountStats && (
        <section className="public-anim-fade-up public-delay-200" style={{ padding: '3rem 0', position: 'relative', overflow: 'hidden' }}>
          {/* Háttér dekoráció */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, color-mix(in srgb, var(--public-primary) 6%, var(--public-surface)), color-mix(in srgb, var(--public-accent) 4%, var(--public-surface)))' }} />
          <div style={{ position: 'absolute', top: '-60px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'color-mix(in srgb, var(--public-primary) 8%, transparent)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', bottom: '-40px', left: '-30px', width: '160px', height: '160px', borderRadius: '50%', background: 'color-mix(in srgb, var(--public-accent) 10%, transparent)', filter: 'blur(50px)' }} />

          <div className="public-container" style={{ position: 'relative' }}>
            {/* Szekció fejléc */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '100px', background: 'color-mix(in srgb, var(--public-primary) 10%, transparent)', marginBottom: '12px' }}>
                <Sparkles style={{ width: '14px', height: '14px', color: 'var(--public-primary-on-surface)' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--public-primary-on-surface)' }}>Közösségünk számokban</span>
              </div>
            </div>

            {/* Stat kártyák */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', maxWidth: '700px', margin: '0 auto' }}>
              {site.show_member_count && (
                <div className="public-anim-scale-in" style={{
                  textAlign: 'center', padding: '28px 20px', borderRadius: 'var(--public-radius, 1rem)',
                  background: 'var(--public-surface)', boxShadow: '0 8px 30px -12px color-mix(in srgb, var(--public-primary) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--public-primary) 12%, transparent)',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto 14px',
                    background: 'linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px -6px var(--public-primary)' }}>
                    <Users style={{ width: '24px', height: '24px', color: '#fff' }} />
                  </div>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--public-ink)', lineHeight: 1, fontFamily: 'var(--public-heading-font, serif)' }}>{stats.members}</div>
                  <div style={{ fontSize: '14px', color: 'var(--public-muted)', marginTop: '6px', fontWeight: 500 }}>Aktív tag</div>
                </div>
              )}
              {site.show_presbyter_count && (
                <div className="public-anim-scale-in public-delay-100" style={{
                  textAlign: 'center', padding: '28px 20px', borderRadius: 'var(--public-radius, 1rem)',
                  background: 'var(--public-surface)', boxShadow: '0 8px 30px -12px color-mix(in srgb, var(--public-accent) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--public-accent) 12%, transparent)',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto 14px',
                    background: 'linear-gradient(135deg, var(--public-accent-strong), color-mix(in srgb, var(--public-accent-strong) 70%, var(--public-primary)))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px -6px var(--public-accent)' }}>
                    <UserCheck style={{ width: '24px', height: '24px', color: '#fff' }} />
                  </div>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--public-ink)', lineHeight: 1, fontFamily: 'var(--public-heading-font, serif)' }}>{stats.presbyters}</div>
                  <div style={{ fontSize: '14px', color: 'var(--public-muted)', marginTop: '6px', fontWeight: 500 }}>Presbiter</div>
                </div>
              )}
              {site.show_family_count && (
                <div className="public-anim-scale-in public-delay-200" style={{
                  textAlign: 'center', padding: '28px 20px', borderRadius: 'var(--public-radius, 1rem)',
                  background: 'var(--public-surface)', boxShadow: '0 8px 30px -12px color-mix(in srgb, var(--public-primary) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--public-ink) 8%, transparent)',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto 14px',
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--public-primary) 80%, var(--public-accent)), var(--public-primary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px -6px var(--public-primary)' }}>
                    <Home style={{ width: '24px', height: '24px', color: '#fff' }} />
                  </div>
                  <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--public-ink)', lineHeight: 1, fontFamily: 'var(--public-heading-font, serif)' }}>{stats.families}</div>
                  <div style={{ fontSize: '14px', color: 'var(--public-muted)', marginTop: '6px', fontWeight: 500 }}>Család</div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {site.show_age_distribution && stats.ageDistribution && (
        <PublicAgeDistribution
          distribution={stats.ageDistribution}
          themeKey={site.theme.preset_key}
        />
      )}

      {/* Napi ige */}
      <PublicVerseBlock />

      {/* Legfrissebb hírek */}
      <section className="public-section">
        <div className="public-container">
          <PublicSectionHeader
            eyebrow="Közösségünk életéből"
            title="Legfrissebb hírek"
            subtitle="Beszámolók, eseményeink és mindennapi szolgálatunk pillanatai."
            linkHref={recentPosts.length > 0 ? `/gy/${site.slug}/posts` : undefined}
            linkLabel="Összes bejegyzés"
          />

          {recentPosts.length === 0 ? (
            <div
              className="rounded-[var(--public-radius)] p-12 sm:p-16 text-center public-anim-fade-up"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--public-soft) 50%, transparent)',
                color: 'var(--public-muted)',
              }}
            >
              <Sparkles
                className="w-12 h-12 mx-auto mb-4 opacity-50"
                style={{ color: 'var(--public-accent-on-surface)' }}
              />
              <p className="text-lg italic mb-2">Hamarosan érkeznek az első hírek.</p>
              <p className="text-sm">Nézz vissza később!</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentPosts.map((post, idx) => (
                <div
                  key={post.id}
                  className={`public-anim-fade-up public-delay-${(idx + 1) * 100}`}
                >
                  <PublicPostCard
                    post={post}
                    slug={site.slug}
                    themeKey={site.theme.preset_key}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PublicHomeVisualStory site={site} />

      {/* Istentiszteletek + elérhetőség */}
      <PublicServiceTimes site={site} />

      {/* Rólunk teaser */}
      {safeAboutHtml && (
        <section
          className="public-section relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, var(--public-primary) 96%, black) 0%, color-mix(in srgb, var(--public-primary) 88%, var(--public-accent)) 100%)`,
          }}
        >
          {/* Dekoratív körök */}
          <div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl public-anim-float"
            style={{ backgroundColor: 'var(--public-accent)' }}
          />
          <div
            className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-10 blur-3xl public-anim-float"
            style={{ backgroundColor: 'white', animationDelay: '3s' }}
          />

          <div className="public-container relative">
            <div className="max-w-3xl mx-auto text-center text-white public-anim-fade-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-xs sm:text-sm font-medium bg-white/12 backdrop-blur-sm border border-white/20">
                <BookOpen className="w-4 h-4" />
                A gyülekezetünkről
              </div>
              <h2 className="text-white mb-6 drop-shadow-lg">Ismerj meg minket közelebbről</h2>
              <div
                className="public-prose mx-auto text-white/90 [&_*]:text-white/90 [&_a]:text-white [&_blockquote]:border-white/40"
                dangerouslySetInnerHTML={{ __html: safeAboutHtml }}
              />
              <Link
                href={`/gy/${site.slug}/rolunk`}
                className="public-btn mt-8 bg-white/15 backdrop-blur-sm text-white border border-white/25 hover:bg-white/25"
              >
                Tovább olvasom
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Magazin CTA (ha van lapszám) */}
      {latestIssue && magazine && (
        <section className="public-section">
          <div className="public-container">
            <div
              className="rounded-[var(--public-radius)] p-8 sm:p-12 lg:p-16 border overflow-hidden relative public-anim-fade-up"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--public-soft) 45%, transparent)',
                borderColor: 'color-mix(in srgb, var(--public-ink) 8%, transparent)',
              }}
            >
              <div className="grid gap-8 lg:grid-cols-[auto_1fr] items-center">
                {/* Cover */}
                <div className="w-full max-w-[220px] mx-auto lg:max-w-none">
                  {latestIssue.cover_image_url ? (
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl shadow-2xl">
                      <Image
                        src={latestIssue.cover_image_url}
                        alt={`${latestIssue.issue_number} lapszám borítója`}
                        fill
                        sizes="220px"
                        unoptimized={shouldBypassPublicImageOptimization(latestIssue.cover_image_url)}
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-full aspect-[3/4] rounded-xl flex items-center justify-center shadow-2xl"
                      style={{
                        background: `linear-gradient(135deg, var(--public-primary), var(--public-accent))`,
                      }}
                    >
                      <Newspaper className="w-20 h-20 text-white/50" />
                    </div>
                  )}
                </div>

                <div className="text-center lg:text-left">
                  <div
                    className="text-xs sm:text-sm font-semibold uppercase tracking-widest mb-3"
                    style={{ color: 'var(--public-accent-on-surface)' }}
                  >
                    Gyülekezeti újság · {latestIssue.issue_number}
                  </div>
                  <h2 className="mb-4" style={{ color: 'var(--public-ink)' }}>
                    {latestIssue.title || magazine.magazine.title}
                  </h2>
                  {latestIssue.notes && (
                    <p
                      className="mb-6 text-base sm:text-lg"
                      style={{ color: 'var(--public-muted)' }}
                    >
                      {latestIssue.notes}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                    {latestIssue.pdf_url ? (
                      <a
                        href={latestIssue.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="public-btn public-btn-primary"
                      >
                        <Newspaper className="w-4 h-4" />
                        Lapszám olvasása
                      </a>
                    ) : (
                      <span
                        aria-disabled="true"
                        className="public-btn public-btn-outline cursor-not-allowed opacity-70"
                      >
                        <Newspaper className="w-4 h-4" />
                        A PDF nem elérhető
                      </span>
                    )}
                    <Link
                      href={`/gy/${site.slug}/magazin`}
                      className="public-btn public-btn-outline"
                    >
                      Archívum
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
