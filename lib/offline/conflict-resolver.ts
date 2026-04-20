/**
 * Conflict resolver — a user döntése után a _conflicts rekordot feloldja.
 *
 * Három feloldási mód:
 *  - 'keep_local': a user a saját változtatását akarja tartani → új queue
 *    mutation a szerver-oldali friss revision-nel
 *  - 'keep_server': a user elfogadja a szerver-oldali állapotot → Dexie
 *    frissül a serverPayload-dal
 *  - 'manual_merge': a user egy custom payload-ot ad meg → új queue mutation
 *
 * Client-side, mert a Dexie + sync orchestrator rendszerben fut.
 */

import { getDb } from './db'
import { enqueue } from './mutation-queue'
import { getSyncOrchestrator } from './sync-orchestrator'

export type ResolutionStrategy = 'keep_local' | 'keep_server' | 'manual_merge'

export interface ResolveConflictInput {
  table: string
  rowId: string
  strategy: ResolutionStrategy
  /** Csak manual_merge esetén: a user által kézzel merged payload */
  mergedPayload?: Record<string, unknown>
}

export async function resolveConflict(
  input: ResolveConflictInput,
): Promise<{ success: true } | { error: string }> {
  if (typeof window === 'undefined') {
    return { error: 'A resolver csak kliens-oldalon fut.' }
  }

  const db = getDb()
  const conflict = await db._conflicts.get([input.table, input.rowId])
  if (!conflict) return { error: 'A konfliktus-rekord nem található.' }

  const rowIdTyped = input.rowId as string | number
  const dexieTable = db.table(input.table)

  try {
    switch (input.strategy) {
      case 'keep_server': {
        // Dexie-t frissítjük a szerver-oldali payload-dal
        await dexieTable.put({
          ...conflict.serverPayload,
          _syncStatus: 'clean' as const,
          _baseRevision: (conflict.serverPayload.revision as number) || 0,
        })
        break
      }

      case 'keep_local':
      case 'manual_merge': {
        // Új mutation queue-ba — a szerver-oldali új revision-nel
        const newBaseRevision =
          (conflict.serverPayload.revision as number) || 0

        const finalPayload =
          input.strategy === 'manual_merge'
            ? { ...input.mergedPayload, id: rowIdTyped }
            : { ...conflict.localPayload, id: rowIdTyped }

        // Dexie — optimistic update a user kívánt állapotra
        await dexieTable.put({
          ...finalPayload,
          _syncStatus: 'pending' as const,
          _baseRevision: newBaseRevision,
        })

        // Új queue mutation az új baseRevision-nel
        await enqueue({
          table: input.table,
          op: 'update',
          payload: finalPayload,
          baseRevision: newBaseRevision,
        })

        // Trigger push (ha online)
        const orchestrator = getSyncOrchestrator()
        if (orchestrator.isOnline()) {
          void orchestrator.pushAll()
        }
        break
      }
    }

    // Conflict rekord megoldottra állítása
    await db._conflicts.update([input.table, input.rowId], { resolved: true })

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Konfliktus eldobása — ha a user feladja, töröljük a _conflicts rekordot
 * ÉS visszaállítjuk a Dexie rekordot clean állapotra (a szerver-pull
 * majd visszahozza a tényleges állapotot).
 */
export async function dismissConflict(
  table: string,
  rowId: string,
): Promise<{ success: true } | { error: string }> {
  if (typeof window === 'undefined') {
    return { error: 'Csak kliens-oldalon fut.' }
  }

  const db = getDb()
  try {
    await db._conflicts.delete([table, rowId])
    const dexieTable = db.table(table)
    await dexieTable.update(rowId as string | number, {
      _syncStatus: 'clean' as const,
    })
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
