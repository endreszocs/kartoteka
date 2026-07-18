import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { FileEdit, Plus } from 'lucide-react'
import { canAccessPublicSiteAdmin } from '@/lib/public-site/admin-access'
import { PublicSiteAdminNav } from '@/components/admin/public-site/public-site-admin-nav'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: 'Piszkozat', color: 'bg-slate-100 text-slate-600' },
  published: { label: 'Publikált', color: 'bg-emerald-50 text-emerald-700' },
  archived: { label: 'Archivált', color: 'bg-amber-50 text-amber-700' },
}

export default async function PublicPostsListPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canAccessPublicSiteAdmin(access, 'read')) redirect('/publikus-oldal')
  const canWrite = canAccessPublicSiteAdmin(access, 'write')
  const congregationId = access.effectiveCongregationId
  if (!congregationId) redirect('/publikus-oldal')

  const { data: posts } = await access.supabase
    .from('public_posts')
    .select('id, slug, title, excerpt, status, published_at, updated_at')
    .eq('congregation_id', congregationId)
    .order('updated_at', { ascending: false })

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-4 sm:py-8">
      <header className="card-raised flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
            <FileEdit className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="font-heading text-3xl text-slate-800">Bejegyzések</h1>
            <p className="text-sm text-slate-500">A publikus oldalon megjelenő hírek és blog posztok</p>
          </div>
        </div>
        {canWrite ? (
          <Link
            href="/publikus-oldal/bejegyzesek/uj"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/25 focus-visible:ring-offset-2"
          >
            <Plus className="size-4" aria-hidden="true" />
            Új bejegyzés
          </Link>
        ) : null}
      </header>

      <PublicSiteAdminNav active="posts" canWrite={canWrite} />

      {!posts || posts.length === 0 ? (
        <div className="card-raised p-12 text-center">
          <FileEdit className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
          <h2 className="font-heading text-xl text-slate-800 mb-2">Még nincs egy bejegyzés sem</h2>
          <p className="text-slate-500 mb-6">Írd meg az első hírt a gyülekezetedről!</p>
          {canWrite ? (
            <Link
              href="/publikus-oldal/bejegyzesek/uj"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/25 focus-visible:ring-offset-2"
            >
              <Plus className="size-4" aria-hidden="true" />
              Első bejegyzés írása
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const status = STATUS_LABEL[post.status] || STATUS_LABEL.draft
            const rowContent = (
              <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${status.color}`}>
                      {status.label}
                    </span>
                    <h3 className="font-semibold text-slate-800 truncate">{post.title}</h3>
                  </div>
                  {post.excerpt && (
                    <p className="text-sm text-slate-500 line-clamp-1">{post.excerpt}</p>
                  )}
                  <div className="text-xs text-slate-500 mt-1">
                    {post.status === 'published'
                      ? `Publikálva: ${formatDate(post.published_at)}`
                      : `Módosítva: ${formatDate(post.updated_at)}`}
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className={canWrite ? 'text-sm text-slate-400' : 'hidden'}
                >
                  →
                </span>
              </>
            )

            return canWrite ? (
              <Link
                key={post.id}
                href={`/publikus-oldal/bejegyzesek/${post.id}`}
                className="card-raised flex min-h-20 items-center justify-between gap-4 p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 focus-visible:ring-offset-2 sm:p-5"
              >
                {rowContent}
              </Link>
            ) : (
              <article
                key={post.id}
                className="card-raised flex min-h-20 items-center justify-between gap-4 p-4 sm:p-5"
              >
                {rowContent}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
