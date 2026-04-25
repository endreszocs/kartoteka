/**
 * softDeleteIncomeUseCase — A-M7.3c (2026-04-24).
 *
 * Egy befizetés `deleted=true` flag-re állítása. Visszafordítható — a sor
 * a DB-ben marad, csak kiszűrjük a lista-lekérdezésekben (az `includeDeleted`
 * flag-gel nézhető újra).
 *
 * Szemantika: „ez sosem kellett volna, hogy rögzítve legyen" (véletlen
 * dupla-entry, elírás). A sztornó (lásd `stornoIncomeUseCase`) ellenben
 * „érvénytelenítés" — könyvelési fogalom, más szerepe van.
 *
 * A korábbi web `deleteTransaction('befizetes', id)` egyszerű `update({deleted: true})`
 * — a logika ugyanez, csak explicit congregation_id scope-pal és Result-formával.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteIncomeInputSchema,
  type SoftDeleteIncomeInput,
} from '@kartoteka/validations'

export interface SoftDeleteIncomeCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type SoftDeleteIncomeResult =
  | { success: true }
  | { success: false; error: string; notFound?: boolean }

export async function softDeleteIncomeUseCase(
  input: SoftDeleteIncomeInput,
  ctx: SoftDeleteIncomeCtx,
): Promise<SoftDeleteIncomeResult> {
  const parsed = softDeleteIncomeInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, befizetesId } = parsed.data

  try {
    const { data, error } = await ctx.supabase
      .from('befizetes')
      .update({ deleted: true })
      .eq('id', befizetesId)
      .eq('congregation_id', congregationId)
      .select('id')
      .maybeSingle()

    if (error) {
      return { success: false, error: `Törlés sikertelen: ${error.message}` }
    }
    if (!data) {
      return {
        success: false,
        error: 'A befizetés nem található (talán már törölték, vagy nem a te gyülekezeted).',
        notFound: true,
      }
    }

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Törlési hiba: ${msg}` }
  }
}
