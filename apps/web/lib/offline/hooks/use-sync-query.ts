'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'

import { getDb } from '../db'
import { getSyncOrchestrator } from '../sync-orchestrator'

/**
 * useSyncQuery — stale-while-revalidate React hook.
 *
 * Ez a hook a KARTOTEKA offline-first réteg központi olvasó-pontja.
 *
 * Mit csinál:
 *  1. A Dexie-ből olvas (instant — cache hit)
 *  2. Háttérben pull-t indít (ha online + stale)
 *  3. A Dexie `useLiveQuery` reaktívan frissíti a UI-t, amint a pull
 *     új adatot ír be
 *
 * Használat:
 *   const persons = useSyncQuery<SzemelyRecord>('szemely', (t) =>
 *     t.where('congregation_id').equals(congId).and(p => !p._pendingDelete)
 *   )
 *   if (persons === undefined) return <Spinner />  // első load
 *   return <List items={persons} />
 *
 * @param tableName - A Dexie tábla neve (lásd table-registry)
 * @param queryFn - Dexie query builder callback
 * @param options.staleMs - Milyen gyakran frissüljön pull-lal (default: 30s)
 * @param options.revalidateOnMount - Ha true (default), mount-kor pull-ol
 */

export interface UseSyncQueryOptions {
  staleMs?: number
  revalidateOnMount?: boolean
}

export function useSyncQuery<T = unknown>(
  tableName: string,
  queryFn?: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: any,
  ) => {
    toArray: () => Promise<T[]>
  },
  options: UseSyncQueryOptions = {},
): T[] | undefined {
  const { staleMs = 30_000, revalidateOnMount = true } = options
  const lastPullRef = useRef<number>(0)

  // Dexie live query — reaktív
  const data = useLiveQuery(
    async (): Promise<T[]> => {
      // Server-side safety — Dexie csak kliensen
      if (typeof window === 'undefined') return []
      if (tableName === '__noop__') return []
      const db = getDb()
      const dexieTable = db.table(tableName)
      if (queryFn) {
        const result = queryFn(dexieTable as unknown as typeof db.szemely)
        return (await result.toArray()) as unknown as T[]
      }
      return (await dexieTable.toArray()) as unknown as T[]
    },
    [tableName],
  ) as T[] | undefined

  // Background pull — stale-while-revalidate
  useEffect(() => {
    if (!revalidateOnMount) return
    if (typeof window === 'undefined') return

    const now = Date.now()
    if (now - lastPullRef.current < staleMs) return
    lastPullRef.current = now

    const orchestrator = getSyncOrchestrator()
    if (!orchestrator.isOnline()) return
    if (!orchestrator.isActive()) return

    void orchestrator.pullTable(tableName)
  }, [tableName, revalidateOnMount, staleMs])

  return data
}

/**
 * useSyncCount — egy tábla rekord-számát adja vissza (reaktív).
 *
 * Használat:
 *   const pending = useSyncCount('_mutation_queue', (q) =>
 *     q.where('status').equals('pending').count()
 *   )
 */
export function useSyncCount(
  tableName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  countFn?: (table: any) => Promise<number>,
): number | undefined {
  return useLiveQuery(
    async (): Promise<number> => {
      // No-op sentinel: ha a hívó még nem akar query-t futtatni (pl. SSR guard)
      if (tableName === '__noop__') return 0
      // Server-side safety — Dexie csak kliensen
      if (typeof window === 'undefined') return 0
      const db = getDb()
      const dexieTable = db.table(tableName)
      if (countFn) return await countFn(dexieTable)
      return await dexieTable.count()
    },
    [tableName],
  ) as number | undefined
}
