import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kartoteka/ui'

import { getDesktopSupabase } from '../lib/supabase'

/**
 * Placeholder dashboard — M1.5 zárókép.
 *
 * Az M2-től tényleges tartalom kerül ide (tagnyilvántartás, pénzügy stb.).
 * Most csak egy üdvözlő kártya + kijelentkezés gomb — bizonyítja, hogy
 * az auth-gate működik és a Supabase session elérhető.
 */
export function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      setUser(data.user)
    })
    return () => {
      mounted = false
    }
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const supabase = getDesktopSupabase()
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Üdvözöllek a Kartotékában!</CardTitle>
            <CardDescription>
              {user
                ? `Bejelentkezve: ${user.email}`
                : 'Felhasználó betöltése…'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ez az M1.5 placeholder képernyő. Az M2 alfázistól tényleges
              tartalom (tagnyilvántartás, pénzügy, anyakönyv) kerül ide —
              ugyanazokkal a közös UI komponensekkel és Supabase-adatokkal,
              mint a webes felületen.
            </p>

            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium text-foreground">Fejlesztői info</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Csomag: <code>@kartoteka/desktop</code> (Tauri 2 + React 19 + Vite 7)</li>
                <li>Router: <code>react-router-dom</code> HashRouter</li>
                <li>UI: <code>@kartoteka/ui</code> (közös shadcn komponensek)</li>
                <li>Supabase: <code>@kartoteka/supabase-client</code> (közös factory)</li>
              </ul>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Kijelentkezés…' : 'Kijelentkezés'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
