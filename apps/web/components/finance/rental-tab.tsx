'use client'

/**
 * Webes RentalTab wrapper.
 *
 * 2026-04-25 (Sprint Q Fázis 1, v0.6.3): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `RentalTab` komponensébe. Ez a wrapper:
 *   - `deleteRentalContract` server-action callback-ként
 *   - `toast` callback-ként
 *   - RentalContractDialog + OblioIssueInvoiceDialog modals slot-prop-okként
 */

import { toast } from 'sonner'

import { RentalTab, type RentalTabProps } from '@kartoteka/ui-app'

import { deleteRentalContract } from '@/app/(dashboard)/penzugy/actions'
import { OblioIssueInvoiceDialog } from '@/components/modals/oblio-issue-invoice-dialog'
import { RentalContractDialog } from '@/components/modals/rental-contract-dialog'

type WebRentalTabProps = Pick<RentalTabProps, 'contracts' | 'onChanged' | 'betoltes'>

export function RentalTabWeb({ contracts, onChanged, betoltes }: WebRentalTabProps) {
  return (
    <RentalTab
      contracts={contracts}
      betoltes={betoltes}
      onChanged={onChanged}
      onDeleteContract={async (id) => {
        const result = await deleteRentalContract(id)
        return { error: 'error' in result ? result.error : null }
      }}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else toast(msg)
      }}
      contractDialogSlot={({ open, onOpenChange, editingContract }) => (
        <RentalContractDialog
          open={open}
          onOpenChange={onOpenChange}
          editingContract={editingContract}
          onSaved={onChanged}
        />
      )}
      invoiceDialogSlot={({ open, onOpenChange, contract }) => (
        <OblioIssueInvoiceDialog
          open={open}
          onOpenChange={onOpenChange}
          contract={contract}
          onIssued={onChanged}
        />
      )}
    />
  )
}

// Backward compatibility — `RentalTab` továbbra is hívható a webből.
export { RentalTabWeb as RentalTab }
