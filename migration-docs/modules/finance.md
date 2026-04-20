# Pénzügyi modul — Elemzés

**Forrás fájlok (16 db, ~10.500 sor):**

| Fájl | Sor | Szerep |
|------|-----|--------|
| `penzugy_init.js` | 725 | Inicializálás, beállítások, átviteli egyenleg, járulékkezelés |
| `penzugy_income.js` | 1319 | Bevétel rögzítés, tag keresés, batch mód, családi összekötés |
| `penzugy_expense.js` | 301 | Kiadás rögzítés, partner keresés, leltár auto-jelölés |
| `penzugy_budget.js` | 372 | Költségvetés tervezés, véglegesítés, feloldás kérelem |
| `penzugy_accounting.js` | 586 | Számadás (éves zárás), záró leltár, véglegesítés |
| `penzugy_bank_api.js` | 1183 | Bankszámlák, BCR import, kassza, pénztárkönyv, valutacsere |
| `penzugy_belsomozgas.js` | 278 | Belső mozgások (kassza↔bank, bank↔bank, valutacsere) |
| `penzugy_transactions.js` | 1181 | Tranzakció lista, napi napló, pénztárkönyv nyomtatás |
| `penzugy_tranzakciok.js` | 498 | Egységes tranzakció nézet, havi szűrés, diagram |
| `penzugy_unified_modal.js` | 1986 | Központi modal orchestráció, dátum validáció, sorszámozás |
| `penzugy_monetary.js` | 33 | Monetár (pénztári egyeztetés, címlet-számolás) |
| `penzugy_audit.js` | 484 | Párosítatlan befizetések, magyar névfelismerés, intelligens összekötés |
| `penzugy_tartozasok.js` | 691 | Tartozások, bérleti szerződések, felmentések, többéves elemzés |
| `penzugy_print_engine.js` | 84 | PDF generálás wrapper (html2pdf) |
| `penzugy_print_budget.js` | 414 | Költségvetés nyomtatás (4-6 oszlopos layout) |
| `penzugy_print_accounting.js` | 458 | Számadás nyomtatás (részleges/teljes) |

**HTML:** `penzugy.html` (fő oldal), `components/modal_unified_transaction.html` (bevétel/kiadás modal)

---

## 1. Modul célja

A gyülekezet teljes pénzügyi adminisztrációja: bevételek és kiadások rögzítése, költségvetés tervezés és végrehajtás, éves számadás, bankszámla kezelés, belső pénzmozgások (kassza↔bank), járulék-nyilvántartás és tartozások, valamint az ehhez tartozó nyomtatások és auditálás. Ez a rendszer **legkomplexebb modulja** — kettős könyvelés elvű belső mozgásokkal és hierarchikus költségvetési tételekkel.

---

## 2. Fő funkciók

### 2.1. Bevétel rögzítés (income)
- **Egyedi rögzítés** — egy tag/szervezet, egy tétel, egy nyugta
- **Batch mód** — táblázatos tömeges rögzítés (többéves járulék, több tag egyszerre)
- **Tag keresés** — okos kereső diakritika-normalizálással, cím megjelenítéssel
- **Családi összekötés** — automatikus családtag-keresés az id_csalad alapján
- **Járulék kedvezmény** — automatikus kedvezmény-alkalmazás (kor, jövedelem, időszaki)
- **Kategória választó** — szamadasicel kódok hierarchikus dropdown
- **Nyugtaszám sorszámozás** — automatikus következő szám, duplikáció ellenőrzés
- **Cég/szervezet keresés** — bérleti szerződésekből betöltött cégek

### 2.2. Kiadás rögzítés (expense)
- **Partner keresés** — tag vagy cég (szabad szöveg is)
- **Kategória választó** — kiadás célok (kiadascel → szamadasicel)
- **Tételes bontás** — egy kiadás több kategóriára osztható
- **Leltár auto-jelölés** — ha a kategória beruházás/felszerelés → automatikusan leltárba kerül
- **Bizonylatszám** — kézi szám bevitel (számla sorszám)

### 2.3. Belső mozgások (kettős könyvelés)
- **Kassza → Bank** — készpénz befizetés bankba
- **Bank → Kassza** — készpénz kivét bankból
- **Bank → Bank** — átutalás bankszámlák között
- **Valutacsere** — RON ↔ EUR átváltás (BNR árfolyammal vagy kézzel)
- **Kettős bejegyzés** — minden mozgás egyszerre `befizetes` + `kiadas` rekordot hoz létre, `belso_mozgas_xkey` UUID-vel összekötve
- **BM sorszámozás** — `BM-{N}/{év}` formátum, külön számsor

### 2.4. Költségvetés (budget)
- **Tervezés** — bevétel és kiadás tételek összeg-kitöltése (szamadasicel alapú)
- **Élő egyenleg** — bevétel − kiadás valós idejű számítás
- **Véglegesítés** — zárolás (utána nem módosítható)
- **Módosítás kérelem** — feloldás kérés az esperesnek
- **Nyomtatás** — 4 vagy 6 oszlopos layout (sorszám, megnevezés, kód, összeg, [módosított, megjegyzés])

### 2.5. Számadás (accounting)
- **Éves zárás** — tényleges bevételek és kiadások a költségvetési tételek szerinti bontásban
- **Záró leltár** — fizikai készlet rögzítés (kassza + bank egyenleg)
- **Véglegesítés** — zárolás (esperes ellenőrzés után)
- **Feloldás kérelem** — esperes jóváhagyás szükséges
- **Nyomtatás** — terv vs. tény összehasonlítás, szekció-fejlécekkel

### 2.6. Bankszámla kezelés
- **Bank CRUD** — bankszámla felvétel (bank neve, IBAN, valuta, aktív)
- **BCR import** — CSV fájl feldolgozás banki kivonatból (auto-kategorizálás)
- **Bank tranzakciók** — szűrés bankszámla és hónap szerint
- **Pénztárkönyv** — kassza-tranzakciók listája havi bontásban, nyitó/záró egyenleggel
- **Pénztárkönyv PDF** — nyomtatható napi napló

### 2.7. Tranzakció nézet
- **Egységes lista** — bevétel + kiadás egy táblázatban
- **Havi szűrés** — hónap-választó dropdown
- **Diagram** — bevétel/kiadás trend (Chart.js)
- **Törlés** — egyes tételek soft delete (`deleted = true`)
- **Napi napló nyomtatás** — adott dátumra szűrve

### 2.8. Tartozások (debt tracking)
- **Járulék hátralék** — személyenkénti többéves elemzés (fizetett vs. elvárt)
- **Bérleti díj hátralék** — szerződés-alapú kintlévőség
- **Felmentések** — személyi/családi szintű járulékfelmentés
- **Kedvezmények** — kor, jövedelem, időszaki kedvezmények
- **Tartozás számítási mód** — „akkori" (az adott év járulékával) VAGY „aktuális" (a mai járulékkal)
- **Bérleti szerződés CRUD** — bérlő (személy/cég), összeg, időszak, gyakoriság

### 2.9. Audit (sorszám-ellenőrzés)
- **Hiányzó nyugta sorszámok** — automatikus felismerés (pl. 1, 3 → hol a 2?)
- **Párosítatlan befizetések** — `id_szemely = NULL` rekordok felismerése
- **Magyar névfelismerés** — asszonynév elemzés (férj neve + -né, lánykori név)
- **Intelligens összekötés** — pont-alapú egyeztetés (név + cím + kor)
- **Sorszám normalizálás** — hiányzó sorszámok automatikus kitöltése

### 2.10. Monetár (pénztári egyeztetés)
- **Címlet-táblázat** — 500, 200, 100, 50, 10, 5, 1, 0.50, 0.10, 0.05, 0.01 RON
- **Darabszám bevitel** — címletenként
- **Összesítés** — fizikai egyenleg vs. könyv szerinti egyenleg → eltérés kijelzés

---

## 3. Használt adatok

### Adatbázis táblák

| Tábla | Szerep | Művelet |
|-------|--------|---------|
| `befizetes` | Bevételek | TELJES CRUD (soft delete) |
| `kiadas` | Kiadások | TELJES CRUD (soft delete) |
| `befizetescel` | Bevétel kategóriák (junction) | SELECT |
| `kiadascel` | Kiadás kategóriák (junction) | SELECT |
| `szamadasicel` | Költségvetési tételek (kódok) | SELECT |
| `belsomozgas` | Belső mozgások | SELECT, INSERT (soft delete) |
| `koltsegvetes` | Költségvetés terv | SELECT, UPSERT |
| `bealitas` | Éves beállítások (járulék, véglegesítés) | SELECT, INSERT, UPDATE |
| `bankszamlak` | Bankszámlák | SELECT, INSERT, UPDATE |
| `valuta_atert` | Valutacsere árfolyamok | SELECT, INSERT |
| `leltar_tetelek` | Leltár tételek (kiadáshoz csatolva) | INSERT |
| `berleti_szerzodes` | Bérleti szerződések | TELJES CRUD |
| `felmentes` | Járulék felmentések | SELECT |
| `jarulek_kedvezmeny` | Járulék kedvezmények | SELECT, INSERT, UPDATE, DELETE |
| `iktato` | Iratszámozás (nyomtatáshoz) | SELECT, INSERT |
| `szemely` | Tagok (kereséshez) | SELECT |
| `csalad` | Családok (összekötéshez) | SELECT |
| `congregations` | Gyülekezet beállítások | SELECT |
| `profiles` | Felhasználói profil | SELECT |

### Kulcs kategória kódok (szamadasicel)

| Kód | Jelentés |
|-----|---------|
| 100.xx | Vagyon (100.01 = készpénz, 100.02 = banki) |
| 101.01 | Egyházfenntartói járulék (a legfontosabb bevétel) |
| 104.04–05 | Bérleti díjak |
| 200.xx | Kiadás főkategóriák |

---

## 4. Függvények listája

### Inicializálás (penzugy_init.js)
| Függvény | Leírás |
|----------|--------|
| `initPenzugy()` | Fő belépési pont — profil, beállítások, kategóriák, tagok betöltése |
| `createBealitasRecord()` | Éves beállítás létrehozás (ha nem létezik) |
| `_initPenzugyWithSettings()` | Adatok betöltése ha már van beállítás |
| `openJarulekManager()` | Járulék-beállítások modal |
| `saveJarulekSettings()` | Járulék + kedvezmények mentés |

### Bevétel (penzugy_income.js)
| Függvény | Leírás |
|----------|--------|
| `searchMembers(query)` | Tag keresés diakritika-normalizálással |
| `selectMemberForIncome(id)` | Tag kiválasztás + család betöltés |
| `renderIncomeRows()` | Bevétel sorok UI |
| `saveBefizetes(e)` | Egyedi bevétel mentés |
| `toggleBatchMode()` | Batch/egyedi mód váltás |
| `saveBatchIncome()` | Batch bevétel mentés |
| `_batchCheckJarulekKedvezmeny()` | Kedvezmény automatikus alkalmazás |

### Kiadás (penzugy_expense.js)
| Függvény | Leírás |
|----------|--------|
| `searchExpenseMembers(query)` | Kiadás partner keresés |
| `saveKiadas(e)` | Kiadás mentés |
| `toggleExpenseSplit()` | Tételes bontás toggle |

### Egységes modal (penzugy_unified_modal.js)
| Függvény | Leírás |
|----------|--------|
| `openUnifiedModal(tab)` | Bevétel/kiadás modal megnyitás |
| `saveUnifiedTransaction()` | Tranzakció mentés (bevétel VAGY kiadás) |
| `_getLastRecordedDate()` | Utolsó rögzített dátum lekérdezés |
| `_checkDateBackward(input)` | Visszamenőleges dátum ellenőrzés |
| `_getNextReceiptNumber()` | Következő nyugtaszám |
| `_getNextTransferNumber()` | Következő BM sorszám |
| `_batchCheckIratszam()` | Iratszám duplikáció ellenőrzés |

### Belső mozgás (penzugy_belsomozgas.js)
| Függvény | Leírás |
|----------|--------|
| `loadBelsomozgas()` | Belső mozgások betöltése |
| `setBmType(tipus)` | Típus váltás (kassza_bank, bank_bank, valutacsere) |
| `saveBelsomozgas()` | Kettős bejegyzés mentés (befizetes + kiadas + belsomozgas) |

### Bank (penzugy_bank_api.js)
| Függvény | Leírás |
|----------|--------|
| `loadBankAccounts()` | Bankszámlák betöltés |
| `saveNewBankAccount()` | Új bankszámla |
| `handleBCRFile()` | BCR CSV feldolgozás |
| `executeBankImport()` | Banki import végrehajtás |
| `generateKasszakonyvPDF()` | Pénztárkönyv PDF |

### Költségvetés + Számadás
| Függvény | Leírás |
|----------|--------|
| `loadKoltsegvetes()` | Költségvetés betöltés |
| `saveBudgetPlan()` | Terv mentés + véglegesítés |
| `loadSzamadas()` | Számadás betöltés |
| `finalizeAccounting()` | Számadás véglegesítés |
| `requestBudgetUnlock()` | Feloldás kérelem (esperesnek) |

### Tranzakciók + Audit
| Függvény | Leírás |
|----------|--------|
| `loadTranzakciok()` | Tranzakciók betöltés |
| `deleteTransaction(type, id)` | Soft delete |
| `checkMissingReceipts()` | Hiányzó sorszám audit |
| `checkUnlinkedPayments()` | Párosítatlan befizetések |
| `_parseHungarianWomensName()` | Magyar asszonynév elemzés |

### Tartozások
| Függvény | Leírás |
|----------|--------|
| `loadTartozasok()` | Többéves tartozás elemzés |
| `saveBerletiSzerzodes()` | Bérleti szerződés CRUD |

---

## 5. Függőségek

### Külső könyvtárak
| Könyvtár | Használat |
|----------|-----------|
| **html2pdf.js** | PDF generálás (lazy load) |
| **Chart.js** | Tranzakció diagram |
| **SheetJS (xlsx)** | BCR import CSV feldolgozás |

### Belső függőségek
| Modul | Mit használ |
|-------|-----------|
| `supabase_config.js` | `window._supabase` |
| `session_cache.js` | `getCachedProfile()` |
| `data_cache.js` | `cachedQuery()` |
| `lazy_libs.js` | `loadLib()` |
| `member_api.js` | `allChurchMembers` tag kereséshez |
| `lookup_api.js` | Cím szótárak |

---

## 6. Állapotkezelés

### Globális változók (25+)

| Változó | Típus | Tartalom |
|---------|-------|----------|
| `currentYear` | string | Aktív pénzügyi év |
| `activeCongregationId` | string | Gyülekezet UUID |
| `currentSettings` | object | Éves beállítások (bealitas rekord) |
| `evesJarulek` | number | Éves járulék összeg |
| `bevCelMap` | Record | befizetescel ID → szamadasicel kód |
| `kiaCelMap` | Record | kiadascel ID → szamadasicel kód |
| `_bmBevCelIds` | object | Belső mozgás bevétel cel ID-k (keszpenz/banki) |
| `_bmKiaCelIds` | object | Belső mozgás kiadás cel ID-k |
| `szamadasiCellek` | array | Összes költségvetési tétel |
| `allChurchMembers` | array | Gyülekezeti tagok |
| `bankAccounts` | array | Aktív bankszámlák |
| `allBefizetes` | array | Éves bevételek |
| `allKiadas` | array | Éves kiadások |
| `allBelsomozgas` | array | Éves belső mozgások |
| `autoCarryoverCash` | number | Nyitó egyenleg: kassza |
| `autoCarryoverBank` | number | Nyitó egyenleg: bank |
| `_jarulekPerYear` | Record | Évenkénti járulék összegek |
| `_jarulekKedvezmenyek` | array | Aktív kedvezmények |
| `_savedCompanies` | array | Cégek (bérleti szerződésekből) |
| `_lastRecordedDate` | string | Utolsó rögzített dátum |

---

## 7. UI kapcsolatok

### Fő oldal fülek (8 db)

| Fül | Tartalom |
|-----|----------|
| Dashboard | 4 KPI + egyenleg banner + friss tranzakciók |
| Kassza | Pénztárkönyv havi bontásban, nyitó/záró egyenleg |
| Bank | Bankszámla tranzakciók, BCR import, valutacsere |
| Terv (Költségvetés) | Bevétel/kiadás tételek, élő egyenleg, véglegesítés |
| Számadás | Terv vs. tény, záró leltár, véglegesítés |
| Tranzakciók | Egységes lista, havi szűrés, diagram |
| Tartozások | Járulék + bérleti hátralék, szerződések |
| Monetár | Pénztári egyeztetés (címlet-számolás) |

### Modal-ok
| Modal | Tartalom |
|-------|----------|
| Egységes tranzakció | Bevétel/kiadás rögzítés (egyedi + batch) |
| Belső mozgás | Kassza↔bank, bank↔bank, valutacsere |
| Nyomtatás | Költségvetés, számadás, napi napló |
| Elszámolás | Pénztári egyeztetés |
| Párosítatlan befizetések | Audit + intelligens összekötés |
| Bérleti szerződés | CRUD |
| Járulék beállítások | Kedvezmények, felmentések |
| Éves beállítás létrehozás | Ha nincs bealitas rekord az évre |

---

## 8. Hibakezelés

| Helyzet | Viselkedés |
|---------|-----------|
| Jövőbeli dátum | BLOKKOLVA — piros badge, mentés nem lehetséges |
| Visszamenőleges dátum | FIGYELMEZTETÉS — sárga badge, de engedélyezett (utolagos elszámolás) |
| Duplikált nyugtaszám | FIGYELMEZTETÉS — badge jelzi, de nem blokkolja |
| Hiányzó sorszám | Audit badge a fejlécben |
| Véglegesített költségvetés szerkesztése | BLOKKOLVA — feloldás kérelem szükséges |
| Véglegesített számadás szerkesztése | BLOKKOLVA — esperes feloldás szükséges |
| Nincs éves beállítás (bealitas) | Automatikus létrehozási modal |
| BCR import: ismeretlen formátum | Hiba üzenet, preview nélkül |
| Leltár kategória felismerés hiba | Csendben nem jelöli be — manuálisan is bejelölhető |

---

## 9. Rejtett működés

### Kettős könyvelés (belső mozgások)
Minden belső pénzmozgás (kassza↔bank) két rekordot hoz létre:
- **Bevétel oldal:** `befizetes` rekord (a célszámla kap pénzt)
- **Kiadás oldal:** `kiadas` rekord (a forrásszámla ad pénzt)
- **Összekötés:** azonos `belso_mozgas_xkey` UUID mindkét rekordban
- **Kategóriák:** 100.xx kódok (100.01 = készpénz, 100.02 = banki)
- **Sorszámozás:** `BM-{N}/{év}` — külön számsor a normál nyugtáktól

### Átviteli egyenleg számítás
Az előző év záró egyenlege automatikusan a következő év nyitó egyenlege:
- Kassza: előző év utolsó napi egyenleg (bevétel − kiadás, csak készpénz)
- Bank: előző év utolsó napi egyenleg (bevétel − kiadás, csak banki)
- Ha nincs előző évi adat → 0

### Járulék kedvezmény rendszer
A kedvezmények automatikusan alkalmazódnak bevétel rögzítéskor:
1. **Kor-alapú** — pl. 80 év felett 50% kedvezmény
2. **Jövedelem-alapú** — pl. alacsony jövedelmű → felmentett
3. **Időszaki** — pl. ha július 1. előtt fizet → 50% kedvezmény
4. **Személyi felmentés** — egyedi felmentés (felmentes tábla)

### Leltár automatikus jelölés
Ha a kiadás kategóriája tartalmazza a kulcsszavakat (beruházás, felszerelés, leltár, eszköz, gép, bútor), a rendszer automatikusan:
- Bejelöli a leltár checkbox-ot
- A mentéskor `leltar_tetelek` rekordot is létrehoz a kiadás adataival

### Magyar asszonynév felismerés (audit)
A párosítatlan befizetések összekötésekor a rendszer elemzi a `forrasa` mező tartalmát:
- `Kovács Istvánné` → a férj családneve alapján keres
- `Kovács Istvánné Erzsébet` → „Kovács Erzsébet" néven keres
- `Becsek Richárdné Stefán Beáta` → lánykori néven keres (Stefán Beáta)
- Prefix-ek eltávolítása: `ifj.`, `id.`, `dr.`, `özv.`

### Költségvetési tétel hierarchia
A szamadasicel tételek hierarchikusan rendezettek:
- Főkategória: `100` (Vagyon)
- Alkategória: `100.01` (Készpénz)
- Részlet: `100.01.A` (Aprópénz)
- Rendezés: numerikusan, részenként (`_sortCellsHierarchically`)

### Két különálló sorszám-rendszer
1. **Normál nyugtaszám** — automatikus növekvő szám készpénzes bevételeknél (1, 2, 3...)
2. **BM sorszám** — belső mozgásoknál `BM-1/2026, BM-2/2026` formátum
- Duplikáció és hiány ellenőrzés mindkét rendszerben

### Tartozás számítási mód
A gyülekezet beállíthatja hogyan számolja a régi évek hátralékát:
- **„akkori"** — az adott év járulékával számol (pl. 2023-ban 80 RON volt)
- **„aktuális"** — a mai járulékkal számol (pl. most 100 RON → régi évekre is 100 RON)
