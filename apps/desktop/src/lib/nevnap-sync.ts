/**
 * Névnap-katalógus szinkron (2026-06-12, Endre #5 — dashboard-paritás).
 *
 * A webes irányítópult „Ma köszöntjük" kártyája és hero-banner névnap-chipje
 * a `nevnap` táblából él (országos, statikus katalógus: 366 sor, nap szerinti
 * nev1/nev2/nev3). A desktopon eddig ez az adat hiányzott — a kártya nem tudta
 * a mai névnapokat, sem a névnapos tagokat mutatni.
 *
 * Minta: `finance-settings-sync.ts` — TS-oldali CREATE TABLE IF NOT EXISTS
 * (nincs Rust-migráció) + pull + getLocal* olvasó.
 */

import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect } from './local-db'

export interface NevnapLocalRow {
  honap: string
  nap: string
  nev1: string | null
  nev2: string | null
  nev3: string | null
}

async function ensureNevnapTable(): Promise<void> {
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS nevnap_local (
       honap TEXT NOT NULL,
       nap TEXT NOT NULL,
       nev1 TEXT,
       nev2 TEXT,
       nev3 TEXT,
       synced_at TEXT,
       PRIMARY KEY (honap, nap)
     )`,
  )
}

export interface PullNevnapResult {
  success: boolean
  pulled: number
  error?: string
}

/**
 * A teljes névnap-katalógus letöltése a lokális cache-be. Globális tábla
 * (nincs congregation_id-szűrés), ezért nem kell user-kontextus. A katalógus
 * statikus — elég a full-bundle ütemben (5 percenként) frissíteni.
 */
export async function pullNevnapCatalog(): Promise<PullNevnapResult> {
  try {
    await ensureNevnapTable()
    const supabase = getDesktopSupabase()
    const { data, error } = await supabase
      .from('nevnap')
      .select('nev1, nev2, nev3, honap, nap')
    if (error) return { success: false, pulled: 0, error: error.message }

    let pulled = 0
    for (const row of data || []) {
      const r = row as Record<string, unknown>
      await dbExecute(
        `INSERT INTO nevnap_local (honap, nap, nev1, nev2, nev3, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(honap, nap) DO UPDATE SET
           nev1 = excluded.nev1,
           nev2 = excluded.nev2,
           nev3 = excluded.nev3,
           synced_at = datetime('now')`,
        [
          String(r.honap ?? ''),
          String(r.nap ?? ''),
          (r.nev1 as string | null) ?? null,
          (r.nev2 as string | null) ?? null,
          (r.nev3 as string | null) ?? null,
        ],
      )
      pulled++
    }
    return { success: true, pulled }
  } catch (err) {
    return { success: false, pulled: 0, error: err instanceof Error ? err.message : 'ismeretlen' }
  }
}

/**
 * A mai (vagy megadott napi) névnap-nevek a lokális cache-ből.
 * A webes dashboard-page logika tükre: a `nevnap` táblában a honap/nap STRING
 * („6", „12" — vezető nulla nélkül).
 */
export async function getLocalTodayNamedayNames(date = new Date()): Promise<string[]> {
  await ensureNevnapTable()
  const rows = await dbSelect<NevnapLocalRow>(
    `SELECT honap, nap, nev1, nev2, nev3
       FROM nevnap_local
      WHERE honap = ?1 AND nap = ?2
      LIMIT 1`,
    [String(date.getMonth() + 1), String(date.getDate())],
  )
  const row = rows[0]
  if (!row) return []
  return [row.nev1, row.nev2, row.nev3].filter(Boolean) as string[]
}
