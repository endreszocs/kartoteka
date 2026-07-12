'use client'

import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MaterialCard } from './material-card'
import { MaterialFilters } from './material-filters'
import { MaterialUploadDialog } from './material-upload-dialog'
import { MaterialDetailDialog } from './material-detail-dialog'
import { MuhelyEmptyState } from '../shared/muhely-empty-state'
import { BookOpen, LibraryBig } from 'lucide-react'

interface Material {
  id: string
  cim: string
  leiras: string | null
  forras_url: string | null
  forras_nev: string | null
  formatum: string
  feltolto_id: string | null
  feltolto_nev: string | null
  feltolto_gyulekezet: string | null
  letoltes_szam: number
  csatolmany_url: string | null
  created_at: string
  mm_segedanyag_kategoriak: {
    kategoria_id: number
    mm_kategoriak: { nev: string; ikon: string; szin: string } | null
  }[]
}

interface Category {
  id: number
  nev: string
  szin: string
}

interface MaterialGridProps {
  materials: Material[]
  categories: Category[]
  currentUserId?: string
  isAdmin?: boolean
}

export function MaterialGrid({ materials, categories, currentUserId, isAdmin }: MaterialGridProps) {
  const reduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = materials

    if (search) {
      const lc = search.toLowerCase()
      result = result.filter(
        (m) =>
          m.cim.toLowerCase().includes(lc) ||
          (m.leiras && m.leiras.toLowerCase().includes(lc)) ||
          (m.feltolto_nev && m.feltolto_nev.toLowerCase().includes(lc)),
      )
    }

    if (selectedCategoryId) {
      result = result.filter((m) =>
        m.mm_segedanyag_kategoriak.some((k) => k.kategoria_id === selectedCategoryId),
      )
    }

    return result
  }, [materials, search, selectedCategoryId])

  const detailMaterial = detailId ? materials.find((m) => m.id === detailId) || null : null

  return (
    <>
      <MaterialFilters
        categories={categories}
        search={search}
        onSearchChange={setSearch}
        selectedCategoryId={selectedCategoryId}
        onCategoryChange={setSelectedCategoryId}
        onUploadClick={() => setUploadOpen(true)}
      />

      {filtered.length === 0 ? (
        <MuhelyEmptyState
          icon={BookOpen}
          title={materials.length === 0 ? 'A polc még az első kötetre vár' : 'Ezen a polcon most nincs találat'}
          description={materials.length === 0
            ? 'Légy te az első, aki megoszt egy hasznos anyagot a közösséggel! Prédikációvázlat, liturgiai segédlet — bármi, ami segít a szolgálatban.'
            : 'Próbálj más kifejezést vagy témakört, és újra végignézzük veled a polcot.'}
          action={
            <button
              type="button"
              onClick={() => {
                if (materials.length === 0) setUploadOpen(true)
                else { setSearch(''); setSelectedCategoryId(null) }
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] motion-reduce:transition-none"
            >
              {materials.length === 0 ? 'Segédanyag megosztása' : 'Minden anyag mutatása'}
            </button>
          }
        />
      ) : (
        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between gap-4 px-1">
            <div className="flex items-center gap-2 text-sm text-[#647067]">
              <LibraryBig className="h-4 w-4 text-[#647a52]" />
              <span aria-live="polite"><strong className="font-semibold text-[#26382f]">{filtered.length}</strong> anyag a polcon</span>
            </div>
            {(search || selectedCategoryId) && (
              <button
                type="button"
                onClick={() => { setSearch(''); setSelectedCategoryId(null) }}
                className="inline-flex min-h-11 items-center text-xs font-semibold text-[#9a684c] underline decoration-[#d6b89b] underline-offset-4 hover:text-[#6c4937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60"
              >
                Szűrők törlése
              </button>
            )}
          </div>

          <section className="relative rounded-[1.2rem] border-[9px] border-[#8a6043] bg-[#d2ab83] p-2.5 shadow-[inset_0_0_0_2px_rgba(255,255,255,.17),0_24px_45px_-28px_rgba(54,38,25,.9)] sm:p-4" aria-label="Segédanyagok polca">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              aria-hidden="true"
              style={{ backgroundImage: 'repeating-linear-gradient(4deg, transparent 0, transparent 13px, rgba(74,47,29,.22) 14px, transparent 15px)' }}
            />
            <div className="relative grid gap-4 rounded-lg border border-[#a77755]/70 bg-[#eadcc8] p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((m, index) => (
                <motion.div
                  key={m.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: reduceMotion ? 0 : Math.min(index * 0.035, 0.25), ease: [0.22, 1, 0.36, 1] }}
                >
                  <MaterialCard
                    material={m}
                    onSelect={(id) => setDetailId(id)}
                  />
                </motion.div>
              ))}
            </div>
            <div className="relative mx-3 h-2 rounded-b-full bg-gradient-to-b from-[#74492f] to-[#a87551] shadow-[0_5px_8px_rgba(65,39,23,.28)]" aria-hidden="true" />
          </section>
        </div>
      )}

      <MaterialUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        categories={categories}
      />

      <MaterialDetailDialog
        material={detailMaterial}
        open={!!detailId}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </>
  )
}
