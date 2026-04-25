/**
 * searchMembersForFinanceUseCase — A-M7.3b (2026-04-24).
 *
 * Tag-kereső a befizetés-form autocomplete mezőjéhez. A gyülekezeti
 * `szemely` táblából keres:
 *   - Diakritika-normalizálás (á → a, é → e, …)
 *   - Egyetlen kulcsszó → OR (csaladnev VAGY k_nev)
 *   - Több kulcsszó → csaladnev + k_nev (space-separált)
 *   - Csak élő (`meghalt=false`) és látható (`isvisible=true`) tagok
 *   - Max 8 találat (konfigurálható 1–20)
 *
 * A web-oldali `searchMembersForFinance` portja a core-ba. A különbség
 * az explicit `congregationId` átadás (nem implicit profile-ből) és a
 * `Result`-forma egységesség.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  searchMembersForFinanceInputSchema,
  type SearchMembersForFinanceInput,
  type MemberSearchResult,
} from '@kartoteka/validations'

export interface SearchMembersCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type SearchMembersResult =
  | { success: true; members: MemberSearchResult[] }
  | { success: false; error: string }

export async function searchMembersForFinanceUseCase(
  input: SearchMembersForFinanceInput,
  ctx: SearchMembersCtx,
): Promise<SearchMembersResult> {
  const parsed = searchMembersForFinanceInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen keresési input.',
    }
  }
  const { congregationId, query, limit } = parsed.data

  // Diakritika-normalizálás — 'Kovács' és 'Kovacs' egyformán található
  const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const parts = normalized.trim().split(/\s+/)

  try {
    let q = ctx.supabase
      .from('szemely')
      .select(
        'id, csaladnev, k_nev, sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)',
      )
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false)

    if (parts.length === 1) {
      q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
    } else {
      q = q
        .ilike('csaladnev', `%${parts[0]}%`)
        .ilike('k_nev', `%${parts.slice(1).join(' ')}%`)
    }

    const { data, error } = await q.limit(limit ?? 8)
    if (error) {
      return { success: false, error: `Keresési hiba: ${error.message}` }
    }

    // Normalizálás a `MemberSearchResult` flat shape-re
    const members: MemberSearchResult[] = (data || []).map((raw: unknown) => {
      const r = raw as {
        id: number
        csaladnev: string | null
        k_nev: string | null
        sz_datum: string | null
        c_szam: string | null
        adrlocality: { name?: string } | null
        adrstreet: { name?: string } | null
      }

      // Cím összerakás: "Falva · Fő utca 12"
      const cityName = r.adrlocality?.name ?? null
      const streetName = r.adrstreet?.name ?? null
      const szam = r.c_szam ?? null
      let cim_nev: string | null = null
      if (cityName || streetName || szam) {
        const streetPart = [streetName, szam].filter(Boolean).join(' ')
        cim_nev = [cityName, streetPart].filter((s) => s && s.length > 0).join(' · ')
        if (cim_nev.length === 0) cim_nev = null
      }

      return {
        id: r.id,
        csaladnev: r.csaladnev,
        k_nev: r.k_nev,
        sz_datum: r.sz_datum,
        cim_nev,
      }
    })

    return { success: true, members }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Keresési hiba (valószínűleg nincs internet): ${msg}`,
    }
  }
}
