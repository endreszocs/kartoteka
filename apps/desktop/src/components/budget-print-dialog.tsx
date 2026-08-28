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

import { useCallback, useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import {
  BudgetPrintDialogBody,
  buildBudgetPrintDocument,
  hivatalosHatarozatMezok,
  BUDGET_PRINT_TYPES,
  type BealitasRow,
  type BefitetesRow,
  type BudgetPrintData,
  type BudgetPrintFilters,
  type KiadasRow,
  type PrintReport,
  type SzamadasiCel,
} from '@kartoteka/ui-app'
import { loadBudgetRowsCompat } from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { isOnlineWithSession } from '../lib/use-session-online'
import { printHtmlViaIframe } from '../lib/print-html'

/** D11 (2026-08-28): NYOMTATÁST TILTÓ magyarázó előnézet (a pénzügyi
 *  nyomtatási központ blockedPreview-jének tükre). */
function blockedElonezet(title: string, message: string): PrintReport {
  return {
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
      .box{max-width:620px;margin:8vh auto;border:2px solid #111;border-radius:10px;padding:24px}
      h1{font-size:17px;margin:0 0 10px}p{font-size:14px;line-height:1.65;margin:0 0 10px}
    </style></head><body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    title,
    filename: 'dokumentum.pdf',
    orientation: 'portrait',
    blocked: true,
  }
}

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
  /** Hivatalos román gyülekezetnév — a kétnyelvű fejléchez/lábléchez (D11). */
  congregationNameRo?: string
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
  congregationNameRo,
  carryoverCash,
  carryoverBank,
  currentYear,
  onToast,
}: DesktopBudgetPrintDialogProps) {
  // D11 (audit 2026-08-28): a KIVÁLASZTOTT év bealitas-sora évenként — a
  // véglegesítés-zászló és a presbitériumi határozat ebből jön, nem a lap
  // évének settings-éből. 'hiba' = a lekérés elhasalt (fail-closed blokk).
  const [evBealitasTerkep, setEvBealitasTerkep] = useState<
    Record<number, BealitasRow | null | 'hiba'>
  >({})
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
        const supabase = getDesktopSupabase()
        const data = await loadBudgetRowsCompat(supabase, year, settings.congregation_id)
        // D11: az év bealitas-sora ugyanebben a betöltő-körben — a buildReport
        // (szinkron) a térképből olvassa. Hibánál 'hiba' kerül be: fail-closed.
        if (year !== currentYear) {
          const evRes = await supabase
            .from('bealitas')
            .select('*')
            .eq('congregation_id', settings.congregation_id)
            .eq('id', String(year))
            .maybeSingle()
          setEvBealitasTerkep((elozo) => ({
            ...elozo,
            [year]: evRes.error ? 'hiba' : ((evRes.data as BealitasRow | null) ?? null),
          }))
        }
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
    [settings.congregation_id, currentYear],
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
      // D11 (audit 2026-08-28, a web 2026-08-15-i javításának paritása): a
      // véglegesítés-zászló és a presbitériumi határozat a KIVÁLASZTOTT évé —
      // más évnél az onLoadBudgetRows által töltött térképből, fail-closed.
      const evSettings =
        filters.selectedYear === currentYear ? settings : evBealitasTerkep[filters.selectedYear]
      if (evSettings === 'hiba') {
        return blockedElonezet(
          'A nyomtatvány most nem készíthető el',
          `A(z) ${filters.selectedYear}. évi pénzügyi beállítások (véglegesítés, presbitériumi határozat) nem tölthetők be, ezért az ív hamis véglegesítés-állapottal készülne. Ellenőrizd az internetkapcsolatot, és próbáld újra.`,
        )
      }
      if (evSettings === undefined) {
        return blockedElonezet(
          'A nyomtatvány készül',
          `A(z) ${filters.selectedYear}. évi pénzügyi beállítások betöltése folyamatban van. Egy pillanat, és megjelenik az előnézet.`,
        )
      }
      const finalized = isSzamadas
        ? !!evSettings?.accounting_finalized
        : !!evSettings?.budget_finalized
      const printData: BudgetPrintData = {
        cellek,
        budgetRows: filters.budgetRows,
        actualIncome: filters.actualIncome,
        actualExpense: filters.actualExpense,
        congregationName,
        congregationNameRo,
        year: filters.selectedYear,
        carryoverCash,
        carryoverBank,
        finalized,
        ...hivatalosHatarozatMezok(evSettings, isSzamadas ? 'szamadas' : 'koltsegvetes'),
      }
      return buildBudgetPrintDocument(filters.printType, printData)
    },
    [
      // D11: a teljes settings — a határozat-mezők is innen jönnek a folyó
      // évnél; a két zászló-dep önmagában BEFAGYASZTOTT határozatot adna.
      settings,
      currentYear,
      evBealitasTerkep,
      cellek,
      congregationName,
      congregationNameRo,
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
