# Sírhelyek + Missziós Műhely + Értesítések — Felhasználói folyamatok

---

# A) SÍRHELYEK

---

## FLOW 1: Sírhelyek oldal betöltése

### Kiindulási pont
A lelkész a sidebar-ban a „Sírhelyek" menüpontra kattint.

### Lépések
1. Az oldal betöltődik
2. A rendszer betölti a temetőket (`sirhelytemeto`), sírhelyeket (`sirhely`), bérleteket (`sirhelyberles`), elhunytakat (`sirhelyelhunyt`)
3. Kettős map felépül: `sirhelyId → bérletek[]` és `sirhelyId → elhunytak[]`
4. Szűrő sáv: temető dropdown + állapot dropdown
5. Statisztika kártyák: összesen, szabad, foglalt, lejárt
6. A nézet: táblázat (alapértelmezett) VAGY kártya (váltható)

### Döntési pontok
- **Nincs temető** → „Hozzon létre egy temetőt" üzenet
- **Nincs sírhely** → „Nincs sírhely" üzenet

### Végállapotok
- A teljes sírhely nyilvántartás látható szűrőkkel

---

## FLOW 2: Temető kezelése

### Kiindulási pont
A lelkész a „+ Új temető" gombra kattint.

### Lépések
1. Modal megnyílik
2. Kitölti: név (**kötelező**), helyszín (opcionális), megjegyzés
3. „Mentés" → INSERT `sirhelytemeto`
4. A temető megjelenik a szűrő dropdown-ban

### Szerkesztés / Törlés
- Szerkesztés: a temető sorában „✏️" → modal előtöltve → UPDATE
- Törlés: soft delete (`deleted = true`) → a temető eltűnik a szűrőből, a sírhelyek megmaradnak

### Végállapotok
- A temető rögzítve, szerkesztve vagy törölve

---

## FLOW 3: Sírhely parcella rögzítése

### Kiindulási pont
A lelkész a „+ Új sírhely" gombra kattint.

### Lépések
1. Modal megnyílik
2. Kitölti:
   - Temető (**kötelező** — dropdown a meglévő temetőkből)
   - Parcella szám / sor / hely (opcionális, szabad szöveg)
   - Állapot (**kötelező**: szabad / foglalt / lejárt / zárt / fenntartott)
   - Megjegyzés
3. „Mentés" → INSERT `sirhely`

### Rendszer reakciók
- A sírhely megjelenik a táblázatban/kártya nézetben
- A statisztika kártyák frissülnek

### Végállapotok
- Az új sírhely rögzítve az adott állapottal

---

## FLOW 4: Bérleti szerződés rögzítése

### Kiindulási pont
A lelkész egy sírhely „Bérlet hozzáadása" gombjára kattint.

### Lépések
1. Bérlet modal megnyílik (a sírhelyhez kötve)
2. Kitölti:
   - Bérlő neve (**kötelező**, szabad szöveg)
   - Kezdet dátum (**kötelező**)
   - Vég dátum (**kötelező**, alapértelmezés: kezdet + 25 év)
   - Összeg (opcionális)
   - Megjegyzés
3. „Mentés" → INSERT `sirhelyberles`

### Döntési pontok
- **A sírhely állapota „szabad"** → a bérlet rögzítése után javasolt az állapot „foglalt"-ra állítása
- **Több bérlet egy sírhelyhez** → megengedett (időben egymás után)

### Végállapotok
- A bérlet a sírhely kártyáján/sorában inline megjelenik

---

## FLOW 5: Elhunyt regisztrációja

### Kiindulási pont
A lelkész egy sírhely „Elhunyt hozzáadása" gombjára kattint.

### Lépések
1. Elhunyt modal megnyílik (a sírhelyhez kötve)
2. Kitölti:
   - Név (**kötelező**, szabad szöveg)
   - Született dátum (opcionális)
   - Elhunyt dátum (opcionális)
   - Temetés dátuma (opcionális)
   - Megjegyzés
3. „Mentés" → INSERT `sirhelyelhunyt`

### Döntési pontok
- **Családi sírhely** → több elhunyt is hozzáadható
- **Az elhunyt NEM kell a tagnyilvántartásban legyen** — szabad szöveges

### Végállapotok
- Az elhunyt a sírhely kártyáján/sorában inline megjelenik

---

## FLOW 6: Nézet váltás és szűrés

### Kiindulási pont
A lelkész a nézet váltó gombra VAGY a szűrő dropdown-ra kattint.

### Lépések

**Nézet váltás:**
1. Táblázat ↔ Kártya gomb → a nézet átváll
2. Táblázat: kompakt sorok (parcella, állapot, bérlő, elhunyt)
3. Kártya: vizuális kártyák (bérletek + elhunytak inline)

**Szűrés:**
1. Temető dropdown → csak az adott temető sírhelyei
2. Állapot dropdown → csak az adott állapotú sírhelyek

### Végállapotok
- A szűrt nézet a kiválasztott formátumban

---

## FLOW 7: CSV export

### Kiindulási pont
A lelkész az „Export" gombra kattint.

### Lépések
1. A rendszer a szűrt sírhelyeket exportálja CSV-be
2. Oszlopok: temető, parcella, sor, hely, állapot, bérlő, bérlet kezdet/vég, elhunyt név/dátumok
3. Letöltés

### Végállapotok
- A CSV fájl letöltődik

---

# B) MISSZIÓS MŰHELY

---

## FLOW 8: Segédanyag feltöltése

### Kiindulási pont
A lelkész a „Feltöltés" gombra kattint (Segédanyagok fülön).

### Lépések
1. Feltöltés modal megnyílik
2. Kitölti:
   - Cím (**kötelező**)
   - Leírás (opcionális)
   - Kategóriák (**minimum 1**, chip-ek)
   - Fájl kiválasztás (**kötelező**)
3. „Feltöltés"

### Rendszer reakciók
1. Fájl ellenőrzés: méret ≤ 20 MB, formátum engedélyezett
2. Feltöltés Cloudflare R2-re (Server Action-ön keresztül)
3. INSERT `mm_segedanyagok` + INSERT `mm_segedanyag_kategoriak` (junction)
4. Gamifikáció: +8 pont a feltöltőnek (`segedanyagok_feltoltve` +1)
5. Az anyag megjelenik a listában

### Döntési pontok
- **Fájl > 20 MB** → BLOKKOLVA, hibaüzenet
- **Nem engedélyezett formátum** → BLOKKOLVA
- **R2 Worker nem elérhető** → hiba, nem mentődik

### Végállapotok
- A segédanyag publikus, értékelhető, letölthető

---

## FLOW 9: Segédanyag értékelése és letöltése

### Kiindulási pont
A lelkész egy anyag kártyájára kattint → részletek modal.

### Lépések

**Értékelés:**
1. 1–5 csillagra kattint
2. A rendszer INSERT/UPDATE `mm_segedanyag_ertekelesek`
3. Az átlagos pontszám frissül
4. Gamifikáció: +1 pont (`ertekelesek_adva` +1)

**Letöltés:**
1. „Letöltés" gombra kattint
2. A rendszer inkrementálja a letöltés számlálót (`incrementLetoltes`)
3. A fájl letöltődik az R2-ből

### Döntési pontok
- **Már értékelte** → a korábbi értékelés módosul (nem duplikálódik)
- **50 letöltés elérve** → +15 pont a feltöltőnek (egyszeri)

### Végállapotok
- Az értékelés és letöltés rögzítve

---

## FLOW 10: Ötlet benyújtása (4 lépéses wizard)

### Kiindulási pont
A lelkész az „Új ötlet" gombra kattint (Ötletek fülön).

### Lépések
1. **Wizard 1. lépés:** Cím megadása
2. **Wizard 2. lépés:** Részletes leírás
3. **Wizard 3. lépés:** Kategóriák kiválasztása (chip-ek, min. 1)
4. **Wizard 4. lépés:** Szavazási határidő beállítása (opcionális)
5. „Beküldés"

### Rendszer reakciók
1. INSERT `mm_otletek` (statusz: `szavazas` ha van határidő, `uj` ha nincs)
2. INSERT `mm_otlet_kategoriak` (junction)
3. Gamifikáció: +10 pont (`otletek_szama` +1)

### Döntési pontok
- **Nincs szavazási határidő** → az ötlet `uj` státuszba kerül (manuális léptetés szükséges)
- **Van határidő** → az ötlet `szavazas` státuszba kerül (automatikus lezárás a határidőnél)

### Végállapotok
- Az ötlet publikus, szavazható

---

## FLOW 11: Szavazás és ötlet életciklus

### Kiindulási pont
A lelkész egy ötlet „Támogatom" gombjára kattint.

### Lépések
1. Ha MÉG NEM szavazott → INSERT `mm_szavazatok` (támogatás: true)
2. Ha MÁR szavazott → DELETE `mm_szavazatok` (visszavonás)
3. A szavazat szám frissül
4. Gamifikáció: +2 pont szavazatkor (`tamogatasok_adva` +1)

### Automatikus lezárás
5. Az oldal betöltésekor `checkSzavazasDeadlines()` fut
6. Ha egy ötlet `szavazas_vege` < most → az ötlet `kozos_munka` státuszba lép
7. Gamifikáció: +25 pont a szerzőnek (ötlet továbbjutott)

### Végállapotok
- A szavazat rögzítve/visszavonva, az ötlet automatikusan léphet a következő fázisba

---

## FLOW 12: Közös projekt munkatér

### Kiindulási pont
A lelkész egy `kozos_munka` státuszú ötlet „Megnyitás" gombjára kattint.

### Lépések
1. A közös munka workspace megnyílik (feladatok + mérföldkövek + dokumentumok + csapat)

**Csatlakozás:**
2. „Csatlakozom" gomb → INSERT `mm_szavazatok` (csatlakozás jelzővel)
3. Gamifikáció: +5 pont

**Feladat hozzáadás:**
4. „+ Feladat" → cím, leírás, felelős → INSERT `mm_feladatok`

**Feladat teljesítés:**
5. Toggle gomb → UPDATE `mm_feladatok` (teljesítve: true/false)
6. Gamifikáció: +5 pont teljesítéskor

**Mérföldkő:**
7. „+ Mérföldkő" → cím, dátum → INSERT `mm_merfoldkovek`
8. Toggle teljesítés

**Dokumentum feltöltés:**
9. Fájl kiválasztás → R2 feltöltés → INSERT `mm_dokumentumok`

**Megvalósult jelölés:**
10. A szerző „Megvalósult" gombra kattint → ötlet státusz: `megvalosult`
11. Gamifikáció: +50 pont a szerzőnek

### Végállapotok
- A projekt aktívan kezelt, feladatokkal és mérföldkövekkel

---

## FLOW 13: Gamifikáció áttekintés

### Kiindulási pont
A lelkész a „Jelvények" gombra kattint VAGY a ranglista fülre navigál.

### Lépések

**Jelvény modal:**
1. A rendszer betölti a jelvénytípusokat (`mm_jelveny_tipusok`) és a felhasználó jelvényeit (`mm_felhasznalo_jelveny`)
2. Grid megjelenítés: megszerzett (színes) és hiányzó (szürke) jelvények
3. Szint kijelzés: aktuális szint neve + progress bar a következő szintig

**Ranglista:**
4. A rendszer betölti az összes felhasználó statisztikáját
5. Rangsor: pontszám csökkenő → táblázat (név, gyülekezet, szint, pont)

### Végállapotok
- A lelkész látja a saját és mások eredményeit

---

# C) ÉRTESÍTÉSEK

---

## FLOW 14: Értesítések betöltése és valós idejű figyelés

### Kiindulási pont
A felhasználó bejelentkezik → az értesítés rendszer automatikusan elindul.

### Lépések
1. A `loadNotifications()` betölti az utolsó 20 olvasatlan értesítést
2. A csengő ikon badge-e frissül (olvasatlan szám)
3. A `_setupRealtimeNotifications()` feliratkozik a Supabase Realtime csatornára
4. Az `ertesitesek` tábla INSERT eseményeire figyel (szűrő: `user_id = bejelentkezett user`)

### Rendszer reakciók (új értesítésnél)
5. A Realtime csatorna jelzi az új értesítést
6. Toast megjelenik (típusfüggő szín + ikon)
7. A badge szám növekszik
8. A lista automatikusan frissül

### Végállapotok
- A felhasználó valós időben értesül minden új értesítésről

---

## FLOW 15: Értesítés megnyitása

### Kiindulási pont
A felhasználó a csengő ikonra kattint → a dropdown lista megjelenik.

### Lépések
1. Az utolsó 20 olvasatlan értesítés listában (típus ikon + cím + rövidített üzenet, max 80 karakter)
2. Kattintás egy értesítésre
3. A rendszer: UPDATE `ertesitesek.olvasott = true`
4. A részletes modal megnyílik (teljes tartalom)
5. A badge szám csökken

### Döntési pontok
- **Admin hozzáférés értesítés** → a modalban „Jóváhagyás" / „Elutasítás" gombok jelennek meg (FLOW 16)
- **Szimpla értesítés** → csak olvasás, nincs extra akció

### Végállapotok
- Az értesítés olvasottnak jelölve, a tartalom megjelenítve

---

## FLOW 16: Admin hozzáférés jóváhagyása / elutasítása

### Kiindulási pont
A lelkész (akinek a gyülekezetéhez hozzáférést kértek) megnyit egy admin hozzáférés értesítést.

### Lépések
1. Az értesítés modalban:
   - A kérelmező neve és e-mail címe
   - A kérelem oka
   - „Jóváhagyás" és „Elutasítás" gombok
2. **Jóváhagyás:**
   - UPDATE `admin_access_requests.status = 'approved'` + időkorlát beállítás
   - INSERT értesítés a kérelmezőnek: „Hozzáférés jóváhagyva (X óra)"
3. **Elutasítás:**
   - UPDATE `admin_access_requests.status = 'denied'`
   - INSERT értesítés a kérelmezőnek: „Hozzáférés elutasítva"

### Döntési pontok
- **A kérelem nem létezik** → hibaüzenet
- **A kérelem már elbírált** → a gombok nem jelennek meg

### Végállapotok
- A hozzáférés jóváhagyva (időkorláttal) VAGY elutasítva
- Mindkét fél értesítést kap

---

## FLOW 17: PWA telepítés

### Kiindulási pont
A felhasználó mobilon (vagy asztali böngészőben) a Kartotéka oldalt használja.

### Lépések
1. A böngésző `beforeinstallprompt` eseményt küld (ha támogatja)
2. Telepítési banner jelenik meg: „Telepítse a Kartotéka alkalmazást"
3. A felhasználó elfogadja → a böngésző telepíti az alkalmazást
4. VAGY elutasítja → a banner eltűnik

### Döntési pontok
- **Már telepítve** → a banner NEM jelenik meg
- **iOS Safari** → speciális kezelés (nincs `beforeinstallprompt`, csak tájékoztató)

### Végállapotok
- Az alkalmazás telepítve az eszközre VAGY a banner elutasítva
