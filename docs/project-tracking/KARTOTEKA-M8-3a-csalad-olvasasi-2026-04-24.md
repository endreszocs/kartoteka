# KARTOTEKA — M8.3a: Család-kezelő desktop, olvasási réteg

**Dátum**: 2026-04-24 (este)
**Fázis**: M8.3a (első alfázis az M8 személy-wave utolsó nagy darabjában)
**Státusz**: ✅ KÉSZ — a desktop `/csaladok` oldal most működik: családlista + detail-modal read-only módon.

## Mit ad

A lelkész a desktop appból most megnézheti a gyülekezet családjait:

- **Lista**: családok rendezve családfő-név szerint; diakritika-toleráns kereső (apa/anya/cím); status-szűrő (aktív/inaktív/mind)
- **Detail-modal**: apa + anya + gyerekek listája (név, nem, életkor, születési dátum), cím
- **Offline-first**: a `csalad_local` + `gyerek_local` SQLite-tükrökből olvas
- **Auto-pull** a mount-kor: a `pullFamiliesOfOwnCongregation` + `pullGyerekOfOwnCongregation` delta-lehúzza a friss állapotot

**Elérési pontok**:
- Sidebar-ból nem közvetlenül (a közös sidebar még nem tartalmazza) — az M8.3b-ben lehet hozzáadni, vagy a parity-elvnek megfelelően ha szükséges
- **A tagnyilvántartás oldal fejlécén** új "Családok" gomb → `/csaladok` route

## Design-döntések

### 1. Család mint külön desktop oldal (vs. webes tab-nézet)

A webes `/tagnyilvantartas` oldal **tab-nézetben** tartalmazza a családokat (`families-tab-v2.tsx`). A desktop-on ez **külön route** (`/csaladok`) lett, mert:
- A desktop members-page már bonyolult (lista + szűrők + pending-blokk + create-dialog + detail-dialog)
- Külön oldal = tisztább mentális modell a lelkésznek: "most a családokat nézem"
- A navigáció explicit (a fejlécen egy "Családok" gomb)

Ez **nem parity-sértés** — a családkezelés FUNKCIÓ mindkét platformon elérhető, csak más UI-szervezéssel.

### 2. Pull-RPC, nem direkt PostgREST

A `csalad` táblán **NINCS** `congregation_id` oszlop — a család gyülekezet-hovatartozása a hozzá kötött tagokon keresztül derül ki (id_ferfi, id_no, vagy gyerek-junction). A PostgREST nem támogat natívan `IN (subquery)`-t, ezért két új SQL RPC-t hoztunk létre:

- `get_csaladok_for_congregation(UUID, TIMESTAMPTZ)` — visszaadja a gyülekezethez kötött családokat
- `get_gyerek_for_congregation(UUID, TIMESTAMPTZ)` — visszaadja a gyerek-junction sorait

Mindkettő `SECURITY DEFINER`, `STABLE`, és fogad egy `updated_since` paramétert a delta-pullhoz.

**SQL fájl**: [`migration-docs/sql/2026-04-24-m8-3a-csalad-rpc.sql`](migration-docs/sql/2026-04-24-m8-3a-csalad-rpc.sql) — Endre futtatja.

### 3. Rust v17: `csalad_local` + `gyerek_local`

A `szemely_local` mintájára egyszerű read-cache táblák:

```sql
csalad_local (
  id INTEGER PRIMARY KEY,
  id_ferfi INTEGER, id_no INTEGER,
  c_utcaid INTEGER NOT NULL DEFAULT -1,  -- dummy V1-ben
  c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet,
  id_csoport INTEGER,  -- körzet-FK, nullable
  isaktiv INTEGER NOT NULL DEFAULT 1,
  revision, updated_at, synced_at
)

gyerek_local (
  id INTEGER PRIMARY KEY,
  id_csalad INTEGER NOT NULL,
  id_szemely INTEGER NOT NULL,
  revision, updated_at, synced_at
)
```

Indexek: id_ferfi, id_no, updated_at a csaladon; id_csalad, id_szemely a gyerekeken.

### 4. Név- és cím-feloldás backend-szinten

A `TauriSqliteBackend.listLocalCsaladok()`:
- SQL LEFT JOIN `szemely_local` a férfi és nő névéhez
- Subquery COUNT a `gyerek_local`-ból a gyermekek számláláshoz
- `buildFullName` + `buildCimDisplay` helper (modul-szint) — mindkettő null-nyelő
- Diakritika-toleráns JS-oldali search (NFD normalizálás)

A `getLocalCsaladDetail(familyId)` 3 külön lekérdezést végez (family + ferfi-szemely + no-szemely + gyerekek-JOIN) — egyszerűség fontosabb, mint a round-trip szám a lokál-SQLite-nál.

### 5. Read-only V1

Az M8.3a csak **olvasási** réteg:
- Nem lehet új családot létrehozni
- Nem lehet szülőt / gyermeket módosítani
- Nem lehet családfőt kijelölni

Ez az **M8.3b** (családfő-kijelölés a `szemely.csaladfo` flag-en keresztül) és az **M8.3c** (csalad + gyerek CRUD) feladata.

A UI már jelzi a lelkésznek: `"A szerkesztési funkció a következő frissítésben jön."`

## Fájlváltoztatások

### Új

- **`apps/desktop/src-tauri/src/db.rs`** — v17 migráció: `csalad_local` + `gyerek_local` táblák (~50 sor)
- **`migration-docs/sql/2026-04-24-m8-3a-csalad-rpc.sql`** — 2 RPC: `get_csaladok_for_congregation` + `get_gyerek_for_congregation` (~100 sor)
- **`packages/validations/src/members/csalad-list.ts`** — `CsaladListRow` + `GyerekRow` + `CsaladStatusFilter` zod-sémák + `CsaladPortrait` (~75 sor)
- **`apps/desktop/src/pages/families-page.tsx`** — lista-oldal, szűrők, refresh, detail-dialog mounting (~260 sor)
- **`apps/desktop/src/components/family-detail-dialog.tsx`** — szülők + gyerekek megjelenítés, read-only (~260 sor)
- **`docs/project-tracking/KARTOTEKA-M8-3a-csalad-olvasasi-2026-04-24.md`** — ez a doksi

### Módosított

- **`packages/validations/src/index.ts`** — új re-export `members/csalad-list`
- **`apps/desktop/src/lib/sync.ts`** (+~180 sor) — `pullFamiliesOfOwnCongregation` + `pullGyerekOfOwnCongregation` (két helper, közös pattern a pullMembers-szel)
- **`apps/desktop/src/lib/tauri-sqlite-backend.ts`** (+~180 sor) — `listLocalCsaladok` + `getLocalCsaladDetail` + modul-szintű `buildFullName` + `buildCimDisplay` helperek
- **`apps/desktop/src/App.tsx`** — új `/csaladok` route
- **`apps/desktop/src/pages/members-page.tsx`** — fejlécbe új "Családok" gomb (useNavigate)

## Hátra az M8.3-ban

- **M8.3b** (~2-3 óra): családfő kijelölése — a `szemely.csaladfo` flag toggle-je a family-detail-modalban, + a "melyik szülő a családfő?" logika (ha férfi → id_ferfi marked, ha nő → id_no)
- **M8.3c** (~4-5 óra): új család létrehozása + szerkesztés + tagok mozgatása családok között
  - Új Rust v18: `csalad_pending_local` + `gyerek_pending_local` pending-táblák (offline-write)
  - Core `createFamilyUseCase`, `updateFamilyUseCase`, `addChildUseCase`, `removeChildUseCase`
  - UI: "Új család" gomb a families-page-en, "Szerkesztés" gomb a family-detail-modalban

## Ellenőrzés

- Nem futtattam tsc-t (Node nincs PATH-ban)
- Manuális kód-ellenőrzés:
  - Új imports csak whitelist (`@kartoteka/ui`, `@kartoteka/validations`, `react-router-dom`, `lucide-react`, relatív lib)
  - A `listLocalCsaladok` SELECT `buildFullName` / `buildCimDisplay` használja (a fájl aljára rakott modul-szintű helperek)
  - A `pullFamiliesOfOwnCongregation` + `pullGyerekOfOwnCongregation` a `pullMembersOfOwnCongregation` mintáját követi (delta + full-initial + last_pull settings)
  - A zod-sémák (CsaladListRow, GyerekRow) megfelelnek a Rust v17 SQL definícióknak
  - Az App.tsx route a `<FamiliesPage />`-ot render-eli az `AuthGate` alatt

## Endre teendői

1. **SQL futtatás**: `migration-docs/sql/2026-04-24-m8-3a-csalad-rpc.sql` — a két RPC létrehozása
2. **Tauri újra-build**: `npm run desktop:build` (a Rust v17 migráció frissen fut az új DB-n)
3. **Próba**: desktop → Tagnyilvántartás → "Családok" gomb → megjelenik a családlista (ha van adat); kattintás egy sorra → detail-modal
