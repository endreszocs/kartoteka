'use client'

/**
 * BudgetPrintDialogBody — Költségvetés / számadás nyomtatási központ
 * (Sprint Q F1, v0.7.5, 2026-04-25).
 *
 * 3 nyomtatványtípus: költségvetés (terv), számadás (tény vs terv), részszámadás
 * (időszak-szűrővel). Élő iframe-előnézet, PDF mentés + direkt nyomtatás.
 *
 * ─── Platform-függetlenség (web + Tauri desktop + jövőbeli iOS) ───
 *
 * - Csak pure UI (react, ./types). Nincs shadcn / sonner / Supabase / Tauri.
 * - A Dialog shell a wrapper-ben marad — itt csak a tartalom van.
 * - A költségvetés-sorok (`BudgetCompatRow`) lazy-load-ja callback-en
 *   (`onLoadBudgetRows(year)`) — a wrapper a Supabase klienst használja.
 * - A `report` HTML-t a wrapper építi (`buildBudgetPrintDocument`-tel),
 *   és a `buildReport(filters)` callback-en át adja át.
 */

import { useEffect, useMemo, useState } from 'react'
import type { BudgetPrintType, BudgetPrintTypeMeta, PrintReport } from './types'

export type BudgetPrintToastKind = 'success' | 'error' | 'info' | 'warning'

/**
 * A költségvetés-sorok kompatibilis formátuma — a webes
 * `lib/finance/budget-compat.ts`-ben definiált `BudgetCompatRow`-val
 * megegyező alak.
 */
export interface BudgetPrintCompatRow {
  szamadasicelid: string
  tervezett: number
  modositott: number | null
  mod2: number | null
  mod3: number | null
}

export interface BudgetPrintFilters {
  printType: BudgetPrintType
  selectedYear: number
  periodFrom: string | null
  periodTo: string | null
  budgetRows: Record<string, BudgetPrintCompatRow>
  actualIncome: Record<string, number>
  actualExpense: Record<string, number>
}

export interface BudgetPrintDialogBodyProps {
  /** A választható nyomtatványtípusok listája. */
  printableTypes: BudgetPrintTypeMeta[]

  /** Aktuális év. */
  currentYear: number

  /** A jelenlegi évi költségvetés véglegesítve van-e — UI infodobozhoz. */
  budgetFinalized: boolean

  /** Tényleges bevétel/kiadás aggregálás callback-en — a wrapper a webes
   *  income/expense rekordokon számol. */
  computeActuals: (
    printType: BudgetPrintType,
    periodFrom: string | null,
    periodTo: string | null,
  ) => { actualIncome: Record<string, number>; actualExpense: Record<string, number> }

  /** Költségvetési sorok lazy-load — a wrapper a Supabase klienssel hívja a
   *  `loadBudgetRowsCompat`-ot. */
  onLoadBudgetRows: (
    year: number,
  ) => Promise<{ data?: BudgetPrintCompatRow[]; error?: string | null }>

  /** A kiválasztott típus + év + időszak alapján HTML+meta nyomtatványt épít. */
  buildReport: (filters: BudgetPrintFilters) => PrintReport

  /** Direkt nyomtatás. */
  onPrintToBrowser?: (html: string) => Promise<void>

  /** PDF mentés. */
  onPrintToPdf?: (
    html: string,
    filename: string,
    options?: { orientation?: 'portrait' | 'landscape'; margin?: number[]; format?: string },
  ) => Promise<void>

  /** UI-feedback. */
  onToast?: (msg: string, kind: BudgetPrintToastKind) => void

  /** Bezárás. */
  onClose: () => void

  /** A dialog épp nyitva van-e? */
  open: boolean
}

export function BudgetPrintDialogBody({
  printableTypes,
  currentYear,
  budgetFinalized,
  computeActuals,
  onLoadBudgetRows,
  buildReport,
  onPrintToBrowser,
  onPrintToPdf,
  onToast,
  onClose,
  open,
}: BudgetPrintDialogBodyProps) {
  const [printType, setPrintType] = useState<BudgetPrintType>('koltsegvetes')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [budgetRows, setBudgetRows] = useState<Record<string, BudgetPrintCompatRow>>({})
  const [loading, setLoading] = useState(false)
  // Részszámadás időszak — dátumintervallum (csak reszszamadas típushoz)
  const [periodFrom, setPeriodFrom] = useState(`${currentYear}-01-01`)
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10))

  // Budget adatok betöltése a kiválasztott évre
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void onLoadBudgetRows(selectedYear).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.error) {
        onToast?.(`Költségvetési sorok betöltése sikertelen: ${res.error}`, 'error')
        setBudgetRows({})
        return
      }
      const map: Record<string, BudgetPrintCompatRow> = {}
      ;(res.data || []).forEach((r) => {
        map[r.szamadasicelid] = r
      })
      setBudgetRows(map)
    })
    return () => {
      cancelled = true
    }
  }, [open, selectedYear, onLoadBudgetRows, onToast])

  // Tényleges adatok aggregálása szamadasicel kódonként — a wrapper számol
  const actualData = useMemo(() => {
    return computeActuals(
      printType,
      printType === 'reszszamadas' ? periodFrom : null,
      printType === 'reszszamadas' ? periodTo : null,
    )
  }, [computeActuals, printType, periodFrom, periodTo])

  const filters: BudgetPrintFilters = useMemo(
    () => ({
      printType,
      selectedYear,
      periodFrom: printType === 'reszszamadas' ? periodFrom : null,
      periodTo: printType === 'reszszamadas' ? periodTo : null,
      budgetRows,
      actualIncome: actualData.actualIncome,
      actualExpense: actualData.actualExpense,
    }),
    [printType, selectedYear, periodFrom, periodTo, budgetRows, actualData],
  )

  const report = useMemo(() => buildReport(filters), [buildReport, filters])

  async function handlePdf() {
    if (!onPrintToPdf) {
      onToast?.('A PDF mentés nem érhető el ezen a felületen.', 'warning')
      return
    }
    setPrinting(true)
    try {
      await onPrintToPdf(report.html, report.filename, {
        orientation: report.orientation,
        margin: [10, 8],
        format: 'a4',
      })
      onToast?.(`${report.title} PDF elkészült.`, 'success')
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.', 'error')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDirectPrint() {
    if (!onPrintToBrowser) {
      onToast?.('A nyomtatás nem érhető el ezen a felületen.', 'warning')
      return
    }
    setSendingToPrinter(true)
    try {
      await onPrintToBrowser(report.html)
      onToast?.('Nyomtatási előnézet megnyílt.', 'success')
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : 'A nyomtatás nem sikerült.', 'error')
    } finally {
      setSendingToPrinter(false)
    }
  }

  return (
    <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* Bal oldal */}
      <div className="space-y-4">
        <div className="card-raised space-y-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700/70">
              Hivatalos nyomtatványok
            </p>
            <h3 className="font-heading text-xl text-slate-800">Válasszon formátumot</h3>
          </div>
          <div className="space-y-2">
            {printableTypes.map((type) => {
              const active = type.id === printType
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setPrintType(type.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? 'border-teal-400 bg-teal-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-800">{type.title}</div>
                  <div className="text-xs font-medium text-teal-700">{type.subtitle}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{type.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card-raised space-y-3 p-4">
          <label className="block text-sm font-medium text-slate-700">
            Év
            <select
              value={selectedYear}
              onChange={(e) => {
                const y = Number(e.target.value)
                setSelectedYear(y)
                // Részszámadás időszak default igazítás az évhez
                setPeriodFrom(`${y}-01-01`)
                setPeriodTo(
                  y === currentYear ? new Date().toISOString().slice(0, 10) : `${y}-12-31`,
                )
              }}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          {/* Részszámadás időszak — csak akkor látszik, ha részszámadást választott */}
          {printType === 'reszszamadas' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                Részszámadás időszak
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-700">
                  Kezdő dátum
                  <input
                    type="date"
                    value={periodFrom}
                    onChange={(e) => setPeriodFrom(e.target.value)}
                    min={`${selectedYear}-01-01`}
                    max={`${selectedYear}-12-31`}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Záró dátum
                  <input
                    type="date"
                    value={periodTo}
                    onChange={(e) => setPeriodTo(e.target.value)}
                    min={periodFrom}
                    max={`${selectedYear}-12-31`}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <p className="text-[11px] text-amber-700/90 leading-snug">
                A tényleges bevételek és kiadások csak az adott időszakra szűrve jelennek
                meg. Gyors beállítások:
              </p>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFrom(`${selectedYear}-01-01`)
                    setPeriodTo(`${selectedYear}-06-30`)
                  }}
                  className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
                >
                  I. félév
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFrom(`${selectedYear}-07-01`)
                    setPeriodTo(`${selectedYear}-12-31`)
                  }}
                  className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
                >
                  II. félév
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFrom(`${selectedYear}-01-01`)
                    setPeriodTo(`${selectedYear}-03-31`)
                  }}
                  className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
                >
                  I. negyedév
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFrom(`${selectedYear}-01-01`)
                    setPeriodTo(
                      selectedYear === currentYear
                        ? new Date().toISOString().slice(0, 10)
                        : `${selectedYear}-12-31`,
                    )
                  }}
                  className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
                >
                  Év eleje → ma
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 space-y-1">
            <div>
              <span className="font-semibold text-slate-800">Típus:</span>{' '}
              {printableTypes.find((t) => t.id === printType)?.title}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Év:</span> {selectedYear}
            </div>
            {printType === 'reszszamadas' && (
              <div>
                <span className="font-semibold text-slate-800">Időszak:</span> {periodFrom} —{' '}
                {periodTo}
              </div>
            )}
            <div>
              <span className="font-semibold text-slate-800">Tájolás:</span> A4 álló
            </div>
            <div>
              <span className="font-semibold text-slate-800">Véglegesítve:</span>{' '}
              {budgetFinalized ? 'Igen' : 'Nem'}
            </div>
            {loading && <div className="text-xs text-amber-600">Adatok betöltése...</div>}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Bezárás
            </button>
            <button
              type="button"
              onClick={() => void handleDirectPrint()}
              disabled={sendingToPrinter || loading}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white rounded-md transition-colors disabled:opacity-50 hover:bg-slate-50"
            >
              {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
            </button>
            <button
              type="button"
              onClick={() => void handlePdf()}
              disabled={printing || loading}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {printing ? 'PDF készül...' : 'PDF-be mentés'}
            </button>
          </div>
        </div>
      </div>

      {/* Jobb oldal: élő előnézet */}
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100/80 p-3 shadow-inner">
        <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <iframe
            title={report.title}
            srcDoc={report.html}
            className="h-[78vh] min-h-[760px] w-full rounded-[22px] bg-white"
          />
        </div>
      </div>
    </div>
  )
}
