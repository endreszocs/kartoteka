# Pénzügyi Import Wizard — Fázis 6 (Wizard UI 7-9. lépés + import végrehajtás)

**Dátum**: 2026-05-03
**Verzió**: v0.9.45 → v0.9.46 (webes verzió-bump javasolt a kiadáshoz)
**Sprint**: nincs

## Cél

A pénzügyi import-wizard **teljes lezárása**. A v1 architektúra most már
end-to-end élesben működik:

1. Endre feltölti a hivatalos EREK kasszakönyv Excel-fájlt
2. A wizard 6 előzetes lépésen kalauzol végig (klasszifikáció + kódfeloldás +
   befizetők)
3. A 7. lépés (előnézet) Monetar diagnosztikai panellel ellenőrzi a kasszaegyenleget
4. A 8. lépés (importálás) az `import_finance_batch` RPC-t hívja
5. A 9. lépés (eredmény) megmutatja a sikeres / kihagyott / hibás tételeket
   és a cég-listát

## Mit hoztunk létre

### 1. Új helper: `item-builder.ts`
[`apps/web/components/finance/finance-import/helpers/item-builder.ts`](../apps/web/components/finance/finance-import/helpers/item-builder.ts):

`buildFinanceImportItems(input)` — a wizard kliens-állapotából `FinanceImportItem[]`
tömböt épít. Minden klasszifikált sort végigjár:

1. Skip-kategóriát átugorja
2. Kódfeloldás → `befizetescelId` / `kiadascelId`
3. Donor-feloldás (manuális override > auto-resolved)
4. Item építés
5. Skip-okok gyűjtése (rowIndex + reason)

**Belső mozgás**: a v1-ben **nem kerül importba** (Bank A/B fülek a v2-ben jönnek).
A 16 belső mozgás sor `skippedReasons`-be megy "Belső mozgás (Kassza ↔ Bank) —
a v1-ben nem importálható, kézzel rögzítendő" üzenettel.

### 2. Új server action-ök
[`apps/web/app/(dashboard)/penzugy/finance-import-actions.ts`](../apps/web/app/(dashboard)/penzugy/finance-import-actions.ts):

**`getMonetarDiagnostic(formData, totalIncome, totalExpense, nyitoEgyenleg)`**
- Beolvassa a fájlt, megkeresi a Monetar fület
- A `diagnoseMonetar` helper-rel diagnosztikai jelentést készít
- Visszaad: `MonetarDiagnostic` (kasszaegyenleg + címlet-alapú összeg + eltérés + warning-ok)

**`executeFinanceImport(items, fileName)`**
- Auth-ellenőrzés (`requireFinanceImportAccess`)
- Items → RPC-kompatibilis JSONB konverzió (`id_befizetescel` / `id_kiadascel`
  szétválasztás kind szerint)
- `import_finance_batch` RPC hívás
- `logImportRun` audit-rekord rögzítés (a meglévő `import-log.ts` helper-rel)
- Visszaad: `FinanceImportResult` (inserted + skipped + errors)

### 3. Skip-os sorok kibővítése
A `analyzeKasszaSheet`-ben a skip-kategóriához mostantól megőrizzük:
- `donorString` — pl. "Előző évi készpénzegyenleg:"
- `amount` — a `_bev_osszeg` vagy `_kia_osszeg` érték

Ez kell a Monetar diagnosztikához, mert a nyitó-egyenleget az
"Előző évi készpénzegyenleg" sorból olvassuk.

### 4. Új step UI komponensek
**Új mappa**: `apps/web/components/finance/finance-import/steps/`

- [`preview-step.tsx`](../apps/web/components/finance/finance-import/steps/preview-step.tsx):
  - 3 KpiCard (bevételek + kiadások + kihagyott sorok)
  - Monetar diagnosztikai panel (eltérés-nézet, warning-ok)
  - Skip-okok bontása (group-olva, occurrence-szám szerint)
  - Első 8 példa-tétel táblázat (típus / dátum / összeg / forrás / cél ID /
    tag ID / iratszám)
  - Visszavonhatatlan figyelmeztetés-panel (rose) az "Importálok" gomb fölött
  - Nagy rose CTA: "Importálom a {N} tételt"

- [`importing-step.tsx`](../apps/web/components/finance/finance-import/steps/importing-step.tsx):
  - Egyszerű, központosított "Importálás folyamatban…" panel
  - Indeterminate progress bar (CSS animation)
  - Pasztorális üzenet: "Egy nagy lélegzettel, együtt csendben odáig várunk."

- [`result-step.tsx`](../apps/web/components/finance/finance-import/steps/result-step.tsx):
  - Banner (success / warning / error) az eredmény szerint
  - 3 KpiCard (sikeresen mentve + kihagyva + cég/intézmény szám)
  - Hibás sorok collapsible (max 50, sorszám + reason)
  - **Cég-lista panel** (a v1 fő haszna!) — minden egyedi cég/intézmény és
    occurrence-szám
  - 2 CTA: "Új import indítása" + "Tovább a pénzügyi oldalra"

### 5. Wizard orchestrator teljes
[`penzugy-import-wizard.tsx`](../apps/web/components/finance/finance-import/penzugy-import-wizard.tsx):

- Új state: `monetarDiagnostic`, `importResult`
- Új `useTransition`: `isLoadingMonetar`, `isImporting`
- `useMemo`: `builtItems`, `totalIncome`, `totalExpense`, `nyitoEgyenleg`
- `handleConfirmImport`: import-flow indítás (importing → result átmenetek)
- 9 lépéses állapotgép — minden lépésen él UI

## 3-build verifikáció (mind zöld 2026-05-03)

- `npm run typecheck --workspace=@kartoteka/ui-app` ✅
- `npm run build --workspace=@kartoteka/web` ✅ (67 oldal, 19.4s compile)
- `npm run build --workspace=@kartoteka/desktop` ✅ (5.23s)
- 74/74 smoke teszt zöld

## Trade-off-ok és tanulságok

| Kérdés | Választott út | Indok |
|---|---|---|
| Belső mozgás importálása | Skip a v1-ben | A 400.01-hez nincs garantáltan befizetescel/kiadascel rekord, és a Bank A/B fülek nélkül a párba állítás bizonytalan |
| Monetar nyitó-egyenleg forrása | A "Előző évi készpénzegyenleg" sorból (skip-kategória amount mező) | A bealitas tábla nyito_keszpenz mezője is jó lenne, de bonyolítaná — a fájlban benne van |
| Item-builder helye | Kliens-oldal, helper-fájlban | Egyszerű, és a wizard state-ből épül — nem kell server-side state |
| Importing-step animáció | CSS-only (`@keyframes slide`) | Indeterminate progress, nem kell külön package |
| Hiba esetén "ne nyomd meg újra" üzenet | Result-step bannerben | A duplikáció elkerülése — a felhasználó nyomon követheti a tranzakciók fülön |
| RPC return type | JSON parse a server action-ben | A Supabase RPC `data: any` típust ad — explicit cast-eléssel típusozzuk |

## Mi NEM került be (v2-be halasztva)

- **XML egyházfenntartás import** — v1-ből kihagyva
- **Bank A (RON) / Bank B (EUR) lapok importja** — v2
- **Költségvetés (Koltsegvetes lap) import** — v2
- **Belső mozgás (Kassza ↔ Bank) tényleges importja** — v2 a Bank A/B-vel együtt
- **XML duplikáció-ellenőrzés (XML vs DB)** — v2
- **Inline befizetescel/kiadascel létrehozás** — admin oldalon kézzel

A v1 architektúra úgy lett felépítve, hogy ezek a v2-iterációkban hozzáadhatók
új profilok + új sheet-felismerés + új source-type kártyákkal.

## Élesben tesztelhető

A `/admin/finance-import` URL-en, god-mode aktiválás után. A teljes Kassza-fájl
mostantól végigjárható és élesben importálható.

**Tesztelési forgatókönyv** (Endre):
1. Indíts el egy próba-gyülekezetet a Kartotékában
2. Aktiváld a god-mode-ot
3. Lépj a `/admin/finance-import` oldalra
4. Tölts fel egy test-Kassza-fájlt
5. Menj végig a 6 előzetes lépésen
6. Az előnézet-lépésen ellenőrizd a Monetar diagnosztikát + a példa-tételeket
7. Nyomd meg az "Importálom a {N} tételt" gombot
8. Az eredmény-lépésen ellenőrizd: az inserted szám stimmel-e, és a
   pénzügy oldalon a tranzakciók fülön megjelennek-e a tételek

## Verziószám

A v1 wizard most teljes — javasolt webes patch-bump v0.9.45 → v0.9.46.
Csak webes Railway auto-deploy a `main` push-szal. Desktop NEM érintett.
