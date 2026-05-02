# Pénzügyi Import Wizard — Fázis 1 (Foundation)

**Dátum**: 2026-05-02
**Verzió**: v0.9.45 → v0.9.45 (csak előkészítés, nincs verzió-bump)
**Sprint**: nincs (Endre kérése: ne legyen sprint-nyomás)

## Cél

A Kartotéka v1 pénzügyi import-wizard alapjait megvetni, hogy a következő fázisok
(2–6) a foundation-on építkezhessenek. **Élesben semmi nem látható** — csak típus-
biztos szkelet, közös infrastruktúra-kiemelés, SQL migráció.

## Mit hoztunk létre

### 1. Közös import-infrastruktúra
**Új mappa**: `apps/web/components/import-shared/`

- [`wizard-stepper.tsx`](../apps/web/components/import-shared/wizard-stepper.tsx) (új) —
  a tagnyilvántartás-import stepper-éből kiemelve közös helyre.
- [`file-drop-zone.tsx`](../apps/web/components/import-shared/file-drop-zone.tsx) (új) —
  a generikus drag-drop zóna + fájl-kártya + tovább-gomb. A modulspecifikus mode-
  választók (importMode, source-type) **nem kerültek be** — azokat a modulok saját
  step-komponensei rajzolják fel a `FileDropZone` mellé.

**Re-export pajzsok** (a régi import-utak változatlanok):
- `apps/web/components/members/tagnyilvantartas-import/wizard-stepper.tsx` —
  re-exportál a `@/components/import-shared/wizard-stepper`-ből
- `apps/web/components/members/tagnyilvantartas-import/file-upload-step.tsx` —
  átírva: az `ImportMode` választó megmaradt (tagnyilvántartás-specifikus), de a
  drag-drop részt a közös `FileDropZone` adja.

### 2. PROFILE_KASSZA — új import-profil
[`apps/web/lib/import/import-profiles.ts`](../apps/web/lib/import/import-profiles.ts):

- Új `PROFILE_KASSZA` profil a `module: 'finance'` alá (a meglévő `PROFILE_INCOME`
  és `PROFILE_EXPENSE` mellett — ezek backward-compat-ként megmaradnak).
- 10 oszlop columnMap a Kassza fül 14-es struktúrájához igazodva.
- 6 virtuális mező (`_donor_string`, `_bev_osszeg`, `_kia_osszeg`, `_bev_cel_nev`,
  `_kia_cel_nev`, `_szamadasicel_kod`) a Fázis 2 helper-eknek.
- Felvettük az `FINANCE_PROFILES` tömbbe → `getProfilesByModule('finance')`
  mostantól 3 profilt ad vissza.

### 3. Pénzügyi import helper-fájlok (szkelet)
**Új mappa**: `apps/web/components/finance/finance-import/helpers/`

Minden fájl szkelet — exportálják a típusokat és stub funkciókat, hogy a Fázis 2-ben
csak az algoritmus-test kerüljön be.

- [`company-detector.ts`](../apps/web/components/finance/finance-import/helpers/company-detector.ts)
  — `detectCompany(name)` előzetes regex-set (SRL, KFT, BT, S.A., RT, ZRT,
  Pago*, Referinta).
- [`donor-string-parser.ts`](../apps/web/components/finance/finance-import/helpers/donor-string-parser.ts)
  — `parseDonorString(input)` — most még csak a cég-flag-et látja (a teljes
  algoritmus Fázis 2-ben).
- [`kassza-row-classifier.ts`](../apps/web/components/finance/finance-import/helpers/kassza-row-classifier.ts)
  — `splitKasszaRow(row)` — alap-osztályozó, "Készpénzletétel" detekció Fázis 2-ben.
- [`budget-code-resolver.ts`](../apps/web/components/finance/finance-import/helpers/budget-code-resolver.ts)
  — `buildBudgetCodeMaps()`, `resolveBudgetCode(kod, maps)`,
  `normalizeBudgetCode(input)` (utóbbi már működik).
- [`monetar-diagnostic.ts`](../apps/web/components/finance/finance-import/helpers/monetar-diagnostic.ts)
  — `diagnoseMonetar()` — csak warning-üzenettel tér vissza, parser Fázis 2-ben.

### 4. Wizard belső típusok
- [`apps/web/components/finance/finance-import/types.ts`](../apps/web/components/finance/finance-import/types.ts):
  `FinanceImportSourceType`, `FinanceWizardStage`, `FinanceWizardMode` enum-okkal.

### 5. SQL migráció
[`migration-docs/sql/2026-05-02-finance-dup-lookup-indexes.sql`](../migration-docs/sql/2026-05-02-finance-dup-lookup-indexes.sql):

- `idx_befizetes_dup_lookup` — `(congregation_id, datum, osszeg, bankszamla_id) WHERE deleted = false`
- `idx_kiadas_dup_lookup` — ugyanaz a `kiadas` táblán

A bank-import (`hasExistingBankTransaction`) is profitál ebből — közös indexek.

**Endre futtatja Supabase Studio-ban** (`feedback_supabase_access`).

## 3-build verifikáció (mind zöld)

```
npm run typecheck --workspace=@kartoteka/ui-app  → ✅ zöld
npm run build --workspace=@kartoteka/web         → ✅ zöld (66 oldal)
npm run build --workspace=@kartoteka/desktop     → ✅ zöld (Vite 9.47s)
```

## Trade-off-ok és döntések

| Kérdés | Választott út | Indok |
|---|---|---|
| Új közös wizard-stepper helye | `import-shared/` mappa | tagnyilvántartás-import nem törött (re-export pajzs) |
| FileDropZone scope | csak generikus drag-drop | mode-választók modul-specifikusak, nem közösíthetők |
| Helper-fájlok szkelet vagy teljes | szkelet | fázis-elválasztás — Fázis 2 = unit-tesztelhető algoritmus |
| @ts-expect-error vs void-érintés | void-érintés | tsc nem panaszkodik unused paramra (ESLint igen, de tsc nem) |

## Mi következik (Fázis 2)

1. `parseDonorString()` teljes algoritmus a 50-100 valós sorra
2. `detectCompany()` regex-set finomítása
3. `splitKasszaRow()` 994-soros teljes klasszifikáció (várt: ~478 income + ~79 expense + ~10-20 internal-transfer)
4. `buildBudgetCodeMaps()` Supabase batch SELECT
5. `diagnoseMonetar()` Monetar parser
6. Smoke-test runner script: `apps/web/scripts/test-finance-import-helpers.ts`
