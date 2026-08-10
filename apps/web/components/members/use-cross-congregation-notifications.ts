'use client'

/**
 * Hook a cross-congregation match notifikációk lekérdezésére.
 *
 * Két export:
 *   - useCrossCongregationNotifications — full lista + polling
 *   - useUnseenCrossCongregationCount — csak a számláló (bell-ikonhoz)
 *
 * A polling 60 másodpercenként frissít — a felhasználó tudja, ha új match érkezett —,
 * de CSAK amíg a böngészőfül látható; háttérben nem terheli a szervert (lásd a
 * `useVisibilityAwarePolling` melletti 2026-08-11-es megjegyzést).
 * A `markNotificationSeen` hívásával a notifikáció "látottá" válik.
 */

import { useCallback, useEffect, useState, useTransition } from 'react'

import {
  countUnseenCrossNotifications,
  listMyNotifications,
  markNotificationSeen,
  resolveCrossNotification,
  type CrossMatchNotification,
} from '@/lib/members/cross-congregation-actions'

const POLL_INTERVAL_MS = 60_000

/**
 * 2026-08-11 (K5 P3 #9) — JAVÍTVA: mindkét hook 60 másodpercenként POST-olt egy
 * server actiont akkor is, ha a böngészőfül a HÁTTÉRBEN volt. Egy egész napra
 * nyitva hagyott Tagnyilvántartás így ~480 fölösleges kérést küldött
 * felhasználónként — olyan adatért, amit a lelkész nem is lát.
 *
 * Mostantól a periodikus frissítés kihagyja a nem látható fület, és a fülre
 * visszatéréskor EGYSZER frissít, hogy az első pillantásra friss lista
 * fogadjon. Ugyanaz a minta, amit az offline szinkron-vezérlő is használ
 * (lib/offline/sync-orchestrator.ts:187-209).
 */
function useVisibilityAwarePolling(refresh: () => void, intervalMs: number) {
  useEffect(() => {
    refresh()

    const intervalId = setInterval(() => {
      // Háttérben lévő fül: nincs kérés — a visibilitychange úgyis frissít.
      if (document.visibilityState !== 'visible') return
      refresh()
    }, intervalMs)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh, intervalMs])
}

// ─── 1. Full notifications list + actions ─────────────────────────────────

export function useCrossCongregationNotifications() {
  const [notifications, setNotifications] = useState<CrossMatchNotification[]>([])
  const [isLoading, startLoading] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    startLoading(async () => {
      const result = await listMyNotifications()
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setNotifications(result.data)
        setError(null)
      }
    })
  }, [])

  useVisibilityAwarePolling(refresh, POLL_INTERVAL_MS)

  const handleMarkSeen = useCallback(
    async (id: string) => {
      const result = await markNotificationSeen(id)
      if (!result.error) {
        // Frissítjük a state-et: az adott notifikáció seen jelölést kap
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === id
              ? { ...n, seen_by_triggering_user_at: new Date().toISOString() }
              : n,
          ),
        )
      }
    },
    [],
  )

  const handleResolve = useCallback(
    async (id: string, resolution: 'same_person' | 'different_person' | 'dismissed') => {
      const result = await resolveCrossNotification(id, resolution)
      if (!result.error) {
        // Eltávolítjuk a listából
        setNotifications((prev) => prev.filter((n) => n.id !== id))
      }
      return result
    },
    [],
  )

  return {
    notifications,
    isLoading,
    error,
    refresh,
    markSeen: handleMarkSeen,
    resolve: handleResolve,
  }
}

// ─── 2. Számláló — bell-ikonhoz ───────────────────────────────────────────

export function useUnseenCrossCongregationCount() {
  const [count, setCount] = useState(0)
  const [isLoading, startLoading] = useTransition()

  const refresh = useCallback(() => {
    startLoading(async () => {
      const result = await countUnseenCrossNotifications()
      if (typeof result.data === 'number') {
        setCount(result.data)
      }
    })
  }, [])

  useVisibilityAwarePolling(refresh, POLL_INTERVAL_MS)

  return { count, isLoading, refresh }
}
