import { useEffect, useState, type FormEvent } from 'react'
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

import { errorMessage } from '../lib/error'
import {
  formatLockoutMessage,
  pinStatus,
  setOfflineMode,
  verifyPin,
} from '../lib/auth-pin'

/**
 * PIN Entry Page (A-M6.9, 2026-04-22) — offline belépés PIN-nel.
 *
 * Ide akkor kerül a user, ha:
 *   - Nincs érvényes Supabase session (pl. refresh token 30+ napja lejárt)
 *   - DE van tárolt PIN-hash a keyring-ben (korábbi online login után beállítva)
 *
 * Sikeres PIN-verify után:
 *   - `setOfflineMode(true)` → a session-lifetime-re a user engedélyezve
 *   - Navigate `/` → auth-gate átenged (offline-mode flag alapján)
 *
 * 10 sikertelen kísérlet után a PIN automatikusan törlődik (force logout),
 * és a user újra online kell bejelentkezzen.
 */
export function PinEntryPage() {
  const navigate = useNavigate()
  const [pin, setPinInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  // Kezdeti állapot olvasása — ha már lockout-ban van, ne engedje a submitet
  useEffect(() => {
    let mounted = true
    pinStatus()
      .then((s) => {
        if (!mounted) return
        if (!s.hasPin) {
          // Védőhálóként: ha valaki direktből /pin-entry-re megy, de nincs PIN
          navigate('/login', { replace: true })
          return
        }
        if (s.lockedUntilMs) {
          setLockedUntilMs(s.lockedUntilMs)
        }
      })
      .catch((err) => {
        console.error('[pin-entry] pinStatus hiba:', err)
      })
    return () => {
      mounted = false
    }
  }, [navigate])

  // Lockout countdown tick (1 mp-enként UI-frissítés)
  useEffect(() => {
    if (!lockedUntilMs) return
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      if (Date.now() >= lockedUntilMs) {
        setLockedUntilMs(null)
        window.clearInterval(id)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [lockedUntilMs])

  const isLocked = lockedUntilMs !== null && lockedUntilMs > Date.now()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (pin.length < 4) {
      setError('A PIN legalább 4 karakterből álljon.')
      return
    }

    setLoading(true)
    try {
      const result = await verifyPin(pin)

      if (result.ok) {
        setOfflineMode(true)
        setInfo('Sikeres belépés — továbbítunk a főoldalra…')
        setTimeout(() => navigate('/', { replace: true }), 600)
        return
      }

      if (result.forceLogout) {
        setError(
          'Túl sok hibás próbálkozás. A biztonsági kódot töröltük — kérlek, jelentkezz be újra online hálózaton.',
        )
        setTimeout(() => navigate('/login', { replace: true }), 2500)
        return
      }

      if (result.lockedUntilMs) {
        setLockedUntilMs(result.lockedUntilMs)
        setError(
          `Hibás kód. ${formatLockoutMessage(result.lockedUntilMs)}`,
        )
      } else if (result.attemptsRemaining !== null) {
        setError(
          `Hibás kód. Még ${result.attemptsRemaining} próbálkozás, mielőtt várnod kell.`,
        )
      } else {
        setError('Hibás kód. Próbáld újra.')
      }
      setPinInput('')
    } catch (err: unknown) {
      setError(`A kód ellenőrzése nem sikerült: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleBackToLogin() {
    // A user dönthet úgy, hogy PIN helyett inkább online-bejelentkezik
    navigate('/login', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Offline belépés</CardTitle>
          <CardDescription>
            Úgy tűnik, hosszabb ideje nem csatlakoztál hálózatra. A korábban
            beállított biztonsági kóddal hálózat nélkül is be tudsz lépni a
            lokális adataidhoz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">Biztonsági kód</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                autoFocus
                required
                disabled={loading || isLocked}
                value={pin}
                onChange={(e) => setPinInput(e.currentTarget.value)}
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

            {info && (
              <div
                role="status"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              >
                {info}
              </div>
            )}

            {isLocked && lockedUntilMs && (
              <div
                role="status"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                data-tick={tick}
              >
                {formatLockoutMessage(lockedUntilMs)}
              </div>
            )}

            <div className="rounded-md border border-orange-200 bg-orange-50/70 px-3 py-2 text-xs text-orange-900">
              <strong>Offline-módban</strong> csak olvasni tudsz. Az új rögzítések
              és módosítások a következő hálózati csatlakozáskor szinkronizálódnak.
            </div>

            <Button
              type="submit"
              disabled={loading || isLocked}
              className="w-full"
            >
              {loading ? 'Ellenőrzés…' : 'Belépés offline módban'}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleBackToLogin}
              className="w-full"
            >
              Mégis online jelentkezem be
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
