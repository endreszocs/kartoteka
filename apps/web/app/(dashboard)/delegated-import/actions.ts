'use server'

import { cookies } from 'next/headers'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { createAdminClient } from '@/lib/supabase/admin'

const SETTINGS_TABLE = 'system_settings'
const GOD_MODE_SETTINGS_KEY = 'god_mode_pin'
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000
const COOKIE_PREFIX = 'delegated_import_'

// BIZTONSÁGI MEGJEGYZÉS: nincs alapértelmezett PIN. A delegált import
// aktiválásához be kell állítani a GOD_MODE_PIN env var-t vagy a system_settings
// táblában a 'god_mode_pin' kulcsú sort. Ha egyik sincs, a funkció letiltva.

function normalizePin(pin: string) {
  return pin.replace(/\D/g, '').slice(0, 6)
}

function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin)
}

function sanitizeModuleKey(moduleKey: string) {
  return moduleKey.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
}

function getCookieName(moduleKey: string) {
  return `${COOKIE_PREFIX}${sanitizeModuleKey(moduleKey)}`
}

async function readAdminPin(): Promise<{ pin: string | null; warning: string | null }> {
  const envPin = process.env.GOD_MODE_PIN && isValidPin(process.env.GOD_MODE_PIN)
    ? normalizePin(process.env.GOD_MODE_PIN)
    : null
  const adminSupabase = createAdminClient()

  if (!adminSupabase) {
    if (envPin) {
      return { pin: envPin, warning: null }
    }
    return {
      pin: null,
      warning:
        'A delegalt import nem hasznalhato, mert nincs beallitva sem a GOD_MODE_PIN env valtozo, sem a SUPABASE_SERVICE_ROLE_KEY.',
    }
  }

  const result = await adminSupabase
    .from(SETTINGS_TABLE)
    .select('value')
    .eq('key', GOD_MODE_SETTINGS_KEY)
    .maybeSingle()

  if (result.error) {
    if (envPin) {
      return {
        pin: envPin,
        warning: 'Az adatbazisbol nem sikerult beolvasni a rendszergazdai PIN kodot, a rendszer az env valtozora esik vissza.',
      }
    }
    return {
      pin: null,
      warning: 'Az adatbazisbol nem sikerult beolvasni a rendszergazdai PIN kodot, es nincs env fallback. A funkcio letiltva.',
    }
  }

  const storedValue = typeof result.data?.value === 'string' ? normalizePin(result.data.value) : ''
  if (isValidPin(storedValue)) {
    return { pin: storedValue, warning: null }
  }

  if (envPin) {
    return { pin: envPin, warning: null }
  }

  return {
    pin: null,
    warning: 'A rendszergazdai PIN nincs beallitva. Konfigurald a system_settings.god_mode_pin sort, vagy a GOD_MODE_PIN env valtozot.',
  }
}

function parseCookieValue(value: string | undefined) {
  if (!value) return null
  const [congregationId, expiresAtRaw] = value.split('|')
  const expiresAt = Number(expiresAtRaw)
  if (!congregationId || !Number.isFinite(expiresAt)) return null
  return { congregationId, expiresAt }
}

export async function getDelegatedImportStatus(moduleKey: string) {
  const cookieStore = await cookies()
  const { congregationId } = await getEffectiveCongregationContext()
  const cookie = cookieStore.get(getCookieName(moduleKey))
  const parsed = parseCookieValue(cookie?.value)

  if (!parsed) {
    return { active: false, expiresAt: null as number | null }
  }

  if (!congregationId || parsed.congregationId !== congregationId || Date.now() >= parsed.expiresAt) {
    cookieStore.delete(getCookieName(moduleKey))
    return { active: false, expiresAt: null as number | null }
  }

  return { active: true, expiresAt: parsed.expiresAt }
}

export async function activateDelegatedImport(moduleKey: string, pin: string) {
  const context = await getEffectiveCongregationContext()
  if (!context.userId || !context.congregationId) {
    return { error: 'Ehhez elobb be kell jelentkezni egy aktiv gyulekezetbe.' }
  }

  const cleanedPin = normalizePin(pin)
  if (!isValidPin(cleanedPin)) {
    return { error: 'A rendszergazdai PIN pontosan 6 szamjegybol kell alljon.' }
  }

  const stored = await readAdminPin()
  if (!stored.pin) {
    return { error: stored.warning || 'A delegalt import nem hasznalhato, mert a PIN nincs konfiguralva.' }
  }
  if (cleanedPin !== stored.pin) {
    return { error: 'Hibas PIN kod.' }
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS
  const cookieStore = await cookies()
  cookieStore.set(getCookieName(moduleKey), `${context.congregationId}|${expiresAt}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  })

  return {
    success: true,
    expiresAt,
    warning: stored.warning,
  }
}

export async function deactivateDelegatedImport(moduleKey: string) {
  const cookieStore = await cookies()
  cookieStore.delete(getCookieName(moduleKey))
  return { success: true }
}
