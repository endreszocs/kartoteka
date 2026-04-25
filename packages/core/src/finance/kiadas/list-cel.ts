/**
 * listKiadasCelekUseCase — A-M7.4a (2026-04-24).
 *
 * A `kiadascel` kategória-tábla listázása. A `listBefizetesCelekUseCase`
 * tükörképe — egy előre definiált lista (~50-80 sor), ami minden gyülekezet
 * számára közös.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  kiadasCelRowSchema,
  listKiadasCelekInputSchema,
  type KiadasCelRow,
  type ListKiadasCelekInput,
} from '@kartoteka/validations'

export interface ListKiadasCelekCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type ListKiadasCelekResult =
  | { success: true; rows: KiadasCelRow[] }
  | { success: false; error: string }

export async function listKiadasCelekUseCase(
  input: ListKiadasCelekInput,
  ctx: ListKiadasCelekCtx,
): Promise<ListKiadasCelekResult> {
  const parsed = listKiadasCelekInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Érvénytelen input.' }
  }
  const onlyActive = parsed.data.onlyActive ?? true

  try {
    let q = ctx.supabase
      .from('kiadascel')
      .select('id, nev, nevro, aktiv, id_szamadasicel, belsotetel, parentid')
      .order('nev')

    if (onlyActive) q = q.eq('aktiv', true)

    const { data, error } = await q
    if (error) {
      return { success: false, error: `Kategória-lekérdezés hiba: ${error.message}` }
    }

    const rows: KiadasCelRow[] = []
    for (const raw of data || []) {
      const r = kiadasCelRowSchema.safeParse(raw)
      if (r.success) rows.push(r.data)
    }
    return { success: true, rows }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Kategória-lekérdezés hiba (valószínűleg nincs internet): ${msg}`,
    }
  }
}
