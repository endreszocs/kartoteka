import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Delegált import munkamenet-süti aláírása (2026-08-15).
 *
 * Ami rossz volt: a `delegated_import_<modul>` süti értéke egy aláíratlan
 * `"<gyülekezet-uuid>|<lejárat-epoch>"` szöveg volt, amit a szerveroldali
 * kapuőr (guard.ts) nyersen elhitt. Következmény: bármelyik bejelentkezett
 * lelkész beírhatta magának ezt a sütit (a saját gyülekezete UUID-ja minden
 * oldal válaszában látszik, aktív munkamenet híján pedig nincs httpOnly süti,
 * amivel ütközne), és PIN nélkül futtathatott tömeges importot a `szemely` /
 * `befizetes` / `kiadas` / `iktato` / `leltar_tetelek` táblákba — kikerülve a
 * 6 jegyű PIN-t, a brute-force korlátot és az aktiválási audit-nyomot is.
 *
 * Mostantól: az érték `<gyülekezet-uuid>|<lejárat-epoch-ms>|<HMAC-SHA256>`.
 * Az aláírás NÉGY dolgot köt össze — a felhasználót, a cél-gyülekezetet, a
 * modul-kulcsot és a lejáratot —, így a süti sem másik fiókra, sem másik
 * gyülekezetre, sem másik modulra nem játszható át, és a lejárat nem tolható
 * ki. A kulcsot a SUPABASE_SERVICE_ROLE_KEY-ből deriváljuk (a szerveren kívül
 * senki nem ismeri), ugyanúgy, ahogy a god-mode sütinél (god-mode-session.ts).
 *
 * A régi, kétrészes (aláíratlan) sütik ÉRVÉNYTELENEK — fail-closed. Az
 * élesítés után a már futó delegált munkameneteket egyszer újra fel kell
 * oldani a PIN-nel.
 */

export const DELEGATED_IMPORT_COOKIE_PREFIX = 'delegated_import_'

export function sanitizeModuleKey(moduleKey: string) {
  return (moduleKey || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
}

export function getDelegatedImportCookieName(moduleKey: string) {
  return `${DELEGATED_IMPORT_COOKIE_PREFIX}${sanitizeModuleKey(moduleKey)}`
}

let cachedKey: Buffer | null = null

function signingKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  cachedKey = secret
    ? createHmac('sha256', secret).update('kartoteka-delegated-import-cookie-v1').digest()
    : // Fejlesztői gép service-kulcs nélkül: folyamatonkénti véletlen kulcs.
      // A munkamenet a dev-szerver újraindításáig él — élesben a Railway
      // env-ben mindig ott a service-kulcs.
      randomBytes(32)
  return cachedKey
}

function hmacFor(
  userId: string,
  congregationId: string,
  moduleKey: string,
  expiresAtMs: number,
): Buffer {
  return createHmac('sha256', signingKey())
    .update(`${userId}.${congregationId}.${moduleKey}.${expiresAtMs}`)
    .digest()
}

export function signDelegatedImportCookieValue(
  userId: string,
  congregationId: string,
  moduleKey: string,
  expiresAtMs: number,
): string {
  const cleanModuleKey = sanitizeModuleKey(moduleKey)
  const mac = hmacFor(userId, congregationId, cleanModuleKey, expiresAtMs).toString('hex')
  return `${congregationId}|${expiresAtMs}|${mac}`
}

/**
 * Visszaadja a cél-gyülekezetet és a lejáratot, ha a süti aláírása érvényes,
 * ehhez a felhasználóhoz és ehhez a modulhoz tartozik, és még nem járt le.
 * Minden más esetben — hiányzó, hibás, örökölt aláíratlan vagy lejárt érték —
 * egységesen `null` (fail-closed).
 */
export function verifyDelegatedImportCookieValue(
  value: string | undefined,
  userId: string | null | undefined,
  moduleKey: string,
): { congregationId: string; expiresAt: number } | null {
  if (!value || !userId) return null

  const cleanModuleKey = sanitizeModuleKey(moduleKey)
  if (!cleanModuleKey) return null

  const parts = value.split('|')
  // Kétrészes érték = örökölt, aláíratlan formátum → érvénytelen.
  if (parts.length !== 3) return null

  const [congregationId, expiresAtRaw, macHex] = parts
  if (!congregationId || !macHex) return null

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null

  // Nem hex karakterek esetén a Buffer rövidebb lesz — a hosszellenőrzés kiveti
  // (a timingSafeEqual eltérő hosszra dobna).
  const givenMac = Buffer.from(macHex, 'hex')
  const expectedMac = hmacFor(userId, congregationId, cleanModuleKey, expiresAt)
  if (givenMac.length !== expectedMac.length) return null

  return timingSafeEqual(givenMac, expectedMac) ? { congregationId, expiresAt } : null
}
