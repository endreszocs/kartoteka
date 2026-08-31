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
      // D3 (audit 2026-08-28): a STORNÓZOTT sor NEM duplikátum — a szám az
      // S3-#12 döntés szerint újra kiadható. Eddig a generátor felajánlotta a
      // stornózott számot, ez az ellenőrzés meg elutasította: zsákutca.
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
 * KÖTEGES változat (2026-08-31) — sok befizetés- iratszám ellenőrzése EGY (chunkolt)
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
export async function checkReceiptDuplicatesBatchUseCase(
  input: { congregationId: string; iratszamok: string[] },
  ctx: CheckReceiptDuplicateCtx,
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
        .from('befizetes')
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
