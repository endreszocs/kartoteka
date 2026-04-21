# Kartotéka — M6: Gyülekezet-adatok offline elérhetősége (congregations pull-sync)

**Dátum**: 2026-04-23
**Fázis**: M6 (első domain-tábla sync a profil után)
**Státusz**: Kód kész, SQL migráció még fut (Endre futtatja Supabase Studio-ban)
**Előző fázis**: [M5 — v0.2.0 első éles release](./KARTOTEKA-M5-first-release-2026-04-23.md) + [v0.3.0 reprodukció](#)
**Következő fázis**: M7 (további domain-táblák — members/szemely, finance, liturgia)

## Cél

Az M2.4–M2.6 fázisban a saját profil szinkronizáció működött (pull + push + konfliktus-kezelés). Az M6-tal ugyanez a minta kiterjed az **első domain-táblára**: a **gyülekezetekre**. A lelkész a desktop app-ban látja a **saját gyülekezete** minden releváns adatát **offline is**.

Ez nagy UX-nyereség: a lelkész a plébánián, egy falusi helyen, gyenge internettel is hozzáfér a gyülekezet IBAN-jához, éves járulék-adataihoz, logójához, adószámához.

## Mi készült el

### 1. Supabase SQL migráció (M6.1)

**Fájl**: `migration-docs/sql/2026-04-23-m6-1-congregations-revision.sql`

**Mit csinál**:
- `congregations.revision bigint NOT NULL DEFAULT 0` hozzáadás
- `congregations.updated_at timestamptz NOT NULL DEFAULT now()` hozzáadás
- `tg_congregations_bump_revision()` PL/pgSQL trigger-függvény
- `BEFORE UPDATE trigger congregations_bump_revision ON congregations`: minden UPDATE-nél revision++ és updated_at := now()
- `idx_congregations_updated_at` index delta-sync-hez (`WHERE updated_at > :last_pull ORDER BY updated_at`)

**Idempotens**: `IF NOT EXISTS` + `DROP TRIGGER IF EXISTS` minden DDL-nél → többször futtatható, nem dob hibát.

**Verifikáció a fájl végén** (futtatható `SELECT`-ek, nem csak komment):
- 4a. Oszlopok léteznek + megfelelő default/nullability
- 4b. Trigger aktív
- 4c. Trigger-függvény SQL-tartalma
- 4d. Index létezik
- 4e. Sample: sor-szám, revision-eloszlás, updated_at-tartomány
- 4f. Smoke-test: 5 gyülekezet név + revision megjelenítése

### 2. Rust SQLite migráció (M6.2)

**Fájl**: `apps/desktop/src-tauri/src/db.rs`

**Új kód**: `if current < 4 { ... PRAGMA user_version = 4; }` blokk

**Mit csinál**:
- Létrehozza a `congregations_local` táblát 27 oszloppal
- Oszlop-mapping:
  - `uuid` → `TEXT` (SQLite-ban nincs uuid)
  - `numeric` → `REAL`
  - `boolean` → `INTEGER` (0/1)
  - `timestamptz` → `TEXT` (ISO 8601 string)
- Index `updated_at`-re
- PRAGMA user_version = 4

**Oszlop-választás elve**: a desktop UI által megjelenítendő + szerkeszthető mezők. ROI-specifikus (TVA, e-factura) és címhierarchia-join (adrlocality_id, adrstreet_id) mezők **KIHAGYVA** — ezek későbbi fázisban, ha az offline használat igényli.

**A 27 oszlop**:
1. `id` (PK, TEXT)
2. `name` (NOT NULL)
3. `nev_hu`, `nev_ro`, `nev_en`
4. `district`, `egyhazmegye`, `diocese_id`
5. `adoszam`
6. `cim`, `varos`, `megye`, `iranyitoszam`
7. `email`, `telefon`, `web`
8. `iban`, `bank`
9. `eves_jarulek` (REAL), `jarulek_kedvezmenyes` (REAL), `jarulek_hatarid`
10. `cimer_url`
11. `public_slug`, `public_site_enabled` (INTEGER 0/1)
12. `revision` (INTEGER), `updated_at` (TEXT), `synced_at` (TEXT)

### 3. TS sync layer bővítés (M6.3)

**Fájl**: `apps/desktop/src/lib/sync.ts`

**Új elemek**:
- `CongregationLocalRow` TS interface (27 mező)
- `LAST_PULL_CONGREGATION_KEY = 'sync:congregations:last_pull'`
- `pullOwnCongregation(userId)` — async fn:
  1. `getLocalOwnProfile(userId)` → `congregation_id` kinyerése (gyors, cache-ből)
  2. Ha nincs lokális profil, Supabase-ből lekérdezés
  3. Ha nincs `congregation_id` (super-admin user), `pulledRows: 0`
  4. `supabase.from('congregations').select(...).eq('id', congregationId).maybeSingle()`
  5. `unknown` cast (hosszú `.select()` string miatt Supabase GenericStringError-t ad TS-ben)
  6. ON CONFLICT upsert a lokális `congregations_local`-ba
  7. Boolean → INTEGER (0/1) konverzió a `public_site_enabled`-hez
  8. Fallback `0` / `null` a `revision` / `updated_at`-hoz, ha az M6.1 SQL még nem futott
- `getLocalOwnCongregation(userId)` — először profilból olvassa a `congregation_id`-t, aztán a `congregations_local`-ból a sort
- `getLastPullCongregationIso()` — settings-ből az utolsó sync-idő

### 4. Dashboard UI (M6.4)

**Fájl**: `apps/desktop/src/pages/dashboard-page.tsx`

**Új Card**: "Saját gyülekezet — offline nézet"
- **Helye**: a „Saját profil" Card után, az „Összes profil" Card előtt (tematikailag: én → saját gyülekezet → minden profil)
- **State**: `localCongregation`, `lastPullCongregation`, `pullingCongregation`, `pullCongregationError`
- **Auto-load on mount**: `getLocalOwnCongregation(user.id)` — offline is fut
- **Pull button**: `handlePullCongregation()` — Supabase-ből letöltés, `onError` fallback esetén error-message
- **Card-tartalom** (ha van `localCongregation`):
  - **Logó** (ha van `cimer_url`): 64×64 img + név
  - **Alapadatok** táblázat: ID, név (kánoni + hu + ro), egyházkerület, egyházmegye, adószám
  - **Elérhetőség** táblázat: cím, város, megye, irányítószám, e-mail, telefon, weboldal
  - **Pénzügyi adatok** táblázat: IBAN, bank, éves járulék (+ RON), kedvezményes járulék, járulék-határidő
  - **Publikus oldal** táblázat: aktív (✅/—), slug (`/gy/...`)
  - **Sync-metadata** táblázat: revision, Supabase updated_at, lokálisan synced
- **Empty state**: ha még nincs lokális cache, pull-gombra utaló üzenet (+ super-admin eset magyarázata)

## Verifikáció

### Fordítás
- `npx tsc --noEmit` (az `apps/desktop/` root-ban): **0 hiba** (az első futtatás 17 hibát dobott a Supabase-típus-inference miatt — `unknown` cast-tal egyszeriben megoldva)
- `cargo check` (az `apps/desktop/src-tauri/` root-ban): **OK** (`Finished dev profile in 32.64s`)

### Manuális teszt-lépések (a SQL futtatása után)

1. **Supabase Studio SQL Editor** → futtatás: `2026-04-23-m6-1-congregations-revision.sql`
   - Várt kimenet: 4a oszlop-létezés + 4b trigger + 4c trigger-SQL + 4d index + 4e sample + 4f top 5 gyülekezet
2. **Desktop**: `npm run desktop:dev`
   - Auto-runsz a v4 migráció a lokális SQLCipher-en (új táblát hoz létre)
3. **Dashboard** → „Saját gyülekezet" Card → **Pull gyülekezet** gomb
4. **Várt viselkedés**:
   - Sikeres pull → táblázatok feltöltődnek a gyülekezet adataival
   - Ha van `cimer_url` → logó megjelenik
   - Újraindítás után **a Pull gomb nélkül is látható** (offline perzisztencia)
5. **Offline-teszt**: húzd ki a hálózatot, töltsd újra a Dashboard-ot → a gyülekezet-adatok továbbra is láthatók

## Kimaradó dolgok (scope-ból szándékosan kihagyva)

| Funkció | Ok | Várható fázis |
|---------|-----|---------------|
| **Írás (update)** | Admin-privilégium, nem mindenki adhat át IBAN-t módosítani | M7 vagy később |
| **Több gyülekezet egy userhez** | Dual-role eset — most single-value `profiles.congregation_id`-n dolgozunk | Profil-role rendszerrel együtt |
| **TVA / e-factura oszlopok** | ROI-specifikus, nem kell offline — admin-felületen van | Igény szerint |
| **adrlocality_id / adrstreet_id FK** | A `cim`/`varos`/`iranyitoszam` string-ben elegendő | Ha a UI "hivatalos cím" pickert kér |
| **Delta-pull (pullAllCongregations)** | Az M2.7 profiles mintájára készíthető, de super-admin-feature | M7, ha kell |
| **Release build** | Ezt egy M7 végén / release-kor kell összevonni | Későbbi `v0.4.0` release |

## Összegzett fájlok

| Fájl | Sorok | Mit változtatott |
|------|-------|------------------|
| `migration-docs/sql/2026-04-23-m6-1-congregations-revision.sql` | +118 | ÚJ SQL migráció |
| `apps/desktop/src-tauri/src/db.rs` | +59 | v4 migráció (congregations_local) |
| `apps/desktop/src/lib/sync.ts` | +192 | CongregationLocalRow + pullOwnCongregation + getLocalOwnCongregation + getLastPullCongregationIso |
| `apps/desktop/src/pages/dashboard-page.tsx` | +170 | új Card + state + handler + auto-load |
| `docs/CHANGELOG.md` | +62 | M6 bejegyzés a tetejére |
| **Összesen** | **+601 sor** | 5 fájl módosítva |

## Tanulságok

1. **Supabase type-inference korlát**: ha a `.select()` string túl hosszú (kb. 20+ oszlop), a generált `data` type `GenericStringError`-ra vált — `as unknown as {...}` cast kell a pontos típus megadásához. Ez egyszeri cast, nem field-enkénti.

2. **Boolean → INTEGER mapping SQLite-ban**: a `public_site_enabled` mezőt `row.public_site_enabled ? 1 : 0`-val konvertáljuk. A UI-ban `localCongregation.public_site_enabled === 1` hasonlítás kell — nem `=== true`. Ez egy kis ergonómiai export-konverzió, de átlátható.

3. **27-oszlopos upsert**: a 3-rétegű idézőjelezés (SQL string + paraméter-indexek + ON CONFLICT DO UPDATE) megbízható, de a hossza miatt egy külön helper (pl. `upsertCongregation(row)`) érdemes lehet a későbbi táblákhoz — ha 3+ domain-táblát hozzáadunk, ez 3×100+ soros duplikáció lesz.

4. **Git remote beállítva**: a M6 munka előtt sikerült felrakni a **30 commit** GitHub-ra (https://github.com/endreszocs/kartoteka, private). Ezután minden fázis után `git push`-olni lehet. Korábban ez volt a legnagyobb kockázat (egyetlen laptopon az összes munka).

## Következő lépés — M7 kérdései Endrének

- **Mely domain-táblát vigyük be legközelebb?** Javaslataim:
  - **`szemely` (tagnyilvántartás)** — a legnagyobb UX-nyereség, de a legtöbb oszlop (~50+), és szülő-gyerek join a `csalad`-on át
  - **`munkanaplo` (napló)** — a lelkész napi munkakönyve, fontos offline, közepes méret
  - **`liturgia_esemenyek` (istentisztelet rendje)** — kis tábla, offline nagyon értékes (gyülekezetben, ahol nincs net)
- **Release-ről**: ez még nem release-olható kód, de az M7 végén (2-3 domain-tábla után) lehet egy `v0.4.0` kiadás.
