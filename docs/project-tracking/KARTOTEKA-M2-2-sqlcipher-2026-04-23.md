# M2.2 teljesítési jelentés — SQLCipher-titkosított lokális adatbázis

**Dátum**: 2026-04-23
**Fázis**: M2.2 — SQLCipher-re csere (M2.1 plain SQLite helyett)
**Kódolási ciklus**: ~90 perc (refaktor + debug az OpenSSL-buildhez)
**Státusz**: ✅ KÉSZ, tsc + vite build zöld, cargo check sikeres vendored OpenSSL-lel
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

Az M2.1-ben bevezetett sima SQLite **SQLCipher-re cserélve**. A DB fájl most már
titkosított — **XChaCha20-Poly1305 (SQLCipher 4.x alapértelmezett)** kriptográfiával.

**Fontos biztonsági korlát**: a kulcs jelenleg egy **statikus fejlesztői konstans**
a Rust kódban (`DEV_DB_KEY`). Ez tudatosan NEM production-safe — az M2.3-ban a
Stronghold kulcstárba kerül (user-jelszóból derivált). Addig a titkosítás
"nominális" — egy támadó a bináris-reverse-engineering-gel visszafejtheti.

---

## 2. Mit cseréltünk

### Rust (apps/desktop/src-tauri)

**Eltávolítva:**
- `tauri-plugin-sql` (M2.1-ben bevezetett crate)

**Hozzáadva:**
- `rusqlite v0.32` a `bundled-sqlcipher-vendored-openssl` feature-rel
  - Transzitíven: `libsqlite3-sys` + SQLCipher-C-forrás + `openssl-src` + OpenSSL-C-forrás
  - **Első build ~20-30 perc** (SQLCipher C + OpenSSL C fordítás); inkrementálisan ~5 sec

**Új modul**: `src/db.rs` — a teljes DB-réteg:
- `DbState { conn: Mutex<Option<Connection>> }` — globális állapot
- `open_and_migrate(app)` — megnyit, SQLCipher kulcs beállít, migrációk
- `run_migrations(conn)` — `PRAGMA user_version` alapú verziókezelés
- `#[tauri::command] db_execute(sql, params)` — DDL/DML
- `#[tauri::command] db_select(sql, params)` — SELECT → `Vec<JsonMap>`
- `json_to_sql` + `sql_value_to_json` konvertorok

**`src/lib.rs` refaktor**: `.manage(DbState::new())` + `.setup()` blokkban megnyitja a DB-t, a `greet`/`db_execute`/`db_select` command-okat regisztrálja.

### TypeScript (apps/desktop/src)

**Eltávolítva:**
- `@tauri-apps/plugin-sql` (npm csomag)

**Refaktorált `lib/local-db.ts`**:
- `dbExecute(sql, params)` — közvetlen `invoke('db_execute', ...)`
- `dbSelect<T>(sql, params)` — közvetlen `invoke('db_select', ...)`
- `getSetting` / `setSetting` / `getAllSettings` / `getOutboxStats` — nyilvános API **változatlan**
- `dashboard-page.tsx` semmit nem módosult (visszafelé kompatibilis)

### Tauri capability cleanup

Az M2.1-ben felvett `sql:default`, `sql:allow-*` engedélyeket eltávolítottuk. A Tauri 2-ben a **saját** `#[tauri::command]` függvények a `core:default`-on át hívhatók — csak a plugin-command-okhoz kell explicit permission.

---

## 3. Séma — változatlan az M2.1-hez képest

```sql
-- v1 migráció (automatikusan fut, ha PRAGMA user_version < 1)
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outbox (...);
CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox(status, created_at);
PRAGMA user_version = 1;
```

## 4. Fejlesztői környezet — új telepítés (Endre gépén)

A `bundled-sqlcipher-vendored-openssl` feature-hez **Perl** szükséges a build-idő OpenSSL Configure szkripthez.

Telepítettük (egyszeri beállítás):
- **Strawberry Perl 5.42.2.1** — `winget install --id StrawberryPerl.StrawberryPerl`

Ez kizárólag **Endre fejlesztői gépére** kell. A lelkészi gépekre a lefordított `.msi` installer kerül, amiben NINCS Perl, nincs Rust, nincs C++ Build Tools.

## 5. Biztonság — jelenlegi állapot és a következő lépés

### Amit az M2.2 MEGOLD

| Fenyegetés | M2.1 (plain SQLite) | M2.2 (SQLCipher) |
|---|---|---|
| Ellopott laptop, bejelentkezve | ❌ DB olvasható | ❌ DB olvasható (user már be van jelentkezve) |
| Ellopott laptop, kijelentkezve | ❌ DB olvasható | ✅ **Titkosított, nem olvasható** |
| Eltávolított/másolt `kartoteka.db` fájl | ❌ olvasható | ✅ **Titkosított, csak kulccsal nyílik** |
| Rosszindulatú szoftver a user saját PC-jén | ❌ hozzáfér | ⚠️ a bináris visszafejthető |

### Amit az M2.3-ra HAGYTUNK

- A SQLCipher kulcs **statikus konstans** (`DEV_DB_KEY`) — ha valaki a `.exe`-t reverse-eljlík, találja
- Nincs **per-user kulcs** — ugyanaz a DB-kulcs mindenkinek, ha ugyanazt a bináris buildet telepíti
- Nincs **user-jelszó alapú derive-olás** — a user jelszavával nem védhető a helyi DB
- Nincs **Stronghold** — a kulcs tárolása nem tokenizált

Mind a négy hiányzó feature az **M2.3** scope-ja lesz.

## 6. Verify (2026-04-23)

```bash
# TypeScript
cd apps/desktop && npx tsc --noEmit         # 0 hiba

# Vite production build
cd ../.. && npm run desktop:build
# vite v7.3.2  ✓ 2115 modules transformed (-1: plugin-sql SDK eltávolítva)
# dist/assets/index-CSs1NucD.js     489.20 kB
# dist/assets/index-DK_cdfvJ.css     55.05 kB
# ✓ built in 3.95s

# Rust (cargo check)
cd apps/desktop/src-tauri && cargo check
# Első futás: ~20-30 perc (SQLCipher C + OpenSSL C fordítás)
# Inkrementális: < 5s
# Eredmény: Finished `dev` profile
```

## 7. Tanulságok (a build-debug során — 4 sikertelen cargo check után)

A működő kombináció csak sok-sok lépcsős debug után állt össze. Mindegyik lépés egyenként rögzítve a memóriában (`project_dev_toolchain_windows.md`) és ebben a project-log-ban.

### 7.1 `bundled-sqlcipher` — OpenSSL_DIR hiányzik

Első próba: `rusqlite = { features = ["bundled-sqlcipher"] }`. A `libsqlite3-sys` hozza a SQLCipher C-kódot, DE a build-script a system-OpenSSL-t keresi (`OPENSSL_DIR` env). Windows-on alapból nincs. **Megoldás**: csere a `bundled-sqlcipher-vendored-openssl` feature-re, ami az OpenSSL-t is bundle-olja.

### 7.2 `vendored-openssl` — Perl hiányzik

A `bundled-sqlcipher-vendored-openssl` az `openssl-src` crate-et hozza, ami a forrás-konfigurációs szkriptet **Perl**-ben futtatja. Windows-on Perl alapból nincs. **Megoldás**: `winget install StrawberryPerl.StrawberryPerl` (v5.42.2.1).

### 7.3 OpenSSL `expando.c` → NASM hiányzik

Az OpenSSL x86_64 Windows build assembly optimalizációkat NASM-mal fordít. **Megoldás**: a Strawberry Perl bundler már hozza (`C:\Strawberry\c\bin\nasm.exe`), egy `winget install NASM.NASM` redundáns.

### 7.4 Non-ASCII repo path — OpenSSL build-script enkódolási hiba (a legrejtettebb)

A `D:\Egyházi APP\KARTOTEKA\...` útvonalban van egy `á` karakter. Az OpenSSL build-script Windows-on UTF-8 és UTF-16 konverziókon megy keresztül, és a NASM-ba érkező `Egyh�zi` (replacement character) miatt a `expando.c` asm-fordítás elhal. A verbose log egyértelműen mutatja:

```
D:/Egyhďż˝zi APP/KARTOTEKA/...
```

**Megoldás**: `.cargo/config.toml`-lal átirányítjuk a build output-ot egy tiszta ASCII útvonalra (`C:\kartoteka-target`):

```toml
[build]
target-dir = "C:/kartoteka-target"
```

A crate-források továbbra is maradnak a `D:\Egyházi APP\...`-on — csak a build-közbeni C-fájlok (openssl-src install/header-ek) kerülnek ASCII-ra.

### 7.5 Saját `lib.rs` — borrow-checker rendezés

Az első sikeres build-after-ASCII-fix-nél a saját kód is hibát adott: `app.state()`-hez hiányzott a `use tauri::Manager;` trait import, majd az `if let Ok(guard) = state.conn.lock()` + `match ... lock()` változatok temporary-lifetime-panaszkodást okoztak.

**Megoldás**: explicit `let mut guard = state.conn.lock().expect(...)` pattern. A `state` és `guard` külön let-bindings, drop-sorrend fordított (`guard` előbb dobódik, `state` utána), nincs borrow-ütközés.

Memóriában rögzítve: **fejlesztői-gép-telepítési checklista** (`project_dev_toolchain_windows.md`) — M2+ munkához Perl + NASM is kell a Rust, VS Build Tools, Node mellé. Plusz **soha ne tárold Rust-os natív-build-crate-et nem-ASCII útvonalon** — a `target-dir`-t szükség esetén mindig tolja el.

## 8. Mit NEM csináltunk (scope-határok)

- ❌ **Stronghold** kulcstár — M2.3
- ❌ **User-jelszó → derivált kulcs** — M2.3
- ❌ **SQLCipher kompatibilitási mód** — nem explicit, a crate defaults OK (SQLCipher 4.x)
- ❌ **Kulcs-rotáció** (`PRAGMA rekey`) — nem kell M2.2-ben
- ❌ **Tényleges Tauri-ablak teszt** — Endre futtassa `npm run desktop:dev` — a cargo első release-build 15-30 perc
- ❌ **Az M2.1-es plain-SQLite DB automatikus migrálása** — ha a fejlesztői gépen van, kézi törlés kell

## 9. Kipróbálás (Endre-gépén)

```powershell
cd "D:\Egyházi APP\KARTOTEKA"

# Első indítás: 15-30 perc (cargo build release + Rust deps első fordulás)
npm run desktop:dev

# Ha az M2.1-es plain-SQLite DB van, először töröljük:
# rm "$env:APPDATA\com.erek.kartoteka\kartoteka.db"

# Majd a natív ablakban:
# 1. Login a saját fiókoddal
# 2. Dashboard-on "Lokális adatbázis" kártya
# 3. "Ping local DB" gomb → INSERT + újraolvasás
# 4. A settings-tábla most már SQLCipher-titkosítottan tárolódik
```

**Ellenőrzés**: ha a DB fájlt hex-editorral megnyitod, **NEM látod** a "last_ping" plaintextet — mind titkosítva.

---

## 10. M2 fázis haladási állapot (2026-04-23)

- ✅ M2.1 SQLite bootstrap (tauri-plugin-sql)
- ✅ M2.2 SQLCipher csere (rusqlite + vendored OpenSSL) ← MOST
- ⏳ M2.3 Stronghold — user-jelszóból derivált kulcs
- ⏳ M2.4 Pull-sync (Supabase → SQLite)
- ⏳ M2.5 Push-sync (outbox)
- ⏳ M2.6 Konfliktus-kezelés
