'use client'

/**
 * Pénzügyi nyomtatási központ — a leltár/munkanapló mintáját követve.
 *
 * 3 fő nyomtatvány: Registru Casa, Registru Banca (bankszámla választóval), Registrul-Jurnal.
 * Hónap/év választóval, élő előnézettel, PDF mentés + direkt nyomtatás.
 */

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  buildFinancePrintDocument,
  FINANCE_PRINT_TYPES,
  type FinancePrintType,
  type FinanceReportData,
  type FinanceReportFilters,
  type NyugtatombReportRow,
} from '@/lib/finance/reporting'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'
import type { BefitetesRow, KiadasRow, BankAccount, SzamadasiCel } from '@/lib/constants/finance'
import { getChitantaTombokReport } from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'

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

const MONTHS_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

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
  const [printType, setPrintType] = useState<FinancePrintType>('registru_casa')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [selectedBankId, setSelectedBankId] = useState<number | null>(bankAccounts[0]?.id ?? null)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [nyugtatombok, setNyugtatombok] = useState<NyugtatombReportRow[]>([])
  const [loadingNyugtatombok, setLoadingNyugtatombok] = useState(false)

  const showBankSelector = printType === 'registru_banca'
  const isNyugtatombMode = printType === 'nyugtatomb_kimutatas'

  // Nyugtatömb adatok lazy-load — csak amikor a felhasználó erre a típusra vált
  useEffect(() => {
    if (!open || !isNyugtatombMode) return
    let cancelled = false
    setLoadingNyugtatombok(true)
    void getChitantaTombokReport(selectedYear).then((res) => {
      if (cancelled) return
      setLoadingNyugtatombok(false)
      if (res.error) {
        toast.error(`Nyugtatömb adatok betöltése sikertelen: ${res.error}`)
        setNyugtatombok([])
        return
      }
      setNyugtatombok(res.data || [])
    })
    return () => { cancelled = true }
  }, [open, isNyugtatombMode, selectedYear])

  const reportData: FinanceReportData = useMemo(() => ({
    income, expense, bankAccounts, cellek, bevCelMap, kiaCelMap, congregationName, carryoverCash, carryoverBank,
    nyugtatombok: isNyugtatombMode ? nyugtatombok : undefined,
  }), [income, expense, bankAccounts, cellek, bevCelMap, kiaCelMap, congregationName, carryoverCash, carryoverBank, isNyugtatombMode, nyugtatombok])

  const filters: FinanceReportFilters = useMemo(() => ({
    year: selectedYear,
    month: selectedMonth,
    bankAccountId: showBankSelector ? selectedBankId : null,
  }), [selectedYear, selectedMonth, selectedBankId, showBankSelector])

  const report = useMemo(
    () => buildFinancePrintDocument(printType, reportData, filters),
    [printType, reportData, filters],
  )

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(report.html, report.filename, {
        orientation: report.orientation,
        margin: [8, 8],
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
          <DialogTitle>Pénzügyi nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ── Bal oldal ──────────────────────────── */}
          <div className="space-y-4">
            {/* Típus választó */}
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/70">Hivatalos nyomtatványok</p>
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
                        active ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-800">{type.title}</div>
                      <div className="text-xs font-medium text-blue-700">{type.subtitle}</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{type.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Szűrők */}
            <div className="card-raised space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Év
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Hónap
                  <select
                    value={selectedMonth ?? ''}
                    onChange={(e) => setSelectedMonth(e.target.value === '' ? null : Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isNyugtatombMode}
                    title={isNyugtatombMode ? 'A nyugtatömb kimutatás mindig éves nézet.' : undefined}
                  >
                    <option value="">Teljes év</option>
                    {MONTHS_RO.map((name, i) => (
                      <option key={i} value={i + 1}>{name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Bank választó */}
              {showBankSelector && bankAccounts.length > 0 && (
                <label className="block text-sm font-medium text-slate-700">
                  Bankszámla
                  <select
                    value={selectedBankId || ''}
                    onChange={(e) => setSelectedBankId(Number(e.target.value) || null)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_neve}{b.iban ? ` (${b.iban})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div><span className="font-semibold text-slate-800">Időszak:</span> {isNyugtatombMode ? `${selectedYear}. év` : (selectedMonth ? `${MONTHS_RO[selectedMonth - 1]} ${selectedYear}` : `${selectedYear}. teljes év`)}</div>
                <div><span className="font-semibold text-slate-800">Tájolás:</span> A4 fekvő</div>
                {showBankSelector && selectedBankId && (
                  <div><span className="font-semibold text-slate-800">Bank:</span> {bankAccounts.find((b) => b.id === selectedBankId)?.bank_neve}</div>
                )}
                {isNyugtatombMode && (
                  <div className="mt-1 text-xs text-blue-700">
                    {loadingNyugtatombok ? 'Tömbök betöltése...' : `${nyugtatombok.length} tömb az adott évben`}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => void handleDirectPrint()} disabled={sendingToPrinter}>
                  {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
                </Button>
                <Button className="flex-1" onClick={() => void handlePdf()} disabled={printing}>
                  {printing ? 'PDF készül...' : 'PDF-be mentés'}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Jobb oldal: előnézet ──────────────── */}
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
