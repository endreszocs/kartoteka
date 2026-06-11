import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { SessionStatusBadge } from '@kartoteka/ui-app'

import { getDesktopSupabase } from '../lib/supabase'
import { analyzeSession, type SessionInfo } from '../lib/session-state'

/**
 * Globális session-státusz sáv (A-M6.9, 2026-04-22, refaktor 2026-04-25).
 *
 * A logika (Supabase auth, session-elemzés, periodikus refresh) a desktop-on
 * marad, a vizuális réteg a `SessionStatusBadge` (`@kartoteka/ui-app`). Az
 * új paritás-alapelv (web–desktop közös codebase) szerint a badge bármelyik
 * platform használhatja, csak más adatforrást kell kötni hozzá.
 *
 * Megjelenített állapotok:
 *   - 🟢 Online          — friss Supabase session
 *   - 🟠 Offline         — PIN-mode, nincs net (változtatások később szinkronizálnak)
 *   - 🟡 Hamarosan lejár — refresh token ≤ 7 nap múlva lejár
 *   - 🟤 Kijelentkezve   — (ritkán látható, mert az auth-gate /login-ra terel)
 */
export function SessionStatusIndicator({ position = 'fixed' }: { position?: 'fixed' | 'inline' } = {}) {
  const [session, setSession] = useState<Session | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoaded(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
    })

    const id = window.setInterval(() => {
      if (mounted) setTick((t) => t + 1)
    }, 60_000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.clearInterval(id)
    }
  }, [])

  if (!loaded) return null

  const info: SessionInfo = analyzeSession(session)

  if (info.kind === 'signed-out') return null

  return <SessionStatusBadge tone={info.tone} label={info.label} isOnline={info.kind === 'online'} position={position} />
}
