'use server'

import { cookies } from 'next/headers'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit/log'
// 2026-08-11 (#16): a süti-név és -formátum EGYETLEN forrásból jön, mert a
// szerveroldali import-kapuőr (guard.ts) ugyanezt olvassa vissza. Ha a két hely
// széthúzna, a kapuőr némán elutasítaná a jogos delegált munkamenetet.
// 2026-08-15: a közös forrás átkerült a `lib/auth/delegated-import-session.ts`-be,
// és a süti értéke már HMAC-aláírt (aláíratlan értéket senki nem állíthat ki).
import {
  getDelegatedImportCookieName,
  sanitizeModuleKey,
  signDelegatedImportCookieValue,
  verifyDelegatedImportCookieValue,
} from '@/lib/auth/delegated-import-session'

const SETTINGS_TABLE = 'system_settings'

// BIZTONSÁGI FIX 2026-08-11 (#11): a delegált importnak SAJÁT, forgatható
// titka van.
//
// Ami rossz volt: ez a modul ugyanazt a `system_settings.god_mode_pin` sort (és
// ugyanazt a GOD_MODE_PIN env változót) olvasta, amit a god mode aktiválása
// ellenőriz. A delegált import lényege viszont az, hogy a rendszergazda
// BEMONDJA a PIN-t egy lelkésznek, hogy az egyszer lefuttathasson egy importot.
// Így minden importot végző lelkész megismerte a god mode második faktorát —
// azaz a mesteradmin e-mail-címén kívül semmi nem védte a teljes rendszer-
// hozzáférést.
//
// Miért jó így: elsődlegesen a dedikált `delegated_import_pin` kulcsot (vagy a
// DELEGATED_IMPORT_PIN env változót) olvassuk. Amíg az nincs feltöltve, a régi
// god-mode PIN-re esünk vissza, DE HANGOS figyelmeztetéssel, hogy a
// rendszergazda tudja: forgatnia kell. Ha a dedikált kulcs egyszer létezik, a
// god-mode PIN itt már NEM fogadható el.
const DELEGATED_IMPORT_SETTINGS_KEY = 'delegated_import_pin'
const LEGACY_GOD_MODE_SETTINGS_KEY = 'god_mode_pin'

const LEGACY_PIN_WARNING =
  'Figyelem: a delegált import még a rendszergazdai (god mode) PIN-t fogadja el. Kérd meg a rendszergazdát, hogy vegye fel a system_settings tábla `delegated_import_pin` sorát egy külön 6 jegyű kóddal — addig minden importot végző lelkész megismeri a god mode PIN-jét.'

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000

// DIAGNOSTICS P1-7: brute-force védelem PIN-próbálkozásokra.
// Audit-log alapú számláló — nem kell új tábla.
const MAX_FAILED_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000 // 10 perc
const AUDIT_ACTION_SUCCESS = 'delegated_import_activate_success'
const AUDIT_ACTION_FAILED = 'delegated_import_activate_failed'

// BIZTONSÁGI MEGJEGYZÉS: nincs alapértelmezett PIN. A delegált import
// aktiválásához be kell állítani a DELEGATED_IMPORT_PIN env változót vagy a
// system_settings tábla 'delegated_import_pin' sorát. Ha egyik sincs, a modul
// átmenetileg a régi god-mode PIN-t fogadja el (figyelmeztetéssel), és ha az
// sincs, a funkció letiltva.

function normalizePin(pin: string) {
  return pin.replace(/\D/g, '').slice(0, 6)
}

function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin)
}

function readEnvPin(raw: string | undefined) {
  if (!raw) return null
  const normalized = normalizePin(raw)
  return isValidPin(normalized) ? normalized : null
}

async function readAdminPin(): Promise<{ pin: string | null; warning: string | null }> {
  const envDelegatedPin = readEnvPin(process.env.DELEGATED_IMPORT_PIN)
  const envLegacyPin = readEnvPin(process.env.GOD_MODE_PIN)
  const adminSupabase = createAdminClient()

  if (!adminSupabase) {
    if (envDelegatedPin) {
      return { pin: envDelegatedPin, warning: null }
    }
    if (envLegacyPin) {
      return { pin: envLegacyPin, warning: LEGACY_PIN_WARNING }
    }
    return {
      pin: null,
      warning:
        'A delegált import most nem használható: nincs beállítva sem a DELEGATED_IMPORT_PIN környezeti változó, sem a SUPABASE_SERVICE_ROLE_KEY. Szólj a rendszergazdának, hogy állítsa be az egyiket.',
    }
  }

  // Egyetlen kör-út mindkét kulcsra — a dedikált nyer, a régi csak tartalék.
  const result = await adminSupabase
    .from(SETTINGS_TABLE)
    .select('key, value')
    .in('key', [DELEGATED_IMPORT_SETTINGS_KEY, LEGACY_GOD_MODE_SETTINGS_KEY])

  if (result.error) {
    if (envDelegatedPin) {
      return {
        pin: envDelegatedPin,
        warning:
          'Az adatbázisból nem sikerült beolvasni a delegált import PIN-kódját, ezért a rendszer a DELEGATED_IMPORT_PIN környezeti változót használja.',
      }
    }
    if (envLegacyPin) {
      return { pin: envLegacyPin, warning: LEGACY_PIN_WARNING }
    }
    return {
      pin: null,
      warning:
        'Az adatbázisból nem sikerült beolvasni a delegált import PIN-kódját, és nincs környezeti változós tartalék. Szólj a rendszergazdának — addig ez a funkció nem használható.',
    }
  }

  const rows = (result.data ?? []) as { key?: string | null; value?: unknown }[]
  const pickPin = (key: string) => {
    const raw = rows.find((row) => row.key === key)?.value
    if (typeof raw !== 'string') return null
    const normalized = normalizePin(raw)
    return isValidPin(normalized) ? normalized : null
  }

  // 1) Dedikált PIN — ha ez létezik, a god-mode PIN itt már NEM érvényes.
  const dbDelegatedPin = pickPin(DELEGATED_IMPORT_SETTINGS_KEY)
  if (dbDelegatedPin) {
    return { pin: dbDelegatedPin, warning: null }
  }
  if (envDelegatedPin) {
    return { pin: envDelegatedPin, warning: null }
  }

  // 2) Átmeneti tartalék: a régi god-mode PIN — hangos figyelmeztetéssel.
  const dbLegacyPin = pickPin(LEGACY_GOD_MODE_SETTINGS_KEY)
  if (dbLegacyPin) {
    return { pin: dbLegacyPin, warning: LEGACY_PIN_WARNING }
  }
  if (envLegacyPin) {
    return { pin: envLegacyPin, warning: LEGACY_PIN_WARNING }
  }

  return {
    pin: null,
    warning:
      'A delegált import PIN-kódja nincs beállítva. Szólj a rendszergazdának, hogy vegye fel a system_settings tábla `delegated_import_pin` sorát egy 6 jegyű kóddal.',
  }
}

/**
 * DIAGNOSTICS P1-7: rate-limit check az audit_log alapján.
 * Service-role klienssel olvassa a user `delegated_import_activate_failed`
 * event-jeit az utolsó RATE_LIMIT_WINDOW_MS-ben. Ha >= MAX_FAILED_ATTEMPTS,
 * cooldown-ra dob — a legrégebbi failure időpontja + ablak = mikor lehet újra.
 *
 * Ha a service-role kliens nem konfigurált (dev mode), nem blokkolunk —
 * a meglévő funkcionalitás megmarad. Audit-log mehet a regular klienssel is.
 */
async function checkActivationRateLimit(
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

/**
 * Elavult süti eltakarítása. Ez CSAK takarítás: a `getDelegatedImportStatus`-t
 * szerver-komponensek (page.tsx) is hívják, ahol a Next.js nem enged sütit
 * írni, és a dobott hiba az egész oldalt megbuktatná. A biztonsági döntést
 * (`active: false`) nem ez hozza, hanem az aláírás-ellenőrzés — a takarítás
 * elmaradása tehát nem enged át semmit.
 */
function forgetCookieQuietly(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  name: string,
) {
  try {
    cookieStore.delete(name)
  } catch {
    // Szerver-komponensben nem írható a süti — a következő szerver-akció törli.
  }
}

export async function getDelegatedImportStatus(moduleKey: string) {
  const cookieStore = await cookies()
  const { userId, congregationId } = await getEffectiveCongregationContext()
  const cookie = cookieStore.get(getDelegatedImportCookieName(moduleKey))
  // 2026-08-15: aláírás-ellenőrzés (a lejárat és a felhasználóhoz kötés is
  // ebben van). Örökölt, aláíratlan süti → null → a felület nem mutat aktív
  // munkamenetet, és a régi süti azonnal törlődik.
  const session = verifyDelegatedImportCookieValue(cookie?.value, userId, moduleKey)

  if (!session) {
    if (cookie) forgetCookieQuietly(cookieStore, getDelegatedImportCookieName(moduleKey))
    return { active: false, expiresAt: null as number | null }
  }

  if (!congregationId || session.congregationId !== congregationId) {
    forgetCookieQuietly(cookieStore, getDelegatedImportCookieName(moduleKey))
    return { active: false, expiresAt: null as number | null }
  }

  return { active: true, expiresAt: session.expiresAt }
}

export async function activateDelegatedImport(moduleKey: string, pin: string) {
  const context = await getEffectiveCongregationContext()
  if (!context.userId || !context.congregationId) {
    // 2026-08-11 (#29 rokon-eset): ékezetes, cselekvésre fordított szöveg.
    return { error: 'Ehhez előbb be kell jelentkezned, és ki kell választanod egy aktív gyülekezetet.' }
  }

  const cleanModuleKey = sanitizeModuleKey(moduleKey)

  // P1-7: rate-limit ellenőrzés MIELŐTT bármilyen PIN-összevetést tennénk.
  const rateLimit = await checkActivationRateLimit(context.userId)
  if (!rateLimit.allowed) {
    return {
      error: `Túl sok hibás PIN-próbálkozás. Próbáld újra ${rateLimit.retryAfterMin} perc múlva.`,
    }
  }

  const cleanedPin = normalizePin(pin)
  if (!isValidPin(cleanedPin)) {
    await logAuditEvent({
      action: AUDIT_ACTION_FAILED,
      targetTable: 'delegated_import',
      metadata: {
        moduleKey: cleanModuleKey,
        congregation_id: context.congregationId,
        reason: 'invalid_format',
      },
    })
    return { error: 'A PIN pontosan 6 számjegyből áll — kérd el újra a rendszergazdától, és írd be szóköz nélkül.' }
  }

  const stored = await readAdminPin()
  if (!stored.pin) {
    return { error: stored.warning || 'A delegált import most nem használható, mert a PIN nincs beállítva. Szólj a rendszergazdának.' }
  }
  if (cleanedPin !== stored.pin) {
    await logAuditEvent({
      action: AUDIT_ACTION_FAILED,
      targetTable: 'delegated_import',
      metadata: {
        moduleKey: cleanModuleKey,
        congregation_id: context.congregationId,
        reason: 'wrong_pin',
      },
    })
    return { error: 'Hibás PIN-kód. Ellenőrizd a rendszergazdától kapott 6 számjegyet, majd próbáld újra.' }
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS
  const cookieStore = await cookies()
  // 2026-08-15: HMAC-aláírt süti. Korábban nyers `"<gyülekezet>|<lejárat>"`
  // ment ki, amit bárki magának is beírhatott — így a PIN, a brute-force
  // korlát és ez az audit-sor is kikerülhető volt. Az aláírás a felhasználót,
  // a gyülekezetet, a modult és a lejáratot köti össze.
  cookieStore.set(
    getDelegatedImportCookieName(moduleKey),
    signDelegatedImportCookieValue(context.userId, context.congregationId, moduleKey, expiresAt),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_MS / 1000,
    },
  )

  // P1-7: sikeres aktiválás audit-log
  await logAuditEvent({
    action: AUDIT_ACTION_SUCCESS,
    targetTable: 'delegated_import',
    metadata: {
      moduleKey: cleanModuleKey,
      congregation_id: context.congregationId,
      expires_at: new Date(expiresAt).toISOString(),
      session_duration_ms: SESSION_DURATION_MS,
    },
  })

  return {
    success: true,
    expiresAt,
    warning: stored.warning,
  }
}

export async function deactivateDelegatedImport(moduleKey: string) {
  const cookieStore = await cookies()
  cookieStore.delete(getDelegatedImportCookieName(moduleKey))
  return { success: true }
}
