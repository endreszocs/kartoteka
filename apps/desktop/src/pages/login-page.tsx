import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@kartoteka/ui'

import { hasPin, setOfflineMode } from '../lib/auth-pin'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'

/**
 * Login képernyő — Kartotéka Desktop (M1.5).
 *
 * Email + jelszó alapú bejelentkezés a Supabase-en keresztül. A
 * kliens-oldali factory a `@kartoteka/supabase-client` közös csomagot
 * használja (a Vite `import.meta.env.VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
 * értékeivel — `.env` fájlt `cp .env.example .env`-vel lehet létrehozni).
 *
 * Sikeres bejelentkezés: redirect `/` (auth-gate mögötti dashboard).
 */
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = getDesktopSupabase()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        setError(translateAuthError(signInError.message))
        return
      }

      // A online-login érvényteleníti az esetleges korábbi offline-mode-ot:
      // innentől a "rendes" Supabase session az auth-forrás.
      setOfflineMode(false)

      // Ha még nincs beállítva offline PIN, átirányítunk a setup-ra.
      // A-M6.9: a lelkészt informáljuk az offline-védelemről (memory:
      // feedback_lelkesz_informalas — "mindenről informálva legyen").
      try {
        const pinExists = await hasPin()
        if (!pinExists) {
          navigate('/pin-setup', { replace: true })
          return
        }
      } catch {
        // Ha a keyring nem válaszol, ne blokkoljuk az alap-login flow-t
      }

      navigate('/', { replace: true })
    } catch (err: unknown) {
      const msg = errorMessage(err)
      setError(`Nem sikerült csatlakozni a rendszerhez: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Kartotéka bejelentkezés</CardTitle>
          <CardDescription>
            EREK egyházi adminisztrációs rendszer — desktop kliens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail cím</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="email@pelda.hu"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Jelszó</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Bejelentkezés…' : 'Bejelentkezés'}
            </Button>

            <p className="text-xs text-muted-foreground">
              A hozzáférést az egyházkerületi rendszergazda hagyja jóvá. Ha még nincs
              fiókod, a <strong>/hozzaferes-kerese</strong> publikus űrlapon kérhetsz
              belépést a webes felületen.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

/**
 * A Supabase standard angol hiba-üzeneteit lecseréljük felhasználóbarát magyar
 * változatra.
 */
function translateAuthError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials')) {
    return 'Hibás e-mail cím vagy jelszó.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Az e-mail cím még nincs megerősítve. Nézd meg az inbox-odat.'
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Nem sikerült csatlakozni a szerverhez. Ellenőrizd az internet-kapcsolatot.'
  }
  return msg
}
