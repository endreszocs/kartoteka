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

import { useCallback, useRef, useState, useTransition } from 'react'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fájl kiválasztás ──────────────────────────────────────
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isParsing || isImporting) return
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
      event.target.value = ''
    },
    [module, isParsing, isImporting],
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
    <div className="space-y-4" aria-busy={isParsing || isImporting}>
      {/* ── Fejléc ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading text-lg text-foreground">
              {moduleLabel} adatainak feltöltése
            </h4>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Egyetlen fájl is elég: a rendszer felismeri a munkalapokat, profilt javasol,
              és az import előtt ellenőrizhető előnézetet készít.
            </p>
          </div>
        </div>
      </div>

      {/* ── 1. Fájl feltöltés ──────────────────────── */}
      {(step === 'upload' || step === 'preview') && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <label className="block text-sm font-semibold text-foreground">
            Excel / CSV fájl
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full rounded-xl sm:w-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing || isImporting}
            >
              <Upload className="size-4" />
              <span>{file ? 'Másik fájl' : 'Fájl választás'}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isParsing || isImporting}
            />
            {file && (
              <span className="min-w-0 break-all text-sm text-muted-foreground sm:break-normal">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </span>
            )}
            {isParsing && (
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-primary" role="status">
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
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {parseResult.sheets.length} fül találva
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={handleImport}
              disabled={enabledCount === 0 || isImporting}
              className="min-h-11 w-full rounded-xl sm:w-auto"
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
            <Button type="button" variant="outline" onClick={handleReset} className="min-h-11 w-full rounded-xl sm:w-auto">
              <X className="mr-1 size-4" /> Mégsem
            </Button>
          </div>
        </>
      )}

      {/* ── 3. Import folyamatban ──────────────────── */}
      {step === 'importing' && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6 sm:p-8" role="status">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-lg text-foreground">Import folyamatban...</span>
        </div>
      )}

      {/* ── 4. Eredmény ───────────────────────────── */}
      {step === 'result' && importResult && (
        <div className="space-y-3">
          <div
            className={`rounded-2xl border p-5 ${
              importResult.success
                ? 'border-primary/25 bg-primary/5'
                : 'border-destructive/25 bg-destructive/5'
            }`}
          >
            <div className="flex items-start gap-3">
              {importResult.success ? (
                <CheckCircle2 className="mt-0.5 size-5 text-primary" />
              ) : (
                <AlertTriangle className="mt-0.5 size-5 text-destructive" />
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {importResult.success
                    ? 'Import sikeresen befejez\u0151d\u00f6tt!'
                    : importResult.error || 'Az import sikertelen.'}
                </p>
                {importResult.success && (
                  <p className="mt-1 text-sm text-muted-foreground">
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
            <div className="max-h-60 overflow-y-auto rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
              <p className="mb-2 text-sm font-semibold text-destructive">
                Hibás sorok ({importResult.errors.length}):
              </p>
              <div className="space-y-1">
                {importResult.errors.map((err, idx) => (
                  <p key={idx} className="text-xs text-destructive">
                    <span className="font-mono">[{err.sheet}:{err.row}]</span>{' '}
                    {err.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Button type="button" onClick={handleReset} className="min-h-11 w-full rounded-xl sm:w-auto">
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
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-background'
      }`}
    >
      {/* Header */}
      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-1 text-left text-sm font-medium text-foreground transition-colors hover:text-primary"
          >
            {expanded ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            <Table2 className="size-4 shrink-0" />
            <span className="truncate">{sheet.sheetName}</span>
          </button>

          <span className="text-xs text-muted-foreground">
            {sheet.rowCount} sor · {sheet.headers.length} oszlop
          </span>

          {hasWarning && (
            <span className="flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="size-3 shrink-0" />
              {sheet.warning}
            </span>
          )}
        </div>

        {!hasWarning && !isEmpty && (
          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
            {/* Profil választó */}
            <select
              value={config?.profileKey || ''}
              onChange={(e) => {
                const key = e.target.value || null
                onUpdateConfig({ profileKey: key, enabled: !!key })
              }}
              aria-label={`${sheet.sheetName} importprofilja`}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm sm:flex-none"
            >
              <option value="">--- Kihagyás ---</option>
              {profiles.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>

            {/* Enable toggle */}
            <label className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) =>
                  onUpdateConfig({ enabled: e.target.checked })
                }
                disabled={!config?.profileKey}
                className="size-4 rounded border-border"
              />
              Import
            </label>
          </div>
        )}
      </div>

      {/* Kinyitott tartalom: fejlécek + mintasorok */}
      {expanded && !hasWarning && sheet.headers.length > 0 && (
        <div className="border-t border-border px-3 py-3 sm:px-4">
          <p className="mb-2 break-words text-xs font-semibold text-muted-foreground">
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
                        className="border-b border-border px-2 py-1 text-left font-medium text-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.sampleRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      {sheet.headers.map((h) => (
                        <td
                          key={h}
                          className="border-b border-border/60 px-2 py-1 text-muted-foreground"
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
            <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2">
              <p className="text-xs font-semibold text-primary">
                Profil: {profiles.find((p) => p.key === config.profileKey)?.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
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
