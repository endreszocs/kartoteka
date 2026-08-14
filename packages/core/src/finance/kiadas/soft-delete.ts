/**
 * softDeleteExpenseUseCase — A-M7.4c (2026-04-24).
 *
 * A `kiadas` sor `deleted=true` flag-re állítása. A `softDeleteIncomeUseCase`
 * tükörképe; visszafordítható.
 *
 * 2026-08-15 (átvilágítás, ⛔1) ÉV-ZÁR: a törlés eddig NEM olvasta a
 * `bealitas.accounting_finalized` zászlót, így egy már véglegesített, aláírt és
 * az egyházmegyének beküldött év kiadása némán eltüntethető volt (a kassza- és
 * bankegyenleg, a Registru és a Számadás tény-oszlopa elmozdult, a beküldött
 * papír nem). Mostantól a stornóval AZONOS, fail-closed kapun megy át — a közös
 * `../year-lock` helperrel, nem másolattal.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteExpenseInputSchema,
  type SoftDeleteExpenseInput,
} from '@kartoteka/validations'

import { assertYearsNotFinalizedForDelete } from '../year-lock'

export interface SoftDeleteExpenseCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type SoftDeleteExpenseResult =
  | { success: true }
  | {
      success: false
      error: string
      notFound?: boolean
      /** Az érintett év számadása véglegesítve — a törlés blokkolva. */
      yearFinalized?: boolean
    }

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
    // 1) A sor dátuma — ez alapján tudjuk, melyik év számadását érintené a törlés.
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('kiadas')
      .select('id, datum')
      .eq('id', kiadasId)
      .eq('congregation_id', congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A kiadás nem található (talán már törölték, vagy nem a te gyülekezeted).',
        notFound: true,
      }
    }

    // 2) ÉV-ZÁR (fail-closed) — lásd a fájl fejlécének 2026-08-15-i bejegyzését.
    const lockError = await assertYearsNotFinalizedForDelete(ctx.supabase, congregationId, [
      (row as { datum?: string | null }).datum,
    ])
    if (lockError) {
      return { success: false, error: lockError, yearFinalized: true }
    }

    // 3) Maga a soft delete
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
