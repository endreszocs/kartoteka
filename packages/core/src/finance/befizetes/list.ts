/**
 * listIncomeUseCase — A-M7.3a (2026-04-24).
 *
 * A gyülekezet befizetéseinek (`befizetes` tábla) listázása. Online-only
 * első körben — az offline-cache-elés a későbbi A-M7.3d alfázisban jön
 * (külön `befizetes_local` SQLCipher mirror + pull-szink).
 *
 * A foreign key-join-ok (`szemely_nev`, `befizetescel_nev`, `bankszamla_nev`)
 * a Supabase PostgREST-join szintaxisával jönnek egy single-query-ben, hogy
 * a lista-render ne kelljen több hívás. Ez a chitanta-list minta kiterjesztése.
 *
 * Szűrők:
 *   - évre (fizetettev vagy datum alapján)
 *   - tagra (szemelyId) vagy családra (csaladId) — kölcsönösen kizárólagos
 *   - befizetés-célra (kategória)
 *   - deleted / stornozott toggle-ökkel
 *
 * Rendezés:
 *   - 'datum-desc' (default, friss először)
 *   - 'datum-asc'
 *   - 'osszeg-desc' (nagyobb összegek először)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  befizetesListRowSchema,
  listIncomeInputSchema,
  type BefizetesListRow,
  type ListIncomeInput,
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

export interface ListIncomeCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type ListIncomeResult =
  | {
      success: true
      rows: BefizetesListRow[]
    }
  | {
      success: false
      error: string
    }

/**
 * PostgREST-join: a `befizetes`-hez kapcsolt `szemely`, `befizetescel`
 * és `bankszamlak` táblák nevezett mezői. Az alias-szintaxis (pl.
 * `szemely:szemely!befizetes_id_szemely_fk(...)`) a Supabase által
 * generált típus nevével illeszkedik.
 *
 * Ha a join-oszlopok elnevezése eltér a DB-ben (pl. schema-drift), a zod-
 * parse csendben kihagyja a sort, nem hibázik el a teljes lista.
 */
const SELECT_COLS = `
  id, xkey, datum, fizetettev, osszeg, osszeg_ron, arfolyam,
  forrasa, iratszam, irattipus, nyugta, is_potlas, csalad,
  id_csalad, id_szemely, id_befizetescel, bankszamla_id,
  megjegyzes, deleted, stornozott, stornozott_indok, stornozott_at,
  userid, congregation_id, revision, updated_at, created,
  befizetescel:befizetescel!befizetes_id_befizetescel_fk ( nev ),
  szemely:szemely!befizetes_id_szemely_fk ( csaladnev, k_nev, ferjk_nev ),
  bankszamlak:bankszamlak!befizetes_bankszamla_id_fkey ( bank_neve )
`

/**
 * Normalizálja a Supabase join-választ (nested objects) a flat
 * `BefizetesListRow` shape-re.
 */
function normalizeRow(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const r = raw as Record<string, unknown>

  // Befizetescel.nev → befizetescel_nev
  const bc = r.befizetescel as { nev?: string } | null | undefined
  const befizetescel_nev = bc?.nev ?? null

  // Szemely.{csaladnev, k_nev, ferjk_nev} → teljes név string
  const sz = r.szemely as
    | { csaladnev?: string | null; k_nev?: string | null; ferjk_nev?: string | null }
    | null
    | undefined
  let szemely_nev: string | null = null
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
    if (parts.length > 0) szemely_nev = parts.join(' ')
  }

  // Bankszamlak.bank_neve → bankszamla_nev (a DB oszlop `bank_neve`, nem `nev`)
  const bs = r.bankszamlak as { bank_neve?: string } | null | undefined
  const bankszamla_nev = bs?.bank_neve ?? null

  // Explicit törlés a nested field-ekről, hogy a zod strict parse ne
  // szúrja vissza (a zod-séma object-ben csak a flat mezők vannak)
  const { befizetescel, szemely, bankszamlak, ...flat } = r
  void befizetescel
  void szemely
  void bankszamlak

  return {
    ...flat,
    befizetescel_nev,
    szemely_nev,
    bankszamla_nev,
  }
}

export async function listIncomeUseCase(
  input: ListIncomeInput,
  ctx: ListIncomeCtx,
): Promise<ListIncomeResult> {
  const parsed = listIncomeInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen szűrő.',
    }
  }
  const clean = parsed.data

  // Input-konzisztencia: szemelyId és csaladId kölcsönösen kizárólagos
  if (clean.szemelyId && clean.csaladId) {
    return {
      success: false,
      error: 'Egyszerre csak tag VAGY család szerint lehet szűrni, nem mindkettő.',
    }
  }

  const orderBy = clean.orderBy ?? 'datum-desc'
  const limit = clean.limit ?? 500
  const yearField = clean.yearField ?? 'fizetettev'

  try {
    let query = ctx.supabase
      .from('befizetes')
      .select(SELECT_COLS)
      .eq('congregation_id', clean.congregationId)

    // Sorrend
    if (orderBy === 'datum-desc') {
      query = query.order('datum', { ascending: false }).order('id', { ascending: false })
    } else if (orderBy === 'datum-asc') {
      query = query.order('datum', { ascending: true }).order('id', { ascending: true })
    } else if (orderBy === 'osszeg-desc') {
      query = query.order('osszeg', { ascending: false })
    }

    // Év-szűrő
    if (clean.year !== undefined) {
      if (yearField === 'fizetettev') {
        query = query.eq('fizetettev', clean.year)
      } else {
        query = query
          .gte('datum', `${clean.year}-01-01`)
          .lte('datum', `${clean.year}-12-31`)
      }
    }

    // Tag / család szűrő
    if (clean.szemelyId) {
      query = query.eq('id_szemely', clean.szemelyId).eq('csalad', false)
    } else if (clean.csaladId) {
      query = query.eq('id_csalad', clean.csaladId).eq('csalad', true)
    }

    // Cél-szűrő
    if (clean.befizetescelId) {
      query = query.eq('id_befizetescel', clean.befizetescelId)
    }

    // Deleted / stornozott toggle-ök
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

    const rows: BefizetesListRow[] = []
    for (const raw of data || []) {
      const normalized = normalizeRow(raw)
      const r = befizetesListRowSchema.safeParse(normalized)
      if (r.success) {
        rows.push(r.data)
      }
      // drift-sorok csendben kihagyva (pl. a DB séma új oszloppal bővült)
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
