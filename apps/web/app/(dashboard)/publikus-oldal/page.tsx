import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { Globe, Eye, Plus, Newspaper, FileEdit, Settings, ExternalLink } from 'lucide-react'
import { PublicSiteAdminTabs } from '@/components/admin/public-site/public-site-admin-tabs'
import { PublicSiteSettingsForm } from '@/components/admin/public-site/public-site-settings-form'
import { MagazineManager } from '@/components/admin/public-site/magazine-manager'
import { suggestSlug } from '@/lib/public-site/slug'

export default async function PublikusOldalPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  const congregationId = access.effectiveCongregationId
  if (!congregationId) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="font-heading text-2xl mb-2">Nincs aktív gyülekezet</h1>
        <p className="text-muted-foreground">Csak gyülekezeti szintű felhasználók férnek hozzá.</p>
      </div>
    )
  }

  // Adatok lekérdezése
  const [siteResult, themesResult, postsResult, publishedResult, lastPostResult, issuesResult, magazineResult, magazineIssuesResult] = await Promise.all([
    access.supabase.from('public_sites').select('*').eq('congregation_id', congregationId).maybeSingle(),
    access.supabase.from('public_site_themes').select('id, preset_key, display_name, description, colors, typography, hero_style').eq('is_active', true).order('sort_order'),
    access.supabase.from('public_posts').select('*', { count: 'exact', head: true }).eq('congregation_id', congregationId),
    access.supabase.from('public_posts').select('*', { count: 'exact', head: true }).eq('congregation_id', congregationId).eq('status', 'published'),
    access.supabase.from('public_posts').select('id, title, slug, published_at, status').eq('congregation_id', congregationId).order('created_at', { ascending: false }).limit(10),
    access.supabase.from('public_magazine_issues').select('*', { count: 'exact', head: true }).eq('congregation_id', congregationId),
    access.supabase.from('public_magazines').select('*').eq('congregation_id', congregationId).maybeSingle(),
    access.supabase.from('public_magazine_issues').select('*').eq('congregation_id', congregationId).order('published_at', { ascending: false }),
  ])

  const site = siteResult.data
  const themes = themesResult.data || []
  const totalPosts = postsResult.count || 0
  const publishedPosts = publishedResult.count || 0
  const recentPosts = (lastPostResult.data || []) as Array<{ id: string; title: string; slug: string; published_at: string | null; status: string }>
  const totalIssues = issuesResult.count || 0
  const magazine = magazineResult.data as Record<string, unknown> | null
  const magazineIssues = (magazineIssuesResult.data || []) as Array<Record<string, unknown>>

  const defaultSlug = site?.slug || suggestSlug(access.congregationName || 'gyulekezet')
  const defaultName = site?.display_name || access.congregationName || 'Gyülekezet'

  // ── Áttekintés tartalom ─────────────────────────────────
  const overviewContent = (
    <div className="space-y-5">
      {!site ? (
        <div className="card-raised p-10 text-center">
          <Globe className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
          <h2 className="font-heading text-2xl mb-3">Még nincs beállítva</h2>
          <p className="text-slate-500 max-w-lg mx-auto mb-6">
            A publikus oldal egy lehetőség — nem kötelező. Beállíthatsz egyedi címet, témát, és publikálhatsz híreket.
          </p>
        </div>
      ) : (
        <>
          {/* Publikálási állapot */}
          <div className="card-raised p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-heading text-xl text-slate-800">{site.display_name}</h2>
                  {site.is_published ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">Élő</span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">Piszkozat</span>
                  )}
                </div>
                {site.tagline && <p className="text-sm text-slate-500">{site.tagline}</p>}
                <p className="text-xs text-slate-400 mt-1">Cím: /gy/{site.slug}</p>
              </div>
              {site.is_published && (
                <Link
                  href={`/gy/${site.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 text-sm font-medium hover:bg-slate-50"
                >
                  <Eye className="w-4 h-4" /> Megtekintés
                </Link>
              )}
            </div>
          </div>

          {/* Statisztikák */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card-raised p-5">
              <div className="flex items-center gap-2 mb-2">
                <FileEdit className="w-5 h-5 text-emerald-600" />
                <h3 className="font-heading text-base text-slate-800">Bejegyzések</h3>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Publikált</span><span className="font-semibold">{publishedPosts}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Összes</span><span className="font-semibold">{totalPosts}</span></div>
              </div>
              <Link href="/publikus-oldal/bejegyzesek/uj" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
                <Plus className="w-3.5 h-3.5" /> Új bejegyzés
              </Link>
            </div>

            <div className="card-raised p-5">
              <div className="flex items-center gap-2 mb-2">
                <Newspaper className="w-5 h-5 text-emerald-600" />
                <h3 className="font-heading text-base text-slate-800">Magazin</h3>
              </div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Lapszámok</span><span className="font-semibold">{totalIssues}</span></div>
            </div>

            <div className="card-raised p-5">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                <h3 className="font-heading text-base text-slate-800">Beállítások</h3>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">SEO</span><span className="font-semibold">{site.robots_index ? 'Igen' : 'Nem'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-semibold truncate max-w-[120px]">{site.contact_email || '—'}</span></div>
              </div>
            </div>
          </div>

          {/* Utolsó bejegyzések */}
          {recentPosts.length > 0 && (
            <div className="card-raised p-5">
              <h3 className="font-heading text-base text-slate-800 mb-3">Legutóbbi bejegyzések</h3>
              <div className="space-y-2">
                {recentPosts.slice(0, 5).map((post) => (
                  <Link key={post.id} href={`/publikus-oldal/bejegyzesek/${post.id}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50 transition">
                    <span className="text-sm font-medium text-slate-700 truncate">{post.title}</span>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${post.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {post.status === 'published' ? 'Publikált' : 'Piszkozat'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  // ── Beállítások tartalom ─────────────────────────────────
  const settingsContent = (
    <div className="max-w-5xl">
      <PublicSiteSettingsForm
        initial={{
          slug: site?.slug ?? defaultSlug,
          display_name: site?.display_name ?? defaultName,
          tagline: site?.tagline ?? '',
          hero_image_url: site?.hero_image_url ?? '',
          crest_image_url: site?.crest_image_url ?? '',
          theme_id: site?.theme_id ?? themes?.[0]?.id ?? '',
          custom_primary_color: site?.custom_primary_color ?? '',
          custom_accent_color: site?.custom_accent_color ?? '',
          contact_email: site?.contact_email ?? '',
          contact_phone: site?.contact_phone ?? '',
          address: site?.address ?? '',
          about_html: site?.about_html ?? '',
          is_published: site?.is_published ?? false,
          robots_index: site?.robots_index ?? false,
          show_member_count: site?.show_member_count ?? false,
          show_presbyter_count: site?.show_presbyter_count ?? false,
          show_family_count: site?.show_family_count ?? false,
          show_age_distribution: site?.show_age_distribution ?? false,
          override_member_count: site?.override_member_count ?? null,
          override_presbyter_count: site?.override_presbyter_count ?? null,
          override_family_count: site?.override_family_count ?? null,
        }}
        themes={themes}
      />
    </div>
  )

  // ── Bejegyzések tartalom ─────────────────────────────────
  const postsContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg text-slate-800">Bejegyzések kezelése</h3>
        <Link
          href="/publikus-oldal/bejegyzesek/uj"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" /> Új bejegyzés
        </Link>
      </div>

      {recentPosts.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <FileEdit className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">Még nincs bejegyzés.</p>
          <Link href="/publikus-oldal/bejegyzesek/uj" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
            <Plus className="w-3.5 h-3.5" /> Írj egy újat!
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {recentPosts.map((post) => (
            <Link key={post.id} href={`/publikus-oldal/bejegyzesek/${post.id}`} className="card-raised flex items-center justify-between p-4 hover:shadow-md transition">
              <div>
                <p className="text-sm font-semibold text-slate-800">{post.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {post.published_at ? new Date(post.published_at).toLocaleDateString('hu-HU') : 'Piszkozat'}
                </p>
              </div>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${post.status === 'published' ? 'bg-emerald-50 text-emerald-700' : post.status === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                {post.status === 'published' ? 'Publikált' : post.status === 'archived' ? 'Archivált' : 'Piszkozat'}
              </span>
            </Link>
          ))}
          <Link href="/publikus-oldal/bejegyzesek" className="block text-center text-sm text-emerald-600 font-medium hover:text-emerald-700 py-2">
            Összes bejegyzés megtekintése →
          </Link>
        </div>
      )}
    </div>
  )

  // ── Magazin tartalom ─────────────────────────────────────
  const magazineContent = (
    <div>
      <MagazineManager magazine={magazine as never} issues={magazineIssues as never[]} />
    </div>
  )

  return (
    <div className="w-full max-w-screen-2xl mx-auto py-6 px-2 sm:px-4">
      <PublicSiteAdminTabs
        overviewContent={overviewContent}
        settingsContent={settingsContent}
        postsContent={postsContent}
        magazineContent={magazineContent}
      />
    </div>
  )
}
