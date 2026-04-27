'use client'

/**
 * Bevétel-rögzítő dialog (v3) — webes wrapper, Sprint Q F3.2 (v0.7.11).
 *
 * Az UI body átkerült a sharedba (`@kartoteka/ui-app/finance/IncomeDialogBody`).
 * Ez a wrapper csak:
 *   - a Dialog shell-t (DialogContent / DialogHeader / DialogTitle) tartja webnél
 *   - 10 server-action callback prop-ot ad át a sharednek
 *   - sonner toast → onToast callback
 *
 * iOS-future-proof: a sharedban ÉLŐ body Tauri-mobile alatt natív wrapperrel
 * fut (UIAlertController + Tauri-fs / SQLite outbox), kódváltoztatás nélkül.
 */

import {
  IncomeDialogBody,
  type IncomeCategory,
  type IncomeToastFn,
  type BankAccount,
} from '@kartoteka/ui-app'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  saveIncome,
  saveIncomeBatch,
  saveIncomeWithLinkedInventory,
  saveInternalTransfer,
  getNextReceiptNumber,
  getLastRecordedDate,
  searchMembersForFinance,
  getFamilyIdForPerson,
  checkReceiptDuplicate,
  getRentalContracts,
} from '@/app/(dashboard)/penzugy/actions'
import { toast } from 'sonner'

interface IncomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: IncomeCategory[]
  bankAccounts: BankAccount[]
  currentYear: number
  yearlyFee: number
}

const handleToast: IncomeToastFn = (type, message) => {
  if (type === 'success') {
    toast.success(message)
  } else if (type === 'warning') {
    toast.warning(message)
  } else {
    toast.error(message)
  }
}

export function IncomeDialog({
  open,
  onOpenChange,
  categories,
  bankAccounts,
  currentYear,
  yearlyFee,
}: IncomeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:max-w-6xl xl:max-w-[94vw] 2xl:max-w-[90vw]">
        <div className="border-b border-zinc-100 px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-md">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Bevétel rögzítése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Egyszeri vagy táblázatos bevitel, banki letéttel és feltételes leltári kapcsolattal.
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <IncomeDialogBody
          open={open}
          onClose={() => onOpenChange(false)}
          categories={categories}
          bankAccounts={bankAccounts}
          currentYear={currentYear}
          yearlyFee={yearlyFee}
          onSaveIncome={saveIncome}
          onSaveIncomeWithLinkedInventory={saveIncomeWithLinkedInventory}
          onSaveIncomeBatch={saveIncomeBatch}
          onSaveInternalTransfer={saveInternalTransfer}
          onGetNextReceiptNumber={getNextReceiptNumber}
          onGetLastRecordedDate={getLastRecordedDate}
          onSearchMembers={async query => {
            const results = await searchMembersForFinance(query)
            return results as { id: number; csaladnev: string; k_nev: string }[]
          }}
          onGetFamilyIdForPerson={getFamilyIdForPerson}
          onCheckReceiptDuplicate={checkReceiptDuplicate}
          onGetRentalContracts={getRentalContracts}
          onToast={handleToast}
        />
      </DialogContent>
    </Dialog>
  )
}
