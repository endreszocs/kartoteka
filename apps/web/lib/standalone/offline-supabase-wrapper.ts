/**
 * Offline-aware Supabase wrapper — dual backend read/write.
 *
 * HOGYAN MŰKÖDIK:
 *
 * 1. SERVER módban (default): standard Supabase kliens, minden query a felhő
 *    adatbázishoz megy.
 *
 * 2. STANDALONE módban (Fázis 7, a lelkész gépén): a Supabase kliens-t
 *    felülírjuk egy "proxy"-val, ami a lokális SQLite-ra irányít minden
 *    műveletet. A pull-sync során a Supabase-ről a SQLite-ba írunk, a push-sync
 *    során a SQLite mutation_queue-jából a Supabase-re.
 *
 * Ez a wrapper egy **korlátozott Supabase-compatible API** — csak azokat a
 * builder-metódusokat támogatja, amiket a KARTOTEKA kód használ:
 *   - from(table).select(cols).eq(col, val).single()
 *   - from(table).select(cols).eq(...).neq(...).order(col).limit(n)
 *   - from(table).insert([...])
 *   - from(table).update(obj).eq(col, val)
 *   - from(table).delete().eq(col, val)
 *   - from(table).upsert(...)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSqliteDb } from './sqlite-db'
import { isStandaloneMode } from './runtime-detect'

// ─────────────────────────────────────────────────────────────────
// Belső egyszerűsített válasz-típus (cast-olható Postgrest-re)
// ─────────────────────────────────────────────────────────────────

interface OfflineResponse<T> {
  data: T | null
  error: OfflineError | null
  count: number | null
  status: number
  statusText: string
}

interface OfflineError {
  message: string
  code: string
  details: string | null
  hint: string | null
}

function okResponse<T>(data: T, count: number = Array.isArray(data) ? data.length : 1): OfflineResponse<T> {
  return { data, error: null, count, status: 200, statusText: 'OK' }
}

function errorResponse(message: string, code: string = 'OFFLINE_ERROR'): OfflineResponse<null> {
  return {
    data: null,
    error: { message, code, details: null, hint: null },
    count: null,
    status: 500,
    statusText: 'Error',
  }
}

function notFoundResponse(): OfflineResponse<null> {
  return {
    data: null,
    error: { message: 'Not found', code: 'PGRST116', details: null, hint: null },
    count: 0,
    status: 406,
    statusText: 'Not Found',
  }
}

// ─────────────────────────────────────────────────────────────────
// Query builder state
// ─────────────────────────────────────────────────────────────────

type Filter =
  | {
      kind: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is'
      col: string
      val: unknown
    }
  | {
      kind: 'or'
      /** Supabase `.or('col.op.val,col2.op.val,...')` expression. */
      expr: string
    }

type OrderClause = {
  col: string
  ascending: boolean
}

interface QueryState {
  table: string
  columns: string
  filters: Filter[]
  orderBy: OrderClause[]
  limitCount: number | null
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  payload: Record<string, unknown> | Record<string, unknown>[] | null
}

// ─────────────────────────────────────────────────────────────────
// Value normalizálás (boolean → 0/1 stb.)
// ─────────────────────────────────────────────────────────────────

function normalizeValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'string' || typeof v === 'number') return v
  return String(v)
}

/**
 * Parse egy Supabase `.or(expr)` kifejezést SQL clause-ra.
 * Expr formátum: `"col.op.val,col2.op.val2,..."` — commás lista.
 * Minden rész: `"column.operator.value"`.
 *
 * Támogatott operátorok: eq, neq, gt, gte, lt, lte, like, ilike, is.
 * `is.null` és `is.not.null` külön kezelve (SQLite IS NULL / IS NOT NULL).
 * A string értékek idézőjel nélkül jönnek — boolean-eket 0/1-re konvertáljuk.
 */
function parseOrExpr(expr: string): { sql: string; params: (string | number | null)[] } {
  const parts: string[] = []
  const params: (string | number | null)[] = []
  // A comma a separator, de figyelem: ha a value-ban lenne comma (pl. array),
  // split nem működik jól. A KARTOTEKÁ-ban aktuálisan csak sima értékek
  // használódnak (col.eq.false, col.is.null), ezért egyszerű split elég.
  const segments = expr.split(',').map(s => s.trim()).filter(Boolean)
  for (const segment of segments) {
    // Az első 2 pont választja el: col.op.restOfValue (lehet pont az értékben)
    const firstDot = segment.indexOf('.')
    const secondDot = segment.indexOf('.', firstDot + 1)
    if (firstDot === -1 || secondDot === -1) {
      // Érvénytelen szegmens → kihagyjuk (ne törjön el az egész lekérdezés)
      continue
    }
    const col = segment.slice(0, firstDot)
    const op = segment.slice(firstDot + 1, secondDot)
    const rawVal = segment.slice(secondDot + 1)

    switch (op) {
      case 'eq':
        parts.push(`"${col}" = ?`)
        params.push(parseOrValue(rawVal))
        break
      case 'neq':
        parts.push(`"${col}" != ?`)
        params.push(parseOrValue(rawVal))
        break
      case 'gt':
        parts.push(`"${col}" > ?`)
        params.push(parseOrValue(rawVal))
        break
      case 'gte':
        parts.push(`"${col}" >= ?`)
        params.push(parseOrValue(rawVal))
        break
      case 'lt':
        parts.push(`"${col}" < ?`)
        params.push(parseOrValue(rawVal))
        break
      case 'lte':
        parts.push(`"${col}" <= ?`)
        params.push(parseOrValue(rawVal))
        break
      case 'like':
      case 'ilike':
        parts.push(`"${col}" LIKE ?`)
        params.push(String(rawVal))
        break
      case 'is':
        if (rawVal === 'null') {
          parts.push(`"${col}" IS NULL`)
        } else if (rawVal === 'not.null') {
          parts.push(`"${col}" IS NOT NULL`)
        } else if (rawVal === 'true' || rawVal === 'false') {
          parts.push(`"${col}" = ?`)
          params.push(rawVal === 'true' ? 1 : 0)
        } else {
          parts.push(`"${col}" IS ?`)
          params.push(parseOrValue(rawVal))
        }
        break
      default:
        // Ismeretlen op — konzervatív fallback: nem generálunk SQL-t
        break
    }
  }
  if (parts.length === 0) return { sql: '0', params: [] } // üres OR → false
  return { sql: `(${parts.join(' OR ')})`, params }
}

/**
 * Egy `.or(...)` kifejezés value-jának SQLite-kompatibilis parse-e.
 * `true`/`false` → 1/0, szám → number, egyébként string.
 */
function parseOrValue(raw: string): string | number | null {
  if (raw === 'true') return 1
  if (raw === 'false') return 0
  if (raw === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
}

function buildWhereClause(filters: Filter[]): { sql: string; params: (string | number | null)[] } {
  if (filters.length === 0) return { sql: '', params: [] }
  const parts: string[] = []
  const params: (string | number | null)[] = []
  for (const f of filters) {
    switch (f.kind) {
      case 'eq':
        parts.push(`"${f.col}" = ?`)
        params.push(normalizeValue(f.val))
        break
      case 'neq':
        parts.push(`"${f.col}" != ?`)
        params.push(normalizeValue(f.val))
        break
      case 'gt':
        parts.push(`"${f.col}" > ?`)
        params.push(normalizeValue(f.val))
        break
      case 'gte':
        parts.push(`"${f.col}" >= ?`)
        params.push(normalizeValue(f.val))
        break
      case 'lt':
        parts.push(`"${f.col}" < ?`)
        params.push(normalizeValue(f.val))
        break
      case 'lte':
        parts.push(`"${f.col}" <= ?`)
        params.push(normalizeValue(f.val))
        break
      case 'like':
        parts.push(`"${f.col}" LIKE ?`)
        params.push(normalizeValue(f.val))
        break
      case 'ilike':
        // SQLite-ben a LIKE alapból case-insensitive
        parts.push(`"${f.col}" LIKE ?`)
        params.push(normalizeValue(f.val))
        break
      case 'in':
        if (!Array.isArray(f.val) || f.val.length === 0) {
          parts.push('0') // üres IN → mindig false
          break
        }
        parts.push(
          `"${f.col}" IN (${(f.val as unknown[]).map(() => '?').join(', ')})`,
        )
        params.push(...(f.val as unknown[]).map(normalizeValue))
        break
      case 'is':
        if (f.val === null) {
          parts.push(`"${f.col}" IS NULL`)
        } else {
          parts.push(`"${f.col}" IS ?`)
          params.push(normalizeValue(f.val))
        }
        break
      case 'or': {
        const parsed = parseOrExpr(f.expr)
        parts.push(parsed.sql)
        params.push(...parsed.params)
        break
      }
    }
  }
  return { sql: 'WHERE ' + parts.join(' AND '), params }
}

// ─────────────────────────────────────────────────────────────────
// Execute helpers
// ─────────────────────────────────────────────────────────────────

function executeSelect(
  state: QueryState,
  mode: 'array' | 'single' | 'maybeSingle' = 'array',
): OfflineResponse<Record<string, unknown>[] | Record<string, unknown> | null> {
  try {
    const db = getSqliteDb()
    const cols = state.columns === '*' ? '*' : state.columns
    const whereClause = buildWhereClause(state.filters)
    const orderClause =
      state.orderBy.length > 0
        ? 'ORDER BY ' +
          state.orderBy
            .map(o => `"${o.col}" ${o.ascending ? 'ASC' : 'DESC'}`)
            .join(', ')
        : ''
    const limitClause = state.limitCount !== null ? `LIMIT ${state.limitCount}` : ''

    const sql = `SELECT ${cols} FROM ${state.table} ${whereClause.sql} ${orderClause} ${limitClause}`.trim()
    const rows = db.prepare(sql).all(...whereClause.params) as Record<string, unknown>[]

    if (mode === 'single') {
      if (rows.length === 0) return notFoundResponse() as OfflineResponse<null>
      if (rows.length > 1) return errorResponse('Multiple rows returned', 'PGRST116') as OfflineResponse<null>
      return okResponse(rows[0], 1)
    }
    if (mode === 'maybeSingle') {
      return okResponse(rows[0] || null, rows.length)
    }
    return okResponse(rows, rows.length)
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : 'Unknown error',
      'OFFLINE_QUERY_ERROR',
    ) as OfflineResponse<null>
  }
}

function executeInsert(state: QueryState): OfflineResponse<Record<string, unknown>[]> {
  try {
    const db = getSqliteDb()
    const rows = Array.isArray(state.payload)
      ? state.payload
      : state.payload
        ? [state.payload]
        : []
    if (rows.length === 0) return okResponse([], 0)

    const inserted: Record<string, unknown>[] = []
    const isUpsert = state.operation === 'upsert'
    const insertTxn = db.transaction((batch: Record<string, unknown>[]) => {
      for (const row of batch) {
        const keys = Object.keys(row)
        const placeholders = keys.map(() => '?').join(', ')
        const columns = keys.map(k => `"${k}"`).join(', ')
        const values = keys.map(k => normalizeValue(row[k]))
        const verb = isUpsert ? 'INSERT OR REPLACE INTO' : 'INSERT INTO'
        const result = db
          .prepare(`${verb} ${state.table} (${columns}) VALUES (${placeholders})`)
          .run(...values)
        const id = (row as { id?: unknown }).id ?? result.lastInsertRowid
        const fetched = db
          .prepare(`SELECT * FROM ${state.table} WHERE id = ?`)
          .get(id) as Record<string, unknown> | undefined
        if (fetched) inserted.push(fetched)
      }
    })
    insertTxn(rows)
    return okResponse(inserted, inserted.length)
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : 'Unknown error',
      'OFFLINE_INSERT_ERROR',
    ) as unknown as OfflineResponse<Record<string, unknown>[]>
  }
}

function executeUpdate(state: QueryState): OfflineResponse<null> {
  try {
    const db = getSqliteDb()
    const payload = state.payload as Record<string, unknown>
    const keys = Object.keys(payload)
    if (keys.length === 0) return okResponse(null, 0) as OfflineResponse<null>
    const setClause = keys.map(k => `"${k}" = ?`).join(', ')
    const setValues = keys.map(k => normalizeValue(payload[k]))
    const whereClause = buildWhereClause(state.filters)
    const result = db
      .prepare(`UPDATE ${state.table} SET ${setClause} ${whereClause.sql}`)
      .run(...setValues, ...whereClause.params)
    return okResponse(null, result.changes) as OfflineResponse<null>
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : 'Unknown error',
      'OFFLINE_UPDATE_ERROR',
    ) as OfflineResponse<null>
  }
}

function executeDelete(state: QueryState): OfflineResponse<null> {
  try {
    const db = getSqliteDb()
    const whereClause = buildWhereClause(state.filters)
    const result = db
      .prepare(`DELETE FROM ${state.table} ${whereClause.sql}`)
      .run(...whereClause.params)
    return okResponse(null, result.changes) as OfflineResponse<null>
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : 'Unknown error',
      'OFFLINE_DELETE_ERROR',
    ) as OfflineResponse<null>
  }
}

// ─────────────────────────────────────────────────────────────────
// Chainable query builder (Supabase-kompatibilis API)
// ─────────────────────────────────────────────────────────────────

class OfflineQueryBuilder {
  private state: QueryState

  constructor(table: string) {
    this.state = {
      table,
      columns: '*',
      filters: [],
      orderBy: [],
      limitCount: null,
      operation: 'select',
      payload: null,
    }
  }

  select(cols: string = '*') {
    this.state.columns = cols
    this.state.operation = 'select'
    return this
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.state.operation = 'insert'
    this.state.payload = rows
    return this
  }

  update(payload: Record<string, unknown>) {
    this.state.operation = 'update'
    this.state.payload = payload
    return this
  }

  delete() {
    this.state.operation = 'delete'
    return this
  }

  upsert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.state.operation = 'upsert'
    this.state.payload = rows
    return this
  }

  eq(col: string, val: unknown) {
    this.state.filters.push({ kind: 'eq', col, val })
    return this
  }

  neq(col: string, val: unknown) {
    this.state.filters.push({ kind: 'neq', col, val })
    return this
  }

  gt(col: string, val: unknown) {
    this.state.filters.push({ kind: 'gt', col, val })
    return this
  }

  gte(col: string, val: unknown) {
    this.state.filters.push({ kind: 'gte', col, val })
    return this
  }

  lt(col: string, val: unknown) {
    this.state.filters.push({ kind: 'lt', col, val })
    return this
  }

  lte(col: string, val: unknown) {
    this.state.filters.push({ kind: 'lte', col, val })
    return this
  }

  like(col: string, val: string) {
    this.state.filters.push({ kind: 'like', col, val })
    return this
  }

  ilike(col: string, val: string) {
    this.state.filters.push({ kind: 'ilike', col, val })
    return this
  }

  in(col: string, val: unknown[]) {
    this.state.filters.push({ kind: 'in', col, val })
    return this
  }

  is(col: string, val: unknown) {
    this.state.filters.push({ kind: 'is', col, val })
    return this
  }

  /**
   * Supabase `.or('col.op.val,col2.op.val2,...')` — kombinált OR clause.
   * A parszer a `parseOrExpr()` segítségével SQLite-ra fordítja a kifejezést.
   * Használat pl. `.or('deleted.eq.false,deleted.is.null')`.
   */
  or(expr: string) {
    this.state.filters.push({ kind: 'or', expr })
    return this
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.state.orderBy.push({ col, ascending: opts?.ascending !== false })
    return this
  }

  limit(n: number) {
    this.state.limitCount = n
    return this
  }

  single(): Promise<OfflineResponse<Record<string, unknown> | null>> {
    return Promise.resolve(executeSelect(this.state, 'single') as OfflineResponse<Record<string, unknown> | null>)
  }

  maybeSingle(): Promise<OfflineResponse<Record<string, unknown> | null>> {
    return Promise.resolve(executeSelect(this.state, 'maybeSingle') as OfflineResponse<Record<string, unknown> | null>)
  }

  // Await-elhetőség: Supabase query builder is await-elhető
  then<T = OfflineResponse<unknown>>(
    onFulfilled?: (value: OfflineResponse<unknown>) => T | Promise<T>,
  ): Promise<T> {
    const result = this.execute()
    return Promise.resolve(result).then(onFulfilled as (v: unknown) => T)
  }

  private execute(): OfflineResponse<unknown> {
    switch (this.state.operation) {
      case 'select':
        return executeSelect(this.state) as OfflineResponse<unknown>
      case 'insert':
      case 'upsert':
        return executeInsert(this.state) as OfflineResponse<unknown>
      case 'update':
        return executeUpdate(this.state) as OfflineResponse<unknown>
      case 'delete':
        return executeDelete(this.state) as OfflineResponse<unknown>
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Wrapper a Supabase kliens köré
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Auth proxy — standalone offline mode
// ─────────────────────────────────────────────────────────────────

/**
 * A standalone offline `auth` interface — a license.dat-ban tárolt
 * user-info-t adja vissza, mintha a Supabase válaszolna.
 *
 * Ez azért kell, mert minden actions.ts `supabase.auth.getUser()`-rel
 * indít — offline-ban ezzel timeout-ra futna. A license JWT tartalmazza
 * a user_id-t, így innen tudjuk azonosítani.
 */
function buildOfflineAuthProxy(originalAuth: SupabaseClient['auth']) {
  return new Proxy(originalAuth, {
    get(target, prop) {
      if (prop === 'getUser') {
        return async () => {
          // Próba: ha online vagyunk, használjuk a valódi Supabase-t
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return getUserFromLicense()
          }
          try {
            // Server-side mindig elérhető a license-ből is
            // De ha online vagyunk, a Supabase friss user-info-t ad
            const result = await target.getUser()
            if (result.data?.user) return result
            // Ha nincs user (pl. expirált session), license fallback
            return getUserFromLicense()
          } catch {
            return getUserFromLicense()
          }
        }
      }
      if (prop === 'getSession') {
        return async () => {
          try {
            const result = await target.getSession()
            if (result.data?.session) return result
            return getSessionFromLicense()
          } catch {
            return getSessionFromLicense()
          }
        }
      }
      // Minden más metódus (signIn, signOut, onAuthStateChange) változatlan
      return Reflect.get(target, prop)
    },
  })
}

/**
 * Visszaad egy "user-szerű" objektumot a license.dat-ban tárolt JWT-ből.
 * Csak server-side-on működik (a license-check fs-t használ).
 */
async function getUserFromLicense() {
  try {
    const { validateCurrentLicense } = await import('./license-check')
    const license = await validateCurrentLicense()
    if (license.claims) {
      return {
        data: {
          user: {
            id: license.claims.sub,
            app_metadata: {},
            user_metadata: { role: license.claims.role },
            aud: 'authenticated',
            created_at: new Date(license.claims.iat * 1000).toISOString(),
            email: undefined,
            role: 'authenticated',
          },
        },
        error: null,
      }
    }
  } catch {
    // fall through
  }
  return {
    data: { user: null },
    error: { message: 'No active license', name: 'AuthError', status: 401 },
  }
}

async function getSessionFromLicense() {
  const userResult = await getUserFromLicense()
  if (!userResult.data?.user) {
    return { data: { session: null }, error: userResult.error }
  }
  return {
    data: {
      session: {
        access_token: '', // Standalone-ban nincs valódi access token offline
        refresh_token: '',
        expires_in: 0,
        expires_at: 0,
        token_type: 'bearer',
        user: userResult.data.user,
      },
    },
    error: null,
  }
}

/**
 * Standalone módban visszaad egy lokális (SQLite + license-aware) klienst,
 * ami a Supabase API-t utánozza. Server módban a passed-through Supabase
 * klienst adja vissza.
 */
export function wrapSupabaseForOfflineUse(
  supabaseClient: SupabaseClient,
): SupabaseClient {
  if (!isStandaloneMode()) return supabaseClient

  return new Proxy(supabaseClient, {
    get(target, prop) {
      // CRUD műveletek → SQLite query builder
      if (prop === 'from') {
        return (table: string) => new OfflineQueryBuilder(table)
      }
      // Auth → offline-aware (license.dat fallback)
      if (prop === 'auth') {
        return buildOfflineAuthProxy(target.auth)
      }
      // Minden más (storage, functions, realtime, rpc) változatlan
      // — ezek általában online-only műveletek (admin, sync stb.)
      return Reflect.get(target, prop)
    },
  }) as unknown as SupabaseClient
}
