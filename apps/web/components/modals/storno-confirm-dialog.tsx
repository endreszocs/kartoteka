'use client'

/**
 * Pénzügyi tétel stornó megerősítő dialóg.
 *
 * Kötelező indoklással stornózza a befizetés / kiadás rekordot.
 * A stornózott tétel a listában marad (piros háttérrel), de az
 * összesítőből és egyenlegből kimarad.
 */

import { useState } from 'react'
import { AlertCircle, Loader2, Ban } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ModalField } from '@/components/ui/modal-field'
import { stornoTransaction, type TransactionType } from '@/app/(dashboard)/penzugy/edit-storno-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: TransactionType
  id: number | null
  /** A megjelenített összegzés (pl. „2024.01.15 — Barátosi család — 500 RON"). */
  summary?: string
  /** Belső mozgás esetén figyelmeztetés megjelenítése. */
  isInternalTransfer?: boolean
  onStornoed?: () => void | Promise<void>
}

export function StornoConfirmDialog({
  open,
  onOpenChange,
  type,
  id,
  summary,
  isInternalTransfer,
  onStornoed,
}: Props) {
  const [indok, setIndok] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleStorno() {
    if (id == null) return
    const trimmed = indok.trim()
    if (trimmed.length < 5) {
      toast.error('Az indoklás legalább 5 karakter legyen.')
      return
    }
    setSaving(true)
    try {
      const res = await stornoTransaction({ type, id, indok: trimmed })
      if (res.error) {
        toast.error(res.error)
        return
      }
      // P3-12: a kapcsolt számla-kaszkád hibája nem némulhat el.
      if (res.figyelmeztetes) toast.warning(res.figyelmeztetes, { duration: 15000 })
      toast.success('Tétel stornózva.')
      setIndok('')
      onOpenChange(false)
      if (onStornoed) await onStornoed()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setIndok('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md p-0">
        <div className="border-b border-red-100 bg-red-50/70 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-red-500 to-rose-600">
                <Ban className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg text-red-900">
                  Tétel stornózása
                </DialogTitle>
                <p className="text-xs text-red-700/80 mt-0.5">
                  A tétel marad a listában, de a számításokból kimarad.
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-4">
          {summary && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Stornózandó tétel
              </p>
              <p>{summary}</p>
            </div>
          )}

          {isInternalTransfer && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertCircle className="size-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-snug">
                <strong>Belső mozgás:</strong> ez a tétel a kassza és a bank között mozgó
                pénz. A stornó <strong>mindkét oldalt</strong> (befizetés + kiadás) egyszerre
                érinti.
              </div>
            </div>
          )}

          <ModalField
            label="Stornó indoka"
            required
            hint="Röviden, érthetően — a dokumentum audit-trail-ben marad."
          >
            <Textarea
              value={indok}
              onChange={(e) => setIndok(e.target.value)}
              placeholder="Pl. téves összeg, rossz jogcím, duplikáció…"
              rows={3}
              autoFocus
            />
          </ModalField>

          <div className="text-xs text-slate-500">
            A stornó {new Date().toLocaleDateString('hu-HU')}{' '}
            időbélyeggel a stornózott tétel megjelölve marad. A számadás
            lezárása után a stornó nem vonható vissza.
          </div>
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl"
          >
            Mégse
          </Button>
          <Button
            type="button"
            onClick={handleStorno}
            disabled={saving || indok.trim().length < 5}
            className="rounded-xl bg-red-600 text-white hover:bg-red-700"
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Stornózás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
