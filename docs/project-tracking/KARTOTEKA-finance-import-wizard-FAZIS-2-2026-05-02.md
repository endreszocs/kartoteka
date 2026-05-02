# Pénzügyi Import Wizard — Fázis 2 (Helper-implementációk)

**Dátum**: 2026-05-02
**Verzió**: v0.9.45 → v0.9.45 (még nincs verzió-bump)
**Sprint**: nincs

## Cél

A Fázis 1-ben létrehozott 5 helper-szkelet (`donor-string-parser`,
`company-detector`, `kassza-row-classifier`, `budget-code-resolver`,
`monetar-diagnostic`) algoritmusainak teljes implementációja a valós EREK 2025
Kassza-fülre kalibrálva. **Élesben semmi nem látható** — Fázis 3-ban jönnek a
server action-ök, Fázis 4-6-ban a wizard UI.

## Mit hoztunk létre

### 1. Valós adat-feltérképezés
A `Adatok_2025.xlsx` Kassza fül 994 érdemi sorát végigfutottuk:
- 478 sor income (101.xx kódok dominálnak: Egyházfenntartói járulék 360, Adományok 104)
- 64 sor expense (201.xx, 202.xx kódok)
- 16 sor internal-transfer (15 kassza→bank, 1 bank→kassza, mind 400.01)
- 9453 skip (9451 üres sor + 2 donor van/összeg üres)
- 403 egyedi donor-string, ezekből 36 cég/intézmény + 367 magánszemély

### 2. `detectCompany` regex-set teljes
[`apps/web/components/finance/finance-import/helpers/company-detector.ts`](../apps/web/components/finance/finance-import/helpers/company-detector.ts):

- **Token-szintű check** — a magyar `é`, `á` betűk melletti ASCII `\b` szóhatár
  bug elkerülésére. Korábban "Lénárt" (a "Kiss Csabáné Lénárt Rita" sorban)
  tévesen RT-cégnek minősült.
- **String-szintű prefix-szabályok**: SC, Fundatia, Parohia, CN, Comuna, Pago*,
  Referinta, Depunere, Asociatia, Primaria, Creanțele, Transfer
- **CSUPA NAGYBETŰS rövidítés** (max 6 char, csak ha nincs " - "): ATCT, ATM
- **Token-szintű cégformák**: SRL, SA, PFA, IF, SCM, KFT, BT, RT, ZRT, NYRT, KKT

A 36 egyedi cég 100%-osan helyesen detektált. 367 magánszemély közül egyik sem
minősül tévesen cégnek.

### 3. `parseDonorString` teljes algoritmus
[`donor-string-parser.ts`](../apps/web/components/finance/finance-import/helpers/donor-string-parser.ts):

Lépéssorrend:
1. Cég-flag (`detectCompany`) — azonnali kilépés
2. Splitelés `" - "` / `" – "` / `" — "` separator-okkal
3. Cím-rész utolsó tokene = `houseNumber`, többi = `street`
4. Név-rész:
   - Prefix-detekció (Özv./Elv./Dr./id./ifj./Br./Gr./pont)
   - **Token-szintű "né" check** (`isFerjesToken`) — a magyar `é` melletti
     `\b` bug megkerülése. A token nagybetűvel kezdődik és `né`-re végződik.
   - Női férjes-név: férj családneve + férjes-név + opcionális lánykori
     családnév + saját keresztnév
   - Egyébként: első token = `csaladnev`, többi = `k_nev`
5. Confidence kalkuláció (high/medium/low)

### 4. `splitKasszaRow` valós adatokra kalibrálva
[`kassza-row-classifier.ts`](../apps/web/components/finance/finance-import/helpers/kassza-row-classifier.ts):

- 5 kategória: `income`, `expense`, `internal-transfer-in`, `internal-transfer-out`, `skip`
- **Belső mozgás detektálás**: vagy a 400.xx költségvetési kód, vagy a
  "Készpénzletétel" / "Készpénzfelvétel" kifejezés a kategória-mezőben
- **Tájékoztató sorok skip**: "Előző évi készpénzegyenleg", "Napi bevétel",
  "Napi kiadás", "Egyenleg:", "Kasszaegyenleg"
- Magyar tizedesvessző-elfogadás (pl. "400,01" → "400.01")

### 5. `buildBudgetCodeMaps` Supabase batch SELECT
[`budget-code-resolver.ts`](../apps/web/components/finance/finance-import/helpers/budget-code-resolver.ts):

- 3 batch SELECT: `szamadasicel` (aktiv), `befizetescel` (aktiv), `kiadascel` (aktiv)
- Map-ek: `szamadasicel` (id → {nev, type}), `befizetescel` (szamadasicel.id → {id, nev}),
  `kiadascel` (szamadasicel.id → {id, nev})
- `resolveBudgetCode(kod, maps)` egyetlen kódra kategória-feloldás
- 4 lehetséges kimenetel: `income` / `expense` / `internal-transfer` / `unknown`
- Konvenció: 100-prefix → bevétel, 200-prefix → kiadás, 400-prefix → belső mozgás
- `normalizeBudgetCode`: magyar tizedesvessző + aláhúzás → pont

### 6. `diagnoseMonetar` parser
[`monetar-diagnostic.ts`](../apps/web/components/finance/finance-import/helpers/monetar-diagnostic.ts):

- Kasszaegyenleg keresése a sorokban (regex)
- Címlet-alapú összeg keresése
- 12 címlet (500/200/100/50/20/10/5/1/0.5/0.1/0.05/0.01) sor-felismerés
- Két eltérés-számítás:
  - `elteresKasszaval`: Monetar kassza − Kassza-kalkulált záró (≤±0.01 RON: rendben)
  - `elteresCimlettel`: Monetar kassza − címlet-alapú (Monetar belső)
- Pasztorális hangnemű warning-ok ("0.26 RON-nal kisebb")

### 7. Smoke-test runner script-ek
- [`scripts/test-finance-import-helpers.ts`](../apps/web/scripts/test-finance-import-helpers.ts) —
  74 unit teszt 4 helper-en (mind zöld)
- [`scripts/test-finance-import-fullfile.ts`](../apps/web/scripts/test-finance-import-fullfile.ts) —
  a teljes 994 soros valós Kassza-fájl klasszifikációja, 36 cég-listával

## 3-build verifikáció (mind zöld 2026-05-02)

- `npm run typecheck --workspace=@kartoteka/ui-app` ✅
- `npm run build --workspace=@kartoteka/web` ✅ (66 oldal)
- `npm run build --workspace=@kartoteka/desktop` ✅ (5.85s)

## Smoke teszt eredmények

```
74 unit teszt — 100% zöld (detectCompany, parseDonorString, splitKasszaRow, normalizeBudgetCode)

994 valós sor klasszifikáció (a Kassza fülről):
  income:                478
  expense:               64
  internal-transfer-in:  1
  internal-transfer-out: 15
  skip:                  9453 (9451 üres + 2 donor van/összeg üres)

403 egyedi donor → 367 magánszemély + 36 cég/intézmény (100% helyesen)
```

## Trade-off-ok és tanulságok

| Kérdés | Választott út | Indok |
|---|---|---|
| ASCII `\b` magyar betűk mellett | Token-szintű regex | A `\b` szóhatár ASCII-csak, nem ismeri fel az `é`/`á`/`ő` mellett — pl. "Lénárt" tévesen RT-cég lett |
| `XLSX.utils.sheet_to_json` típus | `as unknown[][]` cast | A `header: 1` opció miatt array-of-arrays, nem Record |
| Női "né" detektálás | `isFerjesToken` token-szinten | Egyértelmű, dokumentált, robosztus |
| Cég-detection robusztussága | 3-rétegű (token + string + CSUPA NAGY) | Lefedi a 36/36 valós cég-mintát |
| Monetar tartalék | Csak diagnosztika | Endre döntése — nem ír DB-be |

## Mi következik (Fázis 3)

1. Új `apps/web/app/(dashboard)/penzugy/finance-import-actions.ts` 4 server action-nel:
   - `parseAndPreviewFinance(formData)` — wrapper a meglévő `parseAndPreview`-hez
   - `analyzeKasszaRows(formData)` — a 4. lépéshez (`splitKasszaRow` batch)
   - `resolveDonors(formData)` — a 6. lépéshez (`parseDonorString` + quad-lookup)
   - `resolveBudgetCodes(formData)` — az 5. lépéshez (`buildBudgetCodeMaps`)
2. SQL migráció: `migration-docs/sql/2026-05-02-finance-import-rpc.sql` —
   az `import_finance_batch` RPC (Endre futtatja)
3. Adminisztrált role-check minden action-ben (`getEffectiveAccessContext`)

A Fázis 3 után az UI lépéseit (Fázis 4-6) tudjuk összerakni.
