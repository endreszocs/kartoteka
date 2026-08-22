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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2026-08-17 (KERÜLETI S5) — A HARMADIK SZINT ÉS A NYOMTATVÁNY
 * ─────────────────────────────────────────────────────────────────────────────
 * A `PrintScope` mostantól a KANONIKUS `FinanceScope` (tehát ismeri az
 * egyházkerületet is), a NYOMTATVÁNY-ág viszont még NEM készült el rá — az az
 * S6 szelet feladata. A típus és a viselkedés SZÁNDÉKOSAN válik szét:
 *   · a típus befogadja a kerületet, hogy a hívó oldalon ne kelljen kézi
 *     unió-másolatot tartani (az volt a hibaforrás),
 *   · a viselkedés viszont fail-closed: kerületi hatókörben NEM készül ív,
 *     helyette a felület megmondja, hogy még nem érhető el.
 * Lásd `nyomtatvanyScope()` és `KERULETI_NYOMTATVANY_UZENET` lentebb.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BealitasRow } from '@kartoteka/ui-app'

// 2026-08-17 (kerületi S5): a hatókör KANONIKUS típusa. Itt SZÁNDÉKOSAN nincs
// kézi `'congregation' | 'diocese'` unió-másolat: az a másolat volt az, ami
// miatt a kerületi ág fordítási hiba nélkül kimaradt volna a nyomtatványokból.
// A mag (`finance-scope-core.ts`) import-mentes, ezért kliens-oldalról is
// behúzható — a `finance-scope.ts` gazda-modult NEM szabad ide importálni
// (`server-only` láncot húzna a böngésző-bundle-be).
import type { FinanceScope } from '@/lib/auth/finance-scope-core'
import { normalizeDioceseBealitas } from '@/lib/finance/diocese-bealitas'

/**
 * A nyomtatvány hatóköre — a `FinanceScope`-pal AZONOS (nem másolat).
 * A régi név megmarad, hogy a hívók importja ne változzon.
 */
export type PrintScope = FinanceScope

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ AZOK A HATÓKÖRÖK, AMELYEKRE A NYOMTATVÁNY-RÉTEG MA KÉSZ
 * ════════════════════════════════════════════════════════════════════════════
 * Ez NEM a `FinanceScope` kézi másolata, hanem egy szándékosan SZŰKEBB készlet:
 * azok a szintek, amelyekre a NYOMTATVÁNY-építő (`budget-reporting.ts` borító +
 * `@kartoteka/core` `loadBudgetRowsCompat`) tényleg elkészült.
 *
 * Az egyházkerületi nyomtatvány-ág a KÖVETKEZŐ szelet (S6) feladata. Amíg nincs
 * kész, a kerületi hatókör ide NEM fér be — és ez a kulcs:
 *
 *   Egy rossz fejlécű, mégis ALÁÍRHATÓ hivatalos ív ROSSZABB, mint egy hiányzó
 *   gomb. Ha a kerületi adat a gyülekezeti/megyei borítóval menne ki, a papír
 *   MÁS intézményt nevezne meg, mint amelyik kiállította — és azt valaki
 *   aláírja és beadja.
 *
 * Ezért a kerületi ág itt NEM „esik vissza" semmire: a `nyomtatvanyScope()`
 * `null`-t ad, a két nyomtatási központ pedig magyarázó, NYOMTATÁST TILTÓ
 * előnézetet mutat helyette.
 */
export type KeszNyomtatvanyScope = 'congregation' | 'diocese'

/**
 * A hatókör leképezése a nyomtatvány-réteg által ISMERT hatókörre.
 * `null` = erre a szintre MÉG NINCS nyomtatvány-ág.
 *
 * ⚠️ EXHAUSTIVE SWITCH (a `finance-scope-core.ts` mintája): ha a `FinanceScope`
 *    egy negyedik szinttel bővül, ez FORDÍTÁSI HIBÁT ad. `scope === 'district'
 *    ? null : scope` alakban némán átengedné az új szintet a gyülekezeti
 *    borítóra — pontosan az a hibaosztály, ami ellen ez a fájl készült.
 */
export function nyomtatvanyScope(scope: PrintScope): KeszNyomtatvanyScope | null {
  switch (scope) {
    case 'congregation':
    case 'diocese':
      return scope
    case 'district':
      return null
    default: {
      const _nemKezelt: never = scope
      throw new Error(`Ismeretlen nyomtatvány-hatókör: ${String(_nemKezelt)}`)
    }
  }
}

/** A kerületi (még hiányzó) nyomtatvány-ág magyarázó előnézetének CÍME. */
export const KERULETI_NYOMTATVANY_CIM = 'Az egyházkerületi nyomtatvány még nem érhető el'

/**
 * A kerületi (még hiányzó) nyomtatvány-ág magyarázó előnézetének SZÖVEGE.
 * KÖZÖS konstans, hogy a két nyomtatási központ ne mondjon mást ugyanarról.
 */
export const KERULETI_NYOMTATVANY_UZENET =
  'Az egyházkerületi könyvelés adatai rendben rögzülnek és megtekinthetők, de a hivatalos ' +
  'egyházkerületi nyomtatvány (borító, fejléc, aláírás-blokk) még készül. Addig sem adunk ki ' +
  'ívet: a meglévő nyomtatvány gyülekezeti, illetve egyházmegyei fejléccel készülne, tehát a ' +
  'papír más intézményt nevezne meg, mint amelyik kiállította. Az adatok addig is biztonságban ' +
  'vannak — amint az egyházkerületi ív elkészül, ugyanezek az évek visszamenőleg kinyomtathatók.'

export interface EvBeallitasBetoltes {
  /** Az adott év beállítás-sora, vagy `null` (az évet még nem nyitották meg). */
  row: BealitasRow | null
  /** `false` = a sor nem áll rendelkezésre — a nyomtatvány nem készíthető el. */
  ok: boolean
  /**
   * 2026-08-17 (kerületi S5): MIÉRT nem áll rendelkezésre (`ok === false`).
   *   · `'lekerdezes_hiba'`       — hálózat / RLS / hiányzó oszlop; újrapróbálható,
   *   · `'nincs_nyomtatvany_ag'`  — erre a szintre MÉG NINCS nyomtatvány (S6).
   * A kettő KÜLÖNBÖZŐ üzenetet érdemel: az elsőnél az „próbáld újra" a helyes
   * tanács, a másodiknál az félrevezető lenne (soha nem sikerülne).
   */
  hibaOk?: 'lekerdezes_hiba' | 'nincs_nyomtatvany_ag'
}

/**
 * @param supabase kliens- vagy szerver-oldali Supabase kliens
 * @param scope    a nyomtatvány hatóköre (a Pénzügy oldal `scope` propja)
 * @param scopeId  gyülekezet-, egyházmegye- VAGY egyházkerület-azonosító
 * @param year     a KIVÁLASZTOTT év (nem az oldal éve!)
 */
export async function loadEvBeallitas(
  supabase: SupabaseClient,
  scope: PrintScope,
  scopeId: string,
  year: number,
): Promise<EvBeallitasBetoltes> {
  try {
    // ⚠️ EXHAUSTIVE SWITCH, nem `if (scope === 'diocese') { … } return gyülekezeti`.
    //    A régi alakban a kerület NÉMÁN a gyülekezeti ágra esett volna: a
    //    `bealitas` táblában egy KERÜLET UUID-jára keresett volna, 0 sort talál,
    //    és a hivatalos ív „nincs véglegesítve" felirattal ment volna ki egy
    //    lezárt évre — gyülekezeti fejléccel.
    switch (scope) {
      case 'diocese': {
        const { data, error } = await supabase
          .from('diocese_bealitas')
          // `select('*')` SZÁNDÉKOSAN: az új oszlopok (határozat, módosítás-flagek)
          // csak a 2026-08-15-i migrációk után léteznek — explicit oszloplistával a
          // TELJES lekérés 42703-mal bukna, és a borító némán üresen menne ki.
          .select('*')
          .eq('diocese_id', scopeId)
          .eq('eve', year)
          .maybeSingle()
        if (error) return { row: null, ok: false, hibaOk: 'lekerdezes_hiba' }
        return {
          row: normalizeDioceseBealitas(
            (data as Record<string, unknown> | null) ?? null,
            scopeId,
            year,
          ),
          ok: true,
        }
      }

      case 'district':
        // ⛔ A KERÜLETI NYOMTATVÁNY-ÁG AZ S6 SZELET FELADATA.
        //
        // A `district_bealitas` sor lekérése önmagában triviális volna (a megyei
        // ág tükre), de a sor MEGSZERZÉSE itt félrevezető lenne: a hívó ebből
        // azt olvasná ki, hogy „megvan az évi beállítás, tehát nyomtathatunk" —
        // és a `budget-reporting.ts` borítója gyülekezeti/megyei fejléccel
        // állítaná elő a kerületi ívet. Fail-closed: inkább hiányzó gomb, mint
        // rossz fejlécű, aláírható hivatalos papír.
        return { row: null, ok: false, hibaOk: 'nincs_nyomtatvany_ag' }

      case 'congregation': {
        const { data, error } = await supabase
          .from('bealitas')
          // `select('*')` SZÁNDÉKOSAN — lásd fent (szamadas_tartozasok).
          .select('*')
          .eq('congregation_id', scopeId)
          .eq('id', String(year))
          .maybeSingle()
        if (error) return { row: null, ok: false, hibaOk: 'lekerdezes_hiba' }
        return { row: (data as BealitasRow | null) ?? null, ok: true }
      }

      default: {
        const _nemKezelt: never = scope
        throw new Error(`Ismeretlen nyomtatvány-hatókör: ${String(_nemKezelt)}`)
      }
    }
  } catch {
    return { row: null, ok: false, hibaOk: 'lekerdezes_hiba' }
  }
}
