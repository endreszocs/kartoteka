import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Globe, Eye, FileEdit, Plus, Newspaper } from 'lucide-react'

interface Props {
  congregationId: string
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export async function PublicSiteWidget({ congregationId }: Props) {
  const supabase = await createClient()

  // Publikus oldal állapota
  const { data: site } = await supabase
    .from('public_sites')
    .select('slug, display_name, is_published')
    .eq('congregation_id', congregationId)
    .maybeSingle()

  // Utolsó publikált poszt
  const { data: latestPost } = await supabase
    .from('public_posts')
    .select('title, published_at')
    .eq('congregation_id', congregationId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Publikált posztok száma
  const { count: publishedCount } = await supabase
    .from('public_posts')
    .select('*', { count: 'exact', head: true })
    .eq('congregation_id', congregationId)
    .eq('status', 'published')

  // Ha még nincs oldal beállítva
  if (!site) {
    return (
      <div className="card-raised p-5 flex items-center gap-4 bg-gradient-to-br from-emerald-50/40 to-teal-50/30">
        <div className="w-12 h-12 rounded-xl bg-emerald-100/70 flex items-center justify-center shrink-0">
          <Globe className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading text-lg text-slate-800 leading-tight">
            Publikus gyülekezeti oldal
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Egy lehetőség — szép, egyedi dizájnú gyülekezeti weboldal, amivel megoszthatod a közösség életét a világgal.
          </p>
        </div>
        <Link
          href="/publikus-oldal"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 transition-colors"
        >
          Kipróbálom
        </Link>
      </div>
    )
  }

  const days = daysSince(latestPost?.published_at || null)
  const showReminder = site.is_published && (!latestPost || (days !== null && days > 14))

  return (
    <div className="card-raised p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-emerald-100/70 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-lg text-slate-800 truncate">Publikus oldal</h3>
              {site.is_published ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                  Élő
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold">
                  Piszkozat
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              /gy/{site.slug} · {publishedCount || 0} publikált bejegyzés
            </p>
          </div>
        </div>
      </div>

      {/* Emlékeztető, ha régi az utolsó poszt */}
      {showReminder && (
        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100/70 text-xs text-amber-800 mb-3">
          {!latestPost
            ? 'Még nincs publikált bejegyzés. Ossz meg valamit a gyülekezeti életből!'
            : `Az utolsó bejegyzésed ${days} napja jelent meg. Frissítsd a látogatóknak!`}
        </div>
      )}

      {/* Utolsó poszt info */}
      {latestPost && !showReminder && (
        <div className="text-xs text-slate-500 mb-3">
          Utolsó bejegyzés: <span className="font-medium text-slate-700">{latestPost.title}</span>
          {days !== null && ` · ${days === 0 ? 'ma' : `${days} napja`}`}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href="/publikus-oldal/bejegyzesek/uj"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Új bejegyzés
        </Link>
        <Link
          href="/publikus-oldal/bejegyzesek"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
        >
          <FileEdit className="w-3.5 h-3.5" />
          Bejegyzések
        </Link>
        <Link
          href="/publikus-oldal/magazin"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
        >
          <Newspaper className="w-3.5 h-3.5" />
          Újság
        </Link>
        {site.is_published && (
          <Link
            href={`/gy/${site.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors ml-auto"
          >
            <Eye className="w-3.5 h-3.5" />
            Megtekintés
          </Link>
        )}
      </div>
    </div>
  )
}
