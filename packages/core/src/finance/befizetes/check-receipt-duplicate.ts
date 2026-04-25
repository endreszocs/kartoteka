/**
 * checkReceiptDuplicateUseCase — A-M7.3b (2026-04-24).
 *
 * Ellenőrzi, hogy egy adott iratszám foglalt-e már a gyülekezet
 * `befizetes` tábláján (nem-törölt sorok közt). A save-flow első
 * védelmi rétege a duplikátumok ellen.
 *
 * Az `excludeId` paraméter opcionális — update-flow esetén a saját
 * sort kihagyja (false-positive prevenció).
 *
 * **NEM** véd a race-ek ellen (két lelkész párhuzamosan ugyanazzal
 * a számmal rögzít). Azt a szerver-oldali unique constraint nyögi le;
 * a save-use-case 23505-öt kap és `duplicateReceipt: true`-t ad vissza.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkReceiptDuplicateInputSchema,
  type CheckReceiptDuplicateInput,
} from '@kartoteka/validations'

export interface CheckReceiptDuplicateCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type CheckReceiptDuplicateResult =
  | { success: true; isDuplicate: boolean }
  | { success: false; error: string }

export async function checkReceiptDuplicateUseCase(
  input: CheckReceiptDuplicateInput,
  ctx: CheckReceiptDuplicateCtx,
): Promise<CheckReceiptDuplicateResult> {
  const parsed = checkReceiptDuplicateInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, iratszam, excludeId } = parsed.data

  try {
    let query = ctx.supabase
      .from('befizetes')
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
