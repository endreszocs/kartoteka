'use client'

/**
 * FinancePrintDialogBody — Pénzügyi nyomtatási központ TARTALMA
 * (Sprint Q F1, v0.7.5, 2026-04-25).
 *
 * 3-5 hivatalos nyomtatvány: Registru Casa, Registru Banca (bank-választóval),
 * Registrul-Jurnal, Nyugtatömb-kimutatás (éves), Kiadási kísérőív. Hónap/év
 * választóval, élő iframe-előnézettel, PDF mentés + direkt nyomtatás.
 *
 * ─── Platform-függetlenség (web + Tauri desktop + jövőbeli iOS) ───
 *
 * - Csak pure UI (react, ./types). Semmi shadcn / sonner / Supabase / Tauri
 *   import.
 * - A Dialog shell (open/close, modal-keret) a wrapper-ben marad —
 *   a sharedban csak a tartalom (header + szűrők + buttonok + iframe).
 * - A `report` HTML-t a wrapper építi (a `buildFinancePrintDocument`-tel),
 *   és prop-on át adja át. iOS-en saját report-builder lehetséges.
 * - A print callback-ek (`onPrintToBrowser`, `onPrintToPdf`) a platform
 *   speciális implementációját aktiválják.
 */

import { useEffect, useMemo, useState } from 'react'
import type {
  FinancePrintType,
  FinancePrintTypeMeta,
  NyugtatombReportRow,
  PrintReport,
} from './types'

const MONTHS_RO = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
] as const

export type FinancePrintToastKind = 'success' | 'error' | 'info' | 'warning'

export interface FinancePrintFilters {
  printType: FinancePrintType
  selectedYear: number
  selectedMonth: number | null
  selectedBankId: number | null
  nyugtatombok: NyugtatombReportRow[]
}

export interface FinancePrintDialogBodyProps {
  /** A választható nyomtatványtípusok listája — pl. a webes oldali
   *  `FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv')`. */
  printableTypes: FinancePrintTypeMeta[]

  /** Bankszámlák listája — a Registru Banca választóhoz. */
  bankAccounts: { id: number; bank_neve: string; iban: string | null }[]

  /** Aktuális év (tipikusan `new Date().getFullYear()`). */
  currentYear: number

  /** A nyomtatvány HTML/title/filename — a wrapper hívja a builder-t és átadja. */
  buildReport: (filters: FinancePrintFilters) => PrintReport

  /** Nyugtatömb adatok lazy-load — csak nyugtatomb_kimutatas típusnál hívódik. */
  onLoadNyugtatombok?: (
    year: number,
  ) => Promise<{ data?: NyugtatombReportRow[]; error?: string | null }>

  /** Direkt nyomtatás — a wrapper a webes print-engine-v2.printToBrowser-t hívja. */
  onPrintToBrowser?: (html: string) => Promise<void>

  /** PDF mentés — a wrapper a webes print-engine-v2.printToPdf-t hívja. */
  onPrintToPdf?: (
    html: string,
    filename: string,
    options?: { orientation?: 'portrait' | 'landscape'; margin?: number[]; format?: string },
  ) => Promise<void>

  /** UI-feedback (sonner / Tauri toast / iOS native banner). */
  onToast?: (msg: string, kind: FinancePrintToastKind) => void

  /** Bezárás (Dialog onOpenChange(false) hívás). */
  onClose: () => void

  /** A dialog épp nyitva van-e? — hatás az effect-ek triggereléséhez. */
  open: boolean
}

export function FinancePrintDialogBody({
  printableTypes,
  bankAccounts,
  currentYear,
  buildReport,
  onLoadNyugtatombok,
  onPrintToBrowser,
  onPrintToPdf,
  onToast,
  onClose,
  open,
}: FinancePrintDialogBodyProps) {
  const [printType, setPrintType] = useState<FinancePrintType>('registru_casa')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    new Date().getMonth() + 1,
  )
  const [selectedBankId, setSelectedBankId] = useState<number | null>(
    bankAccounts[0]?.id ?? null,
  )
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [nyugtatombok, setNyugtatombok] = useState<NyugtatombReportRow[]>([])
  const [loadingNyugtatombok, setLoadingNyugtatombok] = useState(false)

  const showBankSelector = printType === 'registru_banca'
  const isNyugtatombMode = printType === 'nyugtatomb_kimutatas'

  // Nyugtatömb adatok lazy-load — csak amikor a felhasználó erre a típusra vált
  useEffect(() => {
    if (!open || !isNyugtatombMode || !onLoadNyugtatombok) return
    let cancelled = false
    setLoadingNyugtatombok(true)
    void onLoadNyugtatombok(selectedYear).then((res) => {
      if (cancelled) return
      setLoadingNyugtatombok(false)
      if (res.error) {
        onToast?.(`Nyugtatömb adatok betöltése sikertelen: ${res.error}`, 'error')
        setNyugtatombok([])
        return
      }
      setNyugtatombok(res.data || [])
    })
    return () => {
      cancelled = true
    }
  }, [open, isNyugtatombMode, selectedYear, onLoadNyugtatombok, onToast])

  const filters: FinancePrintFilters = useMemo(
    () => ({
      printType,
      selectedYear,
      selectedMonth,
      selectedBankId: showBankSelector ? selectedBankId : null,
      nyugtatombok: isNyugtatombMode ? nyugtatombok : [],
    }),
    [printType, selectedYear, selectedMonth, selectedBankId, showBankSelector, isNyugtatombMode, nyugtatombok],
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
        margin: [8, 8],
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
      {/* ── Bal oldal ──────────────────────────── */}
      <div className="space-y-4">
        {/* Típus választó */}
        <div className="card-raised space-y-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/70">
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
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
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
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Hónap
              <select
                value={selectedMonth ?? ''}
                onChange={(e) =>
                  setSelectedMonth(e.target.value === '' ? null : Number(e.target.value))
                }
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isNyugtatombMode}
                title={
                  isNyugtatombMode ? 'A nyugtatömb kimutatás mindig éves nézet.' : undefined
                }
              >
                <option value="">Teljes év</option>
                {MONTHS_RO.map((name, i) => (
                  <option key={i} value={i + 1}>
                    {name}
                  </option>
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
                    {b.bank_neve}
                    {b.iban ? ` (${b.iban})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Időszak:</span>{' '}
              {isNyugtatombMode
                ? `${selectedYear}. év`
                : selectedMonth
                  ? `${MONTHS_RO[selectedMonth - 1]} ${selectedYear}`
                  : `${selectedYear}. teljes év`}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Tájolás:</span> A4 fekvő
            </div>
            {showBankSelector && selectedBankId && (
              <div>
                <span className="font-semibold text-slate-800">Bank:</span>{' '}
                {bankAccounts.find((b) => b.id === selectedBankId)?.bank_neve}
              </div>
            )}
            {isNyugtatombMode && (
              <div className="mt-1 text-xs text-blue-700">
                {loadingNyugtatombok
                  ? 'Tömbök betöltése...'
                  : `${nyugtatombok.length} tömb az adott évben`}
              </div>
            )}
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
              disabled={sendingToPrinter}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white rounded-md transition-colors disabled:opacity-50 hover:bg-slate-50"
            >
              {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
            </button>
            <button
              type="button"
              onClick={() => void handlePdf()}
              disabled={printing}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {printing ? 'PDF készül...' : 'PDF-be mentés'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Jobb oldal: élő előnézet ──────────────── */}
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
