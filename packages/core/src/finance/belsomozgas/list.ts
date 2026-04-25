/**
 * listInternalTransfersUseCase — A-M7.6a (2026-04-24).
 *
 * A `belsomozgas` tábla listázása. A kassza ↔ bank átvezetések, bank-bank
 * átutalások, valutacsere-események szerepelnek itt.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  belsomozgasListRowSchema,
  listInternalTransfersInputSchema,
  type BelsomozgasListRow,
  type ListInternalTransfersInput,
} from '@kartoteka/validations'

export interface ListInternalTransfersCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type ListInternalTransfersResult =
  | { success: true; rows: BelsomozgasListRow[] }
  | { success: false; error: string }

export async function listInternalTransfersUseCase(
  input: ListInternalTransfersInput,
  ctx: ListInternalTransfersCtx,
): Promise<ListInternalTransfersResult> {
  const parsed = listInternalTransfersInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen szűrő.',
    }
  }
  const clean = parsed.data
  const orderBy = clean.orderBy ?? 'datum-desc'
  const limit = clean.limit ?? 500

  try {
    let query = ctx.supabase
      .from('belsomozgas')
      .select(
        'id, datum, tipus, forras, cel, osszeg, cel_osszeg, arfolyam, megjegyzes, deleted, created_by, created_at, congregation_id, revision, updated_at',
      )
      .eq('congregation_id', clean.congregationId)
      .limit(limit)

    if (orderBy === 'datum-desc') {
      query = query.order('datum', { ascending: false }).order('id', { ascending: false })
    } else if (orderBy === 'datum-asc') {
      query = query.order('datum', { ascending: true }).order('id', { ascending: true })
    } else if (orderBy === 'osszeg-desc') {
      query = query.order('osszeg', { ascending: false })
    }

    if (clean.year !== undefined) {
      query = query
        .gte('datum', `${clean.year}-01-01`)
        .lte('datum', `${clean.year}-12-31`)
    }

    if (clean.tipus) {
      query = query.eq('tipus', clean.tipus)
    }

    if (!clean.includeDeleted) {
      query = query.eq('deleted', false)
    }

    const { data, error } = await query
    if (error) {
      return { success: false, error: `Lista-hiba: ${error.message}` }
    }

    const rows: BelsomozgasListRow[] = []
    for (const raw of data || []) {
      const r = belsomozgasListRowSchema.safeParse(raw)
      if (r.success) rows.push(r.data)
    }
    return { success: true, rows }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Lista-hiba (valószínűleg nincs internet): ${msg}`,
    }
  }
}
