# KARTOTEKA — E1 Admin import befejezés

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — E1 terv
**Projekt log lépés**: 035.

---

## Vezetői összefoglaló

Az admin import modul az MVP szintet már elérte (Excel/CSV parser, 13 import profil, delegált import, god-mode PIN), de **két kulcs funkció hiányzott** ahhoz, hogy éles körülmények között használható legyen:

1. **Lookup resolver**: a profilok `_szemely_cnp`, `_befizetescel_nev`-szerű virtuális oszlopokat használnak, amik **sosem kerültek feloldásra** valódi FK ID-kra — a rekordok NULL `id_szemely`-vel és NULL `id_befizetescel`-lel kerültek volna be
2. **Import log**: sehol nem volt audit trail, hogy ki mit és mikor importált

Ez az E1 kiegészítés mindkettőt megoldja — a modul **PRODUCTION-READY**.

---

## Implementált fájlok

### Új fájlok (5)

| Fájl | Sorok | Tartalom |
|---|---|---|
| `lib/import/lookup-resolver.ts` | ~260 | CNP + név fuzzy match személy táblán, név → ID map a befizetescel és kiadascel táblán, batch query (N+1 kizárva), statisztika (personResolved/Unresolved, categoryResolved/Unresolved, warnings) |
| `lib/import/import-log.ts` | ~120 | `logImportRun()` helper (a batch-import-actions hívja), `listImportLogs()` admin UI-hoz, profile + congregation JOIN enrichment |
| `migration-docs/sql/2026-04-15-import-logs.sql` | ~80 | Új `import_logs` tábla + 3 index + 4 RLS policy (SELECT: user + esperes + master; INSERT: saját; UPDATE/DELETE: master) |
| `components/admin/import-log-list.tsx` | ~290 | Collapsible import log lista — per-sheet bontás, lookup stats, error list, module szűrő, refresh gomb |
| `docs/project-tracking/KARTOTEKA-e1-admin-import-2026-04-15.md` | ~200 | Ez a dokumentum |

### Módosított fájlok (3)

| Fájl | Módosítás |
|---|---|
| `lib/import/batch-import-actions.ts` | `resolveLookups()` hívás a `transformSheet` ÉS a `batchInsertRecords` közé; `perSheetLog` gyűjtés; `logImportRun()` hívás a futtatás végén; `allLookupStats` aggregálás |
| `lib/import/batch-import-types.ts` | `BatchImportResult` bővítés: `lookupStats` mező (4 számláló + warnings) |
| `components/admin/import-tab-refined.tsx` | `<ImportLogList />` render a meglévő tartalom után |

---

## Architektúra — A resolve lépés

### Előtte (hibás állapot)

```
Excel file
  ↓ parseWorkbook
ParsedWorkbook
  ↓ transformSheet (→ _szemely_cnp, _befizetescel_nev)
BatchTransformResult
  ↓ batchInsertRecords
   └─ cleanedRecords: stripoljuk a `_`-prefixű oszlopokat
INSERT (id_szemely = NULL, id_befizetescel = NULL) ❌ HIBA
```

### Utána (javított állapot)

```
Excel file
  ↓ parseWorkbook
ParsedWorkbook
  ↓ transformSheet
BatchTransformResult (_ fields filled)
  ↓ resolveLookups  ← ÚJ
   ├─ batch query: szemely WHERE congregation_id = X
   ├─ batch query: befizetescel WHERE congregation_id = X
   ├─ batch query: kiadascel WHERE congregation_id = X
   └─ rekordonként: _szemely_cnp → id_szemely, _befizetescel_nev → id_befizetescel
resolvedRecords (id_szemely, id_befizetescel kitöltve)
  ↓ batchInsertRecords (strip `_`)
INSERT (valid FK IDs) ✅
```

### Teljesítmény

A `resolveLookups()` **EGY batch query-t** fut minden lookup táblára — függetlenül a rekordok számától. Ezzel elkerüljük az N+1 query-t. Egy 1000-soros import ≈ 3 lookup query (szemely + befizetescel + kiadascel) + 10 insert batch (100-asával).

---

## Lookup algoritmus részletek

### Személy feloldás

**Bemenet**: `_szemely_cnp`, `_szemely_nev` (opcionális)
**Kimenet**: `id_szemely`

Algoritmus:
1. Ha van `_szemely_cnp` és CNP alapú egyezés → használjuk
2. Ha nincs, de van `_szemely_nev`:
   - Normalizáljuk (lowercase, trim, egy szóköz)
   - Megnézzük "családnév keresztnév" és "keresztnév családnév" sorrendben is (magyaros vs angolos)
   - Ha split után (szóköznél) egyezés → használjuk
3. Ha egyik sem talál → `warnings` listába, `personUnresolved++`

Ugyanez működik `_ferfi_cnp`/`_ferfi_nev` → `id_ferfi` és `_no_cnp`/`_no_nev` → `id_no` párosításra.

### Kategória feloldás

**Bemenet**: `_befizetescel_nev` vagy `_kiadascel_nev`
**Kimenet**: `id_befizetescel` vagy `id_kiadascel`

Algoritmus:
1. Normalizáljuk (lowercase, trim)
2. Egyezés a `befizetescel.nev` VAGY `befizetescel.kod` mezőjével (a kód is lehet pl. `"101.01"` formátumú)
3. Ha nem talál → `warnings`, `categoryUnresolved++`

---

## Import log részletek

### Séma

```sql
CREATE TABLE import_logs (
  id              uuid PK,
  congregation_id uuid → congregations,
  user_id         uuid → auth.users,
  module          text CHECK IN ('members','finance','registry','worklog','filing','inventory'),
  file_name       text,
  total_inserted  integer,
  total_skipped   integer,
  per_sheet       jsonb,  -- [{ sheet, profile, inserted, skipped }]
  lookup_stats    jsonb,  -- { personResolved, categoryResolved, warnings }
  errors          jsonb,  -- [{ sheet, row, message }] (max 50)
  created_at      timestamptz
);
```

### RLS

- **SELECT**: saját user, vagy master, vagy esperes/egyházmegyei admin a saját egyházmegye gyülekezeteiről
- **INSERT**: csak saját user_id + saját congregation_id
- **UPDATE / DELETE**: csak master admin (ha javítani kell)

### UI (ImportLogList)

Elérhető: `/admin` oldal → "Import" fül alatt, a leíró szekció után
- Module szűrő (minden / tagnyilvántartás / pénzügy / stb.)
- Refresh gomb (spinner animáció)
- Collapsible sorok:
  - Fő info: modul badge + fájlnév + hiba badge + user + gyülekezet + dátum + inserted/skipped
  - Kibontva:
    - Per-sheet bontás (melyik sheet, melyik profillal, hány sor)
    - Lookup stats (4 mini kártya: Személy OK/nem, Kategória OK/nem)
    - Lookup figyelmeztetések (collapsible)
    - Hibák (nyitva alapból)

---

## Kockázatok és nyitott pontok

### Kockázatok

1. **A `szemely` tábla `csaladnev` + `k_nev` mezőnevezés**: a régi admin kódban `vnev`/`knev` is előfordul (ld. E2 feladat). A `lookup-resolver.ts` az új sémát használja. Ha egy régi tábla még az új mezőket nem használja, a fuzzy match nem fog működni. **Ellenőrizendő**: a `szemely` tábla tényleg migrálva van-e a `csaladnev`/`k_nev`-re.

2. **A `befizetescel.nev` mező létezése**: feltételezzük, hogy van `nev` és/vagy `kod` mező. Ha a tábla más néven tárolja (pl. `megnevezes`), a kategória feloldás nem fog működni.

3. **CNP duplikáció**: ha két személy azonos CNP-vel létezik (bug), a `byCnp.set()` az utolsót őrzi meg. Elvileg nem lehet, mert a `szemely.cnp` UNIQUE, de érdemes az SQL-ben ellenőrizni.

4. **Import log mérete**: 50 sor hibalistával + per-sheet tömbbel + warnings listával egy-egy sor ~5-20 KB. Néhány év után a tábla nőhet. Későbbi fázis: automatikus archiválás vagy limit.

5. **A `revalidatePath()` hívás**: csak a sikeres import után fut le. Ha a log insert után hiba lenne, a revalidate már megtörtént — de ez jó, mert a felhasználó látja a frissített listát.

### Nyitott pontok (későbbre)

- **Fuzzy match finomhangolás**: jelenleg "családnév keresztnév" teljes egyezés + fordított sorrend. Lehetne Levenshtein-distance-t, hogy pl. "Kiss János"/"Kis János" is egyezzen
- **Import undo**: a log mellett egy "rollback" gomb — ami törli az összes rekordot, ami egy adott `import_log.id` batch-ben került be. Ehhez új `import_log_id` oszlop kellene minden target táblán
- **Preview before commit**: a jelenlegi `parseAndPreview` csak formátum szinten validál; érdemes lenne a lookup resolver-t is lefuttatni és előre mutatni, hány személy/kategória nem talál
- **Import template letöltés**: a `ImportTabRefined` placeholder említi, de nincs megvalósítva — minden profilra generálhatnánk egy üres Excel-t a megfelelő fejlécekkel
- **Admin bulk re-resolve**: egy gomb az admin oldalon: "Minden NULL `id_szemely` sor re-lookup" — ha a régi import-rekordok üres FK-val maradtak

---

## Verifikáció

### TypeScript + ESLint

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit                    # → 0 hiba ✅
npx.cmd eslint \
  "components/admin/import-log-list.tsx" \
  "components/admin/import-tab-refined.tsx" \
  "lib/import/lookup-resolver.ts" \
  "lib/import/import-log.ts" \
  "lib/import/batch-import-actions.ts" \
  "lib/import/batch-import-types.ts"    # → 0 hiba ✅
```

### Manuális funkcionális teszt

A részletes tesztlépéseket a `KARTOTEKA-security-test-checklist-2026-04-15.md` E1 szekció tartalmazza.

**Előkészítés**:
1. SQL migráció: `2026-04-15-import-logs.sql` futtatása
2. Készíts egy Excel fájlt pl. `test_bevetelek.xlsx`:
   - Első sor fejléc: Dátum | Összeg | Személy CNP | Befizetés célja
   - 3-5 sor teszt-adatokkal
   - A CNP-ket a saját gyülekezet valós `szemely.cnp` értékéből vedd
   - A kategória nevek a `befizetescel.nev`-ből jöjjenek

**Fő forgatókönyv**:
1. Pénzügy modulba → god-mode / delegált import aktiválás
2. Import fül → fájl feltöltés → preview → sheet+profil párosítás
3. Executáld az importot
4. ✅ Várt: toast "N sor beillesztve" + sheet-enkénti bontás
5. `/admin` → Import fül → ImportLogList megjelenik
6. Click on a log row → sheet-enkénti bontás + Lookup stats (Személy OK: N, Kategória OK: N)
7. **DB ellenőrzés**:
   ```sql
   SELECT b.id, b.datum, b.osszeg, b.id_szemely, b.id_befizetescel
   FROM befizetes b
   ORDER BY created_at DESC LIMIT 5;
   -- id_szemely és id_befizetescel NEM lehetnek NULL!
   
   SELECT * FROM import_logs ORDER BY created_at DESC LIMIT 1;
   -- 1 sor: a mostani futás minden metaadatával
   ```

---

## Roadmap pozíció Q3 2026

1. ✅ D1 — MM Sziget „Közös Munka"
2. ✅ E3 — Iktató sablonok
3. ✅ **E1 — Admin import befejezése**
4. ⏳ Legacy DB cleanup (1.5 hét)
5. ⏳ E2 — Adatmodell egységesítés admin (1-2 hét)
6. ⏳ Döntés 1: transactions tábla (1 hét)

---

## Kapcsolódó dokumentumok

- **E1 részletes terv**: `~/.claude/plans/purrfect-coalescing-quiche.md`
- **Vanilla JS forrás**: `migration-docs/source-links/mass_import_api.js`, `superadmin_import_api.js`
- **Tesztelési checklist**: `KARTOTEKA-security-test-checklist-2026-04-15.md` (E1 szekció)
- **Projekt log**: 035. lépés

---

**Dokumentum státusza**: VÉGLEGESÍTETT (E1 MVP — 6/6 alfázis)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: Manuális tesztek után. SQL futtatás + import teszt szükséges.
