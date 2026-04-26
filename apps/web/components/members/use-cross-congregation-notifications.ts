'use client'

/**
 * Hook a cross-congregation match notifikációk lekérdezésére.
 *
 * Két export:
 *   - useCrossCongregationNotifications — full lista + polling
 *   - useUnseenCrossCongregationCount — csak a számláló (bell-ikonhoz)
 *
 * A polling 60 másodpercenként frissít — a felhasználó tudja, ha új match érkezett.
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

  useEffect(() => {
    refresh()
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [refresh])

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

  useEffect(() => {
    refresh()
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [refresh])

  return { count, isLoading, refresh }
}
