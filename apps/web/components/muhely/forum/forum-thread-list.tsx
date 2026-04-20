'use client'

import { useState, useMemo } from 'react'
import { ForumThreadCard } from './forum-thread-card'
import { ForumComposeDialog } from './forum-compose-dialog'
import { MuhelySearchBar } from '../shared/muhely-search-bar'
import { MuhelyCategoryPills } from '../shared/muhely-category-pills'
import { MuhelyEmptyState } from '../shared/muhely-empty-state'
import { Lightbulb, Plus } from 'lucide-react'

interface Idea {
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
  mySupport: boolean
  myJoin: boolean
  mm_otlet_kategoriak: {
    kategoria_id: number
    mm_kategoriak: { nev: string; szin: string } | null
  }[]
}

interface Category {
  id: number
  nev: string
  szin: string
}

interface ForumThreadListProps {
  ideas: Idea[]
  categories: Category[]
}

const STATUS_FILTERS = [
  { value: 'mind', label: 'Mind' },
  { value: 'uj', label: 'Új' },
  { value: 'kozos_munka', label: 'Aktív' },
  { value: 'megvalosult', label: 'Megvalósult' },
]

export function ForumThreadList({ ideas, categories }: ForumThreadListProps) {
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('mind')
  const [composeOpen, setComposeOpen] = useState(false)

  const filtered = useMemo(() => {
    let result = ideas

    if (search) {
      const lc = search.toLowerCase()
      result = result.filter(
        (i) => i.cim.toLowerCase().includes(lc) || i.leiras.toLowerCase().includes(lc),
      )
    }

    if (selectedCategoryId) {
      result = result.filter((i) =>
        i.mm_otlet_kategoriak.some((k) => k.kategoria_id === selectedCategoryId),
      )
    }

    if (statusFilter !== 'mind') {
      result = result.filter((i) => i.statusz === statusFilter)
    }

    return result
  }, [ideas, search, selectedCategoryId, statusFilter])

  return (
    <>
      {/* Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <MuhelySearchBar
              value={search}
              onChange={setSearch}
              placeholder="Keresés a fórumon..."
            />
          </div>
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-violet-600 text-white text-sm font-semibold shadow-sm shadow-violet-200 hover:bg-violet-700 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Új téma</span>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status filter */}
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((sf) => (
              <button
                key={sf.value}
                onClick={() => setStatusFilter(sf.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  statusFilter === sf.value
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <MuhelyCategoryPills
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
          />
        </div>
      </div>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <MuhelyEmptyState
          icon={Lightbulb}
          title="Még nincsenek témák"
          description="Indíts el egy beszélgetést! Oszd meg ötleteidet, kérdezz, vagy bátorítsd a testvéreket."
          action={
            <button
              onClick={() => setComposeOpen(true)}
              className="px-5 py-2.5 rounded-full bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              Új téma indítása
            </button>
          }
        />
      ) : (
        <div className="space-y-3 mt-6">
          {filtered.map((idea) => (
            <ForumThreadCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}

      <ForumComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        categories={categories}
      />
    </>
  )
}
