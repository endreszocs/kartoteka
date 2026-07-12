'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { shareMissionMaterial } from '@/app/misszios-muhely/community-actions'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { toast } from 'sonner'
import { BookOpen, Leaf, X } from 'lucide-react'

interface Category {
  id: number
  nev: string
}

interface MaterialUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
}

export function MaterialUploadDialog({ open, onOpenChange, categories }: MaterialUploadDialogProps) {
  const celebrateReward = useRewardCelebration()
  const [cim, setCim] = useState('')
  const [leiras, setLeiras] = useState('')
  const [forrasUrl, setForrasUrl] = useState('')
  const [selectedCats, setSelectedCats] = useState<number[]>([])
  const [isPending, startTransition] = useTransition()

  function toggleCat(id: number) {
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function handleSubmit() {
    if (!cim.trim()) {
      toast.error('A cím kötelező.')
      return
    }

    startTransition(async () => {
      const result = await shareMissionMaterial({
        cim: cim.trim(),
        leiras: leiras.trim(),
        kategoriaIds: selectedCats,
        forrasUrl: forrasUrl.trim() || undefined,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Segédanyag megosztva!')
        setCim('')
        setLeiras('')
        setForrasUrl('')
        setSelectedCats([])
        onOpenChange(false)
        celebrateReward(result.reward)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.25rem] border-[#d8c9b4] bg-[#fffdf7] p-0 shadow-[0_28px_80px_-24px_rgba(46,38,27,.55)] sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl">
        <div className="relative overflow-hidden border-b border-[#d8c9b4] bg-[#f4ebdd] px-4 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-16">
          <Leaf className="absolute -bottom-5 -right-2 h-24 w-24 rotate-[-20deg] text-[#647a52]/10" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 z-20 grid h-11 w-11 place-items-center rounded-full text-[#747b72] transition hover:bg-[#fffdf7]/80 hover:text-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70"
            aria-label="Segédanyag ablak bezárása"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#cdbc9f] bg-[#fffdf7] shadow-sm">
            <BookOpen className="h-5 w-5 text-[#647a52]" />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a7950]">Új kötet a közös polcra</span>
            <DialogTitle className="font-heading text-2xl text-[#26382f]">Segédanyag megosztása</DialogTitle>
          </div>
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">
          <div>
            <label htmlFor="material-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
              Cím *
            </label>
            <input
              id="material-title"
              value={cim}
              onChange={(e) => setCim(e.target.value)}
              placeholder="pl. Adventi áhítat-sorozat vázlatok"
              className="w-full rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-sm text-[#26382f] outline-none transition placeholder:text-[#a0a299] focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
            />
          </div>

          <div>
            <label htmlFor="material-description" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
              Leírás
            </label>
            <textarea
              id="material-description"
              value={leiras}
              onChange={(e) => setLeiras(e.target.value)}
              placeholder="Rövid leírás — miről szól, kinek ajánlod?"
              rows={3}
              className="w-full resize-none rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-sm leading-6 text-[#26382f] outline-none transition placeholder:text-[#a0a299] focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
            />
          </div>

          <div>
            <label htmlFor="material-url" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
              Forrás URL (opcionális)
            </label>
            <input
              id="material-url"
              type="url"
              value={forrasUrl}
              onChange={(e) => setForrasUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-sm text-[#26382f] outline-none transition placeholder:text-[#a0a299] focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">
              Kategóriák
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Segédanyag kategóriái">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCat(cat.id)}
                  aria-pressed={selectedCats.includes(cat.id)}
                  className={`min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 ${
                    selectedCats.includes(cat.id)
                      ? 'border-[#647a52] bg-[#647a52] text-white'
                      : 'border-[#d8cbb8] bg-[#f4ebdd]/60 text-[#657065] hover:border-[#9daa8f]'
                  }`}
                >
                  {cat.nev}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-[#ded2c0] bg-[#f7f0e5]/95 px-4 py-3 backdrop-blur-sm sm:flex sm:justify-end sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold text-[#657065] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60"
          >
            Mégse
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !cim.trim()}
            className="min-h-11 rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#26382f] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] motion-reduce:transition-none"
          >
            {isPending ? 'Megosztás...' : 'Megosztás'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
