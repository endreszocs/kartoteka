# Anyakönyv modul — Elemzés

**Forrás:** `anyakonyv_api.js` (1940 sor)
**HTML:** `anyakonyv.html` (144 sor)

---

## 1. Modul célja

A gyülekezet egyházi szertartásainak hivatalos nyilvántartása: keresztelés, konfirmáció, házasság, temetés, valamint a tagmozgások (beköltözés, elköltözés, áttérés, kitérés) rögzítése. Minden bejegyzés okiratszámot kap, a személy táblához kapcsolódik, és opcionálisan a munkanaplóba is bekerül szolgálatként. A modul szorosan integrálódik a tagnyilvántartással — kereszteléskor automatikusan család is létrejöhet.

---

## 2. Fő funkciók

### 2.1. Áttekintő (dashboard)
- Statisztikai összesítés (bejegyzések típusonként, éves bontásban)
- Placeholder — a régi rendszerben minimálisan implementált

### 2.2. Keresztelés (keresztseg)
- **CRUD** — bejegyzés létrehozás/szerkesztés/törlés
- **Okiratszám generálás** — YYYY + 5 jegyű sorszám (pl. 202601001)
- **Szülő keresés és összekötés** — apa/anya CNP-vel a szemely táblához
- **Családi automatikus létrehozás** — ha szülők megadva → család + gyerek regisztráció
- **Emléklap nyomtatás** — HTML sablon: név, születési hely/dátum, keresztelés dátuma, lelkész, keresztszülők, alapige
- **Munkanapló integráció** — checkbox: a keresztelés bekerül a lelkészi munkanaplóba
- **Sablon adatok** — extra mezők (anya leánykori neve, szülők vallása) a megjegyzes mezőben JSON-ként, `|sablon:` delimiter után

### 2.3. Konfirmáció (konfirmalas)
- **Tömeges rögzítés** — konfirmandusok listája, egyszerre mentés
- **Korosztály kereső** — 12–16 éves tagok automatikus szűrése
- **Hiányzó keresztelés wizard** — ha a konfirmandusnak nincs keresztelési bejegyzése, a rendszer felajánlja a pótlást (wizard: lépésenként minden hiányzó tagra)
- **Egyedi szerkesztés/törlés** — meglévő konfirmáció bejegyzés módosítása
- **Munkanapló integráció** — „Konfirmáció (X fő)" bejegyzés

### 2.4. Házasság (hazassag)
- **CRUD** — vőlegény + menyasszony (két személy kapcsolat)
- **Tanúk** — szabad szöveges mező
- **Okiratszám** — automatikus generálás

### 2.5. Temetés (temetes)
- **CRUD** — halál dátum, temetés dátum, halál oka, temetés helye, lelkész
- **A szemely.meghalt flag** — nem itt, hanem a tag kivezetésnél (Fázis 3) állítódik
- **Munkanapló integráció** — opcionális

### 2.6. Beköltözés (bekoltozott)
- **CRUD** — dátum, honnan, igazolás szám, megjegyzés

### 2.7. Elköltözés (elkoltozott)
- **CRUD** — dátum, hová, külföldre flag, megjegyzés

### 2.8. Áttérés (attert)
- **CRUD** — dátum, korábbi felekezet, honnan, megjegyzés

### 2.9. Kitérés (kitert)
- **CRUD** — dátum, új felekezet, hová, megjegyzés

### 2.10. Excel export
- Aktuális fül szűrt adatainak exportálása XLSX formátumban

---

## 3. Használt adatok

### Adatbázis táblák

| Tábla | Művelet | Szerep |
|-------|---------|--------|
| `keresztseg` | TELJES CRUD | Keresztelési bejegyzések |
| `konfirmalas` | TELJES CRUD | Konfirmációs bejegyzések |
| `hazassag` | TELJES CRUD | Házassági bejegyzések |
| `temetes` | TELJES CRUD | Temetési bejegyzések |
| `bekoltozott` | TELJES CRUD | Beköltözés |
| `elkoltozott` | TELJES CRUD | Elköltözés |
| `attert` | TELJES CRUD | Áttérés |
| `kitert` | TELJES CRUD | Kitérés |
| `szemely` | SELECT, UPDATE | Személyek (szülő keresés, CNP összekötés) |
| `csalad` | SELECT, INSERT | Családok (automatikus létrehozás) |
| `gyerek` | SELECT, INSERT | Gyerek–család kapcsolat |
| `adrlocality` | SELECT | Települések (hely kereséshez) |
| `profiles` | SELECT | Gyülekezet azonosító |
| `congregations` | SELECT | Gyülekezet neve (emléklaphoz) |

### Közös mezők (minden anyakönyvi tábla)

| Mező | Leírás |
|------|--------|
| `id` | Elsődleges kulcs |
| `id_szemely` | Kapcsolt személy (szemely tábla) |
| `datum` / `mikor` / `hdatum` / `tdatum` | Dátum (típusfüggő) |
| `okirat` | Okiratszám (YYYY + 5 jegyű sorszám) |
| `lelkeszneve` | Szertartó lelkész neve |
| `megjegyzes` | Megjegyzés (+ sablon JSON a keresztelésnél) |
| `munkanaploba` | Boolean — bekerült-e a munkanaplóba |
| `munkanaplo_id` | Munkanapló bejegyzés ID (ha bekerült) |
| `congregation_id` | Gyülekezet azonosító |

### Keresztelés extra mezők

| Mező | Leírás |
|------|--------|
| `keresztszulok` | Keresztszülők neve (szabad szöveg) |
| `alapige` | Bibliai ige |
| `helyid` | Keresztelés helye (adrlocality) |
| `apjaneve` / `anyjaneve` | Szülők neve (a szemely táblában is frissül) |
| `id_apja` / `id_anyja` | Szülők CNP-je (a szemely táblában is frissül) |
| Sablon mezők (JSON) | `anya_leanyneve`, `apa_vallas`, `anya_vallas` |

### Házasság extra mezők

| Mező | Leírás |
|------|--------|
| `id_ferfi` | Vőlegény (szemely ID) |
| `id_no` | Menyasszony (szemely ID) |
| `tanuk` | Tanúk neve (szabad szöveg) |

### Temetés extra mezők

| Mező | Leírás |
|------|--------|
| `hdatum` | Halál dátuma |
| `tdatum` | Temetés dátuma |
| `hoka` | Halál oka |
| `hhelyid` | Halál helye |
| `thelyid` | Temetés helye |

---

## 4. Függvények listája

### Adatbetöltés és megjelenítés

| Függvény | Leírás |
|----------|--------|
| `loadAkData(tabName)` | Fő adatbetöltő: fülváltás, query építés, szűrők reset |
| `renderAkTable()` | Aktuális fül táblázat renderelés |
| `renderAkDashboard()` | Áttekintő statisztika |
| `_applyAkFilters()` | Év + szöveg szűrő alkalmazás |
| `_sortAkBy(col)` | Oszlop rendezés (asc/desc toggle) |
| `filterAk()` | Globális keresés |
| `_showAkFilters()` | Szűrő UI generálás (év dropdown + kereső) |
| `_getFilteredAkData()` | Szűrt + rendezett adat visszaadás |

### Személy keresés és kiválasztás

| Függvény | Leírás |
|----------|--------|
| `searchMemberForAk(val, type)` | Tag keresés anyakönyvhöz |
| `selectMemberForAk(id, name, type)` | Tag kiválasztás + szülők automatikus betöltés |
| `searchParentForAk(val, parentType)` | Szülő keresés (apa/anya) |
| `selectParentForAk(id, cnp, name, type, vallas, csaladnev)` | Szülő kiválasztás + vallás + CNP |
| `openMemberModalFromAk(name)` | Tag rögzítés modal megnyitás (ha nincs a rendszerben) |

### Bejegyzés CRUD

| Függvény | Leírás |
|----------|--------|
| `openAkModal(id)` | Modal megnyitás (új vagy szerkesztés) |
| `handleAkSubmit(e)` | Form mentés (INSERT/UPDATE + szülő UPDATE + család létrehozás + munkanapló) |
| `deleteKereszteles(id)` | Keresztelés törlés |
| `deleteAkEntry(tabla, id)` | Univerzális anyakönyvi törlés |
| `recalcOkiratByDate()` | Okiratszám újraszámolás dátum alapján |

### Konfirmáció specifikus

| Függvény | Leírás |
|----------|--------|
| `_openKonfirmacioModal()` | Tömeges konfirmáció modal |
| `searchKonfirmandus(val)` | Konfirmandus kereső (még nem konfirmáltak) |
| `searchKonfirmandusokByAge()` | Korosztály szűrés (12–16 év) |
| `addKonfirmandus(id, ...)` | Hozzáadás a listához |
| `removeKonfirmandus(id)` | Eltávolítás |
| `clearKonfirmandusok()` | Lista törlés |
| `saveKonfirmacioTomegesen()` | Tömeges mentés + wizard indítás ha hiányzik keresztelés |
| `_startKeresztelesWizard(hianyosak, onComplete)` | Wizard: lépésenként pótló keresztelés |
| `_processNextWizardItem()` | Wizard léptetés |

### Nyomtatás és export

| Függvény | Leírás |
|----------|--------|
| `generateBaptismCertificate(id)` | Keresztelési emléklap HTML generálás |
| `exportAkToExcel()` | Aktuális fül export XLSX-be |

### Belső segéd

| Függvény | Leírás |
|----------|--------|
| `_checkAndCreateFamily(gyerekId, apaCnp, anyaCnp, congId)` | Automatikus család létrehozás kereszteléskor |
| `_doKonfirmacioSave(datum, lelkesz, megj)` | Belső konfirmáció mentés |
| `_renderKonfirmandusTable()` | Konfirmandus lista UI |

---

## 5. Függőségek

### Külső könyvtárak
| Könyvtár | Használat |
|----------|-----------|
| **SheetJS (xlsx)** | Excel export (lazy load) |
| **Bootstrap 5** | Modal-ok |

### Belső függőségek
| Modul | Mit használ |
|-------|-----------|
| `supabase_config.js` | `window._supabase` |
| `member_api.js` | `openMemberModalFromAk()` → tag rögzítés modal, `isReturningToAnyakonyv` flag |
| `lazy_libs.js` | `loadLib('xlsx')` |

---

## 6. Állapotkezelés

| Változó | Típus | Tartalom |
|---------|-------|----------|
| `currentAkTab` | string | Aktuális fül (keresztseg, konfirmalas, stb.) |
| `allAkData` | array | Aktuális fül összes adata |
| `_akCongregationId` | string | Gyülekezet UUID |
| `_akSortCol` | string | Rendezési oszlop |
| `_akSortAsc` | boolean | Rendezési irány |
| `_akFilterYear` | string | Év szűrő |
| `_akSearchText` | string | Szöveg kereső |
| `_konfirmandusok` | array | Konfirmandus jelöltek listája |
| `_konfWizardQueue` | array | Wizard: hiányzó keresztelések sora |
| `_konfWizardCallback` | function | Wizard befejezés callback |
| `cachedCsaladfaAdatok` | object | Családfa cache |

---

## 7. UI kapcsolatok

### Fülek (9+1 db)

| Fül | Tartalom | Dinamikus gomb |
|-----|----------|---------------|
| Áttekintő | Statisztika | — |
| Kereszteltek | Bejegyzés lista + CRUD | „Keresztelés rögzítése" (kék) |
| Konfirmáltak | Lista + tömeges rögzítés | „Konfirmandusok rögzítése" (lila) |
| Házasultak | Lista + CRUD | „Házasságkötés rögzítése" (narancs) |
| Eltemetettek | Lista + CRUD | „Haláleset rögzítése" (sötét) |
| Beköltözött | Lista + CRUD | „Beköltözés rögzítése" |
| Elköltözött | Lista + CRUD | „Elköltözés rögzítése" |
| Áttért | Lista + CRUD | „Áttérés rögzítése" |
| Kitért | Lista + CRUD | „Kitérés rögzítése" |
| Családfa | Vizualizáció | — |

### Modal-ok

| Modal | Mikor nyílik |
|-------|-------------|
| `modal-anyakonyv` | Bejegyzés létrehozás/szerkesztés (közös az összes típushoz) |
| `modal-konfirmalas` | Tömeges konfirmáció rögzítés |
| `modal-konf-edit` | Egyedi konfirmáció szerkesztés |
| `modal-add-member` | Tag rögzítés (ha nincs a rendszerben — Fázis 3 modal-ja) |
| Emléklap ablak | Nyomtatási ablak (új böngésző ablak) |

---

## 8. Hibakezelés

| Helyzet | Viselkedés |
|---------|-----------|
| Személy nincs a rendszerben | „Gyorsrögzítés" gomb → tag rögzítés modal + visszatérés az anyakönyvbe |
| Szülő keresés: nincs találat | Figyelmeztetés, kézi keresés lehetőség |
| Konfirmandus: nincs keresztelés | Wizard felajánlás → lépésenként pótolható |
| Család létrehozás: nincs szülői cím | Figyelmeztetés: „Nincs cím a szülőknél — hozza létre manuálisan" |
| Okiratszám ütközés | A rendszer a maximumot keresi és inkrementálja — concurrent használatnál lehetséges |
| Törlés: munkanapló bejegyzés marad | A törlés NEM törli a munkanapló bejegyzést (ha volt) |
| Excel export: üres tábla | „Nincs exportálható adat" figyelmeztetés |

---

## 9. Rejtett működés

### Sablon adatok (megjegyzes JSON)
A keresztelésnél a `megjegyzes` mező kétféle tartalmat hordoz:
- A `|sablon:` delimiter előtti rész: szabad szöveges megjegyzés
- Utána: JSON objektum (`anya_leanyneve`, `apa_vallas`, `anya_vallas`)
- A szerkesztésnél a rendszer szétbontja, az emléklapnál felhasználja

### Szülő összekötés kettős mentés
Keresztelésnél a szülők adatai KÉT HELYRE mentődnek:
1. A `keresztseg` tábla `apjaneve`, `anyjaneve` mezőibe (szöveges)
2. A `szemely` tábla `id_apja`, `id_anyja`, `apjaneve`, `anyjaneve` mezőibe (CNP + szöveges)

Ez biztosítja, hogy a családfa és a tagnyilvántartás is naprakész legyen.

### Anyakönyvi visszatérés interceptor
Ha a tagnyilvántartás modulból nyitunk tag-rögzítést (mert nincs a rendszerben), a mentés után automatikusan:
1. A tag modal bezárul
2. Az anyakönyvi modal újra megnyílik
3. A mentett tag automatikusan kiválasztódik
A `window.isReturningToAnyakonyv` flag és a `selectMemberForAk()` callback kezeli.

### Okiratszám generálás
Format: `{YYYY}{5-jegyű sorszám}` — pl. `202601001`
- A rendszer az aktuális évre szűri a meglévő okiratszámokat
- A maximumot megkeresi
- Ha nincs → `{YYYY}01001` (az első)
- Ha van → inkrementál

### Konfirmáció wizard: keresztelés pótlás
Ha a konfirmandusnak nincs keresztelési bejegyzése:
1. A rendszer összeállít egy „hiányos" listát
2. Wizard: egyenként megnyitja a keresztelési modal-t (auto-kitöltve a személy adataival)
3. Mentés után a következő hiányos tagra lép
4. A végén visszatér a konfirmációs modal-ba
5. Az immár kitöltött keresztelési dátumok megjelennek a listában
