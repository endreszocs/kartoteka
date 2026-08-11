/**
 * FinanceScope — a pénzügyi modul scope-tudatos kontextus helper-e.
 *
 * 2026-04-18 REFAKTOR (Endre): a gyülekezeti és egyházmegyei pénzügyi UI
 * ugyanaz a FinanceTabs komponens, az action-ök pedig scope alapján döntik
 * el, hogy a `befizetes`/`kiadas`/`bealitas`/`koltsegvetes`/`annual_reports`
 * táblákra, vagy a `diocese_befizetes`/.../`diocese_annual_reports` táblákra
 * írnak.
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
  describeDioceseWriteBlock,
  resolveDioceseReadScopeIds,
} from '@/lib/auth/level-scope'

export type FinanceScope = 'congregation' | 'diocese'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface FinanceScopeContext {
  supabase: SupabaseServerClient
  userId: string
  scope: FinanceScope
  /** congregation_id vagy diocese_id (UUID) */
  scopeId: string
  /** gyülekezet vagy egyházmegye neve — UI-ra és logra */
  scopeName: string | null
  /** A szamadasicel.szint értéke, ami scope-ban releváns */
  szamadasicelSzint: 'gyulekezet' | 'egyhazmegye'
  /**
   * 2026-08-11 (számvevő-kör): CSAK OLVASHATÓ-e ez a pénzügyi kontextus?
   *
   * `true` az egyházmegyei számvevőnél (ellenőri szerep): a megye könyveit
   * megnézheti, de nem rögzíthet, nem javíthat, nem véglegesíthet. Az adatbázis
   * is ezt kényszeríti (RESTRICTIVE írás-tiltó policy a `diocese_*` táblákon,
   * lásd migration-docs/sql/2026-08-11-szamvevo-megyei-hozzaferes.sql 1/C) —
   * ez a mező azért van, hogy a FELÜLET ELŐRE letilthassa a mentő gombokat,
   * és ne egy néma, 0 sort érintő mentés után derüljön ki a dolog.
   */
  readOnly: boolean
  /**
   * Beszédes magyar magyarázat, ha `readOnly === true` — tooltipre és
   * `{ error }`-ra egyaránt. `null`, ha a hívó írhat.
   */
  readOnlyReason: string | null
}

export interface FinanceScopeTableMap {
  /** Fő bevételi tábla */
  befizetes: 'befizetes' | 'diocese_befizetes'
  /** Fő kiadási tábla */
  kiadas: 'kiadas' | 'diocese_kiadas'
  /** Éves konfig (számadás/költségvetés véglegesítési flag) */
  bealitas: 'bealitas' | 'diocese_bealitas'
  /** Költségvetési tervezés */
  koltsegvetes: 'koltsegvetes' | 'diocese_koltsegvetes'
  /** Éves jelentés snapshot */
  annualReport: 'annual_reports' | 'diocese_annual_reports'
  /** Scope szerinti oszlop: congregation_id vagy diocese_id */
  scopeCol: 'congregation_id' | 'diocese_id'
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
 */
export function tablesFor(scope: FinanceScope): FinanceScopeTableMap {
  if (scope === 'diocese') {
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
  }
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
}

/**
 * Az év érték scope-helyes reprezentációja:
 *   - congregation: string (pl. "2026")
 *   - diocese: number (2026)
 */
export function yearValueFor(scope: FinanceScope, year: number): string | number {
  return scope === 'diocese' ? year : String(year)
}

/**
 * A scope-aware kontextus lekérdezése. A hívó oldalon az `activeProfileRole`
 * szerint választ:
 *   - ha `activeProfileRole.scope === 'diocese'` + scopeId + jogosultság
 *     → diocese-kontextus a scope_id-val
 *   - különben a meglévő `effectiveCongregationId` fallback
 *
 * @returns FinanceScopeContext vagy `{ error }` objektum
 */
export async function getFinanceScopeContext(): Promise<
  FinanceScopeContext | { error: string }
> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

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

  // ── 2) Congregation fallback ──
  if (access.effectiveCongregationId) {
    return {
      supabase: access.supabase,
      userId: access.user.id,
      scope: 'congregation',
      scopeId: access.effectiveCongregationId,
      scopeName: access.congregationName,
      szamadasicelSzint: 'gyulekezet',
      // A gyülekezeti szint írás/olvasás-korlátait a meglévő szerepkör-rétegek
      // (konyvelo m2m, profile_congregations jóváhagyás) kezelik — ez a mező
      // KIZÁRÓLAG a megyei ellenőri esetről szól.
      readOnly: false,
      readOnlyReason: null,
    }
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
  return {
    error:
      ctx.readOnlyReason ??
      'Ellenőri (számvevői) nézetben vagy: az egyházmegye pénzügyi adatait ' +
        'megtekintheted, de nem módosíthatod. A rögzítés és a véglegesítés az ' +
        'esperes vagy az egyházmegyei adminisztrátor feladata.',
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
