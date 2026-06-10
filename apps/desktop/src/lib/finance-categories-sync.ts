/**
 * Finance kategória-szinkron (2026-06-10, desktop↔web paritás — A-hullám alapja).
 *
 * A megosztott `@kartoteka/ui-app` finance-komponensek (TransactionsTab,
 * FinanceDashboard, AccountingTab stb.) a kategória-térképeket (`bevCelMap` /
 * `kiaCelMap`) és a számadási kódlistát (`szamadasiCellek`) prop-on várják.
 * A desktop lokális cache eddig CSAK a kategória FK-t tárolta (id_befizetescel /
 * id_kiadascel), a neveket/kódokat nem. Ez a modul a `szamadasicel` +
 * `befizetescel` + `kiadascel` referencia-táblákat tükrözi a lokális SQLite-ba,
 * hogy a desktop ugyanazokat a komponenseket renderelhesse, mint a web.
 *
 * A lokális táblákat TS-ből hozzuk létre (`CREATE TABLE IF NOT EXISTS`) — nincs
 * Rust-migráció, nincs desktop-rebuild. A lekérdezések a web `penzugy/actions.ts`
 * `initFinance`-ével azonosak (szamadasicel: nincs `kod` oszlop, az `id` a kód).
 */

import type { SzamadasiCel } from '@kartoteka/ui-app'

import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect } from './local-db'

async function ensureCategoryTables(): Promise<void> {
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS szamadasicel_local (
       id TEXT PRIMARY KEY,
       nev TEXT,
       type TEXT,
       sorszam INTEGER,
       szint TEXT,
       synced_at TEXT
     )`,
  )
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS befizetescel_local (
       id INTEGER PRIMARY KEY,
       id_szamadasicel TEXT,
       synced_at TEXT
     )`,
  )
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS kiadascel_local (
       id INTEGER PRIMARY KEY,
       id_szamadasicel TEXT,
       synced_at TEXT
     )`,
  )
}

export interface PullCategoriesResult {
  success: boolean
  error?: string
}

/**
 * Lehúzza a számadási kódlistát + a bevétel/kiadás kategória-junctionöket a
 * lokális cache-be. Online-only; offline esetén a meglévő lokális adat marad.
 */
export async function pullFinanceCategories(): Promise<PullCategoriesResult> {
  try {
    await ensureCategoryTables()
    const supabase = getDesktopSupabase()
    const [szRes, bevRes, kiaRes] = await Promise.all([
      supabase.from('szamadasicel').select('id, nev, type, sorszam, szint').order('sorszam'),
      supabase.from('befizetescel').select('id, id_szamadasicel'),
      supabase.from('kiadascel').select('id, id_szamadasicel'),
    ])
    if (szRes.error) return { success: false, error: szRes.error.message }
    if (bevRes.error) return { success: false, error: bevRes.error.message }
    if (kiaRes.error) return { success: false, error: kiaRes.error.message }

    for (const row of szRes.data || []) {
      const r = row as { id: string; nev: string | null; type: string | null; sorszam: number | null; szint: string | null }
      await dbExecute(
        `INSERT INTO szamadasicel_local (id, nev, type, sorszam, szint, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           nev = excluded.nev, type = excluded.type,
           sorszam = excluded.sorszam, szint = excluded.szint,
           synced_at = datetime('now')`,
        [r.id, r.nev ?? null, r.type ?? null, r.sorszam ?? null, r.szint ?? null],
      )
    }
    for (const row of bevRes.data || []) {
      const r = row as { id: number; id_szamadasicel: string | null }
      await dbExecute(
        `INSERT INTO befizetescel_local (id, id_szamadasicel, synced_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET id_szamadasicel = excluded.id_szamadasicel, synced_at = datetime('now')`,
        [r.id, r.id_szamadasicel ?? null],
      )
    }
    for (const row of kiaRes.data || []) {
      const r = row as { id: number; id_szamadasicel: string | null }
      await dbExecute(
        `INSERT INTO kiadascel_local (id, id_szamadasicel, synced_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET id_szamadasicel = excluded.id_szamadasicel, synced_at = datetime('now')`,
        [r.id, r.id_szamadasicel ?? null],
      )
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'ismeretlen' }
  }
}

/** A számadási kódlista a lokális cache-ből (a `kod` = az `id`, mert nincs külön kód-oszlop). */
export async function getLocalSzamadasiCellek(): Promise<SzamadasiCel[]> {
  await ensureCategoryTables()
  const rows = await dbSelect<{ id: string; nev: string | null; type: string | null; sorszam: number | null; szint: string | null }>(
    `SELECT id, nev, type, sorszam, szint FROM szamadasicel_local ORDER BY sorszam`,
  )
  return rows.map((r) => ({
    id: r.id,
    nev: r.nev || r.id,
    kod: String(r.id),
    type: (r.type === 'K' ? 'K' : 'B') as 'B' | 'K',
    sorszam: r.sorszam ?? 0,
    szint: (r.szint as SzamadasiCel['szint']) ?? undefined,
  }))
}

/** befizetescel.id → szamadasicel-kód (pl. "101.07"). */
export async function getLocalBevCelMap(): Promise<Record<number, string>> {
  await ensureCategoryTables()
  const rows = await dbSelect<{ id: number; id_szamadasicel: string | null }>(
    `SELECT id, id_szamadasicel FROM befizetescel_local`,
  )
  const map: Record<number, string> = {}
  for (const r of rows) if (r.id_szamadasicel) map[r.id] = r.id_szamadasicel
  return map
}

/** kiadascel.id → szamadasicel-kód. */
export async function getLocalKiaCelMap(): Promise<Record<number, string>> {
  await ensureCategoryTables()
  const rows = await dbSelect<{ id: number; id_szamadasicel: string | null }>(
    `SELECT id, id_szamadasicel FROM kiadascel_local`,
  )
  const map: Record<number, string> = {}
  for (const r of rows) if (r.id_szamadasicel) map[r.id] = r.id_szamadasicel
  return map
}
