/**
 * PIN-űrlap + PIN-kártya (2026-09-05, desk-firstrun-7 / desk-auth-12).
 *
 * MIÉRT KÖZÖS: a PIN-beállító űrlap eddig CSAK a `/pin-setup` oldalon élt, a
 * Beállítások pedig egy nem létező helyre („Adat & biztonság") ígérte a kód
 * utólagos beállítását. Egy űrlap-törzs — három hívó: a `/pin-setup` oldal
 * (belépés utáni kötelező lépés), az Első indítás varázsló 4. lépése és a
 * Beállítások → Fiók / Kapcsolat fül PIN-kártyája.
 *
 * A KÓD MINDIG A BEJELENTKEZETT USERHEZ KÖTVE íródik (`setPin(pin, userId)`):
 * tulajdonos nélküli PIN nem keletkezhet. A kártya műveletei (beállítás,
 * módosítás, törlés) CSAK élő felhő-munkamenettel engedettek — offline (PIN-es)
 * munkamenetben a törlés a saját tükrét zárná ki a lelkész elől a következő
 * újra-összekapcsolásig.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { Button, Input, Label } from '@kartoteka/ui'

import {
  clearPin,
  clearPinResetPending,
  formatLockoutMessage,
  pinStatus,
  pinTulajdonosEllenorzes,
  setPin,
  verifyPin,
  type PinTulajdonosAllapot,
} from '../../lib/auth-pin'
import { errorMessage } from '../../lib/error'

// ────────────────────────────────────────────────────────────────────────
// PinUrlap — a közös űrlap-törzs
// ────────────────────────────────────────────────────────────────────────

export interface PinUrlapProps {
  /** A bejelentkezett user id-ja — a kód tulajdonosa. */
  userId: string
  /** 'beallitas' = új kód; 'modositas' = a jelenlegi kód megadása is kell. */
  mod: 'beallitas' | 'modositas'
  /** Sikeres mentés után hívjuk (a hívó navigál / frissít). */
  onMentve: () => void
  onMegse?: () => void
  mentesFelirat?: string
  autoFocus?: boolean
  /** Az űrlap alatti magyarázó doboz elrejtése (a varázsló saját szöveget ad). */
  magyarazatNelkul?: boolean
}

export function PinUrlap({
  userId,
  mod,
  onMentve,
  onMegse,
  mentesFelirat,
  autoFocus = true,
  magyarazatNelkul = false,
}: PinUrlapProps) {
  const [jelenlegi, setJelenlegi] = useState('')
  const [pin, setPinInput] = useState('')
  const [pin2, setPin2] = useState('')
  const [hiba, setHiba] = useState<string | null>(null)
  const [fut, setFut] = useState(false)

  async function mentes(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setHiba(null)
    if (pin.length < 4) return setHiba('A kód legalább 4 karakter legyen.')
    if (pin.length > 64) return setHiba('A kód legfeljebb 64 karakter lehet.')
    if (pin !== pin2) return setHiba('A két kód nem egyezik — írd be újra mindkettőt.')
    setFut(true)
    try {
      if (mod === 'modositas') {
        // A régi kód ellenőrzése ugyanazon a lockout-szabályzaton megy, mint a
        // belépő: a hibás próbálkozások itt is számítanak (nem kerülhető meg).
        const v = await verifyPin(jelenlegi)
        if (!v.ok) {
          if (v.forceLogout) {
            setHiba('Túl sok hibás próbálkozás — a kódot töröltük. Adj meg újat a „Kód beállítása" gombbal.')
          } else if (v.lockedUntilMs) {
            setHiba(`A jelenlegi kód hibás. ${formatLockoutMessage(v.lockedUntilMs)}`)
          } else {
            setHiba(
              v.attemptsRemaining !== null
                ? `A jelenlegi kód hibás. Még ${v.attemptsRemaining} próbálkozás, mielőtt várnod kell.`
                : 'A jelenlegi kód hibás.',
            )
          }
          return
        }
      }
      await setPin(pin, userId)
      clearPinResetPending()
      setJelenlegi('')
      setPinInput('')
      setPin2('')
      onMentve()
    } catch (err: unknown) {
      setHiba(`A kód mentése nem sikerült: ${errorMessage(err)}`)
    } finally {
      setFut(false)
    }
  }

  return (
    <form onSubmit={mentes} className="space-y-4">
      {mod === 'modositas' && (
        <div className="space-y-1.5">
          <Label htmlFor="pin-jelenlegi">Jelenlegi kód</Label>
          <Input
            id="pin-jelenlegi"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus={autoFocus}
            required
            disabled={fut}
            value={jelenlegi}
            onChange={(e) => setJelenlegi(e.currentTarget.value)}
            className="min-h-11"
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pin-uj">Új kód (legalább 4 karakter)</Label>
          <Input
            id="pin-uj"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            autoFocus={autoFocus && mod === 'beallitas'}
            required
            minLength={4}
            maxLength={64}
            disabled={fut}
            value={pin}
            onChange={(e) => setPinInput(e.currentTarget.value)}
            placeholder="Pl. egy 6 jegyű szám"
            className="min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pin-uj2">Kód még egyszer</Label>
          <Input
            id="pin-uj2"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            required
            minLength={4}
            maxLength={64}
            disabled={fut}
            value={pin2}
            onChange={(e) => setPin2(e.currentTarget.value)}
            className="min-h-11"
          />
        </div>
      </div>

      {hiba && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {hiba}
        </div>
      )}

      {!magyarazatNelkul && (
        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          A kód CSAK ezen a gépen, titkosítva él — sosem küldjük el szerverre. Ha elfelejted, a
          webes fiókoddal újra összekapcsolod a gépet, és új kódot adsz meg; adat nem vész el.
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={fut} className="min-h-11 flex-1">
          {fut ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}
          {mentesFelirat ?? (mod === 'modositas' ? 'Kód módosítása' : 'Kód mentése')}
        </Button>
        {onMegse && (
          <Button type="button" variant="outline" disabled={fut} onClick={onMegse} className="min-h-11">
            Mégse
          </Button>
        )}
      </div>
    </form>
  )
}

// ────────────────────────────────────────────────────────────────────────
// PinKartya — a Beállítások → Fiók / Kapcsolat fül kártyája
// ────────────────────────────────────────────────────────────────────────

export interface PinKartyaProps {
  /** A gép feloldott felhasználója (offline is). */
  userId: string | null
  /** Van-e élő felhő-munkamenet — enélkül a műveletek zárva. */
  sessionOnline: boolean
  /** Ha a kód változik (beállítás/törlés), a hívó frissítheti a saját állapotát. */
  onValtozott?: () => void
}

type Nezet = 'attekintes' | 'beallitas' | 'modositas' | 'torles'

export function PinKartya({ userId, sessionOnline, onValtozott }: PinKartyaProps) {
  const [allapot, setAllapot] = useState<PinTulajdonosAllapot | null>(null)
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null)
  const [betoltesHiba, setBetoltesHiba] = useState<string | null>(null)
  const [nezet, setNezet] = useState<Nezet>('attekintes')
  const [uzenet, setUzenet] = useState<string | null>(null)
  const [muveletHiba, setMuveletHiba] = useState<string | null>(null)
  const [torlesFut, setTorlesFut] = useState(false)

  const frissit = useCallback(async () => {
    setBetoltesHiba(null)
    if (!userId) {
      setAllapot(null)
      return
    }
    try {
      const [tul, st] = await Promise.all([pinTulajdonosEllenorzes(userId), pinStatus()])
      setAllapot(tul)
      setLockedUntilMs(st.lockedUntilMs)
    } catch (err: unknown) {
      setAllapot(null)
      setBetoltesHiba(`A kód állapota nem olvasható ki a kulcstárból: ${errorMessage(err)}`)
    }
  }, [userId])

  useEffect(() => {
    // A következő tickben (auth-gate minta): a CI-lint tiltja az effektben
    // SZINKRON setState-et, a frissit pedig a hibajelzőt azonnal nullázza.
    const id = window.setTimeout(() => void frissit(), 0)
    return () => window.clearTimeout(id)
  }, [frissit])

  async function torles() {
    setMuveletHiba(null)
    setTorlesFut(true)
    try {
      await clearPin()
      setUzenet('A biztonsági kódot töröltük. A következő indításkor az alkalmazás újra végigvezet a beállításon.')
      setNezet('attekintes')
      await frissit()
      onValtozott?.()
    } catch (err: unknown) {
      setMuveletHiba(`A kód törlése nem sikerült: ${errorMessage(err)}`)
    } finally {
      setTorlesFut(false)
    }
  }

  const allapotSzoveg =
    allapot === null
      ? betoltesHiba
        ? 'Nem olvasható'
        : userId
          ? 'Ellenőrzés…'
          : 'Nincs feloldott felhasználó'
      : allapot === 'sajat'
        ? 'Be van állítva — a te fiókodhoz kötve'
        : allapot === 'idegen'
          ? 'A gépen MÁSIK fiók kódja van'
          : 'Nincs beállítva'

  const allapotSzin =
    allapot === 'sajat'
      ? 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100'
      : allapot === 'idegen' || betoltesHiba
        ? 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100'
        : 'border-border bg-secondary/40 text-foreground'

  return (
    <div className="rounded-[1.2rem] border border-border bg-card p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">Biztonsági kód (PIN)</h4>
          <p className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${allapotSzin}`}>
            {allapotSzoveg}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Ezzel a kóddal lépsz be a gépen — internet nélkül is. A kód a saját gépeden, titkosítva
            él, és a fiókodhoz van kötve: más fiók kódja nem nyitja meg a te adataidat.
          </p>
          {betoltesHiba && (
            <p role="alert" className="mt-1.5 text-[11px] text-destructive">
              {betoltesHiba}
            </p>
          )}
          {allapot === 'idegen' && (
            <p className="mt-1.5 text-[11px] leading-snug text-amber-900 dark:text-amber-100">
              Ezen a gépen korábban másik fiókkal állítottak be kódot (vagy a kód még a frissítés
              előttről való, tulajdonos nélkül). A „Kód beállítása" felülírja a sajátoddal.
            </p>
          )}
          {lockedUntilMs !== null && lockedUntilMs > Date.now() && (
            <p className="mt-1.5 text-[11px] text-amber-900 dark:text-amber-100">
              Zárolva hibás próbálkozások miatt. {formatLockoutMessage(lockedUntilMs)}
            </p>
          )}
        </div>
      </div>

      {uzenet && (
        <div
          role="status"
          className="mt-3 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100"
        >
          {uzenet}
        </div>
      )}
      {muveletHiba && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {muveletHiba}
        </div>
      )}

      {!sessionOnline && (
        <div className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
          A kód beállításához, módosításához vagy törléséhez élő felhő-belépés kell — így biztos,
          hogy a kód tényleg a bejelentkezett fiókhoz kötődik. Offline (PIN-es) munkamenetben a
          kód nem változtatható; lépj be online a Munkamenet kártyán.
        </div>
      )}

      {sessionOnline && userId && nezet === 'attekintes' && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {allapot === 'sajat' ? (
            <>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => { setUzenet(null); setNezet('modositas') }}>
                <RefreshCw className="mr-2 size-4" /> Kód módosítása
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => { setUzenet(null); setNezet('torles') }}
              >
                <Trash2 className="mr-2 size-4" /> Kód törlése
              </Button>
            </>
          ) : allapot !== null ? (
            <Button type="button" className="min-h-11" onClick={() => { setUzenet(null); setNezet('beallitas') }}>
              <KeyRound className="mr-2 size-4" /> Kód beállítása
            </Button>
          ) : null}
        </div>
      )}

      {sessionOnline && userId && (nezet === 'beallitas' || nezet === 'modositas') && (
        <div className="mt-3">
          <PinUrlap
            userId={userId}
            mod={nezet}
            onMentve={() => {
              setUzenet(nezet === 'modositas' ? 'A kódot módosítottuk.' : 'A kódot beállítottuk — ezzel lépsz be ezután.')
              setNezet('attekintes')
              void frissit()
              onValtozott?.()
            }}
            onMegse={() => setNezet('attekintes')}
            magyarazatNelkul
          />
        </div>
      )}

      {sessionOnline && userId && nezet === 'torles' && (
        <div className="mt-3 space-y-3 rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Biztosan törlöd a kódot?</p>
          <p className="text-xs">
            Kód nélkül a gép a következő indításkor újra végigvezet az összekapcsoláson és egy új
            kód beállításán (internet kell hozzá). A helyi adataid nem vesznek el.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="min-h-11" disabled={torlesFut} onClick={() => setNezet('attekintes')}>
              Mégse
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" disabled={torlesFut} onClick={() => void torles()}>
              {torlesFut ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
              Kód törlése
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
