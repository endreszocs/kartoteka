'use client'

/**
 * BudgetPrintDialogBody — Költségvetés / számadás nyomtatási központ
 * (Sprint Q F1, v0.7.5, 2026-04-25).
 *
 * 3 nyomtatványtípus: költségvetés (terv), költségvetés-módosítás, számadás
 * (tény vs terv). Élő iframe-előnézet, PDF mentés + direkt nyomtatás.
 *
 * 2026-08-11 (6. kör): a RÉSZSZÁMADÁS INNEN KIKERÜLT, és a „Pénzügyi nyomtatási
 * központba" (FinancePrintDialog) költözött. Ebből a dialógusból hiányzott
 * minden bemenet, amiből a részszámadás helyes számot tudna adni: nincs
 * év-scope-olt tétel-betöltés (a props a MEGNYITÓ OLDAL évét hozza), nincs
 * SZÁMLÁNKÉNTI feloldott nyitó, és a `deleted` sem volt szűrve. Mindegyik
 * hiány külön hamis-szám generátor volt egy aláírható papíron.
 *
 * ─── Platform-függetlenség (web + Tauri desktop + jövőbeli iOS) ───
 *
 * - Csak pure UI (react, ./types). Nincs shadcn / sonner / Supabase / Tauri.
 * - A Dialog shell a wrapper-ben marad — itt csak a tartalom van.
 * - A költségvetés-sorok (`BudgetCompatRow`) lazy-load-ja callback-en
 *   (`onLoadBudgetRows(year)`) — a wrapper a Supabase klienst használja.
 * - A `report` HTML-t a wrapper építi (`buildBudgetPrintDocument`-tel),
 *   és a `buildReport(filters)` callback-en át adja át.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { BudgetPrintType, BudgetPrintTypeMeta, PrintReport } from './types'
// 2026-08-22 (8. pont): a betöltés NÉGYÁGÚ állapotának tiszta magja. Külön,
// import-mentes modul, hogy az őrszem (scripts/selftest-print-betoltes.mjs)
// render-fa nélkül tesztelhesse.
import {
  BETOLTES_TOLT,
  budgetBetoltesUzenet,
  derivalBetoltesAllapot,
  hibaAllapotbol,
  nyomtatasTiltva,
  type PrintBetoltesAllapot,
} from './print-loading-core'

export type BudgetPrintToastKind = 'success' | 'error' | 'info' | 'warning'

/**
 * A költségvetés-sorok kompatibilis formátuma — a webes
 * `lib/finance/budget-compat.ts`-ben definiált `BudgetCompatRow`-val
 * megegyező alak.
 */
export interface BudgetPrintCompatRow {
  szamadasicelid: string
  tervezett: number
  modositott: number | null
  mod2: number | null
  mod3: number | null
}

export interface BudgetPrintFilters {
  printType: BudgetPrintType
  selectedYear: number
  budgetRows: Record<string, BudgetPrintCompatRow>
  actualIncome: Record<string, number>
  actualExpense: Record<string, number>
}

export interface BudgetPrintDialogBodyProps {
  /** A választható nyomtatványtípusok listája. */
  printableTypes: BudgetPrintTypeMeta[]

  /** Aktuális év. */
  currentYear: number

  /** A jelenlegi évi költségvetés véglegesítve van-e — UI infodobozhoz. */
  budgetFinalized: boolean

  /** A jelenlegi évi számadás véglegesítve van-e (számadás/részszámadás típushoz). */
  accountingFinalized?: boolean

  /** Tényleges bevétel/kiadás aggregálás callback-en — a wrapper a webes
   *  income/expense rekordokon számol.
   *  2026-08-11 (6. kör): a `printType` / `periodFrom` / `periodTo` paraméterek
   *  ELTŰNTEK — kizárólag a részszámadás időszak-szűréséhez kellettek, az pedig
   *  átkerült a Pénzügyi nyomtatási központba. Itt minden típus a TELJES év
   *  tényadatával dolgozik. */
  computeActuals: () => {
    actualIncome: Record<string, number>
    actualExpense: Record<string, number>
  }

  /** Költségvetési sorok lazy-load — a wrapper a Supabase klienssel hívja a
   *  `loadBudgetRowsCompat`-ot. */
  onLoadBudgetRows: (
    year: number,
  ) => Promise<{ data?: BudgetPrintCompatRow[]; error?: string | null }>

  /** A kiválasztott típus + év + időszak alapján HTML+meta nyomtatványt épít. */
  buildReport: (filters: BudgetPrintFilters) => PrintReport

  /** Direkt nyomtatás. */
  onPrintToBrowser?: (html: string) => Promise<void>

  /** PDF mentés. */
  onPrintToPdf?: (
    html: string,
    filename: string,
    options?: { orientation?: 'portrait' | 'landscape'; margin?: number[]; format?: string },
  ) => Promise<void>

  /** UI-feedback. */
  onToast?: (msg: string, kind: BudgetPrintToastKind) => void

  /** Bezárás. */
  onClose: () => void

  /** A dialog épp nyitva van-e? */
  open: boolean
}

/** 2026-08-11 (6. kör, P0 #4): hiba-előnézet év-keveredés esetén. */
function yearMismatchPreview(year: number): PrintReport {
  return {
    title: `Számadás ${year}`,
    filename: `Szamadas_${year}.pdf`,
    orientation: 'portrait',
    blocked: true,
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
      .box{max-width:620px;margin:8vh auto;border:2px solid #111;border-radius:10px;padding:24px}
      h1{font-size:17px;margin:0 0 10px}
      p{font-size:14px;line-height:1.65;margin:0 0 10px}
    </style></head><body><div class="box">
      <h1>A ${year}. évi számadás itt nem nyomtatható</h1>
      <p>Ez az ablak csak a folyó év tényadatait ismeri: a(z) ${year}. évi <strong>tervet</strong>
      betöltötte, de a <strong>tényadatot és a nyitó egyenleget</strong> nem — a nyomtatvány így a
      ${year}. évi tervet a folyó év tényeivel keverné.</p>
      <p>A korábbi évek számadását a <strong>Pénzügy → Nyomtatási központban</strong> nyomtasd:
      ott a rendszer az adott év tételeit is betölti.</p>
    </div></body></html>`,
  }
}

export function BudgetPrintDialogBody({
  printableTypes,
  currentYear,
  budgetFinalized,
  accountingFinalized = false,
  computeActuals,
  onLoadBudgetRows,
  buildReport,
  onPrintToBrowser,
  onPrintToPdf,
  onToast,
  onClose,
  open,
}: BudgetPrintDialogBodyProps) {
  const [printType, setPrintType] = useState<BudgetPrintType>('koltsegvetes')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [budgetRows, setBudgetRows] = useState<Record<string, BudgetPrintCompatRow>>({})
  // 2026-08-22 (8. pont): a `loading: boolean` HELYETT négyágú, diszkriminált
  // állapot (tölt / kész / üres / hiba). Lásd `print-loading-core.ts`.
  const [betoltes, setBetoltes] = useState<PrintBetoltesAllapot>(BETOLTES_TOLT)
  /** Az „Újrapróbálom" gomb léptetője — az effect DEPJE. */
  const [ujratoltoKulcs, setUjratoltoKulcs] = useState(0)

  // ── 2026-08-22 (8. pont): ÖV ÉS NADRÁGSZÍJ a végtelen hurok ellen ─────────
  //
  // MI VOLT A ROSSZ: a lenti betöltő-effect a deps közt figyelte az `onToast`
  // FÜGGVÉNY-REFERENCIÁT is. A webes wrapper viszont INLINE nyíl-függvényként
  // adta át (budget-print-dialog.tsx), tehát minden renderben ÚJ identitást
  // kapott — a wrapper pedig a betöltő callback-jében a SAJÁT state-jét írta
  // (`setEvBeallitas`). A kör: betöltés → wrapper-state → új render → új
  // `onToast` → az effect ÚJRA fut → új lekérés → … Ez a „villog az Adatok
  // betöltése… felirat" panasz gyökere, és közben végtelen hálózati kérés ment.
  //
  // A wrapper `useCallback`-je önmagában megoldaná, de ez a Body KÖZÖS (web +
  // desktop + jövőbeli iOS): egyetlen hanyag wrapper visszahozná a hurkot. A
  // desktop `penzugy-page.tsx` ma is inline `onToast`-ot ad, ami page-state-et
  // ír (`setPageToast`) — ott a HIBA-ág zárt volna ugyanilyen kört. Ezért az
  // `onToast` REF-be tükrözve él, és NEM szerepel az effect deps között.
  // ⛔ NE tedd vissza a deps közé: azzal a hurok azonnal visszaáll.
  const onToastRef = useRef(onToast)
  useEffect(() => {
    onToastRef.current = onToast
  })

  // ── 2026-08-11 (6. kör, P0 #4) — ÉV-KEVEREDÉS FAIL-CLOSED KAPU ──────────
  // Az évválasztó 8 évet kínál, de CSAK a TERV sorok töltődnek újra: a
  // tényadat és a nyitó a MEGNYITÓ OLDAL évéből jön propon. 2024-et választva
  // a 2024-es terv a 2026-os TÉNNYEL nyomtatódott — aláírt éves Számadáson.
  // Amíg ez a dialógus nem tölt év-scope-olt tételt, a korábbi évek számadása
  // itt NEM nyomtatható; a Pénzügy → Nyomtatási központ tudja helyesen.
  const isSzamadas = printType === 'szamadas'
  const yearMismatch = isSzamadas && selectedYear !== currentYear

  // Budget adatok betöltése a kiválasztott évre.
  // 2026-08-22 (8. pont): `onToast` NINCS a deps között (ref-en át hívjuk),
  // és a `.then()` mellett KÖTELEZŐ `.catch()` áll — enélkül egy elutasított
  // promise-nál a „tölt" állapot örökre bent ragadt volna.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setBetoltes(BETOLTES_TOLT)
    void onLoadBudgetRows(selectedYear)
      .then((res) => {
        if (cancelled) return
        const allapot = derivalBetoltesAllapot(res)
        setBetoltes(allapot)
        if (allapot.fazis === 'hiba') {
          onToastRef.current?.(
            `Költségvetési sorok betöltése sikertelen: ${allapot.uzenet}`,
            'error',
          )
          setBudgetRows({})
          return
        }
        const map: Record<string, BudgetPrintCompatRow> = {}
        ;(res.data || []).forEach((r) => {
          map[r.szamadasicelid] = r
        })
        setBudgetRows(map)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const allapot = hibaAllapotbol(err)
        setBetoltes(allapot)
        setBudgetRows({})
        onToastRef.current?.(
          `Költségvetési sorok betöltése sikertelen: ${allapot.uzenet}`,
          'error',
        )
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedYear, onLoadBudgetRows, ujratoltoKulcs])

  /** FAIL-CLOSED: tölt ÉS hiba állapotban sem adható ki nyomtatvány. */
  const betoltesTilt = nyomtatasTiltva(betoltes)

  // Tényleges adatok aggregálása szamadasicel kódonként — a wrapper számol
  const actualData = useMemo(() => computeActuals(), [computeActuals])

  const filters: BudgetPrintFilters = useMemo(
    () => ({
      printType,
      selectedYear,
      budgetRows,
      actualIncome: actualData.actualIncome,
      actualExpense: actualData.actualExpense,
    }),
    [printType, selectedYear, budgetRows, actualData],
  )

  const report = useMemo(
    () => (yearMismatch ? yearMismatchPreview(selectedYear) : buildReport(filters)),
    [buildReport, filters, yearMismatch, selectedYear],
  )

  async function handlePdf() {
    // 2026-08-22 (8. pont): fail-closed védőréteg a LETILTOTT gomb mögött is —
    // a `FinancePrintDialogBody` `blocked`-kapujának tükre.
    if (betoltesTilt) {
      onToastRef.current?.(
        budgetBetoltesUzenet(betoltes, selectedYear),
        betoltes.fazis === 'hiba' ? 'error' : 'info',
      )
      return
    }
    if (!onPrintToPdf) {
      onToast?.('A PDF mentés nem érhető el ezen a felületen.', 'warning')
      return
    }
    setPrinting(true)
    try {
      await onPrintToPdf(report.html, report.filename, {
        orientation: report.orientation,
        margin: [10, 8],
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
    if (betoltesTilt) {
      onToastRef.current?.(
        budgetBetoltesUzenet(betoltes, selectedYear),
        betoltes.fazis === 'hiba' ? 'error' : 'info',
      )
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
      {/* Bal oldal */}
      <div className="space-y-4">
        <div className="card-raised space-y-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700/70">
              Hivatalos nyomtatványok
            </p>
            <h3 className="font-heading text-xl text-slate-800">Válasszon formátumot</h3>
          </div>
          <div className="space-y-2">
            {printableTypes.map((type) => {
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
          <label className="block text-sm font-medium text-slate-700">
            Év
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          {/* 2026-08-11 (6. kör, P0 #4): év-keveredés — hangos, blokkoló figyelmeztetés.
              A számadás tényadata NEM töltődik újra évváltáskor ebben az ablakban. */}
          {yearMismatch && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-800"
            >
              A(z) <strong>{selectedYear}. évi számadás itt nem nyomtatható</strong>: ez az ablak
              csak a folyó év tényadatait ismeri, így a régebbi év tervét a mostani év tényeivel
              keverné. Nyomtasd a <strong>Pénzügy → Nyomtatási központból</strong> — ott a
              rendszer az adott év tételeit is betölti.
            </div>
          )}

          <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 space-y-1">
            <div>
              <span className="font-semibold text-slate-800">Típus:</span>{' '}
              {printableTypes.find((t) => t.id === printType)?.title}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Év:</span> {selectedYear}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Tájolás:</span> A4 álló
            </div>
            <div>
              <span className="font-semibold text-slate-800">Véglegesítve:</span>{' '}
              {(isSzamadas ? accountingFinalized : budgetFinalized) ? 'Igen' : 'Nem'}
            </div>
            {/* 2026-08-22 (8. pont): NÉGYÁGÚ visszajelzés a néma kétállapotú
                felirat helyett. A „tölt" és a „kész" a panelen belül fut, az
                „üres" és a „hiba" külön, hangos dobozt kap lentebb. */}
            {betoltes.fazis === 'tolt' && (
              <div className="text-xs text-amber-600">{budgetBetoltesUzenet(betoltes, selectedYear)}</div>
            )}
            {betoltes.fazis === 'kesz' && (
              <div className="text-xs text-slate-500">{budgetBetoltesUzenet(betoltes, selectedYear)}</div>
            )}
          </div>

          {/* ÜRES: nem hiba — a nyomtatvány elkészül, csak minden terv-oszlopa
              nulla lesz. A lelkész eddig ezt SEMMIBŐL nem tudta meg. */}
          {betoltes.fazis === 'ures' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              {budgetBetoltesUzenet(betoltes, selectedYear)}
            </div>
          )}

          {/* HIBA: hangos, tiltó, ÚJRAPRÓBÁLHATÓ. A gombok is le vannak tiltva
              (`betoltesTilt`) — hibás betöltés után eddig ki lehetett nyomtatni
              egy üres terv-oszlopú, mégis aláírható hivatalos ívet. */}
          {betoltes.fazis === 'hiba' && (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-800"
            >
              <p>{budgetBetoltesUzenet(betoltes, selectedYear)}</p>
              <p>
                A nyomtatás és a PDF-mentés addig <strong>letiltva marad</strong>, amíg az adatok
                meg nem jönnek — üres terv-oszlopú hivatalos ív nem kerülhet ki.
              </p>
              <button
                type="button"
                onClick={() => setUjratoltoKulcs((k) => k + 1)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-red-400 bg-white px-3 text-xs font-semibold text-red-800 transition-colors hover:bg-red-100"
              >
                Újrapróbálom
              </button>
            </div>
          )}

          {!(isSzamadas ? accountingFinalized : budgetFinalized) && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Ez a dokumentum <strong>még nincs véglegesítve</strong>. A presbitériumi határozat
              (mikor, melyik ülésen, milyen szám alatt) és az <strong>egyházközségi iktatószám</strong>
              {' '}csak a véglegesítés után kerül rá a nyomtatványra.
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
              disabled={sendingToPrinter || betoltesTilt || yearMismatch}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white rounded-md transition-colors disabled:opacity-50 hover:bg-slate-50"
            >
              {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
            </button>
            <button
              type="button"
              onClick={() => void handlePdf()}
              disabled={printing || betoltesTilt}
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {printing ? 'PDF készül...' : 'PDF-be mentés'}
            </button>
          </div>
        </div>
      </div>

      {/* Jobb oldal: élő előnézet */}
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
  )
}
