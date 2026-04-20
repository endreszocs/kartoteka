# Aladár AI Asszisztens + Admin Panel — Felhasználói folyamatok

---

# A) ALADÁR AI ASSZISZTENS

---

## FLOW 1: AI widget megjelenése és első üdvözlés

### Kiindulási pont
A felhasználó bejelentkezik és bármely oldalra navigál.

### Lépések
1. Az oldal betöltődik
2. A rendszer ellenőrzi: van-e legalább 1 konfigurált API kulcs?
3. Ha VAN → az AI widget (buborék ikon) megjelenik a jobb alsó sarokban
4. 10 másodperc várakozás → üdvözlő üzenet jelenik meg:
   - „Üdvözlöm, {Lelkész neve}! Aladár vagyok, a Kartotéka asszisztense."
5. Ha volt korábbi session → a beszélgetés visszatöltődik (sessionStorage)

### Döntési pontok
- **Nincs API kulcs** → a widget NEM jelenik meg
- **Volt korábbi session** → a beszélgetés folytatódik (nem üres ablak)

### Végállapotok
- A widget látható, a felhasználó bármikor megnyithatja

---

## FLOW 2: Üzenet küldése és válasz fogadása

### Kiindulási pont
A felhasználó megnyitja a chat ablakot és kérdést ír.

### Lépések
1. A felhasználó begépeli a kérdést a szövegmezőbe
2. Enter → küldés (Shift+Enter → új sor)
3. Rate limit ellenőrzés: 2500ms telt el az utolsó kérés óta?

### Döntési pontok

**A) Rate limit aktív (< 2500ms)**
- A küldés gomb letiltva marad
- „Kérem várjon..." figyelmeztetés

**B) Rate limit nem aktív → kérdés osztályozás:**

**B.1) Üdvözlés** (pl. „Szia", „Jó napot"):
- Helyi válasz: „Üdvözlöm! Miben segíthetek ma?"
- NEM hív API-t

**B.2) Rendszer kérdés** (pl. „Hogyan rögzítsek bevételt?"):
- Gépelés animáció megjelenik
- API fallback lánc indul:
  1. OpenRouter: minimax/m2.5 → stepfun/flash → nemotron
  2. Ha mind hibázik → Groq: llama-3.3-70b → llama-3.1-8b
  3. Ha az is hibázik → Gemini: gemini-2.0-flash → gemini-1.5-flash
- Az első sikeres válasz megjelenik (Markdown renderelve)
- A beszélgetés sessionStorage-ba mentődik

**B.3) Off-topic kérdés** (pl. „Mi az élet értelme?"):
- Az API válaszol, de a system prompt miatt áttereli: „Szívesen segítek a Kartotéka rendszer használatában! Kérdezzen bátran a tagnyilvántartásról, pénzügyekről..."

**C) Minden szolgáltató hibázik:**
- „Jelenleg nem tudok válaszolni. Kérem, próbálja néhány perc múlva."

### Rendszer reakciók
- Az üzenet a chat ablakban megjelenik (felhasználó: jobbra, AI: balra)
- Markdown renderelés: vastag, dőlt, kódblokk, lista
- A kontextus ablak maximum 10 üzenetet tartalmaz (régebbiek kiesnek)

### Végállapotok
- A válasz megjelent, a beszélgetés mentve

---

## FLOW 3: Figyelemfelkeltés (inaktivitás)

### Kiindulási pont
A felhasználó az oldalon dolgozik, de nem használja az AI-t.

### Lépések
1. **3 perc inaktivitás** → gondolat-buborék animáció: „Miben segíthetek?"
2. A buborék 5 másodperc után eltűnik
3. **1 óra a bejelentkezés óta** → bátorító üzenet: „Szép munka! Ha elakad, kérdezzen bátran."
4. **2 óra** → elismerő üzenet: „Már 2 órája dolgozik! Remek kitartás."

### Döntési pontok
- **Figyelemfelkeltés: óránként egyszer** (localStorage rate limit) → ha az előző órában volt, nem jelenik meg
- **Ha a chat nyitva van** → a figyelemfelkeltés NEM jelenik meg

### Végállapotok
- A figyelemfelkeltés eltűnt, a felhasználó opcionálisan megnyitja a chatot

---

# B) ADMIN PANEL

---

## FLOW 4: Admin Panel megnyitása és áttekintés

### Kiindulási pont
A Master Admin a sidebar-ban az „Admin Panel" menüpontra kattint.

### Lépések
1. Biztonsági ellenőrzés: a felhasználó e-mail címe megegyezik a Master Admin e-mail-lel?
2. Ha NEM → „Nincs jogosultsága" hiba képernyő
3. Ha IGEN → az Admin Panel betöltődik
4. Párhuzamos lekérdezés:
   - Egyházmegyék (`dioceses`)
   - Gyülekezetek (`congregations`)
   - Felhasználók (`profiles`)
   - Tagok összesítés (`szemely`)
   - Támogatási jegyek (`support_messages`)
5. **Áttekintés fül** megjelenik:
   - KPI kártyák: gyülekezetek, aktív felhasználók, élő tagok, függő jegyek
   - Egyházmegyénkénti megoszlás
   - Sürgős teendők
   - Top 10 gyülekezet (tagszám)
   - Rendszerállapot

### Döntési pontok
- **Nem Master Admin** → BLOKKOLVA (hiba képernyő)

### Végállapotok
- A Master Admin a teljes rendszer áttekintését látja

---

## FLOW 5: Felhasználó jóváhagyás

### Kiindulási pont
A Master Admin a „Felhasználók" fülre navigál.

### Lépések
1. **Függő regisztrációk** listája megjelenik:
   - Név, e-mail, regisztráció dátuma, megadott gyülekezet neve
2. A Master Admin kiválaszt egy felhasználót
3. **Egyházmegye kiválasztás** (dropdown — a meglévő egyházmegyékből)
4. „Jóváhagyás" gombra kattint

### Rendszer reakciók
5. A rendszer ellenőrzi: létezik-e a megadott gyülekezet?
   - Ha NEM → automatikusan létrehozza (INSERT `congregations`)
   - Ha IGEN → a meglévőhöz rendeli
6. UPDATE `profiles`:
   - `status = 'active'`
   - `congregation_id = {gyülekezet ID}`
   - `diocese_id = {egyházmegye ID}`
7. INSERT `ertesitesek`: „Fiókja jóváhagyásra került! Bejelentkezhet."
8. A felhasználó eltűnik a függő listáról

### Döntési pontok
- **A gyülekezet már létezik** → NEM hoz létre újat
- **Egyházmegye nincs kiválasztva** → a mentés nem lehetséges

### Végállapotok
- A felhasználó bejelentkezhet, a gyülekezete hozzárendelve

---

## FLOW 6: Szerepkör módosítás

### Kiindulási pont
A Master Admin az „Aktív felhasználók" szekcióban egy felhasználó szerepkörét módosítja.

### Lépések
1. A felhasználó sorában a szerepkör dropdown-ból kiválaszt:
   - Lelkész / Esperes / Egyházmegyei Admin / Admin
2. A rendszer azonnal UPDATE `profiles.role`

### Döntési pontok
- **A felhasználó éppen be van jelentkezve** → a változás a következő oldalbetöltésnél érvényesül (a sidebar frissül)

### Végállapotok
- A szerepkör azonnali hatállyal módosult

---

## FLOW 7: Admin Override — belépés más gyülekezetbe

### Kiindulási pont
A Master Admin a „Gyülekezetek" fülön egy gyülekezet „Belépés" gombjára kattint.

### Lépések
1. A rendszer INSERT `admin_access_requests`:
   - `status = 'approved'`
   - `expires_at = most + 24 óra`
   - `admin_user_id = Master Admin ID`
   - `congregation_id = cél gyülekezet`
2. A Master Admin session-jében a cél gyülekezet ID-ja aktiválódik
3. Átirányítás a Dashboard-ra → az adott gyülekezet adatait látja

### Rendszer reakciók
- A piros override banner jelenik meg: „Engedélyezett hozzáférés — {gyülekezet neve} (24 óra)"
- A sidebar moduljai a cél gyülekezet adatait mutatják

### Döntési pontok
- **Master Admin NEM kér jóváhagyást** — automatikus belépés (ez a fő különbség a nem-admin hozzáférés kérelemtől)
- **24 óra lejárta** → automatikus kilépés

### Végállapotok
- A Master Admin a cél gyülekezet adatait kezeli (Dashboard, Tagnyilvántartás, Pénzügy, stb.)

---

## FLOW 8: Támogatási jegy kezelés

### Kiindulási pont
A Master Admin a „Támogatás" fülre navigál.

### Lépések
1. A beérkezett támogatási jegyek listája megjelenik:
   - Feladó neve, tárgy, dátum, státusz (új/olvasott/lezárt)
2. Egy jegyre kattint → részletes modal megnyílik
3. A jegy teljes tartalma olvasható
4. Válasz szövegmező (szabad szöveg)
5. „Válasz küldés" VAGY „Jegy lezárás"

### Rendszer reakciók

**Válasz küldés:**
6. INSERT `support_messages` (type: 'reply', content: válasz szöveg)
7. INSERT `ertesitesek` a feladónak (type: 'support_reply', tartalom: válasz)
8. A jegy státusza: 'read' (olvasott)

**Jegy lezárás:**
9. UPDATE `support_messages.status = 'closed'`
10. A jegy archivált státuszba kerül

### Döntési pontok
- **Üres válasz** → validáció blokkolja
- **Lezárt jegy** → NEM nyitható újra (a feladó új jegyet nyithat)

### Végállapotok
- A válasz megérkezett a feladónak (értesítés), VAGY a jegy lezárva

---

## FLOW 9: Adatminőség ellenőrzés

### Kiindulási pont
A Master Admin a „Minőség" gombra kattint.

### Lépések
1. A rendszer végigfut az ÖSSZES gyülekezet ÖSSZES tagján (`szemely` tábla)
2. Ellenőrzi tagonként:
   - Van-e CNP (személyi szám)?
   - Van-e nem beállítva (ferfi = true/false)?
   - Van-e születési dátum?
3. Az eredmény megjelenik:
   - Gyülekezetenként: gyülekezet neve + hiba szám (CNP / nem / dátum)
   - Összesítő sor: összes hiba típusonként

### Döntési pontok
- **Nincs hiba** → „Gratulálunk! Minden rendben!" üzenet
- **Van hiba** → a lelkész a Tagnyilvántartásban javíthatja (vagy God Mode nem-ellenőrzéssel)

### Végállapotok
- A Master Admin tudja, melyik gyülekezetben van adathiány

---

## FLOW 10: Tömeges bevétel import

### Kiindulási pont
A Master Admin az „Import" fülön a „Bevétel (Kassza)" alfülre navigál.

### Lépések
1. **Gyülekezet kiválasztás** (dropdown — az összes gyülekezetből)
   - A felhasználó saját gyülekezete automatikusan kiválasztva
2. **Excel fájl feltöltés** (.xlsx)
3. A rendszer elemzi a fájlt:
   - Fejléc felismerés (oszlop nevek → mező párosítás)
   - Automatikus kategória kód párosítás (`befizetescel` → `szamadasicel`)
   - Dátum konverzió (6+ formátum)
   - Összeg parsing (vessző → pont, szóközök eltávolítás)
4. **Előnézet** megjelenik:
   - Sorok száma
   - Párosított személyek száma
   - Kihagyott sorok (összeg ≤ 0, hiányzó adat)
5. „Import végrehajtás" gomb

### Rendszer reakciók
6. 100 rekordos batch-ekben INSERT `befizetes`
7. Személyenkénti párosítás (név → `szemely` tábla)
8. Eredmény: „X rekord importálva, Y személy párosítva, Z kihagyva"

### Döntési pontok
- **Nem .xlsx formátum** → hiba, nem elemzi
- **Ismeretlen fejléc** → manuális oszlop-párosítás
- **Összeg ≤ 0** → a sor kihagyásra kerül (nem hiba)
- **Személy nem párosítható** → `id_szemely = null` (később párosítható az audit-ban)

### Végállapotok
- A bevételek importálva, a Pénzügy modulban megjelennek

---

## FLOW 11: Tömeges munkanapló import

### Kiindulási pont
A Master Admin az „Import" fülön a „Munkanapló" alfülre navigál.

### Lépések
1. Gyülekezet kiválasztás
2. Excel fájl feltöltés
3. A rendszer felismeri: **hivatalos EREK sablon** VAGY **egyedi Excel**?

### Döntési pontok

**A) Hivatalos EREK sablon (3 munkalap):**
- `Szolgálati_alkalmak` → kategória: szolgalat (dátum, típus, résztvevők, perselypénz, énekek)
- `Katekézis` → kategória: katekezis (dátum, résztvevők, lecke)
- `Családlátogatás` → kategória: latogatas (dátum, család neve, cím)
- Automatikus parsing → előnézet → import

**B) Egyedi Excel:**
- Fejléc-alapú mező párosítás szükséges
- A felhasználó manuálisan rendeli hozzá az oszlopokat

4. Előnézet → „Import végrehajtás"
5. 100 rekordos batch INSERT `munkanaplo`

### Végállapotok
- A munkanapló bejegyzések importálva

---

## FLOW 12: Tömeges keresztelés import (személy párosítással)

### Kiindulási pont
A Master Admin az „Import" fülön a „Keresztelés" alfülre navigál.

### Lépések
1. Gyülekezet kiválasztás
2. Excel fájl feltöltés
3. Fejléc felismerés + dátum parsing
4. **Személy párosítás** (KRITIKUS lépés):
   - A rendszer az importált neveket a `szemely` tábla tagjaival egyezteti
   - Fuzzy egyeztetés: név normalizálás (kisbetű + ékezet eltávolítás) + születési dátum
   - Megjelenik: párosított / nem párosított sorok listája
5. A felhasználó átnézi:
   - Párosított → helyes?
   - Nem párosított → manuális kiválasztás
6. „Import végrehajtás"
7. 100 rekordos batch INSERT `keresztseg`

### Döntési pontok
- **100%-os egyezés** → automatikus párosítás (zöld jelölés)
- **Részleges egyezés** → a felhasználó dönt (sárga jelölés)
- **Nincs egyezés** → piros jelölés, manuális keresés

### Végállapotok
- A keresztelési bejegyzések importálva a szemely-összekötéssel

---

## FLOW 13: Gyülekezet részletek megtekintése

### Kiindulási pont
A Master Admin a „Gyülekezetek" listában egy gyülekezetre kattint.

### Lépések
1. Részletes modal megnyílik
2. **Tagok szekció:**
   - Aktív tagok száma
   - Tagok listája (név, nem, kor)
3. **Pénzügyi szekció:**
   - Éves bevétel összeg
   - Éves kiadás összeg
   - Egyenleg
4. **Felhasználók szekció:**
   - A gyülekezethez rendelt felhasználók (név, szerepkör)

### Végállapotok
- A Master Admin áttekintette a gyülekezet állapotát
