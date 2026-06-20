'use client'

/**
 * Webes CashbookTab wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.1): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `CashbookTab` komponensébe.
 */

import { toast } from 'sonner'

import { CashbookTab as SharedCashbookTab, type CashbookTabProps } from '@kartoteka/ui-app'

import { ChitantaSilentPrint } from '@/components/finance/chitanta-silent-print'
import { ChitantaTombokPanel } from '@/components/finance/chitanta-tombok-panel'
import { ChitantaTombRequiredDialog } from '@/components/modals/chitanta-tomb-required-dialog'
import { StornoConfirmDialog } from '@/components/modals/storno-confirm-dialog'
import { TransactionEditDialog } from '@/components/modals/transaction-edit-dialog'
import {
  autoIssueChitantaForBefizetes,
  getChitantakForBefizetesek,
} from '@/app/(dashboard)/penzugy/chitanta-actions'
import { undoStornoTransaction } from '@/app/(dashboard)/penzugy/edit-storno-actions'

type WebCashbookTabProps = Pick<
  CashbookTabProps,
  | 'incomeRecords'
  | 'expenseRecords'
  | 'unpairedInternalIds'
  | 'carryoverCash'
  | 'bevCelMap'
  | 'kiaCelMap'
  | 'szamadasiCellek'
  | 'congregationName'
  | 'incomeCategories'
  | 'expenseCategories'
  | 'onTransactionChanged'
>

export function CashbookTab(props: WebCashbookTabProps) {
  return (
    <SharedCashbookTab
      {...props}
      onAutoIssueChitanta={async (befizetesId) => {
        const result = await autoIssueChitantaForBefizetes(befizetesId)
        return {
          chitantaId: 'chitantaId' in result ? result.chitantaId : null,
          sorozat: 'sorozat' in result ? result.sorozat : null,
          nyomdaiSzam: 'nyomdaiSzam' in result ? result.nyomdaiSzam : null,
          errorCode: 'errorCode' in result ? result.errorCode : null,
          error: 'error' in result ? result.error : null,
          maradek: 'maradek' in result ? result.maradek : null,
        }
      }}
      loadChitantakForBefizetesek={async (ids) => {
        const res = await getChitantakForBefizetesek(ids)
        return { data: res.data, error: 'error' in res ? res.error : null }
      }}
      onUndoStorno={async ({ type, id }) => {
        const res = await undoStornoTransaction({ type, id })
        return { error: 'error' in res ? res.error : null }
      }}
      onToast={(msg, kind) => {
        if (kind === 'error') toast.error(msg)
        else if (kind === 'success') toast.success(msg)
        else if (kind === 'warning') toast.warning(msg)
        else toast(msg)
      }}
      chitantaTombokPanelSlot={({ refreshKey }) => (
        <ChitantaTombokPanel
          congregationName={props.congregationName || ''}
          refreshKey={refreshKey}
        />
      )}
      chitantaSilentPrintSlot={({ chitantaId, onDone }) => (
        <ChitantaSilentPrint chitantaId={chitantaId} onDone={onDone} />
      )}
      chitantaTombRequiredDialogSlot={({ open, onOpenChange, onTombCreated }) => (
        <ChitantaTombRequiredDialog
          open={open}
          onOpenChange={onOpenChange}
          onTombCreated={onTombCreated}
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
