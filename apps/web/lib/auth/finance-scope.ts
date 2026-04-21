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

  const active = access.activeProfileRole

  // ── 1) Diocese scope ellenőrzés ──
  if (active?.scope === 'diocese' && active.scopeId) {
    // Jogosultság ellenőrzés: saját diocese esperes/egyházmegyei admin, kerületi
    // admin, vagy globális admin
    const allowed =
      access.admin ||
      access.master ||
      access.egyhazkeruletiAdmin ||
      (access.esperes && access.profile?.diocese_id === active.scopeId) ||
      access.profileRoles.some(
        (r) =>
          r.active &&
          r.approval_status === 'approved' &&
          r.scope === 'diocese' &&
          r.scope_id === active.scopeId,
      )

    if (!allowed) return { error: 'Nincs jogosultság az egyházmegyei pénzügyhez.' }

    // Név lekérdezés (opcionális, csak logra és UI-ra kell)
    let scopeName: string | null = null
    try {
      const { data } = await access.supabase
        .from('dioceses')
        .select('name')
        .eq('id', active.scopeId)
        .maybeSingle()
      scopeName = (data as { name?: string } | null)?.name ?? null
    } catch {
      scopeName = null
    }

    return {
      supabase: access.supabase,
      userId: access.user.id,
      scope: 'diocese',
      scopeId: active.scopeId,
      scopeName,
      szamadasicelSzint: 'egyhazmegye',
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
    }
  }

  return { error: 'Nincs aktív gyülekezet vagy egyházmegye a profilban.' }
}

/**
 * Ellenőrzi, hogy az adott év számadása véglegesítve van-e a megfelelő
 * scope-on. Egységes helper — szerkesztés/storno blokkoláshoz.
 */
export async function isYearFinalized(
  ctx: FinanceScopeContext,
  year: number,
): Promise<boolean> {
  const T = tablesFor(ctx.scope)
  const { data } = await ctx.supabase
    .from(T.bealitas)
    .select(T.finalizedCol)
    .eq(T.scopeCol, ctx.scopeId)
    .eq(T.yearColBealitas, yearValueFor(ctx.scope, year))
    .maybeSingle()

  if (!data) return false
  const row = data as Record<string, unknown>
  return Boolean(row[T.finalizedCol])
}
