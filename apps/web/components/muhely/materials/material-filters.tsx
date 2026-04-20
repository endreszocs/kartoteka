'use client'

import { Plus } from 'lucide-react'
import { MuhelySearchBar } from '../shared/muhely-search-bar'
import { MuhelyCategoryPills } from '../shared/muhely-category-pills'

interface Category {
  id: number
  nev: string
  szin: string
}

interface MaterialFiltersProps {
  categories: Category[]
  search: string
  onSearchChange: (value: string) => void
  selectedCategoryId: number | null
  onCategoryChange: (id: number | null) => void
  onUploadClick: () => void
}

export function MaterialFilters({
  categories,
  search,
  onSearchChange,
  selectedCategoryId,
  onCategoryChange,
  onUploadClick,
}: MaterialFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <MuhelySearchBar
            value={search}
            onChange={onSearchChange}
            placeholder="Keresés a segédanyagokban..."
          />
        </div>
        <button
          onClick={onUploadClick}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-sm shadow-emerald-200 hover:bg-emerald-700 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Új segédanyag</span>
        </button>
      </div>

      <MuhelyCategoryPills
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={onCategoryChange}
      />
    </div>
  )
}
