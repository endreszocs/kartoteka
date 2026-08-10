'use server'

/**
 * Admin → Rendszer pénzügyei modul szerver akciói.
 *
 * Jogosultság: csak `admin` (rendszergazda/master). Az RLS szintjén is
 * védve, de szerver oldalon is ellenőrizzük a gyorsabb hiba-visszajelzés
 * érdekében.
 *
 * Funkciók:
 *   1. system_finance_costs CRUD — havi rendszer-költségtételek
 *   2. system_pricing_tiers CRUD — tag-szám alapú árazási sávok
 *   3. congregation_subscriptions CRUD — gyülekezetenkénti előfizetések
 *   4. getSystemFinanceSummary() — aggregált kép (havi bevétel/költség/profit)
 *   5. getScalingForecast() — skálázási előrejelzés
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchBnrRates } from '@/lib/finance/bnr-exchange-rate'
import {
  normalizedMonthlyRevenueRon,
  normalizedAnnualRevenueRon,
  type NormalizableSubscription,
  type NormalizableTier,
} from '@/lib/finance/normalized-revenue'

// ─────────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────────

export type CostCategory =
  | 'supabase' | 'railway' | 'vercel' | 'email_service' | 'storage'
  | 'ai_gpu' | 'ai_proxy' | 'ai_monitoring'
  | 'mobile' | 'monitoring' | 'domain' | 'egyszeri' | 'egyeb'
// 2026-04-21w: 'railway' + 'email_service' hozzáadva.
// - 'vercel' kategóriát MEGTARTJUK backward-compat miatt (historikus tételek),
//   de az új rendszer Railway-en fut (EU Amsterdam, GDPR-kompatibilis).
// - 'email_service': Brevo / Mailjet / Resend — transactional email küldés.
// A DB CHECK constraint bővítése a migration-docs/sql/2026-04-21-railway-email-categories.sql
// fájlban van, Endre futtatja Supabase-en.

export type SubscriptionType = 'havi' | 'eves' | 'teszt' | 'kedvezmeny' | 'ingyenes'

export type PricingTierType = 'gyulekezet' | 'egyhazmegye' | 'teszt' | 'kedvezmeny'

/** Előfizetés hozzáférés-státusz — a funkció-gatinget vezérli (a `tipus`-tól függetlenül). */
export type SubscriptionAccessStatus = 'active' | 'trial' | 'free' | 'suspended' | 'grace'

const VALID_ACCESS_STATUSES: SubscriptionAccessStatus[] = [
  'active', 'trial', 'free', 'suspended', 'grace',
]

export interface SystemFinanceCost {
  id: number
  kategoria: CostCategory
  nev: string
  havi_usd: number
  havi_ron: number | null
  arfolyam_usd: number
  aktiv: boolean
  sorszam: number
  megjegyzes: string | null
}

export interface SystemPricingTier {
  id: number
  nev: string
  tipus: PricingTierType
  min_tagok: number
  max_tagok: number | null
  havi_dij_ron: number
  eves_dij_ron: number
  aktiv: boolean
  sorszam: number
  megjegyzes: string | null
}

export interface CongregationSubscription {
  id: number
  congregation_id: string
  congregation_name?: string
  congregation_tag_szam?: number
  pricing_tier_id: number | null
  pricing_tier_nev?: string
  tipus: SubscriptionType
  dij_ron: number | null
  kezdet: string
  veg: string | null
  aktiv: boolean
  megjegyzes: string | null
  /** Hozzáférés-státusz (2026-07-11). Hiányzó oszlop esetén 'active'. */
  access_status: SubscriptionAccessStatus
  /** Speciális igény havi felára (RON). */
  felar_ron: number | null
  felar_leiras: string | null
  trial_ends_at: string | null
  grace_until: string | null
}

/** access_status biztonságos olvasása (hiányzó oszlop/érték → 'active'). */
function readAccessStatus(v: unknown): SubscriptionAccessStatus {
  return VALID_ACCESS_STATUSES.includes(v as SubscriptionAccessStatus)
    ? (v as SubscriptionAccessStatus)
    : 'active'
}

/** Numerikus mező biztonságos olvasása (null megőrzésével). */
function readNullableNumber(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export interface SystemFinanceSummary {
  /** Aktív gyülekezetek száma előfizetéssel */
  activeSubscriptions: number
  /** Összes gyülekezet (előfizetés nélkül is) */
  totalCongregations: number
  /** Havi bevétel RON — aktív subscription-ök összegzésével */
  monthlyRevenueRon: number
  /** Éves bevétel RON (projekt: 12×havi + éves subscription-ök) */
  annualRevenueRon: number
  /** Havi költség RON (aktív system_finance_costs × arfolyam) */
  monthlyCostRon: number
  /** Éves költség RON */
  annualCostRon: number
  /** Havi profit RON (bevétel − költség) */
  monthlyProfitRon: number
  /** Éves profit RON */
  annualProfitRon: number
  /** Gyülekezetek tag-szám szerinti bontása */
  congregationsByTier: Array<{
    tierId: number
    tierNev: string
    count: number
    avgDij: number
    totalRevenue: number
  }>
  /** Gyülekezetek előfizetés nélkül (NEM fizetnek jelenleg) */
  congregationsWithoutSubscription: number
  /** USD→RON aktuális árfolyam (átlag) */
  usdRonRate: number
}

export interface ScalingScenario {
  gyulekezet_szam: number
  avg_dij_ron: number
  havi_bevetel_ron: number
  eves_bevetel_ron: number
  havi_koltseg_ron: number
  eves_koltseg_ron: number
  havi_profit_ron: number
  eves_profit_ron: number
  /** Profit % a bevételből */
  profit_margin: number
}

// ─────────────────────────────────────────────────────────────────────────
// Jogosultság ellenőrzés
// ─────────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }
  if (!access.admin && !access.master) {
    return { error: 'Csak rendszergazda férhet hozzá.' as const }
  }
  return { supabase: access.supabase, userId: access.user.id }
}

/**
 * Hiányzó OSZLOP hiba felismerése (a 2026-07-11 SQL-migráció még nem futott le).
 * A Postgres 42703 (undefined_column) és a PostgREST séma-cache "Could not find
 * the '…' column" üzenetét is lefedi.
 */
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (msg.includes('column') && (msg.includes('does not exist') || msg.includes('could not find')))
  )
}

/**
 * Hiányzó RELÁCIÓ (tábla) hiba felismerése (a system_finance_income migráció
 * még nem futott le, vagy a bővített oszlopok táblája hiányzik).
 */
function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  return error.code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'))
}

// ─────────────────────────────────────────────────────────────────────────
// 1) system_finance_costs CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function listSystemCosts(): Promise<{ data?: SystemFinanceCost[]; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const { data, error } = await ctx.supabase
    .from('system_finance_costs')
    .select('*')
    .order('sorszam', { ascending: true })
  if (error) return { error: error.message }
  return { data: (data || []) as SystemFinanceCost[] }
}

export interface UpsertSystemCostInput {
  id?: number
  kategoria: CostCategory
  nev: string
  havi_usd: number
  havi_ron?: number | null
  arfolyam_usd?: number
  aktiv?: boolean
  sorszam?: number
  megjegyzes?: string | null
}

export async function upsertSystemCost(input: UpsertSystemCostInput): Promise<{ id?: number; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const payload = {
    kategoria: input.kategoria,
    nev: input.nev,
    havi_usd: input.havi_usd,
    havi_ron: input.havi_ron ?? null,
    arfolyam_usd: input.arfolyam_usd ?? 4.41,
    aktiv: input.aktiv ?? true,
    sorszam: input.sorszam ?? 0,
    megjegyzes: input.megjegyzes ?? null,
  }

  if (input.id) {
    const { error } = await ctx.supabase
      .from('system_finance_costs')
      .update(payload)
      .eq('id', input.id)
    if (error) return { error: error.message }
    revalidatePath('/admin')
    return { id: input.id }
  }

  const { data, error } = await ctx.supabase
    .from('system_finance_costs')
    .insert([payload])
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { id: (data as { id: number }).id }
}

export async function deleteSystemCost(id: number): Promise<{ error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await ctx.supabase.from('system_finance_costs').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}

// ─────────────────────────────────────────────────────────────────────────
// 2) system_pricing_tiers CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function listPricingTiers(): Promise<{ data?: SystemPricingTier[]; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const { data, error } = await ctx.supabase
    .from('system_pricing_tiers')
    .select('*')
    .order('sorszam', { ascending: true })
  if (error) return { error: error.message }
  return { data: (data || []) as SystemPricingTier[] }
}

export interface UpsertPricingTierInput {
  id?: number
  nev: string
  tipus: PricingTierType
  min_tagok: number
  max_tagok?: number | null
  havi_dij_ron: number
  eves_dij_ron: number
  aktiv?: boolean
  sorszam?: number
  megjegyzes?: string | null
}

export async function upsertPricingTier(input: UpsertPricingTierInput): Promise<{ id?: number; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const payload = {
    nev: input.nev,
    tipus: input.tipus,
    min_tagok: input.min_tagok,
    max_tagok: input.max_tagok ?? null,
    havi_dij_ron: input.havi_dij_ron,
    eves_dij_ron: input.eves_dij_ron,
    aktiv: input.aktiv ?? true,
    sorszam: input.sorszam ?? 0,
    megjegyzes: input.megjegyzes ?? null,
  }

  if (input.id) {
    const { error } = await ctx.supabase
      .from('system_pricing_tiers')
      .update(payload)
      .eq('id', input.id)
    if (error) return { error: error.message }
    revalidatePath('/admin')
    return { id: input.id }
  }

  const { data, error } = await ctx.supabase
    .from('system_pricing_tiers')
    .insert([payload])
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { id: (data as { id: number }).id }
}

export async function deletePricingTier(id: number): Promise<{ error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await ctx.supabase.from('system_pricing_tiers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}

// ─────────────────────────────────────────────────────────────────────────
// 3) congregation_subscriptions
// ─────────────────────────────────────────────────────────────────────────

export async function listCongregationSubscriptions(): Promise<{
  data?: CongregationSubscription[]
  error?: string
}> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  // 1. Minden gyülekezet + tag-szám
  const { data: congregations, error: cErr } = await ctx.supabase
    .from('congregations')
    .select('id, name')
  if (cErr) return { error: cErr.message }

  // 2. Tag-számok — EGYETLEN GROUP BY RPC (a korábbi N+1 helyett).
  //    2026-06-07: az aktív, ÉLŐ tagokat számolja (isvisible + nem elhunyt),
  //    konzisztensen a rendszer többi tagszámával. Lásd: 2026-06-05o SQL.
  const tagMap = new Map<string, number>()
  const { data: tagCounts } = await ctx.supabase.rpc('admin_overview_member_counts')
  if (Array.isArray(tagCounts)) {
    for (const row of tagCounts as Array<{ congregation_id: string; member_count: number }>) {
      if (row.congregation_id) tagMap.set(row.congregation_id, Number(row.member_count) || 0)
    }
  }

  // 3. Aktív subscription-ök + pricing tier
  const { data: subs, error: sErr } = await ctx.supabase
    .from('congregation_subscriptions')
    .select('*, system_pricing_tiers(nev)')
    .eq('aktiv', true)
    .order('created_at', { ascending: false })
  if (sErr) return { error: sErr.message }

  const result: CongregationSubscription[] = (subs || []).map((row: Record<string, unknown>) => {
    const tier = (row['system_pricing_tiers'] as { nev?: string } | null)
    const cid = row['congregation_id'] as string
    const congregation = (congregations || []).find((c) => (c as { id: string }).id === cid) as
      | { id: string; name: string } | undefined
    return {
      id: Number(row['id']),
      congregation_id: cid,
      congregation_name: congregation?.name,
      congregation_tag_szam: tagMap.get(cid) ?? 0,
      pricing_tier_id: row['pricing_tier_id'] as number | null,
      pricing_tier_nev: tier?.nev,
      tipus: row['tipus'] as SubscriptionType,
      dij_ron: row['dij_ron'] as number | null,
      kezdet: row['kezdet'] as string,
      veg: row['veg'] as string | null,
      aktiv: row['aktiv'] as boolean,
      megjegyzes: row['megjegyzes'] as string | null,
      access_status: readAccessStatus(row['access_status']),
      felar_ron: readNullableNumber(row['felar_ron']),
      felar_leiras: (row['felar_leiras'] as string | null) ?? null,
      trial_ends_at: (row['trial_ends_at'] as string | null) ?? null,
      grace_until: (row['grace_until'] as string | null) ?? null,
    }
  })

  return { data: result }
}

export interface UpsertSubscriptionInput {
  id?: number
  congregation_id: string
  pricing_tier_id?: number | null
  tipus: SubscriptionType
  dij_ron?: number | null
  kezdet?: string
  veg?: string | null
  aktiv?: boolean
  megjegyzes?: string | null
  /** Új mezők (2026-07-11) — a migráció előtt csendben kimaradnak a payloadból. */
  access_status?: SubscriptionAccessStatus
  felar_ron?: number | null
  felar_leiras?: string | null
  trial_ends_at?: string | null
  grace_until?: string | null
}

export async function upsertCongregationSubscription(
  input: UpsertSubscriptionInput,
): Promise<{ id?: number; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  // Alap-payload (a migráció előtt is létező oszlopok)
  const basePayload: Record<string, unknown> = {
    congregation_id: input.congregation_id,
    pricing_tier_id: input.pricing_tier_id ?? null,
    tipus: input.tipus,
    dij_ron: input.dij_ron ?? null,
    kezdet: input.kezdet ?? new Date().toISOString().slice(0, 10),
    veg: input.veg ?? null,
    aktiv: input.aktiv ?? true,
    megjegyzes: input.megjegyzes ?? null,
  }

  // Bővített payload (2026-07-11 oszlopok) — csak a ténylegesen átadott mezők.
  const extendedPayload: Record<string, unknown> = { ...basePayload, updated_by: ctx.userId }
  if (input.access_status !== undefined) extendedPayload.access_status = input.access_status
  if (input.felar_ron !== undefined) extendedPayload.felar_ron = input.felar_ron
  if (input.felar_leiras !== undefined) extendedPayload.felar_leiras = input.felar_leiras
  if (input.trial_ends_at !== undefined) extendedPayload.trial_ends_at = input.trial_ends_at
  if (input.grace_until !== undefined) extendedPayload.grace_until = input.grace_until

  const runWrite = async (payload: Record<string, unknown>) => {
    if (input.id) {
      const { error } = await ctx.supabase
        .from('congregation_subscriptions')
        .update(payload)
        .eq('id', input.id)
      return { id: input.id, error }
    }
    const { data, error } = await ctx.supabase
      .from('congregation_subscriptions')
      .insert([payload])
      .select('id')
      .single()
    return { id: (data as { id: number } | null)?.id, error }
  }

  // 1. próba a bővített payloaddal; ha hiányzó oszlop miatt bukik (migráció
  //    még nem futott), ELLENÁLLÓAN visszaesünk az alap-payloadra.
  let res = await runWrite(extendedPayload)
  if (res.error && isMissingColumnError(res.error)) {
    res = await runWrite(basePayload)
  }
  if (res.error) return { error: res.error.message }
  revalidatePath('/admin')
  return { id: res.id }
}

// 2026-08-11 (K5 P2 #6) — TÖRÖLVE: `deleteSubscription`. Nem volt hívója; az
// előfizetés-kezelő (components/admin/finance/subscription-manager.tsx) csak
// upsertel. Ez volt a fájl EGYETLEN valódi DELETE-je: hívó nélkül is ÉLŐ
// POST-végpontként bárki törölhetett egy `congregation_subscriptions` sort
// puszta id-vel, visszavonhatatlanul (nincs soft-delete ezen a táblán).

// ─────────────────────────────────────────────────────────────────────────
// 4) Aggregált pénzügyi összefoglaló
// ─────────────────────────────────────────────────────────────────────────

export async function getSystemFinanceSummary(): Promise<{
  data?: SystemFinanceSummary
  error?: string
}> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  // Párhuzamos lekérdezések
  const [costsRes, tiersRes, subsRes, congsRes] = await Promise.all([
    ctx.supabase.from('system_finance_costs').select('*').eq('aktiv', true),
    ctx.supabase.from('system_pricing_tiers').select('*').eq('aktiv', true),
    ctx.supabase.from('congregation_subscriptions').select('*').eq('aktiv', true),
    ctx.supabase.from('congregations').select('id, name'),
  ])

  if (costsRes.error) return { error: costsRes.error.message }
  if (tiersRes.error) return { error: tiersRes.error.message }
  if (subsRes.error) return { error: subsRes.error.message }
  if (congsRes.error) return { error: congsRes.error.message }

  const costs = (costsRes.data || []) as SystemFinanceCost[]
  const tiers = (tiersRes.data || []) as SystemPricingTier[]
  // A subs `*`-gal jön → a 2026-07-11 új oszlopok (access_status, felar_ron,
  // kezdet/veg) átjönnek, ha léteznek; hiányuk esetén a helper biztonságos
  // defaultokkal számol.
  const subs = (subsRes.data || []) as Array<Record<string, unknown>>
  const congs = (congsRes.data || []) as Array<{ id: string; name: string }>

  // Havi költség: aktív system_finance_costs × arfolyam_usd (per-soros manuális
  // árfolyam — az export-hűség elve miatt NEM írjuk felül valós FX-szel).
  let monthlyCostRon = 0
  for (const c of costs) {
    if (c.havi_ron && c.havi_ron > 0) {
      monthlyCostRon += Number(c.havi_ron)
    } else {
      monthlyCostRon += Number(c.havi_usd) * Number(c.arfolyam_usd)
    }
  }

  const tierMap = new Map<number, SystemPricingTier>()
  for (const t of tiers) tierMap.set(t.id, t)

  // A subscription-t a KÖZÖS normalized-revenue helperrel értékeljük — így a
  // summary, a tier-bontás és a forecast bit-azonos logikán fut (a/b/c hibák
  // strukturális megszüntetése).
  const asOf = new Date()
  const subToNormalizable = (s: Record<string, unknown>): NormalizableSubscription => ({
    tipus: (s['tipus'] as string) ?? null,
    dij_ron: readNullableNumber(s['dij_ron']),
    kezdet: (s['kezdet'] as string | null) ?? null,
    veg: (s['veg'] as string | null) ?? null,
    access_status: (s['access_status'] as string | null) ?? null,
    felar_ron: readNullableNumber(s['felar_ron']),
  })

  let monthlyRevenueRon = 0
  let annualRevenueRon = 0
  for (const s of subs) {
    const tierId = s['pricing_tier_id'] as number | null
    const tier = (tierId ? tierMap.get(tierId) : null) as NormalizableTier | null
    const norm = subToNormalizable(s)
    monthlyRevenueRon += normalizedMonthlyRevenueRon(norm, tier, asOf)
    annualRevenueRon += normalizedAnnualRevenueRon(norm, tier, asOf)
  }

  // Gyülekezetek tag-szám (sáv) szerinti bontása — a bevétel a NORMALIZÁLT havi
  // érték (az eves egyedi díj is helyesen /12, nem 12× túlbecsülve).
  const tierStats = new Map<number, { count: number; total: number }>()
  for (const s of subs) {
    const tierId = s['pricing_tier_id'] as number | null
    if (!tierId) continue
    const existing = tierStats.get(tierId) || { count: 0, total: 0 }
    const tier = tierMap.get(tierId) as NormalizableTier | undefined
    existing.count += 1
    existing.total += normalizedMonthlyRevenueRon(subToNormalizable(s), tier ?? null, asOf)
    tierStats.set(tierId, existing)
  }

  const congregationsByTier = Array.from(tierStats.entries())
    .map(([tierId, stat]) => {
      const tier = tierMap.get(tierId)
      return {
        tierId,
        tierNev: tier?.nev || `Sáv ${tierId}`,
        count: stat.count,
        avgDij: stat.count > 0 ? Math.round((stat.total / stat.count) * 100) / 100 : 0,
        totalRevenue: Math.round(stat.total * 100) / 100,
      }
    })
    .sort((a, b) => b.count - a.count)

  const activeSubsCount = subs.length
  const totalCongregations = congs.length
  const congregationsWithoutSubscription = Math.max(0, totalCongregations - activeSubsCount)

  // USD→RON: VALÓS FX-árfolyam (BNR/ECB cache), nem a per-soros arfolyam_usd
  // számtani átlaga (fogalmilag téves volt). Ellenálló: hiba esetén 4.41.
  const fx = await resolveFxRates(ctx.userId)
  const usdRonRate = fx.usd_ron > 0 ? fx.usd_ron : 4.41

  return {
    data: {
      activeSubscriptions: activeSubsCount,
      totalCongregations,
      monthlyRevenueRon: Math.round(monthlyRevenueRon * 100) / 100,
      annualRevenueRon: Math.round(annualRevenueRon * 100) / 100,
      monthlyCostRon: Math.round(monthlyCostRon * 100) / 100,
      annualCostRon: Math.round(monthlyCostRon * 12 * 100) / 100,
      monthlyProfitRon: Math.round((monthlyRevenueRon - monthlyCostRon) * 100) / 100,
      annualProfitRon: Math.round((annualRevenueRon - monthlyCostRon * 12) * 100) / 100,
      congregationsByTier,
      congregationsWithoutSubscription,
      usdRonRate: Math.round(usdRonRate * 10000) / 10000,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 5) Skálázási előrejelzés (szcenáriók)
// ─────────────────────────────────────────────────────────────────────────

export async function getScalingForecast(): Promise<{
  data?: ScalingScenario[]
  error?: string
}> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const [costsRes, tiersRes] = await Promise.all([
    ctx.supabase.from('system_finance_costs').select('*').eq('aktiv', true),
    ctx.supabase.from('system_pricing_tiers').select('*').eq('aktiv', true).eq('tipus', 'gyulekezet'),
  ])

  if (costsRes.error) return { error: costsRes.error.message }
  if (tiersRes.error) return { error: tiersRes.error.message }

  const costs = (costsRes.data || []) as SystemFinanceCost[]
  const tiers = (tiersRes.data || []) as SystemPricingTier[]

  // Átlag havi díj — a KÖZÖS normalized-revenue helper logikájával: minden
  // gyülekezeti sávra egy szintetikus 'havi' + 'active' előfizetés havi
  // normalizált értékét vesszük (ez a sáv havi_dij_ron-ja), majd átlagolunk.
  const avgHaviDij =
    tiers.length > 0
      ? tiers.reduce(
          (s, t) =>
            s +
            normalizedMonthlyRevenueRon(
              { tipus: 'havi', access_status: 'active' },
              t as NormalizableTier,
            ),
          0,
        ) / tiers.length
      : 45

  // Havi költség RON
  let monthlyBaseCostRon = 0
  for (const c of costs) {
    if (c.havi_ron && c.havi_ron > 0) {
      monthlyBaseCostRon += Number(c.havi_ron)
    } else {
      monthlyBaseCostRon += Number(c.havi_usd) * Number(c.arfolyam_usd)
    }
  }

  // Szcenáriók: 25, 50, 100, 200, 500, 1000 gyülekezet
  // Tervgörbe alapján: ~5 RON extra havi költség minden 100 gyülekezet után
  const scenarios = [25, 50, 100, 200, 500, 1000]

  const forecast: ScalingScenario[] = scenarios.map((count) => {
    // Linearizált költség: alap + scale-with-count (Supabase egress, compute skálázik)
    const extraPer100 = 25  // RON extra szerver költség minden 100 gyülekezet után
    const scalingExtra = Math.floor(count / 100) * extraPer100
    const havi_koltseg_ron = monthlyBaseCostRon + scalingExtra

    const havi_bevetel_ron = avgHaviDij * count
    const eves_bevetel_ron = havi_bevetel_ron * 12
    const eves_koltseg_ron = havi_koltseg_ron * 12
    const havi_profit_ron = havi_bevetel_ron - havi_koltseg_ron
    const eves_profit_ron = eves_bevetel_ron - eves_koltseg_ron
    const profit_margin = havi_bevetel_ron > 0 ? (havi_profit_ron / havi_bevetel_ron) * 100 : 0

    return {
      gyulekezet_szam: count,
      avg_dij_ron: Math.round(avgHaviDij * 100) / 100,
      havi_bevetel_ron: Math.round(havi_bevetel_ron * 100) / 100,
      eves_bevetel_ron: Math.round(eves_bevetel_ron * 100) / 100,
      havi_koltseg_ron: Math.round(havi_koltseg_ron * 100) / 100,
      eves_koltseg_ron: Math.round(eves_koltseg_ron * 100) / 100,
      havi_profit_ron: Math.round(havi_profit_ron * 100) / 100,
      eves_profit_ron: Math.round(eves_profit_ron * 100) / 100,
      profit_margin: Math.round(profit_margin * 10) / 10,
    }
  })

  return { data: forecast }
}

// ─────────────────────────────────────────────────────────────────────────
// 6) Helper: gyülekezet automatikus árazási sáv javaslata tag-szám alapján
// ─────────────────────────────────────────────────────────────────────────

export async function suggestPricingTierForCongregation(
  congregationId: string,
): Promise<{ data?: { tagSzam: number; tier: SystemPricingTier | null }; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  // Tag-szám lekérése
  const { count } = await ctx.supabase
    .from('szemely')
    .select('*', { count: 'exact', head: true })
    .eq('congregation_id', congregationId)
    .eq('isvisible', true)
  const tagSzam = count ?? 0

  // A megfelelő sáv keresése
  const { data: tiers, error } = await ctx.supabase
    .from('system_pricing_tiers')
    .select('*')
    .eq('aktiv', true)
    .eq('tipus', 'gyulekezet')
    .order('min_tagok', { ascending: true })
  if (error) return { error: error.message }

  const matchingTier = (tiers || []).find((t: Record<string, unknown>) => {
    const min = Number(t['min_tagok'])
    const max = t['max_tagok'] != null ? Number(t['max_tagok']) : Number.POSITIVE_INFINITY
    return tagSzam >= min && tagSzam <= max
  }) as SystemPricingTier | undefined

  return { data: { tagSzam, tier: matchingTier || null } }
}

// ─────────────────────────────────────────────────────────────────────────
// 7) Gyülekezet lista (subscription dropdown-hoz)
// ─────────────────────────────────────────────────────────────────────────

export async function listCongregationsForSubscription(): Promise<{
  data?: Array<{ id: string; name: string; tag_szam: number }>
  error?: string
}> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const { data: congs, error } = await ctx.supabase
    .from('congregations')
    .select('id, name')
    .order('name')
  if (error) return { error: error.message }

  // Tag-számok — EGYETLEN GROUP BY RPC (a korábbi N+1 helyett). 2026-06-07.
  const tagMap = new Map<string, number>()
  const { data: tagCounts } = await ctx.supabase.rpc('admin_overview_member_counts')
  if (Array.isArray(tagCounts)) {
    for (const r of tagCounts as Array<{ congregation_id: string; member_count: number }>) {
      if (r.congregation_id) tagMap.set(r.congregation_id, Number(r.member_count) || 0)
    }
  }

  const result = (congs || []).map((c) => {
    const row = c as { id: string; name: string }
    return { id: row.id, name: row.name, tag_szam: tagMap.get(row.id) || 0 }
  })

  return { data: result }
}

// ─────────────────────────────────────────────────────────────────────────
// 8) Árfolyam-kezelés — fx_rates_cache a system_settings-ben
// ─────────────────────────────────────────────────────────────────────────
//
// A valós USD/EUR/HUF → RON árfolyamokat naponta frissítjük a BNR-ből
// (fetchBnrRates), és a system_settings 'fx_rates_cache' kulcsú JSON-sorában
// cache-eljük. A cache-t a service-role (createAdminClient) írja — a god-mode
// PIN mintájára. A summary usdRonRate-je és a bevétel-könyvelés RON-konverziója
// is innen jön.

const SETTINGS_TABLE = 'system_settings'
const FX_CACHE_KEY = 'fx_rates_cache'
const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type FxPair = 'usd_ron' | 'eur_ron' | 'huf_ron'

export interface FxRates {
  usd_ron: number
  eur_ron: number
  huf_ron: number
  /** A publikált árfolyam dátuma ('YYYY-MM-DD'), ha ismert. */
  date: string | null
  source: 'bnr' | 'frankfurter' | 'manual' | 'fallback'
  /** Igaz, ha kézi felülírás van érvényben (nem írjuk felül automatán). */
  manual?: boolean
  /** A cache utolsó frissítése (ISO). */
  updated_at?: string | null
  /** Igaz, ha a cache elavult (>24h), de az élő frissítés nem sikerült. */
  stale?: boolean
}

const FX_FALLBACK: FxRates = {
  usd_ron: 4.41,
  eur_ron: 4.97,
  huf_ron: 0.0129,
  date: null,
  source: 'fallback',
}

function parseFxCache(value: string | null | undefined): FxRates | null {
  if (!value) return null
  try {
    const obj = JSON.parse(value) as Partial<FxRates>
    const usd = Number(obj.usd_ron)
    const eur = Number(obj.eur_ron)
    const huf = Number(obj.huf_ron)
    if (!Number.isFinite(usd) && !Number.isFinite(eur) && !Number.isFinite(huf)) return null
    return {
      usd_ron: Number.isFinite(usd) && usd > 0 ? usd : FX_FALLBACK.usd_ron,
      eur_ron: Number.isFinite(eur) && eur > 0 ? eur : FX_FALLBACK.eur_ron,
      huf_ron: Number.isFinite(huf) && huf > 0 ? huf : FX_FALLBACK.huf_ron,
      date: (obj.date as string | null) ?? null,
      source: (obj.source as FxRates['source']) ?? 'fallback',
      manual: Boolean(obj.manual),
    }
  } catch {
    return null
  }
}

/** Élő árfolyam-lekérés a BNR-ből → FxRates (vagy null, ha minden érték hiányzik). */
async function fetchFreshFx(): Promise<FxRates | null> {
  try {
    const r = await fetchBnrRates()
    if (!r.usd && !r.eur && !r.huf) return null
    return {
      usd_ron: r.usd && r.usd > 0 ? r.usd : FX_FALLBACK.usd_ron,
      eur_ron: r.eur && r.eur > 0 ? r.eur : FX_FALLBACK.eur_ron,
      huf_ron: r.huf && r.huf > 0 ? r.huf : FX_FALLBACK.huf_ron,
      date: r.date ?? null,
      source: r.source === 'frankfurter' ? 'frankfurter' : 'bnr',
    }
  } catch {
    return null
  }
}

/**
 * A hatályos árfolyamokat adja vissza — cache-first, ELLENÁLLÓAN:
 *   - kézi felülírás → mindig érvényes (nem frissül automatán);
 *   - friss cache (<24h) → visszaadjuk;
 *   - elavult/hiányzó → élő frissítés + visszaírás;
 *   - minden hiba esetén ésszerű fallback (4.41 stb.), SOHA nem dob.
 */
async function resolveFxRates(userId: string | null): Promise<FxRates> {
  const admin = createAdminClient()
  if (!admin) {
    // Nincs service-role — nem tudunk cache-elni; élő lekérés vagy fallback.
    return (await fetchFreshFx()) ?? FX_FALLBACK
  }

  let cached: FxRates | null = null
  let cachedUpdatedAt: number | null = null
  try {
    const { data, error } = await admin
      .from(SETTINGS_TABLE)
      .select('value, updated_at')
      .eq('key', FX_CACHE_KEY)
      .maybeSingle()
    if (!error && data) {
      cached = parseFxCache(data.value as string)
      const ts = data.updated_at ? new Date(data.updated_at as string).getTime() : NaN
      cachedUpdatedAt = Number.isFinite(ts) ? ts : null
      if (cached) cached.updated_at = (data.updated_at as string | null) ?? null
    }
  } catch {
    // ignore — a friss lekérés fedez
  }

  // Kézi felülírás — nem írjuk felül automatikusan
  if (cached && cached.manual) return cached

  // Friss cache (<24h)
  const fresh = cachedUpdatedAt != null && Date.now() - cachedUpdatedAt < FX_MAX_AGE_MS
  if (cached && fresh) return cached

  // Elavult vagy hiányzó → frissítés + visszaírás
  const live = await fetchFreshFx()
  if (live) {
    try {
      await admin.from(SETTINGS_TABLE).upsert(
        {
          key: FX_CACHE_KEY,
          value: JSON.stringify({
            usd_ron: live.usd_ron,
            eur_ron: live.eur_ron,
            huf_ron: live.huf_ron,
            date: live.date,
            source: live.source,
          }),
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'key' },
      )
    } catch {
      // A visszaírás hibája nem kritikus — az élő értéket visszaadjuk.
    }
    return { ...live, updated_at: new Date().toISOString() }
  }

  // Élő lekérés sikertelen → elavult cache (ha van), különben fallback
  if (cached) return { ...cached, stale: true }
  return FX_FALLBACK
}

/** A UI-nak: hatályos árfolyamok (cache/élő/fallback). */
export async function getFxRates(): Promise<{ data?: FxRates; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  return { data: await resolveFxRates(ctx.userId) }
}

/** Kézi árfolyam-felülírás egy párra (usd_ron / eur_ron / huf_ron). */
export async function setFxRateOverride(
  pair: FxPair,
  value: number,
): Promise<{ data?: FxRates; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!['usd_ron', 'eur_ron', 'huf_ron'].includes(pair)) {
    return { error: 'Érvénytelen árfolyampár.' }
  }
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    return { error: 'Az árfolyam pozitív szám kell legyen.' }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      error:
        'A kézi árfolyam mentéséhez add hozzá a SUPABASE_SERVICE_ROLE_KEY értéket a szerver környezetéhez.',
    }
  }

  const current = await resolveFxRates(ctx.userId)
  const updated: FxRates = {
    ...current,
    [pair]: num,
    manual: true,
    source: 'manual',
    date: new Date().toISOString().slice(0, 10),
  }

  const nowIso = new Date().toISOString()
  const { error } = await admin.from(SETTINGS_TABLE).upsert(
    {
      key: FX_CACHE_KEY,
      value: JSON.stringify({
        usd_ron: updated.usd_ron,
        eur_ron: updated.eur_ron,
        huf_ron: updated.huf_ron,
        date: updated.date,
        source: 'manual',
        manual: true,
      }),
      updated_at: nowIso,
      updated_by: ctx.userId,
    },
    { onConflict: 'key' },
  )
  if (error) {
    if (isMissingRelationError(error)) {
      return { error: 'A system_settings tábla még nem létezik — futtasd a szükséges SQL-migrációt.' }
    }
    return { error: error.message }
  }
  revalidatePath('/admin')
  return { data: { ...updated, updated_at: nowIso } }
}

// ─────────────────────────────────────────────────────────────────────────
// 9) Előfizetés hozzáférés-státusz vezérlése (funkció-gating admin oldala)
// ─────────────────────────────────────────────────────────────────────────

/**
 * A gyülekezet aktuális előfizetésének hozzáférés-státusza (access_status).
 * Ha nincs aktív sor, létrehoz egyet ésszerű defaulttal. Suspend esetén
 * audit-mezőket is beállít; újraaktiváláskor törli a suspend-auditot.
 *
 * ELLENÁLLÓ: ha a 2026-07-11 oszlopok még hiányoznak, világos hibaüzenetet ad
 * (nem 500-at) — a hívó UI a migrációra irányít.
 */
export async function setSubscriptionAccessStatus(
  congregationId: string,
  status: SubscriptionAccessStatus,
  reason?: string,
): Promise<{ id?: number; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  if (!VALID_ACCESS_STATUSES.includes(status)) {
    return { error: 'Érvénytelen hozzáférés-státusz.' }
  }
  if (!congregationId) return { error: 'Hiányzó gyülekezet-azonosító.' }

  const nowIso = new Date().toISOString()
  const MIGRATION_HINT =
    'A hozzáférés-státusz oszlopok még hiányoznak — futtasd a migration-docs/sql/2026-07-11-subscription-access.sql migrációt.'

  const auditFields: Record<string, unknown> = { access_status: status, updated_by: ctx.userId }
  if (status === 'suspended') {
    auditFields.suspended_at = nowIso
    auditFields.suspended_by = ctx.userId
    auditFields.suspend_reason = reason ?? null
  } else {
    // Újraaktiváláskor a suspend-audit törlése (a jelenlegi állapot tükrözése)
    auditFields.suspended_at = null
    auditFields.suspended_by = null
    auditFields.suspend_reason = null
  }

  // Van-e aktív subscription sor?
  const { data: existing, error: findErr } = await ctx.supabase
    .from('congregation_subscriptions')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('aktiv', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findErr && !isMissingRelationError(findErr) && !isMissingColumnError(findErr)) {
    return { error: findErr.message }
  }

  if (existing?.id) {
    const { error } = await ctx.supabase
      .from('congregation_subscriptions')
      .update(auditFields)
      .eq('id', existing.id as number)
    if (error) {
      if (isMissingColumnError(error)) return { error: MIGRATION_HINT }
      return { error: error.message }
    }
    revalidatePath('/admin')
    return { id: existing.id as number }
  }

  // Nincs sor → új, ésszerű defaulttal (a tipus csak az árazást írja le; a
  // tényleges hozzáférést az access_status vezérli)
  const insertPayload: Record<string, unknown> = {
    congregation_id: congregationId,
    pricing_tier_id: null,
    tipus: status === 'free' ? 'ingyenes' : status === 'trial' ? 'teszt' : 'havi',
    dij_ron: null,
    kezdet: nowIso.slice(0, 10),
    veg: null,
    aktiv: true,
    megjegyzes: reason ?? null,
    ...auditFields,
  }

  const { data: inserted, error: insErr } = await ctx.supabase
    .from('congregation_subscriptions')
    .insert([insertPayload])
    .select('id')
    .single()
  if (insErr) {
    if (isMissingColumnError(insErr)) return { error: MIGRATION_HINT }
    return { error: insErr.message }
  }
  revalidatePath('/admin')
  return { id: (inserted as { id: number }).id }
}

// ─────────────────────────────────────────────────────────────────────────
// 10) Gyülekezetek AKTÍV regisztrált felhasználóval — az előfizetés-felület magja
// ─────────────────────────────────────────────────────────────────────────

export interface CongregationAccessSubscription {
  id: number
  access_status: SubscriptionAccessStatus
  tipus: SubscriptionType
  dij_ron: number | null
  felar_ron: number | null
  veg: string | null
  pricing_tier_id: number | null
  pricing_tier_nev: string | null
  trial_ends_at: string | null
  grace_until: string | null
}

export interface CongregationWithAccess {
  id: string
  name: string
  tag_szam: number
  /** Hány AKTÍV regisztrált felhasználó tartozik ide. */
  activeUserCount: number
  /** Az aktuális aktív előfizetés, vagy null (biztonságos default: 'active' hozzáférés). */
  subscription: CongregationAccessSubscription | null
}

/**
 * Azok a gyülekezetek, amelyekhez van LEGALÁBB EGY hozzárendelt, AKTÍV
 * (profiles.status='active') regisztrált felhasználó — a kanonikus szabály
 * szerint: primary `congregation_id` VAGY gyülekezeti scope-ú, approved+active
 * `profile_roles` (lásd admin/actions.ts getCongregationsByDiocese). Mindegyikhez
 * az aktuális előfizetés (access_status, tipus, díj, felár, veg, tier) és a
 * taglétszám (a suggestPricingTierForCongregation-höz).
 */
export async function listCongregationsWithActiveUsers(): Promise<{
  data?: CongregationWithAccess[]
  error?: string
}> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  // 1. Aktív felhasználók + primary congregation
  const { data: profiles, error: pErr } = await ctx.supabase
    .from('profiles')
    .select('id, congregation_id')
    .eq('status', 'active')
  if (pErr) return { error: pErr.message }

  const activeUserIds = new Set<string>()
  const usersByCong = new Map<string, Set<string>>()
  const addUser = (cid: string | null | undefined, uid: string) => {
    if (!cid) return
    const set = usersByCong.get(cid) || new Set<string>()
    set.add(uid)
    usersByCong.set(cid, set)
  }
  for (const p of profiles || []) {
    const uid = p.id as string
    activeUserIds.add(uid)
    addUser(p.congregation_id as string | null, uid)
  }

  // 2. Gyülekezeti scope-ú profile_roles (approved + active) — csak aktív userre
  const { data: roles, error: rErr } = await ctx.supabase
    .from('profile_roles')
    .select('profile_id, scope_id')
    .eq('scope', 'congregation')
    .eq('approval_status', 'approved')
    .eq('active', true)
  if (rErr) return { error: rErr.message }
  for (const r of roles || []) {
    const uid = r.profile_id as string
    if (!activeUserIds.has(uid)) continue
    addUser(r.scope_id as string | null, uid)
  }

  const congIds = Array.from(usersByCong.keys())
  if (congIds.length === 0) return { data: [] }

  // 3. Nevek
  const { data: congs, error: cErr } = await ctx.supabase
    .from('congregations')
    .select('id, name, nev_hu')
    .in('id', congIds)
  if (cErr) return { error: cErr.message }
  const nameById = new Map<string, string>()
  for (const c of congs || []) {
    const row = c as { id: string; name: string | null; nev_hu: string | null }
    nameById.set(row.id, row.nev_hu || row.name || '—')
  }

  // 4. Tag-számok (RPC)
  const tagMap = new Map<string, number>()
  const { data: tagCounts } = await ctx.supabase.rpc('admin_overview_member_counts')
  if (Array.isArray(tagCounts)) {
    for (const r of tagCounts as Array<{ congregation_id: string; member_count: number }>) {
      if (r.congregation_id) tagMap.set(r.congregation_id, Number(r.member_count) || 0)
    }
  }

  // 5. Aktuális aktív előfizetések — legfrissebb per gyülekezet
  const subByCong = new Map<string, Record<string, unknown>>()
  const { data: subs, error: sErr } = await ctx.supabase
    .from('congregation_subscriptions')
    .select('*, system_pricing_tiers(nev)')
    .eq('aktiv', true)
    .in('congregation_id', congIds)
    .order('created_at', { ascending: false })
  if (sErr && !isMissingRelationError(sErr) && !isMissingColumnError(sErr)) {
    return { error: sErr.message }
  }
  for (const s of subs || []) {
    const row = s as Record<string, unknown>
    const cid = row['congregation_id'] as string
    if (!subByCong.has(cid)) subByCong.set(cid, row)
  }

  // 6. Összeállítás
  const result: CongregationWithAccess[] = congIds.map((cid) => {
    const s = subByCong.get(cid)
    const tier = s ? (s['system_pricing_tiers'] as { nev?: string } | null) : null
    const subscription: CongregationAccessSubscription | null = s
      ? {
          id: Number(s['id']),
          access_status: readAccessStatus(s['access_status']),
          tipus: ((s['tipus'] as SubscriptionType) ?? 'havi'),
          dij_ron: readNullableNumber(s['dij_ron']),
          felar_ron: readNullableNumber(s['felar_ron']),
          veg: (s['veg'] as string | null) ?? null,
          pricing_tier_id: (s['pricing_tier_id'] as number | null) ?? null,
          pricing_tier_nev: tier?.nev ?? null,
          trial_ends_at: (s['trial_ends_at'] as string | null) ?? null,
          grace_until: (s['grace_until'] as string | null) ?? null,
        }
      : null
    return {
      id: cid,
      name: nameById.get(cid) || '—',
      tag_szam: tagMap.get(cid) || 0,
      activeUserCount: usersByCong.get(cid)?.size || 0,
      subscription,
    }
  })

  result.sort((a, b) => a.name.localeCompare(b.name, 'hu'))
  return { data: result }
}
