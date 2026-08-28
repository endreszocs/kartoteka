/**
 * chitanta-sync — offline-kiállított chitanțák push-szinkronizációja.
 *
 * A-M7.2d2c (2026-04-24) — a `chitantak_local` + outbox sorok feltöltése
 * a szerverre, amint a gép online. Három triggere van:
 *
 *   1) Online-váltás (`window.addEventListener('online')`) — azonnal push
 *   2) Periodikus poll (30s-onként, ha online) — a háttérben folyamatosan
 *   3) Manuális: a lelkész „Sync most" gombja (lásd RecentChitantasSection)
 *
 * A pusher egyszerre max 50 mutation-t dolgoz fel (konfigurálható), hogy a
 * hálózat-spike-okat szétossza. Exponential backoff-ot NEM implementálunk
 * még — a next-iteration (A-M7.2d2d) hozhatja, ha a retry-probléma valós.
 *
 * Konfliktus-szemantika (MAX_ATTEMPTS):
 *   - 1..5 kísérlet: retry (updateMutationAttempt); a mutation pending marad
 *   - 6. kísérlet: a sor `sync_state='conflict'` állapotba kerül,
 *     a mutation törlődik (többé nem próbáljuk), a user kézi rendezi
 *
 * Unique-ütközés (sorozat + szám a szerveren már létezik — pl. admin más
 * gépről ugyanazt a számot lefoglalta): AZONNAL conflict-re billen,
 * nincs retry (hiábavaló lenne).
 *
 * Ez a modul DESKTOP-SPECIFIKUS — a web oldalon a chitanță mindig
 * szinkron-kiállítva kerül az `oblio_szamlak`-ba, nincs offline-outbox.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { getDesktopSupabase } from './supabase'
import { getTauriSqliteBackend } from './tauri-sqlite-backend'
import { getVerifiedSession } from './verified-session'

const MAX_ATTEMPTS = 5

/**
 * Exponenciális backoff-sávok az automatikus retry-okhoz.
 *
 * A `pushPendingChitantas` skippeli azt a mutation-t, aminek `last_attempt_at`
 * + backoff(`attempts`) nagyobb mint a jelenlegi idő — így nem minden 30 s-es
 * poll próbálja meg ugyanazt a sort, ha az eddigi próbálkozások gyors
 * egymásutánban hibásak voltak.
 *
 * Értékek:
 *   attempts=1 → 30 s  (első retry a 30s-es poll-kor)
 *   attempts=2 → 1 perc
 *   attempts=3 → 2 perc
 *   attempts=4 → 5 perc
 *   attempts=5 → 15 perc (a 6. kísérletnél meghaladja a MAX_ATTEMPTS → conflict)
 *
 * Manuális „Sync most" gomb **ignorálja** a backoff-ot (runChitantaSyncManually
 * közvetlenül hívja a pushPendingChitantas-t `force=true`-val).
 */
const BACKOFF_MS_BY_ATTEMPT: Record<number, number> = {
  0: 0, // első futás — nincs várakozás
  1: 30_000, // 30 s
  2: 60_000, // 1 perc
  3: 120_000, // 2 perc
  4: 300_000, // 5 perc
  5: 900_000, // 15 perc
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

export interface ChitantaPushResult {
  /** Hány mutation-t próbáltunk push-olni ebben a körben. */
  attempted: number
  /** Sikeres push (lokális sor `synced` + server_id, mutation törölve). */
  succeeded: number
  /** Hálózati / átmeneti hiba — újra próbáljuk. */
  retrying: number
  /** Konfliktusra billent (unique vagy max-retry) — user kézi rendezi. */
  conflicts: number
  /** Hiba-üzenetek (max 10, de-dup-olt). */
  errors: string[]
}

/**
 * Egyszer lefut, végigmegy a pending chitanta-mutation-ökön,
 * feltölti a szerverre, és frissíti a lokális állapotot.
 *
 * **Nem dob** — minden hiba a result.errors-ba kerül. Ez azért fontos,
 * hogy a hívók (window.online listener, setInterval) ne borítsák meg az
 * event loop-ot.
 */
/**
 * Egyszer lefut, végigmegy a pending chitanta-mutation-ökön,
 * feltölti a szerverre, és frissíti a lokális állapotot.
 *
 * `ignoreBackoff=true` (manuális „Sync most" hívás) — a BACKOFF_MS_BY_ATTEMPT
 * skip-feltétel kihagyva, minden mutation-t próbál (kivéve a max-attempts-en).
 */
export async function pushPendingChitantas(
  supabase: SupabaseClient = getDesktopSupabase(),
  ignoreBackoff = false,
): Promise<ChitantaPushResult> {
  const result: ChitantaPushResult = {
    attempted: 0,
    succeeded: 0,
    retrying: 0,
    conflicts: 0,
    errors: [],
  }

  // Ha nincs aktív session (pl. offline-mode PIN-belépés, refresh lejárt),
  // ne futtassunk insert-et — a supabase 401-et ad, és a retry-counter
  // hamar max-hoz érne, amitől minden lokális chitanta conflict-ra menne.
  // Várjuk meg, amíg a user újra online-ban lép be.
  // 2026-06-11 (Endre): a felhő-írás CSAK hitelesített ÉS fiók-egyező
  // belépéssel mehet — más fiók alatt a helyi tételek nem kerülhetnek fel.
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

  // Csak a chitanța-inserteket push-oljuk — egyéb mutation-t a későbbi
  // modulok saját pusher-ei kezelik (pl. profiles update a lib/sync.ts-ben).
  const chitantaMutations = mutations.filter(
    (m) => m.table === 'oblio_szamlak' && m.kind === 'insert',
  )

  for (const mutation of chitantaMutations) {
    // A-M7.2e — exp-backoff: ne fusson a retry, ha az előző után még a
    // backoff-ablakon belül vagyunk. Manuális hívásnál (ignoreBackoff)
    // átlépjük ezt.
    if (!ignoreBackoff && shouldSkipByBackoff(mutation)) {
      continue
    }

    result.attempted += 1
    const nowIso = new Date().toISOString()
    const payload = (mutation.payload ?? {}) as Record<string, unknown>

    // P3-21 (audit 2026-08-28): hálózati hibánál plafonos örök retry, végleges
    // konfliktus csak nem-hálózati tartós hibára — részletes indoklás a
    // befizetes-write-sync azonos blokkjánál.
    if (mutation.attempts >= MAX_ATTEMPTS) {
      const halozatiHiba = /fetch|network|connect|timeout|econnrefused|offline/i.test(
        mutation.lastError ?? '',
      )
      if (!halozatiHiba) {
        try {
          await backend.markChitantaConflict(
            mutation.pk,
            `Többszöri próbálkozás (${mutation.attempts}×) után sem sikerült felküldeni. ` +
              `Utolsó hiba: ${mutation.lastError ?? 'ismeretlen'}. Nyisd meg a chitantát, ` +
              'és a hibaüzenet szerint javítsd vagy rögzítsd újra.',
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
      // hálózati: átesünk a normál push-ágra — újrapróbálás plafonos backoffal
    }

    try {
      const { data, error } = await supabase
        .from('oblio_szamlak')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (error) {
        // Unique-constraint: sorozat+szám ütközött — AZONNAL conflict.
        // (Az admin vagy egy másik gép lefoglalta ugyanazt a számot — retry
        // értelmetlen, manuálisan kell másik számra áthelyezni.)
        if (error.code === '23505') {
          try {
            await backend.markChitantaConflict(
              mutation.pk,
              `A ${payload.sorozat ?? '?'}/${payload.szam ?? '?'} sorszám a szerveren már foglalt. Nyisd meg a chitantát és állítsd át másik számra.`,
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

        // Egyéb hiba (hálózat, RLS, validáció) — retry, kivéve ha már a max-nál
        // vagyunk (a fenti check lefogta, de biztonsági háló).
        const isNetwork = /fetch|network|connect|timeout|econnrefused/i.test(error.message)
        try {
          await backend.updateMutationAttempt(mutation.id, {
            attempts: mutation.attempts + 1,
            lastAttemptAt: nowIso,
            lastError: error.message,
          })
          result.retrying += 1
          pushErrorDedup(result.errors, isNetwork ? `Hálózati hiba: ${error.message}` : error.message)
        } catch (err) {
          result.errors.push(
            `Mutation-frissítés hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
          )
        }
        continue
      }

      if (!data?.id) {
        // A szerver elfogadta, de nem adott ID-t — gyanús, inkább retry
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

      // Siker — a lokális sort átjelöljük sync-eltnek, és a mutation-t töröljük
      try {
        await backend.markChitantaSynced(mutation.pk, data.id as string)
        await backend.removeMutation(mutation.id)
        result.succeeded += 1
      } catch (err) {
        // A szerver-insert sikerült, de a lokális frissítés elbukott — ez
        // ritka és rossz helyzet (a mutation bent marad, és a köv. push-kor
        // duplikál insertet próbálna). A mutation-t MÉG IS töröljük, hogy
        // a duplikációt elkerüljük; a lokális sor sync_state=pending marad,
        // amit a user a RecentChitantasSection-ben lát, de a server-listában
        // is ott lesz → duplikát megjelenítés.
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
      // Catch-all (CORS, DNS, váratlan) — retry
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

/**
 * De-duplikált error-push — max 10 unique üzenet a log-spam elkerülésére.
 */
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

/**
 * A legutóbbi push eredménye — a UI sync-indicator-ja ebből olvas.
 * A closure csak ugyanazon az event-loop-on belül válaszos — de ez a
 * jelenleg gondolt desktopra elég, mert a `RecentChitantasSection` és a
 * pusher ugyanabban a process-ben futnak.
 */
let lastResult: ChitantaPushResult | null = null

export interface SyncStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: ChitantaPushResult | null
}

export function getChitantaSyncStatus(): SyncStatus {
  return {
    running: inFlight,
    lastRunAt,
    lastResult,
  }
}

/**
 * Indít egy push-szál-t, ha nincs már folyamatban. Idempotens.
 */
async function runOnceGuarded(): Promise<void> {
  if (inFlight) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  inFlight = true
  try {
    lastResult = await pushPendingChitantas()
    lastRunAt = new Date().toISOString()
  } finally {
    inFlight = false
  }
}

/**
 * Beállítja az auto-triggereket: online-event + 30s periodic poll.
 * Idempotens — többszöri hívás nem duplikálja a listener-t.
 *
 * Az `App.tsx` (vagy egy top-level provider) hívja egyszer az app
 * indulásakor.
 */
export function startChitantaAutoSync(): void {
  if (typeof window === 'undefined') return

  // Online-váltás → azonnali push
  if (!onlineListenerAttached) {
    window.addEventListener('online', () => {
      void runOnceGuarded()
    })
    onlineListenerAttached = true
  }

  // Periodic poll — 30 mp
  if (!pusherInterval) {
    pusherInterval = setInterval(() => {
      void runOnceGuarded()
    }, 30_000)
  }

  // Első futás az induláskor (ha épp online)
  void runOnceGuarded()
}

// ─────────────────────────────────────────────────────────────────────────
//  A-M7.2d2d — Konfliktus-feloldás
// ─────────────────────────────────────────────────────────────────────────

export type ConflictResolution =
  | {
      action: 'delete'
      localId: string
    }
  | {
      action: 'reassign'
      localId: string
      congregationId: string
      /** A user választása — vagy az aktuális sorozat (default), vagy másik */
      sorozat?: string | null
    }

export type ConflictResolutionResult =
  | { success: true; action: 'delete' }
  | { success: true; action: 'reassign'; newSorozat: string; newSzam: number }
  | { success: false; error: string; walletEmpty?: boolean }

/**
 * A-M7.2d2d — egy `conflict` állapotú lokális chitanța feloldása:
 *
 *   - `action: 'delete'` — a chitanta teljesen törlődik; a wallet-szám
 *     visszakerül a pool-ba (`used=0`). A user manuálisan újra-kiállíthatja.
 *
 *   - `action: 'reassign'` — új wallet-számra áll át:
 *     1. claim next wallet number (atomikus, a `chitanta_wallet_claim_next` RPC)
 *     2. a régi wallet-szám `used=1` marad (audit-trail: a szerver elvette)
 *     3. `updateLocalChitantaNumber` — az új számmal, `sync_state='pending'`
 *     4. töröljük a régi outbox-mutation-t (ha még bent van)
 *     5. új outbox-mutation a frissített payload-dal
 *     6. trigger sync (a user rögtön próbálja felküldeni)
 *
 * Nem dob — minden hiba a result.error-ba kerül.
 */
export async function resolveChitantaConflict(
  input: ConflictResolution,
): Promise<ConflictResolutionResult> {
  const backend = getTauriSqliteBackend()

  if (input.action === 'delete') {
    try {
      await backend.deleteLocalChitanta(input.localId)
      // Az outbox-mutation-t is töröljük, ha még nem volt eltávolítva a
      // conflict-flag-gel egyszerre. Kicsi a kockázat, hogy már nincs ott,
      // ezért a removeMutation hibát elnyomjuk.
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
    // 1) Kiveszünk új számot a walletből (atomikus)
    const claim = await backend.claimNextWalletNumber(
      input.congregationId,
      input.sorozat ?? null,
      input.localId,
    )
    if (!claim) {
      return {
        success: false,
        error:
          'Üres az offline szám-tárca. Csatlakozz a hálózatra, és tölts fel legalább egy új sorszámot, mielőtt újra próbálkozol.',
        walletEmpty: true,
      }
    }

    // 2) Frissítjük a lokális chitanta-sort az új sorozattal + számmal
    await backend.updateLocalChitantaNumber(
      input.localId,
      claim.sorozat,
      claim.szam,
    )

    // 3) A régi outbox-mutation-t töröljük
    await backend.removeMutation(input.localId).catch(() => {
      /* csendes */
    })

    // 4) A chitanta-local olvassa újra (a szerver-insert payload-hoz)
    const row = await backend.getLocalChitanta(input.localId)

    if (!row) {
      return {
        success: false,
        error:
          'A chitanta nem található a lokális DB-ben az újra-enqueue-hoz. (Ritka: a művelet közben törölték?)',
      }
    }

    // 5) Új outbox-mutation
    await backend.enqueueMutation({
      id: row.id,
      table: 'oblio_szamlak',
      pk: row.id,
      kind: 'insert',
      payload: {
        congregation_id: row.congregation_id,
        oblio_fiok_id: null,
        tipus: 'chitanta_papir',
        sorozat: row.sorozat,
        szam: row.szam,
        szamla_datum: row.szamla_datum,
        klienesseg_nev: row.klienesseg_nev,
        klienesseg_cui: row.klienesseg_cui,
        klienesseg_cim: row.klienesseg_cim,
        osszeg_net: row.osszeg_brut,
        osszeg_tva: 0,
        osszeg_brut: row.osszeg_brut,
        e_factura_status: 'not_applicable',
        reprezentand: row.reprezentand,
        befizetes_id: row.befizetes_id,
        megjegyzes: row.megjegyzes,
        issued_by: row.issued_by,
        collected_at: row.collected_at,
      },
      attempts: 0,
      createdAt: new Date().toISOString(),
    })

    // 6) Trigger sync (a háttérben) — nem várjuk meg, azonnal visszatérünk
    //    (a user látni fogja a „sync most" gombbal a visszajelzést, vagy
    //    a 30s-es poll megcsinálja).
    void runChitantaSyncManually()

    return {
      success: true,
      action: 'reassign',
      newSorozat: claim.sorozat,
      newSzam: claim.szam,
    }
  } catch (err) {
    return {
      success: false,
      error: `Újra-allokálás sikertelen: ${err instanceof Error ? err.message : 'ismeretlen'}`,
    }
  }
}

/**
 * Manuális push-kiváltás (pl. „Sync most" gomb). Ugyanaz a guard,
 * mint az automatikusnál — ha már fut, visszaadja a folyamatban lévő
 * eredményét.
 *
 * Promise-t ad vissza, hogy a UI meg tudja várni és frissíteni tudja
 * a listát utána.
 */
export async function runChitantaSyncManually(): Promise<ChitantaPushResult> {
  if (inFlight) {
    // Már fut — várjuk meg (egyszerű poll-lal, 100ms)
    while (inFlight) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return lastResult ?? {
      attempted: 0,
      succeeded: 0,
      retrying: 0,
      conflicts: 0,
      errors: [],
    }
  }
  inFlight = true
  try {
    // A-M7.2e — manuális hívás ignorálja az exp-backoff-ot
    // (a user explicit kéri: "most próbáld").
    lastResult = await pushPendingChitantas(getDesktopSupabase(), true)
    lastRunAt = new Date().toISOString()
    return lastResult
  } finally {
    inFlight = false
  }
}
