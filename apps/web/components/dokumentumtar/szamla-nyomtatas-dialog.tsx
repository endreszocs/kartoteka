'use client'

/**
 * Szállítói számla — NYOMTATÁSI ELŐNÉZET dialógus (2026-09-04, Endre 3. kérése).
 *
 * Endre: „A nyomtatási kép előnézetének megnyitása legyen szép előugró ablakban,
 * és a nyomtatás gombra kattintva jelenjen meg más lapon."
 *
 * A minta a leltár fişă-dialógusa (fisa-print-dialog.tsx): lapozható, az
 * ablakhoz illesztett A4-előnézet (PrintPreviewFrame, `.sheet`), a „Nyomtatás"
 * pedig a print-engine `printToBrowser`-ét hívja — az ÚJ ABLAKBAN nyílik meg a
 * böngésző nyomtatási párbeszéde, a felhasználó kattintása adja a user-activationt.
 *
 * A HTML-t a szerver adja (`getSzamlaNyomtatvany`): ott van az XML, ott fut a
 * parser, és ugyanazt a HTML-t kapja a `szamla/[id]` lap is.
 */

import { useEffect, useState } from 'react'
import { FileDown, Loader2, Printer, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PrintPreviewFrame } from '@/components/inventory/print-preview-frame'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { getSzamlaNyomtatvany } from '@/app/(dashboard)/dokumentumtar/szamla-nyomtatvany-actions'
import type { SzamlaNyomtatvanyValasz } from '@/lib/dokumentumtar/szamla-nyomtatvany'

export function SzamlaNyomtatasDialog({
  szamlaId,
  szamlaSzam,
  onClose,
}: {
  /** null = zárva. */
  szamlaId: string | null
  szamlaSzam?: string | null
  onClose: () => void
}) {
  const [valasz, setValasz] = useState<SzamlaNyomtatvanyValasz | null>(null)
  const [betolt, setBetolt] = useState(false)
  const [nyomtat, setNyomtat] = useState(false)
  const [pdf, setPdf] = useState(false)

  // Megnyitáskor töltjük; bezáráskor ürítjük (más számla → új HTML).
  useEffect(() => {
    if (!szamlaId) { setValasz(null); return }
    let ervenyes = true
    setBetolt(true)
    setValasz(null)
    void getSzamlaNyomtatvany(szamlaId)
      .then((v) => { if (ervenyes) setValasz(v) })
      .catch((e: unknown) => {
        if (ervenyes) setValasz({ html: null, title: null, sheetCount: 0, xmlHiba: null, error: e instanceof Error ? e.message : 'A nyomtatvány betöltése sikertelen.' })
      })
      .finally(() => { if (ervenyes) setBetolt(false) })
    return () => { ervenyes = false }
  }, [szamlaId])

  const html = valasz?.html ?? null

  async function handlePrint() {
    if (!html) return
    setNyomtat(true)
    try {
      await printToBrowser(html)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható el.')
    } finally {
      setNyomtat(false)
    }
  }

  async function handlePdf() {
    if (!html || !valasz?.title) return
    setPdf(true)
    try {
      const nev = valasz.title.replace(/[^\p{L}\p{N}._-]+/gu, '_')
      await printToPdf(html, `${nev}.pdf`, { orientation: 'portrait' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A PDF nem készült el.')
    } finally {
      setPdf(false)
    }
  }

  return (
    <Dialog open={!!szamlaId} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[94dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 shadow-md">
              <ReceiptText className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-heading text-lg">
                Számla nyomtatási képe{szamlaSzam ? ` — ${szamlaSzam}` : ''}
              </DialogTitle>
              <p className="truncate text-xs text-muted-foreground">
                Kartotékából nyomtatott adatlap — a hiteles bizonylat az ANAF e-Factura XML / PDF.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {valasz?.error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {valasz.error}
            </p>
          )}
          {valasz?.xmlHiba && !valasz.error && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>A sortételek nem szerepelnek a lapon.</strong> {valasz.xmlHiba}
            </p>
          )}

          <div className="h-[58dvh] min-h-[360px]">
            {betolt ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> A nyomtatvány készül…
              </div>
            ) : html ? (
              <PrintPreviewFrame
                html={html}
                orientation="portrait"
                lapszam={valasz?.sheetCount || 1}
                cim={valasz?.title || 'Számla'}
                szelektor=".sheet"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nincs megjeleníthető nyomtatvány.</p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" className="min-h-11 rounded-xl" onClick={onClose}>
              Bezárás
            </Button>
            <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => void handlePdf()} disabled={pdf || !html}>
              {pdf ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileDown className="mr-1.5 size-4" />}
              PDF-be mentés
            </Button>
            <Button className="min-h-11 rounded-xl" onClick={() => void handlePrint()} disabled={nyomtat || !html} title="A nyomtatás új lapon nyílik meg">
              {nyomtat ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Printer className="mr-1.5 size-4" />}
              Nyomtatás
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
