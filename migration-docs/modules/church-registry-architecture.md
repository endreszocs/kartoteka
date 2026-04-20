# Anyakönyv — Architektúra terv

**Stack:** Next.js 16 + Supabase + Tailwind CSS 4 + shadcn/ui
**Kapcsolódó dokumentáció:**
- Elemzés: `modules/church-registry.md`
- Üzleti szabályok: `rules/church-registry-rules.md`
- Felhasználói folyamatok: `workflows/church-registry-flow.md`
- Implementációs terv: `todo/phase-5-church-registry.md`

---

## 1. Komponensek

### Komponens hierarchia

```
app/(dashboard)/anyakonyv/page.tsx            ← SERVER (congregation_id + név)
│
└── <RegistryTabs />                          ← CLIENT (9 fül + közös állapot)
    │
    ├── <RegistryFilters />                   ← Év dropdown + szöveg kereső
    │
    ├── [Dinamikus gomb]                      ← Fülönként más szín/szöveg/onClick
    │   ├── Kereszteltek → kék „Keresztelés rögzítése"
    │   ├── Konfirmáltak → lila „Konfirmandusok rögzítése"
    │   ├── Házasultak → narancs „Házasságkötés rögzítése"
    │   ├── Eltemetettek → sötét „Haláleset rögzítése"
    │   └── Tagmozgások → szürke „{Típus} rögzítése"
    │
    ├── [Áttekintő fül]
    │   └── <OverviewTab />                   ← statisztika (típusonkénti összesítés)
    │
    ├── [Kereszteltek fül]
    │   └── <RegistryTable />                 ← közös tábla (oszlopok: okirat, név, dátum, hely, lelkész, 🖨️, ✏️, 🗑️)
    │       └── soronként: Emléklap gomb, Szerkesztés, Törlés
    │
    ├── [Konfirmáltak fül]
    │   └── <RegistryTable />                 ← oszlopok: név, nem, sz_datum, dátum, lelkész
    │
    ├── [Házasultak fül]
    │   └── <RegistryTable />                 ← oszlopok: okirat, vőlegény, menyasszony, dátum, tanúk
    │
    ├── [Eltemetettek fül]
    │   └── <RegistryTable />                 ← oszlopok: név, halál dátum, temetés dátum, ok, hely
    │
    └── [4× tagmozgás fül]
        └── <RegistryTable />                 ← oszlopok: név, dátum, hely/felekezet, megjegyzés

── MODAL-ok (RegistryTabs-ból nyílnak) ──
    │
    ├── <BaptismDialog />                     ← CLIENT: keresztelés CRUD
    │   ├── <MemberSearchAk />               ← személy kereső + „Gyorsrögzítés" gomb
    │   ├── <ParentSearchAk />               ← szülő kereső (CNP + vallás)
    │   └── sablon szekció (anya leánykori, szülők vallása)
    │
    ├── <ConfirmationDialog />                ← CLIENT: konfirmáció tömeges
    │   ├── konfirmandus keresés
    │   ├── korosztály kereső gomb
    │   ├── jelölt lista (hozzáad/eltávolít)
    │   └── wizard állapotgép (ha hiányzó keresztelés van)
    │
    ├── <ConfirmationEditDialog />            ← CLIENT: egyedi konfirmáció szerkesztés
    │
    ├── <MarriageDialog />                    ← CLIENT: házasság
    │   ├── vőlegény kereső (csak férfi)
    │   └── menyasszony kereső (csak nő)
    │
    ├── <BurialDialog />                      ← CLIENT: temetés
    │
    ├── <MovementDialog />                    ← CLIENT: 4 tagmozgás (típusfüggő mezők)
    │
    └── <BaptismCertificate />                ← CLIENT: emléklap generálás + nyomtatás (új ablak)
```

### Server vs Client döntés

| Komponens | Típus | Indoklás |
|-----------|:-----:|---------|
| `page.tsx` | **Server** | Egyetlen lekérdezés: congregation_id + név |
| `RegistryTabs` + minden alatta | **Client** | Fülváltás, szűrés, rendezés, CRUD modal-ok — mind interaktív |

Az anyakönyv modul **szinte teljes egészében Client Component**. A Server Component csak a gyülekezet azonosítóját és nevét adja át. Az adatbetöltés fülváltáskor történik Server Action-nel (nem a page.tsx-ben — mert 9 különböző tábla közül kell választani).

### shadcn/ui használat

| shadcn/ui | Hol |
|-----------|-----|
| `Tabs, TabsList, TabsTrigger, TabsContent` | 9 fő fül |
| `Dialog, DialogContent, DialogHeader, DialogTitle` | 7 modal |
| `Card, CardContent` | Áttekintő kártyák |
| `Badge` | Bejegyzés szám, szűrő eredmény, emléklap jelölés |
| `Button` | Dinamikus gomb (fülönként eltérő), CRUD gombok |
| `Input` | Keresők, dátum, szöveg mezők |
| `Label` | Form címkék |
| `Select` | Év szűrő, típus választó |
| `Table` | Közös RegistryTable (dinamikus oszlopok) |
| `Separator` | Form szekciók (keresztelés: személy / szülők / sablon) |

---

## 2. Oldal struktúra

### Route

```
/anyakonyv → app/(dashboard)/anyakonyv/page.tsx
```

### Layout: 9 fül + dinamikus gomb + szűrő sáv

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Áttek. │ Kereszt. │ Konfirm. │ Házas. │ Temett. │ Bekölt. │ Elk. │ Átt.│Ki│
├──────────────────────────────────────────────────────────────────────────────┤
│  [Év: 2026 ▼] [🔍 Keresés ____________]                [+ Keresztelés 🔵]  │
│                                                          (típusfüggő gomb) │
├──────────────────────────────────────────────────────────────────────────────┤
│  42 bejegyzés                                                               │
├────────┬───────────────┬──────────┬─────────┬──────────┬───────────────────┤
│ Okirat │ Név           │ Dátum    │ Hely    │ Lelkész  │ Műveletek         │
├────────┼───────────────┼──────────┼─────────┼──────────┼───────────────────┤
│ 26001  │ Kovács Anna   │ 2026-03  │ Kovász. │ Nt. Nagy │ [🖨️] [✏️] [🗑️]  │
│ 26002  │ Nagy Péter    │ 2026-04  │ Kovász. │ Nt. Nagy │ [🖨️] [✏️] [🗑️]  │
└────────┴───────────────┴──────────┴─────────┴──────────┴───────────────────┘
```

### Keresztelés modal layout

```
┌─────────────────────────────────────────────────────────────┐
│  KERESZTELÉS RÖGZÍTÉSE                          [✕ Bezárás] │
├─────────────────────────────────────────────────────────────┤
│  ── Személy ──────────────────────────────────              │
│  [🔍 Keresés _________]    [+ Gyorsrögzítés]               │
│  ✅ Kovács Anna (2026-01-15)                                │
│                                                             │
│  ── Szülők ───────────────────────────────────              │
│  Édesapa: [🔍 ________]  CNP: ✅ összekötve                 │
│           ℹ️ 34 éves | Kovászna, Fő u. 12                  │
│           Vallás: Református                                │
│  Édesanya: [🔍 ________]  CNP: ✅ összekötve                │
│            ℹ️ 31 éves | Kovászna, Fő u. 12                 │
│            Leánykori név: [________]                        │
│            Vallás: [________]                               │
│                                                             │
│  ── Részletek ────────────────────────────────              │
│  Okirat: [202601003] (auto)  Dátum: [2026-04-06]          │
│  Hely: [Kovászna ▼]         Lelkész: [________]           │
│  Keresztszülők: [________________________]                  │
│  Alapige: [________________________]                        │
│                                                             │
│  ☑ Rögzítés a munkanaplóba                                 │
│                                                             │
│  [Mégse]                                    [Mentés 💾]     │
└─────────────────────────────────────────────────────────────┘
```

### Konfirmáció modal layout

```
┌─────────────────────────────────────────────────────────────┐
│  KONFIRMANDUSOK RÖGZÍTÉSE                                   │
├─────────────────────────────────────────────────────────────┤
│  [🔍 Név keresés ________] [12–16 évesek keresése]         │
│                                                             │
│  Jelöltek (5 fő):                                          │
│  ┌────┬────────────┬────┬──────────┬──────────┬──────────┐ │
│  │ #  │ Név        │ Nem│ Sz.dátum │ Ker.dátum│ Művelet  │ │
│  │ 1  │ Kovács A.  │ ♀  │ 2012-05  │ 2012-06  │ [✕]     │ │
│  │ 2  │ Nagy P.    │ ♂  │ 2011-08  │ ⚠️ NINCS │ [✕]     │ │
│  │ 3  │ Kis M.     │ ♀  │ 2013-01  │ 2013-03  │ [✕]     │ │
│  └────┴────────────┴────┴──────────┴──────────┴──────────┘ │
│  [Mindent töröl]                                           │
│                                                             │
│  ── Közös adatok ──                                        │
│  Dátum: [2026-04-15]  Lelkész: [________]                  │
│  Megjegyzés: [________]                                     │
│  ☑ Rögzítés a munkanaplóba                                 │
│                                                             │
│  [Mégse]                        [Mentés (5 konfirmandus)]  │
└─────────────────────────────────────────────────────────────┘
```

### Responsive viselkedés

| Breakpoint | Táblázat | Fülek |
|-----------|---------|-------|
| `lg` (≥1024px) | Teljes oszlopok + műveletek | Teljes szöveg |
| `md` (≥768px) | Rejtett oszlopok (hely, lelkész) | Rövidített nevek |
| `sm` (<768px) | Kártya nézet | Scrollable fülek |

---

## 3. State kezelés

### page.tsx (Server) → minimális props

```
RegistryTabs props:
  congregationId:    string
  congregationName:  string
```

A page.tsx **CSAK** a gyülekezet azonosítóját és nevét kérdezi le. Az adatbetöltés fülváltáskor történik (Client-oldalon Server Action hívással).

### RegistryTabs (Client) — központi állapot

```
activeTab:          string              ← 'attekinto'|'keresztseg'|'konfirmalas'|...
allData:            RegistryEntry[]     ← az aktuális fül adatai (Server Action-nel töltve)
loading:            boolean
filterYear:         string              ← '' = összes, '2026' = szűrt
searchText:         string
sortCol:            string | null
sortAsc:            boolean
```

Az `allData` fülváltáskor CSERÉLŐDIK — a kliens csak egy fül adatait tartja egyszerre a memóriában.

#### Származtatott értékek (nem state)

```
filteredData:       ← allData szűrve (év + szöveg) és rendezve (oszlop + irány)
yearOptions:        ← allData-ból kinyert egyedi évek listája
entryCount:         ← filteredData.length
```

### BaptismDialog (keresztelés modal) állapotok

```
// Személy
selectedPerson:     { id, name } | null
// Szülők
father:             { id, cnp, name, religion, familyName } | null
mother:             { id, cnp, name, religion, familyName, maidenName } | null
// Form mezők
okirat:             string              ← auto-generált
datum:              string
helyId:             number | null
lelkesz:            string
keresztszulok:      string
alapige:            string
munkanaploba:       boolean
megjegyzes:         string
// Sablon
apavallas:          string
anyavallas:         string
anyaLeanykori:      string
// Segéd
editId:             number | null       ← null = új, szám = szerkesztés
loading:            boolean
```

### ConfirmationDialog (konfirmáció modal) állapotok

```
candidates:         ConfirmCandidate[]  ← {id, name, gender, birthDate, baptismDate?}
sharedDate:         string
sharedLelkesz:      string
sharedMegjegyzes:   string
munkanaploba:       boolean
// Wizard
wizardActive:       boolean
wizardQueue:        number[]            ← hiányzó keresztelésű személyek ID-i
wizardCurrent:      number              ← hányadik wizard lépésnél tart
loading:            boolean
```

### MovementDialog (tagmozgás modal) állapotok

```
movementType:       'bekoltozott'|'elkoltozott'|'attert'|'kitert'
selectedPerson:     { id, name } | null
datum:              string
helyId:             number | null
felekezet:          string              ← áttérés/kitérés
igazolas:           string              ← beköltözés
kulfoldre:          boolean             ← elköltözés
megjegyzes:         string
editId:             number | null
loading:            boolean
```

### Nincs globális state

Minden állapot a `RegistryTabs` vagy az egyes modal-okban lokálisan kezelt. A fülváltás Server Action-t hív → `allData` cserélődik.

---

## 4. API hívások

### Fülváltáskor (a fő adatbetöltés)

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Adatbetöltés | `getRegistryData(tab, congId)` | Fülváltás |

A `tab` paraméter határozza meg a táblát. Egy Server Action 8 táblát kezel (switch).

### Keresztelés

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Mentés | `saveBaptism(data)` | Form submit |
| Szülő UPDATE | (saveBaptism belül) | Mentéskor |
| Család auto | `checkAndCreateFamily(...)` | Új keresztelés mentéskor |
| Emléklap adatok | `getBaptismDetails(id)` | Emléklap gomb |
| Okiratszám | `getNextOkiratNumber(tab, year, congId)` | Modal megnyitás |

### Konfirmáció

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Jelölt keresés | `getConfirmationCandidates(query)` | Keresés (3+ kar.) |
| Korosztály | `getCandidatesByAge(12, 16)` | Gomb kattintás |
| Baptism check | `checkBaptismStatus(personIds)` | Mentés előtt |
| Batch mentés | `saveConfirmationBatch(candidates, sharedData)` | Submit |

### Közös

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Személy keresés | `searchMemberForRegistry(query)` | Keresés bármely modalban |
| Szülő keresés | `searchParentForRegistry(query, isMale)` | Keresztelés modal |
| Szerkesztés | `updateRegistryEntry(tab, id, data)` | Szerkesztés submit |
| Törlés | `deleteRegistryEntry(tab, id)` | Törlés gomb + confirm |

### Adatfolyam diagram

```
SZERVER (page.tsx)                        KLIENS
━━━━━━━━━━━━━━━━━                        ━━━━━━━━━━━━━━━━━━━━

 Supabase ── congId+name ──────────────► RegistryTabs
                                           │
                                      fülváltás → getRegistryData(tab)
                                           │
          Supabase ◄── Server Action ◄─────┘
               │
               └── data[] ─────────────► allData → RegistryTable (szűrt+rendezett)
                                           │
                                       modal megnyitás → okiratszám + keresés
                                           │
                                       submit → saveBaptism() / saveConfirmationBatch() / ...
                                           │
          Supabase ◄── Server Action ◄─────┘
               │
               └── revalidatePath ──► data újratöltés (getRegistryData)
```

---

## 5. Auth kezelés

### Rétegek

```
1. réteg: Middleware → session + token
2. réteg: Dashboard layout → getUser() → profil → pending check
3. réteg: page.tsx → congregation_id prop
4. réteg: Server Actions → getUser() → profil → congregation_id
         └── INSERT: congregation_id profilból
         └── SELECT: .eq('congregation_id', congId)
         └── DELETE: nincs emelt jogosultság — mindenki törölhet saját gyülekezetén belül
```

### Jogosultság

Nincs emelt jogosultság az anyakönyvben. A RLS-en kívül nincs szerepkör-alapú korlátozás. Minden bejelentkezett lelkész teljes CRUD-ot kap.

---

## 6. Validáció elhelyezése

### Zod sémák helye

**Fájl:** `lib/validations/registry.ts`

### Sémák

#### baptismSchema

```
id_szemely:       number, kötelező
datum:            string, YYYY-MM-DD, kötelező
okirat:           string, kötelező
helyid:           number | null
lelkeszneve:      string | null
keresztszulok:    string | null
alapige:          string | null
apjaneve:         string | null
anyjaneve:        string | null
id_apja_cnp:      string | null
id_anyja_cnp:     string | null
apa_vallas:       string | null
anya_vallas:      string | null
anya_leanyneve:   string | null
munkanaploba:     boolean
megjegyzes:       string | null
```

#### confirmationBatchSchema

```
datum:            string, kötelező
lelkeszneve:      string | null
megjegyzes:       string | null
munkanaploba:     boolean
candidates:       number[], min(1), "Minimum 1 konfirmandus"
```

#### marriageSchema

```
id_ferfi:         number, kötelező
id_no:            number, kötelező
datum:            string, kötelező
okirat:           string, kötelező
lelkeszneve:      string | null
tanuk:            string | null
```

#### burialSchema

```
id_szemely:       number, kötelező
hdatum:           string, kötelező
tdatum:           string, kötelező
hoka:             string | null
hhelyid:          number | null
thelyid:          number | null
lelkeszneve:      string | null
munkanaploba:     boolean
```

#### movementSchema

```
tipus:            enum(4 típus)
id_szemely:       number, kötelező
datum:            string, kötelező
helyid:           number | null
felekezet:        string | null
igazolas:         string | null
kulfoldre:        boolean
megjegyzes:       string | null
```

### Hol fut a validáció

| Réteg | Mit validál | Hogyan | Hibajelzés |
|-------|-----------|--------|-----------|
| **Kliens — form** | BaptismDialog | State-alapú ellenőrzés (személy kötelező, dátum kötelező) | Gomb letiltás + piros szöveg |
| **Kliens — form** | ConfirmationDialog | Lista min 1 fő, dátum kötelező | Gomb letiltás |
| **Kliens — form** | MarriageDialog | Mindkét fél kötelező | Gomb letiltás |
| **Kliens — form** | BurialDialog | Mindkét dátum kötelező | Gomb letiltás |
| **Kliens — confirm** | Törlés | `confirm()` dialógus | Megerősítés |
| **Szerver** | `saveBaptism()` | Zod `safeParse` | `{ error }` → toast |
| **Szerver** | `saveConfirmationBatch()` | Zod + duplikáció check | `{ error }` → toast |
| **Szerver** | `saveRegistryEntry()` | Típusfüggő Zod séma | `{ error }` → toast |
| **Szerver** | `checkAndCreateFamily()` | CNP létezés + lakcím ellenőrzés | `{ warning }` → toast |
| **DB — RLS** | `congregation_id` | Supabase policy | Silent fail |

### Üzleti validációk a szerveren

| Szabály | Hol | Mi történik |
|---------|-----|-------------|
| Okiratszám egyediség | `saveBaptism()`, `saveRegistryEntry()` | Nem blokkolja (figyelmeztet — concurrent lehetséges) |
| Konfirmáció duplikáció | `saveConfirmationBatch()` | CHECK: személy NEM szerepel már a `konfirmalas`-ban |
| Család auto: szülő CNP létezik | `checkAndCreateFamily()` | Ha nincs → return `{ warning }` |
| Család auto: szülő lakcím | `checkAndCreateFamily()` | Ha nincs → return `{ warning: 'Nincs lakcím' }` |
| Munkanapló: modul létezik | `saveBaptism()` | `triggerWorklogFromRegistry` nem létezik → skip (try-catch) |
| Törlés: munkanapló NEM törlődik | `deleteRegistryEntry()` | A munkanapló rekord megmarad — tudatos döntés |

---

## Összefoglaló: fájlok és felelősségek

```
ADATRÉTEG
├── lib/constants/registry.ts         ← fül nevek, dinamikus gomb konfig, okirat formátum
├── lib/validations/registry.ts       ← Zod: baptism, confirmationBatch, marriage, burial, movement

SZERVER RÉTEG
├── app/(dashboard)/anyakonyv/
│   ├── page.tsx                      ← Server: congregation_id + név → RegistryTabs props
│   ├── actions.ts                    ← Közös: getRegistryData, saveRegistryEntry,
│   │                                    updateRegistryEntry, deleteRegistryEntry,
│   │                                    getNextOkiratNumber, searchMemberForRegistry,
│   │                                    searchParentForRegistry
│   ├── baptism-actions.ts           ← saveBaptism (szülő UPDATE + család auto + munkanapló),
│   │                                    getBaptismDetails (emléklap), checkAndCreateFamily
│   └── confirmation-actions.ts      ← saveConfirmationBatch, getConfirmationCandidates,
│                                        getCandidatesByAge, checkBaptismStatus

MEGJELENÍTÉSI RÉTEG (Client)
├── components/registry/
│   ├── registry-tabs.tsx             ← 9 fül orchestrátor (activeTab, allData, szűrők)
│   ├── registry-table.tsx           ← Közös tábla (dinamikus oszlopok fül alapján)
│   ├── registry-filters.tsx         ← Év dropdown + szöveg kereső
│   ├── overview-tab.tsx             ← Áttekintő statisztika
│   ├── member-search-ak.tsx         ← Személy kereső + „Gyorsrögzítés" gomb
│   ├── parent-search-ak.tsx         ← Szülő kereső (CNP + vallás + családnév)
│   └── baptism-certificate.tsx      ← Emléklap HTML + nyomtatás (új ablak)

MODAL RÉTEG (Client)
├── components/modals/
│   ├── baptism-dialog.tsx           ← Keresztelés (szülő, sablon JSON, okirat, munkanapló)
│   ├── confirmation-dialog.tsx      ← Konfirmáció tömeges (lista + wizard állapotgép)
│   ├── confirmation-edit-dialog.tsx  ← Egyedi konfirmáció szerkesztés
│   ├── marriage-dialog.tsx          ← Házasság (vőlegény + menyasszony)
│   ├── burial-dialog.tsx            ← Temetés (halál + temetés dátum)
│   └── movement-dialog.tsx          ← Tagmozgás (4 típus, típusfüggő mezők)
```
