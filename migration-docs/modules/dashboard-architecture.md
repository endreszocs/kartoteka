# Dashboard — Architektúra terv

**Stack:** Next.js 16 + Supabase + Tailwind CSS 4 + shadcn/ui
**Kapcsolódó dokumentáció:**
- Elemzés: `modules/dashboard.md`
- Üzleti szabályok: `rules/dashboard-rules.md`
- Felhasználói folyamatok: `workflows/dashboard-flow.md`
- Implementációs terv: `todo/phase-2-dashboard.md`

---

## 1. Komponensek

### Komponens hierarchia

```
app/(dashboard)/dashboard/page.tsx          ← SERVER (orchestrátor)
│
├── <HeroBanner />                          ← SERVER
│     props: fullName, congregationName, todayNamedays[]
│
├── <KpiCards />                            ← SERVER
│     props: activeMemberCount, familyCount, monthlyIncome, weeklyEvents
│
├── <div className="grid lg:grid-cols-2">   ← layout wrapper
│   │
│   ├── <Celebrations />                    ← SERVER
│   │     props: todayBirthdays[], todayNamedayMembers[],
│   │            todayNamedayNames[], upcomingBirthdays[]
│   │
│   └── <ProgramScheduler />               ← CLIENT
│         props: initialYear
│         ├── <ProgramCalendar />           ← belső (nem önálló export)
│         │     props: events[], month, year, today
│         │
│         ├── <ProgramList />              ← belső
│         │     props: events[]
│         │     események: onEdit(id), onToggleDone(id), onDelete(id)
│         │
│         ├── <ProgramDialog />            ← modal, lazy import
│         │     props: open, onOpenChange, editProgram?, defaultDate?
│         │
│         ├── <BatchProgramDialog />       ← modal, lazy import
│         │     props: open, onOpenChange, year
│         │
│         └── <AnnualPlanPrint />          ← belső
│               props: allPrograms, year, congregationName
│
├── <Charts />                              ← CLIENT
│     props: monthlyData[], ageGroups{}
│
├── <RecentActivity />                      ← SERVER
│     props: activities[]
│
└── <BottomStats />                         ← SERVER
      props: men, women, children, avgAge, payersCount, presbCount, balance
```

### Server vs Client döntés indoklása

| Komponens | Típus | Miért |
|-----------|:-----:|-------|
| HeroBanner | Server | Statikus megjelenítés, nincs interakció |
| KpiCards | Server | 4 szám kijelzés, nincs interakció |
| Celebrations | Server | Lista megjelenítés, nincs interakció |
| ProgramScheduler | **Client** | Hónap-navigáció, modális ablakok, CRUD műveletek, saját state |
| Charts | **Client** | Recharts DOM-ot kezel, interaktív tooltip |
| RecentActivity | Server | Statikus lista |
| BottomStats | Server | 7 szám kijelzés |

### shadcn/ui komponensek használata

| shadcn/ui | Hol |
|-----------|-----|
| `Card, CardHeader, CardTitle, CardContent` | KPI kártyák, celebrations, stats, minden szekció |
| `Badge` | Születésnap kor, névnap, friss bejegyzés típus, hónap-fül teljesítettség |
| `Dialog, DialogContent, DialogHeader, DialogTitle` | Program CRUD modal, batch modal |
| `Button` | Hónap navigáció, program CRUD gombok, batch gombok |
| `Input` | Program form mezők, batch táblázat |
| `Label` | Form mezők |
| `Select, SelectTrigger, SelectContent, SelectItem` | Típus, prioritás, ismétlődés, év-választó |
| `Tabs, TabsList, TabsTrigger` | Celebrations szekción belül (születésnapok / névnapok / 14 nap) |
| `Separator` | Szekciók közötti elválasztás |

---

## 2. Oldal struktúra

### Route

```
/dashboard → app/(dashboard)/dashboard/page.tsx
```

Egyetlen Server Component page. Nincs nested routing, nincs további sub-page.

### Page layout — szekciók elrendezése

```
┌────────────────────────────────────────────────────────────┐
│  HERO BANNER                                               │
│  "Jó reggelt, Kovács testvér!" · 2026. Április 5. szombat │
│  📍 Szilágysomlyó · 🌸 Ma: Anna, Béla                     │
├────────────────────────────────────────────────────────────┤
│  KPI KÁRTYÁK                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ 342 tag  │ │ 124 csal │ │ 8.450 RON│ │ 7 esem.  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
├──────────────────────────┬─────────────────────────────────┤
│  SZÜLETÉSNAPOK / NÉVNAPOK│  PROGRAMSZERVEZŐ                │
│  ┌─ Mai születésnaposok  │  ┌ Jan Feb Már Ápr Máj ... ┐   │
│  │  🎂 Kovács J. (45 év)│  │ ◄ Április 2026 ►        │   │
│  ├─ Mai névnaposok       │  │ ┌─────────────────────┐ │   │
│  │  🌸 Nagy Anna        │  │ │   MINI NAPTÁR       │ │   │
│  ├─ Következő 14 nap    │  │ │   H K Sz Cs P Sz V  │ │   │
│  │  📅 6. Péter (holnap)│  │ │   . ● .  .  ●  .  . │ │   │
│  │  📅 9. Mária (4 nap) │  │ └─────────────────────┘ │   │
│  └───────────────────────│  │ ┌─────────────────────┐ │   │
│                          │  │ │   MINI LISTA        │ │   │
│                          │  │ │   5. ⛪ Istentiszt.  │ │   │
│                          │  │ │   12. 📖 Bibliaóra  │ │   │
│                          │  │ └─────────────────────┘ │   │
│                          │  │ [+Új] [Gyors] [Nyomtat] │   │
│                          │  └─────────────────────────┘   │
├──────────────────────────┼─────────────────────────────────┤
│  BEVÉTEL/KIADÁS DIAGRAM  │  KORELOSZLÁS DIAGRAM           │
│  ┌──────────────────┐    │  ┌──────────────────┐          │
│  │ ███ ███          │    │  │    ╭───╮         │          │
│  │ ███ ███ ███      │    │  │   ╱  ◉  ╲        │          │
│  │ ███ ███ ███ ███  │    │  │  │ 0-17  │       │          │
│  │ Jan Feb Már Ápr  │    │  │   ╲     ╱        │          │
│  └──────────────────┘    │  │    ╰───╯         │          │
├──────────────────────────┴─────────────────────────────────┤
│  FRISS BEJEGYZÉSEK                                         │
│  🔵 Istentisztelet · Vasárnapi igehirdetés · Ápr. 5.      │
│  🟣 Konfirmáció · Előkészítő foglalkozás · Ápr. 4.        │
│  ...                                                       │
├────────────────────────────────────────────────────────────┤
│  ALSÓ STATISZTIKÁK                                         │
│  👨 142 férfi │ 👩 156 nő │ 👶 44 gyermek │ 📊 47 év     │
│  💰 89 fizető │ 📋 12 presb │ 💵 +23.400 RON egyenleg    │
└────────────────────────────────────────────────────────────┘
```

### Responsive viselkedés

| Breakpoint | Elrendezés |
|-----------|-----------|
| `lg` (≥1024px) | 2 oszlop: Celebrations ‖ ProgramScheduler, Chart ‖ Chart |
| `md` (≥768px) | 2 oszlop: KPI 2×2, többi szekció egymás alatt |
| `sm` (<768px) | 1 oszlop: minden egymás alatt, KPI 1×4, mini naptár scrollable |

### CSS osztályok (Tailwind)

```
page wrapper:        space-y-6
KPI grid:            grid grid-cols-2 lg:grid-cols-4 gap-4
2-oszlopos szekció:  grid lg:grid-cols-2 gap-6
stat sáv:            grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4
```

---

## 3. State kezelés

### Server Component-ek → NINCS state

A HeroBanner, KpiCards, Celebrations, RecentActivity, BottomStats mind **Server Component**. Az adatokat a `page.tsx` kiszámítja és props-ként adja át. Nincs React state, nincs useEffect, nincs kliens-oldali fetch.

### Client Component-ek → lokális state

#### ProgramScheduler state

```
currentYear:        number          ← év-választó (alapértelmezés: aktuális év)
currentMonth:       number          ← hónap-fül / nyíl navigáció (0-11)
allPrograms:        Program[]       ← az adott év összes programja (fetch eredménye)
loading:            boolean         ← év-váltásnál betöltés jelző
programDialogOpen:  boolean         ← CRUD modal nyitva/zárva
batchDialogOpen:    boolean         ← batch modal nyitva/zárva
editingProgram:     Program | null  ← szerkesztés alatt álló program (null = új)
defaultDate:        string | null   ← naptár-nap kattintáskor előtöltendő dátum
```

**Adatbetöltés:** A `ProgramScheduler` mount-kor és év-váltáskor meghívja a `getProgramsForYear(year)` Server Action-t. A hónap-váltás NEM indít új fetch-et (az egész év a memóriában van).

**Származtatott értékek (nem state — számított):**

```
monthPrograms    = allPrograms.filter(p => month(p.datum) === currentMonth)
programsByMonth  = groupBy(allPrograms, p => month(p.datum))  ← 12 hónap hónap-fül badge-hez
```

#### Charts state

```
NINCS saját state
```

A Charts komponens props-ként kapja a kiszámolt havi adatokat és a korcsoportokat a Server page-ből. A Recharts magát kezeli (tooltip, hover).

#### ProgramDialog state (modal)

```
form state:   react-hook-form + zodResolver
  cim:                  string
  datum:                string
  datum_vege:           string | undefined
  ido_kezdes:           string | undefined
  ido_befejezes:        string | undefined
  helyszin:             string | undefined
  tipus:                ProgramTipus enum
  prioritas:            ProgramPrioritas enum
  ismetlodes_tipus:     string | undefined
  egyedi_tipus_nev:     string | undefined
  egyedi_emoji:         string | undefined
  megjegyzes:           string | undefined
loading:              boolean
serverError:          string | null
emojiPickerOpen:      boolean
```

#### BatchProgramDialog state (modal)

```
rows:           BatchRow[]    ← dinamikus tömb (induláskor 10 elem)
loading:        boolean
serverError:    string | null
```

### Nincs globális state

Nem kell Zustand, Redux, Context. Indoklás:
- A Server Component-ek nem használnak state-et
- A ProgramScheduler önmagában kezeli az adatait (fetch + lokális state)
- A Charts props-ból dolgozik
- A modal-ok a szülő ProgramScheduler-ből kapják a `open` / `onOpenChange` props-ot
- A `revalidatePath('/dashboard')` frissíti a Server Component-eket mentés/törlés után

---

## 4. API hívások

### Server Component lekérdezések (page.tsx)

10 párhuzamos Supabase lekérdezés egyetlen `Promise.all()`-ban. Ezek a szerver-oldali Supabase klienst használják — a böngészőbe soha nem kerülnek.

| # | Tábla | Szűrő | Eredmény típus |
|---|-------|-------|----------------|
| 1 | `szemely` | `meghalt = false` | `{ id, csaladnev, k_nev, namepattern, sz_datum, ferfi }[]` |
| 2 | `elkoltozott` | — | `{ id_szemely }[]` |
| 3 | `csalad` | — | `count: number` |
| 4 | `befizetes` | `datum >= 14 hónappal ezelőtt` | `{ osszeg, datum }[]` |
| 5 | `kiadas` | `datum >= 14 hónappal ezelőtt` | `{ osszeg, datum }[]` |
| 6 | `befizetes` | `fizetettev = aktuális év` | `count: number` |
| 7 | `presbiter` | — | `count: number` |
| 8 | `nevnap` | — | `{ nev1, nev2, nev3, honap, nap }[]` |
| 9 | `munkanaplo` | hétfő–vasárnap közötti | `count: number` |
| 10 | `munkanaplo` | `order by created_at desc limit 10` | `{ idopont, jellege, cim, created_at }[]` |

### Server Action hívások (programs/actions.ts)

| Művelet | Server Action | Ki hívja | Mikor | Utána |
|---------|--------------|---------|-------|-------|
| Programok betöltése | `getProgramsForYear(year)` | ProgramScheduler | mount + év-váltás | state frissítés |
| Program mentés | `saveProgram(data)` | ProgramDialog | form submit | `revalidatePath` + dialog close + refetch |
| Program törlés | `deleteProgram(id)` | ProgramList | törlés gomb + confirm | `revalidatePath` + refetch |
| Teljesítve jelölés | `toggleProgramDone(id, done)` | ProgramList | pipa gomb | `revalidatePath` + refetch |
| Tömeges mentés | `saveBatchPrograms(records)` | BatchProgramDialog | form submit | `revalidatePath` + dialog close + refetch |

### Adatfolyam diagram

```
SZERVER (page.tsx)                         KLIENS
━━━━━━━━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━━━━━━
                                           
 Supabase ──10× query──► shared adat       
     │                                     
     ├── fullName, congName ──────────────► HeroBanner (render)
     ├── counts ──────────────────────────► KpiCards (render)
     ├── birthdays, namedays ─────────────► Celebrations (render)
     ├── monthlyData, ageGroups ──────────► Charts (render + recharts)
     ├── activities ──────────────────────► RecentActivity (render)
     ├── stats ───────────────────────────► BottomStats (render)
     │                                     
     │                                     ProgramScheduler
     │                                       │
     │                                       ├── mount ──► getProgramsForYear()
     │                                       │               │
     │        Supabase ◄── Server Action ◄───┘               │
     │             │                                          ▼
     │             └── programok[] ───────────────► state.allPrograms
     │                                               │
     │                                               ├──► ProgramCalendar
     │                                               ├──► ProgramList
     │                                               │
     │                                               ├──► ProgramDialog
     │                                               │      submit ──► saveProgram()
     │                                               │                   │
     │         Supabase ◄── Server Action ◄──────────────────────────────┘
     │              │                                        │
     │              └── revalidatePath ──► page.tsx újra renderel
     │                   + refetch ──────► ProgramScheduler újratölt
```

---

## 5. Auth kezelés

### Rétegek

```
1. réteg: Middleware (lib/supabase/middleware.ts)
   └── Session ellenőrzés, token frissítés
   └── Nem autentikált user → /login redirect

2. réteg: Dashboard layout (app/(dashboard)/layout.tsx)
   └── getUser() — ha nincs user → /login
   └── Profil lekérdezés — ha pending → signOut + /login
   └── Szerepkör számítás → Sidebar + DashboardShell

3. réteg: Dashboard page (app/(dashboard)/dashboard/page.tsx)
   └── NEM kell auth ellenőrzés — a layout már megtette
   └── A Supabase kliens automatikusan a bejelentkezett user nevében fut
   └── Az RLS garantálja a gyülekezet-szeparációt

4. réteg: Server Actions (app/(dashboard)/programs/actions.ts)
   └── Minden action-ben: getUser() ellenőrzés
   └── Profil lekérdezés → congregation_id
   └── INSERT-nél a congregation_id a profilból jön (NEM a klienstől)
```

### Ki mit tehet

| Művelet | Lelkész (saját gyül.) | Esperes | Admin | Master Admin |
|---------|:--------------------:|:-------:|:-----:|:------------:|
| Dashboard megtekintés | ✅ | ✅ | ✅ | ✅ |
| Program létrehozás | ✅ | ✅ | ✅ | ✅ |
| Program szerkesztés | ✅ (sajátjait) | ✅ | ✅ | ✅ |
| Program törlés | ✅ (sajátjait) | ✅ | ✅ | ✅ |
| Batch bevitel | ✅ | ✅ | ✅ | ✅ |
| Nyomtatás | ✅ | ✅ | ✅ | ✅ |

A jogosultság-ellenőrzést az RLS végzi. Az alkalmazás szintjén NINCS role-alapú szűrés a dashboard-on — mindenki ugyanazt a felületet látja, a saját gyülekezetének adataival. A különbség a sidebar-ban van (más dashboardok elérhetősége), amit a layout kezel.

---

## 6. Validáció elhelyezése

### Kettős validáció — kliens + szerver

Minden bemenetet KÉT HELYEN validálunk: a kliens-oldalon (azonnali visszajelzés) ÉS a szerver-oldalon (biztonság).

### Validációs séma helye

**Fájl:** `lib/validations/dashboard.ts`

Egy Zod séma, amit MINDKÉT oldal importál:

```
programSchema:
  cim:              string, min(1), "A program neve kötelező"
  datum:            string, regex(YYYY-MM-DD), "Érvénytelen dátum"
  datum_vege:       string | undefined, ha van → refine: datum_vege >= datum
  ido_kezdes:       string | undefined, regex(HH:MM)
  ido_befejezes:    string | undefined, regex(HH:MM)
  helyszin:         string | undefined
  tipus:            enum(16 típus), "Érvénytelen típus"
  prioritas:        enum(4 szint), "Érvénytelen prioritás"
  ismetlodes_tipus: enum(heti, ketheti, havi) | undefined
  egyedi_tipus_nev: string | undefined
  egyedi_emoji:     string | undefined
  megjegyzes:       string | undefined
  id:               uuid | undefined (szerkesztésnél)
```

```
batchRowSchema:
  = programSchema id nélkül

batchSchema:
  records:          batchRowSchema[]
                    .refine: legalább 1 érvényes sor
                    .refine: üres sorok (cím + dátum üres) → automatikus kiszűrés
```

### Hol fut a validáció

| Réteg | Mit validál | Hogyan | Hibajelzés |
|-------|-----------|--------|-----------|
| **Kliens — form** | Egyedi program form | `react-hook-form` + `zodResolver(programSchema)` | Mező alatti piros hibaüzenet |
| **Kliens — batch** | Batch táblázat soronként | Manuális `batchSchema.safeParse()` submit előtt | `toast.error()` a hibás sorok listájával |
| **Szerver — action** | `saveProgram()` | `programSchema.safeParse(data)` | `{ error: string }` return |
| **Szerver — action** | `saveBatchPrograms()` | `batchSchema.safeParse(records)` | `{ error: string }` return |
| **Szerver — action** | `deleteProgram()` | UUID formátum ellenőrzés | `{ error: string }` return |
| **Adatbázis — RLS** | congregation_id egyezés | Supabase policy | Supabase error (a kliens soha nem látja idegen adatot) |

### Üzleti validációk a szerveren

| Szabály | Hol ellenőrizzük | Mi történik ha megsérül |
|---------|-----------------|----------------------|
| Záró dátum ≥ kezdő dátum | Zod `.refine()` | Kliens: mező hiba. Szerver: `{ error }` |
| Egyedi típusnév/emoji csak "egyéb" típusnál | Zod `.refine()` | Automatikus null-ra állítás ha nem "egyéb" |
| congregation_id a profilból jön | Server Action logika | Kliens NEM küldheti — a szerver a profil-ból olvassa |
| Batch: üres sor = skip, félkész = hiba | Zod `.refine()` | Félkész soroknál: hibalista, mentés blokkolva |
| Batch: ha bármelyik hibás → SEMMI nem mentődik | Server Action logika | Teljes tranzakció visszagörgetés |
| Auth ellenőrzés minden action-ben | `getUser()` | `{ error: "Nincs bejelentkezett felhasználó." }` |

### Validáció NEM szükséges

| Adat | Miért nem | Ki felel érte |
|------|----------|--------------|
| KPI számok helyessége | Csak olvasás, nincs user input | Supabase lekérdezés + RLS |
| Születésnap/névnap adatok | Csak olvasás | szemely + nevnap tábla |
| Diagram adatok | Csak olvasás | befizetes + kiadas tábla |
| Felhasználó jogosultsága a dashboard-hoz | Layout már ellenőrzi | `(dashboard)/layout.tsx` |

---

## Összefoglaló: fájlok és felelősségek

```
ADATRÉTEG
├── lib/constants/dashboard.ts       ← típusok, emojik, színek, hónapok
├── lib/utils/date.ts                ← greeting(), formatHuDate(), ageFromDate(), weekBounds()
├── lib/validations/dashboard.ts     ← Zod sémák (programSchema, batchSchema)
│
SZERVER RÉTEG
├── app/(dashboard)/dashboard/page.tsx    ← 10 query → shared adat → props szétszórás
├── app/(dashboard)/programs/actions.ts   ← 5 Server Action (CRUD + batch)
│
MEGJELENÍTÉSI RÉTEG (Server)
├── components/dashboard/hero-banner.tsx       ← üdvözlés, dátum, gyülekezet, névnapok
├── components/dashboard/kpi-cards.tsx         ← 4 kártya
├── components/dashboard/celebrations.tsx      ← születésnapok, névnapok, 14 nap
├── components/dashboard/recent-activity.tsx   ← 10 friss bejegyzés
├── components/dashboard/bottom-stats.tsx      ← 7 statisztika
│
INTERAKCIÓS RÉTEG (Client)
├── components/dashboard/charts.tsx            ← recharts: oszlop + fánk
├── components/dashboard/program-scheduler.tsx ← orchestrátor: év, hónap, state, fetch
├── components/dashboard/program-calendar.tsx  ← mini naptár rács
├── components/dashboard/program-list.tsx      ← havi lista
├── components/dashboard/annual-plan-print.tsx ← A3 nyomtatás + PDF
│
MODAL RÉTEG (Client)
├── components/modals/program-dialog.tsx       ← CRUD form + emoji picker
└── components/modals/batch-program-dialog.tsx ← táblázatos tömeges bevitel
```
