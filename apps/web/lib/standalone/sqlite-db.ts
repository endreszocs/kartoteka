/**
 * SQLite lokális adatbázis singleton + migrációs rendszer.
 *
 * CSAK STANDALONE módban használható (Node.js server-side, a lelkész saját
 * gépén). A webes/Railway deploymentben ez a modul nem töltődik be.
 *
 * Az adatbázis a `<app-root>/data/kartoteka.db` fájlban található.
 * WAL mode + synchronous=NORMAL, ami crash-safe és gyors.
 *
 * Migráció: a `sqlite-migrations/vN.sql` fájlok verzió-alapon lefutnak.
 * A `_migrations` táblában tároljuk, hogy melyik verzió futott le már.
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

import { getDataDir, isStandaloneMode } from './runtime-detect'

// ─────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────

let dbInstance: Database.Database | null = null

/**
 * Visszaadja a SQLite kapcsolatot. Elsőként hívva megnyitja a DB-t,
 * és lefuttatja a szükséges migrációkat.
 *
 * CSAK standalone módban hívható — server-oldalon kivételt dob.
 */
export function getSqliteDb(): Database.Database {
  if (!isStandaloneMode()) {
    throw new Error(
      'getSqliteDb() csak STANDALONE módban elérhető. ' +
        'Server módban a Supabase-t használjuk (lib/supabase/client.ts).',
    )
  }

  if (dbInstance) return dbInstance

  const dataDir = getDataDir()
  const dbPath = path.join(dataDir, 'kartoteka.db')

  // Megnyitás (létrehozza ha nincs)
  dbInstance = new Database(dbPath)

  // Crash-safe mode
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('synchronous = NORMAL')
  dbInstance.pragma('foreign_keys = OFF')
  dbInstance.pragma('busy_timeout = 5000')

  // Migrációk
  runMigrations(dbInstance)

  return dbInstance
}

/**
 * A DB integrity check-je.
 * `PRAGMA integrity_check` → 'ok' vagy hibalista.
 *
 * Indításkor és sync előtt hívandó.
 */
export function checkIntegrity(): { ok: boolean; errors: string[] } {
  const db = getSqliteDb()
  const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>
  const messages = result.map(r => r.integrity_check)
  const ok = messages.length === 1 && messages[0] === 'ok'
  return { ok, errors: ok ? [] : messages }
}

/**
 * Lezárja a DB-t. Általában csak tesztekhez vagy app shutdown-nál kell.
 */
export function closeSqliteDb(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

// ─────────────────────────────────────────────────────────────────
// Migráció
// ─────────────────────────────────────────────────────────────────

interface MigrationRecord {
  version: number
  applied_at: string
}

function runMigrations(db: Database.Database): void {
  // _migrations tábla létrehozása
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const currentVersion =
    (db.prepare('SELECT MAX(version) as v FROM _migrations').get() as
      | { v: number | null }
      | undefined)?.v ?? 0

  const migrationsDir = path.join(
    process.cwd(),
    'lib',
    'standalone',
    'sqlite-migrations',
  )

  if (!fs.existsSync(migrationsDir)) {
    console.warn(
      `[sqlite-db] A migrations mappa nem található: ${migrationsDir}. ` +
        'A build folyamat valószínűleg nem másolta át.',
    )
    return
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => /^v\d+\.sql$/.test(f))
    .sort((a, b) => {
      const versionA = parseInt(a.match(/^v(\d+)/)![1], 10)
      const versionB = parseInt(b.match(/^v(\d+)/)![1], 10)
      return versionA - versionB
    })

  for (const file of files) {
    const version = parseInt(file.match(/^v(\d+)/)![1], 10)
    if (version <= currentVersion) continue

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')

    console.log(`[sqlite-db] Migration futtatása: v${version} (${file})`)

    try {
      // Atomikus migráció (ha valahol elhasal, a db konzisztens marad)
      const runMigration = db.transaction(() => {
        db.exec(sql)
        db.prepare(
          'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)',
        ).run(version, new Date().toISOString())
      })
      runMigration()
      console.log(`[sqlite-db] ✅ v${version} sikeres`)
    } catch (e) {
      console.error(`[sqlite-db] ❌ Migration v${version} sikertelen:`, e)
      throw new Error(
        `SQLite migration v${version} sikertelen: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Lekérdezési helpers (typed)
// ─────────────────────────────────────────────────────────────────

/**
 * Egyetlen sor lekérése PK alapján.
 */
export function getById<T = Record<string, unknown>>(
  table: string,
  id: string | number,
): T | null {
  const db = getSqliteDb()
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    | T
    | undefined
  return row || null
}

/**
 * Scope-szűrt lista lekérése.
 */
export function listByCongregation<T = Record<string, unknown>>(
  table: string,
  congregationId: string,
  opts?: { limit?: number; orderBy?: string; onlyActive?: boolean },
): T[] {
  const db = getSqliteDb()
  const limit = opts?.limit ?? 10_000
  const orderBy = opts?.orderBy ?? 'id DESC'
  const deletedFilter = opts?.onlyActive ? 'AND (deleted IS NULL OR deleted = 0)' : ''

  // SQL injection védelem: csak a whitelist-es táblákra engedjük
  const whitelist = ['szemely', 'csalad', 'presbiter', 'gyerek', 'felmentes',
    'befizetes', 'kiadas', 'bankszamlak', 'belsomozgas', 'berleti_szerzodes',
    'keresztseg', 'konfirmalas', 'hazassag', 'temetes', 'munkanaplo',
    'iktato', 'iktato_sablonok', 'leltar_tetelek',
    'sirhelytemeto', 'sirhely', 'sirhelyberles', 'sirhelyelhunyt',
    'presbiteri_jegyzokonyvek', 'jegyzokonyv_resztvevok',
    'jegyzokonyv_napirendi_pontok', 'jegyzokonyv_hatarozatok']
  if (!whitelist.includes(table)) {
    throw new Error(`listByCongregation: ismeretlen tábla: ${table}`)
  }

  return db
    .prepare(
      `SELECT * FROM ${table}
       WHERE congregation_id = ? ${deletedFilter}
       ORDER BY ${orderBy}
       LIMIT ?`,
    )
    .all(congregationId, limit) as T[]
}

/**
 * Upsert (SQLite INSERT OR REPLACE) — a sync-pull-nál használjuk
 * a Supabase rekordok helyi tükrözésére.
 */
export function upsertRecord(
  table: string,
  record: Record<string, unknown>,
): void {
  const db = getSqliteDb()
  const keys = Object.keys(record)
  const placeholders = keys.map(() => '?').join(', ')
  const columns = keys.map(k => `"${k}"`).join(', ')
  const values = keys.map(k => {
    const v = record[k]
    // SQLite nem ismeri a boolean-t: INTEGER 0/1 kell
    if (typeof v === 'boolean') return v ? 1 : 0
    // null/undefined egyformán null
    if (v === null || v === undefined) return null
    // Object/array → JSON string
    if (typeof v === 'object' && !(v instanceof Date)) {
      return JSON.stringify(v)
    }
    if (v instanceof Date) return v.toISOString()
    return v
  })
  db.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`,
  ).run(...(values as (string | number | null)[]))
}

/**
 * Egy MigrationRecord utility — milyen verziók futottak már le.
 */
export function listAppliedMigrations(): MigrationRecord[] {
  const db = getSqliteDb()
  return db
    .prepare('SELECT version, applied_at FROM _migrations ORDER BY version')
    .all() as MigrationRecord[]
}
