#!/usr/bin/env node
/**
 * Tauri CLI wrapper a desktop crate natív (cargo) buildjéhez (2026-06-15).
 *
 * MIÉRT KELL: a `rusqlite` `bundled-sqlcipher-vendored-openssl` feature az
 * OpenSSL-t FORRÁSBÓL fordítja (nmake + perl). Az OpenSSL Windows-os nmake-buildje
 * elhasal, ha a build (`target`) útvonala SZÓKÖZT vagy NEM-ASCII karaktert tartalmaz
 * (a `cl.exe` ilyenkor `C1041: cannot open program database …ossl_static.pdb`-vel áll meg).
 * Ez a projekt útvonalánál fennáll (pl. `…\Egyházi APP\…`).
 *
 * MIT CSINÁL: ha Windowson fut ÉS a jelenlegi útvonal problémás (szóköz/nem-ASCII),
 * a cargo `target` mappát egy tiszta (ASCII, szóköz nélküli) helyre irányítja át
 * (`CARGO_TARGET_DIR`), és ráteszi a `CL=/FS` kapcsolót (szinkronizált PDB-írás).
 * Minden más esetben (tiszta útvonal, macOS, Linux, CI) ÉRINTETLEN passthrough —
 * a build a megszokott helyre megy.
 *
 * Az átirányítás kikapcsolható / felülírható a `KARTOTEKA_TAURI_TARGET` env-rel.
 *
 * Hívás: a `package.json` "tauri" scriptje hívja, a Tauri-alparancsot (build/dev/…)
 * argumentumként továbbadva.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const env = { ...process.env }

/** Tartalmaz-e az útvonal szóközt vagy nem-ASCII karaktert? */
function isProblematicPath(p) {
  return /\s/.test(p) || /[^ -~]/.test(p)
}

if (process.platform === 'win32') {
  // 1) /FS minden cl.exe-hívásra (a C1041 konkurencia-variánsa ellen — ártalmatlan).
  env.CL = env.CL ? `${env.CL} /FS` : '/FS'

  // 2) Ha az útvonal problémás és nincs explicit target-dir, tiszta helyre irányítunk.
  const cwd = process.cwd()
  if (isProblematicPath(cwd) && !env.CARGO_TARGET_DIR) {
    // Sorrend: explicit env → meglévő, bevált target-dir (cache újrahasznosítás,
    // megspórol egy 15-25 perces OpenSSL-újrafordítást) → LOCALAPPDATA → C:\ tartalék.
    const explicit = [process.env.KARTOTEKA_TAURI_TARGET].filter(Boolean)
    const existingReuse = ['C:\\kartoteka-target'].filter((c) => existsSync(c))
    const fresh = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'kartoteka-tauri-target'),
      'C:\\kartoteka-tauri-target',
    ].filter(Boolean)
    const clean = [...explicit, ...existingReuse, ...fresh].find((c) => !isProblematicPath(c))
    if (clean) {
      try {
        mkdirSync(clean, { recursive: true })
        env.CARGO_TARGET_DIR = clean
        console.log(
          `\n[kartoteka] A projekt útvonala szóközt/ékezetet tartalmaz, ami az OpenSSL (SQLCipher)\n` +
            `            forrásból-fordítását megbuktatja. A natív buildet ide irányítom át:\n` +
            `            ${clean}\n` +
            `            (a telepítő/binárisok is ott, a release\\bundle alatt lesznek.)\n`,
        )
      } catch (e) {
        console.warn(
          `[kartoteka] FIGYELEM: nem sikerült tiszta target-mappát létrehozni (${clean}): ${e.message}\n` +
            `            Állítsd be kézzel: set CARGO_TARGET_DIR=C:\\valami\\tiszta\\ut`,
        )
      }
    } else {
      console.warn(
        `[kartoteka] FIGYELEM: a projekt útvonala szóközt/ékezetet tartalmaz, de nem találtam tiszta\n` +
          `            target-helyet. Az OpenSSL-build elhasalhat. Állítsd be: set CARGO_TARGET_DIR=C:\\kt`,
      )
    }
  }
}

const res = spawnSync('npx', ['tauri', ...args], {
  stdio: 'inherit',
  env,
  shell: true,
})

if (res.error) {
  console.error(`[kartoteka] A Tauri CLI indítása nem sikerült: ${res.error.message}`)
  process.exit(1)
}
process.exit(res.status ?? 1)
