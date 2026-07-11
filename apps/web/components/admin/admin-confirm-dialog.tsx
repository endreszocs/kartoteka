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
 *
 * 2026-07-11 admin-redesign (a prop-API változatlan):
 *   - token-alapú színek (dark-safe), a hardkódolt violet/rose/white kivezetve,
 *   - a leírás DialogDescription-ként renderelődik (aria-describedby a
 *     képernyőolvasónak), a megerősítő gomb danger-tónusa a rendszer
 *     destructive variánsa,
 *   - mobilon a gombsor egymás alá törik (teljes szélességű, jól koppintható).
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  /** 'danger' → destruktív megerősítő gomb (visszafordíthatatlan/erős művelet). */
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

  const danger = tone === 'danger'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg text-foreground">
            {danger && <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden />}
            {title}
          </DialogTitle>
          {description ? (
            // render={<div/>} — a leírás tetszőleges ReactNode lehet, de az
            // aria-describedby bekötés (Base UI Description) így is megmarad.
            <DialogDescription render={<div />} className="leading-relaxed">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {reasonLabel && (
          <div className="space-y-1.5">
            <Label htmlFor="admin-confirm-reason">
              {reasonLabel}
              {reasonRequired && (
                <span className="text-destructive" aria-hidden>
                  {' '}
                  *
                </span>
              )}
            </Label>
            <Textarea
              id="admin-confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              autoFocus
              disabled={loading}
            />
            {reasonMinLength > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Legalább {reasonMinLength} karakter ({trimmed.length}/{reasonMinLength})
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            onClick={() => onConfirm(reasonLabel ? trimmed : undefined)}
            disabled={loading || !reasonOk}
            className="gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
