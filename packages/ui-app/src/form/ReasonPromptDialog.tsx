'use client'

/**
 * ReasonPromptDialog — indoklást bekérő megerősítő dialógus (KÖZÖS).
 *
 * 2026-08-11 (K5-#12). Miért kellett:
 *   A `window.prompt` telefonon egysoros és nem méretezhető, Firefoxban pedig a
 *   felhasználó ismételt használat után letilthatja a további dialógusokat —
 *   ekkor a funkció NÉMÁN elérhetetlenné válik. Ezenfelül a natív prompt nem
 *   illik a rendszer kinézetéhez, és a kötelező-jelölést sem tudja megmutatni.
 *
 * Hol lakik és miért:
 *   Az `apps/web` már használ egy ilyet (`components/admin/admin-confirm-dialog.tsx`),
 *   de a `packages/ui-app` NEM importálhat az apps/web-ből — ezt a csomagot az
 *   `apps/desktop` is fogyasztja. Ezért a közös változat a `form/` mappába
 *   került (a ModalField mellé), és csak `@kartoteka/ui` primitíveket használ,
 *   tehát a desktop buildben is működik.
 *
 * A megerősítés addig tiltva marad, amíg az indoklás el nem éri a megadott
 * minimális hosszt — üres indoklású kérelem nem küldhető el.
 */

import { useEffect, useState } from 'react'

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Label, Textarea } from '@kartoteka/ui'

export interface ReasonPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Magyarázó szöveg a cím alatt (mit fog kezdeni a címzett a kérelemmel). */
  description?: string
  reasonLabel: string
  reasonPlaceholder?: string
  /** Hány karakter az elfogadható minimum (alapértelmezés: 10 — kb. egy mondat). */
  reasonMinLength?: number
  confirmLabel?: string
  cancelLabel?: string
  /** Küldés közben: a gombok tiltva, a dialógus nem zárható be véletlenül. */
  loading?: boolean
  onConfirm: (reason: string) => void
}

export function ReasonPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonLabel,
  reasonPlaceholder,
  reasonMinLength = 10,
  confirmLabel = 'Elküldöm',
  cancelLabel = 'Mégse',
  loading = false,
  onConfirm,
}: ReasonPromptDialogProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) return
    // requestAnimationFrame — a setState-t egy frame-re kitoljuk (nincs
    // szinkron setState effektben); megnyitáskor mindig üres mezővel indul.
    const raf = requestAnimationFrame(() => setReason(''))
    return () => cancelAnimationFrame(raf)
  }, [open])

  const trimmed = reason.trim()
  const tooShort = trimmed.length < reasonMinLength

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (loading) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 text-lg text-foreground">{title}</DialogTitle>
        </DialogHeader>

        {description ? <p className="text-sm leading-relaxed text-muted-foreground">{description}</p> : null}

        <div className="space-y-1.5">
          <Label htmlFor="reason-prompt-text">
            {reasonLabel}
            <span className="text-destructive" aria-hidden>
              {' '}
              *
            </span>
          </Label>
          <Textarea
            id="reason-prompt-text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={4}
            autoFocus
            disabled={loading}
          />
          <p className="text-[11px] text-muted-foreground">
            Legalább {reasonMinLength} karakter ({trimmed.length}/{reasonMinLength})
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="min-h-11 w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={() => onConfirm(trimmed)}
            disabled={loading || tooShort}
            className="min-h-11 w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
