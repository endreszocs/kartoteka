'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { submitMissionIdea } from '@/app/misszios-muhely/community-actions'
import { useRewardCelebration } from '@/components/muhely/rewards/use-reward-celebration'
import { toast } from 'sonner'
import { Feather, Lightbulb, X } from 'lucide-react'

interface Category {
  id: number
  nev: string
}

interface ForumComposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
}

export function ForumComposeDialog({ open, onOpenChange, categories }: ForumComposeDialogProps) {
  const celebrateReward = useRewardCelebration()
  const [cim, setCim] = useState('')
  const [leiras, setLeiras] = useState('')
  const [celcsoport, setCelcsoport] = useState('')
  const [becsultIdo, setBecsultIdo] = useState('')
  const [selectedCats, setSelectedCats] = useState<number[]>([])
  const [isPending, startTransition] = useTransition()

  function toggleCat(id: number) {
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function handleSubmit() {
    if (!cim.trim() || !leiras.trim() || !celcsoport || !becsultIdo) {
      toast.error('A cím, a leírás, a célcsoport és a becsült idő kötelező.')
      return
    }

    startTransition(async () => {
      const result = await submitMissionIdea({
        cim: cim.trim(),
        leiras: leiras.trim(),
        kategoriaIds: selectedCats,
        celcsoport,
        becsultIdo,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Az ötlet az asztalra került!')
        setCim('')
        setLeiras('')
        setCelcsoport('')
        setBecsultIdo('')
        setSelectedCats([])
        onOpenChange(false)
        celebrateReward(result.reward)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.25rem] border-[#d8c9b4] bg-[#fffdf7] p-0 shadow-[0_28px_80px_-24px_rgba(46,38,27,.55)] sm:max-h-[90dvh] sm:max-w-lg sm:rounded-xl">
        <div className="relative overflow-hidden border-b border-[#d8c9b4] bg-[#f4ebdd] px-4 py-4 pr-14 sm:px-6 sm:py-5 sm:pr-16">
          <Feather className="absolute -bottom-6 -right-2 h-28 w-28 rotate-[-18deg] text-[#c87552]/10" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 z-20 grid h-11 w-11 place-items-center rounded-full text-[#747b72] transition hover:bg-[#fffdf7]/80 hover:text-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/70"
            aria-label="Ötlet ablak bezárása"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d0b99b] bg-[#fffdf7] shadow-sm">
            <Lightbulb className="h-5 w-5 text-[#c87552]" />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a7950]">Egy üres lap vár rád</span>
            <DialogTitle className="font-heading text-2xl text-[#26382f]">Új ötlet az asztalra</DialogTitle>
          </div>
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">
          <div>
            <label htmlFor="idea-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">Cím *</label>
            <input
              id="idea-title"
              value={cim}
              onChange={(e) => setCim(e.target.value)}
              placeholder="pl. Hogyan szervezzünk ifjúsági tábort?"
              className="w-full rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-sm text-[#26382f] outline-none transition placeholder:text-[#a0a299] focus:border-[#c48b71] focus:ring-4 focus:ring-[#c87552]/10"
            />
          </div>

          <div>
            <label htmlFor="idea-description" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">Leírás *</label>
            <textarea
              id="idea-description"
              value={leiras}
              onChange={(e) => setLeiras(e.target.value)}
              placeholder="Fejtsd ki részletesebben — kérdés, ötlet, tapasztalat?"
              rows={4}
              className="w-full resize-none rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-sm leading-6 text-[#26382f] outline-none transition placeholder:text-[#a0a299] focus:border-[#c48b71] focus:ring-4 focus:ring-[#c87552]/10"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="idea-audience" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">Célcsoport *</label>
              <select
                id="idea-audience"
                value={celcsoport}
                onChange={(e) => setCelcsoport(e.target.value)}
                required
                aria-required="true"
                className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-sm text-[#26382f] outline-none transition focus:border-[#c48b71] focus:ring-4 focus:ring-[#c87552]/10"
              >
                <option value="" disabled>Válassz…</option>
                <option>Fiatalok</option>
                <option>Felnőttek</option>
                <option>Idősek</option>
                <option>Családok</option>
                <option>Gyerekek</option>
                <option>Mindenki</option>
              </select>
            </div>

            <div>
              <label htmlFor="idea-duration" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">Becsült idő *</label>
              <select
                id="idea-duration"
                value={becsultIdo}
                onChange={(e) => setBecsultIdo(e.target.value)}
                required
                aria-required="true"
                className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-4 py-3 text-sm text-[#26382f] outline-none transition focus:border-[#c48b71] focus:ring-4 focus:ring-[#c87552]/10"
              >
                <option value="" disabled>Válassz…</option>
                <option>1 hónap</option>
                <option>2-3 hónap</option>
                <option>Fél év</option>
                <option>Folyamatos</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#647067]">Kategóriák</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Ötlet kategóriái">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCat(cat.id)}
                  aria-pressed={selectedCats.includes(cat.id)}
                  className={`min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/60 ${
                    selectedCats.includes(cat.id)
                      ? 'border-[#c87552] bg-[#c87552] text-white'
                      : 'border-[#d8cbb8] bg-[#f4ebdd]/60 text-[#657065] hover:border-[#c9957e]'
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
            disabled={isPending || !cim.trim() || !leiras.trim() || !celcsoport || !becsultIdo}
            className="min-h-11 rounded-full bg-[#314b3b] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#26382f] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e] motion-reduce:transition-none"
          >
            {isPending ? 'Küldés...' : 'Leteszem az asztalra'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
