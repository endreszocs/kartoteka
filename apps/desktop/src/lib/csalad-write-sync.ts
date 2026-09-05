/**
 * csalad-write-sync — M8.3c (2026-04-24).
 *
 * Az offline-rögzített család-műveletek (insert + update) push-szinkronizációja.
 * A `szemely-write-sync`-hez hasonló, de kezel kétfajta operációt:
 *
 *   - `operation = 'insert'`: új csalad létrehozása. `target_csalad_id` null,
 *     a Supabase INSERT után a kapott id-t a `server_id`-ba írjuk, a
 *     `csalad_local` cache-be pedig optimistic upsert a friss id-val.
 *
 *   - `operation = 'update'`: meglévő csalad módosítása. `target_csalad_id` +
 *     `expected_revision` ki van töltve. A Supabase UPDATE conditional:
 *     `.eq('id', target).eq('revision', expected)`. Ha 0 sor frissült →
 *     konfliktus. Különben a pull-delta hozza vissza a friss adatot.
 *
 * Triggerek (mint a többi sync-helper):
 *   - Online-váltás
 *   - 30s poll
 *   - Manuális "Sync most"
 *
 * Exp-backoff ugyanazzal a táblával, mint a szemely/befizetés.
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

export interface CsaladPushResult {
  attempted: number
  succeeded: number
  retrying: number
  conflicts: number
  errors: string[]
}

export async function pushPendingCsalad(
  supabase: SupabaseClient = getDesktopSupabase(),
  ignoreBackoff = false,
): Promise<CsaladPushResult> {
  const result: CsaladPushResult = {
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
  const pending = await backend.listPendingCsalad()

  for (const row of pending) {
    if (!ignoreBackoff && shouldSkipByBackoff(row)) continue

    result.attempted += 1

    if (row.retry_count >= MAX_ATTEMPTS) {
      try {
        await backend.markCsaladPendingConflict(
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
        const payload = {
          id_ferfi: row.id_ferfi,
          id_no: row.id_no,
          // 2026-07-24 (PR-8, F9 P2): a -1 dummy KIVEZETVE — a webes cím-lánc a
          // nem létező -1-es utcára üres címet adott. ⚠️ ELŐFELTÉTEL:
          // 2026-07-24-pr8-c-utcaid-null-migracio.sql (DROP NOT NULL).
          c_utcaid: null,
          c_szam: row.c_szam,
          c_tombhaz: row.c_tombhaz,
          c_lepcsohaz: row.c_lepcsohaz,
          c_ajto: row.c_ajto,
          c_emelet: row.c_emelet,
          id_csoport: row.id_csoport,
          isaktiv: row.isaktiv === 1,
        }
        const { data, error } = await supabase
          .from('csalad')
          .insert(payload)
          .select('id')
          .maybeSingle()

        if (error) {
          await backend.updateCsaladPendingAttempt(row.id, error.message)
          result.retrying += 1
          pushErrorDedup(result.errors, error.message)
          continue
        }
        if (!data?.id) {
          await backend.updateCsaladPendingAttempt(row.id, 'Szerver nem adott id-t')
          result.retrying += 1
          continue
        }

        const serverId = Number(data.id)
        await backend.markCsaladPendingSynced(row.id, serverId)
        await backend.upsertLocalCsaladOptimistic({
          id: serverId,
          id_ferfi: row.id_ferfi,
          id_no: row.id_no,
          c_szam: row.c_szam,
          c_tombhaz: row.c_tombhaz,
          c_lepcsohaz: row.c_lepcsohaz,
          c_ajto: row.c_ajto,
          c_emelet: row.c_emelet,
          id_csoport: row.id_csoport,
          isaktiv: row.isaktiv === 1,
        })
        result.succeeded += 1
      } else if (row.operation === 'update') {
        if (row.target_csalad_id === null || row.expected_revision === null) {
          await backend.markCsaladPendingConflict(
            row.id,
            'Érvénytelen update-sor: hiányzik target_csalad_id vagy expected_revision.',
          )
          result.conflicts += 1
          continue
        }
        const patch = {
          id_ferfi: row.id_ferfi,
          id_no: row.id_no,
          c_szam: row.c_szam,
          c_tombhaz: row.c_tombhaz,
          c_lepcsohaz: row.c_lepcsohaz,
          c_ajto: row.c_ajto,
          c_emelet: row.c_emelet,
          id_csoport: row.id_csoport,
          isaktiv: row.isaktiv === 1,
        }
        const { data, error } = await supabase
          .from('csalad')
          .update(patch)
          .eq('id', row.target_csalad_id)
          .eq('revision', row.expected_revision)
          .select('id, revision')

        if (error) {
          await backend.updateCsaladPendingAttempt(row.id, error.message)
          result.retrying += 1
          pushErrorDedup(result.errors, error.message)
          continue
        }
        if (!data || data.length === 0) {
          await backend.markCsaladPendingConflict(
            row.id,
            `Másik eszközről módosították időközben (revision mismatch). Frissítsd a családlistát és próbáld újra.`,
          )
          result.conflicts += 1
          continue
        }

        await backend.markCsaladPendingSynced(row.id, row.target_csalad_id)
        result.succeeded += 1
      }
    } catch (err) {
      await backend.updateCsaladPendingAttempt(
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

let lastRunAt: string | null = null
let lastResult: CsaladPushResult | null = null
/**
 * A futó push őre — a TÉNYLEGES befejezésig tart, nem az időkorlátig (bíráló
 * P1, 2026-09-05): a csalad-insertnek semmilyen dup-védelme nincs, két
 * párhuzamos kör ugyanazt a családot kétszer hozta volna létre. Ld. `FutoOr`.
 */
const futoOr = new FutoOr<CsaladPushResult>()

export interface CsaladSyncStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: CsaladPushResult | null
}

export function getCsaladSyncStatus(): CsaladSyncStatus {
  return { running: futoOr.fut, lastRunAt, lastResult }
}

/** Egy push indítása — vagy a már futó megosztása. Az eredmény-cache a VALÓDI végén frissül. */
function inditPush(ignoreBackoff: boolean): Promise<CsaladPushResult> {
  return futoOr.futtat(
    () => pushPendingCsalad(getDesktopSupabase(), ignoreBackoff),
    (r) => {
      lastResult = r
      lastRunAt = new Date().toISOString()
    },
  )
}

/**
 * Egy őrzött kör: saját visszalépéssel, 30 mp-es időkorláttal. Sosem dob.
 * 2026-09-05: EXPORTÁLT — a `write-sync-registry` pollja hívja (nem az
 * oldal mountjától függ többé — desk-sync-2); a saját listener kikerült.
 */
export async function runCsaladSyncGuarded(): Promise<void> {
  if (futoOr.fut) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  try {
    await withSyncTimeout(inditPush(false), 'Család-szinkron')
  } catch (err) {
    // Időtúllépés VAGY hiba: a push a háttérben az őr alatt fut tovább —
    // a következő kör NEM indít újat.
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[csalad-write-sync] a háttér-kör hibára futott:', msg)
    lastResult = { attempted: 0, succeeded: 0, retrying: 0, conflicts: 0, errors: [msg] }
  }
}

/**
 * Kompatibilitási belépő (families-page): egyetlen azonnali őrzött kör.
 * A triggerkészlet a `write-sync-registry`-ben él.
 */
export function startCsaladAutoSync(): void {
  if (typeof window === 'undefined') return
  void runCsaladSyncGuarded()
}

/**
 * Manuális push (a visszalépést ignorálja). Ha már fut egy kör (időtúllépés
 * után is), NEM indít újat — ugyanazt várja meg, időkorláttal.
 */
export async function runCsaladSyncManually(): Promise<CsaladPushResult> {
  return withSyncTimeout(inditPush(true), 'Család-szinkron')
}
