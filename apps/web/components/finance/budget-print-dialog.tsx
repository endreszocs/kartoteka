'use client'

/**
 * Webes BudgetPrintDialog wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.5): a vizuális réteg + state-management
 * átkerült a `@kartoteka/ui-app/finance` shared package-be
 * (`BudgetPrintDialogBody`). A wrapper a Dialog shell-t (shadcn-radix),
 * a print-engine-t, a Supabase client-tel beolvasott budget-sorokat
 * (`loadBudgetRowsCompat`), a tényleges adatok aggregálását, és a HTML
 * builder-t (`buildBudgetPrintDocument`) köti be a callback prop-okra.
 */

import { useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  BudgetPrintDialogBody,
  type BudgetPrintFilters,
  type BudgetPrintType,
} from '@kartoteka/ui-app'
import {
  buildBudgetPrintDocument,
  BUDGET_PRINT_TYPES,
  type BudgetPrintData,
} from '@/lib/finance/budget-reporting'
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'
import type { SzamadasiCel, BealitasRow, BefitetesRow, KiadasRow } from '@/lib/constants/finance'

interface BudgetPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cellek: SzamadasiCel[]
  settings: BealitasRow
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  congregationName: string
  carryoverCash: number
  carryoverBank: number
  currentYear: number
}

export function BudgetPrintDialog({
  open,
  onOpenChange,
  cellek,
  settings,
  bevCelMap,
  kiaCelMap,
  incomeRecords,
  expenseRecords,
  congregationName,
  carryoverCash,
  carryoverBank,
  currentYear,
}: BudgetPrintDialogProps) {
  // Tényleges adatok aggregálása szamadasicel kódonként.
  // Részszámadásnál a wrapper kapja a periodFrom/periodTo-t, és szűr.
  const computeActuals = useCallback(
    (
      printType: BudgetPrintType,
      periodFrom: string | null,
      periodTo: string | null,
    ) => {
      const actualIncome: Record<string, number> = {}
      const actualExpense: Record<string, number> = {}

      const inPeriod = (datum: string | null | undefined): boolean => {
        if (printType !== 'reszszamadas') return true
        if (!datum || !periodFrom || !periodTo) return false
        const d = datum.slice(0, 10)
        return d >= periodFrom && d <= periodTo
      }

      // 2026-07-10 (S3 audit KRITIKUS #1): a stornózott tétel a hivatalos
      // költségvetés/számadás nyomtatvány tény-oszlopába SEM számíthat.
      for (const r of incomeRecords) {
        if (r.stornozott) continue
        if (!inPeriod(r.datum)) continue
        if (r.id_befizetescel) {
          const code = bevCelMap[r.id_befizetescel]
          if (code) {
            actualIncome[code] = (actualIncome[code] || 0) + Number(r.osszeg || 0)
          }
        }
      }
      for (const r of expenseRecords) {
        if (r.stornozott) continue
        if (!inPeriod(r.datum)) continue
        if (r.id_kiadascel) {
          const code = kiaCelMap[r.id_kiadascel]
          if (code) {
            actualExpense[code] = (actualExpense[code] || 0) + Number(r.osszeg || 0)
          }
        }
      }

      return { actualIncome, actualExpense }
    },
    [incomeRecords, expenseRecords, bevCelMap, kiaCelMap],
  )

  const onLoadBudgetRows = useCallback(
    async (year: number) => {
      try {
        const supabase = createClient()
        const data = await loadBudgetRowsCompat(supabase, year, settings.congregation_id)
        return { data: data.map((r) => ({
          szamadasicelid: r.szamadasicelid,
          tervezett: r.tervezett,
          modositott: r.modositott,
          mod2: r.mod2,
          mod3: r.mod3,
        })) }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Költségvetés-sorok betöltése sikertelen.',
        }
      }
    },
    [settings.congregation_id],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Költségvetés és számadás nyomtatási központ</DialogTitle>
        </DialogHeader>

        <BudgetPrintDialogBody
          open={open}
          printableTypes={BUDGET_PRINT_TYPES}
          currentYear={currentYear}
          budgetFinalized={!!settings.budget_finalized}
          accountingFinalized={!!settings.accounting_finalized}
          computeActuals={computeActuals}
          onLoadBudgetRows={onLoadBudgetRows}
          buildReport={(filters: BudgetPrintFilters) => {
            const isSzamadas = filters.printType === 'szamadas' || filters.printType === 'reszszamadas'
            const finalized = isSzamadas ? !!settings.accounting_finalized : !!settings.budget_finalized
            const printData: BudgetPrintData = {
              cellek,
              budgetRows: filters.budgetRows,
              actualIncome: filters.actualIncome,
              actualExpense: filters.actualExpense,
              congregationName,
              year: filters.selectedYear,
              carryoverCash,
              carryoverBank,
              periodFrom: filters.periodFrom ?? undefined,
              periodTo: filters.periodTo ?? undefined,
              finalized,
            }
            return buildBudgetPrintDocument(filters.printType, printData)
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
      </DialogContent>
    </Dialog>
  )
}
