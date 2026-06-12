'use client'

/**
 * Munkanapló nyomtatási központ — a leltár nyomtatási dialógusának mintáját követi.
 *
 * Funkciók:
 *  - Év/hónap választó
 *  - 4 nyomtatvány típus (szolgálati, katekétikai, diakóniai, éves jelentés)
 *  - Élő előnézet iframe-ben
 *  - PDF mentés + direkt nyomtatás
 *
 * 2026-06-12 (Endre #3 munkanapló): a dialog SAJÁT MAGA tölti be a kiválasztott
 * év TELJES bejegyzés-listáját (getWorklogsForYear). Korábban a szülőtől kapta
 * az aktuális hónap entries-ét — így az "Éves lelkészi jelentés" mindig csak
 * egyetlen hónap adatait tartalmazta.
 */

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  buildWorklogPrintDocument,
  WORKLOG_PRINT_TYPES,
  type WorklogPrintType,
  type WorklogReportFilters,
} from '@/lib/worklog/reporting'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'
import type { WorklogEntry } from '@/lib/constants/worklog'
import { getWorklogsForYear } from '@/app/(dashboard)/munkanaplo/actions'

interface WorklogPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A megnyitáskor előválasztott év (a munkanapló-szűrő éve). */
  initialYear?: number
  congregationName?: string
}

const MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
]

export function WorklogPrintDialog({
  open,
  onOpenChange,
  initialYear,
  congregationName,
}: WorklogPrintDialogProps) {
  const currentYear = new Date().getFullYear()
  const [printType, setPrintType] = useState<WorklogPrintType>('eves_jelentes')
  const [selectedYear, setSelectedYear] = useState(initialYear || currentYear)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [entries, setEntries] = useState<WorklogEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  // Megnyitáskor az átadott évre ugrunk
  useEffect(() => {
    if (open && initialYear) setSelectedYear(initialYear)
  }, [open, initialYear])

  // A kiválasztott év teljes adatainak betöltése
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingEntries(true)
    getWorklogsForYear(selectedYear).then((data) => {
      if (cancelled) return
      setEntries(data)
      setLoadingEntries(false)
    })
    return () => { cancelled = true }
  }, [open, selectedYear])

  const filters: WorklogReportFilters = useMemo(() => ({
    year: selectedYear,
    month: selectedMonth,
  }), [selectedYear, selectedMonth])

  const report = useMemo(
    () => buildWorklogPrintDocument({
      type: printType,
      entries,
      congregationName: congregationName || 'Gyülekezet',
      filters,
    }),
    [printType, entries, congregationName, filters],
  )

  // Szűrt bejegyzések száma az előnézethez
  const filteredCount = useMemo(() => {
    return entries.filter((e) => {
      if (e.deleted) return false
      const d = e.idopont?.split('T')[0] || ''
      if (!d.startsWith(String(selectedYear))) return false
      if (selectedMonth && !d.startsWith(selectedMonth)) return false
      return true
    }).length
  }, [entries, selectedYear, selectedMonth])

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(report.html, report.filename, {
        orientation: report.orientation,
        margin: report.orientation === 'landscape' ? [8, 8] : [10, 10],
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
      toast.success('A böngésző nyomtatási előnézete megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás indítása nem sikerült.')
    } finally {
      setSendingToPrinter(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Nyomtatási központ — Munkanapló és lelkészi jelentés</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ── Bal oldal: beállítások ────────────────── */}
          <div className="space-y-4">
            {/* Nyomtatvány típus választó */}
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700/70">Hivatalos nyomtatványok</p>
                <h3 className="font-heading text-xl text-slate-800">Válasszon formátumot</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Itt előnézetben látható a kiválasztott nyomtatvány, és innen indítható a PDF mentés vagy a direkt nyomtatás.
                </p>
              </div>

              <div className="space-y-2">
                {WORKLOG_PRINT_TYPES.map(type => {
                  const active = type.id === printType
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setPrintType(type.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        active
                          ? 'border-amber-400 bg-amber-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-800">{type.title}</div>
                      <div className="text-xs font-medium text-amber-700">{type.subtitle}</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{type.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Év / Hónap / Összesítő */}
            <div className="card-raised space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Év
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 8 }, (_, i) => currentYear - i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Hónap
                  <select
                    value={selectedMonth || ''}
                    onChange={e => setSelectedMonth(e.target.value || null)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Egész év</option>
                    {MONTHS.map((name, i) => (
                      <option key={i} value={`${selectedYear}-${String(i + 1).padStart(2, '0')}`}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div><span className="font-semibold text-slate-800">Időszak:</span> {selectedMonth ? `${MONTHS[parseInt(selectedMonth.split('-')[1], 10) - 1]} ${selectedYear}` : `${selectedYear}. teljes év`}</div>
                <div><span className="font-semibold text-slate-800">Érintett bejegyzések:</span> {loadingEntries ? 'betöltés…' : `${filteredCount} db`}</div>
                <div><span className="font-semibold text-slate-800">Tájolás:</span> {report.orientation === 'landscape' ? 'A4 fekvő' : 'A4 álló'}</div>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3 text-xs leading-5 text-slate-600">
                A direkt nyomtatás a böngésző saját nyomtatási előnézetét nyitja meg. Ott a dokumentum több oldalra bontva látszik.
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => void handleDirectPrint()} disabled={sendingToPrinter}>
                  {sendingToPrinter ? 'Nyomtatási előnézet...' : 'Direkt nyomtatás'}
                </Button>
                <Button className="flex-1" onClick={() => void handlePdf()} disabled={printing}>
                  {printing ? 'PDF készül...' : 'PDF-be mentés'}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Jobb oldal: előnézet ─────────────────── */}
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
