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

interface DocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ideaId: string
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
      setNev('')
      setUrl('')
      setTipus('')
      setMeret('')
    })
    return () => {
      cancelled = true
    }
  }, [open])

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

      toast.success('Dokumentum hozzáadva.')
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-[1.25rem] border-[#d8c9b4] bg-[#fffdf7] p-0 shadow-[0_28px_80px_-24px_rgba(46,38,27,.55)] sm:max-h-[90dvh] sm:max-w-lg sm:rounded-xl">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-[#d8c9b4] bg-[#f2edf2] px-4 py-4 text-[#26382f] sm:px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#cfc0cf] bg-[#fffdf7]">
            <FileText className="h-5 w-5 text-[#735f73]" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-xl text-[#26382f]">
              Új dokumentum
            </DialogTitle>
            <p className="text-xs text-[#756c75]">
              Oszd meg a csapattal a munkához szükséges anyagot.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-full text-[#756c75] hover:bg-[#fffdf7] hover:text-[#26382f]"
            onClick={() => onOpenChange(false)}
            aria-label="Dokumentum ablak bezárása"
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="rounded-xl border border-[#d8c9d7] bg-[#f2edf2] px-3 py-2.5 text-xs leading-5 text-[#665366]">
            <strong>Tipp:</strong> töltsd fel a fájlt egy megosztható helyre (Google Drive, Dropbox,
            OneDrive), és illeszd be itt a megosztási linket.
          </div>

          <ModalField label="Dokumentum neve" htmlFor="project-document-name" required>
            <input
              id="project-document-name"
              type="text"
              required
              aria-required="true"
              value={nev}
              onChange={e => setNev(e.target.value)}
              placeholder="Pl. 2026-os imahét programfüzet"
              className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#9c849c] focus:ring-4 focus:ring-[#735f73]/10"
              maxLength={200}
            />
          </ModalField>

          <ModalField label="URL (megosztási link)" htmlFor="project-document-url" required>
            <input
              id="project-document-url"
              type="url"
              required
              aria-required="true"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#9c849c] focus:ring-4 focus:ring-[#735f73]/10"
            />
          </ModalField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModalField label="Típus" htmlFor="project-document-type">
              <select
                id="project-document-type"
                value={tipus}
                onChange={e => setTipus(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#9c849c] focus:ring-4 focus:ring-[#735f73]/10"
              >
                {DOC_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </ModalField>

            <ModalField label="Méret (byte, opcionális)" htmlFor="project-document-size">
              <input
                id="project-document-size"
                type="number"
                min={0}
                value={meret}
                onChange={e => setMeret(e.target.value)}
                placeholder="pl. 245000"
                className="min-h-11 w-full rounded-xl border border-[#d8cbb8] bg-white px-3 py-2.5 text-sm text-[#26382f] outline-none focus:border-[#9c849c] focus:ring-4 focus:ring-[#735f73]/10"
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
            className="min-h-11 rounded-full bg-[#735f73] text-white hover:bg-[#5f4d5f]"
            onClick={handleSubmit}
            disabled={isPending || !nev.trim() || !url.trim()}
          >
            {isPending ? 'Mentés…' : 'Dokumentum hozzáadása'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
