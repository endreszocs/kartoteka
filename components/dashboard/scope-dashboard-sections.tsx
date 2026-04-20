import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BadgeCheck,
  BellRing,
  Building2,
  Church,
  ShieldAlert,
  Users,
  UserPlus,
} from 'lucide-react'

import type {
  CongregationBreakdownRow,
  DioceseBreakdownRow,
  QualityCongregationRow,
  RecentProfileRow,
  ScopeKpis,
} from '@/lib/dashboard/scope-overview'

type Tone = 'indigo' | 'blue' | 'emerald' | 'amber' | 'rose' | 'slate'

const toneStyles: Record<Tone, { shell: string; icon: string; badge: string }> = {
  indigo: {
    shell: 'from-indigo-50 to-white',
    icon: 'bg-indigo-100 text-indigo-600',
    badge: 'bg-indigo-50 text-indigo-700',
  },
  blue: {
    shell: 'from-sky-50 to-white',
    icon: 'bg-sky-100 text-sky-600',
    badge: 'bg-sky-50 text-sky-700',
  },
  emerald: {
    shell: 'from-emerald-50 to-white',
    icon: 'bg-emerald-100 text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700',
  },
  amber: {
    shell: 'from-amber-50 to-white',
    icon: 'bg-amber-100 text-amber-600',
    badge: 'bg-amber-50 text-amber-700',
  },
  rose: {
    shell: 'from-rose-50 to-white',
    icon: 'bg-rose-100 text-rose-600',
    badge: 'bg-rose-50 text-rose-700',
  },
  slate: {
    shell: 'from-slate-50 to-white',
    icon: 'bg-slate-100 text-slate-600',
    badge: 'bg-slate-50 text-slate-700',
  },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export function ScopeHero({
  eyebrow,
  title,
  description,
  chips,
}: {
  eyebrow: string
  title: string
  description: string
  chips: string[]
}) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/16 bg-[linear-gradient(135deg,#14514b_0%,#1b6a63_44%,#264f69_100%)] px-6 py-7 text-white shadow-[0_34px_90px_-46px_rgba(11,44,54,0.74)] md:px-8 md:py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,224,173,0.22),transparent_17rem),radial-gradient(circle_at_bottom_right,rgba(184,240,228,0.18),transparent_18rem)]" />
      <div className="relative z-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-50/74">{eyebrow}</p>
        <h1 className="mt-3 font-heading text-3xl md:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-teal-50/76 md:text-base">{description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip} className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/88">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ScopeKpiGrid({ kpis, districtMode }: { kpis: ScopeKpis; districtMode: boolean }) {
  const cards: Array<{ label: string; value: number; hint: string; icon: LucideIcon; tone: Tone }> = [
    {
      label: districtMode ? 'Egyházmegyék' : 'Gyülekezetek',
      value: districtMode ? kpis.dioceses : kpis.congregations,
      hint: districtMode ? 'Összesített megyei lefedettség' : 'A megye aktív gyülekezetei',
      icon: districtMode ? Building2 : Church,
      tone: 'indigo',
    },
    {
      label: districtMode ? 'Gyülekezetek' : 'Aktív felhasználók',
      value: districtMode ? kpis.congregations : kpis.activeUsers,
      hint: districtMode ? 'Kapcsolt helyi közösségek' : 'Jóváhagyott szolgálói fiókok',
      icon: districtMode ? Church : Users,
      tone: 'blue',
    },
    {
      label: 'Nyilvántartott tagok',
      value: kpis.members,
      hint: 'Látható és élő tagsági állomány',
      icon: BadgeCheck,
      tone: 'emerald',
    },
    {
      label: 'Függő regisztrációk',
      value: kpis.pendingUsers,
      hint: 'Jóváhagyásra váró jelentkezések',
      icon: UserPlus,
      tone: kpis.pendingUsers > 0 ? 'amber' : 'slate',
    },
    {
      label: 'Nyitott támogatási jegyek',
      value: kpis.openTickets,
      hint: 'Visszajelzésre váró ügyek',
      icon: BellRing,
      tone: kpis.openTickets > 0 ? 'rose' : 'slate',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const tone = toneStyles[card.tone]
        const Icon = card.icon
        return (
          <div key={card.label} className={`rounded-[1.6rem] border border-white/80 bg-gradient-to-br ${tone.shell} p-4 shadow-[0_24px_50px_-38px_rgba(15,23,42,0.18)]`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-800">{card.value.toLocaleString('hu-HU')}</p>
                <p className="mt-2 text-xs text-slate-500">{card.hint}</p>
              </div>
              <div className={`flex size-11 items-center justify-center rounded-2xl ${tone.icon}`}>
                <Icon className="size-5" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ScopeBreakdownCard({
  title,
  subtitle,
  rows,
  districtMode,
}: {
  title: string
  subtitle: string
  rows: Array<DioceseBreakdownRow | CongregationBreakdownRow>
  districtMode: boolean
}) {
  return (
    <div className="card-raised p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/62">{subtitle}</p>
          <h2 className="mt-2 font-heading text-2xl text-slate-800">{title}</h2>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Activity className="size-5" />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-500">
              <th className="py-2 font-medium">{districtMode ? 'Egyházmegye' : 'Gyülekezet'}</th>
              {!districtMode && <th className="py-2 font-medium">Egyházmegye</th>}
              <th className="py-2 text-right font-medium">Tagok</th>
              <th className="py-2 text-right font-medium">Aktív fiók</th>
              <th className="py-2 text-right font-medium">Függő</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 font-medium text-slate-700">{row.name}</td>
                {!districtMode && <td className="py-2.5 text-slate-500">{(row as CongregationBreakdownRow).dioceseName}</td>}
                <td className="py-2.5 text-right font-semibold text-slate-700">{row.members.toLocaleString('hu-HU')}</td>
                <td className="py-2.5 text-right text-slate-600">{row.activeUsers.toLocaleString('hu-HU')}</td>
                <td className="py-2.5 text-right text-slate-600">{row.pendingUsers.toLocaleString('hu-HU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RoleDistributionCard({ rows }: { rows: { role: string; count: number }[] }) {
  return (
    <div className="card-raised p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/62">Szerepkörök</p>
      <h2 className="mt-2 font-heading text-2xl text-slate-800">Aktív szolgálói megoszlás</h2>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.role}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">{row.role}</span>
              <span className="text-slate-500">{row.count.toLocaleString('hu-HU')}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#1f9d8f_0%,#3ba6d6_100%)]"
                style={{ width: `${Math.max(8, Math.min(100, row.count * 12))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function QualitySummaryCard({
  totals,
  rows,
}: {
  totals: { missingCnp: number; missingGender: number; missingBirthdate: number }
  rows: QualityCongregationRow[]
}) {
  return (
    <div className="card-raised p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/62">Adatminőség</p>
          <h2 className="mt-2 font-heading text-2xl text-slate-800">Ahol még érdemes javítani</h2>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <ShieldAlert className="size-5" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SummaryPill label="Hiányzó CNP" value={totals.missingCnp} tone="rose" />
        <SummaryPill label="Hiányzó nem" value={totals.missingGender} tone="amber" />
        <SummaryPill label="Hiányzó szül. dátum" value={totals.missingBirthdate} tone="indigo" />
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 && (
          <div className="rounded-[1.2rem] bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
            Jelenleg nincs kiemelkedő adatminőségi hiány ebben a scope-ban.
          </div>
        )}

        {rows.slice(0, 6).map((row) => (
          <div key={row.congregationId} className="rounded-[1.2rem] border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-700">{row.congregationName}</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                {(row.missingCnp + row.missingGender + row.missingBirthdate).toLocaleString('hu-HU')} jelzés
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">CNP: {row.missingCnp}</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">Nem: {row.missingGender}</span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">Szül. dátum: {row.missingBirthdate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RecentProfilesCard({ rows }: { rows: RecentProfileRow[] }) {
  return (
    <div className="card-raised p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/62">Legutóbbi mozgás</p>
      <h2 className="mt-2 font-heading text-2xl text-slate-800">Friss regisztrációk és profilok</h2>

      <div className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-[1.2rem] border border-slate-100 bg-white p-4 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-800">{row.fullName}</p>
                <p className="mt-1 text-sm text-slate-500">{row.congregationName}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'pending' ? toneStyles.amber.badge : toneStyles.emerald.badge}`}>
                {row.status === 'pending' ? 'Függő' : 'Aktív'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-50 px-2.5 py-1">{row.role}</span>
              <span className="rounded-full bg-slate-50 px-2.5 py-1">{formatDate(row.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const style = toneStyles[tone]

  return (
    <div className={`rounded-[1.2rem] px-3 py-3 ${style.badge}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-1 text-lg font-bold">{value.toLocaleString('hu-HU')}</p>
    </div>
  )
}
