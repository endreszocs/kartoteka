/**
 * Oblio ellenőrzés — IndexedDB cache a parse-olt UBL XML metaadatoknak.
 *
 * Az XML-eket a felhasználó helyi mappájából olvassuk, parse-oljuk, majd
 * cache-eljük IndexedDB-be (Dexie), hogy minden fül-betöltésnél ne kelljen
 * újra parse-olni minden fájlt. A cache kulcsa az ANAF UUID + a fájl
 * lastModified — ha a fájl változik (ritka), újraparse-oljuk.
 *
 * A Dexie séma kiegészítését csak ide tartozó tábla-definíciókkal végezzük,
 * a központi `lib/offline/db.ts` séma-verzióit nem érintjük (külön DB-t
 * használunk a cache-nek, hogy a fő sync-elt sémától függetlenül kezelhessük).
 */

import Dexie, { type Table } from 'dexie'
import type { UblInvoiceMeta } from './ubl-parser'

// ─────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────

export type OblioXmlCacheRecord = {
  /** Kulcs: congregation_id + anaf_uuid (egyedi). */
  key: string
  congregationId: string
  /** ANAF UUID — a fájlnévből vagy az XML-ből kinyert. */
  anafUuid: string
  /** A relatív fájl-útvonal a `befogadott/` mappához képest. */
  fileName: string
  /** Fájl mérete byte-ban (változás-detektáláshoz). */
  fileSize: number
  /** Utoljára módosítva (epoch ms). */
  fileLastModified: number
  /** A parse-olt metaadatok. */
  meta: UblInvoiceMeta
  /** Mikor cache-eltük be. */
  cachedAt: number
}

// ─────────────────────────────────────────────────────────────
// Dexie séma
// ─────────────────────────────────────────────────────────────

class OblioCacheDb extends Dexie {
  oblio_xml_cache!: Table<OblioXmlCacheRecord, string>

  constructor() {
    super('kartoteka_oblio_cache')
    this.version(1).stores({
      // Az index a congregation_id + anafUuid kombinációra (gyors lookup)
      // és a fileLastModified (változás detekció) mentén
      oblio_xml_cache:
        '&key, congregationId, anafUuid, fileName, fileLastModified, cachedAt',
    })
  }
}

let dbInstance: OblioCacheDb | null = null

function getDb(): OblioCacheDb {
  if (typeof window === 'undefined') {
    throw new Error('Az Oblio cache csak a kliens-oldalon használható.')
  }
  if (!dbInstance) {
    dbInstance = new OblioCacheDb()
  }
  return dbInstance
}

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

function makeKey(congregationId: string, anafUuid: string): string {
  return `${congregationId}::${anafUuid}`
}

export async function getCachedXml(
  congregationId: string,
  anafUuid: string,
): Promise<OblioXmlCacheRecord | undefined> {
  const db = getDb()
  return db.oblio_xml_cache.get(makeKey(congregationId, anafUuid))
}

export async function listCachedXmls(
  congregationId: string,
): Promise<OblioXmlCacheRecord[]> {
  const db = getDb()
  return db.oblio_xml_cache.where('congregationId').equals(congregationId).toArray()
}

export async function putCachedXml(rec: Omit<OblioXmlCacheRecord, 'key' | 'cachedAt'>): Promise<void> {
  const db = getDb()
  const key = makeKey(rec.congregationId, rec.anafUuid)
  await db.oblio_xml_cache.put({
    ...rec,
    key,
    cachedAt: Date.now(),
  })
}

export async function removeCachedXml(
  congregationId: string,
  anafUuid: string,
): Promise<void> {
  const db = getDb()
  await db.oblio_xml_cache.delete(makeKey(congregationId, anafUuid))
}

/**
 * A cache-ből eltávolítja azokat a rekordokat, amelyeknek a fájlja már
 * NEM létezik a helyi mappában (törlés-szinkron).
 */
export async function pruneCacheToActualFiles(
  congregationId: string,
  actualFileNames: Set<string>,
): Promise<number> {
  const db = getDb()
  const all = await db.oblio_xml_cache
    .where('congregationId')
    .equals(congregationId)
    .toArray()
  let deleted = 0
  for (const rec of all) {
    if (!actualFileNames.has(rec.fileName)) {
      await db.oblio_xml_cache.delete(rec.key)
      deleted++
    }
  }
  return deleted
}

export async function clearCacheForCongregation(congregationId: string): Promise<void> {
  const db = getDb()
  await db.oblio_xml_cache.where('congregationId').equals(congregationId).delete()
}
