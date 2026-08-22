/**
 * FINANCE SCOPE — A DÖNTÉSI MAG (2026-08-17, kerületi S5 szelet).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MI VAN EBBEN A FÁJLBAN, ÉS MIÉRT KÜLÖN
 * ════════════════════════════════════════════════════════════════════════════
 * Két TISZTA függvény: `tablesFor` és `yearValueFor`. Ezek döntik el, hogy egy
 * pénzügyi művelet MELYIK TÁBLÁRA ír, és milyen típusú év-értékkel szűr.
 *
 * A gazda-modul (`finance-scope.ts`) `import 'server-only'`-os láncot húz be
 * (Supabase szerver-kliens, effective-access, level-scope), ezért ott ezt a két
 * függvényt nem lehet önállóan lefordítani és tesztelni. Ebben a fájlban NINCS
 * egyetlen futásidejű import sem, ezért a `scripts/selftest-finance-scope.mjs`
 * önmagában transpilálja és futtatja. Ugyanaz a bevett repó-minta, mint a
 * `display-scope-core.ts` és a `felterjesztes-allapot-core.ts` esetében.
 *
 * ⚠️ EBBE A FÁJLBA SOHA NE KERÜLJÖN PROJEKT-IMPORT. Az önellenőrzés
 *    fail-closed elbukik rá (érthető üzenettel), mert a mag import nélkül
 *    tesztelhető csak.
 *
 * A gazda-modul RE-EXPORTÁLJA mindkét függvényt és mindkét típust, tehát a
 * ~40 meglévő hívó (`penzugy/actions.ts`, `edit-storno-actions.ts`, …)
 * importja BYTE-RA VÁLTOZATLAN marad.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ A TÜNET, AMI MIATT EZ EXHAUSTIVE SWITCH — NE ÍRD VISSZA `if`-RE
 * ════════════════════════════════════════════════════════════════════════════
 * A `tablesFor` 2026-08-17 előtt így nézett ki:
 *
 *     if (scope === 'diocese') { return { …megyei… } }
 *     return { …gyülekezeti… }          // ← a „minden más" ág
 *
 * a `yearValueFor` pedig így:
 *
 *     return scope === 'diocese' ? year : String(year)
 *
 * Ez a két sor NÉMA ADATVESZTÉS-CSAPDA. Amikor a `FinanceScope` unió-típus egy
 * HARMADIK értéket kap (`'district'` — a kerület saját könyvet vezet, K2), a
 * FORDÍTÓ NEM SZÓL EGY SZÓT SEM: az új scope csendben a „minden más" ágra esik,
 * és a KERÜLETI KÖNYVELÉS A GYÜLEKEZETI `befizetes` / `kiadas` TÁBLÁKBA ÍRNA.
 * Nem hibaüzenet, nem üres lista: rossz helyre könyvelt, hivatalos pénz — pont
 * az a hibaosztály, amit a projekt már kétszer megszenvedett.
 *
 * ⇒ MINDKÉT FÜGGVÉNY EXHAUSTIVE SWITCH, `never`-ellenőrzésű `default` ággal.
 *   Ha valaki holnap NEGYEDIK szintet vesz fel a `FinanceScope` unióba és
 *   elfelejti itt bevezetni, a `const _nemLehet: never = scope` értékadás
 *   FORDÍTÁSI HIBÁT ad. Fordítási hiba > néma adatvesztés.
 *
 * ⚠️ EGY KÉSŐBBI „EGYSZERŰSÍTÉS" NE ÍRJA VISSZA: a `default` ág és a `never`
 *    értékadás NEM fölösleges kód. Az a fordítói kapu maga.
 */

/**
 * A pénzügyi modul HÁROM hatóköre. Mindegyiknek SAJÁT tábla-készlete van
 * (nem scope-oszlopa!), mert az oszlopkészletük eltér:
 *   · `congregation` — a gyülekezet könyvei (`befizetes`, `kiadas`, …)
 *   · `diocese`      — az egyházmegye könyvei (`diocese_*`, 2026-08-15)
 *   · `district`     — az egyházkerület könyvei (`district_*`, 2026-08-17, K2)
 */
export type FinanceScope = 'congregation' | 'diocese' | 'district'

export interface FinanceScopeTableMap {
  /** Fő bevételi tábla */
  befizetes: 'befizetes' | 'diocese_befizetes' | 'district_befizetes'
  /** Fő kiadási tábla */
  kiadas: 'kiadas' | 'diocese_kiadas' | 'district_kiadas'
  /** Éves konfig (számadás/költségvetés véglegesítési flag) */
  bealitas: 'bealitas' | 'diocese_bealitas' | 'district_bealitas'
  /** Költségvetési tervezés */
  koltsegvetes: 'koltsegvetes' | 'diocese_koltsegvetes' | 'district_koltsegvetes'
  /** Éves jelentés snapshot */
  annualReport: 'annual_reports' | 'diocese_annual_reports' | 'district_annual_reports'
  /** Scope szerinti oszlop: congregation_id, diocese_id vagy district_id */
  scopeCol: 'congregation_id' | 'diocese_id' | 'district_id'
  /** bealitas PK: 'id' (string év) vs 'eve' (int) — eltér! */
  yearColBealitas: 'id' | 'eve'
  /** koltsegvetes PK: 'bealitasid' (string) vs 'eve' (int) — eltér! */
  yearColKtvs: 'bealitasid' | 'eve'
  /** Számadás véglegesítés flag */
  finalizedCol: 'accounting_finalized' | 'szamadas_veglegesitve'
  /** Költségvetés véglegesítés flag */
  budgetFinalizedCol: 'budget_finalized' | 'koltsegvetes_veglegesitve'
  /** A tranzakciós tábla kategória-oszlopa — int ref vs string kód */
  categoryColBefizetes: 'id_befizetescel' | 'id_szamadasicel'
  categoryColKiadas: 'id_kiadascel' | 'id_szamadasicel'
}

/**
 * Visszaadja a scope alapú tábla-nevek és oszlop-nevek hash-ét.
 * Pure függvény, side-effect nélkül.
 *
 * ⚠️ EXHAUSTIVE SWITCH — a MIÉRT a fájl fejlécében. Röviden: `if/else`-szel egy
 *    új scope NÉMÁN a gyülekezeti táblákra esne, és a felsőbb szint pénze a
 *    gyülekezet könyveibe kerülne. Ne alakítsd vissza.
 */
export function tablesFor(scope: FinanceScope): FinanceScopeTableMap {
  switch (scope) {
    // ── EGYHÁZMEGYE (2026-08-15) ────────────────────────────────────────────
    // ⚠️ Ez az ág BYTE-RA azonos a 2026-08-15 óta élesben futóval. Ha itt
    //    bármit elmozdítasz, a 2. szint könyvelése törik el — észrevétlenül.
    case 'diocese':
      return {
        befizetes: 'diocese_befizetes',
        kiadas: 'diocese_kiadas',
        bealitas: 'diocese_bealitas',
        koltsegvetes: 'diocese_koltsegvetes',
        annualReport: 'diocese_annual_reports',
        scopeCol: 'diocese_id',
        yearColBealitas: 'eve',
        yearColKtvs: 'eve',
        finalizedCol: 'szamadas_veglegesitve',
        budgetFinalizedCol: 'koltsegvetes_veglegesitve',
        categoryColBefizetes: 'id_szamadasicel',
        categoryColKiadas: 'id_szamadasicel',
      }

    // ── EGYHÁZKERÜLET (2026-08-17, K2 döntés) ───────────────────────────────
    // A kerület UGYANÚGY vezet saját könyvet, ahogy a megye, ezért a térkép a
    // megyei TÜKRE: azonos oszlop-alak (`eve` int PK, `id_szamadasicel`
    // kategória-kód, magyar véglegesítés-flagek), csak `district_` előtaggal
    // és `district_id` scope-oszloppal.
    //
    // ⚠️ A `szamadasicel.szint` ehhez az ághoz a 'kerulet' érték (a CHECK már
    //    engedi) — a szint-választást a gazda-modul `szamadasicelSzint` mezője
    //    adja, nem ez a térkép.
    case 'district':
      return {
        befizetes: 'district_befizetes',
        kiadas: 'district_kiadas',
        bealitas: 'district_bealitas',
        koltsegvetes: 'district_koltsegvetes',
        annualReport: 'district_annual_reports',
        scopeCol: 'district_id',
        yearColBealitas: 'eve',
        yearColKtvs: 'eve',
        finalizedCol: 'szamadas_veglegesitve',
        budgetFinalizedCol: 'koltsegvetes_veglegesitve',
        categoryColBefizetes: 'id_szamadasicel',
        categoryColKiadas: 'id_szamadasicel',
      }

    // ── GYÜLEKEZET (a legrégebbi, élesben futó alak) ────────────────────────
    // ⚠️ Ez az ág korábban a függvény „minden más" visszatérése volt. Most
    //    NEVESÍTETT case: pontosan ezért nem eshet rá többé véletlenül semmi.
    case 'congregation':
      return {
        befizetes: 'befizetes',
        kiadas: 'kiadas',
        bealitas: 'bealitas',
        koltsegvetes: 'koltsegvetes',
        annualReport: 'annual_reports',
        scopeCol: 'congregation_id',
        yearColBealitas: 'id',
        yearColKtvs: 'bealitasid',
        finalizedCol: 'accounting_finalized',
        budgetFinalizedCol: 'budget_finalized',
        categoryColBefizetes: 'id_befizetescel',
        categoryColKiadas: 'id_kiadascel',
      }

    default: {
      // ⛔ FORDÍTÓI KAPU. Ha a `FinanceScope` unió bővül és ide nem kerül új
      //    `case`, ez az értékadás FORDÍTÁSI HIBÁT ad. Futásidőben pedig
      //    fail-closed dobunk — soha nem esünk vissza némán a gyülekezeti
      //    táblákra (az volt az eredeti csapda).
      const _nemLehet: never = scope
      throw new Error(`Ismeretlen pénzügyi hatókör: ${String(_nemLehet)}`)
    }
  }
}

/**
 * Az év érték scope-helyes reprezentációja:
 *   - congregation: string (pl. "2026")  — a `bealitas.id` szöveges PK miatt
 *   - diocese:      number (2026)        — a `diocese_bealitas.eve` int PK miatt
 *   - district:     number (2026)        — a `district_bealitas.eve` int PK miatt
 *
 * ⚠️ EXHAUSTIVE SWITCH, ugyanabból az okból, mint a `tablesFor`. A korábbi
 *    `scope === 'diocese' ? year : String(year)` alak egy új scope-nál NÉMÁN
 *    STRINGET adott volna egy int oszlopra: a PostgREST `.eq('eve', '2026')`
 *    hívás nem feltétlenül hibázik, csak 0 sort ad — vagyis a zárás-ellenőrzés
 *    „nincs véglegesítve"-t mondana egy lezárt évre. Ne alakítsd vissza
 *    ternáriussá.
 */
export function yearValueFor(scope: FinanceScope, year: number): string | number {
  switch (scope) {
    case 'diocese':
      return year
    case 'district':
      return year
    case 'congregation':
      return String(year)
    default: {
      const _nemLehet: never = scope
      throw new Error(`Ismeretlen pénzügyi hatókör: ${String(_nemLehet)}`)
    }
  }
}
