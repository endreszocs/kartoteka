# KARTOTEKA — Sprint M: UI-fix + auto-sync + reszponzív irányítópult (v0.5.1)

**Dátum:** 2026-04-25
**Verzió:** 0.5.1
**Időkeret:** ~1.5 óra
**Státusz:** ✅ TS+Vite build zöld; cargo+NSIS bundle és Supabase/GitHub release pipeline-ra vár

---

## Kontextus

A v0.5.0 release után Endre 6 megfigyelést rögzített a friss telepítő futtatása alapján:

1. A telepítő ablakain a leírások fele nehezen olvasható.
2. Az irányítópult sok eleme stílus nélkül, hiányosan jelent meg (a számok látszottak, de a kártyák majdnem fehéren-fehérre rendereltek).
3. Hiányzott automatikus szinkron + látható állapotsáv.
4. A tagnyilvántartás oldal UI-ja ráér egy iterációra.
5. A tag-detail modal UI-ja ráér egy iterációra.
6. A tartalom nem alkalmazkodik az ablak méretéhez — teljes képernyőn üres sávok mindkét oldalon.

A web–desktop **100%-os UI-paritás** továbbra is irányelv: a két klienst a felhasználó nem tudja megkülönböztetni.

---

## Diagnosztika

### #2 — irányítópult stílushiány — ROOT CAUSE

A `apps/desktop/src/index.css` és `apps/web/app/globals.css` Tailwind 4 `@source` direktívái csak a `packages/ui/src` mappát szkennelték. Az új `packages/ui-app/src` (HeroBannerScripture, KpiCards, BottomStats, Celebrations, RecentActivity, UpcomingPrograms, PageHero, ModalField, SessionStatusBadge, SyncStatusBadge — 11 komponens) **nem volt szkennelve**, ezért a benne használt utility class-ok (pl. `card-raised`, `bg-gradient-to-br`, `from-emerald-400`) nem generálódtak a CSS-bundle-be → fehér kártyák, hiányzó ikonok, törött dashboard.

**Bizonyíték a javítás után**: a Vite CSS-bundle ~120 kB-ról **160.91 kB-ra** nőtt (gzip 23.88 kB) — ennyi az új class-ok mérete.

### #6 — reszponzív layout

A `packages/ui/src/layout/kartoteka-shell.tsx` `<main>`-jében a tartalom-wrapper `max-w-7xl` (1280px) volt — a sidebar utáni rész feletti minden pixel üres maradt.

### #4–5 — Tagnyilvántartás polish

A members-page.tsx saját `<h1>` + `<p>` fejlécet használt a közös `PageHero` helyett (lásd `feedback_page_hero_konvenció.md`); a hover-action-ben Trash2 ikon volt megtévesztő (a sor szerkesztésre, nem törlésre nyílt meg).

### #1 — telepítő olvashatóság

A `tauri.conf.json` `longDescription` túl hosszú volt (192 karakter) — egyes NSIS-ablakokban tördelési problémákat okozhatott. Defenzív fix: rövidítés. (A BMP-képek olvashatósági kérdéseihez screenshot kellene a következő körben.)

### #3 — auto-sync hiánya

A desktop-on csak két háttér-szinkron létezett: a felhasználó által rögzített offline-tételek **WRITE-side** felküldése (chitanta/befizetés/kiadás/szemely write-sync). **READ-side pull** (szerver → lokális mirror) csak indításkor és manuális gomb-nyomásra történt.

---

## Kivitelezés

### 1) `apps/desktop/src/index.css` + `apps/web/app/globals.css`

```diff
+ @source "../../../packages/ui-app/src";
```

Mindkét kliensben hozzáadva, dokumentációval magyarázva (a `ui-app` widgetek class-jai nélküle nem generálódnak).

### 2) `packages/ui/src/layout/kartoteka-shell.tsx`

```diff
- <div className="page-shell min-h-full p-4 md:p-6 lg:p-7">
-   <div className="mx-auto w-full max-w-7xl">{children}</div>
- </div>
+ <div className="page-shell min-h-full p-4 md:p-6 lg:p-8">
+   <div className="w-full">{children}</div>
+ </div>
```

A `max-w-7xl` cap eltüntetve; a beágyazott KpiCards / BottomStats / Celebrations grid-jei (`xl:grid-cols-5`, `lg:grid-cols-2`) maguk osztják el a helyet a teljes szélességen.

### 3) Auto-sync orchestrator — új fájlok

- **`apps/desktop/src/lib/sync-orchestrator.ts`** — `useAutoSyncOrchestrator(userId)` hook:
  - Mount-kor azonnali full-bundle pull (mind 14 mirror-tábla).
  - Percenként light-bundle: profile, congregation, members, families, worklog, programs.
  - 5 percenként full-bundle (a stabil referencia-táblák is: anyakönyv, leltár, iktató, jegyzőkönyvek, sírhelyek, éves jelentés, adrlocality).
  - `online`/`offline` window-event-listener: offline-ba esve állapot-frissítés, online-ba visszatérve azonnali re-sync.
  - State: `{ state, lastSyncAt, lastError, isOnline }`; controls: `triggerManualSync()`.

- **`apps/desktop/src/components/auto-sync-status-bar.tsx`** — vizuális réteg:
  - Fix bottom-középre lebegő pill.
  - 4 állapot színkódolva (sky/emerald/amber/rose).
  - Manuális ↻ gomb a teljes pull-hoz.
  - Relatív idő re-render 10 mp-enként (`„most" → „12 mp" → „1 perce"`).

- **`apps/desktop/src/lib/auth-gate.tsx`** — `<AutoSyncStatusBar />` mountolva az online és offline-mode védett ágakon (a SessionStatusIndicator + SyncStatusIndicator mellett).

### 4) Tagnyilvántartás polish — `apps/desktop/src/pages/members-page.tsx`

- Egyedi h1+p kicserélve a közös `PageHero`-ra (eyebrow „Közösség", Users ikon, 4 stat: Aktív / Családfők / Választók / Összes).
- A „Családok" gomb a `PageHero` `actions` slot-jába került.
- Trash2 ikon → Pencil ikon a hover-row akció-ban; `aria-label` is hozzáadva.
- Az oldal `<main className="mx-auto max-w-7xl space-y-4 p-5">` wrapper eltávolítva — a shell felelős a paddingért és a szélességért.

### 5) Telepítő rövidítés

`tauri.conf.json` `longDescription`: 192 → ~98 karakter, tömörebb mondat.

### 6) Home-page text-fix

`home-page.tsx` info-doboz: „v0.4.1" → „v0.5.1" + új mondat az auto-sync státuszsávról.

### 7) Verzió-bump (3 hely)

- `apps/desktop/package.json`: 0.5.0 → 0.5.1
- `apps/desktop/src-tauri/tauri.conf.json`: 0.5.0 → 0.5.1
- `apps/desktop/src-tauri/Cargo.toml`: 0.5.0 → 0.5.1

### 8) Dokumentáció

- `docs/CHANGELOG.md`: új v0.5.1 bejegyzés (parser-formátumban, broadcast-olható).
- `docs/release-notes-v0.5.1.md`: GitHub `gh release create --notes-file` forrás.
- `docs/project-tracking/KARTOTEKA-Sprint-M-ui-fix-auto-sync-2026-04-25.md`: ez a fájl.

---

## Verifikáció

### Build
```bash
cd KARTOTEKA && npm run build --workspace=@kartoteka/desktop
```

Eredmény:
- ✅ `lint:imports` — 67 fájl, 0 tiltott import.
- ✅ `tsc` — TypeScript hiba nélkül.
- ✅ `vite build` — 12.72 s, 2320 module.
- ✅ CSS bundle: **160.91 kB** (gzip 23.88 kB) — a méret-növekedés a `@source "../../../packages/ui-app/src"` direktíva eredménye.

### Hátralévő lépések (Endre döntésére)
1. `npm run desktop:build` (cargo + NSIS) — teljes installer + MSI bundle, ~30-60 mp inkrementálisan.
2. `ops/release-build.ps1 -Version "0.5.1" -Notes "..."` — Supabase manifest + sig + auto-update pipeline (kötelező a `feedback_auto_update_release` szabály szerint).
3. `gh release create v0.5.1 ... --notes-file docs/release-notes-v0.5.1.md` — GitHub release a 4 fájllal (NSIS + MSI + 2 sig).
4. Manuális teszt egy v0.5.0-án telepített gépen → az auto-update rákínálja a v0.5.1-et.

---

## Kockázatok és tippek

- **CSS bundle méret-növekedés (~40 kB)**: várható, mert új class-ok jönnek be. Ha túl sok lesz, jövőben `@source` szelektívebb (csak a tényleg használt fájlok) — most még tág hálót dobunk.
- **Auto-sync rate-limit**: 6 pull / 60 mp + 14 pull / 5 perc → óránként ~528 Supabase select. Egy normál olvasásnak ez kis terhelés, de szem előtt tartandó több user esetén.
- **Adrlocality pull (~10k sor) a full-bundle-ban**: az első indítás lassabb lehet (~1-2 mp), utána csak 5 percenként ismétlődik.
- **NSIS BMP-olvashatóság**: nem javítva ebben a sprintben — screenshot-tal a következő körben pontosan elemezhető.

---

## 3-réteg dokumentáció (Endre szabálya — `feedback_dokumentalj_mindent`)

- ✅ Project log (ez a fájl)
- ✅ CHANGELOG.md (broadcast-olható bejegyzés)
- ⏳ Notion napló — Endre kérésére kerül létrehozásra
