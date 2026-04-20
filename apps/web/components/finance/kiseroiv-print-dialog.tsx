'use client'

/**
 * Kiadási kísérőív nyomtatási dialógus — a leltár/pénzügyi nyomtatási központ mintáját követve.
 * Bal oldal: info + gombok, jobb oldal: iframe előnézet.
 */

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { buildKiadasiKiseroiv } from '@/lib/finance/reporting'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'
import type { KiadasRow, SzamadasiCel } from '@/lib/constants/finance'

interface KiseroivPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenses: KiadasRow[]
  date: string
  pageNumber: number
  congregationName: string
  kiaCelMap: Record<number, string>
  cellek: SzamadasiCel[]
}

export function KiseroivPrintDialog({
  open,
  onOpenChange,
  expenses,
  date,
  pageNumber,
  congregationName,
  kiaCelMap,
  cellek,
}: KiseroivPrintDialogProps) {
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)

  const report = useMemo(
    () =>
      buildKiadasiKiseroiv({
        expenses,
        date,
        pageNumber,
        congregationName,
        kiaCelMap,
        cellek,
      }),
    [expenses, date, pageNumber, congregationName, kiaCelMap, cellek],
  )

  const total = expenses.reduce((s, r) => s + Number(r.osszeg || 0), 0)

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(report.html, report.filename, {
        orientation: 'portrait',
        margin: [10, 10],
        format: 'a4',
      })
      toast.success('Kiadási kísérőív PDF elkészült.')
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

  const formattedDate = date.replace(/-/g, '.')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Kiadási kísérőív — {formattedDate}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Bal oldal */}
          <div className="space-y-4">
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/70">Kiadási bizonylat</p>
                <h3 className="font-heading text-xl text-slate-800">Kísérőív nyomtatása</h3>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 space-y-1">
                <div><span className="font-semibold text-slate-800">Dátum:</span> {formattedDate}</div>
                <div><span className="font-semibold text-slate-800">Sorszám:</span> pg. {pageNumber}</div>
                <div><span className="font-semibold text-slate-800">Tételek:</span> {expenses.length} db</div>
                <div><span className="font-semibold text-slate-800">Összeg:</span> {total.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON</div>
                <div><span className="font-semibold text-slate-800">Tájolás:</span> A4 álló</div>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3 text-xs leading-5 text-slate-600">
                A kísérőív a nap összes kiadását tartalmazza egyetlen bizonylaton, éves sorszámozással.
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

          {/* Jobb oldal: előnézet */}
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100/80 p-3 shadow-inner">
            <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <iframe
                title="Kiadási kísérőív"
                srcDoc={report.html}
                className="h-[78vh] min-h-[600px] w-full rounded-[22px] bg-white"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
