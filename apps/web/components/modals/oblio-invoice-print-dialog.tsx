'use client'

/**
 * Webes wrapper — Sprint Q F2.2, v0.7.8 (2026-04-26).
 * A vizuális réteg átkerült a `@kartoteka/ui-app/finance/oblio`-ba
 * (`OblioInvoicePrintDialogBody`). A wrapper a Dialog shell-t, a
 * sonner toast-ot, és a `logoUrl`-t (web origin) köti be.
 */

import { useMemo } from 'react'
import { toast } from 'sonner'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { OblioInvoicePrintDialogBody } from '@kartoteka/ui-app'
import type { UblInvoiceMeta } from '@/lib/finance/oblio/ubl-parser'

interface OblioInvoicePrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: UblInvoiceMeta | null
  pdfHandle: FileSystemFileHandle | null
  fileName: string
  congregationName: string
}

export function OblioInvoicePrintDialog({
  open,
  onOpenChange,
  meta,
  pdfHandle,
  fileName,
  congregationName,
}: OblioInvoicePrintDialogProps) {
  // Logo abszolút URL — a iframe srcDoc relatív URL-t nem tud feloldani.
  const logoUrl = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return `${window.location.origin}/EREK.png`
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[96vw]
          !h-[94vh] !max-h-[94vh]
          overflow-hidden
          border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50/30
          p-0 gap-0 rounded-2xl
          flex flex-col
        "
      >
        <OblioInvoicePrintDialogBody
          open={open}
          meta={meta}
          pdfHandle={pdfHandle}
          fileName={fileName}
          congregationName={congregationName}
          logoUrl={logoUrl}
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
