'use client'

import { useEffect, useState, useTransition } from 'react'
import { Flag, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import { Textarea } from '@/components/ui/textarea'
import { saveMilestone } from '@/app/misszios-muhely/project-actions'
import type { ProjectMilestone } from '@/lib/missions/project'

interface MilestoneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ideaId: string
  existing?: ProjectMilestone | null
  onSaved: () => void
}

export function MilestoneDialog({
  open,
  onOpenChange,
  ideaId,
  existing,
  onSaved,
}: MilestoneDialogProps) {
  const [cim, setCim] = useState('')
  const [leiras, setLeiras] = useState('')
  const [hatarido, setHatarido] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setCim(existing?.cim || '')
      setLeiras(existing?.leiras || '')
      setHatarido(existing?.hatarido || '')
    })
    return () => {
      cancelled = true
    }
  }, [open, existing])

  function handleSubmit() {
    if (!cim.trim()) {
      toast.error('A mérföldkő címe kötelező.')
      return
    }

    startTransition(async () => {
      const result = await saveMilestone({
        id: existing?.id,
        otlet_id: ideaId,
        cim: cim.trim(),
        leiras: leiras.trim() || null,
        hatarido: hatarido || null,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success(existing ? 'Mérföldkő módosítva.' : 'Mérföldkő hozzáadva.')
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-amber-500 to-orange-600 px-5 py-4 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Flag className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-lg text-white">
              {existing ? 'Mérföldkő szerkesztése' : 'Új mérföldkő'}
            </DialogTitle>
            <p className="text-xs text-white/80">
              Jelöld a projekt kulcsfontosságú állomásait.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <ModalField label="Cím" required>
            <input
              type="text"
              value={cim}
              onChange={e => setCim(e.target.value)}
              placeholder="Pl. Programfüzet véglegesítése"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              maxLength={200}
            />
          </ModalField>

          <ModalField label="Leírás">
            <Textarea
              value={leiras}
              onChange={e => setLeiras(e.target.value)}
              placeholder="Mire gondolsz ennél a mérföldkőnél? Mi a konkrét eredmény?"
              rows={3}
              maxLength={2000}
            />
          </ModalField>

          <ModalField label="Határidő">
            <input
              type="date"
              value={hatarido}
              onChange={e => setHatarido(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </ModalField>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Mégse
          </Button>
          <Button
            className="rounded-xl bg-amber-600 hover:bg-amber-700"
            onClick={handleSubmit}
            disabled={isPending || !cim.trim()}
          >
            {isPending ? 'Mentés…' : existing ? 'Módosítás mentése' : 'Mérföldkő hozzáadása'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
