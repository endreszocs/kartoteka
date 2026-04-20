# Tagnyilvántartás modul — Elemzés

**Forrás fájlok:**
- `member_api.js` (2186 sor) — személyek CRUD, családfa, áttekintés, kivezetés, nemek ellenőrzése
- `csalad_api.js` (~1079 sor) — családok CRUD, családfa, fizetés nyomon követés
- `presbiter_korzet_api.js` (~1275 sor) — körzetek, presbiterek, választók névjegyzéke
- `mass_import_api.js` (~1302 sor) — Excel tömeges import
- `lookup_api.js` (132 sor) — település/utca keresés és dinamikus létrehozás
- `sync_api.js` (152 sor) — névsor export Excel-be

**HTML:** `tagnyilvantartas.html` (633 sor), `csaladok.html` (163 sor)

---

## 1. Modul célja

A gyülekezet tagjainak, családjainak, presbitereinek és körzeteinek teljes nyilvántartása. Ez a rendszer gerince — a pénzügyi modul, az anyakönyv, a munkanapló és a leltár mind erre épül. A tagnyilvántartásban tárolt személyek (`szemely` tábla) a legtöbbet hivatkozott entitás az egész rendszerben.

---

## 2. Fő funkciók

### 2.1. Személyek (tag CRUD)

- **Listázás** — szűrhető/rendezhető táblázat (név, kor, dátum, cím, foglalkozás, státusz)
- **Szűrés** — aktív (alapértelmezett), elhunyt, elköltözött, kitért, más vallású, mind
- **Keresés** — név ÉS cím alapú okos keresés (szóközre darabolás)
- **Rendezés** — név, kor, cím, foglalkozás oszlopok (asc/desc)
- **Kartoték (adatlap)** — személyi adatok, anyakönyvi adatok (keresztség, konfirmáció, temetés), beköltözés/áttérés történet, befizetések listája, családfa vizualizáció
- **Szerkesztés** — személyi adatok módosítása (ugyanaz a form mint az új tag)
- **Új tag felvétel** — 3 belépési mód: alap (helyi), beköltözött, áttért
- **Tag kivezetése** — 4 mód: elhunyt (temetés rögzítéssel), elköltözött, kitért, törlés
- **Automatikus család létrehozás** — ha szülőt adunk meg, a rendszer automatikusan létrehozza a családot és beköti a gyereket
- **Szülő keresés** — okos kereső szülő kiválasztásához (név, kor, cím megjelenítéssel)
- **Szülő gyorsrögzítés** — ha a szülő nincs a rendszerben, helyben rögzíthető (modal-ban modal)
- **Családfa** — FamilyTree.js vizualizáció a kartoték modal-ban (max 3 generáció, CNP-alapú)

### 2.2. Áttekintés (demográfiai vezérlőpult)

- **Nemek megoszlása** — férfi/nő szám + százalék + progress bar
- **Korcsoportok** — 11 kategória (0-6, 7-12, 13-14, 15-18, 19-30, 31-40, 41-65, 66-75, 76-80, 81-100, 100+) progress bar-okkal
- **Átlagéletkor** — összesített + nemek szerint
- **Előrejelzés** — 5 és 10 éves: konfirmandusok, választók, 75+ és 80+ tagok
- **Halálozási átlagéletkor** — nemek szerint
- **Rekordok** — legidősebb, legfiatalabb tag
- **Települési megoszlás** — top 5 település
- **Státusz összesítés** — elhunyt, elköltözött, kitért számok
- **Top 15 nevek** — leggyakoribb család- és keresztnevek

### 2.3. Családok

- **Családok listázás** — férj + feleség + gyerekek + cím + fizetési státusz
- **Család CRUD** — férj/feleség kiválasztás, gyermekek hozzárendelés/eltávolítás
- **Családfa vizualizáció** — FamilyTree.js a család összes tagjával
- **Fizetés nyomon követés** — családi szintű befizetések összesítése

### 2.4. Presbiterek és körzetek

- **Presbiterek listázás** — név, körzet, tisztség, megválasztás éve
- **Presbiter CRUD** — tag kiválasztás, körzet hozzárendelés, tisztség beállítás
- **Körzetek kezelés** — körzet CRUD (a `csoport` táblában `iskorzet = true`)
- **Családok körzethez rendelése** — drag-and-drop jellegű hozzárendelés
- **Kiosztalan családok** — akik még nincsenek körzetbe sorolva

### 2.5. Választók névjegyzéke

- **Névjegyzék generálás** — az előző évi fizetők + felmentettek alapján
- **Véglegesítés** — a névjegyzék zárolása (esperes jóváhagyással oldható fel)
- **Nyomtatás** — választók névjegyzéke PDF-ben

### 2.6. Tömeges import (Excel)

- **Excel feltöltés** — xlsx fájl feldolgozás
- **Mező-mappálás** — Excel oszlopok és adatbázis mezők összepárosítása
- **Duplikáció felismerés** — meglévő rekordok kiszűrése
- **Chunk-olt mentés** — 500 rekordos csomagokban

### 2.7. Névsor export (Excel)

- **Excel generálás** — formázott névsor az aktív tagokról
- **Supabase Storage feltöltés** — vagy közvetlen letöltés fallback

### 2.8. Nem-ellenőrzés (God Mode)

- **Automatikus nem-felismerés** — keresztnév alapján (magyar heurisztika)
- **Tömeges javítás** — hiányzó/hibás nem adatok egyszerre javíthatók
- **Csak God Mode-ban érhető el**

---

## 3. Használt adatok

### Adatbázis táblák

| Tábla | Fő oszlopok | Szerep |
|-------|-------------|--------|
| `szemely` | id, cnp, csaladnev, k_nev, szcs_nev, namepattern, ferfi, sz_datum, sz_helyid, foglalkozas, vallas, telefon, email, meghalt, elkoltozott, member_status, isvisible, type, befizetoev, csaladfo, id_apja, id_anyja, apjaneve, anyjaneve, megjegyzes, c_helysegid, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, congregation_id | Személyek |
| `csalad` | id, id_ferfi, id_no, c_utcaid, c_szam, isaktiv | Családok |
| `gyerek` | id_csalad, id_szemely | Gyermek–család kapcsolat |
| `csoport` | id, nev, iskorzet | Csoportok/körzetek |
| `presbiter` | id, id_szemely, id_csoport, tisztseg, ev | Presbiterek |
| `adrlocality` | id, name, countyid | Települések |
| `adrstreet` | id, name, localityid | Utcák |
| `adrcounty` | id, name | Megyék |
| `felmentes` | id_szemely, id_csalad, kezdete, vege, oka | Járulék-felmentések |
| `befizetes` | id_szemely, id_csalad, osszeg, datum, fizetettev | Befizetések (olvasás) |
| `elkoltozott` | id_szemely, mikor, hovaid, kulfoldre | Elköltözöttek |
| `kitert` | id_szemely, felekezet, mikor | Kitértek |
| `keresztseg` | id_szemely, datum, helyid, lelkeszneve | Keresztség |
| `konfirmalas` | id_szemely, datum, helyid, lelkeszneve | Konfirmáció |
| `temetes` | id_szemely, hdatum, tdatum, hoka, lelkeszneve, hhelyid, thelyid | Temetés |
| `bekoltozott` | id_szemely, mikor, honnanid, igazolas | Beköltözöttek |
| `attert` | id_szemely, mikor, felekezet, honnanid | Áttértek |
| `bealitas` | ev, zarolva | Névjegyzék zárolás |
| `nevjegyzek` | id_szemely, ev | Választói névjegyzék |

### Személy CNP rendszer

- A `cnp` (személyi szám) a családfa-összekötés kulcsa
- Ha a személynek nincs valódi CNP-je → a rendszer generál egyet: `999` + 7 véletlen szám
- Az `id_apja` és `id_anyja` mezők a szülő **CNP**-jét tartalmazzák (NEM az id-t!)
- A családfa (FamilyTree.js) CNP alapján keresi meg a szülőket és gyerekeket

---

## 4. Függvények listája

### Személyek

| Függvény | Leírás |
|----------|--------|
| `loadMembers()` | 5 párhuzamos lekérdezés → allMembersData, fizetési státusz számítás |
| `displayMembers(members)` | Táblázat HTML generálás |
| `filterAndSortMembers()` | Szűrés (státusz + keresés) + rendezés |
| `sortByColumn(col)` | Oszlop rendezés toggle |
| `openMemberDetails(id)` | Kartoték modal: személyi + anyakönyvi + fizetési adatok |
| `loadFamilyTree(member)` | FamilyTree.js vizualizáció (CNP-alapú, max 3 generáció) |
| `openEditMember(member, ...)` | Szerkesztő form előtöltése |
| `handleFormSubmit(e)` | Tag mentés (insert/update) + automatikus család létrehozás |
| `openRemoveModal(id, name)` | Kivezetés modal megnyitás |
| `handleRemoveSubmit(e)` | Kivezetés végrehajtás (elhunyt/elköltözött/kitért/törlés) |
| `searchParentForMember(val, type)` | Okos szülőkeresés (név+cím+kor) |
| `selectParentForMember(name, cnp, type)` | Szülő kiválasztás → CNP mentés |
| `quickAddParentFromMemberForm(name, type)` | Szülő gyorsrögzítés dinamikus modal |
| `saveDynamicParent(type, isFerfi)` | Dinamikus szülő mentés + visszakapcsolás |
| `selectEntryReason(reason)` | Belépés oka kiválasztás (alap/beköltözött/áttért) |
| `formatNameWithPrefix(member, spouse, mode)` | Név-formázás (elv., özv., namepattern) |

### Áttekintés

| Függvény | Leírás |
|----------|--------|
| `generateOverviewDashboard(allMembers)` | Teljes demográfiai elemzés (nemek, korcsoportok, előrejelzés, rekordok, nevek) |

### Nem-ellenőrzés (God Mode)

| Függvény | Leírás |
|----------|--------|
| `openGenderCheckModal()` | Hiányzó/hibás nemek listázása |
| `saveGenderFixes()` | Tömeges nem-javítás mentés |
| `_guessGenderFromFirstName(firstName)` | Keresztnév-alapú nem-felismerés (magyar heurisztika) |

### Cím-kezelés

| Függvény | Leírás |
|----------|--------|
| `getOrCreateLocality(name)` | Település keresés vagy létrehozás |
| `getOrCreateStreet(name, localityId)` | Utca keresés vagy létrehozás |

### Segéd

| Függvény | Leírás |
|----------|--------|
| `openNextModal(currentId, nextFunc)` | Modal stack navigáció |
| `resetToPreScreen()` | Új tag form visszaállítás |
| `switchMainTabs(tabName)` | Fülváltás gombkezelés |
| `setupAddMemberSmartLogic()` | Életkor → fizetési státusz, vallás → egyháztag automatika |

---

## 5. Függőségek

### Külső könyvtárak

| Könyvtár | Használat | Betöltés |
|----------|-----------|----------|
| **FamilyTree.js** | Családfa vizualizáció | Lazy load (`loadLib('familytree')`) |
| **SheetJS (xlsx)** | Excel import/export | Lazy load |
| **Bootstrap 5** | Modal-ok, tab-ok | CDN |

### Belső függőségek

| Modul | Mit használ belőle |
|-------|-------------------|
| `supabase_config.js` | `window._supabase` kliens |
| `session_cache.js` | `getCachedProfile()` |
| `data_cache.js` | `cachedQuery()`, `invalidateCachePrefix()` |
| `lazy_libs.js` | `loadLib()` |
| `lookup_api.js` | `getOrCreateLocality()`, `getOrCreateStreet()` |

---

## 6. Állapotkezelés

### Globális változók

| Változó | Típus | Tartalom |
|---------|-------|----------|
| `allMembersData` | `Array` | Összes tag a gyülekezetből (enriched fizetési státusszal) |
| `currentEditingMemberId` | `number \| null` | Szerkesztés alatt álló tag ID (null = új) |
| `memberSortState` | `{ col, dir }` | Aktuális rendezési állapot |
| `familyTreeInstance` | `FamilyTree \| null` | Aktív családfa példány |
| `window.personToFamilyMap` | `Record<id, familyId>` | Személy → család mapping (Ugrás a Családhoz gomb) |
| `window.paidPersonsSet` | `Set<id>` | Fizető személyek (szűrőhöz) |
| `window.appModalStack` | `string[]` | Modal navigációs verem |
| `window.isSystemClosingModal` | `boolean` | Modal programozott bezárás flag |
| `window.isReturningToAnyakonyv` | `boolean` | Anyakönyvből jöttünk → visszatérés a mentés után |

---

## 7. UI kapcsolatok

### Fő oldal fülek (6 db)

| Fül | Tartalom | Gomb |
|-----|----------|------|
| Áttekintés | Demográfiai vezérlőpult | — |
| Személyek | Szűrhető/rendezhető táblázat | „+ Új tag" |
| Családok | Család kártyák | „+ Új család" |
| Presbiterek | Presbiter lista | „+ Új presbiter" |
| Körzetek | Körzet → család hozzárendelés | „+ Új körzet", „Nyomtatás" |
| Választók | Választói névjegyzék | „Nyomtatás" |

### Modal-ok (8+ db)

| Modal | Mikor nyílik | Mit csinál |
|-------|-------------|-----------|
| `modal-details` | Tag sorra kattintás | Kartoték adatlap + családfa |
| `modal-add-member` | „+ Új tag" VAGY „Szerkesztés" | Tag felvétel/szerkesztés form (3 fül: személyes, anyakönyvi, pénzügyi) |
| `modal-remove-member` | „Kivezetés" gomb | Tag elhunyt/elköltözött/kitért/törlés |
| `dynamic-parent-modal` | „Szülő nincs a rendszerben" | Szülő gyorsrögzítés |
| `modal-family-details` | Család kattintás | Család adatlap |
| `modal-add-family` | „+ Új család" | Család létrehozás |
| `modal-gender-check` | God Mode „Nem-ellenőrzés" | Tömeges nem-javítás |
| `modal-anyakonyv` | Anyakönyvből visszatérés | Anyakönyvi modal (külső) |

### Modal Stack navigáció

A modal-ok egymásra nyílhatnak (pl. Kartoték → Szerkesztés → Szülő gyorsrögzítés). A `window.appModalStack` tömb kezeli a visszalépést: ha egy modalt bezárnak, a stack tetejéről visszanyílik az előző.

---

## 8. Hibakezelés

| Helyzet | Viselkedés |
|---------|-----------|
| Tag mentés hiba | `alert("Hiba a mentéskor: " + err.message)` |
| RLS blokkolás (tag törlés) | Fallback: `isvisible = false` elrejtés + tájékoztató alert |
| Pénzügyi tranzakcióval rendelkező tag törlése | Nem töröl, csak elrejt + magyarázó alert |
| Települése/utca nem létezik | `getOrCreateLocality/Street()` automatikusan létrehozza |
| FamilyTree hiba | Badge → „Hiba", console.error |
| Családfa: nincs elég adat | „Nincs adat" üzenet, fa nem renderelődik |
| Munkanapló csatolás törléskor | Rákérdez: törölje-e a szolgálatokat is |

---

## 9. Rejtett működés

### Automatikus család létrehozás (tag mentéskor)
Ha az új tagnak szülőt adunk meg (CNP-vel), a rendszer:
1. Megkeresi a szülők valódi ID-ját CNP alapján
2. Megnézi, van-e már család (csalad tábla) ezzel a férj/feleség párossal
3. Ha nincs → automatikusan létrehozza a családot a gyermek lakcímén
4. A gyermeket beregisztrálja ehhez a családhoz (gyerek tábla)

### CNP generálás
Ha a személynek nincs valódi CNP-je (pl. nincs személyi száma), a rendszer generál egyet: `999` + 7 random szám. Ez a CNP a családfa-összekötés kulcsa.

### Fizetési státusz számítás (loadMembers)
Minden tag kap egy `calc_status_html` badge-et:
1. Ha elhunyt → „Elhunyt" (sötét)
2. Ha elköltözött → „Elköltözött" (szürke)
3. Ha kitért → „Kitért" (sárga)
4. Ha felmentett (felmentes tábla, érvényes időszak) → „Felmentett" (sárga, pajzs ikon)
5. Ha fizetett (befizetes tábla, idei év) → „Rendezve" (zöld, pipa ikon)
6. Egyébként → „Hátralékos" (piros)

A fizetés ellenőrzése személyi ÉS családi szinten is történik — ha a család fizetett, a családtag is „Rendezve" státuszú.

### Aktív tag szűrő (alapértelmezett nézet)
Az „Aktív gyülekezeti tagok" szűrő nem triviális:
- Nem elhunyt, nem elköltözött, nem kitért, nem törölt
- ÉS (református VAGY vallás üres VAGY egyházfenntartást fizet)
- A más vallásúak kiszűrődnek, KIVÉVE ha fizetnek

### Név-formázás prefix motor
A személynevek megjelenítésekor prefix-ek fűződnek hozzá:
- `elv.` → ha az állapot „elvált"
- `özv.` → ha az állapot „özvegy" VAGY a házastárs elhunyt
- `namepattern` → egyéni prefix (pl. „Nt.", „Dr.")

### Tag kivezetés fallback logika
A törlés nem mindig végleges fizikai törlés:
1. Ha van pénzügyi tranzakció → NEM törlődik, csak `isvisible = false`
2. Ha nincs tranzakció → megpróbálja törölni, de ha RLS blokkolja → `isvisible = false`
3. A rendszer MINDIG ad visszajelzést, hogy mi történt valójában

### Anyakönyvi visszatérés
Ha az anyakönyvi modulból indítunk tag-rögzítést (pl. kereszteléshez kell a gyermek), a mentés után automatikusan visszatér az anyakönyvi modalba és beállítja a kiválasztott személyt. Ehhez a `window.isReturningToAnyakonyv` flag-et használja.

### God Mode nem-ellenőrzés
Magyar keresztnév-heurisztika: ha a név `a` vagy `e` betűre végződik → nő, egyébként férfi. Kivétel lista: Béla, Árpád, Attila, Géza, stb. Csak God Mode-ban érhető el.
