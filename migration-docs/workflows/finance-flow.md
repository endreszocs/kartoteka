# Pénzügyi modul — Felhasználói folyamatok

---

## FLOW 1: Pénzügy oldal betöltése

### Kiindulási pont
A lelkész a sidebar-ban a „Pénzügy" menüpontra kattint.

### Lépések
1. Az oldal betöltődik 8 fő füllel: Dashboard, Kassza, Bank, Terv, Számadás, Tranzakciók, Tartozások, Monetár
2. Az `initPenzugy()` elindul:
   - Profil + gyülekezet lekérdezés → `activeCongregationId`, `evesJarulek`, `_congNev`
   - Éves beállítás (`bealitas`) keresés az aktuális évre
   - Ha nincs beállítás → éves beállítás létrehozási modal jelenik meg (FLOW 2)
   - Ha van → adatok betöltése:
     - Bankszámlák (`bankszamlak`)
     - Költségvetési tételek (`szamadasicel`, `befizetescel`, `kiadascel`)
     - Kategória map-ek felépítése (`bevCelMap`, `kiaCelMap`)
     - Belső mozgás kategória ID-k (`_bmBevCelIds`, `_bmKiaCelIds`)
     - Összes tag betöltés (`allChurchMembers`)
     - Cím szótár betöltés (`streetCache`, `localityCache`)
     - Éves bevételek és kiadások (`allBefizetes`, `allKiadas`)
     - Átviteli egyenleg számítás (`autoCarryoverCash`, `autoCarryoverBank`)
     - Évenkénti járulék összegek (`_jarulekPerYear`)
     - Járulék kedvezmények (`_jarulekKedvezmenyek`)
     - Cégek/szervezetek (`_savedCompanies`)
3. A Dashboard fül aktív → KPI kártyák + egyenleg banner + friss tranzakciók

### Döntési pontok
- **Nincs éves beállítás** → beállítás létrehozási modal (FLOW 2)
- **Nincs gyülekezet** → üres oldal

### Végállapotok
- Minden adat betöltve, a felhasználó bármely fülre navigálhat

---

## FLOW 2: Éves beállítás létrehozása

### Kiindulási pont
Az aktuális évre nincs `bealitas` rekord az adatbázisban.

### Lépések
1. Modal megjelenik: „Éves Pénzügyi Beállítások — {év}"
2. A lelkész megadja:
   - Éves járulék összeg (RON)
   - Kedvezményes járulék összeg (opcionális)
   - Járulék fizetési határidő (pl. 07-01)
3. Mentés

### Rendszer reakciók
- INSERT `bealitas` az aktuális évre
- Az oldal folytatja az inicializálást (FLOW 1 3. lépés)

### Végállapotok
- Van éves beállítás → a pénzügy oldal teljesen betölt

---

## FLOW 3: Bevétel rögzítés (egyedi mód)

### Kiindulási pont
A lelkész a „+ Új bevétel" gombra kattint (bármely fülön elérhető).

### Lépések
1. Az egységes tranzakció modal megnyílik (Bevétel fülön)
2. A rendszer automatikusan:
   - Betölti az utolsó rögzített dátumot (visszamenőleges ellenőrzéshez)
   - Ajánlja a következő nyugtaszámot
   - Beállítja a mai dátumot
   - Az alapértelmezett összeg a járulék éves összege
3. A lelkész kitölti:
   - **Személy keresés** (3+ karakter → okos keresés, diakritika-normalizálás)
     - Találatok: név + kor + lakcím
     - Kiválasztás → a személy összes adata betöltődik
     - Családtagok megjelennek (ha van család)
   - **VAGY** szabad szöveg (pl. cég neve)
   - **Kategória** (szamadasicel dropdown)
   - **Összeg** (RON, pozitív szám)
   - **Dátum** (mai nap alapértelmezés)
   - **Iratszám** (nyugtaszám — készpénznél kötelező)
   - **Irattípus** (Készpénz VAGY Banki)
   - **Fizetett év** (járuléknál kötelező)
4. Ha több tétel → sorok hozzáadása (pl. járulék + adomány egyszerre)
5. „Mentés" gombra kattint

### Rendszer reakciók
- **Dátum ellenőrzés:**
  - Jövőbeli → piros badge, mentés BLOKKOLVA
  - Visszamenőleges → sárga badge, figyelmeztetés
- **Iratszám ellenőrzés:**
  - Duplikált (DB-ben) → piros badge: „Már létezik!"
  - Kimaradt szám → sárga badge: „Kimaradt: X–Y"
- **Járulék kedvezmény:** ha a tag korra/jövedelemre/időszakra kedvezményt kap → az összeg automatikusan csökken + tájékoztató badge
- **Mentés:** INSERT `befizetes` → ha leltár kategória → INSERT `leltar_tetelek` is
- Tranzakció lista frissül, toast üzenet

### Döntési pontok

**A) Személy kiválasztva → családi összekötés**
- Ha a személynek van családja → a családtagok megjelennek
- Ha a családtagnak is van fizetési kötelezettsége → felajánlja: „Ugyanide rögzítés"

**B) Kategória = járulék (101.01)**
- A „fizetett év" mező kötelezővé válik
- A kedvezmény-rendszer aktiválódik

**C) Kategória = leltár jellegű (beruházás, felszerelés, stb.)**
- A leltár checkbox automatikusan bejelölődik

### Végállapotok
- A bevétel rögzítve, a tranzakció megjelenik a listában

---

## FLOW 4: Bevétel rögzítés (batch/táblázatos mód)

### Kiindulási pont
A lelkész a „Táblázatos mód" gombra kattint a bevétel modal-ban.

### Lépések
1. A nézet átváll táblázatos módra (több sor egyszerre)
2. Minden sor tartalmazza: dátum, személy, kategória, összeg, iratszám, fizetett év
3. A lelkész soronként tölti ki:
   - **Személy kereső** minden sorban (önálló dropdown)
   - **Kategória dropdown** minden sorban
   - **Összeg** (járuléknál az éves összeg alapértelmezés)
   - **Iratszám** (automatikus növekvő ajánlat)
4. **Többéves járulék:** egy személyhez több sor, eltérő évekre (pl. 2024, 2025, 2026)
5. Sorok hozzáadása/eltávolítása dinamikusan
6. **Billentyűzet navigáció:** Tab/Enter → következő mező/sor
7. „Összes mentése" gombra kattint

### Rendszer reakciók
- **Soronkénti validáció:** dátum, iratszám ellenőrzés (valós időben, badge-ekkel)
- **Járulék kedvezmény:** soronként automatikusan alkalmazódik ha aktív kedvezmény
- **Mentés:** az ÖSSZES érvényes sor egyszerre INSERT-álódik (batch insert)
- **Kitöltött sorok száma** valós időben frissül

### Döntési pontok
- **Üres sorok** → kihagyódnak (nem hiba)
- **Hibás sor (pl. jövőbeli dátum)** → piros badge, de a többi sor mentődik
- **Duplikált iratszám** → piros badge, de a mentés nem blokkolódik (figyelmeztetés)

### Végállapotok
- Több bevétel egyszerre rögzítve

---

## FLOW 5: Kiadás rögzítés

### Kiindulási pont
A lelkész a „+ Új kiadás" gombra kattint VAGY a modal-ban a Kiadás fülre vált.

### Lépések
1. A kiadás form megjelenik
2. A lelkész kitölti:
   - **Partner** (személy keresés, cég keresés, VAGY szabad szöveg)
   - **Kategória** (kiadascel dropdown)
   - **Összeg** (RON)
   - **Dátum** (mai nap)
   - **Bizonylatszám** (számla sorszám — opcionális)
   - **Irattípus** (Készpénz/Banki)
3. **Tételes bontás** (opcionális): ha aktiválva → több kategória-sor, összeg részenként
4. „Mentés"

### Rendszer reakciók
- **Dátum ellenőrzés:** ugyanazok a szabályok mint a bevételnél
- **Leltár auto-jelölés:** ha a kategória tartalmazza: „beruházás", „felszerelés", „leltár", „eszköz", „gép", „bútor" → checkbox bejelölődik → mentéskor `leltar_tetelek` INSERT
- **Mentés:** INSERT `kiadas`
- Tranzakció lista frissül

### Döntési pontok
- **Tételes bontás aktív → összeg ellenőrzés:** a részösszegek összege = a fő összeg (eltérés esetén figyelmeztetés)
- **Kategória leltár jellegű → automatikus jelölés:** a felhasználó felülírhatja (kikapcsolhatja)

### Végállapotok
- A kiadás rögzítve, ha leltár jellegű → leltár rekord is létrejött

---

## FLOW 6: Belső mozgás (kassza↔bank)

### Kiindulási pont
A lelkész a „Belső mozgás" gombra kattint.

### Lépések
1. A belső mozgás modal megnyílik
2. **Típus kiválasztás** (4 gomb):
   - Kassza → Bank
   - Bank → Kassza
   - Bank → Bank
   - Valutacsere
3. A forrás és cél dropdown-ok automatikusan töltődnek a típus szerint:
   - Kassza → Bank: forrás = kassza (fix), cél = bankszámlák dropdown
   - Bank → Kassza: forrás = bankszámlák, cél = kassza (fix)
   - Bank → Bank: forrás = bankszámlák, cél = bankszámlák
   - Valutacsere: extra mezők: árfolyam + célösszeg
4. A lelkész megadja:
   - **Összeg** (RON, kötelező)
   - **Dátum** (mai nap)
   - **Megjegyzés** (opcionális)
   - Valutacserénél: **árfolyam** + **célösszeg** (automatikusan számol)
5. „Mentés"

### Rendszer reakciók
1. **UUID generálás:** `belso_mozgas_xkey` (közös azonosító)
2. **Bevétel oldal INSERT:** `befizetes` rekord (a cél kap pénzt)
   - Kategória: 100.01 (ha kassza kap) vagy 100.02 (ha bank kap)
   - Iratszám: `BM-{N}/{év}`
3. **Kiadás oldal INSERT:** `kiadas` rekord (a forrás ad pénzt)
   - Kategória: 100.01 (ha kasszából megy) vagy 100.02 (ha bankból megy)
   - Iratszám: ugyanaz a `BM-{N}/{év}`
4. **Belső mozgás napló INSERT:** `belsomozgas` rekord
5. Valutacserénél: `valuta_atert` rekord is
6. A kassza és bank egyenlegek azonnal frissülnek

### Döntési pontok
- **Nincs aktív bankszámla** → a bank opciók üresek, a modal figyelmeztet
- **Forrás = cél** → validáció blokkolja
- **Valutacsere: azonos pénznem** → figyelmeztetés (nincs értelme)

### Végállapotok
- Két összekapcsolt rekord (bevétel + kiadás) létrejött, a BM sorszámmal

---

## FLOW 7: Költségvetés tervezés és véglegesítés

### Kiindulási pont
A lelkész a „Terv" fülre navigál.

### Lépések
1. A rendszer betölti:
   - A `szamadasicel` hierarchiát (bevétel + kiadás tételek)
   - A meglévő `koltsegvetes` rekordokat (ha korábban mentett)
2. Két oszlopos nézet jelenik meg:
   - **Bal oldal:** Bevétel tételek (1xx kódok)
   - **Jobb oldal:** Kiadás tételek (2xx kódok)
3. Minden tételnél: kód, megnevezés, összeg input mező
4. **Élő egyenleg** alul: bevétel összeg − kiadás összeg → valós időben frissül
5. A lelkész kitölti az összegeket
6. „Véglegesítés és nyomtatás" gombra kattint

### Rendszer reakciók
1. **UPSERT `koltsegvetes`:** minden tételhez (3 oszlopos conflict key: bealitasid + szamadasicelid + congregation_id)
2. **UPDATE `bealitas`:** `budget_finalized = true`
3. **Nyomtatási ablak** automatikusan megnyílik (FLOW 13)
4. A tételek zárolódnak (readonly)

### Döntési pontok

**A) Véglegesítés után szerkesztés szükséges:**
- „Módosítás aktiválása" gomb → revízió mód
- A módosított összegek külön oszlopban jelennek meg (az eredeti megmarad)

**B) Teljes feloldás szükséges (revízió nem elég):**
- „Költségvetés feloldása" gomb → `unlock_requested = true`
- „Várakozás az elbírálásra..." gomb jelenik meg (letiltva)
- Az esperes/admin feloldja → `budget_finalized = false`, `unlock_requested = false`

**C) Élő egyenleg negatív:**
- Motiváló/figyelmeztető üzenet jelenik meg (véletlenszerű a listából)
- A véglegesítés NEM blokkolódik

### Végállapotok
- A költségvetés zárolva, nyomtatva, a tételek nem szerkeszthetők

---

## FLOW 8: Számadás és éves zárás

### Kiindulási pont
A lelkész a „Számadás" fülre navigál.

### Lépések
1. A rendszer betölti:
   - A `koltsegvetes` tervszámait (ha van véglegesített költségvetés)
   - A tényleges bevételeket és kiadásokat (`befizetes`, `kiadas`)
   - Az átviteli egyenlegeket (kassza + bank nyitó)
   - A záró leltár adatait (ha korábban kitöltötte)
2. Megjelenik a **terv vs. tény** összehasonlítás:
   - Bevétel tételek: kód, megnevezés, tervezett összeg, tényleges összeg
   - Kiadás tételek: ugyanaz
   - Összesítő: össz bevétel, össz kiadás, egyenleg
3. **1. lépés: Záró leltár** → modal megnyílik:
   - Kassza fizikai egyenleg (RON)
   - Bank egyenleg (RON)
   - Mentés → `bealitas.szamadas_zaro_adatok` frissül
4. **2. lépés: Véglegesítés** → „Zárszámadás véglegesítése" gomb:
   - `accounting_finalized = true`
   - Nyomtatási ablak megnyílik
5. Időközi (részbeni) nyomtatás bármikor lehetséges (nem hivatalos)

### Döntési pontok

**A) Nincs véglegesített költségvetés:**
- A terv oszlopban 0-k jelennek meg — a tény kitöltődik

**B) Véglegesített számadás szerkesztése:**
- „Feloldás kérelem" gomb → esperes elbírálja

**C) Záró leltár nem egyezik a könyv szerinti egyenleggel:**
- Vizuális jelzés, de nem blokkolja a véglegesítést

### Végállapotok
- A számadás zárolva, nyomtatva

---

## FLOW 9: Kassza (pénztárkönyv) megtekintése

### Kiindulási pont
A lelkész a „Kassza" fülre navigál.

### Lépések
1. A rendszer betölti az összes készpénzes tranzakciót (`irattipus = 'Készpénz'`)
2. Havi bontásban jelenik meg:
   - Nyitó egyenleg (előző hónap záró egyenlege, vagy az átviteli egyenleg ha január)
   - Soronként: dátum, iratszám, megnevezés, bevétel, kiadás
   - Záró egyenleg (nyitó + bevételek − kiadások)
3. Hónap-választó: egy legördülővel váltható a hónap
4. „Pénztárkönyv nyomtatás" gomb → PDF generálás (FLOW 14)

### Döntési pontok
- **Nincs tranzakció az adott hónapban** → „Nincs tranzakció" üzenet
- **Záró egyenleg negatív** → piros kiemelés (elméletileg nem fordulhat elő)

### Végállapotok
- A lelkész áttekinti a kassza forgalmat havi bontásban

---

## FLOW 10: Bank tranzakciók és BCR import

### Kiindulási pont
A lelkész a „Bank" fülre navigál.

### Lépések

**Bank tranzakciók megtekintése:**
1. Bankszámla kiválasztás (dropdown)
2. A rendszer betölti az adott számla tranzakcióit
3. Lista: dátum, megnevezés, bevétel/kiadás, egyenleg

**BCR import:**
1. „BCR import" gombra kattint
2. CSV fájl feltöltése (BCR banki kivonat)
3. A rendszer elemzi a fájlt:
   - Oszlopok auto-detektálás (dátum, összeg, partner, leírás)
   - Preview táblázat megjelenítés
4. A lelkész ellenőrzi és módosíthatja a kategóriákat
5. „Import végrehajtás" → INSERT `befizetes`/`kiadas` rekordok

### Döntési pontok
- **Ismeretlen CSV formátum** → hiba üzenet, preview nem jelenik meg
- **Partner felismert** → automatikus kategória ajánlat (fuzzy match)
- **Duplikált tranzakciók** → nincs automatikus szűrés, a felhasználó dönt

### Végállapotok
- A banki tranzakciók importálva, a listák frissülnek

---

## FLOW 11: Tartozások elemzése

### Kiindulási pont
A lelkész a „Tartozások" fülre navigál.

### Lépések
1. **Évtartomány szűrő** beállítása (alapértelmezés: előző év − aktuális év)
2. A rendszer 7 párhuzamos lekérdezést indít:
   - Járulék befizetések (101.01 kód, az évtartományban)
   - Bérleti befizetések (104.04–05 kódok)
   - Bérleti szerződések
   - Felmentések
   - Évenkénti járulék összegek (bealitas)
   - Gyülekezet tartozás-számítási módja (akkori/aktuális)
   - Kedvezmények
3. **Járulék hátralék** számítás személyenként:
   - Elvárt = járulék × évek (kedvezményekkel csökkentve, felmentetteket kihagyva)
   - Fizetett = tényleges befizetések összege
   - Hátralék = elvárt − fizetett
4. **Bérleti hátralék** számítás szerződésenként:
   - Elvárt = összeg × gyakoriság × időszak
   - Fizetett = tényleges befizetések
   - Hátralék = elvárt − fizetett
5. Táblázat megjelenítés: személy neve, évenkénti elvárt/fizetett, hátralék

### Döntési pontok

**Tartozás számítási mód:**
- **„Akkori"** → az adott év érvényes járulékával számol (pl. 2023: 80 RON)
- **„Aktuális"** → a mai járulékkal számol minden évre (pl. 100 RON)
- A mód a `congregations.tartozas_szamitas_mod` mezőben van beállítva

**Felmentett személy:**
- Nem jelenik meg a hátralékos listán

**Túlfizetés:**
- Negatív hátralék → zöld „Túlfizetés" jelzés

### Végállapotok
- A lelkész áttekinti ki mennyit tartozik (személyenként, évente)

---

## FLOW 12: Bérleti szerződés kezelése

### Kiindulási pont
A lelkész a Tartozások fülön a „Bérleti szerződések" szekcióba navigál.

### Lépések

**Létrehozás:**
1. „+ Új szerződés" gomb → modal megnyílik
2. Bérlő típus: **személy** (tag keresés) VAGY **cég** (szabad szöveg + adószám)
3. Kitöltés: összeg, időszak (kezdet-vég), gyakoriság (havi/negyedéves/féléves/éves)
4. Mentés → INSERT `berleti_szerzodes`

**Szerkesztés / Törlés:**
- Sor melletti gombok → modal megnyílik előtöltve, VAGY soft delete

### Döntési pontok
- **Bérlő = személy** → tag keresés (okos kereső)
- **Bérlő = cég** → szabad szöveg + opcionális adószám

### Végállapotok
- A szerződés megjelenik a tartozás elemzésben (elvárt összeg számításhoz)

---

## FLOW 13: Költségvetés nyomtatása

### Kiindulási pont
A véglegesítés automatikusan megnyitja VAGY a „Nyomtatás" gombra kattint.

### Lépések
1. Nyomtatási modal megnyílik
2. A rendszer a `szamadasicel` hierarchia alapján felépíti a nyomtatási nézetet:
   - **4 oszlopos layout:** sorszám, megnevezés, kód, összeg
   - **VAGY 6 oszlopos:** + módosított összeg + megjegyzés (ha revízió volt)
   - Hierarchikus rendezés (főkategória → alkategória → részlet)
   - Bevétel és kiadás blokkok szekció-fejlécekkel
   - Összesítő sor: össz bevétel, össz kiadás, egyenleg
3. „Nyomtatás" gomb → böngésző nyomtatás
4. **Iktatás:** a dokumentum automatikusan regisztrálódik az `iktato` táblában (sorszám generálás)
5. Újranyomtatás nem iktatódik újra

### Végállapotok
- A költségvetés nyomtatva és iktatva

---

## FLOW 14: Pénztárkönyv (kassza) nyomtatása

### Kiindulási pont
A lelkész a Kassza fülön a „Nyomtatás" gombra kattint.

### Lépések
1. A rendszer az adott hónapra szűri a készpénzes tranzakciókat
2. PDF generálás (html2pdf.js):
   - Fejléc: gyülekezet neve, hónap, év
   - Nyitó egyenleg
   - Sorok: dátum, iratszám, megnevezés, bevétel, kiadás, egyenleg
   - Záró egyenleg
   - Aláírás mezők
3. Letöltés VAGY nyomtatás

### Végállapotok
- A pénztárkönyv PDF letöltve/nyomtatva

---

## FLOW 15: Számadás nyomtatása

### Kiindulási pont
A véglegesítéskor automatikusan VAGY „Nyomtatás" gombra kattintva.

### Lépések
1. A rendszer felépíti:
   - **5 oszlopos layout:** sorszám, megnevezés, kód, tervezett összeg, tényleges összeg
   - Bevétel és kiadás blokkok
   - Szekció-fejlécek (100: Vagyon, 200: Kiadások, stb.)
   - Összesítők: össz bevétel, össz kiadás, egyenleg
   - Záró leltár adatok (kassza + bank)
2. Két mód:
   - **Időközi (részbeni)** — „Nem hivatalos" felirattal
   - **Végleges** — „Hivatalos" pecsét (véglegesítés után)
3. Iktatás (ha végleges)

### Végállapotok
- A számadás nyomtatva (időközi VAGY végleges)

---

## FLOW 16: Tranzakció törlése

### Kiindulási pont
A lelkész a Tranzakciók fülön egy tétel „Törlés" gombjára kattint.

### Lépések
1. Megerősítő kérdés
2. Jóváhagyás → a rendszer soft delete-et hajt végre (`deleted = true`)
3. A tétel eltűnik a listáról

### Döntési pontok
- **Belső mozgás törlése:** mindkét oldal (bevétel + kiadás) is `deleted = true` lesz (a `belso_mozgas_xkey` alapján)
- **A törlés nem vonható vissza** a felületen

### Végállapotok
- A rekord megmarad az adatbázisban (`deleted = true`), de a felületen nem jelenik meg

---

## FLOW 17: Sorszám audit (hiányzó nyugták)

### Kiindulási pont
A rendszer automatikusan ellenőrzi a sorszámokat (badge a fejlécben).

### Lépések
1. A rendszer végigmegy az összes bevétel iratszámán (az aktuális évre)
2. Kivonja a számot (regex: `/(\d+)/`)
3. Megkeresi a hiányzó számokat a sorozatban (pl. 1, 2, 4 → hiányzik: 3)
4. Ha van hiány → piros badge a fejlécben: „X hiányzó sorszám"

### Döntési pontok
- **BM- prefixű sorszámok** → kihagyódnak (külön számsor)
- **Nincs hiány** → a badge eltűnik
- **„Normalizálás" gomb** → automatikusan kitölti a hiányzó sorszámokat (ures rekordokkal)

### Végállapotok
- A lelkész értesül a hiányokról, és szükség esetén normalizálja

---

## FLOW 18: Párosítatlan befizetések összekötése (audit)

### Kiindulási pont
A SzuperAdmin a „Párosítatlan befizetések" gombra kattint.

### Lépések
1. A rendszer megkeresi az összes `befizetes` rekordot ahol `id_szemely = NULL`
2. Minden rekordnál a `forrasa` mező elemzése:
   - **Szétbontás:** „Kovács István - Fő út 12" → név: „Kovács István", utca: „Fő út 12"
   - **Magyar asszonynév felismerés:**
     - „Kovácsné" → keresés: „Kovács" családnév
     - „Kovács Istvánné Erzsébet" → keresés: „Kovács Erzsébet"
     - „Becsek Richárdné Stefán Beáta" → keresés: „Stefán Beáta" (lánykori)
   - **Prefix eltávolítás:** „ifj.", „id.", „dr.", „özv."
3. Keresés a tagnyilvántartásban (pontozásos rendszer)
4. Találatok megjelenítése: 1–3 ajánlat soronként
5. A felhasználó kiválasztja VAGY kézi kereséssel talál
6. „Összes mentése" → UPDATE `befizetes.id_szemely` a kiválasztott tagokhoz

### Döntési pontok
- **Nincs `forrasa` mező** → kézi keresés szükséges
- **Több találat** → a felhasználó választ a listából
- **Nincs találat** → „Nincs egyezés" üzenet, kézi kereső felajánlva

### Végállapotok
- A korábban párosítatlan befizetések személyekhez kötve

---

## FLOW 19: Monetár (pénztári egyeztetés)

### Kiindulási pont
A lelkész a „Monetár" fülre navigál.

### Lépések
1. Címlet-táblázat megjelenik:
   - 500 RON, 200 RON, 100 RON, 50 RON, 10 RON, 5 RON, 1 RON
   - 0,50 RON, 0,10 RON, 0,05 RON, 0,01 RON
2. A lelkész beírja minden címletnél a **darabszámot**
3. A rendszer kiszámítja:
   - Fizikai egyenleg = Σ (címlet × darab)
   - Könyv szerinti egyenleg (a kassza tranzakciókból)
   - Eltérés = fizikai − könyv szerinti

### Döntési pontok
- **Egyezik (eltérés = 0)** → zöld: „Egyezik!"
- **Eltérés ≤ 0,01 RON** → zöld: kerekítési eltérés
- **Eltérés > 0,01 RON** → piros: az eltérés összege kijelezve

### Végállapotok
- A pénztári egyeztetés eredménye látható (nincs mentés — pillanatfelvétel)

---

## FLOW 20: Valutacsere

### Kiindulási pont
A lelkész a belső mozgás modal-ban a „Valutacsere" típust választja.

### Lépések
1. A forrás dropdown: bankszámlák (pl. RON számla)
2. A cél dropdown: bankszámlák (pl. EUR számla)
3. Extra mezők megjelennek:
   - **Árfolyam** (kézi bevitel VAGY BNR API lekérés)
   - **Célösszeg** (automatikusan számol: forrás × árfolyam)
4. A lelkész ellenőrzi és ment

### Rendszer reakciók
1. Kettős bejegyzés (mint a normál belső mozgás):
   - `befizetes`: a cél számla kap (EUR)
   - `kiadas`: a forrás számla ad (RON)
   - `belso_mozgas_xkey`: közös UUID
2. `valuta_atert` rekord INSERT (árfolyam naplózás)

### Döntési pontok
- **BNR API nem elérhető** → kézi árfolyam bevitel (fallback)
- **Azonos pénznem mindkét oldalon** → figyelmeztetés (nincs értelme)

### Végállapotok
- A valutacsere rögzítve, mindkét számla egyenlege frissül
