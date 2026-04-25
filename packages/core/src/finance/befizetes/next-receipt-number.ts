/**
 * getNextReceiptNumberUseCase — A-M7.3b (2026-04-24).
 *
 * Megadja a gyülekezet következő szabad (Készpénz) iratszámát egy adott évre.
 * A web-oldali `getNextReceiptNumber(year)` portja — a különbség az explicit
 * `congregationId` átadás (nem implicit profile-ből), és a `Result`-forma
 * egységesség a többi use-case-szel.
 *
 * Logika:
 *   - Lekérdezi az összes `Készpénz`-típusú, nem-törölt, nem-belső-mozgás
 *     (belso_mozgas_xkey IS NULL) befizetés `iratszam` mezőjét az adott évre
 *   - Kiszűri az első egész számot mindegyikből (regex `(\d+)`)
 *   - Visszaadja max(ezek) + 1, vagy 1 ha üres
 *
 * NEM concurrency-safe (két lelkész egy időben ugyanazt a számot kapná) —
 * a szerver-oldali unique constraint nyög le, ha ütközés lesz. A valós
 * gyakorlatban egy gyülekezetben egy ember rögzít, tehát rare.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  nextReceiptNumberInputSchema,
  type NextReceiptNumberInput,
} from '@kartoteka/validations'

export interface NextReceiptNumberCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type NextReceiptNumberResult =
  | { success: true; nextNumber: number }
  | { success: false; error: string }

export async function getNextReceiptNumberUseCase(
  input: NextReceiptNumberInput,
  ctx: NextReceiptNumberCtx,
): Promise<NextReceiptNumberResult> {
  const parsed = nextReceiptNumberInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, year } = parsed.data

  try {
    const { data, error } = await ctx.supabase
      .from('befizetes')
      .select('iratszam')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .ilike('irattipus', '%észpénz%') // 'Készpénz' case-insensitive match
      .is('belso_mozgas_xkey', null) // belső mozgás ne számítson az iratszám-szekvenciába
      .gte('datum', `${year}-01-01`)
      .lte('datum', `${year}-12-31`)

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
