'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Database,
  HardDrive,
  RefreshCw,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'

import { getDb } from '@/lib/offline/db'
import { useOnlineStatus } from '@/lib/offline/hooks/use-online-status'
import { useSyncCount } from '@/lib/offline/hooks/use-sync-query'
import {
  getSyncOrchestrator,
  type SyncEvent,
} from '@/lib/offline/sync-orchestrator'
import { TABLE_REGISTRY } from '@/lib/offline/table-registry'

/**
 * KPI kártyák az /offline oldal tetején.
 *
 * 4 kártya:
 *  1. Online státusz + utolsó szinkron
 *  2. Cache méret (összes rekord)
 *  3. Pending változások (offline queue)
 *  4. Konfliktusok (ha van)
 */
export function OfflineDashboardStats() {
  // SSR safety
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setMounted(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const isOnline = useOnlineStatus()
  const [syncing, setSyncing] = useState(false)
  const [totalCache, setTotalCache] = useState(0)

  const pendingCount = useSyncCount(
    mounted ? '_mutation_queue' : '__noop__',
    t =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t as any).where('status').anyOf(['pending', 'failed']).count(),
  )
  const conflictCount = useSyncCount(
    mounted ? '_conflicts' : '__noop__',
    t =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t as any).where('resolved').equals(0).count(),
  )

  // Cache total — periodikusan frissítjük
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return
    let cancelled = false
    async function refresh() {
      try {
        const db = getDb()
        let sum = 0
        for (const entry of TABLE_REGISTRY) {
          sum += await db.table(entry.dexieTable).count()
        }
        if (!cancelled) setTotalCache(sum)
      } catch (e) {
        console.warn('[OfflineDashboardStats]', e)
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 5_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [mounted])

  // Syncing állapot
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return
    const orchestrator = getSyncOrchestrator()
    const unsubscribe = orchestrator.subscribe((event: SyncEvent) => {
      if (event.type === 'pull_started' || event.type === 'push_started') {
        setSyncing(true)
      } else if (
        event.type === 'pull_completed' ||
        event.type === 'push_completed' ||
        event.type === 'pull_error' ||
        event.type === 'push_error'
      ) {
        setSyncing(false)
      }
    })
    return unsubscribe
  }, [mounted])

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Kapcsolat"
        value={mounted ? (isOnline ? 'Online' : 'Offline') : '—'}
        hint={
          mounted
            ? syncing
              ? 'Szinkronizálás folyamatban…'
              : isOnline
                ? 'Minden rendben'
                : 'Helyi mentés aktív'
            : 'Betöltés...'
        }
        Icon={mounted && !isOnline ? WifiOff : syncing ? RefreshCw : CheckCircle2}
        iconSpinning={syncing}
        tone={
          !mounted
            ? 'slate'
            : !isOnline
              ? 'orange'
              : syncing
                ? 'sky'
                : 'emerald'
        }
      />

      <KpiCard
        label="Cache méret"
        value={mounted ? totalCache.toLocaleString('hu-HU') : '—'}
        hint="lokális rekord"
        Icon={Database}
        tone="violet"
      />

      <KpiCard
        label="Várakozó változás"
        value={mounted ? (pendingCount || 0).toLocaleString('hu-HU') : '—'}
        hint={
          !mounted
            ? 'Betöltés...'
            : (pendingCount || 0) === 0
              ? 'Nincs feltöltésre váró'
              : 'Feltöltésre vár'
        }
        Icon={CloudUpload}
        tone={(pendingCount || 0) > 0 ? 'amber' : 'slate'}
      />

      <KpiCard
        label="Konfliktus"
        value={mounted ? (conflictCount || 0).toLocaleString('hu-HU') : '—'}
        hint={
          !mounted
            ? 'Betöltés...'
            : (conflictCount || 0) === 0
              ? 'Nincs ütközés'
              : 'Feloldásra vár'
        }
        Icon={(conflictCount || 0) > 0 ? AlertTriangle : CheckCircle2}
        tone={(conflictCount || 0) > 0 ? 'red' : 'slate'}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPI kártya komponens
// ─────────────────────────────────────────────────────────────────

type ToneKey =
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'red'
  | 'orange'
  | 'sky'
  | 'slate'

interface KpiCardProps {
  label: string
  value: string
  hint: string
  Icon: LucideIcon
  iconSpinning?: boolean
  tone: ToneKey
}

const TONE_STYLES: Record<
  ToneKey,
  { iconBg: string; iconColor: string; valueColor: string }
> = {
  emerald: {
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    valueColor: 'text-emerald-700',
  },
  violet: {
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    valueColor: 'text-violet-700',
  },
  amber: {
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    valueColor: 'text-amber-700',
  },
  red: {
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    valueColor: 'text-red-700',
  },
  orange: {
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    valueColor: 'text-orange-700',
  },
  sky: {
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    valueColor: 'text-sky-700',
  },
  slate: {
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
    valueColor: 'text-slate-700',
  },
}

function KpiCard({ label, value, hint, Icon, iconSpinning, tone }: KpiCardProps) {
  const styles = TONE_STYLES[tone]

  return (
    <div className="card-raised group relative overflow-hidden p-4 transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.iconBg}`}
        >
          <HardDrive className="hidden" /> {/* placeholder for TS */}
          <Icon
            className={`h-5 w-5 ${styles.iconColor} ${iconSpinning ? 'animate-spin' : ''}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p
            className={`mt-0.5 font-heading text-2xl leading-none ${styles.valueColor}`}
          >
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  )
}
