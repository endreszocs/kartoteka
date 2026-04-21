'use client'

/**
 * Közös multi-sheet Excel import UI komponens.
 *
 * Lépések:
 *  1. Fájl kiválasztás (xlsx/xls/csv)
 *  2. Parse → sheetek felismerése, fejlécek, mintasorok
 *  3. Sheet ↔ profil társítás (automatikus javaslat + kézi felülírás)
 *  4. Batch import végrehajtás → eredmény kijelzés
 */

import { useCallback, useState, useTransition } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Upload,
  X,
  ChevronDown,
  ChevronRight,
  Table2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  parseAndPreview,
  executeBatchImport,
} from '@/lib/import/batch-import-actions'
import type {
  ParsedSheetPreview,
  ParseResult,
  BatchImportResult,
} from '@/lib/import/batch-import-types'
import type { ImportModule, ImportProfile } from '@/lib/import/import-profiles'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MultiSheetImportProps {
  /** Modul kulcs (members, finance, worklog, registry, filing) */
  module: ImportModule
  /** A modul elérhető import profiljai */
  profiles: ImportProfile[]
  /** Magyar modul név (pl. "Pénzügy") */
  moduleLabel: string
  /** Van-e import jog (god mode / delegated) */
  canImport: boolean
}

// ---------------------------------------------------------------------------
// Belső típusok
// ---------------------------------------------------------------------------

interface SheetConfig {
  sheetName: string
  profileKey: string | null
  enabled: boolean
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'result'

// ---------------------------------------------------------------------------
// Komponens
// ---------------------------------------------------------------------------

export function MultiSheetImport({
  module,
  profiles,
  moduleLabel,
  canImport,
}: MultiSheetImportProps) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>([])
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  // ── Fájl kiválasztás ──────────────────────────────────────
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0]
      if (!selected) return

      const ext = selected.name.toLowerCase().split('.').pop()
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        toast.error('Nem támogatott formátum. Elfogadott: .xlsx, .xls, .csv')
        return
      }
      if (selected.size > 10 * 1024 * 1024) {
        toast.error('A fájl mérete meghaladja a 10 MB-os limitet.')
        return
      }

      setFile(selected)
      setParseResult(null)
      setSheetConfigs([])
      setImportResult(null)

      // Azonnali parse
      const formData = new FormData()
      formData.append('file', selected)
      formData.append('module', module)

      startParsing(async () => {
        const result = await parseAndPreview(formData)
        setParseResult(result)

        if (result.success && result.sheets) {
          const configs: SheetConfig[] = result.sheets.map((s) => ({
            sheetName: s.sheetName,
            profileKey: s.suggestedProfileKey,
            enabled: !!s.suggestedProfileKey && s.rowCount > 0 && !s.warning,
          }))
          setSheetConfigs(configs)
          setStep('preview')
          if (result.sheets.length > 0) {
            setExpandedSheet(result.sheets[0].sheetName)
          }
        } else if (result.error) {
          toast.error(result.error)
        }
      })
    },
    [module],
  )

  // ── Sheet profil módosítás ──────────────────────────────────
  const updateSheetConfig = useCallback(
    (sheetName: string, updates: Partial<SheetConfig>) => {
      setSheetConfigs((prev) =>
        prev.map((c) =>
          c.sheetName === sheetName ? { ...c, ...updates } : c,
        ),
      )
    },
    [],
  )

  // ── Import indítás ─────────────────────────────────────────
  const handleImport = useCallback(() => {
    if (!file) return

    const enabledConfigs = sheetConfigs.filter(
      (c) => c.enabled && c.profileKey,
    )
    if (enabledConfigs.length === 0) {
      toast.error('Legalább egy sheet-et ki kell választani profillal.')
      return
    }

    setStep('importing')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('module', module)
    formData.append(
      'config',
      JSON.stringify(
        enabledConfigs.map((c) => ({
          sheetName: c.sheetName,
          profileKey: c.profileKey,
        })),
      ),
    )

    startImporting(async () => {
      const result = await executeBatchImport(formData)
      setImportResult(result)
      setStep('result')

      if (result.success) {
        toast.success(
          `Import kész: ${result.insertedCount ?? 0} sor beszúrva` +
            (result.skippedCount ? `, ${result.skippedCount} kihagyva` : ''),
        )
      } else {
        toast.error(result.error || 'Az import sikertelen.')
      }
    })
  }, [file, module, sheetConfigs])

  // ── Újrakezdés ─────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep('upload')
    setFile(null)
    setParseResult(null)
    setSheetConfigs([])
    setImportResult(null)
    setExpandedSheet(null)
  }, [])

  const enabledCount = sheetConfigs.filter((c) => c.enabled && c.profileKey).length
  const totalRows = sheetConfigs
    .filter((c) => c.enabled && c.profileKey)
    .reduce((sum, c) => {
      const sheet = parseResult?.sheets?.find((s) => s.sheetName === c.sheetName)
      return sum + (sheet?.rowCount ?? 0)
    }, 0)

  if (!canImport) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
        <p className="font-semibold">Az import jelenleg nem elérhető.</p>
        <p className="mt-1">Rendszergazdai vagy delegált import jogosultság szükséges.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Fejléc ──────────────────────────────────── */}
      <div className="card-raised relative overflow-hidden p-5">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 text-violet-600" />
          <div>
            <h4 className="font-heading text-lg text-slate-800">
              Multi-sheet Excel import — {moduleLabel}
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Tölts fel egy Excel fájlt — a rendszer felismeri a füleket,
              javasol profilt, és batch-ben szúrja be az adatokat.
            </p>
          </div>
        </div>
      </div>

      {/* ── 1. Fájl feltöltés ──────────────────────── */}
      {(step === 'upload' || step === 'preview') && (
        <div className="card-raised p-5">
          <label className="block text-sm font-semibold text-slate-700">
            Excel / CSV fájl
          </label>
          <div className="mt-2 flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
              <Upload className="size-4" />
              <span>{file ? 'Másik fájl' : 'Fájl választás'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            {file && (
              <span className="text-sm text-slate-500">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </span>
            )}
            {isParsing && (
              <span className="flex items-center gap-1.5 text-sm text-violet-600">
                <Loader2 className="size-4 animate-spin" />
                Elemzés...
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── 2. Sheet előnézet + profil társítás ────── */}
      {step === 'preview' && parseResult?.sheets && (
        <>
          <div className="card-raised p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">
                  {parseResult.sheets.length} fül találva
                </span>
              </div>
              <span className="text-sm text-slate-500">
                {enabledCount} kiválasztva · {totalRows} sor
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {parseResult.sheets.map((sheet) => {
                const config = sheetConfigs.find(
                  (c) => c.sheetName === sheet.sheetName,
                )
                const expanded = expandedSheet === sheet.sheetName

                return (
                  <SheetCard
                    key={sheet.sheetName}
                    sheet={sheet}
                    config={config}
                    profiles={profiles}
                    expanded={expanded}
                    onToggleExpand={() =>
                      setExpandedSheet(expanded ? null : sheet.sheetName)
                    }
                    onUpdateConfig={(updates) =>
                      updateSheetConfig(sheet.sheetName, updates)
                    }
                  />
                )
              })}
            </div>
          </div>

          {/* Import gomb */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleImport}
              disabled={enabledCount === 0 || isImporting}
              className="rounded-full bg-violet-600 hover:bg-violet-700"
            >
              {isImporting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-4" />
              )}
              {isImporting
                ? 'Import folyamatban...'
                : `Import ind\u00edt\u00e1sa (${enabledCount} f\u00fcl, ${totalRows} sor)`}
            </Button>
            <Button variant="outline" onClick={handleReset} className="rounded-full">
              <X className="mr-1 size-4" /> Mégsem
            </Button>
          </div>
        </>
      )}

      {/* ── 3. Import folyamatban ──────────────────── */}
      {step === 'importing' && (
        <div className="card-raised flex items-center gap-3 p-8">
          <Loader2 className="size-6 animate-spin text-violet-600" />
          <span className="text-lg text-slate-700">Import folyamatban...</span>
        </div>
      )}

      {/* ── 4. Eredmény ───────────────────────────── */}
      {step === 'result' && importResult && (
        <div className="space-y-3">
          <div
            className={`card-raised p-5 ${
              importResult.success
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-red-200 bg-red-50/50'
            }`}
          >
            <div className="flex items-start gap-3">
              {importResult.success ? (
                <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 size-5 text-red-600" />
              )}
              <div>
                <p className="font-semibold text-slate-800">
                  {importResult.success
                    ? 'Import sikeresen befejez\u0151d\u00f6tt!'
                    : importResult.error || 'Az import sikertelen.'}
                </p>
                {importResult.success && (
                  <p className="mt-1 text-sm text-slate-600">
                    {importResult.insertedCount ?? 0} sor beszúrva
                    {importResult.skippedCount
                      ? ` \u00b7 ${importResult.skippedCount} sor kihagyva`
                      : ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Hibás sorok */}
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="card-raised max-h-60 overflow-y-auto p-4">
              <p className="mb-2 text-sm font-semibold text-red-700">
                Hibás sorok ({importResult.errors.length}):
              </p>
              <div className="space-y-1">
                {importResult.errors.map((err, idx) => (
                  <p key={idx} className="text-xs text-red-600">
                    <span className="font-mono">[{err.sheet}:{err.row}]</span>{' '}
                    {err.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleReset} className="rounded-full">
            Új import
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SheetCard — egyetlen sheet előnézete
// ---------------------------------------------------------------------------

function SheetCard({
  sheet,
  config,
  profiles,
  expanded,
  onToggleExpand,
  onUpdateConfig,
}: {
  sheet: ParsedSheetPreview
  config: SheetConfig | undefined
  profiles: ImportProfile[]
  expanded: boolean
  onToggleExpand: () => void
  onUpdateConfig: (updates: Partial<SheetConfig>) => void
}) {
  const isEnabled = config?.enabled ?? false
  const hasWarning = !!sheet.warning
  const isEmpty = sheet.rowCount === 0

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isEnabled
          ? 'border-violet-200 bg-violet-50/50'
          : 'border-slate-150 bg-white'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-violet-700"
        >
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <Table2 className="size-4" />
          {sheet.sheetName}
        </button>

        <span className="text-xs text-slate-400">
          {sheet.rowCount} sor · {sheet.headers.length} oszlop
        </span>

        {hasWarning && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="size-3" />
            {sheet.warning}
          </span>
        )}

        {!hasWarning && !isEmpty && (
          <div className="ml-auto flex items-center gap-2">
            {/* Profil választó */}
            <select
              value={config?.profileKey || ''}
              onChange={(e) => {
                const key = e.target.value || null
                onUpdateConfig({ profileKey: key, enabled: !!key })
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm"
            >
              <option value="">--- Kihagyás ---</option>
              {profiles.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>

            {/* Enable toggle */}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) =>
                  onUpdateConfig({ enabled: e.target.checked })
                }
                disabled={!config?.profileKey}
                className="rounded border-slate-300"
              />
              Import
            </label>
          </div>
        )}
      </div>

      {/* Kinyitott tartalom: fejlécek + mintasorok */}
      {expanded && !hasWarning && sheet.headers.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Oszlopok: {sheet.headers.join(' \u00b7 ')}
          </p>

          {sheet.sampleRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {sheet.headers.map((h) => (
                      <th
                        key={h}
                        className="border-b border-slate-100 px-2 py-1 text-left font-medium text-slate-600"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.sampleRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {sheet.headers.map((h) => (
                        <td
                          key={h}
                          className="border-b border-slate-50 px-2 py-1 text-slate-500"
                        >
                          {row[h] != null ? String(row[h]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Profil info */}
          {config?.profileKey && (
            <div className="mt-3 rounded-lg bg-violet-50/80 px-3 py-2">
              <p className="text-xs font-semibold text-violet-700">
                Profil: {profiles.find((p) => p.key === config.profileKey)?.label}
              </p>
              <p className="mt-0.5 text-xs text-violet-600/80">
                Céltábla:{' '}
                {profiles.find((p) => p.key === config.profileKey)?.targetTable}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
