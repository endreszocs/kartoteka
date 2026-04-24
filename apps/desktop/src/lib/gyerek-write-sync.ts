/**
 * gyerek-write-sync — M8.3d (2026-04-24).
 *
 * Az offline-rögzített gyerek-junction műveletek push-szinkronizációja.
 * Két operáció: `insert` (új gyerek-sor) és `delete` (meglévő törlése).
 * A `csalad-write-sync` mintáját követi, de egyszerűbb (nincs update).
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

export interface GyerekPushResult {
  attempted: number
  succeeded: number
  retrying: number
  conflicts: number
  errors: string[]
}

export async function pushPendingGyerek(
  supabase: SupabaseClient = getDesktopSupabase(),
  ignoreBackoff = false,
): Promise<GyerekPushResult> {
  const result: GyerekPushResult = {
    attempted: 0,
    succeeded: 0,
    retrying: 0,
    conflicts: 0,
    errors: [],
  }

  try {
    const sessionRes = await supabase.auth.getSession()
    if (!sessionRes.data.session) return result
  } catch {
    return result
  }

  const backend = getTauriSqliteBackend()
  const pending = await backend.listPendingGyerek()

  for (const row of pending) {
    if (!ignoreBackoff && shouldSkipByBackoff(row)) continue
    result.attempted += 1

    if (row.retry_count >= MAX_ATTEMPTS) {
      try {
        await backend.markGyerekPendingConflict(
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
      if (row.operation === 'insert') {
        if (row.id_csalad === null || row.id_szemely === null) {
          await backend.markGyerekPendingConflict(
            row.id,
            'Érvénytelen insert-sor: hiányzik id_csalad vagy id_szemely.',
          )
          result.conflicts += 1
          continue
        }
        const { data, error } = await supabase
          .from('gyerek')
          .insert({ id_csalad: row.id_csalad, id_szemely: row.id_szemely })
          .select('id')
          .maybeSingle()

        if (error) {
          await backend.updateGyerekPendingAttempt(row.id, error.message)
          result.retrying += 1
          pushErrorDedup(result.errors, error.message)
          continue
        }
        if (!data?.id) {
          await backend.updateGyerekPendingAttempt(row.id, 'Szerver nem adott id-t')
          result.retrying += 1
          continue
        }

        const serverId = Number(data.id)
        await backend.markGyerekPendingSynced(row.id, serverId)
        await backend.insertLocalGyerekOptimistic({
          id: serverId,
          id_csalad: row.id_csalad,
          id_szemely: row.id_szemely,
        })
        result.succeeded += 1
      } else if (row.operation === 'delete') {
        if (row.target_gyerek_id === null) {
          await backend.markGyerekPendingConflict(
            row.id,
            'Érvénytelen delete-sor: hiányzik target_gyerek_id.',
          )
          result.conflicts += 1
          continue
        }
        const { error } = await supabase
          .from('gyerek')
          .delete()
          .eq('id', row.target_gyerek_id)

        if (error) {
          await backend.updateGyerekPendingAttempt(row.id, error.message)
          result.retrying += 1
          pushErrorDedup(result.errors, error.message)
          continue
        }

        await backend.markGyerekPendingSynced(row.id, row.target_gyerek_id)
        result.succeeded += 1
      }
    } catch (err) {
      await backend.updateGyerekPendingAttempt(
        row.id,
        err instanceof Error ? err.message : 'ismeretlen',
      )
      result.retrying += 1
      pushErrorDedup(
        result.errors,
        `Váratlan hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
      )
    }
  }

  return result
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
// Auto-trigger háttér-pusher
// ─────────────────────────────────────────────────────────────────────────

let pusherInterval: ReturnType<typeof setInterval> | null = null
let onlineListenerAttached = false
let inFlight = false

async function runOnceGuarded(): Promise<void> {
  if (inFlight) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  inFlight = true
  try {
    await pushPendingGyerek()
  } finally {
    inFlight = false
  }
}

export function startGyerekAutoSync(): void {
  if (typeof window === 'undefined') return

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

export async function runGyerekSyncManually(): Promise<GyerekPushResult> {
  if (inFlight) {
    while (inFlight) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return {
      attempted: 0,
      succeeded: 0,
      retrying: 0,
      conflicts: 0,
      errors: [],
    }
  }
  inFlight = true
  try {
    return await pushPendingGyerek(getDesktopSupabase(), true)
  } finally {
    inFlight = false
  }
}
