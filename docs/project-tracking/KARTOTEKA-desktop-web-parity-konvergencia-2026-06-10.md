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
