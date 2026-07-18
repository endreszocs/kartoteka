import { createPublicServerClient } from '@/lib/supabase/public-server'
import { safePublicHttpsUrl } from '@/lib/public-site/safe-url'

export interface MagazineIssue {
  id: string
  issue_number: string
  title: string | null
  cover_image_url: string | null
  pdf_url: string | null
  published_at: string | null
  notes: string | null
}

export interface Magazine {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
}

export interface MagazineWithIssues {
  magazine: Magazine
  issues: MagazineIssue[]
  pagination: {
    page: number
    pageSize: number
    hasPrevious: boolean
    hasNext: boolean
  }
}

export interface PublishedMagazineOptions {
  page?: number
  pageSize?: number
  includeIssues?: boolean
}

export const PUBLIC_MAGAZINE_PAGE_SIZE = 12

const MAX_MAGAZINE_PAGE_SIZE = 24
const MAX_MAGAZINE_PAGE = 10_000

function sanitizeMagazineIssue(issue: MagazineIssue): MagazineIssue {
  return {
    ...issue,
    cover_image_url: safePublicHttpsUrl(issue.cover_image_url),
    pdf_url: safePublicHttpsUrl(issue.pdf_url),
  }
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || !value || value < 1) return fallback
  return Math.min(value, maximum)
}

/**
 * Betölti a gyülekezet első aktív magazinját és a publikált lapszámok egy
 * korlátozott oldalát. Egy plusz rekord lekérésével külön count(*) nélkül is
 * megállapítható, hogy van-e következő oldal.
 */
export async function loadPublishedMagazine(
  congregationId: string,
  options: PublishedMagazineOptions = {},
): Promise<MagazineWithIssues | null> {
  const supabase = createPublicServerClient()
  const page = boundedPositiveInteger(options.page, 1, MAX_MAGAZINE_PAGE)
  const pageSize = boundedPositiveInteger(
    options.pageSize,
    PUBLIC_MAGAZINE_PAGE_SIZE,
    MAX_MAGAZINE_PAGE_SIZE,
  )

  const { data: magazine } = await supabase
    .from('public_magazines')
    .select('id, title, description, cover_image_url')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle<Magazine>()

  if (!magazine) return null

  const safeMagazine: Magazine = {
    ...magazine,
    cover_image_url: safePublicHttpsUrl(magazine.cover_image_url),
  }

  if (options.includeIssues === false) {
    return {
      magazine: safeMagazine,
      issues: [],
      pagination: {
        page: 1,
        pageSize: 0,
        hasPrevious: false,
        hasNext: false,
      },
    }
  }

  const from = (page - 1) * pageSize

  const { data: issues } = await supabase
    .from('public_magazine_issues')
    .select('id, issue_number, title, cover_image_url, pdf_url, published_at, notes')
    .eq('magazine_id', magazine.id)
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize)

  const issueRows = ((issues || []) as MagazineIssue[]).map(sanitizeMagazineIssue)

  return {
    magazine: safeMagazine,
    issues: issueRows.slice(0, pageSize),
    pagination: {
      page,
      pageSize,
      hasPrevious: page > 1,
      hasNext: issueRows.length > pageSize,
    },
  }
}

/**
 * Egy konkrét lapszám betöltése issue_number alapján.
 */
export async function loadPublishedIssue(
  magazineId: string,
  issueNumber: string,
): Promise<MagazineIssue | null> {
  const supabase = createPublicServerClient()

  const { data } = await supabase
    .from('public_magazine_issues')
    .select('id, issue_number, title, cover_image_url, pdf_url, published_at, notes')
    .eq('magazine_id', magazineId)
    .eq('issue_number', issueNumber)
    .eq('is_published', true)
    .maybeSingle<MagazineIssue>()

  return data ? sanitizeMagazineIssue(data as MagazineIssue) : null
}
