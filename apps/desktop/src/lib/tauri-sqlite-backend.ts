/**
 * TauriSqliteBackend — a @kartoteka/offline-sync StorageBackend első valós
 * implementációja a Tauri desktop kliensen (A-M7.0, 2026-04-22).
 *
 * Architektúra:
 *   - A StorageBackend interface (@kartoteka/offline-sync/backend) platform-
 *     független absztrakció, amit a @kartoteka/core use-case-ek használnak.
 *   - Ez az osztály **platform-specifikus** — a Tauri `db_execute`/`db_select`
 *     command-okra épül, ami a Rust-oldali SQLCipher-titkosított DB-hez beszél.
 *   - Párja (később) a `apps/web/lib/offline/dexie-backend.ts`, ami ugyanezt
 *     az interface-t Dexie (IndexedDB) mögött implementálja.
 *
 * SQL-injection védelem:
 *   - A `TableRegistryEntry.localTable` és `.primaryKey` mezőket a use-case-ek
 *     nem szerkesztik futásidőben; egy WHITELIST-ben definiálódnak a
 *     `@kartoteka/offline-sync`-ben.
 *   - Minden user-adat `?N` placeholder-en keresztül megy be, soha nem
 *     string-interpolációval.
 *   - Az oszlopnevek (INSERT payload keys) szintén csak a use-case által
 *     ismert halmaz — a backend ezt `_identifier` safety check-kel ellenőrzi.
 *
 * Jelenlegi scope (A-M7.0):
 *   - CRUD: upsertServerRows, writeLocal, deleteLocal, findByPk, findAll
 *   - Outbox: enqueueMutation, getPendingMutations, removeMutation, updateMutationAttempt
 *   - Settings: getSetting, setSetting (a meglévő `settings` táblához)
 *
 * Jövőbeli bővítések (az A-M7 további alfázisaiban):
 *   - Streaming `findAll` 50k+ sorhoz (chunked, cursor-alapú)
 *   - Tranzakciók (több tábla egy atomic commit)
 *   - `wipeLocalData` — teljes DB-wipe (logout + scope-change)
 */

import type {
  Mutation,
  SimpleFilter,
  StorageBackend,
  SyncMeta,
  TableRegistryEntry,
} from '@kartoteka/offline-sync'
import type {
  IratszamTipus,
  LocalBefizetesRow,
  LocalChitantaRow,
  LocalKiadasRow,
} from '@kartoteka/core'
import type { SzemelyListInput, SzemelyListRow } from '@kartoteka/validations'

import { invoke } from '@tauri-apps/api/core'

import { dbExecute, dbSelect, getSetting as getSettingRaw, setSetting as setSettingRaw } from './local-db'

// ─────────────────────────────────────────────────────────────────────────
// Safety helper — csak a-z, 0-9 és _ karaktereket engedünk a table/col nevekben
// ─────────────────────────────────────────────────────────────────────────

const SQL_IDENT_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function assertSafeIdentifier(name: string, context: string): void {
  if (!SQL_IDENT_REGEX.test(name)) {
    throw new Error(
      `TauriSqliteBackend: nem biztonságos SQL-azonosító "${name}" (${context}). Csak a-zA-Z0-9_ megengedett.`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SQL-generator helperek
// ─────────────────────────────────────────────────────────────────────────

/**
 * Visszaad egy `?1, ?2, ?3, …` placeholder-listát N elemre.
 */
function placeholders(count: number, startAt = 1): string {
  const parts: string[] = []
  for (let i = 0; i < count; i += 1) {
    parts.push(`?${startAt + i}`)
  }
  return parts.join(', ')
}

/**
 * Rendezett oszlopnevek egy row-ról, a non-undefined mezőkből. Szűri a
 * `_syncStatus`, `_baseRevision`, `_pendingDelete`, `_localUpdatedAt`
 * privát SyncMeta mezőket (ezek csak a Dexie-backend konvenció, SQLite-ban
 * külön oszlopok lennének).
 */
function extractColumnsAndValues(
  row: Record<string, unknown>,
): { cols: string[]; values: unknown[] } {
  const cols: string[] = []
  const values: unknown[] = []
  for (const key of Object.keys(row).sort()) {
    if (key.startsWith('_')) continue // SyncMeta privát mezők
    const v = row[key]
    if (v === undefined) continue
    assertSafeIdentifier(key, 'column')
    cols.push(key)
    // Supabase null → SQLite null; minden más JSON-ba kompatibilis típus átmegy
    values.push(v as unknown)
  }
  return { cols, values }
}

// ─────────────────────────────────────────────────────────────────────────
// Outbox tábla séma (a Rust-oldali `outbox` táblához van igazítva)
// ─────────────────────────────────────────────────────────────────────────
//
// Feltételezett sémaa (a meglévő Rust-migráció alapján):
//   CREATE TABLE outbox (
//     id TEXT PRIMARY KEY,
//     table_name TEXT NOT NULL,
//     pk TEXT NOT NULL,
//     kind TEXT NOT NULL,            -- 'insert' | 'update' | 'delete'
//     payload_json TEXT,             -- NULL delete-nél
//     expected_revision INTEGER,
//     attempts INTEGER NOT NULL DEFAULT 0,
//     last_attempt_at TEXT,
//     last_error TEXT,
//     status TEXT NOT NULL DEFAULT 'pending',
//     created_at TEXT NOT NULL DEFAULT (datetime('now'))
//   );
//
// Az A-M7 alatt a migrációkat a Rust db.rs hozza létre (user_version ≥ 8),
// ez a TS-oldali wrapper azt feltételezi, hogy a tábla már létezik.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// TauriSqliteBackend
// ─────────────────────────────────────────────────────────────────────────

export class TauriSqliteBackend implements StorageBackend {
  // ── Pull-side ──

  async upsertServerRows<T extends { id: string | number }>(
    table: TableRegistryEntry,
    rows: T[],
  ): Promise<void> {
    if (rows.length === 0) return
    assertSafeIdentifier(table.localTable, 'localTable')
    assertSafeIdentifier(table.primaryKey, 'primaryKey')

    for (const row of rows) {
      const { cols, values } = extractColumnsAndValues(row as Record<string, unknown>)
      if (cols.length === 0) continue

      const colList = cols.join(', ')
      const placeholderList = placeholders(cols.length)
      const updateList = cols
        .filter((c) => c !== table.primaryKey)
        .map((c) => `${c} = excluded.${c}`)
        .join(', ')

      const sql = updateList
        ? `INSERT INTO ${table.localTable} (${colList}) VALUES (${placeholderList})
           ON CONFLICT(${table.primaryKey}) DO UPDATE SET ${updateList}`
        : `INSERT OR IGNORE INTO ${table.localTable} (${colList}) VALUES (${placeholderList})`

      await dbExecute(sql, values as never)
    }
  }

  async writeLocal<T extends { id: string | number }>(
    table: TableRegistryEntry,
    row: T & Partial<SyncMeta>,
    _kind: 'insert' | 'update',
  ): Promise<void> {
    assertSafeIdentifier(table.localTable, 'localTable')
    assertSafeIdentifier(table.primaryKey, 'primaryKey')

    const { cols, values } = extractColumnsAndValues(row as Record<string, unknown>)
    if (cols.length === 0) return

    const colList = cols.join(', ')
    const placeholderList = placeholders(cols.length)
    const updateList = cols
      .filter((c) => c !== table.primaryKey)
      .map((c) => `${c} = excluded.${c}`)
      .join(', ')

    const sql = updateList
      ? `INSERT INTO ${table.localTable} (${colList}) VALUES (${placeholderList})
         ON CONFLICT(${table.primaryKey}) DO UPDATE SET ${updateList}`
      : `INSERT OR IGNORE INTO ${table.localTable} (${colList}) VALUES (${placeholderList})`

    await dbExecute(sql, values as never)
  }

  async deleteLocal(
    table: TableRegistryEntry,
    pk: string | number,
  ): Promise<void> {
    assertSafeIdentifier(table.localTable, 'localTable')
    assertSafeIdentifier(table.primaryKey, 'primaryKey')

    if (table.softDelete) {
      // Soft-delete: `deleted = 1` flag
      await dbExecute(
        `UPDATE ${table.localTable} SET deleted = 1 WHERE ${table.primaryKey} = ?1`,
        [pk],
      )
    } else {
      await dbExecute(
        `DELETE FROM ${table.localTable} WHERE ${table.primaryKey} = ?1`,
        [pk],
      )
    }
  }

  // ── Query-side ──

  async findByPk<T>(
    table: TableRegistryEntry,
    pk: string | number,
  ): Promise<T | null> {
    assertSafeIdentifier(table.localTable, 'localTable')
    assertSafeIdentifier(table.primaryKey, 'primaryKey')

    const rows = await dbSelect<T>(
      `SELECT * FROM ${table.localTable} WHERE ${table.primaryKey} = ?1 LIMIT 1`,
      [pk],
    )
    return rows[0] ?? null
  }

  async findAll<T>(
    table: TableRegistryEntry,
    filter?: SimpleFilter,
    limit?: number,
  ): Promise<T[]> {
    assertSafeIdentifier(table.localTable, 'localTable')

    const whereParts: string[] = []
    const params: unknown[] = []
    if (filter) {
      for (const [col, val] of Object.entries(filter)) {
        assertSafeIdentifier(col, 'filter column')
        if (val === null) {
          whereParts.push(`${col} IS NULL`)
        } else {
          params.push(val)
          whereParts.push(`${col} = ?${params.length}`)
        }
      }
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
    const limitSql = limit && limit > 0 ? `LIMIT ${Math.floor(limit)}` : ''

    return dbSelect<T>(
      `SELECT * FROM ${table.localTable} ${whereSql} ${limitSql}`.trim(),
      params as never,
    )
  }

  // ── Outbox (mutation queue) ──

  async enqueueMutation(m: Mutation): Promise<void> {
    // A meglévő outbox séma (M2.5) + A-M7.0 v8 bővített oszlopok:
    // op/target_table/target_id/payload/retry_count    — sync.ts régi olvasói
    // mutation_id/expected_revision/last_attempt_at    — Mutation-interface
    await dbExecute(
      `INSERT INTO outbox
        (op, target_table, target_id, payload, status, created_at, retry_count, last_error,
         mutation_id, expected_revision, last_attempt_at)
       VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7, ?8, ?9, ?10)`,
      [
        m.kind,
        m.table,
        String(m.pk),
        m.payload ? JSON.stringify(m.payload) : JSON.stringify({}),
        m.createdAt,
        m.attempts,
        m.lastError ?? null,
        m.id,
        m.expectedRevision ?? null,
        m.lastAttemptAt ?? null,
      ],
    )
  }

  async getPendingMutations(limit = 50): Promise<Mutation[]> {
    const rows = await dbSelect<{
      mutation_id: string
      target_table: string
      target_id: string
      op: 'insert' | 'update' | 'delete'
      payload: string | null
      expected_revision: number | null
      retry_count: number
      last_attempt_at: string | null
      last_error: string | null
      created_at: string
    }>(
      `SELECT mutation_id, target_table, target_id, op, payload, expected_revision,
              retry_count, last_attempt_at, last_error, created_at
         FROM outbox
         WHERE status = 'pending' AND mutation_id IS NOT NULL
         ORDER BY created_at ASC
         LIMIT ?1`,
      [Math.floor(limit)],
    )
    return rows.map((r) => ({
      id: r.mutation_id,
      table: r.target_table,
      pk: r.target_id,
      kind: r.op,
      payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : undefined,
      expectedRevision: r.expected_revision ?? undefined,
      attempts: r.retry_count,
      lastAttemptAt: r.last_attempt_at ?? undefined,
      lastError: r.last_error ?? undefined,
      createdAt: r.created_at,
    }))
  }

  async removeMutation(mutationId: string): Promise<void> {
    await dbExecute(`DELETE FROM outbox WHERE mutation_id = ?1`, [mutationId])
  }

  async updateMutationAttempt(
    mutationId: string,
    update: Pick<Mutation, 'attempts' | 'lastAttemptAt' | 'lastError'>,
  ): Promise<void> {
    await dbExecute(
      `UPDATE outbox
         SET retry_count = ?1,
             last_attempt_at = ?2,
             last_error = ?3
         WHERE mutation_id = ?4`,
      [
        update.attempts,
        update.lastAttemptAt ?? null,
        update.lastError ?? null,
        mutationId,
      ],
    )
  }

  // ── Settings (kulcs-érték tár) ──

  async getSetting(key: string): Promise<string | null> {
    return getSettingRaw(key)
  }

  async setSetting(key: string, value: string): Promise<void> {
    return setSettingRaw(key, value)
  }

  // ── Chitanta szám-tárca (A-M7.2d1) ──

  /**
   * N sorszám beszúrása a `chitanta_wallet_local` táblába (offline-foglalás).
   * A sorszámokat a core `refillChitantaWalletUseCase` adja (szerver-oldali
   * `reserve_chitanta_numbers()` RPC eredménye).
   */
  async insertWalletNumbers(
    congregationId: string,
    sorozat: string,
    numbers: number[],
  ): Promise<void> {
    if (numbers.length === 0) return
    assertSafeIdentifier('chitanta_wallet_local', 'wallet table')
    // Egyenkénti INSERT — a Rust dbExecute nem támogat multi-row paramétert.
    // 10-20 sorszám elég ritka, a sor-szintű overhead elfogadható.
    for (const szam of numbers) {
      await dbExecute(
        `INSERT OR IGNORE INTO chitanta_wallet_local
           (congregation_id, sorozat, szam, reserved_at, used)
         VALUES (?1, ?2, ?3, datetime('now'), 0)`,
        [congregationId, sorozat, Math.floor(szam)],
      )
    }
  }

  /**
   * Atomikusan kivesz egy szabad sorszámot a wallet-ből és `used=1`-re állítja.
   *
   * **Rust-oldali tranzakció** — a SELECT MIN + UPDATE egy `BEGIN/COMMIT` blokkban
   * fut, így két párhuzamos kliens-hívás nem kap ugyanarra a számra. A
   * `chitantaLocalId` a most készülő chitanta-sor PK-ja (kliens-generált
   * `local-<uuid>`), amit a wallet-sor `used_for_chitanta_local_id` mezőjébe
   * mentünk — így a sztornó-flow vagy a sync-debug vissza tud nyúlni a
   * wallet-ből a chitanta-ig.
   *
   * Visszaadja:
   *   - `{ id, szam, sorozat }` ha sikerült
   *   - `null` ha nincs szabad szám (üres wallet)
   */
  async claimNextWalletNumber(
    congregationId: string,
    sorozat: string | null,
    chitantaLocalId: string,
  ): Promise<{ id: number; szam: number; sorozat: string } | null> {
    const result = await invoke<
      { id: number; szam: number; sorozat: string } | null
    >('chitanta_wallet_claim_next', {
      congregationId,
      sorozat: sorozat ?? null,
      chitantaLocalId,
    })
    return result
  }

  /**
   * Visszaadja a lefoglalt sorszámot a pool-ba (used=0). Csak akkor hívd,
   * ha a chitanta-kiállítás **sikertelen** volt a claim után, és még
   * nem ment ki outbox-ba.
   */
  async releaseWalletNumber(walletId: number): Promise<void> {
    await invoke('chitanta_wallet_release', { walletId })
  }

  /**
   * A-M7.2d2d — Konfliktus feloldás: a lokális chitanța **törlése** + a
   * hozzá tartozó wallet-szám felszabadítása (ha volt).
   *
   * Használat: a user a konfliktus-modalban „Törlés" gombot nyom — a
   * chitanta teljesen eltűnik, a wallet-szám visszakerül a pool-ba (ha a
   * mutation még nem ment ki szerverre). Ha már ment ki és ütközés volt,
   * a szám a szerver pointer-ben már elvesztettük (a szerver incrementálta
   * a `next` mezőt), de a lokális tárcában visszakerül `used=0`-ra, így
   * a user szabadon újra-foglalhatná — amit a valóságban nem tesz, de ez
   * az egyszerűbb semantika.
   *
   * 1) wallet: `UPDATE used=0 WHERE used_for_chitanta_local_id = ?`
   * 2) chitantak_local: `DELETE WHERE id = ?`
   *
   * Tranzakcióba csomagolva, hogy a részleges állapot ne maradjon.
   */
  async deleteLocalChitanta(localId: string): Promise<void> {
    // A két UPDATE/DELETE külön hívás — a Rust dbExecute nem támogat
    // tranzakciót egy hívásban. A konfliktus-resolve ritka művelet (user
    // kézi kiváltású), a részleges állapot kockázata elfogadható: ha a
    // wallet-release lefut de a chitanta-delete nem, a user újra-futtathatja
    // (a chitanta sor továbbra is látszik conflict-ben). Ha a chitanta-delete
    // lefut de a wallet-release nem, a szám a walletben ragad `used=1`
    // referenciával — ami statikus ghost-sor, de nem korrumpálja a rendszert.
    await dbExecute(
      `UPDATE chitanta_wallet_local
         SET used = 0, used_at = NULL, used_for_chitanta_local_id = NULL
       WHERE used_for_chitanta_local_id = ?1`,
      [localId],
    )
    await dbExecute(
      `DELETE FROM chitantak_local WHERE id = ?1`,
      [localId],
    )
  }

  /**
   * A-M7.2d2d — Konfliktus feloldás: a lokális chitanța **új sorszámra**
   * állítása. A régi wallet-szám `used=1` marad (audit-trail: „a szerver
   * elvette"), és az új számra a `claimNextWalletNumber` (külön hívás)
   * ad friss allokációt a walletből.
   *
   * Ez a metódus az `UPDATE chitantak_local`-t végzi, miután a caller
   * már sikeresen claim-elt új számot. A `sync_state` visszakerül
   * `pending`-re, a `sync_error` törlődik — a következő push-ra újra
   * megy a sor.
   */
  async updateLocalChitantaNumber(
    localId: string,
    newSorozat: string,
    newSzam: number,
  ): Promise<void> {
    await dbExecute(
      `UPDATE chitantak_local
         SET sorozat = ?1,
             szam = ?2,
             sync_state = 'pending',
             sync_error = NULL,
             updated_at = datetime('now')
       WHERE id = ?3`,
      [newSorozat, newSzam, localId],
    )
  }

  /**
   * Sikeres szerver-sync után: a lokális chitanță-sor `synced` állapotba
   * kerül, és megkapja a szerver-UUID-ját (`server_id`). A sor a
   * `chitantak_local`-ban marad, de a pending listából eltűnik — a
   * `RecentChitantasSection` már nem a borostyán-blokkban mutatja.
   */
  async markChitantaSynced(localId: string, serverId: string): Promise<void> {
    await dbExecute(
      `UPDATE chitantak_local
         SET sync_state = 'synced',
             server_id = ?1,
             sync_error = NULL,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [serverId, localId],
    )
  }

  /**
   * A szerver elutasította (unique-ütközés vagy max-retry) — a sor
   * `conflict` állapotba kerül. A lelkésznek kézzel kell rendezni:
   * másik számra áthelyezni, vagy törölni és újra-kiállítani.
   */
  async markChitantaConflict(localId: string, reason: string): Promise<void> {
    await dbExecute(
      `UPDATE chitantak_local
         SET sync_state = 'conflict',
             sync_error = ?1,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [reason, localId],
    )
  }

  /**
   * A-M7.2d2d — egyetlen lokális chitanța lekérdezése ID-ra. A konfliktus-
   * feloldás „reassign" ágához kell, amikor az új outbox-mutation payload-
   * jához újra ki kell olvasni az összes adatot a lokális sorról.
   */
  async getLocalChitanta(localId: string): Promise<{
    id: string
    congregation_id: string
    sorozat: string
    szam: number
    szamla_datum: string
    klienesseg_nev: string
    klienesseg_cui: string | null
    klienesseg_cim: string | null
    osszeg_brut: number
    reprezentand: string | null
    befizetes_id: string | null
    megjegyzes: string | null
    issued_by: string
    collected_at: string
    sync_state: 'pending' | 'synced' | 'conflict'
    sync_error: string | null
  } | null> {
    const rows = await dbSelect<{
      id: string
      congregation_id: string
      sorozat: string
      szam: number
      szamla_datum: string
      klienesseg_nev: string
      klienesseg_cui: string | null
      klienesseg_cim: string | null
      osszeg_brut: number
      reprezentand: string | null
      befizetes_id: string | null
      megjegyzes: string | null
      issued_by: string
      collected_at: string
      sync_state: 'pending' | 'synced' | 'conflict'
      sync_error: string | null
    }>(
      `SELECT id, congregation_id, sorozat, szam, szamla_datum,
              klienesseg_nev, klienesseg_cui, klienesseg_cim,
              osszeg_brut, reprezentand, befizetes_id, megjegyzes,
              issued_by, collected_at, sync_state, sync_error
         FROM chitantak_local
         WHERE id = ?1`,
      [localId],
    )
    return rows[0] ?? null
  }

  /**
   * Offline-kiállított chitanța sor beszúrása a `chitantak_local`-ba.
   *
   * A hívó (core `issueChitantaUseCase` offline-ága) a wallet-claim után
   * hívja, a saját `id`-val (`local-<uuid>`). A `sync_state` alapértelmezetten
   * `'pending'` — az outbox-push fogja `'synced'`-re átírni, ha sikerül.
   */
  async insertLocalChitanta(row: LocalChitantaRow): Promise<void> {
    await dbExecute(
      `INSERT INTO chitantak_local (
        id, congregation_id, sorozat, szam, szamla_datum,
        klienesseg_nev, klienesseg_cui, klienesseg_cim,
        osszeg_brut, reprezentand, befizetes_id, megjegyzes,
        issued_by, collected_at, sync_state, created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5,
        ?6, ?7, ?8,
        ?9, ?10, ?11, ?12,
        ?13, ?14, 'pending', datetime('now'), datetime('now')
      )`,
      [
        row.id,
        row.congregation_id,
        row.sorozat,
        row.szam,
        row.szamla_datum,
        row.klienesseg_nev,
        row.klienesseg_cui,
        row.klienesseg_cim,
        row.osszeg_brut,
        row.reprezentand,
        row.befizetes_id,
        row.megjegyzes,
        row.issued_by,
        row.collected_at,
      ],
    )
  }

  /**
   * A még-nem-sync-elt (pending + conflict) lokális chitanțák listája.
   * A desktop `RecentChitantasSection` bővítés ezt fésüli a szerver-listával.
   */
  async listLocalPendingChitantas(
    congregationId: string,
  ): Promise<
    Array<{
      id: string
      sorozat: string
      szam: number
      szamla_datum: string
      klienesseg_nev: string
      klienesseg_cim: string | null
      osszeg_brut: number
      reprezentand: string | null
      sync_state: 'pending' | 'conflict'
      sync_error: string | null
      created_at: string
    }>
  > {
    const rows = await dbSelect<{
      id: string
      sorozat: string
      szam: number
      szamla_datum: string
      klienesseg_nev: string
      klienesseg_cim: string | null
      osszeg_brut: number
      reprezentand: string | null
      sync_state: 'pending' | 'conflict'
      sync_error: string | null
      created_at: string
    }>(
      `SELECT id, sorozat, szam, szamla_datum, klienesseg_nev, klienesseg_cim,
              osszeg_brut, reprezentand, sync_state, sync_error, created_at
         FROM chitantak_local
         WHERE congregation_id = ?1 AND sync_state IN ('pending','conflict')
         ORDER BY szamla_datum DESC, created_at DESC`,
      [congregationId],
    )
    return rows
  }

  /**
   * Szám-tárca állapot — mennyi szám van még, mi a legközelebbi, mikor volt a legrégibb foglalás.
   */
  async getWalletStatus(
    congregationId: string,
    sorozat?: string,
  ): Promise<{
    availableCount: number
    usedCount: number
    nextNumber: number | null
    oldestReservedAt: string | null
  }> {
    const params: unknown[] = [congregationId]
    let sorozatClause = ''
    if (sorozat) {
      params.push(sorozat)
      sorozatClause = ' AND sorozat = ?2'
    }

    const rows = await dbSelect<{ available: number; used: number; next_szam: number | null; oldest: string | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE used = 0)           AS available,
         COUNT(*) FILTER (WHERE used = 1)           AS used,
         MIN(CASE WHEN used = 0 THEN szam END)      AS next_szam,
         MIN(CASE WHEN used = 0 THEN reserved_at END) AS oldest
       FROM chitanta_wallet_local
       WHERE congregation_id = ?1${sorozatClause}`,
      params as never,
    )
    const r = rows[0]
    return {
      availableCount: Number(r?.available ?? 0),
      usedCount: Number(r?.used ?? 0),
      nextNumber: r?.next_szam === null || r?.next_szam === undefined ? null : Number(r.next_szam),
      oldestReservedAt: r?.oldest ?? null,
    }
  }

  // ── Iratszám szám-tárca (A-M7.9a) — befizetés + kiadás közös ──

  /**
   * N sorszám beszúrása az `iratszam_wallet_local` táblába (offline-foglalás).
   * A sorszámokat a core `refillIratszamWalletUseCase` adja (szerver-oldali
   * `reserve_iratszam()` RPC eredménye).
   */
  async insertIratszamWalletNumbers(
    congregationId: string,
    tipus: IratszamTipus,
    ev: number,
    numbers: number[],
  ): Promise<void> {
    if (numbers.length === 0) return
    assertSafeIdentifier('iratszam_wallet_local', 'wallet table')
    for (const szam of numbers) {
      await dbExecute(
        `INSERT OR IGNORE INTO iratszam_wallet_local
           (congregation_id, iratszam_tipus, ev, szam, reserved_at, used)
         VALUES (?1, ?2, ?3, ?4, datetime('now'), 0)`,
        [congregationId, tipus, ev, Math.floor(szam)],
      )
    }
  }

  /**
   * Atomikusan kivesz egy szabad iratszámot az iratszám-walletből.
   *
   * Rust-oldali tranzakció garantálja a race-mentességet (lásd
   * `iratszam_wallet_claim_next` Tauri command). A `localId` a most készülő
   * `befizetes_pending_local` (vagy később `kiadas_pending_local`) sor PK-ja
   * — az audit-trailhez kötjük a wallet-szám és a pending-sor kapcsolatát.
   */
  async claimNextIratszamNumber(
    congregationId: string,
    tipus: IratszamTipus,
    ev: number,
    localId: string,
  ): Promise<{ id: number; szam: number } | null> {
    const result = await invoke<{ id: number; szam: number } | null>(
      'iratszam_wallet_claim_next',
      {
        congregationId,
        iratszamTipus: tipus,
        ev,
        localId,
      },
    )
    return result
  }

  /**
   * A claim visszadobása — csak akkor hívd, ha a pending-mentés vagy az
   * outbox-enqueue meghiúsult, és a szám még nem ment ki szerverre.
   */
  async releaseIratszamNumber(walletId: number): Promise<void> {
    await invoke('iratszam_wallet_release', { walletId })
  }

  /**
   * Iratszám-wallet állapot — mennyi szám van még, mi a legközelebbi.
   */
  async getIratszamWalletStatus(
    congregationId: string,
    tipus: IratszamTipus,
    ev: number,
  ): Promise<{
    availableCount: number
    usedCount: number
    nextNumber: number | null
    oldestReservedAt: string | null
  }> {
    const rows = await dbSelect<{
      available: number
      used: number
      next_szam: number | null
      oldest: string | null
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE used = 0)             AS available,
         COUNT(*) FILTER (WHERE used = 1)             AS used,
         MIN(CASE WHEN used = 0 THEN szam END)        AS next_szam,
         MIN(CASE WHEN used = 0 THEN reserved_at END) AS oldest
       FROM iratszam_wallet_local
       WHERE congregation_id = ?1 AND iratszam_tipus = ?2 AND ev = ?3`,
      [congregationId, tipus, ev],
    )
    const r = rows[0]
    return {
      availableCount: Number(r?.available ?? 0),
      usedCount: Number(r?.used ?? 0),
      nextNumber:
        r?.next_szam === null || r?.next_szam === undefined ? null : Number(r.next_szam),
      oldestReservedAt: r?.oldest ?? null,
    }
  }

  // ── Pending befizetés (A-M7.9a) ──

  /**
   * Offline-rögzített befizetés sor beszúrása a `befizetes_pending_local`-ba.
   *
   * A hívó (core `saveIncomeUseCase` offline-ága) a wallet-claim után hívja,
   * a saját `id`-val (`local-<uuid>`). A `sync_state` alapértelmezetten
   * `'pending'` — a `befizetes-write-sync.ts` push-er írja át `'synced'`-re,
   * ha sikerül.
   */
  async insertLocalBefizetes(row: LocalBefizetesRow): Promise<void> {
    await dbExecute(
      `INSERT INTO befizetes_pending_local (
        id, congregation_id, xkey, osszeg, datum, id_befizetescel,
        id_szemely, id_csalad, forrasa, iratszam, irattipus, fizetettev,
        megjegyzes, csalad, is_potlas, bankszamla_id, wallet_id, userid,
        sync_state, created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6,
        ?7, ?8, ?9, ?10, ?11, ?12,
        ?13, ?14, ?15, ?16, ?17, ?18,
        'pending', datetime('now'), datetime('now')
      )`,
      [
        row.id,
        row.congregation_id,
        row.xkey,
        row.osszeg,
        row.datum,
        row.id_befizetescel,
        row.id_szemely,
        row.id_csalad,
        row.forrasa,
        row.iratszam,
        row.irattipus,
        row.fizetettev,
        row.megjegyzes,
        row.csalad ? 1 : 0,
        row.is_potlas ? 1 : 0,
        row.bankszamla_id,
        row.wallet_id,
        row.userid,
      ],
    )
  }

  /**
   * Még-nem-sync-elt (pending + conflict) lokális befizetések listája évre.
   * A `RecentIncomeSection` fésüli ezt össze a szerver-listával. A `fizetettev`-et
   * is visszaadjuk, mert a conflict-resolver reassign-ja évre allokál a walletből.
   */
  async listLocalPendingBefizetes(
    congregationId: string,
    fizetettev: number,
  ): Promise<
    Array<{
      id: string
      iratszam: string
      datum: string
      osszeg: number
      id_befizetescel: number
      id_szemely: number | null
      id_csalad: number | null
      csalad: number
      forrasa: string | null
      megjegyzes: string | null
      fizetettev: number
      sync_state: 'pending' | 'conflict'
      sync_error: string | null
      created_at: string
    }>
  > {
    const rows = await dbSelect<{
      id: string
      iratszam: string
      datum: string
      osszeg: number
      id_befizetescel: number
      id_szemely: number | null
      id_csalad: number | null
      csalad: number
      forrasa: string | null
      megjegyzes: string | null
      fizetettev: number
      sync_state: 'pending' | 'conflict'
      sync_error: string | null
      created_at: string
    }>(
      `SELECT id, iratszam, datum, osszeg, id_befizetescel, id_szemely, id_csalad,
              csalad, forrasa, megjegyzes, fizetettev, sync_state, sync_error, created_at
         FROM befizetes_pending_local
         WHERE congregation_id = ?1
           AND fizetettev = ?2
           AND sync_state IN ('pending','conflict')
         ORDER BY datum DESC, created_at DESC`,
      [congregationId, fizetettev],
    )
    return rows
  }

  /**
   * Egyetlen lokális befizetés lekérdezése ID-ra (sync-payload újraépítéshez,
   * vagy konfliktus-feloldáshoz a következő alfázisban).
   */
  async getLocalBefizetes(localId: string): Promise<{
    id: string
    congregation_id: string
    xkey: string
    osszeg: number
    datum: string
    id_befizetescel: number
    id_szemely: number | null
    id_csalad: number | null
    forrasa: string | null
    iratszam: string
    irattipus: string
    fizetettev: number
    megjegyzes: string | null
    csalad: number
    is_potlas: number
    bankszamla_id: number | null
    wallet_id: number | null
    userid: string
    sync_state: 'pending' | 'synced' | 'conflict'
    sync_error: string | null
  } | null> {
    const rows = await dbSelect<{
      id: string
      congregation_id: string
      xkey: string
      osszeg: number
      datum: string
      id_befizetescel: number
      id_szemely: number | null
      id_csalad: number | null
      forrasa: string | null
      iratszam: string
      irattipus: string
      fizetettev: number
      megjegyzes: string | null
      csalad: number
      is_potlas: number
      bankszamla_id: number | null
      wallet_id: number | null
      userid: string
      sync_state: 'pending' | 'synced' | 'conflict'
      sync_error: string | null
    }>(
      `SELECT id, congregation_id, xkey, osszeg, datum, id_befizetescel,
              id_szemely, id_csalad, forrasa, iratszam, irattipus, fizetettev,
              megjegyzes, csalad, is_potlas, bankszamla_id, wallet_id, userid,
              sync_state, sync_error
         FROM befizetes_pending_local
         WHERE id = ?1`,
      [localId],
    )
    return rows[0] ?? null
  }

  /**
   * Sikeres szerver-sync után: a pending sor `synced` állapotba kerül, és
   * megkapja a szerver-int8 ID-t. A sor a `befizetes_pending_local`-ban
   * marad (audit-trail), de a pending listából eltűnik.
   */
  async markBefizetesSynced(localId: string, serverId: number): Promise<void> {
    await dbExecute(
      `UPDATE befizetes_pending_local
         SET sync_state = 'synced',
             server_id = ?1,
             sync_error = NULL,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [serverId, localId],
    )
  }

  /**
   * A szerver elutasította (unique-ütközés vagy max-retry) — `conflict`
   * állapot. A user kézzel oldja fel a konfliktus-modalban (A-M7.9c).
   */
  async markBefizetesConflict(localId: string, reason: string): Promise<void> {
    await dbExecute(
      `UPDATE befizetes_pending_local
         SET sync_state = 'conflict',
             sync_error = ?1,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [reason, localId],
    )
  }

  /**
   * A-M7.9c — Konfliktus feloldás: a lokális befizetés **törlése** + a
   * hozzá tartozó wallet-szám felszabadítása.
   *
   * A chitanta `deleteLocalChitanta` mintáját követi: a két UPDATE/DELETE
   * külön hívás, a részleges állapot kockázata elfogadható (ritka művelet,
   * újra-futtatható; ghost-sor a walletben legrosszabb esetben).
   */
  async deleteLocalBefizetes(localId: string): Promise<void> {
    await dbExecute(
      `UPDATE iratszam_wallet_local
         SET used = 0, used_at = NULL, used_for_local_id = NULL
       WHERE used_for_local_id = ?1`,
      [localId],
    )
    await dbExecute(
      `DELETE FROM befizetes_pending_local WHERE id = ?1`,
      [localId],
    )
  }

  /**
   * A-M7.9c — Konfliktus feloldás: a lokális befizetés **új iratszámra**
   * állítása. A régi wallet-szám `used=1` marad (audit-trail), és az új számot
   * a `claimNextIratszamNumber` (külön hívás) ad friss allokációt.
   *
   * Ez az UPDATE: új iratszám + sync_state visszakerül `pending`-re, a
   * sync_error törlődik — a következő push-ra újra megy a sor.
   */
  async updateLocalBefizetesNumber(
    localId: string,
    newSzam: number,
  ): Promise<void> {
    const newIratszam = String(newSzam)
    await dbExecute(
      `UPDATE befizetes_pending_local
         SET iratszam = ?1,
             sync_state = 'pending',
             sync_error = NULL,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [newIratszam, localId],
    )
  }

  // ── Pending kiadás (A-M7.9b) ──

  /**
   * Offline-rögzített kiadás sor beszúrása a `kiadas_pending_local`-ba.
   *
   * A hívó (core `saveExpenseUseCase` offline-ága) a wallet-claim után hívja.
   * A `sync_state` alapértelmezetten `'pending'` — a `kiadas-write-sync.ts`
   * push-er írja át `'synced'`-re, ha sikerül.
   */
  async insertLocalKiadas(row: LocalKiadasRow): Promise<void> {
    await dbExecute(
      `INSERT INTO kiadas_pending_local (
        id, congregation_id, xkey, osszeg, datum, ev,
        id_kiadascel, atvevoid, atvevo, forrasa,
        iratszam, irattipus, megjegyzes, vonatkozo_idoszak, kedvezmenyezett_cui,
        is_potlas, bankszamla_id, wallet_id, userid,
        sync_state, created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6,
        ?7, ?8, ?9, ?10,
        ?11, ?12, ?13, ?14, ?15,
        ?16, ?17, ?18, ?19,
        'pending', datetime('now'), datetime('now')
      )`,
      [
        row.id,
        row.congregation_id,
        row.xkey,
        row.osszeg,
        row.datum,
        row.ev,
        row.id_kiadascel,
        row.atvevoid,
        row.atvevo,
        row.forrasa,
        row.iratszam,
        row.irattipus,
        row.megjegyzes,
        row.vonatkozo_idoszak,
        row.kedvezmenyezett_cui,
        row.is_potlas ? 1 : 0,
        row.bankszamla_id,
        row.wallet_id,
        row.userid,
      ],
    )
  }

  /**
   * Még-nem-sync-elt (pending + conflict) lokális kiadások listája évre.
   * A `RecentExpenseSection` fésüli ezt össze a szerver-listával. Az `ev`-et
   * is visszaadjuk, mert a conflict-resolver reassign-ja évre allokál.
   */
  async listLocalPendingKiadas(
    congregationId: string,
    ev: number,
  ): Promise<
    Array<{
      id: string
      iratszam: string
      datum: string
      osszeg: number
      id_kiadascel: number
      atvevoid: number | null
      atvevo: string | null
      vonatkozo_idoszak: string | null
      kedvezmenyezett_cui: string | null
      megjegyzes: string | null
      ev: number
      sync_state: 'pending' | 'conflict'
      sync_error: string | null
      created_at: string
    }>
  > {
    const rows = await dbSelect<{
      id: string
      iratszam: string
      datum: string
      osszeg: number
      id_kiadascel: number
      atvevoid: number | null
      atvevo: string | null
      vonatkozo_idoszak: string | null
      kedvezmenyezett_cui: string | null
      megjegyzes: string | null
      ev: number
      sync_state: 'pending' | 'conflict'
      sync_error: string | null
      created_at: string
    }>(
      `SELECT id, iratszam, datum, osszeg, id_kiadascel, atvevoid, atvevo,
              vonatkozo_idoszak, kedvezmenyezett_cui, megjegyzes, ev,
              sync_state, sync_error, created_at
         FROM kiadas_pending_local
         WHERE congregation_id = ?1
           AND ev = ?2
           AND sync_state IN ('pending','conflict')
         ORDER BY datum DESC, created_at DESC`,
      [congregationId, ev],
    )
    return rows
  }

  /**
   * Egyetlen lokális kiadás lekérdezése ID-ra (sync-payload újraépítéshez).
   */
  async getLocalKiadas(localId: string): Promise<{
    id: string
    congregation_id: string
    xkey: string
    osszeg: number
    datum: string
    ev: number
    id_kiadascel: number
    atvevoid: number | null
    atvevo: string | null
    forrasa: string | null
    iratszam: string
    irattipus: string
    megjegyzes: string | null
    vonatkozo_idoszak: string | null
    kedvezmenyezett_cui: string | null
    is_potlas: number
    bankszamla_id: number | null
    wallet_id: number | null
    userid: string
    sync_state: 'pending' | 'synced' | 'conflict'
    sync_error: string | null
  } | null> {
    const rows = await dbSelect<{
      id: string
      congregation_id: string
      xkey: string
      osszeg: number
      datum: string
      ev: number
      id_kiadascel: number
      atvevoid: number | null
      atvevo: string | null
      forrasa: string | null
      iratszam: string
      irattipus: string
      megjegyzes: string | null
      vonatkozo_idoszak: string | null
      kedvezmenyezett_cui: string | null
      is_potlas: number
      bankszamla_id: number | null
      wallet_id: number | null
      userid: string
      sync_state: 'pending' | 'synced' | 'conflict'
      sync_error: string | null
    }>(
      `SELECT id, congregation_id, xkey, osszeg, datum, ev, id_kiadascel,
              atvevoid, atvevo, forrasa, iratszam, irattipus, megjegyzes,
              vonatkozo_idoszak, kedvezmenyezett_cui, is_potlas, bankszamla_id,
              wallet_id, userid, sync_state, sync_error
         FROM kiadas_pending_local
         WHERE id = ?1`,
      [localId],
    )
    return rows[0] ?? null
  }

  /**
   * Sikeres szerver-sync után: a pending sor `synced` állapotba kerül +
   * server_id mentve. A pending listából eltűnik (audit-trail-ben marad).
   */
  async markKiadasSynced(localId: string, serverId: number): Promise<void> {
    await dbExecute(
      `UPDATE kiadas_pending_local
         SET sync_state = 'synced',
             server_id = ?1,
             sync_error = NULL,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [serverId, localId],
    )
  }

  /**
   * A szerver elutasította (unique-ütközés vagy max-retry) — `conflict`.
   */
  async markKiadasConflict(localId: string, reason: string): Promise<void> {
    await dbExecute(
      `UPDATE kiadas_pending_local
         SET sync_state = 'conflict',
             sync_error = ?1,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [reason, localId],
    )
  }

  // ── Tagnyilvántartás (M8.0a) ──

  /**
   * Lokál szemely_local lista — szűrőkkel és diakritika-toleráns kereséssel.
   *
   * A SQLite SELECT csak a status-szűrőt és az ORDER BY-t alkalmazza; a
   * diakritika-tolerans search a JS oldalon történik (NFD normalizálás +
   * substring), mert a SQLite default collation nem ismeri a magyar/román
   * ékezeteket. A `limit` a tipikus 200-1000 sor mellett gyors marad.
   */
  async listLocalSzemely(input: SzemelyListInput): Promise<SzemelyListRow[]> {
    const limit = input.limit ?? 500

    // Status WHERE — alap a 'mind'
    const whereParts: string[] = ['congregation_id = ?1', 'isvisible = 1']
    const params: unknown[] = [input.congregationId]
    switch (input.statusFilter ?? 'aktiv') {
      case 'aktiv':
        whereParts.push('meghalt = 0')
        // member_status: lehet 'aktív' vagy NULL — a régi szemelyek member_status nélkül is aktívak
        whereParts.push("(member_status IS NULL OR member_status = 'aktív' OR member_status = 'aktiv')")
        break
      case 'meghalt':
        whereParts.push('meghalt = 1')
        break
      case 'rejtett':
        whereParts.push('isvisible = 0')
        // Az isvisible-feltételt felülírjuk
        whereParts[1] = 'isvisible = 0'
        break
      case 'mind':
      default:
        // semmi extra
        break
    }

    // ORDER BY — case-insensitive nev-rendezés
    const orderBy = input.orderBy ?? 'csaladnev-asc'
    let orderSql = ''
    switch (orderBy) {
      case 'csaladnev-asc':
        orderSql = 'ORDER BY COALESCE(csaladnev, ferjk_nev, k_nev) COLLATE NOCASE ASC, k_nev COLLATE NOCASE ASC'
        break
      case 'csaladnev-desc':
        orderSql = 'ORDER BY COALESCE(csaladnev, ferjk_nev, k_nev) COLLATE NOCASE DESC, k_nev COLLATE NOCASE DESC'
        break
      case 'sz_datum-asc':
        orderSql = 'ORDER BY sz_datum ASC NULLS LAST'
        break
      case 'sz_datum-desc':
        orderSql = 'ORDER BY sz_datum DESC NULLS LAST'
        break
      case 'id-desc':
        orderSql = 'ORDER BY id DESC'
        break
    }

    const sql = `SELECT
        id, cnp, szcs_nev, k_nev, csaladnev, ferjk_nev, allapot,
        sz_datum, ferfi, csaladfo, meghalt, member_status,
        apjaneve, anyjaneve,
        c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet, c_szcim,
        telefon, email, vallas, foglalkozas, nemzetiseg, voter_eligible,
        congregation_id, family_id, type, isvisible, megjegyzes,
        revision, updated_at
      FROM szemely_local
      WHERE ${whereParts.join(' AND ')}
      ${orderSql}
      LIMIT ${Math.floor(limit)}`

    const rows = await dbSelect<SzemelyListRow>(sql, params as never)

    // Diakritika-toleráns search a JS-oldalon (a SQLite COLLATE NOCASE nem ismeri
    // a magyar/román ékezetek normalizálását)
    const search = (input.search ?? '').trim()
    if (!search) return rows

    const norm = (s: string | null | undefined): string =>
      (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const needle = norm(search)

    return rows.filter((r) => {
      const fields = [
        r.csaladnev,
        r.k_nev,
        r.ferjk_nev,
        r.szcs_nev,
        r.c_szcim,
        r.telefon,
        r.email,
      ]
      return fields.some((f) => norm(f).includes(needle))
    })
  }

  /**
   * A-M7.9c — Konfliktus feloldás: a lokális kiadás **törlése** + a
   * hozzá tartozó wallet-szám felszabadítása.
   */
  async deleteLocalKiadas(localId: string): Promise<void> {
    await dbExecute(
      `UPDATE iratszam_wallet_local
         SET used = 0, used_at = NULL, used_for_local_id = NULL
       WHERE used_for_local_id = ?1`,
      [localId],
    )
    await dbExecute(
      `DELETE FROM kiadas_pending_local WHERE id = ?1`,
      [localId],
    )
  }

  /**
   * A-M7.9c — Konfliktus feloldás: a lokális kiadás **új iratszámra** állítása.
   * A régi wallet-szám `used=1` marad (audit-trail).
   */
  async updateLocalKiadasNumber(
    localId: string,
    newSzam: number,
  ): Promise<void> {
    const newIratszam = String(newSzam)
    await dbExecute(
      `UPDATE kiadas_pending_local
         SET iratszam = ?1,
             sync_state = 'pending',
             sync_error = NULL,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [newIratszam, localId],
    )
  }

  // ── M8.1 — szemely_pending_local (new-tag write-offline) ──────────────

  /**
   * Új tag lokális beszúrása a `szemely_pending_local` táblába. Az `id`
   * local-uuid, a `server_id` null — amíg a szerver-insert nem futott le.
   *
   * Az M8.1 write-offline alapja: a UI azonnal látja a új taget a
   * listában (optimistic), a szinkronizáció async megy.
   */
  async insertLocalSzemely(row: {
    id: string
    congregation_id: string
    cnp: string
    szcs_nev: string | null
    k_nev: string | null
    csaladnev: string | null
    ferjk_nev: string | null
    allapot: string | null
    sz_datum: string | null
    ferfi: boolean
    csaladfo: boolean
    meghalt: boolean
    member_status: string | null
    apjaneve: string | null
    anyjaneve: string | null
    id_apja: string | null
    id_anyja: string | null
    c_szam: string | null
    c_tombhaz: string | null
    c_lepcsohaz: string | null
    c_ajto: string | null
    c_emelet: string | null
    c_szcim: string | null
    telefon: string | null
    email: string | null
    vallas: string | null
    foglalkozas: string | null
    nemzetiseg: string | null
    voter_eligible: boolean
    family_id: string | null
    type: string | null
    isvisible: boolean
    megjegyzes: string | null
    userid: string
  }): Promise<void> {
    await dbExecute(
      `INSERT INTO szemely_pending_local (
        id, congregation_id, cnp, szcs_nev, k_nev, csaladnev, ferjk_nev, allapot,
        sz_datum, ferfi, csaladfo, meghalt, member_status,
        apjaneve, anyjaneve, id_apja, id_anyja,
        c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet, c_szcim,
        telefon, email, vallas, foglalkozas, nemzetiseg, voter_eligible,
        family_id, type, isvisible, megjegyzes,
        userid, sync_state, created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
        ?9, ?10, ?11, ?12, ?13,
        ?14, ?15, ?16, ?17,
        ?18, ?19, ?20, ?21, ?22, ?23,
        ?24, ?25, ?26, ?27, ?28, ?29,
        ?30, ?31, ?32, ?33,
        ?34, 'pending', datetime('now'), datetime('now')
      )`,
      [
        row.id,
        row.congregation_id,
        row.cnp,
        row.szcs_nev,
        row.k_nev,
        row.csaladnev,
        row.ferjk_nev,
        row.allapot,
        row.sz_datum,
        row.ferfi ? 1 : 0,
        row.csaladfo ? 1 : 0,
        row.meghalt ? 1 : 0,
        row.member_status,
        row.apjaneve,
        row.anyjaneve,
        row.id_apja,
        row.id_anyja,
        row.c_szam,
        row.c_tombhaz,
        row.c_lepcsohaz,
        row.c_ajto,
        row.c_emelet,
        row.c_szcim,
        row.telefon,
        row.email,
        row.vallas,
        row.foglalkozas,
        row.nemzetiseg,
        row.voter_eligible ? 1 : 0,
        row.family_id,
        row.type,
        row.isvisible ? 1 : 0,
        row.megjegyzes,
        row.userid,
      ],
    )
  }

  /**
   * Még-nem-sync-elt (pending + conflict) lokális új-tag sorok listája.
   * A members-page a "pending új tagok" blokkba teszi ki.
   */
  async listLocalPendingSzemely(congregationId: string): Promise<
    Array<{
      id: string
      server_id: number | null
      congregation_id: string
      cnp: string
      csaladnev: string | null
      k_nev: string | null
      ferjk_nev: string | null
      sz_datum: string | null
      ferfi: number
      userid: string
      sync_state: 'pending' | 'conflict'
      sync_error: string | null
      retry_count: number
      created_at: string
    }>
  > {
    return await dbSelect(
      `SELECT id, server_id, congregation_id, cnp, csaladnev, k_nev, ferjk_nev,
              sz_datum, ferfi, userid, sync_state, sync_error, retry_count, created_at
         FROM szemely_pending_local
         WHERE congregation_id = ?1
           AND sync_state IN ('pending','conflict')
         ORDER BY created_at DESC`,
      [congregationId],
    )
  }

  /**
   * Pending-sor teljes payload-ja (sync-insert újrajátszáshoz).
   */
  async getLocalPendingSzemely(localId: string): Promise<Record<string, unknown> | null> {
    const rows = await dbSelect<Record<string, unknown>>(
      `SELECT * FROM szemely_pending_local WHERE id = ?1`,
      [localId],
    )
    return rows[0] ?? null
  }

  /**
   * Kliens-oldali dupláció-check: a lokális `szemely_local` + `szemely_pending_local`
   * kombinált CNP-ismeretéből ad választ. A szerver-oldali UNIQUE constraint a
   * végső védelem, de a lelkésznek gyors UX-feedbacket akarunk adni.
   */
  async findSzemelyByCnp(congregationId: string, cnp: string): Promise<
    | {
        source: 'szemely_local' | 'szemely_pending_local'
        id: number | string
        csaladnev: string | null
        k_nev: string | null
      }
    | null
  > {
    const liveRows = await dbSelect<{
      id: number
      csaladnev: string | null
      k_nev: string | null
    }>(
      `SELECT id, csaladnev, k_nev FROM szemely_local
         WHERE congregation_id = ?1 AND cnp = ?2 LIMIT 1`,
      [congregationId, cnp],
    )
    if (liveRows[0]) {
      return { source: 'szemely_local', ...liveRows[0] }
    }
    const pendingRows = await dbSelect<{
      id: string
      csaladnev: string | null
      k_nev: string | null
    }>(
      `SELECT id, csaladnev, k_nev FROM szemely_pending_local
         WHERE congregation_id = ?1 AND cnp = ?2
           AND sync_state IN ('pending','conflict')
         LIMIT 1`,
      [congregationId, cnp],
    )
    if (pendingRows[0]) {
      return { source: 'szemely_pending_local', ...pendingRows[0] }
    }
    return null
  }

  /**
   * Sikeres szerver-sync: a pending sor `synced` + server_id. Egyidejűleg
   * a most-érkezett szerver-szemely-t (ami majd a pullMembers-en keresztül
   * jön a `szemely_local`-ba) ez a metódus nem érinti.
   */
  async markSzemelySynced(localId: string, serverId: number): Promise<void> {
    await dbExecute(
      `UPDATE szemely_pending_local
         SET sync_state = 'synced',
             server_id = ?1,
             sync_error = NULL,
             updated_at = datetime('now')
       WHERE id = ?2`,
      [serverId, localId],
    )
  }

  /**
   * A szerver elutasította (23505 CNP-unique-ütközés, vagy hálózati hiba a
   * max-retry után) — `conflict` állapot. A user kézzel oldja fel.
   */
  async markSzemelyConflict(localId: string, reason: string): Promise<void> {
    await dbExecute(
      `UPDATE szemely_pending_local
         SET sync_state = 'conflict',
             sync_error = ?1,
             retry_count = retry_count + 1,
             last_attempt_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ?2`,
      [reason, localId],
    )
  }

  /**
   * Retry-számláló és utolsó-próbálkozás-idő update (exp-backoff-támogatás).
   */
  async updateSzemelyAttempt(localId: string, reason: string): Promise<void> {
    await dbExecute(
      `UPDATE szemely_pending_local
         SET sync_error = ?1,
             retry_count = retry_count + 1,
             last_attempt_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ?2`,
      [reason, localId],
    )
  }

  /**
   * Pending sor törlése — konfliktus esetén a lelkész "Törlés" gombjára.
   */
  async deleteLocalPendingSzemely(localId: string): Promise<void> {
    await dbExecute(`DELETE FROM szemely_pending_local WHERE id = ?1`, [localId])
  }
}

// Singleton — az alkalmazás egy instance-t használ
let cachedBackend: TauriSqliteBackend | null = null

export function getTauriSqliteBackend(): TauriSqliteBackend {
  if (!cachedBackend) {
    cachedBackend = new TauriSqliteBackend()
  }
  return cachedBackend
}
