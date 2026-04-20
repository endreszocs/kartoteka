'use client'

import { useState, useTransition } from 'react'

import { getDb, type SyncTrackedRecord } from '../db'
import { enqueue } from '../mutation-queue'
import { getSyncOrchestrator } from '../sync-orchestrator'

/**
 * useSyncMutation — offline-safe mutation hook.
 *
 * Ez a hook az offline-first write-ok központi pontja. A flow:
 *
 *  1. User kattint "Mentés"-re
 *  2. Optimistic Dexie write (azonnal látszik a UI-on)
 *  3. Mutation queue-ba helyezés
 *  4. Ha online, a sync orchestrator pump-ja hamarosan push-olja
 *  5. Siker → status: 'clean', Dexie rekord frissül szerver-válasszal
 *  6. Hiba/conflict → status jelzi, UI tud reagálni
 *
 * Használat:
 *   const { insert, update, remove, isPending, error } = useSyncMutation('szemely')
 *
 *   await insert({ csaladnev: 'Kiss', k_nev: 'János', congregation_id: ... })
 *   await update(42, { telefon: '+40 744 123 456' }, baseRevision)
 *   await remove(42, baseRevision)
 */

export interface UseSyncMutationResult {
  insert: (payload: Record<string, unknown>) => Promise<string | number | null>
  update: (
    id: string | number,
    changes: Record<string, unknown>,
    baseRevision: number,
  ) => Promise<void>
  remove: (id: string | number, baseRevision: number) => Promise<void>
  isPending: boolean
  error: string | null
  clearError: () => void
}

export function useSyncMutation(tableName: string): UseSyncMutationResult {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function insert(
    payload: Record<string, unknown>,
  ): Promise<string | number | null> {
    if (typeof window === 'undefined') {
      setError('Nem elérhető szerveren.')
      return null
    }

    return await new Promise<string | number | null>(resolve => {
      startTransition(async () => {
        try {
          const db = getDb()
          const dexieTable = db.table(tableName)

          // Client-oldali uuid/id generálás ha nincs
          // (a szerver Postgres auto-gen id-t ad vissza, ide client-id kell
          //  hogy a Dexie-ben már legyen rekord az optimistic write-hoz)
          // Kulcs: a szerver majd új id-vel válaszol, azt frissítjük
          let clientId = payload.id
          if (clientId === undefined || clientId === null) {
            clientId = generateClientId()
          }

          const optimisticRecord = {
            ...payload,
            id: clientId,
            revision: 0,
            updated_at: new Date().toISOString(),
            _syncStatus: 'pending' as const,
            _baseRevision: 0,
          }

          // Optimistic write
          await dexieTable.put(optimisticRecord as unknown as SyncTrackedRecord)

          // Queue
          await enqueue({
            table: tableName,
            op: 'insert',
            payload: { ...payload, id: clientId },
            baseRevision: null,
          })

          // Ha online, kézzel triggereljük a push-t (nem várunk a 30s timerre)
          const orchestrator = getSyncOrchestrator()
          if (orchestrator.isOnline()) {
            void orchestrator.pushAll()
          }

          setError(null)
          resolve(clientId as string | number)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          resolve(null)
        }
      })
    })
  }

  async function update(
    id: string | number,
    changes: Record<string, unknown>,
    baseRevision: number,
  ): Promise<void> {
    if (typeof window === 'undefined') return

    return await new Promise<void>(resolve => {
      startTransition(async () => {
        try {
          const db = getDb()
          const dexieTable = db.table(tableName)

          // Optimistic update Dexie-ben
          await dexieTable.update(id, {
            ...changes,
            _syncStatus: 'pending' as const,
            _baseRevision: baseRevision,
            updated_at: new Date().toISOString(),
          })

          // Queue
          await enqueue({
            table: tableName,
            op: 'update',
            payload: { id, ...changes },
            baseRevision,
          })

          const orchestrator = getSyncOrchestrator()
          if (orchestrator.isOnline()) {
            void orchestrator.pushAll()
          }

          setError(null)
          resolve()
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          resolve()
        }
      })
    })
  }

  async function remove(
    id: string | number,
    baseRevision: number,
  ): Promise<void> {
    if (typeof window === 'undefined') return

    return await new Promise<void>(resolve => {
      startTransition(async () => {
        try {
          const db = getDb()
          const dexieTable = db.table(tableName)

          // Optimistic delete flag (nem fizikai törlés Dexie-ben)
          await dexieTable.update(id, {
            _pendingDelete: true,
            _syncStatus: 'deleting' as const,
            _baseRevision: baseRevision,
          })

          await enqueue({
            table: tableName,
            op: 'delete',
            payload: { id },
            baseRevision,
          })

          const orchestrator = getSyncOrchestrator()
          if (orchestrator.isOnline()) {
            void orchestrator.pushAll()
          }

          setError(null)
          resolve()
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          resolve()
        }
      })
    })
  }

  return {
    insert,
    update,
    remove,
    isPending,
    error,
    clearError: () => setError(null),
  }
}

// ─────────────────────────────────────────────────────────────────
// Client-side id generátor
// ─────────────────────────────────────────────────────────────────

/**
 * Client-id generálás — UUID v4-szerű string.
 *
 * FONTOS: a kliens-oldali id-t a szerver NEM fogadja el (ha a tábla id mezője
 * auto-generated serial, mint a `szemely.id integer`). Ezért az insert sikere
 * után a szerver-válasz id-t kell beírni a Dexie-be (markSuccess csinálja).
 *
 * Ez az id CSAK a Dexie-beli ideiglenes rekord azonosítására szolgál.
 */
function generateClientId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `tmp_${crypto.randomUUID()}`
  }
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
