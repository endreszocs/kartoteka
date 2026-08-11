import 'server-only'

/**
 * A GOOGLE DRIVE MINT A MENTÉS-MOTOR TÁROLÓJA (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MI EZ
 * ════════════════════════════════════════════════════════════════════════════
 * A mentés-motor (`lib/backup/export.ts`) SEMMIT nem tud a Google-ról: egyetlen
 * `BackupStorage` porton keresztül dolgozik (`lib/backup/types.ts`). Ez a fájl
 * az a port Drive-implementációja. Így az 1. fázis (Supabase Storage) és a
 * 2. fázis (Drive) UGYANAZT a motort használja — a mentés logikáját nem írjuk
 * meg kétszer, tehát nem is hibázunk benne kétszer.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * BEKÖTÉS — NINCS. ÉS EZ SZÁNDÉKOS (2026-08-11 javítás)
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a gyár korábban egy `setBackupStorageFactory(createDriveStorage)` hívásra
 * várt valahol az indulási ponton. Az a hívás SOHA nem született meg, és emiatt
 * minden mentés a Supabase Storage-ba került, miközben a felület „Google Drive
 * összekötve"-t írt. Egy elfelejthető bekötés nem lehet a mentés-rendszer
 * alappillére.
 *
 * MOSTANTÓL a `lib/backup/storage.ts` `resolveBackupStorage()`-a MAGA dönt:
 * ha van élő Drive-kapcsolat, EZT a gyárat hívja (dinamikus importtal); ha
 * nincs, a Supabase Storage-ot — és a `backup_log.storage_nev` + a fájl fejléce
 * rögzíti, MELYIK volt. Az olvasás mindig a rögzített tárolóból történik.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * FAIL-CLOSED
 * ════════════════════════════════════════════════════════════════════════════
 * Ha nincs Drive-kapcsolat, ez a gyár DOB. A motor (`resolveBackupStorage`)
 * szándékosan NEM esik vissza csendben a Supabase Storage-ra: a néma
 * tároló-váltás azt jelentené, hogy a tulajdonos azt hiszi, a mentés a
 * Drive-on van — miközben nincs.
 */

import type { BackupStorage, BackupStorageObject } from '@/lib/backup/types'

import {
  DriveError,
  deleteFilePermanently,
  downloadFile as driveDownload,
  ensureBackupFolder,
  getDriveAccessToken,
  getFileMeta,
  listFolderFiles,
  testDriveConnection,
  uploadFile as driveUpload,
} from './drive-client'
import { loadDriveRefreshToken } from './settings'

/**
 * A célmappa azonosítója. Egy futáson belül gyorsítótárazva, hogy ne kérdezzük
 * le minden fájlnál — de NEM process-szinten, mert a szétkapcsolás után
 * érvénytelen lenne.
 */
async function resolveFolderId(accessToken: string): Promise<string> {
  const stored = await loadDriveRefreshToken()
  if (stored.needsSql) {
    throw new DriveError('A mentés-rendszer SQL-migrációja még nem futott le.')
  }
  return ensureBackupFolder(accessToken, stored.folderId)
}

/**
 * Drive-tároló a mentés-motorhoz.
 *
 * ⚠️ A `bytes` MÁR TITKOSÍTOTT konténer (`KBK1`). Ez a réteg SOHA nem lát
 *    nyílt személyes adatot, és nem is szabad, hogy lásson: a Google csak a
 *    fájlnevet és a méretet ismeri meg.
 */
export async function createDriveStorage(): Promise<BackupStorage> {
  // Fail-closed a gyárban: ha most nincs kapcsolat, a motor NE induljon el
  // abban a hitben, hogy majd lesz.
  const accessToken = await getDriveAccessToken()
  let folderId = await resolveFolderId(accessToken)

  /** Minden hívás előtt friss token — egy hosszú futás túllóghat a lejáraton. */
  async function token(): Promise<string> {
    return getDriveAccessToken()
  }

  const storage: BackupStorage = {
    nev: 'google-drive',

    async ensureFolder(): Promise<string> {
      folderId = await resolveFolderId(await token())
      return folderId
    },

    async uploadFile({ fileName, bytes, mimeType }): Promise<BackupStorageObject> {
      const t = await token()
      const fajl = await driveUpload(t, {
        folderId,
        name: fileName,
        content: new Uint8Array(bytes),
        mimeType: mimeType || 'application/octet-stream',
      })
      return {
        fileId: fajl.id,
        fileName: fajl.name || fileName,
        // A Drive a méretet stringként adja; ha hiányzik, a FELTÖLTÖTT hosszt
        // használjuk — soha nem 0-t, mert az „üres mentés"-nek látszana.
        bytes: fajl.size ?? bytes.byteLength,
      }
    },

    async downloadFile(fileId: string): Promise<Buffer> {
      // ⚠️ EZ AZ IGAZOLÁS ALAPJA: a motor ezt veti össze a feltöltöttel.
      // Ha ez a hívás bármikor „üres, de sikeres" választ adna, a mentés
      // hamisan igazoltnak látszana — ezért a `driveDownload` nem-2xx-en DOB.
      return Buffer.from(await driveDownload(await token(), fileId))
    },

    async statFile(fileId: string): Promise<BackupStorageObject | null> {
      // ⚠️ A `drive.file` hatókör mellett a kézzel elmozgatott vagy törölt fájl
      //    egyszerűen ELTŰNIK az alkalmazás elől — 404-gyel, nem hibával. Ezért
      //    a `null` itt VALÓDI információ, nem hálózati zaj.
      const meta = await getFileMeta(await token(), fileId)
      if (!meta) return null
      return { fileId: meta.id, fileName: meta.name, bytes: meta.size ?? 0 }
    },

    async listFiles(): Promise<BackupStorageObject[]> {
      const t = await token()
      const fajlok = await listFolderFiles(t, folderId)
      return fajlok.map((f) => ({
        fileId: f.id,
        fileName: f.name,
        bytes: f.size ?? 0,
        // 2026-08-11: az „ismeretlen fájl" jelzésnek MIKOR-ra is szüksége van.
        letrehozva: f.createdTime ?? f.modifiedTime ?? null,
      }))
    },

    async deleteFilePermanently(fileId: string): Promise<void> {
      // ⛔ VÉGLEGES. A Drive Kukája 30 napig őrizne, és a megőrzési ígéret
      // némán 44 nappá válna.
      await deleteFilePermanently(await token(), fileId)
    },

    async testConnection(): Promise<{ ok: boolean; uzenet: string }> {
      const r = await testDriveConnection()
      return {
        ok: r.success,
        uzenet: r.success
          ? `Google Drive rendben (${r.fiokEmail ?? 'ismeretlen fiók'}) — a próbafájl fel-, vissza- és letörlődött.`
          : (r.error ?? 'A Drive-kapcsolat tesztje elhasalt.'),
      }
    },
  }

  return storage
}

/**
 * A visszaállítási ág egyszerűsített letöltője: `downloadFile(fileId)`.
 * (A `lib/restore/backup-port.ts` pontosan ezt az alakot várja.)
 */
export async function downloadBackupFile(fileId: string): Promise<Buffer> {
  const accessToken = await getDriveAccessToken()
  return Buffer.from(await driveDownload(accessToken, fileId))
}
