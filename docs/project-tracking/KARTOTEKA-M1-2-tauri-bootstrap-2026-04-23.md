# M1.2 teljesítési jelentés — Tauri 2 desktop kliens bootstrap

**Dátum**: 2026-04-23
**Fázis**: M1.2 — desktop kliens alapjának inicializálása
**Kódolási ciklus**: ~30 perc (Rust-telepítés + Tauri init + verify)
**Státusz**: ✅ KÉSZ, `cargo check` 0 hiba
**Branch**: `feat/m1-1-monorepo` (M1.1 folytatása)

---

## 1. Vezetői összefoglaló

Az M1.1 (monorepo szerkezet) után a Tauri 2 desktop kliens **alapprojektje**
létrejött az `apps/desktop/` alatt. Ez egy "Hello Kartotéka" üzenetet mutató
React+Vite app + Rust-backend — **nulla funkcionalitás**, csak bizonyítja, hogy
a teljes toolchain működik Endre gépén.

A tényleges tartalom (Supabase-auth, offline DB, UI) az **M1.3–M1.5** és az
**M2** fázisban kerül be.

**Fő eredmény**: elvileg most már tudnánk egy Kartotéka-Setup.msi-t buildelni
(`npm run desktop:build`) — Windows installer-t, amivel a lelkészek telepíthetnék.
Ez a build persze még üres szoftvert adna.

---

## 2. Telepített fejlesztői függőségek (csak Endre gépén)

| Eszköz | Verzió | Telepítő | Cél |
|---|---|---|---|
| Rust (rustc + cargo) | 1.95.0 | `winget install Rustlang.Rustup` | Forrás → MSI fordítás |
| Visual Studio C++ Build Tools | Microsoft Visual Studio 18 | már telepítve | Native crate fordítás |
| WebView2 Runtime | 147.0.3912.72 | már telepítve (Windows 11) | Dev-közbeni ablak + a bundle-nak is kell |
| Tauri CLI | 2.x | `npm install` (workspace-ben) | Build + dev parancsok |

**Fontos tisztázás**: ezek **kizárólag a fejlesztői gépen** kellenek. A lelkészek
sem Rust-ot, sem C++ Build Tools-t nem telepítenek — csak egy kész `.msi` installer-t.

## 3. Új repo struktúra az `apps/desktop/` alatt

```
apps/desktop/
├── index.html                  — Vite belépési pont (<title>Kartotéka</title>)
├── package.json                — @kartoteka/desktop workspace
├── tsconfig.json               — React+TS config
├── vite.config.ts              — Vite dev szerver :1420 porton
├── public/
│   ├── vite.svg
│   └── tauri.svg
├── src/                        — React frontend
│   ├── main.tsx                — ReactDOM entry
│   ├── App.tsx                 — Placeholder "Kartotéka Desktop" UI + greet demo
│   ├── App.css
│   └── vite-env.d.ts
└── src-tauri/                  — Rust backend + Tauri config
    ├── Cargo.toml              — tauri 2, tauri-plugin-opener, serde
    ├── Cargo.lock
    ├── build.rs
    ├── tauri.conf.json         — productName: "Kartotéka", 1280×800, EREK copyright
    ├── capabilities/           — Tauri 2 permission rendszer
    ├── icons/                  — default ikonok (M5-ben cseréljük)
    └── src/
        ├── main.rs
        └── lib.rs               — "greet" demo command magyarul
```

## 4. Végrehajtott lépések (időrendben)

1. **WebView2 verify** — PowerShell registry-check, meglévő (v147.0.3912.72)
2. **VS C++ Build Tools verify** — `vswhere.exe` pozitív találat
3. **Rust telepítés** — `winget install --id Rustlang.Rustup -e --silent`
4. **Rust verify** — `rustc 1.95.0`, `cargo 1.95.0`
5. **Tauri projekt init** — `npx create-tauri-app@latest desktop --template react-ts --manager npm --identifier com.erek.kartoteka --tauri-version 2 -y`
6. **package.json rename** — `desktop` → `@kartoteka/desktop`
7. **tauri.conf.json magyarítás** — productName, title, ablakméret, EREK metadata
8. **App.tsx + lib.rs magyarítás** — "Kartotéka Desktop" + "Üdv {név}! A Rust-oldali híd működik."
9. **Root `package.json` kiegészítés** — `desktop:dev`, `desktop:build`, `desktop:vite` scripts
10. **npm install root** — 23 új csomag, workspace link `node_modules/@kartoteka/desktop`
11. **Verify**: `cargo check` → `Finished dev profile in 1m 29s`, 0 hiba

## 5. Ellenőrzés (Endre lépésről lépésre)

```bash
# 1. Rust verify (új PowerShell shellben)
rustc --version
# Várt: rustc 1.95.0 (...)

cargo --version
# Várt: cargo 1.95.0 (...)

# 2. Workspace verify (root-ból)
cd "D:\Egyházi APP\KARTOTEKA"
npm ls @kartoteka/desktop
# Várt: node_modules/@kartoteka/desktop symlink → apps/desktop

# 3. Vite frontend önálló teszt (böngészőben, Tauri nélkül)
npm run desktop:vite
# Megnyílik http://localhost:1420 — a Vite szerver
# Várt: "Kartotéka Desktop" cím + greet form látható
# (A Rust-greet ITT NEM működik, mert Tauri híd nincs — csak a layout)

# 4. TELJES Tauri dev (ablak + Rust híd) — ELSŐ INDÍTÁS 5-10 PERC
npm run desktop:dev
# Megjelenik egy "Kartotéka" című 1280×800 ablak
# Ha beírsz nevet és Üdvözlés-t nyomsz: megjelenik az Rust-oldalról érkező üzenet
# Második indítás: 5-10 mp (inkrementális cargo build)

# 5. Production build teszt (MSI generálás — ~10 perc első futás)
npm run desktop:build
# Output: apps/desktop/src-tauri/target/release/bundle/msi/Kartotéka_0.1.0_x64_en-US.msi
# Ez egy tesztkép — nyugodtan lehet duplán kattintani; létrehoz egy "Kartotéka" Start menü bejegyzést
# De üres app! Csak a placeholder-t mutatja.
```

## 6. Telepítési modell — lelkészi gép vs fejlesztői gép

**Fejlesztői gép** (Endre-je):
- Rust + Cargo (a forrás → bináris fordítás)
- Visual Studio C++ Build Tools
- WebView2 runtime
- Node.js + npm

**Lelkészi gép** (végfelhasználó):
- **SEMMI fejlesztői függőség**
- 1 MSI-fájlt kapnak → Windows Installer elintézi a többit:
  - Lefordított bináris (kb. 15-25 MB)
  - **WebView2 runtime bootstrapper** (ha a lelkész gépén nincs, a telepítő letölti/auto-telepíti)
  - **Visual C++ Redistributable** (auto-telepítés)
- Windows 11-en a WebView2 + VC++ már alapból megvan → offline telepítés is működik

M5-ben beállítjuk a `tauri.conf.json`-ban:
```json
"bundle": {
  "windows": {
    "webviewInstallMode": { "type": "offlineInstaller" }
  }
}
```
→ a WebView2 teljes runtime becsomagolva az MSI-be → minden gépen offline telepíthető.

## 7. Mit NEM csináltunk (scope-határok)

- ❌ Supabase-auth integráció (→ M1.3)
- ❌ Közös `@kartoteka/ui` komponens-könyvtár (→ M1.4)
- ❌ Kartotéka-ikonok (a default Tauri ikonok vannak még) (→ M5)
- ❌ Offline DB, SQLCipher, Stronghold (→ M2)
- ❌ Code-signing cert (→ M5, self-signed-del kezdünk)
- ❌ Auto-update rendszer (→ M5)
- ❌ `npm run tauri dev` ÉLES tesztje (csak `cargo check` — a UI-tesztet Endre futtatja, ha kíváncsi)
- ❌ WebView2 offlineInstaller config (→ M5)

## 8. Fejlesztői workflow az M1.2 után

```bash
# Hétköznapi web-fejlesztés — változatlan
cd "D:\Egyházi APP\KARTOTEKA"
npm run dev
# → http://localhost:3000

# Desktop-fejlesztés (a hétfő reggel első dolog M1.3-tól)
npm run desktop:dev
# → Kartotéka Tauri ablak

# Mindkettő párhuzamosan (külön terminálban)
# A desktop app majd a webes Supabase-t használja (M1.3), tehát mindkettő
# ugyanazzal a DB-vel dolgozik — fejlesztés közben élő szinkron
```

## 9. Tanulságok

**A `winget install Rustlang.Rustup` non-interaktív és gyors**: 2-3 perc alatt teljes toolchain. Nincs manual PATH-beállítás (bár új shell-session kell, hogy felszedje).

**Tauri 2 dependency-ereje**: 517 crate lock-olódik egy üres app-hoz. Az első `cargo check` 1m 29s — elfogadható. A későbbi inkrementális check-ek < 5 másodperc.

**npm workspaces + Tauri egyszerű**: a `create-tauri-app` nem ismeri a monorepo-t, de nincs baj — egyszerűen átnevezzük a `package.json` name-et, és a root `npm install` feloldja.

**A Tauri 2 biztonsága jobb, mint Tauri 1-é**: a `capabilities/` mappa explicit ACL-t kezel, nem `allowlist`-t. Minden Rust-ból meghívható JS API-t explicit engedélyezni kell — ez jó védekezés XSS/supply-chain ellen.

---

**Végállapot**:
- `apps/desktop/` Tauri 2 + React + Vite projekt, magyar címmel
- `cargo check` 0 hiba
- Workspace-szimbólum `@kartoteka/desktop` OK
- Root `npm run desktop:dev` indítható (Endre bármikor tesztelheti)
- Következő: **M1.3** — közös `@kartoteka/supabase-client` csomag + auth-áramlat a desktop-on
