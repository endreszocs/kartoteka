'use client'

import { useEffect, useState, useTransition } from 'react'
import { FileText, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import { saveDocument } from '@/app/misszios-muhely/project-actions'
import type { ProjectDocument } from '@/lib/missions/project'

interface DocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ideaId: string
  existing?: ProjectDocument | null
  onSaved: () => void
}

const DOC_TYPE_OPTIONS = [
  { value: '', label: 'Nincs megadva' },
  { value: 'application/pdf', label: 'PDF dokumentum' },
  { value: 'image/jpeg', label: 'Kép' },
  { value: 'application/msword', label: 'Word dokumentum' },
  { value: 'application/vnd.ms-excel', label: 'Excel táblázat' },
  { value: 'application/zip', label: 'ZIP archívum' },
  { value: 'text/plain', label: 'Szöveg fájl' },
]

export function DocumentDialog({
  open,
  onOpenChange,
  ideaId,
  existing,
  onSaved,
}: DocumentDialogProps) {
  const [nev, setNev] = useState('')
  const [url, setUrl] = useState('')
  const [tipus, setTipus] = useState('')
  const [meret, setMeret] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setNev(existing?.nev || '')
      setUrl(existing?.url || '')
      setTipus(existing?.tipus || '')
      setMeret(existing?.meret ? String(existing.meret) : '')
    })
    return () => {
      cancelled = true
    }
  }, [open, existing])

  function handleSubmit() {
    if (!nev.trim()) {
      toast.error('A dokumentum neve kötelező.')
      return
    }
    if (!url.trim()) {
      toast.error('A dokumentum URL-je kötelező.')
      return
    }

    const meretNum = meret ? parseInt(meret, 10) : 0

    startTransition(async () => {
      const result = await saveDocument({
        id: existing?.id,
        otlet_id: ideaId,
        nev: nev.trim(),
        url: url.trim(),
        tipus: tipus || null,
        meret: Number.isFinite(meretNum) && meretNum >= 0 ? meretNum : 0,
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      toast.success(existing ? 'Dokumentum módosítva.' : 'Dokumentum hozzáadva.')
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-cyan-500 to-blue-600 px-5 py-4 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-lg text-white">
              {existing ? 'Dokumentum szerkesztése' : 'Új dokumentum'}
            </DialogTitle>
            <p className="text-xs text-white/80">
              Oszd meg a csapattal a munkához szükséges anyagot.
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
          <div className="rounded-lg bg-cyan-50/60 px-3 py-2 text-xs text-cyan-800">
            <strong>Tipp:</strong> töltsd fel a fájlt egy megosztható helyre (Google Drive, Dropbox,
            OneDrive), és illeszd be itt a megosztási linket.
          </div>

          <ModalField label="Dokumentum neve" required>
            <input
              type="text"
              value={nev}
              onChange={e => setNev(e.target.value)}
              placeholder="Pl. 2026-os imahét programfüzet"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
              maxLength={200}
            />
          </ModalField>

          <ModalField label="URL (megosztási link)" required>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
          </ModalField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModalField label="Típus">
              <select
                value={tipus}
                onChange={e => setTipus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
              >
                {DOC_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </ModalField>

            <ModalField label="Méret (byte, opcionális)">
              <input
                type="number"
                min={0}
                value={meret}
                onChange={e => setMeret(e.target.value)}
                placeholder="pl. 245000"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
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
            className="rounded-xl bg-cyan-600 hover:bg-cyan-700"
            onClick={handleSubmit}
            disabled={isPending || !nev.trim() || !url.trim()}
          >
            {isPending ? 'Mentés…' : existing ? 'Módosítás mentése' : 'Dokumentum hozzáadása'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
