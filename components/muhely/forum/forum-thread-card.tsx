import Link from 'next/link'
import { Heart, Users, MessageCircle } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  uj: { label: 'Új ötlet', color: 'bg-sky-50 text-sky-700' },
  szavazas: { label: 'Szavazás alatt', color: 'bg-amber-50 text-amber-700' },
  kozos_munka: { label: 'Közös munka', color: 'bg-violet-50 text-violet-700' },
  megvalosult: { label: 'Megvalósult', color: 'bg-emerald-50 text-emerald-700' },
  archivalt: { label: 'Archivált', color: 'bg-slate-50 text-slate-500' },
}

interface ForumThreadCardProps {
  idea: {
    id: string
    cim: string
    leiras: string
    celcsoport: string | null
    statusz: string | null
    tamogatasok_szama: number | null
    csatlakozok_szama: number | null
    hozzaszolasok_szama: number | null
    otletgazda_nev: string | null
    otletgazda_gyulekezet: string | null
    created_at: string
    mm_otlet_kategoriak: {
      kategoria_id: number
      mm_kategoriak: { nev: string; szin: string } | null
    }[]
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000)
  if (diffH < 1) return 'most'
  if (diffH < 24) return `${diffH} órája`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} napja`
  return d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
}

export function ForumThreadCard({ idea }: ForumThreadCardProps) {
  const status = STATUS_MAP[idea.statusz || 'uj'] || STATUS_MAP.uj
  const categories = idea.mm_otlet_kategoriak
    .map((k) => k.mm_kategoriak)
    .filter(Boolean) as { nev: string; szin: string }[]

  return (
    <Link
      href={`/misszios-muhely/forum/${idea.id}`}
      className="block rounded-2xl bg-white/90 border border-white/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 group"
    >
      <div className="flex items-start gap-4">
        {/* Vote count (left side) */}
        <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
          <Heart className="w-4 h-4 text-slate-300 group-hover:text-rose-400 transition-colors" />
          <span className="text-sm font-bold text-slate-600">{idea.tamogatasok_szama || 0}</span>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Status + categories row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${status.color}`}>
              {status.label}
            </span>
            {categories.slice(0, 2).map((cat) => (
              <span
                key={cat.nev}
                className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-medium"
              >
                {cat.nev}
              </span>
            ))}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-slate-800 text-base mb-1 group-hover:text-violet-700 transition-colors line-clamp-1">
            {idea.cim}
          </h3>

          {/* Description excerpt */}
          <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed mb-3">
            {idea.leiras}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {idea.otletgazda_nev || 'Ismeretlen'} · {formatDate(idea.created_at)}
            </span>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" /> {idea.csatlakozok_szama || 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> {idea.hozzaszolasok_szama || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
