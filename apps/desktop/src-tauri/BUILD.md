# Desktop natív build — Windows / SQLCipher / OpenSSL

A desktop app a lokális adatokat **SQLCipher**-rel titkosítja, amihez a `rusqlite`
`bundled-sqlcipher-vendored-openssl` feature **forrásból fordítja az OpenSSL-t**
(`openssl-src` → `nmake` + Perl). Ez Windows MSVC-n az első buildnél 15–25 perc.

## A gyakori hiba és a gyökérok

```
crypto\...\*.c: fatal error C1041: cannot open program database
  '…\<projekt-út>\…\out\openssl-build\build\src\ossl_static.pdb';
  if multiple CL.EXE write to the same .PDB file, please use /FS
NMAKE : fatal error U1077: '"cl" …' : return code '0x2'
error: failed to run custom build command for `openssl-sys`
```

**Gyökérok:** az OpenSSL `nmake`-buildje elhasal, ha a build (`target`) útvonala
**szóközt vagy nem-ASCII karaktert** tartalmaz — ez a projekt elérési útjánál fennáll
(`…\Egyházi APP\…`). A `cl.exe` ilyen úton nem tudja megnyitni a megosztott
`ossl_static.pdb`-t. (A C1041 üzenet `/FS`-t javasol, de itt nem a konkurencia, hanem
az útvonal a baj — bizonyítva: tiszta úton, pl. `C:\kt-build`, a build hibátlanul lefut.)

Mellékes súlyosbító: egy **korábbi megszakított build** zombie `cl.exe` / `mspdbsrv.exe`
processzei fogva tarthatják a PDB-t — ezek kilövése (`taskkill`) szintén kellhet.

## A megoldás (automatikus)

A `npm run tauri build` / `npm run tauri dev` (és a root `npm run desktop:build` /
`desktop:dev`) a **`scripts/desktop-tauri.mjs`** wrapperen át fut. Ez Windowson,
**ha az útvonal problémás**, a buildet egy tiszta mappába irányítja át:

```
%LOCALAPPDATA%\kartoteka-tauri-target   (pl. C:\Users\<név>\AppData\Local\kartoteka-tauri-target)
```

— és ráteszi a `CL=/FS` kapcsolót. **Tiszta útvonalon, macOS-en, Linuxon és CI-n a wrapper
nem nyúl semmihez** (a build a megszokott `target/`-be megy). A telepítő/binárisok
átirányításkor a fenti mappa `release\bundle\` almappájában lesznek (a wrapper kiírja).

Felülírás / kézi beállítás:

```bat
set KARTOTEKA_TAURI_TARGET=C:\valami\tiszta\ut
```

## Közvetlen cargo (a wrapper megkerülésével)

Ha közvetlenül `cargo build` / `cargo check` / `cargo clippy`-t futtatsz a
`src-tauri`-ban (nem a `npm run tauri`-n át), állítsd be magad:

```powershell
$env:CARGO_TARGET_DIR = "C:\kt"          # tiszta, ASCII, szóköz nélküli út
$env:CL = "/FS"
cargo build
```

Ha „cannot open program database" hibát kapsz egy korábbi megszakított build után:

```powershell
Get-Process mspdbsrv,cl,link,nmake -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Előfeltételek (Windows)

- **MSVC Build Tools** (cl, nmake, link) — Visual Studio 2022 Build Tools.
- **Perl** a PATH-on (Strawberry Perl ajánlott; a Git-bash MSYS-perl NEM jó).
- **NASM** a PATH-on (a Strawberry `C:\Strawberry\c\bin` tartalmazza).

## Háttér (források)

- OpenSSL build + szóközös/nem-ASCII út: <https://github.com/openssl/openssl/issues/23023>
- rusqlite SQLCipher + OpenSSL Windowson: <https://github.com/rusqlite/rusqlite/issues/1025>
- `openssl-src` Perl-kiválasztás (`OPENSSL_SRC_PERL`): <https://github.com/alexcrichton/openssl-src-rs/issues/45>
