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
 *
 * 2026-08-15 (átvilágítás, ⛔1) ÉV-ZÁR: a törlés eddig NEM olvasta a
 * `bealitas.accounting_finalized` zászlót — egyedüliként a pénzügyi írási utak
 * közül. Egy már véglegesített, aláírt és beküldött év nyugtája így némán
 * eltüntethető volt: a kassza-egyenleg, a Registru, a Csoportnapló és a Számadás
 * tény-oszlopa elmozdult, a beküldött papír viszont nem. Mostantól a stornóval
 * AZONOS, fail-closed kaput használ (a közös `../year-lock` helper) — nem másolat.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteIncomeInputSchema,
  type SoftDeleteIncomeInput,
} from '@kartoteka/validations'

import { assertYearsNotFinalizedForDelete } from '../year-lock'

export interface SoftDeleteIncomeCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type SoftDeleteIncomeResult =
  | { success: true }
  | {
      success: false
      error: string
      notFound?: boolean
      /** Az érintett év számadása véglegesítve — a törlés blokkolva. */
      yearFinalized?: boolean
    }

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
    // 1) A sor dátuma — ez alapján tudjuk, melyik év számadását érintené a törlés.
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('befizetes')
      .select('id, datum')
      .eq('id', befizetesId)
      .eq('congregation_id', congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A befizetés nem található (talán már törölték, vagy nem a te gyülekezeted).',
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
