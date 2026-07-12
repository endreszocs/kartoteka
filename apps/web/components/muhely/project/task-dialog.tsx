'use client'

import { useEffect, useState, useTransition } from 'react'
import { ListTodo, UserCircle2, X } from 'lucide-react'
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
import { saveTask } from '@/app/misszios-muhely/project-actions'
import type { ProjectCollaborator, ProjectTask } from '@/lib/missions/project'

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ideaId: string
  collaborators: ProjectCollaborator[]
  existing?: ProjectTask | null
  onSaved: () => void
}

export function TaskDialog({
  open,
  onOpenChange,
  ideaId,
  collaborators,
  existing,
  onSaved,
}: TaskDialogProps) {
  const [cim, setCim] = useState('')
  const [leiras, setLeiras] = useState('')
  const [felelosId, setFelelosId] = useState<string>('')
  const [hatarido, setHatarido] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setCim(existing?.cim || '')
      setLeiras(existing?.leiras || '')
      setFelelosId(existing?.felelos_id || '')
      setHatarido(existing?.hatarido || '')
    })
    return () => {
      cancelled = true
    }
  }, [open, existing])

  function handleSubmit() {
    if (!cim.trim()) {
      toast.error('A feladat címe kötelező.')
      return
    }

    startTransition(async () => {
      const result = await saveTask({
        id: existing?.id,
        expected_revision: existing?.revision,
        otlet_id: ideaId,
        cim: cim.trim(),
        leiras: leiras.trim() || null,
        felelos_id: felelosId || null,
        hatarido: hatarido || null,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success(existing ? 'Feladat módosítva.' : 'Feladat hozzáadva.')
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.25rem] border-[#d8c9b4] bg-[#fffdf7] p-0 shadow-[0_28px_80px_-24px_rgba(46,38,27,.55)] sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-[#d8c9b4] bg-[#f4ebdd] px-4 py-4 text-[#26382f] sm:px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#b9c4af] bg-[#edf2e9]">
            <ListTodo className="h-5 w-5 text-[#526943]" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-xl text-[#26382f]">
              {existing ? 'Feladat szerkesztése' : 'Új feladat'}
            </DialogTitle>
            <p className="text-xs text-[#747b72]">
              Oszd ki a csapatnak a következő lépést.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-full text-[#747b72] hover:bg-[#fffdf7] hover:text-[#26382f]"
            onClick={() => onOpenChange(false)}
            aria-label="Feladat ablak bezárása"
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <ModalField label="Feladat címe" htmlFor="project-task-title" required>
            <input
              id="project-task-title"
              type="text"
              required
              aria-required="true"
              value={cim}
              onChange={e => setCim(e.target.value)}
              placeholder="Pl. Imahét programfüzet tervezése"
              className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
              maxLength={200}
            />
          </ModalField>

          <ModalField label="Részletes leírás" htmlFor="project-task-description">
            <Textarea
              id="project-task-description"
              className="border-[#d8cbb8] bg-white text-[#26382f] focus-visible:border-[#8a9a74] focus-visible:ring-[#647a52]/10"
              value={leiras}
              onChange={e => setLeiras(e.target.value)}
              placeholder="Részletek, szempontok, jegyzetek..."
              rows={3}
              maxLength={2000}
            />
          </ModalField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModalField label="Felelős" htmlFor="project-task-assignee">
              <div className="relative">
                <UserCircle2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  id="project-task-assignee"
                  value={felelosId}
                  onChange={e => setFelelosId(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white py-2.5 pl-8 pr-3 text-sm text-[#26382f] outline-none focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
                >
                  <option value="">— Nincs kijelölve —</option>
                  {collaborators.map(c => (
                    <option key={c.user_id} value={c.user_id}>
                      {c.full_name || 'Ismeretlen'}
                      {c.isOwner ? ' (Ötletgazda)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </ModalField>

            <ModalField label="Határidő" htmlFor="project-task-deadline">
              <input
                id="project-task-deadline"
                type="date"
                value={hatarido}
                onChange={e => setHatarido(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10"
              />
            </ModalField>
          </div>
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
            className="min-h-11 rounded-full bg-[#314b3b] text-white hover:bg-[#26382f]"
            onClick={handleSubmit}
            disabled={isPending || !cim.trim()}
          >
            {isPending ? 'Mentés…' : existing ? 'Módosítás mentése' : 'Feladat hozzáadása'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
