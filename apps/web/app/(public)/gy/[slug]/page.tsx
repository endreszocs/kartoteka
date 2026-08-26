import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Newspaper } from 'lucide-react'

import { loadPublicSiteBySlug, loadPublishedPosts } from '@/lib/public-site/site-loader'
import { loadPublishedMagazine } from '@/lib/public-site/magazine-loader'
import { loadPublicSiteStats } from '@/lib/public-site/stats-loader'
import { sanitizeAboutHtml } from '@/lib/public-site/sanitize'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'
import { PublicHero } from '@/components/public/public-hero'
import { PublicHomeHighlights } from '@/components/public/public-home-highlights'
import { PublicHomeStats } from '@/components/public/public-home-stats'
import { PublicHomeVisualStory } from '@/components/public/public-home-visual-story'
import { PublicPostCard } from '@/components/public/public-post-card'
import { PublicVerseBlock } from '@/components/public/public-verse-block'
import { PublicServiceTimes } from '@/components/public/public-service-times'
import { PublicSectionHeader } from '@/components/public/public-section-header'
import { PublicEmptyState } from '@/components/public/public-empty-state'
import { PublicAgeDistribution } from '@/components/public/public-age-distribution'
import { PublicCinematicHome } from '@/components/public/public-cinematic-home'
import { CINEMATIC_PUBLIC_THEME_KEY } from '@/lib/public-site/visual-theme-registry'
import { isMemberPortalAuthEnabled } from './tagi-portal/auth-enabled'
// 2026-08-26 (5. kör): tisztségviselők + közelgő események — a kapu (kapcsoló,
// publikus jelölés, hozzájárulás) az RPC-ben él; üres listánál nem renderel.
import { loadPublicTisztsegek, loadPublicEsemenyek } from '@/lib/public-site/tisztsegek-events-loader'
import { PublicTisztsegekSection, PublicEsemenyekSection } from '@/components/public/public-tisztsegek-events'

export default async function CongregationHomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const [recentPosts, magazine, stats, tisztsegek, esemenyek] = await Promise.all([
    loadPublishedPosts(site.congregation_id, 3),
    loadPublishedMagazine(site.congregation_id, { pageSize: 1 }),
    loadPublicSiteStats(site),
    loadPublicTisztsegek(site.slug),
    loadPublicEsemenyek(site.slug),
  ])
  const latestIssue = magazine?.issues[0] || null
  // A DB-ben levo HTML-t minden rendereleskor ujra tisztitjuk. Igy egy
  // PostgREST-en, importon vagy regi migracion at bekerult ertek sem valhat
  // tarolt XSS-sze, akkor sem, ha megkerulte a szerkesztesi Server Actiont.
  const safeAboutHtml = site.about_html
    ? sanitizeAboutHtml(site.about_html)
    : null

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

  const [leadPost, ...restPosts] = recentPosts

  return (
    <>
      <PublicHero site={site} />
      {/* A „Következő alkalom" kártya a legközelebbi, nyilvánosnak jelölt
          KONKRÉT alkalmat mutatja; ha nincs ilyen, a rendszeres alkalmat. */}
      <PublicHomeHighlights site={site} kovetkezoEsemeny={esemenyek[0] ?? null} />

      {/* Közösségünk számokban — a számok szűk, aggregált RPC-ből jönnek */}
      <PublicHomeStats site={site} stats={stats} />

      {/* Közösség + Örökség */}
      <PublicHomeVisualStory site={site} />

      {/* Hírek — szerkesztőségi 1 nagy + 2 kicsi elrendezés */}
      <section className="public-section">
        <div className="public-container">
          <PublicSectionHeader
            eyebrow="03 · Közösségünk életéből"
            title="Legfrissebb hírek"
            subtitle="Beszámolók, eseményeink és mindennapi szolgálatunk pillanatai."
            linkHref={recentPosts.length > 0 ? `/gy/${site.slug}/posts` : undefined}
            linkLabel="Összes bejegyzés"
          />

          {recentPosts.length === 0 ? (
            <PublicEmptyState
              title="Hamarosan érkeznek az első hírek."
              description="Amíg feltöltjük a beszámolókat, szeretettel várunk a rendszeres alkalmainkon."
              actionHref={`/gy/${site.slug}/alkalmak`}
              actionLabel="Alkalmaink megtekintése"
            />
          ) : (
            <div className="grid gap-6">
              {leadPost && (
                <div className="public-anim-fade-up">
                  <PublicPostCard post={leadPost} slug={site.slug} featured />
                </div>
              )}
              {restPosts.length > 0 && (
                <div className="grid gap-6 sm:grid-cols-2">
                  {restPosts.map((post, idx) => (
                    <div
                      key={post.id}
                      className={`public-anim-fade-up public-delay-${(idx + 1) * 100}`}
                    >
                      <PublicPostCard post={post} slug={site.slug} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Közelgő események — a határidőnaplóban publikusra jelölt alkalmak */}
      <PublicEsemenyekSection esemenyek={esemenyek} slug={site.slug} />

      {/* A hét igéje */}
      <PublicVerseBlock site={site} />

      {site.show_age_distribution && stats.ageDistribution && (
        <PublicAgeDistribution distribution={stats.ageDistribution} />
      )}

      {/* Istentiszteleti rend + elérhetőség */}
      <PublicServiceTimes site={site} />

      {/* Tisztségviselőink — publikus jelölés + személyes hozzájárulás kell */}
      <PublicTisztsegekSection tisztsegek={tisztsegek} />

      {/* Rólunk teaser — világos, szerkesztőségi hasáb (nem harmadik sötét sáv) */}
      {safeAboutHtml && (
        <section
          className="public-section"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--public-soft) 45%, transparent)',
          }}
        >
          <div className="public-container">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className="public-eyebrow">05 · A gyülekezetünkről</p>
                <h2 className="mt-3" style={{ color: 'var(--public-ink)' }}>
                  Ismerj meg minket <em>közelebbről.</em>
                </h2>
                <span
                  aria-hidden="true"
                  className="public-rule-start public-rule my-5"
                />
              </div>
              <div>
                <div
                  className="public-prose"
                  style={{ color: 'var(--public-ink)' }}
                  dangerouslySetInnerHTML={{ __html: safeAboutHtml }}
                />
                <Link
                  href={`/gy/${site.slug}/rolunk`}
                  className="public-btn public-btn-outline mt-7"
                >
                  Tovább olvasom
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Magazin (ha van lapszám) */}
      {latestIssue && magazine && (
        <section className="public-section">
          <div className="public-container">
            <div className="public-panel overflow-hidden p-6 sm:p-10 lg:p-14">
              <div className="grid items-center gap-8 lg:grid-cols-[220px_1fr] lg:gap-14">
                <div className="mx-auto w-full max-w-[220px] lg:max-w-none">
                  {latestIssue.cover_image_url ? (
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl shadow-xl">
                      <Image
                        src={latestIssue.cover_image_url}
                        alt={`${latestIssue.issue_number} lapszám borítója`}
                        fill
                        sizes="220px"
                        unoptimized={shouldBypassPublicImageOptimization(
                          latestIssue.cover_image_url,
                        )}
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="flex aspect-[3/4] w-full items-center justify-center rounded-xl shadow-xl"
                      style={{
                        background:
                          'linear-gradient(155deg, var(--public-primary), var(--public-primary-deep))',
                      }}
                    >
                      <Newspaper
                        className="size-16 text-white/40"
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </div>

                <div className="text-center lg:text-left">
                  <p className="public-eyebrow">
                    Gyülekezeti újság · {latestIssue.issue_number}
                  </p>
                  <h2 className="mt-3" style={{ color: 'var(--public-ink)' }}>
                    {latestIssue.title || magazine.magazine.title}
                  </h2>
                  {latestIssue.notes && (
                    <p
                      className="mt-4 text-base sm:text-lg"
                      style={{ color: 'var(--public-muted)' }}
                    >
                      {latestIssue.notes}
                    </p>
                  )}
                  <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
                    {latestIssue.pdf_url ? (
                      <a
                        href={latestIssue.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="public-btn public-btn-primary"
                      >
                        <Newspaper className="size-4" aria-hidden="true" />
                        Lapszám olvasása
                      </a>
                    ) : (
                      <span
                        aria-disabled="true"
                        className="public-btn public-btn-outline cursor-not-allowed opacity-70"
                      >
                        <Newspaper className="size-4" aria-hidden="true" />
                        A PDF nem elérhető
                      </span>
                    )}
                    <Link
                      href={`/gy/${site.slug}/magazin`}
                      className="public-btn public-btn-outline"
                    >
                      Archívum
                      <ArrowRight className="size-4" aria-hidden="true" />
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
