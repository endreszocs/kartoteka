import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  loadPublicSiteBySlug,
  loadPublishedPostBySlug,
  loadPublishedPosts,
} from '@/lib/public-site/site-loader'
import { PublicPostCard } from '@/components/public/public-post-card'
import { ArrowLeft, Calendar, Share2 } from 'lucide-react'

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

  return {
    title: `${post.title} — ${site.display_name}`,
    description: post.excerpt || undefined,
    robots: site.robots_index ? 'index, follow' : 'noindex, nofollow',
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

  // Kapcsolódó (utolsó 3 másik) posztok ajánlása
  const allRecent = await loadPublishedPosts(site.congregation_id, 6)
  const related = allRecent.filter((p) => p.id !== post.id).slice(0, 3)

  return (
    <>
      {/* Hero a poszt fölött */}
      <section className="relative overflow-hidden">
        {post.cover_image_url ? (
          <>
            <div
              className="absolute inset-0 z-0"
              style={{
                backgroundImage: `url(${post.cover_image_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
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
              background: `linear-gradient(140deg, var(--public-primary) 0%, color-mix(in srgb, var(--public-primary) 60%, var(--public-accent)) 100%)`,
            }}
          />
        )}

        {/* Floating circles */}
        <div
          className="absolute z-10 rounded-full blur-3xl opacity-30 public-anim-float pointer-events-none"
          style={{
            backgroundColor: 'var(--public-accent)',
            width: '30rem',
            height: '30rem',
            top: '-10%',
            right: '-10%',
          }}
        />

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
              <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white/90 mb-5 public-anim-fade-up public-delay-100">
                <Calendar className="w-4 h-4" />
                <time>{formatDate(post.published_at)}</time>
              </div>
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
      </section>

      {/* Body */}
      <article className="public-container py-14 sm:py-20">
        <div
          className="public-prose mx-auto text-base sm:text-lg public-anim-fade-up"
          style={{ color: 'var(--public-ink)' }}
          dangerouslySetInnerHTML={{ __html: post.body_html }}
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
            <div className="mb-8 text-center">
              <div
                className="text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3"
                style={{ color: 'var(--public-accent)' }}
              >
                Folytasd az olvasást
              </div>
              <h2 style={{ color: 'var(--public-ink)' }}>
                További bejegyzések
              </h2>
            </div>
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
