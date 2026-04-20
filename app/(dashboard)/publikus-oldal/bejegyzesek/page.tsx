import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { FileEdit, Plus } from 'lucide-react'

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
  const congregationId = access.effectiveCongregationId
  if (!congregationId) redirect('/publikus-oldal')

  const { data: posts } = await access.supabase
    .from('public_posts')
    .select('id, slug, title, excerpt, status, published_at, updated_at')
    .eq('congregation_id', congregationId)
    .order('updated_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto py-8">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
            <FileEdit className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="font-heading text-3xl text-slate-800">Bejegyzések</h1>
            <p className="text-sm text-slate-500">A publikus oldalon megjelenő hírek és blog posztok</p>
          </div>
        </div>
        <Link
          href="/publikus-oldal/bejegyzesek/uj"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-200 hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Új bejegyzés
        </Link>
      </header>

      {!posts || posts.length === 0 ? (
        <div className="card-raised p-12 text-center">
          <FileEdit className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
          <h2 className="font-heading text-xl text-slate-800 mb-2">Még nincs egy bejegyzés sem</h2>
          <p className="text-slate-500 mb-6">Írd meg az első hírt a gyülekezetedről!</p>
          <Link
            href="/publikus-oldal/bejegyzesek/uj"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Első bejegyzés írása
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const status = STATUS_LABEL[post.status] || STATUS_LABEL.draft
            return (
              <Link
                key={post.id}
                href={`/publikus-oldal/bejegyzesek/${post.id}`}
                className="card-raised p-5 flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
              >
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
                  <div className="text-xs text-slate-400 mt-1">
                    {post.status === 'published'
                      ? `Publikálva: ${formatDate(post.published_at)}`
                      : `Módosítva: ${formatDate(post.updated_at)}`}
                  </div>
                </div>
                <span className="text-slate-300 text-sm">→</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
