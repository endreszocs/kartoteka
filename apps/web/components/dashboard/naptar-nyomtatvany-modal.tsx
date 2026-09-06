'use client'

/**
 * NAPTÁR-NYOMTATVÁNYOK KÖZÖS ELŐNÉZET-MODÁLJA (2026-09-05, Endre 2. pontja).
 *
 * Az éves programterv és a születésnapos/névnapos naptár UGYANEZT a modált
 * használja — a kettő közti egyetlen különbség az adat és az opció-panel
 * (slot). Így az előnézet, a nagyítás, a lapozás, a Nyomtatás/PDF út és a
 * hibakezelés EGY helyen él (néma duplikáció tilos).
 *
 * MIT JAVÍT A RÉGI (2026-06-08-i) modálhoz képest:
 *   · a PDF a KÖZÖS motorral készül (print-engine-v2: laponkénti render,
 *     lapszám-őr, üres-vászon őr) — a CDN-ről töltött html2pdf KI; ha a
 *     PDF-út elhal, HANGOS hiba + tartalék: a böngésző nyomtató-ablaka;
 *   · a Nyomtatás/PDF gomb CSAK a srcDoc TARTALMÁNAK betöltése után aktív
 *     (tartalmat mérünk: `.page` blokkok száma = várt lapszám — nem
 *     about:blank-ot fogadunk el, a print-engine-v2 hibaosztálya);
 *   · a fit() MINDKÉT tengelyre skáláz (egy teljes lap látszik), zoom-lépcső
 *     [1, 1.5, 2, 3], telefonon mindkét irányban görgethető;
 *   · a modál mérete EGY forrásból: a `.kt-eves-modal` osztály
 *     (packages/ui/src/kartoteka.css; telefonon a vw-alapú szélesség
 *     gyakorlatilag teljes). Itt NINCS inline width/height, és a konkrét
 *     plafon-értékek SEM állnak itt (komment ≠ forrás) — azokat az őrszem
 *     méri a CSS-en (selftest-naptar-nyomtatvany F2cm, mutánssal);
 *     2026-09-05 (P3-utómunka): a két igazságforrás megszűnt;
 *   · a Nyomtatás/PDF a blokkoló hiba és a betöltés alatt is tiltva — a
 *     hiba-kártya mögött nem maradhat nyomtatható a KORÁBBI (más évi) lap.
 *
 * Előnézeti iframe: `sandbox="allow-same-origin"` — script nem futhat benne
 * (a nyomtatvány-HTML nem is tartalmaz), a contentDocument viszont mérhető.
 * Sötét mód: a modál keret téma-tokenekből, a papír a nyomtatvány saját,
 * világos palettája (az papír).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Download, Loader2, Printer, RefreshCw, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

/** A4 lap 96 dpi-n (a nyomtatvány-CSS mm-ben méretezi a `.page`-et). */
const A4_PX = { portrait: { w: 794, h: 1123 }, landscape: { w: 1123, h: 794 } } as const
/** Az építők stíluslapja: body padding 20px, lapok közti hézag 18px (fix, mért). */
const BODY_PADDING = 20
const LAP_HEZAG = 18
export const NAGYITAS_SZORZOK = [1, 1.5, 2, 3] as const
/** Felső plafon a valós mérethez képest (a pénzügyi előnézet mintája). */
const MAX_SCALE = 1.5
/** Érintőfelület-minimum (mobil-first doktrína). */
const TOUCH = { minWidth: 44, minHeight: 44 } as const

export interface NaptarNyomtatvanyModalProps {
  open: boolean
  onClose: () => void
  cim: string
  alcim?: string | null
  ikon: ReactNode
  ariaLabel: string
  /** A kész nyomtatvány-HTML (null, amíg nincs adat). */
  html: string | null
  sheetCount: number
  filename: string
  orientation: 'portrait' | 'landscape'
  /** Adatbetöltés folyamatban — az előnézet helyén betöltő felirat. */
  betolt?: boolean
  betoltFelirat?: string
  /** Blokkoló hiba — az előnézet helyén, emberi üzenettel. */
  hiba?: string | null
  onUjra?: () => void
  /** Fejléc-kiegészítés (pl. év-léptető). */
  fejlecExtra?: ReactNode
  /** Opció-panel (változat, rétegek, szűrők, vezérige). */
  beallitasok?: ReactNode
  /** Nyomtatás/PDF előtt (pl. naplózás) — best-effort, nem blokkol. */
  onNyomtatasElott?: () => void
}

export function NaptarNyomtatvanyModal({
  open, onClose, cim, alcim, ikon, ariaLabel, html, sheetCount, filename, orientation,
  betolt, betoltFelirat, hiba, onUjra, fejlecExtra, beallitasok, onNyomtatasElott,
}: NaptarNyomtatvanyModalProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [boxW, setBoxW] = useState(0)
  const [boxH, setBoxH] = useState(0)
  const [zoomIdx, setZoomIdx] = useState(0)
  /** Az a HTML, amelynek TARTALMA igazoltan betöltött az iframe-be. */
  const [readyHtml, setReadyHtml] = useState<string | null>(null)
  const [frameHiba, setFrameHiba] = useState<string | null>(null)
  const [frameKulcs, setFrameKulcs] = useState(0)
  const [pdfFut, setPdfFut] = useState(false)
  const [rawPage, setRawPage] = useState(1)
  /** Mobilon a beállítás-panel alapból csukva (≥640 px-en mindig látszik). */
  const [beallitasokNyitva, setBeallitasokNyitva] = useState(false)

  const mutatElonezet = open && !!html && !betolt && !hiba
  const frameReady = !!html && readyHtml === html

  // ESC + görgetés-zár, amíg a modál nyitva van.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  // Az előnézeti doboz mérete (mindkét tengely) — a fit() ebből számol.
  useEffect(() => {
    if (!mutatElonezet) return
    const el = previewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r && r.width > 0) { setBoxW(Math.floor(r.width)); setBoxH(Math.floor(r.height)) }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mutatElonezet])

  const lap = A4_PX[orientation]
  const frameW = lap.w + 2 * BODY_PADDING
  const lapokSzama = Math.max(1, sheetCount)
  const contentH = 2 * BODY_PADDING + lapokSzama * lap.h + (lapokSzama - 1) * LAP_HEZAG
  // fit(): egy TELJES lap férjen el szélességben ÉS magasságban.
  const fitScale = boxW > 0 && boxH > 0
    ? Math.min(1, (boxW - 16) / frameW, (boxH - 16) / (lap.h + 2 * BODY_PADDING))
    : 1
  const scale = Math.min(MAX_SCALE, fitScale * NAGYITAS_SZORZOK[zoomIdx])
  const scaledW = Math.round(frameW * scale)
  const scaledH = Math.round(contentH * scale)
  const lapMagassag = (lap.h + LAP_HEZAG) * scale
  const currentPage = Math.min(Math.max(1, rawPage), lapokSzama)

  const onPreviewScroll = () => {
    const el = previewRef.current
    if (!el || lapokSzama <= 1 || lapMagassag <= 0) return
    const p = Math.floor((el.scrollTop - BODY_PADDING * scale + lapMagassag * 0.5) / lapMagassag) + 1
    setRawPage(Math.min(lapokSzama, Math.max(1, p)))
  }
  const lapUgras = (delta: number) => {
    const el = previewRef.current
    if (!el) return
    const cel = Math.min(lapokSzama, Math.max(1, currentPage + delta))
    el.scrollTo({ top: BODY_PADDING * scale + (cel - 1) * lapMagassag, behavior: 'smooth' })
    setRawPage(cel)
  }

  /**
   * Készenlét = a srcDoc TARTALMA áll az iframe-ben: van body-gyerek ÉS a
   * `.page` blokkok száma a várt lapszám. Az about:blank is „load"-ot ad —
   * azt NEM fogadjuk el (néma üres nyomtatás hibaosztálya).
   */
  const onFrameLoad = () => {
    const doc = iframeRef.current?.contentDocument
    const lapok = doc ? doc.querySelectorAll('.page').length : 0
    const vanTartalom = !!doc?.body && doc.body.childElementCount > 0
    if (vanTartalom && (sheetCount <= 0 || lapok === sheetCount)) {
      setReadyHtml(html)
      setFrameHiba(null)
    } else {
      setFrameHiba(`Az előnézet hiányosan töltött be (${lapok}/${sheetCount} lap) — kérlek, töltsd újra.`)
    }
  }
  const ujratolt = useCallback(() => { setFrameHiba(null); setFrameKulcs((k) => k + 1) }, [])

  const nemKesz = () => {
    toast.info(hiba ?? frameHiba ?? 'Az előnézet még töltődik — egy pillanat, és nyomtatható.')
  }
  /**
   * Nyomtatható-e MOST: nincs blokkoló hiba, nem tölt, és az előnézet tartalma
   * igazoltan áll. A `hiba`/`betolt` is kell: a hívó `html`-je egy KORÁBBI
   * (más évi) sikeres építés lehet — a hiba-kártya mögött az nem mehet papírra.
   */
  const nyomtathato = !hiba && !betolt && !!html && frameReady

  async function nyomtat() {
    if (!html || !nyomtathato) { nemKesz(); return }
    onNyomtatasElott?.()
    try {
      await printToBrowser(html)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A nyomtatás nem indítható el.')
    }
  }

  async function pdf() {
    if (!html || !nyomtathato) { nemKesz(); return }
    onNyomtatasElott?.()
    setPdfFut(true)
    try {
      await printToPdf(html, filename, { orientation, margin: [0, 0], format: 'a4' })
      toast.success(`${cim} — a PDF elkészült (${sheetCount} lap).`)
    } catch (e) {
      // HANGOS hiba + tartalék: ha a PDF-motor (pl. a html2pdf-csomag
      // betöltése offline) elhal, a böngésző nyomtató-ablaka még mindig
      // tud PDF-be menteni — nem hagyjuk a lelkészt üres kézzel.
      const uzenet = e instanceof Error ? e.message : 'ismeretlen hiba'
      toast.error(`A PDF mentése nem sikerült: ${uzenet} Helyette a böngésző nyomtató-ablakát nyitom meg — ott a „PDF-be mentés" is választható.`)
      try {
        await printToBrowser(html)
      } catch (e2) {
        toast.error(e2 instanceof Error ? e2.message : 'A tartalék nyomtatás sem indítható el.')
      }
    } finally {
      setPdfFut(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  const gombTilt = !nyomtathato || pdfFut

  return createPortal(
    <div className="kt-modal-overlay kt-eves-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {/* A méret a `.kt-eves-modal` osztályból jön (kartoteka.css) — EGY forrás, reszponzív. */}
      <div className="kt-eves-modal" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <div className="kt-eves-head">
          <div className="kt-modal-title">
            <span className="kt-modal-ico">{ikon}</span>
            <div className="min-w-0">
              <h3 className="truncate">{cim}</h3>
              {alcim ? <div className="kt-modal-sub hidden truncate sm:block">{alcim}</div> : null}
            </div>
          </div>
          <div className="kt-eves-actions">
            {fejlecExtra}
            {mutatElonezet ? (
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary p-0.5">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full text-foreground disabled:opacity-40"
                  style={TOUCH}
                  onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
                  disabled={zoomIdx === 0}
                  title="Kicsinyítés"
                  aria-label="Kicsinyítés"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="min-w-12 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full text-foreground disabled:opacity-40"
                  style={TOUCH}
                  onClick={() => setZoomIdx((i) => Math.min(NAGYITAS_SZORZOK.length - 1, i + 1))}
                  disabled={zoomIdx >= NAGYITAS_SZORZOK.length - 1 || scale >= MAX_SCALE}
                  title="Nagyítás"
                  aria-label="Nagyítás"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            ) : null}
            {mutatElonezet && lapokSzama > 1 ? (
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary p-0.5">
                <button type="button" className="inline-flex items-center justify-center rounded-full text-foreground disabled:opacity-40" style={TOUCH} onClick={() => lapUgras(-1)} disabled={currentPage <= 1} title="Előző lap" aria-label="Előző lap"><ChevronUp size={16} /></button>
                <span className="min-w-12 text-center text-xs font-semibold tabular-nums text-muted-foreground">{currentPage}/{lapokSzama}</span>
                <button type="button" className="inline-flex items-center justify-center rounded-full text-foreground disabled:opacity-40" style={TOUCH} onClick={() => lapUgras(1)} disabled={currentPage >= lapokSzama} title="Következő lap" aria-label="Következő lap"><ChevronDown size={16} /></button>
              </div>
            ) : null}
            {beallitasok ? (
              <button
                type="button"
                className="kt-iconbtn sm:hidden"
                style={TOUCH}
                onClick={() => setBeallitasokNyitva((v) => !v)}
                aria-expanded={beallitasokNyitva}
                title="Beállítások"
                aria-label="Beállítások"
              >
                <SlidersHorizontal size={16} />
              </button>
            ) : null}
            <button type="button" className="kt-btn kt-btn-outline" style={{ minHeight: 44 }} onClick={nyomtat} disabled={gombTilt} title="Nyomtatás">
              <Printer size={16} /> <span className="hidden sm:inline">Nyomtatás</span>
            </button>
            <button type="button" className="kt-btn kt-btn-outline" style={{ minHeight: 44 }} onClick={pdf} disabled={gombTilt} title="PDF mentés">
              {pdfFut ? <Loader2 size={16} className="kt-spin" /> : <Download size={16} />} <span className="hidden sm:inline">PDF mentés</span>
            </button>
            <button type="button" className="kt-modal-close" style={TOUCH} onClick={onClose} aria-label="Bezárás"><X size={18} /></button>
          </div>
        </div>

        {beallitasok ? (
          <div className={`${beallitasokNyitva ? 'flex' : 'hidden sm:flex'} shrink-0 flex-wrap items-start gap-x-6 gap-y-3 border-b border-border bg-secondary px-4 py-3`}>
            {beallitasok}
          </div>
        ) : null}

        <div className="kt-eves-body relative">
          {hiba ? (
            <div className="flex h-full flex-col items-center justify-center p-4">
              {/* Hiba-KÁRTYA: a szöveg itt marad (nem csak toast), Újratöltés gombbal;
                  a Nyomtatás/PDF addig tiltva — üres vagy más évi papír nem mehet ki. */}
              <div role="alert" className="flex max-w-xl flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-destructive">{hiba}</p>
                <p className="text-xs text-muted-foreground">A nyomtatás és a PDF-mentés a sikeres betöltésig nem elérhető.</p>
                {onUjra ? (
                  <button type="button" className="kt-btn kt-btn-outline" style={{ minHeight: 44 }} onClick={onUjra}>
                    <RefreshCw size={16} /> Újratöltés
                  </button>
                ) : null}
              </div>
            </div>
          ) : betolt || !html ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <Loader2 size={22} className="kt-spin" />
              <span>{betoltFelirat ?? 'A nyomtatvány készül…'}</span>
            </div>
          ) : (
            <div ref={previewRef} onScroll={onPreviewScroll} className="h-full w-full overflow-auto p-2">
              {frameHiba ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-destructive">
                  <span>{frameHiba}</span>
                  <button type="button" className="kt-btn-sm" style={{ minHeight: 44 }} onClick={ujratolt}><RefreshCw size={14} /> Újratöltés</button>
                </div>
              ) : null}
              <div className="relative mx-auto" style={{ width: scaledW, height: scaledH }}>
                <iframe
                  key={frameKulcs}
                  ref={iframeRef}
                  title={ariaLabel}
                  srcDoc={html}
                  sandbox="allow-same-origin"
                  onLoad={onFrameLoad}
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: frameW, height: contentH, border: 0,
                    transform: `scale(${scale})`, transformOrigin: 'top left',
                    background: 'transparent',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
