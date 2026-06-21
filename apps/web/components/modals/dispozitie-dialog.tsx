'use client'

/**
 * Dispoziție de plată / încasare dialog — a hero „Dispoziție" gombja nyitja.
 *
 * A megosztott `DispozitieDialogBody` adja az UI-t és az élő (kétpéldányos,
 * román) előnézetet; ez a wrapper köti be a server-action callback-eket.
 */

import {
  DispozitieDialogBody,
  type DispozitieCategoryOption,
} from '@kartoteka/ui-app'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Receipt } from 'lucide-react'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import {
  getNextDispozitieNumber,
  saveDispozitie,
  listCashTransactionsForDispozitie,
} from '@/app/(dashboard)/penzugy/dispozitie-actions'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") a nyomtatványhoz. */
  congregationNameRo?: string
  incomeCategories: DispozitieCategoryOption[]
  expenseCategories: DispozitieCategoryOption[]
  /** A kiválasztott költségvetési évre álló alapértelmezett dátum (yyyy-mm-dd). */
  defaultDate?: string
}

export function DispozitieDialog({ open, onOpenChange, congregationName, congregationNameRo, incomeCategories, expenseCategories, defaultDate }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[96vw]
          !h-[94vh] !max-h-[94vh]
          overflow-hidden border border-amber-200 bg-gradient-to-br from-white via-white to-amber-50/30
          p-0 gap-0 rounded-2xl flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-amber-100 bg-white/70 px-6 py-4 sm:px-8 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <Receipt className="size-5" />
            </span>
            Dispoziție de plată / încasare
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Kifizetési / bevételezési rendelvény — mentéskor automatikusan könyvelődik (kiadás / bevétel).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 sm:px-8 sm:py-5">
          <DispozitieDialogBody
            congregationName={congregationName}
            congregationNameRo={congregationNameRo}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            defaultDate={defaultDate}
            onGetNextNumber={getNextDispozitieNumber}
            onListCashTransactions={listCashTransactionsForDispozitie}
            onSaveDispozitie={saveDispozitie}
            onPrint={async ({ mode, html, filename }) => {
              if (mode === 'pdf') {
                await printToPdf(html, filename || 'Dispozitie.pdf', { format: 'a4', orientation: 'portrait' })
              } else {
                await printToBrowser(html)
              }
            }}
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
