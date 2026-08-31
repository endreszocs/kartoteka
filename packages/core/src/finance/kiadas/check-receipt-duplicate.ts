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
      // D3 (audit 2026-08-28): a STORNÓZOTT sor NEM duplikátum (S3-#12) —
      // lásd a befizetés-oldali párját.
      .or('stornozott.eq.false,stornozott.is.null')
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

/**
 * KÖTEGES változat (2026-08-31) — sok kiadás- iratszám ellenőrzése EGY (chunkolt)
 * lekérdezéssel, a mentés ELŐTTI előellenőrzéshez.
 *
 * MIÉRT UGYANEBBEN A FÁJLBAN: a szűrő-lánc (gyülekezet + iratszám + nem törölt +
 * nem stornózott) MUSZÁJ, hogy azonos legyen az egyszemélyes ellenőrzésével —
 * különben az előellenőrzés MÁST mondana, mint amin a mentés elbukik. Egymás
 * mellett a két lánc egy pillantással összevethető (az őr is ezt méri).
 *
 * ⚠️ Darabolás: sok azonosítós `.in()` szűrőnél a proxy ~100 fölött 414-et ad —
 *    ezért 80-asával megyünk (a repó bevált mérete).
 *
 * FAIL-LOUD: hibánál `success: false` — a hívó FAIL-OPEN döntése, hogy ettől
 * megállítja-e a mentést (az előellenőrzés kényelem, nem védelem).
 */
export async function checkExpenseReceiptDuplicatesBatchUseCase(
  input: { congregationId: string; iratszamok: string[] },
  ctx: CheckExpenseReceiptDuplicateCtx,
): Promise<{ success: true; duplicates: string[] } | { success: false; error: string }> {
  const congregationId = String(input?.congregationId || '')
  if (!congregationId) return { success: false, error: 'Hiányzó gyülekezet-azonosító.' }
  // Üres/szóköz-számokat nem kérdezünk le; a duplikátumokat kiszűrjük.
  const szamok = Array.from(
    new Set((input?.iratszamok || []).map((s) => String(s ?? '').trim()).filter(Boolean)),
  )
  if (szamok.length === 0) return { success: true, duplicates: [] }

  const DARAB = 80
  const talalt = new Set<string>()
  try {
    for (let i = 0; i < szamok.length; i += DARAB) {
      const resz = szamok.slice(i, i + DARAB)
      const { data, error } = await ctx.supabase
        .from('kiadas')
        .select('iratszam')
        .eq('congregation_id', congregationId)
        .in('iratszam', resz)
        .eq('deleted', false)
        .or('stornozott.eq.false,stornozott.is.null')
      if (error) {
        return { success: false, error: `Duplikátum-ellenőrzés hiba: ${error.message}` }
      }
      for (const sor of data ?? []) {
        const sz = String((sor as { iratszam?: unknown }).iratszam ?? '').trim()
        if (sz) talalt.add(sz)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Duplikátum-ellenőrzés hiba (valószínűleg nincs internet): ${msg}` }
  }
  return { success: true, duplicates: szamok.filter((s) => talalt.has(s)) }
}
