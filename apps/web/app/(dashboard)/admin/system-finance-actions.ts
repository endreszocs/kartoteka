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

  // 2. Tag-számok
  const tagMap = new Map<string, number>()
  for (const c of congregations || []) {
    const cid = (c as { id: string }).id
    const { count } = await ctx.supabase
      .from('szemely')
      .select('*', { count: 'exact', head: true })
      .eq('congregation_id', cid)
      .eq('isvisible', true)
    tagMap.set(cid, count ?? 0)
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
}

export async function upsertCongregationSubscription(
  input: UpsertSubscriptionInput,
): Promise<{ id?: number; error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }

  const payload = {
    congregation_id: input.congregation_id,
    pricing_tier_id: input.pricing_tier_id ?? null,
    tipus: input.tipus,
    dij_ron: input.dij_ron ?? null,
    kezdet: input.kezdet ?? new Date().toISOString().slice(0, 10),
    veg: input.veg ?? null,
    aktiv: input.aktiv ?? true,
    megjegyzes: input.megjegyzes ?? null,
  }

  if (input.id) {
    const { error } = await ctx.supabase
      .from('congregation_subscriptions')
      .update(payload)
      .eq('id', input.id)
    if (error) return { error: error.message }
    revalidatePath('/admin')
    return { id: input.id }
  }

  const { data, error } = await ctx.supabase
    .from('congregation_subscriptions')
    .insert([payload])
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { id: (data as { id: number }).id }
}

export async function deleteSubscription(id: number): Promise<{ error?: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await ctx.supabase.from('congregation_subscriptions').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return {}
}

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
  const subs = (subsRes.data || []) as Array<{
    id: number
    congregation_id: string
    pricing_tier_id: number | null
    tipus: SubscriptionType
    dij_ron: number | null
  }>
  const congs = (congsRes.data || []) as Array<{ id: string; name: string }>

  // Havi költség: aktív system_finance_costs × arfolyam_usd
  let monthlyCostRon = 0
  for (const c of costs) {
    if (c.havi_ron && c.havi_ron > 0) {
      monthlyCostRon += Number(c.havi_ron)
    } else {
      monthlyCostRon += Number(c.havi_usd) * Number(c.arfolyam_usd)
    }
  }

  // Havi bevétel: aktív subscription-ök + a subscription nélküli gyülekezetek
  // tag-szám szerinti automatikus árazást NEM SZÁMOLJUK be (azok még nem fizetnek)
  let monthlyRevenueRon = 0
  let annualRevenueRon = 0
  const tierMap = new Map<number, SystemPricingTier>()
  for (const t of tiers) tierMap.set(t.id, t)

  for (const s of subs) {
    const tier = s.pricing_tier_id ? tierMap.get(s.pricing_tier_id) : null
    const havi = Number(s.dij_ron ?? tier?.havi_dij_ron ?? 0)
    const eves = Number(s.dij_ron ?? tier?.eves_dij_ron ?? 0)

    if (s.tipus === 'havi') {
      monthlyRevenueRon += havi
      annualRevenueRon += havi * 12
    } else if (s.tipus === 'eves') {
      annualRevenueRon += eves
      monthlyRevenueRon += eves / 12
    }
    // 'teszt' / 'kedvezmeny' / 'ingyenes' — a dij_ron felülír, vagy 0
  }

  // Gyülekezetek tag-szám szerinti bontása
  const tierStats = new Map<number, { count: number; total: number }>()
  for (const s of subs) {
    if (!s.pricing_tier_id) continue
    const existing = tierStats.get(s.pricing_tier_id) || { count: 0, total: 0 }
    const tier = tierMap.get(s.pricing_tier_id)
    const havi = Number(s.dij_ron ?? tier?.havi_dij_ron ?? 0)
    existing.count += 1
    existing.total += havi
    tierStats.set(s.pricing_tier_id, existing)
  }

  const congregationsByTier = Array.from(tierStats.entries())
    .map(([tierId, stat]) => {
      const tier = tierMap.get(tierId)
      return {
        tierId,
        tierNev: tier?.nev || `Sáv ${tierId}`,
        count: stat.count,
        avgDij: stat.count > 0 ? stat.total / stat.count : 0,
        totalRevenue: stat.total,
      }
    })
    .sort((a, b) => b.count - a.count)

  const activeSubsCount = subs.length
  const totalCongregations = congs.length
  const congregationsWithoutSubscription = Math.max(0, totalCongregations - activeSubsCount)

  // Átlag USD→RON árfolyam az aktív költségekből
  const validRates = costs.filter((c) => c.arfolyam_usd && c.arfolyam_usd > 0).map((c) => Number(c.arfolyam_usd))
  const usdRonRate = validRates.length > 0 ? validRates.reduce((s, v) => s + v, 0) / validRates.length : 4.41

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

  // Átlag havi díj (a gyülekezeti sávok súlyozott átlaga — egyszerű számtani átlag most)
  const avgHaviDij =
    tiers.length > 0
      ? tiers.reduce((s, t) => s + Number(t.havi_dij_ron), 0) / tiers.length
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

  const result: Array<{ id: string; name: string; tag_szam: number }> = []
  for (const c of congs || []) {
    const row = c as { id: string; name: string }
    const { count } = await ctx.supabase
      .from('szemely')
      .select('*', { count: 'exact', head: true })
      .eq('congregation_id', row.id)
      .eq('isvisible', true)
    result.push({ id: row.id, name: row.name, tag_szam: count ?? 0 })
  }

  return { data: result }
}
