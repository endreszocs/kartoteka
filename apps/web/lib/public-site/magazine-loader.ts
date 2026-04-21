import { createClient } from '@/lib/supabase/server'

export interface MagazineIssue {
  id: string
  issue_number: string
  title: string | null
  cover_image_url: string | null
  pdf_url: string
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
}

/**
 * Betölti a gyülekezet első aktív magazinját és az összes publikált lapszámot.
 */
export async function loadPublishedMagazine(
  congregationId: string,
): Promise<MagazineWithIssues | null> {
  const supabase = await createClient()

  const { data: magazine } = await supabase
    .from('public_magazines')
    .select('id, title, description, cover_image_url')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Magazine>()

  if (!magazine) return null

  const { data: issues } = await supabase
    .from('public_magazine_issues')
    .select('id, issue_number, title, cover_image_url, pdf_url, published_at, notes')
    .eq('magazine_id', magazine.id)
    .eq('is_published', true)
    .order('published_at', { ascending: false })

  return {
    magazine,
    issues: (issues || []) as MagazineIssue[],
  }
}

/**
 * Egy konkrét lapszám betöltése issue_number alapján.
 */
export async function loadPublishedIssue(
  magazineId: string,
  issueNumber: string,
): Promise<MagazineIssue | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('public_magazine_issues')
    .select('id, issue_number, title, cover_image_url, pdf_url, published_at, notes')
    .eq('magazine_id', magazineId)
    .eq('issue_number', issueNumber)
    .eq('is_published', true)
    .maybeSingle<MagazineIssue>()

  return data || null
}
