# Fázis 2 — Dashboard: Részletes implementációs terv

**Előfeltétel:** Fázis 1 (Core Auth + Layout) — LEZÁRVA
**Forrás elemzés:** `migration-docs/modules/dashboard.md`
**Üzleti szabályok:** `migration-docs/rules/dashboard-rules.md`
**Felhasználói folyamatok:** `migration-docs/workflows/dashboard-flow.md`

---

## 1. Backend (Supabase)

### Használt táblák — NEM kell létrehozni, már léteznek

| Tábla | Dashboard-ban használt oszlopok | Művelet |
|-------|-------------------------------|---------|
| `szemely` | id, csaladnev, k_nev, namepattern, sz_datum, ferfi, meghalt | SELECT (meghalt=false) |
| `elkoltozott` | id_szemely | SELECT (kizáráshoz) |
| `csalad` | — | COUNT |
| `befizetes` | osszeg, datum, fizetettev | SELECT (utolsó ~14 hónap) + COUNT (idei fizetők) |
| `kiadas` | osszeg, datum | SELECT (utolsó ~14 hónap) |
| `presbiter` | — | COUNT |
| `nevnap` | nev1, nev2, nev3, honap, nap | SELECT (teljes tábla, 365 sor) |
| `munkanaplo` | idopont, jellege, cim, created_at | COUNT (heti) + SELECT (utolsó 10) |
| `gyulekezeti_programok` | ÖSSZES oszlop | TELJES CRUD |
| `profiles` | full_name, congregation_id | SELECT (program létrehozóhoz) |

### RLS (Row Level Security) — már meglévő policy-k

- `szemely`, `elkoltozott`, `csalad`, `befizetes`, `kiadas`, `presbiter`, `munkanaplo` → mind `congregation_id` alapú RLS-el védve. A bejelentkezett user csak a saját gyülekezete adatait éri el.
- `gyulekezeti_programok` → `congregation_id` alapú RLS. Insert-nél a `congregation_id`-t a szervernek kell beállítania a profilból.
- `nevnap` → publikus olvasás (nincs gyülekezet-szűrő, mindenki számára ugyanaz).

### Auth követelmény

- Minden dashboard lekérdezés a bejelentkezett user Supabase kliensén keresztül fut → az RLS automatikusan szűr.
- Server Component-ben: `createClient()` (server) → `getUser()` → lekérdezések.
- A programok CRUD műveletei Server Action-ökben futnak → szintén szerver-oldali kliens.

### Role kezelés a dashboard-on

| Szerepkör | Mi történik a `/dashboard` route-on |
|-----------|-------------------------------------|
| Lelkész (van gyülekezete) | Gyülekezeti dashboard betöltődik |
| Esperes/admin (van gyülekezete) | Gyülekezeti dashboard + sidebar-ban egyéb dashboardok |
| Bárki (NINCS gyülekezete) | A `login/actions.ts` már átirányítja a megfelelő helyre — a `/dashboard` page-et nem éri el |
| Pending felhasználó | A `(dashboard)/layout.tsx` signOut + redirect → nem éri el |

---

## 2. Frontend (Next.js)

### Oldalak

| Route | Fájl | Típus | Tartalom |
|-------|------|-------|----------|
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | **Server Component** | 10 párhuzamos lekérdezés → shared adat → szekciók props-ként |

Egyetlen page — minden szekció komponensként van beágyazva. Nincs külön route a diagramoknak, programszervezőnek, stb.

### Komponensek — teljes lista

#### Server Components (nincs interakció, csak megjelenítés)

| Fájl | Props | Mit csinál |
|------|-------|-----------|
| `components/dashboard/hero-banner.tsx` | `fullName, congregationName, todayNamedays` | Üdvözlés + dátum + gyülekezet + mai névnapok |
| `components/dashboard/kpi-cards.tsx` | `activeMemberCount, familyCount, monthlyIncome, weeklyEvents` | 4 KPI kártya, szám formázás |
| `components/dashboard/celebrations.tsx` | `todayBirthdays, todayNamedayMembers, todayNamedayNames, upcomingBirthdays` | Születésnapok + névnapok + 14 napos előrejelzés |
| `components/dashboard/recent-activity.tsx` | `activities` | 10 friss munkanapló bejegyzés, színkódolt badge |
| `components/dashboard/bottom-stats.tsx` | `men, women, children, avgAge, payersCount, presbCount, balance` | 7 statisztikai érték |

#### Client Components (interakció szükséges)

| Fájl | Props / State | Mit csinál |
|------|--------------|-----------|
| `components/dashboard/charts.tsx` | `monthlyIncomeData, monthlyExpenseData, ageGroups` | 2 diagram (recharts): oszlop + fánk |
| `components/dashboard/program-scheduler.tsx` | — (saját fetch) | Teljes programszervező orchestrátor |
| `components/dashboard/program-calendar.tsx` | `events, month, year, today` | Mini naptár 7×N rács |
| `components/dashboard/program-list.tsx` | `events, month` | Havi program lista |
| `components/dashboard/annual-plan-print.tsx` | `allPrograms, year, congregationName` | Nyomtatási nézet generálás |

#### Modal Components (Client)

| Fájl | Mikor nyílik | Mit csinál |
|------|-------------|-----------|
| `components/modals/program-dialog.tsx` | „Új program" gomb VAGY naptár-nap kattintás VAGY lista-elem kattintás | Program létrehozás / szerkesztés form |
| `components/modals/batch-program-dialog.tsx` | „Gyors bevitel" gomb | Táblázatos tömeges bevitel |

#### Server Actions

| Fájl | Függvények |
|------|-----------|
| `app/(dashboard)/programs/actions.ts` | `getProgramsForYear(year)`, `saveProgram(data)`, `saveBatchPrograms(records)`, `deleteProgram(id)`, `toggleProgramDone(id, done)` |

#### Utility fájlok

| Fájl | Tartalom |
|------|----------|
| `lib/constants/dashboard.ts` | HU_MONTHS, HU_DAYS, PROG_TIPUS_*, EMOJI_LIST, típus/prioritás konfigurációk |
| `lib/utils/date.ts` | `greeting()`, `formatHuDate()`, `ageFromDate()`, `weekBounds()` |

---

## 3. Funkciók

### 3.1 — Dashboard adatlekérdezés (page.tsx)

**10 párhuzamos Supabase hívás `Promise.all()`-ban:**

| # | Mit kérdez | Tábla | Szűrő | Eredmény |
|---|-----------|-------|-------|---------|
| 1 | Összes élő tag | `szemely` | `meghalt = false` | Tömb: id, csaladnev, k_nev, namepattern, sz_datum, ferfi |
| 2 | Elköltözöttek | `elkoltozott` | — | Tömb: id_szemely |
| 3 | Családok száma | `csalad` | — | Count (exact, head) |
| 4 | Bevételek | `befizetes` | `datum >= 14 hónappal ezelőtt` | Tömb: osszeg, datum |
| 5 | Kiadások | `kiadas` | `datum >= 14 hónappal ezelőtt` | Tömb: osszeg, datum |
| 6 | Fizetők idén | `befizetes` | `fizetettev = aktuális év` | Count (exact, head) |
| 7 | Presbiterek | `presbiter` | — | Count (exact, head) |
| 8 | Névnap tábla | `nevnap` | — | Tömb: nev1, nev2, nev3, honap, nap (365 sor) |
| 9 | Heti munkanapló | `munkanaplo` | `idopont >= hétfő ÉS <= vasárnap` | Count (exact, head) |
| 10 | Friss bejegyzések | `munkanaplo` | `order by created_at desc limit 10` | Tömb: idopont, jellege, cim, created_at |

**Shared adatobjektum felépítése (szerver-oldalon):**

```
activeMembers    = szemely − elkoltozott ids
monthlyIncome    = befizetes szűrve aktuális hónapra → sum(osszeg)
todayBirthdays   = activeMembers ahol sz_datum hónap-nap = ma
todayNamedays    = nevnap ahol honap+nap = ma → egyeztetés activeMembers k_nev
upcomingBirthdays = activeMembers ahol születésnap 1-14 napon belül
ageGroups        = activeMembers csoportosítva 5 korcsoportba
monthlyChartData = befizetes + kiadas havi bontásban (8 hónap)
men/women/children = activeMembers nemek + kor szerint
avgAge           = átlagéletkor
balance          = sum(befizetes.osszeg) − sum(kiadas.osszeg)
```

Minden szekció-komponens a kiszámolt adatot kapja props-ként — a komponensek NEM végeznek adatbázis-lekérdezést.

### 3.2 — Program CRUD

#### `saveProgram(data)` Server Action

**Input validáció (Zod):**

| Mező | Szabály |
|------|---------|
| cim | string, min 1, kötelező |
| datum | string, YYYY-MM-DD formátum, kötelező |
| datum_vege | string, opcionális, ha van → ≥ datum |
| ido_kezdes | string, opcionális, HH:MM |
| ido_befejezes | string, opcionális, HH:MM |
| helyszin | string, opcionális |
| tipus | enum (16 érték), kötelező |
| prioritas | enum (alacsony, normal, fontos, kiemelt), kötelező |
| ismetlodes_tipus | enum (heti, ketheti, havi) vagy null |
| egyedi_tipus_nev | string, opcionális (csak ha tipus = egyeb) |
| egyedi_emoji | string, opcionális (csak ha tipus = egyeb) |
| megjegyzes | string, opcionális |
| id | uuid, opcionális (ha van → UPDATE, ha nincs → INSERT) |

**Szerver-oldali logika:**
1. Zod validáció
2. `getUser()` — auth ellenőrzés
3. Profil lekérdezés (full_name, congregation_id)
4. Ha `id` van → UPDATE (meglévő rekord módosítása)
5. Ha `id` nincs → INSERT (új rekord, hozzáfűz: letrehozta_id, letrehozta_nev, congregation_id)
6. `revalidatePath('/dashboard')`
7. Visszatérés: `{ success }` vagy `{ error }`

#### `saveBatchPrograms(records)` Server Action

**Input:** Tömb a fenti sémából (id nélkül, mind INSERT).

**Szerver-oldali logika:**
1. Zod validáció minden sorra
2. Üres sorok kiszűrése (cím ÉS dátum is üres → skip)
3. Ha bármelyik sor hibás → ÖSSZES hiba visszaadása, NEM ment semmit
4. `getUser()` → profil lekérdezés
5. Minden rekordhoz: letrehozta_id, letrehozta_nev, congregation_id
6. Egyetlen tömeges INSERT
7. `revalidatePath('/dashboard')`

#### `deleteProgram(id)` Server Action

1. UUID validáció
2. `getUser()` → auth ellenőrzés
3. DELETE from gyulekezeti_programok where id = id
4. `revalidatePath('/dashboard')`

#### `toggleProgramDone(id, done)` Server Action

1. UUID + boolean validáció
2. UPDATE: teljesitett = done, teljesites_datum = done ? now : null
3. `revalidatePath('/dashboard')`

#### `getProgramsForYear(year)` Server Action

1. Év validáció (szám, ésszerű tartomány)
2. SELECT * from gyulekezeti_programok where datum between '{year}-01-01' and '{year}-12-31' order by datum, ido_kezdes
3. Visszatérés: programok tömbje

---

## 4. Prioritás — lépések sorrendje

### SPRINT 1: Alap oldal + statikus szekciók (leggyorsabb eredmény)

| Lépés | Mit | Fájl | Miért először |
|-------|-----|------|--------------|
| **1.1** | Konstansok + segédfüggvények | `lib/constants/dashboard.ts`, `lib/utils/date.ts` | Minden más függ tőle |
| **1.2** | Dashboard page (adatlekérdezés) | `app/(dashboard)/dashboard/page.tsx` | A fő orchestrátor |
| **1.3** | Hero Banner | `components/dashboard/hero-banner.tsx` | Egyszerű, azonnali vizuális eredmény |
| **1.4** | KPI kártyák | `components/dashboard/kpi-cards.tsx` | Egyszerű, nagy hatás |
| **1.5** | Alsó statisztikák | `components/dashboard/bottom-stats.tsx` | Egyszerű, a shared adatból számol |
| **1.6** | Friss bejegyzések | `components/dashboard/recent-activity.tsx` | Egyszerű lista |

**Sprint 1 eredmény:** A lelkész belépéskor lát egy működő dashboardot: üdvözlés, 4 KPI szám, statisztikák, friss bejegyzések. ~0.5 nap.

### SPRINT 2: Születésnapok + Diagramok

| Lépés | Mit | Fájl | Miért másodszor |
|-------|-----|------|----------------|
| **2.1** | Születésnap / névnap szekció | `components/dashboard/celebrations.tsx` | Közepes komplexitás (3 alszekció) |
| **2.2** | `recharts` telepítés | `package.json` | Chart könyvtár |
| **2.3** | Pénzügyi diagramok | `components/dashboard/charts.tsx` | Client Component, chart renderelés |

**Sprint 2 eredmény:** Születésnapok/névnapok + interaktív diagramok. ~0.5 nap.

### SPRINT 3: Programszervező (legkomplexebb)

| Lépés | Mit | Fájl | Miért harmadszor |
|-------|-----|------|-----------------|
| **3.1** | Program Server Actions | `app/(dashboard)/programs/actions.ts` | Backend logika (CRUD + batch + Zod validáció) |
| **3.2** | Programszervező orchestrátor | `components/dashboard/program-scheduler.tsx` | Fő Client Component: év-választó, hónap-navigáció, állapotkezelés |
| **3.3** | Mini naptár | `components/dashboard/program-calendar.tsx` | 7×N rács, színkódolt pontok, kattintás |
| **3.4** | Mini lista | `components/dashboard/program-list.tsx` | Havi program lista, teljesítve/törlés gombok |
| **3.5** | Program CRUD modal | `components/modals/program-dialog.tsx` | Létrehozás/szerkesztés form, emoji picker |
| **3.6** | Batch bevitel modal | `components/modals/batch-program-dialog.tsx` | Táblázatos tömeges rögzítés |

**Sprint 3 eredmény:** Teljes programszervező CRUD + batch. ~1 nap.

### SPRINT 4: Nyomtatás + csiszolás

| Lépés | Mit | Fájl | Miért negyedszer |
|-------|-----|------|-----------------|
| **4.1** | Éves terv nyomtatás | `components/dashboard/annual-plan-print.tsx` | A3 fekvő naptár generálás + PDF |
| **4.2** | Responsive finomhangolás | Minden komponens | Mobil nézet, kisebb képernyők |
| **4.3** | Üres állapotok | Minden komponens | „Nincs adat" üzenetek, fallback-ek |
| **4.4** | Végső tesztelés | — | Minden szekció, edge case-ek |

**Sprint 4 eredmény:** Nyomtatás + polished UI. ~0.5 nap.

### Összesített ütemezés

```
Sprint 1 ■■■■░░░░░░  (0.5 nap)  Alap oldal + statikus szekciók
Sprint 2 ░░░░■■■░░░  (0.5 nap)  Születésnapok + Diagramok
Sprint 3 ░░░░░░░■■■  (1 nap)    Programszervező (CRUD + batch)
Sprint 4 ░░░░░░░░░■  (0.5 nap)  Nyomtatás + csiszolás
                                  ─────────────────────────
                                  Összesen: ~2.5 nap
```

---

## 5. Függőségek

### Telepítendő npm csomagok

| Csomag | Verzió | Mire kell |
|--------|--------|-----------|
| `recharts` | latest | Oszlop- és fánkdiagram |

Más új csomag nem szükséges — a shadcn/ui, Zod, react-hook-form, sonner már telepítve van.

### Fájl-függőségi fa

```
lib/constants/dashboard.ts          ← NINCS FÜGGŐSÉGE (első létrehozandó)
lib/utils/date.ts                   ← NINCS FÜGGŐSÉGE (első létrehozandó)
    │
    ▼
app/(dashboard)/dashboard/page.tsx  ← függ: supabase/server, date.ts, dashboard.ts
    │
    ├─► components/dashboard/hero-banner.tsx        ← függ: date.ts
    ├─► components/dashboard/kpi-cards.tsx           ← NINCS saját függősége
    ├─► components/dashboard/celebrations.tsx        ← függ: date.ts, dashboard.ts
    ├─► components/dashboard/charts.tsx              ← függ: recharts, dashboard.ts
    ├─► components/dashboard/recent-activity.tsx     ← függ: date.ts
    ├─► components/dashboard/bottom-stats.tsx        ← NINCS saját függősége
    │
    └─► components/dashboard/program-scheduler.tsx   ← függ: dashboard.ts, programs/actions.ts
            │
            ├─► components/dashboard/program-calendar.tsx    ← függ: dashboard.ts
            ├─► components/dashboard/program-list.tsx        ← függ: dashboard.ts
            ├─► components/modals/program-dialog.tsx         ← függ: dashboard.ts, programs/actions.ts, Zod
            ├─► components/modals/batch-program-dialog.tsx   ← függ: dashboard.ts, programs/actions.ts, Zod
            └─► components/dashboard/annual-plan-print.tsx   ← függ: dashboard.ts
```

### Modul-függőségek (más fázisokra)

| Fázis 2 funkció | Függ-e más fázistól? | Megjegyzés |
|-----------------|---------------------|-----------|
| KPI kártyák | NEM | A táblák már léteznek, RLS védett |
| Születésnapok | NEM | szemely + nevnap tábla olvasás |
| Diagramok | NEM | befizetes + kiadas olvasás |
| Programszervező | NEM | gyulekezeti_programok tábla önálló CRUD |
| Friss bejegyzések | NEM | munkanaplo olvasás |
| Statisztikák | NEM | Összetett számítás de csak olvasás |

A Fázis 2 **teljesen független** más fázisoktól — csak olvasó lekérdezéseket végez a meglévő táblákon (a programszervező kivételével, ami saját táblát használ).

### Meglévő Fázis 1 elemekre való támaszkodás

| Fázis 1 elem | Hogyan használja a Dashboard |
|--------------|------------------------------|
| `(dashboard)/layout.tsx` | Auth ellenőrzés, profil betöltés, sidebar, header — a page.tsx-nek nem kell ezzel foglalkozni |
| `lib/supabase/server.ts` | `createClient()` a Server Component lekérdezésekhez |
| `lib/auth/roles.ts` | A routing már a login/callback-ben megtörtént — a dashboard page-nek nem kell role-t ellenőriznie |
| `lib/types/auth.ts` | Profile típus (congregation_id kelhet) |

---

## Mappastruktúra (végleges)

```
app/(dashboard)/
├── dashboard/
│   └── page.tsx                     ← Server page: 10 query, shared adat, szekciók
├── programs/
│   └── actions.ts                   ← Server Actions: CRUD + batch + Zod

components/dashboard/
├── hero-banner.tsx                  ← Server: üdvözlés, dátum, gyülekezet
├── kpi-cards.tsx                    ← Server: 4 KPI kártya
├── celebrations.tsx                 ← Server: születésnapok, névnapok, 14 nap
├── charts.tsx                       ← Client: oszlop + fánk diagram (recharts)
├── program-scheduler.tsx            ← Client: orchestrátor (év, hónap, state)
├── program-calendar.tsx             ← Client: mini naptár rács
├── program-list.tsx                 ← Client: havi program lista
├── recent-activity.tsx              ← Server: 10 friss bejegyzés
├── bottom-stats.tsx                 ← Server: 7 statisztika
└── annual-plan-print.tsx            ← Client: A3 nyomtatás + PDF

components/modals/
├── program-dialog.tsx               ← Client: program CRUD form + emoji picker
└── batch-program-dialog.tsx         ← Client: táblázatos tömeges bevitel

lib/constants/
└── dashboard.ts                     ← HU_MONTHS, típusok, emojik, színek

lib/utils/
└── date.ts                          ← greeting(), formatHuDate(), ageFromDate(), weekBounds()
```

**Összesen: 16 új fájl**
- 1 Server Page
- 1 Server Action fájl
- 5 Server Component
- 6 Client Component
- 2 Modal Component
- 1 Konstans fájl
- 1 Utility fájl

---

## Elfogadási kritériumok

| # | Kritérium | Hogyan ellenőrizhető |
|---|-----------|---------------------|
| 1 | Bejelentkezés → KPI adatok megjelennek | Aktív tagok, családok, havi bevétel, heti események mutatnak számot |
| 2 | Születésnap/névnap helyes | Ha ma van születésnapos/névnapos → megjelenik névvel és korral |
| 3 | 14 napos előrejelzés | Közelgő születésnapok listája, piros/narancs badge |
| 4 | Diagramok renderelődnek | Oszlopdiagram (8 hónap) + fánkdiagram (5 korcsoport) |
| 5 | Program CRUD működik | Létrehozás, szerkesztés, törlés, teljesítve jelölés |
| 6 | Mini naptár interaktív | Színkódolt pontok, kattintás → modal |
| 7 | Batch bevitel működik | 10 sor, Enter navigáció, validáció, tömeges mentés |
| 8 | Éves terv nyomtatás | A3 fekvő naptár, PDF mentés, jelmagyarázat |
| 9 | Alsó statisztikák helyesek | Férfi/nő/gyermek/átlagéletkor/fizetők/presbiterek/egyenleg |
| 10 | Üres gyülekezet kezelés | Számok helyett „—", diagramok üresek, „nincs adat" üzenetek |
| 11 | Mobil nézet | Responsive: 4 kártya → 2 → 1, naptár görgethető |
| 12 | Betöltési idő | <1 mp az első interaktív megjelenésig (Server Components streaming) |
