/**
 * getNextReceiptNumberUseCase — A-M7.3b (2026-04-24).
 *
 * Megadja a gyülekezet következő szabad (Készpénz) iratszámát egy adott évre.
 * A web-oldali `getNextReceiptNumber(year)` portja — a különbség az explicit
 * `congregationId` átadás (nem implicit profile-ből), és a `Result`-forma
 * egységesség a többi use-case-szel.
 *
 * Logika:
 *   - Lekérdezi az összes KÉSZPÉNZES (kassza = `bankszamla_id IS NULL`), nem
 *     törölt, nem stornózott, nem belső-mozgás befizetés `iratszam` mezőjét az
 *     adott évre — LAPOZVA
 *   - Kiszűri az első egész számot mindegyikből (regex `(\d+)`)
 *   - Visszaadja max(ezek) + 1, vagy 1 ha üres
 *
 * NEM concurrency-safe (két lelkész egy időben ugyanazt a számot kapná) —
 * a szerver-oldali unique constraint nyög le, ha ütközés lesz. A valós
 * gyakorlatban egy gyülekezetben egy ember rögzít, tehát rare.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-08-11 (5. kör, P3 #5) — HÁROM JAVÍTÁS, mindegyik ÉLŐ hibát szüntet meg.
 * Ez a use-case NEM halott kód: a `befizetes/save.ts` innen kéri az iratszámot,
 * a desktop `befizetes-page.tsx` pedig ezzel tölti elő a Készpénz-mezőt.
 *
 *  (1) LAPOZÁS. A lekérdezés `.range()` nélkül futott, így a PostgREST 1000-es
 *      sor-plafonja NÉMÁN levágta — egy 1000+ nyugtás évben a legnagyobb
 *      iratszám kimaradt a MAX-ból, és a desktop egy MÁR HASZNÁLT nyugtaszámot
 *      ajánlott fel. (A web `getNextReceiptNumbers` ezt 2026-07-25-én, F6.1-ként
 *      már megkapta: „a rendszer ÚJRA KIADHATOTT egy már használt nyugtaszámot".)
 *
 *  (2) KÉSZPÉNZ-AZONOSÍTÁS. Az `.ilike('irattipus', '%észpénz%')` szűrő a
 *      2026-06-30-as webes fix ELŐTTI állapot volt. Az IMPORTÁLT nyugták
 *      `irattipus`-a 'chitanta' / 'általános import' / fájlból jövő szöveg, így
 *      ez a szűrő kihagyta őket — pedig kassza-tételek (bankszámla nélkül), és
 *      ott vannak a nyugta-sorozatban. Emiatt egy frissen importált gyülekezet
 *      desktopon újra 1-től kezdte a számozást. Mostantól a kanonikus
 *      `bankszamla_id IS NULL`.
 *
 *  (3) STORNÓ-KIZÁRÁS. A stornózott nyugta száma újra kiadható (webes S3-#12
 *      döntés, 2026-07-10), ezért nem tolhatja feljebb a MAX-ot. `or`-szűrés,
 *      mert a storno-funkció előtti sorokban a `stornozott` NULL.
 *
 * Így a desktop és a web ugyanazt a halmazt látja — a nyugta-sorozat a két
 * kliens közt nem tud széthúzni.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPaged } from '@kartoteka/supabase-client'
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
    const { data, error } = await selectAllPaged<{ iratszam?: string | null }>(
      ctx.supabase
        .from('befizetes')
        .select('iratszam')
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        // Kassza = nincs bankszámla. NEM az `irattipus` szövege — az importált
        // nyugták irattipusa tetszőleges, de a sorozat része (lásd (2) fent).
        .is('bankszamla_id', null)
        // A stornózott szám újra kiadható, ne tolja feljebb a MAX-ot; `or`, mert
        // a régi sorokban a `stornozott` NULL (lásd (3) fent).
        .or('stornozott.eq.false,stornozott.is.null')
        .is('belso_mozgas_xkey', null) // belső mozgás ne számítson az iratszám-szekvenciába
        .gte('datum', `${year}-01-01`)
        .lte('datum', `${year}-12-31`),
      // Az `iratszam` nincs a select-ben `id`-vel együtt, de a rendezéshez a
      // szerver oldalán elég, ha az oszlop LÉTEZIK — a stabil laphatárhoz kell.
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
    for (const row of data) {
      const nyers = String(row.iratszam || '')
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
