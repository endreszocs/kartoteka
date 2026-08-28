/**
 * Recycle Bin (Kuka) — soft-delete rekordok kezelése.
 *
 * Kliens-oldali függvények, amik a Dexie-n és a mutation_queue-n keresztül
 * működnek. A Supabase a végén eldönti, hogy mit tesz (soft-delete → deleted=true,
 * hard-delete → DELETE FROM).
 *
 * Az aktuális MVP-ben a Recycle bin műveletei a Dexie-ben optimisticként
 * mennek, és a sync-orchestrator push-olja fel a Supabase-re:
 *  - Dexie a böngésző cache, a UI azonnal frissül
 *  - A `useSyncMutation` és sync-orchestrator felelős a Dexie
 *    mutation-queue → Supabase push-ért
 *
 * M6.3 (2026-04-22) óta a portable standalone SQLite-mutation-queue flow
 * kivezetve — csak Dexie + Supabase sync-et tartunk (web), vagy a Tauri
 * oldali SQLCipher-t (desktop, az M6.8+ után).
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

import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

import { getDb } from './db'
import { enqueue } from './mutation-queue'
import {
  purgeCountdownDays,
  RECYCLE_BIN_RETENTION_DAYS,
} from './recycle-bin-countdown'
import { getTableEntry } from './table-registry'

export { RECYCLE_BIN_RETENTION_DAYS }

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface DeletedRecordSummary {
  table: string
  id: string | number
  displayLabel: string
  /**
   * A törlés időpontja. PONTOS, ha a rekord hordozza a `deleted_at`-ot
   * (a 2026-08-14-kuka-deleted-at.sql triggere bélyegzi); egyébként az
   * `updated_at` — mivel a soft-delete maga is egy update, az LEGFELJEBB a
   * törlés időpontja lehet, a belőle számolt napszám tehát FELSŐ becslés.
   * Melyik eset áll fenn, azt a `deletedAtIsExact` mondja meg — a UI
   * becslésnél „legfeljebb N nap"-ot ír. A Kuka-nézet ezen felül a
   * szerverről is behúzza a pontos dátumot (fetchExactDeletedAt, fail-soft).
   */
  deletedAt: string | null
  deletedAtIsExact: boolean
  daysUntilPurge: number | null // hány nap múlva törlődhet véglegesen (null ha nem soft)
  record: Record<string, unknown>
}

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
    // Pontos dátum előnyben: ha a helyi másolat hordozza a deleted_at-ot
    // (jövőbeli pull-bővítés / desktop), abból számolunk; különben az
    // updated_at a felső becslés alapja.
    const exactDeletedAt = record.deleted_at as string | null | undefined
    const updatedAt = record.updated_at as string | null
    const deletedAt = exactDeletedAt ?? updatedAt

    return {
      table,
      id: record.id as string | number,
      displayLabel: options?.labelBuilder
        ? options.labelBuilder(record)
        : `#${record.id ?? '?'}`,
      deletedAt,
      deletedAtIsExact: Boolean(exactDeletedAt),
      daysUntilPurge: purgeCountdownDays(deletedAt, now),
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

  // P3-13 (audit 2026-08-28): a törölt PÉNZÜGYI tétel iratszáma időközben
  // ÚJRA KIADHATÓ volt — a visszaállítás duplikált iratszámot vagy 23505
  // ütközést szült, ÉS a zárt évbe is visszaállított. FAIL-CLOSED online
  // előellenőrzés: hálózat nélkül a pénzügyi visszaállítás nem fut.
  if (table === 'befizetes' || table === 'kiadas') {
    const rec = record as {
      congregation_id?: string
      iratszam?: string | null
      datum?: string | null
      bankszamla_id?: number | null
    }
    let elozetes:
      | { zart: boolean; duplikalt: boolean }
      | null = null
    try {
      const supabase = createBrowserSupabase()
      const ev = String(rec.datum || '').slice(0, 4)
      const [zarRes, dupRes] = await Promise.all([
        ev && rec.congregation_id
          ? supabase
              .from('bealitas')
              .select('accounting_finalized')
              .eq('id', ev)
              .eq('congregation_id', rec.congregation_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        rec.iratszam && rec.congregation_id
          ? supabase
              .from(table)
              .select('id')
              .eq('congregation_id', rec.congregation_id)
              .eq('iratszam', rec.iratszam)
              .eq('deleted', false)
              .neq('id', id)
              .limit(1)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (zarRes.error || dupRes.error) {
        throw new Error(zarRes.error?.message || dupRes.error?.message || 'ismeretlen hiba')
      }
      elozetes = {
        zart: Boolean((zarRes.data as { accounting_finalized?: boolean } | null)?.accounting_finalized),
        duplikalt: Array.isArray(dupRes.data) && dupRes.data.length > 0,
      }
    } catch (e) {
      throw new Error(
        `A pénzügyi tétel visszaállítása előtti ellenőrzés nem sikerült ` +
          `(${e instanceof Error ? e.message : 'nincs hálózat'}) — a visszaállítás ` +
          'biztonságból nem fut le. Próbáld újra online.',
      )
    }
    if (elozetes.zart) {
      throw new Error(
        `A tétel éve (${String(rec.datum || '').slice(0, 4)}) már véglegesítve van — ` +
          'a visszaállítás elmozdítaná a beküldött számadást. Kérj feloldást az egyházmegyétől.',
      )
    }
    if (elozetes.duplikalt) {
      throw new Error(
        `A(z) „${rec.iratszam}" iratszámot időközben egy másik aktív tétel használja — ` +
          'a visszaállítás duplikált iratszámot szülne. Előbb rendezd az élő tétel számát, ' +
          'vagy rögzítsd újra a tételt új számmal.',
      )
    }
  }

  const baseRevision = (record as { revision?: number }).revision ?? 0

  // 2026-08-14 (6. pont): a jelző-oszlop nevét a registry mondja meg — a
  // korábbi, itt bedrótozott `table === 'leltar_tetelek'` feltétel és a push
  // soft-delete ága széthúzhatott volna. Egy igazság-forrás van.
  const deletedField = getTableEntry(table)?.softDeleteColumn ?? 'deleted'

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
    /**
     * Pontos törlés-dátumok (`tábla:id` → deleted_at ISO), a Kuka-nézet
     * szerver-lekérdezéséből. Enélkül a helyi updated_at-becslés dönt, ami
     * FELÜLbecsüli a dátumot → a „30+ napos sorok" gomb kevesebbet törölne,
     * mint amennyit a sorokon mutatott pontos visszaszámláló ígér.
     */
    exactDeletedAt?: Record<string, string>
  },
): Promise<{ count: number }> {
  const deleted = await listDeletedRecords(table, congregationId, {
    limit: 10_000,
  })

  const threshold = options?.olderThanDays ?? 0
  const toDelete = deleted.filter(d => {
    if (threshold === 0) return true
    const exact = options?.exactDeletedAt?.[`${d.table}:${d.id}`]
    const deletedAt = exact ?? d.deletedAt
    if (!deletedAt) return false
    const elapsedDays =
      (Date.now() - new Date(deletedAt).getTime()) /
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
