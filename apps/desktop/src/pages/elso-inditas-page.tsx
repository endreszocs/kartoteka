import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Church,
  KeyRound,
  Loader2,
  LogIn,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { Button, Card, CardContent } from '@kartoteka/ui'

import { PinUrlap } from '../components/settings/pin-kartya'
import { clearPin, pinTulajdonosEllenorzes, setOfflineMode } from '../lib/auth-pin'
import {
  inditKapcsolast,
  nyitJovahagyoOldalt,
  varjJovahagyasra,
  type KapcsolasKeres,
} from '../lib/desktop-kapcsolas'
import { getDeviceInfo, ensureDeviceRegistered } from '../lib/device'
import { clearLastUser, saveLastUser } from '../lib/desktop-user'
import { jelolVarazsloFolyamatban, jelolVarazsloKesz } from '../lib/elso-inditas'
import { errorMessage } from '../lib/error'
import { getDbStatus } from '../lib/local-db'
import { ensureLocalMirrorOwner } from '../lib/local-mirror-owner'
import { pullNevnapCatalog } from '../lib/nevnap-sync'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLocalOwnCongregation,
  getLocalOwnProfile,
  pullAdrlocalityCatalog,
  pullAnnualReportsOfOwnCongregation,
  pullCemeteriesOfOwnCongregation,
  pullFamiliesOfOwnCongregation,
  pullFilingOfOwnCongregation,
  pullGyerekOfOwnCongregation,
  pullInventoryOfOwnCongregation,
  pullMembersOfOwnCongregation,
  pullMinutesOfOwnCongregation,
  pullOwnCongregation,
  pullOwnProfile,
  pullProgramsOfOwnCongregation,
  pullRegistryOfOwnCongregation,
  pullWorklogOfOwnCongregation,
  type CongregationLocalRow,
  type ProfileLocalRow,
} from '../lib/sync'

/**
 * ELSŐ INDÍTÁS varázsló (2026-09-05, Endre 1. pontja).
 *
 * Mikor jön ide a lelkész: új telepítéskor (nincs munkamenet és nincs PIN), az
 * elfelejtett PIN után („Elfelejtettem a kódot" → újra-összekapcsolás), vagy a
 * bejelentkező oldal „Összekapcsolás a webes fiókkal" gombjáról.
 *
 * A LÉPÉSEK (mind kötelező, sorrendben):
 *  1. Üdvözlés + a helyi adattár ellenőrzése (DB-init hiba itt LÁTSZIK,
 *     nem néma üres tükör).
 *  2. Belépés — ELSŐDLEGES ÚT: összekapcsolás a webes fiókkal (device-flow:
 *     a gép kódot kap, a böngészőben a lelkész bejelentkezik — Google-lel is —
 *     és jóváhagy; a gép a titkos kóddal lekéri a belépőt). MÁSODLAGOS ÚT:
 *     e-mail + jelszó (a klasszikus /login, ami ide tér vissza).
 *  3. Gyülekezet megerősítése — a profil és a gyülekezet a FELHŐBŐL; a fiók
 *     állapota kapu (jóváhagyásra váró fiók nem építhet tükröt).
 *  4. PIN beállítása — kötelező; ez nyitja később offline is a gépet.
 *  5. Első szinkron — modulonként látható haladással; hiba nem néma.
 *  6. Kész.
 *
 * A varázsló az AuthGate-en KÍVÜL él (nyilvános route), ezért a tükör-
 * tulajdonos ellenőrzését (ensureLocalMirrorOwner) maga futtatja a belépés után.
 */

const LEPESEK = [
  { key: 'udvozles', short: 'Kezdés', title: 'Üdvözlünk a Kartotékában', icon: Sparkles },
  { key: 'belepes', short: 'Belépés', title: 'Összekapcsolás a fiókoddal', icon: LogIn },
  { key: 'gyulekezet', short: 'Gyülekezet', title: 'Gyülekezet megerősítése', icon: Church },
  { key: 'pin', short: 'PIN', title: 'Biztonsági kód a géphez', icon: KeyRound },
  { key: 'szinkron', short: 'Szinkron', title: 'Első szinkronizálás', icon: RefreshCw },
  { key: 'kesz', short: 'Kész', title: 'Minden készen áll', icon: ShieldCheck },
] as const


const MODULOK: Array<{ key: string; cimke: string; fut: (uid: string) => Promise<unknown> }> = [
  { key: 'profil', cimke: 'Profil', fut: (uid) => pullOwnProfile(uid) },
  { key: 'gyulekezet', cimke: 'Gyülekezet adatai', fut: (uid) => pullOwnCongregation(uid) },
  { key: 'tagok', cimke: 'Tagnyilvántartás', fut: (uid) => pullMembersOfOwnCongregation(uid) },
  { key: 'csaladok', cimke: 'Családok', fut: (uid) => pullFamiliesOfOwnCongregation(uid) },
  { key: 'gyerekek', cimke: 'Gyermekek', fut: (uid) => pullGyerekOfOwnCongregation(uid) },
  { key: 'munkanaplo', cimke: 'Munkanapló', fut: (uid) => pullWorklogOfOwnCongregation(uid) },
  { key: 'programok', cimke: 'Programok', fut: (uid) => pullProgramsOfOwnCongregation(uid) },
  { key: 'anyakonyv', cimke: 'Anyakönyv', fut: (uid) => pullRegistryOfOwnCongregation(uid) },
  { key: 'leltar', cimke: 'Leltár', fut: (uid) => pullInventoryOfOwnCongregation(uid) },
  { key: 'iktato', cimke: 'Iktató', fut: (uid) => pullFilingOfOwnCongregation(uid) },
  { key: 'jegyzokonyvek', cimke: 'Jegyzőkönyvek', fut: (uid) => pullMinutesOfOwnCongregation(uid) },
  { key: 'sirhelyek', cimke: 'Sírhelyek', fut: (uid) => pullCemeteriesOfOwnCongregation(uid) },
  { key: 'jelentesek', cimke: 'Éves jelentések', fut: (uid) => pullAnnualReportsOfOwnCongregation(uid) },
  { key: 'helysegek', cimke: 'Helységnév-katalógus', fut: () => pullAdrlocalityCatalog() },
  { key: 'nevnapok', cimke: 'Névnap-katalógus', fut: () => pullNevnapCatalog() },
]

type ModulAllapot = 'var' | 'fut' | 'kesz' | 'hiba'

interface SessionUser {
  id: string
  email: string | null
}

export function ElsoInditasPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [lepes, setLepes] = useState<number>(0)
  const [kesz, setKesz] = useState<boolean[]>(() => LEPESEK.map(() => false))

  // 1. lépés — helyi adattár
  const [dbAllapot, setDbAllapot] = useState<{ opened: boolean; init_error: string | null } | null>(null)

  // 2. lépés — belépés
  const [user, setUser] = useState<SessionUser | null>(null)
  const [keres, setKeres] = useState<KapcsolasKeres | null>(null)
  const [hatraMp, setHatraMp] = useState<number | null>(null)
  const [belepesHiba, setBelepesHiba] = useState<string | null>(null)
  const [belepesFut, setBelepesFut] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 3. lépés — gyülekezet
  const [profil, setProfil] = useState<ProfileLocalRow | null>(null)
  const [gyulekezet, setGyulekezet] = useState<CongregationLocalRow | null>(null)
  const [gyulHiba, setGyulHiba] = useState<string | null>(null)
  const [gyulFut, setGyulFut] = useState(false)
  // 2026-09-05 (desk-sync): a tükör-tulajdonos váltása SZINKRONIZÁLATLAN
  // sorokat semmisítene meg → a döntés a lelkészé, nem néma wipe.
  const [tukorDontes, setTukorDontes] = useState<{ fuggo: number; hibas: number; sorszamok: number; elozoEmail: string | null } | null>(null)

  // 4. lépés — PIN (az űrlap a közös `PinUrlap`; itt csak az idegen-kód
  // takarítás eredménye / hibája él)
  const [pinMegjegyzes, setPinMegjegyzes] = useState<string | null>(null)
  const [pinElozetesHiba, setPinElozetesHiba] = useState<string | null>(null)

  // 5. lépés — szinkron
  const [modulok, setModulok] = useState<Record<string, { allapot: ModulAllapot; uzenet?: string }>>({})
  const [szinkronFut, setSzinkronFut] = useState(false)
  const szinkronInditva = useRef(false)

  const okPin = params.get('ok') === 'pin'

  const ugras = useCallback((i: number) => {
    setLepes(i)
    window.scrollTo({ top: 0 })
  }, [])

  const jelolKesz = useCallback((i: number) => {
    setKesz((prev) => {
      const n = [...prev]
      n[i] = true
      return n
    })
  }, [])

  /**
   * IDEGEN PIN takarítása a belépés után (2026-09-05, desk-auth-2 / P1).
   *
   * Ha a gépen MÁSIK fiók kódja van (közös gép, előző lelkész), vagy egy
   * tulajdonos nélküli, frissítés előtti kód, azt a friss online belépés
   * törli — a remember-jelzővel együtt —, és a 4. lépésben a belépő a
   * sajátját állítja be. Mindkét belépési útról hívjuk (device-flow ÉS a
   * jelszavas /login visszatérés), mert a varázsló a mount-effektben is
   * továbbugorhat a gyülekezet-lépésre.
   */
  const idegenPinRendezes = useCallback(async (uid: string) => {
    setPinElozetesHiba(null)
    try {
      const allapot = await pinTulajdonosEllenorzes(uid)
      if (allapot === 'idegen') {
        await clearPin()
        setPinMegjegyzes(
          'Ezen a gépen korábban másik fiók kódja volt beállítva — töröltük. Most a sajátodat adod meg.',
        )
      } else if (allapot === 'sajat') {
        setPinMegjegyzes('A gépen már a te kódod van beállítva — itt felülírhatod egy újjal.')
      } else {
        setPinMegjegyzes(null)
      }
    } catch (err: unknown) {
      // A kulcstár nem válaszol — nem néma: a PIN-lépésen kiírjuk.
      setPinElozetesHiba(`A gépen tárolt kód nem ellenőrizhető (a kulcstár nem válaszol): ${errorMessage(err)}`)
    }
  }, [])

  // ── Induló állapot: DB-ellenőrzés + van-e már munkamenet (visszatérés a /login-ról) ──
  useEffect(() => {
    let cancelled = false
    jelolVarazsloFolyamatban(true)
    void (async () => {
      try {
        const st = await Promise.race([
          getDbStatus(),
          new Promise<{ opened: boolean; init_error: string | null }>((resolve) =>
            window.setTimeout(() => resolve({ opened: false, init_error: 'A helyi adattár nem válaszolt 5 másodpercen belül.' }), 5000),
          ),
        ])
        if (!cancelled) setDbAllapot(st)
      } catch (err: unknown) {
        if (!cancelled) setDbAllapot({ opened: false, init_error: errorMessage(err) })
      }
      try {
        const supabase = getDesktopSupabase()
        if (okPin) {
          // „Elfelejtettem a kódot" ág (brief D1): egy esetleg még élő helyi
          // munkamenetet ELDOBUNK, mielőtt kapcsolnánk — különben a gomb a
          // PIN-kaput kerülné meg (a törölt kód helyett a régi session vinne be).
          // scope:'local' = csak ez a gép; a többi eszköz munkamenete marad.
          try {
            await supabase.auth.signOut({ scope: 'local' })
          } catch {
            /* nincs mit eldobni — megyünk tovább a belépésre */
          }
        }
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) => window.setTimeout(() => resolve({ data: { session: null } }), 4000)),
        ])
        if (cancelled) return
        const s = data.session
        if (s) {
          setUser({ id: s.user.id, email: s.user.email ?? null })
          saveLastUser({ id: s.user.id, email: s.user.email ?? null })
          jelolKesz(0)
          jelolKesz(1)
          // Visszatértünk a jelszavas belépésről (vagy már volt munkamenet):
          // a következő lépés a gyülekezet. Az idegen PIN itt is rendeződik.
          void idegenPinRendezes(s.user.id)
          setLepes(2)
        } else if (params.get('lepes') === 'belepes') {
          jelolKesz(0)
          setLepes(1)
        }
      } catch {
        /* nincs munkamenet — a varázsló az elejéről indul */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 2. lépés: device-flow ─────────────────────────────────────────────────
  async function inditWebesKapcsolast() {
    setBelepesHiba(null)
    setBelepesFut(true)
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      let eszkozNev: string | undefined
      try {
        const info = await getDeviceInfo()
        eszkozNev = `Kartotéka asztali alkalmazás (${info.platform})`
      } catch {
        /* a Rust-oldal nem válaszol — az alap eszköznév megy */
      }
      const k = await inditKapcsolast(eszkozNev)
      setKeres(k)
      await nyitJovahagyoOldalt(k)
      const eredmeny = await varjJovahagyasra(k, { signal: ac.signal, onTick: setHatraMp })
      if (ac.signal.aborted) return
      if (!eredmeny.ok) {
        if (eredmeny.ok_tipus !== 'megszakitva') setBelepesHiba(eredmeny.uzenet)
        setKeres(null)
        return
      }
      await belepesUtan()
    } catch (err: unknown) {
      if (!ac.signal.aborted) setBelepesHiba(errorMessage(err))
      setKeres(null)
    } finally {
      if (abortRef.current === ac) setBelepesFut(false)
    }
  }

  function megszakit() {
    abortRef.current?.abort()
    abortRef.current = null
    setKeres(null)
    setBelepesFut(false)
    setHatraMp(null)
  }

  /** Közös folytatás a belépés után (device-flow VAGY jelszavas visszatérés). */
  async function belepesUtan() {
    const supabase = getDesktopSupabase()
    const { data } = await supabase.auth.getSession()
    const s = data.session
    if (!s) {
      setBelepesHiba('A belépés nem hozott létre munkamenetet — próbáld újra.')
      return
    }
    setOfflineMode(false)
    saveLastUser({ id: s.user.id, email: s.user.email ?? null })
    setUser({ id: s.user.id, email: s.user.email ?? null })

    // Kétlépcsős belépés: ha a fiókon van ellenőrzött faktor, a kód-lépcső a
    // /login oldalon van (az AuthGate ugyanoda küldene). Utána ide tér vissza.
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        navigate('/login', { replace: true })
        return
      }
    } catch {
      /* fail-open itt: a valódi őr a szerver-oldali RLS */
    }

    // Idegen (másik fiókhoz kötött) PIN törlése — a belépő a sajátját adja meg.
    await idegenPinRendezes(s.user.id)

    jelolKesz(1)
    setKeres(null)
    ugras(2)
  }

  // ── 3. lépés: profil + gyülekezet a felhőből ──────────────────────────────
  const gyulekezetBetoltes = useCallback(async (uid: string, megerositve = false) => {
    setGyulFut(true)
    setGyulHiba(null)
    setTukorDontes(null)
    try {
      const owner = await ensureLocalMirrorOwner(uid, { megerositve })
      if (!owner.ok && owner.megerositesKell) {
        // Az ELŐZŐ felhasználó szinkronizálatlan írásai / lefoglalt sorszámai
        // vannak a gépen — a pull ELŐTT a lelkész dönt (különben az új profil
        // a régi tükörbe kerülne, vagy a régi adat néma törlődne).
        setTukorDontes({
          fuggo: owner.fuggo?.irasok ?? owner.fuggo?.osszes ?? 0,
          hibas: owner.fuggo?.hibas ?? 0,
          sorszamok: owner.fuggo?.foglaltSorszamok ?? 0,
          elozoEmail: owner.elozoTulajdonosEmail ?? null,
        })
        setGyulFut(false)
        return
      }
      if (!owner.ok) {
        // A DB nem érhető el — az 1. lépés már jelezte; itt nem blokkolunk.
        console.error('[elso-inditas] tükör-tulajdonos:', owner.error)
      }
      await pullOwnProfile(uid)
      await pullOwnCongregation(uid)
      const p = await getLocalOwnProfile(uid)
      const g = await getLocalOwnCongregation(uid)
      setProfil(p)
      setGyulekezet(g)
      if (!p) setGyulHiba('A profilod nem tölthető le a felhőből. Ellenőrizd az internet-kapcsolatot, és próbáld újra.')
    } catch (err: unknown) {
      setGyulHiba(`A profil betöltése nem sikerült: ${errorMessage(err)}`)
    } finally {
      setGyulFut(false)
    }
  }, [])

  // A betöltés a 3. lépésre érve indul — de NEM a döntő-lap alatt (bíráló P1):
  // a `tukorDontes` beállítása után a `gyulFut` true→false vált, és a
  // `tukorDontes` nélküli feltétel ÚJRA indította a betöltést → az törölte a
  // döntést → megint megerősítést kért → végtelen hurok (a SQLite-IPC 14
  // COUNT-tal pörgött, a lap villogott). A `!tukorDontes` a feltétel ÉS a
  // függőségek része. A hívás mikrotaszkból megy (a `gyulekezetBetoltes` első
  // sora szinkron setState — effektben tilos, CI-lint).
  useEffect(() => {
    if (lepes !== 2 || !user || profil || gyulFut || gyulHiba || tukorDontes) return
    const uid = user.id
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void gyulekezetBetoltes(uid)
    })
    return () => {
      cancelled = true
    }
  }, [lepes, user, profil, gyulFut, gyulHiba, tukorDontes, gyulekezetBetoltes])

  const profilAktiv = profil?.status === 'active'
  const vanGyulekezet = Boolean(profil?.congregation_id)

  /**
   * „Másik fiók" / „Mégse — másik fiók": CSAK ennek a gépnek a munkamenetét
   * dobjuk el. `scope: 'local'` (bíráló P2): a paraméter nélküli `signOut`
   * alapértelmezése `'global'` = a fiók MINDEN refresh-tokenjét visszavonja —
   * a lelkész telefonja, a weben nyitott jóváhagyó oldal is kiesett volna,
   * pedig ő csak itt akart másik fiókot választani.
   */
  async function kilep() {
    megszakit()
    try {
      await getDesktopSupabase().auth.signOut({ scope: 'local' })
    } catch {
      /* nincs mit eldobni — a helyi állapotot így is takarítjuk */
    }
    // A gép utolsó ismert felhasználója innentől nem ez a fiók (a következő
    // belépő a belepesUtan-ban úgyis felülírja); a lépés-állapotok tiszta lapra.
    clearLastUser()
    setUser(null)
    setProfil(null)
    setGyulekezet(null)
    setGyulHiba(null)
    setTukorDontes(null)
    setPinMegjegyzes(null)
    setPinElozetesHiba(null)
    setModulok({})
    szinkronInditva.current = false
    setKesz(LEPESEK.map(() => false))
    ugras(1)
  }

  // ── 4. lépés: PIN — a közös `PinUrlap` végzi (setPin a user-id-val + a
  // reset-jelző törlése); itt csak a továbblépés a dolgunk. ─────────────────
  function pinMentve() {
    jelolKesz(3)
    ugras(4)
  }

  // ── 5. lépés: első szinkron modulonként ───────────────────────────────────
  const szinkronFuttatas = useCallback(async (uid: string) => {
    setSzinkronFut(true)
    const kezdo: Record<string, { allapot: ModulAllapot; uzenet?: string }> = {}
    for (const m of MODULOK) kezdo[m.key] = { allapot: 'var' }
    setModulok(kezdo)
    let hibaVolt = false
    for (const m of MODULOK) {
      setModulok((prev) => ({ ...prev, [m.key]: { allapot: 'fut' } }))
      try {
        await m.fut(uid)
        setModulok((prev) => ({ ...prev, [m.key]: { allapot: 'kesz' } }))
      } catch (err: unknown) {
        hibaVolt = true
        setModulok((prev) => ({ ...prev, [m.key]: { allapot: 'hiba', uzenet: errorMessage(err) } }))
      }
    }
    setSzinkronFut(false)
    if (!hibaVolt) {
      jelolKesz(4)
    }
  }, [jelolKesz])

  // Az első szinkron a lépésre érve EGYSZER indul (ref-őr). A hívás
  // mikrotaszkból (a `szinkronFuttatas` szinkron setState-tel indul — effektben
  // tilos); az egyszer-jelző a mikrotaszkban áll be, hogy a StrictMode dupla
  // effekt-futásának ELVETETT első példánya ne égesse el.
  useEffect(() => {
    if (lepes !== 4 || !user || szinkronInditva.current) return
    const uid = user.id
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled || szinkronInditva.current) return
      szinkronInditva.current = true
      void szinkronFuttatas(uid)
    })
    return () => {
      cancelled = true
    }
  }, [lepes, user, szinkronFuttatas])

  const szinkronKeszDb = Object.values(modulok).filter((m) => m.allapot === 'kesz').length
  const szinkronHibaDb = Object.values(modulok).filter((m) => m.allapot === 'hiba').length

  // ── 6. lépés: kész ────────────────────────────────────────────────────────
  async function befejezes() {
    if (!user) return
    await jelolVarazsloKesz(user.id)
    jelolVarazsloFolyamatban(false)
    // Eszköz-regisztráció best-effort — hiba nem blokkol, a /dev oldalon látszik.
    try {
      await ensureDeviceRegistered(user.id)
    } catch {
      /* csendes */
    }
    navigate('/', { replace: true })
  }

  // ── Renderelés ────────────────────────────────────────────────────────────
  const aktualis = LEPESEK[lepes]
  const AktIkon = aktualis.icon

  return (
    <main className="flex min-h-screen items-start justify-center bg-background p-4 sm:items-center">
      <Card className="w-full max-w-2xl">
        <CardContent className="space-y-6 p-6 sm:p-8">
          {/* Fejléc + lépés-pöttyök (az Excel-varázsló formanyelve) */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <AktIkon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Első indítás · {lepes + 1}/{LEPESEK.length}
                </p>
                <h1 className="text-xl font-semibold text-foreground">{aktualis.title}</h1>
              </div>
            </div>
            <div className="flex items-start">
              {LEPESEK.map((s, i) => (
                <Fragment key={s.key}>
                  {i > 0 && <div className={`mt-3.5 h-0.5 min-w-2 flex-1 rounded ${kesz[i - 1] ? 'bg-primary/40' : 'bg-border'}`} />}
                  <div className="flex w-14 flex-col items-center gap-1">
                    <span
                      className={`flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                        kesz[i]
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : i === lepes
                            ? 'border-primary bg-card text-primary ring-2 ring-primary/25'
                            : 'border-border bg-card text-muted-foreground'
                      }`}
                    >
                      {kesz[i] ? <Check className="size-4" /> : i + 1}
                    </span>
                    <span className={`text-center text-[10px] leading-tight ${i === lepes ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                      {s.short}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>

          {/* ── 1. Üdvözlés ── */}
          {aktualis.key === 'udvozles' && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-foreground">
                Ez az asztali Kartotéka: a gyülekezeted adatai a saját gépeden is elérhetők, internet nélkül
                is. Néhány lépésben összekapcsoljuk a gépet a webes fiókoddal, megerősítjük a gyülekezetet,
                beállítunk egy biztonsági kódot, és letöltjük az adatokat. Kb. 2 perc.
              </p>
              {dbAllapot === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> A helyi adattár ellenőrzése…</p>
              ) : dbAllapot.opened ? (
                <p className="flex items-center gap-2 text-sm text-emerald-700"><Check className="size-4" /> A helyi, titkosított adattár rendben van.</p>
              ) : (
                <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> A helyi adattár nem nyitható meg.</p>
                  <p className="break-words">{dbAllapot.init_error || 'Ismeretlen hiba.'}</p>
                  <p className="text-xs">Próbáld újraindítani az alkalmazást. Ha a hiba marad, jelezd a rendszergazdának — a hibaüzenet fent szó szerint szerepel.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setDbAllapot(null); void getDbStatus().then(setDbAllapot).catch((e: unknown) => setDbAllapot({ opened: false, init_error: errorMessage(e) })) }}>
                    <RefreshCw className="mr-2 size-4" /> Újrapróbálás
                  </Button>
                </div>
              )}
              <div className="flex justify-end">
                <Button type="button" disabled={!dbAllapot?.opened} onClick={() => { jelolKesz(0); ugras(1) }}>
                  Kezdjük
                </Button>
              </div>
            </div>
          )}

          {/* ── 2. Belépés ── */}
          {aktualis.key === 'belepes' && (
            <div className="space-y-4">
              {okPin && (
                <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground">
                  A biztonsági kódot töröltük. Kapcsold újra össze a gépet a webes fiókoddal, utána új kódot adhatsz meg.
                </div>
              )}
              {!keres ? (
                <>
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-start gap-3">
                      <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">Összekapcsolás a webes fiókkal</p>
                        <p className="text-sm text-muted-foreground">
                          Megnyílik a böngésződben a kartoteka.app. Ott jelentkezz be (Google-fiókkal vagy e-mail címmel),
                          hasonlítsd össze a 6 jegyű ellenőrző kódot az itt megjelenővel, és hagyd jóvá. Jelszót itt nem kell beírnod.
                        </p>
                      </div>
                    </div>
                    <Button type="button" className="mt-3 w-full" disabled={belepesFut} onClick={() => void inditWebesKapcsolast()}>
                      {belepesFut ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogIn className="mr-2 size-4" />}
                      Összekapcsolás a böngészőben
                    </Button>
                  </div>
                  <div className="text-center text-xs text-muted-foreground">vagy</div>
                  <Button type="button" variant="outline" className="w-full" disabled={belepesFut} onClick={() => navigate('/login')}>
                    Belépés e-mail címmel és jelszóval
                  </Button>
                </>
              ) : (
                <div className="space-y-4 rounded-2xl border border-border bg-secondary/40 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ellenőrző kód</p>
                  <p className="font-heading text-4xl tracking-[0.2em] text-foreground sm:text-5xl">{keres.ellenorzo}</p>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    A böngészőben ugyanezt a számot kell látnod. Ha egyezik, kattints ott a jóváhagyásra — ez az ablak
                    magától továbblép.
                    {hatraMp !== null && (
                      <> A kérés még {Math.floor(hatraMp / 60)}:{String(hatraMp % 60).padStart(2, '0')} percig érvényes.</>
                    )}
                  </p>
                  <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Várakozás a jóváhagyásra…</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button type="button" variant="outline" onClick={() => void nyitJovahagyoOldalt(keres)}>Böngésző újranyitása</Button>
                    <Button type="button" variant="ghost" onClick={megszakit}>Mégse</Button>
                  </div>
                </div>
              )}
              {belepesHiba && (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {belepesHiba}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Nincs még fiókod? A webes felületen a <strong>/hozzaferes-kerese</strong> űrlapon kérhetsz belépést; a
                hozzáférést a rendszergazda hagyja jóvá.
              </p>
            </div>
          )}

          {/* ── 3. Gyülekezet ── */}
          {aktualis.key === 'gyulekezet' && (
            <div className="space-y-4">
              {tukorDontes ? (
                <div className="space-y-3 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-semibold">Ezen a gépen egy MÁSIK felhasználó{tukorDontes.elozoEmail ? ` (${tukorDontes.elozoEmail})` : ''} még fel nem töltött adatai vannak.</p>
                  <p>
                    Szinkronizálatlan rögzítés: <strong>{tukorDontes.fuggo}</strong>
                    {tukorDontes.hibas > 0 ? <> (ebből hibás/ütközött: <strong>{tukorDontes.hibas}</strong>)</> : null}
                    {tukorDontes.sorszamok > 0 ? <>, lefoglalt sorszám: <strong>{tukorDontes.sorszamok}</strong></> : null}.
                    Ha folytatod, ezek VÉGLEG elvesznek. Biztonságosabb: az előző felhasználó lépjen be, és
                    futtassa le a szinkront (Beállítások → Adat &amp; biztonság → Szinkronizálás most).
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="outline" onClick={() => void kilep()}>Mégse — másik fiók</Button>
                    <Button type="button" variant="destructive" onClick={() => { if (user) void gyulekezetBetoltes(user.id, true) }}>
                      Az előző adatok eldobása és folytatás
                    </Button>
                  </div>
                </div>
              ) : gyulFut ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> A profil és a gyülekezet letöltése a felhőből…</p>
              ) : gyulHiba ? (
                <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <p>{gyulHiba}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setGyulHiba(null); if (user) void gyulekezetBetoltes(user.id) }}>
                    <RefreshCw className="mr-2 size-4" /> Újrapróbálás
                  </Button>
                </div>
              ) : profil ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Bejelentkezve</p>
                      <p className="break-words font-semibold text-foreground">{profil.full_name || user?.email || 'Lelkipásztor'}</p>
                      <p className="break-all text-sm text-muted-foreground">{profil.email || user?.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Állapot: {profilAktiv ? 'aktív' : profil.status === 'pending' ? 'jóváhagyásra vár' : profil.status || 'ismeretlen'}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Gyülekezet</p>
                      {gyulekezet ? (
                        <>
                          <p className="break-words font-semibold text-foreground">{gyulekezet.nev_hu || gyulekezet.name}</p>
                          {gyulekezet.egyhazmegye && <p className="text-sm text-muted-foreground">{gyulekezet.egyhazmegye}</p>}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Ehhez a fiókhoz még nincs gyülekezet rendelve.</p>
                      )}
                    </div>
                  </div>

                  {!profilAktiv && (
                    <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <p className="font-semibold">A fiókod még nem aktív.</p>
                      <p>A rendszergazda jóváhagyása után folytatható az első indítás. Ha már jóváhagyták, kattints az Újraellenőrzésre.</p>
                    </div>
                  )}
                  {profilAktiv && !vanGyulekezet && (
                    <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <p className="font-semibold">Nincs hozzárendelt gyülekezet.</p>
                      <p>
                        A gyülekezetet a webes felületen a rendszergazda rendeli a fiókodhoz. Amíg ez nem történik meg, az asztali
                        alkalmazás üres nyilvántartást mutat. Felsőbb szintű (egyházmegyei / kerületi) fiókkal ez rendben van.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => { setProfil(null); setGyulekezet(null); if (user) void gyulekezetBetoltes(user.id) }}>
                        <RefreshCw className="mr-2 size-4" /> Újraellenőrzés
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => void kilep()}>Másik fiók</Button>
                    </div>
                    <Button type="button" disabled={!profilAktiv} onClick={() => { jelolKesz(2); ugras(3) }}>
                      Ez a gyülekezetem — tovább
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nincs bejelentkezett felhasználó.</p>
              )}
            </div>
          )}

          {/* ── 4. PIN — a közös űrlap (pin-kartya.tsx), a kód a userhez kötve ── */}
          {aktualis.key === 'pin' && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ezzel a kóddal lépsz be a gépen ezután — internet nélkül is. A kód CSAK ezen a gépen él, a fiókodhoz
                kötve; a rendszer nem tárolja. Ha elfelejted, a webes fiókoddal újra összekapcsolod a gépet, és új
                kódot adsz meg; adat nem vész el.
              </p>
              {pinMegjegyzes && (
                <div role="status" className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground">
                  {pinMegjegyzes}
                </div>
              )}
              {pinElozetesHiba && (
                <div role="alert" className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                  {pinElozetesHiba} — a mentés ettől még megpróbálható.
                </div>
              )}
              {user ? (
                <PinUrlap
                  userId={user.id}
                  mod="beallitas"
                  mentesFelirat="Kód mentése és tovább"
                  magyarazatNelkul
                  onMentve={pinMentve}
                />
              ) : (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Nincs bejelentkezett felhasználó — lépj vissza a Belépés lépésre.
                </div>
              )}
            </div>
          )}

          {/* ── 5. Első szinkron ── */}
          {aktualis.key === 'szinkron' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Letöltjük a gyülekezet adatait a gépre. Ezután minden mentés azonnal a felhőbe kerül, ha van internet; ha nincs,
                a következő csatlakozáskor magától felmegy.
              </p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {MODULOK.map((m) => {
                  const st = modulok[m.key]?.allapot ?? 'var'
                  return (
                    <li key={m.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        {st === 'kesz' ? <Check className="size-4 text-emerald-600" /> : st === 'fut' ? <Loader2 className="size-4 animate-spin text-primary" /> : st === 'hiba' ? <AlertTriangle className="size-4 text-destructive" /> : <span className="size-2 rounded-full bg-border" />}
                      </span>
                      <span className="flex-1 text-foreground">{m.cimke}</span>
                      {st === 'hiba' && <span className="max-w-[50%] truncate text-xs text-destructive" title={modulok[m.key]?.uzenet}>{modulok[m.key]?.uzenet}</span>}
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                {szinkronFut ? `Folyamatban… ${szinkronKeszDb}/${MODULOK.length}` : szinkronHibaDb > 0 ? `${szinkronHibaDb} modul nem töltődött le — újrapróbálhatod, vagy továbbmehetsz (a háttér-szinkron később pótolja).` : `Kész: ${szinkronKeszDb}/${MODULOK.length}`}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="outline" disabled={szinkronFut} onClick={() => { if (user) void szinkronFuttatas(user.id) }}>
                  <RefreshCw className="mr-2 size-4" /> Újra
                </Button>
                <Button type="button" disabled={szinkronFut} onClick={() => { jelolKesz(4); ugras(5) }}>
                  Tovább
                </Button>
              </div>
            </div>
          )}

          {/* ── 6. Kész ── */}
          {aktualis.key === 'kesz' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                <p className="font-semibold">A gép összekapcsolva a fiókoddal.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Belépés ezután a biztonsági kóddal — internet nélkül is.</li>
                  <li>Minden mentés azonnal szinkronizál, ha van kapcsolat; offline rögzítés a következő csatlakozáskor megy fel.</li>
                  <li>Elfelejtett kód: „Elfelejtettem a kódot" → a weben, bejelentkezve jóváhagyod az újra-összekapcsolást.</li>
                </ul>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => void befejezes()}>
                  <ShieldCheck className="mr-2 size-4" /> Kezdés
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

