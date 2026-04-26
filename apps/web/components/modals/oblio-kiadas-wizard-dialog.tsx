'use client'

/**
 * Webes wrapper — Sprint Q F2.2, v0.7.8 (2026-04-26).
 * A vizuális réteg átkerült a `@kartoteka/ui-app/finance/oblio`-ba
 * (`OblioKiadasWizardDialogBody`). A wrapper a Dialog shell-t,
 * a 2 server actiont és a sonner toast-ot köti be.
 */

import { toast } from 'sonner'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  OblioKiadasWizardDialogBody,
  type WizardXmlItem,
} from '@kartoteka/ui-app'
import {
  createKiadasFromXmlAndMatch,
  getExpenseCategoriesForOblio,
} from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'

// Re-export a típust kompatibilitás miatt (a parent komponens a régi import-ot használja)
export type { WizardXmlItem }

interface OblioKiadasWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  xmls: WizardXmlItem[]
  onCompleted?: () => void | Promise<void>
}

export function OblioKiadasWizardDialog({
  open,
  onOpenChange,
  xmls,
  onCompleted,
}: OblioKiadasWizardDialogProps) {
  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100%-1.5rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl
          max-h-[96vh] overflow-y-auto
          border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50/30
          p-0 gap-0 rounded-2xl
        "
      >
        <OblioKiadasWizardDialogBody
          open={open}
          xmls={xmls}
          onLoadCategories={async () => {
            const res = await getExpenseCategoriesForOblio()
            return {
              data: 'data' in res ? res.data : undefined,
              error: 'error' in res ? (res.error ?? null) : null,
            }
          }}
          onCreateKiadasFromXml={async (payload) => {
            const res = await createKiadasFromXmlAndMatch(payload)
            return {
              success: 'success' in res ? res.success : undefined,
              kiadasId: 'kiadasId' in res ? res.kiadasId : undefined,
              error: 'error' in res ? (res.error ?? null) : null,
            }
          }}
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
          onCompleted={onCompleted}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
