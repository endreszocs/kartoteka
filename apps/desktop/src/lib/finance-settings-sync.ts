/**
 * Finance beállítás- + költségvetés-szinkron (2026-06-10, paritás A5 alapja).
 *
 * A megosztott `AccountingTab` (Számadás) és a későbbi `BudgetTab` a gyülekezet
 * pénzügyi beállításait (`BealitasRow`) és a költségvetési terveket
 * (`budgetData: szamadasicelid → tervezett`) prop-on várja. A desktop ezeket
 * eddig nem tárolta lokálisan. Ez a modul a `bealitas` + `koltsegvetes`
 * táblákat tükrözi a lokális SQLite-ba (TS-oldali `CREATE TABLE`, nincs Rust).
 *
 * `bealitas.id` = az ÉV string-ként (gyülekezetenként + évenként egy sor).
 * `koltsegvetes` PK: (bealitasid=év, szamadasicelid=kód, congregation_id).
 */

import type { BealitasRow, JarulekYearSetting } from '@kartoteka/ui-app'

import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect } from './local-db'

async function ensureSettingsTables(): Promise<void> {
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS bealitas_local (
       id TEXT NOT NULL,
       congregation_id TEXT NOT NULL,
       eves_jarulek REAL,
       jarulek_kedvezmenyes REAL,
       jarulek_hatarid TEXT,
       budget_finalized INTEGER,
       accounting_finalized INTEGER,
       unlock_requested INTEGER,
       unlock_reason TEXT,
       accounting_unlock_requested INTEGER,
       accounting_unlock_reason TEXT,
       szamadas_zaro_adatok TEXT,
       synced_at TEXT,
       PRIMARY KEY (id, congregation_id)
     )`,
  )
  await dbExecute(
    `CREATE TABLE IF NOT EXISTS koltsegvetes_local (
       bealitasid TEXT NOT NULL,
       szamadasicelid TEXT NOT NULL,
       congregation_id TEXT NOT NULL,
       osszeg REAL,
       osszeg_modositott REAL,
       osszeg_mod_2 REAL,
       osszeg_mod_3 REAL,
       osszeg_teny REAL,
       synced_at TEXT,
       PRIMARY KEY (bealitasid, szamadasicelid, congregation_id)
     )`,
  )
}

export interface PullSettingsResult {
  success: boolean
  error?: string
}

export async function pullFinanceSettings(congregationId: string, year: number): Promise<PullSettingsResult> {
  try {
    await ensureSettingsTables()
    const supabase = getDesktopSupabase()
    const [bealRes, koltRes] = await Promise.all([
      supabase
        .from('bealitas')
        .select(
          'id, congregation_id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid, budget_finalized, accounting_finalized, unlock_requested, unlock_reason, accounting_unlock_requested, accounting_unlock_reason, szamadas_zaro_adatok',
        )
        .eq('congregation_id', congregationId),
      supabase
        .from('koltsegvetes')
        .select('bealitasid, szamadasicelid, congregation_id, osszeg, osszeg_modositott, osszeg_mod_2, osszeg_mod_3, osszeg_teny')
        .eq('congregation_id', congregationId)
        .eq('bealitasid', String(year)),
    ])
    if (bealRes.error) return { success: false, error: bealRes.error.message }
    if (koltRes.error) return { success: false, error: koltRes.error.message }

    for (const row of bealRes.data || []) {
      const r = row as Record<string, unknown>
      await dbExecute(
        `INSERT INTO bealitas_local (
           id, congregation_id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid,
           budget_finalized, accounting_finalized, unlock_requested, unlock_reason,
           accounting_unlock_requested, accounting_unlock_reason, szamadas_zaro_adatok, synced_at
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12, datetime('now'))
         ON CONFLICT(id, congregation_id) DO UPDATE SET
           eves_jarulek = excluded.eves_jarulek,
           jarulek_kedvezmenyes = excluded.jarulek_kedvezmenyes,
           jarulek_hatarid = excluded.jarulek_hatarid,
           budget_finalized = excluded.budget_finalized,
           accounting_finalized = excluded.accounting_finalized,
           unlock_requested = excluded.unlock_requested,
           unlock_reason = excluded.unlock_reason,
           accounting_unlock_requested = excluded.accounting_unlock_requested,
           accounting_unlock_reason = excluded.accounting_unlock_reason,
           szamadas_zaro_adatok = excluded.szamadas_zaro_adatok,
           synced_at = datetime('now')`,
        [
          String(r.id ?? ''),
          String(r.congregation_id ?? congregationId),
          (r.eves_jarulek as number) ?? null,
          (r.jarulek_kedvezmenyes as number) ?? null,
          (r.jarulek_hatarid as string) ?? null,
          r.budget_finalized ? 1 : 0,
          r.accounting_finalized ? 1 : 0,
          r.unlock_requested ? 1 : 0,
          (r.unlock_reason as string) ?? null,
          r.accounting_unlock_requested ? 1 : 0,
          (r.accounting_unlock_reason as string) ?? null,
          r.szamadas_zaro_adatok != null ? JSON.stringify(r.szamadas_zaro_adatok) : null,
        ],
      )
    }

    for (const row of koltRes.data || []) {
      const r = row as Record<string, unknown>
      await dbExecute(
        `INSERT INTO koltsegvetes_local (
           bealitasid, szamadasicelid, congregation_id, osszeg, osszeg_modositott,
           osszeg_mod_2, osszeg_mod_3, osszeg_teny, synced_at
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8, datetime('now'))
         ON CONFLICT(bealitasid, szamadasicelid, congregation_id) DO UPDATE SET
           osszeg = excluded.osszeg,
           osszeg_modositott = excluded.osszeg_modositott,
           osszeg_mod_2 = excluded.osszeg_mod_2,
           osszeg_mod_3 = excluded.osszeg_mod_3,
           osszeg_teny = excluded.osszeg_teny,
           synced_at = datetime('now')`,
        [
          String(r.bealitasid ?? ''),
          String(r.szamadasicelid ?? ''),
          String(r.congregation_id ?? congregationId),
          (r.osszeg as number) ?? null,
          (r.osszeg_modositott as number) ?? null,
          (r.osszeg_mod_2 as number) ?? null,
          (r.osszeg_mod_3 as number) ?? null,
          (r.osszeg_teny as number) ?? null,
        ],
      )
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'ismeretlen' }
  }
}

/** A gyülekezet adott évi pénzügyi beállításai (`BealitasRow`) a lokális cache-ből. */
export async function getLocalBealitas(congregationId: string, year: number): Promise<BealitasRow | null> {
  await ensureSettingsTables()
  const rows = await dbSelect<{
    id: string
    congregation_id: string
    eves_jarulek: number | null
    jarulek_kedvezmenyes: number | null
    jarulek_hatarid: string | null
    budget_finalized: number | null
    accounting_finalized: number | null
    unlock_requested: number | null
    unlock_reason: string | null
    accounting_unlock_requested: number | null
    accounting_unlock_reason: string | null
    szamadas_zaro_adatok: string | null
  }>(
    `SELECT id, congregation_id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid,
            budget_finalized, accounting_finalized, unlock_requested, unlock_reason,
            accounting_unlock_requested, accounting_unlock_reason, szamadas_zaro_adatok
       FROM bealitas_local WHERE id = ?1 AND congregation_id = ?2 LIMIT 1`,
    [String(year), congregationId],
  )
  const r = rows[0]
  if (!r) return null
  let zaro: Record<string, unknown> | null = null
  if (r.szamadas_zaro_adatok) {
    try {
      zaro = JSON.parse(r.szamadas_zaro_adatok) as Record<string, unknown>
    } catch {
      zaro = null
    }
  }
  return {
    id: r.id,
    congregation_id: r.congregation_id,
    eves_jarulek: r.eves_jarulek ?? null,
    jarulek_kedvezmenyes: r.jarulek_kedvezmenyes ?? null,
    jarulek_hatarid: r.jarulek_hatarid ?? null,
    budget_finalized: r.budget_finalized === 1,
    accounting_finalized: r.accounting_finalized === 1,
    unlock_requested: r.unlock_requested === 1,
    unlock_reason: r.unlock_reason ?? null,
    accounting_unlock_requested: r.accounting_unlock_requested === 1,
    accounting_unlock_reason: r.accounting_unlock_reason ?? null,
    szamadas_zaro_adatok: zaro,
  }
}

/**
 * Teljes költségvetés-sorok (alap + 3 módosítás) a lokális cache-ből —
 * a Költségvetés-fül OFFLINE megtekintéséhez (2026-06-11, paritás #5).
 * A mezőnevek a `BudgetCompatRow` alakot követik (tervezett/modositott/mod2/mod3).
 */
export async function getLocalBudgetCompatRows(
  congregationId: string,
  year: number,
): Promise<Array<{ szamadasicelid: string; tervezett: number; modositott: number | null; mod2: number | null; mod3: number | null }>> {
  await ensureSettingsTables()
  const rows = await dbSelect<{
    szamadasicelid: string
    osszeg: number | null
    osszeg_modositott: number | null
    osszeg_mod_2: number | null
    osszeg_mod_3: number | null
  }>(
    `SELECT szamadasicelid, osszeg, osszeg_modositott, osszeg_mod_2, osszeg_mod_3
       FROM koltsegvetes_local
      WHERE bealitasid = ?1 AND congregation_id = ?2`,
    [String(year), congregationId],
  )
  return rows.map((r) => ({
    szamadasicelid: r.szamadasicelid,
    tervezett: Number(r.osszeg) || 0,
    modositott: r.osszeg_modositott == null ? null : Number(r.osszeg_modositott),
    mod2: r.osszeg_mod_2 == null ? null : Number(r.osszeg_mod_2),
    mod3: r.osszeg_mod_3 == null ? null : Number(r.osszeg_mod_3),
  }))
}

/** A költségvetési tervek térképe (`szamadasicelid → tervezett összeg`) a lokális cache-ből. */
export async function getLocalBudgetData(congregationId: string, year: number): Promise<Record<string, number>> {
  await ensureSettingsTables()
  const rows = await dbSelect<{ szamadasicelid: string; osszeg: number | null }>(
    `SELECT szamadasicelid, osszeg FROM koltsegvetes_local
      WHERE bealitasid = ?1 AND congregation_id = ?2`,
    [String(year), congregationId],
  )
  const map: Record<string, number> = {}
  for (const r of rows) map[r.szamadasicelid] = Number(r.osszeg) || 0
  return map
}

/**
 * Évenkénti járulék-beállítások (`year → { eves_jarulek, ... }`) a lokális
 * cache-ből — a tartozás-számító motor (`computeJarulekForMemberYear`) `yearSettings`
 * prop-jához. A `bealitas_local` minden évet tárol (a pull nem szűr évre).
 */
export async function getLocalYearSettings(congregationId: string): Promise<Record<number, JarulekYearSetting>> {
  await ensureSettingsTables()
  const rows = await dbSelect<{ id: string; eves_jarulek: number | null; jarulek_kedvezmenyes: number | null; jarulek_hatarid: string | null }>(
    `SELECT id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid
       FROM bealitas_local WHERE congregation_id = ?1`,
    [congregationId],
  )
  const map: Record<number, JarulekYearSetting> = {}
  for (const r of rows) {
    const y = Number(r.id)
    if (Number.isNaN(y)) continue
    map[y] = {
      year: y,
      eves_jarulek: Number(r.eves_jarulek) || 0,
      jarulek_kedvezmenyes: r.jarulek_kedvezmenyes == null ? null : Number(r.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: r.jarulek_hatarid || null,
    }
  }
  return map
}

/** Évenkénti járulék-összeg (`year → eves_jarulek`) — a DebtTab `yearlyFees` prop-jához. */
export async function getLocalYearlyFees(congregationId: string): Promise<Record<number, number>> {
  const settings = await getLocalYearSettings(congregationId)
  const map: Record<number, number> = {}
  for (const [year, s] of Object.entries(settings)) map[Number(year)] = s.eves_jarulek
  return map
}
