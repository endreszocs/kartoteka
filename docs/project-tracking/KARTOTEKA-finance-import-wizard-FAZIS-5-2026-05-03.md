# Pénzügyi Import Wizard — Fázis 5 (Wizard UI 4-6. lépés)

**Dátum**: 2026-05-03
**Verzió**: v0.9.45 → v0.9.45 (még nincs verzió-bump)
**Sprint**: nincs

## Cél

A wizard "lényegi" középső szakasza: **a teljes klasszifikáció + kódfeloldás
+ befizető-azonosítás már működik a felületen**. Endre a 6. lépésig el tud
menni egy valós Kassza-fájllal, és látja az összes adatot. A 7-9. lépés
(előnézet, importálás, eredmény) placeholder marad — Fázis 6 hozza.

## Mit hoztunk létre

### 1. `kassza-split-step.tsx`
[`apps/web/components/finance/finance-import/steps/kassza-split-step.tsx`](../apps/web/components/finance/finance-import/steps/kassza-split-step.tsx):

- Auto-trigger az `analyzeKasszaRows` action-re a lépésre érkezéskor
- 5 KpiCard a klasszifikáció statisztikáihoz: bevétel / kiadás / bank→kassza
  / kassza→bank / kihagyott
- Importálandó tételek-kártya (zöld) az összes nem-skip sor összegével
- Csoportonként összecsukható listák — minden kategóriát első 25 sor alapján
  preview-zünk, "és további N sor" jelzéssel
- Pasztorális tipp: ha a sor nem oda került, ahova szerinted való, mit tegyél
- Vissza/Tovább, blocked ha 0 importálandó

### 2. `budget-code-step.tsx`
[`apps/web/components/finance/finance-import/steps/budget-code-step.tsx`](../apps/web/components/finance/finance-import/steps/budget-code-step.tsx):

- Auto-trigger a `resolveBudgetCodes` action-re
- 4 KpiCard: bevételi / kiadási / belső mozgás / ismeretlen kódok (sor-szám szerint)
- Ismeretlen kódok figyelmeztetés panel — 2 lépéses döntéssel:
  1. Lépj vissza, javítsd a forrás-fájlt
  2. Hagyd ki ezeket a sorokat (checkbox)
- Kódok teljes táblázata: rawKod / normalizedKod / kategória-badge / cél neve
  / occurrence-szám / művelet (csak unknown-ra checkbox)
- Vissza/Tovább, blocked ha unknown van és nem mindegyik skipre állítva

### 3. `donor-resolve-step.tsx`
[`apps/web/components/finance/finance-import/steps/donor-resolve-step.tsx`](../apps/web/components/finance/finance-import/steps/donor-resolve-step.tsx):

- Auto-trigger a `resolveDonors` action-re
- 4 KpiCard: egyértelműen feloldva / több jelölt / nincs / cég
- 4 collapsible szekció (alapértelmezett nyitvasággal):
  - **Több jelölt** (nyitva) — minden ambiguous donor kártya, candidates-grid
    (családnév + keresztnév + lánykori név + születési dátum + nem)
  - **Tagnyilv.-ban nincs** (nyitva) — szöveges-csak donor-lista, marad
    `id_szemely = NULL`
  - **Cégek és intézmények** (nyitva) — cég-lista (a v1 fő terméke!)
  - **Egyértelműen feloldva** (összecsukva) — auto-feloldott személyek
- Manuális candidate-választás dropdown gridben — kiválasztott zölddel jelölve
- Vissza/Tovább, blocked ha minden ambiguous-hoz nem választottál

### 4. Orchestrator bővítés
[`penzugy-import-wizard.tsx`](../apps/web/components/finance/finance-import/penzugy-import-wizard.tsx):

Új state-ek:
- `kasszaAnalysis: KasszaAnalysisResult | null` (4. lépés)
- `budgetCodeResolutions: BudgetCodeResolution[] | null` (5. lépés)
- `skippedCodes: Set<string>` (felhasználó által kihagyott unknown-kódok)
- `donorResolutions: DonorResolution[] | null` (6. lépés)
- `manualPersonSelections: Record<donorRaw, szemelyId>` (manuális ambiguous döntés)

Új handler-ek:
- `handleAnalyzeKasszaRows` — `analyzeKasszaRows` server action hívás
- `handleResolveBudgetCodes` — `resolveBudgetCodes` server action hívás
- `handleSkipToggle` — checkbox kezelés
- `handleResolveDonors` — `resolveDonors` server action hívás
- `handleManualPersonSelectionChange` — ambiguous candidate-választás

A `useTransition` hook-ok 4 különböző parsing/analyzing/resolving folyamatra:
`isParsing`, `isAnalyzing`, `isResolvingCodes`, `isResolvingDonors`.

## 3-build verifikáció (mind zöld 2026-05-03)

- `npm run typecheck --workspace=@kartoteka/ui-app` ✅
- `npm run build --workspace=@kartoteka/web` ✅ (67 oldal, 9.7s)
- `npm run build --workspace=@kartoteka/desktop` ✅ (5.06s)
- 74/74 smoke teszt zöld

## Trade-off-ok és tanulságok

| Kérdés | Választott út | Indok |
|---|---|---|
| Auto-trigger a lépésre érkezéskor | useEffect a step-en belül | Csak akkor fut, ha még nincs analysis/resolution |
| Sor-szintű override a 4. lépésben | Nincs (csak megjelenítés) | A v1-ben Endre nézze át, és lépjen vissza, ha kell |
| Új cél létrehozás az 5. lépésen | NEM (csak skip) | A felhasználó döntése v1-ben — Fázis 1 plan szerint |
| Manuális keresés a 6. lépésen | A candidates-listából | A v1-ben elég a quad-lookup ambiguous esetekre |
| Ambiguous esetek nem-feloldva | Blocker a Tovább gombnál | "A legkisebb tévedés sem megengedett" elvre |
| Cég-lista panel | Külön collapsible szekció | A v1 fő haszna: Endre listát kap az adott évben szereplő cégekről |
| Egyetlen FormData a server action-höz | Mindig a fájlt küldjük újra | Egyszerű, megfelelő ezen a méretskálán |

## Mi következik (Fázis 6)

Az utolsó három lépés a placeholder helyett:

1. `preview-step.tsx` — végleges DB-rekord-előnézet + Monetar diagnosztikai panel
2. `importing-step.tsx` — progress bar
3. `result-step.tsx` — KpiCard, cég-lista, hibák
4. `executeFinanceImport` server action — `import_finance_batch` RPC hívás
5. `import-log.ts` integráció (audit trail)

A Fázis 6 után az import élesben megy.
