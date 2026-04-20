# Dashboard — Üzleti szabályok

---

## 1. Jogosultságok

### Ki mit lát

| Szerepkör | Gyülekezeti dashboard | Egyházmegyei dashboard | Kerületi dashboard |
|-----------|:--------------------:|:---------------------:|:-----------------:|
| Lelkész | sajat gyülekezete | — | — |
| Esperes | sajat gyülekezete | sajat egyházmegye összesítő | — |
| egyhazmegyei_admin | sajat gyülekezete | sajat egyházmegye összesítő | — |
| Admin | sajat gyülekezete | minden egyházmegye | kerületi összesítő |
| Master Admin | sajat gyülekezete | minden egyházmegye | kerületi összesítő |

### Adathozzáférés szabályai

- A lelkész KIZÁRÓLAG a saját gyülekezetéhez tartozó adatokat látja a dashboard-on
- Sem a tagok, sem a pénzügyi adatok, sem a programok nem „szivároghatnak" más gyülekezetekből
- Ez adatbázis szinten van kikényszerítve (RLS), nem csak felületi szűrés
- Master Admin Admin Override módban más gyülekezet dashboard-ját is megtekintheti (lásd: Core szabályok)

### Gyülekezeti programok jogosultságai

- Programot létrehozni, szerkeszteni és törölni CSAK a saját gyülekezet lelkésze tud
- A program létrehozójának neve és azonosítója automatikusan rögzítődik
- A `congregation_id` a felhasználó profiljából jön, NEM szerkeszthető a felületen

---

## 2. Szabályok

### Üdvözlés

- Az üdvözlés a napszaktól függ:
  - 0:00–5:59 → „Jó éjszakát!"
  - 6:00–11:59 → „Jó reggelt kívánunk!"
  - 12:00–17:59 → „Jó napot kívánunk!"
  - 18:00–23:59 → „Jó estét kívánunk!"
- Az üdvözlés a lelkész **családnevét** tartalmazza (pl. „Jó reggelt kívánunk, Kovács testvér!")
- A családnév a teljes név utolsó szavából jön (split(' ').slice(-1))

### KPI kártyák

| Kártya | Definíció |
|--------|-----------|
| **Aktív tagok** | Összes személy akinek `meghalt = false` ÉS nincs az `elkoltozott` táblában |
| **Családok** | Az összes családrekord száma (nincs szűrő) |
| **Havi bevétel** | Az aktuális naptári hónap összes bevételének összege (RON). Az aktuális hónap első napjától számít. |
| **Heti események** | Az aktuális hét munkanapló bejegyzéseinek száma. A hét hétfőtől vasárnapig tart (magyar konvenció). |

### Pénzügyi pénznem

- Minden pénzügyi adat **RON (román lej)** pénznemben jelenik meg
- A számok magyar lokalizációval formázottak (pl. 1 234 567)

### Születésnap számítás

- A születésnap a `sz_datum` mező hónap-nap részéből jön (évtől függetlenül)
- Az életkor az aktuális évből vonja ki a születési évet
- Csak AKTÍV tagok születésnapja jelenik meg (elhunyt és elköltözött nem)

### Névnap egyeztetés

- A rendszer a `nevnap` táblából olvassa ki, hogy az aktuális napon kinek van névnapja (maximum 3 név per nap: nev1, nev2, nev3)
- A névnapokat a tagok **keresztnevével** (`k_nev` mező) egyezteti
- Ha a névnap szerepel a táblában de egyetlen tag neve sem egyezik → „Ma: *Névnap* — nincs érintett tag."

### Következő 14 nap születésnap előrejelzés

- Csak a jövőbeli napokra tekint előre (a mai napot NEM tartalmazza — az a „Mai születésnaposok" szekcióban van)
- Ha az idei születésnap már elmúlt → a jövő évi születésnapot veszi figyelembe
- Közelség jelzés: 1 nap = „holnap", 2–3 nap = piros badge, 4–14 nap = narancs badge
- Rendezés: a legközelebbi van elöl

### Diagramok időtávja

- **Bevétel vs Kiadás oszlopdiagram:** az utolsó 8 hónapot mutatja (az aktuálist beleértve)
- **Koreloszlás fánkdiagram:** az összes aktív tagot 5 korcsoportba sorolja:
  - 0–17 (gyermekek)
  - 18–35 (fiatalok)
  - 36–60 (középkorúak)
  - 61–80 (idősek)
  - 80+ (nagyon idősek)
- Az életkor számítás az aktuális évből vonja ki a születési évet (nem pontos napi szintű)

### Alsó statisztikák nemek szerinti besorolás

- **Gyermek:** bárki, akinek az életkora < 18 (nemtől függetlenül)
- **Férfi:** `ferfi = true` ÉS életkor ≥ 18
- **Nő:** `ferfi = false` (vagy null) ÉS életkor ≥ 18
- Ha nincs születési dátum → a rendszer **nőként** számítja (ez egy ismert kompromisszum)

### Egyenleg számítás

- Egyenleg = Összes bevétel − Összes kiadás (az utolsó ~14 hónap alapján, nem all time)
- A diagramok időtávjával megegyező adathalmazból számol

### Friss bejegyzések

- Az utolsó 10 munkanapló bejegyzés jelenik meg
- Rendezés: `created_at` csökkenő (legfrissebb elöl)
- Nincs szűrés típus szerint — minden jelleg megjelenik

---

## 3. Validációk

### Program létrehozás / szerkesztés

| Mező | Szabály |
|------|---------|
| Cím (cim) | **Kötelező**, nem lehet üres |
| Dátum (datum) | **Kötelező**, érvényes dátum |
| Záró dátum (datum_vege) | Opcionális, de ha meg van adva → **nem lehet a kezdő dátum előtt** |
| Időpont kezdés (ido_kezdes) | Opcionális, szabad formátumú idő (HH:MM) |
| Időpont befejezés (ido_befejezes) | Opcionális, szabad formátumú idő |
| Helyszín (helyszin) | Opcionális, szabad szöveg |
| Típus (tipus) | Kötelező, a 16 előre definiált típus egyike |
| Prioritás (prioritas) | Kötelező, a 4 szint egyike |
| Ismétlődés (ismetlodes_tipus) | Opcionális: heti, kétheti, havi, vagy üres |
| Megjegyzés (megjegyzes) | Opcionális, szabad szöveg |
| Egyedi típus név | Csak ha tipus = „egyeb" → opcionális szabad szöveg |
| Egyedi emoji | Csak ha tipus = „egyeb" → opcionális emoji karakter |

### Batch (tömeges) bevitel validáció

- Soronkénti ellenőrzés:
  - Ha a cím ÉS a dátum is üres → a sor kihagyásra kerül (nem hiba)
  - Ha a cím üres de a dátum meg van adva → **hiba** (hiányzó programnév)
  - Ha a dátum üres de a cím meg van adva → **hiba** (hiányzó dátum)
  - Ha a záró dátum a kezdő dátum előtt van → **hiba**
- Az összes hiba egyszerre jelenik meg (nem áll meg az elsőnél)
- Ha nincs egyetlen érvényes sor sem → „Nincs kitöltött sor a mentéshez!" figyelmeztetés

---

## 4. Korlátozások

### Adatszeparáció

- A dashboard KIZÁRÓLAG a bejelentkezett felhasználó gyülekezetéhez tartozó adatokat mutatja
- Gyülekezet nélküli felhasználó → a gyülekezeti dashboard nem töltődik be (kerületi/megyei dashboard felé irányít)

### Program típusok

- A 16 előre definiált program típus **nem bővíthető** a felületen (kódszintű)
- Kivétel: az „egyéb" típus, ahol egyedi típusnév és emoji adható meg
- Az egyedi emoji egy fix, 64 elemű listából választható (nem szabad szöveg)

### Program módosítás

- Szerkesztéskor NEM módosítható: létrehozó azonosító, létrehozó neve, gyülekezet azonosító
- Csak az `updated_at` mezőt frissíti a rendszer (automatikusan, nem a felhasználó)

### Nyomtatás

- Az éves terv kizárólag **A3 fekvő** formátumban generálódik
- Csak az adott naptári évre vonatkozik (nem félév, nem tetszőleges időszak)
- A jelmagyarázatban csak a ténylegesen használt program típusok jelennek meg

### Év-választó

- Az aktuális évtől 3 évet visszafelé és 1 évet előre mutat (összesen 5 év választható)

---

## 5. Workflow szabályok

### Dashboard betöltés sorrendje

```
1. Oldal betöltés → Auth Guard ellenőrzés (middleware)
2. Hero banner azonnali megjelenítés (üdvözlés, dátum)
    — NEM vár adatbázisra
3. 10 párhuzamos adatlekérdezés egyetlen csomagban
4. Eredmények feldolgozása → shared adatobjektum
5. 6 párhuzamos UI szekció frissítés a shared adatból
    — a programszervező külön lekérdezést indít (gyulekezeti_programok)
```

### Gyülekezeti program létrehozás

```
1. Lelkész a „+ Új program" gombra kattint
   — VAGY —
   A mini naptárban egy napra kattint (dátum előtöltődik)
2. Program modal megnyílik
3. Kitölti a kötelező mezőket (cím, dátum)
4. Opcionálisan: záró dátum, idő, helyszín, típus, prioritás, ismétlődés, megjegyzés
5. Ha „egyéb" típust választ → egyedi név és emoji mezők megjelennek
6. „Mentés" gombra kattint
7. A rendszer automatikusan hozzáfűzi:
   — létrehozó azonosító (bejelentkezett user)
   — létrehozó neve (profilból)
   — gyülekezet azonosító (profilból)
8. Mentés az adatbázisba
9. A programszervező újratöltődik (naptár + lista + fülek frissülnek)
```

### Program szerkesztés

```
1. Lelkész a mini listában egy programra kattint
2. A modal szerkesztés módban nyílik meg (minden mező előtöltve)
3. Módosít és ment
4. A rendszer csak a megváltozott mezőket és az updated_at-ot frissíti
5. A naptár és lista automatikusan frissül
```

### Program teljesítve jelölés

```
1. A lelkész a program mellett lévő pipa gombra kattint
2. A rendszer beállítja: teljesitett = true, teljesites_datum = most
3. Visszavonás: újra kattintás → teljesitett = false, teljesites_datum = null
4. A hónap-fülön a badge frissül (pl. „3/5" → „4/5")
5. Ha minden program teljesítve → a badge zöld háttérszínt kap
```

### Program törlés

```
1. A lelkész a program törlés ikonra kattint
2. Megerősítő kérdés: „Biztosan törlöd ezt a programot?"
3. Jóváhagyás → azonnali törlés az adatbázisból
4. Visszavonás NINCS — a törlés végleges
5. A naptár és lista automatikusan frissül
```

### Tömeges (batch) bevitel

```
1. Lelkész a „Gyors bevitel" gombra kattint
2. Modal megnyílik 10 üres sorral
3. Kitölti a sorokat (cím + dátum kötelező, többi opcionális)
4. Enter → automatikus ugrás a következő sor cím mezőjére
5. Ha az utolsó sorban Enter → automatikus új sor hozzáadás
6. „+5 sor" / „+10 sor" gombokkal további üres sorok adhatók hozzá
7. „X" gombbal sorok törölhetők
8. „Összes mentése" gombra kattint
9. Validáció: üres sorok kihagyása, félkész sorok hibajeleítés
10. Mentés: minden érvényes sor egyszerre kerül az adatbázisba
11. A felhasználó adatai (név, gyülekezet) automatikusan fűződnek minden sorhoz
12. Siker → a modal bezárul, a programszervező újratöltődik
```

### Éves terv nyomtatás

```
1. Lelkész az „Éves terv nyomtatás" gombra kattint
2. Új böngésző ablak nyílik meg az A3 fekvő naptárral
3. A naptár 12 hónapot mutat egymás mellett, napokra bontva
4. Vasárnapok piros háttérrel, szombatok sárga háttérrel
5. Az aktuális nap zöld kiemelést kap
6. Programok emoji + cím formában jelennek meg a naptár celláiban
7. Ha egy napon több program van → „+N" jelölés
8. Alul jelmagyarázat a használt típusokkal és színekkel
9. Műveleti sáv: „Nyomtatás" (böngésző nyomtatás), „Mentés PDF" (html2pdf), „Bezárás"
10. A műveleti sáv nyomtatáskor automatikusan eltűnik
```

### Hónapváltás a programszervezőben

```
1. Nyíl gombokkal előre/hátra navigálás
2. Ha január előtt van → az előző évre ugrik (december hónap)
3. Ha december után van → a következő évre ugrik (január hónap)
4. Év-váltáskor az egész év adatai újratöltődnek az adatbázisból
5. Az aktuális évre váltáskor az aktuális hónap jelenik meg alapértelmezetten
6. Más évre váltáskor januártól indul
```

---

## 6. Edge case-ek

### Tagadatok

| Eset | Mi történik |
|------|-------------|
| A tagnak nincs születési dátuma | Nem jelenik meg a születésnap szekcióban. A koreloszlás diagramban nem számít. Az alsó statisztikában nőként számolódik (nincs nemre utaló információ → alapértelmezett). |
| A tag elhunyt (`meghalt = true`) | Minden statisztikából kizárva — nem aktív tag |
| A tag elköltözött (szerepel az `elkoltozott` táblában) | Minden statisztikából kizárva — nem aktív tag |
| A tag egyszerre elhunyt ÉS elköltözött | Mindkét szűrő kizárja — nincs dupla számolás |
| A gyülekezetnek nincs egyetlen tagja sem | KPI: „—" jelenik meg, diagramok üresek, születésnap/névnap szekció „nincs" üzenet |

### Pénzügyi adatok

| Eset | Mi történik |
|------|-------------|
| Nincs bevétel az aktuális hónapban | A KPI kártya „0"-t mutat (nem „—") |
| Nincs egyetlen pénzügyi rekord sem (~14 hónap) | Diagram üres, egyenleg „0 RON" |
| A bevétel összeg null vagy nem szám | `Number()` konverziója `NaN` → a szumma hibás lehet. A régi rendszerben nincs erre védelem. |

### Névnapok

| Eset | Mi történik |
|------|-------------|
| A `nevnap` táblában nincs sor a mai napra | A szekció „—" jelet mutat |
| Van névnap de egy tag neve sem egyezik | „Ma: *Nevek* — nincs érintett tag." üzenet |
| Több tagnak is ugyanaz a keresztneve | Minden egyező tag megjelenik a névnapos listában |

### Programszervező

| Eset | Mi történik |
|------|-------------|
| Az évre egyetlen program sincs rögzítve | Motiváló üzenet jelenik meg: „Kezdd el a tervezést!" |
| Többnapos program (datum ≠ datum_vege) | A program mindkét napon megjelenik a naptárban (végigiterál a tartományon) |
| Egy napon 4+ program van | A naptár cellában max 3 színpont jelenik meg. A tooltip-ben az összes program címe látható. |
| A záró dátum a kezdő dátum előtt | Validáció megakadályozza a mentést (egyedi ÉS batch módban is) |
| A felhasználónak nincs gyülekezete (congregation_id = null) | Új program létrehozásakor a `congregation_id` null lesz → RLS blokkolja a mentést |
| Batch bevitelben 0 érvényes sor | „Nincs kitöltött sor a mentéshez!" — mentés nem történik |
| Batch bevitelben vegyes hibás és jó sorok | Az ÖSSZES hiba megjelenik, mentés NEM történik (nem csak a hibás sorokat dobja el) |

### Nyomtatás

| Eset | Mi történik |
|------|-------------|
| Nincs egyetlen program sem az évben | A naptár üres napokkal jelenik meg, összesen „0 tervezett program" |
| A gyülekezet neve nem elérhető | „Gyülekezet" alapértelmezett név jelenik meg |
| html2pdf nem töltődik be | A PDF mentés gomb nem működik, de a böngésző nyomtatás igen |

### Idő és naptár

| Eset | Mi történik |
|------|-------------|
| Szökőév (feb. 29.) | A JavaScript `Date` objektum kezeli — a naptár 29 napot mutat februárban |
| Éjfél körüli betöltés (23:59 → 00:01) | Az üdvözlés és a névnap a betöltéskori időpontra vonatkozik. Ha az oldal éjfélkor nyitva marad, NEM frissül automatikusan. |
| Időzóna-eltérés | A rendszer a böngésző helyi idejét használja. Ha a lelkész más időzónában van, a „mai" nap eltérhet. |
| Év elején a következő 14 nap átlóg a következő évre | A számítás figyelembe veszi: ha az idei születésnap már elmúlt, a jövő évit veszi |
