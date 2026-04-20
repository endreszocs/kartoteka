# Fázis 6 — Munkanapló + Leltár + Iktatás: Részletes implementációs terv

**Előfeltétel:** Fázis 1–5 LEZÁRVA
**Forrás elemzés:** `modules/worklog-inventory-filing.md`
**Üzleti szabályok:** `rules/worklog-inventory-filing-rules.md`
**Felhasználói folyamatok:** `workflows/worklog-inventory-filing-flow.md`
**Becsült időigény:** 4–5 nap

---

## 1. Backend (Supabase)

### Használt táblák — NEM kell létrehozni, már léteznek

| Tábla | Modul | Művelet |
|-------|-------|---------|
| `munkanaplo` | Munkanapló | TELJES CRUD (soft delete) |
| `leltar_tetelek` | Leltár | TELJES CRUD (soft delete) |
| `iktato` | Iktatás | TELJES CRUD (soft delete) |
| `bealitas` | Leltár | SELECT, UPDATE (`leltar_finalized` flag) |
| `profiles` | Mind | SELECT (congregation_id) |
| `szemely` | Munkanapló + Leltár | SELECT (személy/család keresés) |
| `keresztseg` | Iktatás | SELECT (keresztelési igazoláshoz) |
| `hazassag` | Munkanapló | SELECT (anyakönyvi összekötés) |
| `temetes` | Munkanapló | SELECT (anyakönyvi összekötés) |

### RLS

- Minden tábla `congregation_id` alapú RLS
- Soft delete: `deleted = false` szűrés alkalmazás-szinten

### Auth

- Server Actions: `getUser()` → profil → `congregation_id`
- INSERT: `congregation_id` profilból

### Role kezelés

| Funkció | Ki éri el |
|---------|----------|
| Munkanapló CRUD | Minden lelkész |
| Leltár CRUD | Minden lelkész |
| Leltár véglegesítés | Minden lelkész |
| Leltár FELOLDÁS | Esperes + Admin + Master Admin |
| Iktatás CRUD | Minden lelkész |

---

## 2. Frontend (Next.js)

### Oldalak

| Route | Fájl | Típus |
|-------|------|-------|
| `/munkanaplo` | `app/(dashboard)/munkanaplo/page.tsx` | Server Component |
| `/leltar` | `app/(dashboard)/leltar/page.tsx` | Server Component |
| `/iktato` | `app/(dashboard)/iktato/page.tsx` | Server Component |

3 különálló route — mindegyik saját page + komponensek.

### Komponensek — Munkanapló

| Fájl | Tartalom |
|------|----------|
| `components/worklog/worklog-tabs.tsx` | 3 kategória fül + hónap szűrő + tábla |
| `components/worklog/worklog-table.tsx` | Bejegyzés lista (kategóriafüggő oszlopok) |
| `components/modals/worklog-dialog.tsx` | Bejegyzés CRUD (dinamikus form) |

### Komponensek — Leltár

| Fájl | Tartalom |
|------|----------|
| `components/inventory/inventory-main.tsx` | Szűrők + statisztika + tábla + akciógombok |
| `components/inventory/inventory-table.tsx` | Tételek lista (kategória, érték, amortizáció) |
| `components/inventory/inventory-stats.tsx` | Statisztika panel (tétel szám, összérték) |
| `components/modals/inventory-dialog.tsx` | Tétel CRUD (katalógus, felelős keresés) |
| `components/modals/inventory-audit-dialog.tsx` | Duplikáció wizard |
| `components/modals/inventory-print-dialog.tsx` | Nyomtató központ (4 formátum) |

### Komponensek — Iktatás

| Fájl | Tartalom |
|------|----------|
| `components/filing/filing-main.tsx` | Irány fülek + év szűrő + keresés + statisztika + tábla |
| `components/modals/filing-dialog.tsx` | Irat CRUD (auto sorszám, irány, mappa) |

### Server Actions

| Fájl | Függvények |
|------|-----------|
| `munkanaplo/actions.ts` | `getWorklogs(month, category)`, `saveWorklog(data)`, `deleteWorklog(id)`, `generateReport(year)`, `triggerWorklogFromRegistry(...)` |
| `leltar/actions.ts` | `getInventoryItems()`, `saveInventoryItem(data)`, `deleteInventoryItem(id)`, `generateNextLeltariSzam(category)`, `checkDuplicate(name, value)`, `finalizeLeltar()`, `requestLeltarUnlock()`, `getInventoryStats()` |
| `iktato/actions.ts` | `getFilingEntries(year, direction)`, `saveFilingEntry(data)`, `deleteFilingEntry(id)`, `getNextSequenceNumber(year)`, `getFilingStats(year)`, `generateBaptismCert(memberId)` |

### Utility fájlok

| Fájl | Tartalom |
|------|----------|
| `lib/constants/worklog.ts` | Kategóriák, típusok, szolgálat extra mezők |
| `lib/constants/inventory.ts` | 7 kategória, katalógus kódok, amortizáció segéd |
| `lib/constants/filing.ts` | Irányok, mappa-kötegek, sorszám formátum |
| `lib/validations/worklog.ts` | Zod: worklogSchema |
| `lib/validations/inventory.ts` | Zod: inventoryItemSchema |
| `lib/validations/filing.ts` | Zod: filingEntrySchema |

---

## 3. Funkciók

### 3.1 — Munkanapló CRUD

**`saveWorklog(data)` Server Action:**

| Mező | Szabály |
|------|---------|
| idopont | string, kötelező |
| jellege | string, kötelező |
| cim | string, opcionális |
| leiras | string, opcionális |
| resztvevok_ferfi | number ≥ 0, opcionális |
| resztvevok_no | number ≥ 0, opcionális |
| resztvevok_gyermek | number ≥ 0, opcionális |
| persely | number ≥ 0, opcionális |
| igehely | string, opcionális |
| szolgalatvezeto | string, opcionális |
| id_szemely | number, opcionális (látogatásnál) |
| id_csalad | number, opcionális |
| megjegyzes | string, opcionális |

**`triggerWorklogFromRegistry(source, id, date, type, text)`:**
- Publikus API az anyakönyv modul számára
- INSERT munkanaplo → return munkanaplo_id

### 3.2 — Leltár CRUD

**`saveInventoryItem(data)` Server Action:**

| Mező | Szabály |
|------|---------|
| megnevezes | string, kötelező |
| kategoria | enum (7 kategória), kötelező |
| beszerzes_erteke | number > 0, kötelező |
| beszerzes_datuma | string, opcionális |
| katalogus_kod | string, opcionális |
| hasznalati_ido | number, opcionális (katalógusból auto) |
| helyszin | string, opcionális |
| felelos_id | number, opcionális |
| felelos_nev | string, opcionális |
| vonalkod | string, opcionális |
| megjegyzes | string, opcionális |

**Duplikáció ellenőrzés:**
- Mentés előtt: hasonló megnevezés + hasonló érték (±20%) keresés
- Ha van → return `{ duplicate: true, existingItem }` → kliens dönt

**Amortizáció számítás (kliens-oldali derived):**
```
éves_értékcsökkenés = beszerzes_erteke / hasznalati_ido
kor = aktuális_év − beszerzes_éve
jelenlegi_ertek = max(0, beszerzes_erteke − (kor × éves_értékcsökkenés))
amortizacio_pct = min(100, (kor / hasznalati_ido) × 100)
```

### 3.3 — Iktatás CRUD

**`saveFilingEntry(data)` Server Action:**

| Mező | Szabály |
|------|---------|
| direction | enum('incoming','outgoing'), kötelező |
| kelt | string, kötelező |
| subject | string, kötelező |
| sender_or_recipient | string, opcionális |
| file_folder | enum('F.Á.','É.Á.','A.K.'), kötelező |
| targykivonat | string, opcionális |
| elintezes_ideje | string, opcionális |
| elintezes_modja | string, opcionális |
| irattarijel | string, opcionális |
| megjegyzes | string, opcionális |

**Sorszám generálás:**
- SELECT max(sequence_number) FROM iktato WHERE year = {YYYY} AND congregation_id = {id}
- Return: max + 1 (vagy 1 ha nincs korábbi)

---

## 4. Prioritás — lépések sorrendje

### SPRINT 1: Munkanapló (~1.5 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **1.1** | Konstansok + Zod | `lib/constants/worklog.ts`, `lib/validations/worklog.ts` |
| **1.2** | Server Actions | `munkanaplo/actions.ts` |
| **1.3** | Page + WorklogTabs + WorklogTable | `munkanaplo/page.tsx`, `worklog/worklog-tabs.tsx`, `worklog/worklog-table.tsx` |
| **1.4** | WorklogDialog (dinamikus form) | `modals/worklog-dialog.tsx` |
| **1.5** | triggerWorklogFromRegistry publikus API | (már az actions.ts-ben) |

### SPRINT 2: Leltár (~2 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **2.1** | Konstansok + Zod | `lib/constants/inventory.ts`, `lib/validations/inventory.ts` |
| **2.2** | Server Actions | `leltar/actions.ts` |
| **2.3** | Page + InventoryMain + Table + Stats | `leltar/page.tsx`, `inventory/inventory-main.tsx`, `inventory/inventory-table.tsx`, `inventory/inventory-stats.tsx` |
| **2.4** | InventoryDialog (katalógus, amortizáció, felelős) | `modals/inventory-dialog.tsx` |
| **2.5** | Duplikáció audit wizard | `modals/inventory-audit-dialog.tsx` |
| **2.6** | Véglegesítés + nyomtatás (4 formátum) | `modals/inventory-print-dialog.tsx` |

### SPRINT 3: Iktatás (~1 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **3.1** | Konstansok + Zod | `lib/constants/filing.ts`, `lib/validations/filing.ts` |
| **3.2** | Server Actions | `iktato/actions.ts` |
| **3.3** | Page + FilingMain | `iktato/page.tsx`, `filing/filing-main.tsx` |
| **3.4** | FilingDialog | `modals/filing-dialog.tsx` |

### SPRINT 4: Build (~0.5 nap)

| Lépés | Mit |
|-------|-----|
| **4.1** | Sidebar frissítés (3 új menüpont) |
| **4.2** | Build ellenőrzés |

### Összesített ütemezés

```
Sprint 1 ■■■■■■░░░░░░░░░░  (1.5 nap)  Munkanapló (3 kategória + trigger)
Sprint 2 ░░░░░░■■■■■■■■░░  (2 nap)    Leltár (7 kat. + audit + nyomtatás)
Sprint 3 ░░░░░░░░░░░░░░■■  (1 nap)    Iktatás (sorszám + irány + keresés)
Sprint 4 ░░░░░░░░░░░░░░░■  (0.5 nap)  Sidebar + Build
                                        ──────────────────────────
                                        Összesen: ~5 nap
```

---

## 5. Függőségek

### Telepítendő npm csomag

Nincs új csomag szükséges.

### Fájl-függőségi fa

```
lib/constants/worklog.ts              ← NINCS FÜGGŐSÉGE
lib/constants/inventory.ts            ← NINCS FÜGGŐSÉGE
lib/constants/filing.ts               ← NINCS FÜGGŐSÉGE
lib/validations/worklog.ts            ← függ: worklog.ts
lib/validations/inventory.ts          ← függ: inventory.ts
lib/validations/filing.ts             ← függ: filing.ts
    │
    ▼
app/(dashboard)/munkanaplo/
├── page.tsx                          ← Server: congregation_id
├── actions.ts                        ← CRUD + trigger + jelentés
    │
app/(dashboard)/leltar/
├── page.tsx                          ← Server: congregation_id + settings
├── actions.ts                        ← CRUD + duplikáció + véglegesítés + feloldás
    │
app/(dashboard)/iktato/
├── page.tsx                          ← Server: congregation_id
├── actions.ts                        ← CRUD + sorszám + igazolás
    │
    ▼
components/worklog/
├── worklog-tabs.tsx                  ← 3 kategória fül + hónap szűrő
├── worklog-table.tsx                 ← Kategóriafüggő oszlopok

components/inventory/
├── inventory-main.tsx                ← Szűrők + statisztika + akciógombok
├── inventory-table.tsx               ← Tételek (érték, amortizáció)
├── inventory-stats.tsx               ← Statisztika panel

components/filing/
├── filing-main.tsx                   ← Irány fülek + év + keresés + statisztika

components/modals/
├── worklog-dialog.tsx                ← Munkanapló CRUD (dinamikus form)
├── inventory-dialog.tsx              ← Leltár tétel CRUD (katalógus, amortizáció)
├── inventory-audit-dialog.tsx        ← Duplikáció wizard
├── inventory-print-dialog.tsx        ← Nyomtató központ (4 PDF)
├── filing-dialog.tsx                 ← Irat CRUD (auto sorszám)
```

**Összesen: ~24 új fájl**
- 3 Server Page
- 3 Server Action fájl
- 6 Client Component
- 5 Modal Component
- 6 Utility fájl (3 konstans + 3 validáció)

### Modul-függőségek

| Fázis 6 funkció | Függ-e más modultól? |
|-----------------|---------------------|
| Munkanapló: családlátogatás személy keresés | OLVAS `szemely` (Fázis 3) |
| Munkanapló: anyakönyvi trigger | HÍVJÁK az anyakönyv modulból (Fázis 5) |
| Leltár: kiadás-összekötés | A Fázis 4 `saveExpense()` INSERT-álja a `leltar_tetelek`-be |
| Leltár: felelős személy keresés | OLVAS `szemely` (Fázis 3) |
| Leltár: véglegesítés | OLVAS/ÍR `bealitas` (Fázis 4 tábla) |
| Leltár: auto iktatás nyomtatáskor | ÍR `iktato` (saját Fázis 6 tábla) |
| Iktatás: keresztelési igazolás | OLVAS `szemely` + `keresztseg` (Fázis 3 + 5) |

### Meglévő elemekre való támaszkodás

| Elem | Hogyan használja |
|------|-----------------|
| `(dashboard)/layout.tsx` | Auth + sidebar + header |
| `lib/supabase/server.ts` | `createClient()` |
| `lib/utils/date.ts` | `formatHuDate()` |
| `lib/constants/finance.ts` | `formatCurrency()` (leltár értékekhez) |

---

## Elfogadási kritériumok

| # | Kritérium | Modul |
|---|-----------|-------|
| 1 | Munkanapló: 3 kategória fül, havi szűrő, kategóriafüggő form | Munkanapló |
| 2 | Munkanapló: szolgálatnál résztvevők + persely + igehely | Munkanapló |
| 3 | Munkanapló: látogatásnál személy/család keresés | Munkanapló |
| 4 | Munkanapló: `triggerWorklogFromRegistry` publikus API (Fázis 5 számára) | Munkanapló |
| 5 | Leltár: 7 kategória, auto leltári szám, amortizáció számítás | Leltár |
| 6 | Leltár: duplikáció audit wizard (összevon/töröl/hagy) | Leltár |
| 7 | Leltár: véglegesítés + feloldás kérelem (esperes) | Leltár |
| 8 | Leltár: 4 nyomtatási formátum + auto iktatás | Leltár |
| 9 | Iktatás: kétirányú auto sorszám (`{YYYY}/{N}`) | Iktatás |
| 10 | Iktatás: irány szűrő + év szűrő + full-text keresés | Iktatás |
| 11 | Iktatás: elintézés nyomon követés (függőben / elintézett) | Iktatás |
| 12 | Iktatás: iktatókönyv nyomtatás (A4 fekvő) | Iktatás |
| 13 | Sidebar: 3 új menüpont hozzáadva | Layout |
| 14 | Build 0 hibával lefordul | Mind |
