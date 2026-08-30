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
import { selectAllPaged } from '@kartoteka/supabase-client'
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
    // D3 (audit 2026-08-28): a KÁNON a befizetés-oldali generátor 2026-08-11-es
    // hármas javítása — ez az oldal eddig egyiket sem kapta meg:
    //  (1) LAPOZOTT lekérés (a PostgREST 1000-es plafonja némán levágta a MAX-ot),
    //  (2) készpénz = bankszamla_id IS NULL (az importált tételek irattipusa
    //      tetszőleges — az ilike-szűrő kihagyta őket),
    //  (3) a STORNÓZOTT szám újra kiadható (S3-#12) → nem tolja a MAX-ot.
    const { data, error } = await selectAllPaged<{ iratszam?: string | null }>(
      ctx.supabase
        .from('kiadas')
        .select('iratszam')
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        .is('bankszamla_id', null)
        .or('stornozott.eq.false,stornozott.is.null')
        .is('belso_mozgas_xkey', null)
        .gte('datum', `${year}-01-01`)
        .lt('datum', `${year + 1}-01-01`),
      { dedupeBy: null },
    )

    if (error) {
      return { success: false, error: `Iratszám-lekérdezés hiba: ${error.message}` }
    }

    // ⚠️ 2026-08-30: az AUTO-<dátum>-<ms> HELYŐRZŐ iratszámot KI KELL ZÁRNI. A regex az
    // első számcsoportot veszi, ami az AUTO-nál a DÁTUM (pl. 20260830) — ettől a következő
    // kiosztott sorszám 20260831 lenne, és a sorozat örökre elszállna. A webes
    // getNextReceiptNumbers ezt már szűri (actions.ts), a core eddig nem.
    let maxNum = 0
    for (const row of data || []) {
      const iratszam = (row as { iratszam?: string | null }).iratszam
      const nyers = String(iratszam || '')
      if (/^AUTO/i.test(nyers.trim())) continue
      const match = nyers.match(/(\d+)/)
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
