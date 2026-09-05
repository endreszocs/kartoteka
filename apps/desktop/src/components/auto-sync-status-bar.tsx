/**
 * AutoSyncStatusBar — globális állapotsáv az auto-szinkron jelzéséhez (Sprint M,
 * 2026-04-25; 2026-09-05 őszinte állapotok + PIN-mód + kompakt alak).
 *
 * A fejlécben él (inline), az auto-sync orchestrator állapotát jeleníti meg:
 *   - 🔵 Szinkronizálás… (folyamatban — pulzáló pötty + spinner)
 *   - 🟢 Friss adatok · X mp (sikeres pull után, relatív idővel)
 *   - 🟠 Részben frissült — a bukott táblák nevével (partial)
 *   - 🔴 Szinkron-hiba — az első hiba szövegével (error)
 *   - 🟠 Offline — helyi adatok (nincs net)
 *   - 🟠 Helyi munkamenet — a felhő-szinkron a következő belépéskor (PIN-mód)
 *
 * A komponens maga oldja fel a usert (`getDesktopUser` — offline-barát), és
 * az auth-változásra CSAK valódi sessionnél írja felül (desk-sync-5: a
 * PIN-módban jövő null korábban leállította a hookot és eltüntette a sávot).
 *
 * `md` alatt a felirat elrejtve — a pötty + ikon + a `title` marad, a
 * részletek kattintásra nyílnak (desk-sync-22).
 *
 * Designelv: az auto-sync **kizárólag desktop** feature (a web nem cache-el
 * lokálisan), ezért a vizuális réteg itt marad.
 */

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, CloudOff, KeyRound, Loader2, RefreshCw } from 'lucide-react'

import { getDesktopSupabase } from '../lib/supabase'
import { getDesktopUser } from '../lib/desktop-user'
import { useAutoSyncOrchestrator } from '../lib/sync-orchestrator'

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return 'most'
  if (diff < 60) return `${diff} mp`
  if (diff < 3600) {
    const m = Math.floor(diff / 60)
    return m === 1 ? '1 perce' : `${m} perce`
  }
  const h = Math.floor(diff / 3600)
  return h === 1 ? '1 órája' : `${h} órája`
}

export function AutoSyncStatusBar({ position = 'fixed' }: { position?: 'fixed' | 'inline' } = {}) {
  const [userId, setUserId] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const [reszletekNyitva, setReszletekNyitva] = useState(false)
  const konteinerRef = useRef<HTMLDivElement | null>(null)

  // Auth user betöltése (a sáv csak akkor látszik, ha van feloldott user —
  // sessionnel VAGY PIN-módban).
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    getDesktopUser().then((resolvedUser) => {
      if (mounted) setUserId(resolvedUser?.id ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      // desk-sync-5: CSAK valódi sessionnél írunk felül — a PIN-módban jövő
      // null (INITIAL_SESSION / lejárt refresh) nem állíthatja le a hookot.
      if (session?.user) setUserId(session.user.id)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Relatív-idő frissítés 10 mp-enként ("most" → "12 mp" → "1 perce" stb.)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 10_000)
    return () => window.clearInterval(id)
  }, [])

  // A részletező kattintásra kívülre záródik.
  useEffect(() => {
    if (!reszletekNyitva) return
    function onDocClick(e: MouseEvent) {
      if (konteinerRef.current && !konteinerRef.current.contains(e.target as Node)) {
        setReszletekNyitva(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [reszletekNyitva])

  const { state, lastSyncAt, isOnline, lastError, bukottTablak, jelentesek, triggerManualSync } =
    useAutoSyncOrchestrator(userId)

  if (!userId) return null

  // ── Állapot → vizuális stílus + üzenet ────────────────────────────────
  let label: string
  let Icon = RefreshCw
  let toneClass = 'border-border bg-card text-foreground'
  let dotClass = 'bg-muted-foreground'
  let dotPulse = false

  if (!isOnline) {
    label = 'Offline — helyi adatok'
    Icon = CloudOff
    toneClass = 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
    dotClass = 'bg-amber-500'
  } else if (state === 'syncing') {
    label = 'Adatok szinkronizálása…'
    Icon = Loader2
    toneClass = 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200'
    dotClass = 'bg-sky-500'
    dotPulse = true
  } else if (state === 'offline-pin') {
    label = 'Helyi munkamenet — a felhő-szinkron a következő belépéskor'
    Icon = KeyRound
    toneClass = 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
    dotClass = 'bg-amber-500'
  } else if (state === 'no-session') {
    label = 'Nincs felhő-belépés — a szinkron szünetel'
    Icon = CloudOff
    toneClass = 'border-border bg-secondary text-muted-foreground'
    dotClass = 'bg-muted-foreground'
  } else if (state === 'error') {
    label = `Szinkron-hiba: ${lastError ?? 'ismeretlen ok'}`
    Icon = AlertCircle
    toneClass = 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200'
    dotClass = 'bg-rose-500'
  } else if (state === 'partial') {
    label = `Részben frissült — nem sikerült: ${bukottTablak.join(', ')}`
    Icon = AlertCircle
    toneClass = 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
    dotClass = 'bg-amber-500'
  } else if (lastSyncAt) {
    label = `Friss adatok · ${formatRelativeTime(lastSyncAt)}`
    Icon = CheckCircle2
    toneClass = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
    dotClass = 'bg-emerald-500'
  } else {
    label = 'Várakozás az első szinkronra…'
    Icon = RefreshCw
  }

  const canManualSync =
    state !== 'syncing' && isOnline && state !== 'offline-pin' && state !== 'no-session'
  const vanReszlet = jelentesek.length > 0 || Boolean(lastError)

  return (
    <div
      ref={konteinerRef}
      className={`${position === 'fixed' ? 'fixed bottom-3 left-1/2 z-30 -translate-x-1/2' : 'relative'}`}
    >
      <div
        role="status"
        aria-live="polite"
        className={`flex min-h-9 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur-md transition-colors md:px-3 md:py-1.5 ${toneClass}`}
        title={label}
      >
        <button
          type="button"
          className="flex min-h-7 items-center gap-2"
          onClick={() => vanReszlet && setReszletekNyitva((v) => !v)}
          aria-expanded={reszletekNyitva}
          aria-label={label}
        >
          <span
            className={`inline-block size-2 rounded-full ${dotClass} ${dotPulse ? 'animate-pulse' : ''}`}
          />
          <Icon className={`size-3.5 ${state === 'syncing' ? 'animate-spin' : ''}`} />
          <span className="hidden max-w-[280px] truncate md:inline">{label}</span>
        </button>
        {canManualSync && (
          <button
            type="button"
            onClick={() => void triggerManualSync()}
            className="ml-0.5 min-h-7 min-w-7 rounded-full px-1.5 py-0.5 text-[12px] opacity-70 transition hover:bg-background/60 hover:opacity-100"
            title="Frissítés most"
            aria-label="Manuális szinkronizáció indítása"
          >
            ↻
          </button>
        )}
      </div>
      {reszletekNyitva && (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 max-w-[92vw] rounded-md border border-border bg-card p-3 text-xs text-foreground shadow-lg">
          <p className="mb-2 font-semibold">{label}</p>
          {jelentesek.length === 0 && lastError && <p className="text-muted-foreground">{lastError}</p>}
          {jelentesek.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {jelentesek.map((j) => (
                <li key={j.kulcs} className="flex items-start gap-2">
                  <span
                    className={`mt-1 inline-block size-2 shrink-0 rounded-full ${
                      !j.ok ? 'bg-rose-500' : j.figyelmeztetes ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{j.cimke}</span>
                    {j.ok && j.sorok !== undefined && !j.figyelmeztetes && (
                      <span className="text-muted-foreground"> · {j.sorok} sor</span>
                    )}
                    {(j.hiba || j.figyelmeztetes) && (
                      <span className="block break-words text-muted-foreground">
                        {j.hiba ?? j.figyelmeztetes}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
