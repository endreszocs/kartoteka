import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { loadPublicSiteBySlug, loadPublishedPosts } from '@/lib/public-site/site-loader'
import { PublicPostCard } from '@/components/public/public-post-card'
import { PublicPageHero } from '@/components/public/public-page-hero'
import { PublicEmptyState } from '@/components/public/public-empty-state'

// A gyülekezet nevét a layout `title.template`-je fűzi a cím mögé.
export const metadata: Metadata = {
  title: 'Hírek',
  description: 'Áhítatok, események és beszámolók a gyülekezet életéből.',
}

export default async function PostsIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const posts = await loadPublishedPosts(site.congregation_id, 50)
  const [leadPost, ...restPosts] = posts

  return (
    <>
      <PublicPageHero
        eyebrow="Közösségi hírek"
        title="Hírek, bejegyzések"
        lead="Minden, ami a gyülekezet életében történik — áhítatok, események, beszámolók."
      />

      <section className="public-section">
        <div className="public-container">
          {posts.length === 0 ? (
            <PublicEmptyState
              className="mx-auto max-w-2xl"
              title="Hamarosan érkeznek az első bejegyzések."
              description="Addig is szeretettel várunk istentiszteleteinken és közösségi alkalmainkon."
              actionHref={`/gy/${site.slug}#alkalmak`}
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
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {restPosts.map((post, idx) => (
                    <div
                      key={post.id}
                      className={`public-anim-fade-up public-delay-${((idx % 3) + 1) * 100}`}
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
    </>
  )
}
