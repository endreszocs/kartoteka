import 'server-only'

import { createPublicServerClient } from '@/lib/supabase/public-server'
import type { PublicSiteData } from '@/lib/public-site/site-loader'

export interface PublicSiteStats {
  members: number
  presbyters: number
  families: number
  ageDistribution: PublicSiteAgeDistribution | null
}

export interface PublicSiteAgeDistribution {
  under18: number
  age18To35: number
  age36To59: number
  age60Plus: number
  total: number
}

type PublicSiteStatsRow = {
  member_count: number | string | null
  presbyter_count: number | string | null
  family_count: number | string | null
}

type PublicSiteAgeDistributionRow = {
  under_18_count: number | string | null
  age_18_35_count: number | string | null
  age_36_59_count: number | string | null
  age_60_plus_count: number | string | null
  total_count: number | string | null
}

function toSafeCount(value: number | string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback
  const count = Number(value)
  return Number.isSafeInteger(count) && count >= 0 ? count : fallback
}

function parseAgeDistribution(
  data: unknown,
): PublicSiteAgeDistribution | null {
  if (!Array.isArray(data) || data.length === 0) return null

  const row = data[0] as PublicSiteAgeDistributionRow
  const distribution = {
    under18: toSafeCount(row.under_18_count, -1),
    age18To35: toSafeCount(row.age_18_35_count, -1),
    age36To59: toSafeCount(row.age_36_59_count, -1),
    age60Plus: toSafeCount(row.age_60_plus_count, -1),
    total: toSafeCount(row.total_count, -1),
  }

  const bucketTotal = distribution.under18
    + distribution.age18To35
    + distribution.age36To59
    + distribution.age60Plus

  if (
    Object.values(distribution).some((value) => value < 0)
    || distribution.total < 25
    || bucketTotal !== distribution.total
  ) {
    return null
  }

  return distribution
}

/**
 * Kizárólag aggregált, publikálásra engedélyezett számokat tölt be.
 *
 * A publikus oldal nem olvashatja közvetlenül a `szemely`, `presbiter` vagy
 * `haztartas` táblákat. Az RPC hiányakor/hibájakor csak a lelkész által
 * kézzel megadott publikus override jelenik meg; privát tábla-lekérdezésre
 * nem esünk vissza.
 */
export async function loadPublicSiteStats(site: PublicSiteData): Promise<PublicSiteStats> {
  const fallback: PublicSiteStats = {
    members: site.show_member_count ? site.override_member_count ?? 0 : 0,
    presbyters: site.show_presbyter_count ? site.override_presbyter_count ?? 0 : 0,
    families: site.show_family_count ? site.override_family_count ?? 0 : 0,
    ageDistribution: null,
  }

  if (
    !site.show_member_count
    && !site.show_presbyter_count
    && !site.show_family_count
    && !site.show_age_distribution
  ) {
    return fallback
  }

  const supabase = createPublicServerClient()
  const [countResult, ageResult] = await Promise.all([
    supabase.rpc('public_site_stats', { p_slug: site.slug }),
    site.show_age_distribution
      ? supabase.rpc('public_site_age_distribution', { p_slug: site.slug })
      : Promise.resolve({ data: null, error: null }),
  ])

  const ageDistribution = ageResult.error
    ? null
    : parseAgeDistribution(ageResult.data)

  if (
    countResult.error
    || !Array.isArray(countResult.data)
    || countResult.data.length === 0
  ) {
    return { ...fallback, ageDistribution }
  }

  const row = countResult.data[0] as PublicSiteStatsRow
  return {
    members: site.show_member_count
      ? toSafeCount(row.member_count, fallback.members)
      : 0,
    presbyters: site.show_presbyter_count
      ? toSafeCount(row.presbyter_count, fallback.presbyters)
      : 0,
    families: site.show_family_count
      ? toSafeCount(row.family_count, fallback.families)
      : 0,
    ageDistribution,
  }
}
