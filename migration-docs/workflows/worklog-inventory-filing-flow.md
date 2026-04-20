# Munkanapló + Leltár + Iktatás — Felhasználói folyamatok

---

# A) MUNKANAPLÓ

---

## FLOW 1: Munkanapló oldal betöltése

### Kiindulási pont
A lelkész a sidebar-ban a „Munkanapló" menüpontra kattint.

### Lépések
1. Az oldal betöltődik 3 kategória füllel: Szolgálat, Katekézis, Látogatás
2. Alapértelmezett fül: **Szolgálat**
3. Alapértelmezett hónap: **aktuális hónap**
4. A rendszer lekérdezi az aktuális hónap bejegyzéseit a `munkanaplo` táblából
5. A táblázat megjelenik: dátum, típus, cím, résztvevők, perselypénz

### Döntési pontok
- **Nincs bejegyzés az adott hónapban** → „Nincs bejegyzés" üzenet
- **Hónap váltás** → az adatok újratöltődnek

### Végállapotok
- A lelkész az aktuális hónap bejegyzéseit látja a kiválasztott kategóriában

---

## FLOW 2: Munkanapló bejegyzés rögzítése

### Kiindulási pont
A lelkész a „+ Új bejegyzés" gombra kattint.

### Lépések
1. A bejegyzés modal megnyílik
2. A form mezők **dinamikusan változnak** a kiválasztott kategória szerint:

**Szolgálat:**
- Dátum, típus (istentisztelet/igehirdetés/úrvacsora/stb.), cím
- Résztvevők: férfi szám, nő szám, gyermek szám
- Perselypénz (RON)
- Igehely (bibliai hivatkozás)
- Szolgálatvezetők neve

**Katekézis:**
- Dátum, típus (bibliaóra/hittan/konfirmáció előkészítő/stb.), cím
- Résztvevők: férfi szám, nő szám, gyermek szám

**Látogatás:**
- Dátum, típus (családlátogatás/kórházlátogatás/stb.), cím
- Meglátogatott személy/család keresés (tagnyilvántartásból)
  - Kiválasztás → a cím automatikusan töltődik
  - VAGY szabad szöveges név (ha nincs a rendszerben)

3. Leírás, megjegyzés (mindhárom kategóriánál)
4. „Mentés"

### Rendszer reakciók
- INSERT `munkanaplo` (dátum, jellege, cím, résztvevők, persely, stb.)
- `congregation_id` profilból
- A lista frissül, a bejegyzés megjelenik

### Döntési pontok
- **Kategória váltás a modalon belül** → a form mezők átrendeződnek
- **Látogatás: személy nincs a rendszerben** → szabad szöveges név (id_szemely = null)

### Végállapotok
- A bejegyzés rögzítve

---

## FLOW 3: Anyakönyvi trigger — automatikus munkanapló bejegyzés

### Kiindulási pont
Az anyakönyv modulban a „Rögzítés a munkanaplóba" checkbox bejelölve, és a bejegyzés mentődik.

### Lépések
1. Az anyakönyvi mentés sikeres
2. A rendszer meghívja: `triggerWorklogFromRegistry(forrás, id, dátum, típus, szöveg)`
3. A munkanaplo táblába INSERT:
   - Szolgálat kategória
   - jellege: „Keresztelő" / „Esketés" / „Temetés"
   - dátum: az anyakönyvi esemény dátuma
   - cím: az alapige (keresztelésnél) vagy leírás
4. A munkanaplo bejegyzés ID visszakerül az anyakönyvi rekordba (`munkanaplo_id`)

### Döntési pontok
- **A munkanapló modul nincs betöltve** → try-catch, csendben nem fut le
- **A checkbox nincs bejelölve** → nem hívódik meg

### Végállapotok
- A munkanapló bejegyzés automatikusan létrejött, összekötve az anyakönyvi rekorddal

---

## FLOW 4: Egyházmegyei jelentés generálás

### Kiindulási pont
A lelkész a „Jelentés" gombra kattint.

### Lépések
1. A rendszer összegyűjti az adott időszak (év/hónap) statisztikáit:
   - **II. szekció:** Szolgálatok száma, átlagos részvétel (nemek szerint), perselypénz összesítés
   - **IV. szekció:** Katekézis alkalmak, átlagos részvétel
   - **V. szekció:** Látogatások száma, típus szerinti bontás
   - **VII. szekció:** Összesítés
2. A jelentés formázott HTML-ben jelenik meg (új ablakban)
3. Nyomtatás gomb

### Végállapotok
- A lelkész ki tudja nyomtatni az egyházmegyei beszámolót

---

## FLOW 5: Munkanapló nyomtatás és Excel export

### Kiindulási pont
A lelkész a „Nyomtatás" vagy „Excel" gombra kattint.

### Lépések

**Nyomtatás:**
1. A szűrt (hónap + kategória) bejegyzések formázott HTML táblázatban
2. Új nyomtatási ablak → böngésző nyomtatás

**Excel export:**
1. A szűrt bejegyzések CSV formátumban
2. Oszlopok: dátum, típus, cím, résztvevők, persely, megjegyzés
3. Letöltés

### Végállapotok
- Nyomtatva vagy exportálva

---

# B) LELTÁR

---

## FLOW 6: Leltár oldal betöltése

### Kiindulási pont
A lelkész a sidebar-ban a „Leltár" menüpontra kattint.

### Lépések
1. Az oldal betöltődik
2. Szűrő sáv: kategória dropdown + helyszín dropdown
3. Statisztika panel: tételek száma, összérték, legértékesebb tétel
4. A rendszer betölti az összes leltár tételt (`leltar_tetelek`)
5. A táblázat megjelenik: leltári szám, megnevezés, kategória, érték, amortizáció, felelős

### Döntési pontok
- **Véglegesített leltár** → a szerkesztés gombok eltűnnek, „Feloldás kérelem" gomb jelenik meg
- **Nincs tétel** → „Nincs leltár tétel" üzenet

### Végállapotok
- A teljes leltár látható a szűrőkkel

---

## FLOW 7: Leltár tétel rögzítése

### Kiindulási pont
A lelkész a „+ Új tétel" gombra kattint.

### Lépések
1. Modal megnyílik
2. **Leltári szám** automatikusan generálódik (kategória-kód + sorszám)
3. A lelkész kitölti:
   - Megnevezés (**kötelező**)
   - Kategória (**kötelező** — 7 közül)
   - Beszerzési érték (RON, **kötelező**)
   - Beszerzési dátum (opcionális)
   - Katalógus kód (opcionális — 2139/2004 törvényi dropdown)
     - Kiválasztásnál: a **használati idő automatikusan töltődik**
   - Helyszín (szabad szöveg VAGY dropdown)
   - Felelős személy (tag keresés)
   - Vonalkód (opcionális)
   - Megjegyzés
4. „Mentés"

### Rendszer reakciók — duplikáció ellenőrzés

5. A rendszer ellenőrzi: van-e hasonló megnevezésű és értékű tétel?

### Döntési pontok

**A) Nincs duplikátum → közvetlen INSERT**

**B) Gyanús duplikátum → rákérdez:**
- „Ez a tétel hasonlít erre: {meglévő tétel}. Duplikátum?"
- **Kihagyás** → mentés az eredeti adatokkal
- **Mégse** → nem ment

### Végállapotok
- A tétel megjelenik a listában, a statisztikák frissülnek

---

## FLOW 8: Értékcsökkenés (amortizáció) megjelenítés

### Kiindulási pont
A lelkész egy tétel „Amortizáció" ikonjára kattint.

### Lépések
1. A rendszer kiszámítja:
   - Használati idő (évek) — a 2139/2004 katalógusból
   - Éves értékcsökkenés = beszerzési érték / használati idő
   - Kor (évek) = aktuális év − beszerzési év
   - Jelenlegi érték = beszerzési érték − (kor × éves értékcsökkenés)
   - Ha jelenlegi érték < 0 → 0
   - Amortizáció százalék = (1 − jelenlegi/beszerzési) × 100
2. Az eredmény megjelenik (tooltip vagy panel)

### Döntési pontok
- **Nincs katalógus kód** → amortizáció nem számolható, jelenlegi érték = beszerzési érték
- **Használati idő lejárt** → jelenlegi érték = 0, „Teljes amortizáció" jelzés

### Végállapotok
- A tételenkénti amortizáció látható

---

## FLOW 9: Duplikáció audit wizard

### Kiindulási pont
A lelkész az „Audit" gombra kattint.

### Lépések
1. A rendszer végigfut az összes tételen:
   - Hasonló megnevezés keresése (fuzzy match — 80%+ egyezés)
   - Hasonló érték keresése (±20%)
2. A gyanús párokat listába gyűjti
3. Ha van gyanús pár → wizard modal nyílik

### Wizard lépésenként:
4. Megjelenik az aktuális pár:
   - „A" tétel: leltári szám, megnevezés, érték, dátum
   - „B" tétel: leltári szám, megnevezés, érték, dátum
   - Hasonlósági %-ok
5. 3 lehetőség:
   - **Összevonás** → az értékek összeadódnak az „A" tételbe, a „B" törlődik
   - **Törlés** → az „A" vagy „B" törlődik (a felhasználó választ)
   - **Kihagyás** → mindkettő megmarad
6. Következő pár → ismétlés
7. Az összes pár átnézve → összesítés: X összevonva, Y törölve, Z kihagyva

### Döntési pontok
- **Nincs gyanús pár** → „Minden rendben, nincs duplikátum!" üzenet
- **Az összevonás visszavonhatatlan** → confirm dialógus

### Végállapotok
- A leltár „kitisztítva" — a duplikátumok kezelve

---

## FLOW 10: Leltár véglegesítés és nyomtatás

### Kiindulási pont
A lelkész a „Véglegesítés" gombra kattint.

### Lépések
1. Megerősítő kérdés: „A véglegesítés után a leltár nem szerkeszthető."
2. Jóváhagyás → `bealitas.leltar_finalized = true`
3. Az összes tétel zárolódik (a szerkesztés/törlés gombok eltűnnek)
4. A **nyomtató központ** modal automatikusan megnyílik

### Nyomtató központ — 4 formátum:
5. A lelkész kiválasztja a nyomtatási típust:

| # | Formátum | Tartalom |
|---|---------|----------|
| 1 | **Vagyonleltári Jelentés** | Összesítő: kategóriánkénti csoportosítás, összérték, amortizált érték |
| 2 | **Leltárív** | Részletes: minden tétel, beszerzési/jelenlegi érték, amortizáció százalék |
| 3 | **Alapeszköz Karton** | Tételenkénti adatlap: egy tétel összes adata + amortizációs görbe |
| 4 | **Registru Inventar** | Román nyelvű formátum: a törvényi követelményeknek megfelelő |

6. „Generálás" → PDF/HTML generálás
7. Nyomtatás
8. **Automatikus iktatás:** a rendszer az `iktato` táblába is bejegyzést hoz létre (sorszám + tárgy: „Vagyonleltári Jelentés {év}")

### Döntési pontok

**Véglegesítés után szerkesztés kell:**
- „Feloldás kérelem" gomb → `bealitas.leltar_unlock_requested = true`
- „Várakozás az elbírálásra..." gomb (letiltva)
- Az esperes/admin feloldja → `leltar_finalized = false`

**Újranyomtatás:**
- Véglegesített leltár újranyomtatható (nem hoz létre új iktatási bejegyzést)

### Végállapotok
- A leltár zárolva, kinyomtatva, iktatva

---

# C) IKTATÁS

---

## FLOW 11: Iktatás oldal betöltése

### Kiindulási pont
A lelkész a sidebar-ban az „Iktatás" menüpontra kattint.

### Lépések
1. Az oldal betöltődik
2. Statisztika kártyák: összes, érkező, kimenő, függőben
3. Irány szűrő fülek: Érkező / Kimenő / Mind
4. Év-választó (alapértelmezés: aktuális év)
5. Keresőmező
6. A rendszer betölti az aktuális évre vonatkozó iratokat
7. A táblázat megjelenik: sorszám, dátum, tárgy, feladó/címzett, mappa, elintézés, irattári jel

### Döntési pontok
- **Nincs irat az adott évre** → üres lista
- **Irány szűrő váltás** → lista frissül

### Végállapotok
- A lelkész az iktatott iratok listáját látja

---

## FLOW 12: Irat rögzítése

### Kiindulási pont
A lelkész az „+ Új irat" gombra kattint.

### Lépések
1. Modal megnyílik
2. **Sorszám** automatikusan generálódik: `{YYYY}/{max+1}`
3. A lelkész kitölti:
   - Irány (**kötelező**: érkező/kimenő)
   - Dátum (**kötelező**)
   - Tárgy (**kötelező**)
   - Feladó / Címzett (opcionális)
   - Tárgykivonat (opcionális)
   - Mappa-köteg (**kötelező**: F.Á. / É.Á. / A.K.)
   - Elintézés dátuma (opcionális)
   - Elintézés módja (opcionális)
   - Irattári jel (opcionális)
   - Megjegyzés (opcionális)
4. „Mentés"

### Rendszer reakciók
- INSERT `iktato`
- Statisztikák frissülnek (összes + irány + függőben)

### Döntési pontok
- **Elintézés kitöltve** → az irat „elintézett" státuszú
- **Elintézés üres** → „függőben" státuszú (a statisztikában számolódik)

### Végállapotok
- Az irat iktatva, a sorszám kiosztva

---

## FLOW 13: Iktatókönyv nyomtatás

### Kiindulási pont
A lelkész az „Iktatókönyv nyomtatás" gombra kattint.

### Lépések
1. A rendszer az aktuális évre szűri az iratokat
2. A4 fekvő formátumban generálódik:
   - Fejléc: gyülekezet neve, év
   - Oszlopok: sorszám, kelt, tárgy, feladó/címzett, tárgykivonat, mappa, elintézés dátuma, elintézés módja, irattári jel
   - Sorok: időrendben
3. Nyomtatási ablak

### Végállapotok
- Az iktatókönyv kinyomtatva

---

## FLOW 14: Keresztelési igazolás generálás

### Kiindulási pont
A lelkész az „Igazolás" gombra kattint (sablonok között).

### Lépések
1. Személy kiválasztás (tag kereső)
2. A rendszer lekérdezi:
   - A személy adatai (`szemely` tábla)
   - A keresztelési bejegyzés (`keresztseg` tábla)
3. Az igazolás generálódik:
   - Gyülekezet neve
   - Személy neve, születési helye/dátuma
   - Keresztelés dátuma, helye, lelkésze
   - Szülők neve
   - Iktatási szám
4. Nyomtatási ablak

### Döntési pontok
- **Nincs keresztelési bejegyzés** → hiányos igazolás (a keresztelési adatok üresen maradnak)

### Végállapotok
- Az igazolás kinyomtatva

---

## FLOW 15: Keresés és szűrés (iktatás)

### Kiindulási pont
A lelkész a keresőmezőbe gépel vagy az irány/év szűrőt változtatja.

### Lépések

**Keresés:**
1. Full-text keresés a következő mezőkben: sorszám, tárgy, feladó/címzett, tárgykivonat, mappa, elintézés módja, irattári jel, megjegyzés
2. Case-insensitive substring keresés
3. Az eredmények azonnal megjelennek (kliens-oldali szűrés)

**Irány szűrő:**
- Érkező → `direction = 'incoming'`
- Kimenő → `direction = 'outgoing'`
- Mind → nincs szűrés

**Év szűrő:**
- Dropdown a meglévő évekből
- Váltáskor: újratöltés az adatbázisból

### Végállapotok
- A szűrt lista megjelenik
