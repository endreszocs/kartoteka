/**
 * Kartotéka Desktop — Supabase ↔ SQLite szinkronizáció.
 *
 * ## M2.4 (pull-sync, saját profil)
 *   - pullOwnProfile(userId)           — Supabase → profiles_local
 *   - getLocalOwnProfile(userId)       — offline olvasás
 *   - getLastPullIso()                 — utolsó sync-idő info
 *
 * ## M2.5 (push-sync, outbox + optimistic writes)
 *   - updateOwnProfile(userId, patch)  — optimistic local + direkt Supabase v. outbox
 *   - processOutbox()                  — pending outbox-sorok elküldése
 *   - isOnline()                       — online/offline detektor
 *
 * ## M2.6 (conflict detection — revision + updated_at)
 *   - ProfileLocalRow most tartalmaz `revision` és `updated_at` mezőket
 *   - updateOwnProfile conditional: `.eq('revision', expected)` — ha a szerver
 *     oldali revision eltér, 0 sor frissül → konfliktus
 *   - processOutbox ugyanezzel a stratégiával — outbox payload = `{ patch, expected_revision }`
 *   - Konfliktus esetén automatikus re-pull + `conflict: true` visszajelzés
 *   - Retry-helper: getFailedOutboxRows / retryOutboxRow / dismissOutboxRow
 *
 * ## M2.7+ (még hátralevő)
 *   - Több domain-tábla (members, finance, …)
 *   - Delta-sync (updated_at > last_pull)
 *   - User-jelszó-alapú derived kulcs
 */

import { errorMessage } from './error'
import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect, getSetting, setSetting } from './local-db'

// ═════════════════════════════════════════════════════════════════════════
// PULL (M2.4 + M2.6) — Supabase → profiles_local
// ═════════════════════════════════════════════════════════════════════════

/** A `profiles` és `profiles_local` közös, szinkronizált oszlopai. */
export interface ProfileLocalRow {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: string | null
  status: string | null
  congregation_id: string | null
  diocese_id: string | null
  district_id: string | null
  revision: number
  updated_at: string | null
  synced_at: string
}

export interface PullResult {
  pulledRows: number
  lastPullIso: string
}

const LAST_PULL_KEY = 'sync:profiles:last_pull'

export async function pullOwnProfile(userId: string): Promise<PullResult> {
  const supabase = getDesktopSupabase()

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id, revision, updated_at',
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Supabase pull hiba: ${error.message}`)
  }
  if (!data) {
    return { pulledRows: 0, lastPullIso: new Date().toISOString() }
  }

  await dbExecute(
    `INSERT INTO profiles_local
       (id, email, full_name, phone, role, status,
        congregation_id, diocese_id, district_id,
        revision, updated_at, synced_at)
     VALUES
       (?1, ?2, ?3, ?4, ?5, ?6,
        ?7, ?8, ?9,
        ?10, ?11, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       full_name = excluded.full_name,
       phone = excluded.phone,
       role = excluded.role,
       status = excluded.status,
       congregation_id = excluded.congregation_id,
       diocese_id = excluded.diocese_id,
       district_id = excluded.district_id,
       revision = excluded.revision,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      data.id,
      data.email,
      data.full_name,
      data.phone,
      data.role,
      data.status,
      data.congregation_id,
      data.diocese_id,
      data.district_id,
      // Ha az SQL-migráció még nem futott a Supabase-en, a revision/updated_at
      // hiányozhat a válaszból — fallback 0 / null
      (data as { revision?: number }).revision ?? 0,
      (data as { updated_at?: string }).updated_at ?? null,
    ],
  )

  const now = new Date().toISOString()
  await setSetting(LAST_PULL_KEY, now)
  return { pulledRows: 1, lastPullIso: now }
}

export async function getLocalOwnProfile(userId: string): Promise<ProfileLocalRow | null> {
  const rows = await dbSelect<ProfileLocalRow>(
    `SELECT id, email, full_name, phone, role, status,
            congregation_id, diocese_id, district_id,
            revision, updated_at, synced_at
       FROM profiles_local WHERE id = ?1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function getLastPullIso(): Promise<string | null> {
  return getSetting(LAST_PULL_KEY)
}

// ═════════════════════════════════════════════════════════════════════════
// PUSH (M2.5) + KONFLIKTUS-KEZELÉS (M2.6)
// ═════════════════════════════════════════════════════════════════════════

/** Outbox-sor struktúra (v1 séma óta stabil). */
export interface OutboxRow {
  id: number
  op: 'insert' | 'update' | 'delete'
  target_table: string
  target_id: string | null
  payload: string // JSON-string
  status: 'pending' | 'sent' | 'failed'
  created_at: string
  retry_count: number
  last_error: string | null
}

/** M2.6 outbox-payload forma: tartalmazza az elvárt revision-t. */
interface OutboxUpdatePayload {
  patch: Record<string, unknown>
  expected_revision: number
}

/**
 * Online-detektor: `navigator.onLine` + 2 mp-es HEAD-ping a Supabase /auth/v1/health-re.
 */
export async function isOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false
  }
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 2000)
    const url = import.meta.env.VITE_SUPABASE_URL
    if (!url) return false
    const res = await fetch(`${url}/auth/v1/health`, {
      method: 'HEAD',
      signal: controller.signal,
    }).catch(() => null)
    clearTimeout(t)
    return Boolean(res)
  } catch {
    return false
  }
}

/** A `updateOwnProfile` visszaadott state-je. */
export interface UpdateResult {
  queuedToOutbox: boolean
  conflict: boolean
  /** Ha sikeres online-írás volt, itt a frissen érkezett revision. */
  newRevision?: number
}

/**
 * Saját profil részleges frissítése.
 *
 * Lépések:
 *   1. Optimisztikusan lokálisan írunk (felhasználói élmény: azonnali)
 *   2. Online? → Supabase conditional UPDATE `.eq('revision', expected)`
 *      - Sikeres válasz és 1 sor → új revision visszatárolódik lokálisan
 *      - 0 sor → konfliktus: `pullOwnProfile()` frissíti a helyi cache-t,
 *        a user újra kipróbálhatja
 *   3. Offline vagy hiba → outbox-ba kerül `{ patch, expected_revision }` payload-dal
 */
export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<ProfileLocalRow, 'phone' | 'full_name'>>,
): Promise<UpdateResult> {
  // A patch-t csak a tényleges mezőkre szűkítjük (ne küldjünk null-t, ami
  // a Supabase-nek sql NULL-t jelentene — kivéve, ha a user explicit szeretné).
  const effectivePatch: Record<string, unknown> = {}
  if (patch.phone !== undefined) effectivePatch.phone = patch.phone
  if (patch.full_name !== undefined) effectivePatch.full_name = patch.full_name

  if (Object.keys(effectivePatch).length === 0) {
    return { queuedToOutbox: false, conflict: false }
  }

  // 1. Optimistic local — a revision-t NEM változtatjuk (a szerver trigger fog)
  const setClauses: string[] = []
  const params: (string | null)[] = []
  let idx = 1
  if (patch.phone !== undefined) {
    setClauses.push(`phone = ?${idx++}`)
    params.push(patch.phone)
  }
  if (patch.full_name !== undefined) {
    setClauses.push(`full_name = ?${idx++}`)
    params.push(patch.full_name)
  }
  params.push(userId)
  await dbExecute(
    `UPDATE profiles_local SET ${setClauses.join(', ')}, synced_at = datetime('now')
      WHERE id = ?${idx}`,
    params,
  )

  // 2. Current local revision — ez lesz az `expected_revision`
  const local = await getLocalOwnProfile(userId)
  const expectedRevision = local?.revision ?? 0

  // 3. Online? Conditional Supabase UPDATE
  if (await isOnline()) {
    try {
      const supabase = getDesktopSupabase()
      const { data, error } = await supabase
        .from('profiles')
        .update(effectivePatch)
        .eq('id', userId)
        .eq('revision', expectedRevision)
        .select('revision, updated_at')

      if (error) throw error

      if (!data || data.length === 0) {
        // Konfliktus: a szerver-oldali revision eltér az általunk ismerttől.
        // Re-pull, hogy a UI a szerver-változatot mutassa.
        await pullOwnProfile(userId)
        return { queuedToOutbox: false, conflict: true }
      }

      // Sikeres — frissítsük a lokális revision-t / updated_at-et
      const srv = data[0] as { revision?: number; updated_at?: string }
      await dbExecute(
        `UPDATE profiles_local SET revision = ?1, updated_at = ?2, synced_at = datetime('now')
          WHERE id = ?3`,
        [srv.revision ?? expectedRevision + 1, srv.updated_at ?? null, userId],
      )
      return {
        queuedToOutbox: false,
        conflict: false,
        newRevision: srv.revision,
      }
    } catch {
      // Supabase hiba → fallback outbox
    }
  }

  // 4. Offline vagy hiba: outbox
  const payload: OutboxUpdatePayload = {
    patch: effectivePatch,
    expected_revision: expectedRevision,
  }
  await enqueueOutbox('update', 'profiles', userId, payload)
  return { queuedToOutbox: true, conflict: false }
}

export async function enqueueOutbox(
  op: OutboxRow['op'],
  targetTable: string,
  targetId: string | null,
  payload: unknown,
): Promise<void> {
  await dbExecute(
    `INSERT INTO outbox (op, target_table, target_id, payload)
     VALUES (?1, ?2, ?3, ?4)`,
    [op, targetTable, targetId, JSON.stringify(payload)],
  )
}

/**
 * Végigmegy a pending outbox-sorokon és elküldi őket a Supabase-nek.
 *
 * - `update` op + `{patch, expected_revision}` payload → conditional update
 * - `update` op + legacy payload (csak `patch`) → unconditional update (pre-M2.6)
 * - `insert`, `delete` — mint eddig
 *
 * Konfliktus (0 sor frissül a conditional update-nél) → status='failed',
 * last_error='conflict: server revision moved'.
 */
export async function processOutbox(): Promise<{
  attempted: number
  sent: number
  failed: number
  conflicts: number
}> {
  const online = await isOnline()
  if (!online) {
    return { attempted: 0, sent: 0, failed: 0, conflicts: 0 }
  }

  const pending = await dbSelect<OutboxRow>(
    `SELECT id, op, target_table, target_id, payload, status, created_at, retry_count, last_error
       FROM outbox
      WHERE status = 'pending'
      ORDER BY created_at ASC`,
  )

  const stats = { attempted: pending.length, sent: 0, failed: 0, conflicts: 0 }
  const supabase = getDesktopSupabase()

  for (const row of pending) {
    let payload: unknown
    try {
      payload = JSON.parse(row.payload)
    } catch {
      await markOutboxFailed(row.id, 'érvénytelen JSON payload', row.retry_count + 1)
      stats.failed++
      continue
    }

    try {
      if (row.op === 'update' && row.target_id) {
        const { patch, expectedRevision } = destructureUpdatePayload(payload)

        let query = supabase.from(row.target_table).update(patch).eq('id', row.target_id)

        // M2.6 conditional: ha ismerjük az elvárt revision-t, hozzáadjuk a WHERE-hez
        if (expectedRevision !== null) {
          query = query.eq('revision', expectedRevision)
        }

        const { data, error } = await query.select('revision')
        if (error) throw error

        if (expectedRevision !== null && (!data || data.length === 0)) {
          // Konfliktus
          await markOutboxFailed(
            row.id,
            'conflict: a szerver-oldali revision eltér (sor időközben frissült)',
            row.retry_count + 1,
          )
          stats.conflicts++
          continue
        }
      } else if (row.op === 'insert') {
        const { error } = await supabase.from(row.target_table).insert(payload)
        if (error) throw error
      } else if (row.op === 'delete' && row.target_id) {
        const { error } = await supabase
          .from(row.target_table)
          .delete()
          .eq('id', row.target_id)
        if (error) throw error
      } else {
        throw new Error(
          `Érvénytelen outbox-művelet: op=${row.op}, target_id=${row.target_id}`,
        )
      }

      await dbExecute(`UPDATE outbox SET status = 'sent' WHERE id = ?1`, [row.id])
      stats.sent++
    } catch (err: unknown) {
      const msg = errorMessage(err)
      await markOutboxFailed(row.id, msg, row.retry_count + 1)
      stats.failed++
    }
  }

  return stats
}

function destructureUpdatePayload(payload: unknown): {
  patch: Record<string, unknown>
  expectedRevision: number | null
} {
  // M2.6 forma: { patch, expected_revision }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'patch' in payload &&
    typeof (payload as Record<string, unknown>).patch === 'object'
  ) {
    const p = payload as OutboxUpdatePayload
    return {
      patch: p.patch,
      expectedRevision: typeof p.expected_revision === 'number' ? p.expected_revision : null,
    }
  }
  // Legacy (pre-M2.6): a teljes object a patch, nincs expected_revision
  return {
    patch: (payload ?? {}) as Record<string, unknown>,
    expectedRevision: null,
  }
}

async function markOutboxFailed(id: number, lastError: string, retryCount: number): Promise<void> {
  await dbExecute(
    `UPDATE outbox SET status = 'failed', last_error = ?1, retry_count = ?2 WHERE id = ?3`,
    [lastError, retryCount, id],
  )
}

// ═════════════════════════════════════════════════════════════════════════
// M2.6 — failed outbox management
// ═════════════════════════════════════════════════════════════════════════

export async function getFailedOutboxRows(): Promise<OutboxRow[]> {
  return dbSelect<OutboxRow>(
    `SELECT id, op, target_table, target_id, payload, status, created_at, retry_count, last_error
       FROM outbox
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT 20`,
  )
}

/** Újra pending-re állít egy failed sort, hogy a következő sync megpróbálja. */
export async function retryOutboxRow(id: number): Promise<void> {
  await dbExecute(
    `UPDATE outbox SET status = 'pending', last_error = NULL WHERE id = ?1`,
    [id],
  )
}

/** Végleg törli a failed sort (pl. a user megszavazta, hogy szemétbe). */
export async function dismissOutboxRow(id: number): Promise<void> {
  await dbExecute(`DELETE FROM outbox WHERE id = ?1`, [id])
}
