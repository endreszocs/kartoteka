# 🌟 KARTOTEKA — Első indulás

> **Olvasd el ezt ELŐSZÖR!** 📖
>
> Ebben a dokumentumban elmondom, mit kell tenned, hogy használni tudd a rendszert.

---

## 👋 Üdvözöllek, Lelkésztestvérem!

Tisztelettel köszöntelek! A KARTOTEKA — a gyülekezeti nyilvántartó rendszer — most a tied. Ebben az útmutatóban **lépésről lépésre** elmondom, mit csinálj.

**Ne aggódj** — pár perc alatt készen is vagy. Ha bármi nem megy, a végén találod a **segítség** részt.

---

## 📦 Mit tartalmaz a csomag?

Amikor kicsomagoltad a ZIP-et, ilyen mappát kaptál:

```
📁 KARTOTEKA-<gyülekezeted>/
├── 🟢 KARTOTEKA.bat                ← ERRE DUPLA-KLIKKELSZ
├── 📘 Első-indulás.md              ← Amit most olvasol
├── 📘 Felhasználói-kézikönyv.md    ← Részletes útmutató
├── 📘 Gyorsreferencia-kártya.md    ← Egylapos összefoglaló
├── 📘 Fogalomtár.md                ← Szótár
├── 📁 runtime/                      ← A rendszer részei (ne nyúlj hozzájuk)
├── 📁 app/                          ← A program (ne nyúlj hozzájuk)
├── 📁 data/                         ← Itt lesznek a gyülekezeti adataid
└── 📁 docs/                         ← További dokumentumok
```

**NAGYON FONTOS**:
- ❌ **NE töröld** a `runtime`, `app` mappákat
- ❌ **NE módosítsd** a fájlokat a `runtime`, `app` mappákban
- ✅ **NEM BAJ**, ha a `data/` mappát látod növekedni — ott tárolódnak az adataid!

---

## ⚠️ NAGYON FONTOS TUDNIVALÓ!

### 1 csomag = 1 gép = 1 lelkész

- ❌ **NE másold** ezt a mappát USB-re és tedd másik gépre — **NEM fog működni** (licensz-védelem)
- ❌ **NE oszd meg** másokkal
- ✅ **Ha új gépre telepítesz**: új csomagot kell kérned az esperesi hivatalból

**Miért?**
A rendszer a te **gépedhez van kötve**, biztonsági okokból. Ez azért van így, hogy a gyülekezet **személyes adatai** ne keveredjenek, és ne lehessen illetéktelenek kezébe jutni.

### Az első indítás — interneted KELL!

Az **első belépéshez** egyszer szükség van **internetkapcsolatra**, hogy a rendszer ellenőrizze a licenszedet és letöltse a gyülekezet adatait.

**Mennyi idő?** Körülbelül **5 perc**.

**Nincs internetem otthon?** Használd:
- 📱 **Mobil-hotspot** (telefonod Wi-Fi megosztása)
- 🏪 **Kávézó, könyvtár** Wi-Fi
- 🏛️ **Egyházközségi hivatal**
- 👥 **Szomszéd** kérésére

Az első 5 perc után **bármeddig dolgozhatsz internet nélkül**.

### Havi szinkron

Miután beállítottad, **havonta egyszer** csatlakoznod kell az internethez (5-10 percre), hogy:
- ⬆️ **Feltöltsd** a változtatásaidat a felhőbe
- ⬇️ **Letöltsd** az esetleges új törvényi rendelkezéseket, frissítéseket
- 🔄 **Megújítsd** a licenszedet

Ha elfelejted a havi szinkront:
- **30 nap** — minden ok
- **30-35 nap** — sárga figyelmeztetés megjelenik
- **35-45 nap** — Excel export átmenetileg letiltva
- **45-60 nap** — **csak olvasható** mód (ne tudsz új bejegyzést rögzíteni)
- **60+ nap** — teljes blokk, csatlakozás kötelező

---

## 🚀 Első indítás — 6 lépés

### 1️⃣ Lépés: Csatlakozz internethez

Győződj meg róla, hogy a gépednek van **internetkapcsolata**. 
- Wi-Fi ikon a jobb alsó sarokban (Windows tálca) ➜ zöld vagy fehér
- VAGY vezetékes (ethernet) kapcsolat

### 2️⃣ Lépés: Dupla-klikk a `KARTOTEKA.bat` fájlra

A mappában keresd meg a **zöld ikont**:
```
🟢  KARTOTEKA.bat
```

**Dupla-klikk**.

Egy **fekete parancsablak** jelenik meg — ez NEM hiba, ez a rendszer háttér-motorja. Ne zárd be!

```
╔══════════════════════════════════════════════════╗
║  KARTOTEKA - baratosi                            ║
║                                                    ║
║  Kérlek, várj... a rendszer indul...              ║
║                                                    ║
║  Fontos: Ez az ablak akkor is NYITVA MARAD,       ║
║  amíg a KARTOTEKÁT használod.                     ║
╚══════════════════════════════════════════════════╝
```

### 3️⃣ Lépés: Böngésző automatikusan megnyílik

10-20 másodperc után a **Chrome vagy Edge** böngésződ megnyílik, és megjelenik a KARTOTEKA bejelentkezési oldala.

> 🌐 Ha nem nyílik meg magától: írd be a böngésződbe: `http://localhost:3000`

### 4️⃣ Lépés: Első indítási varázsló

4 lépéses varázsló vezet végig:

#### 🔑 4.1 — Licensz aktiválás

- **Email**: az esperesi hivataltól kapott email-cím
- **Jelszó**: amit megkaptál

> 💡 Elfelejtetted? → `support@kartoteka.erek.ro`

**Figyelmeztetés jelenik meg**:
> ⚠️ **Ez a telepítés CSAK ezen a gépen fog működni.**
>
> A rendszer a gép **hardveres ujjlenyomatát** rögzíti. Ha másik gépen szeretnéd használni, új telepítést kell kérned. Ez biztonsági okból van így, hogy a gyülekezet adatai NE kerüljenek illetéktelenek kezébe.
>
> **Megerősítem, értettem** ☑️
>
> [Tovább]

#### ⛪ 4.2 — Gyülekezet adatok

Töltsd ki:
- **Gyülekezet neve** (ahogy hivatalosan neveztétek)
- **Magyar, román, angol név**
- **Adószám**
- **Bejegyzési szám**
- **Cím** (utca, szám, helység, megye, irányítószám)
- **Email, telefon, weboldal**
- **IBAN** (a gyülekezet bankszámlaszáma)
- **Bank neve**

#### 👤 4.3 — Személyes adatok

- **Teljes neved**
- **Születési dátum**
- **Telefon**
- **Email** (munka)
- **Szolgálati kezdés ideje** ebben a gyülekezetben
- **Előző szolgálati helyek** (opcionális)

#### 💰 4.4 — Pénzügyi alapbeállítások

- **Éves járulék** (alap összeg, RON)
- **Kedvezményes járulék** (pl. nyugdíjasoknak, RON)
- **Járulék határideje** (formátum: `07-01`, azaz július 1.)
- **Egyházmegyei besorolás**
- **Nyitó kassza** (mennyi van a pénztárban most) — opcionális
- **Nyitó bank** (bankszámla egyenlege) — opcionális

### 5️⃣ Lépés: Adatok letöltése

A rendszer most letölti a gyülekezeted aktuális adatait a felhőből. Ez **1-3 perc**.

Ha a gyülekezet már szerepelt korábban a KARTOTEKÁ-ban, minden:
- ✅ Személyek
- ✅ Pénzügy
- ✅ Anyakönyv
- ✅ Minden modul

most ide-töltődik.

### 6️⃣ Lépés: Kész!

A rendszer a **Főoldalra** visz. **Most már dolgozhatsz offline is**!

---

## 📋 Első 1 hét — ajánlott tennivalók

### 🔸 Nap 1: Ismerd meg
- Nyisd meg **minden modult**, nézd meg mi van benne
- Kattints egy-egy sorra, nézd meg a részleteket
- Olvass bele a **Felhasználói kézikönyvbe** (📘 `Felhasználói-kézikönyv.md`)

### 🔸 Nap 2-3: Excel export
- **Profil → Offline mentés → Mappa kiválasztása**
- Javasolt mappa: `C:\Users\<név>\Documents\KARTOTEKA-export`
- **Excel export most**
- Nyisd meg a fájlokat — lásd hogy minden ott van!

### 🔸 Nap 4-5: Próbálj ki egy új bejegyzést
- **Tagnyilvántartás → + Új személy** (kitalálj egy példát, utána töröld)
- **Pénzügy → + Új befizetés** (például kis perselypénz)
- **Munkanapló → + Új bejegyzés** (tegnapi istentisztelet)

### 🔸 Nap 6-7: Ellenőrizd a Kukát
- Ha véletlenül törölted a példa-adatokat, **Profil → Kuka**
- Próbáld ki a **Visszaállítás** gombot

### 🔸 Hét vége: Teljes biztonsági mentés
- **Profil → Offline mentés → Teljes biztonsági mentés → Letöltés (.zip)**
- Mentsd el egy **USB stick**-re (titkosított vagy zárt helyen)

---

## 🎯 A 10 legfontosabb dolog, amit **tudnod kell**

1. 🟢 **Az állapot-jelző** a fejlécben mutatja, szinkron vagy-e
2. 💾 **Havonta 1x** csatlakozz az internethez (szinkron)
3. 📊 **Havonta 1x** csinálj Excel exportot (biztonsági másolat)
4. 🗑️ **Véletlen törlés?** A Kuka **30 napig** megőriz mindent
5. 🔐 **A jelszavadat ne oszd meg** senkivel
6. 📄 **Nyomtatni** a nyomtatási központból tudsz (minden modulban)
7. 🚪 **Kilépés** a végén (biztonsági ok)
8. ❌ **NE másold** a programot más gépre (nem fog működni)
9. 📧 **Support**: `support@kartoteka.erek.ro`
10. 📖 **A kézikönyv mindig kéznél** legyen (`Felhasználói-kézikönyv.md`)

---

## 🆘 Ha elakadsz

### Gyakori problémák

#### „Nem indul el a KARTOTEKA.bat"
- ✅ Nyugodtan zárd be a parancsablakot
- ✅ Indítsd újra a gépet
- ✅ Próbáld újra

#### „Nem látok semmit a böngészőben"
- ✅ Írd be: `http://localhost:3000`
- ✅ F5 (frissítés)
- ✅ Próbáld másik böngészőben (Chrome, Edge)

#### „Nem tudok bejelentkezni"
- ✅ Ellenőrizd az email+jelszót
- ✅ „Elfelejtett jelszó" link a bejelentkezési oldalon
- ✅ Ha nem megy: `support@kartoteka.erek.ro`

### Kapcsolat

| Probléma típusa | Email |
|---|---|
| 🔧 Általános | `support@kartoteka.erek.ro` |
| 💻 Technikai | `tech@kartoteka.erek.ro` |
| 🚨 Sürgős | `helpdesk@kartoteka.erek.ro` |
| 📞 Telefon | `+40 740 XXX XXX` (H-P 8:00-16:00) |

---

## 🙏 Zárszó

A KARTOTEKA **szolgálati eszköz** — nem cél, hanem **segítség**. Ne hagyd, hogy az adminisztráció elvegye az időt a lényegi szolgálattól.

Ha jól beállítod az első napon, a későbbiek **magától** mennek:
- 📝 Napi néhány perc munkanaplót rögzíteni
- 💰 Heti 10 perc pénzügyet vezetni
- 📋 Havi 1× sync + Excel export
- 🎉 Évente 1× nagy jelentést generálni

**Áldás kísérje szolgálatodat!** ⛪

---

**KARTOTEKA Team**
*Erdélyi Református Egyházkerület · 2026*

---

*Ha ezt elolvastad, a rendszer és Te készen álltok. Indítsd el a `KARTOTEKA.bat`-ot!* 🚀
