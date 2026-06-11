/**
 * AutoSyncStatusBar — globális állapotsáv az auto-szinkron jelzéséhez (Sprint M, 2026-04-25).
 *
 * A képernyő alján középen lebeg, az auto-sync orchestrator állapotát jeleníti meg:
 *   - 🔵 Szinkronizálás… (folyamatban — pulzáló kék pötty + spinner)
 *   - 🟢 Friss adatok · X mp (sikeres pull után, relatív idővel)
 *   - 🟠 Offline — cache-elt adatok (nincs net)
 *   - 🔴 Szinkronizálási hiba (újrapróbálás 1 perc múlva)
 *
 * A komponens maga olvassa a Supabase auth user-t — auth-gate után mountolva
 * pontosan a védett zónában dolgozik. Manuális "Frissítés most" gombbal
 * kérheti a teljes pull-t (full bundle).
 *
 * Designelv: az UI-paritás-szabály szerint a vizuális réteg a `@kartoteka/ui-app`-ben
 * lehetne, de mivel az auto-sync **kizárólag desktop** feature (a web nem cache-el
 * lokálisan), itt marad — egyszerűbb, kevesebb dependency.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, CloudOff, Loader2, RefreshCw } from 'lucide-react'

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

  // Auth user betöltése (a sav csak akkor látszik, ha be vagyunk jelentkezve)
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
      setUserId(session?.user?.id ?? null)
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

  const { state, lastSyncAt, isOnline, triggerManualSync } = useAutoSyncOrchestrator(userId)

  if (!userId) return null

  // ── Állapot → vizuális stílus + üzenet ────────────────────────────────
  let label: string
  let Icon = RefreshCw
  let toneClass = 'border-slate-200 bg-white/85 text-slate-700'
  let dotClass = 'bg-slate-400'
  let dotPulse = false

  if (!isOnline) {
    label = 'Offline — cache-elt adatok'
    Icon = CloudOff
    toneClass = 'border-amber-200 bg-amber-50/95 text-amber-900'
    dotClass = 'bg-amber-500'
  } else if (state === 'syncing') {
    label = 'Adatok szinkronizálása…'
    Icon = Loader2
    toneClass = 'border-sky-200 bg-sky-50/95 text-sky-900'
    dotClass = 'bg-sky-500'
    dotPulse = true
  } else if (state === 'error') {
    label = 'Szinkronizálási hiba — újrapróbálkozás'
    Icon = AlertCircle
    toneClass = 'border-rose-200 bg-rose-50/95 text-rose-900'
    dotClass = 'bg-rose-500'
  } else if (lastSyncAt) {
    label = `Friss adatok · ${formatRelativeTime(lastSyncAt)}`
    Icon = CheckCircle2
    toneClass = 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
    dotClass = 'bg-emerald-500'
  } else {
    label = 'Várakozás az első szinkronra…'
    Icon = RefreshCw
  }

  const canManualSync = state !== 'syncing' && isOnline

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${position === 'fixed' ? 'fixed bottom-3 left-1/2 z-30 -translate-x-1/2' : ''} flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur-md transition-colors ${toneClass}`}
      title={label}
    >
      <span
        className={`inline-block size-2 rounded-full ${dotClass} ${dotPulse ? 'animate-pulse' : ''}`}
      />
      <Icon className={`size-3.5 ${state === 'syncing' ? 'animate-spin' : ''}`} />
      <span className="max-w-[280px] truncate">{label}</span>
      {canManualSync && (
        <button
          type="button"
          onClick={() => void triggerManualSync()}
          className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] opacity-60 transition hover:bg-white/40 hover:opacity-100"
          title="Frissítés most"
          aria-label="Manuális szinkronizáció indítása"
        >
          ↻
        </button>
      )}
    </div>
  )
}
