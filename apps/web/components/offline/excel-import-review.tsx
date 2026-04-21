'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSearch,
  FileWarning,
  FolderOpen,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  computeModuleDiff,
  type ModuleDiff,
  type RowDiff,
  type SheetDiff,
} from '@/lib/offline/excel-import-diff'
import { parseExcelModule } from '@/lib/offline/excel-reader'
import {
  ensurePermission,
  getOrCreateKartotekaDir,
  getStoredRootHandle,
  isFileSystemAccessSupported,
  readFile,
} from '@/lib/offline/fs-handle-store'
import { getAllExcelSchemas } from '@/lib/offline/excel-schema/registry'
import { getDb } from '@/lib/offline/db'
import { enqueue } from '@/lib/offline/mutation-queue'

/**
 * Excel Import Review — P4.5.
 *
 * A lelkész a mappájában megnyitotta valamelyik Excel-t, és módosított
 * benne. A rendszer:
 *  1. Beolvassa a fájlokat a stored FileSystemDirectoryHandle-lel
 *  2. Parse-olja őket (excel-reader)
 *  3. Összehasonlítja a Dexie snapshot-tal (excel-import-diff)
 *  4. Diff-eket kategorizálja: Új / Módosítás / Törlés / Konfliktus
 *  5. A user sor-szintű checkbox-okkal jelöli, mit fogad el
 *  6. "Alkalmaz" → mutation_queue-ba kerülnek a változások (P4.6)
 */

interface ModuleDiffState {
  module: string
  fileName: string
  diff: ModuleDiff | null
  error: string | null
  warnings: string[]
  loading: boolean
}

interface RowSelection {
  // Kulcs: `${module}:${sheetIndex}:${section}:${rowIndex}`
  [key: string]: boolean
}

const sectionLabels: Record<string, string> = {
  added: 'Új sorok',
  updated: 'Módosítások',
  deleted: 'Törlések',
}

const sectionColors: Record<string, { bg: string; text: string; border: string }> = {
  added: { bg: 'bg-emerald-50/60', text: 'text-emerald-700', border: 'border-emerald-200' },
  updated: { bg: 'bg-amber-50/60', text: 'text-amber-700', border: 'border-amber-200' },
  deleted: { bg: 'bg-red-50/60', text: 'text-red-700', border: 'border-red-200' },
}

export function ExcelImportReview({
  congregationId,
  congregationSlug,
}: {
  congregationId: string | null
  congregationSlug: string
}) {
  // SSR-safe mount guard (File System Access API csak kliens)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setMounted(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const [isScanning, startScan] = useTransition()
  const [isApplying, startApply] = useTransition()
  const [hasHandle, setHasHandle] = useState<boolean | null>(null)
  const [folderName, setFolderName] = useState('')
  const [moduleStates, setModuleStates] = useState<ModuleDiffState[]>([])
  const [selection, setSelection] = useState<RowSelection>({})
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const isSupported = mounted ? isFileSystemAccessSupported() : false

  // Kezdeti handle ellenőrzés
  const refreshHandleState = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      setHasHandle(false)
      return
    }
    const handle = await getStoredRootHandle()
    if (handle) {
      setHasHandle(true)
      setFolderName(handle.name)
    } else {
      setHasHandle(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refreshHandleState()
    })
    return () => {
      cancelled = true
    }
  }, [refreshHandleState])

  // Scan → minden modul Excel-jét beolvasni + diff
  function handleScan() {
    if (!congregationId) {
      toast.error('Nincs aktív gyülekezet.')
      return
    }

    startScan(async () => {
      const handle = await getStoredRootHandle()
      if (!handle) {
        toast.error('Nincs kiválasztott mappa. Menj a /offline oldalra.')
        return
      }
      const granted = await ensurePermission(handle)
      if (!granted) {
        toast.error('A mappa nem olvasható — adj engedélyt.')
        return
      }

      let congDir: FileSystemDirectoryHandle
      try {
        congDir = await getOrCreateKartotekaDir(handle, congregationSlug)
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'A gyülekezeti mappa nem elérhető.',
        )
        return
      }

      const schemas = getAllExcelSchemas()
      const newStates: ModuleDiffState[] = schemas.map(s => ({
        module: s.module,
        fileName: s.fileName,
        diff: null,
        error: null,
        warnings: [],
        loading: true,
      }))
      setModuleStates(newStates)

      // Minden modul parsel + diff párhuzamosan
      const results = await Promise.all(
        schemas.map(async (schema): Promise<ModuleDiffState> => {
          try {
            const file = await readFile(congDir, schema.fileName)
            if (!file) {
              return {
                module: schema.module,
                fileName: schema.fileName,
                diff: null,
                error: 'A fájl még nem létezik. Először exportálj.',
                warnings: [],
                loading: false,
              }
            }

            const parsed = await parseExcelModule(file, schema)
            const diff = await computeModuleDiff(
              parsed,
              schema,
              congregationId,
            )

            return {
              module: schema.module,
              fileName: schema.fileName,
              diff,
              error: null,
              warnings: diff.warnings,
              loading: false,
            }
          } catch (e) {
            return {
              module: schema.module,
              fileName: schema.fileName,
              diff: null,
              error: e instanceof Error ? e.message : String(e),
              warnings: [],
              loading: false,
            }
          }
        }),
      )

      setModuleStates(results)

      // Kezdetben minden módosítást BEPIPÁLVA (a user letiltja amit nem akar)
      // DE: konfliktusos sorokat NEM pipáljuk be alapból
      const initialSelection: RowSelection = {}
      const initialExpanded = new Set<string>()
      for (const s of results) {
        if (!s.diff) continue
        const hasChanges = s.diff.totalChanges > 0
        if (hasChanges) initialExpanded.add(s.module)

        s.diff.sheets.forEach((sheet, sheetIdx) => {
          sheet.added.forEach((_row, rowIdx) => {
            const key = `${s.module}:${sheetIdx}:added:${rowIdx}`
            initialSelection[key] = true
          })
          sheet.updated.forEach((row, rowIdx) => {
            const key = `${s.module}:${sheetIdx}:updated:${rowIdx}`
            initialSelection[key] = !row.hasConflict // konfliktus → nem default
          })
          sheet.deleted.forEach((_row, rowIdx) => {
            const key = `${s.module}:${sheetIdx}:deleted:${rowIdx}`
            initialSelection[key] = false // Biztonság kedvéért NE alapértelmezetten töröljünk
          })
        })
      }
      setSelection(initialSelection)
      setExpandedModules(initialExpanded)

      const totalChanges = results.reduce(
        (s, r) => s + (r.diff?.totalChanges || 0),
        0,
      )
      const totalConflicts = results.reduce(
        (s, r) => s + (r.diff?.totalConflicts || 0),
        0,
      )

      if (totalChanges === 0) {
        toast.success('Minden Excel fájl szinkron — nincs változás.')
      } else if (totalConflicts > 0) {
        toast.warning(
          `${totalChanges} változás + ${totalConflicts} konfliktus. Ellenőrizd a sárga sorokat!`,
        )
      } else {
        toast.info(`${totalChanges} észlelt változás. Ellenőrizd és alkalmazd.`)
      }
    })
  }

  // Manuális fájl-feltöltés (nem a stored handle-ből, hanem a user által
  // kiválasztott egyetlen fájlból). Hasznos, ha a user azonnal akar
  // egy konkrét Excel-fájlt importálni a watcher 60s polling helyett.
  function handleManualFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset, hogy ugyanaz a fájl mégegyszer feltölthető legyen

    if (!congregationId) {
      toast.error('Nincs aktív gyülekezet.')
      return
    }

    // A fájlnévből keressük meg a megfelelő schema-t
    const schemas = getAllExcelSchemas()
    const schema = schemas.find(s => s.fileName === file.name)
    if (!schema) {
      toast.error(
        `Nem ismerem fel a fájlt: ${file.name}. ` +
          `Csak az ismert KARTOTEKA Excel fájlok támogatottak (${schemas.map(s => s.fileName).join(', ')}).`,
      )
      return
    }

    startScan(async () => {
      try {
        const parsed = await parseExcelModule(file, schema)
        const diff = await computeModuleDiff(parsed, schema, congregationId)

        const newState: ModuleDiffState = {
          module: schema.module,
          fileName: schema.fileName,
          diff,
          error: null,
          warnings: diff.warnings,
          loading: false,
        }

        // Csak ezt az egy modult mutatjuk
        setModuleStates([newState])

        // Selection inicializálás
        const initialSelection: RowSelection = {}
        const initialExpanded = new Set<string>([schema.module])
        diff.sheets.forEach((sheet, sheetIdx) => {
          sheet.added.forEach((_row, rowIdx) => {
            initialSelection[`${schema.module}:${sheetIdx}:added:${rowIdx}`] = true
          })
          sheet.updated.forEach((row, rowIdx) => {
            initialSelection[`${schema.module}:${sheetIdx}:updated:${rowIdx}`] =
              !row.hasConflict
          })
          sheet.deleted.forEach((_row, rowIdx) => {
            initialSelection[`${schema.module}:${sheetIdx}:deleted:${rowIdx}`] = false
          })
        })
        setSelection(initialSelection)
        setExpandedModules(initialExpanded)

        if (diff.totalChanges === 0) {
          toast.success(`${file.name}: minden szinkron, nincs változás.`)
        } else if (diff.totalConflicts > 0) {
          toast.warning(
            `${file.name}: ${diff.totalChanges} változás + ${diff.totalConflicts} konfliktus.`,
          )
        } else {
          toast.info(
            `${file.name}: ${diff.totalChanges} észlelt változás. Ellenőrizd.`,
          )
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'A fájl olvasása sikertelen.',
        )
      }
    })
  }

  // Toggle row-sel
  function toggleRow(key: string) {
    setSelection(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleSection(module: string, sheetIdx: number, section: 'added' | 'updated' | 'deleted', rows: RowDiff[], checked: boolean) {
    setSelection(prev => {
      const next = { ...prev }
      rows.forEach((_, rowIdx) => {
        next[`${module}:${sheetIdx}:${section}:${rowIdx}`] = checked
      })
      return next
    })
  }

  function toggleModuleExpanded(mod: string) {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  function toggleRowExpanded(key: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Összesítés — hány sor lesz elfogadva
  const summary = useMemo(() => {
    let added = 0
    let updated = 0
    let deleted = 0
    for (const s of moduleStates) {
      if (!s.diff) continue
      s.diff.sheets.forEach((sheet, sheetIdx) => {
        sheet.added.forEach((_, rowIdx) => {
          if (selection[`${s.module}:${sheetIdx}:added:${rowIdx}`]) added += 1
        })
        sheet.updated.forEach((_, rowIdx) => {
          if (selection[`${s.module}:${sheetIdx}:updated:${rowIdx}`]) updated += 1
        })
        sheet.deleted.forEach((_, rowIdx) => {
          if (selection[`${s.module}:${sheetIdx}:deleted:${rowIdx}`]) deleted += 1
        })
      })
    }
    return { added, updated, deleted, total: added + updated + deleted }
  }, [moduleStates, selection])

  // Apply (P4.6) — a kiválasztott változásokat beteszi a mutation_queue-ba
  function handleApply() {
    if (!congregationId) {
      toast.error('Nincs aktív gyülekezet.')
      return
    }
    if (summary.total === 0) {
      toast.info('Nincs kiválasztott változás.')
      return
    }

    const confirmMsg = `${summary.total} változás alkalmazása:\n  • ${summary.added} új sor\n  • ${summary.updated} módosítás\n  • ${summary.deleted} törlés\n\nMegerősíted?`
    if (!confirm(confirmMsg)) return

    startApply(async () => {
      const db = getDb()
      let applied = 0
      let failed = 0

      for (const s of moduleStates) {
        if (!s.diff) continue

        for (let sheetIdx = 0; sheetIdx < s.diff.sheets.length; sheetIdx++) {
          const sheet = s.diff.sheets[sheetIdx]

          // Új sorok
          for (let rowIdx = 0; rowIdx < sheet.added.length; rowIdx++) {
            const key = `${s.module}:${sheetIdx}:added:${rowIdx}`
            if (!selection[key]) continue
            const row = sheet.added[rowIdx]
            try {
              const payload = {
                ...row.excelRow!.values,
                congregation_id: congregationId,
              }
              // Dexie insert (optimistic)
              const dexieTable = db.table(sheet.dexieTable)
              const localId = await dexieTable.add({
                ...payload,
                _syncStatus: 'pending',
                _baseRevision: 0,
              })
              // Queue
              await enqueue({
                table: sheet.dexieTable,
                op: 'insert',
                payload: { ...payload, id: localId },
                baseRevision: null,
              })
              applied += 1
            } catch (e) {
              console.error('[excel-import apply added]', e)
              failed += 1
            }
          }

          // Módosítások
          for (let rowIdx = 0; rowIdx < sheet.updated.length; rowIdx++) {
            const key = `${s.module}:${sheetIdx}:updated:${rowIdx}`
            if (!selection[key]) continue
            const row = sheet.updated[rowIdx]
            try {
              const payload = {
                ...(row.dexieRecord || {}),
                ...row.excelRow!.values,
                id: row.rowId,
              }
              const dexieTable = db.table(sheet.dexieTable)
              await dexieTable.update(row.rowId as string | number, {
                ...row.excelRow!.values,
                _syncStatus: 'pending',
              })
              await enqueue({
                table: sheet.dexieTable,
                op: 'update',
                payload,
                baseRevision:
                  (row.dexieRecord?.revision as number | undefined) ?? 0,
              })
              applied += 1
            } catch (e) {
              console.error('[excel-import apply updated]', e)
              failed += 1
            }
          }

          // Törlések — MEGERŐSÍTÉS után
          for (let rowIdx = 0; rowIdx < sheet.deleted.length; rowIdx++) {
            const key = `${s.module}:${sheetIdx}:deleted:${rowIdx}`
            if (!selection[key]) continue
            const row = sheet.deleted[rowIdx]
            try {
              const dexieTable = db.table(sheet.dexieTable)
              await dexieTable.update(row.rowId as string | number, {
                _pendingDelete: true,
                _syncStatus: 'deleting',
              })
              await enqueue({
                table: sheet.dexieTable,
                op: 'delete',
                payload: { id: row.rowId },
                baseRevision:
                  (row.dexieRecord?.revision as number | undefined) ?? 0,
              })
              applied += 1
            } catch (e) {
              console.error('[excel-import apply deleted]', e)
              failed += 1
            }
          }
        }
      }

      if (failed > 0) {
        toast.warning(
          `${applied} változás alkalmazva, ${failed} sikertelen. A hibákat a konzolban találod.`,
        )
      } else {
        toast.success(
          `${applied} változás alkalmazva! A szinkron elindult a háttérben.`,
        )
      }

      // Reset → új scan-re készen állunk
      setModuleStates([])
      setSelection({})
      setExpandedModules(new Set())
      setExpandedRows(new Set())
    })
  }

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="card-raised p-6">
        <div className="flex items-center gap-2 text-sm italic text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Betöltés...
        </div>
      </div>
    )
  }

  if (!isSupported) {
    return (
      <div className="card-raised overflow-hidden">
        <div className="border-b border-red-200 bg-red-50/60 px-5 py-3">
          <h3 className="font-heading text-lg text-red-800">
            Nem támogatott böngésző
          </h3>
        </div>
        <div className="p-5 text-sm text-red-900">
          A File System Access API csak Chrome/Edge/Brave alapú böngészőkben
          érhető el. Firefox és Safari jelenleg nem támogatott.
        </div>
      </div>
    )
  }

  if (!hasHandle) {
    return (
      <div className="card-raised overflow-hidden">
        <div className="border-b border-slate-100 bg-amber-50/60 px-5 py-3">
          <h3 className="font-heading text-lg text-amber-800">
            Nincs kiválasztott mappa
          </h3>
        </div>
        <div className="space-y-3 p-5 text-sm text-slate-700">
          <p>
            Az Excel fájlok beolvasásához először ki kell választanod egy mappát
            a <code>/offline</code> oldalon.
          </p>
          <a
            href="/offline"
            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3 py-2 text-sm font-medium text-teal-700 shadow-sm hover:bg-teal-50"
          >
            <FolderOpen className="h-4 w-4" />
            Ugrás az Offline mentés oldalra
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Top kártya — folder info + scan */}
      <div className="card-raised overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-indigo-50/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-indigo-600" />
            <h3 className="font-heading text-lg text-slate-800">
              Excel változások áttekintése
            </h3>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              Fázis 4
            </span>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Aktív mappa: <code className="font-mono">{folderName}</code>
                </p>
                <p className="text-xs text-slate-500">
                  Olvasott útvonal:{' '}
                  <code className="font-mono">
                    {folderName}/KARTOTEKA/{congregationSlug}/
                  </code>
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                onClick={handleScan}
                disabled={isScanning || isApplying}
              >
                {isScanning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                {isScanning ? 'Beolvasás...' : 'Mind ellenőrzése'}
              </Button>
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 ${
                  isScanning || isApplying ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                <Upload className="h-4 w-4" />
                Egy fájl feltöltése
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleManualFileSelect}
                  disabled={isScanning || isApplying}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs text-indigo-900">
            <p className="font-semibold">Hogyan működik?</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5 pl-1">
              <li>
                A rendszer beolvassa az Excel fájlokat a helyi mappából
              </li>
              <li>
                Sorról-sorra összehasonlítja a szerver adatokkal
              </li>
              <li>Kategorizálja: új / módosítás / törlés / konfliktus</li>
              <li>
                Te döntesz, melyik változást fogadod el → „Alkalmaz&rdquo; →
                szinkronizálás
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Eredmények */}
      {moduleStates.length > 0 && (
        <div className="space-y-4">
          {moduleStates.map(state => {
            const expanded = expandedModules.has(state.module)
            const hasChanges = (state.diff?.totalChanges || 0) > 0
            const conflicts = state.diff?.totalConflicts || 0

            return (
              <div
                key={state.module}
                className="card-raised overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleModuleExpanded(state.module)}
                  className={`flex w-full items-center justify-between border-b px-5 py-3 text-left transition-colors ${
                    hasChanges
                      ? 'border-indigo-100 bg-indigo-50/30 hover:bg-indigo-50/60'
                      : 'border-slate-100 bg-slate-50/30 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                    <h4 className="font-heading text-base text-slate-800">
                      {state.fileName}
                    </h4>
                    {state.loading && (
                      <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin text-slate-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {state.error && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        Hiba
                      </span>
                    )}
                    {!state.error && !state.loading && !hasChanges && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        Szinkronban
                      </span>
                    )}
                    {!state.error && hasChanges && (
                      <>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700">
                          {state.diff?.totalChanges} változás
                        </span>
                        {conflicts > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                            <FileWarning className="mr-1 inline h-3 w-3" />
                            {conflicts} konfliktus
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="divide-y divide-slate-100">
                    {state.error && (
                      <div className="bg-red-50/30 px-5 py-3 text-sm text-red-900">
                        <AlertTriangle className="mr-1 inline h-4 w-4" />
                        {state.error}
                      </div>
                    )}

                    {state.warnings.length > 0 && (
                      <div className="bg-amber-50/30 px-5 py-3 text-xs text-amber-900">
                        <p className="font-semibold">Figyelmeztetések:</p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5">
                          {state.warnings.slice(0, 5).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                          {state.warnings.length > 5 && (
                            <li className="italic text-amber-700">
                              …és még {state.warnings.length - 5} figyelmeztetés
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {state.diff?.sheets.map((sheet, sheetIdx) => (
                      <SheetDiffBlock
                        key={`${state.module}:${sheetIdx}`}
                        sheet={sheet}
                        moduleKey={state.module}
                        sheetIdx={sheetIdx}
                        selection={selection}
                        onToggleRow={toggleRow}
                        onToggleSection={(section, rows, checked) =>
                          toggleSection(
                            state.module,
                            sheetIdx,
                            section,
                            rows,
                            checked,
                          )
                        }
                        expandedRows={expandedRows}
                        onToggleRowExpanded={toggleRowExpanded}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky alsó panel — summary + Alkalmaz */}
      {moduleStates.length > 0 && summary.total > 0 && (
        <div className="sticky bottom-0 z-20 -mx-4 rounded-t-2xl border-t-2 border-indigo-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:mx-0 sm:rounded-xl sm:border-2 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-heading text-base text-slate-800">
                Összegzés:
              </span>
              {summary.added > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  <Plus className="h-3 w-3" />
                  {summary.added} új
                </span>
              )}
              {summary.updated > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <RefreshCw className="h-3 w-3" />
                  {summary.updated} módosítás
                </span>
              )}
              {summary.deleted > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  <Trash2 className="h-3 w-3" />
                  {summary.deleted} törlés
                </span>
              )}
            </div>
            <Button
              size="lg"
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
              onClick={handleApply}
              disabled={isApplying || isScanning}
            >
              {isApplying ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="mr-1.5 h-4 w-4" />
              )}
              {isApplying
                ? 'Alkalmazás folyamatban...'
                : `${summary.total} változás alkalmazása`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sheet-szintű blokk (added / updated / deleted szekciók)
// ─────────────────────────────────────────────────────────────────

function SheetDiffBlock({
  sheet,
  moduleKey,
  sheetIdx,
  selection,
  onToggleRow,
  onToggleSection,
  expandedRows,
  onToggleRowExpanded,
}: {
  sheet: SheetDiff
  moduleKey: string
  sheetIdx: number
  selection: RowSelection
  onToggleRow: (key: string) => void
  onToggleSection: (
    section: 'added' | 'updated' | 'deleted',
    rows: RowDiff[],
    checked: boolean,
  ) => void
  expandedRows: Set<string>
  onToggleRowExpanded: (key: string) => void
}) {
  const sections: Array<{
    key: 'added' | 'updated' | 'deleted'
    rows: RowDiff[]
  }> = [
    { key: 'added', rows: sheet.added },
    { key: 'updated', rows: sheet.updated },
    { key: 'deleted', rows: sheet.deleted },
  ]

  const hasAny = sections.some(s => s.rows.length > 0)
  if (!hasAny && sheet.unchangedCount === 0) {
    return null
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex items-center justify-between">
        <h5 className="font-heading text-sm font-semibold text-slate-700">
          📄 {sheet.sheetName}
          {sheet.unchangedCount > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({sheet.unchangedCount} változatlan sor)
            </span>
          )}
        </h5>
      </div>

      {sections.map(({ key, rows }) => {
        if (rows.length === 0) return null
        const colors = sectionColors[key]
        const allSelected = rows.every(
          (_, idx) =>
            selection[`${moduleKey}:${sheetIdx}:${key}:${idx}`] === true,
        )
        const noneSelected = rows.every(
          (_, idx) => !selection[`${moduleKey}:${sheetIdx}:${key}:${idx}`],
        )

        return (
          <div
            key={key}
            className={`overflow-hidden rounded-lg border ${colors.border} ${colors.bg}`}
          >
            <div className="flex items-center justify-between border-b border-current/10 px-3 py-2">
              <div className={`text-xs font-semibold ${colors.text}`}>
                {key === 'added' && <Plus className="mr-1 inline h-3 w-3" />}
                {key === 'updated' && (
                  <RefreshCw className="mr-1 inline h-3 w-3" />
                )}
                {key === 'deleted' && (
                  <Trash2 className="mr-1 inline h-3 w-3" />
                )}
                {sectionLabels[key]} ({rows.length})
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 ${colors.text} hover:bg-white`}
                  onClick={() => onToggleSection(key, rows, !allSelected)}
                  disabled={allSelected && !noneSelected}
                >
                  {allSelected ? 'Összes kipipálva' : 'Összes kijelölése'}
                </button>
                {!noneSelected && (
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-white"
                    onClick={() => onToggleSection(key, rows, false)}
                  >
                    Egyik sem
                  </button>
                )}
              </div>
            </div>

            <ul className="divide-y divide-current/5">
              {rows.map((row, rowIdx) => {
                const rowKey = `${moduleKey}:${sheetIdx}:${key}:${rowIdx}`
                const checked = selection[rowKey] || false
                const expanded = expandedRows.has(rowKey)
                const hasFieldDiffs = row.fieldDiffs.length > 0

                return (
                  <li
                    key={rowKey}
                    className="flex flex-col gap-1 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleRow(rowKey)}
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span
                        className={`flex-1 ${
                          row.hasConflict
                            ? 'font-semibold text-amber-900'
                            : 'text-slate-800'
                        }`}
                      >
                        {row.displayLabel}
                      </span>
                      {row.hasConflict && (
                        <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />
                          Konfliktus
                        </span>
                      )}
                      {hasFieldDiffs && (
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-700"
                          onClick={() => onToggleRowExpanded(rowKey)}
                          aria-label="Részletek"
                        >
                          {expanded ? (
                            <Minus className="h-3 w-3" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Field-szintű részletek update esetén */}
                    {expanded && hasFieldDiffs && (
                      <div className="ml-6 mt-1 overflow-hidden rounded border border-slate-200 bg-white">
                        <table className="w-full text-[11px]">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="px-2 py-1 text-left font-semibold">
                                Mező
                              </th>
                              <th className="px-2 py-1 text-left font-semibold">
                                Régi (DB)
                              </th>
                              <th className="px-2 py-1 text-left font-semibold">
                                Új (Excel)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {row.fieldDiffs.map((d, i) => (
                              <tr key={i}>
                                <td className="px-2 py-1 font-mono text-slate-700">
                                  {d.field}
                                </td>
                                <td className="px-2 py-1 text-slate-500">
                                  {formatVal(d.oldValue)}
                                </td>
                                <td className="px-2 py-1 text-indigo-700">
                                  {formatVal(d.newValue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {key === 'added' && expanded === false && row.excelRow && (
                      <div className="ml-6 text-[11px] italic text-slate-500">
                        Excel sor {row.excelRow.excelRowIndex}
                      </div>
                    )}
                    {key === 'deleted' && (
                      <div className="ml-6 text-[11px] italic text-red-700">
                        <X className="mr-0.5 inline h-2.5 w-2.5" />
                        Töröld a szerveren is?
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// Egy érték formázása a field-diff táblához
function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Igen' : 'Nem'
  if (typeof v === 'number') return v.toLocaleString('hu-HU')
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v)
  return s.length > 60 ? s.slice(0, 57) + '...' : s
}
