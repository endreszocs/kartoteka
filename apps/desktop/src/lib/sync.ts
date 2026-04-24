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
 * ## M6 (congregations pull-sync, első domain-tábla)
 *   - pullOwnCongregation(userId)      — Supabase → congregations_local (a user saját gyülekezete)
 *   - getLocalOwnCongregation(userId)  — offline olvasás
 *   - getLastPullCongregationIso()     — utolsó sync-idő info
 *
 * ## M7+ (még hátralevő)
 *   - Congregations write-sync (updateOwnCongregation, admin-only)
 *   - További domain-táblák (members/szemely, finance, liturgia, …)
 *   - User-jelszó-alapú derived kulcs (defense-in-depth)
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
const LAST_PULL_ALL_KEY = 'sync:profiles:last_pull_all'

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

export async function getLastPullAllIso(): Promise<string | null> {
  return getSetting(LAST_PULL_ALL_KEY)
}

// ═════════════════════════════════════════════════════════════════════════
// M2.7 — delta-pull az összes látható profilra
// ═════════════════════════════════════════════════════════════════════════

/**
 * Letölti az összes, a bejelentkezett user által látható profilt a Supabase-ből
 * a lokális `profiles_local` táblába.
 *
 * A kliens a `sync:profiles:last_pull_all` kulcsot használja a delta-határhoz.
 * Ha `mode === 'delta'`:
 *   - Első hívásnál (nincs last_pull_all) → **full** pull fut automatikusan
 *   - Utána csak `WHERE updated_at > last_pull_all` — így a változatlan sorokat
 *     NEM hozza újra, sávszélesség-takarékos
 * Ha `mode === 'full'`:
 *   - Mindig az összes sort hozza (függetlenül a last_pull-tól)
 *   - A last_pull_all-t is a legújabb updated_at-ra frissíti
 *
 * Az RLS a szerver-oldalon szűr: a user csak a számára látható sorokat kapja
 * (jelenleg `profiles_read`/`profiles_read_all` minden authenticated user-t
 * enged SELECT-ben — más RLS esetén a szűrés máshol történik).
 */
export async function pullAllProfiles(
  mode: 'delta' | 'full' = 'delta',
): Promise<{ pulledRows: number; mode: 'delta' | 'full' | 'full-initial'; lastPullIso: string }> {
  const supabase = getDesktopSupabase()
  const lastPullAll = mode === 'delta' ? await getLastPullAllIso() : null
  const effectiveMode: 'delta' | 'full' | 'full-initial' =
    mode === 'full' ? 'full' : lastPullAll ? 'delta' : 'full-initial'

  let query = supabase
    .from('profiles')
    .select(
      'id, email, full_name, phone, role, status, congregation_id, diocese_id, district_id, revision, updated_at',
    )
    .order('updated_at', { ascending: true })

  if (effectiveMode === 'delta' && lastPullAll) {
    query = query.gt('updated_at', lastPullAll)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Supabase delta-pull hiba: ${error.message}`)
  }

  const rows = data ?? []
  for (const row of rows) {
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
        (row as { id: string }).id,
        (row as { email: string | null }).email,
        (row as { full_name: string | null }).full_name,
        (row as { phone: string | null }).phone,
        (row as { role: string | null }).role,
        (row as { status: string | null }).status,
        (row as { congregation_id: string | null }).congregation_id,
        (row as { diocese_id: string | null }).diocese_id,
        (row as { district_id: string | null }).district_id,
        (row as { revision?: number }).revision ?? 0,
        (row as { updated_at?: string }).updated_at ?? null,
      ],
    )
  }

  // A last_pull_all értékét akkor frissítjük, ha valóban volt új sor
  // (így egy üres delta nem változtatja meg a high-water markot).
  // Különben a nem-változó sorokra sosem frissülne a last_pull_all, és
  // mindig az első full-pull idejétől kezdődne a delta — ami még okosabb,
  // mert biztosítja, hogy ha egy sor időközben visszaállt, újra meglátjuk.
  //
  // Kompromisszum: a legújabb kapott sor `updated_at`-jét vesszük. Ha
  // semmi sor, marad a régi last_pull.
  let newLastPull = lastPullAll ?? new Date(0).toISOString()
  for (const row of rows) {
    const u = (row as { updated_at?: string }).updated_at
    if (u && u > newLastPull) newLastPull = u
  }
  if (rows.length > 0) {
    await setSetting(LAST_PULL_ALL_KEY, newLastPull)
  } else if (!lastPullAll) {
    // Első futás és nincs sem semmi — mégis rögzítjük, hogy legalább "futott"
    await setSetting(LAST_PULL_ALL_KEY, new Date().toISOString())
  }

  return { pulledRows: rows.length, mode: effectiveMode, lastPullIso: newLastPull }
}

/**
 * Minden lokálisan cache-elt profil-sor olvasása.
 * Rendezés: updated_at DESC (legfrissebb változás fönt).
 */
export async function getAllLocalProfiles(): Promise<ProfileLocalRow[]> {
  return dbSelect<ProfileLocalRow>(
    `SELECT id, email, full_name, phone, role, status,
            congregation_id, diocese_id, district_id,
            revision, updated_at, synced_at
       FROM profiles_local
      ORDER BY COALESCE(updated_at, synced_at) DESC`,
  )
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

// ═════════════════════════════════════════════════════════════════════════
// M6 — CONGREGATIONS PULL-SYNC
// ═════════════════════════════════════════════════════════════════════════
// A lelkészek saját gyülekezete a leggyakrabban olvasott adat a profil után.
// Kezdésként csak PULL (olvasás Supabase-ből lokális cache-be) — az update
// (IBAN, telefon, járulék-változtatás) admin-privilégium, későbbi fázisban
// jön. A pull-ciklus logikája megegyezik a profiles mintával: `.maybeSingle()`
// + ON CONFLICT upsert + LAST_PULL_CONGREGATION_KEY high-water mark.
//
// A Supabase-oldali M6.1 migráció (2026-04-23-m6-1-congregations-revision.sql)
// hozzáadja a congregations.revision és congregations.updated_at oszlopokat,
// így már ebben a fázisban is készül a mező a jövőbeli conditional-update-re.

/**
 * A `congregations` és `congregations_local` közös, szinkronizált oszlopai.
 *
 * TS-oldali típusok:
 *   - `public_site_enabled` : SQLite INTEGER (0/1), TS-ben number —
 *      a UI-ban `row.public_site_enabled === 1` hasonlítással boolean-ná.
 *   - `eves_jarulek`, `jarulek_kedvezmenyes` : numeric → REAL → number
 *   - minden uuid oszlop TEXT (string)
 */
export interface CongregationLocalRow {
  id: string
  name: string
  nev_hu: string | null
  nev_ro: string | null
  nev_en: string | null
  district: string | null
  egyhazmegye: string | null
  diocese_id: string | null
  adoszam: string | null
  cim: string | null
  email: string | null
  telefon: string | null
  web: string | null
  varos: string | null
  megye: string | null
  iranyitoszam: string | null
  iban: string | null
  bank: string | null
  eves_jarulek: number | null
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string | null
  cimer_url: string | null
  public_slug: string | null
  /** SQLite INTEGER (0/1). UI-ban `=== 1`-gyel boolean-ra konvertálandó. */
  public_site_enabled: number
  revision: number
  updated_at: string | null
  synced_at: string
}

const LAST_PULL_CONGREGATION_KEY = 'sync:congregations:last_pull'

/**
 * Letölti a bejelentkezett user saját gyülekezetét a Supabase-ből a lokális
 * `congregations_local` cache-be.
 *
 * Lépések:
 *   1. A user `congregation_id`-jét lokálisan olvassuk (gyors), és ha nincs
 *      lokális profil még, akkor Supabase-ből kérjük le.
 *   2. Ha a user-nek nincs gyülekezete (pl. nem lelkész, vagy még nincs
 *      hozzárendelve), visszatérünk `pulledRows: 0`-val.
 *   3. A `congregations` táblából a teljes sor jön vissza (az RLS szűr, hogy
 *      csak a saját gyülekezetet kaphatja meg a user — később bővítendő
 *      többgyülekezet-hozzáféréses esetekre).
 *   4. ON CONFLICT upsert a lokális `congregations_local`-be.
 *
 * Online-only függvény — hívás előtt nem ellenőrzi az `isOnline()`-t, mert
 * a híváslánc (pl. `connectionHealth`) már megteheti. Hiba esetén dobál.
 */
export async function pullOwnCongregation(userId: string): Promise<PullResult> {
  const supabase = getDesktopSupabase()

  // 1. A user gyülekezet-id-je — előbb lokálisan (már cache-elt profil)
  let congregationId: string | null = null
  const localProfile = await getLocalOwnProfile(userId)
  if (localProfile?.congregation_id) {
    congregationId = localProfile.congregation_id
  } else {
    // Ha nincs lokális profil vagy nincs congregation_id, kérdezzük meg a szervert.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('congregation_id')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) {
      throw new Error(`Supabase profile-lookup hiba: ${profileError.message}`)
    }
    congregationId = profile?.congregation_id ?? null
  }

  if (!congregationId) {
    // A user-nek nincs gyülekezete — ez érvényes állapot (pl. super-admin).
    const now = new Date().toISOString()
    await setSetting(LAST_PULL_CONGREGATION_KEY, now)
    return { pulledRows: 0, lastPullIso: now }
  }

  // 2. A gyülekezet-sor letöltése.
  //
  // Két próba: ELŐSZÖR a teljes séma (revision + updated_at), MÁSODJÁRA
  // fallback ezek nélkül. Ez azért kell, mert az M6.1 Supabase SQL
  // migráció egy külön lépés — amíg nem futtatták Supabase Studio-ban,
  // a revision/updated_at oszlopok nincsenek a szerveren, és a teljes
  // SELECT egy `42703 - column does not exist` Postgres-hibát ad.
  //
  // A fallback pull működik, de a konfliktus-detektálás ki van kapcsolva
  // (revision = 0, updated_at = null) addig, amíg a SQL nem fut le.
  const FULL_COLS =
    'id, name, nev_hu, nev_ro, nev_en, district, egyhazmegye, diocese_id, ' +
    'adoszam, cim, email, telefon, web, varos, megye, iranyitoszam, ' +
    'iban, bank, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid, ' +
    'cimer_url, public_slug, public_site_enabled, revision, updated_at'
  const FALLBACK_COLS =
    'id, name, nev_hu, nev_ro, nev_en, district, egyhazmegye, diocese_id, ' +
    'adoszam, cim, email, telefon, web, varos, megye, iranyitoszam, ' +
    'iban, bank, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid, ' +
    'cimer_url, public_slug, public_site_enabled'

  let data: unknown = null
  let pullError: { message: string; code?: string } | null = null

  {
    const first = await supabase
      .from('congregations')
      .select(FULL_COLS)
      .eq('id', congregationId)
      .maybeSingle()
    data = first.data
    pullError = first.error
      ? { message: first.error.message, code: first.error.code }
      : null
  }

  // Ha a hiba "column ... does not exist" (Postgres 42703) → retry
  // fallback-COLS-szal. Minden más hibát továbbdobunk.
  if (
    pullError &&
    (pullError.code === '42703' ||
      /column .* does not exist/i.test(pullError.message))
  ) {
    console.warn(
      '[sync] A congregations táblán még nincs revision/updated_at oszlop. ' +
        'Fallback-pull fut (konfliktus-detektálás kikapcsolva). ' +
        'Futtasd a 2026-04-23-m6-1-congregations-revision.sql-t Supabase Studio-ban.',
    )
    const fallback = await supabase
      .from('congregations')
      .select(FALLBACK_COLS)
      .eq('id', congregationId)
      .maybeSingle()
    data = fallback.data
    pullError = fallback.error
      ? { message: fallback.error.message, code: fallback.error.code }
      : null
  }

  if (pullError) {
    throw new Error(`Supabase pullOwnCongregation hiba: ${pullError.message}`)
  }
  if (!data) {
    // A congregation_id mutat valahova, de az RLS / törlés miatt nem jön sor.
    return { pulledRows: 0, lastPullIso: new Date().toISOString() }
  }

  // 3. Upsert a lokális cache-be.
  //
  // A Supabase `.select()` string itt hosszabb, mint a Supabase type-inference
  // átláthatósági küszöbe, ezért a `data` típus `GenericStringError` lehet
  // TS-ben, hiába sikeres a hívás futás közben. Egyszeri `unknown`-on át cast
  // kell — a mezőknek a valódi Postgres-oldali típusokkal kell egyeznie.
  const row = data as unknown as {
    id: string
    name: string
    nev_hu: string | null
    nev_ro: string | null
    nev_en: string | null
    district: string | null
    egyhazmegye: string | null
    diocese_id: string | null
    adoszam: string | null
    cim: string | null
    email: string | null
    telefon: string | null
    web: string | null
    varos: string | null
    megye: string | null
    iranyitoszam: string | null
    iban: string | null
    bank: string | null
    eves_jarulek: number | null
    jarulek_kedvezmenyes: number | null
    jarulek_hatarid: string | null
    cimer_url: string | null
    public_slug: string | null
    public_site_enabled: boolean | null
    // Ha az M6.1 migráció még nem futott, ezek hiányoznak
    revision?: number
    updated_at?: string
  }

  await dbExecute(
    `INSERT INTO congregations_local
       (id, name, nev_hu, nev_ro, nev_en, district, egyhazmegye, diocese_id,
        adoszam, cim, email, telefon, web, varos, megye, iranyitoszam,
        iban, bank, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid,
        cimer_url, public_slug, public_site_enabled,
        revision, updated_at, synced_at)
     VALUES
       (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
        ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
        ?17, ?18, ?19, ?20, ?21,
        ?22, ?23, ?24,
        ?25, ?26, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       nev_hu = excluded.nev_hu,
       nev_ro = excluded.nev_ro,
       nev_en = excluded.nev_en,
       district = excluded.district,
       egyhazmegye = excluded.egyhazmegye,
       diocese_id = excluded.diocese_id,
       adoszam = excluded.adoszam,
       cim = excluded.cim,
       email = excluded.email,
       telefon = excluded.telefon,
       web = excluded.web,
       varos = excluded.varos,
       megye = excluded.megye,
       iranyitoszam = excluded.iranyitoszam,
       iban = excluded.iban,
       bank = excluded.bank,
       eves_jarulek = excluded.eves_jarulek,
       jarulek_kedvezmenyes = excluded.jarulek_kedvezmenyes,
       jarulek_hatarid = excluded.jarulek_hatarid,
       cimer_url = excluded.cimer_url,
       public_slug = excluded.public_slug,
       public_site_enabled = excluded.public_site_enabled,
       revision = excluded.revision,
       updated_at = excluded.updated_at,
       synced_at = excluded.synced_at`,
    [
      row.id,
      row.name,
      row.nev_hu,
      row.nev_ro,
      row.nev_en,
      row.district,
      row.egyhazmegye,
      row.diocese_id,
      row.adoszam,
      row.cim,
      row.email,
      row.telefon,
      row.web,
      row.varos,
      row.megye,
      row.iranyitoszam,
      row.iban,
      row.bank,
      row.eves_jarulek,
      row.jarulek_kedvezmenyes,
      row.jarulek_hatarid,
      row.cimer_url,
      row.public_slug,
      // boolean → INTEGER (0/1)
      row.public_site_enabled ? 1 : 0,
      // Fallback, ha az M6.1 migráció még nem futott
      row.revision ?? 0,
      row.updated_at ?? null,
    ],
  )

  const now = new Date().toISOString()
  await setSetting(LAST_PULL_CONGREGATION_KEY, now)
  return { pulledRows: 1, lastPullIso: now }
}

/**
 * Offline olvasás: a user saját gyülekezet-sorát a lokális cache-ből.
 *
 * Először a profile-ból olvasa a congregation_id-t (lokális), majd a
 * congregations_local-ból a sort. Ha a user profil nincs cache-elve vagy
 * nincs congregation_id-je, null-t ad.
 */
export async function getLocalOwnCongregation(
  userId: string,
): Promise<CongregationLocalRow | null> {
  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) return null

  const rows = await dbSelect<CongregationLocalRow>(
    `SELECT id, name, nev_hu, nev_ro, nev_en, district, egyhazmegye, diocese_id,
            adoszam, cim, email, telefon, web, varos, megye, iranyitoszam,
            iban, bank, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid,
            cimer_url, public_slug, public_site_enabled,
            revision, updated_at, synced_at
       FROM congregations_local
      WHERE id = ?1`,
    [profile.congregation_id],
  )
  return rows[0] ?? null
}

/** Utolsó sikeres congregations-pull ISO-ideje (settings). */
export async function getLastPullCongregationIso(): Promise<string | null> {
  return getSetting(LAST_PULL_CONGREGATION_KEY)
}

// ═════════════════════════════════════════════════════════════════════════
// M7 — SZEMELY (tagnyilvántartás) PULL-SYNC
// ═════════════════════════════════════════════════════════════════════════
// A lelkész offline is láthatja a saját gyülekezete **tagjait**.
//
// Scope V1:
//   - pullMembersOfOwnCongregation(userId) — delta-pull (updated_at > last_pull)
//   - getLocalMembersOfOwnCongregation(userId) — offline olvasás listához
//   - Csak a user saját gyülekezete — a profiles.congregation_id-n át
//
// Kihagyva V1-ből (későbbi fázis):
//   - Írás (updateMember, addMember)
//   - Családi kapcsolatok join (csalad_local)
//   - Fotók (kep, photo_url) — külön Storage-cache

/**
 * A `szemely` és `szemely_local` közös, szinkronizált oszlopai (V1 subset).
 * Kihagyva V1: szig, taj, kep, photo_url, sz_helyid, c_utcaid, c_helysegid, befizetoev
 */
export interface MemberLocalRow {
  id: number // INTEGER (szemely.id integer, nem uuid!)
  cnp: string
  szcs_nev: string | null
  k_nev: string | null
  csaladnev: string | null
  ferjk_nev: string | null
  allapot: string | null

  // Személyes
  sz_datum: string | null // ISO date
  /** SQLite INTEGER (0/1). */
  ferfi: number
  /** SQLite INTEGER (0/1). */
  csaladfo: number
  /** SQLite INTEGER (0/1). */
  meghalt: number
  member_status: string | null

  // Családfa
  apjaneve: string | null
  anyjaneve: string | null
  id_apja: string | null
  id_anyja: string | null

  // Cím
  c_szam: string | null
  c_tombhaz: string | null
  c_lepcsohaz: string | null
  c_ajto: string | null
  c_emelet: string | null
  c_szcim: string | null

  // Elérhetőség
  telefon: string | null
  email: string | null

  // Vallás/identitás
  vallas: string | null
  foglalkozas: string | null
  nemzetiseg: string | null
  /** SQLite INTEGER (0/1). */
  voter_eligible: number

  // FK-k
  congregation_id: string | null
  family_id: string | null

  // Egyéb
  type: string | null
  /** SQLite INTEGER (0/1). */
  isvisible: number
  megjegyzes: string | null

  // Sync metadata
  revision: number
  updated_at: string | null
  synced_at: string
}

/**
 * Supabase-ről érkező raw-sor típusa — a `public_site_enabled` / boolean mezők
 * JS boolean-ok, nem 0/1-ek. A DB upsert-kor konvertálunk.
 */
interface MemberSupabaseRow {
  id: number
  cnp: string
  szcs_nev: string | null
  k_nev: string | null
  csaladnev: string | null
  ferjk_nev: string | null
  allapot: string | null
  sz_datum: string | null
  ferfi: boolean
  csaladfo: boolean
  meghalt: boolean
  member_status: string | null
  apjaneve: string | null
  anyjaneve: string | null
  id_apja: string | null
  id_anyja: string | null
  c_szam: string | null
  c_tombhaz: string | null
  c_lepcsohaz: string | null
  c_ajto: string | null
  c_emelet: string | null
  c_szcim: string | null
  telefon: string | null
  email: string | null
  vallas: string | null
  foglalkozas: string | null
  nemzetiseg: string | null
  voter_eligible: boolean | null
  congregation_id: string | null
  family_id: string | null
  type: string | null
  isvisible: boolean
  megjegyzes: string | null
  revision?: number
  updated_at?: string
}

const MEMBER_SELECT_COLS =
  'id, cnp, szcs_nev, k_nev, csaladnev, ferjk_nev, allapot, ' +
  'sz_datum, ferfi, csaladfo, meghalt, member_status, ' +
  'apjaneve, anyjaneve, id_apja, id_anyja, ' +
  'c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet, c_szcim, ' +
  'telefon, email, vallas, foglalkozas, nemzetiseg, voter_eligible, ' +
  'congregation_id, family_id, type, isvisible, megjegyzes, revision, updated_at'

/** Kulcs-prefix — a per-gyülekezet last_pull külön mezőben él. */
const LAST_PULL_MEMBERS_KEY_PREFIX = 'sync:members:last_pull:'

function memberLastPullKey(congregationId: string): string {
  return `${LAST_PULL_MEMBERS_KEY_PREFIX}${congregationId}`
}

/**
 * Letölti a bejelentkezett user gyülekezetének tagjait a Supabase-ből
 * a lokális `szemely_local` cache-be.
 *
 * Mode:
 *   - 'delta' (default): csak `updated_at > last_pull_for_this_congregation`
 *   - 'full': mindent, akkor is, ha nagy
 *
 * Első hívásnál (nincs last_pull) → automatikusan 'full-initial' fut.
 *
 * Az RLS szerver-oldalon is szűr (csak a saját gyülekezet), de kliens-oldalon
 * is megadjuk a `congregation_id` szűrőt a robusztusság miatt.
 */
export async function pullMembersOfOwnCongregation(
  userId: string,
  mode: 'delta' | 'full' = 'delta',
): Promise<{
  pulledRows: number
  mode: 'delta' | 'full' | 'full-initial' | 'no-congregation'
  lastPullIso: string
}> {
  const supabase = getDesktopSupabase()

  // 1. congregation_id kinyerése — előbb lokálisan (gyors)
  let congregationId: string | null = null
  const localProfile = await getLocalOwnProfile(userId)
  if (localProfile?.congregation_id) {
    congregationId = localProfile.congregation_id
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('congregation_id')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) {
      throw new Error(`Supabase profile-lookup hiba: ${profileError.message}`)
    }
    congregationId = profile?.congregation_id ?? null
  }

  if (!congregationId) {
    const now = new Date().toISOString()
    return { pulledRows: 0, mode: 'no-congregation', lastPullIso: now }
  }

  // 2. delta vs. full eldöntése
  const lastPullKey = memberLastPullKey(congregationId)
  const lastPull = mode === 'delta' ? await getSetting(lastPullKey) : null
  const effectiveMode: 'delta' | 'full' | 'full-initial' =
    mode === 'full' ? 'full' : lastPull ? 'delta' : 'full-initial'

  // 3. Supabase lekérdezés
  let query = supabase
    .from('szemely')
    .select(MEMBER_SELECT_COLS)
    .eq('congregation_id', congregationId)
    .order('updated_at', { ascending: true })

  if (effectiveMode === 'delta' && lastPull) {
    query = query.gt('updated_at', lastPull)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Supabase pullMembers hiba: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as MemberSupabaseRow[]

  // 4. Upsert a lokális cache-be — soronként
  for (const row of rows) {
    await dbExecute(
      `INSERT INTO szemely_local
         (id, cnp, szcs_nev, k_nev, csaladnev, ferjk_nev, allapot,
          sz_datum, ferfi, csaladfo, meghalt, member_status,
          apjaneve, anyjaneve, id_apja, id_anyja,
          c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet, c_szcim,
          telefon, email, vallas, foglalkozas, nemzetiseg, voter_eligible,
          congregation_id, family_id, type, isvisible, megjegyzes,
          revision, updated_at, synced_at)
       VALUES
         (?1, ?2, ?3, ?4, ?5, ?6, ?7,
          ?8, ?9, ?10, ?11, ?12,
          ?13, ?14, ?15, ?16,
          ?17, ?18, ?19, ?20, ?21, ?22,
          ?23, ?24, ?25, ?26, ?27, ?28,
          ?29, ?30, ?31, ?32, ?33,
          ?34, ?35, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         cnp = excluded.cnp,
         szcs_nev = excluded.szcs_nev,
         k_nev = excluded.k_nev,
         csaladnev = excluded.csaladnev,
         ferjk_nev = excluded.ferjk_nev,
         allapot = excluded.allapot,
         sz_datum = excluded.sz_datum,
         ferfi = excluded.ferfi,
         csaladfo = excluded.csaladfo,
         meghalt = excluded.meghalt,
         member_status = excluded.member_status,
         apjaneve = excluded.apjaneve,
         anyjaneve = excluded.anyjaneve,
         id_apja = excluded.id_apja,
         id_anyja = excluded.id_anyja,
         c_szam = excluded.c_szam,
         c_tombhaz = excluded.c_tombhaz,
         c_lepcsohaz = excluded.c_lepcsohaz,
         c_ajto = excluded.c_ajto,
         c_emelet = excluded.c_emelet,
         c_szcim = excluded.c_szcim,
         telefon = excluded.telefon,
         email = excluded.email,
         vallas = excluded.vallas,
         foglalkozas = excluded.foglalkozas,
         nemzetiseg = excluded.nemzetiseg,
         voter_eligible = excluded.voter_eligible,
         congregation_id = excluded.congregation_id,
         family_id = excluded.family_id,
         type = excluded.type,
         isvisible = excluded.isvisible,
         megjegyzes = excluded.megjegyzes,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         synced_at = excluded.synced_at`,
      [
        row.id,
        row.cnp,
        row.szcs_nev,
        row.k_nev,
        row.csaladnev,
        row.ferjk_nev,
        row.allapot,
        row.sz_datum,
        row.ferfi ? 1 : 0,
        row.csaladfo ? 1 : 0,
        row.meghalt ? 1 : 0,
        row.member_status,
        row.apjaneve,
        row.anyjaneve,
        row.id_apja,
        row.id_anyja,
        row.c_szam,
        row.c_tombhaz,
        row.c_lepcsohaz,
        row.c_ajto,
        row.c_emelet,
        row.c_szcim,
        row.telefon,
        row.email,
        row.vallas,
        row.foglalkozas,
        row.nemzetiseg,
        row.voter_eligible ? 1 : 0,
        row.congregation_id,
        row.family_id,
        row.type,
        row.isvisible ? 1 : 0,
        row.megjegyzes,
        row.revision ?? 0,
        row.updated_at ?? null,
      ],
    )
  }

  // 5. last_pull frissítés — a legújabb kapott updated_at-ra
  let newLastPull = lastPull ?? new Date(0).toISOString()
  for (const row of rows) {
    if (row.updated_at && row.updated_at > newLastPull) {
      newLastPull = row.updated_at
    }
  }
  if (rows.length > 0) {
    await setSetting(lastPullKey, newLastPull)
  } else if (!lastPull) {
    // Első futás, nem jött semmi — mégis jegyezzük, hogy „futott"
    await setSetting(lastPullKey, new Date().toISOString())
  }

  return {
    pulledRows: rows.length,
    mode: effectiveMode,
    lastPullIso: newLastPull,
  }
}

/**
 * A user saját gyülekezetének lokálisan cache-elt tagjai.
 *
 * Alapértelmezés:
 *   - **MINDENKIT mutat**, aki nem halt meg (`meghalt = 0`)
 *   - Az `isvisible` szerint **NEM szűr alapból** — a legacy Kartotéka
 *     adatokban sokszor `false` az alapérték (pl. adminisztratív jelzés),
 *     de a lelkész így is látni akarja őket. Ezt csak akkor szűrjük,
 *     ha `options.onlyVisible = true` explicit kérés van rá.
 *
 * Keresés: LIKE `%search%` mezőkön: csaladnev, k_nev, ferjk_nev, cnp.
 *
 * Rendezés: `csaladnev ASC, k_nev ASC` — ábécé-sorrend a UI-nak.
 */
export async function getLocalMembersOfOwnCongregation(
  userId: string,
  options?: { includeDeceased?: boolean; onlyVisible?: boolean; search?: string },
): Promise<MemberLocalRow[]> {
  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) return []

  const conditions: string[] = ['congregation_id = ?1']
  const params: (string | number)[] = [profile.congregation_id]
  let idx = 2

  if (!options?.includeDeceased) {
    conditions.push('meghalt = 0')
  }
  if (options?.onlyVisible) {
    // Csak kéretlenül (opt-in) szűrünk isvisible-re — a legacy adatoknál
    // sok false-érték van, amit a lelkész látni akar
    conditions.push('isvisible = 1')
  }
  if (options?.search) {
    conditions.push(
      `(csaladnev LIKE ?${idx} OR k_nev LIKE ?${idx} OR ferjk_nev LIKE ?${idx} OR cnp LIKE ?${idx})`,
    )
    params.push(`%${options.search}%`)
    idx++
  }

  const where = conditions.join(' AND ')
  return dbSelect<MemberLocalRow>(
    `SELECT id, cnp, szcs_nev, k_nev, csaladnev, ferjk_nev, allapot,
            sz_datum, ferfi, csaladfo, meghalt, member_status,
            apjaneve, anyjaneve, id_apja, id_anyja,
            c_szam, c_tombhaz, c_lepcsohaz, c_ajto, c_emelet, c_szcim,
            telefon, email, vallas, foglalkozas, nemzetiseg, voter_eligible,
            congregation_id, family_id, type, isvisible, megjegyzes,
            revision, updated_at, synced_at
       FROM szemely_local
      WHERE ${where}
      ORDER BY COALESCE(csaladnev, ''), COALESCE(k_nev, '')`,
    params,
  )
}

/**
 * Tag-diagnosztika a saját gyülekezet lokális cache-éről.
 * Visszaadja:
 *   - `total` : minden cache-elt sor
 *   - `living` : csak élő (meghalt = 0)
 *   - `visible` : csak élő + isvisible = 1
 * Hasznos a UI-ban: megmutatja, mit szűr az adott checkbox-kombináció.
 */
export async function getLocalMemberCounts(userId: string): Promise<{
  total: number
  living: number
  visible: number
}> {
  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) return { total: 0, living: 0, visible: 0 }

  const rows = await dbSelect<{ total: number; living: number; visible: number }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN meghalt = 0 THEN 1 ELSE 0 END) AS living,
       SUM(CASE WHEN meghalt = 0 AND isvisible = 1 THEN 1 ELSE 0 END) AS visible
     FROM szemely_local
     WHERE congregation_id = ?1`,
    [profile.congregation_id],
  )
  return {
    total: rows[0]?.total ?? 0,
    living: rows[0]?.living ?? 0,
    visible: rows[0]?.visible ?? 0,
  }
}

/** @deprecated Használd a `getLocalMemberCounts`-t — gazdagabb info */
export async function getLocalMemberCount(userId: string): Promise<number> {
  const counts = await getLocalMemberCounts(userId)
  return counts.living
}

/** Utolsó member-pull a user gyülekezetére — null, ha még nem futott. */
export async function getLastPullMembersIso(userId: string): Promise<string | null> {
  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) return null
  return getSetting(memberLastPullKey(profile.congregation_id))
}

// ═════════════════════════════════════════════════════════════════════════
// M8 — MUNKANAPLO (lelkészi napló) PULL-SYNC
// ═════════════════════════════════════════════════════════════════════════
// A lelkész napi szolgálat-nyilvántartása: istentiszteletek, látogatások,
// alapigék, jelenlét-számok, persely. Offline is kereshető / böngészhető.
//
// A Supabase-oldali M8.0 migráció adja hozzá a BEFORE UPDATE trigger-t
// (`munkanaplo.revision` + `updated_at` oszlopok már léteztek a sémában).

export interface WorklogLocalRow {
  id: number
  idopont: string | null
  jellege: string | null
  id_jellege: string | null
  bibliaolvasas: string | null
  alapige: string | null
  cim: string | null
  enekek: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number
  szolgalt: string | null
  persely: number | null
  megjegyzes: string | null
  mediapath: string | null
  kategoria: string | null
  /** SQLite INTEGER (0/1). */
  du: number
  /** SQLite INTEGER (0/1). Soft-delete flag — a UI-ban rejtjük. */
  deleted: number
  congregation_id: string | null
  revision: number
  updated_at: string | null
  synced_at: string
}

interface WorklogSupabaseRow {
  id: number
  idopont: string | null
  jellege: string | null
  id_jellege: string | null
  bibliaolvasas: string | null
  alapige: string | null
  cim: string | null
  enekek: string | null
  jelenlet_ferfi: number | null
  jelenlet_no: number | null
  jelenlet_gyermek: number | null
  jelenlet_osszesen: number
  szolgalt: string | null
  persely: number | null
  megjegyzes: string | null
  mediapath: string | null
  kategoria: string | null
  du: boolean | null
  deleted: boolean | null
  congregation_id: string | null
  revision?: number
  updated_at?: string
}

const WORKLOG_SELECT_COLS =
  'id, idopont, jellege, id_jellege, bibliaolvasas, alapige, cim, enekek, ' +
  'jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen, ' +
  'szolgalt, persely, megjegyzes, mediapath, kategoria, du, deleted, ' +
  'congregation_id, revision, updated_at'

const LAST_PULL_WORKLOG_KEY_PREFIX = 'sync:worklog:last_pull:'

function worklogLastPullKey(congregationId: string): string {
  return `${LAST_PULL_WORKLOG_KEY_PREFIX}${congregationId}`
}

/**
 * Letölti a bejelentkezett user gyülekezetének munkanapló-bejegyzéseit.
 * Delta-sync `updated_at > last_pull` alapon, ugyanúgy, mint a tagok.
 */
export async function pullWorklogOfOwnCongregation(
  userId: string,
  mode: 'delta' | 'full' = 'delta',
): Promise<{
  pulledRows: number
  mode: 'delta' | 'full' | 'full-initial' | 'no-congregation'
  lastPullIso: string
}> {
  const supabase = getDesktopSupabase()

  // 1. congregation_id
  let congregationId: string | null = null
  const localProfile = await getLocalOwnProfile(userId)
  if (localProfile?.congregation_id) {
    congregationId = localProfile.congregation_id
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('congregation_id')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) {
      throw new Error(`Supabase profile-lookup hiba: ${profileError.message}`)
    }
    congregationId = profile?.congregation_id ?? null
  }

  if (!congregationId) {
    const now = new Date().toISOString()
    return { pulledRows: 0, mode: 'no-congregation', lastPullIso: now }
  }

  // 2. delta vs. full
  const lastPullKey = worklogLastPullKey(congregationId)
  const lastPull = mode === 'delta' ? await getSetting(lastPullKey) : null
  const effectiveMode: 'delta' | 'full' | 'full-initial' =
    mode === 'full' ? 'full' : lastPull ? 'delta' : 'full-initial'

  // 3. Query
  let query = supabase
    .from('munkanaplo')
    .select(WORKLOG_SELECT_COLS)
    .eq('congregation_id', congregationId)
    .order('updated_at', { ascending: true })

  if (effectiveMode === 'delta' && lastPull) {
    query = query.gt('updated_at', lastPull)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Supabase pullWorklog hiba: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as WorklogSupabaseRow[]

  // 4. Upsert soronként
  for (const row of rows) {
    await dbExecute(
      `INSERT INTO munkanaplo_local
         (id, idopont, jellege, id_jellege, bibliaolvasas, alapige, cim, enekek,
          jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
          szolgalt, persely, megjegyzes, mediapath, kategoria, du, deleted,
          congregation_id, revision, updated_at, synced_at)
       VALUES
         (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
          ?9, ?10, ?11, ?12,
          ?13, ?14, ?15, ?16, ?17, ?18, ?19,
          ?20, ?21, ?22, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         idopont = excluded.idopont,
         jellege = excluded.jellege,
         id_jellege = excluded.id_jellege,
         bibliaolvasas = excluded.bibliaolvasas,
         alapige = excluded.alapige,
         cim = excluded.cim,
         enekek = excluded.enekek,
         jelenlet_ferfi = excluded.jelenlet_ferfi,
         jelenlet_no = excluded.jelenlet_no,
         jelenlet_gyermek = excluded.jelenlet_gyermek,
         jelenlet_osszesen = excluded.jelenlet_osszesen,
         szolgalt = excluded.szolgalt,
         persely = excluded.persely,
         megjegyzes = excluded.megjegyzes,
         mediapath = excluded.mediapath,
         kategoria = excluded.kategoria,
         du = excluded.du,
         deleted = excluded.deleted,
         congregation_id = excluded.congregation_id,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         synced_at = excluded.synced_at`,
      [
        row.id,
        row.idopont,
        row.jellege,
        row.id_jellege,
        row.bibliaolvasas,
        row.alapige,
        row.cim,
        row.enekek,
        row.jelenlet_ferfi,
        row.jelenlet_no,
        row.jelenlet_gyermek,
        row.jelenlet_osszesen ?? 0,
        row.szolgalt,
        row.persely,
        row.megjegyzes,
        row.mediapath,
        row.kategoria,
        row.du ? 1 : 0,
        row.deleted ? 1 : 0,
        row.congregation_id,
        row.revision ?? 0,
        row.updated_at ?? null,
      ],
    )
  }

  // 5. last_pull frissítés
  let newLastPull = lastPull ?? new Date(0).toISOString()
  for (const row of rows) {
    if (row.updated_at && row.updated_at > newLastPull) {
      newLastPull = row.updated_at
    }
  }
  if (rows.length > 0) {
    await setSetting(lastPullKey, newLastPull)
  } else if (!lastPull) {
    await setSetting(lastPullKey, new Date().toISOString())
  }

  return {
    pulledRows: rows.length,
    mode: effectiveMode,
    lastPullIso: newLastPull,
  }
}

/**
 * Lokálisan cache-elt munkanapló-bejegyzések.
 * Rendezés: `idopont DESC` — legutóbbi bejegyzések felül.
 *
 * Alapértelmezésben **a soft-delete-elt** sorokat (deleted=1) **kizárjuk**.
 * Ha a hívó kifejezetten kéri (pl. archív nézet), használhatja az
 * `includeDeleted: true` opciót.
 */
export async function getLocalWorklogOfOwnCongregation(
  userId: string,
  options?: { search?: string; limit?: number; includeDeleted?: boolean },
): Promise<WorklogLocalRow[]> {
  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) return []

  const conditions: string[] = ['congregation_id = ?1']
  const params: (string | number)[] = [profile.congregation_id]
  let idx = 2

  if (!options?.includeDeleted) {
    conditions.push('deleted = 0')
  }

  if (options?.search) {
    conditions.push(
      `(cim LIKE ?${idx} OR alapige LIKE ?${idx} OR bibliaolvasas LIKE ?${idx} OR szolgalt LIKE ?${idx} OR megjegyzes LIKE ?${idx})`,
    )
    params.push(`%${options.search}%`)
    idx++
  }

  const limit = options?.limit ?? 200
  params.push(limit)

  const where = conditions.join(' AND ')
  return dbSelect<WorklogLocalRow>(
    `SELECT id, idopont, jellege, id_jellege, bibliaolvasas, alapige, cim, enekek,
            jelenlet_ferfi, jelenlet_no, jelenlet_gyermek, jelenlet_osszesen,
            szolgalt, persely, megjegyzes, mediapath, kategoria, du, deleted,
            congregation_id, revision, updated_at, synced_at
       FROM munkanaplo_local
      WHERE ${where}
      ORDER BY COALESCE(idopont, '') DESC, id DESC
      LIMIT ?${idx}`,
    params,
  )
}

/** Munkanapló-bejegyzések száma a saját gyülekezetre. */
export async function getLocalWorklogCount(userId: string): Promise<number> {
  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) return 0
  const rows = await dbSelect<{ count: number }>(
    `SELECT COUNT(*) AS count FROM munkanaplo_local WHERE congregation_id = ?1`,
    [profile.congregation_id],
  )
  return rows[0]?.count ?? 0
}

/** Utolsó worklog-pull ISO-ideje. */
export async function getLastPullWorklogIso(userId: string): Promise<string | null> {
  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) return null
  return getSetting(worklogLastPullKey(profile.congregation_id))
}

// ─────────────────────────────────────────────────────────────────────────
// M9 — WRITE operations (munkanaplo)
// ─────────────────────────────────────────────────────────────────────────

/** Input a `createWorklogEntry` / `updateWorklogEntry` számára. */
export interface WorklogInput {
  idopont: string // ISO 'YYYY-MM-DD'
  jellege: string
  kategoria?: 'szolgalat' | 'katekezis' | 'latogatas' | null
  cim?: string | null
  bibliaolvasas?: string | null
  alapige?: string | null
  enekek?: string | null
  szolgalt?: string | null
  jelenlet_ferfi?: number | null
  jelenlet_no?: number | null
  jelenlet_gyermek?: number | null
  persely?: number | null
  megjegyzes?: string | null
  du?: boolean
}

export interface WorklogCreateResult {
  id: number | null // server id, only if online
  queuedToOutbox: boolean
  error?: string
}

/**
 * Új munkanapló-bejegyzés létrehozása.
 *
 * Flow:
 *   - congregation_id kinyerése a user profile-ból
 *   - `jelenlet_osszesen` auto-kalkuláció (férfi+nő+gyermek)
 *   - Online → Supabase INSERT, utána a munkanapló lokális delta-pull
 *   - Offline / hiba → outbox (`op: 'insert'`, `target_table: 'munkanaplo'`)
 *
 * A web `saveWorklog` action-jét tükrözi — `deleted: false` + `congregation_id`
 * automatikusan. A `jelenlet_osszesen` NOT NULL kényszer miatt mindig számított.
 */
export async function createWorklogEntry(
  userId: string,
  input: WorklogInput,
): Promise<WorklogCreateResult> {
  if (!input.idopont) {
    return { id: null, queuedToOutbox: false, error: 'A dátum kötelező.' }
  }
  if (!input.jellege) {
    return { id: null, queuedToOutbox: false, error: 'A típus kötelező.' }
  }

  const profile = await getLocalOwnProfile(userId)
  if (!profile?.congregation_id) {
    return {
      id: null,
      queuedToOutbox: false,
      error: 'Nincs gyülekezet hozzárendelve a profilhoz.',
    }
  }

  const jelenletOsszesen =
    (input.jelenlet_ferfi ?? 0) + (input.jelenlet_no ?? 0) + (input.jelenlet_gyermek ?? 0)

  // Az insert-rekord a Supabase-szerver oldalára, egyezik a web `saveWorklog`-gal.
  const record: Record<string, unknown> = {
    idopont: input.idopont,
    jellege: input.jellege,
    kategoria: input.kategoria ?? 'szolgalat',
    cim: input.cim ?? null,
    bibliaolvasas: input.bibliaolvasas ?? null,
    alapige: input.alapige ?? null,
    enekek: input.enekek ?? null,
    szolgalt: input.szolgalt ?? null,
    jelenlet_ferfi: input.jelenlet_ferfi ?? null,
    jelenlet_no: input.jelenlet_no ?? null,
    jelenlet_gyermek: input.jelenlet_gyermek ?? null,
    jelenlet_osszesen: jelenletOsszesen,
    persely: input.persely ?? null,
    megjegyzes: input.megjegyzes ?? null,
    du: input.du ?? false,
    deleted: false,
    congregation_id: profile.congregation_id,
  }

  // Online attempt
  if (await isOnline()) {
    try {
      const supabase = getDesktopSupabase()
      const { data, error } = await supabase
        .from('munkanaplo')
        .insert([record])
        .select('id')
        .single()
      if (error) throw error
      const newId = (data as { id: number }).id

      // Delta-pull, hogy az új sor a lokális cache-be kerüljön a trigger-
      // által kitöltött revision/updated_at értékekkel együtt
      try {
        await pullWorklogOfOwnCongregation(userId, 'delta')
      } catch {
        // A pull-hiba nem kritikus: a sor létrejött a szerveren; a következő
        // sync lehozza. A user látja a sikert a visszatérési ID-ban.
      }

      return { id: newId, queuedToOutbox: false }
    } catch (err) {
      // Supabase-hiba → fallback outboxra (pl. jogosultság, hálózat-megszakadás)
      // A user így nem veszti el az adatot — offline-tól nem különbözik.
    }
  }

  // Offline vagy sikertelen online → outbox
  await enqueueOutbox('insert', 'munkanaplo', null, record)
  return { id: null, queuedToOutbox: true }
}

/**
 * Munkanapló-bejegyzés frissítése (részleges patch).
 *
 * Optimistic-concurrency: conditional Supabase UPDATE `.eq('revision', expected)`.
 * Ha a szerver-oldali revision eltér (másik eszközről, webes admin), 0 sor
 * frissül → konfliktus → re-pull.
 *
 * A `createWorklogEntry` párja, de id-val és revision-nel.
 * A patch mezők a `WorklogInput` subset-je (ami változott — a többi marad).
 */
export async function updateWorklogEntry(
  userId: string,
  entryId: number,
  patch: Partial<WorklogInput>,
  expectedRevision: number,
): Promise<{ queuedToOutbox: boolean; conflict: boolean; newRevision?: number; error?: string }> {
  if (Object.keys(patch).length === 0) {
    return { queuedToOutbox: false, conflict: false }
  }

  // jelenlet_osszesen auto-kalkuláció, ha bármelyik jelenlet-mező változott
  const jelenletChanged =
    patch.jelenlet_ferfi !== undefined ||
    patch.jelenlet_no !== undefined ||
    patch.jelenlet_gyermek !== undefined

  const effectivePatch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) effectivePatch[key] = value
  }

  if (jelenletChanged) {
    // Lokálisan olvassuk a jelenlegi értékeket, hogy a teljes összeget újraszámolhassuk
    const currentRows = await dbSelect<{
      jelenlet_ferfi: number | null
      jelenlet_no: number | null
      jelenlet_gyermek: number | null
    }>(
      `SELECT jelenlet_ferfi, jelenlet_no, jelenlet_gyermek
         FROM munkanaplo_local WHERE id = ?1`,
      [entryId],
    )
    const current = currentRows[0]
    if (current) {
      const ferfi = patch.jelenlet_ferfi ?? current.jelenlet_ferfi ?? 0
      const no = patch.jelenlet_no ?? current.jelenlet_no ?? 0
      const gyermek = patch.jelenlet_gyermek ?? current.jelenlet_gyermek ?? 0
      effectivePatch.jelenlet_osszesen = (ferfi ?? 0) + (no ?? 0) + (gyermek ?? 0)
    }
  }

  // 1. Optimistic local UPDATE
  const setClauses: string[] = []
  const params: (string | number | null)[] = []
  let idx = 1
  for (const [key, value] of Object.entries(effectivePatch)) {
    // SQLite: boolean → INTEGER (0/1), más mezők direkt
    const sqlValue =
      typeof value === 'boolean' ? (value ? 1 : 0) : (value as string | number | null)
    setClauses.push(`${key} = ?${idx++}`)
    params.push(sqlValue)
  }
  params.push(entryId)
  await dbExecute(
    `UPDATE munkanaplo_local SET ${setClauses.join(', ')}, synced_at = datetime('now')
      WHERE id = ?${idx}`,
    params,
  )

  // 2. Online conditional UPDATE
  if (await isOnline()) {
    try {
      const supabase = getDesktopSupabase()
      const { data, error } = await supabase
        .from('munkanaplo')
        .update(effectivePatch)
        .eq('id', entryId)
        .eq('revision', expectedRevision)
        .select('revision, updated_at')

      if (error) throw error

      if (!data || data.length === 0) {
        // Konfliktus → re-pull a lokális cache-be
        await pullWorklogOfOwnCongregation(userId, 'delta')
        return { queuedToOutbox: false, conflict: true }
      }

      const srv = data[0] as { revision: number; updated_at: string }
      // Frissítsük a lokális revision-t
      await dbExecute(
        `UPDATE munkanaplo_local SET revision = ?1, updated_at = ?2 WHERE id = ?3`,
        [srv.revision, srv.updated_at, entryId],
      )
      return { queuedToOutbox: false, conflict: false, newRevision: srv.revision }
    } catch {
      // Fall through outboxra
    }
  }

  // 3. Offline vagy hiba — outbox
  await enqueueOutbox('update', 'munkanaplo', String(entryId), {
    patch: effectivePatch,
    expected_revision: expectedRevision,
  })
  return { queuedToOutbox: true, conflict: false }
}

/**
 * Soft-delete: a `munkanaplo.deleted` mezőt igazra állítja. Konfliktus-kezelés
 * ugyanúgy, mint az `updateOwnProfile`-nál (conditional `revision`-check).
 */
export async function deleteWorklogEntry(
  userId: string,
  entryId: number,
  expectedRevision: number,
): Promise<{ queuedToOutbox: boolean; conflict: boolean; error?: string }> {
  // Optimistic local — azonnali eltűnés a listából
  await dbExecute(
    `UPDATE munkanaplo_local SET deleted = 1 WHERE id = ?1`,
    [entryId],
  )

  if (await isOnline()) {
    try {
      const supabase = getDesktopSupabase()
      const { data, error } = await supabase
        .from('munkanaplo')
        .update({ deleted: true })
        .eq('id', entryId)
        .eq('revision', expectedRevision)
        .select('revision')

      if (error) throw error

      if (!data || data.length === 0) {
        // Konfliktus: a szerver-oldali revision eltér → re-pull
        await pullWorklogOfOwnCongregation(userId, 'delta')
        return { queuedToOutbox: false, conflict: true }
      }
      return { queuedToOutbox: false, conflict: false }
    } catch {
      // Fall through az outboxra
    }
  }

  await enqueueOutbox('update', 'munkanaplo', String(entryId), {
    patch: { deleted: true },
    expected_revision: expectedRevision,
  })
  return { queuedToOutbox: true, conflict: false }
}

// ─────────────────────────────────────────────────────────────────────────
// M8.0b — WRITE operations (szemely / tagnyilvántartás)
// ─────────────────────────────────────────────────────────────────────────

export interface SzemelyUpdateResult {
  queuedToOutbox: boolean
  conflict: boolean
  newRevision?: number
  error?: string
}

/**
 * Egy tag (`szemely`) adatainak frissítése. A `updateWorklogEntry` mintája
 * szerint:
 *
 *   1. Optimistic local UPDATE a `szemely_local` cache-en — azonnali UI-feedback.
 *   2. Online: conditional Supabase UPDATE `.eq('revision', expectedRevision)`.
 *      Ha 0 sor frissült → konfliktus → re-pull a szerver-oldali igazsággal.
 *      Ha sikerült → új revision + updated_at visszaírása a lokálba.
 *   3. Offline vagy Supabase-hiba → outbox-sor `op='update'`, `target_table='szemely'`,
 *      payload `{ patch, expected_revision }`. A `processOutbox()` általános
 *      flush-helperje ugyanúgy kezeli, mint a munkanaplo update-eket.
 *
 * A szerver-oldali `revision`/`updated_at` léptető trigger a
 * `2026-04-23-m7-0-szemely-csalad-triggers.sql` migrációban készült el.
 *
 * A patch: **csak a változott mezőket** tartalmazza, már normalizált formában
 * (üres string → null, a zod-séma `normalizeSzemelyPatch` helper-éből).
 * A boolean → INTEGER konverziót a SQLite optimistic-writehoz itt végezzük.
 */
export async function updateSzemelyEntry(
  userId: string,
  szemelyId: number,
  patch: Record<string, unknown>,
  expectedRevision: number,
): Promise<SzemelyUpdateResult> {
  const keys = Object.keys(patch)
  if (keys.length === 0) {
    return { queuedToOutbox: false, conflict: false }
  }

  // 1. Optimistic local UPDATE
  const setClauses: string[] = []
  const params: (string | number | null)[] = []
  let idx = 1
  for (const [key, value] of Object.entries(patch)) {
    // SQLite: boolean → INTEGER (0/1). A null/string/number direkt megy.
    const sqlValue =
      typeof value === 'boolean'
        ? value
          ? 1
          : 0
        : (value as string | number | null)
    setClauses.push(`${key} = ?${idx++}`)
    params.push(sqlValue)
  }
  params.push(szemelyId)
  await dbExecute(
    `UPDATE szemely_local SET ${setClauses.join(', ')}, synced_at = datetime('now')
      WHERE id = ?${idx}`,
    params,
  )

  // 2. Online conditional UPDATE
  if (await isOnline()) {
    try {
      const supabase = getDesktopSupabase()
      const { data, error } = await supabase
        .from('szemely')
        .update(patch)
        .eq('id', szemelyId)
        .eq('revision', expectedRevision)
        .select('revision, updated_at')

      if (error) throw error

      if (!data || data.length === 0) {
        // Konfliktus → re-pull a lokális cache-be, majd jelezzük a UI-nak
        await pullMembersOfOwnCongregation(userId, 'delta')
        return { queuedToOutbox: false, conflict: true }
      }

      const srv = data[0] as { revision: number; updated_at: string }
      await dbExecute(
        `UPDATE szemely_local SET revision = ?1, updated_at = ?2 WHERE id = ?3`,
        [srv.revision, srv.updated_at, szemelyId],
      )
      return {
        queuedToOutbox: false,
        conflict: false,
        newRevision: srv.revision,
      }
    } catch (err) {
      // Fall through az outboxra — a `isOnline()` true volt, de a szerver
      // elérhetetlen vagy más hiba. A lelkész számára offline-ként viselkedünk.
      return await fallbackToOutbox(szemelyId, patch, expectedRevision, errorMessage(err))
    }
  }

  // 3. Offline — outbox
  return await fallbackToOutbox(szemelyId, patch, expectedRevision, null)
}

async function fallbackToOutbox(
  szemelyId: number,
  patch: Record<string, unknown>,
  expectedRevision: number,
  _lastError: string | null,
): Promise<SzemelyUpdateResult> {
  await enqueueOutbox('update', 'szemely', String(szemelyId), {
    patch,
    expected_revision: expectedRevision,
  })
  return { queuedToOutbox: true, conflict: false }
}

// ─────────────────────────────────────────────────────────────────────────
// M8.3a — Családok pull (csalad + gyerek)
// ─────────────────────────────────────────────────────────────────────────

const LAST_PULL_FAMILIES_KEY_PREFIX = 'sync:families:last_pull:'
const LAST_PULL_GYEREK_KEY_PREFIX = 'sync:gyerek:last_pull:'

function familyLastPullKey(congregationId: string): string {
  return `${LAST_PULL_FAMILIES_KEY_PREFIX}${congregationId}`
}
function gyerekLastPullKey(congregationId: string): string {
  return `${LAST_PULL_GYEREK_KEY_PREFIX}${congregationId}`
}

interface CsaladSupabaseRow {
  id: number
  id_ferfi: number | null
  id_no: number | null
  c_utcaid: number
  c_szam: string | null
  c_tombhaz: string | null
  c_lepcsohaz: string | null
  c_ajto: string | null
  c_emelet: string | null
  id_csoport: number | null
  isaktiv: boolean
  revision: number
  updated_at: string
}

interface GyerekSupabaseRow {
  id: number
  id_csalad: number
  id_szemely: number
  revision: number
  updated_at: string
}

/**
 * Gyülekezet családjainak pull-ja a Supabase-ből a `csalad_local` cache-be.
 *
 * A szerver-oldali `get_csaladok_for_congregation(congregation_id, updated_since)`
 * RPC-t hívja, ami a szemely-kapcsolat alapján szűr (lásd
 * `2026-04-24-m8-3a-csalad-rpc.sql`).
 */
export async function pullFamiliesOfOwnCongregation(
  userId: string,
  mode: 'delta' | 'full' = 'delta',
): Promise<{
  pulledRows: number
  mode: 'delta' | 'full' | 'full-initial' | 'no-congregation'
  lastPullIso: string
}> {
  const supabase = getDesktopSupabase()

  // 1. congregation_id feloldás (lokál profile → fallback Supabase)
  let congregationId: string | null = null
  const localProfile = await getLocalOwnProfile(userId)
  if (localProfile?.congregation_id) {
    congregationId = localProfile.congregation_id
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('congregation_id')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) {
      throw new Error(`Supabase profile-lookup hiba: ${profileError.message}`)
    }
    congregationId = profile?.congregation_id ?? null
  }

  if (!congregationId) {
    const now = new Date().toISOString()
    return { pulledRows: 0, mode: 'no-congregation', lastPullIso: now }
  }

  // 2. delta vs full
  const lastPullKey = familyLastPullKey(congregationId)
  const lastPull = mode === 'delta' ? await getSetting(lastPullKey) : null
  const effectiveMode: 'delta' | 'full' | 'full-initial' =
    mode === 'full' ? 'full' : lastPull ? 'delta' : 'full-initial'

  // 3. RPC hívás
  const { data, error } = await supabase.rpc('get_csaladok_for_congregation', {
    target_congregation_id: congregationId,
    updated_since: effectiveMode === 'delta' && lastPull ? lastPull : null,
  })
  if (error) {
    throw new Error(`Supabase pullFamilies hiba: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as CsaladSupabaseRow[]

  // 4. Upsert — soronként
  for (const row of rows) {
    await dbExecute(
      `INSERT INTO csalad_local
         (id, id_ferfi, id_no, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz,
          c_ajto, c_emelet, id_csoport, isaktiv, revision, updated_at, synced_at)
       VALUES
         (?1, ?2, ?3, ?4, ?5, ?6, ?7,
          ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         id_ferfi = excluded.id_ferfi,
         id_no = excluded.id_no,
         c_utcaid = excluded.c_utcaid,
         c_szam = excluded.c_szam,
         c_tombhaz = excluded.c_tombhaz,
         c_lepcsohaz = excluded.c_lepcsohaz,
         c_ajto = excluded.c_ajto,
         c_emelet = excluded.c_emelet,
         id_csoport = excluded.id_csoport,
         isaktiv = excluded.isaktiv,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         synced_at = datetime('now')`,
      [
        row.id,
        row.id_ferfi,
        row.id_no,
        row.c_utcaid,
        row.c_szam ?? '',
        row.c_tombhaz,
        row.c_lepcsohaz,
        row.c_ajto,
        row.c_emelet,
        row.id_csoport,
        row.isaktiv ? 1 : 0,
        row.revision,
        row.updated_at,
      ],
    )
  }

  // 5. last_pull frissítése — a legnagyobb updated_at-re
  let newestIso = lastPull ?? new Date(0).toISOString()
  for (const row of rows) {
    if (row.updated_at > newestIso) newestIso = row.updated_at
  }
  await setSetting(lastPullKey, newestIso)

  return { pulledRows: rows.length, mode: effectiveMode, lastPullIso: newestIso }
}

/**
 * Gyülekezet gyerek-junction sorainak pull-ja a Supabase-ből a
 * `gyerek_local` cache-be. Párhuzamos a `pullFamiliesOfOwnCongregation`-nal;
 * a két pull-t általában együtt kell futtatni (családlista + gyerekek-
 * számláló).
 */
export async function pullGyerekOfOwnCongregation(
  userId: string,
  mode: 'delta' | 'full' = 'delta',
): Promise<{
  pulledRows: number
  mode: 'delta' | 'full' | 'full-initial' | 'no-congregation'
  lastPullIso: string
}> {
  const supabase = getDesktopSupabase()

  let congregationId: string | null = null
  const localProfile = await getLocalOwnProfile(userId)
  if (localProfile?.congregation_id) {
    congregationId = localProfile.congregation_id
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('congregation_id')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) {
      throw new Error(`Supabase profile-lookup hiba: ${profileError.message}`)
    }
    congregationId = profile?.congregation_id ?? null
  }

  if (!congregationId) {
    const now = new Date().toISOString()
    return { pulledRows: 0, mode: 'no-congregation', lastPullIso: now }
  }

  const lastPullKey = gyerekLastPullKey(congregationId)
  const lastPull = mode === 'delta' ? await getSetting(lastPullKey) : null
  const effectiveMode: 'delta' | 'full' | 'full-initial' =
    mode === 'full' ? 'full' : lastPull ? 'delta' : 'full-initial'

  const { data, error } = await supabase.rpc('get_gyerek_for_congregation', {
    target_congregation_id: congregationId,
    updated_since: effectiveMode === 'delta' && lastPull ? lastPull : null,
  })
  if (error) {
    throw new Error(`Supabase pullGyerek hiba: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as GyerekSupabaseRow[]

  for (const row of rows) {
    await dbExecute(
      `INSERT INTO gyerek_local
         (id, id_csalad, id_szemely, revision, updated_at, synced_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         id_csalad = excluded.id_csalad,
         id_szemely = excluded.id_szemely,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         synced_at = datetime('now')`,
      [row.id, row.id_csalad, row.id_szemely, row.revision, row.updated_at],
    )
  }

  let newestIso = lastPull ?? new Date(0).toISOString()
  for (const row of rows) {
    if (row.updated_at > newestIso) newestIso = row.updated_at
  }
  await setSetting(lastPullKey, newestIso)

  return { pulledRows: rows.length, mode: effectiveMode, lastPullIso: newestIso }
}

// ─────────────────────────────────────────────────────────────────────────
// M8.1 — Új tag INSERT (online + offline)
// ─────────────────────────────────────────────────────────────────────────

export interface SzemelyCreateResult {
  /** A szerver-oldali szemely.id (online-insert) vagy null (offline-pending). */
  serverId: number | null
  /** A `szemely_pending_local.id` (`local-<uuid>`) — akár online, akár offline */
  localId: string
  /** True, ha a szerver-insert megtörtént és a lokál már cache-elve van. */
  synced: boolean
  /** True, ha pending-be került (offline, vagy hiba). */
  pending: boolean
  /** Ha CNP dupláció-ütközés — a user gondolkodjon újra. */
  duplicateCnp: boolean
  /** Hibaszöveg, ha volt. */
  error?: string
}

/**
 * Új tag (`szemely`) hozzáadása — M8.1 új-tag wave.
 *
 * Flow:
 *   1. Kliens-oldali CNP-dupláció-check (`szemely_local` + `szemely_pending_local`).
 *      Ha van találat → `duplicateCnp: true` visszatérés, nem teszünk semmit.
 *   2. Lokál UUID generálás: `local-<uuid>`.
 *   3. INSERT `szemely_pending_local` (pending state).
 *   4. Ha online: supabase.from('szemely').insert(payload).select('id'):
 *      - 23505 (unique CNP) → conflict markolás + `duplicateCnp: true`
 *      - egyéb hiba → pending marad, sync.ts folyamatos próbálja
 *      - siker → markSynced(localId, serverId) + pullMembers delta
 *   5. Ha offline: a pending marad, a `szemely-write-sync.ts` fogja feltölteni.
 *
 * Nem használunk `enqueueOutbox`-ot — a `szemely_pending_local` önmagában
 * a queue (a `pushPendingSzemely` a `listLocalPendingSzemely`-ből dolgozik).
 * A `szemely-write-sync.ts` minta a `befizetes-write-sync.ts`-sel analog.
 */
export async function createSzemelyEntry(
  userId: string,
  input: Record<string, unknown>,
): Promise<SzemelyCreateResult> {
  const backend = (await import('./tauri-sqlite-backend')).getTauriSqliteBackend()

  const congregationId = input.congregation_id as string
  const cnp = String(input.cnp ?? '').trim()

  // 1. Kliens-oldali dupláció-check
  if (congregationId && cnp) {
    const dup = await backend.findSzemelyByCnp(congregationId, cnp)
    if (dup) {
      return {
        serverId: null,
        localId: '',
        synced: false,
        pending: false,
        duplicateCnp: true,
        error: `A CNP (${cnp}) már létezik: ${dup.csaladnev ?? ''} ${dup.k_nev ?? ''}`.trim(),
      }
    }
  }

  // 2. Lokál UUID + pending insert
  const localId = `local-${generateUuid()}`

  await backend.insertLocalSzemely({
    id: localId,
    congregation_id: congregationId,
    cnp,
    szcs_nev: (input.szcs_nev as string | null) ?? null,
    k_nev: (input.k_nev as string | null) ?? null,
    csaladnev: (input.csaladnev as string | null) ?? null,
    ferjk_nev: (input.ferjk_nev as string | null) ?? null,
    allapot: (input.allapot as string | null) ?? null,
    sz_datum: (input.sz_datum as string | null) ?? null,
    ferfi: Boolean(input.ferfi),
    csaladfo: Boolean(input.csaladfo ?? false),
    meghalt: Boolean(input.meghalt ?? false),
    member_status: (input.member_status as string | null) ?? 'aktív',
    apjaneve: (input.apjaneve as string | null) ?? null,
    anyjaneve: (input.anyjaneve as string | null) ?? null,
    id_apja: (input.id_apja as string | null) ?? null,
    id_anyja: (input.id_anyja as string | null) ?? null,
    c_szam: (input.c_szam as string | null) ?? null,
    c_tombhaz: (input.c_tombhaz as string | null) ?? null,
    c_lepcsohaz: (input.c_lepcsohaz as string | null) ?? null,
    c_ajto: (input.c_ajto as string | null) ?? null,
    c_emelet: (input.c_emelet as string | null) ?? null,
    c_szcim: (input.c_szcim as string | null) ?? null,
    telefon: (input.telefon as string | null) ?? null,
    email: (input.email as string | null) ?? null,
    vallas: (input.vallas as string | null) ?? null,
    foglalkozas: (input.foglalkozas as string | null) ?? null,
    nemzetiseg: (input.nemzetiseg as string | null) ?? null,
    voter_eligible: Boolean(input.voter_eligible ?? false),
    family_id: (input.family_id as string | null) ?? null,
    type: (input.type as string | null) ?? 'normal',
    isvisible: Boolean(input.isvisible ?? true),
    megjegyzes: (input.megjegyzes as string | null) ?? null,
    userid: userId,
  })

  // 3. Online-kísérlet
  if (await isOnline()) {
    try {
      const supabase = getDesktopSupabase()
      const payload = buildServerInsertPayload(input)
      const { data, error } = await supabase
        .from('szemely')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (error) {
        if (error.code === '23505') {
          // Szerver-oldali CNP-ütközés — a lokális sort conflict-ra állítjuk
          await backend.markSzemelyConflict(
            localId,
            `A CNP (${cnp}) a szerveren már foglalt. Valaki más mentette rá ugyanezt. ` +
              `Nyisd meg a pending-listát és oldd fel kézzel.`,
          )
          return {
            serverId: null,
            localId,
            synced: false,
            pending: true,
            duplicateCnp: true,
            error: error.message,
          }
        }
        // Egyéb hiba: pending marad, a background-sync próbálkozni fog
        return {
          serverId: null,
          localId,
          synced: false,
          pending: true,
          duplicateCnp: false,
          error: error.message,
        }
      }

      if (!data?.id) {
        return {
          serverId: null,
          localId,
          synced: false,
          pending: true,
          duplicateCnp: false,
          error: 'Szerver nem adott ID-t az insert után',
        }
      }

      // Sikeres online-insert → pending-sort sync-eltnek jelöljük + pull delta
      const serverId = Number(data.id)
      await backend.markSzemelySynced(localId, serverId)
      try {
        await pullMembersOfOwnCongregation(userId, 'delta')
      } catch {
        /* csendes — a sor már a szerveren, a pull majd legközelebb */
      }
      return {
        serverId,
        localId,
        synced: true,
        pending: false,
        duplicateCnp: false,
      }
    } catch (err: unknown) {
      // Hálózati hiba: pending marad
      return {
        serverId: null,
        localId,
        synced: false,
        pending: true,
        duplicateCnp: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // 4. Offline: pending marad
  return {
    serverId: null,
    localId,
    synced: false,
    pending: true,
    duplicateCnp: false,
  }
}

function buildServerInsertPayload(input: Record<string, unknown>): Record<string, unknown> {
  // A pending-payload közvetlenül mehet INSERT-be; a szerver-szükségleti
  // mezők (`c_utcaid`, `befizetoev`) NOT NULL, így ha a zod-séma nem adott
  // értéket, defaultot adunk.
  const payload: Record<string, unknown> = { ...input }

  // A szemely tábla NOT NULL oszlopai közül 2 olyan, amit a kliens nem
  // feltétlenül tud megadni:
  //   - c_utcaid (integer FK adrstreet-re) — V1-ben a szöveges címet
  //     használjuk, az FK-t null-ról NOT NULL-ra ösztönzik → -1 dummy
  //   - befizetoev (integer) — default az aktuális év
  if (payload.c_utcaid === undefined || payload.c_utcaid === null) {
    payload.c_utcaid = -1 // ideiglenes dummy; a cím-FK normalizálás külön flow
  }
  if (payload.befizetoev === undefined || payload.befizetoev === null) {
    payload.befizetoev = new Date().getFullYear()
  }
  return payload
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: 128-bit random hex (nem valódi UUID-v4, de unique-nek elegendő a client-oldalon)
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined') crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
