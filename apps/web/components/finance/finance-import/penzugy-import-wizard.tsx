'use client'

/**
 * Pénzügyi import wizard — fő orchestrator komponens.
 *
 * 9 lépéses wizard:
 *   1. source-type     — forrástípus + fájl feltöltés (csak Kassza aktív)
 *   2. sheet-pick      — Kassza fül kiválasztása
 *   3. column-mapping  — fejléc → DB virtuális mező mapping
 *   4. kassza-split    — sor-szétválasztás (income/expense/internal-transfer/skip)
 *   5. budget-code     — költségvetési kód lookup
 *   6. donor-resolve   — befizető-string → szemely-ID
 *   7. preview         — végleges előnézet + Monetar diagnosztika
 *   8. importing       — progress bar (RPC futása)
 *   9. result          — KpiCard, cég-lista, hibák
 *
 * 2026-05-03 (Fázis 6): mind a 9 lépés él. Az import élesben fut.
 */

import { useCallback, useMemo, useState, useTransition } from 'react'
import { Wallet } from 'lucide-react'
import { toast } from 'sonner'

import { PageHero } from '@kartoteka/ui-app'
import { WizardStepper, type WizardStep } from '@/components/import-shared/wizard-stepper'
import {
  parseAndPreviewFinance,
  analyzeKasszaRows,
  resolveBudgetCodes,
  resolveDonors,
  getMonetarDiagnostic,
  executeFinanceImport,
} from '@/app/(dashboard)/penzugy/finance-import-actions'
import type {
  FinanceParseResult,
  FinanceSheetPreview,
  KasszaAnalysisResult,
  BudgetCodeResolution,
  DonorResolution,
  FinanceImportResult,
} from '@/app/(dashboard)/penzugy/finance-import-types'

import { SourceTypeStep } from './steps/source-type-step'
import { SheetPickStep } from './steps/sheet-pick-step'
import { ColumnMappingStep } from './steps/column-mapping-step'
import { KasszaSplitStep } from './steps/kassza-split-step'
import { BudgetCodeStep } from './steps/budget-code-step'
import { DonorResolveStep } from './steps/donor-resolve-step'
import { PreviewStep } from './steps/preview-step'
import { ImportingStep } from './steps/importing-step'
import { ResultStep } from './steps/result-step'
import { buildFinanceImportItems } from './helpers/item-builder'
import type { MonetarDiagnostic } from './helpers/monetar-diagnostic'
import type { FinanceImportSourceType, FinanceWizardStage } from './types'

// ─── Lépés-definíciók ───────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: 'source-type', label: 'Forrás' },
  { id: 'sheet-pick', label: 'Munkalap' },
  { id: 'column-mapping', label: 'Oszlopok' },
  { id: 'kassza-split', label: 'Sor-bontás' },
  { id: 'budget-code', label: 'Kódok' },
  { id: 'donor-resolve', label: 'Befizetők' },
  { id: 'preview', label: 'Előnézet' },
  { id: 'result', label: 'Eredmény' },
]

// ─── Komponens ──────────────────────────────────────────────────────────

export function PenzugyImportWizard() {
  const [stage, setStage] = useState<FinanceWizardStage>('source-type')
  const [sourceType, setSourceType] = useState<FinanceImportSourceType>('kassza')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<FinanceParseResult | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null)
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string | null>>({})

  // 4. lépés
  const [kasszaAnalysis, setKasszaAnalysis] = useState<KasszaAnalysisResult | null>(null)

  // 5. lépés
  const [budgetCodeResolutions, setBudgetCodeResolutions] = useState<
    BudgetCodeResolution[] | null
  >(null)
  const [skippedCodes, setSkippedCodes] = useState<Set<string>>(new Set())

  // 6. lépés
  const [donorResolutions, setDonorResolutions] = useState<DonorResolution[] | null>(null)
  const [manualPersonSelections, setManualPersonSelections] = useState<
    Record<string, string>
  >({})

  // 7. lépés
  const [monetarDiagnostic, setMonetarDiagnostic] = useState<MonetarDiagnostic | null>(null)

  // 9. lépés
  const [importResult, setImportResult] = useState<FinanceImportResult | null>(null)

  // Transition flags
  const [isParsing, startParsing] = useTransition()
  const [isAnalyzing, startAnalyzing] = useTransition()
  const [isResolvingCodes, startResolvingCodes] = useTransition()
  const [isResolvingDonors, startResolvingDonors] = useTransition()
  const [isLoadingMonetar, startLoadingMonetar] = useTransition()
  const [isImporting, startImporting] = useTransition()

  // ─── Reset ────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStage('source-type')
    setFile(null)
    setParseResult(null)
    setSelectedSheetName(null)
    setMappingOverrides({})
    setKasszaAnalysis(null)
    setBudgetCodeResolutions(null)
    setSkippedCodes(new Set())
    setDonorResolutions(null)
    setManualPersonSelections({})
    setMonetarDiagnostic(null)
    setImportResult(null)
  }, [])

  // ─── Lépés 1 → 2 ──────────────────────────────────────────────────────
  const handleParseFile = useCallback(() => {
    if (!file) {
      toast.error('Először válassz egy fájlt.')
      return
    }
    startParsing(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const result = await parseAndPreviewFinance(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setParseResult(result)
      const kasszaSheets = (result.sheets || []).filter((s) => s.isKasszaSheet)
      if (kasszaSheets.length === 1) {
        setSelectedSheetName(kasszaSheets[0].sheetName)
      }
      setStage('sheet-pick')
    })
  }, [file])

  const handleClearFile = useCallback(() => {
    setFile(null)
    setParseResult(null)
    setSelectedSheetName(null)
    setMappingOverrides({})
    setKasszaAnalysis(null)
    setBudgetCodeResolutions(null)
    setSkippedCodes(new Set())
    setDonorResolutions(null)
    setManualPersonSelections({})
    setMonetarDiagnostic(null)
    setImportResult(null)
  }, [])

  // ─── Lépés 2 → 3 ──────────────────────────────────────────────────────
  const handleSheetContinue = useCallback(() => {
    if (!selectedSheetName) {
      toast.error('Válassz egy munkalapot a továbblépéshez.')
      return
    }
    setStage('column-mapping')
  }, [selectedSheetName])

  // ─── Lépés 3 → 4 ──────────────────────────────────────────────────────
  const handleMappingContinue = useCallback(() => {
    setStage('kassza-split')
  }, [])

  const handleOverrideChange = useCallback(
    (excelHeader: string, dbColumn: string | null) => {
      setMappingOverrides((prev) => ({ ...prev, [excelHeader]: dbColumn }))
    },
    [],
  )

  // ─── Lépés 4 ──────────────────────────────────────────────────────────
  const handleAnalyzeKasszaRows = useCallback(() => {
    if (!file) {
      toast.error('A fájl már nincs feltöltve. Indítsd újra az importot.')
      return
    }
    startAnalyzing(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const result = await analyzeKasszaRows(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setKasszaAnalysis(result)
    })
  }, [file])

  const handleKasszaSplitContinue = useCallback(() => {
    setStage('budget-code')
  }, [])

  // ─── Lépés 5 ──────────────────────────────────────────────────────────
  const handleResolveBudgetCodes = useCallback(() => {
    if (!file) {
      toast.error('A fájl már nincs feltöltve. Indítsd újra az importot.')
      return
    }
    startResolvingCodes(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const result = await resolveBudgetCodes(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setBudgetCodeResolutions(result.resolutions || [])
    })
  }, [file])

  const handleSkipToggle = useCallback((rawKod: string) => {
    setSkippedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(rawKod)) {
        next.delete(rawKod)
      } else {
        next.add(rawKod)
      }
      return next
    })
  }, [])

  const handleBudgetCodeContinue = useCallback(() => {
    setStage('donor-resolve')
  }, [])

  // ─── Lépés 6 ──────────────────────────────────────────────────────────
  const handleResolveDonors = useCallback(() => {
    if (!file) {
      toast.error('A fájl már nincs feltöltve. Indítsd újra az importot.')
      return
    }
    startResolvingDonors(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const result = await resolveDonors(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDonorResolutions(result.resolutions || [])
    })
  }, [file])

  const handleManualPersonSelectionChange = useCallback(
    (raw: string, szemelyId: string) => {
      setManualPersonSelections((prev) => ({ ...prev, [raw]: szemelyId }))
    },
    [],
  )

  const handleDonorResolveContinue = useCallback(() => {
    setStage('preview')
  }, [])

  // ─── Lépés 7: items + Monetar ─────────────────────────────────────────
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
    })
  }, [
    kasszaAnalysis,
    budgetCodeResolutions,
    donorResolutions,
    manualPersonSelections,
    skippedCodes,
  ])

  const totalIncome = useMemo(() => {
    if (!kasszaAnalysis?.rows) return 0
    return kasszaAnalysis.rows
      .filter((r) => r.kind === 'income')
      .reduce((s, r) => s + (r.amount ?? 0), 0)
  }, [kasszaAnalysis])

  const totalExpense = useMemo(() => {
    if (!kasszaAnalysis?.rows) return 0
    return kasszaAnalysis.rows
      .filter((r) => r.kind === 'expense')
      .reduce((s, r) => s + (r.amount ?? 0), 0)
  }, [kasszaAnalysis])

  // A nyitó-egyenleg az "Előző évi készpénzegyenleg" sorból
  const nyitoEgyenleg = useMemo(() => {
    if (!kasszaAnalysis?.rows) return 0
    const opening = kasszaAnalysis.rows.find(
      (r) =>
        r.kind === 'skip' &&
        typeof r.donorString === 'string' &&
        /Előző évi/i.test(r.donorString),
    )
    return opening?.amount ?? 0
  }, [kasszaAnalysis])

  const handleLoadMonetarDiagnostic = useCallback(() => {
    if (!file) {
      toast.error('A fájl már nincs feltöltve. Indítsd újra az importot.')
      return
    }
    startLoadingMonetar(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const result = await getMonetarDiagnostic(
        formData,
        totalIncome,
        totalExpense,
        nyitoEgyenleg,
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.diagnostic) {
        setMonetarDiagnostic(result.diagnostic)
      }
    })
  }, [file, totalIncome, totalExpense, nyitoEgyenleg])

  // ─── Lépés 7 → 8 → 9: az import végrehajtása ──────────────────────────
  const handleConfirmImport = useCallback(() => {
    if (builtItems.items.length === 0) {
      toast.error('Nincs importálható tétel.')
      return
    }
    setStage('importing')
    const fileName = file?.name || 'kassza.xlsx'
    startImporting(async () => {
      const result = await executeFinanceImport(builtItems.items, fileName)
      setImportResult(result)
      setStage('result')
      if (result.error) {
        toast.error(result.error)
      } else if (result.inserted) {
        toast.success(`Sikeresen mentve: ${result.inserted} tétel.`)
      }
    })
  }, [builtItems.items, file])

  // ─── Aktív sheet (derived) ───────────────────────────────────────────
  const activeSheet: FinanceSheetPreview | null =
    parseResult?.sheets?.find((s) => s.sheetName === selectedSheetName) || null

  // ─── Stepper completed ids ────────────────────────────────────────────
  const completedIds: string[] = []
  const orderedStages: FinanceWizardStage[] = [
    'source-type',
    'sheet-pick',
    'column-mapping',
    'kassza-split',
    'budget-code',
    'donor-resolve',
    'preview',
    'importing',
    'result',
  ]
  const currentIndex = orderedStages.indexOf(stage)
  for (let i = 0; i < currentIndex; i++) {
    const s = orderedStages[i]
    if (s === 'importing') continue // a stepperben nincs külön Importing lépés
    completedIds.push(s)
  }
  // result lépésben az 'preview' és minden korábbi befejezve
  if (stage === 'result') completedIds.push('preview')

  return (
    <div className="space-y-5">
      <PageHero
        Icon={Wallet}
        eyebrow="Rendszergazdai eszköz"
        title="Pénzügyi adatok importálása"
        description="A hivatalos EREK könyvelési Excel Kassza fülét tölti be a Kartotéka rendszerbe."
      />

      <WizardStepper steps={STEPS} activeId={stage === 'importing' ? 'preview' : stage} completedIds={completedIds} />

      {/* Lépés 1: Forrástípus + fájl */}
      {stage === 'source-type' && (
        <SourceTypeStep
          selectedSourceType={sourceType}
          onSourceTypeChange={setSourceType}
          selectedFile={file}
          onFileSelected={setFile}
          onClearFile={handleClearFile}
          onContinue={handleParseFile}
          isParsing={isParsing}
        />
      )}

      {/* Lépés 2: Sheet kiválasztása */}
      {stage === 'sheet-pick' && parseResult?.sheets && (
        <SheetPickStep
          fileName={parseResult.fileName || file?.name || 'Ismeretlen fájl'}
          sheets={parseResult.sheets}
          selectedSheetName={selectedSheetName}
          onSheetSelected={setSelectedSheetName}
          onBack={() => setStage('source-type')}
          onContinue={handleSheetContinue}
        />
      )}

      {/* Lépés 3: Oszlop-párosítás */}
      {stage === 'column-mapping' && activeSheet && (
        <ColumnMappingStep
          excelHeaders={activeSheet.headers}
          overrides={mappingOverrides}
          onOverrideChange={handleOverrideChange}
          onBack={() => setStage('sheet-pick')}
          onContinue={handleMappingContinue}
        />
      )}

      {/* Lépés 4: Sor-szétválasztás */}
      {stage === 'kassza-split' && (
        <KasszaSplitStep
          analysis={kasszaAnalysis}
          isAnalyzing={isAnalyzing}
          onAnalyze={handleAnalyzeKasszaRows}
          onBack={() => setStage('column-mapping')}
          onContinue={handleKasszaSplitContinue}
        />
      )}

      {/* Lépés 5: Költségvetési kódok */}
      {stage === 'budget-code' && (
        <BudgetCodeStep
          resolutions={budgetCodeResolutions}
          isResolving={isResolvingCodes}
          onResolve={handleResolveBudgetCodes}
          skippedCodes={skippedCodes}
          onSkipToggle={handleSkipToggle}
          onBack={() => setStage('kassza-split')}
          onContinue={handleBudgetCodeContinue}
        />
      )}

      {/* Lépés 6: Donor-feloldás */}
      {stage === 'donor-resolve' && (
        <DonorResolveStep
          resolutions={donorResolutions}
          isResolving={isResolvingDonors}
          onResolve={handleResolveDonors}
          manualSelections={manualPersonSelections}
          onManualSelectionChange={handleManualPersonSelectionChange}
          onBack={() => setStage('budget-code')}
          onContinue={handleDonorResolveContinue}
        />
      )}

      {/* Lépés 7: Előnézet + Monetar */}
      {stage === 'preview' && (
        <PreviewStep
          items={builtItems.items}
          skippedReasons={builtItems.skippedReasons}
          monetarDiagnostic={monetarDiagnostic}
          isMonetarLoading={isLoadingMonetar}
          onMonetarRefresh={handleLoadMonetarDiagnostic}
          isImporting={isImporting}
          onBack={() => setStage('donor-resolve')}
          onConfirmImport={handleConfirmImport}
        />
      )}

      {/* Lépés 8: Importálás folyamatban */}
      {stage === 'importing' && (
        <ImportingStep totalItems={builtItems.items.length} />
      )}

      {/* Lépés 9: Eredmény */}
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
