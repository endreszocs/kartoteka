import { BookOpen, ExternalLink, Star } from 'lucide-react'

interface MaterialCardProps {
  material: {
    id: string
    cim: string
    leiras: string | null
    forras_url: string | null
    feltolto_nev: string | null
    feltolto_gyulekezet: string | null
    letoltes_szam: number
    created_at: string
    mm_segedanyag_kategoriak: {
      kategoria_id: number
      mm_kategoriak: { nev: string; szin: string } | null
    }[]
  }
  onSelect?: (id: string) => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function MaterialCard({ material, onSelect }: MaterialCardProps) {
  const categories = material.mm_segedanyag_kategoriak
    .map((k) => k.mm_kategoriak)
    .filter(Boolean) as { nev: string; szin: string }[]

  return (
    <button
      onClick={() => onSelect?.(material.id)}
      className="w-full text-left rounded-2xl bg-white/90 border border-white/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 group"
    >
      {/* Categories */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {categories.slice(0, 3).map((cat) => (
            <span
              key={cat.nev}
              className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium"
            >
              {cat.nev}
            </span>
          ))}
          {categories.length > 3 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 text-[10px] font-medium">
              +{categories.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <h3 className="font-semibold text-slate-800 text-base mb-1.5 line-clamp-2 group-hover:text-emerald-700 transition-colors">
        {material.cim}
      </h3>

      {/* Description */}
      {material.leiras && (
        <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed mb-3">
          {material.leiras}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <BookOpen className="w-3 h-3 text-emerald-500" />
          </div>
          <span className="text-xs text-slate-400 truncate">
            {material.feltolto_nev || 'Ismeretlen'} · {formatDate(material.created_at)}
          </span>
        </div>

        {material.forras_url && (
          <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
        )}
      </div>
    </button>
  )
}
