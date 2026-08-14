import 'server-only'

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * PIN/titok-hash segédek (2026-08-15, 8. pont D).
 *
 * Formátum: `scrypt$<salt-hex>$<hash-hex>` — ugyanaz a modell, mint a
 * 2FA-mentőkódoknál (profile/biztonsag/actions.ts). A god-mode PIN tárolása
 * ezt használja; a nyers (6 számjegyű) örökölt értéket az aktiválás sikeres
 * PIN-egyezés után írja át hash-re (lusta felminősítés).
 */

const SCRYPT_KEYLEN = 32

export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(secret, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function isHashedSecret(stored: string): boolean {
  return stored.startsWith('scrypt$')
}

export function secretMatches(candidate: string, stored: string): boolean {
  if (!isHashedSecret(stored)) return false
  const [, salt, hash] = stored.split('$')
  if (!salt || !hash) return false
  const candidateHash = scryptSync(candidate, salt, SCRYPT_KEYLEN)
  const storedHash = Buffer.from(hash, 'hex')
  if (candidateHash.length !== storedHash.length) return false
  return timingSafeEqual(candidateHash, storedHash)
}

// Per-process só a nyers-szöveg összevetéshez: a két oldalt azonos hosszú
// kulccsá képezzük, így a timingSafeEqual hossz-feltétele mindig teljesül,
// és az összevetés ideje nem függ attól, hányadik karakternél tér el.
const PROCESS_SALT = randomBytes(16).toString('hex')

/**
 * Konstans idejű szöveg-egyezés az ÖRÖKÖLT (még nyersen tárolt) titkokhoz.
 * Új tárolásra SOHA ne ezt használd — arra a hashSecret/secretMatches való.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  const ah = scryptSync(a, PROCESS_SALT, SCRYPT_KEYLEN)
  const bh = scryptSync(b, PROCESS_SALT, SCRYPT_KEYLEN)
  return timingSafeEqual(ah, bh)
}
