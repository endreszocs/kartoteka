# Pénzügyi modul — Implementáció validálás (Alfázis 4a)

Összevetve: `rules/finance-rules.md` + `workflows/finance-flow.md` vs. implementált kód.

Utolsó frissítés: 2026-04-06

**Megjegyzés:** A validáció csak az implementált alfázist (4a — Bevételek + Kiadások + Dashboard + Tranzakciók) vizsgálja. A 4b–4d alfázisok (Költségvetés, Számadás, Bank, Belső mozgás, Monetár, Tartozások, Nyomtatás, Audit) placeholder-ek — ezeket a következő sprintekben kell implementálni.

---

## 1. Hiányzó funkciók

### IMPLEMENTÁLT (4a alfázis — kész)

| # | Funkció | Állapot |
|---|---------|---------|
| ✅ | Dashboard: 4 KPI kártya (kassza, bank, bevétel, kiadás) | KÉSZ |
| ✅ | Dashboard: egyenleg banner | KÉSZ |
| ✅ | Dashboard: friss tranzakciók | KÉSZ |
| ✅ | Bevétel rögzítés (egyedi): tag keresés, kategória, dátum, iratszám | KÉSZ |
| ✅ | Kiadás rögzítés: partner, kategória, leltár auto-jelölés | KÉSZ |
| ✅ | Tranzakció lista: egységes nézet, havi szűrő, törlés (soft delete + BM mindkét oldal) | KÉSZ |
| ✅ | Jövőbeli dátum blokkolás | KÉSZ |
| ✅ | Visszamenőleges dátum figyelmeztetés | KÉSZ |
| ✅ | Nyugtaszám auto-ajánlat | KÉSZ |
| ✅ | Átviteli egyenleg számítás | KÉSZ |
| ✅ | Kategória map-ek (bevCelMap, kiaCelMap) | KÉSZ |
| ✅ | BM kategória ID-k (bmBevCelIds, bmKiaCelIds) | KÉSZ (felkészülve 4c-re) |

### NEM IMPLEMENTÁLT — 4a alfázisból HIÁNYZIK

| # | Funkció | Szabály hivatkozás | Leírás |
|---|---------|-------------------|--------|
| H1 | **Bevétel batch mód** | FLOW 4 | A táblázatos/tömeges bevétel rögzítés (többéves járulék, több tag, soronkénti validáció). Az `IncomeBatchDialog` nem lett létrehozva. |
| H2 | **Iratszám duplikáció ellenőrzés** | Szabály 2 / Sorszámozás + FLOW 3 | A `checkReceiptDuplicate` action nem lett implementálva. A bevétel form-ban nincs valós idejű duplikáció badge. |
| H3 | **Járulék kedvezmény auto-alkalmazás** | Szabály 2 / Járulék kedvezmények | A kedvezmény rendszer (kor, jövedelem, időszaki, személyi) nincs implementálva a bevétel dialog-ban. A `jarulek_kedvezmeny` tábla olvasása megtörténik az init-ben, de a dialógban nem alkalmazódik. |
| H4 | **Családi összekötés bevételnél** | FLOW 3 / „Családtagok megjelennek" | Ha a kiválasztott személynek van családja, a családtagokat kellene megjeleníteni. Az `id_csalad` nincs beállítva a bevétel mentésnél (mindig null). |
| H5 | **Cég/szervezet keresés bevételnél** | Szabály 2 / Bevétel rögzítés | A bérleti szerződésekből betöltött cégek (`_savedCompanies`) nem kereshetők a bevétel form-ban — csak személyek. |
| H6 | **Kiadás tételes bontás** | Szabály 2 / Kiadás rögzítés + FLOW 5 | Egy kiadás több kategóriára bontása nem implementált. |
| H7 | **Éves beállítás létrehozás modal** | FLOW 2 | Ha nincs `bealitas` rekord, a page.tsx statikus hibaüzenetet mutat. A régi rendszerben modal jelent meg a beállítások kitöltésére. |

### NEM IMPLEMENTÁLT — 4b–4d alfázis (tudatosan halasztott)

| # | Funkció | Alfázis |
|---|---------|---------|
| H8 | Költségvetés (terv, véglegesítés, revízió, feloldás) | 4b |
| H9 | Számadás (terv vs. tény, záró leltár, véglegesítés) | 4b |
| H10 | Kassza (pénztárkönyv, havi bontás, nyomtatás) | 4c |
| H11 | Bank (tranzakciók, BCR import, bankszámla CRUD) | 4c |
| H12 | Belső mozgás (4 típus, kettős bejegyzés) | 4c |
| H13 | Monetár (pénztári egyeztetés) | 4c |
| H14 | Tartozások (járulék + bérleti hátralék, kedvezmény) | 4d (eredetileg 4a, de halasztva) |
| H15 | Bérleti szerződés CRUD | 4d |
| H16 | Sorszám audit (hiányzó számok) | 4d |
| H17 | Párosítatlan befizetések (asszonynév felismerés, összekötés) | 4d |
| H18 | Nyomtatások (költségvetés, számadás, pénztárkönyv PDF, iktatás) | 4d |
| H19 | Járulék beállítás kezelés modal | 4d |

---

## 2. Nem implementált szabályok (a 4a alfázisban)

| # | Szabály | Állapot | Megjegyzés |
|---|---------|---------|-----------|
| S1 | Pénznem = RON, formázás: szóköz+vessző | ✅ | `formatCurrency()` |
| S2 | Bevétel: személyhez/céghez rendelés | ⚠️ RÉSZBEN | Személykeresés van, cégkeresés NINCS |
| S3 | Kiadás: partner + kategória + leltár auto | ✅ | `isInventoryCategory()` + `leltar_tetelek` INSERT |
| S4 | Jövőbeli dátum BLOKKOLVA | ✅ | Kliens badge + gomb letiltás + szerver Zod refine |
| S5 | Visszamenőleges dátum FIGYELMEZTETÉS | ✅ | Kliens badge (sárga) |
| S6 | Nyugtaszám: automatikus következő | ✅ | `getNextReceiptNumber()` |
| S7 | Nyugtaszám: duplikáció ellenőrzés | ❌ | Nincs valós idejű duplikáció badge |
| S8 | Nyugtaszám: hiányzó szám jelzés | ❌ | Nincs sorszám audit badge |
| S9 | Kettős sorszámrendszer (normál + BM) | ⚠️ RÉSZBEN | BM sorszám action felkészítve, de belső mozgás nincs implementálva |
| S10 | Soft delete tranzakciókra | ✅ | `deleteTransaction()` + BM mindkét oldal |
| S11 | Átviteli egyenleg automatikus | ✅ | Előző évi bev/kia összesítés az init-ben |
| S12 | Járulék kedvezmény (4 típus) | ❌ | Init betölti, de a dialógban nem alkalmazódik |
| S13 | Bevétel: többsoros (több kategória) | ❌ | Csak 1 kategória sor van a bevétel form-ban |
| S14 | Kiadás: tételes bontás | ❌ | Nincs implementálva |
| S15 | Költségvetés véglegesítés/zárolás | ❌ | 4b alfázis |
| S16 | Számadás véglegesítés/feloldás | ❌ | 4b alfázis |
| S17 | Belső mozgás kettős bejegyzés | ❌ | 4c alfázis |
| S18 | Tartozás számítási mód (akkori/aktuális) | ❌ | 4d alfázis |

---

## 3. Lehetséges bugok

| # | Bug | Fájl | Leírás | Súlyosság |
|---|-----|------|--------|-----------|
| B1 | **Bevétel: `id_csalad` mindig null** | `income-dialog.tsx` | A `saveIncome()` híváskor az `id_csalad` nincs beállítva — nincs családi összekötés. A régi rendszerben a `selectMemberForIncome()` automatikusan beállította az `id_csalad`-ot a `personToFamilyMap`-ból. Ez a járulék-nyilvántartásnál fontos (családi szintű fizetés). | MAGAS |
| B2 | **Tag keresés: diakritika-normalizálás hiányzik** | `actions.ts:searchMembersForFinance` | A `searchMembersForFinance` nem normalizálja a diakritikákat (á→a, é→e). A régi rendszer `NFD` normalizálást használt. Ha a felhasználó „Kovacs"-ot ír „Kovács" helyett, nem talál. | KÖZEPES |
| B3 | **Dashboard: `formatHuDate` importálva de nem használva** | `dashboard-tab.tsx:6` | Az import felesleges — dead code. | ALACSONY |
| B4 | **Tranzakciók: kategória név megjelenítés konzisztencia** | `transactions-tab.tsx:getCelName` | A `getCelName` a `szamadasiCellek`-ben keresi a kódot `c.id === kod`-dal. Ha az `id` mező és a `kod` mező különbözik a szamadasicel-ben, nem találja meg. A régi rendszer a `sorszam` → `kod` mapping-et használta. | KÖZEPES |
| B5 | **Bevétel: dátum validáció kliens-oldalon `new Date().toISOString().slice(0,10)` lehet eltérő időzónában** | `income-dialog.tsx` | Ha a böngésző UTC-ben van és a felhasználó UTC+2-ben (Románia), a „mai nap" eltérhet. Ez jövőbeli/múltbeli dátum hibás értékelését okozhatja. | ALACSONY |

---

## 4. Edge case hiányok

| # | Edge case | Szabály | Állapot |
|---|-----------|---------|---------|
| E1 | Összeg 0 vagy negatív | Bevétel/Kiadás | ✅ Zod: `positive()` |
| E2 | Dátum jövőbeli | Bevétel/Kiadás | ✅ Kliens + szerver |
| E3 | Dátum visszamenőleges | Bevétel/Kiadás | ✅ Kliens figyelmeztetés |
| E4 | Személy nincs kiválasztva (bevétel) | Bevétel | ✅ Megengedett (forrasa szabad szöveg) |
| E5 | Kategória nincs kiválasztva | Bevétel/Kiadás | ✅ Kliens check + Zod |
| E6 | Iratszám duplikátum (DB) | Bevétel | ❌ NINCS ELLENŐRZÉS |
| E7 | Iratszám duplikátum (batch-ben) | Bevétel batch | ❌ Batch nem implementált |
| E8 | Kimaradt sorszám | Audit | ❌ Nincs audit badge |
| E9 | Leltár auto-jelölés: nem leltár kategória de manuálisan bejelölt | Kiadás | ✅ A felhasználó felülírhatja |
| E10 | Belső mozgás törlés: mindkét oldal | Tranzakció | ✅ `deleteTransaction()` `belso_mozgas_xkey` alapján |
| E11 | Összeg tizedes kerekítés | Bevétel/Kiadás | ✅ `formatCurrency()` 2 tizedes |
| E12 | Nincs éves beállítás (bealitas) | Init | ⚠️ RÉSZBEN — statikus hiba üzenet, nem modal |
| E13 | Nincs egyetlen tranzakció sem | Dashboard | ✅ „Nincs tranzakció." üzenet |
| E14 | Járulék kedvezmény aktív de nem alkalmazódik | Bevétel | ❌ Kedvezmény rendszer nem implementált a form-ban |
| E15 | Több bevételi sor egy személyhez | Bevétel batch | ❌ Batch nem implementált |

---

## 5. Összefoglaló

### Alfázis 4a implementáltsági állapot

| Kategória | Összes (4a-hoz tartozó) | Kész | % |
|-----------|------------------------|------|---|
| **Szabályok (4a)** | 14 | 8 | 57% |
| **Flow-k (4a)** | 5 (FLOW 1,2,3,5,16) | 3 | 60% |
| **Edge case-ek (4a)** | 15 | 9 | 60% |
| **Bugok** | — | 5 | — |

### Javítandó — prioritás szerint

**P1 — Javítandó a 4a lezárásához:**

| # | Mit | Hol |
|---|-----|-----|
| B1 | Bevétel: `id_csalad` beállítás | `income-dialog.tsx` — a kiválasztott személy családját is lekérdezni + `saveIncome()`-ban átadni |
| H2 | Iratszám duplikáció ellenőrzés | `income-dialog.tsx` — `onBlur` → Server Action `checkReceiptDuplicate()` |
| H7 | Éves beállítás létrehozás modal | `page.tsx` + `YearlySettingsDialog` |

**P2 — Javítandó, de nem blokkoló:**

| # | Mit |
|---|-----|
| B2 | Tag keresés diakritika-normalizálás |
| H1 | Bevétel batch mód |
| H3 | Járulék kedvezmény auto-alkalmazás |
| H4 | Családi összekötés megjelenítés |
| H5 | Cég/szervezet keresés |
| H6 | Kiadás tételes bontás |
| H13 | Bevétel többsoros (több kategória) |
| B4 | Kategória név megjelenítés konzisztencia |

**P3 — 4b–4d alfázisra halasztva (tudatos):**

| # | Funkció |
|---|---------|
| H8–H19 | Költségvetés, Számadás, Bank, Belső mozgás, Monetár, Tartozások, Nyomtatás, Audit |
