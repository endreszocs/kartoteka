# M2.3 teljesítési jelentés — SQLCipher-kulcs OS-szintű titkos tárolóban

**Dátum**: 2026-04-23
**Fázis**: M2.3 — a statikus DEV_DB_KEY kiváltása Credential Manager-rel
**Kódolási ciklus**: ~20 perc (M2.2 után gyors, mivel nincs új C-build)
**Státusz**: ✅ KÉSZ, tsc + vite + cargo check zöld
**Branch**: `feat/m1-1-monorepo`

---

## 1. Vezetői összefoglaló

Az M2.2-ben a SQLCipher-kulcs **statikus konstans** volt a Rust kódban. Ez
nominális titkosítás volt — a `.exe` reverse-engineering-je kiadta a kulcsot.

Az M2.3 óta a kulcs egy **OS-szintű titkos tárolóban** él:
- **Windows**: Credential Manager (DPAPI — a Windows-user bejelentkezési tokenjével titkosított)
- **macOS**: Keychain (a user-jelszóval védett)
- **Linux**: Secret Service / GNOME Keyring / KWallet

Ezt a `keyring` Rust crate kezeli egységesen. **Pure-Rust** (csak `windows-rs`
bindings Windows-on, `security-framework` macOS-en, `zbus` Linux-on) — **nem
hoz új C-build-függőséget** (nem kell perl/nasm/openssl, mint az M2.2-nél).

---

## 2. Biztonsági modell változása

### M2.2 → M2.3 fenyegetési elemzés

| Forgatókönyv | M2.2 | M2.3 |
|---|---|---|
| Bejelentkezett user + hozzáfér | ❌ olvasható | ❌ olvasható (szándékolt) |
| Kilopott eszköz / kilopott DB fájl | ❌ kulcs a binárisból visszafejthető | ✅ **kulcs nincs a binárisban** |
| Másik Windows-user ugyanazon a gépen | ❌ azonos kulcs mindenkinek | ✅ **DPAPI per-user: nem fér hozzá** |
| Reverse-engineered .exe | ❌ kulcs kiszedhető | ✅ csak a keyring-lookup-logika |

### Amit az M2.3 NEM véd

- **Malware a user-kontextusban root-jogosultsággal**: a user saját Windows-loginján futó rosszindulatú szoftver hozzáfér a Credential Manager-hez. Ez ellen **user-jelszó-alapú derived key** kell (M2.6 scope).
- **User-profil törlés** (Windows újratelepítés / reset): a Credential Manager-entry elvész → a DB soha többé nem nyitható. **Backup/restore** külön feladat (M2.5).
- **Supply-chain támadás**: ha a `keyring` vagy `rand` crate-be malicious kód kerül (pl. compromised crates.io account), az elvezethet a kulcs kilophatásához. Ez **minden** dependens Rust-projektre igaz, nem M2-specifikus.

## 3. Technikai implementáció

### 3.1 Új Rust crate-ek (`Cargo.toml`)

```toml
keyring = "3"   # OS-szintű titkos tároló, cross-platform
rand = "0.8"    # Kriptográfiailag biztonságos RNG (OsRng-n át)
hex = "0.4"     # 32 byte → 64 hex-karakter konverzió
```

Mind **pure-Rust**. `cargo check` az M2.2 után **8 mp** — semmi új C-fordulás.

### 3.2 Kulcs-bootstrap (`db.rs`)

```rust
const KEYRING_SERVICE: &str = "kartoteka-desktop";
const KEYRING_USER: &str = "sqlcipher-db-key";

fn load_or_create_db_key() -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;

    match entry.get_password() {
        Ok(existing) => Ok(existing),
        Err(keyring::Error::NoEntry) => {
            // Első indítás — generáljunk egy új 256-bit kulcsot
            let mut buf = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut buf);
            let hex_key = hex::encode(buf);
            entry.set_password(&hex_key)?;
            Ok(hex_key)
        }
        Err(e) => Err(format!("Keyring olvasás sikertelen: {e}")),
    }
}
```

- **32 byte = 256 bit** — ajánlott SQLCipher raw-key-méret
- **hex-enkódolva** — 64 karakteres ASCII string, amit a Credential Manager-be tehetünk
- **Első indulás**: a `NoEntry` error-on generál + elment
- **Subsequent**: olvassa a meglévő értéket

### 3.3 SQLCipher raw-key PRAGMA

```rust
let raw_key_pragma = format!("PRAGMA key = \"x'{db_key}'\";");
conn.execute_batch(&raw_key_pragma)?;
```

A `rusqlite::Connection::pragma_update()` idézőjelez a value-t, amivel a
SQLCipher a string-et **passphrase-nek** veszi → KDF-et futtat (lassabb + egyéb
bájt-sor). Ezt elkerüljük azzal, hogy a `PRAGMA key = "x'...'"` raw-hex-formátumot
közvetlenül `execute_batch`-csel küldjük.

Az `x'...'` formátum a SQLCipher-specifikus signal: "ez már hex-enkódolt raw key,
ne KDF-ezd". Így:
- Gyorsabb nyitás (nincs PBKDF2 × 256 000)
- Determinisztikus (a Credential Manager-ben lévő hex érték egyedüli forrás)

### 3.4 Sanity-check a kompatibilitásra

```rust
let _sanity: i64 = conn
    .query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0))
    .map_err(|e| format!("SQLCipher sanity-check sikertelen — nem megfelelő kulcs? \
        Ha M2.2-es DEV-kulccsal készült DB-je van, törölje a {} fájlt \
        és indítsa újra. Hiba: {e}", db_path.display()))?;
```

Ha Endre korábban futtatta az M2.2-es dev-et, a `kartoteka.db` fájl a régi
`DEV_DB_KEY`-vel titkosított. Az M2.3 új kulccsal próbálná nyitni → `SQLITE_NOTADB`.
A hibaüzenet direkt instruálja a felhasználót a fájl törlésére.

Ez **M2.3-specifikus one-time migration** — éles telepítésnél (M5) nem jön elő,
mert a lelkészek közvetlenül M5-alapú MSI-t kapnak.

## 4. Kézi lépés Endre gépén

Az M2.2-es dev-futtatás után (ha megtörtént) törölni kell a régi DB-t:

```powershell
Remove-Item "$env:APPDATA\com.erek.kartoteka\kartoteka.db" -ErrorAction SilentlyContinue
```

Utána `npm run desktop:dev` → új kulcs generálódik a Credential Manager-be,
a DB újra inicializálódik friss sémával.

## 5. Verify

```bash
# TypeScript (apps/desktop)
npx tsc --noEmit             # 0 hiba

# Rust (cargo check)
cd src-tauri && cargo check
# 8 mp — csak a 3 új pure-Rust crate fordult
# (keyring 3.6.3, rand 0.8.6, hex 0.4.3, zeroize 1.8.2)

# Vite production build
npm run desktop:build
# vite v7.3.2  ✓ 2116 modules transformed (+1 ErrorBoundary)
# dist/assets/index-*.js      491.52 kB
# dist/assets/index-*.css      55.07 kB
# ✓ built in 3.36s
```

## 6. Credential Manager ellenőrzés (Windows)

Miután az app először lefutott:

```
Win+R → control.exe /name Microsoft.CredentialManager
```

A "Windows Credentials" (vagy magyar Windows-on "Windows-hitelesítőadatok") szekcióban megjelenik:
- **Név**: `kartoteka-desktop`
- **Felhasználó**: `sqlcipher-db-key`
- **Érték**: 64 hex karakter (elrejtve, csak a saját user-password feloldásával olvasható)

Törölhető is onnan — a következő app-indításkor új kulcs generálódik, de a régi DB-t már nem tudjuk visszafejteni. Erre figyelmezteti a sanity-check hibaüzenet.

## 7. Mit NEM csináltunk (scope-határok)

- ❌ **User-jelszó-alapú derived key** — M2.6 lehet (az egész offline-login flow-val együtt)
- ❌ **Backup/restore** a kulcsra — M2.5 feladat (ott is recovery-phrase-pel)
- ❌ **Stronghold plugin** — egyelőre nem hozzuk be; a Credential Manager
  egyszerűbb és a cél-fenyegetési modellre elég
- ❌ **Tauri-plugin wrapper** a Rust-oldali keyring-hívásra — mivel a kulcs
  kezelés a Rust-setup részében történik (a TS oldal soha nem kéri), nincs
  szükség JS-API-ra

## 8. Tanulságok

1. **A `keyring` crate cross-platform** — Windows, macOS, Linux egyazon API. Ha valaha Mac-Build kéne, a M2.3 kód fut tovább.
2. **Pure-Rust egyszerűbb, mint Stronghold** a mi use-case-ünkre. Stronghold akkor vonzó, ha több titok van, encrypted-note-vault kell, vagy cross-device sync. Nálunk most egy kulcs — overkill.
3. **Az SQLCipher raw-key vs passphrase** különbség kritikus: a `pragma_update` idézőjel-kezelése miatt a raw-hex-formátumot `execute_batch`-csel kell küldeni. Enélkül a KDF 100× lassabb indulást eredményezne.

---

## 9. M2 fázis haladási állapot (2026-04-23)

- ✅ M2.1 SQLite bootstrap (tauri-plugin-sql)
- ✅ M2.2 SQLCipher csere (rusqlite + vendored OpenSSL + statikus kulcs)
- ✅ M2.3 OS-szintű kulcs (Credential Manager / Keychain / Secret Service) ← MOST
- ⏳ M2.4 Pull-sync (Supabase → SQLite)
- ⏳ M2.5 Push-sync (outbox) + kulcs-backup
- ⏳ M2.6 Konfliktus-kezelés + user-jelszóból derived kulcs
