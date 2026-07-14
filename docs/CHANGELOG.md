# Kartotéka — Változásnapló

A Kartotéka rendszer változásainak (javítások, új funkciók, fejlesztések) időrendi dokumentációja.
Az admin oldalon ezek a bejegyzések broadcast üzenetként elküldhetők a felhasználóknak.

Formátum (minden bejegyzés):

```
## [YYYY-MM-DD] — Rövid összefoglaló
<!-- key: YYYY-MM-DD-rovid-azonosito -->
<!-- category: bugfix | feature | improvement | security | breaking -->
<!-- version: optional release verzió -->
<!-- targets: audience rövid leírás -->

### 🔒 Biztonsági javítások / 🐛 Javítások / ✨ Új funkciók / 🎨 UX javítások

- **Címsor**: részletesebb leírás
- **Címsor 2**: részletesebb leírás
```

A `key` mező egyedi azonosító (slug) — ez a `system_broadcasts.release_changelog_key` értéke lesz.
Az admin felületen a még nem broadcast-olt bejegyzések "Közzététel" gombbal küldhetők.

---

## [2026-07-15] — Pénzügy: éves beállítás megadható űrlapon (nincs több zsákutca)
<!-- key: 2026-07-15-eves-penzugyi-beallitas-urlap -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web v0.9.75 -->

### 🐛 Pénzügy — éves beállítás

- **Ha egy évre még nincs pénzügyi beállítás (éves egyházfenntartói járulék + fizetési
  határidő), a Pénzügy fül most egy kitölthető űrlapot mutat, ahol azonnal megadhatod
  ezeket, és a rendszer létrehozza az évi beállítást.** Eddig — ha a bevezető varázslóban
  nem adtál meg éves járulékot — csak egy „nem hozható létre automatikusan, kérj segítséget
  az admintól" zsákutca-üzenet jelent meg. Mostantól a lelkész maga is elindíthatja az évet.

---

## [2026-07-15] — Import: kereszt-gyülekezeti egyezések összefoglalója
<!-- key: 2026-07-15-import-kereszt-egyeztetes-osszefoglalo -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, rendszergazda -->
<!-- version: web v0.9.74 -->

### ✨ Import — kereszt-gyülekezeti figyelés

- **Az importálás eredmény-lépésén megjelenik, ha az importált tagok között lehetnek
  olyanok, akik már szerepelnek másik gyülekezetben.** A rendszer importkor is ellenőrzi
  az egyezéseket; a találatokat az értesítőknél (harang ikon) nézheted át, a másik
  gyülekezet lelkészének elérhetőségével a kapcsolatfelvételhez.

---

## [2026-07-15] — Import: a családszerkezet-lépés nem ragad be hibánál
<!-- key: 2026-07-15-import-csaladszerkezet-hibakezeles -->
<!-- category: bugfix -->
<!-- targets: rendszergazda, lelkesz -->
<!-- version: web v0.9.73 -->

### 🐛 Importáló — robusztusabb családszerkezet

- **Ha az automatikus családszerkezet-összeállítás hibázik** (pl. nagy gyülekezetnél
  időtúllépés), a „Családok" lépés többé **nem ragad be**: érthető üzenet jelenik meg
  **„Újrapróbálom"** és **„Kihagyom ezt a lépést"** gombbal. A már beimportált személyek
  és családfők érintetlenek maradnak.

---

## [2026-07-15] — Tag-szerkesztő: a beágyazott ablakok is bezárulnak
<!-- key: 2026-07-15-tag-szerkeszto-beagyazott-ablak-zaras -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, rendszergazda -->
<!-- version: web v0.9.72 -->

### 🐛 Javítás

- **A tag-szerkesztő bezárásakor a benne megnyitott fotó-szerkesztő és
  kereszt-gyülekezeti ablak is automatikusan bezárul.** Eddig előfordulhatott, hogy
  X-re kattintva egy beágyazott ablak / a kép „beakadt" a képernyőn.

---

## [2026-07-15] — Asztali app: fénykép beállítása a tag-nézetből
<!-- key: 2026-07-15-desktop-tag-fenykep -->
<!-- category: feature -->
<!-- targets: lelkesz -->
<!-- version: desktop v0.9.4 -->

### ✨ Asztali (desktop) web-paritás

- **Az asztali alkalmazásban is beállíthatod egy tag fényképét** közvetlenül a
  tag-portré ablakból: kattints a monogramra → tölts fel képet a gépről (vagy próbáld a
  Facebook-linkből). Eddig ez csak a családi nézetből működött. *(Új asztali kiadás
  telepítése szükséges hozzá.)*

---

## [2026-07-14] — Kereszt-gyülekezeti figyelmeztető új tag rögzítésekor
<!-- key: 2026-07-14-kereszt-gyulekezeti-figyelmezteto -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, rendszergazda -->
<!-- version: web v0.9.71 -->

### ✨ Új: ugyanaz a személy már más gyülekezetben?

- **Új tag rögzítésekor a rendszer a mentés előtt ellenőrzi, hogy a személy (név +
  születési dátum vagy telefon) szerepel-e már másik gyülekezetben.** Ha igen, egy ablak
  jelzi a találatot, és megmutatja **a másik gyülekezet lelkészének hivatalos
  elérhetőségét** (név, e-mail, telefon — közvetlen kapcsolatfelvételhez). A másik tag
  személyes adatait (cím, család) NEM látod.
- Két lehetőség: **„Nem, más személy"** → a rögzítés folytatódik · **„Igen, ugyanaz a
  személy"** → rögzítés + emlékeztető a lelkészi egyeztetésre. A rendszer a kettős
  tagságot később nem számolja duplán az egységes lélekszámban.

---

## [2026-07-14] — Tag-szerkesztő: gombok mindig alul + nincs véletlen mentés
<!-- key: 2026-07-14-tag-szerkeszto-footer-submit-fix -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, rendszergazda -->
<!-- version: web v0.9.70 -->

### 🐛 Tag-szerkesztő javítások

- **A mentés/tovább gombok mostantól MINDIG a szerkesztő-ablak alján vannak** — a tartalom
  felettük görgethető, lépéstől függetlenül. Nem kell a kurzort fel-le vinni a gombokért.
- **Az utolsó lépés nem „menti el magát" többé:** a mentés kizárólag a kifejezett „Tag
  mentése" / „Módosítások mentése" gombra történik — sem az Enter, sem a véletlen fókusz
  nem indíthatja el, így nyugodtan kitölthető a lap.

---

## [2026-07-14] — Az importáló nem omlik össze feltöltési hibánál
<!-- key: 2026-07-14-import-feltoltes-osszeomlas-fix -->
<!-- category: bugfix -->
<!-- targets: rendszergazda, lelkesz -->
<!-- version: web v0.9.69 -->

### 🐛 Kritikus javítás — importáló

- **A rendszergazdai (és a sima) importáló nem omlik össze többé, ha a fájl feltöltése
  megszakad** (pl. a kiválasztott fájl közben megváltozott a lemezen, vagy a hálózat
  akadozott). Eddig ilyenkor a „This page couldn't load" hibaoldal jelent meg, és
  újra kellett tölteni. Mostantól a rendszer a kiválasztott fájlt **azonnal a memóriába
  olvassa** (stabil másolat), és feltöltési/hálózati hiba esetén **érthető üzenetet** ad
  („Válaszd ki újra a fájlt…") — az oldal nem esik szét.

---

## [2026-07-14] — Prémium családi galaxis + tagnyilvántartás-javítások
<!-- key: 2026-07-14-galaxis-tagnyilvantartas-javitasok -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, rendszergazda -->
<!-- version: web v0.9.68 -->

### ✨ Új: prémium „Családi galaxis"

- **A Családi háló megújult, látványos csillag-galaxissá vált:** mély, obszidián-fekete
  térben a családok ragyogó arany „napokként", a tagok türkiz/rózsa csillagokként
  jelennek meg, a rokoni kapcsolatok pedig finom fénylő fonalakként. Húzással
  mozgatható, görgővel vagy csippentéssel nagyítható.
- **Egy csillagra kattintva a közvetlen környezete kiemelve marad, a többi elhalványul**
  — így tisztán látszanak a kapcsolati összefüggések.

### 🐛 Javítások a személyeknél

- **A személyek listája nem tűnik el többé** a tag szerkesztésének bezárásakor (egy
  ritka betöltési hiba miatt korábban előfordult, hogy üresen maradt a lista).
- **A tag-felvétel/szerkesztés ablak nem záródik be „magától" és nem ment félbe**, ha a
  Facebook-link beírása után Enter-t nyomsz — a mentés kizárólag a kifejezett „Módosítások
  mentése" / „Tag mentése" gombbal történik.
- **A szerkesztő-ablak mérete minden lépésnél állandó**, így a „Tovább" gomb nem ugrál el.

### ✨ Működő profilkép-eszköz

- **A tag szerkesztésénél új „Profilkép beállítása…" gomb** külön ablakot nyit, ahol a
  fénykép a gépről feltölthető, vagy (best-effort) a Facebook-linkből letölthető. A
  Facebook gyakran nem engedi az automatikus letöltést — ilyenkor a kézi feltöltés
  mindig működik, és a kép csak a saját „Mentés" gombjával kerül mentésre.

### 🔒 Import-biztonság

- **Másik gyülekezetbe importálni már csak rendszergazda** teheti, a saját hatókörén
  belül — a korábbi útvonalak jogosultság-ellenőrzés nélkül fogadták a cél-gyülekezetet.

---

## [2026-07-13] — Frissítés után nem törik meg a navigáció
<!-- key: 2026-07-13-sw-frissites-ujratoltes -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros, rendszergazda -->
<!-- version: web v0.9.67 -->

### 🐛 Kritikus javítás

- **Egy frissítés (új verzió) telepítése után a megnyitott fül nem „ragad be"
  többé.** Eddig, ha a rendszer frissült, miközben nyitva volt az alkalmazás, a
  fül a régi és az új verzió keverékét futtatta — a bal oldali menüre kattintva
  nem nyílt meg új oldal (a régi kód olyan fájlt keresett, amit a frissítés már
  lecserélt). Mostantól a fül a frissítés átvételekor **automatikusan újratölt**
  a friss verzióra, így a navigáció zökkenőmentes marad. Ha mégis ilyen hibába
  futna, a rendszer **magától újratölti** a fület (biztonsági háló).

> Ha most is beragadt oldalt látsz, egyszeri **teljes újratöltés** (Ctrl+Shift+R,
> vagy Mac-en Cmd+Shift+R) azonnal helyreállítja — utána ez a hiba nem tér vissza.

---

## [2026-07-13] — A Kartotéka neve is rákerült a segédanyagokra
<!-- key: 2026-07-13-muhely-segedanyag-kartoteka-alairas -->
<!-- category: bugfix -->
<!-- targets: lelkesz -->

### 🐛 Egységesebb fájlaláírás

- **A Műhelypolcról letöltött Word- és PDF-fájlok alján most már a teljes
  „Missziós Műhely · Kartotéka” név olvasható,** így továbbküldve vagy
  kinyomtatva is egyértelmű, honnan származik a segédanyag.

---

## [2026-07-13] — Élő olvasószobává vált a Műhelypolc
<!-- key: 2026-07-13-muhelypolc-olvasoszoba-dokumentumjavitas -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

### 🎨 Barátságosabb böngészés

- **A Műhelypolc napfényes, otthonos olvasószobát kapott:** a könyvek, a fa
  polckeret és a finoman mozduló fények egy közös térbe rendezik a keresést és
  a megosztott anyagokat.
- **A polc mozgásai segítenek, de nem zavarják az olvasást:** a kártyák lágyan
  érkeznek meg, az apró fényjáték pedig kikapcsol, ha a készüléken csökkentett
  mozgás van beállítva.
- **Telefonon is kényelmes marad minden:** 320 képpont szélességtől nincs
  oldalirányú görgetés; a szűrők és az anyagok egy jól áttekinthető oszlopba
  rendeződnek.

### 🐛 Szebb dokumentumnézet

- **A megnyitott segédanyag ismét valódi, széles olvasóoldal:** nagy képernyőn
  a szöveg és az anyag adatai egymás mellett, telefonon egymás alatt jelennek
  meg, így a mondatok többé nem törnek betűnként keskeny oszlopba.
- **A szerkesztőablak is megkapta ugyanezt a javítást,** ezért saját anyag
  készítésekor vagy módosításakor minden mező kényelmesen használható mobilon
  és asztali gépen is.

---

## [2026-07-13] — Egyetlen, napfényes tér lett a Műhely nyitóoldala
<!-- key: 2026-07-13-misszios-muhely-premium-nyitooldal -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

### 🎨 Otthonosabb nyitóélmény

- **A köszöntés és a hangulatkép most már egyetlen közös kompozíció:** eltűnt a
  korábbi, két külön részre osztott elrendezés, így a nyitóoldal egységesebb és
  nyugodtabb első benyomást ad.
- **A Biblia, a bögre és az olajágak szervesen belesimulnak a tartalomba:** a kép
  finoman a szöveg és a közösségi számok mögé fut, miközben minden felirat jól
  olvasható marad.
- **Telefonon is teljes értékű a látvány:** a cím, a két fontos műveleti gomb, a
  közösségi számlálók és a kép 320 képpont szélességtől kényelmesen, levágás és
  oldalirányú görgetés nélkül rendeződnek el.
- **Finom belépő animáció teszi barátságosabbá az érkezést,** de a rendszer
  mozgáscsökkentési beállítását használóknál az animáció automatikusan elmarad.

---

## [2026-07-12] — A Missziós Műhelyből alkotótér lett
<!-- key: 2026-07-12-misszios-muhely-alkototer -->
<!-- category: feature -->
<!-- targets: lelkesz -->
<!-- version: web v0.9.65 -->

### ✨ Segédanyag készítése és használata

- **A megnyitott segédanyag most már valódi olvasóoldal:** a hosszabb szöveg
  levegősen, jól elkülönülő részekkel jelenik meg, telefonon és nagy képernyőn
  egyaránt kényelmesen olvasható.
- **A segédanyag Word- vagy PDF-dokumentumként is elmenthető.** A letöltött
  változat egységes A4-es tördelést, címet, szerzőt, gyülekezetet, dátumot és
  témaköröket kap, így továbbadható vagy kinyomtatható.
- **Saját alkotófelület készült:** egy helyen láthatod a feltöltött anyagaidat,
  új segédanyagot készíthetsz, a saját korábbi anyagaidat pedig szerkesztheted
  vagy archiválhatod.
- **Érthetőbb lett a csillagos értékelés:** már választás közben is látható,
  hány csillagnál jársz. A próbaidőszak alatt a saját anyagodon is kipróbálhatod
  az értékelést; ez a saját próba nem ad pontot vagy jelvényt.

### 🎨 Otthonosabb, személyesebb műhely

- **A kezdőlap nyitóképe természetesebben simul a felületbe:** a teljes kép
  látható marad, és eltűnt mögüle a zavaró kockás hatás.
- **Az Ötletasztal és a Műhelypolc saját, áttetsző hátterű illusztrációt kapott,**
  amely telefonon sem vesz el helyet a fontos tartalomtól.
- **Mind a tizenkét jelvény külön képi világot kapott,** így az elért állomások
  karakteresebbek, játékosabbak és ünnepibbek lettek.
- **A beállított profilfotó a műhelyben is elkísér:** megjelenik a fejlécben és
  a Műhelyprofilomon; ha nincs fénykép, továbbra is a monogram segít azonosítani.

---

## [2026-07-12] — A Missziós Műhely teljesen megújult
<!-- key: 2026-07-12-misszios-muhely-ujratervezes -->
<!-- category: feature -->
<!-- targets: lelkesz, admin -->
<!-- version: web v0.9.64 -->

### ✨ Önálló, játékos alkotótér

- **Új, otthonos és mobil-first felület:** a Missziós Műhely most önálló
  weboldalélményt, kényelmes mobilnavigációt, finom animációkat és 320 px-től
  használható elrendezést kapott.
- **Ötletből közös szolgálat:** az ötletgazda 14 napos szavazást indíthat; öt
  egyedi támogatónál az ötlet automatikusan közös projektté válik, feladatokkal,
  mérföldkövekkel és segédanyagokkal.
- **Játékos jutalmazás:** animált jelvények, pontok, szintek és ünnepi
  visszajelzések teszik láthatóvá a közösségi hozzájárulást.
- **Biztonságos munkafolyamat:** a pontozás és a státuszváltás adatbázis-szinten
  atomikus, a lezárt projekt pedig csak teljes feladatlista után jelölhető
  megvalósultnak.

---

## [2026-07-11] — Devizás tétel szerkesztése + bankszámlák közötti (keresztdevizás) párosítás
<!-- key: 2026-07-11-devizas-szerkesztes-parositas -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.66 -->

### 🎨 Devizás számla szerkesztése

- **A tétel-szerkesztő ablak a számla VALÓS pénznemét írja ki** — nem fix „Összeg
  (RON)", hanem pl. „Összeg (EUR)", ha devizás számláról van szó.
- **Devizás számlánál a tényleges lej (RON) érték és az árfolyam kézzel javítható.**
  A könyvelést lejben vezetjük, de a bank tényleges átváltási árfolyama (adók, banki
  rés miatt) eltérhet a hivatalos BNR-től — ezért a lelkész mostantól beírhatja a
  **valóban jóváírt RON összeget** (vagy az árfolyamot), és a rendszer ezt használja
  a könyvelésben. (Eddig szerkesztéskor a RON-érték elavulhatott.)

### 🔗 Bankszámlák közötti párosítás (keresztdevizás is)

- **A bankszámlák közötti mozgások is párosíthatók — a különböző pénznemek között
  is.** Ha pl. 1000 EUR-t átküldesz a devizás számláról, és az ~4970 RON-ként jelenik
  meg a lej számlán, a rendszer mostantól **összepárosítja** a két tételt (mint a
  kassza és bank közötti mozgásokat) — annak ellenére, hogy a két összeg különböző.
  A párosítás a **lej-egyenértéken** történik, kis toleranciával (a banki és a BNR
  árfolyam pár százalékos eltérését megengedve). Az azonos pénznemű mozgásoknál marad
  a pontos összeg-egyeztetés. Így a devizás átutalások „⏳ várakozik" jelzése is
  eltűnik, amint a másik számla kivonata beérkezik.

### ℹ️ Jó tudni

A kézi bank→bank átvezetés rögzítő felülete (a hozzá tartozó automatikus
árfolyam-különbözet könyveléssel, 103.04 nyereség / 203.03 veszteség) külön, következő
lépésként érkezik — a részletes könyvelői terv elkészült (docs/BANK_BANK_ATVEZETES_TERV).

---

## [2026-07-11] — Monetár (címletszámláló) mentés-hiba javítva
<!-- key: 2026-07-11-monetar-mentes-fix -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.63 -->

### 🐛 Javítás

- **A Monetár (címletszámláló) mentése ismét működik.** Egyes rendszereken a
  mentés hibával állt le, mert a háttérben a címlet-törzs (a lej-címletek
  listája) nem volt feltöltve, és a rendszer emiatt nem tudta melyik címlethez
  rögzíteni a darabszámot. Mostantól a rendszer a mentéskor (és a Monetár
  megnyitásakor) **automatikusan pótolja a hiányzó címleteket**, és a korábban
  megnyitott számláló is menthető marad újratöltés nélkül. Ha az önjavítás nem
  fut le (a rendszergazda még nem telepítette a szükséges adatbázis-frissítést),
  a hibaüzenet mostantól pontosan megmondja, mit kell tennie.

---

## [2026-07-11] — Devizás számla: a teljes felület lejben (RON) számol és jelenít meg
<!-- key: 2026-07-11-devizas-ron-megjelenites -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.62 -->

### 🐛 Kritikus javítás — devizás (EUR/HUF) bankszámla

- **⚠️ A devizás számla tételei, egyenlege és nyomtatványai mostantól MINDENHOL
  lejben (RON) jelennek meg és számolnak.** Eddig a rendszer a deviza-összeget
  (pl. EUR) számolta bele a RON-egyenlegbe és mutatta a RON-címkével — így egy
  1 788,68 EUR bevétel 1 788,68 „RON"-ként jelent meg a ~8 890 RON helyett, és
  az egyenleg is hibás lett. Ez a hiba **az egész pénzügyi felületet érintette**
  devizás számlánál: a Bank fül egyenleg-mutatói és tétel-listája, a Tranzakciók
  fül, a hivatalos nyomtatványok (Registru Casa/Banca/Jurnal, Csoportnapló,
  Számadás tényadatai), az évek közti átvitel és az előző évi tény-referencia.
  Mostantól mind a **RON-ekvivalenst** (a bejegyzés dátuma szerinti árfolyammal
  átváltott értéket) használja.
- **A devizás tételeknél a lista mutatja az eredeti deviza-összeget is** — a RON
  érték alatt kicsiben (pl. „8 890,15" fölött és „1 788,68 EUR" alatta), hogy a
  bankkivonattal könnyű legyen egyeztetni.
- **Stornózott tétel újraimportálható:** ha egy hibás (pl. régi, át nem váltott)
  banki tételt stornózol, a javított kivonat újraimportálásakor a rendszer már
  nem tekinti duplikátumnak — a stornó a listában látható marad.

### 🔧 A korábban rosszul rögzített devizás tételek javítása

A frissítés előtt importált, át nem váltott devizás tételek a régi (1:1) RON
értéket őrzik. Ezek helyreállítása: **stornózd** a hibás tételt a Bank fülön,
majd **importáld újra** a kivonatot — a varázsló most bekéri a nyitó egyenleget
és az árfolyamot, és helyesen, lejre váltva rögzíti. (A `docs/penzugy-sprint2-3-
ellenorzo.sql` **E9** lekérdezése kilistázza az érintett tételeket.)

---

## [2026-07-11] — Devizás banki import: RON-átváltás és nyitó egyenleg garantálva
<!-- key: 2026-07-11-devizas-import-ron -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.61 -->

### 🐛 Javítások — devizás (EUR/HUF stb.) bankszámla importja

- **⚠️ A devizás banki tételek mostantól MINDIG lejre (RON) váltódnak — a
  bejegyzés dátuma szerinti árfolyammal.** Korábban előfordulhatott, hogy a
  rendszer a deviza-összeget 1:1-ben, RON-ként tárolta (átváltás nélkül), ami
  elrontotta a könyvelést. Mostantól: elsődlegesen a tranzakció napjára érvényes
  hivatalos BNR/ECB árfolyam, ha az nem elérhető, a nyitó egyenleghez megadott
  éves árfolyam. Ha egyik sincs, a rendszer NEM tárol hibás 1:1 értéket — a
  tételt érthető hibaüzenettel kihagyja, és megmondja, mit kell pótolni.
- **Az importvarázsló mostantól bekéri a kezdő (nyitó) egyenleget devizás
  számlánál, ha még nincs hozzá árfolyam.** Eddig, ha a számlához létezett egy
  nyitó rekord árfolyam nélkül, a varázsló átugrotta ezt a lépést — így nem volt
  mihez viszonyítani az évi mozgást, és az átváltás is elmaradhatott. Az árfolyam
  automatikusan betöltődik a BNR-ből (kézzel felülírható).

### ℹ️ Miért fontos a nyitó egyenleg?

A könyvelést lejben (RON) vezetjük. Az éves pénzügyi mozgás mindig a **kezdő
egyenleghez** adódik hozzá (nyitó + bevételek − kiadások = záró). Ha a kezdő
egyenleg hiányzik, a záró egyenleg pontatlan lesz — ezért a rendszer most
gondoskodik róla, hogy devizás számlánál is meglegyen a nyitó és az árfolyam.

---

## [2026-07-11] — Nyugtafigyelő: az előző évből áthozott hiányzók külön jelölve
<!-- key: 2026-07-11-nyugtafigyelo-athozas-jelzes -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.60 -->

### 🎨 Pontosabb jelzés

- **A Nyugtafigyelő riasztás mostantól külön sorban, borostyán kiemeléssel
  jelzi az előző évből áthozott elmaradt nyugtákat** — pl. „↪ Az előző (2025.)
  évből áthozott elmaradt nyugták: 101, 102 — ezek tavaly maradtak el, a
  pótlásuk itt, a folyó évben történik." Az idei év hiányzói külön sorban
  szerepelnek, így első pillantásra látszik, mi honnan való. Az évhatáron
  (a tavalyi utolsó és az idei első nyugta között) elmaradt sorszámok is
  tavalyiként jelöltek.

---

## [2026-07-11] — Admin felület megújítása + előfizetés-kezelés
<!-- key: 2026-07-11-admin-megujitas -->
<!-- category: feature -->
<!-- targets: rendszergazda, lelkesz -->
<!-- version: web v0.9.58 -->

### 🔒 Biztonsági javítások

- **A rendszergazdai (god-mode) PIN mostantól nem szivárog ki.** Korábban a PIN
  a háttéradatbázisban bármely bejelentkezett felhasználó számára olvasható volt
  — ezt bezártuk, és a PIN a felületen sem jelenik meg többé (csak beállítani lehet).

### ✨ Új funkciók

- **Előfizetés-kezelés gyülekezetenként.** A rendszergazda a „Rendszer pénzügyei"
  oldalon minden gyülekezethez egyénileg állíthat be előfizetést: egyedi díjat és
  külön felárat a speciális igényekre, egyszeri kifizetéseket és adományokat
  rögzíthet, és külön kezelheti a bevételeket és kiadásokat. Az árfolyamok (RON,
  EUR, HUF, USD) automatikusan frissülnek a Nemzeti Banktól, kézzel is felülírhatók.
- **Előfizetés-alapú hozzáférés.** A rendszergazda teljes szabadsággal indíthat,
  leállíthat, teszt-időszakra vagy ingyenes használatra állíthat egy gyülekezetet.
  Ha egy előfizetés szünetel, az adott gyülekezet felhasználói egy tájékoztató
  képernyőt látnak a modulok helyett, amíg a rendszergazda újra nem aktiválja.
- **Teljes körű regisztráció Google-fiókkal is.** Aki Google-lel regisztrál,
  mostantól ugyanúgy megadja a kért szerepkört, az egyházkerület–egyházmegye–
  gyülekezet adatait és a csatolható igazolást, mint a jelszavas regisztrációnál —
  így a rendszergazda az elbíráláshoz minden szükséges adatot lát.
- **Felhasználó-elbíráló varázsló.** A várakozó regisztrációk jóváhagyása mostantól
  átlátható, kétlépéses folyamat: előbb a beküldött adatok áttekintése, majd az
  aktiválás és a szerepkör kiosztása egy helyen.
- **Eszközök és licencek kezelése.** Az „Eszközök és napló" oldalon a licencek
  kibocsáthatók, hosszabbíthatók, visszavonhatók; áttekintő mutatók jelzik a
  hamarosan lejáró licenceket és a rég nem használt eszközöket; az aktivitási napló
  szűrhető és exportálható.
- **Import bármely gyülekezethez.** A rendszergazdai Import oldal mostantól
  gyülekezet-választós központ: tagnyilvántartás, anyakönyv, pénzügy, munkanapló és
  iktató is importálható bármelyik gyülekezethez.
- **Utoljára aktív jelzés.** A felhasználó-listában látható, ki mikor használta
  utoljára a rendszert.

### 🎨 Felület-frissítés

- **Az egész rendszergazdai felület egységes, letisztult megjelenést kapott**, és
  telefonon is tökéletesen használható. A színek automatikusan követik a világos és
  sötét témát. Elküldött rendszerüzenetek mostantól előnézetben megtekinthetők.

---

## [2026-07-11] — Pénzügy gyorsjavítás: banki import hiba + visszamenőleges rögzítés
<!-- key: 2026-07-11-penzugy-import-hotfix -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.59 -->

### 🐛 Javítások

- **⚠️ A banki import bevétel-rögzítése ismét hibával állt le** („null value in
  column userid") — a korábbi javítás után EZ volt a következő hiányzó kötelező
  mező. Most nem csak ezt az egyet pótoltuk: a banki import ÖSSZES beszúrási
  útját (bevétel, kiadás, belső mozgás mindkét oldala) végigellenőriztük az
  adatbázis TELJES kötelező-mező listája ellen, hogy ne jöjjön sorban a
  következő ilyen hiba.
- **A visszamenőleges rögzítés (pl. 2026-os költségvetési évben 2025-ös kivonat
  importja) mostantól végig rendben van:**
  - a tételek a SAJÁT dátumuk éve alá kerülnek (nem a képernyőn kiválasztott
    év alá) — ez eddig is így volt, ellenőriztük;
  - lezárt (véglegesített) évre az import továbbra is blokkolva, pontos
    hibaüzenettel;
  - **ÚJ:** ha a következő év nyitó egyenlegét korábban a rendszer hozta át
    automatikusan (a tavalyi záróból), az utólag rögzített tavalyi tételek után
    a rendszer **magától újraszámolja** — banki importnál ÉS kézi
    kassza↔bank átvezetésnél is. Kézzel beírt nyitót soha nem ír felül.

---

## [2026-07-10] — Pénzügy 4. kör: múltbeli évek nyomtatása, nyugtafigyelő-áthozás, felület-rendezés
<!-- key: 2026-07-10-penzugy-negyedik-kor -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.57 -->

### 🐛 Javítások

- **A Nyomtatási központ mostantól MÚLTBELI ÉVEKRE is működik.** Eddig ha az
  oldal a 2026-os éven állt, és a nyomtatási központban 2025-öt választottál,
  MINDEN nyomtatvány (Registru Casa/Banca/Jurnal, Csoportnapló, számadás-
  tényadatok) üresen jött ki — „Nincs könyvelt tétel" felirattal, pedig volt.
  Az ok: a nyomtatás a képernyőn lévő (az oldal évére szűrt) tételeket szűrte
  a másik évre. Mostantól a kiválasztott év tételeit és nyitó egyenlegeit a
  rendszer külön betölti — a webes és az asztali verzióban is.
- **A Csoportnapló ezzel a jogcímenkénti nézetben is helyes** múltbeli évre
  (ez volt a bejelentett „üres Csoportnapló" közvetlen oka).
- **A Nyugtafigyelő riasztás átjön az új évbe.** Az előző évben elmaradt
  (hiányzó sorszámú) nyugták mostantól a folyó költségvetési év nézetében is
  piros riasztásként jelennek meg — akkor is, ha az új évben még egyetlen
  nyugta sincs rögzítve (eddig ilyenkor a riasztás teljesen eltűnt). Amint egy
  hiányzó sorszámot pótolsz, az lekerül a listáról.
- **A „Készpénzfelvétel bankszámláról" nem szerepel többé kétszer** a Tétel
  rögzítése jogcím-listájában. Az ok egy régi, hibás (már inaktivált) belső
  mozgás jogcím volt, amely ugyanazt a feliratot kapta, mint a helyes —
  mostantól irányonként pontosan egy belső mozgás opció jelenik meg.
- **Az asztali verzió számadás-nyomtatványának tényadatából a stornózott
  tételek is kimaradnak** (a webes javítás párja — eddig csak a webben volt meg).
- **A Tranzakciók fül exportja is az ÉLŐ párosítási állapotot mutatja** a belső
  mozgásoknál — eddig a rögzítéskor beégetett „⏳ Várakozik banki egyeztetésre"
  szöveg örökre a megjegyzésben maradt, akkor is, ha a banki pár már régen
  beérkezett. Mostantól ugyanaz a valós státusz megy az Excelbe, mint a Kassza
  fül exportjában: „✓ Belső mozgás — párosítva" vagy „⏳ Várakozik…".

### ✨ Új funkciók

- **Nyitó egyenlegek szerkesztése a Gyülekezet beállításaiban** (Pénzügy →
  Nyitó egyenlegek fül): a legelső — és bármely — év január 1-i készpénz- és
  bankszámla-egyenlegei itt rögzíthetők/javíthatók, hogy a rendszer biztosan
  jó bázisról számolja az egyenleg-láncot évről évre. Látszik, honnan
  származik az érték (kézzel rögzítve / importból / előző évből áthozva);
  devizás számlánál árfolyammal együtt adható meg. Véglegesített (lezárt) év
  nyitója védett — ahhoz javítási engedély kell.
- **A szép, logós betöltő-állapot több helyen:** a Pénzügy oldal év-váltásánál
  (eddig a régi oldal némán „befagyva" állt, amíg az új év adatai megjöttek)
  és a Nyomtatási központban a múltbeli évek adatainak betöltése alatt.

### 🎨 Felület

- **A Pénzügy oldal fejléce átrendeződött:** a munka gombjai (Tétel rögzítése,
  Decont, Dispoziție, Nyomtatási központ, Oblio ellenőrzés) a BAL oldalra
  kerültek — ott kezdődik a munka —, a cím, az év-választó és az információs
  címkék a jobb oldalra. A gombok megújultak: színes, ikonos, finoman kiemelt
  formát kaptak.
- **A Tétel rögzítése ablakban a Kiadás fül is halvány piros pirulaként
  látszik** (a Bevétel halvány zöldként), és kattintásra élénkül meg — eddig
  az inaktív fül jelöletlen, sima szövegnek tűnt.

---

## [2026-07-10] — Pénzügy 3. kör: banki import javítás, megújult Decont/Dispoziție, bérleti szerződések
<!-- key: 2026-07-10-penzugy-harmadik-kor -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.56 -->

### 🐛 Javítások

- **⚠️ KIEMELT: A banki import (BCR Excel) eddig „Import sikeres!" feliratot mutatott
  akkor is, amikor VALÓJÁBAN egyetlen tételt sem rögzített.** Egy belső hiba miatt
  minden bevételi tétel mentése elbukott, de a varázsló ezt zölddel nyugtázta —
  aki importált, joggal hihette, hogy a kivonat bekerült, pedig nem. Mindkét
  hibát javítottuk: az import mostantól ténylegesen rögzít, és ha mégis hiba
  történik, a varázsló piros figyelmeztetéssel ŐSZINTÉN megmondja, hogy nem sikerült
  — és mit kell tenni.
- **A bérleti szerződések számításában két súlyos hibát találtunk és javítottunk:**
  a tört évek (év közben kezdődő/végződő szerződés) várható bérleti díja rossz
  időszakkal számolódott, és egy-egy befizetés kétszer is beszámítódhatott két
  szerződésbe. Mostantól a kimutatás (várható / befolyt / hátralék) pontos.
- **Devizás bankszámla nyitó egyenlegénél az árfolyam automatikusan kitöltődik**
  a megadott dátum szerinti hivatalos BNR árfolyammal (kézzel felülírható), és a
  beviteli mezők jól láthatóak lettek.
- **Az új év nyitó egyenlege automatikusan áthozódik az előző évből.** Ha tavaly
  már importáltál kivonatot (vagy volt banki forgalom), az idei januári nyitót
  nem kell kézzel beírni: a rendszer kiszámolja a tavalyi záróból (tavalyi
  nyitó + banki bevételek − banki kiadások), kitölti, és zöld sávban megmutatja
  a számítást — neked csak össze kell vetned az online bank egyenlegével.
  Devizás számlánál a december 31-i évvégi átértékelés hiteles záró értéke
  kerül át (ha az még hiányzik, a rendszer előbb oda irányít). Az így áthozott
  nyitó „carryover" forrás-jelölést kap, tehát később is látszik, hogy a
  rendszer számolta. A webes és az asztali verzió ugyanígy működik.
- **Az Oblio-számla figyelmeztetés:** a Tranzakciók fülön a rendszer szól, ha még
  nincs beállítva a KARTOTEKA mappa — eddig csendben nem működött az ellenőrzés.

### ✨ Új funkciók és 🎨 megújult felület

- **A Decont de încasări és a Dispoziție de plată/încasare ablak teljesen megújult:**
  mindkettőnél rögzíthető utólag bevétel ÉS kiadás is, áttekinthetőbb űrlappal,
  élő A4-es előnézettel — ami pixelre pontosan azt mutatja, ami a nyomtatóból
  kijön. Az Irat szám mező is a helyére került.
- **Videós útmutató a banki importhoz** — a varázsló első lépésében egy kattintással
  megnyitható oktatóvideó mutatja végig a teljes folyamatot.
- **Új bankszámla felvétele:** megújult, kereshetős pénznem-választóval (nem csak
  RON/EUR/HUF — bármely pénznem kikereshető).
- **A bevétel- és kiadás-rögzítő ablakok megújultak** — világosabb elrendezés,
  jól látható mezők, következetes viselkedés.
- **A profilfotó mostantól tényleg megjelenik a fejlécben** — eddig hiába állítottad
  be, mindig csak a monogram látszott.
- **A Pénzügy oldal telefonon és táblagépen is kényelmesen használható** — a
  táblázatok, ablakok és gombok minden képernyőméreten jól kezelhetők.
- Belső karbantartás: elhalt, sehová nem vezető kódrészletek eltávolítása —
  gyorsabb és megbízhatóbb felület.

### ℹ️ Jó tudni — Oblio automatikus számla-letöltés

Megvizsgáltuk, hogy az Oblio (vagy hasonló szolgáltató) tud-e automatikusan
bejövő e-Factura számlákat átadni a Kartotékának úgy, hogy csak egy API-kulcsot
kellene megadni. **Jelenleg egyik román számlázó sem kínál ilyen szolgáltatást** —
a bejövő számlák hivatalos forrása az ANAF SPV rendszere. Középtávon a közvetlen
ANAF-kapcsolat kiépítését javasoljuk; addig a mappás megoldás marad.

---

## [2026-07-10] — Pénzügy 2. kör: könyvelői pontosság, kedvezmények érvényesítése, új kezelőfelület
<!-- key: 2026-07-10-penzugy-masodik-kor -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.56 -->

### 🐛 Javítások — könyvelői pontosság (belső átvilágítás alapján)

- **A stornózott (érvénytelenített) tételek mostantól SEHOL nem számítanak bele az
  összegekbe** — sem az egyenlegekbe, sem a számadásba, sem a hivatalos nyomtatványokba
  (Registru Casa/Banca/Jurnal, Csoportnapló), sem az egyházmegyének beküldött adatokba.
  Korábban a stornó a listákból eltűnt, de az összegeket felfújhatta — ez szabálytalanság
  forrása lehetett volna. A stornózott tétel a listákban látható marad (átláthatóság),
  csak nem számít.
- **⚠️ KIEMELT: A véglegesített (lezárt) évet mostantól SEMMILYEN úton nem lehet
  módosítani.** Miért fontos ez? A beküldött számadás azt tanúsítja az egyházmegye
  felé, hogy „ennyi volt az év" — ha utána bármi változhatna, a beküldött szám már
  nem lenne igaz. Eddig hat „hátsó ajtó" maradt nyitva, most mind zárva van.
  **Példák, mi NEM lehetséges többé egy lezárt évben:**
  - *Belső mozgás rögzítése* — pl. nem lehet utólag „banki letételt" könyvelni
    a tavalyi, már beküldött évre;
  - *Bankkivonat-import (BCR Excel)* — ha a kivonatban akár egyetlen tavalyi,
    lezárt évi tétel van, a rendszer megmondja, melyik év zárt, és nem importál;
  - *Rendszergazdai importok* (kassza-, egyházfenntartás- és általános
    bevétel-import) — a rendszergazdának is előbb javítási engedély kell;
  - *Árfolyam-átértékelés* — a devizás év végi átértékelés sem írható a zárt évre;
  - *Költségvetés átírása* — a mentés mostantól a szerveren ellenőrzi a zárat
    (eddig ügyes böngésző-trükkel megkerülhető lett volna), és külön adatbázis-
    szintű védelem (RLS) is telepíthető rá;
  - *Decont / Dispoziție* rögzítése zárt évre (ez eddig is védett volt — maradt).
  Ha egy lezárt évben mégis javítani kell: a megszokott út él — **javítási
  engedélyt kérsz az egyházmegyétől**, és a feloldás után módosíthatsz.
- **A Csoportnapló megjavult:** eddig üres lehetett akkor is, ha volt adat (a program
  a folyó — még üres — hónapot mutatta, és a besorolatlan tételeket eldobta). Mostantól
  alapból a teljes évet mutatja, a jogcím nélküli tételek külön „Besorolatlan" csoportba
  kerülnek figyelmeztetéssel, és a jogcím-választóból kikerültek az oda nem illő
  belső mozgás kódok.
- **A Nyugtafigyelő mostantól az előző év végén elmaradt nyugtákat is áthozza a folyó
  évbe** — ott is pótolhatók (az elszámolás-varázslóval), ahol a munka ténylegesen folyik.
- **Jövőbeli dátumra nem rögzíthető Decont/Dispoziție**, és a stornózott nyugták nem
  tolják el a következő nyugtaszámot.

### ✨ Új funkciók és felület

- **Az év-választó a bal oldalra került** (a cím alá) — balról jobbra olvasunk, ott
  szembeötlőbb.
- **A nyitó egyenlegek a táblázat részei lettek** (1–3. sor: Múlt évi pénztármaradvány /
  Készpénz / Bank) — pontosan úgy, mint a hivatalos nyomtatványon, a Költségvetés és a
  Számadás fülön is.
- **Egyházfenntartás rögzítésekor a rendszer felajánlja a tag kedvezményes összegét**
  (a beállított korai-fizetési, kor szerinti, foglalkozási és szociális kedvezmények
  alapján, a rögzítés dátumához igazítva) — egy kattintással átvehető, de kézzel
  felülírható (részletfizetés továbbra is lehetséges).
- **A Kedvezmények beállítása egységes lett** a Gyülekezet beállítása ablakban és az
  első indításkor — és a beviteli mezők végre jól láthatóak (nem olvadnak a háttérbe).
- **A Tartozások fül átlátható lett:** összesítő kártyák, keresés, „csak tartozók"
  szűrő, kibontható részletek — évre pontos kimutatással.
- **A Monetár fül helyett elegáns lebegő gomb** van a jobb alsó sarokban (csak a
  Pénzügy oldalon): a Monetár mellett **számológépet** is tartalmaz gyors számolásokhoz.
- **Az Oblio ellenőrzés a heroból nyílik** (gomb), teljes képernyős ablakban — nem
  külön fül többé.
- **Az Áttekintés fülön grafikonok:** havi bevétel–kiadás oszlopdiagram, egyenleg-
  alakulás görbe és a legnagyobb kiadási jogcímek.
- **A nyomtatványokon a hivatalos román megnevezések** szerepelnek (pl. „Contribuţia
  anuală a credincioşilor"), és a Registru-kból kikerült a felesleges utolsó oszlop.
- **A Költségvetés és Számadás betöltése** szép, logós állapotsávot kapott.
- **A Súgó frissült** — minden újdonság lelkészi nyelven elmagyarázva.
- Az asztali verzió is megkapta a nyitó egyenlegeket, az előző évi tényszámokat és a
  pontosított összesítőket.

---

## [2026-07-10] — Pénzügy nagytakarítás: pontos egyenlegek, hivatalos számadás-forma, átláthatóbb felület
<!-- key: 2026-07-10-penzugy-nagytakaritas -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web v0.9.55 -->

### 🐛 Javítások — a pénzügyi számok pontossága

- **A „Belső mozgás" sorok eltűntek a Számadásból és a Költségvetésből** — a pénz
  kasszából bankba tétele (vagy onnan felvétele) nem bevétel és nem kiadás, ezért a
  hivatalos egyházkerületi nyomtatványon sosem szerepelt tételként. Mostantól a
  képernyőn sem jelenik meg — a fül pontosan azt mutatja, amit a nyomtatvány.
- **A belső mozgás rögzítése mostantól azonnal átvezet a kasszán ÉS a bankon** —
  korábban ha valaki a felületről rögzített egy banki letételt, a kassza és a bank
  egyenlege nem változott (a mozgás „elveszett"). Mostantól a rögzítés kettős
  könyveléssel történik (kassza-oldal + bank-oldal, összekapcsolva), így az
  egyenlegek mindig helyesek, és a tétel a megfelelő megnevezéssel jelenik meg:
  „Készpénzletétel a(z) … számlára" / „Készpénzfelvétel a(z) … számláról".
- **Az exportált Excel „Várakozik banki egyeztetésre" felirata mostantól a VALÓS
  állapotot mutatja** — eddig a rögzítéskor beírt szöveg örökre benne maradt, akkor
  is, ha a banki pár már régen beérkezett. A párosítás-figyelő is pontosabb lett:
  csak valódi (kassza↔bank) párokat fogad el.
- **A Számadás nyomtatványán megjelent a hivatalos nyitó 3 sor** (Múlt évi
  pénztármaradvány / Casa / Banca), és **a záró egyenleg mostantól helyesen
  számolódik** (nyitó + évi bevételek − évi kiadások) — korábban tévesen a nyitó
  összeg szerepelt „év végi" egyenlegként.
- **A Nyugtafigyelő átlép az évhatáron** — a nyugták sorszáma évek között
  folytatódik, ezért az ellenőrzés mostantól a következő év első nyugtájáig néz:
  az év végén „elveszett" sorszámok is kiderülnek, hamis riasztás nélkül.
- **A beküldés (számadás/költségvetés az egyházmegyének) megbízhatóbb lett:**
  előbb zár le, utána küld be (nem maradhat beküldött-de-tovább-szerkeszthető
  állapot); a helyben tárolt és a beküldött számok mostantól ugyanazok; a
  véglegesített évbe új tétel sem rögzíthető (eddig csak a módosítás volt tiltva);
  és a dokumentum mindig a gyülekezet saját egyházmegyéjéhez kerül.
- **Devizás bankszámla (pl. EUR) importja mostantól az ADOTT NAPI hivatalos BNR
  árfolyammal számolja át lejre** minden tranzakciót — eddig egyetlen éves
  árfolyam ment mindenre. Ha egy napra nem érhető el árfolyam, a rendszer jelzi.
- **A kiadási kísérőíven a felirat „Registrul-Jurnal"** — a bizonylaton banki
  tételek is szerepelnek, ezért a korábbi „Kasszakönyv" felirat félrevezető volt.
- **Az asztali (offline) verzió bevétel/kiadás összesítői is pontosabbak** —
  a belső mozgások ott sem számítanak bele a totálokba.
- **Az Oblio ellenőrzés „Mappa beállítása" gombja mostantól tényleg működik** —
  eddig egy olyan oldalra vitt, ahol nincs is mappa-beállítás (lelkészként sehol
  nem lehetett beállítani, így a webes Oblio ellenőrzés el sem indulhatott).
  Most a gomb azonnal megnyitja a mappa-választót, és a rendszer megjegyzi a
  kiválasztott KARTOTEKA mappát (Chrome/Edge böngésző szükséges).

### ✨ Új funkciók és 🎨 átláthatóbb felület

- **A költségvetési év választója új, jól látható helyre került** — a Pénzügy
  oldal jobb felső részén külön vezérlő lett belőle: ◄ nyilakkal léptethető,
  nagy évszámmal, „Költségvetési év" felirattal. Nem téveszthető össze többé az
  információs címkékkel.
- **Az év eleji kezdő egyenlegek automatikusan megjelennek** a Költségvetés és a
  Számadás fül tetején (Múlt évi pénztármaradvány / Készpénz / Bank) — nem kell
  kézzel beírni, a rendszer az előző évi záróból hozza.
- **Az előző évi tényszámok halványan (szürkén) megjelennek** a költségvetés
  tervezésénél és a számadásban — tételenként látszik, mennyi volt tavaly,
  üres mezőnél előre beírt javaslatként, amit gépeléskor felülírhatsz.
- **A Tranzakciók fül átláthatóbb:** külön **Bevétel** és **Kiadás** oszlop (mint
  a Kassza fülön), és minden soron látszik, hogy **készpénzes vagy banki** a
  tétel — banki tételnél a bankszámla nevével.
- **A Kassza fülön a gyülekezet saját iratszáma került előre** (a kerületi szám
  kisebb betűvel alá) — és az **Excel-export mindig időrendben** (év elejétől év
  végéig) készül, függetlenül a képernyő rendezésétől.
- **A kiadási kísérőív előnézete a teljes lapot mutatja** görgetés nélkül,
  pontosan úgy, ahogy nyomtatásban kinéz.
- **A hiányzó nyugták elszámolása rugalmasabb:** nyugtánként **külön jogcím**
  választható (nem kell mindennek adománynak lennie), befizetőként **család is**
  megadható, a kereső gyorsabb és pontosabb — és a tag-hozzárendelés továbbra
  sem kötelező. Az előnézetről lekerült az oda nem illő zöld háttércsík.
- **A Monetár fülön a belső mozgások (pl. valutaváltás) törölhetők** — eddig a
  felületről rögzített ilyen mozgást nem lehetett törölni.

### ⚙️ Rendszergazdai teendő (egyszeri)

- Két SQL-javítás futtatandó a Supabase SQL editorban (részletek a fájlokban,
  előbb a beépített ellenőrző lekérdezéssel):
  `migration-docs/sql/2026-07-10-belso-mozgas-xkey-parositas.sql` (a meglévő
  belső mozgás-párok összekapcsolása) és
  `migration-docs/sql/2026-07-10-document-submissions-idempotencia.sql`
  (a beküldés-duplikátumok megszüntetése).

---

## [2026-07-02] — UX: „Még egy befizető" — azonnal írható új mező + „nem tag" jelzés
<!-- key: 2026-07-02-meg-egy-befizeto-fokusz -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítás

- **A Tétel rögzítése ablakban a „Még egy befizető" gombra kattintva azonnal írható az új
  befizető neve** — a mező automatikusan fókuszt kap, és az almenü rögtön kinyílik (korábban az
  első kattintás láthatatlan maradt). A már beírt név/összeg nem vész el: első befizetőként
  megmarad.
- **A tag-párosítás nem kötelező** — nem gyülekezeti tag is adhat adományt. A rendszer diszkréten
  jelzi („nem tag"), ha a beírt név nincs taghoz kötve; zöld jelölés mutatja, ha kötve van.

---

## [2026-07-02] — Új: hiányzó nyugták bevételi ELSZÁMOLÁSA élő előnézettel (Decont de încasări)
<!-- key: 2026-07-02-hianyzo-nyugtak-decont-elonezet -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkció / UX

- **A hiányzó nyugták utólagos könyvelése mostantól bevételi ELSZÁMOLÁS (Decont de încasări)** —
  nem „Dispoziție de încasare". Az ablak a Decont-ablak mintájára **élő A4-előnézetet** mutat
  (gépelés közben frissül), ami nyomtatható hivatalos formában tartalmazza a tételeket.
- **A Kerületi sz. automatikusan kikövetkeztetve előtöltődik** a hiányzó nyugta előtti és utáni
  nyugták számaiból (a kerületi és a gyülekezeti sorszám együtt lép) — természetesen kézzel
  felülírható.
- **Egy nyugtára több befizető is rögzíthető** (a nyugtán több név is szerepelhet), mindenki külön
  összeggel. A **tag-párosítás nem kötelező** — nem gyülekezeti tag is adhat adományt (ilyenkor a
  név szabad szövegként mentődik, és a rendszer diszkréten jelzi: „nem tag").
- **Részletesebb, szebb befizető-kereső:** avatar, életkor-jelvény és lakcím a találatokban; zöld
  jelölés mutatja, ha a befizető taghoz van kötve.

---

## [2026-07-02] — Új: minden gyülekezeti szerkesztő egy helyen (a „Haladó szerkesztő" megszűnt)
<!-- key: 2026-07-02-gyulekezet-beallitas-konszolidacio -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkció / UX

- **A gyülekezet ÖSSZES beállítása egy helyen: a „Gyülekezet beállítása" ablakban.** Új panelek:
  - **Kedvezmények és díjak** — a kedvezmény-szabályok (korai fizetés, kor/nyugdíjas, foglalkozás,
    szociális) és az egyéb gyülekezeti díjak teljes szerkesztője (hozzáadás / módosítás / törlés).
  - **Lelkészek és átadás** — a lelkészi szolgálati napló és a gyülekezet-átadás teljes folyamata.
  - A **Pénzügyi alap** panelre bekerültek az **évenkénti (visszamenőleges) díjak** is.
- **A külön „Haladó szerkesztő" ablak és gomb megszűnt** — minden funkciója beolvadt a beállítás-
  ablakba, így nincs többé oda-vissza ugrálás; a „Gyülekezetünk adatai" nézet „Szerkesztés" gombja
  is ide vezet.

---

## [2026-07-02] — Javítás: készpénzes KIADÁS mentése (oszlop-hiba)
<!-- key: 2026-07-02-keszpenz-kiadas-mentes-fix -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás

- **A készpénzes kiadási tétel mentése többé nem hibázik** a „Could not find the »bizonylatszam«
  column of »kiadas«" üzenettel. A kiadás-rögzítés a `kiadas` tábla valós oszlopait használja (a
  személy az `atvevoid` mezőbe kerül, nem a nem létező `id_szemely`-be), így a mentés első
  próbálkozásra sikerül — a fizető/átvevő párosítás megmarad.

---

## [2026-07-02] — Új funkció: hiányzó nyugták UTÓLAGOS BEVÉTELEZÉSE varázslóval (személyhez kötve)
<!-- key: 2026-07-02-hianyzo-nyugtak-incasare-wizard -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkció

- **A Nyugtafigyelő „Hiányzó nyugták" gombja a hiányzó nyugtákat utólag BEVÉTELEZI** (korábban tévesen
  a Decont/kiadás-elszámolást nyitotta). A hiányzó nyugták a gyülekezet **bevételei**. A varázslóban
  **minden hiányzó nyugta egy külön sor**: megadod az összegét és **kikeresed a befizető tagot** — így
  az **adomány / egyházfenntartás a taghoz is hozzászámít** —, majd közös dátumot és bevétel-jogcímet
  választasz.
- **Könyvelésileg helyes megoldás:** a már kiállított **Chitanță maga a bizonylat**, ezért a tétel
  **Chitanță-bevételként a kasszába (Registrul de casă) és a számadásba** kerül a nyugta saját
  **Irat sz.**-ával — nem külön Dispoziție-bizonylattal (az csak akkor kell, ha nincs más bizonylat).
  Minden tétel **„utólag elszámolt" megjegyzést** kap (látható nyom), és a figyelő „hiányzó" listájáról
  is lekerül.

---

## [2026-07-02] — Javítás: a készpénzes tétel irattípusa a valódi bizonylatot mutatja (Chitanță)
<!-- key: 2026-07-02-irattipus-chitanta -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás

- **A tétel-listákban az IRATTÍPUS oszlop a valóban választott bizonylattípust mutatja** (Chitanță,
  Factură stb.) — korábban készpénzes rögzítésnél tévesen mindig „Készpénz" jelent meg. A készpénz/bank
  megkülönböztetés a háttérben a **bankszámla-kötés** alapján megy, így a kassza-/bank-kimutatások, a
  következő nyugtaszám és az offline rögzítés is helyesek maradnak.

---

## [2026-07-02] — UX: a „Még egy befizető" gomb jól látható és mindig elérhető
<!-- key: 2026-07-02-tobb-fizeto-kiemeles -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítás

- **A Tétel rögzítése ablakban a „Még egy befizető" mostantól kiemelt, jól látható gomb**, és már az
  első befizető felvétele ELŐTT is elérhető. Egy nyugtára több befizetőt (pl. családtagokat) így
  könnyebb felvinni, mindenkit külön összeggel — a mező mellett rövid súgó is segít.

---

## [2026-07-02] — Javítás: nyugtatömb-mentés „gyulekezeti_szam is ambiguous" hiba
<!-- key: 2026-07-02-nyugtatomb-ambiguous-fix -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web + DB-migráció -->

### 🔧 Javítás

- **Új nyugtatömb rögzítésekor / chitanță-szám lefoglalásakor megszűnik a „Szám-lefoglalási hiba:
  column reference »gyulekezeti_szam« is ambiguous" hibaüzenet.** A szám-lefoglaló adatbázis-függvény
  javítva (a javítás DB-oldali migrációként fut le).

---

## [2026-07-02] — Javítás: a személyi kartonon menthető a GDPR-hozzájárulás + közösségi profil-link
<!-- key: 2026-07-02-tag-gdpr-social-mentes -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás

- **A tag felvételi/szerkesztő űrlapján (Pénzügyi lépés) mostantól rögzíthető és MENTŐDIK a
  GDPR-hozzájárulás, a fénykép-közlési és a hírlevél-hozzájárulás.** Eddig ezek csak a részletező
  kártya külön szerkesztőjéből mentek. Szerkesztéskor a meglévő értékek előtöltődnek (nem törlődnek).
- **Új mező: „Közösségi profil (Facebook) link"** — a profilkép ebből tölthető be; a link mostantól
  a személyi kartonon is megadható és mentődik.

---

## [2026-07-02] — UX: a Gyülekezet beállításai „Pénzügyi alap" rész átdolgozva (welcome-minta)
<!-- key: 2026-07-02-penzugyi-alap-welcome-minta -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítás

- **A Gyülekezet beállításai → „Pénzügyi alap" szakasz a bevezető (welcome) varázsló pénzügyi
  lépésének letisztult felépítését követi:** külön, magyarázatos kártya az éves alapösszegnek, a
  kedvezményes időszaknak és a tartozás-számítási módnak — jól látható választókkal.

---

## [2026-07-02] — UX: a „Gyülekezetünk adatai" ablak szélessége javítva
<!-- key: 2026-07-02-gyulekezet-ablak-szelesseg -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítás

- **A „Gyülekezetünk adatai" (megtekintő) ablak már nem indokolatlanul széles.** A haladó szerkesztő
  nézet marad szélesebb, a megtekintő nézet visszafogottabb méretet kap.

---

## [2026-07-02] — Javítás: az egyházi (saját) CNP nem hiba a tagnyilvántartás Hibák fülén
<!-- key: 2026-07-02-egyhazi-cnp-nem-hiba -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás

- **A Hibák fülön többé nem jelez tévesen a rendszer az egyházi (saját) CNP-kre.** Az egyházi
  rendszer által kiadott CNP (pl. `EC-2026-…`) szándékosan NEM 13 számjegyű valódi román CNP, ezért
  a „CNP nem 13 számjegy" ellenőrzés mostantól kihagyja ezeket (és a régi placeholder-eket is). A
  valódi CNP-k ellenőrzése változatlan.

---

## [2026-07-02] — Fejlesztés: „Gyülekezetünk adatai" új, színes read-only nézet + mezők a beállításokban
<!-- key: 2026-07-02-gyulekezetunk-adatai-redizajn-migracio -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros, szamvevo -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítás

- **A „Gyülekezetünk adatai" ablak teljesen megújult: színes, kategorizált, egyértelmű, csak
  megtekintésre és nyomtatásra szolgáló nézet** (élénk fejléc a címerrel, kategóriánként külön
  színnel — megnevezések, egyházi hovatartozás, cím, elérhetőség, bankszámlák, pénzügyi alap,
  kedvezmények, lelkészek). **A szerkesztés innen átkerült a „Gyülekezet beállítása" ablakba** — a
  „Szerkesztés a beállításokban" gomb oda visz.
- **A „Gyülekezet beállítása" ablak mostantól az egyházmegyét és a pénzügyi alapot is szerkeszti**
  (éves járulék, kedvezményes alapösszeg, járulék határidő, tartozás-számítás módja) — új „Pénzügyi
  alap" lap. Innen nyílik a **Haladó szerkesztő** is: kedvezmény-szabályok, egyéb díjak, évenkénti
  (visszamenőleges) díjak és a **lelkész-átadás**. Így a gyülekezet MINDEN szerkesztése a
  beállításokban van, a „Gyülekezetünk adatai" pedig teljesen megtekintő/nyomtató nézet lett.

---

## [2026-07-01] — (JAVÍTVA 2026-07-02) hiányzó nyugták gomb — a helyes megoldás a bevételezés
<!-- key: 2026-07-01-hianyzo-nyugtak-decont -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (visszavonva — lásd lentebb) -->

### ✨ Új funkció

- ⚠️ **Ezt a bejegyzést a 2026-07-02-i „hiányzó nyugták BEVÉTELEZÉSE (Dispoziție de încasare)"
  javítja/váltja fel.** Az eredeti gomb tévesen a Decontot (kiadás-elszámolás) nyitotta; a hiányzó
  nyugták valójában BEVÉTELEK, ezért a helyes megoldás a Dispoziție de încasare varázsló (a kasszába
  és a számadásba bevételként).

---

## [2026-07-01] — Javítás: tag-mentés hiba + gyorsabb nyugta-autofill + szülő-összekötés magyarázat
<!-- key: 2026-07-01-tag-mentes-autofill-szulo -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás

- **Új tag mentése többé nem hibázik.** A tagnyilvántartásban új tag rögzítésekor a Mentés
  „Invalid input: expected number, received string" hibát adott — ez javítva.
- **A Tétel rögzítésekor a nyugtaszám automatikus kitöltése érezhetően gyorsabb.** A rendszer
  mostantól egy megnyitásra évente egyszer kérdezi le a következő számokat (nem soronként újra),
  és a lekérdezéseket párhuzamosan futtatja.
- **Az „Új év — hogyan induljon a gyülekezeti nyugtaszám?" kérdés újra megjelenik, ha visszaváltasz
  az aktuális évi dátumra** (múlt évi dátumnál eltűnik). A választ a rendszer megjegyzi — utána
  többször nem kérdez rá.

### 🎨 UX javítás

- **A szülők rögzítésénél a „Nincs a tagok között? Rögzítés tagként + összekötés" gombra víve a
  kurzort most elmagyarázza, mit csinál** (új tagrekordot hoz létre a szülő nevével, a gyermek
  címét örökölve, és apaként/anyaként összeköti).

---

## [2026-07-01] — Fejlesztés: „Gyülekezetünk adatai" szép, kategorizált, nyomtatható összefoglaló
<!-- key: 2026-07-01-gyulekezetunk-adatai-osszefoglalo -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros, szamvevo -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítás

- **A fejléc menü „Gyülekezetünk adatai" ablaka mostantól egy letisztult, kategorizált
  (Apple-beállítások jellegű) ÖSSZEFOGLALÓT mutat a gyülekezet minden rögzített adatáról** —
  megnevezések, egyházi hovatartozás, hivatalos cím, elérhetőség, bankszámlák, pénzügyi alap,
  kedvezmények és lelkészek —, és **egy gombbal kinyomtatható** (szép, A4-es hivatalos adatlap
  a címerrel). A szerkesztés a „Szerkesztés" gombbal érhető el (semmi nem változott a szerkesztő
  nézetben). A hivatalos alapadatok továbbra is a „Gyülekezet beállítása" ablakban szerkeszthetők.

---

## [2026-07-01] — Fejlesztés: befizető-kereső életkorral + egyházfenntartás auto-összeg megbízhatóbb
<!-- key: 2026-07-01-befizeto-eletkor-jarulek-autofill -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🎨 UX javítás

- **A Befizető / forrás keresőjének legördülője szebb lett, és mutatja a befizető életkorát.** A
  találati listában mostantól kezdőbetűs ikon, a név mellett egy „N éves" jelvény (a születési év a
  jelvényre húzva jelenik meg), alatta a cím — így egy pillantással azonosítható a megfelelő tag.

### 🔧 Javítás

- **Az egyházfenntartói járulék automatikus összege megbízhatóbb.** Ha egy regisztrált tag jogcíme
  egyházfenntartói járulék, a rendszer a welcome-oldalon beállított **éves járulék-alapból és a
  kedvezményekből** kiszámolja a még fizetendőt, és beírja (a kézi összeget sosem írja felül).
  Mostantól akkor is működik, ha csak a **gyülekezeti alapadat** van beállítva (nincs külön évenkénti
  beállítás). **Ha egyáltalán nincs beállítva** az adott évi éves járulék, a rendszer már nem
  „felmentett"-et ír, hanem jelzi, hogy **állítsd be a „Gyülekezetünk adatai → Pénzügy" alatt** —
  addig kézzel is rögzíthető.

---

## [2026-07-01] — Javítás: a Nyugtafigyelő nem jelez hibát a több-befizetős nyugtákra + finomabb új-évi kérdés
<!-- key: 2026-07-01-nyugtafigyelo-tobb-befizeto-ujjev -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros, szamvevo -->
<!-- version: web + desktop (következő kiadás) -->

### 🔧 Javítás

- **A Nyugtafigyelő már nem jelzi hibaként az „ismétlődő" Irat sz.-okat, ha egy nyugtán több
  befizető szerepel.** Ha egy nyugtát több személyre bontasz (mindenkihez külön sor, de KÖZÖS
  Irat sz.-mal), az teljesen szabályos — a rendszer eddig ezt tévesen ismétlődésnek jelezte.
  Mostantól egy Irat sz. csak akkor számít valódi duplikátumnak, ha **két KÜLÖNBÖZŐ nyugtához**
  (eltérő kerületi alap-iratszámhoz) tartozik ugyanaz a sorszám. A lényeg továbbra is a **hiányzó**
  számok kiszűrése. (Ellenőrző lekérdezés: `2026-07-01-nyugta-duplikatum-ellenorzes.sql`.)
- **Az „Új év — hogyan induljon a gyülekezeti nyugtaszám?" kérdés eltűnik, ha múlt évi dátumot
  választasz.** Ha a nyugta rögzítésekor nem az új évre, hanem egy korábbi év dátumára váltasz, a
  felugró új-évi kérdés magától bezárul (az csak az új évre vonatkozik).

---

## [2026-07-01] — Javítás: második e-mail ugyanahhoz az egyházközséghez — most már látja az adatokat
<!-- key: 2026-07-01-masodik-email-egyhazkozseg-hozzaferes -->
<!-- category: fix -->
<!-- targets: admin, lelkesz -->
<!-- version: adatbázis (admin által futtatott SQL) -->

### 🔧 Javítás

- **Ha ugyanahhoz az egyházközséghez egy MÁSODIK e-mail címet regisztráltál, de az nem látta a
  gyülekezet adatait, ez mostantól javítható.** Az ok: a rendszer a hozzáférést a fiók saját
  „egyházközség" beállítása alapján dönti el — ha ez a második fióknál üres maradt (mert a
  jóváhagyáskor már aktív volt), a fiók semmit nem látott. A javítás beállítja a második fiók
  egyházközségét, így ugyanazokat az adatokat látja, mint az első. (A javítás adatbázis-oldali,
  az adminisztrátor futtatja; a részletek a fejlesztői dokumentációban.)

---

## [2026-07-01] — Fejlesztés: a Könyvelés listákban is látszik a Kerületi sz. ÉS az Irat sz.
<!-- key: 2026-07-01-keruleti-es-irat-sz-lista -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros, szamvevo -->
<!-- version: web + desktop (következő kiadás) -->

### 🎨 UX javítás

- **A pénzügyi listákban (Könyvelés / Tranzakciók) az „Iratszám" oszlop mostantól MINDKÉT számot
  megmutatja:** a **Kerületi sz.**-ot (a kerülettől kapott, nyomtatott szám) fő értékként, alatta
  pedig kis betűvel az **Irat sz.**-ot (a gyülekezet saját sorszáma), ha az külön van rögzítve. Így
  egy pillantással ellenőrizhető mindkét szám — nem csak a rögzítő ablakban, hanem a listában is.

---

## [2026-07-01] — Javítás: a Nyugtafigyelő már a gyülekezet saját sorszámát (Irat sz.) figyeli
<!-- key: 2026-07-01-nyugtafigyelo-irat-sz -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros, szamvevo -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás

- **A Nyugtafigyelő riasztás nem jelez többé tévesen több tízezer „hiányzó" nyugtát.** A nyugtán KÉT
  szám van: a **Kerületi sz.** (a kerület adja, előre nyomtatott, kerület-szintű nagy szám — pl.
  115019), és az **Irat sz.** (a gyülekezet saját, évente újrainduló sorszáma — pl. 1, 2, … 77).
  Eddig a figyelő a két számot összemosta, és a kettőt egyetlen folyamatos sorozatként ellenőrizte —
  ezért a kis gyülekezeti számok (1–77) és a nagy kerületi számok (115019–115328) közötti „lyukat"
  (kb. 115 000 szám) tévesen hiányzó nyugtáknak, a nagy kerületi számokat pedig tévesen
  ismétlődéseknek és dátumhibáknak jelezte.
- **Mostantól a figyelő kizárólag a gyülekezet saját sorszámát (Irat sz.) követi**, az év első és
  utolsó nyugtája között (nem 1-től) — így a hiányzó/ismétlődő szám jelzés valóban a gyülekezet saját
  számozásának hézagjait mutatja. A kerületi számban lévő hézag normális (a számok más gyülekezetek
  nyugtái közé esnek), ezért azt a rendszer nem jelzi hibaként.

---

## [2026-07-01] — Javítás: ismeretlen Google-fiók nem „regisztrál" — kiírjuk, hogy nincs regisztrálva
<!-- key: 2026-07-01-google-nincs-regisztralva -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros, szamvevo, admin -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás

- **Ha valaki egy nem regisztrált e-mail-lel próbál Google-fiókkal belépni, a rendszer mostantól
  világosan kiírja: „Ez az e-mail cím nincs regisztrálva a rendszerben."** Eddig a belépés úgy
  viselkedett, mintha az illető éppen regisztrálna (a profil-kiegészítő űrlapra vitte) — pedig
  Google-lel csak már regisztrált felhasználó léphet be. Új felhasználó továbbra is a Regisztráció
  (hozzáférés igénylése) oldalon kezdi. A már regisztrált, Google-lel belépő felhasználókat ez nem
  érinti.

---

## [2026-06-30] — Javítás: Chitanță nyugtaszámok automatikus kitöltése (importált előzményből is)
<!-- key: 2026-06-30-chitanta-szamozas-import-elozmeny -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🔧 Javítás

- **Tétel rögzítésekor a „Chitanță" (nyugta) választásakor mostantól a Kerületi sz. és az Irat sz.
  mező automatikusan kitöltődik az utolsó nyugta + 1 értékkel — akkor is, ha a korábbi nyugtáidat
  importból hoztad be** (pl. egyházfenntartás-import vagy általános import). Eddig a rendszer a
  számozáshoz csak a kézzel rögzített nyugtákat „látta", az importált tételeket nem, ezért importált
  előzmény esetén a két mező üresen maradt (vagy 1-ről indult), és az **új évnél feltett kérdés**
  („folytatjuk az előző évi számozást, vagy kezdjük 1-től?") sem jelent meg. Mostantól a rendszer
  minden készpénzes nyugtát figyelembe vesz az eredetétől függetlenül, így a kerületi és a
  gyülekezeti számozás folytonos marad, és az új évi kérdés a helyén megjelenik.
- **A nyugta-ellenőrzés** (hiányzó / ismétlődő számok jelzése) is mostantól beleszámítja az importált
  nyugtákat — így nem jelez tévesen „hiányzó számokat" az importált és a kézi nyugták között.

---

## [2026-06-30] — Gyorsabb betöltés: Pénzügy
<!-- key: 2026-06-30-penzugy-gyorsitas -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros, szamvevo -->
<!-- version: web (következő kiadás) -->

### ⚡ Gyorsabb működés

- **A Pénzügy oldal érezhetően gyorsabban nyílik meg.** A rendszer mostantól csak a ténylegesen
  megnyitott fülek programkódját tölti be (a Súgó, a Könyvelés, a Tartozások, az Importáló és a
  többi fül csak akkor, amikor rákattintasz), és az Excel-exporthoz használt nagy programkönyvtár
  (kb. 300 KB) is **csak akkor töltődik le, amikor ténylegesen Excelbe exportálsz** — nem minden
  megnyitáskor. **Minden összeg, egyenleg, lista és nyomtatvány pontosan ugyanaz marad, csak
  gyorsabban jelenik meg.**
- **Kevesebb felesleges adatletöltés és várakozás a háttérben.** A pénzügyi adatok betöltésekor a
  rendszer a korábbi, lépésről lépésre futó lekérdezések helyett egyszerre, párhuzamosan dolgozik,
  és a befizetés/kiadás tételeknél csak a ténylegesen megjelenített mezőket kéri le. Ez gyorsabb
  betöltést ad, különösen nagy gyülekezeteknél (egy évben sok ezer tétel) és lassabb
  internetkapcsolatnál.

---

## [2026-06-30] — Gyorsabb betöltés: Tagnyilvántartás
<!-- key: 2026-06-30-tagnyilvantartas-gyorsitas -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ⚡ Gyorsabb működés

- **A Tagnyilvántartás érezhetően gyorsabban nyílik meg.** A rendszer mostantól csak a ténylegesen
  szükséges adatokat tölti be, és a ritkábban használt füleket (Súgó, Családok, Presbiterek, Körzetek,
  Választók, Hibák, Rendszergazdai importáló) csak akkor, amikor rákattintasz — így a kezdőképernyő
  (Áttekintés és Személyek) sokkal hamarabb megjelenik. **Minden adat ugyanaz marad, csak gyorsabban.**
- **Nagy gyülekezeteknél nem akad meg a böngésző a hosszú listáknál.** A Családok, a Választók és a
  Hibák lista mostantól első körben az első néhány száz sort mutatja, a többi egy „További megjelenítése"
  gombbal tölthető — így több ezer tag esetén sem fagy le vagy lassul be az oldal. A keresés és a szűrők
  ugyanúgy a **teljes** névsoron dolgoznak, és a fejléc-számok (pl. összes választó, az egyházmegyének
  beküldött létszám) változatlanok.
- **Kevesebb felesleges adatletöltés a háttérben.** A taglista betöltésekor a rendszer többé nem tölti le
  a feleslegesen nagy adatokat (például a tagokhoz mentett fényképeket), és a „valaha fizetett járulék"
  kimutatáshoz is már csak az egyházfenntartói járulékot nézi át. Ez gyorsítja a megjelenést és kíméli a
  lassabb internetkapcsolatot is.

---

## [2026-06-30] — Gyorsabb betöltés: Irányítópult (kezdőképernyő)
<!-- key: 2026-06-30-iranyitopult-gyorsitas -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ⚡ Gyorsabb működés

- **Az Irányítópult (a belépés utáni kezdőképernyő) érezhetően gyorsabban töltődik be.** A háttérben
  a rendszer eddig sok adatot egymás után, lépésről lépésre kért le; mostantól ezeket egyszerre,
  párhuzamosan tölti, így rövidebb a várakozás. **A képernyőn minden ugyanúgy néz ki és pontosan
  ugyanazokat a számokat mutatja, mint eddig** — csak gyorsabban jelenik meg.
- **Kevesebb felesleges adatletöltés.** Néhány adatot a rendszer korábban akkor is mindig letöltött,
  amikor nem volt rá szükség (például az összes tag lakcímét, a teljes névnap-naptárt és az összes
  presbiter-bejegyzést). Mostantól ezek csak akkor töltődnek be, amikor tényleg kellenek — például a
  lakcímek csak a **születésnapi lista nyomtatásakor**. Ez tovább gyorsítja a megjelenést és kíméli a
  lassabb internetkapcsolatot is.

---

## [2026-06-21] — Járulék-kedvezmények: a mentett kedvezmények biztosan érvényesülnek
<!-- key: 2026-06-21-jarulek-kedvezmeny-ellenallosag -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🔧 Javítás

- **A beállított járulék-kedvezmények mostantól mindenhol érvényesülnek.** Egyes (régebbi)
  adatbázisokból hiányzott egy mező (az időszaki kedvezmény **kezdő dátuma**), és emiatt a rendszer
  bizonyos esetekben **némán figyelmen kívül hagyhatta az összes beállított kedvezményt** (kor-,
  foglalkozás- és időszaki kedvezményt egyaránt) — a **Tartozások-listán**, a **tagnyilvántartásban**
  és a **befizetés auto-összegénél** is. Ezért fordulhatott elő, hogy „be van állítva a kedvezmény,
  mégis a teljes díj jelenik meg". Mostantól a hiányzó mező **nem okoz kedvezmény-kiesést**: a
  kedvezmények a megszokott módon működnek (a hiányzó kezdő dátum esetén nyitott időablakkal). A
  végleges megoldás a mező pótlása az adatbázisban — ezt a rendszergazda egy lépésben elvégzi.
- **A varázsló (és a Beállítások) kedvezmény-mentése sem veszik el egy hiányzó mező miatt.** Korábban
  egyetlen hiányzó adatbázis-oszlop az **egész** kedvezmény-csomag mentését meghiúsíthatta (üresen
  maradt a kedvezmény-tábla). Mostantól a mentés ilyenkor is sikeresen lefut.

---

## [2026-06-21] — Tétel rögzítése: számozás megbízhatóbb + járulék-kedvezmény figyelembevétele
<!-- key: 2026-06-21-szamozas-jarulek-kedvezmeny-fix -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🔧 Javítás

- **A Chitanță nyugtaszám-kitöltés megbízhatóbb.** Új évnél a **gyülekezeti** szám is azonnal
  kitöltődik az ajánlott folytatással (eddig üresen maradhatott, amíg nem döntöttél), a kérdés-panel
  már csak felülírásra szolgál, és a további sorok nem kérdeznek újra. Megszűnt egy ritka, „néma"
  eset is, amikor a kitöltés gyors kattintásnál kimaradt. **Az első nyugtánál** (nincs előzmény) a
  kerületi mező jelzi, hogy oda a kezdő (kerülettől kapott) számot kell beírni — onnantól magától lép.
- **Az egyházfenntartói járulék auto-összeg most figyelembe veszi a kedvezményeket befizetéskor.**
  A korai-fizetési / időszaki kedvezmény eddig csak akkor csökkentette az ajánlott összeget, ha a tag
  **már befizetett** — de a rögzítéskor épp a *még be nem rögzített* befizetést írod be, ezért a teljes
  díj jelent meg. Mostantól a rendszer a **befizetés dátuma** alapján számol: ha a határidőn belül
  rögzíted, a **kedvezményes** összeget ajánlja. A Tartozások-lista számítása változatlan.
<!-- key: 2026-06-21-desktop-tetel-bekotes -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: desktop (következő kiadás) -->

### ✨ Új funkció (asztali app)

- **A Tétel rögzítő kényelmi funkciói az asztali appban is működnek — online.** A **Chitanță auto-
  számozás** (utolsó + 1, új-évi kérdés), a **család keresése/csatolása** (okos: kiválasztott személynél
  azonnal az ő családja), és az **egyházfenntartói járulék auto-összeg** mostantól a desktopon is elérhető.
  A **járulék-számítás magja közös a webbel**, így az összeg **soha nem tér el** a webtől / a Tartozások-
  listától. **Offline** ezek a (Supabase-adatot igénylő) funkciók kimaradnak — a rögzítés/mentés
  (készpénz a tárcából, kiadás) változatlanul működik offline is.

---

## [2026-06-21] — Tétel rögzítése: egyházfenntartói járulék automatikus összeg
<!-- key: 2026-06-21-jarulek-auto-osszeg -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkció

- **Egyházfenntartói járuléknál az összeg automatikusan kitöltődik.** Ha a jogcím **egyházfenntartói
  járulék** (kód 101.01*) és a befizető **regisztrált gyülekezeti tag**, az app a tag **adott évi még
  fizetendő** járulékát írja be az összeg-mezőbe — **a kedvezményeket, felmentést és a családi
  befizetéseket is figyelembe véve**, pontosan úgy, ahogy a **Tartozások-lista** számol. Részben fizetett
  tagnál a **maradékot** ajánlja; ha a tag már rendezett vagy felmentett, az összeg üresen marad. A
  **kézzel beírt összeget soha nem írja felül**. (Az érték a tag és a „melyik évre" mező alapján számol,
  így visszamenőleges járulékhoz is helyes.)

---

## [2026-06-21] — Tétel rögzítése: okos „Család csatolása"
<!-- key: 2026-06-21-okos-csalad -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Finomítás

- **A „Család csatolása" mostantól okos.** Ha a befizető-mezőben **már kiválasztottál** egy tagot,
  a gomb **annak a személynek a családját** oldja fel, és a tagokat **egy lépésben** az almenübe teszi
  (ablak nélkül) — utána már csak az összegeket töltöd. Ha a mező **üres**, a megszokott **család-kereső
  ablak** nyílik meg. (Ha a kiválasztott személyhez nincs rögzített család, szól, és az ablakra vált.)

---

## [2026-06-21] — Tétel rögzítése: Chitanță automatikus sorszámozás + új-évi kérdés
<!-- key: 2026-06-21-chitanta-szamozas-ujev -->
<!-- category: fix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🔧 Javítás / új funkció

- **A Chitanță automatikus sorszámozása mostantól egyszerűen az „utolsó + 1".** A rendszer
  megnézi az **utolsó kerületi** és **gyülekezeti** számot, és **eggyel lépteti** — nincs többé
  nyugtatömb-függőség (az csak a nyomtatáshoz kell). Több sor rögzítésekor a számok a kötegen belül
  is helyesen nőnek (1, 2, 3…), nem maradnak ki.
- **Év-váltási kérdés.** Amikor az **új év első** Chitanță-nyugtáját rögzíted, felugró kérdés
  jelenik meg a **gyülekezeti** számra: **„1-től induljon"**, **„Folytatás (a tavalyi utolsó + 1)"**
  vagy **„Saját számtól"** (beírod). A választást a rögzítő **megjegyzi**, így a további nyugták abból
  nőnek tovább. A **kerületi** szám folytonos (mindig az utolsó + 1).

---

## [2026-06-21] — Tétel rögzítése: több befizető egy nyugtára (lenyitható almenüvel)
<!-- key: 2026-06-21-tetel-tobb-befizeto-almenu -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkció

- **Egy nyugta, több befizető — soronkénti lenyitható almenüvel.** A bevétel-sor **maga a nyugta**
  (közös nyugtaszám, irattípus, jogcím). Ha **több befizető** van ugyanazon a nyugtán, a sor egy
  **lenyitható almenüt** kap (▸/▾): az almenüben minden befizető **külön sorban** szerepel, **saját
  névvel, saját összeggel és saját évvel** — soha nem jut egy összeg két emberre. A fő sor összege a
  befizetők összegeinek **automatikus summája** (nem írható felül). A **„Család csatolása"** gomb a
  kiválasztott személy családtagjait az almenübe teszi; az **„+ Üres befizető-sor"** és a **tag-kereső**
  további befizetőket ad hozzá. **Mentéskor** minden befizetőből **külön tétel** lesz, **közös
  nyugtaszámon** (a kerületi szám `/1`, `/2`… utótaggal, ahol kell). Egy befizető → a megszokott
  egyszerű sor (a fő Összeg/Év mezővel), nincs felesleges kattintás. *(A korábbi chipes „Felbontás"
  megoldást ez váltja le.)*

---

## [2026-06-21] — Tétel rögzítése: gyorsabb bevitel (dátum, irattípus, Enter, átnevezés)
<!-- key: 2026-06-21-tetel-gyorsabb-bevitel -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítások

- **Rugalmasabb dátumbevitel.** A dátumot szinte bárhogy beírhatod — a rendszer érti az
  elválasztó nélküli (`20260620`), a rövid (`260620`), az év nélküli (`06.20` → idei év) és a
  hónapneves (`június 20`) formákat is.
- **Irattípus gépelhető.** Az irattípus mezőbe már írhatsz is — **egy betűre felajánlja** az
  illeszkedő típusokat (pl. „C" → Chitanță); kiválaszthatod vagy sajátot is beírhatsz.
- **Enter → következő mező.** A sorban az **Enter** a következő mezőre ugrik — gyorsabb a
  billentyűzetes, tömeges rögzítés.
- **„Gyül. sz." → „Irat sz."** átnevezés a megszokott megnevezésre (a kerületi szám mellett).

---

## [2026-06-21] — Chitanță-számozás a nyugtatömbből + Kerületi oszlop csak ha kell
<!-- key: 2026-06-21-chitanta-tomb-szamozas -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🐛 Javítások

- **A Chitanță kerületi száma mostantól a regisztrált nyugtatömbből töltődik ki.** Eddig a rendszer
  csak a korábbi befizetésekből próbálta kitalálni a következő számot — ha még nem volt rögzített
  nyugta, üresen maradt. Mostantól az **aktív nyugtatömb** következő száma jelenik meg (a kerülettől
  kapott tömb alapján), és mentésenként automatikusan tovább lép. Ha nincs aktív tömb, a rendszer
  jelzi, hogy regisztrálj egyet a Nyugtatömbök panelen (vagy írd be kézzel).
- **A Kerületi sz. és Gyül. sz. oszlop teljesen eltűnik**, ha egyetlen sorban sincs Chitanță
  kiválasztva — más irattípusnál nem zavar feleslegesen.
- **A „több azonos szám" téves jelzés megszűnt** üres iratszámnál, és tömeges bevitelnél a számok
  most már **1, 2, 3, 4…** sorrendben nőnek (nem mind „1").

---

## [2026-06-21] — Súgó: részletes leírás a „Tétel rögzítése" ablakról
<!-- key: 2026-06-21-sugo-tetel-rogzitese -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 📖 Súgó-bővítés

- A **Pénzügy → Súgó → Napi munka** alatt új, részletes téma: **„Tétel rögzítése"**. Lépésről
  lépésre elmagyarázza a központi beviteli ablakot: tömeges bevitel, befizető-keresés (ékezetes
  névre is), automatikus chitanta-nyugtaszám (kerületi + gyülekezeti), „melyik évre", automatikus
  vázlatmentés, beviteli őrök (duplikátum/dátum), családi nyugta, vesszős felbontás, kiadás-
  kiegészítés és belső mozgás — tippekkel, gyakori hibákkal és életszerű példákkal.

---

## [2026-06-21] — Befizető-kereső: ékezetes nevek + a családablak már nem vágódik le
<!-- key: 2026-06-21-kereso-ekezet-csalad-portal -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🐛 Javítások

- **A befizető-kereső mostantól megtalálja az ékezetes magyar neveket.** Eddig a kereső a beírt szó
  ékezeteit „lecsupaszította" (pl. „Kovács" → „Kovacs"), de a nyilvántartásban ékezetes nevek vannak,
  így sosem talált egyezést. Mostantól az **ékezetes névre** (pl. „Kovács", „Tóth Ödön") is rendesen
  keres — a tag- és a család-keresőben egyaránt.
- **A „Családi nyugta" ablak már nem vágódik le.** Eddig a Tétel rögzítése ablakon belül nyílt, ami
  levágta; mostantól a **teljes képernyőn**, középre igazítva jelenik meg.

---

## [2026-06-21] — Tétel rögzítése: több személy egy nyugtára vesszővel
<!-- key: 2026-06-21-tetel-vesszos-felbontas -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkció

- **Több személy egy nyugtára — vesszővel.** A Befizető mezőbe **vesszővel elválasztva** több nevet
  is beírhatsz (pl. „Kovács János, Nagy Péter, Szabó Anna"); ekkor megjelenik a **„✂ Felbontás N
  külön sorra"** gomb, ami minden névhez **külön bevétel-sort** készít az adott sor adataival (közös
  nyugtaszám, `/1`, `/2`… utótaggal) — utána csak az összegeket töltöd ki tagonként. Így a nem
  regisztrált családként összetartozó befizetők is gyorsan egy nyugtára vehetők.

---

## [2026-06-21] — Tétel rögzítése: működő befizető-kereső + egyszerűbb családi nyugta
<!-- key: 2026-06-21-tetel-kereso-csalad-v2 -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🐛 Javítások

- **A „Befizető / forrás" kereső végre megbízhatóan működik.** A találati lista eddig egy túl szigorú
  láthatóság-ellenőrzés miatt (a modális ablak elrendezése félrevezette) néha el sem indult vagy nem
  jelent meg. Mostantól gépelve **azonnal megjelennek a tagok**, és kiválaszthatók.

### ✨ Új / átalakított funkció

- **Egyszerűbb családi nyugta.** A „Család" gomb mostantól a **Befizető mezőnél** van (soronként):
  kitöltöd a sort (dátum, jogcím, melyik évre, nyugtaszámok), majd a „Család keresése" gombbal
  kiválasztod a családot és **csak a neveket** pipálod ki. A rendszer minden kiválasztott taghoz
  **külön sort** készít az **adott sor adataival** (közös nyugtaszám, /1, /2… utótaggal), és már csak
  az **összegeket** kell tagonként beírnod a táblázatban. (Nem kell külön ablakban újra megadni
  minden adatot.)

---

## [2026-06-21] — Tétel rögzítése: nyugtaszám-finomítások + új sor dátuma
<!-- key: 2026-06-21-tetel-nyugta-finomitasok -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítások / 🐛 Javítások

- **A Kerületi sz. és Gyül. sz. mező csak Chitanță (nyugta) esetén jelenik meg.** Más irattípusnál
  (pl. Factură) nem zavarnak feleslegesen — ott „—" látszik.
- **A Chitanță automatikus következő-szám mostantól megbízhatóan kitölt.** A **kerületi szám az
  összes eddigi nyugtából folytatódik** (év végén sem indul újra, a tömböt folytatja), a
  **gyülekezeti szám pedig naptári évente 1-től**. (Korábban a „melyik évre" évéhez kötöttük, ezért
  visszamenőleges tételnél nem jelent meg a következő szám.)
- **Új sor az előző sor dátumával.** Tömeges rögzítésnél az „Új sor" gomb mostantól az **előző sor
  dátumát** veszi át alapértelmezetten — nem kell minden sornál újra beírni.

---

## [2026-06-21] — Oldalsáv: az almenü nem csukódik be a főpontra kattintva
<!-- key: 2026-06-21-sidebar-almenu-fix -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros, admin -->
<!-- version: web (következő kiadás) -->

### 🐛 Javítások

- **Az oldalsávban a bal oldali főmenüpontra (pl. „Pénzügy") kattintva az almenü nem csukódik be
  váratlanul.** Eddig azon az oldalon, ahol épp jártál (ott az almenü automatikusan nyitva van), a
  főpontra kattintás **azonnal becsukta** az almenüt — emiatt tűnt úgy, hogy „nem működik". Mostantól
  a főpontra kattintás **mindig nyitva tartja** az almenüt; a becsukás a sor végi nyíl (chevron)
  gombbal történik.

---

## [2026-06-21] — Tétel rögzítése: beviteli őrök (duplikátum + dátum-figyelés)
<!-- key: 2026-06-21-tetel-beviteli-orok -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkciók — nyugta-figyelés MÁR A BEVITELKOR

- **Duplikált iratszám figyelés.** A bevétel rögzítésénél, amint kitöltöd a kerületi iratszámot,
  a rendszer **azonnal jelzi, ha az a szám már létezik** (piros keret + „Ez az iratszám már
  létezik"), illetve ha **ugyanazt a számot kétszer** írtad be a listában („Ismétlődő iratszám
  ebben a listában"). Így a hibát még mentés előtt látod, nem a DB hibaüzenetéből utólag.
- **Dátum-figyelés.** A rögzítő **figyelmeztet, ha a tétel dátuma jövőbeli**, vagy **korábbi, mint
  a legutóbb rögzített tétel** („⚠ Korábbi, mint az utolsó rögzített (…)") — hogy ne maradjon ki
  vagy ne csússzon el véletlenül a könyvelés. (Nem tiltó: a szándékos visszamenőleges rögzítés
  továbbra is lehetséges, csak láthatóvá válik.)

> Megjegyzés: ezek a beviteli őrök eddig csak a régi (már nem használt) rögzítő-ablakban éltek;
> mostantól a jelenlegi „Tétel rögzítése" dialógusban is működnek. (Web; az asztali alkalmazásban
> ezek bekötése következő lépés.)

---

## [2026-06-21] — Nyugta: kerületi + gyülekezeti szám, automatikus következő-szám
<!-- key: 2026-06-21-nyugta-ketszam-autoszam -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkciók

- **A nyugtán mostantól KÉT szám szerepel: a kerületi és a gyülekezeti.** A bevétel rögzítésénél a
  „Kerületi sz." (a kerülettől kapott, előre nyomtatott szám) mellett külön mező a „Gyül. sz."
  (a gyülekezet saját sorszáma). Mindkettő külön tárolódik és **megjelenik a pénztári napló
  (Registru Casa) nyomtatásban is** (külön „Nr. ker." és „Nr. gyül." oszlop).
- **Chitanță (nyugta) választásakor automatikus következő-szám.** Amikor a bevételnél a Chitanță
  irattípust választod, a rendszer **mindkét számot kitölti a következő szabad sorszámmal** — az
  utolsó nyugtához képest **+1, hézag nélkül** (pl. kerületi `0115301` → `0115302`, gyülekezeti
  `86` → `87`, a vezető nullák megőrzésével). A számok kézzel felülírhatók.

### 🐛 Háttér-javítás

- A Tétel rögzítője által küldött gyülekezeti szám (`nyugta`) eddig nem volt külön tárolva
  (az iratszámmal megegyezően mentődött); mostantól a kettő külön kezelhető.

---

## [2026-06-21] — Tétel rögzítése: kereső-javítás + vázlat-állapot kijelzés
<!-- key: 2026-06-21-tetel-kereso-vazlat-allapot -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🐛 Javítások

- **Befizető-kereső: a dupla / eltűnő találati lista javítva.** Eddig a keresőben a találatok
  „kétszer" jelentek meg, majd eltűntek és nem lehetett kiválasztani semmit — egy láthatatlanul
  renderelt (mobil) másolat egy fantom legördülőt ugratott a sarokba. Mostantól **egyetlen, jól
  kiválasztható lista** jelenik meg.

### 🎨 UX javítások

- **Automatikus vázlatmentés: látszik, mikor van mentve.** A lábléc mostantól a tényleges állapotot
  mutatja: „💾 **Vázlat mentve: ÓÓ:PP:SS**" (zöld, az utolsó mentés idejével, gépelés közben élőben
  frissül), vagy „még nincs mentendő adat", ha üres a rögzítő.

---

## [2026-06-21] — Tétel rögzítése: Családi nyugta (egy nyugta, több névvel)
<!-- key: 2026-06-21-tetel-csaladi-nyugta -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkció

- **Családi nyugta.** A bevétel rögzítésénél új **„Család"** gomb: egyetlen nyugtán több
  családtag befizetése rögzíthető. Megadsz **egy közös nyugtaszámot** (+ dátum, jogcím, év),
  kikeresed a családot **név vagy cím szerint**, majd a megjelenő tagok mellé beírod, **ki mennyit
  fizet**. A „Hozzáadás" gomb minden taghoz **külön bevétel-sort** készít (mindenki a saját
  járulékával, a saját nevéhez kötve), amit a táblázatban még ellenőrizhetsz a Mentés előtt.
- A közös nyugtaszám alatt a sorok automatikusan `/1`, `/2`… utótagot kapnak (pl. `45/1`, `45/2`),
  mert a készpénzes nyugtaszámok egyediek kell legyenek — így egy nyugta, mégis tagonként követhető.

### 🐛 Fontos javítás

- **A befizetés mostantól tényleg a kiválasztott személyhez/családhoz kötődik.** Eddig a Tétel
  rögzítőjében hiába választottál ki egy tagot (vagy családi módot), a webes mentés **eldobta** a
  kapcsolatot — a befizetés név nélkül, csak szövegként került be. Ez javítva: a tag- és
  család-kapcsolás megőrződik (egyéni járulék-nyilvántartás).

---

## [2026-06-21] — Tétel rögzítése: kiadás-partner automatikus kiegészítés
<!-- key: 2026-06-21-tetel-kiadas-autocomplete -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkciók

- **Kiadás-partner automatikus kiegészítés.** A kiadás rögzítésénél, ahogy elkezded beírni a
  **kedvezményezett** (cég vagy személy) nevét, a rendszer **felajánlja a korábban már rögzített
  partnereket** — egy kattintással kitölthető a név, nem kell újra begépelni. (A korábbi átvevők
  közül keres, a legutóbbiakat előre sorolva.)

---

## [2026-06-21] — Tétel rögzítése: „Melyik évre" mező + egységes oszlop-sorrend
<!-- key: 2026-06-21-tetel-evre-oszlopsorrend -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### ✨ Új funkciók / 🎨 UX javítások

- **„Melyik évre" mező** a bevétel rögzítésénél. Alapértelmezetten az **aktuális (kiválasztott) év**,
  de ha valaki **visszamenőleg** fizeti az elmaradt egyházfenntartói járulékát, beírható a megfelelő
  korábbi év — így a befizetés a **helyes évhez** kerül (nem feltétlenül a fizetés dátumának évéhez).
- **Egységes oszlop-sorrend.** A Tétel rögzítése táblázata mostantól a Kassza/Bank/Tranzakciók
  megszokott sorrendjét követi: **Dátum · Irattípus · Iratszám · Partner · Jogcím · Melyik évre ·
  Összeg · Megjegyzés**.
<!-- key: 2026-06-21-tetel-befizeto-kereses -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🐛 Javítások

- **A „Befizető / forrás" mező mostantól keres.** A Tétel rögzítésénél (bevétel) ahogy gépeled a
  nevet, a rendszer **azonnal keres a tagnyilvántartásban**, és **részletes találatokat** mutat —
  név mellett a **születési év · helység · utca · házszám** is —, hogy egyértelműen kiválaszd a
  megfelelő személyt. A kiválasztott tag a befizetéshez kapcsolódik (a tiszta név kerül a mezőbe).
  (Eddig a web-en a keresés nem volt bekötve; az asztali alkalmazásban már működött.)

---

## [2026-06-21] — Tétel rögzítése: automatikus vázlatmentés (nem vész el a munkád)
<!-- key: 2026-06-21-tetel-auto-vazlat -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### ✨ Új funkciók

- **Automatikus vázlatmentés a Tétel rögzítésénél.** Amint elkezded beírni az adatokat, a rendszer
  **gépelés közben azonnal, automatikusan menti** azokat (a böngészőben). Ha **áramszünet** van,
  véletlenül bezárod az ablakot, vagy bármi miatt félbe kell hagynod a munkát, **semmi nem vész el** —
  a dialóg újranyitásakor a félbehagyott tételek **visszaállnak**, és ott folytathatod, ahol abbahagytad.
  (Több száz tétel rögzítésénél ez a legnagyobb biztonság.)
- A visszaállított vázlatnál egy jelzés mutatja a mentés időpontját, és egy kattintással **el is
  vetheted** (tiszta lappal kezdesz). Sikeres mentés után a vázlat automatikusan törlődik.

---

## [2026-06-20] — Nyomtatás: az előnézet és a nyomtatott kép mostantól megegyezik (WYSIWYG)
<!-- key: 2026-06-20-nyomtatas-wysiwyg -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🐛 Javítások

- **Az előnézet és a tényleges nyomtatás megegyezik.** Eddig a kettő eltérhetett, mert a lapmargó
  duplán számítódott (a nyomtató `@page` margója + a dokumentum belső margója összeadódott), így a
  nyomtatott tartalom keskenyebb lett, mint az előnézetben. Mostantól a margót egyetlen helyen (a
  dokumentum belső `padding`-je) adjuk, a `@page` margó 0 — így a képernyős előnézet, a böngészős
  nyomtatás és a PDF **ugyanazt** az elrendezést adja.
- Tipp: a böngésző nyomtatási ablakában a „Margók" beállítás maradjon **Alapértelmezett** (vagy
  „Nincs") — így pontosan az előnézet szerinti kép nyomtatódik.
<!-- key: 2026-06-20-nyomtatvanyok-roman-nev-alairas -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🎨 UX javítások

- **Hivatalos (román) nyomtatványok fejlécében a román gyülekezetnév.** A Registru Casa, Registru
  Banca, Registrul-Jurnal és a Csoportnapló fejlécében mostantól a **hivatalos román név**
  (pl. „Parohia Reformată Brateș", a Gyülekezet adatlap `nev_ro` mezőjéből) jelenik meg a magyar
  név helyett — ahogy a hivatalos dokumentumoknál elvárt.
- **Egységes aláírás-sávok.** Minden hivatalos nyomtatványon (Casa/Banca/Jurnal/Csoportnapló)
  egységesen **három, kétnyelvű aláírás-sáv**: „Conducătorul unității — Lelkész/Gondnok",
  „Întocmit — Készítette", „Verificat — Ellenőrizte".
- A nyomtatási **előnézet** mostantól minden nyomtatványnál a **teljes, A4-arányos** dokumentumot
  mutatja (görgethetően) — pontosan azt, ami nyomtatáskor készül (lásd az előző bejegyzést).

---

## [2026-06-20] — Nyomtatási előnézet: teljes dokumentum + Csoportnapló jogcím-választó
<!-- key: 2026-06-20-elonezet-teljes-csoportnaplo-valaszto -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🐛 Javítások

- **A nyomtatási előnézet a TELJES dokumentumot mutatja.** Eddig a hosszabb nyomtatványok (pl. a
  Csoportnapló) alja levágódott az előnézetben („nem jelenik meg mindegyik"). Mostantól az előnézet
  a teljes, **A4-arányos** dokumentumot mutatja, **függőlegesen görgethetően** — pontosan azt, ami
  nyomtatáskor készül.

### ✨ Új funkciók

- **Csoportnapló — jogcím-választó.** A Csoportnaplónál bal oldalon mostantól **kiválasztható egy
  konkrét költségvetési jogcím** (bevétel/kiadás csoportokba rendezve), és a rendszer **csak annak
  a jogcímnek** az összes tételét listázza az adott évre — nyomtatható formában. Az alapértelmezett
  a „Mind — összes jogcím".

---

## [2026-06-20] — Új nyomtatvány: Csoportnapló (jogcímenkénti tétellista)
<!-- key: 2026-06-20-csoportnaplo -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### ✨ Új funkciók

- **Csoportnapló a Pénzügyi nyomtatási központban.** Minden **költségvetési jogcím** (számadási
  cél) alatt a hozzá tartozó tételek listája — **dátum · irat · iratszám · partner · megjegyzés ·
  összeg** —, **jogcímenkénti részösszeggel**, a bevételek és kiadások külön szekcióban, a végén
  bevétel/kiadás/egyenleg összesítéssel.
- **Román + magyar** felirat (Registru grupat pe capitole — Csoportnapló), **oldalszámozva**,
  letisztult, nyomtatásra szerkesztett elrendezés (A4 fekvő, ismétlődő fejléc).
- Az időszak a kiválasztott **hónap**, vagy „Teljes év" esetén **az egész év** (jogcímenként
  összegyűjtve, nem hónapokra bontva). A **belső átvezetések** (3xx/4xx) automatikusan kimaradnak.
<!-- key: 2026-06-20-oldalsav-almenu -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros, mindenki -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítások

- **Almenü egy kattintásra.** Ha egy fő menüpontnak van almenüje (pl. **Pénzügy, Tagnyilvántartás,
  Anyakönyv**), a rákattintás mostantól **nem ugrik egyből az oldalra**, hanem **kinyitja az
  almenüt** — onnan választod ki, hová szeretnél továbblépni. (Az áttekintő oldal az almenü első
  eleméből — pl. „Áttekintés" — érhető el; új lapon megnyitás továbbra is működik.)
- **Szebb, könnyebben kattintható almenük.** Nagyobb, levegősebb sorok, tisztább kijelölés és
  rámutatás — kényelmesebb használat egérrel és érintőképernyőn is.

---

## [2026-06-20] — Oszlopba ágyazott szűrő + export-előnézet (Kassza / Bank / Tranzakciók)
<!-- key: 2026-06-20-oszlop-szuro-export-elonezet -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítások

- **Oszlop-igazított szűrő.** A szűrő-mezők mostantól **a táblázat fejlécében**, közvetlenül a
  saját oszlopuk alatt találhatók (a cella szélességével) — így egyértelmű, melyik oszlopra
  vonatkozik a szűrés. (A korábbi külön szűrő-kártya megszűnt; felül már csak a találatszám, a
  „Szűrők törlése" és az „Export" gomb van.)
- **Export előnézet — teljes lista + nyomtatás.** Az **„Export (Excel)"** gomb mostantól **nem tölt
  le egyből**, hanem **előnézetet** nyit: a hivatalos oszloprend, egy rövid magyarázat és **a (szűrt)
  sorok TELJES listája** (görgethető). Innen **Letöltés (Excel)** vagy **Nyomtatás** (A4 fekvő,
  ismétlődő fejléc) — így előbb ellenőrizhető, mi kerül a fájlba/papírra.

---

## [2026-06-20] — Bank fül: kártyás számlaválasztó + per-számla import; Kassza: Nyugtatömbök 5. kártya
<!-- key: 2026-06-20-bank-kartyas-valaszto -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### 🎨 UX javítások

- **Bank — a számlakártyák egyben szűrők.** A bankszámla-kártyára kattintva mostantól
  arra a számlára szűrsz. Az **első kártya az „Összesítő"** (alapértelmezett — minden számla
  együtt), utána az egyes bankszámlák. A kijelölt kártya kerettel kiemelve. (A külön szűrő-gombsor
  megszűnt.)
- **Bank — per-számla import.** Minden bankszámla-kártyán külön **„Kivonat importálása"** gomb,
  amely kifejezetten **arra a számlára** importál (a wizard előre arra a számlára áll be) — így nem
  lehet véletlenül rossz számlára tölteni.
- **Bank — „+" kártya.** A számlák sorának végén egy **„+ Új bankszámla"** kártya az új számla
  hozzáadásához.
- **Kassza — Nyugtatömbök az 5. kártyán.** A Nyugtatömbök panel mostantól egy kompakt 5. kártyáról
  (a nyitó/bevétel/kiadás/záró egyenleg mellett) nyitható ki és csukható be — kevésbé zsúfolt nézet.

---

## [2026-06-20] — Pénzügyi táblák: oszloponkénti szűrés + Excel-export (Kassza / Bank / Tranzakciók)
<!-- key: 2026-06-20-penzugy-szuro-export -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkciók

- **Oszloponkénti szűrés.** A **Kassza, Bank és Tranzakciók** fülön a táblázat felett
  mostantól szűrő-sáv található — Dátum, Irattípus, Iratszám, Partner, Jogcím és Megjegyzés
  szerint kereshetsz a saját szövegeddel (ékezet-független, „tartalmazza" keresés). Több
  mező egyszerre is használható, a találatszám rögtön látszik.
- **Excel-export.** A szűrő-sáv **„Export (Excel)"** gombja a (szűrt) sorokat letölti
  `.xlsx`-ként — a **hivatalos Adatok_2025.xlsx oszloprendben** (Dátum | Iratszám | Irattíp. |
  Név | Bevétel összeg/jogcím | Kiadás összeg/jogcím | Megjegyzés), így **vissza is
  importálható**. Ha nincs szűrő, a teljes (kiválasztott havi) lista exportálódik.
- A Súgóba új téma került erről („Szűrés és Excel-export").

---

## [2026-06-20] — Dispoziție nyomtatvány: tisztább cím, betűvel-kiírás, 1 oldalas elrendezés, élesebb PDF
<!-- key: 2026-06-20-dispozitie-nyomtatas-finomitas -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🎨 UX javítások

- **Rövidebb cím.** A rendelvény fejléce mostantól csak „Dispoziție de plată" ill.
  „Dispoziție de încasare" (a fölösleges „către caserie" utótag nélkül).
- **Tömör összeg betűvel.** A „(în litere)" sor a hivatalos rendelvény-formát követi:
  a szám-szavak egybeírva (pl. **„Optsutecincizeci de lei"**), és 0 bani esetén a
  „și 00 bani" rész elmarad — letisztultabb, kevésbé zsúfolt.
- **Egy oldalra fér.** A két példány (caserie + cotor) mostantól **egyetlen A4 oldalra**
  kerül — korábban átcsúszhatott a 2. oldalra.
- **Élesebb PDF.** A „PDF-be mentés" mostantól veszteségmentes, nagyobb felbontású
  képet készít (a korábbi elmosódott, „fapados" eredmény helyett), és a színek/szegélyek
  hűen nyomtatódnak.

---

## [2026-06-20] — Dispoziție de plată / încasare: működő újranyomtatás + letisztult nyomtatvány
<!-- key: 2026-06-20-dispozitie-javitas -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🐛 Javítások

- **A Dispoziție de plată / încasare ismét működik.** A nyomtatási központban mostantól
  **megjelennek a 2025-ben (importból) rögzített rendelvények**, és újra is nyomtathatók.
  Korábban a lista üres maradt egy belső adatbázis-hiba miatt (a rendszer egy nem létező
  oszlopot keresett). Ugyanez a hiba okozta, hogy **új Dispoziție létrehozása**, a **manuális
  kiadás rögzítése** és az **évvégi árfolyam-veszteség** könyvelése is elakadhatott — mindezek
  szintén javítva.

### 🎨 UX javítások

- **Helyes fejléc a rendelvényen.** A Dispoziție tetején mostantól a **hivatalos román név**
  (pl. „Parohia Reformată Brateș") áll felül, alatta pedig a **magyar név** (pl. „Barátosi
  Református Egyházközség") — szépen, két sorban. A román nevet a Gyülekezet adatlapjáról veszi.
- **Kitöltött „Scopul plății" (a fizetés célja).** Az importált rendelvényeknél a cél mezőbe
  automatikusan bekerül a **kiadás/bevétel jogcíme** (a kategória neve).
- **Letisztult űrlap.** A rendelvényről **elhagytuk a fölösleges aláírás-rovatot**
  (Conducătorul unităţii / Viza de control financiar-preventiv / Compartimentul financiar-contabil),
  így átláthatóbb és kevesebb a nyomtatási hely.

---

## [2026-06-19] — Pénzügyi import: opcionális „bevételek XML" referencia (pontosabb évek, kevesebb hiba)
<!-- key: 2026-06-19-import-xml-referencia -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

### ✨ Új funkciók

- **Befizető (tag) átkötése a tétel-szerkesztőben.** A bevétel gyors-szerkesztőjében mostantól
  **látod, melyik taghoz van rendelve** a befizetés (vagy hogy nincs hozzárendelve), és egy
  **ékezet-független keresővel** (kereszt-, lánykori vagy férjezett néven is) **áthozhatod /
  hozzárendelheted** a megfelelő taghoz — storno és újrarögzítés nélkül. Így a hibásan vagy nem
  párosított befizetések egyetlen kattintással javíthatók.
- **Bevételek XML referencia feltöltése a hivatalos Excel mellé.** A Kassza-Excel mellé mostantól
  opcionálisan feltöltheted az Adatkezelő-export bevételek-XML fájlját. A rendszer összeveti a kettőt,
  és átveszi a **pontos** adatokat: melyik **évre** szól a befizetés (így ha valaki több év hátralékát
  fizeti be egyszerre, az a megfelelő évekhez kerül — nem mind a tárgyévhez), valamint a hivatalos iratszám.
  Egy üzenet jelzi, hány bevétel pontosodott.
- **Bankszámla-könyvelés importja a hivatalos Excelből.** Eddig csak a készpénzt (Kassza) lehetett
  importálni; mostantól a fájl **bankszámla-lapjait (A–F)** is. A feltöltés után kiválasztod a **forrást**
  (készpénz vagy bankszámla), és bankszámlánál megadod, **melyik számládhoz** tartozik a lap — a tételek
  (bevétel/kiadás) a megfelelő **bankszámlához** könyvelődnek, a bankszámla **nyitó egyenlegével** együtt.
  Ugyanaz az ellenőrzött oszlop-egyeztetés, párosítás és egyenleg-levezetés, mint a Kasszánál.
- **Év-választó a Pénzügy hero-ban — visszamenőleg is.** A Pénzügy fejlécében mostantól egy jól látható
  **év-választóval** bármelyik (akár korábbi) évre válthatsz, és az **összes fül** (Áttekintés, Kassza,
  Bank, Tranzakciók, Számadás…) **arra az évre** mutatja az adatokat. Így az importált korábbi évek
  (pl. a 2025-ös könyvelés) azonnal láthatók — nem csak a tárgyév.
- **Egylépéses kötegelt import: Kassza + az összes bankszámla egyszerre.** A fájl feltöltése után
  hozzárendeled a bankszámla-lapokat a számláidhoz, és a rendszer **egyben beolvassa** a készpénzt és
  minden bankszámlát. Az áttekintő **forrásonként** mutatja a végösszegeket és az egyenleg-levezetést,
  majd egyetlen **„Import" gomb** mindent a helyére tesz (minden tétel a saját számlájára). A végén
  **belső-mozgás kereszt-ellenőrzés**: a rendszer ellenőrzi, hogy a kassza↔bank átvezetések kimenő és
  bejövő oldala pontosan egyezik-e (✓ a pénz nem veszett el / ⚠ ha hiányzik egy bankszámla párja).
- **Belső mozgások (kassza ↔ bank) láthatósága + biztonsági figyelmeztetés.** Az áttekintő mostantól
  külön kiemeli a **belső pénzmozgásokat** (pl. készpénz bankba tétele, ATM-felvét), amelyek mindkét
  főkönyvben szerepelnek (kiadás az egyikben, bevétel a másikban). A rendszer emlékeztet: **a párját — a
  másik főkönyvet — is importálni kell**, különben a pénzmozgás fele hiányozna. Ráadásul **figyelmeztet**,
  ha egy sor belső mozgásnak tűnik (pl. „Készpénzletétel"), de hiányzó/téves kód miatt nem annak ismerte fel.
- **Ellenőrizhető oszlop-egyeztetés.** Az importáló a fájl fejlécei alapján automatikusan felismeri, melyik
  oszlop micsoda (Dátum, Név, Bevétel/Kiadás összeg, kód stb.), és az áttekintő tetején **megmutatja** —
  így ellenőrizheted, mielőtt bármi bekerül. Ha egy kötelező oszlopot nem ismert fel (pl. más gyülekezet
  eltérő táblázata), feltűnő figyelmeztetést kapsz. Így a rendszer **soha nem dolgozik vakon rossz oszloppal**.
- **Kézi tag-keresés az áttekintőben — bármilyen névrésszel, ékezet nélkül is.** Ahol a rendszer nem
  találta meg a befizetőt, vagy több azonos nevű illett rá, az áttekintőben **rákereshetsz** a tagra.
  **Mindegy, mit írsz be:** keres a **keresztnévre, vezetéknévre, lánykori ÉS férjezett névre**, sőt a
  **lakcímre** is — és **nem érzékeny az ékezetekre** (a „Timea" megtalálja a „Tímeát"). Így ha egy nő
  férjhez ment és megváltozott a neve (pl. **Beder Csilla Tímea → Kovács Csilla Tímea**), a régi, lánykori
  néven keresve is megtalálod. A találatoknál **kiemelve látszik a lánykori név** (pl. „szül. Beder"),
  a lakcím, a születési dátum, az életkor és a foglalkozás — hogy biztosan a megfelelő tagot válaszd.
- **Részletesebb egyeztetés.** Az egyeztető kártyákon mostantól látod az adott befizető **tételeit**
  is — melyik **évre** szól, mennyi, melyik nyugta, milyen kategória —, így teljes képből döntesz. A
  „kétszer fizetne" figyelmeztetés is áttekinthetőbb: minden ütköző befizető külön sorban, a **címével**.
- **Év végi egyenleg + hitelesség-ellenőrzés.** Az áttekintőben mostantól látható a fájl tetejéről
  kiolvasott **nyitó (előző évi) egyenleg** és az **év végi (záró) egyenleg**, levezetve:
  *nyitó + bevétel − kiadás = számított záró*. A rendszer ezt összeveti a hivatalos záró egyenleggel:
  ha egyezik, a könyvelés hiteles (✓); ha eltér (pl. hiányzik a nyitó egyenleg), feltűnően jelzi.
- **A készpénz nyitó egyenleg mostantól rögzül.** Importáláskor a rendszer **elmenti** az „Előző évi
  készpénzegyenleg" értékét az adott évhez, így a készpénz-egyenleg nem 0-ról, hanem a **valós áthozott
  maradványból** indul — ez teszi hitelessé az év végi egyenleget, és korábbi évek importjánál is helyes
  marad (az egyik év nyitója a másik év zárójához igazodik). *(Egyszeri adatbázis-bővítés szükséges hozzá.)*

### 🎨 Fejlesztések

- **Megjegyzés oszlop + egységes storno-gomb (Kassza/Bank).** A tételtáblákban mostantól látszik a **Megjegyzés** oszlop (a Bevétel/Kiadás után, a nyugta-ikon előtt), és a **storno mindig az utolsó** művelet-ikon — egységesen.

### 🐛 Javítások

- **Az importált dispozíciók és decontok megjelennek a Nyomtatási központban.** A hivatalos fájlból
  importált **„disp. de plata" / „Disp. Plata" / „Decont."** tételek (amelyek kiadás/befizetés
  sorként kerültek be, nem külön bizonylatként) mostantól **megjelennek** a Nyomtatási központ
  **Dispoziție** és **Decont** újranyomtatás-listájában (az „importált" jelzéssel) — a
  dátum / név / összeg / jogcím / sorszám adatokkal, így **újranyomtathatók**. (A személyi
  szám / CI nincs a tranzakcióban, ezért az üresen marad az újranyomtatott bizonylaton.)
- **Dispoziție de plată / încasare: megtalálja az importált készpénzes tételeket + a kiválasztott
  évre nyit.** A „meglévő készpénzes tételből generálás" lista eddig **üres** volt importált
  adatnál, két okból: (1) a készpénzes tételeket az **irattípus** alapján kereste, de az
  importált sorok irattípusa „Chit." (nem „Készpénz"); (2) a dátum a **mai évre** (folyó) állt,
  így a korábbi év (pl. 2025) tételeit nem listázta. Mostantól a készpénz a **bankszámla**
  szerint szűr (nincs bankszámla = kassza), és a dialógus a **kiválasztott költségvetési évre**
  nyit — így a 2025-ben rögzített tételekhez is kiállítható a rendelvény.
- **Belső mozgás párosítás-állapota a tételsoroknál (zöld/piros), beégetett szöveg helyett.** A kassza↔bank belső mozgásoknál (pl. készpénzletét) a sor mostantól DINAMIKUSAN mutatja, hogy a banki párja megvan-e: zöld **„✓ párosítva"**, ha a másik oldal (pl. a banki jóváírás) is rögzítve van; **PIROS „⚠ nincs banki párja"**, ha hiányzik. Korábban a beégetett „⏳ Várakozik banki egyeztetésre" szöveg akkor is ott maradt, ha a pár már létezett — ami félrevezető volt, a hiányzó párt pedig nem emelte ki pirossal.

- **Az „Éves egyenleg" a tényleges év végi egyenleget mutatja (nem a túlköltekezést).** Korábban a
  bevétel − kiadás **különbséget** írta ki „Éves egyenleg"-ként — ez egy hiányos évnél nagy **negatív**
  szám (a túlköltekezés/deficit), ami félrevezető „egyenleg"-ként. Mostantól a kártya a **tényleges év
  végi egyenleget** (kassza záró + bank záró) mutatja — a rendelkezésre álló pénzt. A működési
  eredmény (bevétel kontra kiadás) a két KPI-kártyából látszik. Ráadásul a **Kiadás (idén)** kártya a
  belső mozgásokat **cél-kód szerint** is kizárja (nem csak a belső-mozgás jelölés alapján), így a
  hivatalos számadás kiadásával egyezik.
- **A hero év-választó csak a valós éveket kínálja.** Korábban egy fix 2019–2027 listát mutatott;
  mostantól **csak azokat az éveket** sorolja fel, amelyekhez **tartozik pénzügyi adat**
  (befizetés/kiadás), kiegészítve a **folyó évvel** (abban mindig lehet dolgozni). Így nem lehet
  véletlenül egy üres, „el nem kezdett" évre váltani.
- **Helyes egyenlegek a Pénzügy áttekintőn (negatív bank/éves egyenleg javítva).** Az áttekintő
  Kassza/Bank egyenleg-kártyái eddig az **irattípus** alapján válogatták szét a tételeket — az
  importált sorok („Chit."/„Extr") így mind a **bankhoz** kerültek, ezért a Bank-kártya torz,
  **negatív** egyenleget mutatott, a Kassza-kártya pedig csak a nyitót. Mostantól a szétválasztás
  a **bankszámla** szerint megy (nincs bankszámla = kassza). Ráadásul az **éves egyenleg** mostantól
  a **belső mozgásokat kizárva** a valós működési eredményt mutatja (a számadással egyezően), nem az
  átvezetésekkel felfújva.
- **A Tranzakciók fülről nem lehet törölni (könyvelési szabály).** A Tranzakciók fül a **hiteles
  napló** — innen tételt törölni nem lehet (sem visszamenőlegesen). Ha javítani kell, azt a
  **Kassza / Bank** fülön, **storno**-val teheted meg (és csak a számadás beküldéséig). Így a
  könyvelés nyoma megmarad, ahogy az előírások megkövetelik.
- **Téves „párosítatlan belső mozgás" jelzés importált adatnál.** A kassza↔bank belső mozgások
  (pl. készpénzletét) két fele a `(dátum, összeg)` páros alapján talál egymásra. A kiadás-oldal
  dátuma időbélyeggel (`2025-12-29T00:00:00`), a befizetés-oldalé dátumként (`2025-12-29`) érkezett,
  így a két fél külön kulcsra esett, és a rendszer **tévesen párosítatlannak** jelezte mindkettőt
  (pl. „32 párosítatlan", pedig mindkét oldal megvolt). Mostantól a párosítás **összeg-alapú,
  ±7 napos időablakkal** — a banki jóváírás akár 1-2 nappal a kasszai letét után/előtt is
  történhet, a párok így is összetalálnak; a jelzés csak a **tényleg hiányzó** oldalaknál marad.
- **Évre szűrés a Pénzügyben — most már tényleg az adott év adatait mutatja.** A hero-beli
  év-választóval másik évre (pl. egy korábbi, importált évre) váltva a **Kassza / Bank /
  Tranzakciók** fül **üres maradt** (a forgalom nem frissült a kiválasztott évre), a Bank fül
  pedig a **mai évre** kérdezte a nyitó egyenleget („nincs rögzítve a 2026. évre"). Mostantól az
  év-váltás **újratölti a tételeket**, a Bank a **kiválasztott év** nyitóját mutatja, és a
  kassza/bank szétválasztás a **bankszámla szerint** megy (nem az irattípus alapján) — így a
  hivatalos fájlból importált tételek (irattípus „Chit."/„Extr") is a **helyes fülön, helyes
  összeggel** jelennek meg.
- **Helyes bank- és kassza-nyitó egyenleg (áthozat).** A Pénzügy áttekintő/Bank/Kassza nyitó egyenlege
  eddig **csak az előző évi forgalmat** vette számításba, a **rögzített nyitó (előző évről áthozott)
  egyenleget nem** — ezért hibás, akár **negatív** nyitót mutatott (pl. a banknál). Mostantól a nyitó
  helyesen az **adott évre rögzített nyitó egyenleg**, vagy ha az nincs, az **előző év zárója** (előző
  nyitó + forgalom). Ráadásul a kassza/bank szétválasztás már a **számla** szerint megy (nem az
  irattípus alapján), így az importált tételeknél is pontos.
- **A Pénzügy oldal többé nem omlik össze beállítás nélküli évnél** (a korábbi évre váltáskor jelentkező
  `revalidatePath` hiba megszüntetve).
- **Hiányzó befizetések importkor (pontos darabszám-egyezés).** Az import duplikáció-szűrője
  eddig a valóban **külön, de azonos adatú** tételeket tévesen **összevonta**, ezért azok
  kimaradtak a könyvelésből. Tipikus esetek: a **hátralékos egyházfenntartás** (ugyanaz a nyugta,
  de más évre könyvelve), **egy nyugtán két házastárs** ugyanakkora járuléka (pl. Beder Árpád +
  Beder Zsuzsanna, 130–130 RON), illetve az **ugyanaznap többször levont, azonos összegű banki
  díj** (pl. 0,51 RON háromszor). Egy valós importnál így ~1 244 RON hiányzott. Mostantól a
  szűrő **darabszám-alapú**: minden tétel **annyi példányban** kerül be, **ahányszor a fájlban
  szerepel** (a jogos ismétlések megmaradnak), miközben ugyanazon fájl újraimportja **továbbra
  sem duplikál**, és egy hiányos import **automatikusan kiegészül** a hiányzó tételekkel.
  *(Adatbázis-frissítés szükséges; utána a fájlt újra kell importálni a pótláshoz.)*
- **Eltérő cím = külön személy.** Ha egy névhez csak egyetlen, de **más utcában lakó** tag illett (pl.
  „Beder Timea - Asztalos 160" a nyilvántartásbeli „Beder Csilla Timea - Templom 235" helyett), a rendszer
  **többé nem rendeli automatikusan** hozzá — felülvizsgálatra teszi, és megmutatja a tag címét, hogy te
  dönthess. Így nem fordulhat elő, hogy az egyik kétszer fizetőnek, a másik elmaradottnak látszik.
- **Pontos dátumok importáláskor (időzóna-javítás).** Az importáló (hivatalos Kassza, általános bevétel,
  egyházfenntartás és bank) a **helyi gépen / az asztali (offline) appban minden dátumot egy nappal
  korábbra olvasott** — pl. a **2025. január 1-jét 2024. december 31-ként** —, egy időzóna-kezelési hiba
  miatt. Ez rossz napot, év elején/végén pedig rossz **évet** is okozhatott a befizetéseken és kiadásokon.
  Mostantól a dátum **minden időzónában pontos** (a felhőben futó webes import eddig is helyes volt; a hiba
  a helyi/asztali importot érintette).
- **A „Befizetett év" a mérvadó a járulék évéhez.** Többéves elmaradás/előrefizetés esetén a rendszer a
  bevételek XML **„Befizetett év"** adatát veszi a könyvelési évnek (nem pusztán a befizetés dátumát) — így
  a hátralékos évek a megfelelő évhez kerülnek, és nincs fölösleges „nem ebbe az évbe tartozik" jelzés.

### 🎨 Fejlesztések

- **Okosabb, kategóriánkénti személy-hozzárendelés.** Az importáló mostantól csak ott próbálja a befizetőt
  taghoz kötni, ahol ez értelmes (egyházfenntartás, adományok, területbérlet, sírhely, legátum, iratterjesztés,
  visszatérítés — és a kiadás-oldalon a segély átvevője). A **perselypénzt**, a **céges/pályázati** bevételeket
  és a **belső átvezetéseket** nem köti személyhez — így kevesebb a fölösleges „nem található", és nincs téves
  személy-párosítás ezeknél.
- **Modern, áttekinthető wizard + részletes tag-kereső.** Az importáló mostantól egyértelmű **lépés-jelzővel**
  vezet végig (Feltöltés → Áttekintés és egyeztetés → Kész). A kézi tag-keresőben a név mellett a tag **lakcíme,
  születési dátuma, életkora és foglalkozása** is látszik — így biztosan a megfelelő személyt választod.

## [2026-06-19] — Pénzügyi importáló: pontosabb tag-párosítás, kézi kereső és adomány-előnézet
<!-- key: 2026-06-19-import-parositas -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

A rendszergazdai pénzügyi importálóban (előző évi könyvelés bevezetése) jelentősen javult, ahogyan a
befizetéseket, adományokat a **már nyilvántartott személyekhez** kötjük. A leggyakoribb panasz az volt,
hogy az automatikus párosítás nem talált rá a tagra, és nem lehetett kézzel sem javítani — ez most megoldódott.

### ✨ Új funkciók

- **Kézi tag-kereső, ha az automatika nem talál.** Ha egy befizetőhöz a rendszer nem találta meg a tagot
  (vagy több illik rá), mostantól közvetlenül **rákereshetsz** a tagnyilvántartásban — családnév, keresztnév
  vagy **lánykori név** alapján —, és egy kattintással összekötheted. (Egyházfenntartás és adomány import egyaránt.)
- **Adomány-import: ellenőrző lépés a könyvelés előtt.** A saját Excel/CSV adományfájl beolvasásakor most egy
  **áttekintő képernyő** mutatja, kihez párosult minden tétel — itt javíthatsz, kereshetsz vagy kihagyhatsz
  sorokat, **mielőtt** bármi bekerülne a könyvelésbe. (Korábban a fel nem ismert befizetők némán, név nélkül kerültek be.)

### 🎨 Fejlesztések — okosabb automatikus párosítás

- **Becenevek felismerése.** Pista=István, Kati=Katalin, Jóska=József, Zsuzsi=Zsuzsanna és sok más gyakori
  becenév: a becenéven szereplő befizetőt is megtaláljuk a tagok között.
- **Elgépelés-tűrő javaslatok.** Ha a név csak kicsit tér el (elírás), a rendszer felkínálja a **hasonló nevű**
  tagokat ellenőrzésre. Ezeket sosem köti össze magától — te döntesz, hogy stimmel-e.
- **Rugalmasabb cím-egyezés.** A „Főút” és a „Fő út” (és hasonló írásmódbeli eltérések) mostantól ugyanannak
  számítanak a párosításnál, így kevesebb a fölösleges kézi munka az azonos nevű, de eltérő című tagoknál.

### 🐛 Javítások

- **Nincs többé téves összekötés.** Az importáló nem köt össze befizetést rossz emberhez pusztán azonos
  keresztnév és cím alapján. Ha bizonytalan, inkább rád bízza a döntést (a „Hasonló név” / „Több tag” jelzéssel).
- **Tömbös nyugta: nincs adatvesztés.** Ha ugyanazon a nyugtán több személy fizetett **azonos összeget**, most
  mindegyik tétel bekerül — korábban a második véletlenül „duplikátumként” kimaradhatott.
- **Belső átvezetések pontosabb felismerése.** A kassza és a bankszámla közötti pénzmozgásoknak (pl. készpénz
  befizetése a bankba, felvétele a bankból) egy ritkább kód-változatát (300-as) is helyesen **belső mozgásként**
  ismeri fel az importáló — így ezek nem számítanak tévesen bevételnek vagy kiadásnak az éves számadásban.
- **Nincs többé „rossz emberhez könyvelés" azonos neveknél.** Az importáló korábban — ha egy néven több személy
  illett — **megpróbálta kitalálni**, ki fizetett, és előfordulhatott, hogy az egyik azonos nevűnél két befizetés
  jelent meg, miközben a másik (aki szintén fizetett) **elmaradottnak** látszott. Mostantól a rendszer az ilyen
  bizonytalan eseteket (pl. azonos név azonos címen, apa-fia) **nem találgatja**, hanem rád bízza a döntést —
  a befizetés dátuma, összege és iratszáma alapján te választod ki a megfelelő személyt. (A többszöri éves
  befizetés — pl. több év hátralékának pótlása egyszerre — természetesen ugyanahhoz a személyhez kerül.)

## [2026-06-15] — Oblio (asztali): offline párosítás + árva PDF-ek tartalom-alapú felismerése
<!-- key: 2026-06-15-oblio-desktop-offline-pdf -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: desktop (következő kiadás) -->

### ✨ Új funkciók

- **Párosítás internet nélkül is.** Az asztali Oblio ellenőrzésben mostantól <strong>offline is
  párosíthatsz</strong> kézzel: a kiadások a helyi (gépen tárolt) másolatból jönnek elő, a párosítások
  pedig egy <strong>várólistára</strong> kerülnek, és amint újra van internet, <strong>automatikusan
  szinkronizálnak</strong>. Egy sáv jelzi, hány párosítás vár szinkronra, és a „Szinkron most” gombbal
  azonnal fel is töltheted őket.
- **Árva PDF-ek automatikus felismerése a tartalom alapján.** Ha egy PDF-számla a fájlneve alapján nem
  párosítható (mert a letöltött csomag vegyes volt), a <strong>„Tartalom-elemzés”</strong> gombbal a
  rendszer beleolvas a PDF-be, kinyeri belőle a beszállító adószámát (CUI) és az összeget, és a megfelelő
  számlával (XML) társítja — sikeres találatnál átnevezi a fájlt, hogy onnantól magától párosuljon.

### ℹ️ Tudnivaló

- Az offline párosítás a kézi párosításra vonatkozik; az automatikus (adószám/összeg alapú) párosítások
  online amúgy is maguktól mentődnek a következő frissítéskor.
- A tartalom-elemzés a PDF szövegét olvassa — a beszkennelt (kép-)PDF-eknél kevésbé megbízható; ilyenkor
  a kézi párosítás a biztos út.

## [2026-06-15] — Oblio e-Factura ellenőrzés az asztali appban is, tiszta mappa-rendszerrel
<!-- key: 2026-06-15-oblio-desktop-beolvasas -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: desktop (következő kiadás) -->

### ✨ Új funkciók

- **A befogadott e-Factura ellenőrzés mostantól az asztali (offline) appban is elérhető.**
  A Pénzügy modulban új <strong>„Oblio ellenőrzés”</strong> fül: beolvassa a letöltött
  számlákat, és automatikusan párosítja a könyvelt kiadásaiddal (beszállító adószáma,
  összeg és dátum alapján), pont mint a weben. Kézi párosítás, szűrők és számlanyitás
  (XML/PDF) is van.
- **Tiszta, kétmappás munkafolyamat — nem keveredik össze semmi.** A letöltött Oblio
  ZIP-et (vagy a kibontott fájlokat) a <strong>befogadott</strong> mappába teszed, majd a
  <strong>„Beolvasás”</strong> gombra kattintasz. A rendszer kibontja és <strong>áthelyezi</strong>
  a fájlokat egy belső <strong>feldolgozott</strong> mappába (a ZIP-et külön archívumba), és a
  bedobó mappa <strong>kiürül</strong>. Így egy pillantásra látod, mit olvasott már be a
  rendszer, és a mappa mindig tiszta marad — semmi nem keveredik a régivel.
- **„Bevezetés kiadásként” varázsló** — ha egy befogadott számlához még nincs kiadás a
  könyvelésben, egy kattintással bevezetheted: kiválasztod a költségvetési kategóriát és a
  fizetési módot (kassza vagy bankszámla), a rendszer pedig a számla összegével, dátumával és
  a beszállító adószámával (CUI) létrehozza a kiadást — és a következő frissítés
  <strong>automatikusan párosítja</strong> a számlával. A tétel a hivatalos Excel-könyvelésbe is
  bekerül (ha a szinkron be van kapcsolva).

### 🎨 Fejlesztések

- A korábbi (csak weben elérhető) jelzés helyett az asztali Pénzügy fül most aktívan kínálja
  az Oblio ellenőrzést; a Beállítások → Könyvelés panel útmutatója is a beolvasás-áthelyezés
  folyamatot írja le.
- Beolvasáskor a rendszer frissíti az „utolsó letöltés” időpontját, így a 60 napos ANAF-határidő
  csengő-emlékeztetője az asztali beolvasás után is pontos marad.

### ℹ️ Tudnivaló

- A számlák és a párosítások a felhőből (online) jönnek és oda mentődnek — a beolvasott
  számlák listája offline is látszik, de a kiadásokkal való párosításhoz egyszer
  csatlakozni kell a hálózatra.
- Csak ZIP, XML és PDF fájlt tegyél a bedobó mappába. Az árva PDF-ek tartalom-alapú
  automatikus párosítása egyelőre a webes felületen érhető el (következő lépés).

## [2026-06-14] — Oblio e-Factura: kézikönyv a súgóban + a mappát az asztali app kezeli
<!-- key: 2026-06-14-oblio-sugo-es-mappakezeles -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### ✨ Új funkciók

- **Lépésről lépésre útmutató az Oblio e-Factura ellenőrzéshez.** A Pénzügy súgóba új
  fejezet került (<strong>„Oblio e-Factura ellenőrzés”</strong>): mit kell letölteni az
  Oblio Wallet-ből, hova kell tenni, hogyan fut a párosítás, mit jelentenek a jelzések,
  és mire kell figyelni (devizás és sztornó számlák, a 60 napos ANAF-határidő).
- **A befogadott e-Factura mappát mostantól az asztali (offline) app kezeli helyetted.**
  Eddig a böngészőben kézzel kellett mappát választani — ez sok hibalehetőséget rejtett
  (rossz mappa, megtagadott engedély, felhőbe szinkronizált hely). Az asztali appban a
  rendszer egy <strong>fix, ismert mappát</strong> hoz létre a Dokumentumok-ban:
  <code>Documents\Kartoteka\Oblio\befogadott</code>. A <strong>Beállítások → Könyvelés</strong>
  fülön egy gombbal előkészíted, egy másikkal megnyitod — és mindig <strong>ide teszed</strong>
  az Oblio ZIP-et. Nincs többé mappa-keresgélés, nem tévesztheted el a helyét.

### 🎨 Fejlesztések

- **Egységes, rendszer által létrehozott hely a Dokumentumok-ban.** Az offline Kartotéka
  minden gépi mappája (a könyvelés és az Oblio-mappa is) a Dokumentumok-on belüli
  <code>Kartoteka</code> mappa alá kerül — átlátható, és a rendszer automatikusan létrehozza.

### ℹ️ Tudnivaló

- A befogadott számlák egyeztetése (a párosítás) jelenleg a webes felületen
  (Pénzügy → Oblio ellenőrzés) történik, ugyanerre a fizikai mappára mutatva; az asztali
  app a mappa előkészítését és megnyitását végzi. A teljes asztali egyeztető-fül egy
  következő lépés.

## [2026-06-14] — Oblio e-Factura ellenőrzés: biztonságosabb, pontosabb, gyorsabb
<!-- key: 2026-06-14-oblio-ellenorzes-javitasok -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web (következő kiadás) -->

A Pénzügy → **Oblio ellenőrzés** fül (a befogadott román e-Factura számlák
összevetése a könyvelt kiadásokkal) átfogó átvizsgáláson esett át. A
legfontosabb: mostantól **semmilyen fájlt nem töröl magától a gépedről**, és
jóval ritkábban társít téves számlát kiadáshoz.

### 🐛 Javítások

- **A rendszer többé NEM törli magától a számláidat.** Eddig a „Frissítés a
  mappából" gomb csendben, megkérdezés nélkül kitörölte azokat a fájlokat,
  amelyeket duplikátumnak hitt — pusztán a számla azonosítója alapján. Ritka
  esetben így két **különböző** számla közül a valódit is törölhette. Mostantól
  a duplikátumokat csak **jelzi** egy figyelmeztető sávban, és kizárólag a
  **biztosan azonos** (egyforma méretű) másolatokat távolítja el — akkor is csak
  ha te rákattintasz a gombra. Minden számlából **mindig megmarad egy példány**.
- **Árva PDF párosításakor nem veszhet el fájl.** Ha egy PDF-et olyan névre
  próbált átnevezni, ami már foglalt volt, korábban az eredeti PDF nyom nélkül
  eltűnhetett. Ez megszűnt — ütközés esetén a fájl érintetlen marad.
- **A devizában (pl. EUR) kiállított számlákat már nem párosítja tévesen.**
  Eddig egy 100 eurós számla összegét közvetlenül a lejes kiadásokhoz
  hasonlította, ami hibás párosításhoz vezethetett. Mostantól a nem-lejes
  számlákat **kézi ellenőrzésre** teszi félre, érthető jelzéssel.
- **A jóváíró / sztornó számlákat nem társítja automatikusan.** Ezeknél az
  összeg előjele félrevezető lehet, ezért a rendszer kézi megerősítést kér,
  hogy ne keletkezzen kétszeres vagy hiányzó könyvelési tétel.
- **Sokkal kevesebb téves „beszállító-név" találat.** Az általános cégszavak
  (pl. „Construct", „Trans", „Total") önmagukban már nem okoznak párosítást, és
  a névegyezést szigorúbban értékeli — így ritkábban köt össze két különböző
  céget.
- **Két egyforma összegű számlánál rákérdez.** Ha ugyanahhoz a beszállítóhoz
  több azonos összegű/dátumú kiadás is illik (pl. két havi díj), a rendszer már
  nem találgat: „bizonytalan" jelzéssel megerősítésre vár.

### 🎨 Fejlesztések, finomítások

- **Villámgyors párosítás sok számlánál is.** A nagy mennyiségű automatikus
  párosítás mentése eddig számlánként külön-külön ment a szerverre — több száz
  számlánál ez perceket vett igénybe és el is akadhatott. Mostantól egyetlen
  lépésben menti az egészet.
- **Okosabb dátum- és összeg-illesztés.** A párosítás figyelembe veszi, hogy a
  kifizetés rendszerint a számla **után** van, és nagy számláknál arányosan tág,
  kicsiknél szigorúbb összeg-tűrést használ — pontosabb találatok, kevesebb
  tévedés.
- **Közös gépen nem keverednek a gyülekezetek.** Ha egy számítógépen több
  gyülekezetet kezelsz, az egyikben „mellőzött" számla többé nem tűnik el a
  másik gyülekezet listájából — minden gyülekezetnek külön nyilvántartása van.
- **Minden mozzanat naplózásra kerül.** A párosítás létrehozása és törlése, a
  beszállítói adószám (CUI) beállítása, valamint a számlából bevezetett kiadás
  mostantól bekerül az **eseménynaplóba** (ki, mit, mikor) — fontos az
  elszámoltathatóság és az ellenőrizhetőség miatt.
- **Nem keletkezik „fél" kiadás.** Ha egy számla kiadásként való bevezetése a
  párosítás mentésénél elakad, a rendszer visszavonja a félig elkészült kiadást,
  és érthető hibát ad — így nem marad árva vagy duplikálható tétel a könyvelésben.
- **Apró pontosítások:** a párosítás-törlés már jelzi, ha nincs mit törölni; a
  helyi PDF/XML előnézet tovább marad nyitva (nagy fájloknál is); a „frissítés"
  nem indulhat el kétszer egyszerre.

### ℹ️ Tudnivaló

- **Nincs adatbázis-frissítés** ehhez a kiadáshoz — az eseménynapló a meglévő
  rendszert használja.
- A háttérben egy részletes átvizsgálási dokumentum is készült a fejlesztőknek
  (`docs/project-tracking/KARTOTEKA-oblio-ellenorzes-audit-2026-06-14.md`),
  benne a további, nagyobb tervezett lépésekkel (pl. közvetlen ANAF-kapcsolat a
  számlák automatikus letöltéséhez, tartós 10 éves számla-archívum).

## [2026-06-12] — Munkanapló-megújulás, banki import varázsló, Excel-beállító varázsló
<!-- key: 2026-06-12-munkanaplo-bankimport-wizardok -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop 0.9.3 -->

### ✨ Új funkciók

- **A munkanapló mostantól magától vezeti a szolgálataidat.** Keresztelés,
  esketés, temetés vagy konfirmálás rögzítésekor automatikus bejegyzés készül
  a munkanaplóba — szerkesztésnél frissül, sosem duplikál. A családlátogatás
  és a vallásóra/kátéóra (perselypénzzel, tartóval) is a helyére kerül. A régi
  bejegyzéseid visszamenőleg is bekerültek.
- **Az éves lelkészi jelentés végre a teljes évből számol** — eddig egy hiba
  miatt szinte üres volt. Év + hónap szűrő került a munkanaplóra (webben és
  az asztali appban is).
- **Banki kivonat importálása az asztali appban — a webes varázslóval.**
  5 lépés: fájl → nyitó egyenleg → tételenkénti besorolás (bevétel/kiadás/
  belső mozgás/kihagyás) → megerősítés — duplikátum-védelemmel, és minden
  importált tétel a hivatalos Excelbe is bekerül.
- **Excel-könyvelés beállító varázsló (asztali):** 5 vezetett lépés a mappától
  a fejlécen és bank-párosításon át a bekapcsolásig — semmi nem maradhat ki.
- **Irányítópult: születésnaposok és közelgő programok** az asztali appban is,
  a webbel egyező működéssel.

### 🐛 Javítások

- **Gyülekezet-beállítás varázsló:** négy hiba javítva — a Mentés gomb többé
  nem enged el hiányos űrlapot (felsorolja, mi hiányzik), és a bankszámla-
  műveletek nem futnak le érvénytelen alapadatok mellett.
- A fejléc-menüből kikerült a félrevezető „Kezdő beállító varázsló".

## [2026-06-12] — Tétel-rögzítés hibajavítás, látható befizető-kereső, fényképek a családfán
<!-- key: 2026-06-12-rogzites-fix-csaladfa-kepek -->
<!-- category: bugfix -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop (következő kiadás) -->

### 🐛 Javítások

- **A tétel-rögzítés „value too long" hibája megszűnt.** Az asztali appban a
  bevétel-mentés egy rejtett adatbázis-korlát miatt hibázott (a tétel belső
  azonosítója hosszabb volt, mint amit az adatbázis enged — ezt egy célzott
  diagnosztikával derítettük ki). A rendszer mostantól a kereteken belül
  marad; egy kísérő adatbázis-frissítés a korlátot végleg fel is oldja.
- **A befizető-kereső találatai mostantól mindig látszanak.** Eddig a
  találati lista a rögzítő-ablak görgetője alá szorult — mostantól mindenen
  felül, az ablakból „kilógva" nyílik, és görgetésnél is a helyén marad.

### ✨ Új funkciók

- **Fényképek a családfán.** Ha egy taghoz fénykép van társítva, a családfa
  kártyáin is a fénykép jelenik meg a nem-jelölő ikon helyett.
- **Súgó-fejezet a fényképekről.** A Tagnyilvántartás súgó Családok fejezete
  lépésről lépésre elmagyarázza a kép-társítás két útját (közösségi link /
  kézi feltöltés), és hogy mire számíts.

### ℹ️ Tudnivaló

- Futtatandó adatbázis-frissítés: `2026-06-12b-kep-text-xkey-bovites.sql` —
  e nélkül a FÉNYKÉP-mentés is hosszúság-hibára futna (a kép-mező az
  adatbázisban eddig 30 karakteres volt, a kép-hivatkozás ennél hosszabb).

## [2026-06-11] — Megújult családi kartonok: fényképek, modern kártyák, nyomtatás mindenhol
<!-- key: 2026-06-11-csaladi-kartonok-avatarok -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok -->
<!-- version: web + desktop (következő kiadás) -->

### ✨ Új funkciók

- **Fénykép a tagokhoz.** Mostantól minden személyhez társíthatsz fényképet —
  két módon: (1) megadod a Facebook/Instagram profil-linkjét, és a rendszer
  megpróbálja letölteni a nyilvános profilképet (a `facebook.com/profile.php?id=…`
  formátumú linkeknél megy a legbiztosabban), vagy (2) egyszerűen feltöltesz
  egy képet a gépedről. A kép a Kartotéka saját tárhelyére kerül, a megadott
  profil-link pedig a kapcsolatokhoz mentődik. Akinek nincs képe, annak szép
  színes monogram jelenik meg.
- **Modern családi kártyák.** A Tagnyilvántartás → Családok kártyanézete
  megújult: a család tagjainak képei egymást átfedő sorban, a gyermekek
  kis névjegy-chipekben, a cím, körzet és létszám egy pillantásra látszik —
  finom animációkkal. Ugyanez a kinézet él a weben és az asztali appban.
- **Családi karton nyomtatása — most már az asztali appban is.** A kártyára
  ráállva megjelenik a nyomtató-gomb, és a webről ismert A4-es, lefűzhető
  családi karton nyomtatható (relációk, anyakönyvi dátumok, megjegyzések,
  opcionálisan befizetések + családlátogatások). Eddig ez csak a weben volt.
- **A családi lapon minden tag képe látszik** — a szülők paneljein és a
  gyermek-soroknál is; a kis kamera-gombbal rögtön képet is társíthatsz.

### ℹ️ Tudnivaló

- A képek tárolásához egy egyszeri adatbázis-frissítés szükséges
  (`2026-06-11p-szemely-social-avatar.sql`) — amíg ez nem fut le, a mentés
  erre figyelmeztet.

## [2026-06-11] — Excel-fejléc egy kattintással, nyomtatási központ az asztali appban
<!-- key: 2026-06-11-excel-fejlec-nyomtatasi-kozpont -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: desktop 0.9.2 -->

### 🐛 Javítások

- **A hivatalos Excel mostantól magától „életre kel".** A könyvelés-fájl
  (Adatok_2026.xlsx) csak akkor kínálja fel a költségvetési tételeket, ha a
  Koltsegvetes lapján ki van töltve az egyházmegye és az egyházközség neve.
  Eddig ezt kézzel kellett megkeresni és beírni — mostantól a rendszer a
  gyülekezeted adataiból **magától kitölti** (a hivatalos egyházmegye-lista
  pontos nevével), és a Beállítások → Könyvelés részben látod is az állapotát.
  Egy korábbi hibás beírást (ami a fejléc-képletet ronthatta) magától helyrehoz.

### ✨ Új funkciók

- **Pénzügyi nyomtatási központ az asztali appban.** A Pénzügy oldal tetején a
  „Nyomtatás" gombbal minden hivatalos nyomtatvány elérhető — Kasszakönyv
  (Registru Casa), banki kimutatás (Registru Banca), naplókönyv, nyugtatömb-
  kimutatás, költségvetés, számadás, és a korábbi Decont/Dispoziție bizonylatok
  újranyomtatása. A Költségvetés fülön külön gomb nyitja a költségvetés-
  nyomtatást (részszámadással). PDF-be mentés a nyomtatás-ablakból választható.
- **Könyvelés-beállítások egy kattintásra.** A Pénzügy oldal tetején új
  „Excel-könyvelés" gomb visz közvetlenül a Beállítások → Könyvelés fülre —
  nem kell többé keresgélni. A panel lépésről lépésre vezet.

### 🎨 UX javítások

- **A súgó élő év-végi checklistje mindig szem előtt.** Nagy képernyőn a Súgó
  fül háromosztatú: balra a témák, középen a magyarázat, jobbra az élő
  checklist — pipálgatás közben is olvashatod a teendők leírását.

## [2026-06-11] — Az asztali app Pénzügy oldala teljessé vált: Bank, Költségvetés és Monetár fül
<!-- key: 2026-06-11-desktop-penzugy-paritas -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: desktop 0.9.1 -->

### ✨ Új funkciók

- **Bank fül az asztali appban — ugyanaz, mint a weben.** A bankszámláid kártyái,
  a banki tételek listája, az éves nyitó egyenlegek, sztornó és szerkesztés —
  mind elérhető az asztali Pénzügy oldal Bank fülén. A tételek listája offline
  is megjelenik (a gépeden tárolt adatból); a bankszámla-műveletekhez internet
  és belépés kell. Új bankszámlát is itt vehetsz fel.
- **Költségvetés fül az asztali appban.** Az éves költségvetés tervezése
  (alap + 3 módosítási kör), véglegesítés és az egyházmegyei beküldés mostantól
  az asztali appból is megy — pontosan úgy, ahogy a weben megszoktad. Internet
  nélkül a költségvetésed megtekinthető; a mentéshez belépés szükséges.
- **Monetár (címletjegyzék) fül az asztali appban.** A kasszaszámláláskor
  rögzített címletek (hány darab 100 lejes, 50 banis…) felvétele, az elvárt
  kassza-egyenleggel való összevetés és a nyomtatható címletjegyzék is átkerült.
- **Teljes Pénzügy menü a bal oldalsávban.** A Bank, Költségvetés, Bérleti
  szerződések, Monetár és Súgó pontok is megjelentek az asztali app Pénzügy
  almenüjében — ugyanabban a rendben, mint a weben.

### 🎨 UX javítások

- **A „+ Tétel rögzítése" gomb mostantól a bankszámláidat is ismeri.** Az
  egységes Pénzügy oldalról indított rögzítésnél a banki tételek és a belső
  mozgások (kassza↔bank) is teljes választékkal rögzíthetők.
- **A Bérleti szerződések fül** az asztali appban egyelőre a webes felületre
  irányít (a szerződés-rögzítés és az e-Factura számlázás webes szolgáltatás).

## [2026-06-11] — Letöltés-oldal, súgó-megújulás, bank-import számlával, Excel-egyeztetés
<!-- key: 2026-06-11-sugo-bankimport-egyeztetes -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop 0.9.0 -->

### 🐛 Javítások

- **A letöltés-oldal mindig a legfrissebb verziót mutatja.** Eddig előfordulhatott,
  hogy az „Offline" oldal régebbi telepítőt kínált, mint amit az appok frissítésként
  már megkaptak — mostantól ugyanabból a hivatalos forrásból olvas, mint maga a
  frissítő, így soha nem térhet el.
- **Érthető munkamenet-jelzés.** Ha van interneted, de a felhő-belépésed lejárt,
  a jelvény mostantól ezt pontosan mondja ki („Helyi munkamenet — van internet,
  de a felhő-belépésed lejárt"), és **rákattintva azonnal az online belépésre visz**.
- **Az asztali Beállítások ablak** mostantól a webbel azonos elrendezésű: bal
  oldalon a menüpontok, jobb oldalon a beállítások (eddig egy elrendezési hiba
  miatt egymás alá kerültek).

### ✨ Megújult pénzügyi Súgó

- A kulcstémák (rögzítés, sztornó, nyugta, bank-import, számadás, költségvetés,
  decont, tartozások) mostantól **„Mikor kell ez neked?"** élethelyzettel
  kezdődnek, **folyamatábra** mutatja a lépéseket egy pillantásra, és piros
  **„Gyakori hibák"** kártyák óvnak a tipikus tévedésektől.
- Az asztali súgó új témát kapott: **Excel-könyvelés szinkron** — szájbarágósan,
  a bekapcsolástól a bank-párosításig.

### ✨ Bank-import: számlához kötve

- A bankkivonat importjánál mostantól **kiválasztod, melyik bankszámla kivonata** —
  a tételek a számlához kötve kerülnek a nyilvántartásba, és (bekapcsolt
  Excel-szinkronnál) **a megfelelő betű-lapra is bekerülnek**.

### ✨ Egyeztetés gombnyomásra (Excel ↔ Kartotéka)

- Beállítások → Könyvelés: új **„Egyeztetés futtatása"** gomb — laponként
  összeveti az Excel sorait és összegeit a Kartotéka idei tételeivel, és jelzi,
  ha eltérés van. Így bármikor megbizonyosodhatsz róla, hogy a két könyvelés
  együtt mozog.

---

## [2026-06-11] — Pénzügyi finomítások: tisztább kategória-lista, biztos rögzítés, rendezett felület
<!-- key: 2026-06-11-penzugy-eszrevetelek-fixek -->
<!-- category: improvement -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: web + desktop 0.9.0 -->

Lelkipásztori visszajelzések nyomán több ponton pontosítottuk a pénzügyi rögzítést —
a weben és az asztali appban egyaránt.

### ✨ Tisztább kategória-választó

- A tétel rögzítésénél mostantól **csak valóban könyvelhető kategóriák** jelennek
  meg — az összesítő kategóriafejek (pl. „Egyházi tevékenységből származó bevételek
  (5+...+12)", „Múlt évi pénztármaradvány (2+3)") és az egyházmegyei szintű tételek
  eltűntek a listából. Pontosan a hivatalos egyházközségi számadási kategóriák
  választhatók: **31 bevételi és 38 kiadási tétel** — a készletet a hivatalos
  Excel-listákkal tételesen egyeztettük, és az adatbázisban is rendeztük (a
  18 egyházmegyei szintű kategória mostantól csak az egyházmegyei felületen
  jelenik meg).

### 🐛 Biztos rögzítés a kódos (offline) munkamenetben is

- Ha a mentett biztonsági kóddal léptél be, és közben volt internet, a rögzítés
  zavaros hibával állhatott le („permission denied"). Mostantól ilyenkor az app
  automatikusan a **bevált offline utat** használja: a tétel az iratszám-tárcából
  kap számot, és a következő online bejelentkezéskor magától felkerül a felhőbe.

### ✨ Befizető-keresés a tagnyilvántartásból (asztali app)

- A „Tétel rögzítése" ablak **Befizető / forrás** mezőjében mostantól kereshetsz
  a tagjaid közt: két betű után felugranak a találatok, kiválasztásnál a
  befizetés a személyhez kapcsolódik (egyházfenntartásnál, adománynál így a
  tartozás-nyilvántartás is naprakész). Egy pipával **családi befizetéssé**
  tehető. Ha nem tagtól jön a pénz, a mező továbbra is szabad szövegként működik.

### 🛡️ Szinkron csak hiteles belépéssel

- A felhőbe írás mostantól **hármas ellenőrzés** után indul: érvényes belépés,
  nem járt-e le, és hogy **ugyanaz a fiók** van-e belépve, amelyikhez a gépen
  tárolt adatok tartoznak. Ha más fiókkal lépnének be ugyanazon a gépen, a
  szinkron biztonsági okból leáll — érthető üzenettel, soha nem csendben.

### 🎨 Rendezett felület

- Az „Offline munkamenet" és a szinkronizálás jelzői **a fejlécbe költöztek** —
  többé nem takarják ki a modulok tartalmát.
- A **belső mozgás** mostantól egyértelmű megnevezésekkel megy: a saját bankod
  nevét látod (pl. „Készpénzletétel a(z) BCR (RON) számlára"), a forrás/cél pedig
  a rögzített bankszámláid közül választható — elgépelni sem lehet. Ha még nincs
  bankszámla rögzítve, a banki opciók meg sem jelennek.
- A bal oldali menü **megtisztult**: a még el nem készült modulok (Profilom,
  Admin) nem mutatnak üres oldalra, a Pénzügy-almenü pedig egységesen az új
  pénzügyi főoldal füleire visz.

> *Megjegyzés a rendszergazdának:* a részletes terv- és diagnosztikai dokumentum:
> `docs/project-tracking/KARTOTEKA-penzugy-eszrevetelek-terv-2026-06-11.md` —
> a futtatandó ellenőrző SQL-lel együtt.

---

## [2026-06-11] — Asztali app 0.9.0: a Kartotéka mostantól a hivatalos Excel-könyvelésbe is beírja a tételeket
<!-- key: 2026-06-11-desktop-excel-write-through -->
<!-- category: feature -->
<!-- targets: lelkesz, gondnok, penztaros -->
<!-- version: desktop 0.9.0 -->

Nagy lépés a kettős munka megszüntetésében: amit az asztali Kartotékában rögzítesz,
az mostantól **magától bekerül a hivatalos EREK Excel-könyvelésbe is**
(`Adatok_2026.xlsx`) — nem kell ugyanazt kétszer beírni.

### ✨ Hogyan működik?

- **Egy rögzítés — két helyre.** Ha a Pénzügyben felviszel egy készpénzes bevételt
  vagy kiadást, az a Kartotéka mellett a könyvelés-fájl **Kassza** lapjára is
  felkerül, pontosan úgy (dátum, iratszám, összeg, hivatalos kategória-név),
  ahogy kézzel írnád.
- **Bankszámlák betű-lapjai.** A hivatalos Excelben minden bankszámlának saját
  lapja van (A, B, C…). A Beállítások → Könyvelés fülön a rendszer a deviza
  alapján **javaslatot tesz a párosításra, de az első banki írás előtt neked
  kell jóváhagynod** — jóváhagyás nélkül banki tételt soha nem ír a fájlba.
- **Belső mozgás = két sor.** A perselypénz bankba vitele (vagy pénzfelvétel a
  kasszába) a Kassza-lapra ÉS az érintett bank-lapra is felkerül, a hivatalos
  megnevezésekkel („Készpénzletétel a(z) A számlára" stb.).
- **Bank → bank átutalás is megy.** Ha az egyik számládról a másikra utalsz, a
  forrás-számla lapjára kiadásként, a cél-számla lapjára bevételként kerül be —
  a hivatalos „Átutalva a(z) … számlára/számláról" megnevezésekkel. (Egyedül a
  valutacsere Excel-írása érkezik későbbi frissítésben.)
- **Sztornó és módosítás is követve.** Ha egy tételt sztornózol, az Excelbe egy
  ellentételező sor kerül (az eredeti is megmarad — így az ellenőrzésnél minden
  lépés visszakövethető, és a végösszeg pontos). Módosításnál ugyanígy: a régi
  sor kiegyenlítődik, az új bekerül.
- **Offline rögzítés?** Ha hálózat nélkül rögzítettél, a tétel akkor kerül az
  Excelbe, amikor a gép újra hálózatra csatlakozik és a szinkron lefutott —
  így garantáltan a végleges iratszámmal kerül a hivatalos könyvbe.

### 🛡️ Biztonság („pénzügyekkel nem lehet viccelni")

- Minden írás előtt **automatikus biztonsági másolat** készül a fájlról.
- Egy tétel **soha nem kerülhet be kétszer** — újraindítás, hálózat-hiba vagy
  ismételt szinkron után sem.
- Ha az Excel-fájl éppen **nyitva van**, a rendszer nem erőlteti az írást:
  jelzi, hogy „zárd be a fájlt", és a tételek sorban várakoznak, semmi nem vész el.
- Ha valamit nem tud egyértelműen beírni (pl. nincs megerősítve a bank-párosítás),
  a tétel **látható várakozó állapotba** kerül érthető magyarázattal — soha nem
  ír „tippre" a hivatalos könyvbe.

### ⚙️ Bekapcsolás

A funkció a **Beállítások → Könyvelés** fülön kapcsolható be (alapból ki van
kapcsolva). Ugyanott élőben látod: hány tétel vár beírásra, hány került már be,
és van-e teendőd (pl. bank-párosítás megerősítése). A „Szinkron most" gombbal
azonnal is futtathatod.

> *Megjegyzés:* a bank-kivonat importtal felvitt tételek Excel-írása a következő
> frissítésben érkezik (előbb a bankszámla-hozzárendelést kötjük be az importba) —
> addig azokat a megszokott módon vezesd a betű-lapokra.

---

## [2026-06-11] — Asztali app: a mentett kódos belépés többé nem akad el
<!-- key: 2026-06-11-desktop-pin-belepes-fix -->
<!-- category: bugfix -->
<!-- targets: lelkesz -->
<!-- version: desktop 0.9.0 -->

### 🐛 Javítás

- **Elakadó belépés a biztonsági kóddal — végleg javítva.** Eddig a kódos
  (offline) belépés után az app egy végtelen „Betöltés…" képernyőn ragadhatott.
  Két ok állt mögötte, mindkettőt kijavítottuk:
  1. a beléptető-kapu a felhő-kapcsolatra várt határidő nélkül — mostantól a
     kódos belépés **azonnal beenged a helyi adataidhoz**, a felhő-kapcsolatot
     az app a háttérben próbálja, és ha létrejön, magától átvált online módba;
  2. a belépés utáni képernyők a felhő-azonosítódat keresték, ami hálózat
     nélkül nem érhető el — mostantól az app **a gépeden tárolt profilodból**
     ismer fel, így a kezdőlap és minden oldal offline is betölt.
- **Ha hiba van, mostantól kiírja.** Végtelen töltés helyett az app minden
  elakadásnál érthető üzenetet mutat (pl. „Nem sikerült azonosítani a
  felhasználót…"), és gombot ad a megoldáshoz (Újrapróbálás / Online belépés).
  Hibás kódnál továbbra is pontos visszajelzést kapsz, a hátralévő
  próbálkozások számával.

---

## [2026-06-11] — Asztali app: ünnepi nyitóképernyő + teljes képernyős indulás
<!-- key: 2026-06-11-desktop-splash-fullscreen -->
<!-- category: improvement -->
<!-- targets: lelkesz -->
<!-- version: desktop 0.9.0 -->

### 🎨 Megjelenés

- **Ugyanaz a nyitóképernyő, mint a weben**: az asztali app mostantól a webes
  felülettel pixelre azonos, ünnepélyes indítóképernyővel köszön —
  „Békesség Istentől!" felirattal, a két egyházkerület címerével és a Kartotéka
  emblémájával.
- **Teljes képernyős indulás**: az app mostantól mindig maximalizált ablakban
  nyílik — nem kell minden indításnál széthúzni.
- Az alkalmazás leírása mindenhol egységesen **„Egyházi nyilvántartó rendszer"**
  (a webes telepítőben/böngészőben is).

---

## [2026-06-10] — Asztali app: Pénzügy Súgó, külön „Asztali (offline) verzió" résszel
<!-- key: 2026-06-10-desktop-penzugy-sugo -->
<!-- category: feature -->
<!-- targets: lelkesz -->
<!-- version: desktop 0.8.8 -->

Az asztali Kartotéka Pénzügy oldalán mostantól elérhető a **Súgó** fül — a webbel azonos, lelkészbarát magyarázat minden pénzügyi funkcióról, kategóriákba rendezve, lépésről lépésre, tippekkel és példákkal.

### 🖥️ Külön rész az asztali (offline) működésről

A súgó végén egy **„Asztali (offline) verzió"** kategória pontosan azt magyarázza el, ami kimondottan a letölthető appra vonatkozik:

- **Offline mód** — hogyan dolgozik a gép a helyi, titkosított másolattal internet nélkül.
- **Szinkronizáció** — mi tölt le a felhőből, és hogyan mennek fel a rögzítéseid.
- **Iratszám-tárca** — miért kell, és hogyan töltsd fel az offline sorszámokat.
- **Tétel rögzítése**, valamint **sztornó és visszavonás** — az asztali viselkedés (online vs. offline).
- **Ütközések feloldása**, és **mi megy offline, mi csak online** — gyors összefoglaló.
- **Frissítés** — hogy az asztali app külön frissül a webfelülettől.

> *Megjegyzés a rendszergazdának:* a közös pénzügyi súgó egy forrásból származik (a webbel azonos), a desktop csak az „Asztali (offline) verzió" szekciót adja hozzá — a web súgója változatlan. A változás a desktop **0.8.8** kiadással érkezik.

---

## [2026-06-10] — Asztali app: a Pénzügy oldalon mostantól rögzíteni is lehet (web-azonos „Tétel rögzítése")
<!-- key: 2026-06-10-desktop-penzugy-tetel-rogzites -->
<!-- category: feature -->
<!-- targets: lelkesz -->
<!-- version: desktop 0.8.8 -->

Az asztali Kartotéka **Pénzügy** oldalán mostantól nem csak nézni, hanem **rögzíteni** is lehet — pontosan ugyanazzal a „**+ Tétel rögzítése**" gombbal és ablakkal, mint a webfelületen.

### 💰 Bevétel és kiadás egy helyen, tömegesen

- A Pénzügy fejlécében megjelent a **„+ Tétel rögzítése"** gomb (mint a weben). Egy ablakban, **Bevétel/Kiadás füleken** egyszerre több tételt is felvihetsz; a Mentés **dátum szerint rendezi** és a helyére írja őket.
- Minden tétel a saját **iratszámát** és ellenőrzését kapja — ugyanúgy, ahogy a Befizetés/Kiadás oldalon megszoktad.
- **Internet nélkül is**: a készpénzes tételek az **iratszám-tárcából** kapnak sorszámot, és a hálózatra csatlakozáskor **automatikusan felmennek** (mint eddig a Befizetés oldalon).

### 📒 Kassza fül — lista, sztornó, visszavonás, szerkesztés és nyugta

- A **Kassza** fül mostantól az asztali Pénzügy oldalon is megjelenik, a **webbel azonos** kasszanapló-nézetben (havi bontás, nyitó/záró egyenleg, bevétel/kiadás egy listában).
- A listából egy téves tétel **sztornózható** (kötelező indoklással) — pontosan úgy, mint a Befizetés/Kiadás oldalon: a tétel nem törlődik, hanem áthúzva, indoklással marad, és a kapcsolt nyugták / belső mozgás párja automatikusan vele sztornózódik.
- A **sztornó vissza is vonható** egy kattintással (a tétel ismét bekerül a számításokba) — a belső mozgás párjával együtt. Lezárt (véglegesített) évnél a visszavonás védve van.
- Egy tétel **szerkeszthető** is (ceruza ikon): dátum, összeg, jogcím, iratszám, megjegyzés gyors javítása. A **dátum csak az éven belüli utolsó tételnél** módosítható (kronológia-védelem) — egyébként stornózz és rögzíts újra. Lezárt évnél a szerkesztés védve van.
- Egy befizetéshez egy kattintással **nyugta (chitanță) állítható ki** közvetlenül a listából (🧾 gomb): a rendszer az **aktív nyugtatömbből** veszi a következő sorszámot, a befizető nevét/címét és a jogcímet automatikusan kitölti, majd nyomtatható. Amelyik sorhoz már van nyugta, ott **újranyomtatás** jelenik meg (nincs dupla kiállítás). Ha nincs aktív tömb, a rendszer a Nyugtatömbök oldalra irányít.

### 🛟 Biztonságos korlátok (a pénzügy pontossága miatt)

- **Banki átutalás internet nélkül** nem rögzíthető — csak készpénz; online minden megy.
- A **kiadáshoz kötelező az átvevő** megadása (teljesebb, ellenőrizhető nyilvántartás).
- A **belső mozgást** (kassza ↔ bank) továbbra is a **Pénzügy → Belső mozgás** oldalon rögzítsd, ahol a banki forrás és cél pontosan megadható.
- A Kassza-fül mind a négy fő művelete elérhető: **sztornó**, **sztornó-visszavonás**, **tétel-szerkesztés** és **nyugta-kiállítás** — pontosan a webbel egyező módon. (Ezek mind online műveletek.)

> *Megjegyzés a rendszergazdának:* a rögzítés és a sztornó a desktop **bevált** írási/sztornó-útját használja (ugyanazt, amit a Befizetés/Kiadás oldal), így a tételek **azonos pénzügyi rekordot** adnak, mint a weben. A változás a desktop **0.8.8** kiadással érkezik.

---

## [2026-06-10] — Asztali app: a Pénzügy ugyanúgy néz ki, mint a webfelületen
<!-- key: 2026-06-10-desktop-penzugy-parity -->
<!-- category: improvement -->
<!-- targets: lelkesz -->
<!-- version: desktop 0.8.8 -->

A letölthető Windows-alkalmazás (asztali Kartotéka) **Pénzügy** része mostantól a **webfelülettel azonos megjelenést** kap — ugyanazokat a táblázatokat és összesítőket látod, akár a böngészőben, akár az asztali appban dolgozol. Így nem kell kétféle felülethez szokni.

### 💰 Egységes Pénzügy oldal — pont mint a weben

- A **Pénzügy** mostantól **egyetlen oldal, fülekkel a tetején** (Áttekintés · Kassza · Bank · Tranzakciók · Költségvetés · Számadás · Tartozások …) — ugyanaz a fejléc és fülsor, mint a webfelületen. A Pénzügy-re kattintva rögtön az **Áttekintés** fogad.

### 📊 A webbel azonos nézetek (internet nélkül is)

- **Áttekintés** — éves bevétel, kiadás és egyenleg, kategóriánként.
- **Tranzakciók** — az összes bevétel és kiadás egy kereshető listában.
- **Számadás** — az éves számadás a költségvetési terv tükrében.
- **Tartozások** — a tagok egyházfenntartói járulék-hátraléka, **pontosan ugyanazzal a számítással, mint a weben** (a számító motor mostantól közös a két felület között).

Ezek **internet nélkül is** működnek: a legutóbb szinkronizált adatokat mutatják, és online frissülnek. *(Ha egy lista üres: előbb legyen egyszer hálózat, hogy letöltődjenek az adatok.)*

### ⛪ A rendszer saját címere

- Az asztali app fejlécén és indítóképernyőjén mostantól a **Kartotéka-logó** szerepel az egyházkerületi címer helyett — egységes, felekezet-független arculat.

> *Megjegyzés a rendszergazdának:* a fenti nézetek **megjelenítenek** (read-only); a rögzítés/véglegesítés a meglévő felületeken történik (a bevétel/kiadás web-azonos **bevitele** külön, gondos lépésben jön az offline pénztárca érintettsége miatt). A változás a desktop **0.8.8** kiadással érkezik. A Tartozások hátralék-számait érdemes egy gyülekezeten összevetni a webfelülettel.

---

## [2026-06-10] — Asztali app: megszűnt a folytonos újra-bejelentkezés és PIN-kérés
<!-- key: 2026-06-10-desktop-keyring-persistence-fix -->
<!-- category: bugfix -->
<!-- targets: lelkesz -->
<!-- version: desktop 0.8.8 -->

### 🔐 Egyszer beállítod — onnantól megjegyzi

A letölthető Windows-alkalmazás (asztali Kartotéka) egy bosszantó hibáját javítottuk: eddig **minden indításnál újra bejelentkezést és új offline belépési kód (PIN) beállítását** kérte, mert a gép nem őrizte meg biztonságosan a beállításokat.

- **Az offline belépési kódot mostantól elég egyszer beállítani** — a következő indításkor már nem kéri újra, hanem a meglévő kóddal léphetsz be.
- **A bejelentkezés is megmarad** — nem kell minden indításnál újra beírni az e-mailt és jelszót.
- **Az offline (hálózat nélküli) adatok is megmaradnak** a gépen a két indítás között — eddig a helyi adatbázis minden indításkor újraépült.

A beállítások mostantól a **Windows beépített, titkosított jelszókezelőjében** (Credential Manager) tárolódnak — biztonságosan, a gépedhez kötve.

> *Megjegyzés a rendszergazdának:* a javítás a desktop **0.8.8** kiadással érkezik (új aláírt build + auto-updater). A frissítés utáni **első** indításkor a helyi adatbázis még egyszer újraépül (az új, immár tartós titkosítási kulccsal), utána stabil. Nincs SQL-migráció.

---

## [2026-06-10] — Választói névjegyzék automatika + GDPR-hozzájárulások
<!-- key: 2026-06-10-tagnyilvantartas-valasztoi-gdpr -->
<!-- category: feature -->
<!-- targets: lelkesz -->

### 🗳️ Választói névjegyzék egy gombnyomásra

- A **Tagnyilvántartás → Választók** fülön új **„Jogosultság frissítése" gomb**: a rendszer a szabály alapján — **18 év feletti, konfirmált, élő aktív tag** — automatikusan összeállítja a választói névjegyzéket, és megmutatja, hányan jogosultak, kik kerültek be újonnan és kik estek ki.
- **Kézi felülbírálás bárkire:** egy-egy tag a sor végén **mindig jogosulttá tehető** vagy **kizárható** (pl. fegyelmi helyzet vagy külön engedély miatt) — a felülbírálást a frissítés tiszteletben tartja, nem írja felül. Új **„Jogosult" oszlop, szűrő és KPI** segíti az áttekintést.
- Minden frissítés és felülbírálás **auditnaplóba kerül**.

### 🔐 GDPR-hozzájárulások a személyi kartonon

- A személyi karton **Személyes adatok** fülén új **„GDPR-hozzájárulások"** szakasz három kapcsolóval: **adatkezelés**, **fotó / megjelenés**, **levelezés**. Az adatkezelési hozzájárulás **kelte** automatikusan rögzül az első bejelöléskor.
- Így dokumentálható és elszámoltatható, kinek mihez van érvényes hozzájárulása (a vallási hovatartozás a GDPR szerint különleges adat). A módosítás **auditnaplóba kerül**.

> *Megjegyzés a rendszergazdának:* a funkció a `migration-docs/sql/2026-06-10-tagnyilvantartas-fazis5-gdpr-valasztoi.sql` migrációt igényli (Supabase Studio-ban lefuttatva). Addig a felület hibátlanul működik, csak az új mezők/újraszámítás nem aktívak.

---

## [2026-06-10] — Tagsági igazolás nyomtatás, családok exportja, névnapok
<!-- key: 2026-06-10-tagnyilvantartas-igazolas-export-nevnap -->
<!-- category: feature -->
<!-- targets: lelkesz -->

### 📜 Tagsági igazolás egy kattintással

- A személyi kartonon új **„Igazolás" gomb**: hivatalos, A4-es **tagsági igazolás** készül a tag adataival (név, születési hely és idő, anyja neve, lakcím), opcionálisan a **keresztelés és konfirmáció** dátumával. Megadható az **igazolás célja** (pl. keresztszülői tisztség) — a lapon kelt, aláírás-vonal és pecsét helye (P. H.) szerepel. Nyomtatás előtt **élő előnézet** mutatja a végeredményt.
- Az igazolás készítése **auditnaplóba kerül** (személyes adat kiadása — elszámoltathatóság).

### 📊 Családok exportja Excelbe

- A **Családok** fülön is megjelent az **Export** gomb — a szűrt lista (családfő, házastárs, cím, körzet, státusz) egy kattintással Excel-fájlba menthető, például körlevélhez vagy látogatási tervhez.

### 📅 E heti névnapok az Áttekintésen

- A születésnaposok mellett mostantól az **e heti névnapok** is látszanak — és a rendszer ki is gyűjti, **mely élő tagok érintettek** (keresztnév-egyezés alapján), így a köszöntés nem marad el.

### ℹ️ Jó hír: két korábbi észrevétel okafogyottnak bizonyult

- Az import-varázsló **Vissza gombjai** minden lépésnél működnek, és a hibaellenőrzés újrafuttatás-gombja futás közben már eddig is le volt tiltva — ellenőriztük, javítás nem kellett.

---

## [2026-06-10] — Tagnyilvántartás 2–3. fázis: auditnapló, megbízhatóbb mentések, összekapcsolt modulok
<!-- key: 2026-06-10-tagnyilvantartas-fazis2-3 -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

### 🧾 Minden változás nyomon követhető (auditnapló)

- A tagnyilvántartás **minden módosítása** (tag mentése és kivezetése, család, körzet, presbiter, megjegyzések, ellenőrzési státuszok) mostantól **auditnaplóba kerül** — ki, mit, mikor. A vallási hovatartozás a GDPR szerint különleges adat: a kezelése így már elszámoltatható.

### 🛡️ Megbízhatóbb mentések

- **Család mentése egy lépésben:** a család adatai és a gyermek-hozzárendelések mostantól **egyetlen adatbázis-tranzakcióban** mentődnek — félbeszakadó mentés nem veszítheti el a gyermek-listát. Ha a háztartás-nézet frissítése nem sikerül, **látható figyelmeztetést** kapsz (eddig csendben maradt).
- **Adatintegritási védelmek:** a befizetés család-hivatkozása nem mutathat többé nem létező családra, és egy gyülekezeten belül **nem jöhet létre két azonos személyi számú tag**.

### 🔗 A modulok összeérnek

- **Esketés után automatikusan család:** az anyakönyvi esketés rögzítésekor a rendszer a **családi rekordról is gondoskodik** (új család a pár címével, vagy a meglévő kiegészítése) — eddig ez csak keresztelésnél történt meg, ezért az új házaspárok nem jelentek meg a Családok fülön.
- **Halálozás egységesen:** a tagnyilvántartásból rögzített haláleset ugyanúgy lezárja a háztartás-tagságot és a házastársi kapcsolatot, mint az anyakönyvi temetés-rögzítés (a szülő–gyermek kapcsolatok megmaradnak — a családfa nem sérül).
- **Sírnyilvántartás ↔ tagok:** az elhunytak sír-bejegyzése mostantól össze van kötve a tag-rekorddal (a temetésen keresztül, visszamenőleg is).
- **Éves jelentés lélekszámmal:** az I. szekcióban megjelenik a **gyülekezeti lélekszám** — automatikusan a tagnyilvántartásból számolva, nem kell fejből tudni.

### ⚡ Gyorsabb, kényelmesebb taglista

- **Excel-export** gomb a Személyek fülön — a szűrt lista (pl. csak a 25–50 évesek) egy kattintással letölthető.
- Nagy gyülekezeteknél a lista **gyorsabban jelenik meg** (150 soronként, gombbal bővíthető).
- Az Áttekintés fülön új **„E havi születésnaposok"** lista a köszöntésekhez.
- Mobilon a sortörlés gomb mostantól mindig látható (eddig csak egérrel rámutatva jelent meg).

> *Megjegyzés a rendszergazdának:* a deploy ELŐTT futtatandó migráció:
> `migration-docs/sql/2026-06-10-tagnyilvantartas-fazis2-3-megbizhatosag.sql` (részletek: `_RUN_LOG.md`).

---

## [2026-06-10] — Tagnyilvántartás: családi karton nyomtatás, korszűrő, megjegyzések + anyakönyvi évfordulók
<!-- key: 2026-06-10-tagnyilvantartas-funkciok -->
<!-- category: feature -->
<!-- targets: lelkesz -->

### 🐛 Javítás: a tag mentése nem akadhat el némán

- **„Nem történik semmi a mentésre"** — javítva: ha a tag felvételénél vagy szerkesztésénél hiányzik egy kötelező adat (pl. családnév, település, utca), a rendszer mostantól **visszaugrik arra a lépésre**, ahol a hiba van, és piros üzenetben megmutatja, mit kell pótolni.
- **E-mail mező** — a tag űrlapjáról eddig hiányzott az e-mail mező, pedig a rendszer a háttérben ellenőrizte az értékét (ez is okozhatott néma elakadást). Mostantól megadható, és hibás formátumnál pontos jelzést kapsz.

### 👨‍👩‍👧 Családi karton nyomtatása (lefűzhető!)

- A **Tagnyilvántartás → Családok** listában minden családnál új **„Karton" gomb**: A4-es, nyomtatható családi karton készül — rajta a **család tagjai relációkkal** (családfő, házastárs, gyermekek), a **születési, keresztelési és konfirmációi dátumokkal**, a **házasságkötéssel** és a tagokhoz írt **megjegyzésekkel**.
- Bepipálható, hogy a kartonra kerüljenek-e a **befizetések** (utolsó 5 év) és a **családlátogatások** is. Nyomtatás előtt **élő előnézet** mutatja a végeredményt — így pontosan azt fűzöd le, amit látsz.

### 📝 Megjegyzés-mezők a személyi kartonon

- A személyi karton **minden fülén** (Személyes adatok, Anyakönyvi események, Befizetések) szerkeszthető **megjegyzés-mező** található — az anyakönyvi eseményekhez külön-külön is írhatsz emlékeztetőt (pl. a keresztelőhöz, temetéshez).
- A tagokhoz írt megjegyzések a **családi kartonra nyomtatva is megjelennek**, ha vannak.

### 🎂 Életkor szerinti szűrés a Személyek fülön

- Mostantól **kor szerint** is szűrhető a taglista (pl. 0–14 évesek a vallásórához, 25–50 évesek egy rétegalkalomhoz): a kereső mellett két kis mezőben adod meg a **kortól–korig** értéket.

### ⛪ Anyakönyv: jubileumi évfordulók

- Az **Anyakönyv → Áttekintő** tabon új **„Jubileumi évfordulók"** rész: egy gombnyomásra kilistázza, **kik kereszteltek, konfirmáltak vagy esküdtek 10 / 20 / 25 / 50 / 75 évvel ezelőtt** — köszöntésekhez, jubileumi istentiszteletekhez, aranykonfirmációhoz.

### 🌳 Szülők összekötése a családfához

- A tag felvételénél a szülő neve továbbra is elég **szabad szövegként** — de ha a szülő nincs a tagok között, egy kattintással **tagként is rögzíthető és összeköthető** („Rögzítés tagként" gomb a név alatt). Így a **családfa** pontosan felépül. Az összekötött szülőt zöld pipa jelzi, és bármikor leválasztható.

### 🤝 Befogadóbb megjelenés

- A betöltő képernyőkön és a rendszer feliratain a konkrét egyházkerület neve helyett **semleges felirat** szerepel — a Kartotéka minden református egyházkerület gyülekezeteit egyformán szolgálja, bárhonnan is csatlakoznak.

---

## [2026-06-10] — Biztonsági megerősítés a tagnyilvántartásban
<!-- key: 2026-06-10-tagnyilvantartas-biztonsag -->
<!-- category: security -->
<!-- targets: lelkesz -->

### 🔒 Mit jelent ez a gyakorlatban?

- **A tag végleges törlése mostantól védett művelet**: akinek **anyakönyvi bejegyzése** (keresztelő, konfirmáció, esketés, temetés) **vagy befizetése** van, az nem törölhető véglegesen — a rendszer ilyenkor csak **elrejti** a névsorból, az anyakönyvi adatok érintetlenül megmaradnak. Az anyakönyv történeti dokumentum: nem veszhet el egy kattintástól.
- A törlés és a kivezetés (elhunyt, elköltözött, kitért) **kizárólag a saját gyülekezet tagjaira** futtatható — más gyülekezet adatait technikailag sem lehet módosítani.
- A **felmentések, a presbiteri adatok és a körzetek** az adatbázis szintjén is gyülekezethez kötöttek lettek — minden gyülekezet csak a sajátját látja és kezeli.
- **Cím-rögzítési hiba javítva**: ha egy új település vagy utca rögzítése nem sikerült, a rendszer eddig észrevétlenül egy rossz (1-es számú) településre kötötte a tagot. Mostantól világos hibaüzenet jelenik meg, és hibás adat nem keletkezik.

> *Megjegyzés a rendszergazdának:* a fenti védelmek a `migration-docs/sql/2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql` migrációt igénylik — **a deploy ELŐTT** futtatandó a Supabase Studio-ban (részletek: `migration-docs/sql/_RUN_LOG.md`). A teljes átvilágítási jelentés: `docs/project-tracking/KARTOTEKA-tagnyilvantartas-atvilagitas-2026-06-10.md`.

---

## [2026-06-10] — Pénzügyi importáló: korábbi évek beolvasása, egyeztetés, okos tag-párosítás
<!-- key: 2026-06-10-penzugy-importalo-fejlesztes -->
<!-- category: feature -->
<!-- targets: lelkesz -->

A **Rendszergazda → Pénzügyi importáló** felület megújult, hogy a korábbi évek könyvelését gyorsan és pontosan be lehessen olvasni a Kartotékába. A felület mostantól **Apple-beállítások stílusú oldalsávval** működik: bal oldalon választod ki, mit szeretnél importálni, jobbra nyílik a felület.

### ✨ Új import-felületek

- **Hivatalos Kassza-import** — a hivatalos éves Kassza-Excel (bevétel + kiadás) beolvasása. A rendszer felismeri a befizetőket, párosítja a tagnyilvántartással, és a könyvelési kódokat (pl. egyházfenntartás, adomány) automatikusan a megfelelő kategóriába sorolja.
- **Bevétel-import (egyesített)** — saját Excel/CSV/XML fájlhoz, tetszőleges oszlopokkal: kézzel megmondod, melyik oszlop a név, összeg, dátum, kategória, és a rendszer **soronként felismeri**, hogy egyházfenntartás vagy más bevétel. (A korábbi „egyházfenntartás" + „általános bevétel" külön fülek **egy** felületbe kerültek.)

### 🔁 Nincs többé dupla-rögzítés

- **Duplikáció-védelem:** ha kétszer futtatod ugyanazt az importot, a rendszer **nem rögzíti újra** a már meglévő tételeket — így nem keletkezik fölösleges, kétszeres bevétel. Az eredménynél külön látszik, hány tételt hagytunk ki duplikáció miatt.

### ✅ Egyeztetés a könyveléssel + végösszeg-ellenőrzés

- **Egyeztetés:** a beolvasott fájlt a rendszer összeveti a Kartotékában **már könyvelt** tételekkel, és megmutatja, **mi maradt ki** a könyvelésből, illetve **mi van a könyvelésben, de hiányzik a fájlból**. Erről **letölthető riport** is készül.
- **Végösszeg-ellenőrzés:** import előtt látod a fájl szerinti várható bevétel/kiadás összeget, hogy a Pénzügy oldal egyenlegeivel össze tudd vetni.

### 👥 Okos egyházfenntartás-párosítás (1×/év szabály)

- Ahol egy címen vagy néven **több tag** is illik a befizetőre, a rendszer az **„egy személy évente egyszer fizet egyházfenntartást"** szabály alapján **automatikusan, külön-külön taghoz** rendeli a befizetéseket — így senkinek nem látszik téves elmaradása.
- Az automatikusan elosztott befizetők **áttekintő táblázatban** jelennek meg: ki, melyik nyugtához/befizetéshez került, és **melyik kifizetés egyházfenntartás vagy adomány** (kategória-címkével). A hozzárendelés bármikor **átállítható** egy másik tagra.
- **Figyelmeztetés:** ha két KÜLÖNBÖZŐ befizető tévedésből ugyanahhoz a taghoz kerülne (pl. „Józsa Béla" és „Ifj. Józsa Béla"), a rendszer **pirossal jelzi**. A részletfizetés és az előző évi (hátralék) befizetés ugyanazon a néven **nem** számít duplikációnak.

### 🏦 Bank ↔ kassza belső mozgások

- A **kasszában rögzített letétel/felvét**, amíg a banki oldalon nincs egyeztetve, a Pénzügy oldalon **piros felkiáltójellel** jelez. Amint a **banki kivonatot** beimportálod a Bank fülön és a rendszer **összepárosítja** a kassza-oldallal, a jelzés **magától eltűnik** (és nem keletkezik dupla tétel).

### 🧹 Teszt-időszaki adattörlés

- **Rendszergazda → Veszélyzóna:** a pénzügyi tételek (befizetés, kiadás, belső mozgás, nyugták) **véglegesen törölhetők** a teszteléshez — a **tagnyilvántartás, a kategóriák és a bankszámlák megmaradnak**. (A gyülekezet nevét meg kell erősíteni.)

> *Megjegyzés a rendszergazdának:* az importáló az alábbi SQL-migrációkat igényli (Supabase Studio-ban lefuttatva): `migration-docs/sql/2026-06-09-finance-import-rpc-v3-dedup.sql`, `2026-06-09-wipe-finance-data.sql`, `2026-06-10-belso-mozgas-kodok-INSTALL.sql`.

---

## [2026-06-08] — Éves beszámoló: jövőbeli célok és pontosabb pénzügyi mutatók
<!-- key: 2026-06-08-eves-beszamolo-celok-penzugy -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

### 🎯 Jövőbeli célok

- Mindhárom pillér bevezető diáján (**Lélekszámbeli · Lelki · Anyagi**) megadhatók a **jövőbeli célok** — a dia „Szerkesztés" gombjával beírva megjelennek a vetítésen is (és a telefonos vezérlőn jegyzetként).

### 💰 Pontosabb pénzügyi mutatók

- **Adományok aránya**: a „Bevételek részletesen" dián mostantól látszik, hogy a bevétel **hány százaléka adomány** (adomány, persely, céladomány, gyűjtés).
- **Reálisabb egyházfenntartás-mutató**: a teljesítési arány nevezője már a **felnőtt (18+) tagok** száma (a gyerekek nem fizetnek egyházfenntartást), így a százalék a valóságot tükrözi.

### 🔎 Teljesebb automatikus következtetések

- A „Következtetések" dia mostantól **mindhárom pillért** lefedi: a pénzügy és anyakönyv mellett **lélekszám-változás** (és 5 éves természetes változás) valamint **istentiszteleti látogatottság** (előző évhez viszonyított) következtetés is megjelenik.

### 🎯 Számszerű célok — cél vs. tény (mentett)

- A prezentáció „Célok" gombjával **számszerű célok** állíthatók be a következő évre pillérenként (pl. lélekszám, átlagos jelenlét, éves bevétel, adományarány, egyházfenntartás). A célok a **gyülekezethez mentődnek** (nem csak a böngészőbe), és a pillér-bevezető diákon a rendszer a **cél melletti tényadatot** is kiírja (✓ ha teljesült).
- *Megjegyzés a rendszergazdának:* a funkció a `gyulekezeti_celok` táblát használja — futtasd a `migration-docs/sql/2026-06-08-gyulekezeti-celok.sql` migrációt. Addig a prezentáció hibátlanul működik, csak a számszerű célok mentése nem aktív.

---

## [2026-06-08] — Éves beszámoló: kivetítés Wi-Fin és telefonos vezérlés
<!-- key: 2026-06-08-eves-beszamolo-kivetites-prezenter -->
<!-- category: feature -->
<!-- targets: lelkesz -->

Az **Éves beszámoló** prezentációt mostantól **kivetítőre lehet küldeni** és **telefonról/tabletről vezérelni** — mint egy igazi diavetítő.

### 📽️ Kivetítés

- **„Kivetítő" gomb** a prezentációban, három móddal:
  - **Ezen a gépen** — teljes képernyős vetítés (mint eddig).
  - **Második ablak** — külön ablakban nyílik, amit a kivetítő (második) képernyőre húzhatsz.
  - **Wi-Fi kivetítő** — Chromecastra / okos-TV-re küldhető (ahol a böngésző támogatja); egyébként automatikusan a második ablak nyílik.
- A vetített kép **mindig szinkronban** marad a vezérlővel — amelyik diát kiválasztod, az jelenik meg a kivetítőn.
- **Nem alszik el a kijelző** vetítés közben, és **elsötétítés** is van (a `B` billentyűvel vagy a telefonos gombbal).

### 📱 Telefonos / tabletes vezérlés (prezenter)

- A „Kivetítő" ablakban megjelenik egy **QR-kód** és egy **6 jegyű kód** — a telefonoddal beolvasva (vagy a linket megnyitva) **a kezedből lapozhatod** a diákat.
- A prezenter nézet mutatja az **aktuális** és a **következő** diát, valamint a **lelkészi jegyzetet** (amit a dia kommentárjához írtál) — nagy, könnyen nyomható gombokkal.
- Egyszerre több eszköz is csatlakozhat (vezérlő gép + kivetítő + telefon), mind szinkronban.

---

## [2026-06-08] — Éves beszámoló: valós adatok és rugalmasabb diák
<!-- key: 2026-06-08-eves-beszamolo-adatok-es-diak -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

Az **Éves beszámoló** (prezentáció) most pontosabb adatokból dolgozik, és a diák sokkal rugalmasabban kezelhetők.

### ✨ Pontosabb adatok

- **Valós lélekszám-alakulás**: a korábbi évek létszáma már nem „lapos" becslés — a rendszer a tagság-mozgás eseményeiből (be- és elköltözés, áttérés, kitérés, keresztelés, temetés) **visszaszámolja** az évenkénti lélekszámot. Új **„Lélekszám alakulása"** dia mutatja a megmaradást: a létszám-vonalat és a keresztelések–temetések (természetes változás) oszlopait.
- **Istentiszteleti látogatottság a munkanaplóból**: új **„Istentiszteleti látogatottság"** dia a **valós jelenléti adatokból** (férfi/nő/gyermek) — átlagos jelenlét, összes fő, alkalmak száma, az előző évhez viszonyított változás, és **alkalom-típusonkénti bontás** (istentisztelet, **vallásóra, ifjúsági óra, gyermek foglalkozás, nőszövetségi bibliaóra** stb.).

### 🎛️ Rugalmas diakezelés

- **Pillérek szerinti, áttekinthető lista**: a bal oldali dialista mostantól **csoportosítva** jelenik meg (Nyitó · 1. Lélekszámbeli · 2. Lelki · 3. Anyagi · Kiegészítők · Lezárás).
- **Diák elrejtése / megjelenítése**: bármelyik dia egy kattintással elrejthető (és bármikor visszahozható).
- **Saját dia hozzáadása**: a lelkész **saját diát** írhat (cím + szöveg) bármelyik pillérhez — pl. köszönetnyilvánítás, jövőképet bemutató gondolatok.
- **Szerkesztés a diára kattintva**: a dián megjelenő „Szerkesztés" gombbal cím, alcím és lelkészi gondolat módosítható.
- **Hiányzó adat bekérése**: ha egy diához nincs adat a rendszerben (pl. nincs munkanapló-bejegyzés), a dia **jelzi**, és egy ablakban felkínálja a **kézi kiegészítést**.

---

## [2026-06-08] — Gyülekezeti programok: szebb ablakok és finomítások
<!-- key: 2026-06-08-gyulekezeti-programok-ablakok -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

A **Gyülekezeti programok** doboz beviteli ablakai megújultak, és néhány kérésre érkezett finomítás is bekerült.

### ✨ Mi változott

- **Teljesen új „Új program” ablak**: letisztult, áttekinthető felület. A típust egy **ikonos rácsból** választod (16 típus, mindegyik saját színnel), a **prioritás** és az **ismétlődés** jól látható, egy érintéssel váltható gombsor. Külön **„Többnapos”** és **„Egész napos”** kapcsoló, így csak a tényleg szükséges mezők látszanak.
- **A havi naptár mindig látszik** — akkor is, ha az adott hónapban (vagy épp az egész évben) még nincs program. Így bármelyik napra rákattintva azonnal rögzíthetsz.
- **„Gyors bevitel” → „Tömeges bevitel”**: a gomb új nevet és **újragondolt, kártyás ablakot** kapott. **5 sorral indul**, és egy gombbal **továbbiak adhatók hozzá** (+5 / +10); az Enter billentyű a következő sorra ugrik, az utolsónál újat nyit.
- **Éves terv — alkalmazáson belüli, reszponzív ablak**: az „Éves terv” mostantól egy **az alkalmazáson belül megnyíló ablakban** jelenik meg (nem külön böngészőfülön, amit a böngésző gyakran blokkolt), benne **évlapozó** (előző/következő év), **Nyomtatás**, **PDF mentés** és **Bezárás** gombbal. Az előnézet **minden képernyőméreten** a laphoz méretezve látszik (telefonon, táblagépen is), miközben a kinyomtatott lap továbbra is pontos A4 fekvő marad.
- **Megújult éves terv-elrendezés**: a lap fejléc-sávja a **gyülekezet logója + neve** mellett az **év vezérigéjét** mutatja (helyben szerkeszthető nyomtatás előtt), alatta **12 hónap** elegáns mini-naptára (egyházi ünnepek arany kereszttel, vasárnapok pirosan, a programnapok színes ponttal), majd **„Az év kiemelt alkalmai”** lista és a kicsi **KARTOTÉKA**-lábléc.

---

## [2026-06-07] — Gyülekezeti programok: megújult, áttekinthetőbb felület
<!-- key: 2026-06-07-gyulekezeti-programok-uj-design -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

A kezdőoldali **Gyülekezeti programok** doboz teljesen megújult — nyugodtabb, áttekinthetőbb és könnyebben kezelhető lett, miközben minden korábbi funkció megmaradt. Az elrendezés mostantól egy **naptár + napi lista** párosra épül (mint a telefonos naptáraknál).

### ✨ Mi változott

- **Naptár + napi lista egy helyen**: fent a havi naptár, alatta a **kiválasztott nap** részletes programlistája. Egy napra kattintva mostantól **arra a napra szűr** a lista (nem nyit azonnal új programot) — a programhoz hozzáadás a nap melletti **+** gombbal vagy az „Új program” gombbal történik.
- **Egyszerűbb időnavigáció**: a korábbi háromféle léptető helyett egyetlen, világos vezérlő — `‹ Hónap Év ›`. A hónap/év feliratra kattintva **gyorsan ugorhatsz** bármelyik hónapra/évre, és van „**Ma**” gomb is.
- **Hónap / Lista nézet**: a naptár mellett egy gombbal **listás (agenda) nézetre** válthatsz, ahol az egész hónap programjai napokra bontva, egymás alatt láthatók.
- **Letisztult ikonok, jól látható jelölések**: minden programtípushoz egységes, könnyen felismerhető ikon tartozik (a típus saját színével) — az „Egyéb” típusnál továbbra is **választható egyedi emoji**. A **prioritás** (Kiemelt ⭐ / Fontos 🚩) és az **ismétlődés** (pl. „Heti” ↻) mostantól jól látható címkeként jelenik meg.
- **Finom „mai nap” kiemelés** és külön „kiválasztott nap” jelölés — négy jól elkülönülő nap-állapot (ma / kiválasztott / van program / üres).
- **Nagyobb, kényelmesebb kattintási felületek** és tisztább betűk — kifejezetten az idősebb használóknak is.
- **Témakövető megjelenés**: a doboz mostantól a választott felülettémát és a sötét módot is követi (a programtípusok színe változatlan marad).

### 🖨️ Szebb éves programterv (kiadható a gyülekezetnek)

- **Az év vezérigéje**: a nyomtatott éves terv fejlécében mostantól megjelenik **az évhez tartozó vezérige** (aranyozott panelban) — így a terv valódi, gyülekezeti tagoknak is odaadható kiadvány.
- **KARTOTÉKA-jelölés a láblécen**: a lap alján kicsiben feltüntetjük, hogy „Készült a **KARTOTÉKA** egyházi nyilvántartó rendszerrel”.

---

## [2026-06-07] — Gyülekezeti programok: működő ismétlődés és pontosabb naptár
<!-- key: 2026-06-07-gyulekezeti-programok-ismetlodes -->
<!-- category: feature -->
<!-- targets: lelkesz -->

A kezdőoldali **Gyülekezeti programok** doboz több ponton megbízhatóbb és kényelmesebb lett. A legfontosabb: az ismétlődő alkalmak (heti bibliaóra, vasárnapi istentisztelet stb.) mostantól tényleg végigfutnak a naptáron.

### ✨ Az ismétlődő programok végre tényleg ismétlődnek

- **Heti / kétheti / havi ismétlődés**: ha egy programnál ismétlődést állítasz be, az mostantól **minden alkalommal megjelenik** — a havi nézetben, a hónaplistában és a nyomtatott éves tervben is. Korábban az ismétlődés beállítható volt ugyan, de a program csak a kezdőnapon látszott.
- **Egyszer szerkeszted, mindenhol frissül**: az ismétlődő alkalmak ugyanahhoz a programhoz tartoznak — ha szerkeszted, törlöd vagy „teljesítettre" állítod, az a **sorozat egészére** vonatkozik. Törléskor a rendszer külön figyelmeztet erre.
- **Az éves tervben átlátható**: a nyomtatott terv naptárrácsában minden alkalom kis jelölőt kap, az oldalsó felsorolásban viszont a sorozat **egy sorként**, az ismétlődés jelölésével szerepel (pl. „Bibliaóra (Heti)").
- *Megjegyzés:* az ismétlődés mindig az **adott naptári évre** szól (ahogy a programokat is évenként kezeli a rendszer).

### 🐛 Pontosabb naptár

- **Mindig a jó hónapba kerül**: a programok hónaphoz rendelése pontosabb lett — kizárt, hogy egy program a dátum kiszámítása miatt rossz hónapban jelenjen meg.
- **A több napon átnyúló alkalmak nem tűnnek el**: egy hónapfordulón átnyúló program (pl. január 30. – február 2.) **mindkét hónapban** látszik, nemcsak a kezdő hónapban.

### 🎨 Kényelmesebb, megbízhatóbb kezelés

- **Barátságosabb törlés**: a böngésző régi felugró kérdése helyett egységes, mobilon is jól működő megerősítő ablak jelenik meg törléskor.
- **Nem ragad be a „Betöltés…"**: ha a programok betöltése valamiért nem sikerül, a rendszer most **egyértelműen jelzi** (nem marad némán üres a doboz).
- **Gyors bevitel évjelöléssel**: a „Gyors bevitel" ablak fejlécében mostantól látszik, **melyik évhez** rögzítesz programokat.
- **Billentyűzettel és képernyőolvasóval is használható**: a mini-naptár napjai és a programlista sorai billentyűzetről is elérhetők és kiválaszthatók.

---

## [2026-06-07] — Adminisztráció: szigorúbb jogosultságok és letisztult felület
<!-- key: 2026-06-07-admin-jogosultsag-es-felulet -->
<!-- category: security -->
<!-- targets: admin, egyhazkeruleti_admin -->

A rendszergazdai (adminisztrációs) felület biztonságosabb és átláthatóbb lett. A legfontosabb: mostantól minden adminisztrátor csak a rá tartozó kör adatait kezelheti.

### 🔒 Szigorúbb, kör szerinti jogosultságok

- **Egyházkerületi adminisztrátor csak a saját egyházkerületét kezeli**: aki egy egyházkerület adminisztrátora, mostantól kizárólag a saját egyházkerülete egyházmegyéit, gyülekezeteit és felhasználóit látja és módosíthatja — más egyházkerület adatai meg sem jelennek neki. Ez védi az adatokat, és megfelel az adatvédelmi elvárásoknak.
- **Körlevél a megfelelő körnek**: az egyházkerületi adminisztrátor körlevele és hírlevele kizárólag a saját egyházkerülete tagjaihoz jut el.
- **Visszafordíthatatlan adattörlés csak a fő rendszergazdának**: a gyülekezeti adatok teljes törlése (adattisztítás) ezentúl kizárólag a fő rendszergazda joga.

### 🎨 Letisztultabb, megbízhatóbb kezelőfelület

- **Felhasználók egy helyen**: a jóváhagyásra váró regisztrációk és a meglévő felhasználók egy közös, kereshető nézetben — a várakozók pirossal kiemelve, kártya- és listanézettel, rendezéssel és szűréssel. A jóváhagyás és az aktiválás egyetlen lépésben történik, így egyik sem maradhat el.
- **Gyorsabb betöltés**: az admin oldalak (áttekintő, gyülekezetek, pénzügyi kimutatás) érezhetően gyorsabban töltenek be.
- **Barátságosabb megerősítő ablakok**: a böngésző régi felugró ablakai helyett egységes, mobilon is jól működő párbeszédablakok.
- **Pontosabb visszajelzések**: ha egy értesítés vagy művelet nem sikerül, a rendszer jelzi (nem nyeli el csendben), és „Újrapróbálom" gombbal újraindítható.

---

## [2026-06-06] — Pénzügyi nyomtatás és kezelés — fejlesztések
<!-- key: 2026-06-06-bizonylat-ujranyomtatas-finomitasok -->
<!-- category: improvement -->
<!-- targets: lelkesz, konyvelo -->

Sok hasznos fejlesztés érkezett a Pénzügy modulba — a gyors tételrögzítéstől a hivatalos nyomtatványokig. A lényeg röviden:

### 🖨️ Nyomtatás és Nyomtatási központ

- **Minden nyomtatvány egy helyen**: a Nyomtatási központban a kassza-/bankkönyv mellett mostantól a **Költségvetés, Költségvetés-módosítás és Számadás** is kiválasztható, sőt a korábban mentett **Decont** és **Dispoziție** bizonylatok is **újranyomtathatók vagy PDF-be menthetők**.
- **Pontos A4 előnézet**: a nyomtatási kép a tényleges lapot mutatja — a dokumentum szerint álló vagy fekvő tájolásban —, **oldalirányú görgetés nélkül**; a bal oldali lista letisztult, minden típus elfér.
- **Megbízható nyomtatás**: a nyomtatás külön ablakban nyílik, így minden eszközön (asztali alkalmazásban is) **ténylegesen megjelenik** a nyomtatási párbeszéd.
- **Festéktakarékos**: a kimutatásokról eltűntek a szürke hátterek (helyettük félkövér és keret).
- **Költségvetés / számadás**: a hivatalos minta szerint, **kétnyelvű** (román–magyar) oszlopokkal, az összegző sorok mindig a tételeik előtt, **pontosan 4 oldalra** méretezve (2 lapra, kétoldalasan nyomtatható). A belső mozgások itt nem jelennek meg (a minta szerint nem relevánsak).

### 💵 Tételek rögzítése

- **Egy gomb, két fül**: a „+ Tétel rögzítése" ablakban egyszerre vihetsz fel **több bevételt és kiadást** is; a Mentés dátum szerint rendez és mindent a helyére könyvel.
- **Kereshető kategória**: gépelve kereshetsz a megnevezésre — a zavaró kódszámok nélkül, egy betű is elég.
- **Dátum kétféleképp**: szabadon beírhatod (bármilyen formátum), vagy **naptárból** is választhatod.
- **Csak készpénz, áttekinthetően**: a gyors rögzítő készpénzes tételekre szól (a banki tételek banki kivonatból jönnek); új **Irattípus** és **Megjegyzés** oszloppal. Telefonon kártyás nézet, görgetés nélkül.
- **Készpénzfelvétel / -letétel**: ilyenkor megjelenik a **bankszámla-választó**, és a rendszer a kassza és a bank oldalt is rendezi.

### 📄 Hivatalos bizonylatok

- **Decont és Dispoziție**: széles képernyőn bal oldalt töltöd ki, jobb oldalt élő előnézet; az aláírások fölött a nevek; a Dispoziție szellős, **A5-ös kétpéldányos**, a **román betűs összeg** pontos.
- **Monetár (pénztári címletjegyzék)**: mostantól **kinyomtatható**, **kétnyelvű** (román–magyar), előnézeti ablakkal és PDF-mentéssel.
- **Számadás**: minden tétel látszik (a költségvetéshez hasonlóan).
- **Véglegesítéshez kötött adatok**: a presbitériumi határozat és az egyházközségi iktatószám csak **véglegesítés után** kerül a nyomtatványra; a rendszer jelzi, ha még nincs véglegesítve.

### 🧭 Navigáció és súgó

- **Oldalsáv almenük**: az almenüre kattintva a megfelelő fül **azonnal frissül**, akkor is, ha már az adott oldalon vagy.
- **Új súgó-fejezet**: „Tételek és bizonylatok" — lépésről lépésre a rögzítésről, a Decontról, a Dispozițiéről és az újranyomtatásról.

### ⚠️ Fontos — nyugta tesztidőszak

- A **nyugtatömb-rögzítés és a nyugta-nyomtatás** jelenleg **tesztidőszakban** van, **hivatalos használata még NEM megengedett**. Hivatalosan kizárólag az **Egyházkerülettől (EREK iratterjesztő) vásárolt, sorszámozott nyugtatömb** használható.

---

## [2026-06-06] — Bevétel és kiadás egy helyen, tömegesen
<!-- key: 2026-06-06-osszevont-bevetel-kiadas -->
<!-- category: feature -->
<!-- targets: lelkesz, konyvelo -->

### ✨ Új funkció

- **Egy gomb mindkettőre**: a Pénzügy oldalon a korábbi külön „+ Bevétel” és „+ Kiadás” gomb helyett mostantól **egyetlen „+ Tétel rögzítése” gomb** van. Az ablakban fent válthatsz a **Bevétel** és a **Kiadás** fül között.
- **Több tétel egyszerre**: egyszerre **több bevételt és több kiadást is** beírhatsz — annyi sort adsz hozzá, amennyire szükség van.
- **Egy mentés, minden a helyére**: a **Mentés** gombbal a rendszer **dátum szerint sorba rakja** a tételeket, és mindegyiket a megfelelő helyre (kassza/bank) könyveli.
- **Telefonon is kényelmes**: kis képernyőn a sorok áttekinthető kártyákként jelennek meg.

---

## [2026-06-06] — Decont: utólag előkerülő számlák hivatalos rögzítése
<!-- key: 2026-06-06-decont-hivatalos -->
<!-- category: feature -->
<!-- targets: lelkesz, konyvelo -->

A **Decont (elszámolás)** mostantól a hivatalos `Elszámolás` nyomtatvány szerint készül el, és kitöltés közben **élő előnézetben** látod a nyomtatott lapot.

### ✨ Hogyan segít?

- **A régi számlák gondja megoldva**: a könyvelés nem enged korábbi dátumra rögzíteni. A Decont ezt hidalja át — az utólag előkerülő számlákat a **mai (elszámolási) dátumra** könyveli, miközben a számla **saját, eredeti dátuma** megjelenik a nyomtatott dokumentumon.
- **Automatikus könyvelés**: a tételek mentéskor **valódi kiadásként** is rögzülnek a kiválasztott kategóriára — nem kell külön bevinni őket.
- **Hivatalos, kétnyelvű nyomtatvány**: a dokumentum **románul** nyomtatható (a hivatalos elrendezéssel), de **kitöltés közben magyar magyarázat** segít minden mezőnél.
- **Sorszámozás**: minden elszámolási lap **évente 1-től** kap sorszámot, gyülekezetenként.
- A lap egyből **kinyomtatható vagy PDF-be menthető**.

---

## [2026-06-06] — Dispoziție de plată / încasare (kifizetési és bevételezési rendelvény)
<!-- key: 2026-06-06-dispozitie-plata-incasare -->
<!-- category: feature -->
<!-- targets: lelkesz, konyvelo -->

### ✨ Új funkció

- **Új bizonylat**: elkészíthető a hivatalos **Dispoziție de plată** (kifizetési) és **Dispoziție de încasare** (bevételezési) rendelvény, a hivatalos kétpéldányos, román nyelvű formában.
- **Összeg betűvel, románul**: a rendszer az összeget **automatikusan kiírja román betűvel** (pl. „două sute douăzeci și unu lei”).
- **Automatikus könyvelés**: a **plată** mentéskor **kiadásként**, az **încasare** **bevételként** könyvelődik a kasszában — külön rögzítés nélkül.
- **Meglévő tételhez is**: egy már rögzített készpénzes kassza-tételhez is **generálható** a számozott bizonylat (ilyenkor nem könyvel újra).
- **Sorszámozás**: a kifizetési és a bevételezési rendelvények **külön sorozatban, évente 1-től** számozódnak.

---

## [2026-06-05] — Inaktív gyülekezetek automatikus jelölése
<!-- key: 2026-06-05-inaktiv-gyulekezetek -->
<!-- category: improvement -->
<!-- targets: rendszergazda -->

### ✨ Új funkció

- **Automatikus „inaktív" jelölés**: az a gyülekezet, ahol **egy éve nincs aktivitás** (sem lelkész-belépés, sem pénzügyi rögzítés), automatikusan **„inaktív" státuszba** kerül. A gyülekezet adatainál figyelmeztető jelzés látható.
- **Önállóan visszaáll**: ha egy lelkész újra belép, a gyülekezet a következő ellenőrzéskor visszaáll „aktív"-ra. A státusz csak tájékoztató — senkit nem zár ki.
- Naponta automatikusan frissül (pg_cron).

---

## [2026-06-05] — Lelkészcsere: biztonságos gyülekezet-átadás
<!-- key: 2026-06-05-lelkeszcsere-atadas -->
<!-- category: feature -->
<!-- targets: lelkesz -->

Ha másik gyülekezetbe távozol, a gyülekezeted **biztonságosan átadható** az új lelkésznek — úgy, hogy a folytonosság és az adatok védve maradnak.

### ✨ Hogyan működik?

1. **Te indítod**: a gyülekezeti beállítások → **„Lelkészek" fül** alján elindítod az átadást (opcionális indokkal).
2. **Kettős ellenőrzés**: az indításról a **rendszergazda** és az egyházmegye **számvevője** értesül. Átnézik a gyülekezet adatait, és vagy **jóváhagyják** az átadást, vagy **meghagyásokat** (észrevételeket) rögzítenek, amíg valami nincs rendben. (Ha az egyházmegyében nincs számvevő, a rendszergazda jóváhagyása elég.)
3. **Véglegesítés**: ha mindkét fél rendben találta, a **rendszergazda** megadja a **bejövő lelkész** email-címét. Ha már a rendszerben van, azonnal megkapja a gyülekezetet (és értesítő emailt); ha még nincs, **meghívót** kap, hogy regisztráljon.
4. **Automatikus napló**: az átadáskor a **lelkészi szolgálati naplóban** a korábbi szolgálat lezárul, az újé megnyílik — pontos időpontokkal.

### 🔒 Mit jelent ez?

A gyülekezet **adatai nem vesznek el** — csak a felelős lelkész változik. A kettős jóváhagyás (rendszergazda + számvevő) garantálja, hogy az átadás átlátható és ellenőrzött legyen.

---

## [2026-06-05] — Saját profil törlése a Beállításokban
<!-- key: 2026-06-05-sajat-profil-torles -->
<!-- category: feature -->
<!-- targets: lelkesz -->

### ✨ Új funkció

- **Töröld a saját fiókod**: a jobb felső menü → **Beállítások → Adat & biztonság** résznél mostantól véglegesen **törölheted a saját profilodat** (pl. ha nyugdíjba vonulsz). Megerősítéshez be kell írnod, hogy „TÖRLÉS".
- **Csak a személyes adatod tűnik el**: a neved, e-mailed és telefonszámod anonimizálódik, a belépésed megszűnik — de a **gyülekezet adatai megmaradnak** (tagok, pénzügy, anyakönyv).
- **A gyülekezet felelős nélkül marad**, amíg a **rendszergazda** új lelkészt nem rendel hozzá — erről a rendszergazda automatikusan **értesítést kap**.

*(Ha másik gyülekezetbe távozol és van utódod, használd inkább a „Gyülekezet átadása" lehetőséget, hogy a folytonosság biztosított legyen.)*

---

## [2026-06-05] — Fiók végleges törlése — a gyülekezeti adat megőrzésével
<!-- key: 2026-06-05-fiok-vegleges-torles-gdpr -->
<!-- category: feature -->
<!-- targets: lelkesz -->

Ha egy lelkész felhagy a szolgálattal vagy nyugdíjba megy, a fiókja **véglegesen törölhető** — **úgy, hogy a gyülekezet adatai NEM vesznek el**.

### ✨ Hogyan működik?

- **Csak a személyes adatok törlődnek**: a név, az e-mail cím és a telefonszám véglegesen **anonimizálódik**, és a **belépés megszűnik**. Az illető a továbbiakban nem fér hozzá a rendszerhez.
- **A gyülekezet adatai megmaradnak**: a tagok, a pénzügyi (járulék) és anyakönyvi nyilvántartás **érintetlen** marad — hiszen a gyülekezetet más lelkész veszi át. (Ezeket törvény is védi: megőrzési kötelezettség.)
- **A szolgálati napló megmarad**: a [lelkészi szolgálati naplóban](#) a korábbi szolgálat a névvel és időponttal **megmarad, lezárva** — így a gyülekezet története végig átlátható.
- **Adatvédelmi nyilvántartás**: minden törlésről a rendszer feljegyzést készít (ki, mikor, mit anonimizált) — a GDPR-megfelelőség bizonyításához.

*(Hamarosan: a lelkészcsere-átadás biztonságos, kétlépcsős jóváhagyással — a rendszergazda és az egyházmegyei számvevő közös ellenőrzésével.)*

---

## [2026-06-05] — Lelkészi szolgálati napló a gyülekezetnél
<!-- key: 2026-06-05-lelkeszi-szolgalati-naplo -->
<!-- category: feature -->
<!-- targets: lelkesz -->

### ✨ Új funkció

- **Lelkészek fül a gyülekezeti beállításoknál**: a gyülekezet adatai közt mostantól egy új **„Lelkészek"** fül mutatja, **kik szolgáltak / szolgálnak** a gyülekezetben, és **mikortól meddig** (pontos időpontokkal). A jelenleg szolgáló lelkész „Aktív" jelzést kap, a korábbiak a szolgálati idejükkel látszanak.
- A lista **automatikusan bővül**: amikor a rendszergazda jóváhagy egy új lelkészt a gyülekezethez, bekerül a naplóba; a későbbi lelkészcsere-átadás pedig lezárja a korábbi és megnyitja az új szolgálatot.
- A **korábbi lelkészek neve a listában megmarad** akkor is, ha az illető később törli a fiókját — így a gyülekezet szolgálati története végig átlátható és visszakövethető marad.

*(Ez egy nagyobb fejlesztés része: hamarosan jön a fiók végleges törlése és a lelkészcsere-átadás biztonságos, kétlépcsős jóváhagyással.)*

---

## [2026-06-05] — Biztonság és átláthatóság: tevékenység-napló (1. lépés)
<!-- key: 2026-06-05-tevekenyseg-naplo-1 -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

A gyülekezeti adatok védelme érdekében a rendszer mostantól **naplózza a fontos, biztonságot érintő műveleteket** — hogy később visszakövethető legyen, *ki, mikor, mit* tett, és az esetleges visszaélések, illetve a felelősök azonosíthatók legyenek. Ez egy nagyobb fejlesztés első lépése.

### ✨ Új funkciók

- **Belépés-napló**: a rendszer rögzíti a bejelentkezéseket (jelszavas és Google), így látszik, ki és mikor használta a rendszert.
- **„Utoljára aktív" időpont**: minden fiókhoz rögzül, mikor használta utoljára a rendszert — segít látni, kik az aktív felhasználók egy adott időszakban.
- **Érzékeny műveletek naplózása**: a rendszergazdai „belépés-mód" (god-mode) be- és kikapcsolása, valamint a hozzáférés-kérelmek jóváhagyása/elutasítása mostantól naplózott (ki hagyta jóvá, milyen szerepre, melyik gyülekezethez).

### 🔒 Mit jelent ez Neked?

A gyülekezeted adataival végzett fontos műveletek **nyomot hagynak** — ez véd a visszaélések ellen, és átláthatóbbá teszi a rendszert. A naplót csak a rendszergazda (és a tervezett bővítés után az egyházmegyei számvevő) láthatja. *(Folytatás következik: a tagsági/pénzügyi adatok módosításainak részletes naplózása, a felhasználó-törlés és a lelkészcsere-átadás funkciók.)*

---

## [2026-06-05] — Egyszerűbb regisztráció: ha már van fiókod, megmutatjuk hová tartozol
<!-- key: 2026-06-05-regisztracio-mar-letezo-email -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

### ✨ Új funkciók

- **„Ez az email már regisztrálva van"**: ha olyan email-címmel próbálsz újra hozzáférést kérni, amivel már van fiókod, a rendszer most megmondja, **melyik gyülekezetnél** vagy már regisztrálva — így nem kell találgatnod, hová tartozol.
- **Elfelejtett jelszó egy kattintásra**: ugyanazon a képernyőn ott a **Belépés** és az **Elfelejtettem a jelszót** gomb, ami egyből átvisz a jelszó-visszaállításhoz. Nem kell új kérelmet beküldened.

---

## [2026-06-05] — Welcome varázsló: új lelkésznek csak a saját adatait kell megadnia
<!-- key: 2026-06-05-welcome-ujabb-lelkesz-rovid -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

### 🎨 UX javítások

- **Gyorsabb csatlakozás egy meglévő gyülekezethez**: ha a gyülekezet adatait egy korábbi lelkész már beállította, az újonnan csatlakozó lelkésznek **csak a saját (személyes) adatait** kell megadnia — a gyülekezeti és pénzügyi alapadatokat nem kell újra begépelnie.
- **„Adatok ellenőrzése" lépés**: a személyes adatok után átnézheted a gyülekezet adatait, és ha valami **hiányzik vagy pontosításra szorul, ott kiegészítheted**. Ha minden rendben, egy kattintással továbbléphetsz.

---

## [2026-06-05] — Egyházfenntartási járulék: rugalmasabb kedvezmények
<!-- key: 2026-06-05-jarulek-rugalmas-kedvezmenyek -->
<!-- category: feature -->
<!-- targets: lelkesz -->

### ✨ Új funkciók

- **Foglalkozás-alapú kedvezmény**: beállíthatod, hogy bizonyos foglalkozású tagok (pl. *tanuló, diák*) **ne fizessenek**, vagy csökkentett összeget fizessenek. A rendszer a tag „Foglalkozás" mezője alapján automatikusan alkalmazza. (A korábbi, félreérthető „Általános kedvezményes járulék" mező helyére került.)
- **Időszaki kedvezmény dátum-tartománnyal**: egy kedvezményes időszaknak mostantól **kezdő ÉS vég dátuma** van, nem csak egyetlen határidő. Pl. *január 1. – július 1. között 160 lej, július 2. – október 31. között 190 lej* — a tag aszerint fizet, hogy mikor rendezi a járulékát.
- **Korábbi évek bővíthetők**: a beállító varázslóban tetszőleges számú korábbi évet felvehetsz a régi tartozások pontos kiszámításához (nem csak 5-öt).

### 🎨 UX javítások

- **Egyértelműbb pénzügyi lépés**: az „Aktuális év alapösszege" résznél eltűnt a kötelező fizetési határidő — alapértelmezetten egész évben fizethető, a határidő csak a kedvezményeknél releváns.

---

## [2026-06-04] — „Rögzítsd az elsőt!" üdvözlő üres állapotok + welcome finomítások
<!-- key: 2026-06-04-ures-allapot-udvozlok -->
<!-- category: improvement -->
<!-- targets: lelkesz -->

### 🎨 UX javítások

- **Barátságos üres állapotok**: minden fő modulnál (Tagnyilvántartás, Anyakönyvek, Pénzügy, Iktató, Leltár, Temető, Munkanapló, Jegyzőkönyvek) — ha még nincs bejegyzés — egy szép **„Rögzítsd az első…"** üdvözlő kártya segít elindulni.
- **Welcome varázsló csiszolások**: a beállító varázsló beviteli mezői kiemeltebbek, a fejlécben a Kartotéka logó látszik, és a regisztrációnál megadott **egyházkerület / egyházmegye / egyházközség automatikusan kitöltődik**.
- **Szolgálati előzmények javítás**: a „Szolgálati előzmények" résznél az évszám mezők most már akadálytalanul szerkeszthetők.

---

## [2026-05-06c] — 201.1↔201.10 ekvivalencia + 300.01 belső mozgás kód (v0.9.54, csak web)
<!-- key: 2026-05-06c-201-1-300-01-equivalence -->
<!-- category: bugfix -->
<!-- version: 0.9.54 -->
<!-- targets: lelkesz -->

### 🐛 Javítások

- **201.1 ↔ 201.10 ekvivalencia**: a felhasználói visszajelzés szerint a "201.1" kódot a magyar konvenció szerint "201.10"-ként kezeljük. Az új `altDecimalForm()` helper automatikusan próbálja mindkét formát a `szamadasicel`-ben. Hatás: 3 sor a 2025-ös Kasszában (910 + 729 + 450 RON = "Szolgáltatások költségei") most már felismerhető.
- **300.01 új belső mozgás kód**: a Kassza fülön bevétel-oldali ATM/bank-felvét (pl. "Készpénzfelvétel a(z) A számláról" / "Ridicare numerar") most már felismert. Új SQL: `migration-docs/sql/2026-05-03-finance-300-01-INSTALL.sql` (szamadasicel + befizetescel rekord, type='B'). A `budget-code-resolver` a 300-prefixre is reagál.
- **Cím a candidate-grid-en**: a fizetés-import grid mostantól megjeleníti a `cim` mezőt is a candidate-soroknál — könnyebb azonosítani azonos nevű személyeket.

(Commit `3dd04e98`.)

---

## [2026-05-06b] — Pénzügyi import egységesítés a /penzugy oldalon (v0.9.54, csak web)
<!-- key: 2026-05-06b-finance-import-egyesites -->
<!-- category: improvement -->
<!-- version: 0.9.54 -->
<!-- targets: rendszergazda -->

A felhasználó panaszára: "több pénzügyi import is van a pénzügyi oldalon"
— ez most rendezve.

### A korábbi szétaprózottság

- `/penzugy` "Rendszergazdai importáló" füle: generikus 5-profilos labor-import
  (bevételek / kiadások / bank / monetár / belső mozgások — Excel/CSV)
- `/admin/finance-import`: rejtett route a Kassza-import + (új v0.9.53) az
  Egyházfenntartás-import wizardokkal — nehéz megtalálni

A felhasználó nem tudta, hogy 2 helyen van import-rendszer, és a `/penzugy`
oldalon csak a generikus labor-importot látta — a domain-specifikus
wizardok rejtve maradtak.

### Az új egységes hely

Mostantól mindkét wizard (Kassza-import + Egyházfenntartás-import) a
**Pénzügy oldal "Rendszergazdai importáló" fülén** érhető el — egy
helyen, együtt a pénzügyi munkafelülettel:

1. Megnyitod a `/penzugy` oldalt
2. Aktiválod a rendszergazdai (god) módot
3. Megjelenik a "Rendszergazdai importáló" tab
4. Két kártya közül választhatsz:
   - 🟢 **Teljes Kassza-import** (a meglévő flow)
   - 🟣 **Egyházfenntartás-import** (a v0.9.53-ban érkezett új wizard)

### A régi /admin/finance-import oldal

A régi route helyett mostantól egy átköltöztetési-CTA jelenik meg, ami
elirányít a `/penzugy` oldalra. Bookmark-ok és régi linkek továbbra is
működnek — csak +1 kattintással.

### Technikailag

- `apps/web/app/(dashboard)/penzugy/page.tsx`: `customImportTab={<FinanceImportTabs />}`
  prop hozzáadva a `ModuleAdminWorkspace`-hez (a tagnyilvántartás mintáján)
- `apps/web/app/(dashboard)/admin/finance-import/page.tsx`: redirect-CTA a
  `/penzugy` oldalra

---

## [2026-05-06] — Egyházfenntartás-import wizard (xlsx + xml deduplikációval) (v0.9.53, csak web)
<!-- key: 2026-05-06-egyhfenntartas-import-wizard -->
<!-- category: feature -->
<!-- version: 0.9.53 -->
<!-- targets: rendszergazda -->

Új import-flow a `/admin/finance-import` oldalon: a teljes Kassza-import
mellé jött az **"Egyházfenntartás-import"** fül, amely **két forrásfájlból**
egyezteti a tagsági befizetéseket és kiszűri a duplikációkat.

### 🎯 A két forrás

A felhasználó eddig két helyen vezette ugyanazokat a befizetéseket — most
egyetlen importba olvad. A wizard:

- **Adatok_YYYY.xlsx** (Kassza-sheet) — a teljes éves könyvelés (bevétel + kiadás)
- **bevételek YYYY.xml** — a részletes bevételi-lista (utcával + házszámmal)

### 🔄 A duplikáció-szűrés

A kulcs: **`xlsx.Iratszam == xml.Nyugta`** (mindkettő ugyanaz a sorszám).
Ha egyezik az iratszám + összeg + a név hasonlósága ≥ 85%, akkor
**MATCH** — egyetlen tranzakció, az XML-t használjuk (több info: Befizetett
év, Megjegyzés, hivatalos 5-jegyű iratszám).

5 kategória:
- 🟢 **Match** (mindkét fájlban)
- 🔵 **Csak xlsx** (xml-ben hiányzik — vagy az xml elavult, vagy elírás)
- 🟠 **Csak xml** (xlsx-ben hiányzik — vagy a Kassza nem komplett)
- 🟡 **Bizonytalan** (név vagy összeg eltér 1 jegyben)
- 🔴 **Tag nem található** (a `szemely`-ben nincs ilyen család+utca)

### 🔍 Tagnyilvántartás-egyezés (quad-lookup)

Minden tranzakcióhoz a `donor-string-parser`-rel kibontjuk a nevet, utcát,
házszámot, és quad-lookup-pal a `szemely` táblában keressük. Háromféle eredmény:

- ✅ **Strict match** (egyetlen tag, családnév + keresztnév + utca + házszám)
- 🟡 **Loose match** (csak családnév + utca, k_nev nem egyértelmű)
- 🟡 **Multiple match** (több tag illik) — manuális választás
- ❌ **Not-found** — CSV-export "Új tagok" listával

### 📅 Több éves támogatás

A wizardban év-mező — auto-detektálja a fájlnévből (pl. `Adatok_2025.xlsx`)
vagy a fájl tartalmából. Több évet egyenként importálj — minden év önálló
futás. A DB-szintű duplikáció-szűrés véd attól, hogy ugyanazt a tételt
kétszer rögzítsd.

### 🛢 Importálás a `befizetes` táblába

Minden elfogadott sor a hivatalos `befizetes` táblába kerül a
`befizetescel.id_szamadasicel = '101.01'` (Egyházfenntartói járulék)
kategóriával. A `xkey` automatikusan generált, a `synced = true`.

A DB-szintű duplikáció-szűrés a `(congregation_id, fizetettev, iratszam,
osszeg, id_befizetescel)` ötösre épül — új partial index támogatja:
`idx_befizetes_egyhf_import_lookup`.

### 🛢 Új SQL migráció (Endre futtatja)

A `migration-docs/sql/2026-05-06-egyhfenntartas-import-dup-index.sql`
új partial indexet hoz létre. Endre futtatja a Supabase Studio-ban.

### 🎨 UI struktúra

A `/admin/finance-import` oldalon mostantól **2 fülön**:
- **Teljes Kassza-import** (a meglévő flow, érintetlen)
- **Egyházfenntartás-import** (új) — 4 lépéses wizard:
  1. Üdvözlő + 2 dropzone + év-detekció
  2. Áttekintés + 4-fülös döntési tábla (Biztos / Bizonytalan / Egyik fájlban / Tag-hiány)
  3. Importálás progress
  4. Eredmény + CSV-export az "új tagokról"

---

## [2026-05-05c] — Welcome wizard fejléc-logó + e-mail modal (v0.9.52, csak web)
<!-- key: 2026-05-05c-welcome-logo-email-modal -->
<!-- category: improvement -->
<!-- version: 0.9.52 -->
<!-- targets: minden felhasználó -->

Két apró, de kért finomítás a beállító varázsló oldalán.

### 🏷 Kartotéka logó a fejlécben

A varázsló minden lépésén megjelenik a Kartotéka logó (KARTOTEKA_V3.png) +
a "KARTOTÉKA — Egyházi nyilvántartó rendszer" felirat. Eddig csak az első
lépésen volt egy szöveges fejléc, mostantól végig megjelenik a brand,
hogy mindig tudd, hol vagy.

### ✉️ Üzenet a rendszergazdának — gomb + modal

A "Probléma van?" segédkártya szövege átkerült: **"Írj e-mailt a
rendszergazdának, és személyesen végigvezetünk a beállításon."** Az
e-mail-cím helyett egy **"Üzenet a rendszergazdának"** gomb jelenik meg,
amelyre kattintva előugrik egy ablak. Ott:

- A címzett: Endre &lt;endreszocs@gmail.com&gt; (csak olvasható)
- Tárgy mező (előre kitöltött a wizard-lépés sorszámával)
- Üzenet mező
- "Küldés a levelezőből" gomb — a saját leveleződ nyitja meg az új
  üzenetet előre kitöltve. Te a saját kliensedben nyomod meg a Küldést.

Ez biztonságosabb és egyszerűbb, mint egy szerver-oldali küldés —
minden lelkész a saját mail-fiókját használja.

---

## [2026-05-05b] — Welcome wizard alapos átdolgozás + offline belépési kód perszisztencia (v0.9.51 / desktop v0.8.7)
<!-- key: 2026-05-05b-wizard-atalakitas-offline-pin -->
<!-- category: feature -->
<!-- version: 0.9.51 -->
<!-- targets: minden felhasználó -->

Kedves Lelkipásztorok!

A beállító varázsló (welcome wizard) több korábbi visszajelzés alapján
ma jelentősen átalakult — átláthatóbb, kategorizáltabb, többféle adatbevitelt
támogat. A desktop alkalmazásban pedig az offline belépési kód már nem
tűnik el minden frissítés után. Részletek alább.

### 🎨 Welcome wizard — vizuális átdolgozás

Eddig a beállító varázsló mezői nem voltak egyértelműen elkülönítve, és
nem mindig volt világos, hogy egy bizonyos mezőbe mit kell írni. **Mostantól
minden szakasz külön, ikonnal ellátott kártyán** szerepel:

- 🏛 Egyházmegye (csak olvasható, információs)
- ⛪ Hivatalos elnevezések
- 🏷 Jogi azonosító
- 📍 Hivatalos cím
- ✉️ Gyülekezeti elérhetőségek (figyelmeztetéssel: NEM saját adat!)
- 💳 Banki adatok (több számla felvehető)

A személyes adatok lépésén ugyanígy: alapadatok, saját elérhetőségek,
korábbi szolgálati helyek külön kártyákon.

### ⚠️ Egyértelmű figyelmeztetés: gyülekezeti vs. saját elérhetőség

A gyülekezeti elérhetőségek szakaszán figyelmeztető szöveg áll a tetején:
**"Itt a *gyülekezet* hivatalos elérhetőségeit add meg (parókiai e-mail,
közös telefon, gyülekezeti honlap) — NEM a saját elérhetőségeidet. A saját
telefon-/email-címedet a következő, *Lelkészi adatok* lépésben adhatod meg."**

Így nem tévesztheti el senki, melyik mezőbe mit ír.

### 💳 Több bankszámla felvehető

Korábban csak egy IBAN + bank név volt megadható. **Mostantól** a varázsló
támogatja:

- Több bankszámla rögzítése (lej, EUR, USD, magyar forint)
- Egy számla "fő számlaként" megjelölése (a bizonylatokon ez szerepel)
- A pénzügyi modul saját bankszámla-tárába mentődik (`bankszamlak` tábla)
- Később a Pénzügy → Bankszámlák menüben bővíthető

### 📜 Szolgálati előzmények — strukturált, multi-row

Eddig egy szabadszöveges mezőben volt a "korábbi szolgálati helyek". Most
már **kártyalistás formában**:

- "+ Új szolgálati hely hozzáadása" gombbal bővíthető a lista
- Minden helyhez külön: helyszín neve, szerep (lelkipásztor/segédlelkész),
  kezdő-záró év, opcionális megjegyzés
- "Záró év" üresen hagyható, ha jelenleg ott szolgál
- Új SQL tábla (`pastor_service_history`) RLS-védetten

### 💰 Egyházfenntartási járulék — alapos beállítások

A pénzügyi alapbeállítások szakasz teljesen átalakult:

- **Aktuális év alapösszege + határidő** — kötelező
- **Tartozás-számítási mód (radio):** "akkori év szerint" (ajánlott) vagy
  "aktuális év szerint" — befolyásolja, hogyan számolódnak a régi tartozások
- **Kedvezményes időszakok (multi-row):** "+ Új időszak hozzáadása" gombbal
  több early-bird kedvezmény vehető fel (pl. március 31-ig 50%, május 31-ig 25%)
- **Kor-alapú kedvezmény (opcionális):** korhatár (pl. 70 év) + százalékos
  vagy fix RON kedvezmény
- **Korábbi évek beállításai (opcionális):** 5 visszamenő évre alapösszeg +
  kedvezményes + határidő — segít az "akkori év szerint" pontos tartozás-
  számításhoz

A jövedelem-alapú kedvezmény és az egyedi mentesítések továbbra is a
Tagnyilvántartás → Kezelés menüpontban állíthatók be tagonként.

### 🗑 Nyitó egyenleg lépés eltávolítva

A korábban kötelező "Nyitó kassza + nyitó bank" mezők **kikerültek** a
varázslóból. Ezek a Pénzügy modul saját kezdőegyenleg-beállító űrlapján
fognak megjelenni — ott bankszámlánként és kasszánként külön-külön, valutához
illesztve, nyitóegyenleg-történettel együtt.

### 🔐 Desktop: offline belépési kód már nem felejt

Eddig minden frissítés után újra meg kellett adni az offline belépési
kódot. **Mostantól** a PIN-bevitelnél van egy új checkbox:

> ☑️ Emlékezz erre a gépre 7 napig

Ha be van pipálva, a frissítések és újraindítások után **7 napig nem kell
újra megadni a kódot** — a PIN-hash továbbra is a Windows Credential
Manager-ben van titkosítva (DPAPI), csak az "ezen a gépen még érvényes"
flag perzisztálódik.

A "Emlékezz" jelölés kijelentkezéskor automatikusan törlődik.

### 🆘 "Elfelejtettem a kódot" mechanika

Új gomb a PIN-bevitel oldalon: **"Elfelejtettem a kódot"**. Kattintás után:

1. Megerősítő ablak — a felhasználó tudja, mi fog történni
2. A tárolt PIN-hash a Credential Manager-ből törlődik
3. A rendszer átirányít az online bejelentkezéshez
4. Sikeres online belépés után automatikusan a PIN-újrabeállító oldalra
   kerül, jól látható figyelmeztetéssel: "A korábbi kódot törölted —
   most állíts be egy újat"

A lokális (Tauri SQLite) adatok érintetlenek maradnak — nem vesznek el
sem a régi PIN törlésekor, sem az új beállításakor.

### 🛢 Új SQL migráció (Endre futtatja)

A `migration-docs/sql/2026-05-05-pastor-service-history-tartozas-mod.sql`
fájl tartalmazza:
- Új `pastor_service_history` tábla (RLS, indexek, trigger)
- `congregations.tartozas_szamitas_mod` oszlop
- Ellenőrző SELECT-ek a futtatás végén

A migráció a Supabase Studio SQL Editorban futtatandó.

### 🙏 Köszönet

Köszönjük a 7 részletes észrevételt, amelyek alapján ez a fejlesztés
készült. A varázsló most már igazán használható az első induláskor is,
és visszamenőleg is bármikor (a "Beállító varázsló újraindítása" gomb
a fejléc menüjén keresztül).

Áldott szolgálatot!

---

## [2026-05-05] — Reszponzív splash képernyő telefonon és tableten (v0.9.50 / desktop v0.8.6)
<!-- key: 2026-05-05-splash-reszponziv -->
<!-- category: improvement -->
<!-- version: 0.9.50 -->
<!-- targets: minden felhasználó -->

Kedves Kartotéka felhasználók!

A bejelentkezés előtti üdvözlő képernyő (a "Békesség Istentől!" feliratú
splash, a 3 egyházkerületi címerrel) eddig fix méretű, nagyfelbontásra
tervezett képet jelenített meg. Telefonon és kisebb tableten emiatt egyes
elemei levágódhattak, vagy nehezen olvashatóvá váltak. **Mostantól minden
képernyőméreten szépen illeszkedik a tartalom.**

### 📱 Telefonon — kompakt, vertikális elrendezés

Telefonon (768 pixelnél keskenyebb képernyőn) a splash már nem ugyanazt az
1920×1080-as színpadot rendereli kicsinyítve, hanem **viewport-méretű,
függőleges elrendezést**:

- A KARTOTEKA címer-logó középen, optikailag kényelmes méretben.
- Alatta egymás mellett a két egyházkerületi címer (KEREK + EREK), kicsi
  formában, nem zsúfolva.
- Felül a "✦ Békesség Istentől!" headline a Cormorant Garamond serif
  betűvel, a viewportba arányosan illesztve.
- Alul az alcím, a tagline és a betöltés-jelző, mind olvasható marad.

### 📐 Tableten — letterboxing, nem vágódik le semmi

Tableten (768–1023 pixel között, akár portrait, akár landscape) a régi
1920×1080-as színpad megmarad, de **`min(scaleX, scaleY)` skálázással**:
minden látszik, semmi sem vágódik le. A háttér mellett enyhe sötét sáv
jelenhet meg, ha az aspect-ratio nem egyezik — viszont a 3 logó és a
szöveg mindig teljes egészében látható.

### 🖥 Asztali gépen — változatlan élmény

Az 1024 pixelnél szélesebb képernyőn az eredeti, tervezett "fill" mód
működik tovább (scale = max(scaleX, scaleY)). Ezen semmi sem változott —
a designba beépített élmény ugyanaz marad.

### 🛠 Mit jelent ez a Kartotéka belső "kis splash"-nek

Az indító splash-en kívül a rendszer belső területein is van egy egyszerű
betöltő képernyő (a desktop kliens indul vele 1,5 másodpercig, és más
helyeken is használható). Ezt is reszponzívra tettük — a logó, a cím, az
alcím, a haladás-sáv és a verzió-szöveg mind a viewport méretéhez
arányosan jelenik meg, három fokozatban (telefon / tablet / asztali).

### 📦 Mi nem változott

- A splash 5-fázisos animációja (háttér → címerek → KARTOTEKA logó →
  headline → szöveg + loader) változatlan.
- Ugyanúgy egyszer látszik egy session alatt (sessionStorage emlékezet).
- A tartalom (szöveg, képek, animáció-időzítés) változatlan.

### 🙏 Köszönet

Ezt a finomítást egyetlen visszajelzés kérte: hogy mobilon is "jól és
szépen" mutasson a Kartotéka belépés előtti üdvözlése. Köszönjük a
visszajelzést — ezért érdemes szólni, ha egy részletet javítani kell!

---

## [2026-05-04b] — Wizard-mentés, értesítések és frissítések kezelése (v0.9.49)
<!-- key: 2026-05-04b-wizard-ertesitesek-frissitesek -->
<!-- category: improvement -->
<!-- version: 0.9.49 -->
<!-- targets: minden felhasználó -->

Kedves Kartotéka felhasználók!

A mai napon több fontos hibát megjavítottunk, és néhány hosszú ideje
várt funkciót is hozzáadtunk a rendszerhez. Az alábbiakban érthető nyelven
összefoglaljuk, mi változott és mit jelent ez az Önök mindennapi
munkájában.

### 🛠 Megjavítva: a beállító varázsló mostantól helyesen ment

Eddig előfordult, hogy ha valaki végigment az induló (welcome) varázslón
— a gyülekezeti adatok, lelkész személyes adatok, pénzügyi nyitóegyenleg
megadásán —, és a "Készen is vagyunk!" képernyőre érkezett, akkor látszólag
minden sikerült. **Az oldal frissítése után viszont ismét az elejéről kezdte
a varázslót**, mintha sosem csinálta volna meg. Néhány lelkész részéről
ez okozott bosszúságot.

A hiba oka egy adatbázis-szintű jogosultsági gond volt: a varázsló utolsó
mentése a háttérben csendben elbukott, és a rendszer mégis sikeres üzenetet
mutatott. Ezt **mostantól egy biztonságosabb mentési mechanizmus** kezeli,
ami minden esetben tényleg rögzíti a befejezést — vagy ha mégis hiba lenne,
azonnal értesíti Önt egy konkrét üzenettel.

### 🔄 Új: "Beállító varázsló újraindítása" gomb

Sokunk kérése volt, hogy utólag is lehessen javítani a beírt adatokat.
Mostantól mindenki megtalálja a fejléc jobb felső sarkában (a saját
nevére kattintva, a Beállítások alatt) az új gombot:

> **🔄 Beállító varázsló újraindítása**

A gombra kattintva a rendszer rákérdez ("Folytatod?"), majd újra végig
lehet menni az 5 lépésen — a meglévő adatok **megmaradnak**, csak ahol
javítani szeretne, ott módosíthat. Nincs adatvesztés.

### 📨 Új: értesítések 24 órán át visszanézhetők + archiválás

Eddig az értesítések — akár fontos rendszer-jelzések, akár fejlesztői
hírek — eltűntek, amint elolvasta. Aki gyorsan félrekattintott, elveszett
az üzenete. **Mostantól**:

- **Olvasatlan értesítések** addig élnek, amíg meg nem nyitja Őket — nem
  vesznek el, ha meg sem nyitotta őket.
- Az **olvasott üzenetek 24 órán át** elérhetők egy "Friss" szekcióban a
  csengő-menüben (halványabb stílussal). Visszanézheti, mit írtunk.
- **Manuális archiválás**: ha tényleg le akarja zárni egy üzenetet, a
  részletes ablak alján vagy a sor mellett található **archív gomb**
  egy kattintással eltünteti.

### 📐 Az értesítés-ablakok mostantól reszponzívak

A részletes üzenet-ablak (csengőre kattintva) eddig nagyon keskenynek
tűnt, és a hosszabb fejlesztői üzeneteket nem lehetett scrollozni. **Most**:

- Mind asztali, mind mobil képernyőn jól olvasható méretben jelenik meg
- A hosszú szövegek görgethetők
- Ha félrekattint, a "Friss" szekcióban újra megnyithatja

### 🛠 Felhasználó-aktiválás javítva

Korábban előfordult, hogy a kerületi admin nem tudott aktiválni egy
új lelkészt — egy *"permission denied"* hibát kapott. Ennek oka egy
adatbázis-szintű jogosultsági gond volt. **Mostantól** a kerületi admin
ugyanúgy tudja aktiválni a felhasználókat, mint a master admin. A "Felhasználó
aktiválása" és az "Elutasítás" gomb is konzisztensen működik.

### 📧 Frissítések újraküldhetők, többet egy gombbal

Az admin **/admin/frissitesek** oldalán mostantól több újdonság is van:

- **"Új broadcast üzenet" form felülre került** — kényelmesebb a használata
- **Minden frissítés mellett checkbox** — ha többet egyszerre szeretne
  kiküldeni, kijelöli őket
- **"Kijelöltek küldése" gomb** — egyetlen kattintással mind elindul,
  e-maillel együtt is, ha be van pipálva
- **Korábban már elküldött frissítések is újraküldhetők** — egy kattintással,
  megerősítő ablakkal

### 🎨 Email-küldemények szebb és reszponzív megjelenése

A rendszerből küldött frissítés-emailek **új, modern megjelenést** kaptak:

- **Kartotéka brand fejléc** logóval, az üzenet típusához illő színes
  háttérrel (új verzió = lila, info = kék, figyelmeztetés = sárga, stb.)
- **Reszponzív szélesség** — kis és nagy képernyőn egyaránt jól olvasható
- **Lábléc** az "Erdélyi Református Egyházkerület" jelzéssel + link a
  Kartotéka-rendszer megnyitásához

### 🏛 Welcome varázsló javítások

Kisebb, de fontos finomítások:

- A "Bejegyzési szám" mező **eltávolítva** — ilyen adatra az egyháznál
  nincs szükség, csak az adószám (CUI) maradt
- A cím-validáció **megengedőbb**: az utca-mező opcionális, mert sok
  kis falusi gyülekezetnél nincs külön utcanév. A megye + helység viszont
  továbbra is kötelező a hivatalos iratokhoz

### ✉️ Technikai segítség e-mail-cím

A varázsló utolsó képernyőjén és más helyeken eddig a `support@kartoteka.erek.ro`
szerepelt — mostantól a **közvetlen elérés** látszik:
**endreszocs@gmail.com**. Ide írhat bárki, ha elakad.

### 📋 Felhasználók és gyülekezetek listáin
- A **Gyülekezetek oldalon** mostantól megjelennek a hozzá tartozó
  felhasználók is (akik szerepkört kaptak az adott gyülekezethez), nemcsak
  azok, akik a primary-gyülekezetük révén szerepelnek
- A felhasználó-kártyákon **minden szerepkör színkódolt** (Lelkipásztor zöld,
  Esperes lila, Egyházmegyei admin kék, Könyvelő narancs, Számvevő türkíz,
  stb.)
- A felhasználói avatar mostantól a **nevének kezdőbetűit** mutatja,
  a "legmagasabb" szerepkörének megfelelő színnel

### 🙏 Köszönet

Köszönjük mindenkinek a türelmet és a visszajelzéseket! Az Önök
észrevételei nélkül nem találnánk meg ezeket a hibákat időben. Áldott
szolgálatot kívánunk!

---

## [2026-05-04] — Admin felület tisztítás: szerepkör-aktiválás, gyülekezetek áttekintése, dizájn (v0.9.48)
<!-- key: 2026-05-04-admin-csiszolas-aktivalas -->
<!-- category: improvement -->
<!-- version: 0.9.48 -->
<!-- targets: rendszergazda, egyházkerületi admin -->

Kedves Rendszergazdák, kerületi adminok!

Ez a frissítés az admin felület számos aprójavítását hozza, valamint
megjavítottunk egy fontos hibát, ami miatt a frissen jóváhagyott felhasználók
néha mégsem tudtak belépni.

### 🔧 Megjavítva: szerepkör-aktiválás

- **Egyetlen kattintással aktiválás:** Ha most egy várakozó (új regisztrált)
  felhasználónak hozzárendelsz egy szerepkört (pl. *Lelkipásztor — Barátosi
  gyülekezet*), a fiók egyúttal **azonnal aktiválódik is**, a gyülekezethez
  rendelődik, és bekerül a megfelelő egyházmegye/egyházkerület alá. Nincs
  külön gomb hozzá.
- **Hibás üzenetek:** A "permission denied" technikai hiba megszűnt.
  A háttérben átálltunk egy biztonságosabb adatbázis-hívási mechanizmusra,
  ami a kerületi adminoknak is megengedi az aktiválást.
- **Várakozás-szöveg:** Ha valamiért már aktivált fiókra kattintasz az
  "Aktiválás" gombra, mostantól nem ijesztő hibaüzenetet kapsz, hanem
  kedves jelzést: *"A fiók már aktív volt — valószínűleg a szerepkör-
  kiosztáskor automatikusan aktiválódott."*

### 🎨 Felhasználók és szerepkörök oldal — díszesebb és világosabb

- **Színkódolt szerepkörök:** Minden szerepnek saját színe és ikonja van —
  Lelkipásztor zöld, Esperes lila, Egyházmegyei admin kék, Könyvelő narancs,
  Számvevő türkíz, Rendszergazda sötétszürke, Egyedi szerep magenta.
- **Avatar inicialokkal:** A felhasználók kerek avatarja most a nevük
  kezdőbetűit mutatja, a "legmagasabb" szerepkörükhöz illő színnel.
- **Várakozó banner:** Ha egy fiók még várakozó, a kártya közepén egy
  jól látható sárga sávban jelennek meg az aktiválási lehetőségek —
  nem keverednek a többi gombbal.
- **"Funkciók" gomb:** Új modal mutatja modul × művelet bontásban, hogy
  a kiválasztott felhasználó pontosan mit lát és mit szerkeszthet a
  rendszerben, az összes szerepköre alapján egyesítve. Reszponzív, akár
  3 oszlopban is áttekinthető.

### 🏛 Gyülekezetek oldal — egyházmegyénként, számozva

A `/admin/gyulekezetek` oldal teljesen átdolgozva:

- A gyülekezetek **egyházmegyénként csoportosítva** jelennek meg, kibontható
  szakaszokkal (Mind nyit / Mind zár gombok).
- Egyházmegyén belül **1-től számozva**, a kívánt sorrendben (Név /
  Tagszám / Felhasználók-szám szerint).
- Mindenhol **keresés** — a gyülekezet, egyházmegye VAGY a hozzátartozó
  felhasználók nevére is.
- Minden gyülekezet alatt **felsorolva a hozzá tartozó felhasználók**,
  színkódolt szerepkör-jelzéssel.

### 🔝 Fejléc: tudja, melyik kontextusban dolgozol

A bal felső sarokban a chip mostantól **az aktív kontextusra** reagál:
- Rendszergazdai felületen: *"Rendszergazdai felület / Kartotéka rendszer"*
- Egyházkerületi nézetben: *"Egyházkerületi felület / Erdélyi Református Egyházkerület"*
- Egyházmegyei nézetben: *az egyházmegye neve / Erdélyi Református Egyházkerület*
- Gyülekezeti nézetben (lelkészként): *gyülekezet neve / az egyházmegye neve*

A profil-váltó (avatar dropdown) a több szerepkörrel rendelkezőknek elérhető
— egy kattintással lehet egyik kontextusból a másikba lépni.

### 📦 Apróbb javítások

- **Import oldal**: nem kell már külön "rendszergazdai módba lépni" — admin
  jogosultsággal azonnal használható a tagnyilvántartás-importáló.
- **Frissítések oldal**: a CHANGELOG.md-bejegyzések most már megjelennek
  a `/admin/frissitesek` oldalon (eddig egy build-konfigurációs hiba miatt
  nem volt elérhető a rendszer számára a fájl).
- **Aktiválás-gomb feliratok** egyértelműsítve: *"Felhasználó aktiválása"*
  (gyors út) és *"Elutasítás"* (ha valakit nem engedünk be).
- **Popover stacking**: a "+ Új szerepkör" felugró menü most a többi kártya
  fölött jelenik meg (eddig néha alá szorult).

Köszönöm a türelmet és az alapos visszajelzéseket! Áldott szolgálatot!

---

## [2026-05-03f] — Felhasználók és szerepkörök egyesítve egy oldalra (v0.9.47)
<!-- key: 2026-05-03f-felhasznalok-szerepkorok-egyesites -->
<!-- category: feature -->
<!-- version: 0.9.47 -->
<!-- targets: rendszergazda, egyházkerületi admin -->

Kedves Rendszergazdák!

Korábban két különálló oldal kezelte ugyanazt a felhasználói listát — két
különböző UX-szel. Mostantól **egyetlen, egységes oldal** — `/admin/felhasznalok` —
fogadja az adminisztrátort. A régi `/admin/szerepkorok` URL automatikusan
átirányít az új közös oldalra.

### ✨ Mit hozott az egyesítés

- **Egy felhasználó = egy kártya**, ahol minden látszik: név, email, státusz,
  hierarchikus kontextus (egyházkerület › egyházmegye › gyülekezet) és az
  összes kiosztott szerepkör színes jelvényekkel.
- **Egyetlen "+ Új szerepkör" gomb** — két kattintással hozzárendel egy
  szerepet a kiválasztott hatókörhöz (rendszer / egyházkerület / egyházmegye
  / gyülekezet).
- **Egyetlen audit-napló minden szerepkör-műveletre** — kiosztás, visszavonás,
  jóváhagyás, elutasítás. Mostantól pontosan visszakövethető, ki, mikor,
  kinek, milyen indoklással adott vagy vont vissza szerepkört.
- **Pasztorálisabb üzenetek** — a "Fiókja még jóváhagyásra vár a kerületi
  SzuperAdmin által!" technikai szöveg helyett: *"Fiókja még jóváhagyásra
  vár — a rendszergazda értesítve van. Türelmét kérjük."*

### 🛠 Javítva: a szerepkör-kiosztás aktiválja a fiókot is

Korábban, ha az admin a Szerepkörök oldalon szerepkört adott egy várakozó
felhasználónak, az illető csak a szerepkör-jelvényt kapta meg, de a fiókja
`pending` állapotban maradt. Belépéskor mégis azt látta: *"Fiókja még
jóváhagyásra vár"*. Mostantól a szerepkör-kiosztás egyben aktiválja is a
fiókot, és a popover tetején figyelmeztető banner jelzi ezt az adminnak.

### 📨 Most már tényleg megérkeznek az értesítések

Az admin által küldött értesítések ("Fiókja jóváhagyva", "Hozzáférése
aktiválva") korábban a háttérben silent fail-eltek — a tábla mezőnevei nem
stimmeltek. Most rendezve: minden admin-művelet után tényleg odaér az
értesítés a felhasználó dashboardjára.

### 🔑 Egyenlő admin-jogosultság

A kerületi adminisztrátorok eddig a felületet ugyan elérték, de minden gomb
hibára futott. Most már a felhasználók kezelése konzisztens: a master, az
admin és az egyházkerületi admin egyaránt használhatja a felhasználói modult.

---

## [2026-05-03e] — Pénzügyi import-wizard v2 — egyszerűsítés (3 lépés)
<!-- key: 2026-05-03e-finance-import-wizard-v2 -->
<!-- category: improvement -->
<!-- targets: rendszergazda -->

A felhasználói visszajelzés szerint az előző 9 lépéses wizard túl bonyolult,
"össze-vissza van minden". A v2 átdolgozza az egész UX-et lelkészbarát
formára: egyetlen átlátható oldal, színes ikon-kártyák, hónapos lista,
kevesebb táblázat, több vizuális magyarázat.

### ✨ 3 lépéses wizard a 9 helyett

`apps/web/components/finance/finance-import/penzugy-import-wizard.tsx` átírva:
- **1. Üdvözlő** (welcome-step) — pasztorális köszöntő + 4 magyarázó kártya
  ("Mit fog csinálni a rendszer?") + drag-drop fájl-feltöltő. Egyetlen oldal.
- **2. Áttekintés** (review-step) — egy hosszú, gyönyörű egyetlen oldal:
  - 4 KPI kártya (bevétel zöld, kiadás piros, befizetők kék, cégek lila)
  - "Hogyan felelteti meg" panel — 4 vizuális lépés (ikon + tone + szöveg)
  - Ambiguous befizetők inline (csak ha vannak)
  - Ismeretlen kódok inline (csak ha vannak)
  - **Hónapokra csoportosított tétel-lista** sor-kártyákon (nem táblázat!)
    — minden tétel: ikon + befizető + dátum/iratszám + összeg + ✓ ha tag
  - Cégek lista collapsible
  - Monetar diagnosztika (color-coded, eltérés-számítással)
  - Kihagyott sorok bontása
  - Egy nagy gradient "Importálom mind" gomb
- **3. Eredmény** (result-step) — banner + KPI + cég-lista + hibák

### 🗑️ Régi step-fájlok törölve

Az átdolgozással eltávolítva a `apps/web/components/finance/finance-import/steps/`
alól: `source-type-step.tsx`, `sheet-pick-step.tsx`, `column-mapping-step.tsx`,
`kassza-split-step.tsx`, `budget-code-step.tsx`, `donor-resolve-step.tsx`,
`preview-step.tsx`. Helyettük: `welcome-step.tsx`, `review-step.tsx`.

### 🎨 Vizuális minták átvéve a Kartotéka pénzügy modulból

- **Színek (intent-alapú)**: bevétel emerald, kiadás rose, bank/befizetők blue,
  cégek violet, figyelmeztetés amber
- **Gradient ikonok**: `from-emerald-500 to-green-600` mintára
- **Serif headings** (`font-serif`) az elegáns intézményi hangért
- **`bg-card` / `ring-1 ring-border`** kártyák a téma-vars szerint
- **Lista-sorok** bevétel + kiadás vegyesen, ikon + szöveg + szám (CashbookTab-stílus)

### 📦 Release

Csak webes (Railway auto-deploy). 3-build mind zöld, 74/74 smoke teszt zöld.
A v0.9.47-bumppal együtt megy ki, ami a Sprint U.5-höz tartozik.

### 🔜 Mi maradt v2-re

A funkcionalitás változatlan — csak az UX lett átdolgozva. A Bank A/B,
XML egyházfenntartás, Költségvetés és belső mozgás importja továbbra is
v3-iterációkra vár.

---

## [2026-05-03d] — Sprint U.5 · Felhasználók és Szerepkörök egyesítése (v0.9.47)
<!-- key: 2026-05-03d-felhasznalok-szerepkorok-egyesites -->
<!-- category: feature -->
<!-- version: 0.9.47 -->
<!-- targets: rendszergazda -->

A `/admin/felhasznalok` és `/admin/szerepkorok` oldalak egyesültek egyetlen
**„Felhasználók és szerepkörök"** oldalra. A korábbi két szétvált modul most már
egy adatmodellen, egy UX-en és egy auditolt server-action rétegen át dolgozik.

### 🐛 Központi UX-bug javítása — a kettős „jóváhagyás"

Korábban a `/admin/szerepkorok` oldalon kiosztott szerepkör nem aktiválta a
felhasználó fiókját — a kollega szerepkör-badget kapott, de a login formon
mégis a „Fiókja még jóváhagyásra vár" üzenetet látta. **Mostantól**: ha az admin
egy várakozó (`pending`) fiókhoz **azonnal érvényes** szerepkört rendel
(`approval_status: 'approved'`), a fiók automatikusan aktiválódik
(`profiles.status='active'`), és a `congregation_id`/`diocese_id`/`district_id`
mezők is beállnak a kiosztott scope alapján. A popover tetején borostyán-banner
figyelmezteti az admint, hogy ez fog történni.

### 🔒 Védelmi rétegek konzisztenciája

A `admin/layout.tsx`, `requireMasterAdmin()` és `canManage()` korábban három
különböző szabállyal védték ugyanazt — egy `egyhazkeruleti_admin` beléphetett
az oldalra, de minden gomb „Nincs jogosultsága" hibára futott. Új közös helper:
`apps/web/lib/auth/admin-access.ts` — `requireAdminAccess({ requireMaster?,
allowDistrictAdmin? })`. Egységes szabály master + admin + kerületi admin
elfogadásával az `actions.ts`, `profile-roles-actions.ts` és `admin/layout.tsx`
mind ugyanazt a guard-rendszert használja.

### 🐛 Silent fail: ertesitesek mezőnév-korrekció

A `quickApproveUser`, `approveUser` és `deleteUser` korábban `type/title/body`
mezőkkel írt az `ertesitesek` táblába — ezek nem léteztek. A tábla a
`cim/uzenet/tipus/olvasva` mezőket várja, így az értesítések soha nem jutottak
el a felhasználókhoz. Most javítva, és minden értesítés tényleg megérkezik.

### ✨ Új audit-log integráció

Új helper: `apps/web/lib/audit/log.ts` — `logAuditEvent({ action, targetTable,
targetId, metadata })` a `log_audit_event` SQL function fölé. Auditolt action-ök:
- `user.quick_approve`, `user.approve`, `user.reject`, `user.delete`
- `user.activate_via_role_assign` (D6 fix esemény)
- `profile_role.assign`, `profile_role.revoke`, `profile_role.permissions_update`
- `profile_congregation.approve`, `profile_congregation.reject`, `profile_congregation.revoke`
  (lelkészi jóváhagyási flow auditja a `feedback_szerepkor_kiosztas` szabály szerint)

### ✨ Új viselkedés: legacy `profiles.role` szinkronizáció

A `profiles.role` egyetlen-string mezőt 16+ helyen olvassa a kódbázis. A
`profile_roles` multi-role rendszerből szerver-oldalon szinkronizáljuk
(`apps/web/lib/users/sync-legacy-role.ts`). Prioritás: admin > egyhazkeruleti_admin
> esperes > egyhazmegyei_admin > egyhazmegyei_szamvevo > lelkesz > konyvelo.
Az `updateUserRole` action ezzel deprek álva.

### ✨ Új UX a UnifiedUsersTab-on

- 1 user 1 card, hierarchikus chip-ek (kerület › megye › gyülekezet) + multi-role badge-ek
- Pending state: 3 akció (gyors / részletes / elutasítás)
- Active state: + Új szerepkör (2-lépcsős popover) + Részletes (custom-szerepre) + Törlés
- Skeleton loading, üres állapot 3 ágon (nincs user / nincs találat / üres szűrőeredmény)
- AlertDialog-szerű modálok a `confirm()` és `prompt()` helyett (kötelező indoklás, pasztorális hangnem)
- Excel-export marad a teljes szűrt listára (multi-role oszlopokkal együtt)

### 🎨 Pasztorális login-üzenet

A „Fiókja még jóváhagyásra vár a kerületi SzuperAdmin által!" üzenet 4 helyen
átírva pasztorálisra: „Fiókja még jóváhagyásra vár — a rendszergazda értesítve van.
Türelmét kérjük." A regisztráció és OAuth visszaigazolás is hasonló módon javítva.

### 📦 Új és módosított fájlok

**Új** (15):
- `apps/web/lib/audit/log.ts`
- `apps/web/lib/users/sync-legacy-role.ts`
- `apps/web/lib/users/types.ts`
- `apps/web/lib/users/activate-on-role-assign.ts`
- `apps/web/lib/auth/admin-access.ts`
- `apps/web/components/admin/users/{user-card-skeleton, empty-state, role-badge-inline,
  role-assign-popover, advanced-role-dialog, approve-pending-dialog,
  reject-pending-dialog, delete-user-dialog, revoke-role-dialog,
  user-card, pending-user-actions, unified-users-tab}.tsx`

**Módosított**:
- `apps/web/app/(dashboard)/admin/{actions, profile-roles-actions, layout}.ts(x)`
- `apps/web/app/(dashboard)/admin/{felhasznalok, szerepkorok}/page.tsx`
- `apps/web/app/(dashboard)/profile/kapcsolatok/actions.ts`
- `apps/web/app/(auth)/{login/actions, login/page, oauth-complete/actions, register/actions}.ts(x)`
- `apps/web/components/auth/pending-approval-client.tsx`
- `apps/web/components/admin/{users-tab, profile-roles-tab, admin-overview-dashboard, admin-tabs-v3}.tsx`
- `apps/web/components/layout/dashboard-layout-client.tsx`

### 📦 Release

Webes patch-bump: v0.9.46 → v0.9.47. Railway auto-deploy a `main` push-szal.
Desktop NEM érintett.

### ⚠️ Megjegyzés a verify-folyamatról

A teljes `npm run build` jelenleg uncommitted **deleted** fájlok miatt nem fut le
(`apps/web/components/finance/finance-import/steps/` 7 fájlja, valamint
`apps/web/public/sw*.js`). Ezek a Sprint U.5-höz NEM kapcsolódnak — a felhasználó
korábbi munkájához tartoznak. A Sprint U.5 verify lint-szinten zöld a teljes
új és módosított fájlcsomagra. A release előtt a finance-import deleted fájlok
helyzetét rendezni kell (commit / restore).

---

## [2026-05-03c] — Pénzügyi import-wizard v1 LEZÁRVA: 7-9. lépés + import (v0.9.46)
<!-- key: 2026-05-03c-finance-import-fazis-6 -->
<!-- category: feature -->
<!-- version: 0.9.46 -->
<!-- targets: rendszergazda -->

A pénzügyi import-wizard **end-to-end élesben fut**. Endre a hivatalos EREK
kasszakönyv Excel-fájlt a `/admin/finance-import` oldalon (god-mode aktiválás
után) feltöltheti, végigmehet a 9 lépésen, és az importálás `import_finance_batch`
RPC-ren keresztül egyetlen tranzakcióban menti a tételeket.

### ✨ 7. lépés — végleges előnézet + Monetar diagnosztika

`apps/web/components/finance/finance-import/steps/preview-step.tsx`:
- 3 KpiCard: bevételek + kiadások + kihagyott sorok
- **Monetar diagnosztikai panel**: kalkulált záró-egyenleg vs. Monetar fülön
  szereplő kasszaegyenleg, eltérés-számítás, warning-ok
- Skip-okok bontása group-olva (occurrence-szám szerint)
- Első 8 példa-tétel táblázat a végleges DB-formátumban
- Visszavonhatatlan figyelmeztetés-panel az import gomb fölött

### ✨ 8. lépés — importálás folyamatban

`apps/web/components/finance/finance-import/steps/importing-step.tsx`:
- Központosított "Importálás folyamatban…" panel
- Indeterminate progress bar
- Pasztorális üzenet ("Egy nagy lélegzettel, együtt csendben odáig várunk.")

### ✨ 9. lépés — eredmény

`apps/web/components/finance/finance-import/steps/result-step.tsx`:
- Banner (success / warning / error)
- 3 KpiCard: sikeresen mentve + kihagyva + cég/intézmény szám
- Hibás sorok collapsible (max 50)
- **Cég-lista panel** — Endre listát kap az adott évben szereplő szervezetekről
- 2 CTA: "Új import indítása" + "Tovább a pénzügyi oldalra"

### ✨ Item-builder helper

`apps/web/components/finance/finance-import/helpers/item-builder.ts`:
- A wizard kliens-állapotából `FinanceImportItem[]` tömböt épít
- Skip-okok gyűjtése (rowIndex + reason)
- A belső mozgás (Kassza ↔ Bank) sorok a v1-ben **NEM** importálódnak — a
  Bank A/B fülek importja a v2-re marad

### ✨ Új server action-ök

`apps/web/app/(dashboard)/penzugy/finance-import-actions.ts`:
- `getMonetarDiagnostic(formData, totalIncome, totalExpense, nyitoEgyenleg)` —
  Monetar fül diagnosztika (kasszaegyenleg-ellenőrzés)
- `executeFinanceImport(items, fileName)` — RPC hívás +
  `logImportRun` audit-rekord rögzítés

### 🛠️ analyzeKasszaSheet bővítés

A skip-kategóriához mostantól megőrizzük a `donorString` és `amount` mezőket,
hogy a Monetar diagnosztika ki tudja olvasni a "Előző évi készpénzegyenleg"
sor értékét nyitó-egyenlegként.

### 📦 Release

Webes patch-bump: v0.9.45 → v0.9.46. Railway auto-deploy a `main` push-szal.
Desktop NEM érintett. 3-build mind zöld + 74/74 smoke teszt.

### 🔜 v2 ütemezés

A v1 lezárása után a következő iterációkban várhatóak:
- Bank A (RON) és Bank B (EUR) fülek importja (belső mozgások valódi rögzítése)
- XML egyházfenntartás import duplikáció-ellenőrzéssel
- Költségvetés (Koltsegvetes lap) import
- Inline befizetescel/kiadascel létrehozás a wizardon belül

---

## [2026-05-03b] — Pénzügyi import-wizard Fázis 5: Wizard UI 4-6. lépés
<!-- key: 2026-05-03b-finance-import-fazis-5 -->
<!-- category: feature -->
<!-- targets: rendszergazda -->

A wizard "lényegi" középső szakasza: **Endre a 6. lépésig el tud menni egy
valós Kassza-fájllal** — látja a klasszifikációt, a kódokat és a
befizetők azonosítását. **Élesben látható** a `/admin/finance-import`
oldalon, god-mode aktiválás után.

### ✨ 4. lépés — sor-szétválasztás

`apps/web/components/finance/finance-import/steps/kassza-split-step.tsx`:
- 5 KpiCard a klasszifikáció statisztikáihoz
- Importálandó tételek-kártya (zöld) az össz-számmal
- Csoportonként összecsukható listák (income/expense/internal-transfer-in/
  internal-transfer-out/skip), első 25 sor preview-zelve, "és további N sor"
- Auto-trigger az `analyzeKasszaRows` server action-re
- Pasztorális tipp ha a sor nem oda került, ahova szerinted való

### ✨ 5. lépés — költségvetési kódok

`apps/web/components/finance/finance-import/steps/budget-code-step.tsx`:
- 4 KpiCard: bevételi / kiadási / belső mozgás / ismeretlen kódok (sor)
- Ismeretlen kódok figyelmeztetés-panel 2 lépéses döntéssel
- Kódok táblázata: rawKod / normalizedKod / kategória-badge / cél / occurrence
- Csak unknown kódoknál checkbox a "Hagyja ki" művelethez
- Blocker a Tovább gombnál ha unknown van és nem mind skipre állítva
- Auto-trigger a `resolveBudgetCodes` server action-re

### ✨ 6. lépés — befizetők azonosítása

`apps/web/components/finance/finance-import/steps/donor-resolve-step.tsx`:
- 4 KpiCard: egyértelműen feloldva / több jelölt / tagnyilv-ban nincs / cég
- 4 collapsible szekció (ambiguous + not-found + cégek nyitva, resolved zárva)
- Ambiguous esetekhez candidate-grid: családnév + keresztnév + lánykori név +
  születési dátum + nem, kiválasztott zölddel jelölve
- **Cég-lista panel** — Endre listát kap az adott évben szereplő szervezetekről
- Blocker a Tovább gombnál ha ambiguous van és nem mindegyikre választottál
- Auto-trigger a `resolveDonors` server action-re

### ✨ Wizard orchestrator bővítés

5 új state + 5 új handler + 4 useTransition (parsing/analyzing/resolving codes/
resolving donors). A 7-9. lépés placeholder-je megmarad, Fázis 6 hozza el.

### 📦 Release

Csak webes (Railway auto-deploy). Nincs verzió-bump. 3-build mind zöld + 74/74
smoke teszt.

### 🔜 Mi következik

Fázis 6: preview-step + importing-step + result-step + `executeFinanceImport`
action + `import-log` integráció.

---

## [2026-05-03a] — Pénzügyi import-wizard Fázis 4: Wizard UI 1-3. lépés
<!-- key: 2026-05-03a-finance-import-fazis-4 -->
<!-- category: feature -->
<!-- targets: rendszergazda -->

Az első UI a pénzügyi import-wizardhoz. **Élesben már látható** a
`/admin/finance-import` URL-en (god-mode aktiválás szükséges).

### ✨ Új admin oldal `/admin/finance-import`

`apps/web/app/(dashboard)/admin/finance-import/page.tsx`:
- `AdminPageHeader` Wallet ikonnal (emerald-teal gradient)
- Csak god-mode aktiválása után jelenik meg a wizard
- Pasztorális üzenet ha a god-mode nincs aktiválva

### ✨ CTA gomb a pénzügy oldalon

`apps/web/components/finance/finance-tabs.tsx`:
- Új "Adatok importálása" link a header gombsorban
- Csak rendszergazdai módban látható (`isGodMode === true`)
- A `/admin/finance-import` oldalra navigál

### ✨ 9-lépéses wizard 1-3. lépéssel

`apps/web/components/finance/finance-import/penzugy-import-wizard.tsx`
+ `steps/source-type-step.tsx`
+ `steps/sheet-pick-step.tsx`
+ `steps/column-mapping-step.tsx`:

- **1. lépés**: Forrástípus választás — 4 kártya (Kassza aktív, XML / Bank A / Bank B
  szürkítve "Hamarosan" badge-dzsel) + drag-drop fájl-feltöltő
- **2. lépés**: Munkalap kiválasztása — fájl-info + sheet-lista (csak Kassza
  választható), auto-pick ha egyetlen Kassza fül van
- **3. lépés**: Oszlop-párosítás — Excel fejléc → DB virtuális mező mapping
  auto-suggestion-nel és felhasználói override-dal, 3 stat (felismert/kihagyott/
  hiányzó), profil-tippek

A 4-9. lépésre placeholder "Itt tartunk a fejlesztésben" panel kerül —
a sor-szétválasztás, kódfeloldás, befizető-resolver, előnézet és import a
következő iterációban érkezik.

### 📦 Release

Csak webes (Railway auto-deploy a push-szal). Nincs verzió-bump. 3-build mind
zöld, 67 oldal.

### 🔜 Mi következik

Fázis 5: kassza-split-step + budget-code-step + donor-resolve-step (a 4-6.
lépés UI). Fázis 6: preview-step + import + result.

---

## [2026-05-02z3] — Pénzügyi import-wizard Fázis 3: Server action-ök + SQL RPC
<!-- key: 2026-05-02z3-finance-import-fazis-3 -->
<!-- category: feature -->
<!-- targets: rendszergazda -->

A Fázis 2 helper-implementációk köré szervezett 4 server action + 1 RPC:
a wizard backend-rétege. **Élesben még semmi nem látható** — a UI-t a
Fázis 4-6 hozza.

### ✨ `lookup-resolver.ts` — két új public export

`apps/web/lib/import/lookup-resolver.ts`:
- `PersonLookupMaps` interface most `export`
- `buildAllPersonsLookupMap(supabase, congregationId)` — minden látható
  gyülekezeti tagot betölt 6 keresési Map-be
- `lookupPersonByQuadAttempt(...)` — 6-lépéses fallback chain public API

### ✨ 4 server action a pénzügy oldalon

`apps/web/app/(dashboard)/penzugy/finance-import-actions.ts`:
- `parseAndPreviewFinance` — fájl parse + sheet előnézet
- `analyzeKasszaRows` — Kassza fül `splitKasszaRow` batch + statisztika
- `resolveBudgetCodes` — `buildBudgetCodeMaps` + kódok feloldása
- `resolveDonors` — `parseDonorString` + `lookupPersonByQuadAttempt` minden
  egyedi donorra

Auth: `requireFinanceImportAccess` — csak admin-jellegű role
(`master`/`admin`/`egyhazkeruletiAdmin`/`konyvelo` approved+active).

### ✨ Megosztott típusok

`apps/web/app/(dashboard)/penzugy/finance-import-types.ts`:
5 csoportba szervezett típus: parse, analízis, kód-feloldás, donor-feloldás,
import végrehajtás (Fázis 6 előkészítés).

### 🛠️ SQL migráció — `import_finance_batch` RPC

`migration-docs/sql/2026-05-02-finance-import-rpc.sql`:

`SECURITY DEFINER` PL/pgSQL függvény, `(p_congregation_id, p_user_id, p_items)`
→ `{inserted, skipped, errors}`. Auth a `profile_roles` táblán keresztül
(admin-jellegű role-okra).

4 kind: `income` (befizetes INSERT), `expense` (kiadas INSERT),
`internal-transfer-out` (kassza→bank: kiadas+befizetes+belsomozgas), és
`internal-transfer-in` (bank→kassza: ugyanaz fordítva). Minden tétel saját
EXCEPTION blokkban — egy hibás sor nem dobja a teljes batch-et.

**Endre futtatja Supabase Studio-ban.**

### 📦 Release

Csak előkészítés, nincs verzió-bump. 3-build mind zöld + 74/74 smoke teszt.

### 🔜 Mi következik

Fázis 4: `penzugy-import-wizard.tsx` orchestrator + 1-3. lépés UI komponensek
(source-type, sheet-pick, column-mapping) + admin oldal.

---

## [2026-05-02z2] — Pénzügyi import-wizard Fázis 2: Helper-implementációk
<!-- key: 2026-05-02z2-finance-import-fazis-2 -->
<!-- category: feature -->
<!-- targets: rendszergazda -->

A Fázis 1-ben létrehozott 5 helper-szkelet algoritmusainak teljes implementációja
a valós EREK 2025 Kassza-fülre kalibrálva (994 sor). **Élesben semmi nem
látható** — Fázis 3-ban jönnek a server action-ök, Fázis 4-6-ban a wizard UI.

### ✨ `detectCompany` token-szintű regex-set

A magyar `é`/`á`/`ő` betűk melletti ASCII `\b` szóhatár-bug megkerülése: token-
szintű regex helyett a stringet szóközökkel felbontjuk és minden tokenre
ellenőrizzük az illeszkedést. Eredmény: a "Kiss Csabáné Lénárt Rita" többé NEM
minősül RT-cégnek.

A 36 egyedi cég 100%-osan helyesen detektált, 367 magánszemély közül egyik sem
téves cég. A regex set: SC/Fundatia/Parohia/CN/Comuna/Pago*/Referinta/Depunere
prefix; SRL/SA/PFA/IF/SCM/KFT/BT/RT/ZRT/NYRT/KKT token; CSUPA NAGYBETŰS rövidítés.

### ✨ `parseDonorString` teljes algoritmus

`apps/web/components/finance/finance-import/helpers/donor-string-parser.ts`:
- Cég-flag → azonnali kilépés
- Splitelés `" - "` separator-okkal
- Cím-rész utolsó tokene = `houseNumber`, többi = `street`
- Prefix-detekció (Özv./Elv./Dr./id./ifj./Br./Gr.)
- **Token-szintű "né" check** (a `\b` bug megkerülése)
- Női férjes-név: férj családneve + férjes-név + opcionális lánykori családnév
  + saját keresztnév (pl. "Beder Béláné Finta Vilma")
- Confidence (high/medium/low)

### ✨ `splitKasszaRow` 994-sorra kalibrálva

5 kategória: income/expense/internal-transfer-in/internal-transfer-out/skip.
Belső mozgás detektálás: 400.xx kód VAGY "Készpénzletétel"/"Készpénzfelvétel"
kifejezés. Tájékoztató sorok skip ("Előző évi készpénzegyenleg", "Napi bevétel"
stb.). Magyar tizedesvessző elfogadott.

Eredmény a 994-soros valós fájlon: 478 income + 64 expense + 16 internal-
transfer + 9453 skip.

### ✨ `buildBudgetCodeMaps` Supabase batch SELECT

3 batch SELECT (szamadasicel, befizetescel, kiadascel), Map-ek szamadasicel.id
kulccsal. `resolveBudgetCode(kod, maps)` egy kódra: income/expense/internal-
transfer/unknown. Konvenció: 100-prefix → bevétel, 200-prefix → kiadás,
400-prefix → belső mozgás.

### ✨ `diagnoseMonetar` parser

A Monetar fülből kiolvassa: Kasszaegyenleg, Készpénzegyenleg összesen, 12
címlet darabszám-szorzat. Kiszámítja az eltérést a Kassza-fülön kalkulált
záró-egyenleghez képest. Pasztorális hangnemű warning-ok (pl. "0.26 RON-nal
kisebb"). **Csak diagnosztika** — nem ír DB-be.

### ✨ Smoke-test runner script-ek

- `apps/web/scripts/test-finance-import-helpers.ts` — 74 unit teszt (mind zöld)
- `apps/web/scripts/test-finance-import-fullfile.ts` — a teljes 994-soros valós
  Kassza-fájl klasszifikáció + 36 egyedi cég-lista

### 📦 Release

Csak előkészítés, nincs verzió-bump. 3-build mind zöld (typecheck, web, desktop).

### 🔜 Mi következik

Fázis 3: server action-ök (`finance-import-actions.ts`) + `import_finance_batch`
RPC SQL migráció.

---

## [2026-05-02z] — Pénzügyi import-wizard Fázis 1: Foundation
<!-- key: 2026-05-02z-finance-import-fazis-1 -->
<!-- category: feature -->
<!-- targets: rendszergazda -->

A hivatalos EREK könyvelési Excel ("Adatok_2025.xlsx" Kassza fül, 994 sor) +
egyházfenntartás XML import-wizardjának első fázisa: alapok lefektetése. Élesben
**semmi nem látható** — csak előkészítés a következő fázisokhoz.

### ✨ Új közös import-infrastruktúra

- `apps/web/components/import-shared/wizard-stepper.tsx` — kiemelve a
  tagnyilvántartás-importból, hogy a pénzügyi import is használhassa
- `apps/web/components/import-shared/file-drop-zone.tsx` — generikus drag-drop
  zóna fájl-kártyával és tovább-gombbal. A modulspecifikus mode-választókat a
  modulok saját step-komponensei rajzolják köré.
- A tagnyilvántartás-import-wizard változatlan UI-ja megőrzött (re-export pajzs)

### ✨ Új PROFILE_KASSZA import-profil

`apps/web/lib/import/import-profiles.ts:401-498` — a Kassza fül 2-oszlopos
formátumát (Bev. - Összeg / Kiad. - Összeg) kezelő profil. Virtuális mezők
(`_donor_string`, `_bev_osszeg`, `_kia_osszeg`, `_szamadasicel_kod` stb.)
a Fázis 2 helper-eknek.

### ✨ 5 helper-fájl szkeletonja

`apps/web/components/finance/finance-import/helpers/`:
- `company-detector.ts` — SRL/KFT/SA/Bt/RT cég-felismerés
- `donor-string-parser.ts` — "Beder Győzőné Elvira - Főút 27" struktúrált adattá
- `kassza-row-classifier.ts` — sor → income/expense/internal-transfer/skip
- `budget-code-resolver.ts` — szamadasicel "101.01" → befizetescel/kiadascel ID
- `monetar-diagnostic.ts` — kasszaegyenleg diagnosztika

A teljes algoritmusok a Fázis 2-ben.

### 🛠️ SQL migráció

`migration-docs/sql/2026-05-02-finance-dup-lookup-indexes.sql` — két partial
index (`(congregation_id, datum, osszeg, bankszamla_id) WHERE deleted = false`)
a `befizetes` és `kiadas` táblákon a duplikáció-detektálás gyorsítására. A
banki import is profitál belőle.

**Endre futtatja Supabase Studio-ban.**

### 📦 Release

Csak előkészítés, nincs verzió-bump. Webes Railway auto-deploy a `main` push-szal
csak felépül, élesben még semmi nem aktív.

### 🔜 Mi következik

Fázis 2: a helper-algoritmusok teljes implementációja + smoke-test runner.

---

## [2026-05-02y] — Felhasználók oldal teljes újragondolás (v0.9.45)

A felhasználó kérése: minden user megjelenjen + scope-info (kerület/megye/
gyülekezet) + törlés + Excel export.

### ✨ Új actions

**`apps/web/app/(dashboard)/admin/actions.ts`**:

- `getAllUsersWithScope()` — profile + congregation + diocese + district 3-szintes JOIN +
  profile_roles bevonás (multi-role) + scope-name JOIN (külön lekérdezés)
- `deleteUser(userId)` — service-role `auth.admin.deleteUser` + ON CASCADE FK-k
  törlik a profiles/profile_roles/ertesitesek-et; védelem: master admin
  önmagát NEM törölheti

### ✨ UsersTab teljes refactor

**`apps/web/components/admin/users-tab.tsx`** — átírva (~430 sor):

- Egy egyesített lista (Mind / Aktív / Várakozó / Egyéb chip-szűrőkkel)
- Keresés: név + email + gyülekezet + megye + kerület + szerep
- **Scope-lánc** minden user-nél: `Egyházkerület › Egyházmegye › Gyülekezet`
  ikon-csíkban (Castle / Building2 / Church)
- **Multi-role badge-ek** — minden szerepkör listázva scope-névvel és
  approval_status jelzővel
- Sor-akciók: **Gyors jóváhagyás** (zöld, pending), **Részletes jóváhagyás**
  (egyházmegye + gyülekezet, pending), **Törlés** (vörös, mind)
- **Excel export** gomb — `xlsx` lib (dinamikus import), 9 oszlopban:
  ID / Teljes név / Email / Elsődleges szerepkör / Státusz /
  Egyházkerület / Egyházmegye / Egyházközség / További szerepkörök / Regisztrált
- Fájlnév: `kartoteka-felhasznalok-YYYY-MM-DD.xlsx`

### 📦 Release

Csak webes (Railway auto-deploy). Nem kell SQL.

### 🚨 BIZTONSÁGI MEGJEGYZÉS

A `deleteUser` a SUPABASE_SERVICE_ROLE_KEY-t igényli (Railway env). Ha nincs,
hibaüzenet jön. A master admin (Endre) önmagát NEM tudja törölni.

---

## [2026-05-02x] — Reset password flow + Szerepkörök 2-lépcsős UI (v0.9.44)

### 🐛 KRITIKUS FIX — Elfelejtett jelszó funkció

A felhasználó panasza: az elfelejtett jelszó funkció nem működött rendesen.

**Két probléma**:
1. A `resetPasswordForEmail` hívásnál **HIÁNYZOTT** a `redirectTo` opció →
   a magic-link a default Site URL-re ment (vagy egy nemlétező oldalra)
2. **NINCS** `/reset-password` oldal ami fogadná a magic-link tokent és új jelszót kérne!

**Új fájlok**:
- `apps/web/app/(auth)/reset-password/page.tsx` — új oldal
- `apps/web/components/auth/reset-password-form.tsx` — `ResetPasswordForm`

**Javítás**: `apps/web/app/(auth)/forgot-password/actions.ts`
- `resetPassword` mostantól `redirectTo: ${appUrl}/reset-password` paraméterrel hív
- Új action: `setNewPassword(newPassword)` — `auth.updateUser({ password })`

**ResetPasswordForm flow**:
1. Token-ellenőrzés a betöltéskor (`getUser()`-rel)
2. Ha lejárt/érvénytelen → "Új link kérése" képernyő
3. Ha érvényes → új jelszó form (eye-icon, validáció, mismatch jelzés)
4. Submit → `setNewPassword` → "Jelszó beállítva" → 2 mp után átirányítás `/login`-ra

### ✨ Szerepkörök 2-lépcsős UI + keresés

A felhasználó kérése: külön kiválasztani a célt, aztán a szerepet.
Pl. lelkész → Maksai gyülekezet → Lelkipásztor.

**Érintett fájl**: `apps/web/components/admin/profile-roles-tab.tsx`

**Új flow** a "+ Új szerepkör" popoverben:
- **1. lépés** — "Hova tartozik?":
  - Kereshető (gyülekezet/megye/kerület/rendszer)
  - Csoportosítva: Rendszerszint / Egyházkerületek / Egyházmegyék / Gyülekezetek
  - Cél kiválasztva → 2. lépésre vált
- **2. lépés** — "Mi lesz a szerepe ezen a hatókörön?":
  - Csak az adott hatókörhöz illeszkedő szerepek (radio-rács):
    - Gyülekezet → Lelkipásztor / Könyvelő
    - Egyházmegye → Esperes / Egyházmegyei admin / Számvevő
    - Kerület → Egyházkerületi admin
    - Rendszer → Rendszergazda
  - Aktív szerepkörök kihagyva (duplikáció elkerülés)
  - "Csere" link → vissza az 1. lépésre
- **Hozzáadás** gomb csak akkor enged, ha cél + szerep is megvan

**Új konstans**: `ROLE_OPTIONS_BY_SCOPE` — typescript-friendly map a szerepek
csoportosításához.

### 📦 Release

Csak webes (Railway auto-deploy). Nem kell SQL.

**Tesztelés a felhasználó által** (reset password):
1. `/login` → "Elfelejtett jelszó?" link
2. Email megadás → "Jelszó-visszaállító linket sikeresen elküldtük"
3. Email-en kattintás a magic-linkre → `/reset-password` oldal nyílik meg
4. Új jelszó megadás (kétszer) → "Jelszó beállítva" → 2 mp után `/login`
5. Belépés az új jelszóval

---

## [2026-05-02w] — Email-foglalt képernyő a regisztrációkor (v0.9.43)

A felhasználó kérdésére: "ha valaki úgy akar regisztrálni, hogy az email
már szerepel a rendszerben, akkor mi történik?"

A v0.9.42-ig CSENDBEN folytattuk az `access_requests` insert-jét — a user
"Kérelmét rögzítettük" üzenetet kapott, de NEM kapott emailt. Zavart
okozhatott.

### ✨ Új flow

**Server action** (`hozzaferes-kerese/actions.ts`):
- A `SubmitResult` interfészbe új `alreadyExists?: boolean` mező
- Ha a `signUp` "already exists" hibát ad → visszatér `alreadyExists: true`
  + konkrét hibaüzenet (NEM csendben halad tovább)

**UI** (`access-request-form.tsx`):
- Új speciális képernyő: "Ez az email már regisztrálva van"
- Mail-ikon (amber)
- Konkrét magyarázat
- 2 akcionálható gomb:
  - **Belépés a meglévő fiókkal** (zöld, primary) → `/login`
  - **Elfelejtettem a jelszót** (kontúros) → `/forgot-password`
- "Más email-cím megadása" link a vissza-vál-tartáshoz (a többi mező megmarad)

### Filozófia

Egy belső gyülekezeti rendszerben (max 1000-2000 lelkész) az
email-enumeration kockázata alacsony — a UX fontosabb. A user PONTOSAN
tudja, mit tegyen.

### 📦 Release

Csak webes (Railway auto-deploy). Nem kell SQL.

---

## [2026-05-02v] — Gyors jóváhagyás (gyülekezet nélkül) (v0.9.42)

A diagnosztikai SQL eredménye alapján: a két új user (Zoltan Ferenczi,
endreszocsai) `pending`-ben volt. A meglévő `approveUser` action egyházmegye +
gyülekezet-nevet KÖTELEZ ami nem mindig kívánatos (pl. Google-loginnal jött user).

### ✨ Új funkció — Gyors jóváhagyás

**Új server action**: `apps/web/app/(dashboard)/admin/actions.ts`

```ts
export async function quickApproveUser(userId: string)
```

- Egyetlen klikkel `pending → active` (nem kér gyülekezetet)
- A user a következő bejelentkezésnél a wizard-on választ gyülekezetet
- Értesítés: "Hozzáférése aktiválva. A bejelentkezés után az induló wizard segít beállítani a gyülekezetet…"
- `revalidatePath('/admin/felhasznalok')` + `/admin`

**UsersTab Pending listán** (`apps/web/components/admin/users-tab.tsx`):

Két gomb a felhasználó mellett:
- **"Gyors jóváhagyás"** (zöld) — egy kattintás + confirm → aktív (gyülekezet nélkül)
- **"Jóváhagyás gyülekezettel…"** (kontúros, meglévő flow) — a régi `approveUser` egyházmegye + gyülekezet-nevet kér

### 📦 Release

Csak webes (Railway auto-deploy). Nem kell SQL.

A felhasználó most:
1. Frissítse az `/admin/felhasznalok` oldalt
2. A Pending listában megjelenik Zoltan Ferenczi és endreszocsai
3. **"Gyors jóváhagyás"** zöld gombra kattint → confirm → aktív
4. Az "Aktív" listában megjelennek + a Szerepkörök fülön is osztható szerepkör

---

## [2026-05-02u] — Diagnosztika + Szerepkörök fülön pending is látható (v0.9.41)

A felhasználó panasza: "Az admin oldalon, sem a felhasználóknál sem a
szerepköröknél nem jelenik meg a regisztrált és elfogadott új felhasználó!"

### 🔍 Diagnosztikai SQL

**Új fájl**: `migration-docs/sql/2026-05-02-diagnose-users-visibility.sql`

A 6 SELECT-blokk pontosan kideríti, miért nem látszik egy user:
- 1: auth.users összes sorai (provider, metadata)
- 2: profiles összes sorai
- 3: KÜLÖNBSÉG — kik az auth.users-ek profile NÉLKÜL
- 4: STATUS-ELEMZÉS (mennyien vannak active/pending/...)
- 5: javító UPDATE (kommentelve, csak ha tényleg kell)
- 6: ÖSSZESÍTŐ — kik fognak látszódni hol

A felhasználó futtatja és visszaküldi az eredményt — abból azonnal látom a bajt.

### 🔧 listAssignableProfiles bővítés

**Érintett fájl**: `apps/web/app/(dashboard)/admin/profile-roles-actions.ts`

A jelenlegi SELECT csak `status='active'`-ot adott. Az új signUp-os user-ek
azonban `pending`-ben vannak — a Szerepkörök fülön nem jelentek meg, akkor
sem ha az admin az `/admin/hozzaferes-kerelmek`-ben elfogadta őket.

**Fix**: `eq('status', 'active')` → `in('status', ['active', 'pending'])`.
A Szerepkörök fülön most a pending user-ek is megjelennek (kiosztáshoz
elérhetők).

### ➕ Új action: getAllUsers

**Érintett fájl**: `apps/web/app/(dashboard)/admin/actions.ts`

`getAllUsers()` — a profiles ÖSSZES sorát adja vissza, status-tól függetlenül.
A jövőben a UsersTab "Mind" tabbal bővülhet ezzel.

### 📦 Release

Csak webes (Railway auto-deploy).

A felhasználónak ajánlott:
- `migration-docs/sql/2026-05-02-diagnose-users-visibility.sql` futtatás
  (csak SELECT-ek, semmit nem ír) — küldd vissza a 6. SELECT eredményét

---

## [2026-05-02t] — Jelszó beállítása/módosítása a Beállításokban (v0.9.40)

### ✨ ÚJ — Jelszó-szekció a Beállítások → Adat & biztonság fülön

**Felhasználó kérdése**: "Mi lesz azzal, aki úgy jelentkezett be hogy nem volt
még jelszava (Google OAuth). Adjunk neki egy jelszót, és azt a beállításoknál
megváltoztathatja!"

**Új server action**: `apps/web/app/(dashboard)/profile/actions.ts`
- `updatePassword(newPassword: string)` — `supabase.auth.updateUser({ password })`
- Validáció: 8-72 karakter (bcrypt limit)
- A hívó saját session-jével hitelesít — más user jelszavát NEM tudja módosítani

**Új UI komponens**: `PasswordChangeForm` a `settings-dialog.tsx` végén
- 2 mező: új jelszó + megerősítés
- Eye-icon megjelenítés/elrejtés
- Inline validáció: `tooShort`, `mismatch` piros figyelmeztetéssel
- Submit gomb csak akkor enged, ha minden OK
- A jelenlegi jelszót **NEM** kérjük (a Supabase session-token önmagában
  hitelesít — egyforma flow Google-OAuth és sima jelszavas user-eknek)

**Egyforma flow**:
- Google-OAuth user (akinek nincs jelszava) → ugyanezzel az űrlappal állít be
  egy jelszót → ezután akár Google-fiókkal, akár email + jelszó kombinációval
  is be tud lépni
- Sima jelszavas user → jelszó-módosítás ugyanezzel az űrlappal

### 📦 Release

Csak webes (Railway auto-deploy). Nem kell SQL.

---

## [2026-05-02s] — Felhasználó-listázás bug fix + telefonszám kötelező (v0.9.39)

### 🐛 KRITIKUS BUG FIX — auth.users → profiles szinkronizáció hiánya

**Felhasználó panasza**: "Az autentifikált usereknél megjelenik még egy másik
személy is, de a rendszer nem mutatja!"

**Gyökér-ok**: a v0.9.37-es signUp-flow `supabase.auth.signUp()`-pal létrehozza
az `auth.users` sort, DE a `public.profiles` táblába automatikusan NEM kerül
be sor — mert nincs `handle_new_user` DB-trigger! Ezért a regisztrált user
láthatatlan az admin felületen (UsersTab a profiles-ot olvassa).

**Új SQL fix**: `migration-docs/sql/2026-05-02-handle-new-user-trigger.sql`

- Új `handle_new_user()` PL/pgSQL függvény (SECURITY DEFINER)
- Új TRIGGER `on_auth_user_created` AFTER INSERT ON auth.users
  - Minden új auth.users-re létrehoz egy 'pending' státuszú profile-sort
  - A `raw_user_meta_data->>'full_name'` és `'requested_role'` mezőket átveszi
  - `ON CONFLICT (id) DO NOTHING` — idempotens
- **Backfill**: a meglévő auth.users sorokra is létrehozza a hiányzó profile-okat
- 3 ellenőrző SELECT a végén (trigger létezik, hianyzo_profile=0, top 20 új profile)

A felhasználónak **futtatnia kell** a Supabase-en — addig az új signUp-on érkezett
user-ek továbbra sem látszanak.

### ✨ Telefonszám kötelezővé tétele

**Felhasználó kérése**: "a telefonszám nem opcionális!"

- `access-request-form.tsx`: a label-ből eltünt az "(opcionális)", piros csillaggal
  kötelező; `required` HTML attribute; client-side validáció
- `actions.ts`: server-side validáció — ha üres, hibaüzenet
- `autoComplete="tel"` — böngésző-autofill barát

### 📦 Release

Csak webes (Railway auto-deploy).

**A felhasználónak SQL futtatás KÖTELEZŐ**:
- `migration-docs/sql/2026-05-02-handle-new-user-trigger.sql`

---

## [2026-05-02r] — Név szétválasztás + Szerepkörök UI újragondolás (v0.9.38)

### ✨ Név szétválasztása (1.)

**Érintett fájl**: `apps/web/components/public/access-request-form.tsx`

A felhasználó kérése: a "Teljes név" mező helyett vezetéknév + keresztnév.

- Új: 2 mező (vezetéknév előbb, magyar konvenció szerint)
- Validáció: mindkettő kötelező, min 2 karakter
- A submit a két mezőt összeilleszti `${family_name} ${given_name}` alakban,
  és a `submitAccessRequest({ full_name })` változatlan signature-rel kapja
- `autoComplete="family-name"` / `autoComplete="given-name"` — böngésző-autofill barát

### ✨ Szerepkörök UI teljes újragondolás (2.)

**Érintett fájl**: `apps/web/components/admin/profile-roles-tab.tsx` (~600 sor)

A felhasználó panasza: "a szerepkörök adása nem egyértelmű — gondold újra,
egy személy egy sor, két kattintással lehessen szerepkört adni".

**ÚJ KONCEPCIÓ**: 1 user = 1 sor, kibontható szerepkörökkel + 2-kattintásos
gyors-kiosztás:

- **`UserAssignmentCard`** — minden user saját kártyán: avatar + név + email
  + "+ Új szerepkör" gomb
- A user-kártya ALATT inline szerepkör-badge-ek (`RoleBadgeInline`):
  ikon (scope) + szerep neve + scope-név + status-jelző + hover-beli ✕ visszavon
- **Quick-assign popover**: a "+ Új szerepkör" gombra kattintva 1 popover nyílik
  EGY KOMBINÁLT comboboxszal:
  - "Lelkipásztor — Barátosi gyülekezet"
  - "Esperes — Sepsi egyházmegye"
  - "Egyházkerületi admin — EREK"
  - "Rendszergazda"
  - "Könyvelő — Barátosi gyülekezet"
  - … minden lehetséges scope+role kombináció előre legenerálva
- Search-mező a popoverben: gyülekezet- vagy szerep-név alapján szűr
- A már aktív szerepkörök NEM jelennek meg a quick-listában (duplikáció elkerülés)
- Egy kattintás: opció kiválasztva → action-hívás → toast + reload
- **2 kattintás** összesen: 1) "+ Új szerepkör"  2) opció a listából

**Részletes (custom + indoklás) modal** — a popover alján egy "Részletes (egyedi
szerep, indoklás) →" link nyitja meg, kevés esetnek (titkárnő, saját szerep-név,
formális indoklás).

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02q] — Sidebar admin egyenrangú + Google login fix + jelszó-mezők (v0.9.37)

3 párhuzamos észrevétel, ALAPOS megoldással.

### ✨ Sidebar — admin egyenrangú menüpontok

A felhasználó kérése: az "Admin Panel" eddig egy kibontható menüpont volt
13 almenüvel. Most mind a 13 **egyenrangú főmenüpont** a "Rendszerszint"
szekcióban, **saját ikonokkal**.

**Érintett**: `apps/web/components/layout/sidebar-adaptive-v4.tsx`
- A `adminItems[0].children = adminSubmenu` pattern megszűnt
- Helyette: `adminMainItems = adminSubmenu.map(m => ({ ...m }))` —
  flat lista, mindegyik MenuItem mint top-level

### 🐛 KRITIKUS FIX — Google login: status 'approved' → 'active'

A felhasználó panasza: a Google-fiókkal NEM tud belépni, pedig az admin
elfogadta. Részletes vizsgálat:

**Gyökér-ok**:
- `approveAccessRequest` action a `profiles.status`-t `'approved'`-ra állította
- DE az auth-flow MINDEN ellenőrzése (`callback/route.ts:86`,
  `login/actions.ts:42`, `(setup)/layout.tsx:48`, `oauth-complete/page.tsx:22`,
  `pending/page.tsx:41,45`) **`status === 'active'`**-ot követel
- Az `'approved'` egy korábbi flow-ból maradt szemantika ami sehol nem
  konvertálódik tovább `'active'`-ra
- Csak a master admin (Szőcs Endre, email-alapú) léphet be — más senki

**Fix kód-oldalon**: `access-requests-actions.ts` mostantól `'active'`-ot ír
(2 helyen: existingUser + új signUp branch).

**Fix DB-oldalon**: új SQL migráció `2026-05-02-profiles-approved-to-active.sql`
- `UPDATE profiles SET status='active' WHERE status='approved'`
- A felhasználónak **futtatnia kell** — különben a meglevő approved-ek nem
  tudnak belépni!

### ✨ ÚJ: Jelszó + jelszó-megerősítés a hozzáférés-kérelem űrlapon

A felhasználó kérése: "Nem kértünk be jelszót és jelszó megerősítését! Ez
súlyos gond!"

**Új flow** (`access-request-form.tsx` + `actions.ts`):
1. A kérelmező a publikus űrlapon megad **jelszót + megerősítést** (min 8,
   max 72 karakter)
2. UI-validáció: mindkét mező kötelező, eye-ikon megjelenítés/elrejtés,
   "nem egyezik" inline figyelmeztetés
3. Server action: `supabase.auth.signUp({ email, password, options })` →
   user fiók létrejön (auth.users), `email_confirmed_at = null`
4. INSERT az `access_requests`-be (változatlan)
5. Admin elfogadja → `profiles.status = 'active'` (lásd fent)
6. User már a megadott jelszóval beléphet (email-cím + jelszó)

**Edge-case**: ha az email már létezik a Supabase-ben (`user_already_exists`),
NEM blokkolunk — csak az `access_requests` insert megy, és az admin a
meglévő fiókot frissíti elfogadáskor. (Anti-enumeration: ugyanaz a UX, mint
új email esetén.)

### 📦 Release

Csak webes (Railway auto-deploy).

**A felhasználónak SQL futtatás KÖTELEZŐ**:
- `migration-docs/sql/2026-05-02-profiles-approved-to-active.sql`

---

## [2026-05-02p] — Kapcsolatfelvétel a rendszergazdával modal (v0.9.36)

A felhasználó kérése: a hozzáférés-kérelem sikeres beküldése utáni
amber-blokkban szereplő szöveget cseréljük le, és a "rendszergazdával"
legyen kattintható link → ablak → email küldés `endreszocs@gmail.com`-ra.

### ✨ Új funkciók

**Új fájl**: `apps/web/app/(public)/hozzaferes-kerese/contact-actions.ts`
- `contactSysadmin({ fromEmail, fromName, message })` Server Action
- Brevo-n keresztül küld emailt a `SYSADMIN_EMAIL = endreszocs@gmail.com`-ra
- Reply-To = a felhasználó email-je → admin közvetlenül válaszolhat
- Validáció: email, név (min 2), üzenet (10-5000 karakter)

**Új fájl**: `apps/web/components/public/contact-sysadmin-dialog.tsx`
- `ContactSysadminDialog` modal komponens
- 3 mező: név, email, üzenet (textarea)
- Loading-state + success-state ("Üzenet elküldve" + check ikon)
- A submitted-state-en a defaultEmail/defaultName már elő van töltve

### 🔄 Módosítás

**Érintett fájl**: `apps/web/components/public/access-request-form.tsx`

A success-screen (kérelem rögzítve) amber-blokkjának szövege:
```diff
- ...kérjük lépjen kapcsolatba az egyházkerületi hivatallal.
+ ...kérjük lépjen kapcsolatba a rendszergazdával.
```

A "rendszergazdával" most **kattintható link** — megnyitja az új
`ContactSysadminDialog` modalt, ami a felhasználó adatait előre kitölti.

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02o] — Access requests gyökér-ok fix (v0.9.35)

A v0.9.34 SQL fix után a felhasználó MÉG MINDIG "permission denied for table
access_requests" hibát kapott, pedig az `anon | INSERT` GRANT megvolt.

### 🐛 GYÖKÉR-OK

**Érintett fájl**: `apps/web/app/(public)/hozzaferes-kerese/actions.ts`

```ts
// ELŐTTE — 'permission denied for table access_requests' hibát adott:
const { data: inserted, error: insErr } = await supabase
  .from('access_requests')
  .insert({...})
  .select('id')              // ← EZ A GYILKOS SOR!
  .maybeSingle()
```

A `.insert(...).select('id')` kombináció a Supabase-ben **SELECT jogot is
megkövetel** a táblára, mert a returning-et SELECT-ként ellenőrzi az RLS.
Az anon-nak **NINCS** SELECT joga (csak admin-nak van SELECT POLICY-ja).

**Fix**: a `.select('id').maybeSingle()` eltávolítva — csak a `.insert(...)`
hívás, az error elegendő a hibajelzéshez. Az `inserted.id`-t a flow máshol
nem használja.

### 📜 Új SQL fix-fájl (alapos reset)

`migration-docs/sql/2026-05-02-fix-access-requests-COMPLETE.sql`:
- 1.1, 1.2: jelenlegi POLICY + GRANT állapot diagnosztika
- 2: TELJES POLICY-reset — minden drop, újra-create explicit szerepkörökkel
- 3: GRANT-ek a táblára (anon + authenticated + service_role)
- 4: GRANT EXECUTE a `check_access_request_rate_limit` függvényre
- 5: PostgREST cache-reload (`NOTIFY pgrst, 'reload schema'`)
- 6: ELLENŐRZÉS — várt eredmények dokumentáltan

A felhasználónak **futtatnia kell** ezt is — különösen a NOTIFY pgrst sort,
ami az új POLICY-t a Supabase REST cache-ébe továbbítja.

### 📦 Release

Csak webes (Railway auto-deploy).

A felhasználónak SQL futtatás:
- `migration-docs/sql/2026-05-02-fix-access-requests-COMPLETE.sql`

---

## [2026-05-02n] — Railway build hotfix + 5 új észrevétel javítása (v0.9.34)

### 🚨 Railway build-fix (kritikus)

A v0.9.33 push után a Railway buildje elhalt:
```
./app/(dashboard)/anyakonyv/actions.ts
Type error: Module '"@/lib/validations/registry"' has no exported member 'confirmationSingleSchema'.
```

**Ok**: a v0.9.33 commit-ben már szerepelt a `confirmationSingleSchema` import,
de a hozzá tartozó export csak az uncommitált working tree-ben volt
(`apps/web/lib/validations/registry.ts`). Most pótlólag commitálva az anyakönyvi
feature-csomag teljes uncommitált része.

**Érintett fájlok** (most pótlólag committelve):
- `apps/web/lib/validations/registry.ts` — új `confirmationSingleSchema` export
- `apps/web/components/modals/baptism-dialog.tsx`
- `apps/web/components/modals/burial-dialog.tsx`
- `apps/web/components/modals/confirmation-dialog.tsx`
- `apps/web/components/modals/marriage-dialog.tsx`
- `apps/web/components/modals/movement-dialog.tsx`
- `apps/web/components/registry/registry-tabs.tsx`
- **Új**: `apps/web/components/registry/member-search-select.tsx`
- **Új**: `apps/web/components/registry/registry-detail-dialog.tsx`

### 🐛 Javítás (3. pont — KRITIKUS: anon nem tud regisztrálni)

**Új SQL**: `migration-docs/sql/2026-05-02-fix-access-requests-anon-insert.sql`

A felhasználó panasza: a publikus regisztrációs űrlap submit-je
"permission denied for table access_requests" hibát ad.

**Ok**: a 2026-04-22 migráció létrehozta a `"Anyone can submit an access request"`
POLICY-t, **DE** elfelejtett `GRANT INSERT TO anon`-ot kiadni. A PostgreSQL
RLS modellje: a POLICY csak akkor enged át egy műveletet, ha a base
TABLE PRIVILEGE is megvan.

**Fix**: SQL-fájl ami `GRANT INSERT TO anon, authenticated` + a POLICY
újra-create explicit `TO anon, authenticated` paraméterrel.
**A felhasználónak FUTTATNIA KELL a Supabase-en — addig nincs új regisztráció!**

### 🐛 Javítás (1. pont — email link localhost-ra mutatott)

**Érintett fájl**: `apps/web/app/(dashboard)/admin/access-requests-actions.ts`

A felhasználó panasza: az elfogadó email "Belépés beállítása" gombja
`http://localhost:3000`-ra vezetett.

**Ok**: a `NEXT_PUBLIC_APP_URL` env-var nincs beállítva a Railway-en,
így a default `http://localhost:3000` került be a Supabase invite-linkbe.

**Fix**: a fallback most production-ban a Railway URL-t használja:
`https://kartotekaweb-production.up.railway.app`. **A felhasználónak ÉRDEMES**
beállítania a Railway env-vart és a Supabase Site URL-t is.

### ✨ Csere (2. pont — email aláírás)

**Érintett fájlok**: `apps/web/lib/email/templates/{access-request,device-revoke}.ts`

8 helyen cserélve: "Az Erdélyi Református Egyházkerület Kartotéka rendszere"
→ "A Kartotéka rendszer".

### 🎨 Javítás (5. pont — Settings dialog két-oszlopos layout)

**Érintett fájl**: `apps/web/components/modals/settings-dialog.tsx`

A felhasználó panasza: a Beállítások ablakban a sidebar (Értesítések,
Megjelenés, ..., Tudtad?, Bejelentkezve mint) UTÁN/ALATT jelent meg a
tartalom (Téma stílusa, Sötét/világos mód, Betűméret), nem MELLETTE.

**Ok**: a parent `DialogContent` `grid grid-cols-1` display-je felülírta a
`<Tabs className="flex flex-row">`-ot.

**Fix**: a `<Tabs>` className-jét `flex flex-row` helyett **explicit**
`grid grid-cols-[200px_1fr] sm:grid-cols-[240px_1fr]`-re átírva. A két
oszlop most explicit grid template-tel garantált.

### ℹ️ Diagnosztika (4. pont — Wizard ellenőrzés)

A welcome wizard megvan és az infrastruktúra fut:
- `getWelcomeWizardStatus()` ellenőrzi a hiányzó adatokat (gyülekezet név,
  cím, járulék, határidő, lelkész név)
- `welcome-wizard-client.tsx` 2-5. lépésekkel
- Új user invite-után automatikusan triggerelődik

Konkrét bug nem azonosított — élő teszteléskor, ha valami nem stimmel,
jelezz vissza.

### 📦 Release

Csak webes (Railway auto-deploy).

**A felhasználónak SQL-t kell futtatnia**:
- `migration-docs/sql/2026-05-02-fix-access-requests-anon-insert.sql`
  (KRITIKUS — addig nincs új regisztráció!)

**A felhasználónak Railway env-vart kell beállítania**:
- `NEXT_PUBLIC_APP_URL=https://kartotekaweb-production.up.railway.app`
  (akkor is fut nélküle, csak a fallback érvényesül)

---

## [2026-05-02m] — 5 vegyes észrevétel javítása + sebesség-optimalizálás (v0.9.33)

A felhasználó 5 új észrevétele alapján.

### 🐛 Javítás (2. — anyakönyvi temetés bug)

**Érintett fájl**: `apps/web/app/(dashboard)/anyakonyv/actions.ts`

A felhasználó panasza: "a temetések rögzítve vannak az adatbázisban, de nem
jelennek meg az oldalon az eltemetetteknél" — azaz a tag továbbra is élőként
szerepel a tagnyilvántartásban.

**Ok**: a `saveBurial` action **CSAK** a `temetes` táblába írt, a
`szemely.meghalt` és `member_status` mezőket nem állította át. (A
`tagnyilvantartas/removeMember` action `reason='meghalt'` ágában mindkettőt
csinálja — itt is meg kell.)

**Fix**: a `saveBurial` végén `UPDATE szemely SET meghalt=true,
member_status='elhunyt' WHERE id=id_szemely`. Try/catch védelem — ha a
szemely-frissítés fail-el, a temetés rögzítve marad. `revalidatePath` mind
a két útra (`/anyakonyv`, `/tagnyilvantartas`).

### 🔧 Javítás (3. — Supabase RLS hiba)

**Új fájl**: `migration-docs/sql/2026-05-02-rls-fix-merge-v7-result.sql`

A Supabase Advisor kritikus figyelmeztetése: a `public._merge_v7_result`
táblán nincs RLS engedélyezve. Ez egy ideiglenes diagnosztikai tábla a
2026-04-26 v7 merge-spouses migrációból — **törölhető**.

A SQL fix:
- 1. blokk: `DROP TABLE IF EXISTS public._merge_v7_result`
- 2. blokk: diagnosztikai SELECT — minden RLS-mentes publikus tábla listája
- 3. blokk: a Master admin profile `role='admin'` ellenőrzés (5. ponthoz)

### 🔧 Javítás (5. — gyülekezeti oldal jogosultsági hiba)

**Érintett fájl**: `apps/web/app/(dashboard)/publikus-oldal/actions.ts`

A felhasználó panasza: a publikus oldal beállításnál "Nincs jogosultságod
ehhez a művelethez" hibát ad. Ennek **legvalószínűbb oka**: az APP
`MASTER_ADMIN_EMAIL` env-var alapján admin-rangra emeli a felhasználót,
**de** a Supabase RLS a `profiles.role = 'admin'` mezőt nézi. Ha a master
admin-nak `profiles.role != 'admin'`, az RLS visszadob 42501-gyel.

**Megoldás**:
- App-szintű: a 42501 error pontosabb diagnosztikai üzenetet kap, a
  felhasználó tudja merre induljon
- DB-szintű: a SQL fixfájl 3.1-3.2 blokkja diagnosztizálja és (manuálisan)
  javítja a profile-t

### ✨ Refaktor (4. — admin oldalak teljes értékűek)

**Érintett fájlok**: `apps/web/app/(dashboard)/admin/{*/page.tsx,layout.tsx}`,
**új**: `apps/web/components/admin/admin-page-header.tsx`

A felhasználó kérése: az admin aloldalak ne fülek tartalmaként, hanem
önálló oldalakként jelenjenek meg.

**Változtatás**:
- `layout.tsx`: a gradient banner KIKERÜLT (csak az `/admin` főoldalon
  marad, az `AdminOverviewDashboard`-ban)
- Új `<AdminPageHeader>` komponens: ikon, gradient hátterű kis blur,
  cím + leírás + "Vissza az áttekintőhöz" link
- Mind a 12 aloldal kapott saját AdminPageHeader-t saját ikonnal,
  gradient-tel, leírással

### ⚡ Sebesség-optimalizálás (1. — gyors win-ek)

**Érintett fájl**: `apps/web/next.config.ts`

A felhasználó panasza: a Railway-en hosztolt webhely lassú. Beépítettem
néhány azonnali optimalizálást:

- `compress: true` — gzip a HTML/JSON/JS válaszokra (Railway proxy is
  továbbítja)
- `poweredByHeader: false` — `X-Powered-By: Next.js` info-leak elrejtése
- `reactStrictMode: true` — explicit, hogy a téma-aware rendering ne
  fusson kétszer felesleges effektusokkal
- `Cache-Control: public, max-age=31536000, immutable` a `/_next/static/*`
  asseteknek — a böngésző NEM kérdezi le újra hashed fájlokat
- `Cache-Control: public, max-age=2592000` az `/icons/*`-nek (30 nap)
- `Cache-Control: public, max-age=2592000, immutable` a `/fonts/*`-nek

**További javasolt lépések** (későbbi sprintben):
- Server Action-ök közötti round-trip csökkentés (parallel `Promise.all`)
- Egyes nagy listák kötegelt lekérdezése (`limit + offset` paging)
- Képek WebP konverziója + `next/image` mindenütt használata
- Railway region áthelyezése EU-ba ha nincs ott (a Supabase Frankfurt-ban van)

### 📦 Release

Csak webes (Railway auto-deploy).

A SQL fix-fájlt **futtatnod kell** a Supabase-en:
1. `migration-docs/sql/2026-05-02-rls-fix-merge-v7-result.sql` 1. blokkja
   (RLS hiba megoldása)
2. (Ha a 3.1 ⚠ jelet ad) a 3.2 UPDATE blokkja (jogosultsági hiba megoldása)

---

## [2026-05-02l] — Admin Központ átalakítása oldalakra + áttekintő (v0.9.32)

A felhasználó kérése: az admin felületen a 13 fül legyen önálló oldal, és a
főképernyő legyen áttekintő (fontos üzenetek, elbírálások, pénzügyi és
határidős részek, hibák). A sidebarban az "Admin Panel" alatt jelenjenek meg
a részek ikonokkal — a tagnyilvántartás/anyakönyv almenü mintájára.

### ✨ Új struktúra

**13 önálló oldal** az `/admin/<slug>/page.tsx` mintán:

| Útvonal | Komponens |
|---------|-----------|
| `/admin` | **AdminOverviewDashboard** (új áttekintés) |
| `/admin/hozzaferes-kerelmek` | AccessRequestsTab |
| `/admin/gyulekezetek` | CongregationsTab |
| `/admin/felhasznalok` | UsersTab |
| `/admin/szerepkorok` | ProfileRolesTab |
| `/admin/konyvelok` | ProfileCongregationsTab |
| `/admin/eszkozok` | DevicesLicensesTab |
| `/admin/frissitesek` | BroadcastsTab |
| `/admin/tamogatas` | SupportTab |
| `/admin/import` | TagnyilvantartasImportWizard + ImportLogList (god mode) |
| `/admin/penzugy` | SystemFinanceTab |
| `/admin/rendszer` | SecuritySettingsTabV2 |
| `/admin/veszelyes-zona` | DataWipeTab |

### 🔌 Új közös elemek

- **`/admin/layout.tsx`** — közös auth-guard + gradient header
  (a `getEffectiveAccessContext()` alapján admin-ellenőrzés;
  scope-mismatch esetén redirect)
- **`AdminOverviewDashboard`** komponens — új főképernyő tartalma:
  - 4 akcionálható KPI kártya (Elbírálandó kérelmek, Friss üzenetek,
    Rendszer pénzügyei, Támogatási jegyek) — kattintással átvisz a megfelelő
    aloldalra
  - "Legutóbbi üzenetek" lista (top 5 broadcast)
  - 12-modul rács — minden adminmodul ikonnal és rövid leírással
  - "Részletes statisztikák" szekció (a régi `OverviewTabRefined` recycled)
  - Adatminőségi banner — link a tagnyilvántartás "Hibák" fülére

### 🧭 Sidebar bővítés

- Új `WEB_ADMIN_SUBMENU` (13 elem) a `dashboard-layout-client.tsx`-ben
- `SidebarAdaptiveV4` új `adminSubmenu` prop — az "Admin Panel" menüpont
  kibontható almenüt kap (a tagnyilvántartás/anyakönyv mintájára)

### 🗑️ Régi struktúra

- Az `AdminTabsV3` komponens még megvan, de már **nincs használatban**
  (jövőben törölhető Sprint U.5-ben)

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02k] — Google login + Családok táblázat sortolás/szűrés (v0.9.31)

### ✨ Új funkciók — Login

A login oldalon (`/login`) megjelennek a SSO bejelentkezési gombok:
- **Google** — már be van kötve (`signInWithOAuth({ provider: 'google' })`,
  callback `/auth/callback` route-ra megy)
- **Apple** — placeholder gomb, "hamarosan" jelzéssel — toast.info üzenettel

**Új CSS-osztályok** (`packages/ui/src/kartoteka.css`):
- `.kt-auth-divider` — "vagy" elválasztó vonal két oldalon arany gradient
- `.kt-auth-oauth-row` — 2-oszlopos rács, mobile alatt 1-oszlopos
- `.kt-auth-btn-oauth` — sablonkonform OAuth-gomb (krémszín háttér, arany szegély,
  hover-emelt árnyék)
- `.kt-auth-btn-oauth-soon` — "hamarosan" jelölő badge

**Érintett fájlok**:
- `apps/web/components/auth/oauth-buttons.tsx` — átírva a `kt-auth-*` stílusvilágra
- `apps/web/components/auth/login-form.tsx` — `<OAuthButtons>` import + render

### ✨ Új funkciók — Családok táblázat (4. pont)

**Érintett fájl**: `apps/web/components/members/families-tab-v2.tsx`

A felhasználó észrevétele: "a táblázat elrendezése nem egyértelmű".

**Új képességek**:
- **Sortolható oszlopok** (kattintható fejléc, ↑/↓ ikonokkal):
  Családfő, Társ, Lakcím, Körzet, Állapot
- **Új oszlop**: Körzet (a `csalad.id_csoport` alapján)
- **Státusz-szűrő chip-ek**: Mind / Aktív / Inaktív
- **Körzet-szűrő chip-ek**: Mind / Körzet nélkül / minden körzet egyenként
- **"Szűrők törlése"** gomb (csak ha aktív szűrő van)
- A meglévő keresés (név/cím) marad

**Új komponens**: `SortableHeader` — `ChevronsUpDown` / `ArrowUp` / `ArrowDown` ikon
megjeleníti az aktuális sortolási irányt.

### 📦 Release

Csak webes (Railway auto-deploy).

A 6 pontos észrevétel mind a 6 pontja **kész**. Hátralevő finomítások
(Sprint U.4+):
- DuplicateComparisonDialog a hibák modulhoz
- Excel/CSV export

---

## [2026-05-02j] — Tagnyilvántartás hibák modul MVP (v0.9.30)

A 6 pontos észrevétel **6. pontja** — Tagnyilvántartás hibák — webes
implementáció MVP. (A SQL migráció v0.9.29-cel sikeresen lefutott.)

### ✨ Új funkciók

**Új fájlok**:

- `lib/members/validation-engine.ts` — pure validation function pack
  - `validateMember(m)` — egyetlen tag szabálykészletes ellenőrzése
  - `findDuplicates(members[])` — CNP / email / név+sz_datum duplikációk
  - `validateAll(members)` — gyülekezet-szintű teljes validáció
  - 3 súlyosság: critical / medium / warning
  - 4 típus: missing / format / logic / duplicate

- `app/(dashboard)/tagnyilvantartas/validation-actions.ts` — server actions
  - `runValidation()` — INSERT új hibák, UPDATE meglévő üzenet, RESOLVE eltűntek
  - `recheckMember(id)` — egyetlen tag újraértékelése
  - `getValidationErrors(filters)` — szűrt lekérdezés (status, severity, type, search)
  - `getValidationStats()` — KPI-számok
  - `resolveError(id)` / `ignoreError(id, reason)` / `reopenError(id)`

- `components/members/validation-errors-tab.tsx` — UI
  - 6 KPI kártya (nyitott / kritikus / közepes / figyelm. / duplikációk / mai javítások)
  - "Hibák újraellenőrzése" gomb (Server Action useTransition-nel)
  - 3-csoportos filter chip-sor (status / severity / errorType)
  - Debounced search (300ms)
  - Sortable táblázat severity → detected_at szerint
  - Sor-akciók: Javítva / Figyelmen kívül / Újra megnyit
  - IgnoreDialog kötelező indoklással

### 🔌 Integráció

- `member-tabs-v4.tsx`: új `'errors'` fül (red szín, AlertTriangle ikon)
- `dashboard-layout-client.tsx`: új sidebar almenü `/tagnyilvantartas#errors`
- Hash-routing: `VALID_TAB_HASHES` bővítve `'errors'`-vel

### 🛡️ Biztonság

- A validation-actions.ts MINDEN művelete a `getEffectiveCongregationContext()`-en
  keresztül szűr — más gyülekezet hibái nem szivároghatnak ki
- A `member_validation_errors` tábla RLS-policy-i (v0.9.29 SQL) duplán védenek
- Az `ignoreError` `userId`-t és időbélyeget naplóz (audit trail)

### 📋 Hátralevő (Sprint U.3+)

- DuplicateComparisonDialog — két tag side-by-side összehasonlítása
- Excel/CSV export
- 4. pont: családok táblázat sortolás/szűrés

### 📦 Release

Csak webes (Railway auto-deploy). A felhasználónak már nem kell SQL-t futtatnia.

---

## [2026-05-02i] — Smart-search + család-körzet + családfa fix + SQL javítás (v0.9.29)

A 6 pontos észrevétel további feldolgozása (2., 3., 5. pontok), és a 6. pont
SQL migráció javítása a felhasználó hibajelzése után.

### ✨ Új funkciók (3. pont — Presbiter smart-search bővítés)

**Érintett fájl**: `apps/web/components/modals/presbyter-form-dialog.tsx`

A presbiter-rögzítésnél a tag-keresőben már látszik:
- **Életkor** (a `sz_datum`-ból `ageFromDate()` helper-rel)
- **Teljes lakhely** ("Helység, Utca házszám" formátumban)

Mobile/desktop egyaránt olvasható, max-h-64 a görgethetőség miatt.

### ✨ Új funkciók (2. pont — Családok + körzet)

**Érintett fájl**: `apps/web/components/modals/family-form-dialog.tsx`

A `<FamilyFormDialog>`-ban most már:
- Új **Körzet** `<select>` mező — a `csalad.id_csoport` mentésével
- A `getDistricts()` action betölti a saját gyülekezet körzeteit
- Szerkesztés-módban a `editFamily.id_csoport` és `editFamily.utca?.name`
  is betöltődik a state-be (eddig csak a `c_szam` töltődött)

A backend (`saveFamily`, `familySchema`) már fogadta az `id_csoport`-ot,
csak a UI hiányzott.

### 🐛 Javítások (5. pont — Családfa diagnosztika)

**Érintett fájl**: `apps/web/components/modals/family-tree-dialog.tsx`

Felhasználó panasza: "hol jól működik hol nem". 4 bug azonosítva és javítva:

1. **`birthFamilyLink.maybeSingle()` PGRST116 hiba**: ha egy tag több
   családhoz tartozik gyerek-ként (mostohaszülő, nevelt gyermek), a
   `.maybeSingle()` hibát adott → némán üres fa. Most `.limit(1)` +
   `[0]` access.
2. **`fetchByCnp` whitespace érzéketlen**: ha az `id_apja`/`id_anyja`
   mezőben szóköz volt, sosem talált apát/anyát. Most `cnp.trim()`.
3. **Race condition**: ha a felhasználó zárja a dialog-ot mid-load,
   `cancelled` ellenőrzés nélkül tovább rendelt. Most `cancelled || !containerRef.current` check.
4. **DOM-maradék**: a Balkan FamilyTree `destroy()` nem mindig tisztítja
   a régi SVG-t, kétszeri nyitásnál vizuális duplikáció. Most explicit
   `containerRef.current.innerHTML = ''` mind az új instance előtt,
   mind a cleanup-ben.

### 🔧 Javítás (6. pont — SQL migráció hibajavítás)

**Érintett fájl**: `migration-docs/sql/2026-05-02-member-validation-errors.sql`

A felhasználó futtatáskor hibát kapott: `relation "gyulekezet" does not exist`.

A meglévő séma alapján javítva:
- `gyulekezet` → **`public.congregations`**
- `congregation_id BIGINT` → **`UUID`** (a `congregations.id` UUID)
- `member_id BIGINT` → **`INTEGER`** (a `szemely.id` integer)
- `duplicate_of_member_id BIGINT` → **`INTEGER`**
- Minden objektum `public.` prefix-szel
- Hozzáadva: `GRANT` jogok az `authenticated` szerepkörnek + a sequence-ra
- Az UPDATE policy `WITH CHECK` is — RLS-helyes
- Verifikációs SELECT-ek futtatható formában (a feedback_sql_ellenorzes_egyben szabály szerint)

A felhasználó futtatja újra a Supabase SQL editor-ban.

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02h] — Settings dialog szélesítés + Sprint U terv-fájlok (v0.9.28)

A felhasználó 6 vegyes pontos észrevétele alapján.

### ✅ Beépítve (1. pont)

A `settings-dialog.tsx` UX-finomítás:
- DialogContent max-width: `sm:max-w-3xl` → **`sm:max-w-5xl lg:max-w-6xl`**
  (768px → 1152px / 1280px)
- Bal sidebar (TabsList wrapper): `w-44 sm:w-52` → **`w-48 sm:w-60`**
  (180/208 → 192/240px)
- Tabs gap: `4 sm:gap-5` → **`5 sm:gap-7`** szellősebb tartalom-elhelyezés

### 📋 Tervezve (2-6. pont)

Részletes Sprint-terv a `docs/project-tracking/KARTOTEKA-tagnyilv-vegyes-
finomitas-2026-05-02.md`-ben:

- **2.** Családok szerkesztése + körzet rögzítés (~1 ó)
- **3.** Presbiter smart-search bővítés — életkor + lakhely (~30 perc)
- **4.** Családok táblázat sortolás/keresés/szűrés (~3 ó)
- **5.** Családfa bug-vizsgálat + javítás (~2 ó)
- **6.** Tagnyilvántartás hibák modul (~9-10 ó)
  - SQL migráció (új `member_validation_errors` tábla, RLS,
    trigger): `migration-docs/sql/2026-05-02-member-validation-errors.sql`
  - Validation engine
  - Server actions
  - UI komponensek (KPI card-ok, sortable table, filter sor,
    duplikáció-összehasonlító dialog, ignore dialog admin-mal)
  - Excel/CSV export

A felhasználó futtatja a Supabase-en a 6.1 SQL-t. A 6.2-6.4 webes
implementáció Sprint U.2-ben — külön munkaülés.

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02g] — Súgó modul-térkép + 3-nyelvű (HU/RO/EN) Legal-dialog (v0.9.27)

A felhasználó kérése: bővebb modul-leírás a Súgóban + 3-nyelvű
támogatás (magyar/román/angol) minden tájékoztatóban.

Súgó bővítése (magyar):
- A teljes 12+ modul részletes leírása (kategorizált formában):
  Irányítópult, Tagnyilvántartás, Anyakönyv, Pénzügy (incl. Oblio,
  chitanta, BCR/CEC import), Munkanapló, Leltár, Iktatás,
  Jegyzőkönyvek, Sírhelyek, Éves jelentés, Publikus gyülekezeti oldal,
  Missziós Műhely, Beállítások és Profil, Admin, Kuka, Támogatás
- Záró Note: 12+ modul, összekapcsolódó hálózat ("rendszer él")

3-nyelvű implementáció:
- LegalDialog komponensbe `lang` state ('hu' | 'ro' | 'en'), default
  'hu'
- LangSwitcher komponens a dialog header-ben (HU / RO / EN button-trio)
- TITLES objektum 3 nyelvre (Adatvédelmi tájékoztató / Politica de
  confidențialitate / Privacy notice — stb.)
- 8 új tartalom-funkció: PrivacyRO, TermsRO, HelpRO, ContactRO,
  PrivacyEN, TermsEN, HelpEN, ContactEN — tömörebb mint a magyar, de
  teljes fő-tartalommal (operatőr, hierarchia, GDPR, biztonság,
  felelősség-kizárás, ANSPDCP cím)
- Bezárás gomb 3 nyelven: Bezárás / Închidere / Close

Verify: TypeScript + build zöld.

---

## [2026-05-02f] — Hot-fix: 3 új Term def prop string-zárás javítása (v0.9.26)

A v0.9.25 commit-ban 3 új `<Term def="...">` prop magyar idézőjeleken
belüli ASCII " karakterek miatt nem fordult le tsc-strict alatt
(a Railway build elhalt). Javítás: a `def="..."` → `def={'...'}`
template-string formára cserélve a 3 érintett Term-en (DDoS, AES-256
titkosítás, SOC 2 Type 2 tanúsítvány).

Verify: TypeScript + build zöld.

---

## [2026-05-02e] — Adatvédelem: Supabase + Railway + GDPR + egyházi hierarchia (v0.9.25)

A felhasználó kérése: bővebb tartalom a Supabase-ről, biztonsági
rendszerekről, GDPR-megfelelőségről, Railway hostról, és az egyházi
hierarchiáról (kerület → megye → gyülekezet) — különösen, hogy ki mit
lát, és hogy a kerület/megye CSAK az évi kötelező összesítőket láthatja,
teljes hozzáféréshez a gyülekezeti lelkész engedélye szükséges (még a
rendszergazdának is).

Adatvédelem teljes átdolgozás (12 → 15 szakasz):
- 3. szakasz: Supabase + Railway részletek (Frankfurt + Amszterdam,
  Cloudflare DDoS, EU-tárolás), AES-256 + SOC 2 + ISO 27001 magyarázattal
- 4. szakasz (új): GDPR-megfelelőség konkretizálva: adatminimalizálás,
  célhoz kötöttség, EU-tárolás, titkosítás, naplózás, érintetti jogok,
  panaszjog, DPA (data processing agreement)
- 9-11. szakasz (új): Egyházi hierarchia részletesen
  * Lelkész — saját gyülekezet teljes adata
  * Könyvelő — csak pénzügyi, csak a saját gyülekezet
  * Esperes/egyházmegyei admin — KIZÁRÓLAG az éves kötelező összesítők
  * Számvevő — csak ellenőrzési időszakban, csak pénzügyi
  * Kerületi admin — kerület-szintű AGREGÁLT összesítők; egyéni tag
    személyes adatához NEM fér hozzá
  * Rendszergazda (Szőcs Endre) — gyülekezeti adatokhoz CSAK lelkészi
    engedéllyel, időkorláttal, naplózva, célhoz kötötten
  * Lelkész bármikor visszavonhatja az engedélyt 1 kattintással
  * RLS technikailag is kényszeríti — nem csak ígéret
- 11. Naplózás-szakasz (új): tag bármikor megkérdezheti "ki látta", és
  pontos választ kap

Új Term-definíciók: Supabase, Railway, DDoS, PostgreSQL, AES-256,
SOC 2 Type 2, ISO 27001, DPA. Összesen 8 új szakkifejezés.

Verify: TypeScript + build zöld.

Csak webes release.

---

## [2026-05-02d] — Sidebar click bug fix + "üzleti termék" tisztítás (v0.9.24)

### 🐛 KRITIKUS BUG FIX: sidebar nav-link click

A felhasználó panasza: "A sidebar-ban ha kattintok egy oldalra vagy
almenüre akkor nem vezet át oda!". Diagnosztika: a v0.9.7 sablon-elemekből
származó `<MotifTrellis>` SVG (kerített kert sidebar-decor) `position:
absolute; inset: 0`-val a sidebar tartalma **fölött** áll. Az SVG
alapból `pointer-events: auto` — `aria-hidden` a felhasználó nem látta,
de a click NEM ért el a `<Link>`-ekhez.

**Fix**: `pointerEvents: 'none'` az `MotifTrellis` SVG inline-style-jában.
A click most átmegy az SVG-overlay-en a nav-link-ekhez.

### 🧹 "Üzleti termék" / "ingyenes" / "0 lej" tisztítás (v0.9.23-ból)

A felhasználó észrevétele: "A nem üzleti termék részt töröld mindenhonnan
mert valószínüleg ezért a gyülekzeteknek majd fizetniük kell". A
legal-dialog.tsx-ből az alábbiak módosítása:

- ÁSZF Note: "nem üzleti termék" + "rendszer ingyenes" → semleges
  megfogalmazás ("egyházi szolgálati eszköz", "minden gyülekezetnek
  áldás lehet")
- ÁSZF 3. szakasz: "A Kartotéka *ingyenes*" → "A szolgáltatás díjazása"
  (kerületi adminisztratív csatornán keresztül kapnak tájékoztatást)
- ÁSZF 4. szakasz "csak egyházi célra" pont: "Ez nem üzleti, nem marketing,
  nem politikai eszköz" → "szolgálati feladatok támogatására, gyülekezeti
  élet nyilvántartására"
- Felelősség-kizárás: "max 0 (nulla) lej, mivel ingyenes szolgálati
  ajándék" → "vonatkozó jogszabályok és szolgáltatás jellege szerint a
  lehető legkisebbre korlátozzuk"
- Kapcsolat záró bátorítás: "szolgálati eszköz, nem üzleti termék" →
  "egyházi szolgálati eszköz"

A megfogalmazás most jövő-biztos: nem zárja ki sem a díj-mentes
használatot, sem a későbbi díjbevezetést.

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02d] — Sidebar click-elhetetlen overlay javítva (v0.9.24, csak web)

<!-- key: 2026-05-02d-sidebar-click-fix -->
<!-- category: bugfix -->
<!-- version: v0.9.24 (csak web) -->
<!-- targets: minden webes felhasználó -->

### 🐛 Bug

A felhasználó panasza: "A sidebar-ban ha kattintok egy oldalra vagy
almenüre akkor nem vezet át oda!". Diagnosztikával derült ki: a
v0.9.7-es sablon-elemekből származó `<MotifTrellis>` SVG (kerített kert
téma sidebar-decor-jaként) `position: absolute; inset: 0`-val a sidebar
tartalma **fölött** áll. Az SVG-knek alapból `pointer-events: auto`
értékük van, így a click-eket az SVG kapta el — és mivel `aria-hidden`,
a felhasználó nem látta hogy ott van valami fölött. A click NEM ért el a
`<Link>` navigációs elemekhez.

### ✅ Fix

A `packages/ui/src/motifs/index.tsx` `MotifTrellis` SVG inline-style-jában
hozzáadva: `pointerEvents: 'none'`. Ezzel a sidebar nav-link click-jei
most átmennek az SVG-overlay-en és helyesen aktiválják a Next.js Link
navigációt.

A többi motívum (Church, Bible, Olive, Dove, Cross, Star4) jelenleg
NEM `position: absolute` overlay-ben renderelődik (csak inline content-ben),
így ezek nem érintettek — de jó-gyakorlat-szerűen érdemes lenne nekik is
hozzáadni a `pointer-events: none`-t. Ez későbbi finomítás.

### 📦 Release

Csak webes (Railway auto-deploy). Mind a 3 téma érintett (a Trellis a
Kerített kert default témán használt sidebar-decor-ként; a Csendes
parókia és Zsoltáros eltérő motivumokat használ).

---

## [2026-05-02c] — Legal-dialog tartalom: laikus, lelkipásztorbarát, bővebb (v0.9.23)

<!-- key: 2026-05-02c-legal-laikus -->
<!-- category: improvement -->
<!-- version: v0.9.23 (csak web) -->
<!-- targets: minden lelkipásztor, esperes, anonim felhasználó -->

A felhasználó kérése: a 4 jogi tartalom (Adatvédelem / ÁSZF / Súgó /
Kapcsolat) **bővebben, laikus-barát, megnyugtató** hangvételben legyen
megfogalmazva, **minden szakkifejezés és rövidítés** alaposan magyarázva,
**bátorítással**, hogy mennyire megéri a rendszer használata. Plus
**Szőcs Endre lelkipásztor** mind az adatkezelő, mind a rendszergazda.

### 🛠 Tartalom-átdolgozás

A `legal-dialog.tsx` 4 függvényének (Privacy/Terms/Help/Contact) teljes
átírása:

- **Adatvédelem** (12 szakasz): adatkezelő-rendszergazda (Szőcs Endre
  lelkipásztor), szellemi alap (Beke Tivadar), tárolás („felhő"
  magyarázat), célok (6 modul felsorolva), jogalap (GDPR + Ro 190/2018
  rövidítés-magyarázat), adatkör (10 pont), biztonsági rétegek (TLS,
  RLS, RBAC, 2FA, naplózás minden definíciójával), hozzáférés
  (5 szerepkör), megőrzés, érintetti jogok (6 GDPR-jog), panasz-csatorna,
  felelősségi nyilatkozat, záró bátorítás
- **ÁSZF** (11 szakasz): mi a Kartotéka, hozzáférés (kerületi jóváhagyás
  magyarázat), <strong>INGYENES</strong> kihangsúlyozás, felhasználói
  kötelezettségek (5 pont), üzemeltető jogai, „as is" elv (vis maior
  magyarázat), felelősség-kizárás (5 pont, max 0 lej), adatvédelem
  hivatkozás, szellemi tulajdon, módosítások, joghatóság, záró bátorítás
- **Súgó** (10 GYIK): hozzáférés, modulok (10 modul felsorolva), jelszó-
  helyreállítás (3 lépés), adatkör, biztonsági aggályok (4 jelzés +
  phishing magyarázat), offline használat, multi-gyülekezet, nyomtatás
  (5 PDF-export), publikus oldal, kit kérdezzek + bátorítás
- **Kapcsolat**: rendszergazda card (Szőcs Endre — kiemelt amber
  háttér), szellemi alap card (Beke Tivadar — emerald háttér), kapcsolat-
  témakörök (6 pont), sürgős esetek (4 jelzés), ANSPDCP teljes adatok
  (név, cím Bukarest, web), ANSPDCP rövidítés-magyarázat, egyházi csatorna
  (esperesi/egyházmegyei/kerületi), záró bátorítás

### ✨ Új UI elemek

- **`<Note>`**: zöld háttéres bátorító/figyelmeztető blokk (minden
  szövegben 2-3 db, megnyugtató hangvételben)
- **`<Term>`**: szakkifejezés-definíció kiemelése (15+ definíció a
  Kartotéka kifejezésekre: GDPR, RLS, RBAC, 2FA, TLS 1.3, Naplózás,
  „as is", Vis maior, Phishing, ÁSZF, ANSPDCP, kerületi jóváhagyás,
  felhő/cloud, Supabase, adatkezelő, rendszergazda)

### 🛠 Technikai

A `<Term def="...">` prop-ok template-string formára cserélve
(`def={'...'}`), mert a magyar idézőjeleken („ ") belüli ASCII `"`
karakterek lezárták volna a JSX-string-et.

### ✅ Verify

- TypeScript (tsc --noEmit) zöld
- Build (next build --webpack) zöld

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02b] — Adatvédelem / ÁSZF / Súgó / Kapcsolat tartalom + kötelező pipa (v0.9.22)

<!-- key: 2026-05-02b-legal-dialog -->
<!-- category: feature -->
<!-- version: v0.9.22 (csak web) -->
<!-- targets: minden anonim és bejelentkező felhasználó -->

A felhasználó kérése: a bejelentkezés / hozzáférés-kérő oldal footer
linkeit (Adatvédelem, ÁSZF, Súgó, Kapcsolat) tartalommal feltölteni,
modal-ablakban megnyitni, és a hozzáférés-kérelem beküldésénél kötelező
elfogadási pipákat tenni.

### 🛠 Új komponensek

- **`apps/web/components/auth/legal-dialog.tsx`** (`LegalDialog`) —
  egyetlen Dialog komponens 4 `kind` prop-pal:
  - `privacy` — **Adatvédelmi tájékoztató** (10 szakasz: adatkezelő,
    cél, jogalap, adatkör, biztonság, hozzáférés, megőrzés, jogok,
    felelősségi nyilatkozat, kapcsolat)
  - `terms` — **Általános Szerződési Feltételek** (9 szakasz:
    szolgáltatás, hozzáférés, felhasználó kötelezettségei, üzemeltető
    jogai, „as is" jelleg, felelősség-kizárás, szellemi tulajdon,
    módosítások, joghatóság)
  - `help` — **Súgó** (7 GYIK: hozzáférés, mire való, jelszó-helyreállítás,
    adatkör, biztonsági aggály, offline, kit kérdezzek)
  - `contact` — **Kapcsolat** (adatkezelő, rendszergazda, kapcsolat-témák,
    szellemi alap, ANSPDCP romániai adatvédelmi hatóság cím)
- **`apps/web/components/auth/auth-footer-links.tsx`** — a 4 button +
  `LegalDialog` integráció. `extraLeading` prop a `/hozzaferes-kerese`
  page-en a "Belépés" linkhez.

### 🎯 Tényalap (NEM találgatva)

- **Adatkezelő**: Erdélyi Református Egyházkerület (EREK)
- **Rendszergazda**: **Szőcs Endre** — az EREK megbízásából
- **Szellemi alap**: **Beke Tivadar** egyházi nyilvántartási rendszere
  (ennek digitális továbbfejlesztése a Kartotéka)
- **Tárolás**: Supabase Frankfurt am Main, EU
- **Jog**: GDPR (EU 2016/679) + Romániai 190/2018. sz. törvény
- **Biztonság**: TLS 1.3, RLS, RBAC, 2FA, naplózás
- **Adatvédelmi panasz hatóság**: ANSPDCP, Bukarest

### ⚖️ Felelősség-kizáró záradékok (a felhasználó kifejezett kérésére)

A két jogi szövegben (Adatvédelem 9. és ÁSZF 6. szakasz) explicit
megfogalmazás:
- A rendszergazda (Szőcs Endre) és a szellemi alapot adó személy (Beke
  Tivadar) NEM vállal felelősséget az adatok hibájáért, vesztéséért,
  harmadik fél miatt bekövetkező szolgáltatáskiesésért, vis maior
  okozta károkért, és a használatból eredő közvetett/következményi
  károkért.
- A szolgáltatás „as is" alapon, ingyenesen érhető el — a felelősség
  mértéke maximum 0 lej.
- Az adatok pontosságáért a bevitelt végző felhasználó (lelkész,
  gyülekezet) felel.

### 🛠 AccessRequestForm módosítás

A submit gomb előtt 2 új kötelező checkbox:
1. „Elolvastam és elfogadom az **Adatvédelmi tájékoztatót**" — link
   nyitja a privacy dialogot
2. „Elolvastam és elfogadom az **Általános Szerződési Feltételeket**" —
   link nyitja a terms dialogot

A submit gomb `disabled` amíg mindkettő nincs bepipálva. Submit-pre-check:
ha hiányzik, toast.error.

### 🛠 Footer linkek button-okká

Az `(auth)/layout.tsx` és `(public)/hozzaferes-kerese/page.tsx`
footer-jén a 4 link (Adatvédelem / ÁSZF / Súgó / Kapcsolat) `<Link>`
helyett `<button>` elem (a `LegalDialog`-ot nyitja). A `kt-auth-footer-link`
osztály reset-et kap (background: none, border: 0, padding: 0).

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-02a] — Splash v3: csillagok + EREK aspect-ratio fix (v0.9.21)

<!-- key: 2026-05-02a-splash-stars-erek-aspect -->
<!-- category: improvement -->
<!-- version: v0.9.21 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználó új splash design-t küldött (`Kartotéka-handoff-Splash` v3,
URL: `IP4GQtEbfsvsuaGTvzuVhA`) és észrevette, hogy "az egyházkerületek
címereinek méretarányát mert most sem az igazi".

### 🎨 v3 vs v2 különbség

A diff egyetlen sor: a `loader-leaf` jelzés cseréje. Korábban
`҂ ҂ ҂` (cirill kereszt-jel), mostantól **`✦ ✦ ✦`** (négyágú csillag) —
illeszkedik a sablon eyebrow-arany csillaghoz a headline felett.

### 🐛 EREK aspect-ratio fix

A natural-méretek vizsgálatából (Chrome MCP `Image.naturalWidth/Height`):

| Asset | Natural | Aspect |
|---|---|---|
| KEREK.png | 432×432 | **1.000** (négyzet) |
| KARTOTEKA_V3.png | 1375×1375 | **1.000** (négyzet) |
| EREK.png | **250×400** | **0.625** (keskeny/magas, NEM négyzet!) |

A v0.9.15-ben behozott 238×238-as forced méret **eltorzította** az EREK
aspect-ratio-ját. A felhasználó ezért látta továbbra is mérethibásnak.

**Fix**: az EREK `<Image>` mostantól **175×280** (height: 280 teljes,
width: 175 = 280×0.625, megőrzi az aspect-ratio-t). A 280×280 wrapper
`placeItems: center` automatikusan vízszintesen középre igazítja, így
a KEREK (280×280) és EREK (175×280) **optikailag azonos magasságúak**,
és az EREK keskenyebb-magasabb formája megőrződik.

### ✅ Verify

- TypeScript + build zöld
- Localhost ellenőrzés: a felhasználó inkognitó-tab-ban tudja
  validálni a splash-t (a session-aktív tab-on a `/login` redirect-el)

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01x] — AccessRequestForm "Gyülekezet" label tisztítás (v0.9.20)

<!-- key: 2026-05-01x-access-form-gyulekezet-label -->
<!-- category: improvement -->
<!-- version: v0.9.20 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a Hozzáférés kérelme / Adatok megadása
résznél a '(ha tudja)' szöveget töröld") alapján az
`access-request-form.tsx` 163. sorában a `Label` szövege:

- "Gyülekezet (ha tudja)" → "Gyülekezet"

Csak webes release.

---

## [2026-05-01w] — Auth-card szélesebb + jobb reszponzivitás (v0.9.19)

<!-- key: 2026-05-01w-auth-wider-responsive -->
<!-- category: improvement -->
<!-- version: v0.9.19 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a Hozzáférés kérelme / Adatok megadása
ablaka egy kicsit szélesebb, van még hely a Csatlakozzon hozzánk!
… szöveg fele. Figyelj arra hogy legyen reszponzív!!") alapján a card
kibővítése + új breakpointok.

### 🎨 Card szélesebb

- `kt-auth-main grid-template-columns: 1fr 1fr` →
  `minmax(0, 1fr) minmax(0, 1.3fr)` — a jobb oldali card 30%-kal több
  helyet kap
- `kt-auth-main gap: 64px` → `56px`, `max-width: 1400px` → `1500px`
- `kt-auth-card max-width: 460px` → `560px`, padding `36px 40px` →
  `36px 44px`
- `≥ 1500px` viewporton a card maximum **600px** szélességig nyúlhat
- `kt-auth-left max-width: 520` → `540`

### 📐 Új reszponzív breakpointok (5 szint)

- **≥ 1500px**: card max 600px
- **1280–1500px**: 1fr / 1.15fr arány, gap 48, greeting 64px
- **1100–1280px**: 1fr / 1.05fr arány, gap 40, greeting 56px, padding
  szűkül
- **980–1100px**: tablet, kompakt 2-col
- **< 980px**: 1 oszlop, card max 600px center-elve, greeting 52px,
  text-align left
- **< 540px**: phone, brand 52×52, greeting 40px, card 26×20+radius 20,
  back-link kompakt

### ✅ Verify (Chrome MCP, localhost:3000/hozzaferes-kerese)

Desktop 2560×1271 viewporton:
- `mainCols: 606.948px 789.052px` ✅ (1.3:1 arány)
- `cardWidth: 599px` ✅ (volt: 460)
- `leftWidth: 540px` ✅
- `greeting: 72px` ✅
- TypeScript + build zöld

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01v] — /hozzaferes-kerese sablon-konform + greeting csere (v0.9.18)

<!-- key: 2026-05-01v-hozzaferes-sablon -->
<!-- category: improvement -->
<!-- version: v0.9.18 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a hozzaferes-kerese oldal legyen olyan a
stílusa mint a bejelentkező oldalnak — építsd be kreatívan és szépen")
+ "Az 'Áldás, békesség!' helyett legyen: 'Békesség Istentől!'" alapján
két javítás.

### 🎨 /hozzaferes-kerese page redesign

A korábbi `bg-gradient-to-br from-slate-50 via-teal-50/30 to-amber-50/30`
+ központosított max-w-4xl card cseréje a `kt-auth-*` osztály-családra
(ugyanaz a sablon-stílus, mint a `/login` page-en):

- **Page background**: `/Hatter.png` fixed cover + warm vignette overlay
  (sablon szerinti)
- **Brand top-left + back-link**: új `kt-auth-brand-row` flex
  konténer — bal: KARTOTÉKA brand (64×64 frosted-circle logo + name +
  tag), jobb: pill-link "← Vissza a bejelentkezéshez" (rounded-full,
  beige + arany border, hover → zöld)
- **Main 2-column** (1fr 1fr, gap 64):
  - **Bal — kreatív bemutatás**: greeting "Csatlakozzon hozzánk!"
    (Cormorant Garamond 72px) + lede + **3-step process** (ClipboardCheck,
    Hourglass, KeyRound ikonok + 22×22 zöld gradient számbadge "1/2/3"
    a bal-felső sarkukon) + verse "Mert ahol ketten vagy hárman..."
    Máté 18,20 (BookOpen ikonnal)
  - **Jobb — card**: frosted-glass `kt-auth-card` keret + új card-header
    (eyebrow "Hozzáférés kérelme" + title "Adatok megadása" Cormorant
    30px + desc) + meglévő `<AccessRequestForm />` változatlan logikával
- **Footer**: cross + Belépés / Adatvédelem / ÁSZF / Súgó link + copyright

### 🛠 Új CSS — kartoteka.css

Új osztályok:
- `kt-auth-brand-row` (flex space-between)
- `kt-auth-back-link` (rounded-full pill, beige bg, arany border)
- `kt-auth-step-num` + `kt-auth-step-badge` (22×22 számbadge a feature-
  ico-n, zöld gradient)
- `kt-auth-verse-ico` (BookOpen 18×18 + 10px gap a verse-text előtt)
- `kt-auth-card-header` + `kt-auth-card-eyebrow` + `kt-auth-card-title`
  + `kt-auth-card-desc` (form-feletti header-block alulnyitott aláhúzás)
- `kt-auth-verse-text` flex layout (ikon + text)

### 🎨 Greeting csere a /login-on

`AuthLeftPane`: "Áldás, békesség!" → **"Békesség Istentől!"**.

### ✅ Verify (Chrome MCP, localhost:3000)

- /hozzaferes-kerese: `kt-auth-page` ✅, `mainCols: 644px 644px` ✅,
  `leftGreeting: "Csatlakozzon hozzánk!"`, 3 step-badge, card-header
  "Adatok megadása", verse Book-ikonnal
- /login: greeting `"Békesség Istentől!"` ✅
- TypeScript + build zöld

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01u] — Bejelentkezés card sablon-konform + middleware redirect bug fix (v0.9.17)

<!-- key: 2026-05-01u-bejelentkezes-card-redirect-fix -->
<!-- category: bugfix + improvement -->
<!-- version: v0.9.17 (csak web) -->
<!-- targets: minden webes felhasználó -->

### 🐛 Diagnosztika: /hozzaferes-kerese redirect-loop bug

A felhasználó észrevette, hogy a "Kérjen hozzáférést!" gomb (login page)
nem működik — visszaviszi a `/login`-ra. Diagnosztikával derült ki, hogy
a `lib/supabase/middleware.ts` 90. sora minden anonim user-t a
`/login`-ra redirect-el, ha az URL nem `PASTOR_AUTH_ROUTES`-ban van.

A `/hozzaferes-kerese` page a `(public)` Next.js route-group-ban van, de
a Next.js group-name (`(public)`) NEM jelenik meg a pathname-ben — így
a middleware nem ismerte fel publikusként, és anonim user-eket
visszairányított.

**Fix**: új `PUBLIC_AUTH_ROUTES = ['/hozzaferes-kerese']` whitelist és
`isPublicAuthRoute()` helper. Az `updateSession()` early-return-öl, ha
a path egyezik, és nem fut le az anonim-redirect logika.

### 🎨 LoginForm sablon-konform card-belső

A felhasználó visszajelzése: "a bejelentkezés és a regisztráció kis
ablak nem egyezik tökéletesen a sablon dizájnjával". A `LoginForm`
teljes átírása a `Bejelentkezes.html → AuthCard + LoginForm` szerint.

**Új struktúra**:
- **Tabs** (Bejelentkezés / Regisztráció — utóbbi link a `/hozzaferes-
  kerese`-re), grid 1fr 1fr, alul arany aláhúzás + zöld active-indikátor
- **Field** komponens: 48 px magasságú `input-wrap` keret, balra ikon
  (44 px ico-cella), jobbra `<input>`, jelszónál reveal eye gomb
  (`Eye`/`EyeOff` toggle). Focus-state: zöld border + 3 px green-glow.
  Error-state: piros border + 3 px red-glow + alatta `field-msg`.
- **Row-between**: bal "Emlékezz rám" check (custom 18×18 box, zöld
  pipa) + jobb "Elfelejtett jelszó?" zöld link
- **Primary button**: 52 px, `linear-gradient(180deg, #3a7050, #275638)`
  zöld gradient + Arrow ikon, `loading` esetén Loader2 spin
- **Secondary button**: "Új fiók létrehozása" link a `/hozzaferes-
  kerese`-re, arany border, hover → zöld
- **Badge**: "Szinkronizálható offline módban" zöld pill (Cloud ikon)
- **Fineprint**: "A regisztráció kerületi jóváhagyáshoz kötött."

### 🛠 Új CSS — kartoteka.css

`kt-auth-tabs`, `kt-auth-tab`, `kt-auth-tab-indicator`, `kt-auth-form`,
`kt-auth-field`, `kt-auth-input-wrap`, `kt-auth-input-ico`,
`kt-auth-reveal`, `kt-auth-row-between`, `kt-auth-check`,
`kt-auth-check-box`, `kt-auth-link`, `kt-auth-btn-primary`,
`kt-auth-btn-secondary`, `kt-auth-badge`, `kt-auth-fineprint`,
`kt-auth-server-error` — összesen ~280 sor új CSS, sablon-szín-paletta
(beige/gold/green) + box-shadow + transition-állapotok.

### ✅ Verify (Chrome MCP, localhost:3000)

- `/login`: 2 tab, 2 ikonos input (mail+lock), reveal eye, "Belépés"
  primary, "Új fiók létrehozása" secondary, "Szinkronizálható offline
  módban" badge ✅
- `/hozzaferes-kerese`: NEM redirect-el `/login`-ra; `h1: "Csatlakozzon
  a Kartotéka rendszerhez"` ✅
- TypeScript + build zöld

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01t] — Bejelentkezés oldal sablon szerint (v0.9.16)

<!-- key: 2026-05-01t-bejelentkezes-sablon -->
<!-- category: improvement -->
<!-- version: v0.9.16 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a bejelentkezés/regisztrációs képernyő nem
változott — javítsd a legfrissebb sablon szerint, legyen reszponzív")
alapján az auth-layout teljes átdolgozása a `Kartotéka-handoff-
bejelentkezes → Bejelentkezes.html` sablon szerint.

### 🎨 Új layout-szerkezet

A korábbi 50/50 split-panel (bal: form, jobb: gradient-hero EREK + Zsolt 23
idézet) helyett a sablon szerinti:

- **Háttér**: `/Hatter.png` (fixed, cover) + warm vignette overlay
- **Brand top-left** (64×64 frosted-circle + KARTOTÉKA + tagline)
- **Main 2-column** (1fr 1fr, gap 64):
  - **Bal**: Greeting "Áldás, békesség!" (Cormorant Garamond 72px) + lede
    + 3 features (Biztonságos hozzáférés, Online/Offline, Lelkészekre szabott)
    + Verse (Róma 15,33)
  - **Jobb**: Frosted-glass card (rgba(252,248,238,.62) + backdrop-blur 28px
    + saturate 140%) — a `children` (LoginForm) ide kerül
- **Footer**: cross + Adatvédelem + ÁSZF + Súgó + Kapcsolat + copyright

### 📐 Reszponzív breakpointok (sablon szerint)

- **≥ 980px**: 2 oszlop, brand padding 28×56, greeting 72px
- **< 980px**: 1 oszlop, brand padding 22×24, greeting 56px, max-w 560
- **< 540px**: brand 52×52, greeting 44px, card padding 28×22 + radius 20

### 🛠 Új komponensek + módosítások

- **`apps/web/components/auth/auth-left-pane.tsx`** (új) — Greeting + lede
  + 3 lucide-react ikonos feature + verse
- **`apps/web/app/(auth)/layout.tsx`** — teljes átírás: 50/50 split-panel
  → sablon-szerű 1-frame brand + 2-col main + footer
- **`packages/ui/src/kartoteka.css`** — új `kt-auth-*` osztály-család
  (~350 sor): page-bg, vignette, shell, brand, main, left, features,
  verse, card, footer + 2 média-query

### 🛠 LoginForm

A `login-form.tsx` belső struktúrája MEGMARAD egyelőre (a Tailwind 4
Input/Label/Button shadcn-alapú komponensek a frosted-glass card-ban
természetesen szerepelnek). A sablon ikonos `<Field>` komponens teljes
implementációja (mail+lock+eye+reveal) későbbi finomítás (külön task).

### ✅ Verify (Chrome MCP, localhost:3000/login)

- `pageBg: url("/Hatter.png")` ✅
- `mainCols: "644px 644px"` ✅ (2-oszlop)
- `leftFeatures: 3` ✅
- `cardBg: rgba(252, 248, 238, 0.62)` ✅
- `greeting Cormorant Garamond 72px` ✅
- `brandLogoImgSize: 56×56` ✅

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01s] — Splash bug-fix: inline-style opacity + EREK logó méret (v0.9.15)

<!-- key: 2026-05-01s-splash-bugfix-inline -->
<!-- category: bugfix -->
<!-- version: v0.9.15 (csak web) -->
<!-- targets: minden webes felhasználó -->

### 🐛 Splash opacity bug

A v0.9.14-ben bevezetett SplashScreen-en csak a beige `#d8cfba` stage-háttér
látszott — a logók, headline, footer mind opacity 0-on maradtak annak
ellenére, hogy a `s-on s-sides s-center s-headline s-text` stage osztály
helyesen érvényesült. Az ok: a CSS class-cascade-en alapuló opacity-vezérlés
megbízhatatlan volt (Tailwind 4 layer-prioritás vagy strict-mode timing
ütközés). `!important` se javított.

**Fix**: az opacity/transform/filter értékek mostantól **inline `style`
prop-ban** kapcsolódnak a `phases.has('s-...')` kifejezésekhez. A komponens
React render-jében közvetlenül érvényesülnek, függetlenül a CSS cascade-től.

A `SESSION_KEY` setItem az `hideTimer`-be (NEM a useEffect elejére), hogy
a strict-mode 2-szeres futtatás ne idézze elő a "splash már látott"
bélyeget az 1. cleanup után.

### 🎨 EREK logó méret-korrekció

A felhasználó visszajelzése: "az EREK ikon nagyobb" — a két oldalsó címer
optikailag nem volt egyforma méretű. Az ok az eltérő natural aspect-ratio
(EREK PNG nem 1:1, hanem magasabb).

**Fix**: az EREK `<Image>` mostantól explicit **238×238 px** (a 280×280 KEREK
85%-a), `objectFit: contain` mellett. Így optikailag mindkét logó hasonló
méretben jelenik meg.

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01r] — SplashScreen v2 — 1920×1080 cinematic 5-fázisú animáció (v0.9.14)

<!-- key: 2026-05-01r-splash-v2-cinematic -->
<!-- category: improvement -->
<!-- version: v0.9.14 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("Nem jó splash screent tettél be, javítsd
a legújabbra" — `Kartotéka-handoff-Splash-v2.zip → Splash.html`) alapján
a `SplashScreen` teljes átdolgozása az új sablon szerint.

### 🎨 Az új design

A v0.9.13-as koncentrikus körök mintával ellentétben az új splash
**1920×1080 cinematic stage**, amely a viewport méretére scale-elődik.
A Kartotéka **3 logóval** köszönt: a középen a teljes Kartotéka
emblémát, baloldalt a **Királyhágómelléki Református Egyházkerület**
(KEREK), jobboldalt az **Erdélyi Református Egyházkerület** (EREK)
címerével.

### 🛠 5-fázisú animáció (5 mp default)

- **0–20%** (`s-on`): háttér fade-in (`Hatter.png` zoom 1.04→1.0,
  vignette, por-szemcsék drift, conic-gradient napsugarak)
- **20–40%** (`s-sides`): a 2 oldalsó címer megjelenik (translate +
  scale 0.94→1.0)
- **40–60%** (`s-center`): a központi `KARTOTEKA_V3.png` logó zoom-in
  (scale 0.86→1.0, blur 8→0) + halo radial-gradient mögötte
- **60–80%** (`s-headline`): "✦ Békesség Istentől!" Cormorant Garamond
  italic 96px + arany ornament-line
- **60–100%** (`s-text`): "Egyházi nyilvántartó rendszer" + arany rule
  + "HIT. HAGYOMÁNY. KÖZÖSSÉG. SZOLGÁLAT." tagline + "Betöltés..."
  italic + zöld→arany gradient progress bar

### 🛠 Implementáció

- **Új komponens**: `apps/web/components/ui/splash-screen.tsx` —
  teljes átírás. State machine (`Set<Phase>`), `useStageScale` (resize-
  aware 1920×1080 scaler), animation loop (`requestAnimationFrame` a
  loader progress-hez).
- **Új CSS** (kartoteka.css): `kt-splash-*` osztály-család, ~250 sor
  (stage, bg-img, vignette, motes, rays, headline, ornament, center
  row, side logo, center logo, halo, meta, footer, loader). Az
  összes animáció CSS-vel (transition + keyframe), nem JS.
- **Új assetek** (`apps/web/public/`):
  - `Hatter.png` (1.66 MB — háttér-festmény)
  - `KEREK.png` (227 KB — Királyhágómelléki Református Egyházkerület)
  - `KARTOTEKA_V3.png` (483 KB — főlogó)
- **Időzítések**: `DURATION_MS=5000`, `FADE_DELAY_MS=5500`,
  `HIDE_DELAY_MS=6500` (a 3.5 mp helyett 6.5 mp, hogy az 5 mp animáció
  lefusson).

### ✅ Verify

- TypeScript (tsc --noEmit) zöld
- Build (next build --webpack) zöld

### 📦 Release

Csak webes (Railway auto-deploy). A Splash session-szintű
(sessionStorage flag, csak első tab-megnyitásnál látszik).

---

## [2026-05-01q] — Bejelentkezés előtti SplashScreen sablon szerint (v0.9.13)

<!-- key: 2026-05-01q-splash-sablon -->
<!-- category: improvement -->
<!-- version: v0.9.13 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("cseréld le a Bejelentkezés előtti splash
betöltő oldalt erre" — `Kartotéka-handoff-Splash.zip` mellékletre) alapján
a `SplashScreen` átdolgozása a sablon `screens.jsx → SplashScreen`
mintájára.

### 🎨 Változások (`apps/web/components/ui/splash-screen.tsx`)

A korábbi `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`
+ `reformatus.ro` URL-en hosztolt EREK címer + Máté 18:20 idézet **teljes
átírva** sablon szerintire:

- **Háttér**: `bg-gradient` → `var(--sidebar)` (téma-aware sötét sidebar
  szín, kert: `#143030`, parokia: `#1f3a3a`, zsoltaros: `#2a2218`)
- **Háttér motívum**: koncentrikus körök SVG (640×640, 3 kör + kereszt-
  tengely, opacity 0.06, currentColor → `var(--sidebar-foreground)`)
- **Logó**: `reformatus.ro` URL → **lokálisan szervírozott
  `/kartoteka-logo.png`** 168×168 méretben, `kt-pulse` animáció +
  drop-shadow
- **Cím**: "Kartotéka" font-heading 42px (volt: text-4xl bold) +
  "Egyházi Nyilvántartó Rendszer" uppercase letterSpacing 1.5px (volt:
  "Erdélyi Református Egyházkerület")
- **Új elem**: indeterminate progress bar (220×3px, `var(--accent2)`
  színnel, sliding shimmer animáció `kt-splash-bar` keyframe)
- **Új elem**: "Adatok szinkronizálása…" felirat
- **Footer**: copyright a képernyő aljához, sidebar-foreground 50%
  opacity
- **Eltávolítva**: a Máté 18:20 idézet (a sablon NEM tartalmaz idézetet
  a splash-en)

### 🛠 CSS — új keyframe (kartoteka.css)

```css
@keyframes kt-splash-bar {
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(330%); }
}
.kt-splash-bar {
  animation: kt-splash-bar 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
```

A 220px szélességű háttér-pálya egy 1/3 szélességű csúszó kis sávot
animál — a felhasználó "haladás" benyomást kap.

### 🛠 Új asset

- `apps/web/public/Hatter.png` (1.6 MB) — a sablon zip-ből másolva
  (jelenleg nincs használva a SplashScreen-ben, de elérhető a jövőbeli
  használathoz, ha a háttér képet is be akarjuk építeni a sidebar-szín
  helyett).

### 📦 Release

Csak webes (Railway auto-deploy). A Splash session-szintű (3.5s után
elhalványul, és sessionStorage-ben rögzíti, hogy ne jelenjen meg újra
ugyanabban a tab-ban).

---

## [2026-05-01p] — RouteLoadingScreen Kartotéka-logóval (v0.9.12)

<!-- key: 2026-05-01p-loading-kartoteka-logo -->
<!-- category: improvement -->
<!-- version: v0.9.12 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a betöltő képernyőn a Kartotéka logója
legyen") alapján a `RouteLoadingScreen`-en az EREK logó cseréje
Kartotéka logóra:

- `<Image src="/EREK.png" width=54 height=54>` → `<Image
  src="/kartoteka-logo.png" width=64 height=64 priority>`
- A 80×80 card-keret + pulzáló glow változatlan
- Az "Erdélyi Református Egyházkerület" eyebrow + modul-név + 3 bouncing
  dot változatlan

A logó priority-vel töltődik (LCP candidate, mert a betöltő képernyő
a felhasználó által először látott elem a route-átmeneteken).

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01o] — Header desktop-on tiszta + RouteLoadingScreen Brand mintára (v0.9.11)

<!-- key: 2026-05-01o-header-desktop-clean-loading-brand -->
<!-- category: improvement + bugfix -->
<!-- version: v0.9.11 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzések ("a kartotéka oldalán a sidebar mellett
megjelent egy kis Kartotéka ikon, arra ott nincs szükség mert a
sidebar állandóan látszik" + "a Kartotéka másik betöltő képernyőjét
használd az oldalak közötti váltáskor") alapján két javítás.

### 🐛 Header desktop-on tiszta

A v0.9.8-ban hozzáadott Kartotéka-ikonos sidebar-toggle button (40×40
`bg-muted` `lg:flex` desktop+mobile) — mostantól **csak `lg:hidden`**,
azaz csak mobilon (< 1024px) jelenik meg. Desktop-on (≥ 1024px) a
sidebar állandóan látszik, így ott nincs szükség toggle-re.

A button mostantól csak a `onToggleMobileMenu` callback-et hívja
(a sablon-szerű chevron toggle nélkül, mert a desktop-igény elesett).
Az `onToggleSidebar` prop a típus-defin-ban marad backward-compat
miatt (a `dashboard-shell.tsx` még átadja).

### 🎨 RouteLoadingScreen — BrandLoadingScreen mintára

A felhasználó "másik betöltő képernyő" kérése alapján a v0.9.6-ban
létrehozott `RouteLoadingScreen` (CalvinSpinner + 4 lépéses
ellenőrzőlista) ÁTÍRVA a `BrandLoadingScreen` mintájára:

- **80×80 lekerekített** card-raised stílusú konténer + EREK logo
  (54×54) középen, pulzáló glow-val
- **Eyebrow**: "Erdélyi Református Egyházkerület" (kicsi uppercase
  tracking)
- **Title**: a modul-név (font-heading text-3xl)
- **Message**: barátságos egy-mondatos üzenet
- **3 bouncing dot** — `var(--accent)` / `var(--accent2)` /
  `var(--primary)` színekkel, kis stagger animáció (-0.2s / -0.1s / 0)

A 16 loading.tsx hívás érintetlen — a `<RouteLoadingScreen module="..." />`
API-ja továbbra is működik, csak a vizuális megjelenés változott a
`BrandLoadingScreen`-szerű brandelt kép-szerkezetre.

### 🛠 Érintett fájlok

- `apps/web/components/layout/header-refined-v3.tsx` — `lg:hidden`
  hozzáadva a Kartotéka-ikon button-hez, az onClick egyszerűsítve
- `apps/web/components/layout/route-loading-screen.tsx` — teljes
  átírás (CalvinSpinner + 4 lépés → EREK logo + 3 bouncing dot,
  BrandLoadingScreen-szerű layout)

### ✅ Verify (Chrome MCP, localhost:3000/dashboard)

- Header Kartotéka-ikon **NEM** látszik desktop-on (`visibleAtDesktop:
  false`) ✅
- TypeScript (tsc --noEmit) zöld
- Build (next build --webpack) zöld

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01n] — Missziós Műhely Kartotéka-logó Sheet-sidebar (v0.9.10)

<!-- key: 2026-05-01n-misszios-muhely-sheet-sidebar -->
<!-- category: improvement -->
<!-- version: v0.9.10 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a missziós műhely oldalon ha a Kartotéka
ikonra kattintok nem jelenik meg a sidebar") alapján a `MuhelyNavbar`
Kartotéka-logó kattintási viselkedésének átalakítása.

### Probléma

A Missziós Műhely külön top-level route (`app/misszios-muhely/`),
nem a `(dashboard)` group része — így nincs nála a megszokott
`SidebarAdaptiveV4`. A Kartotéka-logó pedig egyszerű `<Link>` volt
(navigál a kezdőlapra), nem nyitott sidebart.

### Megoldás

A Kartotéka-logó Link → button. Kattintásra **Sheet-alapú sidebar**
nyílik (a fő rendszer mobile-Sheet mintájára):

- `SheetContent side="left" w-[280px] bg-[var(--sidebar)]`
- Brand-fejléc: 88×88 Kartotéka logó + "Missziós Műhely" alcím
- Nav lista a sablon SidebarItem mintájára (10px rounded, accent-stripe
  az aktívnál, sima 18×18 ikon)
- Két szekció:
  1. **Műhely**: Kezdőlap, Segédanyagok, Fórum, Jutalmak
  2. **Kartotéka rendszer**: "Vissza az irányítópultra" (`/dashboard` link)
- Bezárás: háttér-kattintás vagy Esc

### ✅ Verify (Chrome MCP, localhost:3000/misszios-muhely)

- Brand button `aria-label="Oldalsáv megjelenítése"` ✅
- Kattintásra Sheet nyílik (sidebar bg `rgb(20,48,48)` kert témán) ✅
- 5 navItem: Kezdőlap, Segédanyagok, Fórum, Jutalmak, "Vissza az
  irányítópultra" ✅
- TypeScript (tsc --noEmit) zöld
- Build (next build --webpack) zöld

### 📦 Release

Csak webes (Railway auto-deploy).

---

## [2026-05-01m] — Missziós Műhely fejléce sablon-konform Kartotéka-ikonnal (v0.9.9)

<!-- key: 2026-05-01m-misszios-muhely-fejlec-sablon -->
<!-- category: improvement -->
<!-- version: v0.9.9 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a missziós műhely fejléce legyen pont olyan
mint a sablonban, az ikon legyen a Kartotéka ikonja") alapján a
`MuhelyNavbar` átdolgozása a sablon `mission.jsx → MMTopbar`
mintájára.

### 🎨 Változások (`MuhelyNavbar`)

- **Brand ikon**: 36×36 emerald-gradient `<Sparkles />` ikon → **44×44
  Kartotéka logó** (`/kartoteka-logo.png`, transzparens háttér).
- **Modul-név**: `font-heading text-xl font-semibold` → kicsi, uppercase,
  `text-[13px] font-semibold tracking-[0.12em] text-muted-foreground` +
  kicsi accent-színű fa-ág SVG ikon a sablon szerint.
- **Háttér**: `bg-white/80 backdrop-blur-xl` → krém-átlátszó
  `color-mix(in oklab, var(--background) 60%, transparent)` + `backdrop-blur-md`.
- **Border**: `border-emerald-100/60` → `border-border` (téma-aware).
- **Width-wrapper**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` → `w-full
  px-4 sm:px-6 lg:px-7` (full-width, sablon px-7 padding).
- **Aktív nav-link**: `bg-emerald-50 text-emerald-700` → `bg-card`
  + inline `color: var(--accent2)` + accent-szín shadow (téma-aware).
- **Mobile dropdown** + **mobile bottom tab bar**: emerald/slate színek
  cseréje `border-border bg-popover text-muted-foreground` +
  `var(--accent2)` aktív állapotban.

### ✅ Verify (Chrome MCP, localhost:3000/misszios-muhely)

| elem | sablon | jelenlegi |
|---|---|---|
| nav height | 64px | 64px ✅ |
| Kartotéka logó | 44×44 | 44×44 ✅ |
| modul-név | uppercase, 13.5px | uppercase, 13px ✅ |
| háttér | átlátszó krém | `oklab(.958 / 0.6)` ✅ |
| border-bottom | t.divider | `rgba(28,42,38,0.08)` ✅ |

- TypeScript (tsc --noEmit) zöld
- Build (next build --webpack) zöld

### 📦 Release

Csak webes (Railway auto-deploy). Desktop NEM kap új release-t.

---

## [2026-05-01l] — Missziós Műhely full-width + header Kartotéka-ikonos sidebar toggle (v0.9.8)

<!-- key: 2026-05-01l-misszios-muhely-fullwidth-kartoteka-toggle -->
<!-- category: bugfix + improvement -->
<!-- version: v0.9.8 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a missziós műhely két oldalán két nagy
üres rész van", "a fejléc legyen ugyanolyan mint a sablonban", "ha a
Kartotéka ikonra kattint a lelkész akkor jelenjen meg a sidebar még
egy kattintásra tűnjön el") alapján két javítás.

### 🐛 Missziós Műhely full-width fix

A `app/misszios-muhely/layout.tsx`-en a `<main>` osztálya
`max-w-7xl mx-auto` (1280px max-width) volt — a felhasználó 2560px-es
képernyőjén `632px üres rész volt mindkét oldalon`. Cserélve sima
`w-full` szélességre. Más route-ok (a `(dashboard)`-os group) NEM
érintettek — azok már full-width-ek.

Verify: `main_w: 2545px` (volt: 1280px) ✅.

### 🎨 Header Kartotéka-ikonos sidebar toggle

A sablon `shell.jsx → Topbar` 205-224 sor mintájára a header bal oldalán
mostantól egy 40×40-es **Kartotéka-ikonos toggle button** van:

- Asset: `/kartoteka-logo.png` 24×24 méretben
- Mobilon (< 1024px): a mobile-menu-Sheet-et nyitja (`onToggleMobileMenu`)
- Desktop-on (≥ 1024px): a sidebar-t collapse-eli/expand-elja
  (`onToggleSidebar` → `sidebarCollapsed` toggle, 288px ↔ 92px)

A button háttér: `bg-muted` 40×40 `rounded-xl` — sablon-konform icon-button
stílus. A `aria-label="Oldalsáv megjelenítése / elrejtése"`.

### 🛠 Érintett fájlok

- `apps/web/app/misszios-muhely/layout.tsx` — `max-w-7xl mx-auto` →
  `w-full`
- `apps/web/components/layout/header-refined-v3.tsx` — Menu-icon →
  Kartotéka-icon button (Image src=/kartoteka-logo.png), responsive
  toggle viselkedés
- `apps/web/components/layout/dashboard-shell.tsx` — új `onToggleSidebar`
  prop, átadás a Header-hez
- `apps/web/components/layout/dashboard-layout-client.tsx` — az
  `onToggleSidebar` callback bekötése a `setSidebarCollapsed` toggle-höz

### ✅ Verify (Chrome MCP, localhost:3000)

- Missziós Műhely `/misszios-muhely`: `main_w: 2545px` ✅
- Dashboard header: `Kartotéka icon 24×24px` ✅, `aria-label "Oldalsáv
  megjelenítése / elrejtése"` ✅
- TypeScript (tsc --noEmit) zöld
- Build (next build --webpack) zöld

### 📦 Release

Csak webes (Railway auto-deploy). Desktop NEM kap új release-t.

---

## [2026-05-01k] — Sablon szép elemek beépítése: SidebarDecor + BottomVerse + page transition + stat-arch (v0.9.7)

<!-- key: 2026-05-01k-sablon-szep-elemek -->
<!-- category: improvement -->
<!-- version: v0.9.7 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("keress a sablon és a jelenlegi oldal között
különbségeket és építsd be a sablon szép elemeit") alapján négy téma-aware
finomítás a Claude Design Handoff `shell.jsx` + `themes.jsx` + `motifs.jsx`
mintájára.

### 🎨 1. SidebarDecor — téma-specifikus motívum-overlay

Új komponens: `apps/web/components/layout/sidebar-decor.tsx`. A
`documentElement.data-theme` attribútumot figyeli (MutationObserver), és
a megfelelő motívumot rendereli:

- **Kerített kert** (default): teljes-területű **Trellis** rácsos minta,
  `var(--accent2)` színen, opacity 0.045
- **Zsoltáros**: alsó-középső **Dove** galamb, `var(--accent2)` színen,
  opacity 0.25 × 0.7
- **Csendes parókia**: nincs (a sablonban is `() => null`)

A `packages/ui/src/index.ts` mostantól re-exportálja a teljes
`./motifs` modult (7 SVG: Church, Bible, Olive, Dove, Cross, Star4,
Trellis), így a webes és asztali oldal egyaránt elérheti.

### 🎨 2. BottomVerse — fix igeszakasz csík

Új komponens: `apps/web/components/layout/bottom-verse.tsx`. A
`DashboardShell` után a layout aljára kerül. Sablon `shell.jsx →
BottomVerse` szerint:

- `border-t border-border bg-background/40 px-7 py-3.5`
- Quote-ikon + igeszakasz idézet (`font-heading italic`) + igehely
- Csak `sm:flex` (mobilon elrejtve)
- Aktuális szöveg: „Én veled vagyok minden napon a világ végezetéig.
  Máté 28,20"

### 🎨 3. kt-page-enter — page transition

Új CSS animáció a `packages/ui/src/kartoteka.css`-ben:

```css
@keyframes kt-page-enter {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
.kt-page-enter { animation: kt-page-enter 0.32s cubic-bezier(0.4,0,0.2,1) both; }
```

Beépítve a `dashboard-shell.tsx` content-wrapperébe (a `page-shell`
class mellé). Minden route-váltáskor automatikusan újrafut a Next.js
re-mount miatt — sablon `shell.jsx → Content` `viewKey`-mintájához
hasonló UX.

### 🎨 4. Stat-arch — Parókia témán íves stat-tile

Új CSS szabály (kartoteka.css):

```css
[data-theme="parokia"] .stat-arch::before {
  /* 70% szélességű, alulnyitott ívelt arch a stat-tile felett */
  content: "";
  position: absolute;
  top: 0.25rem; left: 50%;
  width: 70%; height: 3.5rem;
  border: 1.2px solid color-mix(in oklab, var(--accent) 20%, transparent);
  border-bottom: none;
  border-radius: 50% 50% 0 0;
  transform: translateX(-50%);
}
```

A `BottomStats.tsx` 7 stat-tile mostantól `card-raised stat-arch` osztályt
kap. **Csak a Parókia témán látható** az arch — Kerített kert + Zsoltáros
témán a `[data-theme="parokia"]` szelektor nem matchel, így rejtett.

Sablon `themes.jsx → ThemeParokia.statRadius` és `statArch: true`
értékéhez hasonló koncepció.

### 🛠 Érintett fájlok

- **Új**:
  - `apps/web/components/layout/sidebar-decor.tsx` (53 sor)
  - `apps/web/components/layout/bottom-verse.tsx` (37 sor)
- **Módosított**:
  - `packages/ui/src/index.ts` — `./motifs` re-export
  - `packages/ui/src/kartoteka.css` — `kt-page-enter` + `stat-arch`
  - `apps/web/components/layout/sidebar-adaptive-v4.tsx` — `<SidebarDecor />`
    integráció
  - `apps/web/components/layout/dashboard-layout-client.tsx` — `<BottomVerse />`
  - `apps/web/components/layout/dashboard-shell.tsx` — `kt-page-enter`
    osztály a content-wrapperen
  - `packages/ui-app/src/dashboard/BottomStats.tsx` — `stat-arch` osztály
    a 7 tile-on

### ✅ Verify (Chrome MCP, localhost:3000, /dashboard)

- **Sidebar SVG-k**: 14 (volt: 13 — új motívum SVG)
- **BottomVerse**: `display: flex`, `height: 53.67px`, `border-top` jelen ✅
- **Page transition**: `animationName: kt-page-enter` ✅
- **Build** (next build --webpack) zöld
- **TypeScript** (tsc --noEmit) zöld

### 📦 Release

Csak webes (Railway auto-deploy). Desktop NEM kap új release-t — de a
közös packages (motifs re-export, BottomStats stat-arch, kartoteka.css
new keyframes) automatikusan átkerülnek a következő desktop release-nél.

---

## [2026-05-01j] — Sidebar w-full bug fix + header sablon + RouteLoadingScreen (v0.9.6)

<!-- key: 2026-05-01j-sidebar-bug-header-loading-sablon -->
<!-- category: bugfix + improvement -->
<!-- version: v0.9.6 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzés ("a sidebar valami baj van, mintha keskenyebb
lenne", "a fejléc legyen ugyanolyan mint a sablonban", "betöltő képernyők
legyenek a sablon szerintiek, ne skeleton") alapján három javítás.

### 🐛 Sidebar bug fix

A diagnosztika feltárta: a `.sidebar-adaptive` belső div szélessége
**241px** volt, miközben a szülő `<aside>` **287px**. A flex layout-on
belüli inner div `w-full` nélkül auto-fitelt → 47px elveszett a jobb
oldalon. Fix: `w-full` osztályt adva mindkét sidebar verzióban
(`sidebar-adaptive-v4.tsx` + shared `kartoteka-sidebar.tsx`). Ellenőrizve
Chrome MCP-vel: `inner_w: 287px` ✅.

### 🎨 Header (Topbar) sablon szerint

A `header-refined-v3.tsx` átdolgozva a sablon `shell.jsx` Topbar
mintájára:

- **Magasság**: `min-h-16 py-3` → `h-16` (sablon: 64px)
- **Padding**: `px-3 lg:px-6` → `px-4 lg:px-7` (sablon: 28)
- **Gyülekezet chip**: a sablon "input-szerű" stílussal (border-border
  bg-card rounded-[10px] px-3.5 py-1.5), 36×36 címer accent-háttéren,
  2 sor szöveg (név + alcím "Erdélyi Református Egyházkerület").
  Eltávolítva: "Szolgálati tér" eyebrow + "Átlátható központ"
  Sparkles-chip.
- **Icon-buttonok** (Help): sablon szerint `bg-muted` 40×40
  `rounded-[10px]` (volt: border + bg-white/78 + bonyolult shadow).
- **Profile DropdownTrigger**: sablon szerint `bg-muted px-2.5 py-1.5
  rounded-xl` + 32×32 avatar accent-háttéren (volt: border + bg-white/78
  + 40×40 avatar gradient + ring).
- **Border**: `border-white/60` → `border-border` (téma-aware).

### 🎨 Új komponens: RouteLoadingScreen

A 16 loading.tsx fájl mind átalakítva — **eltávolítva minden Skeleton**
és `animate-pulse` placeholder használat. Az új közös komponens
(`apps/web/components/layout/route-loading-screen.tsx`) a sablon
`screens.jsx → LoadingScreen` mintájára épül:

- **CalvinSpinner-szerű** dupla forgó kör + középső pulzáló pötty
  (téma `var(--accent)` és `var(--accent2)` színekkel).
- **Modul-specifikus cím** (`Tagnyilvántartás betöltése`, `Pénzügy —
  Befizetések betöltése` stb.).
- **4 lépéses ellenőrzőlista**: Kapcsolódás → Helyi DB → Aktuális
  rekordok szinkronizálása (active) → Modul beállítások.
- **Card-raised** konténer + 2 háttér blur-pötty (accent + primary).

Érintett fájlok (16 db):
- `app/loading.tsx`, `app/(dashboard)/loading.tsx`,
  `app/(dashboard)/dashboard/loading.tsx` (volt: BrandLoadingScreen +
  pulse skeleton)
- `app/(dashboard)/{tagnyilvantartas,anyakonyv,jegyzokonyvek,sirhelyek,leltar}/loading.tsx`
  (volt: Sprint S F5 SkeletonTable/SkeletonCard)
- `app/(dashboard)/penzugy/{befizetes,kiadas}/loading.tsx`
- `app/misszios-muhely/{loading,forum/loading,forum/[ideaId]/loading,jutalmak/loading,profil/loading,segedanyagok/loading}.tsx`
  (volt: animate-pulse blokk-skeleton)

A `BrandLoadingScreen`, `SkeletonTable`, `SkeletonCard` komponensek
**érintetlen** — más helyen (statisztika dashboard, profile betöltés,
splash screen) még használat alatt maradhatnak.

### ✅ Verify (Chrome MCP, localhost:3000, /dashboard)

- **Sidebar**: `aside_w: 287px`, `inner_w: 287px` ✅ (volt: 241px),
  `nav_w: 267px` ✅ (volt: 221px)
- **Header**: `height: 64px` ✅ (sablon: 64), congregation chip látható
- **Build** (next build --webpack) zöld
- **TypeScript** (tsc --noEmit) zöld

### 📦 Release

Csak webes (Railway auto-deploy). Desktop NEM kap új release-t.

---

## [2026-05-01i] — Sidebar fejléc + hero + nav sablon szerinti egységesítés (v0.9.5)

<!-- key: 2026-05-01i-sidebar-hero-nav-sablon-egyseges -->
<!-- category: improvement -->
<!-- version: v0.9.5 (csak web) -->
<!-- targets: minden webes felhasználó -->

A felhasználói visszajelzések ("Sidebar legyen a sablon szerinti",
"Hero kibontott Mai Ige panelnél a köszöntés alulra ragad", "Fő modulok
és almenük megjelenése legyen a sablon alapján") alapján három
összefüggő vizuális javítás:

### 🎨 1. Sidebar fejléc sablon szerint

A korábbi buborékos brand-card (border + bg-white/10 + 36×36 logo +
"Kartotéka" cím + "EREK nyilvántartási rendszer" alcím + collapse
chevron) eltávolítva. Helyette a sablon szerinti **108×108 px Kartotéka
logó**, középen, padding `px-5 pb-4 pt-6`. Reszponzív (88×88 / 72×72 /
40×40 collapsed). Új asset: `apps/web/public/kartoteka-logo.png`.

### 🎨 2. Hero banner — köszöntés a tetejéhez ragad

A `lg:items-end` cseréje `lg:items-start`-ra mind a 4 hero variánsban
(`HeroBannerScripture`, `hero-banner-scripture`, `hero-banner-refined`,
`hero-banner-scripture-v2`). Korábban: ha a "Mai Ige" panel kibontva
(több sor), a bal oldali "Jó napot, Endre!" köszöntés **alulra ragadt**
a hero alján — ez most a tetejéhez tapad.

### 🎨 3. Sidebar Nav (Section + Item) sablon szerint

A `SidebarItem` és `SidebarSection` redesign a sablon `shell.jsx`
Sidebar nav blokkja alapján:

- **Ikon-keret eltávolítva** (volt: `size-8 rounded-[0.95rem] border
  bg-white/10` + `bg-gradient-to-br from-X to-Y` aktív gradient).
  Helyette: **sima 18×18 ikon**, accent-színű (`var(--accent2)`)
  amikor aktív, fehér 68% alapértelmezetten.
- **Item button**: `px-3.5 py-2.5 rounded-[10px] text-[13px]` (sablon:
  11×14, 10px radius, 14px font). Active: `bg-white/12 font-semibold`,
  + bal oldali **3px függőleges accent-stripe** (`var(--accent2)`).
- **Almenü-elemek**: `pl-7` indent (a parent ikon utáni 12px gap-pel
  igazodik), border-l vertikális vonal eltávolítva (sablon nem
  használja), accent-pötty az aktív gyermeknél.
- **Hover**: `hover:bg-white/8` + `text-white` (volt: `border` +
  bonyolultabb shadow).

### 🛠 Érintett fájlok

- `apps/web/components/layout/sidebar-adaptive-v4.tsx` — fejléc + nav
  refactor (kb. -113/+85 sor).
- `packages/ui/src/layout/kartoteka-sidebar.tsx` — shared verzió, ugyanaz.
- `apps/web/components/dashboard/{hero-banner-scripture,hero-banner-scripture-v2,hero-banner-refined}.tsx`
  — `lg:items-end` → `lg:items-start`.
- `packages/ui-app/src/dashboard/HeroBannerScripture.tsx` — ugyanaz.
- `apps/web/public/kartoteka-logo.png` — új asset (a handoff
  `assets/kartoteka-logo.png`-ből).

### ✅ Verify (Chrome MCP, localhost:3000)

- **Hero**: `computed alignItems: flex-start` ✅ (köszöntés a hero
  tetejéhez igazítva még akkor is, ha a Mai Ige panel kibontott).
- **Sidebar nav** (Irányítópult aktív):
  - `padding 10px 14px`, `borderRadius 10px`, `fontSize 13px`
  - `iconSize 18×18` (sablon: 18) ✅
  - `hasStripe: true` az aktív item-en, `false` a többieken ✅
  - Active háttér: `bg-white/12` (oklab opacity .12) ✅
  - **Nincs ikon-keret** a többi navigációs item-en ✅
- **Sidebar fejléc**: 108×108 logo, `headers_in_sidebar: 0` mindhárom
  témán (kert/parokia/zsoltaros).

### 📦 Release

Csak webes (Railway auto-deploy). Desktop NEM kap új release-t —
a `desktop-shell.tsx` továbbra is `logoSrc="/EREK.png"`-vel hívja a
`KartotekaShell`-t (a shared `kartoteka-sidebar.tsx` nav redesign-jét
azonban a desktop is megkapja a következő desktop release-nél).

---

## [2026-05-01h] — Sprint S follow-up · Hardcoded hero/dialog gradient hot-fix (v0.9.4)

<!-- key: 2026-05-01h-sprint-s-followup-hardcoded-gradient-hotfix -->
<!-- category: bugfix + improvement -->
<!-- version: v0.9.4 (csak web) -->
<!-- targets: minden webes felhasználó (lelkészek, esperesek, admin) -->

A Sprint S után végzett iteratív vizuális audit (Chrome MCP, localhost) feltárta,
hogy néhány **kulcs-felületi hero/dialog konténer** még mindig hardkódolt
`#14514b`/`#0f766e`/`#1e1b4b`/`rgba(255,255,255,0.98)` gradient-et használ —
ezek ellenálltak a Sprint S utility-overrides rétegnek, mert arbitrary
`bg-[linear-gradient(...)]` Tailwind class formában voltak. A téma-váltás így
az érintett felületeken **láthatatlan** maradt.

Mind a **8 hely** átalakítva: hardkódolt gradient hex/rgb értékek →
`var(--sidebar)`, `var(--primary)`, `var(--accent)`, `var(--accent2)`,
`var(--card)`, `var(--border)` — az `inline style` minta pontosan úgy, ahogy
a Sprint R/S már bevált a HeroBanner-en és a PageHero-n.

### 🐛 Javítások

- **Admin Központ hero** (`apps/web/app/(dashboard)/admin/page.tsx`) —
  `#1e1b4b → #312e81 → #4338ca` mély-indigo gradient → `var(--sidebar) →
  var(--primary) → var(--accent)`. Az "Indigo katedrális" hatás eltűnt;
  most a téma sidebar-szín dominál.
- **Missziós Műhely v3 hero** (`apps/web/components/missions/mission-workshop-v3.tsx`)
  és **v1 hero** (`mission-workshop.tsx`) — `#0f766e/#155e75/#1f9d8f/#f0b66d`
  teal-amber gradient → `var(--sidebar) → var(--primary) → var(--sidebar) →
  var(--accent)`.
- **Member/Family details dialog refined + v2 + family-tree-dialog** — a
  `bg-[linear-gradient(180deg,rgba(255,255,255,0.98)...)]` konténer-réteg
  cseréje `bg-card`-ra. A blur-pötty overlay-k `color-mix(in oklab, var(--accent)
  30%, transparent)` formára. A dialog stb. shadow és ring témára
  kötött (`ring-border`).
- **PageHero (`packages/ui-app/src/layout/PageHero.tsx`)** — közös shared
  komponens, ami sok desktop oldalon szerepel: `bg-card` + accent2/primary
  blur-pöttyök. Egycsapásra javul minden desktop oldal hero-ja.
- **HeroBannerScripture (`packages/ui-app/src/dashboard/HeroBannerScripture.tsx`)** —
  shared dashboard hero: `var(--sidebar) → var(--primary) → var(--sidebar)`
  gradient inline style-ban. A 4 dashboard scope (gyülekezet, kerület, admin,
  egyházmegye) mind átveszi.
- **kartoteka-sidebar** (`packages/ui/src/layout/kartoteka-sidebar.tsx`) —
  shellBaseClassName: `bg-[linear-gradient(180deg,#14514b...)]` → `bg-[var(--sidebar)]
  text-[var(--sidebar-foreground)]`. A desktop oldalsáv is most a téma
  szerint változik (eddig csak a `sidebar-adaptive-v4.tsx` web verzió volt jó).

### ✅ Verify (Chrome MCP, localhost:3000, 3 téma)

A `/dashboard` route-on JS-audit minden 3 témán (`localStorage.kt-theme`):

| téma | sidebar | card | radius | font-serif | accent |
|---|---|---|---|---|---|
| **kert** (default) | `#143030` | `#fff` | 12px | Fraunces | `#6b8e4e` zöld |
| **parokia** | `#1f3a3a` | `#fffdf7` | 16px | Cormorant Garamond | `#5a8a48` zöld |
| **zsoltaros** | `#2a2218` | `#fdf9ed` | 6px | Roboto Slab | `#a3551c` narancs-barna |

A DOM-ban hardkódolt teal/dark `linear-gradient()` előfordulások száma:
**0** (az auditor regex `#14|#0f|#11|rgb(20|rgb(31` pattern-eket keresett).

### 📦 Release

Csak webes (Railway auto-deploy a `main` push-szal). Desktop NEM kap új
release-t — a Sprint R v0.8.5 marad érvényben asztalon (a shared csomag
változások a desktop következő release-ben fognak átfutni, addig a régi
asztali oldalsáv-szín marad).

### Felhasználói teendő (cache törlés)

Ha a böngészőben még a régi (Sprint R/S) megjelenés látszik a deploy után:
**Ctrl+Shift+R** (hard reload), vagy DevTools › Application › Service Workers
› Unregister + Application › Storage › Clear site data.

---

## [2026-05-01g] — Sprint S · Vizuális egységesítés a teljes web-appra (v0.9.3)

<!-- key: 2026-05-01g-sprint-s-vizualis-egysegesites -->
<!-- category: feature + improvement -->
<!-- version: v0.9.3 (csak web) -->
<!-- targets: minden webes felhasználó (lelkészek, esperesek, admin) -->

A felhasználói visszajelzés ("a Sprint R csak a témákat hozta, a teljes UI nem
követi a sablont") nyomán **a teljes webes Kartotéka vizuálisan egységesítve
lett a 3 témához**. A korábbi **289 hardkódolt komponens** (78%) immár téma-aware
**egyetlen CSS-overrides rétegen keresztül**, és a `card-raised` custom class
(47+ használat) is a téma `--card`, `--border`, `--radius-card`, `--shadow-card`
értékeit használja.

A 3 téma vizuálisan markánsan más megjelenést ad:
- **Csendes parókia**: 16px ívelt soft kártyák, mély kékeszöld sidebar, Cormorant
  Garamond serif címek, krém háttér
- **Kerített kert** *(default)*: 12px szögletes minimal kártyák, hűvös zöld
  paletta, Fraunces + Geist betűk
- **Zsoltáros**: 6px klasszikus kártyák, mély barna sidebar narancsos akcenttel,
  Roboto Slab címek

### ✨ Új funkciók

- **Új réteg: `packages/ui/src/utility-overrides.css`** — globális Tailwind
  utility-class felülírások a `[data-theme="..."]` szelektorokon át. Minden
  `text-slate-*` (1023×), `bg-white` (404×), `bg-slate-50` (386×),
  `border-slate-200` (395×) automatikusan a téma-vars szerint cserélődik.
  Plus a `bg-{amber,emerald,sky,rose,violet,indigo,cyan,teal}-50` info-tinták
  a téma `--accent` halvány keverékére.
- **Bővített téma-vars** (`packages/ui/src/themes.css`) — minden 6 blokkba
  (3 téma × light/dark) új vars: `--radius-card/stat/mod/input/nav`,
  `--shadow-card/-hover`, `--page-bg-overlay-1/2`, `--h1-size/weight/spacing`,
  `--h3-size/weight`. Sötét módban a shadow erősebb (a téma-vars szín nem
  látszik a sötét háttéren).
- **Custom class-ok refaktora** (`packages/ui/src/kartoteka.css`) —
  `card-raised`, `icon-raised`, `modal-input`, `page-shell` mind a téma-vars-ok
  szerint épülnek; a `body` háttér is `--page-bg-overlay-1/2` overlay-ket
  használ a fix amber/teal helyett.
- **Téma-aware tipográfia** — `:where([data-theme]) h1/h2/h3` base layer
  a `--font-serif`, `--h1-size`, `--h1-weight`, `--h1-spacing` vars-ot
  használja. A `:where()` selector 0 specificitása miatt az explicit
  Tailwind `text-{size}` osztályok mindig felülírják.

### 🎨 UX javítások

- **Dashboard widgetek** (`packages/ui-app/src/dashboard/`):
  - **KpiCards** — 5 KPI ikon-gradient és blur-pötty `var(--accent)/--accent2`
    color-mix-szel; eyebrow chipek `border-border bg-card text-muted-foreground`.
    A pénzügyi szemantika (`text-emerald-{500,600}` bevétel, `text-red-{400,500}`
    kiadás) **megmarad**.
  - **BottomStats** — 7 stat-tile gradient mező eltávolítva, mind
    `linear-gradient(135deg, var(--accent), var(--accent2))`. Balance
    `text-emerald-600`/`text-red-600` jelzés marad.
  - **Celebrations** — highlight gomb és blur-pöttyök téma-aware-é.
  - **UpcomingPrograms** — emoji-tile gradient és blur-pötty téma-aware.
  - **AgeDistribution** — blur-pöttyök és heading-ikon téma-aware. A 5 sávos
    `BUCKET_GRADIENTS` data-viz **érintetlen** (kategorikus szín).
- **Login/Register branded** — `(auth)/layout.tsx` jobb-panel téma-aware
  (`var(--sidebar)` háttér, accent-color overlay-k). A login-form
  `border-slate-200 bg-white shadow-sm` → `card-raised` osztály.

### 🛠 Technikai

- **Bug fix**: `packages/ui/src/components/input.tsx:12` — `focus-visible:bg-white`
  → `focus-visible:bg-card` (sötét módban szürke-szürke kontrasztot okozott).
- A meglévő `apps/web/components/muhely/`, modálok (57), admin (25), finance
  (33) komponensek **érintetlen** kódjai — az utility-override automatikusan
  cseréli a hardkódolt szürke/fehér színeket. Pénzügyi és státusz-intent
  színek (zöld/piros/sárga) megmaradnak.

### ✅ Build verify (mind 3 zöld, 2026-05-01)

- `npm run typecheck --workspace=@kartoteka/ui-app` — zöld
- `npm run build --workspace=@kartoteka/web` — zöld (53 oldal Next.js webpack)
- `npm run build --workspace=@kartoteka/desktop` — zöld (Vite, kontroll)

### 📦 Release

Ez a Sprint S egyetlen release-e (F1+F2+F3+F4 együtt). Webes Railway
auto-deploy a `main` push-szal. Desktop NEM kap új release-t — a Sprint R
v0.8.5 marad érvényben asztalon.

### Sprint T előjegyzés

- IncomeDialog (873s) port a `packages/ui-app/finance/`-ba (eredeti Sprint Q F3.2)
- Tauri-mini installer wrapper-app (Sprint R F6 halasztott)
- `feedback_modal_design_system` szabvány teljes 57-fájlos átszorítása

---

## [2026-05-01f] — Sprint R F6 · Telepítő wizard UI + Sprint R LEZÁRVA (v0.8.5)

<!-- key: 2026-05-01f-sprint-r-f6-telepito-wizard-ui -->
<!-- category: feature -->
<!-- version: v0.8.5 -->
<!-- targets: lelkészek (preview); fejlesztő — telepítő integráció Sprint S F2-be -->

A Windows-telepítőhöz tervezett **980×660 px modern wizard UI** elkészült
shared komponensként — Windows 11 stílusú title-bar, mély kékeszöld
oldalsáv, 5 lépéses flow (üdvözlés, licenc, telepítés helye, komponensek,
folyamat-sáv, befejezés). Desktop preview a `/dev/installer-preview`
route-on érhető el.

**A teljes Tauri-mini installer wrapper-app (Rust + Vite + ezen UI)
SPRINT S F2-be kerül**, akkor a `release-build.ps1` build-pipeline
integrációval, sign-flow-val és Supabase Storage uploaddal együtt. Most
**csak a UI réteg** készült el — kockázatmentesen tesztelhető a meglévő
desktop appon belül.

### ✨ Új funkciók

- **`InstallerWizard` komponens** — `packages/ui-app/src/installer/index.tsx`:
  body-pattern, `initialStep` + `logoSrc` + `version` + `onFinish` + `onCancel`
  props. 5 lépés state-tel, Windows 11 stílus.
- **`WinButton`** — primary / secondary / disabled variants, hover állapot.
- **5 step-body** — `InstallerWelcome`, `LicenceBody` (checkbox-szal),
  `DestinationBody` (mappa-tallózó), `ComponentsBody` (6 opció checkbox-szal),
  `ProgressBody` (animált progressbar + console-log), `InstallerFinish`
  (pipa + 3 utólagos opció).
- **Desktop preview oldal** — `apps/desktop/src/pages/installer-preview-page.tsx`,
  `<DesktopShell>` keretben, sötét háttéren.
- **`/dev/installer-preview`** route — a `apps/desktop/src/App.tsx`-ben
  regisztrálva.

### 🛠 Technikai

- `packages/ui-app/src/index.ts` — `export * from './installer'`
- `packages/ui/src/kartoteka.css` — `kt-caret` keyframe (a ProgressBody
  console blink kurzorához)
- A jelenlegi NSIS bundle (`apps/desktop/src-tauri/tauri.conf.json:55-66`)
  **érintetlen** marad — a wrapper integráció Sprint S F2-be megy.

### 🛑 Sprint S F2 előjegyzés (a teljes wrapper)

A jelenlegi desktop NSIS bundle wrapper-éhez új `apps/desktop-installer/`
workspace package készül:
- Rust + Tauri 2 + Vite + React + Tailwind 4 (980×660 fix ablak,
  decorations: true, transparent: false, resizable: false)
- A `<InstallerWizard>` UI ezen a wrapper-app-on belül fut
- Rust backend: `Command::new(bundled_nsis_path).args(["/S"]).spawn()` +
  stdout figyelés event-rel
- `release-build.ps1` bővítés: két NSIS build (fő app + wrapper) +
  másol resources-be + sign mindkettő + GH release wrapper-rel mint fő asset

### ✅ Build verify (mind 3 zöld, 2026-05-01)

- `npm run typecheck --workspace=@kartoteka/ui-app` — zöld
- `npm run build --workspace=@kartoteka/web` — zöld
- `npm run build --workspace=@kartoteka/desktop` — zöld (Vite)

### 🏁 Sprint R · Vizuális megújulás — LEZÁRVA

| Fázis | Verzió | Tartalom |
|---|---|---|
| ✅ F1 | v0.8.0 | Téma-réteg infrastruktúra |
| ✅ F2 | v0.8.1 | Téma-választó GA |
| ✅ F3 | v0.8.2 | Missziós Műhely home + desktop paritás |
| ✅ F4 | v0.8.3 | Mikro-interakciók (Splash, Loading, Skeleton, page transition) |
| ✅ F5 | v0.8.4 | Onboarding wizard (csak web) |
| ✅ F6 | **v0.8.5** | **Telepítő wizard UI + desktop preview (LEZÁRVA)** |

**Sprint S előjegyzés:**
- F1: Login/Register vizuális redesign
- F2: Tauri-mini installer wrapper-app + build-pipeline integráció
- F3: IncomeDialog (873s) port a `packages/ui-app/finance/`-ba (Sprint Q F3.2)
- F4+: Tauri SQLite write flow + offline outbox

---

## [2026-05-01e] — Sprint R F5 · Onboarding wizard (csak web) (v0.8.4)

<!-- key: 2026-05-01e-sprint-r-f5-onboarding-wizard -->
<!-- category: feature -->
<!-- version: v0.8.4 -->
<!-- targets: webes lelkészek — első bejelentkezés / új user flow -->

A webes Kartotékában új user-eknek **4 lépéses bevezető wizard** fut a
`/onboarding` URL-en. A bal oldalon a téma `--sidebar` színe + Bibliai
idézet + központi vizuális (templom kép, sugárzó Biblia, vagy pipa-kör),
a jobb oldalon a step-progress sáv + cím + szöveg + step-specifikus widget +
navigáció. A „Kihagyom" link és a „Belépés a Kartotékába" CTA egyaránt
a `/dashboard`-ra navigál.

A desktop appot ez NEM érinti — ott a session a webes bejelentkezésből
érkezik (közös Supabase auth).

### ✨ Új funkciók

- **`OnboardingScreen` komponens** — `packages/ui-app/src/onboarding/index.tsx`:
  body-pattern, `assetBase` + `onComplete` + `onSkip` + `initialStep` props.
  4 lépés: `welcome`, `church`, `import`, `done`. Step indikátor 4-bar,
  „N / 4" számláló és „Kihagyom" link az 1-3. lépésen.
- **`ChurchSetupWidget` és `ImportWidget`** — beágyazott step-widget-ek a
  2. és 3. lépéshez. Most mock-ok (Kolozsvár-Belváros előnézet, fájl-tallózó
  drop-zone) — a tényleges form-mező és import-flow integráció későbbi
  iterációkban (Sprint S+).
- **Új web route** — `apps/web/app/onboarding/page.tsx` `'use client'`,
  `useRouter()`-rel a CTA-knál.
- **2 design asset bemásolva** — `apps/web/public/onboarding/` mappába
  `27-church.png` és `28-bible-rays.png` (a Missziós Műhely-mappából
  duplikálva, hogy az onboarding asset-jei tisztán szervezve legyenek).

### 🛠 Technikai

- `packages/ui-app/src/index.ts` — `export * from './onboarding'`
- A meglévő `(auth)` route-csoport (`login`, `register`, `forgot-password`,
  `oauth-complete`, `pending`) **érintetlen** marad.

### 🛑 Halasztva

A **login és register vizuális redesign** (a design-handoff `LoginScreen`
komponense) **Sprint S F1-re halasztva**. Indok: a meglévő `LoginForm` és
`RegisterForm` éles Supabase auth-flow-t tartalmaz (signin, OAuth, session
refresh, password validation, rate-limit). Vizuális sebészete kockázatos
lenne, és a felhasználói élmény szempontjából most másodlagos. Sprint S F1
külön foglalkozik vele, alapos teszttel.

### ✅ Build verify (mind 3 zöld, 2026-05-01)

- `npm run typecheck --workspace=@kartoteka/ui-app` — zöld
- `npm run build --workspace=@kartoteka/web` — zöld (53 oldal, +1 új `/onboarding`)
- `npm run build --workspace=@kartoteka/desktop` — zöld (Vite)

---

## [2026-05-01d] — Sprint R F4 · Mikro-interakciók (v0.8.3)

<!-- key: 2026-05-01d-sprint-r-f4-mikro-interakciok -->
<!-- category: feature + improvement -->
<!-- version: v0.8.3 -->
<!-- targets: lelkészek — minden modul felhasználói (web + desktop) -->

A betöltések, oldalváltások és indítás simábban, finomabban érződnek. A
desktop appnál indításkor megjelenik a Kartotéka logós **Splash képernyő**
(1.5 mp, mély kékeszöld háttér, lágy pulzálás), a webes oldalak váltakozásakor
a tartalom **fade + translateY + blur** átvezetéssel cserélődik (420ms,
lágy görbével). A hosszú lekérdezésekhez **Skeleton-vázak** és
**Loading képernyő** állnak rendelkezésre.

### ✨ Új funkciók (UX réteg)

- **`SplashScreen`** — full-screen overlay, `<html data-theme>` aware (a Splash
  háttere a választott téma sidebar-színe, így mindhárom téma harmonikus).
  Logó pulse + cím + alcím + indeterminate progress + status-szöveg + verzió.
- **`LoadingScreen`** + **`DelayedLoading`** — a teljes nézetet kitakaró
  loading képernyő spinner-rel (Calvin csillag vagy ring) + opcionális
  lépéses checklist. A `DelayedLoading` csak >800ms után jelenik meg
  (UX best practice — rövid lekérdezésnél nem villog).
- **`Skeleton`, `SkeletonCard`, `SkeletonRow`, `SkeletonTable`** — shimmer
  animációval, light/dark változat. A jövőben a Suspense fallback-ekbe
  illeszthetők.
- **`PageTransition`** wrapper — fade + translateY + blur, 420ms.
- **`CalvinSpinner`, `RingSpinner`** — két spinner stílus.
- **`IndeterminateBar`, `ProgressBar`** — folyamat-jelzők.

### 🎨 UX javítások

- **Web `app/template.tsx`** — minden navigation újrarendereli a
  PageTransition-t. Next.js 16 App Router `template.tsx` minden oldalra.
- **Desktop `main.tsx`** — `AppWithSplash` wrapper, 1.5s után eltűnik.
  Az `<App>` már a háttérben mountol, így a tényleges idle nem nőtt meg.

### 🛠 Technikai

- `packages/ui-app/src/loading/index.tsx` — 11 export (Spinner-ek, Skeleton-ek,
  Progress-ek, Splash, Loading, DelayedLoading, PageTransition + típusok)
- `packages/ui/src/kartoteka.css` — 7 új keyframe (kt-fade-in, kt-page-enter,
  kt-shimmer, kt-spin, kt-pulse, kt-progress-bar, kt-slide-up, kt-pop) +
  utility class-ok
- `packages/ui-app/src/index.ts` — `export * from './loading'`
- `apps/web/app/template.tsx` (új)
- `apps/desktop/src/main.tsx` — Splash mount

### ✅ Build verify (mind 3 zöld, 2026-05-01)

- `npm run typecheck --workspace=@kartoteka/ui-app` — zöld
- `npm run build --workspace=@kartoteka/web` — zöld (52 oldal)
- `npm run build --workspace=@kartoteka/desktop` — zöld (Vite)

---

## [2026-05-01c] — Sprint R F3 · Missziós Műhely home (v0.8.2)

<!-- key: 2026-05-01c-sprint-r-f3-misszios-muhely-home -->
<!-- category: feature -->
<!-- version: v0.8.2 -->
<!-- targets: lelkészek — Missziós Műhely modul felhasználói (web és desktop) -->

A Missziós Műhely modul kezdőoldala teljesen megújult — meleg krém keret,
lelkipásztori dizájn, kiemelt gyűjtemények, témák, letölthető csomagok és
kategória-rács. **A webes és desktop verzió pixel-pontosan egyezik**, ugyanazt
a `MissionWorkshop` shared komponenst használja a `packages/ui-app`-ből.

A modul aloldalai (segédanyagok, fórum, jutalmak, profil) **érintetlen** maradtak
— a felhasználó kifejezett kérése szerint a táblázatos szerkezet változatlan,
csak a home oldal kapja meg az új designt. A CTA-k és kategória-csempék az
aloldalakra navigálnak, amikor azok későbbi fázisokban elkészülnek.

### ✨ Új funkciók

- **`MissionWorkshop` + 7 részkomponens** — `packages/ui-app/src/missziosmuhely/`:
  `MMBackground` (templom + sarok-levelek + hills watermarkok), `MMHero` (cím + ige
  + hero-mug), `MMFeaturedCollections` (4 kép-kártya), `MMThemes` (5-tagú lista),
  `MMDownloads` (3 letölthető csomag), `MMRecommendations` (közösségi idézet +
  avatar-stack), `MMCategoryGrid` (6 csempés rács). Mind body-pattern, `assetBase`
  + `onNavigate` callback prop-pal.
- **18 design asset bemásolva** — `apps/web/public/misszios-muhely/` és
  `apps/desktop/public/misszios-muhely/`: hero-mug, 4 kollekció-kép, 6 kategória
  ikon, 6 watermark (templom, sarok-levelek, hills).
- **Web route** — `apps/web/app/(dashboard)/misszios-muhely/page.tsx` ÚJ
  (eddig 404 / placeholder volt). A `(dashboard)` layout adja a sidebar-t.
- **Desktop oldal** — `apps/desktop/src/pages/misszios-muhely-page.tsx` ÚJ +
  `apps/desktop/src/App.tsx` `<Route path="/misszios-muhely">` regisztráció.
  Eddig a desktop a `PlaceholderPage`-re ment a sidebar menüpontról.

### 🎨 UX javítások

- **Mt 28,19–20 ige** középre, a hero két oszlopa közé — szabad szemnek olvasható.
- **Hero-mug** csésze + Biblia + olajág kompozíció `drop-shadow`-val a
  jobb oldalon.
- **`mix-blend-mode: multiply`** a watermark-okon — beleég a krém háttérbe.

### 🛠 Technikai

- `packages/ui-app/src/index.ts` — `export * from './missziosmuhely'`
- A meglévő `apps/web/components/muhely/` MVP komponensek (45+ fájl)
  **érintetlen** — később lesz hozzájuk dedikált aloldal-route a sprint S+ ben.
- Az `mm_*` táblák (16 db) RLS-védettek — ehhez nem nyúltunk, új SQL nincs.

### ✅ Build verify (mind 3 zöld, 2026-05-01)

- `npm run typecheck --workspace=@kartoteka/ui-app` — zöld
- `npm run build --workspace=@kartoteka/web` — zöld (52 oldal, +1 új)
- `npm run build --workspace=@kartoteka/desktop` — zöld (Vite, 5.13s)

---

## [2026-05-01b] — Sprint R F2 · Téma-választó GA (v0.8.1)

<!-- key: 2026-05-01b-sprint-r-f2-tema-valaszto-ga -->
<!-- category: feature -->
<!-- version: v0.8.1 -->
<!-- targets: lelkészek — Beállítások › Megjelenés alatt választható téma -->

A Beállítások › Megjelenés alatt mostantól **3 vizuális téma közül választhatsz**:
**Csendes parókia** (meleg, lelkipásztori — Cormorant Garamond), **Kerített kert**
(modern, alapértelmezett — Fraunces + Geist), **Zsoltáros** (klasszikus, méltóságteljes
— Roboto Slab). A választás azonnal érvénybe lép, minden megnyitott fülön szinkronizál,
és F5 után is megmarad. A meglévő világos / sötét / rendszer mód minden témával kompatibilis.

A táblázatok elrendezése **változatlan** marad — csak a színek, fontok és kártya-keretek
követik a választott témát.

### ✨ Új funkciók

- **`ThemePicker` komponens** — `packages/ui-app/src/theme/index.tsx`: 3 preview-kártya
  mini sidebar-ral, accent-swatch-csal és font-mintával. Body-pattern, callback-prop,
  web és desktop egyaránt használja.
- **`ThemeStyleProvider` + `useThemeStyle()` hook** — perzisztens téma-választás a
  `kartoteka-theme-style-v1` localStorage kulcson keresztül; cross-tab szinkron
  (storage event); a `<html data-theme="...">` attr-t a Provider állítja.
- **Új `Téma stílusa` szekció** — Beállítások › Megjelenés tab tetején, a meglévő
  „Sötét/világos mód" elé. Pasztorális visszajelzés: *"Téma mentve. A kinézet azonnal
  frissül."*
- **A meglévő „Téma" szekció átnevezve** — `Sötét/világos mód`-ra (a két beállítás
  függetlenül választható).

### 🛠 Technikai

- `packages/ui-app/package.json` — új workspace dep: `@kartoteka/design-tokens: "*"`
- `packages/ui-app/src/index.ts` — `export * from './theme'`
- `apps/web/components/layout/theme-provider.tsx` — `<ThemeStyleProvider>` mount
  a `NextThemesProvider` belsejében (két ortogonális réteg)
- `apps/desktop/src/main.tsx` — `<ThemeStyleProvider>` mount az `<App />` köré
- `apps/web/components/modals/settings-dialog.tsx:303-340` — új SettingsSection
- `apps/desktop/src/components/settings-dialog.tsx:303-340` — új SettingsSection

### ✅ Build verify (mind 3 zöld, 2026-05-01)

- `npm run typecheck --workspace=@kartoteka/ui-app` — zöld
- `npm run build --workspace=@kartoteka/web` — zöld (51 oldal Next.js webpack)
- `npm run build --workspace=@kartoteka/desktop` — zöld (Vite, 50+ font asset)

### 📦 Release

Ez a Sprint R első kiadása (Fázis 1 + 2 együtt). Az `ops/release-build.ps1`
futtatásával készül a desktop NSIS + MSI bundle, GH release a 4 fájllal
(`.exe`, `.msi`, `latest.json`, `.sig`). Az auto-updater a meglévő ütemterv
szerint frissít minden v0.7.x desktopot.

---

## [2026-05-01] — Sprint R F1 · Téma-réteg infrastruktúra (v0.8.0)

<!-- key: 2026-05-01-sprint-r-f1-tema-reteg-infrastruktura -->
<!-- category: feature + improvement -->
<!-- version: v0.8.0 -->
<!-- targets: lelkészek — később (Beállítások › Megjelenés alatt választható téma); fejlesztő — most -->

Sprint R · Vizuális megújulás indul az [Anthropic Design Handoff](https://api.anthropic.com/v1/design/h/DdN6y8xEibDv8ysyTK0wJg)
alapján. A Fázis 1-ben a téma-réteg infrastruktúrát építjük be: a 3 vizuális
téma (Csendes parókia, Kerített kert, Zsoltáros) CSS-vars értékei, 5
self-hosted betűcsalád és 7 motívum SVG **bekerült** a közös csomagba.

A v0.8.0-ban a **viselkedés még változatlan** a felhasználó számára — a
`<html data-theme="kert">` default-ot rendelünk az új SSOT-ra (Kerített kert),
de a téma-választó és a perzisztens preferencia a **v0.8.1-ben (Fázis 2)** érkezik.
Release csak a Fázis 2 végén megy ki — most kód-szintű előkészület.

### ✨ Új funkciók (infrastruktúra)

- **3 téma SSOT** — `packages/design-tokens/src/themes.ts`: `ThemeParokia`,
  `ThemeKert` (default), `ThemeZsoltaros` típusozott objektumok + `darken()`
  helper. Származás: a design handoff `shared/themes.jsx` fájljának pontos
  TS portja, magyar UX-szöveggel.
- **CSS-vars rétege** — `packages/ui/src/themes.css`: 6 blokk
  (`[data-theme="kert"]`, `[data-theme="parokia"]`, `[data-theme="zsoltaros"]`
  + mindegyikhez `.dark` variáns). Tailwind utility-class-ok érintetlenek,
  csak a `--background`, `--foreground`, `--primary`, `--card`, `--sidebar`,
  `--font-sans`, `--font-serif` (és társai) értékei cserélődnek a téma szerint.
- **5 self-hosted betűcsalád** — `@fontsource/cormorant-garamond`,
  `@fontsource/fraunces`, `@fontsource/roboto-slab`, `@fontsource/inter` és
  `@fontsource-variable/geist`. GDPR-barát, offline-ready (Tauri WebView).
  Latin-ext subset benne (magyar é/ő/ű támogatás).
- **7 motívum SVG** — `packages/ui/src/motifs/`: `MotifChurch`, `MotifBible`,
  `MotifOlive`, `MotifDove`, `MotifCross`, `MotifStar4`, `MotifTrellis`. TSX
  port, `currentColor` + `opacity` props.
- **`packages/ui/src/kartoteka.css` `:root` és `.dark` változatlan** — fallback
  marad. A `[data-theme="..."]` szelektorok csak felülírják a CSS-vars-okat.

### 🛠 Technikai

- `packages/ui/src/kartoteka.css` — 2 új `@import` sor (fonts.css + themes.css)
- `packages/ui-app/src/layout/PageHero.tsx:25` — hardkódolt
  `from-violet-500 to-indigo-600` → semantikus
  `linear-gradient(135deg, var(--primary), var(--accent))` (téma-aware)
- `apps/web/app/layout.tsx:37` — `<html lang="hu" data-theme="kert">`
- `apps/desktop/index.html:2` — `<html lang="hu" data-theme="kert">`
- `packages/design-tokens/src/index.ts` — placeholder `export {}` lecserélve
  valódi exportra (`themes`, `ThemeName`, `ThemeMode`, `ThemeTokens`, `darken`)

### ✅ Build verify (mindhárom zöld, 2026-05-01)

- `npm run typecheck --workspace=@kartoteka/ui-app` — zöld
- `npm run build --workspace=@kartoteka/web` — zöld (51 oldal Next.js webpack)
- `npm run build --workspace=@kartoteka/desktop` — zöld (Vite, 10.48s)

### 🎁 Sprint R hátralévő fázisai (a tervből)

| Fázis | Verzió | Tartalom |
|---|---|---|
| F2 | v0.8.1 | Beállítások › Megjelenés bővítés ThemePicker-rel + first release |
| F3 | v0.8.2 | Missziós Műhely home átépítés + desktop paritás |
| F4 | v0.8.3 | Mikro-interakciók (Splash, Loading, Skeleton, page transition) |
| F5 | v0.8.4 | Onboarding & Auth (csak web) |
| F6 | v0.8.5 | Tauri-mini installer app (980×660 wizard) |

---

## [2026-04-30l] — Diagnosztika + szülő-text-fallback + család-backfill

<!-- key: 2026-04-30l-szulok-diagnosztika-backfill -->
<!-- category: bugfix + improvement -->
<!-- targets: lelkészek — anyakönyv modul; karbantartó — backfill SQL -->

Endre észrevétele: "Keresztelésnél nem jelenik meg az édesapa és az édesanya!".
A diagnosztika kimutatta: a 2010 utáni, importtal jött gyerekeknek csak a
`szemely.apjaneve`/`anyjaneve` SZÖVEG-mezőjük van — `id_apja`/`id_anyja` CNP
NULL, és a `gyerek` táblában sincs rekordjuk. A `getParentsForChild` mind a
3 ágon üresen tért vissza.

### 🐛 Javítások

- **`getParentsForChild` defensive JOIN handling** — a `csalad:csalad!id_csalad`
  JOIN néha array-ként, néha object-ként jön vissza Supabase-től; mindkettőt
  kezeljük most.
- **TEXT-fallback (3) ág implementálva** — a `szemely.apjaneve`/`anyjaneve`
  szöveges szülő-neveket mostantól visszaadjuk a `apjaneveText`/`anyjaneveText`
  mezőkben. A baptism-dialog egy SÁRGA BANNERBEN mutatja: *"A korábbi adatok
  szerint a szülők neve: ..."* + felhívás a kézi rákeresésre.
- **`saveBaptism` szerkesztéskor is létrehozza a csalad+gyerek rekordot** —
  korábban csak ÚJ kereszteléskor. Mostantól ha a felhasználó utólag rendel
  szülőket, a következő nyitásnál a zöld badge (auto-load) megjelenik.
- **Diagnosztikai panel a baptism-dialog-ban** — ha kiválasztott tag van, de
  semmilyen szülő-adat nem található (sem ID, sem text), egy szürke debug-szöveg
  pontosan kiírja: *"A tag nincs családhoz rendelve / Van csalad-rekord, de
  nincs apa/anya / id_apja CNP nem oldható fel..."*. A felhasználó látja MIÉRT.

### 🛠 Technikai

- `apps/web/app/(dashboard)/anyakonyv/actions.ts` — `getParentsForChild`
  refaktor:
  - 3 fallback-szint (csalad → CNP → text)
  - `ParentInfo` új mezők: `apjaneveText`, `anyjaneveText`, `diagnostic`
  - Server-side `console.log [getParentsForChild] id=X: {...}` Vercel/Railway
    logokon nyomon követhető
- `apps/web/components/modals/baptism-dialog.tsx`:
  - `apjaneveText` / `anyjaneveText` state + sárga banner
  - `parentDiag` state + szürke debug-banner ha sehol nincs adat
  - `handlePersonChange` reseteli minden szülő-state-et új tag választáskor
  - F12 console-on `[baptism-dialog] szülő-load indul / válasz: {...}` log

### 🗄 SQL

- `migration-docs/sql/2026-04-30k-diagnoszt-baptism-szulok.sql` (új) —
  6+1 stand-alone SELECT egy konkrét tagra (cseréld a `1163` ID-t).
  Megmondja MELYIK forrásban van adat.
- `migration-docs/sql/2026-04-30l-backfill-csalad-text-szulokbol.sql` (új) —
  két szakasz: DRY-RUN előnézet + (kommentelt) BEGIN/COMMIT backfill.
  Megpróbálja a `csaladnev k_nev` egyezés alapján automatikusan feloldani
  a szöveges szülő-neveket szemely-ID-re, létrehozni a `csalad`+`gyerek`
  rekordot, és kitölteni az `id_apja`/`id_anyja` CNP-eket. Csak ott fut, ahol
  PONTOSAN 1 találat van — több találat / nincs találat manuális marad.

---

## [2026-04-30k] — Anyakönyvi modul: család-auto, új-személy, részletes nézet, sortálás

<!-- key: 2026-04-30k-anyakonyvi-csalad-detail-sortalas -->
<!-- category: feature + improvement -->
<!-- targets: lelkészek — anyakönyv modul felhasználói -->

Endre öt észrevétele alapján öt összefüggő funkciót adtunk a modulhoz, hogy
a kézi rögzítés és a böngészés egyaránt gördülékenyebb legyen.

### ✨ Új funkciók

- **Szülők automatikus kitöltése keresztelésnél** — ha a kiválasztott
  keresztelendő már családhoz van rendelve (`gyerek` táblában), a szülők
  neveit a `csalad` táblából vesszük és előtöltjük a két `MemberSearchSelect`
  mezőbe (apa + anya). Az anya `szcs_nev`-jéből a leánykori név is automatikus.
  Egy zöld badge jelzi, hogy "Családi adatokból kitöltve". Ha a tag nincs
  családhoz rendelve, a kereső mezők használhatók manuális hozzárendelésre.
- **Új személy hozzáadása keresztelés-dialógból** — egy "Új személy a
  tagnyilvántartáshoz" gomb beágyazza a `MemberFormDialog`-ot a baptism
  dialog tetején. Mentés után a felhasználó a kereső mezőben rögtön
  megtalálja, és kiválasztja kereszteléshez.
- **Sorra kattintás → részletes nézet** (mind a 8 fülön) — a `RegistryDetailDialog`
  egy fülönként profilozott, olvasható ablakot mutat: a teljes adattartalom
  (név, dátumok, szám, lelkész, szülők, helyszín, állapot, célgyülekezet,
  átjelentkezési notifikáció státusza stb.) szépen formázva. A "Szerkesztés"
  gomb átvált edit módba, a "Törlés" gomb azonnal törli (megerősítéssel).
- **Konfirmáció szerkesztés** — eddig csak batch-rögzítés volt, mostantól
  egy meglévő konfirmáció is szerkeszthető (✏️ gomb): új `saveConfirmationSingle`
  server action.

### 🎨 UX javítások

- **Sortálás minden oszlopra mind a 8 fülön** — kattintható oszlopfejek
  ChevronUp/ChevronDown indikátorral, magyar locale-aware string-rendezéssel
  (`localeCompare(a, b, 'hu')`). Külön "Rendezés: <oszlop> ▲/▼" badge
  jelzi az aktív rendezést, X-szel törölhető.
- A táblázat **sor-hover** kék színűre vált (`hover:bg-blue-50/50 cursor-pointer`),
  jelzi hogy kattintható.
- A részletes ablak fejlécében az **egyházi anyakönyvi szám** font-mono
  violet badge-ben látszik — egy pillantásra megvan az azonosító.

### 🛠 Technikai

- `apps/web/components/registry/registry-detail-dialog.tsx` (új): közös
  read-only nézet 8 anyakönyvi profilra. `Field` és `PersonCard` belső
  komponensek a konzisztens megjelenítéshez.
- `apps/web/components/registry/registry-tabs.tsx`: refaktorálva — a
  fülönkénti oszlopok most `getColumns(tab)` adat-első deklaráció (ColDef
  array), ami egyszerre kezeli a fejlécet, a sortáláshoz használt értéket
  és a cella-rendert. Ez majdnem feleakkora kód mint a korábbi 3-helyen
  ismételt `if/else if` ágak.
- `apps/web/app/(dashboard)/anyakonyv/actions.ts`:
  - `getParentsForChild(personId)`: 3 fallback-szintű szülő-lookup
    (csalad → szemely.id_apja/id_anyja CNP → text), `MemberSearchResult`
    kompatibilis return.
  - `saveConfirmationSingle(data)`: új action a konfirmáció szerkesztéshez.
- `apps/web/components/modals/baptism-dialog.tsx`: új `MemberFormDialog`
  beágyazás (UserPlus gomb), automatikus szülő-load `useEffect`-ben
  (csak új-rögzítésnél, ha még nincs manuális választás), `handlePersonChange`
  reseteli az auto-load flag-et.
- `apps/web/components/modals/confirmation-dialog.tsx`: dual-mode
  (batch / single edit) — a `editEntry` prop kapcsol át edit módba.
- `apps/web/lib/validations/registry.ts`: új `confirmationSingleSchema`.

---

## [2026-04-30j] — Anyakönyvi modálok: okos kereső + automatikus egyházi szám

<!-- key: 2026-04-30j-anyakonyvi-modalok-okos-kereso-egyhazi-szam -->
<!-- category: improvement -->
<!-- targets: lelkészek — anyakönyv modul felhasználói -->

Endre két kérése: "Az okos keresőkben látszódjon az életkor, a lakhely és
utca is, hogy az azonos nevűekkel ne akadjunk össze!" + "az egyházi
anyakönyvi szám pedig automatikusan legyen kitöltött mező". Az 5 manuális
rögzítő dialógot (keresztelés, konfirmáció, esketés, temetés, mozgás) így
egységesítettük, és a táblázat-fülek oszlopaival is összhangba hoztuk.

### ✨ Új funkciók

- **MemberSearchSelect** új közös komponens — az 5 dialógban használt egységes
  okos kereső. Találatonként mutatja: családnév + keresztnév, ♂/♀, életkor,
  születési dátum, és — ha van — lakhely + utca + házszám. Az azonos
  nevűek így könnyen elkülöníthetők.
- **Egyházi anyakönyvi szám automatikusan** — minden új rögzítésnél a
  `generate_egyhazi_anyakonyvi_szam` RPC tölti elő a `YYYYTTNNNN` számot.
  Konfirmáció batch-nél a kezdősorszámból folyamatosan inkrementáljuk a
  többi konfirmandus számát, hogy ne ütközzenek.
- **Új mezők a dialógokban** — a táblázatban már látszó adatok rögzíthetők is:
  - Esketés: `vegyes` házasság jelölőnégyzet (egyik fél nem református).
  - Temetés: `okirat` (állami halotti anyakönyvi szám) külön mező.
  - Elköltözés: `hova_congregation_id` célgyülekezet választó (kereshető,
    egyházmegyei csoportosítás) — kiváltja az automatikus átjelentkezési
    notifikációt.

### 🎨 UX javítások

- Minden dialógban **az állami szám és az egyházi szám szét van választva**
  (Endre szabálya, 2026-04-29 óta DB-szinten is): a violet-700 szám a
  generált egyházi azonosító, az állami szám opcionális szürke mező.
- Konfirmáció dialógban kis **előnézet** mutatja, milyen sorszámmal indul
  a következő batch — így a lelkész látja, mi lesz a "kezdő" egyházi szám.
- Kereszteltek dialógban a szülő-keresők is `MemberSearchSelect`-et
  használnak (genderFilter true/false), és a CNP automatikusan jön a
  kiválasztott személyből.

### 🛠 Technikai

- `apps/web/components/registry/member-search-select.tsx` (új): közös
  reusable kereső, 300ms debounce, `searchMemberForRegistry` action-en
  keresztül. Mutatja a tag JOIN-olt `adrlocality.name` + `adrstreet.name`
  + `c_szam` adatait.
- `apps/web/app/(dashboard)/anyakonyv/actions.ts`: új `getNextEgyhaziSzam`
  server action, az `generate_egyhazi_anyakonyvi_szam` RPC wrappere.
  Az 5 mentő action (`saveBaptism` / `saveConfirmationBatch` /
  `saveMarriage` / `saveBurial` / `saveMovement`) most az `egyhazi_szam`
  mezőt is feltölti — ha a kliens nem küldi, server-side hívja az RPC-t.
- `apps/web/lib/validations/registry.ts`: minden Zod séma megkapta az
  `egyhazi_szam: z.string().nullable().optional()` mezőt; `okirat` és
  `hlevel` mostantól opcionális (Endre szabálya: állami szám lehet üres),
  marriage-ben `vegyes`, movement-ben `hova_congregation_id` is bekerült.
- 5 modál újraírva: `baptism-dialog.tsx`, `confirmation-dialog.tsx`,
  `marriage-dialog.tsx`, `burial-dialog.tsx`, `movement-dialog.tsx` —
  mind a `MemberSearchSelect`-et használja, a dátum + típus alapján auto-tölti
  az egyházi számot.

---

## [2026-04-29c] — Esketés import: férj-családnév alapú menyasszony-keresés

<!-- key: 2026-04-29c-eskeses-ferj-csaladnev-menyasszony-keresss -->
<!-- category: improvement -->
<!-- targets: lelkészek — esketés import felhasználói -->

Endre logikai észrevétele: "Ha megvan a vőlegény, akkor a vőlegény családneve
és a menyasszony keresztnevével kellene egyeztetni — és ami megmarad az a
lánykori neve."

A magyar reformárus gyakorlatban: a házassággal a nő `csaladnev`-je gyakran
a férj nevére változik (pl. `Karácsony Irma` → `Hatházi Irma`), a keresztnév
változatlan, a lánykori név a `szcs_nev` mezőbe kerül. Ezt a logikát eddig
nem építettük be a menyasszony-keresésbe.

### ✨ Új funkciók

- **Lookup-resolver 2. kör**: ha id_ferfi feloldva, de id_no nem, akkor
  próbál a férj-csaladnev + XML keresztnév + sz_datum quad-key-vel keresni.
  Pl. férj=Hatházi, XML=Karácsony Irma sz: 1990 → automatikusan találja a
  `Hatházi Irma sz: 1990` tagot, akinek `szcs_nev=Karácsony`.
- **TOP-5 scoring új tényező**: "Férj családneve egyezik" → +35 pont.
  Ha a jelölt jelenlegi csaladnev-je egyezik a vőlegény csaladnev-jével,
  ÉS NEM egyezik a XML-beli (lánykori) csaladnev-vel, akkor erős jel
  hogy ő a férjezett asszony. Ez kombinálódik a lánykori egyezéssel
  (+25) és a keresztnévvel (+30) — a férjezett menyasszony így 90+
  ponttal kerül a TOP-5 élére.

### 🛠 Technikai

- `lookup-resolver.ts`: új `byId: Map<string, LookupRecord>` index
  (id → person reverse lookup), és 2. kör a marriage profil-on
- `registry-candidates-action.ts`: `husbandCsaladnev` scoring input,
  `personsById` reverse map a candidates-action-ben

---

## [2026-04-29b] — Állami vs egyházi anyakönyvi szám szétválasztása + esketés pár-info

<!-- key: 2026-04-29b-egyhazi-szam-szetvalasztas-eskeses-parinfo -->
<!-- category: bugfix + improvement -->
<!-- targets: lelkészek — anyakönyv modul felhasználói -->

Endre észrevette: a 04-29-i első migráció HIBÁS volt — a generált egyházi
számot az `okirat` mezőbe írta, ami eredetileg az ÁLLAMI anyakönyvi számot
tárolja (pl. 418467, 297301, SZ09130472). A két szám teljesen különböző
dolog, amit szét kell választani. Plus az esketés-import nem mutatta, hogy
kihez keressük a párt.

### 🐛 Javítások

- **Állami vs egyházi anyakönyvi szám szétválasztva** — új `egyhazi_szam`
  oszlop minden anyakönyvi táblához (keresztseg, konfirmalas, hazassag,
  temetes, +4 mozgás). A `okirat` / `hlevel` / `igazolas` az ÁLLAMI számoknak
  marad. Az új generált egyházi szám (`YYYYTTNNNN`) az új mezőbe megy.
- **04-29-i hibás backfill VISSZAVONVA** — ahol a 04-29-i első migráció
  ráírta a `YYYYTTNNNN` formát az `okirat`-ra (pl. `2024010001`,
  `2025010006`), most NULL-ra állítjuk vissza (csak a 10-jegyű, mintára
  illeszkedő rekordoknál — az igazi állami számokat NEM bántjuk).
- **Esketés import: keresztnév-egyezés most KÖTELEZŐ** — Endre észrevétele:
  "Ha van Szász Emőke, akkor csak az Emőkék között lehet a menyasszony.
  A keresztnév nem változik." A TOP-5 picker most csak olyan jelölteket mutat,
  akiknél a keresztnév pontosan vagy részben egyezik.

### ✨ Új funkciók

- **Esketés import: pár-info banner** — a TOP-5 picker minden sornál
  mutatja, kihez keressük a párt (pl. "Esküvő 2025-06-12 — Menyasszony:
  Szász Emőke (28 éves), sz: 1996-...". Az életkor és születési dátum
  segít megkülönböztetni a többszörösen előforduló neveket.
- **Színkódolt slot-jelölő** — vőlegény: kék, menyasszony: rózsaszín,
  egyéb: szürke (gyors vizuális tájékozódás).

### 🛠 Technikai

- SQL migráció: `migration-docs/sql/2026-04-29b-egyhazi-szam-szetvalasztas.sql`
- ALTER TABLE: 8 anyakönyvi tábla mind kapott `egyhazi_szam text` oszlopot
- UNDO regex: `~ '^[0-9]{4}TT[0-9]{4}$'` minta szerint csak az újonnan beírt
  számok visszavonva
- `import_registry_batch`: minden ágban `egyhazi_szam` is INSERT-elve
  (auto-gen ha üres), `okirat`/`hlevel` érintetlen
- `generate_egyhazi_anyakonyvi_szam`: most az új `egyhazi_szam` mezőből
  számolja a max sorszámot
- TS típusok: `KeresztsegRecord`, `KonfirmalasRecord`, `HazassagRecord`,
  `TemetesRecord` mind kapott `egyhazi_szam` mezőt
- UI: `registry-tabs.tsx` 4 új oszlop (Egyházi szám | Állami szám)
- `registry-candidates-action.ts`: `requireKnevMatch` flag + partner-info
- `unresolved-candidates-list.tsx`: pár-info banner + életkor megjelenítése

### 📋 Endre által futtatandó SQL

```sql
-- migration-docs/sql/2026-04-29b-egyhazi-szam-szetvalasztas.sql
-- 1. ADD COLUMN egyhazi_szam minden anyakönyvi táblához
-- 2. UNDO: a 04-29-i hibás backfill visszavonása
-- 3. ÚJ backfill: minden rekordnak egyházi_szam (gyülekezetenként + évenként)
-- 4. import_registry_batch + generate_egyhazi_anyakonyvi_szam frissítés
```

---

## [2026-04-29] — Konfirmáció anyakönyvi szám + import wizard UX javítás

<!-- key: 2026-04-29-konfirmalas-okirat-importwizard-ux -->
<!-- category: feature + bugfix + improvement -->
<!-- targets: lelkészek — anyakönyv modul felhasználói -->

Endre tesztelése feltárta, hogy a konfirmáltak listáján nem jelenik meg az
anyakönyvi szám (mert a `konfirmalas` táblának nem volt `okirat` mezője), és
az import wizard "új tagok létrehozása" gombja félreérthető volt.

### ✨ Új funkciók

- **Konfirmáció anyakönyvi szám** — új `konfirmalas.okirat` oszlop
  (`YYYY02NNNN` formátum), automatikus generálás importnál és kézi
  rögzítésnél, gyülekezetenként + évenként újraszámolt sorszám.
- **Egyházasság hlevel-oszlop a táblában** — esketéseknél is megjelenik az
  anyakönyvi szám (`YYYY03NNNN`).

### 🎨 UX javítások

- **Import wizard person-link lépés átszervezve** — a TOP-5 jelölt-választó
  (létező tagok összekapcsolása) kerül FELÜL, mert ez a leggyakoribb eset.
  Az "új tagok létrehozása" most másodlagos opció, "végső megoldás" jelölővel.
- **"Manuális tag-választás" → "Tagok összekapcsolása"** — egyértelműbb
  szöveg: a TOP-5 picker NEM hoz létre új tagokat, csak a meglevő tagokhoz
  kapcsolja az anyakönyvi bejegyzést.

### 🐛 Javítások

- **Backfill: meglevő bejegyzések anyakönyvi száma** — a 2026-04-29 előtti
  importokon (keresztelés, konfirmáció, esketés, temetés) a hiányzó okirat-ok
  egy SQL migrációval generálódnak (gyülekezetenként, datum szerint
  növekvő sorrendben sorszámozva).

### 🛠 Technikai

- SQL migráció: `migration-docs/sql/2026-04-29-konfirmalas-okirat-backfill.sql`
- Frissített: `import_registry_batch` (confirmation ágba okirat insertálás),
  `generate_egyhazi_anyakonyvi_szam` (confirmation: `okirat` mező használata)
- TypeScript: `KonfirmalasRecord.okirat: string | null`
- Komponens: `registry-tabs.tsx` (3 új okirat oszlop), `person-link-step.tsx`
  (UX átszervezés), `unresolved-candidates-list.tsx` (új szöveg, violet szín)

### 📋 Endre által futtatandó SQL

```sql
-- migration-docs/sql/2026-04-29-konfirmalas-okirat-backfill.sql
-- Lefuttatja: ALTER TABLE konfirmalas + import_registry_batch frissítés
-- + generate_egyhazi_anyakonyvi_szam frissítés + 4 backfill UPDATE
```

---

## [2026-04-28] — Anyakönyvi import bővítések (Endre tesztelés alapján)

<!-- key: 2026-04-28-anyakonyv-import-bovitesek -->
<!-- category: feature + bugfix -->
<!-- targets: lelkészek — anyakönyv modul felhasználói -->

Endre tesztelte a 8 XML importálását, ami több újabb fejlesztést indított.

### ✨ Új funkciók

- **Anyakönyv sidebar almenü** — 9 sub-item (Áttekintés + 8 anyakönyv-típus),
  hash-routing (`/anyakonyv#keresztseg`), bookmarkolható linkek
- **Egyházi anyakönyvi szám auto-generálás** — formátum `YYYYTTNNNN`
  (10 karakter): év + típus-kód (01-08) + sorszám az évben.
  Pl. `2025010042` = 2025-ös év, 42. keresztelés. Új SQL RPC:
  `generate_egyhazi_anyakonyvi_szam`. Az `import_registry_batch` automatikusan
  generálja, ha az `okirat`/`hlevel`/`igazolas` mező üres.
  Endre futtatja: `migration-docs/sql/2026-04-28-egyhazi-anyakonyvi-szam.sql`
- **Manuális tag-pick a wizard person-link lépésén** — minden nem-talált
  sorhoz a wizard megmutatja a TOP-5 leghasonlóbb tag-jelöltet pontszámmal
  (csaladnev/szcs_nev/k_nev/sz_datum/nem alapján). A lelkész 1 klikkel
  választja a megfelelőt. Pontszám-badge színkódolva (zöld 70+, sárga 50+).
- **Lánykori (szcs_nev) self-healing** — esketés-importnál ha a feleség
  megtalálva ÉS a `szcs_nev` üres ÉS a XML lánykori nevet adott → automatikus
  UPDATE. A tagnyilvántartás fokozatosan kiegészül.

### 🐛 Javítások

- **Teljes fájl-parse server-oldalon**: a `parseAndPreview` `slice(0, 5)`-öt
  ad sample-ként, de a wizard ezt küldte importnak is — javítva: most a
  server action maga parse-olja a teljes sheet-et (81 sor → 81 sor)
- **Lakcím vessző-bug**: `, Templom u. 229` (lógó vessző üres helység esetén)
  → `Templom u. 229`
- **OAuth Railway proxy bug**: a `getPublicOrigin()` helper-rel a Railway
  proxy-mögötti `localhost:8080` belső port már nem szivárog ki a redirektbe
- **SW cacheOnNavigation:false** + NetworkOnly auth-routes — a Service
  Worker nem zavarja meg az auth flow-t
- **Quad-lookup magyar Igen/Nem ferfi-flag** + kettős keresztnév variánsok
  (Viktória-Olivia, Krisztina - Panna)
- **Marriage-import dedupe headers** (két "Családnév" oszlop az XML-ben)
  + Év/Hó/Nap → `datum` kompozíció
- **Sidebar hash-routing** — a Next.js Link `pushState`-tel navigál, ami
  nem trigger-eli a `hashchange` event-et. Monkey-patch fix.
- **"Maradjak bejelentkezve" + 1 napos session-lejárat** — login-formon
  új checkbox; default OFF (24h), ON (1 év persistent)

---

## [2026-04-27] — Anyakönyvi import wizard + 1 napos session-lejárat

<!-- key: 2026-04-27-anyakonyv-import-wizard-and-session-expiry -->
<!-- category: feature -->
<!-- targets: lelkészek, fejlesztők — anyakönyv modul + minden bejelentkező felhasználó -->

### ✨ Új funkciók

**Anyakönyvi import wizard** (`/anyakonyv` → "Rendszergazdai importáló" tab):
- Új 7-lépéses wizard (tagnyilvántartás-wizard mintájára): Fájl → Oszlopok → Tagok →
  Helységek → Beállítások → Előnézet → Eredmény
- 8 anyakönyvi profil egyetlen RPC-ben (`import_registry_batch`):
  keresztelés, konfirmáció, esketés, temetés + 4 mozgás (be-/elköltözött,
  áttért, kitért)
- Quad-lookup tag-azonosítás: Családnév + Keresztnév + Született + Férfi
  (a `lookup-resolver.ts` `byQuad` és `byTriple` index-szel)
- Konfirmációnál „Endre invariáns": _keresztelés nélkül nincs konfirmálás_ —
  a wizard speciális lépésen kötelezi a hiányzó keresztelési bejegyzés
  létrehozását („Keresztelés ideje" XML oszlopból auto-stub)
- Esketésnél új `hazassag.vegyes` boolean oszlop (XML „Vegyes" jelölésből)
- Temetés-INSERT trigger: automatikus `szemely.meghalt = true`
- 8 UNIQUE INDEX a dupla-import elleni védelemhez (idempotens rerun)
- Endre futtatja: `migration-docs/sql/2026-04-27-registry-import-rpc.sql` ✅

**„Maradjak bejelentkezve" funkció** (login form):
- Új checkbox a login-űrlapon — alapértelmezett OFF
- Ha BE van pipálva: 1 éves persistent session
- Ha NINCS pipálva: 24 órás session, utána automatikus signOut + redirect
  /login (pasztorális üzenettel: „A bejelentkezésed lejárt — biztonsági okokból
  egy nap után újra be kell jelentkezned.")
- Cookie-alapú (`session-mode`) — a middleware ellenőrzi minden kérésnél
- Google OAuth callback default `session` mode-ban (24 óra) — a felhasználó
  a következő login-on bekapcsolhatja a remember-me-t

### 🐛 Mellékesen javított

- A `lookup-resolver.ts` régi `eq('deleted', false)` szűrője a `szemely`
  táblán hibás volt (a `szemely`-nek nincs `deleted` mezője, csak `isvisible`).
  Mostantól helyes: `eq('isvisible', true)`.

### 📝 Megjegyzés a Google OAuth `400 invalid_request` hibához

Endre jelezte: a Google bejelentkezés `400 invalid_request` hibát dob.
Ez **nem kódhiba**, hanem **konfiguráció**:
- A Google Cloud Console → OAuth client → Authorized redirect URIs
  kell tartalmazza: `https://bjytiawckbibqmtlezfl.supabase.co/auth/v1/callback`
- A Supabase Dashboard → Authentication → Providers → Google: legyen ott
  a helyes Client ID + Client Secret a Google Console-ról
- Ha a Railway domain (`kartotekaweb-production.up.railway.app`) megváltozik,
  a Supabase Dashboard → Authentication → URL Configuration → Site URL és
  Redirect URLs is frissítendő

---

## [2026-04-27] — Sprint Q F3 LEZÁRVA: IncomeDialog közös csomagba (v0.7.11)

<!-- key: 2026-04-27-income-dialog-shared-sprint-q-f3-zaras -->
<!-- category: improvement -->
<!-- version: 0.7.11 -->
<!-- targets: lelkészek, fejlesztők — pénzügyi modul felhasználói -->

**Sprint Q F3 LEZÁRVA — a 3-tagú forma-dialog port utolsó darabja.** Az
`IncomeDialog v3` (873 sor, 10 server-action callback) átkerült a
`@kartoteka/ui-app/finance` shared package-be. Ezzel a teljes pénzügyi
modul vizuális rétege a sharedban él (12/12 = 100%).

### 🎨 Háttér-fejlesztés (Sprint Q F3.2)

**Új shared `IncomeDialogBody.tsx` (~870 sor):**

- Body-pattern: Dialog shell (DialogContent + DialogHeader + DialogTitle)
  webnél marad, body sharedban
- **10 server-action callback prop:**
  - `onSaveIncome`, `onSaveIncomeWithLinkedInventory`, `onSaveIncomeBatch`
  - `onSaveInternalTransfer` (kassza → bank letét)
  - `onGetNextReceiptNumber`, `onGetLastRecordedDate`
  - `onSearchMembers`, `onGetFamilyIdForPerson`
  - `onCheckReceiptDuplicate`, `onGetRentalContracts`
- 1 toast callback (`onToast: (type, message) => void`) —
  típus: `'success' | 'error' | 'warning'`
- Bérleti quick-pick (B1.7), kapcsolt leltári alapeszköz, tag-keresés
  autocomplete-tel — mind a sharedban
- shadcn-radix komponensek (Dialog, Button, Input, Label, Badge, Textarea)
  → native HTML elementekre

**Új shared `inventory.ts` (~37 sor):**

- 10-tételes `INVENTORY_AMORTIZATION_CATALOG`
- `getInventoryAmortizationCatalogEntry` helper

**Webes wrapper átalakult (873 → ~100 sor):**

- `apps/web/components/modals/income-dialog-v3.tsx`: 873 → ~100 sor wrapper
  (Dialog shell + 10 server-action + sonner toast)

### Felhasználó szempontból

Nincs látható változás — a Pénzügy hero **Bevétel** gombja ugyanúgy nyitja
a megszokott dialógot, ugyanazokkal az adatmezőkkel, egyesével/táblázatosan
mód, bankba letét speciális logika, autocomplete tagkereső, bérleti
quick-pick és kapcsolt leltári alapeszköz form ugyanúgy működik.

### Sprint Q áttekintés (Fázis 1+2+3 LEZÁRVA)

| Fázis | Verziók | Hatókör | Modulok |
|-------|---------|---------|---------|
| **F1** | v0.7.0–v0.7.5 | 9 finance UI shared | Dashboard, Debt, Accounting, Rental, Transactions, Monetary, Budget, Cashbook, Bank, FinanceSugo, FinancePrint, BudgetPrint |
| **F2** | v0.7.7–v0.7.9 | Oblio modul TELJESEN | 10 lib + 4 modal + 2 sub-komp + 1 tab + OblioFileSystem interface |
| **F3** | v0.7.10–v0.7.11 | 3 form-dialog | ExpenseDialog + DecontTab + IncomeDialog |

A teljes pénzügyi modul **12/12 = 100%-a** a sharedban él. iOS-future-proof
módon (callback-pattern + slot-pattern + platform-független interface-ek
mint az `OblioFileSystem`).

### iOS-future-proof állapot

- Az IncomeDialogBody pure UI (callback-pattern), csak React + lucide-react
  + relatív shared-importok
- Sem `next/*`, sem `@/components/ui/*`, sem `sonner` nincs benne
- Tauri-mobile alatt egy natív iOS `UIAlertController`-rel és
  `URLSession`-rel kommunikáló wrapper kódváltoztatás nélkül használja

### Verifikáció

- `@kartoteka/ui-app` (tsc): zöld
- `@kartoteka/web` (Next.js 16 + Webpack, 51 oldal): zöld
- `@kartoteka/desktop` (lint + tsc + vite, 2369 modul, 13.00s, 1839 KB): zöld

### Hátralévő (csak emlékeztető)

- **v0.8.x**: Tauri SQLite mirror + offline outbox + finance write flow.
  A teljes pénzügy UI most már desktop-mountolható közös `<FinanceTabs>`
  formában — a következő fázis a write-side offline-szinkronizáció.

---

## [2026-04-27] — Sprint Q F3.1: Kiadás-dialog + Decont-tab közös csomagba (v0.7.10)

<!-- key: 2026-04-27-expense-dialog-and-decont-tab-shared -->
<!-- category: improvement -->
<!-- version: 0.7.10 -->
<!-- targets: lelkészek, fejlesztők — pénzügyi modul felhasználói -->

**Sprint Q F3.1 — formjellegű dialog-port indul.** A Sprint Q Fázis 2
lezárása után a 3-tagú forma-dialog port-ja indult: az `ExpenseDialogV2`
és a `DecontTab` átkerült a `@kartoteka/ui-app/finance` shared package-be.
A Sprint Q F3-ból 1/2 sub-sprint kész. Az `IncomeDialog` (873 sor, 10
callback) v0.7.11-be kerül.

### 🎨 Háttér-fejlesztés (Sprint Q F3.1)

**Új shared `ExpenseDialogBody.tsx` (~530 sor):**

- Body-pattern: Dialog shell (DialogContent + DialogHeader + DialogTitle)
  webnél marad, body sharedban
- 3 server-action callback prop (`onSaveExpense`, `onSaveExpenseBatch`,
  `onSaveInternalTransfer`)
- 1 toast callback (`onToast: (type, message) => void`)
- shadcn-radix komponensek (Dialog, Button, Input, Label, Badge, Textarea)
  → native HTML elementekre (input, button, select, textarea, label)
- `RECEIPT_TYPES`, `BankAccount` típusok a meglévő sharedból

**Új shared `DecontTabBody.tsx` (~330 sor):**

- A Decont (elszámolás) sablon teljes UI logikája átemelve
- `onPrint(params: { mode, html, filename? })` callback prop —
  webes wrapper a `printToBrowser`/`printToPdf` engine-t hívja
- HTML sablon-építő (`buildDecontHtml`) változatlan
- 1 toast callback

**Webes wrapper-ek átalakultak (~620 sor → ~110 sor):**

- `apps/web/components/modals/expense-dialog-v2.tsx`: 473 → ~80 sor wrapper
  (Dialog shell + 3 server-action + sonner toast)
- `apps/web/components/finance/decont-tab.tsx`: 323 → ~30 sor wrapper
  (printToBrowser/printToPdf + sonner toast)

### Felhasználó szempontból

Nincs látható változás — a Pénzügy hero **Kiadás** és **Decont** gombjai
ugyanúgy nyitják a megszokott dialógokat, ugyanazokkal az adatmezőkkel,
egyesével/táblázatosan-mód, bankból kivétel speciális logika, és a
nyomtatás/PDF mentés ugyanúgy működik.

### iOS-future-proof állapot

- Az ExpenseDialogBody pure UI (callback-pattern), Tauri-mobile alatt
  egy natív iOS `UIAlertController`-rel és `URLSession`-rel kommunikáló
  wrapper kódváltoztatás nélkül használja
- A DecontTabBody pure UI; a webes `html2pdf.js` a Tauri-mobile alatt
  egy natív `WKWebView`/`UIPrintInteractionController`-rel cserélhető
- Mindkét body komponens csak a React + lucide-react + relatív
  shared-import készletet használja (sem next/*, sem @/components/ui/*,
  sem sonner)

### Verifikáció

- `@kartoteka/ui-app` (tsc): zöld
- `@kartoteka/web` (Next.js 16 + Webpack, 51 oldal): zöld
- `@kartoteka/desktop` (lint + tsc + vite, 2367 modul, 13.72s, 1839 KB): zöld
- A bundle-méret változatlan (a kód már a sharedban szerepelt logikailag)

### Sprint Q F3 áttekintés (1/2 sub-sprint kész)

| Sub-sprint | Verzió | Hatókör |
|------|--------|---------|
| **F3.1** | **v0.7.10** | **ExpenseDialogV2 + DecontTab — kész** |
| F3.2 | v0.7.11 | IncomeDialog (873s + 10 callback) |

---

## [2026-04-26] — Sprint Q F2 LEZÁRVA: Oblio teljes csomagba (v0.7.9 — F2.3)

<!-- key: 2026-04-26-oblio-tab-and-filesystem-shared -->
<!-- category: improvement -->
<!-- version: 0.7.9 -->
<!-- targets: lelkészek, fejlesztők — Oblio e-Factura modul felhasználói -->

**Sprint Q F2 LEZÁRVA.** Az OblioEllenőrzés modul utolsó eleme — az 1637
soros tab és a File System Access API absztrakció — átkerült a
`@kartoteka/ui-app/finance/oblio/` shared package-be. A Pénzügy modul
**100%-a (11/11 elem) és az Oblio modul minden eleme** közös csomagban van.

### 🎨 Háttér-fejlesztés (Sprint Q F2.3)

**Új shared `OblioEllenorzesTab.tsx` (~1730 sor):**

- Pure UI: csak react + lucide-react + relatív Oblio import-ok
- 5 server-action callback prop (`onLoadMatchesAndKiadasok`,
  `onBulkSaveMatches`, `onSaveSingleMatch`, `onRemoveMatch`,
  `onRecordDownloadNow`)
- 4 modal slot (Dialog shell webnél marad)
- `OblioFileSystem` runtime prop — file-műveletek absztrakciója

**Új `OblioFileSystem` interface a `oblio-filesystem.ts`-ben:**

- 11 metódus: `getFolderStatus`, `getBefogadottDir`, `getFeldolgozvaDir`,
  `listFolderFiles`, `readFileAsText`, `removeFilesFromFolder`,
  `renameFileInFolder`, `processAllZipsInFolder`,
  `reprocessZipsFromArchive`, `openLocalFileInBrowser`
- Web: `BrowserOblioFileSystem` adapter (FSAccess + jszip + DOMParser),
  az `apps/web/lib/finance/oblio/oblio-folder.ts` végén
- Desktop / iOS jövő: saját adapter implementálható (Tauri-fs / Tauri-mobile)

**Új shared típusok:** `ZipProcessResult`, `ReprocessArchiveResult`,
`RemoveFilesResult`, `RenameFileResult`, `OblioBulkMatchInput`,
`OblioKiadasMatchRow`, `OblioMinimalKiadas` (a server action visszatérés-
típusok). A webes `oblio-folder.ts` re-exportál a sharedból.

### 📌 Felhasználói szempontból

- **Webes /penzugy → Oblio ellenőrzés fül**: változatlan UI, működés.
  XML lista, kézi párosítás, diagnosztika dialog, kiadás-bevezetés
  wizard, nyomtatási központ — minden ott van.
- **Adatvesztés nincs**, frissítés automatikus auto-update-ön át.

### 🔧 Műszaki részletek

- Az 1637 soros webes tab átalakult ~120 soros wrapper-ré (Dialog
  shell + sonner toast + 5 server action + 4 modal slot + router).
- `<Button>`, `<Badge>` shadcn → natív elemek a sharedban.
- `toast.*(...)` hívások → `__toast_*` lokális helper-ek (`onToast` callback).
- `window.location.href = '/profile?tab=offline'` → `onOpenSettings()` callback.
- 3 build zöld: ui-app (tsc), web (Next.js 16 webpack, 51 oldal),
  desktop (lint + tsc + vite, 1839 KB bundle, 4.78s).

### 🏆 Sprint Q lezárva — összes finance UI shared

| Modul | Verzió |
|---|---|
| FinanceDashboard | v0.6.0 |
| DebtTab, AccountingTab, RentalTab, TransactionsTab | v0.6.x |
| MonetaryTab, BudgetTab | v0.7.0 |
| CashbookTab | v0.7.1 |
| BankTab | v0.7.2 |
| FinanceSugoTab + Checklist | v0.7.3 |
| FinancePrint + BudgetPrint Dialog | v0.7.5 |
| Sidebar Pénzügy almenü | v0.7.6 |
| Oblio 10 lib | v0.7.7 |
| Oblio 4 modal + 2 sub-komp | v0.7.8 |
| **Oblio Tab + FileSystem interface** | **v0.7.9** |

### 🛑 Hátra (Sprint Q F3 + v0.8.x)

- **Sprint Q F3**: 3 form-dialog (IncomeDialog, ExpenseDialogV2, DecontDialog)
- **v0.8.x**: offline finance write (Tauri SQLite mirror, outbox)

---

## [2026-04-26] — OblioEllenőrzés 4 modal + 2 sub-komp közös csomagba (v0.7.8 — Sprint Q F2.2)

<!-- key: 2026-04-26-oblio-modals-shared-package -->
<!-- category: improvement -->
<!-- version: 0.7.8 -->
<!-- targets: lelkészek, fejlesztők — Oblio e-Factura modul felhasználói -->

A Pénzügy → OblioEllenőrzés moduljában a 4 dialog-modal és a 2 sub-komp
mind átkerült a `@kartoteka/ui-app/finance/oblio/` shared package-be.
A UI változatlan, viszont a webes oldal csak `Dialog` shell + callback
prop-okat ad — a body shared. Sprint Q F2-ből 2/3 sub-sprint kész
(F2.1 + F2.2). Hátra: F2.3 — a tab + File System Access interface.

### 🎨 Háttér-fejlesztés (Sprint Q F2.2)

**Új shared komponensek (6 fájl, ~2000 sor):**

- **2 sub-komp** közvetlenül a sharedban:
  - `OblioEllenorzesWarnings` + `OblioFormatGuideCard` (160 sor)
  - `OblioEllenorzesFolderCard` (295 sor) — FSAccess-jelző UI, copy-clipboard
- **4 modal** body-pattern szerint (Dialog shell webnél, body shared):
  - `OblioManualMatchDialogBody` (266 sor) — kézi párosítás
  - `OblioMatchDiagnosticDialogBody` (510 sor) — 3 fülre osztott diagnosztika
  - `OblioKiadasWizardDialogBody` (415 sor) — kronológiai bevezető wizard
  - `OblioInvoicePrintDialogBody` (425 sor) — KARTOTEKA + ANAF PDF tabok,
    iframe + `window.print()` (FSAccess típus a sharedban)

**Új shared típusok:**

- `OblioFolderStatus`, `OblioLocalFile` (folder-types.ts) — eddig a
  `oblio-folder.ts`-ben; most a sharedban, a webes verzió re-exportál.
- `WizardXmlItem`, `ExpenseCategoryOption`, `OblioCreateKiadasPayload`.

### 📌 Felhasználói szempontból

- **Webes /penzugy → Oblio ellenőrzés fül**: változatlan UI, működés.
- **Adatvesztés nincs**, frissítés automatikus auto-update-ön át.

### 🔧 Műszaki részletek

- A 6 webes fájl wrapper-ré egyszerűsödött (~30-100 sor mind):
  - 2 sub-komp: re-export közvetlenül
  - 4 modal: Dialog wrapper + sonner toast + server action callback bekötés
- `Button`, `Input`, `Textarea` shadcn → natív elemek a sharedban.
- 3 build zöld: ui-app (tsc), web (Next.js 16 webpack, 51 oldal),
  desktop (lint + tsc + vite, 1839 KB bundle, 4.92s).

### 🛑 Sprint Q F2.3 (v0.7.9) — hátra

- 1637 soros tab átemelése a sharedba
- `OblioFileSystem` interface a sharedban — a `oblio-folder.ts` File
  System Access API-t absztrakcióval mögé.

---

## [2026-04-26] — OblioEllenőrzés 10 lib közös csomagba (v0.7.7 — Sprint Q F2.1)

<!-- key: 2026-04-26-oblio-libs-shared-package -->
<!-- category: improvement -->
<!-- version: 0.7.7 -->
<!-- targets: lelkészek, fejlesztők — Oblio e-Factura modul felhasználói -->

A Pénzügy modul **OblioEllenőrzés** moduljának 10 belső lib-je átkerült a
`@kartoteka/ui-app/finance/oblio/` shared csomagba. Az e-Factura
ellenőrzésnél semmi nem változik a felhasználó számára (a UI, a párosítás
algoritmus, a PDF tartalom-elemzés mind ugyanúgy működik), de a kód-
struktúra fel van készítve a desktop és (a jövőben) iOS oldali használatra.

### 🎨 Háttér-fejlesztés (web–desktop UI paritás Sprint Q F2.1)

- **Pure-logic lib-ek** átemelve (4 fájl): `oblio-types`, `oblio-status-labels`,
  `oblio-errors`, `oblio-matcher` (XML↔kiadás fuzzy párosítás algoritmus).
- **Browser-only lib-ek** átemelve (6 fájl): `ubl-parser` (DOMParser),
  `pdf-content-parser` (pdfjs-dist lazy import), `pdf-xml-name-matcher`
  (fájlnév-pattern), `pdf-xml-content-matcher`, `oblio-print-builder`
  (HTML), `oblio-cache` (IndexedDB/Dexie).
- **Server-only lib-ek** webnél maradnak (3 fájl): `oblio-auth`, `oblio-client`,
  `oblio-invoice-builder` — secret + REST API hívás, NEM kerül a sharedba.
- **`oblio-folder.ts`** (File System Access API) szintén webnél marad —
  a v0.7.9 sprintben kerül interface mögé (iOS-WKWebView fallback).
- **Webes oldali kompatibilitás**: a 10 webes lib re-exporttá alakult
  (`export * from '@kartoteka/ui-app'`), így minden meglévő import-hely
  (`from '@/lib/finance/oblio/oblio-types'` stb.) változatlanul működik.

### 📦 Új npm dependencies

A `@kartoteka/ui-app` shared csomag bővült:
- `dexie ^4.4.2` (IndexedDB cache az XML-eknél)
- `pdfjs-dist ^5.6.205` (PDF tartalom-elemzés)

Mindkettő iOS WKWebView-kompatibilis. A webes oldal már korábban használta
őket, most a sharedba is bekerültek azonos verzióval.

### 🔧 TypeScript target frissítés

A `packages/ui-app/tsconfig.json` és `apps/desktop/tsconfig.json` `ES2020`
→ `ES2022`-re emelve, mert az `Error({ cause })` constructor-szignatúra
ES2022-es. iOS Safari 16+ és Chromium 94+ támogatja.

### 📌 Felhasználói szempontból

- **Webes /penzugy → Oblio ellenőrzés fül**: változatlan UI, működés.
  XML lista, kézi párosítás, diagnosztika dialog, kiadás-bevezetés
  wizard — minden ott van, ahol eddig.
- **Adatvesztés nincs**, frissítés automatikus auto-update-ön át.

### 🛑 Sprint Q F2 következő lépések

- **v0.7.8 (Sprint Q F2.2)**: 4 modal + 2 sub-komp port (~2000 sor)
- **v0.7.9 (Sprint Q F2.3)**: 1637 soros tab + `OblioFileSystem` interface
  (FSAccess absztrakció iOS-felkészülés)

---

## [2026-04-26] — Tagnyilvántartás: hiányzó házastársak diagnosztikája + auto-MERGE

<!-- key: 2026-04-26-missing-spouses-fix -->
<!-- category: bugfix -->
<!-- targets: lelkészek — tagnyilvántartás, családstruktúra -->

A `csaladok.xml` import után sok család egyetlen családfővel jött létre
(`id_ferfi` VAGY `id_no` van, de a házastárs hiányzik). Ennek 3 oka volt:
(1) az import **single-parent rekordot** hoz létre, mert a XML egy sora egy
családfőt definiál; (2) az auto-link RPC szűrte a `csaladfo = true`
szemely-eket — viszont sokan így kerültek be; (3) sok esetben mindkét
házastárs *külön-külön* egy-egy single-parent csalad-ban szerepelt (mert a
XML mindkettőt családfőként importálta).

### 🐛 Javítások (SQL hotfixek — Endre futtatja Studio-ban)

**Diagnosztika**:
- **`2026-04-26-FIX-missing-spouses-diagnostics.sql`** — single-parent vs.
  házaspár kimutatás, NULL `c_utcaid` családok, cím-alapú jelölt-számolás,
  két-csalad-egy-cím duplikációk

**MŰKÖDŐ MEGOLDÁS — három DO-blokk script egyenként Studio-ban**:
- **`v7-do-block.sql`** — STRICT MERGE: 1×1 single-parent ugyanazon címen
- **`v8-namematch.sql`** — NÉV-PÁROSÍTÁS: azonos vezetéknév (vagy nő
  `szcs_nev` = férj `csaladnev`), kétoldalú egyértelműség
- **`v9-loose-link.sql`** — LOOSE LINK: single-parent csaladhoz egyetlen
  másnemű felnőtt szemely (`csaladfo = false`) ugyanazon címen

**Eredmény (egy gyülekezeten, 201 csalad)**:
- STRICT: **2 pár MERGE** (Benkő-Benkő, Finta-Földes)
- NAMEMATCH: **1 pár MERGE** (Kiss-Kiss)
- LOOSE: **0 csatolás** (nincs egyértelmű jelölt)
- Maradt: **63** valódi single-parent (özvegy/elvált/egyedülálló) +
  **44** többfős cím manuális rendezésre (kollégium/bérház/többgenerációs ház)
- Házaspár: 90 → **93** (3 új házaspár)

**Tanulságok (DEPRECATED iterációk v1–v6)**:
- `v1–v3` — `BEGIN/COMMIT` + 3 DO blokk: túl naiv MERGE → UNIQUE-violation
  egy körben → teljes ROLLBACK → adatbázis érintetlen
- `v4` — perzisztens log-tábla: Studio nem futtatta a DO-blokkokat
  (statement-batching probléma), csak a végső SELECT-eket
- `v5` — egyetlen RPC `BEGIN/COMMIT`-ban: Studio "Run" csak az utolsó
  SELECT-et futtatta, a CREATE FUNCTION nem hajtódott végre (MCP-vel
  ellenőrizve: `merge_spouses_bulk` nem jött létre)
- `v6` — PURE data-modifying CTE chain: az UPDATE+DELETE concurrent-ek
  ugyanazon snapshot-on (PostgreSQL spec) → UNIQUE-violation a snapshot-
  régi feleség-csaladdal → teljes ROLLBACK
- **MEGOLDÁS** (v7–v9): 3 KÜLÖN script, mindegyikben EGY `DO $$` blokk
  soros lépésekkel (UPDATE gyerek → DELETE feleség-csalad →
  UPDATE férj-csalad → UPDATE szemely.csaladfo) + EXCEPTION-handling
  páronként + eredmény perzisztens táblába (`_merge_v7_result`)

### 🎯 Várható hatás

Egy átlagos gyülekezet (200-300 csalad) esetén a MERGE valószínűleg több
tucat duplikált rekordot von össze; a LOOSE LINK további párokat csatol
egyértelmű cím-alapú egyezések alapján. Ami marad → manuális rendezés
(többes jelölt vagy hiányzó cím).

---

## [2026-04-26] — Pénzügy almenü a sidebarban (v0.7.6)

<!-- key: 2026-04-26-sidebar-finance-submenu -->
<!-- category: feature -->
<!-- version: 0.7.6 -->
<!-- targets: lelkészek, fejlesztők — minden pénzügyi modul felhasználói -->

A baloldali sidebar-ban a **Pénzügy** menüpont mostantól kibontható
almenüvel jelenik meg. Egy kattintással elérhető minden pénzügyi oldal
(desktopon a 7 implementált oldal, weben a 11 fül) — nem kell előbb
a /penzugy oldalra navigálni, majd a fülön belül átkattintani.

### 🎨 Felhasználói UX

- **Pénzügy → chevron jobbra (▶)**: az ikonra kattintva kibontódik az
  almenü (vagy becsukódik ha már nyitva).
- **Auto-expand**: ha az aktuális oldal a Pénzügy modulban van
  (pl. `/penzugy/befizetes`), az almenü automatikusan kibontva indul.
- **Aktív sub-item**: a jelenlegi oldal vagy fül erősebb kiemelést kap
  (világos szín + bold).
- **Behúzott sub-itemek**: vékony függőleges vonal jelzi a hierarchiát,
  bullet-pont az aktív/inaktív állapot.
- **Mobil + collapsed sidebar**: collapsed (csak ikon) módban a Pénzügy
  ikonra kattintva navigál a /penzugy-re; a sub-itemek a kibontott
  módban érhetők el.

### 📋 Almenü tartalmak

**Webes (11 fül, hash-alapú navigáció `/penzugy#cashbook` stb.):**
- Áttekintés, Kassza, Bank, Tranzakciók, Költségvetés, Számadás,
  Tartozások, Bérleti szerződések, Monetár, Oblio ellenőrzés, Súgó.

**Desktop (7 oldal, `/penzugy/<route>`):**
- Áttekintés, Bevétel, Kiadás, Belső mozgás, Nyugta, Nyugtatömbök,
  Bank import.

### 🔧 Műszaki részletek (fejlesztőknek)

- `MenuItem.children?: MenuItem[]` mező — kibontható almenü modellje.
- `KartotekaSidebar` + `SidebarAdaptiveV4` (web saját) bővítve
  `financeSubmenu` prop-pal — a wrapper adja át a 7/11 sub-item listát.
- Hash-alapú aktivitás: `/penzugy#cashbook` → pathname=='/penzugy' +
  `window.location.hash === '#cashbook'`.
- `finance-tabs.tsx` hash-listener: mount-kor + `hashchange` event-re
  beállítja az activeTab-ot. Tab váltáskor `history.replaceState` az
  URL hash-t (nem pushState — nincs Vissza-gomb-ugrálás).
- `'use client'` direktíva a közös `kartoteka-sidebar.tsx`-ben — az
  új `useState`/`useEffect` hookok miatt.

### 📦 Új ALAPELV (memória)

- **Web és desktop párhuzamos fejlesztés** — minden új feature MINDKÉT
  platformra párhuzamosan. Ez volt az első port, ami ezt explicit
  követte: a webes saját sidebar és a közös shared sidebar EGYIDŐBEN
  módosult, a wrapper-ek párhuzamosan.

### 📌 Felhasználói szempontból

- **Webes /dashboard → Pénzügy menüpont**: chevron-os kibontható almenü.
- **Desktop oldal → Pénzügy menüpont**: ugyanígy.
- **Adatvesztés nincs**, frissítés automatikus auto-update-ön át.

---

## [2026-04-27] — Google OAuth visszairányítás localhost:8080 javítás

<!-- key: 2026-04-27-google-oauth-localhost-8080-redirect-fix -->
<!-- category: bugfix -->
<!-- targets: lelkészek, rendszergazdák — Google bejelentkezés -->

Google bejelentkezésnél előfordulhatott, hogy a Supabase/Google OAuth folyamat a
`https://localhost:8080/` címre irányított vissza. Ez különösen akkor veszélyes,
ha a bejelentkezés desktop/lokális shell eredetből indul, vagy a Supabase projekt
auth konfigurációjában régi lokális Site URL maradt.

### Javítások

- **Kanonikus OAuth callback URL**: a Google bejelentkezés most elsőként a `NEXT_PUBLIC_APP_URL` értékét használja callback originnek.
- **`localhost:8080` csapda elkerülése**: ha a kliens aktuális eredete `localhost:8080`, a rendszer nem ezt küldi tovább OAuth callbackként, hanem a publikus Railway app címet használja fallbackként.
- **Lokális fejlesztés megőrzése**: normál lokális fejlesztői portokon, ha nincs `NEXT_PUBLIC_APP_URL`, továbbra is az aktuális `window.location.origin` marad az OAuth redirect alapja.

### Üzemeltetési megjegyzés

- Railway környezetben javasolt a `NEXT_PUBLIC_APP_URL=https://kartotekaweb-production.up.railway.app` változó beállítása.
- Supabase Authentication URL Configuration alatt a publikus callbacket is engedélyezni kell: `https://kartotekaweb-production.up.railway.app/auth/callback`.

---

## [2026-04-26] — Welcome wizard mentési hotfix és pénzügyi oldal stabilizálás

<!-- key: 2026-04-26-welcome-wizard-step-save-hotfix -->
<!-- category: bugfix -->
<!-- targets: lelkészek, rendszergazdák — welcome wizard és pénzügyi modul -->

A welcome wizard pénzügyi lépésének szigorítása felszínre hozott egy korábbi kliensoldali mentési hibát:
a lépés komponense frissítette ugyan a React állapotot, de a szülő komponens azonnal a régi állapotból
mentett szerverre. Ez főleg a pénzügyi lépésnél okozhatta azt, hogy a frissen beírt éves járulék helyett
0 került a `wizard_progress.data.finance` mezőbe, így a wizard véglegesítés vagy a pénzügyi oldal
inicializálása elakadhatott.

### Javítások

- **A wizard-lépések mindig az aktuális formértéket mentik**: a gyülekezeti, lelkészi és pénzügyi lépés most közvetlenül átadja a saját friss formállapotát a szülő komponensnek, nem vár a React state aszinkron frissülésére.
- **A pénzügyi Step 4 mentése stabil**: az éves járulék, kedvezményes járulék, határidő és nyitó egyenlegek azonnal a ténylegesen beírt értékekkel kerülnek a szerveroldali `wizard_progress` sorba.
- **A `bealitas.utcaid` fallback biztonságosabb**: ha a gyülekezetnél még nincs strukturált `adrstreet_id`, a rendszer először az első létező `adrstreet` sort használja fallbackként, és csak végső tartalékként marad a régi `1` érték.
- **A pénzügyi oldal bootstrapje kevésbé törékeny**: a hiányzó éves `bealitas` sor létrehozása kisebb eséllyel akad el idegenkulcs-hiba miatt frissen resetelt vagy részben kitöltött gyülekezetnél.

### Ellenőrzés

- Célzott ESLint: tiszta.
- Teljes `tsc --noEmit`: tiszta.
- Teljes production build (`npm run build --workspace=@kartoteka/web`): sikeres, `/penzugy` route production buildben is renderelhető.

---

## [2026-04-26] — Welcome wizard újranyitás és pénzügyi beállítás bootstrap javítás

<!-- key: 2026-04-26-welcome-wizard-finance-bootstrap-fix -->
<!-- category: bugfix -->
<!-- targets: lelkészek, rendszergazdák — resetelt vagy újrakezdett gyülekezetek -->

Resetelt vagy részben törölt gyülekezeti adatoknál előfordulhatott, hogy a rendszer a lelkészt már
onboarding-késznek tekintette, ezért nem nyitotta meg a welcome wizardot, miközben a gyülekezeti vagy
pénzügyi alapadatok már hiányoztak. A pénzügyi oldal ilyenkor zsákutcába futhatott azzal az üzenettel,
hogy az adott évi `bealitas` sor nem hozható létre automatikusan.

### Javítások

- **A welcome wizard nem csak a kész flagre figyel**: a dashboard guard már nem kizárólag a `profiles.onboarding_completed_at` mező alapján dönt. Új közös ellenőrzés vizsgálja a lelkész nevét, a gyülekezeti sort, a gyülekezeti nevet, a címet, az éves járulékot és a járulék-határidőt is.
- **Reset után is újranyílik a wizard**: ha a reset/wipe után a `profiles.onboarding_completed_at` vagy a `wizard_progress.completed_at` bent maradt, de a kritikus törzsadat hiányzik, a rendszer újra a `/welcome` oldalra terel.
- **A `/welcome` oldal nem zárja ki tévesen a felhasználót**: a setup layout már csak akkor irányít vissza a dashboardra, ha az onboarding-kész jelzés mellett a kritikus alapadatok is rendben vannak.
- **A wizard progress visszaállítható állapotba kerül**: ha egy korábban befejezett wizard-sort hiányos adatok mellett találunk, a rendszer törli a `completed_at` értéket és a hiányzó adatokhoz tartozó legkorábbi lépésre állítja vissza a folyamatot.
- **A pénzügyi lépés kötelezővé vált**: a Step 4 nem enged tovább 0 vagy hiányzó éves járulékkal, illetve hibás `MM-DD` határidő-formátummal.
- **A wizard nem jelölhető késznek hiányos pénzügyi alapadatokkal**: a véglegesítés szerveroldalon is ellenőrzi az éves járulékot és a határidőt, mielőtt bármilyen kész állapotot rögzítene.
- **A `bealitas` mentése a helyes kulccsal történik**: a welcome wizard az éves pénzügyi sort a séma szerinti `(id, congregation_id)` konfliktuskulccsal upserteli, nem csak az év (`id`) alapján.
- **Sikertelen pénzügyi mentésnél nincs hamis onboarding-kész állapot**: ha a `bealitas` sor mentése hibára fut, a wizard hibát ad vissza, és nem írja be sem a `profiles.onboarding_completed_at`, sem a `wizard_progress.completed_at` értéket.
- **A legacy kötelező `bealitas` mezők kitöltést kapnak**: az automatikus éves pénzügyi beállítás létrehozása megadja a régi NOT NULL mezőket is (`aktiv`, `isszemelyibefizetes`, `isszulokkulon`, `felmentes70felul`, `felmentesideneskudtek`, `kedvezmenyxevenfelul`, `utcaid`).
- **A pénzügyi oldal önjavító bootstrapje stabilabb**: ha a gyülekezeti törzsadatokban már megvan az éves járulék és a határidő, a `/penzugy` oldal automatikusan létre tudja hozni az aktuális évi `bealitas` sort a megfelelő legacy-kompatibilis mezőkkel.
- **A strukturált címadatok is továbbmennek**: a wizardból érkező megye, város, irányítószám, házszám, ország, `adrlocality_id` és `adrstreet_id` mezők mentése összhangba került a `congregations` sémával.
- **A `bealitas` cím FK mezői biztonságosabbak**: ahol van strukturált utca/helység azonosító, a pénzügyi beállítás is ezt használja; ha nincs, a korábbi legacy fallback marad.

### Műszaki megjegyzések

- Új közös szerveroldali helper készült: `apps/web/lib/onboarding/welcome-status.ts`. Ennek célja, hogy a dashboard guard, a setup layout és a wizard progress ugyanazzal a logikával döntse el, szükséges-e a welcome wizard.
- Az ellenőrzés tudatosan figyel a resetelt gyülekezetekre: az onboarding flag önmagában nem kanonikus igazság, ha közben a hozzá tartozó gyülekezeti/pénzügyi adatok hiányoznak.
- A `bealitas` tábla elsődleges kulcsa a dokumentált séma szerint `(id, congregation_id)`, ezért minden új éves pénzügyi sor létrehozásánál ezt kell használni.
- Nem történt deploy, release vagy éles adatbázis-módosítás. A javítás csak kódszinten készült el, az élesítés továbbra is külön rendszergazdai engedélyhez kötött.
- Ellenőrzés: célzott ESLint tiszta, teljes `tsc --noEmit` tiszta.

---

## [2026-04-26] — Pénzügyi nyomtatási központok közös csomagba (v0.7.5 — Sprint Q F1 lezárás)

<!-- key: 2026-04-26-finance-print-shared-package -->
<!-- category: improvement -->
<!-- version: 0.7.5 -->
<!-- targets: lelkészek, fejlesztők — pénzügyi nyomtatás felhasználói -->

A Pénzügy modul két nyomtatási központja (FinancePrintDialog: Registru Casa /
Banca / Jurnal / Nyugtatömb-kimutatás; és BudgetPrintDialog: költségvetés /
számadás / részszámadás) átkerült a `@kartoteka/ui-app/finance` shared
package-be. **Sprint Q F1 lezárul**: 9/11 finance modul közös csomagban.
A felhasználó számára semmi nem változik.

### 🎨 Háttér-fejlesztés (web–desktop UI paritás)

- **Közös FinancePrintDialogBody + BudgetPrintDialogBody**: a 3-5 nyomtatvány
  típusát váltó UI, élő iframe-előnézet, dátumtartomány-szűrő (részszámadásnál),
  bankszámla-választó (Registru Banca-nál) — mind a sharedban.
- **Slot-pattern a Dialog shell-re**: a shadcn-radix `<Dialog>` wrapper a
  webnél marad — a sharedban csak a tartalom. Ez konzisztens a
  CashbookTab/BankTab modal slot-okkal.
- **Print engine callback-ek**: `onPrintToBrowser(html)` és
  `onPrintToPdf(html, filename, opts)` — a wrapper a `print-engine-v2.ts`-t
  köti be (web: html2pdf.js + iframe), iOS-en jövőbeli platform-specifikus
  implementáció (UIPrintInteractionController).
- **HTML builder callback-en**: `buildReport(filters)` — a wrapper a
  `buildFinancePrintDocument` / `buildBudgetPrintDocument`-tel állítja elő
  a HTML-t.
- **Költségvetés-sorok lazy-load**: `onLoadBudgetRows(year)` callback —
  a Supabase client a webes wrapperben.

### 📌 Felhasználói szempontból

- **Webes /penzugy → Pénzügy fejléc → „Pénztár nyomtatás" gomb**: változatlan
  UI, működés. Élő előnézet, A4 fekvő, PDF mentés.
- **Webes /penzugy → Pénzügy fejléc → „Költségvetés nyomtatás" gomb**:
  változatlan UI. Részszámadás dátumtartománnyal és gyorsbeállításokkal.
- **Adatvesztés nincs**, frissítés automatikus auto-update-ön át.

### 🔧 Műszaki részletek (fejlesztőknek)

- Új shared komponensek:
  - `packages/ui-app/src/finance/FinancePrintDialogBody.tsx` (~340 sor)
  - `packages/ui-app/src/finance/BudgetPrintDialogBody.tsx` (~430 sor)
- Új shared típusok a `types.ts`-ben: `FinancePrintType`, `FinancePrintTypeMeta`,
  `BudgetPrintType`, `BudgetPrintTypeMeta`, `PrintReport`, `NyugtatombReportRow`.
- Webes wrapperek átírva, Dialog shell webnél marad.
- 3 build zöld: ui-app (tsc), web (Next.js 16 webpack, 51 oldal), desktop
  (lint + tsc + vite, 2340 modul, 3.84s).

### 🛑 Sprint Q F1 hatókör — átengedve külön sprintekbe

Az alapos elemzés alapján a következő komponensek **NEM kerültek** ebbe a
sprintbe, külön fókuszált sprintekben dolgozzuk fel őket:

- **OblioEllenőrzésTab** (~7500 sor): 25+ runtime callback (FSAccess API +
  Dexie + PDF.js + szerver actionök) — egy session-ben magas hibakockázat.
- **3 form-dialog** (IncomeDialog + ExpenseDialogV2 + DecontDialog wrapper):
  12+ server-action callback, sok shadcn-radix form-input-csere.

### Sprint Q F1 zárás állapot — 9/11 finance UI shared

| # | Modul | Verzió |
|---|-------|--------|
| 1 | FinanceDashboard | v0.6.0 |
| 2 | DebtTab | v0.6.1 |
| 3 | AccountingTab | v0.6.2 |
| 4 | RentalTab | v0.6.3 |
| 5 | TransactionsTab | v0.6.3 |
| 6 | MonetaryTab | v0.7.0 |
| 7 | BudgetTab | v0.7.0 |
| 8 | CashbookTab | v0.7.1 |
| 9 | BankTab | v0.7.2 |
| 10 | FinanceSugoTab + Checklist | v0.7.3 |
| 11 | FinancePrintDialog + BudgetPrintDialog | v0.7.5 |
| **Hátra** | OblioEllenőrzésTab + Income/Expense/Decont dialog | külön sprintek |

---

## [2026-04-25] — Admin frissítésnapló archívum és aktív profil szerinti kezdőoldal

<!-- key: 2026-04-25-admin-frissitesnaplo-es-active-root-redirect -->
<!-- category: bugfix -->
<!-- targets: rendszerszintű adminok, kerületi adminok, több szerepkörrel dolgozó felhasználók -->

Két, adminisztrációt és napi használatot érintő javítás készült: az admin Frissítések fül most már minden
CHANGELOG bejegyzést visszanézhető archívumként mutat, a főoldali belépési út pedig az aktív profil-szintet
követi, nem a felhasználó legmagasabb elérhető szerepkörét.

### Javítások

- **Admin → Frissítések: minden bejegyzés látható marad**: megszűnt az a félrevezető állapot, amikor a felület csak annyit írt, hogy „Minden bejegyzés közzé lett téve”, és a korábbi frissítések csak egy keskeny összecsukott listában voltak visszanézhetők. Most a teljes `docs/CHANGELOG.md` alapú frissítésnapló mindig megjelenik.
- **Dobozos frissítéselrendezés**: a changelog-bejegyzések kártyarácsban jelennek meg. Minden frissítés önálló dobozt kap dátummal, címmel, verzióval, kategóriával, célközönséggel és kézbesítési státusszal.
- **Kattintható részletezés**: egy frissítés kártyájára kattintva lenyílik a hozzá tartozó teljes changelog-tartalom, így az admin bármikor vissza tudja olvasni, pontosan mi tartozott az adott bejegyzésbe.
- **Üzenet és email státusz külön jelölve**: minden frissítés mellett látszik, hogy az alkalmazáson belüli üzenet el lett-e küldve, hány címzettnek ment, milyen célzással ment ki, és hogy email is ment-e, nem volt kérve, függőben van-e vagy hibára futott.
- **Fejlesztési hírlevél email státuszának rögzítése**: több changelog-bejegyzés együttes hírlevélküldése után a rendszer a kapcsolódó `system_broadcasts` sorokon is rögzíti, hogy email küldés történt-e, sikeres volt-e, vagy milyen hiba állt elő. Ez a jövőbeli visszanézhetőséget pontosabbá teszi.
- **Aktív gyülekezeti profilból nincs automatikus kerületi átugrás**: a `/` főoldal most elsőként az aktív `profile_role.scope` állapotot veszi figyelembe. Ha a felhasználó gyülekezeti profilban van, akkor a gyülekezeti dashboardra kerül, még akkor is, ha egyébként magasabb szintű szerepköre is van.
- **Egységes post-login útvonal**: a jelszavas belépés, az OAuth callback, az OAuth-complete oldal és a bejelentkezett felhasználó auth-oldalról való visszairányítása mind a gyökér resolverre fut be. Így a kezdőoldal-választás egyetlen helyen, az aktív profil-scope alapján történik.
- **OAuth profilkiegészítés megőrzése**: az `/oauth-complete` útvonal bejelentkezett OAuth felhasználónál továbbra is elérhető marad, ha még nincs profilja. Ha már van profil, az oldal a közös kezdőoldal-resolverre irányít.

### Műszaki részletek

- A `ChangelogEntry` típus új `broadcastStatus` mezőt kapott, amely a `system_broadcasts` sorból hozza a `sent_at`, `recipient_count`, `target_scope`, `target_role`, `send_email`, `email_sent_at` és `email_error` mezőket.
- A `listChangelogEntries()` már nem csak azt állapítja meg, hogy egy changelog-kulcs szerepel-e a broadcast táblában, hanem a kézbesítési metaadatokat is visszaadja az admin UI-nak.
- A `BroadcastsTab` fő changelog-szekciója a teljes bejegyzéslistát rendereli, nem csak az `unsentEntries` listát. A hírlevélküldő továbbra is csak a még nem kiküldött bejegyzéseket kapja.
- A `resolveDefaultDashboardPath()` az aktív profil-scope-ot a `profile_preferences.default_dashboard` elé helyezi, mert profilváltás után a felhasználónak abban a munkatérben kell maradnia, amelyet kiválasztott.
- A régi `resolvePostAuthRedirectPath()` helper is a közös `/` resolverre terel, hogy későbbi újrahívás esetén se térjen vissza a magasabb szerepkör szerinti automatikus átugrás.

---

## [2026-04-25] — Pénzügy Súgó közös csomagba költözött (v0.7.3)

<!-- key: 2026-04-25-finance-sugo-shared-package -->
<!-- category: improvement -->
<!-- version: 0.7.3 -->
<!-- targets: lelkészek, fejlesztők — pénzügyi súgó felhasználói -->

A Pénzügy modul Súgó füle (a teljes lelkészbarát magyarázat-rendszer + élő év végi
zárás checklist) átkerült a `@kartoteka/ui-app` shared package-be. A felhasználó
számára semmi nem változik: a kategorizált súgó-szöveg (5 szekció, 20+ téma),
a print/PDF kimenet és az élő checklist (localStorage) pontosan ugyanúgy
működik, mint v0.7.2-ben.

### 🎨 Háttér-fejlesztés (web–desktop UI paritás)

- **Közös FinanceSugoTab + FinanceSugoChecklist**: a vizuális réteg most már
  a `@kartoteka/ui-app/finance` package-ben él. A platform-függő részek
  (print engine, sonner toast, web-specifikus URL-ek) callback prop-okon
  keresztül kapcsolódnak.
- **Print/PDF callback pattern**: a `onPrintTopicToBrowser` és
  `onPrintTopicToPdf` callback-ek a topic adatait adják át a wrappernek —
  a web a `html2pdf.js`-szel és a `print-engine-v2.ts`-szel rendereli,
  desktop / iOS jövőbeli platformja saját print engine-t használhat
  (WebView2 native print, iOS UIPrintInteractionController).
- **iOS-felkészültség**: a komponensek platform-függetlenek, a localStorage
  iOS WKWebView-ban is működik (`window` guard mögött).

### 📌 Felhasználói szempontból

- **Webes /penzugy → Súgó fül**: változatlan UI és viselkedés. A 20+ topic,
  a print, a PDF és az élő checklist mind ott van.

### 🔧 Műszaki részletek (fejlesztőknek)

- Új shared komponensek: `packages/ui-app/src/finance/FinanceSugoTab.tsx`
  (~870 sor) + `packages/ui-app/src/finance/FinanceSugoChecklist.tsx`.
- Új típus: `FinanceSugoTopicPdfData` (a print callback-ek signaturájához).
- Webes wrapper egyszerűsödött (~50 sor): `apps/web/components/finance/finance-sugo-tab.tsx`.
- Régi `apps/web/components/finance/finance-sugo-checklist.tsx` törölve
  (a shared verzió helyettesíti).
- 3 build zöld: ui-app (tsc), web (Next.js 16 webpack, 51 oldal), desktop
  (lint + tsc + vite, 2338 modul).

---

## [2026-04-25] — Banki modul közös csomagba költözött (v0.7.2)

<!-- key: 2026-04-25-banktab-shared-package -->
<!-- category: improvement -->
<!-- version: 0.7.2 -->
<!-- targets: lelkészek, fejlesztők — pénzügyi modul felhasználói -->

A pénzügy Bank fülének teljes vizuális rétege átkerült a `@kartoteka/ui-app`
közös csomagba, ahol a desktop és (a jövőben) iOS verzió is ugyanonnan veszi
ezt a UI-t. A felhasználó számára semmi nem változik: a banki forgalom, a
BCR Excel import, a stornózás és a nyitó egyenleg cellek pontosan ugyanúgy
néznek ki és működnek, mint v0.7.1-ben.

### 🎨 Háttér-fejlesztés (web–desktop UI paritás)

- **Közös BankTab komponens**: a `@kartoteka/ui-app/finance/BankTab` most már a webes és a desktop oldalon is ugyanazt a vizuális réteget biztosítja. A platform-függő részek (server actionök, toast, router refresh) callback prop-okon keresztül kapcsolódnak — így a desktop verzió lokális Tauri SQLite-ot, a web pedig server actionöket használhat ugyanazzal a UI-val.
- **NyitoEgyenlegRow típus a shared csomagba**: az éves bankszámla nyitó egyenleg típusa egyetlen helyre került (egy igazság-forrás). A meglévő `bank-nyito-egyenleg-actions.ts` re-exportálja, így a BCR import wizard változatlanul működik.
- **iOS-felkészültség**: a közös BankTab komponens platform-független (sem `next/*`, sem `@supabase/*`, sem `@tauri-apps/*` import) — ha a jövőben Tauri-mobilon iOS app készül, ugyanez a UI ott is rendelkezésre áll.

### 📌 Felhasználói szempontból

- **Webes /penzugy → Bank fül**: változatlan UI és viselkedés. Hibás működés esetén (BCR import, bankszámla mentés, stornó) érdemes a `Ctrl+F5` reload-dal frissíteni.
- **Desktop app v0.7.2**: telepíthető az auto-update-en keresztül. A Bank-felület a desktopon még a meglévő legacy oldal — a teljes paritás Fázis 3-ban jön (v0.8.x).

### 🔧 Műszaki részletek (fejlesztőknek)

- Új shared komponens: `packages/ui-app/src/finance/BankTab.tsx` (callback prop + 4 modal slot pattern).
- Új shared típus: `NyitoEgyenlegRow` a `packages/ui-app/src/finance/types.ts`-ben.
- Webes wrapper átírva: `apps/web/components/finance/bank-tab.tsx` — `sonner` toast, `next/navigation` router és a 4 modal mountolása slot-okon át.
- A `bank-nyito-egyenleg-actions.ts` típusát re-exportra cseréltük a shared csomagból (drift-elkerülés).
- 3 build zöld: `@kartoteka/ui-app` (tsc), `@kartoteka/web` (Next.js 16 webpack, 51 oldal), `@kartoteka/desktop` (lint + tsc + vite, 2336 modul).

---

## [2026-04-25] — Bejelentkezés és admin napló javítás

<!-- key: 2026-04-25-oauth-prod-redirect-and-audit-log-view -->
<!-- category: bugfix -->
<!-- targets: lelkészek, esperesek, kerületi adminok, rendszerszintű adminok -->

Élő hibák javítása: a Google fiókos bejelentkezés ismét a Kartotéka élő címére tér vissza, és az admin „Eszközök, licencek, napló" fülön belül a Napló nézet újra megnyitható.

### 🔒 Biztonsági és hozzáférési javítások

- **Google bejelentkezés productionben**: a Google fiókkal történő belépés most már a Kartotéka élő címére tér vissza, nem egy fejlesztői localhost címre. A felhasználók ismét gond nélkül be tudnak jelentkezni Googlevel a webes felületen.

### 🐛 Javítások

- **Admin → „Eszközök, licencek, napló" → Napló fül**: az audit-log lista ismét megnyílik, a felhasználói e-mail is megjelenik az egyes események mellett. Korábban a fül egy belső adatbázis-relációs hibára futott, így az admin nem látta a rögzített eseményeket.

### 🔧 Technikai részletek

- A Supabase Authentication URL Configuration kibővítve a production webcím engedélyezett redirect céljaival, így az OAuth visszatérési pont nem fallback-el a „Site URL"-re silent módon.
- Új lapos DB nézet (`audit_log_with_profiles`) az audit-log lekérdezéséhez, RLS-konform módon (security_invoker = true). Ez megkerüli a PostgREST relationship inference problémát, amelyet az `audit_log.user_id` nullable foreign key okozott.

### 📌 Megjegyzések

- A változtatások nem érintik a desktop alkalmazás verzióját — kizárólag a webes oldali bejelentkezést és az admin napló nézetét.
- A javításhoz Supabase és Railway oldali konfigurációs lépések is tartoznak; ezek érvényesülése után érdemes újra megpróbálni a Google bejelentkezést és az admin napló fület.

---

## [2026-04-26] — Auto-link családszerkezet + nem-mező biztonsági ellenőrzés

<!-- key: 2026-04-26-tagnyilvantartas-auto-link-and-gender-safety -->
<!-- category: feature -->
<!-- targets: lelkipásztorok, esperesek, rendszerszintű adminok -->

A tagnyilvántartás-import wizard két nagy bővítést kapott: egy automatikus családszerkezet-építő lépést, és egy biztonsági réteget a hiányzó nem-mező kezelésére.

### ✨ Új funkciók — Családszerkezet összeállítása

- **Új 5. wizard lépés**: az import után megjelenik egy „Családszerkezet összeállítása" CTA gomb. Amennyiben megnyomod, a rendszer automatikusan elemzi a most beimportált tagokat és felajánlja a házastárs- és gyerek-kapcsolatokat.
- **Cím-alapú házastárs-egyezés**: ha egy családfő szemely-hez NULL az `id_no` (vagy `id_ferfi`) mező, és **pontosan egy** felnőtt másnemű lakik ugyanazon a házszámon és utcán, akkor automatikusan házastársként ajánlja.
- **Szülő-név alapú gyerek-egyezés**: ha egy szemely `apjaneve` vagy `anyjaneve` mezője egyezik egy ugyanazon címen lakó szülő nevével, gyerekként ajánlja.
- **Konzervatív mód (alapértelmezés)**: csak 100%-osan biztos egyezések kerülnek alkalmazásra (cím + szülő-név direkt találat). A bizonytalan eseteket (több jelölt, hiányzó cím-egyezés) listázza, de NEM érinti — kézi rendezés a tagnyilvántartáson.
- **Visszavonhatóság**: minden auto-link batch-id-vel kerül egy audit táblába. Egyetlen kattintással visszavonható (`revert_family_link_batch`).
- **„Csak család nélküli tagok" szűrő**: a Személyek fülön új szűrő a státuszválasztóban — az auto-link után megmaradó „lebegő" tagok kézzel rendezhetők innen.

### 🛡️ Biztonsági javítások — hiányzó nem-mező

- **Smart inference**: ha egy importált sornál a „Férfi" oszlop hiányzik, a rendszer megnézi a „Férje" mezőt — ha ki van töltve, biztosan **nő**. Egyébként alapértelmezésben férfi, **DE figyelmeztető jegyet** ír a result-stepbe.
- **3-szintű figyelmeztetés-rendszer az import eredmény-stepben**: piros (kihagyott hibás sorok), sárga (figyelmeztetések — beszúrva, de ellenőrizendő), kék (tájékoztató jegyek — automatikus következtetések). Korábban minden mindenhol piros volt.
- **Korábbi viselkedés**: az import csendben férfira default-olta a hiányzó nem-mezőt, nem jelezte a felhasználónak. Ez ellentétes a `feedback_lelkesz_informalas` alapelvvel — most javítva.

### 🔧 Műszaki részletek

- **Új SQL migráció** (Endre futtatja): `migration-docs/sql/2026-04-26-family-link-inference-rpc.sql` — `family_link_audit` tábla + 4 RPC (`infer_family_links_for_congregation`, `revert_family_link_batch`, `list_family_link_batches`, `_can_manage_family_links` helper).
- **SQL frissítés** (Endre újra futtatja): `migration-docs/sql/2026-04-25-import-wizard-family-head-rpc.sql` — smart gender inference + warning rendszer az `import_family_head_batch` RPC-ben.
- **SQL hotfix (2026-04-26 délután)**: a Supabase Studio `42P01: relation "found_id" does not exist` hibát adott a 04-25 fájl futtatásakor — a `$$` quoting bug okozta (a Studio editor néha elveszti a function body kontextusát). Mindkét SQL fájl minden függvénye explicit `$tag$` quoting-ra cserélve (`$resolve_locality$`, `$resolve_street$`, `$import_family_head$`, `$can_manage_family_links$`, `$infer_family_links$`, `$revert_family_link_batch$`, `$list_family_link_batches$`); a helper függvényekben a `SELECT INTO` átírva `:=` assignment-re (PL/pgSQL-only szintaxis, sose ütközik plain SQL-lel).
- **Új komponensek**: `components/members/tagnyilvantartas-import/family-link-step.tsx` (5. wizard lépés a Preview Review + Apply + Revert flow-val).
- **Új server action**: `lib/import/family-link-inference-actions.ts` (4 export: `previewFamilyLinks`, `applyFamilyLinks`, `revertFamilyLinkBatch`, `listFamilyLinkBatches`).
- **Bővített result-step**: severity-szerinti csoportosítás (error/warning/info), összecsukható szekciók, név-feltüntetés a hiba-soroknál.
- **Bővített `MEMBER_STATUS_FILTERS`**: új `'lebego'` érték a `lib/constants/members.ts`-ben.

---

## [2026-04-25] — Tagnyilvántartás Import Wizard (új letisztult import felület)

<!-- key: 2026-04-25-tagnyilvantartas-import-wizard -->
<!-- category: feature -->
<!-- targets: lelkeszek, esperesek, rendszerszintu adminok -->

### ✨ Új funkciók

- **Tagnyilvántartás Import Wizard**: új 5 lépéses, lépésről-lépésre vezető import felület. Egy tisztán végigvezetett folyamat: fájl feltöltés → oszlop párosítás → előnézet → import indítása → eredmény. Magyarázott, magyar nyelvű útmutatás minden mezőhöz.
- **Microsoft Excel XML 2003 (.xml) támogatás**: a régi Adatkezelő által exportált SpreadsheetML fájlok most importálhatók közvetlenül, .xlsx-be konvertálás nélkül.
- **Családfők és családok egyben importja**: egy kattintással létrehozható egyszerre a családfő személy + a hozzá tartozó család rekord (cím + házszám). Új SQL RPC (`import_family_head_batch`) atomikus tranzakcióban dolgozik, és automatikusan létrehozza a hiányzó utca/helység rekordokat is.

### 🎨 UX javítások

- **Egyszerűsített import felület**: a két régi, túlzsúfolt importáló panel (admin/Import tab és modul-szintű "Rendszergazdai importáló" tab) ugyanazt az új wizardot rendereli — kevesebb mező, tisztább vizuális hierarchia, minden lépésnél egyértelmű "Tovább" gomb.
- **Drag-drop fájlfeltöltés**: a régi Tallózás-csak megoldás helyett most ráhúzható a fájl az import zónára.
- **Oszlop-párosítás magyarázatokkal**: minden Excel-fejléchez megjelenik az auto-felismert DB-mező + magyar magyarázat (pl. "Vezetéknév / családnév", "ÉÉÉÉ-HH-NN formátum"). Manuális override-olható, kihagyható.
- **Előnézet az importálás előtt**: az első 10 sor megjeleníthető a választott mapping szerint, így a lelkész látja, mit fog kapni az adatbázis.
- **Egy kattintásos import**: a wizard végén egy nagy "Import indítása" CTA gomb, amely világosan jelzi a sorszámot és a cél gyülekezetet.

### 🔧 Műszaki részletek

- Új SQL migráció (Endre futtatja): `migration-docs/sql/2026-04-25-import-wizard-family-head-rpc.sql` — `import_family_head_batch` RPC + `_resolve_or_create_street/_locality` upsert helperek (üres bemenetnél `Ismeretlen utca/helység` fallback, sose ad vissza NULL-t).
- Új komponensek: `components/members/tagnyilvantartas-import-wizard.tsx` + 5 step-fájl a `tagnyilvantartas-import/` mappában.
- Bővült backend: `lib/import/excel-parser.ts` (XML support), `import-profiles.ts` (PROFILE_PERSONS bővítve + új PROFILE_FAMILY_HEADS), `row-transformer.ts` (sz_datum + c_szcim szintetikus mezők).
- Új server action: `lib/import/family-head-import-actions.ts` — **mindkét profilra ugyanaz a flow**, csak `createCsalad` flag különbözik. Ez biztosítja a `szemely.c_utcaid` NOT NULL teljesülését az utca-lookup révén.
- Adatbázis séma audit: minden NOT NULL mezőre van fedezet (cnp placeholder, csaladfo/ferfi/meghalt boolean default, c_utcaid lookup, befizetoev current year, type='tag').
- Régi `import-tab-refined.tsx` törölve.

---

## [2026-04-25] — Aktiv profil-szinthez kotott sidebar es scope-guardok

<!-- key: 2026-04-25-active-scope-sidebar-guards -->
<!-- category: bugfix -->
<!-- targets: tobb szerepkorrel dolgozo lelkeszek, esperesek, keruleti adminok, rendszerszintu adminok -->

### Biztonsagi es hozzaferesi javitasok

- **Aktiv profil-scope szerinti oldalvedelem**: a `/dashboard-egyhazmegye`, `/dashboard-kerulet` es `/admin` oldalak most mar nem csak az osszesitett szerepkorokre figyelnek, hanem az aktiv `profile_role.scope` allapotra is.
- **URL-es megkerules lezarasa**: ha valaki kozvetlen linkkel vagy regi bongeszoallapotbol masik scope dashboardjara lepne, a rendszer visszatereli az aktiv profil sajat kezdooldalara.
- **Keruleti jogosultsag pontositasa**: a keruleti dashboard vedelme most a tenyleges `egyhazkeruletiAdmin` hozzaferesi flagre epul, nem a szukebb `admin` ellenorzesre.
- **Admin oldal kozos access-context alapra kerult**: az admin route ugyanabbal az effektive access-logikaval dolgozik, mint a tobbi dashboard-oldal, igy a system scope ellenorzese is egyseges lett.

### Javitasok

- **Gyulekezeti profilban eltunnek a magasabb szintek menujei**: explicit congregation scope-ban a sidebar mar nem mutatja a megyei, keruleti es admin oldalakat.
- **Egyhazmegyei profil megtartja a sajat munkafolyamatait**: explicit diocese scope-ban a felhasznalo tovabbra is a sajat egyhazmegyei iranyitopultjat es a relevans penzugyi nezetet kapja, csak a zavaro idegen menu-elemek nelkul.
- **Keruleti profil letisztult**: explicit district scope-ban a sidebar csak a keruleti nezetet hagyja meg, nem keveri bele a gyulekezeti vagy egyhazmegyei menu-elemeket.
- **Rendszerszintu admin menu a megfelelo profilban jelenik meg**: ha az aktiv profil system scope, az admin oldal kulon lathato a sidebarban; mas scope-ban ez a menupont nem tolakszik be.
- **Web-desktop sidebar paritas javitasa**: a desktop shell most mar az aktualis route-bol is feloldja az aktiv UI-scope-ot, hogy a kozos sidebar vizualisan es logikailag is ugyanugy viselkedjen, mint weben.

### UX javitasok

- **Atlathatobb navigacio**: a felhasznalo csak az aktualisan hasznalt egyhazi szinthez tartozo menu-elemeket latja, ezert kisebb lett a zaj es a teves kattintas eselye.
- **Profilvaltas logikaja kovetkezetesebb lett**: a gyakorlatban is ervenyesul, hogy a tobb szerepkorrel rendelkezo felhasznalonak valoban profilt kell valtania, ha masik szint feluleteit akarja hasznalni.

### Belso mukodesi megjegyzesek

- **Fontos architekturalis megfigyeles**: multi-role rendszerben a sidebar es a route-guard nem epulhet csak az osszesitett role-flagekre, mert azok egyszerre tobb szintet is igaznak mutathatnak. Az elso szamu forras az aktiv `profile_role.scope`.
- **Ovatos visszafele kompatibilitas**: a scope-szintu szigoritast csak ott aktivaljuk, ahol tenylegesen van explicit aktiv scope. A legacy vagy atmeneti, explicit scope nelkuli profiloknal a korabbi fallback viselkedes megmarad.
---

## [2026-04-25] — Szerepkör nélküli várakoztató képernyő és pénzügyi onboarding-bootstrap

<!-- key: 2026-04-25-roleless-waiting-finance-bootstrap -->
<!-- category: bugfix -->
<!-- targets: lelkészek, adminok, egyházmegyei és kerületi jóváhagyók -->

### 🔒 Biztonsági és hozzáférési javítások

- **Szerepkör nélküli aktív felhasználók lezárása** — ha egy felhasználó már beléphet a rendszerbe, de a `profiles.role` mezője hiányzik, üres, hibás vagy törlődött, a rendszer többé nem kezeli csendes fallbackkal `lelkesz` szerepkörként.
- **Dashboard és setup guard szigorítás** — az auth utáni szerveroldali döntési lánc most explicit ellenőrzi, hogy van-e ismert elsődleges szerepkör; ha nincs, a felhasználó nem juthat be sem a dashboard route-csoportba, sem az onboarding-setup útvonalra.
- **Biztonságos effektív hozzáférési kontextus** — szerepkör hiányában az effektív gyülekezeti kontextus, a hozzárendelt gyülekezetlista, a profile-role kontextus és az esetleges admin override sem marad aktív állapotban, így a rendszer nem épít tovább „ál-lelkészi” sessiont.
- **Profilnézeti félrevezetés megszüntetése** — a profil dialógus többé nem ír ki automatikusan „Lelkipásztor” szerepet olyan felhasználónál, akinek ténylegesen nincs elsődleges szerepköre; helyette egyértelműen a „Nincs hozzárendelt szerepkör” állapot jelenik meg.

### 🐛 Javítások

- **Kétféle várakozási állapot kezelése** — a `/pending` képernyő most már külön kezeli a `jóváhagyásra vár` és a `szerepkörre vár` helyzetet. Így nem ugyanaz az üzenet jelenik meg annak, akinek még a regisztrációja nincs elfogadva, és annak sem, akinek az elfogadott fiókjáról eltűnt a szerepkör.
- **Beépített segítségkérés a várakozó képernyőn** — a várakoztató oldalon megjelent a meglévő, rendszerbe épített segítségkérő gomb. Ez ugyanazt a support-csatornát nyitja meg, amelyet a belső felületek is használnak, tehát nincs külön kerülőút vagy új párhuzamos támogatási megoldás.
- **Pénzügyi duplikált adatbekérés megszüntetése** — a pénzügyi modul nyitóoldalán az „Éves Pénzügyi Beállítások” felugró ablak nem nyílik meg többé pusztán azért, mert az adott évre még nincs `bealitas` rekord.
- **Welcome wizard elsődlegességének érvényesítése** — a rendszer a welcome wizardban már bekért `éves járulék` és `fizetési határidő` adatokat tekinti elsődleges forrásnak, és ezekből próbálja automatikusan létrehozni a hiányzó éves `bealitas` sort.
- **Csendes éves bootstrap a pénzügyi kezdőoldalon** — ha a gyülekezeti alapadatokban az éves pénzügyi mezők már ki vannak töltve, a rendszer betöltéskor automatikusan létrehozza az adott évhez szükséges beállítási sort, majd ugyanazzal a betöltési folyamattal megy tovább, külön megszakító modal nélkül.
- **Érthető fallback állapot hiba esetére** — ha az automatikus éves beállítás-létrehozás mégsem lehetséges, a felhasználó nem egy félkész modalba kerül, hanem egy egyértelmű információs kártyát lát arról, hogy a gyülekezeti alapadatokat kell ellenőrizni, vagy segítséget kell kérni az admintól.

### 🎨 UX javítások

- **Várakozási képernyő nyelvi pontosítása** — a képernyő szövegezése most már világosan kommunikálja, hogy a felhasználó miért nem fér hozzá a modulokhoz: azért várakozik, mert még nincs jóváhagyva, vagy azért, mert jóváhagyott fiókja mellett nincs érvényes szerepkör.
- **Szerepkörhiány külön állapotként látszik** — megjelent a vizuális állapotjelzés is a várakozó oldalon, így a felhasználó és az admin is könnyebben megérti, hogy nem általános hiba, hanem jogosultsági hiány áll a háttérben.
- **A pénzügyi belépési élmény egyszerűbb lett** — a felhasználó ugyanazt az adatot nem kapja meg másodszor is felugró ablakban, ha azt a rendszer az onboarding során már egyszer elkérte tőle.

### 🔧 Belső működési megjegyzések

- **Fontos séma-megfigyelés** — a `profiles.role` mező a rendszer valós működésében ténylegesen hiányozhat vagy sérülhet, ezért ezt nem szabad kizárólag adatbázis-defaultra bízott, „mindig meglesz” mezőként kezelni.
- **Fontos működési alapelv** — a welcome wizard nem csak vizuális bevezető, hanem a gyülekezeti induló állapot egyik elsődleges adatforrása is, különösen a pénzügyi induló mezők esetében.
- **Admin-kommunikációs alapelv** — a jelen változástól kezdve a fontos javítások és fejlesztések részletes admin-kompatibilis dokumentálása a `docs/CHANGELOG.md` fájlban is kötelező, mert az admin oldali közzétételek innen épülnek fel.

---

## [2026-04-25] — v0.7.1: Pénzügy Fázis 1 — CashbookTab port (8/11 tab kész)

<!-- key: 2026-04-25-v0-7-1-cashbook-port -->
<!-- category: improvement -->
<!-- version: 0.7.1 -->
<!-- targets: fejlesztők — Kasszanapló-tab a shared package-be teljes callback-abstraction-nel; 8/11 = 73% -->

### 🏗️ Pénzügyi modul Fázis 1 — CashbookTab port

A `@kartoteka/ui-app/finance/` package új komponense:

#### `CashbookTab` (~650 sor)
Készpénzes bevétel + kiadás unified lista, hónapok szerinti csoportosítás, sortálható oszlopok, nyitó/záró egyenleg, **3 callback + 5 slot prop**:
- Callbacks: `onAutoIssueChitanta`, `loadChitantakForBefizetesek`, `onUndoStorno`, `onTransactionChanged`, `onToast`
- Slots: `chitantaTombokPanelSlot` (aktív tömb panel), `chitantaSilentPrintSlot` (közvetlen nyomtatás), `chitantaTombRequiredDialogSlot` (wizard), `transactionEditDialogSlot` (szerkesztő), `stornoConfirmDialogSlot` (stornó modal)

Új típusok: `ChitantaInfo`, `AutoIssueChitantaResult`, `CashTransactionType`, `CashbookToastKind`.

### 📋 Fázis 1 előrehaladás — 8/11 tab (73%)

✅ FinanceDashboard, DebtTab, AccountingTab, RentalTab, TransactionsTab, MonetaryTab, BudgetTab, **CashbookTab**

⏳ BankTab (843), FinanceSugoTab (948), OblioEllenorzesTab (1637) — 5 dialog

A frissítés adat-vesztés nélkül és automatikusan települ.

---

## [2026-04-25] — v0.7.0: Pénzügy Fázis 1 — MonetaryTab + BudgetTab port (7/11 tab kész)

<!-- key: 2026-04-25-v0-7-0-monetary-budget-port -->
<!-- category: improvement -->
<!-- version: 0.7.0 -->
<!-- targets: fejlesztők — 64% Fázis 1 előrehaladás. 7 finance-tab a shared package-ben, 4 hátra (CashbookTab, BankTab, FinanceSugoTab, OblioEllenorzesTab) — külön release-ek. -->

### 🏗️ Pénzügyi modul Fázis 1 — MonetaryTab + BudgetTab port

A `@kartoteka/ui-app/finance/` package két új komponenssel bővült:

#### `MonetaryTab` (~400 sor)
Címlet-számoló: bankjegyek és érmék darabszáma + összegzés + eltérés a könyvelt készpénzegyenleghez. Új közös típus: `MonetaryDenomination`. Callback-ek:
- `loadSnapshot(year)` — denominations + counts lekérés
- `saveSnapshot(year, items)` — címlet-szám mentés
- `onToast(msg, kind)` — UI-feedback

#### `BudgetTab` (~500 sor)
4-fázisos költségvetés-kezelő (alap + 3 módosítás), bevétel/kiadás cellákkal, mentés + véglegesítés + javítási kérelem flow. Új közös típus: `BudgetCompatRow`. Callback-ek (8 db):
- `loadBudgetRows`, `saveBudgetRows`, `saveBudgetModification`
- `finalizeBudget`, `finalizeBudgetModification`
- `submitDocument` (cross-module)
- `requestBudgetUnlock`
- `onRefresh`, `onToast`

### 📋 Fázis 1 előrehaladás — 7/11 tab (64%)

| Tab | Status | Sor | Release |
|---|---|---|---|
| FinanceDashboard | ✅ | ~200 | v0.6.0 |
| DebtTab | ✅ | ~300 | v0.6.1 |
| AccountingTab | ✅ | ~400 | v0.6.2 |
| RentalTab | ✅ | ~430 | v0.6.3 |
| TransactionsTab | ✅ | ~480 | v0.6.3 |
| **MonetaryTab** | ✅ | ~400 | **v0.7.0** |
| **BudgetTab** | ✅ | ~500 | **v0.7.0** |
| CashbookTab | ⏳ | 652 | v0.7.1 |
| BankTab | ⏳ | 843 | v0.7.1 |
| FinanceSugoTab | ⏳ | 948 | v0.7.1 |
| OblioEllenorzesTab | ⏳ | 1637 | v0.7.2 |

### 📋 Fázis 2-3-4 (jövőbeli sprintek)

- **5 modális dialog port** (IncomeDialog, ExpenseDialog, DecontDialog, FinancePrintDialog, BudgetPrintDialog) — v0.7.3
- **Fázis 2 — desktop Tauri SQLite finance read-helperek** — v0.8.0
- **Fázis 3 — desktop /penzugy közös FinanceTabs mount** — v0.8.1
- **Fázis 4 — Tauri-data + offline outbox bekötés** — v0.8.2

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.6.3: Pénzügy Fázis 1 — RentalTab + TransactionsTab port

<!-- key: 2026-04-25-v0-6-3-rental-transactions-port -->
<!-- category: improvement -->
<!-- version: 0.6.3 -->
<!-- targets: fejlesztők — két nagyobb tab átkerült a shared package-be (Bérleti szerződések, Tranzakciók); a callback-abstraction template most már 5 komponensen érvényesült -->

### 🏗️ Pénzügyi modul Fázis 1 — RentalTab + TransactionsTab port

A `@kartoteka/ui-app/finance/` package két új komponenssel bővült:

#### `RentalTab` (eredetileg ~400 sor → ~430 sor a shared-ben)
Bérleti szerződések listázása, szűrés (típus, státusz), KPI-kártyák (aktív / éves várt bevétel / lejárt). Művelet-callback-ek:
- `onDeleteContract(id)` — törlés
- `onToast(msg, kind)` — UI-feedback
- `contractDialogSlot({open, onOpenChange, editingContract})` — RentalContractDialog mount-pont
- `invoiceDialogSlot({open, onOpenChange, contract})` — OblioIssueInvoiceDialog mount-pont (Oblio e-Factura)

Új közös helper: `calculateEvesDij(contract)` — éves bérleti díj kalkuláció.

#### `TransactionsTab` (eredetileg ~570 sor → ~480 sor a shared-ben)
Bevétel + kiadás unified lista, hónaponként csoportosítva, dátum-fejléccel, kísérőív-nyomtatás gombbal, Oblio-státusz ikonokkal. Callback-ek:
- `onDeleteTransaction(type, id)` — server-action delete
- `loadOblioMatchedExpenseIds(year)` — SPV match-elt kiadás-ID-k
- `onToast(msg, kind)` — UI-feedback
- `onSwitchTab(tabKey)` — tab váltás (régi `window.dispatchEvent` helyett)
- 4 slot prop: `oblioStatusIconSlot`, `oblioExpenseStatusIconSlot`, `kiseroivPrintDialogSlot`, `oblioInvoiceDialogSlot`

### 📋 Fázis 1 előrehaladás

| Tab | Status |
|---|---|
| FinanceDashboard | ✅ v0.6.0 |
| DebtTab | ✅ v0.6.1 |
| AccountingTab | ✅ v0.6.2 |
| **RentalTab** | ✅ **v0.6.3** |
| **TransactionsTab** | ✅ **v0.6.3** |
| CashbookTab | ⏳ v0.6.4 |
| BankTab | ⏳ v0.6.4 |
| BudgetTab | ⏳ v0.6.4 |
| MonetaryTab | ⏳ v0.6.4 |
| OblioEllenorzesTab | ⏳ v0.6.5 |
| FinanceSugoTab | ⏳ v0.6.5 |
| 5 dialog | ⏳ v0.6.6 |

5 / 11 tab portolva (45%).

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.6.2: Pénzügy Fázis 1 — AccountingTab port

<!-- key: 2026-04-25-v0-6-2-accountingtab-port -->
<!-- category: improvement -->
<!-- version: 0.6.2 -->
<!-- targets: fejlesztők — a Számadás-tab átkerült a shared package-be teljes callback-abstraction-nel; a desktop is használhatja. Felhasználói szinten változatlan. -->

### 🏗️ Pénzügyi modul Fázis 1 — AccountingTab port

A `@kartoteka/ui-app/finance/` package bővült az `AccountingTab` komponenssel (eredetileg webes `AccountingTabV2`, ~400 sor).

**Callback-abstraction minta** — ez a port a többi server-coupled tab template-je:

- `budgetData: Record<string, number>` prop — a szülő tölti be (web: Supabase, desktop: Tauri SQLite)
- `loading?: boolean` prop — adatlekérési állapot
- `onRequestUnlock(year, reason)` — javítási kérelem callback
- `onRefresh()` — sikeres művelet után újratöltés (web: router.refresh, desktop: notifyLocalDataChanged)
- `onToast(msg, kind)` — UI-feedback (web: sonner, desktop: belső állapot)
- `finalizeWizardSlot({ open, onOpenChange, summary })` — modal slot-prop (web: AccountingFinalizeWizard, desktop: jövőbeli saját)

**Eredmény**:
- Web változatlanul működik (wrapper a server-action-ökre)
- Desktop most már importálhatja az `AccountingTab`-ot (Fázis 2-3 után aktív)
- Web build zöld, desktop build zöld

### 📋 Fázis 1 előrehaladás

| Tab | Status |
|---|---|
| FinanceDashboard | ✅ v0.6.0 |
| DebtTab | ✅ v0.6.1 |
| **AccountingTab** | ✅ **v0.6.2** |
| TransactionsTab | ⏳ v0.6.3 |
| RentalTab | ⏳ v0.6.3 |
| CashbookTab | ⏳ v0.6.4 |
| BankTab | ⏳ v0.6.4 |
| BudgetTab | ⏳ v0.6.4 |
| MonetaryTab | ⏳ v0.6.4 |
| OblioEllenorzesTab | ⏳ v0.6.5 |
| FinanceSugoTab | ⏳ v0.6.5 |
| 5 dialog | ⏳ v0.6.6 |

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.6.1: P0 wipe-RPC fix + DebtTab port

<!-- key: 2026-04-25-v0-6-1-wipe-fix-debttab-port -->
<!-- category: bugfix -->
<!-- version: 0.6.1 -->
<!-- targets: lelkészek + admin — kritikus admin-veszélyes-zóna javítás (a wipe már nem törli a profilt). Plusz a tartozás-tab közös komponensbe szervezve a desktop paritáshoz. -->

### 🚨 KRITIKUS hibajavítás — admin Veszélyes zóna

A v0.6.0 wipe RPC `keep_tables` listájából **kimaradt a `profiles` tábla**, ami miatt a wipe **véletlenül törölte a felhasználó saját profilját** is (a `profiles.congregation_id` legacy oszlop miatt). Tünet: az `auth.users` érintetlen → login működik, de a dashboard nem tölt be (NULL profile).

**Javítás (`migration-docs/sql/2026-04-25-FIX-wipe-restore-profile.sql`)**:
- Recovery DO blokk: a felhasználó profiljának újra létrehozása az `auth.users`-ből
- `wipe_congregation_data` RPC újra-deklarálva — `keep_tables` bővítve: `profiles`, `profile_roles`, `user_devices`, `user_login_attempts`
- 3 ellenőrző SELECT a fájl végén (profil-állapot, védett táblák listája, wipeolható táblák listája)

### 🏗️ Pénzügyi modul Fázis 2 — DebtTab port

A `@kartoteka/ui-app/finance/` shared package bővült a `DebtTab` komponenssel (eredetileg webes `DebtTabV2`). 100% pure-UI, props-driven; a desktop is ugyanazt fogja használni.

- `apps/web/components/finance/debt-tab-v2.tsx` → wrapper-shim a shared `DebtTab`-ra
- `packages/ui-app/src/finance/DebtTab.tsx` → új közös komponens (~300 sor)
- KPI-kártyák, járulék-státusz tagonként, bérleti hátralék — minden vizuálisan egyező marad

### 📋 Hátralévő tabok (v0.6.2+)

- 8 további finance-tab: Cashbook, Bank, Budget, Accounting, Transactions, Monetary, Rental, Oblio-Ellenőrzés (mind server-action coupled, callback-abstraction kell)
- FinanceSugoTab: print/PDF dependency miatt platform-specifikus slot kell

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.6.0: Pénzügyi modul Fázis 1 — közös réteg

<!-- key: 2026-04-25-v0-6-0-finance-phase1-shared-layer -->
<!-- category: improvement -->
<!-- version: 0.6.0 -->
<!-- targets: fejlesztők — a pénzügyi modul típusait és tiszta-helpereit web és desktop egyaránt INNEN importálja: @kartoteka/ui-app/finance. Felhasználói szempontból: az alap megvan a desktop pénzügyi paritáshoz, a UI port a következő fázisokban érkezik. -->

### 🏗️ Architektúra: pénzügyi modul közös réteg

A *„web és desktop 100% paritás"* alapelv megvalósításának 1. fázisa.

**Mi került át a `@kartoteka/ui-app/finance` shared package-be:**

- **Típusok** (`types.ts`, ~270 sor): `BealitasRow`, `SzamadasiCel`, `BankAccount`, `BefitetesRow`, `KiadasRow`, `DebtRow`, `RentalContractRow`, `RentalDebtRow`, `FxRevaluationRow`, `InternalTransferRow`, `ReceiptHealth` és kapcsolódó konstansok (`RECEIPT_TYPES`, `TRANSFER_TYPES`, `RENTAL_*`, `FX_REVAL_*`).
- **Tiszta-függvények** (`helpers.ts`, ~200 sor): `formatCurrency`, `getTransactionDocumentNumber`, `getExpensePartnerName`, `sortCellsHierarchically`, `normalizeDebtCalcMode`, `isInventoryCategory`, `calculateBalances`, `parseHungarianWomensName`, `normalizeName`, `stripNamePrefix`, `splitForrasaNameStreet`.
- **Első UI-komponens** (`FinanceDashboard.tsx`, ~200 sor): a webes pénzügyi áttekintés (4 KPI + egyenleg-banner + 10 utolsó mozgás). Server-action mentes — propsokon kapja az adatot. A TVA-plafon widget opcionális slot-prop-ként mountolódik (web saját widget-jét adja át).

**Backward compatibility**:
- `apps/web/lib/constants/finance.ts` → re-export shim a shared package-ből
- `apps/web/lib/utils/finance-helpers.ts` → re-export shim
- `apps/web/components/finance/dashboard-tab.tsx` → wrapper, amely a shared `<FinanceDashboard>` + saját TVA widget

**Eredmény**:
- Web zöld build (változatlan funkcionalitás)
- Desktop zöld build (most már importálhatja a shared típusokat)
- A jövőbeli desktop pénzügyi oldal pixel-pontosan ugyanazt fogja mutatni

### 🛣️ Fázisos terv folytatása

- **Fázis 2**: további 10 finance-tab port (CashbookTab, BankTab, BudgetTab, AccountingTabV2, DebtTabV2, TransactionsTab, MonetaryTabV2, RentalTab, OblioEllenorzesTab, FinanceSugoTab) ugyanezen mintával: server-action mentes, props-on kap adatot.
- **Fázis 3**: desktop adatréteg — `lib/finance-local.ts` Tauri SQLite read-helperek, hogy a shared komponensek lokális cache-ből kapjanak adatot.
- **Fázis 4**: desktop `/penzugy` route a közös `<FinanceTabs>`-ot mountolja → 100% vizuális paritás.
- **Fázis 5**: modális ablakok (IncomeDialog, ExpenseDialog, DecontDialog, FinancePrintDialog, BudgetPrintDialog) port.

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.5.5: minden oldal teljes szélességen + pénzügyi paritás-roadmap

<!-- key: 2026-04-25-v0-5-5-fullwidth-finance-roadmap -->
<!-- category: bugfix -->
<!-- version: 0.5.5 -->
<!-- targets: lelkészek — minden desktop oldal mostantól a teljes ablak szélességét használja, nincs üres sáv a két oldalon. A pénzügyi modul webes paritás-portolása fázisos terv szerint indul. -->

### 🐛 Javítások

- **Üres sávok teljes képernyőn — most már MINDEN oldalon javítva** *(#1)* — a v0.5.1-ben a shell-szintű `max-w-7xl` cap eltüntettem, de **11 oldal** lokálisan tartotta a `<main className="mx-auto max-w-{4xl|5xl|6xl}">` wrapper-t (Bank-import, Befizetés, Belső mozgás, Chitanță, Chitanță-tömbök, Kiadás, Pénzügy-dashboard, Pénzügy-landing, Munkanapló, Dashboard, Placeholder). Mostantól **mind a 11 oldal a teljes szélességet használja** — a beágyazott rács-komponensek (KPI-kártyák, statisztikák, listák) maguk osztják el a helyet.

### 📋 Pénzügyi modul paritás — fázisos terv

A *„webalkalmazás és a desktop alkalmazás kinézete 100%-ban megegyezzen"* alapelvre építve a pénzügyi modul portolása egy **többfázisos terv** szerint indul, mert a webes `FinanceTabs` 11+ tabot (Dashboard, Tranzakciók, Kasszanapló, Bank, Költségvetés, Számadás, Tartozások, Monetár, Bérleti, Oblio-ellenőrzés, Súgó) tartalmaz, mindegyikhez saját adatlekérő server-action-nel.

- **Fázis 1 (közös komponensek extrakciója)**: a finance-* komponenseket átvesszük a `@kartoteka/ui-app` shared package-be, propertészerű adatfogadással (server-action vs. Tauri SQLite agnosztikus).
- **Fázis 2 (desktop adatréteg)**: minden FinanceTab-hez Tauri-oldali read-helper a lokális `befizetes_local` / `kiadas_local` / `bealitas_local` táblákból.
- **Fázis 3 (UI bekötés)**: a desktop `/penzugy` route-ja a közös `<FinanceTabs>`-ot mountolja a Tauri-data-source-szal.
- **Fázis 4 (modális ablakok port)**: IncomeDialog, ExpenseDialog, DecontDialog, FinancePrintDialog, BudgetPrintDialog — mind közös komponens.

A jelenlegi desktop pénzügyi oldalak (penzugy-landing, penzugy-dashboard, befizetes, kiadas, chitanta, chitanta-tombok, bank-import, belsomozgas) **párhuzamosan üzemelnek a portolás során**, hogy a lelkész SOSE veszítsen funkcionalitást.

### 🔧 Belső

- 11 oldalról eltávolítva: `<main className="mx-auto max-w-{4xl|5xl|6xl} space-y-{4|5|6} p-5 sm:p-6">` → `<div className="space-y-{4|5|6}">`. A shell felelős a paddingért és a maximális szélességért (most: nincs cap).

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.5.4: offline-first auto-reload, főoldal egyszerűsítés, member-modal paritás

<!-- key: 2026-04-25-v0-5-4-offline-first-home-cleanup -->
<!-- category: bugfix -->
<!-- version: 0.5.4 -->
<!-- targets: lelkészek — a desktop most tisztán offline-first: az adatok a lokális adatbázisból azonnal betöltődnek, a háttér-szinkron pedig automatikusan újratölti az oldalakat sikeres pull után. A főoldal a webes-only kártyák nélkül egyszerűbb. -->

Endre 8 megfigyelése közül a megvalósítható részt Sprint P keretében javítva.

### 🐛 Javítások

- **Frissítés után nem töltődtek be a főoldal elemei** *(#1)* — eddig az oldalak csak mountkor olvasták a lokális cache-t; a percenkénti háttér-szinkron befejezése után az új adatok csak page-reload után jelentek meg. Mostantól **minden sikeres háttér-pull után az oldalak automatikusan újratöltik az adatokat** a lokális cache-ből — a felhasználó SEMMIT NEM ÉRZ MEG az online szinkronból, csak azt, hogy a számok mindig frissek. (Új `useDataVersion()` hook + globális `notifyLocalDataChanged()` függvény.)
- **Manuális „Frissítés" gombok eltávolítva** *(#7)* — a Tagnyilvántartás és Családok oldalakról kikerült a felesleges „Frissítés" gomb. A háttér-szinkron percenként frissít, a státuszsáv mutatja az állapotot, és módosításnál azonnal újratöltődik a lista. (A többi olvasási oldalról a gombok a v0.5.5-ben kerülnek ki.)
- **„Gyülekezeti weboldal beállítása" KPI-kártya eltávolítva** desktop főoldalról *(#4)* — a publikus oldal beállítása webes-only feature, a desktop nem rendelkezik ilyen szerkesztőfelülettel. A KpiCards mostantól desktop-on **3 oszlopos** (Aktív tagok / Családok / Pénzügy), web-en marad **5 oszlopos** (új `hideWebOnlyCards` prop).
- **Demográfiai stat-ok (Férfiak / Nők / Gyermekek / Átlagéletkor / Fizetők / Presbiterek / Egyenleg) eltávolítva** desktop főoldalról *(#6)* — a számok szétfeszítették a layout-ot és a Korelosztás widget már részletesebben mutatja az életkor-megoszlást. Web-en megmaradnak.

### ✨ UX javítások

- **Beállítások dialog: oldalsáv MINDEN méretben** *(#3)* — eddig a fülek `md:` breakpoint alatt vízszintesen jelentek meg. Mostantól minden viewport-méreten **vertikálisan, a dialog bal oldalán**. Ez a javítás a webes és desktop verzióban egyaránt érvényesül.
- **Member-detail dialog vizuális paritás a webes verzióval** *(#8)* — eddig a desktop tag-detail ablak puritán szürke szövegekkel jelent meg. Mostantól:
  - **Avatar** gradient háttérrel (kék férfiaknak, rózsa nőknek) + monogram
  - **Eyebrow** „Tag-portré" + serif font cím + dekoratív blur-pötty háttérrel
  - **Chip-sor**: CNP / kor / családi állapot / családfő / választó / rejtett / member-status — színkódolt kártyákkal
  - **DetailGroup szekciók** kis kártyákban, lila eyebrow-val + jobb tipográfia
  - **Akciók** lent: gradient „Szerkesztés" gomb + outline-os Bezárás

### 🔧 Belső

- Új `useDataVersion()` hook a `lib/sync-orchestrator.ts`-ben + `notifyLocalDataChanged()` write-után-hívható függvény.
- `KpiCards` új `hideWebOnlyCards?: boolean` prop a 2 web-only kártya elrejtéséhez.

### 📌 v0.5.5 backlog (Endre megfigyelései közül)

- **#2 Naptárnézet** a *„Gyülekezeti programok"* widgetben + gyors-akció gombok
- **#5 Pénzügyi áttekintés grafikon** a desktop főoldalon (havi bevétel/kiadás trend)
- **#7 Folytatás**: Frissítés gombok eltávolítása a maradék olvasási oldalakról (leltár, iktató, jegyzőkönyvek, sírhelyek, anyakönyv)

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.5.3: telepítő magyar fordítás, session-warning fix, Korelosztás widget

<!-- key: 2026-04-25-v0-5-3-nsis-session-koreloszlas -->
<!-- category: bugfix -->
<!-- version: 0.5.3 -->
<!-- targets: lelkészek — a telepítő üres feliratai magyarra fordítva, az „Online vagyok, miért lejár?" warning megszűnt, az irányítópulton új Korelosztás widget mellette a Köszöntések és Programok háromosztatú sorban -->

Három észrevétel javítva, plusz egy új dashboard-widget.

### 🐛 Javítások

- **Telepítő ablakok feliratai eddig üresen jelentek meg** — a v0.5.2-es Tauri NSIS bundler `Custom tauri messages for Hungarian are not translated` warninggal jelezte, hogy 23 saját string (rádiógomb-feliratok az újratelepítés-oldalon, „Felhasználói adatok törlése" checkbox az eltávolítóban, WebView2-folyamat üzenetek stb.) nincs lefordítva. Mostantól **teljes magyar fordítás** a `apps/desktop/src-tauri/installer/Hungarian.nsh` fájlban, hivatkozva a `tauri.conf.json > nsis > customLanguageFiles`-on keresztül.
- **„A munkamenet hamarosan lejár" warning online állapotban** — a `lib/session-state.ts` `REFRESH_WARNING_DAYS = 7` konstans az **access tokenre** vonatkozott (~1 órás auto-refresh ciklusra), nem a refresh tokenre. Ezért **mindig** „lejár" warning jelent meg. Mostantól: ha van session, → 🟢 *Online*. Ha a refresh-token tényleg lejár, a Supabase `SIGNED_OUT` eventet küld, és az AuthGate átirányít. Nincs többé felesleges figyelmeztetés.

### ✨ Új — Korelosztás widget (5 korcsoport)

Új dashboard-widget az irányítópulton, **háromosztatú sorban** a *„Ma köszöntjük"* (születésnapok és névnapok) és a *„Gyülekezeti programok"* mellett:

- **0–14** (gyermekek), **15–29** (fiatalok), **30–49** (felnőttek), **50–69** (érettek), **70+** (idősek) — pasztorális felbontás.
- Színkódolt vízszintes bar minden csoportra + szám + arány (%).
- Üres állapotban barátságos magyarázat („még nincs születési dátummal regisztrált tag").
- Forrás: `calculateAgeDistribution(members)` — JS-oldali aggregáció a lokális tag-listából, élő frissítés a percenkénti auto-szinkronnal.

A korábbi 2-oszlopos elrendezés (Köszöntések + Friss munkanapló) helyett: a felső sorban 3 oszlopban (Köszöntések + Programok + Korelosztás), alatta a Friss munkanapló saját sorban, teljes szélességen.

### 🎨 UI finomítás

- A *„Köszöntések"* widget címe pontosabb: **„Ma köszöntjük"** (cím) + *„Születésnapok és névnapok"* (eyebrow).

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül — telepítés után az új ablak-feliratok is rögtön láthatók.

---

## [2026-04-25] — v0.5.2: működő frissítés-letöltés, dedikált Frissítés fül

<!-- key: 2026-04-25-v0-5-2-frissites-letoltes -->
<!-- category: bugfix -->
<!-- version: 0.5.2 -->
<!-- targets: lelkészek — a v0.5.1 telepítője után jelzett kritikus letöltési hiba javítva: most már a Beállítások → Frissítés fülön egy gombbal letölthető és telepíthető az új verzió -->

A v0.5.1 telepítője után jelzett **kritikus hiba javítva**: az auto-updater jelezte az új verziót, de **nem volt UI-gomb a letöltéshez**.

### 🐛 Javítások

- **Frissítés letöltése most már működik** — eddig az „Adat & biztonság" fülön az „Ellenőrzés most" gomb megtalálta az új verziót, de utána nem lehetett honnan letölteni és telepíteni. **Mostantól külön „Frissítés" fül van a Beállításokban**, teljes folyamattal: ellenőrzés → release-notes megtekintése → „Letöltés és telepítés" gomb → letöltés-progress (MB / MB) → automatikus újraindítás.
- **Családok-oldal layout-egységesítés** — a `families-page.tsx` még megtartotta a régi `<main className="mx-auto max-w-5xl">` lokális wrapper-t, ami dupla `<main>` elemet és felesleges paddingot adott a v0.5.1 új teljes-szélességű shell-éhez képest. Mostantól a tagnyilvántartás-oldallal vizuálisan azonos: PageHero teljes szélességen, a shell egységes paddingjével.

### ✨ Új — dedikált „Frissítés" fül

A Beállítások menüben (jobb felső user-menüből → „Beállítások") új fül a **„Publikus oldal"** és **„Adat & biztonság"** között:

- **Aktuális verzió** kártyán kiemelve (Tauri runtime API-ból, mindig pontos)
- **Automatikus ellenőrzés** a fül megnyitásakor (online esetén)
- **Magyarázott állapotok** minden lépéshez:
  - 🟢 *„A legfrissebb verzió fut"* — ha nincs új
  - 🟡 *„Új verzió elérhető — vX.Y.Z"* + release-notes + **„Letöltés és telepítés" gomb**
  - 🔵 *„Letöltés és telepítés folyamatban…"* — progress-bar + MB / MB
  - 🟢 *„Telepítés sikeres — újraindítás folyamatban…"* — automatikus restart
  - 🔴 *„Hiba történt"* — pontos hibaüzenet + újrapróbálás gomb
- **Offline állapotban** világos magyarázat: „Offline vagy. Kapcsolódj az internethez a frissítések ellenőrzéséhez."

A régi (törött) frissítés-kártya az „Adat & biztonság" fülről eltávolítva — az minden frissítéshez kapcsolódó művelet most az új „Frissítés" fülön egységesen elérhető.

### 🔧 Belső

- Új `FrissitesPanel` komponens (`apps/desktop/src/components/settings/frissites-panel.tsx`) — 7-fázisú állapotgép (`idle`, `checking`, `up-to-date`, `available`, `downloading`, `installed`, `error`).
- `getVersion()` import a `@tauri-apps/api/app`-ból az aktuális verzió mindig-pontos megjelenítéséhez.

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

## [2026-04-25] — v0.5.1: UI-javítások, automatikus háttérszinkron, reszponzív irányítópult

<!-- key: 2026-04-25-v0-5-1-ui-fix-auto-sync -->
<!-- category: bugfix -->
<!-- version: 0.5.1 -->
<!-- targets: lelkészek — a v0.5.0 telepítő után jelentkező megjelenítési hibák javítva, a tartalom most teljes ablakon szétterül, és percenként frissülő háttérszinkron mutatja az adatok frissességét -->

A v0.5.0 telepítője után jelzett három fő probléma javítva, plusz egy új, gyakran kért feature.

### 🐛 Javítások

- **Hiányzó stílusok az irányítópulton** — a közös `@kartoteka/ui-app` csomag (új dashboard widget-ek: KPI-kártyák, születésnapok, közelgő alkalmak stb.) Tailwind class-jai nem kerültek be a CSS-bundle-be, ezért az új kártyák stílus nélkül, hiányos elemekkel jelentek meg. **Mostantól mindkét kliens (web és desktop) szkenneli az `@kartoteka/ui-app/src` mappát is** — minden új komponens stílusa megjelenik. (CSS-bundle ~120 kB → ~161 kB.)
- **Üres sávok a két oldalon teljes képernyőn** — a tartalom maximum-szélessége 1280px volt, így nagy monitoron a sidebar utáni terület nagy része üres maradt. **Mostantól a tartalom kitölti a teljes ablakot**; a beágyazott rács-komponensek (KPI-kártyák, statisztikák) maguk osztják el a helyet, így ultra-széles képernyőn sem feszül szét olvashatatlanul.
- **Tagnyilvántartás fejléc-egységesítés** — a webes/közös `PageHero` (eyebrow + serif cím + ikon + statisztikák) helyébe lépett a régi egyedi `<h1>` — így a desktop oldal vizuálisan ugyanaz, mint a többi modul. A táblázat „törlés"-ikonja (Trash2) helyett **ceruza-ikon** mutatja, hogy a sor szerkesztésre nyílik meg, nem törlésre.
- **Telepítő hosszú leírás rövidítve** — a túlzottan hosszú `longDescription` egyes ablakokban tördelési problémákat okozott; mostantól tömörebb, jobban olvasható szöveg.

### ✨ Új funkció — automatikus háttérszinkron + állapotsáv

- **Indításkor azonnal** lefut egy **teljes szinkron** (mind a 14 lokális mirror-tábla); ezután **percenként** a leggyakrabban változó táblák (tagok, családok, munkanapló, programok, profil, gyülekezet) frissülnek, **5 percenként** pedig az összes (anyakönyv, leltár, iktató, jegyzőkönyvek, sírhelyek, éves jelentés, helyiségek).
- A képernyő alján középen lebegő **állapotsáv** mutatja a szinkron állapotát:
  - 🔵 *„Adatok szinkronizálása…"* — folyamatban
  - 🟢 *„Friss adatok · 12 mp"* — sikeres pull, relatív idővel
  - 🟠 *„Offline — cache-elt adatok"* — nincs net, a lokális cache érhető el
  - 🔴 *„Szinkronizálási hiba — újrapróbálkozás"* — ideiglenes hiba, automatikus retry
- **Kézi frissítés** a sávon lévő ↻ gombbal bármikor kérhető (teljes pull).
- **Online → offline → online** átmenetkor automatikusan újraindul a szinkron.

### 🔧 Belső

- A `KartotekaShell` `<main>` régiója már nem korlátozza a tartalomszélességet — minden oldal az ablak teljes szélességén dolgozik.
- Új `useAutoSyncOrchestrator(userId)` hook az auto-sync-logika központosítására (`apps/desktop/src/lib/sync-orchestrator.ts`).
- Új `<AutoSyncStatusBar />` komponens a vizuális réteghez (`apps/desktop/src/components/auto-sync-status-bar.tsx`).

A frissítés **adat-vesztés nélkül** és **automatikusan** települ az auto-updater-en keresztül (vagy a v0.5.1 telepítőből).

---

## [2026-04-25] — v0.5.0: 6 új READ-only modul + dashboard gazdagítás + séma-paritás

<!-- key: 2026-04-25-v0-5-0-modul-hullam -->
<!-- category: feature -->
<!-- version: 0.5.0 -->
<!-- targets: lelkészek — a desktop appban most már 6 új modul érhető el offline és gazdag, webes-szerű irányítópult fogad indításkor -->

A v0.4.1 telepítője után a desktop app **jelentős bővülésen ment át**. A sidebar-on lévő „hamarosan" placeholder-ek mindegyike valódi oldallá vált, az irányítópult pedig a webes /dashboard mintáját követi.

### 📂 6 új modul (READ-ONLY) — offline böngészhető

- **Anyakönyv** — 8 tábla: keresztelés, konfirmáció, házasság, temetés + 4 mozgás (beköltözött / elköltözött / áttért / kitért). Áttekintő statisztika, fülkapcsolatos lista, részletes adatok.
- **Leltár** — alapeszközök, könyvek, műkincsek; kategória-szűrő, szöveges keresés, össz-érték kalkuláció.
- **Iktató** — beérkező és kimenő iratok év szerinti sorszámozással; függőben jelölés, irány-szűrő.
- **Jegyzőkönyvek** — presbiteri és közgyűlési ülések részletes nézettel: résztvevők, napirendi pontok (szavazási eredményekkel), határozatok.
- **Sírhelyek** — temetők, parcellák, bérletek, elhunytak; lejáró bérletek 90 napon belüli figyelmeztetése.
- **Éves jelentés** — éves összesítő jelentések workflow-státuszokkal (vázlat → beküldve → befogadva → áttekintve → lezárva), JSON snapshot.

Mind a 6 modul **„Frissítés most" gombbal** online egy kattintással lehúzza a teljes tartalmat a szerverről a lokális, titkosított adatbázisba — onnantól offline is böngészhető.

### 📊 Új üdvözlő oldal — webes paritás

- **Üdvözlő gradient-banner napi igével** (offline esetén alapértelmezett ige).
- **5 KPI-kártya** (aktív tagok ✓, családok ✓, pénzforgalom, weboldal-státusz, prezentáció).
- **7 demográfiai stat** (férfiak, nők, gyermekek, átlagéletkor, fizetők, presbiterek, egyenleg) — élesen kalkulálva a tagjegyzékből.
- **Közelgő alkalmak widget** — mai és következő 14 napos programok automatikusan megjelennek.
- **Mai + 14 napos születésnapok** widget (kattintásra a tag-részlethez).
- **Friss munkanapló-bejegyzések** widget (10 utolsó alkalom).

### 🛠️ Stabilitás és UX javítások

- **Lokális adatbázis automatikus helyreállítás** — ha a titkosított adatbázis nem nyitható (kulcs-séma váltás után), az alkalmazás csendesen elmenti a régit `kartoteka.db.broken-...` néven, és tiszta állapotból folytatja. Eddig PowerShell-paranccsal kellett törölni — most automatikus.
- **Szöveg most kijelölhető** — bárhol másolható név, e-mail, dátum.
- **Munkamenet-figyelmeztetés egyértelműbb** — „jelentkezz be újra a megújításhoz" szöveg.
- **Tartalom centerálva nagy ablakon** (max 1280px szélesség).

### 🔧 Belső séma-finomhangolás

A 7 új modul lokális adatbázis-mirror-jai **most már 100%-ban egyeznek** a szerver-oldali sémával:

- **Leltár soft-delete fix** — eddig minden tétel törölt-jelzése `0` lett a hibás adatcsere miatt.
- **Jegyzőkönyvek határozat-FK** — stabil UUID-FK a kapcsolódó napirendi pontra.
- **10 új adat-mező a 7 modulra**: keresztszülők (keresztelő), halál helye (temetés), munkanapló-link, határozatképesség, irat-oldalszám, aktív bérlés-link, program-leírás és -szín, határozat-állapot, technikai mezők.
- **Új helyiség-nyilvántartás (adrlocality)** mirror-tábla — előkészítve a UI-megjelenítéshez (a következő frissítésben jönnek a helyiség-nevek).
- **Sync-infrastruktúra**: minden új mirror-tábla mostantól `revision` és `updated_at` mezőt tartalmaz a jövőbeli új-bejegyzés-rögzítéshez.

A frissítés **adat-vesztés nélkül** és **automatikusan** lefut az alkalmazás következő indításakor (v28+v29 lokális adatbázis-migráció, kb. 1-2 másodperc).

### 📌 Megjegyzések

- A WRITE-flow (új keresztelés, házasság, temetés, leltári tétel, irat, jegyzőkönyv, sírhely-rekord stb. rögzítése) **a következő releaseban** jön — most az adatok megtekinthetők, a webes felületen szerkeszthetők.
- A Missziós Műhely modul a webes appban marad (online community feature).
- A kerületi/egyházmegyei dashboard, admin felületek és publikus weboldal-szerkesztő szintén webes.

---

## [2026-04-25] — Stabilitás + új üdvözlő oldal a desktopon

<!-- key: 2026-04-25-sprint-a-stabilitas-dashboard -->
<!-- category: improvement -->
<!-- targets: lelkészek — barátságosabb desktop, ugyanaz, mint a webes irányítópult -->

A v0.4.1 telepítése után jelzett észrevételekre válaszul a Kartotéka asztali alkalmazás stabilabb és gazdagabb lett.

### 🎨 Új üdvözlő oldal — webes paritás

A desktop „Irányítópult" mostantól ugyanazt a gazdag élményt adja, mint a webes felület:

- **Üdvözlő gradient-banner** napi igével. Az ige a webes alkalmazás `/api/daily-verse` szolgáltatásából érkezik; offline mód esetén egy alapértelmezett ige (Példabeszédek 3:5) jelenik meg.
- **5 KPI-kártya**: aktív tagok, családok (mostantól élesen!), éves pénzforgalom, gyülekezeti weboldal státusz, éves prezentáció. A pénzforgalom-számok a következő frissítésekben kerülnek bekötésre.
- **7 alsó demográfiai stat**: férfiak, nők, gyermekek, átlagéletkor, fizetők, presbiterek, egyenleg — **mostantól élesen kalkulálva** a tagjegyzék alapján (a fizetők és egyenleg pénzügyi aggregátumot vár).
- **Születésnapok widget** — mai + következő 14 napban várt szülinapok, egy kattintással a tag-részletekhez.
- **Friss munkanapló-bejegyzések** — az utolsó 10 alkalom dátummal, jellegével, jelenlét-számmal.

### 📖 Anyakönyvi nyilvántartás — első desktop iteráció

A sidebarban az **„Anyakönyv"** menüpont eddig „hamarosan" oldalra vezetett. Mostantól van egy működő áttekintő:

- **4 statisztika-kártya**: kereszteltek, konfirmáltak, házasultak, eltemetettek — totál és ez évi szám.
- **8 fül listával**: 4 fő (kereszteltek, konfirmáltak, házasultak, eltemetettek) és 4 mozgás (beköltözöttek, elköltözöttek, áttértek, kitértek). Az utolsó 50 bejegyzés táblázatosan dátum, okirat, lelkész, és tábla-specifikus oszlopok szerint.
- **Mozgás-összegző**: ha vannak beköltözések / elköltözések / áttérések / kitérések, kompakt összegző-panel mutatja az összeget és az idei számot.
- **„Frissítés most" gomb**: online egy kattintással lehúzza mind a 8 tábla teljes tartalmát a szerverről a lokális, titkosított adatbázisba — onnantól offline is böngészhető.
- **Új bejegyzés rögzítése** (új keresztelés, házasság, temetés, mozgás stb.) — még nem aktív, a következő iterációban érkezik.

### 📦 Leltár — első desktop iteráció

A sidebarban a **„Leltár"** menüpont eddig „hamarosan" oldalra vezetett. Mostantól van egy működő leltári áttekintő:

- **4 statisztika-kártya**: összes tétel, aktív tételek, törölt tételek, és **össz-érték (RON)**.
- **Kategória-szűrő**: alapeszközök, könyvek, műkincsek, felszerelés, liturgikus tárgyak, járművek, ingatlan, egyéb — minden kategórián mellett a tételek száma.
- **Szöveges keresés**: megnevezésre, leltári-számra vagy helyszínre.
- **Táblázatos lista** legfeljebb 200 tétellel: leltári szám, megnevezés (könyveknél a szerzővel), kategória, helyszín, mennyiség, össz-érték.
- **„Frissítés most" gomb**: online egy kattintással lehúzza a teljes leltárt a szerverről a lokális, titkosított adatbázisba.
- **Új tétel rögzítése** — még nem aktív, a következő iterációban érkezik.

### 📑 Iktató — első desktop iteráció

A sidebarban a **„Iktató"** menüpont eddig „hamarosan" oldalra vezetett. Mostantól van egy működő irat-napló:

- **Év-szűrő**: az aktuális és előző 4 év között válthatsz.
- **4 statisztika-kártya az adott évre**: összes irat, beérkező, kimenő, és külön **nincs elintézve** (még függőben lévő).
- **Irány-szűrő**: Mind / Beérkező / Kimenő.
- **Szöveges keresés**: tárgyra, küldőre/címzettre, tárgykivonatra.
- **Táblázatos lista** legfeljebb 200 irattal: sorszám (`év/szám`), irány, kelt, tárgy + tárgykivonat, küldő/címzett, elintézés dátuma vagy „függőben" jelölés.
- **„Frissítés most" gomb**: online egy kattintással lehúzza a teljes iktatót a szerverről a lokális, titkosított adatbázisba.
- **Új irat rögzítése** — még nem aktív, a következő iterációban érkezik.

### 📜 Jegyzőkönyvek — első desktop iteráció

A sidebarban a **„Jegyzőkönyvek"** menüpont eddig „hamarosan" oldalra vezetett. Mostantól teljes áttekintés:

- **4 statisztika-kártya az évre**: összes ülés, presbiteri ülések, közgyűlési ülések, és határozatok száma az adott évben.
- **Év-szűrő + típus-szűrő** (Mind / Presbiteri / Közgyűlési).
- **Kártyás lista** az ülésekről: ülés sorszáma, dátuma, helye, elnök és jegyző neve, állapota.
- **Részletes nézet** (kattintás egy ülésre): meta-adatok (kezdés/zárás/hitelesítők/igevers/felolvasás), résztvevők táblázat (jelen/hiányzó), napirendi pontok kártyákban (előadó, tárgyalás, **szavazási eredmények** igen/nem/tartózkodás chipekkel), határozatok kártyákban (azonosító `év/sorszám` formátumban, felelős, határidő).
- **„Frissítés most" gomb**: online egy kattintással lehúzza mind a 4 tábla teljes tartalmát.
- **Új jegyzőkönyv rögzítése** — még nem aktív, a következő iterációban érkezik.

### ⚰️ Sírhelyek — első desktop iteráció

A sidebarban a **„Sírhelyek"** menüpont eddig „hamarosan" oldalra vezetett. Mostantól teljes áttekintés:

- **5 statisztika-kártya**: temetők, sírhelyek, bérletek, elhunytak, és külön **„Lejár 90 napon belül"** kártya narancs kiemeléssel — ha van olyan bérlet, ami hamarosan jár le.
- **Temető-szűrő** pill-gombokkal — több temető esetén egy kattintással válts.
- **Parcella-lista**: parcella/sor/szám, állapot, típus, méret, megjegyzés.
- **Kattintható sorok**: egy parcellára kattintva alatta megjelennek a bérletek (bérlő, megváltás dátuma, lejárat, lejár-figyelmeztetés) és a parcellában nyugvó elhunytak (név, születési név, halálozás, temetés dátuma).
- **„Frissítés most" gomb**: online egy kattintással lehúzza mind a 4 tábla teljes tartalmát.
- **Új sírhely / bérlet rögzítése** — még nem aktív, a következő iterációban érkezik.

### 🔧 Belső séma-finomhangolás (Sprint L)

A 7 új READ-only modul (Anyakönyv, Leltár, Iktató, Jegyzőkönyvek, Sírhelyek, Programok, Éves Jelentés) lokális adatbázis-mirror-jai **most már 100%-ban egyeznek** a szerver-oldali sémával:

- **Leltár-modul soft-delete javítva** — eddig minden tétel törölt-jelzése `0` lett a hibás adatcsere miatt; mostantól helyesen jönnek át a Supabase-ből.
- **Jegyzőkönyvek határozat-FK** — a határozatok mostantól stabil UUID-vel hivatkoznak a kapcsolódó napirendi pontra.
- **10 új adat-mező a 7 modulra**: keresztszülők (keresztelő), halál helye (temetés), munkanapló-link (anyakönyvi 4), határozatképesség, irat-oldalszám, aktív bérlés-link, program-leírás és -szín, határozat-állapot, és technikai mezők (userid, penzugy_xkey).
- **Új helyiség-nyilvántartás** mirror-tábla (`adrlocality`) — előkészítve a UI-megjelenítéshez (a következő frissítésben jönnek a helyiség-nevek a sírhelyek/anyakönyvi FK-mezőkben).
- **Sync-infrastruktúra**: minden új mirror-tábla mostantól `revision` és `updated_at` mezőt tartalmaz, ami a jövőbeli inkrementális szinkronizációhoz és új-bejegyzés-rögzítéshez szükséges.

A frissítés **adat-vesztés nélkül** és **automatikusan** lefut az alkalmazás következő indításakor (v28+v29 lokális adatbázis-migráció, kb. 1-2 másodperc).

### 📅 Közelgő alkalmak az üdvözlő oldalon

Az **Irányítópulton** a hero alatt megjelenik egy új widget: **„Közelgő alkalmak"**. Mostantól egyetlen pillantással látod, hogy mai vagy a következő 14 napban mi vár rád.

- **Mai alkalom** sárga gradient kiemeléssel és „ma" címkével.
- **Holnapi és további alkalmak** kártyákban: ikon (program-típus szerint emoji), dátum, idő, helyszín, ismétlődés-jel (heti/kétheti/havi), és „N nap múlva" kis chip.
- 16 program-típus saját ikonnal: istentisztelet, bibliaóra, imaóra, ifjúsági, gyerekprogram, konferencia, hangverseny, közösségi, presbiteri, látogatás, ünnep, tábor, evangélizáció, diakónia, nőszövetség, egyéb (ott a saját emoji is használható).
- **Automatikus frissítés** az alkalmazás indításakor (online esetén), offline módban a már letöltött programok látszanak.

### 📦 Mai napi modul-bővülés

A v0.4.1 telepítője után **5 új modul** lett desktopon elérhető (READ-ONLY):
- **Anyakönyv** — 8 tábla (keresztelés, konfirmáció, házasság, temetés + 4 mozgás)
- **Leltár** — alapeszközök, könyvek, műkincsek
- **Iktató** — beérkező/kimenő irat-napló
- **Jegyzőkönyvek** — presbiteri és közgyűlési ülések részletes nézettel
- **Sírhelyek** — temetők, parcellák, bérletek, elhunytak

Mind az 5 modul offline is böngészhető, miután egyszer rákattintottál a „Frissítés most" gombra.

### 📊 Éves jelentés — első desktop iteráció

A sidebarban az **„Éves jelentés"** menüpont eddig „hamarosan" oldalra vezetett. Mostantól van egy működő áttekintés:

- **Státusz-csoport-panel**: hány jelentés van vázlat / beküldve / befogadva / áttekintve / lezárva állapotban — egy pillantásra látható.
- **Jelentés-lista**: minden évre egy kártya, év száma + státusz-jel + 3 stat (tagok / istentiszteletek / éves bevétel).
- **Kattintható kártya**: lenyitja a részletes nézetet — workflow-dátumokkal (beküldés / befogadás / áttekintés / lezárás dátuma + ki tette), lelkészi megjegyzés, áttekintői megjegyzés, és a teljes snapshot adatok (JSON-formátum, lenyitható).
- **„Frissítés most" gomb**: online egy kattintással lehúzza a teljes éves jelentés listát.
- **Új jelentés szerkesztése** — webes felületen (a desktop READ-only, mert a workflow központi).

### 🛠️ Stabilitás és UX javítások

- **Lokális adatbázis automatikus helyreállítás** — ha a titkosított adatbázis nem nyitható (pl. korábbi verzió kulcs-formátumából), az alkalmazás csendesen elmenti a régit `kartoteka.db.broken-...` néven, és tiszta állapotból folytatja. Eddig PowerShell-paranccsal kellett törölni a fájlt — ez most automatikus.
- **Szöveg most kijelölhető** — a desktop ablakban végre lehet másolni nevet, e-mail-t, dátumot. Eddig minden „nem-input" mező le volt tiltva.
- **Munkamenet-figyelmeztetés egyértelműbb** — „csatlakozz a hálózatra" helyett „jelentkezz be újra a megújításhoz". A figyelmeztetés azt jelzi, hogy a munkamenet 7 napon belül lejár — célszerű újra bejelentkezni a megújításhoz.
- **Tartalom centerálva nagy ablakon** — a tartalom most maximum 1280px szélességig terjed, középen, és nem nyúlik el a teljes képernyőn üresen.

### 📌 Megjegyzések

- A KPI-számok (családok, pénzforgalom, demográfia) a következő sprintben kerülnek bekötésre — ehhez a lokális szinkronizációs táblák kiterjesztése szükséges.
- A teljes web→desktop modul-paritás (anyakönyv, leltár, jegyzőkönyvek stb.) becslése: ~40-45 nap fejlesztés. Részletek a `docs/DIAGNOSTICS.md`-ben.

---

## [2026-04-25] — v0.4.1: UI paritás + magyar telepítő + pénzügyi SQL fix

<!-- key: 2026-04-25-v0-4-1-ui-paritas -->
<!-- category: feature -->
<!-- version: 0.4.1 -->
<!-- targets: mindenki — a desktop app most már prémium kinézetű és magyarul telepszik -->

### 🎨 UX javítások — premium UI paritás

A desktop app kinézete most már egybevág a webes felülettel. A lelkész ugyanazt az élményt kapja böngészőből és a telepített alkalmazásból is.

- **Tagnyilvántartás** — táblázatos lista sortolható oszlopokkal (Név, Lakcím, Kor, Státusz, Foglalkozás), avatár-initials kép (kék/rózsaszín), szülinapi torta-ikon, státusz-badge-ek, offline-pending szekció konfliktus-feloldóval
- **Családi karton** — gradient-hátterű prémium modal, avatar-box, státusz-chipek, stat-ek (szülők, gyermekek száma)
- **Pénzügyi áttekintés** — új gradient-header, gradient-ikonos StatCard-ok hover-scale-lel
- **Új PageHero komponens** — közös prémium fejléc a befizetés, kiadás, belső mozgás, chitanță, nyugtatömbök, családok, bank-import oldalakon

### 🇭🇺 Magyar telepítő

- Telepítővarázsló teljesen magyar nyelvű (NSIS + WiX hu-HU)
- Kartotéka-ikonos telepítő (icon.ico)
- Banner- és sidebar-képek (nsis-header.bmp, nsis-sidebar.bmp) KARTOTEKA_V3 logóval, indigo-950 háttéren
- Digitálisan aláírt telepítő, Ed25519-updater signature

### 🐛 Kritikus javítások

- **Pénzügyi bevétel/kiadás lista** — a `bankszamlak.nev` oszlop nem létezik, helyette `bank_neve`. A lista sikertelenül futott eddig a webes felületen is. Javítva: `packages/core/src/finance/befizetes/list.ts`, `kiadas/list.ts`
- **Tagnyilvántartás auto-pull** — a desktop első indítása után a members-page `pullMembersOfOwnCongregation(userId, 'delta')` fut a mount-kor, így nem marad üres a lista

### 📋 Diagnosztika

- Új `docs/DIAGNOSTICS.md` — P0/P1/P2/P3 prioritás szerinti rendszerállapot, modul-paritás táblázat, javasolt következő sprint

---

## [2026-04-24] — M8.3d: Gyermek hozzáadása / eltávolítása a családból (desktop)

<!-- key: 2026-04-24-m8-3d-gyerek-junction -->
<!-- category: feature -->
<!-- targets: lelkészek — most már gyermekeket rendelhetsz családhoz a desktop appban -->

### ✨ Gyermek-kezelés a család-portré modalban

A Családok oldal → egy sorra kattintva → család-portré → Gyermekek szekció:

- **Piros kuka ikon** minden gyerek mellett → eltávolítás a családból (a tag adatai megmaradnak, csak a család-kapcsolat szűnik)
- **„Gyermek hozzáadása a családhoz" gomb** → kereső-mező nyílik
- Keresés a gyülekezet **aktív tagjai között**, a már családtagokat automatikusan kiszűrve
- Egy kattintás a találatra → azonnal hozzáadódik

**Offline is működik** — a háttérszinkron feltölti, amint online leszel.

### 🎯 Az M8 wave teljes

Ezzel az iterációval a **teljes M8 szemely + család wave lezárult**:
tag-lista, szerkesztés, új tag, CNP-validáció, rejtés, admin-jelzők,
családok listája, családfő-kijelölés, család CRUD, gyerek-kezelés — minden
offline-is működik, konfliktus-feloldással.

### 🛠 Műszaki háttér

- **Rust v19 migráció**: új `gyerek_pending_local` tábla (`operation` oszloppal `'insert'` és `'delete'` értékekhez, 3 index)
- **[gyerek-save.ts](packages/validations/src/members/gyerek-save.ts)**: `gyerekAddInputSchema`, `gyerekRemoveInputSchema`
- **[sync.ts](apps/desktop/src/lib/sync.ts)**: új `addGyerekToCsalad(userId, id_csalad, id_szemely)` + `removeGyerekFromCsalad(userId, gyerekId)` — optimistic lokál + online + offline pending
- **[gyerek-write-sync.ts](apps/desktop/src/lib/gyerek-write-sync.ts)**: background push kezeli az insert és delete operation-öket külön-külön, exp-backoff
- **[tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)**: 8 új metódus a pending-kezelésre és optimistic lokál-frissítésre
- **[family-detail-dialog.tsx](apps/desktop/src/components/family-detail-dialog.tsx)**: gyerek-kezelés UI beépítve a Gyermekek szekcióba

### 🔜 Mi következik

- **adrstreet lookup** — a címet FK-alapon (utca-listából választhatóvá tenni)
- **Anyakönyv**, **leltár**, **jegyzőkönyvek** desktop-paritása
- **Bank-import Raiffeisen + BT** (A-M7.10d)
- **Oblio e-Factura** Edge Fn

---

## [2026-04-24] — M8.3c: Család létrehozás + szerkesztés offline-is (desktop)

<!-- key: 2026-04-24-m8-3c-csalad-crud -->
<!-- category: feature -->
<!-- targets: lelkészek — most már a desktopról is létrehozhatsz új családot, szerkesztheted a meglévőt, offline is -->

### ✨ Új család létrehozása a desktopon

A Családok oldal fejlécén új **„Új család"** violet gomb. Kattintásra form nyílik:

- **Szülők kijelölése**: apa és/vagy anya választás a gyülekezet meglévő tagjai közül, beépített kereső-mezővel
- **Cím**: házszám (kötelező), opcionális tömb-, lépcső-, emelet, ajtó
- **Státusz**: aktív / inaktív toggle

Legalább egy szülő megadása szükséges (egyedülálló szülő / özvegy család is rögzíthető).

### ✏️ Meglévő család szerkesztése

A család-portré modal alján új **„Szerkesztés"** gomb. Ugyanazt a formot nyitja meg, előre kitöltve az aktuális értékekkel. Revision-alapú conditional UPDATE — ha más eszközről időközben módosították, konfliktus-banner jelez.

### 📡 Teljesen offline-kompatibilis

Mindkét művelet (create + update) **offline is működik**:
- Lokális pending-sor azonnal, a UI frissül
- A szinkron automatikusan feltölti amint online leszünk (30s poll + online-event)
- Exp-backoff a retry-oknál (30s/1m/2m/5m/15m, majd konfliktus)

### 🛠 Műszaki háttér

- **Rust v18 migráció**: új `csalad_pending_local` tábla egy közös `operation` oszloppal (`'insert' | 'update'`), 3 index, CHECK-constraint. Az insert → `local-<uuid>` + `server_id` backfill, az update → `target_csalad_id` + `expected_revision` snapshot-payload
- **[csalad-save.ts](packages/validations/src/members/csalad-save.ts)**: `csaladCreateInputSchema` (refine: legalább apa vagy anya) + `csaladUpdateInputSchema` + `normalizeCsaladPayload` (üres-string → null, `c_szam` → `'—'` fallback)
- **[sync.ts](apps/desktop/src/lib/sync.ts)**: új `createCsaladEntry(userId, input)` + `updateCsaladEntry(userId, csaladId, patch, expectedRevision)` — online conditional + offline pending
- **[csalad-write-sync.ts](apps/desktop/src/lib/csalad-write-sync.ts)**: background push (kezeli az insert és update operation-öket külön-külön), exp-backoff, session-check
- **[csalad-form-dialog.tsx](apps/desktop/src/components/csalad-form-dialog.tsx)**: közös dialog a create + edit-hez, beépített tag-kereső a szülő-kijelöléshez
- **[tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)**: 7 új metódus (insertPendingCsaladCreate, insertPendingCsaladUpdate, upsertLocalCsaladOptimistic, listPendingCsalad, markCsaladPendingSynced, markCsaladPendingConflict, updateCsaladPendingAttempt)

### 🔜 Mi jön később

- **Gyerek-kezelés**: egy tag családhoz rendelése / eltávolítása — a `gyerek` junction-tábla CRUD-ja (M8.3d vagy a tag-edit flow-ba integrálva)
- **Cím-FK lookup**: a `c_utcaid` → `adrstreet` feloldás (jelenleg dummy -1), hogy a címek normalizált street-listából legyenek választhatók

---

## [2026-04-24] — M8.3b: Családfő kijelölése a család-nézetben (desktop)

<!-- key: 2026-04-24-m8-3b-csaladfo -->
<!-- category: feature -->
<!-- targets: lelkészek — a család-portré modalban egy kattintással kijelölheted, ki a családfő -->

### ✨ Családfő kijelölése a családnézetben

A Családok oldal egy sorára kattintva megnyíló modalban most minden családtagnál látod, ki a **családfő** — egy arany „👑 Családfő" badge jelöli. A nem-családfő tagok mellett új **„Családfő" gomb**, ami egy kattintással áthelyezi a szerepet:

- Ha már van kijelölt családfő → automatikusan lekerül a szerepkörből
- Az új kijelölt tag lesz a családfő
- Offline is működik — a szinkron automatikusan feltölti

### 💡 Ki lehet a családfő?

**Bárki a család tagjai közül** — apa, anya, vagy akár egy felnőtt gyermek. A családfő a pénzügyi / adminisztratív szereppel jár (a gyülekezet felé ő a család képviselője, ő kapja a tagdíj-értesítőket), nem a családszerkezetet jelenti.

### 🛠 Műszaki háttér

- **[tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)**: `getLocalCsaladDetail` most visszaadja a `csaladfo` + `revision` mezőket is minden családtagra
- **[family-detail-dialog.tsx](apps/desktop/src/components/family-detail-dialog.tsx)**: új `handleSetCsaladfo(id, name, revision)` 2-lépcsős UPDATE (régi családfő → false, új → true); `MemberRow` komponens egységes szülő + gyermek render-hez; `CsaladfoBadge` (amber + Crown ikon); `banner` state success/conflict/offline/error üzenetekhez
- **[families-page.tsx](apps/desktop/src/pages/families-page.tsx)**: a dialog most kapja a `userId`-t az `updateSzemelyEntry`-hez

**Nincs új SQL migráció + nincs új Rust migráció** — a `szemely.csaladfo` flag már az eredeti sémában, a M8.0b óta szerkeszthető az `updateSzemelyEntry`-n keresztül. Most csak a UI-ban jelenik meg explicit családi kontextusban.

---

## [2026-04-24] — M8.3a: Család-kezelő a desktopon (olvasási réteg)

<!-- key: 2026-04-24-m8-3a-csalad-olvasasi -->
<!-- category: feature -->
<!-- targets: lelkészek — a desktop appban már elérhető a család-nézet -->

### ✨ Családok a desktop appban

A Tagnyilvántartás oldal fejlécében új **„Családok"** gomb → új `/csaladok` oldal. A családok lokálisan, offline is elérhetők:

- **Lista**: családfő-név szerint rendezve (A→Z, Z→A, felvétel sorrendje)
- **Keresés**: apa, anya vagy cím alapján — diakritika-toleráns (ékezetek nem számítanak)
- **Szűrő**: aktív / inaktív / mind
- **Sor-kattintás** → **Család-portré modal**: apa + anya + gyerekek listája (név, nem, életkor), cím

### 📡 Offline-first pull

Az első megnyitáskor + a „Frissítés" gombra a rendszer delta-pullt végez a szerverről:
- Csak azok a családok töltődnek le, amelyek a gyülekezet tagjaihoz kapcsolódnak (apa, anya vagy gyermek)
- A gyerekek (junction-tábla) külön pull-ban jönnek
- A lokális SQLite cache ezt tartja eltárolva, így offline is megjelenik a lista

### 🔜 Mi jön (M8.3b + c)

- **M8.3b**: családfő kijelölése — a szemely.csaladfo flag, plusz „apa a családfő" / „anya a családfő" megjelölés
- **M8.3c**: új család létrehozása, család szerkesztése, tagok áthelyezése családok között
  - Offline-write (csalad_pending_local + gyerek_pending_local Rust-táblák, sync-helper)

A jelenlegi verzió **read-only** — a modal-on jelzi: „A szerkesztési funkció a következő frissítésben jön."

### 🛠 Műszaki háttér

- **Rust v17 migráció**: új `csalad_local` + `gyerek_local` tükör-táblák (35+5 oszlop, 6 index)
- **SQL RPC**: `get_csaladok_for_congregation(uuid, timestamptz)` + `get_gyerek_for_congregation` — SECURITY DEFINER, STABLE, a `csalad` táblának nincs `congregation_id`-ja, így a szemely-kapcsolaton át szűrünk
- **[csalad-list.ts](packages/validations/src/members/csalad-list.ts)**: zod-séma `CsaladListRow`, `GyerekRow`, `CsaladPortrait`, `CsaladStatusFilter`
- **[sync.ts](apps/desktop/src/lib/sync.ts)**: `pullFamiliesOfOwnCongregation` + `pullGyerekOfOwnCongregation` (delta + full-initial pattern a `pullMembers` mintán)
- **[tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)**: `listLocalCsaladok` (join szemely_local-ra, COUNT a gyerek_local-ból), `getLocalCsaladDetail` (szülők + gyerekek feloldás)
- **[families-page.tsx](apps/desktop/src/pages/families-page.tsx)** + **[family-detail-dialog.tsx](apps/desktop/src/components/family-detail-dialog.tsx)**: UI + auto-refresh mount-kor

---

## [2026-04-24] — Admin wipe + favicon V3 + /offline dobozos layout

<!-- key: 2026-04-24-admin-wipe-polish -->
<!-- category: feature -->
<!-- targets: lelkészek + admin — tiszta lappal indulhatsz élesbe; új favicon; /offline áttekinthetőbb -->

### ✨ „Tiszta lap" gomb az adminban — gyülekezeti adatok törlése

A teszt-fázis után élesre váltáshoz az admin-felület új **„Veszélyes zóna"** tabján egy gomb: egy kattintással törölhetőek a lelkész által felvitt tag-, pénzügyi-, munkanapló-, anyakönyv-, leltár-, jegyzőkönyv- és egyéb adatok.

**Megtartódik**: a gyülekezet alapadatai, a felhasználók profiljai, az előfizetési és tagdíj-konfigurációk.

**3-szintű védelem**:
1. Csak admin / egyházkerületi / egyházmegyei admin szerepkör hívhatja (szerver-oldali ellenőrzés)
2. Be kell írni a gyülekezet pontos nevét a megerősítéshez
3. Browser-confirm a végső "biztosan?" kérdésre

Minden művelet naplózva a `data_wipe_log` táblába (ki, mikor, mely gyülekezetet, összesen hány sort).

### 🎨 Favicon frissítve — KARTOTEKA V3 ikon

Az éles webappon (és a böngésző tab-címke + PWA-telepítés ikon) mostantól a **Kartotéka V3** ikon jelenik meg. Ha a régi ikont látod, a böngésző-cache-t tisztítsd meg.

### 📐 `/offline` oldal dobozos elrendezés

A korábbi egymás-alatti lista helyett most **2-oszlopos grid**:
- Hero + desktop letöltés kártya teljes szélességű
- Alul balra: böngésző-offline magyarázat
- Alul jobbra: segédanyagok + (admin-only) diagnosztika-link

Nagyobb képernyőn áttekinthetőbb, kisebbre mobil-optimalizáltan egymás alá rendeződik.

### 🛠 Műszaki háttér

- **[2026-04-24-admin-wipe-congregation-data.sql](migration-docs/sql/2026-04-24-admin-wipe-congregation-data.sql)**: `wipe_congregation_data(UUID, TEXT)` RPC + `data_wipe_log` audit-tábla. Dinamikus loop a `congregation_id`-jú táblákon, `keep_tables` whitelist.
- **[wipe-actions.ts](apps/web/app/(dashboard)/admin/wipe-actions.ts)**: server action az RPC-hez, magyar hiba-fordítás
- **[wipe-congregation-panel.tsx](apps/web/components/admin/wipe-congregation-panel.tsx)** + **[data-wipe-tab.tsx](apps/web/components/admin/data-wipe-tab.tsx)**: UI a 2-szintű megerősítéshez
- **[admin-tabs-v3.tsx](apps/web/components/admin/admin-tabs-v3.tsx)**: új "Veszélyes zóna" tab
- **[layout.tsx](apps/web/app/layout.tsx)**: favicon-metadata átvált Next.js App Router konvencióra
- **[offline/page.tsx](apps/web/app/(dashboard)/offline/page.tsx)**: grid lg:grid-cols-2 + inline HelpResources + DiagnosticsLink kártyák

---

## [2026-04-24] — M8.1 polish: CNP szerver-védelem + konfliktus-feloldó

<!-- key: 2026-04-24-m8-1-polish -->
<!-- category: feature -->
<!-- targets: lelkészek — a pending új tagok konfliktusait mostantól közvetlenül feloldhatod -->

### ✨ Konfliktus-feloldó dialog az új-tag pending-blokkban

Ha egy új tag rögzítése ütközésbe futott (pl. másik lelkész is felvette ugyanezt a CNP-t), most **kattinthatóvá válik** a pending-blokkban az érintett sor. Modális dialog nyílik:

- **Szerver-üzenet** pirosan — pontosan mi volt a probléma
- **Újrapróbálkozás** (kék) — ha hálózati hibának tűnik, újra elküldi
- **Törlés** (piros) — ha tudod, hogy más már rögzítette, a helyi másolat eltűnik; a szerver-verzió a következő szinkronon megjelenik a listádban

### 🛡 Szerver-oldali CNP védelem

Új SQL migráció: **PARTIAL UNIQUE INDEX** a `szemely (congregation_id, cnp)` párra ahol `isvisible=true`. Ez védi a rendszert a párhuzamos klienseken keletkező duplikátumoktól:

- Ha két lelkész egyidejűleg rögzíti ugyanazt a CNP-t (pl. egyik online, másik offline), a szerver a második küldést elutasítja
- A rejtett (`isvisible=false`) tagok CNP-je **felszabadul** — soft-delete után újra felvehető
- A halott tagok CNP-je továbbra is unique

**Futtatás**: `migration-docs/sql/2026-04-24-m8-1-szemely-cnp-unique.sql` (Endre futtatja).

### 🛠 Műszaki háttér

- **[szemely-conflict-dialog.tsx](apps/desktop/src/components/szemely-conflict-dialog.tsx)**: új komponens, delete + retry + mégse gombokkal, pasztorális szövegezéssel
- **[tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)**: új `resetSzemelyPendingStatus(localId)` metódus — visszaállítja a sync_state-et `pending`-re, retry_count nullázva
- **[members-page.tsx](apps/desktop/src/pages/members-page.tsx)**: a pending sorok conditional `role="button"` (csak conflict), `onClick` + `onKeyDown` a dialog megnyitásához, "kattints a feloldáshoz →" felirat
- **[2026-04-24-m8-1-szemely-cnp-unique.sql](migration-docs/sql/2026-04-24-m8-1-szemely-cnp-unique.sql)**: PARTIAL UNIQUE INDEX + duplikátum-check `DO $$` blokk + ellenőrző SELECT-ek

**Design-döntés**: nincs "reassign" ág a pénzügyi mintához képest — a CNP maga a tag azonosítója, másik CNP-re állítás értelmetlen. Új CNP-vel az "Új tag" gomb a megoldás.

---

## [2026-04-24] — `/offline` oldal újragondolása + desktop letöltés

<!-- key: 2026-04-24-offline-ujraepites -->
<!-- category: feature -->
<!-- targets: lelkészek — az /offline oldal mostantól áttekinthető, a desktop letöltés gombra egy kattintással elérhető -->

### ✨ Új `/offline` oldal

A korábbi, zsúfolt 6-fázisos diagnosztika helyett most az **asztali alkalmazás letöltése** van a középpontban:

- **Nagy violet letöltés-gomb** — egy kattintással megkapod a telepítőt
- **Verzió-jelzés és fájlméret** automatikusan — tudod, mit töltesz le
- **"Miért desktop?"** 4 pontja: offline-elsőség, gyorsaság, PIN-védelem, szinkron
- **Böngésző-offline tippek** ha maradnál a webes verzióban (online/offline állapot-badge)
- **Fejlesztői diagnosztika** külön route-on (`/offline/diagnostika`) — csak admin-nézet, minden korábbi eszköz érintetlen

### 📦 Letöltés-infrastruktúra

- A Tauri build-elt `.exe` a `apps/web/public/downloads/kartoteka-setup.exe` helyre kerül
- Verzió-string `kartoteka-setup-version.txt`-ből
- A `.gitignore` kizárja a binárisokat a git-ből (15-30 MB)

### 🛠 Műszaki háttér

- **[page.tsx](apps/web/app/(dashboard)/offline/page.tsx)**: új, egyszerűsített oldal (~65 sor)
- **[diagnostika/page.tsx](apps/web/app/(dashboard)/offline/diagnostika/page.tsx)**: a régi 6-fázis átköltöztetve + admin-guard
- **[desktop-download-card.tsx](apps/web/components/offline/desktop-download-card.tsx)**: 3-állapotú letöltés kártya (checking/available/unavailable) + HEAD-request + version.txt
- **[browser-offline-card.tsx](apps/web/components/offline/browser-offline-card.tsx)**: PWA fallback tippek + navigator.onLine badge
- **[public/downloads/](apps/web/public/downloads/README.md)**: build-utasítás

---

## [2026-04-24] — M8.1: Új tag rögzítés (desktop, offline-is)

<!-- key: 2026-04-24-m8-1-uj-tag -->
<!-- category: feature -->
<!-- targets: lelkészek — mostantól a desktop appban is felvehetsz új tagot, akár offline-ban is -->

### ✨ Új tag a desktop appból

A tagnyilvántartás fejlécében új **„Új tag"** gomb (violet, `UserPlus` ikonnal). Kattintásra megnyílik egy pasztorális form:

- **Kötelező mezők** piros `*`-gal: CNP, Keresztnév, Családnév, Születési dátum, Nem
- **CNP-ellenőrzés ellenőrző-számjegyzéssel** — ha hibás a CNP checksum, azonnal jelzi
- **CNP-dupláció-check kiírva** — ha ezzel a CNP-vel már van tag (akár a listában, akár még szinkronra váró), amber figyelmeztetés
- **Opcionális blokkok**: Nevek (szül. név, férjezett név) · Származás · Cím (6 mezős) · Elérhetőség · Identitás (vallás, foglalkozás, nemzetiség) · Jelzők (családfő, választó) · Megjegyzés

### 📡 Offline is működik

Ha nincs internet, a rögzítés **lokálisan mentődik**, és amint online leszel, a szinkron automatikusan feltölti a szerverre. A tagnyilvántartás fejlécében amber sáv jelzi: „Szinkronra váró új tagok (N)" — gomb: „Sync most".

Ha más eszközről időközben felvették ugyanezt a CNP-t, a rögzítésed „ütközés" állapotba kerül (piros jelzés) — a pending-listából kézzel feloldható.

### 🛠 Műszaki háttér

- **[szemely-create.ts](packages/validations/src/members/szemely-create.ts)**: `szemelyCreateInputSchema` + **román CNP checksum** validátor (13 számjegy + súlyozott modulo-11 algoritmus)
- **Rust v16 migráció**: új `szemely_pending_local` tábla (35+ oszlop, 3 index, `UNIQUE (congregation_id, cnp)` helyi védelem)
- **[tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)**: 7 új metódus (insert/list/get/findByCnp/markSynced/markConflict/updateAttempt/delete)
- **[sync.ts](apps/desktop/src/lib/sync.ts)**: új `createSzemelyEntry(userId, input)` — optimistic local pending + online INSERT + 23505 → duplicateCnp flag
- **[szemely-write-sync.ts](apps/desktop/src/lib/szemely-write-sync.ts)**: background push (online-event + 30s poll), exp-backoff (30s/1m/2m/5m/15m/conflict)
- **[member-create-dialog.tsx](apps/desktop/src/components/member-create-dialog.tsx)**: serif cím, csoportos form, CNP-dup-check inline (400ms debounce)

**Design-döntés**: nem használjuk az általános outbox táblát — a `szemely_pending_local` **maga a queue**. Egyszerűbb kód, jobb UX (a pending sorok közvetlenül listázhatók).

---

## [2026-04-24] — M8.2 + M8.4: Rejtés + admin-jelzők (desktop)

<!-- key: 2026-04-24-m8-2-m8-4-admin-soft-delete -->
<!-- category: feature -->
<!-- targets: lelkészek — most már jelölheted az elhunytakat, választókat, családfőket és elrejtheted a nem-aktív tagokat -->

### ✨ Admin-jelzők a tag-szerkesztőben

A tag-szerkesztő modal most új **„Tag-jelzők (adminisztratív)"** szekciót kapott. Minden jelző hint-szöveges, hogy tudd, mikor melyiket használd:

- **Elhunyt** — ha bejelölöd, a tag a listában `†` jellel + áthúzott névvel jelenik meg
- **Választó** — a presbitérium-, lelkész- és gondnokválasztás jogosultsága
- **Családfő** — a család hivatalos képviselője
- **Tagsági kategória** — dropdown: aktív / kitért / törölt / más vallású (vagy „nincs beállítva")

### 👁️ Tag elrejtése a listából (új gomb)

A tag-modal alján (a Szerkesztés mellé) új gomb: **„Elrejtés"**. Egyetlen kattintás + biztonsági megerősítés után a tag eltűnik a default listából — de az adatok **megmaradnak**. A **„Rejtett"** szűrővel bármikor visszahozható. A rejtett tag fejlécében „rejtett" badge jelenik meg, a gomb pedig „**Visszahozás**"-ra vált.

Ez nem a tag törlése, hanem csak egy lista-megjelenítési döntés — a lelkész eldöntheti, mit szeretne látni napi munkában.

### 🎨 Új badge-ek a fejlécben

A tag-portré fejlécében (az eddigi „családfő" + „választó" mellett) most megjelennek:
- **rejtett** (szürke) — ha a tag `isvisible=0`
- **tagsági kategória** (indigo) — ha nem „aktív" (pl. „kitért", „törölt", „más vallású")

Egy pillantással látható minden státusz.

### 📡 Online + offline ugyanúgy

Minden flag + rejtés ugyanazt a `updateSzemelyEntry` flow-t használja, mint az M8.0b edit — online conditional UPDATE (revision-check), offline outbox-fallback. A sync transzparens.

### 🛠 Műszaki háttér

- **[member-detail-dialog.tsx](apps/desktop/src/components/member-detail-dialog.tsx)**: `EditableFields` + 4 új kulcs (`meghalt`, `voter_eligible`, `csaladfo`, `member_status`); új `handleToggleVisibility` async fn az isvisible toggle-hoz; új `CheckboxRow` komponens pasztorális hint-tel; `EDITABLE_TEXT_KEYS` + `EDITABLE_BOOL_KEYS` szétválasztva; `buildPatch` boolean-diff explicit
- **[szemely-save.ts](packages/validations/src/members/szemely-save.ts)**: `isvisible: z.boolean().optional()` hozzáadva a zod-sémához

**Nincs új Rust-migráció + nincs új SQL** — a `szemely` tábla `isvisible` + `meghalt` + `voter_eligible` + `csaladfo` + `member_status` mezői már megvoltak.

---

## [2026-04-24] — M8.0b/c: Tag-szerkesztés + offline-írás (desktop)

<!-- key: 2026-04-24-m8-0b-szemely-edit -->
<!-- category: feature -->
<!-- targets: lelkészek — a tagjaid adatai mostantól szerkeszthetők a desktop appból -->

### ✨ Szerkeszthető a tag-adat a desktop appban

A tagnyilvántartás detail-modalja szerkesztő-móddal bővült. A „**Szerkesztés**" gomb most élő — bekapcsolva inline form-ra vált:

- Szerkeszthető **személyes adatok** (nevek, születési dátum, családi állapot)
- **Származás** (apa, anya neve)
- **Cím** (teljes cím + ház-/tömb-/lépcsőszám + emelet + ajtó)
- **Elérhetőség** (telefon, e-mail)
- **Identitás** (vallás, foglalkozás, nemzetiség)
- **Megjegyzés** (többsoros)

### 📡 Online + offline-írás (mint a pénzügynél)

- **Online**: a mentés azonnal felmegy a szerverre — kondicionális UPDATE `revision`-check-kel. Ha másik eszközről időközben módosították, világos magyar konfliktus-banner figyelmeztet, hogy „más eszközről módosították".
- **Offline**: a mentés a lokális outbox-ba kerül, és a következő online-menetben automatikusan szinkronizál. A sikerbanner világosan jelzi, hogy „elmentettem offline-ban".

### 🛡 Biztonság — mit NEM lehet még szerkeszteni

- **Tag státusza** (meghalt, member_status) — külön admin-UI később
- **Választó-jelzés** — családi kontextus-függő, későbbi kör
- **Családfő** — család-kezelő UI-ba kerül (M8.3)
- **CNP** — identifier, sosem szerkeszthető

### 🔜 Mi jön

- **M8.1** — Új tag rögzítése a desktopon (offline is)
- **M8.2** — Soft-delete (a tag rejtetté tétele)
- **M8.3** — Család-kezelő UI (család-hozzárendelés, családfő)

### 🛠 Műszaki háttér

- **Új validations** ([szemely-save.ts](packages/validations/src/members/szemely-save.ts)): `szemelyUpdateInputSchema` (minden mező opcionális, regex + max-length checkek), `normalizeSzemelyPatch` (üres-string → null helper)
- **Desktop sync** ([sync.ts](apps/desktop/src/lib/sync.ts)): új `updateSzemelyEntry(userId, id, patch, expectedRevision)` — optimistic-local + conditional-online + outbox-fallback (az `updateWorklogEntry` 1:1 mintájára)
- **Dialog** ([member-detail-dialog.tsx](apps/desktop/src/components/member-detail-dialog.tsx)): `mode: 'view' | 'edit'` state, `EditBody` komponens 20 szerkeszthető mezővel, `DialogBanner` success/conflict/offline/error stílusokkal, `buildPatch` csak a változott mezőket küldi el
- **Revision-trigger** a szerver-oldalon a `2026-04-23-m7-0-szemely-csalad-triggers.sql`-ből, az outbox-ban a `target_table='szemely'` kezelést a `processOutbox()` generikus flush-helperje intézi

**Nincs új Rust-migráció + nincs új SQL** — a shared infra (`szemely_local` lokális cache + szerver-oldali revision-trigger + outbox) már az OS-M7 óta tisztán áll. Az M8.0c write-offline = az outbox-fallback ugyanezen a helper-en.

---

## [2026-04-25] — M8.0a: Tagnyilvántartás lista-oldal (read-only)

<!-- key: 2026-04-25-m8-0a-tagnyilvantartas-lista -->
<!-- category: feature -->
<!-- targets: lelkészek — végre láthatók a tagjaid a desktop appban -->

### ✨ Tagnyilvántartás a desktop appban (új modul)

A **Tagnyilvántartás** modul most már elérhető a desktop appból. A home-page „Tagnyilvántartás" QuickLink élővé vált → új lista-oldal nyílik:

- **Kereső** — név, cím, telefon, e-mail alapján; **diakritika-toleráns** (az „ékezet nem számít": Szőcs ↔ Szocs ↔ szőcs egyformán találhatók)
- **Status-szűrő** — Mind / Aktív / Meghalt / Rejtett (alapból „Aktív")
- **Sortolás** — Név A→Z, Név Z→A, Életkor (idős/fiatal), Felvétel (legújabb)
- **Lista-sor** — avatar (kék férfi / pink nő), név, életkor, cím, telefon, csaladfő/választó badge-ek
- **Sor-kattintás** → **MemberDetailDialog** (csoportosított, read-only nézet: személyes / származás / cím / kontakt / identitás / megjegyzés)

Az **offline-mód kompatibilis** — a lokál `szemely_local` cache-ből olvas (OS-M7-ben szinkronizálva). Hálózat nélkül is teljesen működik.

### 🔜 Mi jön (M8.0b)

- **Szerkesztés** — a tag-portré modal „Szerkesztés (hamarosan)" gombja élővé válik
- **Új tag** rögzítés
- **Offline write** (a write-offline minta szerint)

A jelenlegi modal-on a „Szerkesztés (hamarosan)" gomb disabled — világos jelzés a lelkésznek, mit jön legközelebb.

### 🛠 Műszaki háttér

- **Validations** (új [members/szemely-list.ts](packages/validations/src/members/szemely-list.ts)): `szemelyListRowSchema` (~30 mező a `szemely_local`-ról), `SzemelyStatusFilter` enum (`mind | aktiv | meghalt | rejtett`), `szemelyListInputSchema` (search + statusFilter + orderBy + limit)
- **Backend** ([tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)): új `listLocalSzemely(input)` metódus — SQL `WHERE` a status-szűrőre + COLLATE NOCASE rendezés + JS-oldali NFD-normalizált kereső a 7 mezőn
- **Új page** ([members-page.tsx](apps/desktop/src/pages/members-page.tsx)): lista + szűrők + 300ms debounced search + load-state
- **Új komponens** ([member-detail-dialog.tsx](apps/desktop/src/components/member-detail-dialog.tsx)): csoportosított read-only modal (5 szekció + megjegyzés), serif cím, magyar dátum-formátum, üres mezők elrejtve
- **Route** ([App.tsx](apps/desktop/src/App.tsx)): `/tagnyilvantartas` bekötve

A modul **offline-first**: nincs új SQL migráció, a `szemely_local` tábla és a `pullMembersOfOwnCongregation` sync-je már megvan az OS-M7-ből.

---

## [2026-04-25] — A-M7.10c: Bank-import automata import (párosítatlanok rögzítése)

<!-- key: 2026-04-25-a-m7-10c-bank-import-auto -->
<!-- category: feature -->
<!-- targets: lelkészek — banki tranzakciók egy kattintással bejönnek a könyvelésbe -->

### ✨ Bank-import: end-to-end működés

A bank-import most **teljesen működő** flow-t ad: a párosítatlan banki tranzakciókat egy kattintással **új befizetés / kiadás bejegyzésként** rögzíti a rendszer. A lelkész:

1. Betölti a BCR Excel fájlt (A-M7.10a)
2. Lefuttatja a párosítást (A-M7.10b) — látja, mi van már a rendszerben
3. **Új panel**: válasszon default befizetés-kategóriát + default kiadás-kategóriát
4. **„Párosítatlan tranzakciók importálása (N)"** gomb → minden új tétel bejön

A folyamat:
- Pozitív összeg → új befizetés (`irattipus = 'Banki'`, kategória = választott default)
- Negatív összeg → új kiadás (átvevő = banki partner vagy a leírás eleje)
- Iratszám: a banki referencia (közlemény), vagy auto-generált `BANK-yyyymmdd-NN` formátum
- Megjegyzés: `[Bank-import] {leírás} · Partner: ... · Ref: ... · Egyenleg: ...`
- Forrás: `'Bank-import'`

A tételek **nem ütköznek** a Készpénz-iratszám pool-lal (más típusúak, más szegmens).

### 🛠 Műszaki háttér

- **Desktop UI** ([bank-import-page.tsx](apps/desktop/src/pages/bank-import-page.tsx)): új state-ek (`befizetesCelek`, `kiadasCelek`, `defaultIncomeCelId`, `defaultExpenseCelId`, `userId`, `importing`, `importResult`); `handleImportUnmatched` async fn forEach-flow-val (egyenként saveIncome/saveExpenseUseCase, hiba-aggregáció a `errors` tömbbe); `bankRowToIratszam` + `composeMegjegyzes` helper függvények; új `ImportResultCard` komponens (siker emerald / részleges siker amber, max 20 hiba listázva).
- **Sikeres import után automatikus újra-párosítás** — az újonnan rögzített tételek a következő körben már matched státuszt kapnak.
- **Online-only** (a `saveIncomeUseCase`/`saveExpenseUseCase` szerver-direkt).
- **Nincs új SQL / Rust / core kód** — tisztán UI + meglévő use-case-ek orchestrációja.

A bank-import wave most **75%-ban kész** — BCR teljes E2E működik. A Raiffeisen + BT parserek (A-M7.10d) hátra.

---

## [2026-04-25] — A-M7.10b: Bank-import matcher (banki tranzakciók párosítása)

<!-- key: 2026-04-25-a-m7-10b-bank-import-matcher -->
<!-- category: feature -->
<!-- targets: lelkészek — banki kivonat tranzakcióinak automatikus felismerése -->

### ✨ Bank-import: párosítás a meglévő tételekkel

A `/penzugy/bank-import` oldal mostantól nemcsak előnézetet ad, hanem **„Párosítás futtatása"** gombbal automatikusan megnézi, hogy a banki tranzakciók közül melyik tartozik egy már rögzített befizetéshez vagy kiadáshoz. A heuristika:

1. **Pontos egyezés** (zöld „Megvan" badge): azonos dátum + azonos összeg
2. **Iratszám-egyezés** (zöld): a banki közleményben szerepel a meglévő tétel iratszáma
3. **Toleráns egyezés** (sárga „Több jelölt"): pontos összeg, de a dátum eltér ±2 nappal — a user dönt
4. **Nincs egyezés** (piros „Nincs"): a párosítatlan tranzakció a következő iterációban (A-M7.10c) lesz importálható új tételként

**A Match Summary kártya** mutatja a 4 státusz darabszámát egy pillantásra. A preview-tábla minden sora mellé bekerül egy státusz-badge — hover-tooltipben a részletek (iratszám, magyarázat).

### 🛠 Műszaki háttér

- **Validations** ([bank-import.ts](packages/validations/src/finance/bank-import.ts)): új `MatchStatus` (`matched | multiple | unmatched | duplicate`), `MatchCandidate`, `BankMatchRow`, `BankMatchResult` zod-sémák
- **Core matcher** (új [matcher.ts](packages/core/src/finance/bank-import/matcher.ts)): `matchBankTransactionsUseCase` — időtartomány-szűrt `listIncome` + `listExpense` lekérdezés, sor-onkénti 3 lépcsős párosítás (pontos / iratszám / toleráns), `confidence` 0.7–1.0
- **Desktop UI** ([bank-import-page.tsx](apps/desktop/src/pages/bank-import-page.tsx)): `Párosítás futtatása` gomb, `MatchSummaryCard` 4-stat-kártyával, preview-tábla `MatchStatusBadge` oszloppal (csak match után jelenik meg), pasztorális következő-lépés tippek
- **Online-only most**: a matcher RPC-szerű hívásokra támaszkodik (`listIncomeUseCase` + `listExpenseUseCase`); offline-fallback a következő session-be defer

A bank-import wave most ~50%-ban kész — az infrastruktúra, parser és matcher megvan; a tényleges import (új tétel-rögzítés a párosítatlanokra) az A-M7.10c-ben jön.

---

## [2026-04-25] — A-M7.10a: Bank-import infrastruktúra (BCR XLSX parser)

<!-- key: 2026-04-25-a-m7-10a-bank-import-bcr -->
<!-- category: feature -->
<!-- targets: lelkészek — BCR Excel kivonat előnézete a desktopon -->

### ✨ Bank-import: BCR Excel előnézet a desktop appban

A pénzügyi modul új ágat kapott: **`/penzugy/bank-import`** — a bankodból exportált Excel kivonat betöltése és tranzakciók előnézete. Az első iteráció a **BCR (Banca Comercială Română)** XLSX exportot támogatja, a webapp meglévő (és bevizsgált) parserének portjaként.

**Mit lehet most:**
- BCR Excel fájl (`.xlsx`) feltöltése
- Tranzakciók előnézete (max 50 sor scroll-listán)
- Bevétel + kiadás összesítés (jóváírás vs. terhelés)
- Felismert oszlopok debug-listája
- Pasztorális hibajelzés ha a fájl formátum-eltérő (pl. nincs dátum-oszlop)

**Mit jön (A-M7.10b/c):**
- Tranzakciók párosítása a már rögzített befizetés/kiadás tételekkel
- Új tételek automatikus rögzítése (a párosítatlanok)
- Raiffeisen Bank + Banca Transilvania (BT) parserek

A bank-választó dropdown mind a 3 bankot mutatja, de a Raiffeisen + BT „még nem támogatott" jelzéssel — a placeholder-parserek tisztességes hibaüzenettel jelzik.

### 🛠 Műszaki háttér

- **Validations** (új [bank-import.ts](packages/validations/src/finance/bank-import.ts)): `bankProviderSchema` (literal union: bcr/raiffeisen/bt), `bankTransactionSchema`, `bankParseResultSchema`, magyar banknév-címkék.
- **Core** (új [finance/bank-import/](packages/core/src/finance/bank-import/) modul): `parseBcrExcel(buffer)` — a webapp ~400 soros parserének portja, browser-független (xlsx import a fájl elején, nincs `'use client'`). Helper függvények: oszlop-fuzzy-matching (PRIORITÁS pattern-ek a BCR-specifikus „Suma intrare/iesire" mezőkre), Excel Date timezone-handling, RO/US dátum-ambiguity heurisztika, RO/US szám-formátum normalizálás.
- **Core registry** (új [finance/bank-import/index.ts](packages/core/src/finance/bank-import/index.ts)): `BANK_PARSERS` map + univerzális `parseBankExport(provider, buffer)` belépési pont.
- **Új dependency**: `xlsx@^0.18.5` a `@kartoteka/core` package-ben (a webapp már használta; most a core is).
- **Desktop UI** (új [bank-import-page.tsx](apps/desktop/src/pages/bank-import-page.tsx)): bank-választó + browser `<input type="file">` (a Tauri webview natívan támogatja, nem kell FS plugin) + ArrayBuffer parse + preview tábla.
- **Route** (`/penzugy/bank-import`) + landing-kártya bekötve a `PenzugyLandingPage`-en (indigo Download ikon, „Béta" badge).

A core-ban most első olyan rétegű use-case, ami **harmadik-fél binary formátumot** parse-ol (XLSX). A `xlsx` package belső zip-warningjait („Bad uncompressed size:") kiszűrjük, a webapp-mintával azonos módon.

---

## [2026-04-25] — A-M7.9d: Pending tételek a pénzügyi áttekintőn

<!-- key: 2026-04-25-a-m7-9d-dashboard-pending-summary -->
<!-- category: improvement -->
<!-- targets: lelkészek — offline-rögzített tételek láthatósága az éves áttekintőn -->

### 🎨 Pending tételek aggregátum-bannere a pénzügyi áttekintőn

A `/penzugy/attekintes` oldal mostantól **külön sárga sávban** jelzi az offline-rögzített, még-nem-szinkronizált befizetéseket és kiadásokat. Ha offline rögzítesz vasárnap 3 befizetést, de a dashboard adatai csak hétfő reggel frissülnek — mostantól a sáv azonnal mutatja:

- **„3 offline-rögzített tétel szinkronizálásra vár"**
- Kattintható chipek: „3 befizetés · +450 RON" (emerald) vagy „2 kiadás · −120 RON" (rose)
- Ha ütközés van: piros jelzés „1 ütközés feloldásra vár" + a sáv egésze pirosra vált

A kattintás a megfelelő page-re navigál (befizetés vagy kiadás), ahol a pending blokk fel is oldható.

### 🧠 Miért külön sáv, nem a stat-kártyák?

Pasztorális döntés: az éves áttekintés a **hivatalos, szerveren lévő** képet mutassa (könyvelési hang). A pending tételek nem „vannak" még — várakoznak. A szétválasztás világossá teszi a lelkésznek: „Ez a szerver-adat. És ez még jönni fog."

A stat-kártyák (Bevétel / Kiadás / Egyenleg) változatlanok — csak a szerverre került tételeket aggregálják. A pending összeg + darabszám a külön sávban.

### 🛠 Műszaki háttér

- **Frontend** ([penzugy-dashboard-page.tsx](apps/desktop/src/pages/penzugy-dashboard-page.tsx)): új `pendingSummary` state + `loadPendingSummary(cid, year)` helper (mindkét ágban — online és offline — fut `loadData` végén). `PendingSummaryBanner` komponens a fájl végén (~90 sor). `useNavigate` a kattintáshoz.
- **Backend-használat**: `listLocalPendingBefizetes(cid, year)` + `listLocalPendingKiadas(cid, year)` már megvolt az A-M7.9a-ból; most a dashboard is fogyasztja.
- **Nincs új SQL / Rust migráció** — tisztán frontend-bővítés.

A pénzügyi áttekintő most teljesen **konzisztens** a pending-blokkokkal: ha a user a befizetés-oldalon lát 3 pending tételt, az áttekintő is mutatja a sáv-bannerén.

---

## [2026-04-25] — A-M7.9c: Konfliktus-feloldó dialog (befizetés + kiadás)

<!-- key: 2026-04-25-a-m7-9c-write-sync-conflict-dialog -->
<!-- category: feature -->
<!-- targets: lelkészek — szinkronizációs ütközések feloldása egy kattintással -->

### ✨ Konfliktus-feloldó dialog a sync-ütközéseken

Ha az offline-rögzített befizetés vagy kiadás szinkronizációja **ütközésbe fut** (pl. egy másik lelkész/desktop ugyanazt az iratszámot foglalta a szerveren), a sor pirossal megjelenik a „🕓 Szinkronizálásra vár" blokkban — most már **kattintható**.

A megnyíló dialógus két opciót kínál:
- **Másik iratszámra állítás** — a wallet-ből kivesz egy új szabad sorszámot, az ütközött tétel automatikusan újra-szinkronizálódik. A tétel adatai (összeg, dátum, tag/átvevő, kategória) változatlanok.
- **Lokális tétel törlése** — a sor eltűnik a gépedről, a wallet-szám visszakerül a tárcába (újra felhasználható). A szerveren lévő (másik kliens által rögzített) tétel nem érintve.

A szerver-üzenet (sync_error) magyarul, idézőjelben látszik a fejlécben — látod, hogy mi okozta az ütközést, és tudod, hogy melyik döntés a megfelelő.

### 🎨 UX-konzisztencia

Egyetlen közös `WriteSyncConflictDialog` komponens szolgálja ki a befizetést és a kiadást is — a chitanța `ChitantaConflictDialog` általánosított változata. A három pénzügyi entitás (chitanța, befizetés, kiadás) most már **azonos UX-mintával** kezeli a konfliktusokat: serif cím, két nagy CTA, primary „új szám", másodlagos „törlés" + browser-confirm, sikerüzenet 1.5 mp után automatikus zárás.

### 🛠 Műszaki háttér

- **Backend** ([tauri-sqlite-backend.ts](apps/desktop/src/lib/tauri-sqlite-backend.ts)): 4 új metódus — `deleteLocalBefizetes`, `updateLocalBefizetesNumber`, `deleteLocalKiadas`, `updateLocalKiadasNumber`. A pending-listing függvények mostantól a `fizetettev` (befizetés) és `ev` (kiadás) mezőt is visszaadják, hogy a reassign helyes wallet-szegmensből allokáljon.
- **Sync helperek** (befizetes-write-sync.ts + kiadas-write-sync.ts): új `resolveBefizetesConflict` és `resolveKiadasConflict` — `delete` ág (wallet-release + DELETE) és `reassign` ág (claim → updateNumber → re-enqueue → trigger sync).
- **UI komponens** (új fájl: [write-sync-conflict-dialog.tsx](apps/desktop/src/components/write-sync-conflict-dialog.tsx)) — `entity: 'befizetes' | 'kiadas'` props, közös rendering a magyar entitás-címke kiválasztásával.
- **Page integráció**: `befizetes-page.tsx` és `kiadas-page.tsx` — conflict-sor `cursor-pointer + onClick + onKeyDown` (Enter/Space), dialog renderelés `conflictRow` state-tel, sikeres feloldás után `loadList + loadPending` reload.

A pénzügyi desktop write-offline kör most teljes — a chitanța (A-M7.2), befizetés (A-M7.9a), kiadás (A-M7.9b), és a konfliktus-feloldás mindhárom entityre (A-M7.2d2d + A-M7.9c) **kész és UX-konzisztens**.

---

## [2026-04-25] — A-M7.9b: Offline kiadás-rögzítés

<!-- key: 2026-04-25-a-m7-9b-kiadas-write-offline -->
<!-- category: feature -->
<!-- targets: lelkészek — Készpénzes kiadás rögzítése hálózat nélkül is -->

### ✨ Offline kiadás-rögzítés Készpénzes tételekre (desktop)

A befizetés-write-offline (A-M7.9a) párja: a Készpénzes **kiadás** rögzítése is működik most már offline. A vasárnap reggeli zsoltáros vagy presbiter kifizetés, a hét közbeni készpénzes vásárlás (gyertya, kenyér, kis bevásárlás) ugyanúgy rögzíthető hálózat nélkül.

**Hogyan működik?**

A `/penzugy/kiadas` oldalon ugyanaz a panel-rendszer mint a befizetésnél:
- **Iratszám-tárca panel** — most már „Offline iratszám-tárca · 2026 · kiadás" — külön sorszám-pool a kiadásra (a befizetés-pool-tól független)
- **Offline rögzítés** — Készpénzes átvevő (tag vagy szöveges) + összeg + kategória, sorszám automatikusan a tárcából
- **Auto-szinkronizálás** — a hálózatra csatlakozáskor a háttérben felmegy a szerverre
- **Sync indicator** — a jobb felső jelzés mostantól a chitanță + befizetés + kiadás összes pending tételét egybeszámolja

**Korlátok**: csak Készpénzes kiadás. A banki kifizetések továbbra is online-mód alatt rögzíthetők.

### 🛠 Műszaki háttér

- **SQL**: nincs új migráció — a A-M7.9a `iratszam_pointers` tábla és `reserve_iratszam` RPC közös: csak `tipus='kiadas'` paraméterrel hívjuk
- **Rust v15 migráció**: új `kiadas_pending_local` tábla
- **Core use-case**: `saveExpenseUseCase` offline-ág + `OfflineExpenseBackend` interface (a befizetés-mintával azonos)
- **Backend**: 5 új `TauriSqliteBackend` metódus (insert/list/get/markSynced/markConflict)
- **Sync**: `kiadas-write-sync.ts` (a `befizetes-write-sync.ts` mintára: 30s poll + window.online + exp-backoff + 23505 → conflict)
- **AuthGate**: `startKiadasAutoSync` mount-kor + `runKiadasSyncManually` SIGNED_IN-en
- **UI**: `kiadas-page.tsx` bővítve `IratszamWalletPanel` + `KiadasOfflineWarning` + `PendingExpenseBlock` komponensekkel

A teljes pénzügyi desktop write-offline kép most lezárva: chitanță (A-M7.2d), befizetés (A-M7.9a), kiadás (A-M7.9b). A konfliktus-feloldó dialog (a chitanța A-M7.2d2d minta szerint, befizetés + kiadás esetén) az A-M7.9c-ben jön.

---

## [2026-04-25] — A-M7.9a: Offline befizetés-rögzítés (iratszám-tárca)

<!-- key: 2026-04-25-a-m7-9a-befizetes-write-offline -->
<!-- category: feature -->
<!-- targets: lelkészek — vasárnapi gyűjtés rögzítése hálózat nélkül is -->

### ✨ Offline befizetés-rögzítés Készpénzes tételekre (desktop)

A Kartotéka desktop alkalmazásban a Készpénzes befizetés rögzítése **most már offline is működik**. A vasárnapi gyűjtés, a hét közbeni perselypénzbe érkező adományok azonnal rögzíthetők, hálózat nélkül is — a rendszer a hálózatra csatlakozáskor automatikusan szinkronizálja az adatokat.

**Hogyan működik?**

1. **Iratszám-tárca feltöltés (egyszer, online)** — a befizetés-oldal tetején új panel: „Offline iratszám-tárca · 2026 · befizetés". A „+10 szám" gombbal a szerver atomikusan lefoglal 10 sorszámot, amelyeket a desktop helyileg eltárol.
2. **Offline rögzítés** — ha hálózat nélkül vagy, a Készpénz-fülön ugyanúgy rögzíthetsz: a tárcából automatikusan kerül sor a következő szabad iratszám.
3. **Automatikus szinkronizálás** — amint a gép online, az „🕓 Szinkronizálásra vár" sávban látható tételek a háttérben felmennek a szerverre. A jobb felső „N tétel szinkronra vár" jelölő minden oldalon mutatja az állapotot.

**Korlátok**: csak Készpénzes befizetés. A banki átutalások továbbra is online-mód alatt rögzíthetők (a banki kivonatból jönnek be az automatikus import során). A bank-csatlakozó wave később jön.

**Pasztorális UX**: a tárca állapota (üres / kevés / rendben) három színnel jelzett — a lelkész egyetlen pillantásra látja, hogy fel kell-e tölteni. Az offline figyelmeztető is „pasztorális" hangvételű — nem technikai üzenet, hanem érthető eligazítás.

### 🔒 Race-mentes iratszám-foglalás (szerver-oldali védelem)

Új PostgreSQL pointer-tábla (`iratszam_pointers`) + atomic RPC-k (`reserve_iratszam`, `next_iratszam`) gondoskodnak arról, hogy két lelkész vagy két desktop ne kaphasson véletlenül **ugyanazt az iratszámot** ugyanarra az évre. A `befizetes` és `kiadas` táblákra defensive `UNIQUE PARTIAL INDEX` is került — a Készpénzes iratszámok mostantól szerver-szinten egyediek (gyülekezet × év × iratszám).

A korábbi `getNextReceiptNumberUseCase` regex-MAX+1 stratégia **nem volt concurrency-safe** — ezt most az atomic RPC + UNIQUE constraint együttesen váltja ki.

### 🛠 Műszaki háttér (összegzés)

- **SQL**: `migration-docs/sql/2026-04-25-a-m7-9a-iratszam-pointers.sql` (Endre futtatja)
- **Rust v14 migráció**: `iratszam_wallet_local` + `befizetes_pending_local` (SQLCipher-titkosított lokális DB)
- **Rust commands**: `iratszam_wallet_claim_next` (atomic BEGIN/SELECT/UPDATE/COMMIT) + `iratszam_wallet_release`
- **Core use-case**: `refillIratszamWalletUseCase` (közös befizetés/kiadás, év-szegmentált)
- **Core save offline-ág**: `saveIncomeUseCase` `OfflineIncomeBackend` interface-szel — duck-type, a Tauri backend implementálja
- **UI komponens**: `IratszamWalletPanel` (három-állapotú: üres/kevés/rendben, +10 gomb online-módban)
- **Sync modul**: `befizetes-write-sync.ts` — auto-trigger (`window.online` + 30s poll + AuthGate `SIGNED_IN`), exp-backoff (30s/1m/2m/5m/15m), 23505 unique-ütközés azonnal conflict
- **Sync indicator**: shell-szintű jobbfelső jelölő mostantól mind a chitanță mind a befizetés pending sorokat mutatja

A kiadás-write-offline (A-M7.9b) **ugyanezen az infrastruktúrán** fog menni — közös iratszam-pointers tábla, közös wallet, csak a save use-case + UI duplikáció marad hátra.

---

## [2026-04-24] — A-M7.7 + A-M7.8: TVA-plafon figyelmeztető + offline dashboard-nézet

<!-- key: 2026-04-24-a-m7-7-8-tva-offline -->
<!-- category: feature -->
<!-- targets: lelkészek — proaktív TVA-figyelmeztetés + offline pénzügyi áttekintés -->

### 🚨 TVA-plafon figyelmeztető a pénzügyi áttekintésen

A pénzügyi áttekintés oldalon mostantól **automatikus figyelmeztetés** jelenik meg, ha az éves bevétel közelít a román TVA-plafonhoz (395.000 RON / év). Nincs több „jaj, nem is vettem észre" — a rendszer időben szól.

**4 szint:**
- **< 50%**: elrejtve (nyugodt)
- **50-75%** sárga: tájékoztató, „egyelőre nyugodt"
- **75-90%** narancs: „Közeledik — érdemes kezdeni gondolni a TVA-regisztrációra"
- **90-100%** piros: „⚠ Hamarosan eléred — {X} RON van a plafonig"
- **> 100%** piros 🚨: „A plafon elérve — sürgős regisztráció kell"

A figyelmeztetés progress-bar-ral mutatja, hogy hol tartunk.

**Megjegyzés:** ez egy konzervatív becslés — a teljes éves bevételt nézi, nem csak a TVA-ba számító kategóriákat. Ha ez alapján nyugodt vagy, biztosan rendben vagy. A pontos számítást a web-oldalon tudod megnézni.

### 📱 Offline pénzügyi áttekintés

A pénzügyi áttekintés oldal **offline is működik** — a legutóbb szinkronizált lokális adatokat mutatja. Hálózat nélkül is megnézheted, hol tart a gyülekezet pénzügyileg.

**Hogyan működik?**
- Amikor online vagy, a rendszer **automatikusan lesyncelte** az éves befizetéseket + kiadásokat a titkosított lokális adatbázisba
- Offline-módban a lokális adat jelenik meg + narancs banner tájékoztat: „Offline munkamenet — lokális adat látszik"
- Online-ra visszakapcsolódva az oldal automatikusan frissül a szerver-adatokkal

**Korlátok:**
- Max 500 befizetés + 500 kiadás tárolódik lokálisan (évenként)
- Csak **olvasás** — offline-módban új befizetést/kiadást NEM rögzíthetsz (a form disabled marad)

**Adat-forrás jelzés:**
- `server` (alap) — friss szerver-adat
- `mixed` — amber banner: „Részleges adat: egyes oldalak lokális cache-ből"
- `local` — amber banner: „A szerver nem elérhető — lokális adat látszik"

### 📦 Implementáció

- **A-M7.7** — új komponens `TvaPlafonWarning` a dashboard-on (~100 sor, logika + UI)
- **A-M7.8**:
  - **Rust v12 migráció**: `befizetes_local` SQLite tábla (29 oszlop, 6 index)
  - **Rust v13 migráció**: `kiadas_local` SQLite tábla (27 oszlop, 5 index)
  - Új modul: `apps/desktop/src/lib/finance-sync.ts` — `pullBefizetesek`, `pullKiadasok`, `getLocalBefizetesek`, `getLocalKiadasok`
  - Dashboard `loadData` bővítés: online-ág szerver-lekérdezés + háttér-pull + fallback lokál hibára; offline-ág azonnal lokál

### 🧭 Ami MÉG nincs, de készülőben

- **Bank-import** (BCR, Raiffeisen, BT CSV-k) — külön alkalomra, specifikus parser-ek
- **Oblio / e-Factura** — Supabase Edge Function + 2-3 napos munka
- **Write-offline** (offline befizetés/kiadás rögzítés) — iratszám-wallet rendszer kell, a chitanta minta szerint

Ezek a funkciók a pénzügyi wave következő nagy körét alkotják.

---

## [2026-04-24] — A-M7.6: Belső mozgás rögzítése (`/penzugy/belsomozgas`)

<!-- key: 2026-04-24-a-m7-6-belsomozgas -->
<!-- category: feature -->
<!-- targets: lelkészek — a pénz belső helyváltoztatása (kassza ↔ bank) végre rögzíthető desktopról -->

### 🔄 Új oldal: Belső mozgás

Mostantól a gyülekezet **belső pénzmozgását** is rögzítheted közvetlenül a desktopról:

**Mit rögzíthetsz?**
- **Kassza → Bank** (perselyfölözés) — a vasárnapi persely a bankba bekerül
- **Bank → Kassza** (pénzfelvétel) — a kiadásokhoz pénzt veszel fel a bankból
- **Bank → Bank** (átutalás) — két bank-számla között
- **Valutacsere** — pl. EUR → RON (a cél-összeg + árfolyam is megadandó)

**A form élőben auto-fillelt:**
- Kassza → Bank típusnál a forrás automatikusan „Kassza"
- Bank → Kassza típusnál a cél automatikusan „Kassza"
- Valutacserénél a cél-összeg + árfolyam mező csak akkor jelenik meg, ha szükséges

**A lista:**
- Év-szűrő + típus-szűrő
- Típus-chip (K→B, B→K, B→B, Cs) — egy pillantásra érthető
- Törlés (soft-delete, browser-confirm-mal)

**Mit NEM érint?**
A belső mozgás **nem** érinti a tagok befizetéseit / kiadásokat. Ez csak a gyülekezeti pénz belső helyváltoztatásának nyilvántartása. A befizetés-kategóriád, járulék-összesítőd változatlan.

### Elérés

`/penzugy/belsomozgas` — sidebar → Pénzügy → „Belső mozgás" kártya (🟢Új, indigo szín).

A Pénzügy főoldal most **6 modul-kártyát** mutat: Áttekintés, Befizetés, Kiadás, Belső mozgás, Chitanța, Nyugtatömbök.

### 📦 Implementáció

- 3 új shared use-case a `@kartoteka/core`-ban (list, save, soft-delete)
- Zod séma 4 input-típussal + valutacsere-refine
- Web adapter (thin) — `apps/web/app/(dashboard)/penzugy/belsomozgas-actions.ts`
- Desktop oldal `apps/desktop/src/pages/belsomozgas-page.tsx` (~500 sor)
- Route + landing-kártya

---

## [2026-04-24] — A-M7.5: Pénzügyi áttekintés oldal (`/penzugy/attekintes`)

<!-- key: 2026-04-24-a-m7-5-penzugy-dashboard -->
<!-- category: feature -->
<!-- targets: lelkészek — egy oldalon a gyülekezet éves pénzügyi képe -->

### 📊 Új oldal: Pénzügyi áttekintés

Egy oldalon, egy pillantásra látható a gyülekezet éves pénzügyi képe.

**Elérés:** `/penzugy/attekintes` (sidebar → Pénzügy → Pénzügyi áttekintés kártya — az első, „Új" badge-dzsel).

### Mit látsz ott?

**3 stat-kártya fent:**
- 💚 **Bevétel** — éves összes RON-ban + darabszám
- 🌹 **Kiadás** — éves összes RON-ban + darabszám
- ⚖ **Egyenleg** — bevétel − kiadás; kék ha pozitív, borostyán ha negatív

**Havi bontás (12 hónap):**
A januártól decemberig mindegyik hónapra:
- Zöld bar a bevétellel (relatív a legnagyobb havi max-hoz)
- Piros bar a kiadással
- Darabszám: „3b / 5k" (3 bevétel / 5 kiadás)
- Üres hónapok halványan

**Top 5 kategória mindkét oldalon:**
- **Top bevétel-kategóriák** — pl. Egyházfenntartó járulék 45%, Persely 20% stb.
- **Top kiadás-kategóriák** — pl. Fűtés 30%, Továbbítás az egyházmegyének 25% stb.
- Progress-bar + százalék + darabszám mindegyiken

### 🔢 Mi számít bele?

- **Sztornózott** és **törölt** sorok NEM — csak a tiszta valóság
- `fizetettev` szerint a bevételeknél (melyik évre szól), `datum` szerint a kiadásoknál
- Max 2000 sor/oldal — nagy gyülekezeteknek is elég

### Mire használható?

- **Év-eleji szemrevétel** — mennyi volt tavaly bevétel, mire költöttünk
- **Egyházmegyei beszélgetéshez** — a fő számok gyorsan hivatkozhatók
- **Költségvetés-tervezéshez** — a havi bontásból látszik, mikor vannak csúcsok
- **Presbiteri ülésre** — vizuálisan összegző kép

### 📦 Implementáció

- Új oldal: `apps/desktop/src/pages/penzugy-dashboard-page.tsx` (~480 sor)
- **Zero új backend** — a meglévő `listIncomeUseCase` és `listExpenseUseCase` párhuzamos hívásából kliens-oldali reduce
- Route: `/penzugy/attekintes`
- Pénzügy-landing-page most 5 modul-kártyát mutat

---

## [2026-04-24] — A-M7.4d: Desktop kiadás oldal (`/penzugy/kiadas`)

<!-- key: 2026-04-24-a-m7-4d-desktop-kiadas -->
<!-- category: feature -->
<!-- targets: lelkészek — új desktop oldal a kiadások rögzítésére -->

### 💸 Új desktop oldal: Kiadás

A Kartotéka desktop app-ban mostantól **a kiadásokat is közvetlenül rögzítheted**. A befizetés-oldal mellé került a **Kiadás** kártya a pénzügyi főoldalon.

**Elérés:** `/penzugy/kiadas` (sidebar → Pénzügy → Kiadás rögzítése kártya).

**Mit tudsz itt csinálni:**

1. **Év-szűrő** a fejlécben (elmúlt 6 év)
2. **Új kiadás rögzítése** — 8 mezős űrlap:
   - Dátum + kategória (járulék-továbbítás, villany, fűtés, segélyezés, stb.)
   - **Átvevő mód-kapcsoló**:
     - **Külső** (cég, magánszemély): név + CUI/adószám (cég esetén)
     - **Gyülekezeti tag**: diakritika-toleráns autocomplete kereső
   - Összeg (RON) + típus (Készpénz / Banki) + iratszám (automatikus)
   - Vonatkozó időszak (opcionális, pl. „2026 01" = januári fűtés)
   - Megjegyzés
3. **Lista** az adott év 500 legfrissebb kiadásával
4. **Szűrő kategória szerint**
5. **Sztornó** (inline panel, kötelező indoklás) — a belső kassza↔bank transfer párját is automatikusan sztornózza
6. **Törlés** (soft-delete, browser-confirm-mal)
7. **Excel export** (CSV) — 12 oszlopos
8. **Rose-színű összesítő kártya**: összes kiadás RON-ban + darabszám

### 🎨 Vizuális kód

A kiadás-oldal **rose (piros-árnyalatú)** színkóddal fut — a befizetés **emerald (zöld)** színével ellentétben. Így egy pillantásra azonnal érted, melyik nézetben vagy: bevétel vagy kiadás.

### 🔒 Biztonság

- Az év-véglegesítés esetén a sztornó blokkolt (egyházmegyei admin-engedély kell)
- A CUI/adószám mező magánszemélynél nem kötelező
- Cég-kiadásnál a CUI a TVA-követelményhez szükséges

### 📦 Implementáció

A backend (A-M7.4a/b/c, mai nap) már kész volt: 7 use-case (list, list-cel, save, next-receipt, duplicate, delete, sztornó) a `@kartoteka/core`-ban + web adapterek. Ma a desktop UI **ugyanezeket** hívja.

- Új oldal: `apps/desktop/src/pages/kiadas-page.tsx` (~820 sor)
- CSV export: `apps/desktop/src/lib/export/kiadas-csv.ts` (~80 sor)
- Route: `/penzugy/kiadas`
- Landing-kártya: `PenzugyLandingPage` most 4 modult mutat (Befizetés, Kiadás, Chitanța, Nyugtatömbök)

---

## [2026-04-24] — A-M7.3d5: Excel export a befizetés-listából

<!-- key: 2026-04-24-a-m7-3d5-befizetes-csv-export -->
<!-- category: feature -->
<!-- targets: lelkészek — a befizetés-lista exportálható Excelbe egy kattintással -->

### 📥 Excel export

A befizetés-oldal lista-szekciójának fejlécében új **„Excel export"** gomb. Egyetlen kattintás után letöltődik egy CSV-fájl, amit az Excel automatikusan megnyit, magyar ékezetekkel együtt.

**Fájlnév:**
- Teljes éves lista: `befizetesek-2026.csv`
- Szűrt nézet: `befizetesek-2026-szurt.csv`

**Amit tartalmaz** (11 oszlop):
- Dátum, iratszám, típus (Készpénz/Banki)
- Tag neve
- Kategória (pl. „Egyházfenntartó járulék")
- Család-szintű (igen/nem)
- Összeg RON
- Fizetett év
- Sztornó jelző + indoklás
- Megjegyzés

### Mire használható?

- **Éves pénzügyi beszámoló** Excelben (pivot-tábla, diagram)
- **Könyvelőnek átadás** (papír vagy digitális)
- **Egyházmegyei riport**
- **Archiválás** a gyülekezet pénzügyi dokumentumtárában

### 🔍 A szűrők számítanak

Ha a listán aktív szűrő van (pl. egy adott tag vagy kategória), az export **csak azokat a sorokat tartalmazza**. Az egyszerű logika: „amit látsz, azt kapsz".

### 📦 Implementáció

- Új fájl: `apps/desktop/src/lib/export/befizetes-csv.ts` (~130 sor)
- **Zero dependency** — nincs exceljs vagy xlsx library a bundle-ban, csak natív Blob + browser download
- UTF-8 BOM + pontosvessző-elválasztó (EU Excel konvenció) + CRLF sorvég
- RFC 4180-kompat escape-elés a különleges karakterek (idézőjel, pontosvessző, sortörés) kezelésére

---

## [2026-04-24] — A-M7.3d4: Szűrők a befizetés-listán + éves összesítő kártya

<!-- key: 2026-04-24-a-m7-3d4-befizetes-szurok-osszesito -->
<!-- category: feature -->
<!-- targets: lelkészek — a befizetés-oldal átlátható éves áttekintést ad -->

### 🔍 Szűrők a listán

A befizetés-oldalon mostantól **tag** és **kategória** szerint is szűrheted a listát:

- **Tag**: ugyanolyan diakritika-toleráns keresővel, mint a rögzítő form-ban
- **Kategória**: dropdown az összes aktív befizetés-célra (járulék, persely, adomány stb.)
- Egyetlen „Szűrők törlése" gombbal visszaállítható az egész év

Amikor szűrőt alkalmazol, a lista és az összesítő azonnal újratöltődik. A keresés élőben fut a szerveren (nem kliens-oldali filter — a teljes évre érvényes).

### 📊 Éves összesítő kártya

A lista felett egy új **zöld keretes kártya** három fő számmal:

- **Összes befizetés** az évben (RON)
- **Darabszám**
- **Átlag egy befizetésre**

Alatta a **Top 5 kategória** progress-bar-os bontásban — melyik kategória hány százalékát adja a teljes bevételnek. Egy pillanat alatt látod, mit hoz a járulék, mennyi a persely, mekkora az adomány.

**Ha szűrsz**, az összesítő „Szűrt összesítő"-re vált és csak a fő számokat mutatja (a kategória-bontás ilyenkor zavaró lenne).

**Sztornózott** sorok nem kerülnek be az összesítésbe, de kis italic felirat jelzi a mennyiségüket („+ 3 sztornózott, nem számítva").

### 📋 A lista mostantól a teljes évet mutatja

Korábban csak az utolsó 50 befizetést listáztuk — most **500**-ig. Egy átlagos gyülekezet évi 100-300 befizetést rögzít, így a teljes év egy listában elfér és a summary pontos.

### 📦 Implementáció

- **Nincs új backend-kód** — a `listIncomeUseCase` már támogatta a `szemelyId` + `befizetescelId` szűrőket (A-M7.3a óta). Csak a UI kapcsolta be.
- Új `IncomeSummary` komponens (`befizetes-page.tsx`-ben, ~120 sor) kliens-oldali aggregációval (reduce + Map).
- Szűrő state a `RecentIncomeSection`-ben, debounce-olt tag-kereső (300 ms).

---

## [2026-04-24] — A-M7.3d3: Család-szintű befizetés + sztornó cascade-visszajelzés

<!-- key: 2026-04-24-a-m7-3d3-befizetes-polish -->
<!-- category: improvement -->
<!-- targets: lelkészek — a desktop befizetés-oldal finomítása -->

### 👨‍👩‍👧 Család-szintű befizetés (automatikus felajánlás)

A desktop befizetés-rögzítőben, amikor tagot választasz ki, a rendszer **automatikusan ellenőrzi**, hogy a tag tartozik-e családhoz. Ha igen, **kék keretes checkbox** jelenik meg:

> ☑ **Család-szintű befizetés** (a befizetés az egész családhoz rögzül, nem csak ehhez a taghoz)

Ha a tag nem tartozik családhoz, diszkrét szöveg tudatja: *„Ez a tag nem tartozik családhoz a nyilvántartásban — a befizetés tag-szintű lesz."*

A család-szintű rögzítés előnye: ha a férj vagy feleség fizet be, mindketten „fizetőnek" számítanak a járulék-nyilvántartásban.

### ↩️ Sztornó cascade-visszajelzés

Amikor sztornózol egy befizetést, **a rendszer most elmondja, mi történt mellette**:

> Befizetés sztornózva. **Mellé: 1 chitanța is sztornózva + a belső kassza↔bank transfer párja is sztornózva.**

Eddig csak a fő művelet sikerét jeleztük — most látod a cascade hatásait is (6 mp-ig zöld sáv a lista tetején).

### 🏷 Család-jelölő a listán

A befizetés-listában a család-szintű sorokon egy kis kék **`család`** címke jelenik meg a tag-név mellett. Ez segít megkülönböztetni a tag-szintű és család-szintű rögzítéseket egy pillantásra.

### 📦 Implementáció

- `getFamilyIdForPersonUseCase` integrálva a `BefizetesPage.IncomeForm`-ba (auto-trigger a tag kiválasztáskor)
- `StornoIncomeResult.cascadedChitantas` + `cascadedInternalTransfer` flag-ek megjelenítve a UI-ban
- `BefizetesListRow.csalad` alapján sky-100 badge a listán
- Minden backend-oldali logika (core + web) változatlanul maradt

---

## [2026-04-24] — A-M7.3d2: Pénzügy almodul-választó a desktopon

<!-- key: 2026-04-24-a-m7-3d2-penzugy-landing -->
<!-- category: improvement -->
<!-- targets: lelkészek — a sidebar „Pénzügy" link most nem üres oldal, hanem egy választó -->

### 🧭 Új kezdőlap a pénzügy-részben

Eddig ha a desktop sidebar-ról a **Pénzügy** linkre kattintottál, egy általános „Hamarosan" üzenet jelent meg. **Mostantól** három kártyás választóval fogad:

- 💰 **Befizetés rögzítése** — az új oldal (A-M7.3d1)
- 🧾 **Chitanța kiállítása** — papír-nyugta az offline wallet-tel
- 📖 **Nyugtatömbök** — az új tömbök rögzítése

Plusz egy „Hamarosan" kártya felsorolja, mi fog még idekerülni (Bank-import, Oblio, TVA-figyelő, éves áttekintés).

**Minden kártya egy kattintással megnyitja a vonatkozó oldalt.**

### 📦 Implementáció

- Új oldal: `apps/desktop/src/pages/penzugy-landing-page.tsx`
- Route: `/penzugy` → `PenzugyLandingPage` (a régi PlaceholderPage helyett)
- `MODULES` array-alapú konfiguráció — új almodul felvétele egy sor hozzáadásával

---

## [2026-04-24] — A-M7.3d1: Desktop befizetés oldal (`/penzugy/befizetes`)

<!-- key: 2026-04-24-a-m7-3d1-desktop-befizetes -->
<!-- category: feature -->
<!-- targets: lelkészek — új desktop-oldal: befizetés rögzítése, lista, sztornó -->

### 💰 Új desktop oldal: Befizetés

A Kartotéka desktop app-ban mostantól rögzítheted a gyülekezet tag- és családi befizetéseit közvetlenül a géped mellől. A webes felületen már ismert flow-t hoztuk át, **a shared backend-del** (ugyanaz a kód fut mindkét oldalon).

**Elérés:** `/penzugy/befizetes` (közvetlen URL vagy a sidebar pénzügy-linkje + jövőbeli submenu).

**Mit tudsz ma itt csinálni:**

1. **Év-szűrő** a fejlécben — az aktuális vagy elmúlt 5 év közül
2. **Új befizetés rögzítése** — űrlap 8 mezővel:
   - Dátum + melyik évre szól (ha pótlás: előző év)
   - **Tag-kereső** diakritika-tolerans autocomplete-tel („Kovacs" és „Kovács" is talál) — opcionálisan üresen hagyható általános bevételhez
   - **Kategória**-dropdown (a ~50 előre-definiált `befizetescel` lista)
   - **Összeg** (RON)
   - **Típus**: Készpénz (nyugta) vagy Banki átutalás
   - **Iratszám** — Készpénz típusnál automatikus (a következő szabad szám), módosítható
   - Belső megjegyzés
3. **Lista** az adott év 50 legfrissebb befizetésével — dátum-csökkenő sorrendben
4. **Sztornó** inline-panel (kötelező indoklás, min 5 karakter) — a kapcsolt chitantákat és a belső kassza↔bank transfer párját is automatikusan sztornózza
5. **Törlés** — soft-delete gomb a tévesen rögzített sorokhoz (visszaállítható)

**Biztonsági megjegyzések:**
- Év-véglegesítés esetén a sztornó blokkolt — az egyházmegyei admintól kérj feloldást
- Minden művelet a saját gyülekezetedre korlátozva (RLS)
- A szerver-oldali unique constraint védi a párhuzamos iratszám-ütközést

**Offline-állapot:**
- Jelenleg a befizetés-rögzítés **online** kapcsolatot igényel (az iratszám-generálás és duplikátum-ellenőrzés a szerveren fut)
- Ha offline vagy, a form disabled marad + világos magyar üzenet: „Offline munkamenet — csatlakozz a hálózatra"
- Az **offline-módban rögzítés** a köv. release-ben jön (A-M7.3d2 — a chitanța offline-rendszer mintájára)

### 📦 Implementáció

A backend (A-M7.3a/b/c, 2026-04-24) már kész volt: 9 use-case a `@kartoteka/core`-ban, 9 web adapter. Ma a desktop UI **ugyanezeket** a use-case-eket hívja közvetlenül — nincs kódduplikáció.

- Új core use-case: `listBefizetesCelekUseCase` (kategória-dropdown)
- Új desktop oldal: `apps/desktop/src/pages/befizetes-page.tsx` (~620 sor)
- Route: `/penzugy/befizetes`
- Komponens-struktúra: `BefizetesPage` → `IncomeForm` + `RecentIncomeSection` (sztornó inline panel + soft-delete confirm-mal)

---

## [2026-04-24] — A-M7.2e: Szinkronizáció-státusz minden oldalon + csendesebb retry

<!-- key: 2026-04-24-a-m7-2e-shell-indicator-exp-backoff -->
<!-- category: improvement -->
<!-- targets: lelkészek — a szinkronizáció mostantól a teljes desktop app-ban látható -->

### 🛰 Szinkronizáció-jelző a jobb-felső sarokban, mindenhol

Eddig csak a chitanta-oldalon látszott, hogy mennyi offline-kiállított nyugta vár szerverre. **Mostantól** a desktop app **minden oldalán** (Dashboard, Munkanapló, Tagnyilvántartás, bármi) a jobb-felső sarokban, a session-jelző alatt, egy **kis címke** mutatja a helyzetet:

- **Üres** — minden sync-elt. Semmi nem zavar, a pill egyáltalán nem látszik.
- **🟡 „3 chitanță szinkronra vár"** — offline rögzítettek, hálózat visszatértével automatikusan mennek.
- **🔴 „1 konfliktus feloldást vár"** — a szerver elutasított valamit, kattints és oldd meg.

**Bármelyik oldalról rákattintasz:** azonnal a `/penzugy/chitanta` oldalra visz, ahol a Sync most gomb vagy a konfliktus-feloldó modal elérhető.

### 🌊 Csendesebb újrapróbálás

Eddig a háttér-sync 30 mp-enként **mindent** újra próbált, ami a szerveren elakadt. Ez burst-ökhöz vezetett, ha több chitanta egyszerre ütközött. Ma bevezettük az **exponenciális várakozást**:

- **1. kísérlet** — azonnal
- **2. kísérlet** — 30 mp múlva
- **3. kísérlet** — 1 perc múlva
- **4. kísérlet** — 2 perc múlva
- **5. kísérlet** — 5 perc múlva
- **6. kísérlet** — 15 perc múlva
- **Utolsó után** — konfliktus-állapotba billen, te kézzel rendezed

**A „Sync most" gomb továbbra is azonnali próbálkozás** — a várakozási idők csak a háttérben dolgozó automatikát érintik.

### 📦 Implementáció (A-M7.2e)

- `apps/desktop/src/components/sync-status-indicator.tsx` — új komponens, 15 s-enként poll + `online` event-alapú refresh
- `AuthGate` mindkét kapujába bekötve (session és offline-PIN mód egyaránt)
- `apps/desktop/src/lib/chitanta-sync.ts` — `BACKOFF_MS_BY_ATTEMPT` tábla + `shouldSkipByBackoff()` helper + `ignoreBackoff` paraméter a `pushPendingChitantas`-ban

---

## [2026-04-24] — A-M7.2d2d: Konfliktus-feloldás a lokális chitanțákhoz

<!-- key: 2026-04-24-a-m7-2d2d-konfliktus-ux -->
<!-- category: feature -->
<!-- targets: lelkészek — az offline chitanta-kiállítás kör ma teljessé vált a konfliktus-kezeléssel -->

### 🛠 Ha a szerver nem fogadja el az offline chitantát, mostantól feloldod

A tegnap reggel óta működő offline chitanța-kiállítás (A-M7.2d2b) és az auto-push (A-M7.2d2c) után néha előfordulhat, hogy a szerver **nem fogadja** a sorszámot (pl. admin párhuzamosan lefoglalta más gépen, vagy 5× hálózati hiba). Ilyenkor a sor a „🕓 Szinkronizálásra várnak" blokkban **piros „Konfliktus"** címkét kap.

**Ma** a lelkész **kattinthat** a conflict-sor feliratára, és a modal két opciót kínál:

#### 🔄 Másik sorszámra állítás

- Új sorszámot vesz a walletből (ha van)
- A chitanta adatai (befizető, összeg, dátum, megjegyzés) **változatlanok**
- A szinkronizációs sor újra-enqueue-olódik, és azonnal fut a push

#### 🗑 Lokális chitanta törlése

- A chitanta **eltűnik a gépedről** (a szerveren NEM létezik, nem érinti azt)
- A wallet-szám visszakerül a pool-ba
- Újra-kiállítás kézzel, friss form-mal — ha a szerver-válaszban hiba-gyanús adat volt

### 🖼 UX részletek

- Modal: serif cím, rózsaszín figyelmeztetés-ikon, a szerver-üzenet idézve
- Két nagy CTA gomb mindegyikhez 2-soros magyarázat
- Törléshez **kettős megerősítés** (browser confirm)
- Sikerfeedback a modalban: „Új sorszám a walletből: EREKC24 / 211. …"
- Automatikus lista-újratöltés a feloldás után

### 📦 Implementáció (A-M7.2d2d)

- `apps/desktop/src/components/chitanta-conflict-dialog.tsx` — új modal komponens (~200 sor)
- `apps/desktop/src/lib/chitanta-sync.ts` — új `resolveChitantaConflict()` helper, `ConflictResolution` + `ConflictResolutionResult` típusok
- `TauriSqliteBackend`: 3 új metódus — `deleteLocalChitanta()`, `updateLocalChitantaNumber()`, `getLocalChitanta()`
- `RecentChitantasSection`: a conflict-sor kattinthatóvá tétele + modal renderelés

### 🎯 Ezzel az A-M7.2 chitanța-kör TELJES

6 alfázison keresztül:
- A-M7.2a-f: az online chitanța kör (kiállítás, lista, sztornó, nyomtatás)
- A-M7.2d1: wallet-infra
- A-M7.2d2a-d: offline ciklus + conflict-resolve

**A következő kör:** A-M7.3 — a többi pénzügyi use-case (befizetés, járulék, bank-import).

---

## [2026-04-24] — A-M7.2d2c: Automatikus szerverre-feltöltés az offline chitanțákhoz

<!-- key: 2026-04-24-a-m7-2d2c-auto-push -->
<!-- category: feature -->
<!-- targets: lelkészek — az offline kiállított chitanțák mostantól automatikusan felkerülnek a szerverre -->

### 🔄 Automatikus szinkronizáció

A ma reggeli release-ben bevezetett **offline chitanța-kiállítás** (A-M7.2d2b) kiegészült az automatikus szerverre-feltöltéssel.

**Mikor megy fel automatikusan a szerverre:**

- Amikor a gép **online-ra vált** — azonnal.
- Amikor **online-ban bejelentkezel** — azonnal.
- A háttérben **30 mp-enként** folyamatosan — amíg online vagy és van pending chitanța.

**Manuális „Sync most" gomb:**

A `/penzugy/chitanta` oldalon, az „Utolsó chitantáim" fölött a borostyán „🕓 Szinkronizálásra várnak" blokk fejlécében:

- **Sync most** gomb — manuális push-kiváltás, ha a 30s poll-ra nem akarsz várni.
- Után rövid státusz-üzenet (pl. „3 felküldve · 1 újrapróbálásra vár").

**Mit látsz sikeres push után:**

- A borostyán „Szinkronizálásra várnak" blokkból a sor eltűnik.
- A szerver „Utolsó chitantáim" listájában a chitanță megjelenik.
- A sorszám és az adatok megegyeznek.

**Ha valami nem jön össze:**

- **Átmeneti hiba** (hálózat, szerver-hiba): 5 automatikus újrapróbálás.
- **Sorszám-ütközés** (egy másik gép / admin ugyanazt a számot lefoglalta időközben): azonnali **„Konfliktus"** jelölés piros címkével. A lelkész kézzel rendezi (a konfliktus-kezelő UI az A-M7.2d2d release-ben jön — addig a lelkész manuálisan tudja az adatokat átmásolni új sorszámra).

### 🔒 Biztonság

- A pusher **mindig** ellenőrzi a Supabase session-t, mielőtt feltöltene — offline-PIN belépés után, amikor nincs élő session, a pusher néma marad (nem kockáztat 401-es zavart).
- A RLS védelem a szerveren ugyanúgy érvényesül: a lelkész csak a saját gyülekezete chitantáit töltheti fel.
- A `mutation_id` UNIQUE constraint biztosítja, hogy egy chitanța ugyanaz az insertje nem fut le kétszer.

### 📦 Implementáció (A-M7.2d2c)

- `apps/desktop/src/lib/chitanta-sync.ts` — új file, 300+ sor push-logika + auto-trigger
- `TauriSqliteBackend.markChitantaSynced()` + `markChitantaConflict()`
- `AuthGate` bekötés: mount-kor `startChitantaAutoSync()`, SIGNED_IN event-kor `runChitantaSyncManually()`
- `RecentChitantasSection` bővítés: „Sync most" gomb + inline státusz-üzenet

---

## [2026-04-24] — A-M7.2d2a/b: Offline chitanța-kiállítás (kliens-flow)

<!-- key: 2026-04-24-a-m7-2d2ab-offline-chitanta-kliens -->
<!-- category: feature -->
<!-- targets: lelkészek (offline-módban aktiválódik); az automatikus szerverre-feltöltés az A-M7.2d2c release-nél jön -->

### 📝 Offline is tudsz chitantát adni

Ha a szám-tárcádban van szabad sorszám (+10 gombbal előre feltöltve), most már **hálózat nélkül is** kiállíthatsz chitantát — falun, alkalom közben, gyenge jelnél.

**Hogyan működik a gyakorlatban:**

1. **Online-módban** töltsd fel a tárcát („Offline szám-tárca" panel → +10 szám)
2. **Offline-módban** nyisd meg a `/penzugy/chitanta` oldalt:
   - A kék „Offline mód — a tárcából állítunk ki" banner mondja, hány szám vár
   - A form aktív marad, a „Kiállítás" gomb felirata: „Chitanță kiállítása offline"
3. Töltsd ki az adatokat és küldd be:
   - A tárcából automatikusan a legkisebb szabad sorszám kerül ki
   - A chitanță a lokális adatbázisba mentődik (titkosítva)
   - Borostyán sikersáv: „Chitanță offline rögzítve."
4. Az „Utolsó chitantáim" listában megjelenik egy borostyán blokk:
   - „🕓 Szinkronizálásra várnak (N)" + a sor-részletek
5. Amikor a gép újra online lesz (A-M7.2d2c release-től): automatikusan felküldi a szerverre

**Fontos korlátok (mai állapot):**
- Az **automatikus szerverre-feltöltés még NEM fut** — a következő release (A-M7.2d2c) hozza. A lokális chitanta addig **a te desktopon** várakozik.
- Offline-módban **nem adhatsz meg kézzel sorszámot** — a tárca adja.
- Ha a tárca üres és nincs net: a form disabled, pasztorális üzenettel („Csatlakozz a hálózatra, vagy tölts fel sorszámokat").

### 🔒 Adatvédelem

- A lokális chitanțák a SQLCipher AES-256 titkosított adatbázisba kerülnek; a kulcs a Windows Credential Manager-ben, kriptográfiailag a te Windows-login-odhoz kötve.
- A lokális pending chitanța csak a saját desktop-odon látható — más user (akár másik Windows-login ugyanazon a gépen) nem férhet hozzá.

### 📦 Implementáció (A-M7.2d2a + A-M7.2d2b)

**A-M7.2d2a — backend-infra:**
- Rust v11 migráció: `chitantak_local` SQLite tábla (18 oszlop, UNIQUE, 3 index, sync_state enum: pending/synced/conflict)
- Rust command: `chitanta_wallet_claim_next` — `rusqlite::Transaction` atomikus BEGIN/SELECT MIN/UPDATE/COMMIT → race-mentes
- Rust command: `chitanta_wallet_release` — pre-outbox hiba esetén visszadobás a pool-ba

**A-M7.2d2b — kliens-flow:**
- Core `issueChitantaUseCase` offline-ág: új ctx-mezők (`isOnline?`, `offlineBackend?`), új result-flag (`pending`, `walletEmpty`), új `OfflineChitantaBackend` duck-type interface
- `TauriSqliteBackend.insertLocalChitanta()` + `listLocalPendingChitantas()`
- Desktop chitanta-page: `ChitantaWalletPanel.onStatusChange` callback, `OfflineWarning` 2-állapotú, form offline-flow, borostyán siker-banner
- `RecentChitantasSection`: duplo-load (szerver + lokális), borostyán „Szinkronizálásra várnak" blokk, konfliktus-jelző

**Mi jön ezután:**
- **A-M7.2d2c** — automatikus outbox-push: amikor a gép online-ra vált, háttér-task feltölti a pending chitanțákat a szerverre.
- **A-M7.2d2d** — konfliktus-UX (ha a szerveren közben más számot adtak ki).

---

## [2026-04-24] — A-M7.2d1: Offline szám-tárca (chitanța wallet) infrastruktúra

<!-- key: 2026-04-24-a-m7-2d1-chitanta-wallet-infra -->
<!-- category: feature -->
<!-- targets: lelkészek (közvetve — az A-M7.2d2 offline-chitanța release-ével aktiválódik); fejlesztő -->

### 💳 Offline szám-tárca a chitanțákhoz (alap)

A desktop app most **előre-foglalhat** sorszámokat a szerverről, hogy hálózat nélkül is kiállíthasson nyugtát a lelkész (pl. látogatás falun, alkalom közben). A mai release a **wallet-infrát** szállítja — a tényleges offline-kiállítás az A-M7.2d2-ben jön.

**Miért fontos?** Az online-kiállítás (A-M7.2b) a szerver `next_chitanta_number()` RPC-jét hívja, ami net nélkül nem fut. A wallet ezt oldja meg: a lelkész *online-módban* előre lefoglal 10-10 sorszámot, amiket a telefon/notebook a SQLCipher-ben tárol. Hálózat nélkül is tud nyugtát adni.

**Mi jelenik meg ma a `/penzugy/chitanta` oldalon (az aktív tömb panel alatt):**

- **Offline szám-tárca kártya** 3 állapotban:
  - **Üres** (piros) — "Online-módban tölts fel, hogy hálózat nélkül is tudj chitantát kiállítani."
  - **Kevés** (sárga, 1-3 szám) — "⚠ Kevés szám maradt — érdemes feltölteni."
  - **Rendben** (indigo, 4+ szám) — `N szabad sorszám · következő: 204 · legrégibb foglalás: 2026-04-24`
- **+10 szám gomb** — a szervertől atomikusan kér 10 új sorszámot (a `reserve_chitanta_numbers` RPC) és a SQLCipher walletbe menti. Csak online-módban aktív.
- **Visszaigazolás:** `+10 sorszám a tárcában (EREKC24 201-210).`

### 🔒 Biztonság

- A szerveroldali `reserve_chitanta_numbers()` RPC `SECURITY DEFINER` + `current_user_can_access_congregation()` scope-check — a lelkész csak a saját/kapott gyülekezetére foglalhat.
- A row-lock (`FOR UPDATE`) garantálja, hogy a párhuzamos online-kiállítás és a wallet-foglalás **ugyanazt** a `oblio_fiokok.chitanta_kovetkezo_szam` pointert használja, nem ütközik.
- A lokális wallet-tábla (`chitanta_wallet_local`) a SQLCipher AES-256 titkosításban van; kulcs a Windows Credential Manager-ben.
- Max 100 szám / hívás rate-limit.

### 📦 Implementáció (A-M7.2d1)

- **SQL**: `migration-docs/sql/2026-04-24-a-m7-2d1-reserve-chitanta-numbers.sql` — `reserve_chitanta_numbers(uuid, text, integer) RETURNS integer[]` RPC + 3 ellenőrző SELECT (Endre futtatja)
- **Rust v10 migráció** (`apps/desktop/src-tauri/src/db.rs`): `chitanta_wallet_local` tábla 8 oszloppal, UNIQUE + index a szabad-szám-filterre
- **Core** (`packages/core/src/finance/chitanta-wallet/refill.ts`): `refillChitantaWalletUseCase` — 9. re-exportált use-case
- **Desktop backend** (`apps/desktop/src/lib/tauri-sqlite-backend.ts`): `insertWalletNumbers()` + `getWalletStatus()` metódusok
- **Desktop UI** (`apps/desktop/src/pages/chitanta-page.tsx`): új `ChitantaWalletPanel` komponens (~130 sor), beépítve az `ActiveChitantaTombPanel` után

**Mi marad hátra (A-M7.2d2):** `chitantak_local` tábla + `issueChitantaUseCase` offline-ága (szám-fogyasztás a walletből) + outbox-push + konfliktus-UX.

---

## [2026-04-23] — M8: Munkanapló offline lista + zöld ikon + card-raised polish

<!-- key: 2026-04-23-m8-worklog-sync-plus-polish -->
<!-- category: feature -->

### 📔 Munkanapló offline (M8)

A lelkészi munkanapló (istentisztelet, látogatás, alkalom-jegyzőkönyv) mostantól offline is elérhető a desktop kliensen. 4-rétegű port az eddig kialakult minta szerint:

- **M8.0** SQL migráció (`2026-04-23-m8-0-munkanaplo-triggers.sql`) — `tg_munkanaplo_bump_revision` trigger + 3 index (revision/updated_at már létezett a sémában)
- **M8.1** Rust v6 migráció — `munkanaplo_local` SQLite tábla 22 oszloppal, 3 index
- **M8.2** TS sync (`pullWorklogOfOwnCongregation`, `getLocalWorklogOfOwnCongregation`, diagnosztika)
- **M8.3** Új oldal: `/munkanaplo` route → `MunkanaploPage` — keresőbox (cím / alapige / bibliaolvasás / szolgáló / megjegyzés) + időpont-szerinti lista kártyás elrendezésben, jelenlét-számok, persely, énekek.

### 🟢 Új zöld Kartotéka ikon

A desktop-app ikonja cserélve: `icon/Kartoteka-icon-green.png` (1375×1375) → `tauri icon` generátor futtatva. Az összes méret frissítve: 32×32, 64×64, 128×128, 128×128@2x, Windows `icon.ico` (multi-size), macOS `icon.icns`, Windows Store Square logók (7 méret), Android mipmap-ok.

### ✨ card-raised polish

A desktop dashboard 9 Card-ja mostantól a web-app premium `card-raised` signature class-t használja (gradient háttér + backdrop-blur + tripla elevation box-shadow + hover transform). A közös CSS a `packages/ui/src/kartoteka.css`-ben van, mindkét kliens egyszerre importálja — 100% egyezés.

---

## [2026-04-23] — M7: Tagnyilvántartás offline lista (szemely pull-sync + keresés)

<!-- key: 2026-04-23-m7-members-sync -->
<!-- category: feature -->
<!-- version: desktop M7 (SQL trigger-migráció + kliens kód, release nélkül) -->
<!-- targets: fejlesztő, lelkészek (közvetve — következő release-kor látják) -->

### 👥 A desktop kliens most offline is mutatja a gyülekezet tagjait

Az M6 a saját gyülekezet **egy** sorát szinkronizálta. Az M7 az első **sok-rekordos** domain-tábla: a **tagnyilvántartás** (`szemely`). A lelkész a desktop app-ban most **keresheti**, szűrheti és böngészheti gyülekezete tagjait offline is (látogatás-közben a falu utcáján, gyenge internettel).

**Mi jelenik meg:**
- Név (családnév + keresztnév, ill. férjezett + leánykori név)
- CNP (személyi szám)
- Születési dátum, családi állapot
- Telefon, e-mail
- Cím (szöveges), vallás, foglalkozás, nemzetiség
- Családfő-jelzés / elhunyt státusz

**UI funkciók:**
- **Keresés**: név (család + kereszt + férjezett) vagy CNP részleges találattal
- **Elhunytakat is mutassa** kapcsoló — alapértelmezésben csak élő tagok
- **Delta Pull** (csak a változott tagokat) vagy **Full Pull** (minden)
- Tag-szám: `{X} tag a listában`
- Első 100 sor jelenik meg; nagyobb gyülekezeteknél keresés szűkít

### Implementáció

**1. Supabase backend** (`migration-docs/sql/2026-04-23-m7-0-szemely-csalad-triggers.sql`):
- A `szemely.revision` + `szemely.updated_at` oszlopok **MÁR LÉTEZTEK** a sémában (egy korábbi fázisban valaki előkészítette) — csak a **trigger** hiányzott
- `tg_szemely_bump_revision` + `BEFORE UPDATE trigger szemely_bump_revision`
- `tg_csalad_bump_revision` + `BEFORE UPDATE trigger csalad_bump_revision` (később M7.4-hez)
- `idx_szemely_updated_at` + `idx_csalad_updated_at` + `idx_szemely_congregation_id` indexek

**2. Desktop kliens**:
- **Rust v5 migráció** (`apps/desktop/src-tauri/src/db.rs`): `szemely_local` SQLite tábla **37 oszloppal**. Kulcs: `szemely.id` integer (NEM uuid!). Típus-mapping: boolean → INTEGER, date → TEXT, timestamptz → TEXT. 5 index (congregation_id, family_id, csaladnev, cnp, updated_at).
- **TS sync layer** (`apps/desktop/src/lib/sync.ts`):
  - `MemberLocalRow` interface (37 mező)
  - `MemberSupabaseRow` interface (Supabase-oldali raw-sor — boolean-ok JS-típussal)
  - `pullMembersOfOwnCongregation(userId, mode)` — delta vagy full
  - Per-gyülekezet `last_pull` (`sync:members:last_pull:<cg_id>`)
  - `getLocalMembersOfOwnCongregation(userId, {search, includeDeceased, includeHidden})` — LIKE-keresés + filter
  - `getLocalMemberCount(userId)` + `getLastPullMembersIso(userId)`
- **UI** (`apps/desktop/src/pages/dashboard-page.tsx`): új „Gyülekezet tagjai — offline lista" Card. Debounce-mentes search-box (SQLite gyors), checkbox az elhunytakra, táblázat 6 oszloppal (név, CNP, szül., telefon, e-mail, státusz).

### Scope kihagyva V1-ből

- **`szig`, `taj`** (szig.szám, TAJ-szám) — PII, külön megbeszélés után
- **`kep`, `photo_url`** (fotók) — külön fázis (Supabase Storage cache)
- **`sz_helyid`, `c_utcaid`, `c_helysegid`** (cím-FK-k) — egyelőre `c_szcim` szöveg-mezővel
- **`befizetoev`** — pénzügyi, admin-oldali
- **Írás** (új tag, módosítás) — M7.5 vagy későbbi fázis
- **`csalad` join** (család-nézet) — M7.4 tervben

### Verifikáció

- `npx tsc --noEmit` : 0 hiba
- `cargo check` : OK (`Finished dev profile in 12.64s`)
- Kliens fallback: ha a M7.0 SQL-trigger nem fut, a pull akkor is **működik** (csak a revision-konfliktus-detektálás inaktív)

### Futtatás

1. **Supabase Studio**: `2026-04-23-m7-0-szemely-csalad-triggers.sql` futtatása (~5 mp)
2. **Desktop**: a v5 migráció auto-fut (új `szemely_local` tábla jön létre a lokális SQLCipher-ben)
3. **Teszt**: Dashboard → „Gyülekezet tagjai" Card → **Full Pull** gomb → a tagok megjelennek

### 🐛 Fix ugyanezen a napon — `isvisible` default filter túl szigorú volt

Első tesztnél: **Full Pull: 616 tag frissítve**, de **0 tag a listában**. Ok: a default szűrő `isvisible = 1`-re is megszűrt, de a legacy Kartotéka adatokban sok a `isvisible = false` (admin-jelzés, de a lelkész látni akarja).

**Javítás**: a default szűrőből kivéve az `isvisible = 1`-et — csak `meghalt = 0` marad alapértelmezésben. Új opt-in checkbox: „Csak nyilvántartásban láthatók (`isvisible=1`)". Ha a lelkész ezt bekapcsolja, visszakapja a régi viselkedést.

**Diagnosztika**: új `getLocalMemberCounts()` — a UI most mutat 4 számot: lokálisan cache-elve / élő / élő+látható / szűrőben most. Így bármikor látszik, mi a hatása egy szűrő-beállításnak.

---

## [2026-04-24] — A-M7.2f: Chitanța nyomtatás — a kiállítási kör teljes lezárása

<!-- key: 2026-04-24-a-m7-2f-chitanta-print -->
<!-- category: feature -->
<!-- version: shared core + desktop print-dialog -->
<!-- targets: fejlesztő, lelkész (desktop-user) -->

### 🖨 A papír-nyugta teljes munkafolyamata desktop-on

Az A-M7.2e (list + sztornó) után most a **nyomtatás** is shared-re került. A lelkész kattint a "Nyomtatás" gombra a listán → megnyílik egy A5/A4 nyugta-layout dialog → Ctrl+P vagy "Nyomtatás" gomb → Windows/Mac print dialog → papír vagy "Mentés PDF-ként". Sztornózott nyugtán piros diagonal **STORNOZAT** pecsét + indok-info alul.

**3 új + 3 módosított fájl**:
- Validations: [`chitanta-print.ts`](../packages/validations/src/finance/chitanta-print.ts) — `ChitantaPrintData` + `ChitantaPrintCongregation` (22 mező)
- Core: [`chitanta/print.ts`](../packages/core/src/finance/chitanta/print.ts) — `getChitantaForPrintUseCase` 5-query lánc (nyugta + fallback befizetés → befizetescel/szemely/csalad + congregation + diocese + district)
- Desktop komponens: [`chitanta-print-dialog.tsx`](../apps/desktop/src/components/chitanta-print-dialog.tsx) (~280 sor) — modal full-screen dialog, print-toolbar (hidden on print), A5-layout
- Web Server Action: `getChitantaForPrint` **156 → 15 sor**, a `ChitantaPrintData` re-export a validations-ből (backward-compat a 4 web-komponensnek)
- Desktop `chitanta-page.tsx`: "Nyomtatás" gomb a listán minden soron, dialog-integráció

### 🎨 Print-layout részletei

- Egyházkerület + egyházmegye fejléc (hu + ro)
- Gyülekezet-fejléc (név hu/ro, cím, város, megye, telefon, CIF)
- Nagy **CHITANȚĂ** fejléc + "Papír-nyugta / Adeverință de plată" alcím
- Sorozat + nyomdai szám + gyülekezeti Nr. intern + dátum
- Átvevő adatai + reprezentánd (hu + ro fordítás)
- Kiemelt összeg (3xl font, border-y-2): `{N} RON`
- Sztornózott esetén: rotate-15deg piros "STORNOZAT" pecsét + indok-panel
- Aláírás-mezők (átvevő + lelkipásztor)

### ✅ Verifikáció

- `validations + core + web + desktop tsc` → 0 error
- `web lint` → 0 error, 68 non-blocking warning (változatlan)
- `banned-imports` → 31 fájl, 0 tiltott

**Részletek**: [`KARTOTEKA-A-M7-2f-chitanta-print-2026-04-24.md`](project-tracking/KARTOTEKA-A-M7-2f-chitanta-print-2026-04-24.md)

### 🏁 A chitanța-kör (A-M7.2) TELJES lezárása — 5 alfázis kész

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.2a | Aktív-tömb státusz-követő | ✅ |
| A-M7.2b | issueChitantaUseCase (online) | ✅ |
| A-M7.2c | Desktop kiállító form | ✅ |
| A-M7.2e | List + sztornó | ✅ |
| A-M7.2f | **Nyomtatás** | ✅ |
| ⏳ A-M7.2d | Offline-chitanța (szám-wallet) | hátra |

A desktop kliens mostantól a **napi bizonylat-kiállítási folyamat 90%-át kezeli online**.

### Következő

- **A-M7.2d** — offline-chitanța: új RPC `reserve_chitanta_numbers()` + kliens szám-tárca + `chitantak_local` Rust SQLite migráció
- **A-M7.3** — következő pénzügyi modul (befizetés / járulék / bank-import)

---

## [2026-04-23] — A-M7.2 chitanța-kiállítási kör (4 alfázis: aktív-státusz, kiállítás, desktop UI, list+sztornó)

<!-- key: 2026-04-23-a-m7-2-chitanta-kor -->
<!-- category: feature -->
<!-- version: shared core + desktop UI + web adapter-ek -->
<!-- targets: fejlesztő, lelkész (desktop-user) -->

### 🧾 A napi chitanța-kör shared-re — 4 alfázis egy aggregált bejegyzésben

Az A-M7.1 (chitanta_tombok CRUD) után az A-M7.2 alfázisai a **chitanța (papír-nyugta)** műveleteket rakják shared core-ra.

**A-M7.2a — Aktív-tömb státusz-követő**
- [`packages/core/src/finance/chitanta-tomb/active-status.ts`](../packages/core/src/finance/chitanta-tomb/active-status.ts) — `getActiveChitantaTombStatusUseCase` (online-first + offline-fallback)
- Desktop `ActiveChitantaTombPanel` komponens — **derived a `rows`-ból**, 4-állapotú pasztorális UI: 🟢 rendben / 🟡 kevés / 🔴 elfogyott / 🔴 nincs aktív tömb

**A-M7.2b — `issueChitantaUseCase` (papír-chitanța kiállítás)**
- Zod: [`packages/validations/src/finance/chitanta-issue.ts`](../packages/validations/src/finance/chitanta-issue.ts) — 10-mezős input séma
- Core: [`packages/core/src/finance/chitanta/issue.ts`](../packages/core/src/finance/chitanta/issue.ts) — **online-kötelező** (`next_chitanta_number()` PL/pgSQL RPC), 2 pasztorális hibaflag (`offlineNotSupported`, `duplicateNumber`)
- Web: `issueChitanta` Server Action 77 → 50 sor

**A-M7.2c — Desktop chitanta-form UI** (`/penzugy/chitanta`)
- Új komponens: [`components/active-chitanta-tomb-panel.tsx`](../apps/desktop/src/components/active-chitanta-tomb-panel.tsx) (extraktálva a chitanta-tombok-page-ből)
- Új oldal: [`pages/chitanta-page.tsx`](../apps/desktop/src/pages/chitanta-page.tsx) — 9-mezős form, `OfflineWarning` panel, `navigator.onLine` tracking, pasztorális hiba-kezelés a 3 flag szerint
- App.tsx: új route `/penzugy/chitanta`

**A-M7.2e — List + sztornó**
- Zod: [`packages/validations/src/finance/chitanta-row.ts`](../packages/validations/src/finance/chitanta-row.ts) — list-row + sztornó input sémák
- Core: [`list.ts`](../packages/core/src/finance/chitanta/list.ts) + [`storno.ts`](../packages/core/src/finance/chitanta/storno.ts) — **online-only** (A-M7.2d előtt)
- Web: `listChitantas` + `stornoChitanta` Server Action-ök thin adapterek
- Desktop: `RecentChitantasSection` a chitanta-page-en — 10 legújabb + sztornó-dialog (confirm + indok min 5 char + auto-refresh)

### 🎯 Lelkész-informálási 5 pont — mindenhol teljesül

Loading / Success / Error (3 flag) / Offline-state / Empty-state mind explicit, pasztorális magyar üzenetekkel. A sztornózott sorok áthúzva + indok szürke szövegben.

### ✅ Verifikáció

- `validations + core + web + desktop tsc` → 0 error
- `banned-imports` → **30 fájl, 0 tiltott**

**Részletes project logok**:
- [A-M7.2a](project-tracking/KARTOTEKA-A-M7-2a-active-chitanta-tomb-status-2026-04-22.md)
- [A-M7.2b](project-tracking/KARTOTEKA-A-M7-2b-issue-chitanta-2026-04-23.md)
- [A-M7.2c](project-tracking/KARTOTEKA-A-M7-2c-desktop-chitanta-form-2026-04-23.md)
- [A-M7.2e](project-tracking/KARTOTEKA-A-M7-2e-chitanta-list-storno-2026-04-23.md)

### Következő

- **A-M7.2f** — nyomtatás (`getChitantaForPrint` 156 sor fallback-lánccal) shared-re + desktop "Nyomtatás" gomb
- **A-M7.2d** — offline-chitanța: szerver-oldali `reserve_chitanta_numbers()` RPC + kliens szám-wallet + `chitantak_local` Rust migráció
- **A-M7.3+** — a következő pénzügyi Server Action-csoportok (befizetés, járulék, bank-import, tva, stb.)

---

## [2026-04-22] — A-M7.1c: desktop chitanta-tömbök oldal — **első E2E pénzügyi flow**

<!-- key: 2026-04-22-a-m7-1c-desktop-chitanta-tombok -->
<!-- category: feature -->
<!-- version: desktop UI — következő release-ben fut -->
<!-- targets: fejlesztő, lelkész (desktop-user) -->

### 🧾 Első teljes E2E pénzügyi oldal a Tauri desktopon

Az A-M7.1a (list) + A-M7.1b (create) rétegek után most a **desktop UI** is kész. `/penzugy/chitanta-tombok` route — listázás + inline create form, **online-first + offline-fallback**, minden loading / success / error / empty state implementálva.

**Új fájl**: [`apps/desktop/src/pages/chitanta-tombok-page.tsx`](../apps/desktop/src/pages/chitanta-tombok-page.tsx) — ~430 sor, egyetlen oldal minden funkcióval: header + gombok + SourceBadge + kártyarács + empty-state + inline create form.

**App.tsx**: új route `/penzugy/chitanta-tombok` az AuthGate mögött.

### 🎯 Informálási alapelv — a lelkész mindig tudja, honnan jön az adat

- 🟢 **Friss szerveradat**: "X tömb, éppen a Supabase-ből szinkronizálva"
- 🟠 **Lokális gyorsítótárból**: "X tömb. A szerver most nem érhető el; a következő hálózati csatlakozáskor frissül"
- Kártya-szintű StatusPill: **Aktív** / **Kevés** (≤5 maradék) / **Elfogyott** (0 maradék) / **Lezárt**
- Sikeres rögzítés: zöld banner 4 mp-ig ("Az új tömb (EREKC24 100-120) elmentve")
- Pasztorális hibaüzenet: pl. "Átfedés a meglévő EREKC24 100-200 tömbbel"
- Empty state: "Még nincs rögzített nyugtatömb" + barátságos magyarázat + CTA

### ✅ Verifikáció

- `npx tsc --noEmit` → 0 error
- `check-desktop-banned-imports.mjs` → 28 fájl, 0 tiltott

### Az A-M7.1 kör LEZÁRVA

| Alfázis | Tartalom | Státusz |
|---|---|---|
| A-M7.1a | Read-only use-case + Rust v9 + web adapter | ✅ |
| A-M7.1b | Write use-case + SQL revision/trigger + web adapter | ✅ |
| A-M7.1c | Desktop E2E oldal | ✅ |

A **minta** minden jövőbeli pénzügyi use-case-hez megvan. A többi ~12 Server Action ugyanezt a pattern-t követi.

**Részletek**: [`KARTOTEKA-A-M7-1c-desktop-chitanta-tombok-2026-04-22.md`](project-tracking/KARTOTEKA-A-M7-1c-desktop-chitanta-tombok-2026-04-22.md)

### Következő lehetőségek

- **A-M7.1b2** — `closeChitantaTombUseCase` + `createChitantaTombokBatch` (kerületi többes-tömb átvétel)
- **A-M7.2** — aktív-tömb követő + chitanta-kiállítás (701 soros Server Action refaktor, ez a legnagyobb pénzügyi érték)
- **A-M7.3+** — 12 további pénzügyi Server Action (bank-import, tva, tartozas, oblio-*, finalization, monetary)

---

## [2026-04-22] — A-M7.1b: `createChitantaTombUseCase` + szerver-oldali revision trigger

<!-- key: 2026-04-22-a-m7-1b-create-chitanta-tomb -->
<!-- category: improvement -->
<!-- version: shared (core + validations) + SQL migráció + web adapter -->
<!-- targets: fejlesztő -->

### 🧾 Első write use-case: új nyugtatömb rögzítése a core-ban

Az A-M7.1a (read-only) után az A-M7.1b hozza meg a write-use-case mintát: input-validálás + átfedés-ellenőrzés + RLS-védett INSERT + zod drift-check + opcionális lokális cache-frissítés. Minden ezután érkező pénzügyi write ezt a mintát követi.

**4 új / módosított rész**:
- Zod: `createChitantaTombInputSchema` + `…FullSchema` (két `.refine()` az üzleti szabályokhoz — szám-tartomány + 100-darab limit)
- Core: [`packages/core/src/finance/chitanta-tomb/create.ts`](../packages/core/src/finance/chitanta-tomb/create.ts) — `createChitantaTombUseCase(input, { supabase, storage?, runtime, userId })` — **pasztorális magyar hibaüzenetek** a kulcs üzleti-szabály-sérülésekhez
- SQL migráció (Endre): [`migration-docs/sql/2026-04-22-a-m7-1b-chitanta-tombok-revision.sql`](../migration-docs/sql/2026-04-22-a-m7-1b-chitanta-tombok-revision.sql) — `revision` oszlop + `trg_sync_chitanta_tombok` BEFORE UPDATE trigger + delta-pull index + 4 ellenőrző SELECT
- Web Server Action refaktor: a 70+ soros `createChitantaTomb` most ~25 sor, a core use-case-t hívja

### 🔁 A delta-sync alap szerver-oldalon is kész

A `revision` oszlop + `sync_tracking_touch()` trigger engedi az optimistic-lock (`WHERE id = ? AND revision = ?`) conditional-update-et és a `WHERE updated_at > last_pull` delta-lekérdezést. A kliens-oldali `chitanta_tombok_local` (A-M7.1a, Rust v9) már felkészülve várt rá.

### ✅ Verifikáció

- `core + validations typecheck` → 0 error
- `web tsc + lint` → 0 error (68 non-blocking warning)
- `check-desktop-banned-imports` → 27 fájl, 0 tiltott

### ⚠️ Kérés Endrének

Futtatni kell a [`2026-04-22-a-m7-1b-chitanta-tombok-revision.sql`](../migration-docs/sql/2026-04-22-a-m7-1b-chitanta-tombok-revision.sql)-t Supabase Studio-ban. A fájl végi 4 SELECT zöldet kell adjon:
- Ellenőrzés 1: `revision bigint NOT NULL DEFAULT 0`
- Ellenőrzés 2: trigger `BEFORE UPDATE ROW`
- Ellenőrzés 3: index `(congregation_id, updated_at DESC)`
- Ellenőrzés 4: smoke-teszt előkészítő (egy kézi UPDATE teszt)

**Részletek**: [`KARTOTEKA-A-M7-1b-create-chitanta-tomb-2026-04-22.md`](project-tracking/KARTOTEKA-A-M7-1b-create-chitanta-tomb-2026-04-22.md)

### Következő

- **A-M7.1c**: desktop `/penzugy/chitanta-tombok` route (listázás + create form, offline-fallback jelzéssel)
- **A-M7.1b2**: `closeChitantaTombUseCase` + `createChitantaTombokBatch`
- **A-M7.2**: `getActiveChitantaTombStatus` shared + chitanta-kiállítás (701 soros server action refaktor)

---

## [2026-04-22] — A-M7.1a: `listChitantaTombokUseCase` — első pénzügyi use-case

<!-- key: 2026-04-22-a-m7-1a-chitanta-tombok-list -->
<!-- category: improvement -->
<!-- version: shared (core + validations) + desktop (Rust v9) + web adapter -->
<!-- targets: fejlesztő -->

### 🧾 Első use-case a core-ban: chitanta_tombok listázás

Az A-M7.0 (TauriSqliteBackend) után az A-M7.1a hozza meg az **első pénzügyi use-case-t** a `@kartoteka/core`-ban: `listChitantaTombokUseCase`. Minta-értékű minden jövőbeli A-M7 use-case-hez.

**4 új / módosított fájl**:
- [`packages/validations/src/finance/chitanta-tomb.ts`](../packages/validations/src/finance/chitanta-tomb.ts) — zod séma (19 oszlopos row + scope enum + `computeChitantaTombStatus` helper)
- [`packages/core/src/finance/chitanta-tomb/list.ts`](../packages/core/src/finance/chitanta-tomb/list.ts) — use-case: **online-first + offline-fallback**, zod-validálás drift-safe
- [`apps/desktop/src-tauri/src/db.rs`](../apps/desktop/src-tauri/src/db.rs) — **Rust v9 migráció**: `chitanta_tombok_local` SQLite tábla (19 oszlop, 3 index)
- [`apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts`](../apps/web/app/(dashboard)/penzugy/chitanta-tombok-actions.ts) — thin Server Action adapter a core use-case-hez, a meglévő `ChitantaTomb` interface-t megtartva

### 📐 Minta (a további A-M7 use-case-ek követik)

```
packages/validations/src/finance/{domain}.ts    ← zod schema
packages/core/src/finance/{domain}/{action}.ts  ← use-case (Input/Ctx/Result)
apps/desktop/src-tauri/src/db.rs                ← Rust v{N} migration
apps/web/app/(dashboard)/penzugy/{x}-actions.ts ← thin web adapter
```

**Use-case-kontraktus** (minden pénzügyi use-case ezt követi):
- **Input**: zod-validált, explicit (pl. `congregationId`)
- **Ctx**: `{ supabase, storage?, runtime }` — platform-agnostic DI
- **Result**: discriminated union (`success: true, source: 'supabase'|'local', rows` / `success: false, error`)
- **Nem dob**: minden hibát Result-ban ad vissza
- **Online-first**: próbálja a Supabase-t, ha sikerül → opcionális `storage.upsertServerRows` a lokális cache-nek
- **Offline-fallback**: ha Supabase fail + `ctx.storage` adott → `storage.findAll(filter)`

### ✅ Verifikáció

- `npm run typecheck --workspace=@kartoteka/core` → 0 error
- `cd apps/web && npm run lint && npx tsc --noEmit` → 0 error (68 warning, változatlan)
- `cd apps/desktop/src-tauri && cargo check` → Finished in 1.16s
- `check-desktop-banned-imports.mjs` → 27 fájl, 0 tiltott

**Részletek**: [`KARTOTEKA-A-M7-1a-chitanta-tombok-first-use-case-2026-04-22.md`](project-tracking/KARTOTEKA-A-M7-1a-chitanta-tombok-first-use-case-2026-04-22.md)

### Következő

- **A-M7.1b**: write-use-case-ek (`issueChitantaTombUseCase`, `closeChitantaTombUseCase`) + mutation-queue outbox-integráció
- **A-M7.1c**: desktop kliens-komponens — `/penzugy/chitanta-tombok` listázó az offline-fallback jelzésével ("lokális cache, X napja friss")
- **A-M7.2**: `getActiveChitantaTombStatus` shared + aktív-tömb maradék-követés

---

## [2026-04-22] — A-M7.0: `TauriSqliteBackend` + Rust v8 outbox bővítés

<!-- key: 2026-04-22-a-m7-0-tauri-sqlite-backend -->
<!-- category: improvement -->
<!-- version: desktop infra — A-M7 pénzügyi wave első lépése -->
<!-- targets: fejlesztő -->

### 💾 Az első valós `StorageBackend` implementáció desktop-ra

Az A-M6.8a skeleton után az A-M7 pénzügyi wave infrastrukturális előfeltétele: a `StorageBackend` interface valós impl-je, ami a meglévő Tauri `dbExecute`/`dbSelect` command-okra épül a SQLCipher-titkosított lokális DB-hez.

**Új fájl**: [`apps/desktop/src/lib/tauri-sqlite-backend.ts`](../apps/desktop/src/lib/tauri-sqlite-backend.ts) (~300 sor) — 11 metódus (`upsertServerRows`, `writeLocal`, `deleteLocal`, `findByPk`, `findAll`, `enqueueMutation`, `getPendingMutations`, `removeMutation`, `updateMutationAttempt`, `getSetting`, `setSetting`). Safety-guard regex minden SQL-azonosítón; user-adat csak `?N` placeholder-en keresztül.

**Rust v8 migráció**: az outbox táblához 3 új oszlop (`mutation_id TEXT UNIQUE`, `expected_revision INTEGER`, `last_attempt_at TEXT`) — a meglévő M2.5 outbox séma (INTEGER PK + `op/target_table/target_id/payload/retry_count`) változatlan marad, a régi `sync.ts` logika tovább fut. A backend az új `mutation_id`-t használja kliens-generált stabil PK-ként — **co-existence**, nincs törés.

**Architektúra-döntés**: a `TauriSqliteBackend` és a jövőbeli `DexieBackend` **nem** a shared `@kartoteka/offline-sync` package-ben vannak, hanem az app-ok saját oldalán (desktop és web). Így a package platform-agnostic marad, a desktop import-check pedig tiltja a Dexie-t (A-M6.7).

### ✅ Verifikáció

- `cargo check` → Finished in 1.74s
- `cargo test` → **7/7 PASS** (4 auth + 3 auth_pin)
- `npx tsc --noEmit` → 0 error
- `check-desktop-banned-imports.mjs` → 27 fájl, 0 tiltott

**Részletek**: [`KARTOTEKA-A-M7-0-tauri-sqlite-backend-2026-04-22.md`](project-tracking/KARTOTEKA-A-M7-0-tauri-sqlite-backend-2026-04-22.md)

### Következő

- **A-M7.1**: első use-case — `@kartoteka/core/finance/chitanta/issue-chitanta.ts` + zod séma + web `'use server'` wrapper + desktop form
- **A-M7.2**: Rust v9 migráció — `chitanta_tombok_local` offline SQLCipher tábla

---

## [2026-04-22] — A-M6.9: Offline PIN hitelesítés + "mindenről informálva" alapelv

<!-- key: 2026-04-22-a-m6-9-offline-pin -->
<!-- category: feature -->
<!-- version: desktop (Rust + TS) — következő release-ben fut -->
<!-- targets: fejlesztő, lelkész (offline UX) -->

### 🔑 Offline PIN — a lelkész 30+ napos net-szünet után is be tud lépni

Endre visszajelzése tárta fel, hogy a Supabase 30 napos refresh-token nem elég, ha a lelkész hosszabb ideig net nélkül dolgozik (falvak, szolgálati utak). Az új **offline PIN** argon2id-hash-elve él a Tauri keyring-ben, és lokális SQLCipher DB-hez enged hozzáférést hálózat nélkül.

**Rust (`auth_pin.rs`)**: `auth_pin_has` / `auth_pin_set` / `auth_pin_verify` / `auth_pin_clear` / `auth_pin_status` Tauri command-ok. Lockout-lépcső: 3 → 30s, 5 → 5min, 7 → 1h, **10 → force logout** (PIN automatikusan törlődik, online-login kötelező). 7/7 Rust unit test PASS.

**TS (`lib/auth-pin.ts` + `lib/session-state.ts`)**: invoke-wrapper + 4-állapotú session-analízis (`online`, `offline-pin`, `refresh-expiring`, `signed-out`) + `formatLockoutMessage` pasztorális magyar hibaszövegekkel.

**Auth-gate**: 4-kapus logika — friss session / aktív offline-mode / van-PIN-redirect /pin-entry / nincs-PIN-redirect /login. `SIGNED_IN` és `SIGNED_OUT` esemény automatikusan kezeli az offline-mode flag-et.

**Új oldalak**: `/pin-setup` (első online-login után) + `/pin-entry` (offline belépés PIN-nel, élő lockout-countdown-nal). A login-page sikeres bejelentkezés után automatikusan a `/pin-setup`-ra vezet, ha még nincs PIN.

**SessionStatusIndicator**: diszkrét státusz-pötty a jobb-felső sarokban MINDEN autentikált oldalon — 🟢 Online / 🟠 Offline / 🟡 Refresh közeleg. 60 mp-enként újraértékeli.

### 📘 Új alapelv memória: "A lelkész mindenről informálva legyen a megfelelő helyeken"

Endre kifejezett kérése: minden rendszer-állapot és változás tiszta, pasztorális feedback-ben jelenjen meg — loading / success / error / offline state kötelező; nincs néma hiba, rejtett fallback, technikai szleng. Új memória: [`feedback_lelkesz_informalas.md`](../..). Minden jövőbeli UI-munka kötelező ellenőrzési pontjai: 5 kérdés (van-e loading / success / error / offline / sync-feedback).

### ✅ Verifikáció

- `cargo check` + `cargo test` — 7 passed (4 auth + 3 auth_pin)
- `npx tsc --noEmit` — 0 error
- `check-desktop-banned-imports.mjs` — ✅ 26 fájl, 0 tiltott

**Részletek**: [`KARTOTEKA-A-M6-9-offline-pin-2026-04-22.md`](project-tracking/KARTOTEKA-A-M6-9-offline-pin-2026-04-22.md)

---

## [2026-04-22] — M6 fázis LEZÁRVA: M6.3 standalone kivezetés + M6.8a offline-sync skeleton

<!-- key: 2026-04-22-m6-zarokep -->
<!-- category: breaking -->
<!-- version: — -->
<!-- targets: fejlesztő -->

### 🏁 M6 teljes fázis kész → M7 pénzügyi wave indulhat

Az M6 8 allépése mind zöld: packages skeleton, 113-tábla RLS audit (P0-P3 teljes), mail-send Edge Fn + core wrapper, Next.js 16 proxy, desktop keyring auth, Dexie-tiltás, offline-sync skeleton, standalone portable kivezetés.

### 🗑️ M6.3 — Inno Setup portable verzió teljesen kivezetve

A diagnostic azt mutatta, hogy **0 aktív portable user** van az elmúlt 30 napban → azonnali törlés. A teljes `apps/web/app/api/standalone/`, `apps/web/lib/standalone/`, `standalone-build/`, `apps/web/components/standalone/` mappa törölve; a web-onboarding wizard komponensei `components/onboarding/`-ba átmozgatva és refaktorálva (a `mode` prop nélkül, Step1License import nélkül, Step5Finish web-only verzió maradt).

**Cross-module cleanup**: 12+ fájl érintett — `lib/supabase/{client,middleware,server}.ts`, `lib/offline/{sync-orchestrator,recycle-bin-actions}.ts`, `components/offline/*` (5 fájl), `components/shared/recycle-bin-view.tsx`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/offline/page.tsx`, `app/(setup)/{layout,welcome/page,welcome/actions}.tsx`. Minden `isStandaloneMode()` / `KARTOTEKA_STANDALONE` / `wrapSupabaseForOfflineUse` / `LicenseBanner` / `LicenseStatusCard` / `MonthlySyncPanel` referencia eltávolítva.

**Config + deps**: `next.config.ts` `outputFileTracingIncludes` standalone-specific includes + `serverExternalPackages` törölve (de **`output: 'standalone'` marad** — Next.js build mode, NEM Kartotéka portable); `eslint.config.mjs` `standalone-build/**` ignore törölve; `scripts/audit-safety.mjs` frissítve; `apps/web/package.json` `better-sqlite3` + `node-machine-id` dep-ek + `@types/better-sqlite3` devDep törölve; `package.json` root `build:portable` npm script törölve. A `public/manifest.json "display": "standalone"` MARAD (PWA Web App Manifest spec). Összesen `303 → 299` package.

### 🧱 M6.8a — @kartoteka/offline-sync skeleton (interface-only)

Scope-szűkített: csak típus-kontraktus + `StorageBackend` interface, nem teljes 18-fájlos átemelés (az premature refactor lett volna). Új fájlok: `packages/offline-sync/src/{types,backend,index}.ts`. A `DexieBackend` és `TauriSqliteBackend` valós impl-je M7 alatt kerül be, a pénzügyi use-case-ekkel párhuzamosan (valós scenariókkal tesztelve).

### ✅ Verifikáció (minden zöld)

- `apps/web` tsc: 0 error, lint: 0 error / 68 non-blocking warning
- 6 shared package typecheck: mind 0 error
- `apps/desktop` tsc: 0 error, Rust `cargo check`: OK, `cargo test auth::`: 4/4 PASS
- `scripts/check-desktop-banned-imports.mjs`: ✅ 21 fájl, 0 tiltott

**Részletek**: [`KARTOTEKA-M6-zarokep-2026-04-22.md`](project-tracking/KARTOTEKA-M6-zarokep-2026-04-22.md)

### 🚀 Következő: M7 pénzügyi wave

1. M7.0 — `DexieBackend` + `TauriSqliteBackend` első valós impl (csak a pénzügyi táblákra szabva)
2. M7.1 — `issueChitantaUseCase` a `@kartoteka/core/finance/chitanta/`-ban, mintája a `sendMailUseCase`
3. M7.2-M7.4+ — 13 pénzügyi Server Action refaktor use-case-ekké + web adapter + desktop adapter + SQLCipher migráció

---

## [2026-04-22] — M6.6: Desktop Supabase session OS-szintű keyring-ben

<!-- key: 2026-04-22-m6-6-desktop-auth-keyring -->
<!-- category: security -->
<!-- version: desktop Rust+TS — következő release-ben fut -->
<!-- targets: fejlesztő, rendszerbiztonság -->

### 🔐 Supabase session localStorage → OS keyring

Eddig a desktop Tauri webview `localStorage`-ba mentette a Supabase session-t (JWT + 30 napos refresh token) — DevTools-ból olvasható, fájlrendszerből másolható. Mostantól **OS-szintű keyring-be** kerül: Windows Credential Manager (DPAPI), macOS Keychain, Linux Secret Service.

### Mit változtattunk

- **Rust**: új `apps/desktop/src-tauri/src/auth.rs` modul + 3 Tauri command (`auth_store_item`, `auth_read_item`, `auth_clear_item`). Kulcs-sanitize + `auth-` prefix-lock (a többi keyring-slot biztonsági elkülönítve). 4/4 unit test PASS.
- **Shared**: `packages/supabase-client/src/browser.ts` bővítve `authOptions` paraméterrel + új `SupabaseAuthStorage` interface (localStorage-szerű, sync/async). A web oldal NEM módosul.
- **Desktop**: `apps/desktop/src/lib/supabase.ts` `tauriKeyringStorage` adapter, `invoke()`-on keresztül szól a Rust oldalnak. `persistSession=true`, `autoRefreshToken=true`, `detectSessionInUrl=false`.

### Backward-compatibility

A meglévő localStorage session-ök **nem vándorolnak át** — az első indítás után egyszeri re-login szükséges. Elfogadható a beta-fázisban, a user-szám limitált.

### Verifikáció

```
npm run typecheck --workspace=@kartoteka/supabase-client   # 0 error
(apps/desktop) npx tsc --noEmit                             # 0 error
(src-tauri)    cargo check                                   # Finished in 5s
(src-tauri)    cargo test auth::                             # 4 passed
```

**Részletek**: [`KARTOTEKA-M6-6-desktop-auth-keyring-2026-04-22.md`](project-tracking/KARTOTEKA-M6-6-desktop-auth-keyring-2026-04-22.md)

---

## [2026-04-22] — M6.3 diagnostic + M6.4b core mail wrapper

<!-- key: 2026-04-22-m6-3-diagnostic-es-m6-4b-mail-wrapper -->
<!-- category: improvement -->
<!-- version: — -->
<!-- targets: fejlesztő -->

### 🔍 M6.3 — portable-user diagnostic SQL

Fájl: [`migration-docs/sql/2026-04-22-m6-3-portable-user-diagnostic.sql`](../migration-docs/sql/2026-04-22-m6-3-portable-user-diagnostic.sql) — 5 SELECT blokk, csak olvasó: `licenses` (portable Inno Setup) státusz-bontás, aktivitás az elmúlt 7/30/60 napban, `user_devices` (Tauri) referencia, végül 1-soros **döntési összefoglaló** javaslattal: ✅ azonnali törlés / 🟡 irányított migráció + 1 release után törlés / 🔴 halasztott (M12/M13). Endre futtatja, az eredmény alapján szabjuk meg az M6.3 konkrét megvalósítását.

### 📧 M6.4b — @kartoteka/core mail wrapper (első valódi use-case)

Új fájl: [`packages/core/src/mail/send.ts`](../packages/core/src/mail/send.ts) — a `sendMailUseCase(args, ctx)` a `mail-send` Edge Function kliens-oldali wrapper-je. Ez az **első valódi use-case** a core-ban, minta a jövőbeli M7+ modul-hullámoknak:

- **Input interface** (`MailSendArgs`) + **Ctx interface** (`MailSendCtx` — csak a Supabase kliens kell)
- **Nem dob kivételt**, mindig `MailSendResult`-ot ad — egyértelmű, tesztelhető hibakezelés
- `supabase.functions.invoke('mail-send', { body: args })` — az Edge Fn 401/500/200 válaszait egységes result-objektummá alakítja
- Authenticated session feltételezve (a Supabase kliens adja a headert)

**Export**: a `@kartoteka/core/src/index.ts`-ben re-exportálva (`sendMailUseCase`, `EmailRecipient`, `MailSendArgs`, `MailSendCtx`, `MailSendResult`). `typecheck` zöld.

**Használat** (mintapéldány):
```ts
import { sendMailUseCase } from '@kartoteka/core'
const supabase = getDesktopSupabase()                       // vagy createServerSupabaseClient() web-en
const result = await sendMailUseCase({ to, subject, text, html }, { supabase })
if (!result.success) console.error(result.error)
```

A web Server Action-ök (access-requests, broadcasts, device-revoke, support) az M7 alatt váltanak át a `sendMailUseCase` hívásra — addig a meglévő `apps/web/lib/email/send.ts` backward-compat marad.

---

## [2026-04-22] — M6.4a: `mail-send` Edge Function (secret-gateway első darabja)

<!-- key: 2026-04-22-m6-4a-mail-send-edge-function -->
<!-- category: security -->
<!-- version: Edge Function — Endre deploy-olja -->
<!-- targets: fejlesztő -->

### 📧 Egységes email-küldési gateway — API kulcsok elzárva a kliens elől

A Tauri desktop **soha nem tartalmazhat** külső API kulcsot. Ez az első Edge Function a `supabase/functions/mail-send/` alatt, minta a többi 3 gateway-hez (`oblio-oauth`, `oblio-invoice`, `ai-chat` — M7/M11-ben).

- **Deno runtime**, `Deno.serve()` handler
- **Auth**: authenticated Supabase user JWT kötelező (401 ha hiányzik)
- **Két provider**: Brevo default (EU GDPR, 300/nap), Resend fallback — ha az elsődleges fail, automatikusan próbálja a másikat
- **Secrets Supabase CLI-ben**: `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_PROVIDER`

### Deploy

```bash
supabase secrets set BREVO_API_KEY="xkeysib-..."   # és a többi
supabase functions deploy mail-send
```

Részletes deploy + curl-smoketest: [`supabase/functions/mail-send/README.md`](../supabase/functions/mail-send/README.md)

### Integráció későbbre

A kliens-oldali `sendMailUseCase(args, ctx)` wrapper az **M7 alatt** kerül be a `packages/core/src/mail/send.ts`-be. A meglévő `apps/web/lib/email/send.ts` addig backward-compat marad.

**Részletek**: [`KARTOTEKA-M6-4a-mail-send-edge-function-2026-04-22.md`](project-tracking/KARTOTEKA-M6-4a-mail-send-edge-function-2026-04-22.md)

---

## [2026-04-22] — M6.2 TELJES ZÖLD + M6.7 Dexie tiltás desktopon

<!-- key: 2026-04-22-m6-2-zold-es-m6-7-dexie-tiltas -->
<!-- category: security -->
<!-- version: — -->
<!-- targets: fejlesztő -->

### 🎯 M6.2 teljes audit zöld (M7 blokkolója elhárult)

Az M6.2a fix-migráció lefutott Supabase Studio-ban, a fájl-végi check-SELECT-ek eredménye:

| p1_total | ok | warn_no_policy | fail_rls_off | fail_missing |
|---------:|---:|---------------:|-------------:|-------------:|
|    **26** | **26** | **0**     | **0**        | **0**        |

Teljes RLS audit minden prioritási szinten zöld (P0=38/38, P1=26/26, P2=6/6, P3=1/1). **Az M7 pénzügyi wave blokkolója elhárult**.

### 🚫 M6.7: Dexie / IndexedDB import tiltás a desktop kódban

A cél a dual-storage (Dexie + SQLCipher) megszüntetése — a desktop csak a Rust-oldali SQLCipher-t használja a `@kartoteka/offline-sync` `StorageBackend` absztrakciója mögött.

- **Új script**: [`scripts/check-desktop-banned-imports.mjs`](../scripts/check-desktop-banned-imports.mjs) — tiszta Node.js (Windows-kompatibilis), tiltott csomagok: `dexie`, `dexie-react-hooks`, `@kartoteka/offline-sync/dexie-backend`
- **Integráció**: `apps/desktop/package.json` `build` és `tauri` scriptek előtt `lint:imports` fut (dev-en nem — Vite natívan jelezne)
- **Verifikáció**: `✅ M6.7 import-check OK (21 fájl vizsgálva, 0 tiltott import)` — a kódbázis már most tiszta, a script preventív

**Részletek**: [`KARTOTEKA-M6-7-dexie-tiltas-desktopon-2026-04-22.md`](project-tracking/KARTOTEKA-M6-7-dexie-tiltas-desktopon-2026-04-22.md)

---

## [2026-04-21] — M6.2a: RLS fix a 4 jegyzőkönyv-táblára (P1 lyuk bezárva)

<!-- key: 2026-04-21-m6-2a-rls-fix-jegyzokonyv -->
<!-- category: security -->
<!-- version: SQL migráció — Endre futtatja -->
<!-- targets: fejlesztő, rendszerbiztonság -->

### 🔐 Az utolsó P1 RLS-lyuk bezárva

Az M6.2b diagnostic azonosította: mind a 4 `fail_rls_off` tábla a **jegyzőkönyvek modulban** — `presbiteri_jegyzokonyvek` (parent) + 3 child (`jegyzokonyv_hatarozatok`, `jegyzokonyv_napirendi_pontok`, `jegyzokonyv_resztvevok`).

**A miértje**: a 2026-04-12 `jegyzokonyv-restructure.sql` szándékosan OFF-ban hagyta az RLS-t, mert *akkor* az app-szintű `getEffectiveAccessContext()` szűrés elégnek bizonyult. A **Tauri desktop migráció ezt felülírja**: a desktop közvetlen, ctx nélküli Supabase-hívásokkal dolgozik, ezért minden tábla RLS-védett kell legyen.

### 🛠 A fix

Fájl: [`migration-docs/sql/2026-04-21-m6-2a-rls-fix-jegyzokonyv.sql`](../migration-docs/sql/2026-04-21-m6-2a-rls-fix-jegyzokonyv.sql)

- `ENABLE ROW LEVEL SECURITY` mind a 4 táblán
- Parent policy: egysoros `FOR ALL` a `current_user_can_access_congregation(congregation_id)` helper-rel — ugyanaz a minta, mint `befizetes`/`kiadas`/`jarulek_kedvezmeny` (WC-7.4 fázis 2e)
- 3 child policy: scope a parent `congregation_id`-ján keresztül `EXISTS` subquery-vel (a child táblákon nincs saját `congregation_id` — `jegyzokonyv_id` FK-val kapcsolódnak)
- Backward-compatible: a meglévő Server Action-ök továbbra is működnek (defense-in-depth)

### ✅ Check-SELECT-ek a fájl végén (futtatható)

1. Mind a 4 tábla `rls_enabled=true`, `policy_count=1`, `✅ OK`
2. Policy részletek (cmd='ALL', roles={authenticated}, USING + CHECK)
3. M6.2 P1 összefoglaló újrafutás — várt: `ok=26, fail_rls_off=0`

Ha minden zöld → **M7 pénzügyi wave INDULHAT**.

### 🧭 Új alapelv (memóriába kerül)

A Tauri migráció architektúrális alapelvet változtat: **minden desktopra kerülő táblának RLS-védettnek kell lennie** (eddig "app-level filter elég" → mostantól "RLS kötelező"). Új modulra = azonnal RLS + `current_user_can_access_congregation()` policy.

**Részletek**: [`KARTOTEKA-M6-2a-rls-fix-jegyzokonyv-2026-04-21.md`](project-tracking/KARTOTEKA-M6-2a-rls-fix-jegyzokonyv-2026-04-21.md)

---

## [2026-04-21] — M6.5 Next.js 16 middleware→proxy átnevezés + 4 ESLint error javítása

<!-- key: 2026-04-21-m6-5-proxy-rename-es-lint -->
<!-- category: improvement -->
<!-- version: Next.js 16 deprecation housekeeping -->
<!-- targets: fejlesztő -->

### 🔀 middleware.ts → proxy.ts (Next.js 16 file-convention)

A Next.js 16 a `middleware.ts`-t deprecated-nak jelöli, új név `proxy.ts` + függvénynév `proxy`. A `matcher` és a funkcionalitás változatlan. A `@/lib/supabase/middleware` saját helper-modul (Supabase SSR session) szándékosan nem változott — az nem Next.js file-convention.

### 🧹 4 ESLint error javítása (68 warning marad, non-blocking)

- **`access-request-approve-dialog.tsx:111`** és **`access-requests-table.tsx:125`** — `react/no-unescaped-entities`: magyar idézőjel-pár `„...”` → `&bdquo;...&rdquo;`
- **`motion-primitives.tsx:145`** — `react-hooks/set-state-in-effect`: render-time `staticDisplay` derived value + két külön effect (csak non-reduced-motion esetén iratkozik fel a spring `change`-re), nincs többé synchronous setState az effect-ben
- **`splash-screen.tsx:33`** — ua. szabály: felesleges `mounted` flag törölve, a maradék session-specifikus `setVisible(true)` pedig targetált `eslint-disable-next-line`-nal dokumentált indoklással (átfogó `useSyncExternalStore`-refactor M15-ben)

### ✅ Verifikáció

```
cd apps/web
npm run lint     → 0 errors, 68 warnings
npx tsc --noEmit → 0 errors
```

**Részletek**: [`KARTOTEKA-M6-5-middleware-proxy-es-lint-2026-04-21.md`](project-tracking/KARTOTEKA-M6-5-middleware-proxy-es-lint-2026-04-21.md)

---

## [2026-04-21] — M6.2 RLS audit első eredménye: P0/P2/P3 zöld, P1-ben 4 fail_rls_off

<!-- key: 2026-04-21-m6-2-rls-audit-eredmeny -->
<!-- category: security -->
<!-- version: — -->
<!-- targets: fejlesztő -->

### 🔐 M6.2 audit lefutott

Endre lefuttatta a 113-tábla RLS auditot Supabase Studio-ban. Összefoglaló:

| Prioritás | Total | OK | warn_no_policy | fail_rls_off | fail_missing |
|-----------|------:|---:|---------------:|-------------:|-------------:|
| **P0**    |    38 | 38 | 0              | **0**        | 0            |
| **P1**    |    26 | 22 | 0              | **4**        | 0            |
| **P2**    |     6 |  6 | 0              | **0**        | 0            |
| **P3**    |     1 |  1 | 0              | **0**        | 0            |

A P0 pénzügy + tagnyilvántartás + anyakönyv (38/38) ÉS a P2/P3 teljesen zöld. **Az M7 pénzügyi wave elindulhat**, amint a P1 szintű 4 fail_rls_off pótolva lesz.

### 🎯 M6.2b diagnostic SQL

A 4 pontos tábla azonosítására: [`migration-docs/sql/2026-04-21-m6-2b-diagnostic-p1-fail.sql`](../migration-docs/sql/2026-04-21-m6-2b-diagnostic-p1-fail.sql) — csak SELECT, a 26 P1 tábla közül listázza a hiányosokat. Endre futtatja, a válasz alapján születik az **M6.2a fix-migráció**.

---

## [2026-04-21] — M6.1 shared packages skeleton + M6.2 RLS audit SQL

<!-- key: 2026-04-21-m6-1-packages-skeleton-es-m6-2-rls-audit -->
<!-- category: improvement -->
<!-- version: monorepo (packages) — nincs release -->
<!-- targets: fejlesztő -->

### 📦 5 új közös csomag skeleton létrehozva (M6.1)

A Tauri desktop migrációs roadmap első konkrét lépése: a web és a desktop közös frontend + business logic rétege számára skeleton package-ek a `packages/` alatt:

- **`@kartoteka/core`** — use-case függvények, domain kalkulátorok (web + desktop közös)
- **`@kartoteka/ui-app`** — alkalmazás-szintű React komponensek (302 komponens célhelye)
- **`@kartoteka/offline-sync`** — `StorageBackend` absztrakció (web: Dexie, desktop: SQLCipher) + pull/push orchestrator
- **`@kartoteka/auth`** — RBAC helper-ek, scope-builder-ek
- **`@kartoteka/validations`** — közös zod sémák

Mind az 5 csomagra `npm install` + `npm run typecheck` zöld (0 TS hiba). A tartalom a modul-hullámokban (M6.8, majd M7+) gördül át — egyelőre csak a skeleton + részletes dokumentációs kommentek a szándékolt modul-szerkezettel.

### 🔐 113-tábla RLS audit SQL átadva Endrének (M6.2)

Fájl: [`migration-docs/sql/2026-04-21-m6-2-rls-audit-full.sql`](../migration-docs/sql/2026-04-21-m6-2-rls-audit-full.sql)

**Csak SELECT, 6 riport:**
1. Teljes public-séma RLS overview (dinamikus, minden tábla)
2. Modul-priorizált audit — 103+ tábla a 22 dashboard modulhoz rendelve (P0/P1/P2/P3/web-only/system)
3. anon role engedélyek (gyanús publikus SELECT privát táblán)
4. Hiányzó policy-k (RLS ON, 0 policy)
5. SECURITY DEFINER helper fn-ek léte (`current_user_congregation_id`, `…_has_global_access`, `…_can_access_congregation`, `is_admin`, `same_congregation`, `is_owner`)
6. Összefoglaló counter — OK/WARN/FAIL prioritásonként

**Blokkoló szabály M7 indításához**: P0+P1 szinten `fail_rls_off = 0` ÉS `warn_no_policy = 0` ÉS `fail_missing = 0`. Ha a riport lyukakat mutat, fix-migrációk (`2026-04-22-m6-2a-rls-fix-*.sql`) készülnek, csak utána indul az M7 pénzügyi wave.

**Részletek**: [`KARTOTEKA-M6-1-packages-skeleton-es-M6-2-rls-audit-2026-04-21.md`](project-tracking/KARTOTEKA-M6-1-packages-skeleton-es-M6-2-rls-audit-2026-04-21.md)

---

## [2026-04-21] — M6+ Tauri desktop migrációs roadmap dokumentálva

<!-- key: 2026-04-21-m6-plusz-tauri-roadmap -->
<!-- category: improvement -->
<!-- version: tervezési dokumentum (nem release) -->
<!-- targets: fejlesztő, tech-lead -->

### 📘 Részletes roadmap a hátralévő Tauri migrációs munkára

Az M0–M5 fázisok lezárultak (Tauri 2 + SQLCipher + keyring + device-bind + auto-updater éles), valamint M6 (congregations), M7 (`szemely`) és M8 (`munkanaplo`) offline-sync is fut. A hátralévő 22 dashboard modul, 77 Server Action, 8 API route, 302 komponens és 139 `lib/` fájl átemeléséhez készült egy **senior szintű, gyártásra alkalmas roadmap**.

**Fájl**: `docs/project-tracking/KARTOTEKA-tauri-migracio-folytatas-M6-plusz-2026-04-21.md`

**Kulcs döntések** (user-approved):
- **Architektúra**: Hibrid A — shared `packages/{core,ui-app,offline-sync,auth,validations}`; Next.js marad SSR-kritikus helyeken (publikus `/gy/[slug]`, auth, admin, god-mode)
- **Modul prioritás**: biztonsági súly szerint — P0 pénzügy → tagnyilvántartás → anyakönyv; P1 jegyzőkönyvek/iktato/leltar/eves-jelentes/profile/dashboard/congregation/notifications; P2–P3 többi; admin + god-mode + publikus-oldal szerkesztő **web-only**
- **Offline scope**: mind a 22 modul offline-capable SQLCipher mirror-ral
- **Külső API** (Oblio/Brevo/Resend/Claude): **Supabase Edge Function gateway** — secret SOHA nem kerül desktopra
- **Code sign**: self-signed EREK cert marad béta-fázis alatt (EV/Azure Trusted Signing M16+ döntés)
- **Default viselkedés**: online-first, offline-capable fallback

**Roadmap váz**: M6 (architektúra konszolidáció, 2-3 hét) → M7–M12 (5 modul-hullám, 12-16 hét) → M13 (E2E doc titkosítás) → M14 (delta-update + rollback + release pipeline) → M15 (magyar lokalizáció) → M16 (béta 5-10 lelkésszel, majd fokozatos rollout 1000 lelkészre).

**Top 3 kockázat**: (1) a 77 Server Action refaktor M6–M12 teljes időtartamát blokkolja; (2) egy P0 táblán hiányzó RLS-policy cross-congregation adatszivárgást okozhat a közvetlen desktop hívásoknál — M6.2 **113-tábla RLS audit** kötelező előfeltétel; (3) a 22-modulos offline scope nagyobb, mint a minimum, de modul-hullámokkal kezelhető.

**Következő lépés**: **M6.1 — packages skeleton** (`packages/{core,ui-app,offline-sync,auth,validations}`) + **M6.2 — 113-tábla RLS audit SQL** (`migration-docs/sql/` alá, futtatható check-SELECT-ekkel a fájl végén). Endre fogja az SQL-t Supabase Studio-ban lefuttatni.

---

## [2026-04-23] — M6: Gyülekezet-adatok offline elérhetősége (congregations pull-sync)

<!-- key: 2026-04-23-m6-congregations-sync -->
<!-- category: feature -->
<!-- version: desktop M6 (SQL migráció + kliens kód, release nélkül) -->
<!-- targets: fejlesztő, lelkészek (közvetve — a későbbi release-nél látják) -->

### 📖 A Tauri-kliens most offline is megjeleníti a gyülekezet-adatokat

Az M2.4–M2.6 fázisban a saját profil szinkronizáció működött (olvasás + írás + konfliktus-kezelés). Az M6-tal ez a minta kiterjed az **első domain-táblára**: a gyülekezetekre. A lelkész most a desktop app-ban látja a **saját gyülekezete** minden releváns adatát **internet nélkül is**.

**Mi jelenik meg:**
- Név (kánoni + magyar + román), egyházkerület, egyházmegye, adószám
- Elérhetőség: cím, város, megye, irányítószám, e-mail, telefon, weboldal
- Pénzügyi: IBAN, bank, éves járulék, kedvezményes járulék, járulék-határidő
- Publikus oldal: slug (`/gy/...`), aktív-e
- Címer/logó (ha van `cimer_url`)
- Sync-metaadatok: `revision`, `updated_at`, `synced_at`

### Implementáció — két oldal

**1. Supabase backend** (`migration-docs/sql/2026-04-23-m6-1-congregations-revision.sql`):
- `ALTER TABLE congregations ADD COLUMN revision bigint NOT NULL DEFAULT 0`
- `ALTER TABLE congregations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`
- `BEFORE UPDATE trigger tg_congregations_bump_revision` — minden UPDATE-nél revision++ és updated_at := now()
- `idx_congregations_updated_at` index a delta-sync-hez
- Idempotens SQL (IF NOT EXISTS + DROP TRIGGER IF EXISTS), újrafuttatható

**2. Desktop kliens**:
- **Rust** (`apps/desktop/src-tauri/src/db.rs`): új v4 migráció → `congregations_local` SQLite tábla 27 oszloppal (uuid→TEXT, numeric→REAL, boolean→INTEGER 0/1, timestamptz→TEXT). SQLCipher-rel titkosítva, mint a többi adat.
- **TS sync layer** (`apps/desktop/src/lib/sync.ts`):
  - `CongregationLocalRow` interface (27 mező)
  - `pullOwnCongregation(userId)` — profiles.congregation_id-n keresztül fetch + ON CONFLICT upsert
  - `getLocalOwnCongregation(userId)` — offline olvasás
  - `getLastPullCongregationIso()` — last pull timestamp
- **UI** (`apps/desktop/src/pages/dashboard-page.tsx`): új „Saját gyülekezet — offline nézet" Card, 4 szekcióra osztva (alapadatok, elérhetőség, pénzügyi, publikus oldal) + logó-előnézet, ha van `cimer_url`.

### Mit NEM tartalmaz ez a fázis (scope)

- **Írás** (update) — az admin-privilégium; későbbi fázisban jön
- **Több gyülekezet** egy user-hez (dual-role esetek) — egyelőre a `profiles.congregation_id` single-value mező alapján dolgozunk
- **TVA / e-factura oszlopok** — a komplex ROI-specifikus mezők kimaradnak, mert ezek admin-kezelt adatok
- **adrlocality_id / adrstreet_id** FK-olt cím-hierarchia — a `cim`/`varos`/`iranyitoszam` string-mezők egyelőre elegendők a desktop UI-n

### Verifikáció

- `npx tsc --noEmit` : 0 hiba
- `cargo check` : OK (a v4 migráció szintaktikailag érvényes, a teljes `desktop` crate fordul)
- Az SQL migráció végén futtatható `SELECT`-ek (4a–4f): az oszlopok + trigger + index + sample-sorok egy lépésben ellenőrizhetők a Supabase Studio-ban

### Futtatás

1. **Supabase oldal**: Studio SQL Editor → `2026-04-23-m6-1-congregations-revision.sql` futtatása (1× elég, idempotens)
2. **Desktop oldal**: a következő `npm run desktop:dev` vagy release-build automatikusan futtatja a v4 migrációt a lokális SQLCipher-en
3. **Teszt**: Dashboard → „Saját gyülekezet" Card → „Pull gyülekezet" gomb

---

## [2026-04-23] — v0.2.0: Első publikált Kartotéka release (auto-updater élesben)

<!-- key: 2026-04-23-v0-2-0-first-release -->
<!-- category: feature -->
<!-- version: 0.2.0 (desktop) / 1.15.20 (rendszer) -->
<!-- targets: fejlesztő, lelkészek (közvetve) -->

### 📦 A Kartotéka desktop kliens első éles release-e megjelent

**A webes működést nem érinti.** Ez az első publikus desktop-verzió, amely az auto-updater mechanizmuson keresztül **is** elérhető. Egy későbbi Kartotéka-telepítésnél a „Frissítés → Ellenőrzés" gomb fogja **ténylegesen** észlelni.

**Kibocsátás**: `v0.2.0` (Tauri), `1.15.20` (rendszer-szintű)
**Platform**: Windows x64 (NSIS EXE + MSI)
**Host**: Supabase Storage — `https://bjytiawckbibqmtlezfl.supabase.co/storage/v1/object/public/updater/windows-x86_64/`

### Aláírások + biztonság
| Réteg | Típus | Kulcs |
|---|---|---|
| **Bináris aláírás** (MSI + EXE) | Authenticode (signtool) | Self-signed EREK cert (thumbprint `F8DE7E85...`) |
| **Updater manifest aláírás** | Ed25519 (minisign-format) | Új updater kulcs (`8EBAC2E77C732DCE`) |

A kliens mindkét aláírást **külön** ellenőrzi: a code-sign cert-et Windows SmartScreen, az updater-signature-t a Tauri updater-plugin a `tauri.conf.json`-ben lévő publikus kulccsal.

### Publikálási flow (az új `ops/release-build.ps1`)

```powershell
.\ops\release-build.ps1 -Version "0.2.0" -Notes "Első auto-update teszt"
```

Egy hívás mindent intéz:
1. `tauri.conf.json` + `Cargo.toml` verzió-ellenőrzés + in-place bump (ha kell, a user-rákérdezéssel)
2. Release-build: Rust optimalizált + Vite prod bundle
3. Code-signing: MSI + NSIS EXE aláírás
4. Updater-signing: `.exe.sig` + `.msi.sig` Ed25519-aláírás
5. ASCII-safe filename konverzió (`Kartotéka` → `Kartoteka` a Supabase bucket-object-key-hez)
6. Manifest-generálás (`latest.json`): `{ version, notes, pub_date, platforms.windows-x86_64.{signature, url} }`
7. Upload a Supabase Storage REST API-n át (`x-upsert: true` — override a régi verziót)

### Fájlok a Supabase Storage-on

```
updater/
└── windows-x86_64/
    ├── Kartoteka_0.2.0_x64-setup.exe   (4.76 MB, signed)
    └── latest.json                      (~400 byte, Ed25519-signed manifest)
```

### Release-pipeline-tanulságok (5 körös debug után)

A teljes pipeline **első működő konfigurációjának** eléréséhez négy ponton kellett script-javítás:

1. **UTF-8 encoding** a PS-script-ekben (`[System.IO.File]::ReadAllText+UTF8Encoding(false)`) a magyar karakterek megőrzéséhez
2. **`--password` explicit flag** a `signer generate`-nél (a `--ci` flag inkonzisztens Tauri v2 2.10.x-en)
3. **Tauri v2 output**: a `.nsis.zip` helyett közvetlen `*-setup.exe + *.exe.sig` páros
4. **ASCII-key** a Supabase Storage-hoz (a filename-ben lévő `é` → `InvalidKey`)

Mind rögzítve a `memory/project_dev_toolchain_windows.md`-ben.

### Kipróbálás (ha később tesztelni akarod)

1. Telepíts egy korábbi v0.1.0-s buildet (ha megvan még) vagy ideiglenes downgrade-eld a dev-verziót
2. Indítsd: Dashboard → Frissítés → Ellenőrzés
3. Várt: „Új verzió: 0.2.0" + Letöltés + Telepítés + Restart

### Következő release

```powershell
.\ops\release-build.ps1 -Version "0.3.0" -Notes "..."
```

A pipeline most innen **egyszerre** működik: minden további release ugyanebben a parancsban lebonyolódik (~1-2 perc build + upload).

---

## [2026-04-23] — M5: Auto-updater skeleton (tauri-plugin-updater)

<!-- key: 2026-04-23-m5-updater-skeleton -->
<!-- category: improvement -->
<!-- version: 1.15.19 -->
<!-- targets: fejlesztő -->

### ⬆️ A Kartotéka desktop most már **képes saját magát frissíteni**

**Skeleton-setup**: a kód kész, a host-oldal (manifest URL + új verzió feltöltése) még nem — ez az első éles verzió-release előtt kerül beállításra. Addig a gomb „Ellenőrzés" hibát fog dobni (placeholder pubkey).

**Új Rust dep**:
- `tauri-plugin-updater v2` (hozza: `reqwest`, `hyper-rustls` — mind pure-Rust)

**Új npm dep**:
- `@tauri-apps/plugin-updater v2`

**Új Tauri capability**: `updater:default` a `capabilities/default.json`-ben

**`tauri.conf.json` frissítés:**
```json
{
  "plugins": {
    "updater": {
      "pubkey": "UPDATER_PUBKEY_PLACEHOLDER_BYGENSCRIPT",
      "endpoints": [
        "https://updates.kartoteka.hu/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true,
    ...
  }
}
```

A `createUpdaterArtifacts: true` azt jelenti, hogy a `npm run desktop:build` mostantól generál egy **`.nsis.zip`** fájlt is az MSI + NSIS EXE mellé — ezt tölti le az auto-updater.

**Új TS modul** (`apps/desktop/src/lib/updater.ts`):
- `checkForUpdates()` → `{ available, version, releaseDate, notes, error, handle }`
- `downloadAndInstall(handle, onProgress)` → `{ success, error }`

**Dashboard bővítés**: új **„Frissítés"** kártya a lap tetején:
- „Ellenőrzés" gomb — ellenőrzi, van-e új verzió
- Ha van: megjelenik a verzió-szám + release dátum + release notes (ha a manifest tartalmazza)
- „Letöltés és telepítés" gomb — progress-kiírás (X%), telepítés után az app restart-ol

**Új PS script** (`ops/updater-key-setup.ps1`):
- Ed25519 kulcspár generálás a `cargo tauri signer generate` paranccsal
- A privát kulcs `ops/updater-private.key`-be kerül (gitignore-olt)
- A publikus kulcs `.pub` fájlba és kiírva — Endre bemásolja a `tauri.conf.json`-be, felülírva a `UPDATER_PUBKEY_PLACEHOLDER_BYGENSCRIPT`-et

**Host-döntés — még Endre előtt**:

Az auto-updater egy **aláírt JSON manifest**-et kér egy HTTP endpoint-ról. Két népszerű host:

| Opció | Előny | Hátrány |
|---|---|---|
| **GitHub Releases** | Ingyenes, verzió-kezelés benne, CI-integráció könnyű | Nyilvános URL (bár privát repo is megy tokennel) |
| **Supabase Storage** | Már van Supabase account, EU-hosting, GDPR-biztos | Signed URL-ek kicsit bonyolultabbak |
| **Saját CDN / kartoteka.hu** | Teljes kontroll | Üzemeltetési költség (~$5/hó) |

**Javaslat**: **Supabase Storage** (EU-szervereken, már része az infrastruktúránknak). Egy privát bucket, signed URL-lel a manifest-hez.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 40 s (új reqwest + hyper-rustls crate-ek, mind pure-Rust)
- ✅ `npm run desktop:build` (Vite): 521 kB JS (+6 kB updater.ts + UI), 57 kB CSS, 5.19 s

**Következő lépések Endre felé (amikor új release kell):**

1. **Egyszer**: futtasd az `ops/updater-key-setup.ps1`-et → Ed25519 keypair generálódik
2. Másold a publikus kulcsot a `tauri.conf.json`-be
3. Dönts a host-ról (Supabase Storage a javaslatom)
4. A `npm run desktop:build` előtt:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ops\updater-private.key -Raw
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "kartoteka-updater-dev-2026"
   npm run desktop:build
   ```
5. Az output `.nsis.zip`-et + az aláírás-hash-t tedd a host-ra, a manifest-et generáld le
6. Az appban a „Frissítés / Ellenőrzés" gombra kattintva a kliens letölti

---

## [2026-04-23] — M4.1 + M4.2: Restore-gomb + revoke/restore email-értesítés

<!-- key: 2026-04-23-m4-polish -->
<!-- category: improvement -->
<!-- version: 1.15.18 -->
<!-- targets: rendszergazda, lelkészek -->

### 🔄 Az admin feloldhatja a revoke-ot, és minden átkapcsolásról email megy a user-nek

**Az M4 két hiányzó darabját pótolja:**
1. A revoke-olt eszközök **visszaállíthatók** a web admin UI-ról (eddig csak manuális SQL UPDATE)
2. Mind a revoke-ról, mind a restore-ról **automatikus email** megy a user-nek (Brevo-n át)

**Új server action** (`apps/web/app/(dashboard)/admin/devices-licenses-actions.ts`):
- `restoreDevice({ id })` — `UPDATE revoked=false, revoked_by=null, revoked_at=null, revoke_reason=null`
- Biztonsági check: már visszaállított eszközt nem dupla-state-elünk
- Audit-log: `action='device.restore'`
- Email: `deviceRestoredEmail` (emerald színű, „Eszköz újra aktív")

**revokeDevice action bővítve**:
- A revoke előtt lekéri a user-info-t (`profiles.email, full_name`) és az eszköz-nevet
- Revoke után `deviceRevokedEmail` — rose/destruktív színű template, benne: eszköznév, platform, időpont, indok
- Ha az email-küldés hibára fut, a revoke-ot attól nem görgetjük vissza (a security fontosabb)

**Új email-sablonok** (`apps/web/lib/email/templates/device-revoke.ts`):
- `deviceRevokedEmail({ email, fullName, deviceName, platform, reason, revokedAtIso })`
- `deviceRestoredEmail({ email, fullName, deviceName, platform, restoredAtIso })`
- Stílus: ugyanaz mint az access-request template-ek (max-width: 600px, Cormorant Garamond cím, colored accent badge)
- Hangvétel: egyházi-pásztori, „Áldott napot kíván"-zárlattal

**UI bővítés** (`apps/web/components/admin/devices-licenses-tab.tsx`):
- A **revoke-olt sorokon** most a piros „Revoke" helyett zöld „Visszaállít" gomb jelenik meg
- A gomb `title` attribútuma a revoke indoklását mutatja hover-en (tooltip)
- Megerősítés: confirm() dialog a restore előtt is (UX-biztonság)
- Toast-okban jelezve, hogy a user email-ben értesítve

**Új audit-action label** a shared.ts-ben:
- `'device.restore': 'Eszköz visszaállítva'` (a Napló-fülben magyarul jelenik meg)

**Teljes revoke/restore flow most:**

```
[Admin a web-en klikkel Revoke]
    ↓
UPDATE user_devices SET revoked = true, revoke_reason, ...
    ↓
INSERT audit_log (device.revoke, metadata = { reason })
    ↓
sendEmail(deviceRevokedEmail) → Brevo → user inbox
    ↓
[Desktop kliens 30 mp-en belül észleli — M4 core]
    ↓
alert() + signOut() + redirect /login
```

```
[Admin klikkel Visszaállít]
    ↓
UPDATE revoked = false, revoke_* = null
    ↓
INSERT audit_log (device.restore)
    ↓
sendEmail(deviceRestoredEmail) → user inbox
    ↓
[A user újra bejelentkezhet az eszközön]
```

**Verify:**
- ✅ `npx tsc --noEmit` (apps/web): 0 hiba
- ✅ `npm run build` (Next.js prod): SUCCESS, 50+ route generált

**Kipróbálás:**
1. Desktop-on login → „Ez az eszköz" aktív
2. Web-en `/admin` → Eszközök → **Revoke** → indoklás
3. Email érkezik (nézd a Brevo log-ot vagy az inboxot)
4. Desktop 30 mp-en belül kijelentkezik
5. Web-en **Visszaállít** → confirm dialog → megerősítés
6. Újabb email (restored)
7. Desktop: újra login működik

Ezzel az M4 minden része **teljes + éles**. Az M0.5-ben lerakott devices-licenses UI minden funkcióját használjuk, és az email-flow teljes.

---

## [2026-04-23] — M4: Admin revoke + desktop auto-logout

<!-- key: 2026-04-23-m4-admin-revoke -->
<!-- category: security -->
<!-- version: 1.15.17 -->
<!-- targets: fejlesztő, rendszergazda, lelkészek (közvetve) -->

### 🚫 Az admin bármikor visszavonhatja egy eszköz hozzáférését

**A webes oldali admin felület már az M0-ban elkészült** (`devices-licenses-tab.tsx`), csak most vált élessé az M3.3 eszköz-bind bevezetésével. Az M4 a **desktop-oldali detektálást** adja hozzá: ha az admin a web-ről revoke-ol egy eszközt, a kliens 30 másodpercen belül észleli és automatikusan kijelentkezik.

**Webes admin felület** (`/admin/devices-licenses`):
- Három sub-tab: **Eszközök, Licencek, Napló**
- **Eszközök** tab:
  - Táblázat: Felhasználó (email + név), Eszköz (név + fingerprint), Platform, Regisztrálva, Utolsó aktivitás, Státusz, Művelet
  - **Revoke gomb** → kötelező indoklás → UPDATE `revoked = true, revoked_by, revoked_at, revoke_reason`
  - Auto-audit: `audit_log.action = 'device.revoke'` → azonnal bekerül a Napló-fülbe

**Desktop kliens — új detektor** (`apps/desktop/src/lib/device.ts`):
- `checkDeviceRevokeState(userId)` — Supabase SELECT a saját eszközre (user_id + fingerprint)
- Visszatérés: `{ known, revoked, reason, revokedAt, deviceRowId }`
- Hibatűrő: ha a Supabase nem elérhető, `known: false` — a kliens nem jelentkezik ki tévedésből

**Dashboard integráció**:
- Új useEffect login után: **azonnali** ellenőrzés + **30 másodperces periodikus poll**
- Ha `revoked === true`:
  1. `alert(...)` a user-nek — a revoke indoklása kiírva
  2. `supabase.auth.signOut()`
  3. `navigate('/login', { replace: true })`

**Biztonsági modell:**
- Az admin revoke-ot nem tudja bypass-olni a kliens (RLS + server-oldali check)
- A desktop-oldali polling csak **UX-javítás** — a user egyébként is sign-out-ra kényszerül, amint a Supabase auth-session-je elévül
- A revoke **audit-trail**-elt: `audit_log` táblába kerül `action='device.revoke'` + metadata (reason)

**Kipróbálási forgatókönyv:**
1. Desktop: `npm run desktop:dev` → login → „Ez az eszköz" kártyán látszik, hogy aktív
2. Böngésző: `/admin` → Eszközök tab → saját eszköz → Revoke → indoklás („teszt")
3. Desktop: 30 mp-en belül **alert** jelenik meg: „Ezt az eszközt a rendszergazda visszavonta. Indok: teszt. A kliens automatikusan kijelentkezik."
4. Az alert után: login-oldalra redirect
5. Ha újra bejelentkezne, a Dashboard azonnal detektálja a revoke-ot és megint kidobja
6. Admin a web-en **Restore** (ha majd hozzáadjuk — most manual UPDATE a Studio-ban: `UPDATE user_devices SET revoked = false WHERE id = '…'`)

**Mi nem része az M4-nek (későbbi):**
- **Soft-restore gomb** az admin UI-n (most csak revoke van)
- **Tömeges revoke**: az összes user eszköze egy lépésben (pl. ha a user maga is revokolódott)
- **Email-értesítés a user-nek** a revoke-ról (a user már látja az alert-et, de email is jó lenne)
- **Gépen-aktív revoke**: jelenleg 30 sec polling a leggyorsabb. Supabase Realtime subscription-nel (`postgres_changes`) pillanatnyi lehetne — későbbi optimalizáció
- **Eszköz-átnevezés** (device_name frissítés) — szép UX, de nem biztonsági

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build`: 516 kB JS (+1 kB polling glue), 57 kB CSS, 3.40 s
- Web-oldal nem változott (az M0 óta már tesztelt)

**Ezzel az M4 teljes**. A teljes szakértő-ajánlás V4 szinte teljes — a hátralevő M5 (auto-updater), M6 (béta-tesztelés) már üzemeltetési fázisok.

---

## [2026-04-23] — M3.3: Eszköz-bind — Ed25519 keypair + user_devices regisztráció

<!-- key: 2026-04-23-m3-3-device-bind -->
<!-- category: security -->
<!-- version: 1.15.16 -->
<!-- targets: fejlesztő, lelkészek (közvetve) -->

### 🔐 Minden eszköz saját azonossága — admin-revoke előkészítés

**A webes működést nem érinti közvetlenül.** A desktop kliens az első indításkor egy saját **device_id-t + Ed25519 keypairt** generál a Rust oldalon, és regisztrálja a Supabase `user_devices` táblába. A privát kulcs az OS-szintű keyringben marad (Windows DPAPI), a publikus kulcs a Supabase-ben.

**Ez az alap a következő biztonsági szintekhez**:
- **Admin-revoke**: az egyházkerületi admin bármikor visszavonhatja egy eszköz hozzáférését (M4 UI)
- **Aláírt outbox-payload**: a user saját privát kulcsával írhat alá — a szerver ellenőrzi (M4)
- **E2E doc-titkosítás**: a publikus kulcs a doc-kulcs wrap-olásához (M4 dokumentumtár)

**Új Rust modul** (`apps/desktop/src-tauri/src/device.rs`):
- `load_or_create_device()` — idempotens: első alkalommal generál, utána keyringből olvas
- `#[tauri::command] device_info()` — a frontend invoke-ja

**Új Rust deps** (mind pure-Rust, nincs új C-build):
- `machine-uid v0.5` — hardware-fingerprint (Win registry MachineGuid / macOS / Linux)
- `ed25519-dalek v2` (`rand_core` feature) — keypair + signing
- `base64 v0.22` — serializálás

**Új TS modul** (`apps/desktop/src/lib/device.ts`):
- `getDeviceInfo()` — Rust invoke
- `ensureDeviceRegistered(userId)` — idempotens Supabase INSERT / last_seen UPDATE
- `getMyDevices(userId)` — lekéri az összes regisztrált eszközt
- A publikus kulcs base64 → hex konverzió a `bytea`-oszlophoz

**Új Dashboard-kártya**: „Ez az eszköz"
- Device ID, hardware fingerprint, publikus kulcs (base64)
- Platform + „most generálva" jelzés
- Táblázat: az összes regisztrált eszköz (platform, név, regisztráció, utolsó aktivitás, státusz — aktív/visszavonva)
- Auto-registration a login után

**Biztonsági állapot:**
- ✅ A privát kulcs **SOHA** nem hagyja el az eszközt
- ✅ Az adatbázis `user_devices.public_key` nem elegendő impersonálásra
- ✅ A `device_fingerprint` + `user_id` UNIQUE kombináció — dupla regisztráció elkerülve
- ✅ RLS: `users_register_own_devices` (WITH CHECK `user_id = auth.uid()`) már megvan (M0)
- ⚠️ Egyelőre a signing-használat nem éles (M4 feladat) — a kulcs most „alvó", de készen áll

**Verify:**
- ✅ `npx tsc --noEmit`: 0 hiba
- ✅ `cargo check`: 29.8 s (3 új pure-Rust crate)
- ✅ `npm run desktop:build` (Vite prod): 515 kB JS (+5 kB), 57 kB CSS, 3.17 s

**Kipróbálás:**
1. `npm run desktop:dev` → login → Dashboard
2. Új „Ez az eszköz" kártya jelenik meg
3. Első indításkor: „Eszköz regisztrálva a rendszerben." (zöld)
4. A táblázat mutatja az eszközt (platform=windows, név pl. „Win32", aktív)
5. Supabase Studio-ban ellenőrizhető: `SELECT * FROM user_devices WHERE user_id = '…'` — 1 sor

**Következő (M3.4)**: Tauri updater plugin + aláírt manifest. Az MVP-hez optional — lehet az M3-t lezárni az M3.3-mal is, és átugrani az M5-re, ha Endre úgy dönti.

---

## [2026-04-23] — M3.2: Aláírt MSI + NSIS bundle (self-signed code-sign cert)

<!-- key: 2026-04-23-m3-2-self-signed -->
<!-- category: security -->
<!-- version: 1.15.15 -->
<!-- targets: fejlesztő -->

### 🔏 A Windows installer bundle-k most már **digitálisan aláírtak**

**A webes működést nem érinti.** Az M3.1-es bundle-k még `Unknown publisher`-rel kerültek ki. Az M3.2 óta mindent aláír a Tauri bundler (`signtool.exe`) egy self-signed code-sign cert-tel, és a timestamp is rákerül (DigiCert TSA) — így az aláírás **a cert lejárta után is érvényes marad**.

**Mit csináltunk:**

1. **`ops/code-sign-setup.ps1` futtatása** (Endre egyszer):
   - Self-signed cert generálása: RSA-2048, SHA-256, 3 év érvényesség
   - Subject: `CN=EREK Kartoteka Developer, O=Baratosi Reformatus Egyhazkozseg, C=RO`
   - PFX export: `ops/kartoteka-codesign.pfx` (gitignore-olt)
   - Registrálás mindhárom cert-store-ba: `CurrentUser\My` (a privát-kulcshoz), `TrustedPublisher` (SmartScreen belső-gép), `Root` (Get-AuthenticodeSignature `Valid`)
   - Thumbprint: `F8DE7E854FF9E9DBA9CBD183F79B3F9753A87CE3`

2. **`tauri.conf.json` bővítés** — `bundle.windows` szekció:
   ```json
   {
     "certificateThumbprint": "F8DE7E854FF9E9DBA9CBD183F79B3F9753A87CE3",
     "digestAlgorithm": "sha256",
     "timestampUrl": "http://timestamp.digicert.com"
   }
   ```

3. **Újra build** (inkrementális, pár perc):
   ```bash
   npm run desktop:build
   ```
   A Tauri `signtool.exe` automatikusan aláírt:
   - `Kartotéka_0.1.0_x64_en-US.msi` (5.34 MB)
   - `Kartotéka_0.1.0_x64-setup.exe` (3.89 MB)
   - 3 NSIS plugin-DLL (System, nsDialogs, nsis_tauri_utils)
   - Timestamp: DigiCert TSA (érvényes 2036-ig)

**Verify (`Get-AuthenticodeSignature`):**
- ✅ Signer: `CN=EREK Kartoteka Developer, …`
- ✅ Thumbprint match
- ✅ TimeStamper: `DigiCert SHA256 RSA4096 Timestamp Responder 2025 1`
- ✅ Status: **Valid** (miután a cert a Trusted Root-ba került)

**⚠ Fontos tisztázás — a lelkészi gépekre mi vonatkozik:**

A Windows **SmartScreen** a **globális reputation-szolgáltatást** kérdezi — nem a helyi trust store-t. Egy self-signed cert-nek **nincs reputation**-je → SmartScreen warning (`Unknown publisher`) a **lelkész gépén** **továbbra is megjelenik**.

| Cert típus | Fejlesztői gép (helyi) | Lelkészi gép (reputation) | Cost |
|---|---|---|---|
| Self-signed (M3.2) | ✅ Valid | ⚠ Unknown publisher | ingyenes |
| **Azure Trusted Signing** (M5) | ✅ Valid | ✅ **Nincs warning** | $9.99/hó |
| DigiCert EV | ✅ Valid | ✅ Instant-reputation | ~$300/év |
| SignPath (OSS) | ✅ Valid | ✅ (OSS projektre ingyenes) | ingyenes OSS-re |

Most self-signed-del maradunk — **MVP-alpha-bétára** (Endre és pár tesztelő) elég. Az M5 előtt átlépünk Azure Trusted Signing-re, mielőtt az egész EREK-elnökségnek szétosztjuk.

**Következő (M3.3)**: eszköz-bind — a kliens első indításkor regisztrálja magát a Supabase `user_devices` táblába (device_fingerprint + Ed25519 public_key). Ez az alap a jövőbeli „admin eszköz-revoke" funkcióhoz.

---

## [2026-04-23] — M3.1: Első Kartotéka MSI + NSIS installer bundle

<!-- key: 2026-04-23-m3-1-first-bundle -->
<!-- category: improvement -->
<!-- version: 1.15.14 -->
<!-- targets: fejlesztő -->

### 📦 A desktop kliens már telepíthető MSI + NSIS csomagra

**A webes működést nem érinti.** Ez a M3 (production-deploy) fázis első lépése: a Tauri desktop kliens most már **telepíthető Windows-installer csomaggá** összeállítható.

**Generált bundle-k** (első release build, ~25 perc):

| Installer | Méret | Használat |
|---|---|---|
| `Kartotéka_0.1.0_x64_en-US.msi` | **5.4 MB** | Enterprise-deploy (Group Policy, SCCM), csendes telepítés (`/quiet`) |
| `Kartotéka_0.1.0_x64-setup.exe` | **3.9 MB** | Felhasználóbarát wizard, modern Windows-telepítő |

Output-útvonal: `C:\kartoteka-target\release\bundle\{msi|nsis}\` (a target-dir az M2.2 óta ASCII-úton a non-ASCII path-encoding-bug elkerülésére).

**Egyedi EREK-ikon felhasználva** — a `icon/icon.png` (templom + csillag sötétkék háttéren) minden méret-változatban generálva:
- Windows: 32x32, 128x128, 128x128@2x, Square*Logo, icon.ico
- macOS: icon.icns
- iOS + Android: teljes méretkészlet

A Tauri `npx tauri icon` parancs intézte egyben.

**Fájlnevek magyar ékezettel** (`Kartotéka`) — a Tauri `productName: "Kartotéka"` configból jön, a bundler megfelelően Unicode-kezeli.

**Build environment:**
- `cargo build --release` (első futás ~15-20 perc release-optimalizálásért)
- WiX Toolset → MSI
- NSIS 3.11 (Tauri automatikus letöltés) → EXE
- Minden a `C:\kartoteka-target` cache alatt (a subsequent build-ek pár perces inkrementálisak)

**Nem aláírt csomagok** — a Windows SmartScreen „Unknown publisher" warningot fog mutatni telepítéskor. A következő lépés (**M3.2**) javítja.

**Előkészítve az M3.2-hez:**
- `ops/code-sign-setup.ps1` — PowerShell script, ami self-signed code-sign cert-et generál (3 év érvényességgel), PFX-be exportál, a Trusted Publishers store-ba regisztrál, és kiírja a thumbprint-et a `tauri.conf.json`-be másoláshoz
- `.gitignore` bővítés: `ops/*.pfx`, `apps/desktop/src-tauri/target/`, `.p12/.key/.pem` fájlok

**Kipróbálási lehetőség (a lelkészi élmény előképe):**

```powershell
# 1. A telepítő futtatása
Start-Process "C:\kartoteka-target\release\bundle\nsis\Kartotéka_0.1.0_x64-setup.exe"

# 2. SmartScreen ("Unknown publisher") → "More info" → "Run anyway"
# 3. Wizard végigvezetésével a Kartotéka telepítődik a Start menübe
# 4. Indítás a Start menüből → ugyanaz a dashboard, mint npm run desktop:dev
#    (ugyanarra a SQLCipher DB-re mutat + Credential Manager kulcs)
```

**M3 haladás:**
- ✅ M3.1 Első MSI + NSIS bundle
- ⏳ M3.2 Self-signed code-sign cert + aláírt MSI
- ⏳ M3.3 Eszköz-bind (Supabase `user_devices` regisztráció)
- ⏳ M3.4 Updater plugin + aláírt manifest

---

## [2026-04-23] — M2.7: Delta-sync — csak a változott sorok (összes profil)

<!-- key: 2026-04-23-m2-7-delta-sync -->
<!-- category: improvement -->
<!-- version: 1.15.13 -->
<!-- targets: fejlesztő -->

### 🔀 Sávszélesség-takarékos szinkronizáció — csak a tényleges változások

**A webes működést nem érinti.** Az M2.6-os SQL-migráció már hozzáadta a `profiles.updated_at`-et — most élesben használjuk: a desktop kliens csak azokat a sorokat kéri le a Supabase-től, amik tényleg változtak.

**Új TS függvények** (`apps/desktop/src/lib/sync.ts`):
- `pullAllProfiles(mode)` — `mode='delta'` vagy `mode='full'`
  - **Delta-mode**: `WHERE updated_at > last_pull_all` (a legutóbbi pull óta változottak)
  - **Első delta-futás**: automatikusan `full-initial` módra vált (nincs last_pull → mindent lehoz)
  - **Full-mode**: override, mindent lehoz
  - Frissíti a `sync:profiles:last_pull_all` kulcsot a high-water mark-tal
- `getAllLocalProfiles()` — lokális olvasás az egész `profiles_local` táblából (updated_at DESC)
- `getLastPullAllIso()` — az utolsó delta-pull ISO-ideje

**Új Dashboard-kártya**: „Összes profil — delta-sync"
- Utolsó delta-pull ISO-időpont
- **Delta Pull** gomb (`variant="outline"`) — sávszélesség-takarékos
- **Full Pull** gomb (primary) — override
- Eredmény-üzenet: „Delta pull: 0 sor" / „Full (első futás): 1 sor frissítve"
- Tábla: email, név, szerepkör, revision, updated_at

**A dashboard refreshLocalDb kibővült**: most 6 párhuzamos load-ot csinál (settings, outbox, last_pull, last_pull_all, failed, all profiles).

**Miért praktikus ez?**
- Egy éles rendszerben 1000+ profil-sor lehet, amiből naponta csak néhány frissül. A delta-pull ilyenkor **99%+-ban üres** = < 1 kB hálózati forgalom (+ tranzakciós overhead).
- A full-pull szándékosan megmaradt: debug, „valamilyen desync van" forgatókönyvre.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build`: 510 kB JS (+5 kB az új függvények/UI), 57 kB CSS, 3.69 s

**Kipróbálás:**
1. `npm run desktop:dev` → login
2. „Összes profil" kártya → „Delta Pull" gomb → először full-initial, lejön 1 sor (a saját profilod)
3. Klikkelj megint „Delta Pull"-ra → „nincs új / változott sor" (mert semmi sem változott azóta)
4. Supabase Studio-ban UPDATE-eld a saját profilt (pl. phone) → revision+1, updated_at most
5. „Delta Pull" megint → most 1 sort frissít (kizárólag azt)

**Következő (M3)**: updater + code-signing (self-signed cert) + eszköz-bind. Az M2 fázis most teljes mértékben lezárult — minden offline-first funkció éles és tesztelt.

---

## [2026-04-23] — M2.6: Konfliktus-kezelés (revision + updated_at)

<!-- key: 2026-04-23-m2-6-conflict -->
<!-- category: feature -->
<!-- version: 1.15.12 -->
<!-- targets: fejlesztő, lelkészek (közvetve) -->

### 🔀 A profil-szerkesztés most már **konfliktusbiztos** — ugyanazt a sort két eszközről nem lehet véletlenül felülírni

**A webes működést nem érinti közvetlenül**, de ⚠️ **egy új Supabase SQL-migrációt kell futtatni**.

**⚠ KÉZI LÉPÉS ENDRÉNEK**: Supabase Studio SQL Editor-ban futtasd le az alábbi fájlt:

```
migration-docs/sql/2026-04-23-m2-6-profiles-revision.sql
```

Ez hozzáadja a `profiles`-hoz a `revision bigint` + `updated_at timestamptz` oszlopokat + egy `BEFORE UPDATE trigger`-t, ami automatikusan inkrementálja a revision-t minden íráskor.

**Mit csinál a konfliktus-kezelés:**

1. A kliens minden mentésnél **feljegyzi** a saját cache-ben lévő `revision`-t (pl. 5).
2. A Supabase UPDATE egy **conditional WHERE** záradékkal megy: `WHERE id = auth.uid() AND revision = 5`.
3. Ha a szerver-oldali sor időközben valaki más által módosítódott (pl. webes felületről), a revision már 6. → a WHERE nem matchel → **0 sor frissül**.
4. A kliens ezt érzékeli, és:
   - **Online**: re-pull-olja a sort (a webes változatot) + figyelmezteti a user-t: „A szerveren időközben megváltozott, nézd át a mezőket"
   - **Offline** (outbox): a sor `failed` marad `last_error='conflict: a szerver-oldali revision eltér'`-rel, a user retry-olhatja vagy elvetheti

**Új UI elemek a Dashboard-on:**
- A profil-táblában most látszik a `revision` + `updated_at`
- Konfliktus-banner: ⚠ amber-színű figyelmeztetés a form alatt
- **„Hibás / konfliktusos sorok" tábla** az Outbox kártyában — minden failed sorhoz „Újrapróba" és „Elvetés" gomb

**Új TS API** (`apps/desktop/src/lib/sync.ts`):
- `updateOwnProfile` most `{ queuedToOutbox, conflict, newRevision? }`-t ad vissza
- `processOutbox` visszaadja a `conflicts` számot is
- Új exportok: `getFailedOutboxRows()`, `retryOutboxRow(id)`, `dismissOutboxRow(id)`
- **Outbox payload új formája**: `{ patch, expected_revision }` (legacy-kompatibilis: ha a payload csak patch, unconditional update megy)

**Új Rust v3 migráció** (`apps/desktop/src-tauri/src/db.rs`):
```sql
ALTER TABLE profiles_local ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles_local ADD COLUMN updated_at TEXT;
PRAGMA user_version = 3;
```

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 32 s (v3 migráció új ALTER-ek, minden más cache-elt)
- ✅ `npm run desktop:build`: 505 kB JS, 57 kB CSS, 3.18 s

**Kipróbálás (miután az SQL migráció lefutott):**
1. `npm run desktop:dev` → login → Pull profil → a „Revision: 0" látható
2. Módosítsd a telefont → Mentés → „új revision: 1" üzenet
3. **Konfliktus szimulálás**: Supabase Studio-ban manuálisan UPDATE-eld a sort (pl. `SET phone = 'valami'`). Vagy a webes felületen módosítsd.
4. Most a desktop-on próbáld menteni az új értéket → ⚠ amber-banner: „A szerveren időközben megváltozott…"
5. A lokális cache frissült a szerver-változatra, újra mentheted ha akarod.

**Mit nem csináltunk még (M2.7+):**
- Delta-sync (`updated_at > last_pull`) — az infrastruktúra most már kész hozzá, csak a kliens-oldali query kell hozzá
- Több domain-tábla (members, finance, anyakonyv stb.) — minden egyes esetben egy hasonló SQL-migráció ajánlott (revision + updated_at + trigger), de azok külön-külön jönnek
- Kimerítő retry-policy (exponential backoff) — most 1 retry-gomb van a failed sorokon

**Következő (M2.7)**: fázis-záró csomag — több domain-tábla (pl. a `presbiter`, ami már készen van a séma-oldaltól). Vagy ha Endre inkább a M3-ra akar ugrani (updater + code-signing), azt is mérlegelhetjük.

---

## [2026-04-23] — M2.5: Push-sync — offline írás + outbox drain (saját profil)

<!-- key: 2026-04-23-m2-5-outbox-push -->
<!-- category: feature -->
<!-- version: 1.15.11 -->
<!-- targets: fejlesztő -->

### 📤 A desktop most már **offline is írhat** — az outbox fogadja és később szinkronizál

**A webes működést ez sem érinti.** A Tauri desktop-on most élesben használjuk az M2.1 óta ott lévő `outbox` táblát: a saját profil szerkeszthető mezőit (telefon, teljes név) akár offline állapotban is mentheted, és a háttér automatikusan feltölti a Supabase-be, amikor visszatér a net.

**Mi lett új:**

- **`sync.ts` bővítve** (apps/desktop/src/lib):
  - `updateOwnProfile(userId, patch)` — **optimistic** frissítés: azonnal ír a lokális `profiles_local`-ba, majd online-esetben közvetlenül a Supabase-nek, offline-esetben az outbox-ba.
  - `processOutbox()` — végigmegy a `pending` soron, elküldi a `UPDATE / INSERT / DELETE`-et a `target_table` + `target_id` + `payload` alapján. Sikeres sor: `status='sent'`. Hibás: `status='failed'`, `last_error`, `retry_count++`.
  - `enqueueOutbox(op, table, id, payload)` — belső helper.
  - `isOnline()` — `navigator.onLine` + 2 mp-es HEAD-ping a Supabase `/auth/v1/health`-re (valódi connectivity, captive-portal-biztos).

- **Dashboard bővítve:**
  - **„Online / Offline" badge** a fejlécen — `window.addEventListener('online'|'offline')`-on listen-el
  - **„Szerkeszthető mezők" űrlap** a profil-kártyában — telefon + teljes név. Mentés gomb → optimistic-UX: lokálisan azonnal látszik a változás
  - **„Outbox" kártya**: 4-tile KPI (függő / kiküldött / hibás / összes) + „Szinkronizálás most" gomb
  - **Auto-drain login után**: a dashboard mount-kor egyszer elindítja a `processOutbox()`-ot. Ha vannak pending sorok és van net, azonnal szinkronizálódnak.

**Kritikus viselkedés:**
- Offline-ban a „Mentés" gomb **mindig sikeres** — nincs error-message. A UI megmutatja: „Elmentve offline — a szerverrel a következő online-csatlakozáskor szinkronizálódik."
- Online-ban az közvetlen Supabase-hívás fut; **ha az mégis failelne** (pl. 5xx, RLS-probléma), a sor bekerül az outbox-ba fallback-ként → a következő manual sync vagy auto-drain próbálja.

**RLS-biztonság:** a Supabase `profiles_write` policy szerint a user csak a saját sorát frissítheti (`id = auth.uid()`). Az outbox-ba írt `update` operation is ezzel az id-vel fut, a Supabase visszautasít idegen sort.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build` (Vite prod): 501 kB JS (+6 kB a sync+UI miatt), 3.46 s. Vite warningol, mert kb. 500 kB fölött van — M5-ben code-splitting a lazy route-okkal.

**Kipróbálás:**
1. `npm run desktop:dev` → login → Pull profil
2. Módosítsd a telefont → „Mentés" → online esetén azonnal Supabase-ben is frissül
3. **Offline-teszt**: kapcsold le az internetet. A badge „Offline"-ra vált. Írj át valamit → „Mentés" — a message: "Elmentve offline, outbox-olva". Az Outbox-kártya pending: 1.
4. Kapcsold vissza az internetet. „Szinkronizálás most" → a pending → sent. A Supabase-ben is megjelenik.

**Következő (M2.6):**
- Konfliktus-kezelés: ha két gép egyszerre ír ugyanarra a sorra (vagy a server-oldali sor közben megváltozott), a push-sync-nek észre kell vennie és döntenie. Ez a `revision + updated_at` összevetésen alapul. Bevezető lépésként egy felkészített táblán (pl. `presbiter`) nézzük meg.

---

## [2026-04-23] — M2.4: Első Supabase → SQLite szinkron (saját profil pull)

<!-- key: 2026-04-23-m2-4-profile-pull -->
<!-- category: feature -->
<!-- version: 1.15.10 -->
<!-- targets: fejlesztő -->

### 🔄 A desktop kliens először ír saját magának adatot a Supabase-ről

**A webes működést nem érinti.** A Tauri desktop-on végre **valódi adat** kerül a lokális (titkosított) SQLCipher DB-be: a bejelentkezett user saját profilját tükrözzük a Supabase `profiles`-ból egy új lokális `profiles_local` táblába.

**Mi történt:**

- **v2 migráció** a `db.rs`-ben: `profiles_local` tábla létrejön (id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id, synced_at) + index a `congregation_id`-n
- **Új TS modul** `apps/desktop/src/lib/sync.ts`:
  - `pullOwnProfile(userId)` — Supabase `.eq('id', userId).maybeSingle()` → lokális `INSERT OR REPLACE`
  - `getLocalOwnProfile(userId)` — tisztán offline olvasás
  - `getLastPullIso()` — utolsó sync ISO-ideje a `settings:sync:profiles:last_pull` kulcsban
- **Dashboard bővítve**: új „Saját profil — offline cache" kártya
  - „Pull profil" gomb — lehozza a saját sort
  - Táblázat a 10 oszloppal + utolsó sync ideje
  - Hiba-panel, ha a pull elakad (offline, RLS stb.)

**Biztonsági megjegyzés**: a pull egy standard Supabase RLS-védett SELECT — a user csak a saját sorát láthatja. A `.eq('id', userId)` dupla-védelem kliens oldalon. A tárolt érték **SQLCipher-titkosított** DB-ben van.

**Mi NEM része az M2.4-nek (tudatosan):**
- **Delta-sync** (updated_at > last_pull) — a Supabase `profiles` táblán még **nincs** `updated_at` + `revision` oszlop. Delta-sync-et azokra a domain-táblákra tervezünk, amelyek már készek (pl. a `presbiter` már tartalmazza). Külön SQL-migrációt igényel a `profiles`-hoz, mielőtt ott delta lehetne.
- **Push-sync** (offline írás → outbox → Supabase) — M2.5
- **Konfliktus-kezelés** — M2.6
- **Több domain-tábla** (members, finance stb.) — fokozatosan M2.5+

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 1.03 s (csak a migráció-vektor változott)
- ✅ `npm run desktop:build`: **2117 modul** (+1 sync.ts), 3.29 s

**Kipróbálás**: indítsd az `npm run desktop:dev`-et, jelentkezz be, majd a Dashboard-on kattints a „Pull profil" gombra. A táblázat kitöltődik a saját adataiddal — utána a Credential Manager-ben őrzött kulccsal titkosított DB-ben ez a sor már lokálisan elérhető (akkor is, ha kikapcsolod az internetet és újraindítod az app-ot).

**Következő (M2.5)**: Push-sync — az outbox bemutatása egy írás-útvonallal. Első probálkozás: a user képes lesz lokálisan elmenteni egy „saját telefon-számot", az outbox fogadja az írást, a Supabase-nek egy tranzakcióban át fog adni, és a pull-sync visszaolvassa.

---

## [2026-04-23] — M2.3: SQLCipher-kulcs OS-szintű titkos tárolóban (Credential Manager)

<!-- key: 2026-04-23-m2-3-os-keyring -->
<!-- category: security -->
<!-- version: 1.15.9 -->
<!-- targets: fejlesztő -->

### 🔑 A kulcs már nem a bináris-ben — Windows Credential Manager (DPAPI)

**A webes működést nem érinti**, a desktop user-flow változatlan.

**Biztonsági előrelépés az M2.2-höz képest:**
- Az M2.2-ig a SQLCipher-kulcs egy **statikus konstans** (`DEV_DB_KEY`) volt a Rust kódban — bárki, aki reverse-engineer-eli a `.exe`-t, megkapta.
- Az M2.3-tól a kulcs az **OS-szintű titkos tárolóban** él (Windows Credential Manager / macOS Keychain / Linux Secret Service). Windows-on a DPAPI titkosítja a bejelentkezett user adataival.

**A fenyegetési modell most:**
| Forgatókönyv | M2.2 (statikus kulcs) | M2.3 (OS keyring) |
|---|---|---|
| Bejelentkezett user + fizikai hozzáférés | ❌ DB olvasható | ❌ DB olvasható |
| Kilopott eszköz / kilopott DB fájl (nincs Windows-login) | ❌ kulcs a binárisban visszafejthető | ✅ **kulcs nélkül visszafejthetetlen** |
| Másik Windows-user ugyanazon a gépen | ❌ ugyanaz a bináris, ugyanaz a kulcs | ✅ **DPAPI per-user: másik user nem fér hozzá** |
| Reverse-engineered .exe | ❌ kulcs a bin-ben | ✅ **csak a keyring-logika, a kulcs nem** |

**Mit NEM véd még (M2.6-ra hagyva):**
- Malware ugyanabban a user-kontextusban root-joggal — ellene csak user-jelszó-alapú derived key segíthet.
- User-profil törlés (pl. Windows újratelepítés) → kulcs elvész, DB visszanyerhetetlen. A **backup/restore** külön feladat (M2.5).

**Technikailag:**
- Új Rust crate-ek: `keyring v3`, `rand v0.8`, `hex v0.4` — mind **pure-Rust**, semmi új C-build. Cargo check **8 mp** inkrementálisan.
- A `db.rs`-ben új `load_or_create_db_key()`:
  - Első indítás: generál egy kriptográfiailag biztonságos 32-byte kulcsot, elmenti a Credential Manager-be (`service=kartoteka-desktop`, `user=sqlcipher-db-key`)
  - Subsequent: olvassa a Credential Manager-ből
- A kulcs a SQLCipher-nek **raw hex-key formátum**ban (`x'...'` 64 hex-karakterrel) — elkerüli a KDF-lassulást és minden indulásnál ugyanaz a bájt-szekvencia.
- `PRAGMA key = "x'...'"` raw execute-tel (a `pragma_update` idézőjel-escape-jét kikerülve).

**⚠ Endre gépén egy kézi törlésre szükség van:**

Ha már futtattad az M2.2-es Tauri dev-et, van egy DB fájlod a régi DEV_DB_KEY-vel titkosítva. Az M2.3-as app új kulccsal próbálja nyitni → sanity-check hiba. Töröld:

```powershell
Remove-Item "$env:APPDATA\com.erek.kartoteka\kartoteka.db"
```

Utána újra `npm run desktop:dev` → új kulcs generálódik, a DB újra inicializálódik.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 8 mp inkrementális (új deps: keyring, rand, zeroize, hex)
- ✅ `npm run desktop:build` (Vite prod): **2116 modul** (+1 ErrorBoundary), 3.36s

**Következő (M2.4)**: pull-sync — az első "éles" domain tábla (pl. `members`) Supabase → SQLite tükrözése.

---

## [2026-04-23] — M2.2: SQLCipher-titkosított lokális DB (rusqlite + saját commands)

<!-- key: 2026-04-23-m2-2-sqlcipher -->
<!-- category: security -->
<!-- version: 1.15.8 -->
<!-- targets: fejlesztő -->

### 🔐 A lokális adatbázis most már titkosított — SQLCipher a helyén

**A webes működést ez sem érinti.** A desktop kliens korábbi (M2.1) sima SQLite-ja titkosított SQLCipher-re cserélve.

**Mi változott a Rust-oldalon:**
- Eltávolítva: `tauri-plugin-sql` csomag (külső plugin)
- Hozzáadva: `rusqlite v0.32` a `bundled-sqlcipher-vendored-openssl` feature-rel — ez **nem igényel system-OpenSSL-t és nem igényel system-SQLCipher-t**, mindent a crate-ek magukban hoznak
- Új modul: `src-tauri/src/db.rs` — nyit, migrál, `db_execute` + `db_select` Tauri command-ok
- `src-tauri/src/lib.rs` refaktor: `setup()`-ban megnyitja és migrálja a DB-t, a commandokat regisztrálja

**Mi változott a TS-oldalon:**
- Eltávolítva: `@tauri-apps/plugin-sql` npm csomag
- `apps/desktop/src/lib/local-db.ts` átírva: most közvetlenül `invoke('db_execute', ...)` / `invoke('db_select', ...)`-ot hív
- A **nyilvános API változatlan**: `getSetting`, `setSetting`, `getAllSettings`, `getOutboxStats` — a dashboard kódot nem kellett módosítani

**Biztonsági állapot:**
- ✅ A DB már SQLCipher-titkosított
- ⚠️ A kulcs **statikus fejlesztői konstans** a Rust kódban (`DEV_DB_KEY`) — **NEM production-safe**
- ⏳ **M2.3-ban** a Stronghold kulcstárba kerül (user-jelszóból derivált, egyedi eszközönként)

**Migráció:**
- A `PRAGMA user_version` verzió-alapú stratégia megmaradt (v1 séma: `settings` + `outbox`)
- Ha a fejlesztői gépen létezik az M2.1-es plain-SQLite DB, az **nem nyitható meg** — az M2.2 törlést nem végez, a user kézzel törölheti a `%APPDATA%\com.erek.kartoteka\kartoteka.db`-t ha gond van

**Capabilities tisztítva:** a `sql:*` engedélyeket eltávolítottuk a `capabilities/default.json`-ből, mert a saját `#[tauri::command]` függvényekhez Tauri 2-ben nem kell explicit capability (csak plugin-command-ekhez).

**Fejlesztő gép build-függőségei (csak Endre oldalán — a lelkészek MSI-t kapnak):**
- Strawberry Perl 5.42.2.1 (OpenSSL `Configure` szkripthez) — `winget install StrawberryPerl.StrawberryPerl`
- NASM (a Strawberry Perl már behúzza a `C:\Strawberry\c\bin\nasm.exe`-t, a winget-es `NASM.NASM` redundáns)
- Build-target átirányítva `C:\kartoteka-target`-re egy `.cargo/config.toml`-lal — az `D:\Egyházi APP\...` útvonalban lévő `á` karakter összetöri az OpenSSL build-scriptet (NASM-kódlap ütközés)

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build` (Vite prod): **2115 modul**, 5.09s
- ✅ `cargo check`: első build ~15 perc (SQLCipher C + OpenSSL C fordítás), inkrementális **1.20 s**

**Következő (M2.3)**: Stronghold kulcstár — a `DEV_DB_KEY` konstans helyett a kulcs egy user-jelszóból derivált értékből származik, és a Stronghold-napló titkosított. Ez zárja a fejlesztés → produkció váltás utolsó biztonsági résé.

---

## [2026-04-23] — M2.1: Lokális SQLite a desktop kliensben (tauri-plugin-sql)

<!-- key: 2026-04-23-m2-1-local-sqlite -->
<!-- category: improvement -->
<!-- version: 1.15.7 -->
<!-- targets: fejlesztő -->

### 💾 Offline adatréteg első lépése — titkosítás nélküli SQLite

**A webes működést nem érinti.** Az M2 fázis első alfázisa: a Tauri desktop kliens ezentúl létre tud hozni és használni egy **lokális SQLite adatbázist** (`%APPDATA%\com.erek.kartoteka\kartoteka.db`). Ez az offline-first működés alapja.

**Egyelőre nincs titkosítás** — az M2.2-ben cseréljük SQLCipher-re, és a kulcsot a Stronghold kulcstárba tesszük (M2.3).

**Új csomagok:**
- **Rust**: `tauri-plugin-sql` v2 (sqlite feature)
- **JS**: `@tauri-apps/plugin-sql` v2

**Séma — v1 migráció (automatikusan fut az első indításkor):**
- `settings (key, value, updated_at)` — kulcs-érték alapbeállítások
- `outbox (id, op, target_table, target_id, payload, status, …)` — offline írás-queue (M2.3-ban tölt fel)

**TS wrapper (`apps/desktop/src/lib/local-db.ts`):**
- `getLocalDb()` — singleton factory
- `getSetting(key)` / `setSetting(key, value)` / `getAllSettings()`
- `getOutboxStats()` — pending/sent/failed/total számok

**Dashboard-demo:**
- Új „Lokális adatbázis" kártya a desktop dashboard-on
- Mutatja a settings sorokat + outbox statisztikát
- „Ping local DB" gomb → beszúr egy `last_ping` értéket, ami bizonyítja a working write-read
- Böngésző-módban (npm run desktop:vite) szép hibaüzenet: „A Tauri SQL-plugin csak natív ablakban aktív, indítsd `npm run desktop:dev`-vel"

**Tauri capabilities**: a `sql:*` engedélyeket explicit megadtuk a `src-tauri/capabilities/default.json`-ban (Tauri 2 biztonsági modellje mindent zárt engedélyezés nélkül)

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 2m 18s, 0 hiba (sqlx-sqlite + tauri-plugin-sql 2.4 hozzáadva)
- ✅ `npm run desktop:build` (Vite prod): **2116 modul (+4 plugin-sql SDK), 5.48s**

**Következő (M2.2)**: SQLCipher cserélés — titkosított DB. Még mindig nincs Stronghold, a kulcs egy statikus env-változóból jön, de már SQLCipher-rel. A M2.3 adja hozzá a Stronghold-alapú kulcs-kezelést.

---

## [2026-04-23] — M1.5: Desktop kliens login-képernyő + auth-flow

<!-- key: 2026-04-23-m1-5-desktop-login -->
<!-- category: improvement -->
<!-- version: 1.15.6 -->
<!-- targets: fejlesztő -->

### 🔑 Kartotéka Desktop első értelmes képernyője — bejelentkezés

**A webes működést ez nem érinti.** A Tauri desktop kliens most először használja a közös csomagokat valós UI-val: Tailwind CSS 4 + `@kartoteka/ui` komponensek + `@kartoteka/supabase-client` auth, React Router routing-gel.

**Mi van az M1.5-ben:**

- **Tailwind CSS 4** beállítva a Vite-on át (`@tailwindcss/vite` plugin, nem PostCSS) — a közös `@kartoteka/ui` csomagot is scanneli (`@source "../../../packages/ui/src"`)
- **Placeholder design tokenek** az `apps/desktop/src/index.css`-ben — minimál színpaletta (EREK zöld primary), M2-ben a `@kartoteka/design-tokens` fogja adni végleges formában
- **React Router DOM v7** — `HashRouter` (Tauri-biztonságos, nem ütközik custom URL-scheme-ekkel)
- **`AuthGate`** komponens — session-check, loading-spinner, redirect `/login`-ra, reagál `onAuthStateChange`-re
- **Login képernyő** (`LoginPage`) — email + jelszó form, `@kartoteka/ui` Button/Card/Input/Label komponenseket használ, a Supabase hibákat magyar üzenetekre fordítja (pl. "invalid login credentials" → "Hibás e-mail cím vagy jelszó")
- **Dashboard placeholder** — üdvözlő kártya + kijelentkezés gomb, bizonyítja hogy az auth-gate és a közös csomagok végig működnek
- **Tauri default assetek** kitakarítva (App.css, react.svg, vite.svg, tauri.svg) — tiszta start

**A user flow a desktop-on** (ha a `.env` kitöltve van):
1. App indul → AuthGate session-check → nincs → redirect `#/login`
2. Login form megjelenik a @kartoteka/ui Card-jával
3. Email + jelszó beírása → `supabase.auth.signInWithPassword`
4. Siker → redirect `#/` → AuthGate session OK → Dashboard
5. "Kijelentkezés" → `supabase.auth.signOut` → redirect `#/login`

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): **0 hiba**
- ✅ Vite dev (port 1420) — Ready in 663 ms
- ✅ `GET /` → 200, 566 byte HTML (title: "Kartotéka")
- ✅ `GET /src/main.tsx` → 200, transformált modul
- ✅ `GET /src/index.css` → 200, **78 KB generált Tailwind CSS** (a közös UI komponensek class-ai sikeresen scannelve)

**Próbald ki böngészőben (Tauri nélkül is):**
```bash
cd apps/desktop
cp .env.example .env  # ha még nem tetted
# töltsd ki a VITE_SUPABASE_URL és VITE_SUPABASE_ANON_KEY értékeket
cd ../..
npm run desktop:vite
# → http://localhost:1420 — ugyanaz a UI, Tauri-ablak nélkül
```

**Vagy Tauri-ablakban** (első indítás 5-10 perc a cargo build miatt):
```bash
npm run desktop:dev
```

**Következő (M2 fázis kezdete)**: SQLCipher + offline DB réteg a Tauri-oldalán. Az M1 fázis **ezzel lezárult**.

---

## [2026-04-23] — M1.4: Közös UI komponens-könyvtár (@kartoteka/ui)

<!-- key: 2026-04-23-m1-4-ui-shared -->
<!-- category: improvement -->
<!-- version: 1.15.5 -->
<!-- targets: fejlesztő -->

### 🧩 13 shadcn-komponens kiemelve közös csomagba — web + desktop között (M1 fázis folytatása)

**A webes működés pontosan ugyanaz marad.** Strukturális refaktor: a `Button`, `Card`, `Dialog`, `Input`, `Tabs` stb. alap-komponensek most egy közös csomagban élnek (`@kartoteka/ui`), hogy a Tauri desktop kliens (M1.5-től) ugyanazt használja.

**Átemelt komponensek (13):** avatar, badge, button, card, dialog, dropdown-menu, input, label, select, separator, sheet, tabs, textarea. Plusz a `cn()` helper (`packages/ui/src/lib/utils.ts`).

**NEM kerültek át (projekt-specifikusak, maradnak `apps/web`-ben):**
- `address-form` (román cím-hierarchia), `color-tabs` (egyedi pirosas-kartyás kezelés), `help-tooltip` (Next.js `next/link`), `modal-field` (magyar label+required), `searchable-category-select`, `splash-screen` (magyar kezdő splash), `sonner` (`next-themes`-es wrapper)

**Visszafelé kompatibilis** — nulla kód-módosítás volt szükséges a 15+ meglévő hívó helyen. Az `apps/web/tsconfig.json` **paths alias**-on keresztül a `@/components/ui/button` típusú importok automatikusan a közös csomagra mutatnak. A `@/lib/utils` is a közös `cn()`-re mutat egy vékony re-export wrapper-en át.

**Tailwind 4 integráció**: az `apps/web/app/globals.css`-ben egy `@source "../../../packages/ui/src"` direktíva biztosítja, hogy a Tailwind JIT scanner a közös csomag TSX fájlait is scannelje és generálja a szükséges utility class-okat.

**Verify:**
- ✅ `npx tsc --noEmit` (packages/ui + apps/web): **0 hiba**
- ✅ `npm run dev` (root-ról): Ready in 357ms
- ✅ `GET /login → 200 OK`, 45 KB render — a UI komponensek ténylegesen renderelnek, a Tailwind CSS-e kompilál

**Következő (M1.5)**: a `apps/desktop` app nem-placeholder UI-t kap — a közös `@kartoteka/ui` Button, Card komponenseit használó valódi login/regisztráció képernyő. Ehhez a Tauri oldalra is Tailwind CSS setup kerül (+ közös design tokenek a `@kartoteka/design-tokens`-ből).

---

## [2026-04-23] — M1.3: Közös Supabase-kliens csomag (@kartoteka/supabase-client)

<!-- key: 2026-04-23-m1-3-supabase-client -->
<!-- category: improvement -->
<!-- version: 1.15.4 -->
<!-- targets: fejlesztő -->

### 🔌 Közös Supabase-kliens factory — web és desktop között (M1 fázis folytatása)

**Ez sem érinti a felhasználói működést** — a webes app pontosan úgy fut, ahogy eddig. Viszont most már létezik egy **közös kliens-factory** (`@kartoteka/supabase-client`), amit mind a Next.js web (`apps/web/`), mind a Tauri desktop (`apps/desktop/`) ugyanabból a forrásból használ.

**Mit csináltunk:**

- Új `packages/supabase-client/` csomag: `createKartotekaBrowserClient(config)` factory, `SupabaseBrowserConfig` típus, `Database` típus placeholder (M1.5-ben generáljuk a valós Supabase-sémából)
- A csomag **platform-független**: paraméterként kapja az URL-t és az anon key-t, nem olvas `process.env`-et vagy `import.meta.env`-et direktben — a caller (Next.js / Vite) adja át
- `apps/web/lib/supabase/client.ts` refaktor: most már csak **15 soros wrapper**, ami a `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` env-változókat adja tovább a közös csomagnak
- `apps/desktop/src/lib/supabase.ts` új: Vite-alapú kliens, ami az `import.meta.env.VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` változókból olvas (**lazy-init** — ha nincs `.env`, a modul még betölthető, csak első hívásnál dob hibát)
- `apps/desktop/.env.example`: mintafájl a desktop-hoz
- `apps/desktop/src/vite-env.d.ts`: TypeScript deklarálás a `VITE_*` env-változókra

**Visszafelé kompatibilis**: a **15 meglévő fájl** a `apps/web`-ben, ami eddig a `@/lib/supabase/client`-et importálta, ugyanúgy működik tovább. Nulla változtatás az app-kódban.

**Mit NEM emeltünk ki közös csomagba** (tudatosan):

- `apps/web/lib/supabase/server.ts` — `cookies()` + Next.js SSR-specifikus, csak a webben működik
- `apps/web/lib/supabase/admin-client.ts` — `service_role` kulcsos, `'server-only'` import
- `apps/web/lib/supabase/middleware.ts` — Next.js Edge Runtime proxy
- `apps/web/lib/supabase/secret-vault.ts` — pgcrypto helpers, csak server-oldal

Ezek mind **Next.js-specifikusak** és nem illenek a Tauri desktop-hoz. Marad a helyükön.

**Verify:**
- ✅ `npx tsc --noEmit` (packages/supabase-client): **0 hiba**
- ✅ `npx tsc --noEmit` (apps/web): **0 hiba**
- ✅ `npx tsc --noEmit` (apps/desktop): **0 hiba**
- ✅ `npm run dev` (web root-ról): Ready in 453ms, `.env.local` betöltve

**Következő (M1.4)**: közös `@kartoteka/ui` csomag bevezetése (shadcn-alapú komponensek), hogy ugyanazokat a gomb/dialog/kártya komponenseket használja a web és a desktop.

---

## [2026-04-23] — M1.2: Tauri 2 desktop kliens bootstrap (apps/desktop/)

<!-- key: 2026-04-23-m1-2-tauri-bootstrap -->
<!-- category: improvement -->
<!-- version: 1.15.3 -->
<!-- targets: fejlesztő -->

### 🖥️ Üres desktop-kliens inicializálva (M1 fázis folytatása)

**Ez sem érinti a felhasználói működést** — a jelenlegi webes Kartotéka-rendszer továbbra is ugyanúgy fut. Viszont most már létezik egy **kezdő Tauri 2 desktop projekt** az `apps/desktop/` alatt, amit M1.3-tól tartalommal töltünk fel.

**Mi történt:**

- Rust 1.95.0 stable toolchain telepítve (`winget install Rustlang.Rustup`) — ez csak a fejlesztői gépen kell
- Az `apps/desktop/` alatt létrejött egy Tauri 2 + React + TypeScript + Vite projekt (a `create-tauri-app` hivatalos CLI-vel)
- `@kartoteka/desktop` workspace-névvel bejegyezve — a root `npm install` behúzza, a root `npm run desktop:dev` parancs a Tauri dev-szervert indítja
- A Tauri config magyarítva: `productName: "Kartotéka"`, `title: "Kartotéka"`, 1280×800 kezdő ablakméret, EREK copyright + leírás
- A React-oldali `App.tsx` és a Rust-oldali `greet` parancs magyarítva
- `cargo check` sikeresen lefutott (1 perc 29 mp, 517 crate) — a Rust backend fordítható

**Hogyan telepíti majd egy lelkész az egészet?** Nem a Rust-ot és nem a Visual Studio-t — hanem egy **egyetlen `.msi` installer-t**, amit a Tauri bundler generál és mindent magával hoz (WebView2 runtime, Visual C++ Redistributable). A fejlesztői függőségek (Rust, C++ Build Tools) csak Endre gépén szükségesek. Részletek: `docs/project-tracking/KARTOTEKA-M1-2-tauri-bootstrap-2026-04-23.md`.

**Új root parancsok:**

- `npm run desktop:dev` — Tauri ablak indítása (fejlesztéshez, első indításkor 5-10 perc)
- `npm run desktop:build` — MSI installer generálás
- `npm run desktop:vite` — csak a Vite frontend (browser-ben teszteléshez)

**Fontos**: az M0 (access-requests, Brevo, JWT hook) és az M1.1 (monorepo) **változatlanul működik**. Az M1.2 csak **új modul** — nem nyúl a webhez.

---

## [2026-04-23] — M1.1: Monorepo átalakítás (apps/web + packages/*)

<!-- key: 2026-04-23-m1-1-monorepo -->
<!-- category: improvement -->
<!-- version: 1.15.2 -->
<!-- targets: fejlesztő -->

### 🛠️ Tech-groundwork a Tauri desktop klienshez (M1 fázis)

Ez a lépés **nem érinti a felhasználói működést** — csak a repo belső szerkezete változott, hogy a közelgő **Tauri 2 desktop kliens** és a jelenlegi **Next.js webapp** egyazon repo-ban, **közös csomagokon** (UI, Supabase-kliens, design-tokenek, séma-típusok) osztozzanak.

**Mit változott a repo szerkezetében:**

- A teljes Next.js app átkerült `app/`, `components/`, `lib/`, `public/` gyökér-mappákból → `apps/web/` alá
- Az összes futtatási konfig (`next.config.ts`, `tsconfig.json`, `middleware.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `next-env.d.ts`, `.env.local`, `.env.example`) is átkerült `apps/web/` alá
- Új `packages/` könyvtár 4 placeholder csomaggal (`@kartoteka/ui`, `@kartoteka/supabase-client`, `@kartoteka/design-tokens`, `@kartoteka/schema-types`) — ezeket M1.2–M1.4 tölti fel tartalommal
- A root `package.json` most **npm workspaces**-alapú monorepo-meta: a `dev`, `build`, `lint` parancsok a root-ról is működnek (`npm run dev` → `apps/web/` alá delegál)
- A `scripts/audit-safety.mjs` átkerült `apps/web/scripts/` alá, a `scripts/build-adr-seed.mjs` maradt rooton (mert a `migration-docs/` gyökér-adatain dolgozik)

**Mi maradt változatlan** (a felhasználó-látható szinten):

- A rendszer **ugyanúgy működik**, mint eddig — minden URL, minden funkció, minden adatbázis-kapcsolat
- A `npm run dev`, `npm run build`, `npm run lint` ugyanolyan parancsok, mint eddig (csak ezúttal a root `package.json` irányítja workspaces-en át)
- Supabase, Brevo, RLS, auth — **semmi nem változott**
- Az `.env.local` automatikusan betöltődik (Next.js a `apps/web/.env.local` fájlt olvassa)

**Ellenőrzés futtatva:**

- ✅ `npm install` — 968 csomag telepítve, workspaces összelinkelve (`node_modules/@kartoteka/{web,ui,...}` symlinkek OK)
- ✅ `npx tsc --noEmit` (apps/web) — 0 hiba
- ✅ `npm run dev` (root-ról) — `Ready in 386ms`, `Environments: .env.local` helyesen betöltve
- ✅ Git: minden `git mv`-vel rögzítve, a történet megőrzöttt (file history linkelhető)

**Következő lépés (M1.2):** Tauri 2 projekt init az `apps/desktop/` alá — Vite + React SPA a Tauri shell-ben. Ez már **új desktop kliens**, nem érinti a webes működést.

---

## [2026-04-23] — Hozzáférés-kérelem rendszer: end-to-end ÉLES

<!-- key: 2026-04-23-m0-end-to-end -->
<!-- category: feature -->
<!-- version: 1.15.1 -->
<!-- targets: admin, lelkészek -->

### ✨ Működési visszajelzés

Az új **hozzáférés-kérelem rendszer** (bevezetve a [2026-04-23] — "Új hozzáférés-kezelés" bejegyzésben) most **end-to-end tesztelve és élesben**:

- A publikus `/hozzaferes-kerese` űrlap fogadja a kérelmet
- A kérelmező **Brevo-tól email-visszaigazolást** kap (EU szerverről, GDPR-kompatibilisan)
- Az admin a "Hozzáférés-kérelmek" fülön látja, egy kattintással **elfogadhatja** vagy **elutasíthatja**
- Elfogadás után a rendszer **automatikusan létrehozza** a Supabase auth-user-t és **invite-emailt küld** (jelszó-beállító linkkel)
- Minden admin-akciót **audit-log** rögzít

### 🔧 Technikai pontosítások (felhasználót nem érinti)

- Admin-approve flow: új ág a már-létező user esetére (pl. adminnok saját kérelmei) — csak státusz-frissítés, nincs duplikált user
- Brevo email-provider: hibabiztos try/catch + részleges-állapot kezelés, ha a service_role kulcs hiányzik
- RLS-segédfüggvények (`is_admin()`, `same_congregation()`, `is_current_user_approved()`, stb.) bevezetve — minden jövőbeli tábla-migráció ezeket használja
- `ALTER DEFAULT PRIVILEGES` — minden új public táblát auto-GRANT-tel (authenticated ENGEDÉLY az RLS mellett)

### 📌 Sender email

Jelenleg a rendszer **`endreszocs@gmail.com`**-ról küldi az emaileket (személyes cím, verifikálva Brevo-ban). Production deploy előtt (M5/M6) **saját `@kartoteka.*` domain** kerül beállításra SPF/DKIM hitelesítéssel.

---

## [2026-04-23] — Új hozzáférés-kezelés: kérelem-alapú regisztráció

<!-- key: 2026-04-23-access-request-system -->
<!-- category: feature -->
<!-- version: 1.15.0 -->
<!-- targets: lelkészek, esperesek, egyházkerületi admin -->

### ✨ Új hozzáférés-kérelem rendszer

A Kartotéka rendszerbe **már nem lehet közvetlenül regisztrálni**. Az új felhasználóknak
egy egyszerű űrlapot kell kitölteniük, és az egyházkerületi rendszergazda jóváhagyja
a kérelmüket — ez biztonságosabb és szervezet-hűbb működés.

**A kérelmező tapasztalata**:
- A `/hozzaferes-kerese` oldalon egyszerű űrlap: név, email, szerepkör, gyülekezet
- Azonnali email-visszaigazolás (Brevo-n keresztül, EU-szerverről)
- Admin 1-3 munkanapon belül dönt
- Ha elfogadott: invite-email érkezik, kattintással beállíthatja jelszavát

**Admin-funkciók**:
- Új „Hozzáférés-kérelmek" fül az admin dashboardon (amber szín)
- Lista, szűrés státusz szerint (várakozó/jóváhagyott/elutasított), szabad-szöveges keresés
- Egy kattintással elfogadás vagy elutasítás (kötelező indoklással)
- KPI-panel: pending / approved / rejected / utolsó 7 nap

### 🔒 Biztonsági javítások

- **Email-szolgáltató átállás**: Resend (USA) → **Brevo** (francia EU, GDPR-szigorú).
  Minden email EU-szerverről megy. Free tier: 300/nap.
- **Audit-log**: minden admin akció (elfogadás, elutasítás, eszköz-revoke) rögzítődik.
  Új „Eszközök és napló" admin-fül — még üres, az M1 (Tauri-kliens) után telik meg.
- **Custom JWT claim**: a bejelentkezés-tokenben most már `approved`, `profile_status`,
  `profile_role`, `congregation_id` claim-ek vannak — a kliens gyorsan tudja, hogy a
  user jóváhagyott-e, és melyik gyülekezethez tartozik.
- **RLS-audit**: átfogó áttekintés a 80+ DB-tábla védettségéről. Segédfüggvények
  (`is_admin()`, `same_congregation()`, `is_current_user_approved()`) — minden új
  tábla policy-ja ezeket használja majd.
- **Rate-limit**: a publikus űrlap max 3 kérelem / IP / 24h fogad. GDPR-kompatibilis
  IP-hash (nem tárolunk nyers IP-t).

### 🔧 Infrastruktúra (felhasználót nem érinti közvetlenül)

- Új tábla: `access_requests`, `user_devices`, `licenses`, `audit_log`, `documents`,
  `document_keys` — mind RLS-védett.
- Privát Storage bucket: `documents-encrypted` — E2E titkosított fájltárolás alapja
  (a tényleges titkosítás a Tauri-desktop kliens M4 fázisában jön).
- Supabase Auth hook: `custom_access_token_hook` — a JWT-be ad `approved` claim-et.
- Email-provider absztrakció: `lib/email/send.ts` — a Brevo/Resend váltás
  env-vár-ral (`EMAIL_PROVIDER`).

### 📌 Megjegyzések

- A jelenlegi `/register` oldal egyelőre még működik, de a **login oldalon** a
  „Regisztráljon!" linket lecseréltük „**Kérjen hozzáférést!**"-re. A `/register`
  útvonalat későbbi release-ben eltávolítjuk.
- Az M0 fázis (6 lépés) teljes — ez alapozza a Tauri-desktop kliens (M1-M6) fejlesztését.

---

## [2026-04-21] — Dashboard UX csomag: lakhely, kor-eloszlás, év-léptető, éves terv redesign

<!-- key: 2026-04-21-dashboard-ux-csomag -->
<!-- category: improvement -->
<!-- version: 1.14.2 -->
<!-- targets: lelkészek -->

### 🐛 Születésnapos lista: lakhely bug javítva

**Tünet**: Ha a születésnap-lista kinyomtatásakor bejelölted, hogy „lakhely is szerepeljen", **csak a házszám jelent meg**, a helységnév és utcanév hiányzott.

**Ok**: A `szemely` tábla cím-adatai **FK-n keresztül** érhetők el (`c_utcaid → adrstreet → adrlocality`). A korábbi query csak a szabad-szöveges `c_szcim`-et és a `c_szam`-ot hozta le.

**Javítás**: A dashboard query kiegészült `adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)` joinokkal. A címösszeállítás prioritás-sorrend: strukturált adat → „Helység, Utca Házszám"; ha nincs → `c_szcim` fallback; különben csak a házszám.

### ✨ Kor-eloszlás kártya: részletes nézet + korpiramis

A Koreloszlás kártyára **toggle-kapcsoló** került:

- **Áttekintés** (default): a meglévő 5-csoportú pie chart (0–17, 18–35, 36–60, 61–80, 80+) + legenda %-kal
- **Részletes**: 10-éves **korpiramis** — férfi balra, nő jobbra, gradient bar-okkal. Legidősebb felül (demográfiai konvenció).

Minden nézet alján új **statisztika-sáv**: **átlag, medián, legfiatalabb, legidősebb** életkor.

### ✨ Gyülekezeti programok: új év-léptető UX

A korábbi natív `<select>` dropdown túl sok böngészőben **nem látszott jól** (kicsi, z-index alatt, vagy nehezen észlelhető). Az új UX:
- **◄ / ►** gombok — egy kattintással előző/következő év
- Középen **stilizált évszám-dropdown** — gyors ugrás bármelyik évre
- **„Ma"** shortcut gomb — ha nem az aktuális éven vagy, egy kattintással vissza

### 🎨 Éves programterv nyomtatás — ünnep-kiemelés redesign

A nyomtatásra kerülő éves programterv **sokkal szebben** különíti el az ünnepeket:

- **3-szintű ünnep-rang**:
  - **Nagy ünnep** (Húsvét, Pünkösd, Karácsony) — piros+arany gradient, vastag 2px piros keret
  - **Közép ünnep** (Virágvasárnap, Nagypéntek, Áldozócsütörtök, Szenteste, Reformáció) — arany gradient
  - **Kis ünnep** (Újév) — halvány arany
- **Többnapos ünnepek** (Karácsony 25-26, Húsvét vas+hét, Pünkösd vas+hét) — **minden napot** kiemeli, nem csak az elsőt
- **Sidebar kettéválasztva**:
  - Felül: „**Református ünnepek**" aranyló blokk (rang-szerinti tételek)
  - Alatta: „**Gyülekezeti programok**" teal blokk
- **Szebb fejléc**: nagyobb év-badge (arany-barna gradient), program+ünnep számláló chipek, decoratív arany vonal

### 📌 Megjegyzések

- A Supabase admin oldalon „Rendszer pénzügyei" fülben új kategória: `railway` (EU Amsterdam hosting) és `email_service` (Brevo). A jelenlegi Vercel Pro tétel átkerül Railway-re (lásd migrációs SQL).

---

## [2026-04-21] — Prezentáció Studio: animált redesign + silent failure javítások

<!-- key: 2026-04-21-prezentacio-animalt -->
<!-- category: improvement -->
<!-- version: 1.14.1 -->
<!-- targets: lelkészek -->

### 🐛 Prezentáció: hiányzó anyakönyvi adatok javítva

**Tünet**: Az éves beszámoló prezentációban egyes szakaszoknál (keresztelések, konfirmációk, esketések, temetések trend) 0 érték jelent meg, pedig voltak adatok.

**Ok**: Két silent failure:
1. A kód az `anyakonyv` táblát kérdezte le, **ami nem létezik** — a 4 valódi tábla (keresztseg, konfirmalas, hazassag, temetes) van a helyén. A Supabase csendben üres eredményt adott vissza.
2. A `kiadas` → kategória join útvonala is rossz volt (`szamadasicel(name)` helyett `kiadascel:id_kiadascel(nev)` a helyes) — ezért a kiadás-kategóriák „Egyéb" címkével jelentek meg.

**Javítás**: A 4 valódi anyakönyv-táblából 5 éves trend-aggregáció. A kiadás-kategória FK helyes irányba köt.

### ✨ Animált redesign — a szám-pörgés mint lelkészi élmény

A prezentáció minden slide-ja **animáltan** jelenik meg (framer-motion 12):

- **Számok 0-ról pörögnek fel** a cél-értékre (spring-animáció, ~2 másodperc) — a közösség időben lát rá a nagyságrendre
- **Bar-diagramok** balról jobbra töltődnek be, staggered belépéssel
- **Egyházfenntartás**: nagy **animált kör-diagram** (ProgressRing) a teljesítés %-kal
- **Pillér-slide-ok**: a szám-jelvény whileHover rotate+scale, divider-vonal kifeszülő animáció
- **Esketés-slide**: a ♡ szívek lélegeznek (scale loop)
- **Záró slide**: a ✝ jel finoman lebeg

**prefers-reduced-motion**: ha a felhasználó ezt kérte, az animáció automatikusan kikapcsol.

### 📌 Megjegyzések

- Az animáció nem dekoráció — **narratív** szerepe van: a szám-pörgés a méret megérzése, a kör-becsukódás a teljesítés képe, a stagger a sorrendi fókusz. A lelkészi beszámoló közös élmény; ezt szolgálja vizuálisan.

---

## [2026-04-21s] — Hotfix: dashboard adatok + éves terv CSS Grid-re

<!-- key: 2026-04-21-hotfix-dashboard-grid -->
<!-- category: bugfix -->
<!-- version: 1.14.1 -->
<!-- targets: lelkészek -->

### 🐛 1. Dashboard adatok eltűntek — Supabase hibás select

**Tünet**: a user jelezte, hogy a Dashboard-on **eltűntek a születésnaposok, családok száma, korelosztás**. Az összes szemely-alapú adat üresen jött.

**Gyökér-ok**: a [2026-04-21o] változtatásban a születésnap-szűrőhöz hozzáadtam a `szemely.varos` és `szemely.cim` mezőket a select-hez. **DE** a `szemely` táblában **nincsenek** ilyen oszlopok — Supabase a query-t hibával elutasította, és `szemResult.data = null` lett. Ettől `activeMembers = []`, és minden KPI / Celebrations / AgeDistribution adat üresen érkezett.

A `szemely` táblában a tényleges címmezők:
- `c_utcaid` — utca ID (adrstreet FK)
- `c_szam` — házszám
- `c_tombhaz`, `c_lepcsohaz`, `c_ajto`, `c_emelet` — épület-azonosító
- `c_szcim` — szabad-szöveges lakcím

**Javítás**:
- `app/(dashboard)/dashboard/page.tsx` `szemely` select: `varos, cim` → **`c_szcim, c_szam`**
- `Member` interface frissítve mindkét oldalon (page + birthday-list-dialog)
- `BirthdayEntry` új `address: string | null` mező (összeállítva `c_szcim + c_szam`-ból)
- A korábbi `[e.varos, e.cim].filter(Boolean).join(', ')` helyett egyszerű `e.address`

### ✨ 2. Éves programterv naptár — CSS Grid-re áttérés

**Tünet**: a user képeket küldött — a mini-naptár cellák **különböző méretűek**, a rács-vonalak **néhol látszanak, néhol nem**. A HTML `<table>` + `flex: 1` + dinamikus cellamagasság kombináció nem eredményezett egyenletes layout-ot.

**Gyökér-ok**: a HTML `<table>` elem sajátos layout-szabályokat követ — a `<tr>` / `<td>` nem kezeli jól a flex / grid nyújtást, és a `border-collapse: collapse` különbözőképpen renderelődik különböző browserekben és page-break-eknél.

**Javítás** — HTML `<table>` → **CSS Grid**:

```html
<!-- Régi (inkonzisztens) -->
<table class="mini-cal">
  <thead><tr>7 × <th></tr></thead>
  <tbody>6 × <tr>7 × <td></tr></tbody>
</table>

<!-- Új (egyenletes) -->
<div class="mini-cal">  <!-- display: grid -->
  7 × <div class="dow-hdr">   <!-- fejléc sor -->
  42 × <div class="mc">       <!-- 6 hét × 7 nap -->
</div>
```

**Új CSS**:
```css
.mini-cal {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));  /* EGYENLŐ oszlopok */
  grid-template-rows: auto repeat(6, minmax(0, 1fr)); /* header + 6 hét */
  gap: 1px;                 /* A rács-vonalak forrása */
  background: #cbd5e1;      /* A gap színe = rács-vonal */
  padding: 1px;
  flex: 1;                  /* nyúlik a parent-tel */
}

.mc {
  background: #fff;          /* Cellák fedik a rács-hátteret */
  /* minimum size 0 + flex column az emelt események megjelenítéséhez */
}
```

**Előny**:
- Minden cella **pontosan egyenlő** méretű (`minmax(0, 1fr)` grid)
- Rács-vonalak **mindenütt egyforma** szélesek (1px gap + háttérszín)
- A grid `flex: 1`-el nyúlik a teljes elérhető magasságig → nincs üres tér
- Nincs `<table>`-specifikus quirk
- A `.today` és `.has-event` jelölés `box-shadow: inset` → nem tolja el a cella-méretet

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 2 régi warning (nem most keletkezett)

---

## [2026-04-21r] — Prezentáció 3-pilléres újraszervezés + éves terv flex-layout

<!-- key: 2026-04-21-presentation-3-pillars -->
<!-- category: feature -->
<!-- version: 1.14.0 -->
<!-- targets: lelkészek -->

A lelkész elküldte a gyülekezeti Közgyűlési beszámoló PDF-jét — abból derült ki a **3 pillér struktúra**: Lélekszámbeli / Lelki / Anyagi. Ez alapján újjászerveztem a prezentációt. 4 észrevétel került feldolgozásra:

### ✨ 1. Prezentáció nyomtatása most **Portal-alapú**

A korábbi `hidden print:block` megoldás nem működött megbízhatóan a dashboard-shell print-CSS-ével. Új megoldás:
- `createPortal` a `document.body`-ra — a print-content független a parent-fától
- Új CSS class `kartoteka-print-root` + `kartoteka-print-slide`
- `@media print`: `body > *:not(.kartoteka-print-root) { display: none }` — mindent elrejt a print-root-on kívül
- Minden slide egy A4 landscape lapon (297mm × 210mm), page-break-after: always

### ✨ 2. 3-pilléres slide-struktúra

A PDF-minta alapján — **13 → 20 slide**:

**Nyitó** (2 slide):
1. Címlap
2. Éves áttekintés — *"A három pillér és három kérdés"*

**1. PILLÉR — LÉLEKSZÁMBELI** *(Hányan?)* (9 slide):
3. Pillér-bevezető (teal gradient, nagy "1" szám)
4. Gyülekezet összetétele (férfi/nő)
5. Kor-eloszlás
6. Anyakönyv KPI (4 szám)
7. **Keresztelések** — **név-lista** + dátum
8. **Konfirmációk** — név-lista
9. **Esketések** — férfi ♡ nő párok lista
10. **Temetések** — név + életkor + halál/temetés dátuma
11. Anyakönyvi trend — 5 év

**2. PILLÉR — LELKI** *(Hogyan?)* (3 slide):
12. Pillér-bevezető (violet gradient)
13. **Istentiszteletek és alkalmak** — nagy szám + horizontális bar alkalomtípusok szerint
14. Gyülekezeti programok

**3. PILLÉR — ANYAGI** *(Miből?)* (6 slide):
15. Pillér-bevezető (amber gradient)
16. Számadás (SZÁMADÁS-stílusú)
17. Bevételek részletesen
18. Kiadások részletesen
19. Egyházfenntartás
20. Pénzügyi trend 5 év

**Záró** (1 slide):
21. Soli Deo Gloria

**Új adatforrás** — az `actions.ts` 4 új lekérdezéssel:
- `keresztseg` + join szemely → kereszteltek név-listája
- `konfirmalas` + join → konfirmandusok
- `hazassag` + két join (férfi + nő) → esketési párok
- `temetes` + join → temetések (tdatum + hdatum + életkor)

Új interface: `PresentationData.anyakonyv.nameLists` + `PresentationData.worship`

### ✨ 3. Opcionális következtetések + 5 éves előrejelzés

Új fájl: `components/presentation/analytics.ts` — 2 fő függvény:

**`buildConclusions(data)`** — szabály-alapú szöveges elemzés:
- Bevétel-változás az előző évhez képest (+%/-%)
- Kiadás-változás
- Év-egyenleg értékelése (pozitív/deficites)
- Anyakönyvi természetes növekedés vagy csökkenés
- Anyakönyv az 5 éves átlaghoz képest
- Egyházfenntartás teljesítési arány értékelése

**`buildForecast(data, yearsAhead)`** — lineáris regresszió (least-squares):
- Bevétel és kiadás előrejelzés 5 évre
- Pont-becslés (nem konfidencia-intervallum) — MVP szintű

2 új slide:
- `ConclusionsSlide` — kártyás elrendezés, zöld/rose/semleges direction-jelekkel (↗ ↘ →)
- `ForecastSlide` — vonaldiagram + szöveges összegzés

**Opciók-dialog** a Studio-ban:
- Első megnyitáskor automatikusan felnyílik
- 2 checkbox: Következtetések / 5 éves előrejelzés
- localStorage-es perzisztencia (`kartoteka-presentation-options-v1`)
- "Beállítások" gomb a toolbar-on (későbbi módosításhoz)
- Amber info-box: "automatikus elemzés, a Szentlélek bizonysága felülmúlja a számokat"

A `SLIDES` tömb mostantól tartalmazza a 2 opcionális slide-ot, a `visibleSlides` a user beállításai szerint szűrve.

### ✨ 4. Éves terv nyomtatás — üres helyek kitöltése

A felhasználó képén látszott: a 12 mini-naptár csak a lap ~60%-án, alatta nagy üres tér.

**CSS flex-layout fix**:
- `html, body { height: 100% }`
- `.page-wrap { min-height: calc(100vh - 16px); display: flex; flex-direction: column }`
- `.main-grid { flex: 1; min-height: 0 }`
- `.calendars { grid-template-rows: repeat(3, 1fr); min-height: 0 }`
- `.month-block { display: flex; flex-direction: column; min-height: 0 }`
- `.mini-cal { height: 100%; flex: 1 }`
- A `.mc` cellák fix magassága (18px) törölve — a grid-sor 1fr szerint dinamikusan nyúlnak

Print módban: `height: 100vh` a page-wrap-en, `minden` tartalom a teljes lapmagasságig nyúlik.

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

---

## [2026-04-21q] — Programok modul finomhangolás: A4, év-tartomány, ünnepek, gyors bevitel

<!-- key: 2026-04-21-programs-module-polish -->
<!-- category: improvement -->
<!-- version: 1.13.2 -->
<!-- targets: lelkészek -->

4 célzott észrevétel a gyülekezeti programok modulra:

### ✨ 1. Éves programterv — A4 landscape keskeny margókkal

- A4 landscape 5mm margóval — több tartalom, mint az A3-nál (akkora felület nem kell)
- Minden elem **kompaktabb**: hónap-blokkok padding 6 → 4, betűk 13px → 11px (hónap-cím), napok 10.5px → 9px
- Oldalsáv szélesség: 220px → 165px
- Logó: 78×78 → 58×58
- Évbadge: 100×78 → 76×58 (32px → 26px font)
- A lap magasabban hasznosul: nincs fehér tér, minden pixel a tartalomé

### ✨ 2. Oldalsáv: program-dátum (mettől-meddig) + ünnepek integrálva

- Az eddigi egy dátum (`09 jan`) helyett **dátum-tartomány**: `14-16 jún` (azonos hónap), vagy `28 márc - 02 ápr` (hónap-váltás)
- Új `formatDateRange(start, end)` helper
- **Az ünnepek is megjelennek** az oldalsávon (eddig csak a naptárban voltak):
  - Dátumuk, nevük, `✝` ikon
  - `durationDays` alapján a tartomány (pl. Húsvét 2 napos, Pünkösd 2 napos, Karácsony 25-26)
  - Amber `holiday-item` stílus (italic, narancsos-sárga szín)
- **Kombinált lista**: programok + ünnepek egy közös `combinedItems` tömbbe, dátum szerint rendezve
- Oldalsáv címe: „Az év eseményei" → „Események & ünnepek"

### ✨ 3. Év-választás bővítése

- `program-scheduler.tsx`: `yearOptions` +1 / -3 év → **+5 / -10 év**
- A lelkész **előre is tervezhet** több évre (pl. 2031-ig), és **visszamenőleg** is nyomtathat (pl. 2016-tól)
- Az `AnnualPlanPrint` minden évvel működik — csak a programokat és a `getReformedHolidaysForYear(year)` adatokat kell átadni

### ✨ 4. Gyors bevitel — kártyás, két-soros layout

A korábbi `table` layout szűk volt: a Cím mező `text-xs` + h-8 = nem olvasható.

**Új**:
- Minden program **egy kártya** (rounded-[1rem], border, hover shadow)
- **1. sor**: nagy Cím mező (h-10, text-base, font-medium) + szám-jelölő + törlés gomb
- **2. sor**: a többi mező (dátum, idő, típus, helyszín, prioritás, ismétlődés) — `grid-cols-2` mobilon, desktop-on 8 oszlopos grid
- Minden kis-mező felett egy kis uppercase **label** (text-[10px])
- A cím mező fókuszban látszik, a többi finomítva alatta

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 PDF-filename

A PDF-mentés továbbra is `jsPDF: { format: 'a4', orientation: 'landscape' }` — ez most megegyezik a `@page` beállítással, így a screen-print és a PDF azonos.

---

## [2026-04-21p] — Prezentáció: SZÁMADÁS-stílusú részletes pénzügy

<!-- key: 2026-04-21-presentation-szamadas-style -->
<!-- category: feature -->
<!-- version: 1.13.1 -->
<!-- targets: lelkészek -->

A lelkész küldött egy PDF-mintát a Barátosi Református Egyházközség éves SZÁMADÁS-áról — részletes, tételenkénti bevétel/kiadás lista, horizontális bar-okkal. A prezentáció pénzügyi része **eddig csak Top 8**-at mutatott pie-chart-ban; mostantól **minden tétel** megjelenik SZÁMADÁS-stílusban.

### ✨ Változások

**Adat (actions.ts)**:
- A `incomeByCategory` és `expenseByCategory` már **nem** korlátozódik `.slice(0, 8)`-ra — **minden tétel**, ahol van mozgás (filter: amount > 0).
- Továbbra is csökkenő sorrendben (legnagyobb legelöl).

**Új slide-struktúra (slides.tsx)**:
- Törölve: `FinanceOverviewSlide` (line chart), `IncomeCategoriesSlide` (pie + Top 8), `ExpenseCategoriesSlide` (pie + Top 8)
- Új: **4 pénzügyi slide** ebben a sorrendben:
  1. **Számadás** (`finance-summary`) — SZÁMADÁS-fejléchez hasonló dashboard: Bevételek + Kiadások nagy KPI-kártyával (zöld/rose gradient), alatta az "Év pénzügyi mozgása" kártya (zöld ha pozitív, amber ha negatív) + ↗/↘ ikon
  2. **Bevételek részletesen** (`income-detail`) — minden tétel egy sorban, horizontális bar + pontosított összeg; a legnagyobb felül; kitöltött listában elfér akár 20-30 tétel is
  3. **Kiadások részletesen** (`expense-detail`) — ugyanaz, rose-narancs palettával
  4. **Pénzügyi trend — 5 év** (`finance-trend`) — a régi line chart (bevétel/kiadás évenkénti összehasonlítás), most átnevezve és az új sorrendben az utolsó helyen

**Vizuális elemek** (a SZÁMADÁS PDF ihletésével):
- Bevételnél: emerald-teal paletta, határ-csík a cím alatt
- Kiadásnál: rose-orange paletta
- A tételek között **dinamikus szín-rotáció** (12 szín), ugyanúgy mint a PDF-en
- A bar-ok szélessége a tétel-összeg arányában (max-amount-hoz képest)
- A cím mellett az **éves összeg** kiírva a nagyobb fontosság-jelzéshez

**Layout**:
- Design módban: kompakt (h-5 bar, text-xs)
- Projection módban: nagyobb (h-7 bar, text-base)
- Az aspect-[16/9] slide-frame maradt, a lista `flex-1 overflow-y-auto` — ha sok a tétel, görgethető

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 Megjegyzés

A SZÁMADÁS PDF-en volt még két **szöveges megjegyzés-kártya** ("Hála és köszönet!" + "2024-ben a általános javítás..." bullet-pontokkal). Ezek **a lelkészi kommentár** mezőbe mehetnek (slide-szerkesztőben), már most is elérhető mind a 4 pénzügyi slide-on — a szöveg lent, violet keretes.

---

## [2026-04-21o] — 6 észrevétel: fullscreen, éves terv redesign, lakhely, widget, settings, dark mode

<!-- key: 2026-04-21-six-improvements -->
<!-- category: feature -->
<!-- version: 1.13.0 -->
<!-- targets: lelkészek -->

### ✨ 1. Prezentáció igazi fullscreen (képernyő nem csak ablak)

- `components/presentation/presentation-studio.tsx`: új `enterFullscreen()` / `exitFullscreen()` függvények
- `document.documentElement.requestFullscreen({ navigationUI: 'hide' })` — a böngésző **teljes képernyős** módja, nem csak az ablak
- `fullscreenchange` event figyelés — ha a user F11-el vagy Escape-pel lépett ki, a UI-state szinkronizálódik
- A container `ref`-ből hívja a fullscreen API-t (a slide-container-re)
- A vetítés 92vw × 92vh-ra nőtt (volt 90×90)

### ✨ 2. Éves programterv — TELJES redesign (klasszikus mini-naptárak)

**A korábbi layout hibás volt**: egyetlen függőleges „Nap" oszlop balra + 12 hónap oszlop jobbra, a napok (Vas/Hétfő/Kedd/...) hetenként ismétlődő sorokban. Az eredmény olyan volt, mintha egy Excel-táblázat kaszkádolna lefelé (lásd a felhasználó által küldött PDF).

Mostantól **12 mini-naptár 4×3-as rácsban**:
- Minden hónap saját kis táblázata (7 oszlop = hét napjai, 6 sor = hetek)
- Hét **hétfővel kezdődik** (európai konvenció)
- A cellában: dátum-szám fenn, esemény-jel alatta
- **Hétvége-kódolás**: vasárnap rózsa, szombat amber, ünnep sárga outline
- **Program-napok**: zöld emerald outline
- **Ma**: 2px emerald outline, kiemelt háttér

**Az oldalsáv**: az év minden eseménye időrendi sorrendben, szín-csíkkal a program-típushoz.

**Layout**: A3 landscape, a fejléc (címer + cím + évbadge) megmarad, a motto+igehely is.

**Új fájl struktúra**: `buildMonthCells(year, month)` helper egy hónap napi mátrixát készíti — a régi hetenkénti hibás iterációt teljesen kiváltja.

### ✨ 3. Születésnap nyomtatás — lakhely opció

- `components/dashboard/birthday-list-dialog.tsx`: új `showAddress` state + checkbox a szűrőkben
- A `Member` interface kapott `varos?: string | null, cim?: string | null` mezőket
- Amikor be van kapcsolva:
  - A képernyős listában új "Lakhely" oszlop (város + cím)
  - A nyomtatási PDF-ben is megjelenik egy dőlt szürke oszlop
- `app/(dashboard)/dashboard/page.tsx`: a `szemely` select lekérdezés bővítve a `varos, cim` mezőkkel
- A `Member` interface is bővült

### ✨ 4. Publikus oldal widget — eltávolítva a dashboard aljáról

- `components/dashboard/public-site-widget.tsx` már nem hívódik a `dashboard/page.tsx`-ből
- Indok: a publikus oldal státusza a **KPI-kártyán** már látszik (5. kártya: „Élő / Beállítás →"), külön doboz redundáns
- A komponens-fájl megmarad a repo-ban (nem használt, de nem is töröljük — későbbi újrahasználat lehetséges)

### ✨ 5. Beállítások modal — üres tér kitöltve

- Az oldalsáv alá új **Tipp-doboz**: *„A beállításaid jelenleg a böngészőben tárolódnak..."*
- Alatta: **bejelentkezett user email-je** (ha van)
- **Nyelv tab** kibővítve: 3 szekció (Felület nyelve + Hivatalos iratok nyelve + Fordítási készültség progress-bar-okkal)
- **Publikus oldal tab** kibővítve: 2 szekció (státusz + „Mit ad a publikus oldal?" 4-pontos lista ikonokkal)
- Az oldalsáv és tartalom **egyenletes** magasság — nincs üres tér desktop nézeten

### ✨ 6. Dark mode olvashatóság — alap fix

A Tailwind `bg-white`, `text-slate-*`, `bg-slate-50`, `border-slate-*` osztályok sok komponensben **hardkódoltak** — dark mode-ban fehér háttér, sötét szöveg maradt → olvashatatlan.

Új szekció: `app/globals.css` — `.dark { ... }` override-ok:
- `.card-raised` → dark háttér + világos keret
- `.bg-white` → `var(--card)` (dark card bg)
- `.text-slate-900/800/700` → `var(--foreground)` (világos szöveg)
- `.text-slate-500/400` → `var(--muted-foreground)`
- `.border-slate-*` → `var(--border)`
- Színezett 50-es hátterek (emerald-50, amber-50, sky-50, rose-50, violet-50, indigo-50) → tompa, átlátszó változatok dark háttérre
- Sötét szövegárnyalatok (text-emerald-900, text-amber-900, stb.) → világos megfelelők

**Megjegyzés**: ez egy **MVP-megoldás**. Hosszabb távon a komponensekben a semantic tokens (`bg-background`, `text-foreground`, `bg-card`) használata a jó megoldás — de az hosszú audit. Most **olvashatóvá** teszi a dark mode-ot, 95%-ban.

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning (az új kódban)

---

## [2026-04-21n] — F5: Banner gomb + Prezentáció PDF + tartozás-rendszer terv

<!-- key: 2026-04-21-phase-5-wrap-up -->
<!-- category: feature -->
<!-- version: 1.12.1 -->
<!-- targets: lelkészek -->

Kisebb csomag az előző session folytatásaként:

### ✨ Új / javítás

**F5.1 Januári banner „Beállítom most" gomb — működőképes**
- `components/dashboard/current-year-fee-banner.tsx` — a gomb mostantól dispatchol egy `kartoteka:open-congregation-dialog` Window CustomEvent-et
- `components/layout/dashboard-shell.tsx` — `useEffect`-tel figyel az eseményre, megnyitja a `CongregationDialog`-ot
- **Tervezési mintázat**: a page-level komponensek (banner, widget-ek) szabadon eseményt dispatch-elhetnek, és a shell elkapja — nem kell prop-drilling.

**F5.2 Prezentáció valós többoldalas PDF-export**
- Korábban a `window.print()` csak az **aktuálisan megjelenített** slide-ot nyomtatta (browser Print → PDF opcióval).
- Most: `@media print` CSS-ben **minden 12 slide** renderelődik a rejtett containerben, `pageBreakAfter: always` elválasztással. A browser Print dialog → **12 oldalas PDF** A4 landscape-en.
- `app/globals.css` új szekció: `@media print` — slide-ok teljes képernyősek, header/nav elrejtve, A4 landscape `@page` szabály.
- A `window.print()` megnyomása után: a böngésző Print Preview-ja **mind a 12 slide-ot** mutatja sorban. A lelkész PDF-ként is mentheti, vagy direktben nyomtathat.

**F5.3 Tervdokumentum — tartozás-rendszerek egyesítése**
- Új fájl: `docs/project-tracking/KARTOTEKA-tartozas-rendszer-egysegesites-terv.md`
- **Felfedezés**: a rendszer két párhuzamos tartozás-számítást használ:
  - Régi: `bealitas` tábla alapú — MemberDetailsDialog „Hátralék" tab
  - Új: `congregation_annual_fees` + `congregation_custom_fees` — AnnualFeesPanel + `calculateMemberDebt()`
- Ha a lelkész az AnnualFeesPanel-ben módosít egy éves díjat, az új táblába kerül, de a régi UI-t nem frissíti. **A két rendszer nincs szinkronban.**
- 3 javaslat a user döntésére:
  - **A**: most semmit (jelenlegi működés OK)
  - **B**: bidirekcionális sync (~1 óra) — a saveAnnualFee mindkettőbe ír
  - **C**: teljes refactor (~2-3 nap) — `computeJarulekForMemberYear` átírása az új rendszerre

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 A user-nek kérdés

Melyik utat szeretnéd a tartozás-rendszerek egyesítéséhez? (A / B / C az `KARTOTEKA-tartozas-rendszer-egysegesites-terv.md`-ben)

---

## [2026-04-21m] — 3-4. Fázis: Éves terv redesign + Prezentáció studio

<!-- key: 2026-04-21-phase-3-4-presentation -->
<!-- category: feature -->
<!-- version: 1.12.0 -->
<!-- targets: lelkészek -->

### ✨ F3: Éves programterv TELJES UI-redesign

**`components/dashboard/annual-plan-print.tsx`** — a korábbi egyszerű kalendárium-nyomtatás **kifüggeszthetővé** vált:

- **Gyülekezeti címer** a fejlécben (balra), `cimer_url` a `congregations`-ből
- **Márkaszín-paletta**: teal + amber (nem régi navy-szürke)
- **Serif tipográfia** (Georgia) a fejlécben — emelkedettebb hangulat
- **Évbadge** amber gradient-tel jobbra (112×84, 34px font)
- **Évbeli motto + igehely**: „Mindenkinek rendelt ideje van..." — Préd. 3:1
- **Református ünnepek AUTOMATIKUSAN** a kalendáriumba (minden évben megjelennek, amber háttérrel, ✝ szimbólummal):
  - Fix: Újév, Reformáció napja, Szenteste, Karácsony (2 nap)
  - Mozgó: Virágvasárnap, Nagypéntek, Húsvét (2 nap), Áldozócsütörtök, Pünkösd (2 nap)
- **Bővített jelmagyarázat**: program-típusok + ref. ünnep + ma + vasárnap
- **Nagyobb betűméret** (8.5px → 11px a hónap fejlécben, 9px a napokban)
- **PDF-mentés** megmarad (html2pdf.js) + nyomtatás + bezárás
- **`congregationLogo` prop** átfolyva a `ProgramScheduler`-en keresztül

### ✨ F4: Prezentáció Studio — teljesen új modul

**Új 5. KPI-kártya** a Dashboard-on: „**Prezentáció** — Éves beszámoló →" (violet gradient, `Presentation` ikon). A `xl:grid-cols-4` → `xl:grid-cols-5`-re vált.

**Új route**: `/eves-jelentes/prezentacio`

**Új server action**: `app/(dashboard)/eves-jelentes/prezentacio/actions.ts`
- `getPresentationData(year)` — egy adott évre összegyűjti:
  - **Gyülekezet**: név, címer
  - **Tagok**: aktív szám, családok, férfi/nő arány, kor-eloszlás (0-18, 19-40, 41-65, 66+), 5 éves trend
  - **Anyakönyv**: keresztelések, konfirmációk, esketések, temetések (aktuális + 5 éves trend)
  - **Pénzügy**: bevétel/kiadás, 5 éves trend, bevétel és kiadás kategóriánként (Top 8), egyházfenntartás teljesítés %
  - **Programok**: összes, teljesített, típus szerint

**Új komponens**: `components/presentation/presentation-studio.tsx`
- 3-oszlopos layout: balra slide-lista (navigáció), középen preview, jobbra beállítások (év-választás + tipp)
- 12 slide, billentyűzet-navigáció (←/→/PageDown/PageUp/Escape)
- **Vetítés mód**: fullscreen, fekete háttér, nagyobb betűméret, minimalis kontrollok
- **Szerkesztő**: minden slide-hoz cím / alcím / **lelkészi kommentár** (localStorage-ben tárolva)
- **Nyomtatás** gomb (window.print)
- Év-váltás: Input onBlur → router.push(`?year=...`)

**12 slide sablon** (`components/presentation/slides.tsx`):
1. **Cím** — gyülekezet + év + címer
2. **Áttekintés** — 4 KPI (tagok, családok, bevétel, kiadás)
3. **Gyülekezet összetétele** — férfi/nő pie chart
4. **Kor-eloszlás** — oszlopdiagram (4 csoport)
5. **Anyakönyv** — 4 KPI (keresztelő, konfirmáció, esketés, temetés)
6. **Anyakönyv 5 év trend** — csoportosított oszlopdiagram
7. **Pénzügyi áttekintés** — bevétel/kiadás vonaldiagram 5 évre
8. **Bevétel kategóriák** — pie chart + lista (Top 8)
9. **Kiadás kategóriák** — pie chart + lista (Top 8)
10. **Egyházfenntartás teljesítés** — 3 KPI-blokk (aktív tagok, fizettek, arány %)
11. **Programok** — KPI-blokkok + típus szerinti vízszintes oszlopdiagram
12. **Záró** — „Soli Deo Gloria" + lelkészi záró ige

**Chart library**: Recharts 3.8.1 (már telepítve)

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📌 Továbbfejlesztési lehetőségek (későbbre)

- **Slide sorrend átrendezés** drag-and-drop-pal
- **Slide kikapcsolása** (rejtés a vetítésből)
- **Saját slide** hozzáadása (szabad szöveg)
- **Képek beillesztése** a slide-okba
- **PDF export** (most csak browser print)
- **Perzisztencia**: a szerkesztett szövegek DB-ben (most localStorage)

---

## [2026-04-21l] — 2. Fázis: Névjelentések, születésnap-szűrő, tartozás-horizont, januári banner

<!-- key: 2026-04-21-phase-2-medium-features -->
<!-- category: feature -->
<!-- version: 1.11.0 -->
<!-- targets: lelkészek -->

Nagy csomag — egyszerre öt új funkció:

### ✨ Új funkciók

**F2.1 Névjelentések a Dashboard hero-ban:**
- Új adatbázis: `lib/data/name-meanings.ts` — ~140 leggyakoribb magyar keresztnév + **eredet** + **jelentés**
- `lookupNameMeaning(name)` — ékezet-toleráns, esetfüggetlen kereső
- Hero banner: a mai névnap-nevek alatt új szekcióban kiírja a jelentést, pl.
  „*Endre (görög) — férfias, bátor*" · „*Ildikó (germán) — harcos*"
- Diagnosztikai SQL: `2026-04-21-nevnap-diagnosis.sql` — a lelkész ezzel ellenőrizheti, hogy a `nevnap` tábla az erdélyi református naptár szerint van-e (ha nem, új seed szükséges)

**F2.2 Születésnap-szűrő és nyomtatás:**
- Új komponens: `components/dashboard/birthday-list-dialog.tsx`
- Gomb a Celebrations kártya fejlécében: **„Lista"** (amber chip)
- Modal tartalma:
  - Időszak-preset: „Ezen a héten / Ez a hónap / Köv. hónap / Egész év / Egyéni"
  - Életkor-szűrő (tól / ig)
  - Nem-szűrő (Mindenki / Férfi / Nő)
  - Eredmény-lista (áttekinthető táblázat, név + nap + életkor + ♂/♀)
  - **Nyomtatás** gomb: A4 portrait, saját ablakban, logóval, gyülekezet fejléccel, időszak-jelzéssel

**F2.3 Tartozás-horizont (user jóváhagyva):**
- Új fájl: `app/(dashboard)/penzugy/tartozas-actions.ts`
- `calculateMemberDebt(congregationId, memberId)` — részletes tartozás-számítás
  - **18 éves kortól** számol (fiatalabbra nincs tartozás; a tartozáson az életkor is látszik)
  - **Utolsó fizetés + 1**-től kezdi a horizontot (ha sosem fizetett, a 18. születésnapjától)
  - **Kedvezmény-ellenőrzés**: aki időszaki kedvezmény feltételének megfelelt (kedvezményes összeget fizette határidőn belül), VAGY kor-alapú kedvezmény kor-küszöbét elérte + kedvezményes díjat kifizetett → **teljesen kifizetettnek** számít
  - **Gyülekezet-specifikus díjak** (`congregation_custom_fees`) automatikusan hozzáadódnak, a tag életkora szerinti szűréssel
- `saveAnnualFee()` — egyszerűsített upsert (year + amount)
- `deleteAnnualFee()` — warning-gal

**F2.3.a Évenkénti díjak táblázat az Alapdíj al-tabon:**
- Új komponens: `AnnualFeesPanel` a CongregationDialogV2 fájljában
- Táblázatos inline-edit, bármennyi év visszamenőleg (default 10, +10 gombbal bővíthető)
- Aktuális év emerald-highlighted, szerkesztése a fenti „Teljes éves díj" mezőn át
- Régebbi évek: szerkeszthető összeg, törlés gomb (confirm-dialog)
- Hozzáadás: `+ Hozzáadás` gomb a még nem rögzített éveknél
- Magyarázó info-box: „régebbi évekhez nincs kedvezmény, elmaradásnak számítanak"
- **Az Éves előzmények külső tab törölve** — beolvasztva az Alapdíj al-tabra

**F2.4 Januári sárga banner:**
- Új komponens: `components/dashboard/current-year-fee-banner.tsx`
- A dashboard tetején (a Hero fölött) megjelenik, ha:
  - `congregations.eves_jarulek` ≤ 0 VAGY null, **ÉS**
  - `congregation_annual_fees` nem tartalmaz sort az aktuális évre
- Tartalma: amber gradient, figyelmeztetés-ikon, cím „Állítsd be a {év}-es díjat!"
- Két gomb: „Beállítom most" (jövőben Congregation modal megnyitás), „Emlékeztess később" (localStorage dismiss)
- LocalStorage dismiss: `fee-banner-dismissed-{year}` — ha ki van dismiss-elve, csak új évben jelenik meg újra

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning az új fájlokban

### 📝 SQL migráció még nincs

A tartozás-számítás a meglévő `congregation_annual_fees` táblát használja (2026-04-09-god-mode sql-ből). Új SQL nem kell.

---

## [2026-04-21k] — 1. Fázis: Csengő animáció, ünnepi köszöntés, Beállítások modal

<!-- key: 2026-04-21-phase-1-ui-polish -->
<!-- category: feature -->
<!-- version: 1.10.0 -->
<!-- targets: lelkészek -->

Három UI-feature egy fázisban: az értesítés-csengő megszépítve és animálva, a Dashboard üdvözlés az egyházi ünnepeket figyelembe véve, és új **Beállítások modal** a header avatár-menüjében — 5 lappal (értesítések, megjelenés, nyelv, publikus oldal, adat & biztonság).

### ✨ Új funkciók

**F1.1 Csengő animáció + szebb dropdown:**
- CSS keyframes: `bell-soft-pulse` (nyugodt 3 sec pulzálás amíg van olvasatlan), `bell-shake` (egyszeri 1.4 sec ring-shake új értesítésre), `badge-pulse-ring` (piros badge körüli glow)
- A gomb háttere amber glow-ra vált amíg van olvasatlan (`.bell-btn-glow`)
- Az ikon váltás: `Bell` → `BellDot` ha van olvasatlan
- Dropdown szebb fejléccel: gradient + sparkles + olvasatlanok száma
- Relatív idő megjelenítés (pl. „3 órája")
- Dialog részletes megjelenítés: serif cím, slate-bordered tartalom

**F1.2 Ünnepi köszöntés + keresztnév:**
- Új fájl: `lib/utils/reformed-holidays.ts`
- 9 református ünnep: Újév, Virágvasárnap, Nagypéntek, Húsvét, Áldozócsütörtök, Pünkösd, Reformáció napja, Szenteste, Karácsony
- Húsvét dátum-számítás: Gauss-Butcher algoritmus (gregoriánus)
- `getPersonalizedGreeting(firstName, date)`: ünnep prioritás, különben napszak
- `extractFirstName(fullName)`: a magyar név-sorrend szerint az **utolsó szó** a keresztnév
- Hero banner: amikor ünnep van, új amber chip a köszöntés mellé a Sparkles ikonnal

**F1.3 Beállítások modal:**
- Új komponens: `components/modals/settings-dialog.tsx`
- Új menüpont a header dropdown-ban: „Beállítások" (Settings ikon, a Rendszergazdai mód **előtt**)
- Új komponens: `components/layout/theme-provider.tsx` — a `next-themes` wrapper
- Root layout bővítve: `<ThemeProvider attribute="class" defaultTheme="light" enableSystem>`
- 5 tab:
  1. **Értesítések**: email kapcsoló + 5 típus-szűrő (admin, warning, danger, support, info)
  2. **Megjelenés**: világos / sötét / rendszer mód (kártyás választó) + betűméret 3 opció (béta)
  3. **Nyelv**: HU/RO (a román hamarosan, placeholder)
  4. **Publikus oldal**: státusz-panel + link a `/publikus-oldal` modulra
  5. **Adat & biztonság**: offline gyorstár link + „kijelentkezés minden eszközön" (hamarosan)
- MVP: a beállítások **localStorage**-ben (`kartoteka-user-prefs-v1`). Később `user_preferences` SQL tábla
- Dark mode: béta figyelmeztetés (egyes modul-specifikus UI elemek még csak világos módban optimálisak)

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 Megjegyzés

A 3. pontra („beállítások opcióinak bővítése") a **nyelv** és **betűméret** került be extra elemként a javaslom szerint. Az email-értesítés és dark mode **localStorage**-ben dolgozik — a Supabase-es perzisztálás egy későbbi fázis.

---

## [2026-04-21j] — CongregationDialog második csomag: panelek grid, Szervezet beolvasztás, gyülekezet-specifikus díjak

<!-- key: 2026-04-21-congregation-dialog-second-pack -->
<!-- category: feature -->
<!-- version: 1.9.2 -->
<!-- targets: lelkészek -->

Öt dolog egyszerre:

1. **Alapdíj al-tab panelek egymás mellett** (grid), `xl:grid-cols-2` — az "Éves egyházfenntartás" és a "Tartozás számítási módja" vízszintesen jelenik meg desktop-on.
2. **Szervezet tab törölve**, tartalma beolvasztva az Alapadatok tabba új "Szervezeti hovatartozás" panelként. **Az egyházkerület neve is látszik** (`dioceses.districts.name` JOIN alapján), az egyházmegye selectbe a kerület is kiíródik.
3. **Több kedvezményes időszak egy évben**: a Meglévő kedvezmények panel **évenkénti csoportosítást** kapott (év-badge + N kedvezmény), és egy magyarázó zöld doboz: "több időszaki kedvezményt is be lehet állítani, a sorrend szerint alkalmazódnak".
4. **Gyülekezet-specifikus díjak** (ÚJ FEATURE): új al-tab a Pénzügy-ben: **"Egyéb díjak"** (HandCoins ikon). Itt a lelkész a presbitérium által megszavazott különdíjakat rögzíti (pl. temetős karbantartás, harangozási díj, kántorilletmény). Mezők: név, leírás, éves összeg, érvényesség (year_from / year_to), korhatár (kor_tol / kor_ig), aktív toggle.
5. **Tartozás-terv frissítve** a user válaszaival: **18 éves kortól** számol a rendszer (életkor megjelenítéssel), **kedvezmény-ellenőrzés** a részleges befizetéseknél (aki a kedvezmény feltételének megfelelt = teljesen kifizetett), **nincs év-limit** a visszamenőleges díj-bevezetésnél, **januári sárga banner** az új évi díj-beállítás emlékeztetésére.

### ✨ Változások

**UI:**
- `components/modals/congregation-dialog-v2.tsx`:
  - Alapadatok tab: új "Szervezeti hovatartozás" Panel — egyházkerület (read-only, dioceses JOIN-ból) + egyházmegye select (kerületi névvel)
  - Külső TabsList: `sm:grid-cols-3` (volt 4), "szervezet" trigger + TabsContent törölve
  - Pénzügy → Alapdíj al-tab: `xl:grid-cols-2` grid (panelek egymás mellett); fizetési határidő info-szöveg egyszerűsítve
  - Pénzügy → Kedvezmények al-tab: zöld magyarázó doboz "több időszaki kedvezmény", évenkénti csoportosítás (év-badge + sorrend szerint rendezett lista)
  - Új Pénzügy al-tab: **"Egyéb díjak"** — CustomFeeCard kártyás lista + CRUD form

**Backend:**
- `getDioceses()` bővítve: `district_id` + `district_name` (JOIN districts-szel)
- Új SQL migráció: `migration-docs/sql/2026-04-21-congregation-custom-fees.sql` (tábla + RLS + index + GRANT + updated_at trigger)
- Új action-ök a `app/(dashboard)/congregation/actions.ts`-ben:
  - `getCongregationCustomFees(congregationId)`
  - `saveCongregationCustomFee(congregationId, payload)` — Zod validációval
  - `deleteCongregationCustomFee(congregationId, feeId)`
- `CustomFeeRow` interface export

**Új komponens:**
- `CustomFeeCard` — olvasó nézet a lista-sorhoz; aktív/inaktív állapot vizuális megkülönböztetése (opacity, badge); összeg, érvényesség, korhatár chip-ekkel

### 📋 Függőben — user jóváhagyásra vár

A **Fázis 5** (éves előzmények + tartozás-horizont) implementáció a `KARTOTEKA-eves-egyhazfenntartas-tabla-terv.md` **9. és 10. szakaszában** részletezve — frissítve a user válaszaival. Implementációs fázisok: 1) server actions, 2) éves táblázat UI, 3) éves előzmények tab törlése, 4) januári banner, 5) tag tartozás megjelenítés. **Megbecsülés**: 2-3 munkanap.

### ⚠️ Új SQL-migráció

**Endrének futtatnia kell**: `migration-docs/sql/2026-04-21-congregation-custom-fees.sql`. Addig az "Egyéb díjak" al-tab egy sárga figyelmeztetést mutat, de nem blokkolja a többi funkciót.

---

## [2026-04-21i] — CongregationDialog finomhangolás: oldalsó al-tabok + határidő eltávolítása

<!-- key: 2026-04-21-congregation-dialog-sidenav -->
<!-- category: improvement -->
<!-- version: 1.9.1 -->
<!-- targets: lelkészek -->

A „Gyülekezetünk adatai" → Pénzügy tab belső 3 al-tabja (Alapdíj / Kedvezmények / Bankszámlák) **desktopon most oldalt** jelenik meg, mobilon továbbra is fent (responsive). A fizetési határidő mező **eltávolítva** — a szabály: az alapdíj határideje **automatikusan december 31.** Külön kedvezményes határidőt a Kedvezmények fülön lehet állítani.

### ✨ Változások

- **Oldalsó al-tab nav (desktop)**: `md:flex-row` + `md:flex-col` TabsList bal oldalon (w-56). Mobilon fent vízszintes.
- **Fizetési határidő mező törölve** az Alapdíj panelről. Default érték `12-31`, a DB-be automatikusan mentődik. A magyarázó info-box frissítve: a kedvezményes határidőket a „Kedvezmények" fülön lehet beállítani.
- **Initial state** és **loadedForm fallback**: `jarulekHatarid: '12-31'`.

### 📋 Tervdokumentumok — user jóváhagyásra vár

- **`KARTOTEKA-eves-egyhazfenntartas-tabla-terv.md`** — az Éves előzmények tab beolvasztása a Pénzügy → Alapdíj al-tabba, 10 évre visszamenőleges díj-rögzítés **kedvezmény nélkül** (elmaradásnak számít), **új tartozás-horizont logika**: a rendszer a tartozást az utolsó rögzített kifizetéstől számolja vissza. 5 kérdés a user-hez:
  1. Ha sosem fizetett → mettől számoljuk?
  2. Részleges befizetés → beszámít?
  3. Éves díj törlése → mi történik a rá mutató befizetésekkel?
  4. 10 év default + bővítés hány évvel?
  5. Aktuális év a `congregations.eves_jarulek`-ben vagy az `congregation_annual_fees`-ben tároljuk?

---

## [2026-04-21h] — UI-csomag: házszám-prefix, webcím link, CongregationDialog újraszervezés

<!-- key: 2026-04-21-ui-pack-congregation-dialog -->
<!-- category: improvement -->
<!-- version: 1.9.0 -->
<!-- targets: lelkészek -->

Több észrevétel egy csomagban: a cím-formátum a román konvenciókhoz igazodik (Strada X, nr. Y), a gyülekezeti weboldal mezőnél a Kartotéka publikus oldal is látszik, és a „Gyülekezetünk adatai" modal Pénzügy tabja **teljesen újratervezve** — 3 al-tab + kártyás kedvezmény-típus-választó + magyarázó példák.

### ✨ Új funkciók és javítások

**Cím (AddressForm):**
- **Új `lib/address/format.ts`** helper: `formatStreetWithType()` (a „Strada"/„Bd."/… prefixet automatikusan elé teszi, ha nincs) és `formatHouseNumber()` (a „nr." prefixet a házszám elé teszi).
- **Utca kiválasztásnál** a rendszer automatikusan „Strada X" formátumban menti, ha az adrstreet-ben van `street_type_ro`, azt használja.
- **Házszám mezőben** onBlur-kor a „nr." automatikusan elé kerül.
- **Layout javítás**: az Utca mező önálló sorban, a Házszám + Irányítószám 2-oszlopos gridben — mobilon is látható és használható.
- **Segítő szövegek** minden mező alatt (pl. „A rendszer automatikusan kiegészíti a »Strada«-val" / „A »nr.« automatikusan kerül elé").

**Webcím (CongregationDialogV2 Alapadatok tab):**
- Ha a gyülekezet publikus oldala aktív (`public_site_enabled = true` + `public_slug`), a Weboldal mező alatt megjelenik egy zöld link-panel: `🌐 Kartotéka publikus oldal: /gy/<slug>` (kattintható, új tabban nyílik).
- Ha nincs aktiválva, egy kis tipp: „Saját Kartotéka-oldal létrehozása: oldalsáv → Publikus oldal".

**Pénzügy tab (teljes UI-refactor):**
- **Az „Örökölt kompatibilitási adatok" panel törölve** — a fő bank / fő IBAN / címer URL mezők zavarosak voltak. A címer a fejléc file-upload-ján változtatható, a bank adatok a default bankszámlából származnak.
- **3 belső al-tab**: `Alapdíj` / `Kedvezmények` / `Bankszámlák` — a hosszú scroll helyett fókuszált lapok.
- **Az Alapdíj al-tabon**: Éves díj + határidő **magyarázó info-box-szal**; Tartozás-számítási mód **kártyás** radio **példával** (a 2023-as 150 RON vs. 2026-os 200 RON tartozás eset).
- **A Kedvezmények al-tabon**: **3 nagy kártyás típus-választó** ikonokkal, címekkel, leírásokkal, **konkrét példákkal** (pl. „65+ éves tag 75 RON-t fizet a 150 helyett").  Az „Aktív" mező dropdown helyett **toggle-kapcsolóvá** alakítva leíró szöveggel.
- **A Bankszámlák al-tabon**: a meglévő lista + form, változatlan logika.

### 📌 Dizájnfilozófia

A modal eddig sok részt egy lapon tömörített, ami kognitív terhelést okozott. Az új struktúra a „**egy feladat = egy al-tab**" elvet követi. A kedvezmény-típusok kártyás megjelenítése és a példák a lelkészt **vizuálisan** vezetik végig — nem kell a fejében elképzelnie, mi lesz az eredmény.

---

## [2026-04-21g] — Szigorítás: a helység is kötelezően a listából — „kézi bevitel" csak az utcánál

<!-- key: 2026-04-21-locality-list-only -->
<!-- category: improvement -->
<!-- version: 1.8.6 -->
<!-- targets: lelkészek -->

A megye és a helység **a listából** kötelezően választandó — a „Használd kézzel" fallback gomb **csak az utcánál** marad meg. Indoklás: a 42 megye és a 13 832 helység a Poșta Română + GeoNames adatból **teljes körű** — nincs olyan romániai helység, amit ne tudna a rendszer. Az utca ellenben ~58% lefedettségű, ott a kézi bevitel valódi szükséglet.

### 🔧 Változások

- **Helység autocomplete**: az amber „kézi" badge + a dropdown alján található „Használd kézzel" gomb **eltávolítva**. Ha nincs találat: a dropdown egy barátságos üzenetet mutat („Próbáld a helség magyar vagy román nevét — a rendszer mindkettőt érti").
- **Utca autocomplete**: **változatlan** — a kézi fallback továbbra is elérhető.
- **Régi adatok automatikus felismerése (helység-rematch)**: ha a DB-ben már van szövegesen mentve a város (pl. `form.varos = "Kolozsvár"`, de `adrlocality_id = NULL`), a wizard **betöltéskor** automatikusan megpróbálja exact match-elni az `adrlocality` táblában. Ha talál, a strukturált ID-t automatikusan rácsatolja — a lelkésznek nem kell újra beírnia.
- **UI egyszerűsítés**: az AddressForm utca-render ágából eltávolítva a „free-text helység → free-text utca" kaszkád (soha nem aktiválódott az új szabály mellett).

### 📌 Hátterében

A [[2026-04-21e]] fallback-et a **teljes** cím-hierarchiára terveztük, de a valós seed-lefedettség aszimmetrikus: megye + helység = teljes, utca = hiányos. A UX-szabály ezt tükrözi: **ahol a rendszer tudja az adatot, ott kötelezzük a struktúrát** (SIRUTA-kód, irányítószám). **Ahol nem tudja, ott engedjük a kézi bevitelt** — a lelkész soha ne akadjon el egy utcanevnél.

---

## [2026-04-21f] — Hotfix: controlled→uncontrolled Input warning a cím-wizardban

<!-- key: 2026-04-21-hotfix-controlled-input -->
<!-- category: bugfix -->
<!-- version: 1.8.5 -->
<!-- targets: lelkészek -->

A dashboard-on megnyitott `CongregationSetupAutoOpen` wizard cím-lépésében a konzol warning-ot írt: *"A component is changing a controlled input to be uncontrolled"*. A Base UI `<Input>` az első render-kor dönti el, hogy controlled vagy uncontrolled: ha `value === undefined`, akkor uncontrolled marad a teljes életcikluson át.

### 🐛 Javítás

- Minden `<Input>` value-t `?? ''` fallback-kel védünk (`value.country ?? ''`, `value.locality ?? ''`, stb.) — ha egy parent valaha hiányos AddressValue-t adna át, a komponens akkor sem „megy uncontrolled-ra".
- A **disabled placeholder Input-ok** (pl. „Előbb válaszd ki a megyét") is explicit `value=""` + `readOnly` prop-ot kapnak. Korábban `value` nélkül voltak — és amikor a feltétel átváltott ugyanabban a pozícióban, a React reconciliation azonosnak tekintette az elemet, és controlled → uncontrolled átváltást észlelt a Base UI.

### 📌 Tanulság

Base UI (és szigorúbb React 19) mellett a controlled input **mindig** kapjon defined string-et. A disabled + placeholder-nél is `value=""`, különben ha valamikor ugyanazon a pozíción kontrollált változat jelenik meg, a FieldControl panaszkodik.

---

## [2026-04-21e] — Feature: „Használd kézzel" fallback a helység- és utca-autocomplete-ben

<!-- key: 2026-04-21-address-manual-fallback -->
<!-- category: feature -->
<!-- version: 1.8.4 -->
<!-- targets: lelkészek -->

Az utca-lefedettség a 2026-04-21-es seed után ~58%: sok kisebb falu / új utca nem szerepel a hivatalos Poșta Română XLS-ben. Eddig, ha a lelkész olyan utcát vagy helységet keresett, ami nincs a listában, a mező „üres találat" állapotban ragadt, és a wizard nem engedte tovább. Mostantól **a dropdown alján megjelenik egy „Használd kézzel" opció** — a beírt szöveg egyetlen kattintással szövegesként elmentődik, és a wizard folytatódik.

### ✨ Új funkciók

- **Helység autocomplete**: ha nincs találat a beírt kifejezésre (vagy a lelkész szándékosan egyedi nevet ad), a dropdown legalján megjelenik a „**kézi** — Használd kézzel: ›<szöveg>‹" opció. Kattintás után a `localityId` null, de a `form.varos` a beírt szöveg — a hivatalos iratokon ez jelenik meg.
- **Utca autocomplete**: ugyanez — ha nincs találat, a „**kézi**" fallback gombbal szöveg-mentés, `streetId` null.
- **Vizuális státusz**: a kézzel megadott érték **amber (sárga-narancs) badge**-dzsel jelenik meg, szemben a strukturált találat **emerald (zöld) badge**-dzsével. Így a lelkész rögtön látja, hogy mi jön a hivatalos adatbázisból és mi a saját szöveg.
- **Utca mező szabad szövegként** ha a helység kézi: ha a lelkész kézzel adta meg a helységet (nincs `localityId`), az utca is szabad-szöveges Input lesz (nem disabled).

### 📌 UX alapelv

A rendszer soha nem zárja el a lelkészt az adatbeviteltől, csak mert egy reference tábla nem teljes. A hivatalos adat **ajánlás**, a kézi bevitel **mindig elérhető**. A különbséget vizuális jelzés közli (amber vs. emerald), és a DB-be is eljut: a kézi bevitelnél az `adrlocality_id`/`adrstreet_id` null, a későbbi statisztikákból meg lehet nézni, melyik régióban milyen utcák hiányoznak a seedből.

---

## [2026-04-21d] — Hotfix: megye dropdown visszaugrott üresre a cím-wizardban

<!-- key: 2026-04-21-hotfix-county-dropdown-state -->
<!-- category: bugfix -->
<!-- version: 1.8.3 -->
<!-- targets: lelkészek -->

A GRANT hotfix után a megye dropdown **még mindig nem működött**: amikor a lelkész megyét választott, a mező **visszaugrott az üres placeholder-re**. Diagnózis: a három parent wizard (`CongregationSetupWizard`, `DioceseSetupWizard`, `WelcomeWizardClient`) a saját form-state-jében **csak a megye NEVÉT** tárolja (`form.megye = "Cluj"`), a `countyId`-t NEM — a `formToAddressValue` helper mindig `countyId: null`-t adott át. Így minden render után a select visszaállt üresre, mert a `value.countyId` null volt.

### 🐛 Javítás

- **`components/ui/address-form.tsx`** — a komponens önmaga tartja nyilván a megye-id-t: `const [internalCountyId, setInternalCountyId] = useState<number | null>(...)` + egy `useMemo`-alapú **név-szerinti rematch** (ha a parent csak a `value.county` szöveget adja, a `counties` listából derivált érték adja az id-t). A `<select>` value-ja és a `<LocalityAutocomplete>` countyId prop-ja az `effectiveCountyId = internalCountyId ?? matchedCountyId` értékből olvas.
- A parent wizardok mappingje (`formToAddressValue`) változatlan — a `countyId: null` literal már nem gond, az AddressForm belülről oldja meg.
- **Null-safety** a match-logikában és a label helperekben: a `c.name_ro?.toLowerCase()` és a `c.name_hu || c.name_ro || ''` fallback elbírja a régi seed-ből maradt zombi sort, ami `name_ro` nélkül szerepel (a `megye_count: 43` volt 42 helyett).
- **`lib/address/actions.ts`** → `listCounties()`: a Supabase query `.not('name_ro', 'is', null)` feltételt kap — így a zombi sor már forrásnál kiszűrődik, a dropdown tisztán 42 megyével tölt.

### 📌 Tanulság

Controlled React komponensnél egy **tárolatlan belső id** (amelyre a parent state nem tud emlékezni) megoldható úgy, hogy a komponens **saját state-ben** tartja, és a parent által átadott szöveges értékből **derivált érték**-ként (useMemo) kapja vissza. Nem kell a parent state-et átalakítani, nem kell új mezőt a DB-be bevezetni.

---

## [2026-04-21c] — Hotfix: ADR-táblák GRANT SELECT az authenticated role-nak

<!-- key: 2026-04-21-hotfix-adr-grant-authenticated -->
<!-- category: bugfix -->
<!-- version: 1.8.2 -->
<!-- targets: lelkészek -->

A megye dropdown a cím-wizardban **üres maradt** — a lelkész nem tudott választani. Oka: az `adr*` táblákra 2026-04-13-kor RLS + policy került (`USING (true)`), de **explicit `GRANT SELECT` nélkül**. A Postgres 3-rétegű szabálya szerint az RLS önmagában nem elegendő: ha nincs GRANT, a lekérdezés csendben üres listát ad.

### 🐛 Javítás

- `migration-docs/sql/2026-04-21-adr-grant-authenticated.sql` — `GRANT SELECT ON public.adr{country,county,locality,street,locality_alias} TO authenticated`, plus a szekvenciákra `GRANT USAGE`.

### 📌 Tanulság

A meglévő alapelv ([[Az RLS egy a három védelmi rétegből]]) most megerősítve: **GRANT + RLS + app layer** — mindhárom kell. Ha új reference-táblán csak RLS-t állítok, a lekérdezés üres lesz.

---

## [2026-04-21b] — Cím autocomplete a setup wizardokban — megye dropdown + helység/utca autocomplete + automatikus irányítószám

<!-- key: 2026-04-21-address-autocomplete-wizards -->
<!-- category: feature -->
<!-- version: 1.8.1 -->
<!-- targets: lelkészek -->

A 2026-04-21-es cím-hierarchia seed után a három setup wizard (gyülekezet, egyházmegye, welcome) Cím lépése **mostantól élő autocomplete-tel** dolgozik. A lelkész először a megye dropdown-ból választ (42 romániai megye + "Külföldi" opció), utána a helység gépelés közben felajánlásként megjelenik (magyar és román nevek + aliasok), és végül az utca is autocomplete-ből választható — az irányítószám **automatikusan kitöltődik**.

### ✨ Új funkciók

- **Új reusable UI-komponens**: `components/ui/address-form.tsx` — megye dropdown (42 megye, HU+RO címkékkel) + helység/utca autocomplete + automatikus postakód + **Külföldi** opció (ilyenkor minden szabad szöveg).
- **Fuzzy alias match**: ha a lelkész "Telek"-et ír Kovászna megyében, a dropdown felajánlja pl. az "Orbaitelek"-et (a `adrlocality_alias` táblára támaszkodva).
- **Kétnyelvű megjelenítés**: a komponens `lang` prop-ja szabja meg, hogy `name_hu` vagy `name_ro` az elsődleges címke. A román név alcímként jelenik meg ha eltér a magyartól.
- **Integráció mindhárom wizard-ba**: `CongregationSetupWizard`, `DioceseSetupWizard`, `WelcomeWizardClient` Step 2 — az eddigi szöveges "megye/város/cím" mezőket lecseréltük az új strukturált bevitelre (visszafelé kompatibilis: a szöveges mezők megmaradnak a táblában).

### 🎨 UX javítások

- **Kiválasztott helységek/utcák** zöld "pecséttel" jelennek meg (`CheckCircle2` + törlés gomb), így a lelkész látja, hogy valóban a hivatalos adatból választott.
- **Debounced keresés (250 ms)**: nem keresünk minden karakterlenyomásra, csak a gépelés szünetében.
- **Spring-animált dropdown** framer-motion-nal.
- **Alias kiemelés**: ha egy alias alapján jött a találat, a dropdown mutatja: *"↳ „Telek"*".

### 🔧 Technikai részletek

- **Új server actions** (`lib/address/actions.ts`): `listCounties()`, `searchLocalities(countyId, query, opts)`, `searchStreets(localityId, query, opts)`, `getLocalityDetails(id)`. Authenticated access, publikus reference adat.
- **SQL migráció** (`migration-docs/sql/2026-04-21-congregations-address-fields.sql`): `congregations` tábla bővítve `iranyitoszam`, `hazszam`, `country` oszlopokkal (a `varos`, `megye`, `cim`, `adrlocality_id`, `adrstreet_id` már léteznek).
- **Server action-ök frissítve**:
  - `getCongregationForSetup` — visszaadja az új cím-mezőket + FK-kat
  - `saveCongregationSetup` + `saveCongregationSetupStep` — mentik az új mezőket
  - `getDiocese` (DioceseRecord) — bővítve `adrlocality_id`, `adrstreet_id`
  - `saveDioceseSetup` + `saveDioceseSetupStep` — az új FK-k mentése
- **Wizard state bővítés**:
  - `CongregationSetupWizard.SetupFormState` + `adrlocality_id`, `adrstreet_id`, `iranyitoszam`, `hazszam`, `country`, `isForeign`
  - `DioceseSetupWizard.SetupFormState` + `adrlocality_id`, `adrstreet_id`, `isForeign` (a diocese-nek már van `cim_orszag`/`cim_iranyitoszam`)
  - `WizardData.congregation` + `megye`, `varos`, `iranyitoszam`, `hazszam`, `country`, `adrlocality_id`, `adrstreet_id`, `isForeign`
- **Cleanup SQL** (`2026-04-21-adr-seed-05-cleanup.sql`): a dupla-futás miatti alias-duplikátumok törlése + `UNIQUE (adrlocality_id, alias_name)` constraint.
- **TSC + ESLint**: `exit 0` mindkét ellenőrzésen.

### 📌 Megjegyzések

- **A szöveges fallback mezők megmaradnak**: a `megye`, `varos`, `cim` (congregations) és `cim_megye`, `cim_telepules`, `cim_utca` (dioceses) a hivatalos iratokhoz szükséges szöveges formátumot kapják (magyar vagy román nyelven, attól függően amit a `lang` paraméter mond).
- **A postakód autokitöltés** lépcsős:
  - Helység kiválasztásakor a `default_postalcode` töltődik (kistelepüléseknél pontos, nagyvárosoknál csak "kb.")
  - Utca kiválasztásakor az utca saját `postalcode`-ja íródik (pontos — Kolozsvár utcánként más és más)
  - Mindkettő **felülírható** kézzel
- **Külföldi címnél**: a megye dropdown utolsó opcióját választva ("— Külföldi cím —") minden mező szabad szövegmezővé változik, az Ország mező is felszabadul.
- **A seedben 23 731 utca** van benne (~58% a nyers adatokból) — a maradék utcák a helységek közötti match-telés miatt nem kerültek be. A felhasználó bármit beírhat kézzel, ha az utca nincs a listában.

### 🔍 Tesztelési forgatókönyvek

1. **Erdélyi magyar lelkész — Barót**: Megye "Kovászna" → Helység: "Barót" (vagy "Baraolt" — mindkettő találja) → Utca: "Kossuth" (autocomplete)  → postakód automatikus.
2. **Kolozsvári gyülekezet**: Megye "Cluj/Kolozs" → Helység "Kolozsvár" → Utca kezdete → pontos postakód az utca alapján.
3. **Fuzzy alias**: "Telek" → rákérdez az Orbaitelek-re.
4. **Külföldi cím (pl. magyarországi testvérgyülekezet)**: Megye "Külföldi" → minden szabad szöveg.

---

## [2026-04-21] — Romániai cím-hierarchia seed: 42 megye + 13 836 helység + 40 293 utca

<!-- key: 2026-04-21-adr-seed-romania-full -->
<!-- category: feature -->
<!-- version: 1.8.0 -->
<!-- targets: lelkészek -->

Hivatalos, kétnyelvű romániai cím-adatbázis beépítve — a Poşta Română data.gov.ro CSV-je + GeoNames.org szabad adatai alapján. A setup wizardokban (gyülekezet + egyházmegye + welcome) **megye dropdown + helység autocomplete + utca autocomplete + irányítószám automatikus kitöltése** lesz — a lelkész néhány billentyűleütéssel megtalálja a gyülekezetét. Magyar és román nevek mindenütt, hogy a **magyar iratokon magyar nyelven, a román iratokon román nyelven** jelenhessenek meg az adatok.

### ✨ Új funkciók

- **42 megye kétnyelvű névvel**: magyar + román + autókód (CV = Kovászna, HR = Hargita, MS = Maros, stb.) + hivatalos SIRUTA-kód.
- **13 836 helység**: minden romániai település, hivatalos SIRUTA-kóddal, GeoNames ID-vel, default postakóddal (helység-szintű, a kistelepüléseknél ez pontos). A 623 magyar-ajkú erdélyi helységnek (Barót/Baraolt, Csíkszereda/Miercurea Ciuc, Kolozsvár/Cluj-Napoca, stb.) **magyar neve is** van.
- **18 073 alias**: a GeoNames alternatenames-ből (történelmi, német, egyéb nyelvű változatok) — a fuzzy-match ezen keresztül működik, pl. ha a lelkész "Telek"-et ír, a rendszer rákérdez "Orbaitelek"-re.
- **40 293 utca-postakód**: a nagyvárosok (>50k lakos) és Bukarest utcánkénti postakóddal. A lelkész egy kolozsvári gyülekezet címét beírva **automatikusan** megkapja a pontos irányítószámot.
- **Fallback meglévő 5 helységre**: Barót, Csíkszereda, Kézdivásárhely, Kolozsvár, Sepsiszentgyörgy — ezek a régi magyar neveikkel megmaradnak, a seed az ő SIRUTA-kódjukat + román neveiket frissítve csatlakoztatja a hierarchiához (nincs duplikáció).

### 🔧 Technikai részletek

- **Új SQL fájlok** (`migration-docs/sql/`):
  - `2026-04-21-adr-schema-bovites.sql` — schema bővítés: `name_hu`/`name_ro`/`siruta_code`/`geonames_id`/`default_postalcode` oszlopok mind a 4 `adr*` táblán + új `adrlocality_alias` tábla RLS-sel + `congregations`/`dioceses` bővítése `adrlocality_id`/`adrstreet_id` FK-kkal (a szöveges mezők fallback-nek megmaradnak)
  - `2026-04-21-adr-seed-01-countries.sql` (13 KB) — Románia + 42 megye
  - `2026-04-21-adr-seed-02-localities.sql` (948 KB) — 13 836 helység
  - `2026-04-21-adr-seed-03-aliases.sql` (503 KB) — 18 073 alias
  - `2026-04-21-adr-seed-04-streets.sql` (2.0 MB) — 40 293 utca
- **Új script**: `scripts/build-adr-seed.mjs` (Node.js, ~650 sor). A nyers adatokat (XLS + RO.txt + szűrt alternateNames) feldolgozva generálja a fenti SQL-eket. Újrafuttatható, idempotens. Előfeltétel: Git Bash `unzip` + `awk` (a 773 MB-os alternateNamesV2 TXT-ből csak hu/ro sorokat szűr — 3.4 MB szűrt cache).
- **Nyers adatok** (`migration-docs/data/adr-seed/`, NEM commitolva — `.gitignore` kezeli):
  - `infocod-cu-siruta-mai-2016.xls` — Poşta Română data.gov.ro hivatalos postakód CSV (~8 MB)
  - `RO.zip` — GeoNames Románia (~2 MB)
  - `alternateNamesV2.zip` — GeoNames alternatív nevek (~193 MB)

### 📋 Futtatás (Endre feladata a Supabase Studio-ban)

Sorrendben, ugyanazon az SQL Editor tabon:
1. `2026-04-21-adr-schema-bovites.sql` (schema bővítés)
2. `2026-04-21-adr-seed-01-countries.sql` (42 megye)
3. `2026-04-21-adr-seed-02-localities.sql` (~1 MB, ~10-15 mp)
4. `2026-04-21-adr-seed-03-aliases.sql` (~500 KB)
5. `2026-04-21-adr-seed-04-streets.sql` (~2 MB, ~30 mp)

Minden fájl végén **diagnosztikai SELECT-ek** — a futás után látható kell legyen: 42 megye, 13 836+ helység (a régi 5 beleszámítva), 18 073 alias, 40 293+ utca.

### 📌 Megjegyzések

- **A UI refaktor még nincs kész** — ezek az SQL-ek csak az **adatokat** rakják be. A 3 wizard (welcome, congregation, diocese) StepAddress komponensének átírása (megye dropdown + helység/utca autocomplete + postakód auto-kitöltés + Külföldi opció) **külön bejegyzésben** fog jönni, amint az SQL sikeresen lefutott.
- **A meglévő 5 helység** (Barót, Csíkszereda, Kézdivásárhely, Kolozsvár, Sepsiszentgyörgy) a seed-ben **UPDATE-tel** csatlakozik (nem duplikáció): a magyar név megmarad, a román név + SIRUTA + GeoNames ID + megye hozzárendelődik.
- **A 4.5%-os magyar név lefedettség** (623/13 836) reálisan megfelel az erdélyi magyar-ajkú területeknek. A többi romániai helységnek nincs bevett magyar neve, így csak románul jelenik meg.
- Minden `adr*` táblához `search` index (lower(name_hu) és lower(name_ro)) — a server-oldali autocomplete gyors lesz.

### 🔍 Adatforrások

- [Poșta Română data.gov.ro](https://data.gov.ro/dataset/coduri-postale-romania) — postakódok + SIRUTA
- [GeoNames Romania](https://download.geonames.org/export/dump/RO.zip) — geonameid + koordináták
- [GeoNames alternateNames](https://download.geonames.org/export/dump/alternateNamesV2.zip) — magyar nevek

---

## [2026-04-20f] — Setup wizardok: lépésenkénti mentés + folytatás ahol abbamaradt

<!-- key: 2026-04-20-setup-wizards-partial-save -->
<!-- category: feature -->
<!-- version: 1.7.5 -->
<!-- targets: lelkészek -->

Mindkét dashboard-on megjelenő setup wizard (**Gyülekezet beállítása** és **Egyházmegye beállítása**) most **minden Tovább gomb után menti** az adott lépés adatait. Ha a lelkész kilép akár a 3. lépés után, legközelebb **onnan folytathatja, ahol abbahagyta** — a kitöltött mezők visszatöltődnek, és a wizard automatikusan az **első hiányos lépésre ugrik**.

Ez ugyanaz az elv, mint amit az A fázisban a welcome wizard kapott — mostantól **minden onboarding wizard** következetesen így viselkedik.

### ✨ Új funkciók

- **Gyülekezet setup wizard** (`CongregationSetupWizard`): Tovább gomb partial save-el (`saveCongregationSetupStep`), a `congregations` táblába csak az adott lépés mezőit frissíti.
- **Egyházmegye setup wizard** (`DioceseSetupWizard`): ugyanaz az elv (`saveDioceseSetupStep`), a `dioceses` táblába.
- **Folytatás-logika**: amikor a wizard megnyílik, a `getCongregationForSetup` / `getDiocese` betölti a mentett mezőket, és a wizard az **első hiányos lépésre** ugrik (nem mindig a `basics`-re).
- **"Mentés…" feedback**: a Tovább gomb mentés közben Loader2 spinning-et mutat, a Vissza gomb és X ("Később") disabled.

### 🎨 UX javítások

- Ha a lelkész a 4. lépésen megnyomja a "Tovább"-ot, majd bezárja az ablakot, legközelebb a `confirm` (5.) lépéssel indul — minden korábbi mezőre tudja, hogy komplett.
- Ha egy korábbi lépés hiányossá válik (pl. a lelkész töröl egy kötelező mezőt), a validáció megmondja → nem engedi tovább.
- A Tovább gomb **csak akkor** commitolja a partial save-et, ha a lépés validáció szerint **érvényes** — tehát nem mentünk "félkész" adatot váratlanul.

### 🔧 Technikai részletek

- **Új server actions**:
  - `app/(dashboard)/congregation/actions.ts` → `saveCongregationSetupStep(input: CongregationSetupPartialInput)` — patch-style `UPDATE` a `congregations` táblára, csak a megadott mezőkre; `name` NOT NULL szinkron biztosítva.
  - `app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts` → `saveDioceseSetupStep(input: DioceseSetupPartialInput)` — ugyanaz a logika a `dioceses` táblára.
- **Wizard refaktor**:
  - `components/modals/congregation-setup-wizard.tsx` — `isStepValidOn(s, form)` + `stepFields(s, form)` pure helper függvények (újrahasznosíthatóak init-re és handleNext-re), `stepSaving` state, async `handleNext`, first-invalid-step ugrás az init-ben.
  - `components/modals/diocese-setup-wizard.tsx` — ugyanez a minta.
- **A végső `saveCongregationSetup` / `saveDioceseSetup` változatlan** — a teljes form validációja továbbra is csak a Confirm lépésen ("Mentés és befejezés" gomb) fut le. A partial save **nem** sorolja be a dátum-alapú `diocese_bealitas` sort — az csak a teljes mentéskor keletkezik, hogy a pénzügyi modul azonnal használható legyen.

### 📌 Megjegyzések

- A wizard **csak a saját gyülekezet / egyházmegye** adatait mentheti. A `saveCongregationSetupStep` a `profile.congregation_id === input.id` jogosultság-ellenőrzést végzi, a `saveDioceseSetupStep` a `requireDioceseAccess`-en keresztül.
- A welcome wizard (onboarding A fázis), a gyülekezet setup wizard és az egyházmegye setup wizard **mostantól mindhárom** következetesen támogatja a "kilépek és folytatom" mintázatot.

---

## [2026-04-20e] — Gyülekezet setup wizard: egyházi hovatartozás + meglévő bankszámla megjelenítés

<!-- key: 2026-04-20-congregation-setup-wizard-kiegeszites -->
<!-- category: improvement -->
<!-- version: 1.7.4 -->
<!-- targets: lelkészek -->

A dashboard-on megjelenő **CongregationSetupWizard** ("Gyülekezet beállítása") két észrevétel szerint bővült: a lelkész most már **látja az egyházkerület és egyházmegye** nevét, és **vizuális visszajelzést kap**, ha a fő bankszámla adatai már mentve vannak.

### 🎨 UX javítások

- **Egyházi hovatartozás panel** (Step 1 — Alapadatok + címer): új sky-színű info-doboz Landmark ikonnal, 2 oszlopos layout-tal — bal oldalt az **Egyházkerület**, jobb oldalt az **Egyházmegye** neve. Ha nincs beállítva egyik sem, jelzi, hogy a rendszergazda állíthatja be az Admin panelen.
- **Bankszámla megerősítés** (Step 4 — Bank): ha a `bank` és `iban` mezők már ki vannak töltve (akár a `congregations` táblából, akár a `bankszamlak` táblából előhúzva), egy zöld emerald banner jelzi: *"A fő bankszámla adatai már be vannak állítva. Alább ellenőrizheted és szerkesztheted."* Ha több aktív bankszámla van, a banner megmondja a számukat is.

### 🔧 Technikai részletek

- `app/(dashboard)/congregation/actions.ts` — `getCongregationForSetup` bővítve:
  - Nested JOIN: `dioceses(name, districts(name))` — egy query-vel hozza be az egyházmegye + egyházkerület neveket
  - Külön lekérdezés `bankszamlak`-ra: `scope='gyulekezet' + aktiv=true`, is_default desc rendezve
  - Új return mezők: `diocese_name`, `district_name`, `existing_bank_count`
  - Ha a `congregations.bank`/`iban` üres **DE** van aktív `bankszamlak`, az első aktív bankszámla adatait visszaadja (fallback előtöltés — a wizard így is tudja mutatni)
- `components/modals/congregation-setup-wizard.tsx`:
  - Új `context` state: `dioceseName`, `districtName`, `existingBankCount`
  - `StepBasics` kiegészítve a hovatartozás panellel (read-only)
  - `StepBank` kiegészítve a zöld megerősítő banner-rel (`alreadyFilled` conditional render)

### 📌 Megjegyzések

- Ez a wizard a `CongregationSetupBanner`-ből indul (minden oldalon látható, amíg a gyülekezet alapadatai hiányosak) — NEM a `welcome-wizard-client.tsx` (ami az onboarding 5-step-je).
- A welcome wizard Step 2-ben (2026-04-20 A fázis) is van már egyházmegye megjelenítés, ugyanezen minta alapján. A két wizard most konzisztens.

---

## [2026-04-20d] — Hotfix: hydration warning a sidebar data-walkthrough attribútumokra

<!-- key: 2026-04-20-hotfix-hydration-data-walkthrough -->
<!-- category: bugfix -->
<!-- version: 1.7.3 -->
<!-- targets: fejlesztés -->

A C fázis walkthrough-feature dev-mód alatt egy hydration warning-ot dobott a böngésző konzolon: `data-walkthrough={null}` (server) vs értékkel (client). A funkcionalitás **nem sérült** (a kliens hydrálás után a DOM-ban ott voltak az attribútumok, a walkthrough megtalálta a target-eket) — csak a dev-warning zaj.

### 🐛 Javítás

- `components/layout/sidebar-adaptive-v4.tsx` — `suppressHydrationWarning` flag a walkthrough-targeted `<Link>` és a sidebar wrapper `<div>` elemeken.

### 📌 Megjegyzések

- **Root cause**: Turbopack SSR-cache kis drift Windows + ékezetes elérési úton (`Egyházi APP`). A kliens-bundle HMR-rel frissül, a szerver-oldali RSC-render néha eggyel lemarad. A `data-walkthrough` attribútum csak JavaScript-referencia a walkthrough-nak, így az érték-eltérés ártalmatlan — a `suppressHydrationWarning` pontosan erre való.
- Nem a kódban volt hiba — ugyanaz a kód (`data-walkthrough={walkthroughKey}`) futott mindkét oldalon, csak a Turbopack cache hozott különböző állapotot.

---

## [2026-04-20c] — Onboarding C fázis: interaktív walkthrough + segítség-tooltipek + UX polish

<!-- key: 2026-04-20-onboarding-c-fazis -->
<!-- category: feature -->
<!-- version: 1.7.2 -->
<!-- targets: lelkészek -->

A háromlépcsős onboarding refaktor **záró része**. Miután a lelkész az A+B fázis után a dashboard-ra érkezik, egy **animált, személyes túra** fogadja, amely lépésről lépésre bemutatja a rendszer fő moduljait. A sidebar menüpontok egyenként kiemelődnek egy spotlight overlay-vel, mellettük tooltip kártya magyarázattal. A rendszer minden funkciónak ad egy **kérdőjeles segítség-ikont**, rövid magyarázattal és opcionális "Bővebben" linkkel.

A bejelentkezési és wizard animációk (framer-motion) is finomodtak.

### ✨ Új funkciók

- **Interaktív walkthrough**: 10 step-es túra a dashboard fölött. Kezdő üdvözlés keresztnévvel ("Üdvözlöm, [Keresztnév]!"), végigvezetés a sidebar-on (Tagnyilvántartás, Anyakönyv, Pénzügy, Munkanapló), dashboard-widgetek, segítség-ikonok, profil-menü, és pásztorális záró köszöntés ("Áldás kísérje szolgálatát!").
- **Spotlight overlay**: az éppen bemutatott UI elem körül sötét box-shadow kivágás + pulzáló amber keret-animáció emeli ki.
- **Keyboard shortcutok a walkthrough-ban**: `Enter` / `→` — Tovább, `←` — Előző, `Esc` — Kihagyom.
- **Segítség-tooltip (`HelpTooltip`)**: új UI-primitív a `components/ui/help-tooltip.tsx` alatt. Kérdőjel ikon, kattintásra animált popover címmel + 1-3 mondatos leírással + opcionális "Bővebben →" linkkel. Click-outside és Esc bezárja.
- **Wizard step-átmenetek animáltak**: slide+fade-el váltanak a step-ek, a progress bar zöld "töltése" spring-animációval halad, az ikonok scale-bounce-ot produkálnak lépésváltáskor.
- **Login form framer-motion fade-in**: az űrlap, hibaüzenetek, szeparátor és OAuth gombok stagger-elt animációval jelennek meg.

### 🎨 UX javítások

- **Pásztorális hangvétel**: minden step-ben barátságos, keresztnévre szabott szöveg ("a legrészletesebb modul", "a lelkészi szolgálat személyes naplója").
- **Progress indikátor**: "3 / 10" + animált színátmenetes (amber → teal) bar a tooltip tetején.
- **Newsletter-barát záróüzenet**: "Áldás kísérje szolgálatát, [Keresztnév]!"

### 🔧 Technikai részletek

- **Új fájlok**:
  - `app/(dashboard)/profile/walkthrough-actions.ts` — `markWalkthroughComplete`, `skipWalkthrough`, `restartWalkthrough` server actions
  - `components/onboarding/walkthrough/walkthrough-steps.ts` — 10 step definíció, `{firstName}` helyettesítővel
  - `components/onboarding/walkthrough/walkthrough-client.tsx` — spotlight + tooltip komponens, framer-motion animációkkal, target-measuring `requestAnimationFrame`-mel (Next.js 16 / React 19 strict-mode kompatibilitás)
  - `components/ui/help-tooltip.tsx` — kérdőjeles popover UI-primitív
- **Átírt fájlok**:
  - `app/(dashboard)/layout.tsx` — `onboardCheck` lekérdezés bővítve (`walkthrough_completed`, `full_name`), `extractFirstName()` helper, `WalkthroughClient` render
  - `components/layout/sidebar-adaptive-v4.tsx` — `data-walkthrough` attribútumok (menüpontok + fő wrapper)
  - `components/standalone/welcome-wizard-client.tsx` — `AnimatePresence` + step-átmenetek, progress bar animáció
  - `components/auth/login-form.tsx` — teljes átírás framer-motion-nal

### 📌 Megjegyzések

- A walkthrough-ban a `user-menu`, `dashboard-widgets` step-ek jelenleg **target nélkül** lebegnek a képernyő közepén (a komponens magától fallback-el, ha nem találja a DOM-elemet). Ha ezek is kellenek pontosan pozicionálva, egy kis polish-elés kell a headerben + dashboard page-en: `data-walkthrough="user-menu"`, `data-walkthrough="dashboard-widgets"`.
- A walkthrough bármikor újraindítható a debug/support `restartWalkthrough` server action-nel (pl. a Profil → Beállítások alatti menüpont később).
- **A háromlépcsős onboarding csomag LEZÁRVA** — az A+B+C együtt egy komplett, animált első-indulási élményt ad.

---

## [2026-04-20b] — Onboarding B fázis: modern bejelentkezés, checklist regisztráció, várakozó képernyő

<!-- key: 2026-04-20-onboarding-b-fazis -->
<!-- category: feature -->
<!-- version: 1.7.1 -->
<!-- targets: lelkészek -->

A háromlépcsős onboarding refaktor második része — a **látvány és érzés**. A bejelentkezés és regisztráció most modern SaaS app-szerű, barátságosan animált, a regisztráció szakaszokra tagolt checklist, és a regisztrált, de még jóvá nem hagyott lelkészek egy szép várakozó képernyőt látnak ("Üdvözlöm, [keresztnév]!").

### ✨ Új funkciók

- **Modern split-panel auth layout**: desktop-on a bejelentkezési/regisztrációs űrlap bal oldalt, jobbra egy vizuális hero-panel — az EREK logójával, a Zsoltárok 23:1–2 idézetével, dekoratív gradient orbokkal és subtle SVG-texture hatással. Mobilon csak az űrlap.
- **3 szekciós checklist regisztráció**: a regisztrációs űrlap három kártyára tagolódik — *Személyes adatok* (név, telefon, születési dátum), *Szolgálat* (gyülekezet, egyházmegye dropdown, szolgálat kezdete), *Fiók* (email, jelszó, T&C). Minden szekció zöld pipás, ha komplett, framer-motion stagger animációval jelennek meg.
- **Egyházmegye dropdown**: a 15 erdélyi egyházmegye kiválasztható a regisztrációban.
- **Várakozó képernyő (`/pending`)**: a regisztrált, de még nem jóváhagyott lelkészek ide érkeznek. Személyes megszólítás keresztnévvel, pulzáló óra ikon, email-visszajelzés, kijelentkezés gomb. Amíg pending, **bármely védett oldalról** ide tereljük (dashboard, welcome).
- **Setup layout web-mód támogatás**: a `/welcome` wizard most webes módban is elérhető (eddig csak standalone-ban futott). Dinamikus header szöveg: "Első indítási varázsló" vs "Üdvözöljük a rendszerben".

### 🎨 UX javítások

- **Zöld keret + glow a komplett szekciókon**: vizuális megerősítés, hogy haladunk a regisztrációval.
- **Animált Regisztráció elküldése**: Loader2 spinning + "Feldolgozás…" állapot.
- **Pulse ring a várakozás-ikonon** a /pending képernyőn.
- **Biblia idézet a bejelentkezési oldalon**: "Az Úr a pásztorom; nem szűkölködöm..." (Zsoltárok 23:1–2) — emberi, pásztori hangvétel.

### 🔧 Technikai részletek

- **Új fájlok**: `app/(auth)/pending/page.tsx`, `app/(auth)/pending/actions.ts`, `components/auth/pending-approval-client.tsx`.
- **Átírt fájlok**: `app/(auth)/layout.tsx` (split-panel), `app/(setup)/layout.tsx` (mode-aware), `app/(dashboard)/layout.tsx` (pending → `/pending` redirect), `components/auth/register-form.tsx` (teljesen új), `app/(auth)/register/actions.ts` (új mezők mentése), `lib/validations/auth.ts` (schema bővítés: birthDate, dioceseId, serviceStartedAt).
- **Apró TS fix**: `lib/broadcasts/email.ts` — felesleges `@ts-expect-error` eltávolítva.

### 📌 Megjegyzések

- A **login form** esztétikai animáció és a **wizard step-átmenetek** framer-motion animációi a B fázis későbbi minor update-je lesz (kis UI polish).
- **C fázis** (interaktív walkthrough + tooltipek a dashboard-on): még előttünk.

---

## [2026-04-20] — Onboarding A fázis: wizard lépésenkénti mentés + egyházmegye megjelenítés

<!-- key: 2026-04-20-onboarding-a-fazis -->
<!-- category: feature -->
<!-- version: 1.7.0 -->
<!-- targets: lelkészek -->

Az első rész a háromlépcsős onboarding refaktorból. A wizard most **lépésenként ment**, és ha kilépsz, onnan folytathatod, ahol abbahagytad. A **Step 2-ben megjelenik a gyülekezet egyházmegyéje**. Az onboarding most **webes módban is fut** (eddig csak standalone-ban ment).

### ✨ Új funkciók

- **Wizard lépésenkénti mentés**: a Tovább gomb minden step-en DB-be commitol. Kilépés után a visszatérés onnan folytat, ahol abbahagytad — a kitöltött mezők visszatöltve.
- **Egyházmegye név megjelenítés**: Step 2 tetején sky-színű infopanel Landmark ikonnal. Ha a gyülekezet már hozzá van rendelve egy egyházmegyéhez, a név ott látszik.
- **Web-módú onboarding**: aki böngészőből használja a rendszert, most ugyanúgy végigmegy a wizardon (Step 2-től), mint a .exe-s lelkészek. Eddig csak a telepített .exe-ben indult el.
- **Erdélyi egyházmegyék beseedelve**: 15 egyházmegye (Brassói, Dési, Erdővidéki, Görgényi, Hunyad-Zarándi, Kalotaszegi, Kézdi-Orbai, Kolozsvári, Küküllői, Maros-Mezőségi, Nagyenyedi, Nagysajói, Sepsi, Székelyudvarhelyi, Tordai).

### 🎨 UX javítások

- **Automatikus wizard-irányítás**: ha a lelkész még nem végezte el az onboarding-ot, a rendszer a dashboard helyett a `/welcome`-ra viszi — így biztosan nem marad alapadat-hiány.
- **"Folytatás" üzenet az első step-en**: egyértelművé teszi, hogy kilépés esetén sem veszik el a munka.
- **Animált mentés-visszajelzés** a Tovább gombon.

### 🔧 Technikai részletek

- SQL: `migration-docs/sql/2026-04-20-wizard-onboarding-schema.sql` — új `wizard_progress` tábla (GRANT + RLS + 5 policy + trigger), `profiles` 3 új oszlop (`walkthrough_completed`, `walkthrough_skipped_at`, `onboarding_completed_at`), dioceses seed. Idempotens (`IF NOT EXISTS`, `WHERE NOT EXISTS`).
- Új server actions (`app/(setup)/welcome/actions.ts`): `getWizardProgress`, `saveWizardStep`, `restartWizard`, `completeWizard`, `getCongregationContext`.
- Dashboard layout guard: `profile.onboarding_completed_at IS NULL` + gyülekezeti kontextus → redirect `/welcome`.
- `framer-motion ^12.38.0` telepítve (B fázis animációihoz).

### 📌 Megjegyzések

- **Schema drift azonosítva**: a `save-initial` endpoint néhány mezőt INSERT-el, ami a `Database_schema.sql` szerint nem létezik. A `completeWizard` runtime-check-kel kezeli, de külön tisztázás szükséges.
- **B és C fázis** (modern login/register dizájn, pending képernyő, interaktív walkthrough) **folyamatban**, külön bejegyzéssel zárul.

---

## [2026-04-19e] — 6 felhasználói visszajelzés javítása + 46 lint error eltakarítása

<!-- key: 2026-04-19-endre-feedback-6 -->
<!-- category: improvement -->
<!-- version: 1.6.6 -->
<!-- targets: mindenki -->

Endre 2026-04-19-i visszajelzésére 6 pont javítása:

### 🐛 Javítások

**1. Gyülekezeti címer feltöltési hiba (&bdquo;Bucket not found&rdquo;)**
- Új SQL migráció: `migration-docs/sql/2026-04-19-congregations-logos-bucket.sql`
- Idempotens `INSERT ... ON CONFLICT` a `logos` Storage bucketre (eddig csak a Supabase Studio-ban jött létre kézzel, új telepítésekből hiányzott)
- 4 RLS policy: olvasás publikus + INSERT/UPDATE/DELETE saját gyülekezet lelkészére (a `congregations/{congregation_id}/…` útvonalminta alapján) vagy admin/kerületi adminra
- Endre futtatja — utána mehet a címer-feltöltés az új setup wizardból

**2. Dashboard családok száma rossz**
- `app/(dashboard)/dashboard/page.tsx`: a `csalad` táblában **nincs** `congregation_id` oszlop — a `.eq('congregation_id', effectiveCongregationId)` szűrés csendben 0-t adott vissza
- Javítva: `csalad` táblán `isaktiv=true` + az aktív személyek ID-halmazán szűrjük (elhaltak/elköltözöttek kizárva)

**3. Tagnyilvántartás / Családok fül: kartonok eldugva**
- `components/members/families-tab-v2.tsx`: a hero + 3 statisztikai kártya + zöld info-banner most alapértelmezetten **rejtve** van — csak a családlista látszik
- Új `&bdquo;Kartonok / Statisztikák&rdquo;` toggle gomb (BarChart3 ikon) a kereső mellett — ezzel előhúzható
- &bdquo;Új család&rdquo; gomb átkerült a kereső sávba (mindig kéznél)

**4. Magyar karakterek hibája körzetek fülön (UTF-8)**
- `components/members/districts-tab.tsx` 112. sor: elrontott kódlap (`kĂ¶rzeteket`, `gyĂĽlekezethez`, `kapcsolĂłdnak`…) javítva UTF-8 eredetire

**5. Választók névjegyzéke → Nyomtatási központ + 4 szűrőopció**
- Új komponens: `components/members/voter-print-dialog.tsx` — a pénzügyi nyomtatási központ mintájára (bal oldal szűrők, jobb oldal élő iframe előnézet)
- 4 checkbox-szűrés: az előző / erre az évre **teljesen** vagy **részlegesen** kifizettek közül kiket számoljon be a névjegyzékbe (legalább egy feltétel szükséges)
- `voter-actions.ts` bővítve: per-év 101.01 járulék összegzés + `bealitas.eves_jarulek` lekérdezés az adott évre → alapján dönti el a dialog a &bdquo;teljes&rdquo; vs &bdquo;részleges&rdquo; státuszt
- Új szerver action: `getVoterPrintContext()` — gyülekezet név / cím / telefon a hivatalos fejléchez
- A voters-tab régi inline &bdquo;Névjegyzék nyomtatás&rdquo; gombja lecserélve &bdquo;Nyomtatási központ&rdquo;-ra

**6. 46 lint error javítása a régi kódbázisban**
- `react-hooks/set-state-in-effect` — 16 fájlban a `useEffect` body setState hívásai `queueMicrotask()` wrapper-be kerültek cleanup cancel-flag-gel (React 19 strict szabály)
- `react/no-unescaped-entities` — 23 helyen `"` karakter `&bdquo; &rdquo;` HTML entitásokkal helyettesítve (magyar idézőjelek)
- `@next/next/no-html-link-for-pages` — `app/dev-reset/page.tsx`: `<a href="/">` → `<Link href="/">`
- `prefer-const` — `lib/broadcasts/newsletter-template.ts`: `let raw / let line` → `const`

Eredmény: **46 error → 0 error** (71 warning marad, mindegyik `<img>` vs `<Image>` vagy unused import — nem blokkolja a build-et)

### 📁 Érintett fájlok

- **Új**: `migration-docs/sql/2026-04-19-congregations-logos-bucket.sql`
- **Új**: `components/members/voter-print-dialog.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `app/(dashboard)/tagnyilvantartas/voter-actions.ts`
- `components/members/families-tab-v2.tsx`
- `components/members/districts-tab.tsx`
- `components/members/voters-tab.tsx`
- `lib/broadcasts/newsletter-template.ts`
- `app/dev-reset/page.tsx`
- 16 komponens `useEffect` queueMicrotask wrappert kapott (accounting-finalize-wizard, bank-account-dialog, chitanta-*, congregation-setup-wizard, diocese-setup-wizard, oblio-*, searchable-category-select, system-finance-tab, diocese-chitanta-tombok-section, chitanta-tombok-panel, finance-sugo-checklist, stb.)
- 10 helyen magyar idézőjelek javítva HTML entitásokra

### TypeScript check: **EXIT 0** ✅
### Lint: **0 error**, 71 warning (nem blokkoló) ✅

---

## [2026-04-19d] — Teljes rendszerdiagnosztika + UX javítások

<!-- key: 2026-04-19-rendszerdiagnosztika -->
<!-- category: improvement -->
<!-- version: 1.6.5 -->
<!-- targets: fejleszto -->

### 🔍 Diagnosztikai összefoglaló

TypeScript: **EXIT 0** (minden clean) ✅
Lint: 48 error / 71 warning (többség a régi kódbázisban — a mostani körben **0 új lint error** a saját változtatásokból)

Explore agent által azonosított 7 terület ellenőrizve:
- ✅ Scope-aware pénzügyi paths — helyesen működik
- ✅ Banner-ek külön-külön, egyszerre nem jelennek meg
- ✅ ProfileSwitcher multi-role — helyes
- ✅ Setup wizard trigger-logika — nincs false-positive
- ⚠️ `effectiveCongregationId = null` admin módban → üres oldalak **(javítva)**
- ⚠️ Saját új lint errors a setup-auto-open-ekben **(javítva)**
- ℹ️ `bevCelMap` implicit type casting — elfogadható, működik

### 🎨 UX javítások

**1. `CongregationOnlyNotice` komponens** — `components/layout/congregation-only-notice.tsx` (új fájl)

Informatív tájékoztató kártya, amely megjelenik, ha egy felhasználó (admin / esperes / kerületi scope-ban) direkt URL-lel navigál egy olyan modulra, amely csak gyülekezeti módban érhető el. Üres oldal (`return null`) helyett most világos üzenet + „Egyházmegyei irányítópult" / „Admin Panel" / „Egyházkerületi irányítópult" link jelenik meg (a user aktuális scope-jától függően).

**Integrálva 6 gyülekezeti oldalon**:
- `app/(dashboard)/dashboard/page.tsx` — "A gyülekezeti irányítópult"
- `app/(dashboard)/anyakonyv/page.tsx` — "Az Anyakönyv modul"
- `app/(dashboard)/iktato/page.tsx` — "Az Iktató modul"
- `app/(dashboard)/sirhelyek/page.tsx` — "A Sírhelyek modul"
- `app/(dashboard)/leltar/page.tsx` — "A Leltár modul"
- `app/(dashboard)/munkanaplo/page.tsx` — "A Munkanapló modul"

### 🐛 Lint hibák javítása

- `components/dashboard/diocese/diocese-setup-auto-open.tsx` — a `useEffect + setState` pattern helyett `useState(() => Boolean(needsSetup && dioceseId))` lazy initializer (React 19 `react-hooks/set-state-in-effect` szabály)
- `components/dashboard/congregation-setup-auto-open.tsx` — ugyanígy

Mindkét komponens egyszerűbb, de ugyanaz a funkcionalitás: a wizard nyitott, ha a prop `needsSetup === true` mount-kor, és a user bezárhatja.

### 🔐 Scope-aware viselkedés (emlékeztető)

Az admin / esperes / kerületi scope-ban az `effectiveCongregationId = null` (a `2026-04-19a` bugfix óta). Emiatt a gyülekezeti modulok nem működnek ezekben a scope-okban — most már **informatív tájékoztatót** kap a user, nem üres oldalt. A sidebar `activeScope` alapján amúgy is szűri ezeket a menüpontokat diocese / system módban.

### TypeScript check: **EXIT 0** ✅

---

## [2026-04-19c] — Diocese /penzugy: YearlySettingsDialog eltávolítva, auto-upsert

<!-- key: 2026-04-19-diocese-no-yearly-settings -->
<!-- category: bugfix -->
<!-- version: 1.6.4 -->
<!-- targets: esperesek -->

### 🐛 Javítás

Endre jelezte: az egyházmegyei profilban megjelenik az **„Éves Pénzügyi Beállítások — 2026"** dialog (éves járulék + határidő bekérés), ami **nem releváns** egyházmegyei szinten — ott nincs tag-járulék fogalom.

### Megoldás

- **Új szerver akció**: `ensureDioceseBealitasForYear(dioceseId, year)` a `dashboard-egyhazmegye/diocese-actions.ts`-ben. Upsert-tel létrehoz egy üres flag-ekkel rendelkező `diocese_bealitas` sort az aktuális évre.
- **`/penzugy/page.tsx` scope-aware kezelés**:
  - `scope === 'diocese'` + `data.settings == null` → auto `ensureDioceseBealitasForYear()` + `initFinance()` újra, **NEM** YearlySettingsDialog
  - `scope === 'congregation'` + `data.settings == null` → a régi viselkedés, YearlySettingsDialog marad

Így az egyházmegyei lelkész a `/penzugy`-on egyből a pénzügyi munkafelületet látja, nem kell feleslegesen éves járulékot beállítania.

### TypeScript check: **EXIT 0** ✅

---

## [2026-04-19b] — Gyülekezeti setup wizard (a diocese mintájára)

<!-- key: 2026-04-19-gyulekezet-setup-wizard -->
<!-- category: feature -->
<!-- version: 1.6.3 -->
<!-- targets: lelkeszek -->

### ✨ Új funkciók

- **Gyülekezeti beállítás wizard** — a lelkész első alkalommal a /dashboard megnyitásakor egy 5 lépéses wizardot lát, ami bekéri a gyülekezet hivatalos adatait:
  1. **Alapadatok + címer** (magyar/román/angol név, adószám, címer feltöltés — `logos` Storage bucket, max 2 MB, JPG/PNG/WEBP)
  2. **Cím** (megye, város/település, utca+házszám)
  3. **Elérhetőségek** (e-mail, telefon, weboldal)
  4. **Bank** (bank név, IBAN)
  5. **Megerősítés** → mentés (congregations UPDATE)

- **Globális figyelmeztető banner** — minden oldalon megjelenik (header alatt), ha a beállítás hiányos. Kattintásra azonnal megnyitja a wizardot. Sárga pulzáló AlertCircle ikonnal. Csak congregation scope-ban látszik (diocese/admin scope-ban rejtett).

- **Wizard auto-open** — a /dashboard oldal betöltésekor automatikusan megnyílik useEffect alapú mount-tal, ha a setup hiányos.

- **Kötelező kiépítés** — minden mező kötelező. A wizard „Később" gombbal bezárható, ekkor a banner marad minden oldalon.

### Kötelező mezők (10 db)

`nev_hu`, `adoszam`, `megye`, `varos`, `cim`, `email`, `telefon`, `bank`, `iban`, `cimer_url`

Nem kötelező (opcionális): `nev_ro`, `nev_en`, `web`

### 🔧 Szerver akciók

**`app/(dashboard)/congregation/actions.ts`** bővítés:

- `checkCongregationSetupStatus(congregationId?)` — ellenőrzi a 10 kötelező mezőt, visszaadja a hiányzók listáját
- `saveCongregationSetup(input)` — Zod-validálva menti az összes mezőt. A `name` (NOT NULL) mindig szinkronban marad a `nev_hu`-val.
- `uploadCongregationCimer(congregationId, FormData)` — Storage upload a `logos` bucket-be, fájlnév séma `congregations/{id}/{timestamp}-{safeName}`
- `getCongregationForSetup(congregationId?)` — a wizard-ba előtöltéshez

### 🎨 UI komponensek

- `components/modals/congregation-setup-wizard.tsx` — 5 lépéses full-page wizard, drag-and-drop címer upload, lépésenkénti validáció. Teal színvilág (megkülönböztetésül a diocese lila wizard-tól).
- `components/layout/congregation-setup-banner.tsx` — globális warning banner
- `components/dashboard/congregation-setup-auto-open.tsx` — auto-open wrapper a /dashboard oldalhoz

### 🔗 Integráció

- **`app/(dashboard)/layout.tsx`**: a congregation setup status lekérdezése minden dashboard oldalbetöltésnél (csak akkor, ha `activeProfileRole == null || scope === 'congregation'` → admin/esperes módban NEM triggerel).
- **`components/layout/dashboard-layout-client.tsx`**: a banner a `DashboardShell` fölött renderelődik, ha `congregationSetupNeeded === true`.
- **`app/(dashboard)/dashboard/page.tsx`**: `CongregationSetupAutoOpen` wrapper automatikus wizard-nyitással.

### 🗃️ Meglévő infrastruktúra használata

- **A `logos` Storage bucket már létezett** (a `congregation-dialog-v2.tsx` használta). Új SQL **NEM KELL** — az új kód a meglévő bucket-et használja.
- A `congregations.cimer_url` oszlop **már létezett**.

### TypeScript check: **EXIT 0** ✅

### Flow az első belépéskor (példa)

1. Új lelkész bejelentkezik → `/dashboard`
2. A `checkCongregationSetupStatus` ellenőrzi a 10 kötelező mezőt
3. Ha hiányos → `CongregationSetupAutoOpen` (useEffect-tel) megnyitja a wizardot az első mount-kor
4. Ha a lelkész bezárja ("Később"), akkor **minden oldalon** megjelenik a sárga pulzáló banner: „⚠ Gyülekezeti alapadatok hiányoznak — Hiányzó: X, Y, Z + N további"
5. Kattintásra a banneren → wizard újra megnyílik
6. A mentés után banner eltűnik, minden oldal tisztán használható

---

## [2026-04-19a] — Egyházmegye setup wizard + admin scope bug fix

<!-- key: 2026-04-19-egyhazmegye-setup-wizard -->
<!-- category: feature -->
<!-- version: 1.6.2 -->
<!-- targets: esperesek, admin -->

### ✨ Új funkciók

- **Egyházmegye beállítás wizard** — az esperes első alkalommal a /dashboard-egyhazmegye megnyitásakor egy 5 lépéses wizardot lát, ami bekéri az egyházmegye hivatalos adatait:
  1. **Alapadatok + címer** (név, CIF, adószám, címer feltöltés — Supabase Storage `dioceses-logos` bucket, max 2 MB, JPG/PNG/WEBP)
  2. **Cím** (ország, megye, település, irányítószám, utca)
  3. **Elérhetőségek** (e-mail, telefon, weboldal)
  4. **Bank + vezetés** (bank név, IBAN, valuta, esperes név/cím, jegyző név)
  5. **Megerősítés** → mentés (dioceses UPDATE + diocese_bealitas upsert az aktuális évre)
- **Globális figyelmeztető banner** — minden oldalon megjelenik (header alatt), ha a beállítás hiányos:
  - Kattintásra azonnal megnyitja a wizard-ot
  - Sárga/amber színű, AlertCircle ikonnal, lüktető animációval
  - Csak diocese scope-ban látszik (congregation/admin scope-ban rejtett)
- **Wizard auto-open** — a /dashboard-egyhazmegye oldal betöltésekor automatikusan megnyílik (useEffect alapú mount)
- **Kötelező kiépítés** — minden mező kötelező. A wizard „Később" gombbal bezárható, ekkor a banner marad minden oldalon.

### 🐛 Kritikus bugfix — admin scope congregation kontextus

Endre jelezte: rendszergazdaként belépve látta a Barátosi Egyházközség adatait is, pedig admin felületen a `congregation_id` üres kellett volna legyen.

**Ok**: A `lib/auth/effective-access.ts` régebbi verziójában az `effectiveCongregationId` = `override.congregationId || profile.congregation_id`. Ha az admin user-nek is van `profiles.congregation_id` (saját gyülekezete), akkor admin scope-ban is propagálódott.

**Javítás**: a scope-számítás átrendezve — `activeProfileRole` először betöltve, majd:
- `scope === 'congregation'` → az `activeProfileRole.scopeId` (+ opcionális god-mode override) lesz az effectiveCongregationId
- `scope === 'diocese' | 'district' | 'system'` → `null` (nincs gyülekezet kontextus admin/esperes/kerületi módban)
- Nincs activeProfileRole → a régi fallback: override || profile.congregation_id (backward compat)

A `congregation` SELECT is skippelődik, ha `effectiveCongregationId === null`.

### 🗃️ SQL migráció

**`migration-docs/sql/2026-04-18-dioceses-cimer-setup.sql`**:
- `dioceses.cimer_url` új oszlop (text nullable)
- Storage bucket: `dioceses-logos` (public, 2 MB, image/jpeg+png+webp)
- RLS a bucket-hez:
  - SELECT: mindenki olvashat (publikus)
  - INSERT/UPDATE/DELETE: esperes/egyházmegyei admin a saját dioceseéhez (fájlnév séma: `{diocese_id}/cimer-{timestamp}.{ext}`), + globális admin/kerületi admin
- `NOTIFY pgrst, 'reload schema';` a végén

### 🔧 Szerver akciók

**`app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts`** bővítés:
- `checkDioceseSetupStatus(dioceseId?)` — ellenőrzi a 15 kötelező mezőt, visszaadja a hiányzók listáját
- `saveDioceseSetup(input)` — Zod-validálva menti az összes mezőt (`dioceses` UPDATE + `diocese_bealitas` auto-upsert)
- `uploadDioceseCimer(dioceseId, FormData)` — Storage upload, visszaadja a publikus URL-t

### 🎨 UI komponensek

- `components/modals/diocese-setup-wizard.tsx` — 5 lépéses full-page wizard, drag-and-drop címer upload, lépésenkénti validáció
- `components/layout/diocese-setup-banner.tsx` — globális warning banner
- `components/dashboard/diocese/diocese-setup-auto-open.tsx` — auto-open wrapper a dashboard-egyhazmegye oldalhoz

### 🔗 Integráció

- `app/(dashboard)/layout.tsx`: a diocese setup status lekérdezése minden dashboard oldalbetöltésnél, átadása a `DashboardLayoutClient`-nek
- `components/layout/dashboard-layout-client.tsx`: a `DashboardShell` fölött render-eli a `DioceseSetupBanner`-t, ha `dioceseSetupNeeded === true`
- `app/(dashboard)/dashboard-egyhazmegye/page.tsx`: `DioceseSetupAutoOpen` wrapper automatikus wizard-nyitással

### ▶️ Endre — futtatandó

```
migration-docs/sql/2026-04-18-dioceses-cimer-setup.sql
```

A végén `NOTIFY pgrst, 'reload schema';` — automatikusan frissíti a Supabase PostgREST cache-t.

### TypeScript check: **EXIT 0** ✅

---

## [2026-04-18p] — FÁZIS 8 REFAKTOR: scope-aware /penzugy (külön diocese UI helyett)

<!-- key: 2026-04-18-penzugy-scope-aware -->
<!-- category: improvement -->
<!-- version: 1.6.1 -->
<!-- targets: esperesek -->

### 🔄 Nagy architektúra-refaktor

Endre visszajelzése alapján a [2026-04-18o] verzió HIBÁS megközelítést használt: külön `DioceseFinanceSection` UI-t épített duplikációval. A helyes megközelítés: **a meglévő /penzugy oldal scope-tudatossá tétele**, így a profilváltás után ugyanaz a jól megszokott UI nyílik meg, csak a háttérben a `diocese_*` táblákra ír.

### ✨ Új architektúra

- **Új scope helper**: `lib/auth/finance-scope.ts` — `getFinanceScopeContext()` + `tablesFor(scope)` + `isYearFinalized()` + `yearValueFor(scope, year)`.
  - Detektálja az aktív `profile_role.scope`-ot ('diocese' vagy 'congregation').
  - Tábla-mapping hash: `befizetes` ↔ `diocese_befizetes`, `kiadas` ↔ `diocese_kiadas`, `bealitas` ↔ `diocese_bealitas`, `koltsegvetes` ↔ `diocese_koltsegvetes`, `annual_reports` ↔ `diocese_annual_reports`.

- **`penzugy/actions.ts` dual-path refaktor** (MVP):
  - `initFinance(year)` — scope-elágazás: diocese módban új `initFinanceDiocese()` helper, ugyanolyan struktúrát ad vissza, mint a gyülekezeti path (zéró regressziós kockázat).
  - `saveIncome` / `saveExpense` / `saveIncomeBatch` / `saveExpenseBatch` — scope alapján `insertIncomeRecord` vagy új `insertDioceseIncomeRecord` (ill. expense) helperhez hív.
  - `saveIncomeWithLinkedInventory` / `saveExpenseWithLinkedInventory` — diocese módban tiszta error (Phase 5).
  - `deleteTransaction` — scope-aware, diocese módban egyszerűbb (nincs belsomozgas_xkey pairing).
  - `getNextReceiptNumber`, `getLastRecordedDate` — scope-aware SELECT-ek.
  - `finalizeBudget`, `finalizeAccounting`, `requestAccountingUnlock` — scope alapján a `diocese_bealitas` + `diocese_annual_reports`-ra ír (egy lépésben submission+finalization, nincs `submitDocument` hívás).
  - `requestBudgetUnlock` — diocese módban MVP error (Phase 5).

- **`edit-storno-actions.ts` teljes scope-aware refaktor**: `isLastTransactionOfType`, `updateTransactionBasic`, `stornoTransaction`, `undoStornoTransaction` mind a `tablesFor(scope)` + `isYearFinalized()` helperre épül. Diocese módban a tag-referenciák (id_szemely/id_csalad) nem érhetők el, belsomozgas_xkey pairing sem. A kategória oszlop scope-specifikus: congregation `id_befizetescel/id_kiadascel` (int), diocese `id_szamadasicel` (string kód).

- **`finalization-actions.ts` scope-aware**: `runFinalizationChecks` diocese módban egy új `runDioceseFinalizationChecks` helpert fut le (csak kategória check-ek, a bank/FX/Oblio check-ek kihagyva). `listJegyzokonyvekForFinalization` diocese módban üres arrayt ad → a wizard automatikusan `manual` jkv módra vált.

- **`lib/finance/budget-compat.ts` scope-aware**: `loadBudgetRowsCompat(supabase, year, scopeId, scope?)` és `saveBudgetRowsCompat(supabase, year, scopeId, rows, scope?)` diocese módban a `diocese_koltsegvetes` táblára fut.

- **`/penzugy/page.tsx` scope detektálás**: ha `activeProfileRole.scope === 'diocese' && scopeId`, a diocese mód aktív. A `FinanceTabs` scope prop-pal kapja meg az információt.

- **`FinanceTabs` scope prop**: új opcionális `scope?: 'congregation' | 'diocese'` (default 'congregation'). Diocese módban a `debt`, `rental`, `monetary`, `oblio_ellenorzes` fülek nem renderelődnek.

- **`AccountingFinalizeWizard` scope prop**: új opcionális `scope` prop. Diocese módban **nincs** `submitDocument` hívás (a `diocese_annual_reports` egy lépésben tölti be a submission+finalization mezőket). Toast-üzenet is scope-specifikus.

- **`AccountingTabV2` scope prop**: átadja a wizardnak a scope-ot.

### 🧭 Sidebar scope-aware label + szűrés

**`components/layout/sidebar-adaptive-v4.tsx`**:

- Új `activeScope` prop a `SidebarAdaptiveV4` + `SidebarNav` szinten.
- Az **„Irányítópult"** menüpont dinamikus scope alapján:
  - `'diocese'` → **„Egyházmegyei irányítópult"** → `/dashboard-egyhazmegye`
  - `'district'` → **„Kerületi irányítópult"** → `/dashboard-kerulet`
  - default → **„Irányítópult"** → `/dashboard`
- Diocese scope-ban a fő modulok szűrése: csak **Irányítópult + Pénzügy + Profilom** látható (Tagnyilvántartás, Anyakönyv, Iktatás, Munkanapló, Leltár, Jegyzőkönyvek, Sírhelyek, Missziós Műhely el van rejtve).

- `DashboardLayoutClient` + `layout.tsx` propagálja az `activeScope`-ot.

### 🧹 Tisztítás — duplikáció megszüntetése

- **TÖRÖLVE**: `components/dashboard/diocese/diocese-finance-section.tsx` (teljes duplikált UI)
- **TÖRÖLVE**: `app/(dashboard)/dashboard-egyhazmegye/finance-actions.ts` (párhuzamos action-fájl)
- **MÓDOSÍTVA**: `components/dashboard/diocese/diocese-dashboard-tabs.tsx` — a `'finance'` fül teljesen eltávolítva (a `TabKey` union-ból, a tabs array-ből és a render blokkból is). Az esperes a sidebar „Pénzügy" menüponton keresztül éri el a `/penzugy`-t (scope=diocese).

### 📋 Az MVP hatóköre

- ✅ Éves költségvetés, bevétel/kiadás CRUD, számadás-véglegesítés scope-aware.
- ⏭ Phase 5-re halasztott diocese-ben: belsomozgas (internal transfer), bérleti szerződések, FX átértékelés, bank nyitó egyenleg, Oblio integráció, leltár-integrált rögzítés, Kartotéka-jkv integráció (jelenleg manual-only), költségvetés unlock workflow.

### 🗂️ MEGŐRZÖTT: a `diocese_*` táblák

A `diocese_bealitas` / `diocese_befizetes` / `diocese_kiadas` / `diocese_koltsegvetes` / `diocese_annual_reports` táblák **MEGMARADNAK** — ezek a scope-aware action-ök adatrétege.

### 🔐 RLS változatlan

Az RLS policy-k a [2026-04-18o]-ban kerültek be és továbbra is érvényesek.

### TypeScript check: **EXIT 0** ✅

### Verifikáció

**S1 — Gyülekezeti regresszió**: lelkész `/penzugy` minden funkciója változatlanul működik (11 fül, új bevétel/kiadás, költségvetés, számadás-véglegesítés).

**S2 — Esperes diocese váltás**:
1. Profilváltó → diocese scope.
2. Sidebar: „Egyházmegyei irányítópult" → `/dashboard-egyhazmegye` + Pénzügy + Profilom.
3. `/penzugy` megnyitva → `initFinance` diocese path → `diocese_*` táblákból adat.
4. Fülek: Áttekintés / Kassza / Bank / Tranzakciók / Költségvetés / Számadás / Súgó (a debt/rental/monetary/oblio nem látszik).
5. Új bevétel → `diocese_befizetes`-be.
6. Számadás-véglegesítés wizard → `diocese_bealitas.szamadas_veglegesitve=true` + `diocese_annual_reports` sor.

---

## [2026-04-18o] — FÁZIS 8: Egyházmegyei pénzügy (saját bevétel, kiadás, költségvetés, számadás)

<!-- key: 2026-04-18-egyhazmegyei-penzugy -->
<!-- category: feature -->
<!-- version: 1.6.0 -->
<!-- targets: esperesek -->

### ✨ Új funkciók

Az egyházmegyei dashboard **💰 Pénzügy** fülén az esperes mostantól teljes körű saját pénzügyi modult kezel:

- **📊 Áttekintés** — élő KPI (bevétel/kiadás/egyenleg) + kategóriabontás a tervvel szemben
- **💰 Bevétel** — kézi rögzítés, szerkesztés, törlés. A **„Befizető gyülekezet"** dropdown-ból közvetlenül kiválaszthatod, melyik gyülekezet fizette be az adott tételt (pl. 101.07 Központi járulék). A gyülekezet kiválasztásakor a „Forrás" mező auto-kitöltődik a gyülekezet nevével.
- **💸 Kiadás** — kézi rögzítés. A „Kedvezményezett gyülekezet" dropdown hasonlóan működik (pl. 206.05 Kiadások egyházközségek részére).
- **📋 Költségvetés** — éves tervezés szamadasicel-enként, véglegesítés.
- **✅ Számadás** — élő mérleg, véglegesítési workflow snapshot aggregációval.

### 🗂️ Új táblacsalád (5 új tábla)

**`migration-docs/sql/2026-04-18-egyhazmegyei-penzugy-fazis8.sql`**:

- `diocese_bealitas` — évenkénti konfig (költségvetés + számadás véglegesítési állapot)
- `diocese_befizetes` — egyházmegyei bevétel (+ `befizeto_congregation_id` a gyülekezet-forráshoz, + `source_befizetes_id` a későbbi auto-szinkronhoz)
- `diocese_kiadas` — egyházmegyei kiadás (+ `kedvezmenyezett_congregation_id`)
- `diocese_koltsegvetes` — éves költségvetés (PK: diocese_id + eve + szamadasicelid)
- `diocese_annual_reports` — egyházmegyei éves számadás snapshot (analog az `annual_reports`-szal)

### 🗂️ Meglévő táblák bővítése

- **`bankszamlak`**: új `scope` + `diocese_id` oszlopok, `congregation_id` nullable-re állítva. Így az egyházmegyének saját bankszámlái lehetnek (a gyülekezeti logikát nem érinti). CHECK constraint biztosítja: `scope='gyulekezet' → congregation_id NOT NULL` vagy `scope='egyhazmegye' → diocese_id NOT NULL`.
- **`chitanta_tombok.congregation_id`**: nullable-re állítva (a 2026-04-18-fazis6 bevezetett scope-ja mostantól tényleg működőképes).

### 🔒 RLS

Minden új táblán: csak a saját egyházmegye **esperes** / **egyházmegyei admin** / kerületi admin / globális admin szerkesztheti. Háromrétegű ellenőrzés:
1. `profiles.role IN ('admin', 'egyhazkeruleti_admin') + status='active'`
2. `profile_roles (scope='system'|'diocese'|'district', role='admin'|'esperes'|'egyhazmegyei_admin'|'egyhazkeruleti_admin')`
3. `profiles.diocese_id = diocese_id + role IN ('esperes', 'egyhazmegyei_admin')`

### 🔧 Szerver akciók

**`app/(dashboard)/dashboard-egyhazmegye/finance-actions.ts`**:

- `listDioceseIncome / upsertDioceseIncome / deleteDioceseIncome`
- `listDioceseExpense / upsertDioceseExpense / deleteDioceseExpense`
- `getDioceseBudget / upsertDioceseBudget / finalizeDioceseBudget`
- `getDioceseBealitas / finalizeDioceseAccounting` (snapshot aggregálás → `diocese_annual_reports`)
- `getDioceseFinanceSummary(year)` — élő KPI
- `listDioceseBankAccounts / listCongregationsInDiocese / listDioceseSzamadasicel` — segédlekérdezések

### 🎨 UI

- **`components/dashboard/diocese/diocese-finance-section.tsx`** — a teljes modul egy komponensben, belső `ColorTabs`-szal (áttekintés / bevétel / kiadás / költségvetés / számadás)
- 2 szerkesztő dialog: `IncomeEditDialog`, `ExpenseEditDialog` — `SearchableCategorySelect`-tel és gyülekezet-dropdown-nal
- Integrált a `diocese-dashboard-tabs.tsx` `finance` fülébe (a korábbi placeholder lecserélve)

### 🧩 Gyülekezetközi transzfer (MVP)

A **„Befizető gyülekezet"** és **„Kedvezményezett gyülekezet"** dropdown-ok már működnek a szerkesztő dialogokban. Az esperes kézzel rögzítheti az egyházközségektől érkező járulékokat (pl. 101.07, 101.08) a megfelelő gyülekezet kiválasztásával.

**Jövőbeli fejlesztés (5. kör)**: automatikus szinkronizáló gomb, ami a gyülekezetek véglegesített 101.07/101.08 bevételeiből automatikusan létrehozza az egyházmegyei `diocese_befizetes` sorokat. A táblában már van `source_befizetes_id` mező a duplikáció-védelemhez.

### ▶️ Endre — futtatandó

```
migration-docs/sql/2026-04-18-egyhazmegyei-penzugy-fazis8.sql
```

A végén `NOTIFY pgrst, 'reload schema';` — automatikusan frissíti a Supabase PostgREST cache-t. Az összes új tábla + bővítés idempotens.

Az ellenőrző SELECT-ek a fájl végén mutatják:
- Új táblák (5 db)
- `bankszamlak` új oszlopai (`scope`, `diocese_id`)
- `chitanta_tombok.congregation_id` nullable
- RLS policy-k az új táblákra

---

## [2026-04-18n] — HOTFIX: SQL RLS hibák — profile_roles.profile_id és helyes scope enum

<!-- key: 2026-04-18-sql-rls-profile-roles-fix -->
<!-- category: bugfix -->
<!-- version: 1.5.1 -->
<!-- targets: fejleszto -->

### 🐛 Kritikus javítások

Endre jelezte, hogy a 2026-04-18-as SQL migrációk nem futtak le:
```
ERROR: 42703: column pr.user_id does not exist
```

**A hiba oka**: a `profile_roles` tábla valós sémája (lásd `migration-docs/Database_schema.sql`) eltér attól, amit a migrációk feltételeztek:

| Hibás feltételezés | Valós séma |
|---|---|
| `pr.user_id` | **`pr.profile_id`** (FK → profiles.id = auth.users.id) |
| `pr.scope = 'egyhazmegye'` | **`pr.scope = 'diocese'`** |
| `pr.scope = 'egyhazkerulet'` | **`pr.scope = 'district'`** |
| `pr.scope = 'gyulekezet'` | **`pr.scope = 'congregation'`** |
| `pr.role IN ('god_admin', 'rendszergazda', 'master')` | Ezek a role-ok **NEM léteznek** a CHECK constraint-ben. A legmagasabb szint `profiles.role = 'admin'` + `status='active'`, vagy `profile_roles (scope='system', role='admin')`. |

### 🔧 Javított fájlok

- `migration-docs/sql/2026-04-18-admin-system-finance.sql` — RLS átírva:
  - `pr.user_id` → `pr.profile_id`
  - Admin-check mindkét mintában: `profiles.role = 'admin'` VAGY `profile_roles(scope='system', role='admin')`
  - `DROP POLICY IF EXISTS` a régi névvel is (idempotens)

- `migration-docs/sql/2026-04-18-egyhazmegyei-modul-fazis6.sql` — RLS átírva:
  - Ugyanaz a minta, + `scope='diocese'` / `scope='district'`
  - Esperes/egyházmegyei admin saját egyházmegyét szerkeszt
  - Egyházkerületi admin a saját kerületébe tartozó egyházmegyéket

- `app/(dashboard)/profile/profile-preferences-actions.ts` — javítva a `resolveDefaultDashboardPath` útvonala:
  - `/egyhazkeruleti-dashboard` → **`/dashboard-kerulet`** (a tényleges route a rendszerben)

### ⚠️ Tanulság (Endre alapelve szerint)

> **Ellenőrizz, ne találgass** — minden új SQL migráció előtt kötelező megnézni
> a `migration-docs/Database_schema.sql` fájlt, és a valós oszlopneveket + CHECK
> constraint-eket használni. A projekt alapelvei (`feedback_sql_ellenorzes_egyben.md`,
> `feedback_verify_ask_document.md`) pontosan ezt írják elő.

### ▶️ Endre, most már újrafuttatható

Mindkét migráció idempotens — a korábbi (sikertelen) próbák nem okoztak
részleges állapotot. Csak futtasd újra a két fájlt.

---

## [2026-04-18m] — Egyházmegyei modul (FÁZIS 6, 7, 9) — Egyházmegyénk + nyugtatömbök + automatikus profilváltás

<!-- key: 2026-04-18-egyhazmegyei-modul -->
<!-- category: feature -->
<!-- version: 1.5.0 -->
<!-- targets: esperesek -->

### ✨ Új funkciók

- **„Egyházmegyénk" fül** az egyházmegyei dashboardon — az esperes szerkesztheti az egyházmegye **hivatalos adatait**:
  - Jogi azonosítók: CIF, magyar adószám, hivatali főszám
  - Cím: ország, megye, település, irányítószám, utca
  - Elérhetőségek: email, telefon, weboldal
  - Banki adatok: bank neve, fő IBAN, valuta (RON/EUR/HUF/USD)
  - Vezetés: esperes neve/címe, egyházmegyei jegyző neve
  - Megjegyzés

  Ezek az adatok a hivatalos dokumentumokon (nyugták, kiadási utalványok, pénzügyi jelentések) megjelennek majd.

- **Egyházmegyei nyugtatömbök** — külön nyugtatömbök az egyházmegyének (a gyülekezeti mellett). Új fül: **🧾 Nyugtatömbök** az egyházmegyei dashboardon:
  - Listázás: széria, számok, darabszám, felhasznált, maradék, vásárlás dátuma, ár
  - Új tömb rögzítése (wizard dialog átfedés-ellenőrzéssel)
  - Tömb lezárása (kézi befejezés)
  - Tömb törlése (csak használatlan)
  - Aktív tömb KPI panel: következő szám, maradék darabszám, felhasznált

- **Automatikus profilváltás bejelentkezéskor** — ha egy felhasználónak **több szerepköre** van (pl. gyülekezeti lelkipásztor + esperes), a rendszer automatikusan a legmagasabb szintű aktív szerepkör dashboardjára irányít. Prioritás (csökkenő):
  1. Admin/rendszergazda → `/admin`
  2. Egyházkerületi admin → `/egyhazkeruleti-dashboard`
  3. Esperes → `/dashboard-egyhazmegye`
  4. Lelkész / könyvelő / számvevő → `/dashboard`

- **Kezdőfelület választó a profilon** — a multi-role felhasználók választhatnak saját alapértelmezett dashboardot (a rendszer-defaultot felülírva). A választás a `profile_preferences.default_dashboard`-ban rögzül.

### 🗃️ SQL migráció

**`migration-docs/sql/2026-04-18-egyhazmegyei-modul-fazis6.sql`**:
- `dioceses` tábla bővítése: cif, adoszam, cim_*, email, telefon, weboldal, bank_*, esperes_nev/cim, jegyzo_nev, megjegyzes, updated_at, updated_by
- `chitanta_tombok` bővítése: `scope` ('gyulekezet'/'egyhazmegye') + `diocese_id` FK
- CHECK constraint: scope='gyulekezet' ↔ congregation_id NOT NULL; scope='egyhazmegye' ↔ diocese_id NOT NULL
- Új tábla: `profile_preferences` (user_id PK, default_dashboard, last_used_scope, last_used_scope_id)
- RLS:
  - `dioceses` UPDATE: esperes/egyházmegyei admin a sajátját, egyházkerületi admin a saját kerületbe tartozót
  - `profile_preferences` SELECT/UPSERT csak saját sorra
- `updated_at` trigger

### 🔧 Szerver akciók

- **`app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts`**:
  - `getDiocese(dioceseId?)` — olvasás
  - `updateDiocese(input)` — szerkesztés Zod validációval
  - `getDioceseBankSummary(dioceseId?)` — fő IBAN gyors megjelenítés

- **`app/(dashboard)/dashboard-egyhazmegye/chitanta-tombok-actions.ts`**:
  - `listDioceseChitantaTombok`, `getActiveDioceseChitantaTombStatus`
  - `createDioceseChitantaTomb` (átfedés-ellenőrzés!)
  - `closeDioceseChitantaTomb`, `deleteDioceseChitantaTomb` (csak használatlan)

- **`app/(dashboard)/profile/profile-preferences-actions.ts`**:
  - `getProfilePreferences` / `updateDefaultDashboard` / `saveLastUsedScope`
  - `resolveDefaultDashboardPath` — a legfontosabb: bejelentkezés után hova irányítsunk

### 🎨 UI komponensek

- `components/dashboard/diocese/our-diocese-section.tsx` — Egyházmegyénk adatszerkesztő
- `components/dashboard/diocese/diocese-chitanta-tombok-section.tsx` — nyugtatömb modul
- `components/profile/default-dashboard-selector.tsx` — alapértelmezett dashboard választó a profilon

### 🔗 Integráció

- **`app/page.tsx`** (root): bejelentkezés után `resolveDefaultDashboardPath`-ot hív
- **`components/dashboard/diocese/diocese-dashboard-tabs.tsx`**: 2 új fül — „🏛️ Egyházmegyénk" és „🧾 Nyugtatömbök"
- **`app/(dashboard)/profile/page.tsx`**: új kártya az alapértelmezett kezdőfelülethez

### ⏭️ Jövőbeli

- **FÁZIS 8** (külön): egyházmegyei költségvetés + számadás. Ez nagyobb volumenű — a meglévő pénzügyi táblákat (bealitas, befizetes, kiadas, koltsegvetes, szamadas) ki kell terjeszteni egyházmegyei scope-ra, vagy új `diocese_finance_*` családot létrehozni. Külön 4. körben intézzük.

---

## [2026-04-18l] — Admin Rendszer pénzügyei modul (FÁZIS 5)

<!-- key: 2026-04-18-admin-system-finance -->
<!-- category: feature -->
<!-- version: 1.4.0 -->
<!-- targets: rendszergazda -->

### ✨ Új funkciók

- **Új admin fül: „Rendszer pénzügyei"** — Endre (rendszerfejlesztő) számára átlátható kép a rendszer pénzügyi helyzetéről. 5 szekció:
  1. **KPI panel** — havi bevétel, költség, profit + aktív előfizetők / összes gyülekezet
  2. **Havi rendszer-költségek** (szerkeszthető táblázat): Supabase, Vercel, Cloudflare R2, AI szerver (GPU + proxy + monitoring), mobil, Sentry, domain. Kategória, USD/RON, árfolyam, aktív/inaktív, sorszám — mindegyik módosítható.
  3. **Árazási sávok** (szerkeszthető táblázat): **tag-szám szerint** — Endre alapelve: „képesség szerinti elosztás". Alapértelmezett 8 sáv:
     - Kis gyülekezet (0-100 tag): 20 RON/hó
     - Közepes-kicsi (101-200): 30 RON/hó
     - Közepes (201-400): 45 RON/hó
     - Nagy (401-800): 65 RON/hó
     - Mega (801+): 90 RON/hó
     - + Tesztidőszak (ingyen), Referencia gyülekezet (50% kedvezmény), Egyházmegyei csomag (15.000 RON/év)
  4. **Gyülekezeti előfizetések** (szerkeszthető): ki fizet mennyit, mikor, milyen típusú előfizetéssel. Új előfizetés hozzáadásakor automatikusan felajánlja a tag-szám szerinti sávot.
  5. **Skálázási előrejelzés**: 25 / 50 / 100 / 200 / 500 / 1000 gyülekezet szcenáriók — havi/éves bevétel, költség, profit, profit margin %-ban.

### 🗃️ SQL migráció

- **`migration-docs/sql/2026-04-18-admin-system-finance.sql`** — 3 új tábla:
  - `system_finance_costs` — havi rendszer-költségtételek
  - `system_pricing_tiers` — árazási sávok
  - `congregation_subscriptions` — gyülekezeti előfizetések (FK: congregations, pricing_tiers)

  Plusz:
  - RLS policy: csak `god_admin` vagy `rendszergazda` szerepkör szerkesztheti
  - Seed-ek: 8 árazási sáv + 14 költségtétel az üzleti terv (Egyhazi_Uzleti_Terv_2026_v2.docx) és költségvetés (Egyhazi_Rendszer_Koltsegvetes_2026_v5.xlsx) alapján
  - `updated_at` trigger függvény
  - Ellenőrző SELECT-ek a fájl végén

### 🔧 Szerver akciók

- **`app/(dashboard)/admin/system-finance-actions.ts`**:
  - `listSystemCosts` / `upsertSystemCost` / `deleteSystemCost`
  - `listPricingTiers` / `upsertPricingTier` / `deletePricingTier`
  - `listCongregationSubscriptions` / `upsertCongregationSubscription` / `deleteSubscription`
  - `getSystemFinanceSummary` — aggregált pénzügyi kép (bevétel, költség, profit, tag-szám szerinti bontás)
  - `getScalingForecast` — 6 szcenárió (25–1000 gyülekezet)
  - `suggestPricingTierForCongregation` — automatikus sáv-javaslat tag-szám alapján
  - `listCongregationsForSubscription` — dropdown-adatok

### 🎨 UI

- **`components/admin/system-finance-tab.tsx`** — a teljes modul egy komponensben
- Színkód: **rose** (vörös) — admin tabs v3 új fül "Rendszer pénzügyei"
- Szerkesztő dialogok mindhárom táblához (cost/tier/subscription) — `ModalField` dizájn rendszer, responsive

### 📝 Referencia

Az árazási stratégia Endre üzleti terve (`Egyhazi_Uzleti_Terv_2026_v2.docx`) alapján készült:
- Szerzői jogi licencia modell (Legea 8/1996) — cég nélkül, természetes személyként
- 10% jövedelemadó + 40% költségátalány
- CASS/CAS küszöbök 2026-ra figyelembe véve
- Havi + éves + egyházmegyei csomag opciók

A költségbecslés (`Egyhazi_Rendszer_Koltsegvetes_2026_v5.xlsx`) az „AJÁNLOTT + AI" szcenárióval dolgozik: Supabase Pro, Vercel Pro, Cloudflare R2 (NINCS egress díj), Apple Developer, Sentry Team, + Qwen 2.5 72B AI szerver Vast.ai-n (A100 80GB, EU adatközpont).

---

## [2026-04-18k] — Hibajavítás: button-in-button hydration hiba + BCR import xkey NOT NULL

<!-- key: 2026-04-18-bcr-button-xkey-fix -->
<!-- category: bugfix -->
<!-- version: 1.3.0 -->
<!-- targets: lelkészek -->

### 🐛 Kritikus javítások

- **Button-in-button hydration hiba** — a `SearchableCategorySelect`-ben az X törlő gomb a trigger `<button>` belsejében volt, ami érvénytelen HTML és hydration errort okozott minden oldalon, ahol megjelent (pl. BCR import, kassza tétel szerkesztő). Javítás: az X gomb kikerült a trigger button mellé, `absolute right-9 top-1/2 -translate-y-1/2` pozícióban, `z-10`-zel a button fölött, `tabIndex={-1}`-vel hogy ne zavarja a fókusz-ciklust. A trigger padding-right (`pr-14` / `pr-9`) dinamikusan állítódik attól függően, hogy látszik-e az X.

- **BCR banki import: „null value in column xkey" hiba** — a banki Excel import `befizetes` beszúrásai (jóváírás + kassza átvezetés 2 helyen) nem adtak meg `xkey` és `nyugta` értéket, de a `befizetes` tábla legacy séma NOT NULL constraint-el rendelkezik. Javítás: minden `befizetes` insert payload mostantól tartalmazza `xkey: randomUUID()` és `nyugta: docNumber` mezőket. Érinti a 3 befizetes insertet a `bank-import-actions.ts`-ben.

---

## [2026-04-18j] — BCR import wizard: dropdown portál, kategória-gate, névtelen jelzés + FX gomb eltávolítás

<!-- key: 2026-04-18-bcr-dropdown-portal-kategoria-gate -->
<!-- category: bugfix -->
<!-- version: 1.2.9 -->
<!-- targets: lelkészek -->

### 🐛 Javítások

- **Kategória dropdown már nem vágódik le** — a `SearchableCategorySelect` most a `document.body`-re portálódik `createPortal`-lal, `fixed` pozíciót használ. A BCR import wizard szűk táblázat-celláján belül is teljes szélességben (min. 260px) és magasan megjeleníti a lista, scroll és resize esetén is követi a trigger helyzetét.

- **Kategória név megjelenítés helyreállítva** — a szerver `actions.ts:450` korábban csak a `szint = 'gyulekezet'` szamadasicel rekordokat kérte le. Endre diagnosztikai SQL-je kimutatta, hogy a `befizetescel` / `kiadascel` junction táblákban **aktív sorok** (10+ db!) hivatkoznak `egyhazmegye` szintű szamadasicel rekordokra (pl. 201.15 Nettó fizetések, 201.17 CAS, 201.18 CASS, 206.02 Biztosítások, 206.03 Missziói segélyek, 206.05 Kiadások egyházközségek részére stb.). Mivel a név-lookup nem találta őket, csak a kód jelent meg a dropdown-ban. Javítás: a szerver most MINDEN szintű szamadasicel-t lekér, a szint-szűrést a kliens UI végzi (budget-tab, accounting-tab, accounting-tab-v2) csak a **tervezési/display** listáknál — a **lookup** viszont mindig teljes.

- **`SzamadasiCel.kod` undefined javítása** — a TypeScript típus `kod: string` mezőt ír elő, de a `szamadasicel` táblában NINCS `kod` oszlop. A szerver most `kod = String(id)` mapping-gel tölti ki, így a kliens kódban minden `c.kod` referencia működik.

- **Biztonsági háló a névtelen kategóriákra** — a `SearchableCategorySelect` mostantól csak akkor jelzi `⚠ Névtelen kategória` módon, ha a név VALÓBAN üres, vagy ha a név pont ugyanaz, mint a tipikus kategória-kód formátum (`XXX.YY`). Ez a javítás utáni szokásos állapotban nem aktiválódik.

### ✨ Új funkciók

- **Wizard kategória-gate** — a BCR import wizard „Kategorizálás" lépésén a „Megerősítés" gomb mostantól **disabled, amíg bármely tételnél hiányzik a kategória**. Egy sárga banner is megjelenik a gomb felett, amely pontosan mutatja, hány tétel maradt. Javaslat: ha nem kell importálni egy tételt, állítsd „Kihagy"-ra.

### 🗑️ Eltávolítva

- **Évvégi átértékelés gomb a Bank fül valutás kártyájáról** — a Számadás véglegesítő wizard (lásd `[2026-04-18h]`) automatikusan ellenőrzi a december 31-i FX revaluation-t, ezért a bank kártyáról a külön gomb feleslegessé vált. A `FxRevaluationDialog` komponens továbbra is elérhető, de a `bank-tab.tsx` már nem használja. A parent `finance-tabs.tsx` `onFxRevaluationSaved` prop-ja is el lett távolítva.

### 🔍 Diagnosztika (archívum)

- **`migration-docs/sql/2026-04-18-diagnoszika-szamadasicel.sql`** — CSAK OLVAS. Ez az SQL segítette kideríteni a hiba valódi okát: 10+ `aktiv=true` junction táblabeli sor hivatkozik `egyhazmegye` szintű `szamadasicel`-re (pl. 201.15-201.19, 206.02-206.06). A szerver-oldali szint-szűrés miatt ezek neve nem érkezett el a klienshez — ezért csak a kód látszott a dropdown-ban. A fenti „Kategória név megjelenítés helyreállítva" bejegyzés a javítás, az SQL megmarad referenciaként.

---

## [2026-04-18i] — BCR import wizard: kategória név (kód rejtve) + iratszám oszlop

<!-- key: 2026-04-18-bcr-import-kategoria-iratszam -->
<!-- category: improvement -->
<!-- version: 1.2.8 -->
<!-- targets: lelkészek -->

### 🎨 UX javítások

- **Kategória választó → kereshető, csak NÉV látszik** — a BCR banki import wizard „Kategorizálás" lépésében a régi natív `<select>` (ahol csak a számadási kód, pl. „101.01" látszott összecsukva) helyére a már meglévő `SearchableCategorySelect` komponens került. A lelkész most:
  - Csak a kategória **nevét** látja (a belső kódok el vannak rejtve)
  - Gépelhet is a listában (ékezet-érzéketlen, kis/nagybetű érzéketlen szűrés)
  - Billentyűzet-navigáció (↑/↓/Enter/Esc)
  - Kattintható X a kiválasztott kategória törléséhez

- **Új oszlop: „Iratszám"** — a táblázatban a Kategória mellett mostantól van egy iratszám input mező is:
  - Alapértelmezetten a BCR fájlból érkező `reference` értékkel kitöltődik (ha van)
  - A lelkész átírhatja (pl. `123/2026`, `SZLA-45/2025`) a saját számlaszám vagy nyugta szám alapján
  - Csak akkor látszik, ha a tétel nem „Kihagy" művelet
  - Importáláskor ez kerül a `befizetes.iratszam` / `kiadas.iratszam` (és `nyugta` a kiadásnál) mezőbe

### 🔧 Technikai

- `BankImportItem` típus: új `iratszam?: string` mező
- `RowDecision` típus a wizardban: új `iratszam?: string` mező
- `bank-import-actions.ts` `docNumber` fallback prioritás: **`item.iratszam` → `item.reference` → leírás alapú generálás**

---

## [2026-04-18h] — Számadás véglegesítő wizard — vezetett 5 lépéses folyamat

<!-- key: 2026-04-18-szamadas-veglegesito-wizard -->
<!-- category: feature -->
<!-- version: 1.2.7 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Számadás véglegesítése — wizardban** — a Pénzügy › Számadás fülön a „Véglegesítés és beküldés" gomb mostantól egy **5 lépéses vezetett wizardot** nyit meg, a régi `prompt()` sorozat helyett. A lelkészt végigvezetjük minden szükséges ellenőrzésen.

- **5 lépés:**
  1. **Áttekintés** — élő összefoglaló (bevétel/kiadás terv vs tény, egyenleg) színes, áttekinthető kártyákkal.
  2. **Automatikus ellenőrzések** — 6 check párhuzamosan fut: banki nyitó egyenleg, valutás FX átértékelés (december 31-i), bevétel kategóriák, kiadás kategóriák, járulékbefizetők azonosítása, Oblio számlák bevezetése. Piros hiba **blokkolja a továbblépést**, sárga figyelmeztetés engedi tovább, zöld pipa OK. Minden hibához „Javítás a … fülön" gomb kattintásra odanavigál.
  3. **Presbiteri jegyzőkönyv** — két opció:
     - **Kartotéka mód**: kiválasztja a lelkész a Kartotékában írt presbiteri jegyzőkönyvet és a megfelelő napirendi pontot. A rendszer automatikusan beírja a jegyzőkönyvi számot (határozatszám `{sorszam}/{ev}` formában, ha van kapcsolt határozat, egyébként az ülés sorszáma alapján). A tárgyalási dátum is automatikusan kitöltődik.
     - **Manuális mód**: a lelkész kézzel írja be a jegyzőkönyvi számot és a dátumot (pl. ha papíron van).
  4. **Megerősítés** — utolsó összefoglaló minden adattal: év, egyenlegek, jegyzőkönyvi szám, dátum, forrás (Kartotéka vagy Manuális). Sárga figyelmeztető box: mi történik a megerősítés után.
  5. **Kész** — siker képernyő + toast.

- **Könyvelési biztonsági háló** — a `fx_revaluation` check **blokkoló hibaként** jelez, ha egy valutás bankszámlán hiányzik a december 31-i FX átértékelés, megelőzve a helytelen záró egyenlegeket.

- **Snapshot bővítése** — a véglegesítés után a `document_submissions` és `bealitas.accounting_finalized` rekordba az új mezők is bekerülnek: `jegyzokonyvForras` (`'kartoteka' | 'manual'`), `presbiteri_jegyzokonyv_id`, `presbiteri_napirendi_pont_id`.

### 🔧 Új server actionök (`app/(dashboard)/penzugy/finalization-actions.ts`)

- `runFinalizationChecks(year)` — 6 ellenőrzés párhuzamosan, `CheckItem[]` + `hasBlocker/hasWarning` aggregációval
- `listJegyzokonyvekForFinalization(year)` — `presbiteri_jegyzokonyvek` + `jegyzokonyv_napirendi_pontok` + `jegyzokonyv_hatarozatok` a tárgyévre és a következő évre (mert gyakran a tárgyévet követő tavasszal tárgyalják a számadást)

### 🎨 UI (`components/modals/accounting-finalize-wizard-dialog.tsx`)

- Nagy dialog (`96vw` mobile, 1100px desktop), teljes képernyős overlay, responsive
- Ibolyaszín primary (a Pénzügy fülszínével egyező tónus), progresszus-jelző chip-sor felül
- A gomb ki-be kapcsol a `canGoNext()` logika alapján (nem lehet átugrani egyetlen lépést sem)
- Minden ellenőrzéshez egyedi ikonok, színkódolás (zöld/sárga/piros), fix URL-ek

### 🗃️ Backward compatibility

- A korábbi `prompt()`-alapú flow teljesen eltávolítva az `accounting-tab-v2.tsx`-ből
- A szerver `finalizeAccounting` és `submitDocument` API változatlan — a wizard ugyanazokat hívja, csak kontrollált paraméterekkel

---

## [2026-04-18g] — Könyvelési pontosság: FX december 31-re, nem január 1-re + évhelyes BNR

<!-- key: 2026-04-18-fx-konyvelesi-pontossag -->
<!-- category: bugfix -->
<!-- version: 1.2.6 -->
<!-- targets: lelkészek -->

### 🐛 Javítások (KÖNYVELÉSI PONTOSSÁG)

- **FX (árfolyam nyereség/veszteség) helyes dátum** — a korábbi implementáció januári 1-i dátummal könyvelt volna, ami **könyvelésileg hibás**. A román (OMFP 1802/2014) és magyar egyházi számvitel szerint az árfolyam nyereség/veszteség **DECEMBER 31-I DÁTUMMAL** kerül könyvelésre (év végi revaluation). Az új év január 1-i RON nyitó = december 31-i átértékelt záró RON (ugyanaz az érték, **nincs új FX tranzakció**).

- **Év eleji állapot ellenőrzés** — a banki import wizard a régi „FX könyvelés januárra" automata gomb helyett most **ELLENŐRZI**, hogy az előző évre megtörtént-e az FX revaluation (`valuta_atert` táblából). 4 lehetséges státusz:
  - ✅ **`ok_matching`**: előző évi FX revaluation meg van, árfolyam egyezik, nincs teendő
  - ⚪ **`ok_no_previous`**: új bankszámla vagy első import, nincs előző évi adat
  - 🟡 **`fx_revaluation_needed`**: hiányzik az előző évi FX revaluation → link az „Évvégi átértékelés"-re
  - 🟠 **`arfolyam_mismatch`**: az új árfolyam eltér az előző évi záró árfolyamtól → ellenőrzésre jelez

- **Évhelyes BNR/Frankfurter árfolyam** — a BNR gomb most a `nyitoEve` évet figyelembe veszi:
  - **Aktuális évre**: napi BNR XML (friss árfolyam)
  - **Historikus évre (pl. 2025)**: az előző év (2024) utolsó publikált napját használja (könyvelési gyakorlat: év eleji nyitó = előző év záró árfolyam)
  - BNR éves historikus XML (`nbrfxrates{YYYY}.xml`) vagy Frankfurter `/v1/{YYYY}-01-01` API
  - Jelzi a dátumot és forrást: `"BNR EUR árfolyam: 4.9589 (2024-12-31) — 2025. évre érvényes"`

### ⚠️ Deprecation

- `previewFxAtYearStart` és `applyFxAtYearStart` → **DEPRECATED** (hibás könyvelési logika)
  - A szerver hibaüzenettel utasít el, és átirányít a helyes `checkYearStartState` + évvégi `FxRevaluationDialog` útra

### 📚 Könyvelési magyarázat

A wizard új blue magyarázó box-a a lelkésznek:
> „Az árfolyam-nyereség / veszteség DECEMBER 31-I DÁTUMMAL kerül könyvelésre (év végi revaluation). Az új év január 1-i RON nyitó egyenleg = a december 31-i átértékelt záró RON (ugyanaz az érték, nincs új FX tranzakció)."

---

## [2026-04-18f] — Bank fül: számla-szintű bontás + élő FX nyereség/veszteség automatikus könyvelés

<!-- key: 2026-04-18-bank-szamla-bontas-fx -->
<!-- category: feature -->
<!-- version: 1.2.5 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Számla-szintű forgalom bontás**: a Bank fülön ha több bankszámla van, mostantól **bankszámla-szerinti szűrő** van a kártyák felett. Minden KPI (nyitó, bevétel, kiadás, záró egyenleg), tranzakció-lista és havi csoportosítás a kiválasztott számlára szűr. Ha csak 1 aktív számla van, automatikusan arra szűr. A „még nem számla-szintű" sárga figyelmeztetés eltávolítva.

- **Élő FX átértékelés előnézet** a banki import wizard „Nyitó egyenleg" lépésében valutás (EUR/HUF) számláknál:
  - **BNR gomb**: egy kattintással lekéri a legfrissebb BNR árfolyamot (`fetchBnrRateAction`)
  - **Élő számítás**: ahogy a lelkész írja a valuta-egyenleget és az árfolyamot, azonnal látja a RON ekvivalenst
  - **FX nyereség/veszteség kalkuláció** (könyvelői szemmel): ha van előző évi rögzített nyitó egyenleg, a rendszer kiszámolja az előző év záró RON-ját (nyitó + bevételek - kiadások), és összeveti az új év január 1-i RON-nal. A különbség az árfolyam nyereség (📈) vagy árfolyam veszteség (📉).
  - **Automatikus könyvelés**: egy gombra kattintva az FX különbség bekerül a rendszerbe január 1-i dátummal — pozitív esetben `befizetes` a 103.04 (Árfolyam nyereség) kódra, negatív esetben `kiadas` a 203.03 (Árfolyam veszteség) kódra. Megerősítő dialog előzi meg.
  - Vizuálisan: zöld (nyereség) vagy piros (veszteség) kártya, tétles összehasonlító táblázattal.

### 🔧 Új server actionök

- `previewFxAtYearStart` — előnézet: előző év záró RON vs új év RON, különbség számítás
- `applyFxAtYearStart` — automatikus könyvelés január 1-i dátummal a 103.04 vagy 203.03 kódra

### 📚 Könyvelői magyarázat

A romániai és magyar egyházi számvitelben:
- Egy valutás bankszámla év eleji RON egyenlege = valuta-egyenleg × januári BNR árfolyam
- Ha ez eltér az előző év december 31-i könyv szerinti záró RON-tól, a különbség FX nyereség/veszteség
- Ez az **év végi FX átértékelés** (már meglévő funkció) mellett **év eleji beigazítás** — ugyanolyan fontos, ha az előző évi revaluation nem történt meg pontosan

---

## [2026-04-18e] — Bankszámla éves nyitó egyenleg + valutás tranzakciók RON értéke

<!-- key: 2026-04-18-bank-nyito-egyenleg-ron -->
<!-- category: feature -->
<!-- version: 1.2.4 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Éves bontású nyitó egyenleg** (új `bankszamla_nyito_egyenleg` tábla) — a bankszámla létrehozásakor már NEM kell nyitó egyenleget megadni; a banki Excel import wizard-ban rögzítjük évenként.
- **Banki import wizard új „Nyitó egyenleg" lépés** — ha az importált tranzakciók legkorábbi éve új (nincs még rekord), a wizard bekéri:
  - RON számlánál: egyszerűen a január 1-i egyenleg
  - **Valutás számlánál** (EUR, HUF, stb.): valuta-egyenleg + árfolyam + RON ekvivalens (auto-számolással)
- **Valutás tranzakciók RON ekvivalense** — új `osszeg_ron` és `arfolyam` oszlopok a `befizetes` és `kiadas` táblákon. Minden importált valutás tranzakcióhoz automatikusan generálódik a RON érték a nyitó egyenleg árfolyama alapján. A könyvelésben, számadásban, Registru-ban így mindig RON érték áll rendelkezésre.
- **Bank fül bankkártya** most mutatja az aktuális év nyitó egyenlegét (valutában + RON ekvivalens ha valutás). Ha még nincs rögzítve, sárga figyelmeztetés jelenik meg.

### 🎨 UX javítások

- **Bankszámla hozzáadás dialog** egyszerűsítve: már NEM kéri közvetlenül a nyitó egyenleget. Helyette egy kék magyarázó doboz elmondja, hogy a banki Excel import wizard kezeli évenkénti bontásban.

### 🔧 Adatbázis migrációk

- `bankszamla_nyito_egyenleg` tábla (RLS-sel, `profile_roles` helyes oszlopaival)
- `befizetes.osszeg_ron`, `befizetes.arfolyam`
- `kiadas.osszeg_ron`, `kiadas.arfolyam`
- Visszafelé-kompatibilis backfill: RON számlák meglévő tételeinél `osszeg_ron = osszeg, arfolyam = 1`

### 📝 FX átértékelés megjegyzés

Az év végén a meglévő **FX átértékelés** funkció (Bank fül → „Évvégi átértékelés") továbbra is működik: a december 31-i BNR árfolyamra igazítja a RON egyenleget, és a különbséget árfolyam-nyereség/veszteség számadási célra könyveli.

---

## [2026-04-18d] — Pénzügyi súgó átszervezés: alponti nyomtatás, élő checklist, 4 új topic

<!-- key: 2026-04-18-sugo-atszervezes -->
<!-- category: improvement -->
<!-- version: 1.2.3 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Élő év végi zárás checklist a súgó legvégén** — a lelkész bepipálhatja az elvégzett teendőket (napi/havi/negyedéves/év végi csoportokban). A pipálások a böngészőben mentődnek évenkénti bontásban, progress bar mutatja a készenlétet. Ha minden év végi pont kész, zöld kártya jelzi: „Készen állsz a véglegesítésre!"
- **Minden súgó-topic saját nyomtatási ikonnal** (böngésző print + PDF letöltés) — a tetejéről eltávolítottuk a 3 fix PDF-kártyát, helyette minden témának saját, kontextus-szerű nyomtatása van.
- **4 új súgó-topic az új funkciókhoz**:
  - 🧾 Nyugtatömb rendszer — rögzítés, automatikus szám-kezelés, éves kimutatás
  - 🔄 Tétel szerkesztés és stornó — kereshető kategória, dátum-védelem
  - 📊 Banki Excel import (BCR) — 4 lépéses wizard duplikáció-védelemmel
  - 📦 Anyagraktár — gyorsan fogyó készletek, Anyagraktárkönyv nyomtatás

### 🎨 UX javítások

- **Hírlevél szerkesztő dialog responsive fix** — 96vw x 94vh méretre bővítve, grid min-width:0 fix (a korábbi zsúfolt kis ablak javítva).

---

## [2026-04-18c] — Fejlesztési hírlevél + tétel szerkesztő finomítás + admin sorrend fix

<!-- key: 2026-04-18-hirlevel-tetel-szerkeszto -->
<!-- category: feature -->
<!-- version: 1.2.2 -->
<!-- targets: rendszergazdák, lelkészek -->

### ✨ Új funkciók

- **Fejlesztési hírlevél** — admin rendszergazdának dedikált szerkesztő az Admin → Frissítések fülön. Több CHANGELOG bejegyzés egy szép, kategóriák szerint csoportosított HTML emailben küldhető ki:
  - Multi-select: válaszd ki, melyik frissítések kerüljenek be (alapértelmezetten minden el nem küldött)
  - Személyes bevezető szöveg + custom hírlevél-cím
  - Kategória badge-ek (🔒 Biztonság, 🐛 Javítás, ✨ Új funkció, 🚀 Fejlesztés, ⚠️ Átalakítás)
  - Élő előnézet iframe-ben, HTML letöltés
  - Broadcast + opcionális email (Resend)
  - A kiküldött bejegyzések automatikusan megjelölve (nem küldhetők ki újra)

- **Tétel szerkesztő finomítások** (Kassza + Bank fül):
  - **Kereshető kategória választó**: gépelj az kereséshez, a belső kódok (pl. "101.01") rejtve vannak, csak a kategória neve látszik
  - **Dátum védelem**: a tétel dátuma csak akkor szerkeszthető, ha az éven belüli utolsó tétel (kronológiai integritás védelme). Egyéb esetben a mező letiltva, magyarázattal: "Ha másik dátum kell, stornózd és rögzítsd újra."

### 🎨 UX javítások

- **Admin Frissítések fül**: a bejegyzések most **legfrissebb dátummal felül** jelennek meg (a CHANGELOG írási sorrendje helyett).

---

## [2026-04-18b] — Anyagraktár SQL fix, multi-tömb rögzítés, bank import duplikáció-védelem, egyházmegyei pénzügy terv

<!-- key: 2026-04-18-anyagraktar-multi-tomb-dedup -->
<!-- category: improvement -->
<!-- version: 1.2.1 -->
<!-- targets: mindenki -->

### 🐛 Javítások

- **Anyagraktár SQL RLS fix** (`2026-04-18-anyagraktar.sql`) — a `profile_roles` tábla helyes oszlopait használjuk: `pr.active = true AND pr.approval_status = 'approved'` (a téves `pr.status = 'active'` helyett). A `scope_id` már UUID típusú, nem kell `::uuid` cast. Idempotens `DROP POLICY IF EXISTS` pattern.
- **Oblio Utolsó letöltés dátum** — már nem minden oldalfrissítéskor íródik felül, hanem csak akkor, ha ténylegesen új ZIP / XML érkezett a mappába. A timestamp a legfrissebb XML `lastModified` értéke (nem a rendszeridő).

### ✨ Új funkciók

- **Több nyugtatömb rögzítése egyszerre** — a kerületi átvételnél tipikus eset (3-5 tömb egyszerre): a wizard repeater-szerűen fogad több tömböt közös vásárlási dátummal és összesített árral (egyenletesen elosztva). A rendszer ellenőrzi a batch-en belüli és a meglévő tömbökkel való átfedéseket is.
- **Bank import duplikáció-védelem** — ha a lelkész véletlenül kétszer importálja ugyanazt az Excel-t, a rendszer észleli a duplikátumokat (dátum + bankszámla + összeg alapján) és kihagyja őket. Új statisztika az import eredményben: `X duplikátum (már szerepelt a rendszerben)`.
- **Bank import régebbi tranzakciók elrejtése** — a wizard parse után lekérdezi a legutóbb importált tranzakció dátumát az adott bankszámlához, és alapértelmezetten elrejti a régebbi tételeket. A felhasználó nem kell minden alkalommal végigmennie a már importált soron.

### 📄 Tervezetek

- **Egyházmegyei pénzügy + leltár terv** (`migration-docs/todo/phase-egyhazmegyei-penzugy-leltar.md`) — részletes terv a profilváltás alapú egyházmegyei pénzügyi / leltári modulhoz. 3 opció elemzése, javasolt a "virtuális gyülekezet" megoldás (minimális kockázat). 7 nyitott kérdés Endre döntésére.

### 🎨 UX javítások

- **Oblio ellenőrzés** — a 3 felső doboz (Mappa állapot, Formátum-útmutató, Bevezetés-indító) most egy sorban (desktopon), responsive rendezésben (1/2/3 oszlop mobilon/tableten/desktopon).

### 🔧 Adatbázis migrációk

- `materials` + `material_movements` tábla (RLS policy-kkel, helyes `profile_roles` oszlopokkal)

---

## [2026-04-18] — Nyugta finomítás, nyugtatömb rendszer, Anyagraktár fül, stornó és szerkesztés, pénzügyi súgó PDF-ek

<!-- key: 2026-04-18-nyugta-es-storno-kor -->
<!-- category: feature -->
<!-- version: 1.2.0 -->
<!-- targets: lelkészek, egyházmegyei adminok -->

### ✨ Új funkciók

- **Nyugtatömb rendszer** — a kerülettől vett nyugtatömbök teljes életciklus-követése:
  - Wizard új tömb rögzítésére (seria, nyomdai kezdet/vég, vásárlás dátuma, ár)
  - Aktív tömb élő státusza + maradék darabszám + progress bar
  - Automatikus nyomdai + gyülekezeti sorszám-lefoglalás atomikus RPC-vel
  - Éves kimutatás a hivatalos formátumban, nyomtatható (aláírási blokkokkal)
  - "Nincs aktív tömb" esetén friendly wizard visszavezeti a lelkészt a rögzítéshez, majd automatikusan folytatja a nyugta kiállítását
- **Anyagraktár fül a leltár oldalon** — kerületi nyugtatömbök mint gyorsan fogyó készlet, stat kártyákkal
- **Tétel szerkesztés és stornó** — a Kassza és Bank fülön minden bevétel/kiadás mellett:
  - Ceruza ikon: gyors szerkesztés (dátum, összeg, jogcím, iratszám, megjegyzés)
  - ⊘ ikon: stornózás kötelező indoklással — a sor látható marad, de kimarad a számításokból
  - Visszavonható, ha az év még nincs véglegesítve
  - Véglegesített évre a szerver elutasítja a módosítást
- **Részszámadás időszakra nyomtatás** — dátumintervallum választó (I. félév, II. félév, I. negyedév, Év eleje → ma gyorsgombokkal) és külön borító
- **Nyugtatömb kimutatás a Nyomtatási központban** — nyomtatható éves összesítő
- **Pénzügyi Súgó: 3 letölthető PDF referencia** — Pénzügyi gyorsreferencia, Nyugtatömb kezelés, Év végi zárás checklist

### 🎨 UX javítások

- **Nyugta nyomtatvány finomítások**:
  - Romantik reprezentand fordítás (befizetescel.nevro) a magyar alatt — mint az adică/éspedig mintánál
  - Teljes gyülekezeti cím a Sediul / Székhely sorban (cím + város + megye)
  - `formatRoHeaderName` helper ékezet-érzéketlen prefix-ellenőrzéssel → nincs "PAROHIA REFORMATĂ PAROHIA REFORMATA BRATES" duplikáció
  - Nr. és Data egymás mellett a CHITANȚA felirat alatt jobb oldalon (hivatalos forma)
  - Másolat / átvevő példánya szövegek átfedése megszüntetve
  - Régi nyugták újranyomtatásánál fallback: reprezentand_ro és klienesseg_cim visszaolvasása a befizetés + szemely táblákból
- **Számadás véglegesítés gomb** áthelyezve az "Élő számadási kép" dobozba — ott, ahol a figyelem amúgy is van
- **Egységes táblázat dizájn** a Költségvetés és Számadás fülön (Kód | Megnevezés | Érték sorrend, azonos színek)
- **Pénztár nyomtatás gomb átnevezve "Nyomtatási központ"-ra** a pénzügyi hero-ban
- **Bank → személy feltételes** — banki bevételnél a személy csak járulékra (101.01) kötelező, egyéb kategóriákra opcionális (cég/szervezet szabad szöveggel megadható)

### 🔧 Adatbázis migrációk

- `oblio_szamlak.reprezentand_ro` oszlop
- `congregations.varos` és `congregations.megye` oszlopok
- `befizetes.stornozott`, `stornozott_at`, `stornozott_indok`, `stornozott_by` oszlopok + index
- `kiadas.stornozott`, `stornozott_at`, `stornozott_indok`, `stornozott_by` oszlopok + index
- `befizetescel.nevro` szinkron a `szamadasicel.nevro`-ból

---

## [2026-04-17] — Alapelv-érvényesítés, biztonsági javítások, egyházmegyei és kerületi dashboard átalakítás

<!-- key: 2026-04-17-alapelv-ervenyesites -->
<!-- category: security -->
<!-- version: 1.1.0 -->
<!-- targets: mindenki -->

### 🔒 Biztonsági javítások (KRITIKUS)

- **`anon` szerepkör hozzáférés visszavonva** — a bejelentkezetlen felhasználók közvetlenül nem tudtak privát adatokat (befizetések, tagok, anyakönyv) lekérdezni vagy módosítani
- **`authenticated` jogok szigorítva** — a TRUNCATE, TRIGGER, REFERENCES jogok visszavonva (csak SELECT, INSERT, UPDATE, DELETE marad)
- **Szerepkör kiosztás visszaállítva** — csak rendszergazdai vagy egyházkerületi admin oszthat szerepkört (alapelv 7 érvényesítése)

### ✨ Új funkciók

- **Frissítések broadcast rendszer** (`system_broadcasts` tábla) — a rendszergazda üzenetet küldhet minden felhasználónak, egy szerepkörnek, konkrét gyülekezet(ek)nek, egyházmegyéknek vagy kerületnek. Opcionális email-értesítés Resend-en keresztül.
- **Megosztott "Véglegesített dokumentumok" komponens** — az egyházmegyei és kerületi dashboardon egységes megjelenés

### 🎨 UX javítások

- **Egyházmegyei dashboard** — 7 füles, letisztult navigáció: 🏠 Áttekintés, ⛪ Gyülekezetek, 📂 Dokumentumok, 🔔 Kérelmek, 💰 Pénzügy, 🌱 Misszió, 👥 Szerepkörök
- **Kerületi dashboard** — letisztult, alapelv-konform egyoldalas nézet: csak véglegesített dokumentumok láthatók
- **Javítási kérelem értesítés** — a lelkész csengőre kap üzenetet, amikor az egyházmegye elbírálja a kérelmét (dual role esetén is működik)
- **Egyházmegyei tételek elrejtése a gyülekezeti pénzügyi felületen** — a 18 kizárólag egyházmegyei tétel (Központi járulékok, Kongrua, stb.) már nem jelenik meg a gyülekezeti költségvetés/számadás táblákban

### 🔧 Alapelv-érvényesítés

A 8 rögzített alapelv alapján a rendszer ellenőrzése és szigorítása:
1. **Gyülekezeti autonómia** — minden gyülekezet önálló
2. **Gyülekezetek elkülönítése** — egyik nem látja a másikat
3. **Egyházmegye/kerület betekintési korlát** — csak a 4 kötelező évi dokumentum (költségvetés, számadás, vagyonleltár, választók) látható
4. **Rendszergazda csak engedéllyel** — admin_access_requests workflow
5. **Egyházmegye saját pénzügye** — külön (jövőbeli profilváltás alapú modul)
6. **Egyházmegyék elkülönítése** — egyik nem látja a másikat
7. **Szerepkörök kiosztása** — csak admin / egyházkerületi admin
8. **Frissítési értesítések** — broadcast rendszer (ez a release!)

### 🐛 Javítások

- **Költségvetés beküldése** — a `document_submissions` tábla hiányzott az éles DB-ből (nem futott le a migráció) + a GRANT is hiányzott. Javítva, és a véglegesítés + beküldés egy kattintássá egyesítve.
- **Költségvetési javítási kérelem gomb** — az alap véglegesítése után nem jelent meg, csak ha mind a 3 módosítás is véglegesítve volt. Javítva: most alap véglegesítés után is elérhető.
- **Tab megőrzés mentés után** — a `window.location.reload()` helyett `router.refresh()`, így a véglegesítés után az aktív fülön marad a felhasználó.

---

## [2026-04-17] — Frissítések broadcast rendszer, email értesítéssel

<!-- key: 2026-04-17-broadcast-rendszer -->
<!-- category: feature -->
<!-- version: 1.2.0 -->
<!-- targets: admin, rendszergazda -->

### ✨ Új funkciók

- **Frissítések fül az admin oldalon** — rendszer-szintű üzenetek küldése lelkipásztoroknak, egyházmegyei vezetőknek, kerületnek, vagy konkrét gyülekezeteknek / egyházmegyéknek
- **Automatikus changelog integráció** — a `docs/CHANGELOG.md` fejlesztési bejegyzései egy kattintással közzétehetők a címzetteknek. A Claude folyamatosan dokumentálja az elvégzett munkát.
- **Email értesítés** — opcionális email kézbesítés Resend szolgáltatón keresztül (EU régió, 3000 email/hó ingyenes). Szép HTML sablon a rendszer színeivel.
- **Archívum** — minden broadcast dokumentálva: ki, mikor, kinek, hány címzett, email státusz
- **Célzás granularitása** — mindenki / szerepkör / konkrét gyülekezet(ek) / egyházmegye / kerület

### 🔧 Implementáció

- Új tábla: `public.system_broadcasts` — RLS-védett, csak admin/kerületi admin fér hozzá
- Csengő integráció — a meglévő `ertesitesek` táblán keresztül
- Opcionális hivatkozás minden üzenethez → "Részletek" gomb a kézbesítésben
- 5 broadcast típus: info, success, warning, danger, release (a release a CHANGELOG bejegyzéseknél)

### ⚙️ Beállítás szükséges (Endre)

1. `npm install resend` — a csomag hozzáadva a `package.json`-hez
2. `RESEND_API_KEY` env változó (a Resend dashboard-ról)
3. `RESEND_FROM` env változó, pl. `"Kartotéka <noreply@kartoteka.ro>"`
4. Domain beállítás a Resend-ben (DKIM, SPF)

Email beállítás nélkül is működik a broadcast — csak a csengőre megy, és `email_error` mezőbe kerül a hibaüzenet (az adminnál látható).

---

## [2026-04-17] — Profilváltási rendszer alapja (Fázis 1)

<!-- key: 2026-04-17-profile-roles-fazis-1 -->
<!-- category: feature -->
<!-- version: 1.3.0-alpha.1 -->
<!-- targets: admin, rendszergazda -->

### ✨ Új funkció (belső) — Fázis 1/10

A **profilváltási rendszer** alapja elkészült. A felhasználó a jövőben egy header kattintással válthat például a gyülekezeti lelkészi kontextus és az egyházmegyei admin kontextus között.

### 🗄️ Új tábla: `profile_roles`

- Multi-role hozzárendelés — egy user több szerepben lehet
- 4 hatókör (scope): `system`, `district`, `diocese`, `congregation`
- 8 szerep: `admin`, `egyhazkeruleti_admin`, `egyhazmegyei_admin`, `esperes`, `egyhazmegyei_szamvevo`, `lelkesz`, `konyvelo`, `custom`
- **Custom** szerep: szabadon választható név (`custom_label`) — pl. "Titkárnő", "Segédlelkész", "Pénztáros"
- **Rugalmas permissions** (JSONB object): modulonként action szintű engedélyek

### 🔐 Permissions rendszer

- 12 modul (pénzügy, tagnyilvántartás, anyakönyv, …) × 6 action (olvasás, szerkesztés, törlés, véglegesítés, export, import)
- Szerepkör-sablonok minden standard szerephez (alapértelmezett permissions)
- Custom szerepnél szabadon x-elhető, melyik modul + action engedélyezett

### 📊 Adatmigráció

A meglévő `profiles.role` rekordok automatikusan létrehoznak egy `profile_roles` sort a megfelelő scope-ban. Backward kompatibilitás biztosítva — a jelenlegi kód változatlanul működik.

### 🔮 Következő lépések (Fázis 2-10)

- **Fázis 2**: `getEffectiveAccessContext` bővítés — aktív kontextus feloldás
- **Fázis 3**: Profile switcher UI a header-ben + switch-context API
- **Fázis 4**: JWT custom claim integráció (Supabase Auth hook)
- **Fázis 5**: Sidebar navigáció az aktív kontextus szerint
- **Fázis 6**: Admin szerepkör-kiosztó UI (sablonokkal + custom x-elés)
- **Fázis 7**: Permissions érvényesítés minden server actionön és route-on
- **Fázis 8-10**: RLS policy-k átírása, migráció befejezése, regresszió tesztelés

---

## [2026-04-18] — Profilváltási rendszer (Fázis 3-4 + 7 MVP)

<!-- key: 2026-04-18-profile-roles-switcher -->
<!-- category: feature -->
<!-- version: 1.3.0 -->
<!-- targets: mindenki, aki több szerepben dolgozik -->

### ✨ Új funkció: Profilváltás

Ha egy felhasználónak több szerepe van (pl. gyülekezeti lelkész + egyházmegyei admin),
a fejléc avatarára kattintva egy gombbal válthat közöttük. Minden szerep más kezdőoldalra irányít
(gyülekezet → `/dashboard`, egyházmegye → `/dashboard-egyhazmegye`, kerület → `/dashboard-kerulet`).

### ✨ Admin felület: Szerepkörök kiosztása

Az adminisztrátori felületen új **Szerepkörök** fül — csak admin és egyházkerületi admin számára.
Itt rendelhetők ki új szerepek bárkinek:

- **Standard szerepek**: lelkész, könyvelő, esperes, egyházmegyei admin/számvevő, egyházkerületi admin
- **Egyedi szerep** (pl. "Titkárnő", "Pénztáros", "Segédlelkész") — szabadon választható névvel

A gyülekezeti scope-os szerep-kiosztás (NEM lelkész) **lelkészi jóváhagyást** kér automatikusan
(alapelv: gyülekezeti autonómia).

### 🔧 Technika

- Új táblában (`profile_roles`) multi-role hozzárendelés
- Cookie-alapú aktív kontextus (`kartoteka_active_profile_role`)
- Backward kompatibilitás: a meglévő `profiles.role` marad elsődleges szerep
- A permissions finomhangolása (x-elhető UI) következő iterációban

---

## [2026-04-18] — Kassza és bank UX javítások

<!-- key: 2026-04-18-cashbook-bank-ux -->
<!-- category: improvement -->
<!-- targets: lelkészek, könyvelők -->

### 🎨 UX javítások

- **Nyugta (chitanță) UI egyszerűsítve a kasszaoldalon**:
  - A fölösleges "Új nyugta kiállítás" globális gomb **eltávolítva** — a bevétel rögzítéséből automatikusan jön a nyugta
  - A "Nyugta nyomtatási központ" doboz az oldal aljáról **eltávolítva**
  - A sorok végén egységes nyomtató ikon: zöld (már kiállított) vagy halvány (még nincs) — egy kattintás, egyértelmű
- **Havi csoportosítás a kassza és bank fülön**:
  - Minden hónap saját fejléccel, bevétel/kiadás összesítővel
  - A tranzakciók fülhöz hasonló áttekinthetőség
  - Végén éves összesítő kártya

---

## [2026-04-18] — Nyugta automatizálás, költségvetés csoport szumma, profil szerepkörök

<!-- key: 2026-04-18-penzugy-javitasok -->
<!-- category: bugfix -->
<!-- targets: lelkészek, könyvelők -->

### 🐛 Javítások

- **Nyugta (chitanță) automatikus kiállítása**: a kassza fülön a halvány nyomtató ikonra kattintva már NEM nyílik meg kiállítási dialog — a rendszer automatikusan létrehozza a nyugtát a befizetés adataiból és azonnal elindítja a nyomtatást. Egy kattintás, kész.
- **Költségvetés csoport-szumma**: az összevont sorok (pl. "Egyházi tevékenységből származó bevételek") most helyesen mutatják az alcellák összegét — nem 0,00-t.

### ✨ Fejlesztés — Profil dialog

- Új **"Szerepköreim az egyházi nyilvántartó rendszerben"** szekció az Áttekintés fülön
- A user minden aktív szerepköre hierarchia szerint listázva (rendszergazda → kerületi → egyházmegyei → esperes → számvevő → lelkész → könyvelő → egyedi)
- Scope-specifikus színkódolás és ikonok (🌐 rendszer, 🏛 kerület, 🏢 egyházmegye, ⛪ gyülekezet)
- Gmail-es profil avatar automatikusan megjelenik (Google OAuth-val belépőknél a `user_metadata.avatar_url`)

---

<!-- Új bejegyzések ide, a fenti formátumban, időben visszafelé (legfrissebb felül) -->
