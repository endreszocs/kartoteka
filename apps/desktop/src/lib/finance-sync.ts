/**
 * finance-sync — pull-sync a befizetés + kiadás táblákra (A-M7.8c, 2026-04-24).
 *
 * Read-only mirror a `befizetes` → `befizetes_local` és `kiadas` → `kiadas_local`
 * táblákra. Delta-pull a `revision > last_synced_revision`-alapú szemlélettel
 * (mint a chitanta_tombok A-M7.1a-ban volt), de egyszerűsítve: az első
 * implementációban minden frissítéskor a teljes évet lehúzzuk (500 sor limittel),
 * a delta-szemlélet későbbi optimalizáció.
 *
 * A write-offline (save-offline) NINCS része — az egy külön iratszám-wallet
 * rendszert igényelne. Ez a fájl csak a **lista olvasását** szolgálja offline-ban.
 */

import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect, type SqlParam } from './local-db'
import { selectAllPaged } from './sync'

// ─────────────────────────────────────────────────────────────────────────
// Pull befizetések
// ─────────────────────────────────────────────────────────────────────────

export interface PullBefizetesekResult {
  success: boolean
  pulled: number
  error?: string
}

/**
 * Lehúzza a gyülekezet adott évi befizetéseit a szerverről a
 * `befizetes_local` táblába. A meglévő helyi sorokat UPSERT-tel felülírjuk.
 *
 * 2026-07-25 (F6.1): a korábbi `.limit(500)` plafonok KIVEZETVE. 2025-ben már
 * 470/469 tétel/gyülekezet volt — a datum DESC + limit(500) az év LEGRÉGEBBI
 * sorait dobta volna el NÉMÁN (és mivel minden desktop pénzügy-oldal a lokális
 * tükörből renderel, online is csonkolt volna: hibás számadás, hamis tartozás).
 * Helyette a `selectAllPaged` lapozó (1000-es lapok, csak ÜRES lap a stop).
 */
export async function pullBefizetesek(
  congregationId: string,
  year: number,
): Promise<PullBefizetesekResult> {
  try {
    const supabase = getDesktopSupabase()
    // 2026-07-25 (F6.1): LAPOZOTT lekérés — a limit(500) némán levágta az év
    // legrégebbi tételeit. A rendezést a lapozó adja (id ASC, stabil offset).
    const { data, error } = await selectAllPaged(
      supabase
        .from('befizetes')
        .select(
          'id, xkey, id_csalad, id_szemely, forrasa, id_befizetescel, datum, osszeg, nyugta, iratszam, irattipus, csalad, megjegyzes, deleted, created, fizetettev, userid, is_potlas, bankszamla_id, stornozott, stornozott_at, stornozott_indok, stornozott_by, osszeg_ron, arfolyam, congregation_id, revision, updated_at',
        )
        .eq('congregation_id', congregationId)
        .eq('fizetettev', year)
        .eq('deleted', false),
    )

    if (error) {
      return { success: false, pulled: 0, error: error.message }
    }

    let pulled = 0
    for (const row of data || []) {
      const r = row as Record<string, SqlParam>
      await dbExecute(
        `INSERT INTO befizetes_local (
          id, xkey, id_csalad, id_szemely, forrasa, id_befizetescel, datum, osszeg,
          nyugta, iratszam, irattipus, csalad, megjegyzes, deleted, created, fizetettev,
          userid, is_potlas, bankszamla_id, stornozott, stornozott_at, stornozott_indok,
          stornozott_by, osszeg_ron, arfolyam, congregation_id, revision, updated_at, synced_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
          ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
          ?17, ?18, ?19, ?20, ?21, ?22,
          ?23, ?24, ?25, ?26, ?27, ?28, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
          xkey = excluded.xkey,
          id_csalad = excluded.id_csalad,
          id_szemely = excluded.id_szemely,
          forrasa = excluded.forrasa,
          id_befizetescel = excluded.id_befizetescel,
          datum = excluded.datum,
          osszeg = excluded.osszeg,
          nyugta = excluded.nyugta,
          iratszam = excluded.iratszam,
          irattipus = excluded.irattipus,
          csalad = excluded.csalad,
          megjegyzes = excluded.megjegyzes,
          deleted = excluded.deleted,
          created = excluded.created,
          fizetettev = excluded.fizetettev,
          userid = excluded.userid,
          is_potlas = excluded.is_potlas,
          bankszamla_id = excluded.bankszamla_id,
          stornozott = excluded.stornozott,
          stornozott_at = excluded.stornozott_at,
          stornozott_indok = excluded.stornozott_indok,
          stornozott_by = excluded.stornozott_by,
          osszeg_ron = excluded.osszeg_ron,
          arfolyam = excluded.arfolyam,
          congregation_id = excluded.congregation_id,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          synced_at = datetime('now')`,
        [
          r.id,
          r.xkey ?? '',
          r.id_csalad ?? null,
          r.id_szemely ?? null,
          r.forrasa ?? null,
          r.id_befizetescel,
          r.datum,
          r.osszeg,
          r.nyugta ?? null,
          r.iratszam,
          r.irattipus,
          r.csalad ? 1 : 0,
          r.megjegyzes ?? null,
          r.deleted ? 1 : 0,
          r.created ?? null,
          r.fizetettev,
          r.userid,
          r.is_potlas ? 1 : 0,
          r.bankszamla_id ?? null,
          r.stornozott ? 1 : 0,
          r.stornozott_at ?? null,
          r.stornozott_indok ?? null,
          r.stornozott_by ?? null,
          r.osszeg_ron ?? null,
          r.arfolyam ?? null,
          r.congregation_id,
          r.revision ?? 0,
          r.updated_at,
        ],
      )
      pulled += 1
    }

    return { success: true, pulled }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, pulled: 0, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Pull kiadások
// ─────────────────────────────────────────────────────────────────────────

export async function pullKiadasok(
  congregationId: string,
  year: number,
): Promise<PullBefizetesekResult> {
  try {
    const supabase = getDesktopSupabase()
    // 2026-07-25 (F6.1): LAPOZOTT lekérés (lásd a fájl fejlécét).
    const { data, error } = await selectAllPaged(
      supabase
        .from('kiadas')
        .select(
          'id, xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus, megjegyzes, created, deleted, atvevo, atvevoid, userid, is_potlas, bankszamla_id, vonatkozo_idoszak, kedvezmenyezett_cui, stornozott, stornozott_at, stornozott_indok, stornozott_by, osszeg_ron, arfolyam, congregation_id, revision, updated_at',
        )
        .eq('congregation_id', congregationId)
        .gte('datum', `${year}-01-01`)
        .lte('datum', `${year}-12-31T23:59:59`)
        .eq('deleted', false),
    )

    if (error) {
      return { success: false, pulled: 0, error: error.message }
    }

    let pulled = 0
    for (const row of data || []) {
      const r = row as Record<string, SqlParam>
      await dbExecute(
        `INSERT INTO kiadas_local (
          id, xkey, id_kiadascel, datum, osszeg, nyugta, iratszam, irattipus,
          megjegyzes, created, deleted, atvevo, atvevoid, userid, is_potlas,
          bankszamla_id, vonatkozo_idoszak, kedvezmenyezett_cui, stornozott,
          stornozott_at, stornozott_indok, stornozott_by, osszeg_ron, arfolyam,
          congregation_id, revision, updated_at, synced_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
          ?9, ?10, ?11, ?12, ?13, ?14, ?15,
          ?16, ?17, ?18, ?19,
          ?20, ?21, ?22, ?23, ?24,
          ?25, ?26, ?27, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
          xkey = excluded.xkey,
          id_kiadascel = excluded.id_kiadascel,
          datum = excluded.datum,
          osszeg = excluded.osszeg,
          nyugta = excluded.nyugta,
          iratszam = excluded.iratszam,
          irattipus = excluded.irattipus,
          megjegyzes = excluded.megjegyzes,
          created = excluded.created,
          deleted = excluded.deleted,
          atvevo = excluded.atvevo,
          atvevoid = excluded.atvevoid,
          userid = excluded.userid,
          is_potlas = excluded.is_potlas,
          bankszamla_id = excluded.bankszamla_id,
          vonatkozo_idoszak = excluded.vonatkozo_idoszak,
          kedvezmenyezett_cui = excluded.kedvezmenyezett_cui,
          stornozott = excluded.stornozott,
          stornozott_at = excluded.stornozott_at,
          stornozott_indok = excluded.stornozott_indok,
          stornozott_by = excluded.stornozott_by,
          osszeg_ron = excluded.osszeg_ron,
          arfolyam = excluded.arfolyam,
          congregation_id = excluded.congregation_id,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          synced_at = datetime('now')`,
        [
          r.id,
          r.xkey ?? '',
          r.id_kiadascel,
          r.datum,
          r.osszeg,
          r.nyugta ?? null,
          r.iratszam,
          r.irattipus,
          r.megjegyzes ?? null,
          r.created ?? null,
          r.deleted ? 1 : 0,
          r.atvevo ?? null,
          r.atvevoid ?? null,
          r.userid,
          r.is_potlas ? 1 : 0,
          r.bankszamla_id ?? null,
          r.vonatkozo_idoszak ?? null,
          r.kedvezmenyezett_cui ?? null,
          r.stornozott ? 1 : 0,
          r.stornozott_at ?? null,
          r.stornozott_indok ?? null,
          r.stornozott_by ?? null,
          r.osszeg_ron ?? null,
          r.arfolyam ?? null,
          r.congregation_id,
          r.revision ?? 0,
          r.updated_at,
        ],
      )
      pulled += 1
    }

    return { success: true, pulled }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, pulled: 0, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Lokális olvasás — az offline-fallback-hez
// ─────────────────────────────────────────────────────────────────────────

export interface LocalBefizetesRow {
  id: number
  xkey: string
  id_csalad: number | null
  id_szemely: number | null
  forrasa: string | null
  id_befizetescel: number
  datum: string
  osszeg: number
  nyugta: string | null
  iratszam: string
  irattipus: string
  csalad: number
  megjegyzes: string | null
  deleted: number
  created: string | null
  fizetettev: number
  userid: string
  is_potlas: number
  bankszamla_id: number | null
  stornozott: number
  stornozott_at: string | null
  stornozott_indok: string | null
  stornozott_by: string | null
  osszeg_ron: number | null
  arfolyam: number | null
  congregation_id: string
  revision: number
  updated_at: string
  synced_at: string
}

export async function getLocalBefizetesek(
  congregationId: string,
  year: number,
): Promise<LocalBefizetesRow[]> {
  return dbSelect<LocalBefizetesRow>(
    `SELECT * FROM befizetes_local
       WHERE congregation_id = ?1 AND fizetettev = ?2 AND deleted = 0
       ORDER BY datum DESC, id DESC`,
    // 2026-07-25 (F6.1): a LIMIT 500 TÖRÖLVE — a lokális olvasás is csonkolt
    // (van index congregation_id/fizetettev/datum-ra, table-scan nincs).
    [congregationId, year],
  )
}

export interface LocalKiadasRow {
  id: number
  xkey: string
  id_kiadascel: number
  datum: string
  osszeg: number
  nyugta: string | null
  iratszam: string
  irattipus: string
  megjegyzes: string | null
  created: string | null
  deleted: number
  atvevo: string | null
  atvevoid: number | null
  userid: string
  is_potlas: number
  bankszamla_id: number | null
  vonatkozo_idoszak: string | null
  kedvezmenyezett_cui: string | null
  stornozott: number
  stornozott_at: string | null
  stornozott_indok: string | null
  stornozott_by: string | null
  osszeg_ron: number | null
  arfolyam: number | null
  congregation_id: string
  revision: number
  updated_at: string
  synced_at: string
}

export async function getLocalKiadasok(
  congregationId: string,
  year: number,
): Promise<LocalKiadasRow[]> {
  return dbSelect<LocalKiadasRow>(
    `SELECT * FROM kiadas_local
       WHERE congregation_id = ?1 AND deleted = 0
       AND datum >= ?3 AND datum <= ?4
       ORDER BY datum DESC, id DESC`,
    // 2026-07-25 (F6.1): a LIMIT 500 TÖRÖLVE (lásd fent).
    [congregationId, year, `${year}-01-01`, `${year}-12-31T23:59:59`],
  )
}
