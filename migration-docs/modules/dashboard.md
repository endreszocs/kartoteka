# Dashboard modul — Elemzés

**Forrás:** `D:\Egyházi APP\project\pages\js\dashboard_api.js` (1437 sor)
**HTML:** `dashboard.html` (1000+ sor), `dashboard_egyhazmegye.html` (444 sor), `dashboard_kerulet.html` (271 sor)

---

## 1. Modul célja

A bejelentkezés utáni **első oldal**, amelyet a lelkész lát. Három szinten működik:

| Szint | Oldal | Ki látja | Tartalom |
|-------|-------|----------|----------|
| Gyülekezeti | `/dashboard` | Lelkész (+ felettes szintek) | KPI, születésnapok, névnapok, programok, diagramok, statisztikák |
| Egyházmegyei | `/dashboard-egyhazmegye` | Esperes, egyházmegyei admin | Gyülekezet-összesítők, kérések, költségvetés |
| Kerületi | `/dashboard-kerulet` | Admin, Master Admin | Teljes kerületi áttekintés |

A gyülekezeti dashboard a legkomplexebb — **7 önálló szekció** + teljes **programszervező** (CRUD + batch + nyomtatás).

---

## 2. Fő funkciók

### 2.1. Hero Banner
- Napszaknak megfelelő üdvözlés (Jó reggelt/napot/estét + lelkész családneve)
- Aktuális dátum magyarul (pl. „2026. Április 5. — szombat")
- Gyülekezet neve
- Mai névnaposok listája

### 2.2. KPI kártyák (4 db)
| Kártya | Adat forrás | Számítás |
|--------|-------------|----------|
| Aktív tagok | `szemely` − `elkoltozott` − `meghalt` | Count |
| Családok | `csalad` | Count (exact) |
| Havi bevétel | `befizetes` (aktuális hónapra szűrve) | Sum(osszeg) |
| Heti események | `munkanaplo` (hétfőtől vasárnapig) | Count (exact) |

### 2.3. Születésnap- és névnap-szekció
- **Mai születésnaposok** — aktív tagok, akiknek ma van a születésnapja (kor kijelzés)
- **Mai névnaposok** — `nevnap` táblából az aktuális nap nevei → egyeztetés az aktív tagok `k_nev` mezőjével
- **Következő 14 nap** — közelgő születésnapok előrejelzés (hátralévő napok, életkor)

### 2.4. Pénzügyi diagramok (2 db)
| Diagram | Típus | Tartalom |
|---------|-------|----------|
| Bevétel vs Kiadás | Oszlopdiagram (bar) | Utolsó 8 hónap, havi bontásban, RON-ban |
| Koreloszlás | Fánkdiagram (donut) | 5 korcsoport: 0–17, 18–35, 36–60, 61–80, 80+ |

Mindkettő **ApexCharts** könyvtárat használ (lazy-loaded).

### 2.5. Gyülekezeti Programszervező (komplex almodul)
- **Mini naptár** — 7×N rács, színkódolt pontokkal jelzi a programokat
- **Mini lista** — adott hónap összes programja időrendben
- **Hónap-fülek** — 12 fül, teljesítettség jelölő badge-ekkel (pl. „3/5")
- **Hónap navigáció** — nyilakkal előre-hátra, év-átlépéssel
- **Naptár-nap kattintás** → új program az adott dátummal
- **Program CRUD** — létrehozás, szerkesztés, törlés, teljesítve jelölés
- **Gyors bevitel (batch)** — táblázatos tömeges rögzítés (10+ sor, auto-expand)
- **Éves terv nyomtatás** — A3 fekvő PDF, 12 hónapos naptár, jelmagyarázattal

### 2.6. Friss bejegyzések
- Legutóbbi 10 munkanapló bejegyzés (idő, típus badge, cím)
- Típus-színkódolt: istentisztelet=kék, temetés=sötét, konfirmáció=lila, stb.

### 2.7. Alsó statisztikai sáv
| Stat | Számítás |
|------|----------|
| Férfiak | aktív tag, ferfi=true, kor≥18 |
| Nők | aktív tag, ferfi=false, kor≥18 |
| Gyermekek | aktív tag, kor<18 |
| Átlagéletkor | sum(kor)/count(kor van) |
| Fizetők idén | `befizetes` count where fizetettev = aktuális év |
| Presbiterek | `presbiter` count |
| Egyenleg | sum(befizetes.osszeg) − sum(kiadas.osszeg) |

---

## 3. Használt adatok

### Adatbázis táblák

| Tábla | Használt oszlopok | Megjegyzés |
|-------|-------------------|-----------|
| `szemely` | id, csaladnev, k_nev, namepattern, sz_datum, ferfi, meghalt | Tagok (meghalt=false szűrő) |
| `elkoltozott` | id_szemely | Elköltözöttek kizárásához |
| `csalad` | — (count only) | Családok száma |
| `befizetes` | osszeg, datum, fizetettev | Bevételek (utolsó ~14 hónap) |
| `kiadas` | osszeg, datum | Kiadások (utolsó ~14 hónap) |
| `presbiter` | — (count only) | Presbiterek száma |
| `nevnap` | nev1, nev2, nev3, honap, nap | Névnap naptár (365 sor, 1 óra cache) |
| `munkanaplo` | idopont, jellege, cim, created_at | Friss bejegyzések (utolsó 10) |
| `gyulekezeti_programok` | ÖSSZES oszlop | Teljes CRUD |
| `profiles` | full_name, congregation_id | Program létrehozó azonosítás |

### Gyülekezeti programok tábla mezői
```
id, cim, datum, datum_vege, ido_kezdes, ido_befejezes,
helyszin, tipus, prioritas, ismétlődő, ismetlodes_tipus,
egyedi_tipus_nev, egyedi_emoji, megjegyzes,
teljesitett, teljesites_datum,
letrehozta_id, letrehozta_nev, congregation_id,
created_at, updated_at
```

### Program típusok (16 db)
```
istentisztelet, bibliaora, imaora, ifjusagi, gyerekprogram,
konferencia, hangverseny, kozossegi, presbiteri, latogatas,
unnep, tabor, evangelizacio, diakoniai, noszovetseg, egyeb
```

Minden típusnak saját emoji, szín és címke van. Az „egyéb" típusnál egyedi emoji és típusnév adható meg.

### Program prioritások (4 db)
```
alacsony, normal, fontos, kiemelt
```

---

## 4. Függvények listája

### Belépési pont
| Függvény | Leírás |
|----------|--------|
| `loadDashboardData()` | Fő orchestrátor — 10 párhuzamos lekérdezés, shared adatobjektum, 6 párhuzamos UI frissítés |

### Hero + KPI
| Függvény | Leírás |
|----------|--------|
| `_fillHeroBanner(today)` | Üdvözlés, dátum, gyülekezet név, mai névnapok |
| `_loadKPICards(today, shared)` | 4 KPI kártya feltöltése |
| `_greeting()` | Napszak-alapú üdvözlés |
| `_formatHuDate(d)` | Dátum formázás magyarul |
| `_ageFromDate(dateStr)` | Kor kiszámítása |
| `_weekStart(today)` / `_weekEnd(today)` | Aktuális hét határai (hétfő–vasárnap) |
| `_setText(id, val)` | Biztonságos DOM szöveg beállítás |

### Születésnap / Névnap
| Függvény | Leírás |
|----------|--------|
| `_loadBirthdaysAndNamedays(today, shared)` | Mai születésnaposok + névnaposok |
| `_loadUpcomingBirthdays(today, shared)` | Következő 14 nap előrejelzése |

### Diagramok
| Függvény | Leírás |
|----------|--------|
| `_loadCharts(today, shared)` | ApexCharts lazy load + mindkét diagram |
| `_renderIncomeChart(today, shared)` | 8 hónap bevétel/kiadás oszlopdiagram |
| `_renderAgeGroupChart(shared)` | 5 korcsoport fánkdiagram |

### Programszervező
| Függvény | Leírás |
|----------|--------|
| `loadProgramForYear(year)` | Teljes év betöltése + hónap-fülek generálás |
| `showProgramMonth(monthIdx, today)` | Adott hónap naptár + lista renderelés |
| `_renderCalendarGrid(monthIdx, events, today)` | Mini naptár 7×N rács generálás |
| `_renderMiniList(monthIdx, events)` | Havi program lista renderelés |
| `openProgramModal(editId, defaultMonth)` | Program modal megnyitás (új/szerkesztés) |
| `saveProgram()` | Egy program mentése (insert/update) |
| `deleteProgram(progId)` | Program törlés (confirm) |
| `toggleProgramDone(progId, done)` | Teljesítve jelölés toggle |
| `onCalDayClick(day, monthIdx)` | Naptár-nap kattintás → új program |
| `progNavMonth(dir)` | Hónap előre/hátra navigáció |
| `toggleEgyediTipus()` | Egyéb típus mező toggle |
| `_progEmoji(e)` / `_progTypusLabel(e)` / `_progColor(e)` | Típus segédfüggvények |
| `_escHtmlDash(str)` | HTML escape |

### Emoji picker
| Függvény | Leírás |
|----------|--------|
| `toggleEmojiPicker()` | Emoji panel megjelenítés/elrejtés |
| `pickEmoji(emoji)` | Kiválasztott emoji beállítás |

### Batch (tömeges) bevitel
| Függvény | Leírás |
|----------|--------|
| `openBatchEntry()` | Modal megnyitás, 10 üres sor |
| `addBatchRow()` / `addBatchRows(count)` | Új sor(ok) hozzáadása |
| `removeBatchRow(idx)` | Sor eltávolítása |
| `saveBatchPrograms()` | Tömeges INSERT (validációval) |
| `_updateBatchCount()` | Kitöltött sorok számolása |

### Nyomtatás
| Függvény | Leírás |
|----------|--------|
| `printEvesTermezo()` | A3 fekvő nyomtatható naptár generálás (új ablak + PDF) |

### Friss bejegyzések + Statisztikák
| Függvény | Leírás |
|----------|--------|
| `_loadRecentActivity(shared)` | Utolsó 10 munkanapló bejegyzés |
| `_loadBottomStats(today, shared)` | Nemek, átlagéletkor, fizetők, presbiterek, egyenleg |
| `_loadAnnualProgram(year, today)` | Év-választó + program betöltés indítása |

---

## 5. Függőségek

### Külső könyvtárak
| Könyvtár | Használat | Betöltés |
|----------|-----------|----------|
| **ApexCharts** | Bevétel/kiadás + koreloszlás diagramok | Lazy load (`loadLib('apexcharts')`) |
| **html2pdf.js** | Éves terv PDF mentés | CDN a nyomtatási ablakban |
| **Supabase JS** | Minden adatbázis művelet | Globális `_supabase` |

### Belső függőségek
| Modul | Mi kell belőle |
|-------|----------------|
| `supabase_config.js` | `window._supabase` kliens |
| `session_cache.js` | `getCachedProfile()`, `getCachedCongregationName()` |
| `data_cache.js` | `cachedQuery()` — TTL-alapú lekérdezés cache |
| `lazy_libs.js` | `loadLib()` — lazy könyvtár betöltő |

### Next.js migrációban ezek helyettesítése
| Régi | Új |
|------|----|
| `window._supabase` | `createClient()` (server/client) |
| `getCachedProfile()` | Layout Server Component → prop |
| `getCachedCongregationName()` | Layout Server Component → prop |
| `cachedQuery()` | Server Component (React cache + revalidate) |
| `loadLib()` | `next/dynamic` vagy React.lazy |

---

## 6. Állapotkezelés

### Globális változók
| Változó | Típus | Tartalom |
|---------|-------|----------|
| `_allPrograms` | `{ [hónap: number]: Program[] }` | Az aktuális év összes programja hónapok szerint csoportosítva |
| `_currentProgramMonth` | `number` | Jelenleg megjelenített hónap (0-11) |
| `_programYear` | `number` | Jelenleg megjelenített év |
| `_batchRowCounter` | `number` | Batch beviteli sorok számlálója |

### Shared adatobjektum (egyetlen lekérdezés-csomag)
```
shared = {
  allMembers,        // minden szemely (meghalt=false)
  activeMembers,     // allMembers − elkoltozott
  elkoltozottIds,    // Set<id_szemely>
  allBefizetes,      // befizetes sorok (~14 hónap)
  allKiadas,         // kiadas sorok (~14 hónap)
  allNevnapok,       // nevnap tábla (365 sor)
  totalFamilies,     // csalad count
  payersCount,       // fizetők száma (idén)
  presbCount,        // presbiterek száma
  weekEvents,        // heti események száma
  recentActivity     // utolsó 10 munkanapló
}
```

A shared objektum a `loadDashboardData()` belépési pontban jön létre, és minden _load* függvény referenciát kap rá. **Nulla hálózati hívás** a UI frissítés fázisában.

---

## 7. UI kapcsolatok

### Szekciók és DOM elemek

| Szekció | Fő DOM elemek |
|---------|--------------|
| Hero Banner | `dash-greeting`, `dash-date-line`, `dash-congregation-line`, `dash-today-names` |
| KPI | `kpi-active-members`, `kpi-families`, `kpi-month-income`, `kpi-week-events` |
| Születésnapok | `list-birthdays`, `list-namedays`, `list-upcoming-birthdays`, `upcoming-count-badge` |
| Diagramok | `chart-monthly-income` (bar), `chart-age-groups` (donut) |
| Programok | `program-month-tabs`, `program-calendar-grid`, `program-list-view`, `prog-month-label`, `dash-program-year` |
| Friss bejegyzések | `list-recent-activity` |
| Statisztikák | `stat-men`, `stat-women`, `stat-children`, `stat-avg-age`, `stat-payers-year`, `stat-presbiterek`, `stat-balance` |

### Modal-ok
| Modal | Cél | Hívás |
|-------|-----|-------|
| `modal-program` | Program létrehozás/szerkesztés | `openProgramModal()` |
| `modal-batch-program` | Tömeges program rögzítés | `openBatchEntry()` |
| Nyomtatás | Éves terv (A3 PDF, új ablak) | `printEvesTermezo()` |

---

## 8. Hibakezelés

| Helyzet | Viselkedés |
|---------|-----------|
| Supabase lekérdezés hiba | `cachedQuery` IndexedDB fallback-kel próbálkozik (offline) |
| Profil betöltés sikertelen | `_fillHeroBanner` try/catch — üdvözlés profil név nélkül |
| ApexCharts nem elérhető | `if (typeof ApexCharts === 'undefined') return` — diagram nem renderelődik |
| Program mentés hiba | `alert()` a hibaüzenettel + button reset |
| Batch validáció | Soronkénti hibalista alert-ben |
| Záró dátum < kezdő dátum | `alert()` + mentés blokkolás |
| Üres shared adat | `|| []` / `?? '—'` fallback-ek |
| DOM elem hiányzik | Minden `_setText` / render előtt `if (!el) return` |

---

## 9. Rejtett működés

### Teljesítmény-optimalizáció
- **10 párhuzamos lekérdezés** egyetlen `Promise.all()`-ban — korábban ~30 szekvenciális hívás volt
- **2 perces cache** (`cachedQuery`) — ismételt oldalbetöltésnél 0 hálózati hívás
- **Névnap tábla 1 óra cache** — 365 sor, ritkán változik
- **Kliens-oldali szűrés** — a havi bevétel/kiadás, születésnap, névnap mind a shared adatból számolódik, nem külön query

### Hét-számítás sajátosság
- Hétfővel kezdődő hét (`(today.getDay() + 6) % 7`) — magyar konvenció

### Program dátum-tartomány
- Egy program lehet többnapos (`datum` és `datum_vege`)
- A naptár-rácson mindkét napon megjelenik a program (ciklussal)
- A nyomtatásban is végigfut a dátum-tartományon

### Batch bevitel UX
- Enter → következő sor `batch-cim` mezőjére ugrik
- Ha az utolsó sornál Enter-t nyom → automatikus új sor hozzáadás
- Kitöltött sorok száma valós időben frissül

### Éves terv nyomtatás
- Teljes HTML+CSS generálás → `window.open()` → új ablak
- A3 fekvő `@page` méret
- Saját toolbar (Nyomtatás, PDF mentés, Bezárás)
- html2pdf.js CDN-ről töltődik a nyomtatási ablakban
- Jelmagyarázat csak a használt típusokat tartalmazza

### Egyedi emoji rendszer
- Az „egyéb" típusnál a felhasználó saját emojit választhat egy 64-elemű gridből
- Az emoji grid csak első megnyitáskor épül fel (lazy build)
- Kívülre kattintás bezárja a panelt

### RLS védelem
- A `gyulekezeti_programok` tábla RLS-el védett — a felhasználó csak saját gyülekezetének programjait látja
- Új program létrehozásakor a `congregation_id` a profil-ból jön (nem URL paraméter)
