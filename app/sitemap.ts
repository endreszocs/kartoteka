import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

/**
 * Dinamikus sitemap, ami a publikált gyülekezeti oldalakat és posztokat
 * tartalmazza. A lelkészi admin rész (dashboard, auth) nem kerül bele,
 * mert az nem publikus.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://kartoteka.local'

  const supabase = await createClient()

  const entries: MetadataRoute.Sitemap = []

  // Gyülekezeti kezdőoldalak
  const { data: sites } = await supabase
    .from('public_sites')
    .select('slug, updated_at, congregation_id, robots_index')
    .eq('is_published', true)

  for (const site of sites || []) {
    if (!site.robots_index) continue // opt-in SEO

    entries.push({
      url: `${baseUrl}/gy/${site.slug}`,
      lastModified: site.updated_at ? new Date(site.updated_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    })
    entries.push({
      url: `${baseUrl}/gy/${site.slug}/posts`,
      lastModified: site.updated_at ? new Date(site.updated_at) : new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    })
    entries.push({
      url: `${baseUrl}/gy/${site.slug}/rolunk`,
      lastModified: site.updated_at ? new Date(site.updated_at) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    })
    entries.push({
      url: `${baseUrl}/gy/${site.slug}/magazin`,
      lastModified: site.updated_at ? new Date(site.updated_at) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    })

    // Posztok
    const { data: posts } = await supabase
      .from('public_posts')
      .select('slug, published_at, updated_at')
      .eq('congregation_id', site.congregation_id)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())

    for (const post of posts || []) {
      entries.push({
        url: `${baseUrl}/gy/${site.slug}/posts/${post.slug}`,
        lastModified: post.updated_at
          ? new Date(post.updated_at)
          : post.published_at
            ? new Date(post.published_at)
            : new Date(),
        changeFrequency: 'monthly',
        priority: 0.5,
      })
    }

    // Publikált magazinlapszámok
    const { data: magazines } = await supabase
      .from('public_magazines')
      .select('id')
      .eq('congregation_id', site.congregation_id)

    for (const mag of magazines || []) {
      const { data: issues } = await supabase
        .from('public_magazine_issues')
        .select('issue_number, updated_at, published_at')
        .eq('magazine_id', mag.id)
        .eq('is_published', true)

      for (const issue of issues || []) {
        entries.push({
          url: `${baseUrl}/gy/${site.slug}/magazin/${encodeURIComponent(issue.issue_number)}`,
          lastModified: issue.updated_at
            ? new Date(issue.updated_at)
            : issue.published_at
              ? new Date(issue.published_at)
              : new Date(),
          changeFrequency: 'monthly',
          priority: 0.5,
        })
      }
    }
  }

  return entries
}
