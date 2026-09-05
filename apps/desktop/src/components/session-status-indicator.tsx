import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

import { SessionStatusBadge } from '@kartoteka/ui-app'

import {
  getDesktopSupabase,
  getUtolsoKulcstarHiba,
  KULCSTAR_HIBA_ESEMENY,
  type KulcstarHiba,
} from '../lib/supabase'
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
 *   - 🟠 Kulcstár-hiba   — (2026-09-05) a session nem menthető az OS-kulcstárba:
 *                          a munkamenet ettől még él, de a következő indításkor
 *                          újra össze kell kapcsolni. A Windows Credential
 *                          Manager 2560 bájtos plafonja miatt ez hónapokig NÉMA
 *                          volt (csak a konzol látta) — ezért felülírja a zöld
 *                          „Online"-t, és a Fiók / Kapcsolat fülre visz.
 */
export function SessionStatusIndicator({ position = 'fixed' }: { position?: 'fixed' | 'inline' } = {}) {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [, setTick] = useState(0)
  // A folyamat indulása óta észlelt utolsó kulcstár-hiba (a mount ELŐTTI
  // hibát a lekérdező adja, a későbbit az egyszeri window-esemény).
  const [kulcstarHiba, setKulcstarHiba] = useState<KulcstarHiba | null>(() => getUtolsoKulcstarHiba())

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
      if (mounted) {
        setTick((t) => t + 1)
        // Az esemény csak az ELSŐ hibánál sül el — a perces tick a későbbi
        // (pl. frissült üzenetű) hibát is felveszi.
        setKulcstarHiba(getUtolsoKulcstarHiba())
      }
    }, 60_000)

    const onKulcstarHiba = (e: Event) => {
      if (!mounted) return
      const detail = (e as CustomEvent<KulcstarHiba>).detail
      setKulcstarHiba(detail ?? getUtolsoKulcstarHiba())
    }
    window.addEventListener(KULCSTAR_HIBA_ESEMENY, onKulcstarHiba)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.clearInterval(id)
      window.removeEventListener(KULCSTAR_HIBA_ESEMENY, onKulcstarHiba)
    }
  }, [])

  if (!loaded) return null

  const info: SessionInfo = analyzeSession(session)

  if (info.kind === 'signed-out') return null

  if (kulcstarHiba && session) {
    // Élő session + kulcstár-hiba: a legfontosabb üzenet nyer. A teljes Rust-
    // szöveg a title-ben/aria-label-ben olvasható (a jelvény vágja).
    return (
      <SessionStatusBadge
        tone="orange"
        label={`A munkamenet nem tud a kulcstárba menteni — ${kulcstarHiba.uzenet}`}
        isOnline={false}
        position={position}
        onClick={() =>
          window.dispatchEvent(new CustomEvent('kartoteka:open-settings', { detail: { tab: 'fiok' } }))
        }
      />
    )
  }

  return (
    <SessionStatusBadge
      tone={info.tone}
      label={info.label}
      isOnline={info.kind === 'online'}
      position={position}
      onClick={info.actionable ? () => navigate('/login') : undefined}
    />
  )
}
