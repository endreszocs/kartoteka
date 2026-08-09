import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { loadPublishedMagazine, loadPublishedIssue } from '@/lib/public-site/magazine-loader'
import { shouldBypassMagazineImageOptimization } from '@/lib/public-site/magazine-image'
import { PublicPageHero } from '@/components/public/public-page-hero'
import { Download, ArrowLeft, Newspaper } from 'lucide-react'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ slug: string; issueNumber: string }>
}) {
  const { slug, issueNumber } = await params
  const decodedIssueNumber = decodeURIComponent(issueNumber)

  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const magazineData = await loadPublishedMagazine(site.congregation_id, {
    includeIssues: false,
  })
  if (!magazineData) notFound()

  const issue = await loadPublishedIssue(magazineData.magazine.id, decodedIssueNumber)
  if (!issue) notFound()

  return (
    <>
      {/* 2026-08-10: ez volt az EGYETLEN aloldal page hero nélkül — a
          látogató egy fejléc nélküli, „kopár" oldalra érkezett. */}
      <PublicPageHero
        eyebrow={`${magazineData.magazine.title} · ${issue.issue_number}`}
        title={issue.title || `Lapszám ${issue.issue_number}`}
        lead={issue.published_at ? `Megjelent: ${formatDate(issue.published_at)}` : null}
      >
        <Link
          href={`/gy/${site.slug}/magazin`}
          className="group mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white/85 hover:text-white"
        >
          <ArrowLeft
            className="size-4 transition-transform group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          Vissza a magazin archívumhoz
        </Link>
      </PublicPageHero>

      <section className="public-section">
        <div className="public-container">
        <article className="grid gap-10 lg:gap-16 md:grid-cols-[minmax(240px,360px)_1fr] items-start max-w-5xl mx-auto">
          {/* Cover */}
          <div className="mx-auto w-full public-anim-fade-up">
            {issue.cover_image_url ? (
              <div className="public-card relative aspect-[3/4] overflow-hidden rounded-[var(--public-radius)] shadow-2xl">
                <Image
                  src={issue.cover_image_url}
                  alt={`${issue.issue_number} lapszám borítója`}
                  fill
                  sizes="(min-width: 768px) 360px, calc(100vw - 2rem)"
                  preload
                  unoptimized={shouldBypassMagazineImageOptimization(issue.cover_image_url)}
                  className="object-cover"
                />
              </div>
            ) : (
              <div
                className="aspect-[3/4] rounded-[var(--public-radius)] flex items-center justify-center shadow-2xl relative overflow-hidden public-card"
                style={{
                  background: `linear-gradient(135deg, var(--public-primary), var(--public-accent))`,
                }}
              >
                <svg
                  className="absolute inset-0 w-full h-full opacity-15"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <defs>
                    <pattern
                      id="issue-pattern"
                      x="0"
                      y="0"
                      width="50"
                      height="50"
                      patternUnits="userSpaceOnUse"
                    >
                      <circle cx="25" cy="25" r="1.5" fill="white" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#issue-pattern)" />
                </svg>
                <div className="relative flex flex-col items-center gap-3">
                  <Newspaper className="w-14 h-14 text-white/40" />
                  <span className="font-serif text-3xl text-white/90">
                    {issue.issue_number}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Tartalom */}
          <div className="public-anim-fade-up public-delay-100">
            <p className="public-eyebrow mb-3">
              {magazineData.magazine.title} · {issue.issue_number}
            </p>

            <h2 className="mb-4" style={{ color: 'var(--public-ink)' }}>
              {issue.title || `Lapszám ${issue.issue_number}`}
            </h2>

            <span aria-hidden="true" className="public-rule-start public-rule mb-6" />

            {issue.notes && (
              <div
                className="public-prose text-base sm:text-lg mb-8"
                style={{ color: 'var(--public-ink)' }}
              >
                <p>{issue.notes}</p>
              </div>
            )}

            {issue.pdf_url ? (
              <a
                href={issue.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="public-btn public-btn-primary"
              >
                <Download className="w-5 h-5" />
                PDF letöltése
              </a>
            ) : (
              <p role="status" className="text-sm font-medium text-amber-800">
                A lapszám PDF-hivatkozása nem biztonságos vagy már nem elérhető.
              </p>
            )}
          </div>
        </article>
        </div>
      </section>
    </>
  )
}
