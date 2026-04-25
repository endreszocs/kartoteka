# A-M7.1a — Első pénzügyi use-case: `listChitantaTombokUseCase`

**Dátum:** 2026-04-22
**Fázis:** A-M7.1a (chitanta_tombok read-only use-case a core-ban)
**Státusz:** ✅ Kivitelezve + verifikálva (tsc + lint + cargo check + banned-imports mind zöld)

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért

Az A-M7.0-ban kiépült a `TauriSqliteBackend` (`StorageBackend` első valós impl). Az A-M7.1a az **első pénzügyi use-case** a `@kartoteka/core`-ban, ami **minta-értékű** minden jövőbeli pénzügyi use-case-hez:

- **Read-only minta** (listázás): egyszerűbb, mint write, tisztán megmutatja a 4 kulcsréteget (validations → core → adapter → platform)
- **Online-first + offline fallback**: a core use-case maga kezeli a Supabase → StorageBackend fallback-et, így a use-case hívó (web Server Action, desktop komponens) nem foglalkozik a hálózati állapottal
- **Zod-validálás**: minden szerver-rekord validálódik (DTO-drift elleni fail-fast; a tömeges sémakülönbséget nem blokkolja, csendben kihagyja a drift-soragokat)

## Mit csináltunk

### 1. Zod séma — `packages/validations/src/finance/chitanta-tomb.ts` (új)

- `chitantaTombScopeSchema` enum (`gyulekezet` | `egyhazmegye`)
- `chitantaTombRowSchema` — a Supabase `chitanta_tombok` tábla 19 oszlopos row-sémája
- `ChitantaTombStatus` interface + `computeChitantaTombStatus()` — derived mezők (maradék, következő szám)
- `@kartoteka/validations` index bővítve `export * from './finance/chitanta-tomb'`-bal

### 2. Use-case — `packages/core/src/finance/chitanta-tomb/list.ts` (új)

- `CHITANTA_TOMBOK_TABLE: TableRegistryEntry` — a table-registry egysége (supabaseTable, localTable, PK, scope, module, label, priority)
- `ListChitantaTombokInput` — `{ congregationId, activeOnly? }`
- `ListChitantaTombokCtx` — `{ supabase, storage?, runtime }`
- `ListChitantaTombokResult` — discriminated union (success/error), success esetén `source: 'supabase' | 'local'`
- `listChitantaTombokUseCase(input, ctx)`:
  1. Próba: Supabase `.from('chitanta_tombok').select('*').eq('congregation_id', …).order(…)`
  2. Zod-validálás minden sorra (drift-safe, nem blokkoló)
  3. Ha `ctx.storage` adott (desktop): `upsertServerRows()`-t hív a lokális cache frissítéséhez
  4. **Fallback**: Supabase-hiba + `ctx.storage` adott → `findAll(filter)` a lokális cache-ből

**Export** a `@kartoteka/core` index-ből: `listChitantaTombokUseCase`, `CHITANTA_TOMBOK_TABLE`, 3 típus.

### 3. Rust v9 migráció — `chitanta_tombok_local` SQLite tábla

`apps/desktop/src-tauri/src/db.rs`-ben új if-branch a `run_migrations()`-ban. A tábla-séma a Supabase `chitanta_tombok`-nak tükre:

| Oszlop | SQLite típus | Supabase oldal |
|---|---|---|
| id | TEXT PK | uuid |
| congregation_id, diocese_id | TEXT nullable | uuid nullable |
| block_nr, seria, megjegyzes | TEXT | text |
| szam_kezdet, szam_veg, darabszam_ossz, felhasznalt_darabszam | INTEGER | integer |
| vasarlas_datuma, elso_hasznalat_datum, utolso_hasznalat_datum, updated_at, synced_at | TEXT (ISO) | date / timestamptz |
| vasarlas_ara | REAL | numeric |
| aktiv | INTEGER (0/1) | boolean |
| scope | TEXT + CHECK | enum text |
| revision | INTEGER | integer |

Indexek: `(congregation_id)`, `(congregation_id, aktiv)`, `(updated_at)`. `PRAGMA user_version = 9`.

### 4. Web Server Action refaktor — `chitanta-tombok-actions.ts`

A meglévő `listChitantaTombok()` most a core use-case-t hívja:

```ts
const result = await listChitantaTombokUseCase(
  { congregationId: access.effectiveCongregationId },
  { supabase: access.supabase, runtime: 'web' },
)
```

A visszatérő `result.rows` (amiben a `congregation_id` nullable a Supabase séma szerint) a régi `ChitantaTomb` interface-hez igazodik egy **thin adapter-réteggel**: `.filter(r => r.congregation_id !== null)` + explicit mezőleképezés. A meglévő komponensek típus-kompatibilis módon használják tovább.

## Az új minta — minden jövőbeli pénzügyi use-case követi

```
packages/validations/src/finance/{domain}.ts    ← zod schema
packages/core/src/finance/{domain}/{action}.ts  ← use-case (Input/Ctx/Result)
apps/desktop/src-tauri/src/db.rs                ← Rust v{N} migration
apps/web/app/(dashboard)/penzugy/{x}-actions.ts ← thin web adapter
apps/desktop/src/pages/penzugy/{x}.tsx          ← (A-M7.1c) desktop komponens
```

## Verifikáció

```bash
npm run typecheck --workspace=@kartoteka/validations    # 0 error
npm run typecheck --workspace=@kartoteka/core           # 0 error

cd apps/web && npm run lint                              # 0 error (68 warning, változatlan)
cd apps/web && npx tsc --noEmit                          # 0 error

cd apps/desktop/src-tauri && cargo check                 # Finished in 1.16s
node scripts/check-desktop-banned-imports.mjs            # 27 fájl, 0 tiltott
```

## Lelkész informálása (feedback_lelkesz_informalas.md)

- **Web oldal**: a meglévő chitanta-tömb listázó UI **változatlanul működik** — a felhasználó nem vesz észre semmi különbséget
- **Desktop oldal** (A-M7.1c-ben): a `listChitantaTombokUseCase` a `ctx.storage = getTauriSqliteBackend()`-et kapja, így **offline** is működik
- **Offline-fallback jelzés**: a `result.source === 'local'` a UI-n megjeleníthető (pl. "Lokális gyorsítótárból, X napja friss") — ez a A-M7.1c desktop-komponensben kerül be

## Mi NEM volt scope-ban

- **A-M7.1b**: write-use-case-ek (`issueChitantaTombUseCase`, `closeChitantaTombUseCase`) + outbox-integráció
- **A-M7.1c**: desktop kliens-komponens (Dashboard-kártya "Nyugtatömbök" listázása offline-fallback-jelzéssel)
- **Szerver-oldali `revision` trigger** a chitanta_tombok táblán — az A-M7.1b SQL-migrációban jön
- **A teljes chitanta modul** (a `chitanta-actions.ts` 701 sora + UI komponensek) — az A-M7.3-ban

## Kapcsolódó fájlok

- [`packages/validations/src/finance/chitanta-tomb.ts`](../../packages/validations/src/finance/chitanta-tomb.ts) (új)
- [`packages/validations/src/index.ts`](../../packages/validations/src/index.ts) (+ re-export)
- [`packages/core/src/finance/chitanta-tomb/list.ts`](../../packages/core/src/finance/chitanta-tomb/list.ts) (új)
- [`packages/core/src/index.ts`](../../packages/core/src/index.ts) (+ re-export)
- [`apps/desktop/src-tauri/src/db.rs`](../../apps/desktop/src-tauri/src/db.rs) (+ v9 migráció)
- [`apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts`](../../apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts) (`listChitantaTombok` refaktor)

## Következő

- **A-M7.1b** — write-use-case-ek: `issueChitantaTombUseCase`, `closeChitantaTombUseCase`, outbox-integráció mutation queue-val
- **A-M7.1c** — desktop kliens-komponens: `/penzugy/chitanta-tombok` route + listázó + "offline cache" jelzés
- **A-M7.2** — aktív chitanta-tömb követő (`getActiveChitantaTombStatus`) shared-re
- **A-M7.3** — chitanta (bizonylat) modul refaktor: kiállítás, sztornózás, nyomtatás
