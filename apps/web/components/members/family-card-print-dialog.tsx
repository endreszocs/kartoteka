'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getFamilyCardPrintData } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { buildFamilyCardHtml, type FamilyCardPrintData } from '@kartoteka/ui-app'

/**
 * 2026-06-10 — Nyomtatható CSALÁDI KARTON (lefűzhető A4 lap).
 *
 * Tartalma:
 *   - fejléc: család neve, gyülekezet, lakcím, körzet
 *   - tagok táblázata relációkkal (Családfő / Házastárs / gyermekek),
 *     anyakönyvi dátumokkal (születés, keresztelés, konfirmáció)
 *   - házasságkötés sora
 *   - tag-megjegyzések (ha vannak — a személyi kartonról)
 *   - OPCIONÁLISAN: az utolsó 5 év befizetései + családlátogatások
 *
 * Minta: voter-print-dialog — bal oldalt opciók, jobb oldalt élő iframe
 * előnézet, nyomtatás az iframe-ből (így a képernyő-UI nem kerül papírra).
 *
 * 2026-06-11: a HTML-builder a közös `@kartoteka/ui-app` members rétegbe
 * költözött (`buildFamilyCardHtml`) — a desktop ugyanazt a kartont nyomtatja.
 */

type PrintData = Awaited<ReturnType<typeof getFamilyCardPrintData>>

interface FamilyCardPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
}

export function FamilyCardPrintDialog({ open, onOpenChange, familyId }: FamilyCardPrintDialogProps) {
  const [data, setData] = useState<PrintData>(null)
  const [loading, setLoading] = useState(false)
  const [includePayments, setIncludePayments] = useState(false)
  const [includeVisits, setIncludeVisits] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!open || !familyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setData(null)
      getFamilyCardPrintData(familyId).then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, familyId])

  const html = useMemo(
    () =>
      data
        ? buildFamilyCardHtml(data as FamilyCardPrintData, { payments: includePayments, visits: includeVisits })
        : null,
    [data, includePayments, includeVisits],
  )

  function handlePrint() {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.focus()
    win.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] !w-[min(1060px,calc(100vw-2rem))] !max-w-[min(1060px,calc(100vw-2rem))] overflow-hidden p-0" showCloseButton={false}>
        <div className="flex h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <DialogTitle className="font-heading text-lg">Családi karton nyomtatása</DialogTitle>
              <p className="mt-0.5 text-xs text-slate-400">A4-es, lefűzhető lap — relációkkal, anyakönyvi adatokkal és megjegyzésekkel.</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex size-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:text-slate-700"
              aria-label="Bezárás"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:flex-row">
            {/* Opciók */}
            <div className="w-full shrink-0 space-y-3 sm:w-60">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Tartalom</p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <input type="checkbox" checked readOnly className="mt-0.5 accent-teal-600" disabled />
                <span>
                  <span className="font-medium text-slate-700">Relációk + anyakönyv</span>
                  <span className="block text-xs text-slate-400">Mindig a karton része</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-teal-200">
                <input
                  type="checkbox"
                  checked={includePayments}
                  onChange={(e) => setIncludePayments(e.target.checked)}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Befizetések</span>
                  <span className="block text-xs text-slate-400">Az utolsó 5 év tételei</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-teal-200">
                <input
                  type="checkbox"
                  checked={includeVisits}
                  onChange={(e) => setIncludeVisits(e.target.checked)}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="font-medium text-slate-700">Családlátogatások</span>
                  <span className="block text-xs text-slate-400">Utolsó alkalmak</span>
                </span>
              </label>

              <Button
                onClick={handlePrint}
                disabled={!html || loading}
                className="w-full gap-2 rounded-xl bg-teal-600 hover:bg-teal-700"
              >
                <Printer className="size-4" /> Nyomtatás
              </Button>
            </div>

            {/* Élő előnézet */}
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
              {loading && (
                <div className="flex h-full items-center justify-center text-sm text-slate-400 animate-pulse">
                  Családi karton összeállítása…
                </div>
              )}
              {!loading && !data && (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                  Nem sikerült betölteni a család adatait.
                </div>
              )}
              {!loading && html && (
                <iframe ref={iframeRef} title="Családi karton előnézet" srcDoc={html} className="h-full w-full bg-white" />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
