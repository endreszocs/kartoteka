'use client'

import { useState, useMemo } from 'react'
import { MaterialCard } from './material-card'
import { MaterialFilters } from './material-filters'
import { MaterialUploadDialog } from './material-upload-dialog'
import { MaterialDetailDialog } from './material-detail-dialog'
import { MuhelyEmptyState } from '../shared/muhely-empty-state'
import { BookOpen } from 'lucide-react'

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
          title="Még nincsenek segédanyagok"
          description="Légy te az első, aki megoszt egy hasznos anyagot a közösséggel! Prédikáció-vázlatok, liturgiai segédletek, bármi, ami segít a szolgálatban."
          action={
            <button
              onClick={() => setUploadOpen(true)}
              className="px-5 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              Segédanyag megosztása
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
          {filtered.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onSelect={(id) => setDetailId(id)}
            />
          ))}
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
