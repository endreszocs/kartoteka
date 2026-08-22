/**
 * FinanceScope — a pénzügyi modul scope-tudatos kontextus helper-e.
 *
 * 2026-04-18 REFAKTOR (Endre): a gyülekezeti és egyházmegyei pénzügyi UI
 * ugyanaz a FinanceTabs komponens, az action-ök pedig scope alapján döntik
 * el, hogy a `befizetes`/`kiadas`/`bealitas`/`koltsegvetes`/`annual_reports`
 * táblákra, vagy a `diocese_befizetes`/.../`diocese_annual_reports` táblákra
 * írnak.
 *
 * 2026-08-17 (kerületi S5, Endre K2 döntése): HARMADIK ÁG — az EGYHÁZKERÜLET
 * ugyanúgy vezet saját könyvet (számadás, költségvetés), ahogy a megye, ezért
 * a `district_befizetes`/.../`district_annual_reports` táblákat kapja. A
 * tábla-térkép a magban van (`finance-scope-core.ts`), és ott EXHAUSTIVE
 * SWITCH — lásd ott a részletes MIÉRT-et (néma adatvesztés-csapda).
 *
 * Használat (szerver akció):
 *   const ctx = await getFinanceScopeContext()
 *   if ('error' in ctx) return { error: ctx.error }
 *   const T = tablesFor(ctx.scope)
 *   const { data } = await ctx.supabase
 *     .from(T.befizetes)
 *     .select('*')
 *     .eq(T.scopeCol, ctx.scopeId)
 */

import type { createClient } from '@/lib/supabase/server'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
// 2026-08-11 (6. kör): a hatókör-feloldás KANONIKUS forrása. Lásd a lenti
// `getFinanceScopeContext` kommentjét — ez a fájl eddig SAJÁT, szűkebb
// feloldást használt, és ez néma adatvesztéshez vezetett.
import {
  canWriteDioceseScope,
  canWriteDistrictScope,
  describeDioceseWriteBlock,
  describeDistrictWriteBlock,
  resolveDioceseReadScopeIds,
  resolveDistrictReadScopeIds,
} from '@/lib/auth/level-scope'
// 2026-08-17 (kerületi S5): a scope → tábla/év leképezés a MAGBA költözött.
// MIÉRT: ez a két függvény TISZTA, de ez a fájl `server-only` láncot húz be,
// ezért önállóan nem volt tesztelhető — a `finance-scope-core.ts` import-mentes,
// és a `scripts/selftest-finance-scope.mjs` azt fordítja/futtatja.
import {
  tablesFor,
  yearValueFor,
  type FinanceScope,
} from '@/lib/auth/finance-scope-core'

// A HÍVÓK IMPORTJA VÁLTOZATLAN: a ~40 meglévő hívó továbbra is
// `from '@/lib/auth/finance-scope'`-ból veszi mindkét függvényt és mindkét
// típust. Ez a re-export a mag kiemelésének ára — ne töröld.
export { tablesFor, yearValueFor }
export type { FinanceScope, FinanceScopeTableMap } from '@/lib/auth/finance-scope-core'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface FinanceScopeContext {
  supabase: SupabaseServerClient
  userId: string
  scope: FinanceScope
  /** congregation_id, diocese_id vagy district_id (UUID) */
  scopeId: string
  /** gyülekezet, egyházmegye vagy egyházkerület neve — UI-ra és logra */
  scopeName: string | null
  /** A szamadasicel.szint értéke, ami scope-ban releváns */
  szamadasicelSzint: 'gyulekezet' | 'egyhazmegye' | 'kerulet'
  /**
   * 2026-08-11 (számvevő-kör): CSAK OLVASHATÓ-e ez a pénzügyi kontextus?
   *
   * `true` az egyházmegyei számvevőnél (ellenőri szerep): a megye könyveit
   * megnézheti, de nem rögzíthet, nem javíthat, nem véglegesíthet. Az adatbázis
   * is ezt kényszeríti (RESTRICTIVE írás-tiltó policy a `diocese_*` táblákon,
   * lásd migration-docs/sql/2026-08-11-szamvevo-megyei-hozzaferes.sql 1/C) —
   * ez a mező azért van, hogy a FELÜLET ELŐRE letilthassa a mentő gombokat,
   * és ne egy néma, 0 sort érintő mentés után derüljön ki a dolog.
   *
   * 2026-08-17 (kerületi S5): UGYANEZ a KERÜLETI SZÁMVEVŐRE is. Ő a kerület
   * könyveit megnézheti és kinyomtathatja, de nem rögzít és nem véglegesít —
   * az ellenőrzés és a rögzítés szándékosan két külön kézben van.
   */
  readOnly: boolean
  /**
   * Beszédes magyar magyarázat, ha `readOnly === true` — tooltipre és
   * `{ error }`-ra egyaránt. `null`, ha a hívó írhat.
   */
  readOnlyReason: string | null
}

/**
 * ⚠️ A `FinanceScopeTableMap`, a `tablesFor` és a `yearValueFor` 2026-08-17 óta
 *    a `finance-scope-core.ts`-ben él (import-mentes mag, önteszttel) — feljebb
 *    re-exportáljuk őket, tehát a hívók importja VÁLTOZATLAN. A MIÉRT ott van
 *    leírva: `if/else`-ből EXHAUSTIVE SWITCH lett, mert egy új scope különben
 *    NÉMÁN a gyülekezeti táblákba könyvelt volna. Ne másold vissza ide.
 */

/**
 * A scope-aware kontextus lekérdezése. A hívó oldalon az `activeProfileRole`
 * szerint választ:
 *   - ha `activeProfileRole.scope === 'diocese'` + scopeId + jogosultság
 *     → diocese-kontextus a scope_id-val
 *   - ha `activeProfileRole.scope === 'district'` + scopeId + jogosultság
 *     → district-kontextus a scope_id-val (2026-08-17, kerületi S5 / K2)
 *   - különben a meglévő `effectiveCongregationId` fallback
 *
 * @returns FinanceScopeContext vagy `{ error }` objektum
 */
export async function getFinanceScopeContext(): Promise<
  FinanceScopeContext | { error: string }
> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  // ── 0) ADMIN-OVERRIDE ELSŐBBSÉGI KAPU („Belépés a gyülekezetbe") ──────────
  //
  // ⚠️ EZ A KAPU A KERÜLETI S5 SZELET ÖNVÉDELME. A lenti 2) district-ág
  // 2026-08-17-ig NEM LÉTEZETT (origin/main), és a beszúrása PONTOSAN EGY
  // szerepnél ütközik az aktív admin-override-dal: az `egyhazkeruleti_admin`-nál.
  //
  // AZ ÜTKÖZÉS KÉNYSZERŰ, NEM SZÉLSŐSÉGES ESET — a három sor, ami előírja:
  //   · effective-access.ts:381-382 —
  //       overrideAllowed = !missingPrimaryRole && (master ? godModeActive : admin || egyhazkeruletiAdmin)
  //     tehát a „Belépés a gyülekezetbe" gombot a KERÜLETI ADMIN is használhatja;
  //   · level-scope.ts:433 — DISTRICT_READ_ROLES = ['egyhazkeruleti_admin',
  //     'egyhazkeruleti_szamvevo'], vagyis UGYANEZ a szerep a lenti kerületi ág
  //     diszkriminátorába is beleesik;
  //   · az override NEM VÁLTJA A PROFILT: az `enterCongregation` csak egy
  //     `admin_access_requests` sort ír, az ACTIVE_PROFILE_ROLE_COOKIE-hoz senki
  //     nem nyúl → az `activeProfileRole.scope` MARAD `'district'`.
  //   · sőt: az `admin-scope.ts:151-155` `assertCongregationInScope`-ja ÜRES
  //     districtIds-nél DOB, tehát aki egyáltalán be tud lépni egy gyülekezetbe
  //     kerületi adminként, annak SZÜKSÉGSZERŰEN nem-üres a kerületi hatóköre.
  //
  // A TÜNET A KAPU NÉLKÜL: a belépett kerületi admin a lenti 2) ágra fut, és a
  // Pénzügy (valamint a testvér module-scope.ts-en a Leltár és az Iktató) a
  // KERÜLET könyveit adja — miközben a fejlécben és a hero-címben a GYÜLEKEZET
  // neve áll, mert a `page.tsx` az `effectiveCongregationId`-t látja, ami az
  // override miatt a gyülekezeté. Ez a KÉT RÉTEG NÉMA SZÉTHÚZÁSA: idegen könyv
  // (idegen iktatószám-előnézet, idegen leltár) a gyülekezet neve alatt.
  //
  // A SZABÁLYT NEM MI TALÁLJUK KI: az `effective-access.ts:404-411` MÁR kimondja,
  // hogy „az AKTÍV admin-override MINDEN más szabályt megelőz", és ott az
  // `effectiveCongregationId` már az override gyülekezetéé. Ez a kapu ugyanazt a
  // szabályt hozza be a hatókör-feloldóba, hogy a KÉT RÉTEG UGYANAZT MONDJA.
  //
  // MIÉRT NEM VÁLTOZIK A MEGYEI ÉS A GYÜLEKEZETI VISELKEDÉS — BIZONYÍTÁS, NEM ÍGÉRET:
  //   `override.active` csak `overrideAllowed === true` mellett lehet igaz, ahhoz
  //   pedig a SKALÁR `profiles.role` kell: `'admin'` (isAdminRole) vagy
  //   `'egyhazkeruleti_admin'` (isEgyhazkeruletiAdminRole) — vagy master + AKTÍV
  //   god mode. A `lelkesz`, `konyvelo`, `esperes`, `egyhazmegyei_admin`,
  //   `egyhazmegyei_szamvevo` és `egyhazkeruleti_szamvevo` szerepnél
  //   `overrideAllowed === false`, tehát a kapu SOHA nem fut le rajtuk → a
  //   gyülekezeti és a MEGYEI ág byte-ra változatlan.
  //   A rendszergazdánál (`'admin'`) a kapu EREDMÉNYE azonos a korábbival: ő sem
  //   a DIOCESE_READ_ROLES-ban, sem a DISTRICT_READ_ROLES-ban nincs benne, tehát
  //   eddig is a 3) gyülekezeti fallbackre esett — most csak hamarabb, ugyanazzal
  //   a hatókörrel.
  //   ⇒ VISELKEDÉST KIZÁRÓLAG az `egyhazkeruleti_admin` (és a god mode-os master)
  //     esetén változtat: pontosan ott, ahol a hiba van.
  //
  // A HATÓKÖRT ITT NEM ELLENŐRIZZÜK ÚJRA: a `getActiveOverride` a sor
  // FELHASZNÁLÁSAKOR végigfuttatja az `assertCongregationInScope`-ot és hibánál
  // `{ active: false }`-t ad (fail-closed) — `override.active === true` tehát már
  // bizonyítottan hatókörön belüli gyülekezetet jelent.
  //
  // ⚠️ MIÉRT EGYETLEN KONSTRUKTOR (`gyulekezetiKontextus`) ÉS NEM KÉT KÉZZEL
  //    ÍRT `return`: a kapu és a lenti 3) fallback UGYANAZT a gyülekezeti
  //    kontextust adja. Két külön objektum-literál a projekt visszatérő „két,
  //    széthúzó implementáció" hibaosztálya: aki egyszer új mezőt vesz fel a
  //    `FinanceScopeContext`-be, a másik ágat elfelejtené — és az override-os
  //    úton más kontextus születne, mint a rendes gyülekezetin.
  //    (A testvér-modul `module-scope.ts` 0) kapuja betűre így áll.)
  const felhasznaloId = access.user.id
  const gyulekezetiKontextus = (scopeId: string): FinanceScopeContext => ({
    supabase: access.supabase,
    userId: felhasznaloId,
    scope: 'congregation',
    scopeId,
    scopeName: access.congregationName,
    szamadasicelSzint: 'gyulekezet',
    // A gyülekezeti szint írás/olvasás-korlátait a meglévő szerepkör-rétegek
    // (konyvelo m2m, profile_congregations jóváhagyás) kezelik — ez a mező
    // KIZÁRÓLAG a megyei / kerületi ellenőri esetről szól.
    readOnly: false,
    readOnlyReason: null,
  })

  const override = access.override
  if (override.active && override.congregationId) {
    // A belépett admin a GYÜLEKEZET ügyintézőjeként jár el, nem ellenőrként.
    return gyulekezetiKontextus(override.congregationId)
  }

  // ── 1) Diocese scope ellenőrzés ──
  //
  // ⚠️ 2026-08-11 (6. kör) — NÉMA ADATVESZTÉS JAVÍTÁSA.
  // Eddig a feltétel `active?.scope === 'diocese' && active.scopeId` volt, azaz
  // KIZÁRÓLAG az aktív profil-szerepet nézte: nem pásztázta a `profile_roles`
  // sorokat, és nem ismerte a `profiles.diocese_id` skalár tartalékot.
  //
  // KÖVETKEZMÉNY: egy „örökölt" esperes, akinek nincs `profile_roles` sora
  // (a `resolveActiveProfileRole` ilyenkor `null`-t ad), NÉMÁN a GYÜLEKEZETI
  // ágra esett — és miközben a megyei felületen állt, a SAJÁT gyülekezete
  // könyveibe írt. Nem hibaüzenet, nem üres lista: rossz helyre könyvelt pénz.
  //
  // ⛔ 2026-08-11 (ugyanaznap, ELLENŐRZÉS UTÁNI JAVÍTÁS) — MIÉRT NEM A
  //    SZEREP-FÜGGETLEN `resolveDioceseScopeId()` A DISZKRIMINÁTOR:
  //    az a feloldó a skalár tartalékát SZEREP-SZŰRŐ NÉLKÜL tolja be
  //    (`level-scope.ts`, `resolveDioceseScopeIds` — `if (!hasRoleScope)
  //    push(profile.diocese_id)`). Márpedig a `profiles.diocese_id` egy
  //    KÖZÖNSÉGES GYÜLEKEZETI LELKÉSZNÉL IS KI VAN TÖLTVE: a hozzáférés-kérés
  //    kötelezően bekéri a megyét, az `admin_activate_user` COALESCE-szal
  //    beírja, a 2026-08-10-gyulekezet-megye-kotes-javitas.sql B5 blokkja
  //    pedig MINDEN gyülekezeti tagnak visszatölti a gyülekezet megyéjéből.
  //    Vagyis a lelkésznél `dioceseId` NEM null → belépett volna a megyei
  //    ágba → az `allowed` mind az öt tagja hamis → a függvény hibával tér
  //    vissza, és a 2) gyülekezeti fallback SOHA nem fut le. Ez a TELJES
  //    Pénzügy modult elvitte volna minden lelkésznél (initFinance = null,
  //    minden mentés „Nincs bejelentkezett felhasználó.").
  //
  // ⚠️ ÉS A PROFILVÁLTÓ SEM SÉRÜLHET: ha a felhasználónak VAN `profile_roles`
  //    sora, akkor az `activeProfileRole` SOHA nem null (a `resolveActiveProfileRole`
  //    üres tömbnél ad csak `null`-t, egyébként a cookie-val választott vagy az
  //    elsődleges sort). Egy esperes tipikusan a SAJÁT gyülekezetének is lelkésze:
  //    ha épp gyülekezeti profilban áll, a Pénzügynek a GYÜLEKEZET könyveit kell
  //    mutatnia. Ezért a szerep-szűrt feloldó teljes UNIÓJÁT csak akkor
  //    használjuk, ha egyáltalán nincs profilváltó-sor.
  //
  // A SZABÁLY tehát:
  //   · van aktív profil-szerep → AZ dönt (megyei hatókör csak akkor, ha az
  //     aktív szerep megyei ÉS megyei OLVASÓ szerep — esperes / megyei admin /
  //     számvevő; egy `custom` megyei szerep NEM, mert az adatbázis sem ismeri el);
  //   · nincs egyetlen `profile_roles` sor sem („örökölt" felhasználó) → a
  //     szerep-szűrt skalár tartalék dönt: az örökölt esperes megkapja a
  //     megyéjét, a `lelkesz` SOHA.
  const dioceseReadIds = resolveDioceseReadScopeIds(access)
  const active = access.activeProfileRole
  const dioceseId: string | null = active
    ? active.scope === 'diocese' && active.scopeId && dioceseReadIds.includes(active.scopeId)
      ? active.scopeId
      : null
    : (dioceseReadIds[0] ?? null)

  if (dioceseId) {
    // Öv-és-nadrágtartó: a fenti ág konstrukció szerint már csak feloldott,
    // szerep-szűrt megyét ad — de ha valaki egyszer átírja, itt fail-closed
    // megállunk. (Az admin/master/kerületi admin ág SZÁNDÉKOSAN nincs itt: ők
    // a saját megyei szerepükön keresztül jönnek, különben egy rendszergazda
    // egy tetszőleges megye könyveibe könyvelne a Pénzügy felületről.)
    if (!dioceseReadIds.includes(dioceseId)) {
      return { error: 'Nincs jogosultság az egyházmegyei pénzügyhez.' }
    }

    // Név lekérdezés (opcionális, csak logra és UI-ra kell).
    // 2026-08-11 (K5-#32 testvér-ellenőrzés): ez az EGYETLEN hiba-elnyelés a
    // fájlban, és tudatosan az marad — a `scopeName` KIZÁRÓLAG felirat, nem
    // dönt jogosultságról vagy zárásról. A jogosultsági ág fentebb
    // (`dioceseReadIds`) eleve fail-closed: elnyelt hiba nem adhat hozzáférést.
    let scopeName: string | null = null
    try {
      const { data } = await access.supabase
        .from('dioceses')
        .select('name')
        .eq('id', dioceseId)
        .maybeSingle()
      scopeName = (data as { name?: string } | null)?.name ?? null
    } catch {
      scopeName = null
    }

    // 2026-08-11 (számvevő-kör): az egyházmegyei SZÁMVEVŐ ellenőri szerep —
    // a megye könyveit OLVASHATJA, de nem írhatja. Ezt az adatbázis is
    // kikényszeríti (RESTRICTIVE írás-tiltó a `diocese_*` táblákon); itt azért
    // jelezzük, hogy a felület ELŐRE letilthassa a mentő gombokat.
    // A `dioceseId` átadása azért fontos, mert aki EGYSZERRE esperes az egyik
    // és számvevő a másik megyében, az CSAK az elsőben írhat.
    const canWrite = canWriteDioceseScope(access, dioceseId)

    return {
      supabase: access.supabase,
      userId: access.user.id,
      scope: 'diocese',
      scopeId: dioceseId,
      scopeName,
      szamadasicelSzint: 'egyhazmegye',
      readOnly: !canWrite,
      readOnlyReason: canWrite ? null : describeDioceseWriteBlock(access, dioceseId),
    }
  }

  // ── 2) District (egyházkerületi) scope ellenőrzés ──
  //
  // 2026-08-17 (kerületi S5, K2 döntés): a kerület SAJÁT könyvet vezet, ezért
  // ugyanaz a Pénzügy felület a `district_*` táblákra ír. Ez a blokk a fenti
  // megyei ág BETŰHŰ tükörképe — szándékosan, mert a projekt visszatérő
  // hibaosztálya éppen az, hogy „a második felület a régi implementációt őrzi":
  // ha a kerületi ág önálló, kicsit másképp működő diszkriminátort kapna, a két
  // szint idővel némán széthúzna.
  //
  // ⚠️ MIÉRT NEM SZÁMÍT A KÉT ÁG SORRENDJE (és miért NEM regresszió ez a
  //    beszúrás a megyei/gyülekezeti viselkedésre):
  //      · ha VAN aktív profil-szerep, a `scope` mezője EGYETLEN érték, tehát a
  //        `dioceseId` és a `districtId` közül legfeljebb az egyik lehet nem-null;
  //      · ha NINCS `profile_roles` sor („örökölt" felhasználó), a döntés a
  //        szerep-szűrt skalár tartalékra fut, a két szerep-lista pedig
  //        DISZJUNKT (esperes / megyei admin / megyei számvevő ⇄ kerületi admin /
  //        kerületi számvevő), tehát a `profiles.role` legfeljebb az egyikbe fér bele.
  //    ⇒ Aki eddig a megyei vagy a gyülekezeti ágra futott, ezután is pontosan
  //      oda fut. Új hatókört KIZÁRÓLAG az kap, aki eddig NÉMÁN a gyülekezeti
  //      ágra esett, pedig kerületi hatókörben járt el.
  const districtReadIds = resolveDistrictReadScopeIds(access)
  const districtId: string | null = active
    ? active.scope === 'district' && active.scopeId && districtReadIds.includes(active.scopeId)
      ? active.scopeId
      : null
    : (districtReadIds[0] ?? null)

  if (districtId) {
    // Öv-és-nadrágtartó (a megyei ág mintája): a fenti diszkriminátor
    // konstrukció szerint már csak szerep-szűrt kerületet ad — de ha valaki
    // egyszer átírja, itt fail-closed megállunk. (Az admin/master ág
    // SZÁNDÉKOSAN nincs itt: ők a saját kerületi szerepükön keresztül jönnek,
    // különben egy rendszergazda egy tetszőleges kerület könyveibe könyvelne.)
    if (!districtReadIds.includes(districtId)) {
      return { error: 'Nincs jogosultság az egyházkerületi pénzügyhez.' }
    }

    // Név lekérdezés — KIZÁRÓLAG felirat (log + UI), jogosultságról vagy
    // zárásról soha nem dönt, ezért az elnyelt hiba itt biztonságos: a
    // jogosultsági ág fentebb (`districtReadIds`) már fail-closed lezárult.
    let scopeName: string | null = null
    try {
      const { data } = await access.supabase
        .from('districts')
        .select('name')
        .eq('id', districtId)
        .maybeSingle()
      scopeName = (data as { name?: string } | null)?.name ?? null
    } catch {
      scopeName = null
    }

    // A KERÜLETI SZÁMVEVŐ ellenőri szerep — a kerület könyveit OLVASHATJA, de
    // nem írhatja (a megyei számvevő párja). A `districtId` átadása azért
    // fontos, mert aki EGYSZERRE kerületi adminisztrátor az egyikben és
    // számvevő a másikban, az CSAK az elsőben írhat.
    const canWrite = canWriteDistrictScope(access, districtId)

    return {
      supabase: access.supabase,
      userId: access.user.id,
      scope: 'district',
      scopeId: districtId,
      scopeName,
      szamadasicelSzint: 'kerulet',
      readOnly: !canWrite,
      readOnlyReason: canWrite ? null : describeDistrictWriteBlock(access, districtId),
    }
  }

  // ── 3) Congregation fallback ──
  // A visszaadott kontextus BYTE-RA ugyanaz, mint korábban — csak a fenti
  // `gyulekezetiKontextus` konstruktoron át, hogy a 0) override-kapuval
  // egyetlen forrásból éljen (lásd ott a MIÉRT-et).
  if (access.effectiveCongregationId) {
    return gyulekezetiKontextus(access.effectiveCongregationId)
  }

  return { error: 'Nincs aktív gyülekezet vagy egyházmegye a profilban.' }
}

/**
 * 2026-08-11 (számvevő-kör, review-fix): ÍRÁSI KAPU a pénzügyi akciókhoz.
 *
 * MI VOLT A HIBA: a `FinanceScopeContext.readOnly` / `readOnlyReason` mező
 * létrejött, de SENKI nem olvasta — sem a `getFinanceScope()` wrapper, sem a
 * 15+ mutáló szerver akció. Két irányban ütött vissza:
 *   (1) az SQL LEFUTÁSA ELŐTT a számvevő továbbra is ÍRHATTA a megye könyveit
 *       (a `diocese_*_all` policy `pr.scope='diocese'` ága szerep-szűrő nélkül
 *       enged), és a felület ezt se nem tiltotta, se nem jelezte;
 *   (2) az SQL LEFUTÁSA UTÁN a RESTRICTIVE `_szamvevo_iras_tilos` policy NYERS
 *       PostgREST-hibát ad („new row violates row-level security policy for
 *       table \"diocese_befizetes\""), amit az action-ök `Hiba: …`-ként
 *       továbbadnak. Pont az a néma/érthetetlen hiba, amit ez a mező hivatott
 *       megelőzni.
 *
 * HASZNÁLAT — MINDEN mutáló pénzügyi action ELSŐ lépéseként:
 *   const blocked = financeWriteBlock(ctx)
 *   if (blocked) return blocked
 *
 * @returns `{ error }` ha a kontextus csak olvasható, különben `null`.
 */
export function financeWriteBlock(
  ctx: FinanceScopeContext,
): { error: string } | null {
  if (!ctx.readOnly) return null
  if (ctx.readOnlyReason) return { error: ctx.readOnlyReason }
  // 2026-08-17 (kerületi S5): a tartalék-szöveg SCOPE-HELYES legyen. A
  // `readOnlyReason` a gyakorlatban mindig ki van töltve (a describe*WriteBlock
  // nem-null, ha nem írhat), ezért ez az ág elvi tartalék — de ha egyszer
  // mégis ide fut egy kerületi számvevő, ne az egyházmegyéről olvasson.
  //
  // ⚠️ MIÉRT SWITCH ÉS NEM `if (district) … else …`: a testvér-modul
  // `altalanosOlvasoiUzenet`-e (module-scope.ts) már így áll, és jó okkal. Egy
  // `if/else` alatt minden JÖVŐBELI szint némán az egyházmegyei mondatot kapná
  // — vagyis rossz ügyintézőhöz küldenénk a felhasználót egy olyan üzenetben,
  // ami magabiztosan hangzik. A `never`-kapu ehelyett FORDÍTÁSI HIBÁT ad.
  switch (ctx.scope) {
    case 'district':
      return {
        error:
          'Ellenőri (számvevői) nézetben vagy: az egyházkerület pénzügyi adatait ' +
          'megtekintheted, de nem módosíthatod. A rögzítés és a véglegesítés az ' +
          'egyházkerületi adminisztrátor feladata.',
      }
    case 'congregation':
    case 'diocese':
      return {
        error:
          'Ellenőri (számvevői) nézetben vagy: az egyházmegye pénzügyi adatait ' +
          'megtekintheted, de nem módosíthatod. A rögzítés és a véglegesítés az ' +
          'esperes vagy az egyházmegyei adminisztrátor feladata.',
      }
    default: {
      const _nemLehet: never = ctx.scope
      throw new Error(`Ismeretlen pénzügyi hatókör: ${String(_nemLehet)}`)
    }
  }
}

/**
 * Ellenőrzi, hogy az adott év számadása véglegesítve van-e a megfelelő
 * scope-on. Egységes helper — szerkesztés/storno/új tétel blokkoláshoz.
 *
 * 2026-08-11 (K5-#32) FAIL-CLOSED JAVÍTÁS
 * ───────────────────────────────────────
 * MI VOLT A HIBA: a függvény `const { data } = await …`-tal hívott, vagyis az
 * `error`-t EL IS DOBTA, majd `if (!data) return false`-szal tért vissza. A
 * `false` jelentése itt „az év NINCS véglegesítve", ami a hívó oldalon
 * ENGEDÉLYEZI a szerkesztést, a stornót és az új tétel rögzítését. Tehát a
 * lekérdezés bármilyen hibája (RLS-szigorítás, oszlop-átnevezés, kettőzött
 * `bealitas` sor → maybeSingle-hiba, hálózati hiba) NÉMÁN KINYITOTTA a már
 * lezárt és beadott számadás évét. Ez pénzügyi zárás-integritási kapu: itt a
 * fail-OPEN a lehető legrosszabb alapértelmezés.
 *
 * MIÉRT HELYES A JAVÍTÁS: hibánál dobunk, tehát a hívó művelet MEGHIÚSUL —
 * a zárt év semmilyen körülmények között nem nyílik ki egy elnyelt hiba
 * miatt. A „nincs `bealitas` sor erre az évre" NEM hiba (`maybeSingle` ilyenkor
 * `data: null, error: null`): az azt jelenti, hogy az évet még nem is
 * konfigurálták, tehát valóban nincs véglegesítve → `false`.
 *
 * ✅ HÍVÓ OLDAL (2026-08-11, ugyanaznap, 2. lépés): mind az öt hívó
 * (`penzugy/actions.ts`, `edit-storno-actions.ts` ×3, `dispozitie-actions.ts`,
 * `decont-actions.ts`) try/catch-be lett csomagolva, és a lenti magyar szöveget
 * a saját modulja szokásos `{ error: '…' }` alakjában adja vissza — így a
 * művelet továbbra is fail-closed MEGHIÚSUL, de a lelkész actionable magyar
 * üzenetet lát nyers szerver-action hiba helyett. A normalizáláshoz lásd:
 * `yearFinalizedCheckErrorMessage`.
 */
export async function isYearFinalized(
  ctx: FinanceScopeContext,
  year: number,
): Promise<boolean> {
  const T = tablesFor(ctx.scope)
  const { data, error } = await ctx.supabase
    .from(T.bealitas)
    .select(T.finalizedCol)
    .eq(T.scopeCol, ctx.scopeId)
    .eq(T.yearColBealitas, yearValueFor(ctx.scope, year))
    .maybeSingle()

  if (error) {
    console.error(
      `[finance-scope] A(z) ${year}. évi zárás-állapot lekérdezése HIBÁRA FUTOTT ` +
        `(${T.bealitas}.${T.finalizedCol}, ${T.scopeCol}=${ctx.scopeId}) — fail-closed, a művelet nem futhat le.`,
      error,
    )
    throw new Error(
      `A ${year}. évi számadás zárás-állapotát most nem sikerült ellenőrizni, ezért biztonsági okból ` +
        `nem engedjük a módosítást (egy már lezárt évet nem nyithatunk ki véletlenül). ` +
        `Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának ` +
        `(részlet: ${error.message}).`,
    )
  }

  // Nincs `bealitas` sor erre az évre → az évet még nem konfigurálták, tehát
  // nincs is véglegesítve. Ez NEM hibaág.
  if (!data) return false
  const row = data as Record<string, unknown>
  return Boolean(row[T.finalizedCol])
}

/**
 * 2026-08-11 (K5-#32, 2. lépés): az `isYearFinalized` által DOBOTT hiba
 * lelkész-barát magyar szöveggé alakítása, hogy a hívó szerver-action a saját
 * `{ error: '…' }` alakjában adhassa vissza.
 *
 * MIÉRT KELL: az `isYearFinalized` fail-closed dobása helyes (zárt évet elnyelt
 * hiba miatt sosem nyitunk ki), de try/catch nélkül a Next.js szerver-action
 * nyers hibaként bukott el — a lelkész csak annyit látott, hogy „valami
 * elromlott", és nem tudta, mit tegyen. A művelet TOVÁBBRA IS meghiúsul; csak
 * az üzenet lesz értelmezhető és cselekvésre váltható.
 *
 * Az `isYearFinalized` dobása már tartalmazza a teljes magyar szöveget (mit
 * tegyen a lelkész + a részlet-hibaüzenet), ezért azt változatlanul átvesszük;
 * a fallback csak a nem-Error / üres üzenetű esetekre való.
 */
export function yearFinalizedCheckErrorMessage(err: unknown, year: number): string {
  if (err instanceof Error && err.message) return err.message
  return (
    `A ${year}. évi számadás zárás-állapotát most nem sikerült ellenőrizni, ezért biztonsági ` +
    'okból nem engedjük a műveletet (egy már lezárt évet nem nyithatunk ki véletlenül). ' +
    'Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának.'
  )
}
