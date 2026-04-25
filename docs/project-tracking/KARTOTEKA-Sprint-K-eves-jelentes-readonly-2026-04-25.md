# Sprint K — Éves Jelentés READ-ONLY desktop-paritás

**Dátum**: 2026-04-25 (este, Sprint J után)
**Fázis**: Új modul desktop-paritás — éves összesítő jelentések
**Kódolási ciklus**: ~30 perc
**Státusz**: ✅ KÉSZ

---

## 1. Vezetői összefoglaló

A Sprint K az **Éves Jelentés** modult hozza desktopra (READ-ONLY): a gyülekezet éves egyházi statisztikai jelentései, status-workflow-val (draft → submitted → received → reviewed → finalized).

- 1 fő tábla mirror: `annual_reports_local`
- A `snapshot_data` JSON-mező TEXT-ként tárolva (a UI parse-olja)
- Status-csoport-stat (5 állapot)
- Lista évek szerint, kártyásan
- Expandable kártya: workflow-dátumok + lelkészi megjegyzés + áttekintő megjegyzés + snapshot JSON megjelenítése

---

## 2. Új fájlok

### Rust v27 migráció
`annual_reports_local` 23 mezővel + 2 index. UNIQUE constraint `(congregation_id, year)` ahol `deleted = 0`.

### TypeScript sync.ts
- `AnnualReportStatus` típus (5 enum)
- `AnnualReportLocalRow` interface
- `pullAnnualReportsOfOwnCongregation(userId)` — full-pull, JSON-snapshot stringifyel
- `getLocalAnnualReports(userId)` — lista év szerint csökkenő
- `getLocalAnnualReport(userId, year)` — egy konkrét év
- `getLastPullAnnualReportsIso(userId)`

### Desktop oldal — `apps/desktop/src/pages/eves-jelentes-page.tsx`
~340 sor. PageHero + status-csoport-stat panel + jelentés-lista (expandable kártyák).

A snapshot_data JSON-string `<details>`-ben megjeleníthető, formatált `<pre>`-ben (try/catch a JSON.parse-on, ha hibás akkor raw szöveg).

### Route — App.tsx
`/eves-jelentes` → `<EvesJelentesPage />`. Eddig PlaceholderPage.

---

## 3. Architektúra-döntések

### Miért nem mirror-oljuk a snapshot_data-t struktúráltan?

A `AnnualReportSnapshot` típus a webes `lib/annual-report/generator.ts`-ben gazdag, sok-szintű objektum (15+ szekció). Mirror-olni külön táblákban túl bonyolult lenne, és csak a megjelenítéshez kell. TEXT-ben tárolva, JSON.parse-szal a UI-ban — egyszerűbb és megőrzi a sémát.

### Miért nincs külön „új jelentés" gomb?

Az éves jelentés szerkesztése a webes felületen történik (auto-generálás meglévő modulokból, szöveges szekciók szerkesztése). A desktopon csak a kész jelentések böngészésére van értelme — a status-workflow „draft" → „finalized" folyamatot a kerületi rendszer (és online webes admin) végzi. Egy desktop „új" csak félrevezető lenne.

### Status-szín-rendszer

5 fokozatú workflow:
- **draft** (slate) — még szerkesztés alatt
- **submitted** (amber) — beküldve a kerületnek
- **received** (sky) — befogadva
- **reviewed** (violet) — áttekintve
- **finalized** (emerald) — lezárva, hivatalos

Minden status kapja a saját ikonját és színét — a lelkész azonnal lát hány jelentés van melyik fázisban.

---

## 4. Hatás és kockázat

- 0 regresszió, új modul.
- Új migráció v27: <100 ms.
- Cargo újra-fordul: nyolcadik fordulat ezen a session-ön (~30-60 mp inkrementális).

---

## 5. Mai napi state

| Sprint | Modul | Státusz |
|--------|-------|---------|
| A | 4 sürgős bug fix + DB auto-recovery | ✅ |
| B | Dashboard 5 widget | ✅ |
| C+D | Anyakönyv 8 tábla | ✅ READ-ONLY |
| F | Leltár | ✅ READ-ONLY |
| G | Iktató | ✅ READ-ONLY |
| H | Jegyzőkönyvek | ✅ READ-ONLY |
| I | Sírhelyek | ✅ READ-ONLY |
| J | Programok widget | ✅ |
| **K** | **Éves Jelentés** | ✅ READ-ONLY |

**7 új READ-ONLY modul** + **6 dashboard widget** + 4 sürgős fix egy napon. **8 új Rust migráció** (v20→v27).

---

## 6. Hátralévő desktop-paritás (a webes 24 modulhoz képest)

| Modul | Státusz |
|-------|---------|
| Tagnyilvántartás | ✅ Read+Write (M8) |
| Családok | ✅ Read+Write (M8.3) |
| Munkanapló | ✅ Read+Write (M7) |
| Pénzügy 5 oldal | ✅ Read+Write (A-M7) |
| Anyakönyv 8 tábla | ✅ READ-ONLY |
| Leltár | ✅ READ-ONLY |
| Iktató | ✅ READ-ONLY |
| Jegyzőkönyvek | ✅ READ-ONLY |
| Sírhelyek | ✅ READ-ONLY |
| Programok widget | ✅ |
| **Éves Jelentés** | ✅ READ-ONLY |
| Missziós Műhely | ❌ (online community feature, kevés értelme offline) |
| Publikus oldal admin | ❌ (webes-only marad) |
| Egyházmegyei dashboard | ❌ (komplex aggregátum) |
| Egyházkerületi dashboard | ❌ (komplex aggregátum) |
| Admin panel | ❌ (admin-only, webes) |

**A lelkészi alap- és adminisztratív munkára szóló paritás teljes** READ-szempontból. A WRITE-flow-k kovetkező:

- Anyakönyv WRITE (Sprint Z, Claude Design után jobb)
- Leltár / Iktató / Jegyzőkönyvek / Sírhelyek WRITE (kevés prioritás)
- Programok rögzítés (közepes prioritás)
- Éves jelentés szerkesztés (alacsony prioritás — webes elég)

---

## 7. Dokumentáció

- **Operatív** (ez a fájl) ✅
- **Strukturált**: `docs/CHANGELOG.md` bővítve
- **Gondolati**: Notion napló *„Sprint K — Éves jelentés és a JSON-snapshot mintázat"*

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
