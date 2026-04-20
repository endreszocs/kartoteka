# Pénzügyi modul — Architektúra terv

**Stack:** Next.js 16 + Supabase + Tailwind CSS 4 + shadcn/ui
**Kapcsolódó dokumentáció:**
- Elemzés: `modules/finance.md`
- Üzleti szabályok: `rules/finance-rules.md`
- Felhasználói folyamatok: `workflows/finance-flow.md`
- Implementációs terv: `todo/phase-4-finance.md`

---

## 1. Komponensek

### Komponens hierarchia

```
app/(dashboard)/penzugy/page.tsx                  ← SERVER (inicializáció orchestrátor)
│
└── <FinanceTabs />                               ← CLIENT (8 fül + központi state)
    │
    ├── [Dashboard fül]
    │   └── <FinanceDashboard />                  ← CLIENT
    │       ├── KPI kártyák (egyenleg, bevétel, kiadás, kassza)
    │       └── Friss tranzakciók lista
    │
    ├── [Kassza fül]
    │   └── <CashbookTab />                       ← CLIENT
    │       ├── Hónap-választó
    │       ├── Kassza tranzakciók (nyitó → sorok → záró)
    │       └── <CashbookPrintDialog />           ← modal: PDF
    │
    ├── [Bank fül]
    │   └── <BankTab />                           ← CLIENT
    │       ├── Bankszámla-választó
    │       ├── Bank tranzakciók lista
    │       ├── <BankAccountDialog />             ← modal: CRUD
    │       └── BCR import szekció (jövőbeli)
    │
    ├── [Terv (Költségvetés) fül]
    │   └── <BudgetTab />                         ← CLIENT
    │       ├── Bevétel tételek tábla (szamadasicel 1xx)
    │       ├── Kiadás tételek tábla (szamadasicel 2xx)
    │       ├── Élő egyenleg panel
    │       ├── Véglegesítés / Revízió / Feloldás gombok
    │       └── <BudgetPrintDialog />             ← modal: nyomtatás
    │
    ├── [Számadás fül]
    │   └── <AccountingTab />                     ← CLIENT
    │       ├── Terv vs. Tény tábla
    │       ├── Kassza/Bank aktuális egyenleg
    │       ├── Záró leltár + Véglegesítés gombok
    │       ├── <ClosingInventoryDialog />        ← modal: záró leltár
    │       └── <AccountingPrintDialog />         ← modal: nyomtatás
    │
    ├── [Tranzakciók fül]
    │   └── <TransactionsTab />                   ← CLIENT
    │       ├── Havi szűrő
    │       ├── Egységes bevétel+kiadás táblázat
    │       ├── Törlés gombok (soft delete)
    │       ├── Diagram (recharts — bevétel/kiadás trend)
    │       └── <AuditBadges />                   ← hiányzó sorszám + párosítatlan jelzők
    │
    ├── [Tartozások fül]
    │   └── <DebtTab />                           ← CLIENT
    │       ├── Évtartomány szűrő
    │       ├── <DebtTable />                     ← járulék hátralék személyenként
    │       ├── Bérleti szerződések szekció
    │       ├── <RentalContractDialog />          ← modal: CRUD
    │       └── <FeeManagerDialog />              ← modal: kedvezmény kezelés
    │
    └── [Monetár fül]
        └── <MonetaryTab />                       ← CLIENT
            ├── Címlet-táblázat (500 → 0.01 RON)
            ├── Darabszám input-ok
            └── Egyeztetés eredmény (fizikai vs. könyv szerinti)

── Globális gombok (FinanceTabs fejlécében) ──
    ├── [+ Bevétel] → <IncomeDialog />            ← modal: egyedi mód
    │                  └── <IncomeBatchDialog />   ← modal: batch mód (toggle)
    ├── [+ Kiadás] → <ExpenseDialog />            ← modal
    ├── [Belső mozgás] → <InternalTransferDialog /> ← modal: 4 típus
    └── [Éves beállítás] → <YearlySettingsDialog /> ← modal

── Audit (SzuperAdmin) ──
    └── <PaymentLinkDialog />                     ← modal: párosítatlan összekötés

── Közös segédkomponensek ──
    ├── <IncomeSearch />                          ← tag/cég okos kereső (újrafelhasznált)
    └── <CategorySelect />                        ← szamadasicel hierarchikus dropdown (újrafelhasznált)
```

### Server vs Client döntés

| Komponens | Típus | Indoklás |
|-----------|:-----:|---------|
| `page.tsx` | **Server** | Kezdeti 8 párhuzamos query + kategória map felépítés |
| `FinanceTabs` + minden fül | **Client** | Fülek közötti állapotmegosztás (tranzakciók, egyenlegek, map-ek) |
| Minden modal | **Client** | Form-ok, keresők, dinamikus UI |

A pénzügyi modul szinte teljes egészében **Client Component**. Az egyetlen Server Component a page.tsx, ami az inicializálást végzi (kategória map-ek, átviteli egyenleg — ezek nem változnak a session alatt).

### shadcn/ui használat

| shadcn/ui | Hol |
|-----------|-----|
| `Tabs, TabsList, TabsTrigger, TabsContent` | 8 fő fül |
| `Dialog, DialogContent, DialogHeader, DialogTitle` | Minden modal (13 db) |
| `Card, CardContent, CardHeader` | KPI kártyák, egyenleg, tartozás összesítők |
| `Badge` | Fizetési státusz, audit figyelmeztetések, BM sorszám |
| `Button` | Akciógombok (bevétel, kiadás, mozgás, mentés, törlés) |
| `Input` | Form mezők, keresők, összegek |
| `Label` | Form címkék |
| `Select` | Kategória, bankszámla, hónap, év, típus dropdown-ok |
| `Separator` | Szekciók elválasztása |
| `Table` | Tranzakciók, kassza, költségvetés, számadás, tartozás |

---

## 2. Oldal struktúra

### Route

```
/penzugy → app/(dashboard)/penzugy/page.tsx
```

### Layout: 8 fül + globális akciógombok

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [+ Bevétel] [+ Kiadás] [Belső mozgás] [⚙ Beállítás]     2026. év ▼  │
├──────────────────────────────────────────────────────────────────────────┤
│  Dashb. │ Kassza │ Bank │ Terv │ Számadás │ Tranzakciók │ Tartoz. │ Mon│
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [Aktív fül tartalma]                                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Dashboard fül

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  💰 Kassza  │  🏦 Bank    │  📈 Bevétel │  📉 Kiadás  │
│  12.450 RON │  45.200 RON │  67.800 RON │  52.100 RON │
│  (készpénz) │  (összesen) │  (idén)     │  (idén)     │
└─────────────┴─────────────┴─────────────┴─────────────┘
┌────────────────────────────────────────────────────────┐
│  EGYENLEG: +15.700 RON                                 │
│  "Bölcs sáfárkodás! Szép tartalék marad az évre."    │
└────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────┐
│  FRISS TRANZAKCIÓK                                     │
│  2026-04-05  Kovács J.  Járulék     +100 RON  🟢     │
│  2026-04-04  Villámszla  Áram        -250 RON  🔴     │
│  ...                                                   │
└────────────────────────────────────────────────────────┘
```

### Kassza fül

```
┌──────────────────────────────────────────────────────────┐
│  Hónap: [Április 2026 ▼]              [🖨 Nyomtatás]    │
├──────────┬────────────────────┬──────────┬──────────────┤
│  Nyitó egyenleg                            8.200 RON    │
├──────────┬────────────────────┬──────────┬──────────────┤
│  Dátum   │ Iratszám │ Megnevezés  │ Bevétel │ Kiadás   │
│  04-01   │ 23       │ Kovács J.   │ 100     │          │
│  04-02   │ 24       │ Nagy P.     │ 200     │          │
│  04-03   │ K-12     │ Villámszla  │         │ 250      │
├──────────┴────────────────────┴──────────┴──────────────┤
│  Záró egyenleg                             8.250 RON    │
└─────────────────────────────────────────────────────────┘
```

### Költségvetés fül (Terv)

```
┌─────────────────────────────┬─────────────────────────────┐
│  📈 BEVÉTEL TÉTELEK         │  📉 KIADÁS TÉTELEK          │
├──────┬─────────────┬────────┤──────┬──────────────┬───────┤
│ Kód  │ Megnevezés  │ Terv   │ Kód  │ Megnevezés   │ Terv  │
│101.01│ Járulék     │ 30.000 │201.01│ Személyi     │ 15.000│
│102.01│ Adomány     │  5.000 │202.01│ Dologi       │ 10.000│
│ ...  │  ...        │  ...   │ ...  │  ...         │  ...  │
├──────┴─────────────┴────────┴──────┴──────────────┴───────┤
│  ⚖ EGYENLEG: +10.000 RON                                  │
│  [Véglegesítés és nyomtatás]  [Feloldás kérelem]          │
└───────────────────────────────────────────────────────────┘
```

### Belső mozgás modal

```
┌────────────────────────────────────────────────┐
│  BELSŐ MOZGÁS                                  │
├────────────────────────────────────────────────┤
│  [Kassza→Bank] [Bank→Kassza] [Bank→Bank] [FX] │
│                                                │
│  Forrás:  [Kassza (készpénz)        ▼]        │
│  Cél:     [BCR RON — RO49...       ▼]        │
│  Összeg:  [________] RON                       │
│  Dátum:   [2026-04-06]                         │
│  Megj.:   [________]                           │
│                                                │
│  [Mégse]                      [Mentés]         │
└────────────────────────────────────────────────┘
```

### Responsive viselkedés

| Breakpoint | Dashboard | Kassza/Tranzakciók | Költségvetés |
|-----------|-----------|-------------------|-------------|
| `lg` (≥1024px) | 4 KPI kártya sorban | Teljes táblázat | 2 oszlop (bev ‖ kia) |
| `md` (≥768px) | 2×2 KPI grid | Rejtett oszlopok | 1 oszlop (bev fölött kia) |
| `sm` (<768px) | 1×4 KPI lista | Kártya nézet | 1 oszlop, kompakt |

---

## 3. State kezelés

### page.tsx (Server) → props a FinanceTabs-nak

A Server Component egyszer futtatja a 8 párhuzamos lekérdezést:

```
FinanceTabs props:
  settings:           BealitasRow          ← éves beállítások (járulék, flagek)
  bevCelMap:          Record<number, string>  ← befizetescel ID → szamadasicel kód
  kiaCelMap:          Record<number, string>  ← kiadascel ID → szamadasicel kód
  szamadasiCellek:    SzamadasiCel[]       ← teljes kategória hierarchia
  bmBevCelIds:        { keszpenz: number; banki: number }
  bmKiaCelIds:        { keszpenz: number; banki: number }
  bankAccounts:       BankAccount[]
  initialIncome:      BefitetesRow[]       ← aktuális évi bevételek
  initialExpense:     KiadasRow[]          ← aktuális évi kiadások
  carryoverCash:      number               ← nyitó kassza egyenleg
  carryoverBank:      number               ← nyitó bank egyenleg
  members:            SimpleMember[]       ← tagok (kereséshez)
  congregationName:   string
  yearlyFees:         Record<number, number>  ← évenkénti járulék összegek
  feeDiscounts:       FeeDiscount[]        ← aktív kedvezmények
  debtCalcMode:       'akkori' | 'aktualis'
  isGodMode:          boolean
  currentYear:        number
```

Ezek a props-ok **nem változnak** a session alatt (az inicializálási adatok statikusak). A tranzakciók frissítését a kliens kezeli.

### FinanceTabs (Client) — központi állapot

```
activeTab:           string              ← 'dashboard'|'cashbook'|'bank'|'budget'|'accounting'|'transactions'|'debt'|'monetary'
incomeRecords:       BefitetesRow[]      ← élő tömb (bevétel hozzáadás/törlés után frissül)
expenseRecords:      KiadasRow[]         ← élő tömb
transfers:           BelsomozgasRow[]    ← élő tömb (lazy-loaded a belső mozgás fülön)

// Számított értékek (derived state — nem explicit state)
cashBalance:         number              ← carryoverCash + Σ(készpénz bev) − Σ(készpénz kia)
bankBalance:         number              ← carryoverBank + Σ(banki bev) − Σ(banki kia)
totalIncome:         number              ← Σ(bev osszeg) — aktuális év
totalExpense:        number              ← Σ(kia osszeg) — aktuális év
```

A `incomeRecords` és `expenseRecords` a kliens memóriájában élnek. Új tétel hozzáadásakor VAGY törlésekor a tömb frissül (optimistic update) + háttérben `revalidatePath`.

### IncomeDialog / ExpenseDialog state

```
// Bevétel egyedi
selectedPerson:      { id, name, familyId } | null
selectedCategory:    number | null     ← befizetescel ID
amount:              number
date:                string
receiptNumber:       string
receiptType:         'Készpénz' | 'Banki'
paidYear:            number | null
note:                string
loading:             boolean

// Bevétel batch — sorok tömbje
batchRows:           IncomeRow[]       ← dinamikus (hozzáadás/eltávolítás)
```

### InternalTransferDialog state

```
transferType:        'kassza_bank' | 'bank_kassza' | 'bank_bank' | 'valutacsere'
sourceAccount:       string            ← 'kassza' | bankszámla ID
targetAccount:       string
amount:              number
date:                string
exchangeRate:        number | null     ← valutacserénél
targetAmount:        number | null     ← forrás × árfolyam
note:                string
loading:             boolean
```

### BudgetTab state

```
budgetValues:        Record<string, number>   ← szamadasicelId → összeg
isFinalized:         boolean
isRevisionMode:      boolean
unlockRequested:     boolean
saving:              boolean
```

### DebtTab state

```
yearFrom:            number
yearTo:              number
debts:               DebtRow[]         ← kiszámolt hátralék személyenként
rentalContracts:     RentalContract[]
loading:             boolean
```

### Nincs globális state store

Minden állapot a `FinanceTabs` szintjén vagy az egyes fülekben/modal-okban lokálisan kezelt. Indoklás:
- A kategória map-ek (`bevCelMap`, `kiaCelMap`) a Server-ből jönnek és nem változnak → props
- A tranzakció tömbök (`incomeRecords`, `expenseRecords`) a `FinanceTabs`-ban élnek és füleknek/modal-oknak props-ként mennek tovább
- A modal-ok a szülő fülből kapják az `open/onOpenChange` + callback-eket
- Bevétel/kiadás mentés után: optimistic update a memóriában + `revalidatePath` háttérben

---

## 4. API hívások

### Server Component lekérdezések (page.tsx — egyszer, betöltéskor)

8 párhuzamos Supabase query:

| # | Mit kérdez | Eredmény |
|---|-----------|---------|
| 1 | `bealitas` (aktuális év + gyülekezet) | Éves beállítások |
| 2 | `szamadasicel` (összes, order by sorszam) | Kategória hierarchia |
| 3 | `befizetescel` + `kiadascel` | Junction → `bevCelMap`, `kiaCelMap` felépítés |
| 4 | `bankszamlak` (aktív) | Bankszámlák |
| 5 | `szemely` (aktív, isvisible, alapmezők) | Tagok a kereséshez |
| 6 | `befizetes` (aktuális év, deleted=false) | Éves bevételek |
| 7 | `kiadas` (aktuális év, deleted=false) | Éves kiadások |
| 8 | Előző évi bev/kia összesítés | Átviteli egyenleg számítás |

### Server Action hívások (kliens → szerver)

#### Bevétel

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Tag keresés | `searchMembers(query)` | IncomeDialog / IncomeSearch | gépelés (3+ kar.) |
| Következő nyugtaszám | `getNextReceiptNumber()` | IncomeDialog | modal megnyitás |
| Iratszám duplikáció | `checkReceiptDuplicate(num)` | IncomeDialog | iratszám változás |
| Utolsó dátum | `getLastRecordedDate()` | IncomeDialog | modal megnyitás |
| Bevétel mentés | `saveIncome(data)` | IncomeDialog | submit |
| Batch mentés | `saveBatchIncome(rows)` | IncomeBatchDialog | submit |

#### Kiadás

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Kiadás mentés | `saveExpense(data)` | ExpenseDialog | submit |
| Tranzakció törlés | `deleteTransaction(type, id)` | TransactionsTab | törlés gomb |

#### Belső mozgás

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Belső mozgás mentés | `saveInternalTransfer(data)` | InternalTransferDialog | submit |
| Bank CRUD | `saveBankAccount(data)` | BankAccountDialog | submit |

#### Költségvetés / Számadás

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Költségvetés betöltés | `getBudget(year)` | BudgetTab | fül váltás |
| Költségvetés mentés | `saveBudget(data, finalize)` | BudgetTab | submit |
| Feloldás kérelem | `requestBudgetUnlock()` | BudgetTab | gomb |
| Számadás betöltés | `getAccounting(year)` | AccountingTab | fül váltás |
| Záró leltár mentés | `saveClosingInventory(data)` | ClosingInventoryDialog | submit |
| Számadás véglegesítés | `finalizeAccounting()` | AccountingTab | gomb |
| Számadás feloldás | `requestAccountingUnlock()` | AccountingTab | gomb |

#### Tartozások

| Művelet | Server Action | Ki hívja | Mikor |
|---------|--------------|---------|-------|
| Tartozás számítás | `getDebts(yearFrom, yearTo)` | DebtTab | fül váltás + szűrő |
| Bérleti szerz. CRUD | `saveRentalContract(data)` | RentalContractDialog | submit |
| Párosítatlan befizetések | `getUnlinkedPayments()` | PaymentLinkDialog | modal megnyitás |
| Befizetés összekötés | `linkPayment(paymentId, memberId)` | PaymentLinkDialog | kiválasztás |

### Adatfolyam diagram

```
SZERVER (page.tsx)                          KLIENS
━━━━━━━━━━━━━━━━━━━                        ━━━━━━━━━━━━━━━━━━━━
                                            
 Supabase ──8× query──► init adatok         
     │                                      
     └── settings, maps, bankAccounts ─────► FinanceTabs
         incomeRecords, expenseRecords          │
         carryover, members                     │
                                       ┌────────┼────────────────────┐
                                       ▼        ▼                    ▼
                                  DashboardTab  CashbookTab     BudgetTab
                                       │                            │
                                       │   IncomeDialog             │
                                       │      │                     │
                                       │   submit ──► saveIncome()  │
                                       │      │                     │
                         Supabase ◄─── Server Action ◄───┘          │
                              │                                     │
                              └── revalidatePath                    │
                                   + optimistic update ──► tömb frissül
                                                                    │
                                                              submit ──► saveBudget()
                                                                    │
                                              Supabase ◄─── Server Action ◄──┘
```

---

## 5. Auth kezelés

### Rétegek

```
1. réteg: Middleware
   └── Session + token → ha nincs user → /login

2. réteg: Dashboard layout
   └── getUser() → profil → pending check → God Mode check

3. réteg: page.tsx
   └── getUser() → profil → congregation_id → 8 init query
   └── isGodMode prop → audit funkciók megjelenítéséhez

4. réteg: Server Actions
   └── Minden action: getUser() → profil → congregation_id
   └── INSERT: congregation_id profilból (SOHA nem klienstől)
   └── Feloldás kérelem: isEsperesRole() check
   └── Audit: isMasterAdmin() check
```

### Funkció-szintű jogosultságok

| Funkció | Ki látja a gombot | Szerver-ellenőrzés |
|---------|-------------------|-------------------|
| Bevétel/kiadás CRUD | Mindenki | RLS (congregation_id) |
| Belső mozgás | Mindenki | RLS |
| Költségvetés véglegesítés | Mindenki | RLS |
| Költségvetés FELOLDÁS | Mindenki látja a gombot | Server Action: `isEsperesRole()` |
| Számadás FELOLDÁS | Mindenki látja a gombot | Server Action: `isEsperesRole()` |
| Párosítatlan audit gomb | isGodMode → render | Server Action: `isMasterAdmin()` |
| Bankszámla CRUD | Mindenki | RLS |

### A `congregation_id` védelme

A pénzügyi modulban kritikus, hogy:
- Minden INSERT-ben a `congregation_id` a profilból jön
- Minden SELECT-ben a RLS szűr
- A kliens SOHA nem küldi a `congregation_id`-t paraméterként
- A belső mozgás kettős bejegyzésénél MINDKÉT rekord ugyanazt a `congregation_id`-t kapja

---

## 6. Validáció elhelyezése

### Zod sémák helye

**Fájl:** `lib/validations/finance.ts`

Minden séma itt definiált — kliens ÉS szerver is importálja.

### Sémák

#### incomeSchema (bevétel)

```
osszeg:           number, >0, "Az összeg kötelező és pozitív szám"
datum:            string, YYYY-MM-DD, kötelező
                  refine: datum <= today ("Jövőbeli dátum nem engedélyezett")
id_befizetescel:  number, kötelező, "Válasszon kategóriát"
id_szemely:       number | null
id_csalad:        number | null
forrasa:          string | null
iratszam:         string | null
irattipus:        enum('Készpénz', 'Banki'), kötelező
fizetettev:       number | null
megjegyzes:       string | null
belso_mozgas_xkey: string | null (belső mozgásnál — szerver állítja be)
```

#### expenseSchema (kiadás)

```
osszeg:           number, >0
datum:            string, YYYY-MM-DD, refine: <= today
id_kiadascel:     number, kötelező
kedvezmenyzett:   string | null (partner neve)
id_szemely:       number | null
bizonylatszam:    string | null
irattipus:        enum('Készpénz', 'Banki')
megjegyzes:       string | null
is_inventory:     boolean (leltár jelölés)
```

#### internalTransferSchema (belső mozgás)

```
tipus:            enum('kassza_bank', 'bank_kassza', 'bank_bank', 'valutacsere')
osszeg:           number, >0
datum:            string, YYYY-MM-DD, refine: <= today
forras:           string, kötelező ('kassza' | bankszámla ID)
cel:              string, kötelező
                  refine: forras !== cel ("Forrás és cél nem lehet azonos")
arfolyam:         number | null (valutacserénél kötelező — refine)
cel_osszeg:       number | null (valutacserénél)
megjegyzes:       string | null
```

#### budgetItemSchema (költségvetés tétel)

```
szamadasicelid:   string, kötelező
osszeg:           number, >=0
modositott:       number | null (revízió összeg)
```

#### bankAccountSchema

```
bank_neve:        string, min(1), kötelező
iban:             string | null
valuta:           enum('RON', 'EUR'), kötelező
aktiv:            boolean, default true
```

#### rentalContractSchema (bérleti szerződés)

```
id:               number | undefined
berlo_tipus:      enum('szemely', 'ceg')
id_szemely:       number | null (ha személy)
berlo_nev:        string | null (ha cég)
ceg_adoszam:      string | null
osszeg:           number, >0
kezdet:           string, YYYY-MM-DD, kötelező
veg:              string, YYYY-MM-DD, kötelező, refine: veg >= kezdet
gyakorisag:       enum('havi', 'negyedeves', 'feleves', 'eves')
```

### Hol fut a validáció

| Réteg | Mit validál | Hogyan | Hibajelzés |
|-------|-----------|--------|-----------|
| **Kliens — form** | IncomeDialog | `react-hook-form` + `zodResolver` | Mező alatti piros hiba |
| **Kliens — form** | ExpenseDialog | `zodResolver` | Mező alatti hiba |
| **Kliens — form** | InternalTransferDialog | `zodResolver` | Mező alatti hiba |
| **Kliens — batch** | IncomeBatchDialog | Soronkénti manuális check | Badge-ek soronként |
| **Kliens — valós idejű** | Dátum mező | `onChange` → badge (jövőbeli/visszamenőleges) | Badge a mező mellett |
| **Kliens — valós idejű** | Iratszám mező | `onBlur` → Server Action → duplikáció check | Badge a mező mellett |
| **Szerver — action** | `saveIncome()` | `incomeSchema.safeParse()` | `{ error }` → toast |
| **Szerver — action** | `saveExpense()` | `expenseSchema.safeParse()` | `{ error }` → toast |
| **Szerver — action** | `saveInternalTransfer()` | `transferSchema.safeParse()` | `{ error }` → toast |
| **Szerver — action** | `saveBudget()` | `budgetItemSchema[]` soronként | `{ error }` → toast |
| **Szerver — action** | `saveRentalContract()` | `rentalContractSchema.safeParse()` | `{ error }` → toast |
| **Szerver — action** | Feloldás kérelem | `isEsperesRole()` | `{ error }` → toast |
| **Szerver — action** | Audit | `isMasterAdmin()` | `{ error }` → toast |
| **DB — RLS** | `congregation_id` | Supabase policy | Silent fail |

### Üzleti validációk a szerveren (Zod-on kívül)

| Szabály | Hol | Mi történik |
|---------|-----|-------------|
| Jövőbeli dátum BLOKKOLVA | `saveIncome()`, `saveExpense()`, `saveInternalTransfer()` | `{ error: "Jövőbeli dátum nem engedélyezett" }` |
| Iratszám duplikáció | `saveIncome()` | Figyelmeztetés (nem blokkolás — a régi rendszer sem blokkolja) |
| Belső mozgás: forrás = cél | `saveInternalTransfer()` | `{ error: "Forrás és cél nem lehet azonos" }` |
| Véglegesített költségvetés szerkesztése | `saveBudget()` | `if (settings.budget_finalized && !isRevision)` → error |
| Feloldás: esperes jogosultság | `requestBudgetUnlock()`, `requestAccountingUnlock()` | `isEsperesRole()` → error ha nem esperes |
| Leltár auto-jelölés | `saveExpense()` | Szerver-oldalon is: ha `isInventoryCategory()` → `leltar_tetelek` INSERT |
| Kettős bejegyzés integritás | `saveInternalTransfer()` | Ha a 2. INSERT hibázik → az 1. orphan marad (ismert limitáció — Supabase nincs tranzakció) |

### Validáció NEM szükséges

| Adat | Miért nem |
|------|----------|
| Kategória map-ek (bevCelMap, kiaCelMap) | Server Component-ből jönnek, nem módosíthatók |
| Átviteli egyenleg | Szerver számítja, a kliens nem módosíthatja |
| Dashboard KPI-k | Derived state a tranzakció tömbökből |
| Monetár (pénztári egyeztetés) | Nincs mentés — pillanatfelvétel számítás |

---

## Összefoglaló: fájlok és felelősségek

```
ADATRÉTEG
├── lib/constants/finance.ts          ← típusok, pénznem, kód konstansok, leltár kulcsszavak
├── lib/utils/finance-helpers.ts      ← formatCurrency(), parseHungarianWomensName(),
│                                        normalizeName(), sortCellsHierarchically(),
│                                        isInventoryCategory(), calculateDebt()
├── lib/validations/finance.ts        ← Zod: income, expense, transfer, budget,
│                                        bankAccount, rentalContract sémák
│
SZERVER RÉTEG
├── app/(dashboard)/penzugy/
│   ├── page.tsx                      ← 8 pár. query → init adatok → FinanceTabs props
│   ├── actions.ts                    ← initFinance, getYearlySettings, getCategoryMaps
│   ├── income-actions.ts            ← saveIncome, saveBatchIncome, searchMembers,
│   │                                    getNextReceiptNumber, checkReceiptDuplicate
│   ├── expense-actions.ts           ← saveExpense, deleteTransaction
│   ├── transfer-actions.ts          ← saveInternalTransfer, getBankAccounts, saveBankAccount
│   ├── budget-actions.ts            ← getBudget, saveBudget, getAccounting,
│   │                                    finalizeAccounting, saveClosingInventory,
│   │                                    requestBudgetUnlock, requestAccountingUnlock
│   └── debt-actions.ts              ← getDebts, saveRentalContract, deleteRentalContract,
│                                        getUnlinkedPayments, linkPayment
│
MEGJELENÍTÉSI RÉTEG (Client)
├── components/finance/
│   ├── finance-tabs.tsx              ← 8 fül orchestrátor + központi state
│   ├── dashboard-tab.tsx             ← KPI + egyenleg + friss tranzakciók
│   ├── cashbook-tab.tsx              ← Kassza havi bontás
│   ├── bank-tab.tsx                  ← Bank tranzakciók
│   ├── budget-tab.tsx                ← Költségvetés tervezés
│   ├── accounting-tab.tsx            ← Számadás (terv vs. tény)
│   ├── transactions-tab.tsx          ← Egységes lista + diagram + törlés
│   ├── debt-tab.tsx + debt-table.tsx ← Tartozások
│   ├── monetary-tab.tsx              ← Monetár (címlet-számolás)
│   ├── income-search.tsx             ← Tag/cég okos kereső
│   ├── category-select.tsx           ← Szamadasicel hierarchikus dropdown
│   └── audit-badges.tsx              ← Sorszám + párosítatlan figyelmeztetés
│
MODAL RÉTEG (Client)
├── components/modals/
│   ├── income-dialog.tsx             ← Bevétel egyedi
│   ├── income-batch-dialog.tsx       ← Bevétel batch
│   ├── expense-dialog.tsx            ← Kiadás
│   ├── internal-transfer-dialog.tsx  ← Belső mozgás (4 típus)
│   ├── bank-account-dialog.tsx       ← Bankszámla CRUD
│   ├── yearly-settings-dialog.tsx    ← Éves beállítás
│   ├── fee-manager-dialog.tsx        ← Járulék kedvezmény
│   ├── rental-contract-dialog.tsx    ← Bérleti szerződés
│   ├── closing-inventory-dialog.tsx  ← Záró leltár
│   ├── budget-print-dialog.tsx       ← Költségvetés nyomtatás
│   ├── accounting-print-dialog.tsx   ← Számadás nyomtatás
│   ├── cashbook-print-dialog.tsx     ← Pénztárkönyv PDF
│   └── payment-link-dialog.tsx       ← Párosítatlan összekötés
```
