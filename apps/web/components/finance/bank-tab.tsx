'use client'

/**
 * Webes BankTab wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.2): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `BankTab` komponensébe. A wrapper
 * a webes oldalon a `sonner` toast-ot, a `next/navigation` router-t és
 * a server actionöket köti be a callback prop-okra, valamint a 4 modalt
 * mountolja slot-okon át.
 *
 * A shared komponens platform-független — ugyanez fog működni desktop
 * (Tauri) és iOS (Tauri mobile) oldalon is, csak az adatforrás cserélődik.
 */

import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { BankTab as SharedBankTab, type BankTabProps } from '@kartoteka/ui-app'

import { exportAoaToXlsx } from '@/lib/finance/finance-xlsx-export'

import { BcrImportWizardDialog } from '@/components/modals/bcr-import-wizard-dialog'
import { BankAccountDialog } from '@/components/modals/bank-account-dialog'
import { StornoConfirmDialog } from '@/components/modals/storno-confirm-dialog'
import { TransactionEditDialog } from '@/components/modals/transaction-edit-dialog'
import { undoStornoTransaction } from '@/app/(dashboard)/penzugy/edit-storno-actions'
import { getBankszamlaNyitoEgyenleg } from '@/app/(dashboard)/penzugy/bank-nyito-egyenleg-actions'

type WebBankTabProps = Pick<
  BankTabProps,
  | 'currentYear'
  | 'unpairedInternalIds'
  | 'incomeRecords'
  | 'expenseRecords'
  | 'carryoverBank'
  // 2026-07-25 (G5): levezetett nyitó számlánként, ha az évre nincs rögzített sor
  | 'derivedNyitoRon'
  | 'bankAccounts'
  | 'bevCelMap'
  | 'kiaCelMap'
  | 'szamadasiCellek'
  | 'incomeCategories'
  | 'expenseCategories'
  | 'onBankImported'
  | 'congregationId'
  | 'onBankAccountSaved'
  | 'onTransactionChanged'
  | 'onOpenOpeningBalances'
>

export function BankTab(props: WebBankTabProps) {
  const router = useRouter()

  return (
    <SharedBankTab
      {...props}
      onUndoStorno={async ({ type, id }) => {
        const res = await undoStornoTransaction({ type, id })
        return { error: 'error' in res ? (res.error ?? null) : null }
      }}
      onLoadNyitoEgyenleg={async (bankszamlaId, eve) => {
        const res = await getBankszamlaNyitoEgyenleg(bankszamlaId, eve)
        return {
          data: res.data ?? null,
          error: 'error' in res ? (res.error ?? null) : null,
        }
      }}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else if (kind === 'warning') toast.warning(msg)
        else toast(msg)
      }}
      onTransactionChanged={async () => {
        router.refresh()
        if (props.onTransactionChanged) await props.onTransactionChanged()
      }}
      onExportXlsx={(aoa, filename) => exportAoaToXlsx(aoa, filename)}
      bcrImportWizardDialogSlot={({
        open,
        onOpenChange,
        bankAccounts,
        defaultBankAccountId,
        incomeCategories,
        expenseCategories,
        onImported,
      }) => (
        <BcrImportWizardDialog
          open={open}
          onOpenChange={onOpenChange}
          bankAccounts={bankAccounts}
          defaultBankAccountId={defaultBankAccountId}
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          onImported={onImported}
        />
      )}
      bankAccountDialogSlot={({
        open,
        onOpenChange,
        account,
        congregationId,
        onSaved,
      }) => (
        <BankAccountDialog
          open={open}
          onOpenChange={onOpenChange}
          account={account}
          congregationId={congregationId}
          onSaved={onSaved}
        />
      )}
      transactionEditDialogSlot={({
        open,
        onOpenChange,
        type,
        id,
        initial,
        categories,
        onSaved,
      }) => (
        <TransactionEditDialog
          open={open}
          onOpenChange={onOpenChange}
          type={type}
          id={id}
          initial={initial}
          categories={categories}
          onSaved={onSaved}
        />
      )}
      stornoConfirmDialogSlot={({
        open,
        onOpenChange,
        type,
        id,
        summary,
        isInternalTransfer,
        onStornoed,
      }) => (
        <StornoConfirmDialog
          open={open}
          onOpenChange={onOpenChange}
          type={type}
          id={id}
          summary={summary}
          isInternalTransfer={isInternalTransfer}
          onStornoed={onStornoed}
        />
      )}
    />
  )
}
