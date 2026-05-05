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
  setRememberOffline,
  isRememberOfflineActive,
  getRememberOfflineExpiresAt,
  requestPinReset,
  verifyPin,
} from '../lib/auth-pin'

const REMEMBER_DEFAULT_DAYS = 7

/**
 * PIN Entry Page (A-M6.9, 2026-04-22; 2026-05-05 perzisztens flag + reset).
 *
 * Ide akkor kerül a user, ha:
 *   - Nincs érvényes Supabase session (pl. refresh token 30+ napja lejárt)
 *   - DE van tárolt PIN-hash a keyring-ben (korábbi online login után beállítva)
 *
 * Sikeres PIN-verify után:
 *   - `setOfflineMode(true)` → a session-lifetime-re a user engedélyezve
 *   - Ha a "Emlékezz erre a gépre" be van pipálva → `setRememberOffline(7)` →
 *     7 napig frissítés után sem kell újra PIN-t kérni
 *   - Navigate `/` → auth-gate átenged
 *
 * Új gomb: "Elfelejtettem a kódot" — clearPin + redirect /login
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
  const [rememberMe, setRememberMe] = useState<boolean>(() =>
    isRememberOfflineActive(),
  )
  const [showForgotConfirm, setShowForgotConfirm] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  // Kezdeti állapot olvasása — ha már lockout-ban van, ne engedje a submitet
  useEffect(() => {
    let mounted = true
    pinStatus()
      .then((s) => {
        if (!mounted) return
        if (!s.hasPin) {
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
  const rememberExpiresAt = getRememberOfflineExpiresAt()

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
        if (rememberMe) {
          setRememberOffline(REMEMBER_DEFAULT_DAYS)
          setInfo(
            `Sikeres belépés — ${REMEMBER_DEFAULT_DAYS} napig nem kell újra kódot megadnod ezen a gépen. Továbbítunk a főoldalra…`,
          )
        } else {
          setRememberOffline(0)
          setInfo('Sikeres belépés — továbbítunk a főoldalra…')
        }
        setTimeout(() => navigate('/', { replace: true }), 700)
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
    navigate('/login', { replace: true })
  }

  async function handleConfirmForgot() {
    setForgetting(true)
    try {
      await requestPinReset()
      setInfo(
        'A biztonsági kódot töröltük. Kérlek, jelentkezz be online hálózaton — új kódot a sikeres bejelentkezés után állíthatsz be.',
      )
      setTimeout(() => navigate('/login', { replace: true }), 2200)
    } catch (err) {
      setError(`A kód törlése nem sikerült: ${errorMessage(err)}`)
      setForgetting(false)
      setShowForgotConfirm(false)
    }
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
          {showForgotConfirm ? (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <p className="font-semibold">Biztosan elfelejtetted a kódot?</p>
                <p className="mt-1">
                  Töröljük a tárolt biztonsági kódot, és online hálózaton kell
                  újra bejelentkezned (Supabase fiókoddal). A bejelentkezés után
                  új kódot állíthatsz be. A lokális adataid ehhez nem vesznek el.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={forgetting}
                  onClick={() => setShowForgotConfirm(false)}
                >
                  Mégse
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={forgetting}
                  onClick={handleConfirmForgot}
                >
                  {forgetting ? 'Törlés…' : 'Kód törlése'}
                </Button>
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
            </div>
          ) : (
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

              <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.currentTarget.checked)}
                  disabled={loading || isLocked}
                />
                <span>
                  <strong>Emlékezz erre a gépre {REMEMBER_DEFAULT_DAYS} napig</strong>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    A frissítések és a következő indítások után sem kell újra
                    megadnom a kódot, amíg ezen a gépen vagyok. Csak megbízható,
                    saját számítógépen ajánlott.
                  </span>
                  {rememberExpiresAt && (
                    <span className="mt-1 block text-xs text-emerald-700">
                      Jelenleg aktív — {new Date(rememberExpiresAt).toLocaleDateString('hu-HU')}-ig.
                    </span>
                  )}
                </span>
              </label>

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

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={handleBackToLogin}
                  className="flex-1"
                >
                  Mégis online jelentkezem be
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => setShowForgotConfirm(true)}
                  className="flex-1 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                >
                  Elfelejtettem a kódot
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
