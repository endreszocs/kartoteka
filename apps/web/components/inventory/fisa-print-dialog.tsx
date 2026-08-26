'use client'

/**
 * Nyilvántartási lap (fişă) — NYOMTATÁS-ELŐKÉSZÍTŐ dialógus (2026-08-27).
 *
 * ⛔ MI VOLT A HIBA (Endre jelezte):
 *   „A fisát egyből nyomtatni akarja, nem tudok választani román és magyar
 *    között és úgy nyomtatni."
 *   A lista sor-gombja azonnal `printToBrowser`-t hívott a LEGUTÓBB beállított
 *   nyelvvel (alapból magyar), a HU/RO kapcsoló pedig CSAK a tétel-dialógus
 *   `xl:block` élő-előnézet oszlopában létezett — 1280 px alatt (telefon,
 *   tablet, kis laptop) egyáltalán nem volt elérhető.
 *
 * MOSTANTÓL: a gomb ezt a dialógust nyitja meg. Itt látszik a lap, választható
 * a nyelv, és onnan indul a nyomtatás VAGY a PDF-mentés (ez utóbbi eddig
 * egyáltalán nem létezett a nyilvántartási laphoz).
 */

import { useMemo, useState } from 'react'
import { FileDown, FileText, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PrintPreviewFrame } from '@/components/inventory/print-preview-frame'
import { buildInventoryItemCardHtml, type InventoryItemCardData } from '@/lib/inventory/item-card-print'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { PRINT_LANG_LABEL, type PrintLang } from '@/lib/inventory/print-layout'

export function FisaPrintDialog({
  open,
  onOpenChange,
  cardData,
  lang,
  onLangChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardData: InventoryItemCardData | null
  lang: PrintLang
  /** A választás visszaszáll a szülőre, hogy a következő lapnál is megmaradjon. */
  onLangChange: (lang: PrintLang) => void
}) {
  const [nyomtatas, setNyomtatas] = useState(false)
  const [pdf, setPdf] = useState(false)

  const doc = useMemo(
    () => (cardData ? buildInventoryItemCardHtml({ ...cardData, lang }) : null),
    [cardData, lang],
  )

  async function handlePrint() {
    if (!doc) return
    setNyomtatas(true)
    try {
      await printToBrowser(doc.html)
      toast.success('A böngésző nyomtatási előnézete megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás indítása nem sikerült.')
    } finally {
      setNyomtatas(false)
    }
  }

  async function handlePdf() {
    if (!doc || !cardData) return
    setPdf(true)
    try {
      const nev = (cardData.megnevezes || 'nyilvantartasi_lap')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .slice(0, 60)
      await printToPdf(doc.html, `${nev}.pdf`, { orientation: 'portrait', margin: [0, 0], format: 'a4' })
      toast.success('A nyilvántartási lap PDF-je elkészült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPdf(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <FileText className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base sm:text-lg">
                Nyilvántartási lap nyomtatása
              </DialogTitle>
              <p className="truncate text-xs text-muted-foreground">
                {cardData?.megnevezes || 'Leltári tétel'}
                {cardData?.leltariSzam ? ` · ${cardData.leltariSzam}` : ''}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                A lap nyelve
              </p>
              <p className="text-xs text-muted-foreground">
                A lap a választott nyelven készül. A másik nyelvű változat külön nyomtatható.
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-xl border border-input" role="group" aria-label="A nyilvántartási lap nyelve">
              {(['hu', 'ro'] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onLangChange(l)}
                  className={`min-h-11 px-4 text-sm font-semibold transition ${
                    lang === l
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
                      : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {PRINT_LANG_LABEL[l]}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[58dvh] min-h-[360px]">
            {doc ? (
              <PrintPreviewFrame
                html={doc.html}
                orientation="portrait"
                lapszam={doc.sheetCount || 1}
                cim={doc.title}
                szelektor=".sheet"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nincs megjeleníthető tétel.</p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" className="min-h-11 rounded-xl" onClick={() => onOpenChange(false)}>
              Bezárás
            </Button>
            <Button
              variant="outline"
              className="min-h-11 rounded-xl"
              onClick={() => void handlePdf()}
              disabled={pdf || !doc}
            >
              {pdf ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileDown className="mr-1.5 size-4" />}
              PDF-be mentés
            </Button>
            <Button
              className="min-h-11 rounded-xl"
              onClick={() => void handlePrint()}
              disabled={nyomtatas || !doc}
            >
              {nyomtatas ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Printer className="mr-1.5 size-4" />}
              Nyomtatás
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
