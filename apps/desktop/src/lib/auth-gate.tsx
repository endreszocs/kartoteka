import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

import {
  clearPin,
  clearRememberOffline,
  hasPin,
  isOfflineMode,
  offlineBelepesEngedett,
  pinTulajdonosEllenorzes,
  setOfflineMode,
} from './auth-pin'
import { clearLastUser, getLastUser, saveLastUser } from './desktop-user'
import { ELSO_INDITAS_UT } from './elso-inditas'
import { ensureLocalMirrorOwner, type MirrorOwnerResult } from './local-mirror-owner'
import { getDesktopSupabase } from './supabase'
import { getLocalOwnProfile, pullOwnProfile, type ProfileLocalRow } from './sync'
import { felfuggesztWriteSyncs, startAllWriteSyncs, withSyncTimeout } from './write-sync-registry'

/**
 * AuthGate — védett útvonalak wrapper-e a desktop app router-ben.
 *
 * A-M6.9 (2026-04-22) óta **négy kapu** van (2026-09-05: + státusz-kapu):
 *   1. Friss Supabase session → beenged (online mód) — de előtte:
 *      · 2FA: ha a fiókon a SZERVER faktor-listája szerint van ellenőrzött
 *        faktor és a session még aal1-es → /login (kód-lépcső);
 *      · tükör-tulajdonos: az előző user tükre kiürül (függő soroknál csak
 *        látható döntés után — döntő-lap);
 *      · STÁTUSZ: a `profiles_local.status` (friss pull után) nem 'active' →
 *        zárólap „a fiók jóváhagyásra vár" (Újraellenőrzés / Kilépés).
 *   2. Nincs session, de van aktív offline-mode flag (PIN már verifikálódott
 *      ebben az indításban) → beenged (offline mód, ugyanazok a kapuk a
 *      cache-ből)
 *   3. Nincs session, nincs offline-mode, de van tárolt PIN-hash
 *      → redirect `/pin-entry`
 *   4. Nincs semmi → ELSŐ INDÍTÁS varázsló (`/elso-inditas`)
 *
 * Subscribe-ol az `onAuthStateChange`-re: SIGNED_IN → online mód + lastUser
 * cache; a KÖNYVTÁRI SIGNED_OUT (lejárt refresh-token) NEM explicit
 * kijelentkezés — a lastUser / „Emlékezz" jelzők maradnak, a gép PIN-módba
 * esik vissza (desk-auth-5). A törlés kizárólag az explicit kijelentkezésnél
 * fut (`jelolExplicitKijelentkezes()` a `signOut` ELŐTT).
 *
 * Push-erek: a `write-sync-registry` EGY triggerkészlete indul — csak a
 * tükör-tulajdonos és a státusz-kapu UTÁN (desk-sync-20: az előző user
 * függő sora sosem mehet fel az új user nevében).
 */
/**
 * Az induló getSession() lejárt access-tokennél hálózati refresh-t indít —
 * offline gépen (vagy lassú hálózaton) ez sokáig vagy örökre függhet, és a
 * kapu addig a "Betöltés…" spinnert mutatta (2026-06-11 bugfix: a mentett
 * kódos belépés ezen ragadt be). A timeout után session nélkül továbbengedjük
 * a döntést (PIN-kapu / varázsló), a kései session-t pedig utólag felvesszük.
 */
const GET_SESSION_TIMEOUT_MS = 5000
/** A keyring IPC (hasPin) sem várhat a végtelenségig (desk-firstrun-9). */
const HAS_PIN_TIMEOUT_MS = 3000
/** A szerver faktor-listája (2FA-döntés) — hálózati, ezért időkorláttal. */
const MFA_TIMEOUT_MS = 6000
/** A státusz-kapu friss profil-pullja. */
const PROFIL_PULL_TIMEOUT_MS = 8000
/** Ennyi másodperc után a betöltő lapokon megjelennek a kiút-gombok. */
const GATE_KIUT_MS = 8000

const EXPLICIT_SIGNOUT_KEY = 'kartoteka-explicit-signout'

/**
 * Az EXPLICIT kijelentkezés jelzése — a `supabase.auth.signOut()` ELŐTT
 * hívandó (DesktopShell „Kijelentkezés"). Csak ilyenkor törlődik a lastUser
 * cache és az „Emlékezz erre a gépre" jelző; a könyvtári SIGNED_OUT
 * (lejárt refresh) ezeket békén hagyja.
 */
export function jelolExplicitKijelentkezes(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(EXPLICIT_SIGNOUT_KEY, '1')
  } catch {
    /* csendes — a jelző best-effort; nélküle a passzív ág fut (nem töröl) */
  }
}

function explicitKijelentkezesVolt(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const volt = window.sessionStorage.getItem(EXPLICIT_SIGNOUT_KEY) === '1'
    if (volt) window.sessionStorage.removeItem(EXPLICIT_SIGNOUT_KEY)
    return volt
  } catch {
    return false
  }
}

/** Betöltő lap CÍMKÉVEL; 8 mp után kiút-gombok (Újrapróbálás / Online belépés). */
function GateLoading({ cimke }: { cimke: string }) {
  const [kiut, setKiut] = useState(false)
  const [onlineBelepes, setOnlineBelepes] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setKiut(true), GATE_KIUT_MS)
    return () => window.clearTimeout(t)
  }, [])
  if (onlineBelepes) return <Navigate to={`${ELSO_INDITAS_UT}?lepes=belepes`} replace />
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-muted-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm">{cimke}</p>
        {kiut && (
          <div className="mt-2 w-full rounded-lg border border-border bg-card p-3 text-left text-xs text-foreground">
            <p>
              Ez a szokásosnál tovább tart. Lassú hálózaton vagy alvó gépen előfordul — ha
              nem halad, próbáld újra, vagy lépj be online.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-secondary"
                onClick={() => window.location.reload()}
              >
                Újrapróbálás
              </button>
              <button
                type="button"
                className="min-h-11 flex-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                onClick={() => setOnlineBelepes(true)}
              >
                Online belépés
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Zárólap-keret (státusz-kapu, kulcstár-hiba, tükör-döntés). */
function GateLap({
  cim,
  tone,
  children,
}: {
  cim: string
  tone: 'warning' | 'error'
  children: ReactNode
}) {
  const keret =
    tone === 'error'
      ? 'border-rose-500/40 bg-rose-500/10'
      : 'border-amber-500/40 bg-amber-500/10'
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className={`w-full max-w-md rounded-xl border p-5 text-foreground ${keret}`}>
        <p className="font-semibold">{cim}</p>
        {children}
      </div>
    </div>
  )
}

const gombAlap =
  'min-h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50'
const gombMasodlagos = `${gombAlap} border border-border bg-card hover:bg-secondary`
const gombElsodleges = `${gombAlap} bg-primary text-primary-foreground hover:opacity-90`
const gombVeszelyes = `${gombAlap} border border-rose-500/50 bg-card text-rose-700 hover:bg-rose-500/10 dark:text-rose-300`

type StatuszKapu = {
  uid: string
  allapot: 'ok' | 'blokkolt'
  profil: ProfileLocalRow | null
}

export function AuthGate() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [pinExists, setPinExists] = useState(false)
  /** A keyring IPC nem válaszolt (3 mp) — látható hibalap, nem néma „nincs PIN". */
  const [kulcstarHiba, setKulcstarHiba] = useState<string | null>(null)
  const [offlineActive, setOfflineActive] = useState(isOfflineMode())
  // 2026-08-15 (8. pont B): true = a fióknak van ellenőrzött 2FA-faktora, de
  // a munkamenet még aal1-es → a kód-lépcső (login-oldal) kell. null = még
  // nem tudjuk (ellenőrzés fut). 2026-09-05: a faktor-lista a SZERVERTŐL jön
  // (`mfa.listFactors()` → GET /user), nem a helyben tárolt session-ből.
  const [mfaSzukseges, setMfaSzukseges] = useState<boolean | null>(null)

  // P1-4 (audit 2026-08-28): a lokális tükör tulajdonos-ellenőrzése a
  // beengedés ELŐTT. Ha a gépen előzőleg MÁS user dolgozott, a tükör kiürül,
  // mielőtt az új belépő bármit olvasna belőle (közös Windows-loginon az
  // előző gyülekezet pénzügyi + tag-adatai eddig elérhetők maradtak).
  // A state az ELLENŐRZÖTT user id-ját tartja; a render-kapuk erre várnak.
  const [tukorOwnerOk, setTukorOwnerOk] = useState<string | null>(null)
  /** desk-sync-10: a váltás függő sorokat semmisítene meg → döntő-lap. */
  const [tukorDontes, setTukorDontes] = useState<{ uid: string; res: MirrorOwnerResult } | null>(null)
  const [tukorDontesFut, setTukorDontesFut] = useState(false)
  /** Státusz-kapu eredménye az adott userre (cache vagy friss pull után). */
  const [statusz, setStatusz] = useState<StatuszKapu | null>(null)
  const [statuszUjra, setStatuszUjra] = useState(0)

  const offlineUid = !session && offlineActive ? (getLastUser()?.id ?? null) : null
  const aktivUid = session?.user.id ?? offlineUid

  // ── PIN-tulajdonos kapu (2026-09-05, desk-fiok nyitott kérdése) ──────────
  // Az offline / „Emlékezz erre a gépre" belépés CSAK akkor engedett, ha van
  // PIN a gépen ÉS az a gép utolsó ismert felhasználójához kötött. Egy élő
  // remember-jelző PIN nélkül vagy idegen PIN-nel eddig némán beengedett.
  // null = az ellenőrzés fut (címkés betöltő), true = mehet, false = kiesik
  // a PIN-/varázsló-kapura.
  const [offlinePinOk, setOfflinePinOk] = useState<boolean | null>(null)
  useEffect(() => {
    if (session || !offlineActive) return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setOfflinePinOk(null) })
    void (async () => {
      let ok = false
      try {
        ok = await offlineBelepesEngedett()
        if (ok && offlineUid) ok = (await pinTulajdonosEllenorzes(offlineUid)) === 'sajat'
      } catch (err) {
        console.error('[auth-gate] PIN-tulajdonos ellenőrzés hiba:', err)
        ok = false
      }
      if (cancelled) return
      if (!ok) {
        setOfflineMode(false)
        clearRememberOffline()
        setOfflineActive(false)
      }
      setOfflinePinOk(ok)
    })()
    return () => {
      cancelled = true
    }
  }, [session, offlineActive, offlineUid])

  // Session-ág: ha a gépen MÁS felhasználó PIN-je van, az azonnal törlődik —
  // a következő belépéskor a saját kódot kell beállítani (a varázsló/login
  // ugyanezt teszi; itt a kapu a hálózat visszatérésekor is fogja).
  useEffect(() => {
    if (!session) return
    const uid = session.user.id
    let cancelled = false
    pinTulajdonosEllenorzes(uid)
      .then(async (allapot) => {
        if (cancelled || allapot !== 'idegen') return
        try {
          await clearPin()
        } catch (err) {
          console.error('[auth-gate] az idegen PIN törlése nem sikerült:', err)
        }
      })
      .catch(() => {
        /* a keyring-hiba külön kapun látszik */
      })
    return () => {
      cancelled = true
    }
  }, [session])

  // ── Tükör-tulajdonos ────────────────────────────────────────────────────
  useEffect(() => {
    const uid = aktivUid
    if (!uid || tukorOwnerOk === uid) return
    // Amíg az ellenőrzés fut, EGYETLEN push-er sem dolgozhat az új user
    // nevében (desk-sync-20) — a regiszter engedélye null.
    felfuggesztWriteSyncs()
    let cancelled = false
    void ensureLocalMirrorOwner(uid).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setTukorOwnerOk(uid)
        return
      }
      if (res.megerositesKell) {
        setTukorDontes({ uid, res })
        return
      }
      // A DB nem érhető el (böngésző dev-mód / IPC-hiba) — ilyenkor a tükör
      // OLVASÁSA sem működik, tehát nincs mit védeni; nem zárjuk ki a usert.
      console.error('[auth-gate] tükör-tulajdonos ellenőrzési hiba:', res.error)
      setTukorOwnerOk(uid)
    })
    return () => {
      cancelled = true
    }
  }, [aktivUid, tukorOwnerOk])

  const tukorTorlesMegerositese = useCallback(async () => {
    if (!tukorDontes) return
    setTukorDontesFut(true)
    try {
      const res = await ensureLocalMirrorOwner(tukorDontes.uid, { megerositve: true })
      if (res.ok) {
        setTukorDontes(null)
        setTukorOwnerOk(tukorDontes.uid)
      } else {
        console.error('[auth-gate] a megerősített tükör-törlés nem sikerült:', res.error)
        setTukorDontes({ uid: tukorDontes.uid, res })
      }
    } finally {
      setTukorDontesFut(false)
    }
  }, [tukorDontes])

  /** „Kilépés" a döntő-/zárólapokról: explicit kijelentkezés → varázsló. */
  const kilepes = useCallback(async () => {
    jelolExplicitKijelentkezes()
    setOfflineMode(false)
    clearRememberOffline()
    clearLastUser()
    try {
      await getDesktopSupabase().auth.signOut({ scope: 'local' })
    } catch {
      /* session nélkül (PIN-mód) a signOut hibázhat — a jelzők már törölve */
    }
    setOfflineActive(false)
    setTukorDontes(null)
    setStatusz(null)
    setSession(null)
  }, [])

  // ── 2FA: a SZERVER faktor-listájából ───────────────────────────────────
  useEffect(() => {
    if (!session) {
      // Nincs session → nincs mit ellenőrizni; a többi kapu dönt.
      setTimeout(() => setMfaSzukseges(null), 0)
      return
    }
    let cancelled = false
    const supabase = getDesktopSupabase()
    Promise.all([
      withSyncTimeout(supabase.auth.mfa.listFactors(), 'Kétlépcsős belépés ellenőrzése', MFA_TIMEOUT_MS),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
      .then(([faktorok, aal]) => {
        if (cancelled) return
        if (faktorok.error) throw faktorok.error
        const vanEllenorzottFaktor = (faktorok.data?.all ?? []).some((f) => f.status === 'verified')
        const aal2 = aal.data?.currentLevel === 'aal2'
        setMfaSzukseges(vanEllenorzottFaktor && !aal2)
      })
      .catch((err: unknown) => {
        // Fail-open ITT szándékos: az aal-kényszer valódi őre a szerver-oldali
        // RLS — a kapu hálózati hibája ne zárja ki a lelkészt a lokális adataiból.
        console.warn('[auth-gate] a faktor-lista nem olvasható (fail-open):', err)
        if (!cancelled) setMfaSzukseges(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  // ── Státusz-kapu (desk-firstrun-8): profiles_local.status ──────────────
  useEffect(() => {
    const uid = aktivUid
    if (!uid || tukorOwnerOk !== uid) return
    if (session && mfaSzukseges !== false) return
    if (statusz?.uid === uid && statuszUjra === 0) return
    let cancelled = false
    void (async () => {
      let profil: ProfileLocalRow | null = null
      try {
        profil = await getLocalOwnProfile(uid)
      } catch {
        profil = null
      }
      // Sessionnel mindig FRISS állapotot kérünk (a jóváhagyás a weben
      // történik — a cache napokig 'pending'-et mutathatna); offline a cache.
      if (session && (statuszUjra > 0 || !profil || profil.status !== 'active')) {
        try {
          await withSyncTimeout(pullOwnProfile(uid), 'Profil letöltése', PROFIL_PULL_TIMEOUT_MS)
          profil = await getLocalOwnProfile(uid)
        } catch (err) {
          console.warn('[auth-gate] a profil frissítése nem sikerült (a cache dönt):', err)
        }
      }
      if (cancelled) return
      // Nincs profil (sem cache, sem letöltés) → a shell látható hibalapja
      // dönt („Nem sikerült azonosítani a felhasználót") — itt nem zárunk.
      const aktiv =
        !profil || profil.status === 'active' || profil.status === null || profil.role === 'master_admin'
      setStatusz({ uid, allapot: aktiv ? 'ok' : 'blokkolt', profil })
      setStatuszUjra(0)
    })()
    return () => {
      cancelled = true
    }
  }, [aktivUid, session, tukorOwnerOk, mfaSzukseges, statusz, statuszUjra])

  // ── Push-erek: EGY regiszter, csak a kapuk UTÁN ────────────────────────
  useEffect(() => {
    const uid = aktivUid
    if (!uid || tukorOwnerOk !== uid) return
    if (statusz?.uid !== uid || statusz.allapot !== 'ok') return
    // A regiszter idempotens: a listener/poll egyszer jön létre, a user-id
    // frissül; a hívás azonnal egy „most" kört is indít (a visszalépést
    // ignorálva). Sessionnel a SIGNED_IN / INITIAL_SESSION után is ide
    // futunk (a session a függőség) — ezért nem kell külön hívás.
    void startAllWriteSyncs(uid)
  }, [aktivUid, session, tukorOwnerOk, statusz])

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()

    // 1) Első session-check + PIN-check párhuzamosan — MINDKETTŐ timeouttal,
    // hogy sem offline, sem egy nem válaszoló kulcstár ne blokkolja a kaput.
    const sessionPromise = supabase.auth
      .getSession()
      .then((res) => res.data.session)
      .catch((err) => {
        console.error('[auth-gate] getSession hiba:', err)
        return null
      })
    const sessionWithTimeout = Promise.race([
      sessionPromise,
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), GET_SESSION_TIMEOUT_MS)
      }),
    ])
    const pinWithTimeout: Promise<boolean | 'timeout'> = Promise.race([
      hasPin(),
      new Promise<'timeout'>((resolve) => {
        window.setTimeout(() => resolve('timeout'), HAS_PIN_TIMEOUT_MS)
      }),
    ])

    Promise.all([sessionWithTimeout, pinWithTimeout])
      .then(([initialSession, pinPresent]) => {
        if (!mounted) return
        setSession(initialSession)
        if (pinPresent === 'timeout') {
          setPinExists(false)
          setKulcstarHiba(
            'A gép kulcstára (Windows Credential Manager) nem válaszolt 3 másodpercen belül — nem tudjuk eldönteni, van-e mentett belépő kód.',
          )
        } else {
          setPinExists(pinPresent)
        }
        setLoading(false)
      })
      .catch((err) => {
        // hasPin() hiba (pl. keyring access) — LÁTHATÓ hiba, nem néma „nincs PIN"
        if (!mounted) return
        console.error('[auth-gate] init hiba:', err)
        setPinExists(false)
        setKulcstarHiba(
          `A gép kulcstára hibát adott: ${err instanceof Error ? err.message : String(err)}`,
        )
        setLoading(false)
      })

    // Ha a session a timeout UTÁN mégis megjön (lassú refresh), vegyük fel —
    // a kapu ilyenkor átáll online módra.
    void sessionPromise.then((lateSession) => {
      if (mounted && lateSession) setSession(lateSession)
    })

    // 2) Auth-state változás figyelése
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return
      setSession(newSession)

      // SIGNED_IN → visszajöttünk online-ba, offline-mode nem kell többé
      if (event === 'SIGNED_IN' && newSession) {
        setOfflineMode(false)
        setOfflineActive(false)
        // Az offline user-feloldás cache-e (2026-06-11) — a PIN-es belépés
        // ebből tudja, ki a gép felhasználója session nélkül is.
        saveLastUser({ id: newSession.user.id, email: newSession.user.email ?? null })
        // A push-ereket NEM innen indítjuk: a tükör-tulajdonos + státusz-kapu
        // utáni effekt hívja a regisztert (desk-sync-20 — versenyhelyzet a
        // wipe és a push között).
      }

      if (event === 'SIGNED_OUT') {
        if (explicitKijelentkezesVolt()) {
          // EXPLICIT kijelentkezés: offline-mode + remember + lastUser törlés
          // (user logout = a gépnek új felhasználója lehet).
          setOfflineMode(false)
          setOfflineActive(false)
          clearRememberOffline()
          clearLastUser()
        } else {
          // KÖNYVTÁRI SIGNED_OUT (lejárt refresh-token, desk-auth-5): csak a
          // session veszett el — a gép felhasználója ugyanaz, a PIN-mód a
          // kiút. Semmit nem törlünk; a kapu a jelzők szerint dönt.
          setOfflineActive(isOfflineMode())
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // ── Közös kapu-lapok (session- és offline-ágon azonos) ─────────────────
  function tukorDontoLap(uid: string) {
    if (!tukorDontes || tukorDontes.uid !== uid) return null
    const r = tukorDontes.res
    const f = r.fuggo
    return (
      <GateLap cim="Ezen a gépen más felhasználó fel nem küldött adatai vannak" tone="warning">
        <p className="mt-2 text-sm leading-relaxed">
          {r.elozoTulajdonosEmail ?? 'Az előző felhasználó'} fiókjához{' '}
          <strong>{f?.irasok ?? 0} még fel nem küldött tétel</strong> és{' '}
          <strong>{f?.foglaltSorszamok ?? 0} lefoglalt sorszám</strong> tartozik. Ha most a te
          adataidra cseréljük a gépet, ezek <strong>végleg elvesznek</strong> — a lefoglalt
          sorszámok a szerveren hézagként maradnak.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Biztonságos út: előbb ő lépjen be és szinkronizáljon, vagy a rendszergazda döntsön.
        </p>
        {r.error && tukorDontesFut === false && !r.megerositesKell && (
          <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{r.error}</p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" className={gombElsodleges} disabled={tukorDontesFut} onClick={() => void kilepes()}>
            Kilépés (nem törlök semmit)
          </button>
          <button
            type="button"
            className={gombVeszelyes}
            disabled={tukorDontesFut}
            onClick={() => void tukorTorlesMegerositese()}
          >
            {tukorDontesFut ? 'Törlés…' : 'Mégis törlöm, és a saját adataimmal dolgozom'}
          </button>
        </div>
      </GateLap>
    )
  }

  function statuszZaroLap(s: StatuszKapu) {
    const st = s.profil?.status ?? 'ismeretlen'
    return (
      <GateLap cim="A fiókod még jóváhagyásra vár" tone="warning">
        <p className="mt-2 text-sm leading-relaxed">
          A fiók állapota: <strong>{st}</strong>. Az asztali alkalmazás csak jóváhagyott
          (aktív) fiókkal használható — a jóváhagyást az egyházmegyei / rendszergazdai
          felület adja meg a weben. Amíg ez megtörténik, itt nem nyílik meg a gyülekezet
          adata.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={gombElsodleges}
            disabled={statuszUjra > 0}
            onClick={() => setStatuszUjra((n) => n + 1)}
          >
            {statuszUjra > 0 ? 'Ellenőrzés…' : 'Újraellenőrzés'}
          </button>
          <button type="button" className={gombMasodlagos} onClick={() => void kilepes()}>
            Kilépés
          </button>
        </div>
      </GateLap>
    )
  }

  // 1. kapu: friss Supabase session — de ha a fiókon 2FA van és a session
  // még aal1-es, előbb a kód-lépcső (2026-08-15, 8. pont B). Amíg az
  // ellenőrzés fut (null), címkés betöltőt mutatunk.
  if (session) {
    const uid = session.user.id
    if (mfaSzukseges === true) {
      return <Navigate to="/login" replace />
    }
    if (mfaSzukseges === null) {
      return <GateLoading cimke="Kétlépcsős belépés ellenőrzése…" />
    }
    const dontes = tukorDontoLap(uid)
    if (dontes) return dontes
    // P1-4: amíg a tükör-tulajdonos ellenőrzés nem zárult le erre a userre,
    // nem engedünk be — az új belépő ne olvashassa az előző user tükrét.
    if (tukorOwnerOk !== session.user.id) {
      return <GateLoading cimke="A helyi adatbázis tulajdonosának ellenőrzése…" />
    }
    if (statusz?.uid !== uid) {
      return <GateLoading cimke="A fiók állapotának ellenőrzése…" />
    }
    if (statusz.allapot === 'blokkolt') return statuszZaroLap(statusz)
    return <Outlet />
  }

  // 2. kapu: offline-mode flag aktív (PIN már verifikálódott ebben az
  // indításban, vagy él a "Emlékezz erre a gépre" flag). Ez a loading ELŐTT
  // jön: a mentett kódos belépésnek nem szabad a getSession()-re várnia —
  // ha közben mégis megjön a session, a state-frissítés átvált online módra.
  if (offlineActive) {
    // 2026-09-05: előbb a PIN-tulajdonos kapu (van PIN, és a gép felhasználójáé).
    if (offlinePinOk === null) {
      return <GateLoading cimke="A biztonsági kód ellenőrzése…" />
    }
    // P1-4: az offline (PIN) ág is kapuzott — ha az utolsó ismert user nem a
    // tükör tulajdonosa, az ellenőrzés (és szükség esetén a wipe) előbb fut le.
    // Ha nincs feloldható user-id (üres telepítés), a viselkedés változatlan.
    if (offlineUid) {
      const dontes = tukorDontoLap(offlineUid)
      if (dontes) return dontes
      if (tukorOwnerOk !== offlineUid) {
        return <GateLoading cimke="A helyi adatbázis tulajdonosának ellenőrzése…" />
      }
      if (statusz?.uid !== offlineUid) {
        return <GateLoading cimke="A fiók állapotának ellenőrzése (helyi adatokból)…" />
      }
      if (statusz.allapot === 'blokkolt') return statuszZaroLap(statusz)
    }
    return <Outlet />
  }

  if (loading) {
    return <GateLoading cimke="Munkamenet betöltése…" />
  }

  if (kulcstarHiba) {
    return (
      <GateLap cim="A gép kulcstára nem érhető el" tone="error">
        <p className="mt-2 text-sm leading-relaxed">{kulcstarHiba}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Biztonsági okból ilyenkor nem találgatunk. Próbáld újra — ha nem javul, lépj be online
          (a webes fiókkal összekapcsolva), és állíts be új kódot.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" className={gombMasodlagos} onClick={() => window.location.reload()}>
            Újrapróbálás
          </button>
          <button
            type="button"
            className={gombElsodleges}
            onClick={() => {
              window.location.hash = `${ELSO_INDITAS_UT}?lepes=belepes`
            }}
          >
            Online belépés
          </button>
        </div>
      </GateLap>
    )
  }

  // 3. kapu: nincs session, de van PIN → kérdezd meg offline-ban
  if (pinExists) {
    return <Navigate to="/pin-entry" replace />
  }

  // 4. kapu: nincs semmi → ELSŐ INDÍTÁS varázsló (2026-09-05). Új telepítés
  // vagy törölt PIN: a varázsló viszi végig a lelkészt a webes fiókkal való
  // összekapcsoláson (Google-lel is), a gyülekezet megerősítésén, a PIN-en
  // és az első szinkronon. A klasszikus e-mail+jelszó út a varázslóból nyílik.
  return <Navigate to={ELSO_INDITAS_UT} replace />
}
