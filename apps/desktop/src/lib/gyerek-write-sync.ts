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
import { getVerifiedSession } from './verified-session'
import { FutoOr, withSyncTimeout } from './write-sync-registry'

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

  // 2026-09-05: a repó közös őre (`getVerifiedSession`) — lejárat + FIÓK-
  // EGYEZŐSÉG (a csupasz getSession más fiókkal is felküldte volna a sort).
  const verified = await getVerifiedSession()
  if (!verified.ok) {
    if (verified.reason === 'user-mismatch') result.errors.push(verified.message)
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

/**
 * A futó push őre — a TÉNYLEGES befejezésig tart, nem az időkorlátig (bíráló
 * P1, 2026-09-05): a gyerek-insertnek nincs dup-védelme, két párhuzamos kör
 * ugyanazt a gyermek-sort kétszer szúrta volna be. Ld. `FutoOr`.
 */
const futoOr = new FutoOr<GyerekPushResult>()

/** Egy push indítása — vagy a már futó megosztása. */
function inditPush(ignoreBackoff: boolean): Promise<GyerekPushResult> {
  return futoOr.futtat(() => pushPendingGyerek(getDesktopSupabase(), ignoreBackoff))
}

/**
 * Egy őrzött kör: saját visszalépéssel, 30 mp-es időkorláttal. Sosem dob.
 * 2026-09-05: EXPORTÁLT — a `write-sync-registry` pollja hívja (nem a
 * dialógus mountjától függ többé — desk-sync-2); a saját listener kikerült.
 */
export async function runGyerekSyncGuarded(): Promise<void> {
  if (futoOr.fut) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  try {
    await withSyncTimeout(inditPush(false), 'Gyermek-szinkron')
  } catch (err) {
    // Időtúllépés VAGY hiba: a push a háttérben az őr alatt fut tovább —
    // a következő kör NEM indít újat.
    console.warn(
      '[gyerek-write-sync] a háttér-kör hibára futott:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Kompatibilitási belépő (family-detail-dialog): egyetlen azonnali őrzött
 * kör. A triggerkészlet a `write-sync-registry`-ben él.
 */
export function startGyerekAutoSync(): void {
  if (typeof window === 'undefined') return
  void runGyerekSyncGuarded()
}

/**
 * Manuális push (a visszalépést ignorálja). Ha már fut egy kör (időtúllépés
 * után is), NEM indít újat — ugyanazt várja meg, időkorláttal.
 */
export async function runGyerekSyncManually(): Promise<GyerekPushResult> {
  return withSyncTimeout(inditPush(true), 'Gyermek-szinkron')
}
