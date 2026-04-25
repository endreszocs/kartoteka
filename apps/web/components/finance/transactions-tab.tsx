'use client'

/**
 * Webes TransactionsTab wrapper.
 *
 * 2026-04-25 (Sprint Q Fázis 1, v0.6.3): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `TransactionsTab` komponensébe. Ez a
 * wrapper a webes server-action-öket és modalokat köti be.
 */

import { toast } from 'sonner'

import { TransactionsTab, type TransactionsTabProps } from '@kartoteka/ui-app'

import { deleteTransaction } from '@/app/(dashboard)/penzugy/actions'
import { listOblioMatchesAndKiadasok } from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'
import { KiseroivPrintDialog } from '@/components/finance/kiseroiv-print-dialog'
import { OblioExpenseStatusIcon } from '@/components/finance/oblio-expense-status-icon'
import { OblioStatusIcon } from '@/components/finance/oblio-status-icon'
import { OblioIssueInvoiceDialog } from '@/components/modals/oblio-issue-invoice-dialog'

type WebTransactionsTabProps = Pick<
  TransactionsTabProps,
  | 'incomeRecords'
  | 'expenseRecords'
  | 'bevCelMap'
  | 'kiaCelMap'
  | 'szamadasiCellek'
  | 'congregationName'
  | 'onRefresh'
  | 'rentalContracts'
>

export function TransactionsTabWeb(props: WebTransactionsTabProps) {
  return (
    <TransactionsTab
      {...props}
      onDeleteTransaction={async (type, id) => {
        const result = await deleteTransaction(
          type === 'income' ? 'befizetes' : 'kiadas',
          id,
        )
        return { error: 'error' in result ? result.error : null }
      }}
      loadOblioMatchedExpenseIds={async (year) => {
        const res = await listOblioMatchesAndKiadasok(year)
        if (res.matches) {
          return new Set(res.matches.map((m) => m.kiadas_id))
        }
        return new Set()
      }}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else toast(msg)
      }}
      onSwitchTab={(tabKey) => {
        window.dispatchEvent(
          new CustomEvent('finance-tab-switch', { detail: tabKey }),
        )
      }}
      oblioStatusIconSlot={({
        transactionId,
        date,
        partnerName,
        amount,
        onIssueInvoice,
      }) => (
        <OblioStatusIcon
          transactionType="befizetes"
          transactionId={transactionId}
          date={date}
          partnerName={partnerName}
          amount={amount}
          onIssueInvoice={onIssueInvoice}
        />
      )}
      oblioExpenseStatusIconSlot={({ matched, notYetScanned, onClick }) => (
        <OblioExpenseStatusIcon
          matched={matched}
          notYetScanned={notYetScanned}
          onClick={onClick}
        />
      )}
      kiseroivPrintDialogSlot={({
        open,
        onOpenChange,
        expenses,
        date,
        pageNumber,
        congregationName,
        kiaCelMap,
        cellek,
      }) => (
        <KiseroivPrintDialog
          open={open}
          onOpenChange={onOpenChange}
          expenses={expenses}
          date={date}
          pageNumber={pageNumber}
          congregationName={congregationName}
          kiaCelMap={kiaCelMap}
          cellek={cellek}
        />
      )}
      oblioInvoiceDialogSlot={({ open, onOpenChange, contract }) => (
        <OblioIssueInvoiceDialog
          open={open}
          onOpenChange={onOpenChange}
          contract={contract}
          onIssued={props.onRefresh}
        />
      )}
    />
  )
}

// Backward compatibility — `TransactionsTab` továbbra is hívható a webből.
export { TransactionsTabWeb as TransactionsTab }
