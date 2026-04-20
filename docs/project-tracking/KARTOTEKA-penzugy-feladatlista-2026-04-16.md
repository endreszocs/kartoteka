# KARTOTEKA — Pénzügyi modul fejlesztés: részletes feladatlista

**Dátum**: 2026-04-16
**Státusz**: élő feladatlista, minden lépés után ellenőrzés
**Hatálya**: a 4 tervdokumentum (Roadmap, Útmutató, Amortizáció, TVA, Oblio) teljes implementációja + egyházmegyei dashboard-bővítés
**Használat**: minden lépésnél a **DoD** (Definition of Done) ellenőrzendő, mielőtt a következőre lépnénk. Kérdéses pontokon meg kell állni és tisztázni — NE találgass.

---

## Frissített alapelvek (felhasználói visszajelzés alapján — 2026-04-16)

1. **Amortizáció 2500 RON**: ha kis értékű leltári tárgy **átlépi** a 2500 lejt, **ALAPESZKÖZKÉNT kell leltárba venni**. Ezt jeleznünk kell a lelkésznek.
2. **Számla több tételre bontása**: ha egy számlán **több tétel** van, a rendszer engedje, hogy a lelkész a számlát **szétbontsa tételekre** a leltárba vételkor.
3. **Leltárba vétel dátuma** = amortizáció számítási alapja. NEM vezetünk be külön „üzembe helyezés" mezőt.
4. **Katalógus bővítés**: IGEN, hozzáadjuk a javasolt 8 új tételt (orgona, harang, hangtechnika, stb.).
5. **Szamadasicel szerkesztő**: NEM építünk új admin felületet erre. Ami van, az marad — a TVA flag-eket **seed-elten** rögzítjük.
6. **TVA-alany gyülekezet**: jelenleg nincs a rendszerben — az alany-alatti figyelőre koncentrálunk. A `tva_alany = true` branch-t **nem** implementáljuk most (csak séma-felkészítés).
7. **Oblio auto-számlázás**: **szerződés-szintű beállítás** (`oblio_auto_szamlaz`), aszinkron futás a szerződés `fizetesi_ciklus`-a alapján (havi, negyedéves, féléves, éves).
8. **Screenshotos Oblio útmutató**: IGEN, részletes lelkészi útmutató a fiók regisztrációhoz és az API secret beszerzéshez.
9. **Egyházmegyei dashboard**: a gyülekezet kártyáján **láthatók legyenek a bérleti szerződések** (típus, tárgy, időszak, ár, fizetési ciklus).
10. **Contract de arendare magánszemélynél — TISZTÁZVA**: lásd `KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md`. Kivonatban:
    - **Arendare/locațiune/concesiune MENTES** az e-Factura alól (kivéve új építésű épület és építési telek)
    - B2C (magánszeménynek) e-Factura **2025.01.01**-től, szankciók 2025.07.01-től
    - ONG-k **2025.07.01** óta kötelesek, ha gazdasági tevékenység van
    - **Az Oblio integráció OPCIÓ, nem kötelező** — chitanță generátor alternatíva szükséges

---

## Munkacsomag-térkép

```
┌─────────────────────────────────────────────────────────────┐
│  WC-0: Előkészítés (LEZÁRVA)                                 │
│  WC-7: Új szerepkörök (konyvelo + egyhazmegyei_szamvevo)    │
│  WC-1: TVA figyelő                                           │
│  WC-2: Oblio / e-Factura integráció                          │
│  WC-8: Lokális Oblio PDF szinkronizáció                     │
│  WC-3: Amortizáció finomhangolás + számla-tételre-bontás    │
│  WC-4: Használati útmutató (13. fül)                         │
│  WC-5: Egyházmegyei dashboard bérleti szerződés megjelenítés│
│  WC-6: Dokumentáció, tesztelés, zárás                       │
└─────────────────────────────────────────────────────────────┘

Sorrend: WC-0 → WC-7 → WC-1 → WC-2 → WC-8 → WC-3 → WC-5 → WC-4 → WC-6
```

**A WC-7 és WC-8 részletes terve**: `KARTOTEKA-penzugy-uj-szerepkorok-es-lokalis-tarolas-2026-04-16.md`

---

## WC-0 — Előkészítés (közös minden munkacsomagra)

### 0.1 Jogszabályi és integrációs alapismeret tisztázás
- [ ] `contract de arendare` + magánszemély e-Factura kutatás eredményének beépítése a tervbe (`KARTOTEKA-tva-figyelo-terv-2026-04-16.md` + `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md`)
- [ ] Felhasználóval egyeztetés: a Decont komponens jelenlegi **előleg-elszámolás** funkcionalitását **kibővítsük** utólagos bekönyvelésre, vagy maradjon a mostani szerepe, és a `is_potlas` flag + sima bevétel/kiadás modal legyen az „utólagos bekönyvelés" útja?
- [ ] Döntés: a TVA kategória-zászlók seed értékeit ki review-olja szakmailag? (könyvelő, vagy a felhasználó önállóan hagyja jóvá)

**DoD**: minden függő jogi-integrációs kérdés tisztázva, nincs nyitott találgatás.

### 0.2 Biztonságos titok-tárolás megoldásának kiválasztása
- [ ] Kiválasztani: `pgcrypto` (PostgreSQL-szintű) vagy Supabase Vault (Supabase-natív) az Oblio API secret-hez
- [ ] PoC: egy dummy secret titkosított tárolása és olvasása server action-ből

**DoD**: egy egyszerű `encrypt`/`decrypt` wrapper készen áll a `lib/supabase/secret-vault.ts` fájlban, egységtesztelve.

### 0.3 Branch és rollout stratégia
- [ ] Kiválasztani: feature flag (`system_settings.tva_figyelo_aktiv`) vagy direkt rollout
- [ ] Megegyezni: egy gyülekezeten tesztelünk-e először, vagy egyből mindenkinek

**DoD**: írott döntés a projekt logban.

---

## WC-1 — TVA figyelő

### 1.1 DB séma bővítés
- [ ] Migráció fájl: `migration-docs/2026-04-16-tva-figyelo.sql`
  - [ ] `szamadasicel`: `tva_plafonba_szamit boolean DEFAULT false`
  - [ ] `szamadasicel`: `tva_mentesseg_hivatkozas text`
  - [ ] `berleti_szerzodes`: `jogi_tipus text DEFAULT 'locatiune' CHECK (jogi_tipus IN ('locatiune','arendare','comodat','concesiune'))`
  - [ ] `congregations`: `tva_alany boolean DEFAULT false`
  - [ ] `congregations`: `tva_alany_tol date`
  - [ ] `congregations`: `tva_kod text`
  - [ ] **ÚJ (jogi pontosítás)**: `congregations.e_factura_kotelezett boolean DEFAULT false`
  - [ ] **ÚJ**: `congregations.e_factura_kotelezett_tol date`
  - [ ] **ÚJ**: `congregations.e_factura_kotelezettseg_indoka text`
- [ ] Verziózás: revision mező minden új oszlop mellé, ha szükséges (már van a `szamadasicel`-nél? ellenőrzendő)
- [ ] Supabase MCP apply_migration
- [ ] **Ellenőrzés**: `list_tables` → oszlopok láthatók; `get_advisors` → nincs új security warning

**DoD**: a migráció lefutott, oszlopok léteznek a supabase-ben, típus-check constraint érvényes.

### 1.2 Seed-adat beállítása a meglévő `szamadasicel` sorokon
- [ ] Lekérdezem a jelenlegi `szamadasicel` sorokat: melyik kód aktív
- [ ] SQL script: `UPDATE public.szamadasicel SET tva_plafonba_szamit = true WHERE id LIKE '104.%'`
- [ ] Alkódok egyedi review-ja:
  - [ ] `104.05` bérleti díj → `true`
  - [ ] `104.10` vagy hasonló terembérlet → `true`
  - [ ] `104.99` egyéb → **kérdéses**, dönteni kell
  - [ ] Temetői díj (ha `105.xx` vagy `104.xx`) → alapértelmezés `true`, megjegyzéssel
- [ ] `tva_mentesseg_hivatkozas` mezők kitöltése:
  - `101-103`, `105` → `"art. 292 alin. (1) lit. k) Codul fiscal - cult religios, activitate scutită"`
  - `104.05` → `"art. 292 alin. (2) lit. e) Codul fiscal - închiriere de bunuri imobile, se ia în calculul plafonului"`

**DoD**: az összes `szamadasicel` soron a flag és hivatkozás mezők kitöltve; lekérdezés csak a helyes sorokat adja vissza.

### 1.3 Számítási logika
- [ ] Új fájl: `lib/finance/tva-plafon.ts`
  - [ ] `TVA_PLAFON_RON = 395_000` konstans (forrás-kommenttel: OG 22/2025)
  - [ ] `TVA_FIGYELMEZTETES_SARGA/NARANCS/PIROS` konstansok
  - [ ] `calculateTvaPlafon()` függvény
  - [ ] `getEconomicCategoryCodes()` helper (lekéri a `true`-val rendelkező `szamadasicel`-eket)
- [ ] Unit teszt: mock Supabase-szel 5-6 szcenárió (lásd `KARTOTEKA-tva-figyelo-terv-2026-04-16.md` / Tesztelési szempontok)

**DoD**: minden szcenárió zöld, tsc + eslint tiszta.

### 1.4 Server actions
- [ ] Új fájl: `app/(dashboard)/penzugy/tva-actions.ts`
  - [ ] `calculateTvaPlafonForYear(year)`
  - [ ] `getTvaStatus(congregationId)`
  - [ ] `setTvaStatus(...)` — **admin** jogosultság
  - [ ] (kategória-szerkesztő action-t NEM csinálunk, a felhasználó döntése szerint)
- [ ] Jogosultság-ellenőrzés minden actionnél

**DoD**: minden server action authorizált, `auth-helpers.ts` szabvány szerint.

### 1.5 UI — Dashboard widget
- [ ] `components/finance/dashboard-tab.tsx` bővítés: új `TvaPlafonWidget` komponens import
- [ ] Új komponens: `components/finance/tva-plafon-widget.tsx`
  - [ ] 4 színű szint szerint (nyugodt / sárga / narancs / piros)
  - [ ] Progressz-bar a %-ra
  - [ ] Kategória-lista bontás (kik számítottak bele)
  - [ ] Link „Részletek" → modal
- [ ] Új komponens: `components/finance/tva-plafon-details-modal.tsx`
  - [ ] Havi bontás
  - [ ] Szerződés bontás
  - [ ] Útmutató-link
- [ ] **Reszponzivitás ellenőrzés**: mobile / tablet / desktop (feedback_responsive.md memória szerint kötelező)

**DoD**: a widget megjelenik a dashboardon, minden szint helyesen színeződik, modalok jól jelennek meg 3 képernyőméreten.

### 1.6 Bérleti szerződés form bővítés — `jogi_tipus`
- [ ] `components/finance/rental-tab.tsx` → keressem meg a szerződés-szerkesztő formot, és adjam hozzá a mezőt
- [ ] 4 opció select: `locatiune`, `arendare`, `comodat`, `concesiune`
- [ ] Ha `comodat`, az `osszeg` mező automatikusan 0, disabled, magyarázó szöveggel
- [ ] Validáció: ha `comodat` és `osszeg > 0` → hiba
- [ ] Tooltip: a 4 típus rövid leírása

**DoD**: új szerződés létrehozva mind a 4 típussal, validáció működik.

### 1.7 Figyelmeztetés átlépéskor
- [ ] Értesítés-logika: ha a kumulált forgalom >= `TVA_PLAFON_RON`, automatikusan új sor az `ertesitesek` táblába a lelkésznek és esperesnek
- [ ] Dedup: egy évben csak egyszer küldjünk ki figyelmeztetést (ne jöjjön minden naplózásnál új üzenet)
- [ ] Toast a bejelentkezéskor

**DoD**: teszt-szcenárió: 396 000 RON forgalom → értesítés és toast megjelenik.

### 1.8 Ellenőrzés és tesztelés
- [ ] TypeScript + ESLint tiszta
- [ ] Supabase advisors (security, performance) → új figyelmeztetés = javítás
- [ ] Manuális UI teszt 3 képernyőméreten
- [ ] Production-like adattal (min. 1 gyülekezetben) átfutás

**DoD**: a TVA figyelő teljes funkcionálisan fut, dokumentálva.

---

## WC-2 — Oblio / e-Factura integráció

### 2.1 DB séma bővítés
- [ ] Migráció fájl: `migration-docs/2026-04-16-oblio-integracio.sql`
  - [ ] `oblio_fiokok` új tábla (lásd terv)
  - [ ] `oblio_szamlak` új tábla (lásd terv)
  - [ ] `berleti_szerzodes` bővítés: `oblio_auto_szamlaz`, `oblio_klienesseg_id`, `oblio_termek_kod`
  - [ ] RLS policy az `oblio_fiokok`-ra (csak saját gyülekezet)
  - [ ] RLS policy az `oblio_szamlak`-ra (csak saját gyülekezet)
  - [ ] Indexek: congregation, berleti, status
- [ ] **Ellenőrzés**: `get_advisors` → nincs új warning

**DoD**: táblák léteznek, RLS aktív, teszt-ellenőrzés zöld.

### 2.2 Secret vault integráció
- [ ] Az `oblio_fiokok.api_secret_encrypted` tárolása a 0.2-ben kiválasztott titkosítással
- [ ] Server-side encrypt a mentésnél
- [ ] Server-side decrypt csak az Oblio kliensnek
- [ ] **Soha** ne kerüljön kliens oldalra az API secret

**DoD**: egy teszt-fiók beállítása és secret-olvasása sikeres, a kliens-válasz csak az email + CIF + sorozatot látja.

### 2.3 Oblio API kliens réteg
- [ ] Új könyvtár: `lib/finance/oblio/`
  - [ ] `oblio-types.ts` — API DTO típusok
  - [ ] `oblio-errors.ts` — egységes hibaosztály
  - [ ] `oblio-auth.ts` — token-cache, refresh, lejárat 5 perc előtt
  - [ ] `oblio-client.ts` — REST wrapper (POST invoice, GET invoice, PUT collect, DELETE storno, GET companies, GET clients)
  - [ ] `oblio-invoice-builder.ts` — KARTOTEKA → Oblio DTO
  - [ ] `oblio-mock.ts` — teszthez használt mock (ne hívjon éles API-t)
- [ ] Unit tesztek mock-kal

**DoD**: mock tesztek zöldek, TS tiszta, doksi-kommentek minden publikus függvény előtt.

### 2.4 Server actions
- [ ] Új fájl: `app/(dashboard)/penzugy/oblio-actions.ts`
  - [ ] `issueInvoice(berletiSzerzodesId, options)`
  - [ ] `markInvoicePaid(oblioSzamlaId, befizetesId)`
  - [ ] `syncInvoiceStatus(oblioSzamlaId)`
  - [ ] `stornoInvoice(oblioSzamlaId, reason)`
  - [ ] `syncAllPendingStatuses(congregationId)` (polling helper)
- [ ] Új fájl: `app/(dashboard)/penzugy/oblio-config-actions.ts`
  - [ ] `getOblioConfig(congregationId)`
  - [ ] `saveOblioConfig(payload)`
  - [ ] `testOblioConnection(payload)` — meghívja `/api/nomenclature/companies`
  - [ ] `deleteOblioConfig(congregationId)`
- [ ] Jogosultság: `lelkesz` vagy `admin` szerepkör szükséges

**DoD**: minden action authorizált és hibakezelt, audit log a secret-érintő hívásoknál.

### 2.5 UI — Oblio fiók beállítás
- [ ] Új oldal/szekció: a Gyülekezeti Beállítások menü bővítése „Integrációk" szekcióval, benne „Oblio e-Factura"
- [ ] Új komponens: `components/finance/oblio-config-form.tsx`
  - [ ] Email, API secret (password field, mentés után nem látszik), CIF, sorozat, termék-név alap
  - [ ] „Kapcsolat tesztelése" gomb
  - [ ] „Mi ez és hogyan kezdj neki?" segítség-gomb (modal → az Oblio regisztrációs útmutató)
- [ ] Sikeres mentés után:
  - [ ] Secret ne jelenjen meg többé, csak csillagozva
  - [ ] Zöld pipa + a cég neve a teszt-válaszból

**DoD**: beállítás mentése működik, secret visszaolvasása csak server oldalon történik.

### 2.6 Bérleti szerződés lista: számla/chitanță kiállítás
- [ ] `components/finance/rental-tab.tsx` bővítés
- [ ] **Elágazás a `congregations.e_factura_kotelezett` értéke alapján**:
  - [ ] Ha `true` → a gomb neve „Számlát kiállít (e-Factura)" → Oblio-n keresztül SPV-re
  - [ ] Ha `false` → a gomb neve „Bizonylatot készít" → opcionális: (a) Oblio, (b) egyszerűsített chitanță PDF
- [ ] Új komponens: `components/finance/oblio-issue-invoice-modal.tsx` — e-Factura kötelezettség esetén
- [ ] **ÚJ** komponens: `components/finance/chitanta-generator-modal.tsx` — papír chitanță HTML→PDF, Oblio nélkül
- [ ] Feltételek: `jogi_tipus != 'comodat'` (comodat = nincs számla) + `osszeg > 0`
- [ ] Form mezők: szolgáltatás leírása, összeg, számla/chitanță dátuma, fizetési határidő, TVA (0% scutit alap), partner, megjegyzés
- [ ] Mentés után: toast + státusz chip a szerződés sorában
- [ ] Ha Oblio útja: háttér-polling indítás

**DoD**: mindkét útvonal (e-Factura + chitanță) külön teszt-adattal lefut.

### 2.6.b Chitanță generátor
- [ ] HTML sablon: egyszerű, hivatalos kinézetű, gyülekezeti fejléccel
- [ ] A sablon tartalmazza: kiállító adatai, bérlő adatai, szolgáltatás leírás, időszak, összeg, bizonylatszám, dátum, aláírás helye
- [ ] HTML → PDF a meglévő `html2pdf.js`-sel
- [ ] Bizonylatszám: automata sorszámozás (külön sorozat, pl. „CHT-2026/0001")
- [ ] A kiállított chitanță adatait a rendszer elmenti (új tábla? vagy meglévőn flag?)
- [ ] **KÉRDÉS**: új `chitancak` tábla, vagy a meglévő `kiadasikiseroiv` szerű struktúra bővítése?

**DoD**: egy chitanță elkészítése → PDF letöltése → adatok visszakereshetők.

### 2.7 Bérleti szerződés kártyán: számla-historia
- [ ] Kibontható blokk a szerződés alatt
- [ ] Oszlopok: dátum, sorszám, összeg, e-Factura státusz, PDF gomb, [Sztornó]
- [ ] Státusz chip-színek: sárga (pending/sent), zöld (accepted), piros (rejected)

**DoD**: 3 különböző státuszú számla megjelenik helyesen.

### 2.8 Befizetés rögzítésénél: Oblio collect jelzés
- [ ] `components/modals/income-dialog-v3.tsx` bővítés
- [ ] Ha a bevétel bérleti szerződéshez kapcsolódik, ahol van nyitott Oblio számla → checkbox „Kifizetettként jelöljem az Oblio-ban is?"
- [ ] Mentéskor: `markInvoicePaid` server action

**DoD**: egy teszt-befizetés → Oblio számla `collected_at` beállítva.

### 2.9 Dashboard widget: nyitott e-Factura státuszok
- [ ] Új komponens: `components/finance/oblio-status-widget.tsx`
- [ ] Feltételes megjelenés: csak ha van `pending`/`sent`/`rejected` státuszú
- [ ] Mini statisztika: „X elfogadva / Y folyamatban / Z elutasítva"
- [ ] Kattintható → részletes lista modal

**DoD**: widget megjelenik, adatok konzisztensek a szerződés-kártyákkal.

### 2.10 Polling háttérben
- [ ] **Felhasználói döntés 2026-04-16**: **pg_cron**
- [ ] pg_cron kiterjesztés engedélyezése (Supabase dashboardon, ha még nincs)
- [ ] Új PostgreSQL function: `public.sync_oblio_pending_invoices()`
- [ ] Cron schedule: `SELECT cron.schedule('oblio-sync-hourly', '7 * * * *', 'SELECT public.sync_oblio_pending_invoices()')`
- [ ] A function meghívja az Oblio GET végpontot minden `pending`/`sent` státuszú számlára, és frissíti a státuszt
- [ ] Max. 24 óra után ha még `pending` → figyelmeztetés a dashboardon

**DoD**: 1 óránként automatikusan fut pg_cron-ból, a nyitott számlák állapota szinkronizál.

### 2.10.b Manuális re-sync (felhasználó kérése)
- [ ] **ÚJ (felhasználói kérés 2026-04-16)**: minden számlánál „Állapot-ellenőrzés" gomb
- [ ] Kattintásra: `syncInvoiceStatus(oblioSzamlaId)` server action → Oblio GET → frissíti a DB-t → visszaadja az új állapotot
- [ ] A UI-ban zöld pipa + dátum: „Megjelent Oblio-ban: [dátum]"
- [ ] Hibakezelés: ha Oblio nem ad választ, érthető üzenet

**DoD**: 1 kattintás a gombra → 2 mp-en belül friss állapot.

### 2.10.c PDF letöltés
- [ ] **Felhasználói igény 2026-04-16**: a számla PDF-je közvetlenül letölthető
- [ ] A `pdf_url` mezőt az Oblio válasz mentésekor rögzítjük (már tervben)
- [ ] UI: „PDF" gomb → új ablakban nyitja az Oblio URL-t
- [ ] **Q2 válasz alapján**: csak az URL-t tároljuk (nem Supabase Storage-ba)
- [ ] Ha a link 1 évnél régebbi → elő-ellenőrzés az Oblio-val (re-sync) a kattintás előtt

**DoD**: PDF letöltés minden kiállított számlánál működik.

### 2.11 Auto-számlázás (szerződés-szintű flag)
- [ ] Logika: ha `oblio_auto_szamlaz = true` és a szerződés aktív és a fizetési ciklus szerint lejárt a legutóbbi számla óta → automatikus számla-kiállítás
- [ ] Háttér-futás: napi/heti ütemezett job (pg_cron vagy Vercel cron)
- [ ] Napló: minden auto-kiállítás logolva
- [ ] UI: a szerződés-form-on kapcsoló, magyarázattal („A rendszer magától kiállítja a számlát a fizetési ciklus kezdetén — havi/negyedéves/féléves/éves beállítástól függően. Kézi felülbírálás lehetséges.")

**DoD**: egy teszt-szerződésen `oblio_auto_szamlaz = true` → a ciklus végén automata számla generálódik.

### 2.12 Screenshotos lelkészi útmutató
- [ ] Új dokumentumfájl: `docs/user-guide/oblio-regisztracio.md`
- [ ] Tartalom:
  1. Oblio.eu fiók regisztráció (3 screenshot)
  2. CIF megadása a fiókban (2 screenshot)
  3. API secret generálás: Beállítások → Account Data → Generate API secret (3 screenshot)
  4. API secret bemásolása a KARTOTEKA-ba (1 screenshot KARTOTEKA oldalról)
  5. Kapcsolat tesztelése (1 screenshot)
  6. Gyakori hibák és megoldások (szöveges)
- [ ] Képek: `docs/user-guide/images/oblio-regisztracio/` mappába mentve
- [ ] **KÉRDÉS a felhasználónak**: a screenshot-okat én **demó fiókból** készítsem, vagy a felhasználó ad saját screenshot-okat?

**DoD**: az útmutató kinyomtatva is olvasható, egy új lelkész lépésről-lépésre végig tudja csinálni.

### 2.13 Hibakezelés és idempotencia
- [ ] Duplikáció-védelem: egy szerződésre egy adott hónapra csak egy számla
- [ ] Retry logika hálózati hibára (exponenciális backoff)
- [ ] Audit log minden számla-kiállításnál

**DoD**: kétszeres kattintás 1 számlát eredményez, nem duplikát.

### 2.14 Tesztelés
- [ ] TS + ESLint tiszta
- [ ] Mock alapú unit tesztek
- [ ] E2E teszt: teljes flow (config → számla → collect → sztornó)
- [ ] Teszt-fiók Oblio-ban (felhasználóval egyeztetni)

**DoD**: minden szcenárió zöld.

---

## WC-3 — Amortizáció finomhangolás

### 3.1 Konstansok és katalógus bővítés
- [ ] `lib/constants/inventory.next.ts` bővítés:
  - [ ] `ALAPESZKOZ_MIN_ERTEK_RON = 2500` konstans hozzáadása
  - [ ] `INVENTORY_AMORTIZATION_CATALOG` bővítés a 8 új tétellel (orgona, harang, hangtechnika, videótechnika, klíma, mosógép, fűnyíró, riasztó)
- [ ] **Ellenőrzés**: HG 2139/2004 hivatkozású kódok használata, nem találmány

**DoD**: a katalógus 18 tétellel, minden tétel érvényes kóddal.

### 3.2 2500 RON figyelmeztetés — új tétel rögzítésekor
- [ ] Leltár új-tétel modal: ha `kategoria_key === 'alapeszkoz'` és `beszerzes_erteke < 2500` → **figyelmeztető banner**
- [ ] Szöveg: „Ez a tétel 2500 RON alatt van. A román jogszabály szerint ez **csekély értékű tárgy**, nem alapeszköz. Átállítod csekély értékűre, vagy mégis alapeszközként rögzíted?"
- [ ] Gombok: [Átállítás csekély értékűre] [Mégis alapeszköz] [Mégse]
- [ ] Ha „mégis alapeszköz" → `alapeszkoz_kuszob_figyelmen_kivul = true` (új DB mező)

### 3.3 FORDÍTOTT figyelmeztetés — csekély értékű → 2500+ RON
- [ ] Leltár új-tétel modal: ha `kategoria_key === 'csekely_erteku'` és `beszerzes_erteke >= 2500` → **figyelmeztető banner**
- [ ] Szöveg: „Ez a tétel **legalább 2500 RON**. A román jogszabály szerint ezt **alapeszközként kell leltárba venni**, nem csekély értékűként. Átállítod alapeszközre?"
- [ ] Gombok: [Átállítás alapeszközre] [Mégis csekély értékű] [Mégse]

**DoD**: mindkét figyelmeztetés teszt-esettel lefut.

### 3.4 Számla több tételre bontása
- [ ] **Új funkció**: a leltár rögzítés dialógusban ha a lelkész egy számlát rögzít, és azon több tétel van, indíthasson egy „Tételenkénti bontás" módot
- [ ] Új komponens: `components/inventory/inventory-multi-item-from-invoice.tsx`
  - [ ] Közös számla-adatok egyszer (bizonylatszám, dátum, eladó, teljes összeg)
  - [ ] Alul egy táblázat: minden sor egy tétel (megnevezés, mennyiség, érték, kategória)
  - [ ] A sorok összértéke **kötelezően egyezzen** a számla teljes összegével — eltérés esetén hibajelzés
  - [ ] Mentésnél: N db `leltar_tetelek` sor létrejön, mind ugyanazzal a `beszerzes_bizonylat` és `beszerzes_datuma` értékkel
- [ ] **Ellenőrzés**: a `beszerzes_bizonylat` alapján visszakereshető a teljes számla, ha szükséges

**DoD**: egy 4 500 RON-os számla 3 tételre bontva (1 500 + 2 000 + 1 000 RON) helyesen rögzítve.

### 3.5 DB séma bővítés
- [ ] Migráció: `migration-docs/2026-04-16-amortizacio-bovites.sql`
  - [ ] `leltar_tetelek.alapeszkoz_kuszob_figyelmen_kivul boolean DEFAULT false`

**DoD**: oszlop létezik, advisors tiszta.

### 3.6 Amortizáció magyarázó blokk bővítés
- [ ] `components/inventory/inventory-amortization-dialog.tsx`:
  - [ ] A „Mit jelentenek ezek az adatok?" szakasz átalakítása strukturált, bővebb magyarázatra (lásd `KARTOTEKA-amortizacio-audit-2026-04-16.md` Javasolt szövegminta)
  - [ ] 3 alszekció: „Mi az amortizáció röviden?", „Mire kell figyelned?", „A 2500 RON szabály"
  - [ ] Link a Pénzügyi Útmutató 14. szekciójára

**DoD**: a dialog-ban legalább 250 szó emberi nyelvű magyarázat olvasható.

### 3.7 Dashboard-kártya a Leltárban
- [ ] `components/inventory/inventory-main-v3.tsx` → új kártya a főnézetben
- [ ] Tartalom: „Értékcsökkenés ebben az évben: X RON" + „Teljesen lefutott eszközök: Y darab"
- [ ] Kattintható → szűrt lista

**DoD**: a kártya megjelenik a leltár főnézetben, értékek helyesek.

### 3.8 Tesztelés
- [ ] 2 500 RON alatti alapeszköz → figyelmeztetés
- [ ] 2 500 RON feletti csekély értékű → figyelmeztetés
- [ ] Számla több tételre bontás → minden tétel mentve
- [ ] Katalógus új kódok elérhetők a dropdown-ban
- [ ] Amortizáció helyesen számol új tételnél

**DoD**: teljes regressziós teszt zöld.

---

## WC-4 — Használati útmutató (13. fül)

### 4.1 Keretrendszer
- [ ] Új fájl: `components/finance/finance-usage-guide-tab.tsx`
- [ ] Új fájl: `lib/finance/usage-guide-content.ts` (szekció-definíciók)
- [ ] `components/finance/usage-guide/usage-guide-nav.tsx`
- [ ] `components/finance/usage-guide/usage-guide-content.tsx` (renderer)
- [ ] Típus: `GuideSection` interface
- [ ] 13. fül hozzáadása a `finance-tabs.tsx`-hez (`utmutato`, `indigo` szín)

**DoD**: üres fül megnyitható, nav megjelenik, renderer működik.

### 4.2 Szekciók tartalma (15 szekció)
Minden szekció külön fájl: `components/finance/usage-guide/sections/section-*.tsx`

- [ ] 1. `section-overview.tsx` — Áttekintés
- [ ] 2. `section-cashbook.tsx` — Kassza
- [ ] 3. `section-bank.tsx` — Bank
- [ ] 4. `section-budget.tsx` — Költségvetés
- [ ] 5. `section-accounting.tsx` — Számadás
- [ ] 6. `section-transactions.tsx` — Tranzakciók
- [ ] 7. `section-debt.tsx` — Tartozások
- [ ] 8. `section-rental.tsx` — Bérleti szerződések (+ `jogi_tipus`)
- [ ] 9. `section-audit.tsx` — Párosítás
- [ ] 10. `section-decont.tsx` — Decont (előleg-elszámolás **és** elkallódott nyugta) — **felhasználói jóváhagyás szerint pontosítandó**
- [ ] 11. `section-monetary.tsx` — Monetár
- [ ] 12. `section-tva.tsx` — TVA figyelő (a WC-1 után)
- [ ] 13. `section-efactura.tsx` — Oblio e-Factura (a WC-2 után)
- [ ] 14. `section-amortization.tsx` — Alapeszköz-amortizáció (a WC-3 után)
- [ ] 15. `section-faq.tsx` — GYIK

**Minden szekcióra DoD**:
- [ ] A tartalom pasztorális hangnemben íródott
- [ ] Legalább 1-2 konkrét példa a gyülekezeti életből
- [ ] „Gyakori hiba" szekció legalább 2 ponttal
- [ ] Linkek a kapcsolódó szekciókhoz
- [ ] Jogszabályi hivatkozások pontosan (ahol van)

### 4.3 Kereső hozzáadása
- [ ] Fuzzy keresés kliens oldalon (kezdetben egyszerű `includes`, később lunr.js ha sok lesz)
- [ ] Kiemelés az eredményen

**DoD**: a „kassza" keresőszó megjeleníti a 2. szekciót, helyes kiemeléssel.

### 4.4 Nyomtatás
- [ ] PDF export gomb — `html2pdf.js`-sel az egész útmutatót egyben
- [ ] Hivatalos fejléc (gyülekezet neve, dátum) — **kérdés a felhasználónak**: szerepeljen-e

**DoD**: 1 kattintás → PDF letöltődik.

### 4.5 Reszponzivitás
- [ ] Mobile: nav egy lenyíló select
- [ ] Tablet/desktop: bal oldali nav + jobb tartalom
- [ ] Minden szekció ellenőrzése 3 képernyőméreten

**DoD**: a memóriában rögzített mobile-first alapelv szerint minden méretre jól működik.

### 4.6 Decont szekció — összeolvasztás két funkcióval
- [ ] **Felhasználói döntés 2026-04-16**: **ÖSSZEOLVASZTÁS**. A Decont komponens bővül, egyetlen fülön két üzemmódot kínál:
  - **Üzemmód A**: „Előleg-elszámolás" (jelenlegi funkció — valaki előleget vett fel, vásárolt több tételt, összesíti)
  - **Üzemmód B**: „Utólagos bekönyvelés" (elkallódott nyugták/számlák pótlása — egyszerű lista, egyenként bekönyvelhető tételekkel, az `is_potlas` flaggel a befizetes/kiadas táblába)
- [ ] Új komponens-struktúra: `decont-tab.tsx` megtartja a keretet, bent **mód-kapcsoló**-val választhat a lelkész
- [ ] Üzemmód B implementáció:
  - [ ] Lista nézet: dátum, dokumentum típus (számla/nyugta/bizonylat), kiállító, magyarázat, összeg, célkód
  - [ ] Rögzítéskor a sorok a `befizetes` vagy `kiadas` táblába mennek be `is_potlas = true` flaggel
  - [ ] A dátum lehet múltbeli (utólagos)
  - [ ] Figyelmeztetés: „A rendszer ezeket a tételeket a megadott évre/hónapra könyveli. Ellenőrizd, hogy a számadás még nincs-e lezárva!"
- [ ] Üzemmód A implementáció: **változatlan** (meglévő kód marad)
- [ ] Útmutató szekció 10. frissítendő: „Mikor melyik módot használd?" résszel

---

## WC-5 — Egyházmegyei dashboard: bérleti szerződések megjelenítése

### 5.1 Jelenlegi állapot felmérés
- [ ] `app/(dashboard)/dashboard-egyhazmegye/` → áttekintése: mit mutat most a gyülekezetekről?
- [ ] Van-e már „gyülekezet részletei" nézet, ahol a bérleti szerződést be lehet illeszteni?
- [ ] Ha van: melyik komponens felelős a gyülekezet-kártyákért?

**DoD**: leírt fájlista és belépési pont.

### 5.2 Új bérleti-blokk komponens
- [ ] Új komponens: `components/dashboard/congregation-rental-summary.tsx`
- [ ] Tartalom egy gyülekezet-kártyán vagy részletes nézeten:
  - [ ] Összes aktív bérleti szerződés száma (kártya)
  - [ ] Kibontható lista: szerződések
    - Típus badge (`locatiune` / `arendare` / `comodat` / `concesiune`)
    - Tárgy (szerződés `leiras` vagy `targy`)
    - Bérlő név
    - Időszak (`kezdet` — `vege`)
    - Összeg + fizetési ciklus
    - Aktivitás státusza
- [ ] Summary soron: „Éves várható bérleti bevétel: X RON"

**DoD**: az esperes vagy admin látja minden gyülekezetnél a bérleti adatokat.

### 5.3 Server action
- [ ] `app/(dashboard)/dashboard-egyhazmegye/rental-summary-actions.ts`
  - [ ] `getRentalSummaryForCongregations(diocese_id)` — RLS-sel szűrve (csak az esperes/admin látja)
- [ ] Jogosultság: `esperes`, `egyhazmegyei_admin`, `admin`, master admin

**DoD**: az action csak jogosultaknak ad választ.

### 5.4 UI integráció
- [ ] A meglévő egyházmegyei dashboardon a gyülekezet-kártya bővítése az új blokkal
- [ ] Reszponzív

**DoD**: minden gyülekezeten láthatók a bérleti szerződések.

---

## WC-6 — Dokumentáció, tesztelés, zárás

### 6.1 Projekt log frissítés
- [ ] Minden munkacsomag befejezése után új lépés a `KARTOTEKA-project-log.md`-ben
- [ ] Minden fejlesztési döntésnél hivatkozás a tervdokumentumra

### 6.2 README és user-guide frissítések
- [ ] `docs/user-guide/` bővítése az e-Factura és TVA témákkal
- [ ] Screenshotos útmutatók

### 6.3 Migration-docs aktualizálás
- [ ] `migration-docs/Database_schema.sql` frissítése az új táblákkal és oszlopokkal

### 6.4 Záró review
- [ ] Teljes modul végig-tesztelése: új lelkipásztor fiók, első napi használat szimulálva
- [ ] Reszponzivitás: mobile + tablet + desktop
- [ ] Memória alapelveinek ellenőrzése: modal design, színek, szerif cím, stb.

**DoD**: a modul „éles használatra kész" állapotú.

---

## Prioritási sorrend és ütemezés-javaslat

```
Fázis A (P0 jogszabályi):   WC-0 → WC-1 → WC-2
Fázis B (P1 funkcionális):  WC-3 → WC-5
Fázis C (dokumentáció):     WC-4 (a többi után)
Zárás:                       WC-6
```

**Indok**:
1. **WC-1 (TVA)** előbb, mint WC-2 (Oblio), mert:
   - A TVA logika (`jogi_tipus`, `tva_plafonba_szamit`) a bázis, amire az Oblio számla építkezik
   - Nincs külső függőség (nem kell Oblio fiók)
2. **WC-3 (Amortizáció)** párhuzamosan haladhat WC-1/WC-2-vel, mert független
3. **WC-4 (Útmutató)** **csak utoljára**, mert a WC-1 + WC-2 + WC-3 funkcióit dokumentálnia kell
4. **WC-5 (Egyházmegyei dashboard)** bármikor, de érdemes WC-1 után, mert a `jogi_tipus` mezőt kihasználja a megjelenítésnél

---

## Kockázat-naplózási módszer

Minden munkacsomaghoz **külön kockázat-napló** a tervdokumentumban. Ha új kockázat kerül elő implementáció közben:
1. Megállás
2. Dokumentálás a projekt logba
3. Kérdés a felhasználónak
4. Döntés dokumentálása
5. Folytatás

**Nem** találgatunk. **Nem** haladunk át olyan bizonytalanságon, ami később vissza fog vágni.

---

## Ellenőrzőlista minden lépés után

- [ ] `npx.cmd tsc --noEmit` → 0 hiba
- [ ] `npx.cmd eslint <érintett fájlok>` → 0 hiba
- [ ] Supabase `get_advisors(security)` → nincs új warning
- [ ] Supabase `get_advisors(performance)` → nincs új warning
- [ ] Reszponzivitás: mobile + tablet + desktop
- [ ] Projekt log frissítve
- [ ] Git commit írt üzenet szerint a jelenlegi konvencióval (magyar, lényegre törő)

---

## Nyitott kérdések (WC-0-ban tisztázandó, mielőtt bárhová lépnénk)

1. **Decont**: az előleg-elszámolás + utólagos bekönyvelés funkciók **szétválasztása** vagy **összeolvasztása**? — a 4.6 pontra válasz szükséges.
2. **Contract de arendare**: **TISZTÁZVA** — lásd `KARTOTEKA-penzugy-jogi-pontositasok-2026-04-16.md`. Az Oblio integráció **opció**, nem kötelező minden bérleti szerződésre.
3. **TVA kategória-seed**: ki review-olja szakmailag a flag értékeket (könyvelő bevonása szükséges, vagy a felhasználó jóváhagyja magától)?
4. **Oblio screenshotok**: demó fiókból én készítsem, vagy a felhasználó ad saját anyagot?
5. **Teszt-Oblio fiók**: ki nyit, ki fizeti az éves licencet a fejlesztési időszakra (29 €)?
6. **Auto-számlázás cron**: pg_cron, Vercel cron, vagy on-open polling? (infrastruktúra-döntés)
7. **Feature flag**: a TVA figyelő + Oblio integráció legyen feature flag mögött (rejthető), vagy direkt rollout? Ha flag, a `system_settings` táblában hol tároljuk?
8. **Screenshotos útmutató** PDF-ben is elérhető legyen, vagy csak online?
9. **ÚJ**: A chitanță generátor — új dedikált tábla (`chitancak`), vagy a meglévő struktúra bővítése (pl. `kiadasikiseroiv`, `oblio_szamlak.tipus = 'chitanta_papir'`)?
10. **ÚJ**: `e_factura_kotelezett` flag kezelése — ki állíthatja (`admin` vagy `lelkesz` is), és hogyan detektáljuk automatikusan (pl. ha egy nem-bérleti 104.xx kódra van bevétel, felajánljuk az átkapcsolást)?
11. **ÚJ**: Az impozit pe profit figyelő (art. 15 alin. 3 — 15 000 EUR és 10% plafon) **most** vagy **külön körben**? Javaslat: **külön körben**, mert pontos össz-bevétel adat kell és a gyülekezeteket figyelmeztessük a könyvelővel.
