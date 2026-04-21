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
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button
        onClick={() => onSelect(null)}
        className={`
          shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200
          ${selectedId === null
            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
            : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
          }
        `}
      >
        Mind
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id === selectedId ? null : cat.id)}
          className={`
            shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200
            ${cat.id === selectedId
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
              : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
            }
          `}
        >
          {cat.nev}
        </button>
      ))}
    </div>
  )
}
