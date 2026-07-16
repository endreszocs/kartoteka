'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
  loadMaterialDetail,
  loadMaterialsPage,
  type WorkshopMaterial,
} from '@/app/misszios-muhely/community-actions'
import { MaterialCard } from './material-card'
import { MaterialFilters } from './material-filters'
import { MaterialUploadDialog } from './material-upload-dialog'
import { MaterialDetailDialog } from './material-detail-dialog'
import { MaterialShelfStage } from './material-shelf-stage'
import { MuhelyEmptyState } from '../shared/muhely-empty-state'
import { BookOpen, LibraryBig, LoaderCircle, UserRound } from 'lucide-react'
import styles from './materials-studio.module.css'

interface Category {
  id: number
  nev: string
  szin: string
}

interface MaterialGridProps {
  materials: WorkshopMaterial[]
  categories: Category[]
  currentUserId?: string
  isAdmin?: boolean
}

export function MaterialGrid({ materials, categories, currentUserId, isAdmin }: MaterialGridProps) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [view, setView] = useState<'kozos' | 'sajat'>('kozos')
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<WorkshopMaterial | null>(null)
  const [detailMaterial, setDetailMaterial] = useState<WorkshopMaterial | null>(null)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [listedMaterials, setListedMaterials] = useState(materials)
  const [filterPending, setFilterPending] = useState(false)

  const ownMaterials = useMemo(
    () => materials.filter((material) => material.feltolto_id === currentUserId),
    [currentUserId, materials],
  )

  const filtered = useMemo(
    () => view === 'sajat'
      ? listedMaterials.filter((material) => material.feltolto_id === currentUserId)
      : listedMaterials,
    [currentUserId, listedMaterials, view],
  )

  useEffect(() => {
    const normalizedSearch = search.trim()
    if (!normalizedSearch && !selectedCategoryId) {
      setListedMaterials(materials)
      setFilterPending(false)
      return
    }

    let cancelled = false
    setFilterPending(true)
    const timer = window.setTimeout(() => {
      void loadMaterialsPage(
        normalizedSearch || undefined,
        selectedCategoryId || undefined,
      ).then((result) => {
        if (cancelled) return
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        setListedMaterials(result.materials)
      }).catch((error) => {
        if (cancelled) return
        console.error('[materials] Material filtering failed', error)
        toast.error('A polc keresése most nem sikerült. Kérlek, próbáld újra!')
      }).finally(() => {
        if (!cancelled) setFilterPending(false)
      })
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [materials, search, selectedCategoryId])

  async function handleMaterialSelect(materialId: string) {
    if (loadingDetailId) return
    setLoadingDetailId(materialId)
    try {
      const result = await loadMaterialDetail(materialId)

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      setDetailMaterial(result.material)
    } catch (error) {
      console.error('[materials] Material detail loading failed', error)
      toast.error('A segédanyagot most nem sikerült kinyitni. Kérlek, próbáld újra!')
    } finally {
      setLoadingDetailId(null)
    }
  }

  return (
    <>
      <MaterialFilters
        categories={categories}
        search={search}
        onSearchChange={setSearch}
        selectedCategoryId={selectedCategoryId}
        onCategoryChange={setSelectedCategoryId}
        onUploadClick={() => {
          setEditingMaterial(null)
          setEditorOpen(true)
        }}
        view={view}
        onViewChange={(nextView) => {
          setView(nextView)
          setSearch('')
          setSelectedCategoryId(null)
        }}
        sharedCount={materials.length}
        ownCount={ownMaterials.length}
      />

      <div
        id="material-shelf-results"
        className={styles.resultWrap}
        aria-label={view === 'sajat' ? 'Saját segédanyagaim' : 'Közös segédanyagok'}
        aria-busy={filterPending}
      >
        {filtered.length === 0 ? (
          <MuhelyEmptyState
            icon={view === 'sajat' ? UserRound : BookOpen}
            title={
              view === 'sajat' && ownMaterials.length === 0
                ? 'A saját polcod még az első kötetre vár'
                : materials.length === 0
                  ? 'A közös polc még az első kötetre vár'
                  : 'Ezen a polcon most nincs találat'
            }
            description={
              view === 'sajat' && ownMaterials.length === 0
                ? 'Itt egy helyen látod és gondozhatod mindazt, amit a lelkésztársaiddal megosztottál.'
                : materials.length === 0
                  ? 'Légy te az első, aki megoszt egy hasznos anyagot a közösséggel! Prédikációvázlat, liturgiai segédlet — bármi, ami segít a szolgálatban.'
                  : 'Próbálj más kifejezést vagy témakört, és újra végignézzük veled a polcot.'
            }
            action={
              <button
                type="button"
                onClick={() => {
                  const emptyShelf = materials.length === 0 || (view === 'sajat' && ownMaterials.length === 0)
                  if (emptyShelf) {
                    setEditingMaterial(null)
                    setEditorOpen(true)
                  } else {
                    setSearch('')
                    setSelectedCategoryId(null)
                  }
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] motion-reduce:transition-none"
              >
                {materials.length === 0 || (view === 'sajat' && ownMaterials.length === 0)
                  ? 'Új segédanyag készítése'
                  : 'Minden anyag mutatása'}
              </button>
            }
          />
        ) : (
          <div>
            <div className={`${styles.resultHeader} flex items-center justify-between gap-4 px-1`}>
              <div className="flex items-center gap-2 text-sm text-[#647067]">
                {view === 'sajat'
                  ? <UserRound className="h-4 w-4 text-[#9a684c]" aria-hidden="true" />
                  : <LibraryBig className="h-4 w-4 text-[#647a52]" aria-hidden="true" />}
                <span aria-live="polite">
                  {filterPending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      Polc frissítése…
                    </span>
                  ) : (
                    <><strong className="font-semibold text-[#26382f]">{filtered.length}</strong>{' '}
                    {view === 'sajat' ? 'saját anyag' : 'anyag a közös polcon'}</>
                  )}
                </span>
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

            <MaterialShelfStage busy={filterPending}>
              {filtered.map((m, index) => {
                const animateEntry = !reduceMotion && index < 12

                return (
                  <motion.div
                    className={styles.bookSlot}
                    key={m.id}
                    layout={!reduceMotion && filtered.length <= 32}
                    initial={animateEntry ? { opacity: 0, y: 10 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: animateEntry ? 0.34 : 0,
                      delay: animateEntry ? Math.min(index * 0.028, 0.18) : 0,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <MaterialCard
                      material={m}
                      loading={loadingDetailId === m.id}
                      disabled={loadingDetailId !== null}
                      onSelect={(id) => void handleMaterialSelect(id)}
                    />
                  </motion.div>
                )
              })}
            </MaterialShelfStage>
          </div>
        )}
      </div>

      {editorOpen && (
        <MaterialUploadDialog
          key={editingMaterial?.id || 'new-material'}
          open
          onOpenChange={(nextOpen) => {
            setEditorOpen(nextOpen)
            if (!nextOpen) setEditingMaterial(null)
          }}
          categories={categories}
          material={editingMaterial}
          onSaved={() => router.refresh()}
        />
      )}

      {detailMaterial && (
        <MaterialDetailDialog
          key={detailMaterial.id}
          material={detailMaterial}
          open
          onOpenChange={(open) => { if (!open) setDetailMaterial(null) }}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onEdit={(material) => {
            setEditingMaterial(material)
            setEditorOpen(true)
          }}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  )
}
