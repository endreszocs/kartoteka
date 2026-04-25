/**
 * befizetes-write-sync — A-M7.9a (2026-04-25).
 *
 * Az offline-rögzített befizetések (`befizetes_pending_local` + outbox) push-
 * szinkronizációja. A `chitanta-sync.ts` mintáját követi, kivéve:
 *   - Tábla: `befizetes` (nem `oblio_szamlak`)
 *   - PK: int8 (server-generált), a lokál `id` TEXT (`local-<uuid>`),
 *     a sikeres push után a `server_id`-be írjuk az int8-ot
 *   - 23505 unique-ütközés a `uniq_befizetes_iratszam_year_congregation`
 *     PARTIAL INDEX-en (lásd `2026-04-25-a-m7-9a-iratszam-pointers.sql`)
 *
 * Triggerei:
 *   1) Online-váltás (`window.online`)
 *   2) Periodikus poll (30 s, ha online)
 *   3) Manuális „Sync most" gomb
 *
 * Konfliktus-szemantika (chitanta-mintával azonos):
 *   - 1..5 attempts → retry (BACKOFF_MS_BY_ATTEMPT)
 *   - 6. → conflict-re billen, mutation törlődik
 *   - 23505 unique-ütközés → AZONNAL conflict (a feloldás A-M7.9b-ben)
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

function shouldSkipByBackoff(mutation: {
  attempts: number
  lastAttemptAt?: string | null
}): boolean {
  if (mutation.attempts === 0) return false
  if (!mutation.lastAttemptAt) return false
  const lastMs = Date.parse(mutation.lastAttemptAt)
  if (!Number.isFinite(lastMs)) return false
  const backoffMs = BACKOFF_MS_BY_ATTEMPT[mutation.attempts] ?? 900_000
  return Date.now() - lastMs < backoffMs
}

export interface BefizetesPushResult {
  attempted: number
  succeeded: number
  retrying: number
  conflicts: number
  errors: string[]
}

/**
 * Egyszer lefut, push-olja a pending befizetés-mutation-öket.
 * Nem dob — minden hiba a result.errors-ba kerül.
 */
export async function pushPendingBefizetes(
  supabase: SupabaseClient = getDesktopSupabase(),
  ignoreBackoff = false,
): Promise<BefizetesPushResult> {
  const result: BefizetesPushResult = {
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

  let mutations: Awaited<ReturnType<typeof backend.getPendingMutations>>
  try {
    mutations = await backend.getPendingMutations(50)
  } catch (err) {
    result.errors.push(
      `Outbox olvasási hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
    )
    return result
  }

  // Csak a `befizetes` insert-eket vesszük át — a chitanta + jövőbeli kiadás
  // saját pusherekben futnak (table-szerinti routing).
  const befizetesMutations = mutations.filter(
    (m) => m.table === 'befizetes' && m.kind === 'insert',
  )

  for (const mutation of befizetesMutations) {
    if (!ignoreBackoff && shouldSkipByBackoff(mutation)) continue

    result.attempted += 1
    const nowIso = new Date().toISOString()
    const payload = (mutation.payload ?? {}) as Record<string, unknown>

    if (mutation.attempts >= MAX_ATTEMPTS) {
      try {
        await backend.markBefizetesConflict(
          mutation.pk,
          `Max próbálkozás elérve (${mutation.attempts}). Utolsó hiba: ${mutation.lastError ?? 'ismeretlen'}. Kérlek nyisd meg a befizetést és ellenőrizd az iratszámot.`,
        )
        await backend.removeMutation(mutation.id)
        result.conflicts += 1
      } catch (err) {
        result.errors.push(
          `Conflict-jelölés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
        )
      }
      continue
    }

    try {
      const { data, error } = await supabase
        .from('befizetes')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (error) {
        // Unique-ütközés: az iratszám a szerveren már létezik (más kliens
        // ugyanezt a számot rögzítette — ez a defensive PARTIAL INDEX-en jön).
        if (error.code === '23505') {
          try {
            await backend.markBefizetesConflict(
              mutation.pk,
              `Az iratszám (${payload.iratszam ?? '?'}, év: ${payload.fizetettev ?? '?'}) a szerveren már foglalt. Nyisd meg a befizetést és állítsd át másik számra (vagy töröld, ha duplikátum).`,
            )
            await backend.removeMutation(mutation.id)
            result.conflicts += 1
          } catch (err) {
            result.errors.push(
              `Unique-conflict rögzítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
            )
          }
          continue
        }

        // Egyéb hiba (hálózat, RLS, validáció) — retry
        const isNetwork = /fetch|network|connect|timeout|econnrefused/i.test(error.message)
        try {
          await backend.updateMutationAttempt(mutation.id, {
            attempts: mutation.attempts + 1,
            lastAttemptAt: nowIso,
            lastError: error.message,
          })
          result.retrying += 1
          pushErrorDedup(
            result.errors,
            isNetwork ? `Hálózati hiba: ${error.message}` : error.message,
          )
        } catch (err) {
          result.errors.push(
            `Mutation-frissítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
          )
        }
        continue
      }

      if (!data?.id) {
        try {
          await backend.updateMutationAttempt(mutation.id, {
            attempts: mutation.attempts + 1,
            lastAttemptAt: nowIso,
            lastError: 'Szerver nem adott ID-t az insert után',
          })
          result.retrying += 1
          pushErrorDedup(result.errors, 'Szerver nem adott ID-t az insert után')
        } catch (err) {
          result.errors.push(
            `Mutation-frissítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
          )
        }
        continue
      }

      // Siker — a lokális sort átjelöljük sync-eltnek + szerver-ID, mutation törölve
      try {
        await backend.markBefizetesSynced(mutation.pk, Number(data.id))
        await backend.removeMutation(mutation.id)
        result.succeeded += 1
      } catch (err) {
        // A szerver-insert sikerült, de a lokális frissítés elbukott — a mutation-t
        // töröljük (különben duplikálnánk a köv. push-kor); a lokál sor pending
        // marad, a user a pending-listából + szerver-listából egyszerre láthatja
        // (átmeneti duplikát-megjelenítés, de nincs DB-szintű duplikátum).
        try {
          await backend.removeMutation(mutation.id)
        } catch {
          /* csendes */
        }
        result.errors.push(
          `Lokális sync-jelölés sikertelen (szerver-sor mentve: ${data.id}): ${err instanceof Error ? err.message : 'ismeretlen'}`,
        )
      }
    } catch (err) {
      try {
        await backend.updateMutationAttempt(mutation.id, {
          attempts: mutation.attempts + 1,
          lastAttemptAt: nowIso,
          lastError: err instanceof Error ? err.message : 'ismeretlen',
        })
        result.retrying += 1
        pushErrorDedup(
          result.errors,
          `Váratlan hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
        )
      } catch (innerErr) {
        result.errors.push(
          `Mutation-frissítés hiba: ${innerErr instanceof Error ? innerErr.message : 'ismeretlen'}`,
        )
      }
    }
  }

  return result
}

function pushErrorDedup(list: string[], msg: string): void {
  if (list.includes(msg)) return
  if (list.length >= 10) return
  list.push(msg)
}

// ─────────────────────────────────────────────────────────────────────────
//  Auto-trigger háttér-pusher
// ─────────────────────────────────────────────────────────────────────────

let pusherInterval: ReturnType<typeof setInterval> | null = null
let onlineListenerAttached = false
let lastRunAt: string | null = null
let inFlight = false
let lastResult: BefizetesPushResult | null = null

export interface BefizetesSyncStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: BefizetesPushResult | null
}

export function getBefizetesSyncStatus(): BefizetesSyncStatus {
  return {
    running: inFlight,
    lastRunAt,
    lastResult,
  }
}

async function runOnceGuarded(): Promise<void> {
  if (inFlight) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  inFlight = true
  try {
    lastResult = await pushPendingBefizetes()
    lastRunAt = new Date().toISOString()
  } finally {
    inFlight = false
  }
}

/**
 * Beállítja az auto-triggereket: online-event + 30s periodic poll.
 * Idempotens — többszöri hívás nem duplikálja a listener-t.
 */
export function startBefizetesAutoSync(): void {
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

/**
 * Manuális push-kiváltás. Ignorálja az exp-backoff-ot (a user explicit kéri).
 */
export async function runBefizetesSyncManually(): Promise<BefizetesPushResult> {
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
    lastResult = await pushPendingBefizetes(getDesktopSupabase(), true)
    lastRunAt = new Date().toISOString()
    return lastResult
  } finally {
    inFlight = false
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  A-M7.9c — Konfliktus-feloldás (befizetés)
// ─────────────────────────────────────────────────────────────────────────

export type BefizetesConflictResolution =
  | { action: 'delete'; localId: string }
  | { action: 'reassign'; localId: string; congregationId: string; ev: number }

export type BefizetesConflictResolutionResult =
  | { success: true; action: 'delete' }
  | { success: true; action: 'reassign'; newSzam: number }
  | { success: false; error: string; walletEmpty?: boolean }

/**
 * A-M7.9c — egy `conflict` állapotú lokális befizetés feloldása.
 *
 *   - `action: 'delete'` — a befizetés teljesen törlődik; a wallet-szám
 *     visszakerül a pool-ba (`used=0`).
 *
 *   - `action: 'reassign'` — új wallet-számra áll át:
 *     1. claim next iratszam-wallet number (atomic)
 *     2. a régi wallet-szám `used=1` marad (audit-trail)
 *     3. updateLocalBefizetesNumber + sync_state='pending'
 *     4. töröljük a régi outbox-mutation-t
 *     5. új outbox-mutation a frissített payload-dal
 *     6. trigger sync (azonnali push)
 *
 * Nem dob — minden hiba a result.error-ba kerül.
 */
export async function resolveBefizetesConflict(
  input: BefizetesConflictResolution,
): Promise<BefizetesConflictResolutionResult> {
  const backend = getTauriSqliteBackend()

  if (input.action === 'delete') {
    try {
      await backend.deleteLocalBefizetes(input.localId)
      // Az outbox-mutation törlése (ha még bent van)
      await backend.removeMutation(input.localId).catch(() => {
        /* csendes — lehet hogy már nincs */
      })
      return { success: true, action: 'delete' }
    } catch (err) {
      return {
        success: false,
        error: `Törlés sikertelen: ${err instanceof Error ? err.message : 'ismeretlen'}`,
      }
    }
  }

  // action === 'reassign'
  try {
    // 1) Új szám a walletből
    const claim = await backend.claimNextIratszamNumber(
      input.congregationId,
      'befizetes',
      input.ev,
      input.localId,
    )
    if (!claim) {
      return {
        success: false,
        error:
          'Üres az offline iratszám-tárca a kért évre. Csatlakozz a hálózatra, és tölts fel legalább egy új sorszámot, mielőtt újra próbálkozol.',
        walletEmpty: true,
      }
    }

    // 2) Lokál sor frissítése
    await backend.updateLocalBefizetesNumber(input.localId, claim.szam)

    // 3) Régi outbox-mutation törlése
    await backend.removeMutation(input.localId).catch(() => {
      /* csendes */
    })

    // 4) Lokál sor olvasása (az új outbox payload-hoz)
    const row = await backend.getLocalBefizetes(input.localId)
    if (!row) {
      return {
        success: false,
        error:
          'A befizetés nem található a lokális DB-ben az újra-enqueue-hoz. (Ritka: a művelet közben törölték?)',
      }
    }

    // 5) Új outbox-mutation a `befizetes` insert-hez
    const newIratszam = String(claim.szam)
    await backend.enqueueMutation({
      id: row.id,
      table: 'befizetes',
      pk: row.id,
      kind: 'insert',
      payload: {
        xkey: row.xkey,
        osszeg: row.osszeg,
        datum: row.datum,
        id_befizetescel: row.id_befizetescel,
        id_szemely: row.id_szemely,
        id_csalad: row.id_csalad,
        forrasa: row.forrasa,
        iratszam: newIratszam,
        nyugta: newIratszam,
        irattipus: row.irattipus,
        fizetettev: row.fizetettev,
        megjegyzes: row.megjegyzes,
        csalad: row.csalad === 1,
        deleted: false,
        congregation_id: row.congregation_id,
        is_potlas: row.is_potlas === 1,
        bankszamla_id: row.bankszamla_id,
        userid: row.userid,
      },
      attempts: 0,
      createdAt: new Date().toISOString(),
    })

    // 6) Trigger sync (a háttérben)
    void runBefizetesSyncManually()

    return { success: true, action: 'reassign', newSzam: claim.szam }
  } catch (err) {
    return {
      success: false,
      error: `Újra-allokálás sikertelen: ${err instanceof Error ? err.message : 'ismeretlen'}`,
    }
  }
}
