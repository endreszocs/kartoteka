import { invoke } from '@tauri-apps/api/core'

/**
 * Lokális SQLCipher-titkosított SQLite elérés a Tauri desktop kliensben.
 *
 * **M2.2 állapot** (2026-04-23 óta): saját Rust-oldali implementáció
 * `rusqlite` + `bundled-sqlcipher` feature-rel. A M2.1-es `@tauri-apps/plugin-sql`
 * csomagot eltávolítottuk.
 *
 * - DB fájl: `%APPDATA%\com.erek.kartoteka\kartoteka.db` (Windows)
 * - Titkosítás: **SQLCipher**, statikus dev-kulccsal az M2.2-ben.
 *   Az M2.3-ban a kulcs a Stronghold kulcstárból jön.
 * - A Rust-oldali commandok: `db_execute(sql, params)` és `db_select(sql, params)`.
 *
 * A nyilvános API **nem változott az M2.1 óta** — a `dashboard-page.tsx`
 * ugyanazokat a helpereket hívja (`getSetting`, `setSetting`, `getAllSettings`,
 * `getOutboxStats`).
 *
 * ## Böngésző-mód vs Tauri-ablak
 *
 * A `invoke()` csak Tauri-ablakon belül működik. Ha a frontendet sima
 * böngészőben nyitod (`npm run desktop:vite`), a Rust commandok nem elérhetők,
 * és a hívások hibára futnak — ezeket a UI-oldal try/catch-sel kezeli.
 */

// ─────────────────────────────────────────────────────────────────────────
// Nyers Rust-hívások
// ─────────────────────────────────────────────────────────────────────────

/** JSON-kompatibilis érték, amit a Rust-oldali `db_execute/db_select` fogad. */
export type SqlParam =
  | string
  | number
  | boolean
  | null
  // A Rust `json_to_sql` a komplex értékeket (tömb, objektum) string-re dumpolja
  | Record<string, unknown>
  | unknown[]

/** DDL/DML hívás: visszaadja az érintett sorok számát. */
export async function dbExecute(sql: string, params: SqlParam[] = []): Promise<number> {
  return invoke<number>('db_execute', { sql, params })
}

/**
 * 2026-07-25 (F6.7): KÖTEGELT írás — UGYANAZ az SQL, `n` paraméter-sorral.
 *
 * A szinkron eddig soronként hívta a `dbExecute`-ot: külön IPC-kör és külön
 * tranzakció MINDEN sorra. Ez a hívás egyetlen körben, egyetlen tranzakcióban,
 * egyetlen előkészített utasítással írja be a köteget.
 *
 * ⚠️ ATOMIKUS: ha bármelyik sor hibázik, a TELJES köteg visszagördül (a Rust
 * oldalon a tranzakció rollback-el). Ezért a hívó soha nem kap félig beírt
 * állapotot — de azt sem feltételezheti, hogy a hiba előtti sorok bennmaradtak.
 *
 * A köteget darabokra bontjuk, hogy egy IPC-üzenet se legyen aránytalanul nagy,
 * és a haladás-jelzés is működhessen két darab között.
 */
export async function dbExecuteMany(
  sql: string,
  rows: SqlParam[][],
  opts: { chunkSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<number> {
  if (rows.length === 0) return 0
  const chunkSize = Math.max(1, opts.chunkSize ?? 500)
  let affected = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize)
    affected += await invoke<number>('db_execute_many', { sql, rows: slice })
    opts.onProgress?.(Math.min(i + chunkSize, rows.length), rows.length)
  }
  return affected
}

/**
 * SELECT hívás: visszaadja a sorokat objektum-tömbként.
 * A visszaadott `T` generikus — a hívó felelőssége az oszlopnevek + típusok
 * helyessége.
 */
export async function dbSelect<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T[]> {
  return invoke<T[]>('db_select', { sql, params })
}

/**
 * A lokális DB inicializálási állapotának lekérése.
 *
 * - `opened`: a Rust-oldali Connection megvan-e a DbState-ben (tehát a setup sikeres volt)
 * - `init_error`: ha a setup hibára futott, a teljes hiba-üzenet
 *
 * Böngészőben (npm run desktop:vite) a `invoke` nem elérhető → throw.
 */
export interface DbStatus {
  opened: boolean
  init_error: string | null
}

export async function getDbStatus(): Promise<DbStatus> {
  const res = await invoke<{ opened: boolean; init_error: string | null }>('db_status')
  return { opened: res.opened, init_error: res.init_error ?? null }
}

// ─────────────────────────────────────────────────────────────────────────
// Kényelmi helperek a `settings` táblához
// ─────────────────────────────────────────────────────────────────────────

export interface SettingRow {
  key: string
  value: string
  updated_at: string
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = await dbSelect<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?1',
    [key],
  )
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await dbExecute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?1, ?2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  )
}

export async function getAllSettings(): Promise<SettingRow[]> {
  return dbSelect<SettingRow>(
    'SELECT key, value, updated_at FROM settings ORDER BY key',
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Outbox — offline CRUD-sor
// ─────────────────────────────────────────────────────────────────────────

export interface OutboxStats {
  pending: number
  sent: number
  failed: number
  total: number
}

export async function getOutboxStats(): Promise<OutboxStats> {
  const rows = await dbSelect<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM outbox GROUP BY status`,
  )
  const stats: OutboxStats = { pending: 0, sent: 0, failed: 0, total: 0 }
  for (const r of rows) {
    const n = Number(r.n)
    stats.total += n
    if (r.status === 'pending') stats.pending = n
    else if (r.status === 'sent') stats.sent = n
    else if (r.status === 'failed') stats.failed = n
  }
  return stats
}
