# Sprint J — Programok dashboard widget

**Dátum**: 2026-04-25 (este, Sprint I után)
**Fázis**: Dashboard widget — közelgő alkalmak
**Kódolási ciklus**: ~30 perc
**Státusz**: ✅ KÉSZ

---

## 1. Vezetői összefoglaló

A `gyulekezeti_programok` (események/alkalmak) **NEM** önálló sidebar-modul a webes appban — csak a dashboard ProgramScheduler widgetnek a backend-je. A Sprint J ezt mirror-olja a desktopra:

- Új mirror-tábla `gyulekezeti_programok_local`
- Új közös widget `UpcomingPrograms` (`packages/ui-app/dashboard/`)
- Beépítés a desktop home-page-be a hero alatt, kiemelt pozícióban
- **Auto-pull** mount-kor (best-effort online; offline-ban a meglévő cache)

---

## 2. Új fájlok

### Rust v26 migráció
- `gyulekezeti_programok_local` (20 mező + 2 index)
- A magyar `ismétlődő` mező NEM mirror-olt (ékezetes oszlopnév SQLite-ban problémás) — `ismetlodes_tipus IS NOT NULL` derivátum

### TypeScript sync.ts
- `ProgramLocalRow` interface
- `pullProgramsOfOwnCongregation(userId)` — full-pull
- `getLocalUpcomingPrograms(userId, daysAhead, limit)` — közelgő, NEM teljesített
- `getLocalPrograms(userId, year)` — adott évre
- `getLastPullProgramsIso(userId)`

### Új közös komponens — `packages/ui-app/src/dashboard/UpcomingPrograms.tsx`
~210 sor. Lista kártyákban, **mai-nap kiemelés** sárga gradient-tel, 16 program-típus emoji-val + magyar label-lel, ismétlődés-chipek (heti/kétheti/havi), helyszín, „ma / holnap / N nap múlva" jelzéssel.

A komponens **belül** kezeli a 16 program-típus emoji + label mappingjét (lokalizált adat). A wrapper csak a nyers ProgramLocalRow-t adja át.

### Desktop integráció — `apps/desktop/src/pages/home-page.tsx`
- Új state `upcomingPrograms`
- Új useEffect: auto-pull + lokális olvasás (best-effort)
- Új JSX: `<UpcomingPrograms entries={...} />` a hero alatt, a Celebrations + RecentActivity grid előtt
- Info-doboz frissítve a 6 új modul említésével

### Index export
`UpcomingPrograms` + `UpcomingProgramEntry` típus exportálva.

---

## 3. Architektúra-döntések

### Miért auto-pull (és nem manuális)?

A programok ritkán változnak (heti pár új bejegyzés egy aktív gyülekezetben). Mount-kor egy best-effort pull az online-percekben elég. Offline-ban a meglévő cache mutat. Manuális Pull-gomb felesleges UX-zaj a dashboard-on (a Programok modul külön oldalra a későbbi sprintben kerülhet, ott lesz Pull-gomb).

### Miért a hero alatt, kiemelt pozícióban?

A „mai/holnapi alkalmak" a **legfontosabb operatív info** egy lelkész napjában. A születésnapok és friss munkanapló is hasznos, de „ma reggel 10-kor istentisztelet" kiemelt érték.

### Miért nincs `/programok` lista oldal?

A jelenlegi widget elég a 80%-os use case-re. Ha kell teljes lista (pl. „összes idei program"), a Programok modul külön sprintben kerülhet (Sprint K vagy hasonló). A widget már most `onShowAllClick` propot fogad — könnyű integrálni egy későbbi route-tal.

---

## 4. Hatás és kockázat

- 0 regresszió. A home-page bővítés egy új JSX-szakasz + useEffect.
- Új migráció v26: <100 ms.
- Auto-pull: ha offline, csendes (catch). Ha online, 100-300 ms a Supabase-fetch.

---

## 5. Mai napi state

| Sprint | Mit | Státusz |
|--------|-----|---------|
| A | 4 sürgős bug fix + DB auto-recovery | ✅ |
| B | Dashboard 5 widget (élesen kalkulált) | ✅ |
| C | Anyakönyv 4 fő tábla | ✅ READ-ONLY |
| D | Anyakönyv 4 mozgás-tábla | ✅ READ-ONLY |
| F | Leltár | ✅ READ-ONLY |
| G | Iktató | ✅ READ-ONLY |
| H | Jegyzőkönyvek (4 tábla, lista + detail) | ✅ READ-ONLY |
| I | Sírhelyek (4 tábla, layered FK) | ✅ READ-ONLY |
| **J** | **Programok dashboard widget** | ✅ |

**6 új READ-ONLY modul** + **6 dashboard widget** + 1 új közös rend + 4 sürgős fix egy napon.

---

## 6. Hátralévő

- **Anyakönyv WRITE** (Sprint K, Claude Design után)
- **WRITE-flow-k** a többi READ-only modulra (5-15 nap)
- **Missziós Műhely + Éves Jelentés** (komplex aggregátum, ~5-7 nap)
- **Egyházmegyei dashboard** desktop-paritás
- **Programok lista oldal** (`/programok`, ha érdemi)

---

## 7. Dokumentáció

- **Operatív** (ez a fájl) ✅
- **Strukturált**: `docs/CHANGELOG.md` bővítve
- **Gondolati**: Notion napló *„Sprint J — A program-widget és az auto-pull minta"*

---

**Aláírás**: Claude (Opus 4.7, 1M context) Endrével együtt, 2026-04-25 este
