# A-M7.1b — Első write use-case: `createChitantaTombUseCase` + szerver-trigger

**Dátum:** 2026-04-22
**Fázis:** A-M7.1b (chitanta_tombok **write** use-case + conflict-detekció alap)
**Státusz:** ✅ Kivitelezve + verifikálva; 🟡 SQL migráció Endre futtatja Supabase Studio-ban

Roadmap: [`KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`](KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md).

---

## Miért

Az A-M7.1a a read-only use-case mintapéldányát hozta. Az A-M7.1b a **write-use-case** mintát:
- Zod-validálás az input-mezőkre + üzleti-szabályokra (átfedés, 100-darab limit, számtartomány)
- RLS-védett INSERT a core-ban (nem a web Server Action-ben)
- Server-oldali `revision` trigger — az optimistic-lock és a delta-pull szerver oldali alapja

Az outbox-enqueue (true offline-write) ebben az iterációban még nincs — online-first szemantikával működik, a true-offline write a sync-orchestrator-ral érkezik (A-M7.x).

## Mit csináltunk

### 1. Zod kiegészítés — `packages/validations/src/finance/chitanta-tomb.ts`

- `createChitantaTombInputSchema` — input-mező validáció (seria trim/length, szám-int/non-negative, datuma YYYY-MM-DD regex, ár non-negative, megjegyzes max 500)
- `createChitantaTombInputFullSchema` — bővített séma két `.refine()`-nal:
  - `szam_veg >= szam_kezdet`
  - `szam_veg - szam_kezdet + 1 <= 100` (max 100 nyugta / tömb)

### 2. Use-case — `packages/core/src/finance/chitanta-tomb/create.ts` (új)

- `CreateChitantaTombCtx` — `{ supabase, storage?, runtime, userId }`
- `CreateChitantaTombResult` — discriminated union, `field` hibát jelez zod-validáció-bukásnál
- `createChitantaTombUseCase(input, ctx)`:
  1. Zod `safeParse` (ha bukik, user-barát message + field)
  2. Átfedés-check: `select … where congregation_id=… AND seria=…` → ha van (a1 ≤ b2 ∧ a2 ≥ b1) → pasztorális hiba
  3. `insert(...)` (RLS védi az adatot, a created_by = ctx.userId)
  4. Zod drift-check az insert-vissza-adott row-ra
  5. Opcionális `ctx.storage.upsertServerRows(...)` a lokális cache-hez (desktop)

### 3. SQL migráció — `chitanta_tombok.revision` + trigger

**Fájl**: [`migration-docs/sql/2026-04-22-a-m7-1b-chitanta-tombok-revision.sql`](../../migration-docs/sql/2026-04-22-a-m7-1b-chitanta-tombok-revision.sql) — Endre futtatja.

- `ALTER TABLE public.chitanta_tombok ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0`
- `CREATE TRIGGER trg_sync_chitanta_tombok BEFORE UPDATE … FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch()` — a meglévő sync-tracking helper fn (2026-04-15 óta)
- `CREATE INDEX idx_chitanta_tombok_cong_updated ON public.chitanta_tombok(congregation_id, updated_at DESC)` — delta-pull-hoz
- **4 ellenőrző SELECT** a fájl végén (oszlop, trigger, index, smoke-teszt előkészítés)

### 4. Web Server Action refaktor — `chitanta-tombok-actions.ts`

A korábbi 70+ soros `createChitantaTomb` most ~25 soros thin adapter. A validálást, átfedés-ellenőrzést, INSERT-et a core use-case végzi. Az adapter felelőssége csak a scope-kinyerés (`access.effectiveCongregationId`, `access.user.id`) és a `revalidatePath`.

## Verifikáció

```bash
cd packages/core && npm run typecheck           # 0 error
cd packages/validations && npm run typecheck    # 0 error

cd apps/web && npx tsc --noEmit                  # 0 error
cd apps/web && npm run lint                      # 0 error, 68 non-blocking img-warning
cd scripts && node check-desktop-banned-imports  # 27 fájl, 0 tiltott
```

**SQL migráció** (Endre futtatja):
- `chitanta_tombok.revision` oszlop jelenik meg
- `trg_sync_chitanta_tombok` trigger aktív (BEFORE UPDATE ROW-level)
- `idx_chitanta_tombok_cong_updated` index létezik
- Opcionális smoke-teszt: egy UPDATE → revision +1, updated_at friss

## Lelkész informálása (feedback_lelkesz_informalas.md)

Most (web): ugyanaz a UI, user nem vesz észre semmit. A **hibaüzenetek pasztorálisak**:
- "A záró szám nem lehet kisebb, mint a kezdő szám."
- "Átfedés a meglévő EREKC24 100-200 tömbbel. Ellenőrizd a számokat."
- "Egy tömbben legfeljebb 100 nyugta lehet — ellenőrizd a számokat."

A desktop (A-M7.1c-ben): offline esetén kifejezett jelzés, hogy a tömb rögzítés outbox-ba kerül.

## Mi NEM volt scope-ban

- **Outbox-enqueue** offline-mode esetén (true offline-write): a sync-orchestrator átemelésével érkezik (A-M7.x)
- **`closeChitantaTombUseCase`**: a kézi tömb-lezárás (aktiv=false) — gyors follow-up, A-M7.1b-hez hasonló minta
- **`createChitantaTombokBatch`**: a több-tömb egyszerre-rögzítés (kerületi átvétel) — 200+ sor, külön A-M7.1b2
- **Desktop `/penzugy/chitanta-tombok` route**: A-M7.1c

## Kapcsolódó fájlok

- [`packages/validations/src/finance/chitanta-tomb.ts`](../../packages/validations/src/finance/chitanta-tomb.ts) (+ 2 zod séma)
- [`packages/core/src/finance/chitanta-tomb/create.ts`](../../packages/core/src/finance/chitanta-tomb/create.ts) (új)
- [`packages/core/src/index.ts`](../../packages/core/src/index.ts) (+ re-export)
- [`migration-docs/sql/2026-04-22-a-m7-1b-chitanta-tombok-revision.sql`](../../migration-docs/sql/2026-04-22-a-m7-1b-chitanta-tombok-revision.sql) (új — Endre futtatja)
- [`apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts`](../../apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts) (`createChitantaTomb` refaktor)

## Következő

- **A-M7.1c** — desktop `/penzugy/chitanta-tombok` route: listázás offline-fallback jelzéssel + create form a desktop kliensen
- **A-M7.1b2** — `closeChitantaTombUseCase` + `createChitantaTombokBatch` (batch több tömbre)
- **A-M7.2** — aktív-tömb státusz követő (`getActiveChitantaTombStatus`) shared + `chitanta.xxx.issue` (nyugta-kiállítás)
