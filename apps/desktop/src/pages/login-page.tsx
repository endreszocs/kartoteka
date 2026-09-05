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

import { clearPin, pinTulajdonosEllenorzes, setOfflineMode } from '../lib/auth-pin'
import { saveLastUser } from '../lib/desktop-user'
import { ELSO_INDITAS_UT, varazsloFolyamatban } from '../lib/elso-inditas'
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
 * Sikeres bejelentkezés: redirect `/` (auth-gate mögötti dashboard) — de
 * ELŐTTE a PIN-tulajdonos egyeztetése (2026-09-05, desk-auth-2): ha a gépen
 * MÁSIK fiók kódja van, azt töröljük, és a belépő a sajátját állítja be.
 */
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 2026-08-15 (8. pont B): a 2FA második lépcsője a desktopon.
  // 'jelszo' = normál űrlap; 'mfa' = a hitelesítő app 6 jegyű kódja kell.
  const [fazis, setFazis] = useState<'jelszo' | 'mfa'>('jelszo')
  const [mfaKod, setMfaKod] = useState('')

  const navigate = useNavigate()

  // Ha az AuthGate aal1-es (kódra váró) sessionnel küldött ide, egyből a
  // kód-lépcsőt mutatjuk — nem kell újra jelszót írni.
  useEffect(() => {
    let cancelled = false
    const supabase = getDesktopSupabase()
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data: aal }) => {
        if (cancelled) return
        if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') setFazis('mfa')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  /** A sikeres (és aal-rendezett) hitelesítés utáni közös folytatás. */
  async function belepesFolytatas() {
    // A online-login érvényteleníti az esetleges korábbi offline-mode-ot:
    // innentől a "rendes" Supabase session az auth-forrás.
    setOfflineMode(false)

    // 2026-09-05: ha az Első indítás varázslóból jöttünk (e-mail+jelszó út),
    // a belépés után a varázsló következő lépése jön (gyülekezet, PIN, szinkron).
    if (varazsloFolyamatban()) {
      navigate(ELSO_INDITAS_UT, { replace: true })
      return
    }

    // A PIN a FELHASZNÁLÓHOZ kötött (2026-09-05, desk-auth-2 / P1):
    //   'nincs'  → a belépő még nem adott kódot → /pin-setup;
    //   'idegen' → a gépen MÁSIK fiók kódja (vagy tulajdonos nélküli, frissítés
    //              előtti kód) → TÖRÖLJÜK (a remember-jelzővel együtt), és a
    //              belépő a sajátját állítja be → /pin-setup;
    //   'sajat'  → mehet a főoldal.
    // MIÉRT itt: a régi `hasPin()` igaz volt az előző lelkész kódjára is, így
    // B user sosem kapott PIN-beállítást, és A kódja nyitotta B tükrét.
    const supabase = getDesktopSupabase()
    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData.session?.user.id ?? null
    if (!uid) {
      setError('A belépés nem hozott létre munkamenetet — próbáld újra.')
      return
    }
    // A gép utolsó ismert felhasználója MÁR ITT a belépő (a varázsló
    // `belepesUtan`-jával azonos szabály): a PIN-belépő tulajdonos-kapuja és a
    // tükör-tulajdonos örökbefogadási ága ebből old fel — az AuthGate a
    // /pin-setup kitérő miatt csak később mountol (bíráló P1 kísérője).
    saveLastUser({ id: uid, email: sessionData.session?.user.email ?? null })
    try {
      const allapot = await pinTulajdonosEllenorzes(uid)
      if (allapot === 'idegen') {
        await clearPin()
        navigate('/pin-setup', { replace: true })
        return
      }
      if (allapot === 'nincs') {
        navigate('/pin-setup', { replace: true })
        return
      }
    } catch (err: unknown) {
      // A kulcstár nem válaszol: a felhő-belépés sikerült, ezt NEM blokkoljuk,
      // de a hiba LÁTHATÓ — a kódot a Beállításokban kell később rendezni.
      setError(
        `A belépés sikerült, de a biztonsági kód nem ellenőrizhető (a kulcstár nem válaszol: ${errorMessage(err)}). ` +
          'A Beállítások → Fiók / Kapcsolat → Biztonsági kód kártyán később ellenőrizd. Továbbítunk a főoldalra…',
      )
      setTimeout(() => navigate('/', { replace: true }), 3000)
      return
    }

    navigate('/', { replace: true })
  }

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

      // 2026-08-15 (8. pont B): ha a fiókon kétlépcsős belépés van, a jelszó
      // után a hitelesítő app kódja következik — e nélkül a session aal1-en
      // maradna, és a webbel közös védelem (RLS aal2-kényszer) elutasítaná.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        setMfaKod('')
        setFazis('mfa')
        return
      }

      await belepesFolytatas()
    } catch (err: unknown) {
      const msg = errorMessage(err)
      setError(`Nem sikerült csatlakozni a rendszerhez: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const tiszta = mfaKod.replace(/\D/g, '')
    if (tiszta.length !== 6) {
      setError('A hitelesítő alkalmazás 6 számjegyű kódját írd be.')
      return
    }
    setLoading(true)
    try {
      const supabase = getDesktopSupabase()
      const { data: f, error: fErr } = await supabase.auth.mfa.listFactors()
      const totp = (f?.totp || []).find((x) => x.status === 'verified')
      if (fErr || !totp) {
        // Nincs (már) faktor → mehet tovább a normál úton.
        await belepesFolytatas()
        return
      }
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr || !ch) {
        setError(`Az ellenőrzés nem indult el: ${chErr?.message || 'ismeretlen hiba'}`)
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: ch.id,
        code: tiszta,
      })
      if (vErr) {
        setError('A kód nem stimmel — az appban 30 másodpercenként új szám jelenik meg, a frisset írd be.')
        return
      }
      await belepesFolytatas()
    } catch (err: unknown) {
      setError(`Nem sikerült csatlakozni a rendszerhez: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function mfaMegse() {
    // Csak ENNEK a gépnek a félkész (aal1) munkamenetét dobjuk el — a
    // paraméter nélküli signOut 'global' lenne: a lelkész minden más eszközét
    // (web, telefon) is kijelentkeztetné egy „Mégse" gombbal.
    const supabase = getDesktopSupabase()
    await supabase.auth.signOut({ scope: 'local' })
    setMfaKod('')
    setFazis('jelszo')
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
          {fazis === 'mfa' ? (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A fiókodon <strong>kétlépcsős belépés</strong> van. Írd be a telefonod hitelesítő
                alkalmazásában látható 6 számjegyű kódot:
              </p>
              <div className="space-y-2">
                <Label htmlFor="mfa-kod">Hitelesítő kód</Label>
                <Input
                  id="mfa-kod"
                  inputMode="numeric"
                  maxLength={7}
                  required
                  autoFocus
                  disabled={loading}
                  value={mfaKod}
                  onChange={(e) => setMfaKod(e.currentTarget.value)}
                  placeholder="123 456"
                  className="text-center text-xl tracking-widest"
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
                {loading ? 'Ellenőrzés…' : 'Belépés'}
              </Button>

              <p className="text-xs text-muted-foreground">
                Nincs nálad a telefonod? A <strong>webes felületen</strong> a mentőkódjaid egyikével
                be tudsz lépni — az a kétlépcsős belépést kikapcsolja, utána a desktop is beenged.
              </p>

              <button
                type="button"
                onClick={mfaMegse}
                className="w-full text-center text-xs text-muted-foreground underline"
              >
                Mégse — vissza a bejelentkezéshez
              </button>
            </form>
          ) : (
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

            {/* 2026-09-05: a jelszó nélküli (Google-fiókos) lelkész útja */}
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              className="w-full"
              onClick={() => navigate(`${ELSO_INDITAS_UT}?lepes=belepes`)}
            >
              Összekapcsolás a webes fiókkal (Google-belépés is)
            </Button>

            <p className="text-xs text-muted-foreground">
              A hozzáférést az egyházkerületi rendszergazda hagyja jóvá. Ha még nincs
              fiókod, a <strong>/hozzaferes-kerese</strong> publikus űrlapon kérhetsz
              belépést a webes felületen.
            </p>
          </form>
          )}
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
