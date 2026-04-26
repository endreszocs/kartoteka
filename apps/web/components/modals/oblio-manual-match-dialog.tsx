'use client'

/**
 * Webes wrapper — Sprint Q F2.2, v0.7.8 (2026-04-26).
 * A vizuális réteg átkerült a `@kartoteka/ui-app/finance/oblio`-ba
 * (`OblioManualMatchDialogBody`). A wrapper a Dialog shell-t (shadcn-radix),
 * a `saveOblioMatch` server actiont és a sonner toast-ot köti be.
 */

import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  OblioManualMatchDialogBody,
  type OblioManualMatchKiadas,
} from '@kartoteka/ui-app'
import { saveOblioMatch } from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'
import type { UblInvoiceMeta } from '@/lib/finance/oblio/ubl-parser'

interface OblioManualMatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  xml: UblInvoiceMeta | null
  fileRelpath: string | null
  kiadasok: OblioManualMatchKiadas[]
  onSaved?: () => void | Promise<void>
}

export function OblioManualMatchDialog({
  open,
  onOpenChange,
  xml,
  fileRelpath,
  kiadasok,
  onSaved,
}: OblioManualMatchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl
          max-h-[90vh] overflow-y-auto
          border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50/30
          p-0 gap-0 rounded-2xl
        "
      >
        <OblioManualMatchDialogBody
          open={open}
          xml={xml}
          fileRelpath={fileRelpath}
          kiadasok={kiadasok}
          onSaveMatch={async (payload) => {
            const res = await saveOblioMatch(payload)
            return {
              success: 'success' in res ? res.success : undefined,
              error: 'error' in res ? (res.error ?? null) : null,
            }
          }}
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
