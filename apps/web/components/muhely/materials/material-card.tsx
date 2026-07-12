import { ArrowUpRight, BookOpen, ExternalLink } from 'lucide-react'

interface MaterialCardProps {
  material: {
    id: string
    cim: string
    leiras: string | null
    forras_url: string | null
    formatum: string
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
      type="button"
      onClick={() => onSelect?.(material.id)}
      aria-label={`${material.cim} megnyitása`}
      className="group relative flex min-h-[286px] w-full flex-col overflow-hidden rounded-[1rem_0.8rem_1.15rem_0.7rem] border border-[#d3c3aa] bg-[#fffdf7] p-5 text-left shadow-[0_12px_28px_-20px_rgba(52,42,29,0.75)] transition duration-300 hover:-translate-y-1.5 hover:rotate-[-0.25deg] hover:border-[#bda987] hover:shadow-[0_20px_36px_-22px_rgba(52,42,29,0.8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#b68b65] motion-reduce:transition-none"
    >
      <span
        className="absolute right-5 top-0 h-9 w-4 bg-[#c87552] shadow-sm transition-transform duration-300 group-hover:translate-y-1 motion-reduce:transition-none"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)' }}
        aria-hidden="true"
      />
      <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#647a52] via-[#839270] to-[#d3a45e]/70" aria-hidden="true" />

      {/* Categories */}
      {categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5 pr-7">
          {categories.slice(0, 3).map((cat) => (
            <span
              key={cat.nev}
              className="rounded-full border border-[#d9cebc] bg-[#f4ebdd]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#647a52]"
            >
              {cat.nev}
            </span>
          ))}
          {categories.length > 3 && (
            <span className="rounded-full border border-[#ded3c3] px-2.5 py-1 text-[10px] font-medium text-[#777d73]">
              +{categories.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a7950]">
        <BookOpen className="h-3.5 w-3.5" />
        {material.formatum || 'Segédanyag'}
      </div>

      <h3 className="mb-2 line-clamp-3 font-heading text-[1.35rem] leading-snug text-[#26382f] transition-colors duration-200 group-hover:text-[#526943] motion-reduce:transition-none">
        {material.cim}
      </h3>

      {/* Description */}
      {material.leiras && (
        <p className="mb-4 line-clamp-3 text-sm leading-6 text-[#687066]">
          {material.leiras}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto border-t border-dashed border-[#d9cdbb] pt-3">
        <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d9cdbb] bg-[#f4ebdd]">
            <BookOpen className="h-3 w-3 text-[#647a52]" />
          </div>
          <span className="truncate text-[11px] text-[#7c8178]">
            {material.feltolto_nev || 'Ismeretlen'} · {formatDate(material.created_at)}
          </span>
        </div>

        {material.forras_url && (
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#a0a399] transition-colors group-hover:text-[#647a52]" />
        )}
        </div>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#647a52] opacity-70 transition-all group-hover:gap-2 group-hover:opacity-100 motion-reduce:transition-none">
          Belelapozok <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}
