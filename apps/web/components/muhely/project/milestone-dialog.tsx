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
        expected_revision: existing?.revision,
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
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.25rem] border-[#d8c9b4] bg-[#fffdf7] p-0 shadow-[0_28px_80px_-24px_rgba(46,38,27,.55)] sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-[#d8c9b4] bg-[#fbf0d8] px-4 py-4 text-[#26382f] sm:px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dfc48f] bg-[#fffdf7]">
            <Flag className="h-5 w-5 text-[#b77d35]" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-xl text-[#26382f]">
              {existing ? 'Mérföldkő szerkesztése' : 'Új mérföldkő'}
            </DialogTitle>
            <p className="text-xs text-[#7d755f]">
              Jelöld a projekt kulcsfontosságú állomásait.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-full text-[#7d755f] hover:bg-[#fffdf7] hover:text-[#26382f]"
            onClick={() => onOpenChange(false)}
            aria-label="Mérföldkő ablak bezárása"
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <ModalField label="Cím" htmlFor="project-milestone-title" required>
            <input
              id="project-milestone-title"
              type="text"
              required
              aria-required="true"
              value={cim}
              onChange={e => setCim(e.target.value)}
              placeholder="Pl. Programfüzet véglegesítése"
              className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#c89b5d] focus:ring-4 focus:ring-[#d3a45e]/10"
              maxLength={200}
            />
          </ModalField>

          <ModalField label="Leírás" htmlFor="project-milestone-description">
            <Textarea
              id="project-milestone-description"
              className="border-[#d8cbb8] bg-white text-[#26382f] focus-visible:border-[#c89b5d] focus-visible:ring-[#d3a45e]/10"
              value={leiras}
              onChange={e => setLeiras(e.target.value)}
              placeholder="Mire gondolsz ennél a mérföldkőnél? Mi a konkrét eredmény?"
              rows={3}
              maxLength={2000}
            />
          </ModalField>

          <ModalField label="Határidő" htmlFor="project-milestone-deadline">
            <input
              id="project-milestone-deadline"
              type="date"
              value={hatarido}
              onChange={e => setHatarido(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#c89b5d] focus:ring-4 focus:ring-[#d3a45e]/10"
            />
          </ModalField>
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-[#ded2c0] bg-[#f7f0e5]/95 px-4 py-3 backdrop-blur-sm sm:flex sm:justify-end sm:px-5">
          <Button
            variant="outline"
            className="min-h-11 rounded-full border-[#d4c7b5] bg-[#fffdf7] text-[#657065] hover:bg-white"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Mégse
          </Button>
          <Button
            className="min-h-11 rounded-full bg-[#b77d35] text-white hover:bg-[#996527]"
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
