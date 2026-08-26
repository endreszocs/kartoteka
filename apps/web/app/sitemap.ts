import type { MetadataRoute } from 'next'
import { z } from 'zod'

import { createPublicServerClient } from '@/lib/supabase/public-server'

const sitemapRouteKindSchema = z.enum([
  'home',
  'posts',
  'about',
  'magazine',
  'post',
  'magazine_issue',
])

type SitemapRouteKind = z.infer<typeof sitemapRouteKindSchema>

const sitemapRpcRowSchema = z.object({
  site_slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
  route_kind: sitemapRouteKindSchema,
  content_slug: z.string().min(1).max(200).nullable(),
  last_modified: z.string().nullable(),
})

const ROUTE_METADATA: Record<
  SitemapRouteKind | 'alkalmak',
  Pick<MetadataRoute.Sitemap[number], 'changeFrequency' | 'priority'>
> = {
  home: { changeFrequency: 'weekly', priority: 0.9 },
  // Az Alkalmaink oldal nem az RPC felsorolásából jön (lásd lentebb) — de a
  // gyakorisága/súlya itt, a többivel egy helyen lakik.
  alkalmak: { changeFrequency: 'weekly', priority: 0.8 },
  posts: { changeFrequency: 'daily', priority: 0.7 },
  about: { changeFrequency: 'monthly', priority: 0.6 },
  magazine: { changeFrequency: 'monthly', priority: 0.6 },
  post: { changeFrequency: 'monthly', priority: 0.5 },
  magazine_issue: { changeFrequency: 'monthly', priority: 0.5 },
}

function resolveBaseUrl(): string {
  const candidate =
    process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || 'https://kartoteka.local'

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return 'https://kartoteka.local'
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return 'https://kartoteka.local'
  }
}

function isMissingSitemapRpc(code: string | undefined): boolean {
  return code === 'PGRST202' || code === '42883'
}

function safeLastModified(value: string | null): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function buildRpcSitemapEntries(
  baseUrl: string,
  rawRows: unknown,
): MetadataRoute.Sitemap | null {
  const parsedRows = z.array(sitemapRpcRowSchema).safeParse(rawRows)
  if (!parsedRows.success) {
    console.error('[sitemap] A public_sitemap_entries RPC szerződése érvénytelen.')
    return null
  }

  const entries: MetadataRoute.Sitemap = []
  const seenUrls = new Set<string>()

  for (const row of parsedRows.data) {
    const siteBase = `${baseUrl}/gy/${encodeURIComponent(row.site_slug)}`
    let url: string

    switch (row.route_kind) {
      case 'home':
        url = siteBase
        break
      case 'posts':
        url = `${siteBase}/posts`
        break
      case 'about':
        url = `${siteBase}/rolunk`
        break
      case 'magazine':
        url = `${siteBase}/magazin`
        break
      case 'post':
        if (!row.content_slug) continue
        url = `${siteBase}/posts/${encodeURIComponent(row.content_slug)}`
        break
      case 'magazine_issue':
        if (!row.content_slug) continue
        url = `${siteBase}/magazin/${encodeURIComponent(row.content_slug)}`
        break
    }

    if (seenUrls.has(url)) continue
    seenUrls.add(url)

    const lastModified = safeLastModified(row.last_modified)
    entries.push({
      url,
      ...(lastModified ? { lastModified } : {}),
      ...ROUTE_METADATA[row.route_kind],
    })

    // 2026-08-27 — az Alkalmaink oldal (éves naptár) a `home` sorból
    // SZÁRMAZTATVA kerül a sitemapbe.
    // ⚠️ Miért nem az RPC adja: a `route_kind` felsorolás az adatbázisban él,
    // bővítése újabb migrációt kívánna. Ez az oldal minden publikált
    // gyülekezetnél létezik (üresen is: a rendszeres alkalmakat és az
    // elérhetőséget mutatja), tehát nincs mit lekérdezni hozzá.
    if (row.route_kind === 'home') {
      const alkalmakUrl = `${siteBase}/alkalmak`
      if (!seenUrls.has(alkalmakUrl)) {
        seenUrls.add(alkalmakUrl)
        entries.push({
          url: alkalmakUrl,
          ...(lastModified ? { lastModified } : {}),
          ...ROUTE_METADATA.alkalmak,
        })
      }
    }
  }

  return entries
}

/**
 * Átmeneti kompatibilitási út a 2026-07-18-as sitemap RPC migráció ELŐTT.
 * A public-site security migráció után a közvetlen public_sites SELECT már
 * tiltott, ezért ez az ág akkor legfeljebb üres listát adhat, adatot nem kerül
 * meg. A release-sorrendben az RPC migráció megelőzi a frontend deployt.
 */
async function loadLegacySitemap(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicServerClient()
  const entries: MetadataRoute.Sitemap = []

  const { data: sites, error: sitesError } = await supabase
    .from('public_sites')
    .select('slug, updated_at, congregation_id, robots_index')
    .eq('is_published', true)

  if (sitesError) {
    console.error('[sitemap] A kompatibilitási public_sites olvasás nem érhető el.')
    return entries
  }

  for (const site of sites || []) {
    if (!site.robots_index) continue
    const siteBase = `${baseUrl}/gy/${encodeURIComponent(site.slug)}`
    const siteUpdatedAt = safeLastModified(site.updated_at)

    entries.push(
      {
        url: siteBase,
        ...(siteUpdatedAt ? { lastModified: siteUpdatedAt } : {}),
        ...ROUTE_METADATA.home,
      },
      {
        url: `${siteBase}/alkalmak`,
        ...(siteUpdatedAt ? { lastModified: siteUpdatedAt } : {}),
        ...ROUTE_METADATA.alkalmak,
      },
      {
        url: `${siteBase}/posts`,
        ...(siteUpdatedAt ? { lastModified: siteUpdatedAt } : {}),
        ...ROUTE_METADATA.posts,
      },
      {
        url: `${siteBase}/rolunk`,
        ...(siteUpdatedAt ? { lastModified: siteUpdatedAt } : {}),
        ...ROUTE_METADATA.about,
      },
      {
        url: `${siteBase}/magazin`,
        ...(siteUpdatedAt ? { lastModified: siteUpdatedAt } : {}),
        ...ROUTE_METADATA.magazine,
      },
    )

    const { data: posts } = await supabase
      .from('public_posts')
      .select('slug, published_at, updated_at')
      .eq('congregation_id', site.congregation_id)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())

    for (const post of posts || []) {
      const lastModified = safeLastModified(post.updated_at || post.published_at)
      entries.push({
        url: `${siteBase}/posts/${encodeURIComponent(post.slug)}`,
        ...(lastModified ? { lastModified } : {}),
        ...ROUTE_METADATA.post,
      })
    }

    const { data: magazines } = await supabase
      .from('public_magazines')
      .select('id')
      .eq('congregation_id', site.congregation_id)

    for (const magazine of magazines || []) {
      const { data: issues } = await supabase
        .from('public_magazine_issues')
        .select('issue_number, updated_at, published_at')
        .eq('magazine_id', magazine.id)
        .eq('is_published', true)

      for (const issue of issues || []) {
        const lastModified = safeLastModified(issue.updated_at || issue.published_at)
        entries.push({
          url: `${siteBase}/magazin/${encodeURIComponent(issue.issue_number)}`,
          ...(lastModified ? { lastModified } : {}),
          ...ROUTE_METADATA.magazine_issue,
        })
      }
    }
  }

  return entries
}

/**
 * Csak SEO-ra engedélyezett, ténylegesen publikált útvonalakat tartalmaz.
 * A normál út a szűk RPC, így nincs szükség public_sites vagy congregations
 * közvetlen anon olvasására, és bejelentkezési cookie sem befolyásolja az eredményt.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveBaseUrl()
  const supabase = createPublicServerClient()
  const { data, error } = await supabase.rpc('public_sitemap_entries')

  if (!error) {
    return buildRpcSitemapEntries(baseUrl, data) ?? []
  }

  if (isMissingSitemapRpc(error.code)) {
    return loadLegacySitemap(baseUrl)
  }

  console.error('[sitemap] A public_sitemap_entries RPC nem érhető el.')
  return []
}
