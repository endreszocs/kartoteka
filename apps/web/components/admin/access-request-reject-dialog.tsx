'use client'

/**
 * Access Request elutasítási dialógus.
 *
 * Kötelező: rejection_reason — az email-értesítésben a kérelmező látni fogja.
 * Opcionális: admin_notes — belső használatra.
 *
 * Kínál predefined reason preset-eket gyorsaság kedvéért.
 */

import { useState, useTransition } from 'react'
import { XCircle, Info } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import { Input } from '@/components/ui/input'

import { rejectAccessRequest } from '@/app/(dashboard)/admin/access-requests-actions'
import type { AccessRequest } from '@/app/(dashboard)/admin/access-requests-shared'
import { ROLE_LABELS } from '@/app/(dashboard)/admin/access-requests-shared'

interface RejectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: AccessRequest | null
  onRejected: () => void
}

const REJECTION_PRESETS = [
  'A kérelmet a gyülekezetében lévő esperes / elöljáró nem igazolta vissza.',
  'Nem azonosítható a megadott gyülekezet vagy szerepkör.',
  'A kérelem adatai hiányosak vagy ellentmondásosak.',
  'Duplikált kérelem — már van elfogadott hozzáférés.',
]

export function AccessRequestRejectDialog({
  open,
  onOpenChange,
  request,
  onRejected,
}: RejectDialogProps) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleReject() {
    if (!request) return
    if (!reason.trim()) {
      toast.error('Az elutasítás oka kötelező.')
      return
    }

    startTransition(async () => {
      const res = await rejectAccessRequest({
        id: request.id,
        rejection_reason: reason.trim(),
        admin_notes: notes.trim() || null,
      })
      if (res.error) {
        toast.error(`Hiba: ${res.error}`)
        return
      }
      toast.success(`${request.full_name} kérelme elutasítva.`)
      setReason('')
      setNotes('')
      onRejected()
      onOpenChange(false)
    })
  }

  if (!request) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(600px,96vw)] rounded-2xl border-rose-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 font-heading text-2xl">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm">
              <XCircle className="size-5" />
            </span>
            Hozzáférés-kérelem elutasítása
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Kérelmező adatai — kompakt */}
          <div className="rounded-xl bg-rose-50/40 border border-rose-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-800 truncate">
                  {request.full_name}
                </p>
                <p className="text-xs text-slate-600 font-mono truncate">{request.email}</p>
              </div>
              <div className="rounded-lg bg-indigo-100 text-indigo-800 px-2 py-1 text-[10px] font-medium flex-shrink-0">
                {ROLE_LABELS[request.requested_role]}
              </div>
            </div>
          </div>

          {/* Preset okok */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">Gyakori okok (kattints a betöltéshez):</p>
            <div className="flex flex-wrap gap-1.5">
              {REJECTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  disabled={isPending}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-700 hover:border-rose-300 hover:bg-rose-50 transition"
                >
                  {preset.slice(0, 40)}…
                </button>
              ))}
            </div>
          </div>

          {/* Kötelező indoklás */}
          <ModalField label="Elutasítás oka (kötelező, a kérelmező látni fogja)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Pl. Nem azonosítható a megadott gyülekezet."
              disabled={isPending}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </ModalField>

          {/* Opcionális admin-megjegyzés */}
          <ModalField label="Admin megjegyzés (opcionális, csak belső használatra)">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pl. esperes telefonon megerősítette"
              disabled={isPending}
            />
          </ModalField>

          <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-3">
            <div className="flex items-start gap-2">
              <Info className="size-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed">
                <p>
                  <strong>M0.1:</strong> Az elutasítási indoklást a kérelmező egyelőre{' '}
                  <strong>NEM</strong> kapja meg automatikusan emailben. Add meg neki manuálisan,
                  ha szükséges. Az M0.3-ban ez automatikus lesz.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end border-t border-slate-100 pt-3 -mx-6 px-6">
          <Button
            variant="outline"
            onClick={() => {
              setReason('')
              setNotes('')
              onOpenChange(false)
            }}
            disabled={isPending}
          >
            Mégse
          </Button>
          <Button
            onClick={handleReject}
            disabled={isPending || !reason.trim()}
            className="rounded-xl bg-rose-600 text-white hover:bg-rose-700 gap-1.5"
          >
            <XCircle className="size-4" />
            {isPending ? 'Elutasítás…' : 'Elutasítom'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
