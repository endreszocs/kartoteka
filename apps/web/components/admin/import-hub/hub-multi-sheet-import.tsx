'use client'

/**
 * Import-hub multi-sheet importáló (2026-07-11).
 *
 * A közös `MultiSheetImport` (components/shared/multi-sheet-import.tsx) admin-hub
 * változata: minden szerver-hívásban átadja a `targetCongregationId`-t, így a
 * rendszergazda BÁRMELYIK gyülekezethez importálhat (a szerver-oldali action
 * ellenőrzi a jogosultságot + hatókört). Token-alapú, mobil-first megjelenés.
 *
 * Lépések: fájl kiválasztás → sheet↔profil társítás → import → eredmény.
 */

import { useCallback, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Table2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { parseAndPreview, executeBatchImport } from '@/lib/import/batch-import-actions'
import type {
  BatchImportResult,
  ParsedSheetPreview,
  ParseResult,
} from '@/lib/import/batch-import-types'
import type { ImportModule, ImportProfile } from '@/lib/import/import-profiles'

interface HubMultiSheetImportProps {
  module: ImportModule
  profiles: ImportProfile[]
  moduleLabel: string
  targetCongregationId: string
  targetCongregationName: string
}

interface SheetConfig {
  sheetName: string
  profileKey: string | null
  enabled: boolean
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'result'

const MAX_FILE_MB = 10
/** A base-ui Select nem kezel üres string értéket „nincs kiválasztva"-ként — külön szentinel. */
const NONE_VALUE = '__none__'

export function HubMultiSheetImport({
  module,
  profiles,
  moduleLabel,
  targetCongregationId,
  targetCongregationName,
}: HubMultiSheetImportProps) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>([])
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0]
      if (!selected) return

      const ext = selected.name.toLowerCase().split('.').pop()
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        toast.error('Nem támogatott formátum. Elfogadott: .xlsx, .xls, .csv')
        return
      }
      if (selected.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`A fájl mérete meghaladja a ${MAX_FILE_MB} MB-os limitet.`)
        return
      }

      setFile(selected)
      setParseResult(null)
      setSheetConfigs([])
      setImportResult(null)

      const formData = new FormData()
      formData.append('file', selected)
      formData.append('module', module)
      formData.append('targetCongregationId', targetCongregationId)

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
    [module, targetCongregationId],
  )

  const updateSheetConfig = useCallback((sheetName: string, updates: Partial<SheetConfig>) => {
    setSheetConfigs((prev) =>
      prev.map((c) => (c.sheetName === sheetName ? { ...c, ...updates } : c)),
    )
  }, [])

  const handleImport = useCallback(() => {
    if (!file) return

    const enabledConfigs = sheetConfigs.filter((c) => c.enabled && c.profileKey)
    if (enabledConfigs.length === 0) {
      toast.error('Legalább egy fület ki kell választani profillal.')
      return
    }

    setStep('importing')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('module', module)
    formData.append('targetCongregationId', targetCongregationId)
    formData.append(
      'config',
      JSON.stringify(
        enabledConfigs.map((c) => ({ sheetName: c.sheetName, profileKey: c.profileKey })),
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
  }, [file, module, sheetConfigs, targetCongregationId])

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

  return (
    <div className="space-y-4">
      {/* Fájl feltöltés */}
      {(step === 'upload' || step === 'preview') && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <Label className="text-sm font-semibold text-foreground">
            {moduleLabel} — Excel / CSV fájl
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            A rendszer felismeri a füleket, profilt javasol, és kötegelten szúrja be az adatokat a(z){' '}
            <span className="font-semibold text-foreground">{targetCongregationName}</span> gyülekezethez.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted">
              <Upload className="size-4" />
              <span>{file ? 'Másik fájl' : 'Fájl választása'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            {file && (
              <span className="text-sm text-muted-foreground">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </span>
            )}
            {isParsing && (
              <span className="inline-flex items-center gap-1.5 text-sm text-primary">
                <Loader2 className="size-4 animate-spin" />
                Elemzés…
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sheet előnézet + profil társítás */}
      {step === 'preview' && parseResult?.sheets && (
        <>
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Layers className="size-4 text-muted-foreground" />
                {parseResult.sheets.length} fül található
              </div>
              <span className="text-sm text-muted-foreground tabular-nums">
                {enabledCount} kiválasztva · {totalRows} sor
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {parseResult.sheets.map((sheet) => (
                <SheetCard
                  key={sheet.sheetName}
                  sheet={sheet}
                  config={sheetConfigs.find((c) => c.sheetName === sheet.sheetName)}
                  profiles={profiles}
                  expanded={expandedSheet === sheet.sheetName}
                  onToggleExpand={() =>
                    setExpandedSheet(expandedSheet === sheet.sheetName ? null : sheet.sheetName)
                  }
                  onUpdateConfig={(updates) => updateSheetConfig(sheet.sheetName, updates)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleImport} disabled={enabledCount === 0 || isImporting} className="gap-1.5">
              {isImporting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {isImporting
                ? 'Import folyamatban…'
                : `Import indítása (${enabledCount} fül, ${totalRows} sor)`}
            </Button>
            <Button variant="outline" onClick={handleReset} className="gap-1.5">
              <X className="size-4" /> Mégse
            </Button>
          </div>
        </>
      )}

      {/* Import folyamatban */}
      {step === 'importing' && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-base text-foreground">Import folyamatban…</span>
        </div>
      )}

      {/* Eredmény */}
      {step === 'result' && importResult && (
        <div className="space-y-3">
          <div
            className={`rounded-2xl border p-4 sm:p-5 ${
              importResult.success
                ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/30 dark:bg-emerald-950/40'
                : 'border-rose-200 bg-rose-50/70 dark:border-rose-400/30 dark:bg-rose-950/40'
            }`}
          >
            <div className="flex items-start gap-3">
              {importResult.success ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {importResult.success
                    ? 'Import sikeresen befejeződött.'
                    : importResult.error || 'Az import sikertelen.'}
                </p>
                {importResult.success && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {importResult.insertedCount ?? 0} sor beszúrva
                    {importResult.skippedCount ? ` · ${importResult.skippedCount} sor kihagyva` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {importResult.errors && importResult.errors.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-400/30 dark:bg-rose-950/30">
              <p className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                Hibás sorok ({importResult.errors.length}):
              </p>
              <div className="space-y-1">
                {importResult.errors.map((err, idx) => (
                  <p key={idx} className="text-xs text-rose-700 dark:text-rose-300">
                    <span className="font-mono">
                      [{err.sheet}:{err.row}]
                    </span>{' '}
                    {err.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleReset}>Új import</Button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SheetCard — egyetlen fül előnézete + profil társítás
// ─────────────────────────────────────────────────────────────────

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
  const profileItems: Record<string, string> = {
    [NONE_VALUE]: 'Kihagyás',
    ...Object.fromEntries(profiles.map((p) => [p.key, p.label])),
  }

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isEnabled ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-foreground transition hover:text-primary"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Table2 className="size-4" />
          <span className="break-all">{sheet.sheetName}</span>
        </button>

        <span className="text-xs text-muted-foreground tabular-nums">
          {sheet.rowCount} sor · {sheet.headers.length} oszlop
        </span>

        {hasWarning && (
          <StatusBadge intent="warning" icon={AlertTriangle}>
            {sheet.warning}
          </StatusBadge>
        )}

        {!hasWarning && !isEmpty && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              items={profileItems}
              value={config?.profileKey ?? NONE_VALUE}
              onValueChange={(value) => {
                const key = value && value !== NONE_VALUE ? String(value) : null
                onUpdateConfig({ profileKey: key, enabled: !!key })
              }}
            >
              <SelectTrigger className="min-w-40 bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Kihagyás</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => onUpdateConfig({ enabled: e.target.checked })}
                disabled={!config?.profileKey}
                className="size-4 rounded border-border accent-[var(--primary)]"
              />
              Import
            </label>
          </div>
        )}
      </div>

      {expanded && !hasWarning && sheet.headers.length > 0 && (
        <div className="border-t border-border px-3 py-3 sm:px-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Oszlopok: {sheet.headers.join(' · ')}
          </p>

          {sheet.sampleRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {sheet.headers.map((h) => (
                      <th
                        key={h}
                        className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.sampleRows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      {sheet.headers.map((h) => (
                        <td key={h} className="border-b border-border/60 px-2 py-1 text-muted-foreground">
                          {row[h] != null ? String(row[h]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {config?.profileKey && (
            <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2">
              <p className="text-xs font-semibold text-primary">
                Profil: {profiles.find((p) => p.key === config.profileKey)?.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Céltábla: {profiles.find((p) => p.key === config.profileKey)?.targetTable}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
