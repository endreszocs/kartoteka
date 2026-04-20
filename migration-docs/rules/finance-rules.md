# Pénzügyi modul — Üzleti szabályok

---

## 1. Jogosultságok

### Ki mit lát

- A lelkész KIZÁRÓLAG a saját gyülekezetének pénzügyi adatait látja
- Adatbázis szinten kikényszerített szeparáció (RLS) — minden tábla `congregation_id`-vel védett
- Master Admin Admin Override módban más gyülekezet pénzügyeit is megtekintheti

### Ki mit tehet

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| Bevétel rögzítés | ✅ | ✅ | ✅ | ✅ |
| Kiadás rögzítés | ✅ | ✅ | ✅ | ✅ |
| Tranzakció törlés (soft delete) | ✅ | ✅ | ✅ | ✅ |
| Belső mozgás | ✅ | ✅ | ✅ | ✅ |
| Költségvetés tervezés | ✅ | ✅ | ✅ | ✅ |
| Költségvetés véglegesítés | ✅ | ✅ | ✅ | ✅ |
| Költségvetés feloldás (zárolás után) | ❌ | ✅ (esperes) | ✅ | ✅ |
| Számadás véglegesítés | ✅ | ✅ | ✅ | ✅ |
| Számadás feloldás | ❌ | ✅ (esperes) | ✅ | ✅ |
| Bankszámla kezelés | ✅ | ✅ | ✅ | ✅ |
| BCR import | ✅ | ✅ | ✅ | ✅ |
| Bérleti szerződés CRUD | ✅ | ✅ | ✅ | ✅ |
| Párosítatlan befizetések audit | ❌ | ❌ | ❌ | ✅ (SzuperAdmin) |
| Sorszám normalizálás | ✅ | ✅ | ✅ | ✅ |

---

## 2. Szabályok

### Pénznem és formázás

- Az elsődleges pénznem a **RON (román lej)**
- Másodlagos pénznem: **EUR** (valutacsere műveletekhez)
- Formázás: szóközzel elválasztott ezresek, vesszővel elválasztott tizedesek (pl. `1 234,56`)
- Minden összeg 2 tizedes jegyig kerekítve

### Bevétel rögzítés

- Minden bevétel egy személyhez VAGY egy szervezethez (céghez) rendelhető
- A személyt a rendszer a `szemely` táblából keresi (okos kereső, diakritika-normalizálás)
- A szervezeteket a bérleti szerződésekből (`berleti_szerzodes`) tölti be
- Minden bevételnek van kategóriája (`befizetescel` → `szamadasicel` kód)
- A legfontosabb kategória: **101.01 — Egyházfenntartói járulék**
- Egy bevételi rekordban több kategória-sor is lehet (pl. járulék + adomány egyszerre)

### Kiadás rögzítés

- Minden kiadáshoz partner rendelhető (személy, szervezet, vagy szabad szöveg)
- Minden kiadásnak van kategóriája (`kiadascel` → `szamadasicel` kód)
- Egy kiadás több kategóriára bontható (tételes bontás)
- Ha a kategória beruházás/felszerelés jellegű → automatikusan leltárba kerül

### Járulék (egyházfenntartás)

- Az éves járulék összege a `bealitas` táblában évente beállítható
- Minden gyülekezetnek saját járulék összege van
- A járulék összege évente változhat — a tartozás számításkor figyelembe kell venni melyik év milyen összegű volt

### Járulék kedvezmények

A rendszer négyféle kedvezményt ismer:

| Típus | Leírás | Példa |
|-------|--------|-------|
| **Kor-alapú** | Egy bizonyos kor felett automatikus kedvezmény | 80 év felett 50% kedvezmény |
| **Jövedelem-alapú** | Alacsony jövedelműek mentesítése | Megélhetési nehézség → 100% felmentés |
| **Időszaki** | Ha a határidő előtt fizet | Július 1. előtt fizetés → 50% kedvezmény |
| **Személyi felmentés** | Egyedi, személyre szabott mentesítés | Felmentés tábla, dátum-tartománnyal |

### Belső mozgás (kettős könyvelés)

Minden pénzmozgás a kassza és a bankszámlák között **két rekordot** hoz létre egyidejűleg:

- **Bevétel oldal:** `befizetes` rekord (a célszámla kap pénzt)
- **Kiadás oldal:** `kiadas` rekord (a forrásszámla ad pénzt)
- Mindkét rekordban azonos `belso_mozgas_xkey` UUID — ez köti össze a két oldalt
- Kategóriák: mindig **100.xx kódok** (100.01 = készpénz, 100.02 = banki)
- A belső mozgások NEM számítanak valódi bevételnek/kiadásnak — vagyon-mozgások

### Belső mozgás típusok

| Típus | Forrás | Cél | Leírás |
|-------|--------|-----|--------|
| **Kassza → Bank** | Készpénz (kassza) | Bankszámla | Készpénz befizetés a bankba |
| **Bank → Kassza** | Bankszámla | Készpénz (kassza) | Készpénz felvét a bankból |
| **Bank → Bank** | Bankszámla A | Bankszámla B | Átutalás bankszámlák között |
| **Valutacsere** | RON számla | EUR számla (vagy fordítva) | Devizaváltás, árfolyammal |

### Sorszámozás — két különálló rendszer

| Rendszer | Formátum | Mikor használt |
|----------|----------|---------------|
| **Normál nyugtaszám** | Növekvő egész szám (1, 2, 3...) | Készpénzes bevételeknél |
| **BM sorszám** | `BM-{N}/{év}` (pl. BM-3/2026) | Belső mozgásoknál |

- Mindkét rendszer **éves** — minden év január 1-én újraindul
- A rendszer automatikusan ajánlja a következő számot
- Duplikáció- és hiány-ellenőrzés mindkét rendszerben

### Dátum szabályok

| Szabály | Viselkedés |
|---------|-----------|
| **Jövőbeli dátum** | TILTVA — a rendszer blokkolja, piros badge, mentés nem lehetséges |
| **Visszamenőleges dátum** | FIGYELMEZTETÉS — sárga badge, de megengedett (utólagos elszámoláshoz) |
| **Utolsó rögzített dátum** | A rendszer nyilvántartja az utolsó rögzített tételt, és figyelmeztet ha ennél korábbit adunk meg |

### Költségvetés

- A költségvetés **éves** — a `bealitas` tábla éves rekordjához kapcsolódik
- Bevétel és kiadás tételek a `szamadasicel` hierarchia alapján
- Minden tételhez összeg rendelhető (terv)
- **Élő egyenleg:** a bevétel tételek összege − kiadás tételek összege → valós időben számolva
- **Véglegesítés:** zárolás után a tételek nem módosíthatók
- **Módosítás (revízió):** véglegesítés után is lehetséges, de külön oszlopban jelenik meg
- **Feloldás:** csak esperes/admin oldhatja fel

### Számadás (éves zárás)

- A számadás a **tényleges** bevételeket és kiadásokat mutatja a költségvetési tételek szerint
- **Terv vs. Tény:** minden tételnél megjelenik a tervezett és a tényleges összeg
- **Záró leltár:** fizikai készlet rögzítés (kassza egyenleg + bank egyenleg az év végén)
- **Véglegesítés:** két lépésben:
  1. Záró leltár kitöltése
  2. Számadás véglegesítése (zárolás)
- **Feloldás:** esperes/admin jóváhagyás szükséges

### Átviteli egyenleg

- Az előző év záró egyenlege automatikusan a következő év nyitó egyenlege
- **Kassza nyitó:** előző év összes készpénzes bevétel − készpénzes kiadás
- **Bank nyitó:** előző év összes banki bevétel − banki kiadás
- Ha nincs előző évi adat → 0

### Tartozás számítási mód

A gyülekezet beállíthatja hogyan számolja a régi évek hátralékát:

| Mód | Leírás | Példa |
|-----|--------|-------|
| **„Akkori"** | Az adott év érvényes járulékával számol | 2023: 80 RON, 2024: 100 RON → 2023 hátraléka 80 RON |
| **„Aktuális"** | A jelenlegi járulékkal számol minden évre | 2023 és 2024 is 100 RON (ha most 100 RON a járulék) |

### Leltár automatikus jelölés

Ha a kiadás kategóriája az alábbi kulcsszavak egyikét tartalmazza, a rendszer automatikusan leltárba helyezi:
- beruházás, felszerelés, leltár, eszköz, gép, bútor

Ez a `leltar_tetelek` táblában hoz létre rekordot a kiadás adataival.

### Tranzakció törlés

- A törlés **soft delete** — `deleted = true` flag
- A törölt rekordok nem jelennek meg a listákban, de az adatbázisban megmaradnak
- Visszavonás nincs — de a rekord elméletileg visszaállítható adminisztrátori szinten

---

## 3. Validációk

### Bevétel rögzítés

| Mező | Szabály |
|------|---------|
| Összeg | Kötelező, pozitív szám |
| Dátum | Kötelező, NEM jövőbeli |
| Kategória (befizetescel) | Kötelező |
| Személyazonosítás | Opcionális (de ajánlott — párosítatlan befizetés audit jelzi a hiányt) |
| Iratszám (nyugtaszám) | Készpénzes bevételnél kötelező, egyedi (duplikáció ellenőrzés) |
| Irattípus | Készpénz VAGY Banki |
| Fizetett év | Opcionális (járulékhoz kötelező) |

### Kiadás rögzítés

| Mező | Szabály |
|------|---------|
| Összeg | Kötelező, pozitív szám |
| Dátum | Kötelező, NEM jövőbeli |
| Kategória (kiadascel) | Kötelező |
| Partner | Opcionális (szabad szöveg vagy személy/cég keresés) |
| Bizonylatszám | Opcionális |
| Irattípus | Készpénz VAGY Banki |

### Belső mozgás

| Mező | Szabály |
|------|---------|
| Összeg | Kötelező, pozitív szám |
| Dátum | Kötelező, NEM jövőbeli |
| Forrás | Kötelező (kassza VAGY bankszámla) |
| Cél | Kötelező (kassza VAGY bankszámla), NEM lehet ugyanaz mint a forrás |
| Árfolyam | Kötelező valutacserénél |
| Célösszeg | Valutacserénél: forrás × árfolyam |

### Költségvetés

| Mező | Szabály |
|------|---------|
| Tétel összeg | Pozitív szám vagy 0 |
| Véglegesítés | Minden tételnek ki kell lennie töltve (0 is elfogadott) |
| Módosítás | Véglegesítés után csak revízió módban, külön oszlopban |

### Bankszámla

| Mező | Szabály |
|------|---------|
| Bank neve | Kötelező |
| IBAN | Opcionális |
| Valuta | Kötelező (RON vagy EUR) |
| Aktív | Boolean |

### Bérleti szerződés

| Mező | Szabály |
|------|---------|
| Bérlő | Kötelező (személy VAGY cég) |
| Összeg | Kötelező, pozitív szám |
| Időszak | Kötelező (kezdet + vég dátum) |
| Gyakoriság | Havi / Negyedéves / Féléves / Éves |

---

## 4. Korlátozások

### Véglegesítés zárolás

- **Véglegesített költségvetés** NEM szerkeszthető — csak feloldás kérelemmel (esperes/admin elbírálás)
- **Véglegesített számadás** NEM szerkeszthető — csak esperes/admin feloldással
- A feloldás kérelem a `bealitas.unlock_requested` flag-gel jelölhető
- Amíg a kérelem elbírálás alatt áll → „Várakozás az elbírálásra..." üzenet

### Dátum korlátok

- Jövőbeli dátumú tételt a rendszer NEM enged menteni
- Visszamenőleges dátumot figyelmeztetéssel enged, de nem blokkolja (utolagos elszámolás lehetősége)
- Az utolsó rögzített dátum előtti dátumot sárga badge-gel jelzi

### Sorszámozás

- A nyugtaszám NEM módosítható utólag
- Duplikált nyugtaszám esetén piros badge figyelmeztet (de nem blokkolja a mentést)
- Kimaradt sorszám esetén sárga badge figyelmeztet

### Belső mozgások

- Nem hozható létre belső mozgás ha nincs aktív bankszámla
- A forrás és a cél NEM lehet azonos (kassza↔kassza nem lehetséges, ugyanaz a bank↔ugyanaz a bank sem)
- A valutacsere csak eltérő pénznemű számlák között lehetséges

### Soft delete

- Törölt rekordok (`deleted = true`) nem jelennek meg sehol a felületen
- A törlés nem vonható vissza a felületen — de az adat megmarad az adatbázisban

---

## 5. Workflow szabályok

### Bevétel rögzítés (egyedi)

```
1. Lelkész megnyitja az egységes tranzakció modalt (Bevétel fülön)
2. A rendszer betölti:
   — Az utolsó rögzített dátumot (visszamenőleges ellenőrzéshez)
   — A következő nyugtaszámot (automatikus ajánlat)
3. Kiválaszt egy személyt (okos keresővel) VAGY szabad szöveget ír
4. Választ kategóriát (szamadasicel dropdown)
5. Megadja az összeget és a dátumot
6. Mentés → a rendszer:
   — Ellenőrzi a dátumot (nem jövőbeli, figyelmeztet ha visszamenőleges)
   — Ellenőrzi a nyugtaszámot (nem duplikált)
   — INSERT befizetes táblába
   — Ha leltár kategória → INSERT leltar_tetelek táblába is
7. A tranzakció lista frissül, toast üzenet
```

### Bevétel rögzítés (batch mód)

```
1. A batch mód a táblázatos módra vált (több sor egyszerre)
2. Minden sorban: dátum, személyazonosítás, kategória, összeg, iratszám, év
3. Többéves járulék: egy személyhez több sor, különböző évekre
4. Járulék kedvezmény automatikusan alkalmazódik
5. Batch mentéskor az ÖSSZES sor egyszerre INSERT-álódik
6. Soronkénti validáció (dátum, duplikáció, hiányzó szám)
```

### Belső mozgás

```
1. Lelkész a „Belső mozgás" gombra kattint
2. Kiválasztja a típust:
   a) Kassza → Bank
   b) Bank → Kassza
   c) Bank → Bank
   d) Valutacsere
3. Kiválasztja a forrás és cél számlákat
4. Megadja az összeget (valutacserénél: árfolyam + célösszeg)
5. Mentés → a rendszer:
   — Generál egy közös UUID-t (belso_mozgas_xkey)
   — INSERT befizetes (cél oldal, 100.xx kategória)
   — INSERT kiadas (forrás oldal, 100.xx kategória)
   — INSERT belsomozgas (naplózás)
   — BM sorszám generálás
6. A kassza és bank egyenlegek azonnal frissülnek
```

### Költségvetés véglegesítés

```
1. Lelkész kitölti a bevétel és kiadás tételek tervezett összegét
2. Az élő egyenleg valós időben frissül (bevétel − kiadás)
3. „Véglegesítés" gombra kattint
4. A rendszer:
   — UPSERT koltsegvetes (minden tételhez)
   — UPDATE bealitas: budget_finalized = true
   — Nyomtatási ablak megnyílik automatikusan
5. Véglegesítés után a tételek zárolódnak
6. Ha módosítás kell → revízió mód (külön oszlopban, nem az eredetit írja felül)
7. Ha teljes feloldás kell → esperes feloldás kérelem
```

### Számadás véglegesítés (kétlépéses)

```
1. Lépés: Záró Leltár
   — A lelkész kitölti a fizikai készletet (kassza + bank egyenleg)
   — Mentés → bealitas.szamadas_zaro_adatok frissül
2. Lépés: Véglegesítés
   — A rendszer összeveti a tervet a ténnyel
   — „Véglegesítés" → bealitas.accounting_finalized = true
   — Nyomtatási ablak megnyílik
3. Feloldás: esperes/admin kérelem szükséges
```

### Tartozás elemzés

```
1. A rendszer lekérdezi az évtartományra:
   — Járulék befizetések (101.01 kód)
   — Bérleti befizetések (104.04–05 kódok)
   — Bérleti szerződések (elvárt összeg)
   — Felmentések (személyi + családi)
   — Évenkénti járulék összegek (bealitas)
   — Kedvezmények
   — Tartozás számítási mód (akkori vs. aktuális)
2. Személyenként kiszámítja:
   — Elvárt összeg (járulék × évek, kedvezményekkel csökkentve, felmentéseket kihagyva)
   — Fizetett összeg
   — Hátralék = elvárt − fizetett (negatív = túlfizetés)
3. Bérleti szerződésenként:
   — Elvárt összeg (összeg × gyakoriság × évek)
   — Fizetett összeg
   — Hátralék
```

### Párosítatlan befizetések audit

```
1. A rendszer megkeresi az összes befizetes rekordot ahol id_szemely = NULL
2. Minden párosítatlan befizetésnél a „forrasa" mezőt elemzi:
   — Szétbontja: „Név - Utca Házszám" formátumból
   — Magyar asszonynév felismerés (Kovácsné, Kovács Istvánné, lánykori név)
   — Névprefix eltávolítás (ifj., id., dr., özv.)
3. A tagnyilvántartásból keresési találatokat jelenít meg
4. A felhasználó jóváhagyja az összekötést
5. UPDATE befizetes: id_szemely = kiválasztott tag ID
```

---

## 6. Edge case-ek

### Bevétel / Kiadás

| Eset | Mi történik |
|------|-------------|
| Összeg 0 vagy negatív | Validáció blokkolja — pozitív szám kötelező |
| Dátum jövőbeli | Piros badge, mentés BLOKKOLVA |
| Dátum visszamenőleges | Sárga badge (figyelmeztetés), de mentés megengedett |
| Nyugtaszám duplikátum (DB-ben) | Piros badge: „Már létezik!" |
| Nyugtaszám duplikátum (batch-en belül) | Piros badge: „Duplikátum a batch-ben!" |
| Kimaradt sorszám | Sárga badge: „Kimaradt: X–Y" |
| Személy nincs kiválasztva (bevétel) | Megengedett — de az audit rendszer később jelzi mint „párosítatlan" |
| Kiadás kategória leltár-jellegű | Automatikusan bejelölődik a leltár checkbox → leltar_tetelek INSERT |
| Kiadás kategória NEM leltár-jellegű de manuálisan bejelölt | A leltár jelölés megmarad — a felhasználó dönt |
| Több bevételi sor ugyanazon személyhez, különböző évekre | Megengedett — többéves járulék batch mód |
| Összeg tizedes: 100,5 | A rendszer két tizedes jegyre kerekít (100,50) |

### Belső mozgások

| Eset | Mi történik |
|------|-------------|
| Nincs aktív bankszámla | A belső mozgás modal nem nyitható meg bankszámla nélkül |
| Forrás = cél | Validáció blokkolja |
| Valutacsere: ugyanaz a pénznem mindkét oldalon | Nincs értelme — a rendszer figyelmeztet |
| Valutacsere: nincs árfolyam | Validáció blokkolja a mentést |
| A kettős bejegyzés egyik oldala sikerül, a másik nem | Nincs tranzakció — az első INSERT hibája esetén a második nem fut le |
| BM sorszám ütközés | Elméletileg lehetséges concurrent használatkor — a rendszer a COUNT + 1 alapján számol |

### Költségvetés

| Eset | Mi történik |
|------|-------------|
| Véglegesítés után szerkesztés | BLOKKOLVA — „Költségvetés feloldása" gomb jelenik meg |
| Feloldás kérelem elküldve | „Várakozás az elbírálásra..." gomb (letiltva) |
| Nincs egyetlen tétel sem kitöltve | A véglegesítés 0 összegekkel menti el |
| Bevétel < kiadás (negatív egyenleg) | Figyelmeztetés, de nem blokkolja a véglegesítést |
| Több gyülekezet azonos szamadasicel-lel | Nincs ütközés — a koltsegvetes a congregation_id-vel is szűr |

### Számadás

| Eset | Mi történik |
|------|-------------|
| Záró leltár nincs kitöltve de véglegesít | A záró leltár szekció üres marad — a rendszer figyelmeztet de megengedi |
| Terv összeg és tény összeg nagy eltérése | Vizuálisan jelezve (százalékos eltérés), de nem blokkolja |
| Nincs költségvetés véglegesítve de számadást akar | A terv oszlopban 0-k jelennek meg — a tény kitöltődik |

### Tartozások

| Eset | Mi történik |
|------|-------------|
| Nincs bealitas rekord egy évre | Az évre nem számol járulékot (0 RON) |
| Felmentett személy | Nem jelenik meg a tartozások listáján |
| Családi felmentés | A család összes tagja felmentett (id_csalad alapján) |
| Túlfizetés (többet fizetett mint az elvárt) | Negatív hátralék → „Túlfizetés" jelzéssel, zölddel |
| Tartozás számítási mód váltás | Az eredmények azonnal újraszámolódnak a választott módszerrel |
| Bérleti szerződés lejárt | A lejárt időszakra nem számol új tartozást, de a régi hátralék megmarad |
| Kedvezmény + felmentés együtt | A felmentés erősebb — ha felmentett, nem kap kedvezményt (nem is kell) |

### Audit

| Eset | Mi történik |
|------|-------------|
| Forrás mező üres a bevételi rekordon | A párosítás nem lehetséges — kézi keresés szükséges |
| Magyar asszonynév: „Kovácsné" (csak férj családneve) | A rendszer a „Kovács" családnévre keres |
| Asszonynév: „Kovács Istvánné Erzsébet" | A rendszer „Kovács Erzsébet" néven keres |
| Asszonynév: „Becsek Richárdné Stefán Beáta" | A rendszer „Stefán Beáta" (lánykori) néven keres |
| Névprefix: „ifj. Kovács István" | A rendszer levágja az „ifj." prefixet és „Kovács István" néven keres |
| Több találat azonos pontozással | Mind megjelenik — a felhasználó választ |
| Nincs találat | „Nincs egyezés" üzenet — kézi keresés felajánlva |

### Bankszámlák

| Eset | Mi történik |
|------|-------------|
| BCR import: ismeretlen CSV formátum | Hiba üzenet, nincs preview |
| BCR import: duplikált tranzakciók | Nincs automatikus duplikáció-szűrés — a felhasználó dönt |
| Bankszámla inaktiválása | Nem jelenik meg a dropdown-okban, de a korábbi tranzakciók megmaradnak |
| Valutacsere: BNR API nem elérhető | Kézi árfolyam bevitel lehetséges (fallback) |

### Monetár (pénztári egyeztetés)

| Eset | Mi történik |
|------|-------------|
| Fizikai készlet = könyv szerinti egyenleg | Zöld: „Egyezik!" |
| Eltérés ≤ 0,01 RON | Zöld: kerekítési eltérés (elfogadott) |
| Eltérés > 0,01 RON | Piros: eltérés összege kijelezve |
| Nincs egyetlen tranzakció sem | A könyv szerinti egyenleg 0 — az egyeztetés értelmetlen |
