'use client'

/**
 * Oblio befogadott számla — Nyomtatási központ dialog (tabos verzió).
 *
 * Két tab elérhető (ha mindkét forrás megvan):
 *   📄 KARTOTEKA összefoglaló — UBL XML-ből generált, EREK brand fejléccel
 *      VAGY (ha csak PDF van) egy fedlap a fájl-meta adatokkal
 *   📕 Eredeti PDF — a beszállító ANAF aláírt PDF-je (csak ha van helyi fájl)
 *
 * A „Direkt nyomtatás" mindig az AKTUÁLIS tab tartalmát nyomtatja
 * (a böngésző natív print dialógusából Save-as-PDF is választható).
 *
 * Külön gomb az „Eredeti PDF letöltése" — a hivatalos digitálisan aláírt
 * fájlt önállóan menti.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Printer, Download, FileText, FileWarning } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { UblInvoiceMeta } from '@/lib/finance/oblio/ubl-parser'
import { extractAnafUuidFromFilename } from '@/lib/finance/oblio/ubl-parser'
import {
  buildOblioInvoicePrintHtml,
  buildPdfOnlyCoverHtml,
} from '@/lib/finance/oblio/oblio-print-builder'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: UblInvoiceMeta | null
  pdfHandle: FileSystemFileHandle | null
  fileName: string
  congregationName: string
}

type TabKey = 'kartoteka' | 'pdf'

export function OblioInvoicePrintDialog({
  open,
  onOpenChange,
  meta,
  pdfHandle,
  fileName,
  congregationName,
}: Props) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfFileSize, setPdfFileSize] = useState<number>(0)
  const [pdfFileLastModified, setPdfFileLastModified] = useState<number>(Date.now())
  const [printing, setPrinting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const kartotekaIframeRef = useRef<HTMLIFrameElement>(null)
  const pdfIframeRef = useRef<HTMLIFrameElement>(null)

  const hasPdf = pdfHandle !== null
  const hasUblMeta = meta !== null

  // Aktuális tab — alapból a KARTOTEKA összefoglaló
  const [activeTab, setActiveTab] = useState<TabKey>('kartoteka')

  useEffect(() => {
    if (!open) return
    // Ha csak PDF van (nincs UBL meta), induljunk a PDF taben
    setActiveTab(hasUblMeta || !hasPdf ? 'kartoteka' : 'pdf')
  }, [open, hasUblMeta, hasPdf])

  // Logo abszolút URL — a iframe srcDoc relatív URL-t nem tud feloldani
  const logoUrl = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return `${window.location.origin}/EREK.png`
  }, [])

  // ─── PDF blob URL kezelés ───
  useEffect(() => {
    if (!open || !pdfHandle) {
      setPdfBlobUrl(null)
      return
    }
    let cancelled = false
    let createdUrl: string | null = null
    pdfHandle
      .getFile()
      .then((file) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(file)
        setPdfBlobUrl(createdUrl)
        setPdfFileSize(file.size)
        setPdfFileLastModified(file.lastModified)
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(
            `PDF betöltési hiba: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [open, pdfHandle])

  // ─── KARTOTEKA HTML generálás — UBL alapú VAGY PDF-only fedlap ───
  const kartotekaHtml = useMemo(() => {
    if (meta) {
      return buildOblioInvoicePrintHtml({
        meta,
        congregationName,
        fileName,
        logoUrl,
      })
    }
    if (hasPdf) {
      // Csak PDF van — egyszerű fedlap, ugyanaz a brand
      return buildPdfOnlyCoverHtml({
        fileName,
        fileSize: pdfFileSize,
        fileLastModified: pdfFileLastModified,
        congregationName,
        logoUrl,
        anafUuid: extractAnafUuidFromFilename(fileName),
      })
    }
    return ''
  }, [meta, congregationName, fileName, logoUrl, hasPdf, pdfFileSize, pdfFileLastModified])

  // ─── Akciók ───

  function handlePrint() {
    const targetIframe =
      activeTab === 'pdf' ? pdfIframeRef.current : kartotekaIframeRef.current
    if (!targetIframe?.contentWindow) {
      toast.error('A nyomtatási előnézet nem elérhető. Próbáld újra.')
      return
    }
    setPrinting(true)
    try {
      targetIframe.contentWindow.focus()
      targetIframe.contentWindow.print()
      toast.success(
        'Nyomtatási dialógus megnyílt. PDF-be mentéshez válaszd a „Mentés PDF-be" opciót.',
      )
    } catch (err) {
      toast.error(
        `Nyomtatás hiba: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setPrinting(false)
    }
  }

  async function handleDownloadOriginalPdf() {
    if (!pdfHandle) return
    setDownloading(true)
    try {
      const file = await pdfHandle.getFile()
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5_000)
      toast.success(`Letöltve: ${file.name}`)
    } catch (err) {
      toast.error(
        `Letöltés hiba: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setDownloading(false)
    }
  }

  // Mindkettő tab-jelölt
  const showKartotekaTab = kartotekaHtml.length > 0
  const showPdfTab = hasPdf && pdfBlobUrl !== null
  const showTabs = showKartotekaTab && showPdfTab

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[96vw]
          !h-[94vh] !max-h-[94vh]
          overflow-hidden
          border border-cyan-200 bg-gradient-to-br from-white via-white to-cyan-50/30
          p-0 gap-0 rounded-2xl
          flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-cyan-100 bg-white/70 px-6 py-4 sm:px-8 sm:py-4 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
              <Printer className="size-5" />
            </span>
            Nyomtatási központ
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            {showTabs
              ? 'Válassz tab-ot: a KARTOTEKA összefoglaló (egységes design, EREK fejléc) vagy az eredeti ANAF PDF.'
              : showPdfTab
                ? 'Csak az eredeti ANAF PDF érhető el.'
                : 'KARTOTEKA összefoglaló — UBL XML-ből generálva.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 grid gap-4 px-4 py-3 sm:px-6 sm:py-4 md:grid-cols-[240px_minmax(0,1fr)] overflow-hidden min-h-0">
          {/* Bal oldali sáv */}
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="card-raised border border-slate-200 bg-white p-4 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Dokumentum
                </p>
                <p className="text-sm font-semibold text-slate-800 break-words">
                  {meta?.invoiceNumber || (hasPdf ? 'PDF (UBL nélkül)' : '—')}
                </p>
              </div>
              <Row label="Beszállító" value={meta?.supplier.name || '—'} />
              <Row label="CUI" value={meta?.supplier.cui || '—'} mono />
              <Row label="Dátum" value={meta?.issueDate || '—'} />
              <Row
                label="Bruttó"
                value={
                  meta?.amounts.brut !== null && meta?.amounts.brut !== undefined
                    ? `${meta.amounts.brut.toLocaleString('hu-HU', { minimumFractionDigits: 2 })} ${meta.currency || 'RON'}`
                    : '—'
                }
              />
              <Row label="Fájl" value={fileName} mono />
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handlePrint}
                disabled={printing || (!showKartotekaTab && !showPdfTab)}
                className="w-full rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 shadow-sm"
              >
                {printing ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" /> Nyomtatás…
                  </>
                ) : (
                  <>
                    <Printer className="mr-1.5 size-4" />
                    Nyomtatás / PDF mentés
                    <span className="ml-1 text-xs opacity-80">
                      ({activeTab === 'pdf' ? 'PDF' : 'KARTOTEKA'})
                    </span>
                  </>
                )}
              </Button>
              {hasPdf && (
                <Button
                  onClick={handleDownloadOriginalPdf}
                  disabled={downloading}
                  variant="outline"
                  className="w-full rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Letöltés…
                    </>
                  ) : (
                    <>
                      <Download className="mr-1.5 size-4" /> Eredeti ANAF PDF letöltése
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="w-full rounded-xl"
              >
                Bezárás
              </Button>
            </div>

            {/* Magyarázó kártya */}
            <div className="card-raised border border-cyan-100 bg-cyan-50/40 p-4 space-y-2 text-xs leading-5">
              {activeTab === 'kartoteka' ? (
                <>
                  <p className="font-semibold text-cyan-900">
                    {meta ? '📄 KARTOTEKA összefoglaló (UBL alapján)' : '📄 KARTOTEKA fedlap (PDF-only)'}
                  </p>
                  <p className="text-slate-600">
                    Egységes EREK brand fejléccel, kétnyelvű mezőkkel, lapszámmal.
                    {meta
                      ? ' Az UBL XML pénzügyi adataiból generálva.'
                      : ' A beszállító csak PDF-et küldött, ezért egy fedlap készül a fájl meta-adataiból.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-cyan-900">📕 Eredeti ANAF PDF</p>
                  <p className="text-slate-600">
                    A beszállítótól érkezett, digitálisan aláírt eredeti PDF
                    dokumentum. Ez a hivatalos jogi forrás.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Jobb oldal: tabs + iframe — kihasználja a teljes magasságot */}
          <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
            {/* Tab váltó */}
            {showTabs && (
              <div className="shrink-0 inline-flex rounded-xl bg-slate-100 p-1 shadow-inner self-start">
                <TabButton
                  active={activeTab === 'kartoteka'}
                  onClick={() => setActiveTab('kartoteka')}
                  icon={<FileText className="size-4" />}
                >
                  KARTOTEKA összefoglaló
                </TabButton>
                <TabButton
                  active={activeTab === 'pdf'}
                  onClick={() => setActiveTab('pdf')}
                  icon={<FileWarning className="size-4" />}
                >
                  Eredeti ANAF PDF
                </TabButton>
              </div>
            )}

            {/* A4 méretű előnézet — a tartó scrollozható, az iframe pontosan
                A4 méretben (210mm × 297mm) jelenik meg, középre igazítva.
                A felhasználó ugyanazt látja, amit a print kimenet ad. */}
            <div className="flex-1 min-h-0 overflow-auto rounded-[20px] border border-slate-200 bg-slate-100/80 p-4 sm:p-6 shadow-inner">
              <div className="mx-auto bg-white shadow-md rounded-sm overflow-hidden" style={{ width: '210mm', minHeight: '297mm' }}>
                {/* KARTOTEKA HTML iframe — A4 méret */}
                {showKartotekaTab && (
                  <iframe
                    ref={kartotekaIframeRef}
                    title="KARTOTEKA összefoglaló"
                    srcDoc={kartotekaHtml}
                    style={{ width: '210mm', height: '297mm' }}
                    className={`block bg-white border-0 ${activeTab === 'kartoteka' ? '' : 'hidden'}`}
                  />
                )}
                {/* PDF iframe — A4-höz közeli méret, a Chrome PDF viewer
                    saját zoom-ot ad. Paraméterek: navpanes=0 → thumbnail
                    sidebar elrejtve, toolbar=1 → felső eszközsor látszik. */}
                {showPdfTab && (
                  <iframe
                    ref={pdfIframeRef}
                    title="ANAF PDF előnézet"
                    src={pdfBlobUrl ? `${pdfBlobUrl}#navpanes=0&toolbar=1&zoom=page-width` : undefined}
                    style={{ width: '210mm', height: '297mm' }}
                    className={`block bg-white border-0 ${activeTab === 'pdf' ? '' : 'hidden'}`}
                  />
                )}
                {!showKartotekaTab && !showPdfTab && (
                  <div className="h-[297mm] flex items-center justify-center text-sm text-slate-400">
                    <Loader2 className="mr-2 size-4 animate-spin" /> Betöltés…
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`text-sm text-slate-800 break-all ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-white text-cyan-800 shadow-sm'
          : 'text-slate-600 hover:text-slate-800'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
