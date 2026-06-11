/**
 * kiadas-write-sync — A-M7.9b (2026-04-25).
 *
 * Az offline-rögzített kiadások (`kiadas_pending_local` + outbox) push-
 * szinkronizációja. A `befizetes-write-sync.ts` tükörképe — egyetlen lényegi
 * eltérés: a tábla `kiadas` (nem `befizetes`).
 *
 * Triggerei:
 *   1) Online-váltás (`window.online`)
 *   2) Periodikus poll (30 s, ha online)
 *   3) Manuális „Sync most" gomb
 *
 * Konfliktus-szemantika (chitanta + befizetés mintával azonos):
 *   - 1..5 attempts → retry (BACKOFF_MS_BY_ATTEMPT)
 *   - 6. → conflict, mutation törlődik
 *   - 23505 unique-ütközés (a `uniq_kiadas_iratszam_year_congregation`
 *     PARTIAL INDEX-en) → AZONNAL conflict
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { enqueueEntryExcelRow } from './excel-enqueue'
import { getDesktopSupabase } from './supabase'
import { getTauriSqliteBackend } from './tauri-sqlite-backend'
import { getVerifiedSession } from './verified-session'

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

export interface KiadasPushResult {
  attempted: number
  succeeded: number
  retrying: number
  conflicts: number
  errors: string[]
}

export async function pushPendingKiadas(
  supabase: SupabaseClient = getDesktopSupabase(),
  ignoreBackoff = false,
): Promise<KiadasPushResult> {
  const result: KiadasPushResult = {
    attempted: 0,
    succeeded: 0,
    retrying: 0,
    conflicts: 0,
    errors: [],
  }

  // 2026-06-11 (Endre): felhő-írás csak hitelesített ÉS fiók-egyező belépéssel.
  const verified = await getVerifiedSession()
  if (!verified.ok) {
    if (verified.reason === 'user-mismatch') result.errors.push(verified.message)
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

  // Csak a `kiadas` insert-eket vesszük át — a chitanta + befizetés saját
  // pusherekben futnak (table-szerinti routing).
  const kiadasMutations = mutations.filter(
    (m) => m.table === 'kiadas' && m.kind === 'insert',
  )

  for (const mutation of kiadasMutations) {
    if (!ignoreBackoff && shouldSkipByBackoff(mutation)) continue

    result.attempted += 1
    const nowIso = new Date().toISOString()
    const payload = (mutation.payload ?? {}) as Record<string, unknown>

    if (mutation.attempts >= MAX_ATTEMPTS) {
      try {
        await backend.markKiadasConflict(
          mutation.pk,
          `Max próbálkozás elérve (${mutation.attempts}). Utolsó hiba: ${mutation.lastError ?? 'ismeretlen'}. Kérlek nyisd meg a kiadást és ellenőrizd az iratszámot.`,
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
        .from('kiadas')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (error) {
        if (error.code === '23505') {
          try {
            // Az év a payload-ból nem közvetlen — a `datum`-ból olvasható ki
            const datumStr = String(payload.datum ?? '')
            const ev = datumStr.slice(0, 4)
            await backend.markKiadasConflict(
              mutation.pk,
              `Az iratszám (${payload.iratszam ?? '?'}, év: ${ev}) a szerveren már foglalt. Nyisd meg a kiadást és állítsd át másik számra (vagy töröld, ha duplikátum).`,
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

      try {
        await backend.markKiadasSynced(mutation.pk, Number(data.id))
        // E3: az offline-rögzített kiadás CSAK MOST kap végleges szerver-id-t —
        // innen mehet az Excel-várólistára (no-throw helper, soha mentéskor).
        void enqueueEntryExcelRow({
          type: 'kiadas',
          serverId: Number(data.id),
          congregationId: String(payload.congregation_id ?? ''),
          datum: String(payload.datum ?? ''),
          iratszam: String(payload.iratszam ?? ''),
          irattipus: String(payload.irattipus ?? ''),
          nev: String(payload.atvevo ?? ''),
          osszeg: Number(payload.osszeg ?? 0),
          celId: Number(payload.id_kiadascel ?? 0),
          megjegyzes: (payload.megjegyzes as string | null) ?? null,
          bankszamlaId: (payload.bankszamla_id as number | null) ?? null,
        })
        await backend.removeMutation(mutation.id)
        result.succeeded += 1
      } catch (err) {
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
let lastResult: KiadasPushResult | null = null

export interface KiadasSyncStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: KiadasPushResult | null
}

export function getKiadasSyncStatus(): KiadasSyncStatus {
  return { running: inFlight, lastRunAt, lastResult }
}

async function runOnceGuarded(): Promise<void> {
  if (inFlight) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  inFlight = true
  try {
    lastResult = await pushPendingKiadas()
    lastRunAt = new Date().toISOString()
  } finally {
    inFlight = false
  }
}

export function startKiadasAutoSync(): void {
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

export async function runKiadasSyncManually(): Promise<KiadasPushResult> {
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
    lastResult = await pushPendingKiadas(getDesktopSupabase(), true)
    lastRunAt = new Date().toISOString()
    return lastResult
  } finally {
    inFlight = false
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  A-M7.9c — Konfliktus-feloldás (kiadás)
// ─────────────────────────────────────────────────────────────────────────

export type KiadasConflictResolution =
  | { action: 'delete'; localId: string }
  | { action: 'reassign'; localId: string; congregationId: string; ev: number }

export type KiadasConflictResolutionResult =
  | { success: true; action: 'delete' }
  | { success: true; action: 'reassign'; newSzam: number }
  | { success: false; error: string; walletEmpty?: boolean }

/**
 * A-M7.9c — egy `conflict` állapotú lokális kiadás feloldása. A
 * `resolveBefizetesConflict` mintáját követi, csak a tábla és a payload-mezők
 * mások (atvevoid+atvevo, kedvezmenyezett_cui, vonatkozo_idoszak — nincs
 * id_szemely/id_csalad/csalad/fizetettev).
 */
export async function resolveKiadasConflict(
  input: KiadasConflictResolution,
): Promise<KiadasConflictResolutionResult> {
  const backend = getTauriSqliteBackend()

  if (input.action === 'delete') {
    try {
      await backend.deleteLocalKiadas(input.localId)
      await backend.removeMutation(input.localId).catch(() => {
        /* csendes */
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
    const claim = await backend.claimNextIratszamNumber(
      input.congregationId,
      'kiadas',
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

    await backend.updateLocalKiadasNumber(input.localId, claim.szam)

    await backend.removeMutation(input.localId).catch(() => {
      /* csendes */
    })

    const row = await backend.getLocalKiadas(input.localId)
    if (!row) {
      return {
        success: false,
        error:
          'A kiadás nem található a lokális DB-ben az újra-enqueue-hoz. (Ritka: a művelet közben törölték?)',
      }
    }

    const newIratszam = String(claim.szam)
    await backend.enqueueMutation({
      id: row.id,
      table: 'kiadas',
      pk: row.id,
      kind: 'insert',
      payload: {
        xkey: row.xkey,
        osszeg: row.osszeg,
        datum: row.datum,
        id_kiadascel: row.id_kiadascel,
        iratszam: newIratszam,
        nyugta: newIratszam,
        irattipus: row.irattipus,
        megjegyzes: row.megjegyzes,
        deleted: false,
        congregation_id: row.congregation_id,
        atvevoid: row.atvevoid,
        atvevo: row.atvevo,
        kedvezmenyezett_cui: row.kedvezmenyezett_cui,
        vonatkozo_idoszak: row.vonatkozo_idoszak,
        is_potlas: row.is_potlas === 1,
        bankszamla_id: row.bankszamla_id,
        userid: row.userid,
      },
      attempts: 0,
      createdAt: new Date().toISOString(),
    })

    void runKiadasSyncManually()

    return { success: true, action: 'reassign', newSzam: claim.szam }
  } catch (err) {
    return {
      success: false,
      error: `Újra-allokálás sikertelen: ${err instanceof Error ? err.message : 'ismeretlen'}`,
    }
  }
}
