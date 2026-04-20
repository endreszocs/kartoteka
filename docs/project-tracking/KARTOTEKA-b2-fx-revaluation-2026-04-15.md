# KARTOTEKA — B2 Devizás átértékelés (FX revaluation) modul

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — B2 részletes terv
**Vanilla JS forrás**: `migration-docs/source-links/penzugy_bank_api.js:896-1184`
**Projekt log lépés**: 026.

---

## Vezetői összefoglaló

A B2 feladat (Devizás átértékelés) **TELJESEN KÉSZ** — mind az 5 alfázis (B2.1 - B2.5) implementálva. A 6. alfázis (B2.6) a tesztelési és dokumentációs lépés.

### Üzleti probléma

Az erdélyi gyülekezetek egy része EUR (és néha HUF) bankszámlát is vezet külföldi adományokhoz, missziós támogatáshoz. Év végén:
- A **könyvi árfolyam** (a tranzakció időpontján rögzített) eltér
- A **BNR (Banca Naţională a României) árfolyamától** (piaci érték)

Az IAS 21 / IFRS 9 szerint az év végi devizás eszközöket át kell értékelni:
- Pozitív különbözet → **árfolyam-nyereség** → `befizetes` 103.04 kódú sor
- Negatív különbözet → **árfolyam-veszteség** → `kiadas` 203.03 kódú sor
- Hatás: a következő év nyitó banki egyenlege módosul

### A modul most ezt tudja

- A Bank fülön minden EUR / HUF számla kártyán megjelenik egy "Évvégi átértékelés" gomb
- A modal automatikusan kalkulálja a deviza-egyenleget (a `belsomozgas` valutacsere alapján)
- Egy kattintással lekéri a BNR napi árfolyamot a https://www.bnr.ro/nbrfxrates.xml-ből (regex parse)
- Real-time preview: új RON érték, különbözet, típus (nyereség/veszteség/nulla)
- Mentés: tranzakciósan létrehozza a `befizetes` (103.04) vagy `kiadas` (203.03) sort + audit trail a `valuta_atert` táblába
- A számadás (`accounting-tab-v2.tsx`) automatikusan tartalmazza a generált sort

---

## A felhasználói döntések

| Kérdés | Döntés | Hatás |
|---|---|---|
| **Hol jelenjen meg az UI?** | Bank fülön az érintett (deviza) bankszámla kártyán | Természetes hely — a számla kontextusában; nincs új fül a finance-tabs-ban |
| **BNR fetch megközelítés** | Server action + regex parse | Nincs új npm dependency, gyors implementáció |
| **103.04 / 203.03 számadási cél** | Feltételezzük + UI ellenőrzés | Ha hiányzik, magyar nyelvű hibaüzenet a usernek |
| **Számadás integráció** | Automatikus | A `befizetes`/`kiadas` rekord bekerül az aggregációba — nincs külön szekció |

---

## Felfedezések a felderítés során

### ✅ Már elkészült alapok

- `bankszamlak.valuta` és `nyito_egyenleg` — EUR/HUF támogatás már megvolt
- `belsomozgas` valutacsere típus — `arfolyam` és `cel_osszeg` mezők
- `internal-transfer-dialog.tsx` — minta a modal struktúrához (cyan/purple gradient)
- `accounting-tab-v2.tsx` finalize logika — a generált sorok automatikusan bekerülnek

### ❌ Hiányzó részek (a B2-vel hozzáadva)

- `valuta_atert` tábla — DB-ben nem létezett (audit trail a Vanilla JS-ben sem volt SQL séma)
- BNR XML fetch — szerver-oldali implementáció hiánya
- EUR egyenleg számítás (server-oldal)
- FX átértékelés modal
- Bank-tab gomb integráció

---

## Implementált fájlok

### Új fájlok (4)

| Fájl | Tartalom | Méret |
|---|---|---|
| `migration-docs/sql/2026-04-15-valuta-atert.sql` | 21 oszlop tábla + 4 RLS policy + 4 index + UNIQUE constraint | ~5 kB |
| `lib/finance/bnr-exchange-rate.ts` | `fetchBnrRates()`, `parseBnrXml()`, `extractRate()` regex parse | ~3 kB |
| `lib/finance/bank-balance.ts` | `calculateBankCurrencyBalance()`, `calculateFxRevaluation()`, `getFxTipus()` | ~3.5 kB |
| `components/modals/fx-revaluation-dialog.tsx` | Cyan/blue gradient ikon, font-heading cím, BNR fetch, real-time preview, 3 típus badge | ~13 kB |

### Módosított fájlok (5)

| Fájl | Mit |
|---|---|
| `lib/constants/finance.ts` | `FX_REVAL_NYERESEG_KOD = '103.04'`, `FX_REVAL_VESZTESEG_KOD = '203.03'`, `FX_REVAL_TIPUS`, `FX_ARFOLYAM_FORRAS` enum-ok + label map; `FxRevaluationRow` interfész |
| `lib/validations/finance.ts` | `fxRevaluationSchema` + `FxRevaluationInput` Zod típus |
| `app/(dashboard)/penzugy/actions.ts` | 4 új action: `getFxRevaluations`, `fetchBnrRateAction`, `getBankCurrencyBalance`, `saveFxRevaluation` (utóbbi tranzakciós) |
| `components/finance/bank-tab.tsx` | EUR/HUF kártyához "Évvégi átértékelés" gomb, FxRevaluationDialog render, opcionális `onFxRevaluationSaved` prop |
| `components/finance/finance-tabs.tsx` | Átadja a `refreshData`-t a BankTab-nek |

---

## Architektúra részletek

### BNR XML fetch + regex parse

A BNR napi árfolyamokat a https://www.bnr.ro/nbrfxrates.xml URL publikálja. A formátum kicsi és előírt — kb. 20-30 deviza, fix XML struktúrával. Nem érdemes új npm csomagot bevezetni egy ekkora parse-hoz.

```ts
const dateMatch = /<Cube\s+date="(\d{4}-\d{2}-\d{2})"/i.exec(xml)
const eurMatch = /<Rate\s+currency="EUR"(?:\s+multiplier="(\d+)")?\s*>([\d.]+)<\/Rate>/i.exec(xml)
```

A `multiplier` attribútum csak néhány devizánál van (pl. HUF, KRW), és azt elosztjuk vele. A Next.js cache 1 órás revalidációval terheli minimálisan a BNR-t.

**Fallback**: ha a BNR site nem elérhető, a user manuálisan adhat meg árfolyamot. A modal-ban a `BNR` gomb mellett egy közvetlen number input is van.

### EUR egyenleg kalkuláció

A `calculateBankCurrencyBalance()` a `bankszamlak.nyito_egyenleg` + a `belsomozgas` valutacsere tranzakciók alapján számol. A `befizetes`/`kiadas` táblákban nincs `valuta` mező — azok RON-alapúak —, így ezek nem érintik az EUR egyenleget.

A user a UI-ban felülbírálhatja a kalkulált értéket, ha a tényleges banki kivonata más értéket mutat.

### Tranzakciós mentés (saveFxRevaluation)

```
1) Validálás (Zod)
2) Bankszámla ellenőrzése (saját gyülekezet, valuta egyezik, NEM RON)
3) Számolás: új RON érték, különbözet, típus
4) Lookup: 103.04 vagy 203.03 befizetescel/kiadascel ID
   Ha hiányzik → error message a userhez
5) Insert: befizetes (nyereség) VAGY kiadas (veszteség) dec 31 dátummal
6) Insert: valuta_atert audit sor a befizetes_id / kiadas_id link-kel
7) revalidatePath('/penzugy')
```

**Korlátozás**: a Supabase JS API nem támogat valódi multi-table tranzakciót. Ha az 5. lépés sikerül de a 6. nem (UNIQUE constraint sért), a befizetes/kiadas sor árva marad. Ezt a UNIQUE constraint és a clear hibaüzenet minimalizálja.

### A számadás automatikus integráció

A `accounting-tab-v2.tsx` aggregálja a `befizetes` / `kiadas` sorokat a kategória szerint. Mivel az átértékelés generálta sor a 103.04 / 203.03 kódú sor, automatikusan megjelenik a megfelelő kategóriában a számadás táblázatban.

A számadás "véglegesítés" funkció (a `bealitas.szamadas_zaro_adatok` JSONB-be elmenti a snapshot-ot) is figyelembe veszi az átértékelési sorokat — ez automatikus, nincs külön kezelés.

---

## Színkódolás (a felhasználó "modal szín = fül szín" elvét követve)

- **Bank fül szín**: violet (a `finance-tabs.tsx`-ben)
- **FX átértékelés gomb a bank kártyán**: `border-cyan-200 text-cyan-700` — a BNR nemzeti bankot szimbolizáló cyan/türkiz
- **Modal ikon gradient**: `from-cyan-500 to-blue-600` Coins ikonnal
- **Modal Mentés gomb**: `bg-cyan-600 hover:bg-cyan-700`
- **Nyereség badge**: zöld (`bg-emerald-100 text-emerald-800`)
- **Veszteség badge**: piros (`bg-rose-100 text-rose-800`)
- **Nulla badge**: szürke (`bg-slate-200 text-slate-700`)

---

## Mit NEM csináltam ebben az iterációban

### 1. Számadási cél automatikus létrehozás

Ha a 103.04 / 203.03 hiányzik, a UI warning toast-ot ad, de **NEM** hozza létre automatikusan. Indok: a felhasználói döntés az volt, hogy "feltételezzük + ellenőrizzük". Ha kell, egy SQL migráció `INSERT ... ON CONFLICT DO NOTHING`-gel hozzáadható.

### 2. Befizetes/Kiadas tábla `valuta` mező hozzáadása

A `befizetes` és `kiadas` táblák RON-alapúak maradtak. Ha valaki közvetlenül EUR-ban szeretne befizetést rögzíteni, az nem támogatott. A jelenlegi workflow: a EUR számla bevétele a `belsomozgas` valutacsere úton kerül RON-ra, és onnan rögzítjük a `befizetes`-t.

### 3. Multi-currency BNR (csak EUR és HUF)

A BNR XML 20+ devizát publikál, de mi csak az EUR-t és HUF-ot parse-oljuk. Ha más deviza is kell, a `extractRate` függvény bővíthető.

### 4. FX átértékelés szerkesztés / törlés UI

Ha egy átértékelés hibás, a user csak DB-szinten tudja törölni (vagy a UNIQUE constraint miatt egy másik évhez rögzíteni). A B2.7 (Edit / Delete UI) későbbi backlog.

### 5. EUR-szintű KPI a Bank fülön

A jelenlegi MiniKpi-k RON-szintűek. EUR-szintű egyenleg megjelenítés lehetne a B2.8.

---

## Kockázatok és nyitott pontok

### Kockázatok

1. **`befizetescel.id_szamadasicel = '103.04'` hiánya**: a B2.1 SQL migráció **nem** hozza létre. A felhasználónak a Beállítások menüben kell felvennie. Ha hiányzik, error toast.

2. **EUR egyenleg pontossága**: a `calculateBankCurrencyBalance` csak a valutacsere tranzakciókat veszi figyelembe. Tényleges helyességhez a user felülbírálja a kalkulált értéket a banki kivonata alapján.

3. **Multi-table tranzakció**: Supabase JS API korlátozás — a befizetes/kiadas és a valuta_atert insert nem atomi. UNIQUE constraint minimalizálja a duplikáció kockázatát.

4. **BNR site függőség**: SLA nincs. Manuális fallback működik.

### Nyitott pontok (későbbre)

- B2.6: szerkesztés / törlés UI a régi átértékelésekhez
- B2.7: EUR-szintű KPI a Bank fülön (devizánkénti egyenleg-cella)
- B2.8: Tömeges átértékelés (egyszerre minden EUR számlára)
- B2.9: Évszintű FX riport (PDF / Excel)

---

## Roadmap pozíció Q2 2026

1. ✅ A1, A2, A3 — kritikus biztonsági javítások
2. ✅ F1+F2+F3 — repo higiénia (már korábban kész volt)
3. ✅ B1 — Bérleti szerződés modul TELJES (7/7 alfeladat)
4. ✅ **B2 — Devizás átértékelés (FX) TELJES (5/5 alfeladat)**
5. ⏳ **B3 — Monetár audit + befejezés** (1 hét) — a következő logikus
6. ⏳ B4 — Kerületi/egyházmegyei dashboard (1 hét)
7. ⏳ C1 — Éves jelentések modul (2 hét)

---

## Kapcsolódó dokumentumok

- **B2 részletes terv**: `~/.claude/plans/purrfect-coalescing-quiche.md` (B2 szekció)
- **Tesztelési checklist**: `docs/project-tracking/KARTOTEKA-security-test-checklist-2026-04-15.md` (B2 szekció)
- **Projekt log**: `docs/project-tracking/KARTOTEKA-project-log.md` 026. lépés
- **Vanilla JS forrás**: `migration-docs/source-links/penzugy_bank_api.js:896-1184`
- **Phase TODO**: `migration-docs/todo/phase-4-finance.md` 4c alfázis (most már lefedve)

---

**Dokumentum státusza**: VÉGLEGESÍTETT (B2 TELJES — 5/5 alfeladat)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: manuális tesztek után + B3 implementációs terv
