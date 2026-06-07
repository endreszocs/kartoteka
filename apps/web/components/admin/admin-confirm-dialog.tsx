'use client'

/**
 * Újrahasználható admin megerősítő dialógus — a natív `window.confirm` /
 * `window.prompt` helyett (azok mobilon/Safariban rosszul működnek és nem
 * illenek a rendszer kinézetéhez). 2026-06-07.
 *
 * Két mód:
 *   - sima megerősítés (igen/nem),
 *   - opcionális INDOK-mező (`reasonLabel` megadásakor) — a `window.prompt`
 *     kiváltására; az onConfirm a beírt szöveget kapja.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface AdminConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' → piros megerősítő gomb (visszafordíthatatlan/erős művelet). */
  tone?: 'default' | 'danger'
  loading?: boolean
  /** Ha megadott, INDOK-mező jelenik meg (a window.prompt kiváltására). */
  reasonLabel?: string
  reasonPlaceholder?: string
  reasonDefault?: string
  /** Ha true, az indok kötelező (üresen a megerősítés tiltva). */
  reasonRequired?: boolean
  reasonMinLength?: number
  onConfirm: (reason?: string) => void
}

export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Megerősítés',
  cancelLabel = 'Mégse',
  tone = 'default',
  loading = false,
  reasonLabel,
  reasonPlaceholder,
  reasonDefault = '',
  reasonRequired = false,
  reasonMinLength = 0,
  onConfirm,
}: AdminConfirmDialogProps) {
  const [reason, setReason] = useState(reasonDefault)

  useEffect(() => {
    if (!open) return
    // requestAnimationFrame — a setState-t egy frame-re kitoljuk (a synchronous
    // setState-in-effect lint elkerülésére); a megnyitáskor visszaáll az alapérték.
    const raf = requestAnimationFrame(() => setReason(reasonDefault))
    return () => cancelAnimationFrame(raf)
  }, [open, reasonDefault])

  const trimmed = reason.trim()
  const reasonOk =
    !reasonLabel ||
    (!reasonRequired && trimmed.length === 0) ||
    trimmed.length >= Math.max(reasonMinLength, reasonRequired ? 1 : 0)

  const confirmBtnCls =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : 'bg-violet-600 hover:bg-violet-700 text-white'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg text-slate-800">
            {tone === 'danger' && <AlertTriangle className="size-5 text-rose-600" />}
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {description && <div className="text-sm text-slate-600 leading-relaxed">{description}</div>}

          {reasonLabel && (
            <div>
              <Label className="text-sm font-medium text-slate-700">
                {reasonLabel}
                {reasonRequired && <span className="text-rose-500"> *</span>}
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                rows={3}
                className="mt-1 bg-white border-slate-300 shadow-sm"
                autoFocus
                disabled={loading}
              />
              {reasonMinLength > 0 && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Legalább {reasonMinLength} karakter ({trimmed.length}/{reasonMinLength})
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            onClick={() => onConfirm(reasonLabel ? trimmed : undefined)}
            disabled={loading || !reasonOk}
            className={`gap-2 ${confirmBtnCls}`}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
