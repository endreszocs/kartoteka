import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

import { getDesktopSupabase } from './supabase'

/**
 * AuthGate — védett útvonalak wrapper-e a desktop app router-ben.
 *
 * Hatás:
 *   - Első renderkor lekérdezi a jelenlegi Supabase session-t
 *   - Ha nincs session → redirect `/login`
 *   - Ha van session → renderelj `<Outlet />` (a gyerek route tartalma)
 *   - Subscribe-ol az `onAuthStateChange`-re, hogy ha más ablakban kijelentkezik, itt is reagáljon
 *
 * Használat (App.tsx):
 *   <Route element={<AuthGate />}>
 *     <Route index element={<DashboardPage />} />
 *   </Route>
 */
export function AuthGate() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()

    // Első session-check
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    // Auth-state változás figyelése
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
    })

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

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
