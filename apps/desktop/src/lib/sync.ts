/**
 * Kartotéka Desktop — Supabase ↔ SQLite szinkronizáció.
 *
 * ## M2.4 (pull-sync, saját profil)
 *   - pullOwnProfile(userId)           — Supabase → profiles_local
 *   - getLocalOwnProfile(userId)       — offline olvasás
 *   - getLastPullIso()                 — utolsó sync-idő info
 *
 * ## M2.5 (push-sync, outbox + optimistic writes)
 *   - updateOwnProfile(userId, patch)  — optimistic local + outbox v. direkt Supabase
 *   - processOutbox()                  — pending outbox-sorok elküldése a Supabase-nek
 *   - isOnline()                       — online/offline detektor (navigator.onLine + ping)
 *
 * ## M2.6+ (még hátralevő)
 *   - Több domain-tábla (members, finance, …)
 *   - Konfliktus-kezelés (revision / updated_at)
 *   - User-jelszó-alapú derived kulcs
 */

import { getDesktopSupabase } from './supabase'
import { dbExecute, dbSelect, getSetting, setSetting } from './local-db'

// ═════════════════════════════════════════════════════════════════════════
// PULL (M2.4) — Supabase → profiles_local
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
  synced_at: string
}

/** A `pullOwnProfile` visszaadott statisztikája. */
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
      'id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id',
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
       (id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id, synced_at)
     VALUES
       (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       full_name = excluded.full_name,
       phone = excluded.phone,
       role = excluded.role,
       status = excluded.status,
       congregation_id = excluded.congregation_id,
       diocese_id = excluded.diocese_id,
       district_id = excluded.district_id,
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
    ],
  )

  const now = new Date().toISOString()
  await setSetting(LAST_PULL_KEY, now)
  return { pulledRows: 1, lastPullIso: now }
}

export async function getLocalOwnProfile(userId: string): Promise<ProfileLocalRow | null> {
  const rows = await dbSelect<ProfileLocalRow>(
    `SELECT id, email, full_name, phone, role, status,
            congregation_id, diocese_id, district_id, synced_at
       FROM profiles_local WHERE id = ?1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function getLastPullIso(): Promise<string | null> {
  return getSetting(LAST_PULL_KEY)
}

// ═════════════════════════════════════════════════════════════════════════
// PUSH (M2.5) — optimistic local writes + outbox drain
// ═════════════════════════════════════════════════════════════════════════

/** Az outbox-sor struktúrája (M2.1 óta a séma stabil). */
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

/**
 * Online-detektor. Két lépés:
 *   1. `navigator.onLine` — gyors, de nem mindig pontos (VPN, captive portal stb.)
 *   2. HEAD-kérés a Supabase REST endpoint-ra — valódi connectivity-check
 *
 * Timeout: 2 mp — ha ezen belül nem válaszol, offline-nak vesszük.
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

/**
 * Saját profil részleges frissítése (phone / full_name / … — bármelyik nem-védett oszlop).
 *
 * Viselkedés:
 *   - **Online**: közvetlen Supabase `update()` + lokális `profiles_local` frissítés
 *   - **Offline**: lokális `profiles_local` frissítés (optimistic) + outbox-sor beírás
 *
 * A return-ben `queuedToOutbox = true`, ha a hívás offline-módban futott.
 */
export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<ProfileLocalRow, 'phone' | 'full_name'>>,
): Promise<{ queuedToOutbox: boolean }> {
  // 1. Mindig optimistán frissítjük a lokális DB-t (UX: azonnali visszajelzés)
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
  if (setClauses.length === 0) {
    return { queuedToOutbox: false }
  }
  params.push(userId)
  await dbExecute(
    `UPDATE profiles_local
        SET ${setClauses.join(', ')}, synced_at = datetime('now')
      WHERE id = ?${idx}`,
    params,
  )

  // 2. Online: közvetlenül a Supabase-be is. Offline: outbox-ba kerül.
  const online = await isOnline()
  if (online) {
    try {
      const supabase = getDesktopSupabase()
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
      return { queuedToOutbox: false }
    } catch {
      // Valamiért mégsem ment át (pl. Supabase 5xx, RLS-gond)
      // → queue-oljuk biztonságosan
    }
  }

  await enqueueOutbox('update', 'profiles', userId, patch)
  return { queuedToOutbox: true }
}

/** Létrehoz egy pending sort az outbox-ban. */
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
 * Sikerre: `status='sent'`. Hibára: `status='failed'`, retry_count++, last_error.
 *
 * Visszaad: `{ attempted, sent, failed }` statisztikát.
 */
export async function processOutbox(): Promise<{
  attempted: number
  sent: number
  failed: number
}> {
  const online = await isOnline()
  if (!online) {
    return { attempted: 0, sent: 0, failed: 0 }
  }

  const pending = await dbSelect<OutboxRow>(
    `SELECT id, op, target_table, target_id, payload, status, created_at, retry_count, last_error
       FROM outbox
      WHERE status = 'pending'
      ORDER BY created_at ASC`,
  )

  const stats = { attempted: pending.length, sent: 0, failed: 0 }
  const supabase = getDesktopSupabase()

  for (const row of pending) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(row.payload)
    } catch {
      await markOutboxFailed(row.id, 'érvénytelen JSON payload', row.retry_count + 1)
      stats.failed++
      continue
    }

    try {
      if (row.op === 'update' && row.target_id) {
        const { error } = await supabase
          .from(row.target_table)
          .update(payload)
          .eq('id', row.target_id)
        if (error) throw error
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
        throw new Error(`Érvénytelen outbox-művelet: op=${row.op}, target_id=${row.target_id}`)
      }

      await dbExecute(`UPDATE outbox SET status = 'sent' WHERE id = ?1`, [row.id])
      stats.sent++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ismeretlen hiba'
      await markOutboxFailed(row.id, msg, row.retry_count + 1)
      stats.failed++
    }
  }

  return stats
}

async function markOutboxFailed(id: number, lastError: string, retryCount: number): Promise<void> {
  await dbExecute(
    `UPDATE outbox SET status = 'failed', last_error = ?1, retry_count = ?2 WHERE id = ?3`,
    [lastError, retryCount, id],
  )
}
