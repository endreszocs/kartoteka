'use client'

import { Plus, SlidersHorizontal } from 'lucide-react'
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
    <div className="relative space-y-4 overflow-hidden rounded-[1.6rem_1.1rem_1.8rem_1.3rem] border border-[#ddcfbb] bg-[#fffdf7]/95 p-4 shadow-[0_14px_34px_-26px_rgba(55,45,31,0.7)] sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#d3a45e]/10 blur-2xl" aria-hidden="true" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <MuhelySearchBar
            value={search}
            onChange={onSearchChange}
            placeholder="Keresés a segédanyagokban..."
          />
        </div>
        <button
          type="button"
          onClick={onUploadClick}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#314b3b] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_-14px_rgba(38,56,47,0.9)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#26382f] hover:shadow-[0_13px_24px_-13px_rgba(38,56,47,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <Plus className="w-4 h-4" />
          <span>Új segédanyag</span>
        </button>
      </div>

      <div className="flex items-start gap-2 border-t border-dashed border-[#ddd1bf] pt-4">
        <SlidersHorizontal className="mt-1 h-4 w-4 shrink-0 text-[#9a7950]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <MuhelyCategoryPills
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={onCategoryChange}
          />
        </div>
      </div>
    </div>
  )
}
