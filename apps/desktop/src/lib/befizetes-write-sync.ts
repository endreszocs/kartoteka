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

import { readYearFinalized } from '@kartoteka/core'

import { enqueueEntryExcelRow } from './excel-enqueue'
import { dbSelect } from './local-db'
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

export interface BefizetesPushResult {
  attempted: number
  succeeded: number
  retrying: number
  conflicts: number
  errors: string[]
}

/**
 * P0-20 (audit 2026-08-28): ÁRVA pending-sorok visszasorolása. A core offline
 * mentése két külön lokális írás (pending-sor + outbox-mutation) — a kettő
 * közti crash/hiba árva pending sort hagyott, amit a pusher (amely kizárólag
 * az outboxot olvassa) sosem küldött fel. Minden futás elején az outbox-
 * referencia nélküli 'pending' sorokat újra-enqueue-oljuk a mentéskori
 * payload-alakban. A nyugta a crash-ben elveszett (csak memóriában élt) —
 * az iratszám-fallback áll be, ami a mentéskori default volt.
 */
async function sweepOrphanBefizetesPending(
  backend: ReturnType<typeof getTauriSqliteBackend>,
  errors: string[],
): Promise<void> {
  try {
    const orphans = await dbSelect<{
      id: string
      congregation_id: string
      xkey: string
      osszeg: number
      datum: string
      id_befizetescel: number
      id_szemely: number | null
      id_csalad: number | null
      forrasa: string | null
      iratszam: string
      irattipus: string
      fizetettev: number
      megjegyzes: string | null
      csalad: number
      is_potlas: number
      bankszamla_id: number | null
      userid: string
      created_at: string
    }>(
      `SELECT id, congregation_id, xkey, osszeg, datum, id_befizetescel,
              id_szemely, id_csalad, forrasa, iratszam, irattipus, fizetettev,
              megjegyzes, csalad, is_potlas, bankszamla_id, userid, created_at
         FROM befizetes_pending_local
        WHERE sync_state = 'pending'
          AND server_id IS NULL
          AND id NOT IN (
            SELECT target_id FROM outbox
             WHERE target_table = 'befizetes' AND mutation_id IS NOT NULL
          )`,
    )
    for (const r of orphans) {
      await backend.enqueueMutation({
        id: r.id,
        table: 'befizetes',
        pk: r.id,
        kind: 'insert',
        payload: {
          xkey: r.xkey,
          osszeg: r.osszeg,
          datum: r.datum,
          id_befizetescel: r.id_befizetescel,
          id_szemely: r.id_szemely ?? null,
          id_csalad: r.id_csalad ?? null,
          forrasa: r.forrasa || 'Desktop offline rögzítés',
          iratszam: r.iratszam,
          nyugta: r.iratszam,
          irattipus: r.irattipus,
          fizetettev: r.fizetettev,
          megjegyzes: r.megjegyzes ?? null,
          csalad: Boolean(r.csalad),
          deleted: false,
          congregation_id: r.congregation_id,
          is_potlas: Boolean(r.is_potlas),
          bankszamla_id: r.bankszamla_id ?? null,
          userid: r.userid,
        },
        attempts: 0,
        createdAt: r.created_at,
      })
    }
  } catch (err) {
    errors.push(
      `Árva pending-söprés hiba (befizetés): ${err instanceof Error ? err.message : 'ismeretlen'}`,
    )
  }
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
  // 2026-06-11 (Endre): felhő-írás csak hitelesített ÉS fiók-egyező belépéssel.
  const verified = await getVerifiedSession()
  if (!verified.ok) {
    if (verified.reason === 'user-mismatch') result.errors.push(verified.message)
    return result
  }

  const backend = getTauriSqliteBackend()

  // P0-20: az árva (outbox nélküli) pending sorok visszasorolása, MIELŐTT
  // az outboxot olvasnánk — így ugyanebben a futásban fel is megy a tétel.
  await sweepOrphanBefizetesPending(backend, result.errors)

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

    // P0-5 (audit 2026-08-28): zárt-év újra-ellenőrzés KÖZVETLENÜL a push
    // előtt. Az offline rögzítés óta az évet a weben véglegesíthették — a
    // rögzítéskori (lokális tükrös) kapu csak a tükör frissességéig lát.
    // Véglegesített év → konfliktus (nem néma insert); nem-olvasható
    // állapot → fail-closed retry (backoff), most nem push-olunk.
    const evSzam = Number(String(payload.datum ?? '').slice(0, 4))
    if (Number.isFinite(evSzam) && evSzam >= 2000) {
      const evZar = await readYearFinalized(
        supabase,
        String(payload.congregation_id ?? ''),
        evSzam,
      )
      if (evZar.unknown) {
        try {
          await backend.updateMutationAttempt(mutation.id, {
            attempts: mutation.attempts + 1,
            lastAttemptAt: nowIso,
            lastError: `Év-zár ellenőrzés sikertelen: ${evZar.errorMessage ?? 'ismeretlen'}`,
          })
          result.retrying += 1
        } catch (err) {
          result.errors.push(
            `Mutation-frissítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
          )
        }
        continue
      }
      if (evZar.finalized) {
        try {
          await backend.markBefizetesConflict(
            mutation.pk,
            `A(z) ${evSzam}. évi számadás időközben véglegesítve lett — az offline rögzített tétel nem küldhető fel. Kérj feloldást (javítási engedélyt) az egyházmegyétől.`,
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
        // E3: az offline-rögzített tétel CSAK MOST kap végleges szerver-id-t és
        // iratszámot — innen mehet az Excel-várólistára. SOHA nem mentéskor
        // (az iratszám 23505-konfliktusnál újraosztható), és SOHA a konfliktus-
        // ágon. A hiba itt nem akadhat a sync-be (no-throw helper).
        void enqueueEntryExcelRow({
          type: 'befizetes',
          serverId: Number(data.id),
          congregationId: String(payload.congregation_id ?? ''),
          datum: String(payload.datum ?? ''),
          iratszam: String(payload.iratszam ?? ''),
          irattipus: String(payload.irattipus ?? ''),
          nev: String(payload.forrasa ?? ''),
          osszeg: Number(payload.osszeg ?? 0),
          celId: Number(payload.id_befizetescel ?? 0),
          megjegyzes: (payload.megjegyzes as string | null) ?? null,
          bankszamlaId: (payload.bankszamla_id as number | null) ?? null,
          ev: (payload.fizetettev as number | null) ?? null,
        })
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
