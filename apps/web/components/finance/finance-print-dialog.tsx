'use client'

/**
 * Webes FinancePrintDialog wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.5): a vizuális réteg + state-management
 * átkerült a `@kartoteka/ui-app/finance` shared package-be
 * (`FinancePrintDialogBody`). A wrapper a Dialog shell-t (shadcn-radix),
 * a print-engine-t (`print-engine-v2.ts`), a server actiont
 * (`getChitantaTombokReport`), a sonner toast-ot és a HTML builder-t
 * (`buildFinancePrintDocument`) köti be a callback prop-okra.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  FinancePrintDialogBody,
  type FinancePrintFilters,
  type SavedDocOption,
  type PrintReport,
  type DecontDocData,
  type DispozitieDocData,
  buildDecontHtml,
  buildDispozitieHtml,
} from '@kartoteka/ui-app'
import {
  buildFinancePrintDocument,
  FINANCE_PRINT_TYPES,
  type FinanceReportData,
} from '@/lib/finance/reporting'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { getChitantaTombokReport } from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'
import { listDecontReprint } from '@/app/(dashboard)/penzugy/decont-actions'
import { listDispozitieReprint } from '@/app/(dashboard)/penzugy/dispozitie-actions'
import { toast } from 'sonner'
import type { BefitetesRow, KiadasRow, BankAccount, SzamadasiCel } from '@/lib/constants/finance'

interface FinancePrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  income: BefitetesRow[]
  expense: KiadasRow[]
  bankAccounts: BankAccount[]
  cellek: SzamadasiCel[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  congregationName: string
  carryoverCash: number
  carryoverBank: number
  currentYear: number
}

function emptyPreview(message: string): PrintReport {
  return {
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>body{font-family:system-ui,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;color:#94a3b8;font-size:14px;text-align:center;padding:24px}</style></head><body>${message}</body></html>`,
    title: 'Előnézet',
    filename: 'dokumentum.pdf',
    orientation: 'portrait',
  }
}

export function FinancePrintDialog({
  open,
  onOpenChange,
  income,
  expense,
  bankAccounts,
  cellek,
  bevCelMap,
  kiaCelMap,
  congregationName,
  carryoverCash,
  carryoverBank,
  currentYear,
}: FinancePrintDialogProps) {
  const printableTypes = FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-full flex-col overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 pr-14">
          <DialogTitle>Pénzügyi nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <FinancePrintDialogBody
          open={open}
          printableTypes={printableTypes}
          bankAccounts={bankAccounts.map((b) => ({
            id: b.id,
            bank_neve: b.bank_neve,
            iban: b.iban,
          }))}
          currentYear={currentYear}
          buildReport={(filters: FinancePrintFilters): PrintReport => {
            // Korábbi bizonylatok újranyomtatása (a snapshot adatból)
            if (filters.printType === 'decont_reprint') {
              const doc = filters.selectedDoc
              if (!doc) return emptyPreview('Válassz egy korábbi elszámolást a bal oldalon.')
              const data = doc.data as Omit<DecontDocData, 'congregationName'>
              return {
                html: buildDecontHtml({ congregationName, ...data }),
                title: `Decont #${data.sorszam}`,
                filename: `Decont_${data.sorszam}_${data.date}.pdf`,
                orientation: 'portrait',
              }
            }
            if (filters.printType === 'dispozitie_reprint') {
              const doc = filters.selectedDoc
              if (!doc) return emptyPreview('Válassz egy korábbi rendelvényt a bal oldalon.')
              const data = doc.data as Omit<DispozitieDocData, 'congregationName'>
              return {
                html: buildDispozitieHtml({ congregationName: `Parohia Reformată ${congregationName}`, ...data }),
                title: `Dispoziție #${data.sorszam}`,
                filename: `Dispozitie_${data.tipus}_${data.sorszam}_${data.date}.pdf`,
                orientation: 'portrait',
              }
            }

            const reportData: FinanceReportData = {
              income,
              expense,
              bankAccounts,
              cellek,
              bevCelMap,
              kiaCelMap,
              congregationName,
              carryoverCash,
              carryoverBank,
              nyugtatombok:
                filters.printType === 'nyugtatomb_kimutatas'
                  ? filters.nyugtatombok
                  : undefined,
            }
            return buildFinancePrintDocument(filters.printType, reportData, {
              year: filters.selectedYear,
              month: filters.selectedMonth,
              bankAccountId: filters.selectedBankId,
            })
          }}
          onLoadNyugtatombok={async (year) => {
            const res = await getChitantaTombokReport(year)
            return {
              data: 'data' in res ? res.data : undefined,
              error: 'error' in res ? (res.error ?? null) : null,
            }
          }}
          onLoadSavedDocs={async (year): Promise<SavedDocOption[]> => {
            const [deconts, dispozitiok] = await Promise.all([
              listDecontReprint(year),
              listDispozitieReprint(year),
            ])
            return [
              ...deconts.map((d) => ({ id: d.id, label: d.label, kind: 'decont' as const, data: d.data })),
              ...dispozitiok.map((d) => ({ id: d.id, label: d.label, kind: 'dispozitie' as const, data: d.data })),
            ]
          }}
          onPrintToBrowser={(html) => printToBrowser(html)}
          onPrintToPdf={(html, filename, options) =>
            printToPdf(html, filename, {
              orientation: options?.orientation,
              margin: options?.margin,
              format: options?.format,
            })
          }
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
          onClose={() => onOpenChange(false)}
        />
        </div>
      </DialogContent>
    </Dialog>
  )
}
