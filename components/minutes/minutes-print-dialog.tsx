'use client'

/**
 * Jegyzőkönyv nyomtatási központ — a leltár nyomtatási dialógusának mintáját követi.
 * Típusok: jegyzőkönyv, meghívó, határozat kivonat.
 */

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'

type PrintType = 'jegyzokonyv' | 'meghivo' | 'hatarozat_kivonat'

const PRINT_TYPES: Array<{ id: PrintType; title: string; subtitle: string; description: string }> = [
  { id: 'jegyzokonyv', title: 'Jegyzőkönyv', subtitle: 'Hivatalos jegyzőkönyv', description: 'A gyűlés teljes jegyzőkönyve fejléccel, aláírókkal, minden oldalon.' },
  { id: 'meghivo', title: 'Meghívó', subtitle: 'Gyűlési meghívó', description: 'Hivatalos meghívó iktatószámmal és presbiter listával.' },
  { id: 'hatarozat_kivonat', title: 'Határozat kivonat', subtitle: 'Határozatok listája', description: 'Az adott gyűlés határozatainak hivatalos kivonata.' },
]

interface MinutesPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A nyomtatandó HTML-t generáló callback — a szülő adja meg */
  generateHtml: (type: PrintType) => string
  year: number
}

export function MinutesPrintDialog({ open, onOpenChange, generateHtml, year }: MinutesPrintDialogProps) {
  const [printType, setPrintType] = useState<PrintType>('jegyzokonyv')
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)

  const html = useMemo(() => generateHtml(printType), [generateHtml, printType])

  const selectedType = PRINT_TYPES.find((t) => t.id === printType)
  const filename = `${printType}_${year}.pdf`

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(html, filename, { orientation: 'portrait', margin: [20, 20], format: 'a4' })
      toast.success(`${selectedType?.title} PDF elkészült.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDirectPrint() {
    setSendingToPrinter(true)
    try {
      await printToBrowser(html)
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
          <DialogTitle>Nyomtatási központ — Jegyzőkönyvek</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Bal oldal */}
          <div className="space-y-4">
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700/70">Hivatalos nyomtatványok</p>
                <h3 className="font-heading text-xl text-slate-800">Válasszon formátumot</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Az előnézetben látható a kiválasztott nyomtatvány, és innen indítható a PDF mentés vagy direkt nyomtatás.
                </p>
              </div>

              <div className="space-y-2">
                {PRINT_TYPES.map((type) => {
                  const active = type.id === printType
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setPrintType(type.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        active ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-800">{type.title}</div>
                      <div className="text-xs font-medium text-indigo-700">{type.subtitle}</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{type.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="card-raised space-y-3 p-4">
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div><span className="font-semibold text-slate-800">Típus:</span> {selectedType?.title}</div>
                <div><span className="font-semibold text-slate-800">Év:</span> {year}</div>
                <div><span className="font-semibold text-slate-800">Tájolás:</span> A4 álló</div>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-3 text-xs leading-5 text-slate-600">
                A direkt nyomtatás a böngésző saját nyomtatási előnézetét nyitja meg.
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
                title={selectedType?.title || 'Előnézet'}
                srcDoc={html}
                className="h-[78vh] min-h-[760px] w-full rounded-[22px] bg-white"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
