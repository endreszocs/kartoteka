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
 * 2026-08-22 (KERÜLETI S6) — A HARMADIK SZINT NYOMTATVÁNY-ÁGA MEGNYÍLT
 * ─────────────────────────────────────────────────────────────────────────────
 * Az S5-ben ez a fájl fail-closed kaput tartott az egyházkerületre, és a
 * fejléc-kommentje azt állította, hogy „a nyomtatvány-ág még NEM készült el rá".
 * EZ AZ ÁLLÍTÁS MÁRA TÉNYSZERŰEN HAMIS — és egy hamis magyarázó komment
 * rosszabb, mint a semmilyen: a következő olvasót elhiteti, hogy még dolga van
 * vele, miközben a kerületi tartalom KÉSZEN áll és HOLT KÓDKÉNT állt:
 *   · borító-építő kerületi ága — packages/ui-app/src/finance/budget-reporting.ts:
 *     `BudgetPrintScope` (:209) három értékű, `kiallitoSzint()` (:222) exhaustive,
 *     kerületi borító FELETTES BLOKK NÉLKÜL (:708-798 — a kerület fölött nincs
 *     szint, tehát nincs kinek iktatószámot és aláírást hagyni a lap tetején),
 *     „Egyházkerületi iktatószám / Nr. înreg. eparhie", „Tárgyalta és jóváhagyta
 *     az egyházkerületi közgyűlés";
 *   · kerületi számadás- és részszámadás-nyilatkozat (:518, :644);
 *   · kerületi aláírás-blokk (:1428) — `szint: BudgetPrintScope` paraméterrel;
 *   · terv-sor betöltő kerületi ága — packages/core/src/finance/budget-compat.ts
 *     `felsoSzintTerv()` (:77) → `district_koltsegvetes` / `district_id`;
 *   · az évi beállítás kerületi ága ITT, LENT készült el (`district_bealitas`).
 * Ezért a kapu MEGNYÍLIK: `nyomtatvanyScope('district') === 'district'`.
 *
 * ⚠️ AMI TOVÁBBRA IS ZÁRVA MARAD — ÉS NEM ITT DŐL EL:
 * a Pénzügyi nyomtatási központ GYÜLEKEZETI VILÁGÚ ívei (Registru de casă /
 * banca / jurnal, Csoportnapló, nyugtatömb-kimutatás, Decont/Dispoziție
 * újranyomtatás, részszámadás) és minden NEM az oldal évére kért ív. A miértjük
 * — fájl:sor bizonyítékokkal — a `finance-print-dialog.tsx` kerületi kapujánál
 * áll, mert ott dől el; ide csak az a szabály tartozik, hogy a kerületi
 * SZÁMADÁS/KÖLTSÉGVETÉS ág immár nyitva van.
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
 * AZOK A HATÓKÖRÖK, AMELYEKRE A NYOMTATVÁNY-RÉTEG KÉSZ
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-22 (kerületi S6): MIND A HÁROM MEGLÉVŐ SZINT. A készlet ma egybeesik
 * a `FinanceScope`-pal — de ez EREDMÉNY, nem definíció, és ezért marad külön
 * típus:
 *
 *   Ez a készlet azt sorolja fel, amire a NYOMTATVÁNY-ÉPÍTŐ (`budget-reporting.ts`
 *   borító + `@kartoteka/core` `loadBudgetRowsCompat` + a lenti beállítás-betöltő)
 *   tényleg elkészült — nem azt, hogy hány hatókört ismer a jogosultsági réteg.
 *   A kettő 2026-08-17 és 2026-08-22 között SZÁNDÉKOSAN széthúzott (a kerület már
 *   könyvelt, de még nem nyomtatott), és egy negyedik szintnél újra szét fog:
 *   a hatókör-réteg ott is előbb készül el, mint a hivatalos ív.
 *
 * Ha a `FinanceScope` negyedik szinttel bővül, az új szint IDE NEM kerül be
 * automatikusan — a `nyomtatvanyScope()` exhaustive switch-e fordítási hibát ad,
 * és a helyes válasz addig `null` (fail-closed), amíg a borító el nem készül rá:
 *
 *   Egy rossz fejlécű, mégis ALÁÍRHATÓ hivatalos ív ROSSZABB, mint egy hiányzó
 *   gomb. Ha egy új szint adata a gyülekezeti/megyei/kerületi borítóval menne ki,
 *   a papír MÁS intézményt nevezne meg, mint amelyik kiállította — és azt valaki
 *   aláírja és beadja.
 */
export type KeszNyomtatvanyScope = 'congregation' | 'diocese' | 'district'

/**
 * A hatókör leképezése a nyomtatvány-réteg által ISMERT hatókörre.
 * `null` = erre a szintre MÉG NINCS nyomtatvány-ág.
 *
 * ⚠️ EXHAUSTIVE SWITCH (a `finance-scope-core.ts` mintája): ha a `FinanceScope`
 *    egy negyedik szinttel bővül, ez FORDÍTÁSI HIBÁT ad. `scope === 'district'
 *    ? null : scope` alakban némán átengedné az új szintet a gyülekezeti
 *    borítóra — pontosan az a hibaosztály, ami ellen ez a fájl készült.
 *
 * ⚠️ A `null` visszatérés 2026-08-22 óta a HÁROM MAI szintre nem fordul elő —
 *    de a típusból NEM vehető ki, és a hívói ág sem törölhető: az a negyedik
 *    szint fail-closed válasza. A hívók (`keszScope === null`) magyarázó,
 *    NYOMTATÁST TILTÓ előnézetet adnak rá (`NINCS_NYOMTATVANY_AG_*`).
 */
export function nyomtatvanyScope(scope: PrintScope): KeszNyomtatvanyScope | null {
  switch (scope) {
    case 'congregation':
    case 'diocese':
    // 2026-08-22 (kerületi S6): a kerület IDE KERÜLT. A borító, a nyilatkozat és
    // az aláírás-blokk kerületi ága kész (lásd a fájl fejlécét), a terv-sorok a
    // `district_koltsegvetes`-ből, az évi beállítás a `district_bealitas`-ból jön.
    case 'district':
      return scope
    default: {
      // ⛔ 2026-08-22 JAVÍTÁS — ITT NEM SZABAD DOBNI.
      //
      // A fordítói kaput a `const _nemKezelt: never = scope` ÉRTÉKADÁS adja,
      // NEM a dobás: ha a `PrintScope` egy negyedik szinttel bővül, ez a sor
      // fordítási hibát ad, és a hiányzó ág még a kiadás előtt kiderül.
      //
      // MI VOLT A BAJ A DOBÁSSAL: futásidőben ez a fájl azt ígéri, hogy
      // ismeretlen szintre `null`-t ad, és a hívók (a két nyomtatási központ)
      // erre a `null`-ra építik a magyarázó, nyomtatást tiltó előnézetet.
      // A dobás miatt viszont a `keszScope === null` ág MIND A NÉGY hívási
      // helyen elérhetetlen holt kód volt, a `loadEvBeallitas`
      // `hibaOk: 'nincs_nyomtatvany_ag'` értéke pedig sosem született meg —
      // vagyis a fájl saját fail-closed szerződése papíron állt, a gyakorlatban
      // nem. Egy futásidejű kivétel ráadásul nyers hibaképernyőt adna a
      // magyarázó előnézet helyett, épp egy hivatalos irat kiadása közben.
      //
      // Ez a helyzet NEM elméleti: a `scope` KLIENS-prop. Egy negyedik szintnél
      // a szerver már az új értéket küldi, miközben a böngészőben még a régi
      // bundle fut — a felhasználó tehát a valóságban is találkozhat vele.
      const _nemKezelt: never = scope
      void _nemKezelt
      return null
    }
  }
}

/**
 * A nyomtatvány-ág NÉLKÜLI hatókör magyarázó előnézetének CÍME.
 * (2026-08-22 előtt `KERULETI_NYOMTATVANY_CIM` volt — a kerület azóta nyomtat,
 * ez a szöveg innentől a JÖVŐBELI, ág nélküli szinté.)
 */
export const NINCS_NYOMTATVANY_AG_CIM = 'Erre a szintre még nincs hivatalos nyomtatvány'

/**
 * A nyomtatvány-ág NÉLKÜLI hatókör magyarázó előnézetének SZÖVEGE.
 * KÖZÖS konstans, hogy a két nyomtatási központ ne mondjon mást ugyanarról.
 *
 * ⚠️ A szöveg SZÁNDÉKOSAN nem ajánlja az újrapróbálást: ez nem átmeneti hiba,
 *    hanem hiányzó ív — az „próbáld újra" tanács itt félrevezető lenne.
 */
export const NINCS_NYOMTATVANY_AG_UZENET =
  'Ennek a szintnek a könyvelése rendben rögzül és megtekinthető, de a hivatalos nyomtatványa ' +
  '(borító, fejléc, aláírás-blokk) még készül. Addig sem adunk ki ívet: a meglévő nyomtatvány ' +
  'egy MÁSIK szint fejlécével készülne, tehát a papír más intézményt nevezne meg, mint amelyik ' +
  'kiállította. Az adatok addig is biztonságban vannak — amint az ív elkészül, ugyanezek az évek ' +
  'visszamenőleg kinyomtathatók. Az újrapróbálás nem segít; jelezd a rendszergazdának.'

/** A kiállító neve nélküli ív magyarázó előnézetének CÍME. */
export const KIALLITO_NEVE_HIANYZIK_CIM = 'A kiállító neve nem tölthető be'

/**
 * A kiállító neve nélküli ív magyarázó előnézetének SZÖVEGE.
 *
 * MIÉRT KELL EZ A KAPU (2026-08-22, kerületi S6 lánc-ellenőrzés): a felső
 * szintek nevét az `app/(dashboard)/penzugy/actions.ts` `initFinanceFelsoSzint`
 * kérdezi le, és a lekérés hibáját NEM nézi
 * (`szintNev = (distRes.data?.name as string | null) || ''`) — hálózati hibánál
 * vagy hiányzó `districts` sornál NÉMÁN üres string lesz belőle. A borító
 * entitás-neve (`hivatalosEntitasNev`, budget-reporting.ts:689) ezt szó szerint
 * kiírja: egy NÉVTELEN, mégis aláírható hivatalos ív menne ki. Inkább hiányzó
 * gomb.
 */
export const KIALLITO_NEVE_HIANYZIK_UZENET =
  'A nyomtatvány fejlécébe a kiállító hivatalos neve kerül, ezt viszont most nem sikerült ' +
  'betölteni — név nélküli hivatalos ívet pedig nem adunk ki. Frissítsd az oldalt, és ha újra ' +
  'ezt írja, ellenőrizd a beállításokban, hogy az egyházkerület hivatalos neve ki van-e töltve.'

export interface EvBeallitasBetoltes {
  /** Az adott év beállítás-sora, vagy `null` (az évet még nem nyitották meg). */
  row: BealitasRow | null
  /** `false` = a sor nem áll rendelkezésre — a nyomtatvány nem készíthető el. */
  ok: boolean
  /**
   * 2026-08-17 (kerületi S5): MIÉRT nem áll rendelkezésre (`ok === false`).
   *   · `'lekerdezes_hiba'`       — hálózat / RLS / hiányzó oszlop; újrapróbálható,
   *   · `'nincs_nyomtatvany_ag'`  — erre a szintre NINCS nyomtatvány-ág.
   * A kettő KÜLÖNBÖZŐ üzenetet érdemel: az elsőnél a „próbáld újra" a helyes
   * tanács, a másodiknál az félrevezető lenne (soha nem sikerülne).
   *
   * ⚠️ 2026-08-22 (kerületi S6) — MIÉRT MARAD BENT A MÁSODIK ÉRTÉK, MIUTÁN A
   *    KERÜLET MEGKAPTA A SAJÁT ÁGÁT. A mező S5-ben HOLT KÓD volt: a fájl négy
   *    helyen kitöltötte, de EGYETLEN hívó sem olvasta (mindkét dialógus egységes
   *    `hiba` állapotra képezte). Most a két érték KÜLÖN üzenetet kap mindkét
   *    nyomtatási központban, és a második értéknek VALÓDI termelője maradt:
   *    a lenti `default` ág. Az nem elméleti — a `scope` egy KLIENS-komponens
   *    propja: egy negyedik szint bevezetésekor a szerver már az új értéket adja,
   *    miközben a böngészőben még a régi bundle fut. Eddig ilyenkor a `default`
   *    DOBOTT, a külső `catch` pedig `'lekerdezes_hiba'`-vá szelídítette — vagyis
   *    a felhasználó ÖRÖKKÉ azt olvasta volna, hogy „próbáld újra".
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

      // ── EGYHÁZKERÜLET (2026-08-22, kerületi S6) ──────────────────────────────
      // A megyei ág HÁROMSOROS tükre: `district_bealitas` tábla, `district_id`
      // szűrő, `eve` év-oszlop (a gyülekezeti `bealitas.id` SZÖVEGES évével
      // szemben — a séma a 2026-08-17-egyhazkeruleti-S5b-penzugy-tablak.sql
      // 1/A blokkja, `eve integer NOT NULL` + UNIQUE(district_id, eve)).
      //
      // ⚠️ MIÉRT A `normalizeDioceseBealitas` A HELYES LEKÉPEZŐ ITT IS — és miért
      //    NEM nevezzük át, pedig a neve „diocese"-t mond:
      //    a `district_bealitas` a `diocese_bealitas` OSZLOPNÉV-HŰ tükre (magyar
      //    véglegesítés-, unlock- és határozat-oszlopok, `eve` int kulcs), a
      //    normalizáló pedig KIZÁRÓLAG oszlopnevek szerint dolgozik — nem tábla-
      //    és nem scope-függő. A szerver-oldali `initFinanceFelsoSzint`
      //    (penzugy/actions.ts) UGYANEZT a helpert hívja mindkét felső szintre,
      //    tehát a képernyő és a papír biztosan ugyanazt a sort olvassa. Egy
      //    átnevezés (vagy egy kerületi MÁSOLAT) pont ezt a garanciát bontaná meg,
      //    a projekt visszatérő hibaosztálya szerint („a második felület a régi
      //    implementációt őrzi"). A név félrevezető voltát a hívási hely
      //    kommentje oldja fel — ha a két séma valaha SZÉTHÚZ, ITT kell megállni,
      //    nem egy másolattal megkerülni.
      case 'district': {
        const { data, error } = await supabase
          .from('district_bealitas')
          // `select('*')` SZÁNDÉKOSAN — lásd a megyei ágnál.
          .select('*')
          .eq('district_id', scopeId)
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
        // FORDÍTÓI KAPU: negyedik szintnél itt fordítási hiba lesz, amíg a
        // szint tábla-ága be nem kerül.
        const _nemKezelt: never = scope
        // ⛔ FUTÁSIDŐBEN NEM DOBUNK (2026-08-22): a dobás a külső `catch`-en át
        //    `'lekerdezes_hiba'`-vá vált volna, és a felhasználó a „próbáld
        //    újra" tanácsot kapta volna egy olyan állapotra, ami sosem javul
        //    magától (régi kliens-bundle + új, még ág nélküli szint). A helyes
        //    válasz a fail-closed, ŐSZINTE ok.
        void _nemKezelt
        return { row: null, ok: false, hibaOk: 'nincs_nyomtatvany_ag' }
      }
    }
  } catch {
    return { row: null, ok: false, hibaOk: 'lekerdezes_hiba' }
  }
}
