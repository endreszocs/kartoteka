# Munkanapló + Leltár + Iktatás — Implementáció validálás

Összevetve: `rules/worklog-inventory-filing-rules.md` + `workflows/worklog-inventory-filing-flow.md` vs. implementált kód.

Utolsó frissítés: 2026-04-06

---

## 1. Hiányzó funkciók

### IMPLEMENTÁLT — kész

| # | Funkció | Modul | Állapot |
|---|---------|-------|---------|
| ✅ | 3 kategória fül (szolgálat/katekézis/látogatás) | Munkanapló | KÉSZ |
| ✅ | Havi szűrő (hónap dropdown) | Munkanapló | KÉSZ |
| ✅ | Kategóriafüggő dinamikus form (résztvevők, persely, igehely) | Munkanapló | KÉSZ |
| ✅ | CRUD (létrehozás + szerkesztés + soft delete) | Munkanapló | KÉSZ |
| ✅ | `triggerWorklogFromRegistry` publikus API | Munkanapló | KÉSZ |
| ✅ | 7 kategória + auto leltári szám (`{prefix}-{sorszám}`) | Leltár | KÉSZ |
| ✅ | Kategória szűrő + statisztika | Leltár | KÉSZ |
| ✅ | CRUD (létrehozás + szerkesztés + soft delete) | Leltár | KÉSZ |
| ✅ | Kétirányú sorszám (`{YYYY}/{N}`) auto | Iktatás | KÉSZ |
| ✅ | Irány fülek + év szűrő + keresés | Iktatás | KÉSZ |
| ✅ | 4 statisztika kártya + elintézés jelzés (✅/⏳) | Iktatás | KÉSZ |
| ✅ | CRUD (létrehozás + szerkesztés + soft delete) | Iktatás | KÉSZ |
| ✅ | 3 mappa-köteg (F.Á./É.Á./A.K.) | Iktatás | KÉSZ |

### HIÁNYZIK

| # | Funkció | Modul | Szabály hivatkozás | Prioritás |
|---|---------|-------|-------------------|:---------:|
| H1 | **Látogatás: személy/család keresés** | Munkanapló | Workflow 2 / „tag keresőből" | P2 |
| H2 | **Egyházmegyei jelentés generálás** | Munkanapló | Workflow 4 / „II, IV, V, VII szekciók" | P2 |
| H3 | **Excel export** | Munkanapló | Szabály 1 / „Excel export" | P2 |
| H4 | **Nyomtatás** | Munkanapló | Workflow 5 | P2 |
| H5 | **Értékcsökkenés (amortizáció) számítás és megjelenítés** | Leltár | Szabály 2 / „2139/2004 katalógus" | P2 |
| H6 | **Katalógus kód dropdown (2139/2004)** | Leltár | Workflow 7 / „katalógus kód kiválasztás → használati idő auto" | P2 |
| H7 | **Duplikáció ellenőrzés (mentéskor)** | Leltár | Workflow 7 / „duplikáció ellenőrzés" | P2 |
| H8 | **Duplikáció audit wizard** | Leltár | Workflow 9 / lépésenként | P2 |
| H9 | **Véglegesítés + feloldás kérelem** | Leltár | Workflow 10 / `leltar_finalized` | **P1** |
| H10 | **Nyomtatás (4 formátum) + auto iktatás** | Leltár | Workflow 10 / 4 PDF | P2 |
| H11 | **Helyszín szűrő** | Leltár | Workflow 6 / „helyszín dropdown" | P3 |
| H12 | **Vonalkód mező** | Leltár | Szabály 3 / „Vonalkód" | P3 |
| H13 | **Felelős személy: tag keresőből** | Leltár | Szabály 3 / „tag keresőből" | P2 |
| H14 | **Iktatókönyv nyomtatás** | Iktatás | Workflow 13 / A4 fekvő | P2 |
| H15 | **Keresztelési igazolás generálás** | Iktatás | Workflow 14 | P2 |
| H16 | **Targykivonat + irattári jel mezők** | Iktatás | Szabály 3 / Iktatás validáció | P3 |

---

## 2. Nem implementált szabályok

| # | Szabály | Állapot | Megjegyzés |
|---|---------|---------|-----------|
| S1 | Munkanapló: 3 kategória fül | ✅ | |
| S2 | Munkanapló: szolgálat extra mezők (résztvevők, persely, igehely, szolgálatvezetők) | ✅ | |
| S3 | Munkanapló: katekézis extra mezők (résztvevők) | ✅ | |
| S4 | Munkanapló: látogatás személy/család keresés | ❌ | HIÁNYZIK (= H1) — szabad szöveges leírás van, de tag keresés nincs |
| S5 | Munkanapló: anyakönyvi trigger | ✅ | `triggerWorklogFromRegistry()` |
| S6 | Munkanapló: havi szűrés | ✅ | |
| S7 | Munkanapló: jelentés (II, IV, V, VII) | ❌ | HIÁNYZIK (= H2) |
| S8 | Leltár: 7 kategória | ✅ | |
| S9 | Leltár: auto leltári szám | ✅ | `generateNextLeltariSzam()` |
| S10 | Leltár: értékcsökkenés (2139/2004 katalógus) | ❌ | HIÁNYZIK (= H5) |
| S11 | Leltár: véglegesítés + feloldás | ❌ | HIÁNYZIK (= H9) |
| S12 | Leltár: duplikáció audit | ❌ | HIÁNYZIK (= H7 + H8) |
| S13 | Leltár: 4 nyomtatási formátum | ❌ | HIÁNYZIK (= H10) |
| S14 | Iktatás: kétirányú sorszám | ✅ | |
| S15 | Iktatás: 3 mappa-köteg | ✅ | |
| S16 | Iktatás: elintézés nyomon követés | ✅ | |
| S17 | Iktatás: iktatókönyv nyomtatás | ❌ | HIÁNYZIK (= H14) |
| S18 | Iktatás: keresztelési igazolás | ❌ | HIÁNYZIK (= H15) |

---

## 3. Lehetséges bugok

| # | Bug | Fájl | Leírás | Súlyosság |
|---|-----|------|--------|-----------|
| B1 | **Munkanapló: a kategória szűrés kliens-oldalon hardcoded típus-listával dolgozik** | `worklog-tabs.tsx:filtered` | A `types` objektum a konstansokból kellene jöjjön, nem inline. Ha a `WORKLOG_TYPES` bővül, a szűrő elavulttá válik. | ALACSONY |
| B2 | **Leltár: véglegesítés check hiányzik a CRUD-ban** | `leltar/actions.ts:saveInventoryItem` | A `saveInventoryItem` NEM ellenőrzi, hogy a leltár véglegesítve van-e. Ha a `bealitas.leltar_finalized = true`, az action mégis enged szerkeszteni/létrehozni. | **KÖZEPES** |
| B3 | **Iktatás: a `targykivonat` és `irattarijel` mező nincs a dialog form-ban** | `filing-main.tsx` | A form nem tartalmazza a targykivonat és irattarijel mezőket, bár a schema és a tábla támogatja. | ALACSONY |

---

## 4. Edge case hiányok

| # | Edge case | Modul | Állapot |
|---|-----------|-------|---------|
| E1 | Szolgálatnál résztvevők = 0 | Munkanapló | ✅ Megengedett (min: 0) |
| E2 | Perselypénz = 0 | Munkanapló | ✅ Megengedett |
| E3 | Havi szűrő: nincs bejegyzés | Munkanapló | ✅ „Nincs bejegyzés" |
| E4 | Anyakönyvi trigger: modul hiba | Munkanapló | ✅ try-catch a szerveren |
| E5 | Munkanapló törlés → anyakönyv `munkanaplo_id` nem nullázódik | Munkanapló | ⚠️ Ismert — a szabály szerint nem kaszkádol |
| E6 | Véglegesített leltár: CRUD blokkolva | Leltár | ❌ NINCS ELLENŐRZÉS (= B2) |
| E7 | Katalógus kód nincs → amortizáció nem számolódik | Leltár | ✅ Nincs amortizáció mező → nem jelenik meg (de a számítás sem) |
| E8 | Kiadásból auto létrejött tétel törlése → kiadás megmarad | Leltár | ✅ Nincs kaszkádolás |
| E9 | Concurrent iktatás sorszám | Iktatás | ⚠️ Ismert limitáció (max+1, nincs DB unique) |
| E10 | Évre nincs irat → `{YYYY}/1` | Iktatás | ✅ |
| E11 | Soft delete → lyukas sorszám | Iktatás | ✅ Megengedett |
| E12 | Elintézés nélküli irat → „Függőben" | Iktatás | ✅ ⏳ ikon |
| E13 | Keresés speciális karakterek | Iktatás | ✅ Kliens-oldali substring match |

---

## 5. Összefoglaló

### Implementáltsági állapot

| Kategória | Összes | Kész | Hibás/Hiányzik | % |
|-----------|--------|------|----------|---|
| **Szabályok** | 18 | 11 | 7 | 61% |
| **Flow-k (15)** | 15 | 8 | 7 | 53% |
| **Edge case-ek** | 13 | 10 | 3 | 77% |
| **Bugok** | — | — | 1 közepes, 2 alacsony | — |

### Javítandó — prioritás szerint

**P1 — Javítandó:**

| # | Mit | Hol |
|---|-----|-----|
| B2 | Leltár CRUD: véglegesítés ellenőrzés | `leltar/actions.ts` — `bealitas.leltar_finalized` check `saveInventoryItem` és `deleteInventoryItem`-ben |
| H9 | Leltár véglegesítés + feloldás | Új Server Actions (`finalizeLeltar`, `requestLeltarUnlock`) + UI gombok |

**P2 — Fontos, de nem blokkoló:**

| # | Mit |
|---|-----|
| H1 | Munkanapló: látogatás személy/család keresés |
| H2 | Egyházmegyei jelentés |
| H3 | Excel export |
| H5 | Amortizáció számítás + megjelenítés |
| H6 | Katalógus kód dropdown |
| H7 + H8 | Duplikáció ellenőrzés + audit wizard |
| H10 | Leltár 4 nyomtatási formátum + auto iktatás |
| H13 | Leltár felelős személy: tag kereső |
| H14 | Iktatókönyv nyomtatás |
| H15 | Keresztelési igazolás |

**P3 — Későbbi iteráció:**

| # | Mit |
|---|-----|
| H4 | Munkanapló nyomtatás |
| H11 | Leltár helyszín szűrő |
| H12 | Vonalkód mező |
| H16 | Iktatás: targykivonat + irattári jel |
| B1 | Munkanapló szűrés: konstansokból olvasás |
| B3 | Iktatás: targykivonat + irattári jel a form-ban |
