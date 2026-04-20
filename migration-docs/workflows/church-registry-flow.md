# Anyakönyv — Felhasználói folyamatok

---

## FLOW 1: Anyakönyv oldal betöltése és fülváltás

### Kiindulási pont
A lelkész a sidebar-ban az „Anyakönyv" menüpontra kattint.

### Lépések
1. Az oldal betöltődik 9 fő füllel: Áttekintő, Kereszteltek, Konfirmáltak, Házasultak, Eltemetettek, Beköltözött, Elköltözött, Áttért, Kitért
2. Az alapértelmezett aktív fül: **Kereszteltek**
3. A rendszer lekérdezi a gyülekezet azonosítóját a profilból (`_akCongregationId`)
4. Az aktuális fül adatai betöltődnek:
   - Supabase lekérdezés a fül megfelelő táblájából
   - Gyülekezet-szűrés (`congregation_id`)
   - Személy JOIN (név, nem, születési dátum)
   - Rendezés dátum szerint csökkenő
5. Szűrő sáv megjelenik: év-választó + szöveg kereső
6. A dinamikus gomb frissül a fül típusa szerint (szín + szöveg)

### Rendszer reakciók
- A táblázat megjelenik a bejegyzésekkel
- Badge: „X bejegyzés"
- Az év-szűrő dropdown az adatban előforduló évekből töltődik

### Döntési pontok
- **Nincs bejegyzés** → „Nincs adat." üzenet
- **Fülváltás** → az adatok újratöltődnek az új fülhöz tartozó táblából

### Végállapotok
- A lelkész az adott típusú bejegyzések listáját látja

---

## FLOW 2: Szűrés és keresés

### Kiindulási pont
A lelkész az anyakönyvi listában a szűrőket vagy a keresőt használja.

### Lépések

**Év szűrő:**
1. Dropdown: az adatban előforduló évek (legújabb elöl)
2. Kiválasztás → a lista az adott évre szűrődik

**Szöveg keresés:**
1. A keresőmezőbe gépel
2. A keresés a következő mezőkben keres (fültől függően):
   - Személy neve (családnév + keresztnév)
   - Házasságnál: mindkét fél neve
   - Lelkész neve
   - Okiratszám
   - Megjegyzés
   - Tanúk
   - Igazolás
   - Felekezet
   - Halál oka
3. Case-insensitive substring keresés

**Rendezés:**
1. Oszlopfejlécre kattintás → toggle asc/desc
2. Újabb kattintás ugyanazon oszlopra → irány vált

### Rendszer reakciók
- Badge frissül: „X / Y találat" (szűrt / összes)
- Az év-szűrő és a szöveg keresés egyszerre alkalmazódik

### Végállapotok
- A szűrt lista megjelenik

---

## FLOW 3: Keresztelés rögzítése

### Kiindulási pont
A lelkész a Kereszteltek fülön a „Keresztelés rögzítése" gombra kattint.

### Lépések
1. Az anyakönyvi modal megnyílik (keresztelés form)
2. Az **okiratszám** automatikusan generálódik:
   - Az aktuális évre szűri a meglévő okiratszámokat
   - A maximumot megkeresi
   - Inkrementálja → pl. `202601003`
   - Ha az évre nincs korábbi → `{YYYY}01001`
3. **Személy keresés:**
   - A kereső mezőbe gépel (3+ karakter)
   - Találatok: név + születési dátum
   - Kattintás → kiválasztás
   - Ha a személy szülei már rögzítve vannak a rendszerben → a szülő mezők automatikusan előtöltődnek
4. **Ha a személy NINCS a rendszerben:**
   - „Új tag rögzítése" gomb jelenik meg → FLOW 8 (gyorsrögzítés)
5. **Szülő keresés (apa):**
   - Kereső mező → találatok (férfi tagok, név + kor + cím)
   - Kiválasztás → CNP, vallás, családnév mentődik
   - Ha nincs → kézi név bevitel (CNP összekötés nélkül)
6. **Szülő keresés (anya):** — ugyanaz mint az apa, de nő tagok
7. Kitölti a többi mezőt:
   - Dátum (**kötelező**)
   - Hely (opcionális — település keresés)
   - Lelkész neve
   - Keresztszülők (szabad szöveg)
   - Alapige (szabad szöveg)
   - Anya leánykori neve (sablon)
   - Apa vallása / anya vallása (sablon)
8. **Munkanapló checkbox:** ha bejelöli → a keresztelés a munkanaplóba is bekerül
9. „Mentés" gombra kattint

### Rendszer reakciók
1. INSERT `keresztseg` tábla (okirat, datum, hely, lelkész, keresztszülők, alapige, megjegyzés + sablon JSON)
2. UPDATE `szemely`: `id_apja`, `id_anyja`, `apjaneve`, `anyjaneve` (ha szülő megadva)
3. **Automatikus család létrehozás** (FLOW 4) — ha mindkét szülő CNP-je megvan
4. Ha munkanapló checkbox → INSERT `munkanaplo` (típus: „Keresztelő", dátum, alapige)
5. Modal bezárul, lista frissül, toast üzenet

### Döntési pontok

**A) Szülő CNP-vel összekötve → családfa és család is frissül**
**B) Szülő csak névvel → az anyakönyvi bejegyzés rögzítődik, de családfa-összekötés NINCS**
**C) Szülő teljesen hiányzik → figyelmeztetés: „A családfa funkciók nem fognak működni"**

### Végállapotok
- A keresztelés bejegyzés rögzítve, a szülők összekötve, a család létrehozva (ha lehetséges)

---

## FLOW 4: Automatikus család létrehozás (kereszteléskor)

### Kiindulási pont
A keresztelés mentésekor a rendszer észleli, hogy szülők CNP-vel vannak összekötve.

### Lépések
1. A rendszer megkeresi az apa személyét CNP alapján → `ferfiId`
2. A rendszer megkeresi az anya személyét CNP alapján → `noId`
3. Megnézi: van-e már család ezzel a szülőpárossal a `csalad` táblában?

### Döntési pontok

**A) Van már család:**
- A gyermeket (az újonnan keresztelt személyt) beregisztrálja a családba (`gyerek` tábla INSERT)
- Ha a gyermek MÁR regisztrálva van → nem duplikálja

**B) Nincs család, de a szülőknek VAN lakcímük:**
- Rákérdez: „Szeretné automatikusan létrehozni a családot?"
- Ha IGEN → INSERT `csalad` (szülő ID-k + szülő lakcíméből: utca, házszám, tömb, lépcső, emelet, ajtó)
  → INSERT `gyerek` (gyermek a családba)
- Ha NEM → nem hoz létre családot

**C) Nincs család, és a szülőknek NINCS lakcímük:**
- Figyelmeztetés: „A szülőknek nincs rögzített lakcímük. A család manuálisan hozható létre a Családok fülön."

**D) Nincs szülő CNP:**
- A család létrehozás NEM fut le
- Figyelmeztetés: „A szülők nincsenek összekötve — a családfa és család funkciók nem fognak működni"

### Végállapotok
- Család létrejött + gyerek regisztrálva, VAGY figyelmeztetés megjelent

---

## FLOW 5: Konfirmáció tömeges rögzítése

### Kiindulási pont
A lelkész a Konfirmáltak fülön a „Konfirmandusok rögzítése" gombra kattint.

### Lépések
1. A konfirmáció modal megnyílik (üres lista)
2. **Konfirmandusok hozzáadása — kétféle módszer:**

   **a) Keresés név alapján:**
   - A kereső mezőbe gépel (3+ karakter)
   - A rendszer a `szemely` táblából keres, DE kiszűri a már konfirmáltakat
   - Találat kiválasztása → hozzáadódik a listához
   - A listában megjelenik: név, nem, születési dátum, keresztelés dátuma (ha van)

   **b) Korosztály kereső:**
   - „12–16 évesek keresése" gomb
   - A rendszer leszűri a 12–16 éves, még nem konfirmált tagokat
   - Egyszerre több is hozzáadható

3. A listából eltávolítás: „X" gomb az adott sornál
4. „Mindent töröl" gomb → a lista kiürül
5. A lelkész kitölti a **közös mezőket:**
   - Dátum (**kötelező**)
   - Lelkész neve (opcionális)
   - Megjegyzés (opcionális)
   - Munkanapló checkbox
6. „Mentés" gomb

### Rendszer reakciók — FLOW 6 (wizard) VAGY közvetlen mentés

### Döntési pontok

**A) A lista üres → figyelmeztetés, mentés nem fut**
**B) Duplikált személy → a rendszer nem engedi kétszer hozzáadni**
**C) Már konfirmált személy → NEM jelenik meg a keresőben**

---

## FLOW 6: Konfirmáció wizard — hiányzó keresztelés pótlás

### Kiindulási pont
A konfirmáció mentésekor a rendszer észleli, hogy egyes konfirmandusoknak nincs keresztelési bejegyzése.

### Lépések
1. A rendszer összeszámolja: hány konfirmandusnak hiányzik a keresztelés
2. Kérdés: „X konfirmandusnak nincs keresztelési bejegyzése. Szeretné most pótolni?"

### Döntési pontok

**A) „Igen, pótolom" → wizard indul:**
1. A konfirmáció modal bezárul
2. Az ELSŐ hiányzó konfirmandushoz megnyílik a keresztelés modal
   - A személy automatikusan kiválasztva (nem kell keresni)
   - A szülők automatikusan betöltődnek (ha a szemely táblában vannak)
3. A lelkész kitölti a keresztelési adatokat + ment
4. A rendszer elmenti a keresztelést (INSERT `keresztseg`)
5. A következő hiányzó konfirmandusra lép → újabb keresztelési modal
6. Amíg van hiányzó → ismétlődik
7. Minden hiányzó pótolva → a konfirmáció modal újra megnyílik
8. A listában az immár kitöltött keresztelési dátumok megjelennek
9. „Mentés" → batch INSERT `konfirmalas`

**B) „Nem, kihagyom" → közvetlen mentés:**
- A konfirmáció mentődik a hiányzó keresztelések nélkül
- A konfirmándusok a rendszerben konfirmáltként lesznek nyilvántartva (keresztelés nélkül is)

**C) Wizard közben bezárja az ablakot:**
- A MÁR PÓTOLT keresztelések megmaradnak (azok külön bejegyzések)
- A konfirmáció NEM mentődik (a wizard megszakadt)
- A konfirmandus lista elvész (a modal bezáródott)

### Végállapotok
- Minden konfirmandus a `konfirmalas` táblába került
- A hiányzó keresztelések pótolva (ha a wizard lefutott)
- Opcionálisan: munkanapló bejegyzés („Konfirmáció (X fő)")

---

## FLOW 7: Házasság rögzítése

### Kiindulási pont
A lelkész a Házasultak fülön a „Házasságkötés rögzítése" gombra kattint.

### Lépések
1. Modal megnyílik
2. Okiratszám automatikusan generálódik
3. **Vőlegény keresés:** személy kereső (csak férfi tagok) → kiválasztás
4. **Menyasszony keresés:** személy kereső (csak nő tagok) → kiválasztás
5. Kitölti: dátum, lelkész, tanúk (szabad szöveg)
6. „Mentés" → INSERT `hazassag`

### Döntési pontok
- **Vőlegény vagy menyasszony nincs a rendszerben** → „Gyorsrögzítés" gomb (FLOW 8)
- **Mindkét fél kötelező** — ha bármelyik hiányzik, a mentés nem fut

### Végállapotok
- A házasság bejegyzés rögzítve két személlyel

---

## FLOW 8: Tag nem található — gyorsrögzítés és visszatérés

### Kiindulási pont
Az anyakönyvi keresőben a személy nem található → „Új tag rögzítése" gomb.

### Lépések
1. A lelkész az „Új tag rögzítése" gombra kattint
2. A rendszer megjegyzi: `isReturningToAnyakonyv = true`
3. Az anyakönyvi modal bezárul
4. A tagnyilvántartás modal megnyílik (Fázis 3 — `member-form-dialog`)
   - Egyszerűsített nézet: csak a személyes adatok fül látszik
   - A keresett név előtöltődik a családnév + keresztnév mezőkben
5. A lelkész kitölti az adatokat és ment
6. A tag mentődik a rendszerbe
7. A tag modal bezárul
8. Az anyakönyvi modal automatikusan ÚJRA MEGNYÍLIK
9. A mentett tag automatikusan KIVÁLASZTÓDIK a keresőben
10. A lelkész folytathatja az anyakönyvi bejegyzés kitöltését

### Döntési pontok
- **A tag mentés sikertelen** → hibaüzenet, a tag modal nyitva marad, az anyakönyv NEM nyílik vissza
- **A tag mentés sikeres** → zökkenőmentes visszatérés

### Végállapotok
- A tag a rendszerben van, az anyakönyvi bejegyzés folytatható

---

## FLOW 9: Temetés rögzítése

### Kiindulási pont
A lelkész az Eltemetettek fülön a „Haláleset rögzítése" gombra kattint.

### Lépések
1. Modal megnyílik
2. Személy keresés → kiválasztás
3. Kitölti:
   - Halál dátuma (**kötelező**)
   - Temetés dátuma (**kötelező**)
   - Halál oka (opcionális)
   - Halál helye (opcionális — település keresés)
   - Temetés helye (opcionális)
   - Lelkész neve
4. Munkanapló checkbox (opcionális)
5. „Mentés" → INSERT `temetes`

### Rendszer reakciók
- A temetés bejegyzés rögzítődik
- Ha munkanapló checkbox → INSERT munkanaplo
- **FONTOS:** A `szemely.meghalt = true` flag NEM itt állítódik!
  - Az a Fázis 3 „Tag kivezetése → Elhunyt" workflow-ban történik
  - Az anyakönyvi temetés CSAK a szertartási bejegyzést rögzíti

### Végállapotok
- A temetés bejegyzés rögzítve (a tag státusza NEM változik automatikusan)

---

## FLOW 10: Tagmozgás rögzítése (beköltözés, elköltözés, áttérés, kitérés)

### Kiindulási pont
A lelkész a megfelelő fülön a rögzítés gombra kattint.

### Lépések
1. Modal megnyílik a fül típusának megfelelő formmal
2. Személy keresés → kiválasztás
3. Kitölti a típus-specifikus mezőket:

| Típus | Specifikus mezők |
|-------|-----------------|
| Beköltözés | Dátum, honnan (település), igazolás szám, megjegyzés |
| Elköltözés | Dátum, hová (település), külföldre checkbox, megjegyzés |
| Áttérés | Dátum, korábbi felekezet, honnan, megjegyzés |
| Kitérés | Dátum, új felekezet, hová, megjegyzés |

4. „Mentés" → INSERT a megfelelő táblába

### Döntési pontok
- **FONTOS:** A tagmozgás anyakönyvi bejegyzések FÜGGETLENEK a tagnyilvántartás státuszváltoztatástól!
  - Az `elkoltozott` anyakönyvi bejegyzés NEM állítja a `szemely.elkoltozott = true` flag-et
  - Az `attert` NEM állítja a `szemely.vallas` mezőt
  - Ezek a Fázis 3 „Tag kivezetése" workflow-ban történnek
- A lelkész dönthet: rögzíti-e csak az anyakönyvben, VAGY a tag státuszát is módosítja (a tagnyilvántartásban)

### Végállapotok
- Az anyakönyvi bejegyzés rögzítve (a tag státusza NEM változik automatikusan)

---

## FLOW 11: Bejegyzés szerkesztése

### Kiindulási pont
A lelkész egy bejegyzés sorában a „Szerkesztés" gombra kattint.

### Lépések
1. A rendszer betölti a bejegyzés adatait
2. A modal szerkesztés módban nyílik meg (minden mező előtöltve)
3. A személy NEM cserélhető (az id_szemely readonly)
4. A többi mező módosítható
5. „Mentés" → UPDATE a megfelelő táblában

### Rendszer reakciók
- Keresztelésnél: a szülő adatok is frissülnek (szemely tábla)
- Az automatikus család létrehozás NEM fut újra szerkesztésnél
- A munkanapló bejegyzés NEM frissül szerkesztésnél

### Végállapotok
- A bejegyzés frissült

---

## FLOW 12: Bejegyzés törlése

### Kiindulási pont
A lelkész egy bejegyzés sorában a „Törlés" gombra kattint.

### Lépések
1. Megerősítő kérdés: „Biztosan törli a(z) {típus} bejegyzést? ({személy neve})"
2. Tájékoztató: „A törlés végleges, de a személy adatai megmaradnak."

### Döntési pontok

**A) Megerősítés → törlés:**
- DELETE a megfelelő anyakönyvi táblából
- A `szemely` rekord NEM törlődik (csak a bejegyzés)
- A `munkanaplo` bejegyzés NEM törlődik (ha volt)
- A lista frissül

**B) Mégse → semmi nem történik**

### Végállapotok
- A bejegyzés véglegesen törölve — visszavonás nincs

---

## FLOW 13: Keresztelési emléklap nyomtatása

### Kiindulási pont
A lelkész a Kereszteltek fülön egy bejegyzés „Emléklap" gombjára kattint.

### Lépések
1. A rendszer lekérdezi:
   - A keresztelési bejegyzés adatai (dátum, hely, lelkész, keresztszülők, alapige)
   - A gyülekezet neve (`congregations` tábla)
   - Szülő adatok:
     - Ha CNP-vel összekötve → aktuális név a `szemely` táblából
     - Ha nincs CNP → a tárolt `apjaneve` / `anyjaneve`
   - Sablon adatok: anya leánykori neve, szülők vallása (megjegyzes JSON-ból)
   - A gyermek születési helye és dátuma
2. HTML emléklap generálás:
   - Elegáns betűtípusok (Cinzel, Playfair Display — Google Fonts)
   - Kereszt szimbólum
   - Gyülekezet neve
   - Gyermek neve
   - Születési hely és dátum
   - Szülők neve (apa + anya, leánykori névvel)
   - Keresztelés dátuma
   - Lelkész neve
   - Keresztszülők
   - Alapige
3. Új böngésző ablak nyílik meg a nyomtatási nézettel
4. „Nyomtatás" gomb

### Döntési pontok
- **Szülő CNP-vel** → az aktuális név jelenik meg (ha a szülő nevet változtatott, az új név lesz)
- **Szülő CNP nélkül** → a rögzítéskori név jelenik meg
- **Sablon adatok hiányoznak** → az adott mező üresen marad az emléklapon
- **Gyülekezet neve nem elérhető** → üres felirat

### Végállapotok
- Az emléklap nyomtatva (nem mentődik — csak print)

---

## FLOW 14: Excel export

### Kiindulási pont
A lelkész az „Excel export" gombra kattint (bármely fülön).

### Lépések
1. A rendszer a SheetJS könyvtárat lazy-loaded tölti be
2. Az aktuális fül **szűrt** adatait exportálja (nem az összeset — a szűrő és keresés alkalmazódik)
3. Az oszlopok a fül típusától függenek:
   - Keresztelés: okirat, név, dátum, hely, lelkész, szülők, keresztszülők, alapige
   - Konfirmáció: név, nem, dátum, lelkész
   - Házasság: okirat, vőlegény, menyasszony, dátum, tanúk, lelkész
   - Stb.
4. XLSX fájl letöltése

### Döntési pontok
- **Nincs adat (szűrő utáni üres tábla)** → „Nincs exportálható adat" figyelmeztetés

### Végállapotok
- Az Excel fájl letöltődik a böngészőben
