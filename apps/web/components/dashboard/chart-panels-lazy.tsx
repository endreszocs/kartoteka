'use client'

/**
 * Lazy wrapper a dashboard két diagram-paneljéhez (2026-08-11, 5. kör, P2-#21).
 *
 * MIÉRT: a `chart-panels.tsx` statikusan importálja a rechartsot, és a
 * dashboard szerver-komponense mindkét panelt feltétel nélkül renderelte —
 * ezért MINDEN irányítópult-megnyitáskor letöltődött és lefutott a ~381 KB-os
 * (tömörítve ~110 KB) recharts-köteg, mielőtt bármelyik panel megjelenhetett
 * volna. A két panel a KPI-csempék és a hármas sor ALATT ül, tehát telefonon
 * jellemzően nem is látszik az első képernyőn.
 *
 * A minta a repóban már bevált (AdminImportLazy, FullBackupPanelClient,
 * member-tabs-v4 next/dynamic fülei): vékony `'use client'` burkoló +
 * `next/dynamic`, mert az `ssr: false` szerver-komponensből
 * (dashboard/page.tsx) nem adható meg.
 *
 * A `loading` vázak MÉRETTARTÓK: ugyanaz a `card-raised` keret és magasság,
 * mint a kész panelé, így nincs elrendezés-ugrás (CLS) — sem a hármas sorban,
 * sem a pénzügyi rácsban, mobilon sem.
 */

import dynamic from 'next/dynamic'

import type {
  AgeDistributionCardProps,
  FinanceOverviewChartProps,
} from './chart-panels'

function ChartSkeleton({ label, height }: { label: string; height: string }) {
  return (
    <div className="card-raised flex h-full flex-col p-4 sm:p-5" aria-busy="true">
      <div className="mb-4 flex items-center gap-3">
        <div className="size-9 shrink-0 animate-pulse rounded-xl bg-muted" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-36 max-w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className={`w-full animate-pulse rounded-xl bg-muted ${height}`} />
      <p className="mt-3 text-center text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

const FinanceOverviewChartInner = dynamic(
  () => import('./chart-panels').then((m) => m.FinanceOverviewChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton label="Pénzügyi áttekintés betöltése…" height="h-[280px]" />,
  },
)

const AgeDistributionCardInner = dynamic(
  () => import('./chart-panels').then((m) => m.AgeDistributionCard),
  {
    ssr: false,
    loading: () => (
      <ChartSkeleton label="Koreloszlás betöltése…" height="h-[148px] sm:h-[160px] xl:h-[200px]" />
    ),
  },
)

export function FinanceOverviewChartLazy(props: FinanceOverviewChartProps) {
  return <FinanceOverviewChartInner {...props} />
}

export function AgeDistributionCardLazy(props: AgeDistributionCardProps) {
  return <AgeDistributionCardInner {...props} />
}
