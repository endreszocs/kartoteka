# A-M7.9b — Kiadás write-offline

**Dátum:** 2026-04-25
**Wave:** A-M7 (pénzügy desktop)
**Státusz:** ✅ Kész (smoke-check zöld; nincs új SQL migráció)
**Megelőző:** A-M7.9a (befizetés write-offline + iratszam_pointers infrastruktúra)
**Következő:** A-M7.9c (konfliktus-feloldó dialog befizetés + kiadás esetén, a chitanța A-M7.2d2d minta szerint)

---

## Kontextus

Az A-M7.9a a befizetésre **közös infrastruktúrát** építette ki (iratszam_pointers tábla + `reserve_iratszam` RPC + lokál `iratszam_wallet_local` + `IratszamWalletPanel`), explicit céllal hogy a kiadás-write-offline ugyanezt a réteget használja. A jelen alfázis ezt aktiválja a kiadás-oldalon — **nincs új SQL migráció**, csak Rust v15 (kiadas_pending_local tábla) + core save offline-ág + UI duplikáció.

**Időigény**: 1.5 óra (vs. a befizetés 4-5 órája — a megosztott infra hozta meg a hatékonyságot, ahogy az A-M7.9a project log meg is jósolta).

---

## Új fájlok

- `apps/desktop/src/lib/kiadas-write-sync.ts` — a `befizetes-write-sync.ts` tükörképe (~280 sor)
- `docs/project-tracking/KARTOTEKA-A-M7-9b-kiadas-write-offline-2026-04-25.md` — ez a fájl

## Módosított fájlok

- `apps/desktop/src-tauri/src/db.rs` — Rust v15 migráció: `kiadas_pending_local` tábla (22 oszlop, 3 index, UNIQUE (congregation_id, ev, iratszam))
- `packages/core/src/finance/kiadas/save.ts` — `saveExpenseUseCase` offline-ág + `OfflineExpenseBackend` interface + `LocalKiadasRow` típus + `saveExpenseOfflineBranch` helper
- `packages/core/src/index.ts` — új type re-exportok
- `apps/desktop/src/lib/tauri-sqlite-backend.ts` — 5 új kiadás-pending metódus (`insertLocalKiadas`, `listLocalPendingKiadas`, `getLocalKiadas`, `markKiadasSynced`, `markKiadasConflict`)
- `apps/desktop/src/lib/auth-gate.tsx` — `startKiadasAutoSync` + `runKiadasSyncManually` bekötés
- `apps/desktop/src/pages/kiadas-page.tsx` — IratszamWalletPanel (tipus="kiadas") + KiadasOfflineWarning + ExpenseForm props (`congregationId`, `walletAvailable`) + offline save-flow + RecentExpenseSection pending blokk + `PendingExpenseBlock` komponens (~110 sor új)
- `apps/desktop/src/components/sync-status-indicator.tsx` — kiadás-pending count is bekerül a SyncCounts-ba, primaryRoute 3-utas (chitanta/befizetes/kiadas)
- `docs/CHANGELOG.md` — A-M7.9b bejegyzés

---

## Architektúra

### Kiadás-specifikus séma-eltérések a befizetéshez képest

| Mező | Befizetés | Kiadás |
|---|---|---|
| Cél FK | `id_befizetescel` | `id_kiadascel` |
| Címzett | `id_szemely` (FK) + `id_csalad` (FK) | `atvevoid` (FK szemely) + `atvevo` (TEXT) |
| Csalad-szintű | `csalad` BOOL | nincs |
| Időszak | `fizetettev` (INT) | `vonatkozo_idoszak` (TEXT, pl. „2026 01") |
| Cég-adat | nincs | `kedvezmenyezett_cui` (TEXT) |
| Datum | DATE | TIMESTAMP |
| Év forrás | `fizetettev` mező | `EXTRACT(YEAR FROM datum)` |

A `kiadas_pending_local` táblába a `ev` mezőt **kényelemből előre kiszámolva** tároljuk (nem `EXTRACT`-tel SQLite-ban, mert a `kiadas-page` és a sync-listing 8-féle helyen használja). A core helper (`saveExpenseOfflineBranch`) `new Date(clean.datum).getFullYear()`-rel adja át.

### Wallet-tipus paraméter

A `iratszam_wallet_local` tábla már most **tipus-szegmentált** (`'befizetes'` vs. `'kiadas'`), és a `iratszam_wallet_claim_next` Rust command CHECK-eli a `iratszam_tipus` paramétert. A `OfflineExpenseBackend.claimNextIratszamNumber` signature-jében literal `'kiadas'`-t kötünk — type-safe módon a TypeScript fordító ellenőrzi.

### Sync-routing (table-szerinti)

A `befizetes-write-sync.ts` és `kiadas-write-sync.ts` **független pusherek** — mindkettő a teljes outbox-listát (`getPendingMutations(50)`) lekéri, és csak a saját táblájához (`'befizetes'` / `'kiadas'`) tartozó mutation-öket dolgozza fel. Ez megőrzi az A-M7.2d2c chitanta-pusher-mintát (`m.table === 'oblio_szamlak'`), és nem igényel central dispatcher-t. Egyszerű hozzáadni új entitást (M8 tagnyilvántartás-write esetén).

---

## Smoke check eredmények

- ✅ `node scripts/check-desktop-banned-imports.mjs` — 45 fájl, 0 tiltott (44 → 45)
- ✅ `npx tsc --noEmit` packages/core — tiszta
- ✅ `npx tsc --noEmit` apps/desktop — tiszta
- ✅ `cargo check` apps/desktop/src-tauri — 1.48s
- ✅ `cargo clippy -- -D warnings` apps/desktop/src-tauri — 1.40s
- ✅ Security secret-grep — 0 találat

---

## Manuális tesztelés (Endre runs)

1. **Iratszám-tárca feltöltés**: nyisd meg a `/penzugy/kiadas` oldalt online. Új panel: „Offline iratszám-tárca · 2026 · kiadás". A „+10 szám" gombbal foglalj sorszámokat.
2. **Online kiadás rögzítés**: szokásos flow, a pending blokk **nem** jelenik meg.
3. **Offline rögzítés**: Network → Offline. Készpénzes kiadás (átvevő szöveges vagy tag, kategória, összeg). Sikerbanner: „pending, szinkronizálásra vár". Pending blokk megjelenik (borostyán Card).
4. **Auto-sync**: Network → Online. 30 mp-en belül a pending Card kiürül. Vagy „Sync most" gomb azonnali push.
5. **Cross-domain sync indicator**: ha 2 chitanță + 1 befizetés + 3 kiadás pending → a jobb felső jelölő „6 tétel szinkronra vár" + kattintásra a `/penzugy/kiadas`-ra navigál (ahol a többség van).

---

## Wave-státusz

A pénzügyi **desktop write-offline** teljes:

| Modul | Online write | Offline write | Konfliktus-feloldó UI |
|---|---|---|---|
| chitanță | A-M7.2b ✅ | A-M7.2d ✅ | A-M7.2d2d ✅ |
| befizetés | A-M7.3 ✅ | A-M7.9a ✅ | **A-M7.9c (hátra)** |
| kiadás | A-M7.4 ✅ | A-M7.9b ✅ | **A-M7.9c (hátra)** |
| belső mozgás | A-M7.6 ✅ | (offline-N/A — nem iratszám-alapú) | — |

A pénzügyi P0 wave (KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md `M7 wave` acceptance) most már:
- ✅ offline chitanță-kiállítás
- ✅ offline befizetés-rögzítés
- ✅ offline kiadás-rögzítés
- ⏳ Oblio Edge Fn (külön session)
- ⏳ bank-import (BCR/Raiffeisen/BT, külön session)

A konfliktus-feloldó dialog (A-M7.9c) **közös komponensként** építhető (egy `WriteSyncConflictDialog` paraméterezve `'befizetes' | 'kiadas'` típussal) — ~1.5 óra.
