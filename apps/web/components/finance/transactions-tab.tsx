'use client'

/**
 * Webes TransactionsTab wrapper.
 *
 * 2026-04-25 (Sprint Q Fázis 1, v0.6.3): a vizuális réteg átkerült a
 * `@kartoteka/ui-app` shared package `TransactionsTab` komponensébe. Ez a
 * wrapper a webes server-action-öket és modalokat köti be.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { TransactionsTab, type TransactionsTabProps } from '@kartoteka/ui-app'

import { exportAoaToXlsx } from '@/lib/finance/finance-xlsx-export'
import {
  getStoredRootHandle,
  isFileSystemAccessSupported,
} from '@/lib/offline/fs-handle-store'
import { listOblioMatchesAndKiadasok } from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'
import { KiseroivPrintDialog } from '@/components/finance/kiseroiv-print-dialog'
import { OblioExpenseStatusIcon } from '@/components/finance/oblio-expense-status-icon'
import { OblioFolderWarningDialog } from '@/components/finance/oblio-folder-warning'
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
  // 2026-07-10 (ÚJ #8): kp/banki jelző chip — a bankszámla-nevek feloldásához.
  | 'bankAccounts'
>

export function TransactionsTabWeb(props: WebTransactionsTabProps) {
  // 2026-07-10 (S4 #10): van-e már kiválasztott Oblio (KARTOTEKA) mappa?
  // A `getStoredRootHandle` mintája (Dexie-ben perzisztált FS-handle) — az
  // oblio-ellenorzes-tab is így ellenőrzi. `undefined` = még fut az
  // ellenőrzés (addig nincs kapuzás); `false` = nincs mappa (vagy nem
  // támogatott a böngésző) → az SPV-ikon kattintás a figyelmeztetőt nyitja.
  const [oblioFolderReady, setOblioFolderReady] = useState<boolean | undefined>(
    undefined,
  )
  useEffect(() => {
    let cancelled = false
    // A support-ellenőrzés is a promise-láncban fut (nem támogatott böngésző →
    // nincs handle → false) — így nincs szinkron setState az effekt törzsében.
    Promise.resolve()
      .then(() => (isFileSystemAccessSupported() ? getStoredRootHandle() : null))
      .then((handle) => {
        if (!cancelled) setOblioFolderReady(!!handle)
      })
      .catch(() => {
        if (!cancelled) setOblioFolderReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <TransactionsTab
      {...props}
      oblioFolderReady={oblioFolderReady}
      // 2026-06-20 (Endre, könyvelési szabály): a Tranzakciók fül a HITELES napló —
      // innen TÖRÖLNI nem lehet (sem visszamenőlegesen). A javítás a Kassza/Bank fülön
      // történik storno-val (és csak a számadás beküldéséig). Ezért NEM adunk át
      // `onDeleteTransaction`-t → a törlés gomb nem jelenik meg.
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
      onExportXlsx={(aoa, filename) => exportAoaToXlsx(aoa, filename)}
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
      // 2026-07-10 (S4 #10): "nincs Oblio-mappa" figyelmeztető — a mappa-
      // választó HELYBEN nyílik (pickRootDirectory), sikeres választás után
      // reload nélkül frissül az állapot és folytatódik a fülváltás.
      oblioFolderWarningSlot={({ open, onOpenChange, onFolderPicked }) => (
        <OblioFolderWarningDialog
          open={open}
          onOpenChange={onOpenChange}
          onReady={() => {
            setOblioFolderReady(true)
            onFolderPicked()
          }}
        />
      )}
    />
  )
}

// Backward compatibility — `TransactionsTab` továbbra is hívható a webből.
export { TransactionsTabWeb as TransactionsTab }
