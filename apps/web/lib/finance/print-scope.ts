/**
 * Nyomtatványok HATÓKÖR-tudatos évi beállítás-betöltése — KÖZÖS helyen.
 *
 * MIÉRT (egyházmegyei terv, 2.1 „az egyházmegyei pénzügy mondjon igazat"):
 * a két nyomtatási központ (BudgetPrintDialog, FinancePrintDialog) a
 * KIVÁLASZTOTT év beállítás-sorát mindig a GYÜLEKEZETI `bealitas` táblából
 * kérte le, `congregation_id = settings.congregation_id` szűrővel. Megyei
 * hatókörben ez az azonosító az EGYHÁZMEGYE UUID-ja, a `bealitas` viszont a
 * gyülekezeti tábla → a lekérés NÉMÁN üres maradt:
 *   · a nem folyó évek megyei Számadása/Költségvetése „Nincs véglegesítve"
 *     felirattal ment ki akkor is, ha az esperesi hivatal lezárta,
 *   · a jóváhagyó gyűlés határozat-száma és dátuma lemaradt a borítóról.
 * Vagyis a papír mást állított, mint az adatbázis — hivatalos iraton.
 *
 * Mostantól mindkét nyomtató EZT a betöltőt hívja: megyei hatókörben a
 * `diocese_bealitas` sorát olvassa, és a KÖZÖS `normalizeDioceseBealitas`
 * leképezővel adja át ugyanabban az alakban (közös helper, soha széthúzó
 * másolat).
 *
 * FAIL-CLOSED: hibánál `ok: false` — a hívó ilyenkor magyarázó előnézetet ad,
 * nem hamis borítót.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BealitasRow } from '@kartoteka/ui-app'

import { normalizeDioceseBealitas } from '@/lib/finance/diocese-bealitas'

export type PrintScope = 'congregation' | 'diocese'

export interface EvBeallitasBetoltes {
  /** Az adott év beállítás-sora, vagy `null` (az évet még nem nyitották meg). */
  row: BealitasRow | null
  /** `false` = a lekérdezés HIBÁRA futott — a nyomtatvány nem készíthető el. */
  ok: boolean
}

/**
 * @param supabase kliens- vagy szerver-oldali Supabase kliens
 * @param scope    a nyomtatvány hatóköre (a Pénzügy oldal `scope` propja)
 * @param scopeId  gyülekezet- VAGY egyházmegye-azonosító (a hatókör szerint)
 * @param year     a KIVÁLASZTOTT év (nem az oldal éve!)
 */
export async function loadEvBeallitas(
  supabase: SupabaseClient,
  scope: PrintScope,
  scopeId: string,
  year: number,
): Promise<EvBeallitasBetoltes> {
  try {
    if (scope === 'diocese') {
      const { data, error } = await supabase
        .from('diocese_bealitas')
        // `select('*')` SZÁNDÉKOSAN: az új oszlopok (határozat, módosítás-flagek)
        // csak a 2026-08-15-i migrációk után léteznek — explicit oszloplistával a
        // TELJES lekérés 42703-mal bukna, és a borító némán üresen menne ki.
        .select('*')
        .eq('diocese_id', scopeId)
        .eq('eve', year)
        .maybeSingle()
      if (error) return { row: null, ok: false }
      return {
        row: normalizeDioceseBealitas(
          (data as Record<string, unknown> | null) ?? null,
          scopeId,
          year,
        ),
        ok: true,
      }
    }

    const { data, error } = await supabase
      .from('bealitas')
      // `select('*')` SZÁNDÉKOSAN — lásd fent (szamadas_tartozasok).
      .select('*')
      .eq('congregation_id', scopeId)
      .eq('id', String(year))
      .maybeSingle()
    if (error) return { row: null, ok: false }
    return { row: (data as BealitasRow | null) ?? null, ok: true }
  } catch {
    return { row: null, ok: false }
  }
}
