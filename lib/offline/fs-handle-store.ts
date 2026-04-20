/**
 * File System Access API handle-ek perzisztálása.
 *
 * A Chrome/Edge támogatja, hogy egy `FileSystemDirectoryHandle`-t
 * Dexie-ben (IndexedDB-ben) eltároljunk, és reload után visszakapjunk.
 * A user permission-t kérünk minden reload-kor (nem perzisztens),
 * de legalább nem kell újra mappát választani.
 *
 * API (user-facing):
 *  - `pickRootDirectory()` — megnyitja a natív mappa-választót
 *  - `getStoredRootHandle()` — visszaadja a korábban elmentett handle-t
 *  - `forgetRootDirectory()` — törli a mentett handle-t
 *  - `ensurePermission(handle)` — ellenőrzi/kér readwrite permission-t
 *  - `getOrCreateModuleSubdir(rootHandle, slug)` — KARTOTEKA/<slug>/ létrehozása
 *  - `writeFile(dir, fileName, blob)` — atomic swap-pal ír
 *  - `readFile(dir, fileName)` — Blob visszaadása
 *
 * Fontos: a File System Access API csak Chromium-alapú böngészőkben működik
 * (Chrome, Edge, Brave, Opera). Firefox és Safari esetén fallback kell.
 */

import { getDb } from './db'

// ─────────────────────────────────────────────────────────────────
// Böngésző support detektálás
// ─────────────────────────────────────────────────────────────────

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'showDirectoryPicker' in window
}

// ─────────────────────────────────────────────────────────────────
// Perzisztálás (Dexie)
// ─────────────────────────────────────────────────────────────────

const ROOT_HANDLE_KEY = 'kartoteka-root'

/**
 * Megnyitja a natív mappa-választó dialógust. A user kiválaszt egy
 * mappát, ahova a KARTOTEKA almappa kerül. A kiválasztott handle
 * perzisztálódik Dexie-ben.
 */
export async function pickRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error(
      'A böngésződ nem támogatja a File System Access API-t. Használj Chrome-ot vagy Edge-et.',
    )
  }

  try {
    // @ts-expect-error — showDirectoryPicker experimental API, typing fogyatékos
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'kartoteka-root',
      startIn: 'documents',
    })

    // Perzisztál Dexie-ben
    const db = getDb()
    await db._fs_handles.put({
      key: ROOT_HANDLE_KEY,
      handle, // Dexie a FileSystemDirectoryHandle-t IndexedDB-ben tárolja
      savedAt: Date.now(),
    })

    return handle
  } catch (e) {
    // User AbortError esetén a dialog-ot bezárták
    if (e instanceof Error && e.name === 'AbortError') {
      return null
    }
    // Chrome blokklistás mappa (gyökér, Windows, Program Files, OneDrive root, stb.)
    // A hibakód általában 'SecurityError' vagy 'NotAllowedError'
    if (
      e instanceof Error &&
      (e.name === 'SecurityError' ||
        e.name === 'NotAllowedError' ||
        e.message.includes('blocked') ||
        e.message.includes('security'))
    ) {
      throw new Error(
        'A böngésző biztonsági okokból nem engedi ezt a mappát. Válassz egy SAJÁT almappát, NE:\n' +
          '• C:\\ vagy D:\\ meghajtó gyökerét\n' +
          '• Windows / Program Files rendszermappát\n' +
          '• C:\\Users\\<név> gyökeret\n' +
          '• OneDrive / Dropbox / Google Drive gyökeret\n\n' +
          'Javasolt: hozz létre egy KARTOTEKA mappát a Dokumentumok-ban, vagy a C:\\Users\\<név>\\Documents alatt.',
      )
    }
    throw e
  }
}

/**
 * Visszaadja a korábban elmentett root handle-t, vagy null ha nincs.
 */
export async function getStoredRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null
  const db = getDb()
  const record = await db._fs_handles.get(ROOT_HANDLE_KEY)
  if (!record) return null
  return record.handle as FileSystemDirectoryHandle
}

/**
 * Törli a mentett root handle-t (pl. user újra akarja választani a mappát).
 */
export async function forgetRootDirectory(): Promise<void> {
  if (!isFileSystemAccessSupported()) return
  const db = getDb()
  await db._fs_handles.delete(ROOT_HANDLE_KEY)
}

// ─────────────────────────────────────────────────────────────────
// Permission kezelés
// ─────────────────────────────────────────────────────────────────

/**
 * Ellenőrzi, majd ha kell, kéri a readwrite permission-t.
 * A user-gesture kötelező (pl. gomb click), amikor a permission prompt megjelenik.
 * Visszaad: true ha granted, false ha denied.
 */
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  // @ts-expect-error — queryPermission API nem teljesen typed
  const current: PermissionState = await handle.queryPermission({
    mode: 'readwrite',
  })
  if (current === 'granted') return true
  if (current === 'denied') return false

  // prompt ('default' or 'prompt' state) — user-gesture keretében
  // @ts-expect-error — requestPermission experimental API typing nem teljes
  const requested: PermissionState = await handle.requestPermission({
    mode: 'readwrite',
  })
  return requested === 'granted'
}

// ─────────────────────────────────────────────────────────────────
// Mappa műveletek
// ─────────────────────────────────────────────────────────────────

/**
 * A KARTOTEKA/<gyülekezet-slug>/ mappastruktúra létrehozása a root alatt.
 * Ha már léteznek, csak megnyitja őket.
 */
export async function getOrCreateKartotekaDir(
  rootHandle: FileSystemDirectoryHandle,
  congregationSlug: string,
): Promise<FileSystemDirectoryHandle> {
  const kartotekaDir = await rootHandle.getDirectoryHandle('KARTOTEKA', {
    create: true,
  })
  const congDir = await kartotekaDir.getDirectoryHandle(congregationSlug, {
    create: true,
  })
  return congDir
}

// ─────────────────────────────────────────────────────────────────
// Fájl write/read — atomic swap-pal
// ─────────────────────────────────────────────────────────────────

/**
 * Atomic fájlírás:
 *  1. Írjuk ki új tartalmat `<fileName>.new` fájlba
 *  2. Ha van régi `<fileName>`, átnevezzük `<fileName>.bak.1`-re
 *  3. `<fileName>.new` átnevezzük `<fileName>`-re
 *  4. A régi `.bak.1` → `.bak.2` → `.bak.3` rotálás (3 generáció)
 *
 * MEGJEGYZÉS: a FileSystemDirectoryHandle-nek nincs direct rename API-ja!
 * Az "átnevezést" removeEntry + createFile + write sorozattal szimuláljuk.
 * Ez NEM teljesen atomic, de 99%-ban jó. Hibás esetben a `.new` fájl
 * megmarad, és legközelebb újraírjuk.
 */
export async function writeFileAtomic(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  data: Blob | ArrayBuffer,
): Promise<void> {
  // 1. Új tartalom kiírása <fileName>.new-ba
  const newFileName = `${fileName}.new`
  const newHandle = await dir.getFileHandle(newFileName, { create: true })
  const writable = await newHandle.createWritable()
  await writable.write(data)
  await writable.close()

  // 2. Backup rotálás
  await rotateBackups(dir, fileName, 3)

  // 3. Ha van régi fájl, átnevezés .bak.1-re (másolás-és-törlés)
  try {
    const oldHandle = await dir.getFileHandle(fileName, { create: false })
    const oldFile = await oldHandle.getFile()
    const bakHandle = await dir.getFileHandle(`${fileName}.bak.1`, {
      create: true,
    })
    const bakWritable = await bakHandle.createWritable()
    await bakWritable.write(oldFile)
    await bakWritable.close()
    // Régi törlése
    await dir.removeEntry(fileName)
  } catch (e) {
    if (e instanceof Error && e.name !== 'NotFoundError') throw e
    // A régi fájl még nem létezett, ez OK
  }

  // 4. Új fájl átnevezése (másolás-és-törlés)
  const newFileHandle = await dir.getFileHandle(newFileName)
  const newFile = await newFileHandle.getFile()
  const finalHandle = await dir.getFileHandle(fileName, { create: true })
  const finalWritable = await finalHandle.createWritable()
  await finalWritable.write(newFile)
  await finalWritable.close()

  // 5. .new cleanup
  await dir.removeEntry(newFileName)
}

async function rotateBackups(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  maxGenerations: number,
): Promise<void> {
  // Legrégebbi bak törlése
  try {
    await dir.removeEntry(`${fileName}.bak.${maxGenerations}`)
  } catch {
    // Nincs, OK
  }

  // .bak.2 → .bak.3, .bak.1 → .bak.2, stb.
  for (let i = maxGenerations - 1; i >= 1; i--) {
    try {
      const oldHandle = await dir.getFileHandle(`${fileName}.bak.${i}`, {
        create: false,
      })
      const oldFile = await oldHandle.getFile()
      const newHandle = await dir.getFileHandle(`${fileName}.bak.${i + 1}`, {
        create: true,
      })
      const writable = await newHandle.createWritable()
      await writable.write(oldFile)
      await writable.close()
      await dir.removeEntry(`${fileName}.bak.${i}`)
    } catch {
      // Nincs ilyen bak, OK
    }
  }
}

/**
 * Fájl olvasás — visszaadja a Blob-ot vagy null-t ha nincs.
 */
export async function readFile(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<File | null> {
  try {
    const handle = await dir.getFileHandle(fileName, { create: false })
    return await handle.getFile()
  } catch (e) {
    if (e instanceof Error && e.name === 'NotFoundError') return null
    throw e
  }
}

// ─────────────────────────────────────────────────────────────────
// PII útvonal heurisztika — OneDrive/Dropbox/iCloud figyelmeztetés
// ─────────────────────────────────────────────────────────────────

/**
 * Ha a user handle nevében van ismert felhő-szinkronizált mappa, warningolunk.
 * Ez nem 100%-os (a user átnevezhette a mappát), de a legnyilvánvalóbb esetek
 * ellen véd.
 */
export function detectCloudSyncFolder(handle: FileSystemDirectoryHandle): {
  isCloud: boolean
  reason: string | null
} {
  const name = handle.name.toLowerCase()
  // Csak a kiválasztott mappa NEVÉT látjuk (nem a teljes útvonalat).
  // Ismert cloud-sync mappanevek:
  const cloudPatterns = [
    { pattern: /onedrive/i, service: 'OneDrive' },
    { pattern: /dropbox/i, service: 'Dropbox' },
    { pattern: /google.*drive/i, service: 'Google Drive' },
    { pattern: /icloud/i, service: 'iCloud' },
    { pattern: /box sync/i, service: 'Box' },
    { pattern: /mega sync/i, service: 'MEGA' },
  ]

  for (const { pattern, service } of cloudPatterns) {
    if (pattern.test(name)) {
      return {
        isCloud: true,
        reason: `A kiválasztott mappa neve "${handle.name}" — ez felhő-szinkronizáltnak tűnik (${service}). A személyes adatok felhőbe kerülnek, ami GDPR kockázatot jelenthet.`,
      }
    }
  }

  return { isCloud: false, reason: null }
}
