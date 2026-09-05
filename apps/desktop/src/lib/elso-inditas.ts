/**
 * ELSŐ INDÍTÁS varázsló — állapot-segédek (2026-09-05).
 *
 * A varázsló maga a `pages/elso-inditas-page.tsx`; itt csak az él, amit más
 * oldalak is használnak (login-page, pin-entry-page, auth-gate):
 *  · az útvonal;
 *  · a „folyamatban" jelző (sessionStorage — a jelszavas belépés a varázslóból
 *    indulva a varázslóhoz tér vissza, nem a főoldalra);
 *  · a „kész" jelző a LOKÁLIS settings-táblában, felhasználónként. NEM
 *    localStorage (az nem felhasználóhoz kötött) és NEM a profiles
 *    onboarding_completed_at (az a WEBES welcome-varázsló kapuja). A
 *    tükör-tulajdonos váltása a settings-táblát is üríti → új felhasználó
 *    újra kapja a varázslót, ami helyes.
 */

import { getSetting, setSetting } from './local-db'

export const ELSO_INDITAS_UT = '/elso-inditas'

/** A varázsló séma-verziója — ha a lépések változnak, a régi „kész" nem számít. */
export const ELSO_INDITAS_VERZIO = 1

const SS_FOLYAMATBAN = 'kartoteka-elso-inditas-folyamatban'

export function varazsloFolyamatban(): boolean {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(SS_FOLYAMATBAN) === '1'
}

export function jelolVarazsloFolyamatban(be: boolean): void {
  if (typeof window === 'undefined') return
  if (be) window.sessionStorage.setItem(SS_FOLYAMATBAN, '1')
  else window.sessionStorage.removeItem(SS_FOLYAMATBAN)
}

function keszKulcs(userId: string): string {
  return `onboarding:done:${userId}`
}

export async function varazsloKeszE(userId: string): Promise<boolean> {
  try {
    const raw = await getSetting(keszKulcs(userId))
    if (!raw) return false
    const parsed = JSON.parse(raw) as { verzio?: number }
    return (parsed.verzio ?? 0) >= ELSO_INDITAS_VERZIO
  } catch {
    return false
  }
}

export async function jelolVarazsloKesz(userId: string): Promise<void> {
  try {
    await setSetting(keszKulcs(userId), JSON.stringify({ verzio: ELSO_INDITAS_VERZIO, mikor: new Date().toISOString() }))
  } catch {
    /* a jelző best-effort — a varázsló a PIN-hiány alapján amúgy sem jön elő újra */
  }
}

/** „Varázsló újrafuttatása" (Beállítások) — a jelző törlése. */
export async function torolVarazsloKesz(userId: string): Promise<void> {
  try {
    await setSetting(keszKulcs(userId), '')
  } catch {
    /* best-effort */
  }
}
