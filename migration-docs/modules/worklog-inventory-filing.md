# Munkanapló + Leltár + Iktatás — Elemzés

**Fázis 6 — három közepes méretű modul egyben**

| Modul | Forrás | Sor | Tábla | Függvény |
|-------|--------|-----|-------|----------|
| Munkanapló | `worklog_api.js` | 747 | 4 | 18 |
| Leltár | `leltar.js` + `leltar_print_jelentes.js` | 1637 | 4 | 47 |
| Iktatás | `iktato_api.js` | 336 | 3 | 10 |
| **Összesen** | | **2720** | | **75** |

---

## 1. Modul célja

### Munkanapló
A lelkész napi szolgálatainak nyilvántartása: istentiszteletek, katekézis, családlátogatások. Automatikusan kapcsolódik az anyakönyvhöz (keresztelés, házasság, temetés → munkanapló bejegyzés).

### Leltár
A gyülekezet vagyontárgyainak nyilvántartása: felszerelések, telkek, könyvek, kegyszerek. Értékcsökkenés-számítás, duplikáció audit, vonalkód-leolvasás, 4 féle nyomtatási formátum, véglegesítés és feloldás.

### Iktatás
Az egyházi dokumentumok nyilvántartása: érkező és kimenő iratok sorszámozása, irattározás, elintézési nyomon követés, iktatókönyv nyomtatás.

---

## 2. Fő funkciók

### 2.1. Munkanapló

- **3 kategória fül:** Szolgálat, Katekézis, Látogatás
- **Bejegyzés CRUD** — dátum, típus (jellege), cím, leírás, megjegyzés
- **Szolgálatnál extra mezők:** résztvevők (férfi/nő/gyermek), perselypénz, igehely, szolgálatvezetők
- **Látogatásnál:** család/személy keresés a tagnyilvántartásból, cím auto-töltés
- **Anyakönyv integráció:** a keresztelés/házasság/temetés automatikusan bejegyzést hoz létre a munkanaplóban (ha a checkbox be van jelölve)
- **Havi szűrő** — hónap-választó dropdown
- **Jelentés generálás** — egyházmegyei beszámoló (II, IV, V, VII szekciók) összesített statisztikával
- **Excel export** — szűrt adatok CSV-be
- **Nyomtatás** — formázott nyomtatási nézet

### 2.2. Leltár

- **7 kategória:** Alapeszközök, Telkek/Földek, Csekély értékű, Könyvek, Kegyszerek, Kárpótlási, Bizományi
- **Tétel CRUD** — leltári szám (auto), megnevezés, beszerzési dátum, érték, amortizáció, felelős személy, helyszín
- **Értékcsökkenés számítás** — a 2139/2004 törvényi katalógus használati időtartamai alapján automatikus amortizáció
- **Duplikáció audit** — hasonló tételek felismerése és összevonás lehetőség (wizard)
- **Vonalkód-leolvasás** — fizikai leltárfelvételhez (zxing könyvtár)
- **4 nyomtatási formátum:**
  1. Vagyonleltári Jelentés (összesítő)
  2. Leltárív (részletes, amortizációval)
  3. Alapeszköz Karton (tételenkénti)
  4. Registru Inventar (román nyelvű formátum)
- **Véglegesítés** — lezárás (esperes feloldással)
- **Szűrés** — kategória + helyszín

### 2.3. Iktatás

- **Kétirányú nyilvántartás** — érkező és kimenő iratok
- **Automatikus sorszámozás** — `{YYYY}/{sorszám}` formátum
- **Irattári kezelés** — mappa-kötegek: F.Á. (Egyéb), É.Á. (Éves Admi.), A.K. (Anyakönyvi)
- **Elintézés nyomon követés** — dátum + mód (függőben / elintézett)
- **Keresés** — full-text keresés több mezőben
- **Statisztikák** — összes, érkező, kimenő, függőben
- **Iktatókönyv nyomtatás** — A4 fekvő formátum
- **Keresztelési igazolás generálás** — személy adataiból

---

## 3. Használt adatok

### Munkanapló

| Tábla | Művelet | Megjegyzés |
|-------|---------|-----------|
| `munkanaplo` | TELJES CRUD | Fő bejegyzés tábla |
| `profiles` | SELECT | Gyülekezet azonosító |
| `szemely` | SELECT | Családlátogatásnál személy/család keresés |
| `keresztseg`, `hazassag`, `temetes` | SELECT | Kapcsolt anyakönyvi bejegyzés ID |

**Munkanapló rekord mezők:**
`id, idopont (dátum), jellege (típus), cim, leiras, megjegyzes, resztvevok_ferfi, resztvevok_no, resztvevok_gyermek, persely, igehely, szolgalatvezeto, id_szemely, id_csalad, congregation_id, munkanaplo_id (önreferencia anyakönyvből), deleted`

### Leltár

| Tábla | Művelet | Megjegyzés |
|-------|---------|-----------|
| `leltar_tetelek` | TELJES CRUD | Leltár tételek |
| `bealitas` | SELECT, UPDATE | Véglegesítés flag (`leltar_finalized`) |
| `profiles` | SELECT | Szerepkör ellenőrzés |
| `iktato` | INSERT | Iktatás integráció (nyomtatás iktatása) |

**Leltár tétel mezők:**
`id, leltari_szam, megnevezes, kategoria, katalogus_kod, hasznalati_ido, beszerzes_datuma, beszerzes_erteke, jelenlegi_erteke, amortizacio_pct, helyszin, felelős_id, felelős_nev, megjegyzes, vonalkod, kiadas_id, deleted, congregation_id`

### Iktatás

| Tábla | Művelet | Megjegyzés |
|-------|---------|-----------|
| `iktato` | TELJES CRUD | Iktatott dokumentumok |
| `szemely` | SELECT | Igazolás generáláshoz |
| `keresztseg` | SELECT | Keresztelési igazoláshoz |

**Iktatás rekord mezők:**
`id, year, sequence_number, direction (incoming/outgoing), kelt (dátum), file_folder (mappa), subject, sender_or_recipient, targykivonat, elintezes_ideje, elintezes_modja, irattarijel, megjegyzes, deleted, congregation_id`

---

## 4. Függvények listája

### Munkanapló (18 db)

| Függvény | Leírás |
|----------|--------|
| `loadWorklogs()` | Havi bejegyzések betöltése |
| `renderTable()` | Táblázat renderelés |
| `openWorklogModal()` | Új bejegyzés modal |
| `editWorklog(id)` | Szerkesztés |
| `handleWorklogSubmit(e)` | Mentés (insert/update) |
| `deleteWorklog(id)` | Soft delete |
| `adaptWorklogForm()` | Kategóriafüggő mezők megjelenítés |
| `generateReport()` | Egyházmegyei beszámoló |
| `exportToExcel()` | CSV export |
| `printWorklog()` | Nyomtatás |
| `triggerWorklogFromRegistry(source, id, date, jellege, text)` | Anyakönyvi trigger |
| `searchFamilyForWorklog(val)` | Család/személy keresés |
| `selectFamilyForWorklog(name, addr, id)` | Kiválasztás |

### Leltár (47 db — kulcsok)

| Függvény | Leírás |
|----------|--------|
| `initLeltar()` | Inicializálás |
| `renderLeltarTable(kat, hely)` | Tábla renderelés szűrőkkel |
| `renderLeltarStats()` | Statisztika frissítés |
| `openNewLeltarModal()` | Új tétel |
| `editLeltarTetel(id)` | Szerkesztés |
| `saveLeltarTetel(e)` | Mentés + duplikáció ellenőrzés |
| `deleteLeltarTetel(id)` | Soft delete |
| `generateNextLeltariSzam(kategoria)` | Automatikus leltári szám |
| `startLeltarAudit()` | Duplikáció wizard indítás |
| `showNextAuditItem()` | Következő gyanús duplikátum |
| `auditAction(action)` | Audit döntés (összevon/töröl/hagy) |
| `generateLeltarPDF()` | 4 féle PDF generálás |
| `finalizeLeltar()` | Véglegesítés |
| `requestLeltarUnlock()` | Feloldás kérelem |
| `printVagyonleltarJelentes(ev, reprint)` | Nyomtatás |
| `saveLeltarMetadata(data)` | Iktatás integráció |
| `startBarcodeScanner()` | Vonalkód-leolvasó indítás |
| `UniversalSmartSearch(query, container, callback)` | Tag keresés |

### Iktatás (10 db)

| Függvény | Leírás |
|----------|--------|
| `loadIktato(dir)` | Iratok betöltése (irány szűrő) |
| `openIktatoModal(record)` | Új/szerkesztés modal |
| `handleIktatoSubmit(e)` | Mentés |
| `deleteIktato()` | Soft delete |
| `iktatoSearch(val)` | Full-text keresés |
| `printIktatokonyv()` | Iktatókönyv nyomtatás |
| `generateBaptismCert(memberId)` | Keresztelési igazolás |
| `_updateIktatoStats(data)` | Statisztikák frissítés |
| `_initIktatoYearSelect()` | Év-választó init |

---

## 5. Függőségek

| Könyvtár | Használat | Modul |
|----------|-----------|-------|
| **html2pdf.js** | PDF generálás | Leltár, Iktatás |
| **SheetJS (xlsx)** | Excel export | Munkanapló |
| **zxing** | Vonalkód-leolvasó | Leltár |
| **Bootstrap 5** | Modal-ok | Mind |

---

## 6. Állapotkezelés

### Munkanapló
| Változó | Tartalom |
|---------|----------|
| `allWorklogs` | Aktuális hónap bejegyzései |
| `currentCategory` | Aktív fül (szolgalat/katekezis/latogatas) |
| `pendingRegistryLink` | Anyakönyvi bejegyzés összekötés state |

### Leltár
| Változó | Tartalom |
|---------|----------|
| `allLeltarTetelek` | Összes leltár tétel |
| `currentSettings` | Éves beállítás (véglegesítés flag) |
| `leltarKatalogus` | 2139/2004 katalógus kódok |
| `auditList` / `auditCurrentIndex` | Duplikáció wizard állapot |

### Iktatás
| Változó | Tartalom |
|---------|----------|
| `currentDirection` | Szűrő: incoming/outgoing/all |
| `currentIktatoYear` | Szűrő: kiválasztott év |
| `iktatoSearchQuery` | Keresőszöveg |

---

## 7. UI kapcsolatok

### Munkanapló
- **3 kategória fül:** Szolgálat / Katekézis / Látogatás
- **Hónap szűrő** dropdown
- **Bejegyzés modal** (kategóriafüggő mezők)
- **Nyomtatási nézet** + **Jelentés** nézet (mindkettő új ablakban)

### Leltár
- **Szűrő sáv:** kategória + helyszín dropdown
- **Statisztika panel:** tétel szám, összérték, legértékesebb
- **Tétel modal** (katalógus kód, amortizáció, felelős keresés)
- **Nyomtató központ modal** (4 nyomtatási típus választó)
- **Audit wizard modal** (lépésenként gyanús duplikátumok)
- **Feloldás kérelem modal**

### Iktatás
- **Irány fülek:** Érkező / Kimenő / Mind
- **Év-választó** + **Keresés**
- **Statisztika kártyák** (összes, érkező, kimenő, függőben)
- **Irat modal** (sorszám auto, irány, mappa, tárgy, feladó/címzett, elintézés)

---

## 8. Hibakezelés

| Modul | Helyzet | Viselkedés |
|-------|---------|-----------|
| Munkanapló | Anyakönyv trigger hiba | Try-catch → silent fail |
| Munkanapló | Hónap szűrő: nincs adat | „Nincs bejegyzés" üzenet |
| Leltár | Duplikált tétel | Audit wizard felajánlás |
| Leltár | Véglegesített → szerkesztés | Blokkolva → feloldás kérelem |
| Leltár | Vonalkód-leolvasó hiba | Fallback: kézi bevitel |
| Iktatás | Sorszám ütközés | Max+1 logika (concurrent: kis kockázat) |
| Iktatás | Soft delete | `deleted = true`, nem jelenik meg |

---

## 9. Rejtett működés

### Munkanapló — anyakönyvi összekötés
A `triggerWorklogFromRegistry()` függvényt az anyakönyv modul hívja:
- Kereszteléskor: „Keresztelő" bejegyzés + alapige
- Házasságkor: „Esketés" bejegyzés
- Temetéskor: „Temetés" bejegyzés
Az összekötés a `munkanaplo_id` mezőn keresztül történik (visszafelé: anyakönyvi rekord → munkanapló ID).

### Leltár — értékcsökkenés automatika
Az amortizáció a 2139/2004 törvényi katalógus alapján számolódik:
- Katalógus kód kiválasztásakor a használati időtartam (évek) automatikusan töltődik
- Az éves értékcsökkenés: `beszerzési_érték / használati_idő`
- A jelenlegi érték: `beszerzési_érték - (kor_években × éves_amortizáció)`
- Negatív jelenlegi érték nem lehetséges (min 0)

### Leltár — duplikáció audit wizard
1. A rendszer összehasonlítja a tételeket: hasonló megnevezés + hasonló érték
2. A gyanús párokat egy listába gyűjti
3. A wizard lépésenként mutatja: „Ez a két tétel duplikátum?"
4. Lehetőségek: összevonás (értékek összeadódnak), törlés (az egyiket törli), kihagyás

### Leltár — kiadás összekötés
Ha a kiadás modulban egy tétel leltár-jellegű kategóriába esik → automatikusan `leltar_tetelek` INSERT a kiadás adataival. A `kiadas_id` mező köti össze a kettőt.

### Iktatás — automatikus sorszámozás
Format: `{YYYY}/{sorszám}` — pl. `2026/1`, `2026/2`
- Évenként újraindul
- A rendszer a maximumot keresi és inkrementálja
- A leltár nyomtatásakor automatikusan iktatókönyvi bejegyzés is keletkezik (`saveLeltarMetadata`)
