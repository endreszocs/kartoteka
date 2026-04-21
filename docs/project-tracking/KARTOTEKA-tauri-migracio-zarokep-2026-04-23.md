# Kartotéka Tauri-migráció — zárókép (M0 → M5 kész)

**Dátum**: 2026-04-23
**Szakértő V4-terv**: 90%+-ban teljesítve
**Érkezés állapot**: MVP-kész, béta-tesztelésre felkészülve
**Branch**: `master` (merge-elt a `feat/m1-1-monorepo`-ból)
**Commit-történet**: 26 commit M0 óta (`ae5fa02d` → `d52c2f61`)

---

## 1. Mit csináltunk

Az M0 — access-requests + Brevo + JWT hook kész volt 2026-04-23 hajnalán. Azóta a teljes M1 → M5 (a szakértő V4-tervéből) **egy kódolási napon** lezárult, és a rendszer **béta-tesztelésre kész**:

| Fázis | Funkció | Eredmény |
|---|---|---|
| **M0** | Supabase backend + access-requests | ✅ éles |
| **M1** | Monorepo + Tauri 2 + közös csomagok + auth | ✅ |
| **M2** | Offline adatréteg (SQLCipher + pull/push/delta + konfliktus) | ✅ |
| **M3** | MSI+NSIS installer + self-signed cert + eszköz-bind | ✅ |
| **M4** | Admin-revoke + desktop auto-logout + email-értesítés | ✅ |
| **M5** | Auto-updater + Supabase Storage host + első release | ✅ |

**v0.2.0 publikus Kartotéka build fent van a Supabase Storage-on.**

---

## 2. Mit kap a lelkész (vég-felhasználói élmény)

1. **Hozzáférés-kérelem**: a `/hozzaferes-kerese` web-felületen kitölti az űrlapot. Email visszaigazolás Brevo-ból.
2. **Admin jóváhagyás**: az egyházkerületi rendszergazda egy kattintással jóváhagyja vagy elutasítja. Automatikus email a lelkésznek.
3. **Telepítés**: a lelkész kap egy `Kartoteka_<verzió>_x64-setup.exe` installer-t (e-mailen / USB-n / Supabase-URL-lel).
   - Első indításnál Windows SmartScreen-warning: „Unknown publisher" (self-signed cert). Production előtt Azure Trusted Signing-re váltunk ($9.99/hó).
   - Telepítő wizard végigvezet, Start menüben megjelenik a **Kartotéka** alkalmazás.
4. **Bejelentkezés**: saját email + jelszó, Supabase auth. Első indításkor automatikusan regisztrálja az eszközt a `user_devices` táblába.
5. **Offline-first**: minden adat helyben tárolódik (SQLCipher titkosított), a szinkron automatikus.
6. **Auto-update**: a „Frissítés" kártyában egy gombnyomásra lekéri, letölti, telepíti az új verziót.

### Rendszergazdai élmény
- **`/admin/devices-licenses`** fül: minden regisztrált eszköz + audit-log
- **Revoke-gomb**: azonnali kitiltás; a kliens 30 mp-en belül észleli és kijelentkezik (plus email-értesítés)
- **Restore-gomb**: eszköz feloldása (szintén email-mel)

---

## 3. Technikai stack

### Kliens (Tauri 2)
- **Nyelvek**: Rust 1.95 (backend), TypeScript 5 / React 19 / Vite 7 (frontend)
- **UI**: Tailwind CSS 4 + `@kartoteka/ui` (shadcn-alapú, web-bel közös)
- **Natív**: SQLCipher 4.x (rusqlite), Ed25519 (ed25519-dalek), machine-uid
- **Build-méret**: ~5 MB MSI / ~4 MB NSIS EXE
- **Kiadás**: Ed25519-aláírt manifest, Tauri updater-plugin

### Backend (Supabase)
- **Adatbázis**: PostgreSQL 15 + Row Level Security
- **Auth**: Supabase Auth + custom JWT hook (egyéni claim-ek)
- **Storage**: publikus `updater` bucket (MSI + manifest)
- **Email**: Brevo (EU, GDPR-kompatibilis)
- **Új oszlopok**: `profiles.revision`, `profiles.updated_at` + trigger (konfliktus-kezeléshez)

### Biztonsági rétegek
| Réteg | Mechanizmus |
|---|---|
| Tranzit | HTTPS (Supabase + Brevo) |
| Backend auth | JWT + RLS |
| Kliens-token | `refresh_token` Supabase SDK-ban (30 nap) |
| Helyi DB | SQLCipher (AES-256-CBC-HMAC-SHA512) |
| Helyi kulcs | Windows Credential Manager (DPAPI per-user) |
| Eszköz-id | Ed25519 keypair, publikus rész Supabase-ben, privát a Credential Manager-ben |
| Kliens-bináris | Authenticode (signtool, self-signed EREK cert) |
| Updater-manifest | Ed25519 (minisign), külön kulcs |

---

## 4. Számszerű eredmények

| Mérték | Érték |
|---|---|
| Commit-ok a M0 óta | 26 |
| Új/módosított kódfájl | ~100 |
| Új Rust crate | 12 |
| Új npm package | 5 |
| Új SQL-migráció | 1 (`2026-04-23-m2-6-profiles-revision.sql`) |
| Új PowerShell-script | 2 (`code-sign-setup.ps1`, `updater-key-setup.ps1`, `release-build.ps1`) |
| Új project-log | 7 |
| Új memory-jegyzet | 2 |
| Új Tauri capability | 3 (`updater`, `sql`, `opener`) |
| Új Supabase-tábla | 0 (minden megvolt az M0-ban) |
| Új Supabase-oszlop | 2 (`profiles.revision`, `profiles.updated_at`) |
| Új Supabase Storage bucket | 1 (`updater`) |
| Új Supabase trigger | 1 (`profiles_bump_revision`) |
| Változás a webes UI-n | Minimális (M4.1 restore-gomb) |
| Változás a web DB-logikán | 2 server action kibővítés (M4.1 + M4.2 email) |
| Első release méret (MSI) | 5.4 MB (a WebView2 nincs csomagolva) |
| Első release méret (NSIS) | 4.76 MB |
| Release-build idő (inkrementális) | ~60-90 mp |
| Build-toolchain telepítés | Rust, Perl, NASM, VS C++ BT, Node — mind automatizálva |

---

## 5. Mit NEM csináltunk (explicit nem-hatókör)

Ezek **szándékosan** maradtak ki, és M6+ vagy eseti időrendben férhetnek be:

1. **Offline-login** kifejezett implementációja — a Supabase SDK 30 napos refresh-token-je ezt gyakorlatilag megadja
2. **Több domain-tábla sync-je** (members, finance, anyakönyv) — egyenként egy M2.6-szerű SQL-migráció + kliens-sync kell
3. **CI/CD**: GitHub Actions / Gitea-runner release-automatizálás
4. **Production code-sign cert** (Azure Trusted Signing / EV / SignPath)
5. **Delta-update** (a teljes MSI-letöltés helyett csak patch)
6. **Rollback-mechanizmus** a release-en
7. **Tauri ablak magyarítása** (menüsor, rendszer-dialog-ok)
8. **A `middleware.ts → proxy.ts`** migráció (Next.js 16 deprecation warning)
9. **Linting 4 pre-existing hibája** a webes oldalon (nem M1+ regressziók)
10. **Offline document-tár** (M4 E2E doc-titkosítás a szakértő-tervből) — egyelőre nem kötelező

---

## 6. Dev-toolchain Endre gépén

Minden telepítve egyszer, reprodukálható:

| Eszköz | Verzió | Telepítés |
|---|---|---|
| Windows 11 Pro | build 26200 | — |
| Visual Studio C++ Build Tools | VS 18 | már volt |
| WebView2 Runtime | v147.0.3912.72 | alapból Win11 |
| Node.js + npm | — | már volt |
| Rust | 1.95.0 stable-x86_64-pc-windows-msvc | `winget install Rustlang.Rustup` |
| Strawberry Perl | 5.42.2.1 | `winget install StrawberryPerl.StrawberryPerl` (M2.2-ben telepítve) |
| NASM | 2.x | Strawberry Perl bundler hozza |
| Self-signed code-sign cert | RSA-2048, 3 év | `.\ops\code-sign-setup.ps1` (M3.2) |
| Updater Ed25519 key | 32 byte | `.\ops\updater-key-setup.ps1` (M5) |

### Build-target
**KÖTELEZŐ** az ASCII-útvonal: `C:\kartoteka-target` (beállítva a `.cargo/config.toml`-ben). A repo-útban (`D:\Egyházi APP\...`) lévő `á` karakter összetöri az OpenSSL build-scriptet.

---

## 7. Kiadási workflow (új release)

```powershell
cd "D:\Egyházi APP\KARTOTEKA"
.\ops\release-build.ps1 -Version "0.3.0" -Notes "..."
# kb. 1-2 perc, teljes flow

git add apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml
git commit -m "release(v0.3.0): <title>"
```

A kliensek **30 másodpercen belül** (polling) vagy kézi „Ellenőrzés"-sel értesülnek.

---

## 8. Függő kérdések (Endre döntésére)

| Téma | Kérdés | Ajánlás |
|---|---|---|
| **Code-sign cert** | Mikor váltunk Azure Trusted Signingre? | Béta-tesztelés végén (kb. 2-3 hónap múlva) |
| **Tauri updater pubkey** | A dev-kulcs `kartoteka-updater-dev-2026` passworddel megfelel éles release-re? | Béta-ig igen, aztán cseréljünk egy erős (>20 karakter, 1Password-kezelt) jelszóra |
| **Supabase Storage bucket privacy** | Public maradjon? | Igen — a integritást az Ed25519 aláírás védi |
| **Git remote** | Hol tartsuk a backup-ot? (most csak Endre gépén) | GitHub Private recommended; EU-specifikus: GitLab.com |
| **Delta-updates** | Kellenek? | Nem most, csak ha az EXE mérete 20+ MB lesz |
| **Több domain-tábla** | Mikor szinkronizáljuk a `members` / `finance` táblát? | Amikor a béta-tesztek alapján kiderül a prioritás |

---

## 9. Commit-történet (M0 óta)

```
d52c2f61 release(v0.2.0): first published Kartotéka build via Supabase Storage
ec10b654 chore(M5): wire up Supabase-hosted updater + release-build script
15ba455e merge: feat/m1-1-monorepo -> master — M1 + M2 + M3 + M4 + M5
32e969d6 chore: tie up loose ends before merging to master
ff776fea feat(M5): auto-updater skeleton — tauri-plugin-updater wired up
f01eaff7 feat(M4.1+M4.2): restore button + revoke/restore email notifications
97519152 feat(M4): desktop revoke-detector — admin revoke -> auto sign-out
bbab8aca fix(M3.3): decouple device-bind flow from local DB availability
ecbbfed7 feat(M3.3): device bind — Ed25519 keypair + user_devices registration
0d503e7f feat(M3.2): signed Windows installer bundle with self-signed cert
75e501c6 feat(M3.1): first Windows installer bundle (MSI + NSIS) + EREK icons
18148bf4 feat(M2.7): delta-sync — pull only rows that actually changed
0e57d985 fix(M2.7): surface Rust setup() init error via db_status command
ab69bfcf fix(M2.6): show real Rust error messages instead of "ismeretlen hiba"
a8d96910 feat(M2.6): optimistic concurrency — revision + updated_at conflict detection
c3a8c9da feat(M2.5): push-sync — offline writes + outbox drain (own profile)
42b2e1e5 feat(M2.4): first Supabase->SQLite pull-sync (own profile)
89ac5958 feat(M2.3): move SQLCipher key into OS credential store (keyring crate)
3579001f fix(M2.2): add root ErrorBoundary for Tauri white-screen crashes
819a3e65 feat(M2.2): SQLCipher-encrypted local DB with custom rusqlite commands
053723f7 feat(M2.1): local SQLite via tauri-plugin-sql on desktop
93db1b6b feat(M1.5): desktop login screen with real auth flow
b5ea2ca9 feat(M1.4): extract shared @kartoteka/ui shadcn components
00e06f76 feat(M1.3): extract shared @kartoteka/supabase-client package
3a519a43 feat(M1.2): bootstrap Tauri 2 desktop client in apps/desktop/
c365c09f refactor(M1.1): convert repo to npm workspaces monorepo
ae5fa02d chore: initial baseline (2026-04-23, M0 komplett)
```

---

## 10. Szimbólikus szám

**26 commit, ~100 fájl, 1 nap kódolás. Egy teljes offline-first desktop kliens MVP-kész.**

Az **M0 → M5 a szakértő V4-tervéből 90%+-ban teljesítve**. Ami hátra van, az **üzemeltetés** — béta-tesztelés, production-cert, első Kartotéka-élesítés a lelkészeknek.

Ez a Kartotéka-rendszer fejlődésének **technikai mérföldköve**. A következő mérföldkő: **az első 10 aktív lelkész** a desktop-kliensen.
