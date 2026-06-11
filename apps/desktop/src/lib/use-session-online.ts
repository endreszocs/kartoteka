/**
 * useSessionOnline — session-tudatos online-állapot (2026-06-11).
 *
 * KRITIKUS hiba gyökere volt: a rögzítő felületek `navigator.onLine` alapján
 * döntöttek az ONLINE mentési ágról. PIN-es (offline) munkamenetben viszont
 * NINCS Supabase-session — működő internettel a kérés `anon` szerepkörrel
 * ment a szerverre, amit a Postgres helyesen utasított el:
 * „permission denied for table befizetes".
 *
 * A helyes szemantika: ONLINE = van hálózat ÉS van érvényes Supabase-session.
 * PIN-es munkamenetben (session nélkül) a felület így a bevált OFFLINE ágat
 * használja (iratszám-tárca + outbox), a tételek a következő online
 * bejelentkezéskor szinkronizálódnak — pontosan, ahogy hálózat nélkül.
 *
 * A hook a navigator online/offline eseményeire ÉS az auth-állapot
 * változásaira is újraértékel; a getSession 2,5 mp-es timeouttal fut
 * (sosem blokkol).
 */

import { useEffect, useState } from 'react'

import { getDesktopSupabase } from './supabase'

const GET_SESSION_TIMEOUT_MS = 2500

/** Egyszeri ellenőrzés — nem-React kódból (pl. dialógus mentés-ágában) hívható. */
export async function isOnlineWithSession(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  try {
    const supabase = getDesktopSupabase()
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), GET_SESSION_TIMEOUT_MS)
      }),
    ])
    return Boolean(result && 'data' in result && result.data.session)
  } catch {
    return false
  }
}

/** React-hook változat — a rögzítő oldalak isOnline állapotának forrása. */
export function useSessionOnline(): boolean {
  const [online, setOnline] = useState(false)

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()

    async function evaluate() {
      const value = await isOnlineWithSession()
      if (mounted) setOnline(value)
    }

    void evaluate()

    const onOnline = () => void evaluate()
    const onOffline = () => {
      if (mounted) setOnline(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void evaluate()
    })

    return () => {
      mounted = false
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      subscription.unsubscribe()
    }
  }, [])

  return online
}
