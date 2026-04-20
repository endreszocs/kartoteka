# Core — Felhasználói folyamatok

---

## FLOW 1: Első látogatás (splash screen)

### Kiindulási pont
A felhasználó böngészőben megnyitja a Kartotéka weboldalát.

### Lépések
1. Az oldal betöltődik
2. A rendszer ellenőrzi: volt-e már splash screen ebben a böngésző-session-ben?
3. **Ha NEM volt** → megjelenik a köszöntő képernyő (templom háttérkép, EREK címer, „Kartotéka" felirat, bibliai idézet)
4. 3.5 másodperc várakozás
5. Átúszás animáció → a splash eltűnik
6. Megjelenik a bejelentkezési űrlap
7. A rendszer megjegyzi: „splash már volt" (böngésző session szinten)

### Döntési pontok
- **Ha MÁR volt splash** (pl. visszanavigálás) → azonnal a bejelentkezési űrlap jelenik meg, nincs animáció

### Végállapotok
- A felhasználó a bejelentkezési űrlapot látja

---

## FLOW 2: Bejelentkezés e-mail és jelszóval

### Kiindulási pont
A felhasználó a bejelentkezési űrlapon áll.

### Lépések
1. Beírja az e-mail címét
2. Beírja a jelszavát
3. Megnyomja a „Belépés" gombot
4. A gomb „Ellenőrzés..." állapotra vált (pörgő ikon)
5. A rendszer elküldi az adatokat a Supabase-nek

### Döntési pontok

**A) Hibás e-mail vagy jelszó**
- Hibaüzenet: „Érvénytelen e-mail cím vagy jelszó."
- A gomb visszaáll eredeti állapotra
- A felhasználó újrapróbálhatja
- A rendszer NEM árulja el, hogy az e-mail vagy a jelszó volt hibás

**B) Az e-mail cím nincs megerősítve**
- Hibaüzenet: „Kérem, erősítse meg az e-mail címét a fiókjába küldött linkkel!"

**C) Sikeres hitelesítés, de a profil `pending` státuszú**
- A rendszer kijelentkezteti a felhasználót
- Hibaüzenet: „Fiókja még jóváhagyásra vár a kerületi SzuperAdmin által!"

**D) Sikeres hitelesítés, a profil `active` VAGY Master Admin**
- A rendszer megvizsgálja a szerepkört és a gyülekezet-hozzárendelést
- Átirányítás (lásd: FLOW 6 — Bejelentkezés utáni routing)

### Végállapotok
- Sikeres: a felhasználó a megfelelő dashboard oldalon van
- Sikertelen: a felhasználó a bejelentkezési oldalon marad hibaüzenettel

---

## FLOW 3: Bejelentkezés Google fiókkal

### Kiindulási pont
A felhasználó a bejelentkezési oldalon a „Google" gombra kattint.

### Lépések
1. Megnyomja a „Google" gombot
2. A böngésző átirányít a Google bejelentkezési oldalára
3. A felhasználó kiválasztja a Google fiókját és engedélyezi a hozzáférést
4. A Google visszairányítja a Kartotéka oldalára (URL-ben token)
5. A rendszer 500 milliszekundumot vár (a token feldolgozásához)
6. A rendszer ellenőrzi: van-e aktív session?

### Döntési pontok

**A) VAN session, VAN profil, a profil `active` VAGY Master Admin**
- Átirányítás a megfelelő dashboard-ra (lásd: FLOW 6)

**B) VAN session, VAN profil, de `pending` státuszú**
- Kijelentkeztetés
- Hibaüzenet: „Fiókja még jóváhagyásra vár"
- Visszakerül a bejelentkezési űrlapra

**C) VAN session, de NINCS profil (első Google bejelentkezés)**
- Megjelenik a „Kiegészítő adatok" űrlap (FLOW 4)

**D) NINCS session (OAuth hiba, vagy a felhasználó nem engedélyezte)**
- Semmi nem történik, a bejelentkezési űrlap marad

### Végállapotok
- Sikeres + volt profil: dashboard
- Sikeres + nincs profil: kiegészítő adatbekérés
- Sikertelen: bejelentkezési oldal

---

## FLOW 4: OAuth kiegészítő adatbekérés (első Google regisztráció)

### Kiindulási pont
A felhasználó Google-lel jelentkezett be, de nincs még profilja a rendszerben.

### Lépések
1. Megjelenik a „Kiegészítő adatok" űrlap
2. A név mező előtöltődik a Google fiókból (ha elérhető)
3. A felhasználó kitölti: teljes név, telefonszám, gyülekezet neve
4. Elfogadja a Felhasználói Feltételeket (checkbox)
5. Megnyomja a „Regisztráció véglegesítése" gombot

### Döntési pontok

**A) Nem fogadta el a Feltételeket**
- Hibaüzenet: „A regisztrációhoz el kell fogadnia a Felhasználói Feltételeket!"
- Nem történik mentés

**B) Minden rendben**
- Profil sor létrejön az adatbázisban (status: `pending`)
- A rendszer kijelentkezteti a felhasználót
- Üzenet: „Regisztráció sikeres! Kérem várja meg a kerületi SzuperAdmin jóváhagyását."
- Visszakerül a bejelentkezési űrlapra

**C) Adatbázis hiba (pl. duplikált e-mail)**
- Hibaüzenet a hiba szövegével

### Végállapotok
- A felhasználó a bejelentkezési oldalon van, a profilja `pending` státuszban vár jóváhagyásra

---

## FLOW 5: Regisztráció e-mail és jelszóval

### Kiindulási pont
A felhasználó a bejelentkezési oldalon a „Regisztráljon!" linkre kattint.

### Lépések
1. Megjelenik a regisztrációs űrlap
2. Kitölti: teljes név (Lelkipásztor), telefonszám, egyházközség neve, e-mail, jelszó
3. Elfogadja a Felhasználói Feltételeket (checkbox)
4. A „Felhasználói Feltételek" linkre kattintva egy felugró ablakban olvashatja el a feltételeket (nem navigál el az oldalról)
5. Megnyomja a „Regisztráció elküldése" gombot

### Döntési pontok

**A) Nem fogadta el a Feltételeket**
- Hibaüzenet: „A regisztrációhoz el kell fogadnia a Felhasználói Feltételeket!"

**B) A jelszó túl rövid (< 6 karakter)**
- Böngésző szintű validáció blokkolja a küldést

**C) Az e-mail cím már foglalt**
- Supabase hibaüzenet

**D) Minden rendben**
- A rendszer létrehozza a felhasználót a Supabase Auth-ban
- Profil sor létrejön: status = `pending`
- Üzenet: „Regisztráció sikeres! Kérem várja meg a SzuperAdmin jóváhagyását."
- Visszakerül a bejelentkezési űrlapra
- (A háttérben: a Supabase e-mail megerősítő linket küld)

### Végállapotok
- A felhasználó a bejelentkezési oldalon van
- A profilja `pending` státuszban vár
- E-mail megerősítő link a postafiókjában

---

## FLOW 6: Bejelentkezés utáni routing (átirányítás)

### Kiindulási pont
A felhasználó sikeresen hitelesítette magát és a profilja `active` (vagy Master Admin).

### Döntési fa

```
A felhasználónak VAN gyülekezete?
├── IGEN → Gyülekezeti irányítópult (dashboard.html)
└── NEM
    ├── Master Admin VAGY admin szerepkör → Kerületi irányítópult (dashboard_kerulet.html)
    ├── Esperes szerepkör → Egyházmegyei irányítópult (dashboard_egyhazmegye.html)
    └── Egyéb → Gyülekezeti irányítópult (dashboard.html) [biztonsági tartalék]
```

### Rendszer reakciók
- Az átirányítás azonnali (`window.location.href`)
- A cél oldalon az Auth Guard ellenőrzi a session-t (dupla biztosítás)
- A cél oldalon betöltődik a sidebar és header a felhasználó szerepköre szerint

---

## FLOW 7: Oldal hozzáférés-ellenőrzés (Auth Guard)

### Kiindulási pont
A felhasználó megnyit egy `/pages/` alatti oldalt (akár direkt URL-ből, akár navigációval).

### Lépések
1. Az oldal betöltődik
2. A `supabase_config.js` automatikusan lefut
3. A rendszer lekéri az aktuális session-t

### Döntési pontok

**A) VAN aktív session**
- Az oldal normálisan betöltődik
- A sidebar a szerepkör szerint jelenik meg
- A header a felhasználó nevével és gyülekezetével töltődik fel

**B) NINCS aktív session**
- Azonnali átirányítás a bejelentkezési oldalra
- A felhasználó NEM látja az oldal tartalmát (még villanás szinten sem ideális esetben)

**C) A session közben lejár (másik fülön kijelentkezés)**
- A rendszer valós időben figyeli az auth állapotváltozásokat
- `SIGNED_OUT` esemény → azonnali átirányítás a bejelentkezési oldalra

**D) A felhasználó offline (JELENLEGI HIBA)**
- A rendszer a bejelentkezési oldalra irányít (HELYTELEN)
- HELYES viselkedés: offline módban a cache-elt adatokkal kellene működnie

### Végállapotok
- Van session: az oldal működik
- Nincs session: bejelentkezési oldal

---

## FLOW 8: Oldal betöltés — Layout inicializálás

### Kiindulási pont
A felhasználónak van session-je, az oldal töltődik.

### Lépések (sorrend kritikus!)
1. Supabase kliens inicializálás (`window._supabase`)
2. Auth Guard ellenőrzés (session check)
3. Service Worker regisztráció (háttérben, nem blokkoló)
4. HTML komponensek betöltése (sidebar, header — cache-ből vagy hálózatról)
5. Profil lekérdezés (getCachedProfile — cache-ből ha 5 percen belüli)
6. Sidebar menüelemek megjelenítése/elrejtése a szerepkör szerint
7. Header kitöltése: felhasználó neve, monogram/avatar, gyülekezet neve és címere
8. God Mode ellenőrzés (ha aktív: piros fejléc, banner, extra gombok)
9. Admin Override ellenőrzés (ha aktív: piros banner, gyülekezet név, hátralévő idő)
10. Oldal-specifikus adatok betöltése (dashboard, tagnyilvántartás, stb.)

### Rendszer reakciók
- Ha a profil cache érvényes (< 5 perc) → 0 API hívás a profil betöltéséhez
- Ha a HTML komponensek cache-ben vannak → 0 HTTP kérés (sessionStorage)
- Ha a God Mode lejárt → automatikus deaktiválás + oldal újratöltés
- Ha az Admin Override lejárt → figyelmeztetés + redirect admin oldalra

### Végállapotok
- Minden elem betöltődött, a felhasználó látja az oldalt a jogosultságainak megfelelően

---

## FLOW 9: Profil szerkesztés

### Kiindulási pont
A felhasználó a header dropdown-ban a „Profil" menüpontra kattint.

### Lépések
1. Modal ablak megnyílik
2. A rendszer lekéri a felhasználó profilját (auth + profiles tábla)
3. Kitöltődik: teljes név, e-mail (nem szerkeszthető), születési dátum
4. Monogram automatikusan generálódik a névből
5. A felhasználó módosítja az adatokat
6. „Mentés" gombra kattint

### Rendszer reakciók
- Profil frissítés a `profiles` táblában (upsert — ha nincs sor, létrehozza)
- Auth metaadat frissítés (teljes név szinkronizálás)
- Modal bezáródik
- Header újratöltődik (név, monogram frissül)

### Végállapotok
- A profil frissült, a header az új nevet mutatja

---

## FLOW 10: Gyülekezet adatok szerkesztése

### Kiindulási pont
A felhasználó a header dropdown-ban a „Gyülekezetünk" menüpontra kattint.

### Lépések
1. A rendszer ellenőrzi: van-e `congregation_id` a profilban?
2. **Ha NINCS** → „A SzuperAdmin még nem hagyta jóvá a regisztrációját" figyelmeztetés → VÉGE
3. **Ha VAN** → lekéri a gyülekezet összes adatát
4. Modal ablak megnyílik több fülön: Alapadatok, Pénzügyi, Egyházmegye
5. Az egyházmegye dropdown dinamikusan töltődik a `dioceses` táblából
6. A felhasználó módosítja a kívánt adatokat
7. Opcionálisan címert tölt fel (képfájl)
8. „Mentés" gombra kattint

### Rendszer reakciók
- Ha van címer feltöltés → Supabase Storage-ba mentés → publikus URL generálás
- Gyülekezet sor frissítése a `congregations` táblában
- Ha a `tartozas_szamitas_mod` oszlop nem létezik → retry mechanizmus (mező nélkül próbálja)
- Header újratöltődik (gyülekezet név, címer frissül)
- Auth metaadat frissítés (gyülekezet név szinkron)

### Végállapotok
- A gyülekezet adatai frissültek, a header az új adatokat mutatja

---

## FLOW 11: Jelszó visszaállítás

### Kiindulási pont
A felhasználó a bejelentkezési oldalon az „Elfelejtette a jelszavát?" linkre kattint.

### Lépések
1. Megjelenik a jelszó-visszaállítási űrlap
2. Beírja az e-mail címét
3. „Visszaállító link küldése" gombra kattint
4. A rendszer elküldi a reset linket a Supabase-en keresztül

### Rendszer reakciók
- Sikeres küldés → „A jelszó-visszaállító linket sikeresen elküldtük az e-mail címére!"
- Az e-mail mező kiürül
- A rendszer NEM árulja el, hogy az e-mail létezik-e (adatvédelem)
- „Vissza a belépéshez" gombbal visszanavigálhat

### Végállapotok
- A felhasználó megkapta (vagy nem) a reset linket
- A „Vissza a belépéshez" gombbal visszamehet a login űrlapra

---

## FLOW 12: Apple bejelentkezés (tiltott)

### Kiindulási pont
A felhasználó az „Apple" gombra kattint.

### Lépések
1. Megnyomja az Apple gombot
2. A rendszer ellenőrzi: az Apple provider engedélyezve van-e?
3. NINCS engedélyezve → barátságos üzenet jelenik meg

### Rendszer reakciók
- Üzenet: „Az Apple bejelentkezés hamarosan elérhető lesz! Jelenleg a Google fiókkal vagy e-mail címmel tud belépni/regisztrálni."
- Nem történik hálózati kérés (a provider lista kliensoldali)

### Végállapotok
- A felhasználó a bejelentkezési oldalon marad

---

## FLOW 13: Kijelentkezés

### Kiindulási pont
A felhasználó bármely oldalon a header dropdown-ban a „Kijelentkezés" gombra kattint.

### Lépések
1. Megnyomja a „Kijelentkezés" gombot
2. A rendszer meghívja a Supabase signOut-ot
3. A session token érvénytelenítődik
4. Átirányítás a bejelentkezési oldalra

### Rendszer reakciók
- Minden nyitott böngésző fül értesül a kijelentkezésről (onAuthStateChange)
- Más füleken is megtörténik az átirányítás

### Végállapotok
- A felhasználó a bejelentkezési oldalon van, nincs aktív session

---

## FLOW 14: God Mode aktiválás

### Kiindulási pont
A Master Admin a sidebar rejtett menüpontjára kattint (csak az ő e-mail címével jelenik meg).

### Lépések
1. A Master Admin rákattint a rejtett „God Mode" menüpontra
2. PIN kód beviteli modal jelenik meg
3. Beírja a PIN kódot
4. Megnyomja az aktiválás gombot

### Döntési pontok

**A) Hibás PIN**
- Hibaüzenet jelenik meg a modal-ban
- A felhasználó újrapróbálhatja (NINCS korlátozás — biztonsági kockázat!)

**B) Helyes PIN**
- God Mode aktiválódik 2 órára
- A lejárati időpont a böngésző session-be mentődik
- UI változások:
  - Fejléc háttere pirosra vált
  - Figyelmeztető banner jelenik meg
  - „Tömeges Import" gomb megjelenik
  - „Nem-ellenőrzés" gomb megjelenik (ha tagnyilvántartás oldalon van)
- A háttérben: tömeges import scriptek lazy betöltődnek

### Rendszer reakciók
- Másodpercenként ellenőrzi a hátralévő időt
- 1 perc a lejárat előtt → figyelmeztető modal: „A God Mode hamarosan lejár!"
- Lejárat → automatikus deaktiválás + oldal újratöltés (God Mode UI eltűnik)

### Végállapotok
- God Mode aktív: piros fejléc, extra gombok, 2 órás visszaszámláló
- VAGY God Mode lejárt: normál állapot

---

## FLOW 15: God Mode deaktiválás

### Kiindulási pont
A Master Admin a „Kilépés a Szuperadmin módból" gombra kattint, VAGY lejár a 2 óra.

### Lépések (manuális kilépés)
1. Megnyomja a „Kilépés" gombot
2. A session-ből törlődik a lejárati időpont
3. A visszaszámláló leáll
4. Az oldal újratöltődik

### Lépések (automatikus lejárat)
1. A visszaszámláló eléri a 0-t
2. A session-ből törlődik a lejárati időpont
3. Az oldal újratöltődik

### Végállapotok
- Normál UI: fehér fejléc, nincs banner, nincs extra gomb

---

## FLOW 16: Admin Override (más gyülekezet megtekintése)

### Kiindulási pont
A Master Admin az Admin panelen egy gyülekezetet kiválaszt és hozzáférést kér.

### Lépések
1. A Master Admin kiválaszt egy gyülekezeteet az Admin panelen
2. Beírja az indokot
3. Elküldi a hozzáférési kérelmet
4. A célgyülekezet lelkésze **valós idejű értesítést** kap (csengő ikon)
5. A lelkész megnyitja az értesítést → „Jóváhagyás" vagy „Elutasítás" + időtartam beállítás
6. Ha jóváhagyva → a Master Admin értesítést kap
7. A Master Admin aktiválja az override-ot → a böngésző session-be mentődik a célgyülekezet ID-ja

### Rendszer reakciók aktiválás után
- Minden oldalbetöltésnél a rendszer a célgyülekezet adatait tölti be (nem a sajátját)
- Piros banner jelzi: „Engedélyezett hozzáférés — [Gyülekezet neve] (X perc hátra)"
- A „Kilépés" gomb visszavezet az admin oldalra

### Döntési pontok oldal betöltésekor
```
Van admin override a session-ben?
├── IGEN
│   ├── Van érvényes, jóváhagyott, nem lejárt engedély az adatbázisban?
│   │   ├── IGEN → override aktív, piros banner, célgyülekezet adatai
│   │   └── NEM → override törlés, figyelmeztetés, redirect admin oldal
│   └── A felhasználó NEM Master Admin? → override ignorálva (biztonság)
└── NEM → normál működés, saját gyülekezet adatai
```

### Edge case: lelkész visszavonja az engedélyt miközben a Master Admin használja
- A következő oldalbetöltésnél az adatbázis-ellenőrzés észleli
- Override automatikusan törlődik
- Figyelmeztetés: „A hozzáférési engedély lejárt vagy nem létezik."
- Redirect az admin oldalra

### Végállapotok
- Override aktív: a Master Admin a célgyülekezet adatait látja
- Override lejárt/visszavonva: visszakerül az admin oldalra

---

## FLOW 17: Felhasználói Feltételek megtekintése regisztrációnál

### Kiindulási pont
A felhasználó a regisztrációs űrlapon a „Felhasználói Feltételek és Adatvédelmi Tájékoztató" linkre kattint.

### Lépések
1. Rákattint a linkre
2. Felugró ablak (modal) jelenik meg
3. A rendszer betölti a `felhasznaloi_feltetelek.html` oldal magyar nyelvű szekciójának tartalmát
4. A felhasználó elolvassa
5. Bezárja a modalt (gomb vagy ESC billentyű)

### Rendszer reakciók
- A tartalom csak egyszer töltődik be (első megnyitáskor) → cache-elődik
- Ha a betöltés sikertelen → link jelenik meg, amivel új fülön nyitható meg
- A regisztrációs űrlap NEM vész el (a modal felette jelenik meg)

### Végállapotok
- A felhasználó visszakerül a regisztrációs űrlapra (a kitöltött adatok megmaradnak)
