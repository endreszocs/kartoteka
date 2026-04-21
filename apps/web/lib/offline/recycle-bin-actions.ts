/**
 * Recycle Bin (Kuka) — soft-delete rekordok kezelése.
 *
 * Kliens-oldali függvények, amik a Dexie-n és a mutation_queue-n keresztül
 * működnek. A Supabase a végén eldönti, hogy mit tesz (soft-delete → deleted=true,
 * hard-delete → DELETE FROM).
 *
 * STANDALONE MÓDBAN (Fázis 7):
 * Ezek a függvények a Dexie-mutation-queue-t használják, ami a böngészőben él.
 * A standalone server-side SQLite mutation queue-ja külön rendszer.
 *
 * Az aktuális MVP-ben a Recycle bin műveletei a Dexie-ben optimisticként
 * mennek, és a következő havi sync során a felhőre kerülnek. **Ez működik
 * standalone módban is**, mert:
 *  - Dexie a böngésző cache, a UI azonnal frissül
 *  - A `useSyncMutation` és sync-orchestrator (Fázis 0-6) felelős a Dexie
 *    mutation-queue → Supabase push-ért
 *  - Standalone offline esetén a havi sync alatt push-olódnak fel
 *
 * NOTE: a következő iterációban (Fázis 8) javasolt a Dexie-mutation-queue +
 * SQLite-mutation-queue konvergens architektúra (egy queue, két reflektálás).
 *
 * Működés:
 *  - `listDeletedRecords(table, congregationId)` → lekéri a soft-deleted sorokat
 *  - `restoreRecord(table, id)` → deleted=false + _pendingDelete=false +
 *    enqueue update mutation
 *  - `hardDelete(table, id)` → fizikai törlés enqueue + Dexie-ből eltávolítás
 *  - `emptyBin(table, olderThanDays)` → bulk hard-delete
 *
 * Megjegyzések:
 *  - A 30 napnál régebbi soft-delete rekordokat a Supabase pg_cron automatikusan
 *    hard-delete-li. A user-oldali "Ürítés" gomb manuálisan is el tudja indítani.
 *  - A Dexie-ben a _pendingDelete flag + _syncStatus = 'deleting' állapot jelzi,
 *    hogy egy rekord törlés alatt áll — NEM kerül megjelenítésre a normál listákban.
 */

import { getDb } from './db'
import { enqueue } from './mutation-queue'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface DeletedRecordSummary {
  table: string
  id: string | number
  displayLabel: string
  deletedAt: string | null // updated_at a soft-delete időpontja
  daysUntilPurge: number | null // hány nap múlva törlődik véglegesen (null ha nem soft)
  record: Record<string, unknown>
}

/**
 * A szerver-oldali retention időtartam (napokban).
 * Ennél régebbi soft-deleted rekordokat a pg_cron hard-deletel.
 */
export const RECYCLE_BIN_RETENTION_DAYS = 30

// ─────────────────────────────────────────────────────────────────
// List — a Kuka tartalma egy táblára
// ─────────────────────────────────────────────────────────────────

export async function listDeletedRecords(
  table: string,
  congregationId: string | null,
  options?: {
    limit?: number
    labelBuilder?: (r: Record<string, unknown>) => string
  },
): Promise<DeletedRecordSummary[]> {
  const db = getDb()
  const dexieTable = db.table(table)

  // Minden deleted=true VAGY is_deleted=true (leltar_tetelek!) VAGY _pendingDelete=true
  // rekord scope-on belül
  const all = (await dexieTable
    .filter(r => {
      const rec = r as Record<string, unknown>
      const isDeleted =
        (rec.deleted as boolean) === true ||
        (rec.is_deleted as boolean) === true || // leltar_tetelek
        (rec._pendingDelete as boolean) === true
      if (!isDeleted) return false
      if (congregationId === null) return true
      const cid = rec.congregation_id as string | null | undefined
      if (cid === undefined || cid === null) return true
      return cid === congregationId
    })
    .limit(options?.limit || 500)
    .toArray()) as Array<Record<string, unknown>>

  const now = Date.now()

  return all.map(record => {
    const updatedAt = record.updated_at as string | null
    let daysUntilPurge: number | null = null
    if (updatedAt) {
      const deletedMs = new Date(updatedAt).getTime()
      if (Number.isFinite(deletedMs)) {
        const elapsedDays = (now - deletedMs) / (1000 * 60 * 60 * 24)
        daysUntilPurge = Math.max(
          0,
          Math.ceil(RECYCLE_BIN_RETENTION_DAYS - elapsedDays),
        )
      }
    }

    return {
      table,
      id: record.id as string | number,
      displayLabel: options?.labelBuilder
        ? options.labelBuilder(record)
        : `#${record.id ?? '?'}`,
      deletedAt: updatedAt,
      daysUntilPurge,
      record,
    }
  })
}

// ─────────────────────────────────────────────────────────────────
// Restore — egy soft-deleted rekord visszaállítása
// ─────────────────────────────────────────────────────────────────

export async function restoreRecord(
  table: string,
  id: string | number,
): Promise<void> {
  const db = getDb()
  const dexieTable = db.table(table)

  const record = await dexieTable.get(id)
  if (!record) throw new Error(`A(z) ${table}#${id} rekord nem található.`)

  const baseRevision = (record as { revision?: number }).revision ?? 0

  // leltar_tetelek tábla az `is_deleted` mezőt használja, nem a `deleted`-et
  const usesIsDeleted = table === 'leltar_tetelek'
  const deletedField = usesIsDeleted ? 'is_deleted' : 'deleted'

  // Optimistic Dexie update
  await dexieTable.update(id, {
    [deletedField]: false,
    _pendingDelete: false,
    _syncStatus: 'pending',
  })

  // Queue: update payload deleted=false
  const payload = {
    ...(record as Record<string, unknown>),
    id,
    [deletedField]: false,
  }
  delete (payload as Record<string, unknown>)._pendingDelete
  delete (payload as Record<string, unknown>)._syncStatus
  delete (payload as Record<string, unknown>)._baseRevision

  await enqueue({
    table,
    op: 'update',
    payload,
    baseRevision,
  })
}

// ─────────────────────────────────────────────────────────────────
// Hard delete — végleges törlés (DB-ből is)
// ─────────────────────────────────────────────────────────────────

export async function hardDelete(
  table: string,
  id: string | number,
): Promise<void> {
  const db = getDb()
  const dexieTable = db.table(table)

  const record = await dexieTable.get(id)
  if (!record) return

  const baseRevision = (record as { revision?: number }).revision ?? 0

  // Queue delete
  await enqueue({
    table,
    op: 'delete',
    payload: { id, _hardDelete: true }, // flag a push-nak
    baseRevision,
  })

  // Dexie fizikai törlés (a Supabase-en a push fog dönteni, hogy hard vagy soft)
  await dexieTable.delete(id)
}

// ─────────────────────────────────────────────────────────────────
// Empty bin — bulk hard-delete (user kattint „Kuka ürítése")
// ─────────────────────────────────────────────────────────────────

export async function emptyBin(
  table: string,
  congregationId: string | null,
  options?: {
    olderThanDays?: number
  },
): Promise<{ count: number }> {
  const deleted = await listDeletedRecords(table, congregationId, {
    limit: 10_000,
  })

  const threshold = options?.olderThanDays ?? 0
  const toDelete = deleted.filter(d => {
    if (threshold === 0) return true
    if (!d.deletedAt) return false
    const elapsedDays =
      (Date.now() - new Date(d.deletedAt).getTime()) /
      (1000 * 60 * 60 * 24)
    return elapsedDays >= threshold
  })

  let count = 0
  for (const d of toDelete) {
    try {
      await hardDelete(d.table, d.id)
      count += 1
    } catch (e) {
      console.error('[recycle-bin emptyBin]', e)
    }
  }
  return { count }
}
