# KARTOTEKA — B4 Felsőszintű dashboard audit + B4.5 bővítés

**Dátum**: 2026-04-15
**Implementációs forrás**: `~/.claude/plans/purrfect-coalescing-quiche.md` — B4.5 plan
**Projekt log lépés**: 028.

---

## Vezetői összefoglaló

A B4 (Kerületi/egyházmegyei dashboard) **alapszinten már TELJESEN MŰKÖDÖTT** a session előtt. A 009. lépés "üres placeholder oldal" megjegyzése elavult volt — egy korábbi körben (valószínűleg a 016. lépés körül) a dashboardok teljes funkcionalitást kaptak.

**A B4.5 bővítés** most hozzáadta a hiányzó **pénzügyi és kazuáliás (anyakönyvi) aggregációt**, amellyel az esperesek és kerületi adminok egy helyen láthatják a felügyelt gyülekezetek teljes képét.

### A modul most ezt tudja

**Egyházmegyei dashboard** (`/dashboard-egyhazmegye`):
- Szervezeti KPI-k (gyülekezetek, tagok, kerületi kapcsolat, aktív kérelmek)
- **ÚJ**: Pénzügyi áttekintés (bevétel, kiadás, egyenleg + Top 12 gyülekezet)
- **ÚJ**: Anyakönyvi áttekintés (keresztelők, esketések, temetések, konfirmáltak + Top 12 gyülekezet)
- Gyülekezeti áttekintő accordion (kérelmek + dokumentumok)
- Dokumentum workflow mátrix (status flow)
- Szerepkör eloszlás, friss profilok, adatminőség

**Kerületi dashboard** (`/dashboard-kerulet`):
- Az egyházmegyei + plusz egyházmegyei bontás minden szekcióhoz
- Véglegesített dokumentumok listája egyházmegyénként
- Legnagyobb gyülekezetek (Top 12)

---

## Felfedezések

### ✅ Már elkészült alapok (korábbi körben)

- `app/(dashboard)/dashboard-egyhazmegye/page.tsx` (69 sor) — teljes oldal
- `app/(dashboard)/dashboard-kerulet/page.tsx` (117 sor) — teljes oldal
- `app/(dashboard)/dashboard-egyhazmegye/actions.ts` (8.9 kB) — 4 server action
- `app/(dashboard)/dashboard-egyhazmegye/document-actions.ts` (5.9 kB) — 5 server action
- `lib/dashboard/scope-overview.ts` (10 kB) — JS-aggregátor
- 8+ komponens: `scope-dashboard-sections.tsx`, `congregation-overview-card.tsx`, `document-workflow-panel.tsx`, `unlock-requests-card.tsx`, stb.

### ❌ Hiányzó (a B4.5 hozzáadta)

- Pénzügyi KPI-k (bevétel/kiadás/egyenleg) per egyházmegye/gyülekezet
- Kazuáliák szám aggregáció (keresztelő, esketés, temetés, konfirmáció)
- Egyházmegyei bontás táblázat a kerületi dashboardon (gyülekezetszintű volt csak)

---

## Implementált fájlok

### Új fájlok (4)

| Fájl | Tartalom | Sorok |
|---|---|---|
| `lib/dashboard/scope-financial.ts` | Pénzügyi aggregátor (bevétel/kiadás/egyenleg per gyülekezet+egyházmegye, JS Promise.all) | ~190 |
| `lib/dashboard/scope-vital.ts` | Kazuáliák aggregátor (4 anyakönyvi tábla párhuzamos lekérdezés + aggregálás) | ~190 |
| `components/dashboard/scope-financial-section.tsx` | UI: 3 KPI + egyházmegyei bontás táblázat + Top N gyülekezet | ~220 |
| `components/dashboard/scope-vital-stats-section.tsx` | UI: 4 KPI + egyházmegyei + gyülekezetszintű bontás | ~220 |

### Módosított fájlok (2)

| Fájl | Mit |
|---|---|
| `app/(dashboard)/dashboard-egyhazmegye/page.tsx` | 2 új szekció (`ScopeFinancialSection`, `ScopeVitalStatsSection`) a ScopeKpiGrid után, csak gyülekezetszintű bontással |
| `app/(dashboard)/dashboard-kerulet/page.tsx` | Ugyanaz, de egyházmegyei + gyülekezetszintű bontással, congregationLimit=10 |

---

## Architektúra részletek

### Aggregáció stratégiája

A meglévő `scope-overview.ts`-szel konzisztensen **JS-szinten aggregálunk**, NEM Postgres VIEW-vel:

- `Promise.all` 6 párhuzamos query (befizetes, kiadas, keresztseg, hazassag, temetes, konfirmalas) + 2 segéd (congregations, dioceses)
- Az `IN (congregationIds)` szűrés a Supabase-ben (RLS-nek megfelelően szűrve)
- A meglévő indexek (`congregation_id` mezőkön) hatékonyan kezelik a query-ket
- Aggregálás `Map<congId, value>` szerkezetekben

**Skálázódás**:
- Egyházmegyei nézet: ~10-20 gyülekezet × ~1000-5000 sor/tábla = ~50-100k sor max
- Kerületi nézet: ~50-100 gyülekezet × ~1000-5000 sor/tábla = ~250-500k sor max
- Mind elfogadható egyetlen page load-on

Ha a skálázódás később problémát okoz, érdemes lehet Postgres `VIEW` vagy materialized view-k bevezetése.

### Dátum-szűrés

A pénzügyi tábláknál `datum >= 'YYYY-01-01' AND datum < 'YYYY+1-01-01'`.
A `temetes` táblánál a `tdatum` mezőt használjuk (temetés dátuma, NEM a halálozás).

### Színkódolás

- **Pénzügyi**: emerald (bevétel), rose (kiadás), indigo/rose (egyenleg pozitív/negatív)
- **Kazuáliák**: sky (keresztelő, "víz" konnotáció), rose (esketés, "szív"), slate (temetés, semleges), amber (konfirmáció, "felnőtté válás")

---

## Mit NEM csináltam ebben az iterációban

- **Presbiter számláló**: a roadmap említette, de alacsonyabb prioritású; külön kérésre
- **`lib/dashboard/district-visibility.ts`**: már a `scope-overview.ts` is kezeli a scope-szűrést (diocese_id alapján)
- **Postgres VIEW**: JS-aggregálás konzisztens a meglévővel
- **Évválasztó UI**: jelenleg az aktuális évet aggregáljuk; a múltbéli évek kérdés esetén külön párameter lesz
- **PDF/Excel export**: a B4.5 csak megjelenít, exportálni nem lehet a szekciókat (a meglévő dashboard-okon sincs)

---

## Roadmap pozíció Q2 2026

1. ✅ A1, A2, A3 — biztonsági javítások
2. ✅ F1+F2+F3 — repo higiénia (már korábban kész)
3. ✅ B1 — Bérleti szerződés modul TELJES (7/7)
4. ✅ B2 — Devizás átértékelés (FX) TELJES (5/5)
5. ✅ B3 — Monetár audit (már korábban kész)
6. ✅ **B4 — Felsőszintű dashboard alap (korábban kész) + B4.5 bővítés (pénzügyi + kazuáliás)**
7. ⏳ **C1 — Éves jelentések modul** (2 hét) vagy **C2 — Lelkészi havi jelentés** (1 hét)

---

## Kapcsolódó dokumentumok

- **B4.5 részletes terv**: `~/.claude/plans/purrfect-coalescing-quiche.md`
- **Tesztelési checklist**: `KARTOTEKA-security-test-checklist-2026-04-15.md` (B4.5 szekció)
- **Projekt log**: 028. lépés
- **B4 alap implementáció**: az audit szerint nincs hivatalos diagnosztikai dokumentum (korábbi körben épült)

---

**Dokumentum státusza**: VÉGLEGESÍTETT (B4.5 bővítés KÉSZ)
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: manuális tesztek után + következő nagy feladat tervezése
