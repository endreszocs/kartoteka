/**
 * StorageBackend — platform-független rekord-szintű storage interface.
 *
 * M6.8a (2026-04-22) — INTERFACE-szintű skeleton. A két valós impl:
 *   - `DexieBackend`       (web)     — az apps/web/lib/offline/db.ts-ből kerül ide M7-ben
 *   - `TauriSqliteBackend` (desktop) — a Tauri `db_execute`/`db_select`/`db_status`
 *                                      command-okra épül M7+M8 alatt
 *
 * Az interface táblaszintű ("collection-like") — a Dexie natív paradigma, az
 * SQLCipher oldalon a TauriSqliteBackend generál SQL-t (UPSERT/DELETE/SELECT).
 * Így a magasabb szintű réteg (orchestrator, use-case-ek) nem foglalkozik a
 * paradigma-különbséggel.
 *
 * A fenti `Mutation` és `SyncMeta` típusok ezzel **kompatibilisek**: minden
 * rekord egy objektum, benne a saját id-vel + `_syncStatus`/`_baseRevision` meta.
 */

import type { Mutation, SyncMeta, TableRegistryEntry } from './types'

/** Szűrő kifejezés egy findAll híváshoz (egyszerű equals-AND, bonyolultabb
 *  lekérdezéseket később a magasabb szintű réteg készít). */
export type SimpleFilter = Record<string, string | number | boolean | null>

/**
 * Egy rekord-szintű storage adapter.
 *
 * **SZABÁLY**: ez a réteg **nem** tud revision-mismatch-et — a conflict-detekció
 * a magasabb szintű orchestrator dolga. A backend szimplán tárol.
 *
 * **SZABÁLY**: a mutációk NEM itt csatolódnak fel a Supabase-hez — ezt is az
 * orchestrator intézi (push-kor emeli ki a `pending-mutations` tábla sorait és
 * küldi a szervernek).
 */
export interface StorageBackend {
  /**
   * Az adott táblára pull-olt sorok helyi upsert-je.
   * **Nem** triggerel outbox-mutációt (ez egy szerverről érkező pull).
   */
  upsertServerRows<T extends { id: string | number }>(
    table: TableRegistryEntry,
    rows: T[],
  ): Promise<void>

  /**
   * Lokális írás (user edit) — triggereli az outbox-mutációt.
   * A `SyncMeta._syncStatus` `pending` lesz a rekordon.
   */
  writeLocal<T extends { id: string | number }>(
    table: TableRegistryEntry,
    row: T & Partial<SyncMeta>,
    kind: 'insert' | 'update',
  ): Promise<void>

  /**
   * Lokális soft-delete — triggereli az outbox-mutációt (`delete` kind).
   */
  deleteLocal(
    table: TableRegistryEntry,
    pk: string | number,
  ): Promise<void>

  /** Egy rekord lekérdezése primary key alapján. */
  findByPk<T>(
    table: TableRegistryEntry,
    pk: string | number,
  ): Promise<T | null>

  /** Összes rekord egyszerű szűrővel és limit-tel (vagy undefined = nincs). */
  findAll<T>(
    table: TableRegistryEntry,
    filter?: SimpleFilter,
    limit?: number,
  ): Promise<T[]>

  // ── Outbox (mutation queue) — az orchestrator használja push-kor ──

  /** Az adott rekord lokális írása utáni outbox-mutáció. */
  enqueueMutation(m: Mutation): Promise<void>

  /** Megjeleníti a függő mutációkat FIFO sorrendben. */
  getPendingMutations(limit?: number): Promise<Mutation[]>

  /** Sikeres push után a mutáció törlése. */
  removeMutation(mutationId: string): Promise<void>

  /** Sikertelen push után a mutáció update-je (attempts++, lastError). */
  updateMutationAttempt(
    mutationId: string,
    update: Pick<Mutation, 'attempts' | 'lastAttemptAt' | 'lastError'>,
  ): Promise<void>

  // ── Settings (kulcs-érték tár, delta-timestamp-ekhez) ──

  /** Egyszerű string setting olvasás (pl. `"sync:szemely:last_pull"`). */
  getSetting(key: string): Promise<string | null>

  /** Setting írás (pl. pull-timestamp frissítés). */
  setSetting(key: string, value: string): Promise<void>
}

/**
 * Platform-detekció és backend-válogatás a magasabb rétegnek.
 *
 * M6.8a-ban ez csak egy marker — a tényleges impl-eket M7-M8 alatt hozzuk be.
 * A konkrét backend-eket az app-ok adják át (DI pattern), nem ez az interface
 * keresi őket — hogy a packages nem függjön platform-specifikus csomagtól.
 */
export type Platform = 'web' | 'desktop'
