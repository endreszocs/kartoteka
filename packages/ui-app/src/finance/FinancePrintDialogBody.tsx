'use client'

/**
 * FinancePrintDialogBody — Pénzügyi nyomtatási központ TARTALMA
 * (Sprint Q F1, v0.7.5, 2026-04-25).
 *
 * 3-5 hivatalos nyomtatvány: Registru Casa, Registru Banca (bank-választóval),
 * Registrul-Jurnal, Nyugtatömb-kimutatás (éves), Kiadási kísérőív. Hónap/év
 * választóval, élő iframe-előnézettel, PDF mentés + direkt nyomtatás.
 *
 * ─── Platform-függetlenség (web + Tauri desktop + jövőbeli iOS) ───
 *
 * - Csak pure UI (react, ./types). Semmi shadcn / sonner / Supabase / Tauri
 *   import.
 * - A Dialog shell (open/close, modal-keret) a wrapper-ben marad —
 *   a sharedban csak a tartalom (header + szűrők + buttonok + iframe).
 * - A `report` HTML-t a wrapper építi (a `buildFinancePrintDocument`-tel),
 *   és prop-on át adja át. iOS-en saját report-builder lehetséges.
 * - A print callback-ek (`onPrintToBrowser`, `onPrintToPdf`) a platform
 *   speciális implementációját aktiválják.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { FinanceLoadingState } from './FinanceLoadingState'
import type {
  FinancePrintType,
  FinancePrintTypeMeta,
  NyugtatombReportRow,
  PrintReport,
  SavedDocOption,
} from './types'

// A4 méretek képpontban (96 dpi) + kis ráhagyás, hogy a mm-alapú lap biztosan
// elférjen az iframe-ben (különben belül vízszintes görgetősáv jelenne meg).
// 210mm≈794px, 297mm≈1123px — a ráhagyással a tartalom sosem lóg ki.
const A4_LANDSCAPE_W = 1140
const A4_PORTRAIT_W = 812
const PREVIEW_BOX_H = 820

const MONTHS_RO = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
] as const

export type FinancePrintToastKind = 'success' | 'error' | 'info' | 'warning'

export interface FinancePrintFilters {
  printType: FinancePrintType
  selectedYear: number
  selectedMonth: number | null
  selectedBankId: number | null
  nyugtatombok: NyugtatombReportRow[]
  /** Újranyomtatásnál a kiválasztott korábbi bizonylat (Decont / Dispoziție). */
  selectedDoc: SavedDocOption | null
  /** Költségvetés/számadás típusoknál a betöltött költségvetési sorok (a wrapper értelmezi). */
  budgetRows: Record<string, unknown> | null
  /** Csoportnaplónál a kiválasztott jogcím kódja (null = összes jogcím). */
  selectedCategoryKod: string | null
  /** 2026-07-10 (S5-#3): a KIVÁLASZTOTT év bevétel/kiadás sorai + nyitói, ha az
   *  eltér az oldal évétől (a wrapper értelmezi — mint a budgetRows).
   *  undefined = az oldal éve (a wrapper a saját propjait használja);
   *  null = még töltődik. */
  yearRecords?: unknown | null
  /** 2026-08-11 (6. kör): a részszámadás időszaka (ÉÉÉÉ-HH-NN). Minden más
   *  nyomtatványtípusnál null. Az évhatáron SOHA nem nyúlhat át — a builder
   *  fail-closed módon letiltja a nyomtatást. */
  periodFrom: string | null
  periodTo: string | null
}

export interface FinancePrintDialogBodyProps {
  /** A választható nyomtatványtípusok listája — pl. a webes oldali
   *  `FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv')`. */
  printableTypes: FinancePrintTypeMeta[]

  /** Bankszámlák listája — a Registru Banca választóhoz. */
  bankAccounts: { id: number; bank_neve: string; iban: string | null }[]

  /** Költségvetési jogcímek (számadási célok) — a Csoportnapló jogcím-választójához.
   *  Belső mozgások (3xx/4xx) nélkül, kód szerint rendezve ajánlott. */
  categories?: { kod: string; nev: string; type: 'B' | 'K' }[]

  /** Aktuális év (tipikusan `new Date().getFullYear()`). */
  currentYear: number

  /** A nyomtatvány HTML/title/filename — a wrapper hívja a builder-t és átadja. */
  buildReport: (filters: FinancePrintFilters) => PrintReport

  /** Nyugtatömb adatok lazy-load — csak nyugtatomb_kimutatas típusnál hívódik. */
  onLoadNyugtatombok?: (
    year: number,
  ) => Promise<{ data?: NyugtatombReportRow[]; error?: string | null }>

  /** Korábbi bizonylatok (Decont + Dispoziție) betöltése újranyomtatáshoz. */
  onLoadSavedDocs?: (year: number) => Promise<SavedDocOption[]>

  /** Költségvetési sorok betöltése (költségvetés/számadás típusokhoz). */
  onLoadBudgetRows?: (year: number) => Promise<Record<string, unknown>>

  /** 2026-07-10 (S5-#3): egy adott év bevétel/kiadás sorainak betöltése — akkor
   *  hívódik, ha a dialog évválasztója az oldal évétől ELTÉRŐ évre áll. Enélkül
   *  a múltbeli évek nyomtatványai üresek (az oldal csak a saját évét tartja
   *  memóriában). Az eredmény opakan megy vissza a buildReport filters-ébe. */
  onLoadYearRecords?: (year: number) => Promise<unknown>

  /** Direkt nyomtatás — a wrapper a webes print-engine-v2.printToBrowser-t hívja. */
  onPrintToBrowser?: (html: string) => Promise<void>

  /** PDF mentés — a wrapper a webes print-engine-v2.printToPdf-t hívja. */
  onPrintToPdf?: (
    html: string,
    filename: string,
    options?: { orientation?: 'portrait' | 'landscape'; margin?: number[]; format?: string },
  ) => Promise<void>

  /** UI-feedback (sonner / Tauri toast / iOS native banner). */
  onToast?: (msg: string, kind: FinancePrintToastKind) => void

  /** 2026-07-11 (S6-#2): a betöltő-állapot logója (web: '/kartoteka-icon.png'). */
  loadingLogoSrc?: string

  /** Bezárás (Dialog onOpenChange(false) hívás). */
  onClose: () => void

  /** A dialog épp nyitva van-e? — hatás az effect-ek triggereléséhez. */
  open: boolean
}

export function FinancePrintDialogBody({
  printableTypes,
  bankAccounts,
  categories = [],
  currentYear,
  buildReport,
  onLoadNyugtatombok,
  onLoadSavedDocs,
  onLoadBudgetRows,
  onLoadYearRecords,
  loadingLogoSrc,
  onPrintToBrowser,
  onPrintToPdf,
  onToast,
  onClose,
  open,
}: FinancePrintDialogBodyProps) {
  const [printType, setPrintType] = useState<FinancePrintType>('registru_casa')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    new Date().getMonth() + 1,
  )
  const [selectedBankId, setSelectedBankId] = useState<number | null>(
    bankAccounts[0]?.id ?? null,
  )
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [nyugtatombok, setNyugtatombok] = useState<NyugtatombReportRow[]>([])
  const [loadingNyugtatombok, setLoadingNyugtatombok] = useState(false)
  const [savedDocs, setSavedDocs] = useState<SavedDocOption[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [budgetRows, setBudgetRows] = useState<Record<string, unknown> | null>(null)
  /** Csoportnapló: a kiválasztott jogcím kódja ('' = mind). */
  const [selectedCategoryKod, setSelectedCategoryKod] = useState<string>('')
  /** 2026-07-10 (S5-#3): a NEM-folyó évhez betöltött bevétel/kiadás sorok (opak).
   *  2026-08-11 (6. kör): a payload mellé az ÉV is eltárolódik. Enélkül egy
   *  típus- vagy évváltás utáni ELSŐ renderben a MÁSIK év sorai kerültek volna
   *  a nyomtatványba (a törlő effect csak render UTÁN fut) — egy ilyen frame-ben
   *  a lelkész rossz számokkal ellátott előnézetet nyomtathatna ki. */
  const [yearRecords, setYearRecords] = useState<{ year: number; data: unknown } | null>(null)
  /** 2026-08-11 (6. kör): a részszámadás időszaka. */
  const [periodFrom, setPeriodFrom] = useState(`${currentYear}-01-01`)
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10))

  const isCsoportNaploMode = printType === 'csoport_naplo'
  const isReszszamadasMode = printType === 'reszszamadas'
  const isBudgetMode =
    printType === 'koltsegvetes' ||
    printType === 'koltsegvetes_modositas' ||
    printType === 'szamadas' ||
    // 2026-08-11 (6. kör): a részszámadásnak IS kellenek a költségvetési sorok
    // (a „Prevederi anuale / ÉVES költségvetés" oszlophoz).
    isReszszamadasMode
  const showBankSelector = printType === 'registru_banca'
  const isNyugtatombMode = printType === 'nyugtatomb_kimutatas'
  const reprintKind: 'decont' | 'dispozitie' | null =
    printType === 'decont_reprint' ? 'decont' : printType === 'dispozitie_reprint' ? 'dispozitie' : null
  const isReprintMode = reprintKind !== null
  const docList = useMemo(
    () => (reprintKind ? savedDocs.filter((d) => d.kind === reprintKind) : []),
    [savedDocs, reprintKind],
  )
  const selectedDoc = docList.find((d) => d.id === selectedDocId) ?? null

  // Korábbi bizonylatok betöltése (Decont + Dispoziție)
  useEffect(() => {
    if (!open || !isReprintMode || !onLoadSavedDocs) return
    let cancelled = false
    void onLoadSavedDocs(selectedYear).then((docs) => {
      if (!cancelled) setSavedDocs(docs)
    })
    return () => { cancelled = true }
  }, [open, isReprintMode, selectedYear, onLoadSavedDocs])

  // Auto-kiválasztás: az első bizonylat, ha a lista változott és nincs érvényes kiválasztás
  useEffect(() => {
    if (!isReprintMode) return
    if (!docList.some((d) => d.id === selectedDocId)) {
      setSelectedDocId(docList[0]?.id ?? null)
    }
  }, [docList, isReprintMode, selectedDocId])

  // Költségvetési sorok betöltése (költségvetés/számadás típusoknál)
  useEffect(() => {
    if (!open || !isBudgetMode || !onLoadBudgetRows) return
    let cancelled = false
    void onLoadBudgetRows(selectedYear).then((rows) => {
      if (!cancelled) setBudgetRows(rows)
    })
    return () => { cancelled = true }
  }, [open, isBudgetMode, selectedYear, onLoadBudgetRows])

  // 2026-07-10 (S5-#3): ha a dialog évválasztója az oldal évétől ELTÉRŐ évre áll,
  // a bevétel/kiadás sorokat AHHOZ az évhez töltjük be — eddig a memóriában lévő
  // (az oldal évére szűrt) sorokat szűrtük, így múltbeli évre minden üres volt.
  // 2026-08-11 (6. kör): a RÉSZSZÁMADÁS a folyó évben IS ezt az utat járja. Az
  // időszaki nyitó a SZÁMLÁNKÉNTI feloldott nyitóból vezetődik le, és csak a
  // szerver-oldali `getYearFinanceRecords` adja vissza azt (a `nyitoOk`
  // fail-closed jelzéssel együtt). A memóriában lévő props-nyitó nem elég.
  const needsYearRecords = selectedYear !== currentYear || isReszszamadasMode
  useEffect(() => {
    if (!open || !needsYearRecords || !onLoadYearRecords) return
    let cancelled = false
    setYearRecords(null)
    void onLoadYearRecords(selectedYear).then((recs) => {
      if (!cancelled) setYearRecords({ year: selectedYear, data: recs })
    })
    return () => { cancelled = true }
  }, [open, needsYearRecords, selectedYear, onLoadYearRecords])

  /** A betöltött sorok CSAK akkor használhatók, ha a KIVÁLASZTOTT évhez valók. */
  const yearRecordsForSelected =
    yearRecords && yearRecords.year === selectedYear ? yearRecords.data : null

  // Fit-to-width előnézet: a konténer szélességét mérjük, és a dokumentumot
  // (A4) lekicsinyítjük, hogy NE legyen oldalirányú görgetés.
  const previewRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  useEffect(() => {
    const el = previewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setBoxW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A TELJES dokumentum megjelenítése: az iframe tartalmának valódi magasságát
  // megmérjük (betöltéskor), így a (kicsinyített) lap teljesen látszik és
  // függőlegesen görgethető — pixelhűen ugyanaz, ami nyomtatáskor készül.
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [contentH, setContentH] = useState(PREVIEW_BOX_H)
  // ⚠️ „RACSNI"-CSAPDA (2026-08-14, 14+17. pont közös gyökéroka).
  //   Az iframe CSS-magassága ÉPPEN a contentH (lásd lentebb a style-t), a
  //   documentElement.scrollHeight pedig SOSEM kisebb az iframe viewportjánál.
  //   Naiv méréssel tehát h >= contentH MINDIG igaz, azaz a doboz csak nőni tud,
  //   zsugorodni soha. Egy 12 oldalas Registru (~13000px) után egy egyoldalas
  //   Decontra váltva a fehér lap-doboz 13000px magas maradt, a rövid dokumentum
  //   alatt több ezer pixel ÜRES fehér területtel — ez okozta egyszerre a
  //   „nincs előnézete" (17.) és az „üres részek az ablakban" (14.) panaszt.
  //   Megoldás (a repóban már bevált minta, filing/certificate-issue-dialog.tsx):
  //   a mérés ELŐTT nullázzuk az elem magasságát, így a scrollHeight a TARTALOM
  //   valódi magasságát adja vissza, nem a viewportét.
  const measurePreview = () => {
    const el = iframeRef.current
    const doc = el?.contentDocument
    if (!el || !doc) return
    const prevH = el.style.height
    el.style.height = '0px'
    // A scrollHeight olvasása kikényszeríti az újratördelést — a 0px már érvényes.
    const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0)
    el.style.height = prevH
    if (h > 0) setContentH(h)
  }

  // Nyugtatömb adatok lazy-load — csak amikor a felhasználó erre a típusra vált
  useEffect(() => {
    if (!open || !isNyugtatombMode || !onLoadNyugtatombok) return
    let cancelled = false
    setLoadingNyugtatombok(true)
    void onLoadNyugtatombok(selectedYear).then((res) => {
      if (cancelled) return
      setLoadingNyugtatombok(false)
      if (res.error) {
        onToast?.(`Nyugtatömb adatok betöltése sikertelen: ${res.error}`, 'error')
        setNyugtatombok([])
        return
      }
      setNyugtatombok(res.data || [])
    })
    return () => {
      cancelled = true
    }
  }, [open, isNyugtatombMode, selectedYear, onLoadNyugtatombok, onToast])

  const filters: FinancePrintFilters = useMemo(
    () => ({
      printType,
      selectedYear,
      selectedMonth,
      selectedBankId: showBankSelector ? selectedBankId : null,
      nyugtatombok: isNyugtatombMode ? nyugtatombok : [],
      selectedDoc: isReprintMode ? selectedDoc : null,
      budgetRows: isBudgetMode ? budgetRows : null,
      selectedCategoryKod: isCsoportNaploMode && selectedCategoryKod ? selectedCategoryKod : null,
      yearRecords: needsYearRecords ? yearRecordsForSelected : undefined,
      periodFrom: isReszszamadasMode ? periodFrom : null,
      periodTo: isReszszamadasMode ? periodTo : null,
    }),
    [printType, selectedYear, selectedMonth, selectedBankId, showBankSelector, isNyugtatombMode, nyugtatombok, isReprintMode, selectedDoc, isBudgetMode, budgetRows, isCsoportNaploMode, selectedCategoryKod, needsYearRecords, yearRecordsForSelected, isReszszamadasMode, periodFrom, periodTo],
  )

  const report = useMemo(() => buildReport(filters), [buildReport, filters])
  // 2026-08-11 (6. kör): fail-closed — ha a builder nem tud érvényes
  // nyomtatványt adni, a Nyomtatás és a PDF gomb LETILTVA marad.
  const blocked = report.blocked === true

  // 2026-08-14 (17. pont): dokumentumváltáskor (típus, év, hónap, szűrő — bármi,
  // ami új HTML-t ad) a doboz magassága alaphelyzetbe kerül (a friss mérést az
  // iframe onLoad hozza), és az előnézet VISSZAGÖRDÜL a dokumentum elejére.
  // E nélkül egy hosszú nyomtatvány aljáról egy egyoldalasra váltva a felhasználó
  // a fehérségbe nézett, és azt hitte, a dokumentumnak nincs előnézete.
  useEffect(() => {
    setContentH(PREVIEW_BOX_H)
    if (previewRef.current) previewRef.current.scrollTop = 0
  }, [report.html])

  // Az időszak-gyorsgombok. 44px-es érintőcél (min-h-11) — a régi ~22px-es
  // pillek telefonon használhatatlanok voltak.
  const periodPresets: { label: string; from: string; to: string }[] = useMemo(() => {
    const y = selectedYear
    const today = new Date().toISOString().slice(0, 10)
    const evElejeTol = y === currentYear ? today : `${y}-12-31`
    return [
      { label: 'I. negyedév', from: `${y}-01-01`, to: `${y}-03-31` },
      { label: 'II. negyedév', from: `${y}-04-01`, to: `${y}-06-30` },
      { label: 'III. negyedév', from: `${y}-07-01`, to: `${y}-09-30` },
      { label: 'IV. negyedév', from: `${y}-10-01`, to: `${y}-12-31` },
      { label: 'I. félév', from: `${y}-01-01`, to: `${y}-06-30` },
      { label: 'II. félév', from: `${y}-07-01`, to: `${y}-12-31` },
      { label: 'Év eleje → ma', from: `${y}-01-01`, to: evElejeTol },
    ]
  }, [selectedYear, currentYear])

  const docW = report.orientation === 'portrait' ? A4_PORTRAIT_W : A4_LANDSCAPE_W
  // A dokumentumot a konténernél kicsivel keskenyebbre méretezzük, hogy
  // legyen levegő a szélén (ne lógjon ki a széléig).
  const targetW = boxW > 0 ? Math.max(0, boxW - 24) : docW
  const fitScale = Math.min(1, targetW / docW)

  // ── 2026-08-14 (14. pont): NAGYÍTÁS + LAPLÉPTETÉS — telefonon a teljes
  // szélességre kicsinyített lap olvashatatlanul apró volt, és egy 10 oldalas
  // regiszterben csak vak görgetéssel lehetett tájékozódni.
  //  · A nagyítás a lapszélességhez igazított méret TÖBBSZÖRÖSE (a konténer
  //    vízszintesen görgethető, ha a lap kilóg); felső plafon 1,5× valós méret.
  //  · A lapszám a kész HTML .page blokkjaiból jön; az ugrás a lap-magasság
  //    egyenletes osztásával számol (a nyomtatványok lapjai azonos méretűek).
  const NAGYITAS_SZORZOK = [1, 1.5, 2, 3] as const
  const [zoomIdx, setZoomIdx] = useState(0)
  const scale = Math.min(1.5, fitScale * NAGYITAS_SZORZOK[zoomIdx])
  const scaledW = Math.round(docW * scale)
  const scaledH = Math.round(contentH * scale)

  const pageCount = useMemo(() => {
    const m = report.html.match(/class="page[\s"]/g)
    return m && m.length > 0 ? m.length : 1
  }, [report.html])
  // Nyers lapszám a görgetésből; a kijelzett érték lap-számra vágva — így
  // dokumentum-váltásnál (a scroll-reset után) nem kell effektben nullázni.
  const [rawPage, setRawPage] = useState(1)
  const currentPage = Math.min(rawPage, pageCount)
  const lapMagassag = pageCount > 0 ? scaledH / pageCount : scaledH

  const onPreviewScroll = () => {
    const el = previewRef.current
    if (!el || pageCount <= 1 || lapMagassag <= 0) return
    const p = Math.floor((el.scrollTop + lapMagassag * 0.5) / lapMagassag) + 1
    setRawPage(Math.min(pageCount, Math.max(1, p)))
  }

  const lapUgras = (delta: number) => {
    const el = previewRef.current
    if (!el) return
    const cel = Math.min(pageCount, Math.max(1, currentPage + delta))
    el.scrollTo({ top: (cel - 1) * lapMagassag, behavior: 'smooth' })
    setRawPage(cel)
  }

  async function handlePdf() {
    // Fail-closed, védőréteg a letiltott gomb MÖGÖTT is (2026-08-11).
    if (blocked) {
      onToast?.('Ez a nyomtatvány most nem adható ki — nézd meg az előnézetben, mi hiányzik.', 'error')
      return
    }
    if (!onPrintToPdf) {
      onToast?.('A PDF mentés nem érhető el ezen a felületen.', 'warning')
      return
    }
    setPrinting(true)
    try {
      await onPrintToPdf(report.html, report.filename, {
        // Margó 0: a margót a dokumentum .page paddingje (10mm) adja, így a PDF
        // ugyanazt a tartalom-szélességet kapja, mint az előnézet/nyomtatás (WYSIWYG).
        orientation: report.orientation,
        margin: [0, 0],
        format: 'a4',
      })
      onToast?.(`${report.title} PDF elkészült.`, 'success')
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.', 'error')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDirectPrint() {
    if (blocked) {
      onToast?.('Ez a nyomtatvány most nem adható ki — nézd meg az előnézetben, mi hiányzik.', 'error')
      return
    }
    if (!onPrintToBrowser) {
      onToast?.('A nyomtatás nem érhető el ezen a felületen.', 'warning')
      return
    }
    setSendingToPrinter(true)
    try {
      await onPrintToBrowser(report.html)
      onToast?.('Nyomtatási előnézet megnyílt.', 'success')
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : 'A nyomtatás nem sikerült.', 'error')
    } finally {
      setSendingToPrinter(false)
    }
  }

  return (
    <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* ── Bal oldal ──────────────────────────── */}
      <div className="space-y-4">
        {/* Típus választó — kompakt lista, hogy minden nyomtatvány elférjen */}
        <div className="card-raised space-y-2 p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700/70">
              Hivatalos nyomtatványok
            </p>
            <h3 className="font-heading text-lg text-slate-800">Válasszon formátumot</h3>
          </div>
          <div className="space-y-1">
            {printableTypes.map((type) => {
              const active = type.id === printType
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    // 2026-07-10 (S3 #1e): a Csoportnapló tipikus használata az ÉVES,
                    // jogcímenkénti lista — típusváltáskor alapból „Teljes év"-re
                    // állunk, mert az örökölt alapérték (folyó hónap) gyakran üres,
                    // és a felhasználó hibának látta az üres előnézetet.
                    if (type.id === 'csoport_naplo' && printType !== 'csoport_naplo') {
                      setSelectedMonth(null)
                    }
                    setPrintType(type.id)
                  }}
                  title={type.description}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
                    active
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[13px] font-semibold text-slate-800">{type.title}</span>
                  <span className="shrink-0 text-[10px] font-medium text-blue-700">{type.subtitle}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Szűrők */}
        <div className="card-raised space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Év
              <select
                value={selectedYear}
                onChange={(e) => {
                  const y = Number(e.target.value)
                  setSelectedYear(y)
                  // 2026-08-11 (6. kör): a részszámadás időszaka KÖVETI az évet.
                  // Enélkül a 2026-os időszak maradna a 2025-ös éven — a builder
                  // ezt letiltja, de a lelkész csak egy hibát látna, ok nélkül.
                  setPeriodFrom(`${y}-01-01`)
                  setPeriodTo(
                    y === currentYear ? new Date().toISOString().slice(0, 10) : `${y}-12-31`,
                  )
                }}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Hónap
              <select
                value={selectedMonth ?? ''}
                onChange={(e) =>
                  setSelectedMonth(e.target.value === '' ? null : Number(e.target.value))
                }
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isNyugtatombMode || isReprintMode || isBudgetMode}
                title={
                  isNyugtatombMode || isReprintMode || isBudgetMode ? 'Ennél a nézetnél nincs hónap-szűrés.' : undefined
                }
              >
                <option value="">Teljes év</option>
                {MONTHS_RO.map((name, i) => (
                  <option key={i} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* ── Részszámadás: időszak (2026-08-11, 6. kör) ─────────────── */}
          {isReszszamadasMode && (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                A részszámadás időszaka
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-700">
                  Kezdő dátum
                  <input
                    type="date"
                    value={periodFrom}
                    onChange={(e) => setPeriodFrom(e.target.value)}
                    min={`${selectedYear}-01-01`}
                    max={`${selectedYear}-12-31`}
                    className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Záró dátum
                  <input
                    type="date"
                    value={periodTo}
                    onChange={(e) => setPeriodTo(e.target.value)}
                    min={periodFrom}
                    max={`${selectedYear}-12-31`}
                    className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {periodPresets.map((p) => {
                  const active = p.from === periodFrom && p.to === periodTo
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setPeriodFrom(p.from)
                        setPeriodTo(p.to)
                      }}
                      aria-pressed={active}
                      className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-medium transition ${
                        active
                          ? 'border-amber-500 bg-amber-100 text-amber-900'
                          : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] leading-snug text-amber-800/90">
                A részszámadás <strong>egy naptári éven belüli</strong> időszakra készül. Ha az
                elszámolás átnyúlik az évhatáron, nyomtass két részszámadást — a második nyitója
                pontosan az első zárója lesz.
              </p>
              <p className="text-[11px] leading-snug text-amber-800/90">
                Ez <strong>belső kimutatás</strong> (presbiteri ülés, vizitáció). Az éves
                zárszámadás helyett <strong>nem küldhető be</strong> az egyházmegyének.
              </p>
            </div>
          )}

          {/* Bank választó */}
          {showBankSelector && bankAccounts.length > 0 && (
            <label className="block text-sm font-medium text-slate-700">
              Bankszámla
              <select
                value={selectedBankId || ''}
                onChange={(e) => setSelectedBankId(Number(e.target.value) || null)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_neve}
                    {b.iban ? ` (${b.iban})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Korábbi bizonylat választó (újranyomtatás) */}
          {isReprintMode && (
            <label className="block text-sm font-medium text-slate-700">
              Bizonylat
              {docList.length === 0 ? (
                <p className="mt-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400">
                  Nincs mentett {reprintKind === 'decont' ? 'decont' : 'dispoziție'} ebben az évben.
                </p>
              ) : (
                <select
                  value={selectedDocId ?? ''}
                  onChange={(e) => setSelectedDocId(e.target.value || null)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  {docList.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              )}
            </label>
          )}

          {/* 2026-07-10 (S3 #1e): ha a jogcím-lista üresen érkezik (adathiba /
              wrapper-hiány), NE tűnjön el némán a választó — magyarázó szöveg. */}
          {isCsoportNaploMode && categories.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400">
              A jogcím-lista nem érhető el — a nyomtatvány az összes jogcímet tartalmazza.
            </p>
          )}

          {/* Csoportnapló — jogcím-választó: a kiválasztott jogcím összes tétele az adott évben */}
          {isCsoportNaploMode && categories.length > 0 && (
            <label className="block text-sm font-medium text-slate-700">
              Költségvetési jogcím
              <select
                value={selectedCategoryKod}
                onChange={(e) => setSelectedCategoryKod(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Mind — összes jogcím</option>
                <optgroup label="Bevételek">
                  {categories
                    .filter((c) => c.type === 'B')
                    .map((c) => (
                      <option key={`B-${c.kod}`} value={c.kod}>
                        {c.kod} — {c.nev}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Kiadások">
                  {categories
                    .filter((c) => c.type === 'K')
                    .map((c) => (
                      <option key={`K-${c.kod}`} value={c.kod}>
                        {c.kod} — {c.nev}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Időszak:</span>{' '}
              {isReszszamadasMode
                ? `${periodFrom} — ${periodTo}`
                : isNyugtatombMode || isReprintMode || isBudgetMode
                  ? `${selectedYear}. év`
                  : selectedMonth
                    ? `${MONTHS_RO[selectedMonth - 1]} ${selectedYear}`
                    : `${selectedYear}. teljes év`}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Tájolás:</span>{' '}
              {report.orientation === 'portrait' ? 'A4 álló' : 'A4 fekvő'}
            </div>
            {showBankSelector && selectedBankId && (
              <div>
                <span className="font-semibold text-slate-800">Bank:</span>{' '}
                {bankAccounts.find((b) => b.id === selectedBankId)?.bank_neve}
              </div>
            )}
            {/* 2026-07-10 (S3 #1e): a kiválasztott jogcím visszajelzése */}
            {isCsoportNaploMode && (
              <div>
                <span className="font-semibold text-slate-800">Jogcím:</span>{' '}
                {selectedCategoryKod
                  ? `${selectedCategoryKod} — ${categories.find((c) => c.kod === selectedCategoryKod)?.nev ?? ''}`
                  : 'Mind — összes jogcím'}
              </div>
            )}
            {isNyugtatombMode && (
              <div className="mt-1 text-xs text-blue-700">
                {loadingNyugtatombok
                  ? 'Tömbök betöltése...'
                  : `${nyugtatombok.length} tömb az adott évben`}
              </div>
            )}
          </div>

          {/* 2026-08-11 (6. kör): fail-closed — a letiltás OKÁT is kiírjuk,
              különben a lelkész csak egy szürke gombot lát. */}
          {blocked && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-800"
            >
              Ez a nyomtatvány most <strong>nem adható ki</strong> — az előnézetben látod, mi
              hiányzik. A rendszer inkább nem nyomtat, mint hogy hamis számot írjon aláírandó
              papírra.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Bezárás
            </button>
            <button
              type="button"
              onClick={() => void handleDirectPrint()}
              disabled={sendingToPrinter || blocked}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white rounded-md transition-colors disabled:opacity-50 hover:bg-slate-50"
            >
              {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
            </button>
            <button
              type="button"
              onClick={() => void handlePdf()}
              disabled={printing || blocked}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {printing ? 'PDF készül...' : 'PDF-be mentés'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Jobb oldal: élő előnézet (teljes szélességre kicsinyítve) ── */}
      <div className="space-y-2">
        {/* Előnézet-vezérlők (2026-08-14, 14. pont): nagyítás + lapléptetés —
            44px-es érintőcélok, telefonon is használható. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              disabled={zoomIdx === 0}
              title="Kicsinyítés"
              aria-label="Kicsinyítés"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-14 text-center text-xs font-semibold tabular-nums text-slate-600">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomIdx((i) => Math.min(NAGYITAS_SZORZOK.length - 1, i + 1))}
              disabled={zoomIdx >= NAGYITAS_SZORZOK.length - 1 || scale >= 1.5}
              title="Nagyítás"
              aria-label="Nagyítás"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              +
            </button>
            {zoomIdx > 0 && (
              <button
                type="button"
                onClick={() => setZoomIdx(0)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Lapszélesség
              </button>
            )}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => lapUgras(-1)}
                disabled={currentPage <= 1}
                title="Előző oldal"
                aria-label="Előző oldal"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                ‹
              </button>
              <span className="text-xs font-semibold tabular-nums text-slate-600">
                {currentPage} / {pageCount}. oldal
              </span>
              <button
                type="button"
                onClick={() => lapUgras(1)}
                disabled={currentPage >= pageCount}
                title="Következő oldal"
                aria-label="Következő oldal"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          )}
        </div>
      <div
        ref={previewRef}
        onScroll={onPreviewScroll}
        className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
        style={{ maxHeight: PREVIEW_BOX_H + 40 }}
      >
        {/* 2026-07-11 (S6-#2): amíg a NEM-folyó év tételei töltődnek, a szép
            logós betöltő látszik az üres/fehér előnézet helyett. */}
        {needsYearRecords && yearRecordsForSelected == null && onLoadYearRecords ? (
          <FinanceLoadingState
            label={`A(z) ${selectedYear}. évi adatok betöltése…`}
            logoSrc={loadingLogoSrc}
          />
        ) : (
        <div className="mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" style={{ width: scaledW, height: scaledH }}>
          <iframe
            ref={iframeRef}
            onLoad={measurePreview}
            title={report.title}
            srcDoc={report.html}
            style={{
              width: docW,
              height: contentH,
              border: '0',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              background: '#fff',
            }}
          />
        </div>
        )}
      </div>
      </div>
    </div>
  )
}
