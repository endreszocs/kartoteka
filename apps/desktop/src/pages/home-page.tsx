/**
 * HomePage (Irányítópult) — a desktop-kliens főoldala.
 *
 * Egyszerűsített KPI-orientált verzió a web-dashboard 368-soros oldalához
 * képest. A dev/sync/device részletes kezelés a Beállítások → Adat &
 * biztonság tabba került.
 *
 * Komponensek:
 *   - Üdvözlő fejléc (időszak szerinti köszönés + gyülekezetnév)
 *   - 4 KPI kártya: tagok, munkanapló bejegyzések, utolsó szinkron, eszköz
 *   - Gyors linkek a főbb modulokhoz (tagnyilvántartás, munkanapló, pénzügy)
 */

import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  BookOpen,
  ClipboardList,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Card, CardContent } from '@kartoteka/ui'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLastPullCongregationIso,
  getLastPullMembersIso,
  getLastPullWorklogIso,
  getLocalMemberCounts,
  getLocalOwnProfile,
  getLocalWorklogCount,
} from '../lib/sync'

export function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState<number>(0)
  const [worklogCount, setWorklogCount] = useState<number>(0)
  const [lastSync, setLastSync] = useState<string | null>(null)

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

  useEffect(() => {
    if (!user) return
    let mounted = true
    Promise.all([
      getLocalOwnProfile(user.id).catch(() => null),
      getLocalMemberCounts(user.id).catch(() => ({ total: 0, living: 0, visible: 0 })),
      getLocalWorklogCount(user.id).catch(() => 0),
      getLastPullCongregationIso().catch(() => null),
      getLastPullMembersIso(user.id).catch(() => null),
      getLastPullWorklogIso(user.id).catch(() => null),
    ])
      .then(([profile, memberCounts, wc, cgIso, mIso, wIso]) => {
        if (!mounted) return
        setFullName(profile?.full_name ?? null)
        setMemberCount(memberCounts.living)
        setWorklogCount(wc)
        // Legfrissebb sync időpont a három közül
        const times = [cgIso, mIso, wIso].filter(Boolean) as string[]
        setLastSync(times.length > 0 ? times.sort().reverse()[0] : null)
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      mounted = false
    }
  }, [user])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 10) return 'Jó reggelt'
    if (h < 17) return 'Jó napot'
    if (h < 21) return 'Jó estét'
    return 'Szép estét'
  }, [])

  const firstName = fullName?.split(' ').pop() ?? null

  return (
    <DesktopShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ── Üdvözlő fejléc ── */}
        <Card className="card-raised border-0 overflow-hidden">
          <CardContent className="relative p-8">
            <div className="pointer-events-none absolute inset-0 opacity-50">
              <div className="absolute -right-20 -top-16 size-64 rounded-full bg-amber-300/20 blur-3xl" />
              <div className="absolute -bottom-20 right-32 size-48 rounded-full bg-emerald-300/15 blur-3xl" />
            </div>
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary/70">
                {new Date().toLocaleDateString('hu-HU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </p>
              <h1 className="mt-2 font-heading text-4xl leading-tight text-slate-800 sm:text-5xl">
                {greeting}
                {firstName ? `, ${firstName}!` : '!'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">
                Üdvözöllek a Kartotékában. Ez a desktop verzió titkosítva tárolja
                a gyülekezet adatait és internet nélkül is működik.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── KPI kártyák ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Aktív tagok"
            value={memberCount}
            icon={<Users className="size-5" />}
            gradient="from-emerald-400 to-teal-500"
            onClick={() => navigate('/tagnyilvantartas')}
          />
          <KpiCard
            label="Napló-bejegyzések"
            value={worklogCount}
            icon={<ClipboardList className="size-5" />}
            gradient="from-sky-400 to-cyan-500"
            onClick={() => navigate('/munkanaplo')}
          />
          <KpiCard
            label="Utolsó szinkron"
            value={lastSync ? formatRelativeTime(lastSync) : '—'}
            icon={<RefreshCw className="size-5" />}
            gradient="from-violet-400 to-purple-500"
            valueIsText
          />
          <KpiCard
            label="Modulok"
            value={4}
            icon={<BookOpen className="size-5" />}
            gradient="from-amber-400 to-orange-500"
            hint="offline-kész"
          />
        </div>

        {/* ── Gyors linkek ── */}
        <Card className="card-raised border-0">
          <CardContent className="p-6">
            <h2 className="font-heading text-xl text-slate-800">Gyors hozzáférés</h2>
            <p className="mt-1 text-xs text-slate-500">
              A leghasználtabb moduljaid egy kattintásra. A teljes modul-lista
              a bal oldali menüben elérhető.
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
                description="Éves járulék, persely, számadás (hamarosan)"
                gradient="from-amber-400 to-orange-500"
                onClick={() => navigate('/penzugy')}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Info-doboz a fejlesztői állapotról ── */}
        <Card className="card-raised border-0 border-amber-100">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              ℹ️
            </span>
            <div className="flex-1 text-xs text-slate-700">
              <p className="font-medium text-slate-800">Fejlesztői állapot</p>
              <p className="mt-1 leading-snug">
                A desktop app jelenleg <strong>M8 fázisban</strong> van. A
                tagnyilvántartás, munkanapló és gyülekezet-adatok offline már
                működnek. Az írás-műveletek (új tag, módosítás) a következő
                fázisokban érkeznek. A részletes állapot a <strong>Beállítások
                → Adat &amp; biztonság</strong> tabban látható.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/dev')}
                >
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

// ──────────────────────────────────────────────────────────────
// KPI kártya
// ──────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  gradient: string
  onClick?: () => void
  hint?: string
  valueIsText?: boolean
}

function KpiCard({ label, value, icon, gradient, onClick, hint, valueIsText = false }: KpiCardProps) {
  const interactive = Boolean(onClick)
  const Wrapper: React.ElementType = interactive ? 'button' : 'div'
  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`card-raised flex flex-col gap-3 rounded-[1.4rem] border-0 p-4 text-left transition ${
        interactive ? 'hover:-translate-y-0.5 cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-sm`}
        >
          {icon}
        </span>
        {hint && (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <div>
        <div
          className={`font-heading leading-none text-slate-800 ${
            valueIsText ? 'text-lg' : 'text-4xl'
          }`}
        >
          {value}
        </div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>
      </div>
    </Wrapper>
  )
}

// ──────────────────────────────────────────────────────────────
// Gyors link
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = now - then
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin < 1) return 'most'
    if (diffMin < 60) return `${diffMin} perce`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr} órája`
    const diffDay = Math.round(diffHr / 24)
    if (diffDay < 30) return `${diffDay} napja`
    return new Date(iso).toLocaleDateString('hu-HU')
  } catch {
    return iso.slice(0, 10)
  }
}
