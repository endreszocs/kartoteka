'use client'

import { useState, useTransition, type ElementType } from 'react'
import {
  BookOpen,
  Calendar,
  Download,
  FileText,
  Link2,
  MapPin,
  Star,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteMaterial,
  rateMaterial,
  type WorkshopMaterial,
} from '@/app/misszios-muhely/community-actions'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

import { MaterialActionBar } from './material-action-bar'
import { MaterialContent } from './material-content'
import { MaterialStarRating } from './material-star-rating'

interface MaterialDetailDialogProps {
  material: WorkshopMaterial
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string
  isAdmin?: boolean
  onEdit: (material: WorkshopMaterial) => void
  onChanged?: () => void
}

const FORMAT_INFO: Record<string, { label: string; icon: ElementType }> = {
  PDF: { label: 'PDF dokumentum', icon: FileText },
  DOCX: { label: 'Word dokumentum', icon: FileText },
  PPTX: { label: 'Prezentáció', icon: FileText },
  video: { label: 'Videó', icon: FileText },
  link: { label: 'Műhelyanyag', icon: Link2 },
  csomag: { label: 'Segédanyagcsomag', icon: Download },
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function MaterialDetailDialog({
  material,
  open,
  onOpenChange,
  currentUserId,
  isAdmin,
  onEdit,
  onChanged,
}: MaterialDetailDialogProps) {
  const celebrateReward = useRewardCelebration()
  const [myRating, setMyRating] = useState(material.sajat_ertekeles || 0)
  const [averageRating, setAverageRating] = useState(Number(material.atlag_ertekeles || 0))
  const [ratingCount, setRatingCount] = useState(material.ertekelesek_szama || 0)
  const [downloadCount, setDownloadCount] = useState(material.letoltes_szam || 0)
  const [isPending, startTransition] = useTransition()

  const categories = material.mm_segedanyag_kategoriak
    .map((category) => category.mm_kategoriak)
    .filter(Boolean) as { nev: string; ikon: string; szin: string }[]
  const formatInfo = FORMAT_INFO[material.formatum] || FORMAT_INFO.link
  const FormatIcon = formatInfo.icon
  const canEdit = currentUserId === material.feltolto_id || Boolean(isAdmin)
  const isOwnMaterial = currentUserId === material.feltolto_id

  function handleRate(pontszam: number) {
    const previousRating = myRating
    setMyRating(pontszam)
    startTransition(async () => {
      try {
        const result = await rateMaterial(material.id, pontszam)
        if ('error' in result) {
          setMyRating(previousRating)
          toast.error(result.error)
          return
        }

        if (result.averageRating !== null) setAverageRating(result.averageRating)
        if (result.ratingCount !== null) setRatingCount(result.ratingCount)
        toast.success(
          result.ownTestRating
            ? 'Tesztértékelés elmentve — ezért nem jár pont vagy jelvény.'
            : 'Köszönjük az értékelésed!',
        )
        celebrateReward(result.reward)
        onChanged?.()
      } catch (error) {
        console.error('[materials] Rating failed', error)
        setMyRating(previousRating)
        toast.error('Az értékelést most nem sikerült elmenteni. Kérlek, próbáld újra!')
      }
    })
  }

  function handleArchive() {
    if (!confirm('Biztosan archiválod ezt a segédanyagot?')) return
    startTransition(async () => {
      try {
        const result = await deleteMaterial(material.id)
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        toast.success('Segédanyag archiválva.')
        onOpenChange(false)
        onChanged?.()
      } catch (error) {
        console.error('[materials] Archiving failed', error)
        toast.error('A segédanyag archiválása most nem sikerült. Kérlek, próbáld újra!')
      }
    })
  }

  function handleEdit() {
    onOpenChange(false)
    onEdit(material)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-0.75rem)] w-[calc(100%-0.75rem)] max-w-5xl flex-col overflow-hidden rounded-[1.25rem] border-[#d6c6af] bg-[#fffdf7] p-0 shadow-[0_30px_90px_-26px_rgba(46,38,27,.6)] sm:max-h-[94dvh] sm:w-[calc(100%-2rem)] sm:rounded-[1.75rem]"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-[#d8c9b4] bg-[#f4ebdd] p-4 pr-14 sm:p-6 sm:pr-16">
          <BookOpen className="absolute -bottom-10 -right-4 h-36 w-36 rotate-[-8deg] text-[#647a52]/10" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 z-20 grid h-11 w-11 place-items-center rounded-full text-[#747b72] transition hover:bg-[#fffdf7]/80 hover:text-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70"
            aria-label="Segédanyag bezárása"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="relative flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#cdbb9e] bg-[#fffdf7] shadow-sm sm:h-14 sm:w-14">
              <FormatIcon className="h-5 w-5 text-[#647a52] sm:h-6 sm:w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a7950] sm:text-xs">
                {formatInfo.label}
              </span>
              <DialogTitle className="mt-1 break-words font-heading text-[clamp(1.35rem,7vw,1.65rem)] leading-[1.05] text-[#26382f] sm:text-4xl lg:text-[2.75rem]">
                {material.cim}
              </DialogTitle>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
            <article className="min-w-0 rounded-[1.1rem] border border-[#e1d7c8] bg-white px-4 py-5 shadow-[0_18px_42px_-34px_rgba(49,42,31,.7)] sm:px-7 sm:py-7 lg:px-10 lg:py-9" aria-label="Segédanyag tartalma">
              {categories.length > 0 && (
                <div className="mb-6 flex flex-wrap gap-1.5">
                  {categories.map((category) => (
                    <span
                      key={category.nev}
                      className="rounded-full border border-[#d8cbb8] bg-[#f4ebdd]/70 px-2.5 py-1 text-xs font-semibold text-[#647a52]"
                    >
                      {category.nev}
                    </span>
                  ))}
                </div>
              )}
              <MaterialContent content={material.leiras} />
            </article>

            <aside className="grid gap-3 sm:grid-cols-2 lg:sticky lg:top-0 lg:grid-cols-1" aria-label="Segédanyag adatai">
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3.5">
                <User className="h-4 w-4 shrink-0 text-[#8a927f]" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-xs text-[#7a8077]">Feltöltötte</div>
                  <div className="truncate text-sm font-medium text-[#35443a]">{material.feltolto_nev || 'Ismeretlen'}</div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3.5">
                <MapPin className="h-4 w-4 shrink-0 text-[#8a927f]" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-xs text-[#7a8077]">Gyülekezet</div>
                  <div className="truncate text-sm font-medium text-[#35443a]">{material.feltolto_gyulekezet || '—'}</div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3.5">
                <Calendar className="h-4 w-4 shrink-0 text-[#8a927f]" aria-hidden="true" />
                <div>
                  <div className="text-xs text-[#7a8077]">Frissítve</div>
                  <div className="text-sm font-medium text-[#35443a]">{formatDate(material.updated_at || material.created_at)}</div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3.5">
                <Download className="h-4 w-4 shrink-0 text-[#8a927f]" aria-hidden="true" />
                <div>
                  <div className="text-xs text-[#7a8077]">Letöltések</div>
                  <div className="text-sm font-medium text-[#35443a]">{downloadCount}</div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#d8c79f] bg-[#fbf1dc] p-3.5 sm:col-span-2 lg:col-span-1">
                <Star className="h-4 w-4 shrink-0 fill-[#d3a45e] text-[#d3a45e]" aria-hidden="true" />
                <div>
                  <div className="text-xs text-[#8c7550]">Közösségi értékelés</div>
                  <div className="text-sm font-medium text-[#5f4e32]">
                    {ratingCount > 0 ? `${averageRating.toLocaleString('hu-HU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5 · ${ratingCount} értékelés` : 'Még nincs értékelés'}
                  </div>
                </div>
              </div>
              {material.forras_nev && (
                <p className="px-1 text-xs leading-5 text-[#7d8178] sm:col-span-2 lg:col-span-1">
                  Forrás: <strong className="font-medium text-[#59635b]">{material.forras_nev}</strong>
                </p>
              )}
            </aside>
          </div>

          <section className="mt-6 rounded-2xl border border-[#dec69d] bg-[#fbf1dc] p-4 sm:p-5" aria-labelledby="material-rating-title">
            <div className="mb-3">
              <h3 id="material-rating-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8e6734]">
                Értékeld ezt a segédanyagot
              </h3>
              <p className="mt-1 text-xs leading-5 text-[#8d7654]">
                {isOwnMaterial
                  ? 'Tesztidőszakban a saját anyagod is értékelhető. Ez az értékelés látszik az átlagban, de nem ad pontot vagy jelvényt.'
                  : 'A csillag fölé húzva, fókuszálva vagy megérintve előre láthatod a kiválasztott értéket.'}
              </p>
            </div>
            <MaterialStarRating value={myRating} onChange={handleRate} disabled={isPending} />
          </section>

          <div className="mt-6">
            <MaterialActionBar
              material={material}
              canEdit={canEdit}
              pending={isPending}
              onEdit={handleEdit}
              onArchive={handleArchive}
              onDownloaded={setDownloadCount}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
