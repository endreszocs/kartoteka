'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calculator,
  ChevronRight,
  Church,
  Database,
  Download,
  Eye,
  Flame,
  Inbox,
  LifeBuoy,
  Loader2,
  PiggyBank,
  ShieldAlert,
  UserCog,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { OverviewTabRefined } from './overview-tab-refined'
import { getAccessRequestStats } from '@/app/(dashboard)/admin/access-requests-actions'
import { listBroadcasts } from '@/app/(dashboard)/admin/broadcasts-actions'

// ── Akcionálható KPI kártya ────────────────────────────────────────────────

function FocusCard({
  href,
  icon: Icon,
  label,
  value,
  description,
  tone,
  highlight = false,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  description: string
  tone: 'amber' | 'rose' | 'emerald' | 'sky' | 'violet'
  highlight?: boolean
}) {
  const tones = {
    amber: 'from-amber-50 to-amber-100/40 ring-amber-200/60 hover:ring-amber-300',
    rose: 'from-rose-50 to-rose-100/40 ring-rose-200/60 hover:ring-rose-300',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60 hover:ring-emerald-300',
    sky: 'from-sky-50 to-sky-100/40 ring-sky-200/60 hover:ring-sky-300',
    violet: 'from-violet-50 to-violet-100/40 ring-violet-200/60 hover:ring-violet-300',
  }
  const iconBg = {
    amber: 'bg-amber-500/10 text-amber-600',
    rose: 'bg-rose-500/10 text-rose-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    sky: 'bg-sky-500/10 text-sky-600',
    violet: 'bg-violet-500/10 text-violet-600',
  }
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${tones[tone]} p-5 ring-1 transition hover:shadow-md ${highlight ? 'ring-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex size-11 items-center justify-center rounded-2xl ${iconBg[tone]}`}>
          <Icon className="size-5" />
        </div>
        <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-1 font-heading text-3xl font-semibold text-slate-800 tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </Link>
  )
}

// ── Modul-link kártya ───────────────────────────────────────────────────────

function ModuleLink({
  href,
  icon: Icon,
  label,
  description,
  gradient,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  gradient: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition hover:shadow-md hover:ring-primary/40"
    >
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}>
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading text-sm font-semibold text-slate-800">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 mt-1 text-slate-300 transition group-hover:text-slate-500" />
    </Link>
  )
}

const MODULES = [
  {
    href: '/admin/hozzaferes-kerelmek',
    icon: Inbox,
    label: 'Hozzáférés-kérelmek',
    description: 'Új regisztrációk elbírálása, jóváhagyás vagy elutasítás.',
    gradient: 'from-amber-400 to-orange-500',
  },
  {
    href: '/admin/gyulekezetek',
    icon: Church,
    label: 'Gyülekezetek',
    description: 'A rendszerhez kapcsolt gyülekezetek listája és státusza.',
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    href: '/admin/felhasznalok',
    icon: UserCog,
    label: 'Felhasználók és szerepkörök',
    description: 'Felhasználók, várakozó kérelmek, szerepkörök kiosztása egy helyen.',
    gradient: 'from-violet-500 to-indigo-600',
  },
  {
    href: '/admin/konyvelok',
    icon: Calculator,
    label: 'Könyvelők / számvevők',
    description: 'A pénzügyi feladatkörök kiosztása gyülekezetenként.',
    gradient: 'from-teal-400 to-cyan-500',
  },
  {
    href: '/admin/eszkozok',
    icon: Database,
    label: 'Eszközök és napló',
    description: 'Asztali eszközök, licensz-kulcsok és aktivitási napló.',
    gradient: 'from-cyan-400 to-sky-500',
  },
  {
    href: '/admin/frissitesek',
    icon: Bell,
    label: 'Frissítések',
    description: 'Broadcast üzenetek, hírlevél, changelog közzététel.',
    gradient: 'from-orange-400 to-amber-500',
  },
  {
    href: '/admin/tamogatas',
    icon: LifeBuoy,
    label: 'Támogatás',
    description: 'Beérkezett támogatási jegyek, nyitott esetek.',
    gradient: 'from-yellow-400 to-amber-500',
  },
  {
    href: '/admin/import',
    icon: Download,
    label: 'Import',
    description: 'Tagnyilvántartás importálása rendszergazdai módban.',
    gradient: 'from-pink-400 to-rose-500',
  },
  {
    href: '/admin/penzugy',
    icon: PiggyBank,
    label: 'Rendszer pénzügyei',
    description: 'A platform pénzügyi forgalma, számlázás, határidők.',
    gradient: 'from-rose-400 to-pink-500',
  },
  {
    href: '/admin/rendszer',
    icon: ShieldAlert,
    label: 'Rendszer',
    description: 'Biztonsági beállítások, audit, rendszer-paraméterek.',
    gradient: 'from-red-400 to-rose-500',
  },
  {
    href: '/admin/veszelyes-zona',
    icon: Flame,
    label: 'Veszélyes zóna',
    description: 'Adattisztítás, törlés — csak rendkívüli esetben.',
    gradient: 'from-red-500 to-red-700',
  },
] as const

// ── Friss broadcast lista ─────────────────────────────────────────────────

interface RecentBroadcast {
  id: string
  title: string
  created_at: string
  category: string | null
}

// ── Fő dashboard ───────────────────────────────────────────────────────────

export function AdminOverviewDashboard() {
  const [pendingRequests, setPendingRequests] = useState<number | null>(null)
  const [recentBroadcasts, setRecentBroadcasts] = useState<RecentBroadcast[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getAccessRequestStats().catch(() => ({ data: undefined as { pending?: number } | undefined })),
      listBroadcasts().then((r) => (r.data || []).slice(0, 5)).catch(() => [] as unknown[]),
    ]).then(([statsRes, broadcasts]) => {
      if (cancelled) return
      setPendingRequests(statsRes?.data?.pending ?? 0)
      setRecentBroadcasts(
        (broadcasts as Array<{ id: string; title: string; created_at: string; category?: string | null }>).map((b) => ({
          id: b.id,
          title: b.title,
          created_at: b.created_at,
          category: b.category ?? null,
        })),
      )
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Mi vár ma? — akcionálható KPI-k */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-heading text-xl text-slate-800">Mi vár ma?</h2>
          <p className="text-xs text-muted-foreground">Az aktuális elbírálások és üzenetek egy pillantásra</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FocusCard
            href="/admin/hozzaferes-kerelmek"
            icon={Inbox}
            label="Elbírálandó kérelem"
            value={loading ? '…' : (pendingRequests ?? 0)}
            description={
              loading
                ? 'Betöltés…'
                : pendingRequests === 0
                ? 'Minden kérelem feldolgozva.'
                : 'Új hozzáférés-kérelem várja az elbírálást.'
            }
            tone="amber"
            highlight={!!pendingRequests && pendingRequests > 0}
          />
          <FocusCard
            href="/admin/frissitesek"
            icon={Bell}
            label="Friss üzenetek"
            value={loading ? '…' : recentBroadcasts.length}
            description={
              loading
                ? 'Betöltés…'
                : recentBroadcasts.length === 0
                ? 'Még nem küldött broadcast-ot.'
                : 'A legfrissebb broadcast üzenetek.'
            }
            tone="sky"
          />
          <FocusCard
            href="/admin/penzugy"
            icon={PiggyBank}
            label="Rendszer pénzügyei"
            value="—"
            description="Platform-szintű forgalom és határidők."
            tone="emerald"
          />
          <FocusCard
            href="/admin/tamogatas"
            icon={LifeBuoy}
            label="Támogatási jegyek"
            value="—"
            description="Nyitott támogatási kérdések."
            tone="rose"
          />
        </div>
      </section>

      {/* Friss broadcast üzenetek lista */}
      {recentBroadcasts.length > 0 && (
        <section className="card-raised p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-base text-slate-800">Legutóbbi üzenetek</h2>
            <Link href="/admin/frissitesek" className="text-xs font-medium text-primary hover:underline">
              Az összes →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recentBroadcasts.map((b) => (
              <li key={b.id} className="flex items-start gap-3 py-3">
                <div className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                  <Bell className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{b.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString('hu-HU', { dateStyle: 'long', timeStyle: 'short' })}
                    {b.category ? ` · ${b.category}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Modulok rácsban */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-heading text-xl text-slate-800">Admin modulok</h2>
          <p className="text-xs text-muted-foreground">Bármelyik részhez közvetlenül átléphet</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <ModuleLink key={m.href} {...m} />
          ))}
        </div>
      </section>

      {/* Részletes statisztikák — a régi OverviewTabRefined */}
      <section>
        <div className="mb-3 flex items-baseline gap-2">
          <Eye className="size-4 text-muted-foreground" />
          <h2 className="font-heading text-xl text-slate-800">Részletes statisztikák</h2>
        </div>
        <div className="card-raised p-4 sm:p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <OverviewTabRefined />
          )}
        </div>
      </section>

      {/* Adatminőségi figyelmeztetés (link a "hibák" felé) */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 flex items-start gap-3">
        <AlertTriangle className="size-5 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-semibold">Tagnyilvántartási adatminőség</p>
          <p className="mt-0.5">
            A gyülekezetek tagjai között hibás vagy hiányzó mezők találhatók. A részletekért
            navigáljon a saját gyülekezet <Link href="/tagnyilvantartas#errors" className="font-semibold underline">Hibák</Link> fülére,
            vagy bármely másik gyülekezetbe a <Link href="/admin/gyulekezetek" className="font-semibold underline">Gyülekezetek</Link> oldalon át lépve.
          </p>
        </div>
      </div>
    </div>
  )
}
