import 'server-only'

/**
 * A mentés-motor TÁROLÓ-PORTJA (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ A RÉTEG
 * ════════════════════════════════════════════════════════════════════════════
 * A motor (olvasás → titkosítás → feltöltés → VISSZAOLVASÁS → igazolás) teljesen
 * független attól, HOVA kerül a fájl. Ez nem elvont szépség, hanem az építési
 * sorrend következménye:
 *
 *   1. fázis — Supabase Storage-ba mentünk. Google nélkül MÁR VAN mentés,
 *              már van kárjelző, már van bizonyíték.
 *   2. fázis — ugyanez a motor Drive-ba tölt fel. A logikát nem írjuk meg
 *              kétszer, tehát nem is hibázunk benne kétszer.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-11 — MIÉRT NINCS TÖBBÉ „BEKÖTENDŐ" GYÁR
 * ════════════════════════════════════════════════════════════════════════════
 * A korábbi terv szerint valakinek meg kellett volna hívnia egyszer, indulásnál:
 *
 *     setBackupStorageFactory(createDriveStorage)
 *
 * Ezt a hívást SENKI nem írta meg. Az eredmény: a felület „Google Drive
 * összekötve"-t mutatott, miközben MINDEN mentés ugyanabba a Supabase-fiókba
 * került, amelyikben az adatbázis is van — vagyis a mentés egyetlen valódi
 * értéke (hogy MÁSHOL van) elveszett, és senki nem látta.
 *
 * Ezért a döntés MOST AZ ALAPÉRTELMEZÉSBEN van, nem egy elfelejthető hívásban:
 *   · van Drive-kapcsolat (refresh token + mappa)  → GOOGLE DRIVE,
 *   · nincs                                        → Supabase Storage, és ezt
 *     a napló, a fejléc és a felület is KIMONDJA.
 *
 * A `setBackupStorageFactory` megmarad — de kizárólag TESZTELÉSRE.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A `tarolo` NÉV NEM DÍSZ
 * ════════════════════════════════════════════════════════════════════════════
 * A `fileId` jelentése tárolónként MÁS: a Drive-nál `files.id`, a Supabase
 * Storage-nál teljes objektum-útvonal. Ezért minden napló-sor és minden fájl-
 * fejléc RÖGZÍTI, melyik tárolóba került — és az olvasás (`openStoredBackup`,
 * letöltés, nyesés) EZT a tárolót használja, nem az éppen aktuálisat. Enélkül
 * egy későbbi Drive-bekötés az ÖSSZES korábbi mentést elárvítaná: a felületen
 * zöld maradna, a fájl viszont megnyithatatlan lenne.
 */

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'

import type { BackupStorage, BackupStorageObject } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Tároló-nevek — EZEK kerülnek a `backup_log.storage_nev`-be és a fejlécbe
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_DRIVE = 'google-drive'
export const STORAGE_SUPABASE = 'supabase-storage'

// ─────────────────────────────────────────────────────────────────────────────
// Regiszter — CSAK TESZTHEZ
// ─────────────────────────────────────────────────────────────────────────────

let overrideFactory: (() => Promise<BackupStorage>) | null = null

/**
 * Felülírja az automatikus tároló-választást.
 *
 * ⚠️ CSAK TESZTHEZ / ÖNELLENŐRZÉSHEZ. Éles kódban NE hívd: az éles döntést a
 *    `resolveBackupStorage()` hozza meg a Drive-kapcsolat állapotából. Egy
 *    „valahol egyszer be kell kötni" hívás pontosan az a hibaosztály, ami miatt
 *    a mentések fél éven át rossz helyre kerülhettek volna.
 */
export function setBackupStorageFactory(factory: () => Promise<BackupStorage>): void {
  overrideFactory = factory
}

/** Visszaáll az automatikus tároló-választásra. Teszthez. */
export function clearBackupStorageFactory(): void {
  overrideFactory = null
}

/**
 * Van-e ÉLŐ Google Drive kapcsolat (titkosított refresh token + célmappa)?
 *
 * Dinamikus import: így a mentés-motor statikus import-gráfja továbbra sem
 * ismeri a Google-t, és az önellenőrző szkript is be tudja tölteni a modult.
 */
async function vanDriveKapcsolat(): Promise<boolean> {
  try {
    const { loadBackupSettingsView } = await import('@/lib/google-drive/settings')
    const s = await loadBackupSettingsView()
    return s.view?.drive.osszekotve === true
  } catch {
    return false
  }
}

/**
 * A használandó tároló — AUTOMATIKUSAN.
 *
 * Fail-closed a Drive-ágon: ha a Drive ÖSSZE VAN KÖTVE, de a gyár dob (lejárt
 * token, elérhetetlen Google), NEM esünk vissza csendben a Supabase Storage-ra.
 * A néma tároló-váltás azt jelentené, hogy a tulajdonos azt hiszi, a mentés a
 * Drive-on van — miközben nincs.
 */
export async function resolveBackupStorage(): Promise<BackupStorage> {
  if (overrideFactory) return overrideFactory()
  if (await vanDriveKapcsolat()) {
    const { createDriveStorage } = await import('@/lib/google-drive/backup-storage')
    return createDriveStorage()
  }
  return createSupabaseStorage()
}

/**
 * A NEVESÍTETT tároló — az OLVASÁSI út (letöltés, visszaállítás, nyesés) ezt
 * használja, a napló-sorban rögzített `storage_nev` alapján.
 *
 * Fail-closed ismeretlen névre: inkább hangos hiba, mint rossz tárolóban
 * keresett fájl és egy félreérthető „nem található" üzenet.
 */
export async function resolveBackupStorageByName(nev: string | null | undefined): Promise<BackupStorage> {
  // Régi (2026-08-11 előtti) napló-sorokban nincs név. Ilyenkor az AKTUÁLIS
  // tárolót adjuk — más információnk nincs —, és a hívó kimondja a bizonytalanságot.
  if (!nev) return resolveBackupStorage()
  if (overrideFactory) return overrideFactory()
  if (nev === STORAGE_SUPABASE) return createSupabaseStorage()
  if (nev === STORAGE_DRIVE) {
    const { createDriveStorage } = await import('@/lib/google-drive/backup-storage')
    return createDriveStorage()
  }
  throw new Error(
    `Ismeretlen mentés-tároló: „${nev}". A fájl azonosítóját nem tudjuk értelmezni, ezért ` +
      'inkább megállunk, mint hogy rossz helyen keressük.',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Alapértelmezett tároló: Supabase Storage (1. fázis)
// ─────────────────────────────────────────────────────────────────────────────

/** A vödör neve. Privát vödör — publikus URL SOHA nem keletkezik hozzá. */
export const DEFAULT_BACKUP_BUCKET = 'biztonsagi-mentes'

function bucketName(): string {
  return process.env.BACKUP_STORAGE_BUCKET?.trim() || DEFAULT_BACKUP_BUCKET
}

function prefix(): string {
  return (process.env.BACKUP_STORAGE_PREFIX?.trim() || 'mentesek').replace(/^\/+|\/+$/g, '')
}

/**
 * Supabase Storage-alapú tároló.
 *
 * ⚠️ Ez a KIEGÉSZÍTŐ, nem a végcél: a mentés ugyanabban a felhő-fiókban lakik,
 *    mint az adatbázis. Egy fiók-szintű baleset (törölt projekt, elvesztett
 *    hozzáférés) mindkettőt viszi. Ezért van a 2. fázisban a Drive — a mentés
 *    értékének nagy része abból jön, hogy MÁSHOL van.
 */
export async function createSupabaseStorage(): Promise<BackupStorage> {
  const admin = getSupabaseAdminClient()
  const bucket = bucketName()
  const folder = prefix()

  const storage: BackupStorage = {
    nev: STORAGE_SUPABASE,

    async ensureFolder(): Promise<string> {
      // A Storage-ban nincs valódi mappa — a vödör létezése a lényeg.
      const { error } = await admin.storage.getBucket(bucket)
      if (error) {
        const { error: createError } = await admin.storage.createBucket(bucket, {
          public: false,
        })
        if (createError) {
          throw new Error(
            `A „${bucket}" mentés-vödör nem hozható létre: ${createError.message}. ` +
              'Hozd létre kézzel a Supabase Studio → Storage felületén, PRIVÁTKÉNT.',
          )
        }
      }
      return `${bucket}/${folder}`
    },

    async uploadFile({ fileName, bytes, mimeType }): Promise<BackupStorageObject> {
      const path = `${folder}/${fileName}`
      const { error } = await admin.storage.from(bucket).upload(path, bytes, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true,
      })
      if (error) {
        throw new Error(`A mentés feltöltése sikertelen (${fileName}): ${error.message}`)
      }
      return { fileId: path, fileName, bytes: bytes.length }
    },

    async downloadFile(fileId: string): Promise<Buffer> {
      const { data, error } = await admin.storage.from(bucket).download(fileId)
      if (error || !data) {
        throw new Error(
          `A mentés VISSZAOLVASÁSA sikertelen (${fileId}): ${error?.message || 'nincs adat'}`,
        )
      }
      return Buffer.from(await data.arrayBuffer())
    },

    async statFile(fileId: string): Promise<BackupStorageObject | null> {
      // A Storage-nak nincs „egy objektum metaadata" végpontja, ezért a MAPPÁT
      // listázzuk a fájlnév-előtagra szűrve. Egy nem létező fájl így ÜRES
      // találatot ad — nem hibát, amit összekeverhetnénk a hálózati bajjal.
      const utolsoPer = fileId.lastIndexOf('/')
      const mappa = utolsoPer >= 0 ? fileId.slice(0, utolsoPer) : ''
      const nev = utolsoPer >= 0 ? fileId.slice(utolsoPer + 1) : fileId
      const { data, error } = await admin.storage
        .from(bucket)
        .list(mappa, { limit: 100, search: nev })
      if (error) {
        throw new Error(`A mentés-fájl ellenőrzése sikertelen (${fileId}): ${error.message}`)
      }
      const talalat = (data ?? []).find((f) => f.name === nev)
      if (!talalat) return null
      const size = (talalat.metadata as { size?: number } | null)?.size
      return { fileId, fileName: nev, bytes: typeof size === 'number' ? size : 0 }
    },

    async listFiles(): Promise<BackupStorageObject[]> {
      const out: BackupStorageObject[] = []
      const pageSize = 100
      for (let offset = 0; ; ) {
        const { data, error } = await admin.storage
          .from(bucket)
          .list(folder, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } })
        if (error) {
          throw new Error(`A mentés-fájlok listázása sikertelen: ${error.message}`)
        }
        const page = data ?? []
        for (const f of page) {
          const size = (f.metadata as { size?: number } | null)?.size
          out.push({
            fileId: `${folder}/${f.name}`,
            fileName: f.name,
            bytes: typeof size === 'number' ? size : 0,
            // 2026-08-11: az „ismeretlen fájl" jelzésnek MIKOR-ra is szüksége van.
            letrehozva: (f as { created_at?: string | null }).created_at ?? null,
          })
        }
        // CSAK az ÜRES lap a biztos stop — a rövid lap még nem a lista vége.
        if (page.length === 0) break
        offset += page.length
      }
      return out
    },

    async deleteFilePermanently(fileId: string): Promise<void> {
      const { error } = await admin.storage.from(bucket).remove([fileId])
      if (error) {
        throw new Error(`A régi mentés törlése sikertelen (${fileId}): ${error.message}`)
      }
    },

    async testConnection(): Promise<{ ok: boolean; uzenet: string }> {
      const probe = `${folder}/proba-${Date.now()}.txt`
      const tartalom = Buffer.from('kartoteka-proba', 'utf8')
      try {
        await storage.ensureFolder()
        const { error: upErr } = await admin.storage
          .from(bucket)
          .upload(probe, tartalom, { contentType: 'text/plain', upsert: true })
        if (upErr) return { ok: false, uzenet: `Feltöltés: ${upErr.message}` }

        const { data, error: dlErr } = await admin.storage.from(bucket).download(probe)
        if (dlErr || !data) {
          return { ok: false, uzenet: `Visszaolvasás: ${dlErr?.message || 'nincs adat'}` }
        }
        const vissza = Buffer.from(await data.arrayBuffer())
        if (!vissza.equals(tartalom)) {
          return { ok: false, uzenet: 'A visszaolvasott próbafájl NEM egyezik a feltöltöttel.' }
        }
        await admin.storage.from(bucket).remove([probe])
        return { ok: true, uzenet: `Rendben — a „${bucket}" vödör írható és olvasható.` }
      } catch (e: unknown) {
        return { ok: false, uzenet: e instanceof Error ? e.message : 'ismeretlen hiba' }
      }
    },
  }

  return storage
}
