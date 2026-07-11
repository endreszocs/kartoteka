'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Bell,
  Calculator,
  ChevronRight,
  Church,
  Database,
  Download,
  Eye,
  Flame,
  History,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  PiggyBank,
  ShieldAlert,
  UserCog,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { AdminPageHeader } from './admin-page-header'
import { AdminSkeleton } from './_shared/admin-skeleton'
import { StatusBadge } from './_shared/status-badge'
import { OverviewTabRefined } from './overview-tab-refined'
import { getAccessRequestStats } from '@/app/(dashboard)/admin/access-requests-actions'
import { listBroadcasts } from '@/app/(dashboard)/admin/broadcasts-actions'
import { RELEASE_CATEGORY_LABELS } from '@/lib/broadcasts/types'
import type { BroadcastRow } from '@/lib/broadcasts/types'
import { cn } from '@/lib/utils'

// ── Akcionálható KPI kártya ────────────────────────────────────────────────

type FocusIntent = 'warning' | 'info' | 'danger'

const FOCUS_ICON: Record<FocusIntent, string> = {
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
}

function FocusCard({
  href,
  icon: Icon,
  label,
  value,
  description,
  intent,
  highlight = false,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  description: string
  intent: FocusIntent
  highlight?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative overflow-hidden rounded-2xl bg-card p-5 ring-1 ring-border transition hover:shadow-md hover:ring-primary/40',
        highlight && 'ring-2 ring-amber-400/70 dark:ring-amber-500/50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn('flex size-11 items-center justify-center rounded-2xl', FOCUS_ICON[intent])}>
          <Icon className="size-5" />
        </div>
        <ArrowRight className="size-4 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-1 font-heading text-3xl font-semibold text-foreground tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
  tone,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  tone?: 'danger'
}) {
  const danger = tone === 'danger'
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition hover:shadow-md',
        danger ? 'hover:ring-destructive/40' : 'hover:ring-primary/40',
      )}
    >
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[var(--primary-foreground)] shadow-sm"
        style={{
          background: danger
            ? 'linear-gradient(135deg, var(--destructive), color-mix(in oklab, var(--destructive) 65%, black))'
            : 'linear-gradient(135deg, var(--primary), var(--accent))',
        }}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{description}</p>
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/50 transition group-hover:text-muted-foreground" />
    </Link>
  )
}

/* 2026-07-11 redesign: az oldalankénti szivárvány-gradientek megszűntek —
   minden modul-ikonlap a téma tokenjeiből (--primary/--accent) színez, mint az
   AdminPageHeader; egyedül a Veszélyes zóna kap destructive-árnyalatot. */
const MODULES: ReadonlyArray<{
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  tone?: 'danger'
}> = [
  {
    href: '/admin/gyulekezetek',
    icon: Church,
    label: 'Gyülekezetek',
    description: 'A rendszerhez kapcsolt gyülekezetek listája és státusza.',
  },
  {
    href: '/admin/felhasznalok',
    icon: UserCog,
    label: 'Felhasználók és szerepkörök',
    description: 'Felhasználók, várakozó kérelmek, szerepkörök kiosztása egy helyen.',
  },
  {
    href: '/admin/konyvelok',
    icon: Calculator,
    label: 'Könyvelők / számvevők',
    description: 'A pénzügyi feladatkörök kiosztása gyülekezetenként.',
  },
  {
    href: '/admin/eszkozok',
    icon: Database,
    label: 'Eszközök és napló',
    description: 'Asztali eszközök, licensz-kulcsok és aktivitási napló.',
  },
  {
    href: '/admin/frissitesek',
    icon: Bell,
    label: 'Frissítések',
    description: 'Rendszerüzenetek, hírlevél, changelog közzététel.',
  },
  {
    href: '/admin/tamogatas',
    icon: LifeBuoy,
    label: 'Támogatás',
    description: 'Beérkezett támogatási jegyek, nyitott esetek.',
  },
  {
    href: '/admin/import',
    icon: Download,
    label: 'Import',
    description: 'Tagnyilvántartás importálása Excel-fájlból, varázslóval.',
  },
  {
    href: '/admin/penzugy',
    icon: PiggyBank,
    label: 'Rendszer pénzügyei',
    description: 'A platform pénzügyi forgalma, számlázás, határidők.',
  },
  {
    href: '/admin/rendszer',
    icon: ShieldAlert,
    label: 'Rendszer',
    description: 'Biztonsági beállítások, audit, rendszer-paraméterek.',
  },
  {
    href: '/admin/naplo',
    icon: History,
    label: 'Tevékenység-napló',
    description: 'Rekord-szintű módosítás-történet (audit).',
  },
  {
    href: '/admin/veszelyes-zona',
    icon: Flame,
    label: 'Veszélyes zóna',
    description: 'Adattisztítás, törlés — csak rendkívüli esetben.',
    tone: 'danger',
  },
]

// ── Segédek ────────────────────────────────────────────────────────────────

/** sent_at lehet null (még nem kiküldött üzenet) vagy hibás — sosem 'Invalid Date'. */
function formatSentAt(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('hu-HU', { dateStyle: 'long', timeStyle: 'short' })
}

// ── Fő dashboard ───────────────────────────────────────────────────────────

export function AdminOverviewDashboard() {
  const [pendingRequests, setPendingRequests] = useState<number | null>(null)
  const [requestsFailed, setRequestsFailed] = useState(false)
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[] | null>(null)
  const [broadcastsFailed, setBroadcastsFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getAccessRequestStats().catch(() => ({ error: 'Hálózati hiba' })),
      listBroadcasts().catch(() => ({ error: 'Hálózati hiba' })),
    ]).then(([statsRes, broadcastRes]) => {
      if (cancelled) return
      // FIX 2026-07-11: a hiba korábban némán '0 kérelem / minden feldolgozva'
      // állapotot mutatott — most megkülönböztetett hiba-állapot jelenik meg.
      if ('data' in statsRes && statsRes.data) setPendingRequests(statsRes.data.pending)
      else setRequestsFailed(true)
      if ('data' in broadcastRes && broadcastRes.data) setBroadcasts(broadcastRes.data)
      else setBroadcastsFailed(true)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const recentBroadcasts = (broadcasts ?? []).slice(0, 5)
  const latestSentAt = formatSentAt(broadcasts?.[0]?.sent_at)
  // Őszinte érték: a lekérdezés összes üzenete (max 100), nem a lista-slice hossza.
  const broadcastCount =
    broadcasts === null ? null : broadcasts.length >= 100 ? '100+' : broadcasts.length

  return (
    <div className="space-y-6">
      {/* Oldal-fejléc (h1) — az /admin volt az egyetlen admin-oldal cím nélkül. */}
      <AdminPageHeader
        title="Admin Központ"
        description="Kérelmek elbírálása, gyülekezetek és felhasználók kezelése, rendszerszintű beállítások — minden admin feladat innen indul."
        icon={LayoutDashboard}
        eyebrow="Rendszerszint"
        hideBackLink
      />

      {/* Mi vár ma? — akcionálható KPI-k */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-heading text-xl text-foreground">Mi vár ma?</h2>
          <p className="text-xs text-muted-foreground">Az aktuális elbírálások és üzenetek egy pillantásra</p>
        </div>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <AdminSkeleton rows={2} />
            </div>
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <AdminSkeleton rows={2} />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <FocusCard
              href="/admin/felhasznalok"
              icon={Inbox}
              label="Elbírálandó kérelem"
              value={requestsFailed ? '—' : (pendingRequests ?? 0)}
              description={
                requestsFailed
                  ? 'Nem sikerült betölteni a kérelmeket. Frissítse az oldalt, vagy nézze meg a Felhasználók oldalon.'
                  : pendingRequests === 0
                  ? 'Minden kérelem feldolgozva.'
                  : 'Új regisztráció vár jóváhagyásra a Felhasználók oldalon.'
              }
              intent={requestsFailed ? 'danger' : 'warning'}
              highlight={!requestsFailed && !!pendingRequests && pendingRequests > 0}
            />
            <FocusCard
              href="/admin/frissitesek"
              icon={Bell}
              label="Kiküldött üzenet"
              value={broadcastsFailed ? '—' : (broadcastCount ?? 0)}
              description={
                broadcastsFailed
                  ? 'Nem sikerült betölteni az üzeneteket. Részletek a Frissítések oldalon.'
                  : broadcastCount === 0
                  ? 'Még nem küldött üzenetet a gyülekezeteknek.'
                  : latestSentAt
                  ? `Legutóbbi küldés: ${latestSentAt}`
                  : 'A kiküldött üzenetek a Frissítések oldalon találhatók.'
              }
              intent={broadcastsFailed ? 'danger' : 'info'}
            />
          </div>
        )}
      </section>

      {/* Friss üzenetek lista — a system_broadcasts VALÓDI mezőivel
          (cim / sent_at / release_category; FIX 2026-07-11: korábban a nemlétező
          title/created_at/category mezőket olvasta → üres cím + 'Invalid Date'). */}
      {(loading || recentBroadcasts.length > 0) && (
        <section className="card-raised p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-heading text-base text-foreground">Legutóbbi üzenetek</h2>
            <Link
              href="/admin/frissitesek"
              className="inline-flex min-h-9 items-center rounded-full px-2 text-xs font-medium text-primary hover:underline"
            >
              Az összes →
            </Link>
          </div>
          {loading ? (
            <AdminSkeleton rows={3} />
          ) : (
            <ul className="divide-y divide-border/60">
              {recentBroadcasts.map((b) => {
                const sent = formatSentAt(b.sent_at)
                const category = b.release_category
                  ? RELEASE_CATEGORY_LABELS[b.release_category] ?? b.release_category
                  : null
                return (
                  <li key={b.id} className="flex items-start gap-3 py-3">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                      <Bell className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{b.cim}</p>
                        {category && <StatusBadge intent="info">{category}</StatusBadge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{sent ?? 'Még nincs kiküldve'}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {/* Modulok rácsban */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-heading text-xl text-foreground">Admin modulok</h2>
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
          <h2 className="font-heading text-xl text-foreground">Részletes statisztikák</h2>
        </div>
        {/* 2026-06-05: az OverviewTabRefined saját loading-állapottal rendelkezik,
            ezért NEM kapuzzuk a fenti két fetch-re — így a nehéz getAdminOverview
            lekérdezés PÁRHUZAMOSAN fut a KPI-kkal, nem utánuk.
            2026-07-11: a card-raised wrapper megszűnt — a tab saját szekció-
            kártyákat renderel, nem kell dupla keret. */}
        <OverviewTabRefined />
      </section>

      {/* Adatminőség — SEMLEGES tájékoztató (nem riasztás): nem állítja, hogy
          van hiba, csak megmutatja, hol ellenőrizhető. 2026-06-07. */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Eye className="mt-0.5 size-5 shrink-0 text-muted-foreground/70" />
        <div>
          <p className="font-semibold text-foreground">Tagnyilvántartási adatminőség</p>
          <p className="mt-0.5">
            A tagok esetleges hibás vagy hiányzó mezőit a saját gyülekezet{' '}
            <Link href="/tagnyilvantartas#errors" className="font-semibold text-primary hover:underline">
              Hibák
            </Link>{' '}
            fülén ellenőrizheti, vagy bármely másik gyülekezetbe a{' '}
            <Link href="/admin/gyulekezetek" className="font-semibold text-primary hover:underline">
              Gyülekezetek
            </Link>{' '}
            oldalon át lépve.
          </p>
        </div>
      </div>
    </div>
  )
}
