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

  // Session-check (offline-PIN belépésnél nincs JWT → 401-spam védelem).
  // 2026-09-05: a repó közös őre (`getVerifiedSession`) — lejárat + FIÓK-
  // EGYEZŐSÉG is (a pénzügyi push-erekkel azonos szabály; a csupasz
  // getSession más fiókkal belépve is felküldte volna a gépen ragadt tagot).
  const verified = await getVerifiedSession()
  if (!verified.ok) {
    if (verified.reason === 'user-mismatch') result.errors.push(verified.message)
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

  // 2026-07-24 (PR-8, F9 P2): a c_utcaid=-1 dummy KIVEZETVE — a -1 a webes
  // cím-láncot törte (adrstreet-join a nem létező -1-es utcára → üres cím).
  // ⚠️ ELŐFELTÉTEL: a 2026-07-24-pr8-c-utcaid-null-migracio.sql lefuttatása
  // (DROP NOT NULL) — e nélkül az utca nélküli offline-mentés 23502-vel
  // pattanna vissza a szerverről.
  if (out.c_utcaid === -1) out.c_utcaid = null
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

let lastRunAt: string | null = null
let lastResult: SzemelyPushResult | null = null
let currentCongregationId: string | null = null
/**
 * A futó push őre — a TÉNYLEGES befejezésig tart, nem az időkorlátig
 * (bíráló P1, 2026-09-05): a szemely-insertnek NINCS idempotencia-kulcsa
 * (csak a 23505 CNP-ütközést kezeli), egy CNP nélküli tag két párhuzamos
 * körből KÉTSZER került volna a szerverre. Részletek: `FutoOr`.
 */
const futoOr = new FutoOr<SzemelyPushResult>()

export interface SzemelySyncStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: SzemelyPushResult | null
}

export function getSzemelySyncStatus(): SzemelySyncStatus {
  return {
    running: futoOr.fut,
    lastRunAt,
    lastResult,
  }
}

/** Egy push indítása — vagy a már futó megosztása. Az eredmény-cache a VALÓDI végén frissül. */
function inditPush(congregationId: string, ignoreBackoff: boolean): Promise<SzemelyPushResult> {
  return futoOr.futtat(
    () => pushPendingSzemely(congregationId, getDesktopSupabase(), ignoreBackoff),
    (r) => {
      lastResult = r
      lastRunAt = new Date().toISOString()
    },
  )
}

/**
 * Egy őrzött kör: saját visszalépéssel, 30 mp-es időkorláttal. Sosem dob.
 * 2026-09-05: EXPORTÁLT — a `write-sync-registry` pollja hívja a LOKÁLIS
 * profilból feloldott gyülekezettel (nem az oldal mountjától függ többé —
 * desk-sync-2); a saját `online` listener + interval innen kikerült.
 */
export async function runSzemelySyncGuarded(congregationId?: string): Promise<void> {
  if (futoOr.fut) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  const cid = congregationId ?? currentCongregationId
  if (!cid) return
  currentCongregationId = cid
  try {
    await withSyncTimeout(inditPush(cid, false), 'Új tag-szinkron')
  } catch (err) {
    // Időtúllépés VAGY hiba: a hívó itt visszakapja a kezét, de a push a
    // háttérben fut tovább az őr alatt — a következő kör NEM indít újat.
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[szemely-write-sync] a háttér-kör hibára futott:', msg)
    lastResult = { attempted: 0, succeeded: 0, retrying: 0, conflicts: 0, errors: [msg] }
  }
}

/**
 * Kompatibilitási belépő (members-page): a gyülekezet-id frissítése + egyetlen
 * azonnali őrzött kör. A triggerkészlet a `write-sync-registry`-ben él.
 */
export function startSzemelyAutoSync(congregationId: string): void {
  if (typeof window === 'undefined') return
  currentCongregationId = congregationId
  void runSzemelySyncGuarded(congregationId)
}

/**
 * Manuális push-kiváltás. Ignorálja az exp-backoff-ot.
 *
 * Ha már fut egy kör (akár egy időtúllépés UTÁN is), NEM indítunk újat —
 * ugyanazt várjuk meg, időkorláttal: időtúllépésnél a hívó hibát kap (a
 * felületen látszik), de a függő sorok nem mennek fel kétszer.
 */
export async function runSzemelySyncManually(
  congregationId: string,
): Promise<SzemelyPushResult> {
  return withSyncTimeout(inditPush(congregationId, true), 'Új tag-szinkron')
}
