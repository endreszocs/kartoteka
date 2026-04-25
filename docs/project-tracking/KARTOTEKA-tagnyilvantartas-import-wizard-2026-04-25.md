# KARTOTEKA — Tagnyilvántartás Import Wizard

**Dátum**: 2026-04-25
**Státusz**: kód kész, build + lint zöld; SQL Endre futtatja; lelkészi élesteszt hátra
**Téma**: új, egyszerűbb import felület a tagnyilvántartáshoz — `szemelyek.xml` + `csaladok.xml`-höz tervezve

## Kiinduló probléma

Endre kérése: „Szükségem lesz egy általánosan használható sablonra, a Supabase
adatbázisba való importáláshoz, ami szép és felhasználóbarát! Az a túlzsúfolt
felület ami ott van tedd átláthatóvá és felhasználóbaráttá!"

Két forrás-fájl, amit be kell olvasni:

- `Adatkezelő-docs/szemelyek.xml` — Microsoft Excel SpreadsheetML 2003,
  24 oszlop, 615 sor (személyek)
- `Adatkezelő-docs/csaladok.xml` — szintén SpreadsheetML 2003,
  19 oszlop, 222 sor (családfők + családok)

## Diagnózis (felmérés)

A jelenlegi import 2 párhuzamos UI-jal él, és egyik sem klikkelhető végig:

- `components/admin/import-tab-refined.tsx` (469 sor) — admin/Import tab,
  csak preflight UI, nincs CTA gomb, „Migráció alatt" üzenetekkel ér véget.
- `components/shared/module-admin-import-tab-v2.tsx` (470 sor) — modul-szintű
  importáló, **kétszeres** fájl-feltöltővel (felső preflight + alsó
  `MultiSheetImport` komponens).

A backend stabilan állt:

- `lib/import/excel-parser.ts` — `xlsx` (SheetJS) parser, multi-sheet, fejléc-
  detekció, dátum/szám-konverzió. **Az `xlsx` lib támogatja a SpreadsheetML
  2003 XML-t is**, csak az ext-check szigorúsága zárta ki.
- `lib/import/import-profiles.ts` — profil-rendszer (columnMap + aliasok +
  autoColumns) fuzzy header-matchinggel.
- `lib/import/row-transformer.ts` — type-konverzió, kötelező-mező-validáció.
- `lib/import/lookup-resolver.ts` — virtuális `_*_cnp` → FK ID-lookup.
- `lib/import/batch-import-actions.ts` — server action `parseAndPreview` +
  `executeBatchImport` (batch insert 100-asával + audit log).

Új DB-tudás:

- `csalad` táblának **NINCS `congregation_id` oszlopa**, viszont `c_utcaid` és
  `c_szam` **NOT NULL**. A gyülekezet-hovatartozás az `id_ferfi`/`id_no`
  kapcsolaton keresztül derül ki.
- `szemely.c_utcaid` is **NOT NULL**, FK az `adrstreet`-re.
- A duplikált CNP partial unique index védve van.

## Endre által jóváhagyott döntések

1. **csaladok.xml értelmezés**: „Családfő + család együtt" — minden sor
   1 új `szemely` (csaladfo=true) + 1 új `csalad` (id_ferfi vagy id_no =
   az új szemely.id, c_szam, c_utcaid, c_tombhaz).
2. **Hely**: KÉT helyen — admin/Import tab + tagnyilvántartás "Rendszergazdai
   importáló" tab; ugyanaz a komponens.
3. **Sablonosság**: kifejezetten tagnyilvántartás-specifikus
   (`TagnyilvantartasImportWizard`); más modulokhoz külön wizardot
   építünk később.
4. **Régi UI cleanup**: a 2 régi importáló-UI lecserélve.

## Kivitelezés

### SQL (Endre futtatja)

`migration-docs/sql/2026-04-25-import-wizard-family-head-rpc.sql` —
három új PL/pgSQL függvény:

- `_resolve_or_create_locality(text)` — case-insensitive helység lookup,
  hiány esetén új `adrlocality` rekord (default county-vel)
- `_resolve_or_create_street(text, text)` — utca lookup + locality kapcsolat,
  hiány esetén új `adrstreet`
- `import_family_head_batch(target_congregation_id UUID, rows JSONB)` — fő RPC,
  master admin VAGY delegated session jogosult; soronként atomikusan beszúrja a
  szemely + csalad rekordot, az utca/helység lookup beépítve, sor-szintű
  hibák JSONB-ben térnek vissza

A fájl végén futtatható ellenőrző SELECT-ek
([feedback_sql_ellenorzes_egyben](../../C:/Users/endre/.claude/projects/.../memory/feedback_sql_ellenorzes_egyben.md)
szerint).

### Backend (kód kész)

- `lib/import/excel-parser.ts` — új `parseXmlSpreadsheet(content, fileName)`
  függvény (XLSX.read string-mode), támogatja a SpreadsheetML 2003-at
- `lib/import/batch-import-actions.ts` — `.xml` ext check + branch
  mind a `parseAndPreview`-ban, mind az `executeBatchImport`-ban
- `lib/import/import-profiles.ts`:
  - `PROFILE_PERSONS` bővítve Endre szemelyek.xml fejléceire
    (Házszám, Állapot, Teljes név, Született, Utca, Helység, Születési hely,
    Férfi, Meghalt, Családfő, Befizetési év kezdete + aliasok)
  - **Új profil**: `PROFILE_FAMILY_HEADS` — csaladok.xml-hez tervezve
    (Utca + Házszám kötelező, dual-insert szemantika a wizardban)
  - `PROFILE_FAMILIES` deprecated címkével marad backward-compat miatt
- `lib/import/row-transformer.ts` — új `applySyntheticFields(record)`:
  - `sz_datum` kompozíció Év/Hó/Nap mezőkből, ha nincs explicit dátum
  - `c_szcim` kompozíció Utca + Házszám + Helység-ből, magyar formátumban
    (pl. „Templom u. 229, Barátos")
- `lib/import/family-head-import-actions.ts` — új server action
  `executeFamilyHeadImport(formData)`: parse → transform PROFILE_FAMILY_HEADS
  szerint → cleaned rows JSON → `supabase.rpc('import_family_head_batch', ...)`
  → audit log + revalidate

### UI (kód kész)

Új mappa: `components/members/tagnyilvantartas-import/`

- `wizard-stepper.tsx` (~95 sor) — emerald-tematikus 1–4 lépés indikátor,
  reszponzív (mobil: kompakt szám-kijelzés; desktop: full)
- `file-upload-step.tsx` (~155 sor) — drag-drop + tallózás + fájl-info kártya
  + Tovább gomb
- `column-mapping-step.tsx` (~250 sor) — auto-mapping táblázat, manuális
  SELECT override-okkal, magyarázat-tooltipekkel, hiányzó kötelező mezők
  figyelmeztetésével, opcionális profil-radio (PROFILE_PERSONS ↔
  PROFILE_FAMILY_HEADS)
- `preview-step.tsx` (~200 sor) — első 10 sor előnézet az új mapping szerint,
  importálható/kihagyott becslés, profil-info kártya, nagy CTA "Import indítása"
- `result-step.tsx` (~180 sor) — eredmény-kártya (zöld pipa / sárga
  figyelmeztetés), stat-kártyák (új személyek, új családok, kihagyott, hibák),
  összecsukható hibarészletek, "Új import" gomb

Fő orchestrator: `components/members/tagnyilvantartas-import-wizard.tsx` (~360 sor)

- 4 stage state machine (`upload` → `mapping` → `preview` → `result`)
- `mode='module'` — aktív gyülekezetbe (tagnyilvántartás oldal)
- `mode='admin'` — gyülekezet-választóval (admin oldal); `getCongregations()`
  saját `useEffect`-ben tölti
- Auto-detektálja a profilt a fájlnévből (csalad → FAMILY_HEADS, szemely → PERSONS)
- A `PROFILE_FAMILY_HEADS` profilnál az új RPC-alapú `executeFamilyHeadImport`-ot hívja;
  egyébként a meglévő `executeBatchImport`-ot használja
- PageHero komponenssel header (`@kartoteka/ui-app`) — kötelező konvenció
- Sonner toast minden parse/import művelet után

### Integráció (kód kész)

- `components/shared/module-admin-workspace.tsx` — új `customImportTab?: ReactNode`
  prop; ha megadva, az "admin-import" tab azt rendereli a `ModuleAdminImportTabV2`
  helyett
- `app/(dashboard)/tagnyilvantartas/page.tsx` — `customImportTab` propnak átadja
  a `<TagnyilvantartasImportWizard mode="module" ... />` komponenst
- `components/admin/admin-tabs-v3.tsx` — `import` tab az új wizardot rendereli
  (mode='admin'), god-mode-mal védve, lent ImportLogList
- `components/admin/import-tab-refined.tsx` — **törölve** (Grep szerint nincs aktív hivatkozás)

## Hotfix — séma audit (2026-04-25 second pass)

Endre kérdésére végeztem egy második körös séma-audit-ot, és találtam egy **kritikus hibát**:

- A `szemely.c_utcaid` int FK NOT NULL, de a jelenlegi `executeBatchImport`
  flow (PROFILE_PERSONS-szal) NEM csinál utca-lookup-ot — tehát a sima
  `INSERT szemely(...)` NULL c_utcaid-ot tett volna a beérkező sorba, és a
  Postgres NOT NULL constraint hibára futott volna.

**Megoldás**:

1. **SQL módosítás**: az `_resolve_or_create_street` és `_resolve_or_create_locality`
   helperek mostantól **sose adnak vissza NULL-t**, ha legalább egy `adrcounty`
   létezik. Üres bemenetnél fallback rekordokat (`Ismeretlen utca`,
   `Ismeretlen helység`) hoznak létre / talnak meg.
2. **Server action bővítés**: `executeFamilyHeadImport` mostantól fogad
   `profileKey` és `createCsalad` formData mezőt. A `PROFILE_PERSONS`-szal is
   hívható, csak `createCsalad: false`-ra állítva — így az utca-lookup is megtörténik,
   de a `csalad` rekord nem keletkezik.
3. **Wizard refaktor**: az `executeBatchImport` ág törölve a wizardból. Mindkét
   profilra (`PROFILE_PERSONS`, `PROFILE_FAMILY_HEADS`) ugyanaz a server action,
   csak különböző flag-gel.

**Audit eredmény (mind 4 érintett tábla NOT NULL mezőire fedezet van):**

- `szemely`: cnp (placeholder), csaladfo/ferfi/meghalt (COALESCE), c_utcaid (street_id),
  befizetoev (current year), isvisible (true), type ('tag'), congregation_id (target),
  revision/updated_at (DEFAULT)
- `csalad`: c_utcaid (street_id), c_szam (feltételes — csak akkor csalad-insert ha van),
  isaktiv (true), id_ferfi VAGY id_no (a ferfi flag alapján)
- `adrstreet`: name (cleaned), localityid (locality_id)
- `adrlocality`: name (cleaned), countyid (Kovászna fallback)

**Endre újra futtatja az SQL-t** a Supabase Studio-ban — a `CREATE OR REPLACE FUNCTION`-ok
biztosítják az idempotenciát.

## Verifikáció

- ✅ `npx tsc --noEmit -p apps/web/tsconfig.json` — TypeScript zöld
- ✅ `npx eslint components/members/tagnyilvantartas-import* lib/import` — ESLint zöld
- ✅ Második körös séma audit lezárva — minden NOT NULL mezőre van fedezet

### Lelkészi élesteszt (Endre)

1. SQL futtatás a Supabase Studio-ban
   (`migration-docs/sql/2026-04-25-import-wizard-family-head-rpc.sql`)
2. `/admin` → "Import" tab → god mode aktív → wizard jelenik meg
3. Gyülekezet-választás → `szemelyek.xml` feltöltés → mapping ellenőrzés →
   preview → import indítás
4. Tagnyilvántartás táblán a 615 új tag látszik
5. `/tagnyilvantartas` → "Rendszergazdai importáló" tab → wizard
6. `csaladok.xml` feltöltés → "Családfők és családok" profil javasolt →
   import → 222 új szemely + 222 új csalad

## Nyitott kérdések — későbbre

1. **Cím-normalizálás finomítása**: az `_resolve_or_create_street` mostani
   logika alapján új utcák kerülhetnek a default county-be ("Kovászna" vagy az
   első) — a lelkész a meglévő `address-form.tsx`-szel utólag finomíthatja.
2. **Apja/Anyja FK kapcsolat**: az XML csak szöveg. Ha CNP-vel jönne, a
   `lookup-resolver` automatikusan id_apja/id_anyja-ra fordítaná.
3. **Más modulok importja**: pénzügy, anyakönyv, jegyzőkönyv, leltár stb. —
   külön wizardokban, ezt mintaként használva.

## Hivatkozások

- Plan fájl: `C:\Users\endre\.claude\plans\szia-folytatjuk-a-kartot-ka-immutable-sketch.md`
- CHANGELOG bejegyzés: `docs/CHANGELOG.md` — `[2026-04-25] — Tagnyilvántartás Import Wizard`
