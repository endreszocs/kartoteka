/**
 * Tábla-leltár — MI VAN ÉLESBEN, és mit kezdünk vele (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EZ A RENDSZER LEGFONTOSABB NÉMA-HIBA-ELHÁRÍTÁSA
 * ════════════════════════════════════════════════════════════════════════════
 * A tábla-listát TILOS a repóból származtatni. A `migration-docs/Database_schema.sql`
 * dump 100 táblát ismer, a `migration-docs/sql/*.sql` további ~57-et hoz létre:
 * a repó és a produkció BIZONYÍTOTTAN széthúz. Egy repó-alapú lista némán
 * kihagyna táblákat, és senki nem venné észre — amíg vissza nem kellene állítani.
 *
 * Ezért: az `information_schema` (a `backup_live_tables()` RPC-n keresztül)
 * mondja meg, MI VAN; a `backup_table_policy` mondja meg, MIT KEZDÜNK VELE.
 * Ha a kettő eltér — vagyis van ÉLŐ tábla policy-sor nélkül —, a futás AZONNAL
 * ELHASAL, és MEGNEVEZI a táblát.
 *
 * Egy jövőbeni tábla így nem tud csendben kimaradni a mentésből, egy jövőbeni
 * TITOK-tábla pedig nem tud csendben bekerülni. A két irány egyformán fontos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Ez a fájl NULLA FUTÁSIDEJŰ projekt-importot használ (`import type` csak) —
 * a `scripts/selftest-backup.mjs` önmagában betölti és teszteli.
 */

import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { BackupLiveTableRow, BackupScope } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Betöltés
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Beolvassa az élő tábla-leltárt a `backup_live_tables()` RPC-vel.
 *
 * A hívó `service_role` kliens KELL legyen — az RPC-t szándékosan CSAK az
 * hívhatja (`GRANT EXECUTE … TO service_role`), az `authenticated` nem.
 */
export async function loadTableInventory(
  admin: SupabaseClient,
): Promise<BackupLiveTableRow[]> {
  const { data, error } = await admin.rpc('backup_live_tables')
  if (error) {
    // ⚠️ CSAK az üzenet és a kód. A nyers Supabase-hibaobjektum a teljes
    //    lekérdezést (és így SORÉRTÉKEKET) is kiírhatna a naplóba.
    throw new Error(
      `A tábla-leltár nem tölthető be (backup_live_tables): ${error.message}` +
        (error.code ? ` [${error.code}]` : ''),
    )
  }
  const rows = (data ?? []) as BackupLiveTableRow[]
  if (rows.length === 0) {
    throw new Error(
      'A tábla-leltár ÜRES. Ez lehetetlen egy működő adatbázisban — ' +
        'valószínűleg a 2026-08-11-biztonsagi-mentes.sql nem futott le.',
    )
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Besorolás-ellenőrzés — a KÉT KÜLÖN KAPU
// ─────────────────────────────────────────────────────────────────────────────

export interface InventoryClassification {
  /** ÉLŐ tábla policy-sor nélkül → a MENTÉS nem indulhat el. */
  besorolatlan: string[]
  /** Gyülekezeti hatókörű, réteg nélkül → a VISSZAÁLLÍTÁS tagadja meg. */
  retegNelkul: string[]
  /**
   * Gyülekezeti hatókörű, SAJÁT SZŰRŐ NÉLKÜL, de a táblának NINCS
   * `congregation_id` oszlopa → a MENTÉS nem indulhat el.
   *
   * ⚠️ EZ A KATEGÓRIA EGY VALÓDI, ÉLES HIBÁBÓL SZÜLETETT (2026-08-11).
   *    A `backup_scope_where()` `join_predikatum IS NULL` esetén az
   *    alapértelmezett `t.congregation_id = $1` szűrőt adja vissza. Ha a
   *    táblának nincs ilyen oszlopa, a `backup_count_table` 42703-mal elhasal,
   *    az `exportScope` dob, és EGYETLEN GYÜLEKEZETI MENTÉS SEM KÉSZÜL EL —
   *    mind a számlálás lépésénél bukik. Három tábla volt ilyen
   *    (`member_accounts`, `member_newsletter_preferences`, `audit_log`), és
   *    ezt semmi nem fogta meg: a `van_congregation_id` mező ott volt a
   *    leltárban, csak épp senki nem olvasta.
   */
  szuroNelkul: string[]
  gyulekezet: BackupLiveTableRow[]
  globalis: BackupLiveTableRow[]
  kizart: BackupLiveTableRow[]
}

/** Szétválogatja a leltárt. Nem dob — a döntést a hívóra bízza. */
export function classifyInventory(rows: BackupLiveTableRow[]): InventoryClassification {
  const out: InventoryClassification = {
    besorolatlan: [],
    retegNelkul: [],
    szuroNelkul: [],
    gyulekezet: [],
    globalis: [],
    kizart: [],
  }
  for (const row of rows) {
    if (row.hatokor === null || row.hatokor === undefined) {
      out.besorolatlan.push(row.tabla)
      continue
    }
    if (row.hatokor === 'gyulekezet') {
      out.gyulekezet.push(row)
      if (row.reteg === null || row.reteg === undefined) out.retegNelkul.push(row.tabla)
      // A `join_predikatum` üres SZÖVEGE is hiánynak számít — egy üres string
      // ugyanolyan használhatatlan szűrő, mint a `null`, csak nehezebb észrevenni.
      const vanSajatSzuro =
        typeof row.join_predikatum === 'string' && row.join_predikatum.trim().length > 0
      if (!vanSajatSzuro && row.van_congregation_id !== true) {
        out.szuroNelkul.push(row.tabla)
      }
    } else if (row.hatokor === 'globalis') {
      out.globalis.push(row)
    } else {
      out.kizart.push(row)
    }
  }
  out.besorolatlan.sort()
  out.retegNelkul.sort()
  out.szuroNelkul.sort()
  return out
}

/**
 * A MENTÉS kapuja: besorolatlan élő tábla esetén HANGOS hiba, a nevekkel.
 *
 * ⚠️ Szándékosan NEM esik el a réteg hiányán. A réteg csak a VISSZAÁLLÍTÁSHOZ
 *    kell; ha emiatt megállna a mentés, egy új tábla felvétele MINDEN gyülekezet
 *    napi mentését leállítaná — a gyógyszer rosszabb lenne a betegségnél.
 *    (A hiányzó réteget a `backup_restore_apply()` SQL-oldalon tagadja meg.)
 */
export function assertInventoryClassified(rows: BackupLiveTableRow[]): InventoryClassification {
  const c = classifyInventory(rows)
  if (c.besorolatlan.length > 0) {
    throw new Error(
      `BESOROLATLAN ÉLŐ TÁBLA (${c.besorolatlan.length} db): ${c.besorolatlan.join(', ')}. ` +
        'A mentés NEM indul el, amíg ezek nincsenek felvéve a backup_table_policy táblába — ' +
        'különben némán kimaradnának a mentésből. Pótlás: migration-docs/sql/' +
        '2026-08-11-biztonsagi-mentes.sql, a fájl végi ellenőrző SELECT 90-es sorai.',
    )
  }
  // ⚠️ HANGOS HIBA A SZÁMLÁLÁS ELŐTT, NEM UTÁNA. Enélkül ugyanez a hiba
  //    `backup_count_table` 42703-ként robbanna, gyülekezetenként külön —
  //    és a napló 60 sorában 60 érthetetlen driver-üzenet állna ahelyett, hogy
  //    EGYSZER, ÉRTHETŐEN megmondanánk, melyik tábla besorolása rossz.
  if (c.szuroNelkul.length > 0) {
    throw new Error(
      `GYÜLEKEZETI TÁBLA ÉRVÉNYES SZŰRŐ NÉLKÜL (${c.szuroNelkul.length} db): ` +
        `${c.szuroNelkul.join(', ')}. ` +
        'Ezek gyülekezeti hatókörrel vannak besorolva, de NINCS `congregation_id` oszlopuk ' +
        'és nincs saját `join_predikatum`-uk sem — a szűrő így egy nem létező oszlopra ' +
        'hivatkozna, és MINDEN gyülekezet mentése elhasalna a számlálásnál. ' +
        'Javítás: adj nekik `join_predikatum`-ot, VAGY told át őket globális hatókörbe. ' +
        'Sablon: migration-docs/sql/2026-08-11-biztonsagi-mentes.sql, 3/i szakasz; ' +
        'ellenőrzés: a fájl végi SELECT 42-es és 92-es sorai.',
    )
  }
  return c
}

// ─────────────────────────────────────────────────────────────────────────────
// Séma-ujjlenyomat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tábla+oszlop szerkezet SHA-256-ja.
 *
 * A visszaállítás ELŐNÉZETE ezt veti össze a mentésben tárolttal: ha a séma
 * azóta változott (új NOT NULL oszlop, átnevezés), a felület ELŐRE szól,
 * nem félúton hasal el.
 *
 * A sorrend rögzített (tábla, majd oszlop szerint), különben ugyanaz a séma
 * két különböző ujjlenyomatot adna, és a jelzés zajjá válna.
 */
export function computeSchemaFingerprint(rows: BackupLiveTableRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => (a.tabla < b.tabla ? -1 : a.tabla > b.tabla ? 1 : 0))
    .map((r) => `${r.tabla}:${[...(r.oszlopok ?? [])].sort().join(',')}`)
    .join('\n')
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorrend — DETERMINISZTIKUS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A menteni való táblák, RÖGZÍTETT sorrendben.
 *
 * Miért számít: a manifest táblánkénti sorszámai és a hasznos teher sorrendje
 * csak akkor összevethető két nap között, ha a sorrend nem sodródik. Elsődleges
 * kulcs a visszatöltési RÉTEG (így a fájl olvasása közben eleve helyes a
 * függőségi sorrend), másodlagos a tábla neve.
 *
 * A réteg nélküli táblák a VÉGÉRE kerülnek — mentjük őket (az adat megvan),
 * csak a visszatöltési helyük ismeretlen.
 */
export function orderTablesForDump(
  rows: BackupLiveTableRow[],
  scope: BackupScope,
): BackupLiveTableRow[] {
  return rows
    .filter((r) => r.hatokor === scope)
    .sort((a, b) => {
      const ra = a.reteg ?? 99
      const rb = b.reteg ?? 99
      if (ra !== rb) return ra - rb
      return a.tabla < b.tabla ? -1 : a.tabla > b.tabla ? 1 : 0
    })
}

/** A KIZÁRT táblák nevei — ez megy a manifest `kimaradt.tablak` mezőjébe. */
export function excludedTableNames(rows: BackupLiveTableRow[]): string[] {
  return rows
    .filter((r) => r.hatokor === 'kizart_titok' || r.hatokor === 'kizart_egyeb')
    .map((r) => r.tabla)
    .sort()
}
