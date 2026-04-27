'use client'

/**
 * Webes ExpenseDialogV2 wrapper — Sprint Q F3.1 (v0.7.10).
 *
 * A korábbi 473-soros saját implementáció átalakult egy ~80-soros wrapper-ré,
 * ami a `@kartoteka/ui-app/finance/ExpenseDialogBody`-t használja
 * (body-pattern: Dialog shell webnél, body sharedban).
 *
 * Server actions: saveExpense, saveExpenseBatch, saveInternalTransfer.
 * Toast: sonner. Ezek kliens-oldali web-specifikus implementációk.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ExpenseDialogBody,
  type ExpenseCategory,
  type SaveExpensePayload,
  type SaveExpenseBatchRow,
  type SaveInternalTransferPayload,
} from '@kartoteka/ui-app'
import { saveExpense, saveExpenseBatch, saveInternalTransfer } from '@/app/(dashboard)/penzugy/actions'
import type { BankAccount } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface ExpenseDialogV2Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: ExpenseCategory[]
  bankAccounts: BankAccount[]
}

export function ExpenseDialogV2({ open, onOpenChange, categories, bankAccounts }: ExpenseDialogV2Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:max-w-6xl xl:max-w-[94vw] 2xl:max-w-[90vw]">
        <div className="border-b border-zinc-100 px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-md">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Kiadás rögzítése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-400">Egyszeri vagy táblázatos bevitel, bankból kivétellel és leltári felismeréssel.</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <ExpenseDialogBody
          open={open}
          onClose={() => onOpenChange(false)}
          categories={categories}
          bankAccounts={bankAccounts}
          onSaveExpense={async (payload: SaveExpensePayload) => {
            const result = await saveExpense(payload)
            return { error: result.error ?? null }
          }}
          onSaveExpenseBatch={async (rows: SaveExpenseBatchRow[]) => {
            const result = await saveExpenseBatch(rows)
            return { error: result.error ?? null }
          }}
          onSaveInternalTransfer={async (payload: SaveInternalTransferPayload) => {
            const result = await saveInternalTransfer(payload)
            const errorValue = 'error' in result ? result.error : null
            return { error: errorValue ?? null }
          }}
          onToast={(type, message) => {
            if (type === 'success') toast.success(message)
            else toast.error(message)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
