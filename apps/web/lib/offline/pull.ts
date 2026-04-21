/**
 * Pull sync — Supabase → Dexie delta sync.
 *
 * Minden sync-tracked táblára működik:
 *  1. Lekérjük a lastPullAt cursor-t a _sync_meta-ból
 *  2. Supabase query: WHERE updated_at > lastPullAt AND congregation_id = scope
 *  3. Bulk upsert Dexie-be (minden rekordnál `_syncStatus = 'clean'`)
 *  4. Frissítjük a cursor-t (most-időponthoz)
 *
 * Fontos: a kliens-oldali Supabase client az `@supabase/ssr` createBrowserClient-tel
 * készül — automatikusan használja a session cookie-t, RLS-sel védve.
 */

import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { getDb, getSyncMeta, setSyncMeta, type SyncTrackedRecord } from './db'
import {
  TABLE_REGISTRY,
  getTableEntry,
  type TableRegistryEntry,
} from './table-registry'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface PullResult {
  table: string
  pulledCount: number
  cursorFrom: string | null
  cursorTo: string
  error?: string
}

// ─────────────────────────────────────────────────────────────────
// Egyetlen tábla pull-olása
// ─────────────────────────────────────────────────────────────────

/**
 * Egyetlen tábla delta pull-ja. Visszaadja, hány új/módosult rekord jött le.
 *
 * Ha `lastPullAt` null (első pull), a teljes táblát letölti.
 * Egyébként: csak a `updated_at > lastPullAt` rekordokat.
 *
 * Idempotens — ismételt futtatás ugyanazzal a cursor-ral ugyanazt adja.
 */
export async function pullTable(
  entry: TableRegistryEntry,
  congregationId: string,
): Promise<PullResult> {
  const db = getDb()
  const supabase = createBrowserSupabase()

  const meta = await getSyncMeta(entry.dexieTable, congregationId)
  const cursorFrom = meta.lastPullAt
  const cursorTo = new Date().toISOString()

  // Query felépítése
  let query = supabase.from(entry.supabaseTable).select(entry.select || '*')

  if (entry.scopeFilter === 'congregation_id') {
    query = query.eq('congregation_id', congregationId)
  }

  if (cursorFrom) {
    query = query.gt('updated_at', cursorFrom)
  }

  // Soft-delete is szinkronizálódik (a kliens oldalon kell tudni)
  // NEM szűrünk a deleted=false-ra — hagyjuk, hogy a Dexie-be kerüljön,
  // hogy a Kuka view is lássa őket

  const { data, error } = await query

  if (error) {
    return {
      table: entry.dexieTable,
      pulledCount: 0,
      cursorFrom,
      cursorTo,
      error: error.message,
    }
  }

  const rows = (data || []) as unknown as Array<Record<string, unknown>>
  if (rows.length === 0) {
    // Nincs változás — csak a cursor-t frissítjük
    await setSyncMeta({ ...meta, lastPullAt: cursorTo, lastError: null })
    return { table: entry.dexieTable, pulledCount: 0, cursorFrom, cursorTo }
  }

  // Dexie upsert — minden rekord `_syncStatus = 'clean'`-nel
  const dexieTable = db.table(entry.dexieTable)
  const enriched = rows.map(row => ({
    ...row,
    _syncStatus: 'clean' as const,
    _baseRevision: (row.revision as number) || 0,
  }))

  await db.transaction('rw', dexieTable, async () => {
    await dexieTable.bulkPut(enriched as unknown as SyncTrackedRecord[])
  })

  // Cursor frissítés
  await setSyncMeta({
    ...meta,
    lastPullAt: cursorTo,
    lastError: null,
  })

  return { table: entry.dexieTable, pulledCount: rows.length, cursorFrom, cursorTo }
}

// ─────────────────────────────────────────────────────────────────
// Minden tábla pull-ja (orchestrator hívja)
// ─────────────────────────────────────────────────────────────────

export interface PullAllResult {
  totalPulled: number
  byTable: PullResult[]
  errors: Array<{ table: string; error: string }>
}

export async function pullAllTables(congregationId: string): Promise<PullAllResult> {
  const byTable: PullResult[] = []
  const errors: Array<{ table: string; error: string }> = []
  let totalPulled = 0

  // Prioritás szerint (szemely előbb, mint befizetes — az FK miatt)
  const sorted = [...TABLE_REGISTRY].sort((a, b) => a.priority - b.priority)

  for (const entry of sorted) {
    const result = await pullTable(entry, congregationId)
    byTable.push(result)
    if (result.error) {
      errors.push({ table: entry.dexieTable, error: result.error })
    } else {
      totalPulled += result.pulledCount
    }
  }

  return { totalPulled, byTable, errors }
}

// ─────────────────────────────────────────────────────────────────
// Egy konkrét tábla pull-olása név alapján
// ─────────────────────────────────────────────────────────────────

export async function pullByTableName(
  tableName: string,
  congregationId: string,
): Promise<PullResult> {
  const entry = getTableEntry(tableName)
  if (!entry) {
    return {
      table: tableName,
      pulledCount: 0,
      cursorFrom: null,
      cursorTo: new Date().toISOString(),
      error: `Ismeretlen tábla: ${tableName}`,
    }
  }
  return await pullTable(entry, congregationId)
}
