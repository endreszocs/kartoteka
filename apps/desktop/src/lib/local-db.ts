import Database from '@tauri-apps/plugin-sql'

/**
 * Lokális SQLite hozzáférés a Tauri desktop kliensben.
 *
 * **M2.1 állapot**: sima SQLite, a DB fájl az OS-specifikus app-data mappában
 * jön létre (Windows: `%APPDATA%\com.erek.kartoteka\kartoteka.db`).
 *
 * **M2.2+ terv**: SQLCipher cserélés — ugyanez az API marad, csak a Rust-oldal
 * cserélődik.
 *
 * **M2.3+ terv**: pull-sync + outbox-alapú push-sync integráció.
 *
 * ## Használat
 *
 * ```ts
 * const db = await getLocalDb()
 * const rows = await db.select<{ key: string; value: string }>(
 *   'SELECT key, value FROM settings',
 * )
 * await db.execute(
 *   'INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)',
 *   ['theme', 'dark'],
 * )
 * ```
 *
 * ## Tauri vs Vite dev-mód
 *
 * A `Database.load()` csak **Tauri-ablakban** fut — ha a felhasználó a
 * böngészőben nyitja (`npm run desktop:vite`), a Tauri-plugin-ek nem érhetők el,
 * és a hívás futtatáskor hibára fut. A `getLocalDb()` ezért lazy — csak akkor
 * terheli a plugint, amikor ténylegesen szükség van rá, és graceful-fail a
 * hívó oldalon egyszerűen try/catch-sel kezelhető.
 */

type SqlDatabase = Awaited<ReturnType<typeof Database.load>>

const DB_URL = 'sqlite:kartoteka.db'
let cached: Promise<SqlDatabase> | null = null

export async function getLocalDb(): Promise<SqlDatabase> {
  if (!cached) {
    cached = Database.load(DB_URL)
  }
  return cached
}

// ─────────────────────────────────────────────────────────────────────────
// Kényelmi helperek a `settings` táblához — tipikus "utolsó sync időpontja"
// vagy "user beállítás" jellegű értékek tárolására.
// ─────────────────────────────────────────────────────────────────────────

export interface SettingRow {
  key: string
  value: string
  updated_at: string
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getLocalDb()
  const rows = await db.select<Array<Pick<SettingRow, 'value'>>>(
    'SELECT value FROM settings WHERE key = $1',
    [key],
  )
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getLocalDb()
  await db.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  )
}

export async function getAllSettings(): Promise<SettingRow[]> {
  const db = await getLocalDb()
  return db.select<SettingRow[]>(
    'SELECT key, value, updated_at FROM settings ORDER BY key',
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Outbox — offline CRUD-sor, M2.3-ban tölt fel tényleges használattal
// ─────────────────────────────────────────────────────────────────────────

export interface OutboxStats {
  pending: number
  sent: number
  failed: number
  total: number
}

export async function getOutboxStats(): Promise<OutboxStats> {
  const db = await getLocalDb()
  const rows = await db.select<Array<{ status: string; n: number }>>(
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
