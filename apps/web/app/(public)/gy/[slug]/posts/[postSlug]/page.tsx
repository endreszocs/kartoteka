import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import {
  loadPublicSiteBySlug,
  loadPublishedPostBySlug,
  loadPublishedPosts,
} from '@/lib/public-site/site-loader'
import { PublicPostCard } from '@/components/public/public-post-card'
import { PublicSectionHeader } from '@/components/public/public-section-header'
import { sanitizePostBody } from '@/lib/public-site/sanitize'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'
import { ArrowLeft } from 'lucide-react'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; postSlug: string }>
}): Promise<Metadata> {
  const { slug, postSlug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) return { title: 'Nincs ilyen poszt' }
  const post = await loadPublishedPostBySlug(site.congregation_id, postSlug)
  if (!post) return { title: 'Nincs ilyen poszt' }

  // 2026-08-10: a gyülekezet nevét a layout `title.template`-je fűzi hozzá,
  // ezért itt már NEM ismételjük meg (különben kétszer jelenne meg).
  return {
    title: post.title,
    description: post.excerpt || undefined,
    robots: site.robots_index ? 'index, follow' : 'noindex, nofollow',
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt || undefined,
      publishedTime: post.published_at || undefined,
    },
  }
}

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

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string; postSlug: string }>
}) {
  const { slug, postSlug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const post = await loadPublishedPostBySlug(site.congregation_id, postSlug)
  if (!post) notFound()
  const safeBodyHtml = sanitizePostBody(post.body_html)

  // Kapcsolódó (utolsó 3 másik) posztok ajánlása
  const allRecent = await loadPublishedPosts(site.congregation_id, 6)
  const related = allRecent.filter((p) => p.id !== post.id).slice(0, 3)

  return (
    <>
      {/* Hero a poszt fölött */}
      <section className="relative overflow-hidden">
        {post.cover_image_url ? (
          <>
            <Image
              src={post.cover_image_url}
              alt=""
              fill
              preload
              sizes="100vw"
              unoptimized={shouldBypassPublicImageOptimization(post.cover_image_url)}
              className="z-0 object-cover"
            />
            <div
              className="absolute inset-0 z-10"
              style={{
                background:
                  'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.75) 100%)',
              }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0 z-0"
            style={{
              background: `linear-gradient(150deg, var(--public-primary) 0%, var(--public-primary-deep) 100%)`,
            }}
          />
        )}

        {/* 2026-08-10: az elmosott lebegő arany kör kikerült — helyette arany
            hajszálvonal zárja a szekciót (lásd lentebb). */}

        <div className="relative z-20 public-container pt-20 pb-16 sm:pt-28 sm:pb-20 lg:pt-36 lg:pb-24">
          {/* Vissza link */}
          <Link
            href={`/gy/${site.slug}/posts`}
            className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white mb-6 group public-anim-fade-up"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Vissza a hírekhez
          </Link>

          <div className="max-w-3xl">
            {post.published_at && (
              <p className="public-eyebrow public-eyebrow-on-dark public-anim-fade-up public-delay-100 mb-4">
                <time dateTime={post.published_at}>
                  {formatDate(post.published_at)}
                </time>
              </p>
            )}

            <h1 className="text-white drop-shadow-xl public-anim-fade-up public-delay-200">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="mt-5 text-lg sm:text-xl text-white/85 italic leading-relaxed max-w-2xl public-anim-fade-up public-delay-300">
                {post.excerpt}
              </p>
            )}
          </div>
        </div>

        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 z-20 block h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, color-mix(in srgb, var(--public-accent) 85%, transparent), transparent)',
          }}
        />
      </section>

      {/* Body */}
      <article className="public-container py-14 sm:py-20">
        <div
          className="public-prose mx-auto text-base sm:text-lg public-anim-fade-up"
          style={{ color: 'var(--public-ink)' }}
          dangerouslySetInnerHTML={{ __html: safeBodyHtml }}
        />

        {/* Divider + share */}
        <div
          className="max-w-[65ch] mx-auto mt-14 pt-8 border-t"
          style={{ borderColor: 'color-mix(in srgb, var(--public-ink) 10%, transparent)' }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div
              className="text-sm"
              style={{ color: 'var(--public-muted)' }}
            >
              Köszönjük, hogy elolvastad!
            </div>
            <Link
              href={`/gy/${site.slug}/posts`}
              className="public-btn public-btn-outline text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              További hírek
            </Link>
          </div>
        </div>
      </article>

      {/* Kapcsolódó posztok */}
      {related.length > 0 && (
        <section
          className="public-section"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--public-soft) 40%, transparent)',
          }}
        >
          <div className="public-container">
            <PublicSectionHeader
              eyebrow="Folytasd az olvasást"
              title="További bejegyzések"
              center
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <PublicPostCard key={p.id} post={p} slug={site.slug} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
