/**
 * stornoExpenseUseCase — A-M7.4c (2026-04-24).
 *
 * A `stornoIncomeUseCase` tükörképe a `kiadas` táblára. A befizetés-sztornó-
 * hoz képest egyszerűbb:
 *
 *   - NINCS chitanta cascade (a kiadás nem ad ki papír-nyugtát)
 *   - VAN belső-mozgás pár cascade (`belso_mozgas_xkey`)
 *   - `kiadasikiseroiv` táblához NINCS cascade — annak nincs stornozott oszlopa
 *
 * Évzárás check (`bealitas.accounting_finalized`) a befizetéshez hasonlóan.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  stornoExpenseInputSchema,
  type StornoExpenseInput,
} from '@kartoteka/validations'

export interface StornoExpenseCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** Sztornózó user UUID — `stornozott_by`. */
  userId: string
}

export type StornoExpenseResult =
  | {
      success: true
      cascadedInternalTransfer: boolean
    }
  | {
      success: false
      error: string
      notFound?: boolean
      alreadyStorno?: boolean
      yearFinalized?: boolean
    }

async function isYearFinalized(
  supabase: SupabaseClient,
  congregationId: string,
  year: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('bealitas')
    .select('accounting_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', String(year))
    .maybeSingle()
  if (!data) return false
  return Boolean((data as { accounting_finalized?: boolean }).accounting_finalized)
}

export async function stornoExpenseUseCase(
  input: StornoExpenseInput,
  ctx: StornoExpenseCtx,
): Promise<StornoExpenseResult> {
  const parsed = stornoExpenseInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen sztornó input.',
    }
  }
  const clean = parsed.data
  const cascadeInternalTransfer = clean.cascadeInternalTransfer ?? true
  const nowIso = new Date().toISOString()

  try {
    // 1) Kiadás lekérdezése
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('kiadas')
      .select('id, datum, belso_mozgas_xkey, stornozott, deleted')
      .eq('id', clean.kiadasId)
      .eq('congregation_id', clean.congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A kiadás nem található (talán másik gyülekezeté, vagy már törölték).',
        notFound: true,
      }
    }

    const r = row as {
      id: number
      datum: string | null
      belso_mozgas_xkey: string | null
      stornozott: boolean
      deleted: boolean
    }

    if (r.stornozott) {
      return {
        success: false,
        error: 'Ez a kiadás már sztornózva van.',
        alreadyStorno: true,
      }
    }

    // 2) Év-véglegesítés check
    if (!clean.skipYearFinalizedCheck && r.datum) {
      const year = new Date(r.datum).getFullYear()
      const finalized = await isYearFinalized(ctx.supabase, clean.congregationId, year)
      if (finalized) {
        return {
          success: false,
          error: `A ${year}. évi számadás már véglegesítve van. Kérj javítási engedélyt az egyházmegyétől, mielőtt sztornózol.`,
          yearFinalized: true,
        }
      }
    }

    // 3) Fő UPDATE
    const payload = {
      stornozott: true,
      stornozott_at: nowIso,
      stornozott_indok: clean.indok,
      stornozott_by: ctx.userId,
      updated_at: nowIso,
    }

    const { error: updErr } = await ctx.supabase
      .from('kiadas')
      .update(payload)
      .eq('id', clean.kiadasId)
      .eq('congregation_id', clean.congregationId)

    if (updErr) {
      return { success: false, error: `Sztornó sikertelen: ${updErr.message}` }
    }

    // 4) Belső-mozgás pár sztornózása (ha engedélyezett + van)
    let cascadedInternalTransfer = false
    if (cascadeInternalTransfer && r.belso_mozgas_xkey) {
      // A belső mozgás párja lehet `befizetes` (bank→kassza esetén) VAGY
      // `kiadas` (kassza→bank esetén) táblában. Mindkettőt frissítjük, de
      // a magunkét (az eredeti id) kihagyjuk.
      const bErr1 = await ctx.supabase
        .from('kiadas')
        .update(payload)
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', clean.congregationId)
        .neq('id', clean.kiadasId)
      const bErr2 = await ctx.supabase
        .from('befizetes')
        .update(payload)
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', clean.congregationId)

      if (bErr1.error || bErr2.error) {
        const msg = bErr1.error?.message || bErr2.error?.message || 'ismeretlen'
        return {
          success: false,
          error: `Fő kiadás sztornózva, de a belső-mozgás pár NEM (${msg}). Kérlek ellenőrizd manuálisan.`,
        }
      }
      cascadedInternalTransfer = true
    }

    return {
      success: true,
      cascadedInternalTransfer,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Sztornó hiba: ${msg}` }
  }
}
