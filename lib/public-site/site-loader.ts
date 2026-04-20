import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { FALLBACK_THEME, type PublicSiteTheme } from './theme-presets'

export interface PublicSiteData {
  id: string
  congregation_id: string
  slug: string
  display_name: string
  tagline: string | null
  hero_image_url: string | null
  crest_image_url: string | null
  theme: PublicSiteTheme
  custom_primary_color: string | null
  custom_accent_color: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  about_html: string | null
  robots_index: boolean
  show_member_count?: boolean
  show_presbyter_count?: boolean
  show_family_count?: boolean
  show_age_distribution?: boolean
  override_member_count?: number | null
  override_presbyter_count?: number | null
  override_family_count?: number | null
}

interface PublicSiteRow {
  id: string
  congregation_id: string
  slug: string
  display_name: string
  tagline: string | null
  hero_image_url: string | null
  crest_image_url: string | null
  theme_id: string | null
  custom_primary_color: string | null
  custom_accent_color: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  about_html: string | null
  robots_index: boolean
  is_published: boolean
  show_member_count?: boolean
  show_presbyter_count?: boolean
  show_family_count?: boolean
  show_age_distribution?: boolean
  override_member_count?: number | null
  override_presbyter_count?: number | null
  override_family_count?: number | null
}

interface PublicSiteThemeRow {
  id: string
  preset_key: string
  display_name: string
  description: string | null
  colors: PublicSiteTheme['colors']
  typography: PublicSiteTheme['typography']
  hero_style: PublicSiteTheme['hero_style']
  border_radius: string
  sort_order: number
  is_active: boolean
}

/**
 * Beolvassa a közzétett publikus oldalt slug alapján. Ha nincs ilyen slug
 * vagy nincs publikálva, null-t ad vissza.
 *
 * React `cache()` miatt egy request-en belül ugyanazzal a slug-gal való
 * hívások egy közös queryt használnak (layout + page + opengraph-image).
 */
export const loadPublicSiteBySlug = cache(
  async (slug: string): Promise<PublicSiteData | null> => {
    const supabase = await createClient()

    const { data: site, error } = await supabase
      .from('public_sites')
      .select(
        'id, congregation_id, slug, display_name, tagline, hero_image_url, crest_image_url, theme_id, custom_primary_color, custom_accent_color, contact_email, contact_phone, address, about_html, robots_index, is_published, show_member_count, show_presbyter_count, show_family_count, show_age_distribution, override_member_count, override_presbyter_count, override_family_count',
      )
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle<PublicSiteRow>()

    if (error || !site) return null

    // Téma betöltése
    let theme: PublicSiteTheme = FALLBACK_THEME
    if (site.theme_id) {
      const { data: themeRow } = await supabase
        .from('public_site_themes')
        .select('*')
        .eq('id', site.theme_id)
        .maybeSingle<PublicSiteThemeRow>()
      if (themeRow) {
        theme = themeRow as PublicSiteTheme
      }
    }

    return {
      id: site.id,
      congregation_id: site.congregation_id,
      slug: site.slug,
      display_name: site.display_name,
      tagline: site.tagline,
      hero_image_url: site.hero_image_url,
      crest_image_url: site.crest_image_url,
      theme,
      custom_primary_color: site.custom_primary_color,
      custom_accent_color: site.custom_accent_color,
      contact_email: site.contact_email,
      contact_phone: site.contact_phone,
      address: site.address,
      about_html: site.about_html,
      robots_index: site.robots_index,
      show_member_count: site.show_member_count ?? false,
      show_presbyter_count: site.show_presbyter_count ?? false,
      show_family_count: site.show_family_count ?? false,
      show_age_distribution: site.show_age_distribution ?? false,
      override_member_count: site.override_member_count ?? null,
      override_presbyter_count: site.override_presbyter_count ?? null,
      override_family_count: site.override_family_count ?? null,
    }
  },
)

export interface PublicPostListItem {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  author_name: string | null
}

export interface PublicPostDetail extends PublicPostListItem {
  body_html: string
}

/**
 * Publikált posztok listázása egy gyülekezetnek (csak publikált sorok).
 */
export async function loadPublishedPosts(
  congregationId: string,
  limit = 20,
): Promise<PublicPostListItem[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('public_posts')
    .select('id, slug, title, excerpt, cover_image_url, published_at, author_id')
    .eq('congregation_id', congregationId)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  return (data as Array<PublicPostListItem & { author_id: string | null }>).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    cover_image_url: row.cover_image_url,
    published_at: row.published_at,
    author_name: null,
  }))
}

/**
 * Egy publikált poszt részletes adata slug alapján.
 */
export async function loadPublishedPostBySlug(
  congregationId: string,
  postSlug: string,
): Promise<PublicPostDetail | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('public_posts')
    .select('id, slug, title, excerpt, cover_image_url, published_at, body_html')
    .eq('congregation_id', congregationId)
    .eq('slug', postSlug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .maybeSingle()

  if (!data) return null

  return {
    id: (data as { id: string }).id,
    slug: (data as { slug: string }).slug,
    title: (data as { title: string }).title,
    excerpt: (data as { excerpt: string | null }).excerpt,
    cover_image_url: (data as { cover_image_url: string | null }).cover_image_url,
    published_at: (data as { published_at: string | null }).published_at,
    body_html: (data as { body_html: string }).body_html,
    author_name: null,
  }
}
