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

import { getGepUtolsoUser } from '../lib/desktop-user'
import { ELSO_INDITAS_UT } from '../lib/elso-inditas'
import { errorMessage } from '../lib/error'
import {
  formatLockoutMessage,
  getRememberOfflineExpiresAt,
  isRememberOfflineActive,
  offlineBelepesEngedett,
  pinStatus,
  pinTulajdonosEllenorzes,
  requestPinReset,
  setOfflineMode,
  setRememberOffline,
  verifyPin,
} from '../lib/auth-pin'

const REMEMBER_DEFAULT_DAYS = 7

/**
 * PIN Entry Page (A-M6.9, 2026-04-22; 2026-05-05 perzisztens flag + reset;
 * 2026-09-05 PIN-TULAJDONOS kapu).
 *
 * Ide akkor kerül a user, ha:
 *   - Nincs érvényes Supabase session (pl. refresh token lejárt)
 *   - DE van tárolt PIN-hash a keyring-ben (korábbi online login után beállítva)
 *
 * TULAJDONOS-KAPU (desk-auth-2 / P1): a kód CSAK akkor nyitja a gépet, ha a
 * keyringben tárolt tulajdonos megegyezik a gép utolsó ismert felhasználójával
 * (belépés-cache → egyetlen lokális profil). Ha a tulajdonos más (közös gépen
 * előző lelkész kódja), vagy nem állapítható meg (nincs cache, nincs profil),
 * a belépés FAIL-CLOSED zárva: magyarázat + „Összekapcsolás újra" a varázslóba.
 * Az idegen kódot maga az online belépés törli (login-page / varázsló).
 *
 * Sikeres PIN-verify után:
 *   - `setOfflineMode(true)` → a session-lifetime-re a user engedélyezve
 *   - Ha a "Emlékezz erre a gépre" be van pipálva → `setRememberOffline(7)` —
 *     a jelző PIN NÉLKÜL érvénytelen (`offlineBelepesEngedett`), ezért ha
 *     időközben a kód törlődött, a jelző is elvész.
 *   - Navigate `/` → auth-gate átenged
 *
 * 10 sikertelen kísérlet után a PIN automatikusan törlődik (force logout),
 * és a user újra online kell bejelentkezzen.
 */
type TulajdonosNezet = 'ellenorzes' | 'sajat' | 'idegen' | 'ismeretlen'

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
  // 2026-09-05: kié a gépen tárolt kód a gép utolsó felhasználójához képest?
  const [tulajdonos, setTulajdonos] = useState<TulajdonosNezet>('ellenorzes')
  const [gepUserEmail, setGepUserEmail] = useState<string | null>(null)
  const [tulajdonosHiba, setTulajdonosHiba] = useState<string | null>(null)

  // Kezdeti állapot: van-e PIN, lockout, ÉS kié a kód (tulajdonos-kapu).
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const s = await pinStatus()
        if (!mounted) return
        if (!s.hasPin) {
          // Nincs kód → az Első indítás varázsló (összekapcsolás) a kiút.
          navigate(`${ELSO_INDITAS_UT}?lepes=belepes`, { replace: true })
          return
        }
        if (s.lockedUntilMs) {
          setLockedUntilMs(s.lockedUntilMs)
        }

        // Tulajdonos-egyeztetés: a gép utolsó ismert usere ↔ a kód tulajdonosa.
        const gepUser = await getGepUtolsoUser()
        if (!mounted) return
        if (!gepUser) {
          // Nem bizonyítható, kié a kód → fail-closed.
          setTulajdonos('ismeretlen')
          return
        }
        setGepUserEmail(gepUser.email)
        const allapot = await pinTulajdonosEllenorzes(gepUser.id)
        if (!mounted) return
        if (allapot === 'sajat') {
          setTulajdonos('sajat')
          // Élő „Emlékezz erre a gépre" jelző + SAJÁT kód → nem kérünk kódot.
          // (A jelzőt az offlineBelepesEngedett PIN-hez köti: kód nélkül törli.)
          if (await offlineBelepesEngedett()) {
            if (mounted) navigate('/', { replace: true })
          }
          return
        }
        // 'idegen' (vagy 'nincs', ha a kód időközben eltűnt — szintén zárva).
        setTulajdonos('idegen')
      } catch (err: unknown) {
        if (!mounted) return
        console.error('[pin-entry] pinStatus / tulajdonos hiba:', err)
        setTulajdonos('ismeretlen')
        setTulajdonosHiba(errorMessage(err))
      }
    })()
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

    // Védő-ág: az űrlap csak 'sajat' állapotban rajzolódik ki, de a submit
    // sem mehet át más állapotban (pl. verseny a tulajdonos-ellenőrzéssel).
    if (tulajdonos !== 'sajat') {
      setError('A kód tulajdonosa nem egyezik a gép felhasználójával — kapcsold újra össze a gépet a fiókoddal.')
      return
    }

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
          'Túl sok hibás próbálkozás. A biztonsági kódot töröltük — kapcsold újra össze a gépet a webes fiókoddal (internet kell hozzá).',
        )
        setTimeout(() => navigate(`${ELSO_INDITAS_UT}?lepes=belepes`, { replace: true }), 2500)
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

  function ujraOsszekapcsolas() {
    navigate(`${ELSO_INDITAS_UT}?lepes=belepes`, { replace: true })
  }

  async function handleConfirmForgot() {
    setForgetting(true)
    try {
      await requestPinReset()
      setInfo(
        'A biztonsági kódot töröltük. Most újra összekapcsoljuk a gépet a webes fiókoddal (a weben, bejelentkezve hagyod jóvá), utána új kódot adhatsz meg.',
      )
      // 2026-09-05: az elfelejtett PIN útja a webes fiókon át — Google-fiókkal is.
      setTimeout(() => navigate(`${ELSO_INDITAS_UT}?lepes=belepes&ok=pin`, { replace: true }), 2200)
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
          <CardTitle className="text-2xl">Belépés a géphez</CardTitle>
          <CardDescription>
            {gepUserEmail ? (
              <>
                <strong className="text-foreground">{gepUserEmail}</strong> fiókja ezen a gépen. A korábban
                beállított biztonsági kóddal internet nélkül is be tudsz lépni a helyi adataidhoz.
              </>
            ) : (
              'A korábban beállított biztonsági kóddal internet nélkül is be tudsz lépni a helyi adataidhoz.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tulajdonos === 'ellenorzes' ? (
            <p className="text-sm text-muted-foreground">A kód tulajdonosának ellenőrzése…</p>
          ) : tulajdonos !== 'sajat' ? (
            /* ── Tulajdonos-kapu: idegen vagy megállapíthatatlan kód → zárva ── */
            <div className="space-y-4">
              <div
                role="alert"
                className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <p className="font-semibold">
                  {tulajdonos === 'idegen'
                    ? 'A gépen tárolt kód nem a te fiókodhoz tartozik.'
                    : 'Nem állapítható meg, kinek a kódja van ezen a gépen.'}
                </p>
                <p className="mt-1">
                  {tulajdonos === 'idegen'
                    ? 'Ezen a gépen korábban másik fiókkal állítottak be biztonsági kódot (vagy a kód még a frissítés előttről való, tulajdonos nélkül). Biztonsági okból ezzel a kóddal nem nyitható meg a te nyilvántartásod.'
                    : 'A gép nem emlékszik az utolsó bejelentkezett fiókra, ezért a kódot nem tudjuk hozzád kötni.'}
                  {' '}Kapcsold újra össze a gépet a webes fiókoddal (internet kell hozzá) — az összekapcsolás
                  után új kódot adsz meg, a helyi adataid nem vesznek el.
                </p>
                {tulajdonosHiba && <p className="mt-1 text-xs">Részlet: {tulajdonosHiba}</p>}
              </div>
              <Button type="button" className="min-h-11 w-full" onClick={ujraOsszekapcsolas}>
                Összekapcsolás újra
              </Button>
              <Button type="button" variant="outline" className="min-h-11 w-full" onClick={handleBackToLogin}>
                Belépés e-mail címmel és jelszóval
              </Button>
            </div>
          ) : showForgotConfirm ? (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">Biztosan elfelejtetted a kódot?</p>
                <p className="mt-1">
                  Töröljük a tárolt biztonsági kódot, és online kapcsolattal újra
                  össze kell kapcsolnod a gépet a webes fiókoddal (a kartoteka.app
                  oldalon, bejelentkezve hagyod jóvá — Google-fiókkal is megy).
                  Utána új kódot állíthatsz be. A helyi adataid nem vesznek el.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={forgetting}
                  onClick={() => setShowForgotConfirm(false)}
                >
                  Mégse
                </Button>
                <Button
                  variant="destructive"
                  className="min-h-11 flex-1"
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
                  className="rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100"
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
                  className="min-h-11"
                />
              </div>

              <label className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.currentTarget.checked)}
                  disabled={loading || isLocked}
                />
                <span>
                  <strong>Emlékezz erre a gépre {REMEMBER_DEFAULT_DAYS} napig</strong>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    A frissítések és a következő indítások után sem kell újra
                    megadnom a kódot, amíg ezen a gépen vagyok. Csak megbízható,
                    saját számítógépen ajánlott — kijelentkezéskor és a kód
                    törlésekor a jelzés is törlődik.
                  </span>
                  {rememberExpiresAt && (
                    <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">
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
                  className="rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                >
                  {info}
                </div>
              )}

              {isLocked && lockedUntilMs && (
                <div
                  role="status"
                  className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100"
                  data-tick={tick}
                >
                  {formatLockoutMessage(lockedUntilMs)}
                </div>
              )}

              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">Offline munkamenetben</strong> rögzíthetsz is: a tételek a
                következő online belépéskor kerülnek fel a felhőbe. Csak online
                végezhető: bankműveletek, sztornó, nyugta-kiállítás.
              </div>

              <Button
                type="submit"
                disabled={loading || isLocked}
                className="min-h-11 w-full"
              >
                {loading ? 'Ellenőrzés…' : 'Belépés a kóddal'}
              </Button>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={handleBackToLogin}
                  className="min-h-11 flex-1"
                >
                  Mégis online jelentkezem be
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => setShowForgotConfirm(true)}
                  className="min-h-11 flex-1 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30"
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
