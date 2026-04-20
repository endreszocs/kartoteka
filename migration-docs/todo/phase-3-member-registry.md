# Fázis 3 — Tagnyilvántartás: Részletes implementációs terv

**Előfeltétel:** Fázis 1 (Core) + Fázis 2 (Dashboard) — LEZÁRVA
**Forrás elemzés:** `modules/member-registry.md`
**Üzleti szabályok:** `rules/member-registry-rules.md`
**Felhasználói folyamatok:** `workflows/member-registry-flow.md`
**Becsült időigény:** 5–7 nap

---

## 1. Backend (Supabase)

### Használt táblák — NEM kell létrehozni, már léteznek

| Tábla | Művelet | Megjegyzés |
|-------|---------|-----------|
| `szemely` | SELECT, INSERT, UPDATE, DELETE | 30+ oszlop, a rendszer gerince |
| `csalad` | SELECT, INSERT, UPDATE, DELETE | Családok (férj + feleség ID) |
| `gyerek` | SELECT, INSERT, DELETE | Gyermek–család junction |
| `csoport` | SELECT, INSERT, UPDATE, DELETE | Körzetek (`iskorzet = true` szűrővel) |
| `presbiter` | SELECT, INSERT, DELETE | Presbiteri bejegyzések |
| `adrlocality` | SELECT, INSERT | Települések (dinamikus létrehozás) |
| `adrstreet` | SELECT, INSERT | Utcák (dinamikus létrehozás) |
| `adrcounty` | SELECT | Megyék (olvasás) |
| `felmentes` | SELECT, INSERT | Járulék-felmentések |
| `befizetes` | SELECT | Befizetések (CSAK OLVASÁS — a pénzügyi modul kezeli) |
| `elkoltozott` | SELECT, INSERT | Elköltözöttek |
| `kitert` | SELECT, INSERT | Kitértek |
| `keresztseg` | SELECT, INSERT, UPDATE, DELETE | Keresztelés |
| `konfirmalas` | SELECT, INSERT, UPDATE, DELETE | Konfirmáció |
| `temetes` | SELECT, INSERT | Temetés |
| `bekoltozott` | SELECT, INSERT | Beköltözöttek |
| `attert` | SELECT, INSERT | Áttértek |
| `korzetfilter` | SELECT | Körzet cím-szűrők (olvasás) |
| `bealitas` | SELECT, UPDATE | Névjegyzék zárolás |
| `nevjegyzek` | SELECT, INSERT, DELETE | Választói névjegyzék |
| `munkanaplo` | SELECT, DELETE | Munkanapló (kivezetésnél rákérdezéssel) |

### RLS — már meglévő policy-k

- Minden tábla `congregation_id` alapú RLS-sel védett
- A bejelentkezett user csak a saját gyülekezetének adatait éri el
- INSERT-nél a `congregation_id`-t a szerver állítja be (profilból)

### Auth

- Server Component: `createClient()` → `getUser()` → profil lekérdezés → `congregation_id`
- Server Action: minden műveletben `getUser()` ellenőrzés
- A `congregation_id` a felhasználó profiljából jön, SOHA nem a klienstől

### Role kezelés

| Funkció | Ki éri el |
|---------|----------|
| Tag CRUD (személyek, családok) | Minden bejelentkezett lelkész (saját gyülekezet) |
| Presbiter / körzet CRUD | Minden bejelentkezett lelkész |
| Választói névjegyzék zárolás | Minden lelkész |
| Névjegyzék zárolás FELOLDÁS | Esperes + Admin + Master Admin |
| Nem-ellenőrzés (tömeges) | Master Admin (God Mode) |
| Tömeges Excel import | Master Admin (God Mode) |

---

## 2. Frontend (Next.js)

### Oldalak

| Route | Fájl | Típus | Tartalom |
|-------|------|-------|----------|
| `/tagnyilvantartas` | `app/(dashboard)/tagnyilvantartas/page.tsx` | Server Component | Fő oldal: 6 fül (Áttekintés, Személyek, Családok, Presbiterek, Körzetek, Választók) |

Egyetlen route — a 6 fül kliens-oldalon váltódik (Tabs komponens).

### Komponensek

#### Server Component-ek

| Fájl | Props | Mit csinál |
|------|-------|-----------|
| `app/(dashboard)/tagnyilvantartas/page.tsx` | — | Adatlekérdezés orchestrátor → props szétszórás a füleknek |

#### Client Component-ek (fő fülek)

| Fájl | Tartalom |
|------|----------|
| `components/members/member-tabs.tsx` | Fül-váltó orchestrátor (6 fül) |
| `components/members/overview-tab.tsx` | Áttekintés: demográfia, korcsoportok, előrejelzés, rekordok, top nevek |
| `components/members/persons-tab.tsx` | Személyek: lista, szűrés, rendezés, keresés |
| `components/members/families-tab.tsx` | Családok: lista, keresés, rendezés |
| `components/members/presbyters-tab.tsx` | Presbiterek: lista |
| `components/members/districts-tab.tsx` | Körzetek: lista, család-hozzárendelés |
| `components/members/voters-tab.tsx` | Választók: névjegyzék, szűrők |

#### Client Component-ek (segéd)

| Fájl | Tartalom |
|------|----------|
| `components/members/member-table.tsx` | Tag táblázat sorok renderelése + rendezés |
| `components/members/member-search.tsx` | Okos kereső (szóköz-darabolás, cím + név) |
| `components/members/member-status-badge.tsx` | Fizetési státusz badge (Rendezve/Felmentett/Hátralékos/...) |
| `components/members/family-card.tsx` | Egy család kártya megjelenítése |
| `components/members/parent-search.tsx` | Szülő keresés (élő keresés, kor + cím kijelzés) |
| `components/members/age-groups-chart.tsx` | 11 korcsoportos progress bar diagram |
| `components/members/forecast-cards.tsx` | 5/10 éves előrejelzés kártyák |
| `components/members/district-families.tsx` | Körzet → családok hozzárendelés lista |
| `components/members/voter-list.tsx` | Választók szűrt táblázata |

#### Modal-ok

| Fájl | Mikor nyílik |
|------|-------------|
| `components/modals/member-details-dialog.tsx` | Tag kartoték (adatlap): személyi + anyakönyvi + pénzügyi + családfa |
| `components/modals/member-form-dialog.tsx` | Tag felvétel / szerkesztés (3 fül: személyes, anyakönyvi, pénzügyi) |
| `components/modals/member-remove-dialog.tsx` | Tag kivezetés (elhunyt/elköltözött/kitért/törlés) |
| `components/modals/parent-quick-add-dialog.tsx` | Szülő gyorsrögzítés |
| `components/modals/family-details-dialog.tsx` | Család adatlap (tagok, fizetések) |
| `components/modals/family-form-dialog.tsx` | Család létrehozás / szerkesztés |
| `components/modals/presbyter-form-dialog.tsx` | Presbiter felvétel / szerkesztés |
| `components/modals/district-form-dialog.tsx` | Körzet létrehozás / szerkesztés |
| `components/modals/district-families-dialog.tsx` | Körzet → családok hozzárendelés modal |
| `components/modals/unassigned-families-dialog.tsx` | Körzet nélküli családok |
| `components/modals/gender-check-dialog.tsx` | Nem-ellenőrzés (God Mode) |
| `components/modals/voters-print-dialog.tsx` | Választók névjegyzéke nyomtatás |

#### Server Actions

| Fájl | Függvények |
|------|-----------|
| `app/(dashboard)/tagnyilvantartas/actions.ts` | `getMembers()`, `getMemberDetails(id)`, `saveMember(data)`, `removeMember(id, reason, details)`, `getOrCreateLocality(name)`, `getOrCreateStreet(name, localityId)` |
| `app/(dashboard)/tagnyilvantartas/family-actions.ts` | `getFamilies()`, `saveFamily(data)`, `deleteFamily(id)`, `getFamilyDetails(id)` |
| `app/(dashboard)/tagnyilvantartas/presbyter-actions.ts` | `getPresbyters()`, `savePresbyter(data)`, `deletePresbyter(personId)`, `getDistricts()`, `saveDistrict(data)`, `deleteDistrict(id)`, `assignFamilyToDistrict(familyId, districtId)`, `removeFamilyFromDistrict(familyId)`, `autoAssignFamilies(ids, districtId)` |
| `app/(dashboard)/tagnyilvantartas/voter-actions.ts` | `getVoters()`, `lockVoterList(year)`, `unlockVoterList(year)` |
| `app/(dashboard)/tagnyilvantartas/gender-actions.ts` | `getGenderMismatches()`, `saveGenderFixes(fixes)` |

#### Utility fájlok

| Fájl | Tartalom |
|------|----------|
| `lib/constants/members.ts` | Státusz szűrők, nem-heurisztika kivétel-lista, korcsoportok (11 db), badge színek |
| `lib/validations/members.ts` | Zod sémák: memberSchema, familySchema, presbyeterSchema, districtSchema, removeSchema |
| `lib/utils/member-helpers.ts` | `formatNameWithPrefix()`, `calculatePaymentStatus()`, `guessGender()`, `generateCnp()` |

---

## 3. Funkciók

### 3.1 — Személyek CRUD

#### `getMembers()` Server Action

**5 párhuzamos lekérdezés:**

| # | Tábla | Mit kérdez |
|---|-------|-----------|
| 1 | `szemely` | Összes tag (isvisible=true), JOIN adrstreet + adrlocality |
| 2 | `befizetes` | Aktuális évi befizetések (id_szemely + id_csalad) |
| 3 | `felmentes` | Felmentések (érvényes tartományban) |
| 4 | `csalad` | Családok (id_ferfi + id_no → személy→család mapping) |
| 5 | `gyerek` | Gyerek-család kapcsolatok |

**Visszatérés:** enriched tagok tömb (+ fizetési státusz badge + családId mapping)

#### `saveMember(data)` Server Action

**Validáció (Zod):**

| Mező | Szabály |
|------|---------|
| csaladnev | string, min(1), kötelező |
| k_nev | string, min(1), kötelező |
| ferfi | boolean, kötelező |
| sz_datum | string (YYYY-MM-DD) vagy null |
| vallas | string, alapértelmezés: "Református" |
| c_helyseg_text | string, kötelező (település név → getOrCreateLocality) |
| c_utca_text | string, kötelező (utca név → getOrCreateStreet) |
| c_szam | string, alapértelmezés: "1" |
| belepes_oka | enum: "alap", "bekoltozott", "attert" |
| id_apja_cnp | string vagy null (szülő CNP) |
| id_anyja_cnp | string vagy null |
| kereszteles.datum | string vagy null |
| konfirmacio.datum | string vagy null |

**Szerver logika:**
1. Zod validáció
2. getUser() + profil
3. Település/utca getOrCreate
4. CNP generálás (ha új tag)
5. INSERT vagy UPDATE (id alapján)
6. Ha szülő CNP van → automatikus család létrehozás + gyerek regisztráció
7. Keresztelés/konfirmáció upsert
8. Ha felmentett → felmentes INSERT
9. revalidatePath

#### `removeMember(id, reason, details)` Server Action

**Reason enum:** `meghalt`, `elkoltozott`, `kitert`, `torles`

**Szerver logika (reason szerint):**
- `meghalt` → temetes INSERT + szemely.meghalt = true
- `elkoltozott` → elkoltozott INSERT + szemely.elkoltozott = true
- `kitert` → kitert INSERT + szemely.member_status = 'kitért'
- `torles` → pénzügyi ellenőrzés → ha van: elrejtés, ha nincs: csatolt adatok törlés + DELETE (RLS fallback: elrejtés)

### 3.2 — Családok CRUD

#### `saveFamily(data)` Server Action

**Validáció:**

| Mező | Szabály |
|------|---------|
| id_ferfi | number vagy null (legalább egy fél kötelező) |
| id_no | number vagy null (legalább egy fél kötelező) |
| gyerekIds | number[] (opcionális) |
| c_utcaid | number |
| c_szam | string |
| id_csoport | number vagy null (körzet) |

**Szerver logika:**
1. Validáció: legalább férj VAGY feleség kötelező
2. Család INSERT/UPDATE
3. Gyerekek: meglévő kapcsolatok DELETE + új INSERT
4. revalidatePath

### 3.3 — Presbiterek + Körzetek

#### Presbiter mentés logika

1. Ha szerkesztés → korábbi presbiteri bejegyzések DELETE ennél a személynél
2. Új presbiter INSERT (személy + tisztség + körzet)

#### Körzet törlés logika

1. Presbiter bejegyzések DELETE (id_csoport)
2. Családok UPDATE: id_csoport = null (leválasztás)
3. Körzet DELETE (csoport tábla)

#### Család-körzet hozzárendelés

- `assignFamilyToDistrict(familyId, districtId)` → csalad UPDATE: id_csoport = districtId
- `removeFamilyFromDistrict(familyId)` → csalad UPDATE: id_csoport = null
- `autoAssignFamilies(ids, districtId)` → tömeges UPDATE

### 3.4 — Választók névjegyzéke

**Összeállítás logikája:**
1. Összes 18+ éves, élő, aktív tag lekérdezése
2. Konfirmáltak megjelölése
3. Járulékfizetők meghatározása (101.01 kód, legalább előző évre)
4. Családon keresztüli körzet meghatározása

**Szűrők (kliens-oldali):** keresés, körzet, nem, járulékfizetés, járulék éve, rendezés

### 3.5 — Kliens-oldali számítások

**Fizetési státusz:**
```
calculatePaymentStatus(member, paidPersons, paidFamilies, exemptPersons, exemptFamilies)
→ { label, variant, icon }
```

**Név-formázás:**
```
formatNameWithPrefix(member, spouse?)
→ prefixes (elv., özv., namepattern) + családnév + keresztnév
```

**Nem-heurisztika:**
```
guessGender(firstName)
→ 'ferfi' | 'no'
(magyar kivétel-listával: Béla, Attila, Géza, stb.)
```

---

## 4. Prioritás — lépések sorrendje

### SPRINT 1: Alapok + személyek lista (a leggyorsabb vizuális eredmény)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **1.1** | Konstansok + segédfüggvények | `lib/constants/members.ts`, `lib/utils/member-helpers.ts`, `lib/validations/members.ts` |
| **1.2** | Server Actions: getMembers | `tagnyilvantartas/actions.ts` |
| **1.3** | Fő page + fül-váltó | `tagnyilvantartas/page.tsx`, `members/member-tabs.tsx` |
| **1.4** | Személyek fül: lista + szűrés + rendezés + keresés | `members/persons-tab.tsx`, `members/member-table.tsx`, `members/member-search.tsx`, `members/member-status-badge.tsx` |

**Eredmény:** A tagok listája megjelenik, szűrhető, kereshető, rendezhető. ~1 nap.

### SPRINT 2: Tag kartoték + CRUD

| Lépés | Mit | Fájl |
|-------|-----|------|
| **2.1** | Server Actions: getMemberDetails, saveMember | `tagnyilvantartas/actions.ts` |
| **2.2** | Tag kartoték modal | `modals/member-details-dialog.tsx` |
| **2.3** | Tag felvétel/szerkesztés form (3 fül) | `modals/member-form-dialog.tsx` |
| **2.4** | Szülő keresés + gyorsrögzítés | `members/parent-search.tsx`, `modals/parent-quick-add-dialog.tsx` |
| **2.5** | Tag kivezetés modal (4 mód) | `modals/member-remove-dialog.tsx` |
| **2.6** | Server Actions: removeMember + getOrCreateLocality/Street | `tagnyilvantartas/actions.ts` |

**Eredmény:** Teljes személyek CRUD működik (kartoték, felvétel, szerkesztés, kivezetés). ~1.5 nap.

### SPRINT 3: Családok

| Lépés | Mit | Fájl |
|-------|-----|------|
| **3.1** | Server Actions: getFamilies, saveFamily, deleteFamily, getFamilyDetails | `tagnyilvantartas/family-actions.ts` |
| **3.2** | Családok fül: lista + keresés | `members/families-tab.tsx`, `members/family-card.tsx` |
| **3.3** | Család adatlap modal | `modals/family-details-dialog.tsx` |
| **3.4** | Család létrehozás/szerkesztés modal | `modals/family-form-dialog.tsx` |

**Eredmény:** Családok teljes CRUD működik. ~1 nap.

### SPRINT 4: Áttekintés (demográfia)

| Lépés | Mit | Fájl |
|-------|-----|------|
| **4.1** | Áttekintés fül: nemek, korcsoportok, átlagéletkor | `members/overview-tab.tsx`, `members/age-groups-chart.tsx` |
| **4.2** | Előrejelzés kártyák (5/10 év) | `members/forecast-cards.tsx` |
| **4.3** | Rekordok, települések, státuszok, top nevek | (az overview-tab.tsx részeként) |

**Eredmény:** Demográfiai vezérlőpult teljesen működik. ~0.5 nap.

### SPRINT 5: Presbiterek + körzetek

| Lépés | Mit | Fájl |
|-------|-----|------|
| **5.1** | Server Actions: presbiterek + körzetek CRUD + hozzárendelés | `tagnyilvantartas/presbyter-actions.ts` |
| **5.2** | Presbiterek fül + form | `members/presbyters-tab.tsx`, `modals/presbyter-form-dialog.tsx` |
| **5.3** | Körzetek fül + form + család hozzárendelés | `members/districts-tab.tsx`, `modals/district-form-dialog.tsx`, `modals/district-families-dialog.tsx`, `members/district-families.tsx` |
| **5.4** | Körzet nélküli családok modal | `modals/unassigned-families-dialog.tsx` |
| **5.5** | Körzetek nyomtatás | (HTML generálás új ablakba) |

**Eredmény:** Presbiterek és körzetek teljes kezelés + nyomtatás. ~1 nap.

### SPRINT 6: Választók + God Mode + csiszolás

| Lépés | Mit | Fájl |
|-------|-----|------|
| **6.1** | Server Actions: választók lekérdezés, zárolás | `tagnyilvantartas/voter-actions.ts` |
| **6.2** | Választók fül: lista + szűrők + nyomtatás | `members/voters-tab.tsx`, `members/voter-list.tsx` |
| **6.3** | Nem-ellenőrzés (God Mode) | `modals/gender-check-dialog.tsx`, `tagnyilvantartas/gender-actions.ts` |
| **6.4** | Responsive finomhangolás + build | Minden komponens |

**Eredmény:** Választók + God Mode + polished UI. ~1 nap.

### Összesített ütemezés

```
Sprint 1 ■■░░░░░░░░░░  (1 nap)    Konstansok + személyek lista
Sprint 2 ░░■■■░░░░░░░  (1.5 nap)  Kartoték + CRUD + szülő + kivezetés
Sprint 3 ░░░░░■■░░░░░  (1 nap)    Családok
Sprint 4 ░░░░░░░■░░░░  (0.5 nap)  Áttekintés (demográfia)
Sprint 5 ░░░░░░░░■■░░  (1 nap)    Presbiterek + körzetek
Sprint 6 ░░░░░░░░░░■■  (1 nap)    Választók + God Mode + csiszolás
                                    ─────────────────────────────
                                    Összesen: ~6 nap
```

---

## 5. Függőségek

### Telepítendő npm csomag

Nincs új csomag szükséges. A meglévők elegendőek:
- shadcn/ui (tabs, dialog, input, select, badge, card, button, separator)
- react-hook-form + zod (form validáció)
- sonner (toast üzenetek)
- recharts (áttekintés diagramokhoz, ha szükséges — de a progress bar-ok natív Tailwind CSS)

### Családfa vizualizáció

A FamilyTree.js egy **kereskedelmi licencű** könyvtár. Alternatívák a Next.js migrációhoz:

| Opció | Előny | Hátrány |
|-------|-------|---------|
| **FamilyTree.js (megtartás)** | 1:1 migráció, ismert | Licenc díj, nem React-natív |
| **react-family-tree** | Open source, React-natív | Kevésbé szép, kevesebb funkció |
| **D3.js egyedi** | Teljes kontroll | Sok fejlesztési idő |
| **Egyszerű lista nézet** | Nincs extra könyvtár | Nincs vizuális fa |

**Javaslat:** Fázis 3-ban egyszerű szöveges családi kapcsolat lista (szülők, házastárs, gyerekek). A vizuális családfa egy későbbi iterációban implementálható. Ez nem blokkoló funkció.

### Fájl-függőségi fa

```
lib/constants/members.ts              ← NINCS FÜGGŐSÉGE
lib/utils/member-helpers.ts           ← függ: members.ts
lib/validations/members.ts            ← függ: members.ts
    │
    ▼
app/(dashboard)/tagnyilvantartas/
├── page.tsx                          ← Server: adatlekérdezés orchestrátor
├── actions.ts                        ← Server Actions: személy CRUD + cím
├── family-actions.ts                 ← Server Actions: család CRUD
├── presbyter-actions.ts              ← Server Actions: presbiter + körzet
├── voter-actions.ts                  ← Server Actions: választók
├── gender-actions.ts                 ← Server Actions: nem-ellenőrzés
    │
    ▼
components/members/
├── member-tabs.tsx                   ← Fül-váltó (6 fül)
├── overview-tab.tsx                  ← Áttekintés (demográfia)
│   ├── age-groups-chart.tsx
│   └── forecast-cards.tsx
├── persons-tab.tsx                   ← Személyek
│   ├── member-table.tsx
│   ├── member-search.tsx
│   ├── member-status-badge.tsx
│   └── parent-search.tsx
├── families-tab.tsx                  ← Családok
│   └── family-card.tsx
├── presbyters-tab.tsx                ← Presbiterek
├── districts-tab.tsx                 ← Körzetek
│   └── district-families.tsx
├── voters-tab.tsx                    ← Választók
│   └── voter-list.tsx
    │
    ▼
components/modals/
├── member-details-dialog.tsx         ← Kartoték
├── member-form-dialog.tsx            ← Tag felvétel/szerkesztés
├── member-remove-dialog.tsx          ← Tag kivezetés
├── parent-quick-add-dialog.tsx       ← Szülő gyorsrögzítés
├── family-details-dialog.tsx         ← Család adatlap
├── family-form-dialog.tsx            ← Család CRUD
├── presbyter-form-dialog.tsx         ← Presbiter CRUD
├── district-form-dialog.tsx          ← Körzet CRUD
├── district-families-dialog.tsx      ← Körzet–család hozzárendelés
├── unassigned-families-dialog.tsx    ← Körzet nélküli családok
├── gender-check-dialog.tsx           ← Nem-ellenőrzés (God Mode)
└── voters-print-dialog.tsx           ← Választók nyomtatás
```

**Összesen: ~30 új fájl**
- 1 Server Page
- 5 Server Action fájl
- 9 Client Component (fül tartalmak + segéd)
- 12 Modal Component
- 3 Utility/konstans fájl

### Modul-függőségek

| Fázis 3 funkció | Függ-e más fázistól? |
|-----------------|---------------------|
| Személyek CRUD | NEM — saját táblák |
| Családok CRUD | NEM — saját táblák |
| Fizetési státusz badge | OLVAS a `befizetes` táblából (Fázis 4 tábla, de CSAK SELECT) |
| Presbiterek + körzetek | NEM |
| Választók (járulék) | OLVAS a `befizetes` + `befizetescel` + `szamadasicel` táblákból |
| Áttekintés | NEM |
| Nem-ellenőrzés | NEM |

A Fázis 3 **nagyrészt független** más fázisoktól. A `befizetes` tábla olvasása a Fázis 4 (Pénzügyi modul) előtt is működik, mert a tábla már létezik és a régi rendszer tölti.

### Meglévő Fázis 1–2 elemekre való támaszkodás

| Elem | Hogyan használja |
|------|-----------------|
| `(dashboard)/layout.tsx` | Auth + sidebar + header — a page.tsx nem foglalkozik vele |
| `lib/supabase/server.ts` | `createClient()` a lekérdezésekhez |
| `lib/utils/date.ts` | `ageFromDate()`, `formatHuDate()` újrafelhasználás |
| `lib/constants/dashboard.ts` | Nem függ tőle — saját konstansok |

---

## Elfogadási kritériumok

| # | Kritérium |
|---|-----------|
| 1 | Személyek listája betöltődik a szűrt nézettel (aktív tagok) |
| 2 | Keresés név + cím alapján működik (szóköz-darabolás) |
| 3 | 6 szűrő: aktív, elhunyt, elköltözött, kitért, más vallású, mind |
| 4 | 5 oszlop rendezés (név, kor, cím, foglalkozás, ID) |
| 5 | Fizetési státusz badge helyes (Rendezve/Felmentett/Hátralékos/Elhunyt/Elköltözött/Kitért) |
| 6 | Tag kartoték: személyi + anyakönyvi + pénzügyi adatok + családi kapcsolatok |
| 7 | Tag felvétel: 3 belépési ok, 3 fül, automatikus család létrehozás |
| 8 | Szülő keresés: élő keresés, kor + cím, gyorsrögzítés |
| 9 | Tag kivezetés: 4 mód (elhunyt/elköltözött/kitért/törlés) helyes viselkedéssel |
| 10 | Családok: lista, CRUD, gyerekek hozzárendelés |
| 11 | Áttekintés: 11 korcsoport, előrejelzés, rekordok, top nevek |
| 12 | Presbiterek + körzetek: CRUD, család hozzárendelés, nyomtatás |
| 13 | Választók: névjegyzék, járulékszűrő, zárolás |
| 14 | Build 0 hibával lefordul |
