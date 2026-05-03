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
  analyzeKasszaRows,
  resolveBudgetCodes,
  resolveDonors,
  getMonetarDiagnostic,
  executeFinanceImport,
} from '@/app/(dashboard)/penzugy/finance-import-actions'
import type {
  KasszaAnalysisResult,
  BudgetCodeResolution,
  DonorResolution,
  FinanceImportResult,
} from '@/app/(dashboard)/penzugy/finance-import-types'

import { WelcomeStep } from './steps/welcome-step'
import { ReviewStep } from './steps/review-step'
import { ImportingStep } from './steps/importing-step'
import { ResultStep } from './steps/result-step'
import { buildFinanceImportItems } from './helpers/item-builder'
import type { MonetarDiagnostic } from './helpers/monetar-diagnostic'

type WizardStage = 'welcome' | 'review' | 'importing' | 'result'

export function PenzugyImportWizard() {
  const [stage, setStage] = useState<WizardStage>('welcome')
  const [file, setFile] = useState<File | null>(null)

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
    setKasszaAnalysis(null)
    setBudgetCodeResolutions(null)
    setDonorResolutions(null)
    setMonetarDiagnostic(null)
    setSkippedCodes(new Set())
    setManualPersonSelections({})
    setImportResult(null)
  }, [])

  const handleClearFile = useCallback(() => {
    setFile(null)
    setKasszaAnalysis(null)
    setBudgetCodeResolutions(null)
    setDonorResolutions(null)
    setMonetarDiagnostic(null)
    setSkippedCodes(new Set())
    setManualPersonSelections({})
    setImportResult(null)
  }, [])

  // ─── Lépés 1 → 2: parse + analízis együtt ─────────────────────────────
  const handleStartReview = useCallback(() => {
    if (!file) {
      toast.error('Először válassz egy fájlt.')
      return
    }
    startParsing(async () => {
      const formData = new FormData()
      formData.append('file', file)

      // Parse — mert nélkül sem analíz, sem kód-, sem donor-feloldás
      const parsed = await parseAndPreviewFinance(formData)
      if (parsed.error) {
        toast.error(parsed.error)
        return
      }
      const hasKassza = (parsed.sheets || []).some((s) => s.isKasszaSheet)
      if (!hasKassza) {
        toast.error('A fájlban nincs "Kassza" nevű munkalap.')
        return
      }

      // Stage váltás review-re — innentől a review-step "isLoading" állapotban
      setStage('review')

      // Loading háttérben — 3 párhuzamos action
      startLoadingReview(async () => {
        const fd1 = new FormData()
        fd1.append('file', file)
        const fd2 = new FormData()
        fd2.append('file', file)
        const fd3 = new FormData()
        fd3.append('file', file)

        const [analysisRes, budgetRes, donorRes] = await Promise.all([
          analyzeKasszaRows(fd1),
          resolveBudgetCodes(fd2),
          resolveDonors(fd3),
        ])

        if (analysisRes.error) {
          toast.error(analysisRes.error)
          return
        }
        if (budgetRes.error) {
          toast.error(budgetRes.error)
          return
        }
        if (donorRes.error) {
          toast.error(donorRes.error)
          return
        }

        setKasszaAnalysis(analysisRes)
        setBudgetCodeResolutions(budgetRes.resolutions || [])
        setDonorResolutions(donorRes.resolutions || [])

        // Monetar diagnosztika — szekvenciálisan, mert a totalIncome/Expense kell
        const totalIncome = (analysisRes.rows || [])
          .filter((r) => r.kind === 'income')
          .reduce((s, r) => s + (r.amount ?? 0), 0)
        const totalExpense = (analysisRes.rows || [])
          .filter((r) => r.kind === 'expense')
          .reduce((s, r) => s + (r.amount ?? 0), 0)
        const opening = (analysisRes.rows || []).find(
          (r) =>
            r.kind === 'skip' &&
            typeof r.donorString === 'string' &&
            /Előző évi/i.test(r.donorString),
        )
        const nyitoEgyenleg = opening?.amount ?? 0

        const fdMon = new FormData()
        fdMon.append('file', file)
        const monetarRes = await getMonetarDiagnostic(
          fdMon,
          totalIncome,
          totalExpense,
          nyitoEgyenleg,
        )
        if (monetarRes.diagnostic) {
          setMonetarDiagnostic(monetarRes.diagnostic)
        }
      })
    })
  }, [file])

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
    })
  }, [
    kasszaAnalysis,
    budgetCodeResolutions,
    donorResolutions,
    manualPersonSelections,
    skippedCodes,
  ])

  // ─── Lépés 2 → 3: import végrehajtása ─────────────────────────────────
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

  return (
    <div className="space-y-5">
      {stage === 'welcome' && (
        <WelcomeStep
          selectedFile={file}
          onFileSelected={setFile}
          onClearFile={handleClearFile}
          onContinue={handleStartReview}
          isParsing={isParsing}
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
