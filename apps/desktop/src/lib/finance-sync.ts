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
import { dbExecute, dbExecuteMany, dbSelect, type SqlParam } from './local-db'
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

/**
 * 2026-07-25 (F6.4): KÍSÉRTET-SOROK TAKARÍTÁSA (tombstone).
 *
 * A pull `deleted = false`-ra szűr és CSAK upsertel — ezért a szerveren
 * utólag TÖRÖLT (vagy az évből kimozgatott) sor ÖRÖKRE bennmaradt a helyi
 * másolatban. Mivel az asztali pénzügy-oldalak a helyi másolatból
 * renderelnek, ez nem létező pénzt mutatott a kasszában és az egyenlegben.
 *
 * A takarítás CSAK teljes, hibátlan pull után fut (akkor a `serverIds` a
 * hiteles, teljes halmaz az adott hatókörre), és kizárólag a hatókörön
 * belüli, a szerveren már nem szereplő sorokat törli. Ha a lekérdezés
 * hibázott volna, a hívó előbb kilép — így sosem törlünk hiányos adat miatt.
 */
async function reconcileLocalRows(
  table: 'befizetes_local' | 'kiadas_local',
  scopeWhere: string,
  scopeParams: SqlParam[],
  serverIds: Set<string>,
): Promise<number> {
  const localRows = await dbSelect<{ id: number }>(
    `SELECT id FROM ${table} WHERE ${scopeWhere}`,
    scopeParams,
  )
  // ⚠️ BIZTONSÁGI SZELEP: ha a szerver ÜRES halmazt adott, de lokálisan VAN adat
  // a hatókörben, az szinte biztosan jogosultsági/szűrési anomália (a projektben
  // dokumentált RLS scope-divergencia: más gyülekezetre nézve némán 0 sor jön).
  // Ilyenkor a „takarítás" az egész évet kiürítené — inkább nem nyúlunk hozzá.
  if (serverIds.size === 0 && localRows.length > 0) {
    console.warn(
      `[finance-sync] a ${table} takarítása KIHAGYVA: a szerver 0 sort adott, ` +
        `miközben lokálisan ${localRows.length} sor van a hatókörben (jogosultsági anomália?).`,
    )
    return 0
  }
  // Az azonosítókat SZÖVEGKÉNT vetjük össze — a szerveren int8, ami nagy értéknél
  // JS-számként pontosságot veszíthetne.
  const stale = localRows.map((r) => r.id).filter((id) => !serverIds.has(String(id)))
  if (stale.length === 0) return 0
  // Darabolva törlünk (SQLite paraméter-plafon).
  const CHUNK = 200
  for (let i = 0; i < stale.length; i += CHUNK) {
    const slice = stale.slice(i, i + CHUNK)
    const placeholders = slice.map((_, idx) => `?${idx + 1}`).join(', ')
    await dbExecute(`DELETE FROM ${table} WHERE id IN (${placeholders})`, slice)
  }
  return stale.length
}

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
        // 2026-07-25 (F6.3 / M2): a KÉT évfogalom UNIÓJA — `fizetettev` = melyik
        // ÉVRE szól (tartozás), `datum` = mikor FOLYT BE (kassza/egyenleg).
        // Eddig csak a jogcím-évre szűrtünk, ezért az asztali kassza MÁS
        // halmazt mutatott, mint a böngésző (a mérés szerint évi 33 tétel,
        // 6,6% eltérés). A fogyasztók a saját oszlopukkal szűrnek — lásd
        // penzugy-page.tsx.
        .or(
          `fizetettev.eq.${year},and(datum.gte.${year}-01-01,datum.lte.${year}-12-31)`,
        )
        .eq('deleted', false),
    )

    if (error) {
      return { success: false, pulled: 0, error: error.message }
    }

    // 2026-07-25 (F6.7): KÖTEGELT írás — egy tranzakció, egy IPC-kör.
    const upsertBatch: SqlParam[][] = []
    for (const row of data || []) {
      const r = row as Record<string, SqlParam>
      upsertBatch.push([
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
      ])
    }
    await dbExecuteMany(
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
      upsertBatch,
    )
    const pulled = upsertBatch.length

    // 2026-07-25 (F6.4): a szerveren törölt/kimozgatott sorok takarítása —
    // a hatókör AZONOS a lekérdezésével (jogcím-év VAGY pénztári nap az évben).
    const serverIds = new Set((data || []).map((row) => String((row as Record<string, unknown>).id)))
    const removed = await reconcileLocalRows(
      'befizetes_local',
      'congregation_id = ?1 AND (fizetettev = ?2 OR (datum >= ?3 AND datum < ?4))',
      [congregationId, year, `${year}-01-01`, `${year + 1}-01-01`],
      serverIds,
    )
    if (removed > 0) {
      console.info(`[finance-sync] ${removed} elavult befizetés-sor törölve a helyi másolatból.`)
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
        .lt('datum', `${year + 1}-01-01`)
        .eq('deleted', false),
    )

    if (error) {
      return { success: false, pulled: 0, error: error.message }
    }

    // 2026-07-25 (F6.7): KÖTEGELT írás — egy tranzakció, egy IPC-kör.
    const upsertBatch: SqlParam[][] = []
    for (const row of data || []) {
      const r = row as Record<string, SqlParam>
      upsertBatch.push([
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
      ])
    }
    await dbExecuteMany(
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
      upsertBatch,
    )
    const pulled = upsertBatch.length

    // 2026-07-25 (F6.4): kísértet-sorok takarítása (lásd reconcileLocalRows).
    const serverIds = new Set((data || []).map((row) => String((row as Record<string, unknown>).id)))
    const removed = await reconcileLocalRows(
      'kiadas_local',
      'congregation_id = ?1 AND datum >= ?2 AND datum < ?3',
      [congregationId, `${year}-01-01`, `${year + 1}-01-01`],
      serverIds,
    )
    if (removed > 0) {
      console.info(`[finance-sync] ${removed} elavult kiadás-sor törölve a helyi másolatból.`)
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
    // 2026-07-25 (F6.3 / M2): a lokális olvasó is a KÉT halmaz UNIÓJÁT adja
    // (jogcím-év VAGY pénztári nap az adott évben) — a hívó szűr tovább a
    // saját szemantikája szerint. Így a kassza a webbel azonos halmazt lát,
    // a tartozás pedig továbbra is a jogcím-évet.
    `SELECT * FROM befizetes_local
       WHERE congregation_id = ?1 AND deleted = 0
         AND (fizetettev = ?2 OR (datum >= ?3 AND datum < ?4))
       ORDER BY datum DESC, id DESC`,
    // 2026-07-25 (F6.1): a LIMIT 500 TÖRÖLVE — a lokális olvasás is csonkolt
    // (van index congregation_id/fizetettev/datum-ra, table-scan nincs).
    [congregationId, year, `${year}-01-01`, `${year + 1}-01-01`],
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
       AND datum >= ?3 AND datum < ?4
       ORDER BY datum DESC, id DESC`,
    // 2026-07-25 (F6.1): a LIMIT 500 TÖRÖLVE (lásd fent).
    [congregationId, year, `${year}-01-01`, `${year + 1}-01-01`],
  )
}
