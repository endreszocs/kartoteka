# KARTOTEKA — `/offline` oldal újragondolása + desktop-letöltés

**Dátum**: 2026-04-24
**Státusz**: ✅ KÉSZ — a lelkész `/offline` oldalán most a desktop app letöltése a központban, a korábbi 6-fázisos diagnosztika külön `/offline/diagnostika` route-ra került (admin-only).

## Mi változott

Az eddigi `/offline` oldal a webes PWA Dexie-alapú offline rétegének 6-fázisos diagnosztikáját jelenítette meg (KPI dashboard + cache-overview + mutation queue + Excel export + Excel import link + teljes backup + help + developer downloads). Ez sok fejlesztés-alatti panelt tartalmazott, és zsúfolt volt a napi lelkészi munkához.

A Tauri desktop megjelenésével (A-M6.x óta) a lelkész igazán **offline-elsődleges** verziója a desktop alkalmazás — az `/offline` oldal fő feladata most az, hogy **letöltse**.

## Új szerkezet

### `/offline` (fő oldal) — **pasztorális, egyszerű**

1. **Hero**: "Dolgozz interneten kívül is" — 3 pill (Desktop app, PWA böngésző, Automatikus szinkron)
2. **DesktopDownloadCard**: nagy violet kártya
   - Monitor ikon + cím "Kartotéka asztali alkalmazás"
   - Nagy letöltés-gomb (violet) `→ /downloads/kartoteka-setup.exe`
   - Verzió (ha van `kartoteka-setup-version.txt`), fájlméret (HEAD content-length), platform
   - 3-állapot: `checking` (spinner) → `available` (gomb) / `unavailable` (amber "Készülőben") / `error`
   - 4 pont: "Offline-elsőség", "Gyors és csendes", "Saját PIN-kóddal", "Ugyanaz az adatkör"
3. **BrowserOfflineCard**: sky kártya
   - Wifi-ikon + online-állapot badge (zöld/amber navigator.onLine)
   - 3-lista mi látható/szerkeszthető offline módban, + automatikus szinkron leírás
   - Tipp-sáv: mikor válassz desktopot
4. **Diagnosztika-link** (admin-only): finom border-kártya, `Wrench` ikonnal, nyíllal, → `/offline/diagnostika`

### `/offline/diagnostika` (új route, admin-only)

A régi `/offline` tartalma — minden eddigi panel **érintetlenül** átkerült:
- `OfflineDashboardStats` — KPI dashboard
- `ExcelExportPanelClient` + `MutationQueuePanel` — 2-oszlopos
- `ExcelImportLinkCard` — Excel import review link
- `FullBackupPanelClient` — teljes ZIP backup
- `CacheOverview` — cache táblák listája
- `DeveloperDownloadsCard` — fejlesztői letöltések
- `OfflineHelpCard` — összecsukható súgó

**Auth-gate**: ha nem admin / master / egyházkerületi admin → `redirect('/offline')`.

## Desktop letöltés infrastruktúra

### `apps/web/public/downloads/`

Új Next.js statikus mappa. Fájlok:
- `kartoteka-setup.exe` — **a Tauri build outputja** (kézzel bemásolva)
- `kartoteka-setup-version.txt` — egy soros text a legfrissebb verzióhoz
- `README.md` — utasítás a build-hez + másoláshoz (Windows PowerShell)
- `.gitkeep` — hogy a mappa git-ben legyen

**`.gitignore` bővítve**: `apps/web/public/downloads/*.exe|*.msi|*.dmg|*.AppImage|*.deb|*.rpm` — a 15-30 MB-os binárisok NEM kerülnek git-be. Csak a README és a version.txt.

### Build-flow (user gép, Windows)

1. `npm run desktop:build` → `apps/desktop/src-tauri/target/release/bundle/nsis/kartoteka_*_x64-setup.exe`
2. `Copy-Item ... apps/web/public/downloads/kartoteka-setup.exe`
3. `"0.3.1" | Out-File -Encoding utf8 apps/web/public/downloads/kartoteka-setup-version.txt`
4. Commit + push → Railway új build → az új `/downloads/kartoteka-setup.exe` érhető el publikusan

### Jövőbeli polish

- **GitHub Releases** — ha nő az érdeklődés, a signed MSI-t a GitHub-ra uploadoljuk, és a Railway-n csak egy CDN-redirect marad
- **Multi-platform** — most csak Windows; a Tauri macOS/Linux build-jét később ide (`.dmg`, `.AppImage`)
- **Release-notes** az oldalra — külön `version-history.json`-ból olvasva

## Fájlváltoztatások

### Új

- `apps/web/app/(dashboard)/offline/page.tsx` — teljes újraírás (~65 sor; a régi 96 sor)
- `apps/web/app/(dashboard)/offline/diagnostika/page.tsx` — a régi tartalom + admin-guard
- `apps/web/components/offline/desktop-download-card.tsx` — új komponens (~190 sor), 3-állapot + fetch HEAD + version.txt
- `apps/web/components/offline/browser-offline-card.tsx` — új komponens (~75 sor), online-state badge
- `apps/web/public/downloads/README.md` — build + másolás utasítás
- `apps/web/public/downloads/.gitkeep` — hogy a mappa git-ben legyen
- `docs/project-tracking/KARTOTEKA-offline-oldal-ujraepites-2026-04-24.md` — ez a doksi

### Módosított

- `.gitignore` — a `public/downloads/*.exe|*.msi|*.dmg|...` hozzáadva
- `docs/CHANGELOG.md` — `/offline` újratervezés bejegyzés

**A Dexie-alapú diagnosztika komponenseket NEM ÉRINTETTEM** — mind megmarad a `/offline/diagnostika` route-on, ha a user a fejlesztői nézetet akarja.

## User-story

- **Lelkész**: megnyitja `/offline` → azonnal látja a desktop letöltés-gombot + magyarázatot miért desktop. Rákattint, letölti, felinstallálja. A böngésző-offline mód tippszerű oldalon ismerheti meg.
- **Admin / master / egyházkerületi admin**: ugyanezt látja + alul egy finom link a "Fejlesztői diagnosztika" oldalra — ahol mindent megtalál amit eddig is.
