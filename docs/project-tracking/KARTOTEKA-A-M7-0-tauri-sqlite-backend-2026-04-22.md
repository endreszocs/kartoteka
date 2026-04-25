# A-M7.0 — `TauriSqliteBackend` (StorageBackend első valós desktop impl)

**Dátum:** 2026-04-22
**Fázis:** A-M7 pénzügyi wave első technikai lépése (infrastruktúra)
**Státusz:** ✅ Kivitelezve + verifikálva (7/7 Rust test PASS, TS 0 error, 27 fájl import-check tiszta)

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért kell

Az A-M6.8a csak a `StorageBackend` interface skeleton-t adta (`packages/offline-sync/src/{types,backend}.ts`). A pénzügyi use-case-ek (A-M7.1+) elkezdésének első lépése: a **desktop-oldali valós impl** meg legyen, hogy a use-case-ek tudjanak írni-olvasni az SQLCipher-ből.

**Architektúrális döntés** (véglegesítve): a DexieBackend és TauriSqliteBackend **az app-ok saját oldalán** él, NEM a shared `@kartoteka/offline-sync`-ben. Ezzel:
- A `@kartoteka/offline-sync` packaget nem terheli Dexie vagy Tauri peerDep
- A desktop-import-check (`check-desktop-banned-imports.mjs`) továbbra is tiltja a dexie-t
- A use-case-ek DI-n kapják a backend-et (pl. `{ supabase, storage: getTauriSqliteBackend(), runtime: 'desktop' }`)

## Mit csináltunk

### 1. `apps/desktop/src/lib/tauri-sqlite-backend.ts` (új, ~300 sor)

Egy class, ami a `StorageBackend` interface 11 metódusát implementálja a meglévő `dbExecute`/`dbSelect` Tauri command-okra építve.

**Kulcs design-pontok**:

- **Safety-guard**: `assertSafeIdentifier()` minden tábla- és oszlopnévre (regex `^[a-zA-Z_][a-zA-Z0-9_]*$`). User-adat soha nem kerül string-interpolációba, csak `?N` placeholder-eken keresztül.
- **Dinamikus SQL-generálás**: a `upsertServerRows` és `writeLocal` `INSERT … ON CONFLICT(pk) DO UPDATE SET …` patternt használ, a row kulcsaiból automatikusan generálja az oszloplistát.
- **Soft-delete támogatás**: a `TableRegistryEntry.softDelete = true` esetén `UPDATE SET deleted = 1`, egyébként `DELETE FROM`.
- **SyncMeta-szűrés**: a row-ban lévő `_syncStatus`, `_baseRevision`, `_pendingDelete`, `_localUpdatedAt` privát mezőket a backend kihagyja az SQL-ből (ezek Dexie-konvenciók; az SQLite oldal saját séma-tracking-ot használ).
- **Singleton** (`getTauriSqliteBackend()`): egy instance az app-ra.

**Implementált metódusok**:

| Kategória | Metódusok |
|---|---|
| Pull | `upsertServerRows` |
| Write | `writeLocal`, `deleteLocal` |
| Query | `findByPk`, `findAll` |
| Outbox | `enqueueMutation`, `getPendingMutations`, `removeMutation`, `updateMutationAttempt` |
| Settings | `getSetting`, `setSetting` (a meglévő `settings` táblára) |

### 2. Rust v8 migráció — outbox bővítés a `Mutation` típushoz

A meglévő `outbox` tábla (M2.5 óta) más oszlopneveket használ (`op`, `target_table`, `target_id`, `payload`, `retry_count`), mint amit a `Mutation` típus vár (`kind`, `table`, `pk`, stb.). **Nem átnevezem** a meglévő oszlopokat (a `sync.ts` régi logika tovább fut), csak **3 új oszlopot adok hozzá**:

```sql
ALTER TABLE outbox ADD COLUMN mutation_id TEXT;
ALTER TABLE outbox ADD COLUMN expected_revision INTEGER;
ALTER TABLE outbox ADD COLUMN last_attempt_at TEXT;
CREATE UNIQUE INDEX idx_outbox_mutation_id
  ON outbox(mutation_id) WHERE mutation_id IS NOT NULL;
```

A `TauriSqliteBackend`:
- **Beszúráskor** mindkettőt tölti: a régi oszlopokat (`op` = kind, `target_table` = table, stb.) és az új oszlopokat (`mutation_id`, `expected_revision`, `last_attempt_at`).
- **Olvasáskor** az új `mutation_id`-t használja PK-ként és csak a `mutation_id IS NOT NULL` sorokat szűri.

Ezzel a **régi sync.ts kód és az új backend együttműködik** — nincs törés, co-existence.

### 3. Cargo check + tesztek

- `cargo check` — Finished in 1.74s (v8 migration átment a compiler-en)
- `cargo test` — **7/7 PASS** (4 `auth::sanitize_key` + 3 `auth_pin::`)

## Verifikáció

```bash
# TS
cd apps/desktop && npx tsc --noEmit              # 0 error

# Rust
cd apps/desktop/src-tauri && cargo check         # Finished in 1.74s
cd apps/desktop/src-tauri && cargo test          # 7 passed

# Desktop banned-imports (A-M6.7)
node scripts/check-desktop-banned-imports.mjs    # ✅ 27 fájl, 0 tiltott
```

## Használati példa (jövőbeli A-M7.1 chitanta use-case-hez)

```ts
// A jövőbeli packages/core/src/finance/chitanta/issue-chitanta.ts
import type { StorageBackend } from '@kartoteka/offline-sync'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface IssueChitantaCtx {
  supabase: SupabaseClient
  storage: StorageBackend           // ← a TauriSqliteBackend vagy DexieBackend
  runtime: 'web' | 'desktop'
}

export async function issueChitantaUseCase(input, ctx: IssueChitantaCtx) {
  // 1. Zod-validate
  // 2. RLS-védett Supabase insert  (ha online)
  // 3. Lokális cache-frissítés:
  await ctx.storage.writeLocal(CHITANTA_TABLE, newRow, 'insert')
  // 4. Outbox enqueue (ha offline)  — a sync-orchestrator később push-olja
  if (!online) {
    await ctx.storage.enqueueMutation({ id: ulid(), kind: 'insert', ... })
  }
  return { success: true }
}
```

```ts
// apps/desktop/src/pages/penzugy/chitanta-form.tsx (A-M7.1 alatt)
import { issueChitantaUseCase } from '@kartoteka/core'
import { getTauriSqliteBackend } from '../../lib/tauri-sqlite-backend'
import { getDesktopSupabase } from '../../lib/supabase'

await issueChitantaUseCase(input, {
  supabase: getDesktopSupabase(),
  storage: getTauriSqliteBackend(),
  runtime: 'desktop',
})
```

## Mi NEM volt scope-ban (későbbi A-M7 alfázisok)

- **Domain-táblák létrehozása a SQLCipher-ben** (`chitanta_tombok_local`, `bankszamlak_local`, stb.) — ezek a Rust v9+ migrációkban jönnek az A-M7.1/M7.2-ben, ahogy a use-case-ek megkapnak figyelmet
- **DexieBackend (web oldal)** — jön az A-M7.6-ban, amikor a pénzügyi web Server Action-ök use-case-ekké alakulnak
- **Tranzakciós támogatás** (több tábla egy atomic commit-ban) — a pénzügyi use-case-ekben szükség lesz rá, akkor az orchestrator-ral együtt kerül be
- **Sync-orchestrator teljes átemelése** a `@kartoteka/offline-sync`-be — az A-M7 folyamán inkrementálisan; most a meglévő `apps/web/lib/offline/sync-orchestrator.ts` változatlan

## Lelkész informálás (feedback_lelkesz_informalas.md alapelv)

Ez a fázis **belső infrastruktúra** — a lelkész direkt UI-ban nem találkozik vele. Az informálás a következő alfázisokban jön:

- **A-M7.1** (első chitanta use-case): a `SessionStatusIndicator` "Offline munkamenet" jelzi, amikor a chitanta outbox-ba kerül; toast "Bizonylat elmentve — a következő csatlakozáskor szinkronizálódik".
- **A-M7.x** (mutation-queue UI): a `/offline` oldalon látható lista az outbox-ban lévő pending/failed/conflict mutációkról.

## Kapcsolódó fájlok

- [`apps/desktop/src/lib/tauri-sqlite-backend.ts`](../../apps/desktop/src/lib/tauri-sqlite-backend.ts) (új)
- [`apps/desktop/src-tauri/src/db.rs`](../../apps/desktop/src-tauri/src/db.rs) (+ v8 migráció 3 új outbox-oszlop)
- [`packages/offline-sync/src/backend.ts`](../../packages/offline-sync/src/backend.ts) (interface — A-M6.8a óta változatlan)
- [`packages/offline-sync/src/types.ts`](../../packages/offline-sync/src/types.ts) (types — A-M6.8a óta változatlan)

## Következő A-M7 lépések

- **A-M7.0b**: ha szükséges, a `packages/offline-sync/src/orchestrator.ts` skeleton (pull/push koordinátor, backend-agnostic); az aktuális `apps/web/lib/offline/sync-orchestrator.ts` marad változatlan, nem bontjuk szét most
- **A-M7.1**: `@kartoteka/core/finance/chitanta/issue-chitanta.ts` első use-case + zod séma + web wrapper (thin `'use server'`) + desktop kliens-komponens
- **A-M7.2**: Rust v9 migráció — `chitanta_tombok_local` tábla (a 22 pénzügyi tábla első offline-sync-elt tagja)
- **A-M7.3** és tovább: a többi 12 pénzügyi Server Action refactor-ja, az `issueChitanta` mintát követve

Az A-M7 teljes wave várhatóan 3-4 hét (a roadmap szerint).
