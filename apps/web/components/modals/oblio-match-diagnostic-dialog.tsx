'use client'

/**
 * Webes wrapper — Sprint Q F2.2, v0.7.8 (2026-04-26).
 * A vizuális réteg átkerült a `@kartoteka/ui-app/finance/oblio`-ba
 * (`OblioMatchDiagnosticDialogBody`). A wrapper a Dialog shell-t és a
 * sonner toast-ot köti be. A 3 callback (onManualMatch, onAutoMatch,
 * onDismiss) a parent-től érkezik.
 */

import { toast } from 'sonner'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { OblioMatchDiagnosticDialogBody } from '@kartoteka/ui-app'
import type { UnmatchedXmlDiag } from '@/lib/finance/oblio/oblio-matcher'

interface OblioMatchDiagnosticDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  diagnostics: UnmatchedXmlDiag[]
  onManualMatch: (xmlAnafUuid: string) => void
  onAutoMatch: (
    xmlAnafUuid: string,
    kiadasId: number,
  ) => Promise<{ success?: boolean; error?: string }>
  onDismiss: (xmlAnafUuid: string) => void
}

export function OblioMatchDiagnosticDialog({
  open,
  onOpenChange,
  diagnostics,
  onManualMatch,
  onAutoMatch,
  onDismiss,
}: OblioMatchDiagnosticDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[96vw]
          !h-[94dvh] !max-h-[94dvh]
          overflow-hidden
          border border-orange-200 bg-gradient-to-br from-white via-white to-orange-50/30
          p-0 gap-0 rounded-2xl
          flex flex-col
        "
      >
        <OblioMatchDiagnosticDialogBody
          diagnostics={diagnostics}
          onManualMatch={onManualMatch}
          onAutoMatch={async (uuid, kiadasId) => {
            const res = await onAutoMatch(uuid, kiadasId)
            return { success: res.success, error: res.error ?? null }
          }}
          onDismiss={onDismiss}
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
