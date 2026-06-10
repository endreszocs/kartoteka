# KARTOTÉKA — Desktop ⇄ Web pixel-paritás konvergencia (kivitelezési terv)

**Dátum:** 2026-06-10 · **Cél:** a letölthető offline desktop (Tauri) app pontosan úgy nézzen ki és működjön, mint a web — a jelenleg a webben működő modulok bekötése az offline rendszerbe.

> **Állapot:** felderítés kész, megközelítés jóváhagyásra vár. Pénzügyi kód még nem készült.

---

## 1. A felderítés eredménye — jó hír: az alap megvan

A `@kartoteka/ui-app` csomag a finance modulhoz **már tartalmazza a megosztott, prezentációs komponenseket** (adapter-minta: adat prop-okon + callback-slotok, **nincs bennük server-action**). A web ezeket **vékony wrapper-ekkel** csomagolja be (`apps/web/components/finance/cashbook-tab.tsx` → `@kartoteka/ui-app` `CashbookTab`). A desktop **már fogyaszt** `@kartoteka/ui-app` komponenseket (PageHero, dashboard-kártyák, SessionStatusBadge, ThemePicker, MissionWorkshop…), tehát a build támogatja — **a finance-komponensek bekötése alacsony integrációs kockázat.**

**Tehát a paritás módja:** a desktop saját, custom pénzügyi oldalait lecseréljük a **ugyanazokra a megosztott `@kartoteka/ui-app` komponensekre**, amelyeket a web is használ — desktop-oldali adat-adapterekkel (lokális SQLite → megosztott típus). Azonos komponens = azonos pixel.

### Megosztott finance-komponensek (készen állnak)
`FinanceDashboard`, `CashbookTab`, `IncomeDialogBody`, `ExpenseDialogBody`, `CombinedEntryBody`, `BankTab`, `AccountingTab`, `BudgetTab`, `TransactionsTab`, `DebtTab`, `MonetaryTab`, `RentalTab`, `DecontTabBody`, `DispozitieDialogBody`, `FinanceSugoTab`, `oblio/OblioEllenorzesTab`, + nyomtatási dialógus-bodyk.

---

## 2. A konvergencia két fő kihívása

1. **Adat-adapter:** a desktop ma `BefizetesListRow`/`KiadasListRow`-t (`@kartoteka/core` + `@kartoteka/validations`) tölt a lokális SQLite-ból, a megosztott komponensek viszont `BefitetesRow`/`KiadasRow`-t (`@kartoteka/ui-app/types`) várnak. Kell egy **`finance-adapters.ts`** réteg, ami leképezi a kettőt, plusz összeállítja a kategória-térképeket (`bevCelMap`/`kiaCelMap`), a `szamadasiCellek` listát és a `BealitasRow` beállításokat a lokális cache-ből. Ezt **minden** finance-tab újrahasználja.
2. **Írási útvonal megőrzése:** a desktop pénzügyi bevitele az **offline iratszám-pénztárcára + outbox-szinkronra** épül (befizetes-write-sync). A megosztott beviteli komponensek (`IncomeDialogBody`/`ExpenseDialogBody`) a webben server-actiont hívnak; a desktopon a **callback-prop-okba a meglévő offline write-path-ot** kell bekötni — óvatosan, mert ez finance-kritikus.

3. **Hiányzó lokális adat (új prerekvizit — 2026-06-10 felderítés):** a desktop lokális SQLite cache **csak a kategória FK-t tárolja** (`id_befizetescel`/`id_kiadascel`), a **kategória-neveket és a számadási kódokat NEM** (`tauri-sqlite-backend.ts:639` — `befizetescel_nev: null`), és nincs lokális `befizetescel`/`kiadascel`/`szamadasicel`/`bealitas` tábla. A megosztott finance-komponensek viszont ezeket (`bevCelMap`, `kiaCelMap`, `szamadasiCellek`, `BealitasRow`) igénylik. **Ezért az A-hullám előfeltétele:** a kategória-/számadási-/beállítás-táblák **szinkronizálása a desktopra** (új pull-függvények + lokális táblák + `db.rs`/`tauri-sqlite-backend` séma-bővítés). Ez Rust + TS munka, és a desktop crate újrafordítását igényli.

> **Inkonzisztens megosztás (2026-06-10 felderítés):** a web NEM minden finance-tabnál a megosztott `ui-app` komponenst használja. Pl. a Pénzügy **Súgó** a webben **saját, bespoke** komponens (`apps/web/components/finance/penzugy-help.tsx`), nem a megosztott `FinanceSugoTab` wrapper-e. Tehát a „pontosan mint a web" tabonként ellenőrzendő: ahol a web megosztott komponenst csomagol, ott a desktop is azt teszi; ahol a web bespoke, ott vagy közös komponenst kell kiemelni, vagy a web-logikát átemelni.

> **Tesztelési korlát:** a Tauri-felület futásidejű/vizuális ellenőrzése csak a desktop buildben lehetséges (a fejlesztői gépen). Itt minden lépést **TypeScript-tel ellenőrzök** (fordul-e, helyes-e az adat-szerződés), de a vizuális paritást és az offline írást a Te oldaladon kell letesztelni minden modul után.

---

## 3. Modulonkénti konvergencia-térkép (sorrend = biztonság szerint)

| # | Desktop ma | Megosztott komponens | Adat-adapter | Kockázat | Típus |
|---|---|---|---|---|---|
| **A1** | Pénzügy → Súgó (hiányzik) | `FinanceSugoTab` | nincs (statikus) | **nulla** | hiánypótlás |
| **A2** | Pénzügy → Áttekintés (custom) | `FinanceDashboard` | records→Row + cel-map + Bealitas + balances | **alacsony** (read) | csere |
| **A3** | Tranzakciók (hiányzik) | `TransactionsTab` | records→Row | **alacsony** (read) | hiánypótlás |
| **A4** | Tartozások (hiányzik) | `DebtTab` | debt rows | **alacsony** (read) | hiánypótlás |
| **A5** | Számadás (hiányzik) | `AccountingTab` | records + szamadasiCellek + Bealitas | **alacsony** (read) | hiánypótlás |
| **B1** | Egységes Pénzügy tab-oldal (mint a web FinanceTabs) | a fenti tabok egy lapon | a fenti adapterek | **közepes** (UX-átállás) | átszervezés |
| **C1** | Befizetés/Kiadás bevitel+lista (custom) | `CashbookTab` + `IncomeDialogBody`/`ExpenseDialogBody` | records + categories + chitanta/storno + **offline wallet write** | **MAGAS** (írási út) | csere |
| **C2** | Bank-import (custom) | `BankTab` | bank-adatok | közepes | csere |
| **C3** | Monetár / Bérleti / Költségvetés (hiányzik) | `MonetaryTab` / `RentalTab` / `BudgetTab` | r%-onként | közepes | hiánypótlás |
| **C4** | Decont / Dispozíció (hiányzik) | `DecontTabBody` / `DispozitieDialogBody` | mentett dok. | közepes | hiánypótlás |
| **C5** | Oblio e-Factura (hiányzik) | `oblio/OblioEllenorzesTab` | külső API + fájlrendszer | **magas** | hiánypótlás |

**A nem-pénzügyi modulok** (tagnyilvántartás, családok, anyakönyv, leltár, iktató, jegyzőkönyvek, sírhelyek, éves jelentés) a desktopon szintén custom oldalak, de a web ezekhez **nem** megosztott `ui-app` komponenst használ, hanem Next.js server-action oldalakat. Ezeknél a paritás **új megosztott komponensek kiemelését** igényelné a webből — jóval nagyobb munka, **külön hullám** (D fázis).

---

## 4. Javasolt sorrend és munkamódszer

1. **A-hullám (alacsony kockázat, gyors paritás-nyereség):** A1 Súgó → A2 Áttekintés → A3 Tranzakciók → A4 Tartozások → A5 Számadás. Mind read-only vagy hiánypótló; az `finance-adapters.ts` itt épül fel. Minden modul után TypeScript-check (itt) + vizuális teszt (nálad a desktop buildben).
2. **B-hullám:** a Pénzügy egységes tab-oldallá szervezése (mint a web), a fenti tabokkal.
3. **C-hullám (magas kockázat, írási út):** Befizetés/Kiadás bevitel a megosztott komponensekre, az offline pénztárca-write gondos megőrzésével + alapos tesztelés. Majd Bank, Monetár, Bérleti, Költségvetés, Decont, Oblio.
4. **D-hullám (külön projekt):** nem-pénzügyi modulok — új megosztott komponensek kiemelése a webből.

**Elv:** soha nem cseréljük ki a működő offline írási utat tesztelés nélkül. Az A/B hullám semmilyen írási utat nem érint — ezekkel biztonságos kezdeni.

---

## 5. Megvalósítás-napló

### 2026-06-10 — A-hullám alap + A3 (Tranzakciók) ✅ (TS-verifikált)

**Kategória-szinkron alapréteg** (`apps/desktop/src/lib/finance-categories-sync.ts`):
a `szamadasicel` + `befizetescel` + `kiadascel` referencia-táblák tükrözése a lokális SQLite-ba (TS-oldali `CREATE TABLE IF NOT EXISTS` — nincs Rust-migráció/rebuild). Getterek: `getLocalSzamadasiCellek`, `getLocalBevCelMap`, `getLocalKiaCelMap`. A web `initFinance` pontos lekérdezéseit követi (szamadasicel-nek nincs `kod` oszlopa → `kod = id`).

**Adat-adapter** (`apps/desktop/src/lib/finance-adapters.ts`): `LocalBefizetesRow`/`LocalKiadasRow` → megosztott `BefitetesRow`/`KiadasRow` (0/1 → boolean, hiányzó `belso_mozgas_xkey` → null).

**A3 — Tranzakciók tab** (`apps/desktop/src/pages/penzugy-tranzakciok-page.tsx`): a MEGOSZTOTT `@kartoteka/ui-app` `TransactionsTab` renderelése a desktopon (additív, új `/penzugy/tranzakciok` route + almenü-pont „Tranzakciók"). Offline-first: a lokális cache-ből táplálva, online-first best-effort frissítéssel. Read-only — nem érinti az írási utat.

**Verifikáció (itt):** `tsc --noEmit` ✅ (a teljes desktop csomag típushelyes), `lint:imports` ✅ (0 tiltott import). **Hátravan (Te oldaladon):** a desktop build futtatása és vizuális ellenőrzés, hogy a Tranzakciók tab a webbel azonosan jelenik meg, és a kategória-nevek/összegek helyesek.

**Következő A-hullám lépések:** A2 Áttekintés → `FinanceDashboard` (a `BealitasRow` beállítás-szinkron hozzáadásával), majd A4 Tartozások → `DebtTab`, A5 Számadás → `AccountingTab`.

### 2026-06-10 (folyt.) — A2 (Áttekintés) + A5 (Számadás) ✅ (TS + frontend-build verifikált)

**A2 — Áttekintés → `FinanceDashboard`** (`penzugy-dashboard-page.tsx` átírva): a `/penzugy/attekintes` oldal mostantól a MEGOSZTOTT `FinanceDashboard`-ot renderli (a desktop korábbi custom dashboardja helyett). Egyenleg a megosztott `calculateBalances` helperrel, carryover az előző évi lokális rekordokból. A `settings` prop a komponensben nincs használva → minimál `BealitasRow` stub a gyülekezet-cache-ből. (A web TVA-plafon widget `tvaPlafonSlot`-ja egyelőre elhagyva — B-hullám.)

**A5 — Számadás → `AccountingTab`** (új `penzugy-szamadas-page.tsx`, `/penzugy/szamadas` route + almenü): a MEGOSZTOTT `AccountingTab` read-only nézetként (a véglegesítő/feloldó callbackek nélkül → a gombok rejtve). Adat: `finance-settings-sync.ts` (ÚJ) tükrözi a `bealitas` (settings) + `koltsegvetes` (budgetData = szamadasicelid→tervezett) táblákat a lokális SQLite-ba (TS-oldali `CREATE TABLE`, nincs Rust).

**Verifikáció (itt):** `tsc` ✅ · `lint:imports` ✅ (75 fájl) · **production `vite build`** ✅. **Te oldaladon:** desktop build + vizuális ellenőrzés (Áttekintés + Számadás a webbel azonos-e; az összegek/kategóriák helyesek-e).

**Elhalasztva (indokkal):** **A4 Tartozások (DebtTab)** — `needs-engine`, MAGAS kockázat: a `computeJarulekForMemberYear` (~550 sor) + `calculateRentalDebts` determinisztikus portolása kell lokálisra, hogy a web == desktop tartozás-számítás garantált legyen. Ezt NEM batch-elem tesztelés nélkül — külön, gondos lépés (javaslat: a számító logikát `@kartoteka/core`-ba kiemelni, hogy web és desktop ugyanazt hívja). A **C-hullám (írási út: befizetés/kiadás bevitel)** és a **D-hullám (nem-pénzügyi modulok)** szintén tudatosan staged marad.

**A-hullám állapot:** A2 ✅ · A3 ✅ · A5 ✅ · A1 (Súgó — a web bespoke, külön döntés) és A4 (DebtTab — motor-port) hátra.

### 2026-06-10 (folyt.) — A4 alap: tartozás-motor megosztott csomagba kiemelve ✅ (web+desktop tsc)

A `jarulek-calculation.ts` (345 sor) + `rental-calculation.ts` (218 sor) átkerült a `@kartoteka/ui-app/finance`-be; a web két fájlja re-export shim. Ezzel web és desktop **garantáltan ugyanazt** a tartozás-számítást hívja (determinizmus). Verifikáció: WEB tsc + DESKTOP tsc + lint = mind zöld (a production web nem sérült). Commit: `aac963c2`.

**A4 desktop-wiring — HÁTRAVAN (finance-érzékeny, tag-hátralék):** a web pontos wiringje (`penzugy/actions.ts:893-965`) replikálandó a desktopra:
- felmentes + jarulek_kedvezmeny **lokális szinkron** (új; members + befizetes + bealitas már szinkronban);
- `getLocalYearSettings` a `bealitas_local`-ból (összes év — már szinkronizált);
- a fizetés-szűrő `101.01` (egyházfenntartás) a `bevCelMap`-pel; `family_id` (members_local) → `familyId`;
- `debtCalcMode` alapértelmezetten `'akkori'` (a `tartozas_szamitas_mod` nincs szinkronban — vagy bekötni);
- `computeJarulekForMemberYear` per tag → `DebtRow[]` (status: felmentett/hátralékos/rendezve) + `DebtTab` wrapper.

⚠️ **Ezt a hátralék-számítást a megépítés után a web számaihoz KELL hitelesíteni** (egy gyülekezeten ugyanazok a hátralékok jöjjenek ki web és desktop alatt), mert a tagok pénzügyi hátralékáról van szó.

### 2026-06-10 (folyt.) — A4 Tartozások (DebtTab) ✅ (TS + build verifikált)

A megosztott `DebtTab` bekötve (`/penzugy/tartozasok` + almenü). A tagok hátralékát a KÖZÖS `computeJarulekForMemberYear` motor számolja, a desktop lokális adatából — a web `penzugy/actions.ts:893-960` wiringjét pontosan követve. Új lokális szinkron: `finance-debt-sync.ts` (felmentes + jarulek_kedvezmeny), `getLocalYearSettings`/`getLocalYearlyFees` (finance-settings-sync), `buildDebtRows` (finance-debt-compute, tiszta fv.). `debtCalcMode='akkori'` (a `tartozas_szamitas_mod` nincs lokálisan); a bérleti hátralék (rentalDebtRows, opcionális) egyelőre elhagyva.

**Verifikáció (itt):** tsc + lint (78 fájl) + production vite build = mind zöld. **⚠️ Te oldaladon:** a hátralék-számokat hitelesítsd a web számaihoz (ugyanaz a gyülekezet → ugyanaz a hátralék).

**A-hullám teljes ✅:** A2 Áttekintés · A3 Tranzakciók · A4 Tartozások · A5 Számadás — mind a megosztott komponensekkel. (A1 Súgó: a web bespoke — külön döntés.) Következő: B-hullám (egységes tab-oldal) vagy C-hullám (írási út).
