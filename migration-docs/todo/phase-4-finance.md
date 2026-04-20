# Fázis 4 — Pénzügyi modul: Részletes implementációs terv

**Előfeltétel:** Fázis 1 (Core) + Fázis 2 (Dashboard) + Fázis 3 (Tagnyilvántartás) — LEZÁRVA
**Forrás elemzés:** `modules/finance.md`
**Üzleti szabályok:** `rules/finance-rules.md`
**Felhasználói folyamatok:** `workflows/finance-flow.md`
**Becsült időigény:** 10–14 nap (4 alfázisra bontva)

---

## 1. Backend (Supabase)

### Használt táblák — NEM kell létrehozni, már léteznek

| Tábla | Művelet | Alfázis |
|-------|---------|---------|
| `befizetes` | SELECT, INSERT, UPDATE (soft delete) | 4a |
| `kiadas` | SELECT, INSERT, UPDATE (soft delete) | 4a |
| `befizetescel` | SELECT | 4a |
| `kiadascel` | SELECT | 4a |
| `szamadasicel` | SELECT | 4a |
| `bealitas` | SELECT, INSERT, UPDATE | 4a+4b |
| `koltsegvetes` | SELECT, UPSERT | 4b |
| `bankszamlak` | SELECT, INSERT, UPDATE | 4c |
| `belsomozgas` | SELECT, INSERT, UPDATE (soft delete) | 4c |
| `valuta_atert` | SELECT, INSERT | 4c |
| `berleti_szerzodes` | TELJES CRUD | 4a (tartozás) |
| `felmentes` | SELECT | 4a (tartozás) |
| `jarulek_kedvezmeny` | SELECT, INSERT, UPDATE, DELETE | 4a |
| `leltar_tetelek` | INSERT | 4a |
| `iktato` | SELECT, INSERT | 4d |
| `szemely` | SELECT | 4a (keresés) |
| `csalad` | SELECT | 4a (családi összekötés) |
| `congregations` | SELECT | 4a (tartozás mód) |
| `profiles` | SELECT | init |

### RLS — már meglévő policy-k

- Minden tábla `congregation_id` alapú RLS
- `befizetes` és `kiadas`: `deleted = false` szűrés NEM RLS-ben van — az alkalmazás végzi

### Auth

- Server Component: `createClient()` → profil → `congregation_id`
- Minden Server Action: `getUser()` + profil ellenőrzés
- `congregation_id` MINDIG profilból — soha nem klienstől

### Role kezelés

| Funkció | Ki éri el |
|---------|----------|
| Bevétel/kiadás CRUD | Minden lelkész (saját gyülekezet) |
| Belső mozgás | Minden lelkész |
| Költségvetés tervezés/véglegesítés | Minden lelkész |
| Költségvetés FELOLDÁS | Esperes + Admin + Master Admin |
| Számadás véglegesítés | Minden lelkész |
| Számadás FELOLDÁS | Esperes + Admin + Master Admin |
| Párosítatlan befizetések audit | SzuperAdmin (Master Admin) |
| Bankszámla kezelés | Minden lelkész |

---

## 2. Frontend (Next.js)

### Oldalak

| Route | Fájl | Típus |
|-------|------|-------|
| `/penzugy` | `app/(dashboard)/penzugy/page.tsx` | Server Component |

Egyetlen route — 8 kliens-oldali fül.

### Komponens struktúra

#### Fő orchestrátor

| Fájl | Tartalom |
|------|----------|
| `app/(dashboard)/penzugy/page.tsx` | Inicializálás: beállítások, kategória map-ek, tagok, bankszámlák |
| `components/finance/finance-tabs.tsx` | 8 fül-váltó orchestrátor + globális állapotkezelés |

#### 4a — Bevételek + Kiadások (12 fájl)

| Fájl | Tartalom |
|------|----------|
| `components/finance/dashboard-tab.tsx` | KPI kártyák, egyenleg, friss tranzakciók |
| `components/finance/income-search.tsx` | Tag/cég okos kereső (diakritika-normalizálás) |
| `components/finance/category-select.tsx` | Szamadasicel hierarchikus dropdown (közös bevétel + kiadás) |
| `components/finance/debt-tab.tsx` | Tartozások: járulék + bérleti hátralék |
| `components/finance/debt-table.tsx` | Személyenkénti tartozás táblázat |
| `components/modals/income-dialog.tsx` | Bevétel rögzítés (egyedi mód) |
| `components/modals/income-batch-dialog.tsx` | Bevétel rögzítés (batch/táblázatos mód) |
| `components/modals/expense-dialog.tsx` | Kiadás rögzítés |
| `components/modals/rental-contract-dialog.tsx` | Bérleti szerződés CRUD |
| `components/modals/yearly-settings-dialog.tsx` | Éves beállítás létrehozás/szerkesztés |
| `components/modals/fee-manager-dialog.tsx` | Járulék kedvezmény kezelés |

#### 4b — Költségvetés + Számadás (5 fájl)

| Fájl | Tartalom |
|------|----------|
| `components/finance/budget-tab.tsx` | Költségvetés terv (bevétel + kiadás tételek, élő egyenleg) |
| `components/finance/accounting-tab.tsx` | Számadás (terv vs. tény, záró leltár) |
| `components/modals/closing-inventory-dialog.tsx` | Záró leltár modal |
| `components/modals/budget-print-dialog.tsx` | Költségvetés nyomtatás (4/6 oszlop) |
| `components/modals/accounting-print-dialog.tsx` | Számadás nyomtatás |

#### 4c — Bank + Belső mozgás (5 fájl)

| Fájl | Tartalom |
|------|----------|
| `components/finance/cashbook-tab.tsx` | Kassza (pénztárkönyv), havi bontás |
| `components/finance/bank-tab.tsx` | Bank tranzakciók, BCR import |
| `components/finance/monetary-tab.tsx` | Monetár (pénztári egyeztetés) |
| `components/modals/internal-transfer-dialog.tsx` | Belső mozgás (4 típus, kettős bejegyzés) |
| `components/modals/bank-account-dialog.tsx` | Bankszámla CRUD |

#### 4d — Nyomtatás + Audit (4 fájl)

| Fájl | Tartalom |
|------|----------|
| `components/finance/transactions-tab.tsx` | Egységes tranzakció lista, havi szűrés, diagram |
| `components/finance/audit-badges.tsx` | Hiányzó sorszám + párosítatlan figyelmeztetés |
| `components/modals/payment-link-dialog.tsx` | Párosítatlan befizetések összekötés |
| `components/modals/cashbook-print-dialog.tsx` | Pénztárkönyv PDF |

#### Server Actions (6 fájl)

| Fájl | Függvények |
|------|-----------|
| `penzugy/actions.ts` | `initFinance()`, `getYearlySettings()`, `createYearlySettings()`, `getCategoryMaps()`, `getCarryoverBalances()` |
| `penzugy/income-actions.ts` | `saveIncome()`, `saveBatchIncome()`, `searchMembers()`, `getNextReceiptNumber()`, `getLastRecordedDate()`, `checkReceiptDuplicate()` |
| `penzugy/expense-actions.ts` | `saveExpense()`, `deleteTransaction()` |
| `penzugy/transfer-actions.ts` | `saveInternalTransfer()`, `getTransfers()`, `getBankAccounts()`, `saveBankAccount()` |
| `penzugy/budget-actions.ts` | `getBudget()`, `saveBudget()`, `requestBudgetUnlock()`, `getAccounting()`, `finalizeAccounting()`, `saveClosingInventory()`, `requestAccountingUnlock()` |
| `penzugy/debt-actions.ts` | `getDebts()`, `getRentalContracts()`, `saveRentalContract()`, `deleteRentalContract()`, `getUnlinkedPayments()`, `linkPayment()` |

#### Utility fájlok (3 fájl)

| Fájl | Tartalom |
|------|----------|
| `lib/constants/finance.ts` | Típusok, pénznem formázás, kategória kód konstansok, BM prefix, leltár kulcsszavak |
| `lib/validations/finance.ts` | Zod sémák: incomeSchema, expenseSchema, transferSchema, budgetSchema, bankAccountSchema, rentalContractSchema |
| `lib/utils/finance-helpers.ts` | `formatCurrency()`, `parseHungarianWomensName()`, `normalizeName()`, `sortCellsHierarchically()`, `isInventoryCategory()`, `calculateDebt()` |

---

## 3. Funkciók

### 3.1 — Inicializálás (`initFinance`)

A page.tsx Server Component-ben:

| # | Lekérdezés | Eredmény |
|---|-----------|---------|
| 1 | `bealitas` (aktuális évre) | Éves beállítások (járulék, véglegesítés flagek) |
| 2 | `szamadasicel` (összes) | Kategória hierarchia |
| 3 | `befizetescel` + `kiadascel` | Junction táblák → `bevCelMap`, `kiaCelMap` felépítés |
| 4 | `bankszamlak` (aktív) | Bankszámlák lista |
| 5 | `szemely` (aktív, isvisible) | Tagok (tag kereséshez) |
| 6 | `befizetes` + `kiadas` (aktuális év) | Tranzakciók (dashboard KPI-hoz, kassza egyenleghez) |
| 7 | `bealitas` (előző év) + előző évi bev/kia | Átviteli egyenleg számítás |
| 8 | `congregations` | Gyülekezet beállítások (járulék, tartozás mód) |

Mindez `Promise.all()`-ban, props-ként a `FinanceTabs`-nak.

### 3.2 — Bevétel rögzítés (`saveIncome`)

**Zod séma:**

| Mező | Szabály |
|------|---------|
| osszeg | number, >0, kötelező |
| datum | string YYYY-MM-DD, kötelező, NEM jövőbeli |
| id_befizetescel | number, kötelező |
| id_szemely | number \| null |
| id_csalad | number \| null |
| forrasa | string \| null (szabad szöveg) |
| iratszam | string \| null (készpénznél kötelező) |
| irattipus | enum: 'Készpénz' \| 'Banki' |
| fizetettev | number \| null (járuléknál kötelező) |
| megjegyzes | string \| null |

**Szerver logika:**
1. Zod validáció
2. Dátum: `> today` → error
3. Iratszám duplikáció check (ha van)
4. INSERT `befizetes` + `congregation_id` profilból
5. Ha leltár kategória → INSERT `leltar_tetelek`
6. `revalidatePath('/penzugy')`

### 3.3 — Belső mozgás (`saveInternalTransfer`)

**Szerver logika (atomikus kettős bejegyzés):**
1. UUID generálás (`belso_mozgas_xkey`)
2. BM sorszám generálás (`BM-{N}/{év}`)
3. Kategória ID-k meghatározás (`_bmBevCelIds`, `_bmKiaCelIds`)
4. INSERT `befizetes` (cél oldal)
5. INSERT `kiadas` (forrás oldal)
6. INSERT `belsomozgas` (napló)
7. Ha valutacsere → INSERT `valuta_atert`

Ha bármelyik INSERT hibázik → az összes előző is érvénytelen (nincs DB tranzakció Supabase-ben, de a kód sorrendben futtatja és hibánál megáll).

### 3.4 — Költségvetés (`saveBudget`)

**Szerver logika:**
1. Összes tétel összegyűjtés (szamadasicelid → összeg map)
2. UPSERT `koltsegvetes` (conflict: bealitasid + szamadasicelid + congregation_id)
3. Ha véglegesítés → UPDATE `bealitas.budget_finalized = true`

### 3.5 — Tartozás számítás (`getDebts`)

**Szerver logika (7 párhuzamos query):**
1. Járulék befizetések (101.01 kód, évtartomány)
2. Bérleti befizetések (104.04–05 kódok)
3. Bérleti szerződések
4. Felmentések
5. Évenkénti járulék összegek (bealitas)
6. Tartozás számítási mód (congregations)
7. Kedvezmények

**Számítás személyenként:**
- Elvárt = járulék × évek − kedvezmény − felmentés
- Fizetett = tényleges befizetések
- Hátralék = elvárt − fizetett

### 3.6 — Párosítatlan audit (`getUnlinkedPayments`)

**Szerver logika:**
1. SELECT `befizetes` WHERE `id_szemely IS NULL` AND `deleted = false`
2. Minden rekordnál:
   - `forrasa` szétbontás (név − utca)
   - Magyar asszonynév elemzés
   - Keresés a `szemely` táblában (multi-stratégia)
   - Top 3 találat visszaadása

---

## 4. Prioritás — lépések sorrendje (4 alfázis)

### ALFÁZIS 4a: Bevételek + Kiadások + Tartozások (~4 nap)

| Sprint | Mit | Fájlok |
|--------|-----|--------|
| **4a.1** | Konstansok + segédfüggvények + Zod sémák | `lib/constants/finance.ts`, `lib/utils/finance-helpers.ts`, `lib/validations/finance.ts` |
| **4a.2** | Inicializálás + Server Actions (alap) | `penzugy/actions.ts`, `penzugy/page.tsx` |
| **4a.3** | FinanceTabs + Dashboard fül | `finance/finance-tabs.tsx`, `finance/dashboard-tab.tsx` |
| **4a.4** | Bevétel rögzítés (egyedi + batch) | `penzugy/income-actions.ts`, `modals/income-dialog.tsx`, `modals/income-batch-dialog.tsx`, `finance/income-search.tsx`, `finance/category-select.tsx` |
| **4a.5** | Kiadás rögzítés | `penzugy/expense-actions.ts`, `modals/expense-dialog.tsx` |
| **4a.6** | Tartozások + bérleti szerződés | `penzugy/debt-actions.ts`, `finance/debt-tab.tsx`, `finance/debt-table.tsx`, `modals/rental-contract-dialog.tsx` |
| **4a.7** | Éves beállítás + járulék kezelés | `modals/yearly-settings-dialog.tsx`, `modals/fee-manager-dialog.tsx` |

### ALFÁZIS 4b: Költségvetés + Számadás (~3 nap)

| Sprint | Mit | Fájlok |
|--------|-----|--------|
| **4b.1** | Költségvetés tervezés + véglegesítés | `penzugy/budget-actions.ts`, `finance/budget-tab.tsx` |
| **4b.2** | Számadás + záró leltár + véglegesítés | `finance/accounting-tab.tsx`, `modals/closing-inventory-dialog.tsx` |
| **4b.3** | Feloldás kérelem workflow | Esperes check a budget/accounting actions-ben |

### ALFÁZIS 4c: Bank + Belső mozgás (~3 nap)

| Sprint | Mit | Fájlok |
|--------|-----|--------|
| **4c.1** | Kassza (pénztárkönyv) | `finance/cashbook-tab.tsx` |
| **4c.2** | Bank tranzakciók + bankszámla CRUD | `penzugy/transfer-actions.ts`, `finance/bank-tab.tsx`, `modals/bank-account-dialog.tsx` |
| **4c.3** | Belső mozgás (4 típus, kettős bejegyzés) | `modals/internal-transfer-dialog.tsx` |
| **4c.4** | Monetár (pénztári egyeztetés) | `finance/monetary-tab.tsx` |

### ALFÁZIS 4d: Nyomtatás + Audit (~2 nap)

| Sprint | Mit | Fájlok |
|--------|-----|--------|
| **4d.1** | Tranzakció lista + törlés + diagram | `finance/transactions-tab.tsx` |
| **4d.2** | Nyomtatások (költségvetés, számadás, pénztárkönyv) | `modals/budget-print-dialog.tsx`, `modals/accounting-print-dialog.tsx`, `modals/cashbook-print-dialog.tsx` |
| **4d.3** | Audit: sorszám ellenőrzés + párosítatlan befizetések | `finance/audit-badges.tsx`, `modals/payment-link-dialog.tsx` |
| **4d.4** | Build ellenőrzés + végső tesztelés | Minden fájl |

### Összesített ütemezés

```
4a ■■■■■■■■░░░░░░░░░░░░░░░░  (4 nap)   Bevételek + Kiadások + Tartozások
4b ░░░░░░░░■■■■■░░░░░░░░░░░  (3 nap)   Költségvetés + Számadás
4c ░░░░░░░░░░░░░■■■■■░░░░░░  (3 nap)   Bank + Belső mozgás
4d ░░░░░░░░░░░░░░░░░░■■■■░░  (2 nap)   Nyomtatás + Audit
                                          ──────────────────────
                                          Összesen: ~12 nap
```

---

## 5. Függőségek

### Telepítendő npm csomag

Nincs új csomag. A meglévők elegendőek:
- `recharts` — tranzakció diagram (már telepítve Fázis 2-ben)
- shadcn/ui, react-hook-form, zod, sonner — mind megvan

### Fájl-függőségi fa

```
lib/constants/finance.ts              ← NINCS FÜGGŐSÉGE
lib/utils/finance-helpers.ts          ← függ: finance.ts
lib/validations/finance.ts            ← függ: finance.ts
    │
    ▼
app/(dashboard)/penzugy/
├── page.tsx                          ← Server: init, 8 pár. query, props
├── actions.ts                        ← init, beállítások, kategória map-ek
├── income-actions.ts                 ← bevétel CRUD, tag keresés, sorszám
├── expense-actions.ts                ← kiadás CRUD, soft delete
├── transfer-actions.ts               ← belső mozgás, bank CRUD
├── budget-actions.ts                 ← költségvetés, számadás, feloldás
├── debt-actions.ts                   ← tartozások, bérleti szerz., audit
    │
    ▼
components/finance/
├── finance-tabs.tsx                  ← 8 fül orchestrátor
├── dashboard-tab.tsx                 ← KPI + egyenleg + friss tranzakciók
├── cashbook-tab.tsx                  ← Kassza havi bontás
├── bank-tab.tsx                      ← Bank tranzakciók
├── budget-tab.tsx                    ← Költségvetés tervezés
├── accounting-tab.tsx                ← Számadás (terv vs. tény)
├── transactions-tab.tsx              ← Egységes lista + diagram
├── debt-tab.tsx + debt-table.tsx     ← Tartozások
├── monetary-tab.tsx                  ← Monetár
├── income-search.tsx                 ← Tag/cég keresés
├── category-select.tsx               ← Kategória dropdown
├── audit-badges.tsx                  ← Sorszám + párosítatlan figyelmeztetés
    │
    ▼
components/modals/
├── income-dialog.tsx                 ← Bevétel (egyedi)
├── income-batch-dialog.tsx           ← Bevétel (batch)
├── expense-dialog.tsx                ← Kiadás
├── internal-transfer-dialog.tsx      ← Belső mozgás (4 típus)
├── bank-account-dialog.tsx           ← Bankszámla CRUD
├── yearly-settings-dialog.tsx        ← Éves beállítás
├── fee-manager-dialog.tsx            ← Járulék kedvezmény
├── rental-contract-dialog.tsx        ← Bérleti szerződés
├── closing-inventory-dialog.tsx      ← Záró leltár
├── budget-print-dialog.tsx           ← Költségvetés nyomtatás
├── accounting-print-dialog.tsx       ← Számadás nyomtatás
├── cashbook-print-dialog.tsx         ← Pénztárkönyv PDF
├── payment-link-dialog.tsx           ← Párosítatlan összekötés
```

**Összesen: ~35 új fájl**
- 1 Server Page
- 6 Server Action fájl
- 12 Client Component (fülek + segéd)
- 13 Modal Component
- 3 Utility fájl

### Modul-függőségek

| Fázis 4 funkció | Függ-e más modultól? |
|-----------------|---------------------|
| Bevétel: tag keresés | OLVAS `szemely` (Fázis 3 tábla) |
| Bevétel: családi összekötés | OLVAS `csalad`, `gyerek` (Fázis 3 tábla) |
| Kiadás: leltár jelölés | ÍR `leltar_tetelek` (Fázis 6 tábla — a tábla már létezik) |
| Tartozás: felmentések | OLVAS `felmentes` (Fázis 3 tábla) |
| Audit: tag keresés | OLVAS `szemely` (Fázis 3 tábla) |
| Nyomtatás: iktatás | ÍR `iktato` (Fázis 6 tábla — de a tábla már létezik) |

A Fázis 4 **függ a Fázis 3-tól** (tagnyilvántartás), de az adatbázis táblák már léteznek — nem kell létrehozni.

### Meglévő elemekre való támaszkodás

| Elem | Hogyan használja a pénzügyi modul |
|------|----------------------------------|
| `(dashboard)/layout.tsx` | Auth + sidebar + header |
| `lib/supabase/server.ts` | `createClient()` |
| `lib/utils/date.ts` | `formatHuDate()`, `ageFromDate()` |
| `lib/utils/member-helpers.ts` | `formatNameWithPrefix()` (tartozásoknál) |
| `recharts` | Tranzakció diagram |

---

## Elfogadási kritériumok

| # | Kritérium | Alfázis |
|---|-----------|---------|
| 1 | Bevétel rögzítés (egyedi): tag keresés, kategória, összeg, dátum validáció, nyugtaszám | 4a |
| 2 | Bevétel rögzítés (batch): többéves járulék, soronkénti validáció, kedvezmény auto | 4a |
| 3 | Kiadás rögzítés: partner, kategória, leltár auto-jelölés | 4a |
| 4 | Dátum szabály: jövőbeli BLOKKOLVA, visszamenőleges FIGYELMEZTETÉS | 4a |
| 5 | Sorszámozás: duplikáció ellenőrzés, kimaradt szám jelzés | 4a |
| 6 | Tartozás elemzés: személyenkénti többéves hátralék, akkori/aktuális mód | 4a |
| 7 | Költségvetés: bevétel/kiadás tételek, élő egyenleg, véglegesítés + zárolás | 4b |
| 8 | Számadás: terv vs. tény, záró leltár, kétlépéses véglegesítés | 4b |
| 9 | Feloldás kérelem: esperes check (költségvetés + számadás) | 4b |
| 10 | Kassza: havi bontás, nyitó/záró egyenleg, nyomtatás | 4c |
| 11 | Belső mozgás: 4 típus, kettős bejegyzés, BM sorszám | 4c |
| 12 | Bankszámla CRUD | 4c |
| 13 | Monetár: címlet-számolás, egyeztetés | 4c |
| 14 | Tranzakció lista: egységes nézet, törlés (soft delete), diagram | 4d |
| 15 | Sorszám audit: hiányzó számok felismerés | 4d |
| 16 | Párosítatlan befizetések: asszonynév felismerés, összekötés | 4d |
| 17 | Nyomtatások: költségvetés, számadás, pénztárkönyv (PDF + iktatás) | 4d |
| 18 | Build 0 hibával lefordul | 4d |
