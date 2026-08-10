'use server'

import { cookies } from 'next/headers'

import { logAuditEvent } from '@/lib/audit/log'
import { isMasterAdmin } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const SETTINGS_TABLE = 'system_settings'
const GOD_MODE_SETTINGS_KEY = 'god_mode_pin'
const GOD_MODE_DURATION_MS = 2 * 60 * 60 * 1000

// BIZTONSÁGI FIX 2026-08-11 (#11): brute-force védelem a god mode PIN-re.
//
// Ami rossz volt: a delegált import útvonalán (delegated-import/actions.ts) MÁR
// volt audit-log alapú sebességkorlát, a god mode aktiválásán viszont SEMMI —
// pedig ez a magasabb jogosultságú kapu. Egy 6 jegyű PIN korlátlan
// próbálkozással percek alatt kitalálható.
//
// Miért jó így: ugyanaz az audit-log alapú számláló, mint a delegált importnál
// (nem kell új tábla), és a sikeres/sikertelen aktiválás is naplózódik, tehát a
// támadási kísérlet láthatóvá válik az /admin/naplo felületen.
const MAX_FAILED_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000 // 10 perc
const AUDIT_ACTION_SUCCESS = 'god_mode_activate_success'
const AUDIT_ACTION_FAILED = 'god_mode_activate_failed'

// BIZTONSÁGI MEGJEGYZÉS: a rendszer NEM tartalmaz alapértelmezett PIN-t.
// A god mode aktiválásához kötelezően be kell állítani vagy a GOD_MODE_PIN
// környezeti változót, vagy az adatbázisban a `system_settings` tábla
// 'god_mode_pin' kulcsú sorát. Ha egyik sem elérhető, a god mode letiltva.
type PinSource = 'database' | 'env' | 'none'

function normalizePin(pin: string) {
  return pin.replace(/\D/g, '').slice(0, 6)
}

function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin)
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() || ''
  return error?.code === '42P01' || message.includes('relation') || message.includes('does not exist')
}

function isPermissionError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() || ''
  return error?.code === '42501' || message.includes('permission denied') || message.includes('not allowed')
}

async function requireMasterAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isMasterAdmin(user.email)) {
    return { error: 'Nincs jogosultságod ehhez a művelethez.' as const }
  }

  return { supabase, user }
}

interface StoredPinResult {
  pin: string | null
  source: PinSource
  schemaReady: boolean
  warning?: string
}

async function readStoredPin(): Promise<StoredPinResult> {
  const envPin = process.env.GOD_MODE_PIN && isValidPin(process.env.GOD_MODE_PIN)
    ? normalizePin(process.env.GOD_MODE_PIN)
    : null
  const adminSupabase = createAdminClient()

  // Ha nincs service_role client, csak az env-re támaszkodhatunk
  if (!adminSupabase) {
    if (envPin) {
      return { pin: envPin, source: 'env', schemaReady: true }
    }
    return {
      pin: null,
      source: 'none',
      schemaReady: true,
      warning:
        'A rendszergazdai PIN nincs beállítva. Állítsd be a GOD_MODE_PIN környezeti változót, vagy vedd fel a system_settings tábla `god_mode_pin` sorát.',
    }
  }

  const result = await adminSupabase
    .from(SETTINGS_TABLE)
    .select('value')
    .eq('key', GOD_MODE_SETTINGS_KEY)
    .maybeSingle()

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      if (envPin) {
        return {
          pin: envPin,
          source: 'env',
          schemaReady: false,
          warning:
            'A tartós rendszergazdai PIN tárolásához még le kell futtatni a kiegészítő SQL-t. Addig a rendszer a GOD_MODE_PIN környezeti változót használja.',
        }
      }
      return {
        pin: null,
        source: 'none',
        schemaReady: false,
        warning:
          'A system_settings tábla még nem létezik, és a GOD_MODE_PIN környezeti változó sincs beállítva — a god mode addig le van tiltva.',
      }
    }

    if (isPermissionError(result.error)) {
      if (envPin) {
        return {
          pin: envPin,
          source: 'env',
          schemaReady: true,
          warning:
            'A rendszergazdai PIN táblája létezik, de az olvasás nem sikerült. A rendszer a GOD_MODE_PIN környezeti változóra esik vissza.',
        }
      }
      return {
        pin: null,
        source: 'none',
        schemaReady: true,
        warning:
          'A rendszergazdai PIN táblája létezik, de az olvasás nem sikerült, és nincs környezeti változós tartalék — a god mode addig le van tiltva.',
      }
    }

    if (envPin) {
      return { pin: envPin, source: 'env', schemaReady: true, warning: result.error.message }
    }
    return {
      pin: null,
      source: 'none',
      schemaReady: true,
      warning: result.error.message,
    }
  }

  const storedValue = typeof result.data?.value === 'string' ? normalizePin(result.data.value) : ''
  if (isValidPin(storedValue)) {
    return { pin: storedValue, source: 'database', schemaReady: true }
  }

  // Nincs DB érték — env fallback
  if (envPin) {
    return { pin: envPin, source: 'env', schemaReady: true }
  }

  return {
    pin: null,
    source: 'none',
    schemaReady: true,
    warning: 'A rendszergazdai PIN nincs beállítva sem az adatbázisban, sem a GOD_MODE_PIN környezeti változóban.',
  }
}

/**
 * 2026-08-11 (#11): sebességkorlát-ellenőrzés az audit_log alapján.
 *
 * A service-role klienssel olvassuk a user `god_mode_activate_failed`
 * eseményeit az utolsó RATE_LIMIT_WINDOW_MS-ben. Ha elérte a limitet,
 * cooldown-t adunk vissza (a legrégebbi hiba + ablak = mikor lehet újra).
 *
 * Ha nincs service-role kliens (fejlesztői gép), nem blokkolunk — ott a
 * PIN úgyis env-ből jön, és nincs éles adat.
 */
async function checkGodModeRateLimit(
  userId: string,
): Promise<{ allowed: true } | { allowed: false; retryAfterMin: number }> {
  const adminSupabase = createAdminClient()
  if (!adminSupabase) return { allowed: true }

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { data } = await adminSupabase
    .from('audit_log')
    .select('created_at')
    .eq('user_id', userId)
    .eq('action', AUDIT_ACTION_FAILED)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(MAX_FAILED_ATTEMPTS + 1)

  if (!data || data.length < MAX_FAILED_ATTEMPTS) return { allowed: true }

  const oldestMs = new Date(data[0].created_at).getTime()
  const retryAfterMs = Math.max(0, oldestMs + RATE_LIMIT_WINDOW_MS - Date.now())
  const retryAfterMin = Math.max(1, Math.ceil(retryAfterMs / 60_000))
  return { allowed: false, retryAfterMin }
}

export async function activateGodMode(pin: string) {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  // 2026-08-11 (#11): a sebességkorlát MINDEN PIN-összevetés ELŐTT fut.
  const rateLimit = await checkGodModeRateLimit(auth.user.id)
  if (!rateLimit.allowed) {
    return {
      error: `Túl sok hibás PIN-próbálkozás. Próbáld újra ${rateLimit.retryAfterMin} perc múlva.`,
    }
  }

  const cleanedPin = normalizePin(pin)
  if (!isValidPin(cleanedPin)) {
    await logAuditEvent(
      {
        action: AUDIT_ACTION_FAILED,
        targetTable: 'god_mode',
        metadata: { reason: 'invalid_format' },
      },
      auth.supabase,
    )
    return { error: 'A rendszergazdai PIN pontosan 6 számjegyből áll — írd be szóköz nélkül.' }
  }

  const storedPin = await readStoredPin()

  // Ha nincs PIN beállítva (sem env, sem DB), a god mode nem aktiválható
  if (!storedPin.pin) {
    return {
      error:
        storedPin.warning ||
        'A rendszergazdai PIN nincs beállítva. Állítsd be a GOD_MODE_PIN környezeti változót, vagy vedd fel a system_settings tábla `god_mode_pin` sorát.',
    }
  }

  if (cleanedPin !== storedPin.pin) {
    await logAuditEvent(
      {
        action: AUDIT_ACTION_FAILED,
        targetTable: 'god_mode',
        metadata: { reason: 'wrong_pin' },
      },
      auth.supabase,
    )
    return { error: 'Hibás PIN-kód. Ellenőrizd a 6 számjegyet, majd próbáld újra.' }
  }

  const expiresAt = Date.now() + GOD_MODE_DURATION_MS
  const cookieStore = await cookies()
  cookieStore.set('god_mode_until', String(expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GOD_MODE_DURATION_MS / 1000,
  })

  await logAuditEvent(
    {
      action: AUDIT_ACTION_SUCCESS,
      targetTable: 'god_mode',
      metadata: {
        expires_at: new Date(expiresAt).toISOString(),
        session_duration_ms: GOD_MODE_DURATION_MS,
        pin_source: storedPin.source,
      },
    },
    auth.supabase,
  )

  return { success: true, expiresAt }
}

export async function deactivateGodMode() {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const cookieStore = await cookies()
  cookieStore.delete('god_mode_until')

  // BIZTONSÁGI FONTOS: a god mode kilépésekor minden aktív admin_access_requests
  // sort érvényteleníteni kell, ami ehhez a master admin userhez tartozik.
  // Enélkül egy új, nem-god-mode session is automatikusan átlépne a cél
  // gyülekezetbe a 2 órás expiry alatt.
  try {
    await auth.supabase
      .from('admin_access_requests')
      .update({
        status: 'expired',
        expires_at: new Date().toISOString(),
      })
      .eq('admin_user_id', auth.user.id)
      .eq('status', 'approved')
  } catch (err) {
    // Nem kritikus — a cookie már törölve, és a lejárat check is megvéd
    console.warn('[deactivateGodMode] admin_access_requests invalidation failed', err)
  }

  return { success: true }
}

export async function getGodModeStatus(): Promise<{ active: boolean; expiresAt: number | null }> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('god_mode_until')

  if (!cookie?.value) {
    return { active: false, expiresAt: null }
  }

  const expiresAt = Number(cookie.value)
  if (Date.now() >= expiresAt) {
    cookieStore.delete('god_mode_until')
    return { active: false, expiresAt: null }
  }

  return { active: true, expiresAt }
}

/**
 * A PIN-beállítások METAADATAI a Rendszer-oldalnak.
 *
 * BIZTONSÁGI FIX (2026-07-11, admin-redesign): a tényleges PIN értéke SOHA
 * nem megy le a kliensre — csak az, hogy be van-e állítva, honnan jön, és
 * kész-e a séma. A PIN-mező a UI-ban write-only.
 */
export async function getGodModePinSettings() {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const result = await readStoredPin()
  return {
    isSet: Boolean(result.pin),
    source: result.source,
    schemaReady: result.schemaReady,
    warning: result.warning || null,
  }
}

/**
 * 2026-08-11 (#11): ez a függvény KIZÁRÓLAG a `god_mode_pin` sort írja.
 * A delegált import saját kulcsot használ (`system_settings.delegated_import_pin`),
 * amit külön kell felvenni/forgatni — lásd app/(dashboard)/delegated-import/actions.ts.
 * Amíg a dedikált sor nincs feltöltve, a delegált import átmenetileg még ezt a
 * PIN-t fogadja el, ezért ennek a forgatása a delegált importra is kihat.
 */
export async function updateGodModePin(pin: string) {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const adminSupabase = createAdminClient()
  const cleanedPin = normalizePin(pin)

  if (!isValidPin(cleanedPin)) {
    return { error: 'A rendszergazdai PIN pontosan 6 számjegyből áll — írd be szóköz nélkül.' }
  }

  if (!adminSupabase) {
    return {
      error:
        'A rendszergazdai PIN biztonságos, adatbázisos mentéséhez add hozzá a SUPABASE_SERVICE_ROLE_KEY értéket a .env.local fájlhoz, majd indítsd újra a szervert.',
    }
  }

  const result = await adminSupabase.from(SETTINGS_TABLE).upsert(
    {
      key: GOD_MODE_SETTINGS_KEY,
      value: cleanedPin,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    },
    { onConflict: 'key' },
  )

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return {
        error:
          'A PIN tartós mentéséhez még le kell futtatni a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` fájlt.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        error: 'Az adatbázis-jogosultság jelenleg nem engedi a rendszergazdai PIN mentését.',
      }
    }

    return { error: result.error.message }
  }

  return { success: 'A rendszergazdai PIN sikeresen frissült.' }
}
