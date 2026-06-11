/**
 * verified-session — szinkron-biztonsági őr (2026-06-11, Endre kérése:
 * „A szinkronizáció a Supabase adatbázissal csak akkor történhet meg, ha
 * biztosan helyesen van belépve!").
 *
 * MINDEN felhő-írás (push-szinkron) előtt három ellenőrzés fut:
 *   1. VAN-E érvényes Supabase-session (timeouttal — sosem blokkol);
 *   2. NEM JÁRT-E LE (a getSession maga frissít, ha tud — ha nem tud,
 *      nem ad sessiont);
 *   3. FIÓK-EGYEZŐSÉG: a bejelentkezett fiók AZONOS-e azzal, akihez a gépen
 *      tárolt (SQLCipher) adatok tartoznak. Ha valaki MÁS fiókkal lép be
 *      ugyanazon a gépen, a helyi függő tételek NEM kerülhetnek fel az ő
 *      nevében / másik gyülekezet adatbázisába — a szinkron leáll, látható
 *      magyarázattal (sosem csendben).
 *
 * A fiók-egyezőség forrása: a legutóbbi sikeres belépés cache-e
 * (`getLastUser`), tartalékként az egyetlen lokális profil. Ha egyik sincs
 * (vadonatúj gép), az egyezőség-ellenőrzés átengedő — az első belépés
 * határozza meg a gép felhasználóját.
 */

import type { Session } from '@supabase/supabase-js'

import { getLastUser } from './desktop-user'
import { dbSelect } from './local-db'
import { getDesktopSupabase } from './supabase'

const GET_SESSION_TIMEOUT_MS = 4000

export type VerifiedSessionResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'no-session' | 'user-mismatch'; message: string }

async function getDeviceUserId(): Promise<string | null> {
  const cached = getLastUser()
  if (cached) return cached.id
  try {
    const rows = await dbSelect<{ id: string }>(
      `SELECT id FROM profiles_local LIMIT 2`,
      [],
    )
    return rows.length === 1 ? rows[0].id : null
  } catch {
    return null
  }
}

/**
 * Hitelesített és fiók-egyező session — vagy érthető ok, miért nem.
 * A hívó (push-szinkron) `ok: false` esetén NEM ír a felhőbe.
 */
export async function getVerifiedSession(): Promise<VerifiedSessionResult> {
  let session: Session | null = null
  try {
    const supabase = getDesktopSupabase()
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), GET_SESSION_TIMEOUT_MS)
      }),
    ])
    session = result && 'data' in result ? result.data.session : null
  } catch {
    session = null
  }

  if (!session) {
    return {
      ok: false,
      reason: 'no-session',
      message:
        'Nincs érvényes online bejelentkezés — a szinkron a következő sikeres belépésig várakozik.',
    }
  }

  const deviceUserId = await getDeviceUserId()
  if (deviceUserId && deviceUserId !== session.user.id) {
    return {
      ok: false,
      reason: 'user-mismatch',
      message:
        'Más fiókkal vagy bejelentkezve, mint amelyikhez a gépen tárolt adatok tartoznak — a szinkron biztonsági okból szünetel. Jelentkezz be a saját fiókoddal, vagy kérj adattörlést a rendszergazdától.',
    }
  }

  return { ok: true, session }
}
