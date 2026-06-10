# KARTOTÉKA — Pénzügy pixel-paritás terv (desktop ⇄ web)

**Dátum:** 2026-06-10 · **Hatókör:** CSAK a Pénzügy modul (Endre kérése: most ennél maradunk).
**Cél:** a desktop Pénzügy **pixelpontos és viselkedés-azonos** legyen a web-bel, hogy a kettőt **párhuzamosan** lehessen fejleszteni. Ez a dokumentum egy **végigvezethető checklist**.

---

## 0. A paritás alapelve

A web finance-felülete (`apps/web/components/finance/finance-tabs.tsx`) **EGYETLEN oldal**: hero + `ColorTabs` tab-bar + tab-tartalom, hash-routinggal (`#dashboard`, `#cashbook`, …). A tab-tartalmak a **megosztott `@kartoteka/ui-app` komponensek** (a web vékony wrapperekkel csomagolja, az adatot/callbacket prop-on adva).

**Pixel-paritás = a desktop Pénzügy is EGY oldal legyen, ugyanazzal a hero+tab-bar szerkezettel és ugyanazokkal a megosztott tab-komponensekkel.** Azonos komponens = azonos pixel. A desktop csak az **adat-adaptert** (lokális SQLite → megosztott típus) és az **írási callbackeket** (offline pénztárca/outbox) adja hozzá.

> **Jelenlegi eltérés:** a desktop ma **szétdarabolt** (külön oldalak: `/penzugy/befizetes`, `/penzugy/kiadas`, … + sidebar-almenü), és van, ahol PageHero-t használ, a web meg saját inline hero-t + `ColorTabs`-ot. Ez a strukturális eltérés a fő oka annak, hogy „nem ugyanaz".

---

## 1. A cél-szerkezet (web `FinanceTabs`)

```
/penzugy  (EGY oldal)
 ├─ Hero (cím + leírás + gradient-blobok)            ← web: inline DIV (finance-tabs.tsx:225)
 ├─ ColorTabs tab-bar (aktív aláhúzás, hash-sync)    ← @kartoteka/ui/ColorTabs
 └─ Tab-tartalom (activeTab szerint):
      dashboard         → FinanceDashboard       ✅ desktop kész (A2)
      cashbook          → CashbookTab            ⬜ desktop: külön Bevétel/Kiadás oldalak (C-hullám)
      bank              → BankTab                ⬜
      transactions      → TransactionsTab        ✅ desktop kész (A3)
      budget            → BudgetTab              ⬜ (írás)
      accounting        → AccountingTab          ✅ desktop kész (A5)
      debt              → DebtTab                ✅ desktop kész (A4)
      rental            → RentalTab              ⬜
      monetary          → MonetaryTab            ⬜
      oblio_ellenorzes  → OblioEllenorzesTab     ⬜ (külső API)
      decont/dispozitie → DecontTabBody / DispozitieDialogBody ⬜
      sugo              → PenzugyHelp (web bespoke) ⬜ külön döntés
```

---

## 2. Tab-onkénti paritás-mátrix (drive-through checklist)

Jelölés: ✅ kész · 🟡 read-only kész, de nem a tab-oldalon · ⬜ hátra · ⚠️ írási út (magas kockázat).
„Web forrás" = a pixelek igazság-forrása. „Adat-adapter" = a desktop lokális betöltése.

| Tab | Web wrapper | Megosztott komp. | Desktop állapot | Adat-adapter (desktop) | Írás? | DoD |
|---|---|---|---|---|---|---|
| **dashboard** | dashboard-tab.tsx | `FinanceDashboard` | ✅ A2 (külön oldal) | records+celMap+balances+settings-stub | nem | a tab-oldalon, web-azonos |
| **cashbook** | cashbook-tab.tsx | `CashbookTab` | ⚠️ C1 | records+categories+chitanta/storno **callbackek** + offline-wallet | **IGEN** | bevitel+lista web-azonos |
| **bank** | bank-tab.tsx | `BankTab` | ⬜ C2 | bankszamlak+belsomozgas+kivonat | részben | — |
| **transactions** | transactions-tab.tsx | `TransactionsTab` | ✅ A3 | records+celMap+szamadasiCellek | nem | a tab-oldalon |
| **budget** | budget-tab.tsx | `BudgetTab` | ⬜ C3 | koltsegvetes(✓ szinkron) + write-callbackek | **IGEN** | — |
| **accounting** | accounting-tab-v2.tsx | `AccountingTab` | ✅ A5 | records+szamadasiCellek+settings+budgetData | nem | a tab-oldalon |
| **debt** | debt-tab-v2.tsx | `DebtTab` | ✅ A4 | közös motor (felmentes/kedvezmeny ✓) | nem | ⚠️ szám-hitelesítés a webhez |
| **rental** | rental-tab.tsx | `RentalTab` | ⬜ C3 | berleti_szerzodes szinkron + rental-debt motor | részben | — |
| **monetary** | monetary-tab-v2.tsx | `MonetaryTab` | ⬜ C3 | monetar szinkron | IGEN | — |
| **oblio** | oblio-ellenorzes-tab.tsx | `OblioEllenorzesTab` | ⬜ C5 | Oblio API + fájlrendszer | IGEN | — |
| **decont/dispo** | decont-tab.tsx / dispozitie-dialog | `DecontTabBody`/`DispozitieDialogBody` | ⬜ C4 | mentett dok. | IGEN | — |
| **sugo** | penzugy-help.tsx (bespoke!) | — | ⬜ | statikus | nem | a web-logika átemelése v. közös komp. |

---

## 3. Munkafázisok (ordered roadmap)

### B-hullám — egységes Pénzügy tab-oldal (a pixel-paritás VÁZA)
A desktop `/penzugy` legyen **EGY oldal**, ami a web `finance-tabs.tsx` szerkezetét másolja:
1. **Hero**: a web inline hero markupjának átvétele (vagy közös `FinanceHero` komponens kiemelése a webből, hogy mindkettő azt használja — ez a legbiztosabb pixel-garancia).
2. **`ColorTabs` tab-bar** (`@kartoteka/ui`): a web tab-kulcsaival és sorrendjével.
3. **Tab-tartalom**: a már kész tabok (dashboard/transactions/accounting/debt) bekötése a tab-oldalra (a meglévő wrapper-logikájukból). A még hiányzók helye „Hamarosan" amíg a C-hullám beköti.
4. Hash-routing (`#dashboard` stb.) — a sidebar Pénzügy-linkje `/penzugy#dashboard`-ra megy.
5. A szétdarabolt route-ok (`/penzugy/attekintes` stb.) átirányítása a tab-oldalra (visszafelé kompat.).

**DoD:** a desktop `/penzugy` ránézésre a web `/penzugy`-vel azonos (hero + tab-bar + a 4 kész tab).

### C-hullám — írási út (MAGAS kockázat, egyesével, teszteléssel)
- **C1 Cashbook + bevitel:** `CashbookTab` + `IncomeDialogBody`/`ExpenseDialogBody` bekötése; a callbackekbe a **meglévő offline write-sync** (befizetes/kiadas-write-sync, iratszám-wallet, outbox). Minden egyes lépés után offline-teszt.
- **C2 Bank**, **C3 Monetár/Bérleti/Költségvetés**, **C4 Decont/Dispozíció**, **C5 Oblio** — sorban, mindegyik saját szinkronnal + teszttel.

### Kereszt-metsző (pixel-finomságok)
- **Design tokens / Tailwind:** a web és desktop ugyanazt a `packages/design-tokens` + Tailwind-configot használja-e? Eltérő szín/font = nem pixel-azonos. Ellenőrizni.
- **Fontok:** azonos betűkészlet (Inter/Cormorant) a desktopon is.
- **Splash:** a desktop a megosztott `SplashScreen`-t használja; a web `splash-screen.tsx` elaboráltabb → vagy a web splash-t emeljük közösbe, vagy a desktopot a webhez igazítjuk. (Logó már Kartotéka-ra cserélve ✅.)
- **Hero:** a leghűbb megoldás egy közös `FinanceHero` komponens, amit web és desktop is importál.

---

## 4. Munkamódszer (hogy párhuzamosan menjen)

1. **Igazság-forrás a web.** Minden tab pixelképét a web wrapper + a megosztott komponens adja.
2. **Egyszer megosztott, kétszer használt:** ahol a web ma bespoke (hero, Súgó), azt **kiemeljük közös komponensbe**, hogy a desktop is azt használja — így a jövőbeli web-változás automatikusan a desktopra is átjön (valódi párhuzamos fejlesztés).
3. **Verifikáció minden lépésnél:** itt `tsc` + `lint:imports` + `vite build`; vizuális/offline teszt a desktop buildben (Endre).
4. **Írási utat soha tesztelés nélkül.** A read-only tabok batch-elhetők; az írás egyesével.
5. **Pénzügyi számokat hitelesíteni** a web ellen (különösen tartozás, számadás, egyenleg).

---

## 5. Állapot-összefoglaló (2026-06-10)

- ✅ **Read-only A-hullám kész** (dashboard/transactions/accounting/debt) — külön oldalakként.
- ✅ Közös tartozás-motor kiemelve; lokális finance-szinkron réteg kész.
- ✅ Logó-fix (EREK → Kartotéka).
- ⬜ **Következő: B-hullám** — a 4 kész tabot egy web-azonos tab-oldalba szervezni (+ közös `FinanceHero`), ez adja a látható pixel-paritást.
- ⬜ Utána C-hullám (írási út) egyesével.

> Részletes konvergencia-háttér: `KARTOTEKA-desktop-web-parity-konvergencia-2026-06-10.md`.
