# Kartotéka — `public/downloads/` mappa

Ez a mappa a webappból statikusan elérhető segédfájlokat tartalmaz.

## Elérhető fájlok

| Fájl | Célja | Mikor futtatandó |
|------|-------|------------------|
| [`install-resend.bat`](./install-resend.bat) | Resend email szolgáltató telepítése | Ha broadcast email kézbesítést szeretné |

**Scripteket csak a fejlesztői gépen futtasd**, ott ahol a Kartotéka forráskódja van.

---

## Asztali alkalmazás — NEM innen!

A Kartotéka desktop alkalmazás **NEM** ebből a mappából tölthető le. A `/offline`
oldal letöltés-kártyája közvetlenül a **GitHub Releases**-ről szolgál ki:

- Release-oldal: <https://github.com/endreszocs/kartoteka/releases>
- API endpoint: `https://api.github.com/repos/endreszocs/kartoteka/releases/latest`

Miért így:

- A Railway build nem duzzasztja 15-30 MB-os binárisokkal
- GitHub CDN gyors
- Natív verzió-kezelés (git-tag → release)
- Release-notes natívan a lelkésznek
- Multi-platform: ha később macOS/Linux build is kell, csak új asset

### Release-flow (Windows PowerShell)

Minden új verzió kiadásakor:

```powershell
# 1. Build
npm run desktop:build

# 2. A telepítő kb. itt lesz (verzió szerint változik):
#    apps\desktop\src-tauri\target\release\bundle\nsis\kartoteka_0.3.1_x64-setup.exe

# 3. GitHub Release létrehozása + asset + release-notes
gh release create v0.3.1 `
  "apps\desktop\src-tauri\target\release\bundle\nsis\kartoteka_0.3.1_x64-setup.exe" `
  --title "Kartotéka 0.3.1" `
  --notes "Mi újság:
- Tag szerkesztés a desktopon (név, cím, kontakt, admin-jelzők)
- Új tag felvétel offline-is (CNP-validáció)
- Rejtés / visszahozás a listából
- Egyéb javítások

Részletek: https://github.com/endreszocs/kartoteka/blob/main/docs/CHANGELOG.md"
```

A `/offline` oldal a következő megnyitáskor **automatikusan** észleli az új
release-t (GitHub API fetch) — a lelkész egy kattintással letöltheti.

### Verzionás konvenció

- **Tag-formátum**: `v<major>.<minor>.<patch>` (semver)
- **Release-név**: `Kartotéka <verzió>` (pl. `Kartotéka 0.3.1`)
- **Release-notes**: magyar, pasztorális, rövid (mi változott lelkész szempontból)
- **Asset-név**: a Tauri NSIS-bundler adja — `kartoteka_<verzió>_x64-setup.exe`

A `DesktopDownloadCard` az asset-neveket regex-re szűri (`.exe` > `.msi`),
a `.sig` / `.sha256` / `.txt` / `.json` asseteket figyelmen kívül hagyja.

### Pre-release

Ha egy next-major előkészület közben nem akarod, hogy a lelkészek
automatikusan lássák, használd a `--prerelease` flaget:

```powershell
gh release create v0.4.0-beta.1 "..." --prerelease --notes "Béta, ne használd éles gyülekezetben"
```

A `/releases/latest` API endpoint a pre-release-eket **kizárja** — a lelkész
csak az utolsó stabil verziót látja.

### Jövőbeli polish: Tauri auto-updater

A Tauri v2 beépített auto-updater-rel érkezik (`apps/desktop/src/lib/updater.ts`).
Ha ez aktiválva van:

- A lelkész **csak az első telepítést** végzi manuálisan a `/offline` oldalon
- Minden **további frissítést** a Kartotéka maga tölt le (GitHub Releases-ből)
- "Új verzió" értesítés → "Frissítés most" gomb → újraindítás

Ez lesz a következő polish-lépés (külön session).

### `.gitignore`

A `*.exe|*.msi|*.dmg|*.AppImage|*.deb|*.rpm` ki van zárva ebből a mappából
— a GitHub Releases a source-of-truth, nem a repo.
