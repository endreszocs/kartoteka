# Dashboard — Felhasználói folyamatok

---

## FLOW 1: Dashboard oldal betöltése

### Kiindulási pont
A lelkész sikeresen bejelentkezett és a gyülekezeti irányítópultra navigál (vagy automatikusan ide irányítódik).

### Lépések
1. Az oldal megnyílik
2. A Hero Banner **azonnal** megjelenik — nem vár adatbázisra:
   - Napszaknak megfelelő üdvözlés a lelkész családnevével
   - Mai dátum magyarul (pl. „2026. Április 5. — szombat")
   - Gyülekezet neve
   - Mai névnapok a bannerben
3. A háttérben **10 párhuzamos adatlekérdezés** indul:
   - Összes tag (nem elhunyt)
   - Elköltözöttek listája
   - Családok száma
   - Bevételek (utolsó ~14 hónap)
   - Kiadások (utolsó ~14 hónap)
   - Fizetők száma (idén)
   - Presbiterek száma
   - Névnap tábla (365 sor)
   - Heti munkanapló bejegyzések száma
   - Legutóbbi 10 munkanapló bejegyzés
4. A lekérdezések eredménye egy **közös adatobjektumba** kerül
5. **6 szekció párhuzamosan frissül** (már nincs hálózati hívás):
   - KPI kártyák
   - Születésnapok és névnapok
   - Diagramok (bevétel/kiadás + koreloszlás)
   - Gyülekezeti programszervező (ez külön lekérdezést indít)
   - Friss bejegyzések
   - Alsó statisztikák

### Rendszer reakciók
- A Hero Banner ~0 ms alatt megjelenik (nincs adatbázis-várakozás)
- A KPI kártyák és listák a párhuzamos lekérdezések befejeztével töltődnek (tipikusan <1 mp)
- A diagramok a chart könyvtár betöltése után renderelődnek (lazy load)
- A programszervező az aktuális hónapot mutatja alapértelmezetten

### Döntési pontok
- **Van-e gyülekezete a felhasználónak?**
  - IGEN → a gyülekezeti dashboard töltődik be
  - NEM → kerületi vagy egyházmegyei dashboardra irányít (szerepkör szerint)

### Végállapotok
- A lelkész egy teljes áttekintést lát a gyülekezetéről: tagok, pénzügyek, közelgő események, programok

---

## FLOW 2: Mai születésnaposok és névnaposok megtekintése

### Kiindulási pont
A dashboard betöltődött, a „Ma köszöntjük" szekció megjelenik.

### Lépések
1. A rendszer megkeresi az aktív tagok közül azokat, akiknek a születési dátumának hónap-nap része megegyezik a mai nappal
2. Minden találatnál kiírja a nevet és az életkort (pl. „Nt. Kovács János — 45 éves")
3. A névnap táblából kikeresi a mai naphoz tartozó neveket (max 3)
4. Ezeket a neveket egyezteti az aktív tagok **keresztnevével** (`k_nev`)
5. Ha van egyező tag → megjelenik névnaposként
6. Ha nincs egyező tag → „Ma: *Nevek* — nincs érintett tag."

### Rendszer reakciók
- A születésnap kártya torta ikont kap, az életkor badge-ben jelenik meg
- A névnap kártya rozetta ikont kap
- A „Következő 14 nap" szekció a közeljövő születésnapjait mutatja

### Döntési pontok

**Születésnap:**
- Van születésnapos ma → lista megjelenik
- Nincs → „Ma nincs születésnapos." üzenet

**Névnap:**
- Van névnap a táblában ÉS van egyező tag → névnapos tag lista
- Van névnap de nincs egyező tag → nevek felsorolása „nincs érintett tag" megjegyzéssel
- Nincs névnap a táblában a mai napra → „—"

**Következő 14 nap:**
- Vannak közelgő születésnapok → lista (legközelebbi elöl)
- Nincsenek → „A következő 14 napban nincs születésnap."
- 1 nap múlva = „holnap" felirat
- 2-3 nap = **piros** sürgős badge
- 4-14 nap = narancs badge

### Végállapotok
- A lelkész látja, kit kell ma köszönteni, és kinek lesz hamarosan születésnapja

---

## FLOW 3: Program létrehozás (egyedi)

### Kiindulási pont
A lelkész a programszervező szekcióban az „Új program" gombra kattint, VAGY a mini naptárban egy napra kattint.

### Lépések
1. A program modal megnyílik üres mezőkkel
   - Ha naptár-napra kattintott → a dátum mező előtöltődik az adott nappal
   - Ha az „Új program" gombra kattintott → a dátum mező üres
2. A modal címe: „Új program"
3. A lelkész kitölti a mezőket:
   - **Cím** (kötelező)
   - **Dátum** (kötelező)
   - Záró dátum (opcionális — többnapos eseményekhez)
   - Időpont kezdés és befejezés (opcionális)
   - Helyszín (opcionális)
   - **Típus** (kötelező — legördülő, 16 lehetőség)
   - **Prioritás** (kötelező — alacsony / normál / fontos / kiemelt)
   - Ismétlődés (opcionális — heti / kétheti / havi)
   - Megjegyzés (opcionális)
4. Ha a típus = „egyéb" → két új mező jelenik meg:
   - Egyedi típus név (szabad szöveg)
   - Egyedi emoji (64 elemű emoji picker-ből választható)
5. A lelkész a „Mentés" gombra kattint

### Rendszer reakciók
- Mentés gomb → „Mentés..." állapotra vált (letiltva, pörgő ikon)
- A rendszer automatikusan hozzáfűzi:
  - A bejelentkezett felhasználó azonosítóját (`letrehozta_id`)
  - A felhasználó nevét (`letrehozta_nev`)
  - A gyülekezet azonosítóját (`congregation_id`)
  - Az aktuális időbélyeget (`updated_at`)
- Sikeres mentés → modal bezárul, programszervező teljes újratöltés (naptár, lista, hónap-fülek)
- Sikertelen mentés → hibaüzenet alert-ben, modal nyitva marad

### Döntési pontok

**A) Cím üres**
- „Add meg a program nevét!" figyelmeztetés → mentés nem történik

**B) Dátum üres**
- „Add meg a dátumot!" figyelmeztetés → mentés nem történik

**C) Záró dátum < kezdő dátum**
- „A záró dátum nem lehet a kezdő dátum előtt!" figyelmeztetés → mentés nem történik

**D) Minden rendben**
- Mentés az adatbázisba → siker → modal bezárul

**E) Adatbázis hiba**
- Hibaüzenet a hiba részleteivel

### Végállapotok
- A program megjelenik a naptárban az adott napon (típus-színű pont)
- A hónap-fül badge-e frissül (pl. „0/0" → „0/1")
- A mini listában megjelenik időrendben

---

## FLOW 4: Program szerkesztés

### Kiindulási pont
A lelkész a mini program listában egy meglévő programra kattint.

### Lépések
1. A program modal **szerkesztés módban** nyílik meg
2. A modal címe: „Program szerkesztése"
3. Minden mező előtöltődik a meglévő adatokból:
   - Cím, dátum, záró dátum, időpontok, helyszín, típus, prioritás, ismétlődés, megjegyzés
   - Ha típus = „egyéb" → egyedi típusnév és emoji is előtöltődik, és a mezők láthatóak
4. A lelkész módosítja a kívánt mezőket
5. „Mentés" gombra kattint

### Rendszer reakciók
- A rendszer UPDATE-et hajt végre (nem INSERT) — a program ID alapján azonosít
- A `created_at`, `letrehozta_id`, `letrehozta_nev`, `congregation_id` mezők NEM változnak
- Az `updated_at` frissül az aktuális időbélyegre
- A programszervező újratöltődik

### Döntési pontok
- Ugyanazok a validációk érvényesek mint létrehozásnál (cím kötelező, dátum kötelező, záró ≥ kezdő)
- A mentés gomb letiltódik a művelet idejére (dupla kattintás védelem)

### Végállapotok
- A program frissült adatai megjelennek a naptárban és a listában
- Ha a dátum változott → a program „átköltözik" a naptárban

---

## FLOW 5: Program teljesítve jelölés

### Kiindulási pont
A lelkész a mini listában egy program mellett a teljesítve pipa ikonra kattint.

### Lépések
1. A rendszer beállítja:
   - `teljesitett = true`
   - `teljesites_datum = aktuális időpont`
2. A programszervező újratöltődik

### Rendszer reakciók
- A program címe a listában áthúzott stílusban jelenik meg
- A hónap-fül badge-e frissül (pl. „2/5" → „3/5")
- Ha az adott hónapban MINDEN program teljesítve → a badge zöld hátteret kap

### Döntési pontok

**Visszavonás:**
- Ha a program már teljesítettnek van jelölve és újra a pipára kattint:
  - `teljesitett = false`
  - `teljesites_datum = null`
  - Az áthúzás eltűnik, a badge visszaszámol

### Végállapotok
- A program teljesítve/nem teljesítve státusza frissült

---

## FLOW 6: Program törlés

### Kiindulási pont
A lelkész a mini listában egy program mellett a törlés ikonra kattint.

### Lépések
1. Megerősítő kérdés: „Biztosan törlöd ezt a programot?"
2. A lelkész válaszol

### Döntési pontok

**A) Megerősíti (OK)**
- A program végleges törlődik az adatbázisból
- A programszervező újratöltődik
- A naptár pont eltűnik
- A lista frissül
- A hónap-fül badge frissül

**B) Mégsem (Cancel)**
- Semmi nem történik

### Rendszer reakciók
- Sikertelen törlés → „Törlési hiba!" alert

### Végállapotok
- A program véglegesen eltűnt — **visszavonás nincs**

---

## FLOW 7: Tömeges (batch) program bevitel

### Kiindulási pont
A lelkész a programszervező szekcióban a „Gyors bevitel" gombra kattint.

### Lépések
1. Modal megnyílik egy **10 soros táblázattal**
2. Minden sorban: cím, dátum, záró dátum, idő kezdés, idő befejezés, típus, helyszín, prioritás, ismétlődés, törlés gomb
3. Az első sor cím mezőjére automatikus fókusz
4. A lelkész kitölti a sorokat
5. **Navigáció billentyűzettel:**
   - Enter a cím mezőben → ugrás a következő sor cím mezőjére
   - Ha az utolsó sorban Enter → automatikus új sor hozzáadás + fókusz
6. „+5 sor" vagy „+10 sor" gombokkal bővíthető a táblázat
7. Az „X" gombbal egyedi sorok törölhetők
8. A kitöltött sorok számát valós időben mutatja (pl. „7 kitöltött sor")
9. „Összes mentése" gombra kattint

### Rendszer reakciók

**Validáció (soronként):**
- Üres cím ÉS üres dátum → sor kihagyása (nem hiba)
- Cím kitöltve, dátum üres → hiba: „X. sor: hiányzó dátum"
- Dátum kitöltve, cím üres → hiba: „X. sor: hiányzó programnév"
- Záró dátum < kezdő dátum → hiba: „X. sor: záró dátum a kezdő dátum előtt"

**Ha van legalább egy hiba:**
- Az ÖSSZES hiba egyszerre jelenik meg (alert, soronkénti felsorolás)
- Mentés NEM történik
- A modal nyitva marad, a felhasználó javíthat

**Ha nincs hiba de nincs érvényes sor sem:**
- „Nincs kitöltött sor a mentéshez!" alert

**Ha minden rendben:**
- Mentés gomb → „Mentés (N program)..." állapotra vált
- A rendszer minden érvényes sorhoz automatikusan hozzáfűzi:
  - A bejelentkezett felhasználó azonosítóját és nevét
  - A gyülekezet azonosítóját
- Egyetlen tömeges INSERT az adatbázisba
- Siker → „✅ N program sikeresen mentve!" alert → modal bezárul → programszervező újratöltődik
- Hiba → hibaüzenet alert-ben, modal nyitva marad

### Döntési pontok
- A validáció „mindent vagy semmit" logikával működik — ha 1 sor hibás, egyetlen sor sem mentődik

### Végállapotok
- Az összes érvényes program megjelent a naptárban és a listában
- A hónap-fülek badge-ei frissültek

---

## FLOW 8: Hónapváltás és év-váltás

### Kiindulási pont
A lelkész a programszervező mini naptárjánál a balra/jobbra nyílra kattint, VAGY egy hónap-fülre kattint, VAGY az év-választó legördülőt változtatja.

### Lépések (nyíl-navigáció)
1. A lelkész a balra nyílra kattint (előző hónap) vagy jobbra nyílra (következő hónap)
2. A rendszer kiszámítja az új hónapot

### Döntési pontok

**Ugyanazon éven belül:**
- A mini naptár és lista az új hónapra frissül
- Nincs adatbázis-lekérdezés (az egész év már a memóriában van)

**Év-átlépés előre (decemberből január):**
- Az év-választó automatikusan a következő évre ugrik
- Az egész év adatai újratöltődnek az adatbázisból
- Januártól indul a megjelenítés

**Év-átlépés hátra (januárból december):**
- Az év-választó automatikusan az előző évre ugrik
- Az egész év adatai újratöltődnek az adatbázisból
- Decembertől indul a megjelenítés

### Lépések (hónap-fül kattintás)
1. A lelkész a 12 hónap-fül egyikére kattint
2. A mini naptár és lista az adott hónapra frissül
3. Nincs adatbázis-lekérdezés

### Lépések (év-választó)
1. A lelkész az év-választó legördülőből egy évet választ
2. Az egész év adatai újratöltődnek az adatbázisból
3. Ha az aktuális évet választotta → az aktuális hónap jelenik meg
4. Ha más évet választott → január jelenik meg

### Rendszer reakciók
- Az aktív fül kijelölést kap
- A hónap felirat frissül (pl. „Április 2026")
- A hónap-füleken a badge-ek tükrözik a teljesítettséget (pl. „3/5")
- Az aktuális hónap füle „today" jelölést kap (ha az aktuális évet nézzük)

### Végállapotok
- A lelkész a kívánt hónap naptárját és program listáját látja

---

## FLOW 9: Éves programterv nyomtatás

### Kiindulási pont
A lelkész a programszervező szekcióban az „Éves terv nyomtatás" gombra kattint.

### Lépések
1. Új böngésző ablak nyílik meg
2. A rendszer a memóriában lévő programadatokból (aktuálisan betöltött év) felépíti:
   - **Fejléc:** kereszt szimbólum, gyülekezet neve nagybetűvel, „Tervezett egyházi év", év badge-ben, összesített programszám
   - **Fő táblázat:** 12 hónap egymás mellett, oszloponként a hét napjai (H-V), napi cellákban:
     - Napszám
     - Ha van program: emoji + cím (ha több van: „+N")
     - Vasárnap: piros háttér
     - Szombat: sárga háttér
     - Mai nap: zöld kiemelés
   - **Jelmagyarázat:** csak a ténylegesen használt típusok (szín pont + emoji + típusnév)
   - **Lábléc:** „Készült: mai dátum" | „Gyülekezet név — Év. évi programterv" | „Kartotéka Egyházi Nyilvántartási Rendszer"
3. A felső műveleti sáv megjelenik (NEM nyomtatódik):
   - „Nyomtatás" gomb → böngésző nyomtatási párbeszédablak
   - „Mentés PDF" gomb → html2pdf generálás és letöltés
   - „Bezárás" gomb → ablak bezárás

### Rendszer reakciók
- Az oldal A3 fekvő formátumra van optimalizálva (`@page { size: A3 landscape; margin: 8mm; }`)
- A műveleti sáv `@media print` CSS-sel rejtve van nyomtatáskor
- A PDF fájlnév: „Gyülekezet neve — Éves programterv Év.pdf"
- A PDF generálás a html2pdf.js könyvtárat használja (CDN-ről a nyomtatási ablakban töltődik)

### Döntési pontok

**Az évben nincs egyetlen program sem:**
- A naptár üres cellákkal jelenik meg
- Fejléc: „Összesen 0 tervezett program"
- A jelmagyarázat üres

**A gyülekezet neve nem elérhető:**
- Alapértelmezett „Gyülekezet" szöveg jelenik meg

**A html2pdf nem töltődik be:**
- A „Mentés PDF" gomb nem működik
- A „Nyomtatás" gomb továbbra is használható (böngésző natív)

### Végállapotok
- A lelkész kinyomtatta vagy PDF-ben elmentette az éves programtervet
- A nyomtatási ablak a „Bezárás" gombbal vagy manuálisan zárható

---

## FLOW 10: Egyedi emoji választás programhoz

### Kiindulási pont
A lelkész a program modal-ban a típust „egyéb"-re állítja.

### Lépések
1. A típus legördülőben az „Egyéb" opciót választja
2. Két új mező jelenik meg:
   - „Egyedi típus neve" — szabad szöveges mező
   - „Egyedi emoji" — szöveges mező + emoji picker gomb
3. Ha az emoji picker gombra kattint → 64 elemű emoji rács jelenik meg
4. Egy emojira kattint → az emoji bekerül a mezőbe
5. Az emoji picker automatikusan bezárul
6. VAGY: ha az emoji picker-en kívülre kattint → az picker bezárul

### Rendszer reakciók
- Az emoji picker rács **csak az első megnyitáskor** épül fel (lusta inicializálás)
- A kiválasztott emoji a naptárban és a listában a típus-emoji helyén jelenik meg
- Ha nincs emoji választva → az alapértelmezett „📌" jelenik meg

### Döntési pontok
- A típust visszaváltja valami másra (nem „egyéb") → az egyedi mezők eltűnnek, az értékeik `null`-ra állnak mentéskor

### Végállapotok
- A program egyedi emojival és típusnévvel jelenik meg mindenhol (naptár, lista, nyomtatás)

---

## FLOW 11: KPI kártyák és alsó statisztikák megtekintése

### Kiindulási pont
A dashboard betöltődött, a KPI kártyák és az alsó statisztikai sáv megjelenik.

### Lépések (automatikus — nincs felhasználói interakció)

**KPI kártyák (4 db):**
1. **Aktív tagok:** összes személy − elhunytak − elköltözöttek = szám
2. **Családok:** az összes család rekord száma
3. **Havi bevétel:** az aktuális naptári hónap összes bevételének összege RON-ban (magyar számformátummal)
4. **Heti események:** az aktuális hét (hétfő–vasárnap) munkanapló bejegyzéseinek száma

**Alsó statisztikák (7 adat):**
1. **Férfiak:** aktív tagok ahol `ferfi = true` ÉS kor ≥ 18
2. **Nők:** aktív tagok ahol `ferfi = false` ÉS kor ≥ 18
3. **Gyermekek:** aktív tagok ahol kor < 18 (nemtől függetlenül)
4. **Átlagéletkor:** az összes aktív tag átlagos kora (kerekítve)
5. **Fizetők idén:** azon bevételi rekordok száma ahol a fizetett év = aktuális év
6. **Presbiterek:** presbiter táblából a rekordok száma
7. **Egyenleg:** összes bevétel − összes kiadás (RON, utolsó ~14 hónap)

### Döntési pontok

**Nincs adat (üres gyülekezet):**
- Számok helyett „—" jelenik meg
- Kivétel: havi bevétel → „0" (nem „—")

**Nincs születési dátum egy tagnál:**
- Nem számít a koreloszlásba és az átlagéletkorba
- Az alsó statisztikában **nőként** kategorizálódik (alapértelmezett)

### Végállapotok
- A lelkész egy pillanat alatt átlátja a gyülekezet legfontosabb mutatóit

---

## FLOW 12: Diagramok megtekintése

### Kiindulási pont
A dashboard betöltődött, a diagramok szekció renderelődik.

### Lépések (automatikus)

**Bevétel vs Kiadás oszlopdiagram:**
1. A rendszer az utolsó 8 hónapot veszi (az aktuálist beleértve)
2. Minden hónapra kiszámítja:
   - Hónap összes bevételének összege (RON)
   - Hónap összes kiadásának összege (RON)
3. Oszlopdiagram: zöld = bevétel, piros = kiadás
4. X tengely: hónap-rövidítések + év (pl. „Már 2026")
5. Y tengely: összeg RON-ban (magyar számformátum)
6. Tooltip: pontos összeg

**Koreloszlás fánkdiagram:**
1. A rendszer minden aktív tagot besorol 5 korcsoportba:
   - 0–17, 18–35, 36–60, 61–80, 80+
2. Az életkor az aktuális évből vonja ki a születési évet (nem pontos napi szint)
3. Nincs születési dátum → a tag kimarad a diagramból
4. A diagram a csoportok létszámát mutatja (fő)
5. A közepén lyuk (donut stílus)

### Döntési pontok

**A chart könyvtár nem töltődik be:**
- A diagramok helyén semmi nem jelenik meg (nem hibaüzenet — csendben nem renderel)

**Nincs pénzügyi adat:**
- Az oszlopdiagram üres (0-s oszlopok)

**Nincs egyetlen tag sem születési dátummal:**
- A fánkdiagram üres

### Végállapotok
- A lelkész vizuálisan áttekintheti a pénzügyi trendeket és a koreloszlást
