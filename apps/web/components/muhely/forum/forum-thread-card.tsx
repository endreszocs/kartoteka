import Link from 'next/link'
import { ArrowUpRight, Heart, MessageCircle, Target, Users } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  uj: { label: 'Friss hajtás', color: 'border-[#bdc9b5] bg-[#edf2e9] text-[#526943]' },
  szavazas: { label: 'Körbejárjuk', color: 'border-[#dfc48f] bg-[#fbf0d8] text-[#8c6634]' },
  kozos_munka: { label: 'Közös alkotás', color: 'border-[#d8ab98] bg-[#f6e6df] text-[#99563f]' },
  megvalosult: { label: 'Gyümölcsöt termett', color: 'border-[#99ae8d] bg-[#e6eee1] text-[#405d3e]' },
  archivalt: { label: 'Eltettük későbbre', color: 'border-[#d6d1c8] bg-[#f2efe9] text-[#74746e]' },
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
      className="group relative block h-full min-h-[250px] overflow-hidden rounded-[1.2rem_0.85rem_1.35rem_0.95rem] border border-[#d5c5ad] bg-[#fffdf7] p-5 shadow-[0_12px_30px_-22px_rgba(54,44,31,.75)] transition duration-300 hover:-translate-y-1 hover:rotate-[0.15deg] hover:border-[#bba584] hover:shadow-[0_20px_38px_-24px_rgba(54,44,31,.82)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      <span className="absolute -right-4 -top-4 h-14 w-14 rounded-full border border-[#d7c8b2] bg-[#f4ebdd]/70" aria-hidden="true" />
      <div className="flex items-start gap-4">
        {/* Vote count (left side) */}
        <div className="flex h-[62px] w-[54px] shrink-0 flex-col items-center justify-center rounded-full border border-[#dcc39c] bg-[#fbf1dd] shadow-[inset_0_0_0_3px_#fffaf0]">
          <Heart className="h-4 w-4 text-[#c87552] transition-transform group-hover:scale-110 motion-reduce:transition-none" />
          <span className="mt-0.5 font-heading text-lg leading-none text-[#6e5437]">{idea.tamogatasok_szama || 0}</span>
          <span className="text-[8px] uppercase tracking-wide text-[#9a7950]">támasz</span>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Status + categories row */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5 pr-4">
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${status.color}`}>
              {status.label}
            </span>
            {categories.slice(0, 2).map((cat) => (
              <span
                key={cat.nev}
                className="rounded-full border border-[#d8c9d7] bg-[#f2edf2] px-2.5 py-1 text-[9px] font-semibold text-[#735f73]"
              >
                {cat.nev}
              </span>
            ))}
          </div>

          {/* Title */}
          <h3 className="mb-2 line-clamp-2 font-heading text-[1.35rem] leading-snug text-[#26382f] transition-colors group-hover:text-[#526943]">
            {idea.cim}
          </h3>

          {/* Description excerpt */}
          <p className="mb-4 line-clamp-3 text-sm leading-6 text-[#687066]">
            {idea.leiras}
          </p>

          {idea.celcsoport && (
            <div className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-[#7b776d]">
              <Target className="h-3.5 w-3.5 text-[#c87552]" />
              {idea.celcsoport}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-end justify-between gap-3 border-t border-dashed border-[#ddd1bf] pt-3">
            <span className="text-[11px] leading-4 text-[#7e837a]">
              {idea.otletgazda_nev || 'Ismeretlen'} · {formatDate(idea.created_at)}
            </span>
            <div className="flex shrink-0 items-center gap-3 text-xs text-[#727970]">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" /> {idea.csatlakozok_szama || 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> {idea.hozzaszolasok_szama || 0}
              </span>
              <ArrowUpRight className="h-4 w-4 text-[#647a52] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
