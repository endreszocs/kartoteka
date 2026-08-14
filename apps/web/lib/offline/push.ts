/**
 * Push sync — Dexie mutation queue → Supabase.
 *
 * Minden mutation egyenként fut a queue-ból (FIFO, per-tábla szekvenciális),
 * optimistic locking (revision) + 409 konfliktus detektálás.
 *
 * Flow:
 *  1. `getNextBatch()` lekéri a feldolgozásra kész mutation-öket
 *  2. `processMutation()` feldolgoz egyet:
 *     - insert: supabase.insert → markSuccess + Dexie frissítés
 *     - update: supabase.update WHERE id=? AND revision=baseRevision
 *        → ha 0 sor: 409 Conflict → markConflict
 *        → egyébként: markSuccess
 *     - delete: supabase.update deleted=true (soft delete minta)
 *  3. Siker → queue-ból törlés, Dexie rekord frissítése szerver-válasszal
 *  4. Hiba → markFailed (backoff retry)
 *  5. 409 → markConflict (user dialog)
 */

import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { getDb, type MutationEnvelope } from './db'
import {
  getNextBatch,
  markConflict,
  markFailed,
  markSuccess,
  markSyncing,
} from './mutation-queue'
import { getTableEntry } from './table-registry'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface PushResult {
  mutationId: string
  success: boolean
  conflict?: boolean
  error?: string
  /**
   * TELJESÍTMÉNY-FIX 2026-08-11 (#16): a szerver által visszaadott sor.
   *
   * Ami rossz volt: az insert/update már `.select()`-tel futott, tehát a friss
   * sor (új id, új revision, updated_at) ott volt a válaszban — de eldobtuk,
   * és a `pushBatch` egy MÁSODIK lekérdezéssel (`fetchServerRow`) kérte le
   * ugyanazt a sort. 20 offline szerkesztés így 40 egymás utáni kör-utat
   * jelentett, dupla annyi ideig pörgött a szinkron-jelző. Ráadásul ha az id-t
   * az adatbázis generálta, a `fetchServerRow` `null`-t adott vissza, tehát a
   * kör-út tiszta pazarlás volt, és a Dexie-sor a szerver-oldali id nélkül
   * maradt.
   *
   * Miért jó így: a már meglévő választ adjuk tovább, a `fetchServerRow` csak
   * tartalék marad arra az esetre, ha a válasz üres (pl. RLS miatt a RETURNING
   * nem ad vissza sort).
   */
  serverRow?: Record<string, unknown>
}

export interface PushBatchResult {
  processed: number
  successful: number
  conflicts: number
  failed: number
  dead: number
}

// ─────────────────────────────────────────────────────────────────
// Egyetlen mutation feldolgozása
// ─────────────────────────────────────────────────────────────────

/**
 * Egy mutation push-olása Supabase-re.
 *
 * Visszaadja, hogy sikeres volt-e, vagy konfliktus történt, vagy hiba.
 * NEM dob exception-t — a hibákat a visszatérési értékben adja vissza.
 */
export async function processMutation(
  envelope: MutationEnvelope,
): Promise<PushResult> {
  const supabase = createBrowserSupabase()
  const entry = getTableEntry(envelope.table)

  if (!entry) {
    return {
      mutationId: envelope.id,
      success: false,
      error: `Ismeretlen tábla a registry-ben: ${envelope.table}`,
    }
  }

  try {
    switch (envelope.op) {
      case 'insert':
        return await processInsert(supabase, envelope, entry.supabaseTable)
      case 'update':
        return await processUpdate(supabase, envelope, entry.supabaseTable)
      case 'delete':
        return await processDelete(
          supabase,
          envelope,
          entry.supabaseTable,
          entry.softDelete,
          entry.softDeleteColumn ?? 'deleted',
        )
    }
  } catch (e) {
    return {
      mutationId: envelope.id,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// INSERT
// ─────────────────────────────────────────────────────────────────

async function processInsert(
  supabase: ReturnType<typeof createBrowserSupabase>,
  envelope: MutationEnvelope,
  supabaseTable: string,
): Promise<PushResult> {
  // Strip: a `_` prefixes és a client-only mezők ne menjenek fel
  const payload = stripClientFields(envelope.payload)

  const { data, error } = await supabase
    .from(supabaseTable)
    .insert(payload)
    .select()
    .single()

  if (error) {
    return { mutationId: envelope.id, success: false, error: error.message }
  }

  // 2026-08-11 (#16): a beszúrt sort MÁR megkaptuk — továbbadjuk, hogy a
  // pushBatch ne kérje le még egyszer. Így az adatbázis által generált id is
  // visszakerül a Dexie-rekordra.
  return {
    mutationId: envelope.id,
    success: true,
    ...(data ? { serverRow: data as Record<string, unknown> } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────
// UPDATE — optimistic locking
// ─────────────────────────────────────────────────────────────────

async function processUpdate(
  supabase: ReturnType<typeof createBrowserSupabase>,
  envelope: MutationEnvelope,
  supabaseTable: string,
): Promise<PushResult> {
  const payload = stripClientFields(envelope.payload)
  const rowId = payload.id

  if (rowId === undefined || rowId === null) {
    return {
      mutationId: envelope.id,
      success: false,
      error: 'Update-hoz nincs id a payload-ban',
    }
  }

  // Remove id from update payload (can't update primary key)
  delete payload.id
  // Revision-t sem küldjük, a trigger majd bumpol
  delete payload.revision
  delete payload.updated_at

  // Optimistic lock: csak akkor írunk, ha a revision még egyezik
  let query = supabase.from(supabaseTable).update(payload).eq('id', rowId)
  if (envelope.baseRevision !== null) {
    query = query.eq('revision', envelope.baseRevision)
  }

  const { data, error } = await query.select()

  if (error) {
    return { mutationId: envelope.id, success: false, error: error.message }
  }

  // Ha 0 sor érintett → 409 Conflict (baseRevision elavult)
  if (!data || data.length === 0) {
    // Lekérjük a szerver jelenlegi állapotát, hogy a dialog meg tudja jeleníteni
    const { data: current } = await supabase
      .from(supabaseTable)
      .select('*')
      .eq('id', rowId)
      .maybeSingle()

    return {
      mutationId: envelope.id,
      success: false,
      conflict: true,
      error: 'Optimistic lock miatt konfliktus',
      // A hívó majd markConflict-tel írja be a _conflicts-ba
      // A `current` server-rekord a PushResult-on keresztül jön vissza
      ...(current ? { serverPayload: current } : {}),
    } as PushResult & { serverPayload?: Record<string, unknown> }
  }

  // 2026-08-11 (#16): a frissített sor már itt van — nem kérjük le újra.
  return {
    mutationId: envelope.id,
    success: true,
    ...(data[0] ? { serverRow: data[0] as Record<string, unknown> } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE (soft-delete preferred)
// ─────────────────────────────────────────────────────────────────

async function processDelete(
  supabase: ReturnType<typeof createBrowserSupabase>,
  envelope: MutationEnvelope,
  supabaseTable: string,
  softDelete: boolean,
  softDeleteColumn: string,
): Promise<PushResult> {
  const rowId = envelope.payload.id

  if (rowId === undefined || rowId === null) {
    return {
      mutationId: envelope.id,
      success: false,
      error: 'Delete-hoz nincs id a payload-ban',
    }
  }

  // 2026-08-14 (6. pont, BLOKKOLÓ-javítás): a Kuka „Végleges törlés" gombja
  // `_hardDelete: true` jelzőt tesz a payload-ba. Korábban ennek NEM volt
  // feldolgozó ága: soft-delete táblán a „végleges" törlés is csak újra
  // soft-deletelt, így a szerveren megmaradt sort a KÖVETKEZŐ szinkron
  // visszahozta a Dexie-be — a felhasználó szemével a törölt rekord
  // „visszajött". A jelző mostantól KÉNYSZERÍTI a valódi DELETE-et.
  // (Ha az adott táblán nincs RLS DELETE-policy, a hívás hangos hibával
  // bukik — fail-closed, a felület hibaüzenetet mutat, nem hazudik sikert.)
  const hardRequested = envelope.payload._hardDelete === true

  if (softDelete && !hardRequested) {
    // Soft delete: UPDATE <jelző-oszlop> = true. Az oszlop neve táblánként
    // eltérhet (leltar_tetelek: `is_deleted`) — a registry mondja meg.
    let query = supabase
      .from(supabaseTable)
      .update({ [softDeleteColumn]: true })
      .eq('id', rowId)

    if (envelope.baseRevision !== null) {
      query = query.eq('revision', envelope.baseRevision)
    }

    const { data, error } = await query.select()

    if (error) {
      return { mutationId: envelope.id, success: false, error: error.message }
    }

    if (!data || data.length === 0) {
      return {
        mutationId: envelope.id,
        success: false,
        conflict: true,
        error: 'Optimistic lock miatt konfliktus (delete)',
      }
    }

    return { mutationId: envelope.id, success: true }
  } else {
    // Hard delete: DELETE FROM
    const { error } = await supabase
      .from(supabaseTable)
      .delete()
      .eq('id', rowId)

    if (error) {
      return { mutationId: envelope.id, success: false, error: error.message }
    }

    return { mutationId: envelope.id, success: true }
  }
}

// ─────────────────────────────────────────────────────────────────
// Batch feldolgozás (orchestrator hívja)
// ─────────────────────────────────────────────────────────────────

/**
 * Feldolgozza a queue-ban lévő mutation-ök egy batch-jét.
 * Szekvenciálisan (egyszerre 1), hogy az FK-dependencies megmaradjanak
 * (pl. szemely insert előbb, mint a hozzá tartozó befizetes).
 */
export async function pushBatch(batchSize = 10): Promise<PushBatchResult> {
  const result: PushBatchResult = {
    processed: 0,
    successful: 0,
    conflicts: 0,
    failed: 0,
    dead: 0,
  }

  const batch = await getNextBatch(batchSize)
  if (batch.length === 0) return result

  for (const envelope of batch) {
    result.processed += 1

    // Lock
    await markSyncing(envelope.id)

    // Push
    const pushResult = await processMutation(envelope)

    if (pushResult.success) {
      result.successful += 1
      // 2026-08-11 (#16): elsődlegesen az insert/update `.select()` válaszát
      // használjuk — csak ha az üres (és nem törlésről van szó, mert a
      // markSuccess a delete-nél úgyis eldobja), esünk vissza a külön
      // lekérdezésre. Így megfeleződik a kör-utak száma.
      const serverData =
        pushResult.serverRow
        ?? (envelope.op === 'delete' ? null : await fetchServerRow(envelope))
      await markSuccess(envelope.id, serverData ?? undefined)
    } else if (pushResult.conflict) {
      result.conflicts += 1
      const serverPayload =
        (pushResult as PushResult & { serverPayload?: Record<string, unknown> })
          .serverPayload || envelope.payload
      await markConflict(envelope.id, serverPayload)
    } else {
      result.failed += 1
      await markFailed(envelope.id, pushResult.error || 'Ismeretlen hiba')
      // Ha a retry limit elértük → dead
      const db = getDb()
      const updated = await db._mutation_queue.get(envelope.id)
      if (updated?.status === 'dead') {
        result.dead += 1
      }
    }
  }

  return result
}

// ─────────────────────────────────────────────────────────────────
// Segéd: szerver-rekord lekérése success után — CSAK TARTALÉK
//
// 2026-08-11 (#16): normál esetben az insert/update `.select()` válasza már
// tartalmazza a sort (`PushResult.serverRow`), ezért ez a függvény csak akkor
// fut le, ha a válasz üres volt.
// ─────────────────────────────────────────────────────────────────

async function fetchServerRow(
  envelope: MutationEnvelope,
): Promise<Record<string, unknown> | null> {
  const supabase = createBrowserSupabase()
  const entry = getTableEntry(envelope.table)
  if (!entry) return null

  const rowId = envelope.payload.id
  if (rowId === undefined || rowId === null) return null

  const { data } = await supabase
    .from(entry.supabaseTable)
    .select('*')
    .eq('id', rowId)
    .maybeSingle()

  return (data as Record<string, unknown> | null) || null
}

// ─────────────────────────────────────────────────────────────────
// Segéd: client-only mezők strip-olása insert/update előtt
// ─────────────────────────────────────────────────────────────────

function stripClientFields(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    // Nem megyünk fel: `_` prefixes kliens-oldali meta
    if (key.startsWith('_')) continue
    out[key] = val
  }
  return out
}
