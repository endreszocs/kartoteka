# KARTOTÉKA — Iktató modul megfelelősége az EREK 2024-es ügykörjegyzékhez

**Forrás:** Igazgatótanács 66/2023. számú határozata · *14. Egyházi adminisztráció az
Erdélyi Református Egyházkerületben* (21 oldal, 2024. január 1-től érvényes)

**Dátum:** 2026-05-28 · **Felelős:** Kartotéka fejlesztés

---

## 1. Jelenlegi rendszer áttekintése

### 1.1 Adatmodell (jelenleg)

`filing_entries` tábla az alábbi mezőkkel:

| Mező | Típus | Forrás |
|---|---|---|
| `id` | UUID | rendszer |
| `congregation_id` | UUID | rendszer |
| `ev` | int | ÉV (2026) |
| `sorszam` | int | iktatószám 1-től |
| `irany` | enum | `incoming` / `outgoing` |
| `kelt` | date | irat keltezése |
| `subject` | text | tárgy |
| `sender_or_recipient` | text | feladó/címzett |
| `file_folder` | enum | `F.Á.` / `É.Á.` / `A.K.` |
| `targykivonat` | text | tárgykivonat |
| `irattarijel` | text | irattári jel (szabad szöveg) |
| `elintezes_ideje` | date | elintézés időpontja |
| `megjegyzes` | text | belső kommentár |

### 1.2 UI-szerkezet

- ColorTabs a Hero alatt: Iktatott iratok / Sablonok / Súgó / Rendszergazdai importáló
- Sztat-kártyák (Összesen / Bejövő / Kimenő / Nyitott)
- Szűrők: év, irány
- Tábla: sorszám, irány, kelt, tárgy, feladó/címzett, ügykör, állapot
- Sablonok tab: filing-templates-tab
- Új-irat dialog: minimális mezők (lásd 1.1)

---

## 2. Eltérések a PDF szerinti hivatalos szabályozással

### 2.1 KRITIKUS — Iktatókönyv 9 rovata hiányosan implementált

A PDF szerinti **kötelező 9 rovat** vs. a jelenlegi adatmodell:

| # | PDF szerinti rovat | Jelenlegi mező | Hiányzik? |
|---|---|---|---|
| 1 | Iktatószám (év/sorszám) | `ev` + `sorszam` | ✅ |
| 2 | Beérkezett irat hivatalos száma + kelte | ❌ NINCS — keveredik a `subject`-tel | ⚠️ HIÁNYZIK |
| 3 | Beérkezés ideje | ❌ NINCS — csak `kelt` van (az irat keltezése) | ⚠️ HIÁNYZIK |
| 4 | Mellékletek száma | ❌ NINCS | ⚠️ HIÁNYZIK |
| 5 | Küldő neve | `sender_or_recipient` | ✅ |
| 6 | Ügy + válasz rövid tartalma | `subject` + `targykivonat` | részleges |
| 7 | Ellátás (postázás dátuma) | `elintezes_ideje` | ✅ |
| 8 | Irattári szám (ügykörjegyzék) | `file_folder` (`F.Á.`/`É.Á.`/`A.K.`) | ⚠️ TÚL ÁLTALÁNOS |
| 9 | Hivatkozás más iktatószámra | ❌ NINCS | ⚠️ HIÁNYZIK |

### 2.2 KRITIKUS — Ügykörjegyzék-besorolás helytelen

A jelenlegi `file_folder` 3 általános érték (`F.Á.` / `É.Á.` / `A.K.`).
**Ez NEM EGYEZIK** a 2024-es ügykörjegyzékkel:

- **A `F.Á.` és `É.Á.` valójában megőrzési típusok** (folyamatosan vs. évente
  állandó), nem ügykör-kategóriák.
- **Az `A.K.` (Anyakönyvi) NEM SZEREPEL az iktatott iratok között** — az anyakönyv
  külön kötetes anyag, és az anyakönyvi LEVELEZÉS a 2-es szálas iratgyűjtőbe kerül.

A helyes besorolás a PDF szerint:

#### A. Kötetes anyag (NEM iktatott — saját könyvek)
12 fő egység (Presbiteri jk, Közgyűlési jk, 5 anyakönyv, Családkönyv, Be-/Kiköltözés,
Munkanapló, Iktató, Aranykönyv, Historia Domus, Leltár, Főkönyv, Belmissziós szövetségek).

#### B. Szálas iratok (ITT iktatunk!)
**18 fő ügykör** (több alegységgel):

| Ügykör | Cím | Megőrzés |
|---|---|---|
| 1. | Levelezés | É.Á. |
| 2. | Anya- és családkönyvi levelezés | F.Á. |
| 3. | Jelentések | F.Á. |
| 4. | Választói névjegyzékek | F.Á. |
| 5. | Egyházi alkalmazottak személyi iratgyűjtője | F.Á. |
| 6. | Leltári ügyek (6/1–6/7) | vegyes |
| 7. | Műemlékek, műkincsek | F.Á. |
| 8. | Költségvetések, számadások | F.Á. |
| 9. | Pénzügyi igazoló iratok (9/1 készpénz, 9/2 bank) | É.Á. |
| 10. | Csoportnapló | É.Á. |
| 11. | Fizetési jegyzékek | F.Á. |
| 12. | Munkavédelem, tűzvédelem | F.Á. |
| 13. | Szerződések (13/1 bérleti, 13/2 közüzemi, 13/3 szolg.) | F.Á. |
| 14. | Pályázatok (14/N pályázatonként) | F.Á. |
| 15. | Ellenőrzési jegyzőkönyvek | F.Á. |
| 16. | Egyházközségi egyesületek, alapítványok | F.Á. |
| 17. | Temetőügyek | F.Á. |
| 18. | Gyülekezeti kiadványok, aprónyomtatványok | F.Á. |

### 2.3 Egyéb hiányosságok

- **Évvégi lezárás workflow** nincs (PDF szerint kötelező: aláírás lp. + (fő)gondnok,
  „Lezárva 202_. december 31-én" feltüntetés).
- **Iratjegyzék-generálás** szálas iratgyűjtőkhöz hiányzik (PDF szerint kötelező:
  iratjegyzék a dosszié elejére).
- **Hivatali út validáció** nincs — a PDF szerint az egyházközségek csak az
  Egyházmegyén keresztül levelezhetnek az Egyházkerülettel.
- **Iktatópecsét-nyomtatás** funkció nincs — a beérkező iratokra fizikailag rá kell
  pecsételni a `Iktatva / Kelt / Ikt.sz / I.gy / Sorsz / Elintézve` blokkot.
- **Másodpéldány-generálás** kimenő iratokhoz nincs automatikus.
- **Levelezés nyelve** nincs jelölve (Kánon: egyházon belül magyarul, polgári
  hatóságokkal románul).

---

## 3. Részletes fejlesztési terv

### Fázis 1 — Sürgős (az új ügykörjegyzékhez igazítás)

**1.1 Adatbázis-migráció:** `filing_entries` táblát kibővíteni 4 új mezővel:
- `external_ref_szam` (text) — küldő intézmény saját iktatószáma (pl. „479/2023.")
- `external_ref_kelt` (date) — a beérkezett irat keltezése
- `beerkezes_ideje` (date) — amikor a mi hivatalunkba érkezett (≠ a kelt-tel)
- `mellekletek_szama` (int, nullable)
- `valasz_iktatoszam` (text) — kereszthivatkozás más iktatószámra (pl. „lásd 36/2023")
- `ugykor_kod` (text) — az új ügykörjegyzék pontszáma (pl. „1.", „6/1.", „13/2.")

**1.2 Adatmigráció:** a meglévő `file_folder` enum-értékek (`F.Á.`/`É.Á.`/`A.K.`)
csak a megőrzési típust jelölik. Új `retention_type` mező (`F.Á.` / `É.Á.`)
hozzáadása, a régi értékből inferálva.

**1.3 Ügykör-választó UI-átalakítás:**
- 18 fő szálas ügykör + alegységek (összesen ~30 választható opció)
- Hierarchikus dropdown (pl. „6. Leltári ügyek › 6/1. Vagyonleltári jelentések")
- Az ügykör kiválasztásakor a `retention_type` automatikusan állítódik

### Fázis 2 — Iktatókönyv-rovat-teljes (PDF szerint)

**2.1 Iktatás-dialog UI bővítés:**
- "Beérkezett irat hivatalos száma" mező (pl. „Esperesi 479/2023.")
- "Beérkezés ideje" mező (külön a "Kelt"-től)
- "Mellékletek száma" mező
- "Válasz iktatószám" mező (cross-reference, opcionális)

**2.2 Iktatópecsét-nyomtatás:**
- Új "Iktatópecsét nyomtatása" gomb minden iraton
- PDF/HTML formátum a PDF-mintával (Iktatva / Kelt / Ikt.sz / I.gy / Sorsz / Elintézve)
- A beérkező iratra ráragasztható/rányomtatható

**2.3 Iktatókönyv-nyomtatás:**
- A 9 rovatos hivatalos formátum nyomtatható az ügykörjegyzék szerint
- Évvégi lezárás-funkció: "Lezárva 202_. december 31-én" sor + lelkipásztor + (fő)gondnok aláírás

### Fázis 3 — Workflow-támogatás

**3.1 Évvégi lezárás:**
- Dec 31. után a rendszer figyelmeztet a lezárásra
- Lezáráskor: PDF generálás, aláírás-mezők kitöltése, archiválás
- A lezárás után új ügyletek csak NEW év iktatószámával

**3.2 Hivatali út validáció (figyelmeztető):**
- Ha egyházközség közvetlenül egyházkerülethez ír (a sender mezőben „Erdélyi Református Egyházkerület" szerepel és a dir = outgoing), figyelmeztetés:
  *„A hivatali út szerint az egyházmegyén keresztül kell felterjeszteni. Folytatni?"*

**3.3 Másodpéldány-flag:**
- Kimenő iratoknál a rendszer kérdezi: „Másodpéldány az irattárba?"
- Ha igen, automatikus PDF generálás + "Másolat" felirat, aláírás-mező a lelkipásztor + (fő)gondnok-nak

### Fázis 4 — Kötetes anyag-kapcsolat (haladó)

A PDF szerint az iktatott iratok ÉS a kötetes anyag (anyakönyvek, jegyzőkönyvek,
munkanapló, leltár, főkönyv) szorosan összefügg:
- Egy presbiteri meghívó (kimenő irat) az 1. iratgyűjtőbe → kapcsolódik az I. kötetes
  anyaghoz (presbiteri jegyzőkönyv)
- Egy halotti `Adeverința` (bejövő) → 2. iratgyűjtő ÉS III/4. anyakönyv (temetés)

**4.1 Cross-referencia automatika:** ha egy irat ügyköre 2. (anya-/családkönyvi
levelezés), kínáljon fel kapcsolat-mezőt az Anyakönyv modulra (mely temetés/keresztelés
bejegyzéséhez kötődik). Ha 8. (számadás), kapcsolódik a Pénzügy modulhoz.

**4.2 Iratjegyzék automata generálás:**
- A szálas iratgyűjtők elejére iratjegyzéket (tartalomjegyzéket) generál
- Az iratgyűjtőnként az ott iktatott iratok listája időrend / sorszám szerint
- Évvégi lezáráskor automatikus PDF

### Fázis 5 — Kapcsolódó modulok (egységes ügyköri besorolás)

A többi modult (Pénzügy, Anyakönyv, Munkanapló, Leltár, Jegyzőkönyvek) is be lehet
kötni az ügykörjegyzékbe:

- **Pénzügy**: a pénzügyi igazoló iratok (9/1 és 9/2) automatikus kategorizálása az
  ügykörjegyzék szerint
- **Munkanapló**: a kötetes anyag VI. pontja — beköttetés-figyelmeztetés 5 évenként
- **Leltár**: az X. (Leltárkönyv) + 6/1–6/7 szálas iratok kapcsolása
- **Jegyzőkönyvek**: az I.+II. (Presbiteri+közgyűlési) + tartozó 1. iratgyűjtőbeli
  meghívók kereszt-referenciája

---

## 4. Prioritás és időbecslés

| Fázis | Prioritás | Becsült idő | Megjegyzés |
|---|---|---|---|
| 1. Új ügykörjegyzék | **MAGAS** | 2-3 nap | DB migráció + UI |
| 2. 9-rovatos iktatókönyv | MAGAS | 2-3 nap | Új mezők + pecsét-nyomtatás |
| 3. Workflow (lezárás, validáció) | KÖZEPES | 2 nap | Évvégi lezárás kritikus |
| 4. Kötetes anyag-kapcsolat | ALACSONY | 3-4 nap | Cross-ref haladó funkció |
| 5. Modulkapcsolatok | ALACSONY | 5+ nap | Hosszú távú evolúció |

**Összesen ~2-3 hét egy fejlesztő számára.**

---

## 5. Azonnal beépítendő minimális kiegészítés

**Most ezt csinálom a commit előtt:** a `filing-main.tsx` Új-irat dialógjához
hozzáadom a 4 hiányzó iktatókönyv-mezőt (külső iktatószám, beérkezés ideje, mellékletek
száma, válasz iktatószám) **JS-only validációval** (DB-migráció nélkül, opcionális
mezőként, JSON-ban a `megjegyzes`-be tárolva ideiglenesen). Ez egy nem-kritikus
első lépés, ami a következő DB-migrációval normalizálható.

A teljes 9-rovatos rendszer és az új ügykörjegyzék beépítése külön fejlesztési
ciklust igényel (Fázis 1+2, ~5 nap).

---

**Forrás:** EREK Igazgatótanács 66/2023. határozat, 14. Egyházi adminisztrációs útmutató.
