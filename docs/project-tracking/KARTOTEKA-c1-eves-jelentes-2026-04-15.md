# KARTOTEKA — C1 Éves jelentések modul (MVP)

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — C1 MVP plan
**Projekt log lépés**: 030.

---

## Vezetői összefoglaló

A C1 modul **MVP készen áll** — 4 alfeladat (DB séma + aggregátor + server actions + UI form) implementálva. A maradék 3 alfeladat (PDF generálás, esperesi jóváhagyási UI, iskolaügy aggregátor) backlog-ban a következő körre.

### Üzleti probléma

Az erdélyi református gyülekezetek **minden évben januar végéig kötelezően** leadnak hivatalos éves jelentést az espereshez (10 szekciós sablon). Ma ez Excel-ben/papíron történik — fáradságos, hibalehetőséges. A C1 modul **automatikusan összeállítja** a meglévő modulok adataiból, a lelkész csak ellenőrzi és a 3 szabadszöveges szekciót tölti ki.

### A modul most ezt tudja

- A `/eves-jelentes` URL-en a lelkipásztor megnyitja az aktuális év jelentését
- A rendszer **automatikusan összeállítja** a 10 szekciót a meglévő modulokból
- A user a 3 szabadszöveges szekciót tölti (IV. Lelki élet, IX. Iskolaügy, X. Egyéb)
- **Piszkozatként mentheti** és később folytathatja
- **Beküldheti az esperesnek** (status: submitted)
- A history kártyában láthatja a korábbi évek jelentéseit
- Status banner mutatja a workflow-állapotot

---

## A 10 szekció és aggregátor forrásai

| # | Szekció | Aggregátor forrás | Új vagy reuse |
|---|---|---|---|
| **I.** | Gyülekezet adatai | `congregations` + `profiles` (lelkész + esperes) + `dioceses` | Új lekérdezés |
| **II.** | Istentiszteleti élet | `munkanaplo` (kategoria='szolgalat') | Új lekérdezés + agg |
| **III.** | Kazuáliák | `lib/dashboard/scope-vital.ts` (B4.5 reuse) | **Reuse** |
| **IV.** | Lelki élet | Felhasználói szöveg + szekcio3 konfirmált szám | Felhasználó |
| **V.** | Katekézis | `munkanaplo` (kategoria='katekezis') | Új lekérdezés + agg |
| **VI.** | Pénzügyi helyzet | `lib/dashboard/scope-financial.ts` (B4.5 reuse) | **Reuse** |
| **VII.** | Presbitérium | `presbiter` + `szemely` JOIN | Új lekérdezés |
| **VIII.** | Egyházi vagyon | `leltar_tetelek` (kategória + érték) | Új lekérdezés + agg |
| **IX.** | Iskolaügy | Felhasználói szöveg | Felhasználó |
| **X.** | Egyéb | Felhasználói szöveg | Felhasználó |

---

## Implementált fájlok

### Új fájlok (4)

| Fájl | Tartalom | Sorok |
|---|---|---|
| `migration-docs/sql/2026-04-15-annual-reports-extension.sql` | 12 új mező, status enum (5 érték), UNIQUE constraint, 3 új index, 5 RLS policy, updated_at trigger | ~140 |
| `lib/annual-report/generator.ts` | `AnnualReportSnapshot` típus + `buildAnnualReportData()` aggregátor (6 párhuzamos query + B4.5 lib reuse) | ~430 |
| `app/(dashboard)/eves-jelentes/actions.ts` | 6 server action: get/list/generate/save/getDiocese/updateStatus/forward | ~280 |
| `app/(dashboard)/eves-jelentes/page.tsx` | Route ModuleHero-val, automatikus év detektálás, historikus lista | ~85 |
| `components/annual-report/annual-report-form.tsx` | 10 szekciós űrlap auto-előtöltéssel, status banner, 3 akció gomb | ~430 |

---

## Architektúra részletek

### snapshot_data jsonb stratégia

A 10 szekciós struktúrát egyetlen `snapshot_data jsonb` mezőben tároljuk, NEM külön oszlopokkal. Előnyök:
- **Rugalmas**: új szekció hozzáadása nem igényel migrációt
- **Konzisztens** a `document_submissions` táblával (ugyanaz a minta)
- **Jövőbiztos**: a struktúra fejlődhet anélkül, hogy historikus rekordokat kellene migrálni

A 3 cache oszlop (`members_count`, `services_count`, `total_income`) marad gyors KPI-hoz (pl. dashboard kártyához nem kell jsonb parse).

### Status workflow

```
draft        → A lelkész szerkeszti, mentheti
   ↓
submitted    → Beküldve esperesnek (submitted_at, submitted_by)
   ↓
received     → Esperes átvette (received_at, received_by)
   ↓
reviewed     → Esperesi ellenőrzés + review_notes
   ↓
finalized    → Véglegesítve (finalized_at, finalized_by)
   ↓
forwarded_to_kerulet (boolean) → Kerületnek továbbítva
```

A státusz előrelépést az `updateAnnualReportStatus` action kezeli (csak esperes / admin / master). A felhasználó (lelkész) csak `draft` és `submitted` állapotban módosíthat (RLS-en is szigorítva).

### B4.5 reuse

A C1 modul **közvetlenül használja** a B4.5-ös munkát:
- `getScopeFinancialData(supabase, [congregationId], year)` — VI. szekció pénzügyi adatok
- `getScopeVitalStats(supabase, [congregationId], year)` — III. szekció kazuáliák

Ez azt jelenti, hogy az aggregálási logika **konzisztens** a dashboard-okkal és az éves jelentéssel: ugyanazt a számot mutatja mindkettő.

---

## Mit NEM csináltam ebben az iterációban

### C1.5 — PDF generáció (1 nap)

A `lib/worklog/reporting.ts::buildEvesJelentes` már létezik 2 oldalas formátumban (a Munkanapló modulban használt). **Bővíteni kell 10 szekciósra** (3-4 oldal), a snapshot_data alapján. Külön sessionben jó.

### C1.6 — Esperesi jóváhagyási UI (1 nap)

A `getDioceseAnnualReports`, `updateAnnualReportStatus`, `forwardAnnualReportToKerulet` server action-ök készen állnak. A `dashboard-egyhazmegye/page.tsx`-be új szekció kell: "Beérkezett éves jelentések" lista + jóváhagyási akciók. Külön sessionben.

### C1.7 — Iskolaügy aggregátor

A KARTOTEKA-ban nincs iskola modul. A IX. szekció jelenleg szabad szöveges. Ha a jövőben lesz iskola modul, akkor azt itt aggregálni kell.

---

## Kockázatok és nyitott pontok

### Kockázatok

1. **A `presbiter` JOIN**: a `szemely!presbiter_id_szemely_fk` Supabase relationship-detektáláson múlik. Ha a tábla nem kapja meg automatikusan a relationship-et, a query hibára futhat. Manuális teszt szükséges.

2. **A `lelkipasztor` és `esperes` név**: a `profiles.full_name` mezőből jön. Ha a profil nincs feltöltve, '—' jelenik meg. A felhasználó a UI-ban nem tudja módosítani — csak a profil oldalon.

3. **A B4.5 reuse — egy gyülekezetre**: a `getScopeFinancialData` és `getScopeVitalStats` egyetlen elemű `congregationIds` tömbbel meghívva is működik, de minden hozzá tartozó query-t végrehajt (congregations, dioceses meta lekérdezés is). Kis overhead.

4. **A `submit` után az `annual_reports.status='submitted'` lesz, de NEM hoz létre `document_submissions` sort**. Ez különálló rendszer. Ha integrálni kell (pl. a dashboard-egyhazmegye DocumentWorkflowPanel-ben is megjelenjen), a `saveAnnualReport`-ban kell hívni egy `submitDocument`-et is. Az MVP-ben az esperes közvetlenül az `annual_reports`-ot lekérdezi.

### Nyitott pontok (későbbre)

- C1.5: PDF generáció (a `buildEvesJelentes` bővítése)
- C1.6: Esperesi UI
- Performancia: ha sok év és sok jelentés, a `listAnnualReports` lapozást igényelhet
- Validáció: a snapshot_data nincs schema-validált. A user módosíthatja a UI-ban, de a séma laza.

---

## Roadmap pozíció Q2 2026

1. ✅ A1, A2, A3 — biztonsági javítások
2. ✅ F1+F2+F3 — repo higiénia (már korábban)
3. ✅ B1 — Bérleti szerződés modul TELJES (7/7)
4. ✅ B2 — Devizás átértékelés (FX) TELJES (5/5)
5. ✅ B3 — Monetár audit (már korábban)
6. ✅ B4 alap + B4.5 bővítés
7. ✅ C2 — Lelkészi havi/negyedéves jelentés (már korábban)
8. ✅ **C1 — Éves jelentések modul MVP (4/7 alfeladat)**
9. ⏳ C1.5 — PDF (1 nap)
10. ⏳ C1.6 — Esperesi UI (1 nap)

A Q2 roadmap **lényegében TELJES** az MVP szintjén. A maradék C1.5 + C1.6 finomhangolás.

---

## Kapcsolódó dokumentumok

- **C1 részletes terv**: `~/.claude/plans/purrfect-coalescing-quiche.md`
- **Tesztelési checklist**: `KARTOTEKA-security-test-checklist-2026-04-15.md` (C1 szekció)
- **Projekt log**: 030. lépés
- **Vanilla JS forrás**: `migration-docs/source-links/worklog_api.js` (`generateReport`)
- **B4.5 dokumentáció**: `KARTOTEKA-b4-dashboard-bovites-2026-04-15.md` (a reuse-olt aggregátorok)

---

**Dokumentum státusza**: VÉGLEGESÍTETT (C1 MVP — 4/7 alfeladat)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: SQL futtatás + manuális tesztek után + C1.5/C1.6 implementáció előtt
