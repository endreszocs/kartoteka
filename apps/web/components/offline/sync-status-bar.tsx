'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  WifiOff,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useOnlineStatus } from '@/lib/offline/hooks/use-online-status'
import { useSyncCount } from '@/lib/offline/hooks/use-sync-query'
import {
  getSyncOrchestrator,
  type SyncEvent,
} from '@/lib/offline/sync-orchestrator'

/**
 * Sync Status Bar — a képernyő tetején megjelenő fix sáv, ami a sync
 * állapotát mutatja.
 *
 * Állapotok:
 *  - ✓ Zöld: online, minden szinkronizálva
 *  - ⟳ Kék (animált): éppen sync fut
 *  - ⟲ Sárga: pending változások vannak
 *  - ⊗ Narancssárga: offline
 *  - ⚠ Piros: konfliktus van
 *  - ✗ Piros: sync hiba
 *
 * A kliens-oldali Dexie `_mutation_queue`-ból valós időben olvassa
 * a pending és conflict sorszámot.
 */
export function SyncStatusBar() {
  // SSR hydration biztonság: a komponens csak a client-side mount után renderel.
  // Enélkül a `navigator.onLine` + `useLiveQuery` különböző értékekkel futna
  // szerver és kliens oldalon, ami hydration mismatch-hez vezetne.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const isOnline = useOnlineStatus()
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [manualSyncing, setManualSyncing] = useState(false)

  // Valós idejű pending / conflict count (csak mount után fut a Dexie lekérdezés)
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

  // Feliratkozás az orchestrator event-jeire
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!mounted) return
    const orchestrator = getSyncOrchestrator()

    const unsubscribe = orchestrator.subscribe((event: SyncEvent) => {
      switch (event.type) {
        case 'pull_started':
        case 'push_started':
          setSyncing(true)
          break
        case 'pull_completed':
        case 'push_completed':
          setSyncing(false)
          setLastError(null)
          break
        case 'pull_error':
        case 'push_error':
          setSyncing(false)
          setLastError(event.error || 'Ismeretlen hiba')
          break
      }
    })
    return unsubscribe
  }, [mounted])

  // SSR safety: semmi nem renderelődik, amíg a client nem mount-olt
  if (!mounted) return null

  async function handleManualSync() {
    setManualSyncing(true)
    try {
      const orchestrator = getSyncOrchestrator()
      await orchestrator.syncNow()
    } finally {
      setManualSyncing(false)
    }
  }

  // Status meghatározás
  const { icon: Icon, label, color } = getStatusVisuals({
    isOnline,
    syncing: syncing || manualSyncing,
    pending: pendingCount || 0,
    conflicts: conflictCount || 0,
    hasError: !!lastError,
  })

  // Ha minden zöld és nincs semmi különleges → rejtjük (tiszta UI)
  const shouldShow =
    !isOnline ||
    syncing ||
    manualSyncing ||
    (pendingCount || 0) > 0 ||
    (conflictCount || 0) > 0 ||
    !!lastError

  if (!shouldShow) return null

  return (
    <div
      className={`fixed top-2 right-2 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm ${color} max-w-[calc(100vw-1rem)]`}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${syncing || manualSyncing ? 'animate-spin' : ''}`}
      />
      <span className="flex-1 font-medium">{label}</span>

      {(pendingCount || 0) > 0 && (
        <span className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] font-semibold">
          {pendingCount} várakozó
        </span>
      )}
      {(conflictCount || 0) > 0 && (
        <span className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] font-semibold">
          {conflictCount} konfliktus
        </span>
      )}

      {isOnline && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs hover:bg-white/30"
          onClick={handleManualSync}
          disabled={manualSyncing || syncing}
        >
          <RefreshCw
            className={`mr-1 h-3 w-3 ${manualSyncing ? 'animate-spin' : ''}`}
          />
          Szinkronizálás
        </Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Status calc
// ─────────────────────────────────────────────────────────────────

function getStatusVisuals({
  isOnline,
  syncing,
  pending,
  conflicts,
  hasError,
}: {
  isOnline: boolean
  syncing: boolean
  pending: number
  conflicts: number
  hasError: boolean
}) {
  if (conflicts > 0) {
    return {
      icon: AlertCircle,
      label: 'Konfliktus — felhasználói beavatkozás szükséges',
      color: 'border-red-200 bg-red-50 text-red-800',
    }
  }

  if (hasError && !syncing) {
    return {
      icon: XCircle,
      label: 'Szinkron hiba — próbáld újra',
      color: 'border-red-200 bg-red-50 text-red-800',
    }
  }

  if (!isOnline) {
    return {
      icon: WifiOff,
      label: 'Offline mód — a változások helyben mentődnek',
      color: 'border-amber-200 bg-amber-50 text-amber-900',
    }
  }

  if (syncing) {
    return {
      icon: RefreshCw,
      label: 'Szinkronizálás folyamatban...',
      color: 'border-sky-200 bg-sky-50 text-sky-800',
    }
  }

  if (pending > 0) {
    return {
      icon: CloudOff,
      label: 'Feltöltésre váró változások',
      color: 'border-amber-200 bg-amber-50 text-amber-900',
    }
  }

  return {
    icon: CheckCircle2,
    label: 'Szinkronizálva',
    color: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
}
