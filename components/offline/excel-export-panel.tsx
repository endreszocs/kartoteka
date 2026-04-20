'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FolderOpen,
  HardDriveUpload,
  Info,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  detectCloudSyncFolder,
  ensurePermission,
  forgetRootDirectory,
  getStoredRootHandle,
  isFileSystemAccessSupported,
  pickRootDirectory,
} from '@/lib/offline/fs-handle-store'
import {
  exportAllModules,
  type ExportResult,
} from '@/lib/offline/excel-writer'
import { getAllExcelSchemas } from '@/lib/offline/excel-schema/registry'

/**
 * Excel Export Panel — a /offline oldalon a 3. szekció.
 *
 * Funkciók:
 *  - "Mappa kiválasztása" (első használat): natív picker → PII warning (ha cloud)
 *  - "Excel export most": kiírja a 3 modul Excel fájljait
 *  - Módosítási napló: utolsó export időpontja, melyik modul, hány sor
 *  - "Mappa elfelejtése": reset
 *
 * Props:
 *  - congregationId, congregationSlug — a SyncProvider-ből jön
 *  - exportedBy — user neve
 */
export function ExcelExportPanel({
  congregationId,
  congregationSlug,
  exportedBy,
}: {
  congregationId: string | null
  congregationSlug: string
  exportedBy: string
}) {
  // SSR safety: a File System Access API csak kliens-oldalon létezik, a
  // `isFileSystemAccessSupported()` különböző értéket adna server és kliens
  // oldalon → hydration mismatch. Mount-ig placeholder-t mutatunk.
  // queueMicrotask a React 19 set-state-in-effect rule miatt.
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

  const [isPending, startTransition] = useTransition()
  const [hasHandle, setHasHandle] = useState<boolean | null>(null) // null = loading
  const [folderName, setFolderName] = useState<string>('')
  const [cloudWarning, setCloudWarning] = useState<string | null>(null)
  const [lastResults, setLastResults] = useState<ExportResult[] | null>(null)

  const isSupported = mounted ? isFileSystemAccessSupported() : false

  // Mount: betöltjük a korábbi handle-t (ha van)
  const refreshHandleState = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!isFileSystemAccessSupported()) {
      setHasHandle(false)
      return
    }
    const handle = await getStoredRootHandle()
    if (handle) {
      setHasHandle(true)
      setFolderName(handle.name)
      const cloudCheck = detectCloudSyncFolder(handle)
      if (cloudCheck.isCloud) setCloudWarning(cloudCheck.reason)
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

  async function handlePickFolder() {
    try {
      const handle = await pickRootDirectory()
      if (!handle) {
        toast.info('Nem választottál mappát.')
        return
      }

      const cloudCheck = detectCloudSyncFolder(handle)
      if (cloudCheck.isCloud) {
        const confirmed = confirm(
          `⚠️ FIGYELEM\n\n${cloudCheck.reason}\n\nBiztos ebben a mappát szeretnéd használni?`,
        )
        if (!confirmed) {
          await forgetRootDirectory()
          toast.info('Mappa-választás megszakítva.')
          return
        }
        setCloudWarning(cloudCheck.reason)
      } else {
        setCloudWarning(null)
      }

      setHasHandle(true)
      setFolderName(handle.name)
      toast.success(`Mappa kiválasztva: ${handle.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A mappa kiválasztása sikertelen.')
    }
  }

  async function handleForgetFolder() {
    if (!confirm('Biztosan elfelejted a mappát? (A fájlokat nem törli, csak a rendszer nem fog többé írni oda.)')) {
      return
    }
    await forgetRootDirectory()
    setHasHandle(false)
    setFolderName('')
    setCloudWarning(null)
    setLastResults(null)
    toast.success('Mappa elfelejtve.')
  }

  function handleExportNow() {
    if (!congregationId) {
      toast.error('Nincs aktív gyülekezet — bejelentkezés szükséges.')
      return
    }

    startTransition(async () => {
      try {
        const handle = await getStoredRootHandle()
        if (!handle) {
          toast.error('Nincs kiválasztott mappa. Kattints a "Mappa kiválasztása"-ra.')
          return
        }

        // Permission — user gesture keretében (a gomb-kattintás ez)
        const granted = await ensurePermission(handle)
        if (!granted) {
          toast.error('Nincs írási jog a mappához. Adj engedélyt.')
          return
        }

        const { results, totalDurationMs, errors } = await exportAllModules({
          congregationId,
          congregationSlug,
          exportedBy,
          rootHandle: handle,
        })

        setLastResults(results)

        const totalRows = results.reduce((s, r) => s + r.totalRows, 0)
        if (errors.length > 0) {
          toast.warning(
            `Export befejeződött ${(totalDurationMs / 1000).toFixed(1)}s alatt — ${totalRows} rekord, de ${errors.length} hiba.`,
          )
        } else {
          toast.success(
            `Export kész! ${results.length} fájl, ${totalRows} rekord, ${(totalDurationMs / 1000).toFixed(1)}s.`,
          )
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Export sikertelen.')
      }
    })
  }

  return (
    <div className="card-raised overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-teal-50/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-teal-600" />
          <h3 className="font-heading text-lg text-slate-800">Excel export</h3>
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
            Fázis 3
          </span>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Mount előtt: skeleton (hydration biztonságért) */}
        {!mounted && (
          <div className="py-4 text-sm italic text-slate-400">
            Betöltés...
          </div>
        )}

        {/* Böngésző-támogatás (csak mount után) */}
        {mounted && !isSupported && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">⚠️ A böngésződ nem támogatja a File System Access API-t</p>
            <p className="mt-1 text-xs">
              Ehhez Chromium-alapú böngészőt (Chrome, Edge, Brave, Opera)
              használj.
            </p>
          </div>
        )}

        {/* Leírás */}
        {mounted && isSupported && hasHandle === false && (
          <div className="space-y-3">
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4 text-sm text-teal-900">
              <p className="mb-2 font-semibold">
                <Info className="mr-1 inline h-4 w-4" />A lelkész saját gépén
                tartott Excel biztonsági mentés
              </p>
              <p className="text-xs">
                Válassz egy mappát (pl. <code>D:\Dokumentumok</code>). A rendszer
                létrehozza benne a <code>KARTOTEKA/{congregationSlug || '…'}/</code> mappastruktúrát,
                és modulonként egy-egy Excel fájlt ír oda: <code>tagnyilvantartas.xlsx</code>,
                <code>penzugy.xlsx</code>, <code>anyakonyv.xlsx</code>.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                FONTOS — GDPR figyelmeztetés
              </p>
              <p className="mt-1 text-xs">
                A fájlok <strong>személyes adatokat</strong> tartalmaznak (nevek,
                CNP, telefonszám, pénzügyi adatok). <strong>NE tedd OneDrive,
                Dropbox, Google Drive vagy iCloud mappába</strong> — ezek
                automatikusan felhőbe szinkronizálják az adatokat, ami
                adatszivárgás kockázatát jelenti.
              </p>
              <p className="mt-1 text-xs">
                Javasolt mappák: <code>Dokumentumok</code>, <code>D:\Gyülekezet</code>,
                vagy egy ideálisan <strong>titkosított</strong> helyi mappa (pl.
                VeraCrypt kötet).
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
              <p className="font-semibold">
                <Info className="mr-1 inline h-4 w-4" />
                Chrome biztonsági blokk-lista — fontos tudni!
              </p>
              <p className="mt-1 text-xs">
                A Chrome nem engedi kiválasztani bizonyos <strong>védett</strong>{' '}
                mappákat. Ha ezt a hibát látod: {'„Nem lehet megnyitni ezt a mappát”'},
                akkor a választott mappa blokk-listán van. Kerüld:
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 pl-2 text-xs">
                <li>Meghajtó gyökere: <code>C:\</code>, <code>D:\</code></li>
                <li>Rendszermappa: <code>Windows</code>, <code>Program Files</code></li>
                <li>Felhasználói profil gyökere: <code>C:\Users\&lt;név&gt;</code></li>
                <li>Felhő-root: OneDrive/Dropbox/Google Drive gyökér</li>
              </ul>
              <p className="mt-1 text-xs">
                <strong>Tipp</strong>: a File Explorer-ben előbb <strong>hozz létre
                egy új KARTOTEKA mappát</strong>, pl. a Dokumentumok vagy egy
                lemezen (pl. <code>D:\Gyülekezet\KARTOTEKA-export</code>), és azt
                válaszd ki.
              </p>
            </div>

            <Button
              className="rounded-xl bg-teal-600 hover:bg-teal-700"
              onClick={handlePickFolder}
              disabled={isPending}
            >
              <FolderOpen className="mr-1.5 h-4 w-4" />
              Mappa kiválasztása
            </Button>
          </div>
        )}

        {/* Aktív mappa */}
        {mounted && isSupported && hasHandle && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Aktív mappa: <code className="font-mono">{folderName}</code>
                  </p>
                  <p className="text-xs text-slate-500">
                    Fájlok a{' '}
                    <code className="font-mono">
                      {folderName}/KARTOTEKA/{congregationSlug}/
                    </code>{' '}
                    alatt
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-500 hover:text-red-600"
                onClick={handleForgetFolder}
                disabled={isPending}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Elfelejtés
              </Button>
            </div>

            {cloudWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                <strong>Figyelem:</strong> {cloudWarning}
              </div>
            )}

            {/* Export gomb */}
            <Button
              size="lg"
              className="w-full rounded-xl bg-teal-600 hover:bg-teal-700"
              onClick={handleExportNow}
              disabled={isPending || !congregationId}
            >
              <HardDriveUpload
                className={`mr-1.5 h-4 w-4 ${isPending ? 'animate-pulse' : ''}`}
              />
              {isPending ? 'Exportálás folyamatban...' : 'Excel export most'}
            </Button>

            {/* Utolsó export eredménye */}
            {lastResults && (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  Utolsó export ({new Date().toLocaleString('hu-HU')})
                </div>
                <div className="divide-y divide-slate-100">
                  {lastResults.map(result => (
                    <div
                      key={result.module}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Download className="h-3 w-3 text-teal-600" />
                        <code className="font-mono text-slate-700">
                          {result.fileName}
                        </code>
                      </div>
                      <div className="flex items-center gap-3 text-slate-500">
                        <span>
                          {result.totalRows.toLocaleString('hu-HU')} rekord
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {(result.durationMs / 1000).toFixed(2)}s
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modulonkénti magyarázat */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs">
              <p className="font-semibold text-slate-700">
                Most exportált modulok (Fázis 3 scope):
              </p>
              <ul className="mt-1 space-y-0.5 pl-4 text-slate-600">
                {getAllExcelSchemas().map(s => (
                  <li key={s.module}>
                    <code className="font-mono">{s.fileName}</code>
                    {' — '}
                    {s.sheets.length} munkalap
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-slate-500">
                A maradék 6 modul (munkanapló, leltár, iktató, sírhely,
                jegyzőkönyvek, missziós műhely) a Fázis 5-ben jön.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
