import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

import { AutoSyncStatusBar } from '../components/auto-sync-status-bar'
import { SessionStatusIndicator } from '../components/session-status-indicator'
import { SyncStatusIndicator } from '../components/sync-status-indicator'
import {
  clearRememberOffline,
  hasPin,
  isOfflineMode,
  setOfflineMode,
} from './auth-pin'
import { runBefizetesSyncManually, startBefizetesAutoSync } from './befizetes-write-sync'
import { runChitantaSyncManually, startChitantaAutoSync } from './chitanta-sync'
import { runKiadasSyncManually, startKiadasAutoSync } from './kiadas-write-sync'
import { getDesktopSupabase } from './supabase'

/**
 * AuthGate — védett útvonalak wrapper-e a desktop app router-ben.
 *
 * A-M6.9 (2026-04-22) óta **három kapu** van:
 *   1. Friss Supabase session → beenged (online mód)
 *   2. Nincs session, de van aktív offline-mode flag (PIN már verifikálódott
 *      ebben az indításban) → beenged (offline mód)
 *   3. Nincs session, nincs offline-mode, de van tárolt PIN-hash
 *      → redirect `/pin-entry` (a user 30+ napig offline volt, refresh lejárt)
 *   4. Nincs session, nincs PIN → redirect `/login`
 *
 * Subscribe-ol az `onAuthStateChange`-re, hogy ha közben online-ba visszaáll
 * a session, a gate azonnal engedi (pl. `SIGNED_IN` event), és az offline-mode
 * flag törlődik.
 */
export function AuthGate() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [pinExists, setPinExists] = useState(false)
  const [offlineActive, setOfflineActive] = useState(isOfflineMode())

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()

    // 1) Első session-check + PIN-check párhuzamosan
    Promise.all([supabase.auth.getSession(), hasPin()])
      .then(([sessionRes, pinPresent]) => {
        if (!mounted) return
        setSession(sessionRes.data.session)
        setPinExists(pinPresent)
        setLoading(false)
      })
      .catch((err) => {
        // hasPin() hiba (pl. keyring access) — ne blokkoljon, csak nincs PIN
        if (!mounted) return
        console.error('[auth-gate] init hiba:', err)
        setPinExists(false)
        setLoading(false)
      })

    // 2) Auth-state változás figyelése
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return
      setSession(newSession)

      // SIGNED_IN → visszajöttünk online-ba, offline-mode nem kell többé
      if (event === 'SIGNED_IN' && newSession) {
        setOfflineMode(false)
        setOfflineActive(false)
        // A-M7.2d2c — az outbox-ban várakozó chitantákat felküldjük azonnal.
        // A runChitantaSyncManually önmagában guard-olva van (nem duplikál).
        void runChitantaSyncManually()
        // A-M7.9a — ugyanez a befizetés-pending sorokra
        void runBefizetesSyncManually()
        // A-M7.9b — és a kiadás-pending sorokra
        void runKiadasSyncManually()
      }

      // SIGNED_OUT explicit → offline-mode is törlődik + remember-flag is
      // (user logout = új gépnek kéne felfognia a rendszert)
      if (event === 'SIGNED_OUT') {
        setOfflineMode(false)
        setOfflineActive(false)
        clearRememberOffline()
      }
    })

    // 3) A-M7.2d2c — auto-sync háttér-task indítása. Idempotens (többszöri
    // hívás nem duplikálja a listener-t / interval-t). A pusher maga
    // ellenőrzi a session-t, tehát offline-módban is biztonságos.
    startChitantaAutoSync()
    // A-M7.9a — befizetés-pending push-er (független loop-ban; saját
    // exp-backoff + 30s poll a chitantával párhuzamosan).
    startBefizetesAutoSync()
    // A-M7.9b — kiadás-pending push-er (szintén független loop)
    startKiadasAutoSync()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Betöltés…</p>
        </div>
      </div>
    )
  }

  // 1. kapu: friss Supabase session
  if (session) {
    return (
      <>
        <SessionStatusIndicator />
        <SyncStatusIndicator />
        <AutoSyncStatusBar />
        <Outlet />
      </>
    )
  }

  // 2. kapu: offline-mode flag aktív (PIN már verifikálódott ebben az indításban)
  if (offlineActive) {
    return (
      <>
        <SessionStatusIndicator />
        <SyncStatusIndicator />
        <AutoSyncStatusBar />
        <Outlet />
      </>
    )
  }

  // 3. kapu: nincs session, de van PIN → kérdezd meg offline-ban
  if (pinExists) {
    return <Navigate to="/pin-entry" replace />
  }

  // 4. kapu: nincs semmi → normál login
  return <Navigate to="/login" replace />
}
