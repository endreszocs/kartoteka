'use client'

import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ForumThreadCard } from './forum-thread-card'
import { ForumComposeDialog } from './forum-compose-dialog'
import { MuhelySearchBar } from '../shared/muhely-search-bar'
import { MuhelyCategoryPills } from '../shared/muhely-category-pills'
import { MuhelyEmptyState } from '../shared/muhely-empty-state'
import { Lightbulb, Plus, Sprout } from 'lucide-react'

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
  { value: 'szavazas', label: 'Szavazás' },
  { value: 'kozos_munka', label: 'Aktív' },
  { value: 'megvalosult', label: 'Megvalósult' },
]

export function ForumThreadList({ ideas, categories }: ForumThreadListProps) {
  const reduceMotion = useReducedMotion()
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
      <section className="relative space-y-4 overflow-hidden rounded-[1.7rem_1.15rem_1.9rem_1.35rem] border border-[#ddcfbb] bg-[#fffdf7]/95 p-4 shadow-[0_14px_34px_-26px_rgba(55,45,31,0.7)] sm:p-5" aria-label="Ötletek keresése és szűrése">
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#c87552]/10 blur-2xl" aria-hidden="true" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <MuhelySearchBar
              value={search}
              onChange={setSearch}
              placeholder="Keresés a fórumon..."
            />
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#314b3b] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_-14px_rgba(38,56,47,0.9)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            <Plus className="w-4 h-4" />
            <span>Új ötlet</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 border-t border-dashed border-[#ddd1bf] pt-4 lg:flex-row lg:items-start">
          {/* Status filter */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none" role="group" aria-label="Ötlet állapota">
            {STATUS_FILTERS.map((sf) => (
              <button
                key={sf.value}
                type="button"
                onClick={() => setStatusFilter(sf.value)}
                aria-pressed={statusFilter === sf.value}
                className={`min-h-11 shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 motion-reduce:transition-none ${
                  statusFilter === sf.value
                    ? 'border-[#c87552] bg-[#c87552] text-white shadow-sm'
                    : 'border-[#d9cdbb] bg-[#fffdf7] text-[#687066] hover:border-[#c9957e] hover:text-[#7d4938]'
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>

          <div className="hidden h-7 w-px bg-[#d9cdbb] lg:block" />

          <div className="min-w-0 flex-1">
            <MuhelyCategoryPills
              categories={categories}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
          </div>
        </div>
      </section>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <MuhelyEmptyState
          icon={Lightbulb}
          title={ideas.length === 0 ? 'Az asztal még az első ötletre vár' : 'Most nincs ilyen ötlet az asztalon'}
          description={ideas.length === 0
            ? 'Indíts el egy beszélgetést! Oszd meg az ötletedet, kérdezz, vagy bátorítsd a testvéreket.'
            : 'Próbálj más keresést, állapotot vagy témakört, és újra körbenézünk.'}
          action={
            <button
              type="button"
              onClick={() => {
                if (ideas.length === 0) setComposeOpen(true)
                else { setSearch(''); setSelectedCategoryId(null); setStatusFilter('mind') }
              }}
              className="min-h-11 rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] motion-reduce:transition-none"
            >
              {ideas.length === 0 ? 'Leteszem az első ötletet' : 'Minden ötlet mutatása'}
            </button>
          }
        />
      ) : (
        <div className="mt-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <div className="flex items-center gap-2 text-[#647a52]">
                <Sprout className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Az ötletkertben most</span>
              </div>
              <h2 className="mt-1 font-heading text-2xl text-[#26382f]">Gondolatok, amelyek társra várnak</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#747b72]" aria-live="polite">{filtered.length} találat</span>
              {(search || selectedCategoryId || statusFilter !== 'mind') && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSelectedCategoryId(null); setStatusFilter('mind') }}
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-[#9a684c] underline decoration-[#d6b89b] underline-offset-4 hover:text-[#6c4937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60"
                >
                  Szűrők törlése
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.map((idea, index) => (
              <motion.div
                key={idea.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 12, rotate: index % 2 === 0 ? -0.25 : 0.25 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ duration: 0.34, delay: reduceMotion ? 0 : Math.min(index * 0.035, 0.25), ease: [0.22, 1, 0.36, 1] }}
              >
                <ForumThreadCard idea={idea} />
              </motion.div>
            ))}
          </div>
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
