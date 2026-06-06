'use client'

/**
 * Összevont bevétel/kiadás rögzítő dialog — a hero „+ Tétel rögzítése" gomb.
 *
 * Egyetlen modal, Bevétel/Kiadás fülekkel; egyszerre több bevétel és kiadás
 * is rögzíthető, a Mentés dátum szerint rendez és mindent a helyére ír
 * (saveIncomeBatch + saveExpenseBatch).
 */

import {
  CombinedEntryBody,
  type IncomeCategory,
  type ExpenseCategory,
} from '@kartoteka/ui-app'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ListPlus } from 'lucide-react'
import { saveIncomeBatch, saveExpenseBatch } from '@/app/(dashboard)/penzugy/actions'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  incomeCategories: IncomeCategory[]
  expenseCategories: ExpenseCategory[]
  currentYear: number
}

export function CombinedEntryDialog({ open, onOpenChange, incomeCategories, expenseCategories, currentYear }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:max-w-5xl xl:max-w-[90vw] 2xl:max-w-[84vw]">
        <div className="border-b border-zinc-100 px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md">
                <ListPlus className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Tétel rögzítése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-400">Bevételek és kiadások egyszerre, tömegesen — a Mentés dátum szerint rendez.</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4">
          <CombinedEntryBody
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            currentYear={currentYear}
            onSaveIncomeBatch={async (rows) => {
              const res = await saveIncomeBatch(rows)
              return { error: 'error' in res ? res.error ?? null : null }
            }}
            onSaveExpenseBatch={async (rows) => {
              const res = await saveExpenseBatch(rows)
              return { error: 'error' in res ? res.error ?? null : null }
            }}
            onClose={() => onOpenChange(false)}
            onToast={(type, message) => {
              if (type === 'success') toast.success(message)
              else toast.error(message)
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
