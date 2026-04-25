/**
 * softDeleteExpenseUseCase — A-M7.4c (2026-04-24).
 *
 * A `kiadas` sor `deleted=true` flag-re állítása. A `softDeleteIncomeUseCase`
 * tükörképe; visszafordítható.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteExpenseInputSchema,
  type SoftDeleteExpenseInput,
} from '@kartoteka/validations'

export interface SoftDeleteExpenseCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type SoftDeleteExpenseResult =
  | { success: true }
  | { success: false; error: string; notFound?: boolean }

export async function softDeleteExpenseUseCase(
  input: SoftDeleteExpenseInput,
  ctx: SoftDeleteExpenseCtx,
): Promise<SoftDeleteExpenseResult> {
  const parsed = softDeleteExpenseInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, kiadasId } = parsed.data

  try {
    const { data, error } = await ctx.supabase
      .from('kiadas')
      .update({ deleted: true })
      .eq('id', kiadasId)
      .eq('congregation_id', congregationId)
      .select('id')
      .maybeSingle()

    if (error) {
      return { success: false, error: `Törlés sikertelen: ${error.message}` }
    }
    if (!data) {
      return {
        success: false,
        error: 'A kiadás nem található (talán már törölték, vagy nem a te gyülekezeted).',
        notFound: true,
      }
    }

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Törlési hiba: ${msg}` }
  }
}
