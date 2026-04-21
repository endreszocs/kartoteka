# M3.1 teljesítési jelentés — Első Kartotéka MSI + NSIS installer bundle

**Dátum**: 2026-04-23
**Fázis**: M3.1 — Windows installer bundle generálás
**Kódolási ciklus**: ~30 perc aktív munka + ~25 perc release-build várakozás
**Státusz**: ✅ KÉSZ, 2 telepítő generálva
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

Az M3 (production deploy) fázis első lépése. A Tauri desktop kliens **készen áll
a telepítő-csomagra**. Két Windows-installer formátum (MSI + NSIS) generálódott,
a `icon/icon.png` EREK-templom-ikonnal, magyar ékezetes fájlnévvel.

**Ez még NEM production-ready** — a csomagok **nincsenek aláírva**, a Windows
SmartScreen „Unknown publisher" figyelmeztetést fog mutatni. Az M3.2 ezt oldja
meg self-signed code-sign cert-tel.

---

## 2. Kimeneti fájlok

```
C:\kartoteka-target\release\bundle\
├── msi\
│   └── Kartotéka_0.1.0_x64_en-US.msi       (5.4 MB)
└── nsis\
    └── Kartotéka_0.1.0_x64-setup.exe        (3.9 MB)
```

**Miért két formátum?**
- **MSI**: Microsoft Installer formátum. Enterprise-deploy-ra (Group Policy, SCCM), silent install (`msiexec /i … /quiet`). A nagyobb fájl-méret miatt kevésbé felhasználóbarát, de robosztusabb a deploy-automatikához.
- **NSIS EXE**: Nullsoft Scriptable Install System. Modern wizard-szerű UI, kisebb fájl. Lelkészi gépekre **ezt ajánljuk** — barátságosabb élmény.

A `bundle.targets: "all"` config mindkettőt generálja — nem kell választani.

## 3. Ikon-generálás

Forrás: `icon/icon.png` (628×628, EREK templom-ikon csillaggal, sötétkék háttér).

Parancs:
```bash
cd apps/desktop
npx @tauri-apps/cli icon "../../icon/icon.png"
```

Generált:
- Windows: `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.ico` (multi-resolution), + Windows Store `Square*Logo.png` és `StoreLogo.png`
- macOS: `icon.icns`
- iOS: teljes iOS AppIcon készlet (`icons/ios/`)
- Android: mipmap-hdpi/mdpi/xhdpi/xxhdpi/xxxhdpi készlet (`icons/android/`)

A `tauri.conf.json` `bundle.icon` listája változatlan maradt — a bundler a létező fájlokat használja.

## 4. Build pipeline

```
npm run desktop:build
  └─> npm run tauri build --workspace=@kartoteka/desktop
        └─> tauri build
              ├─> npm run build (Vite prod → apps/desktop/dist/ 510 kB bundle)
              ├─> cargo build --release (Rust release-profile, ~15-20 perc első futás)
              │     ├─> openssl-sys + SQLCipher C kód fordul (vendored-openssl miatt)
              │     ├─> rusqlite + sqlx-sqlite (cache-ből)
              │     ├─> tauri, tauri-runtime-wry, wry, webview2-com
              │     └─> desktop v0.1.0 → desktop.exe (C:\kartoteka-target\release\)
              ├─> MSI bundling (WiX candle.exe + light.exe)
              └─> NSIS bundling (Tauri letölti a NSIS 3.11-et + makensis.exe)
```

**Build-time**:
- Első futás: ~25-30 perc (Rust release-profile + NSIS letöltés)
- Subsequent: **~1-2 perc** (cargo inkrementális + csak a bundler fut)

## 5. Environment követelmények (Endre gépén már megvan)

Az M2.2 build-debug során feltérképeztük:
- Rust 1.95.0 (winget: `Rustlang.Rustup`)
- VS 18 C++ Build Tools
- Strawberry Perl 5.42.2.1 (az OpenSSL build-scripthez)
- NASM (a Strawberry Perl bundler része)
- Node.js + npm
- WebView2 runtime (dev-teszthez)

A `C:\kartoteka-target` target-dir az ASCII-útvonalak miatt kulcsfontosságú — a repo-útban `á` karakter van (`D:\Egyházi APP\…`), ami az OpenSSL build-scriptet összetörte.

## 6. Kipróbálás: lelkészi-élmény előzetes

```powershell
# 1. Telepítő futtatása
Start-Process "C:\kartoteka-target\release\bundle\nsis\Kartotéka_0.1.0_x64-setup.exe"

# 2. Windows SmartScreen megakad ("Windows protected your PC" → Unknown publisher)
#    Megoldás:
#      → "More info"
#      → "Run anyway"

# 3. Telepítő wizard:
#    - Nyelv: English (default, nem lefordítva M3.1-ben)
#    - Telepítési mappa: %LOCALAPPDATA%\Programs\Kartotéka
#    - Start Menu-shortcut: Yes
#    - Finish

# 4. Start menü: "Kartotéka" indítás

# 5. Ugyanaz a Dashboard, mint npm run desktop:dev
#    Figyelem: SAME SQLCipher DB + SAME keyring entry (mindkét build ugyanazt
#    az app-data mappát + Credential Manager-bejegyzést használja, mert ugyanaz
#    az identifier: com.erek.kartoteka)
```

## 7. Mit NEM csináltunk (scope-határok)

- ❌ **Code-signing** — `ops/code-sign-setup.ps1` készen áll, Endre futtatja az M3.2-ben
- ❌ **Aláírt installer** — self-signed cert nélkül a SmartScreen warningol
- ❌ **Magyarra fordítás** az NSIS wizard-en — NSIS `LangFile` config szükséges, M5 előtt (nem sürgős)
- ❌ **Eszköz-bind** (device registration) — M3.3
- ❌ **Auto-update / updater** — M3.4 vagy M5
- ❌ **Uninstall viselkedés** — a jelenlegi default: a telepített fájlokat törli, DE a `%APPDATA%\com.erek.kartoteka` (DB + settings) megmaradhat. Ezt a Tauri config-ban lehet finomítani, M3.3-ban nézem.
- ❌ **MSI silent-install testelés** — `msiexec /i … /quiet` parancs működik elvileg, de nem teszteltük

## 8. Git-status

**Módosult**:
- `.gitignore` — új szakasz: `apps/desktop/src-tauri/target/`, `ops/*.pfx|p12|key|pem`
- `apps/desktop/src-tauri/icons/*` — 17 regenerált ikon-fájl + új `64x64.png`

**Új**:
- `apps/desktop/src-tauri/icons/android/*` — 9 fájl (mipmap-*)
- `apps/desktop/src-tauri/icons/ios/*` — teljes AppIcon-set
- `ops/code-sign-setup.ps1` — M3.2 előkészítő script

**Build-output** (gitignore-olt):
- `C:\kartoteka-target\release\bundle\**` — NEM kerül a repóba

## 9. Kulcs-metrikák

| Mennyiség | Érték |
|---|---|
| MSI méret (uncompressed) | 5.4 MB |
| NSIS EXE méret | 3.9 MB |
| Első release-build idő | ~25 perc |
| Inkrementális release-build idő | ~1-2 perc |
| Vite bundle (JS+CSS) | 568 kB |
| Rust bináris (release) | ~4-5 MB (beágyazva a telepítőkbe) |
| SQLCipher C+OpenSSL bundled (release) | ~3-4 MB |

**Fontos**: a Tauri a WebView2-t nem bundle-eli a telepítőbe default-ban (`webviewInstallMode: "downloadBootstrapper"` az alapértelmezés). Ha offline-telepítést akarunk (a lelkészek gépén nincs net), a `embedBootstrapper` vagy `offlineInstaller` beállítás ~80-200 MB-ra növeli a telepítőt. Ez M5-ben dönthetők el.

## 10. M3 fázis haladási állapot (2026-04-23)

- ✅ M3.1 Első MSI + NSIS bundle (icon, config, szép fájlnév) ← MOST
- ⏳ M3.2 Self-signed code-sign cert → aláírt MSI (nincs SmartScreen warning a saját Windows-usernek)
- ⏳ M3.3 Eszköz-bind: user_devices Supabase-sorhoz csatlakozik a kliens
- ⏳ M3.4 Tauri updater plugin + aláírt manifest (pl. GitHub Releases + Ed25519 key)
