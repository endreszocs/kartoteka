/**
 * listBefizetesCelekUseCase — A-M7.3d1 (2026-04-24).
 *
 * A `befizetescel` kategória-táblát listázza. Egy előre definiált kb. 50
 * soros lista (járulék, persely, adomány, stb.) — minden gyülekezet
 * ugyanazt használja, nem congregation-scope.
 *
 * A befizetés-form dropdown-jához kell. Nem gyakran változik, érdemes
 * kliens-oldalon cache-elni (a hívók felelőssége).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  befizetesCelRowSchema,
  listBefizetesCelekInputSchema,
  type BefizetesCelRow,
  type ListBefizetesCelekInput,
} from '@kartoteka/validations'

export interface ListBefizetesCelekCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type ListBefizetesCelekResult =
  | { success: true; rows: BefizetesCelRow[] }
  | { success: false; error: string }

export async function listBefizetesCelekUseCase(
  input: ListBefizetesCelekInput,
  ctx: ListBefizetesCelekCtx,
): Promise<ListBefizetesCelekResult> {
  const parsed = listBefizetesCelekInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Érvénytelen input.' }
  }
  const onlyActive = parsed.data.onlyActive ?? true

  try {
    let q = ctx.supabase
      .from('befizetescel')
      .select('id, nev, nevro, aktiv, id_szamadasicel, belsotetel, parentid')
      .order('nev')

    if (onlyActive) q = q.eq('aktiv', true)

    const { data, error } = await q
    if (error) {
      return { success: false, error: `Kategória-lekérdezés hiba: ${error.message}` }
    }

    const rows: BefizetesCelRow[] = []
    for (const raw of data || []) {
      const r = befizetesCelRowSchema.safeParse(raw)
      if (r.success) rows.push(r.data)
      // drift-tolerancia
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
