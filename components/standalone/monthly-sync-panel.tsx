'use client'

import { useRef, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Cloud,
  Database,
  Loader2,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface SyncResult {
  success: boolean
  backupPath?: string
  pulled: Record<string, number>
  pushed: Record<string, number>
  conflicts: Array<{ table: string; rowId: string; reason: string }>
  failed: Array<{ table: string; error: string }>
  newLicenseToken?: string
  durationMs: number
  error?: string
}

/**
 * Monthly Sync Panel — a lelkész manuálisan indítja a havi szinkront.
 *
 * Standalone módban (License Status alatt) jelenik meg.
 * Mutatja a progress-et, a végén az eredményt (pulled/pushed/conflicts).
 */
export function MonthlySyncPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [progress, setProgress] = useState<string>('')
  // Re-entry guard — a sync egy hosszú (1-3 perces) művelet, és a
  // `setRunning(true)` aszinkron, így két gyors klikk két sync-et indíthatna
  // egyszerre → SQLite korrupció. A useRef szinkron, instant blokkolás.
  const syncingRef = useRef(false)

  async function handleSync() {
    if (syncingRef.current) return
    if (!navigator.onLine) {
      toast.error('Nincs internet kapcsolat. Csatlakozz WiFi-hez vagy mobil hotspothoz.')
      return
    }

    syncingRef.current = true
    setRunning(true)
    setProgress('Szinkronizáció indítása...')
    setResult(null)

    try {
      const resp = await fetch('/api/standalone/monthly-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = (await resp.json()) as SyncResult

      if (!resp.ok) {
        throw new Error(data.error || 'Szinkronizáció sikertelen')
      }

      setResult(data)

      const pulledCount = Object.values(data.pulled).reduce((s, v) => s + v, 0)
      const pushedCount = Object.values(data.pushed).reduce((s, v) => s + v, 0)

      if (data.conflicts.length > 0) {
        toast.warning(
          `Szinkron kész — ${data.conflicts.length} konfliktus. Kérlek nézd át.`,
        )
      } else {
        toast.success(
          `Szinkron kész! ${pulledCount} letöltve, ${pushedCount} feltöltve.`,
        )
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Ismeretlen hiba a szinkronizáció során',
      )
      setResult({
        success: false,
        pulled: {},
        pushed: {},
        conflicts: [],
        failed: [],
        durationMs: 0,
        error: e instanceof Error ? e.message : 'Ismeretlen hiba',
      })
    } finally {
      setRunning(false)
      setProgress('')
      syncingRef.current = false
    }
  }

  return (
    <div id="monthly-sync-panel" className="card-raised overflow-hidden scroll-mt-20">
      <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50/40 px-5 py-3">
        <Cloud className="size-5 text-sky-600" />
        <h3 className="font-heading text-lg text-slate-800">Havi szinkronizáció</h3>
        <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
          Fázis 7d
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Magyarázat */}
        <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 text-sm text-sky-900">
          <p className="font-semibold">Mit csinál a szinkronizáció?</p>
          <ul className="mt-2 space-y-1 pl-4 text-xs">
            <li className="flex items-start gap-2">
              <Database className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong>Biztonsági mentés</strong> — az aktuális adatbázis másolata
                a <code>data/backups/pre-sync/</code> mappába
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowDownCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong>Letöltés</strong> — a szerveren lévő új változások a
                helyi gépre (más lelkész, esperesi hivatal, stb.)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowUpCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong>Feltöltés</strong> — a helyileg rögzített változások a
                felhőbe (biztosíték + többi eszközre jut)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong>Licensz megújítása</strong> — újabb 35 napra garantált
                offline működés
              </span>
            </li>
          </ul>
        </div>

        {/* Progress közben */}
        {running && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 shrink-0 animate-spin text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  Szinkronizáció folyamatban...
                </p>
                <p className="mt-0.5 text-xs text-blue-800">
                  {progress || 'Kérjük várj, ez 1-3 percet vehet igénybe.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Eredmény */}
        {result && !running && (
          <SyncResultCard result={result} />
        )}

        {/* Szinkron gomb */}
        <Button
          size="lg"
          className="w-full rounded-xl bg-sky-600 hover:bg-sky-700"
          onClick={handleSync}
          disabled={running}
        >
          {running ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 size-4" />
          )}
          {running ? 'Szinkronizáció folyamatban...' : 'Szinkronizálás most'}
        </Button>

        {!navigator.onLine && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-xs text-red-900">
            <WifiOff className="size-4 shrink-0" />
            <span>
              <strong>Nincs internet</strong> — csatlakozz WiFi-hez vagy mobil
              hotspothoz a szinkronizáció előtt.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function SyncResultCard({ result }: { result: SyncResult }) {
  const pulledTotal = Object.values(result.pulled).reduce((s, v) => s + v, 0)
  const pushedTotal = Object.values(result.pushed).reduce((s, v) => s + v, 0)

  if (!result.success) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
        <p className="flex items-center gap-2 font-semibold text-red-900">
          <ShieldAlert className="size-5" />
          Szinkronizáció sikertelen
        </p>
        <p className="mt-2 text-xs text-red-800">{result.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <CheckCircle2 className="size-5 text-emerald-600" />
        Szinkronizáció sikeres ({(result.durationMs / 1000).toFixed(1)}s)
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <ResultStat
          icon={ArrowDownCircle}
          label="Letöltve"
          value={pulledTotal}
          color="blue"
          detail={Object.keys(result.pulled).length > 0 ? Object.keys(result.pulled).length + ' tábla' : 'Nincs új adat'}
        />
        <ResultStat
          icon={ArrowUpCircle}
          label="Feltöltve"
          value={pushedTotal}
          color="emerald"
          detail={pushedTotal > 0 ? 'Változtatások mentve' : 'Nincs pending'}
        />
        <ResultStat
          icon={ShieldAlert}
          label="Konfliktus"
          value={result.conflicts.length}
          color={result.conflicts.length > 0 ? 'amber' : 'slate'}
          detail={result.conflicts.length > 0 ? 'Nézd át!' : 'Minden rendben'}
        />
      </div>

      {result.conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
          <p className="font-semibold">Konfliktusok ({result.conflicts.length}):</p>
          <ul className="mt-1 space-y-0.5">
            {result.conflicts.slice(0, 5).map((c, i) => (
              <li key={i}>
                • <code className="font-mono">{c.table}</code>:{' '}
                <strong>#{c.rowId}</strong> — {c.reason}
              </li>
            ))}
            {result.conflicts.length > 5 && (
              <li className="italic">
                …és még {result.conflicts.length - 5} további konfliktus
              </li>
            )}
          </ul>
        </div>
      )}

      {result.failed.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 text-xs text-red-900">
          <p className="font-semibold">Hibás műveletek ({result.failed.length}):</p>
          <ul className="mt-1 space-y-0.5">
            {result.failed.slice(0, 3).map((f, i) => (
              <li key={i}>
                • <code className="font-mono">{f.table}</code>: {f.error}
              </li>
            ))}
            {result.failed.length > 3 && (
              <li className="italic">…és még {result.failed.length - 3} további</li>
            )}
          </ul>
        </div>
      )}

      {result.newLicenseToken && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
          <CheckCircle2 className="mr-1 inline size-3.5" />
          <strong>Licensz megújítva</strong> — következő 35 napra aktív
        </div>
      )}
    </div>
  )
}

function ResultStat({
  icon: Icon,
  label,
  value,
  color,
  detail,
}: {
  icon: typeof ArrowDownCircle
  label: string
  value: number
  color: 'blue' | 'emerald' | 'amber' | 'slate'
  detail: string
}) {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50/50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50/50 text-amber-900',
    slate: 'border-slate-200 bg-slate-50/50 text-slate-700',
  }
  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="font-heading text-2xl font-bold">{value}</p>
      <p className="text-[10px] opacity-70">{detail}</p>
    </div>
  )
}
