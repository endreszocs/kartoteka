'use server'

import { cookies } from 'next/headers'

import { isMasterAdmin } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const SETTINGS_TABLE = 'system_settings'
const GOD_MODE_SETTINGS_KEY = 'god_mode_pin'
const GOD_MODE_DURATION_MS = 2 * 60 * 60 * 1000

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
    return { error: 'Nincs jogosultsaga ehhez a muvelethez.' as const }
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
        'A rendszergazdai PIN nincs beallitva. Allitsd be a GOD_MODE_PIN kornyezeti valtozot, vagy konfigurald a system_settings tablat.',
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
            'A tartos rendszergazdai PIN tarolasahoz meg futtatni kell a kiegeszito SQL-bovitest. A rendszer jelenleg az env valtozot hasznalja.',
        }
      }
      return {
        pin: null,
        source: 'none',
        schemaReady: false,
        warning:
          'A system_settings tabla meg nem letezik es a GOD_MODE_PIN env valtozo sincs beallitva. A god mode letiltva.',
      }
    }

    if (isPermissionError(result.error)) {
      if (envPin) {
        return {
          pin: envPin,
          source: 'env',
          schemaReady: true,
          warning:
            'A rendszergazdai PIN tablaja letezik, de az olvasas nem sikerult. Az env valtozora esik vissza.',
        }
      }
      return {
        pin: null,
        source: 'none',
        schemaReady: true,
        warning:
          'A rendszergazdai PIN tablaja letezik, de az olvasas nem sikerult, es nincs env fallback.',
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
    warning: 'A rendszergazdai PIN nincs beallitva sem az adatbazisban, sem a GOD_MODE_PIN env valtozoban.',
  }
}

export async function activateGodMode(pin: string) {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const cleanedPin = normalizePin(pin)
  if (!isValidPin(cleanedPin)) {
    return { error: 'A rendszergazdai PIN pontosan 6 szamjegybol kell alljon.' }
  }

  const storedPin = await readStoredPin()

  // Ha nincs PIN beállítva (sem env, sem DB), a god mode nem aktiválható
  if (!storedPin.pin) {
    return {
      error:
        storedPin.warning ||
        'A rendszergazdai PIN nincs konfiguralva. Allitsd be a GOD_MODE_PIN kornyezeti valtozot, vagy konfigurald a system_settings tablat.',
    }
  }

  if (cleanedPin !== storedPin.pin) {
    return { error: 'Hibas PIN kod.' }
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

export async function updateGodModePin(pin: string) {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const adminSupabase = createAdminClient()
  const cleanedPin = normalizePin(pin)

  if (!isValidPin(cleanedPin)) {
    return { error: 'A rendszergazdai PIN pontosan 6 szamjegybol kell alljon.' }
  }

  if (!adminSupabase) {
    return {
      error:
        'A rendszergazdai PIN biztonsagos adatbazisos mentesehez add hozza a SUPABASE_SERVICE_ROLE_KEY erteket a .env.local fajlhoz, majd inditsd ujra a szervert.',
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
          'A PIN tartos mentesehez meg futtatni kell a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` fajlt.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        error: 'Az adatbazis-jogosultsag jelenleg nem engedi a rendszergazdai PIN menteset.',
      }
    }

    return { error: result.error.message }
  }

  return { success: 'A rendszergazdai PIN sikeresen frissult.' }
}
