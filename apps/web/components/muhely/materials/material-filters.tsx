'use client'

import { BookOpen, Plus, SlidersHorizontal, UserRound } from 'lucide-react'
import { MuhelySearchBar } from '../shared/muhely-search-bar'
import { MuhelyCategoryPills } from '../shared/muhely-category-pills'
import styles from './materials-studio.module.css'

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
  view: 'kozos' | 'sajat'
  onViewChange: (view: 'kozos' | 'sajat') => void
  sharedCount: number
  ownCount: number
}

export function MaterialFilters({
  categories,
  search,
  onSearchChange,
  selectedCategoryId,
  onCategoryChange,
  onUploadClick,
  view,
  onViewChange,
  sharedCount,
  ownCount,
}: MaterialFiltersProps) {
  return (
    <div id="material-catalogue" className={`${styles.catalogueDesk} space-y-4 p-4 sm:p-5`}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#d3a45e]/10 blur-2xl" aria-hidden="true" />
      <div
        className={`${styles.viewTabs} relative grid grid-cols-2 gap-1 rounded-2xl border border-[#ded1be] bg-[#f4ebdd]/75 p-1`}
        role="group"
        aria-label="Műhelypolc nézete"
      >
        <button
          type="button"
          aria-pressed={view === 'kozos'}
          onClick={() => onViewChange('kozos')}
          className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70 sm:text-sm ${
            view === 'kozos'
              ? 'bg-white text-[#314b3b] shadow-sm'
              : 'text-[#73786f] hover:bg-white/55 hover:text-[#405444]'
          }`}
        >
          <BookOpen className={`${styles.viewIcon} h-4 w-4 shrink-0`} aria-hidden="true" />
          <span className="truncate">Közös polc</span>
          <span className="shrink-0 rounded-full bg-[#e8ede2] px-2 py-0.5 text-[10px] tabular-nums text-[#647a52]">
            {sharedCount}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={view === 'sajat'}
          onClick={() => onViewChange('sajat')}
          className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70 sm:text-sm ${
            view === 'sajat'
              ? 'bg-white text-[#314b3b] shadow-sm'
              : 'text-[#73786f] hover:bg-white/55 hover:text-[#405444]'
          }`}
        >
          <UserRound className={`${styles.viewIcon} h-4 w-4 shrink-0`} aria-hidden="true" />
          <span className="truncate">Saját polcom</span>
          <span className="shrink-0 rounded-full bg-[#f2e5d3] px-2 py-0.5 text-[10px] tabular-nums text-[#9a684c]">
            {ownCount}
          </span>
        </button>
      </div>

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
