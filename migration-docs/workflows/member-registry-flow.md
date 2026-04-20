# Tagnyilvántartás — Felhasználói folyamatok

---

## FLOW 1: Tagnyilvántartás oldal betöltése

### Kiindulási pont
A lelkész a sidebar-ban a „Tagnyilvántartás" menüpontra kattint.

### Lépések
1. Az oldal betöltődik 6 főfüllel: Áttekintés, Személyek, Családok, Presbiterek, Körzetek, Választók
2. Az aktív fül: **Személyek** (alapértelmezett)
3. A háttérben 5 párhuzamos lekérdezés indul:
   - Összes személy a gyülekezetből (élő, `isvisible = true`)
   - Aktuális évi befizetések (személy + család ID-val)
   - Felmentések (érvényes időszakban)
   - Családok (férj + feleség ID)
   - Gyerek-család kapcsolatok
4. Az eredményekből kiszámolódik:
   - Személyenkénti fizetési státusz badge (Rendezve/Felmentett/Hátralékos/Elhunyt/Elköltözött/Kitért)
   - Személy → család mapping (az „Ugrás a családhoz" gombhoz)
5. Az alapértelmezett szűrő automatikusan érvényesül: „Aktív gyülekezeti tagok"
6. A táblázat megjelenik a szűrt és rendezett taglistával
7. Az Áttekintés fül demográfiai elemzése is legenerálódik a háttérben

### Rendszer reakciók
- A szűrő dropdown „Aktív" értéken áll
- A rendezés alapértelmezése: ID csökkenő (legfrissebb felül)
- A tagszám megjelenik: „X fő a nyilvántartásban"
- A szülők datalist-je feltöltődik (apa/anya keresőhöz)

### Döntési pontok
- **Nincs egyetlen tag sem** → „Nincs még rögzített tag." üzenet
- **Nincs gyülekezete a felhasználónak** → az oldal nem tölt be semmit (üres)

### Végállapotok
- A lelkész a tagok szűrt listáját látja badge-ekkel

---

## FLOW 2: Tagok szűrése és keresése

### Kiindulási pont
A lelkész a Személyek fülön a szűrőket vagy a keresőt használja.

### Lépések

**Keresés:**
1. A keresőmezőbe gépel (minimum 1 karakter)
2. A rendszer szóközökre darabolja a keresőkifejezést
3. Egyezés keresése a **név** mezőkben ÉS a **cím** mezőkben (település + utca + házszám)
4. A találatok azonnal megjelennek (kliens-oldali szűrés, nincs új lekérdezés)

**Szűrés:**
1. A dropdown-ból kiválaszt egy szűrőt

### Döntési pontok

| Szűrő érték | Mit mutat |
|-------------|----------|
| Aktív (alapértelmezett) | Élő + (református VAGY üres vallás VAGY fizetett) |
| Elhunyt | `meghalt = true` |
| Elköltözött | `elkoltozott = true` |
| Kitért | `member_status = 'kitért'` |
| Más vallású | Vallás ≠ református ÉS nem elhunyt |
| Mind | Minden személy (szűrő nélkül) |

**Rendezés:**
1. Oszlopfejlécre kattint → rendezési irány toggle (asc/desc)
2. Rendezési ikon frissül (▲/▼)
3. Elérhető oszlopok: név, kor/születés, cím, foglalkozás

### Végállapotok
- A szűrt+rendezett lista megjelenik a tagszámmal

---

## FLOW 3: Tag kartoték megtekintése (adatlap)

### Kiindulási pont
A lelkész egy tag sorára kattint a táblázatban.

### Lépések
1. A kartoték modal megnyílik
2. A személyi adatok megjelennek a memóriából (nincs új lekérdezés):
   - Teljes név (prefix-ekkel), CNP, státusz badge
   - Születési dátum és hely
   - Foglalkozás, vallás
   - Telefon, e-mail
   - Lakcím
   - Édesapja/édesanyja neve
   - Megjegyzés
3. **6 párhuzamos lekérdezés** indul az anyakönyvi és pénzügyi adatokért:
   - Keresztelés (`keresztseg` tábla)
   - Konfirmáció (`konfirmalas` tábla)
   - Temetés (`temetes` tábla)
   - Beköltözés (`bekoltozott` tábla)
   - Áttérés (`attert` tábla)
   - Befizetések (`befizetes` tábla, dátum szerint csökkenő)
4. Anyakönyvi szekció feltöltődik (keresztelés/konfirmáció dátum, hely, lelkész)
5. Temetési szekció (ha elhunyt)
6. Történet szekció: beköltözés VAGY áttérés (ha van)
7. Befizetések táblázat (dátum, bizonylatszám, kategória, összeg)
8. A **családfa** betöltődik (a modal `shown` eseményekor):
   - FamilyTree.js, CNP-alapú szülő keresés
   - Max 3 generáció: nagyszülők → szülők → gyermek → unokák (ha vannak)

### Rendszer reakciók
- „Szerkesztés" gomb → FLOW 5 (szerkesztés)
- „Ugrás a Családhoz" gomb → megjelenik ha a tag családhoz tartozik → a család adatlapját nyitja meg
- Ha nincs befizetés → „Nincs a saját nevén rögzített befizetés" + tájékoztató a családi kasszáról
- Ha nincs családfa adat → „Nincs adat" üzenet

### Döntési pontok
- **Nincs befizetés** → tájékoztató szöveg (nem hiba)
- **Családfa: ≤1 node** → „Nincs adat", a fa nem renderelődik
- **Van beköltözés** → „Beköltözött" történet-kártya
- **Van áttérés** → „Áttért" történet-kártya
- **Nincs egyik sem** → „Helyi gyülekezeti tag" üzenet

### Végállapotok
- A lelkész a tag teljes kartotékját látja: személyi, anyakönyvi, pénzügyi adatokkal és családfával

---

## FLOW 4: Új tag felvétele

### Kiindulási pont
A lelkész az „+ Új tag" gombra kattint.

### Lépések
1. A **pre-screen** megjelenik: 3 belépési ok közül választ
   - **Alap** (helyi gyülekezeti tag)
   - **Beköltözött** (más gyülekezetből érkezett)
   - **Áttért** (más felekezetből érkezett)
2. A kiválasztott ok alapján megjelenik az űrlap:
   - „Beköltözött" vagy „Áttért" esetén extra szekció nyílik (dátum, honnan, felekezet, igazolás)
3. Az űrlap 3 fülből áll:
   - **Személyes**: családnév, keresztnév, szül. cs. név, nem, születési dátum + hely, foglalkozás, vallás, lakcím (település, utca, szám, tömb, lépcsőház, emelet, ajtó), telefon, e-mail, édesapa, édesanya, megjegyzés
   - **Anyakönyvi**: keresztelés (dátum, hely, lelkész), konfirmáció (dátum, hely, lelkész) — opcionális
   - **Pénzügyi**: fizető státusz (fizet/felmentett) — csak 18+ éves tagnál jelenik meg
4. **Szülő keresés** (ha a szülő mező aktív):
   - 3+ karakter → élő keresés indul
   - Találatoknál: név + kor + lakcím
   - Kattintás → kiválasztás (a CNP mentődik a háttérben)
   - Ha nincs találat → „Gyorsrögzítés" gomb jelenik meg
5. **Szülő gyorsrögzítés** (ha nincs a rendszerben):
   - Új modal nyílik (modal-ban modal)
   - Kötelező: családnév, keresztnév, település, utca, házszám
   - Opcionális: foglalkozás, születési dátum, vallás, „elhunyt" checkbox
   - Mentéskor: a szülő azonnal bekerül a rendszerbe
   - A szülő automatikusan kiválasztódik az eredeti form-ban
6. **Mentés** gombra kattint

### Rendszer reakciók
1. Település és utca: ha nincs az adatbázisban → automatikusan létrehozza
2. CNP generálás: `999` + 7 véletlenszám
3. Személy INSERT az adatbázisba
4. Ha 18 év alatti → a fizető státusz automatikusan „nem fizet"
5. Ha szülő van megadva (CNP-vel):
   - Szülők megkeresése CNP alapján
   - Meglévő család keresése (férj + feleség páros)
   - Ha nincs család → automatikus létrehozás a gyermek lakcímén
   - Gyerek regisztráció a családba
6. Keresztelés/konfirmáció INSERT (ha kitöltve)
7. Ha felmentett → felmentés INSERT
8. Lista frissül, toast üzenet

### Döntési pontok

**A) Vallás „református" vagy üres → egyháztag**
- Egyháztag checkbox automatikusan „igen"

**B) Vallás más → nem egyháztag**
- Egyháztag checkbox „nem", letiltva
- „Csak református lehet egyháztag!" figyelmeztetés

**C) Életkor < 18 → nem fizető**
- A fizető szekció eltűnik
- Az állapot automatikusan „nem fizet"

**D) Anyakönyvből visszatérés (`isReturningToAnyakonyv = true`)**
- Mentés után automatikusan visszatér az anyakönyvi modalba
- A mentett személy automatikusan kiválasztódik az anyakönyvi form-ban

### Végállapotok
- Az új tag megjelenik a listában
- Ha szülőt adott meg → a család is létrejön automatikusan
- Ha anyakönyvből jött → visszatért az anyakönyvi modalba

---

## FLOW 5: Tag szerkesztése

### Kiindulási pont
A lelkész a kartoték modal-ban (FLOW 3) a „Szerkesztés" gombra kattint.

### Lépések
1. A kartoték modal bezárul (modal stack-re kerül)
2. A szerkesztő modal megnyílik — **ugyanaz a form mint az új tag**
3. Minden mező előtöltődik a meglévő adatokkal:
   - Személyes adatok
   - Anyakönyvi adatok (keresztelés, konfirmáció)
   - Beköltözés/áttérés adatok (ha van)
4. A modal címe: „Tag adatainak módosítása"
5. A mentés gomb szövege: „Módosítások mentése"
6. A lelkész módosít és ment

### Rendszer reakciók
- Személy UPDATE (nem INSERT)
- Keresztelés/konfirmáció: ha volt → UPDATE, ha nem volt → INSERT
- Modal bezárul
- A kartoték modal NEM nyílik vissza automatikusan (a modal stack figyeli)
- Lista frissül

### Döntési pontok
- Ugyanazok a validációk mint az új tagnál
- A `congregation_id`, `cnp`, `isvisible`, `type` mezők NEM módosíthatók a form-on (rejtett)

### Végállapotok
- A tag adatai frissültek az adatbázisban és a listában

---

## FLOW 6: Tag kivezetése — Elhunyt

### Kiindulási pont
A lelkész a tag sorában a „Kivezetés" gombra kattint, majd az „Elhunyt" lehetőséget választja.

### Lépések
1. A kivezetés modal megnyílik a tag nevével
2. Választási képernyő: 4 lehetőség (Elhunyt, Elköltözött, Kitért, Törlés)
3. „Elhunyt" kiválasztása → a temetési form jelenik meg:
   - Halál dátuma (**kötelező**)
   - Temetés dátuma (**kötelező**)
   - Halál helye (település)
   - Temetés helye (település)
   - Halál oka (szabad szöveg)
   - Lelkész neve
   - Munkanapló checkbox (rögzítse-e szolgálatként)
4. „Végrehajtás" gombra kattint

### Rendszer reakciók
1. Temetési rekord INSERT (`temetes` tábla)
2. Személy UPDATE: `meghalt = true`
3. Modal bezárul
4. A tag a memóriában is frissül → a lista azonnal mutatja az „Elhunyt" badge-et
5. Az alapértelmezett „Aktív" szűrővel a tag eltűnik a listáról

### Döntési pontok
- Ha a halál/temetés dátuma nincs kitöltve → a form nem küldhető el (HTML required)

### Végállapotok
- A tag „Elhunyt" státuszú
- Temetési bejegyzés rögzítve
- Az „Elhunyt" szűrővel látható

---

## FLOW 7: Tag kivezetése — Elköltözött

### Kiindulási pont
A lelkész az „Elköltözött" lehetőséget választja a kivezetés modalban.

### Lépések
1. Az elköltözés form jelenik meg:
   - Dátum (alapértelmezés: ma)
   - Hová költözött (település)
   - Külföldre checkbox
   - Megjegyzés
2. „Végrehajtás"

### Rendszer reakciók
1. Elköltözött rekord INSERT (`elkoltozott` tábla)
2. Személy UPDATE: `elkoltozott = true`, `member_status = 'elköltözött'`
3. Lista frissül

### Végállapotok
- A tag „Elköltözött" státuszú

---

## FLOW 8: Tag kivezetése — Kitért

### Kiindulási pont
A lelkész a „Kitért" lehetőséget választja.

### Lépések
1. A kitérés form jelenik meg:
   - Dátum (alapértelmezés: ma)
   - Új felekezet (**kötelező**, alapértelmezés: „Ismeretlen")
   - Hová (település)
   - Megjegyzés
2. „Végrehajtás"

### Rendszer reakciók
1. Kitért rekord INSERT (`kitert` tábla)
2. Személy UPDATE: `member_status = 'kitért'`, `vallas = új felekezet`
3. Lista frissül

### Végállapotok
- A tag „Kitért" státuszú, a vallás mezője az új felekezetre változott

---

## FLOW 9: Tag kivezetése — Végleges törlés

### Kiindulási pont
A lelkész a „Törlés" lehetőséget választja.

### Lépések
1. Megerősítő kérdés

### Döntési pontok

**A) Van pénzügyi tranzakció a tag nevén:**
- Fizikai törlés NEM történik
- A tag elrejtődik: `isvisible = false`, `member_status = 'törölt'`
- Tájékoztató: „A taghoz tartozik pénzügyi tranzakció... sikeresen elrejtette a névsorból!"

**B) Nincs pénzügyi tranzakció:**
1. Rákérdez: van-e munkanapló bejegyzés? Ha igen: „Szeretné a SZOLGÁLATOKAT IS törölni?"
   - OK → munkanapló bejegyzések is törlődnek
   - Mégse → csak a tag törlődik, a munkanapló megmarad
2. Csatolt adatok törlése:
   - Keresztelés, konfirmáció, beköltözés, áttérés, felmentés, gyerek-kapcsolat, presbiter-bejegyzés, csoport-tagság
3. Személy fizikai DELETE

**C) RLS blokkolja a DELETE-et:**
- Fallback: `isvisible = false`, `member_status = 'törölt'`
- „Az adatbázis biztonsági szabályai miatt a fizikai törlés blokkolva lett, de sikeresen elrejtette."

### Rendszer reakciók
- A tag eltűnik a memóriában tárolt listából (nem kell újralekérdezés)
- A szűrők alkalmazódnak → a tag eltűnik a nézetből

### Végállapotok
- A tag vagy fizikailag törlődött, vagy láthatatlanná vált — de mindenképp eltűnt a listáról

---

## FLOW 10: Család létrehozása

### Kiindulási pont
A lelkész a Családok fülön az „+ Új család" gombra kattint.

### Lépések
1. A család modal megnyílik
2. A rendszer lekérdezi:
   - Összes élő, látható tag (cím adatokkal)
   - Meglévő családok (kik már házasok)
   - Meglévő gyerek-család kapcsolatok (kik már gyerekként regisztrálva)
   - Települések, utcák, körzetek (dropdown-okhoz)
3. A felhasználó kitölti:
   - **Férj** — okos kereső (csak egyedülálló férfiak)
   - **Feleség** — okos kereső (csak egyedülálló nők)
   - **Gyerekek** — okos kereső (csak családhoz nem rendelt tagok), több is hozzáadható
4. A cím automatikusan töltődik a kiválasztott fél (férj/feleség) lakcíméből
5. Ha a férj és feleség lakcíme eltér → „Cím-eltérés" figyelmeztetés, választás lehetősége
6. Opcionálisan: körzet hozzárendelés
7. „Mentés"

### Rendszer reakciók
1. Család INSERT (`csalad` tábla: `id_ferfi`, `id_no`, cím, körzet)
2. Gyerekek INSERT (`gyerek` tábla: minden kiválasztott gyerek a családhoz)
3. Lista frissül

### Döntési pontok
- **Se férj, se feleség** → mentés nem lehetséges
- **Már házas személy kiválasztása** → a dropdown nem engedi (kiszűri)
- **Már családba rendelt gyerek** → a dropdown nem engedi

### Végállapotok
- Az új család megjelenik a családok listájában

---

## FLOW 11: Család szerkesztése

### Kiindulási pont
A lelkész a családok listájában egy családra kattint → a család adatlap modal megnyílik.

### Lépések
1. A család adatlap megjelenik:
   - Férj és feleség neve (prefix-ekkel)
   - Cím
   - Gyerekek listája
   - Fizetési összesítés (családi szintű befizetések)
2. „Szerkesztés" gombra kattint → a család szerkesztő modal nyílik meg
3. Minden mező előtöltődik
4. Módosít (férj/feleség csere, gyerek hozzáadás/eltávolítás, cím, körzet)
5. „Mentés"

### Rendszer reakciók
- Család UPDATE
- Gyerekek: régi kapcsolatok törlése + új kapcsolatok INSERT
- Lista frissül

### Végállapotok
- A család adatai frissültek

---

## FLOW 12: Család törlése

### Kiindulási pont
A lelkész a családok listájában a „Törlés" gombra kattint.

### Lépések
1. Megerősítő kérdés
2. Ha jóváhagyja:
   - Gyerek-kapcsolatok törlése (`gyerek` tábla)
   - Család DELETE (`csalad` tábla)
3. Lista frissül

### Döntési pontok
- A családtagok NEM törlődnek — csak a család rekord és a kapcsolatok
- A személyek továbbra is megmaradnak a rendszerben

### Végállapotok
- A család eltűnt, de a személyek továbbra is aktívak

---

## FLOW 13: Családfa megtekintése

### Kiindulási pont
A lelkész a családok listájában a „Családfa" ikonra kattint, VAGY a tag kartotékban megjelenik automatikusan.

### Lépések
1. A FamilyTree.js könyvtár lazy-loaded (ha még nincs betöltve)
2. A rendszer a kiválasztott személyből kiindulva **CNP alapján** felépíti a fát:
   a) Az **apa** és az apa szülei (max 2 generáció felfelé)
   b) Az **anya** és az anya szülei
   c) A **házastárs** (a `csalad` táblából)
   d) A **saját gyermekei** (a `gyerek` + `csalad` táblából)
   e) A **testvérek** (ugyanaz a szülői család)
3. Minden személyhez saját sablon:
   - Férfi: kék szegély + kék avatár
   - Nő: rózsaszín szegély + rózsaszín avatár
   - Elhunyt: szürkés, halványított
   - Kiválasztott személy: zöld szegély
4. A fa renderelődik az adott konténerben
5. Badge: „X személy (Y elhunyt)"
6. Jelmagyarázat megjelenik

### Döntési pontok
- **≤1 node** (nincs szülő, házastárs, gyerek) → „Nincs adat" üzenet, a fa nem renderelődik
- **Születési család (gyerek tábla) ÉS saját család (szülőként)** → mindkettő megjelenik

### Végállapotok
- A lelkész vizuálisan áttekintheti a személy családi kapcsolatait (max 3 generáció)

---

## FLOW 14: Áttekintés (demográfiai vezérlőpult)

### Kiindulási pont
A lelkész az „Áttekintés" fülre kattint.

### Lépések (automatikus — a háttérben az oldal betöltésekor generálódik)

1. **Szűrés:** csak élő, nem elköltözött, nem törölt, és (református VAGY üres vallás) tagok
2. **Nemek megoszlása:**
   - Férfiak és nők száma + százalék + progress bar
3. **Korcsoportok (11 db):**
   - 0-6, 7-12, 13-14, 15-18, 19-30, 31-40, 41-65, 66-75, 76-80, 81-100, 100+
   - Progress bar-ok a százalékokkal
4. **Átlagéletkor:**
   - Összesített + nemek szerint külön
5. **Előrejelzés (5 és 10 év):**
   - Hány új konfirmandus várható (akik elérik a 13-15 évet)
   - Hány új választó (akik elérik a 18 évet)
   - Hányan lesznek 75+ és 80+ évesek
6. **Halálozási átlagéletkor:**
   - Az elhunyt tagok alapján, nemek szerint
7. **Rekordok:**
   - Legidősebb tag neve + kora
   - Legfiatalabb tag neve + kora
8. **Települési megoszlás:**
   - Top 5 település progress bar-okkal
9. **Státusz összesítés:**
   - Elhunyt, elköltözött, kitért tagok száma
10. **Top 15 nevek:**
    - Leggyakoribb családnevek
    - Leggyakoribb keresztnevek

### Döntési pontok
- **Nincs sz_datum** → a tag nem számít a korcsoportba és az átlagéletkorba
- **Nincs lakcím** → nem számít a települési megoszlásba

### Végállapotok
- A lelkész részletes demográfiai elemzést lát a gyülekezetéről

---

## FLOW 15: Presbiter felvétele

### Kiindulási pont
A lelkész a Presbiterek fülön az „+ Új presbiter" gombra kattint.

### Lépések
1. A presbiter modal megnyílik
2. A rendszer lekérdezi az összes élő, aktív tagot (gazdag adatlistával: név, kor, cím)
3. A felhasználó kitölti:
   - **Személy** (kötelező — datalist keresőből választ)
   - **Tisztség** (opcionális, szabad szöveg, alapértelmezés: „Presbiter")
   - **Körzet** (opcionális — meglévő körzetek közül)
4. „Mentés"

### Rendszer reakciók
- Ha szerkesztés → a korábbi presbiteri bejegyzések törlődnek az adott személynél
- Új presbiter INSERT
- Lista frissül

### Döntési pontok
- **Nincs személy kiválasztva** → „Kérem, válasszon egyháztagot!" figyelmeztetés

### Végállapotok
- A presbiter megjelenik a presbiterek listájában (nevével, tisztségével, körzetével)

---

## FLOW 16: Körzet kezelése és család-hozzárendelés

### Kiindulási pont
A lelkész a Körzetek fülön dolgozik.

### Lépések

**Körzet létrehozás:**
1. „+ Új körzet" gomb → modal megnyílik
2. Kötelező: név
3. Opcionális: aktív/inaktív
4. „Mentés" → körzet INSERT

**Család-hozzárendelés:**
1. A körzet sorában a „Családok" gombra kattint
2. A modal megnyílik az összes családdal
3. A rendszer automatikusan felismeri a cím-alapú egyezéseket (korzetfilter tábla):
   - Ha a család utcája és házszámtartománya beleillik a körzet szűrőjébe → „Cím alapján ide tartozik" badge
4. Ha vannak cím-alapú egyezések amelyek még nincsenek hozzárendelve:
   - „X család cím alapján ebbe a körzetbe tartozna" ajánlat + „Automatikus hozzárendelés" gomb
5. Egyéni hozzárendelés: „Hozzárendel" gomb minden családnál
6. Eltávolítás: „✕" gomb a hozzárendelt családoknál

**Körzet nélküli családok:**
1. Ha vannak körzet nélküli családok → sárga sáv jelenik meg: „X körzet nélküli család"
2. Kattintásra: lista megnyílik (családok + családhoz nem tartozó személyek)
3. Egyéni hozzárendelés (családonkénti körzet-dropdown + „Rendel" gomb)
4. Tömeges hozzárendelés: körzet kiválasztás + „Mindet ide rendeli" gomb

### Döntési pontok
- **Körzet törlés:** megerősítő kérdés → presbiteri bejegyzések is törlődnek, családok „körzet nélkülivé" válnak
- **Személy család nélkül:** nem rendelhető körzethez → tájékoztató: „Előbb rendelje családhoz!"

### Végállapotok
- A körzetek listája frissül (családok száma, felelős presbiter)

---

## FLOW 17: Választói névjegyzék

### Kiindulási pont
A lelkész a Választók fülre kattint.

### Lépések
1. A rendszer lekérdezi:
   - Összes 18+ éves, élő, aktív tag
   - Konfirmációs adatok (ki konfirmált)
   - Család → körzet kapcsolatok
   - Egyházfenntartói járulék befizetések (101.01 kód)
2. A választók: akik legalább az előző évre fizettek járulékot
3. Összefoglaló kártyák: összes választó, férfi, nő, konfirmált
4. Szűrők:
   - Keresés (név)
   - Körzet (dropdown + „körzet nélküli" opció)
   - Nem (férfi/nő)
   - Járulékfizetés (fizető/nem fizető/mind)
   - Járulék éve (dropdown: „Legalább X-ig fizette")
5. Rendezés: név, kor, körzet

### Rendszer reakciók
- A szűrt lista megjelenik: sorszám, név, nem ikon, kor, foglalkozás, lakcím, körzet, konfirmált ikon, járulék évek badge-ei
- A szűrők kliens-oldalon működnek (nincs új lekérdezés)

### Döntési pontok
- **Járulékfizetés szűrő = „fizető"** → csak azok akik legalább az előző évre fizettek
- **Járulékfizetés szűrő = „nem fizető"** → akik nem fizettek (tájékoztató célból)
- **Járulékfizetés szűrő = „mind"** → minden 18+ éves tag

### Végállapotok
- A választói névjegyzék látható, szűrhető, nyomtatható

---

## FLOW 18: Szülő keresés és gyorsrögzítés

### Kiindulási pont
A lelkész az új tag felvétel form-ban a szülő (apa/anya) mezőbe gépel.

### Lépések
1. 3+ karakter után élő keresés indul
2. A keresés szóközre darabolja a nevet:
   - 1 szó → családnév VAGY keresztnév keresés
   - 2+ szó → családnév ÉS keresztnév keresés
3. A keresés nemre szűr (apa = férfi, anya = nő)
4. Max 5 találat jelenik meg:
   - Név + kor + lakcím (település, utca, házszám)
5. Kattintás → a szülő kiválasztódik
   - A név a beviteli mezőbe kerül
   - A CNP a rejtett mezőbe mentődik
   - Információs badge: „X éves | Település, utca, szám"

### Döntési pontok

**A) Van találat → kattintás kiválasztás**
- CNP mentés → családfa összekötéshez

**B) Nincs találat → „Gyorsrögzítés" gomb**
1. Új modal nyílik (a szülő keresőt bezárja)
2. Kötelező: családnév, keresztnév, település, utca, házszám
3. Opcionális: foglalkozás, születési dátum, vallás, „elhunyt" checkbox
4. Település/utca: ha nem létezik → confirm-mal létrehozza
5. Mentés → személy INSERT a rendszerbe
6. Automatikus kiválasztás az eredeti form-ban
7. Információs badge: „X éves | Település, utca, szám" (VAGY „Újként rögzítve")

**C) Kívülre kattintás → kereső panel bezárul**

### Végállapotok
- A szülő kiválasztva/rögzítve, a CNP mentve → a tag mentésekor a család automatikusan létrejön (FLOW 4)

---

## FLOW 19: Nem-ellenőrzés (God Mode)

### Kiindulási pont
A Master Admin God Mode-ban a „Nem-ellenőrzés" gombra kattint.

### Lépések
1. A rendszer végigmegy az összes aktív tagon
2. Megkeresi azokat, akiknél:
   - A nem mező üres (null) → hiányzik
   - A nem mező ellentmond a keresztnév-heurisztikának → gyanús
3. Összefoglaló: „X tagnál hiányzik a nem adat" / „Y tagnál már kitöltött"
4. Táblázat: név, keresztnév, jelenlegi nem, javasolt nem, döntés dropdown
5. Minden sornál a dropdown: Férfi / Nő / „Ne módosítsa"
6. „Kijelöltek mentése" gomb

### Rendszer reakciók
- Soronkénti UPDATE (`ferfi` mező)
- A memóriában lévő `allMembersData` tömb is frissül
- Összesítő: „X tag frissítve, Y hiba"

### Döntési pontok
- **Minden nem ki van töltve** → „Minden aktív tag esetén meg van adva a nem!" üzenet
- **„Ne módosítsa" opcióval jelölt sorok** → kihagyódnak a mentésből
- **0 módosítandó** → „Nincs módosítandó adat" üzenet

### Végállapotok
- A hiányzó/hibás nem adatok javítva

---

## FLOW 20: Körzetek nyomtatása

### Kiindulási pont
A lelkész a Körzetek fülön a „Nyomtatás" gombra kattint.

### Lépések
1. A rendszer lekérdezi:
   - Körzetek listája
   - Presbiteri bejegyzések (ki melyik körzetért felelős)
   - Családok körzetenkénti bontásban (férj, feleség, cím)
   - Gyerekek (családonként, nemmel és korral)
2. Új böngésző ablak nyílik meg
3. Fejléc: „Presbiteri Körzetek — Gyülekezet neve"
4. Minden körzet:
   - Körzet neve (zöld fejléc)
   - Felelős presbiter(ek) neve és tisztsége
   - Családok táblázata: sorszám, család (férj + feleség), cím, személyek (gyerekek nemmel és korral)
5. „Nyomtatás" gomb

### Végállapotok
- A3/A4 nyomtatható körzeti beosztás
