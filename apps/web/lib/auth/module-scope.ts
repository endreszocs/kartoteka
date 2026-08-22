import 'server-only'

/**
 * ModuleScope — a scope-oszlopos modulok (Leltár, Iktató, később Dokumentumtár)
 * KÖZÖS hatókör-feloldója (egyházmegyei terv, 2.0 szakasz — S3 szelet).
 *
 * MIBEN MÁS, MINT A FINANCE-SCOPE: a pénzügy KÜLÖN diocese_* / district_*
 * táblákkal dolgozik (tablesFor-térkép, mert az oszlopkészlet eltér), a
 * leltár/iktató viszont UGYANAZON a táblán kap egy `diocese_id`, illetve
 * (2026-08-17, kerületi S5) egy `district_id` scope-oszlopot
 * (migration-docs/sql/2026-08-15-egyhazmegyei-scope-oszlopok.sql és a kerületi
 * S5 SQL). Ezért itt nincs tábla-térkép — csak a scope-oszlop neve és értéke:
 *
 *   const ctx = await getModuleScopeContext()
 *   if ('error' in ctx) return { error: ctx.error }
 *   const { data } = await ctx.supabase
 *     .from('leltar_tetelek')
 *     .select('*')
 *     .eq(ctx.scopeCol, ctx.scopeId)
 *
 * A FELOLDÁSI SORREND BETŰRE a getFinanceScopeContext-é
 * (lib/auth/finance-scope.ts:144) — annak a fájlnak a fejléce dokumentálja,
 * MIÉRT pont ez a sorrend (néma adatvesztés + skalár-hibaosztály javítása):
 *   · van aktív profil-szerep → AZ dönt (megyei hatókör csak akkor, ha az
 *     aktív szerep megyei ÉS megyei OLVASÓ szerep — esperes / megyei admin /
 *     számvevő; a `custom` megyei szerep NEM, mert az adatbázis sem ismeri el);
 *   · nincs egyetlen profile_roles sor sem („örökölt" felhasználó) → a
 *     szerep-szűrt skalár tartalék dönt;
 *   · különben a gyülekezeti fallback (effectiveCongregationId);
 *   · ha egyik sem oldható fel → { error } — SOHA nem szűretlen lekérdezés
 *     (fail-closed, a skalár-hatókör hibaosztály ellen).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2026-08-17 (KERÜLETI S5) — HARMADIK ÁG: EGYHÁZKERÜLET
 * ─────────────────────────────────────────────────────────────────────────────
 * A kerület — Endre K2 döntése szerint — a megyei minta szerint vezet SAJÁT
 * leltárt és SAJÁT iktatót, UGYANAZON a hat scope-oszlopos táblán
 * (leltar_tetelek, iktato, iktato_sablonok, iktato_yearly_closures,
 * iktato_csatolmany, iktato_sequence_pointers), `district_id` oszloppal.
 * A hatókör-feloldók a level-scope.ts kerületi (szerep-szűrt) párjai:
 *   · resolveDistrictReadScopeIds  ⇄ current_user_district_olvaso_ids()
 *   · resolveDistrictWriteScopeIds ⇄ current_user_district_ids()
 * A kerületi SZÁMVEVŐ (egyhazkeruleti_szamvevo) OLVAS, de NEM ír — pontosan
 * úgy, ahogy a megyei számvevő (canWrite === false + readOnlyReason).
 *
 * ⛔ MIÉRT EXHAUSTIVE MINDEN SCOPE-FÜGGŐ LEKÉPEZÉS — ÉS MIÉRT KÜLÖN MAGBAN
 * ─────────────────────────────────────────────────────────────────────────
 * A 3. szint építésekor mért hibaosztály („néma gyülekezeti visszaesés"): a
 * scope-függő leképezések `if (scope === 'diocese') { … } return gyulekezeti`
 * alakban íródtak. Ha ilyen kód mellé CSAK a típus-unió bővül egy új szinttel,
 * A FORDÍTÓ NEM SZÓL — az új szint némán a GYÜLEKEZETI ágra esik, és a kerületi
 * leltári tétel a gyülekezet sorai közé íródna (az iktatószámnál ennél is
 * rosszabb: DUPLIKÁLT SZÁM egy HIVATALOS IRATON, visszamenőleg javíthatatlanul).
 * Ezért MINDEN scope-függő leképezés `switch` + `default: const _n: never = scope`
 * alakú: egy jövőbeli NEGYEDIK szint FORDÍTÁSI HIBÁT ad, nem néma adatvesztést.
 * Ugyanez a szabály a lib/auth/finance-scope.ts `tablesFor` / `yearValueFor`
 * függvényeire.
 *
 * 2026-08-17 (kerületi S5, 4. hullám): a három tiszta leképezés
 * (`moduleScopeColumn`, `iktatoSequenceRpcFor`, `altalanosOlvasoiUzenet`) és a
 * hozzájuk tartozó típusok átköltöztek az IMPORT-MENTES
 * `lib/auth/module-scope-core.ts` magba, mert ez a fájl `import 'server-only'`-t
 * húz, és így önteszt nem tudta betölteni — a szabályt CSAK a `tsc` őrizte.
 * A magot a `scripts/selftest-module-scope.mjs` futásidőben is végigméri.
 * Ez a fájl RE-EXPORTÁLJA őket, tehát egyetlen meglévő hívó importja sem
 * változik. A szerver-oldali kontextus-feloldás (`getModuleScopeContext`) és az
 * írási kapu (`moduleWriteBlock`) MARADT itt.
 */

import type { createClient } from '@/lib/supabase/server'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canWriteDioceseScope,
  canWriteDistrictScope,
  describeDioceseWriteBlock,
  describeDistrictWriteBlock,
  resolveDioceseReadScopeIds,
  resolveDistrictReadScopeIds,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'
// A HÁROM tiszta, exhaustive leképezés az IMPORT-MENTES magban él, hogy a
// `scripts/selftest-module-scope.mjs` önállóan betölthesse és végigmérhesse
// (ez a fájl `import 'server-only'`-t húz, ezért ő maga nem tesztelhető így).
import {
  altalanosOlvasoiUzenet,
  moduleScopeColumn,
  type ModuleScope,
  type ModuleScopeColumn,
} from '@/lib/auth/module-scope-core'

// RE-EXPORT — a meglévő hívók (`leltar/actions.ts`, `iktato/actions.ts`,
// `iktato/template-actions.ts`, `iktato/csatolmany-actions.ts`,
// `iktato/szemely-actions.ts`, `iktato/qr-actions.ts`,
// `lib/filing/sequence-preview.ts`, a két `page.tsx`) importja BYTE-RA
// VÁLTOZATLAN marad. ⚠️ Ide SOHA ne kerüljön helyi MÁSOLAT a mag függvényeiből:
// az visszahozná a „két, széthúzó implementáció" hibaosztályt.
export {
  altalanosOlvasoiUzenet,
  iktatoSequenceRpcFor,
  moduleScopeColumn,
} from '@/lib/auth/module-scope-core'
export type {
  IktatoSequenceRpcCall,
  ModuleScope,
  ModuleScopeColumn,
  ModuleScopeRef,
} from '@/lib/auth/module-scope-core'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface ModuleScopeContext {
  supabase: SupabaseServerClient
  userId: string
  scope: ModuleScope
  /**
   * A scope-oszlop neve a scope-oszlopos táblákon (leltar_tetelek, iktato,
   * iktato_sablonok, iktato_yearly_closures, iktato_csatolmany,
   * iktato_sequence_pointers). A lekérdezés MINDIG
   * `.eq(ctx.scopeCol, ctx.scopeId)`-vel szűr — soha nem kézzel írt
   * 'congregation_id' literállal, mert az a diocese-/district-módban némán a
   * MÁSIK scope oszlopára szűrne (0 sor, hibaüzenet nélkül).
   *
   * Az értéke MINDIG a `moduleScopeColumn(scope)` eredménye (exhaustive).
   */
  scopeCol: ModuleScopeColumn
  /**
   * congregation_id, diocese_id vagy district_id (UUID) — mindig kitöltött
   * (fail-closed).
   */
  scopeId: string
  /**
   * A gyülekezet / egyházmegye / egyházkerület MEGJELENÍTENDŐ neve (hero-cím,
   * nyomtatvány-felirat). Egyházmegyénél a formatEgyhazmegyeNev duplázás-
   * védőjén át; kerületnél a `districts.name` NYERSEN (a kerület-nevek a
   * törzsadatban már teljes alakúak, és a megyeihez hasonló toldat-heurisztika
   * itt csak félrevezető feliratot gyártana).
   * CSAK felirat — jogosultságról soha nem dönt.
   */
  scopeName: string | null
  /**
   * `false` az egyházmegyei és az egyházkerületi SZÁMVEVŐNÉL (ellenőri szerep):
   * a megye / kerület leltárát / iktatóját megnézheti, de nem rögzíthet és nem
   * törölhet. Az adatbázis is ezt kényszeríti (a diocese-/district-láb írási
   * policyje a szerep-szűrt current_user_diocese_ids() / current_user_district_ids()
   * függvényt hívja, amiben a számvevő nincs benne) — ez a mező azért van, hogy
   * a FELÜLET ELŐRE letilthassa a gombokat, és az action beszédes magyar hibát
   * adjon néma 0-soros mentés helyett.
   */
  canWrite: boolean
  /** Beszédes magyar magyarázat, ha `canWrite === false` — különben null. */
  readOnlyReason: string | null
}

/**
 * A scope-tudatos kontextus feloldása. `{ error }` = nincs feloldható hatókör —
 * a hívó KÖTELES az errort visszaadni / üres állapotot mutatni, és TILOS
 * szűretlen lekérdezést futtatnia.
 */
export async function getModuleScopeContext(): Promise<
  ModuleScopeContext | { error: string }
> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  // ── 0) ADMIN-OVERRIDE ELSŐBBSÉGI KAPU („Belépés a gyülekezetbe") ──────────
  //
  // A finance-scope.ts azonos nevű kapujának TÜKRE — a RÉSZLETES MIÉRT (a három
  // ütköző sor, a bizonyítás, hogy a megyei és a gyülekezeti ág változatlan) ott
  // van leírva, itt szándékosan nem duplikáljuk. A LÉNYEG:
  //
  //   · az `effective-access.ts:404-411` már kimondja, hogy „az AKTÍV
  //     admin-override MINDEN más szabályt megelőz" — ott az
  //     `effectiveCongregationId` már az override gyülekezetéé;
  //   · a lenti 2) district-ág viszont 2026-08-17-ig nem létezett, és az
  //     `egyhazkeruleti_admin` EGYSZERRE szerepel az `overrideAllowed`
  //     feltételében (effective-access.ts:381-382) és a DISTRICT_READ_ROLES-ban
  //     (level-scope.ts:433), az override pedig NEM váltja a profilt
  //     (`activeProfileRole.scope` marad `'district'`).
  //
  // ITT A TÉT NAGYOBB, MINT A PÉNZÜGYNÉL: a `leltar/page.tsx:42` és az
  // `iktato/page.tsx` az `effectiveCongregationId`-t nézi, ami az override miatt
  // NEM null → a GYÜLEKEZETI felület renderelődik, a gyülekezet NEVÉVEL és
  // scope-prop nélkül (= `'congregation'` alapérték), miközben a szerver-akciók
  // e nélkül a kapu nélkül DISTRICT hatókört kapnának. A lista, a mentés és az
  // ikta­tószám-előnézet a KERÜLET sorain futna — a gyülekezet neve alatt.
  // Iktatószámnál ez visszamenőleg javíthatatlan: HIVATALOS IRATRA kerülő szám.
  //
  // A hatókört itt nem ellenőrizzük újra: a `getActiveOverride` a sor
  // felhasználásakor futtatja az `assertCongregationInScope`-ot, és hibánál
  // `{ active: false }`-t ad (fail-closed).
  //
  // ⚠️ MIÉRT EGYETLEN KONSTRUKTOR (`gyulekezetiKontextus`) ÉS NEM KÉT
  //    KÉZZEL ÍRT `return`: a kapu és a lenti 3) fallback UGYANAZT a gyülekezeti
  //    kontextust adja. Két külön objektum-literál pontosan az a „két, széthúzó
  //    implementáció" hibaosztály, ami ellen ez az egész fájl épült: aki egyszer
  //    új mezőt vesz fel a `ModuleScopeContext`-be, a másik ágat elfelejtené —
  //    és az override-os úton más kontextus születne, mint a rendes gyülekezetin.
  //    Így a `scopeCol` is bizonyítottan EGY helyről, a mag `moduleScopeColumn`
  //    leképezéséből jön (a kézzel írt 'congregation_id' literál némán a MÁSIK
  //    scope oszlopára szűrne).
  const felhasznaloId = access.user.id
  const gyulekezetiKontextus = (scopeId: string): ModuleScopeContext => ({
    supabase: access.supabase,
    userId: felhasznaloId,
    scope: 'congregation',
    scopeCol: moduleScopeColumn('congregation'),
    scopeId,
    scopeName: access.congregationName,
    // A gyülekezeti szint írás-korlátait a meglévő szerepkör-rétegek kezelik —
    // ez a mező kizárólag a megyei / kerületi ellenőri (számvevői) esetről szól.
    canWrite: true,
    readOnlyReason: null,
  })

  const override = access.override
  if (override.active && override.congregationId) {
    // A belépett admin a GYÜLEKEZET ügyintézőjeként jár el, nem ellenőrként.
    return gyulekezetiKontextus(override.congregationId)
  }

  // ── 1) Diocese scope — a finance-scope.ts:192-198 diszkriminátora BETŰRE ──
  // (aktív szerep dönt; szerep-szűrt skalár tartalék CSAK profile_roles-mentes
  // „örökölt" felhasználónál — a részletes MIÉRT a finance-scope.ts-ben él,
  // itt szándékosan nem duplikáljuk a hosszú kommentet).
  const dioceseReadIds = resolveDioceseReadScopeIds(access)
  const active = access.activeProfileRole
  const dioceseId: string | null = active
    ? active.scope === 'diocese' && active.scopeId && dioceseReadIds.includes(active.scopeId)
      ? active.scopeId
      : null
    : (dioceseReadIds[0] ?? null)

  if (dioceseId) {
    // Öv-és-nadrágtartó (a finance-scope mintája): a fenti ág konstrukció
    // szerint már csak szerep-szűrt megyét ad — de ha valaki egyszer átírja,
    // itt fail-closed megállunk.
    if (!dioceseReadIds.includes(dioceseId)) {
      return { error: 'Nincs jogosultság az egyházmegyei adatokhoz.' }
    }

    // Név-lekérdezés — KIZÁRÓLAG felirat, ezért az elnyelt hiba nem adhat
    // hozzáférést (a jogosultsági ág fentebb már fail-closed lezárult).
    let scopeName: string | null = null
    try {
      const { data } = await access.supabase
        .from('dioceses')
        .select('name')
        .eq('id', dioceseId)
        .maybeSingle()
      const nyers = (data as { name?: string } | null)?.name ?? null
      scopeName = nyers ? formatEgyhazmegyeNev(nyers) : null
    } catch {
      scopeName = null
    }

    // A dioceseId átadása fontos: aki az egyik megyében esperes, a másikban
    // számvevő, az CSAK az elsőben írhat.
    const canWrite = canWriteDioceseScope(access, dioceseId)

    return {
      supabase: access.supabase,
      userId: access.user.id,
      scope: 'diocese',
      scopeCol: moduleScopeColumn('diocese'),
      scopeId: dioceseId,
      scopeName,
      canWrite,
      readOnlyReason: canWrite ? null : describeDioceseWriteBlock(access, dioceseId),
    }
  }

  // ── 2) District scope (2026-08-17, kerületi S5) — a fenti megyei ág TÜKRE ──
  //
  // MIÉRT A MEGYEI ÁG UTÁN ÉS NEM ELŐTTE (a sorrend BIZONYÍTHATÓAN közömbös):
  // a két ág diszkriminátora KIZÁRJA egymást. Ha van aktív profil-szerep, az
  // vagy `diocese`, vagy `district` hatókörű — mindkettő nem lehet. Ha nincs
  // egyetlen profile_roles sor sem („örökölt" felhasználó), a skalár tartalék
  // SZEREP-SZŰRT: a megyei fallback csak esperes / egyházmegyei admin /
  // egyházmegyei számvevő szerepre lő (DIOCESE_READ_ROLES), a kerületi csak
  // egyházkerületi admin / egyházkerületi számvevő szerepre (DISTRICT_READ_ROLES)
  // — a két lista DISZJUNKT, egy `profiles.role` skalár egyszerre nem lehet
  // mindkettőben. A megyei blokk tehát BYTE-RA változatlan maradt, és a
  // kerületi ág csak olyan hívóra fut, aki eddig a gyülekezeti fallbackre esett
  // vagy hibát kapott.
  const districtReadIds = resolveDistrictReadScopeIds(access)
  const districtId: string | null = active
    ? active.scope === 'district' && active.scopeId && districtReadIds.includes(active.scopeId)
      ? active.scopeId
      : null
    : (districtReadIds[0] ?? null)

  if (districtId) {
    // Öv-és-nadrágtartó (a megyei ág mintája): a fenti ág konstrukció szerint
    // már csak szerep-szűrt kerületet ad — de ha valaki egyszer átírja, itt
    // fail-closed megállunk.
    //
    // ⚠️ ITT SZÁNDÉKOSAN NEM a `canReadDistrictScope()` a kapu: az `admin` /
    // `master` szerepre hatókör NÉLKÜL is `true`-t ad, vagyis egy rendszergazda
    // egy tetszőleges kerület leltárába írna a saját felületéről. A rendszergazda
    // a SAJÁT kerületi szerepén keresztül jön be — ugyanez a megyei ág döntése.
    if (!districtReadIds.includes(districtId)) {
      return { error: 'Nincs jogosultság az egyházkerületi adatokhoz.' }
    }

    // Név-lekérdezés — KIZÁRÓLAG felirat, ezért az elnyelt hiba nem adhat
    // hozzáférést (a jogosultsági ág fentebb már fail-closed lezárult).
    let scopeName: string | null = null
    try {
      const { data } = await access.supabase
        .from('districts')
        .select('name')
        .eq('id', districtId)
        .maybeSingle()
      const nyers = (data as { name?: string } | null)?.name ?? null
      scopeName = nyers ? nyers.trim() || null : null
    } catch {
      scopeName = null
    }

    // A districtId átadása fontos: aki az egyik kerületben adminisztrátor, a
    // másikban számvevő, az CSAK az elsőben írhat.
    const canWrite = canWriteDistrictScope(access, districtId)

    return {
      supabase: access.supabase,
      userId: access.user.id,
      scope: 'district',
      scopeCol: moduleScopeColumn('district'),
      scopeId: districtId,
      scopeName,
      canWrite,
      readOnlyReason: canWrite ? null : describeDistrictWriteBlock(access, districtId),
    }
  }

  // ── 3) Gyülekezeti fallback ──
  // A visszaadott kontextus BYTE-RA ugyanaz, mint korábban — csak a fenti
  // `gyulekezetiKontextus` konstruktoron át, hogy a 0) override-kapuval
  // egyetlen forrásból éljen (lásd ott a MIÉRT-et).
  if (access.effectiveCongregationId) {
    return gyulekezetiKontextus(access.effectiveCongregationId)
  }

  return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület a profilban.' }
}

/**
 * ÍRÁSI KAPU a scope-oszlopos modulok mutáló akcióihoz — a financeWriteBlock
 * (lib/auth/finance-scope.ts) párja. MINDEN mutáló action ELSŐ lépéseként:
 *
 *   const blocked = moduleWriteBlock(ctx)
 *   if (blocked) return blocked
 *
 * Enélkül a számvevő mentése az RLS-en bukna el — nyers, érthetetlen
 * PostgREST-hibával vagy néma 0-soros update-tel.
 */
export function moduleWriteBlock(ctx: ModuleScopeContext): { error: string } | null {
  if (ctx.canWrite) return null
  // A tartalék szöveg (`altalanosOlvasoiUzenet`) a magban, EXHAUSTIVE alakban él
  // — egy negyedik szint ne kapja némán a megyei szöveget („az egyházmegye
  // adatait…"), ami a felhasználót ROSSZ ÜGYINTÉZŐHÖZ küldené.
  return { error: ctx.readOnlyReason ?? altalanosOlvasoiUzenet(ctx.scope) }
}
