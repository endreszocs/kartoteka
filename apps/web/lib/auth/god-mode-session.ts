import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * God-mode munkamenet-süti aláírása (2026-08-15, 8. pont D).
 *
 * Ami rossz volt: a `god_mode_until` süti egy sima epoch-szám volt, amit a
 * kliens állít elő magának — azaz bárki, aki a master admin munkamenetével
 * kérést tud küldeni (ellopott session-süti, őrizetlen gép), egyszerűen
 * BEÍRHATTA a sütit, és a PIN második faktora nélkül kapott god-mode-ot.
 *
 * Mostantól: az érték `<lejárat-epoch-ms>.<HMAC-SHA256(userId.lejárat)>`.
 * A kulcsot a SUPABASE_SERVICE_ROLE_KEY-ből deriváljuk (a szerveren kívül
 * senki nem ismeri), így a sütit csak a szerver tudja kiállítani, és más
 * felhasználó nevére nem játszható át. A régi, aláíratlan sütik érvénytelenek
 * (fail-closed) — az élesítés után egyszer újra be kell írni a PIN-t.
 */

export const GOD_MODE_COOKIE = 'god_mode_until'

let cachedKey: Buffer | null = null

function signingKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  cachedKey = secret
    ? createHmac('sha256', secret).update('kartoteka-god-mode-cookie-v1').digest()
    : // Fejlesztői gép service-kulcs nélkül: folyamatonkénti véletlen kulcs.
      // A munkamenet a dev-szerver újraindításáig él — élesben a Railway
      // env-ben mindig ott a service-kulcs.
      randomBytes(32)
  return cachedKey
}

function hmacFor(userId: string, expiresAtMs: number): Buffer {
  return createHmac('sha256', signingKey()).update(`${userId}.${expiresAtMs}`).digest()
}

export function signGodModeCookieValue(userId: string, expiresAtMs: number): string {
  return `${expiresAtMs}.${hmacFor(userId, expiresAtMs).toString('hex')}`
}

/**
 * Visszaadja a lejáratot (epoch ms), ha a süti aláírása érvényes, a megadott
 * felhasználóhoz tartozik és még nem járt le — egyébként null.
 */
export function verifyGodModeCookieValue(
  value: string | undefined,
  userId: string | null | undefined,
): number | null {
  if (!value || !userId) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null // örökölt, aláíratlan formátum → érvénytelen
  const expiresAtMs = Number(value.slice(0, dot))
  if (!Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs) return null
  const givenMac = Buffer.from(value.slice(dot + 1), 'hex')
  const expectedMac = hmacFor(userId, expiresAtMs)
  if (givenMac.length !== expectedMac.length) return null
  return timingSafeEqual(givenMac, expectedMac) ? expiresAtMs : null
}
