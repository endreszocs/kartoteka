# Tagnyilvántartás — Implementáció validálás a dokumentáció alapján

Összevetve: `rules/member-registry-rules.md` + `workflows/member-registry-flow.md` vs. implementált kód.

Utolsó frissítés: 2026-04-06

---

## 1. Hiányzó funkciók

### KRITIKUS — a felhasználó észreveszi

| # | Funkció | Szabály hivatkozás | Állapot | Leírás |
|---|---------|-------------------|---------|--------|
| H1 | **Szülő gyorsrögzítés modal** | FLOW 18 / „Ha nincs találat → Gyorsrögzítés gomb" | ❌ HIÁNYZIK | A `member-form-dialog.tsx` szülő keresőben nincs „Gyorsrögzítés" gomb ha nincs találat. A régi rendszerben ez egy modal-ban modal volt (`quickAddParentFromMemberForm`). A `parent-quick-add-dialog.tsx` fájl nem lett létrehozva. |
| H2 | **Választók zárolás/feloldás** | Szabály 4 / „Zárolás + esperes feloldás" | ❌ HIÁNYZIK | A `voters-tab.tsx`-ben nincs zárolás gomb, nincs feloldás gomb, nincs `bealitas` tábla kezelés. A `voter-actions.ts`-ben nincs `lockVoterList` / `unlockVoterList` függvény. |
| H3 | **Választók körzet szűrő** | FLOW 17 / „Szűrhető: körzet, nem, járulékfizetés éve" | ❌ HIÁNYZIK | A `voters-tab.tsx`-ben nincs körzet dropdown szűrő. Csak keresés, nem és járulékfizetés szűrő van. |
| H4 | **Nem-ellenőrzés (God Mode)** | FLOW 19 / „Nem-ellenőrzés" | ❌ HIÁNYZIK | A `gender-check-dialog.tsx` fájl nem lett létrehozva. A `gender-actions.ts` sem. A `persons-tab.tsx`-ben nincs God Mode gomb. |
| H5 | **Családok: egyedülálló szűrés a dropdown-ban** | Szabály 3 / Család / „Csak egyedülálló férfiak/nők" | ❌ HIÁNYZIK | A `family-form-dialog.tsx` a `searchParent` action-t használja kereséshez, ami NEM szűri ki a már házas személyeket. A régi rendszer a `populateFamilySelects`-ben kiszűrte a `marriedMenIds`/`marriedWomenIds`-t. |
| H6 | **Körzet nélküli családok jelzés** | FLOW 16 / „Ha vannak körzet nélküli családok → sárga sáv" | ❌ HIÁNYZIK | A `districts-tab.tsx`-ben nincs „X körzet nélküli család" figyelmeztetés a fő nézeten. Az `unassigned-families-dialog.tsx` nem lett létrehozva. |
| H7 | **Körzetek nyomtatása** | FLOW 20 / „Körzetek nyomtatása" | ❌ HIÁNYZIK | Nincs nyomtatás gomb a körzetek fülön. |
| H8 | **Választók nyomtatása** | FLOW 17 / „Nyomtatható" | ❌ HIÁNYZIK | Nincs nyomtatás gomb a választók fülön. |
| H9 | **Tömeges Excel import** | Szabály 1 / „Tömeges Excel import — God Mode" | ❌ HIÁNYZIK (tudatosan) | A `mass_import_api.js` funkció nincs migrálva. Ez későbbi iterációra ütemezett. |
| H10 | **Névsor Excel export** | Modul elemzés 2.7 / „Excel generálás" | ❌ HIÁNYZIK (tudatosan) | A `sync_api.js` funkció nincs migrálva. Későbbi iteráció. |

### KÖZEPES — nem blokkoló, de eltérés a specifikációtól

| # | Funkció | Állapot | Leírás |
|---|---------|---------|--------|
| H11 | **Kartoték: CNP megjelenítés** | ❌ HIÁNYZIK | A `member-details-dialog.tsx`-ben nem jelenik meg a CNP szám. A régi rendszerben volt. |
| H12 | **Kartoték: „Ugrás a családhoz" gomb** | ❌ HIÁNYZIK | A `member-details-dialog.tsx`-ben nincs „Ugrás a családhoz" gomb (bár a `familyId` prop megvan). |
| H13 | **Kartoték: e-mail megjelenítés** | ❌ HIÁNYZIK | Az e-mail mező nem jelenik meg a kartoték modal-ban. |
| H14 | **Tag form: 18 év alatti → fizető szekció eltűnik** | ❌ HIÁNYZIK | A `member-form-dialog.tsx`-ben a pénzügyi fül mindig látszik. A régi rendszerben a születési dátum változásakor automatikusan eltűnt ha 18 év alatti. |
| H15 | **Tag form: vallás → egyháztag automatika** | ❌ HIÁNYZIK | A `member-form-dialog.tsx`-ben nincs „Csak református lehet egyháztag" figyelmeztetés. |
| H16 | **Család form: cím auto-töltés** | ❌ HIÁNYZIK | A `family-form-dialog.tsx`-ben a cím nem töltődik automatikusan a kiválasztott fél (férj/feleség) lakcíméből. |
| H17 | **Család form: gyerekek kereső mindkét nemben keres** | ⚠️ BUG | A `family-form-dialog.tsx:78` a child keresést `searchParent(val, true)`-val hívja, ami CSAK férfiakra keres. Gyerekeknél mindkét nemben kellene keresni. |
| H18 | **Családfa vizualizáció** | ❌ HIÁNYZIK (tudatosan) | FamilyTree.js nem migrálva — az architektúra terv szerint szöveges lista lesz helyette. De a szöveges lista sincs implementálva. |
| H19 | **Halálozási átlagéletkor az áttekintésben** | ❌ HIÁNYZIK | Az `overview-tab.tsx`-ben nincs halálozási átlagéletkor szekció (a régi rendszerben volt). |

---

## 2. Nem implementált szabályok

| # | Szabály | Állapot | Megjegyzés |
|---|---------|---------|-----------|
| S1 | Aktív tag = nem elhunyt + nem elköltözött + nem kitért + nem törölt + (református VAGY üres VAGY fizet) | ✅ | `isActiveMember()` + `persons-tab.tsx` szűrő |
| S2 | Fizetési státusz badge (6-lépcsős, családi szinten is) | ✅ | `calculatePaymentStatus()` |
| S3 | Név-prefix motor (elv., özv., namepattern) | ✅ | `formatNameWithPrefix()` |
| S4 | CNP generálás (999XXXXXXX) | ✅ | `generateCnp()` + `saveMember()` |
| S5 | Automatikus család létrehozás szülő megadásakor | ✅ | `saveMember()` — CNP keresés + család insert + gyerek regisztráció |
| S6 | Település/utca dinamikus getOrCreate | ✅ | `getOrCreateLocality()` + `getOrCreateStreet()` |
| S7 | 11 korcsoport az áttekintésben | ✅ | `overview-tab.tsx` |
| S8 | Nem-heurisztika (magyar) | ✅ | `guessGender()` — de sehol nincs használva a kódban! |
| S9 | Tag törlés: pénzügyi ellenőrzés → elrejtés fallback | ✅ | `removeMember()` reason='torles' |
| S10 | Tag törlés: RLS fallback → elrejtés | ✅ | `removeMember()` |
| S11 | Tag törlés: munkanapló rákérdezés | ✅ | `removeMember()` delete_worklogs paraméter |
| S12 | Körzet törlés: presbiter bejegyzések + család-körzet nullázás | ✅ | `deleteDistrict()` |
| S13 | Férj/feleség kizárólagosság (1 család/személy) | ❌ | A `family-form-dialog.tsx` NEM szűri ki a már házas személyeket (= H5) |
| S14 | Választók: 18+ ÉS járulékfizető (101.01 kód) | ⚠️ RÉSZBEN | A `voter-actions.ts` szűri a 18+-t és a járulékot, de NEM a 101.01 kódra — az összes `befizetes` rekordot nézi, nem csak a járulékot |
| S15 | Választók zárolás + esperes feloldás | ❌ | Nincs implementálva (= H2) |
| S16 | Névjegyzék zárolás feloldás: esperes jogosultság ellenőrzés | ❌ | Nincs implementálva |

---

## 3. Lehetséges bugok

| # | Bug | Fájl:sor | Leírás | Súlyosság |
|---|-----|---------|--------|-----------|
| B1 | **Család gyerek keresés: csak férfiakra keres** | `family-form-dialog.tsx:78` | `searchParent(val, true)` — a `true` = `isMale`, tehát csak férfiakat keres gyereknek. Kellene: nem-szűrés nélkül. | MAGAS |
| B2 | **Választók: nem a 101.01 járulék kódra szűr** | `voter-actions.ts:38` | Az összes `befizetes` rekordot nézi, nem a járulékot (101.01 kód). A régi rendszerben `befizetescel → szamadasicel.kod = '101.01'` szűrés volt. Így más típusú befizetés is választóvá teheti a tagot. | MAGAS |
| B3 | **MemberRemoveDialog: removeMember után a szülőben nem frissül a státusz** | `persons-tab.tsx:108-111` | A `handleRemoveClose()` csak `onMemberRemoved(id)` hív (ami a listából eltávolítja). De az elhunyt/elköltözött/kitért nem törlődik a listáról — a tag megmarad de a badge-e nem frissül. Kellene: `onMemberUpdated()` hívás a státusz frissítéséhez. | KÖZEPES |
| B4 | **Overview: más vallásúakat nem szűri ki a korcsoportokból** | `overview-tab.tsx:15-18` | Az `alive` szűrő nem zárja ki a `member_status === 'kitért'` tagokat. A `reformed` szűrő viszont igen, de a `kitért` tagnak lehet `vallas = 'református'` értéke. | ALACSONY |
| B5 | **Család form: nincs cím (utca) mező az új család form-ban** | `family-form-dialog.tsx` | A form-ban van `c_szam` (házszám) de nincs `c_utcaid` (utca). A `saveFamily` nem kapja meg az utca ID-t → null lesz. | KÖZEPES |

---

## 4. Edge case hiányok

| # | Edge case | Szabály | Állapot |
|---|-----------|---------|---------|
| E1 | Tag nincs sz_datum → kor „—" | Személyek | ✅ `ageFromDate()` null → '—' |
| E2 | Tag vallása üres → reformátusnak számít | Személyek | ✅ `isActiveMember()` |
| E3 | Tag más vallású de fizet → aktív | Személyek | ✅ `isActiveMember()` |
| E4 | Tag elhunyt ÉS elköltözött | Személyek | ✅ `calculatePaymentStatus()` — meghalt elsőbbség |
| E5 | Tag pénzügyi tranzakcióval, törlés → elrejtés | Személyek | ✅ `removeMember()` |
| E6 | Tag RLS blokkolás → fallback elrejtés | Személyek | ✅ `removeMember()` |
| E7 | Szülő kereséskor nincs találat → gyorsrögzítés | Személyek | ❌ HIÁNYZIK (= H1) |
| E8 | Anyakönyvből visszatérés | Személyek | ❌ N/A — az anyakönyv modul még nincs (Fázis 5) |
| E9 | CNP duplikáció | Személyek | ⚠️ Ismert limitáció — valószínűsége nagyon alacsony |
| E10 | Család férj nélkül | Családok | ✅ A `familySchema` megengedi `id_ferfi = null` |
| E11 | Család feleség nélkül | Családok | ✅ A `familySchema` megengedi `id_no = null` |
| E12 | Két család azonos szülőkkel | Családok | ❌ NINCS VÉDELEM — a keresőből nem szűrődnek ki a házasak (= H5) |
| E13 | Házastárs elhunyt → özv. prefix | Családok | ✅ `formatNameWithPrefix()` + `families-tab.tsx` átadja `spouseDeceased` |
| E14 | Körzet törlése hozzárendelt családokkal | Körzetek | ✅ `deleteDistrict()` |
| E15 | Körzet törlése presbiteri bejegyzésekkel | Körzetek | ✅ `deleteDistrict()` |
| E16 | Család körzet nélkül → jelzés | Körzetek | ❌ HIÁNYZIK (= H6) |
| E17 | Személy család nélkül → körzet nem rendelhető | Körzetek | ✅ A körzet családokhoz van rendelve |
| E18 | Tag 18 éves de nem fizetett → nem választó | Választók | ✅ Járulék szűrő |
| E19 | Tag 17 éves → nem választó | Választók | ✅ 18+ szűrő |
| E20 | Tag fizetett de elhunyt → nem választó | Választók | ✅ `meghalt = false` szűrő |
| E21 | Zárolás utáni módosítás | Választók | ❌ NINCS IMPLEMENTÁLVA (= H2) |
| E22 | Körzet auto-egyeztetés (korzetfilter) | Körzetek | ❌ HIÁNYZIK — a `getDistrictFamilies()` nem használja a `korzetfilter` táblát |

---

## 5. Összefoglaló

### Implementáltsági állapot

| Kategória | Összes | Kész | Hibás/Hiányzik | % |
|-----------|--------|------|----------|---|
| **Szabályok** | 16 | 12 | 4 | 75% |
| **Flow-k (20)** | 20 | 14 | 6 | 70% |
| **Edge case-ek** | 22 | 15 | 7 | 68% |
| **Bugok** | — | — | 5 | — |

### Javítandó — prioritás szerint

**P1 — Javítandó a Fázis 3 lezárásához:**

| # | Mit | Hol |
|---|-----|-----|
| B1 | Család gyerek keresés: mindkét nemben | `family-form-dialog.tsx` — `searchParent` hívás `isMale` paraméter nélkül |
| B2 | Választók járulék szűrés: 101.01 kód | `voter-actions.ts` — `befizetescel → szamadasicel.kod` join kell |
| B3 | Kivezetés utáni tag státusz frissítés | `persons-tab.tsx` — `handleRemoveClose()` → `onMemberUpdated()` |
| H5 | Család form: házas személyek kiszűrése | `family-form-dialog.tsx` — külön Server Action a szabad személyek keresésére |
| B5 | Család form: utca mező hiányzik | `family-form-dialog.tsx` + `saveFamily` |

**P2 — Javítandó, de nem blokkoló:**

| # | Mit |
|---|-----|
| H1 | Szülő gyorsrögzítés modal |
| H2 | Választók zárolás/feloldás |
| H3 | Választók körzet szűrő |
| H4 | Nem-ellenőrzés (God Mode) dialog |
| H6 | Körzet nélküli családok jelzés |
| H7 | Körzetek nyomtatás |
| H8 | Választók nyomtatás |
| H11-H16 | Kartoték hiányzó mezők, form automatikák |
| H19 | Halálozási átlagéletkor |
| E22 | Körzet auto-egyeztetés (korzetfilter) |

**P3 — Későbbi iteráció:**

| # | Mit |
|---|-----|
| H9 | Tömeges Excel import (God Mode) |
| H10 | Névsor Excel export |
| H18 | Családfa vizualizáció |
