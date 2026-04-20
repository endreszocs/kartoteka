# KARTOTEKA — Pénzügyi modul: WC-0 előkészítés lezárása és végleges döntések

**Dátum**: 2026-04-16
**Állapot**: WC-0 LEZÁRVA, indulhat WC-1
**Hivatkozás**: `KARTOTEKA-penzugy-feladatlista-2026-04-16.md`, `KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md`

---

## Vezetői összefoglaló

A felhasználó **2026-04-16-án** megválaszolta mind a 11 nyitott kérdést. A munkacsomagok **végleges döntésekkel** startolhatnak. 3 apró technikai kérdés maradt, amelyeket a WC-1 megkezdése előtt még tisztázni kell.

---

## Felhasználói döntések (véglegesítve 2026-04-16)

| # | Kérdés | Döntés | Hatás |
|---|---|---|---|
| 1 | Decont: előleg-elszámolás és utólagos bekönyvelés szétválasztás vagy összeolvasztás? | **Összeolvasztás** | A `decont-tab.tsx` átalakul, egyetlen komponensen belül két üzemmód (mód-kapcsolóval) |
| 2 | Chitanță tárolás | **Meglévő struktúra bővítése** | Az `oblio_szamlak` tábla `tipus text` mezőt kap: `'e_factura'` vagy `'chitanta_papir'`. Nincs új tábla. |
| 3 | TVA kategória-seed ki review-olja | **Könyvelő** | A seed alapértelmezett javaslat, **könyvelői review modal** épül a rendszerbe |
| 4 | Oblio screenshotok | **Én készítem demó fiókból** | Dummy gyülekezetet regisztrálok Oblio-ban fejlesztés közben |
| 5 | Teszt-Oblio fiók fizetése | **Ingyenes szint** (max 3 dok/hó) | A tesztelésre elegendő, nem kell licenc |
| 6 | Auto-számlázás cron | **pg_cron** | Supabase-natív, nincs külső függés |
| 7 | `e_factura_kotelezett` flag kezelője | **Lelkesz** (admin csak a lelkész engedélyével) | Új jóváhagyási workflow az admin → lelkész irányba |
| 8 | WC sorrend | **WC-1 → WC-2 → WC-3 → WC-5 → WC-4** | TVA előbb, útmutató utoljára (a többi funkció dokumentálását végzi) |

### Új, felhasználótól érkezett követelmény (5. pontnál)

> **„Lehetséges, hogy a számláknál legyen ellenőrizve, ha már megjelent az Oblio-ban és onnan le lehessen tölteni?"**

Ez **új funkcionális követelmény** az Oblio integrációra:

1. **Állapot-ellenőrzés**: a KARTOTEKA időszakosan (pg_cron vagy on-open) lekérdezi az Oblio-tól, hogy a lokálisan tárolt számla státusza mi (pending/accepted/rejected)
2. **PDF letöltés**: a kiállított számla PDF-je **letölthető** legyen közvetlenül a KARTOTEKA UI-ból — kattintásra
3. **PDF URL tárolása**: az Oblio válaszból érkező PDF URL-t (amely általában 1 évig él) elmentjük az `oblio_szamlak.pdf_url` mezőbe (**már benne van a tervben**, 2.1 alfeladat)
4. **Re-sync gomb**: manuális frissítés, hogy a lelkész egy kattintással ellenőrizhesse az aktuális Oblio állapotot

---

## Fennmaradó 3 apró kérdés (mielőtt a WC-1 indul)

### Q1 — Admin-lelkész jóváhagyási workflow az `e_factura_kotelezett` flagre

A felhasználó döntése: a flag-et a **lelkész** állítja, az **admin csak a lelkész engedélyével**.

**Javaslat két megoldás közül**:

**(a) Egyszerű:** az admin nem állíthatja a flag-et közvetlenül, csak a lelkész. Ha egy admin úgy látja, hogy szükséges (pl. könyvelői javaslat alapján), akkor **saját cselekvése** egy notification/üzenet a lelkésznek: „Kérlek, állítsd be az e-Factura kötelezettséget, mert [indok]."

**(b) Bonyolultabb (új tábla):** `admin_flag_requests` vagy hasonló tábla, ahol az admin kéri a flag bekapcsolását, és a lelkész egy klikkel jóváhagyja a rendszerben. A meglévő `admin_access_requests` tábla mintájára.

### Q2 — Oblio PDF tárolása: csak URL vagy letöltve Supabase Storage-ba is?

Az Oblio válasz-PDF URL-je általában **1 évig él**. Kérdés: a KARTOTEKA a PDF-et **letölti** és lokálisan (Supabase Storage) tárolja, vagy csak a linket **átirányítja**?

**Javaslat**:
- **Linket átirányít** (egyszerűbb, nincs duplikált tárhely)
- **Figyelő**: ha valaki 1 évnél régebbi számlát nyit meg → a rendszer rákérdez az Oblio-ra újra a link-re
- **Esetleges kiegészítés**: éves archivum letöltése zip-ben, a régi számlák hosszú távú megőrzésére (ez később, nem most)

### Q3 — Könyvelői review modal hogyan működjön?

A 3. döntés szerint a TVA flag-eket a könyvelő review-olja. A rendszerben viszont **nincs `konyvelo` szerepkör**. Három út:

**(a) Email-alapú**: a rendszer kigenerál egy listát a szamadasicel-kategóriákról az alapértelmezett flag-ekkel, a lelkész letölti PDF-ben, elküldi a könyvelőnek, aki aláírva/megjegyzésekkel visszaküldi. A lelkész manuálisan átvezeti.

**(b) Vendég-hozzáférés**: a könyvelő kap egy egyszerhasználatos linket (token-alapú, pl. 7 napig él), amivel a rendszerben közvetlenül jóváhagyhatja a listát. Nem kap teljes hozzáférést.

**(c) Új szerepkör**: `konyvelo` vagy `financial_reviewer` szerepkör kialakítása.

**Javaslat**: **(a) egyszerű PDF email** — minimális fejlesztés, a könyvelő autonóm, nem kell neki rendszer-hozzáférés. Később, ha sok gyülekezet kéri, lehet fejleszteni a (b) irányba.

---

## Frissített WC-1 startolási feltételek

Mielőtt a WC-1 első alfeladata (DB migráció) indul:

- [ ] Q1, Q2, Q3 megválaszolva
- [ ] Demó Oblio fiók nyitva (én csinálom WC-2 kezdetén)
- [ ] Supabase pg_cron kiterjesztés engedélyezve (WC-2 előtt ellenőrzendő)
- [ ] Git branch: `feature/penzugy-tva-oblio-amortizacio-utmutato-2026-04`

---

## Frissített adatmodell — összesítő

A 6 új oszlop / 2 új tábla, amit a WC-1 és WC-2 migrációk hoznak:

### `szamadasicel` (meglévő, bővítés)
- `tva_plafonba_szamit boolean DEFAULT false`
- `tva_mentesseg_hivatkozas text`

### `berleti_szerzodes` (meglévő, bővítés)
- `jogi_tipus text DEFAULT 'locatiune' CHECK (...)`
- `oblio_auto_szamlaz boolean DEFAULT false`
- `oblio_klienesseg_id text`
- `oblio_termek_kod text`

### `congregations` (meglévő, bővítés)
- `tva_alany boolean DEFAULT false`
- `tva_alany_tol date`
- `tva_kod text`
- `e_factura_kotelezett boolean DEFAULT false`
- `e_factura_kotelezett_tol date`
- `e_factura_kotelezettseg_indoka text`

### `leltar_tetelek` (meglévő, bővítés — WC-3)
- `alapeszkoz_kuszob_figyelmen_kivul boolean DEFAULT false`

### `oblio_fiokok` (új)
- lásd `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md`

### `oblio_szamlak` (új)
- lásd terv, **kiegészítve**: `tipus text DEFAULT 'e_factura' CHECK (tipus IN ('e_factura','chitanta_papir'))`
- `chitanta_papir` esetén az Oblio mezők (uuid, pdf_url stb.) üresek/nullok, csak a belső sorszám + PDF (gyülekezet maga generálta) létezik

---

## Dokumentációs hivatkozási térkép

```
KARTOTEKA-penzugy-fejlesztesi-roadmap-2026-04-16.md (master)
├── KARTOTEKA-penzugy-hasznalati-utmutato-2026-04-16.md (WC-4)
├── KARTOTEKA-amortizacio-audit-2026-04-16.md (WC-3)
├── KARTOTEKA-tva-figyelo-terv-2026-04-16.md (WC-1)
├── KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md (WC-2)
├── KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md (minden WC-t érint)
├── KARTOTEKA-penzugy-feladatlista-2026-04-16.md (lépésre bontva)
└── KARTOTEKA-penzugy-wc0-lezaras-2026-04-16.md (EZ A FÁJL)
```

---

## A WC-1 első 5 lépése (részletesen, hogy tiszta legyen)

Miután Q1, Q2, Q3 megválaszolódik, a WC-1 így indul:

1. **Migráció létrehozása** — `migration-docs/2026-04-16-tva-figyelo.sql`
   - `szamadasicel` + `berleti_szerzodes` + `congregations` bővítés
   - Ellenőrzés: `tsc`, `list_tables` (Supabase MCP)

2. **Seed SQL készítése** — `migration-docs/2026-04-16-tva-figyelo-seed.sql`
   - Lekérdezem a meglévő `szamadasicel` sorokat
   - `UPDATE` a `104.%` kódokra `tva_plafonba_szamit = true`
   - `tva_mentesseg_hivatkozas` szöveges kitöltés
   - Ellenőrzés: `execute_sql` eredménye

3. **Konstansok fájl** — `lib/finance/tva-plafon-constants.ts`
   - `TVA_PLAFON_RON = 395_000`
   - Szintek, jogszabályi hivatkozások

4. **Számítási logika** — `lib/finance/tva-plafon.ts`
   - Típusok, fő függvény, unit tesztek

5. **Server action** — `app/(dashboard)/penzugy/tva-actions.ts`
   - `calculateTvaPlafonForYear()`
   - `getTvaStatus(congregationId)`

**Ellenőrzőpont**: itt megállok és bemutatom a működést, mielőtt az UI-ra lépnénk.
