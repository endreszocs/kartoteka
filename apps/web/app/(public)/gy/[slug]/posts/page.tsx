import { notFound } from 'next/navigation'
import { loadPublicSiteBySlug, loadPublishedPosts } from '@/lib/public-site/site-loader'
import { PublicPostCard } from '@/components/public/public-post-card'
import { Newspaper } from 'lucide-react'

export default async function PostsIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const posts = await loadPublishedPosts(site.congregation_id, 50)

  return (
    <>
      {/* Page hero */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, var(--public-primary) 95%, black) 0%, color-mix(in srgb, var(--public-primary) 80%, var(--public-accent)) 100%)`,
        }}
      >
        {/* Decor */}
        <div
          className="absolute top-0 right-0 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-25 public-anim-float pointer-events-none"
          style={{ backgroundColor: 'var(--public-accent)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-15 public-anim-float pointer-events-none"
          style={{ backgroundColor: 'white', animationDelay: '4s' }}
        />

        <div className="relative public-container py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5 text-xs sm:text-sm font-medium text-white/90 bg-white/12 backdrop-blur-sm border border-white/20 public-anim-fade-up">
            <Newspaper className="w-4 h-4" />
            Közösségi hírek
          </div>
          <h1 className="text-white mb-4 public-anim-fade-up public-delay-100 drop-shadow-lg">
            Hírek, bejegyzések
          </h1>
          <p className="max-w-2xl mx-auto text-white/85 text-lg sm:text-xl public-anim-fade-up public-delay-200 italic font-serif">
            Minden, ami a gyülekezet életében történik — áhítatok, események, beszámolók.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          {posts.length === 0 ? (
            <div
              className="rounded-[var(--public-radius)] p-12 sm:p-20 text-center max-w-2xl mx-auto public-anim-fade-up"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--public-soft) 50%, transparent)',
                color: 'var(--public-muted)',
              }}
            >
              <Newspaper
                className="w-16 h-16 mx-auto mb-6 opacity-40"
                style={{ color: 'var(--public-accent-on-surface)' }}
              />
              <h3 className="mb-3" style={{ color: 'var(--public-ink)' }}>
                Hamarosan érkeznek az első bejegyzések
              </h3>
              <p className="italic">
                Nézz vissza később — addig is szeretettel várunk istentiszteleteinken!
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, idx) => (
                <div
                  key={post.id}
                  className={`public-anim-fade-up public-delay-${((idx % 3) + 1) * 100}`}
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
    </>
  )
}
