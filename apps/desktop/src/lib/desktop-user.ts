/**
 * desktop-user — felhasználó-azonosítás OFFLINE-barát módon (2026-06-11).
 *
 * A 0.9.0 előtti kritikus hiba gyökere: a `DesktopShell` (és 14 oldal) a
 * `supabase.auth.getUser()`-re várt — PIN-es offline belépésnél viszont NINCS
 * Supabase session, így `user = null` maradt, a lokális profil sosem töltődött
 * be, és a képernyő örökre „Betöltés…"-en ragadt (hiba-üzenet nélkül).
 *
 * A megoldás háromlépcsős feloldás:
 *   1. `supabase.auth.getUser()` — 4 mp-es timeouttal (lassú hálózaton se
 *      blokkoljon); online sikerkor a user-t CACHE-eljük (localStorage).
 *   2. Offline-módban: a legutóbbi sikeres belépés cache-elt usere.
 *   3. Ha az sincs (régebbi verzióról frissült gép): a lokális SQLCipher
 *      `profiles_local` tábla — ha PONTOSAN EGY profil van benne, az a miénk
 *      (a desktop DB gépenként egy-felhasználós; kijelentkezéskor törlődik).
 *
 * A visszaadott objektum offline-ágon egy minimál `User`-kompatibilis váz —
 * a hívók kizárólag az `id`-t (lokális SQLite-kulcs) és az `email`-t használják.
 */

import type { User } from '@supabase/supabase-js'

import { isOfflineMode } from './auth-pin'
import { dbSelect } from './local-db'
import { getDesktopSupabase } from './supabase'

const LS_LAST_USER = 'kartoteka-last-user-v1'
const GET_USER_TIMEOUT_MS = 4000

export interface LastUser {
  id: string
  email: string | null
}

export function saveLastUser(user: { id: string; email?: string | null }): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      LS_LAST_USER,
      JSON.stringify({ id: user.id, email: user.email ?? null }),
    )
  } catch {
    /* csendes — a cache best-effort */
  }
}

export function getLastUser(): LastUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LS_LAST_USER)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LastUser
    return parsed && typeof parsed.id === 'string' && parsed.id ? parsed : null
  } catch {
    return null
  }
}

export function clearLastUser(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(LS_LAST_USER)
}

/** Minimál User-váz az offline-ághoz — a hívók csak id-t/email-t használnak. */
function offlineUserShell(id: string, email: string | null): User {
  return {
    id,
    email: email ?? undefined,
    app_metadata: {},
    user_metadata: {},
    aud: 'offline',
    created_at: '',
  } as unknown as User
}

/**
 * A lokális profil-tábla egyetlen sora, ha pontosan egy van — a frissítés
 * előtti gépeken ez adja vissza az offline usert az első cache-elés előtt.
 */
async function getSingleLocalProfile(): Promise<LastUser | null> {
  try {
    const rows = await dbSelect<{ id: string; email: string | null }>(
      `SELECT id, email FROM profiles_local LIMIT 2`,
      [],
    )
    if (rows.length === 1 && rows[0].id) {
      return { id: rows[0].id, email: rows[0].email ?? null }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Felhasználó feloldása online VAGY offline. SOSEM blokkol 4 mp-nél tovább.
 * Null csak akkor, ha sem session, sem offline-mód+cache/lokális profil nincs —
 * ilyenkor a hívó LÁTHATÓ hibát mutasson (ne végtelen töltést!).
 */
export async function getDesktopUser(): Promise<User | null> {
  // 1) Supabase getUser — timeouttal
  try {
    const supabase = getDesktopSupabase()
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), GET_USER_TIMEOUT_MS)
      }),
    ])
    const user = result && 'data' in result ? result.data.user : null
    if (user) {
      saveLastUser({ id: user.id, email: user.email ?? null })
      return user
    }
  } catch {
    /* hálózati / session-hiba — jön az offline-feloldás */
  }

  // 2-3) Offline-mód: cache → egyetlen lokális profil
  if (isOfflineMode()) {
    const cached = getLastUser()
    if (cached) return offlineUserShell(cached.id, cached.email)

    const localProfile = await getSingleLocalProfile()
    if (localProfile) {
      saveLastUser(localProfile)
      return offlineUserShell(localProfile.id, localProfile.email)
    }
  }

  return null
}
