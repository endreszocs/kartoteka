'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react'

import { useOnlineStatus } from '@/lib/offline/hooks/use-online-status'
import { useSyncCount } from '@/lib/offline/hooks/use-sync-query'
import {
  getSyncOrchestrator,
  type SyncEvent,
} from '@/lib/offline/sync-orchestrator'
import { isStandaloneMode } from '@/lib/standalone/is-standalone-client'

/**
 * Kis, kompakt badge az "Offline mentés" dropdown menüpont jobb oldalára.
 *
 * 5 állapot (prioritás szerint — a legkritikusabb mindig nyer):
 *  1. Konfliktus → piros "⚠ N"
 *  2. Offline → narancssárga "Offline"
 *  3. Pending változás → amber "N"
 *  4. Szinkronizálás → kék forgó ikon
 *  5. Rendben → semmit se mutat (clean UI)
 *
 * Ha minden rendben van, **nem** rendel semmit → a menüpont tiszta marad.
 */
export function OfflineMenuItemBadge() {
  // SSR safety (mount guard)
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

  if (!mounted) return null

  // Standalone módban a LicenseBanner kezeli a sync-állapot kommunikációt —
  // ne mutassuk az "Offline" badge-et, ami félrevezetné a usert (standalone-ban
  // az offline a NORMÁL állapot, nem hibajelzés).
  if (isStandaloneMode()) return null

  // Prioritás: konfliktus > offline > pending > syncing > clean
  if ((conflictCount || 0) > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
        <AlertTriangle className="size-2.5" />
        {conflictCount}
      </span>
    )
  }

  if (!isOnline) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
        <CloudOff className="size-2.5" />
        Offline
      </span>
    )
  }

  if ((pendingCount || 0) > 0) {
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 tabular-nums">
        {pendingCount}
      </span>
    )
  }

  if (syncing) {
    return (
      <span className="inline-flex items-center rounded-full bg-sky-100 p-1 text-sky-700">
        <RefreshCw className="size-2.5 animate-spin" />
      </span>
    )
  }

  // Minden rendben — semmit nem renderelünk (clean menu)
  return null
}
