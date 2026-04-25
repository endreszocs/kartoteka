/**
 * listChitantasUseCase — A-M7.2e (2026-04-23).
 *
 * A gyülekezet kiállított chitantáinak (papír-nyugtáinak) listázása az
 * `oblio_szamlak` táblából `tipus='chitanta_papir'` szűréssel.
 *
 * **Online-only** most: az A-M7.2d előtt a chitantáknak nincs lokális
 * SQLCipher mirror táblája (nem volt `chitantak_local` a Rust v1..v9-ben).
 * A use-case tehát `ctx.storage`-ot nem használ — ha Supabase-hiba jön,
 * error-t ad vissza.
 *
 * Az offline-cache-elés az A-M7.2d alfázisban kerül be (szám-wallet + lokális
 * mirror tábla).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  chitantaListRowSchema,
  listChitantasInputSchema,
  type ChitantaListRow,
  type ListChitantasInput,
} from '@kartoteka/validations'

export interface ListChitantasCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type ListChitantasResult =
  | {
      success: true
      rows: ChitantaListRow[]
    }
  | {
      success: false
      error: string
    }

const SELECT_COLS = `
  id, sorozat, szam, szamla_datum, klienesseg_nev, klienesseg_cui, klienesseg_cim,
  osszeg_brut, reprezentand, befizetes_id, stornozott, stornozott_indok,
  megjegyzes, issued_by, created_at
`

export async function listChitantasUseCase(
  input: ListChitantasInput,
  ctx: ListChitantasCtx,
): Promise<ListChitantasResult> {
  const parsed = listChitantasInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen szűrő.',
    }
  }
  const clean = parsed.data

  try {
    let query = ctx.supabase
      .from('oblio_szamlak')
      .select(SELECT_COLS)
      .eq('congregation_id', clean.congregationId)
      .eq('tipus', 'chitanta_papir')
      .order('szamla_datum', { ascending: false })

    if (clean.sorozat) query = query.eq('sorozat', clean.sorozat)
    if (clean.yearFrom) {
      query = query.gte('szamla_datum', `${clean.yearFrom}-01-01`)
    }
    if (clean.yearTo) {
      query = query.lte('szamla_datum', `${clean.yearTo}-12-31`)
    }
    if (clean.includeStornozott === false) {
      query = query.eq('stornozott', false)
    }

    const { data, error } = await query
    if (error) {
      return { success: false, error: `Lista-hiba: ${error.message}` }
    }

    const rows: ChitantaListRow[] = []
    for (const raw of data || []) {
      const r = chitantaListRowSchema.safeParse(raw)
      if (r.success) rows.push(r.data)
      // drift-soragok csendben kihagyva
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
