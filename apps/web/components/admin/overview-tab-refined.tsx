'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Building2,
  Headphones,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { AdminEmptyState } from './_shared/admin-empty-state'
import { AdminSkeleton } from './_shared/admin-skeleton'
import { AdminTable } from './_shared/admin-table'
import { StatusBadge } from './_shared/status-badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getAdminOverview, runQualityCheck } from '@/app/(dashboard)/admin/actions'

interface OverviewData {
  kpis: { congregations: number; activeUsers: number; members: number; pendingUsers: number; pendingTickets: number }
  dioceseStats: { name: string; congregations: number; members: number }[]
  top10: { name: string; members: number }[]
}

interface QualityData {
  data: { congName: string; missingCnp: number; missingGender: number; missingBirthdate: number }[]
  totals: { missingCnp: number; missingGender: number; missingBirthdate: number }
}

/* ── Tone-rendszer (2026-07-11 redesign): token-alapú + státusz-színek dark-párral.
   A korábbi 'from-{szín}-50 to-white' gradient-kártyák dark módban olvashatatlanok
   voltak (a .dark shim nem ír át gradient-stopokat) — helyettük bg-card kártya
   és színes ikonlap. */

type Tone = 'neutral' | 'primary' | 'sky' | 'emerald' | 'amber' | 'rose'

const TONE_ICON: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
}

/** Kiemelt (highlight) KPI-érték színe — a tone-t követi, nem fixen piros. */
const TONE_STRONG: Record<Tone, string> = {
  neutral: 'text-foreground',
  primary: 'text-primary',
  sky: 'text-sky-700 dark:text-sky-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-700 dark:text-amber-300',
  rose: 'text-rose-700 dark:text-rose-300',
}

const TONE_MINI: Record<Tone, string> = {
  neutral: 'bg-muted/60 text-foreground ring-border',
  primary: 'bg-primary/10 text-foreground ring-primary/20',
  sky: 'bg-sky-50 text-sky-900 ring-sky-600/15 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-400/20',
  emerald:
    'bg-emerald-50 text-emerald-900 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-400/20',
  amber:
    'bg-amber-50 text-amber-900 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-400/20',
  rose: 'bg-rose-50 text-rose-900 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-400/20',
}

export function OverviewTabRefined() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [quality, setQuality] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [qualityLoading, setQualityLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getAdminOverview()
      .then(setOverview)
      .catch(() => toast.error('Hiba az áttekintés betöltésekor'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleQualityCheck() {
    setQualityLoading(true)
    try {
      const result = await runQualityCheck()
      setQuality(result)
    } catch {
      toast.error('Hiba a minőségellenőrzés során')
    } finally {
      setQualityLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="card-raised p-4 sm:p-5">
        <AdminSkeleton rows={6} />
      </div>
    )
  }

  // Hiba-állapot újrapróbálás-gombbal — korábban csak egy statikus szöveg volt,
  // és az admin csak teljes oldal-reload-dal tudott újratölteni.
  if (!overview) {
    return (
      <div className="card-raised p-4 sm:p-5">
        <AdminEmptyState
          icon={AlertTriangle}
          title="Nem sikerült betölteni az áttekintést"
          hint="Ellenőrizze az internetkapcsolatot, majd próbálja újra."
          action={
            <Button variant="outline" onClick={load}>
              <RefreshCw className="size-4" />
              Újrapróbálás
            </Button>
          }
        />
      </div>
    )
  }

  const { kpis, dioceseStats, top10 } = overview

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Gyülekezetek"
          value={kpis.congregations}
          hint="Aktív gyülekezeti egység"
          icon={Building2}
          tone="primary"
        />
        <KpiCard
          label="Aktív felhasználók"
          value={kpis.activeUsers}
          hint="Jóváhagyott fiókok"
          icon={Users}
          tone="sky"
        />
        <KpiCard
          label="Élő tagok"
          value={kpis.members}
          hint="Jelenleg nyilvántartott tag"
          icon={UserCheck}
          tone="emerald"
        />
        <KpiCard
          label="Függő regisztrációk"
          value={kpis.pendingUsers}
          hint="Jóváhagyásra vár"
          icon={UserPlus}
          tone={kpis.pendingUsers > 0 ? 'amber' : 'neutral'}
          highlight={kpis.pendingUsers > 0}
        />
        <KpiCard
          label="Nyitott jegyek"
          value={kpis.pendingTickets}
          hint="Támogatási teendő"
          icon={Headphones}
          tone={kpis.pendingTickets > 0 ? 'rose' : 'neutral'}
          highlight={kpis.pendingTickets > 0}
        />
      </div>

      {/* 2026-07-11: a korábbi 3. oszlop ('Rendszerállapot' StatusMeter-ek) törölve —
          a csíkok fabrikált max-értékekre (value+4/+8/+40) épültek, valós állapotot
          nem mértek. A valós számok a fenti KPI-kártyákon szerepelnek. */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <SectionCard icon={Building2} iconClassName="text-primary" title="Egyházmegyék összesítője">
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <MiniSummary label="Egyházmegye" value={dioceseStats.length} />
            <MiniSummary
              label="Gyülekezet"
              value={dioceseStats.reduce((sum, item) => sum + item.congregations, 0)}
            />
            <MiniSummary
              label="Nyilvántartott tag"
              value={dioceseStats.reduce((sum, item) => sum + item.members, 0)}
            />
          </div>

          <AdminTable
            columns={[
              { key: 'name', label: 'Egyházmegye' },
              { key: 'congregations', label: 'Gyülekezetek', align: 'right', className: 'tabular-nums' },
              { key: 'members', label: 'Tagok', align: 'right', className: 'tabular-nums' },
            ]}
            rows={dioceseStats}
            rowKey={(d) => d.name}
            renderCell={(d, key) => {
              if (key === 'name') return <span className="font-medium">{d.name}</span>
              if (key === 'congregations') return d.congregations.toLocaleString('hu-HU')
              return <span className="font-semibold">{d.members.toLocaleString('hu-HU')}</span>
            }}
            renderMobileCard={(d) => (
              <div className="rounded-xl bg-muted/40 p-3 ring-1 ring-border">
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.congregations.toLocaleString('hu-HU')} gyülekezet ·{' '}
                  {d.members.toLocaleString('hu-HU')} tag
                </p>
              </div>
            )}
            empty={
              <AdminEmptyState
                icon={Building2}
                title="Még nincs megjeleníthető egyházmegye"
                hint="Amint gyülekezetek kerülnek a rendszerbe, itt jelenik meg az egyházmegyénkénti összesítés."
              />
            }
          />
        </SectionCard>

        <SectionCard
          icon={ShieldAlert}
          iconClassName="text-amber-600 dark:text-amber-400"
          title="Sürgős figyelmeztetések"
        >
          <div className="space-y-3">
            <AlertRow
              intent={kpis.pendingUsers > 0 ? 'warning' : 'success'}
              label="Regisztrációk"
              value={`${kpis.pendingUsers} várakozik`}
              description={
                kpis.pendingUsers > 0 ? 'Érdemes jóváhagyni vagy visszajelezni.' : 'Jelenleg nincs függő kérés.'
              }
            />
            <AlertRow
              intent={kpis.pendingTickets > 0 ? 'danger' : 'success'}
              label="Támogatási jegyek"
              value={`${kpis.pendingTickets} nyitott`}
              description={
                kpis.pendingTickets > 0
                  ? 'A felhasználók visszajelzésre várnak.'
                  : 'Jelenleg nincs nyitott támogatási jegy.'
              }
            />
            <AlertRow
              intent="info"
              label="Felhasználói aktivitás"
              value={`${kpis.activeUsers} aktív fiók`}
              description="A rendszer jelenlegi aktív felhasználói bázisa."
            />
          </div>
        </SectionCard>
      </div>

      {top10.length > 0 && (
        <SectionCard
          icon={Activity}
          iconClassName="text-emerald-600 dark:text-emerald-400"
          title="Legnagyobb gyülekezetek"
        >
          <AdminTable
            columns={[
              { key: 'rank', label: '#', className: 'w-10 tabular-nums' },
              { key: 'name', label: 'Gyülekezet' },
              { key: 'members', label: 'Tagszám', align: 'right', className: 'tabular-nums' },
            ]}
            rows={top10.map((item, index) => ({ ...item, rank: index + 1 }))}
            rowKey={(item) => item.name}
            renderCell={(item, key) => {
              if (key === 'rank') return <span className="text-muted-foreground">{item.rank}.</span>
              if (key === 'name') return <span className="font-medium">{item.name}</span>
              return <span className="font-semibold">{item.members.toLocaleString('hu-HU')}</span>
            }}
            renderMobileCard={(item) => (
              <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 ring-1 ring-border">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums">
                  {item.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.members.toLocaleString('hu-HU')} tag</p>
                </div>
              </div>
            )}
            empty={
              <AdminEmptyState
                icon={Activity}
                title="Nincs megjeleníthető gyülekezet"
                hint="A tagszám szerinti toplista akkor jelenik meg, ha már vannak tagok a rendszerben."
              />
            }
          />
        </SectionCard>
      )}

      <SectionCard
        icon={SearchCheck}
        iconClassName="text-rose-600 dark:text-rose-400"
        title="Adatminőség ellenőrzés"
        action={
          <Button variant="outline" onClick={handleQualityCheck} disabled={qualityLoading}>
            {qualityLoading ? 'Ellenőrzés folyamatban…' : 'Minőség-ellenőrzés'}
          </Button>
        }
      >
        {qualityLoading && <AdminSkeleton rows={4} />}
        {!qualityLoading && !quality && (
          <AdminEmptyState
            icon={SearchCheck}
            title="Még nem futott ellenőrzés"
            hint="A Minőség-ellenőrzés gomb gyülekezetenként összesíti a hiányzó CNP-t, nemet és születési dátumot."
          />
        )}
        {!qualityLoading && quality && quality.data.length === 0 && (
          <AdminEmptyState
            icon={SearchCheck}
            title="Minden rendben!"
            hint="Az ellenőrzött gyülekezetekben nincs hiányzó CNP, nem vagy születési dátum."
          />
        )}
        {!qualityLoading && quality && quality.data.length > 0 && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <MiniSummary label="Hiányzó CNP" value={quality.totals.missingCnp} tone="rose" />
              <MiniSummary label="Hiányzó nem" value={quality.totals.missingGender} tone="amber" />
              <MiniSummary label="Hiányzó szül. dátum" value={quality.totals.missingBirthdate} tone="sky" />
              <MiniSummary label="Érintett gyülekezet" value={quality.data.length} tone="neutral" />
            </div>

            <AdminTable
              columns={[
                { key: 'congName', label: 'Gyülekezet' },
                { key: 'missingCnp', label: 'Hiányzó CNP', align: 'right', className: 'tabular-nums' },
                { key: 'missingGender', label: 'Hiányzó nem', align: 'right', className: 'tabular-nums' },
                { key: 'missingBirthdate', label: 'Hiányzó szül. dátum', align: 'right', className: 'tabular-nums' },
              ]}
              rows={quality.data}
              rowKey={(row) => row.congName}
              renderCell={(row, key) => {
                if (key === 'congName') return <span className="font-medium">{row.congName}</span>
                const value = row[key as 'missingCnp' | 'missingGender' | 'missingBirthdate']
                return value > 0 ? value : <span className="text-muted-foreground">—</span>
              }}
              renderMobileCard={(row) => (
                <div className="rounded-xl bg-muted/40 p-3 ring-1 ring-border">
                  <p className="text-sm font-semibold text-foreground">{row.congName}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.missingCnp > 0 && <StatusBadge intent="danger">CNP: {row.missingCnp}</StatusBadge>}
                    {row.missingGender > 0 && <StatusBadge intent="warning">Nem: {row.missingGender}</StatusBadge>}
                    {row.missingBirthdate > 0 && (
                      <StatusBadge intent="info">Szül. dátum: {row.missingBirthdate}</StatusBadge>
                    )}
                  </div>
                </div>
              )}
              empty={
                <AdminEmptyState
                  icon={SearchCheck}
                  title="Nincs hibás sor"
                  hint="Az ellenőrzés nem talált hiányzó adatot."
                />
              }
            />
          </>
        )}
      </SectionCard>
    </div>
  )
}

/* ── Építőelemek ──────────────────────────────────────────────────────────── */

function SectionCard({
  icon: Icon,
  iconClassName,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card-raised p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-heading text-base text-foreground">
          <Icon className={cn('size-4 shrink-0', iconClassName ?? 'text-muted-foreground')} />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  highlight,
}: {
  label: string
  value: number
  hint: string
  icon: React.ComponentType<{ className?: string }>
  tone: Tone
  highlight?: boolean
}) {
  return (
    <div className="card-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p
            className={cn(
              'mt-2 font-heading text-2xl font-semibold tabular-nums',
              highlight ? TONE_STRONG[tone] : 'text-foreground',
            )}
          >
            {value.toLocaleString('hu-HU')}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TONE_ICON[tone])}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  )
}

function MiniSummary({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: Tone
}) {
  return (
    <div className={cn('rounded-xl px-3 py-2.5 ring-1 ring-inset', TONE_MINI[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value.toLocaleString('hu-HU')}</p>
    </div>
  )
}

function AlertRow({
  label,
  value,
  description,
  intent,
}: {
  label: string
  value: string
  description: string
  intent: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <StatusBadge intent={intent}>{value}</StatusBadge>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
