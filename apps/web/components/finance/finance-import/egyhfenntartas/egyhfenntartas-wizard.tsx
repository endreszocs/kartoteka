'use client'

/**
 * Egyházfenntartás-import wizard — orchestrator (2026-05-06).
 *
 * 4 stage-es flow:
 *   1. welcome   — fájlok feltöltése + év-detekció
 *   2. match     — áttekintés + felhasználói döntések
 *   3. importing — progress
 *   4. result    — eredmény + CSV export + új import gomb
 */

import { useCallback, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  parseAndPreviewEgyhf,
  executeEgyhfImport,
  type ParsePreviewResult,
  type ExecuteImportResult,
  type ExecuteImportItem,
} from '@/app/(dashboard)/penzugy/egyhfenntartas-import-actions'

import { WelcomeStep } from './steps/welcome-step'
import { MatchStep } from './steps/match-step'
import { ImportingStep } from './steps/importing-step'
import { ResultStep } from './steps/result-step'

type WizardStage = 'welcome' | 'match' | 'importing' | 'result'

export function EgyhfenntartasImportWizard() {
  const [stage, setStage] = useState<WizardStage>('welcome')
  const [xlsxFile, setXlsxFile] = useState<File | null>(null)
  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(
    new Date().getFullYear(),
  )

  const [preview, setPreview] = useState<ParsePreviewResult | null>(null)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [manualSelections, setManualSelections] = useState<Record<string, number>>({})

  const [importResult, setImportResult] = useState<ExecuteImportResult | null>(null)

  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  const handleStartParse = useCallback(() => {
    if (!xlsxFile || !xmlFile || !selectedYear) {
      toast.error('Mindkét fájl és az év szükséges.')
      return
    }
    startParsing(async () => {
      const formData = new FormData()
      formData.append('xlsxFile', xlsxFile)
      formData.append('xmlFile', xmlFile)

      const res = await parseAndPreviewEgyhf(formData)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setPreview(res.data)
      setStage('match')
      // Ha a fájl-detektált év eltér a felhasználó által megadottól, jelezzünk
      if (
        res.data.detectedYear &&
        res.data.detectedYear !== selectedYear
      ) {
        toast.warning(
          `A fájlokból ${res.data.detectedYear}-es évet detektáltunk, de te ${selectedYear}-öt választottál. Légy biztos benne, hogy a megfelelő év van beírva.`,
        )
      }
      if (res.data.warnings.length > 0) {
        toast.info(`${res.data.warnings.length} figyelmeztetés a parsoláskor — lásd a konzolt.`)
        console.warn('[egyhf-import] warnings:', res.data.warnings)
      }
    })
  }, [xlsxFile, xmlFile, selectedYear])

  const handleSkipToggle = useCallback((clientKey: string) => {
    setSkipped(prev => {
      const next = new Set(prev)
      if (next.has(clientKey)) next.delete(clientKey)
      else next.add(clientKey)
      return next
    })
  }, [])

  const handleManualSelectionChange = useCallback(
    (clientKey: string, szemelyId: number) => {
      setManualSelections(prev => ({ ...prev, [clientKey]: szemelyId }))
    },
    [],
  )

  const handleConfirmImport = useCallback(() => {
    if (!preview || !selectedYear) return

    const items: ExecuteImportItem[] = preview.matched
      .filter(m => !skipped.has(m.clientKey))
      .map(m => ({
        clientKey: m.clientKey,
        finalRow: m.finalRow,
        szemelyId: m.szemely.szemelyId,
        csaladId: m.szemely.csaladId,
        manualSzemelyId: manualSelections[m.clientKey] ?? null,
      }))

    if (items.length === 0) {
      toast.error('Nincs importálható tétel — minden sor skipelve van.')
      return
    }

    setStage('importing')
    startImporting(async () => {
      const res = await executeEgyhfImport(items, selectedYear)
      setImportResult(res)
      setStage('result')
      if (res.errors.length > 0) {
        toast.error(`${res.errors.length} hiba történt az importálás során.`)
      } else if (res.insertedCount > 0) {
        toast.success(`Sikeres: ${res.insertedCount} tétel rögzítve.`)
      }
    })
  }, [preview, selectedYear, skipped, manualSelections])

  const handleReset = useCallback(() => {
    setStage('welcome')
    setXlsxFile(null)
    setXmlFile(null)
    setPreview(null)
    setSkipped(new Set())
    setManualSelections({})
    setImportResult(null)
  }, [])

  return (
    <div className="card-raised">
      {stage === 'welcome' && (
        <WelcomeStep
          xlsxFile={xlsxFile}
          xmlFile={xmlFile}
          selectedYear={selectedYear}
          onXlsxFileSelected={setXlsxFile}
          onXmlFileSelected={setXmlFile}
          onYearChange={setSelectedYear}
          onContinue={handleStartParse}
          isParsing={isParsing}
        />
      )}

      {stage === 'match' && preview && selectedYear && (
        <MatchStep
          preview={preview}
          selectedYear={selectedYear}
          skipped={skipped}
          onSkipToggle={handleSkipToggle}
          manualSelections={manualSelections}
          onManualSelectionChange={handleManualSelectionChange}
          onBack={() => setStage('welcome')}
          onConfirmImport={handleConfirmImport}
          isImporting={isImporting}
        />
      )}

      {stage === 'importing' && (
        <ImportingStep totalItems={preview?.matched.length ?? 0} />
      )}

      {stage === 'result' && importResult && preview && selectedYear && (
        <ResultStep
          result={importResult}
          matched={preview.matched}
          selectedYear={selectedYear}
          onNewImport={handleReset}
        />
      )}
    </div>
  )
}
