'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { rateMaterial, deleteMaterial } from '@/app/misszios-muhely/community-actions'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { toast } from 'sonner'
import {
  BookOpen,
  ExternalLink,
  Download,
  Star,
  User,
  MapPin,
  Calendar,
  FileText,
  Trash2,
  Link2,
  X,
} from 'lucide-react'

interface MaterialCategory {
  kategoria_id: number
  mm_kategoriak: { nev: string; ikon: string; szin: string } | null
}

interface MaterialDetailDialogProps {
  material: {
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
    mm_segedanyag_kategoriak: MaterialCategory[]
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string
  isAdmin?: boolean
}

const FORMAT_INFO: Record<string, { label: string; icon: React.ElementType }> = {
  PDF: { label: 'PDF dokumentum', icon: FileText },
  DOCX: { label: 'Word dokumentum', icon: FileText },
  PPTX: { label: 'Prezentáció', icon: FileText },
  video: { label: 'Videó', icon: FileText },
  link: { label: 'Webes hivatkozás', icon: Link2 },
  csomag: { label: 'Csomag', icon: Download },
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number
  onChange?: (val: number) => void
  readOnly?: boolean
}) {
  const [hover, setHover] = useState(0)

  return (
    <div className="grid w-full max-w-[15rem] grid-cols-5 gap-1" role="group" aria-label="Értékelés">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          aria-label={`${star} csillag`}
          aria-pressed={value === star}
          onMouseEnter={() => !readOnly && setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange?.(star)}
          className={`grid h-11 w-11 place-items-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] motion-reduce:transition-none ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              star <= (hover || value)
                ? 'fill-[#d3a45e] text-[#d3a45e]'
                : 'text-[#d8d0c3]'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export function MaterialDetailDialog({
  material,
  open,
  onOpenChange,
  currentUserId,
  isAdmin,
}: MaterialDetailDialogProps) {
  const celebrateReward = useRewardCelebration()
  const [myRating, setMyRating] = useState(0)
  const [isPending, startTransition] = useTransition()

  if (!material) return null

  const categories = material.mm_segedanyag_kategoriak
    .map((k) => k.mm_kategoriak)
    .filter(Boolean) as { nev: string; ikon: string; szin: string }[]

  const formatInfo = FORMAT_INFO[material.formatum] || FORMAT_INFO.link
  const FormatIcon = formatInfo.icon
  const canDelete = currentUserId === material.feltolto_id || isAdmin
  const isOwnMaterial = currentUserId === material.feltolto_id

  function handleRate(pontszam: number) {
    setMyRating(pontszam)
    startTransition(async () => {
      const result = await rateMaterial(material!.id, pontszam)
      if ('error' in result) toast.error(result.error)
      else {
        toast.success('Köszönjük az értékelésed!')
        celebrateReward(result.reward)
      }
    })
  }

  function handleDelete() {
    if (!confirm('Biztosan archiválod ezt a segédanyagot?')) return
    startTransition(async () => {
      const result = await deleteMaterial(material!.id)
      if ('error' in result) toast.error(result.error)
      else {
        toast.success('Segédanyag archiválva.')
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.25rem] border-[#d6c6af] bg-[#fffdf7] p-0 shadow-[0_30px_90px_-26px_rgba(46,38,27,.6)] sm:max-h-[92vh] sm:max-w-xl sm:rounded-xl">
        {/* Header with gradient */}
        <div className="relative overflow-hidden border-b border-[#d8c9b4] bg-[#f4ebdd] p-4 pb-4 pr-14 sm:p-6 sm:pb-5 sm:pr-16">
          <BookOpen className="absolute -bottom-7 -right-3 h-28 w-28 rotate-[-8deg] text-[#647a52]/10" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 z-20 grid h-11 w-11 place-items-center rounded-full text-[#747b72] transition hover:bg-[#fffdf7]/80 hover:text-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70"
            aria-label="Segédanyag részleteinek bezárása"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#cdbb9e] bg-[#fffdf7] shadow-sm">
              <FormatIcon className="h-6 w-6 text-[#647a52]" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-heading text-2xl leading-tight text-[#26382f] sm:text-3xl">
                {material.cim}
              </DialogTitle>
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7950]">{formatInfo.label}</span>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-4 pb-5 pt-5 sm:px-6 sm:pb-6">
          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <span
                  key={cat.nev}
                  className="rounded-full border border-[#d8cbb8] bg-[#f4ebdd]/70 px-2.5 py-1 text-xs font-semibold text-[#647a52]"
                >
                  {cat.nev}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {material.leiras && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b7468]">Leírás</h4>
              <p className="whitespace-pre-line text-sm leading-7 text-[#59635b]">
                {material.leiras}
              </p>
            </div>
          )}

          {/* Meta info grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3">
              <User className="w-4 h-4 text-[#8a927f]" />
              <div>
                <div className="text-xs text-[#7a8077]">Feltöltötte</div>
                <div className="text-sm font-medium text-[#35443a]">{material.feltolto_nev || 'Ismeretlen'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3">
              <MapPin className="w-4 h-4 text-[#8a927f]" />
              <div>
                <div className="text-xs text-[#7a8077]">Gyülekezet</div>
                <div className="text-sm font-medium text-[#35443a]">{material.feltolto_gyulekezet || '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3">
              <Calendar className="w-4 h-4 text-[#8a927f]" />
              <div>
                <div className="text-xs text-[#7a8077]">Feltöltve</div>
                <div className="text-sm font-medium text-[#35443a]">{formatDate(material.created_at)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-[#e2d8ca] bg-[#f8f2e9] p-3">
              <Download className="w-4 h-4 text-[#8a927f]" />
              <div>
                <div className="text-xs text-[#7a8077]">Letöltések</div>
                <div className="text-sm font-medium text-[#35443a]">{material.letoltes_szam}</div>
              </div>
            </div>
          </div>

          {/* Rating section */}
          <div className="rounded-xl border border-[#dec69d] bg-[#fbf1dc] p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8e6734]">
              Értékeld ezt a segédanyagot
            </h4>
            <StarRating value={myRating} onChange={handleRate} readOnly={isOwnMaterial} />
            <p className="mt-1 text-xs text-[#9b7b50]">
              {isOwnMaterial
                ? 'A saját segédanyagod nem értékelhető — mások visszajelzése jelenik majd meg itt.'
                : 'Kattints a csillagokra az értékeléshez'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col items-stretch gap-3 pt-2 sm:flex-row sm:items-center">
            {(material.forras_url || material.csatolmany_url) && (
              <a
                href={material.forras_url || material.csatolmany_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] sm:w-auto motion-reduce:transition-none"
              >
                {material.csatolmany_url ? (
                  <>
                    <Download className="w-4 h-4" />
                    Letöltés
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Megnyitás
                  </>
                )}
              </a>
            )}

            {material.forras_nev && (
              <span className="text-xs text-[#7d8178]">
                Forrás: {material.forras_nev}
              </span>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-[#85877f] transition hover:bg-[#f7e9e3] hover:text-[#a7523f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c87552]/50 sm:ml-auto sm:w-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Archiválás
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
