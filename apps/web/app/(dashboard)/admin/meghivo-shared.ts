/**
 * Admin-meghívó — közös típusok és validációs helperek (2026-08-09).
 *
 * A Next.js 16 szabály miatt a 'use server' fájl (meghivo-actions.ts) csak
 * async függvényeket exportálhat — a típusok és konstansok itt élnek, a
 * kliens-dialog és a szerver-action közösen importálja őket.
 */

/** A meghívott neve mező maximális hossza. */
export const INVITE_NAME_MAX = 120

/** A személyes üzenet maximális hossza. */
export const INVITE_MESSAGE_MAX = 1000

export interface InviteInput {
  /** A meghívott e-mail-címe (kötelező). */
  email: string
  /** A meghívott neve (opcionális — megszólításhoz). */
  name?: string
  /** Az admin személyes üzenete (opcionális — idézetként kerül a levélbe). */
  personalMessage?: string
}

export interface InviteResult {
  success?: boolean
  /** Magyar nyelvű hibaüzenet, ha a küldés nem sikerült. */
  error?: string
}

// Egyszerű, gyakorlatias e-mail minta — a végleges ellenőrzést úgyis a
// levélküldő provider végzi; itt csak az elgépeléseket szűrjük ki.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidInviteEmail(email: string): boolean {
  const e = email.trim()
  return e.length > 3 && e.length <= 254 && EMAIL_RE.test(e)
}
