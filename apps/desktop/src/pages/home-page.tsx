/**
 * HomePage (Irányítópult) — a desktop-kliens főoldala.
 *
 * 2026-04-25 (Sprint A3 + B + J): a webes /dashboard paritás-rés zárása.
 * 2026-06-12 (Endre #5 — dashboard-paritás): a születésnaposok-kártya és a
 * programok-widget web-AZONOS változatra cserélve:
 *   - Celebrations: a webes „Ma köszöntjük" kártya közösített változata
 *     (mai születésnap + mai névnapos tagok + következő 14 nap + szűrős/
 *     nyomtatós Lista-dialógus) — adatok web-azonos logikával számolva
 *   - UpcomingPrograms: a webes program-widget agenda-kártyáinak tükre
 *     (kt-* design, típus-ikon/szín, ismétlődés-kibontás, read-only)
 *   - Névnapok: új `nevnap_local` tükör (nevnap-sync.ts) — hero-chip is kapja
 *
 * Közös `@kartoteka/ui-app` dashboard-komponensek:
 *   - HeroBannerScripture (üdvözlő gradient + napi ige + névnap chip)
 *   - KpiCards (3 KPI desktopon)
 *   - UpcomingPrograms (web-azonos agenda — szerkesztés a weben)
 *   - Celebrations (web-azonos „Ma köszöntjük")
 *   - AgeDistribution (korelosztás)
 *   - RecentActivity (10 friss munkanapló-bejegyzés)
 *
 * Adat-források (lokális SQLCipher cache):
 *   - Aktív tagok / demográfia / születésnapok: szemely_local (mínusz elkoltozott_local)
 *   - Névnapok: nevnap_local (országos katalógus — Sprint #5 tükör)
 *   - Munkanapló: munkanaplo_local
 *   - Programok: gyulekezeti_programok_local (auto-sync percenként)
 *   - Daily verse: best-effort fetch a webes app `/api/daily-verse` endpointjáról
 */

import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getVersion } from '@tauri-apps/api/app'
import { Church, ClipboardList, Link2, RefreshCw, Users, Wallet, Wifi, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Card, CardContent } from '@kartoteka/ui'
import {
  AgeDistribution,
  Celebrations,
  HeroBannerScripture,
  KpiCards,
  RecentActivity,
  UpcomingPrograms,
  expandUpcomingProgramOccurrences,
  type AgeBucketEntry,
  type CelebrationsMember,
  type DailyVerseData,
  type RecentActivityEntry,
  type UpcomingProgramEntry,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { isOfflineMode, offlineBelepesEngedett } from '../lib/auth-pin'
import { calculateAgeDistribution } from '../lib/dashboard-helpers'
import { getDesktopUser } from '../lib/desktop-user'
import { ELSO_INDITAS_UT } from '../lib/elso-inditas'
import { errorMessage } from '../lib/error'
import { getOutboxStats, type OutboxStats } from '../lib/local-db'
import { getLocalTodayNamedayNames } from '../lib/nevnap-sync'
import { printHtmlViaIframe } from '../lib/print-html'
import { analyzeSession, type SessionInfo } from '../lib/session-state'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLastPullIso,
  getLastPullMembersIso,
  getLastPullWorklogIso,
  getLocalCsaladokCount,
  getLocalElkoltozottek,
  getLocalMembersOfOwnCongregation,
  getLocalOwnCongregation,
  getLocalOwnProfile,
  getLocalPrograms,
  getLocalWorklogOfOwnCongregation,
  getOutboxSyncStatus,
  type MemberLocalRow,
} from '../lib/sync'
import { useDataVersion } from '../lib/sync-orchestrator'

const HU_DAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat']
const HU_MONTHS = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]

function formatHuDateFull(d: Date): string {
  return `${d.getFullYear()}. ${HU_MONTHS[d.getMonth()]} ${d.getDate()}. — ${HU_DAYS[d.getDay()]}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 10) return 'Jó reggelt'
  if (h < 17) return 'Jó napot'
  if (h < 21) return 'Jó estét'
  return 'Szép estét'
}

/** A webes `lib/utils/date.ts` ageFromDate tükre. */
function ageFromDate(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  const b = new Date(dateStr)
  if (isNaN(b.getTime())) return null
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

/** Tag neve web-azonos sorrendben (a desktop-cache-ben nincs namepattern). */
function memberDisplayName(m: MemberLocalRow): string {
  return [m.csaladnev, m.k_nev].filter(Boolean).join(' ').trim() || '(névtelen)'
}

const FALLBACK_VERSE: DailyVerseData = {
  verse: 'Bízzál az Úrban teljes szíveddel, és ne a magad eszére támaszkodj!',
  reference: 'Példabeszédek 3:5',
}

const VERSE_API_URL = 'https://kartoteka.app/api/daily-verse'

export function HomePage() {
  const navigate = useNavigate()
  const dataVersion = useDataVersion()
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [congregationName, setCongregationName] = useState<string | null>(null)
  const [congregationLogo, setCongregationLogo] = useState<string | null>(null)
  const [familyCount, setFamilyCount] = useState<number>(0)
  const [activeMembers, setActiveMembers] = useState<MemberLocalRow[]>([])
  const [namedayNames, setNamedayNames] = useState<string[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentActivityEntry[]>([])
  const [upcomingPrograms, setUpcomingPrograms] = useState<UpcomingProgramEntry[]>([])
  const [dailyVerse, setDailyVerse] = useState<DailyVerseData | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getDesktopUser().then((resolvedUser) => {
      if (mounted) setUser(resolvedUser)
    })
    // Verzió-felirat az info-dobozhoz (korábban kézzel frissített, elavult string volt)
    getVersion()
      .then((v) => {
        if (mounted) setAppVersion(v)
      })
      .catch(() => {
        // csendes — böngészős dev-módban nincs Tauri API
      })
    return () => {
      mounted = false
    }
  }, [])

  // Fő adat-fetch — TISZTÁN LOKÁLIS, azonnal töltődik mountkor és minden
  // sikeres háttér-sync után (a `dataVersion` változására). Online-szinkron
  // a háttérben fut (Sprint M auto-sync orchestrator), nem blokkolja az UI-t.
  useEffect(() => {
    if (!user) return
    let mounted = true

    const today = new Date()
    const curYear = today.getFullYear()
    // 14 napos program-ablak — évhatárnál a következő év elejét is kérjük
    const windowEnd = new Date(today.getTime() + 14 * 86400000)
    const needNextYear = windowEnd.getFullYear() !== curYear

    void Promise.all([
      getLocalOwnProfile(user.id).catch(() => null),
      getLocalOwnCongregation(user.id).catch(() => null),
      getLocalCsaladokCount(user.id).catch(() => 0),
      getLocalMembersOfOwnCongregation(user.id).catch(() => []),
      getLocalWorklogOfOwnCongregation(user.id, { limit: 10 }).catch(() => []),
      getLocalPrograms(user.id, curYear).catch(() => []),
      needNextYear ? getLocalPrograms(user.id, curYear + 1).catch(() => []) : Promise.resolve([]),
      getLocalElkoltozottek(user.id, 100000).catch(() => []),
      getLocalTodayNamedayNames().catch(() => []),
    ]).then(([profile, congregation, families, members, worklog, programsThisYear, programsNextYear, elkoltozottek, namedays]) => {
      if (!mounted) return
      setFullName(profile?.full_name ?? null)
      setCongregationName(congregation?.nev_hu ?? congregation?.name ?? null)
      setCongregationLogo(congregation?.cimer_url ?? null)
      setFamilyCount(families)

      // Web-paritás: az „aktív tag" = élő ÉS nem elköltözött (a webes
      // dashboard az `elkoltozott` táblával szűri ki a már elköltözötteket).
      const movedIds = new Set(
        elkoltozottek
          .map((e) => e.id_szemely)
          .filter((id): id is number => id !== null),
      )
      const active = members.filter((m) => !m.meghalt && !movedIds.has(m.id))
      setActiveMembers(active)
      setNamedayNames(namedays)

      setRecentActivity(
        worklog.map((w) => ({
          id: w.id,
          idopont: w.idopont,
          jellege: w.jellege,
          cim: w.cim,
          jelenlet: w.jelenlet_osszesen ?? null,
        })),
      )

      // Programok: a teljes év(ek) sorai → ismétlődés-kibontás + 14 napos ablak
      // (web-paritás: a heti/kétheti/havi alkalmak korábban nem jelentek meg)
      const programEntries: UpcomingProgramEntry[] = [...programsThisYear, ...programsNextYear].map((p) => ({
        id: p.id,
        cim: p.cim,
        datum: p.datum,
        datum_vege: p.datum_vege,
        ido_kezdes: p.ido_kezdes,
        ido_befejezes: p.ido_befejezes,
        helyszin: p.helyszin,
        tipus: p.tipus,
        prioritas: p.prioritas,
        ismetlodes_tipus: p.ismetlodes_tipus,
        egyedi_tipus_nev: p.egyedi_tipus_nev,
        egyedi_emoji: p.egyedi_emoji,
        teljesitett: p.teljesitett === 1,
      }))
      setUpcomingPrograms(expandUpcomingProgramOccurrences(programEntries, 14))
    })

    return () => {
      mounted = false
    }
  }, [user, dataVersion])

  // Daily verse — best-effort online fetch; offline fallback.
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    fetch(VERSE_API_URL, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { verse: string; reference: string }) => {
        if (mounted) setDailyVerse({ verse: d.verse, reference: d.reference })
      })
      .catch(() => {
        if (mounted) setDailyVerse(FALLBACK_VERSE)
      })
      .finally(() => clearTimeout(timeoutId))

    return () => {
      mounted = false
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [])

  // ── Születésnap / névnap adatok (a webes dashboard/page.tsx logika tükre) ──
  const celebrationsData = useMemo(() => {
    const today = new Date()
    const curYear = today.getFullYear()
    const mmDd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // Mai születésnaposok
    const todayBirthdays = activeMembers
      .filter((m) => m.sz_datum && m.sz_datum.slice(5, 10) === mmDd)
      .map((m) => ({
        name: memberDisplayName(m),
        age: ageFromDate(m.sz_datum),
      }))

    // Mai névnapos tagok (keresztnév-egyezés a katalógus neveivel)
    const todayNamedayMembers = namedayNames.length > 0
      ? activeMembers
          .filter((m) => m.k_nev && namedayNames.includes(m.k_nev))
          .map((m) => memberDisplayName(m))
      : []

    // Következő 14 nap születésnapjai (web-azonos diffDays-logika)
    const todayMs = new Date(curYear, today.getMonth(), today.getDate()).getTime()
    const upcomingBirthdays = activeMembers
      .filter((m) => m.sz_datum)
      .map((m) => {
        const b = new Date(m.sz_datum!)
        if (isNaN(b.getTime())) return null
        let nextBday = new Date(curYear, b.getMonth(), b.getDate())
        if (nextBday.getTime() <= todayMs) nextBday = new Date(curYear + 1, b.getMonth(), b.getDate())
        const diffDays = Math.round((nextBday.getTime() - todayMs) / 86400000)
        if (diffDays <= 0 || diffDays > 14) return null
        return {
          name: memberDisplayName(m),
          age: nextBday.getFullYear() - b.getFullYear(),
          diffDays,
          month: nextBday.getMonth(),
          day: nextBday.getDate(),
        }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.diffDays - b.diffDays)

    // A szűrő/nyomtató dialógus tag-listája (a cache-ben nincs utca/helység-join,
    // a c_szcim szabad-szöveges cím + házszám a lakhely-fallback)
    const allMembers: CelebrationsMember[] = activeMembers.map((m) => ({
      id: String(m.id),
      csaladnev: m.csaladnev,
      k_nev: m.k_nev,
      // A desktop-cache nem szinkronizálja a namepattern-t (id./ifj. előtag) —
      // az özv./elv. viszont az allapot-ból itt is kijön (PR-19).
      namepattern: null,
      allapot: m.allapot ?? null,
      sz_datum: m.sz_datum,
      ferfi: m.ferfi === 1,
      c_szam: m.c_szam,
      c_szcim: m.c_szcim,
    }))

    return { todayBirthdays, todayNamedayMembers, upcomingBirthdays, allMembers }
  }, [activeMembers, namedayNames])

  const ageBuckets: AgeBucketEntry[] = useMemo(
    () => calculateAgeDistribution(activeMembers),
    [activeMembers],
  )

  const firstName = fullName?.split(' ').pop() ?? null
  const greeting = useMemo(() => getGreeting(), [])
  const greetingText = `${greeting}${firstName ? `, ${firstName}!` : '!'}`
  const dateText = useMemo(() => formatHuDateFull(new Date()), [])

  return (
    <DesktopShell>
      <div className="space-y-6">
        {/* Üdvözlő banner — a névnap-chip a nevnap_local tükörből él */}
        <HeroBannerScripture
          greetingText={greetingText}
          dateText={dateText}
          congregationName={congregationName}
          todayNamedays={namedayNames.map((name) => ({ name }))}
          dailyVerse={dailyVerse}
        />

        {/* 3 KPI kártya — desktop módban, a webes-only "Gyülekezeti weboldal"
            és „Prezentáció" kártyák elrejtve (Sprint P, v0.5.4). */}
        <KpiCards
          activeMemberCount={activeMembers.length}
          familyCount={familyCount}
          monthlyIncome={0}
          monthlyExpense={0}
          yearlyIncome={0}
          yearlyExpense={0}
          hideWebOnlyCards
        />

        {/* 3 oszlop a hero alatt: Ma köszöntjük + Gyülekezeti programok + Korelosztás
            (Sprint O — Endre kérése a 3 widget egy sorba szépen dobozolva).
            2026-06-12: a sorrend a webes dashboardot tükrözi
            (Celebrations | Programok | Korelosztás). */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Celebrations
            todayBirthdays={celebrationsData.todayBirthdays}
            todayNamedayMembers={celebrationsData.todayNamedayMembers}
            todayNamedayNames={namedayNames}
            upcomingBirthdays={celebrationsData.upcomingBirthdays}
            allMembers={celebrationsData.allMembers}
            congregationName={congregationName ?? 'Gyülekezet'}
            congregationLogo={congregationLogo}
            onPrintHtml={(html) => void printHtmlViaIframe(html)}
          />
          <UpcomingPrograms entries={upcomingPrograms} daysAhead={14} />
          <AgeDistribution buckets={ageBuckets} />
        </div>

        {/* Friss munkanapló — saját sorban, teljes szélességen */}
        <RecentActivity
          entries={recentActivity}
          onShowAllClick={() => navigate('/munkanaplo')}
          onEntryClick={() => navigate('/munkanaplo')}
        />

        {/* Gyors hozzáférés */}
        <Card className="card-raised border-0">
          <CardContent className="p-6">
            <h2 className="font-heading text-xl text-slate-800">Gyors hozzáférés</h2>
            <p className="mt-1 text-xs text-slate-500">
              A leghasználtabb moduljaid egy kattintásra. A teljes modul-lista a bal oldali menüben
              elérhető.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickLink
                icon={<Users className="size-5" />}
                label="Tagnyilvántartás"
                description="A gyülekezet tagjai, családok, keresés"
                gradient="from-emerald-400 to-teal-500"
                onClick={() => navigate('/tagnyilvantartas')}
              />
              <QuickLink
                icon={<ClipboardList className="size-5" />}
                label="Munkanapló"
                description="Istentiszteletek, látogatások, alkalmak"
                gradient="from-sky-400 to-cyan-500"
                onClick={() => navigate('/munkanaplo')}
              />
              <QuickLink
                icon={<Wallet className="size-5" />}
                label="Pénzügy"
                description="Bevétel, kiadás, chitanță, banki import"
                gradient="from-amber-400 to-orange-500"
                onClick={() => navigate('/penzugy')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Kapcsolat állapota — a korábbi „Fejlesztői állapot" doboz helyett
            (2026-09-05, desk-firstrun-18): a lelkész főoldalán a fiók–gép
            kapcsolat lényege látszik, a /dev link a Beállítások → Adat &
            biztonság aljára költözött. */}
        <KapcsolatAllapotaKartya
          userId={user?.id ?? null}
          congregationName={congregationName}
          appVersion={appVersion}
          dataVersion={dataVersion}
          onOnlineBelepes={() => navigate(`${ELSO_INDITAS_UT}?lepes=belepes`)}
        />
      </div>
    </DesktopShell>
  )
}

// ──────────────────────────────────────────────────────────────
// Kapcsolat állapota kártya
// ──────────────────────────────────────────────────────────────

interface KapcsolatAllapotaProps {
  userId: string | null
  congregationName: string | null
  appVersion: string | null
  /** Minden sikeres háttér-szinkron után változik → újraolvassuk az időbélyegeket. */
  dataVersion: number
  onOnlineBelepes: () => void
}

const SESSION_TIMEOUT_MS = 4000

/** A Beállítások → Fiók / Kapcsolat fül megnyitása (a shell figyeli az eseményt). */
function nyitFiokBeallitasokat(): void {
  window.dispatchEvent(new CustomEvent('kartoteka:open-settings', { detail: { tab: 'fiok' } }))
}

function formatIsoIdopont(iso: string | null): string {
  if (!iso) return 'még sosem'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'ismeretlen'
  return d.toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Online/offline + utolsó szinkron + gyülekezet + függő tételek — a MEGLÉVŐ
 * forrásokból (analyzeSession, settings-tábla last_pull kulcsai, outbox-
 * statisztika, outbox-futás állapota). Nem indít szinkront és nem hoz létre
 * második orchestrator-példányt (az a fejléc állapotsávjában él).
 */
function KapcsolatAllapotaKartya({ userId, congregationName, appVersion, dataVersion, onOnlineBelepes }: KapcsolatAllapotaProps) {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [halozat, setHalozat] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [utolsoSzinkron, setUtolsoSzinkron] = useState<string | null>(null)
  const [outbox, setOutbox] = useState<OutboxStats | null>(null)
  const [outboxFut, setOutboxFut] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  // A helyi (PIN-es) munkamenet érvényessége: a remember-jelző PIN nélkül
  // érvénytelen — az offlineBelepesEngedett önjavítóan törli, itt csak jelezzük.
  const [helyiErvenytelen, setHelyiErvenytelen] = useState(false)

  // Hálózat-figyelés (a navigator.onLine csak a fizikai kapcsolat; a felhő-
  // belépést a sessionInfo mondja meg).
  useEffect(() => {
    const be = () => setHalozat(true)
    const ki = () => setHalozat(false)
    window.addEventListener('online', be)
    window.addEventListener('offline', ki)
    return () => {
      window.removeEventListener('online', be)
      window.removeEventListener('offline', ki)
    }
  }, [])

  // Munkamenet (időkorláttal) + a helyi munkamenet PIN-hez kötése
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    void (async () => {
      try {
        const res = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), SESSION_TIMEOUT_MS)
          }),
        ])
        const s = res && 'data' in res ? res.data.session : null
        if (!mounted) return
        setSessionInfo(analyzeSession(s))
        if (!s && isOfflineMode()) {
          const rendben = await offlineBelepesEngedett()
          if (mounted) setHelyiErvenytelen(!rendben)
        }
      } catch {
        if (mounted) setSessionInfo(analyzeSession(null))
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return
      setSessionInfo(analyzeSession(s))
      if (s) setHelyiErvenytelen(false)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Utolsó szinkron + függő tételek — minden dataVersion-változásra újra
  useEffect(() => {
    if (!userId) return
    let mounted = true
    void (async () => {
      try {
        const [profil, tagok, naplo, stats] = await Promise.all([
          getLastPullIso(),
          getLastPullMembersIso(userId),
          getLastPullWorklogIso(userId),
          getOutboxStats(),
        ])
        if (!mounted) return
        // A legfrissebb a három közül (a light-bundle percenként húzza mindhármat).
        const idok = [profil, tagok, naplo].filter((x): x is string => Boolean(x)).sort()
        setUtolsoSzinkron(idok.length > 0 ? idok[idok.length - 1] : null)
        setOutbox(stats)
        setOutboxFut(getOutboxSyncStatus().running)
        setHiba(null)
      } catch (err: unknown) {
        if (mounted) setHiba(`Az állapot nem olvasható: ${errorMessage(err)}`)
      }
    })()
    return () => {
      mounted = false
    }
  }, [userId, dataVersion])

  const online = sessionInfo?.kind === 'online'
  const fuggo = outbox ? outbox.pending + outbox.failed : null
  const allapotCim = sessionInfo === null
    ? 'Ellenőrzés…'
    : online
      ? 'Online — összekapcsolva a fiókoddal'
      : sessionInfo.kind === 'offline-pin'
        ? halozat
          ? 'Helyi munkamenet — a felhő-belépés lejárt'
          : 'Offline — nincs internet'
        : 'Kijelentkezve'
  const allapotOsztaly = online
    ? 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-100'
    : 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100'

  return (
    <Card className="card-raised border-0">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border ${allapotOsztaly}`}>
              {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-xl text-foreground">Kapcsolat állapota</h2>
              <p className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${allapotOsztaly}`}>
                {allapotCim}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {sessionInfo && !online && halozat && (
              <Button type="button" className="min-h-11" onClick={onOnlineBelepes}>
                <Link2 className="mr-2 size-4" /> Online belépés
              </Button>
            )}
            <Button type="button" variant="outline" className="min-h-11" onClick={nyitFiokBeallitasokat}>
              Fiók / Kapcsolat
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-[0.8rem] border border-border bg-secondary/40 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <RefreshCw className={`size-3.5 ${outboxFut ? 'animate-spin' : ''}`} /> Utolsó szinkron
            </dt>
            <dd className="mt-0.5 text-foreground">{formatIsoIdopont(utolsoSzinkron)}</dd>
          </div>
          <div className="rounded-[0.8rem] border border-border bg-secondary/40 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Church className="size-3.5" /> Gyülekezet
            </dt>
            <dd className="mt-0.5 truncate text-foreground" title={congregationName ?? undefined}>
              {congregationName ?? 'nincs hozzárendelve'}
            </dd>
          </div>
          <div className="rounded-[0.8rem] border border-border bg-secondary/40 px-3 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Függő tételek</dt>
            <dd className={`mt-0.5 ${outbox && outbox.failed > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {fuggo === null
                ? '…'
                : fuggo === 0
                  ? 'nincs — minden fent van'
                  : `${outbox!.pending} vár feltöltésre${outbox!.failed > 0 ? `, ${outbox!.failed} hibás` : ''}`}
            </dd>
          </div>
        </dl>

        {helyiErvenytelen && (
          <p role="alert" className="mt-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
            A helyi munkamenet biztonsági kód nélkül fut (a kód időközben törlődött) — a következő indításkor
            újra össze kell kapcsolnod a gépet a fiókoddal. Az „Emlékezz erre a gépre" jelzést töröltük.
          </p>
        )}
        {hiba && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {hiba}
          </p>
        )}
        {outbox && outbox.failed > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            A hibás tételek részletei és újraküldése: Beállítások → Adat &amp; biztonság → Fejlesztői eszközök.
          </p>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          Kartotéka asztali alkalmazás {appVersion ? `v${appVersion}` : '(fejlesztői változat)'} · az adatok
          percenként szinkronizálódnak a háttérben, ha van felhő-kapcsolat; offline rögzítés a következő
          csatlakozáskor megy fel.
        </p>
      </CardContent>
    </Card>
  )
}

interface QuickLinkProps {
  icon: React.ReactNode
  label: string
  description: string
  gradient: string
  onClick: () => void
}

function QuickLink({ icon, label, description, gradient, onClick }: QuickLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-[1rem] border border-border bg-white p-3 text-left transition hover:border-primary/30 hover:bg-muted/30 hover:-translate-y-0.5"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-gradient-to-br ${gradient} text-white transition group-hover:scale-105`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{description}</div>
      </div>
    </button>
  )
}
