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

    const felelos = collaborators.find(c => c.user_id === felelosId)

    startTransition(async () => {
      const result = await saveTask({
        id: existing?.id,
        otlet_id: ideaId,
        cim: cim.trim(),
        leiras: leiras.trim() || null,
        felelos_id: felelosId || null,
        felelos_nev: felelos?.full_name || null,
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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-violet-500 to-fuchsia-600 px-5 py-4 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <ListTodo className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-lg text-white">
              {existing ? 'Feladat szerkesztése' : 'Új feladat'}
            </DialogTitle>
            <p className="text-xs text-white/80">
              Oszd ki a csapatnak a következő lépést.
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
          <ModalField label="Feladat címe" required>
            <input
              type="text"
              value={cim}
              onChange={e => setCim(e.target.value)}
              placeholder="Pl. Imahét programfüzet tervezése"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              maxLength={200}
            />
          </ModalField>

          <ModalField label="Részletes leírás">
            <Textarea
              value={leiras}
              onChange={e => setLeiras(e.target.value)}
              placeholder="Részletek, szempontok, jegyzetek..."
              rows={3}
              maxLength={2000}
            />
          </ModalField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModalField label="Felelős">
              <div className="relative">
                <UserCircle2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={felelosId}
                  onChange={e => setFelelosId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
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

            <ModalField label="Határidő">
              <input
                type="date"
                value={hatarido}
                onChange={e => setHatarido(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </ModalField>
          </div>
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
            className="rounded-xl bg-violet-600 hover:bg-violet-700"
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
