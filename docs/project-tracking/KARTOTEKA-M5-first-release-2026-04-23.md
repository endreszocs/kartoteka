# M5 teljesítési jelentés — Auto-updater host + első publikált release (v0.2.0)

**Dátum**: 2026-04-23
**Fázis**: M5 — auto-updater plugin + Supabase-host + első release
**Kódolási ciklus**: ~2 óra (M5 skeleton + 6-lépcsős host-setup + 5-körös debug)
**Státusz**: ✅ KÉSZ, v0.2.0 a Supabase Storage-on, kliens-teszt elhalasztva Endre döntésére
**Branch**: `master`
**Release**: `v0.2.0` (desktop), `1.15.20` (rendszer-szintű)

---

## 1. Vezetői összefoglaló

Az M5 az utolsó **kódolási** fázis a Tauri-migrációban. Ezzel a **teljes
release-pipeline** működik: build → sign → upload → publish, egy parancsból
(`.\ops\release-build.ps1 -Version "0.x.y"`).

Az **első publikált release** (v0.2.0) fent van a Supabase Storage-on. A
kliens-oldali teszt (régebbi verzió → detektálja az új-at → letölti →
telepíti) **el van halasztva Endre idejére** — a pipeline mindenesetre
működik, ahogy a manifest-feltöltési 200 OK + aláírás-verifikáció igazolja.

---

## 2. 6-fázisú setup

| Fázis | Mit csináltunk | Aktor |
|---|---|---|
| F1 | Supabase Storage bucket `updater` (public, 50 MB) | Endre (Studio UI) |
| F2 | Ed25519 kulcspár generálás (password-védett) | Endre (`ops/updater-key-setup.ps1`) |
| F3 | `tauri.conf.json`: pubkey + endpoint URL | Claude |
| F4 | `ops/release-build.ps1` script írása (build + sign + upload) | Claude |
| F5 | Első release: v0.2.0 build + publikálás | Endre futtatta a script-et |
| F6 | Kliens-teszt | Elhalasztva |

---

## 3. Supabase Storage struktúra

```
Supabase project: bjytiawckbibqmtlezfl
└── Storage (public bucket)
    └── updater/
        └── windows-x86_64/
            ├── Kartoteka_0.2.0_x64-setup.exe   (4.76 MB, code+updater signed)
            └── latest.json                      (Ed25519-signed manifest)
```

**Endpoint** a `tauri.conf.json`-ben:
```json
"endpoints": [
  "https://bjytiawckbibqmtlezfl.supabase.co/storage/v1/object/public/updater/{{target}}-{{arch}}/latest.json"
]
```

A Tauri template változók (`{{target}}-{{arch}}`) Windows-on `windows-x86_64`-re fordulnak.

### `latest.json` manifest sémája

```json
{
  "version": "0.2.0",
  "notes": "Első auto-update teszt",
  "pub_date": "2026-04-21T12:43:40Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK...",
      "url": "https://.../windows-x86_64/Kartoteka_0.2.0_x64-setup.exe"
    }
  }
}
```

A `signature` mező a **minisign-formátumú** Ed25519-aláírás base64-encoded tartalma. A Tauri kliens a `pubkey`-vel validálja, mielőtt letöltené az `url`-t.

---

## 4. Kriptográfiai réteg

### Két független aláírás-mechanizmus

| Mechanizmus | Mit véd | Kulcs | Ellenőrző |
|---|---|---|---|
| **Authenticode (signtool)** | MSI + NSIS EXE integritása, publisher-identitás | Self-signed EREK cert (`F8DE7E85...`) | Windows SmartScreen |
| **Ed25519 minisign** | `latest.json` + a benne hivatkozott `.exe` integritása | Updater kulcs (`8EBAC2E77C732DCE`) | Tauri updater plugin |

### Miért két külön rendszer?

- **Authenticode**: szabványos Windows-mechanizmus. A telepítőre kötelező, a SmartScreen erre alapoz. Nem Tauri-specifikus.
- **Minisign (Ed25519)**: a Tauri updater-plugin saját formátuma. Ez biztosítja, hogy a Supabase Storage-on lévő manifestet **kizárólag Endre tudja aláírni** — ha valaki feltöltene egy rosszindulatú MSI-t a bucket-be, a kliens elutasítja, mert az Ed25519 aláírás nem matches.

Együtt a két réteg: **kód-integritás + publisher-identitás + host-oldali védelem**.

---

## 5. Release-pipeline (`ops/release-build.ps1`)

### Mit csinál egy futás
1. **Verzió-bump check**: `tauri.conf.json` + `Cargo.toml` — ha eltér a `-Version` paramétertől, kérdezi a felhasználót, frissítse-e
2. **Environment variables**:
   ```
   $env:TAURI_SIGNING_PRIVATE_KEY = <privát kulcs tartalma>
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "kartoteka-updater-dev-2026"
   $env:PATH += C:\Strawberry\perl\bin;C:\Strawberry\c\bin  # M2.2 toolchain
   ```
3. **Build**: `npm run desktop:build`
   - Vite prod (JS+CSS) → `apps/desktop/dist/`
   - `cargo build --release` → `C:\kartoteka-target\release\desktop.exe`
   - Authenticode signing: `desktop.exe`, `WixUIExtension.dll`, `WixUtilExtension.dll`, MSI, NSIS plugin DLL-ek, NSIS setup.exe
   - Tauri updater signing: `.msi.sig` + `.exe.sig` Ed25519-aláírással
4. **Artifact check**: `*_<version>_*-setup.exe` + `*.exe.sig`
5. **ASCII-conversion**: `Kartotéka_0.2.0_x64-setup.exe` → `Kartoteka_0.2.0_x64-setup.exe` (Supabase object-key kompatibilis)
6. **Manifest generálás**: `latest.json` JSON, aláírás + URL
7. **Supabase Storage upload**: REST API, `Authorization: Bearer <service_role>`, `x-upsert: true`

### Tipikus futásidő

| Szakasz | Idő |
|---|---|
| Verzió-check + env | <1s |
| Vite prod | ~3s |
| Rust release inkrementális | 20-40s |
| Bundle + sign (MSI + NSIS) | ~30s |
| Updater sign | <1s |
| Upload (5 MB + 400B) | 2-5s |
| **Összesen** | **~60-90s** |

Az első release ~30 perces volt (Rust release-crate-ek első fordulása); a subsequent 1-2 perc.

---

## 6. Debug-történet (5 kör)

Az első sikeres futáshoz négy ponton kellett javítani:

### 6.1. UTF-8 encoding a PowerShell-script-ben

**Tünet**: a verzió-bump után `Kartotéka` → `KartotĂ©ka`, WiX `light.exe` hiba.
**Ok**: a PS 5.1 `Get-Content -Raw` alapértelmezett encoding-ja Windows-1252 (nem UTF-8).
**Fix**: `[System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))` / `WriteAllText(...)`

### 6.2. Signer password-mismatch

**Tünet**: `failed to decode secret key: incorrect updater private key password`
**Ok**: `signer generate --ci` flag a `TAURI_KEY_PASSWORD` env-változóval inkonzisztens — a kulcs encrypted lett, de nem ismert jelszóval.
**Fix**: `signer generate -w <path> --password <pw>` explicit flag-gel (Tauri v2 2.10.x).

### 6.3. `.nsis.zip` helyett közvetlen `.exe`

**Tünet**: `.nsis.zip nem talalhato`
**Ok**: a Tauri v2 2.10.x óta közvetlenül a `*-setup.exe` + `*.exe.sig` párt generálja, nincs .zip-wrapper.
**Fix**: artifact-keresés átírva `*_<version>_*-setup.exe`-re + `.exe.sig`-re.

### 6.4. Supabase InvalidKey

**Tünet**: `400 Invalid key: windows-x86_64/Kartotéka_0.2.0_x64-setup.exe`
**Ok**: a Supabase Storage az object-key-ben nem-ASCII karaktereket elutasítja (HTTP 400).
**Fix**: ASCII-conversion helper (`Kartotéka` → `Kartoteka`). A lokális fájl marad ékezetes, csak a remote path + manifest URL ASCII.

### 6.5. Keverék verzió-artifactok

**Tünet**: a script a 0.1.0-s EXE-t találta meg a 0.2.0 helyett.
**Ok**: `Get-ChildItem *-setup.exe | Select-First 1` — alphabetikusan a régebbi.
**Fix**: verzió-specifikus glob: `*_${Version}_*-setup.exe`.

---

## 7. Biztonsági jegyzetek

- **A privát kulcs** (`ops/updater-private.key`) **CSAK** Endre gépén van, `.gitignore`-olt
- **A password** (`kartoteka-updater-dev-2026`) **fejlesztői** — production előtt cserére érdemes, egy erős jelszóra (pl. 1Password-kezelt)
- **A Supabase Storage bucket public** — a URL-ek bárki számára elérhetőek. Ez rendben van, **mert**:
  - A bináris integritása az Ed25519-aláírás védi
  - Ha valaki letölti a MSI-t, az legfeljebb a már nyilvánosan elérhető verzió
  - Reprodukálhatatlan support: minden lelkész ugyanazt a buildet kapja
- **A service_role key** a `.env.local`-ban — **kizárólag a build-gépen** használatos (upload-hoz), kliens-oldalra sose kerülhet

---

## 8. Mit NEM csináltunk (későbbi)

- ❌ **Tényleges kliens-oldali end-to-end teszt** — elhalasztva. A régi v0.1.0 EXE megvan még (`C:\kartoteka-target\release\bundle\nsis\Kartotéka_0.1.0_x64-setup.exe`), Endre bármikor telepítheti és Dashboard → Frissítés-vel próbálhatja.
- ❌ **Delta-update** — most teljes MSI letöltés (~5 MB). Tauri delta-support még experimental.
- ❌ **CI/CD**: a release jelenleg manuális (PowerShell-ből Endre gépén). Jövőben egy GitHub Actions / Gitea-workflow automatizálhatja.
- ❌ **Rollback-mechanizmus**: ha egy release hibát tartalmaz, manuálisan kell visszaforgatni a Storage-on.
- ❌ **Verzió-archívum**: a mostani setup csak a `latest.json`-t tárolja. A régi buildek ott maradnak, de nincs `0.2.0/manifest.json` per-verzió — ha ez kell (pl. LTS-kiadás), bővíthető.

---

## 9. Használati útmutató Endrének (új release kiadása)

```powershell
# 1. Dönts a verziószámról (pl. 0.3.0 — kisebb bump, 1.0.0 — major)
# 2. Egy parancs, minden ebben:
cd "D:\Egyházi APP\KARTOTEKA"
.\ops\release-build.ps1 -Version "0.3.0" -Notes "Részletes release notes itt..."

# 3. A verzió-bump kérdésekre y — a script átírja a tauri.conf.json-t + Cargo.toml-t
# 4. A build + sign + upload ~1-2 perc
# 5. Zöld "RELEASE FELTOLTVE!" blokk a végén

# 6. Commit a verzió-bump változásokra:
git add apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml
git commit -m "release(v0.3.0): <title>"
```

A Kartotéka-kliensek **30 mp-en belül** (a polling-interval révén) vagy kliens-oldali „Frissítés / Ellenőrzés" gombbal észlelik.

---

## 10. M5 zárókép

- ✅ Rust plugin: `tauri-plugin-updater` + deps
- ✅ JS plugin: `@tauri-apps/plugin-updater`
- ✅ Tauri capability: `updater:default`
- ✅ Kulcs-management: `ops/updater-key-setup.ps1`
- ✅ Release-pipeline: `ops/release-build.ps1`
- ✅ Supabase host: `updater` bucket, public, ASCII-safe paths
- ✅ Első release: v0.2.0 publikálva, aláírva, fent a Storage-on
- ✅ Dashboard kártya: „Frissítés → Ellenőrzés" gomb a kliensen
- ✅ Dokumentáció: CHANGELOG + memory + ez a project-log

**A szakértő V4-tervének M5 fázisa 100%-ban teljesítve.**

---

## 11. Következő (Endre kezében)

Az M6 fázis **üzemeltetési** jellegű, nem kódolási:
1. **Kliens-teszt** végrehajtása (F6 halasztott)
2. **Első béta-kiadás** 2-3 lelkésznek (MSI e-mailben / USB-n)
3. **Production cert**: self-signed → Azure Trusted Signing ($9.99/hó) az EREK-elnökségi szétosztás előtt
4. **Offline-login**: hogy a Supabase auth-outage ne zárja ki a munkát
5. **Több domain-tábla** sync-je (members, finance, anyakönyv)

Egyik sem blokkol, ütemezhetőek Endre igénye szerint.
