/**
 * softDeleteInternalTransferUseCase — A-M7.6a (2026-04-24).
 *
 * A `belsomozgas` sor `deleted=true` flag-re állítása. Egyszerű
 * visszafordítható soft-delete.
 *
 * 2026-08-15 (átvilágítás, ⛔1) ÉV-ZÁR: a törlés eddig NEM olvasta a
 * `bealitas.accounting_finalized` zászlót, pedig a belső mozgás (kassza↔bank
 * átvezetés) mindkét oldala szerepel a Registruban és a számadás
 * pénztár-/bank-egyenlegében. Egy már véglegesített és beküldött év átvezetése
 * így némán eltüntethető volt. Mostantól a stornóval AZONOS, fail-closed kapun
 * megy át — a közös `../year-lock` helperrel, nem másolattal.
 *
 * MIÉRT ELÉG EGY DÁTUM: a `belsomozgas` EGY sorban tárolja az átvezetés
 * mindkét oldalát (`forras` → `cel`), egyetlen `datum`-mal — a két oldal tehát
 * nem eshet külön évre. (A web `deleteTransaction` ezzel szemben a
 * `befizetes`/`kiadas` tükör-sorpárt törli `belso_mozgas_xkey` alapján, ott
 * MINDKÉT sor évét ellenőrizni kell.)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteInternalTransferInputSchema,
  type SoftDeleteInternalTransferInput,
} from '@kartoteka/validations'

import { assertYearsNotFinalizedForDelete } from '../year-lock'

export interface SoftDeleteInternalTransferCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type SoftDeleteInternalTransferResult =
  | { success: true }
  | {
      success: false
      error: string
      notFound?: boolean
      /** Az érintett év számadása véglegesítve — a törlés blokkolva. */
      yearFinalized?: boolean
    }

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
    // 1) A sor dátuma — ez alapján tudjuk, melyik év számadását érintené a törlés.
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('belsomozgas')
      .select('id, datum')
      .eq('id', transferId)
      .eq('congregation_id', congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A belső mozgás nem található.',
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
