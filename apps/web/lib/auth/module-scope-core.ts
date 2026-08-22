/**
 * MODUL-HATÓKÖR — A DÖNTÉSI MAG (2026-08-17, kerületi S5 szelet).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MI VAN EBBEN A FÁJLBAN, ÉS MIÉRT KÜLÖN
 * ════════════════════════════════════════════════════════════════════════════
 * HÁROM TISZTA függvény, mind a három EXHAUSTIVE `switch`:
 *   · `moduleScopeColumn`      — MELYIK OSZLOPRA szűr a scope-oszlopos tábla;
 *   · `iktatoSequenceRpcFor`   — MELYIK RPC osztja ki az IKTATÓSZÁMOT;
 *   · `altalanosOlvasoiUzenet` — a írás-tiltás tartalék magyar szövege.
 *
 * A gazda-modul (`module-scope.ts`) `import 'server-only'`-os láncot húz be
 * (Supabase szerver-kliens, effective-access, level-scope), ezért ott ezt a
 * három függvényt nem lehet önállóan lefordítani és futtatni. Ebben a fájlban
 * NINCS egyetlen futásidejű import sem, ezért a
 * `scripts/selftest-module-scope.mjs` önmagában transpilálja és futtatja.
 * Ugyanaz a bevett repó-minta, mint a `finance-scope-core.ts`, a
 * `display-scope-core.ts` és a `felterjesztes-allapot-core.ts` esetében.
 *
 * ⚠️ EBBE A FÁJLBA SOHA NE KERÜLJÖN PROJEKT-IMPORT. Az önellenőrzés
 *    fail-closed elbukik rá (érthető üzenettel), mert a mag import nélkül
 *    tesztelhető csak.
 *
 * A gazda-modul RE-EXPORTÁLJA mind a három függvényt és mind a három típust,
 * tehát a meglévő hívók (`leltar/actions.ts`, `iktato/actions.ts`,
 * `iktato/template-actions.ts`, `iktato/csatolmany-actions.ts`,
 * `iktato/szemely-actions.ts`, `iktato/qr-actions.ts`,
 * `lib/filing/sequence-preview.ts`, a két `page.tsx`) importja BYTE-RA
 * VÁLTOZATLAN marad.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ A TÜNET, AMI MIATT EZ EXHAUSTIVE SWITCH — NE ÍRD VISSZA `if`-RE
 * ════════════════════════════════════════════════════════════════════════════
 * A hívó oldalon ezek a leképezések eredetileg így éltek:
 *
 *     ctx.scope === 'diocese' ? rpc('next_iktato_sequence_dio') : rpc('next_iktato_sequence')
 *     …
 *     if (scope === 'diocese') { … } return gyulekezeti
 *
 * Ez NÉMA ADATVESZTÉS-CSAPDA. Amikor a `ModuleScope` unió HARMADIK értéket
 * kapott (`'district'` — a kerület saját leltárt és saját iktatót vezet, Endre
 * K2 döntése), A FORDÍTÓ NEM SZÓLT VOLNA EGY SZÓT SEM: az új szint csendben a
 * „minden más" ágra esik.
 *
 * ⛔ AZ IKTATÓSZÁMNÁL EZ VISSZAMENŐLEG JAVÍTHATATLAN. A kerületi irat a
 *   GYÜLEKEZETI számsorból (rosszabb esetben egy IDEGEN gyülekezet számsorából)
 *   kapna iktatószámot — vagyis DUPLIKÁLT IKTATÓSZÁM kerülne egy HIVATALOS
 *   IRATRA. Az iktatókönyv nem írható át utólag; a hibát nem lehet „kijavítani",
 *   csak együtt élni vele.
 *
 * ⇒ MIND A HÁROM FÜGGVÉNY EXHAUSTIVE SWITCH, `never`-ellenőrzésű `default`
 *   ággal. Ha valaki holnap NEGYEDIK szintet vesz fel a `ModuleScope` unióba és
 *   elfelejti itt bevezetni, a `const _nemKezelt: never = scope` értékadás
 *   FORDÍTÁSI HIBÁT ad. Fordítási hiba > néma adatvesztés.
 *
 * ⚠️ EGY KÉSŐBBI „EGYSZERŰSÍTÉS" NE ÍRJA VISSZA: a `default` ág és a `never`
 *    értékadás NEM fölösleges kód. Az a fordítói kapu maga.
 */

/**
 * A scope-oszlopos modulok (Leltár, Iktató, később Dokumentumtár) HÁROM
 * hatóköre. A pénzügytől eltérően itt NINCS külön tábla-készlet: mind a három
 * szint UGYANAZON a hat táblán él (leltar_tetelek, iktato, iktato_sablonok,
 * iktato_yearly_closures, iktato_csatolmany, iktato_sequence_pointers), csak a
 * SZŰRŐ-OSZLOP más.
 */
export type ModuleScope = 'congregation' | 'diocese' | 'district'

/**
 * A scope-oszlopos táblák SZŰRŐ-OSZLOPA. Külön, EXPORTÁLT típus, hogy a
 * továbbadó helyek (lib/filing/sequence-preview.ts `SequenceScopeKey.col`,
 * app/(dashboard)/leltar/actions.ts `fetchInventoryRowsCompat`) NE tartsanak
 * fenn saját, kézzel bővítendő unió-másolatot: ha ez a típus bővül, ott
 * FORDÍTÁSI HIBA lesz, nem néma „a district_id nem fér bele" csonkulás.
 */
export type ModuleScopeColumn = 'congregation_id' | 'diocese_id' | 'district_id'

/**
 * A scope → scope-oszlop leképezés EGYETLEN igazsága, exhaustive alakban.
 *
 * ⚠️ Ezt a függvényt a `getModuleScopeContext` maga is használja, tehát a
 * kontextus `scopeCol` mezője és ez a leképezés SOHA nem húzhat szét.
 */
export function moduleScopeColumn(scope: ModuleScope): ModuleScopeColumn {
  switch (scope) {
    case 'congregation':
      return 'congregation_id'
    case 'diocese':
      return 'diocese_id'
    case 'district':
      return 'district_id'
    default: {
      const _nemKezelt: never = scope
      throw new Error(`Ismeretlen modul-hatókör: ${String(_nemKezelt)}`)
    }
  }
}

/**
 * Az iktatószám-kiosztó RPC hívás-leírója.
 *
 * A három RPC (mind SECURITY DEFINER, INSERT … ON CONFLICT DO UPDATE RETURNING,
 * a jogosultságot a saját szerep-szűrt hatókör-függvényéhez kötve):
 *   · next_iktato_sequence      (p_congregation_id, p_year)
 *   · next_iktato_sequence_dio  (p_diocese_id,      p_year)
 *   · next_iktato_sequence_dis  (p_district_id,     p_year)  ← kerületi S5 SQL
 */
export interface IktatoSequenceRpcCall {
  fn: 'next_iktato_sequence' | 'next_iktato_sequence_dio' | 'next_iktato_sequence_dis'
  args: Record<string, string | number>
}

/**
 * A `iktatoSequenceRpcFor` bemenete. SZÁNDÉKOSAN önálló, minimális alak, nem a
 * teljes `ModuleScopeContext`: az a típus a Supabase szerver-klienst hordozza,
 * és azzal ez a mag nem maradhatna import-mentes. A teljes kontextus
 * STRUKTURÁLISAN illeszkedik rá, tehát a meglévő `iktatoSequenceRpcFor(ctx, ev)`
 * hívások változatlanul fordulnak.
 */
export interface ModuleScopeRef {
  scope: ModuleScope
  scopeId: string
}

/**
 * Az iktatószám-kiosztó RPC scope szerinti megválasztása.
 *
 * ⛔ EZ A FÁJL LEGDRÁGÁBB LEKÉPEZÉSE. A hívó oldalon ez eddig
 * `ctx.scope === 'diocese' ? rpc('…_dio') : rpc('…')` alakban élt — vagyis egy
 * új szint NÉMÁN a gyülekezeti RPC-re esett volna, ami a kerületi iratnak
 * GYÜLEKEZETI számsorból adott volna iktatószámot (rosszabb esetben egy idegen
 * gyülekezet számsorából): DUPLIKÁLT IKTATÓSZÁM egy HIVATALOS IRATON,
 * visszamenőleg javíthatatlanul. Az RPC-név és a paraméter-név ezért egy helyen,
 * fordító által őrzötten él.
 */
export function iktatoSequenceRpcFor(ctx: ModuleScopeRef, year: number): IktatoSequenceRpcCall {
  switch (ctx.scope) {
    case 'congregation':
      return { fn: 'next_iktato_sequence', args: { p_congregation_id: ctx.scopeId, p_year: year } }
    case 'diocese':
      return { fn: 'next_iktato_sequence_dio', args: { p_diocese_id: ctx.scopeId, p_year: year } }
    case 'district':
      return { fn: 'next_iktato_sequence_dis', args: { p_district_id: ctx.scopeId, p_year: year } }
    default: {
      const _nemKezelt: never = ctx.scope
      throw new Error(`Ismeretlen modul-hatókör: ${String(_nemKezelt)}`)
    }
  }
}

/**
 * A `moduleWriteBlock` (gazda-modul) TARTALÉK szövege, ha a hatókör-feloldó
 * valamiért nem adott indoklást. Szándékosan EXHAUSTIVE: egy negyedik szint ne
 * kapja némán a megyei szöveget („az egyházmegye adatait…"), ami a felhasználót
 * ROSSZ ÜGYINTÉZŐHÖZ küldené.
 *
 * ⚠️ A `congregation` és a `diocese` ág szövege BETŰRE a korábbi, egyetlen
 * közös tartalék-szöveg — a meglévő két szint viselkedése változatlan. (A
 * `congregation` ág gyakorlatilag elérhetetlen: ott a `canWrite` mindig `true`.)
 */
export function altalanosOlvasoiUzenet(scope: ModuleScope): string {
  switch (scope) {
    case 'congregation':
    case 'diocese':
      return (
        'Ellenőri (számvevői) nézetben vagy: az egyházmegye adatait megtekintheted, ' +
        'de nem módosíthatod. A rögzítés az esperes vagy az egyházmegyei ' +
        'adminisztrátor feladata.'
      )
    case 'district':
      return (
        'Ellenőri (számvevői) nézetben vagy: az egyházkerület adatait megtekintheted, ' +
        'de nem módosíthatod. A rögzítés az egyházkerületi adminisztrátor feladata.'
      )
    default: {
      const _nemKezelt: never = scope
      throw new Error(`Ismeretlen modul-hatókör: ${String(_nemKezelt)}`)
    }
  }
}
