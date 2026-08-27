# Pénzügy-modul átvilágítás — 2026-08-27

**Bizonyíték-jelölés minden állításnál:**
`[ADAT]` = az éles adatbázisból SQL-lel igazolva · `[SÉMA]` = az éles séma katalógusából igazolva ·
`[KÓD]` = a forrásból olvasva · `[XLSX]` = az Adatok_2025.xlsx képleteiből · `[NYITOTT]` = még nem eldöntött

Ami nincs megjelölve, az következtetés — és ilyet szándékosan alig hagytam a dokumentumban.

---

## 0. A legfontosabb két mondat

**A banki import kiadás-oldala 100%-ban elhasal, és a megbukott import 65 425 RON fantom bevételt hagyott a könyvben.**

A hét pár nélküli átvezetésről a rendszer **semmilyen figyelmeztetést nem adott**, mert a
párosítatlan-átvezetés őre csak a MÁR párosított sorokat nézte — pontosan azokat szűrte
ki, amiket jeleznie kellett volna.

> **Két korábbi állításomat vissza kellett vonnom** (mindkettő repó-alapú következtetés
> volt, nem mérés): (1) az újraimport **nem** duplikálna — alkalmazás-szinten van
> fail-closed duplikátum-védelem; (2) az Excel és az app 2025-ös készpénz zárója
> **egyezik** — a jelzett 4 795 lejes eltérés az én kevert év-fogalmú számításom hibája volt.
> A részletek a megfelelő szakaszoknál.

---

## 1. hiba — A banki import kiadás-oldala (BLOKKOLÓ)

### Gyökérok

A `kiadas` táblán **nincs `kedvezmenyzett` oszlop** `[SÉMA]`. A partner-oszlop neve `atvevo`, a személy-hivatkozásé `atvevoid`. A hasonló nevű `kedvezmenyezett_cui` (egy plusz „e"!) más célt szolgál, a `kedvezmenyezett` pedig csak a megyei/kerületi táblákon létezik.

A kód mégis ezt írja, **három** helyen `[KÓD]`:

| Hol | Melyik ág |
|---|---|
| `import-transactions.ts:629` | sima banki kiadás |
| `import-transactions.ts:762` | belső mozgás — bank-oldali kiadás |
| `import-transactions.ts:815` | belső mozgás — counterpart kiadás |

### Miért nem fogta meg a beépített védőháló

A kód kétlépcsős „reference → canonical" fallbackot használ. Ez **szerkezetileg képtelen** védeni `[KÓD]`:

```
const reference = { ...canonical, nyugta, xkey, atvevo, atvevoid }
```

A `reference` a `canonical` **szó szerinti spreadje** — a hibás mező mindkét payloadban benne van, így mindkét próbálkozás ugyanazon bukik el.

**A canonical amúgy is halott**: a `kiadas.xkey` és `kiadas.nyugta` **NOT NULL, alapérték nélkül** `[SÉMA]`, a canonical viszont egyiket sem tartalmazza. A belső mozgás canonicaljaiból a `userid` is hiányzik. Vagyis a „védőháló" **három független okból** szakadt — nem foltozni kell, hanem kivenni.

### A tényleges kár az éles adatban

A mai import 23 bevételt írt be és **0 kiadást** `[ADAT]` — mind a 93 kiadás elhasalt.

A 23-ból **hét** a `301.01` (*„Készpénzletétel a kasszából"*) kategóriába került, ami **belső mozgás**, nem bevétel — és mindegyik **párosító kulcs nélkül** `[ADAT]`:

| Dátum | Összeg (RON) |
|---|---|
| 2026-02-18 | 2 055,00 |
| 2026-02-18 | 15 015,00 |
| 2026-04-16 | 16 300,00 |
| 2026-06-03 | 13 850,00 |
| 2026-06-03 | 1 710,00 |
| 2026-06-03 | 6 495,00 |
| 2026-07-09 | 10 000,00 |
| **Összesen** | **65 425,00** |

Két független úton is kijön: a hét tétel összege 65 425, **és** a `301.01` összforgalma (153 280) mínusz a párjáé (`400.01` = 87 855) = **65 425** `[ADAT]`.

**Következmény**: ez a pénz a kasszából ment a bankba. A banki oldal helyes, de a **kassza-oldali kimenő tétel sosem jött létre** — a kassza többet mutat a valóságnál, a bevétel-összesenbe pedig bekerült egy összeg, ami nem új bevétel.

### Az importot NEM szabad újrafuttatni

Az egyediségi indexek feltétele `[SÉMA]`:

```
WHERE deleted = false AND irattipus ~~* '%észpénz%' AND belso_mozgas_xkey IS NULL
```

A tényleges `irattipus` értékek `[ADAT]`: kiadásnál `Extr` (142), `OP` (65), `Fact.+Bon.` (43), `Bon fiscal` (19), `Chit.` (8) — **egyik sem** tartalmazza, hogy „észpénz". Befizetésnél csak a 70 `Készpénz` sor.

**Vagyis a `uniq_kiadas_iratszam_year_congregation` index jelenleg pontosan nulla sort véd.**

⚠️ **KORREKCIÓ (2026-08-27):** ebből korábban azt vontam le, hogy az újraimport
duplikálna. **Ez téves volt.** Az adatbázis-index valóban inert, DE alkalmazás-szinten
VAN működő, **fail-closed** duplikátum-védelem `[KÓD]`: `hasExistingBankTransaction()`
— `congregation_id` + `bankszamla_id` + `datum` + `osszeg` ±0,01, és a varázsló a
találatot „N duplikátum (már szerepelt a rendszerben)" címkével ki is írja.
Az első importnál azért mutatott nullát, mert még nem volt mihez képest duplikálni.
**Az újraimport tehát biztonságos.**

Ráadásul az iratszám erre **soha nem is lesz alkalmas**: az `Extr` a havi kivonatszám, ami természetesen ismétlődik, a `Chit.` nyugta pedig több tételsort fedhet — mindkettő szándékos. Új ujjlenyomat kell: **bankszámla + dátum + összeg + a közlemény normalizált kivonata**.

### További lelet

A banki import **nem naplózza magát**: az `import_logs`-ban nincs mai bejegyzés (utolsó pénzügyi import: 2026-06-20) `[ADAT]`. A 93 hibás sornak semmilyen nyoma nincs a rendszerben.

### Döntést igényel

A 65 425 RON rendezésére két út van — **könyvelői döntés**:

- **A)** A hét sor törlése, majd újraimportálás belső mozgásként (mindkét oldal szabályosan létrejön).
- **B)** A hiányzó kassza-oldali `400.01` kiadások pótlása közös párosító kulccsal (a helyes banki oldal marad).

⚠️ Előbb ellenőrizni kell, hogy **ezek a letétek nincsenek-e már rögzítve a kasszában más módon** — különben a pótlás duplán vonna le. `[NYITOTT]`

---

## 2. Nyitó egyenleg

### Ami már megvan

Az automatikus évforduló-átvezetés **létezik és lefutott** `[ADAT]`: a `bankszamla_nyito_egyenleg` táblában van egy 2026-os sor `forrasa: "carryover"` jelöléssel, *„Automatikusan áthozva a 2025. évi záró egyenlegből"* — 5 136,78 RON, ma 10:18-kor keletkezett.

### Ami hiányzik

**Négy helyen él nyitó egyenleg, és ellentmondanak** `[ADAT]`:

| Tároló | 1. sz. bankszámla |
|---|---|
| `bankszamlak.nyito_egyenleg` | **15 000** |
| `bankszamla_nyito_egyenleg` (2025) | **107 771,39** |
| `bealitas.nyito_bank` | **0,00** |

Az áthozatal **hiányos** `[ADAT]`:
- ✅ 1. bankszámla, 2026 — megvan
- ❌ 2. bankszámla (EUR), 2026 — **nincs**
- ❌ készpénz, 2026 — **nincs** (csak 2025-ös: 12 519,86)

### Latens csapda

A bázis-ablak (`maxDepth`) csendben eldobja a régebbi rögzített nyitót. A 2018-as bázissal ez **2027-ben sül el először** `[KÓD]` — idén még nem.

Az irányítópult ezzel szemben **fail-closed**: ha a nyitó nem számolható, „Nem számolható" jelenik meg, nem 0 `[KÓD]`.

### A kérésed teljesítéséhez

*„Automatikusan hozza át, csak ellenőrzésképpen írja ki"* — a mechanizmus fele megvan. Kell: a készpénz-ág bekötése, a devizás számla kezelése, és **egy döntés arról, melyik tároló a mérvadó** (ma három különböző számot mutat ugyanarra a számlára).

---

## 3. Személy-hozzárendelés adománynál / egyházfenntartásnál

### A jelenlegi állapot

`[ADAT]` — a személyhez kötöttség évenként:

| Év | Befizetés | Személyhez kötve | Sehová |
|---|---|---|---|
| 2025 | 516 | 459 | 57 |
| 2026 | 53 | 21 | **30** |

A 2026-os romlást **a banki import okozza**: a `personId` mező végig üresen utazik, senki nem tölti ki `[KÓD]`.

### A javítás csapdája

**Két független varázsló-másolat létezik** `[KÓD]`:
- `apps/web/components/modals/bcr-import-wizard-dialog.tsx` ← **ez az élesben használt**
- `packages/ui-app/src/finance/BcrImportWizardBody.tsx` (desktop)

Aki csak a megosztott csomagbelit javítja, a webet **nem** javítja meg.

### További korlát

Az importőr csak bizonyos kódoknál kísérel meg személy-párosítást (`person-scope-config.ts`): 101.01, 101.04, 104.05, 101.06, 102.06, 103.06, 103.08, 202.08 — **a többi kódnál egyáltalán nem** `[KÓD]`. Az adomány-kódok jelentős része kimarad.

### Jó hír

Visszamenőleges hozzárendelés **lehetséges**: a Kassza és a Bank fül a `bankszamla_id` szerint particionálja ugyanazt a halmazt, tehát minden befizetéshez van pontosan egy fül, ahonnan a szerkesztő megnyitható `[KÓD]`.

---

## 4. Megjegyzés-oszlop a banki importnál

A `megjegyzes` mező **létezik** a típusláncban és a DB-ben is `[SÉMA]`, de **egyetlen felület sem tölti ki** — az import a banki leírást írja bele `[KÓD]`.

**Ugyanaz a kétmásolatos csapda**, mint a 3. pontnál: a kategorizáló táblázat ~100 sora két helyen él, whitespace-eltéréssel. Mechanikus őrszem ma nem tudná összevetni őket `[KÓD]`.

A táblázat ma 6 oszlopos, mobil változata nincs. ⚠️ A szélesség-becslést **böngészőben kell megmérni**, nem papíron összeadni — ez nálunk már egyszer elsült.

---

## 5. „Adományozók és szponzorok" fül

### Az adat, ami rendelkezésre áll

Az adomány/szponzor kategóriák `[ADAT]`:

| Kód | Megnevezés |
|---|---|
| 101.03 | Perselypénz |
| 101.04 | Adományok hívektől, egyházi intézményektől |
| 101.05 | Úrasztali adományok |
| 102.04 | Diakóniai célú adományok |
| 102.05 | Missziós célú adományok |
| 102.06 | Legátumok |
| 103.01 | Segélyszervezetektől, alapítványoktól |
| **103.09** | **Szponzortámogatások, adók 3,5%-a** |
| 105.01–105.02 | Intézményi támogatások |

**Bank vs készpénz megkülönböztetés**: a megbízható jel a `bankszamla_id IS NOT NULL`, **nem** az `irattipus` szövege `[KÓD]` — amit az adat fényesen igazol: `banki`, `Extr`, `OP`, `Chit.`, `Készpénz` és 5 üres érték keveredik `[ADAT]`.

### A két akadály

**Cég-törzs nincs a bevételi oldalon** `[SÉMA]`. CUI-mező csak a kiadás oldalon van. Az adományozó cég ma **csak szabad szöveg** (`forrasa`) — elgépelt nevek nem állnak össze. (Egyetlen szűk kivétel: a `berleti_szerzodes` táblán van `ceg_nev` + `ceg_adoszam`, de az a bérlőkre vonatkozik, és a befizetéshez nincs kötve.)

**Az `id_szemely` többségében üres lesz** — épp a fenti adomány-kódoknál nem próbál párosítani az importőr `[KÓD]`.

### Megvalósítási minta

A fülhöz **két kész kapu-minta** van: hatókör-kapu (`gyulekezeti` prop) és jogosultság-kapu (`showAdminImport`) `[KÓD]`.

⚠️ A `DebtTab` több-éves oszlopos nézete **alvó képesség, nem működő minta** — egyetlen hívó sem adja át a `debtRowsByYear` propot `[KÓD]`. Ezt nem lehet mintaként másolni.

---

## 6. Az Excel belső működése — a kért diagnosztika

### Szerkezet `[XLSX]`

12 lap, mind jelszóval védett (`lockStructure="1"`), rejtett lap nincs:

- **Kassza** — készpénznapló
- **A–F** — hat bankszámla-lap (a `D3` cella a pénznem: A = RON, B = EUR)
- **Kasszakonyv** — nyomtatható pénztárnapló
- **Hibak** — katalógus + hibajelző mátrix
- **Szamadas**, **Koltsegvetes** — hivatalos ívek
- **Monetar** — címletjegyzék

Minden naplósor azonos szerkezetű: `D`=dátum, `E`=iratszám, `F`=irattípus, `G`=név, `H/I`=bevétel, `J/K`=kiadás, `M`=román név (VLOOKUP), `N`=költségvetési kód (VLOOKUP).

### Készpénz ↔ bank átvezetés

**Kétszer, kézzel kell beírni**: a kiadó lapon kiadásként, a fogadó lapon bevételként, külön kategórianévvel. A két láb között **semmilyen technikai kapcsolat nincs** — se azonosító, se iratszám, se képlet `[XLSX]`.

✅ **Kettős számbavétel NINCS**: a belső mozgás nevei egyetlen Számadás-soron sem szerepelnek, így az átvezetés soha nem kerül a bevétel/kiadás összesenbe `[XLSX]`.

### Bank ↔ bank átvezetés

**Van rá teljes mechanizmus**: a Hibak-lap 840 tételes, irányfüggő belső-mozgás katalógust tartalmaz. 2025-ben azonban **egyetlen bank↔bank mozgás sem történt** — csak 15 kassza→A (87 855 lej) és 1 A→kassza (200 lej) `[XLSX]`.

### ⚠️ A hiányosság, amit sejtettél — és ami a legsúlyosabb

**A nyitó egyenleg mind a 7 lapon kézzel begépelt konstans** (`H6`), és a munkafüzetben **egyáltalán nincs külső hivatkozás** az előző évi fájlra `[XLSX]`.

Ennél rosszabb: **az egyetlen globális kereszt-ellenőrzés matematikailag képtelen észrevenni az elgépelést.** A `Hibak!Y6` a `Szamadas!G213`-at veti össze a `G214+G215`-tel, de a `G213 = SUM(G101, G152, -G212)` képletben a `G101` **ugyanazokból a H6 cellákból** áll össze, mint amiket a `G214+G215` is tartalmaz — **a nyitó tag kiesik a különbségből**.

> Egy 1000 lejjel elrontott nyitó egyenleg végigfut az egész számadáson, és a fájl végig **0 eltérést** jelez.

### A párosítás-ellenőrzés gyengesége

Az egyetlen átvezetés-ellenőrzés egy 21×21-es mátrix, amely irányonként **csak az ÉVES ÖSSZESENT** hasonlítja össze `[XLSX]`. Nincs tételszintű párosítás, nincs dátum-összevetés, nincs darabszám-ellenőrzés.

**Két ellentétes hiba némán kioltja egymást**: ha az egyik átvezetést 500-zal többre, egy másikat 500-zal kevesebbre írják, a mátrix 0-t mutat.

Ugyanígy láthatatlan az **év végén átnyúló** átvezetés (kassza-láb dec. 31., bank-láb jan. 2.) — erre a modellben nincs fogalom.

**És már el is sült**: a 16 átvezetés-lábból a `Kassza!14–15` dátuma 2025-01-09, a párjáé (`A!8–9`) 2025-01-08 — **egy nap eltérés** `[XLSX]`. A mátrix ezt nem látja, mert éves szinten egyezik.

### További Excel-leletek `[XLSX]`

| Lelet | Következmény |
|---|---|
| A **B lap „EUR"**, de a munkafüzetben **sehol nincs árfolyam** | a devizás egyenleg lejként adódik a banki összesenhez |
| A **Monetar** lapon nincs feltételes formázás | a jelenlegi **0,26 lej** pénztári eltérés némán lóg |
| A bankok záró **kivonat-egyenlege sehol nem szerepel** | ha egy banki tétel kimarad vagy duplán kerül be, semmi nem jelzi |
| A **7. bankszámla (G)** hozzáadása némán vak | nincs legördülő, nincs Számadás-oszlop, nincs hibaellenőrzés |
| A hibamátrix **lyukas**: egy blokk nem létező cellákra hivatkozik | örökké 0-t (hamis zöldet) mutat |
| Az `A!M7:M42` képlet **hiányzik** | 36 tételnél üres a román megnevezés |
| A Számadás **név szerint** aggregál, nem kód szerint | záró szóköz / sortörés a nevekben → néma kimaradás |
| Az 50 000 lejes kasszaplafon **kétszer bedrótozva**, és csak az **év végi** egyenleget nézi | év közben átlépett plafon utólag nem derül ki |

### Excel ⇄ app eltérés

Az Excelben a belső mozgás kódja **irányfüggő és számlafüggő** (840 kód). Az app **öt generikus kódot** ismer, és a kassza↔bank párnál mindig ugyanazt írja, függetlenül attól, melyik bankszámláról van szó `[KÓD]`.

Ez **rögzített tervezési döntés** volt (kanonikus 5 kód), nem hiba — de az Excel-export betű-alapú névfeloldásánál számít.

---

## 7. Konzol-hibák

| Üzenet | Ítélet |
|---|---|
| `Recharts width(-1) height(-1)` | **valós** — rejtett fülben renderelő diagram `[KÓD]` |
| `sw.js no-response` a `/penzugy#bank`-on | valószínűleg egy **2026-08-24 előtti** service worker vezérelte a fület; a mai kód másképp működik `[NYITOTT]` |
| `message channel closed` | **böngészőbővítmény**, nem az app — külső zaj |
| `preloaded but not used` | **nem fölösleges**: a `lg:hidden` alatti `<img>` is letöltődik |

---

## 8. Duplikátum-figyelmeztetés kézi rögzítéskor (az új kérés)

### Jó hír: zajmentes lesz

Az álriasztás-próba **548 kassza-bevételen 0 találatot** adott a helyes szűrőkkel `[ADAT]`.

### A blokkoló csapda, amit kezelni kell

A kassza↔bank átvezetés két sora **definíció szerint azonos dátumú és azonos összegű** `[KÓD]`. Szűrő nélkül **minden** készpénzletételnél rászólna a rendszer. A kizárókulcs: `belso_mozgas_xkey IS NULL`.

### A helyes kulcsok

| Mit | Hogyan | Miért |
|---|---|---|
| „banki eredetű" | `bankszamla_id IS NOT NULL` | az `irattipus` szövege megbízhatatlan `[ADAT]` |
| összeg | `COALESCE(osszeg_ron, osszeg)` | devizásnál az `osszeg` a deviza-összeg `[KÓD]` |
| kizárás | `belso_mozgas_xkey IS NULL`, `deleted = false`, `stornozott = false` | álriasztás ellen |
| önmaga | `excludeId` szerkesztésnél | bevált minta: `check-receipt-duplicate.ts:53` |

### Hol a kapu

A kézi rögzítés **egy közös kapun** megy: `CombinedEntryBody.handleSave()` — **web és desktop közös** `[KÓD]`. Az `IncomeDialogBody` / `ExpenseDialogBody` **nem élő felület**, csak típusforrás.

⚠️ De **7+ út megkerüli**: Dispoziție, Decont, általános bevétel-import, egyházfenntartás-import, évvégi árfolyam-átértékelés, desktop egyedi lapok `[KÓD]`. Szerveroldali réteg is kell.

### Technikai adottságok

- ✅ `pg_trgm v1.6` és `unaccent v1.1` **telepítve** `[SÉMA]`
- ❌ A teljesítmény-index (`idx_befizetes_dup_lookup`, `idx_kiadas_dup_lookup`) **NEM létezik élesben** `[SÉMA]` — a migrációs fájl megvan, de sosem futott le
- ⚠️ A két kész fuzzy implementáció **web-only** — a megosztott `CombinedEntryBody` egyiket sem éri el `[KÓD]`

---

---

## ✅ LEZÁRVA — az Excel és az app 2025-ös készpénz zárója EGYEZIK

Korábban 4 795,00 lej eltérést jeleztem az app (1 668,74) és az Excel (6 463,74)
között. **Ez az én mérési hibám volt, nem a rendszeré** — az 5. kör tisztázta `[ADAT]`:

| Számítás | Eredmény |
|---|---|
| (A) `fizetettev` szerint | 12 519,86 + 101 952 − 112 803,12 = **1 668,74** |
| (B) `datum` szerint | 12 519,86 + **106 747** − 112 803,12 = **6 463,74** |
| Excel `Kassza!H3` | **6 463,74** ✅ |

A 4b. körben a bevételt `fizetettev`, a kiadást viszont `datum` szerint összegeztem —
két különböző év-fogalom keverve. A `datum` szerinti számítás **karakterre egyezik**
az Excellel.

A különbséget 35 db, 2025-ben befolyt, de korábbi évekre (2021–2024) szóló
**hátralékos járulékfizetés** és 2 db 2026-ra szóló előre fizetés adja — összegük
pontosan 4 795,00 `[ADAT]`.

**A rendszer helyesen és következetesen használja a két fogalmat** `[KÓD]`:

| Fogalom | Hol | Mire |
|---|---|---|
| `datum` | `getYearFinanceRecords`, `resolve-nyito` | pénzmozgás: egyenleg, Számadás, nyitó-áthozatal |
| `fizetettev` | tagonkénti járulék-lekérdezések | „melyik évre szól" — hátralék-nyilvántartás |

A 2026-os készpénz nyitó tehát **6 463,74** lesz, egyezően az Excellel.

---

## Nyitott kérdések — döntést igényelnek

1. **A 65 425 RON rendezése**: A) törlés + újraimport, vagy B) a hiányzó kassza-oldali tételek pótlása?
2. **Rögzítve vannak-e ezek a letétek a kasszában más módon?** — ezt SQL-lel ellenőrizni kell a döntés előtt.
3. **Melyik nyitó-egyenleg tároló a mérvadó?** — ma három különböző számot mutat ugyanarra a számlára.
4. **Az Excel nyitó-egyenleg problémája**: az app átvegye-e az ellenőrzést, amit az Excel matematikailag nem tud elvégezni?

---

## Munkasorrend-javaslat (jóváhagyásra)

| # | Tétel | Miért ebben a sorrendben |
|---|---|---|
| 1 | A `kedvezmenyzett` javítása + a halott fallback kivétele | blokkoló; enélkül semmi más nem tesztelhető |
| 2 | Import-ujjlenyomat és -naplózás | enélkül az újraimport duplikál |
| 3 | A 65 425 RON rendezése | a döntésedtől függ |
| 4 | Megjegyzés-oszlop + személy-választó a varázslóban | egy körben, mert ugyanaz a két fájl |
| 5 | Nyitó egyenleg egységesítése | önálló, nem blokkol |
| 6 | Duplikátum-figyelmeztetés | épít az 1–2-re |
| 7 | Adományozók és szponzorok fül | önálló, a legkevésbé kockázatos |
| 8 | Recharts + service worker | apró, bármikor |

**A megvalósítás a jóváhagyásodra vár** — a rögzített munkaszabály szerint felmérés után megállok.
