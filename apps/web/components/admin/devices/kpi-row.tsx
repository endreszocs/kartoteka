'use client'

/**
 * Eszközök és napló — KPI-sáv (2026-07-11, admin-redesign 2. kör).
 *
 * Négy kattintható mutató: aktív eszközök, aktív licencek, 30 napon belül
 * lejáró licencek, alvó (30+ napja nem látott) eszközök. Kattintásra a
 * megfelelő al-fül nyílik a hozzá tartozó szűrővel.
 */

import type { LucideIcon } from 'lucide-react'
import { Key, Moon, Monitor, TimerReset } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface DeviceLicenseKpis {
  activeDevices: number
  activeLicenses: number
  expiringLicenses: number
  dormantDevices: number
}

type KpiTone = 'primary' | 'success' | 'warning' | 'info'

const TONE_ICON_CLASSES: Record<KpiTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
}

function KpiCard({
  icon: Icon,
  tone,
  value,
  label,
  hint,
  onClick,
  highlight,
}: {
  icon: LucideIcon
  tone: KpiTone
  value: number
  label: string
  hint: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    // Teljes-kártya gomb wrapper — a design-irányelv nevesített kivétele.
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        'card-raised group min-h-11 p-3 text-left outline-none transition sm:p-4',
        'hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/50',
        highlight && 'ring-1 ring-amber-400/50 dark:ring-amber-500/40',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10',
            TONE_ICON_CLASSES[tone],
          )}
        >
          <Icon className="size-4 sm:size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="font-heading text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
            {value}
          </p>
          <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
            {label}
          </p>
        </div>
      </div>
    </button>
  )
}

export function DevicesLicensesKpiRow({
  kpis,
  onShowActiveDevices,
  onShowActiveLicenses,
  onShowExpiringLicenses,
  onShowDormantDevices,
}: {
  kpis: DeviceLicenseKpis
  onShowActiveDevices: () => void
  onShowActiveLicenses: () => void
  onShowExpiringLicenses: () => void
  onShowDormantDevices: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <KpiCard
        icon={Monitor}
        tone="primary"
        value={kpis.activeDevices}
        label="Aktív eszköz"
        hint="Az Eszközök fül megnyitása"
        onClick={onShowActiveDevices}
      />
      <KpiCard
        icon={Key}
        tone="success"
        value={kpis.activeLicenses}
        label="Aktív licenc"
        hint="A Licencek fül megnyitása (aktívakra szűrve)"
        onClick={onShowActiveLicenses}
      />
      <KpiCard
        icon={TimerReset}
        tone="warning"
        value={kpis.expiringLicenses}
        label="30 napon belül lejár"
        hint="A Licencek fül megnyitása (hamarosan lejárókra szűrve)"
        onClick={onShowExpiringLicenses}
        highlight={kpis.expiringLicenses > 0}
      />
      <KpiCard
        icon={Moon}
        tone="info"
        value={kpis.dormantDevices}
        label="Alvó eszköz (30+ nap)"
        hint="Az Eszközök fül megnyitása (alvókra szűrve)"
        onClick={onShowDormantDevices}
      />
    </div>
  )
}
