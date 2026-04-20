# 📖 KARTOTEKA — Felhasználói Kézikönyv

> **Gyülekezeti nyilvántartó rendszer lelkészeknek**
>
> Erdélyi Református Egyházkerület
>
> Verzió 1.0 · 2026. április 15.

---

## 👋 Üdvözöllek!

Tisztelt Lelkésztestvérem!

Köszönöm, hogy a **KARTOTEKÁ**-t választottad. Ez a rendszer azzal a céllal készült, hogy Te a **szolgálatra** koncentrálhass — az adminisztráció a háttérben, csendben, hatékonyan működjön.

Ebben a kézikönyvben **mindent** megtalálsz:

- 🌱 Hogyan kezdj el — az első 10 perc
- 🏛️ Mind a 8 modul bemutatása (tagnyilvántartás, pénzügy, anyakönyv, munkanapló, iktató, leltár, sírhely, jegyzőkönyvek)
- 💾 Hogyan dolgozz **internet nélkül is** (offline mentés)
- 📊 Hogyan exportálj Excelbe, hogyan mentsd biztonságba az adatokat
- 🗑️ A „Kuka" — hogyan **vonhatsz vissza** bármit
- 🔐 Adatbiztonság, GDPR, mit szabad és mit nem
- ❓ Gyakori kérdések, hibaelhárítás

A kézikönyv **lépésről-lépésre**, emberi nyelven magyaráz el mindent. Nem kell informatikusnak lenni — ha elolvasod, mindent fogsz érteni.

---

## 📚 Tartalomjegyzék

1. [Első lépések — 10 perc alatt kész](#1-első-lépések)
2. [Főoldal és navigáció](#2-főoldal-és-navigáció)
3. [Modulok részletesen](#3-modulok-részletesen)
   - 3.1 [Tagnyilvántartás](#31-tagnyilvántartás)
   - 3.2 [Pénzügy](#32-pénzügy)
   - 3.3 [Anyakönyv](#33-anyakönyv)
   - 3.4 [Munkanapló](#34-munkanapló)
   - 3.5 [Iktató](#35-iktató)
   - 3.6 [Leltár](#36-leltár)
   - 3.7 [Sírhely](#37-sírhely)
   - 3.8 [Jegyzőkönyvek](#38-jegyzőkönyvek)
4. [Offline használat](#4-offline-használat)
5. [Excel export — biztonsági mentés](#5-excel-export)
6. [Excel import — visszaszinkron](#6-excel-import)
7. [Kuka — a 30 napos visszavonási időszak](#7-kuka)
8. [Teljes biztonsági mentés (ZIP)](#8-teljes-biztonsági-mentés)
9. [Adatvédelem és biztonság](#9-adatvédelem-és-biztonság)
10. [Gyakran Ismételt Kérdések (GYIK)](#10-gyik)
11. [Hibaelhárítás](#11-hibaelhárítás)
12. [Billentyűparancsok](#12-billentyűparancsok)
13. [Kapcsolat és segítség](#13-kapcsolat-és-segítség)

---

## 1. Első lépések

### 🌱 10 perc alatt használatba veheted

#### 1.1 Bejelentkezés

A KARTOTEKA két módon érhető el:

| Mód | Mikor ajánlott | Jellemzők |
|-----|----------------|-----------|
| 🌐 **Weboldalként** (böngészőben) | Ha mindig van internet | Bejelentkezés jelszóval, böngészőből indul |
| 💻 **Telepített alkalmazásként** | Ha gyakran offline dolgozol | Kicsomagolt ZIP-ből, ikonra kattintva indul |

#### 1.2 Első belépéskor

Amikor **először** lépsz be a rendszerbe:

1. **A Főoldal** megnyílik, üdvözöl téged
2. **A neved** és a **gyülekezeted neve** látszik a fejlécben
3. Az **oldalmenüben** balra találod a 8 modult

> 💡 **Tipp**: Ha a menüben nem látsz minden modult, valószínűleg még nincs jogosultságod hozzá. Fordulj az esperesi hivatalhoz.

#### 1.3 Először ezt csináld

Javasolom, hogy az alábbi sorrendben nézd át a rendszert:

**🔸 1. lépés — Ismerd meg a főoldalt**
A Főoldalon látszik:
- Hány személy van a gyülekezetedben
- A legutóbbi tevékenységek
- Közelgő születésnapok, évfordulók
- Napi áhítat (ha bekapcsolod)

**🔸 2. lépés — Kattints a „Tagnyilvántartás" menüpontra**
Itt láthatod a gyülekezet tagjait. Próbálj ki egy-egy személyre kattintani, hogy megismerd a részletes nézetet.

**🔸 3. lépés — Állítsd be a „Gyülekezetünk" adatait**
A jobb felső sarokban a **profil-ikonnál** kattints a **„Gyülekezetünk"** menüpontra. Ellenőrizd:
- Gyülekezet neve (magyar, román, angol)
- Cím, adószám, IBAN
- Kapcsolatok (esperes, megye, kerület)

**🔸 4. lépés — Állíts be egy **biztonsági mentés mappát**
A profil-ikonnál: **„Offline mentés"** → kövess a varázslót. Ez biztosít, hogy még a leges-legrosszabb esetben se veszítsd el az adataidat.

**Készen is vagy az alapokkal!** 🎉

---

## 2. Főoldal és navigáció

### 🏠 Mit látsz a Főoldalon

A **Főoldal** egy áttekintő, amely a legfontosabb információkat egy helyen mutatja.

```
┌─────────────────────────────────────────────────────────┐
│  [KARTOTEKA logo]   Barátosi Ref. Egyházk.   [👤 Profil]│
├─────────────────────────────────────────────────────────┤
│  📊 Tagok         🎂 Születésnapok     💰 Pénzügy       │
│     358            12 e héten            3 bejövő       │
│                                                           │
│  📜 Legutóbbi     📅 Közelgő            📈 Idei év      │
│     bejegyzések   események             statisztika     │
└─────────────────────────────────────────────────────────┘
```

### 🧭 A felső sáv (menü)

A fejlécben mindig látható:

- **🏠 Kezdőlap** — vissza a főoldalra
- **📋 Tagnyilvántartás, Pénzügy, Anyakönyv...** — a modulok
- **🔔 Értesítések** (harangikon, ha van új)
- **👤 Profil** (jobb felső sarokban)

### 👤 A profil menü — 5 fontos opció

A jobb felső sarokban lévő ikonra kattintva:

| Menüpont | Mit csinál |
|-----|-----|
| 👤 **Profil** | Saját adataid, jelszó váltás |
| ⛪ **Gyülekezetünk** | Gyülekezet adatai, logó, cím |
| 💾 **Offline mentés** | Biztonsági mentések, Excel export |
| 🗑️ **Kuka** | Törölt rekordok visszaállítása |
| 🚪 **Kilépés** | Biztonságos kijelentkezés |

> 💡 **Tipp**: Mindig **Kilépés**-sel zárd be a munkafolyamatot, ne csak a böngészőablakot! Így biztosan senki más nem fér hozzá az adataidhoz.

### 📱 Mobilon / Tableten

A rendszer **mobil-barát** — telefonon és tableten is tökéletesen működik:

- A menü a bal felső sarokba csukódik (**≡ hamburger ikon**)
- Minden táblázat oldalra görgethető
- Az űrlapok egyetlen oszlopban rendeződnek
- Nagyítható/kicsinyíthető, ha kell

---

## 3. Modulok részletesen

### 3.1 Tagnyilvántartás

#### 🎯 Mire való?

A **Tagnyilvántartás** a gyülekezet minden tagjának adatait kezeli. Itt találod:
- **Személyek** — minden egyes gyülekezeti tag
- **Családok** — hogy ki kihez tartozik
- **Presbiterek** — a gyülekezet presbitériumai
- **Gyermekek** — családi kapcsolatok
- **Felmentések** — járulékmentességek

#### 📝 Új személy felvétele

1. Kattints a **„+ Új személy"** gombra a jobb felső sarokban
2. Töltsd ki a mezőket:

| Mező | Példa | Kötelező? |
|---|---|---|
| CNP (személyi szám) | `1780512123456` | Igen |
| Családi név | `Szabó` | Igen |
| Keresztnév | `János` | Igen |
| Születési dátum | `1978-05-12` | Igen |
| Férfi? | ✅ | Igen |
| Állapot | Aktív, Elköltözött, Elhunyt | Igen |
| Telefonszám | `+40 740 123 456` | Nem |
| Email | `szabo.janos@example.hu` | Nem |

3. **Cím megadása** — utca, szám, lakás, helység
4. **Szülők** — ha ismerjük őket, válaszd ki a listából vagy add meg a nevüket
5. **Családi kapcsolat** — csatold hozzá egy meglévő családhoz, vagy hozz létre újat
6. Kattints **„Mentés"**-re

> 💡 **Tipp**: A **keresztelési adatok, konfirmálás** stb. nem itt kerülnek be, hanem az **Anyakönyv** modulban! Onnan kapcsolódnak vissza a személyhez.

#### 🔍 Keresés és szűrés

A listában:
- **🔎 Keresés mező** — bármilyen rész-szóra keres (név, CNP, telefon)
- **Szűrők**:
  - Aktív / Elköltözött / Elhunyt
  - Férfi / Nő
  - Korosztály (gyerek, felnőtt, idős)
  - Körzet / Utca
  - Konfirmált / Még nem
- **Rendezés**: név szerint, szül. dátum szerint, legutóbb módosított

#### 💡 Praktikus tippek

> **„Ma meglátogattam Szabó Jánost, adjunk hozzá egy megjegyzést"**
>
> ✅ Menj a személyhez → kattints a **„Megjegyzés"** fülre → írd be. A dátum automatikusan mentődik.

> **„Néhány éve elköltözött Kolozsvárra"**
>
> ✅ Nyisd meg a személyt → **„Állapot"** → válaszd: „Elköltözött" → add meg a dátumot és a helyet. Az anyakönyvbe automatikusan bekerül.

#### 🎁 Életkor + CNP automatikus

Ha beírod a CNP-t, a rendszer **automatikusan** kiszámolja:
- Születési dátumot
- Nemet
- Életkort

Csak ellenőrizni kell — gyorsabb, és nincs elírás!

---

### 3.2 Pénzügy

#### 🎯 Mire való?

A **Pénzügy** modul a gyülekezet bevételeit és kiadásait kezeli:
- **Befizetések** (járulék, perselypénz, egyéb)
- **Kiadások** (bérek, rezsi, karbantartás)
- **Bankszámlák** (kassza és bank együtt)
- **Belső mozgás** (kassza → bank átutalás)
- **Bérleti szerződések** (ingatlanok, földek)
- **Költségvetés és számadás**

#### 💰 Új befizetés rögzítése

1. **Pénzügy → + Új befizetés**
2. Töltsd ki:

| Mező | Magyarázat |
|---|---|
| **Dátum** | Mikor fizetett |
| **Összeg (RON)** | Mennyit |
| **Ki fizetett?** | Keress rá a névben, válaszd ki |
| **Forrás** | Egyházfenntartás járulék / Perselypénz / Adomány... |
| **Iratszám, Nyugta** | A pénztárkönyv kódja |
| **Bankszámla** | Kassza vagy valamelyik bank |

3. **Mentés** — a rendszer automatikusan kiszámolja:
   - A család tartozását (ha van)
   - Az évi egyenleget
   - A naplót

#### 📊 A pénzügyi dashboard

A **Pénzügy főoldalán** látszik:
- Havi bevétel / kiadás grafikon
- Kassza aktuális egyenleg
- Bank aktuális egyenleg
- Lejárt tartozások (kinek mennyivel tartozunk)

#### 💡 Praktikus tippek

> **„A pénztárkönyvet minden vasárnap vezetem"**
>
> ✅ Csak add be sorban a befizetéseket. A rendszer **magától** rendezi időrendbe, kiszámítja az egyenleget, és számadási jelentést készít.

> **„Nem tudok fejben követni, ki nem fizetett"**
>
> ✅ Menj **Pénzügy → Tartozások** fülre. Itt látszik mindenki aki késésben van, mennyivel, melyik évvel.

#### 💶 Belső mozgás (kassza → bank)

Ha a pénzt a kasszából a bankba tetted (vagy fordítva):
1. **Pénzügy → Belső mozgás → + Új**
2. Típus: **kassza_bank**, **bank_kassza** vagy **bank_bank**
3. Forrás + Cél (melyik számláról-melyikre)
4. Összeg (opcionálisan különböző valuta is lehet)
5. Mentés

Ez automatikusan **2 tranzakciót generál** (egy kivétel, egy betét) — nincs dupla adminisztráció.

---

### 3.3 Anyakönyv

#### 🎯 Mire való?

Az **Anyakönyv** tartalmazza a gyülekezet **hivatalos egyházi adminisztrációját**:
- **Keresztelések** 🌊
- **Konfirmációk** ✝️
- **Házasságok** 💍
- **Temetések** ⚱️
- **Tagmozgás** (beköltözés, elköltözés, áttérés, kitérés) 🚶

#### 🌊 Új keresztelés rögzítése

1. **Anyakönyv → Keresztelések → + Új**
2. **Személy kiválasztása** — a rendszer keres a Tagnyilvántartásban
   - Ha még nincs, először **ott** vedd fel
3. Alapadatok:
   - **Dátum** — a keresztelés napja
   - **Okiratszám** — automatikusan ajánl következőt (pl. `202604001`)
   - **Lelkész neve** — automatikusan a te neved
   - **Keresztszülők** — teljes név, vesszővel
4. Haladó:
   - **Apa vallása**, **Anya vallása**, **Anya leánykori neve** (igekártya kiállításhoz)
   - **Alapige** — amit idéztél
   - **Hely** — hol történt

5. Opció: **„Munkanaplóba is bejegyezzem?"** ✅ bepipálva — egy kattintással bekerül a szolgálati napló is.

#### 💍 Új házasság

Hasonló folyamat, de **két** személyt kell kiválasztani (férj + feleség):
- **Vőlegény** (a Tagnyilvántartásból)
- **Menyasszony** (a Tagnyilvántartásból, vagy ha más gyülekezetből jön: add meg a nevét)
- **Dátum**, **Házassági levél száma**, **Lelkész**, **Tanúk**

#### ⚱️ Új temetés

- **Személy** — akit eltemettünk
- **Halál dátuma** (hdatum)
- **Halál oka**
- **Temetés dátuma** (tdatum)
- **Halál helye** (város), **Temetés helye** (temető)
- **Lelkész**

> 💡 **Fontos**: a temetésnél a személy **automatikusan** „elhunyt"-ra vált a Tagnyilvántartásban. Nem kell külön módosítanod.

#### ✝️ Konfirmálás batch — egyszerre többen

1. **Anyakönyv → Konfirmálások → + Új csoport**
2. Dátum, Lelkész neve
3. **Jelöltek listája** — válogass ki 5-15 nevet
4. A rendszer **egy kattintásra** bejegyzi mindegyiknek a konfirmálást

> 💡 **Tipp**: A sor mellett zöld pipával jelöli, aki már konfirmált korábban — azt kihagyja, nem duplikál.

#### 🚶 Tagmozgás

Négy fajta:

| Típus | Mikor |
|---|---|
| **Beköltözés** | Más gyülekezetből hozzánk került |
| **Elköltözés** | Másik gyülekezetbe ment |
| **Áttérés** | Más felekezetből hozzánk |
| **Kitérés** | Másik felekezetbe ment |

Ugyanaz az űrlap: személy + dátum + hely + megjegyzés.

---

### 3.4 Munkanapló

#### 🎯 Mire való?

A **Munkanapló** a lelkészi szolgálat folyamatos dokumentációja. Ez alapján készül az **éves lelkészi jelentés**.

Három fő kategória:
- **Szolgálatok** — istentisztelet, bibliaóra, imaóra
- **Katekézis** — hittanóra, konfirmáció-előkészítő
- **Látogatások** — családlátogatás, kórház, idősek

#### 📖 Új szolgálat rögzítése

Egy istentisztelet felvétele például így:

1. **Munkanapló → + Új bejegyzés**
2. Kategória: **Szolgálat**
3. Típus: **Istentisztelet**
4. Dátum
5. **Alapige** (pl. `Jn 3,16`)
6. **Bibliaolvasás** (pl. `Mt 5`)
7. **Énekek** (pl. `458, 372, 205`)
8. **Jelenlét**: `Férfi: 25 | Nő: 42 | Gyermek: 8`
   (A rendszer **automatikusan** kiszámolja az összesent: 75)
9. **Perselypénz** (RON)
10. **Szolgálatot vezette** (ha nem te voltál)
11. **Megjegyzés** (tetszés szerint)

**Mentés** → bekerül a munkanaplóba, havi jelentésbe, éves jelentésbe.

#### 📊 Havi összesítő

A **Munkanapló főoldalán** havi kiválasztó:
- **Szolgálatok** száma, összes jelenlét, perselypénz
- **Katekézis** száma, jelenlét
- **Látogatások** száma
- **Jelentési szöveg** (automatikusan generált, **copy-paste**-el az évi jelentésbe)

#### 📄 Lelkészi jelentés nyomtatása

- **Munkanapló → Jelentés fül → Nyomtatási központ**
- Válaszd az évet / hónapot
- Válaszd a nyomtatvány típusát:
  - **Havi jelentés** (presbiteri ülésre)
  - **Éves jelentés** (esperesi hivatalnak)
  - **Külön szolgálati lista**
- Előnézet → **Nyomtatás** vagy **PDF mentés**

---

### 3.5 Iktató

#### 🎯 Mire való?

Az **Iktató** a beérkező és kimenő **hivatalos iratok** nyilvántartása. Ez egyházi kötelezettség (presbiteri határozattal kell vezetni).

Két irány:
- **Érkező** 📥 — hozzánk jött levél (esperesi, zsinati, hivatali...)
- **Kimenő** 📤 — mi küldtünk

#### 📥 Új érkező irat

1. **Iktató → + Új érkező irat**
2. Automatikusan kap **sorszámot**: `2026/0042`
3. **Dátum** (Kelt)
4. **Feladó** (pl. „Erdélyi Egyházkerület Püspöki Hivatal")
5. **Tárgy** (rövid: „2026-os évi egyházadó kimutatás")
6. **Tárgykivonat** (ha bővebb leírás kell)
7. **Irattári jel** — a papír hol van (pl. "F.Á. — Éves adminisztráció")
8. **Oldalszám**
9. Ha elintézted:
   - **Elintézés ideje**
   - **Elintézés módja** (pl. „Válaszoltam levélben 2026/0078")

#### 📤 Kimenő irat — sablonokkal

**Iktató → Sablonok** — itt készíthetsz **formanyomtatvány-sablonokat**. Pl.:
- **Keresztelési igazolás** sablon
- **Presbiteri határozat-kivonat** sablon
- **Temetési igazolás** sablon

Amikor új kimenő iratot készítesz:
1. **Sablon választása** a dropdown-ban
2. A rendszer **automatikusan kitölti** a tárgyat, tárgykivonatot
3. Te csak a címzett nevét és dátumot kell megadnod
4. **Nyomtatható PDF** azonnal kész

#### 🔍 Gyors keresés az irattárban

Az iktató-főoldal jobb oldalán:
- **Év-választó** (2024, 2025, 2026...)
- **Irány** (bejövő / kimenő / mind)
- **Kereső mező** (tárgy, feladó/címzett)

Az összes irat **gombnyomásra** Excel/PDF-be exportálható.

---

### 3.6 Leltár

#### 🎯 Mire való?

A **Leltár** modul a gyülekezet **tárgyi eszközeit** kezeli:
- **Alapeszközök** (bútor, felszerelés)
- **Telkek, földek, erdők**
- **Csekély értékű tárgyak**
- **Könyvek** (presbitérium könyvtár)
- **Kegyszerek** (kelyhek, stb.)
- **Kárpótlási jegyek**
- **Bizományi tárgyak**

#### 📦 Új leltári tétel

1. **Leltár → + Új tétel**
2. **Kategória** → a rendszer **automatikusan ad sorszámot** (pl. `AE-001`, `KV-042`)
3. **Megnevezés** (pl. „Templom hangosítórendszer Bose L1 Pro")
4. **Leltári szám** (hivatalos magyar szám — a rendszer ajánl)
5. **Helyszín** (pl. „Presbiteri terem", „Templomszoba 2.")
6. **Beszerzés**:
   - Dátuma
   - Bizonylat (számla szám)
   - Értéke (RON)
7. **Mennyiség** + mértékegység
8. **Katalógus kód** (állami ATE kódok — van hozzá egy választó)
9. **Felelős** (aki gondját viseli)

Könyvek esetén extra:
- ISBN
- Kiadó, Kiadás helye, éve
- Terjedelem
- Sorozatcím

#### 💡 Automatikus érték-számítás

A rendszer **automatikusan** számítja:
- **Értékcsökkenés** (amortizáció) — az ATE kód szerint
- **Aktuális érték** a beszerzési értékhez képest
- **Összeg per kategória**

#### 🖨️ Leltár-ív nyomtatás

- **Leltár → Nyomtatás**
- Választható típusok:
  - **Hivatalos leltárív** (kategóriánként)
  - **Ellenőrzési lista** (év végi rovancshoz)
  - **Összesítő** (éves záráshoz)

---

### 3.7 Sírhely

#### 🎯 Mire való?

A **Sírhely** modul a gyülekezeti **temetők** nyilvántartása:
- **Temetők** (név, cím)
- **Sírhelyek** (parcella, sor, szám, állapot)
- **Bérletek** (ki kinek, mikortól, meddig)
- **Elhunytak** (ki hol nyugszik)

#### ⛪ Új temető

1. **Sírhely → + Temető**
2. **Név** (pl. „Barátosi református temető")
3. **Cím**
4. **Megjegyzés** (történet, térkép)

#### 🪦 Új sírhely

1. **Sírhely → + Sírhely**
2. **Temető** (dropdown)
3. **Parcella** (betű, pl. „A")
4. **Sor** (szám)
5. **Szám** (a parcellán belül)
6. **Állapot**:
   - **Szabad** — senki nincs itt
   - **Foglalt** — valaki nyugszik benne, aktív bérlet
   - **Lejárt** — a bérlet lejárt
   - **Zárt** — már nem lehet használni
   - **Fenntartott** — lefoglalt, de még üres

#### 💰 Új bérlet

A sírhely melletti `+ Bérlet` gombra:

1. **Bérlő neve** (vagy kapcsoljuk egy meglévő személyhez)
2. **Megváltás dátuma** (mikortól)
3. **Lejárata** (általában 7, 15, 25 év — opcionális)
4. **Összeg**
5. **Megjegyzés**

#### ⚰️ Elhunyt rögzítése

1. Sírhely mellett `+ Elhunyt` gomb
2. **Név** (keresem a tagnyilvántartásban, vagy új név)
3. **Születési dátum**
4. **Halál dátuma**, Halál helye, Anyja neve
5. **Temetés dátuma**, Temetés típusa (egyházi/polgári), Módja (koporsós/hamvasztásos)
6. **Elhelyezkedés** (pl. „Bal felső sarok")
7. **Temettető** (családtag), **Szolgáltató** (temetkezési cég)

A rendszer automatikusan **kapcsolja** az anyakönyvi temetéshez, ha már rögzítve van.

---

### 3.8 Jegyzőkönyvek

#### 🎯 Mire való?

A **Jegyzőkönyvek** modul a **presbiteri és közgyűlési** üléseket dokumentálja.

Minden jegyzőkönyv tartalmaz:
- Alapadatok (dátum, hely, ülés sorszáma)
- **Résztvevők** (jelen voltak vs. igazoltan távol)
- **Napirendi pontok**
- **Határozatok**

#### 📋 Új jegyzőkönyv létrehozása

1. **Jegyzőkönyvek → + Új jegyzőkönyv**
2. **Típus**: Presbiteri vagy Közgyűlési
3. **Dátum**, **Hely** (pl. „Presbiteri terem")
4. **Kezdés** és **Zárás** időpont
5. **Elnök** (általában a lelkész), **Jegyző**, **Hitelesítő 1, 2**
6. **Igevers, Felolvasás** (nyitó ima/igeolvasás)

#### 👥 Résztvevők

- **Jelen lévők** listája (presbiterek, aki eljött)
- **Igazoltan távol** listája

A rendszer **automatikusan** betölti a presbitereket a Tagnyilvántartásból.

#### 📝 Napirendi pontok + diktálás! 🎙️

Minden napirendi pont külön:
- **Sorszám** (automatikus: 1, 2, 3...)
- **Cím** (rövid összefoglaló)
- **Előadó** (aki beszámol)
- **Tárgyalás** (részletes szöveg)
  - 🎤 **Diktálás gomb** — beszélj magyarul, a rendszer leírja!
- **Szavazás eredménye** (Igen / Nem / Tartózkodó)

#### ⚖️ Határozatok

Minden napirendi ponthoz tartozhatnak határozatok:
- **Sorszám** (automatikusan: 2026/001, 2026/002...)
- **Szöveg** (a határozat kimondott szövege) — **diktálható is!**
- **Felelős** — ki fogja végrehajtani
- **Határidő** — mikorra
- **Állapot** — elfogadva / visszavonva / elutasítva

#### 🖨️ Nyomtatás

A **jegyzőkönyv jobb felső sarkában**:
- **Előnézet** → megnézed, milyen lesz
- **Nyomtatás** → hivatalos pecsétes formában

A rendszer automatikusan formázza az aláírási blokkot (elnök, jegyző, hitelesítők).

#### ✅ Véglegesítés

Miután a presbitérium aláírta:
- **„Véglegesítés"** gomb → a jegyzőkönyv **nem módosítható többé**
- Állapot: `draft` → `final`
- Minden határozat **érvényes** innentől

---

## 4. Offline használat

### 💾 Mit jelent az „offline"?

A KARTOTEKA akkor is működik, amikor **nincs internet**!
- Vidéki helyen, ahol gyenge a net
- Utazás közben
- Amikor a szolgáltató kimaradt
- Bármikor, amikor a munkát **nem akarod megszakítani**

### ⚙️ Hogyan működik?

A rendszer **minden fő adatot** elment a gépedre (böngésződ tárolójába vagy SQLite fájlba, ha telepített verziót használsz).

Ha **online** vagy:
- Minden változást azonnal felküld a felhőbe
- Más eszközeidre is lejön (pl. ha otthon is van fiókod)

Ha **offline** vagy:
- A rendszer helyileg dolgozik
- Minden változás egy **várakozó sor**-ba kerül
- Amint újra internet van, automatikusan felküldi

### 🎯 Hogyan ismerd fel az állapotot?

A fejléc tetején egy **kis jelző**:

| Ikon | Jelentés |
|---|---|
| 🟢 **Szinkronban** | Minden rendben, online |
| 🟡 **Szinkronizálás...** | Éppen küldi fel az adatokat |
| ⚠️ **Offline — X változás várakozik** | Nincs net, de a rendszer megőrzi a munkát |
| 🔴 **Hiba** | Valami baj van — kattints az ikonra, hogy lásd |

### 🚪 Biztonsági figyelmeztetés

**Ne zárd be a böngészőt** vagy a KARTOTEKA alkalmazást, amíg az offline változások fel nem töltődtek!

Mindig ellenőrizd az állapot-jelzőt:
- ✅ 🟢 Szinkronban → biztonságosan bezárhatod
- ⚠️ 🟡 vagy ⚠️ → várj pár másodpercet, amíg befejeződik

---

## 5. Excel export

### 📊 Mire való?

Az **Excel export** a gyülekezeti adatok **olvasható biztonsági mentése**:
- Ha a számítógép elromlik, az Excel-eket megőrizted
- Ha vidékre vagy hivatalba kérik, Excelben átadhatod
- Ha táblázatos szerkesztést szeretnél, Excelben is átnézheted

### 🎯 Hogyan működik?

1. **Profil → Offline mentés**
2. **Első alkalommal**: mappa kiválasztása
   - Javasolt: `C:\Users\<nev>\Documents\KARTOTEKA`
   - ⚠️ **NE tedd OneDrive, Dropbox vagy Google Drive mappába** (GDPR!)
3. **„Excel export most"** gomb
4. 5-10 másodperc, és készen is van.

### 📁 Mit kapsz

A kiválasztott mappában létrejön:

```
📂 KARTOTEKA/
└── 📂 <gyülekezeted-neve>/
    ├── 📊 tagnyilvantartas.xlsx  (5 munkalap)
    ├── 📊 penzugy.xlsx           (5 munkalap)
    ├── 📊 anyakonyv.xlsx         (4 munkalap)
    ├── 📊 munkanaplo.xlsx
    ├── 📊 iktato.xlsx            (2 munkalap)
    ├── 📊 leltar.xlsx
    ├── 📊 sirhelyek.xlsx         (4 munkalap)
    └── 📊 jegyzokonyvek.xlsx     (4 munkalap)
```

### 🎨 Hogyan néznek ki?

A fájlok **szépen formázottak**:
- 🎨 **Színes fejléc** (minden modul saját színe)
- 🔵 **Zebra-sorok** (páros/páratlan sor)
- 🔒 **Védett cellák** — **nem írható**, csak olvasható
  - De szűrhető és rendezhető Excel-ben
- 📝 **Automatikus oszlop-szélesség**
- 📅 **Dátum, szám, pénz formázva**

### 🔒 Sheet Protection feloldása

Ha mégis szerkeszteni akarod az Excel-t (lsd. 6. fejezet — import!):
1. Excelben: **Véleményezés → Lapvédelem feloldása**
2. Jelszó: **üres** (csak Enter)
3. Most szerkeszthető

### 📅 Mikor javasolt exportálni?

- **Havonta 1x** — egy rutin részeként
- **Év végén** — az éves ügyvitel lezárásához
- **Fontos változás előtt** — pl. adatbázis-migráció, új verzió telepítése

### 💡 Tipp: Időbélyegzett mentések

Minden Excel export a korábbiakat **nem törli**, hanem `.bak.1`, `.bak.2`, `.bak.3` néven megtartja. Tehát akár **3 időponti** verziód is van.

---

## 6. Excel import

### 📥 Mikor használjam?

Akkor, ha **Excelben** szerkesztettél valamit, és szeretnéd, hogy visszakerüljön a rendszerbe.

**Pl.**:
- Egy nagy excel-adatbázist kaptál másoktól, amit betöltesz
- Excelben jobb volt tömegesen adatot javítani
- Egy régi Excel export-ot akarsz visszatölteni

### 🔄 Hogyan működik

1. **Szerkeszd** az Excel fájlt (lsd. előző fejezet: feloldás)
2. **Ments** (Ctrl+S)
3. A KARTOTEKA **60 másodpercen belül észleli** a változást
4. **Toast értesítés** jelenik meg a jobb felső sarokban:
   ```
   ⚠️  Excel változás észlelve
   Kézi módosítást észleltünk: sirhelyek
   [Áttekintés]
   ```
5. Kattints az **„Áttekintés"** gombra
6. Átvezet a `/offline/import` oldalra

### 👀 Áttekintési oldal

Itt minden változás **modulonként + soronként** látható:

```
📊 sirhelyek.xlsx          [2 változás]  ▼
├─ 📄 Temetők                (nincs változás)
├─ 📄 Sírhelyek              (1 változás)
│   └─ ✏️  Módosítások:
│       ☑️ Sírhely #42 (A/3/5)
│           régi: szabad → új: foglalt
├─ 📄 Bérletek               (1 változás)
│   └─ ➕ Új sorok:
│       ☑️ Kovács Péter (2026-01-15 — 2051-01-15)
└─ 📄 Elhunytak              (nincs változás)
```

### ✅ Kipipálás

Minden sor mellett **checkbox**:
- ✅ Elfogadom ezt a változást
- ❌ (üres) = nem fogadom el (marad az eredeti)

**Alapból**:
- Új sorok: ✅ bepipálva (valószínű el akarod fogadni)
- Módosítások: ✅ bepipálva **kivéve** ha konfliktus van (akkor üres — vigyázz!)
- **Törlések**: ❌ **NINCS** bepipálva (biztonsági okból)

### ⚠️ Törlések — MINDIG RÉSZBEN EMBERI DÖNTÉS!

Ha Excelből **töröltél** egy sort, a rendszer **nem automatikusan törli** a szerveren is. Megkérdez:

```
⚠️ Excel-ből 3 sort töröltél:
  ☐ Szabó János (személy, 2019-05-02)
  ☐ Kovács Mária (személy, 2021-11-15)
  ☐ 500 RON befizetés (2026-03-15)

Biztosan törölni akarod ezeket a szerverről is?
[Visszaállítom Excel-be]  [Törlöm a szerverről is]
```

### 🔄 Konfliktus

Ha Excelben és a KARTOTEKA-ban **ugyanazt a sort** módosítottad, ez **konfliktus**:

```
⚠️ Konfliktus — Sírhely #42

A KARTOTEKÁ-ban:
  parcella: A
  sor: 3
  szam: 5
  állapot: szabad
  módosítva: 2026-04-10

Excel-ben:
  parcella: A
  sor: 3
  szam: 5
  állapot: foglalt
  módosítva: 2026-04-15

Melyiket tartsuk meg?
[Saját változat]  [Szerver változat]  [Manuális összeolvasztás]
```

### 💡 Gyors manuális import

Ha nem akarsz várni a 60s poll-ra:
1. `/offline/import` oldal
2. **„Egy fájl feltöltése"** gomb
3. Válaszd ki a módosított Excel fájlt
4. Azonnal látod a diff-et

---

## 7. Kuka

### 🗑️ Mit csinál a Kuka?

A **Kuka** a KARTOTEKA **biztonsági háló**-ja. Ha véletlenül törölsz valamit, **30 napig visszaállítható**.

### 🎯 Hogyan érhető el?

- **Profil ikon → Kuka**
- VAGY egyes modulok oldalán van kis „Kuka" link

### 📋 Mit látsz a Kukában?

Egy táblázat, modulok szerint csoportosítva:

```
🗑️ Kuka — 8 törölt rekord
├─ ⚠️ 2 hamarosan véglegesen törlődik
└─ [Teljes ürítés]  [30+ napos sorok ürítése]

📊 Tagnyilvántartás · Személyek (2)
  ─ Szabó János  ─ Törölve: 2026-04-10
    [↩ Visszaállítás]  [🗑️ Végleges törlés]
  ─ Kovács Mária ─ Törölve: 2026-03-29 · ⚠️ 1 nap múlva törlődik!
    [↩ Visszaállítás]  [🗑️ Végleges törlés]

📊 Sírhely · Sírhelyek (1)
  ─ Sírhely #42 (A/3/5) ─ Törölve: 2026-04-14
    [↩ Visszaállítás]  [🗑️ Végleges törlés]
```

### ↩️ Visszaállítás

Egy gombnyomásra **teljesen visszakerül**:
- A listákba visszatér
- A kapcsolatai (pl. családtagok, befizetések) megmaradnak
- Pontosan ott, ahol volt

### 🔥 Végleges törlés

Ha **azonnal véglegesen** el akarsz törölni valamit (GDPR-kérés, szenzitív adat):
1. A Kukában → **„Végleges törlés"**
2. Megerősítés dialog
3. Írd be: **„I approve the deletion"** (biztonsági kód)
4. Az adat végleg törölve — **nem állítható vissza**

### ⏰ 30 napos automatikus takarítás

Automatikusan **minden vasárnap éjjel 3:00-kor** a szerver **végleg törli** a **30 napnál régebbi** soft-deleted rekordokat.

### 💡 Gyakorlati példa

**Helyzet**: Szabó János átköltözött, tévedésből „törölted" a listából.

**Megoldás**:
1. Kuka megnyitása
2. Szabó János neve mellett **„Visszaállítás"**
3. Most menj a Tagnyilvántartásban a személyhez → állapotot állítsd **„Elköltözött"**-re (ami a helyes)

---

## 8. Teljes biztonsági mentés

### 📦 Mi a teljes ZIP backup?

Egy **komplett pillanatkép** a gyülekezet teljes adatbázisáról, `.zip` formában. Akkor kell, ha:
- El akarod vinni egy USB-n a templomba (pl. katasztrófa-elszámolás)
- Archiválni akarod az **év végi állapotot**
- Külső biztonsági mentést készítesz (titkosított külső HDD)

### 🎯 Hogyan készítsd el?

1. **Profil → Offline mentés**
2. Görgess le a **„Teljes biztonsági mentés"** szekcióhoz (lila kártya)
3. **„Teljes backup letöltése (.zip)"** gomb
4. Confirm → 10-30 másodperc
5. Letöltött fájl: `KARTOTEKA-backup-<gyülekezet>-2026-04-15.zip`

### 📁 Mit tartalmaz a ZIP?

```
KARTOTEKA-backup-baratosi-2026-04-15.zip
├── 📄 README.txt         — Magyarázat + GDPR figyelmeztetés
├── 📄 META.json          — Gyülekezet info, időpont, statisztika
└── 📊 snapshot.json      — A teljes adatbázis pillanatképe
```

### ⚠️ Biztonsági figyelmeztetés

A ZIP **NINCS TITKOSÍTVA**. Tartalmaz **személyes adatokat** (nevek, CNP-k, telefonszámok, pénzügy).

> 🔐 Csak **biztonságos helyen** tárold:
> - ✅ VeraCrypt vagy hasonló titkosított kötet
> - ✅ BitLocker titkosított külső merevlemez
> - ✅ Fizikailag elzárt USB stick (zárt szekrény)
> - ❌ **NE** küldd e-mailben
> - ❌ **NE** tedd OneDrive/Dropbox/Google Drive mappába
> - ❌ **NE** hagyd a PC-n védtelen mappában

### 📅 Milyen gyakran?

- **Havonta** — rutinszerűen
- **Évvégén** — archiválás a zsinati jelentés után
- **Fontos változás előtt** — új verzió, rendszerfrissítés

---

## 9. Adatvédelem és biztonság

### 🔐 GDPR — Általános adatvédelmi szabályzat

A KARTOTEKA **GDPR-konform** módon készült:

**✅ Mit csinálunk jól**:
- Minden adat a **gyülekezet tulajdona**, nem az üzemeltetőé
- Csak a **szükséges adatokat** gyűjtjük
- A felhasználó (lelkész) **saját** adataihoz férhet hozzá
- A másik gyülekezet adataihoz **NEM** fér hozzá
- Minden változás **auditálva** van (ki, mikor, mit csinált)
- A törölt adatok **30 nap múlva véglegesen** törlődnek
- Az adatokat **Európában** tárolja a szerver (Supabase EU régió)

**🎯 Amit TE kell hogy csinálj**:

1. **Erős jelszó** — ne „123456", ne a gyerekkorodbóli iskola neve. Javasolt: 12+ karakter, szám + nagybetű + speciális jel.

2. **Ne oszd meg a jelszót** — senkivel, még a családodban sem.

3. **Kilépés** — minden munkafolyamat végén, ha nem a te gépeden vagy (vagy otthon hagyod a gépet).

4. **Excel-fájlok** — ne tedd felhő-szinkronizált mappába.

5. **Jelentsd be** az esperesi hivatalnak, ha:
   - Ellopták a gépedet/telefonodat
   - Jelszó kiszivárgott
   - Gyanús e-mailt kaptál (adathalászat)

### 🔑 A jelszavad elfelejtettem — mi történik?

1. **Bejelentkezési oldal → „Elfelejtett jelszó"**
2. Add meg az email-címed
3. Kapsz egy **reset-linket** email-ben
4. Kattints → írj be új jelszót

A jelszó **sehol nem olvasható** (sem titeked, sem az üzemeltetőnek) — csak **hash-elt** formában tároljuk.

### 👁️ Adatmegosztás — KI LÁT MIT?

| Ki | Mit lát |
|---|---|
| **Te (lelkész)** | A **saját gyülekezet** minden adatát |
| **Esperes** | Az alatta lévő gyülekezetek **összesítő adatait** |
| **Rendszergazda** (EREK központi) | **Semmit személyesen** — csak hibanaplókat |
| **Hackerek** | 🔐 Titkosítás mellett semmit |

A rendszer **Row Level Security**-t (RLS) használ — minden query-nél megvizsgálja, **jogosult vagy-e** látni az adatot.

---

## 10. GYIK

### ❓ „Elvesztek az adataim!"

**Soha** nem vesznek el végleg! Lépj végig ezeken:

1. **Frissítsd** a böngészőt (F5)
2. Ellenőrizd az **állapot-jelzőt** — esetleg csak éppen szinkronizál
3. **Profil → Offline mentés** → ellenőrizd a cache státuszát
4. Ha valami tényleg eltűnt: **Profil → Kuka** — valószínűleg ott van
5. Ha a Kukában sincs: **támogatás-hívás**, mi visszaállítjuk backup-ból

### ❓ „Miért van lassú a rendszer?"

Egy-két lehetséges ok:

- **Lassú internet** — próbáld pl. hotspottal vagy ethernettel
- **Sok nyitott böngésző-fül** — zárj be párat
- **Régi gép** — próbáld meg a tableten vagy másik gépen
- **Böngésző cache** — Ctrl+Shift+Delete → cache törlés

### ❓ „Egy családnál két azonos nevű személy van"

Ne aggódj, ez normális:
- Megkülönböztetés **CNP alapján** (minden CNP egyedi)
- A listában a **születési dátum** és **családnév** is látszik
- **Családi kapcsolat** automatikusan felállítódik

### ❓ „Hogyan küldjem el az éves jelentést?"

**Jelentés tipusa** → **Helyszín**:
- Havi jelentés → presbiteri ülés
- Éves jelentés → esperesi hivatal
- Számadás → esperesi hivatal + bankos elszámolás

**Javasolt folyamat**:
1. Munkanapló → Jelentés fül → Nyomtatási központ
2. Év / hónap választása
3. **PDF mentés**
4. Email-ben küldés az esperesi hivatalnak

### ❓ „Nem kapok email-értesítést"

Ellenőrizd:
- **Spam mappa** — gyakran ott landol
- **Email-cím** a profilban → helyes-e
- Ha nem → írj az **adminisztrációnak**, hogy újra regisztráljanak

### ❓ „A gyerekeim is lelkészek — külön fiókot kapnak?"

Igen! **Minden lelkész saját fiókot** kell hogy kapjon, a saját email-címével. A gyülekezet adatai közösek.

### ❓ „Váltani akarok gyülekezetet (új szolgálati helyre)"

1. Értesítsd az új esperesi hivatalt
2. Ott **átregisztrálják** a fiókodat az új gyülekezethez
3. A régi gyülekezet adatai **nálad maradnak** (read-only), az új már élesben
4. A régi lelkésszel átbeszélitek az adminisztrációt

### ❓ „Lekapcsolt az internet munka közben"

Nincs baj! A rendszer **offline módra** vált:
- Látod az adatokat
- Szerkesztheted, bevihetsz újat
- Az állapot-jelző **sárga/narancssárga** (⚠️)
- Amikor visszajön az internet, **magától szinkronizál**

### ❓ „Félek, hogy elfelejtek mindent"

**Ne aggódj!**
- Ez a kézikönyv mindig **újra elolvasható**
- A rendszer **barátságos**, a gombok magyarul vannak, tooltip-ek segítenek
- **Hívj minket**: email: `support@kartoteka.erek.ro`

### ❓ „Miért kell a havi internet?"

A rendszer **akkor is működik** internet nélkül, de **havonta egyszer** szüksége van az **online szinkronra**:
- Licensz megújítás (biztonsági ok)
- Adatfrissítés (pl. új törvényi rendelkezések)
- Backup a felhőbe

Ha 60 napig nem csatlakozol: olvasható marad, de szerkeszthető NEM. Csatlakozz újra, minden ok.

---

## 11. Hibaelhárítás

### 🛠️ „Nem tudok bejelentkezni"

| Ok | Megoldás |
|---|---|
| Elfelejtett jelszó | „Elfelejtett jelszó" link |
| Tévedés a jelszóban | Nézd meg a Caps Lock-ot |
| Le van tiltva a fiók | Hívj minket |
| Lejárt a jelszó | Újat kell beállítani |

### 🛠️ „Fehér oldal / nem tölt be"

1. **F5** (frissítés)
2. **Ctrl+Shift+R** (erőltetett frissítés)
3. **Próbáld másik böngészőben** (Edge, Firefox)
4. **Böngésző cache** törlése: Ctrl+Shift+Delete
5. **Próbáld inkognitó ablakban** (Ctrl+Shift+N)

### 🛠️ „A menü eltűnt"

- Mobilon: a **hamburger ikon** (≡) a bal felső sarokban
- Desktopon: **F5** (frissítés)

### 🛠️ „Az Excel export nem működik"

Ellenőrizd:
- ✅ **Chrome vagy Edge** (Firefox és Safari NEM támogatott)
- ✅ **Mappa választva** (Profil → Offline mentés)
- ✅ **Írási jog** a mappához (próbálj egy teszt-fájlt ott létrehozni)
- ❌ **NEM** OneDrive/Dropbox root mappa

### 🛠️ „A rendszer read-only módba váltott"

**Ok**: 45+ napja nem szinkronizáltál online.

**Megoldás**:
1. Csatlakozz **internethez** (akár telefonos hotspot)
2. A banner **„Szinkronizálás most"** gombra kattints
3. Várj, amíg a sync lefut
4. Normál módba visszavált

### 🛠️ „Megsérült az adatbázis"

A rendszer automatikusan **észleli** és **felajánl visszaállítást**:
- Előző napi backup
- Vagy felhőből komplett újra-letöltés

A lépések:
1. Dialog jelenik meg
2. Válaszd: **„Visszaállítás"** (ajánlott)
3. Várj 1-5 percet
4. Kész

---

## 12. Billentyűparancsok

Kényelmesítik a munkát:

| Mit csinál | Billentyű |
|---|---|
| **Keresés** a jelenlegi oldalon | `Ctrl+F` |
| **Új rekord** (modulon) | `Ctrl+N` *(egyes oldalakon)* |
| **Mentés** (dialog nyitva) | `Ctrl+Enter` |
| **Bezárás** (dialog) | `Esc` |
| **Frissítés** | `F5` |
| **Erőltetett frissítés** (cache törlés) | `Ctrl+Shift+R` |
| **DevTools** (haladó) | `F12` |
| **Nyomtatás** | `Ctrl+P` |

---

## 13. Kapcsolat és segítség

### 📧 Email

**Támogatás**: `support@kartoteka.erek.ro`
**Technikai kérdések**: `tech@kartoteka.erek.ro`
**Sürgős**: `helpdesk@kartoteka.erek.ro`

### 📞 Telefon

Munkaidőben (H-P 8:00-16:00): **+40 740 XXX XXX**

### 💬 Hibabejelentés

Ha bármi hibát találsz:

1. **Másold be** a képernyőt (Print Screen)
2. **Írd le**, mit csináltál (lépésről lépésre)
3. **Küldd el** a `support@kartoteka.erek.ro` címre
4. **Mellékletek**:
   - Screenshot (kép)
   - Böngésződ típusa és verziója (Chrome 130, Firefox stb.)
   - Operációs rendszer (Windows 11, macOS stb.)

### 🎓 Képzés, előadás

Évente **2× ingyenes** képzést tartunk minden szolgálati körzetben. A programot az esperesi hivatal közli.

### 📺 Videó-oktatóanyagok

YouTube: **@KARTOTEKA-Oktatás** — minden modulhoz 5-10 perces **oktató videó**, lépésről lépésre.

### 🙏 Közösség

Facebook csoport: **KARTOTEKA Lelkészi Közösség** — ismerd meg a kollégákat, oszd meg a tippjeidet, tanulj másokból.

---

## 🙏 Záró gondolatok

> *„Mert minden, a mi születik az Istentől, legyőzi a világot; és az a győzedelem, a mely legyőzte a világot, a mi hitünk."* (1 Jn 5,4)

A KARTOTEKA eszköz — segítség, hogy a **szolgálatot** jobban, szervezettebben, **Isten előtt felelősen** tudjuk végezni. Ne engedd, hogy az adminisztráció **eluralkodjon** rajtad. A rendszer a **te szolgád**, nem fordítva.

Ha valami nem megy, **ne aggódj**. Hívj minket. Mi is emberek vagyunk, segítünk.

**Áldás kísérje szolgálatodat!** ⛪

---

**KARTOTEKA Team**
*Erdélyi Református Egyházkerület*
*2026*

---

### 📝 Dokumentum verzió

| Verzió | Dátum | Változás |
|---|---|---|
| 1.0 | 2026-04-15 | Első kiadás — teljes 8 modul + offline + kuka + backup |

---

*Ez a dokumentum magyar nyelven készült. Minden fordítás a fenti email-címen kérhető.*
