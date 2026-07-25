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
import { selectAllPaged } from './sync'

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


/**
 * 2026-07-25 (F6.5): a lokális tükörből törli azokat a sorokat, amiket a
 * (TELJES hatókörű) szerver-lekérdezés már nem ad vissza.
 *
 * ⚠️ Csak TELJES hatókörű pull után hívható — delta-pullnál mindent kitörölne.
 * Biztonsági szelep: üres szerver-halmaz + meglévő lokális adat esetén kihagy
 * (a dokumentált RLS scope-divergencia ellen).
 */
async function reconcileDebtTable(
  localTable: 'felmentes_local' | 'jarulek_kedvezmeny_local',
  congregationId: string,
  serverRows: Array<Record<string, unknown>>,
): Promise<void> {
  const serverIds = new Set(serverRows.map((r) => String(r.id)))
  const localRows = await dbSelect<{ id: number | string }>(
    `SELECT id FROM ${localTable} WHERE congregation_id = ?1`,
    [congregationId],
  )
  if (serverIds.size === 0 && localRows.length > 0) {
    console.warn(
      `[finance-debt-sync] ${localTable} takarítása KIHAGYVA: a szerver 0 sort adott, ` +
        `miközben lokálisan ${localRows.length} sor van (jogosultsági anomália?).`,
    )
    return
  }
  const stale = localRows.map((r) => r.id).filter((id) => !serverIds.has(String(id)))
  if (stale.length === 0) return
  const CHUNK = 200
  for (let i = 0; i < stale.length; i += CHUNK) {
    const slice = stale.slice(i, i + CHUNK)
    const placeholders = slice.map((_, idx) => `?${idx + 1}`).join(', ')
    await dbExecute(`DELETE FROM ${localTable} WHERE id IN (${placeholders})`, slice)
  }
  console.info(`[finance-debt-sync] ${localTable}: ${stale.length} elavult sor takarítva.`)
}

export async function pullDebtData(congregationId: string): Promise<PullDebtResult> {
  try {
    await ensureDebtTables()
    const supabase = getDesktopSupabase()
    // 2026-07-25 (F6.5 review, P2): LAPOZVA — a takarítás a szerver-halmazt
    // hiteles egésznek veszi, ezért a PostgREST sor-plafonja fölött a levágott
    // sorok „töröltnek" minősülnének, és a takarítás KITÖRÖLNÉ őket.
    const [felmRes, kedvRes] = await Promise.all([
      selectAllPaged(
        supabase
          .from('felmentes')
          .select('id, congregation_id, id_szemely, id_csalad, kezdete, vege')
          .eq('congregation_id', congregationId),
      ),
      selectAllPaged(
        supabase
          .from('jarulek_kedvezmeny')
          .select('id, congregation_id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
          .eq('congregation_id', congregationId),
      ),
    ])
    if (felmRes.error) return { success: false, error: felmRes.error.message }
    // Ellenálló a `kezdet` oszlop hiányára (régi séma): ha a lekérdezés hibázott, újra `kezdet` nélkül —
    // különben az EGÉSZ tartozás-szinkron elbukna egy hiányzó oszloptól. Web-azonos a getExpectedJarulek/
    // initFinance ellenállóságával (commit 535c33fc); a kezdet ekkor null (nyitott ablak).
    let kedvData = kedvRes.data as Array<Record<string, unknown>> | null
    if (kedvRes.error) {
      const retry = await selectAllPaged(
        supabase
          .from('jarulek_kedvezmeny')
          .select('id, congregation_id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
          .eq('congregation_id', congregationId),
      )
      if (retry.error) return { success: false, error: retry.error.message }
      kedvData = retry.data as Array<Record<string, unknown>> | null
    }

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

    for (const row of kedvData || []) {
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

    // 2026-07-25 (F6.5): a VÉGLEGESEN törölt sorok takarítása. Ez a két pull
    // TELJES hatókört tölt (nincs updated_at-kurzor), ezért a szerver-halmaz
    // hiteles egész — a takarítás itt közvetlenül biztonságos. Ha ezt nem
    // tennénk: a weben törölt felmentés/kedvezmény ÖRÖKRE érvényben maradna a
    // desktop tartozás-számításában (hamis mentesség, hamis kedvezmény).
    await reconcileDebtTable('felmentes_local', congregationId, felmRes.data || [])
    await reconcileDebtTable('jarulek_kedvezmeny_local', congregationId, kedvData || [])

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
