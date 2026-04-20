# Munkanapló + Leltár + Iktatás — Architektúra terv

**Stack:** Next.js 16 + Supabase + Tailwind CSS 4 + shadcn/ui
**Kapcsolódó:** `modules/worklog-inventory-filing.md`, `rules/`, `workflows/`, `todo/`

---

## 1. Komponensek

### Három önálló route — három különálló komponens fa

```
═══ /munkanaplo ═══════════════════════════════════════════════
app/(dashboard)/munkanaplo/page.tsx       ← SERVER
│
└── <WorklogTabs />                       ← CLIENT
    ├── Hónap-választó dropdown
    ├── [Szolgálat fül]
    │   └── <WorklogTable />             ← kategóriafüggő oszlopok
    ├── [Katekézis fül]
    │   └── <WorklogTable />
    ├── [Látogatás fül]
    │   └── <WorklogTable />
    │
    ├── <WorklogDialog />                 ← modal: CRUD (dinamikus form)
    │   └── Látogatásnál: személy/család kereső
    │
    └── Gombok: [+ Új] [Jelentés] [Nyomtatás] [Excel]


═══ /leltar ═══════════════════════════════════════════════════
app/(dashboard)/leltar/page.tsx           ← SERVER
│
└── <InventoryMain />                     ← CLIENT
    ├── <InventoryStats />               ← tétel szám, összérték, legértékesebb
    ├── Szűrő: kategória + helyszín dropdown
    ├── <InventoryTable />               ← tételek (leltári szám, név, érték, amortizáció)
    │
    ├── <InventoryDialog />               ← modal: tétel CRUD
    │   ├── katalógus kód dropdown → használati idő auto
    │   └── felelős személy tag-kereső
    │
    ├── <InventoryAuditDialog />          ← modal: duplikáció wizard (lépésenként)
    ├── <InventoryPrintDialog />          ← modal: 4 nyomtatási formátum
    │
    └── Gombok: [+ Új] [Audit] [Véglegesítés] [Nyomtatás] [Feloldás kérelem]


═══ /iktato ═══════════════════════════════════════════════════
app/(dashboard)/iktato/page.tsx           ← SERVER
│
└── <FilingMain />                        ← CLIENT
    ├── Statisztika kártyák (összes, érkező, kimenő, függőben)
    ├── Irány fülek: [Érkező] [Kimenő] [Mind]
    ├── Év-választó + keresőmező
    ├── Irat táblázat (sorszám, dátum, tárgy, mappa, elintézés)
    │
    ├── <FilingDialog />                  ← modal: irat CRUD (auto sorszám)
    │
    └── Gombok: [+ Új irat] [Iktatókönyv nyomtatás] [Igazolás]
```

### Server vs Client

| Komponens | Típus | Indoklás |
|-----------|:-----:|---------|
| 3× `page.tsx` | **Server** | Egyetlen lekérdezés: congregation_id (+ leltárnál: bealitas settings) |
| Minden más | **Client** | Szűrés, rendezés, CRUD modal-ok, hónap/irány/kategória váltás |

### shadcn/ui használat

| shadcn/ui | Hol |
|-----------|-----|
| `Tabs, TabsList, TabsTrigger, TabsContent` | Munkanapló 3 fül, Iktatás irány fülek |
| `Dialog` | 5 modal (worklog, inventory, audit, print, filing) |
| `Card, CardContent` | Statisztika kártyák (leltár + iktatás) |
| `Badge` | Bejegyzés szám, amortizáció %, elintézési státusz |
| `Button` | CRUD + akciógombok |
| `Input, Label, Select` | Form mezők |
| `Table` | Minden lista |
| `Separator` | Form szekciók |

---

## 2. Oldal struktúra

### Munkanapló layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Hónap: [Április 2026 ▼]    [+ Új] [Jelentés] [🖨️] [📊 Excel] │
├──────────────────────────────────────────────────────────────────┤
│  Szolgálat │ Katekézis │ Látogatás                              │
├──────────────────────────────────────────────────────────────────┤
│  12 bejegyzés                                                    │
├─────────┬─────────────────┬────────┬────────┬────────┬──────────┤
│ Dátum   │ Típus           │ Cím    │ Részt. │ Persely│ Művelet  │
│ 04-06   │ Istentisztelet  │ Vasár. │ 85 fő  │ 230 RON│ [✏️][✕] │
│ 04-05   │ Bibliaóra       │ Heti   │ 22 fő  │ —      │ [✏️][✕] │
└─────────┴─────────────────┴────────┴────────┴────────┴──────────┘
```

### Leltár layout

```
┌──────────────────────────────────────────────────────────────────┐
│  [+ Új] [🔍 Audit] [✅ Véglegesítés] [🖨️ Nyomtatás]           │
├──────────┬──────────┬──────────┐                                 │
│ 142 tétel│ 85.400 RON│ Orgona  │  ← Statisztika kártyák         │
│ összesen │ összérték │legérték.│                                  │
├──────────┴──────────┴──────────┘                                 │
│  Kategória: [Összes ▼]   Helyszín: [Összes ▼]                   │
├──────────┬───────────────┬──────────┬────────┬───────┬──────────┤
│ Lelt.sz. │ Megnevezés    │ Kategória│ Érték  │ Amort.│ Művelet  │
│ AE-001   │ Orgona        │ Alapeszk.│ 45.000 │ 35%   │ [✏️][✕] │
│ KE-012   │ Kehely (arany)│ Kegyszer │ 12.000 │ 0%    │ [✏️][✕] │
└──────────┴───────────────┴──────────┴────────┴───────┴──────────┘
```

### Iktatás layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐                       │
│  │ 42   │ │ 18   │ │ 24   │ │ 5 függőb.│  ← Statisztika        │
│  │összes│ │érkező│ │kimenő│ │          │                         │
│  └──────┘ └──────┘ └──────┘ └──────────┘                        │
├──────────────────────────────────────────────────────────────────┤
│  [Érkező] [Kimenő] [Mind]   Év: [2026 ▼]  [🔍 _____]          │
│                                             [+ Új] [🖨️ Könyv]  │
├─────────┬───────┬─────────────┬────────┬───────┬──────┬─────────┤
│ Sorszám │ Kelt  │ Tárgy       │ Feladó │ Mappa │Elint.│ Művelet │
│ 2026/42 │ 04-06 │ Presb. jkv. │ Esp.hiv│ É.Á.  │ ✅   │ [✏️][✕]│
│ 2026/41 │ 04-05 │ Kérelem     │ Nagy J.│ F.Á.  │ ⏳   │ [✏️][✕]│
└─────────┴───────┴─────────────┴────────┴───────┴──────┴─────────┘
```

### Responsive

| Breakpoint | Táblázatok | Statisztikák |
|-----------|-----------|-------------|
| `lg` | Teljes oszlopok | Sor-elrendezés |
| `md` | Rejtett: persely, amort%, mappa | 2×2 grid |
| `sm` | Kártya nézet | 1 oszlop |

---

## 3. State kezelés

### Munkanapló — WorklogTabs

```
activeCategory:     'szolgalat' | 'katekezis' | 'latogatas'
selectedMonth:      string          ← 'YYYY-MM' formátum
allWorklogs:        WorklogEntry[]  ← Server Action-nel töltve (hónap + kategória)
loading:            boolean

// Modal
dialogOpen:         boolean
editEntry:          WorklogEntry | null
```

Nincs globális state — a `WorklogTabs` kezeli az összeset. Hónap vagy kategória váltáskor Server Action hívás.

### Leltár — InventoryMain

```
allItems:           InventoryItem[]  ← Server Action-nel töltve
categoryFilter:     string           ← '' = összes, 'alapeszkoz' = szűrt
locationFilter:     string
isFinalized:        boolean          ← bealitas.leltar_finalized
loading:            boolean

// Modal-ok
itemDialogOpen:     boolean
editItem:           InventoryItem | null
auditDialogOpen:    boolean
printDialogOpen:    boolean
```

Származtatott értékek (nem state):
```
filteredItems:      ← allItems szűrve (kategória + helyszín)
stats:              { count, totalValue, topItem } ← filteredItems-ből számolva
```

### Iktatás — FilingMain

```
direction:          'incoming' | 'outgoing' | 'all'
selectedYear:       number
searchQuery:        string
allEntries:         FilingEntry[]    ← Server Action-nel töltve (év + irány)
loading:            boolean

// Modal
dialogOpen:         boolean
editEntry:          FilingEntry | null
```

Származtatott értékek:
```
filteredEntries:    ← allEntries szűrve (keresés)
stats:              { total, incoming, outgoing, pending }
```

---

## 4. API hívások

### Munkanapló

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Betöltés | `getWorklogs(month, category)` | Oldal betöltés + hónap/kategória váltás |
| Mentés | `saveWorklog(data)` | Form submit |
| Törlés | `deleteWorklog(id)` | Törlés gomb + confirm |
| Jelentés | `generateReport(year)` | Jelentés gomb |
| Trigger | `triggerWorklogFromRegistry(...)` | Anyakönyv modulból hívva (Fázis 5) |

### Leltár

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Betöltés | `getInventoryItems()` | Oldal betöltés |
| Statisztika | `getInventoryStats()` | Betöltés + mentés/törlés után |
| Mentés | `saveInventoryItem(data)` | Form submit |
| Törlés | `deleteInventoryItem(id)` | Törlés gomb + confirm |
| Leltári szám | `generateNextLeltariSzam(category)` | Modal megnyitáskor |
| Duplikáció | `checkDuplicate(name, value)` | Mentés előtt |
| Véglegesítés | `finalizeLeltar()` | Gomb |
| Feloldás | `requestLeltarUnlock()` | Gomb (esperes check szerveren) |

### Iktatás

| Művelet | Server Action | Mikor |
|---------|--------------|-------|
| Betöltés | `getFilingEntries(year, direction)` | Oldal betöltés + szűrő váltás |
| Statisztika | `getFilingStats(year)` | Betöltés után |
| Mentés | `saveFilingEntry(data)` | Form submit |
| Törlés | `deleteFilingEntry(id)` | Törlés gomb + confirm |
| Sorszám | `getNextSequenceNumber(year)` | Modal megnyitáskor |
| Igazolás | `generateBaptismCert(memberId)` | Igazolás gomb |

### Adatfolyam

```
SZERVER (page.tsx)                         KLIENS
━━━━━━━━━━━━━━━━━                         ━━━━━━━━━━━━━━━━━━

 congId (+ bealitas) ─────────────────► WorklogTabs / InventoryMain / FilingMain
                                           │
                                      mount / szűrő → getWorklogs() / getInventoryItems() / getFilingEntries()
                                           │
          Supabase ◄── Server Action ◄─────┘
               │
               └── data[] ────────────► state.allWorklogs / allItems / allEntries
                                           │
                                      submit → saveWorklog() / saveInventoryItem() / saveFilingEntry()
                                           │
          Supabase ◄── Server Action ◄─────┘
               │
               └── revalidatePath ──► újratöltés
```

---

## 5. Auth kezelés

### Rétegek

```
1. Middleware → session
2. Layout → getUser() → pending check
3. page.tsx → congregation_id prop
4. Server Actions → getUser() → profil → congregation_id
   └── INSERT: congregation_id profilból
   └── Leltár feloldás: isEsperesRole() check
```

### Jogosultság-ellenőrzés

| Funkció | Szerver-ellenőrzés |
|---------|-------------------|
| Minden CRUD | RLS (congregation_id) |
| Leltár véglegesítés | Mindenki (RLS) |
| Leltár FELOLDÁS | `isEsperesRole()` check |
| Leltár nyomtatás → auto iktatás | Szerver-oldalon (iktato INSERT) |

---

## 6. Validáció elhelyezése

### Zod sémák helye

| Fájl | Sémák |
|------|-------|
| `lib/validations/worklog.ts` | `worklogSchema` |
| `lib/validations/inventory.ts` | `inventoryItemSchema` |
| `lib/validations/filing.ts` | `filingEntrySchema` |

### worklogSchema

```
idopont:              string, kötelező
jellege:              string, kötelező
cim:                  string | null
leiras:               string | null
resztvevok_ferfi:     number ≥ 0 | null
resztvevok_no:        number ≥ 0 | null
resztvevok_gyermek:   number ≥ 0 | null
persely:              number ≥ 0 | null
igehely:              string | null
szolgalatvezeto:      string | null
id_szemely:           number | null
id_csalad:            number | null
megjegyzes:           string | null
id:                   number | undefined (szerkesztés)
```

### inventoryItemSchema

```
megnevezes:           string, kötelező
kategoria:            enum(7 kategória), kötelező
beszerzes_erteke:     number > 0, kötelező
beszerzes_datuma:     string | null
katalogus_kod:        string | null
hasznalati_ido:       number | null
helyszin:             string | null
felelos_id:           number | null
felelos_nev:          string | null
vonalkod:             string | null
megjegyzes:           string | null
id:                   number | undefined
```

### filingEntrySchema

```
direction:            enum('incoming','outgoing'), kötelező
kelt:                 string, kötelező
subject:              string, kötelező
sender_or_recipient:  string | null
file_folder:          enum('F.Á.','É.Á.','A.K.'), kötelező
targykivonat:         string | null
elintezes_ideje:      string | null
elintezes_modja:      string | null
irattarijel:          string | null
megjegyzes:           string | null
id:                   number | undefined
```

### Hol fut a validáció

| Réteg | Mit validál | Hogyan |
|-------|-----------|--------|
| **Kliens — form** | WorklogDialog | State-alapú check (dátum + típus kötelező) → gomb letiltás |
| **Kliens — form** | InventoryDialog | State check (megnevezés + kategória + érték kötelező) |
| **Kliens — form** | FilingDialog | State check (irány + dátum + tárgy + mappa kötelező) |
| **Kliens — confirm** | Törlés | `confirm()` mindenhol |
| **Szerver** | `saveWorklog()` | Zod safeParse |
| **Szerver** | `saveInventoryItem()` | Zod safeParse + duplikáció check |
| **Szerver** | `saveFilingEntry()` | Zod safeParse |
| **Szerver** | `finalizeLeltar()` | `bealitas` flag check |
| **Szerver** | `requestLeltarUnlock()` | `isEsperesRole()` check |
| **DB — RLS** | congregation_id | Supabase policy |

### Üzleti validációk szerveren

| Szabály | Hol | Mi történik |
|---------|-----|-------------|
| Véglegesített leltár: CRUD blokkolva | `saveInventoryItem` | `if (finalized)` → error |
| Feloldás: esperes jogosultság | `requestLeltarUnlock` | `isEsperesRole()` → error ha nem |
| Duplikáció: hasonló tétel | `saveInventoryItem` | return `{ duplicate, existingItem }` → kliens dönt |
| Sorszám egyediség | `saveFilingEntry` | max+1 (concurrent: kis kockázat) |
| Munkanapló trigger: modul betöltve? | `triggerWorklogFromRegistry` | try-catch → silent skip ha hiba |
| Auto iktatás: nyomtatáskor | `finalizeLeltar` → `iktato INSERT` | Ha az iktatás hiba → nyomtatás megtörténik, warning |

---

## Összefoglaló: fájlok és felelősségek

```
ADATRÉTEG (6 fájl)
├── lib/constants/worklog.ts          ← kategóriák, típusok, extra mezők
├── lib/constants/inventory.ts        ← 7 kategória, katalógus kódok, amortizáció
├── lib/constants/filing.ts           ← irányok, mappa-kötegek, sorszám
├── lib/validations/worklog.ts        ← Zod: worklogSchema
├── lib/validations/inventory.ts      ← Zod: inventoryItemSchema
├── lib/validations/filing.ts         ← Zod: filingEntrySchema

SZERVER RÉTEG (6 fájl)
├── app/(dashboard)/munkanaplo/
│   ├── page.tsx                      ← Server: congId
│   └── actions.ts                    ← getWorklogs, saveWorklog, deleteWorklog,
│                                        generateReport, triggerWorklogFromRegistry
├── app/(dashboard)/leltar/
│   ├── page.tsx                      ← Server: congId + bealitas
│   └── actions.ts                    ← getInventoryItems, saveInventoryItem,
│                                        deleteInventoryItem, generateNextLeltariSzam,
│                                        checkDuplicate, finalizeLeltar, requestLeltarUnlock
├── app/(dashboard)/iktato/
│   ├── page.tsx                      ← Server: congId
│   └── actions.ts                    ← getFilingEntries, saveFilingEntry,
│                                        deleteFilingEntry, getNextSequenceNumber,
│                                        getFilingStats, generateBaptismCert

MEGJELENÍTÉSI RÉTEG (6 fájl)
├── components/worklog/
│   ├── worklog-tabs.tsx              ← 3 kategória fül + hónap szűrő + tábla
│   └── worklog-table.tsx             ← Kategóriafüggő oszlopok
├── components/inventory/
│   ├── inventory-main.tsx            ← Szűrők + akciógombok
│   ├── inventory-table.tsx           ← Tételek (érték, amortizáció %)
│   └── inventory-stats.tsx           ← Statisztika panel
├── components/filing/
│   └── filing-main.tsx               ← Irány fülek + év + keresés + statisztika

MODAL RÉTEG (5 fájl)
├── components/modals/
│   ├── worklog-dialog.tsx            ← Munkanapló CRUD (dinamikus form)
│   ├── inventory-dialog.tsx          ← Leltár tétel (katalógus, felelős kereső)
│   ├── inventory-audit-dialog.tsx    ← Duplikáció wizard (összevon/töröl/hagy)
│   ├── inventory-print-dialog.tsx    ← Nyomtató központ (4 PDF formátum)
│   └── filing-dialog.tsx             ← Irat CRUD (auto sorszám, mappa)
```
