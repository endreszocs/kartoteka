'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { rateMaterial, deleteMaterial } from '@/app/misszios-muhely/community-actions'
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

const FORMAT_INFO: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  PDF: { label: 'PDF dokumentum', icon: FileText, color: 'text-red-500 bg-red-50' },
  DOCX: { label: 'Word dokumentum', icon: FileText, color: 'text-blue-500 bg-blue-50' },
  PPTX: { label: 'Prezentáció', icon: FileText, color: 'text-orange-500 bg-orange-50' },
  video: { label: 'Videó', icon: FileText, color: 'text-purple-500 bg-purple-50' },
  link: { label: 'Webes hivatkozás', icon: Link2, color: 'text-emerald-500 bg-emerald-50' },
  csomag: { label: 'Csomag', icon: Download, color: 'text-amber-500 bg-amber-50' },
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
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange?.(star)}
          className={`p-0.5 transition-transform ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              star <= (hover || value)
                ? 'text-amber-400 fill-amber-400'
                : 'text-slate-200'
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
  const [myRating, setMyRating] = useState(0)
  const [isPending, startTransition] = useTransition()

  if (!material) return null

  const categories = material.mm_segedanyag_kategoriak
    .map((k) => k.mm_kategoriak)
    .filter(Boolean) as { nev: string; ikon: string; szin: string }[]

  const formatInfo = FORMAT_INFO[material.formatum] || FORMAT_INFO.link
  const FormatIcon = formatInfo.icon
  const canDelete = currentUserId === material.feltolto_id || isAdmin

  function handleRate(pontszam: number) {
    setMyRating(pontszam)
    startTransition(async () => {
      const result = await rateMaterial(material!.id, pontszam)
      if ('error' in result) toast.error(result.error)
      else toast.success('Köszönjük az értékelésed!')
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
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50/50 p-6 pb-4">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl ${formatInfo.color.split(' ')[1]} flex items-center justify-center shrink-0`}>
              <FormatIcon className={`w-6 h-6 ${formatInfo.color.split(' ')[0]}`} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 leading-tight">
                {material.cim}
              </DialogTitle>
              <span className="text-xs text-emerald-600 font-medium">{formatInfo.label}</span>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <span
                  key={cat.nev}
                  className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium"
                >
                  {cat.nev}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {material.leiras && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Leírás</h4>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {material.leiras}
              </p>
            </div>
          )}

          {/* Meta info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-xs text-slate-500">Feltöltötte</div>
                <div className="text-sm font-medium text-slate-700">{material.feltolto_nev || 'Ismeretlen'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80">
              <MapPin className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-xs text-slate-500">Gyülekezet</div>
                <div className="text-sm font-medium text-slate-700">{material.feltolto_gyulekezet || '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-xs text-slate-500">Feltöltve</div>
                <div className="text-sm font-medium text-slate-700">{formatDate(material.created_at)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80">
              <Download className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-xs text-slate-500">Letöltések</div>
                <div className="text-sm font-medium text-slate-700">{material.letoltes_szam}</div>
              </div>
            </div>
          </div>

          {/* Rating section */}
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-100/60">
            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
              Értékeld ezt a segédanyagot
            </h4>
            <StarRating value={myRating} onChange={handleRate} />
            <p className="text-xs text-amber-600/60 mt-1">Kattints a csillagokra az értékeléshez</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            {(material.forras_url || material.csatolmany_url) && (
              <a
                href={material.forras_url || material.csatolmany_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 transition-colors"
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
              <span className="text-xs text-slate-400">
                Forrás: {material.forras_nev}
              </span>
            )}

            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
