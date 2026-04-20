# Anyakönyv — Üzleti szabályok

---

## 1. Jogosultságok

### Ki mit lát

- A lelkész KIZÁRÓLAG a saját gyülekezetének anyakönyvi bejegyzéseit látja
- Adatbázis szinten kikényszerített szeparáció (RLS) — minden anyakönyvi tábla `congregation_id`-vel védett

### Ki mit tehet

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| Bejegyzés megtekintése | ✅ saját gyül. | ✅ | ✅ | ✅ |
| Bejegyzés létrehozás | ✅ | ✅ | ✅ | ✅ |
| Bejegyzés szerkesztés | ✅ | ✅ | ✅ | ✅ |
| Bejegyzés törlés | ✅ | ✅ | ✅ | ✅ |
| Emléklap nyomtatás | ✅ | ✅ | ✅ | ✅ |
| Excel export | ✅ | ✅ | ✅ | ✅ |
| Konfirmáció tömeges | ✅ | ✅ | ✅ | ✅ |

Nincs emelt jogosultság — minden lelkész a saját gyülekezetén belül teljes CRUD jogot kap.

---

## 2. Szabályok

### Nyolc anyakönyvi típus

A rendszer nyolcféle egyházi bejegyzést kezel, mindegyik saját táblában:

| Típus | Magyar név | Mikor használt |
|-------|-----------|---------------|
| **Keresztelés** | Kereszteltek | Újszülöttek vagy felnőttek megkeresztelésekor |
| **Konfirmáció** | Konfirmáltak | A hitüket megerősítő fiatalok (jellemzően 12–16 év) |
| **Házasság** | Házasultak | Egyházi esketés |
| **Temetés** | Eltemetettek | Haláleset és temetési szertartás |
| **Beköltözés** | Beköltözöttek | Más gyülekezetből átjelentkezők |
| **Elköltözés** | Elköltözöttek | Más gyülekezetbe távozók |
| **Áttérés** | Áttértek | Más felekezetből a református egyházba lépők |
| **Kitérés** | Kitértek | A református egyházból kilépők |

### Okiratszám rendszer

- Minden bejegyzés kap egy **okiratszámot** (egyedi azonosító)
- Formátum: `{YYYY}{5-jegyű sorszám}` — pl. `202601001`
- A sorszám **éves** — minden év január 1-én újraindul `01001`-ről
- A rendszer automatikusan a következő szabad számot ajánlja
- A sorszám nem módosítható utólag (de újraszámolható dátum alapján)

### Személyhez kötés

- Minden bejegyzés legalább egy személyhez kötődik a `szemely` táblából
- Házasságnál kettő (vőlegény + menyasszony)
- Ha a személy nincs a rendszerben → helyben rögzíthető, majd az anyakönyv automatikusan kiválasztja

### Munkanapló integráció

- A keresztelés és konfirmáció opcionálisan bekerül a **lelkészi munkanaplóba** szolgálatként
- Checkbox az anyakönyvi form-on: „Rögzítés a munkanaplóba"
- Ha bejelölve → a munkanapló tábla kap egy bejegyzést (típus + dátum + leírás)
- A munkanapló bejegyzés ID visszakerül az anyakönyvi rekordba (`munkanaplo_id`)
- Anyakönyvi törlés NEM törli automatikusan a munkanapló bejegyzést

### Szülő összekötés (keresztelésnél)

Keresztelésnél a szülők adatai **két helyre** mentődnek:
1. A `keresztseg` tábla `apjaneve` / `anyjaneve` mezőibe (szöveges)
2. A `szemely` tábla `id_apja` / `id_anyja` mezőibe (CNP-vel)

Ez biztosítja, hogy a **családfa** és a **tagnyilvántartás** is naprakész legyen.

### Sablon adatok (keresztelés emléklap)

A keresztelésnél extra mezőket tárolunk az emléklap generálásához:
- Anya leánykori neve
- Apa vallása
- Anya vallása

Ezek a `megjegyzes` mező végén, `|sablon:` delimiter után JSON formátumban tárolódnak. A szerkesztésnél a rendszer szétbontja, az emléklap generálásnál felhasználja.

---

## 3. Validációk

### Keresztelés

| Mező | Szabály |
|------|---------|
| Személy (id_szemely) | **Kötelező** — a szemely táblából |
| Dátum (datum) | **Kötelező** |
| Okiratszám (okirat) | **Kötelező** — automatikusan generált, egyedi |
| Lelkész neve | Opcionális |
| Keresztszülők | Opcionális (de az emléklaphoz ajánlott) |
| Alapige (bibliai ige) | Opcionális (de az emléklaphoz ajánlott) |
| Hely | Opcionális |
| Apa neve / CNP | Opcionális (de a családfa-összekötéshez szükséges) |
| Anya neve / CNP | Opcionális (de a családfa-összekötéshez szükséges) |
| Apa vallása / Anya vallása | Opcionális (sablon adat) |
| Anya leánykori neve | Opcionális (sablon adat) |
| Munkanapló checkbox | Opcionális (alapértelmezés: nincs bejelölve) |

### Konfirmáció

| Mező | Szabály |
|------|---------|
| Személy (id_szemely) | **Kötelező** — a szemely táblából |
| Dátum | **Kötelező** |
| Lelkész neve | Opcionális |
| Megjegyzés | Opcionális |
| Munkanapló checkbox | Opcionális |

Tömeges rögzítésnél:
- Minimum 1 konfirmandus kell a listában
- Egy személy NEM adható hozzá kétszer
- Már konfirmáltak NEM jelennek meg a keresőben

### Házasság

| Mező | Szabály |
|------|---------|
| Vőlegény (id_ferfi) | **Kötelező** — szemely táblából (férfi) |
| Menyasszony (id_no) | **Kötelező** — szemely táblából (nő) |
| Dátum | **Kötelező** |
| Okiratszám | **Kötelező** — automatikus |
| Lelkész neve | Opcionális |
| Tanúk | Opcionális (szabad szöveg) |

### Temetés

| Mező | Szabály |
|------|---------|
| Személy (id_szemely) | **Kötelező** |
| Halál dátuma (hdatum) | **Kötelező** |
| Temetés dátuma (tdatum) | **Kötelező** |
| Halál oka (hoka) | Opcionális |
| Halál helye | Opcionális |
| Temetés helye | Opcionális |
| Lelkész neve | Opcionális |
| Munkanapló checkbox | Opcionális |

### Beköltözés / Elköltözés / Áttérés / Kitérés

| Mező | Szabály |
|------|---------|
| Személy (id_szemely) | **Kötelező** |
| Dátum | **Kötelező** |
| Honnan / Hová | Opcionális |
| Felekezet (áttérés/kitérés) | Opcionális |
| Igazolás szám (beköltözés) | Opcionális |
| Megjegyzés | Opcionális |

---

## 4. Korlátozások

### Törlés

- Az anyakönyvi bejegyzés törlése **végleges** (nincs soft delete)
- A törlés NEM törli a személy rekordot — csak a bejegyzést
- A törlés NEM törli az esetleges munkanapló bejegyzést
- Megerősítő dialógus szükséges

### Konfirmáció

- Egy személy csak **egyszer** konfirmálható (duplikáció ellenőrzés)
- Már konfirmáltak NEM jelennek meg a konfirmandus keresőben
- A korosztály kereső 12–16 éves tagokat szűr (de nem kötelező ebből választani)

### Okiratszám

- Az okiratszám generálás az aktuális évre vonatkozik
- A sorszám az adott évi maximum + 1
- Concurrent használatnál elméletileg ütközhet (de nagyon kis valószínűséggel)

### Család automatikus létrehozás

- Csak **új** keresztelésnél fut (szerkesztésnél NEM)
- Csak ha **mindkét szülő CNP-je** meg van adva
- Ha a szülőknek nincs lakcímük → a család NEM jön létre automatikusan (figyelmeztetés)

---

## 5. Workflow szabályok

### Keresztelés rögzítése

```
1. Lelkész a „Keresztelés rögzítése" gombra kattint
2. Modal megnyílik az aktuális fül alapján (keresztelés form)
3. Okiratszám automatikusan generálódik
4. Személy keresés:
   a) Ha megtalálja → kiválasztás
   b) Ha NINCS a rendszerben → „Gyorsrögzítés" → tag modal megnyílik
      → mentés után automatikusan visszatér az anyakönyvi modalba
      → a mentett tag automatikusan kiválasztódik
5. Szülő keresés (apa, anya):
   a) Keresés → kiválasztás (CNP + vallás + családnév mentődik)
   b) Ha nincs → kézi név bevitel (CNP összekötés nélkül)
6. Kitölti: dátum, hely, lelkész, keresztszülők, alapige
7. Opcionálisan: munkanapló checkbox
8. „Mentés"
9. A rendszer:
   — INSERT keresztseg tábla
   — UPDATE szemely: id_apja, id_anyja, apjaneve, anyjaneve
   — Ha szülő CNP van → automatikus család létrehozás (ha nincs már)
     → gyerek regisztráció a családba
   — Ha munkanapló checkbox → INSERT munkanaplo
10. A bejegyzés megjelenik a listában
```

### Konfirmáció tömeges rögzítése

```
1. Lelkész a „Konfirmandusok rögzítése" gombra kattint
2. Konfirmáció modal megnyílik (üres lista)
3. Konfirmandusok hozzáadása:
   a) Keresés név alapján (csak NEM konfirmáltak jelennek meg)
   b) VAGY korosztály kereső: 12–16 évesek automatikus listázása
   c) Hozzáadás → a lista bővül
   d) Eltávolítás → a lista csökken
4. A lista megjeleníti: név, nem, születési dátum, keresztelés dátuma
5. Kitölti: közös dátum, lelkész neve, megjegyzés, munkanapló checkbox
6. „Mentés"
```

### Konfirmáció wizard: hiányzó keresztelés pótlás

```
7. A rendszer ellenőrzi: van-e minden konfirmandusnak keresztelési bejegyzése?
8. Ha VAN mindenkinek → közvetlen mentés (batch INSERT konfirmalas)
9. Ha HIÁNYZIK valakinek:
   a) Kérdés: „X konfirmandusnak nincs keresztelése. Pótolni kívánja most?"
   b) Ha IGEN → wizard indul:
      — Konfirmáció modal bezárul
      — Az első hiányzó tagnál megnyílik a keresztelés modal (előtöltve)
      — Mentés → következő hiányzó tag
      — Összes pótolva → konfirmáció modal újra megnyílik
      — A pótolt keresztelési dátumok megjelennek a listában
   c) Ha NEM → a mentés enélkül folytatódik
10. Batch INSERT konfirmalas + opcionálisan INSERT munkanaplo
```

### Házasság rögzítése

```
1. Lelkész a „Házasságkötés rögzítése" gombra kattint
2. Modal: vőlegény keresés (szemely, férfi) + menyasszony keresés (szemely, nő)
3. Okiratszám automatikus
4. Kitölti: dátum, lelkész, tanúk
5. Mentés → INSERT hazassag
```

### Temetés rögzítése

```
1. „Haláleset rögzítése" gomb
2. Modal: személy keresés
3. Kitölti: halál dátuma, temetés dátuma, halál oka, helyek, lelkész
4. Opcionális: munkanapló checkbox
5. Mentés → INSERT temetes
   — FIGYELEM: a szemely.meghalt flag NEM itt állítódik!
     Az a tagnyilvántartás „Tag kivezetés → Elhunyt" (Fázis 3) workflow-ban történik.
     A temetés rögzítése az anyakönyvi bejegyzést hozza létre, nem a tag státuszát módosítja.
```

### Tag nem található → gyorsrögzítés visszatérés

```
1. A keresőben nincs találat → „Új tag rögzítése" gomb
2. Az anyakönyvi modal bezárul (memóriába kerül az állapot)
3. A tagnyilvántartás modal megnyílik (egyszerűsített: csak személyes fül)
4. A tag mentése megtörténik
5. A tag modal bezárul → az anyakönyvi modal újra megnyílik
6. A mentett tag automatikusan kiválasztódik a keresőben
```

### Emléklap (keresztelési) nyomtatás

```
1. Lelkész egy keresztelési bejegyzés „Emléklap" gombjára kattint
2. A rendszer lekérdezi:
   — Keresztelési adatok (dátum, hely, lelkész, keresztszülők, alapige)
   — Gyülekezet neve
   — Szülő adatok (ha CNP-vel összekötve → aktuális név a szemely táblából)
   — Sablon adatok (anya leánykori neve, szülők vallása)
3. HTML emléklap generálás (elegáns betűtípusok: Cinzel, Playfair Display)
4. Új böngésző ablak megnyílik a nyomtatási nézettel
5. Nyomtatás gomb
```

---

## 6. Edge case-ek

### Személyek

| Eset | Mi történik |
|------|-------------|
| A személy nincs a rendszerben | „Gyorsrögzítés" gomb → tag modal → visszatérés az anyakönyvbe → automatikus kiválasztás |
| A személy időközben törlődik (tag kivezetés) | Az anyakönyvi bejegyzés megmarad (nem kaszkádol) — de a személy oszlopban „—" jelenik meg |
| Házasság: vőlegény = menyasszony (azonos személy) | Nincs explicit validáció — az adatbázis megengedi (de értelmetlen) |

### Szülő összekötés

| Eset | Mi történik |
|------|-------------|
| Szülő CNP nélkül (csak név) | Az anyakönyvi bejegyzés rögzítődik, de a családfa-összekötés NEM működik |
| Szülőnek nincs lakcíme | Az automatikus család létrehozás NEM fut le → figyelmeztetés + kézi család ajánlat |
| Mindkét szülő megadva, de a család MÁR létezik | Nem hoz létre új családot — a gyereket a meglévő családba regisztrálja |
| Csak egy szülő megadva (pl. egyedülálló anya) | A család az egy szülővel jön létre (az id_ferfi VAGY id_no null) |
| Szerkesztésnél szülőt módosít | A szemely tábla is frissül (id_apja, id_anyja) — DE a család NEM módosul automatikusan |

### Konfirmáció

| Eset | Mi történik |
|------|-------------|
| Konfirmandus már konfirmált | NEM jelenik meg a keresőben (kiszűrve) |
| Konfirmandus nincs megkeresztelve | A wizard felajánlja a pótlást — ha elutasítja, a konfirmáció enélkül mentődik |
| Konfirmandus kétszer hozzáadva a listához | A rendszer ellenőrzi és nem engedi (duplikáció védelem) |
| 0 konfirmandus a listában | A mentés nem fut le — figyelmeztetés |
| Wizard közben bezárja az ablakot | A wizard megszakad — a már pótolt keresztelések megmaradnak, a konfirmáció NEM mentődik |

### Okiratszám

| Eset | Mi történik |
|------|-------------|
| Concurrent használat: két felhasználó egyszerre rögzít | Elméletileg duplikált okiratszám keletkezhet (nincs DB unique constraint — az app szinten számolja) |
| Szerkesztésnél az okiratszám változik | Megengedett — a rendszer az új dátum alapján újraszámolja |
| Adott évre nincs korábbi bejegyzés | Az első okiratszám: `{YYYY}01001` |

### Munkanapló

| Eset | Mi történik |
|------|-------------|
| Munkanapló checkbox bejelölve, de a munkanapló modul nincs betöltve | A `triggerWorklogFromRegistry` nem létezik → csendben nem fut le (try-catch) |
| Anyakönyvi bejegyzés törlése, de a munkanapló bejegyzés megmarad | A munkanapló bejegyzés NEM törlődik automatikusan — manuálisan kell |
| Szerkesztésnél a munkanapló checkbox megváltozik | NEM módosítja a meglévő munkanapló bejegyzést — csak új bejegyzésnél releváns |

### Emléklap (nyomtatás)

| Eset | Mi történik |
|------|-------------|
| Szülő CNP-vel összekötve → a szülő nevet változtatott | Az emléklap az AKTUÁLIS nevet jeleníti meg (a szemely táblából kérdezi le) |
| Szülő CNP nélkül | Az emléklap a tárolt nevet jeleníti meg (apjaneve / anyjaneve) |
| Sablon adatok hiányoznak (anya leánykori neve, vallás) | Az emléklap az adott mezőket üresen hagyja |
| Gyülekezet neve nem elérhető | Üres felirat az emléklapon |

### Tagmozgások (beköltözés, elköltözés, áttérés, kitérés)

| Eset | Mi történik |
|------|-------------|
| Beköltözés: a személy MÁR a rendszerben van | Megengedett — a beköltözés bejegyzés a tagnyilvántartástól FÜGGETLEN |
| Elköltözés: a személy NEM jelenik meg aktív tagként | Az elköltözés az anyakönyvi nyilvántartás — a tag státusz (elkoltozott flag) a tagnyilvántartásban állítódik |
| Kitérés + áttérés: a személy vallása változik | Az anyakönyvi bejegyzés NEM módosítja automatikusan a szemely.vallas mezőt — az a tagnyilvántartásban történik |
| Ugyanaz a személy többször beköltözik/elköltözik | Megengedett — minden alkalom külön bejegyzés |

### Excel export

| Eset | Mi történik |
|------|-------------|
| Nincs adat az aktuális fülön | „Nincs exportálható adat" figyelmeztetés |
| Szűrt nézet export | Az export a SZŰRT adatokat exportálja (nem az összeset) |
| Speciális karakterek a nevekben (é, á, ő, stb.) | A SheetJS kezeli — UTF-8 kódolás |
