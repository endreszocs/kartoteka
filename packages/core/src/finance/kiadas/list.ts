/**
 * listExpenseUseCase — A-M7.4a (2026-04-24).
 *
 * A `kiadas` tábla listázása, PostgREST-join-nal a `kiadascel`, `szemely`
 * (atvevoid), `bankszamlak` táblákra. A befizetés-minta tükörképe.
 *
 * Online-only; az offline-cache (A-M7.4d) később a befizetés-offline után jön.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  kiadasListRowSchema,
  listExpenseInputSchema,
  type KiadasListRow,
  type ListExpenseInput,
} from '@kartoteka/validations'


/**
 * 2026-07-25 (F6.1): LAPOZOTT lekérés a kért `limit`-ig. A PostgREST szerver-
 * oldali „Max Rows" plafonja (tipikusan 1000) a kliens `.limit()`-jét felülírja
 * és NÉMÁN levág — a listák fejléc-összesítője emiatt hibás összeget mutatott
 * volna. Csak az ÜRES lap a biztos stop (leszállított plafonnál a rövid lap még
 * nem a vége); a `limit` továbbra is felső korlát.
 */
async function fetchRowsPaged<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  limit: number,
  pageSize = 1000,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; out.length < limit; ) {
    const take = Math.min(pageSize, limit - out.length)
    const { data, error } = await query.range(from, from + take - 1)
    if (error) return { data: null, error }
    const page = (data ?? []) as T[]
    out.push(...page)
    if (page.length === 0) break
    from += page.length
  }
  return { data: out.slice(0, limit), error: null }
}

export interface ListExpenseCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type ListExpenseResult =
  | { success: true; rows: KiadasListRow[] }
  | { success: false; error: string }

const SELECT_COLS = `
  id, xkey, datum, osszeg, osszeg_ron, arfolyam,
  iratszam, irattipus, nyugta, is_potlas, id_kiadascel, bankszamla_id,
  atvevoid, atvevo, kedvezmenyezett_cui, vonatkozo_idoszak,
  megjegyzes, deleted, stornozott, stornozott_indok, stornozott_at,
  userid, congregation_id, revision, updated_at, created,
  kiadascel:kiadascel!kiadas_id_kiadascel_fk ( nev ),
  atvevo_szemely:szemely!kiadas_atvevoid_fk ( csaladnev, k_nev, ferjk_nev ),
  bankszamlak:bankszamlak!kiadas_bankszamla_id_fkey ( bank_neve )
`

function normalizeRow(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const r = raw as Record<string, unknown>

  const kc = r.kiadascel as { nev?: string } | null | undefined
  const kiadascel_nev = kc?.nev ?? null

  const sz = r.atvevo_szemely as
    | { csaladnev?: string | null; k_nev?: string | null; ferjk_nev?: string | null }
    | null
    | undefined
  let atvevo_nev: string | null = null
  if (sz) {
    const parts: string[] = []
    if (sz.ferjk_nev && sz.ferjk_nev.trim().length > 0) {
      parts.push(sz.ferjk_nev)
    } else if (sz.csaladnev && sz.csaladnev.trim().length > 0) {
      parts.push(sz.csaladnev)
    }
    if (sz.k_nev && sz.k_nev.trim().length > 0) {
      parts.push(sz.k_nev)
    }
    if (parts.length > 0) atvevo_nev = parts.join(' ')
  }

  // Bankszamlak.bank_neve → bankszamla_nev (a DB oszlop `bank_neve`, nem `nev`)
  const bs = r.bankszamlak as { bank_neve?: string } | null | undefined
  const bankszamla_nev = bs?.bank_neve ?? null

  const { kiadascel, atvevo_szemely, bankszamlak, ...flat } = r
  void kiadascel
  void atvevo_szemely
  void bankszamlak

  return {
    ...flat,
    kiadascel_nev,
    atvevo_nev,
    bankszamla_nev,
  }
}

export async function listExpenseUseCase(
  input: ListExpenseInput,
  ctx: ListExpenseCtx,
): Promise<ListExpenseResult> {
  const parsed = listExpenseInputSchema.safeParse(input)
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
      .from('kiadas')
      .select(SELECT_COLS)
      .eq('congregation_id', clean.congregationId)

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
        .lte('datum', `${clean.year}-12-31T23:59:59`)
    }

    if (clean.atvevoId) {
      query = query.eq('atvevoid', clean.atvevoId)
    }
    if (clean.kiadasceId) {
      query = query.eq('id_kiadascel', clean.kiadasceId)
    }

    if (!clean.includeDeleted) {
      query = query.eq('deleted', false)
    }
    if (clean.includeStornozott === false) {
      query = query.eq('stornozott', false)
    }

    const { data, error } = await fetchRowsPaged<Record<string, unknown>>(query, limit)
    if (error) {
      return { success: false, error: `Lista-hiba: ${error.message}` }
    }

    const rows: KiadasListRow[] = []
    for (const raw of data || []) {
      const normalized = normalizeRow(raw)
      const r = kiadasListRowSchema.safeParse(normalized)
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
