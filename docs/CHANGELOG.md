# Kartotéka — Változásnapló

A Kartotéka rendszer változásainak (javítások, új funkciók, fejlesztések) időrendi dokumentációja.
Az admin oldalon ezek a bejegyzések broadcast üzenetként elküldhetők a felhasználóknak.

Formátum (minden bejegyzés):

```
## [YYYY-MM-DD] — Rövid összefoglaló
<!-- key: YYYY-MM-DD-rovid-azonosito -->
<!-- category: bugfix | feature | improvement | security | breaking -->
<!-- version: optional release verzió -->
<!-- targets: audience rövid leírás -->

### 🔒 Biztonsági javítások / 🐛 Javítások / ✨ Új funkciók / 🎨 UX javítások

- **Címsor**: részletesebb leírás
- **Címsor 2**: részletesebb leírás
```

A `key` mező egyedi azonosító (slug) — ez a `system_broadcasts.release_changelog_key` értéke lesz.
Az admin felületen a még nem broadcast-olt bejegyzések "Közzététel" gombbal küldhetők.

---

## [2026-04-23] — M5: Auto-updater skeleton (tauri-plugin-updater)

<!-- key: 2026-04-23-m5-updater-skeleton -->
<!-- category: improvement -->
<!-- version: 1.15.19 -->
<!-- targets: fejlesztő -->

### ⬆️ A Kartotéka desktop most már **képes saját magát frissíteni**

**Skeleton-setup**: a kód kész, a host-oldal (manifest URL + új verzió feltöltése) még nem — ez az első éles verzió-release előtt kerül beállításra. Addig a gomb „Ellenőrzés" hibát fog dobni (placeholder pubkey).

**Új Rust dep**:
- `tauri-plugin-updater v2` (hozza: `reqwest`, `hyper-rustls` — mind pure-Rust)

**Új npm dep**:
- `@tauri-apps/plugin-updater v2`

**Új Tauri capability**: `updater:default` a `capabilities/default.json`-ben

**`tauri.conf.json` frissítés:**
```json
{
  "plugins": {
    "updater": {
      "pubkey": "UPDATER_PUBKEY_PLACEHOLDER_BYGENSCRIPT",
      "endpoints": [
        "https://updates.kartoteka.hu/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true,
    ...
  }
}
```

A `createUpdaterArtifacts: true` azt jelenti, hogy a `npm run desktop:build` mostantól generál egy **`.nsis.zip`** fájlt is az MSI + NSIS EXE mellé — ezt tölti le az auto-updater.

**Új TS modul** (`apps/desktop/src/lib/updater.ts`):
- `checkForUpdates()` → `{ available, version, releaseDate, notes, error, handle }`
- `downloadAndInstall(handle, onProgress)` → `{ success, error }`

**Dashboard bővítés**: új **„Frissítés"** kártya a lap tetején:
- „Ellenőrzés" gomb — ellenőrzi, van-e új verzió
- Ha van: megjelenik a verzió-szám + release dátum + release notes (ha a manifest tartalmazza)
- „Letöltés és telepítés" gomb — progress-kiírás (X%), telepítés után az app restart-ol

**Új PS script** (`ops/updater-key-setup.ps1`):
- Ed25519 kulcspár generálás a `cargo tauri signer generate` paranccsal
- A privát kulcs `ops/updater-private.key`-be kerül (gitignore-olt)
- A publikus kulcs `.pub` fájlba és kiírva — Endre bemásolja a `tauri.conf.json`-be, felülírva a `UPDATER_PUBKEY_PLACEHOLDER_BYGENSCRIPT`-et

**Host-döntés — még Endre előtt**:

Az auto-updater egy **aláírt JSON manifest**-et kér egy HTTP endpoint-ról. Két népszerű host:

| Opció | Előny | Hátrány |
|---|---|---|
| **GitHub Releases** | Ingyenes, verzió-kezelés benne, CI-integráció könnyű | Nyilvános URL (bár privát repo is megy tokennel) |
| **Supabase Storage** | Már van Supabase account, EU-hosting, GDPR-biztos | Signed URL-ek kicsit bonyolultabbak |
| **Saját CDN / kartoteka.hu** | Teljes kontroll | Üzemeltetési költség (~$5/hó) |

**Javaslat**: **Supabase Storage** (EU-szervereken, már része az infrastruktúránknak). Egy privát bucket, signed URL-lel a manifest-hez.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 40 s (új reqwest + hyper-rustls crate-ek, mind pure-Rust)
- ✅ `npm run desktop:build` (Vite): 521 kB JS (+6 kB updater.ts + UI), 57 kB CSS, 5.19 s

**Következő lépések Endre felé (amikor új release kell):**

1. **Egyszer**: futtasd az `ops/updater-key-setup.ps1`-et → Ed25519 keypair generálódik
2. Másold a publikus kulcsot a `tauri.conf.json`-be
3. Dönts a host-ról (Supabase Storage a javaslatom)
4. A `npm run desktop:build` előtt:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ops\updater-private.key -Raw
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "kartoteka-updater-dev-2026"
   npm run desktop:build
   ```
5. Az output `.nsis.zip`-et + az aláírás-hash-t tedd a host-ra, a manifest-et generáld le
6. Az appban a „Frissítés / Ellenőrzés" gombra kattintva a kliens letölti

---

## [2026-04-23] — M4.1 + M4.2: Restore-gomb + revoke/restore email-értesítés

<!-- key: 2026-04-23-m4-polish -->
<!-- category: improvement -->
<!-- version: 1.15.18 -->
<!-- targets: rendszergazda, lelkészek -->

### 🔄 Az admin feloldhatja a revoke-ot, és minden átkapcsolásról email megy a user-nek

**Az M4 két hiányzó darabját pótolja:**
1. A revoke-olt eszközök **visszaállíthatók** a web admin UI-ról (eddig csak manuális SQL UPDATE)
2. Mind a revoke-ról, mind a restore-ról **automatikus email** megy a user-nek (Brevo-n át)

**Új server action** (`apps/web/app/(dashboard)/admin/devices-licenses-actions.ts`):
- `restoreDevice({ id })` — `UPDATE revoked=false, revoked_by=null, revoked_at=null, revoke_reason=null`
- Biztonsági check: már visszaállított eszközt nem dupla-state-elünk
- Audit-log: `action='device.restore'`
- Email: `deviceRestoredEmail` (emerald színű, „Eszköz újra aktív")

**revokeDevice action bővítve**:
- A revoke előtt lekéri a user-info-t (`profiles.email, full_name`) és az eszköz-nevet
- Revoke után `deviceRevokedEmail` — rose/destruktív színű template, benne: eszköznév, platform, időpont, indok
- Ha az email-küldés hibára fut, a revoke-ot attól nem görgetjük vissza (a security fontosabb)

**Új email-sablonok** (`apps/web/lib/email/templates/device-revoke.ts`):
- `deviceRevokedEmail({ email, fullName, deviceName, platform, reason, revokedAtIso })`
- `deviceRestoredEmail({ email, fullName, deviceName, platform, restoredAtIso })`
- Stílus: ugyanaz mint az access-request template-ek (max-width: 600px, Cormorant Garamond cím, colored accent badge)
- Hangvétel: egyházi-pásztori, „Áldott napot kíván"-zárlattal

**UI bővítés** (`apps/web/components/admin/devices-licenses-tab.tsx`):
- A **revoke-olt sorokon** most a piros „Revoke" helyett zöld „Visszaállít" gomb jelenik meg
- A gomb `title` attribútuma a revoke indoklását mutatja hover-en (tooltip)
- Megerősítés: confirm() dialog a restore előtt is (UX-biztonság)
- Toast-okban jelezve, hogy a user email-ben értesítve

**Új audit-action label** a shared.ts-ben:
- `'device.restore': 'Eszköz visszaállítva'` (a Napló-fülben magyarul jelenik meg)

**Teljes revoke/restore flow most:**

```
[Admin a web-en klikkel Revoke]
    ↓
UPDATE user_devices SET revoked = true, revoke_reason, ...
    ↓
INSERT audit_log (device.revoke, metadata = { reason })
    ↓
sendEmail(deviceRevokedEmail) → Brevo → user inbox
    ↓
[Desktop kliens 30 mp-en belül észleli — M4 core]
    ↓
alert() + signOut() + redirect /login
```

```
[Admin klikkel Visszaállít]
    ↓
UPDATE revoked = false, revoke_* = null
    ↓
INSERT audit_log (device.restore)
    ↓
sendEmail(deviceRestoredEmail) → user inbox
    ↓
[A user újra bejelentkezhet az eszközön]
```

**Verify:**
- ✅ `npx tsc --noEmit` (apps/web): 0 hiba
- ✅ `npm run build` (Next.js prod): SUCCESS, 50+ route generált

**Kipróbálás:**
1. Desktop-on login → „Ez az eszköz" aktív
2. Web-en `/admin` → Eszközök → **Revoke** → indoklás
3. Email érkezik (nézd a Brevo log-ot vagy az inboxot)
4. Desktop 30 mp-en belül kijelentkezik
5. Web-en **Visszaállít** → confirm dialog → megerősítés
6. Újabb email (restored)
7. Desktop: újra login működik

Ezzel az M4 minden része **teljes + éles**. Az M0.5-ben lerakott devices-licenses UI minden funkcióját használjuk, és az email-flow teljes.

---

## [2026-04-23] — M4: Admin revoke + desktop auto-logout

<!-- key: 2026-04-23-m4-admin-revoke -->
<!-- category: security -->
<!-- version: 1.15.17 -->
<!-- targets: fejlesztő, rendszergazda, lelkészek (közvetve) -->

### 🚫 Az admin bármikor visszavonhatja egy eszköz hozzáférését

**A webes oldali admin felület már az M0-ban elkészült** (`devices-licenses-tab.tsx`), csak most vált élessé az M3.3 eszköz-bind bevezetésével. Az M4 a **desktop-oldali detektálást** adja hozzá: ha az admin a web-ről revoke-ol egy eszközt, a kliens 30 másodpercen belül észleli és automatikusan kijelentkezik.

**Webes admin felület** (`/admin/devices-licenses`):
- Három sub-tab: **Eszközök, Licencek, Napló**
- **Eszközök** tab:
  - Táblázat: Felhasználó (email + név), Eszköz (név + fingerprint), Platform, Regisztrálva, Utolsó aktivitás, Státusz, Művelet
  - **Revoke gomb** → kötelező indoklás → UPDATE `revoked = true, revoked_by, revoked_at, revoke_reason`
  - Auto-audit: `audit_log.action = 'device.revoke'` → azonnal bekerül a Napló-fülbe

**Desktop kliens — új detektor** (`apps/desktop/src/lib/device.ts`):
- `checkDeviceRevokeState(userId)` — Supabase SELECT a saját eszközre (user_id + fingerprint)
- Visszatérés: `{ known, revoked, reason, revokedAt, deviceRowId }`
- Hibatűrő: ha a Supabase nem elérhető, `known: false` — a kliens nem jelentkezik ki tévedésből

**Dashboard integráció**:
- Új useEffect login után: **azonnali** ellenőrzés + **30 másodperces periodikus poll**
- Ha `revoked === true`:
  1. `alert(...)` a user-nek — a revoke indoklása kiírva
  2. `supabase.auth.signOut()`
  3. `navigate('/login', { replace: true })`

**Biztonsági modell:**
- Az admin revoke-ot nem tudja bypass-olni a kliens (RLS + server-oldali check)
- A desktop-oldali polling csak **UX-javítás** — a user egyébként is sign-out-ra kényszerül, amint a Supabase auth-session-je elévül
- A revoke **audit-trail**-elt: `audit_log` táblába kerül `action='device.revoke'` + metadata (reason)

**Kipróbálási forgatókönyv:**
1. Desktop: `npm run desktop:dev` → login → „Ez az eszköz" kártyán látszik, hogy aktív
2. Böngésző: `/admin` → Eszközök tab → saját eszköz → Revoke → indoklás („teszt")
3. Desktop: 30 mp-en belül **alert** jelenik meg: „Ezt az eszközt a rendszergazda visszavonta. Indok: teszt. A kliens automatikusan kijelentkezik."
4. Az alert után: login-oldalra redirect
5. Ha újra bejelentkezne, a Dashboard azonnal detektálja a revoke-ot és megint kidobja
6. Admin a web-en **Restore** (ha majd hozzáadjuk — most manual UPDATE a Studio-ban: `UPDATE user_devices SET revoked = false WHERE id = '…'`)

**Mi nem része az M4-nek (későbbi):**
- **Soft-restore gomb** az admin UI-n (most csak revoke van)
- **Tömeges revoke**: az összes user eszköze egy lépésben (pl. ha a user maga is revokolódott)
- **Email-értesítés a user-nek** a revoke-ról (a user már látja az alert-et, de email is jó lenne)
- **Gépen-aktív revoke**: jelenleg 30 sec polling a leggyorsabb. Supabase Realtime subscription-nel (`postgres_changes`) pillanatnyi lehetne — későbbi optimalizáció
- **Eszköz-átnevezés** (device_name frissítés) — szép UX, de nem biztonsági

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build`: 516 kB JS (+1 kB polling glue), 57 kB CSS, 3.40 s
- Web-oldal nem változott (az M0 óta már tesztelt)

**Ezzel az M4 teljes**. A teljes szakértő-ajánlás V4 szinte teljes — a hátralevő M5 (auto-updater), M6 (béta-tesztelés) már üzemeltetési fázisok.

---

## [2026-04-23] — M3.3: Eszköz-bind — Ed25519 keypair + user_devices regisztráció

<!-- key: 2026-04-23-m3-3-device-bind -->
<!-- category: security -->
<!-- version: 1.15.16 -->
<!-- targets: fejlesztő, lelkészek (közvetve) -->

### 🔐 Minden eszköz saját azonossága — admin-revoke előkészítés

**A webes működést nem érinti közvetlenül.** A desktop kliens az első indításkor egy saját **device_id-t + Ed25519 keypairt** generál a Rust oldalon, és regisztrálja a Supabase `user_devices` táblába. A privát kulcs az OS-szintű keyringben marad (Windows DPAPI), a publikus kulcs a Supabase-ben.

**Ez az alap a következő biztonsági szintekhez**:
- **Admin-revoke**: az egyházkerületi admin bármikor visszavonhatja egy eszköz hozzáférését (M4 UI)
- **Aláírt outbox-payload**: a user saját privát kulcsával írhat alá — a szerver ellenőrzi (M4)
- **E2E doc-titkosítás**: a publikus kulcs a doc-kulcs wrap-olásához (M4 dokumentumtár)

**Új Rust modul** (`apps/desktop/src-tauri/src/device.rs`):
- `load_or_create_device()` — idempotens: első alkalommal generál, utána keyringből olvas
- `#[tauri::command] device_info()` — a frontend invoke-ja

**Új Rust deps** (mind pure-Rust, nincs új C-build):
- `machine-uid v0.5` — hardware-fingerprint (Win registry MachineGuid / macOS / Linux)
- `ed25519-dalek v2` (`rand_core` feature) — keypair + signing
- `base64 v0.22` — serializálás

**Új TS modul** (`apps/desktop/src/lib/device.ts`):
- `getDeviceInfo()` — Rust invoke
- `ensureDeviceRegistered(userId)` — idempotens Supabase INSERT / last_seen UPDATE
- `getMyDevices(userId)` — lekéri az összes regisztrált eszközt
- A publikus kulcs base64 → hex konverzió a `bytea`-oszlophoz

**Új Dashboard-kártya**: „Ez az eszköz"
- Device ID, hardware fingerprint, publikus kulcs (base64)
- Platform + „most generálva" jelzés
- Táblázat: az összes regisztrált eszköz (platform, név, regisztráció, utolsó aktivitás, státusz — aktív/visszavonva)
- Auto-registration a login után

**Biztonsági állapot:**
- ✅ A privát kulcs **SOHA** nem hagyja el az eszközt
- ✅ Az adatbázis `user_devices.public_key` nem elegendő impersonálásra
- ✅ A `device_fingerprint` + `user_id` UNIQUE kombináció — dupla regisztráció elkerülve
- ✅ RLS: `users_register_own_devices` (WITH CHECK `user_id = auth.uid()`) már megvan (M0)
- ⚠️ Egyelőre a signing-használat nem éles (M4 feladat) — a kulcs most „alvó", de készen áll

**Verify:**
- ✅ `npx tsc --noEmit`: 0 hiba
- ✅ `cargo check`: 29.8 s (3 új pure-Rust crate)
- ✅ `npm run desktop:build` (Vite prod): 515 kB JS (+5 kB), 57 kB CSS, 3.17 s

**Kipróbálás:**
1. `npm run desktop:dev` → login → Dashboard
2. Új „Ez az eszköz" kártya jelenik meg
3. Első indításkor: „Eszköz regisztrálva a rendszerben." (zöld)
4. A táblázat mutatja az eszközt (platform=windows, név pl. „Win32", aktív)
5. Supabase Studio-ban ellenőrizhető: `SELECT * FROM user_devices WHERE user_id = '…'` — 1 sor

**Következő (M3.4)**: Tauri updater plugin + aláírt manifest. Az MVP-hez optional — lehet az M3-t lezárni az M3.3-mal is, és átugrani az M5-re, ha Endre úgy dönti.

---

## [2026-04-23] — M3.2: Aláírt MSI + NSIS bundle (self-signed code-sign cert)

<!-- key: 2026-04-23-m3-2-self-signed -->
<!-- category: security -->
<!-- version: 1.15.15 -->
<!-- targets: fejlesztő -->

### 🔏 A Windows installer bundle-k most már **digitálisan aláírtak**

**A webes működést nem érinti.** Az M3.1-es bundle-k még `Unknown publisher`-rel kerültek ki. Az M3.2 óta mindent aláír a Tauri bundler (`signtool.exe`) egy self-signed code-sign cert-tel, és a timestamp is rákerül (DigiCert TSA) — így az aláírás **a cert lejárta után is érvényes marad**.

**Mit csináltunk:**

1. **`ops/code-sign-setup.ps1` futtatása** (Endre egyszer):
   - Self-signed cert generálása: RSA-2048, SHA-256, 3 év érvényesség
   - Subject: `CN=EREK Kartoteka Developer, O=Baratosi Reformatus Egyhazkozseg, C=RO`
   - PFX export: `ops/kartoteka-codesign.pfx` (gitignore-olt)
   - Registrálás mindhárom cert-store-ba: `CurrentUser\My` (a privát-kulcshoz), `TrustedPublisher` (SmartScreen belső-gép), `Root` (Get-AuthenticodeSignature `Valid`)
   - Thumbprint: `F8DE7E854FF9E9DBA9CBD183F79B3F9753A87CE3`

2. **`tauri.conf.json` bővítés** — `bundle.windows` szekció:
   ```json
   {
     "certificateThumbprint": "F8DE7E854FF9E9DBA9CBD183F79B3F9753A87CE3",
     "digestAlgorithm": "sha256",
     "timestampUrl": "http://timestamp.digicert.com"
   }
   ```

3. **Újra build** (inkrementális, pár perc):
   ```bash
   npm run desktop:build
   ```
   A Tauri `signtool.exe` automatikusan aláírt:
   - `Kartotéka_0.1.0_x64_en-US.msi` (5.34 MB)
   - `Kartotéka_0.1.0_x64-setup.exe` (3.89 MB)
   - 3 NSIS plugin-DLL (System, nsDialogs, nsis_tauri_utils)
   - Timestamp: DigiCert TSA (érvényes 2036-ig)

**Verify (`Get-AuthenticodeSignature`):**
- ✅ Signer: `CN=EREK Kartoteka Developer, …`
- ✅ Thumbprint match
- ✅ TimeStamper: `DigiCert SHA256 RSA4096 Timestamp Responder 2025 1`
- ✅ Status: **Valid** (miután a cert a Trusted Root-ba került)

**⚠ Fontos tisztázás — a lelkészi gépekre mi vonatkozik:**

A Windows **SmartScreen** a **globális reputation-szolgáltatást** kérdezi — nem a helyi trust store-t. Egy self-signed cert-nek **nincs reputation**-je → SmartScreen warning (`Unknown publisher`) a **lelkész gépén** **továbbra is megjelenik**.

| Cert típus | Fejlesztői gép (helyi) | Lelkészi gép (reputation) | Cost |
|---|---|---|---|
| Self-signed (M3.2) | ✅ Valid | ⚠ Unknown publisher | ingyenes |
| **Azure Trusted Signing** (M5) | ✅ Valid | ✅ **Nincs warning** | $9.99/hó |
| DigiCert EV | ✅ Valid | ✅ Instant-reputation | ~$300/év |
| SignPath (OSS) | ✅ Valid | ✅ (OSS projektre ingyenes) | ingyenes OSS-re |

Most self-signed-del maradunk — **MVP-alpha-bétára** (Endre és pár tesztelő) elég. Az M5 előtt átlépünk Azure Trusted Signing-re, mielőtt az egész EREK-elnökségnek szétosztjuk.

**Következő (M3.3)**: eszköz-bind — a kliens első indításkor regisztrálja magát a Supabase `user_devices` táblába (device_fingerprint + Ed25519 public_key). Ez az alap a jövőbeli „admin eszköz-revoke" funkcióhoz.

---

## [2026-04-23] — M3.1: Első Kartotéka MSI + NSIS installer bundle

<!-- key: 2026-04-23-m3-1-first-bundle -->
<!-- category: improvement -->
<!-- version: 1.15.14 -->
<!-- targets: fejlesztő -->

### 📦 A desktop kliens már telepíthető MSI + NSIS csomagra

**A webes működést nem érinti.** Ez a M3 (production-deploy) fázis első lépése: a Tauri desktop kliens most már **telepíthető Windows-installer csomaggá** összeállítható.

**Generált bundle-k** (első release build, ~25 perc):

| Installer | Méret | Használat |
|---|---|---|
| `Kartotéka_0.1.0_x64_en-US.msi` | **5.4 MB** | Enterprise-deploy (Group Policy, SCCM), csendes telepítés (`/quiet`) |
| `Kartotéka_0.1.0_x64-setup.exe` | **3.9 MB** | Felhasználóbarát wizard, modern Windows-telepítő |

Output-útvonal: `C:\kartoteka-target\release\bundle\{msi|nsis}\` (a target-dir az M2.2 óta ASCII-úton a non-ASCII path-encoding-bug elkerülésére).

**Egyedi EREK-ikon felhasználva** — a `icon/icon.png` (templom + csillag sötétkék háttéren) minden méret-változatban generálva:
- Windows: 32x32, 128x128, 128x128@2x, Square*Logo, icon.ico
- macOS: icon.icns
- iOS + Android: teljes méretkészlet

A Tauri `npx tauri icon` parancs intézte egyben.

**Fájlnevek magyar ékezettel** (`Kartotéka`) — a Tauri `productName: "Kartotéka"` configból jön, a bundler megfelelően Unicode-kezeli.

**Build environment:**
- `cargo build --release` (első futás ~15-20 perc release-optimalizálásért)
- WiX Toolset → MSI
- NSIS 3.11 (Tauri automatikus letöltés) → EXE
- Minden a `C:\kartoteka-target` cache alatt (a subsequent build-ek pár perces inkrementálisak)

**Nem aláírt csomagok** — a Windows SmartScreen „Unknown publisher" warningot fog mutatni telepítéskor. A következő lépés (**M3.2**) javítja.

**Előkészítve az M3.2-hez:**
- `ops/code-sign-setup.ps1` — PowerShell script, ami self-signed code-sign cert-et generál (3 év érvényességgel), PFX-be exportál, a Trusted Publishers store-ba regisztrál, és kiírja a thumbprint-et a `tauri.conf.json`-be másoláshoz
- `.gitignore` bővítés: `ops/*.pfx`, `apps/desktop/src-tauri/target/`, `.p12/.key/.pem` fájlok

**Kipróbálási lehetőség (a lelkészi élmény előképe):**

```powershell
# 1. A telepítő futtatása
Start-Process "C:\kartoteka-target\release\bundle\nsis\Kartotéka_0.1.0_x64-setup.exe"

# 2. SmartScreen ("Unknown publisher") → "More info" → "Run anyway"
# 3. Wizard végigvezetésével a Kartotéka telepítődik a Start menübe
# 4. Indítás a Start menüből → ugyanaz a dashboard, mint npm run desktop:dev
#    (ugyanarra a SQLCipher DB-re mutat + Credential Manager kulcs)
```

**M3 haladás:**
- ✅ M3.1 Első MSI + NSIS bundle
- ⏳ M3.2 Self-signed code-sign cert + aláírt MSI
- ⏳ M3.3 Eszköz-bind (Supabase `user_devices` regisztráció)
- ⏳ M3.4 Updater plugin + aláírt manifest

---

## [2026-04-23] — M2.7: Delta-sync — csak a változott sorok (összes profil)

<!-- key: 2026-04-23-m2-7-delta-sync -->
<!-- category: improvement -->
<!-- version: 1.15.13 -->
<!-- targets: fejlesztő -->

### 🔀 Sávszélesség-takarékos szinkronizáció — csak a tényleges változások

**A webes működést nem érinti.** Az M2.6-os SQL-migráció már hozzáadta a `profiles.updated_at`-et — most élesben használjuk: a desktop kliens csak azokat a sorokat kéri le a Supabase-től, amik tényleg változtak.

**Új TS függvények** (`apps/desktop/src/lib/sync.ts`):
- `pullAllProfiles(mode)` — `mode='delta'` vagy `mode='full'`
  - **Delta-mode**: `WHERE updated_at > last_pull_all` (a legutóbbi pull óta változottak)
  - **Első delta-futás**: automatikusan `full-initial` módra vált (nincs last_pull → mindent lehoz)
  - **Full-mode**: override, mindent lehoz
  - Frissíti a `sync:profiles:last_pull_all` kulcsot a high-water mark-tal
- `getAllLocalProfiles()` — lokális olvasás az egész `profiles_local` táblából (updated_at DESC)
- `getLastPullAllIso()` — az utolsó delta-pull ISO-ideje

**Új Dashboard-kártya**: „Összes profil — delta-sync"
- Utolsó delta-pull ISO-időpont
- **Delta Pull** gomb (`variant="outline"`) — sávszélesség-takarékos
- **Full Pull** gomb (primary) — override
- Eredmény-üzenet: „Delta pull: 0 sor" / „Full (első futás): 1 sor frissítve"
- Tábla: email, név, szerepkör, revision, updated_at

**A dashboard refreshLocalDb kibővült**: most 6 párhuzamos load-ot csinál (settings, outbox, last_pull, last_pull_all, failed, all profiles).

**Miért praktikus ez?**
- Egy éles rendszerben 1000+ profil-sor lehet, amiből naponta csak néhány frissül. A delta-pull ilyenkor **99%+-ban üres** = < 1 kB hálózati forgalom (+ tranzakciós overhead).
- A full-pull szándékosan megmaradt: debug, „valamilyen desync van" forgatókönyvre.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build`: 510 kB JS (+5 kB az új függvények/UI), 57 kB CSS, 3.69 s

**Kipróbálás:**
1. `npm run desktop:dev` → login
2. „Összes profil" kártya → „Delta Pull" gomb → először full-initial, lejön 1 sor (a saját profilod)
3. Klikkelj megint „Delta Pull"-ra → „nincs új / változott sor" (mert semmi sem változott azóta)
4. Supabase Studio-ban UPDATE-eld a saját profilt (pl. phone) → revision+1, updated_at most
5. „Delta Pull" megint → most 1 sort frissít (kizárólag azt)

**Következő (M3)**: updater + code-signing (self-signed cert) + eszköz-bind. Az M2 fázis most teljes mértékben lezárult — minden offline-first funkció éles és tesztelt.

---

## [2026-04-23] — M2.6: Konfliktus-kezelés (revision + updated_at)

<!-- key: 2026-04-23-m2-6-conflict -->
<!-- category: feature -->
<!-- version: 1.15.12 -->
<!-- targets: fejlesztő, lelkészek (közvetve) -->

### 🔀 A profil-szerkesztés most már **konfliktusbiztos** — ugyanazt a sort két eszközről nem lehet véletlenül felülírni

**A webes működést nem érinti közvetlenül**, de ⚠️ **egy új Supabase SQL-migrációt kell futtatni**.

**⚠ KÉZI LÉPÉS ENDRÉNEK**: Supabase Studio SQL Editor-ban futtasd le az alábbi fájlt:

```
migration-docs/sql/2026-04-23-m2-6-profiles-revision.sql
```

Ez hozzáadja a `profiles`-hoz a `revision bigint` + `updated_at timestamptz` oszlopokat + egy `BEFORE UPDATE trigger`-t, ami automatikusan inkrementálja a revision-t minden íráskor.

**Mit csinál a konfliktus-kezelés:**

1. A kliens minden mentésnél **feljegyzi** a saját cache-ben lévő `revision`-t (pl. 5).
2. A Supabase UPDATE egy **conditional WHERE** záradékkal megy: `WHERE id = auth.uid() AND revision = 5`.
3. Ha a szerver-oldali sor időközben valaki más által módosítódott (pl. webes felületről), a revision már 6. → a WHERE nem matchel → **0 sor frissül**.
4. A kliens ezt érzékeli, és:
   - **Online**: re-pull-olja a sort (a webes változatot) + figyelmezteti a user-t: „A szerveren időközben megváltozott, nézd át a mezőket"
   - **Offline** (outbox): a sor `failed` marad `last_error='conflict: a szerver-oldali revision eltér'`-rel, a user retry-olhatja vagy elvetheti

**Új UI elemek a Dashboard-on:**
- A profil-táblában most látszik a `revision` + `updated_at`
- Konfliktus-banner: ⚠ amber-színű figyelmeztetés a form alatt
- **„Hibás / konfliktusos sorok" tábla** az Outbox kártyában — minden failed sorhoz „Újrapróba" és „Elvetés" gomb

**Új TS API** (`apps/desktop/src/lib/sync.ts`):
- `updateOwnProfile` most `{ queuedToOutbox, conflict, newRevision? }`-t ad vissza
- `processOutbox` visszaadja a `conflicts` számot is
- Új exportok: `getFailedOutboxRows()`, `retryOutboxRow(id)`, `dismissOutboxRow(id)`
- **Outbox payload új formája**: `{ patch, expected_revision }` (legacy-kompatibilis: ha a payload csak patch, unconditional update megy)

**Új Rust v3 migráció** (`apps/desktop/src-tauri/src/db.rs`):
```sql
ALTER TABLE profiles_local ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles_local ADD COLUMN updated_at TEXT;
PRAGMA user_version = 3;
```

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 32 s (v3 migráció új ALTER-ek, minden más cache-elt)
- ✅ `npm run desktop:build`: 505 kB JS, 57 kB CSS, 3.18 s

**Kipróbálás (miután az SQL migráció lefutott):**
1. `npm run desktop:dev` → login → Pull profil → a „Revision: 0" látható
2. Módosítsd a telefont → Mentés → „új revision: 1" üzenet
3. **Konfliktus szimulálás**: Supabase Studio-ban manuálisan UPDATE-eld a sort (pl. `SET phone = 'valami'`). Vagy a webes felületen módosítsd.
4. Most a desktop-on próbáld menteni az új értéket → ⚠ amber-banner: „A szerveren időközben megváltozott…"
5. A lokális cache frissült a szerver-változatra, újra mentheted ha akarod.

**Mit nem csináltunk még (M2.7+):**
- Delta-sync (`updated_at > last_pull`) — az infrastruktúra most már kész hozzá, csak a kliens-oldali query kell hozzá
- Több domain-tábla (members, finance, anyakonyv stb.) — minden egyes esetben egy hasonló SQL-migráció ajánlott (revision + updated_at + trigger), de azok külön-külön jönnek
- Kimerítő retry-policy (exponential backoff) — most 1 retry-gomb van a failed sorokon

**Következő (M2.7)**: fázis-záró csomag — több domain-tábla (pl. a `presbiter`, ami már készen van a séma-oldaltól). Vagy ha Endre inkább a M3-ra akar ugrani (updater + code-signing), azt is mérlegelhetjük.

---

## [2026-04-23] — M2.5: Push-sync — offline írás + outbox drain (saját profil)

<!-- key: 2026-04-23-m2-5-outbox-push -->
<!-- category: feature -->
<!-- version: 1.15.11 -->
<!-- targets: fejlesztő -->

### 📤 A desktop most már **offline is írhat** — az outbox fogadja és később szinkronizál

**A webes működést ez sem érinti.** A Tauri desktop-on most élesben használjuk az M2.1 óta ott lévő `outbox` táblát: a saját profil szerkeszthető mezőit (telefon, teljes név) akár offline állapotban is mentheted, és a háttér automatikusan feltölti a Supabase-be, amikor visszatér a net.

**Mi lett új:**

- **`sync.ts` bővítve** (apps/desktop/src/lib):
  - `updateOwnProfile(userId, patch)` — **optimistic** frissítés: azonnal ír a lokális `profiles_local`-ba, majd online-esetben közvetlenül a Supabase-nek, offline-esetben az outbox-ba.
  - `processOutbox()` — végigmegy a `pending` soron, elküldi a `UPDATE / INSERT / DELETE`-et a `target_table` + `target_id` + `payload` alapján. Sikeres sor: `status='sent'`. Hibás: `status='failed'`, `last_error`, `retry_count++`.
  - `enqueueOutbox(op, table, id, payload)` — belső helper.
  - `isOnline()` — `navigator.onLine` + 2 mp-es HEAD-ping a Supabase `/auth/v1/health`-re (valódi connectivity, captive-portal-biztos).

- **Dashboard bővítve:**
  - **„Online / Offline" badge** a fejlécen — `window.addEventListener('online'|'offline')`-on listen-el
  - **„Szerkeszthető mezők" űrlap** a profil-kártyában — telefon + teljes név. Mentés gomb → optimistic-UX: lokálisan azonnal látszik a változás
  - **„Outbox" kártya**: 4-tile KPI (függő / kiküldött / hibás / összes) + „Szinkronizálás most" gomb
  - **Auto-drain login után**: a dashboard mount-kor egyszer elindítja a `processOutbox()`-ot. Ha vannak pending sorok és van net, azonnal szinkronizálódnak.

**Kritikus viselkedés:**
- Offline-ban a „Mentés" gomb **mindig sikeres** — nincs error-message. A UI megmutatja: „Elmentve offline — a szerverrel a következő online-csatlakozáskor szinkronizálódik."
- Online-ban az közvetlen Supabase-hívás fut; **ha az mégis failelne** (pl. 5xx, RLS-probléma), a sor bekerül az outbox-ba fallback-ként → a következő manual sync vagy auto-drain próbálja.

**RLS-biztonság:** a Supabase `profiles_write` policy szerint a user csak a saját sorát frissítheti (`id = auth.uid()`). Az outbox-ba írt `update` operation is ezzel az id-vel fut, a Supabase visszautasít idegen sort.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build` (Vite prod): 501 kB JS (+6 kB a sync+UI miatt), 3.46 s. Vite warningol, mert kb. 500 kB fölött van — M5-ben code-splitting a lazy route-okkal.

**Kipróbálás:**
1. `npm run desktop:dev` → login → Pull profil
2. Módosítsd a telefont → „Mentés" → online esetén azonnal Supabase-ben is frissül
3. **Offline-teszt**: kapcsold le az internetet. A badge „Offline"-ra vált. Írj át valamit → „Mentés" — a message: "Elmentve offline, outbox-olva". Az Outbox-kártya pending: 1.
4. Kapcsold vissza az internetet. „Szinkronizálás most" → a pending → sent. A Supabase-ben is megjelenik.

**Következő (M2.6):**
- Konfliktus-kezelés: ha két gép egyszerre ír ugyanarra a sorra (vagy a server-oldali sor közben megváltozott), a push-sync-nek észre kell vennie és döntenie. Ez a `revision + updated_at` összevetésen alapul. Bevezető lépésként egy felkészített táblán (pl. `presbiter`) nézzük meg.

---

## [2026-04-23] — M2.4: Első Supabase → SQLite szinkron (saját profil pull)

<!-- key: 2026-04-23-m2-4-profile-pull -->
<!-- category: feature -->
<!-- version: 1.15.10 -->
<!-- targets: fejlesztő -->

### 🔄 A desktop kliens először ír saját magának adatot a Supabase-ről

**A webes működést nem érinti.** A Tauri desktop-on végre **valódi adat** kerül a lokális (titkosított) SQLCipher DB-be: a bejelentkezett user saját profilját tükrözzük a Supabase `profiles`-ból egy új lokális `profiles_local` táblába.

**Mi történt:**

- **v2 migráció** a `db.rs`-ben: `profiles_local` tábla létrejön (id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id, synced_at) + index a `congregation_id`-n
- **Új TS modul** `apps/desktop/src/lib/sync.ts`:
  - `pullOwnProfile(userId)` — Supabase `.eq('id', userId).maybeSingle()` → lokális `INSERT OR REPLACE`
  - `getLocalOwnProfile(userId)` — tisztán offline olvasás
  - `getLastPullIso()` — utolsó sync ISO-ideje a `settings:sync:profiles:last_pull` kulcsban
- **Dashboard bővítve**: új „Saját profil — offline cache" kártya
  - „Pull profil" gomb — lehozza a saját sort
  - Táblázat a 10 oszloppal + utolsó sync ideje
  - Hiba-panel, ha a pull elakad (offline, RLS stb.)

**Biztonsági megjegyzés**: a pull egy standard Supabase RLS-védett SELECT — a user csak a saját sorát láthatja. A `.eq('id', userId)` dupla-védelem kliens oldalon. A tárolt érték **SQLCipher-titkosított** DB-ben van.

**Mi NEM része az M2.4-nek (tudatosan):**
- **Delta-sync** (updated_at > last_pull) — a Supabase `profiles` táblán még **nincs** `updated_at` + `revision` oszlop. Delta-sync-et azokra a domain-táblákra tervezünk, amelyek már készek (pl. a `presbiter` már tartalmazza). Külön SQL-migrációt igényel a `profiles`-hoz, mielőtt ott delta lehetne.
- **Push-sync** (offline írás → outbox → Supabase) — M2.5
- **Konfliktus-kezelés** — M2.6
- **Több domain-tábla** (members, finance stb.) — fokozatosan M2.5+

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 1.03 s (csak a migráció-vektor változott)
- ✅ `npm run desktop:build`: **2117 modul** (+1 sync.ts), 3.29 s

**Kipróbálás**: indítsd az `npm run desktop:dev`-et, jelentkezz be, majd a Dashboard-on kattints a „Pull profil" gombra. A táblázat kitöltődik a saját adataiddal — utána a Credential Manager-ben őrzött kulccsal titkosított DB-ben ez a sor már lokálisan elérhető (akkor is, ha kikapcsolod az internetet és újraindítod az app-ot).

**Következő (M2.5)**: Push-sync — az outbox bemutatása egy írás-útvonallal. Első probálkozás: a user képes lesz lokálisan elmenteni egy „saját telefon-számot", az outbox fogadja az írást, a Supabase-nek egy tranzakcióban át fog adni, és a pull-sync visszaolvassa.

---

## [2026-04-23] — M2.3: SQLCipher-kulcs OS-szintű titkos tárolóban (Credential Manager)

<!-- key: 2026-04-23-m2-3-os-keyring -->
<!-- category: security -->
<!-- version: 1.15.9 -->
<!-- targets: fejlesztő -->

### 🔑 A kulcs már nem a bináris-ben — Windows Credential Manager (DPAPI)

**A webes működést nem érinti**, a desktop user-flow változatlan.

**Biztonsági előrelépés az M2.2-höz képest:**
- Az M2.2-ig a SQLCipher-kulcs egy **statikus konstans** (`DEV_DB_KEY`) volt a Rust kódban — bárki, aki reverse-engineer-eli a `.exe`-t, megkapta.
- Az M2.3-tól a kulcs az **OS-szintű titkos tárolóban** él (Windows Credential Manager / macOS Keychain / Linux Secret Service). Windows-on a DPAPI titkosítja a bejelentkezett user adataival.

**A fenyegetési modell most:**
| Forgatókönyv | M2.2 (statikus kulcs) | M2.3 (OS keyring) |
|---|---|---|
| Bejelentkezett user + fizikai hozzáférés | ❌ DB olvasható | ❌ DB olvasható |
| Kilopott eszköz / kilopott DB fájl (nincs Windows-login) | ❌ kulcs a binárisban visszafejthető | ✅ **kulcs nélkül visszafejthetetlen** |
| Másik Windows-user ugyanazon a gépen | ❌ ugyanaz a bináris, ugyanaz a kulcs | ✅ **DPAPI per-user: másik user nem fér hozzá** |
| Reverse-engineered .exe | ❌ kulcs a bin-ben | ✅ **csak a keyring-logika, a kulcs nem** |

**Mit NEM véd még (M2.6-ra hagyva):**
- Malware ugyanabban a user-kontextusban root-joggal — ellene csak user-jelszó-alapú derived key segíthet.
- User-profil törlés (pl. Windows újratelepítés) → kulcs elvész, DB visszanyerhetetlen. A **backup/restore** külön feladat (M2.5).

**Technikailag:**
- Új Rust crate-ek: `keyring v3`, `rand v0.8`, `hex v0.4` — mind **pure-Rust**, semmi új C-build. Cargo check **8 mp** inkrementálisan.
- A `db.rs`-ben új `load_or_create_db_key()`:
  - Első indítás: generál egy kriptográfiailag biztonságos 32-byte kulcsot, elmenti a Credential Manager-be (`service=kartoteka-desktop`, `user=sqlcipher-db-key`)
  - Subsequent: olvassa a Credential Manager-ből
- A kulcs a SQLCipher-nek **raw hex-key formátum**ban (`x'...'` 64 hex-karakterrel) — elkerüli a KDF-lassulást és minden indulásnál ugyanaz a bájt-szekvencia.
- `PRAGMA key = "x'...'"` raw execute-tel (a `pragma_update` idézőjel-escape-jét kikerülve).

**⚠ Endre gépén egy kézi törlésre szükség van:**

Ha már futtattad az M2.2-es Tauri dev-et, van egy DB fájlod a régi DEV_DB_KEY-vel titkosítva. Az M2.3-as app új kulccsal próbálja nyitni → sanity-check hiba. Töröld:

```powershell
Remove-Item "$env:APPDATA\com.erek.kartoteka\kartoteka.db"
```

Utána újra `npm run desktop:dev` → új kulcs generálódik, a DB újra inicializálódik.

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 8 mp inkrementális (új deps: keyring, rand, zeroize, hex)
- ✅ `npm run desktop:build` (Vite prod): **2116 modul** (+1 ErrorBoundary), 3.36s

**Következő (M2.4)**: pull-sync — az első "éles" domain tábla (pl. `members`) Supabase → SQLite tükrözése.

---

## [2026-04-23] — M2.2: SQLCipher-titkosított lokális DB (rusqlite + saját commands)

<!-- key: 2026-04-23-m2-2-sqlcipher -->
<!-- category: security -->
<!-- version: 1.15.8 -->
<!-- targets: fejlesztő -->

### 🔐 A lokális adatbázis most már titkosított — SQLCipher a helyén

**A webes működést ez sem érinti.** A desktop kliens korábbi (M2.1) sima SQLite-ja titkosított SQLCipher-re cserélve.

**Mi változott a Rust-oldalon:**
- Eltávolítva: `tauri-plugin-sql` csomag (külső plugin)
- Hozzáadva: `rusqlite v0.32` a `bundled-sqlcipher-vendored-openssl` feature-rel — ez **nem igényel system-OpenSSL-t és nem igényel system-SQLCipher-t**, mindent a crate-ek magukban hoznak
- Új modul: `src-tauri/src/db.rs` — nyit, migrál, `db_execute` + `db_select` Tauri command-ok
- `src-tauri/src/lib.rs` refaktor: `setup()`-ban megnyitja és migrálja a DB-t, a commandokat regisztrálja

**Mi változott a TS-oldalon:**
- Eltávolítva: `@tauri-apps/plugin-sql` npm csomag
- `apps/desktop/src/lib/local-db.ts` átírva: most közvetlenül `invoke('db_execute', ...)` / `invoke('db_select', ...)`-ot hív
- A **nyilvános API változatlan**: `getSetting`, `setSetting`, `getAllSettings`, `getOutboxStats` — a dashboard kódot nem kellett módosítani

**Biztonsági állapot:**
- ✅ A DB már SQLCipher-titkosított
- ⚠️ A kulcs **statikus fejlesztői konstans** a Rust kódban (`DEV_DB_KEY`) — **NEM production-safe**
- ⏳ **M2.3-ban** a Stronghold kulcstárba kerül (user-jelszóból derivált, egyedi eszközönként)

**Migráció:**
- A `PRAGMA user_version` verzió-alapú stratégia megmaradt (v1 séma: `settings` + `outbox`)
- Ha a fejlesztői gépen létezik az M2.1-es plain-SQLite DB, az **nem nyitható meg** — az M2.2 törlést nem végez, a user kézzel törölheti a `%APPDATA%\com.erek.kartoteka\kartoteka.db`-t ha gond van

**Capabilities tisztítva:** a `sql:*` engedélyeket eltávolítottuk a `capabilities/default.json`-ből, mert a saját `#[tauri::command]` függvényekhez Tauri 2-ben nem kell explicit capability (csak plugin-command-ekhez).

**Fejlesztő gép build-függőségei (csak Endre oldalán — a lelkészek MSI-t kapnak):**
- Strawberry Perl 5.42.2.1 (OpenSSL `Configure` szkripthez) — `winget install StrawberryPerl.StrawberryPerl`
- NASM (a Strawberry Perl már behúzza a `C:\Strawberry\c\bin\nasm.exe`-t, a winget-es `NASM.NASM` redundáns)
- Build-target átirányítva `C:\kartoteka-target`-re egy `.cargo/config.toml`-lal — az `D:\Egyházi APP\...` útvonalban lévő `á` karakter összetöri az OpenSSL build-scriptet (NASM-kódlap ütközés)

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `npm run desktop:build` (Vite prod): **2115 modul**, 5.09s
- ✅ `cargo check`: első build ~15 perc (SQLCipher C + OpenSSL C fordítás), inkrementális **1.20 s**

**Következő (M2.3)**: Stronghold kulcstár — a `DEV_DB_KEY` konstans helyett a kulcs egy user-jelszóból derivált értékből származik, és a Stronghold-napló titkosított. Ez zárja a fejlesztés → produkció váltás utolsó biztonsági résé.

---

## [2026-04-23] — M2.1: Lokális SQLite a desktop kliensben (tauri-plugin-sql)

<!-- key: 2026-04-23-m2-1-local-sqlite -->
<!-- category: improvement -->
<!-- version: 1.15.7 -->
<!-- targets: fejlesztő -->

### 💾 Offline adatréteg első lépése — titkosítás nélküli SQLite

**A webes működést nem érinti.** Az M2 fázis első alfázisa: a Tauri desktop kliens ezentúl létre tud hozni és használni egy **lokális SQLite adatbázist** (`%APPDATA%\com.erek.kartoteka\kartoteka.db`). Ez az offline-first működés alapja.

**Egyelőre nincs titkosítás** — az M2.2-ben cseréljük SQLCipher-re, és a kulcsot a Stronghold kulcstárba tesszük (M2.3).

**Új csomagok:**
- **Rust**: `tauri-plugin-sql` v2 (sqlite feature)
- **JS**: `@tauri-apps/plugin-sql` v2

**Séma — v1 migráció (automatikusan fut az első indításkor):**
- `settings (key, value, updated_at)` — kulcs-érték alapbeállítások
- `outbox (id, op, target_table, target_id, payload, status, …)` — offline írás-queue (M2.3-ban tölt fel)

**TS wrapper (`apps/desktop/src/lib/local-db.ts`):**
- `getLocalDb()` — singleton factory
- `getSetting(key)` / `setSetting(key, value)` / `getAllSettings()`
- `getOutboxStats()` — pending/sent/failed/total számok

**Dashboard-demo:**
- Új „Lokális adatbázis" kártya a desktop dashboard-on
- Mutatja a settings sorokat + outbox statisztikát
- „Ping local DB" gomb → beszúr egy `last_ping` értéket, ami bizonyítja a working write-read
- Böngésző-módban (npm run desktop:vite) szép hibaüzenet: „A Tauri SQL-plugin csak natív ablakban aktív, indítsd `npm run desktop:dev`-vel"

**Tauri capabilities**: a `sql:*` engedélyeket explicit megadtuk a `src-tauri/capabilities/default.json`-ban (Tauri 2 biztonsági modellje mindent zárt engedélyezés nélkül)

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): 0 hiba
- ✅ `cargo check`: 2m 18s, 0 hiba (sqlx-sqlite + tauri-plugin-sql 2.4 hozzáadva)
- ✅ `npm run desktop:build` (Vite prod): **2116 modul (+4 plugin-sql SDK), 5.48s**

**Következő (M2.2)**: SQLCipher cserélés — titkosított DB. Még mindig nincs Stronghold, a kulcs egy statikus env-változóból jön, de már SQLCipher-rel. A M2.3 adja hozzá a Stronghold-alapú kulcs-kezelést.

---

## [2026-04-23] — M1.5: Desktop kliens login-képernyő + auth-flow

<!-- key: 2026-04-23-m1-5-desktop-login -->
<!-- category: improvement -->
<!-- version: 1.15.6 -->
<!-- targets: fejlesztő -->

### 🔑 Kartotéka Desktop első értelmes képernyője — bejelentkezés

**A webes működést ez nem érinti.** A Tauri desktop kliens most először használja a közös csomagokat valós UI-val: Tailwind CSS 4 + `@kartoteka/ui` komponensek + `@kartoteka/supabase-client` auth, React Router routing-gel.

**Mi van az M1.5-ben:**

- **Tailwind CSS 4** beállítva a Vite-on át (`@tailwindcss/vite` plugin, nem PostCSS) — a közös `@kartoteka/ui` csomagot is scanneli (`@source "../../../packages/ui/src"`)
- **Placeholder design tokenek** az `apps/desktop/src/index.css`-ben — minimál színpaletta (EREK zöld primary), M2-ben a `@kartoteka/design-tokens` fogja adni végleges formában
- **React Router DOM v7** — `HashRouter` (Tauri-biztonságos, nem ütközik custom URL-scheme-ekkel)
- **`AuthGate`** komponens — session-check, loading-spinner, redirect `/login`-ra, reagál `onAuthStateChange`-re
- **Login képernyő** (`LoginPage`) — email + jelszó form, `@kartoteka/ui` Button/Card/Input/Label komponenseket használ, a Supabase hibákat magyar üzenetekre fordítja (pl. "invalid login credentials" → "Hibás e-mail cím vagy jelszó")
- **Dashboard placeholder** — üdvözlő kártya + kijelentkezés gomb, bizonyítja hogy az auth-gate és a közös csomagok végig működnek
- **Tauri default assetek** kitakarítva (App.css, react.svg, vite.svg, tauri.svg) — tiszta start

**A user flow a desktop-on** (ha a `.env` kitöltve van):
1. App indul → AuthGate session-check → nincs → redirect `#/login`
2. Login form megjelenik a @kartoteka/ui Card-jával
3. Email + jelszó beírása → `supabase.auth.signInWithPassword`
4. Siker → redirect `#/` → AuthGate session OK → Dashboard
5. "Kijelentkezés" → `supabase.auth.signOut` → redirect `#/login`

**Verify:**
- ✅ `npx tsc --noEmit` (apps/desktop): **0 hiba**
- ✅ Vite dev (port 1420) — Ready in 663 ms
- ✅ `GET /` → 200, 566 byte HTML (title: "Kartotéka")
- ✅ `GET /src/main.tsx` → 200, transformált modul
- ✅ `GET /src/index.css` → 200, **78 KB generált Tailwind CSS** (a közös UI komponensek class-ai sikeresen scannelve)

**Próbald ki böngészőben (Tauri nélkül is):**
```bash
cd apps/desktop
cp .env.example .env  # ha még nem tetted
# töltsd ki a VITE_SUPABASE_URL és VITE_SUPABASE_ANON_KEY értékeket
cd ../..
npm run desktop:vite
# → http://localhost:1420 — ugyanaz a UI, Tauri-ablak nélkül
```

**Vagy Tauri-ablakban** (első indítás 5-10 perc a cargo build miatt):
```bash
npm run desktop:dev
```

**Következő (M2 fázis kezdete)**: SQLCipher + offline DB réteg a Tauri-oldalán. Az M1 fázis **ezzel lezárult**.

---

## [2026-04-23] — M1.4: Közös UI komponens-könyvtár (@kartoteka/ui)

<!-- key: 2026-04-23-m1-4-ui-shared -->
<!-- category: improvement -->
<!-- version: 1.15.5 -->
<!-- targets: fejlesztő -->

### 🧩 13 shadcn-komponens kiemelve közös csomagba — web + desktop között (M1 fázis folytatása)

**A webes működés pontosan ugyanaz marad.** Strukturális refaktor: a `Button`, `Card`, `Dialog`, `Input`, `Tabs` stb. alap-komponensek most egy közös csomagban élnek (`@kartoteka/ui`), hogy a Tauri desktop kliens (M1.5-től) ugyanazt használja.

**Átemelt komponensek (13):** avatar, badge, button, card, dialog, dropdown-menu, input, label, select, separator, sheet, tabs, textarea. Plusz a `cn()` helper (`packages/ui/src/lib/utils.ts`).

**NEM kerültek át (projekt-specifikusak, maradnak `apps/web`-ben):**
- `address-form` (román cím-hierarchia), `color-tabs` (egyedi pirosas-kartyás kezelés), `help-tooltip` (Next.js `next/link`), `modal-field` (magyar label+required), `searchable-category-select`, `splash-screen` (magyar kezdő splash), `sonner` (`next-themes`-es wrapper)

**Visszafelé kompatibilis** — nulla kód-módosítás volt szükséges a 15+ meglévő hívó helyen. Az `apps/web/tsconfig.json` **paths alias**-on keresztül a `@/components/ui/button` típusú importok automatikusan a közös csomagra mutatnak. A `@/lib/utils` is a közös `cn()`-re mutat egy vékony re-export wrapper-en át.

**Tailwind 4 integráció**: az `apps/web/app/globals.css`-ben egy `@source "../../../packages/ui/src"` direktíva biztosítja, hogy a Tailwind JIT scanner a közös csomag TSX fájlait is scannelje és generálja a szükséges utility class-okat.

**Verify:**
- ✅ `npx tsc --noEmit` (packages/ui + apps/web): **0 hiba**
- ✅ `npm run dev` (root-ról): Ready in 357ms
- ✅ `GET /login → 200 OK`, 45 KB render — a UI komponensek ténylegesen renderelnek, a Tailwind CSS-e kompilál

**Következő (M1.5)**: a `apps/desktop` app nem-placeholder UI-t kap — a közös `@kartoteka/ui` Button, Card komponenseit használó valódi login/regisztráció képernyő. Ehhez a Tauri oldalra is Tailwind CSS setup kerül (+ közös design tokenek a `@kartoteka/design-tokens`-ből).

---

## [2026-04-23] — M1.3: Közös Supabase-kliens csomag (@kartoteka/supabase-client)

<!-- key: 2026-04-23-m1-3-supabase-client -->
<!-- category: improvement -->
<!-- version: 1.15.4 -->
<!-- targets: fejlesztő -->

### 🔌 Közös Supabase-kliens factory — web és desktop között (M1 fázis folytatása)

**Ez sem érinti a felhasználói működést** — a webes app pontosan úgy fut, ahogy eddig. Viszont most már létezik egy **közös kliens-factory** (`@kartoteka/supabase-client`), amit mind a Next.js web (`apps/web/`), mind a Tauri desktop (`apps/desktop/`) ugyanabból a forrásból használ.

**Mit csináltunk:**

- Új `packages/supabase-client/` csomag: `createKartotekaBrowserClient(config)` factory, `SupabaseBrowserConfig` típus, `Database` típus placeholder (M1.5-ben generáljuk a valós Supabase-sémából)
- A csomag **platform-független**: paraméterként kapja az URL-t és az anon key-t, nem olvas `process.env`-et vagy `import.meta.env`-et direktben — a caller (Next.js / Vite) adja át
- `apps/web/lib/supabase/client.ts` refaktor: most már csak **15 soros wrapper**, ami a `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` env-változókat adja tovább a közös csomagnak
- `apps/desktop/src/lib/supabase.ts` új: Vite-alapú kliens, ami az `import.meta.env.VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` változókból olvas (**lazy-init** — ha nincs `.env`, a modul még betölthető, csak első hívásnál dob hibát)
- `apps/desktop/.env.example`: mintafájl a desktop-hoz
- `apps/desktop/src/vite-env.d.ts`: TypeScript deklarálás a `VITE_*` env-változókra

**Visszafelé kompatibilis**: a **15 meglévő fájl** a `apps/web`-ben, ami eddig a `@/lib/supabase/client`-et importálta, ugyanúgy működik tovább. Nulla változtatás az app-kódban.

**Mit NEM emeltünk ki közös csomagba** (tudatosan):

- `apps/web/lib/supabase/server.ts` — `cookies()` + Next.js SSR-specifikus, csak a webben működik
- `apps/web/lib/supabase/admin-client.ts` — `service_role` kulcsos, `'server-only'` import
- `apps/web/lib/supabase/middleware.ts` — Next.js Edge Runtime proxy
- `apps/web/lib/supabase/secret-vault.ts` — pgcrypto helpers, csak server-oldal

Ezek mind **Next.js-specifikusak** és nem illenek a Tauri desktop-hoz. Marad a helyükön.

**Verify:**
- ✅ `npx tsc --noEmit` (packages/supabase-client): **0 hiba**
- ✅ `npx tsc --noEmit` (apps/web): **0 hiba**
- ✅ `npx tsc --noEmit` (apps/desktop): **0 hiba**
- ✅ `npm run dev` (web root-ról): Ready in 453ms, `.env.local` betöltve

**Következő (M1.4)**: közös `@kartoteka/ui` csomag bevezetése (shadcn-alapú komponensek), hogy ugyanazokat a gomb/dialog/kártya komponenseket használja a web és a desktop.

---

## [2026-04-23] — M1.2: Tauri 2 desktop kliens bootstrap (apps/desktop/)

<!-- key: 2026-04-23-m1-2-tauri-bootstrap -->
<!-- category: improvement -->
<!-- version: 1.15.3 -->
<!-- targets: fejlesztő -->

### 🖥️ Üres desktop-kliens inicializálva (M1 fázis folytatása)

**Ez sem érinti a felhasználói működést** — a jelenlegi webes Kartotéka-rendszer továbbra is ugyanúgy fut. Viszont most már létezik egy **kezdő Tauri 2 desktop projekt** az `apps/desktop/` alatt, amit M1.3-tól tartalommal töltünk fel.

**Mi történt:**

- Rust 1.95.0 stable toolchain telepítve (`winget install Rustlang.Rustup`) — ez csak a fejlesztői gépen kell
- Az `apps/desktop/` alatt létrejött egy Tauri 2 + React + TypeScript + Vite projekt (a `create-tauri-app` hivatalos CLI-vel)
- `@kartoteka/desktop` workspace-névvel bejegyezve — a root `npm install` behúzza, a root `npm run desktop:dev` parancs a Tauri dev-szervert indítja
- A Tauri config magyarítva: `productName: "Kartotéka"`, `title: "Kartotéka"`, 1280×800 kezdő ablakméret, EREK copyright + leírás
- A React-oldali `App.tsx` és a Rust-oldali `greet` parancs magyarítva
- `cargo check` sikeresen lefutott (1 perc 29 mp, 517 crate) — a Rust backend fordítható

**Hogyan telepíti majd egy lelkész az egészet?** Nem a Rust-ot és nem a Visual Studio-t — hanem egy **egyetlen `.msi` installer-t**, amit a Tauri bundler generál és mindent magával hoz (WebView2 runtime, Visual C++ Redistributable). A fejlesztői függőségek (Rust, C++ Build Tools) csak Endre gépén szükségesek. Részletek: `docs/project-tracking/KARTOTEKA-M1-2-tauri-bootstrap-2026-04-23.md`.

**Új root parancsok:**

- `npm run desktop:dev` — Tauri ablak indítása (fejlesztéshez, első indításkor 5-10 perc)
- `npm run desktop:build` — MSI installer generálás
- `npm run desktop:vite` — csak a Vite frontend (browser-ben teszteléshez)

**Fontos**: az M0 (access-requests, Brevo, JWT hook) és az M1.1 (monorepo) **változatlanul működik**. Az M1.2 csak **új modul** — nem nyúl a webhez.

---

## [2026-04-23] — M1.1: Monorepo átalakítás (apps/web + packages/*)

<!-- key: 2026-04-23-m1-1-monorepo -->
<!-- category: improvement -->
<!-- version: 1.15.2 -->
<!-- targets: fejlesztő -->

### 🛠️ Tech-groundwork a Tauri desktop klienshez (M1 fázis)

Ez a lépés **nem érinti a felhasználói működést** — csak a repo belső szerkezete változott, hogy a közelgő **Tauri 2 desktop kliens** és a jelenlegi **Next.js webapp** egyazon repo-ban, **közös csomagokon** (UI, Supabase-kliens, design-tokenek, séma-típusok) osztozzanak.

**Mit változott a repo szerkezetében:**

- A teljes Next.js app átkerült `app/`, `components/`, `lib/`, `public/` gyökér-mappákból → `apps/web/` alá
- Az összes futtatási konfig (`next.config.ts`, `tsconfig.json`, `middleware.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `next-env.d.ts`, `.env.local`, `.env.example`) is átkerült `apps/web/` alá
- Új `packages/` könyvtár 4 placeholder csomaggal (`@kartoteka/ui`, `@kartoteka/supabase-client`, `@kartoteka/design-tokens`, `@kartoteka/schema-types`) — ezeket M1.2–M1.4 tölti fel tartalommal
- A root `package.json` most **npm workspaces**-alapú monorepo-meta: a `dev`, `build`, `lint` parancsok a root-ról is működnek (`npm run dev` → `apps/web/` alá delegál)
- A `scripts/audit-safety.mjs` átkerült `apps/web/scripts/` alá, a `scripts/build-adr-seed.mjs` maradt rooton (mert a `migration-docs/` gyökér-adatain dolgozik)

**Mi maradt változatlan** (a felhasználó-látható szinten):

- A rendszer **ugyanúgy működik**, mint eddig — minden URL, minden funkció, minden adatbázis-kapcsolat
- A `npm run dev`, `npm run build`, `npm run lint` ugyanolyan parancsok, mint eddig (csak ezúttal a root `package.json` irányítja workspaces-en át)
- Supabase, Brevo, RLS, auth — **semmi nem változott**
- Az `.env.local` automatikusan betöltődik (Next.js a `apps/web/.env.local` fájlt olvassa)

**Ellenőrzés futtatva:**

- ✅ `npm install` — 968 csomag telepítve, workspaces összelinkelve (`node_modules/@kartoteka/{web,ui,...}` symlinkek OK)
- ✅ `npx tsc --noEmit` (apps/web) — 0 hiba
- ✅ `npm run dev` (root-ról) — `Ready in 386ms`, `Environments: .env.local` helyesen betöltve
- ✅ Git: minden `git mv`-vel rögzítve, a történet megőrzöttt (file history linkelhető)

**Következő lépés (M1.2):** Tauri 2 projekt init az `apps/desktop/` alá — Vite + React SPA a Tauri shell-ben. Ez már **új desktop kliens**, nem érinti a webes működést.

---

## [2026-04-23] — Hozzáférés-kérelem rendszer: end-to-end ÉLES

<!-- key: 2026-04-23-m0-end-to-end -->
<!-- category: feature -->
<!-- version: 1.15.1 -->
<!-- targets: admin, lelkészek -->

### ✨ Működési visszajelzés

Az új **hozzáférés-kérelem rendszer** (bevezetve a [2026-04-23] — "Új hozzáférés-kezelés" bejegyzésben) most **end-to-end tesztelve és élesben**:

- A publikus `/hozzaferes-kerese` űrlap fogadja a kérelmet
- A kérelmező **Brevo-tól email-visszaigazolást** kap (EU szerverről, GDPR-kompatibilisan)
- Az admin a "Hozzáférés-kérelmek" fülön látja, egy kattintással **elfogadhatja** vagy **elutasíthatja**
- Elfogadás után a rendszer **automatikusan létrehozza** a Supabase auth-user-t és **invite-emailt küld** (jelszó-beállító linkkel)
- Minden admin-akciót **audit-log** rögzít

### 🔧 Technikai pontosítások (felhasználót nem érinti)

- Admin-approve flow: új ág a már-létező user esetére (pl. adminnok saját kérelmei) — csak státusz-frissítés, nincs duplikált user
- Brevo email-provider: hibabiztos try/catch + részleges-állapot kezelés, ha a service_role kulcs hiányzik
- RLS-segédfüggvények (`is_admin()`, `same_congregation()`, `is_current_user_approved()`, stb.) bevezetve — minden jövőbeli tábla-migráció ezeket használja
- `ALTER DEFAULT PRIVILEGES` — minden új public táblát auto-GRANT-tel (authenticated ENGEDÉLY az RLS mellett)

### 📌 Sender email

Jelenleg a rendszer **`endreszocs@gmail.com`**-ról küldi az emaileket (személyes cím, verifikálva Brevo-ban). Production deploy előtt (M5/M6) **saját `@kartoteka.*` domain** kerül beállításra SPF/DKIM hitelesítéssel.

---

## [2026-04-23] — Új hozzáférés-kezelés: kérelem-alapú regisztráció

<!-- key: 2026-04-23-access-request-system -->
<!-- category: feature -->
<!-- version: 1.15.0 -->
<!-- targets: lelkészek, esperesek, egyházkerületi admin -->

### ✨ Új hozzáférés-kérelem rendszer

A Kartotéka rendszerbe **már nem lehet közvetlenül regisztrálni**. Az új felhasználóknak
egy egyszerű űrlapot kell kitölteniük, és az egyházkerületi rendszergazda jóváhagyja
a kérelmüket — ez biztonságosabb és szervezet-hűbb működés.

**A kérelmező tapasztalata**:
- A `/hozzaferes-kerese` oldalon egyszerű űrlap: név, email, szerepkör, gyülekezet
- Azonnali email-visszaigazolás (Brevo-n keresztül, EU-szerverről)
- Admin 1-3 munkanapon belül dönt
- Ha elfogadott: invite-email érkezik, kattintással beállíthatja jelszavát

**Admin-funkciók**:
- Új „Hozzáférés-kérelmek" fül az admin dashboardon (amber szín)
- Lista, szűrés státusz szerint (várakozó/jóváhagyott/elutasított), szabad-szöveges keresés
- Egy kattintással elfogadás vagy elutasítás (kötelező indoklással)
- KPI-panel: pending / approved / rejected / utolsó 7 nap

### 🔒 Biztonsági javítások

- **Email-szolgáltató átállás**: Resend (USA) → **Brevo** (francia EU, GDPR-szigorú).
  Minden email EU-szerverről megy. Free tier: 300/nap.
- **Audit-log**: minden admin akció (elfogadás, elutasítás, eszköz-revoke) rögzítődik.
  Új „Eszközök és napló" admin-fül — még üres, az M1 (Tauri-kliens) után telik meg.
- **Custom JWT claim**: a bejelentkezés-tokenben most már `approved`, `profile_status`,
  `profile_role`, `congregation_id` claim-ek vannak — a kliens gyorsan tudja, hogy a
  user jóváhagyott-e, és melyik gyülekezethez tartozik.
- **RLS-audit**: átfogó áttekintés a 80+ DB-tábla védettségéről. Segédfüggvények
  (`is_admin()`, `same_congregation()`, `is_current_user_approved()`) — minden új
  tábla policy-ja ezeket használja majd.
- **Rate-limit**: a publikus űrlap max 3 kérelem / IP / 24h fogad. GDPR-kompatibilis
  IP-hash (nem tárolunk nyers IP-t).

### 🔧 Infrastruktúra (felhasználót nem érinti közvetlenül)

- Új tábla: `access_requests`, `user_devices`, `licenses`, `audit_log`, `documents`,
  `document_keys` — mind RLS-védett.
- Privát Storage bucket: `documents-encrypted` — E2E titkosított fájltárolás alapja
  (a tényleges titkosítás a Tauri-desktop kliens M4 fázisában jön).
- Supabase Auth hook: `custom_access_token_hook` — a JWT-be ad `approved` claim-et.
- Email-provider absztrakció: `lib/email/send.ts` — a Brevo/Resend váltás
  env-vár-ral (`EMAIL_PROVIDER`).

### 📌 Megjegyzések

- A jelenlegi `/register` oldal egyelőre még működik, de a **login oldalon** a
  „Regisztráljon!" linket lecseréltük „**Kérjen hozzáférést!**"-re. A `/register`
  útvonalat későbbi release-ben eltávolítjuk.
- Az M0 fázis (6 lépés) teljes — ez alapozza a Tauri-desktop kliens (M1-M6) fejlesztését.

---

## [2026-04-21] — Dashboard UX csomag: lakhely, kor-eloszlás, év-léptető, éves terv redesign

<!-- key: 2026-04-21-dashboard-ux-csomag -->
<!-- category: improvement -->
<!-- version: 1.14.2 -->
<!-- targets: lelkészek -->

### 🐛 Születésnapos lista: lakhely bug javítva

**Tünet**: Ha a születésnap-lista kinyomtatásakor bejelölted, hogy „lakhely is szerepeljen", **csak a házszám jelent meg**, a helységnév és utcanév hiányzott.

**Ok**: A `szemely` tábla cím-adatai **FK-n keresztül** érhetők el (`c_utcaid → adrstreet → adrlocality`). A korábbi query csak a szabad-szöveges `c_szcim`-et és a `c_szam`-ot hozta le.

**Javítás**: A dashboard query kiegészült `adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)` joinokkal. A címösszeállítás prioritás-sorrend: strukturált adat → „Helység, Utca Házszám"; ha nincs → `c_szcim` fallback; különben csak a házszám.

### ✨ Kor-eloszlás kártya: részletes nézet + korpiramis

A Koreloszlás kártyára **toggle-kapcsoló** került:

- **Áttekintés** (default): a meglévő 5-csoportú pie chart (0–17, 18–35, 36–60, 61–80, 80+) + legenda %-kal
- **Részletes**: 10-éves **korpiramis** — férfi balra, nő jobbra, gradient bar-okkal. Legidősebb felül (demográfiai konvenció).

Minden nézet alján új **statisztika-sáv**: **átlag, medián, legfiatalabb, legidősebb** életkor.

### ✨ Gyülekezeti programok: új év-léptető UX

A korábbi natív `<select>` dropdown túl sok böngészőben **nem látszott jól** (kicsi, z-index alatt, vagy nehezen észlelhető). Az új UX:
- **◄ / ►** gombok — egy kattintással előző/következő év
- Középen **stilizált évszám-dropdown** — gyors ugrás bármelyik évre
- **„Ma"** shortcut gomb — ha nem az aktuális éven vagy, egy kattintással vissza

### 🎨 Éves programterv nyomtatás — ünnep-kiemelés redesign

A nyomtatásra kerülő éves programterv **sokkal szebben** különíti el az ünnepeket:

- **3-szintű ünnep-rang**:
  - **Nagy ünnep** (Húsvét, Pünkösd, Karácsony) — piros+arany gradient, vastag 2px piros keret
  - **Közép ünnep** (Virágvasárnap, Nagypéntek, Áldozócsütörtök, Szenteste, Reformáció) — arany gradient
  - **Kis ünnep** (Újév) — halvány arany
- **Többnapos ünnepek** (Karácsony 25-26, Húsvét vas+hét, Pünkösd vas+hét) — **minden napot** kiemeli, nem csak az elsőt
- **Sidebar kettéválasztva**:
  - Felül: „**Református ünnepek**" aranyló blokk (rang-szerinti tételek)
  - Alatta: „**Gyülekezeti programok**" teal blokk
- **Szebb fejléc**: nagyobb év-badge (arany-barna gradient), program+ünnep számláló chipek, decoratív arany vonal

### 📌 Megjegyzések

- A Supabase admin oldalon „Rendszer pénzügyei" fülben új kategória: `railway` (EU Amsterdam hosting) és `email_service` (Brevo). A jelenlegi Vercel Pro tétel átkerül Railway-re (lásd migrációs SQL).

---

## [2026-04-21] — Prezentáció Studio: animált redesign + silent failure javítások

<!-- key: 2026-04-21-prezentacio-animalt -->
<!-- category: improvement -->
<!-- version: 1.14.1 -->
<!-- targets: lelkészek -->

### 🐛 Prezentáció: hiányzó anyakönyvi adatok javítva

**Tünet**: Az éves beszámoló prezentációban egyes szakaszoknál (keresztelések, konfirmációk, esketések, temetések trend) 0 érték jelent meg, pedig voltak adatok.

**Ok**: Két silent failure:
1. A kód az `anyakonyv` táblát kérdezte le, **ami nem létezik** — a 4 valódi tábla (keresztseg, konfirmalas, hazassag, temetes) van a helyén. A Supabase csendben üres eredményt adott vissza.
2. A `kiadas` → kategória join útvonala is rossz volt (`szamadasicel(name)` helyett `kiadascel:id_kiadascel(nev)` a helyes) — ezért a kiadás-kategóriák „Egyéb" címkével jelentek meg.

**Javítás**: A 4 valódi anyakönyv-táblából 5 éves trend-aggregáció. A kiadás-kategória FK helyes irányba köt.

### ✨ Animált redesign — a szám-pörgés mint lelkészi élmény

A prezentáció minden slide-ja **animáltan** jelenik meg (framer-motion 12):

- **Számok 0-ról pörögnek fel** a cél-értékre (spring-animáció, ~2 másodperc) — a közösség időben lát rá a nagyságrendre
- **Bar-diagramok** balról jobbra töltődnek be, staggered belépéssel
- **Egyházfenntartás**: nagy **animált kör-diagram** (ProgressRing) a teljesítés %-kal
- **Pillér-slide-ok**: a szám-jelvény whileHover rotate+scale, divider-vonal kifeszülő animáció
- **Esketés-slide**: a ♡ szívek lélegeznek (scale loop)
- **Záró slide**: a ✝ jel finoman lebeg

**prefers-reduced-motion**: ha a felhasználó ezt kérte, az animáció automatikusan kikapcsol.

### 📌 Megjegyzések

- Az animáció nem dekoráció — **narratív** szerepe van: a szám-pörgés a méret megérzése, a kör-becsukódás a teljesítés képe, a stagger a sorrendi fókusz. A lelkészi beszámoló közös élmény; ezt szolgálja vizuálisan.

---

## [2026-04-21s] — Hotfix: dashboard adatok + éves terv CSS Grid-re

<!-- key: 2026-04-21-hotfix-dashboard-grid -->
<!-- category: bugfix -->
<!-- version: 1.14.1 -->
<!-- targets: lelkészek -->

### 🐛 1. Dashboard adatok eltűntek — Supabase hibás select

**Tünet**: a user jelezte, hogy a Dashboard-on **eltűntek a születésnaposok, családok száma, korelosztás**. Az összes szemely-alapú adat üresen jött.

**Gyökér-ok**: a [2026-04-21o] változtatásban a születésnap-szűrőhöz hozzáadtam a `szemely.varos` és `szemely.cim` mezőket a select-hez. **DE** a `szemely` táblában **nincsenek** ilyen oszlopok — Supabase a query-t hibával elutasította, és `szemResult.data = null` lett. Ettől `activeMembers = []`, és minden KPI / Celebrations / AgeDistribution adat üresen érkezett.

A `szemely` táblában a tényleges címmezők:
- `c_utcaid` — utca ID (adrstreet FK)
- `c_szam` — házszám
- `c_tombhaz`, `c_lepcsohaz`, `c_ajto`, `c_emelet` — épület-azonosító
- `c_szcim` — szabad-szöveges lakcím

**Javítás**:
- `app/(dashboard)/dashboard/page.tsx` `szemely` select: `varos, cim` → **`c_szcim, c_szam`**
- `Member` interface frissítve mindkét oldalon (page + birthday-list-dialog)
- `BirthdayEntry` új `address: string | null` mező (összeállítva `c_szcim + c_szam`-ból)
- A korábbi `[e.varos, e.cim].filter(Boolean).join(', ')` helyett egyszerű `e.address`

### ✨ 2. Éves programterv naptár — CSS Grid-re áttérés

**Tünet**: a user képeket küldött — a mini-naptár cellák **különböző méretűek**, a rács-vonalak **néhol látszanak, néhol nem**. A HTML `<table>` + `flex: 1` + dinamikus cellamagasság kombináció nem eredményezett egyenletes layout-ot.

**Gyökér-ok**: a HTML `<table>` elem sajátos layout-szabályokat követ — a `<tr>` / `<td>` nem kezeli jól a flex / grid nyújtást, és a `border-collapse: collapse` különbözőképpen renderelődik különböző browserekben és page-break-eknél.

**Javítás** — HTML `<table>` → **CSS Grid**:

```html
<!-- Régi (inkonzisztens) -->
<table class="mini-cal">
  <thead><tr>7 × <th></tr></thead>
  <tbody>6 × <tr>7 × <td></tr></tbody>
</table>

<!-- Új (egyenletes) -->
<div class="mini-cal">  <!-- display: grid -->
  7 × <div class="dow-hdr">   <!-- fejléc sor -->
  42 × <div class="mc">       <!-- 6 hét × 7 nap -->
</div>
```

**Új CSS**:
```css
.mini-cal {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));  /* EGYENLŐ oszlopok */
  grid-template-rows: auto repeat(6, minmax(0, 1fr)); /* header + 6 hét */
  gap: 1px;                 /* A rács-vonalak forrása */
  background: #cbd5e1;      /* A gap színe = rács-vonal */
  padding: 1px;
  flex: 1;                  /* nyúlik a parent-tel */
}

.mc {
  background: #fff;          /* Cellák fedik a rács-hátteret */
  /* minimum size 0 + flex column az emelt események megjelenítéséhez */
}
```

**Előny**:
- Minden cella **pontosan egyenlő** méretű (`minmax(0, 1fr)` grid)
- Rács-vonalak **mindenütt egyforma** szélesek (1px gap + háttérszín)
- A grid `flex: 1`-el nyúlik a teljes elérhető magasságig → nincs üres tér
- Nincs `<table>`-specifikus quirk
- A `.today` és `.has-event` jelölés `box-shadow: inset` → nem tolja el a cella-méretet

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 2 régi warning (nem most keletkezett)

---

## [2026-04-21r] — Prezentáció 3-pilléres újraszervezés + éves terv flex-layout

<!-- key: 2026-04-21-presentation-3-pillars -->
<!-- category: feature -->
<!-- version: 1.14.0 -->
<!-- targets: lelkészek -->

A lelkész elküldte a gyülekezeti Közgyűlési beszámoló PDF-jét — abból derült ki a **3 pillér struktúra**: Lélekszámbeli / Lelki / Anyagi. Ez alapján újjászerveztem a prezentációt. 4 észrevétel került feldolgozásra:

### ✨ 1. Prezentáció nyomtatása most **Portal-alapú**

A korábbi `hidden print:block` megoldás nem működött megbízhatóan a dashboard-shell print-CSS-ével. Új megoldás:
- `createPortal` a `document.body`-ra — a print-content független a parent-fától
- Új CSS class `kartoteka-print-root` + `kartoteka-print-slide`
- `@media print`: `body > *:not(.kartoteka-print-root) { display: none }` — mindent elrejt a print-root-on kívül
- Minden slide egy A4 landscape lapon (297mm × 210mm), page-break-after: always

### ✨ 2. 3-pilléres slide-struktúra

A PDF-minta alapján — **13 → 20 slide**:

**Nyitó** (2 slide):
1. Címlap
2. Éves áttekintés — *"A három pillér és három kérdés"*

**1. PILLÉR — LÉLEKSZÁMBELI** *(Hányan?)* (9 slide):
3. Pillér-bevezető (teal gradient, nagy "1" szám)
4. Gyülekezet összetétele (férfi/nő)
5. Kor-eloszlás
6. Anyakönyv KPI (4 szám)
7. **Keresztelések** — **név-lista** + dátum
8. **Konfirmációk** — név-lista
9. **Esketések** — férfi ♡ nő párok lista
10. **Temetések** — név + életkor + halál/temetés dátuma
11. Anyakönyvi trend — 5 év

**2. PILLÉR — LELKI** *(Hogyan?)* (3 slide):
12. Pillér-bevezető (violet gradient)
13. **Istentiszteletek és alkalmak** — nagy szám + horizontális bar alkalomtípusok szerint
14. Gyülekezeti programok

**3. PILLÉR — ANYAGI** *(Miből?)* (6 slide):
15. Pillér-bevezető (amber gradient)
16. Számadás (SZÁMADÁS-stílusú)
17. Bevételek részletesen
18. Kiadások részletesen
19. Egyházfenntartás
20. Pénzügyi trend 5 év

**Záró** (1 slide):
21. Soli Deo Gloria

**Új adatforrás** — az `actions.ts` 4 új lekérdezéssel:
- `keresztseg` + join szemely → kereszteltek név-listája
- `konfirmalas` + join → konfirmandusok
- `hazassag` + két join (férfi + nő) → esketési párok
- `temetes` + join → temetések (tdatum + hdatum + életkor)

Új interface: `PresentationData.anyakonyv.nameLists` + `PresentationData.worship`

### ✨ 3. Opcionális következtetések + 5 éves előrejelzés

Új fájl: `components/presentation/analytics.ts` — 2 fő függvény:

**`buildConclusions(data)`** — szabály-alapú szöveges elemzés:
- Bevétel-változás az előző évhez képest (+%/-%)
- Kiadás-változás
- Év-egyenleg értékelése (pozitív/deficites)
- Anyakönyvi természetes növekedés vagy csökkenés
- Anyakönyv az 5 éves átlaghoz képest
- Egyházfenntartás teljesítési arány értékelése

**`buildForecast(data, yearsAhead)`** — lineáris regresszió (least-squares):
- Bevétel és kiadás előrejelzés 5 évre
- Pont-becslés (nem konfidencia-intervallum) — MVP szintű

2 új slide:
- `ConclusionsSlide` — kártyás elrendezés, zöld/rose/semleges direction-jelekkel (↗ ↘ →)
- `ForecastSlide` — vonaldiagram + szöveges összegzés

**Opciók-dialog** a Studio-ban:
- Első megnyitáskor automatikusan felnyílik
- 2 checkbox: Következtetések / 5 éves előrejelzés
- localStorage-es perzisztencia (`kartoteka-presentation-options-v1`)
- "Beállítások" gomb a toolbar-on (későbbi módosításhoz)
- Amber info-box: "automatikus elemzés, a Szentlélek bizonysága felülmúlja a számokat"

A `SLIDES` tömb mostantól tartalmazza a 2 opcionális slide-ot, a `visibleSlides` a user beállításai szerint szűrve.

### ✨ 4. Éves terv nyomtatás — üres helyek kitöltése

A felhasználó képén látszott: a 12 mini-naptár csak a lap ~60%-án, alatta nagy üres tér.

**CSS flex-layout fix**:
- `html, body { height: 100% }`
- `.page-wrap { min-height: calc(100vh - 16px); display: flex; flex-direction: column }`
- `.main-grid { flex: 1; min-height: 0 }`
- `.calendars { grid-template-rows: repeat(3, 1fr); min-height: 0 }`
- `.month-block { display: flex; flex-direction: column; min-height: 0 }`
- `.mini-cal { height: 100%; flex: 1 }`
- A `.mc` cellák fix magassága (18px) törölve — a grid-sor 1fr szerint dinamikusan nyúlnak

Print módban: `height: 100vh` a page-wrap-en, `minden` tartalom a teljes lapmagasságig nyúlik.

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

---

## [2026-04-21q] — Programok modul finomhangolás: A4, év-tartomány, ünnepek, gyors bevitel

<!-- key: 2026-04-21-programs-module-polish -->
<!-- category: improvement -->
<!-- version: 1.13.2 -->
<!-- targets: lelkészek -->

4 célzott észrevétel a gyülekezeti programok modulra:

### ✨ 1. Éves programterv — A4 landscape keskeny margókkal

- A4 landscape 5mm margóval — több tartalom, mint az A3-nál (akkora felület nem kell)
- Minden elem **kompaktabb**: hónap-blokkok padding 6 → 4, betűk 13px → 11px (hónap-cím), napok 10.5px → 9px
- Oldalsáv szélesség: 220px → 165px
- Logó: 78×78 → 58×58
- Évbadge: 100×78 → 76×58 (32px → 26px font)
- A lap magasabban hasznosul: nincs fehér tér, minden pixel a tartalomé

### ✨ 2. Oldalsáv: program-dátum (mettől-meddig) + ünnepek integrálva

- Az eddigi egy dátum (`09 jan`) helyett **dátum-tartomány**: `14-16 jún` (azonos hónap), vagy `28 márc - 02 ápr` (hónap-váltás)
- Új `formatDateRange(start, end)` helper
- **Az ünnepek is megjelennek** az oldalsávon (eddig csak a naptárban voltak):
  - Dátumuk, nevük, `✝` ikon
  - `durationDays` alapján a tartomány (pl. Húsvét 2 napos, Pünkösd 2 napos, Karácsony 25-26)
  - Amber `holiday-item` stílus (italic, narancsos-sárga szín)
- **Kombinált lista**: programok + ünnepek egy közös `combinedItems` tömbbe, dátum szerint rendezve
- Oldalsáv címe: „Az év eseményei" → „Események & ünnepek"

### ✨ 3. Év-választás bővítése

- `program-scheduler.tsx`: `yearOptions` +1 / -3 év → **+5 / -10 év**
- A lelkész **előre is tervezhet** több évre (pl. 2031-ig), és **visszamenőleg** is nyomtathat (pl. 2016-tól)
- Az `AnnualPlanPrint` minden évvel működik — csak a programokat és a `getReformedHolidaysForYear(year)` adatokat kell átadni

### ✨ 4. Gyors bevitel — kártyás, két-soros layout

A korábbi `table` layout szűk volt: a Cím mező `text-xs` + h-8 = nem olvasható.

**Új**:
- Minden program **egy kártya** (rounded-[1rem], border, hover shadow)
- **1. sor**: nagy Cím mező (h-10, text-base, font-medium) + szám-jelölő + törlés gomb
- **2. sor**: a többi mező (dátum, idő, típus, helyszín, prioritás, ismétlődés) — `grid-cols-2` mobilon, desktop-on 8 oszlopos grid
- Minden kis-mező felett egy kis uppercase **label** (text-[10px])
- A cím mező fókuszban látszik, a többi finomítva alatta

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 PDF-filename

A PDF-mentés továbbra is `jsPDF: { format: 'a4', orientation: 'landscape' }` — ez most megegyezik a `@page` beállítással, így a screen-print és a PDF azonos.

---

## [2026-04-21p] — Prezentáció: SZÁMADÁS-stílusú részletes pénzügy

<!-- key: 2026-04-21-presentation-szamadas-style -->
<!-- category: feature -->
<!-- version: 1.13.1 -->
<!-- targets: lelkészek -->

A lelkész küldött egy PDF-mintát a Barátosi Református Egyházközség éves SZÁMADÁS-áról — részletes, tételenkénti bevétel/kiadás lista, horizontális bar-okkal. A prezentáció pénzügyi része **eddig csak Top 8**-at mutatott pie-chart-ban; mostantól **minden tétel** megjelenik SZÁMADÁS-stílusban.

### ✨ Változások

**Adat (actions.ts)**:
- A `incomeByCategory` és `expenseByCategory` már **nem** korlátozódik `.slice(0, 8)`-ra — **minden tétel**, ahol van mozgás (filter: amount > 0).
- Továbbra is csökkenő sorrendben (legnagyobb legelöl).

**Új slide-struktúra (slides.tsx)**:
- Törölve: `FinanceOverviewSlide` (line chart), `IncomeCategoriesSlide` (pie + Top 8), `ExpenseCategoriesSlide` (pie + Top 8)
- Új: **4 pénzügyi slide** ebben a sorrendben:
  1. **Számadás** (`finance-summary`) — SZÁMADÁS-fejléchez hasonló dashboard: Bevételek + Kiadások nagy KPI-kártyával (zöld/rose gradient), alatta az "Év pénzügyi mozgása" kártya (zöld ha pozitív, amber ha negatív) + ↗/↘ ikon
  2. **Bevételek részletesen** (`income-detail`) — minden tétel egy sorban, horizontális bar + pontosított összeg; a legnagyobb felül; kitöltött listában elfér akár 20-30 tétel is
  3. **Kiadások részletesen** (`expense-detail`) — ugyanaz, rose-narancs palettával
  4. **Pénzügyi trend — 5 év** (`finance-trend`) — a régi line chart (bevétel/kiadás évenkénti összehasonlítás), most átnevezve és az új sorrendben az utolsó helyen

**Vizuális elemek** (a SZÁMADÁS PDF ihletésével):
- Bevételnél: emerald-teal paletta, határ-csík a cím alatt
- Kiadásnál: rose-orange paletta
- A tételek között **dinamikus szín-rotáció** (12 szín), ugyanúgy mint a PDF-en
- A bar-ok szélessége a tétel-összeg arányában (max-amount-hoz képest)
- A cím mellett az **éves összeg** kiírva a nagyobb fontosság-jelzéshez

**Layout**:
- Design módban: kompakt (h-5 bar, text-xs)
- Projection módban: nagyobb (h-7 bar, text-base)
- Az aspect-[16/9] slide-frame maradt, a lista `flex-1 overflow-y-auto` — ha sok a tétel, görgethető

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 Megjegyzés

A SZÁMADÁS PDF-en volt még két **szöveges megjegyzés-kártya** ("Hála és köszönet!" + "2024-ben a általános javítás..." bullet-pontokkal). Ezek **a lelkészi kommentár** mezőbe mehetnek (slide-szerkesztőben), már most is elérhető mind a 4 pénzügyi slide-on — a szöveg lent, violet keretes.

---

## [2026-04-21o] — 6 észrevétel: fullscreen, éves terv redesign, lakhely, widget, settings, dark mode

<!-- key: 2026-04-21-six-improvements -->
<!-- category: feature -->
<!-- version: 1.13.0 -->
<!-- targets: lelkészek -->

### ✨ 1. Prezentáció igazi fullscreen (képernyő nem csak ablak)

- `components/presentation/presentation-studio.tsx`: új `enterFullscreen()` / `exitFullscreen()` függvények
- `document.documentElement.requestFullscreen({ navigationUI: 'hide' })` — a böngésző **teljes képernyős** módja, nem csak az ablak
- `fullscreenchange` event figyelés — ha a user F11-el vagy Escape-pel lépett ki, a UI-state szinkronizálódik
- A container `ref`-ből hívja a fullscreen API-t (a slide-container-re)
- A vetítés 92vw × 92vh-ra nőtt (volt 90×90)

### ✨ 2. Éves programterv — TELJES redesign (klasszikus mini-naptárak)

**A korábbi layout hibás volt**: egyetlen függőleges „Nap" oszlop balra + 12 hónap oszlop jobbra, a napok (Vas/Hétfő/Kedd/...) hetenként ismétlődő sorokban. Az eredmény olyan volt, mintha egy Excel-táblázat kaszkádolna lefelé (lásd a felhasználó által küldött PDF).

Mostantól **12 mini-naptár 4×3-as rácsban**:
- Minden hónap saját kis táblázata (7 oszlop = hét napjai, 6 sor = hetek)
- Hét **hétfővel kezdődik** (európai konvenció)
- A cellában: dátum-szám fenn, esemény-jel alatta
- **Hétvége-kódolás**: vasárnap rózsa, szombat amber, ünnep sárga outline
- **Program-napok**: zöld emerald outline
- **Ma**: 2px emerald outline, kiemelt háttér

**Az oldalsáv**: az év minden eseménye időrendi sorrendben, szín-csíkkal a program-típushoz.

**Layout**: A3 landscape, a fejléc (címer + cím + évbadge) megmarad, a motto+igehely is.

**Új fájl struktúra**: `buildMonthCells(year, month)` helper egy hónap napi mátrixát készíti — a régi hetenkénti hibás iterációt teljesen kiváltja.

### ✨ 3. Születésnap nyomtatás — lakhely opció

- `components/dashboard/birthday-list-dialog.tsx`: új `showAddress` state + checkbox a szűrőkben
- A `Member` interface kapott `varos?: string | null, cim?: string | null` mezőket
- Amikor be van kapcsolva:
  - A képernyős listában új "Lakhely" oszlop (város + cím)
  - A nyomtatási PDF-ben is megjelenik egy dőlt szürke oszlop
- `app/(dashboard)/dashboard/page.tsx`: a `szemely` select lekérdezés bővítve a `varos, cim` mezőkkel
- A `Member` interface is bővült

### ✨ 4. Publikus oldal widget — eltávolítva a dashboard aljáról

- `components/dashboard/public-site-widget.tsx` már nem hívódik a `dashboard/page.tsx`-ből
- Indok: a publikus oldal státusza a **KPI-kártyán** már látszik (5. kártya: „Élő / Beállítás →"), külön doboz redundáns
- A komponens-fájl megmarad a repo-ban (nem használt, de nem is töröljük — későbbi újrahasználat lehetséges)

### ✨ 5. Beállítások modal — üres tér kitöltve

- Az oldalsáv alá új **Tipp-doboz**: *„A beállításaid jelenleg a böngészőben tárolódnak..."*
- Alatta: **bejelentkezett user email-je** (ha van)
- **Nyelv tab** kibővítve: 3 szekció (Felület nyelve + Hivatalos iratok nyelve + Fordítási készültség progress-bar-okkal)
- **Publikus oldal tab** kibővítve: 2 szekció (státusz + „Mit ad a publikus oldal?" 4-pontos lista ikonokkal)
- Az oldalsáv és tartalom **egyenletes** magasság — nincs üres tér desktop nézeten

### ✨ 6. Dark mode olvashatóság — alap fix

A Tailwind `bg-white`, `text-slate-*`, `bg-slate-50`, `border-slate-*` osztályok sok komponensben **hardkódoltak** — dark mode-ban fehér háttér, sötét szöveg maradt → olvashatatlan.

Új szekció: `app/globals.css` — `.dark { ... }` override-ok:
- `.card-raised` → dark háttér + világos keret
- `.bg-white` → `var(--card)` (dark card bg)
- `.text-slate-900/800/700` → `var(--foreground)` (világos szöveg)
- `.text-slate-500/400` → `var(--muted-foreground)`
- `.border-slate-*` → `var(--border)`
- Színezett 50-es hátterek (emerald-50, amber-50, sky-50, rose-50, violet-50, indigo-50) → tompa, átlátszó változatok dark háttérre
- Sötét szövegárnyalatok (text-emerald-900, text-amber-900, stb.) → világos megfelelők

**Megjegyzés**: ez egy **MVP-megoldás**. Hosszabb távon a komponensekben a semantic tokens (`bg-background`, `text-foreground`, `bg-card`) használata a jó megoldás — de az hosszú audit. Most **olvashatóvá** teszi a dark mode-ot, 95%-ban.

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning (az új kódban)

---

## [2026-04-21n] — F5: Banner gomb + Prezentáció PDF + tartozás-rendszer terv

<!-- key: 2026-04-21-phase-5-wrap-up -->
<!-- category: feature -->
<!-- version: 1.12.1 -->
<!-- targets: lelkészek -->

Kisebb csomag az előző session folytatásaként:

### ✨ Új / javítás

**F5.1 Januári banner „Beállítom most" gomb — működőképes**
- `components/dashboard/current-year-fee-banner.tsx` — a gomb mostantól dispatchol egy `kartoteka:open-congregation-dialog` Window CustomEvent-et
- `components/layout/dashboard-shell.tsx` — `useEffect`-tel figyel az eseményre, megnyitja a `CongregationDialog`-ot
- **Tervezési mintázat**: a page-level komponensek (banner, widget-ek) szabadon eseményt dispatch-elhetnek, és a shell elkapja — nem kell prop-drilling.

**F5.2 Prezentáció valós többoldalas PDF-export**
- Korábban a `window.print()` csak az **aktuálisan megjelenített** slide-ot nyomtatta (browser Print → PDF opcióval).
- Most: `@media print` CSS-ben **minden 12 slide** renderelődik a rejtett containerben, `pageBreakAfter: always` elválasztással. A browser Print dialog → **12 oldalas PDF** A4 landscape-en.
- `app/globals.css` új szekció: `@media print` — slide-ok teljes képernyősek, header/nav elrejtve, A4 landscape `@page` szabály.
- A `window.print()` megnyomása után: a böngésző Print Preview-ja **mind a 12 slide-ot** mutatja sorban. A lelkész PDF-ként is mentheti, vagy direktben nyomtathat.

**F5.3 Tervdokumentum — tartozás-rendszerek egyesítése**
- Új fájl: `docs/project-tracking/KARTOTEKA-tartozas-rendszer-egysegesites-terv.md`
- **Felfedezés**: a rendszer két párhuzamos tartozás-számítást használ:
  - Régi: `bealitas` tábla alapú — MemberDetailsDialog „Hátralék" tab
  - Új: `congregation_annual_fees` + `congregation_custom_fees` — AnnualFeesPanel + `calculateMemberDebt()`
- Ha a lelkész az AnnualFeesPanel-ben módosít egy éves díjat, az új táblába kerül, de a régi UI-t nem frissíti. **A két rendszer nincs szinkronban.**
- 3 javaslat a user döntésére:
  - **A**: most semmit (jelenlegi működés OK)
  - **B**: bidirekcionális sync (~1 óra) — a saveAnnualFee mindkettőbe ír
  - **C**: teljes refactor (~2-3 nap) — `computeJarulekForMemberYear` átírása az új rendszerre

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 A user-nek kérdés

Melyik utat szeretnéd a tartozás-rendszerek egyesítéséhez? (A / B / C az `KARTOTEKA-tartozas-rendszer-egysegesites-terv.md`-ben)

---

## [2026-04-21m] — 3-4. Fázis: Éves terv redesign + Prezentáció studio

<!-- key: 2026-04-21-phase-3-4-presentation -->
<!-- category: feature -->
<!-- version: 1.12.0 -->
<!-- targets: lelkészek -->

### ✨ F3: Éves programterv TELJES UI-redesign

**`components/dashboard/annual-plan-print.tsx`** — a korábbi egyszerű kalendárium-nyomtatás **kifüggeszthetővé** vált:

- **Gyülekezeti címer** a fejlécben (balra), `cimer_url` a `congregations`-ből
- **Márkaszín-paletta**: teal + amber (nem régi navy-szürke)
- **Serif tipográfia** (Georgia) a fejlécben — emelkedettebb hangulat
- **Évbadge** amber gradient-tel jobbra (112×84, 34px font)
- **Évbeli motto + igehely**: „Mindenkinek rendelt ideje van..." — Préd. 3:1
- **Református ünnepek AUTOMATIKUSAN** a kalendáriumba (minden évben megjelennek, amber háttérrel, ✝ szimbólummal):
  - Fix: Újév, Reformáció napja, Szenteste, Karácsony (2 nap)
  - Mozgó: Virágvasárnap, Nagypéntek, Húsvét (2 nap), Áldozócsütörtök, Pünkösd (2 nap)
- **Bővített jelmagyarázat**: program-típusok + ref. ünnep + ma + vasárnap
- **Nagyobb betűméret** (8.5px → 11px a hónap fejlécben, 9px a napokban)
- **PDF-mentés** megmarad (html2pdf.js) + nyomtatás + bezárás
- **`congregationLogo` prop** átfolyva a `ProgramScheduler`-en keresztül

### ✨ F4: Prezentáció Studio — teljesen új modul

**Új 5. KPI-kártya** a Dashboard-on: „**Prezentáció** — Éves beszámoló →" (violet gradient, `Presentation` ikon). A `xl:grid-cols-4` → `xl:grid-cols-5`-re vált.

**Új route**: `/eves-jelentes/prezentacio`

**Új server action**: `app/(dashboard)/eves-jelentes/prezentacio/actions.ts`
- `getPresentationData(year)` — egy adott évre összegyűjti:
  - **Gyülekezet**: név, címer
  - **Tagok**: aktív szám, családok, férfi/nő arány, kor-eloszlás (0-18, 19-40, 41-65, 66+), 5 éves trend
  - **Anyakönyv**: keresztelések, konfirmációk, esketések, temetések (aktuális + 5 éves trend)
  - **Pénzügy**: bevétel/kiadás, 5 éves trend, bevétel és kiadás kategóriánként (Top 8), egyházfenntartás teljesítés %
  - **Programok**: összes, teljesített, típus szerint

**Új komponens**: `components/presentation/presentation-studio.tsx`
- 3-oszlopos layout: balra slide-lista (navigáció), középen preview, jobbra beállítások (év-választás + tipp)
- 12 slide, billentyűzet-navigáció (←/→/PageDown/PageUp/Escape)
- **Vetítés mód**: fullscreen, fekete háttér, nagyobb betűméret, minimalis kontrollok
- **Szerkesztő**: minden slide-hoz cím / alcím / **lelkészi kommentár** (localStorage-ben tárolva)
- **Nyomtatás** gomb (window.print)
- Év-váltás: Input onBlur → router.push(`?year=...`)

**12 slide sablon** (`components/presentation/slides.tsx`):
1. **Cím** — gyülekezet + év + címer
2. **Áttekintés** — 4 KPI (tagok, családok, bevétel, kiadás)
3. **Gyülekezet összetétele** — férfi/nő pie chart
4. **Kor-eloszlás** — oszlopdiagram (4 csoport)
5. **Anyakönyv** — 4 KPI (keresztelő, konfirmáció, esketés, temetés)
6. **Anyakönyv 5 év trend** — csoportosított oszlopdiagram
7. **Pénzügyi áttekintés** — bevétel/kiadás vonaldiagram 5 évre
8. **Bevétel kategóriák** — pie chart + lista (Top 8)
9. **Kiadás kategóriák** — pie chart + lista (Top 8)
10. **Egyházfenntartás teljesítés** — 3 KPI-blokk (aktív tagok, fizettek, arány %)
11. **Programok** — KPI-blokkok + típus szerinti vízszintes oszlopdiagram
12. **Záró** — „Soli Deo Gloria" + lelkészi záró ige

**Chart library**: Recharts 3.8.1 (már telepítve)

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📌 Továbbfejlesztési lehetőségek (későbbre)

- **Slide sorrend átrendezés** drag-and-drop-pal
- **Slide kikapcsolása** (rejtés a vetítésből)
- **Saját slide** hozzáadása (szabad szöveg)
- **Képek beillesztése** a slide-okba
- **PDF export** (most csak browser print)
- **Perzisztencia**: a szerkesztett szövegek DB-ben (most localStorage)

---

## [2026-04-21l] — 2. Fázis: Névjelentések, születésnap-szűrő, tartozás-horizont, januári banner

<!-- key: 2026-04-21-phase-2-medium-features -->
<!-- category: feature -->
<!-- version: 1.11.0 -->
<!-- targets: lelkészek -->

Nagy csomag — egyszerre öt új funkció:

### ✨ Új funkciók

**F2.1 Névjelentések a Dashboard hero-ban:**
- Új adatbázis: `lib/data/name-meanings.ts` — ~140 leggyakoribb magyar keresztnév + **eredet** + **jelentés**
- `lookupNameMeaning(name)` — ékezet-toleráns, esetfüggetlen kereső
- Hero banner: a mai névnap-nevek alatt új szekcióban kiírja a jelentést, pl.
  „*Endre (görög) — férfias, bátor*" · „*Ildikó (germán) — harcos*"
- Diagnosztikai SQL: `2026-04-21-nevnap-diagnosis.sql` — a lelkész ezzel ellenőrizheti, hogy a `nevnap` tábla az erdélyi református naptár szerint van-e (ha nem, új seed szükséges)

**F2.2 Születésnap-szűrő és nyomtatás:**
- Új komponens: `components/dashboard/birthday-list-dialog.tsx`
- Gomb a Celebrations kártya fejlécében: **„Lista"** (amber chip)
- Modal tartalma:
  - Időszak-preset: „Ezen a héten / Ez a hónap / Köv. hónap / Egész év / Egyéni"
  - Életkor-szűrő (tól / ig)
  - Nem-szűrő (Mindenki / Férfi / Nő)
  - Eredmény-lista (áttekinthető táblázat, név + nap + életkor + ♂/♀)
  - **Nyomtatás** gomb: A4 portrait, saját ablakban, logóval, gyülekezet fejléccel, időszak-jelzéssel

**F2.3 Tartozás-horizont (user jóváhagyva):**
- Új fájl: `app/(dashboard)/penzugy/tartozas-actions.ts`
- `calculateMemberDebt(congregationId, memberId)` — részletes tartozás-számítás
  - **18 éves kortól** számol (fiatalabbra nincs tartozás; a tartozáson az életkor is látszik)
  - **Utolsó fizetés + 1**-től kezdi a horizontot (ha sosem fizetett, a 18. születésnapjától)
  - **Kedvezmény-ellenőrzés**: aki időszaki kedvezmény feltételének megfelelt (kedvezményes összeget fizette határidőn belül), VAGY kor-alapú kedvezmény kor-küszöbét elérte + kedvezményes díjat kifizetett → **teljesen kifizetettnek** számít
  - **Gyülekezet-specifikus díjak** (`congregation_custom_fees`) automatikusan hozzáadódnak, a tag életkora szerinti szűréssel
- `saveAnnualFee()` — egyszerűsített upsert (year + amount)
- `deleteAnnualFee()` — warning-gal

**F2.3.a Évenkénti díjak táblázat az Alapdíj al-tabon:**
- Új komponens: `AnnualFeesPanel` a CongregationDialogV2 fájljában
- Táblázatos inline-edit, bármennyi év visszamenőleg (default 10, +10 gombbal bővíthető)
- Aktuális év emerald-highlighted, szerkesztése a fenti „Teljes éves díj" mezőn át
- Régebbi évek: szerkeszthető összeg, törlés gomb (confirm-dialog)
- Hozzáadás: `+ Hozzáadás` gomb a még nem rögzített éveknél
- Magyarázó info-box: „régebbi évekhez nincs kedvezmény, elmaradásnak számítanak"
- **Az Éves előzmények külső tab törölve** — beolvasztva az Alapdíj al-tabra

**F2.4 Januári sárga banner:**
- Új komponens: `components/dashboard/current-year-fee-banner.tsx`
- A dashboard tetején (a Hero fölött) megjelenik, ha:
  - `congregations.eves_jarulek` ≤ 0 VAGY null, **ÉS**
  - `congregation_annual_fees` nem tartalmaz sort az aktuális évre
- Tartalma: amber gradient, figyelmeztetés-ikon, cím „Állítsd be a {év}-es díjat!"
- Két gomb: „Beállítom most" (jövőben Congregation modal megnyitás), „Emlékeztess később" (localStorage dismiss)
- LocalStorage dismiss: `fee-banner-dismissed-{year}` — ha ki van dismiss-elve, csak új évben jelenik meg újra

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning az új fájlokban

### 📝 SQL migráció még nincs

A tartozás-számítás a meglévő `congregation_annual_fees` táblát használja (2026-04-09-god-mode sql-ből). Új SQL nem kell.

---

## [2026-04-21k] — 1. Fázis: Csengő animáció, ünnepi köszöntés, Beállítások modal

<!-- key: 2026-04-21-phase-1-ui-polish -->
<!-- category: feature -->
<!-- version: 1.10.0 -->
<!-- targets: lelkészek -->

Három UI-feature egy fázisban: az értesítés-csengő megszépítve és animálva, a Dashboard üdvözlés az egyházi ünnepeket figyelembe véve, és új **Beállítások modal** a header avatár-menüjében — 5 lappal (értesítések, megjelenés, nyelv, publikus oldal, adat & biztonság).

### ✨ Új funkciók

**F1.1 Csengő animáció + szebb dropdown:**
- CSS keyframes: `bell-soft-pulse` (nyugodt 3 sec pulzálás amíg van olvasatlan), `bell-shake` (egyszeri 1.4 sec ring-shake új értesítésre), `badge-pulse-ring` (piros badge körüli glow)
- A gomb háttere amber glow-ra vált amíg van olvasatlan (`.bell-btn-glow`)
- Az ikon váltás: `Bell` → `BellDot` ha van olvasatlan
- Dropdown szebb fejléccel: gradient + sparkles + olvasatlanok száma
- Relatív idő megjelenítés (pl. „3 órája")
- Dialog részletes megjelenítés: serif cím, slate-bordered tartalom

**F1.2 Ünnepi köszöntés + keresztnév:**
- Új fájl: `lib/utils/reformed-holidays.ts`
- 9 református ünnep: Újév, Virágvasárnap, Nagypéntek, Húsvét, Áldozócsütörtök, Pünkösd, Reformáció napja, Szenteste, Karácsony
- Húsvét dátum-számítás: Gauss-Butcher algoritmus (gregoriánus)
- `getPersonalizedGreeting(firstName, date)`: ünnep prioritás, különben napszak
- `extractFirstName(fullName)`: a magyar név-sorrend szerint az **utolsó szó** a keresztnév
- Hero banner: amikor ünnep van, új amber chip a köszöntés mellé a Sparkles ikonnal

**F1.3 Beállítások modal:**
- Új komponens: `components/modals/settings-dialog.tsx`
- Új menüpont a header dropdown-ban: „Beállítások" (Settings ikon, a Rendszergazdai mód **előtt**)
- Új komponens: `components/layout/theme-provider.tsx` — a `next-themes` wrapper
- Root layout bővítve: `<ThemeProvider attribute="class" defaultTheme="light" enableSystem>`
- 5 tab:
  1. **Értesítések**: email kapcsoló + 5 típus-szűrő (admin, warning, danger, support, info)
  2. **Megjelenés**: világos / sötét / rendszer mód (kártyás választó) + betűméret 3 opció (béta)
  3. **Nyelv**: HU/RO (a román hamarosan, placeholder)
  4. **Publikus oldal**: státusz-panel + link a `/publikus-oldal` modulra
  5. **Adat & biztonság**: offline gyorstár link + „kijelentkezés minden eszközön" (hamarosan)
- MVP: a beállítások **localStorage**-ben (`kartoteka-user-prefs-v1`). Később `user_preferences` SQL tábla
- Dark mode: béta figyelmeztetés (egyes modul-specifikus UI elemek még csak világos módban optimálisak)

### 🧪 Ellenőrzés

- `tsc --noEmit` → Exit 0
- `eslint` → 0 error, 0 warning

### 📝 Megjegyzés

A 3. pontra („beállítások opcióinak bővítése") a **nyelv** és **betűméret** került be extra elemként a javaslom szerint. Az email-értesítés és dark mode **localStorage**-ben dolgozik — a Supabase-es perzisztálás egy későbbi fázis.

---

## [2026-04-21j] — CongregationDialog második csomag: panelek grid, Szervezet beolvasztás, gyülekezet-specifikus díjak

<!-- key: 2026-04-21-congregation-dialog-second-pack -->
<!-- category: feature -->
<!-- version: 1.9.2 -->
<!-- targets: lelkészek -->

Öt dolog egyszerre:

1. **Alapdíj al-tab panelek egymás mellett** (grid), `xl:grid-cols-2` — az "Éves egyházfenntartás" és a "Tartozás számítási módja" vízszintesen jelenik meg desktop-on.
2. **Szervezet tab törölve**, tartalma beolvasztva az Alapadatok tabba új "Szervezeti hovatartozás" panelként. **Az egyházkerület neve is látszik** (`dioceses.districts.name` JOIN alapján), az egyházmegye selectbe a kerület is kiíródik.
3. **Több kedvezményes időszak egy évben**: a Meglévő kedvezmények panel **évenkénti csoportosítást** kapott (év-badge + N kedvezmény), és egy magyarázó zöld doboz: "több időszaki kedvezményt is be lehet állítani, a sorrend szerint alkalmazódnak".
4. **Gyülekezet-specifikus díjak** (ÚJ FEATURE): új al-tab a Pénzügy-ben: **"Egyéb díjak"** (HandCoins ikon). Itt a lelkész a presbitérium által megszavazott különdíjakat rögzíti (pl. temetős karbantartás, harangozási díj, kántorilletmény). Mezők: név, leírás, éves összeg, érvényesség (year_from / year_to), korhatár (kor_tol / kor_ig), aktív toggle.
5. **Tartozás-terv frissítve** a user válaszaival: **18 éves kortól** számol a rendszer (életkor megjelenítéssel), **kedvezmény-ellenőrzés** a részleges befizetéseknél (aki a kedvezmény feltételének megfelelt = teljesen kifizetett), **nincs év-limit** a visszamenőleges díj-bevezetésnél, **januári sárga banner** az új évi díj-beállítás emlékeztetésére.

### ✨ Változások

**UI:**
- `components/modals/congregation-dialog-v2.tsx`:
  - Alapadatok tab: új "Szervezeti hovatartozás" Panel — egyházkerület (read-only, dioceses JOIN-ból) + egyházmegye select (kerületi névvel)
  - Külső TabsList: `sm:grid-cols-3` (volt 4), "szervezet" trigger + TabsContent törölve
  - Pénzügy → Alapdíj al-tab: `xl:grid-cols-2` grid (panelek egymás mellett); fizetési határidő info-szöveg egyszerűsítve
  - Pénzügy → Kedvezmények al-tab: zöld magyarázó doboz "több időszaki kedvezmény", évenkénti csoportosítás (év-badge + sorrend szerint rendezett lista)
  - Új Pénzügy al-tab: **"Egyéb díjak"** — CustomFeeCard kártyás lista + CRUD form

**Backend:**
- `getDioceses()` bővítve: `district_id` + `district_name` (JOIN districts-szel)
- Új SQL migráció: `migration-docs/sql/2026-04-21-congregation-custom-fees.sql` (tábla + RLS + index + GRANT + updated_at trigger)
- Új action-ök a `app/(dashboard)/congregation/actions.ts`-ben:
  - `getCongregationCustomFees(congregationId)`
  - `saveCongregationCustomFee(congregationId, payload)` — Zod validációval
  - `deleteCongregationCustomFee(congregationId, feeId)`
- `CustomFeeRow` interface export

**Új komponens:**
- `CustomFeeCard` — olvasó nézet a lista-sorhoz; aktív/inaktív állapot vizuális megkülönböztetése (opacity, badge); összeg, érvényesség, korhatár chip-ekkel

### 📋 Függőben — user jóváhagyásra vár

A **Fázis 5** (éves előzmények + tartozás-horizont) implementáció a `KARTOTEKA-eves-egyhazfenntartas-tabla-terv.md` **9. és 10. szakaszában** részletezve — frissítve a user válaszaival. Implementációs fázisok: 1) server actions, 2) éves táblázat UI, 3) éves előzmények tab törlése, 4) januári banner, 5) tag tartozás megjelenítés. **Megbecsülés**: 2-3 munkanap.

### ⚠️ Új SQL-migráció

**Endrének futtatnia kell**: `migration-docs/sql/2026-04-21-congregation-custom-fees.sql`. Addig az "Egyéb díjak" al-tab egy sárga figyelmeztetést mutat, de nem blokkolja a többi funkciót.

---

## [2026-04-21i] — CongregationDialog finomhangolás: oldalsó al-tabok + határidő eltávolítása

<!-- key: 2026-04-21-congregation-dialog-sidenav -->
<!-- category: improvement -->
<!-- version: 1.9.1 -->
<!-- targets: lelkészek -->

A „Gyülekezetünk adatai" → Pénzügy tab belső 3 al-tabja (Alapdíj / Kedvezmények / Bankszámlák) **desktopon most oldalt** jelenik meg, mobilon továbbra is fent (responsive). A fizetési határidő mező **eltávolítva** — a szabály: az alapdíj határideje **automatikusan december 31.** Külön kedvezményes határidőt a Kedvezmények fülön lehet állítani.

### ✨ Változások

- **Oldalsó al-tab nav (desktop)**: `md:flex-row` + `md:flex-col` TabsList bal oldalon (w-56). Mobilon fent vízszintes.
- **Fizetési határidő mező törölve** az Alapdíj panelről. Default érték `12-31`, a DB-be automatikusan mentődik. A magyarázó info-box frissítve: a kedvezményes határidőket a „Kedvezmények" fülön lehet beállítani.
- **Initial state** és **loadedForm fallback**: `jarulekHatarid: '12-31'`.

### 📋 Tervdokumentumok — user jóváhagyásra vár

- **`KARTOTEKA-eves-egyhazfenntartas-tabla-terv.md`** — az Éves előzmények tab beolvasztása a Pénzügy → Alapdíj al-tabba, 10 évre visszamenőleges díj-rögzítés **kedvezmény nélkül** (elmaradásnak számít), **új tartozás-horizont logika**: a rendszer a tartozást az utolsó rögzített kifizetéstől számolja vissza. 5 kérdés a user-hez:
  1. Ha sosem fizetett → mettől számoljuk?
  2. Részleges befizetés → beszámít?
  3. Éves díj törlése → mi történik a rá mutató befizetésekkel?
  4. 10 év default + bővítés hány évvel?
  5. Aktuális év a `congregations.eves_jarulek`-ben vagy az `congregation_annual_fees`-ben tároljuk?

---

## [2026-04-21h] — UI-csomag: házszám-prefix, webcím link, CongregationDialog újraszervezés

<!-- key: 2026-04-21-ui-pack-congregation-dialog -->
<!-- category: improvement -->
<!-- version: 1.9.0 -->
<!-- targets: lelkészek -->

Több észrevétel egy csomagban: a cím-formátum a román konvenciókhoz igazodik (Strada X, nr. Y), a gyülekezeti weboldal mezőnél a Kartotéka publikus oldal is látszik, és a „Gyülekezetünk adatai" modal Pénzügy tabja **teljesen újratervezve** — 3 al-tab + kártyás kedvezmény-típus-választó + magyarázó példák.

### ✨ Új funkciók és javítások

**Cím (AddressForm):**
- **Új `lib/address/format.ts`** helper: `formatStreetWithType()` (a „Strada"/„Bd."/… prefixet automatikusan elé teszi, ha nincs) és `formatHouseNumber()` (a „nr." prefixet a házszám elé teszi).
- **Utca kiválasztásnál** a rendszer automatikusan „Strada X" formátumban menti, ha az adrstreet-ben van `street_type_ro`, azt használja.
- **Házszám mezőben** onBlur-kor a „nr." automatikusan elé kerül.
- **Layout javítás**: az Utca mező önálló sorban, a Házszám + Irányítószám 2-oszlopos gridben — mobilon is látható és használható.
- **Segítő szövegek** minden mező alatt (pl. „A rendszer automatikusan kiegészíti a »Strada«-val" / „A »nr.« automatikusan kerül elé").

**Webcím (CongregationDialogV2 Alapadatok tab):**
- Ha a gyülekezet publikus oldala aktív (`public_site_enabled = true` + `public_slug`), a Weboldal mező alatt megjelenik egy zöld link-panel: `🌐 Kartotéka publikus oldal: /gy/<slug>` (kattintható, új tabban nyílik).
- Ha nincs aktiválva, egy kis tipp: „Saját Kartotéka-oldal létrehozása: oldalsáv → Publikus oldal".

**Pénzügy tab (teljes UI-refactor):**
- **Az „Örökölt kompatibilitási adatok" panel törölve** — a fő bank / fő IBAN / címer URL mezők zavarosak voltak. A címer a fejléc file-upload-ján változtatható, a bank adatok a default bankszámlából származnak.
- **3 belső al-tab**: `Alapdíj` / `Kedvezmények` / `Bankszámlák` — a hosszú scroll helyett fókuszált lapok.
- **Az Alapdíj al-tabon**: Éves díj + határidő **magyarázó info-box-szal**; Tartozás-számítási mód **kártyás** radio **példával** (a 2023-as 150 RON vs. 2026-os 200 RON tartozás eset).
- **A Kedvezmények al-tabon**: **3 nagy kártyás típus-választó** ikonokkal, címekkel, leírásokkal, **konkrét példákkal** (pl. „65+ éves tag 75 RON-t fizet a 150 helyett").  Az „Aktív" mező dropdown helyett **toggle-kapcsolóvá** alakítva leíró szöveggel.
- **A Bankszámlák al-tabon**: a meglévő lista + form, változatlan logika.

### 📌 Dizájnfilozófia

A modal eddig sok részt egy lapon tömörített, ami kognitív terhelést okozott. Az új struktúra a „**egy feladat = egy al-tab**" elvet követi. A kedvezmény-típusok kártyás megjelenítése és a példák a lelkészt **vizuálisan** vezetik végig — nem kell a fejében elképzelnie, mi lesz az eredmény.

---

## [2026-04-21g] — Szigorítás: a helység is kötelezően a listából — „kézi bevitel" csak az utcánál

<!-- key: 2026-04-21-locality-list-only -->
<!-- category: improvement -->
<!-- version: 1.8.6 -->
<!-- targets: lelkészek -->

A megye és a helység **a listából** kötelezően választandó — a „Használd kézzel" fallback gomb **csak az utcánál** marad meg. Indoklás: a 42 megye és a 13 832 helység a Poșta Română + GeoNames adatból **teljes körű** — nincs olyan romániai helység, amit ne tudna a rendszer. Az utca ellenben ~58% lefedettségű, ott a kézi bevitel valódi szükséglet.

### 🔧 Változások

- **Helység autocomplete**: az amber „kézi" badge + a dropdown alján található „Használd kézzel" gomb **eltávolítva**. Ha nincs találat: a dropdown egy barátságos üzenetet mutat („Próbáld a helség magyar vagy román nevét — a rendszer mindkettőt érti").
- **Utca autocomplete**: **változatlan** — a kézi fallback továbbra is elérhető.
- **Régi adatok automatikus felismerése (helység-rematch)**: ha a DB-ben már van szövegesen mentve a város (pl. `form.varos = "Kolozsvár"`, de `adrlocality_id = NULL`), a wizard **betöltéskor** automatikusan megpróbálja exact match-elni az `adrlocality` táblában. Ha talál, a strukturált ID-t automatikusan rácsatolja — a lelkésznek nem kell újra beírnia.
- **UI egyszerűsítés**: az AddressForm utca-render ágából eltávolítva a „free-text helység → free-text utca" kaszkád (soha nem aktiválódott az új szabály mellett).

### 📌 Hátterében

A [[2026-04-21e]] fallback-et a **teljes** cím-hierarchiára terveztük, de a valós seed-lefedettség aszimmetrikus: megye + helység = teljes, utca = hiányos. A UX-szabály ezt tükrözi: **ahol a rendszer tudja az adatot, ott kötelezzük a struktúrát** (SIRUTA-kód, irányítószám). **Ahol nem tudja, ott engedjük a kézi bevitelt** — a lelkész soha ne akadjon el egy utcanevnél.

---

## [2026-04-21f] — Hotfix: controlled→uncontrolled Input warning a cím-wizardban

<!-- key: 2026-04-21-hotfix-controlled-input -->
<!-- category: bugfix -->
<!-- version: 1.8.5 -->
<!-- targets: lelkészek -->

A dashboard-on megnyitott `CongregationSetupAutoOpen` wizard cím-lépésében a konzol warning-ot írt: *"A component is changing a controlled input to be uncontrolled"*. A Base UI `<Input>` az első render-kor dönti el, hogy controlled vagy uncontrolled: ha `value === undefined`, akkor uncontrolled marad a teljes életcikluson át.

### 🐛 Javítás

- Minden `<Input>` value-t `?? ''` fallback-kel védünk (`value.country ?? ''`, `value.locality ?? ''`, stb.) — ha egy parent valaha hiányos AddressValue-t adna át, a komponens akkor sem „megy uncontrolled-ra".
- A **disabled placeholder Input-ok** (pl. „Előbb válaszd ki a megyét") is explicit `value=""` + `readOnly` prop-ot kapnak. Korábban `value` nélkül voltak — és amikor a feltétel átváltott ugyanabban a pozícióban, a React reconciliation azonosnak tekintette az elemet, és controlled → uncontrolled átváltást észlelt a Base UI.

### 📌 Tanulság

Base UI (és szigorúbb React 19) mellett a controlled input **mindig** kapjon defined string-et. A disabled + placeholder-nél is `value=""`, különben ha valamikor ugyanazon a pozíción kontrollált változat jelenik meg, a FieldControl panaszkodik.

---

## [2026-04-21e] — Feature: „Használd kézzel" fallback a helység- és utca-autocomplete-ben

<!-- key: 2026-04-21-address-manual-fallback -->
<!-- category: feature -->
<!-- version: 1.8.4 -->
<!-- targets: lelkészek -->

Az utca-lefedettség a 2026-04-21-es seed után ~58%: sok kisebb falu / új utca nem szerepel a hivatalos Poșta Română XLS-ben. Eddig, ha a lelkész olyan utcát vagy helységet keresett, ami nincs a listában, a mező „üres találat" állapotban ragadt, és a wizard nem engedte tovább. Mostantól **a dropdown alján megjelenik egy „Használd kézzel" opció** — a beírt szöveg egyetlen kattintással szövegesként elmentődik, és a wizard folytatódik.

### ✨ Új funkciók

- **Helység autocomplete**: ha nincs találat a beírt kifejezésre (vagy a lelkész szándékosan egyedi nevet ad), a dropdown legalján megjelenik a „**kézi** — Használd kézzel: ›<szöveg>‹" opció. Kattintás után a `localityId` null, de a `form.varos` a beírt szöveg — a hivatalos iratokon ez jelenik meg.
- **Utca autocomplete**: ugyanez — ha nincs találat, a „**kézi**" fallback gombbal szöveg-mentés, `streetId` null.
- **Vizuális státusz**: a kézzel megadott érték **amber (sárga-narancs) badge**-dzsel jelenik meg, szemben a strukturált találat **emerald (zöld) badge**-dzsével. Így a lelkész rögtön látja, hogy mi jön a hivatalos adatbázisból és mi a saját szöveg.
- **Utca mező szabad szövegként** ha a helység kézi: ha a lelkész kézzel adta meg a helységet (nincs `localityId`), az utca is szabad-szöveges Input lesz (nem disabled).

### 📌 UX alapelv

A rendszer soha nem zárja el a lelkészt az adatbeviteltől, csak mert egy reference tábla nem teljes. A hivatalos adat **ajánlás**, a kézi bevitel **mindig elérhető**. A különbséget vizuális jelzés közli (amber vs. emerald), és a DB-be is eljut: a kézi bevitelnél az `adrlocality_id`/`adrstreet_id` null, a későbbi statisztikákból meg lehet nézni, melyik régióban milyen utcák hiányoznak a seedből.

---

## [2026-04-21d] — Hotfix: megye dropdown visszaugrott üresre a cím-wizardban

<!-- key: 2026-04-21-hotfix-county-dropdown-state -->
<!-- category: bugfix -->
<!-- version: 1.8.3 -->
<!-- targets: lelkészek -->

A GRANT hotfix után a megye dropdown **még mindig nem működött**: amikor a lelkész megyét választott, a mező **visszaugrott az üres placeholder-re**. Diagnózis: a három parent wizard (`CongregationSetupWizard`, `DioceseSetupWizard`, `WelcomeWizardClient`) a saját form-state-jében **csak a megye NEVÉT** tárolja (`form.megye = "Cluj"`), a `countyId`-t NEM — a `formToAddressValue` helper mindig `countyId: null`-t adott át. Így minden render után a select visszaállt üresre, mert a `value.countyId` null volt.

### 🐛 Javítás

- **`components/ui/address-form.tsx`** — a komponens önmaga tartja nyilván a megye-id-t: `const [internalCountyId, setInternalCountyId] = useState<number | null>(...)` + egy `useMemo`-alapú **név-szerinti rematch** (ha a parent csak a `value.county` szöveget adja, a `counties` listából derivált érték adja az id-t). A `<select>` value-ja és a `<LocalityAutocomplete>` countyId prop-ja az `effectiveCountyId = internalCountyId ?? matchedCountyId` értékből olvas.
- A parent wizardok mappingje (`formToAddressValue`) változatlan — a `countyId: null` literal már nem gond, az AddressForm belülről oldja meg.
- **Null-safety** a match-logikában és a label helperekben: a `c.name_ro?.toLowerCase()` és a `c.name_hu || c.name_ro || ''` fallback elbírja a régi seed-ből maradt zombi sort, ami `name_ro` nélkül szerepel (a `megye_count: 43` volt 42 helyett).
- **`lib/address/actions.ts`** → `listCounties()`: a Supabase query `.not('name_ro', 'is', null)` feltételt kap — így a zombi sor már forrásnál kiszűrődik, a dropdown tisztán 42 megyével tölt.

### 📌 Tanulság

Controlled React komponensnél egy **tárolatlan belső id** (amelyre a parent state nem tud emlékezni) megoldható úgy, hogy a komponens **saját state-ben** tartja, és a parent által átadott szöveges értékből **derivált érték**-ként (useMemo) kapja vissza. Nem kell a parent state-et átalakítani, nem kell új mezőt a DB-be bevezetni.

---

## [2026-04-21c] — Hotfix: ADR-táblák GRANT SELECT az authenticated role-nak

<!-- key: 2026-04-21-hotfix-adr-grant-authenticated -->
<!-- category: bugfix -->
<!-- version: 1.8.2 -->
<!-- targets: lelkészek -->

A megye dropdown a cím-wizardban **üres maradt** — a lelkész nem tudott választani. Oka: az `adr*` táblákra 2026-04-13-kor RLS + policy került (`USING (true)`), de **explicit `GRANT SELECT` nélkül**. A Postgres 3-rétegű szabálya szerint az RLS önmagában nem elegendő: ha nincs GRANT, a lekérdezés csendben üres listát ad.

### 🐛 Javítás

- `migration-docs/sql/2026-04-21-adr-grant-authenticated.sql` — `GRANT SELECT ON public.adr{country,county,locality,street,locality_alias} TO authenticated`, plus a szekvenciákra `GRANT USAGE`.

### 📌 Tanulság

A meglévő alapelv ([[Az RLS egy a három védelmi rétegből]]) most megerősítve: **GRANT + RLS + app layer** — mindhárom kell. Ha új reference-táblán csak RLS-t állítok, a lekérdezés üres lesz.

---

## [2026-04-21b] — Cím autocomplete a setup wizardokban — megye dropdown + helység/utca autocomplete + automatikus irányítószám

<!-- key: 2026-04-21-address-autocomplete-wizards -->
<!-- category: feature -->
<!-- version: 1.8.1 -->
<!-- targets: lelkészek -->

A 2026-04-21-es cím-hierarchia seed után a három setup wizard (gyülekezet, egyházmegye, welcome) Cím lépése **mostantól élő autocomplete-tel** dolgozik. A lelkész először a megye dropdown-ból választ (42 romániai megye + "Külföldi" opció), utána a helység gépelés közben felajánlásként megjelenik (magyar és román nevek + aliasok), és végül az utca is autocomplete-ből választható — az irányítószám **automatikusan kitöltődik**.

### ✨ Új funkciók

- **Új reusable UI-komponens**: `components/ui/address-form.tsx` — megye dropdown (42 megye, HU+RO címkékkel) + helység/utca autocomplete + automatikus postakód + **Külföldi** opció (ilyenkor minden szabad szöveg).
- **Fuzzy alias match**: ha a lelkész "Telek"-et ír Kovászna megyében, a dropdown felajánlja pl. az "Orbaitelek"-et (a `adrlocality_alias` táblára támaszkodva).
- **Kétnyelvű megjelenítés**: a komponens `lang` prop-ja szabja meg, hogy `name_hu` vagy `name_ro` az elsődleges címke. A román név alcímként jelenik meg ha eltér a magyartól.
- **Integráció mindhárom wizard-ba**: `CongregationSetupWizard`, `DioceseSetupWizard`, `WelcomeWizardClient` Step 2 — az eddigi szöveges "megye/város/cím" mezőket lecseréltük az új strukturált bevitelre (visszafelé kompatibilis: a szöveges mezők megmaradnak a táblában).

### 🎨 UX javítások

- **Kiválasztott helységek/utcák** zöld "pecséttel" jelennek meg (`CheckCircle2` + törlés gomb), így a lelkész látja, hogy valóban a hivatalos adatból választott.
- **Debounced keresés (250 ms)**: nem keresünk minden karakterlenyomásra, csak a gépelés szünetében.
- **Spring-animált dropdown** framer-motion-nal.
- **Alias kiemelés**: ha egy alias alapján jött a találat, a dropdown mutatja: *"↳ „Telek"*".

### 🔧 Technikai részletek

- **Új server actions** (`lib/address/actions.ts`): `listCounties()`, `searchLocalities(countyId, query, opts)`, `searchStreets(localityId, query, opts)`, `getLocalityDetails(id)`. Authenticated access, publikus reference adat.
- **SQL migráció** (`migration-docs/sql/2026-04-21-congregations-address-fields.sql`): `congregations` tábla bővítve `iranyitoszam`, `hazszam`, `country` oszlopokkal (a `varos`, `megye`, `cim`, `adrlocality_id`, `adrstreet_id` már léteznek).
- **Server action-ök frissítve**:
  - `getCongregationForSetup` — visszaadja az új cím-mezőket + FK-kat
  - `saveCongregationSetup` + `saveCongregationSetupStep` — mentik az új mezőket
  - `getDiocese` (DioceseRecord) — bővítve `adrlocality_id`, `adrstreet_id`
  - `saveDioceseSetup` + `saveDioceseSetupStep` — az új FK-k mentése
- **Wizard state bővítés**:
  - `CongregationSetupWizard.SetupFormState` + `adrlocality_id`, `adrstreet_id`, `iranyitoszam`, `hazszam`, `country`, `isForeign`
  - `DioceseSetupWizard.SetupFormState` + `adrlocality_id`, `adrstreet_id`, `isForeign` (a diocese-nek már van `cim_orszag`/`cim_iranyitoszam`)
  - `WizardData.congregation` + `megye`, `varos`, `iranyitoszam`, `hazszam`, `country`, `adrlocality_id`, `adrstreet_id`, `isForeign`
- **Cleanup SQL** (`2026-04-21-adr-seed-05-cleanup.sql`): a dupla-futás miatti alias-duplikátumok törlése + `UNIQUE (adrlocality_id, alias_name)` constraint.
- **TSC + ESLint**: `exit 0` mindkét ellenőrzésen.

### 📌 Megjegyzések

- **A szöveges fallback mezők megmaradnak**: a `megye`, `varos`, `cim` (congregations) és `cim_megye`, `cim_telepules`, `cim_utca` (dioceses) a hivatalos iratokhoz szükséges szöveges formátumot kapják (magyar vagy román nyelven, attól függően amit a `lang` paraméter mond).
- **A postakód autokitöltés** lépcsős:
  - Helység kiválasztásakor a `default_postalcode` töltődik (kistelepüléseknél pontos, nagyvárosoknál csak "kb.")
  - Utca kiválasztásakor az utca saját `postalcode`-ja íródik (pontos — Kolozsvár utcánként más és más)
  - Mindkettő **felülírható** kézzel
- **Külföldi címnél**: a megye dropdown utolsó opcióját választva ("— Külföldi cím —") minden mező szabad szövegmezővé változik, az Ország mező is felszabadul.
- **A seedben 23 731 utca** van benne (~58% a nyers adatokból) — a maradék utcák a helységek közötti match-telés miatt nem kerültek be. A felhasználó bármit beírhat kézzel, ha az utca nincs a listában.

### 🔍 Tesztelési forgatókönyvek

1. **Erdélyi magyar lelkész — Barót**: Megye "Kovászna" → Helység: "Barót" (vagy "Baraolt" — mindkettő találja) → Utca: "Kossuth" (autocomplete)  → postakód automatikus.
2. **Kolozsvári gyülekezet**: Megye "Cluj/Kolozs" → Helység "Kolozsvár" → Utca kezdete → pontos postakód az utca alapján.
3. **Fuzzy alias**: "Telek" → rákérdez az Orbaitelek-re.
4. **Külföldi cím (pl. magyarországi testvérgyülekezet)**: Megye "Külföldi" → minden szabad szöveg.

---

## [2026-04-21] — Romániai cím-hierarchia seed: 42 megye + 13 836 helység + 40 293 utca

<!-- key: 2026-04-21-adr-seed-romania-full -->
<!-- category: feature -->
<!-- version: 1.8.0 -->
<!-- targets: lelkészek -->

Hivatalos, kétnyelvű romániai cím-adatbázis beépítve — a Poşta Română data.gov.ro CSV-je + GeoNames.org szabad adatai alapján. A setup wizardokban (gyülekezet + egyházmegye + welcome) **megye dropdown + helység autocomplete + utca autocomplete + irányítószám automatikus kitöltése** lesz — a lelkész néhány billentyűleütéssel megtalálja a gyülekezetét. Magyar és román nevek mindenütt, hogy a **magyar iratokon magyar nyelven, a román iratokon román nyelven** jelenhessenek meg az adatok.

### ✨ Új funkciók

- **42 megye kétnyelvű névvel**: magyar + román + autókód (CV = Kovászna, HR = Hargita, MS = Maros, stb.) + hivatalos SIRUTA-kód.
- **13 836 helység**: minden romániai település, hivatalos SIRUTA-kóddal, GeoNames ID-vel, default postakóddal (helység-szintű, a kistelepüléseknél ez pontos). A 623 magyar-ajkú erdélyi helységnek (Barót/Baraolt, Csíkszereda/Miercurea Ciuc, Kolozsvár/Cluj-Napoca, stb.) **magyar neve is** van.
- **18 073 alias**: a GeoNames alternatenames-ből (történelmi, német, egyéb nyelvű változatok) — a fuzzy-match ezen keresztül működik, pl. ha a lelkész "Telek"-et ír, a rendszer rákérdez "Orbaitelek"-re.
- **40 293 utca-postakód**: a nagyvárosok (>50k lakos) és Bukarest utcánkénti postakóddal. A lelkész egy kolozsvári gyülekezet címét beírva **automatikusan** megkapja a pontos irányítószámot.
- **Fallback meglévő 5 helységre**: Barót, Csíkszereda, Kézdivásárhely, Kolozsvár, Sepsiszentgyörgy — ezek a régi magyar neveikkel megmaradnak, a seed az ő SIRUTA-kódjukat + román neveiket frissítve csatlakoztatja a hierarchiához (nincs duplikáció).

### 🔧 Technikai részletek

- **Új SQL fájlok** (`migration-docs/sql/`):
  - `2026-04-21-adr-schema-bovites.sql` — schema bővítés: `name_hu`/`name_ro`/`siruta_code`/`geonames_id`/`default_postalcode` oszlopok mind a 4 `adr*` táblán + új `adrlocality_alias` tábla RLS-sel + `congregations`/`dioceses` bővítése `adrlocality_id`/`adrstreet_id` FK-kkal (a szöveges mezők fallback-nek megmaradnak)
  - `2026-04-21-adr-seed-01-countries.sql` (13 KB) — Románia + 42 megye
  - `2026-04-21-adr-seed-02-localities.sql` (948 KB) — 13 836 helység
  - `2026-04-21-adr-seed-03-aliases.sql` (503 KB) — 18 073 alias
  - `2026-04-21-adr-seed-04-streets.sql` (2.0 MB) — 40 293 utca
- **Új script**: `scripts/build-adr-seed.mjs` (Node.js, ~650 sor). A nyers adatokat (XLS + RO.txt + szűrt alternateNames) feldolgozva generálja a fenti SQL-eket. Újrafuttatható, idempotens. Előfeltétel: Git Bash `unzip` + `awk` (a 773 MB-os alternateNamesV2 TXT-ből csak hu/ro sorokat szűr — 3.4 MB szűrt cache).
- **Nyers adatok** (`migration-docs/data/adr-seed/`, NEM commitolva — `.gitignore` kezeli):
  - `infocod-cu-siruta-mai-2016.xls` — Poşta Română data.gov.ro hivatalos postakód CSV (~8 MB)
  - `RO.zip` — GeoNames Románia (~2 MB)
  - `alternateNamesV2.zip` — GeoNames alternatív nevek (~193 MB)

### 📋 Futtatás (Endre feladata a Supabase Studio-ban)

Sorrendben, ugyanazon az SQL Editor tabon:
1. `2026-04-21-adr-schema-bovites.sql` (schema bővítés)
2. `2026-04-21-adr-seed-01-countries.sql` (42 megye)
3. `2026-04-21-adr-seed-02-localities.sql` (~1 MB, ~10-15 mp)
4. `2026-04-21-adr-seed-03-aliases.sql` (~500 KB)
5. `2026-04-21-adr-seed-04-streets.sql` (~2 MB, ~30 mp)

Minden fájl végén **diagnosztikai SELECT-ek** — a futás után látható kell legyen: 42 megye, 13 836+ helység (a régi 5 beleszámítva), 18 073 alias, 40 293+ utca.

### 📌 Megjegyzések

- **A UI refaktor még nincs kész** — ezek az SQL-ek csak az **adatokat** rakják be. A 3 wizard (welcome, congregation, diocese) StepAddress komponensének átírása (megye dropdown + helység/utca autocomplete + postakód auto-kitöltés + Külföldi opció) **külön bejegyzésben** fog jönni, amint az SQL sikeresen lefutott.
- **A meglévő 5 helység** (Barót, Csíkszereda, Kézdivásárhely, Kolozsvár, Sepsiszentgyörgy) a seed-ben **UPDATE-tel** csatlakozik (nem duplikáció): a magyar név megmarad, a román név + SIRUTA + GeoNames ID + megye hozzárendelődik.
- **A 4.5%-os magyar név lefedettség** (623/13 836) reálisan megfelel az erdélyi magyar-ajkú területeknek. A többi romániai helységnek nincs bevett magyar neve, így csak románul jelenik meg.
- Minden `adr*` táblához `search` index (lower(name_hu) és lower(name_ro)) — a server-oldali autocomplete gyors lesz.

### 🔍 Adatforrások

- [Poșta Română data.gov.ro](https://data.gov.ro/dataset/coduri-postale-romania) — postakódok + SIRUTA
- [GeoNames Romania](https://download.geonames.org/export/dump/RO.zip) — geonameid + koordináták
- [GeoNames alternateNames](https://download.geonames.org/export/dump/alternateNamesV2.zip) — magyar nevek

---

## [2026-04-20f] — Setup wizardok: lépésenkénti mentés + folytatás ahol abbamaradt

<!-- key: 2026-04-20-setup-wizards-partial-save -->
<!-- category: feature -->
<!-- version: 1.7.5 -->
<!-- targets: lelkészek -->

Mindkét dashboard-on megjelenő setup wizard (**Gyülekezet beállítása** és **Egyházmegye beállítása**) most **minden Tovább gomb után menti** az adott lépés adatait. Ha a lelkész kilép akár a 3. lépés után, legközelebb **onnan folytathatja, ahol abbahagyta** — a kitöltött mezők visszatöltődnek, és a wizard automatikusan az **első hiányos lépésre ugrik**.

Ez ugyanaz az elv, mint amit az A fázisban a welcome wizard kapott — mostantól **minden onboarding wizard** következetesen így viselkedik.

### ✨ Új funkciók

- **Gyülekezet setup wizard** (`CongregationSetupWizard`): Tovább gomb partial save-el (`saveCongregationSetupStep`), a `congregations` táblába csak az adott lépés mezőit frissíti.
- **Egyházmegye setup wizard** (`DioceseSetupWizard`): ugyanaz az elv (`saveDioceseSetupStep`), a `dioceses` táblába.
- **Folytatás-logika**: amikor a wizard megnyílik, a `getCongregationForSetup` / `getDiocese` betölti a mentett mezőket, és a wizard az **első hiányos lépésre** ugrik (nem mindig a `basics`-re).
- **"Mentés…" feedback**: a Tovább gomb mentés közben Loader2 spinning-et mutat, a Vissza gomb és X ("Később") disabled.

### 🎨 UX javítások

- Ha a lelkész a 4. lépésen megnyomja a "Tovább"-ot, majd bezárja az ablakot, legközelebb a `confirm` (5.) lépéssel indul — minden korábbi mezőre tudja, hogy komplett.
- Ha egy korábbi lépés hiányossá válik (pl. a lelkész töröl egy kötelező mezőt), a validáció megmondja → nem engedi tovább.
- A Tovább gomb **csak akkor** commitolja a partial save-et, ha a lépés validáció szerint **érvényes** — tehát nem mentünk "félkész" adatot váratlanul.

### 🔧 Technikai részletek

- **Új server actions**:
  - `app/(dashboard)/congregation/actions.ts` → `saveCongregationSetupStep(input: CongregationSetupPartialInput)` — patch-style `UPDATE` a `congregations` táblára, csak a megadott mezőkre; `name` NOT NULL szinkron biztosítva.
  - `app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts` → `saveDioceseSetupStep(input: DioceseSetupPartialInput)` — ugyanaz a logika a `dioceses` táblára.
- **Wizard refaktor**:
  - `components/modals/congregation-setup-wizard.tsx` — `isStepValidOn(s, form)` + `stepFields(s, form)` pure helper függvények (újrahasznosíthatóak init-re és handleNext-re), `stepSaving` state, async `handleNext`, first-invalid-step ugrás az init-ben.
  - `components/modals/diocese-setup-wizard.tsx` — ugyanez a minta.
- **A végső `saveCongregationSetup` / `saveDioceseSetup` változatlan** — a teljes form validációja továbbra is csak a Confirm lépésen ("Mentés és befejezés" gomb) fut le. A partial save **nem** sorolja be a dátum-alapú `diocese_bealitas` sort — az csak a teljes mentéskor keletkezik, hogy a pénzügyi modul azonnal használható legyen.

### 📌 Megjegyzések

- A wizard **csak a saját gyülekezet / egyházmegye** adatait mentheti. A `saveCongregationSetupStep` a `profile.congregation_id === input.id` jogosultság-ellenőrzést végzi, a `saveDioceseSetupStep` a `requireDioceseAccess`-en keresztül.
- A welcome wizard (onboarding A fázis), a gyülekezet setup wizard és az egyházmegye setup wizard **mostantól mindhárom** következetesen támogatja a "kilépek és folytatom" mintázatot.

---

## [2026-04-20e] — Gyülekezet setup wizard: egyházi hovatartozás + meglévő bankszámla megjelenítés

<!-- key: 2026-04-20-congregation-setup-wizard-kiegeszites -->
<!-- category: improvement -->
<!-- version: 1.7.4 -->
<!-- targets: lelkészek -->

A dashboard-on megjelenő **CongregationSetupWizard** ("Gyülekezet beállítása") két észrevétel szerint bővült: a lelkész most már **látja az egyházkerület és egyházmegye** nevét, és **vizuális visszajelzést kap**, ha a fő bankszámla adatai már mentve vannak.

### 🎨 UX javítások

- **Egyházi hovatartozás panel** (Step 1 — Alapadatok + címer): új sky-színű info-doboz Landmark ikonnal, 2 oszlopos layout-tal — bal oldalt az **Egyházkerület**, jobb oldalt az **Egyházmegye** neve. Ha nincs beállítva egyik sem, jelzi, hogy a rendszergazda állíthatja be az Admin panelen.
- **Bankszámla megerősítés** (Step 4 — Bank): ha a `bank` és `iban` mezők már ki vannak töltve (akár a `congregations` táblából, akár a `bankszamlak` táblából előhúzva), egy zöld emerald banner jelzi: *"A fő bankszámla adatai már be vannak állítva. Alább ellenőrizheted és szerkesztheted."* Ha több aktív bankszámla van, a banner megmondja a számukat is.

### 🔧 Technikai részletek

- `app/(dashboard)/congregation/actions.ts` — `getCongregationForSetup` bővítve:
  - Nested JOIN: `dioceses(name, districts(name))` — egy query-vel hozza be az egyházmegye + egyházkerület neveket
  - Külön lekérdezés `bankszamlak`-ra: `scope='gyulekezet' + aktiv=true`, is_default desc rendezve
  - Új return mezők: `diocese_name`, `district_name`, `existing_bank_count`
  - Ha a `congregations.bank`/`iban` üres **DE** van aktív `bankszamlak`, az első aktív bankszámla adatait visszaadja (fallback előtöltés — a wizard így is tudja mutatni)
- `components/modals/congregation-setup-wizard.tsx`:
  - Új `context` state: `dioceseName`, `districtName`, `existingBankCount`
  - `StepBasics` kiegészítve a hovatartozás panellel (read-only)
  - `StepBank` kiegészítve a zöld megerősítő banner-rel (`alreadyFilled` conditional render)

### 📌 Megjegyzések

- Ez a wizard a `CongregationSetupBanner`-ből indul (minden oldalon látható, amíg a gyülekezet alapadatai hiányosak) — NEM a `welcome-wizard-client.tsx` (ami az onboarding 5-step-je).
- A welcome wizard Step 2-ben (2026-04-20 A fázis) is van már egyházmegye megjelenítés, ugyanezen minta alapján. A két wizard most konzisztens.

---

## [2026-04-20d] — Hotfix: hydration warning a sidebar data-walkthrough attribútumokra

<!-- key: 2026-04-20-hotfix-hydration-data-walkthrough -->
<!-- category: bugfix -->
<!-- version: 1.7.3 -->
<!-- targets: fejlesztés -->

A C fázis walkthrough-feature dev-mód alatt egy hydration warning-ot dobott a böngésző konzolon: `data-walkthrough={null}` (server) vs értékkel (client). A funkcionalitás **nem sérült** (a kliens hydrálás után a DOM-ban ott voltak az attribútumok, a walkthrough megtalálta a target-eket) — csak a dev-warning zaj.

### 🐛 Javítás

- `components/layout/sidebar-adaptive-v4.tsx` — `suppressHydrationWarning` flag a walkthrough-targeted `<Link>` és a sidebar wrapper `<div>` elemeken.

### 📌 Megjegyzések

- **Root cause**: Turbopack SSR-cache kis drift Windows + ékezetes elérési úton (`Egyházi APP`). A kliens-bundle HMR-rel frissül, a szerver-oldali RSC-render néha eggyel lemarad. A `data-walkthrough` attribútum csak JavaScript-referencia a walkthrough-nak, így az érték-eltérés ártalmatlan — a `suppressHydrationWarning` pontosan erre való.
- Nem a kódban volt hiba — ugyanaz a kód (`data-walkthrough={walkthroughKey}`) futott mindkét oldalon, csak a Turbopack cache hozott különböző állapotot.

---

## [2026-04-20c] — Onboarding C fázis: interaktív walkthrough + segítség-tooltipek + UX polish

<!-- key: 2026-04-20-onboarding-c-fazis -->
<!-- category: feature -->
<!-- version: 1.7.2 -->
<!-- targets: lelkészek -->

A háromlépcsős onboarding refaktor **záró része**. Miután a lelkész az A+B fázis után a dashboard-ra érkezik, egy **animált, személyes túra** fogadja, amely lépésről lépésre bemutatja a rendszer fő moduljait. A sidebar menüpontok egyenként kiemelődnek egy spotlight overlay-vel, mellettük tooltip kártya magyarázattal. A rendszer minden funkciónak ad egy **kérdőjeles segítség-ikont**, rövid magyarázattal és opcionális "Bővebben" linkkel.

A bejelentkezési és wizard animációk (framer-motion) is finomodtak.

### ✨ Új funkciók

- **Interaktív walkthrough**: 10 step-es túra a dashboard fölött. Kezdő üdvözlés keresztnévvel ("Üdvözlöm, [Keresztnév]!"), végigvezetés a sidebar-on (Tagnyilvántartás, Anyakönyv, Pénzügy, Munkanapló), dashboard-widgetek, segítség-ikonok, profil-menü, és pásztorális záró köszöntés ("Áldás kísérje szolgálatát!").
- **Spotlight overlay**: az éppen bemutatott UI elem körül sötét box-shadow kivágás + pulzáló amber keret-animáció emeli ki.
- **Keyboard shortcutok a walkthrough-ban**: `Enter` / `→` — Tovább, `←` — Előző, `Esc` — Kihagyom.
- **Segítség-tooltip (`HelpTooltip`)**: új UI-primitív a `components/ui/help-tooltip.tsx` alatt. Kérdőjel ikon, kattintásra animált popover címmel + 1-3 mondatos leírással + opcionális "Bővebben →" linkkel. Click-outside és Esc bezárja.
- **Wizard step-átmenetek animáltak**: slide+fade-el váltanak a step-ek, a progress bar zöld "töltése" spring-animációval halad, az ikonok scale-bounce-ot produkálnak lépésváltáskor.
- **Login form framer-motion fade-in**: az űrlap, hibaüzenetek, szeparátor és OAuth gombok stagger-elt animációval jelennek meg.

### 🎨 UX javítások

- **Pásztorális hangvétel**: minden step-ben barátságos, keresztnévre szabott szöveg ("a legrészletesebb modul", "a lelkészi szolgálat személyes naplója").
- **Progress indikátor**: "3 / 10" + animált színátmenetes (amber → teal) bar a tooltip tetején.
- **Newsletter-barát záróüzenet**: "Áldás kísérje szolgálatát, [Keresztnév]!"

### 🔧 Technikai részletek

- **Új fájlok**:
  - `app/(dashboard)/profile/walkthrough-actions.ts` — `markWalkthroughComplete`, `skipWalkthrough`, `restartWalkthrough` server actions
  - `components/onboarding/walkthrough/walkthrough-steps.ts` — 10 step definíció, `{firstName}` helyettesítővel
  - `components/onboarding/walkthrough/walkthrough-client.tsx` — spotlight + tooltip komponens, framer-motion animációkkal, target-measuring `requestAnimationFrame`-mel (Next.js 16 / React 19 strict-mode kompatibilitás)
  - `components/ui/help-tooltip.tsx` — kérdőjeles popover UI-primitív
- **Átírt fájlok**:
  - `app/(dashboard)/layout.tsx` — `onboardCheck` lekérdezés bővítve (`walkthrough_completed`, `full_name`), `extractFirstName()` helper, `WalkthroughClient` render
  - `components/layout/sidebar-adaptive-v4.tsx` — `data-walkthrough` attribútumok (menüpontok + fő wrapper)
  - `components/standalone/welcome-wizard-client.tsx` — `AnimatePresence` + step-átmenetek, progress bar animáció
  - `components/auth/login-form.tsx` — teljes átírás framer-motion-nal

### 📌 Megjegyzések

- A walkthrough-ban a `user-menu`, `dashboard-widgets` step-ek jelenleg **target nélkül** lebegnek a képernyő közepén (a komponens magától fallback-el, ha nem találja a DOM-elemet). Ha ezek is kellenek pontosan pozicionálva, egy kis polish-elés kell a headerben + dashboard page-en: `data-walkthrough="user-menu"`, `data-walkthrough="dashboard-widgets"`.
- A walkthrough bármikor újraindítható a debug/support `restartWalkthrough` server action-nel (pl. a Profil → Beállítások alatti menüpont később).
- **A háromlépcsős onboarding csomag LEZÁRVA** — az A+B+C együtt egy komplett, animált első-indulási élményt ad.

---

## [2026-04-20b] — Onboarding B fázis: modern bejelentkezés, checklist regisztráció, várakozó képernyő

<!-- key: 2026-04-20-onboarding-b-fazis -->
<!-- category: feature -->
<!-- version: 1.7.1 -->
<!-- targets: lelkészek -->

A háromlépcsős onboarding refaktor második része — a **látvány és érzés**. A bejelentkezés és regisztráció most modern SaaS app-szerű, barátságosan animált, a regisztráció szakaszokra tagolt checklist, és a regisztrált, de még jóvá nem hagyott lelkészek egy szép várakozó képernyőt látnak ("Üdvözlöm, [keresztnév]!").

### ✨ Új funkciók

- **Modern split-panel auth layout**: desktop-on a bejelentkezési/regisztrációs űrlap bal oldalt, jobbra egy vizuális hero-panel — az EREK logójával, a Zsoltárok 23:1–2 idézetével, dekoratív gradient orbokkal és subtle SVG-texture hatással. Mobilon csak az űrlap.
- **3 szekciós checklist regisztráció**: a regisztrációs űrlap három kártyára tagolódik — *Személyes adatok* (név, telefon, születési dátum), *Szolgálat* (gyülekezet, egyházmegye dropdown, szolgálat kezdete), *Fiók* (email, jelszó, T&C). Minden szekció zöld pipás, ha komplett, framer-motion stagger animációval jelennek meg.
- **Egyházmegye dropdown**: a 15 erdélyi egyházmegye kiválasztható a regisztrációban.
- **Várakozó képernyő (`/pending`)**: a regisztrált, de még nem jóváhagyott lelkészek ide érkeznek. Személyes megszólítás keresztnévvel, pulzáló óra ikon, email-visszajelzés, kijelentkezés gomb. Amíg pending, **bármely védett oldalról** ide tereljük (dashboard, welcome).
- **Setup layout web-mód támogatás**: a `/welcome` wizard most webes módban is elérhető (eddig csak standalone-ban futott). Dinamikus header szöveg: "Első indítási varázsló" vs "Üdvözöljük a rendszerben".

### 🎨 UX javítások

- **Zöld keret + glow a komplett szekciókon**: vizuális megerősítés, hogy haladunk a regisztrációval.
- **Animált Regisztráció elküldése**: Loader2 spinning + "Feldolgozás…" állapot.
- **Pulse ring a várakozás-ikonon** a /pending képernyőn.
- **Biblia idézet a bejelentkezési oldalon**: "Az Úr a pásztorom; nem szűkölködöm..." (Zsoltárok 23:1–2) — emberi, pásztori hangvétel.

### 🔧 Technikai részletek

- **Új fájlok**: `app/(auth)/pending/page.tsx`, `app/(auth)/pending/actions.ts`, `components/auth/pending-approval-client.tsx`.
- **Átírt fájlok**: `app/(auth)/layout.tsx` (split-panel), `app/(setup)/layout.tsx` (mode-aware), `app/(dashboard)/layout.tsx` (pending → `/pending` redirect), `components/auth/register-form.tsx` (teljesen új), `app/(auth)/register/actions.ts` (új mezők mentése), `lib/validations/auth.ts` (schema bővítés: birthDate, dioceseId, serviceStartedAt).
- **Apró TS fix**: `lib/broadcasts/email.ts` — felesleges `@ts-expect-error` eltávolítva.

### 📌 Megjegyzések

- A **login form** esztétikai animáció és a **wizard step-átmenetek** framer-motion animációi a B fázis későbbi minor update-je lesz (kis UI polish).
- **C fázis** (interaktív walkthrough + tooltipek a dashboard-on): még előttünk.

---

## [2026-04-20] — Onboarding A fázis: wizard lépésenkénti mentés + egyházmegye megjelenítés

<!-- key: 2026-04-20-onboarding-a-fazis -->
<!-- category: feature -->
<!-- version: 1.7.0 -->
<!-- targets: lelkészek -->

Az első rész a háromlépcsős onboarding refaktorból. A wizard most **lépésenként ment**, és ha kilépsz, onnan folytathatod, ahol abbahagytad. A **Step 2-ben megjelenik a gyülekezet egyházmegyéje**. Az onboarding most **webes módban is fut** (eddig csak standalone-ban ment).

### ✨ Új funkciók

- **Wizard lépésenkénti mentés**: a Tovább gomb minden step-en DB-be commitol. Kilépés után a visszatérés onnan folytat, ahol abbahagytad — a kitöltött mezők visszatöltve.
- **Egyházmegye név megjelenítés**: Step 2 tetején sky-színű infopanel Landmark ikonnal. Ha a gyülekezet már hozzá van rendelve egy egyházmegyéhez, a név ott látszik.
- **Web-módú onboarding**: aki böngészőből használja a rendszert, most ugyanúgy végigmegy a wizardon (Step 2-től), mint a .exe-s lelkészek. Eddig csak a telepített .exe-ben indult el.
- **Erdélyi egyházmegyék beseedelve**: 15 egyházmegye (Brassói, Dési, Erdővidéki, Görgényi, Hunyad-Zarándi, Kalotaszegi, Kézdi-Orbai, Kolozsvári, Küküllői, Maros-Mezőségi, Nagyenyedi, Nagysajói, Sepsi, Székelyudvarhelyi, Tordai).

### 🎨 UX javítások

- **Automatikus wizard-irányítás**: ha a lelkész még nem végezte el az onboarding-ot, a rendszer a dashboard helyett a `/welcome`-ra viszi — így biztosan nem marad alapadat-hiány.
- **"Folytatás" üzenet az első step-en**: egyértelművé teszi, hogy kilépés esetén sem veszik el a munka.
- **Animált mentés-visszajelzés** a Tovább gombon.

### 🔧 Technikai részletek

- SQL: `migration-docs/sql/2026-04-20-wizard-onboarding-schema.sql` — új `wizard_progress` tábla (GRANT + RLS + 5 policy + trigger), `profiles` 3 új oszlop (`walkthrough_completed`, `walkthrough_skipped_at`, `onboarding_completed_at`), dioceses seed. Idempotens (`IF NOT EXISTS`, `WHERE NOT EXISTS`).
- Új server actions (`app/(setup)/welcome/actions.ts`): `getWizardProgress`, `saveWizardStep`, `restartWizard`, `completeWizard`, `getCongregationContext`.
- Dashboard layout guard: `profile.onboarding_completed_at IS NULL` + gyülekezeti kontextus → redirect `/welcome`.
- `framer-motion ^12.38.0` telepítve (B fázis animációihoz).

### 📌 Megjegyzések

- **Schema drift azonosítva**: a `save-initial` endpoint néhány mezőt INSERT-el, ami a `Database_schema.sql` szerint nem létezik. A `completeWizard` runtime-check-kel kezeli, de külön tisztázás szükséges.
- **B és C fázis** (modern login/register dizájn, pending képernyő, interaktív walkthrough) **folyamatban**, külön bejegyzéssel zárul.

---

## [2026-04-19e] — 6 felhasználói visszajelzés javítása + 46 lint error eltakarítása

<!-- key: 2026-04-19-endre-feedback-6 -->
<!-- category: improvement -->
<!-- version: 1.6.6 -->
<!-- targets: mindenki -->

Endre 2026-04-19-i visszajelzésére 6 pont javítása:

### 🐛 Javítások

**1. Gyülekezeti címer feltöltési hiba (&bdquo;Bucket not found&rdquo;)**
- Új SQL migráció: `migration-docs/sql/2026-04-19-congregations-logos-bucket.sql`
- Idempotens `INSERT ... ON CONFLICT` a `logos` Storage bucketre (eddig csak a Supabase Studio-ban jött létre kézzel, új telepítésekből hiányzott)
- 4 RLS policy: olvasás publikus + INSERT/UPDATE/DELETE saját gyülekezet lelkészére (a `congregations/{congregation_id}/…` útvonalminta alapján) vagy admin/kerületi adminra
- Endre futtatja — utána mehet a címer-feltöltés az új setup wizardból

**2. Dashboard családok száma rossz**
- `app/(dashboard)/dashboard/page.tsx`: a `csalad` táblában **nincs** `congregation_id` oszlop — a `.eq('congregation_id', effectiveCongregationId)` szűrés csendben 0-t adott vissza
- Javítva: `csalad` táblán `isaktiv=true` + az aktív személyek ID-halmazán szűrjük (elhaltak/elköltözöttek kizárva)

**3. Tagnyilvántartás / Családok fül: kartonok eldugva**
- `components/members/families-tab-v2.tsx`: a hero + 3 statisztikai kártya + zöld info-banner most alapértelmezetten **rejtve** van — csak a családlista látszik
- Új `&bdquo;Kartonok / Statisztikák&rdquo;` toggle gomb (BarChart3 ikon) a kereső mellett — ezzel előhúzható
- &bdquo;Új család&rdquo; gomb átkerült a kereső sávba (mindig kéznél)

**4. Magyar karakterek hibája körzetek fülön (UTF-8)**
- `components/members/districts-tab.tsx` 112. sor: elrontott kódlap (`kĂ¶rzeteket`, `gyĂĽlekezethez`, `kapcsolĂłdnak`…) javítva UTF-8 eredetire

**5. Választók névjegyzéke → Nyomtatási központ + 4 szűrőopció**
- Új komponens: `components/members/voter-print-dialog.tsx` — a pénzügyi nyomtatási központ mintájára (bal oldal szűrők, jobb oldal élő iframe előnézet)
- 4 checkbox-szűrés: az előző / erre az évre **teljesen** vagy **részlegesen** kifizettek közül kiket számoljon be a névjegyzékbe (legalább egy feltétel szükséges)
- `voter-actions.ts` bővítve: per-év 101.01 járulék összegzés + `bealitas.eves_jarulek` lekérdezés az adott évre → alapján dönti el a dialog a &bdquo;teljes&rdquo; vs &bdquo;részleges&rdquo; státuszt
- Új szerver action: `getVoterPrintContext()` — gyülekezet név / cím / telefon a hivatalos fejléchez
- A voters-tab régi inline &bdquo;Névjegyzék nyomtatás&rdquo; gombja lecserélve &bdquo;Nyomtatási központ&rdquo;-ra

**6. 46 lint error javítása a régi kódbázisban**
- `react-hooks/set-state-in-effect` — 16 fájlban a `useEffect` body setState hívásai `queueMicrotask()` wrapper-be kerültek cleanup cancel-flag-gel (React 19 strict szabály)
- `react/no-unescaped-entities` — 23 helyen `"` karakter `&bdquo; &rdquo;` HTML entitásokkal helyettesítve (magyar idézőjelek)
- `@next/next/no-html-link-for-pages` — `app/dev-reset/page.tsx`: `<a href="/">` → `<Link href="/">`
- `prefer-const` — `lib/broadcasts/newsletter-template.ts`: `let raw / let line` → `const`

Eredmény: **46 error → 0 error** (71 warning marad, mindegyik `<img>` vs `<Image>` vagy unused import — nem blokkolja a build-et)

### 📁 Érintett fájlok

- **Új**: `migration-docs/sql/2026-04-19-congregations-logos-bucket.sql`
- **Új**: `components/members/voter-print-dialog.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `app/(dashboard)/tagnyilvantartas/voter-actions.ts`
- `components/members/families-tab-v2.tsx`
- `components/members/districts-tab.tsx`
- `components/members/voters-tab.tsx`
- `lib/broadcasts/newsletter-template.ts`
- `app/dev-reset/page.tsx`
- 16 komponens `useEffect` queueMicrotask wrappert kapott (accounting-finalize-wizard, bank-account-dialog, chitanta-*, congregation-setup-wizard, diocese-setup-wizard, oblio-*, searchable-category-select, system-finance-tab, diocese-chitanta-tombok-section, chitanta-tombok-panel, finance-sugo-checklist, stb.)
- 10 helyen magyar idézőjelek javítva HTML entitásokra

### TypeScript check: **EXIT 0** ✅
### Lint: **0 error**, 71 warning (nem blokkoló) ✅

---

## [2026-04-19d] — Teljes rendszerdiagnosztika + UX javítások

<!-- key: 2026-04-19-rendszerdiagnosztika -->
<!-- category: improvement -->
<!-- version: 1.6.5 -->
<!-- targets: fejleszto -->

### 🔍 Diagnosztikai összefoglaló

TypeScript: **EXIT 0** (minden clean) ✅
Lint: 48 error / 71 warning (többség a régi kódbázisban — a mostani körben **0 új lint error** a saját változtatásokból)

Explore agent által azonosított 7 terület ellenőrizve:
- ✅ Scope-aware pénzügyi paths — helyesen működik
- ✅ Banner-ek külön-külön, egyszerre nem jelennek meg
- ✅ ProfileSwitcher multi-role — helyes
- ✅ Setup wizard trigger-logika — nincs false-positive
- ⚠️ `effectiveCongregationId = null` admin módban → üres oldalak **(javítva)**
- ⚠️ Saját új lint errors a setup-auto-open-ekben **(javítva)**
- ℹ️ `bevCelMap` implicit type casting — elfogadható, működik

### 🎨 UX javítások

**1. `CongregationOnlyNotice` komponens** — `components/layout/congregation-only-notice.tsx` (új fájl)

Informatív tájékoztató kártya, amely megjelenik, ha egy felhasználó (admin / esperes / kerületi scope-ban) direkt URL-lel navigál egy olyan modulra, amely csak gyülekezeti módban érhető el. Üres oldal (`return null`) helyett most világos üzenet + „Egyházmegyei irányítópult" / „Admin Panel" / „Egyházkerületi irányítópult" link jelenik meg (a user aktuális scope-jától függően).

**Integrálva 6 gyülekezeti oldalon**:
- `app/(dashboard)/dashboard/page.tsx` — "A gyülekezeti irányítópult"
- `app/(dashboard)/anyakonyv/page.tsx` — "Az Anyakönyv modul"
- `app/(dashboard)/iktato/page.tsx` — "Az Iktató modul"
- `app/(dashboard)/sirhelyek/page.tsx` — "A Sírhelyek modul"
- `app/(dashboard)/leltar/page.tsx` — "A Leltár modul"
- `app/(dashboard)/munkanaplo/page.tsx` — "A Munkanapló modul"

### 🐛 Lint hibák javítása

- `components/dashboard/diocese/diocese-setup-auto-open.tsx` — a `useEffect + setState` pattern helyett `useState(() => Boolean(needsSetup && dioceseId))` lazy initializer (React 19 `react-hooks/set-state-in-effect` szabály)
- `components/dashboard/congregation-setup-auto-open.tsx` — ugyanígy

Mindkét komponens egyszerűbb, de ugyanaz a funkcionalitás: a wizard nyitott, ha a prop `needsSetup === true` mount-kor, és a user bezárhatja.

### 🔐 Scope-aware viselkedés (emlékeztető)

Az admin / esperes / kerületi scope-ban az `effectiveCongregationId = null` (a `2026-04-19a` bugfix óta). Emiatt a gyülekezeti modulok nem működnek ezekben a scope-okban — most már **informatív tájékoztatót** kap a user, nem üres oldalt. A sidebar `activeScope` alapján amúgy is szűri ezeket a menüpontokat diocese / system módban.

### TypeScript check: **EXIT 0** ✅

---

## [2026-04-19c] — Diocese /penzugy: YearlySettingsDialog eltávolítva, auto-upsert

<!-- key: 2026-04-19-diocese-no-yearly-settings -->
<!-- category: bugfix -->
<!-- version: 1.6.4 -->
<!-- targets: esperesek -->

### 🐛 Javítás

Endre jelezte: az egyházmegyei profilban megjelenik az **„Éves Pénzügyi Beállítások — 2026"** dialog (éves járulék + határidő bekérés), ami **nem releváns** egyházmegyei szinten — ott nincs tag-járulék fogalom.

### Megoldás

- **Új szerver akció**: `ensureDioceseBealitasForYear(dioceseId, year)` a `dashboard-egyhazmegye/diocese-actions.ts`-ben. Upsert-tel létrehoz egy üres flag-ekkel rendelkező `diocese_bealitas` sort az aktuális évre.
- **`/penzugy/page.tsx` scope-aware kezelés**:
  - `scope === 'diocese'` + `data.settings == null` → auto `ensureDioceseBealitasForYear()` + `initFinance()` újra, **NEM** YearlySettingsDialog
  - `scope === 'congregation'` + `data.settings == null` → a régi viselkedés, YearlySettingsDialog marad

Így az egyházmegyei lelkész a `/penzugy`-on egyből a pénzügyi munkafelületet látja, nem kell feleslegesen éves járulékot beállítania.

### TypeScript check: **EXIT 0** ✅

---

## [2026-04-19b] — Gyülekezeti setup wizard (a diocese mintájára)

<!-- key: 2026-04-19-gyulekezet-setup-wizard -->
<!-- category: feature -->
<!-- version: 1.6.3 -->
<!-- targets: lelkeszek -->

### ✨ Új funkciók

- **Gyülekezeti beállítás wizard** — a lelkész első alkalommal a /dashboard megnyitásakor egy 5 lépéses wizardot lát, ami bekéri a gyülekezet hivatalos adatait:
  1. **Alapadatok + címer** (magyar/román/angol név, adószám, címer feltöltés — `logos` Storage bucket, max 2 MB, JPG/PNG/WEBP)
  2. **Cím** (megye, város/település, utca+házszám)
  3. **Elérhetőségek** (e-mail, telefon, weboldal)
  4. **Bank** (bank név, IBAN)
  5. **Megerősítés** → mentés (congregations UPDATE)

- **Globális figyelmeztető banner** — minden oldalon megjelenik (header alatt), ha a beállítás hiányos. Kattintásra azonnal megnyitja a wizardot. Sárga pulzáló AlertCircle ikonnal. Csak congregation scope-ban látszik (diocese/admin scope-ban rejtett).

- **Wizard auto-open** — a /dashboard oldal betöltésekor automatikusan megnyílik useEffect alapú mount-tal, ha a setup hiányos.

- **Kötelező kiépítés** — minden mező kötelező. A wizard „Később" gombbal bezárható, ekkor a banner marad minden oldalon.

### Kötelező mezők (10 db)

`nev_hu`, `adoszam`, `megye`, `varos`, `cim`, `email`, `telefon`, `bank`, `iban`, `cimer_url`

Nem kötelező (opcionális): `nev_ro`, `nev_en`, `web`

### 🔧 Szerver akciók

**`app/(dashboard)/congregation/actions.ts`** bővítés:

- `checkCongregationSetupStatus(congregationId?)` — ellenőrzi a 10 kötelező mezőt, visszaadja a hiányzók listáját
- `saveCongregationSetup(input)` — Zod-validálva menti az összes mezőt. A `name` (NOT NULL) mindig szinkronban marad a `nev_hu`-val.
- `uploadCongregationCimer(congregationId, FormData)` — Storage upload a `logos` bucket-be, fájlnév séma `congregations/{id}/{timestamp}-{safeName}`
- `getCongregationForSetup(congregationId?)` — a wizard-ba előtöltéshez

### 🎨 UI komponensek

- `components/modals/congregation-setup-wizard.tsx` — 5 lépéses full-page wizard, drag-and-drop címer upload, lépésenkénti validáció. Teal színvilág (megkülönböztetésül a diocese lila wizard-tól).
- `components/layout/congregation-setup-banner.tsx` — globális warning banner
- `components/dashboard/congregation-setup-auto-open.tsx` — auto-open wrapper a /dashboard oldalhoz

### 🔗 Integráció

- **`app/(dashboard)/layout.tsx`**: a congregation setup status lekérdezése minden dashboard oldalbetöltésnél (csak akkor, ha `activeProfileRole == null || scope === 'congregation'` → admin/esperes módban NEM triggerel).
- **`components/layout/dashboard-layout-client.tsx`**: a banner a `DashboardShell` fölött renderelődik, ha `congregationSetupNeeded === true`.
- **`app/(dashboard)/dashboard/page.tsx`**: `CongregationSetupAutoOpen` wrapper automatikus wizard-nyitással.

### 🗃️ Meglévő infrastruktúra használata

- **A `logos` Storage bucket már létezett** (a `congregation-dialog-v2.tsx` használta). Új SQL **NEM KELL** — az új kód a meglévő bucket-et használja.
- A `congregations.cimer_url` oszlop **már létezett**.

### TypeScript check: **EXIT 0** ✅

### Flow az első belépéskor (példa)

1. Új lelkész bejelentkezik → `/dashboard`
2. A `checkCongregationSetupStatus` ellenőrzi a 10 kötelező mezőt
3. Ha hiányos → `CongregationSetupAutoOpen` (useEffect-tel) megnyitja a wizardot az első mount-kor
4. Ha a lelkész bezárja ("Később"), akkor **minden oldalon** megjelenik a sárga pulzáló banner: „⚠ Gyülekezeti alapadatok hiányoznak — Hiányzó: X, Y, Z + N további"
5. Kattintásra a banneren → wizard újra megnyílik
6. A mentés után banner eltűnik, minden oldal tisztán használható

---

## [2026-04-19a] — Egyházmegye setup wizard + admin scope bug fix

<!-- key: 2026-04-19-egyhazmegye-setup-wizard -->
<!-- category: feature -->
<!-- version: 1.6.2 -->
<!-- targets: esperesek, admin -->

### ✨ Új funkciók

- **Egyházmegye beállítás wizard** — az esperes első alkalommal a /dashboard-egyhazmegye megnyitásakor egy 5 lépéses wizardot lát, ami bekéri az egyházmegye hivatalos adatait:
  1. **Alapadatok + címer** (név, CIF, adószám, címer feltöltés — Supabase Storage `dioceses-logos` bucket, max 2 MB, JPG/PNG/WEBP)
  2. **Cím** (ország, megye, település, irányítószám, utca)
  3. **Elérhetőségek** (e-mail, telefon, weboldal)
  4. **Bank + vezetés** (bank név, IBAN, valuta, esperes név/cím, jegyző név)
  5. **Megerősítés** → mentés (dioceses UPDATE + diocese_bealitas upsert az aktuális évre)
- **Globális figyelmeztető banner** — minden oldalon megjelenik (header alatt), ha a beállítás hiányos:
  - Kattintásra azonnal megnyitja a wizard-ot
  - Sárga/amber színű, AlertCircle ikonnal, lüktető animációval
  - Csak diocese scope-ban látszik (congregation/admin scope-ban rejtett)
- **Wizard auto-open** — a /dashboard-egyhazmegye oldal betöltésekor automatikusan megnyílik (useEffect alapú mount)
- **Kötelező kiépítés** — minden mező kötelező. A wizard „Később" gombbal bezárható, ekkor a banner marad minden oldalon.

### 🐛 Kritikus bugfix — admin scope congregation kontextus

Endre jelezte: rendszergazdaként belépve látta a Barátosi Egyházközség adatait is, pedig admin felületen a `congregation_id` üres kellett volna legyen.

**Ok**: A `lib/auth/effective-access.ts` régebbi verziójában az `effectiveCongregationId` = `override.congregationId || profile.congregation_id`. Ha az admin user-nek is van `profiles.congregation_id` (saját gyülekezete), akkor admin scope-ban is propagálódott.

**Javítás**: a scope-számítás átrendezve — `activeProfileRole` először betöltve, majd:
- `scope === 'congregation'` → az `activeProfileRole.scopeId` (+ opcionális god-mode override) lesz az effectiveCongregationId
- `scope === 'diocese' | 'district' | 'system'` → `null` (nincs gyülekezet kontextus admin/esperes/kerületi módban)
- Nincs activeProfileRole → a régi fallback: override || profile.congregation_id (backward compat)

A `congregation` SELECT is skippelődik, ha `effectiveCongregationId === null`.

### 🗃️ SQL migráció

**`migration-docs/sql/2026-04-18-dioceses-cimer-setup.sql`**:
- `dioceses.cimer_url` új oszlop (text nullable)
- Storage bucket: `dioceses-logos` (public, 2 MB, image/jpeg+png+webp)
- RLS a bucket-hez:
  - SELECT: mindenki olvashat (publikus)
  - INSERT/UPDATE/DELETE: esperes/egyházmegyei admin a saját dioceseéhez (fájlnév séma: `{diocese_id}/cimer-{timestamp}.{ext}`), + globális admin/kerületi admin
- `NOTIFY pgrst, 'reload schema';` a végén

### 🔧 Szerver akciók

**`app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts`** bővítés:
- `checkDioceseSetupStatus(dioceseId?)` — ellenőrzi a 15 kötelező mezőt, visszaadja a hiányzók listáját
- `saveDioceseSetup(input)` — Zod-validálva menti az összes mezőt (`dioceses` UPDATE + `diocese_bealitas` auto-upsert)
- `uploadDioceseCimer(dioceseId, FormData)` — Storage upload, visszaadja a publikus URL-t

### 🎨 UI komponensek

- `components/modals/diocese-setup-wizard.tsx` — 5 lépéses full-page wizard, drag-and-drop címer upload, lépésenkénti validáció
- `components/layout/diocese-setup-banner.tsx` — globális warning banner
- `components/dashboard/diocese/diocese-setup-auto-open.tsx` — auto-open wrapper a dashboard-egyhazmegye oldalhoz

### 🔗 Integráció

- `app/(dashboard)/layout.tsx`: a diocese setup status lekérdezése minden dashboard oldalbetöltésnél, átadása a `DashboardLayoutClient`-nek
- `components/layout/dashboard-layout-client.tsx`: a `DashboardShell` fölött render-eli a `DioceseSetupBanner`-t, ha `dioceseSetupNeeded === true`
- `app/(dashboard)/dashboard-egyhazmegye/page.tsx`: `DioceseSetupAutoOpen` wrapper automatikus wizard-nyitással

### ▶️ Endre — futtatandó

```
migration-docs/sql/2026-04-18-dioceses-cimer-setup.sql
```

A végén `NOTIFY pgrst, 'reload schema';` — automatikusan frissíti a Supabase PostgREST cache-t.

### TypeScript check: **EXIT 0** ✅

---

## [2026-04-18p] — FÁZIS 8 REFAKTOR: scope-aware /penzugy (külön diocese UI helyett)

<!-- key: 2026-04-18-penzugy-scope-aware -->
<!-- category: improvement -->
<!-- version: 1.6.1 -->
<!-- targets: esperesek -->

### 🔄 Nagy architektúra-refaktor

Endre visszajelzése alapján a [2026-04-18o] verzió HIBÁS megközelítést használt: külön `DioceseFinanceSection` UI-t épített duplikációval. A helyes megközelítés: **a meglévő /penzugy oldal scope-tudatossá tétele**, így a profilváltás után ugyanaz a jól megszokott UI nyílik meg, csak a háttérben a `diocese_*` táblákra ír.

### ✨ Új architektúra

- **Új scope helper**: `lib/auth/finance-scope.ts` — `getFinanceScopeContext()` + `tablesFor(scope)` + `isYearFinalized()` + `yearValueFor(scope, year)`.
  - Detektálja az aktív `profile_role.scope`-ot ('diocese' vagy 'congregation').
  - Tábla-mapping hash: `befizetes` ↔ `diocese_befizetes`, `kiadas` ↔ `diocese_kiadas`, `bealitas` ↔ `diocese_bealitas`, `koltsegvetes` ↔ `diocese_koltsegvetes`, `annual_reports` ↔ `diocese_annual_reports`.

- **`penzugy/actions.ts` dual-path refaktor** (MVP):
  - `initFinance(year)` — scope-elágazás: diocese módban új `initFinanceDiocese()` helper, ugyanolyan struktúrát ad vissza, mint a gyülekezeti path (zéró regressziós kockázat).
  - `saveIncome` / `saveExpense` / `saveIncomeBatch` / `saveExpenseBatch` — scope alapján `insertIncomeRecord` vagy új `insertDioceseIncomeRecord` (ill. expense) helperhez hív.
  - `saveIncomeWithLinkedInventory` / `saveExpenseWithLinkedInventory` — diocese módban tiszta error (Phase 5).
  - `deleteTransaction` — scope-aware, diocese módban egyszerűbb (nincs belsomozgas_xkey pairing).
  - `getNextReceiptNumber`, `getLastRecordedDate` — scope-aware SELECT-ek.
  - `finalizeBudget`, `finalizeAccounting`, `requestAccountingUnlock` — scope alapján a `diocese_bealitas` + `diocese_annual_reports`-ra ír (egy lépésben submission+finalization, nincs `submitDocument` hívás).
  - `requestBudgetUnlock` — diocese módban MVP error (Phase 5).

- **`edit-storno-actions.ts` teljes scope-aware refaktor**: `isLastTransactionOfType`, `updateTransactionBasic`, `stornoTransaction`, `undoStornoTransaction` mind a `tablesFor(scope)` + `isYearFinalized()` helperre épül. Diocese módban a tag-referenciák (id_szemely/id_csalad) nem érhetők el, belsomozgas_xkey pairing sem. A kategória oszlop scope-specifikus: congregation `id_befizetescel/id_kiadascel` (int), diocese `id_szamadasicel` (string kód).

- **`finalization-actions.ts` scope-aware**: `runFinalizationChecks` diocese módban egy új `runDioceseFinalizationChecks` helpert fut le (csak kategória check-ek, a bank/FX/Oblio check-ek kihagyva). `listJegyzokonyvekForFinalization` diocese módban üres arrayt ad → a wizard automatikusan `manual` jkv módra vált.

- **`lib/finance/budget-compat.ts` scope-aware**: `loadBudgetRowsCompat(supabase, year, scopeId, scope?)` és `saveBudgetRowsCompat(supabase, year, scopeId, rows, scope?)` diocese módban a `diocese_koltsegvetes` táblára fut.

- **`/penzugy/page.tsx` scope detektálás**: ha `activeProfileRole.scope === 'diocese' && scopeId`, a diocese mód aktív. A `FinanceTabs` scope prop-pal kapja meg az információt.

- **`FinanceTabs` scope prop**: új opcionális `scope?: 'congregation' | 'diocese'` (default 'congregation'). Diocese módban a `debt`, `rental`, `monetary`, `oblio_ellenorzes` fülek nem renderelődnek.

- **`AccountingFinalizeWizard` scope prop**: új opcionális `scope` prop. Diocese módban **nincs** `submitDocument` hívás (a `diocese_annual_reports` egy lépésben tölti be a submission+finalization mezőket). Toast-üzenet is scope-specifikus.

- **`AccountingTabV2` scope prop**: átadja a wizardnak a scope-ot.

### 🧭 Sidebar scope-aware label + szűrés

**`components/layout/sidebar-adaptive-v4.tsx`**:

- Új `activeScope` prop a `SidebarAdaptiveV4` + `SidebarNav` szinten.
- Az **„Irányítópult"** menüpont dinamikus scope alapján:
  - `'diocese'` → **„Egyházmegyei irányítópult"** → `/dashboard-egyhazmegye`
  - `'district'` → **„Kerületi irányítópult"** → `/dashboard-kerulet`
  - default → **„Irányítópult"** → `/dashboard`
- Diocese scope-ban a fő modulok szűrése: csak **Irányítópult + Pénzügy + Profilom** látható (Tagnyilvántartás, Anyakönyv, Iktatás, Munkanapló, Leltár, Jegyzőkönyvek, Sírhelyek, Missziós Műhely el van rejtve).

- `DashboardLayoutClient` + `layout.tsx` propagálja az `activeScope`-ot.

### 🧹 Tisztítás — duplikáció megszüntetése

- **TÖRÖLVE**: `components/dashboard/diocese/diocese-finance-section.tsx` (teljes duplikált UI)
- **TÖRÖLVE**: `app/(dashboard)/dashboard-egyhazmegye/finance-actions.ts` (párhuzamos action-fájl)
- **MÓDOSÍTVA**: `components/dashboard/diocese/diocese-dashboard-tabs.tsx` — a `'finance'` fül teljesen eltávolítva (a `TabKey` union-ból, a tabs array-ből és a render blokkból is). Az esperes a sidebar „Pénzügy" menüponton keresztül éri el a `/penzugy`-t (scope=diocese).

### 📋 Az MVP hatóköre

- ✅ Éves költségvetés, bevétel/kiadás CRUD, számadás-véglegesítés scope-aware.
- ⏭ Phase 5-re halasztott diocese-ben: belsomozgas (internal transfer), bérleti szerződések, FX átértékelés, bank nyitó egyenleg, Oblio integráció, leltár-integrált rögzítés, Kartotéka-jkv integráció (jelenleg manual-only), költségvetés unlock workflow.

### 🗂️ MEGŐRZÖTT: a `diocese_*` táblák

A `diocese_bealitas` / `diocese_befizetes` / `diocese_kiadas` / `diocese_koltsegvetes` / `diocese_annual_reports` táblák **MEGMARADNAK** — ezek a scope-aware action-ök adatrétege.

### 🔐 RLS változatlan

Az RLS policy-k a [2026-04-18o]-ban kerültek be és továbbra is érvényesek.

### TypeScript check: **EXIT 0** ✅

### Verifikáció

**S1 — Gyülekezeti regresszió**: lelkész `/penzugy` minden funkciója változatlanul működik (11 fül, új bevétel/kiadás, költségvetés, számadás-véglegesítés).

**S2 — Esperes diocese váltás**:
1. Profilváltó → diocese scope.
2. Sidebar: „Egyházmegyei irányítópult" → `/dashboard-egyhazmegye` + Pénzügy + Profilom.
3. `/penzugy` megnyitva → `initFinance` diocese path → `diocese_*` táblákból adat.
4. Fülek: Áttekintés / Kassza / Bank / Tranzakciók / Költségvetés / Számadás / Súgó (a debt/rental/monetary/oblio nem látszik).
5. Új bevétel → `diocese_befizetes`-be.
6. Számadás-véglegesítés wizard → `diocese_bealitas.szamadas_veglegesitve=true` + `diocese_annual_reports` sor.

---

## [2026-04-18o] — FÁZIS 8: Egyházmegyei pénzügy (saját bevétel, kiadás, költségvetés, számadás)

<!-- key: 2026-04-18-egyhazmegyei-penzugy -->
<!-- category: feature -->
<!-- version: 1.6.0 -->
<!-- targets: esperesek -->

### ✨ Új funkciók

Az egyházmegyei dashboard **💰 Pénzügy** fülén az esperes mostantól teljes körű saját pénzügyi modult kezel:

- **📊 Áttekintés** — élő KPI (bevétel/kiadás/egyenleg) + kategóriabontás a tervvel szemben
- **💰 Bevétel** — kézi rögzítés, szerkesztés, törlés. A **„Befizető gyülekezet"** dropdown-ból közvetlenül kiválaszthatod, melyik gyülekezet fizette be az adott tételt (pl. 101.07 Központi járulék). A gyülekezet kiválasztásakor a „Forrás" mező auto-kitöltődik a gyülekezet nevével.
- **💸 Kiadás** — kézi rögzítés. A „Kedvezményezett gyülekezet" dropdown hasonlóan működik (pl. 206.05 Kiadások egyházközségek részére).
- **📋 Költségvetés** — éves tervezés szamadasicel-enként, véglegesítés.
- **✅ Számadás** — élő mérleg, véglegesítési workflow snapshot aggregációval.

### 🗂️ Új táblacsalád (5 új tábla)

**`migration-docs/sql/2026-04-18-egyhazmegyei-penzugy-fazis8.sql`**:

- `diocese_bealitas` — évenkénti konfig (költségvetés + számadás véglegesítési állapot)
- `diocese_befizetes` — egyházmegyei bevétel (+ `befizeto_congregation_id` a gyülekezet-forráshoz, + `source_befizetes_id` a későbbi auto-szinkronhoz)
- `diocese_kiadas` — egyházmegyei kiadás (+ `kedvezmenyezett_congregation_id`)
- `diocese_koltsegvetes` — éves költségvetés (PK: diocese_id + eve + szamadasicelid)
- `diocese_annual_reports` — egyházmegyei éves számadás snapshot (analog az `annual_reports`-szal)

### 🗂️ Meglévő táblák bővítése

- **`bankszamlak`**: új `scope` + `diocese_id` oszlopok, `congregation_id` nullable-re állítva. Így az egyházmegyének saját bankszámlái lehetnek (a gyülekezeti logikát nem érinti). CHECK constraint biztosítja: `scope='gyulekezet' → congregation_id NOT NULL` vagy `scope='egyhazmegye' → diocese_id NOT NULL`.
- **`chitanta_tombok.congregation_id`**: nullable-re állítva (a 2026-04-18-fazis6 bevezetett scope-ja mostantól tényleg működőképes).

### 🔒 RLS

Minden új táblán: csak a saját egyházmegye **esperes** / **egyházmegyei admin** / kerületi admin / globális admin szerkesztheti. Háromrétegű ellenőrzés:
1. `profiles.role IN ('admin', 'egyhazkeruleti_admin') + status='active'`
2. `profile_roles (scope='system'|'diocese'|'district', role='admin'|'esperes'|'egyhazmegyei_admin'|'egyhazkeruleti_admin')`
3. `profiles.diocese_id = diocese_id + role IN ('esperes', 'egyhazmegyei_admin')`

### 🔧 Szerver akciók

**`app/(dashboard)/dashboard-egyhazmegye/finance-actions.ts`**:

- `listDioceseIncome / upsertDioceseIncome / deleteDioceseIncome`
- `listDioceseExpense / upsertDioceseExpense / deleteDioceseExpense`
- `getDioceseBudget / upsertDioceseBudget / finalizeDioceseBudget`
- `getDioceseBealitas / finalizeDioceseAccounting` (snapshot aggregálás → `diocese_annual_reports`)
- `getDioceseFinanceSummary(year)` — élő KPI
- `listDioceseBankAccounts / listCongregationsInDiocese / listDioceseSzamadasicel` — segédlekérdezések

### 🎨 UI

- **`components/dashboard/diocese/diocese-finance-section.tsx`** — a teljes modul egy komponensben, belső `ColorTabs`-szal (áttekintés / bevétel / kiadás / költségvetés / számadás)
- 2 szerkesztő dialog: `IncomeEditDialog`, `ExpenseEditDialog` — `SearchableCategorySelect`-tel és gyülekezet-dropdown-nal
- Integrált a `diocese-dashboard-tabs.tsx` `finance` fülébe (a korábbi placeholder lecserélve)

### 🧩 Gyülekezetközi transzfer (MVP)

A **„Befizető gyülekezet"** és **„Kedvezményezett gyülekezet"** dropdown-ok már működnek a szerkesztő dialogokban. Az esperes kézzel rögzítheti az egyházközségektől érkező járulékokat (pl. 101.07, 101.08) a megfelelő gyülekezet kiválasztásával.

**Jövőbeli fejlesztés (5. kör)**: automatikus szinkronizáló gomb, ami a gyülekezetek véglegesített 101.07/101.08 bevételeiből automatikusan létrehozza az egyházmegyei `diocese_befizetes` sorokat. A táblában már van `source_befizetes_id` mező a duplikáció-védelemhez.

### ▶️ Endre — futtatandó

```
migration-docs/sql/2026-04-18-egyhazmegyei-penzugy-fazis8.sql
```

A végén `NOTIFY pgrst, 'reload schema';` — automatikusan frissíti a Supabase PostgREST cache-t. Az összes új tábla + bővítés idempotens.

Az ellenőrző SELECT-ek a fájl végén mutatják:
- Új táblák (5 db)
- `bankszamlak` új oszlopai (`scope`, `diocese_id`)
- `chitanta_tombok.congregation_id` nullable
- RLS policy-k az új táblákra

---

## [2026-04-18n] — HOTFIX: SQL RLS hibák — profile_roles.profile_id és helyes scope enum

<!-- key: 2026-04-18-sql-rls-profile-roles-fix -->
<!-- category: bugfix -->
<!-- version: 1.5.1 -->
<!-- targets: fejleszto -->

### 🐛 Kritikus javítások

Endre jelezte, hogy a 2026-04-18-as SQL migrációk nem futtak le:
```
ERROR: 42703: column pr.user_id does not exist
```

**A hiba oka**: a `profile_roles` tábla valós sémája (lásd `migration-docs/Database_schema.sql`) eltér attól, amit a migrációk feltételeztek:

| Hibás feltételezés | Valós séma |
|---|---|
| `pr.user_id` | **`pr.profile_id`** (FK → profiles.id = auth.users.id) |
| `pr.scope = 'egyhazmegye'` | **`pr.scope = 'diocese'`** |
| `pr.scope = 'egyhazkerulet'` | **`pr.scope = 'district'`** |
| `pr.scope = 'gyulekezet'` | **`pr.scope = 'congregation'`** |
| `pr.role IN ('god_admin', 'rendszergazda', 'master')` | Ezek a role-ok **NEM léteznek** a CHECK constraint-ben. A legmagasabb szint `profiles.role = 'admin'` + `status='active'`, vagy `profile_roles (scope='system', role='admin')`. |

### 🔧 Javított fájlok

- `migration-docs/sql/2026-04-18-admin-system-finance.sql` — RLS átírva:
  - `pr.user_id` → `pr.profile_id`
  - Admin-check mindkét mintában: `profiles.role = 'admin'` VAGY `profile_roles(scope='system', role='admin')`
  - `DROP POLICY IF EXISTS` a régi névvel is (idempotens)

- `migration-docs/sql/2026-04-18-egyhazmegyei-modul-fazis6.sql` — RLS átírva:
  - Ugyanaz a minta, + `scope='diocese'` / `scope='district'`
  - Esperes/egyházmegyei admin saját egyházmegyét szerkeszt
  - Egyházkerületi admin a saját kerületébe tartozó egyházmegyéket

- `app/(dashboard)/profile/profile-preferences-actions.ts` — javítva a `resolveDefaultDashboardPath` útvonala:
  - `/egyhazkeruleti-dashboard` → **`/dashboard-kerulet`** (a tényleges route a rendszerben)

### ⚠️ Tanulság (Endre alapelve szerint)

> **Ellenőrizz, ne találgass** — minden új SQL migráció előtt kötelező megnézni
> a `migration-docs/Database_schema.sql` fájlt, és a valós oszlopneveket + CHECK
> constraint-eket használni. A projekt alapelvei (`feedback_sql_ellenorzes_egyben.md`,
> `feedback_verify_ask_document.md`) pontosan ezt írják elő.

### ▶️ Endre, most már újrafuttatható

Mindkét migráció idempotens — a korábbi (sikertelen) próbák nem okoztak
részleges állapotot. Csak futtasd újra a két fájlt.

---

## [2026-04-18m] — Egyházmegyei modul (FÁZIS 6, 7, 9) — Egyházmegyénk + nyugtatömbök + automatikus profilváltás

<!-- key: 2026-04-18-egyhazmegyei-modul -->
<!-- category: feature -->
<!-- version: 1.5.0 -->
<!-- targets: esperesek -->

### ✨ Új funkciók

- **„Egyházmegyénk" fül** az egyházmegyei dashboardon — az esperes szerkesztheti az egyházmegye **hivatalos adatait**:
  - Jogi azonosítók: CIF, magyar adószám, hivatali főszám
  - Cím: ország, megye, település, irányítószám, utca
  - Elérhetőségek: email, telefon, weboldal
  - Banki adatok: bank neve, fő IBAN, valuta (RON/EUR/HUF/USD)
  - Vezetés: esperes neve/címe, egyházmegyei jegyző neve
  - Megjegyzés

  Ezek az adatok a hivatalos dokumentumokon (nyugták, kiadási utalványok, pénzügyi jelentések) megjelennek majd.

- **Egyházmegyei nyugtatömbök** — külön nyugtatömbök az egyházmegyének (a gyülekezeti mellett). Új fül: **🧾 Nyugtatömbök** az egyházmegyei dashboardon:
  - Listázás: széria, számok, darabszám, felhasznált, maradék, vásárlás dátuma, ár
  - Új tömb rögzítése (wizard dialog átfedés-ellenőrzéssel)
  - Tömb lezárása (kézi befejezés)
  - Tömb törlése (csak használatlan)
  - Aktív tömb KPI panel: következő szám, maradék darabszám, felhasznált

- **Automatikus profilváltás bejelentkezéskor** — ha egy felhasználónak **több szerepköre** van (pl. gyülekezeti lelkipásztor + esperes), a rendszer automatikusan a legmagasabb szintű aktív szerepkör dashboardjára irányít. Prioritás (csökkenő):
  1. Admin/rendszergazda → `/admin`
  2. Egyházkerületi admin → `/egyhazkeruleti-dashboard`
  3. Esperes → `/dashboard-egyhazmegye`
  4. Lelkész / könyvelő / számvevő → `/dashboard`

- **Kezdőfelület választó a profilon** — a multi-role felhasználók választhatnak saját alapértelmezett dashboardot (a rendszer-defaultot felülírva). A választás a `profile_preferences.default_dashboard`-ban rögzül.

### 🗃️ SQL migráció

**`migration-docs/sql/2026-04-18-egyhazmegyei-modul-fazis6.sql`**:
- `dioceses` tábla bővítése: cif, adoszam, cim_*, email, telefon, weboldal, bank_*, esperes_nev/cim, jegyzo_nev, megjegyzes, updated_at, updated_by
- `chitanta_tombok` bővítése: `scope` ('gyulekezet'/'egyhazmegye') + `diocese_id` FK
- CHECK constraint: scope='gyulekezet' ↔ congregation_id NOT NULL; scope='egyhazmegye' ↔ diocese_id NOT NULL
- Új tábla: `profile_preferences` (user_id PK, default_dashboard, last_used_scope, last_used_scope_id)
- RLS:
  - `dioceses` UPDATE: esperes/egyházmegyei admin a sajátját, egyházkerületi admin a saját kerületbe tartozót
  - `profile_preferences` SELECT/UPSERT csak saját sorra
- `updated_at` trigger

### 🔧 Szerver akciók

- **`app/(dashboard)/dashboard-egyhazmegye/diocese-actions.ts`**:
  - `getDiocese(dioceseId?)` — olvasás
  - `updateDiocese(input)` — szerkesztés Zod validációval
  - `getDioceseBankSummary(dioceseId?)` — fő IBAN gyors megjelenítés

- **`app/(dashboard)/dashboard-egyhazmegye/chitanta-tombok-actions.ts`**:
  - `listDioceseChitantaTombok`, `getActiveDioceseChitantaTombStatus`
  - `createDioceseChitantaTomb` (átfedés-ellenőrzés!)
  - `closeDioceseChitantaTomb`, `deleteDioceseChitantaTomb` (csak használatlan)

- **`app/(dashboard)/profile/profile-preferences-actions.ts`**:
  - `getProfilePreferences` / `updateDefaultDashboard` / `saveLastUsedScope`
  - `resolveDefaultDashboardPath` — a legfontosabb: bejelentkezés után hova irányítsunk

### 🎨 UI komponensek

- `components/dashboard/diocese/our-diocese-section.tsx` — Egyházmegyénk adatszerkesztő
- `components/dashboard/diocese/diocese-chitanta-tombok-section.tsx` — nyugtatömb modul
- `components/profile/default-dashboard-selector.tsx` — alapértelmezett dashboard választó a profilon

### 🔗 Integráció

- **`app/page.tsx`** (root): bejelentkezés után `resolveDefaultDashboardPath`-ot hív
- **`components/dashboard/diocese/diocese-dashboard-tabs.tsx`**: 2 új fül — „🏛️ Egyházmegyénk" és „🧾 Nyugtatömbök"
- **`app/(dashboard)/profile/page.tsx`**: új kártya az alapértelmezett kezdőfelülethez

### ⏭️ Jövőbeli

- **FÁZIS 8** (külön): egyházmegyei költségvetés + számadás. Ez nagyobb volumenű — a meglévő pénzügyi táblákat (bealitas, befizetes, kiadas, koltsegvetes, szamadas) ki kell terjeszteni egyházmegyei scope-ra, vagy új `diocese_finance_*` családot létrehozni. Külön 4. körben intézzük.

---

## [2026-04-18l] — Admin Rendszer pénzügyei modul (FÁZIS 5)

<!-- key: 2026-04-18-admin-system-finance -->
<!-- category: feature -->
<!-- version: 1.4.0 -->
<!-- targets: rendszergazda -->

### ✨ Új funkciók

- **Új admin fül: „Rendszer pénzügyei"** — Endre (rendszerfejlesztő) számára átlátható kép a rendszer pénzügyi helyzetéről. 5 szekció:
  1. **KPI panel** — havi bevétel, költség, profit + aktív előfizetők / összes gyülekezet
  2. **Havi rendszer-költségek** (szerkeszthető táblázat): Supabase, Vercel, Cloudflare R2, AI szerver (GPU + proxy + monitoring), mobil, Sentry, domain. Kategória, USD/RON, árfolyam, aktív/inaktív, sorszám — mindegyik módosítható.
  3. **Árazási sávok** (szerkeszthető táblázat): **tag-szám szerint** — Endre alapelve: „képesség szerinti elosztás". Alapértelmezett 8 sáv:
     - Kis gyülekezet (0-100 tag): 20 RON/hó
     - Közepes-kicsi (101-200): 30 RON/hó
     - Közepes (201-400): 45 RON/hó
     - Nagy (401-800): 65 RON/hó
     - Mega (801+): 90 RON/hó
     - + Tesztidőszak (ingyen), Referencia gyülekezet (50% kedvezmény), Egyházmegyei csomag (15.000 RON/év)
  4. **Gyülekezeti előfizetések** (szerkeszthető): ki fizet mennyit, mikor, milyen típusú előfizetéssel. Új előfizetés hozzáadásakor automatikusan felajánlja a tag-szám szerinti sávot.
  5. **Skálázási előrejelzés**: 25 / 50 / 100 / 200 / 500 / 1000 gyülekezet szcenáriók — havi/éves bevétel, költség, profit, profit margin %-ban.

### 🗃️ SQL migráció

- **`migration-docs/sql/2026-04-18-admin-system-finance.sql`** — 3 új tábla:
  - `system_finance_costs` — havi rendszer-költségtételek
  - `system_pricing_tiers` — árazási sávok
  - `congregation_subscriptions` — gyülekezeti előfizetések (FK: congregations, pricing_tiers)

  Plusz:
  - RLS policy: csak `god_admin` vagy `rendszergazda` szerepkör szerkesztheti
  - Seed-ek: 8 árazási sáv + 14 költségtétel az üzleti terv (Egyhazi_Uzleti_Terv_2026_v2.docx) és költségvetés (Egyhazi_Rendszer_Koltsegvetes_2026_v5.xlsx) alapján
  - `updated_at` trigger függvény
  - Ellenőrző SELECT-ek a fájl végén

### 🔧 Szerver akciók

- **`app/(dashboard)/admin/system-finance-actions.ts`**:
  - `listSystemCosts` / `upsertSystemCost` / `deleteSystemCost`
  - `listPricingTiers` / `upsertPricingTier` / `deletePricingTier`
  - `listCongregationSubscriptions` / `upsertCongregationSubscription` / `deleteSubscription`
  - `getSystemFinanceSummary` — aggregált pénzügyi kép (bevétel, költség, profit, tag-szám szerinti bontás)
  - `getScalingForecast` — 6 szcenárió (25–1000 gyülekezet)
  - `suggestPricingTierForCongregation` — automatikus sáv-javaslat tag-szám alapján
  - `listCongregationsForSubscription` — dropdown-adatok

### 🎨 UI

- **`components/admin/system-finance-tab.tsx`** — a teljes modul egy komponensben
- Színkód: **rose** (vörös) — admin tabs v3 új fül "Rendszer pénzügyei"
- Szerkesztő dialogok mindhárom táblához (cost/tier/subscription) — `ModalField` dizájn rendszer, responsive

### 📝 Referencia

Az árazási stratégia Endre üzleti terve (`Egyhazi_Uzleti_Terv_2026_v2.docx`) alapján készült:
- Szerzői jogi licencia modell (Legea 8/1996) — cég nélkül, természetes személyként
- 10% jövedelemadó + 40% költségátalány
- CASS/CAS küszöbök 2026-ra figyelembe véve
- Havi + éves + egyházmegyei csomag opciók

A költségbecslés (`Egyhazi_Rendszer_Koltsegvetes_2026_v5.xlsx`) az „AJÁNLOTT + AI" szcenárióval dolgozik: Supabase Pro, Vercel Pro, Cloudflare R2 (NINCS egress díj), Apple Developer, Sentry Team, + Qwen 2.5 72B AI szerver Vast.ai-n (A100 80GB, EU adatközpont).

---

## [2026-04-18k] — Hibajavítás: button-in-button hydration hiba + BCR import xkey NOT NULL

<!-- key: 2026-04-18-bcr-button-xkey-fix -->
<!-- category: bugfix -->
<!-- version: 1.3.0 -->
<!-- targets: lelkészek -->

### 🐛 Kritikus javítások

- **Button-in-button hydration hiba** — a `SearchableCategorySelect`-ben az X törlő gomb a trigger `<button>` belsejében volt, ami érvénytelen HTML és hydration errort okozott minden oldalon, ahol megjelent (pl. BCR import, kassza tétel szerkesztő). Javítás: az X gomb kikerült a trigger button mellé, `absolute right-9 top-1/2 -translate-y-1/2` pozícióban, `z-10`-zel a button fölött, `tabIndex={-1}`-vel hogy ne zavarja a fókusz-ciklust. A trigger padding-right (`pr-14` / `pr-9`) dinamikusan állítódik attól függően, hogy látszik-e az X.

- **BCR banki import: „null value in column xkey" hiba** — a banki Excel import `befizetes` beszúrásai (jóváírás + kassza átvezetés 2 helyen) nem adtak meg `xkey` és `nyugta` értéket, de a `befizetes` tábla legacy séma NOT NULL constraint-el rendelkezik. Javítás: minden `befizetes` insert payload mostantól tartalmazza `xkey: randomUUID()` és `nyugta: docNumber` mezőket. Érinti a 3 befizetes insertet a `bank-import-actions.ts`-ben.

---

## [2026-04-18j] — BCR import wizard: dropdown portál, kategória-gate, névtelen jelzés + FX gomb eltávolítás

<!-- key: 2026-04-18-bcr-dropdown-portal-kategoria-gate -->
<!-- category: bugfix -->
<!-- version: 1.2.9 -->
<!-- targets: lelkészek -->

### 🐛 Javítások

- **Kategória dropdown már nem vágódik le** — a `SearchableCategorySelect` most a `document.body`-re portálódik `createPortal`-lal, `fixed` pozíciót használ. A BCR import wizard szűk táblázat-celláján belül is teljes szélességben (min. 260px) és magasan megjeleníti a lista, scroll és resize esetén is követi a trigger helyzetét.

- **Kategória név megjelenítés helyreállítva** — a szerver `actions.ts:450` korábban csak a `szint = 'gyulekezet'` szamadasicel rekordokat kérte le. Endre diagnosztikai SQL-je kimutatta, hogy a `befizetescel` / `kiadascel` junction táblákban **aktív sorok** (10+ db!) hivatkoznak `egyhazmegye` szintű szamadasicel rekordokra (pl. 201.15 Nettó fizetések, 201.17 CAS, 201.18 CASS, 206.02 Biztosítások, 206.03 Missziói segélyek, 206.05 Kiadások egyházközségek részére stb.). Mivel a név-lookup nem találta őket, csak a kód jelent meg a dropdown-ban. Javítás: a szerver most MINDEN szintű szamadasicel-t lekér, a szint-szűrést a kliens UI végzi (budget-tab, accounting-tab, accounting-tab-v2) csak a **tervezési/display** listáknál — a **lookup** viszont mindig teljes.

- **`SzamadasiCel.kod` undefined javítása** — a TypeScript típus `kod: string` mezőt ír elő, de a `szamadasicel` táblában NINCS `kod` oszlop. A szerver most `kod = String(id)` mapping-gel tölti ki, így a kliens kódban minden `c.kod` referencia működik.

- **Biztonsági háló a névtelen kategóriákra** — a `SearchableCategorySelect` mostantól csak akkor jelzi `⚠ Névtelen kategória` módon, ha a név VALÓBAN üres, vagy ha a név pont ugyanaz, mint a tipikus kategória-kód formátum (`XXX.YY`). Ez a javítás utáni szokásos állapotban nem aktiválódik.

### ✨ Új funkciók

- **Wizard kategória-gate** — a BCR import wizard „Kategorizálás" lépésén a „Megerősítés" gomb mostantól **disabled, amíg bármely tételnél hiányzik a kategória**. Egy sárga banner is megjelenik a gomb felett, amely pontosan mutatja, hány tétel maradt. Javaslat: ha nem kell importálni egy tételt, állítsd „Kihagy"-ra.

### 🗑️ Eltávolítva

- **Évvégi átértékelés gomb a Bank fül valutás kártyájáról** — a Számadás véglegesítő wizard (lásd `[2026-04-18h]`) automatikusan ellenőrzi a december 31-i FX revaluation-t, ezért a bank kártyáról a külön gomb feleslegessé vált. A `FxRevaluationDialog` komponens továbbra is elérhető, de a `bank-tab.tsx` már nem használja. A parent `finance-tabs.tsx` `onFxRevaluationSaved` prop-ja is el lett távolítva.

### 🔍 Diagnosztika (archívum)

- **`migration-docs/sql/2026-04-18-diagnoszika-szamadasicel.sql`** — CSAK OLVAS. Ez az SQL segítette kideríteni a hiba valódi okát: 10+ `aktiv=true` junction táblabeli sor hivatkozik `egyhazmegye` szintű `szamadasicel`-re (pl. 201.15-201.19, 206.02-206.06). A szerver-oldali szint-szűrés miatt ezek neve nem érkezett el a klienshez — ezért csak a kód látszott a dropdown-ban. A fenti „Kategória név megjelenítés helyreállítva" bejegyzés a javítás, az SQL megmarad referenciaként.

---

## [2026-04-18i] — BCR import wizard: kategória név (kód rejtve) + iratszám oszlop

<!-- key: 2026-04-18-bcr-import-kategoria-iratszam -->
<!-- category: improvement -->
<!-- version: 1.2.8 -->
<!-- targets: lelkészek -->

### 🎨 UX javítások

- **Kategória választó → kereshető, csak NÉV látszik** — a BCR banki import wizard „Kategorizálás" lépésében a régi natív `<select>` (ahol csak a számadási kód, pl. „101.01" látszott összecsukva) helyére a már meglévő `SearchableCategorySelect` komponens került. A lelkész most:
  - Csak a kategória **nevét** látja (a belső kódok el vannak rejtve)
  - Gépelhet is a listában (ékezet-érzéketlen, kis/nagybetű érzéketlen szűrés)
  - Billentyűzet-navigáció (↑/↓/Enter/Esc)
  - Kattintható X a kiválasztott kategória törléséhez

- **Új oszlop: „Iratszám"** — a táblázatban a Kategória mellett mostantól van egy iratszám input mező is:
  - Alapértelmezetten a BCR fájlból érkező `reference` értékkel kitöltődik (ha van)
  - A lelkész átírhatja (pl. `123/2026`, `SZLA-45/2025`) a saját számlaszám vagy nyugta szám alapján
  - Csak akkor látszik, ha a tétel nem „Kihagy" művelet
  - Importáláskor ez kerül a `befizetes.iratszam` / `kiadas.iratszam` (és `nyugta` a kiadásnál) mezőbe

### 🔧 Technikai

- `BankImportItem` típus: új `iratszam?: string` mező
- `RowDecision` típus a wizardban: új `iratszam?: string` mező
- `bank-import-actions.ts` `docNumber` fallback prioritás: **`item.iratszam` → `item.reference` → leírás alapú generálás**

---

## [2026-04-18h] — Számadás véglegesítő wizard — vezetett 5 lépéses folyamat

<!-- key: 2026-04-18-szamadas-veglegesito-wizard -->
<!-- category: feature -->
<!-- version: 1.2.7 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Számadás véglegesítése — wizardban** — a Pénzügy › Számadás fülön a „Véglegesítés és beküldés" gomb mostantól egy **5 lépéses vezetett wizardot** nyit meg, a régi `prompt()` sorozat helyett. A lelkészt végigvezetjük minden szükséges ellenőrzésen.

- **5 lépés:**
  1. **Áttekintés** — élő összefoglaló (bevétel/kiadás terv vs tény, egyenleg) színes, áttekinthető kártyákkal.
  2. **Automatikus ellenőrzések** — 6 check párhuzamosan fut: banki nyitó egyenleg, valutás FX átértékelés (december 31-i), bevétel kategóriák, kiadás kategóriák, járulékbefizetők azonosítása, Oblio számlák bevezetése. Piros hiba **blokkolja a továbblépést**, sárga figyelmeztetés engedi tovább, zöld pipa OK. Minden hibához „Javítás a … fülön" gomb kattintásra odanavigál.
  3. **Presbiteri jegyzőkönyv** — két opció:
     - **Kartotéka mód**: kiválasztja a lelkész a Kartotékában írt presbiteri jegyzőkönyvet és a megfelelő napirendi pontot. A rendszer automatikusan beírja a jegyzőkönyvi számot (határozatszám `{sorszam}/{ev}` formában, ha van kapcsolt határozat, egyébként az ülés sorszáma alapján). A tárgyalási dátum is automatikusan kitöltődik.
     - **Manuális mód**: a lelkész kézzel írja be a jegyzőkönyvi számot és a dátumot (pl. ha papíron van).
  4. **Megerősítés** — utolsó összefoglaló minden adattal: év, egyenlegek, jegyzőkönyvi szám, dátum, forrás (Kartotéka vagy Manuális). Sárga figyelmeztető box: mi történik a megerősítés után.
  5. **Kész** — siker képernyő + toast.

- **Könyvelési biztonsági háló** — a `fx_revaluation` check **blokkoló hibaként** jelez, ha egy valutás bankszámlán hiányzik a december 31-i FX átértékelés, megelőzve a helytelen záró egyenlegeket.

- **Snapshot bővítése** — a véglegesítés után a `document_submissions` és `bealitas.accounting_finalized` rekordba az új mezők is bekerülnek: `jegyzokonyvForras` (`'kartoteka' | 'manual'`), `presbiteri_jegyzokonyv_id`, `presbiteri_napirendi_pont_id`.

### 🔧 Új server actionök (`app/(dashboard)/penzugy/finalization-actions.ts`)

- `runFinalizationChecks(year)` — 6 ellenőrzés párhuzamosan, `CheckItem[]` + `hasBlocker/hasWarning` aggregációval
- `listJegyzokonyvekForFinalization(year)` — `presbiteri_jegyzokonyvek` + `jegyzokonyv_napirendi_pontok` + `jegyzokonyv_hatarozatok` a tárgyévre és a következő évre (mert gyakran a tárgyévet követő tavasszal tárgyalják a számadást)

### 🎨 UI (`components/modals/accounting-finalize-wizard-dialog.tsx`)

- Nagy dialog (`96vw` mobile, 1100px desktop), teljes képernyős overlay, responsive
- Ibolyaszín primary (a Pénzügy fülszínével egyező tónus), progresszus-jelző chip-sor felül
- A gomb ki-be kapcsol a `canGoNext()` logika alapján (nem lehet átugrani egyetlen lépést sem)
- Minden ellenőrzéshez egyedi ikonok, színkódolás (zöld/sárga/piros), fix URL-ek

### 🗃️ Backward compatibility

- A korábbi `prompt()`-alapú flow teljesen eltávolítva az `accounting-tab-v2.tsx`-ből
- A szerver `finalizeAccounting` és `submitDocument` API változatlan — a wizard ugyanazokat hívja, csak kontrollált paraméterekkel

---

## [2026-04-18g] — Könyvelési pontosság: FX december 31-re, nem január 1-re + évhelyes BNR

<!-- key: 2026-04-18-fx-konyvelesi-pontossag -->
<!-- category: bugfix -->
<!-- version: 1.2.6 -->
<!-- targets: lelkészek -->

### 🐛 Javítások (KÖNYVELÉSI PONTOSSÁG)

- **FX (árfolyam nyereség/veszteség) helyes dátum** — a korábbi implementáció januári 1-i dátummal könyvelt volna, ami **könyvelésileg hibás**. A román (OMFP 1802/2014) és magyar egyházi számvitel szerint az árfolyam nyereség/veszteség **DECEMBER 31-I DÁTUMMAL** kerül könyvelésre (év végi revaluation). Az új év január 1-i RON nyitó = december 31-i átértékelt záró RON (ugyanaz az érték, **nincs új FX tranzakció**).

- **Év eleji állapot ellenőrzés** — a banki import wizard a régi „FX könyvelés januárra" automata gomb helyett most **ELLENŐRZI**, hogy az előző évre megtörtént-e az FX revaluation (`valuta_atert` táblából). 4 lehetséges státusz:
  - ✅ **`ok_matching`**: előző évi FX revaluation meg van, árfolyam egyezik, nincs teendő
  - ⚪ **`ok_no_previous`**: új bankszámla vagy első import, nincs előző évi adat
  - 🟡 **`fx_revaluation_needed`**: hiányzik az előző évi FX revaluation → link az „Évvégi átértékelés"-re
  - 🟠 **`arfolyam_mismatch`**: az új árfolyam eltér az előző évi záró árfolyamtól → ellenőrzésre jelez

- **Évhelyes BNR/Frankfurter árfolyam** — a BNR gomb most a `nyitoEve` évet figyelembe veszi:
  - **Aktuális évre**: napi BNR XML (friss árfolyam)
  - **Historikus évre (pl. 2025)**: az előző év (2024) utolsó publikált napját használja (könyvelési gyakorlat: év eleji nyitó = előző év záró árfolyam)
  - BNR éves historikus XML (`nbrfxrates{YYYY}.xml`) vagy Frankfurter `/v1/{YYYY}-01-01` API
  - Jelzi a dátumot és forrást: `"BNR EUR árfolyam: 4.9589 (2024-12-31) — 2025. évre érvényes"`

### ⚠️ Deprecation

- `previewFxAtYearStart` és `applyFxAtYearStart` → **DEPRECATED** (hibás könyvelési logika)
  - A szerver hibaüzenettel utasít el, és átirányít a helyes `checkYearStartState` + évvégi `FxRevaluationDialog` útra

### 📚 Könyvelési magyarázat

A wizard új blue magyarázó box-a a lelkésznek:
> „Az árfolyam-nyereség / veszteség DECEMBER 31-I DÁTUMMAL kerül könyvelésre (év végi revaluation). Az új év január 1-i RON nyitó egyenleg = a december 31-i átértékelt záró RON (ugyanaz az érték, nincs új FX tranzakció)."

---

## [2026-04-18f] — Bank fül: számla-szintű bontás + élő FX nyereség/veszteség automatikus könyvelés

<!-- key: 2026-04-18-bank-szamla-bontas-fx -->
<!-- category: feature -->
<!-- version: 1.2.5 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Számla-szintű forgalom bontás**: a Bank fülön ha több bankszámla van, mostantól **bankszámla-szerinti szűrő** van a kártyák felett. Minden KPI (nyitó, bevétel, kiadás, záró egyenleg), tranzakció-lista és havi csoportosítás a kiválasztott számlára szűr. Ha csak 1 aktív számla van, automatikusan arra szűr. A „még nem számla-szintű" sárga figyelmeztetés eltávolítva.

- **Élő FX átértékelés előnézet** a banki import wizard „Nyitó egyenleg" lépésében valutás (EUR/HUF) számláknál:
  - **BNR gomb**: egy kattintással lekéri a legfrissebb BNR árfolyamot (`fetchBnrRateAction`)
  - **Élő számítás**: ahogy a lelkész írja a valuta-egyenleget és az árfolyamot, azonnal látja a RON ekvivalenst
  - **FX nyereség/veszteség kalkuláció** (könyvelői szemmel): ha van előző évi rögzített nyitó egyenleg, a rendszer kiszámolja az előző év záró RON-ját (nyitó + bevételek - kiadások), és összeveti az új év január 1-i RON-nal. A különbség az árfolyam nyereség (📈) vagy árfolyam veszteség (📉).
  - **Automatikus könyvelés**: egy gombra kattintva az FX különbség bekerül a rendszerbe január 1-i dátummal — pozitív esetben `befizetes` a 103.04 (Árfolyam nyereség) kódra, negatív esetben `kiadas` a 203.03 (Árfolyam veszteség) kódra. Megerősítő dialog előzi meg.
  - Vizuálisan: zöld (nyereség) vagy piros (veszteség) kártya, tétles összehasonlító táblázattal.

### 🔧 Új server actionök

- `previewFxAtYearStart` — előnézet: előző év záró RON vs új év RON, különbség számítás
- `applyFxAtYearStart` — automatikus könyvelés január 1-i dátummal a 103.04 vagy 203.03 kódra

### 📚 Könyvelői magyarázat

A romániai és magyar egyházi számvitelben:
- Egy valutás bankszámla év eleji RON egyenlege = valuta-egyenleg × januári BNR árfolyam
- Ha ez eltér az előző év december 31-i könyv szerinti záró RON-tól, a különbség FX nyereség/veszteség
- Ez az **év végi FX átértékelés** (már meglévő funkció) mellett **év eleji beigazítás** — ugyanolyan fontos, ha az előző évi revaluation nem történt meg pontosan

---

## [2026-04-18e] — Bankszámla éves nyitó egyenleg + valutás tranzakciók RON értéke

<!-- key: 2026-04-18-bank-nyito-egyenleg-ron -->
<!-- category: feature -->
<!-- version: 1.2.4 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Éves bontású nyitó egyenleg** (új `bankszamla_nyito_egyenleg` tábla) — a bankszámla létrehozásakor már NEM kell nyitó egyenleget megadni; a banki Excel import wizard-ban rögzítjük évenként.
- **Banki import wizard új „Nyitó egyenleg" lépés** — ha az importált tranzakciók legkorábbi éve új (nincs még rekord), a wizard bekéri:
  - RON számlánál: egyszerűen a január 1-i egyenleg
  - **Valutás számlánál** (EUR, HUF, stb.): valuta-egyenleg + árfolyam + RON ekvivalens (auto-számolással)
- **Valutás tranzakciók RON ekvivalense** — új `osszeg_ron` és `arfolyam` oszlopok a `befizetes` és `kiadas` táblákon. Minden importált valutás tranzakcióhoz automatikusan generálódik a RON érték a nyitó egyenleg árfolyama alapján. A könyvelésben, számadásban, Registru-ban így mindig RON érték áll rendelkezésre.
- **Bank fül bankkártya** most mutatja az aktuális év nyitó egyenlegét (valutában + RON ekvivalens ha valutás). Ha még nincs rögzítve, sárga figyelmeztetés jelenik meg.

### 🎨 UX javítások

- **Bankszámla hozzáadás dialog** egyszerűsítve: már NEM kéri közvetlenül a nyitó egyenleget. Helyette egy kék magyarázó doboz elmondja, hogy a banki Excel import wizard kezeli évenkénti bontásban.

### 🔧 Adatbázis migrációk

- `bankszamla_nyito_egyenleg` tábla (RLS-sel, `profile_roles` helyes oszlopaival)
- `befizetes.osszeg_ron`, `befizetes.arfolyam`
- `kiadas.osszeg_ron`, `kiadas.arfolyam`
- Visszafelé-kompatibilis backfill: RON számlák meglévő tételeinél `osszeg_ron = osszeg, arfolyam = 1`

### 📝 FX átértékelés megjegyzés

Az év végén a meglévő **FX átértékelés** funkció (Bank fül → „Évvégi átértékelés") továbbra is működik: a december 31-i BNR árfolyamra igazítja a RON egyenleget, és a különbséget árfolyam-nyereség/veszteség számadási célra könyveli.

---

## [2026-04-18d] — Pénzügyi súgó átszervezés: alponti nyomtatás, élő checklist, 4 új topic

<!-- key: 2026-04-18-sugo-atszervezes -->
<!-- category: improvement -->
<!-- version: 1.2.3 -->
<!-- targets: lelkészek -->

### ✨ Új funkciók

- **Élő év végi zárás checklist a súgó legvégén** — a lelkész bepipálhatja az elvégzett teendőket (napi/havi/negyedéves/év végi csoportokban). A pipálások a böngészőben mentődnek évenkénti bontásban, progress bar mutatja a készenlétet. Ha minden év végi pont kész, zöld kártya jelzi: „Készen állsz a véglegesítésre!"
- **Minden súgó-topic saját nyomtatási ikonnal** (böngésző print + PDF letöltés) — a tetejéről eltávolítottuk a 3 fix PDF-kártyát, helyette minden témának saját, kontextus-szerű nyomtatása van.
- **4 új súgó-topic az új funkciókhoz**:
  - 🧾 Nyugtatömb rendszer — rögzítés, automatikus szám-kezelés, éves kimutatás
  - 🔄 Tétel szerkesztés és stornó — kereshető kategória, dátum-védelem
  - 📊 Banki Excel import (BCR) — 4 lépéses wizard duplikáció-védelemmel
  - 📦 Anyagraktár — gyorsan fogyó készletek, Anyagraktárkönyv nyomtatás

### 🎨 UX javítások

- **Hírlevél szerkesztő dialog responsive fix** — 96vw x 94vh méretre bővítve, grid min-width:0 fix (a korábbi zsúfolt kis ablak javítva).

---

## [2026-04-18c] — Fejlesztési hírlevél + tétel szerkesztő finomítás + admin sorrend fix

<!-- key: 2026-04-18-hirlevel-tetel-szerkeszto -->
<!-- category: feature -->
<!-- version: 1.2.2 -->
<!-- targets: rendszergazdák, lelkészek -->

### ✨ Új funkciók

- **Fejlesztési hírlevél** — admin rendszergazdának dedikált szerkesztő az Admin → Frissítések fülön. Több CHANGELOG bejegyzés egy szép, kategóriák szerint csoportosított HTML emailben küldhető ki:
  - Multi-select: válaszd ki, melyik frissítések kerüljenek be (alapértelmezetten minden el nem küldött)
  - Személyes bevezető szöveg + custom hírlevél-cím
  - Kategória badge-ek (🔒 Biztonság, 🐛 Javítás, ✨ Új funkció, 🚀 Fejlesztés, ⚠️ Átalakítás)
  - Élő előnézet iframe-ben, HTML letöltés
  - Broadcast + opcionális email (Resend)
  - A kiküldött bejegyzések automatikusan megjelölve (nem küldhetők ki újra)

- **Tétel szerkesztő finomítások** (Kassza + Bank fül):
  - **Kereshető kategória választó**: gépelj az kereséshez, a belső kódok (pl. "101.01") rejtve vannak, csak a kategória neve látszik
  - **Dátum védelem**: a tétel dátuma csak akkor szerkeszthető, ha az éven belüli utolsó tétel (kronológiai integritás védelme). Egyéb esetben a mező letiltva, magyarázattal: "Ha másik dátum kell, stornózd és rögzítsd újra."

### 🎨 UX javítások

- **Admin Frissítések fül**: a bejegyzések most **legfrissebb dátummal felül** jelennek meg (a CHANGELOG írási sorrendje helyett).

---

## [2026-04-18b] — Anyagraktár SQL fix, multi-tömb rögzítés, bank import duplikáció-védelem, egyházmegyei pénzügy terv

<!-- key: 2026-04-18-anyagraktar-multi-tomb-dedup -->
<!-- category: improvement -->
<!-- version: 1.2.1 -->
<!-- targets: mindenki -->

### 🐛 Javítások

- **Anyagraktár SQL RLS fix** (`2026-04-18-anyagraktar.sql`) — a `profile_roles` tábla helyes oszlopait használjuk: `pr.active = true AND pr.approval_status = 'approved'` (a téves `pr.status = 'active'` helyett). A `scope_id` már UUID típusú, nem kell `::uuid` cast. Idempotens `DROP POLICY IF EXISTS` pattern.
- **Oblio Utolsó letöltés dátum** — már nem minden oldalfrissítéskor íródik felül, hanem csak akkor, ha ténylegesen új ZIP / XML érkezett a mappába. A timestamp a legfrissebb XML `lastModified` értéke (nem a rendszeridő).

### ✨ Új funkciók

- **Több nyugtatömb rögzítése egyszerre** — a kerületi átvételnél tipikus eset (3-5 tömb egyszerre): a wizard repeater-szerűen fogad több tömböt közös vásárlási dátummal és összesített árral (egyenletesen elosztva). A rendszer ellenőrzi a batch-en belüli és a meglévő tömbökkel való átfedéseket is.
- **Bank import duplikáció-védelem** — ha a lelkész véletlenül kétszer importálja ugyanazt az Excel-t, a rendszer észleli a duplikátumokat (dátum + bankszámla + összeg alapján) és kihagyja őket. Új statisztika az import eredményben: `X duplikátum (már szerepelt a rendszerben)`.
- **Bank import régebbi tranzakciók elrejtése** — a wizard parse után lekérdezi a legutóbb importált tranzakció dátumát az adott bankszámlához, és alapértelmezetten elrejti a régebbi tételeket. A felhasználó nem kell minden alkalommal végigmennie a már importált soron.

### 📄 Tervezetek

- **Egyházmegyei pénzügy + leltár terv** (`migration-docs/todo/phase-egyhazmegyei-penzugy-leltar.md`) — részletes terv a profilváltás alapú egyházmegyei pénzügyi / leltári modulhoz. 3 opció elemzése, javasolt a "virtuális gyülekezet" megoldás (minimális kockázat). 7 nyitott kérdés Endre döntésére.

### 🎨 UX javítások

- **Oblio ellenőrzés** — a 3 felső doboz (Mappa állapot, Formátum-útmutató, Bevezetés-indító) most egy sorban (desktopon), responsive rendezésben (1/2/3 oszlop mobilon/tableten/desktopon).

### 🔧 Adatbázis migrációk

- `materials` + `material_movements` tábla (RLS policy-kkel, helyes `profile_roles` oszlopokkal)

---

## [2026-04-18] — Nyugta finomítás, nyugtatömb rendszer, Anyagraktár fül, stornó és szerkesztés, pénzügyi súgó PDF-ek

<!-- key: 2026-04-18-nyugta-es-storno-kor -->
<!-- category: feature -->
<!-- version: 1.2.0 -->
<!-- targets: lelkészek, egyházmegyei adminok -->

### ✨ Új funkciók

- **Nyugtatömb rendszer** — a kerülettől vett nyugtatömbök teljes életciklus-követése:
  - Wizard új tömb rögzítésére (seria, nyomdai kezdet/vég, vásárlás dátuma, ár)
  - Aktív tömb élő státusza + maradék darabszám + progress bar
  - Automatikus nyomdai + gyülekezeti sorszám-lefoglalás atomikus RPC-vel
  - Éves kimutatás a hivatalos formátumban, nyomtatható (aláírási blokkokkal)
  - "Nincs aktív tömb" esetén friendly wizard visszavezeti a lelkészt a rögzítéshez, majd automatikusan folytatja a nyugta kiállítását
- **Anyagraktár fül a leltár oldalon** — kerületi nyugtatömbök mint gyorsan fogyó készlet, stat kártyákkal
- **Tétel szerkesztés és stornó** — a Kassza és Bank fülön minden bevétel/kiadás mellett:
  - Ceruza ikon: gyors szerkesztés (dátum, összeg, jogcím, iratszám, megjegyzés)
  - ⊘ ikon: stornózás kötelező indoklással — a sor látható marad, de kimarad a számításokból
  - Visszavonható, ha az év még nincs véglegesítve
  - Véglegesített évre a szerver elutasítja a módosítást
- **Részszámadás időszakra nyomtatás** — dátumintervallum választó (I. félév, II. félév, I. negyedév, Év eleje → ma gyorsgombokkal) és külön borító
- **Nyugtatömb kimutatás a Nyomtatási központban** — nyomtatható éves összesítő
- **Pénzügyi Súgó: 3 letölthető PDF referencia** — Pénzügyi gyorsreferencia, Nyugtatömb kezelés, Év végi zárás checklist

### 🎨 UX javítások

- **Nyugta nyomtatvány finomítások**:
  - Romantik reprezentand fordítás (befizetescel.nevro) a magyar alatt — mint az adică/éspedig mintánál
  - Teljes gyülekezeti cím a Sediul / Székhely sorban (cím + város + megye)
  - `formatRoHeaderName` helper ékezet-érzéketlen prefix-ellenőrzéssel → nincs "PAROHIA REFORMATĂ PAROHIA REFORMATA BRATES" duplikáció
  - Nr. és Data egymás mellett a CHITANȚA felirat alatt jobb oldalon (hivatalos forma)
  - Másolat / átvevő példánya szövegek átfedése megszüntetve
  - Régi nyugták újranyomtatásánál fallback: reprezentand_ro és klienesseg_cim visszaolvasása a befizetés + szemely táblákból
- **Számadás véglegesítés gomb** áthelyezve az "Élő számadási kép" dobozba — ott, ahol a figyelem amúgy is van
- **Egységes táblázat dizájn** a Költségvetés és Számadás fülön (Kód | Megnevezés | Érték sorrend, azonos színek)
- **Pénztár nyomtatás gomb átnevezve "Nyomtatási központ"-ra** a pénzügyi hero-ban
- **Bank → személy feltételes** — banki bevételnél a személy csak járulékra (101.01) kötelező, egyéb kategóriákra opcionális (cég/szervezet szabad szöveggel megadható)

### 🔧 Adatbázis migrációk

- `oblio_szamlak.reprezentand_ro` oszlop
- `congregations.varos` és `congregations.megye` oszlopok
- `befizetes.stornozott`, `stornozott_at`, `stornozott_indok`, `stornozott_by` oszlopok + index
- `kiadas.stornozott`, `stornozott_at`, `stornozott_indok`, `stornozott_by` oszlopok + index
- `befizetescel.nevro` szinkron a `szamadasicel.nevro`-ból

---

## [2026-04-17] — Alapelv-érvényesítés, biztonsági javítások, egyházmegyei és kerületi dashboard átalakítás

<!-- key: 2026-04-17-alapelv-ervenyesites -->
<!-- category: security -->
<!-- version: 1.1.0 -->
<!-- targets: mindenki -->

### 🔒 Biztonsági javítások (KRITIKUS)

- **`anon` szerepkör hozzáférés visszavonva** — a bejelentkezetlen felhasználók közvetlenül nem tudtak privát adatokat (befizetések, tagok, anyakönyv) lekérdezni vagy módosítani
- **`authenticated` jogok szigorítva** — a TRUNCATE, TRIGGER, REFERENCES jogok visszavonva (csak SELECT, INSERT, UPDATE, DELETE marad)
- **Szerepkör kiosztás visszaállítva** — csak rendszergazdai vagy egyházkerületi admin oszthat szerepkört (alapelv 7 érvényesítése)

### ✨ Új funkciók

- **Frissítések broadcast rendszer** (`system_broadcasts` tábla) — a rendszergazda üzenetet küldhet minden felhasználónak, egy szerepkörnek, konkrét gyülekezet(ek)nek, egyházmegyéknek vagy kerületnek. Opcionális email-értesítés Resend-en keresztül.
- **Megosztott "Véglegesített dokumentumok" komponens** — az egyházmegyei és kerületi dashboardon egységes megjelenés

### 🎨 UX javítások

- **Egyházmegyei dashboard** — 7 füles, letisztult navigáció: 🏠 Áttekintés, ⛪ Gyülekezetek, 📂 Dokumentumok, 🔔 Kérelmek, 💰 Pénzügy, 🌱 Misszió, 👥 Szerepkörök
- **Kerületi dashboard** — letisztult, alapelv-konform egyoldalas nézet: csak véglegesített dokumentumok láthatók
- **Javítási kérelem értesítés** — a lelkész csengőre kap üzenetet, amikor az egyházmegye elbírálja a kérelmét (dual role esetén is működik)
- **Egyházmegyei tételek elrejtése a gyülekezeti pénzügyi felületen** — a 18 kizárólag egyházmegyei tétel (Központi járulékok, Kongrua, stb.) már nem jelenik meg a gyülekezeti költségvetés/számadás táblákban

### 🔧 Alapelv-érvényesítés

A 8 rögzített alapelv alapján a rendszer ellenőrzése és szigorítása:
1. **Gyülekezeti autonómia** — minden gyülekezet önálló
2. **Gyülekezetek elkülönítése** — egyik nem látja a másikat
3. **Egyházmegye/kerület betekintési korlát** — csak a 4 kötelező évi dokumentum (költségvetés, számadás, vagyonleltár, választók) látható
4. **Rendszergazda csak engedéllyel** — admin_access_requests workflow
5. **Egyházmegye saját pénzügye** — külön (jövőbeli profilváltás alapú modul)
6. **Egyházmegyék elkülönítése** — egyik nem látja a másikat
7. **Szerepkörök kiosztása** — csak admin / egyházkerületi admin
8. **Frissítési értesítések** — broadcast rendszer (ez a release!)

### 🐛 Javítások

- **Költségvetés beküldése** — a `document_submissions` tábla hiányzott az éles DB-ből (nem futott le a migráció) + a GRANT is hiányzott. Javítva, és a véglegesítés + beküldés egy kattintássá egyesítve.
- **Költségvetési javítási kérelem gomb** — az alap véglegesítése után nem jelent meg, csak ha mind a 3 módosítás is véglegesítve volt. Javítva: most alap véglegesítés után is elérhető.
- **Tab megőrzés mentés után** — a `window.location.reload()` helyett `router.refresh()`, így a véglegesítés után az aktív fülön marad a felhasználó.

---

## [2026-04-17] — Frissítések broadcast rendszer, email értesítéssel

<!-- key: 2026-04-17-broadcast-rendszer -->
<!-- category: feature -->
<!-- version: 1.2.0 -->
<!-- targets: admin, rendszergazda -->

### ✨ Új funkciók

- **Frissítések fül az admin oldalon** — rendszer-szintű üzenetek küldése lelkipásztoroknak, egyházmegyei vezetőknek, kerületnek, vagy konkrét gyülekezeteknek / egyházmegyéknek
- **Automatikus changelog integráció** — a `docs/CHANGELOG.md` fejlesztési bejegyzései egy kattintással közzétehetők a címzetteknek. A Claude folyamatosan dokumentálja az elvégzett munkát.
- **Email értesítés** — opcionális email kézbesítés Resend szolgáltatón keresztül (EU régió, 3000 email/hó ingyenes). Szép HTML sablon a rendszer színeivel.
- **Archívum** — minden broadcast dokumentálva: ki, mikor, kinek, hány címzett, email státusz
- **Célzás granularitása** — mindenki / szerepkör / konkrét gyülekezet(ek) / egyházmegye / kerület

### 🔧 Implementáció

- Új tábla: `public.system_broadcasts` — RLS-védett, csak admin/kerületi admin fér hozzá
- Csengő integráció — a meglévő `ertesitesek` táblán keresztül
- Opcionális hivatkozás minden üzenethez → "Részletek" gomb a kézbesítésben
- 5 broadcast típus: info, success, warning, danger, release (a release a CHANGELOG bejegyzéseknél)

### ⚙️ Beállítás szükséges (Endre)

1. `npm install resend` — a csomag hozzáadva a `package.json`-hez
2. `RESEND_API_KEY` env változó (a Resend dashboard-ról)
3. `RESEND_FROM` env változó, pl. `"Kartotéka <noreply@kartoteka.ro>"`
4. Domain beállítás a Resend-ben (DKIM, SPF)

Email beállítás nélkül is működik a broadcast — csak a csengőre megy, és `email_error` mezőbe kerül a hibaüzenet (az adminnál látható).

---

## [2026-04-17] — Profilváltási rendszer alapja (Fázis 1)

<!-- key: 2026-04-17-profile-roles-fazis-1 -->
<!-- category: feature -->
<!-- version: 1.3.0-alpha.1 -->
<!-- targets: admin, rendszergazda -->

### ✨ Új funkció (belső) — Fázis 1/10

A **profilváltási rendszer** alapja elkészült. A felhasználó a jövőben egy header kattintással válthat például a gyülekezeti lelkészi kontextus és az egyházmegyei admin kontextus között.

### 🗄️ Új tábla: `profile_roles`

- Multi-role hozzárendelés — egy user több szerepben lehet
- 4 hatókör (scope): `system`, `district`, `diocese`, `congregation`
- 8 szerep: `admin`, `egyhazkeruleti_admin`, `egyhazmegyei_admin`, `esperes`, `egyhazmegyei_szamvevo`, `lelkesz`, `konyvelo`, `custom`
- **Custom** szerep: szabadon választható név (`custom_label`) — pl. "Titkárnő", "Segédlelkész", "Pénztáros"
- **Rugalmas permissions** (JSONB object): modulonként action szintű engedélyek

### 🔐 Permissions rendszer

- 12 modul (pénzügy, tagnyilvántartás, anyakönyv, …) × 6 action (olvasás, szerkesztés, törlés, véglegesítés, export, import)
- Szerepkör-sablonok minden standard szerephez (alapértelmezett permissions)
- Custom szerepnél szabadon x-elhető, melyik modul + action engedélyezett

### 📊 Adatmigráció

A meglévő `profiles.role` rekordok automatikusan létrehoznak egy `profile_roles` sort a megfelelő scope-ban. Backward kompatibilitás biztosítva — a jelenlegi kód változatlanul működik.

### 🔮 Következő lépések (Fázis 2-10)

- **Fázis 2**: `getEffectiveAccessContext` bővítés — aktív kontextus feloldás
- **Fázis 3**: Profile switcher UI a header-ben + switch-context API
- **Fázis 4**: JWT custom claim integráció (Supabase Auth hook)
- **Fázis 5**: Sidebar navigáció az aktív kontextus szerint
- **Fázis 6**: Admin szerepkör-kiosztó UI (sablonokkal + custom x-elés)
- **Fázis 7**: Permissions érvényesítés minden server actionön és route-on
- **Fázis 8-10**: RLS policy-k átírása, migráció befejezése, regresszió tesztelés

---

## [2026-04-18] — Profilváltási rendszer (Fázis 3-4 + 7 MVP)

<!-- key: 2026-04-18-profile-roles-switcher -->
<!-- category: feature -->
<!-- version: 1.3.0 -->
<!-- targets: mindenki, aki több szerepben dolgozik -->

### ✨ Új funkció: Profilváltás

Ha egy felhasználónak több szerepe van (pl. gyülekezeti lelkész + egyházmegyei admin),
a fejléc avatarára kattintva egy gombbal válthat közöttük. Minden szerep más kezdőoldalra irányít
(gyülekezet → `/dashboard`, egyházmegye → `/dashboard-egyhazmegye`, kerület → `/dashboard-kerulet`).

### ✨ Admin felület: Szerepkörök kiosztása

Az adminisztrátori felületen új **Szerepkörök** fül — csak admin és egyházkerületi admin számára.
Itt rendelhetők ki új szerepek bárkinek:

- **Standard szerepek**: lelkész, könyvelő, esperes, egyházmegyei admin/számvevő, egyházkerületi admin
- **Egyedi szerep** (pl. "Titkárnő", "Pénztáros", "Segédlelkész") — szabadon választható névvel

A gyülekezeti scope-os szerep-kiosztás (NEM lelkész) **lelkészi jóváhagyást** kér automatikusan
(alapelv: gyülekezeti autonómia).

### 🔧 Technika

- Új táblában (`profile_roles`) multi-role hozzárendelés
- Cookie-alapú aktív kontextus (`kartoteka_active_profile_role`)
- Backward kompatibilitás: a meglévő `profiles.role` marad elsődleges szerep
- A permissions finomhangolása (x-elhető UI) következő iterációban

---

## [2026-04-18] — Kassza és bank UX javítások

<!-- key: 2026-04-18-cashbook-bank-ux -->
<!-- category: improvement -->
<!-- targets: lelkészek, könyvelők -->

### 🎨 UX javítások

- **Nyugta (chitanță) UI egyszerűsítve a kasszaoldalon**:
  - A fölösleges "Új nyugta kiállítás" globális gomb **eltávolítva** — a bevétel rögzítéséből automatikusan jön a nyugta
  - A "Nyugta nyomtatási központ" doboz az oldal aljáról **eltávolítva**
  - A sorok végén egységes nyomtató ikon: zöld (már kiállított) vagy halvány (még nincs) — egy kattintás, egyértelmű
- **Havi csoportosítás a kassza és bank fülön**:
  - Minden hónap saját fejléccel, bevétel/kiadás összesítővel
  - A tranzakciók fülhöz hasonló áttekinthetőség
  - Végén éves összesítő kártya

---

## [2026-04-18] — Nyugta automatizálás, költségvetés csoport szumma, profil szerepkörök

<!-- key: 2026-04-18-penzugy-javitasok -->
<!-- category: bugfix -->
<!-- targets: lelkészek, könyvelők -->

### 🐛 Javítások

- **Nyugta (chitanță) automatikus kiállítása**: a kassza fülön a halvány nyomtató ikonra kattintva már NEM nyílik meg kiállítási dialog — a rendszer automatikusan létrehozza a nyugtát a befizetés adataiból és azonnal elindítja a nyomtatást. Egy kattintás, kész.
- **Költségvetés csoport-szumma**: az összevont sorok (pl. "Egyházi tevékenységből származó bevételek") most helyesen mutatják az alcellák összegét — nem 0,00-t.

### ✨ Fejlesztés — Profil dialog

- Új **"Szerepköreim az egyházi nyilvántartó rendszerben"** szekció az Áttekintés fülön
- A user minden aktív szerepköre hierarchia szerint listázva (rendszergazda → kerületi → egyházmegyei → esperes → számvevő → lelkész → könyvelő → egyedi)
- Scope-specifikus színkódolás és ikonok (🌐 rendszer, 🏛 kerület, 🏢 egyházmegye, ⛪ gyülekezet)
- Gmail-es profil avatar automatikusan megjelenik (Google OAuth-val belépőknél a `user_metadata.avatar_url`)

---

<!-- Új bejegyzések ide, a fenti formátumban, időben visszafelé (legfrissebb felül) -->
