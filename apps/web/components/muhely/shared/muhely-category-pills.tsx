'use client'

interface Category {
  id: number
  nev: string
  szin: string
}

interface MuhelyCategoryPillsProps {
  categories: Category[]
  selectedId: number | null
  onSelect: (id: number | null) => void
}

export function MuhelyCategoryPills({ categories, selectedId, onSelect }: MuhelyCategoryPillsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none" role="group" aria-label="Témakör szűrő">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selectedId === null}
        className={`
          min-h-11 shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 motion-reduce:transition-none
          ${selectedId === null
            ? 'border-[#647a52] bg-[#647a52] text-white shadow-sm'
            : 'border-[#d9cdbb] bg-[#fffdf7] text-[#687066] hover:-translate-y-0.5 hover:border-[#9daa8f] hover:text-[#26382f]'
          }
        `}
      >
        Minden témakör
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id === selectedId ? null : cat.id)}
          aria-pressed={cat.id === selectedId}
          className={`
            min-h-11 shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 motion-reduce:transition-none
            ${cat.id === selectedId
              ? 'border-[#647a52] bg-[#647a52] text-white shadow-sm'
              : 'border-[#d9cdbb] bg-[#fffdf7] text-[#687066] hover:-translate-y-0.5 hover:border-[#9daa8f] hover:text-[#26382f]'
            }
          `}
        >
          {cat.nev}
        </button>
      ))}
    </div>
  )
}
