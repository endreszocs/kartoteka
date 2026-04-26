'use client'

/**
 * Oblio befogadott számla — Nyomtatási központ dialog TARTALMA (tabos verzió)
 * (Sprint Q F2.2, v0.7.8, 2026-04-26).
 *
 * Két tab elérhető (ha mindkét forrás megvan):
 *   📄 KARTOTEKA összefoglaló — UBL XML-ből generált, EREK brand fejléccel
 *      VAGY (ha csak PDF van) egy fedlap a fájl-meta adatokkal
 *   📕 Eredeti PDF — a beszállító ANAF aláírt PDF-je (csak ha van helyi fájl)
 *
 * Body-pattern: a Dialog shell webnél marad. A `pdfHandle` File System
 * Access API-tipust használ (lib.dom globális); iOS WKWebView-ban runtime-on
 * NEM létezik — a v0.7.9 sprint-ben kerül `OblioFileSystem` interface mögé
 * (Browser/Desktop/iOS adapter).
 *
 * Toast callback-en (sonner helyett).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileText, FileWarning, Loader2, Printer } from 'lucide-react'

import { extractAnafUuidFromFilename, type UblInvoiceMeta } from './ubl-parser'
import { buildOblioInvoicePrintHtml, buildPdfOnlyCoverHtml } from './oblio-print-builder'

export type OblioPrintToastKind = 'success' | 'error' | 'info' | 'warning'

export interface OblioInvoicePrintDialogBodyProps {
  meta: UblInvoiceMeta | null
  /**
   * A File System Access API handle a PDF-hez (csak Chromium-alapú
   * böngészőkben elérhető). iOS WKWebView-ban runtime NEM létezik —
   * v0.7.9 interface absztrakcióval cseréljük.
   */
  pdfHandle: FileSystemFileHandle | null
  fileName: string
  congregationName: string
  /** UI-feedback. */
  onToast?: (msg: string, kind: OblioPrintToastKind) => void
  /** Bezárás. */
  onClose: () => void
  /** A dialog épp nyitva van-e (effect-trigger). */
  open: boolean
  /**
   * Az EREK logo URL-je. A wrapper a `window.location.origin`-ből származik
   * a webes oldalon, vagy egy `/EREK.png` Tauri-asset-ből a desktop-on.
   * Ha undefined, az iframe srcDoc-jában nem jelenik meg logó.
   */
  logoUrl?: string
}

type TabKey = 'kartoteka' | 'pdf'

export function OblioInvoicePrintDialogBody({
  meta,
  pdfHandle,
  fileName,
  congregationName,
  onToast,
  onClose,
  open,
  logoUrl,
}: OblioInvoicePrintDialogBodyProps) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfFileSize, setPdfFileSize] = useState<number>(0)
  const [pdfFileLastModified, setPdfFileLastModified] = useState<number>(Date.now())
  const [printing, setPrinting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const kartotekaIframeRef = useRef<HTMLIFrameElement>(null)
  const pdfIframeRef = useRef<HTMLIFrameElement>(null)

  const hasPdf = pdfHandle !== null
  const hasUblMeta = meta !== null

  const [activeTab, setActiveTab] = useState<TabKey>('kartoteka')

  useEffect(() => {
    if (!open) return
    setActiveTab(hasUblMeta || !hasPdf ? 'kartoteka' : 'pdf')
  }, [open, hasUblMeta, hasPdf])

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
          onToast?.(
            `PDF betöltési hiba: ${e instanceof Error ? e.message : String(e)}`,
            'error',
          )
        }
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [open, pdfHandle, onToast])

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

  function handlePrint() {
    const targetIframe =
      activeTab === 'pdf' ? pdfIframeRef.current : kartotekaIframeRef.current
    if (!targetIframe?.contentWindow) {
      onToast?.('A nyomtatási előnézet nem elérhető. Próbáld újra.', 'error')
      return
    }
    setPrinting(true)
    try {
      targetIframe.contentWindow.focus()
      targetIframe.contentWindow.print()
      onToast?.(
        'Nyomtatási dialógus megnyílt. PDF-be mentéshez válaszd a „Mentés PDF-be" opciót.',
        'success',
      )
    } catch (err) {
      onToast?.(
        `Nyomtatás hiba: ${err instanceof Error ? err.message : String(err)}`,
        'error',
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
      onToast?.(`Letöltve: ${file.name}`, 'success')
    } catch (err) {
      onToast?.(
        `Letöltés hiba: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    } finally {
      setDownloading(false)
    }
  }

  const showKartotekaTab = kartotekaHtml.length > 0
  const showPdfTab = hasPdf && pdfBlobUrl !== null
  const showTabs = showKartotekaTab && showPdfTab

  return (
    <>
      {/* Header */}
      <div className="shrink-0 border-b border-cyan-100 bg-white/70 px-6 py-4 sm:px-8 sm:py-4">
        <h2 className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm">
            <Printer className="size-5" />
          </span>
          Nyomtatási központ
        </h2>
        <p className="text-sm leading-6 text-slate-600 mt-2">
          {showTabs
            ? 'Válassz tab-ot: a KARTOTEKA összefoglaló (egységes design, EREK fejléc) vagy az eredeti ANAF PDF.'
            : showPdfTab
              ? 'Csak az eredeti ANAF PDF érhető el.'
              : 'KARTOTEKA összefoglaló — UBL XML-ből generálva.'}
        </p>
      </div>

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
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing || (!showKartotekaTab && !showPdfTab)}
              className="w-full inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 transition-colors disabled:pointer-events-none disabled:opacity-50 shadow-sm"
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
            </button>
            {hasPdf && (
              <button
                type="button"
                onClick={handleDownloadOriginalPdf}
                disabled={downloading}
                className="w-full inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium border bg-white rounded-xl transition-colors disabled:pointer-events-none disabled:opacity-50 border-rose-200 text-rose-700 hover:bg-rose-50"
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
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium rounded-xl text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Bezárás
            </button>
          </div>

          {/* Magyarázó kártya */}
          <div className="card-raised border border-cyan-100 bg-cyan-50/40 p-4 space-y-2 text-xs leading-5">
            {activeTab === 'kartoteka' ? (
              <>
                <p className="font-semibold text-cyan-900">
                  {meta
                    ? '📄 KARTOTEKA összefoglaló (UBL alapján)'
                    : '📄 KARTOTEKA fedlap (PDF-only)'}
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
                  A beszállítótól érkezett, digitálisan aláírt eredeti PDF dokumentum. Ez a
                  hivatalos jogi forrás.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Jobb oldal: tabs + iframe */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
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

          <div className="flex-1 min-h-0 overflow-auto rounded-[20px] border border-slate-200 bg-slate-100/80 p-4 sm:p-6 shadow-inner">
            <div
              className="mx-auto bg-white shadow-md rounded-sm overflow-hidden"
              style={{ width: '210mm', minHeight: '297mm' }}
            >
              {showKartotekaTab && (
                <iframe
                  ref={kartotekaIframeRef}
                  title="KARTOTEKA összefoglaló"
                  srcDoc={kartotekaHtml}
                  style={{ width: '210mm', height: '297mm' }}
                  className={`block bg-white border-0 ${activeTab === 'kartoteka' ? '' : 'hidden'}`}
                />
              )}
              {showPdfTab && (
                <iframe
                  ref={pdfIframeRef}
                  title="ANAF PDF előnézet"
                  src={
                    pdfBlobUrl
                      ? `${pdfBlobUrl}#navpanes=0&toolbar=1&zoom=page-width`
                      : undefined
                  }
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
    </>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm text-slate-800 break-all ${mono ? 'font-mono text-xs' : ''}`}>
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
