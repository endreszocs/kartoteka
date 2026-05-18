/**
 * HomePage (Irányítópult) — a desktop-kliens főoldala.
 *
 * 2026-04-25 (Sprint A3 + B + J): a webes /dashboard paritás-rés zárása.
 * Közös `@kartoteka/ui-app` dashboard-komponensek:
 *   - HeroBannerScripture (üdvözlő gradient + napi ige + névnap chip)
 *   - KpiCards (5 KPI)
 *   - BottomStats (7 demográfiai stat — élesen kalkulálva)
 *   - UpcomingPrograms (közelgő alkalmak — Sprint J)
 *   - Celebrations (mai + 14 napos születésnapok)
 *   - RecentActivity (10 friss munkanapló-bejegyzés)
 *
 * Adat-források (lokális SQLCipher cache):
 *   - Aktív tagok / családok / demográfia / születésnapok: szemely_local + csalad_local
 *   - Munkanapló: munkanaplo_local
 *   - Programok: gyulekezeti_programok_local (Sprint J — auto-pull mount-kor)
 *   - Daily verse: best-effort fetch a webes app `/api/daily-verse` endpointjáról
 */

import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { ClipboardList, Users, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Card, CardContent } from '@kartoteka/ui'
import {
  AgeDistribution,
  Celebrations,
  HeroBannerScripture,
  KpiCards,
  RecentActivity,
  UpcomingPrograms,
  type AgeBucketEntry,
  type CelebrationEntry,
  type DailyVerseData,
  type RecentActivityEntry,
  type UpcomingProgramEntry,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import {
  calculateAgeDistribution,
  extractUpcomingBirthdays,
} from '../lib/dashboard-helpers'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLocalCsaladokCount,
  getLocalMembersOfOwnCongregation,
  getLocalOwnCongregation,
  getLocalOwnProfile,
  getLocalUpcomingPrograms,
  getLocalWorklogOfOwnCongregation,
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
  const [memberCount, setMemberCount] = useState<number>(0)
  const [familyCount, setFamilyCount] = useState<number>(0)
  const [ageBuckets, setAgeBuckets] = useState<AgeBucketEntry[]>([])
  const [birthdays, setBirthdays] = useState<CelebrationEntry[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentActivityEntry[]>([])
  const [upcomingPrograms, setUpcomingPrograms] = useState<UpcomingProgramEntry[]>([])
  const [dailyVerse, setDailyVerse] = useState<DailyVerseData | null>(null)

  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user)
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

    void Promise.all([
      getLocalOwnProfile(user.id).catch(() => null),
      getLocalOwnCongregation(user.id).catch(() => null),
      getLocalCsaladokCount(user.id).catch(() => 0),
      getLocalMembersOfOwnCongregation(user.id).catch(() => []),
      getLocalWorklogOfOwnCongregation(user.id, { limit: 10 }).catch(() => []),
      getLocalUpcomingPrograms(user.id, 14, 5).catch(() => []),
    ]).then(([profile, congregation, families, members, worklog, programs]) => {
      if (!mounted) return
      setFullName(profile?.full_name ?? null)
      setCongregationName(congregation?.nev_hu ?? congregation?.name ?? null)
      setFamilyCount(families)
      setMemberCount(members.filter((m) => !m.meghalt).length)
      setAgeBuckets(calculateAgeDistribution(members))
      setBirthdays(extractUpcomingBirthdays(members, 14))
      setRecentActivity(
        worklog.map((w) => ({
          id: w.id,
          idopont: w.idopont,
          jellege: w.jellege,
          cim: w.cim,
          jelenlet: w.jelenlet_osszesen ?? null,
        })),
      )
      setUpcomingPrograms(
        programs.map((p) => ({
          id: p.id,
          cim: p.cim,
          datum: p.datum,
          ido_kezdes: p.ido_kezdes,
          helyszin: p.helyszin,
          tipus: p.tipus,
          prioritas: p.prioritas,
          ismetlodes_tipus: p.ismetlodes_tipus,
          egyedi_tipus_nev: p.egyedi_tipus_nev,
          leiras: p.leiras,
          szin: p.szin,
          egyedi_emoji: p.egyedi_emoji,
        })),
      )
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

  const firstName = fullName?.split(' ').pop() ?? null
  const greeting = useMemo(() => getGreeting(), [])
  const greetingText = `${greeting}${firstName ? `, ${firstName}!` : '!'}`
  const dateText = useMemo(() => formatHuDateFull(new Date()), [])

  return (
    <DesktopShell>
      <div className="space-y-6">
        {/* Üdvözlő banner */}
        <HeroBannerScripture
          greetingText={greetingText}
          dateText={dateText}
          congregationName={congregationName}
          todayNamedays={[]}
          dailyVerse={dailyVerse}
        />

        {/* 3 KPI kártya — desktop módban, a webes-only "Gyülekezeti weboldal"
            és „Prezentáció" kártyák elrejtve (Sprint P, v0.5.4). */}
        <KpiCards
          activeMemberCount={memberCount}
          familyCount={familyCount}
          monthlyIncome={0}
          monthlyExpense={0}
          yearlyIncome={0}
          yearlyExpense={0}
          hideWebOnlyCards
        />

        {/* 3 oszlop a hero alatt: Ma köszöntjük + Gyülekezeti programok + Korelosztás
            (Sprint O — Endre kérése a 3 widget egy sorba szépen dobozolva). */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Celebrations
            entries={birthdays}
            onEntryClick={(entry) => navigate(`/tagnyilvantartas?member=${entry.id}`)}
          />
          <UpcomingPrograms entries={upcomingPrograms} />
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

        {/* Info-doboz */}
        <Card className="card-raised border-0 border-amber-100">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              ℹ️
            </span>
            <div className="flex-1 text-xs text-slate-700">
              <p className="font-medium text-slate-800">Fejlesztői állapot</p>
              <p className="mt-1 leading-snug">
                A desktop app jelenleg <strong>v0.8.7</strong> verzióban fut. Tagnyilvántartás,
                családok, munkanapló, pénzügy (7 oldal), anyakönyv (8 tábla), leltár, iktató,
                jegyzőkönyvek, sírhelyek és éves jelentés mind elérhetők offline-ban. Az
                adatok automatikusan szinkronizálódnak percenként a háttérben — az alsó
                állapotsávon látszik, mikor frissültek utoljára.{' '}
                <strong>Új a v0.8.7-ben:</strong> az offline belépési kódot mostantól
                a rendszer megjegyzi a saját számítógépeden („Emlékezz erre a gépre" pipa) —
                így nem kell minden frissítés után újra megadni; ha elfelejtetted a kódot,
                az „Elfelejtettem" gomb után online belépéssel új kódot állíthatsz be.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate('/dev')}>
                  Fejlesztői eszközök
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DesktopShell>
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
