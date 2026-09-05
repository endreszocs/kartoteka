import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kartoteka/ui'

import { PinUrlap } from '../components/settings/pin-kartya'
import { clearPinResetPending, isPinResetPending } from '../lib/auth-pin'
import { ELSO_INDITAS_UT } from '../lib/elso-inditas'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'

/**
 * PIN Setup Page (A-M6.9, 2026-04-22; 2026-09-05 közös űrlap + tulajdonos).
 *
 * Mikor jön ide a user:
 *   - Sikeres online bejelentkezés után (/login), ha még nincs SAJÁT kódja
 *     ezen a gépen (nincs PIN, vagy más fiók kódja volt → azt a login törölte)
 *   - Az Első indítás varázsló a saját 4. lépésében ugyanezt az űrlapot
 *     (`PinUrlap`) használja; a Beállítások → Fiók / Kapcsolat → PIN-kártya is.
 *
 * A KÓD A BEJELENTKEZETT USERHEZ KÖTVE íródik — ezért ide csak élő felhő-
 * munkamenettel lehet érdemben eljutni; session nélkül a kiút a varázsló.
 */
export function PinSetupPage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [sessionHiba, setSessionHiba] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [resetPending, setResetPending] = useState(false)

  useEffect(() => {
    setResetPending(isPinResetPending())
  }, [])

  // A kód tulajdonosa = a bejelentkezett user. Session nélkül nincs kihez kötni.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const supabase = getDesktopSupabase()
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            window.setTimeout(() => resolve({ data: { session: null } }), 4000),
          ),
        ])
        if (cancelled) return
        setUserId(data.session?.user.id ?? null)
      } catch (err: unknown) {
        if (cancelled) return
        setUserId(null)
        setSessionHiba(errorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function handleSkip() {
    // „Később": a kód a Beállítások → Fiók / Kapcsolat → Biztonsági kód
    // kártyán állítható be. A reset-jelzőt itt is töröljük — különben a
    // következő megnyitáskor elavult „a régi kódot törölted" sáv jönne
    // (desk-auth-14).
    clearPinResetPending()
    navigate('/', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">
            {resetPending ? 'Új belépési kód beállítása' : 'Belépési kód beállítása'}
          </CardTitle>
          <CardDescription>
            {resetPending
              ? 'A korábbi kódot törölted — most állíts be egy újat. Ezzel a kóddal lépsz be a gépen ezután, internet nélkül is.'
              : 'Ezzel a kóddal lépsz be a gépen ezután — internet nélkül is. A kód a saját gépeden, titkosítva tárolódik, és a fiókodhoz van kötve; sosem küldjük el szerverre.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetPending && !success && (
            <div
              role="status"
              className="mb-4 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground"
            >
              <strong>Figyelem:</strong> az online bejelentkezés sikerült, és a régi belépési
              kódot töröltük. Most adj meg egy újat. A helyi adataid érintetlenek maradtak.
            </div>
          )}

          {success ? (
            <div
              role="status"
              className="rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100"
            >
              <p className="font-medium">A belépési kódot elmentettük.</p>
              <p className="mt-1">Mostantól hálózat nélkül is be tudsz lépni. Átirányítunk a főoldalra…</p>
            </div>
          ) : userId === undefined ? (
            <p className="text-sm text-muted-foreground">A munkamenet ellenőrzése…</p>
          ) : userId === null ? (
            <div className="space-y-3">
              <div
                role="alert"
                className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100"
              >
                Nincs élő felhő-belépés, ezért a kódot nincs kihez kötni.
                {sessionHiba ? ` (${sessionHiba})` : ''} Kapcsold össze a gépet a webes fiókoddal,
                és a varázsló végén állítsd be a kódot.
              </div>
              <Button type="button" className="min-h-11 w-full" onClick={() => navigate(`${ELSO_INDITAS_UT}?lepes=belepes`, { replace: true })}>
                Összekapcsolás a webes fiókkal
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <PinUrlap
                userId={userId}
                mod="beallitas"
                onMentve={() => {
                  setSuccess(true)
                  window.setTimeout(() => navigate('/', { replace: true }), 1200)
                }}
              />
              <Button type="button" variant="outline" className="min-h-11 w-full" onClick={handleSkip}>
                Később
              </Button>
              <p className="text-xs text-muted-foreground">
                Ha most kihagyod: a <strong>Beállítások → Fiók / Kapcsolat → Biztonsági kód</strong>{' '}
                kártyán bármikor beállíthatod. Addig a gépre csak online belépéssel jutsz be.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
