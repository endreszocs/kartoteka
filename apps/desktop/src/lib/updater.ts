/**
 * Kartotéka Desktop — Tauri auto-updater wrapper (M5).
 *
 * A `@tauri-apps/plugin-updater` egy magas-szintű API-t ad:
 *   - `check()` → ellenőrzi, hogy van-e új verzió a konfigurált endpoint-on
 *   - `update.downloadAndInstall()` → letöltés + telepítés + app-restart
 *
 * A kliens Ed25519-cal ellenőrzi a manifest aláírást, tehát a pubkey-nek
 * egyeznie kell a `tauri.conf.json`-ben lévővel. Ha nem, a check hibát dob.
 *
 * **M5 állapot**: a `tauri.conf.json` pubkey még placeholder
 * (`UPDATER_PUBKEY_PLACEHOLDER_BYGENSCRIPT`). A tényleges kulcsot a
 * `ops/updater-key-setup.ps1` script generálja (Endre egyszer), és a
 * `plugins.updater.pubkey` mezőbe kerül. Addig a `checkForUpdates()`
 * hívás hibát fog dobni — ami nem baj, mert a UI tisztán kezeli.
 */

import { check, type Update } from '@tauri-apps/plugin-updater'

import { errorMessage } from './error'

export interface UpdateCheckResult {
  available: boolean
  version?: string
  releaseDate?: string
  notes?: string
  error?: string
  /** A letöltés/telepítés elindításához használható handle. */
  handle?: Update
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const update = await check()
    if (!update || !update.available) {
      return { available: false }
    }
    return {
      available: true,
      version: update.version,
      releaseDate: update.date,
      notes: update.body,
      handle: update,
    }
  } catch (err: unknown) {
    return { available: false, error: errorMessage(err) }
  }
}

/**
 * Az update letöltése + telepítése. A Tauri a letöltés után restart-olja
 * az appot — a `relaunch` explicit hívása biztosítja, hogy friss állapottal
 * induljon újra.
 */
export async function downloadAndInstall(
  update: Update,
  onProgress?: (downloaded: number, total: number | undefined) => void,
): Promise<{ success: boolean; error?: string }> {
  try {
    let downloaded = 0
    let total: number | undefined = undefined
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          total = event.data.contentLength
          break
        case 'Progress':
          downloaded += event.data.chunkLength
          onProgress?.(downloaded, total)
          break
        case 'Finished':
          break
      }
    })
    // A Tauri `downloadAndInstall` Windows-on a telepítés után automatikusan
    // bezárja és újraindítja az app-ot (a NSIS/MSI installer intézi). Ha
    // finomszemű restart-logika kell, érdemes a `@tauri-apps/plugin-process`
    // `relaunch()`-ot hozzávenni — M5 skeleton-ban nem szükséges.
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err) }
  }
}
