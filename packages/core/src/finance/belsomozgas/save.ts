/**
 * saveInternalTransferUseCase — A-M7.6a (2026-04-24).
 *
 * Új belső mozgás rögzítése a `belsomozgas` táblába. A meglévő web
 * `saveInternalTransfer` portja a core-ba, `effective-access` helyett
 * explicit congregation_id-val.
 *
 * A művelet csak a `belsomozgas` master-táblát érinti — a `befizetes` +
 * `kiadas` tükör-sorok NEM jönnek létre automatikusan (ez a régi web-minta).
 * A `belso_mozgas_xkey` párosítás későbbi refaktor tárgya; jelenleg a
 * `belsomozgas.id` azonosítja a transzfert.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  saveInternalTransferInputSchema,
  type SaveInternalTransferInput,
  type SaveInternalTransferResult,
} from '@kartoteka/validations'

export interface SaveInternalTransferCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** A rögzítő user UUID — `created_by`. */
  userId: string
}

export type SaveInternalTransferResultOrError =
  | { success: true; data: SaveInternalTransferResult }
  | { success: false; error: string }

export async function saveInternalTransferUseCase(
  input: SaveInternalTransferInput,
  ctx: SaveInternalTransferCtx,
): Promise<SaveInternalTransferResultOrError> {
  const parsed = saveInternalTransferInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen belső mozgás-adat.',
    }
  }
  const clean = parsed.data

  try {
    const { data, error } = await ctx.supabase
      .from('belsomozgas')
      .insert({
        congregation_id: clean.congregationId,
        datum: clean.datum,
        tipus: clean.tipus,
        forras: clean.forras,
        cel: clean.cel,
        osszeg: clean.osszeg,
        cel_osszeg: clean.cel_osszeg ?? null,
        arfolyam: clean.arfolyam ?? null,
        megjegyzes: clean.megjegyzes || null,
        created_by: ctx.userId,
        deleted: false,
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: `Mentés sikertelen: ${error.message}` }
    }
    if (!data?.id) {
      return { success: false, error: 'A belső mozgás mentése után nem kaptunk ID-t.' }
    }

    return {
      success: true,
      data: { id: Number(data.id) },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Rögzítési hiba: ${msg}` }
  }
}
