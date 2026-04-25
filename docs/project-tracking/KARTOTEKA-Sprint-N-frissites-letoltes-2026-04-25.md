# KARTOTEKA — Sprint N: Frissítés-letöltés UI + családok layout-fix (v0.5.2)

**Dátum:** 2026-04-25
**Verzió:** 0.5.2
**Időkeret:** ~45 perc
**Státusz:** ✅ TS+Vite build zöld, release pipeline-ra kész

---

## Kontextus

A v0.5.1 release után Endre 2 megfigyelést jelzett (és egy screenshot-tal igazolta):

1. **„Új verzió elérhető: 0.5.1" megjelenik a Beállítások → Adat & biztonság-on, de NEM tudom letölteni.”** + kérés: legyen külön „Frissítés" fül.
2. **A `szolgálati tér` header belelóg az ablakba a család esetében.**

---

## Diagnosztika

### #1 — letöltés UI hiánya (kritikus regression)

A `apps/desktop/src/components/settings/adat-biztonsag-panel.tsx` `Frissítés` StatusCard-ja csak az „Ellenőrzés most" gombot tartalmazta. Az `apps/desktop/src/lib/updater.ts`-ben **EXISTS** a `downloadAndInstall(update)` függvény (a Tauri `@tauri-apps/plugin-updater` `downloadAndInstall` callback-jával + progress-tracking-gel), de **nincs UI-ja sehol**. A felhasználó zsákutcába jutott: tudta hogy van új verzió, de nem volt mit kattintania.

### #2 — családok-oldal layout

A `apps/desktop/src/pages/families-page.tsx` még megtartotta a v0.4.x kor lokális `<main className="mx-auto max-w-5xl space-y-5 p-5 sm:p-6">` wrapper-t. A v0.5.1-ben a shell `kartoteka-shell.tsx` átállt teljes-szélességű layout-ra (`max-w-7xl` cap eltüntetve), és a wrapper most:

- **Dupla `<main>` elem** — HTML-érvénytelen (a shell már `<main>`-t renderel)
- **Felesleges padding** — a shell `lg:p-8` plusz a page `p-5 sm:p-6` halmozódott
- **`max-w-5xl` cap** — a tartalom 1024px szélesnél nem tudott terjeszkedni, miközben az új shell teljes szélességet ad

Ennek eredménye: a page-tartalom inkonzisztens az új tagnyilvántartás-oldallal, a sticky shell-header pedig „lebeg" a szűkített tartalom fölött → a felhasználó szemszögéből „belelóg az ablakba".

---

## Kivitelezés

### 1) Új `FrissitesPanel` komponens

**Fájl:** `apps/desktop/src/components/settings/frissites-panel.tsx`

7-fázisú állapotgép (`Phase` típus):

| Fázis | Jelentés | UI |
|---|---|---|
| `idle` | Még nem ellenőriztük | Várakozás-szöveg |
| `checking` | Pull-folyamatban | 🔵 spinner + magyarázat |
| `up-to-date` | Legfrissebb fut | 🟢 emerald kártya |
| `available` | Új várja a usert | 🟡 amber kártya + release-notes + **Letöltés** gomb |
| `downloading` | Tölt + telepít | 🔵 progress-bar + MB / MB |
| `installed` | Sikeres restart | 🟢 emerald kártya + magyarázat |
| `error` | Hiba történt | 🔴 rose kártya + újrapróbálás |

Minden állapotnak **pasztorális magyarázó szöveg** van (lásd `feedback_lelkesz_informalas`):
- Offline esetén világos magyarázat („kapcsolódj az internethez")
- Letöltés alatt „NE zárd be az alkalmazást — az installer az utolsó lépésben automatikusan újraindítja"
- Restart alatt „pár másodpercen belül elindul az új verzióval"

**Auto-check** a tab megnyitásakor (egyszer, ha online).

**Aktuális verzió** a `getVersion()` Tauri API-ból (`@tauri-apps/api/app`) — mindig pontos, nem hardkódolt.

### 2) `SettingsDialog` — új `Frissítés` tab

**Fájl:** `apps/desktop/src/components/settings-dialog.tsx`

Új `<TabsTrigger value="frissites">` a `Publikus oldal` és `Adat & biztonság` között, `Download` ikonnal. Új `<TabsContent value="frissites">` ami a `<FrissitesPanel />`-t mounteli.

### 3) `AdatBiztonsagPanel` — törött kártya eltávolítva

**Fájl:** `apps/desktop/src/components/settings/adat-biztonsag-panel.tsx`

A régi `Frissítés` StatusCard + a hozzá tartozó `checkForUpdates`, `UpdateCheckResult`, `HardDrive` import + `updateInfo` state + `handleCheckUpdate` callback **törölve**. Az „Adat & biztonság" mostantól csak a tényleges sync/DB/eszköz-állapotot mutatja, nincs duplikáció.

### 4) `families-page.tsx` — wrapper tisztítás

**Diff:**
```diff
- <main className="mx-auto max-w-5xl space-y-5 p-5 sm:p-6">
+ <div className="space-y-5">
   <PageHero ... />
   ...
- </main>
+ </div>
```

Megegyezik a Sprint M-ben a `members-page.tsx`-en csinált javítással → a két oldal vizuálisan azonos kezelést kap.

### 5) Verzió-bump

- `apps/desktop/package.json`: 0.5.1 → 0.5.2
- `apps/desktop/src-tauri/tauri.conf.json`: 0.5.1 → 0.5.2
- `apps/desktop/src-tauri/Cargo.toml`: 0.5.1 → 0.5.2
- `apps/desktop/src/pages/home-page.tsx`: info-doboz „v0.5.1" → „v0.5.2"

### 6) Dokumentáció

- `docs/CHANGELOG.md`: új v0.5.2 bejegyzés (parser-formátumban, broadcast-olható)
- `docs/release-notes-v0.5.2.md`: GitHub release-notes
- `docs/project-tracking/KARTOTEKA-Sprint-N-frissites-letoltes-2026-04-25.md`: ez a fájl

---

## Verifikáció

### Build
```bash
npm run build --workspace=@kartoteka/desktop
```

Eredmény:
- ✅ 68 fájl lint-checked, 0 tiltott import
- ✅ TypeScript hiba nélkül
- ✅ Vite build 3.80s, 2323 modul
- ✅ CSS bundle: 161.68 kB (kissé nőtt — az új panel class-jai)

### Hátralévő lépések
1. `ops/release-build.ps1 -Version "0.5.2" -Notes "..."`
2. `gh release create v0.5.2 --repo endreszocs/kartoteka ...`
3. Manuális teszt egy v0.5.1-en telepített gépen → Beállítások → Frissítés fül → „Letöltés és telepítés" → restart → v0.5.2 fut

---

## Kockázatok és tippek

- **Letöltés-progress chunkLength**: a Tauri `Progress` event-je `chunkLength`-et ad, **nem** `total`-t — a `total` a `Started` event-ben jön. A `FrissitesPanel` ezt helyesen kezeli (state-ben tartja).
- **Restart**: Windows-on a NSIS/MSI installer maga újraindítja az appot. Nem szükséges `@tauri-apps/plugin-process` `relaunch()` hívás. Más OS-en kelleni fog (jövőbeli macOS port esetén).
- **Concurrent check**: a panel guarded — `phase` állapotból indul a check, így nem dobható el felesleges concurrent kérés.

---

## 3-réteg dokumentáció

- ✅ Project log (ez a fájl)
- ✅ CHANGELOG.md (broadcast-olható bejegyzés)
- ⏳ Notion napló — Endre kérésére kerül létrehozásra
