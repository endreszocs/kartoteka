/**
 * Közös típusok a platform-független offline-sync réteghez.
 *
 * M6.8a (2026-04-22) — skeleton, a valós implementáció az M7 pénzügyi wave
 * alatt kerül be, a `apps/web/lib/offline/*` ~18 fájlja alól inkrementálisan.
 *
 * Ez a fájl MOST csak a _típus-kontraktust_ rögzíti, hogy a `@kartoteka/core`
 * use-case-ek már tudjanak rá hivatkozni, mielőtt a tényleges backend-ek
 * (Dexie / Tauri-SQLCipher) megérkeznek.
 */

// ─────────────────────────────────────────────────────────────────────────
// Tábla-regisztráció — a `@kartoteka/offline-sync/table-registry` magja
// (minta: apps/web/lib/offline/table-registry.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Milyen scope-on szűrjük a táblát pull-kor. */
export type ScopeFilter =
  | 'congregation_id' // saját gyülekezet sorai (a leggyakoribb)
  | 'diocese_id'      // egyházmegye szintű sorok
  | 'none'            // globális nomenklatúra (pl. adr*, nevnap)

/** A 22-modulos Tauri scope modul-azonosítói. */
export type ModuleKey =
  | 'tagnyilvantartas'
  | 'penzugy'
  | 'anyakonyv'
  | 'munkanaplo'
  | 'leltar'
  | 'iktato'
  | 'jegyzokonyvek'
  | 'eves-jelentes'
  | 'profile'
  | 'congregation'
  | 'dashboard-em'
  | 'notifications'
  | 'sirhely'
  | 'programs'
  | 'kuka'
  | 'misszios-muhely'
  | 'support'
  | 'system' // adr*, nevnap, stb.

/** Egy offline-szinkronizált tábla leírása. */
export interface TableRegistryEntry {
  /** Supabase tábla neve (forrás) */
  supabaseTable: string
  /** Lokális tábla név (Dexie collection vagy SQLCipher table). Általában azonos. */
  localTable: string
  /** Primary key mező neve */
  primaryKey: string
  /** Scope szűrő */
  scopeFilter: ScopeFilter
  /** Soft-delete használat (`deleted=true` vs. hard DELETE) */
  softDelete: boolean
  /** Melyik mezőket pull-ozzuk (`*` = mindent) */
  select?: string
  /** Modul besorolás (UI-ra, Excel-exportra) */
  module: ModuleKey
  /** Ember-olvasható magyar cím */
  label: string
  /** Pull-prioritás — kisebb szám előbb fut (pl. szemely előbb mint befizetes) */
  priority: number
}

// ─────────────────────────────────────────────────────────────────────────
// Sync-állapot egy rekord szintjén
// (minta: apps/web/lib/offline/db.ts `_syncStatus` mezője)
// ─────────────────────────────────────────────────────────────────────────

/** Egy offline-tárolt rekord sync-állapota. */
export type SyncStatus =
  | 'clean'      // szerver ↔ lokális egyező
  | 'pending'    // lokálisan módosítva, még nem push-olva
  | 'conflict'   // push-kor revision-mismatch volt, manuális feloldásra vár
  | 'deleting'   // lokálisan törölve, push-ra vár

/** A szinkron-tracked rekordok közös meta-mezői. */
export interface SyncMeta {
  /** Az adott sor sync-állapota */
  _syncStatus: SyncStatus
  /** Az utolsó szerver-oldali revision szám (konfliktus-detekcióhoz) */
  _baseRevision?: number
  /** `true`, ha a rekord helyileg törlendő, de még push-ra vár */
  _pendingDelete?: boolean
  /** Lokális utolsó módosítás ISO-timestamp */
  _localUpdatedAt?: string
}

// ─────────────────────────────────────────────────────────────────────────
// Outbox mutáció (offline write → push-ra vár)
// (minta: apps/web/lib/offline/mutation-queue.ts)
// ─────────────────────────────────────────────────────────────────────────

export type MutationKind = 'insert' | 'update' | 'delete'

export interface Mutation {
  /** Egyedi ID (ULID/UUID) — stabil throughout retry cycle */
  id: string
  /** Forrástábla (Supabase) */
  table: string
  /** Cél rekord primary key */
  pk: string
  /** Művelet típusa */
  kind: MutationKind
  /** INSERT/UPDATE payload (ha kind=insert vagy update) */
  payload?: Record<string, unknown>
  /** Az UPDATE alapja — ezzel conditional update (WHERE id=? AND revision=?) */
  expectedRevision?: number
  /** Hány próbálkozás történt eddig */
  attempts: number
  /** Utolsó próbálkozás ISO — exponential backoff-hoz */
  lastAttemptAt?: string
  /** Ha utoljára hiba volt, a szöveges üzenet — UI-ra */
  lastError?: string
  /** Mikor keletkezett (ISO) */
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────
// Pull-eredmény
// ─────────────────────────────────────────────────────────────────────────

export interface PullResult {
  /** Lekért/frissített sorok száma */
  pulledRows: number
  /** Mód (first-time full vs delta) */
  mode: 'full' | 'delta' | 'full-initial'
  /** Ezen pull-iteráció időpontja (ISO) */
  pulledAt: string
}

// ─────────────────────────────────────────────────────────────────────────
// Push-eredmény (egy mutáció-sorra)
// ─────────────────────────────────────────────────────────────────────────

export interface PushOutcome {
  mutationId: string
  /** Sikeres volt-e a szerver-oldali push */
  success: boolean
  /** Konfliktus-e (revision-mismatch) — külön kezeljük a UI-ban */
  conflict?: boolean
  /** Szerver-oldali új revision (ha success) */
  newRevision?: number
  /** Hibaüzenet (ha !success && !conflict) */
  error?: string
}
