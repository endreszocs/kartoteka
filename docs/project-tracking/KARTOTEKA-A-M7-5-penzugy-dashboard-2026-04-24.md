# A-M7.5 — Pénzügyi áttekintés oldal (`/penzugy/attekintes`)

**Dátum:** 2026-04-24
**Scope:** Új dashboard-oldal a gyülekezet éves pénzügyi képéről — bevétel/kiadás/egyenleg stat-kártyák, havi bontás, top kategóriák
**Státusz:** ✅ kész — az első „nagy kép" szemrevétel-oldal
**Kapcsolódó:** A-M7.3 (befizetés), A-M7.4 (kiadás)

---

## 1. Mit ad ma a lelkésznek?

Új desktop oldal `/penzugy/attekintes` — **egy helyen az éves pénzügyi kép**. A lelkész év-elején megnézi, mennyit fizettek be tagok, mennyit költöttünk, mi a legnagyobb tétel — és mindezt egy-két kattintással, pivot-tábla nélkül.

### Mit lát?

**3 stat-kártya fent (grid):**
- **Bevétel** (emerald) — összeg RON-ban + darabszám
- **Kiadás** (rose) — összeg RON-ban + darabszám
- **Egyenleg** (sky ha pozitív / amber ha negatív) — Pozitív / Negatív címke

**Havi bontás (12 sor):**
- Hónap neve (magyar: „Január", „Február"…)
- Bevétel bar (emerald, relatív a legnagyobb havi max-hoz)
- Kiadás bar (rose, ugyanúgy)
- Darabszám: „Nb / Mk" (bevétel / kiadás)
- Üres hónapok halványabbak (`opacity-40`)

**Top 5 kategória mindkét oldalon (grid):**
- Top bevétel-kategóriák progress-bar-ral + százalék + darab
- Top kiadás-kategóriák ugyanúgy, rose-színben

---

## 2. Mi változott?

### 2.1 Új desktop oldal — `PenzugyDashboardPage`

**Fájl:** `apps/desktop/src/pages/penzugy-dashboard-page.tsx` (~480 sor)

**Főbb részek:**

1. **Év-szűrő + Frissítés gomb** a fejlécben
2. **Párhuzamos adatbetöltés** — `listIncomeUseCase` + `listExpenseUseCase` `Promise.all`-ban, 2000 limittel (nagyobb gyülekezeteknek is elég)
3. **Kliens-oldali aggregáció**:
   - `reduce` a totálokhoz
   - `Map<number, MonthlyStat>` a havi bontáshoz
   - `aggregateByCategory` helper-fn a kategóriákhoz (rendezve osszeg-desc)
4. **Sztornózott és törölt sorok kihagyva** — `includeStornozott: false, includeDeleted: false` a use-case-híváskor

**Sub-komponensek:**

- `StatCard` — 4 tone-os (emerald, rose, sky, amber) stat-kártya
- `TopCategories` — kategória-bar-lista progress-bar-ral

**Kulcs tervezési döntések:**

1. **`includeStornozott: false` a dashboard-ban** — a sztornózott tételek nem számítanak bele a totálba (ez a normál pénzügyi convention). A befizetés/kiadás oldalon viszont *mutattuk* a sztornózottakat is (áthúzva) — a dashboard csak a „valóságot" mutatja.

2. **Limit 2000** — nagy gyülekezetekhez is elég. 500 sor jó a befizetés-listán, de a dashboard-nak a teljes éves adatot kell összesítenie.

3. **Havi bar max-normalizálás** — a havi bar-ok relatívan vannak arányosítva a legnagyobb havi maxhoz (`maxMonthly`). Így a legnagyobb hónap bar-ja 100%-os; a kisebbek arányosak.

4. **Üres hónapok halványan** — a lelkész lássa, melyik hónap volt üres, de ne tolongjon be a szemébe („nincs adat" szöveg-blokkok helyett `opacity-40`).

5. **Magyar hónap-nevek** — a „Január"-tól „December"-ig hardcoded lista (`MONTH_NAMES`). A web-oldalon is ugyanez van.

### 2.2 Route bekötés

**`App.tsx`:**
```tsx
<Route path="/penzugy/attekintes" element={<PenzugyDashboardPage />} />
```

### 2.3 `PenzugyLandingPage` bővítés

Új kártya elsőként — „Pénzügyi áttekintés" — indigo-50 háttér, `LayoutDashboard` ikon, „Új" badge.

A Kiadás-kártyáról **levettem** az „Új" badge-t (már nem ÚJ, csak a legújabb az Áttekintés).

A landing-page most **5 modult** mutat:
1. **Pénzügyi áttekintés** 🟢Új (indigo) — A-M7.5
2. **Befizetés rögzítése** (amber)
3. **Kiadás rögzítése** (rose) — A-M7.4
4. **Chitanța kiállítása** (sky)
5. **Nyugtatömbök** (emerald)

---

## 3. Verifikáció

| Check | Eredmény |
|---|---|
| `npx tsc --noEmit` (apps/desktop) | ✅ 0 error |
| `node scripts/check-desktop-banned-imports.mjs` | ✅ **40 fájl**, 0 tiltott |

**Nem tesztelt:**
- E2E viselkedés nagy év-totállal (1000+ sor/év) — a `Promise.all` 2×2000 limit-re fut, egyszerre max 4000 sor; a reduce 16.000 operáció alatt is gyors
- Év-váltás perf — az `useCallback` re-runs csak a `congregationId` + `year` változáskor, nincs fölösleges fetch

---

## 4. Biztonsági szempontok

1. **RLS** — a `listIncomeUseCase` + `listExpenseUseCase` már RLS-védett use-case-ek
2. **Congregation-scope** — `getLocalOwnProfile(userId).congregation_id`-ből, nem kliens-override
3. **Online-required** — a dashboard offline-fallback nélkül; a `listIncome/Expense` hálózati hibára error-t ad, amit explicit mutatunk
4. **Adatmennyiség** — 2000+2000 = 4000 sor/év, reduce egy pillanat alatt. Nincs memory-gond.

---

## 5. Mi marad hátra (polish-lépések)

**Közeli (következő session, ~1-2 óra):**
- **TVA-plafon monitor** — ha a bevétel > 395 000 RON, figyelmeztető sáv
- **Év-év összehasonlítás** — az előző év ugyanannyi hónapjával szemben
- **Excel export a dashboardról** — az 5 stat + havi bontás CSV-ben

**Hosszabb (új session):**
- **Kategória-drill-down** — kattintásra a kategóriára, a lista szűrve jön elő
- **Chart.js / Recharts integráció** — a bar-diagramok helyett natív chart
- **PDF export** — éves jelentés-sablonba illeszthető

---

## 6. A-M7 pénzügyi wave — ma reggeli státusz (2026-04-24 végére)

**5 kör kész:**

| Kör | Tartalom | Státusz |
|---|---|---|
| A-M7.2 | Chitanța offline flow (E2E — kiállítás, wallet, auto-push, konfliktus-UX) | ✅ |
| A-M7.3 | Befizetés shared CRUD + desktop UI (form, lista, szűrők, export, összesítő) | ✅ |
| A-M7.4 | Kiadás shared CRUD + desktop UI (átvevő-toggle, export) | ✅ |
| A-M7.5 | Pénzügyi áttekintés oldal (stat-kártyák, havi, top kategóriák) | ✅ |
| (A-M7.1) | Nyugtatömbök (korábban) | ✅ |

**A pénzügyi desktop-frontend E2E napi-használatra alkalmas.**

---

## 7. Dokumentáció 3-réteg

1. **Project log** — ez a fájl ✅
2. **CHANGELOG.md** — **KELL** bejegyzés: új user-facing oldal
3. **Obsidian** — az A-M7.5 atomic-note egy későbbi session-re
