# Pénzügyi Import Wizard — Fázis 3 (Server action-ök + SQL RPC)

**Dátum**: 2026-05-02
**Verzió**: v0.9.45 → v0.9.45 (még nincs verzió-bump)
**Sprint**: nincs

## Cél

A Fázis 2-ben elkészült 5 helper-implementáció köré server action-öket
építeni, valamint a végső import-művelethez SQL RPC-t. **Élesben még semmi
nem látható** — a UI-t a Fázis 4-6 hozza.

## Mit hoztunk létre

### 1. `lookup-resolver.ts` — két új public export
[`apps/web/lib/import/lookup-resolver.ts`](../apps/web/lib/import/lookup-resolver.ts):

- `PersonLookupMaps` interface (eddig private volt) → `export interface`
- **`buildAllPersonsLookupMap(supabase, congregationId)`** (új) — minden
  látható (`isvisible=true`) tagot betölt és a 6 keresési Map-et felépíti.
  A meglévő `buildPersonLookupMap` early-return-ol üres set-ekkel — a
  finance-import nem ad CNP/quad-set bemenetet, ezért külön wrapper kellett.
- **`lookupPersonByQuadAttempt(csaladnev, k_nev, szcs_nev, sz_datum, ferfi, maps)`** (új) —
  6-lépéses fallback-chain, public API. Visszaad: `{ id }` (egyértelmű),
  `{ candidates }` (ambiguous), vagy `null` (nincs találat).

### 2. `finance-import-types.ts`
[`apps/web/app/(dashboard)/penzugy/finance-import-types.ts`](../apps/web/app/(dashboard)/penzugy/finance-import-types.ts):

5 csoportba szervezett szerver↔kliens megosztott típus:
- `FinanceParseResult` + `FinanceSheetPreview`
- `KasszaAnalysisResult` + `KasszaStats` + `ClassifiedKasszaRow`
- `BudgetCodeResolutionResult` + `BudgetCodeResolution`
- `DonorResolutionResult` + `DonorResolution` + `ResolvedSzemelyCandidate`
- `FinanceImportItem` + `FinanceImportResult` (Fázis 6-hoz előkészítve)

### 3. `finance-import-actions.ts` — 4 server action
[`apps/web/app/(dashboard)/penzugy/finance-import-actions.ts`](../apps/web/app/(dashboard)/penzugy/finance-import-actions.ts):

**Auth**: `requireFinanceImportAccess()` helper — minden action ellenőrzi,
hogy a user `master` / `admin` / `egyhazkeruletiAdmin` vagy `konyvelo`
(approved + active). Egyébként `error` mezővel tér vissza.

**1. `parseAndPreviewFinance(formData)`**
- File parse (xlsx/xls/csv/xml) max 10 MB
- Sheet-előnézet `isKasszaSheet` flaggel
- 5 minta-sor sheet-enként

**2. `analyzeKasszaRows(formData)`**
- Kassza fül megkeresése (`name === 'kassza'`)
- A `kasszaRowToRecord` helper a fejléceket virtuális mezőkre képezi
- `splitKasszaRow` minden sorra → klasszifikáció
- Visszaad: stats + classified rows + uniqueBudgetCodes + uniqueDonorStrings

**3. `resolveBudgetCodes(formData)`**
- Egyedi kódok kigyűjtése (occurrence-szám is)
- `buildBudgetCodeMaps` — 3 batch SELECT (`szamadasicel`, `befizetescel`, `kiadascel`)
- `resolveBudgetCode` minden kódra
- Rendezés: occurrence-szám szerint csökkenő

**4. `resolveDonors(formData)`**
- Egyedi donor-stringek kigyűjtése (klasszifikáció után, csak nem-skip sorok)
- `buildAllPersonsLookupMap` — teljes szemely-tábla a gyülekezetből
- `parseDonorString` + `lookupPersonByQuadAttempt` minden donorra
- 5 státusz: `resolved` / `ambiguous` / `not-found` / `company` / `unparsed`
- Rendezés: cégek alulra, occurrence-szám szerint

A 4 action-mind a `getEffectiveAccessContext().supabase` server-side klienst
használja, így RLS-fairness garantált.

### 4. `import_finance_batch` RPC
[`migration-docs/sql/2026-05-02-finance-import-rpc.sql`](../migration-docs/sql/2026-05-02-finance-import-rpc.sql):

`SECURITY DEFINER` PL/pgSQL függvény — `(p_congregation_id, p_user_id, p_items)`,
visszaad `{inserted, skipped, errors}`.

**Auth**: a `profile_roles` táblát ellenőrzi (active + approved):
- system + admin → bármely gyülekezetre
- district + egyhazkeruleti_admin → district scope-ra
- congregation + (lelkesz | konyvelo) → csak a saját gyülekezetére

**4 kind**:
- `income` → `befizetes` INSERT
- `expense` → `kiadas` INSERT
- `internal-transfer-out` → 1 `kiadas` (kassza, bankszamla_id=NULL) +
  1 `befizetes` (bank, bankszamla_id=cél) + 1 `belsomozgas` audit-rekord,
  mind közös `belso_mozgas_xkey`-vel
- `internal-transfer-in` → fordított páros (bank kiadás + kassza bevétel)

**Tranzakció**: minden tétel `BEGIN/EXCEPTION` blokkban — egy hibás sor
nem dobja az egész batch-et, csak `skipped + errors[]`-be kerül.

**Endre futtatja** Supabase Studio-ban (`feedback_supabase_access`).

## 3-build verifikáció (mind zöld 2026-05-02)

- `npm run typecheck --workspace=@kartoteka/ui-app` ✅
- `npm run build --workspace=@kartoteka/web` ✅ (66 oldal, 14.9s compile)
- `npm run build --workspace=@kartoteka/desktop` ✅ (6.13s)
- 74/74 smoke teszt zöld

## Trade-off-ok és tanulságok

| Kérdés | Választott út | Indok |
|---|---|---|
| `lookup-resolver` belső → public API | 2 új public function (buildAll + lookup) | A meglévő `resolveLookups` túl spec, új belépőpont kell |
| Auth scope a server action-ben | `master` / `admin` / `egyhazkeruletiAdmin` / `konyvelo` | A `feedback_szerepkor_kiosztas` szerint csak admin-szintű |
| RPC csak admin-jellegű role | profile_roles 3-as scope check | Konzisztens a server action-nel |
| Auth role-nevek a sémából | A Database_schema.sql konvenciói | NEM "rendszergazda"/"gyulekezeti_konyvelo", hanem `admin`/`konyvelo`/`lelkesz` |
| `parsed` spread konfliktus | `parsedBase` (raw, isCompany kihagyva) | TS error: "raw is specified more than once" |
| Belső mozgás táblák | `befizetes` + `kiadas` + `belsomozgas` (3 INSERT) | A meglévő séma — 1 `belsomozgas` audit + 2 cikkely a fő táblákban |

## Mi következik (Fázis 4)

1. `penzugy-import-wizard.tsx` orchestrator szkelet
2. `source-type-step.tsx` — csak Kassza kártya aktív
3. `sheet-pick-step.tsx`
4. `column-mapping-step.tsx` (a tagnyilvántartás-import mintájáról)
5. `apps/web/app/(dashboard)/admin/finance-import/page.tsx` admin oldal
6. CTA link a pénzügy oldalon

A Fázis 4 első UI-t hoz.
