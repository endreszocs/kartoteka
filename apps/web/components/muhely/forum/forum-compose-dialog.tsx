'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { submitMissionIdea } from '@/app/misszios-muhely/community-actions'
import { toast } from 'sonner'
import { Lightbulb } from 'lucide-react'

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
  const [cim, setCim] = useState('')
  const [leiras, setLeiras] = useState('')
  const [celcsoport, setCelcsoport] = useState('Gyülekezeti közösség')
  const [selectedCats, setSelectedCats] = useState<number[]>([])
  const [isPending, startTransition] = useTransition()

  function toggleCat(id: number) {
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function handleSubmit() {
    if (!cim.trim() || !leiras.trim()) {
      toast.error('A cím és a leírás kötelező.')
      return
    }

    startTransition(async () => {
      const result = await submitMissionIdea({
        cim: cim.trim(),
        leiras: leiras.trim(),
        kategoriaIds: selectedCats,
        celcsoport,
      })

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Fórum téma létrehozva!')
        setCim('')
        setLeiras('')
        setCelcsoport('Gyülekezeti közösség')
        setSelectedCats([])
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-violet-600" />
          </div>
          <DialogTitle className="font-heading text-xl">Új fórum téma</DialogTitle>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Cím *</label>
            <input
              value={cim}
              onChange={(e) => setCim(e.target.value)}
              placeholder="pl. Hogyan szervezzünk ifjúsági tábort?"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Leírás *</label>
            <textarea
              value={leiras}
              onChange={(e) => setLeiras(e.target.value)}
              placeholder="Fejtsd ki részletesebben — kérdés, ötlet, tapasztalat?"
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Célcsoport</label>
            <select
              value={celcsoport}
              onChange={(e) => setCelcsoport(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300"
            >
              <option>Gyülekezeti közösség</option>
              <option>Fiatalok</option>
              <option>Felnőttek</option>
              <option>Idősek</option>
              <option>Családok</option>
              <option>Gyerekek</option>
              <option>Mindenki</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Kategóriák</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCat(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedCats.includes(cat.id)
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.nev}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-full text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
          >
            Mégse
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !cim.trim() || !leiras.trim()}
            className="px-5 py-2 rounded-full bg-violet-600 text-white text-sm font-semibold shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Küldés...' : 'Téma indítása'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
