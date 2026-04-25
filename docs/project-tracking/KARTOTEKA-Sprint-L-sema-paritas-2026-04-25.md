# Sprint L — Migrációs séma-paritás finomhangolás (P0+P1+P2)

**Dátum**: 2026-04-25 (este, Sprint K után)
**Fázis**: A 7 új READ-only modul mirror-jainak séma-paritása a Supabase-szal
**Kódolási ciklus**: ~3 óra (audit + plan + Rust v28+v29 + sync.ts ~25 patch + 4 minimal UI bővítés)
**Státusz**: ✅ KÉSZ — build verifikáció Endre futtatja a végén

---

## 1. Vezetői összefoglaló

A mai Sprint A-K után egy **3-agentes audit** (Rust v1-v27, Supabase séma 20 tábla, webes actions.ts) feltárta a séma-eltéréseket. Az Endre által jóváhagyott P0+P1+P2 javítások most:

- **2 P0 hiba javítva**:
  - `leltar_tetelek_local.deleted` → `is_deleted` (RENAME COLUMN, Supabase-egyezés)
  - `jegyzokonyv_hatarozatok_local.napirendi_pont_id` (UUID FK hozzáadva — eddig csak a `napirendi_pont_sorszam` integer volt)
- **10 P1 funkcionális mező** hozzáadva 7 modul tábláin (keresztszülők, halálhely, munkanapló-link, határozatképesség, oldalszám, aktív bérlés, leírás+szín, állapot, userid stb.)
- **P2 sync infra**: `revision`+`updated_at` kiegészítés a 9 mirror-táblán (delta-pull/optimistic-concurrency előfeltétele a jövőbeli WRITE-flow-hoz)
- **P2 #14**: új `adrlocality_local` referencia-mirror (helyiség-név lookup a UI-ban a FK-knál)

---

## 2. Mit módosítottunk

### Rust v28 + v29 migráció — `apps/desktop/src-tauri/src/db.rs`

**v28** (P0 + P1):
- 1 RENAME COLUMN (`leltar_tetelek_local.deleted` → `is_deleted`)
- 1 új TEXT FK (`jegyzokonyv_hatarozatok_local.napirendi_pont_id`)
- 14 új mező 7 modul tábláin (`keresztszulok`, `munkanaploba`*4, `munkanaplo_id`*4, `keresztelesideje`, `hhelyid`, `leiras`, `szin`, `hatarozatkepesseg`, `oldalszam`, `userid`*2, `aktivberlesid`, `imagelnk`, `created_at`, `allapot`, `penzugy_xkey`)

**v29** (P2):
- `revision`+`updated_at` ALTER TABLE 9 mirror-táblán (leltar, iktato, presbiteri_jegyzokonyvek, sirhelytemeto, sirhely, sirhelyberles, sirhelyelhunyt, gyulekezeti_programok, annual_reports)
- Új `adrlocality_local` tábla (5 mező + 2 index)

A SQLite 3.46 (SQLCipher 4.6) támogatja a `RENAME COLUMN`-t in-place; az indexek automatikusan követik az új nevet.

### TypeScript — `apps/desktop/src/lib/sync.ts`

**P0 #1**: `InventoryItemLocalRow.deleted` → `is_deleted`; INSERT, stats SELECT-ek (4 helyen), `getLocalInventory` WHERE+SELECT mind átírva. + új mezők: `userid, penzugy_xkey, revision, updated_at`.

**P0 #2 + P1 #11**: `MinutesResolutionLocalRow` + `napirendi_pont_id, allapot` mezők. INSERT + `getLocalMinutesById` SELECT bővítve.

**P1 #3-6 (anyakönyvi 4 fő)**: 4 interface bővítés (keresztszülők, munkanaploba, munkanaplo_id, keresztelesideje, hhelyid). Supabase select-strings + INSERT-ek + 4 list-helper SELECT-listái.

**P2 (4 mozgás-tábla)**: Supabase select + INSERT + revision/updated_at hozzáadva mind a 4 mozgás-táblán (bekoltozott/elkoltozott/attert/kitert).

**P1 #7 (Programok)**: `ProgramLocalRow` + `leiras, szin, revision`. INSERT + 2 SELECT-bővítés.

**P1 #8 (Jegyzőkönyvek)**: `MinutesLocalRow` + `hatarozatkepesseg, revision, updated_at`. INSERT + 2 SELECT-bővítés.

**P1 #9 (Iktató)**: `FilingEntryLocalRow` + `oldalszam, userid, revision, updated_at`. INSERT + 1 SELECT-bővítés.

**P1 #10 + P2 (Sírhelyek)**: 4 interface bővítés. 4 INSERT (sirhelytemeto, sirhely, sirhelyberles, sirhelyelhunyt) + revision/updated_at + sirhely 3 új mező (aktivberlesid, imagelnk, created_at). 4 SELECT-bővítés.

**Annual Reports**: + `revision` mező + INSERT + SELECT.

**P2 #14 (új adrlocality helper-ek)**:
- `AdrlocalityLocalRow` interface
- `pullAdrlocalityCatalog()` — full-pull (országos referencia)
- `getLocalLocality(id)` — egyetlen lookup
- `getLocalLocalitiesByIds(ids)` — batch lookup, `Map<id, name>` visszatérés
- `getLastPullAdrlocalityIso()` — utolsó pull dátum

### UI patch-ek (4 minimal)

1. **`anyakonyv-page.tsx` `KeresztsegList`** — új „Keresztszülők" oszlop + munkanapló-badge a Dátum mellett
2. **`UpcomingPrograms.tsx`** — `leiras` 1-soros megjelenítés a cím alatt, `szin` interface bővítés (kártya-bal-szegély: későbbi sprintbe — most csak az adat-csatorna)
3. **`home-page.tsx`** — programok map bővítés `leiras + szin`-nel
4. **`jegyzokonyv-detail-page.tsx`** — határozat `allapot` chip ha nem 'elfogadva' (sárga)

---

## 3. Sprint M-re hagyott UI-bővítések (nem kritikus)

A scope-leszűkítés érdekében az alábbi UI-bővítések egy **Sprint M**-be kerülnek (a sync-szint már támogatja):

- **TemetesList „Halál helye" oszlop** — `r.hhelyid` lookup a `getLocalLocalitiesByIds`-szel (batch)
- **Munkanapló-badge** a HazassagList és TemetesList-ben (mint a KeresztsegList-en)
- **KonfirmalasList „Keresztelés ideje" oszlop**
- **Mozgás-listákban (Bekoltozott/Elkoltozott/Attert/Kitert) helyiség-név oszlop** (FK-lookup)
- **Iktato „Old." oszlop** (`oldalszam` megjelenítés)
- **Jegyzőkönyvek lista „Nem határozatképes" badge** ha `hatarozatkepesseg === 0`
- **Sírhely „aktív bérlés" badge** ha `aktivberlesid !== null`
- **Sirhely fotó** (`imagelnk`) thumbnail a parcella-sorban
- **UpcomingPrograms színsáv** a `szin` HEX-érték alapján (4px bal-szegély)
- **`adrlocality` auto-pull** a home-page mount-kor (mint a programs)

Becsült munka Sprint M-re: ~2-3 óra (mind UI-szintű, a sync-szint már kész).

---

## 4. Hatás és kockázat

- **Adat-vesztés a `deleted → is_deleted` rename-nél**: NINCS. A rename SQLite-szinten tartalom-megtartó. A meglévő pull-helper már `r.is_deleted` fallback-ot használt, így a tartalom helyes volt.
- **TS-szint**: ~25 patch a sync.ts-ben, mind interface-konzisztens. A UI-szintű hivatkozások a régi mezőkre (`it.deleted`) maradnak — most `is_deleted` szerepel mindenhol.
- **Build**: Cargo újra-fordul (2 új migráció), kb. 30-60 mp. TS-check ~10 mp.
- **Régi cache-ben még a régi mezők**: a v28+v29 migráció ALTER COLUMN-okat csinál, így a meglévő sorok megkapják az új mezőket NULL-lal (ill. revision=0, default-tel). A user a következő Pull-után friss adatot kap.
- **Defenzív UI**: az új mezők mind `?? '—'` mintával vannak megjelenítve, így a régi cache (pre-v28) is működik runtime-hibák nélkül.

---

## 5. Verifikációs teszt

```bash
cd "C:/Users/endre/Documents/APPS/Egyházi APP/KARTOTEKA"
npm install
npm run build --workspace=@kartoteka/web    # webes TS check
npm run desktop:build                        # desktop Vite + cargo + NSIS
```

**Manual**:
1. `/anyakonyv` Kereszteltek fül → új „Keresztszülők" oszlop (üres ha még nincs Pull után)
2. `/leltar` „Törölt" stat-kártya → ha a Supabase-ben van `is_deleted=true` sor, megjelenik
3. `/jegyzokonyvek/:id` határozatok → ha az `allapot` nem 'elfogadva', sárga chip
4. Dashboard `UpcomingPrograms` → ha egy programnak van `leiras`, 1 sor a cím alatt

**SQLite-szint** (PowerShell):
```powershell
sqlite3 "$env:APPDATA\com.erek.kartoteka\kartoteka.db" "PRAGMA user_version"
# → 29
sqlite3 ... "PRAGMA table_info(leltar_tetelek_local)" | findstr "is_deleted"
# → szerepel
sqlite3 ... "PRAGMA table_info(adrlocality_local)"
# → létezik
```

---

## 6. Hátralévő

- **Sprint M** (~2-3 óra): a többi UI-bővítés (8 minor patch)
- **Adrlocality auto-pull** integráció a home-page-be
- **WRITE-flow Sprint Z** (Anyakönyv) — Claude Design eredménye után

---

## 7. Dokumentáció (3-réteg modell)

- **Operatív** (ez a fájl): `docs/project-tracking/KARTOTEKA-Sprint-L-sema-paritas-2026-04-25.md` ✅
- **Strukturált**: `docs/CHANGELOG.md` bővítendő (lentebb)
- **Gondolati**: Notion napló *„Sprint L — A 3-agentes audit és a v28+v29 séma-paritás"*

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
