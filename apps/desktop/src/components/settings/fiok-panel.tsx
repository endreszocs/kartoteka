/**
 * Fiók / Kapcsolat panel — a Beállítások ELSŐ füle (2026-09-05, desk-firstrun-16).
 *
 * MIÉRT: eddig a desktopon sehol nem látszott egy helyen, hogy KI van
 * bejelentkezve, MELYIK gyülekezethez, ÉL-E a felhő-munkamenet, és kié a
 * gépen tárolt biztonsági kód. A PIN utólagos beállítását a „Később" gomb egy
 * nem létező helyre ígérte. Ez a fül a kanonikus helye mindennek, ami a
 * fiók–gép kapcsolatról szól:
 *   · profil-kártya (név, e-mail, szerep, állapot — a lokális tükörből);
 *   · gyülekezet-kártya (+ „Újraellenőrzés" = friss pull a felhőből);
 *   · munkamenet-kártya (analyzeSession + „Online belépés" a varázslóba,
 *     „Kijelentkeztetés minden más eszközről" = signOut scope:'others');
 *   · PIN-kártya (pin-kartya.tsx — beállítás / módosítás / törlés);
 *   · 2FA-útjelző (az Adat & biztonság fülről ide költözött);
 *   · „Első indítás varázsló újrafuttatása".
 *
 * Bárhonnan nyitható: `window.dispatchEvent(new CustomEvent('kartoteka:open-settings',
 * { detail: { tab: 'fiok' } }))` (a shell figyeli).
 *
 * Adat-forrás: a lokális tükör (`profiles_local`, `congregations_local`) —
 * offline is olvasható; a felhő-frissítés kézi (Újraellenőrzés). A pull-ok
 * dinamikus importtal jönnek, hogy a beállítás-dialógus ne húzza be a teljes
 * szinkron-modult csak a megjelenítéshez.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  Church,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
  WandSparkles,
} from 'lucide-react'

import { Button } from '@kartoteka/ui'

import { getDesktopUser } from '../../lib/desktop-user'
import { ELSO_INDITAS_UT, torolVarazsloKesz } from '../../lib/elso-inditas'
import { errorMessage } from '../../lib/error'
import { analyzeSession, type SessionInfo } from '../../lib/session-state'
import { getDesktopSupabase } from '../../lib/supabase'
import type { CongregationLocalRow, ProfileLocalRow } from '../../lib/sync'
import { useDataVersion } from '../../lib/sync-orchestrator'
import { PinKartya } from './pin-kartya'

const SESSION_TIMEOUT_MS = 4000

/** A `profiles.role` emberi neve (a webes szerep-címkék tükre). */
const SZEREP_CIMKE: Record<string, string> = {
  lelkesz: 'Lelkipásztor',
  konyvelo: 'Könyvelő',
  szamvevo: 'Számvevő',
  esperes: 'Esperes',
  admin: 'Rendszergazda',
  master_admin: 'Főadminisztrátor',
  egyhazkeruleti_admin: 'Egyházkerületi adminisztrátor',
  user: 'Felhasználó',
}

const ALLAPOT_CIMKE: Record<string, string> = {
  active: 'Aktív',
  pending: 'Jóváhagyásra vár',
  inactive: 'Inaktív',
  suspended: 'Felfüggesztett',
  rejected: 'Elutasított',
}

export interface FiokPanelProps {
  /** A dialógus bezárása navigálás előtt (varázsló / online belépés). */
  onRequestClose?: () => void
}

/** A getSession időkorláttal — lejárt tokennél hálózati refresh indulhat, a panel ne függjön rajta. */
async function sessionIdokorlattal(): Promise<Session | null> {
  const supabase = getDesktopSupabase()
  const res = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), SESSION_TIMEOUT_MS)
    }),
  ])
  return res && 'data' in res ? res.data.session : null
}

export function FiokPanel({ onRequestClose }: FiokPanelProps) {
  const navigate = useNavigate()
  const dataVersion = useDataVersion()

  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userFeloldva, setUserFeloldva] = useState(false)
  const [profil, setProfil] = useState<ProfileLocalRow | null>(null)
  const [gyulekezet, setGyulekezet] = useState<CongregationLocalRow | null>(null)
  const [tukorHiba, setTukorHiba] = useState<string | null>(null)

  const [session, setSession] = useState<Session | null>(null)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)

  const [ujraFut, setUjraFut] = useState(false)
  const [ujraUzenet, setUjraUzenet] = useState<string | null>(null)
  const [ujraHiba, setUjraHiba] = useState<string | null>(null)

  const [masEszkozFut, setMasEszkozFut] = useState(false)
  const [masEszkozUzenet, setMasEszkozUzenet] = useState<string | null>(null)
  const [masEszkozHiba, setMasEszkozHiba] = useState<string | null>(null)

  const [varazsloFut, setVarazsloFut] = useState(false)
  const [varazsloHiba, setVarazsloHiba] = useState<string | null>(null)

  // 2FA-útjelző (az Adat & biztonság fülről költözött ide, 2026-09-05).
  // null = ellenőrzés fut; 'ismeretlen' = PIN-es (offline) munkamenet vagy
  // hiba — ilyenkor NEM állítunk hamis „nincs bekapcsolva"-t.
  const [ketlepcsos, setKetlepcsos] = useState<'aktiv' | 'inaktiv' | 'ismeretlen' | null>(null)

  // ── Felhasználó feloldása (offline is) ──
  useEffect(() => {
    let mounted = true
    getDesktopUser()
      .then((u) => {
        if (!mounted) return
        setUserId(u?.id ?? null)
        setUserEmail(u?.email ?? null)
        setUserFeloldva(true)
      })
      .catch(() => {
        if (mounted) setUserFeloldva(true)
      })
    return () => {
      mounted = false
    }
  }, [])

  // ── Lokális tükör: profil + gyülekezet (minden háttér-szinkron után újra) ──
  const tukorOlvasas = useCallback(async (uid: string) => {
    try {
      const sync = await import('../../lib/sync')
      const [p, g] = await Promise.all([sync.getLocalOwnProfile(uid), sync.getLocalOwnCongregation(uid)])
      // A setState-ek az await UTÁN (effektből is hívjuk — szinkron setState tilos).
      setProfil(p)
      setGyulekezet(g)
      setTukorHiba(null)
    } catch (err: unknown) {
      setTukorHiba(`A helyi profil nem olvasható: ${errorMessage(err)}`)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    void tukorOlvasas(userId)
  }, [userId, dataVersion, tukorOlvasas])

  // ── Munkamenet + 2FA ──
  const sessionOlvasas = useCallback(async () => {
    try {
      const s = await sessionIdokorlattal()
      setSession(s)
      setSessionInfo(analyzeSession(s))
      if (!s) {
        setKetlepcsos('ismeretlen')
        return
      }
      const { data: aal } = await getDesktopSupabase().auth.mfa.getAuthenticatorAssuranceLevel()
      setKetlepcsos(aal ? (aal.nextLevel === 'aal2' ? 'aktiv' : 'inaktiv') : 'ismeretlen')
    } catch {
      setSession(null)
      setSessionInfo(analyzeSession(null))
      setKetlepcsos('ismeretlen')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void sessionOlvasas()
    const { data: sub } = getDesktopSupabase().auth.onAuthStateChange((_event, s) => {
      if (!mounted) return
      setSession(s)
      setSessionInfo(analyzeSession(s))
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [sessionOlvasas])

  const sessionOnline = Boolean(session)

  // ── Műveletek ──
  async function ujraellenorzes() {
    if (!userId) return
    setUjraFut(true)
    setUjraUzenet(null)
    setUjraHiba(null)
    try {
      const sync = await import('../../lib/sync')
      const p = await sync.pullOwnProfile(userId)
      const g = await sync.pullOwnCongregation(userId)
      await tukorOlvasas(userId)
      setUjraUzenet(
        `Frissítve a felhőből: ${p.pulledRows} profil, ${g.pulledRows} gyülekezet-sor.` +
          (g.pulledRows === 0 ? ' A fiókhoz még nincs gyülekezet rendelve (vagy felsőbb szintű a fiók).' : ''),
      )
    } catch (err: unknown) {
      setUjraHiba(`Az újraellenőrzés nem sikerült: ${errorMessage(err)}`)
    } finally {
      setUjraFut(false)
    }
  }

  function onlineBelepes() {
    onRequestClose?.()
    navigate(`${ELSO_INDITAS_UT}?lepes=belepes`)
  }

  async function masEszkozokKijelentkeztetese() {
    setMasEszkozFut(true)
    setMasEszkozUzenet(null)
    setMasEszkozHiba(null)
    try {
      // scope:'others' = a többi eszköz/böngésző munkamenete szűnik meg, EZ a
      // gép bejelentkezve marad (a webes Profil → Biztonság párja).
      const { error } = await getDesktopSupabase().auth.signOut({ scope: 'others' })
      if (error) throw error
      setMasEszkozUzenet('A többi eszközről kijelentkeztettük a fiókodat. Ez a gép bejelentkezve maradt.')
    } catch (err: unknown) {
      setMasEszkozHiba(`Nem sikerült: ${errorMessage(err)}`)
    } finally {
      setMasEszkozFut(false)
    }
  }

  async function varazsloUjrafuttatas() {
    if (!userId) return
    setVarazsloFut(true)
    setVarazsloHiba(null)
    try {
      await torolVarazsloKesz(userId)
      onRequestClose?.()
      navigate(ELSO_INDITAS_UT)
    } catch (err: unknown) {
      setVarazsloHiba(`A varázsló nem indítható: ${errorMessage(err)}`)
      setVarazsloFut(false)
    }
  }

  const szerep = profil?.role ? (SZEREP_CIMKE[profil.role] ?? profil.role) : null
  const allapot = profil?.status ? (ALLAPOT_CIMKE[profil.status] ?? profil.status) : null
  const allapotTonus: Tonus = profil?.status === 'active' ? 'ok' : profil ? 'figyelem' : 'semleges'

  return (
    <div className="space-y-4">
      {/* ── Profil ── */}
      <Kartya
        icon={<UserRound className="size-4" />}
        cim="Bejelentkezett fiók"
        jelveny={allapot ? { szoveg: allapot, tonus: allapotTonus } : null}
      >
        {!userFeloldva ? (
          <p className="text-xs text-muted-foreground">A felhasználó feloldása…</p>
        ) : !userId ? (
          <p role="alert" className="text-xs text-destructive">
            Nem sikerült azonosítani a gép felhasználóját. Kapcsold újra össze a gépet a webes fiókoddal (Munkamenet
            kártya → Online belépés).
          </p>
        ) : (
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Név</dt>
            <dd className="break-words text-foreground">{profil?.full_name || '—'}</dd>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">E-mail</dt>
            <dd className="break-all text-foreground">{profil?.email || userEmail || '—'}</dd>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Szerep</dt>
            <dd className="text-foreground">{szerep || '—'}</dd>
          </dl>
        )}
        {tukorHiba && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {tukorHiba}
          </p>
        )}
        {profil && profil.status !== 'active' && (
          <p className="mt-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
            A fiók nem aktív — a felhő-adatok szinkronja addig nem működik, amíg a rendszergazda jóvá nem hagyja.
            Az Újraellenőrzés gombbal kérhető friss állapot.
          </p>
        )}
      </Kartya>

      {/* ── Gyülekezet ── */}
      <Kartya
        icon={<Church className="size-4" />}
        cim="Gyülekezet"
        jelveny={gyulekezet ? { szoveg: 'Hozzárendelve', tonus: 'ok' } : profil ? { szoveg: 'Nincs hozzárendelve', tonus: 'figyelem' } : null}
        muvelet={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!userId || ujraFut || !sessionOnline}
            onClick={() => void ujraellenorzes()}
          >
            {ujraFut ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Újraellenőrzés
          </Button>
        }
      >
        {gyulekezet ? (
          <div className="flex items-center gap-3">
            {gyulekezet.cimer_url ? (
              <img
                src={gyulekezet.cimer_url}
                alt=""
                className="size-12 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Church className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="break-words font-semibold text-foreground">{gyulekezet.nev_hu || gyulekezet.name}</p>
              {gyulekezet.egyhazmegye && <p className="text-xs text-muted-foreground">{gyulekezet.egyhazmegye}</p>}
              {gyulekezet.varos && <p className="text-xs text-muted-foreground">{gyulekezet.varos}</p>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {profil
              ? 'Ehhez a fiókhoz még nincs gyülekezet rendelve — a hozzárendelést a webes felületen a rendszergazda végzi. Felsőbb szintű (egyházmegyei / kerületi) fiókkal ez rendben van.'
              : 'A gyülekezet a profil betöltése után jelenik meg.'}
          </p>
        )}
        {!sessionOnline && userId && (
          <p className="mt-2 text-[11px] text-muted-foreground">Az újraellenőrzéshez élő felhő-belépés kell.</p>
        )}
        {ujraUzenet && (
          <p role="status" className="mt-2 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            {ujraUzenet}
          </p>
        )}
        {ujraHiba && (
          <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {ujraHiba}
          </p>
        )}
      </Kartya>

      {/* ── Munkamenet ── */}
      <Kartya
        icon={<Link2 className="size-4" />}
        cim="Felhő-munkamenet"
        jelveny={
          sessionInfo
            ? {
                szoveg: sessionInfo.kind === 'online' ? 'Online' : sessionInfo.kind === 'offline-pin' ? 'Helyi munkamenet' : 'Kijelentkezve',
                tonus: sessionInfo.tone === 'emerald' ? 'ok' : sessionInfo.tone === 'orange' ? 'figyelem' : 'semleges',
              }
            : null
        }
        muvelet={
          !sessionOnline ? (
            <Button type="button" className="min-h-11" onClick={onlineBelepes}>
              <Link2 className="mr-2 size-4" /> Online belépés
            </Button>
          ) : undefined
        }
      >
        <p className="text-xs text-muted-foreground">
          {sessionInfo
            ? sessionInfo.kind === 'online'
              ? 'A gép össze van kapcsolva a webes fiókoddal; a szinkron a háttérben fut, a felhő-belépés magától megújul.'
              : sessionInfo.label
            : 'A munkamenet ellenőrzése…'}
        </p>
        {sessionOnline && (
          <div className="mt-3 space-y-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              disabled={masEszkozFut}
              onClick={() => void masEszkozokKijelentkeztetese()}
            >
              {masEszkozFut ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogOut className="mr-2 size-4" />}
              Kijelentkeztetés minden más eszközről
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Ha elveszett vagy eladott egy eszközt: a többi bejelentkezést megszünteti, ez a gép bejelentkezve marad.
              Az asztali gépek listája a weben: <strong>kartoteka.app → Profil → Biztonság</strong>.
            </p>
            {masEszkozUzenet && (
              <p role="status" className="rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                {masEszkozUzenet}
              </p>
            )}
            {masEszkozHiba && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {masEszkozHiba}
              </p>
            )}
          </div>
        )}
      </Kartya>

      {/* ── PIN ── */}
      <PinKartya userId={userId} sessionOnline={sessionOnline} />

      {/* ── 2FA útjelző — a kezelés webes (8. pont, PR #158) ── */}
      <Kartya
        icon={<ShieldCheck className="size-4" />}
        cim="Kétlépcsős belépés (2FA)"
        jelveny={
          ketlepcsos === null
            ? { szoveg: 'Ellenőrzés…', tonus: 'semleges' }
            : ketlepcsos === 'aktiv'
              ? { szoveg: 'Aktív a fiókodon', tonus: 'ok' }
              : ketlepcsos === 'inaktiv'
                ? { szoveg: 'Nincs bekapcsolva', tonus: 'figyelem' }
                : { szoveg: 'Csak online ellenőrizhető', tonus: 'semleges' }
        }
      >
        <p className="text-xs text-muted-foreground">
          {ketlepcsos === 'aktiv'
            ? 'Online belépéskor az asztali alkalmazás is kéri a hitelesítő alkalmazás 6 jegyű kódját — a fiókod ezzel erősebben védett.'
            : ketlepcsos === 'inaktiv'
              ? 'A fiókod jelenleg csak jelszóval (vagy Google-fiókkal) védett. A kétlépcsős belépés bekapcsolása erősen ajánlott — pár perc a webes felületen.'
              : ketlepcsos === 'ismeretlen'
                ? 'Helyi (PIN-es) munkamenetben az állapot nem olvasható ki — online belépés után frissül.'
                : 'Az állapot ellenőrzése folyamatban.'}
        </p>
        <p className="mt-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-foreground">
          A be- és kikapcsolás, a QR-kód és a mentőkódok kezelése a webes felületen történik:{' '}
          <strong>kartoteka.app → Profil → Biztonság</strong>.
        </p>
      </Kartya>

      {/* ── Varázsló újrafuttatása ── */}
      <Kartya
        icon={<WandSparkles className="size-4" />}
        cim="Első indítás varázsló"
        muvelet={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!userId || varazsloFut}
            onClick={() => void varazsloUjrafuttatas()}
          >
            {varazsloFut ? <Loader2 className="mr-2 size-4 animate-spin" /> : <WandSparkles className="mr-2 size-4" />}
            Újrafuttatás
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground">
          Végigvezet az összekapcsoláson, a gyülekezet megerősítésén, a biztonsági kódon és az első szinkronon. A helyi
          adatok nem törlődnek; a lépések a meglévő fiókkal futnak újra.
        </p>
        {varazsloHiba && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {varazsloHiba}
          </p>
        )}
      </Kartya>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Kartya — közös kártya-elrendezés (token-alapú, sötét módban is helyes)
// ──────────────────────────────────────────────────────────────

type Tonus = 'ok' | 'figyelem' | 'semleges'

const JELVENY_OSZTALY: Record<Tonus, string> = {
  ok: 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100',
  figyelem: 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100',
  semleges: 'border-border bg-secondary/40 text-foreground',
}

function Kartya({
  icon,
  cim,
  jelveny,
  muvelet,
  children,
}: {
  icon: ReactNode
  cim: string
  jelveny?: { szoveg: string; tonus: Tonus } | null
  muvelet?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-[1.2rem] border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
            {icon}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">{cim}</h4>
            {jelveny && (
              <p className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${JELVENY_OSZTALY[jelveny.tonus]}`}>
                {jelveny.szoveg}
              </p>
            )}
          </div>
        </div>
        {muvelet && <div className="shrink-0">{muvelet}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}
