/**
 * checkExpenseReceiptDuplicateUseCase — A-M7.4b (2026-04-24).
 *
 * A `checkReceiptDuplicateUseCase` (befizetés) tükörképe a `kiadas` táblára.
 * Az iratszám-duplikátum-ellenőrzés a kiadási nyilvántartáson belül fut;
 * a befizetés-iratszámok ettől függetlenek.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkExpenseReceiptDuplicateInputSchema,
  type CheckExpenseReceiptDuplicateInput,
} from '@kartoteka/validations'

export interface CheckExpenseReceiptDuplicateCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type CheckExpenseReceiptDuplicateResult =
  | { success: true; isDuplicate: boolean }
  | { success: false; error: string }

export async function checkExpenseReceiptDuplicateUseCase(
  input: CheckExpenseReceiptDuplicateInput,
  ctx: CheckExpenseReceiptDuplicateCtx,
): Promise<CheckExpenseReceiptDuplicateResult> {
  const parsed = checkExpenseReceiptDuplicateInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, iratszam, excludeId } = parsed.data

  try {
    let query = ctx.supabase
      .from('kiadas')
      .select('id')
      .eq('congregation_id', congregationId)
      .eq('iratszam', iratszam)
      .eq('deleted', false)
      .limit(1)

    if (excludeId !== undefined) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query
    if (error) {
      return {
        success: false,
        error: `Duplikátum-ellenőrzés hiba: ${error.message}`,
      }
    }

    return { success: true, isDuplicate: (data?.length ?? 0) > 0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Duplikátum-ellenőrzés hiba (valószínűleg nincs internet): ${msg}`,
    }
  }
}
