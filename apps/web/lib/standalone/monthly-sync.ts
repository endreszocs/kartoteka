/**
 * Monthly Sync Orchestrator — Supabase ↔ SQLite delta szinkronizáció.
 *
 * FOLYAMAT:
 *
 *  1. **Pre-sync backup** — a SQLite-ot lementjük `data/backups/pre-sync/`-be
 *
 *  2. **PULL phase** (Supabase → SQLite)
 *     Minden tábláról: `WHERE updated_at > last_pull_at`
 *     → INSERT OR REPLACE a lokális SQLite-ba
 *     → `_sync_meta.last_pull_at` frissítés
 *
 *  3. **PUSH phase** (SQLite → Supabase)
 *     `_mutation_queue` table status='pending' sorai
 *     → Supabase INSERT/UPDATE/DELETE
 *     → Siker: queue törlés, Hiba: retry count++
 *     → Konfliktus: `_conflicts` táblába + user-döntésre vár
 *
 *  4. **License refresh** — új JWT (35 napra) a Supabase-től
 *
 *  5. **Post-sync verify** — integrity_check
 *
 * A sync "orchestrated" — egymás után, nem parallel, hogy a konfliktus-
 * detektálás megbízható legyen.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

import { TABLE_REGISTRY } from '@/lib/offline/table-registry'
import { getDataDir, isStandaloneMode } from './runtime-detect'
import { getSqliteDb, upsertRecord, checkIntegrity } from './sqlite-db'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface SyncProgress {
  phase: 'backup' | 'pull' | 'push' | 'license-refresh' | 'verify' | 'done' | 'error'
  currentTable?: string
  done: number
  total: number
  message?: string
}

export interface SyncResult {
  success: boolean
  backupPath?: string
  pulled: Record<string, number>
  pushed: Record<string, number>
  conflicts: Array<{ table: string; rowId: string; reason: string }>
  failed: Array<{ table: string; error: string }>
  newLicenseToken?: string
  durationMs: number
  error?: string
}

type ProgressCallback = (progress: SyncProgress) => void

// ─────────────────────────────────────────────────────────────────
// Sync futtatás
// ─────────────────────────────────────────────────────────────────

/**
 * Havi sync lefuttatása.
 *
 * @param opts.supabaseUrl     NEXT_PUBLIC_SUPABASE_URL
 * @param opts.supabaseKey     NEXT_PUBLIC_SUPABASE_ANON_KEY
 * @param opts.congregationId  A lelkész gyülekezete
 * @param opts.authToken       Supabase user access token (a sync-hoz kell)
 * @param opts.onProgress      Progress callback — UI frissítéshez
 */
export async function performMonthlySync(opts: {
  supabaseUrl: string
  supabaseKey: string
  congregationId: string
  authToken?: string
  onProgress?: ProgressCallback
}): Promise<SyncResult> {
  if (!isStandaloneMode()) {
    return {
      success: false,
      pulled: {},
      pushed: {},
      conflicts: [],
      failed: [],
      durationMs: 0,
      error: 'Monthly sync csak standalone módban elérhető',
    }
  }

  const startedAt = Date.now()
  const progress = opts.onProgress ?? (() => {})
  const result: SyncResult = {
    success: false,
    pulled: {},
    pushed: {},
    conflicts: [],
    failed: [],
    durationMs: 0,
  }

  try {
    // ─────────────────────────────────────────────────
    // PHASE 1 — Pre-sync backup
    // ─────────────────────────────────────────────────
    progress({ phase: 'backup', done: 0, total: 1, message: 'Biztonsági mentés készítése...' })
    result.backupPath = createPreSyncBackup()

    // Supabase kliens (valódi, NEM a wrapper — sync-re kell)
    const supabase = createClient(opts.supabaseUrl, opts.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: opts.authToken
        ? { headers: { Authorization: `Bearer ${opts.authToken}` } }
        : undefined,
    })

    // ─────────────────────────────────────────────────
    // PHASE 2 — PULL (Supabase → SQLite)
    // ─────────────────────────────────────────────────
    await pullAllTables(supabase, opts.congregationId, result, progress)

    // ─────────────────────────────────────────────────
    // PHASE 3 — PUSH (SQLite mutation queue → Supabase)
    // ─────────────────────────────────────────────────
    await pushPendingMutations(supabase, result, progress)

    // ─────────────────────────────────────────────────
    // PHASE 4 — License refresh
    // ─────────────────────────────────────────────────
    progress({
      phase: 'license-refresh',
      done: 0,
      total: 1,
      message: 'Licensz megújítása...',
    })
    try {
      result.newLicenseToken = await refreshLicense(opts.supabaseUrl, opts.supabaseKey, opts.authToken)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[monthly-sync] License refresh sikertelen:', msg)
      // 401/403 esetén a user-fiók már nincs authorizálva — ez KRITIKUS hiba,
      // nem szabad `success: true`-val visszatérni, mert a lelkész nem tudja
      // majd, hogy a következő hónapig hiába dolgozik, a sync sosem fog menni.
      // Egyéb hiba (pl. Edge Function timeout) esetén csak figyelmeztetünk,
      // mert a régi licensz még érvényes lehet.
      const isAuthFailure =
        /\b40[13]\b/.test(msg) ||
        /unauthorized/i.test(msg) ||
        /forbidden/i.test(msg) ||
        /not.?authorized/i.test(msg)
      result.failed.push({
        table: '_license_refresh',
        error: msg,
      })
      if (isAuthFailure) {
        throw new Error(
          'A licensz megújítása SIKERTELEN: a szerver elutasította a kérést ' +
            '(401/403). Valószínűleg a fiókot deaktiválták. Fordulj az esperesi ' +
            'hivatalhoz. A helyi adatok biztonságban vannak, de új sync csak ' +
            'ÚJ AKTIVÁLÁS után lehetséges. Részletek: ' +
            msg,
        )
      }
      // Nem auth hiba — a régi licensz még érvényes, csak figyelmeztetünk
    }

    // ─────────────────────────────────────────────────
    // PHASE 5 — Verify
    // ─────────────────────────────────────────────────
    progress({ phase: 'verify', done: 0, total: 1, message: 'Integrity check...' })
    const integrity = checkIntegrity()
    if (!integrity.ok) {
      throw new Error(
        'SQLite integrity check FAIL: ' + integrity.errors.join(', '),
      )
    }

    result.success = true
    result.durationMs = Date.now() - startedAt
    progress({
      phase: 'done',
      done: 1,
      total: 1,
      message: `Kész! ${Object.values(result.pulled).reduce((s, v) => s + v, 0)} sor letöltve, ${Object.values(result.pushed).reduce((s, v) => s + v, 0)} sor feltöltve.`,
    })
    return result
  } catch (e) {
    result.durationMs = Date.now() - startedAt
    result.error = e instanceof Error ? e.message : String(e)
    progress({ phase: 'error', done: 0, total: 0, message: result.error })
    return result
  }
}

// ─────────────────────────────────────────────────────────────────
// PHASE 1 — Pre-sync backup
// ─────────────────────────────────────────────────────────────────

function createPreSyncBackup(): string {
  const dataDir = getDataDir()
  const dbPath = path.join(dataDir, 'kartoteka.db')
  const backupsDir = path.join(dataDir, 'backups', 'pre-sync')
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true })
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = path.join(backupsDir, `kartoteka-${ts}.db`)
  fs.copyFileSync(dbPath, backupPath)

  // Retention: csak az utolsó 7 pre-sync backup maradhat
  const files = fs
    .readdirSync(backupsDir)
    .filter(f => f.startsWith('kartoteka-') && f.endsWith('.db'))
    .sort()
  while (files.length > 7) {
    const oldest = files.shift()
    if (oldest) {
      fs.unlinkSync(path.join(backupsDir, oldest))
    }
  }

  return backupPath
}

// ─────────────────────────────────────────────────────────────────
// PHASE 2 — PULL
// ─────────────────────────────────────────────────────────────────

async function pullAllTables(
  supabase: SupabaseClient,
  congregationId: string,
  result: SyncResult,
  progress: ProgressCallback,
): Promise<void> {
  const db = getSqliteDb()
  const tables = [...TABLE_REGISTRY].sort((a, b) => a.priority - b.priority)
  const total = tables.length

  for (let i = 0; i < tables.length; i++) {
    const entry = tables[i]
    progress({
      phase: 'pull',
      done: i,
      total,
      currentTable: entry.dexieTable,
      message: `Adatok letöltése: ${entry.dexieTable} (${i + 1}/${total})`,
    })

    try {
      // Utolsó pull cursor olvasása
      const meta = db
        .prepare('SELECT last_pull_at FROM _sync_meta WHERE table_name = ?')
        .get(entry.dexieTable) as { last_pull_at: string | null } | undefined
      const cursor = meta?.last_pull_at || '1970-01-01T00:00:00Z'

      let query = supabase
        .from(entry.supabaseTable)
        .select('*')
        .gt('updated_at', cursor)
        .order('updated_at', { ascending: true })

      if (entry.scopeFilter === 'congregation_id') {
        query = query.eq('congregation_id', congregationId)
      }

      const { data, error } = await query
      if (error) {
        result.failed.push({ table: entry.dexieTable, error: error.message })
        continue
      }

      const rows = (data || []) as Record<string, unknown>[]
      if (rows.length === 0) {
        continue
      }

      // Cursor frissítés — a legnagyobb updated_at érték a pull-ban
      // FONTOS: a sor-upsert + cursor-update EGY tranzakcióban kell menjen,
      // különben crash esetén a rows benne lennének a SQLite-ban, de a cursor
      // nem frissült — a következő sync újraletölt minden sor (tiszta waste
      // + esetleges race ha közben push-olt módosítás volt).
      const newCursor = rows[rows.length - 1].updated_at as string | undefined
      const finalCursor = newCursor || new Date().toISOString()

      const pullTxn = db.transaction((batch: Record<string, unknown>[]) => {
        for (const row of batch) {
          upsertRecord(entry.dexieTable, row)
        }
        db.prepare(
          'UPDATE _sync_meta SET last_pull_at = ? WHERE table_name = ?',
        ).run(finalCursor, entry.dexieTable)
      })
      pullTxn(rows)

      result.pulled[entry.dexieTable] = rows.length
    } catch (e) {
      result.failed.push({
        table: entry.dexieTable,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// PHASE 3 — PUSH
// ─────────────────────────────────────────────────────────────────

interface MutationRow {
  id: string
  table_name: string
  op: 'insert' | 'update' | 'delete'
  payload: string // JSON
  base_revision: number | null
  client_timestamp: number
  retry_count: number
  status: string
  error_msg: string | null
}

async function pushPendingMutations(
  supabase: SupabaseClient,
  result: SyncResult,
  progress: ProgressCallback,
): Promise<void> {
  const db = getSqliteDb()
  const mutations = db
    .prepare(
      `SELECT * FROM _mutation_queue
       WHERE status IN ('pending', 'failed')
       ORDER BY client_timestamp ASC
       LIMIT 500`,
    )
    .all() as MutationRow[]

  if (mutations.length === 0) {
    return
  }

  for (let i = 0; i < mutations.length; i++) {
    const m = mutations[i]
    progress({
      phase: 'push',
      done: i,
      total: mutations.length,
      currentTable: m.table_name,
      message: `Változások feltöltése: ${m.table_name} (${i + 1}/${mutations.length})`,
    })

    try {
      const payload = JSON.parse(m.payload) as Record<string, unknown>
      let response:
        | { data: unknown; error: { message: string; code?: string } | null }
        | null = null

      if (m.op === 'insert') {
        response = await supabase.from(m.table_name).insert(payload).select().maybeSingle()
      } else if (m.op === 'update') {
        const rowId = payload.id
        response = await supabase
          .from(m.table_name)
          .update(payload)
          .eq('id', rowId as string | number)
          .select()
          .maybeSingle()
      } else if (m.op === 'delete') {
        const rowId = payload.id
        response = await supabase
          .from(m.table_name)
          .delete()
          .eq('id', rowId as string | number)
      }

      if (response?.error) {
        // Konfliktus detektálás (409 vagy revision mismatch)
        if (
          response.error.code === 'PGRST116' ||
          response.error.message?.toLowerCase().includes('conflict') ||
          response.error.message?.toLowerCase().includes('revision')
        ) {
          result.conflicts.push({
            table: m.table_name,
            rowId: String(payload.id ?? ''),
            reason: response.error.message,
          })
          db.prepare(
            `UPDATE _mutation_queue SET status = 'conflict', error_msg = ? WHERE id = ?`,
          ).run(response.error.message, m.id)
          continue
        }
        // Retry-able error
        db.prepare(
          `UPDATE _mutation_queue
           SET status = 'failed', retry_count = retry_count + 1, error_msg = ?
           WHERE id = ?`,
        ).run(response.error.message, m.id)
        result.failed.push({ table: m.table_name, error: response.error.message })
        continue
      }

      // FONTOS: insert/update esetén a `.select().maybeSingle()` válasznak
      // tartalmaznia KELL a beszúrt/módosított sort. Ha `data === null`
      // és `error === null`, az azt jelenti, hogy RLS csendben blokkolta
      // a műveletet (nincs hibaüzenet a Supabase-től, de nincs sor sem).
      // Ha ilyen esetben eltávolítanánk a mutation-t, a változás ELVESZNE
      // a queue-ból, de a Supabase-en nem menne át = adat-elvesztés.
      if (
        (m.op === 'insert' || m.op === 'update') &&
        response &&
        response.data === null
      ) {
        const msg =
          'A szerver csendben elutasította a műveletet (valószínűleg RLS). ' +
          'Ellenőrizd a jogosultságaidat vagy vegye fel a kapcsolatot az esperesi hivatallal.'
        db.prepare(
          `UPDATE _mutation_queue
           SET status = 'failed', retry_count = retry_count + 1, error_msg = ?
           WHERE id = ?`,
        ).run(msg, m.id)
        result.failed.push({ table: m.table_name, error: msg })
        continue
      }

      // Success — eltávolítjuk a queue-ból
      db.prepare(`DELETE FROM _mutation_queue WHERE id = ?`).run(m.id)
      result.pushed[m.table_name] = (result.pushed[m.table_name] || 0) + 1
    } catch (e) {
      db.prepare(
        `UPDATE _mutation_queue
         SET status = 'failed', retry_count = retry_count + 1, error_msg = ?
         WHERE id = ?`,
      ).run(e instanceof Error ? e.message : String(e), m.id)
      result.failed.push({
        table: m.table_name,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// PHASE 4 — License refresh
// ─────────────────────────────────────────────────────────────────

async function refreshLicense(
  supabaseUrl: string,
  supabaseKey: string,
  authToken?: string,
): Promise<string> {
  const { getMachineFingerprint } = await import('./machine-fingerprint')
  const { issueLicenseToken, DEFAULT_DEV_PRIVATE_KEY } = await import('./license-jwt')
  const { writeLicenseFile, validateCurrentLicense } = await import('./license-check')

  // Régi license-ből kivesszük a claim-eket (sub, cong_id stb.)
  const oldLicense = await validateCurrentLicense()
  if (!oldLicense.claims) {
    throw new Error('Nincs érvényes meglévő licensz a refresh-hez')
  }

  const fingerprint = getMachineFingerprint()

  const useEdgeFunction =
    process.env.LICENSE_USE_EDGE_FUNCTION === 'true' ||
    (!process.env.LICENSE_PRIVATE_KEY_PEM && process.env.NODE_ENV === 'production')

  let newToken: string

  if (useEdgeFunction && authToken) {
    // PRODUCTION: Edge Function hívás — friss aláírású token
    const edgeResp = await fetch(`${supabaseUrl}/functions/v1/issue-license`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({
        fingerprint,
        appVersion: process.env.KARTOTEKA_VERSION || '1.0.0',
      }),
    })
    if (!edgeResp.ok) {
      const errBody = await edgeResp.json().catch(() => ({}))
      throw new Error(
        'License refresh sikertelen: ' + (errBody.error || edgeResp.statusText),
      )
    }
    const edgeData = await edgeResp.json()
    newToken = edgeData.token
  } else {
    // DEV: helyi privát kulccsal
    const privateKey = process.env.LICENSE_PRIVATE_KEY_PEM || DEFAULT_DEV_PRIVATE_KEY
    newToken = await issueLicenseToken({
      userId: oldLicense.claims.sub,
      congregationId: oldLicense.claims.cong_id,
      fingerprint,
      privateKeyPem: privateKey,
      role: oldLicense.claims.role,
      validityDays: 35,
    })
  }

  writeLicenseFile(newToken)
  return newToken
}
