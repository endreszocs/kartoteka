# Munkanapló + Leltár + Iktatás — Üzleti szabályok

---

## 1. Jogosultságok

### Ki mit lát

- Minden modul KIZÁRÓLAG a saját gyülekezet adatait mutatja (RLS: `congregation_id`)

### Ki mit tehet

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| **Munkanapló** — bejegyzés CRUD | ✅ | ✅ | ✅ | ✅ |
| **Munkanapló** — jelentés generálás | ✅ | ✅ | ✅ | ✅ |
| **Munkanapló** — Excel export | ✅ | ✅ | ✅ | ✅ |
| **Leltár** — tétel CRUD | ✅ | ✅ | ✅ | ✅ |
| **Leltár** — véglegesítés | ✅ | ✅ | ✅ | ✅ |
| **Leltár** — feloldás (véglegesítés után) | ❌ | ✅ (esperes) | ✅ | ✅ |
| **Leltár** — duplikáció audit | ✅ | ✅ | ✅ | ✅ |
| **Leltár** — nyomtatás (4 formátum) | ✅ | ✅ | ✅ | ✅ |
| **Iktatás** — irat CRUD | ✅ | ✅ | ✅ | ✅ |
| **Iktatás** — iktatókönyv nyomtatás | ✅ | ✅ | ✅ | ✅ |
| **Iktatás** — igazolás generálás | ✅ | ✅ | ✅ | ✅ |

---

## 2. Szabályok

### MUNKANAPLÓ

#### Három kategória

| Kategória | Magyar név | Mikor használt | Extra mezők |
|-----------|-----------|---------------|-------------|
| **szolgalat** | Szolgálat | Istentisztelet, igehirdetés, úrvacsora | Résztvevők (férfi/nő/gyermek), perselypénz, igehely, szolgálatvezetők |
| **katekezis** | Katekézis | Hittan, bibliaóra, konfirmáció előkészítő | Résztvevők |
| **latogatas** | Látogatás | Családlátogatás, kórházlátogatás | Meglátogatott személy/család (tag keresés + cím) |

#### Anyakönyvi összekötés

- A keresztelés, házasság és temetés modulok automatikusan munkanapló bejegyzést hoznak létre (ha a checkbox be van jelölve)
- A `munkanaplo_id` mező köti össze az anyakönyvi bejegyzést a munkanapló bejegyzéssel
- Az anyakönyvi bejegyzés törlése NEM törli a munkanapló bejegyzést
- A munkanapló bejegyzés törlése NEM törli az anyakönyvi bejegyzést

#### Havi szűrés

- A bejegyzések hónap szerint szűrhetők (dropdown)
- Alapértelmezés: aktuális hónap

#### Jelentés

- Az egyházmegyei beszámoló a II, IV, V, VII szekciókban összesített statisztikákat tartalmaz:
  - Szolgálatok száma, átlagos részvétel
  - Katekézis alkalmak
  - Látogatások száma
  - Perselypénz összesítés

### LELTÁR

#### Hét kategória

| Kategória | Leírás |
|-----------|--------|
| Alapeszközök | Bútorok, felszerelések, technikai eszközök |
| Telkek / Földek | Ingatlanok, földterületek |
| Csekély értékű | Kis értékű fogyóeszközök |
| Könyvek | Könyvtári állomány |
| Kegyszerek | Liturgiai felszerelések (kehely, tálca, terítők) |
| Kárpótlási | Kárpótlásból származó vagyontárgyak |
| Bizományi | Idegen tulajdonban lévő, megőrzésre kapott tárgyak |

#### Leltári szám generálás

- Formátum: kategória-kód + sorszám (pl. `AE-001`, `TF-012`)
- A sorszám kategórián belül automatikusan növekszik
- A szám nem módosítható utólag

#### Értékcsökkenés (amortizáció)

- A 2139/2004 törvényi katalógus alapján a tételhez tartozó használati időtartam (évek) automatikusan töltődik
- Éves értékcsökkenés = beszerzési érték / használati idő
- Jelenlegi érték = beszerzési érték − (kor × éves értékcsökkenés)
- Minimum jelenlegi érték: 0 (nem mehet negatívba)

#### Véglegesítés

- A leltár éves szinten véglegesíthető (zárolás)
- Véglegesített leltár NEM szerkeszthető
- Feloldás: esperes/admin jóváhagyás szükséges

#### Kiadás-összekötés

- Ha a pénzügyi modulban egy kiadás leltár-jellegű kategóriába esik → automatikusan leltár tétel is létrejön
- A `kiadas_id` mező köti össze a kettőt

### IKTATÁS

#### Kétirányú sorszámozás

- Formátum: `{YYYY}/{sorszám}` — pl. `2026/1`, `2026/42`
- Évenként újraindul
- Érkező és kimenő iratok KÖZÖS sorszámozást használnak
- A rendszer automatikusan a következő szabad számot ajánlja

#### Irány

| Irány | Leírás |
|-------|--------|
| **Érkező** (incoming) | Más szervtől kapott dokumentum |
| **Kimenő** (outgoing) | A gyülekezet által kiállított dokumentum |

#### Mappa-kötegek

| Kód | Név | Tartalom |
|-----|-----|----------|
| F.Á. | Egyéb iratok | Általános levelezés |
| É.Á. | Éves adminisztráció | Költségvetés, számadás, kimutatások |
| A.K. | Anyakönyvi | Anyakönyvi kivonatok, igazolások |

#### Elintézés nyomon követés

- Minden iratnak van „elintézés" státusza
- Ha az elintézés dátuma és módja ki van töltve → elintézett
- Ha nincs → függőben

---

## 3. Validációk

### Munkanapló

| Mező | Szabály |
|------|---------|
| Dátum (idopont) | **Kötelező** |
| Típus (jellege) | **Kötelező** |
| Cím | Opcionális |
| Résztvevők (férfi/nő/gyermek) | Opcionális, pozitív egész szám |
| Perselypénz | Opcionális, pozitív szám |
| Személy/család (látogatás) | Opcionális, tag keresőből |

### Leltár

| Mező | Szabály |
|------|---------|
| Megnevezés | **Kötelező** |
| Kategória | **Kötelező** (7 közül) |
| Beszerzési dátum | Opcionális |
| Beszerzési érték (RON) | **Kötelező**, pozitív szám |
| Katalógus kód | Opcionális (de az amortizációhoz szükséges) |
| Helyszín | Opcionális (szabad szöveg VAGY dropdown) |
| Felelős személy | Opcionális (tag keresőből) |
| Leltári szám | Auto-generált, **egyedi** |
| Vonalkód | Opcionális |

### Iktatás

| Mező | Szabály |
|------|---------|
| Sorszám | Auto-generált |
| Irány | **Kötelező** (incoming/outgoing) |
| Dátum (kelt) | **Kötelező** |
| Tárgy | **Kötelező** |
| Feladó/Címzett | Opcionális |
| Mappa-köteg | **Kötelező** (F.Á./É.Á./A.K.) |
| Elintézés dátuma | Opcionális |
| Elintézés módja | Opcionális |

---

## 4. Korlátozások

### Munkanapló

- Soft delete — törölt bejegyzések nem jelennek meg
- Az anyakönyvből létrehozott bejegyzés: a `munkanaplo_id` visszafelé is mutat
- A törlés NEM kaszkádol az anyakönyvbe

### Leltár

- **Véglegesített leltár NEM szerkeszthető** — feloldás kérelem szükséges (esperes)
- Az amortizáció NEM módosítható kézzel — a katalógus kód határozza meg
- A `kiadas_id`-vel összekötött tétel törlése nem törli a kiadás rekordot
- A duplikáció audit wizard „összevonás" művelete visszavonhatatlan

### Iktatás

- Soft delete — az irat nem jelenik meg, de az adatbázisban megmarad
- A sorszám egyedi az éven belül — concurrent ütközés elméletileg lehetséges
- A leltár nyomtatásakor automatikusan iktatókönyvi bejegyzés keletkezik

---

## 5. Workflow szabályok

### Munkanapló bejegyzés rögzítése

```
1. A lelkész kiválasztja a kategóriát (Szolgálat / Katekézis / Látogatás)
2. A form mezők dinamikusan változnak:
   — Szolgálat: résztvevők, perselypénz, igehely, szolgálatvezetők
   — Katekézis: résztvevők
   — Látogatás: személy/család kereső (tagnyilvántartásból)
3. Kitölti: dátum, típus, cím, leírás
4. „Mentés" → INSERT munkanaplo
5. A lista frissül
```

### Munkanapló — anyakönyvi trigger

```
1. Az anyakönyv modulban a „Rögzítés a munkanaplóba" checkbox bejelölve
2. Az anyakönyvi bejegyzés mentésekor:
   — triggerWorklogFromRegistry(forrás_tábla, forrás_id, dátum, típus, szöveg) hívódik
3. A munkanapló tábla kap egy új bejegyzést:
   — jellege: „Keresztelő" / „Esketés" / „Temetés"
   — dátum: az anyakönyvi esemény dátuma
   — cim: az alapige (keresztelésnél) vagy üres
4. A munkanaplo_id visszakerül az anyakönyvi rekordba
```

### Leltár tétel rögzítése

```
1. Lelkész a „+ Új tétel" gombra kattint
2. Leltári szám automatikusan generálódik (kategória + sorszám)
3. Kitölti: megnevezés, kategória, beszerzési érték, dátum
4. Opcionálisan: katalógus kód kiválasztás → használati idő auto-töltés
5. Opcionálisan: felelős személy (tag kereső), helyszín, vonalkód
6. „Mentés" → duplikáció ellenőrzés:
   a) Ha hasonló tétel létezik → rákérdez: „Duplikátum? Összevonás / Kihagyás"
   b) Ha nincs → INSERT leltar_tetelek
```

### Leltár duplikáció audit

```
1. Lelkész az „Audit" gombra kattint
2. A rendszer végigfut az összes tételen:
   — Hasonló megnevezés keresése (fuzzy match)
   — Hasonló érték keresése
3. A gyanús párokat listába gyűjti
4. Wizard indul: lépésenként mutatja a párokat
5. Minden párnál 3 lehetőség:
   a) Összevonás → az értékek összeadódnak, az egyik törlődik
   b) Törlés → az egyik törlődik
   c) Kihagyás → mindkettő megmarad
6. A wizard végén összesítés
```

### Leltár véglegesítés és nyomtatás

```
1. Lelkész a „Véglegesítés" gombra kattint
2. A rendszer: bealitas.leltar_finalized = true
3. Az összes tétel zárolódik (nem szerkeszthető)
4. A nyomtatási központ megnyílik (4 formátum):
   a) Vagyonleltári Jelentés — összesítő (kategóriánkénti csoportosítás)
   b) Leltárív — részletes (minden tétel, amortizációval)
   c) Alapeszköz Karton — tételenkénti adatlap
   d) Registru Inventar — román nyelvű formátum
5. A nyomtatás automatikusan iktatókönyvi bejegyzést hoz létre
6. Feloldás: esperes kérelem → bealitas.leltar_finalized = false
```

### Iktatás — irat rögzítése

```
1. Lelkész az „+ Új irat" gombra kattint
2. A sorszám automatikusan generálódik: {YYYY}/{max+1}
3. Kitölti: irány, dátum, tárgy, feladó/címzett, mappa-köteg
4. Opcionálisan: elintézés dátuma + módja
5. „Mentés" → INSERT iktato
6. A lista frissül, a statisztikák frissülnek
```

### Iktatás — iktatókönyv nyomtatás

```
1. Lelkész a „Nyomtatás" gombra kattint
2. A rendszer az aktuális évre szűri az iratokat
3. A4 fekvő formátumban generál:
   — Sorszám, dátum, tárgy, feladó/címzett, mappa, elintézés, irattári jel
4. Nyomtatási ablak nyílik
```

---

## 6. Edge case-ek

### Munkanapló

| Eset | Mi történik |
|------|-------------|
| Anyakönyvi trigger: a munkanapló modul nincs betöltve | A trigger csendben nem fut le (try-catch) |
| Anyakönyvi bejegyzés törlés → munkanapló megmarad | A munkanapló bejegyzés NEM törlődik automatikusan |
| Munkanapló bejegyzés törlés → anyakönyv megmarad | Az anyakönyvi `munkanaplo_id` nem nullázódik |
| Szolgálatnál résztvevők = 0 | Megengedett (pl. meghiúsult alkalom) |
| Perselypénz = 0 | Megengedett |
| Látogatásnál: a személy nincs a rendszerben | Szabad szöveges név bevitel (id_szemely = null) |
| Havi szűrő: az adott hónapban nincs bejegyzés | „Nincs bejegyzés" üzenet |
| Jelentés: nincs adat az időszakra | A jelentés üres szekciókkal generálódik |

### Leltár

| Eset | Mi történik |
|------|-------------|
| Véglegesített leltár szerkesztése | BLOKKOLVA → feloldás kérelem (esperes) |
| Feloldás kérelem elküldve | „Várakozás az elbírálásra..." gomb |
| Duplikáció audit: nincs gyanús pár | „Minden rendben, nincs duplikátum" üzenet |
| Duplikáció összevonás: az érték 0-ra csökken | Megengedett (csekély értékűeknél) |
| Katalógus kód nincs kiválasztva | Az amortizáció nem számolódik (jelenlegi érték = beszerzési érték) |
| Használati idő lejárt (amortizáció 100%) | Jelenlegi érték = 0, a tétel megmarad a leltárban |
| Kiadásból automatikusan létrejött tétel törlése | A kiadás rekord megmarad (nem kaszkádol) |
| Vonalkód duplikáció | Nincs explicit ellenőrzés — de ritka |
| Felelős személy törlődik (tag kivezetés) | A leltár tétel megmarad a régi névvel |
| Nyomtatás: 0 tétel az adott kategóriában | Az összesítő sor 0 értékkel jelenik meg |
| Nyomtatás: iktatás hiba | A nyomtatás megtörténik, az iktatás figyelmeztetéssel sikertelen |

### Iktatás

| Eset | Mi történik |
|------|-------------|
| Concurrent sorszám-generálás | Elméletileg ütközhet (max+1 logika, nincs DB unique) |
| Évre nincs korábbi irat | Az első sorszám: `{YYYY}/1` |
| Soft delete → a sorszám „lyukassá" válik | Megengedett — a törölt sorszám nem kerül újra kiosztásra |
| Elintézés nélküli irat | „Függőben" státusz, a statisztikában számolódik |
| Keresés: speciális karakterek | HTML escape alkalmazódik |
| Keresztelési igazolás: a személy nincs megkeresztelve | A rendszer a szemely + keresztseg táblát is nézi — ha nincs bejegyzés, hiányos igazolás |
| Leltár nyomtatás → auto iktatás sikertelen | A nyomtatás megtörténik, az iktatás hibaüzenettel jelződik |
| Év-váltás: az új évre nincs irat | Az év-választó az aktuális évet mutatja, üres lista |
