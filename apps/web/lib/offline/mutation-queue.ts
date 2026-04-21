/**
 * Mutation Queue — a helyi (offline) változtatások munka-sora.
 *
 * Minden offline írás (insert/update/delete) először ide kerül, majd a
 * sync-orchestrator background pump-ja feltölti a Supabase-re.
 *
 * Életciklus:
 *  1. `enqueue()` — új mutation hozzáadása (optimistic Dexie write UTÁN)
 *  2. `getNextBatch()` — a ready-to-push mutation-ök (nem syncing, nem conflict,
 *     nextRetryAt elmúlt)
 *  3. `markSyncing()` — átállít 'syncing' státuszra a push alatt (hogy ne fusson párhuzamosan)
 *  4. `markSuccess()` — siker után törli a queue-ból, frissíti a Dexie rekordot
 *  5. `markFailed()` — retry backoff-fal (1s, 4s, 16s, 1min, 5min, max 30min)
 *  6. `markConflict()` — 409 után, a _conflicts táblába írja és dialog
 *  7. `markDead()` — 5 retry után dead letter state
 */

import { getDb, type MutationEnvelope } from './db'

// ─────────────────────────────────────────────────────────────────
// Exponential backoff
// ─────────────────────────────────────────────────────────────────

const BACKOFF_MS = [
  1_000,       // 1s
  4_000,       // 4s
  16_000,      // 16s
  60_000,      // 1min
  5 * 60_000,  // 5min
  30 * 60_000, // 30min (max — onnantól mindig 30min)
]

const MAX_RETRY = 5

function getBackoffMs(retryCount: number): number {
  if (retryCount >= BACKOFF_MS.length) return BACKOFF_MS[BACKOFF_MS.length - 1]
  return BACKOFF_MS[retryCount]
}

// ─────────────────────────────────────────────────────────────────
// Enqueue
// ─────────────────────────────────────────────────────────────────

/**
 * Új mutation hozzáadása a queue-hoz. Visszaad a létrehozott envelope id-t.
 *
 * FONTOS: a hívónak kell az optimistic Dexie write-ot is elvégeznie,
 * mielőtt ezt hívja. Ez csak a queue-t frissíti.
 */
export async function enqueue(params: {
  table: string
  op: 'insert' | 'update' | 'delete'
  payload: Record<string, unknown>
  baseRevision: number | null
}): Promise<string> {
  const db = getDb()

  // Unikus id generálás (UUID v4-szerű)
  const id = generateUuid()

  const envelope: MutationEnvelope = {
    id,
    table: params.table,
    op: params.op,
    payload: params.payload,
    baseRevision: params.baseRevision,
    clientTimestamp: Date.now(),
    retryCount: 0,
    nextRetryAt: null, // azonnal feldolgozandó
    status: 'pending',
    errorMsg: null,
  }

  await db._mutation_queue.add(envelope)
  return id
}

// ─────────────────────────────────────────────────────────────────
// Batch fetch (pump használja)
// ─────────────────────────────────────────────────────────────────

/**
 * A feldolgozásra kész mutation-ök lekérése:
 *  - status === 'pending' VAGY 'failed' (retry)
 *  - nextRetryAt null VAGY elmúlt
 */
export async function getNextBatch(limit = 10): Promise<MutationEnvelope[]> {
  const db = getDb()
  const now = Date.now()

  const candidates = await db._mutation_queue
    .where('status')
    .anyOf(['pending', 'failed'])
    .toArray()

  // Manuálisan szűrünk nextRetryAt alapján
  const ready = candidates.filter(
    m => m.nextRetryAt === null || m.nextRetryAt <= now,
  )

  // Prioritás: régebbi mutation-ök előbb (FIFO)
  ready.sort((a, b) => a.clientTimestamp - b.clientTimestamp)

  return ready.slice(0, limit)
}

// ─────────────────────────────────────────────────────────────────
// State transitions
// ─────────────────────────────────────────────────────────────────

export async function markSyncing(id: string): Promise<void> {
  const db = getDb()
  await db._mutation_queue.update(id, { status: 'syncing' })
}

/**
 * Sikeres push — eltávolítjuk a queue-ból, frissítjük a Dexie rekordot
 * a szerver által visszaadott értékekkel (új revision, updated_at).
 */
export async function markSuccess(
  id: string,
  serverResponse?: Record<string, unknown>,
): Promise<void> {
  const db = getDb()
  const envelope = await db._mutation_queue.get(id)
  if (!envelope) return

  // Dexie rekord frissítése a szerver-válasz alapján
  if (serverResponse && envelope.op !== 'delete') {
    const dexieTable = db.table(envelope.table)
    const rowId = serverResponse.id as string | number
    if (rowId !== undefined) {
      await dexieTable.update(rowId, {
        ...serverResponse,
        _syncStatus: 'clean',
        _baseRevision: (serverResponse.revision as number) || 0,
      })
    }
  }

  // Queue-ból törlés
  await db._mutation_queue.delete(id)
}

export async function markFailed(
  id: string,
  errorMsg: string,
): Promise<void> {
  const db = getDb()
  const envelope = await db._mutation_queue.get(id)
  if (!envelope) return

  const newRetryCount = envelope.retryCount + 1
  const newStatus: MutationEnvelope['status'] =
    newRetryCount >= MAX_RETRY ? 'dead' : 'failed'
  const nextRetryAt =
    newStatus === 'dead' ? null : Date.now() + getBackoffMs(envelope.retryCount)

  await db._mutation_queue.update(id, {
    status: newStatus,
    retryCount: newRetryCount,
    nextRetryAt,
    errorMsg,
  })
}

/**
 * 409 Conflict — a szerver-oldali revision eltérő. Az envelope státuszát
 * 'conflict'-re állítjuk, és külön `_conflicts` rekordba írjuk az adatokat.
 */
export async function markConflict(
  id: string,
  serverPayload: Record<string, unknown>,
): Promise<void> {
  const db = getDb()
  const envelope = await db._mutation_queue.get(id)
  if (!envelope) return

  // _conflicts táblába felvesz egy konfliktus-rekordot
  const rowId = String(envelope.payload.id || '')
  if (rowId) {
    // Base payload — a Dexie-ben lévő utolsó clean állapot
    const dexieTable = db.table(envelope.table)
    const currentLocal = await dexieTable.get(envelope.payload.id as string | number)

    await db._conflicts.put({
      table: envelope.table,
      rowId,
      localPayload: envelope.payload,
      serverPayload,
      basePayload: currentLocal as Record<string, unknown> | null,
      detectedAt: Date.now(),
      resolved: false,
    })
  }

  // Envelope status → conflict
  await db._mutation_queue.update(id, {
    status: 'conflict',
    errorMsg: `Konfliktus — server revision eltérő`,
  })
}

/**
 * Dead letter — ember-olvasható ha a user látni akarja a feladható mutációkat.
 */
export async function getDeadLetters(): Promise<MutationEnvelope[]> {
  const db = getDb()
  return await db._mutation_queue.where('status').equals('dead').toArray()
}

/**
 * Egy konkrét mutation újrapróbálása (user kattint "Újrapróba"-ra).
 */
export async function retryMutation(id: string): Promise<void> {
  const db = getDb()
  await db._mutation_queue.update(id, {
    status: 'pending',
    retryCount: 0,
    nextRetryAt: null,
    errorMsg: null,
  })
}

/**
 * Egy konkrét mutation eldobása (user úgy dönt, hogy feladja).
 * A Dexie rekordot is visszaállítjuk a clean állapotra (vagy töröljük ha insert volt).
 */
export async function discardMutation(id: string): Promise<void> {
  const db = getDb()
  const envelope = await db._mutation_queue.get(id)
  if (!envelope) return

  // Dexie-ben a kapcsolódó rekordot kezeljük:
  // - insert eldobása → Dexie-ből is töröljük
  // - update eldobása → visszaállítjuk a baseRevision állapotra (pull-ra bízzuk)
  // - delete eldobása → _pendingDelete flag törlése
  const dexieTable = db.table(envelope.table)
  const rowId = envelope.payload.id as string | number

  if (envelope.op === 'insert' && rowId !== undefined) {
    await dexieTable.delete(rowId)
  } else if (envelope.op === 'delete' && rowId !== undefined) {
    await dexieTable.update(rowId, {
      _pendingDelete: false,
      _syncStatus: 'clean',
    })
  } else if (envelope.op === 'update' && rowId !== undefined) {
    // A server pull fogja visszahozni a server-side állapotot
    await dexieTable.update(rowId, { _syncStatus: 'clean' })
  }

  await db._mutation_queue.delete(id)
}

// ─────────────────────────────────────────────────────────────────
// UUID generator (crypto.randomUUID fallback)
// ─────────────────────────────────────────────────────────────────

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback: nem-kriptografikus, de jó elég a lokális queue-id-nek
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
