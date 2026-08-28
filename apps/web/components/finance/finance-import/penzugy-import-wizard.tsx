'use client'

/**
 * Pénzügyi import wizard — fő orchestrator komponens.
 *
 * **Egyszerűsített 3 lépéses wizard** (átdolgozott v2):
 *   1. welcome   — Üdvözlő + fájl-feltöltés
 *   2. review    — Áttekintés + megfeleltetés + ambiguous + import gomb
 *      (közben: importing — progress bar)
 *   3. result    — Eredmény + cég-lista + hibák
 *
 * A korábbi 9-lépéses verziót egyetlen, hosszú "review" lépéssé olvasztottuk
 * össze, ami egyszerre mutatja a klasszifikációt, kódfeloldást, befizető-
 * azonosítást, Monetar diagnosztikát és a végleges importálandó listát.
 *
 * 2026-05-03 (átdolgozott v2 — felhasználói visszajelzés alapján).
 */

import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  parseAndPreviewFinance,
  parseXmlReference,
  analyzeKasszaRows,
  resolveBudgetCodes,
  resolveDonors,
  getMonetarDiagnostic,
  executeFinanceImport,
  listBankszamlakForImport,
} from '@/app/(dashboard)/penzugy/finance-import-actions'
import { upsertBankszamlaNyitoEgyenleg } from '@/app/(dashboard)/penzugy/bank-nyito-egyenleg-actions'
import type {
  KasszaAnalysisResult,
  BudgetCodeResolution,
  DonorResolution,
  FinanceImportResult,
  FinanceSheetPreview,
  BankszamlaOption,
  ClassifiedKasszaRow,
} from '@/app/(dashboard)/penzugy/finance-import-types'

import { WelcomeStep } from './steps/welcome-step'
import { MultiSourceMapStep } from './steps/multi-source-map-step'
import { ReviewStep } from './steps/review-step'
import { ImportingStep } from './steps/importing-step'
import { ResultStep } from './steps/result-step'
import { ImportTotalsPanel, type SheetTotals } from './steps/import-totals-panel'
import { BalanceSummaryCard } from './steps/balance-summary-card'
import { InternalMovementsPanel } from './steps/internal-movements-panel'
import { ColumnMappingPanel } from './steps/column-mapping-panel'
import { WizardSteps } from './steps/wizard-steps'
import { buildFinanceImportItems } from './helpers/item-builder'
import { looksLikeInternalMovement } from './helpers/kassza-row-classifier'
import { applyXmlOverlay } from './helpers/xml-overlay'
import { distributeAmbiguousDonors } from './helpers/donor-distribution'
import type { MonetarDiagnostic } from './helpers/monetar-diagnostic'

type WizardStage = 'welcome' | 'source' | 'review' | 'importing' | 'result'

/** Egy beimportálandó főkönyvi forrás (Kassza vagy egy bankszámla-lap). */
type LedgerUnit = {
  sheetName: string
  /** null = Kassza (készpénz); szám = bankszámla id. */
  bankszamlaId: number | null
  label: string
  opening: number | null
  closing: number | null
  headers: string[]
}

export function PenzugyImportWizard({
  onImported,
}: {
  /** P3-9 (audit 2026-08-28): sikeres import után a hívó frissíti a listáit. */
  onImported?: () => void
} = {}) {
  const [stage, setStage] = useState<WizardStage>('welcome')
  const [file, setFile] = useState<File | null>(null)
  // Opcionális bevételek-XML referencia (Befizetett év + hivatalos iratszám).
  const [xmlFile, setXmlFile] = useState<File | null>(null)
  // Több-forrású (kötegelt) import: a fájl főkönyvi lapjai + a bank-lap→bankszámla map.
  const [ledgerSheets, setLedgerSheets] = useState<FinanceSheetPreview[]>([])
  const [bankszamlak, setBankszamlak] = useState<BankszamlaOption[]>([])
  const [sheetBankMap, setSheetBankMap] = useState<Record<string, number | null>>({})
  // A ténylegesen beolvasott források (Kassza + a hozzárendelt bankszámlák).
  const [units, setUnits] = useState<LedgerUnit[]>([])
  // A Kassza-lap fejlécei az oszlop-egyeztetés ellenőrző paneljéhez.
  const [kasszaHeaders, setKasszaHeaders] = useState<string[]>([])

  // Review-step adatai
  const [kasszaAnalysis, setKasszaAnalysis] = useState<KasszaAnalysisResult | null>(null)
  const [budgetCodeResolutions, setBudgetCodeResolutions] = useState<
    BudgetCodeResolution[] | null
  >(null)
  const [donorResolutions, setDonorResolutions] = useState<DonorResolution[] | null>(null)
  const [monetarDiagnostic, setMonetarDiagnostic] = useState<MonetarDiagnostic | null>(null)

  // Felhasználói döntések
  const [skippedCodes, setSkippedCodes] = useState<Set<string>>(new Set())
  const [manualPersonSelections, setManualPersonSelections] = useState<
    Record<string, string>
  >({})
  // B1 (1×/év): mely ambiguous befizetők lettek automatikusan elosztva (UI jelzi).
  const [autoDistributedDonors, setAutoDistributedDonors] = useState<Set<string>>(new Set())

  // Eredmény
  const [importResult, setImportResult] = useState<FinanceImportResult | null>(null)

  // Transition flags
  const [isParsing, startParsing] = useTransition()
  const [isLoadingReview, startLoadingReview] = useTransition()
  const [isImporting, startImporting] = useTransition()

  // ─── Reset ────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStage('welcome')
    setFile(null)
    setXmlFile(null)
    setKasszaHeaders([])
    setLedgerSheets([])
    setBankszamlak([])
    setSheetBankMap({})
    setUnits([])
    setKasszaAnalysis(null)
    setBudgetCodeResolutions(null)
    setDonorResolutions(null)
    setMonetarDiagnostic(null)
    setSkippedCodes(new Set())
    setManualPersonSelections({})
    setAutoDistributedDonors(new Set())
    setImportResult(null)
  }, [])

  const handleClearFile = useCallback(() => {
    setFile(null)
    setXmlFile(null)
    setKasszaHeaders([])
    setLedgerSheets([])
    setBankszamlak([])
    setSheetBankMap({})
    setUnits([])
    setKasszaAnalysis(null)
    setBudgetCodeResolutions(null)
    setDonorResolutions(null)
    setMonetarDiagnostic(null)
    setSkippedCodes(new Set())
    setManualPersonSelections({})
    setAutoDistributedDonors(new Set())
    setImportResult(null)
  }, [])

  // ─── doReviewAll: az ÖSSZES forrást (Kassza + a hozzárendelt bankszámlák) egyben elemzi ──
  const doReviewAll = useCallback(
    (unitsToProcess: LedgerUnit[]) => {
      if (!file || unitsToProcess.length === 0) return
      setUnits(unitsToProcess)
      // Az oszlop-egyeztetés ellenőrző panelhez az első forrás fejlécei (mind azonos szerkezet).
      setKasszaHeaders(unitsToProcess[0].headers || [])
      setStage('review')

      startLoadingReview(async () => {
        // Bevételek-XML referencia EGYSZER (ha van) — forrásonként a bevétel-sorokra vetítjük.
        let xmlRows: Parameters<typeof applyXmlOverlay>[1] | null = null
        if (xmlFile) {
          const xmlFd = new FormData()
          xmlFd.append('xmlFile', xmlFile)
          const xmlRes = await parseXmlReference(xmlFd)
          if (xmlRes.error) toast.warning(`XML-referencia kihagyva: ${xmlRes.error}`)
          else xmlRows = xmlRes.rows ?? null
        }

        const allRows: ClassifiedKasszaRow[] = []
        const allBudget: BudgetCodeResolution[] = []
        const allDonors: DonorResolution[] = []
        let xmlMatched = 0

        for (const u of unitsToProcess) {
          const fd1 = new FormData()
          fd1.append('file', file)
          const fd2 = new FormData()
          fd2.append('file', file)
          const fd3 = new FormData()
          fd3.append('file', file)
          const [analysisRes, budgetRes, donorRes] = await Promise.all([
            analyzeKasszaRows(fd1, u.sheetName),
            resolveBudgetCodes(fd2, u.sheetName),
            resolveDonors(fd3, u.sheetName),
          ])
          if (analysisRes.error || budgetRes.error || donorRes.error) {
            toast.error(
              `„${u.label}" elemzése sikertelen: ${analysisRes.error || budgetRes.error || donorRes.error}`,
            )
            return
          }

          const rows = analysisRes.rows || []
          // XML-overlay erre a forrásra (a saját, lap-helyi rowIndex-ekkel).
          if (xmlRows) {
            const incomeRows = rows.filter((r) => r.kind === 'income')
            const overlay = applyXmlOverlay(incomeRows, xmlRows)
            for (const row of rows) {
              const m = overlay.byRowIndex.get(row.rowIndex)
              if (m) {
                row.fizetettevOverride = m.fizetettev
                row.iratszamHivatalos = m.iratszamHivatalos
              }
            }
            xmlMatched += overlay.matchedCount
          }
          // Minden sort a SAJÁT forrásához kötünk + globálisan egyedi rowIndex.
          for (const r of rows) {
            r.bankszamlaId = u.bankszamlaId
            r.rowIndex = allRows.length
            allRows.push(r)
          }
          for (const b of budgetRes.resolutions || []) allBudget.push(b)
          for (const d of donorRes.resolutions || []) allDonors.push(d)
        }

        if (xmlRows) toast.success(`XML-referencia: ${xmlMatched} bevétel pontosítva.`)

        // Dedup: kód rawKod szerint, donor raw szerint (egy gyülekezetre azonos a feloldás).
        const budgetMap = new Map<string, BudgetCodeResolution>()
        for (const b of allBudget) if (!budgetMap.has(b.rawKod)) budgetMap.set(b.rawKod, b)
        const donorMap = new Map<string, DonorResolution>()
        for (const d of allDonors) if (!donorMap.has(d.raw)) donorMap.set(d.raw, d)
        const donorResolutions = [...donorMap.values()]

        // Kombinált statisztika (kind szerinti darabszámok).
        const stats = {
          income: 0,
          expense: 0,
          internalTransferIn: 0,
          internalTransferOut: 0,
          skip: 0,
          total: allRows.length,
        }
        for (const r of allRows) {
          if (r.kind === 'income') stats.income++
          else if (r.kind === 'expense') stats.expense++
          else if (r.kind === 'internal-transfer-in') stats.internalTransferIn++
          else if (r.kind === 'internal-transfer-out') stats.internalTransferOut++
          else stats.skip++
        }

        setKasszaAnalysis({ success: true, rows: allRows, stats })
        setBudgetCodeResolutions([...budgetMap.values()])
        setDonorResolutions(donorResolutions)

        // B1 — „1×/év" auto-elosztás (egyházfenntartás) a kombinált donor-halmazon.
        const EGYHF = '101.01'
        const egyhfRaws = new Set<string>()
        for (const r of allRows) {
          if (r.budgetCode === EGYHF && r.donorString) egyhfRaws.add(r.donorString)
        }
        const preTakenPersonIds = new Set<string>()
        for (const d of donorResolutions) {
          if (d.status === 'resolved' && d.szemelyId && egyhfRaws.has(d.raw)) {
            preTakenPersonIds.add(d.szemelyId)
          }
        }
        const dist = distributeAmbiguousDonors(donorResolutions, { egyhfRaws, preTakenPersonIds })
        if (Object.keys(dist.selections).length > 0) {
          setManualPersonSelections((prev) => ({ ...dist.selections, ...prev }))
          setAutoDistributedDonors(dist.autoSet)
        }

        // Monetar (készpénz-leltár) diagnosztika — a Kassza (készpénz) sorokra.
        if (unitsToProcess.some((u) => u.bankszamlaId == null)) {
          const cashRows = allRows.filter((r) => r.bankszamlaId == null)
          const totalIncome = cashRows
            .filter((r) => r.kind === 'income')
            .reduce((s, r) => s + (r.amount ?? 0), 0)
          const totalExpense = cashRows
            .filter((r) => r.kind === 'expense')
            .reduce((s, r) => s + (r.amount ?? 0), 0)
          const opening = cashRows.find(
            (r) =>
              r.kind === 'skip' &&
              typeof r.donorString === 'string' &&
              /Előző évi/i.test(r.donorString),
          )
          const fdMon = new FormData()
          fdMon.append('file', file)
          const monetarRes = await getMonetarDiagnostic(
            fdMon,
            totalIncome,
            totalExpense,
            opening?.amount ?? 0,
          )
          if (monetarRes.diagnostic) setMonetarDiagnostic(monetarRes.diagnostic)
        }
      })
    },
    [file, xmlFile],
  )

  // ─── Lépés 1 → forrás/áttekintés: parse, majd döntés ──────────────────
  const handleStartReview = useCallback(() => {
    if (!file) {
      toast.error('Először válassz egy fájlt.')
      return
    }
    startParsing(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const parsed = await parseAndPreviewFinance(formData)
      if (parsed.error) {
        toast.error(parsed.error)
        return
      }
      const allSheets = parsed.sheets || []
      const ledgers = allSheets.filter((s) => s.isLedgerSheet)
      const kassza = allSheets.find((s) => s.isKasszaSheet)
      const banks = ledgers.filter((s) => s.isBankSheet)

      // Ha van adatos bankszámla-lap (A–F), a felhasználó rendelje hozzá a számlákat.
      if (banks.length > 0) {
        setLedgerSheets(ledgers)
        setSheetBankMap({})
        const bs = await listBankszamlakForImport()
        setBankszamlak(bs.data || [])
        setStage('source')
        return
      }

      // Csak Kassza (nincs bank-lap adattal) → egyből áttekintés (egyetlen forrás).
      if (!kassza) {
        toast.error('A fájlban nincs "Kassza" nevű munkalap.')
        return
      }
      doReviewAll([
        {
          sheetName: kassza.sheetName,
          bankszamlaId: null,
          label: 'Kassza (készpénz)',
          opening: kassza.openingBalance ?? null,
          closing: kassza.closingBalance ?? null,
          headers: kassza.headers || [],
        },
      ])
    })
  }, [file, doReviewAll])

  // A forrás-hozzárendelő „Az összes beolvasása" gombja → kötegelt elemzés.
  const handleSourceContinue = useCallback(() => {
    const kassza = ledgerSheets.find((s) => s.isKasszaSheet)
    const units: LedgerUnit[] = []
    if (kassza) {
      units.push({
        sheetName: kassza.sheetName,
        bankszamlaId: null,
        label: 'Kassza (készpénz)',
        opening: kassza.openingBalance ?? null,
        closing: kassza.closingBalance ?? null,
        headers: kassza.headers || [],
      })
    }
    for (const b of ledgerSheets.filter((s) => s.isBankSheet)) {
      const bankId = sheetBankMap[b.sheetName] ?? null
      if (bankId == null) continue // nincs hozzárendelve → kihagyjuk
      const bankName = bankszamlak.find((x) => x.id === bankId)?.bank_neve ?? b.sheetName
      units.push({
        sheetName: b.sheetName,
        bankszamlaId: bankId,
        label: `Bank — ${bankName}`,
        opening: b.openingBalance ?? null,
        closing: b.closingBalance ?? null,
        headers: b.headers || [],
      })
    }
    if (units.length === 0) {
      toast.error('Nincs beolvasható forrás.')
      return
    }
    doReviewAll(units)
  }, [ledgerSheets, sheetBankMap, bankszamlak, doReviewAll])

  // ─── Felhasználói döntések ───────────────────────────────────────────
  const handleSkipCodeToggle = useCallback((rawKod: string) => {
    setSkippedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(rawKod)) next.delete(rawKod)
      else next.add(rawKod)
      return next
    })
  }, [])

  const handleManualPersonSelectionChange = useCallback(
    (raw: string, szemelyId: string) => {
      setManualPersonSelections((prev) => ({ ...prev, [raw]: szemelyId }))
    },
    [],
  )

  // ─── Items építése ────────────────────────────────────────────────────
  const builtItems = useMemo(() => {
    if (!kasszaAnalysis?.rows || !budgetCodeResolutions || !donorResolutions) {
      return { items: [], skippedReasons: [] }
    }
    return buildFinanceImportItems({
      rows: kasszaAnalysis.rows,
      budgetCodeResolutions,
      donorResolutions,
      manualPersonSelections,
      skippedCodes,
      // A bankszámla soronként van megjelölve (row.bankszamlaId) — kötegelt import.
    })
  }, [
    kasszaAnalysis,
    budgetCodeResolutions,
    donorResolutions,
    manualPersonSelections,
    skippedCodes,
  ])

  // ─── Per-forrás összegzés (Kassza + minden bankszámla külön) ──────────
  const perUnit = useMemo(() => {
    const rows = kasszaAnalysis?.rows || []
    return units.map((u) => {
      const uRows = rows.filter((r) => (r.bankszamlaId ?? null) === u.bankszamlaId)
      let bev = 0
      let kia = 0
      let internalIn = 0
      let internalOut = 0
      for (const r of uRows) {
        const a = typeof r.amount === 'number' ? r.amount : 0
        if (r.kind === 'income' || r.kind === 'internal-transfer-in') bev += a
        else if (r.kind === 'expense' || r.kind === 'internal-transfer-out') kia += a
        if (r.kind === 'internal-transfer-in') internalIn += a
        else if (r.kind === 'internal-transfer-out') internalOut += a
      }
      return { unit: u, bev, kia, internalIn, internalOut }
    })
  }, [kasszaAnalysis, units])

  // ImportTotalsPanel: forrásonként egy sor + összesítés.
  const importTotals = useMemo(() => {
    const rows: SheetTotals[] = perUnit.map((p) => ({ label: p.unit.label, bev: p.bev, kia: p.kia }))
    const grand = rows.reduce(
      (g, r) => ({ bev: g.bev + r.bev, kia: g.kia + r.kia }),
      { bev: 0, kia: 0 },
    )
    return { rows, grand }
  }, [perUnit])

  // ─── Belső mozgás KERESZT-ELLENŐRZÉS — a pénz nem veszhet el ──────────
  // Az összes forráson Σ kimenő belső mozgás == Σ bejövő (minden átvezetés mindkét
  // főkönyvben szerepel). Ha eltér → hiányzik az egyik fél (pl. nem importált bank-lap).
  const internalCheck = useMemo(() => {
    const rows = kasszaAnalysis?.rows || []
    const transfersIn = rows.filter((r) => r.kind === 'internal-transfer-in')
    const transfersOut = rows.filter((r) => r.kind === 'internal-transfer-out')
    const sumAmt = (rs: ClassifiedKasszaRow[]) => rs.reduce((s, r) => s + (r.amount ?? 0), 0)
    const totalIn = sumAmt(transfersIn)
    const totalOut = sumAmt(transfersOut)
    const diff = Math.round((totalOut - totalIn) * 100) / 100
    // Belső mozgásnak TŰNŐ, de bevétel/kiadásként osztályozott sorok (hiányzó/téves kód).
    const suspected = rows.filter(
      (r) =>
        (r.kind === 'income' || r.kind === 'expense') &&
        (looksLikeInternalMovement(r.donorString) ||
          looksLikeInternalMovement(r.celNev) ||
          looksLikeInternalMovement(r.megjegyzes)),
    )
    return { transfersIn, transfersOut, totalIn, totalOut, diff, balanced: Math.abs(diff) < 0.01, suspected }
  }, [kasszaAnalysis])

  // ─── Lépés 2 → 3: import végrehajtása ─────────────────────────────────
  const handleConfirmImport = useCallback(() => {
    if (builtItems.items.length === 0) {
      toast.error('Nincs importálható tétel.')
      return
    }
    setStage('importing')
    const fileName = file?.name || 'kassza.xlsx'

    // A könyvelési év = a tételek túlnyomó éve (a nyitó egyenleg ehhez az évhez tartozik).
    const yearCounts = new Map<string, number>()
    for (const r of kasszaAnalysis?.rows || []) {
      if (r.kind === 'skip' || !r.datum) continue
      const y = r.datum.slice(0, 4)
      if (/^\d{4}$/.test(y)) yearCounts.set(y, (yearCounts.get(y) || 0) + 1)
    }
    const topYear = [...yearCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const eve = topYear ? Number(topYear) : null

    // Készpénz (Kassza) nyitó — a Kassza forrás nyitója; bank nyitók külön táblába.
    const cashUnit = units.find((u) => u.bankszamlaId == null)
    const keszpenzNyito =
      eve != null && cashUnit?.opening != null ? { eve, nyito: cashUnit.opening } : null
    const bankNyitok = units.filter((u) => u.bankszamlaId != null && u.opening != null)

    startImporting(async () => {
      // Egyetlen RPC — a tételek a SAJÁT bankszamla_id-jükkel kerülnek a helyükre
      // (Kassza = null, bankszámla = az adott id). Idempotens dedup védi a dupla-futást.
      const result = await executeFinanceImport(builtItems.items, fileName, keszpenzNyito)

      // Minden importált bankszámla éves nyitójának rögzítése (forrasa='import').
      // P3-10 (audit 2026-08-28): a kassza-nyitó hangos-hiba javítása után a
      // BANK-nyitó ág néma maradt — a hibát mostantól összegyűjtjük és KIMONDJUK
      // (az import attól még sikeres, de a nyitót kézzel kell pótolni).
      if (!result.error && eve != null) {
        const nyitoHibak: string[] = []
        for (const u of bankNyitok) {
          try {
            const nyitoRes = await upsertBankszamlaNyitoEgyenleg({
              bankszamla_id: u.bankszamlaId as number,
              eve,
              nyito_egyenleg_valuta: u.opening as number,
              forrasa: 'import',
            })
            if (nyitoRes.error) nyitoHibak.push(`${u.label}: ${nyitoRes.error}`)
          } catch (e) {
            nyitoHibak.push(`${u.label}: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`)
          }
        }
        if (nyitoHibak.length > 0) {
          toast.error(
            `A tételek importja sikerült, de ${nyitoHibak.length} bank NYITÓ egyenlege NEM mentődött: ` +
              `${nyitoHibak.join(' · ')} — rögzítsd kézzel a Pénzügy → Bank fülön.`,
            { duration: 15000 },
          )
        }
      }

      setImportResult(result)
      setStage('result')
      if (result.error) {
        toast.error(result.error)
      } else if (result.inserted) {
        toast.success(`Sikeresen mentve: ${result.inserted} tétel.`)
        // P3-9: a Pénzügy-fülek listái AZONNAL frissülnek — a felhasználó ne a
        // régi listából következtessen arra, hogy „nem importált semmit".
        onImported?.()
      }
    })
  }, [builtItems.items, file, kasszaAnalysis, units, onImported])

  const currentStep: 1 | 2 | 3 =
    stage === 'welcome' || stage === 'source' ? 1 : stage === 'result' ? 3 : 2

  return (
    <div className="space-y-5">
      <WizardSteps current={currentStep} />

      {stage === 'welcome' && (
        <WelcomeStep
          selectedFile={file}
          onFileSelected={setFile}
          onClearFile={handleClearFile}
          onContinue={handleStartReview}
          isParsing={isParsing}
          xmlFile={xmlFile}
          onXmlFileSelected={setXmlFile}
          onClearXmlFile={() => setXmlFile(null)}
        />
      )}

      {stage === 'source' && (
        <MultiSourceMapStep
          sheets={ledgerSheets}
          bankszamlak={bankszamlak}
          sheetBankMap={sheetBankMap}
          onSetMapping={(name, id) =>
            setSheetBankMap((prev) => ({ ...prev, [name]: id }))
          }
          onContinue={handleSourceContinue}
          onBack={() => setStage('welcome')}
          isLoading={isLoadingReview}
        />
      )}

      {stage === 'review' && kasszaHeaders.length > 0 && (
        <ColumnMappingPanel headers={kasszaHeaders} />
      )}

      {stage === 'review' && !isLoadingReview && kasszaAnalysis && (
        <ImportTotalsPanel totals={importTotals.rows} grand={importTotals.grand} />
      )}

      {stage === 'review' &&
        !isLoadingReview &&
        kasszaAnalysis &&
        perUnit.map((p) => (
          <BalanceSummaryCard
            key={p.unit.bankszamlaId ?? 'kassza'}
            title={`Egyenleg-levezetés — ${p.unit.label}`}
            opening={p.unit.opening}
            closing={p.unit.closing}
            incoming={p.bev}
            outgoing={p.kia}
          />
        ))}

      {stage === 'review' && !isLoadingReview && kasszaAnalysis && (
        <InternalMovementsPanel
          transfersIn={internalCheck.transfersIn}
          transfersOut={internalCheck.transfersOut}
          suspected={internalCheck.suspected}
          balanced={internalCheck.balanced}
          diff={internalCheck.diff}
          totalIn={internalCheck.totalIn}
          totalOut={internalCheck.totalOut}
          multiSource={units.length > 1}
        />
      )}

      {stage === 'review' && (
        <ReviewStep
          fileName={file?.name || 'Ismeretlen fájl'}
          analysis={kasszaAnalysis}
          budgetCodeResolutions={budgetCodeResolutions}
          donorResolutions={donorResolutions}
          monetarDiagnostic={monetarDiagnostic}
          isLoading={isLoadingReview}
          items={builtItems.items}
          skippedReasons={builtItems.skippedReasons}
          skippedCodes={skippedCodes}
          onSkipCodeToggle={handleSkipCodeToggle}
          manualPersonSelections={manualPersonSelections}
          onManualPersonSelectionChange={handleManualPersonSelectionChange}
          autoDistributedDonors={autoDistributedDonors}
          isImporting={isImporting}
          onBack={() => {
            setStage('welcome')
          }}
          onConfirmImport={handleConfirmImport}
        />
      )}

      {stage === 'importing' && (
        <ImportingStep totalItems={builtItems.items.length} />
      )}

      {stage === 'result' && importResult && (
        <ResultStep
          result={importResult}
          donorResolutions={donorResolutions}
          onNewImport={reset}
        />
      )}
    </div>
  )
}
