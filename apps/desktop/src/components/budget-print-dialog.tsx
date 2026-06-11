/**
 * DesktopBudgetPrintDialog — a webes „Költségvetés és számadás nyomtatási
 * központ" desktop megfelelője (2026-06-11, Endre #4).
 *
 * A web `components/finance/budget-print-dialog.tsx` tükre: megosztott
 * `BudgetPrintDialogBody` + közös `buildBudgetPrintDocument` builder; a
 * költségvetés-sorok a közös `loadBudgetRowsCompat`-tal jönnek (online), a
 * tényadatok a már betöltött tételekből számolódnak (részszámadásnál
 * időszak-szűréssel). Nyomtatás: rendszer print-dialógus (iframe).
 */

import { useCallback } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import {
  BudgetPrintDialogBody,
  buildBudgetPrintDocument,
  BUDGET_PRINT_TYPES,
  type BealitasRow,
  type BefitetesRow,
  type BudgetPrintData,
  type BudgetPrintFilters,
  type BudgetPrintType,
  type KiadasRow,
  type SzamadasiCel,
} from '@kartoteka/ui-app'
import { loadBudgetRowsCompat } from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { isOnlineWithSession } from '../lib/use-session-online'
import { printHtmlViaIframe } from '../lib/print-html'

interface DesktopBudgetPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: BealitasRow
  cellek: SzamadasiCel[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  congregationName: string
  carryoverCash: number
  carryoverBank: number
  currentYear: number
  onToast?: (msg: string, kind: 'success' | 'error' | 'info' | 'warning') => void
}

export function DesktopBudgetPrintDialog({
  open,
  onOpenChange,
  settings,
  cellek,
  bevCelMap,
  kiaCelMap,
  incomeRecords,
  expenseRecords,
  congregationName,
  carryoverCash,
  carryoverBank,
  currentYear,
  onToast,
}: DesktopBudgetPrintDialogProps) {
  // Tényadatok aggregálása számadásicél-kódonként — részszámadásnál a kapott
  // periodFrom/periodTo időszakra szűrve (a web computeActuals tükre).
  const computeActuals = useCallback(
    (printType: BudgetPrintType, periodFrom: string | null, periodTo: string | null) => {
      const actualIncome: Record<string, number> = {}
      const actualExpense: Record<string, number> = {}

      const inPeriod = (datum: string | null | undefined): boolean => {
        if (printType !== 'reszszamadas') return true
        if (!datum || !periodFrom || !periodTo) return false
        const d = datum.slice(0, 10)
        return d >= periodFrom && d <= periodTo
      }

      for (const r of incomeRecords) {
        if (!inPeriod(r.datum)) continue
        if (r.id_befizetescel) {
          const code = bevCelMap[r.id_befizetescel]
          if (code) actualIncome[code] = (actualIncome[code] || 0) + Number(r.osszeg || 0)
        }
      }
      for (const r of expenseRecords) {
        if (!inPeriod(r.datum)) continue
        if (r.id_kiadascel) {
          const code = kiaCelMap[r.id_kiadascel]
          if (code) actualExpense[code] = (actualExpense[code] || 0) + Number(r.osszeg || 0)
        }
      }

      return { actualIncome, actualExpense }
    },
    [incomeRecords, expenseRecords, bevCelMap, kiaCelMap],
  )

  const onLoadBudgetRows = useCallback(
    async (year: number) => {
      try {
        if (!(await isOnlineWithSession())) {
          return { error: 'A költségvetés-sorok betöltéséhez internetkapcsolat és belépés szükséges.' }
        }
        const data = await loadBudgetRowsCompat(getDesktopSupabase(), year, settings.congregation_id)
        return {
          data: data.map((r) => ({
            szamadasicelid: r.szamadasicelid,
            tervezett: r.tervezett,
            modositott: r.modositott,
            mod2: r.mod2,
            mod3: r.mod3,
          })),
        }
      } catch (e) {
        return { error: errorMessage(e) }
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
          onPrintToBrowser={(html) => printHtmlViaIframe(html)}
          onPrintToPdf={(html) => printHtmlViaIframe(html)}
          onToast={onToast}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
