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
  Check,
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

/** A lépés-jelző címkéi és a VALÓDI állapothoz kötése (nem díszlet). */
const LEPESEK = ['Fájl', 'Ellenőrzés', 'Importálás'] as const
const LEPES_SORSZAM: Record<ImportStep, number> = {
  upload: 1,
  preview: 2,
  importing: 3,
  result: 4,
}

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
  const [dragActive, setDragActive] = useState(false)
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isImporting, startImporting] = useTransition()

  // ── Fájl kiválasztás ──────────────────────────────────────
  // 2026-08-27: a fájl FILE-ként érkezik (nem eseményből), hogy a
  // drag-and-drop és a tallózás UGYANAZT az utat járja.
  const handleFile = useCallback(
    (selected: File | null | undefined) => {
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
        // ⚠️ MEMÓRIAMÁSOLAT: a fájlválasztás és az import között percek
        // telhetnek (fül-párosítás). Ha közben a fájlt mentik/mozgatják, az
        // eredeti File-referencia elavul, és az import ERR_UPLOAD_FILE_CHANGED
        // hibával hasal el. (A leltár-varázsló ezt már így csinálja.)
        try {
          const buffer = await selected.arrayBuffer()
          setFile(new File([buffer], selected.name, { type: selected.type }))
        } catch {
          toast.error('A fájl beolvasása sikertelen — válaszd ki újra.')
          setFile(null)
          return
        }
        const result = await parseAndPreview(formData)
        setParseResult(result)

        // 2026-08-26: a hivatalos Leltar 3_43 munkafüzetet a szerver felismeri —
        // annak a fejlécei a 3–4. sorban vannak, a generikus út rossz importot
        // adna, ezért a dedikált importálóhoz irányítunk.
        if (result.success && result.leltar343) {
          setFile(null)
          setParseResult(null)
          toast.info(
            'Ez a hivatalos Leltar 3_43 munkafüzet — a lap tetején lévő „Leltar 3_43 munkafüzet importálása" varázslóval töltsd fel, ott minden lapját és celláját felismerjük.',
            { duration: 12000 },
          )
          return
        }

        if (result.success && result.sheets) {
          // 2026-08-27: ha a modulnak PONTOSAN EGY profilja van, felkínáljuk
          // (a lap-név alapú javaslat CSV-nél amúgy is mindig üres, mert a lap
          // neve 'Sheet1' — a felhasználó tanácstalanul nézte a letiltott
          // „Import indítása" gombot).
          //
          // ⚠️ DE NEM KAPCSOLJUK BE MAGÁTÓL. Egy munkafüzetnek több füle lehet,
          // és csak a felhasználó tudja, melyik az importálandó — a vak
          // bekapcsolás idegen fül tartalmát írná a modul táblájába.
          // Automatikusan CSAK a lap-név alapján felismert fül indul be.
          const egyProfil = profiles.length === 1 ? profiles[0].key : null
          const configs: SheetConfig[] = result.sheets.map((s) => ({
            sheetName: s.sheetName,
            profileKey: s.suggestedProfileKey ?? egyProfil,
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
    [module, profiles],
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

      if (result.success && (result.insertedCount ?? 0) > 0) {
        toast.success(
          `Import kész: ${result.insertedCount ?? 0} sor beszúrva` +
            (result.skippedCount ? `, ${result.skippedCount} kihagyva` : ''),
        )
      } else if (result.success) {
        // 2026-08-27: a 0 beszúrt sor NEM siker. A korábbi úlak zöld
        // „Import sikeresen befejeződött!" fejlécet adott akkor is, amikor
        // MINDEN sor kimaradt — pontosan ettől hitte a lelkész, hogy rendben van.
        toast.warning(
          `Egyetlen sor sem került be${result.skippedCount ? ` — ${result.skippedCount} sor kimaradt` : ''}.`,
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
      {/* ── Lépés-jelző: a VALÓDI állapotból (nem díszlet) ─────────── */}
      <ol
        aria-label="Az import lépései"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-3 py-2.5 sm:px-4"
      >
        {LEPESEK.map((cimke, index) => {
          const szam = index + 1
          const jelenlegi = LEPES_SORSZAM[step]
          const kesz = jelenlegi > szam
          const aktiv = jelenlegi === szam
          return (
            <li key={cimke} className="flex items-center gap-2">
              {index > 0 && <span className="hidden h-px w-5 bg-border sm:block" aria-hidden />}
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  kesz
                    ? 'bg-emerald-500 text-white dark:bg-emerald-600'
                    : aktiv
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
                aria-hidden
              >
                {kesz ? <Check className="size-3.5" /> : szam}
              </span>
              <span
                className={`text-xs font-semibold sm:text-sm ${aktiv ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {cimke}
              </span>
            </li>
          )
        })}
      </ol>

      {/* ── 1. Fájl feltöltés ──────────────────────── */}
      {(step === 'upload' || step === 'preview') && (
        <div className="card-raised p-5">
          <p className="text-sm font-semibold text-slate-700">Excel / CSV fájl</p>
          {/* 2026-08-27: EZ az egyetlen fájlfeltöltő a lapon — a fölötte lévő,
              sehova nem vezető ejtőzóna megszűnt. Drag-and-drop + tallózás. */}
          <label
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              handleFile(event.dataTransfer.files?.[0])
            }}
            className={`mt-2 flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition focus-within:ring-2 focus-within:ring-primary/40 ${
              dragActive
                ? 'border-primary bg-primary/10'
                : file
                  ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                  : 'border-primary/40 bg-primary/5 hover:border-primary/70 hover:bg-primary/10'
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                handleFile(event.target.files?.[0])
                // Ugyanazt a fájlt újraválasztva is jöjjön change-esemény.
                event.target.value = ''
              }}
              className="sr-only"
              aria-label={`${moduleLabel} importfájl kiválasztása (.xlsx, .xls vagy .csv)`}
            />
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="size-5" />
            </span>
            <span className="max-w-full break-all text-sm font-semibold text-foreground">
              {file ? file.name : `Húzd ide a(z) ${moduleLabel.toLowerCase()}-fájlt, vagy kattints a tallózáshoz`}
            </span>
            <span className="text-xs text-muted-foreground">
              {file
                ? `${(file.size / 1024).toFixed(0)} KB — kattints másik fájlért`
                : 'Elfogadott: .xlsx, .xls, .csv — max. 10 MB'}
            </span>
            {isParsing && (
              <span className="flex items-center gap-1.5 text-xs text-violet-600">
                <Loader2 className="size-3.5 animate-spin" />
                Elemzés…
              </span>
            )}
          </label>
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
              importResult.success && (importResult.insertedCount ?? 0) > 0
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-red-200 bg-red-50/50'
            }`}
          >
            <div className="flex items-start gap-3">
              {importResult.success && (importResult.insertedCount ?? 0) > 0 ? (
                <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 size-5 text-red-600" />
              )}
              <div>
                {/* 2026-08-27: a 0 besz\u00fart sor NEM siker. A r\u00e9gi alak z\u00f6ld
                    \u201eImport sikeresen befejez\u0151d\u00f6tt!" fejl\u00e9cet adott akkor is,
                    amikor MINDEN sor kimaradt \u2014 ett\u0151l hitte a lelk\u00e9sz, hogy
                    rendben van, holott semmi nem ker\u00fclt be. */}
                <p className="font-semibold text-slate-800">
                  {!importResult.success
                    ? importResult.error || 'Az import sikertelen.'
                    : (importResult.insertedCount ?? 0) > 0
                      ? 'Import sikeresen befejez\u0151d\u00f6tt!'
                      : 'Egyetlen sor sem ker\u00fclt be \u2014 n\u00e9zd \u00e1t a kimaradt sorokat.'}
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
