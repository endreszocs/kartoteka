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
  // Tényadatok aggregálása számadásicél-kódonként (a web computeActuals tükre).
  // 2026-08-11 (6. kör): a részszámadás INNEN KIKERÜLT — a „Pénzügyi nyomtatási
  // központba" költözött, mert csak ott van év-scope-olt tétel-betöltés és
  // számlánkénti feloldott nyitó.
  const computeActuals = useCallback(
    () => {
      const actualIncome: Record<string, number> = {}
      const actualExpense: Record<string, number> = {}

      // 2026-08-11 (6. kör, web-paritás): a stornózott és a soft-törölt tétel a
      // hivatalos tény-oszlopba NEM számít, és az összeg a RON-EKVIVALENS
      // (`osszeg_ron ?? osszeg`). A desktop-tükörből mindkettő kimaradt:
      // egy devizás banki tétel (1000 EUR) itt 1000 lejként szerepelt, a
      // Registru viszont 4970 lejként — két aláírt papír, két összeg.
      for (const r of incomeRecords) {
        if (r.deleted || r.stornozott) continue
        if (r.id_befizetescel) {
          const code = bevCelMap[r.id_befizetescel]
          if (code) actualIncome[code] = (actualIncome[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
        }
      }
      for (const r of expenseRecords) {
        if (r.deleted || r.stornozott) continue
        if (r.id_kiadascel) {
          const code = kiaCelMap[r.id_kiadascel]
          if (code) actualExpense[code] = (actualExpense[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
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

  // ── 2026-08-22 (8. pont, web-paritás): STABIL callback-referenciák ───────
  //
  // A desktopon a hurok eddig sem állt be (nincs saját state ebben a
  // komponensben), de az `onToast` PROPKÉNT jön a `penzugy-page.tsx`-ből, ahol
  // inline nyíl-függvény, és `setPageToast`-ot ír: egyetlen hiba-toast után a
  // page újrarenderel → új `onToast` → (a régi kódban) a betöltő-effect újra
  // fut → új toast → önfenntartó kör. A közös Body ref-mintája ezt már
  // elvágja; itt a másik oldalról zárjuk. A `buildReport` memoizálása a
  // fölösleges nyomtatvány-újraépítést spórolja meg.
  //
  // ⚠️ A deps-lista TELJES — hiányos deps = BEFAGYASZTOTT előnézet (régi
  //    `settings` a hivatalos íven).
  const buildReport = useCallback(
    (filters: BudgetPrintFilters) => {
      const isSzamadas = filters.printType === 'szamadas'
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
        finalized,
      }
      return buildBudgetPrintDocument(filters.printType, printData)
    },
    [
      settings.accounting_finalized,
      settings.budget_finalized,
      cellek,
      congregationName,
      carryoverCash,
      carryoverBank,
    ],
  )

  const onPrintToBrowser = useCallback((html: string) => printHtmlViaIframe(html), [])
  const onPrintToPdf = useCallback((html: string) => printHtmlViaIframe(html), [])
  const onClose = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Költségvetés és számadás nyomtatási központ</DialogTitle>
        </DialogHeader>

        <BudgetPrintDialogBody
          open={open}
          // 2026-08-11 (6. kör, web-paritás): a Részszámadás a Pénzügyi
          // nyomtatási központban van.
          printableTypes={BUDGET_PRINT_TYPES.filter((t) => t.id !== 'reszszamadas')}
          currentYear={currentYear}
          budgetFinalized={!!settings.budget_finalized}
          accountingFinalized={!!settings.accounting_finalized}
          computeActuals={computeActuals}
          onLoadBudgetRows={onLoadBudgetRows}
          buildReport={buildReport}
          onPrintToBrowser={onPrintToBrowser}
          onPrintToPdf={onPrintToPdf}
          onToast={onToast}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
