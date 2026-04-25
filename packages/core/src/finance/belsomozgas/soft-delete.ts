/**
 * softDeleteInternalTransferUseCase — A-M7.6a (2026-04-24).
 *
 * A `belsomozgas` sor `deleted=true` flag-re állítása. Egyszerű
 * visszafordítható soft-delete.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteInternalTransferInputSchema,
  type SoftDeleteInternalTransferInput,
} from '@kartoteka/validations'

export interface SoftDeleteInternalTransferCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type SoftDeleteInternalTransferResult =
  | { success: true }
  | { success: false; error: string; notFound?: boolean }

export async function softDeleteInternalTransferUseCase(
  input: SoftDeleteInternalTransferInput,
  ctx: SoftDeleteInternalTransferCtx,
): Promise<SoftDeleteInternalTransferResult> {
  const parsed = softDeleteInternalTransferInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, transferId } = parsed.data

  try {
    const { data, error } = await ctx.supabase
      .from('belsomozgas')
      .update({ deleted: true })
      .eq('id', transferId)
      .eq('congregation_id', congregationId)
      .select('id')
      .maybeSingle()

    if (error) {
      return { success: false, error: `Törlés sikertelen: ${error.message}` }
    }
    if (!data) {
      return {
        success: false,
        error: 'A belső mozgás nem található.',
        notFound: true,
      }
    }
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Törlési hiba: ${msg}` }
  }
}
