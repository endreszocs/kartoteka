'use server'

// ⚠️ DEPRECATED — Ez a fájl a god mode legacy v3 verziója. Az aktív kód az
// `actions-v4.ts`. Jelenleg nincs UI komponens, ami erre a fájlra hivatkozna.
// A 2026-04-12 biztonsági audit (K2) miatt eltávolítottuk a hardcoded
// alapértelmezett PIN-t. A god mode csak akkor aktiválható, ha a GOD_MODE_PIN
// env változó vagy a system_settings.god_mode_pin sor be van állítva.
// Ha egyik sem, a god mode letiltva.

import { cookies } from 'next/headers'

import { isMasterAdmin } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const SETTINGS_TABLE = 'system_settings'
const GOD_MODE_SETTINGS_KEY = 'god_mode_pin'
const GOD_MODE_DURATION_MS = 2 * 60 * 60 * 1000

type PinSource = 'database' | 'env' | 'none'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

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
    return { error: 'Nincs jogosultsága ehhez a művelethez.' as const }
  }

  return { supabase, user }
}

async function readStoredPin(supabase: ServerSupabase) {
  // Csak env vagy DB — soha nem default. Ha mindkettő hiányzik, a god mode
  // nem aktiválható.
  const envPin = process.env.GOD_MODE_PIN && isValidPin(process.env.GOD_MODE_PIN)
    ? normalizePin(process.env.GOD_MODE_PIN)
    : null
  const adminSupabase = createAdminClient()
  const settingsClient = adminSupabase ?? supabase

  const result = await settingsClient
    .from(SETTINGS_TABLE)
    .select('value')
    .eq('key', GOD_MODE_SETTINGS_KEY)
    .maybeSingle()

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return {
        pin: envPin,
        source: (envPin ? 'env' : 'none') as PinSource,
        schemaReady: false,
        warning: envPin
          ? 'A tartós rendszergazdai PIN tároláshoz még futtatni kell a kiegészítő SQL-bővítést. A rendszer az env változóra esik vissza.'
          : 'A system_settings tábla még nem létezik és a GOD_MODE_PIN env változó sincs beállítva. A god mode letiltva.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        pin: envPin,
        source: (envPin ? 'env' : 'none') as PinSource,
        schemaReady: true,
        warning: envPin
          ? adminSupabase
            ? 'A rendszergazdai PIN táblája létezik, de az olvasás nem sikerült. Az env változóra esik vissza.'
            : 'A rendszergazdai PIN adatbázisos olvasásához hiányzik a SUPABASE_SERVICE_ROLE_KEY. Az env változót használjuk.'
          : 'A rendszergazdai PIN táblája létezik, de az olvasás nem sikerült, és nincs env fallback.',
      }
    }

    return {
      pin: envPin,
      source: (envPin ? 'env' : 'none') as PinSource,
      schemaReady: true,
      warning: result.error.message,
    }
  }

  const storedValue = typeof result.data?.value === 'string' ? normalizePin(result.data.value) : ''
  if (isValidPin(storedValue)) {
    return { pin: storedValue, source: 'database' as const, schemaReady: true }
  }

  return {
    pin: envPin,
    source: (envPin ? 'env' : 'none') as PinSource,
    schemaReady: true,
    warning: envPin ? undefined : 'A rendszergazdai PIN nincs beállítva sem az adatbázisban, sem a GOD_MODE_PIN env változóban.',
  }
}

export async function activateGodMode(pin: string) {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const cleanedPin = normalizePin(pin)
  if (!isValidPin(cleanedPin)) {
    return { error: 'A rendszergazdai PIN pontosan 6 számjegyből kell álljon.' }
  }

  const storedPin = await readStoredPin(auth.supabase)

  // Ha nincs PIN beállítva (sem env, sem DB), a god mode nem aktiválható
  if (!storedPin.pin) {
    return {
      error:
        storedPin.warning ||
        'A rendszergazdai PIN nincs konfigurálva. Állítsd be a GOD_MODE_PIN környezeti változót, vagy konfiguráld a system_settings táblát.',
    }
  }

  if (cleanedPin !== storedPin.pin) {
    return { error: storedPin.warning || 'Hibás PIN kód.' }
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

export async function getGodModePinSettings() {
  const auth = await requireMasterAdmin()
  if ('error' in auth) return { error: auth.error }

  const result = await readStoredPin(auth.supabase)
  return {
    pin: result.pin,
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
    return { error: 'A rendszergazdai PIN pontosan 6 számjegyből kell álljon.' }
  }

  const result = await (adminSupabase ?? auth.supabase)
    .from(SETTINGS_TABLE)
    .upsert(
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
          'A PIN tartós mentéséhez még futtatni kell a `migration-docs/sql/2026-04-09-god-mode-and-congregation-finance.sql` fájlt.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        error: adminSupabase
          ? 'Az adatbázis-jogosultság jelenleg nem engedi a rendszergazdai PIN mentését.'
          : 'A rendszergazdai PIN biztonságos adatbázisos mentéséhez add hozzá a SUPABASE_SERVICE_ROLE_KEY értékét a .env.local fájlhoz, majd indítsd újra a szervert.',
      }
    }

    return { error: result.error.message }
  }

  return { success: 'A rendszergazdai PIN sikeresen frissült.' }
}
