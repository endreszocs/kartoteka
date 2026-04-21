/**
 * License check — server-side fs alapú ellenőrzés.
 *
 * A middleware Edge runtime-on fut, ami NEM támogatja a `fs`-t.
 * Ezért a tényleges `data/license.dat` fájl check itt történik
 * (Node runtime), és beállít egy `KARTOTEKA_LICENSE_OK` env var-t,
 * amit a middleware olvas.
 *
 * Ezt a függvényt:
 *  - Az Next.js server startup-ja hívja (a `server.js` mellé inject-elve)
 *  - VAGY minden server component init-jén (de az lassú)
 *
 * Fázis 7c: ez a check bővül a JWT-validátorral.
 * Most (7b): csak fs.existsSync — ha van license.dat, beállítja a flag-et.
 */

import fs from 'fs'
import path from 'path'

import { isStandaloneMode, getDataDir } from './runtime-detect'
import { getMachineFingerprint } from './machine-fingerprint'
import {
  validateLicenseToken,
  type LicenseValidationResult,
} from './license-jwt'

let cachedCheck: { hasLicense: boolean; checkedAt: number } | null = null
const CACHE_TTL_MS = 60_000 // 1 perc

export interface LicenseCheckResult {
  hasLicense: boolean
  reason: 'no_license_file' | 'valid' | 'not_standalone'
  licenseContent?: string // 7c-ben lesz JWT payload
}

/**
 * Olcsó JWT-struktúra ellenőrzés — nem verify (nincs public key), csak
 * azt nézi, hogy a fájl tartalma valóban 3 pontos-elválasztott base64url
 * szakaszokból áll. Célja: a durván korrupt (átírt, sérült) license.dat
 * fájlokat még a middleware előtt detektálni, hogy a user ne rekedjen
 * egy "file exists but garbage" állapotban végtelen redirect-ben.
 */
function isJwtStructureValid(content: string): boolean {
  const trimmed = content.trim()
  if (trimmed.length < 20) return false
  const parts = trimmed.split('.')
  if (parts.length !== 3) return false
  // Mind a 3 résznek base64url-nek kell lennie (csak A-Z, a-z, 0-9, -, _)
  const base64urlRe = /^[A-Za-z0-9_-]+$/
  return parts.every(p => p.length > 0 && base64urlRe.test(p))
}

export function checkLicensePresent(opts: { skipCache?: boolean } = {}): LicenseCheckResult {
  if (!isStandaloneMode()) {
    return { hasLicense: true, reason: 'not_standalone' }
  }

  // Cache (az fs-t nem hívjuk minden server request-re)
  if (!opts.skipCache && cachedCheck && Date.now() - cachedCheck.checkedAt < CACHE_TTL_MS) {
    return {
      hasLicense: cachedCheck.hasLicense,
      reason: cachedCheck.hasLicense ? 'valid' : 'no_license_file',
    }
  }

  const licensePath = path.join(getDataDir(), 'license.dat')
  let hasLicense = fs.existsSync(licensePath)

  // FONTOS: fájl létezik ≠ licensz érvényes. Ha a tartalom NEM JWT struktúrájú
  // (törött, átírt, encoding-hiba), kezeljük NEM-licensz-ként, hogy a
  // middleware a /welcome-ra tudjon redirectálni — különben a user végtelen
  // redirect-loop-ba kerülne.
  if (hasLicense) {
    try {
      const content = fs.readFileSync(licensePath, 'utf8')
      if (!isJwtStructureValid(content)) {
        hasLicense = false
      }
    } catch {
      // Olvasási hiba (permissions, encoding) → szintén nem-licensz
      hasLicense = false
    }
  }

  cachedCheck = { hasLicense, checkedAt: Date.now() }

  // Middleware-nek jelezzük env var-on keresztül (az Edge runtime olvashatja)
  if (hasLicense) {
    process.env.KARTOTEKA_LICENSE_OK = 'true'
  } else {
    delete process.env.KARTOTEKA_LICENSE_OK
  }

  return {
    hasLicense,
    reason: hasLicense ? 'valid' : 'no_license_file',
  }
}

/**
 * Cache invalidáció — license.dat létrehozása/törlése után hívandó.
 */
export function invalidateLicenseCache(): void {
  cachedCheck = null
  delete process.env.KARTOTEKA_LICENSE_OK
}

/**
 * License.dat írása (Fázis 7c-ben a JWT-t is validálja majd).
 */
export function writeLicenseFile(token: string): void {
  if (!isStandaloneMode()) {
    throw new Error('writeLicenseFile() csak standalone módban használható')
  }
  // Sanity check: NE írjunk korrupt tartalmat a license.dat-ba, különben a
  // user zárt redirect-loopba kerülne. Az endpoint-hoz belépő értéknek már
  // kell JWT-strukturális ellenőrzést kiállnia.
  if (!isJwtStructureValid(token)) {
    throw new Error(
      'writeLicenseFile(): a megkapott token nem JWT-strukturájú — érvénytelen licensz',
    )
  }
  const licensePath = path.join(getDataDir(), 'license.dat')
  fs.writeFileSync(licensePath, token.trim(), 'utf8')
  invalidateLicenseCache()
  // Azonnal fel-flag-eljük hogy a middleware is tudja
  process.env.KARTOTEKA_LICENSE_OK = 'true'
}

/**
 * License.dat törlése (pl. user kilép, újra regisztrálni akar).
 */
export function deleteLicenseFile(): void {
  if (!isStandaloneMode()) return
  const licensePath = path.join(getDataDir(), 'license.dat')
  if (fs.existsSync(licensePath)) {
    fs.unlinkSync(licensePath)
  }
  invalidateLicenseCache()
}

/**
 * Teljes licensz-validáció:
 *   1. Beolvassa a license.dat-ot
 *   2. Validálja a JWT-t (signature + fingerprint + lejárat)
 *   3. Visszaadja a státuszt (normal/warning/degraded/read_only/blocked)
 *
 * Ezt a server components és API route-ok hívják minden védendő művelet előtt.
 */
export async function validateCurrentLicense(): Promise<LicenseValidationResult> {
  if (!isStandaloneMode()) {
    return {
      valid: true,
      status: 'normal', // server mode-ban mindig engedélyezett
    }
  }

  const licensePath = path.join(getDataDir(), 'license.dat')
  if (!fs.existsSync(licensePath)) {
    return {
      valid: false,
      status: 'missing',
      reason: 'A license.dat fájl nem található — az első indítási varázsló még nem futott le',
    }
  }

  try {
    const token = fs.readFileSync(licensePath, 'utf8').trim()
    const currentFingerprint = getMachineFingerprint()
    return await validateLicenseToken(token, currentFingerprint)
  } catch (e) {
    return {
      valid: false,
      status: 'invalid',
      reason: e instanceof Error ? e.message : 'Ismeretlen hiba a licensz olvasása közben',
    }
  }
}
