import 'server-only'

/**
 * A MENTÉS-RENDSZER SZERVER-KULCSA (2026-08-11).
 *
 * ⛔ NULLA FALLBACK. A `lib/supabase/secret-vault.ts:22` ma
 * `VAULT_ENCRYPTION_KEY || GOD_MODE_PIN` fallbackot enged — egy 6 jegyű PIN-t
 * használ titkosítási kulcsnak. Ezt az anti-mintát itt SZÁNDÉKOSAN nem
 * vesszük át: hiányzó vagy nem 32 bájtos kulcsnál HANGOS hibával megállunk.
 *
 * MIT VÉD EZ A KULCS
 * ──────────────────
 *  1) a Google Drive refresh tokent (nyugalmi állapotban, a `backup_settings`
 *     táblában — egy adatbázis-szivárgás önmagában NE adjon Drive-hozzáférést),
 *  2) a mentési jelszó ellenőrző hash-ét (HMAC-kulcsként),
 *  3) (a párhuzamos ágon) a mentés-fájlok adatkulcsát.
 *
 * SOHA NEM KERÜL NAPLÓBA: sem a kulcs, sem a HOSSZA, sem az ELŐTAGJA.
 * A hibaüzenet csak annyit mond, hogy hiányzik vagy rossz méretű.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const KULCS_BAJT = 32
const SO_BAJT = 16
const IV_BAJT = 12
const TAG_BAJT = 16

/** A Drive refresh token burkoló kulcsának HKDF `info` címkéje. */
export const DRIVE_TOKEN_INFO = 'kartoteka-drive-token-v1'
/** A Drive refresh token AES-GCM AAD-je. */
export const DRIVE_TOKEN_AAD = 'drive|1'

/**
 * Betölti a szerver-kulcsot. Elfogad 64 hex karaktert vagy 32 bájtra fejtődő
 * base64-et. Bármi más → HIBA (nem csonkolunk, nem toldunk).
 */
export function loadServerBackupKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY?.trim() ?? ''
  if (raw.length === 0) {
    throw new Error(
      'A BACKUP_ENCRYPTION_KEY környezeti változó nincs beállítva. ' +
        'A biztonsági mentés e nélkül nem indulhat el — nincs helyettesítő kulcs. ' +
        'Előállítás: openssl rand -hex 32',
    )
  }

  let key: Buffer | null = null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    try {
      const decoded = Buffer.from(raw, 'base64')
      if (decoded.length === KULCS_BAJT) key = decoded
    } catch {
      key = null
    }
  }

  if (!key || key.length !== KULCS_BAJT) {
    throw new Error(
      'A BACKUP_ENCRYPTION_KEY nem 32 bájtos kulcs. ' +
        'Várt formátum: 64 hexadecimális karakter (openssl rand -hex 32) ' +
        'vagy 32 bájtra fejtődő base64. A mentés fail-closed leállt.',
    )
  }
  return key
}

/** Van-e egyáltalán használható szerver-kulcs? (Csak igen/nem — méret nélkül.) */
export function hasServerBackupKey(): boolean {
  try {
    loadServerBackupKey()
    return true
  } catch {
    return false
  }
}

function deriveKek(salt: Buffer, info: string): Buffer {
  const master = loadServerBackupKey()
  return Buffer.from(hkdfSync('sha256', master, salt, info, KULCS_BAJT))
}

/**
 * Titok titkosítása nyugalmi tároláshoz.
 * Formátum: `salt(16) ‖ iv(12) ‖ tag(16) ‖ ciphertext`.
 *
 * Az `info` (HKDF) és az `aad` (AES-GCM) együtt köti a titkot a
 * FELHASZNÁLÁSI HELYÉHEZ: egy Drive-tokent nem lehet máshol visszafejteni.
 */
export function encryptSecret(plain: string, info: string, aad: string): Buffer {
  const salt = randomBytes(SO_BAJT)
  const iv = randomBytes(IV_BAJT)
  const kek = deriveKek(salt, info)
  const cipher = createCipheriv('aes-256-gcm', kek, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([salt, iv, tag, ct])
}

/** A fenti visszafejtése. Sérült/idegen adaton DOB — nem ad üres stringet. */
export function decryptSecret(blob: Buffer, info: string, aad: string): string {
  const minimum = SO_BAJT + IV_BAJT + TAG_BAJT
  if (blob.length <= minimum) {
    throw new Error('A tárolt titok sérült (túl rövid).')
  }
  const salt = blob.subarray(0, SO_BAJT)
  const iv = blob.subarray(SO_BAJT, SO_BAJT + IV_BAJT)
  const tag = blob.subarray(SO_BAJT + IV_BAJT, minimum)
  const ct = blob.subarray(minimum)
  const kek = deriveKek(salt, info)
  const decipher = createDecipheriv('aes-256-gcm', kek, iv)
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ─────────────────────────────────────────────────────────────────────────────
// PostgREST `bytea` átjáró
// ─────────────────────────────────────────────────────────────────────────────
// A PostgREST a bytea oszlopokat `\x<hex>` alakú SZÖVEGKÉNT adja és várja.
// Ha ezt elrontjuk, a token némán olvashatatlanná válik — ezért egy helyen van.

export function bufferToPgBytea(buf: Buffer): string {
  return `\\x${buf.toString('hex')}`
}

export function pgByteaToBuffer(value: unknown): Buffer | null {
  if (typeof value !== 'string') return null
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null
  return Buffer.from(hex, 'hex')
}
