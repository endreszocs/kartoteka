/**
 * getNextReceiptNumberForExpenseUseCase — A-M7.4b (2026-04-24).
 *
 * A `getNextReceiptNumberUseCase` (befizetés) tükörképe a `kiadas` táblára.
 * Az iratszám-szekvencia szeparált a befizetéstől — a két nyilvántartás
 * egymástól független.
 *
 * Logika: a Készpénz-típusú, nem-törölt, nem-belső-mozgás kiadások közül
 * a legnagyobb iratszám + 1.
 *
 * **Nem concurrency-safe** — mint a befizetésnél, a szerver-oldali unique
 * constraint nyög le ütközés esetén.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  nextExpenseReceiptNumberInputSchema,
  type NextExpenseReceiptNumberInput,
} from '@kartoteka/validations'

export interface NextExpenseReceiptNumberCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type NextExpenseReceiptNumberResult =
  | { success: true; nextNumber: number }
  | { success: false; error: string }

export async function getNextReceiptNumberForExpenseUseCase(
  input: NextExpenseReceiptNumberInput,
  ctx: NextExpenseReceiptNumberCtx,
): Promise<NextExpenseReceiptNumberResult> {
  const parsed = nextExpenseReceiptNumberInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, year } = parsed.data

  try {
    const { data, error } = await ctx.supabase
      .from('kiadas')
      .select('iratszam')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .ilike('irattipus', '%észpénz%')
      .is('belso_mozgas_xkey', null)
      .gte('datum', `${year}-01-01`)
      .lt('datum', `${year + 1}-01-01`)

    if (error) {
      return { success: false, error: `Iratszám-lekérdezés hiba: ${error.message}` }
    }

    let maxNum = 0
    for (const row of data || []) {
      const iratszam = (row as { iratszam?: string | null }).iratszam
      const match = String(iratszam || '').match(/(\d+)/)
      if (match) {
        const n = Number.parseInt(match[1], 10)
        if (Number.isFinite(n) && n > maxNum) maxNum = n
      }
    }

    return { success: true, nextNumber: maxNum + 1 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Iratszám-lekérdezés hiba (valószínűleg nincs internet): ${msg}`,
    }
  }
}
