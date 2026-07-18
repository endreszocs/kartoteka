import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileEdit,
  Globe2,
  Mail,
  Newspaper,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { PublicSiteAdminNav } from '@/components/admin/public-site/public-site-admin-nav'
import { PublicSiteThemeGallery } from '@/components/admin/public-site/public-site-theme-gallery'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { canAccessPublicSiteAdmin } from '@/lib/public-site/admin-access'
import {
  getPublicVisualTheme,
  PUBLIC_VISUAL_THEME_KEYS,
} from '@/lib/public-site/visual-theme-registry'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Gyülekezeti weboldal · Kartotéka',
  description: 'A gyülekezeti weboldal állapotának és tartalmainak áttekintése.',
}

interface RecentPost {
  id: string
  title: string
  published_at: string | null
  updated_at: string
  status: string
}

type QuickActionTone = 'emerald' | 'violet' | 'amber' | 'sky'

interface QuickAction {
  title: string
  description: string
  href: string
  icon: LucideIcon
  tone: QuickActionTone
}

const POST_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Piszkozat', className: 'bg-amber-50 text-amber-800' },
  published: { label: 'Publikált', className: 'bg-emerald-50 text-emerald-800' },
  archived: { label: 'Archivált', className: 'bg-slate-100 text-slate-600' },
}

const QUICK_ACTION_TONE: Record<QuickActionTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100',
  violet: 'bg-violet-50 text-violet-700 group-hover:bg-violet-100',
  amber: 'bg-amber-50 text-amber-700 group-hover:bg-amber-100',
  sky: 'bg-sky-50 text-sky-700 group-hover:bg-sky-100',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function CountValue({ value }: { value: number | null }) {
  return <span className="font-mono text-2xl font-bold text-slate-900">{value ?? '—'}</span>
}

export default async function PublikusOldalPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canAccessPublicSiteAdmin(access, 'read')) redirect('/')

  const congregationId = access.effectiveCongregationId
  if (!congregationId) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <h1 className="font-heading text-2xl text-slate-900">Nincs aktív gyülekezet</h1>
        <p className="mt-2 text-sm text-slate-500">
          A gyülekezeti weboldal kezelője csak gyülekezeti hatókörben érhető el.
        </p>
      </div>
    )
  }

  const canWrite = canAccessPublicSiteAdmin(access, 'write')
  const [
    siteResult,
    themesResult,
    totalPostsResult,
    publishedPostsResult,
    draftPostsResult,
    archivedPostsResult,
    recentPostsResult,
    totalIssuesResult,
    publishedIssuesResult,
  ] = await Promise.all([
    access.supabase
      .from('public_sites')
      .select(
        'id, slug, display_name, tagline, theme_id, contact_email, is_published, robots_index, updated_at',
      )
      .eq('congregation_id', congregationId)
      .maybeSingle(),
    access.supabase
      .from('public_site_themes')
      .select('id, preset_key, display_name')
      .eq('is_active', true)
      .in('preset_key', [...PUBLIC_VISUAL_THEME_KEYS])
      .order('sort_order'),
    access.supabase
      .from('public_posts')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId),
    access.supabase
      .from('public_posts')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId)
      .eq('status', 'published'),
    access.supabase
      .from('public_posts')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId)
      .eq('status', 'draft'),
    access.supabase
      .from('public_posts')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId)
      .eq('status', 'archived'),
    access.supabase
      .from('public_posts')
      .select('id, title, published_at, updated_at, status')
      .eq('congregation_id', congregationId)
      .order('updated_at', { ascending: false })
      .limit(5),
    access.supabase
      .from('public_magazine_issues')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId),
    access.supabase
      .from('public_magazine_issues')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId)
      .eq('is_published', true),
  ])

  const siteLoadFailed = Boolean(siteResult.error)
  const site = siteLoadFailed ? null : siteResult.data
  const themes = themesResult.error ? [] : themesResult.data ?? []
  const selectedTheme = site?.theme_id
    ? themes.find((theme) => theme.id === site.theme_id) ?? null
    : null
  const selectedVisualTheme = getPublicVisualTheme(selectedTheme?.preset_key)
  const recentPosts = recentPostsResult.error
    ? []
    : ((recentPostsResult.data ?? []) as RecentPost[])

  const totalPosts = totalPostsResult.error ? null : (totalPostsResult.count ?? 0)
  const publishedPosts = publishedPostsResult.error
    ? null
    : (publishedPostsResult.count ?? 0)
  const draftPosts = draftPostsResult.error ? null : (draftPostsResult.count ?? 0)
  const archivedPosts = archivedPostsResult.error ? null : (archivedPostsResult.count ?? 0)
  const totalIssues = totalIssuesResult.error ? null : (totalIssuesResult.count ?? 0)
  const publishedIssues = publishedIssuesResult.error
    ? null
    : (publishedIssuesResult.count ?? 0)
  const unpublishedIssues =
    totalIssues === null || publishedIssues === null ? null : totalIssues - publishedIssues

  const hasCounterError = [
    totalPostsResult,
    publishedPostsResult,
    draftPostsResult,
    archivedPostsResult,
    recentPostsResult,
    totalIssuesResult,
    publishedIssuesResult,
  ].some((result) => Boolean(result.error))

  const quickActions: QuickAction[] = [
    {
      title: 'Bejegyzések',
      description: 'Piszkozatok és közzétett hírek áttekintése.',
      href: '/publikus-oldal/bejegyzesek',
      icon: FileEdit,
      tone: 'violet',
    },
  ]

  if (canWrite) {
    quickActions.unshift({
      title: 'Új bejegyzés',
      description: 'Hír vagy gyülekezeti beszámoló írása.',
      href: '/publikus-oldal/bejegyzesek/uj',
      icon: Plus,
      tone: 'emerald',
    })
    quickActions.push(
      {
        title: 'Magazin',
        description: 'Lapszámok, borítók és PDF-ek kezelése.',
        href: '/publikus-oldal/magazin',
        icon: Newspaper,
        tone: 'amber',
      },
      {
        title: 'Beállítások',
        description: 'Arculat, elérhetőség és publikálás beállítása.',
        href: '/publikus-oldal/beallitasok',
        icon: Settings2,
        tone: 'sky',
      },
    )
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 py-4 sm:py-6">
      <header className="card-raised relative overflow-hidden p-5 sm:p-6">
        <div className="absolute right-0 top-0 size-36 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-0 size-28 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Nyilvános kommunikáció
            </p>
            <h1 className="mt-1 font-heading text-3xl text-slate-900 sm:text-4xl">
              Gyülekezeti weboldal
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Egy helyen követheted az oldal publikáltságát, a hírek és magazinok
              állapotát, valamint a gyülekezet választott arculatát.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {site?.is_published ? (
              <Link
                href={`/gy/${site.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Élő oldal megnyitása
              </Link>
            ) : null}
            {canWrite ? (
              <Link
                href="/publikus-oldal/beallitasok"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/25 focus-visible:ring-offset-2"
              >
                <Settings2 className="size-4" aria-hidden="true" />
                Oldal beállítása
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <PublicSiteAdminNav active="overview" canWrite={canWrite} />

      {siteLoadFailed ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Az oldal beállításai most nem tölthetők be. A tartalmi számlálók ettől még
          elérhetők lehetnek; próbáld újra később.
        </div>
      ) : null}

      {hasCounterError ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Néhány tartalmi számláló nem frissült. Az érintett értékeket „—” jelöli.
        </div>
      ) : null}

      <section aria-labelledby="site-status-heading" className="card-raised overflow-hidden">
        {site ? (
          <div className="grid lg:grid-cols-[1.18fr_0.82fr]">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                    site.is_published
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-amber-50 text-amber-800',
                  )}
                >
                  {site.is_published ? (
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="size-3.5" aria-hidden="true" />
                  )}
                  {site.is_published ? 'Nyilvános' : 'Piszkozat'}
                </span>
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  <Search className="size-3.5" aria-hidden="true" />
                  {site.is_published && site.robots_index
                    ? 'Keresőknek engedélyezve'
                    : 'Nincs indexelve'}
                </span>
              </div>

              <h2 id="site-status-heading" className="mt-4 font-heading text-2xl text-slate-900">
                {site.display_name}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {site.tagline || 'Még nincs megadva alcím vagy rövid gyülekezeti üzenet.'}
              </p>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nyilvános cím
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs font-semibold text-slate-700">
                    /gy/{site.slug}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Aktív téma
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-700">
                    {selectedTheme?.display_name || 'Nincs kiválasztva'}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Kapcsolati e-mail
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 truncate text-sm font-semibold text-slate-700">
                    <Mail className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="truncate">{site.contact_email || 'Nincs megadva'}</span>
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Utolsó módosítás
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-700">
                    {formatDate(site.updated_at)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="relative min-h-52 overflow-hidden bg-gradient-to-br from-emerald-100 via-teal-50 to-amber-50 lg:min-h-full">
              {selectedVisualTheme ? (
                <>
                  <Image
                    src={selectedVisualTheme.assets.hero}
                    alt=""
                    fill
                    priority
                    sizes="(min-width: 1024px) 34vw, 100vw"
                    className="object-cover"
                    style={{ objectPosition: selectedVisualTheme.hero.backgroundPosition }}
                  />
                  <span
                    className="absolute inset-0"
                    style={{ background: selectedVisualTheme.hero.overlay }}
                    aria-hidden="true"
                  />
                  <span className="absolute inset-x-5 bottom-5 text-white">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                      Jelenlegi megjelenés
                    </span>
                    <span className="mt-1 block font-heading text-2xl">
                      {selectedTheme?.display_name}
                    </span>
                  </span>
                </>
              ) : (
                <div className="flex h-full min-h-52 flex-col items-center justify-center p-6 text-center text-emerald-900/75">
                  <Globe2 className="size-10" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">A weboldal arculati előnézete</p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-emerald-900/55">
                    Válassz egy generált képes témát a látványos előnézethez.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : siteLoadFailed ? (
          <div className="p-5 sm:p-6">
            <h2 id="site-status-heading" className="font-heading text-xl text-slate-900">
              Az oldalállapot nem érhető el
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              A webhely rekordját nem sikerült beolvasni, ezért az állapotot nem
              értelmezzük tévesen hiányzó beállításként.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Globe2 className="size-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Beállítás szükséges
                </p>
                <h2 id="site-status-heading" className="mt-1 font-heading text-2xl text-slate-900">
                  Még nincs létrehozva a publikus oldal
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Add meg a gyülekezet nevét, válassz témát és állítsd be a nyilvános
                  elérhetőségeket. Az oldal csak külön publikálás után válik láthatóvá.
                </p>
              </div>
            </div>
            {canWrite ? (
              <Link
                href="/publikus-oldal/beallitasok"
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/25 focus-visible:ring-offset-2"
              >
                Beállítás megkezdése
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="quick-actions-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Szerkesztői műveletek
            </p>
            <h2 id="quick-actions-heading" className="font-heading text-xl text-slate-900">
              Gyorsműveletek
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="card-raised group flex min-h-32 flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
              >
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-xl transition-colors',
                    QUICK_ACTION_TONE[item.tone],
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="mt-4 block">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                    {item.title}
                    <ArrowRight
                      className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">
                    {item.description}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="content-status-heading">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Tartalomkészlet
          </p>
          <h2 id="content-status-heading" className="font-heading text-xl text-slate-900">
            Tartalmi állapotok
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr]">
          <article className="card-raised p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <FileEdit className="size-5" aria-hidden="true" />
              </div>
              <Link
                href="/publikus-oldal/bejegyzesek"
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/20"
              >
                Összes megnyitása
              </Link>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <CountValue value={totalPosts} />
                <p className="mt-0.5 text-xs text-slate-500">összes bejegyzés</p>
              </div>
              <dl className="space-y-1 text-right text-xs">
                <div className="flex items-center justify-end gap-2">
                  <dt className="text-slate-500">Publikált</dt>
                  <dd className="min-w-5 font-mono font-semibold text-emerald-700">
                    {publishedPosts ?? '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <dt className="text-slate-500">Piszkozat</dt>
                  <dd className="min-w-5 font-mono font-semibold text-amber-700">
                    {draftPosts ?? '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <dt className="text-slate-500">Archivált</dt>
                  <dd className="min-w-5 font-mono font-semibold text-slate-600">
                    {archivedPosts ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </article>

          <article className="card-raised p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Newspaper className="size-5" aria-hidden="true" />
              </div>
              {canWrite ? (
                <Link
                  href="/publikus-oldal/magazin"
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20"
                >
                  Magazin kezelése
                </Link>
              ) : null}
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <CountValue value={totalIssues} />
                <p className="mt-0.5 text-xs text-slate-500">összes lapszám</p>
              </div>
              <dl className="space-y-1 text-right text-xs">
                <div className="flex items-center justify-end gap-2">
                  <dt className="text-slate-500">Publikált</dt>
                  <dd className="min-w-5 font-mono font-semibold text-emerald-700">
                    {publishedIssues ?? '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <dt className="text-slate-500">Rejtett</dt>
                  <dd className="min-w-5 font-mono font-semibold text-amber-700">
                    {unpublishedIssues ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </article>

          <article className="card-raised overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Legutóbb módosítva</h3>
                <p className="mt-0.5 text-xs text-slate-500">Az öt legfrissebb bejegyzés</p>
              </div>
              <Sparkles className="size-5 text-emerald-500" aria-hidden="true" />
            </div>
            {recentPostsResult.error ? (
              <p className="p-5 text-sm text-slate-500">A lista most nem tölthető be.</p>
            ) : recentPosts.length === 0 ? (
              <div className="p-5">
                <p className="text-sm font-medium text-slate-700">Még nincs bejegyzés.</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Az első hír közzététele után itt jelenik meg a szerkesztési előzmény.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentPosts.map((post) => {
                  const status = POST_STATUS[post.status] ?? POST_STATUS.draft
                  const displayDate =
                    post.status === 'published' ? post.published_at : post.updated_at
                  const rowContent = (
                    <>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {post.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {formatDate(displayDate)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold',
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                    </>
                  )

                  return (
                    <li key={post.id}>
                      {canWrite ? (
                        <Link
                          href={`/publikus-oldal/bejegyzesek/${post.id}`}
                          className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-emerald-500/20"
                        >
                          {rowContent}
                        </Link>
                      ) : (
                        <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
                          {rowContent}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </article>
        </div>
      </section>

      <section aria-labelledby="themes-heading" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Arculat
            </p>
            <h2 id="themes-heading" className="font-heading text-xl text-slate-900">
              Négy generált képes téma
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Mind a négy megjelenés mobilra, tabletre és asztali képernyőre tervezett.
            </p>
          </div>
          {canWrite && !themesResult.error ? (
            <Link
              href="/publikus-oldal/beallitasok"
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-full px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 sm:self-auto"
            >
              Téma kiválasztása
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {themesResult.error ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            A választható témák adatbázis-listája most nem érhető el. A látványtervek
            megtekinthetők, de innen jelenleg nem választhatók ki.
          </div>
        ) : null}

        <PublicSiteThemeGallery
          themes={themes}
          selectedThemeId={site?.theme_id ?? null}
          canWrite={canWrite && !themesResult.error}
        />
      </section>
    </div>
  )
}
