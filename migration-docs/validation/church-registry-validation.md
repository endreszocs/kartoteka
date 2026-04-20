# Anyakönyv — Implementáció validálás a dokumentáció alapján

Összevetve: `rules/church-registry-rules.md` + `workflows/church-registry-flow.md` vs. implementált kód.

Utolsó frissítés: 2026-04-06

---

## 1. Hiányzó funkciók

### IMPLEMENTÁLT — kész

| # | Funkció | Állapot |
|---|---------|---------|
| ✅ | 9 fül (8 anyakönyvi + áttekintő) | KÉSZ |
| ✅ | Év szűrő + szöveg keresés (9 mezőben) | KÉSZ |
| ✅ | Oszlop rendezés (asc/desc toggle) | KÉSZ |
| ✅ | Dinamikus gomb (fülönként más szín + szöveg) | KÉSZ |
| ✅ | Keresztelés CRUD (okirat auto, szülő CNP, sablon JSON, munkanapló) | KÉSZ |
| ✅ | Automatikus család létrehozás (kereszteléskor) | KÉSZ |
| ✅ | Konfirmáció tömeges rögzítés (lista + duplikáció védelem) | KÉSZ |
| ✅ | Házasság CRUD (vőlegény ♂ + menyasszony ♀ nem-szűrés) | KÉSZ |
| ✅ | Temetés CRUD (halál + temetés dátum, „NEM állítja a meghalt flag-et" figyelmeztetés) | KÉSZ |
| ✅ | 4 tagmozgás CRUD (típusfüggő mezők, „NEM állít tag státuszt" figyelmeztetés) | KÉSZ |
| ✅ | Munkanapló integráció (keresztelés + temetés + konfirmáció) | KÉSZ |
| ✅ | Bejegyzés törlés (végleges + confirm dialógus) | KÉSZ |

### HIÁNYZIK

| # | Funkció | Szabály hivatkozás | Prioritás | Leírás |
|---|---------|-------------------|:---------:|--------|
| H1 | **Bejegyzés szerkesztés** | FLOW 11 | **P1** | A `registry-tabs.tsx` táblázatban nincs „Szerkesztés" gomb. Csak törlés gomb van. Az `openAkModal(id)` szerkesztés flow hiányzik teljes egészében — a modal-ok nem kapnak `editEntry` props-ot. |
| H2 | **Tag nem található → gyorsrögzítés + visszatérés** | FLOW 8 | **P1** | A keresőkben nincs „Új tag rögzítése" / „Gyorsrögzítés" gomb ha nincs találat. Az `isReturningToAnyakonyv` visszatérés flow nincs implementálva. |
| H3 | **Konfirmáció wizard (hiányzó keresztelés pótlás)** | FLOW 6 | P2 | A `confirmation-dialog.tsx` nem ellenőrzi a konfirmandusok keresztelési státuszát. A wizard (lépésenként pótló keresztelés modal) nincs implementálva. |
| H4 | **Konfirmáció: korosztály kereső (12–16 évesek)** | FLOW 5 / „korosztály kereső gomb" | P2 | A `confirmation-dialog.tsx`-ben nincs „12–16 évesek keresése" gomb. Csak manuális keresés van. |
| H5 | **Konfirmáció: már konfirmáltak kiszűrése** | Szabály 4 / „Már konfirmáltak NEM jelennek meg" | P2 | A `searchMemberForRegistry()` action NEM szűri ki a már konfirmáltakat. A régi rendszerben a `NOT IN (SELECT id_szemely FROM konfirmalas)` szűrő volt. |
| H6 | **Konfirmáció: keresztelési dátum megjelenítés a listában** | FLOW 5 / „A lista megjeleníti: ... keresztelés dátuma" | P2 | A konfirmandus listában nincs keresztelési dátum oszlop. |
| H7 | **Emléklap nyomtatás** | FLOW 13 | P2 | A `baptism-certificate.tsx` komponens nem lett létrehozva. A kereszteltek táblázatban nincs „Emléklap" gomb. |
| H8 | **Excel export** | FLOW 14 | P2 | Nincs Excel export gomb egyetlen fülön sem. |
| H9 | **Áttekintő statisztika** | FLOW 1 | P3 | Placeholder — „hamarosan" üzenet. |
| H10 | **Konfirmáció egyedi szerkesztés** | FLOW 5 | P2 | A `confirmation-edit-dialog.tsx` nem lett létrehozva. |

---

## 2. Nem implementált szabályok

| # | Szabály | Állapot | Megjegyzés |
|---|---------|---------|-----------|
| S1 | 8 anyakönyvi típus saját táblában | ✅ | Minden fül a megfelelő táblát kérdezi |
| S2 | Okiratszám: `{YYYY}{5-jegyű sorszám}` | ✅ | `getNextOkiratNumber()` |
| S3 | Személyhez kötés (házasságnál kettős) | ✅ | Házasság: id_ferfi + id_no |
| S4 | Munkanapló integráció (checkbox) | ✅ | Keresztelés + temetés + konfirmáció |
| S5 | Szülő összekötés: kettős mentés (keresztseg + szemely) | ✅ | `saveBaptism()` UPDATE szemely |
| S6 | Sablon JSON (megjegyzes `|sablon:` delimiter) | ✅ | `saveBaptism()` JSON generálás |
| S7 | Törlés végleges (nincs soft delete) | ✅ | `deleteRegistryEntry()` = DELETE |
| S8 | Konfirmáció: duplikáció védelem (kliens-oldalon) | ✅ | `addCandidate()` check |
| S9 | Konfirmáció: batch INSERT | ✅ | `saveConfirmationBatch()` |
| S10 | Temetés: NEM állítja a meghalt flag-et | ✅ | Figyelmeztetés a felületen |
| S11 | Tagmozgás: NEM állít tag státuszt | ✅ | Figyelmeztetés a felületen |
| S12 | Család auto: csak új keresztelésnél | ✅ | `if (!d.id)` check a saveBaptism-ben |
| S13 | Család auto: szülő CNP szükséges | ✅ | `if (d.id_apja_cnp || d.id_anyja_cnp)` |
| S14 | Bejegyzés szerkesztés | ❌ | HIÁNYZIK (= H1) |
| S15 | Konfirmáció: már konfirmáltak kiszűrése | ❌ | HIÁNYZIK (= H5) |
| S16 | Konfirmáció: wizard (hiányzó keresztelés) | ❌ | HIÁNYZIK (= H3) |
| S17 | Konfirmáció: korosztály kereső | ❌ | HIÁNYZIK (= H4) |
| S18 | Emléklap nyomtatás | ❌ | HIÁNYZIK (= H7) |
| S19 | Excel export | ❌ | HIÁNYZIK (= H8) |
| S20 | Gyorsrögzítés + visszatérés | ❌ | HIÁNYZIK (= H2) |

---

## 3. Lehetséges bugok

| # | Bug | Fájl | Leírás | Súlyosság |
|---|-----|------|--------|-----------|
| B1 | **Tagmozgás: `elkoltozott` tábla `honnanid` vs `hovaid` keverés** | `actions.ts:saveMovement` | Az elköltözésnél `record.hovaid = d.helyid` a helyes. A `kitert`-nél is `hovaid` kell. De az `attert`-nél `honnanid` kell. A kód: `if (d.tipus === 'attert') record.honnanid` és `else record.hovaid` — ez helyes. Nincs bug. | — |
| B2 | **Szülő keresés: a `cnp` mező nem olvasódik ki a search results-ból** | `baptism-dialog.tsx:selectFather/selectMother` | A cast `(r as unknown as { cnp: string }).cnp` nem biztos hogy működik — a `searchMemberForRegistry` SELECT-je tartalmazza a `cnp`-t, de a TypeScript típus nem fedi. Runtime-ban működhet, de nem típusbiztos. | ALACSONY |
| B3 | **Okiratszám: a `hazassag` és más nem-dátum-alapú füleknél nem generálódik automatikusan** | `actions.ts:getNextOkiratNumber` | A `getNextOkiratNumber` `.gte('datum', ...)` szűrőt használ — de az `elkoltozott` tábla dátum mezője `mikor`, nem `datum`. Ha valaki nem-keresztelés/házasság fülre okiratszámot generálna, hibás lenne. A jelenlegi kódban CSAK a `keresztseg` és `hazassag` modal hívja, tehát nincs probléma — de jövőbeli használatnál hibás. | ALACSONY |
| B4 | **Konfirmáció batch: a `congregation_id` szűrés hiányzik a duplikáció védelemből** | `actions.ts:saveConfirmationBatch` | A szerver-oldali INSERT nem ellenőrzi, hogy az adott konfirmandus MÁR konfirmálva van-e. A kliens-oldali védelem (duplikáció a jelölt listában) nem véd az adatbázis-szintű duplikáció ellen. | KÖZEPES |

---

## 4. Edge case hiányok

| # | Edge case | Szabály | Állapot |
|---|-----------|---------|---------|
| E1 | Személy nincs a rendszerben → gyorsrögzítés | Személyek | ❌ HIÁNYZIK (= H2) |
| E2 | Személy törlődik → bejegyzés „—" | Személyek | ✅ JOIN null → '—' |
| E3 | Házasság: vőlegény = menyasszony | Személyek | ⚠️ Nincs validáció (de a szabály szerint nem is kell explicit) |
| E4 | Szülő CNP nélkül | Szülő | ✅ Megengedett (szabad szöveges név) |
| E5 | Szülőnek nincs lakcíme → család nem jön létre | Szülő | ✅ `checkAndCreateFamily` lakcím ellenőrzés |
| E6 | Család MÁR létezik → gyerek regisztráció | Szülő | ✅ Meglévő család keresés + gyerek INSERT |
| E7 | Csak egy szülő → család egy szülővel | Szülő | ✅ `id_ferfi: ferfiId, id_no: noId` (egyik lehet null) |
| E8 | Szerkesztésnél szülő módosítás → család NEM frissül | Szülő | ✅ `if (!d.id)` — szerkesztésnél a család auto NEM fut |
| E9 | Konfirmandus már konfirmált → kiszűrve | Konfirmáció | ❌ HIÁNYZIK (= H5) |
| E10 | Konfirmandus nincs megkeresztelve → wizard | Konfirmáció | ❌ HIÁNYZIK (= H3) |
| E11 | Konfirmandus dupla hozzáadás | Konfirmáció | ✅ Kliens check |
| E12 | 0 konfirmandus → mentés blokkolva | Konfirmáció | ✅ Gomb letiltva + Zod min(1) |
| E13 | Okiratszám concurrent ütközés | Okiratszám | ⚠️ Ismert limitáció (nincs DB unique) |
| E14 | Évre nincs korábbi bejegyzés → `{YYYY}01001` | Okiratszám | ✅ |
| E15 | Munkanapló modul nem betöltve → csendben skip | Munkanapló | ✅ try-catch |
| E16 | Bejegyzés törlés → munkanapló megmarad | Munkanapló | ✅ (tudatos döntés) |
| E17 | Szerkesztés → munkanapló NEM frissül | Munkanapló | ✅ Csak új bejegyzésnél INSERT |
| E18 | Beköltözés: személy MÁR a rendszerben | Tagmozgás | ✅ Megengedett |
| E19 | Ugyanaz a személy többször beköltözik/elköltözik | Tagmozgás | ✅ Megengedett |
| E20 | Nincs bejegyzés → „Nincs bejegyzés" | Megjelenítés | ✅ |

---

## 5. Összefoglaló

### Implementáltsági állapot

| Kategória | Összes | Kész | Hibás/Hiányzik | % |
|-----------|--------|------|----------|---|
| **Szabályok** | 20 | 13 | 7 | 65% |
| **Flow-k (14)** | 14 | 8 | 6 | 57% |
| **Edge case-ek** | 20 | 15 | 5 | 75% |
| **Bugok** | — | — | 1 közepes, 2 alacsony | — |

### Javítandó — prioritás szerint

**P1 — Javítandó a Fázis 5 lezárásához:**

| # | Mit | Hol |
|---|-----|-----|
| H1 | **Bejegyzés szerkesztés** | Minden modal: `editEntry` props + előtöltés + UPDATE. A `registry-tabs.tsx`-ben szerkesztés gomb hozzáadása. |
| H2 | **Gyorsrögzítés + visszatérés** | Keresőkben: „Nincs találat → Új tag rögzítése" gomb. `isReturningToAnyakonyv` flow integráció a `member-form-dialog`-gal. |

**P2 — Fontos, de nem blokkoló:**

| # | Mit |
|---|-----|
| H3 | Konfirmáció wizard (hiányzó keresztelés pótlás) |
| H4 | Korosztály kereső (12–16 évesek gomb) |
| H5 | Már konfirmáltak kiszűrése a keresőből |
| H6 | Konfirmáció: keresztelési dátum a listában |
| H7 | Emléklap nyomtatás |
| H8 | Excel export |
| H10 | Konfirmáció egyedi szerkesztés modal |
| B4 | Konfirmáció batch: szerver-oldali duplikáció ellenőrzés |

**P3 — Későbbi iteráció:**

| # | Mit |
|---|-----|
| H9 | Áttekintő statisztika |
