# Fázis 5 — Anyakönyv: Részletes implementációs terv

**Előfeltétel:** Fázis 1–4 LEZÁRVA
**Forrás elemzés:** `modules/church-registry.md`
**Üzleti szabályok:** `rules/church-registry-rules.md`
**Felhasználói folyamatok:** `workflows/church-registry-flow.md`
**Becsült időigény:** 4–5 nap

---

## 1. Backend (Supabase)

### Használt táblák — NEM kell létrehozni, már léteznek

| Tábla | Művelet | Megjegyzés |
|-------|---------|-----------|
| `keresztseg` | TELJES CRUD | Keresztelés (okirat, dátum, szülők, alapige, sablon JSON) |
| `konfirmalas` | TELJES CRUD | Konfirmáció (batch insert támogatás) |
| `hazassag` | TELJES CRUD | Házasság (vőlegény + menyasszony) |
| `temetes` | TELJES CRUD | Temetés (halál dátum + temetés dátum) |
| `bekoltozott` | TELJES CRUD | Beköltözés |
| `elkoltozott` | TELJES CRUD | Elköltözés |
| `attert` | TELJES CRUD | Áttérés |
| `kitert` | TELJES CRUD | Kitérés |
| `szemely` | SELECT, UPDATE | Szülő keresés + CNP összekötés |
| `csalad` | SELECT, INSERT | Automatikus család létrehozás (kereszteléskor) |
| `gyerek` | SELECT, INSERT | Gyerek–család regisztráció |
| `adrlocality` | SELECT | Hely keresés |
| `profiles` | SELECT | Gyülekezet azonosító |
| `congregations` | SELECT | Gyülekezet neve (emléklaphoz) |
| `munkanaplo` | INSERT | Munkanapló bejegyzés (opcionális) |

### RLS

- Minden tábla `congregation_id` alapú RLS
- INSERT-nél `congregation_id` profilból

### Auth

- Server Component: `createClient()` → profil → `congregation_id`
- Server Actions: `getUser()` + profil minden műveletben

### Role kezelés

Nincs emelt jogosultság — minden lelkész teljes CRUD-ot kap a saját gyülekezetén belül. A módosítás-kérelem workflow (esperes) NEM vonatkozik az anyakönyvre.

---

## 2. Frontend (Next.js)

### Oldalak

| Route | Fájl | Típus |
|-------|------|-------|
| `/anyakonyv` | `app/(dashboard)/anyakonyv/page.tsx` | Server Component |

Egyetlen route — 9 kliens-oldali fül.

### Komponensek

#### Orchestrátor

| Fájl | Tartalom |
|------|----------|
| `app/(dashboard)/anyakonyv/page.tsx` | Gyülekezet ID + név lekérdezés |
| `components/registry/registry-tabs.tsx` | 9 fül orchestrátor + fülváltás + szűrők |

#### Fül komponensek

| Fájl | Tartalom |
|------|----------|
| `components/registry/registry-table.tsx` | Közös táblázat (minden fülhöz — oszlopok dinamikusan) |
| `components/registry/registry-filters.tsx` | Év dropdown + szöveg kereső |
| `components/registry/overview-tab.tsx` | Áttekintő statisztika |

#### Modal-ok

| Fájl | Tartalom |
|------|----------|
| `components/modals/baptism-dialog.tsx` | Keresztelés CRUD (szülő keresés, sablon, munkanapló) |
| `components/modals/confirmation-dialog.tsx` | Konfirmáció tömeges rögzítés (lista, korosztály, wizard) |
| `components/modals/confirmation-edit-dialog.tsx` | Egyedi konfirmáció szerkesztés |
| `components/modals/marriage-dialog.tsx` | Házasság CRUD (vőlegény + menyasszony) |
| `components/modals/burial-dialog.tsx` | Temetés CRUD |
| `components/modals/movement-dialog.tsx` | Tagmozgás CRUD (4 típus: beköltözés, elköltözés, áttérés, kitérés — közös form, típusfüggő mezők) |

#### Segédkomponensek

| Fájl | Tartalom |
|------|----------|
| `components/registry/member-search-ak.tsx` | Személy kereső (anyakönyvhöz — kiválasztás + „Gyorsrögzítés" gomb) |
| `components/registry/parent-search-ak.tsx` | Szülő kereső (CNP + vallás + családnév visszaadás) |
| `components/registry/baptism-certificate.tsx` | Emléklap HTML generálás + nyomtatás |

#### Server Actions

| Fájl | Függvények |
|------|-----------|
| `app/(dashboard)/anyakonyv/actions.ts` | `getRegistryData(tab, congId)`, `saveRegistryEntry(tab, data)`, `updateRegistryEntry(tab, id, data)`, `deleteRegistryEntry(tab, id)`, `getNextOkiratNumber(tab, year, congId)`, `searchMemberForRegistry(query)`, `searchParentForRegistry(query, isMale)` |
| `app/(dashboard)/anyakonyv/baptism-actions.ts` | `saveBaptism(data)` (szülő UPDATE + család auto + munkanapló), `getBaptismDetails(id)` (emléklap adatok), `checkAndCreateFamily(childId, fatherCnp, motherCnp, congId)` |
| `app/(dashboard)/anyakonyv/confirmation-actions.ts` | `saveConfirmationBatch(candidates, sharedData)`, `getConfirmationCandidates(query)`, `getCandidatesByAge(minAge, maxAge)`, `checkBaptismStatus(personIds)` |

#### Utility fájlok

| Fájl | Tartalom |
|------|----------|
| `lib/constants/registry.ts` | Fül nevek, típusok, okiratszám formátum, dinamikus gomb konfig (szín + szöveg fülenként) |
| `lib/validations/registry.ts` | Zod sémák: baptismSchema, confirmationSchema, marriageSchema, burialSchema, movementSchema |

---

## 3. Funkciók

### 3.1 — Közös anyakönyvi CRUD

#### `getRegistryData(tab, congId)` Server Action

A `tab` paraméter meghatározza a lekérdezendő táblát és az oszlopokat:

| Tab | Tábla | Speciális JOIN-ok |
|-----|-------|------------------|
| `keresztseg` | keresztseg | szemely (név, sz_datum), adrlocality (hely) |
| `konfirmalas` | konfirmalas | szemely (név, nem, sz_datum) |
| `hazassag` | hazassag | szemely×2 (vőlegény + menyasszony) |
| `temetes` | temetes | szemely, adrlocality×2 (halál + temetés hely) |
| `bekoltozott` | bekoltozott | szemely, adrlocality |
| `elkoltozott` | elkoltozott | szemely, adrlocality |
| `attert` | attert | szemely, adrlocality |
| `kitert` | kitert | szemely, adrlocality |

Mindegyik: `.eq('congregation_id', congId).order('datum', { ascending: false })`

#### `saveRegistryEntry(tab, data)` / `updateRegistryEntry(tab, id, data)`

- Zod validáció (típusfüggő séma)
- INSERT / UPDATE a megfelelő táblába
- `congregation_id` profilból
- `revalidatePath('/anyakonyv')`

#### `deleteRegistryEntry(tab, id)`

- Confirm kliens-oldalon
- DELETE (végleges — nincs soft delete az anyakönyvben)
- `revalidatePath('/anyakonyv')`

### 3.2 — Keresztelés specifikus (`saveBaptism`)

**Szerver logika (10 lépés):**
1. Zod validáció (baptismSchema)
2. Okiratszám generálás (ha nincs)
3. Sablon JSON összeállítás (anya leánykori neve, szülők vallása) → `|sablon:` delimiter + JSON
4. INSERT `keresztseg`
5. UPDATE `szemely`: `id_apja`, `id_anyja`, `apjaneve`, `anyjaneve` (ha szülő megadva)
6. Ha új bejegyzés + szülő CNP van → `checkAndCreateFamily()` (FLOW 4)
7. Ha munkanapló checkbox → INSERT `munkanaplo`
8. `revalidatePath('/anyakonyv')`

#### `checkAndCreateFamily(childId, fatherCnp, motherCnp, congId)`

1. Apa keresés CNP alapján → `ferfiId`
2. Anya keresés CNP alapján → `noId`
3. Család keresés (csalad: id_ferfi + id_no páros)
4. Ha van → gyerek INSERT (ha még nincs benne)
5. Ha nincs + van lakcím → család INSERT + gyerek INSERT
6. Ha nincs + nincs lakcím → return { warning: 'Nincs lakcím' }

### 3.3 — Konfirmáció batch (`saveConfirmationBatch`)

**Szerver logika:**
1. Összes jelölt validáció
2. Keresztelés státusz ellenőrzés (`checkBaptismStatus`)
3. Ha vannak hiányosak → return { missingBaptisms: [...] } (kliens dönt: wizard vagy skip)
4. Batch INSERT `konfirmalas`
5. Ha munkanapló → INSERT `munkanaplo`

#### `getCandidatesByAge(minAge, maxAge)`
- `szemely` WHERE age BETWEEN minAge AND maxAge AND NOT IN (SELECT id_szemely FROM konfirmalas)

### 3.4 — Okiratszám generálás

**`getNextOkiratNumber(tab, year, congId)`:**
1. SELECT okirat FROM {tab} WHERE congregation_id AND datum LIKE '{year}%'
2. Regex: `/(\d+)$/` → max szám
3. Ha nincs → `{YYYY}01001`
4. Ha van → max + 1

### 3.5 — Validációk (Zod sémák)

**baptismSchema:**
```
id_szemely:       number, kötelező
datum:            string, YYYY-MM-DD, kötelező
okirat:           string, kötelező
helyid:           number | null
lelkeszneve:      string | null
keresztszulok:    string | null
alapige:          string | null
apjaneve:         string | null
anyjaneve:        string | null
id_apja_cnp:      string | null
id_anyja_cnp:     string | null
apa_vallas:       string | null
anya_vallas:      string | null
anya_leanyneve:   string | null
munkanaploba:     boolean
megjegyzes:       string | null
```

**confirmationSchema (közös mezők):**
```
datum:            string, kötelező
lelkeszneve:      string | null
megjegyzes:       string | null
munkanaploba:     boolean
candidates:       number[], min(1), "Minimum 1 konfirmandus szükséges"
```

**marriageSchema:**
```
id_ferfi:         number, kötelező, "Vőlegény kötelező"
id_no:            number, kötelező, "Menyasszony kötelező"
datum:            string, kötelező
okirat:           string, kötelező
lelkeszneve:      string | null
tanuk:            string | null
```

**burialSchema:**
```
id_szemely:       number, kötelező
hdatum:           string, kötelező, "Halál dátuma kötelező"
tdatum:           string, kötelező, "Temetés dátuma kötelező"
hoka:             string | null
hhelyid:          number | null
thelyid:          number | null
lelkeszneve:      string | null
munkanaploba:     boolean
```

**movementSchema (4 típus közös):**
```
tipus:            enum('bekoltozott','elkoltozott','attert','kitert')
id_szemely:       number, kötelező
datum:            string, kötelező
helyid:           number | null (honnan/hová)
felekezet:        string | null (áttérés/kitérés)
igazolas:         string | null (beköltözés)
kulfoldre:        boolean (elköltözés)
megjegyzes:       string | null
```

---

## 4. Prioritás — lépések sorrendje

### SPRINT 1: Alap + keresztelés (~1.5 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **1.1** | Konstansok + Zod sémák | `lib/constants/registry.ts`, `lib/validations/registry.ts` |
| **1.2** | Közös Server Actions (CRUD + okiratszám + keresés) | `anyakonyv/actions.ts` |
| **1.3** | Page + RegistryTabs + RegistryTable + RegistryFilters | `anyakonyv/page.tsx`, `registry/registry-tabs.tsx`, `registry/registry-table.tsx`, `registry/registry-filters.tsx` |
| **1.4** | Keresztelés Server Actions (saveBaptism + család auto) | `anyakonyv/baptism-actions.ts` |
| **1.5** | Keresztelés modal (szülő keresés, sablon, munkanapló) | `modals/baptism-dialog.tsx`, `registry/parent-search-ak.tsx` |

**Eredmény:** 9 fül működik szűréssel, a keresztelés teljes CRUD (szülő CNP, család auto, emléklap).

### SPRINT 2: Konfirmáció + wizard (~1.5 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **2.1** | Konfirmáció Server Actions (batch + korosztály + baptism check) | `anyakonyv/confirmation-actions.ts` |
| **2.2** | Konfirmáció tömeges modal (lista + korosztály kereső) | `modals/confirmation-dialog.tsx` |
| **2.3** | Konfirmáció wizard (hiányzó keresztelés pótlás) | A `confirmation-dialog.tsx` részeként — state-alapú wizard |
| **2.4** | Egyedi konfirmáció szerkesztés | `modals/confirmation-edit-dialog.tsx` |

**Eredmény:** Tömeges konfirmáció + wizard teljesen működik.

### SPRINT 3: Házasság + temetés + tagmozgások (~1 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **3.1** | Házasság modal (két személy) | `modals/marriage-dialog.tsx` |
| **3.2** | Temetés modal | `modals/burial-dialog.tsx` |
| **3.3** | Tagmozgás modal (4 típus közös form) | `modals/movement-dialog.tsx` |

**Eredmény:** Minden anyakönyvi típus CRUD működik.

### SPRINT 4: Emléklap + export + build (~0.5 nap)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **4.1** | Emléklap generálás + nyomtatás | `registry/baptism-certificate.tsx` |
| **4.2** | Excel export | A `registry-tabs.tsx`-ben gomb + SheetJS |
| **4.3** | Áttekintő statisztika | `registry/overview-tab.tsx` |
| **4.4** | Build ellenőrzés | — |

### Összesített ütemezés

```
Sprint 1 ■■■■■■░░░░░░░░░░  (1.5 nap)  Alap + keresztelés + család auto
Sprint 2 ░░░░░░■■■■■░░░░░  (1.5 nap)  Konfirmáció + wizard
Sprint 3 ░░░░░░░░░░░■■■░░  (1 nap)    Házasság + temetés + tagmozgások
Sprint 4 ░░░░░░░░░░░░░░■░  (0.5 nap)  Emléklap + export + build
                                        ───────────────────────
                                        Összesen: ~4.5 nap
```

---

## 5. Függőségek

### Telepítendő npm csomag

Nincs új csomag. A meglévők elegendőek (shadcn/ui, zod, sonner, recharts).

### Fájl-függőségi fa

```
lib/constants/registry.ts             ← NINCS FÜGGŐSÉGE
lib/validations/registry.ts           ← függ: registry.ts
    │
    ▼
app/(dashboard)/anyakonyv/
├── page.tsx                          ← Server: congregation_id + név
├── actions.ts                        ← Közös CRUD + okiratszám + keresés
├── baptism-actions.ts               ← Keresztelés specifikus (szülő + család + munkanapló)
├── confirmation-actions.ts          ← Konfirmáció batch + korosztály + wizard check
    │
    ▼
components/registry/
├── registry-tabs.tsx                 ← 9 fül orchestrátor
├── registry-table.tsx               ← Közös tábla (dinamikus oszlopok)
├── registry-filters.tsx             ← Év + szöveg szűrő
├── overview-tab.tsx                 ← Áttekintő
├── member-search-ak.tsx             ← Személy kereső + „Gyorsrögzítés"
├── parent-search-ak.tsx             ← Szülő kereső (CNP + vallás)
├── baptism-certificate.tsx          ← Emléklap HTML + nyomtatás
    │
    ▼
components/modals/
├── baptism-dialog.tsx               ← Keresztelés (szülő, sablon, munkanapló)
├── confirmation-dialog.tsx          ← Konfirmáció tömeges (lista + wizard)
├── confirmation-edit-dialog.tsx     ← Egyedi konfirmáció szerkesztés
├── marriage-dialog.tsx              ← Házasság (két személy)
├── burial-dialog.tsx                ← Temetés
├── movement-dialog.tsx              ← Tagmozgás (4 típus közös)
```

**Összesen: ~18 új fájl**
- 1 Server Page
- 3 Server Action fájl
- 7 Client Component (fülek + segéd)
- 6 Modal Component
- 2 Utility fájl

### Modul-függőségek

| Fázis 5 funkció | Függ-e más modultól? |
|-----------------|---------------------|
| Személy keresés | OLVAS `szemely` (Fázis 3) |
| Szülő CNP összekötés | ÍR `szemely.id_apja/id_anyja` (Fázis 3 tábla) |
| Család auto-létrehozás | ÍR `csalad` + `gyerek` (Fázis 3 táblák) |
| Munkanapló bejegyzés | ÍR `munkanaplo` (Fázis 6 tábla — de a tábla már létezik) |
| Tag gyorsrögzítés + visszatérés | HASZNÁLJA `member-form-dialog` (Fázis 3 modal) |

### Meglévő elemekre való támaszkodás

| Elem | Hogyan használja |
|------|-----------------|
| `(dashboard)/layout.tsx` | Auth + sidebar + header |
| `lib/supabase/server.ts` | `createClient()` |
| `lib/utils/date.ts` | `formatHuDate()` |
| `lib/utils/member-helpers.ts` | `formatNameWithPrefix()` |
| `components/modals/member-form-dialog.tsx` (Fázis 3) | Tag gyorsrögzítés → visszatérés az anyakönyvbe |

---

## Elfogadási kritériumok

| # | Kritérium |
|---|-----------|
| 1 | 9 fül működik (szűrés + rendezés + keresés mindegyiken) |
| 2 | Keresztelés CRUD (okiratszám generálás, szülő CNP, sablon JSON) |
| 3 | Kereszteléskor automatikus család létrehozás (ha szülő CNP + lakcím van) |
| 4 | Konfirmáció tömeges rögzítés (korosztály kereső, duplikáció védelem) |
| 5 | Konfirmáció wizard: hiányzó keresztelés pótlás (lépésenként) |
| 6 | Házasság: vőlegény + menyasszony kötelező |
| 7 | Temetés: halál + temetés dátum kötelező (NEM állítja a meghalt flag-et) |
| 8 | 4 tagmozgás: CRUD (NEM állítja a tag státuszt) |
| 9 | Tag nincs a rendszerben → gyorsrögzítés → visszatérés az anyakönyvbe |
| 10 | Munkanapló integráció (checkbox → munkanaplo INSERT) |
| 11 | Emléklap nyomtatás (dinamikus szülő név, sablon, Google Fonts) |
| 12 | Excel export (szűrt adatok, típusfüggő oszlopok) |
| 13 | Build 0 hibával lefordul |
