import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'

import type { PublicPostListItem } from '@/lib/public-site/site-loader'
import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'

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

/**
 * Hírkártya — 2026-08-10-i szerkesztőségi átdolgozás.
 *
 * Változások:
 *  - a dátum tipográfiai elem (kis kapitális, arany), nem ikonos csipke;
 *  - borítókép hiányában NEM a téma (Barátosi) generált fotója kerül a
 *    kártyára, hanem a poszt címéből képzett, gravírozott monogram-mező —
 *    így másik gyülekezet oldalán sem tűnik fel idegen fénykép;
 *  - `featured` változat a hírek szekció 1 nagy + 2 kicsi elrendezéséhez.
 */
export function PublicPostCard({
  post,
  slug,
  featured = false,
}: {
  post: PublicPostListItem
  slug: string
  /** @deprecated 2026-08-10 — a téma-fotó fallback megszűnt. */
  themeKey?: string
  featured?: boolean
}) {
  const publishedLabel = formatDate(post.published_at)

  return (
    <Link
      href={`/gy/${slug}/posts/${post.slug}`}
      className={`public-card public-panel group flex h-full flex-col overflow-hidden ${
        featured ? 'sm:grid sm:grid-cols-2 sm:items-stretch' : ''
      }`}
    >
      <div
        className={`relative overflow-hidden ${featured ? 'aspect-[16/10] sm:aspect-auto sm:h-full sm:min-h-[19rem]' : 'aspect-[16/10]'}`}
      >
        {post.cover_image_url ? (
          <Image
            src={post.cover_image_url}
            alt=""
            fill
            sizes={
              featured
                ? '(min-width: 1024px) 36rem, 100vw'
                : '(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw'
            }
            unoptimized={shouldBypassPublicImageOptimization(post.cover_image_url)}
            className="object-cover transition-transform duration-700 group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background:
                'linear-gradient(155deg, var(--public-primary) 0%, var(--public-primary-deep) 100%)',
            }}
          >
            <span
              className="text-[5.5rem] leading-none text-white/25"
              style={{ fontFamily: 'var(--public-heading-font)' }}
            >
              {post.title.charAt(0)}
            </span>
            <span
              className="absolute inset-x-6 bottom-6 block h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in srgb, var(--public-accent) 70%, transparent), transparent)',
              }}
            />
          </span>
        )}

        {/* Finom, meleg wash — a heterogén képanyagot egy arculatba fogja */}
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, transparent 45%, color-mix(in srgb, var(--public-primary-deep) 34%, transparent) 100%)',
          }}
        />
      </div>

      <div
        className={`flex flex-1 flex-col p-5 sm:p-6 ${featured ? 'sm:justify-center sm:p-8' : ''}`}
      >
        {publishedLabel && (
          <p className="public-eyebrow mb-3">{publishedLabel}</p>
        )}

        <h3
          className="leading-tight transition-colors group-hover:[color:var(--public-accent-ink)]"
          style={{
            color: 'var(--public-ink)',
            fontSize: featured ? 'clamp(1.45rem,1.2rem+1vw,2rem)' : undefined,
          }}
        >
          {post.title}
        </h3>

        {post.excerpt && (
          <p
            className={`mt-3 text-sm leading-relaxed sm:text-base ${featured ? 'line-clamp-4' : 'line-clamp-3'}`}
            style={{ color: 'var(--public-muted)' }}
          >
            {post.excerpt}
          </p>
        )}

        <span className="public-link-arrow mt-4 text-sm">
          Olvasom
          <ArrowUpRight
            className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  )
}
