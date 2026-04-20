'use client'

/**
 * Költségvetés / Számadás nyomtatási központ dialógus.
 * Követi a leltár/pénzügyi nyomtatási központ mintáját.
 */

import { useMemo, useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  buildBudgetPrintDocument,
  BUDGET_PRINT_TYPES,
  type BudgetPrintType,
  type BudgetPrintData,
} from '@/lib/finance/budget-reporting'
import { loadBudgetRowsCompat, type BudgetCompatRow } from '@/lib/finance/budget-compat'
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
  const [printType, setPrintType] = useState<BudgetPrintType>('koltsegvetes')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [budgetRows, setBudgetRows] = useState<Record<string, BudgetCompatRow>>({})
  const [loading, setLoading] = useState(false)
  // Részszámadás időszak — dátumintervallum (csak reszszamadas típushoz)
  const [periodFrom, setPeriodFrom] = useState(`${currentYear}-01-01`)
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10))

  // Budget adatok betöltése a kiválasztott évre
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)

    async function load() {
      const supabase = createClient()
      try {
        const data = await loadBudgetRowsCompat(supabase, selectedYear, settings.congregation_id)
        if (!cancelled) {
          const map: Record<string, BudgetCompatRow> = {}
          data.forEach((r) => { map[r.szamadasicelid] = r })
          setBudgetRows(map)
        }
      } catch {
        if (!cancelled) setBudgetRows({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [open, selectedYear, settings.congregation_id])

  // Tényleges adatok aggregálása szamadasicel kódonként
  // Részszámadásnál dátum-intervallummal szűrünk
  const actualData = useMemo(() => {
    const actualIncome: Record<string, number> = {}
    const actualExpense: Record<string, number> = {}

    const inPeriod = (datum: string | null | undefined): boolean => {
      if (printType !== 'reszszamadas') return true
      if (!datum) return false
      const d = datum.slice(0, 10)
      return d >= periodFrom && d <= periodTo
    }

    for (const r of incomeRecords) {
      if (!inPeriod(r.datum)) continue
      if (r.id_befizetescel) {
        const code = bevCelMap[r.id_befizetescel]
        if (code) {
          actualIncome[code] = (actualIncome[code] || 0) + Number(r.osszeg || 0)
        }
      }
    }
    for (const r of expenseRecords) {
      if (!inPeriod(r.datum)) continue
      if (r.id_kiadascel) {
        const code = kiaCelMap[r.id_kiadascel]
        if (code) {
          actualExpense[code] = (actualExpense[code] || 0) + Number(r.osszeg || 0)
        }
      }
    }

    return { actualIncome, actualExpense }
  }, [incomeRecords, expenseRecords, bevCelMap, kiaCelMap, printType, periodFrom, periodTo])

  const printData: BudgetPrintData = useMemo(() => ({
    cellek,
    budgetRows,
    actualIncome: actualData.actualIncome,
    actualExpense: actualData.actualExpense,
    congregationName,
    year: selectedYear,
    carryoverCash,
    carryoverBank,
    periodFrom: printType === 'reszszamadas' ? periodFrom : undefined,
    periodTo: printType === 'reszszamadas' ? periodTo : undefined,
  }), [cellek, budgetRows, actualData, congregationName, selectedYear, carryoverCash, carryoverBank, printType, periodFrom, periodTo])

  const report = useMemo(
    () => buildBudgetPrintDocument(printType, printData),
    [printType, printData],
  )

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(report.html, report.filename, {
        orientation: report.orientation,
        margin: [10, 8],
        format: 'a4',
      })
      toast.success(`${report.title} PDF elkészült.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDirectPrint() {
    setSendingToPrinter(true)
    try {
      await printToBrowser(report.html)
      toast.success('Nyomtatási előnézet megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás nem sikerült.')
    } finally {
      setSendingToPrinter(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Költségvetés és számadás nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Bal oldal */}
          <div className="space-y-4">
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700/70">Hivatalos nyomtatványok</p>
                <h3 className="font-heading text-xl text-slate-800">Válasszon formátumot</h3>
              </div>
              <div className="space-y-2">
                {BUDGET_PRINT_TYPES.map((type) => {
                  const active = type.id === printType
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setPrintType(type.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        active ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
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
                      y === currentYear
                        ? new Date().toISOString().slice(0, 10)
                        : `${y}-12-31`,
                    )
                  }}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
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
                    A tényleges bevételek és kiadások csak az adott időszakra
                    szűrve jelennek meg. Gyors beállítások:
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
                <div><span className="font-semibold text-slate-800">Típus:</span> {BUDGET_PRINT_TYPES.find(t => t.id === printType)?.title}</div>
                <div><span className="font-semibold text-slate-800">Év:</span> {selectedYear}</div>
                {printType === 'reszszamadas' && (
                  <div><span className="font-semibold text-slate-800">Időszak:</span> {periodFrom} — {periodTo}</div>
                )}
                <div><span className="font-semibold text-slate-800">Tájolás:</span> A4 álló</div>
                <div><span className="font-semibold text-slate-800">Véglegesítve:</span> {settings.budget_finalized ? 'Igen' : 'Nem'}</div>
                {loading && <div className="text-xs text-amber-600">Adatok betöltése...</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => void handleDirectPrint()} disabled={sendingToPrinter || loading}>
                  {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
                </Button>
                <Button className="flex-1" onClick={() => void handlePdf()} disabled={printing || loading}>
                  {printing ? 'PDF készül...' : 'PDF-be mentés'}
                </Button>
              </div>
            </div>
          </div>

          {/* Jobb oldal: előnézet */}
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
      </DialogContent>
    </Dialog>
  )
}
