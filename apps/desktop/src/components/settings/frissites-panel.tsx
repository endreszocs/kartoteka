/**
 * Frissítés panel — Sprint N (2026-04-25, v0.5.2).
 *
 * A teljes auto-update flow egyetlen, központi felületen:
 *   1. Aktuális verzió kiírása
 *   2. Automatikus „van-e új verzió?" check tab-megnyitáskor (egyszer)
 *   3. Manuális „Ellenőrzés most" gomb
 *   4. Új verzió → release-notes + „Letöltés és telepítés" gomb
 *   5. Letöltés progress (chunkLength alapján %, MB / MB)
 *   6. Telepítés után: az NSIS/MSI installer automatikusan újraindítja az appot
 *
 * A vizuális réteg pasztorális — világos, zöld/sárga/piros állapotjelzők,
 * magyarázó szöveg minden lépéshez (offline, ellenőrzéskor, letöltés közben,
 * telepítés alatt). A felhasználó SOSEM kerül „mi történik most?" állapotba.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Download,
  HardDrive,
  RefreshCw,
  Sparkles,
  Wifi,
} from 'lucide-react'

import { Button } from '@kartoteka/ui'

import { checkForUpdates, downloadAndInstall, type UpdateCheckResult } from '../../lib/updater'
import { getVersion } from '@tauri-apps/api/app'

// ─── Helper: bytes → MB ────────────────────────────────────────────────────
function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2)
}

// ─── State machine ─────────────────────────────────────────────────────────
type Phase =
  | 'idle' // még nem ellenőriztük
  | 'checking' // ellenőrzés folyamatban
  | 'up-to-date' // legfrissebb fut
  | 'available' // van új, várja a felhasználót
  | 'downloading' // épp tölt + telepít
  | 'installed' // siker — restart a Tauri-tól
  | 'error' // ellenőrzési vagy letöltési hiba

interface DownloadProgress {
  downloaded: number
  total: number | undefined
}

export function FrissitesPanel() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  // Online/offline figyelése
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Aktuális verzió betöltése (Tauri runtime API)
  useEffect(() => {
    let mounted = true
    getVersion()
      .then((v) => {
        if (mounted) setCurrentVersion(v)
      })
      .catch(() => {
        if (mounted) setCurrentVersion(null)
      })
    return () => {
      mounted = false
    }
  }, [])

  const runCheck = useCallback(async () => {
    if (!isOnline) {
      setErrorText('Offline — a frissítés-ellenőrzéshez internetkapcsolat szükséges.')
      setPhase('error')
      return
    }
    setPhase('checking')
    setErrorText(null)
    try {
      const res = await checkForUpdates()
      setUpdateInfo(res)
      if (res.error) {
        setErrorText(res.error)
        setPhase('error')
      } else if (res.available) {
        setPhase('available')
      } else {
        setPhase('up-to-date')
      }
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [isOnline])

  // Auto-check tab megnyitásakor (egyszer)
  useEffect(() => {
    if (phase === 'idle' && currentVersion !== null && isOnline) {
      void runCheck()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersion])

  const runDownload = useCallback(async () => {
    if (!updateInfo?.handle) return
    setPhase('downloading')
    setProgress({ downloaded: 0, total: undefined })
    setErrorText(null)
    try {
      const res = await downloadAndInstall(updateInfo.handle, (downloaded, total) => {
        setProgress({ downloaded, total })
      })
      if (res.success) {
        setPhase('installed')
        // Az NSIS/MSI installer automatikusan újraindítja az appot —
        // a kliens innen pár másodpercen belül exitelni fog.
      } else {
        setErrorText(res.error ?? 'Ismeretlen hiba a letöltés / telepítés során.')
        setPhase('error')
      }
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [updateInfo])

  const versionLine = currentVersion ? `v${currentVersion}` : '—'

  return (
    <div className="space-y-4">
      {/* Hero — aktuális verzió + összefoglaló */}
      <div className="rounded-[1.4rem] border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)]">
            <HardDrive className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Aktuális verzió
            </p>
            <p className="mt-1 font-heading text-2xl text-slate-800">{versionLine}</p>
            <p className="mt-1 text-xs text-slate-500">
              Az auto-updater Ed25519 aláírással hitelesíti az új verziókat a Supabase Storage-ból.
              A telepítés automatikus, az appot az installer újraindítja.
            </p>
          </div>
        </div>
      </div>

      {/* Online / offline jelző */}
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <CloudOff className="size-4 shrink-0" />
          <span>
            Offline vagy. Kapcsolódj az internethez a frissítések ellenőrzéséhez.
          </span>
        </div>
      )}

      {/* Állapot-blokkok */}
      {phase === 'idle' && isOnline && (
        <div className="rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Várakozás az automatikus ellenőrzésre…
        </div>
      )}

      {phase === 'checking' && (
        <div className="flex items-center gap-3 rounded-[1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <RefreshCw className="size-4 animate-spin" />
          <span>Új verzió ellenőrzése a Supabase Storage-ban…</span>
        </div>
      )}

      {phase === 'up-to-date' && (
        <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">
                A legfrissebb verzió fut
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                Nincs új verzió a szerveren — már a {versionLine} verziót használod.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runCheck}
              className="shrink-0"
            >
              <RefreshCw className="mr-1 size-3.5" />
              Ellenőrzés újra
            </Button>
          </div>
        </div>
      )}

      {phase === 'available' && updateInfo && (
        <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <Sparkles className="size-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Új verzió elérhető — v{updateInfo.version}
              </p>
              {updateInfo.releaseDate && (
                <p className="mt-0.5 text-[11px] text-amber-700">
                  Megjelenés: {formatReleaseDate(updateInfo.releaseDate)}
                </p>
              )}
              {updateInfo.notes && (
                <div className="mt-3 rounded-[0.8rem] border border-amber-200 bg-white/70 p-3 text-xs leading-relaxed text-amber-900">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Mi újság
                  </p>
                  <p className="whitespace-pre-wrap">{updateInfo.notes}</p>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={runDownload}
                  className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)] hover:from-violet-600 hover:to-indigo-700"
                >
                  <Download className="mr-2 size-4" />
                  Letöltés és telepítés
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={runCheck}>
                  <RefreshCw className="mr-1 size-3.5" />
                  Ellenőrzés újra
                </Button>
              </div>
              <p className="mt-2 text-[10px] italic text-amber-700">
                A telepítés után az alkalmazás automatikusan újraindul — kérjük, mentsd el az
                aktuális munkát előtte.
              </p>
            </div>
          </div>
        </div>
      )}

      {phase === 'downloading' && (
        <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
              <Download className="size-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sky-900">
                Letöltés és telepítés folyamatban…
              </p>
              <p className="mt-0.5 text-[11px] text-sky-800">
                Kérjük, NE zárd be az alkalmazást — az installer az utolsó lépésben automatikusan
                újraindítja.
              </p>
              {progress && (
                <div className="mt-3 space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-200"
                      style={{
                        width:
                          progress.total && progress.total > 0
                            ? `${Math.min(100, (progress.downloaded / progress.total) * 100)}%`
                            : '40%',
                      }}
                    />
                  </div>
                  <p className="text-[11px] font-mono text-sky-800">
                    {formatMB(progress.downloaded)} MB
                    {progress.total ? ` / ${formatMB(progress.total)} MB` : ' (méret ismeretlen)'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === 'installed' && (
        <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">
                Telepítés sikeres — újraindítás folyamatban…
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                Az alkalmazás bezárul és pár másodpercen belül elindul az új verzióval. Ha nem
                indul el automatikusan, kattints duplán a Kartotéka ikonra.
              </p>
            </div>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
              <AlertCircle className="size-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-900">Hiba történt</p>
              <p className="mt-1 text-xs text-rose-800">
                {errorText ?? 'Ismeretlen hiba. Próbáld újra később.'}
              </p>
              <div className="mt-3">
                <Button type="button" variant="outline" size="sm" onClick={runCheck}>
                  <RefreshCw className="mr-1 size-3.5" />
                  Próbáld újra
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manuális ellenőrzés gomb (mindig elérhető) */}
      {phase !== 'checking' && phase !== 'downloading' && phase !== 'installed' && (
        <div className="flex items-center justify-between rounded-[1rem] border border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <Wifi className="size-3.5" />
            <span>
              {isOnline
                ? 'Online — az ellenőrzés a Supabase Storage publikus manifest-jét használja.'
                : 'Offline — a frissítések csak online érhetők el.'}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runCheck}
            disabled={!isOnline}
          >
            <RefreshCw className="mr-1 size-3.5" />
            Ellenőrzés most
          </Button>
        </div>
      )}
    </div>
  )
}

function formatReleaseDate(iso: string): string {
  // A Tauri Update.date formátuma típusosan ISO 8601 vagy
  // "YYYY-MM-DD HH:MM:SS.SSS +HH:MM" — robusztusan próbáljuk parse-olni.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(
    d.getDate(),
  ).padStart(2, '0')}.`
}
