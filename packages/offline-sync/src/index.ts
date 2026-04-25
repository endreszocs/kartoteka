/**
 * @kartoteka/offline-sync — offline-first szinkronizációs motor.
 *
 * M6.1 skeleton (2026-04-21). A valós tartalom az M6.8-ban kerül át az
 * apps/web/lib/offline/ (~18 fájl, ~180 KB) alól, absztraktálva egy platform-
 * független StorageBackend interface mögé:
 *
 *   interface StorageBackend {
 *     select<T>(sql: string, params?: unknown[]): Promise<T[]>
 *     execute(sql: string, params?: unknown[]): Promise<void>
 *     // + tranzakciók, migrációk, settings kulcs-érték tár
 *   }
 *
 * Implementációk:
 *   - DexieBackend       (web) → IndexedDB via dexie
 *   - TauriSqliteBackend (desktop) → Tauri command → SQLCipher
 *
 * Fő modulok az M6.8 után:
 *   - table-registry       (minden offline-szinkronizált tábla regisztrálva — ma 15 KB)
 *   - pull.ts / push.ts    (delta-sync, revision + updated_at alapján)
 *   - mutation-queue.ts    (outbox, exponential backoff)
 *   - conflict-resolver.ts (revision-mismatch kezelés)
 *   - sync-orchestrator.ts (magas szintű koordinátor)
 *   - hooks/               (useSyncQuery, useSyncMutation — DI-val kapja a backendet)
 *
 * Desktop oldalon a Dexie import TILOS — ESLint szabály + tsconfig blokkol.
 * A web oldalon a SQLCipher backend fordítva TILOS (nem is elérhető).
 *
 * M6.8a (2026-04-22) — skeleton típusok + interface-ek kerültek ide. A valós
 * impl (DexieBackend, TauriSqliteBackend, orchestrator, pull/push/conflict
 * resolver) az M7 pénzügyi wave alatt gördül át az apps/web/lib/offline/-ból,
 * a tényleges scenariókkal párhuzamosan, hogy elkerüljük a premature refactor-t.
 */

export {
  type ModuleKey,
  type Mutation,
  type MutationKind,
  type PullResult,
  type PushOutcome,
  type ScopeFilter,
  type SyncMeta,
  type SyncStatus,
  type TableRegistryEntry,
} from './types'

export {
  type Platform,
  type SimpleFilter,
  type StorageBackend,
} from './backend'
