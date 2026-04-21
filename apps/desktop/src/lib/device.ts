import { invoke } from '@tauri-apps/api/core'

import { errorMessage } from './error'
import { getDesktopSupabase } from './supabase'

/**
 * Kartotéka Desktop — eszköz-bind (M3.3).
 *
 * Minden Kartotéka-telepítés az első indításkor:
 *   1. Generál egy stabil device-id-t (UUID-v4) és egy Ed25519 keypairt
 *      (a Rust oldal intézi — `@tauri-apps/api`-on át invoke-olva)
 *   2. A privát kulcs az OS-szintű keyringben marad (DPAPI per-user)
 *   3. A publikus kulcs + eszköz-fingerprint egy Supabase `user_devices`
 *      sor — admin később revoke-olhatja
 *
 * Az M3.4+ tervezett:
 *   - Aláírt outbox-payload a user privkey-vel
 *   - Doc-titkosítás eszköz-kulccsal (E2E)
 *   - Admin revoke → a kliens detektálja és sign-out
 */

export interface DeviceInfo {
  id: string
  fingerprint: string
  public_key_b64: string
  platform: string
  created_now: boolean
}

export interface RegisteredDevice {
  id: string
  user_id: string
  device_fingerprint: string
  device_name: string | null
  platform: string
  public_key: string
  registered_at: string
  last_seen: string | null
  revoked: boolean
}

/** Kikéri a Rust-oldali eszköz-infot (id, fingerprint, pubkey). */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  return invoke<DeviceInfo>('device_info')
}

/**
 * Ha az eszköz még nincs regisztrálva a Supabase-re (`user_devices` sor),
 * beinsertáljuk. Idempotens: ha már van, nem csinál semmit.
 *
 * A `user_devices.id` NEM a kliens-oldali UUID — a Supabase generálja.
 * A `device_fingerprint` UNIQUE a `user_id`-vel együtt: ha ugyanarról az
 * eszközről bejön még egy regisztrációs kísérlet, a Supabase elutasítja
 * (dupla-regisztráció ellen).
 */
export async function ensureDeviceRegistered(
  userId: string,
): Promise<{ registered: boolean; device_row_id: string | null; error?: string }> {
  try {
    const info = await getDeviceInfo()
    const supabase = getDesktopSupabase()

    // Van-e már regisztrált eszköz ezzel a fingerprint-tel?
    const { data: existing, error: readErr } = await supabase
      .from('user_devices')
      .select('id, revoked')
      .eq('user_id', userId)
      .eq('device_fingerprint', info.fingerprint)
      .maybeSingle()

    if (readErr) {
      return { registered: false, device_row_id: null, error: errorMessage(readErr) }
    }

    if (existing && !(existing as { revoked: boolean }).revoked) {
      // Már regisztrált — csak frissítsük a last_seen-t
      const row = existing as { id: string }
      await supabase
        .from('user_devices')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', row.id)
      return { registered: false, device_row_id: row.id }
    }

    // Új regisztráció
    const deviceName =
      (typeof navigator !== 'undefined' && navigator.platform) || info.platform

    // A public_key-t bytea-nak várja a Supabase. A kliens oldalról base64-string-ként
    // küldjük — a Supabase a `\x<hex>` vagy base64 formát is elfogadja a REST-en keresztül.
    // Biztonság kedvéért base64-decode → hex string.
    const publicKeyHex = base64ToHex(info.public_key_b64)

    const { data: inserted, error: insertErr } = await supabase
      .from('user_devices')
      .insert({
        user_id: userId,
        device_fingerprint: info.fingerprint,
        device_name: deviceName,
        platform: info.platform,
        public_key: `\\x${publicKeyHex}`, // Postgres bytea hex literal
        last_seen: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr) {
      return { registered: false, device_row_id: null, error: errorMessage(insertErr) }
    }

    return {
      registered: true,
      device_row_id: (inserted as { id: string }).id,
    }
  } catch (err: unknown) {
    return { registered: false, device_row_id: null, error: errorMessage(err) }
  }
}

/**
 * Gyors lekérdezés: revoked-e a jelenlegi eszköz a Supabase-ben?
 *
 * A hardware-fingerprint + user_id alapján keresi a sort. Három kimenet:
 *   - `{ known: true, revoked: false, ... }` — aktív, minden rendben
 *   - `{ known: true, revoked: true, reason, revokedAt }` — az admin visszavonta
 *   - `{ known: false }` — még nincs regisztrálva (pl. az `ensureDeviceRegistered`
 *     még nem futott), vagy a Supabase nem elérhető
 *
 * Ezt a Dashboard periodikusan (pl. 30 sec) hívja. Ha `revoked === true`,
 * sign-out kell + a user értesítése, hogy a gépet letiltották.
 */
export interface DeviceRevokeStatus {
  known: boolean
  revoked: boolean
  reason?: string | null
  revokedAt?: string | null
  deviceRowId?: string | null
}

export async function checkDeviceRevokeState(userId: string): Promise<DeviceRevokeStatus> {
  try {
    const info = await getDeviceInfo()
    const supabase = getDesktopSupabase()
    const { data, error } = await supabase
      .from('user_devices')
      .select('id, revoked, revoke_reason, revoked_at')
      .eq('user_id', userId)
      .eq('device_fingerprint', info.fingerprint)
      .maybeSingle()

    if (error || !data) {
      return { known: false, revoked: false }
    }

    const row = data as {
      id: string
      revoked: boolean
      revoke_reason: string | null
      revoked_at: string | null
    }
    return {
      known: true,
      revoked: row.revoked,
      reason: row.revoke_reason,
      revokedAt: row.revoked_at,
      deviceRowId: row.id,
    }
  } catch {
    return { known: false, revoked: false }
  }
}

/** Lekéri a user összes eszközét a Supabase-ről. */
export async function getMyDevices(userId: string): Promise<RegisteredDevice[]> {
  const supabase = getDesktopSupabase()
  const { data, error } = await supabase
    .from('user_devices')
    .select(
      'id, user_id, device_fingerprint, device_name, platform, public_key, registered_at, last_seen, revoked',
    )
    .eq('user_id', userId)
    .order('registered_at', { ascending: false })

  if (error) {
    throw new Error(errorMessage(error))
  }
  return (data ?? []) as RegisteredDevice[]
}

function base64ToHex(b64: string): string {
  const bytes =
    typeof atob === 'function'
      ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      : new Uint8Array(Buffer.from(b64, 'base64'))
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}
