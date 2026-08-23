'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { InventoryItem } from '@/lib/constants/inventory.next'
import {
  buildInventoryPrintDocument,
  INVENTORY_PRINT_TYPES,
  type InventoryPrintType,
  type InventoryPrintFinanceSummary,
  type InventoryReportFilters,
} from '@/lib/inventory/reporting'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { getInventoryPrintFinanceSummary } from '@/app/(dashboard)/leltar/actions'
import { toast } from 'sonner'

interface InventoryPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: InventoryItem[]
  congregationName?: string
  /** 2026-08-22 (6. pont): a hivatalos ROMÁN név a két ROMÁN ívhez („Registru
   *  inventar", „Lista de inventariere"). Ha nincs, csak a magyar áll ott. */
  congregationNameRo?: string
  filters?: InventoryReportFilters
  visibleItemCount?: number
}

export function InventoryPrintDialog({
  open,
  onOpenChange,
  items,
  congregationName,
  congregationNameRo,
  filters,
  visibleItemCount,
}: InventoryPrintDialogProps) {
  const initialYear = useMemo(() => {
    if (filters?.periodStart) {
      const parsed = Number(String(filters.periodStart).slice(0, 4))
      if (parsed) return parsed
    }
    return new Date().getFullYear()
  }, [filters?.periodStart])

  const currentYear = new Date().getFullYear()
  const [printType, setPrintType] = useState<InventoryPrintType>('leltariv')
  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [paperSize, setPaperSize] = useState('a4')
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [financeSummary, setFinanceSummary] = useState<InventoryPrintFinanceSummary | null>(null)
  const [financeLoading, setFinanceLoading] = useState(false)
  /**
   * 2026-08-22 (8. pont): a `try/catch/finally` itt megvolt (ez a repó pozitív
   * példája), de a hibát NÉMÁN nyelte: `setFinanceSummary(null)` → a panelen és
   * a leltáríven „0 / 0 RON" jelent meg, mintha a pénztár tényleg üres lenne.
   * Nulla és „nem tudjuk" NEM ugyanaz egy aláírandó leltáríven.
   */
  const [financeHiba, setFinanceHiba] = useState<string | null>(null)
  /** Az „Újrapróbálom" gomb léptetője — a betöltő effect depje. */
  const [ujratoltoKulcs, setUjratoltoKulcs] = useState(0)

  useEffect(() => {
    setSelectedYear(initialYear)
  }, [initialYear])

  useEffect(() => {
    let cancelled = false

    async function loadFinanceSummary() {
      if (!open) return
      setFinanceLoading(true)
      setFinanceHiba(null)
      try {
        const summary = await getInventoryPrintFinanceSummary({
          year: selectedYear,
          periodStart: filters?.periodStart || null,
          periodEnd: filters?.periodEnd || null,
        })
        if (!cancelled) setFinanceSummary(summary)
      } catch (err) {
        // 2026-08-22 (8. pont): a hiba LÁTHATÓ. Eddig némán `null` lett, és a
        // panel „0 / 0 RON"-t írt — a lelkész nem tudta megkülönböztetni az
        // ÜRES pénztárt a BE NEM TÖLTÖTT pénztártól.
        if (cancelled) return
        setFinanceSummary(null)
        const uzenet = err instanceof Error ? err.message : 'Ismeretlen hiba.'
        setFinanceHiba(uzenet)
        toast.error(`A pénztár/követelés adatok betöltése nem sikerült: ${uzenet}`)
      } finally {
        if (!cancelled) setFinanceLoading(false)
      }
    }

    void loadFinanceSummary()
    return () => {
      cancelled = true
    }
  }, [filters?.periodEnd, filters?.periodStart, open, selectedYear, ujratoltoKulcs])

  const report = useMemo(
    () =>
      buildInventoryPrintDocument({
        type: printType,
        items,
        congregationName: congregationName || 'Gyülekezeti leltár',
        congregationNameRo,
        year: selectedYear,
        filters,
        financeSummary,
      }),
    [congregationName, congregationNameRo, filters, financeSummary, items, printType, selectedYear],
  )

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(report.html, report.filename, {
        orientation: report.orientation,
        // 2026-07-17 (F3): a lap-margót a dokumentum .page paddingje adja (WYSIWYG);
        // a motor-margó a stíluslap-javítás után teljes-szélességű lapnál szélvágást okozna.
        margin: [0, 0],
        format: paperSize,
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
      <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700/70">Hivatalos nyomtatványok</p>
                <h3 className="font-heading text-xl text-slate-800">Válasszon formátumot</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Itt előnézetben látható a kiválasztott nyomtatvány, és innen indítható a PDF mentés vagy a direkt nyomtatás.
                </p>
              </div>

              <div className="space-y-2">
                {INVENTORY_PRINT_TYPES.map(type => {
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Leltári év
                  <select
                    value={selectedYear}
                    onChange={event => setSelectedYear(Number(event.target.value))}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 8 }, (_, index) => currentYear - index).map(year => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Lapméret
                  <select
                    value={paperSize}
                    onChange={event => setPaperSize(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="a4">A4</option>
                  </select>
                </label>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">Kategória:</span> {filters?.categoryLabel || 'Minden kategória'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Helyszín:</span> {filters?.locationFilter || 'Minden helyszín'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Szűrt időszak:</span> {filters?.periodStart || filters?.periodEnd ? `${filters?.periodStart || '...'} - ${filters?.periodEnd || '...'}` : 'Teljes időszak'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Érintett tételek:</span> {visibleItemCount ?? items.length} db
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Tájolás:</span> {report.orientation === 'landscape' ? 'A4 fekvő' : 'A4 álló'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Pénztár / követelés:</span>{' '}
                  {financeLoading
                    ? 'betöltés...'
                    : financeHiba
                      ? 'nem tölthető be'
                      : `${(financeSummary?.closingCash || 0).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} / ${(financeSummary?.closingReceivables || 0).toLocaleString('hu-HU', { maximumFractionDigits: 2 })} RON`}
                </div>
              </div>

              {/* 2026-08-22 (8. pont): a néma nyelés helyett LÁTHATÓ hibaüzenet.
                  A leltárív ilyenkor is elkészíthető (a tételek megvannak), de a
                  lelkész TUDJA, hogy a pénztár/követelés sor nem valós nulla. */}
              {financeHiba !== null && (
                <div
                  role="alert"
                  className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                >
                  <p>
                    A <strong>pénztár / követelés</strong> adatok nem tölthetők be: {financeHiba} —
                    a nyomtatványon ez a sor <strong>nem valós nulla</strong>, hanem hiányzó adat.
                  </p>
                  <button
                    type="button"
                    onClick={() => setUjratoltoKulcs((k) => k + 1)}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                  >
                    Újrapróbálom
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3 text-xs leading-5 text-slate-600">
                A direkt nyomtatás a böngésző saját nyomtatási előnézetét nyitja meg. Ott a dokumentum több oldalra bontva
                látszik, a táblafejlécek ismétlődnek, és ki lehet választani a nyomtatót is.
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

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100/80 p-3 shadow-inner">
            <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <iframe
                title={report.title}
                srcDoc={report.html}
                className="h-[78dvh] min-h-[760px] w-full rounded-[22px] bg-white"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
