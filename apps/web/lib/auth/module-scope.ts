import 'server-only'

/**
 * ModuleScope — a scope-oszlopos modulok (Leltár, Iktató, később Dokumentumtár)
 * KÖZÖS hatókör-feloldója (egyházmegyei terv, 2.0 szakasz — S3 szelet).
 *
 * MIBEN MÁS, MINT A FINANCE-SCOPE: a pénzügy KÜLÖN diocese_* táblákkal dolgozik
 * (tablesFor-térkép, mert az oszlopkészlet eltér), a leltár/iktató viszont
 * UGYANAZON a táblán kap egy `diocese_id` scope-oszlopot
 * (migration-docs/sql/2026-08-15-egyhazmegyei-scope-oszlopok.sql). Ezért itt
 * nincs tábla-térkép — csak a scope-oszlop neve és értéke:
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
 */

import type { createClient } from '@/lib/supabase/server'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  canWriteDioceseScope,
  describeDioceseWriteBlock,
  resolveDioceseReadScopeIds,
} from '@/lib/auth/level-scope'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'

export type ModuleScope = 'congregation' | 'diocese'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface ModuleScopeContext {
  supabase: SupabaseServerClient
  userId: string
  scope: ModuleScope
  /**
   * A scope-oszlop neve a scope-oszlopos táblákon (leltar_tetelek, iktato,
   * iktato_sablonok, iktato_yearly_closures, iktato_csatolmany). A lekérdezés
   * MINDIG `.eq(ctx.scopeCol, ctx.scopeId)`-vel szűr — soha nem kézzel írt
   * 'congregation_id' literállal, mert az a diocese-módban némán a MÁSIK
   * scope oszlopára szűrne (0 sor, hibaüzenet nélkül).
   */
  scopeCol: 'congregation_id' | 'diocese_id'
  /** congregation_id vagy diocese_id (UUID) — mindig kitöltött (fail-closed). */
  scopeId: string
  /**
   * A gyülekezet / egyházmegye MEGJELENÍTENDŐ neve (hero-cím, nyomtatvány-
   * felirat). Egyházmegyénél a formatEgyhazmegyeNev duplázás-védőjén át.
   * CSAK felirat — jogosultságról soha nem dönt.
   */
  scopeName: string | null
  /**
   * `false` az egyházmegyei SZÁMVEVŐNÉL (ellenőri szerep): a megye leltárát /
   * iktatóját megnézheti, de nem rögzíthet és nem törölhet. Az adatbázis is
   * ezt kényszeríti (a diocese-láb írási policyje a szerep-szűrt
   * current_user_diocese_ids()-t hívja, amiben a számvevő nincs benne) — ez a
   * mező azért van, hogy a FELÜLET ELŐRE letilthassa a gombokat, és az action
   * beszédes magyar hibát adjon néma 0-soros mentés helyett.
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
      scopeCol: 'diocese_id',
      scopeId: dioceseId,
      scopeName,
      canWrite,
      readOnlyReason: canWrite ? null : describeDioceseWriteBlock(access, dioceseId),
    }
  }

  // ── 2) Gyülekezeti fallback ──
  if (access.effectiveCongregationId) {
    return {
      supabase: access.supabase,
      userId: access.user.id,
      scope: 'congregation',
      scopeCol: 'congregation_id',
      scopeId: access.effectiveCongregationId,
      scopeName: access.congregationName,
      // A gyülekezeti szint írás-korlátait a meglévő szerepkör-rétegek kezelik —
      // ez a mező kizárólag a megyei ellenőri (számvevői) esetről szól.
      canWrite: true,
      readOnlyReason: null,
    }
  }

  return { error: 'Nincs aktív gyülekezet vagy egyházmegye a profilban.' }
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
  return {
    error:
      ctx.readOnlyReason ??
      'Ellenőri (számvevői) nézetben vagy: az egyházmegye adatait megtekintheted, ' +
        'de nem módosíthatod. A rögzítés az esperes vagy az egyházmegyei ' +
        'adminisztrátor feladata.',
  }
}
