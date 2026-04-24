/**
 * szemely-write-sync — M8.1 (2026-04-24).
 *
 * Az offline-rögzített új tagok (`szemely_pending_local`) push-szinkronizációja
 * a szerverre. A `befizetes-write-sync.ts` mintáját követi, kivéve:
 *   - NINCS outbox tábla — a `szemely_pending_local` maga a queue.
 *     A `listLocalPendingSzemely` listájából dolgozunk (pending + conflict).
 *   - A `conflict` sorokat NEM próbáljuk újra automatikusan — azok
 *     kézi feloldást igényelnek (duplikált CNP → törlés vagy új CNP).
 *   - Sikeres push után a szerver-generált int8 `szemely.id` a `server_id`-be
 *     kerül, a sor `sync_state='synced'`-ra vált és a pending-listából eltűnik.
 *
 * Triggerek:
 *   1) Online-váltás (`window.online`)
 *   2) Periodikus poll (30 s, ha online)
 *   3) Manuális "Sync most" gomb (ignoreBackoff=true)
 *
 * Exp-backoff a retry-attempts alapján, ugyanazzal a táblával mint a befizetés:
 *   1→30s, 2→1m, 3→2m, 4→5m, 5→15m, 6+→conflict
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { getDesktopSupabase } from './supabase'
import { getTauriSqliteBackend } from './tauri-sqlite-backend'

const MAX_ATTEMPTS = 5

const BACKOFF_MS_BY_ATTEMPT: Record<number, number> = {
  0: 0,
  1: 30_000,
  2: 60_000,
  3: 120_000,
  4: 300_000,
  5: 900_000,
}

export interface SzemelyPushResult {
  attempted: number
  succeeded: number
  retrying: number
  conflicts: number
  errors: string[]
}

/**
 * Egyszer lefut, push-olja a pending új-tag sorokat. Nem dob — minden hiba
 * a `result.errors`-ba kerül (max 10, deduplikálva).
 */
export async function pushPendingSzemely(
  congregationId: string,
  supabase: SupabaseClient = getDesktopSupabase(),
  ignoreBackoff = false,
): Promise<SzemelyPushResult> {
  const result: SzemelyPushResult = {
    attempted: 0,
    succeeded: 0,
    retrying: 0,
    conflicts: 0,
    errors: [],
  }

  // Session-check (offline-PIN belépésnél nincs JWT → 401-spam védelem)
  try {
    const sessionRes = await supabase.auth.getSession()
    if (!sessionRes.data.session) return result
  } catch {
    return result
  }

  const backend = getTauriSqliteBackend()

  const pendingList = await backend.listLocalPendingSzemely(congregationId)
  // Csak a 'pending' sorokat próbáljuk; a 'conflict'-okat kézi feloldás után
  // újra pending-re állíthatja a user (M8.1-polish).
  const pendingOnly = pendingList.filter((r) => r.sync_state === 'pending')

  for (const row of pendingOnly) {
    if (!ignoreBackoff && shouldSkipByBackoff(row)) continue

    result.attempted += 1

    if (row.retry_count >= MAX_ATTEMPTS) {
      try {
        await backend.markSzemelyConflict(
          row.id,
          `Max próbálkozás elérve (${row.retry_count}). Utolsó hiba: ${row.sync_error ?? 'ismeretlen'}.`,
        )
        result.conflicts += 1
      } catch (err) {
        pushErrorDedup(
          result.errors,
          `Conflict-jelölés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
        )
      }
      continue
    }

    try {
      // Teljes payload a pending-táblából
      const full = await backend.getLocalPendingSzemely(row.id)
      if (!full) {
        pushErrorDedup(result.errors, `A pending-sor eltűnt közben (id=${row.id})`)
        continue
      }

      const payload = buildServerInsertPayload(full)

      const { data, error } = await supabase
        .from('szemely')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (error) {
        if (error.code === '23505') {
          try {
            await backend.markSzemelyConflict(
              row.id,
              `A CNP (${full.cnp}) a szerveren már foglalt. Lehet, ` +
                `hogy más lelkész is felvette ugyanezt a tagot. Nyisd meg ` +
                `a pending-listát és töröld / állítsd át másik CNP-re.`,
            )
            result.conflicts += 1
          } catch (err) {
            pushErrorDedup(
              result.errors,
              `Unique-conflict rögzítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
            )
          }
          continue
        }

        // Egyéb hiba — retry
        try {
          await backend.updateSzemelyAttempt(row.id, error.message)
          result.retrying += 1
          pushErrorDedup(result.errors, error.message)
        } catch (err) {
          pushErrorDedup(
            result.errors,
            `Attempt-frissítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
          )
        }
        continue
      }

      if (!data?.id) {
        try {
          await backend.updateSzemelyAttempt(row.id, 'Szerver nem adott ID-t az insert után')
          result.retrying += 1
          pushErrorDedup(result.errors, 'Szerver nem adott ID-t az insert után')
        } catch (err) {
          pushErrorDedup(
            result.errors,
            `Attempt-frissítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
          )
        }
        continue
      }

      // Siker — synced + server_id, a sor a pending-listából eltűnik
      try {
        await backend.markSzemelySynced(row.id, Number(data.id))
        result.succeeded += 1
      } catch (err) {
        pushErrorDedup(
          result.errors,
          `Lokális sync-jelölés sikertelen (szerver-sor mentve: ${data.id}): ${err instanceof Error ? err.message : 'ismeretlen'}`,
        )
      }
    } catch (err) {
      try {
        await backend.updateSzemelyAttempt(
          row.id,
          err instanceof Error ? err.message : 'ismeretlen',
        )
        result.retrying += 1
        pushErrorDedup(
          result.errors,
          `Váratlan hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
        )
      } catch (innerErr) {
        pushErrorDedup(
          result.errors,
          `Attempt-frissítés hiba: ${innerErr instanceof Error ? innerErr.message : 'ismeretlen'}`,
        )
      }
    }
  }

  return result
}

function buildServerInsertPayload(row: Record<string, unknown>): Record<string, unknown> {
  // A pending-sor mezőit át kell alakítani szerver-kompatibilis szemely-
  // insert-payloaddá: integer-bool → boolean, a lokál-only metaadatok
  // (id, server_id, sync_state, sync_error, retry_count, userid stb.) ki.
  const boolMap = new Set(['ferfi', 'csaladfo', 'meghalt', 'voter_eligible', 'isvisible'])
  const skip = new Set([
    'id',
    'server_id',
    'sync_state',
    'sync_error',
    'retry_count',
    'last_attempt_at',
    'created_at',
    'updated_at',
    'userid',
  ])

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key)) continue
    if (boolMap.has(key)) {
      out[key] = value === 1 || value === '1' || value === true
    } else {
      out[key] = value
    }
  }

  // Szerver NOT NULL mezők biztosító háló
  if (out.c_utcaid === undefined || out.c_utcaid === null) out.c_utcaid = -1
  if (out.befizetoev === undefined || out.befizetoev === null) {
    out.befizetoev = new Date().getFullYear()
  }
  return out
}

function shouldSkipByBackoff(row: {
  retry_count: number
  last_attempt_at?: string | null
}): boolean {
  if (row.retry_count === 0) return false
  if (!row.last_attempt_at) return false
  const lastMs = Date.parse(row.last_attempt_at)
  if (!Number.isFinite(lastMs)) return false
  const backoff = BACKOFF_MS_BY_ATTEMPT[row.retry_count] ?? 900_000
  return Date.now() - lastMs < backoff
}

function pushErrorDedup(list: string[], msg: string): void {
  if (list.includes(msg)) return
  if (list.length >= 10) return
  list.push(msg)
}

// ─────────────────────────────────────────────────────────────────────────
//  Auto-trigger háttér-pusher (a congregation-id nélkül nem tud futni!)
// ─────────────────────────────────────────────────────────────────────────

let pusherInterval: ReturnType<typeof setInterval> | null = null
let onlineListenerAttached = false
let lastRunAt: string | null = null
let inFlight = false
let lastResult: SzemelyPushResult | null = null
let currentCongregationId: string | null = null

export interface SzemelySyncStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: SzemelyPushResult | null
}

export function getSzemelySyncStatus(): SzemelySyncStatus {
  return {
    running: inFlight,
    lastRunAt,
    lastResult,
  }
}

async function runOnceGuarded(): Promise<void> {
  if (inFlight) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (!currentCongregationId) return
  inFlight = true
  try {
    lastResult = await pushPendingSzemely(currentCongregationId)
    lastRunAt = new Date().toISOString()
  } finally {
    inFlight = false
  }
}

/**
 * Beállítja az auto-triggereket egy adott gyülekezetre.
 * Idempotens — többszöri hívás nem duplikálja a listener-t, csak frissíti
 * a congregation-id-t.
 */
export function startSzemelyAutoSync(congregationId: string): void {
  if (typeof window === 'undefined') return
  currentCongregationId = congregationId

  if (!onlineListenerAttached) {
    window.addEventListener('online', () => {
      void runOnceGuarded()
    })
    onlineListenerAttached = true
  }

  if (!pusherInterval) {
    pusherInterval = setInterval(() => {
      void runOnceGuarded()
    }, 30_000)
  }

  void runOnceGuarded()
}

/**
 * Manuális push-kiváltás. Ignorálja az exp-backoff-ot.
 */
export async function runSzemelySyncManually(
  congregationId: string,
): Promise<SzemelyPushResult> {
  if (inFlight) {
    while (inFlight) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return (
      lastResult ?? {
        attempted: 0,
        succeeded: 0,
        retrying: 0,
        conflicts: 0,
        errors: [],
      }
    )
  }
  inFlight = true
  try {
    lastResult = await pushPendingSzemely(congregationId, getDesktopSupabase(), true)
    lastRunAt = new Date().toISOString()
    return lastResult
  } finally {
    inFlight = false
  }
}
