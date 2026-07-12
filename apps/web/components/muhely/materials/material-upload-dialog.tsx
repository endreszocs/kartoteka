'use client'

import { useId, useState, useTransition, type FormEvent } from 'react'
import { BookOpen, FilePenLine, Leaf, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  saveMissionMaterial,
  type WorkshopMaterial,
} from '@/app/misszios-muhely/community-actions'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface Category {
  id: number
  nev: string
}

type MaterialFormat = 'PDF' | 'DOCX' | 'PPTX' | 'video' | 'link' | 'csomag'

const MATERIAL_FORMATS: Array<{ value: MaterialFormat; label: string }> = [
  { value: 'link', label: 'Műhelyben olvasható anyag' },
  { value: 'PDF', label: 'PDF dokumentum' },
  { value: 'DOCX', label: 'Word dokumentum' },
  { value: 'PPTX', label: 'Prezentáció' },
  { value: 'video', label: 'Videó' },
  { value: 'csomag', label: 'Segédanyagcsomag' },
]

function normalizeFormat(value: string | null | undefined): MaterialFormat {
  return MATERIAL_FORMATS.some((format) => format.value === value)
    ? (value as MaterialFormat)
    : 'link'
}

interface MaterialUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  material?: WorkshopMaterial | null
  onSaved?: () => void
}

export function MaterialUploadDialog({
  open,
  onOpenChange,
  categories,
  material = null,
  onSaved,
}: MaterialUploadDialogProps) {
  const celebrateReward = useRewardCelebration()
  const fieldId = useId()
  const [cim, setCim] = useState(material?.cim || '')
  const [leiras, setLeiras] = useState(material?.leiras || '')
  const [forrasUrl, setForrasUrl] = useState(material?.forras_url || '')
  const [forrasNev, setForrasNev] = useState(material?.forras_nev || '')
  const [formatum, setFormatum] = useState<MaterialFormat>(() => normalizeFormat(material?.formatum))
  const [selectedCats, setSelectedCats] = useState<number[]>(
    () => material?.mm_segedanyag_kategoriak.map((category) => category.kategoria_id) || [],
  )
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(material)

  function toggleCat(id: number) {
    setSelectedCats((current) => (
      current.includes(id) ? current.filter((categoryId) => categoryId !== id) : [...current, id]
    ))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cim.trim()) {
      toast.error('A cím kötelező.')
      return
    }

    startTransition(async () => {
      const result = await saveMissionMaterial({
        materialId: material?.id || null,
        expectedUpdatedAt: material?.updated_at || null,
        cim,
        leiras,
        kategoriaIds: selectedCats,
        forrasUrl,
        forrasNev,
        formatum,
      })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success(result.created ? 'A segédanyag felkerült a közös polcra.' : 'A módosításokat elmentettük.')
      celebrateReward(result.reward)
      onOpenChange(false)
      onSaved?.()
    })
  }

  const titleId = `${fieldId}-title`
  const contentId = `${fieldId}-content`
  const sourceNameId = `${fieldId}-source-name`
  const sourceUrlId = `${fieldId}-source-url`
  const formatId = `${fieldId}-format`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-0.75rem)] w-[calc(100%-0.75rem)] max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border-[#d8c9b4] bg-[#fffdf7] p-0 shadow-[0_28px_80px_-24px_rgba(46,38,27,.55)] sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:rounded-[1.6rem]"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <header className="relative shrink-0 overflow-hidden border-b border-[#d8c9b4] bg-[#f4ebdd] px-4 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-16">
            <Leaf className="absolute -bottom-5 -right-2 h-24 w-24 rotate-[-20deg] text-[#647a52]/10" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="absolute right-2 top-2 z-20 grid h-11 w-11 place-items-center rounded-full text-[#747b72] transition hover:bg-[#fffdf7]/80 hover:text-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70 disabled:opacity-50"
              aria-label="Segédanyag-szerkesztő bezárása"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="relative flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#cdbc9f] bg-[#fffdf7] shadow-sm">
                {isEditing ? <FilePenLine className="h-5 w-5 text-[#647a52]" /> : <BookOpen className="h-5 w-5 text-[#647a52]" />}
              </div>
              <div className="min-w-0">
                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a7950]">
                  {isEditing ? 'Saját kötet gondozása' : 'Új kötet a közös polcra'}
                </span>
                <DialogTitle className="truncate font-heading text-2xl text-[#26382f] sm:text-3xl">
                  {isEditing ? 'Segédanyag szerkesztése' : 'Segédanyag készítése'}
                </DialogTitle>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="min-w-0 space-y-5">
                <div>
                  <label htmlFor={titleId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
                    Cím <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id={titleId}
                    value={cim}
                    onChange={(event) => setCim(event.target.value)}
                    placeholder="pl. Adventi áhítat-sorozat vázlatai"
                    maxLength={200}
                    required
                    className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-base text-[#26382f] outline-none transition placeholder:text-[#a0a299] focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-end justify-between gap-3">
                    <label htmlFor={contentId} className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
                      A segédanyag tartalma
                    </label>
                    <span id={`${contentId}-count`} className="shrink-0 text-[11px] tabular-nums text-[#92968e]">
                      {leiras.length.toLocaleString('hu-HU')} / 50 000
                    </span>
                  </div>
                  <p id={`${contentId}-help`} className="mb-2 text-xs leading-5 text-[#7a8077]">
                    Írj nyugodtan címsorokat, külön bekezdéseket és • felsorolásokat — az olvasónézet szépen megtördeli őket.
                  </p>
                  <textarea
                    id={contentId}
                    value={leiras}
                    onChange={(event) => setLeiras(event.target.value)}
                    placeholder={'Cél: ...\n\nSzükséges kellékek\n• Biblia\n• jegyzetlap\n\nBevezető – Ráhangolódás\n...'}
                    rows={15}
                    maxLength={50000}
                    aria-describedby={`${contentId}-help ${contentId}-count`}
                    className="min-h-[19rem] w-full resize-y rounded-2xl border border-[#d8cbb8] bg-white px-4 py-4 text-[15px] leading-7 text-[#26382f] outline-none transition placeholder:text-[#aaa99f] focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10 sm:min-h-[24rem] sm:px-5"
                  />
                </div>
              </div>

              <aside className="space-y-5 rounded-2xl border border-[#e0d4c2] bg-[#f8f2e9] p-4 lg:self-start" aria-label="Segédanyag adatai">
                <div>
                  <label htmlFor={formatId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
                    Anyag típusa
                  </label>
                  <select
                    id={formatId}
                    value={formatum}
                    onChange={(event) => setFormatum(event.target.value as MaterialFormat)}
                    className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
                  >
                    {MATERIAL_FORMATS.map((format) => (
                      <option key={format.value} value={format.value}>{format.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={sourceNameId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
                    Forrás neve
                  </label>
                  <input
                    id={sourceNameId}
                    value={forrasNev}
                    onChange={(event) => setForrasNev(event.target.value)}
                    placeholder="pl. Saját gyülekezeti gyakorlat"
                    maxLength={200}
                    className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
                  />
                </div>

                <div>
                  <label htmlFor={sourceUrlId} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
                    Forrás URL
                  </label>
                  <input
                    id={sourceUrlId}
                    type="url"
                    value={forrasUrl}
                    onChange={(event) => setForrasUrl(event.target.value)}
                    placeholder="https://..."
                    className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
                  />
                </div>

                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
                    Kategóriák
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleCat(category.id)}
                        aria-pressed={selectedCats.includes(category.id)}
                        className={`min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 ${
                          selectedCats.includes(category.id)
                            ? 'border-[#647a52] bg-[#647a52] text-white'
                            : 'border-[#d8cbb8] bg-white text-[#657065] hover:border-[#9daa8f]'
                        }`}
                      >
                        {category.nev}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </aside>
            </div>
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#ded2c0] bg-[#f7f0e5]/95 px-4 py-3 backdrop-blur-sm sm:flex-row sm:justify-end sm:px-6 sm:py-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="min-h-11 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-[#657065] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 disabled:opacity-50 sm:w-auto"
            >
              Mégse
            </button>
            <button
              type="submit"
              disabled={isPending || !cim.trim()}
              className="min-h-11 w-full rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#26382f] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] sm:w-auto motion-reduce:transition-none"
            >
              {isPending ? 'Mentés…' : isEditing ? 'Módosítások mentése' : 'Megosztás a közös polcon'}
            </button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
