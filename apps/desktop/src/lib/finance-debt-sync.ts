/**
 * Tartozás-adat szinkron (2026-06-10, paritás A4 alapja).
 *
 * A megosztott `DebtTab` a tagok kiszámított hátralékát (`DebtRow[]`) várja.
 * A számítást a KÖZÖS motor (`computeJarulekForMemberYear`, @kartoteka/ui-app)
 * végzi — web és desktop azonos. A motor bemenete: tagok (már szinkronban),
 * egyházfenntartási befizetések (már szinkronban), **felmentések** + **járulék-
 * kedvezmények** (ezeket tükrözi ez a modul a lokális SQLite-ba), és az
 * évenkénti beállítások (finance-settings-sync → getLocalYearSettings).
 *
 * TS-oldali `CREATE TABLE` — nincs Rust. A felmentes-nek 2026-06-10 óta van
 * congregation_id-je (Fázis 1 migráció), így gyülekezet-szűrten húzzuk.
 */

import type { JarulekExemption, JarulekDiscountRule } from '@kartoteka/ui-app'

import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect } from './local-db'

async function ensureDebtTables(): Promise<void> {
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS felmentes_local (
       id INTEGER PRIMARY KEY,
       congregation_id TEXT,
       id_szemely INTEGER,
       id_csalad INTEGER,
       kezdete INTEGER,
       vege INTEGER,
       synced_at TEXT
     )`,
  )
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS jarulek_kedvezmeny_local (
       id TEXT PRIMARY KEY,
       congregation_id TEXT,
       ev INTEGER,
       tipus TEXT,
       aktiv INTEGER,
       kezdet TEXT,
       hatarid TEXT,
       kedv_osszeg REAL,
       kor_tol INTEGER,
       szazalek REAL,
       fix_osszeg REAL,
       jov_leiras TEXT,
       synced_at TEXT
     )`,
  )
}

export interface PullDebtResult {
  success: boolean
  error?: string
}

export async function pullDebtData(congregationId: string): Promise<PullDebtResult> {
  try {
    await ensureDebtTables()
    const supabase = getDesktopSupabase()
    const [felmRes, kedvRes] = await Promise.all([
      supabase.from('felmentes').select('id, congregation_id, id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
      supabase
        .from('jarulek_kedvezmeny')
        .select('id, congregation_id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
        .eq('congregation_id', congregationId),
    ])
    if (felmRes.error) return { success: false, error: felmRes.error.message }
    if (kedvRes.error) return { success: false, error: kedvRes.error.message }

    for (const row of felmRes.data || []) {
      const r = row as Record<string, unknown>
      await dbExecute(
        `INSERT INTO felmentes_local (id, congregation_id, id_szemely, id_csalad, kezdete, vege, synced_at)
         VALUES (?1,?2,?3,?4,?5,?6, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           congregation_id = excluded.congregation_id, id_szemely = excluded.id_szemely,
           id_csalad = excluded.id_csalad, kezdete = excluded.kezdete, vege = excluded.vege,
           synced_at = datetime('now')`,
        [
          r.id as number,
          (r.congregation_id as string) ?? congregationId,
          (r.id_szemely as number) ?? null,
          (r.id_csalad as number) ?? null,
          (r.kezdete as number) ?? null,
          (r.vege as number) ?? null,
        ],
      )
    }

    for (const row of kedvRes.data || []) {
      const r = row as Record<string, unknown>
      await dbExecute(
        `INSERT INTO jarulek_kedvezmeny_local (
           id, congregation_id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras, synced_at
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           ev = excluded.ev, tipus = excluded.tipus, aktiv = excluded.aktiv,
           kezdet = excluded.kezdet, hatarid = excluded.hatarid, kedv_osszeg = excluded.kedv_osszeg,
           kor_tol = excluded.kor_tol, szazalek = excluded.szazalek, fix_osszeg = excluded.fix_osszeg,
           jov_leiras = excluded.jov_leiras, synced_at = datetime('now')`,
        [
          String(r.id ?? ''),
          (r.congregation_id as string) ?? congregationId,
          (r.ev as number) ?? null,
          (r.tipus as string) ?? null,
          r.aktiv === false ? 0 : 1,
          (r.kezdet as string) ?? null,
          (r.hatarid as string) ?? null,
          (r.kedv_osszeg as number) ?? null,
          (r.kor_tol as number) ?? null,
          (r.szazalek as number) ?? null,
          (r.fix_osszeg as number) ?? null,
          (r.jov_leiras as string) ?? null,
        ],
      )
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'ismeretlen' }
  }
}

export async function getLocalExemptions(congregationId: string): Promise<JarulekExemption[]> {
  await ensureDebtTables()
  const rows = await dbSelect<{ id_szemely: number | null; id_csalad: number | null; kezdete: number | null; vege: number | null }>(
    `SELECT id_szemely, id_csalad, kezdete, vege FROM felmentes_local WHERE congregation_id = ?1`,
    [congregationId],
  )
  return rows.map((r) => ({
    id_szemely: r.id_szemely ?? null,
    id_csalad: r.id_csalad ?? null,
    kezdete: r.kezdete ?? null,
    vege: r.vege ?? null,
  }))
}

export async function getLocalDiscounts(congregationId: string): Promise<JarulekDiscountRule[]> {
  await ensureDebtTables()
  const rows = await dbSelect<{
    id: string
    ev: number | null
    tipus: string | null
    aktiv: number | null
    kezdet: string | null
    hatarid: string | null
    kedv_osszeg: number | null
    kor_tol: number | null
    szazalek: number | null
    fix_osszeg: number | null
    jov_leiras: string | null
  }>(
    `SELECT id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras
       FROM jarulek_kedvezmeny_local WHERE congregation_id = ?1`,
    [congregationId],
  )
  return rows.map((r) => ({
    id: r.id,
    ev: Number(r.ev) || 0,
    tipus: (r.tipus as JarulekDiscountRule['tipus']) ?? 'idoszak',
    aktiv: r.aktiv !== 0,
    kezdet: r.kezdet ?? null,
    hatarid: r.hatarid ?? null,
    kedv_osszeg: r.kedv_osszeg == null ? null : Number(r.kedv_osszeg) || 0,
    kor_tol: r.kor_tol == null ? null : Number(r.kor_tol) || 0,
    szazalek: r.szazalek == null ? null : Number(r.szazalek) || 0,
    fix_osszeg: r.fix_osszeg == null ? null : Number(r.fix_osszeg) || 0,
    jov_leiras: r.jov_leiras ?? null,
  }))
}
