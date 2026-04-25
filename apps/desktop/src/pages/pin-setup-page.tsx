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

import { errorMessage } from '../lib/error'
import { setPin } from '../lib/auth-pin'

/**
 * PIN Setup Page (A-M6.9, 2026-04-22) — offline PIN beállítása.
 *
 * Mikor jön ide a user:
 *   - Első sikeres online bejelentkezés után, ha még nincs tárolt PIN-hash
 *   - Később a Beállítások → Biztonság fülről, ha újra akarja csinálni (TODO: A-M15)
 *
 * A PIN:
 *   - 4–64 karakter (a Rust oldal is validálja)
 *   - Argon2id-hash-elve a Tauri keyring-ben él
 *   - NEM küldődik el Supabase-nek, soha nem hagyja el a gépet
 *   - 30+ napos offline használat után is beengedi a lelkészt a lokális adatokba
 */
export function PinSetupPage() {
  const navigate = useNavigate()
  const [pin, setPinInput] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (pin.length < 4) {
      setError('A PIN legalább 4 karakterből álljon.')
      return
    }
    if (pin.length > 64) {
      setError('A PIN legfeljebb 64 karakter lehet.')
      return
    }
    if (pin !== confirm) {
      setError('A két PIN nem egyezik meg. Kérlek, írd be újra.')
      return
    }

    setLoading(true)
    try {
      await setPin(pin)
      setSuccess(true)
      // Rövid visszajelzés után tovább a főoldalra
      setTimeout(() => navigate('/', { replace: true }), 1200)
    } catch (err: unknown) {
      setError(`A PIN mentése nem sikerült: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  function handleSkip() {
    // Ha most kihagyja, később a Beállítások-ból is elindíthatja.
    // A "mindenről informálva" alapelv miatt a user tudja, mit hagy ki.
    navigate('/', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Offline belépési kód beállítása</CardTitle>
          <CardDescription>
            Ezzel a kóddal akkor is be tudsz lépni a rendszerbe, ha 30 napnál
            hosszabb ideig nem volt hálózatod. A kód a saját gépeden, titkosítva
            tárolódik — sosem küldjük el szerverre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"
            >
              <p className="font-medium">A belépési kódot elmentettük. ✅</p>
              <p className="mt-1 text-emerald-700">
                Mostantól hálózat nélkül is be tudsz lépni. Átirányítunk a főoldalra…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">Új belépési kód (legalább 4 karakter)</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  autoFocus
                  required
                  minLength={4}
                  maxLength={64}
                  disabled={loading}
                  value={pin}
                  onChange={(e) => setPinInput(e.currentTarget.value)}
                  placeholder="Pl. egy 6 jegyű szám, vagy rövid jelmondat"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Kód megerősítése</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={4}
                  maxLength={64}
                  disabled={loading}
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
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

              <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                <strong>Fontos:</strong> jegyezd meg a kódot — nem tudjuk
                visszaállítani. Ha elfelejted, új online bejelentkezés után újra
                beállíthatod.
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? 'Mentés…' : 'Kód mentése'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={handleSkip}
                >
                  Később
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Ha most kihagyod: a Beállítások → Adat &amp; biztonság menüben
                bármikor beállíthatod. Addig csak online tudsz belépni.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
