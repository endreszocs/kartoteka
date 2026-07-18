import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Palette, Settings2, ShieldCheck } from 'lucide-react'

import { PublicSiteAdminNav } from '@/components/admin/public-site/public-site-admin-nav'
import { PublicSiteSettingsForm } from '@/components/admin/public-site/public-site-settings-form'
import type { PublicSiteThemeOption } from '@/components/admin/public-site/public-site-theme-picker'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { canAccessPublicSiteAdmin } from '@/lib/public-site/admin-access'
import { suggestSlug } from '@/lib/public-site/slug'
import { PUBLIC_VISUAL_THEME_KEYS } from '@/lib/public-site/visual-theme-registry'

export const metadata: Metadata = {
  title: 'Weboldal-beállítások · Kartotéka',
  description: 'A gyülekezeti weboldal arculati és publikálási beállításai.',
}

const PUBLIC_SITE_SETTINGS_COLUMNS =
  'slug, display_name, tagline, hero_image_url, crest_image_url, theme_id, custom_primary_color, custom_accent_color, contact_email, contact_phone, address, about_html, is_published, robots_index, show_member_count, show_presbyter_count, show_family_count, show_age_distribution, override_member_count, override_presbyter_count, override_family_count'

function isMissingServiceTimesColumn(error: {
  code?: string
  message?: string
} | null): boolean {
  return Boolean(
    error
      && (error.code === 'PGRST204' || error.code === '42703')
      && error.message?.includes('service_times'),
  )
}

export default async function PublicSiteSettingsPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  if (!canAccessPublicSiteAdmin(access, 'write')) redirect('/publikus-oldal')

  const congregationId = access.effectiveCongregationId
  if (!congregationId) redirect('/publikus-oldal')

  const [siteWithServiceTimesResult, themesResult] = await Promise.all([
    access.supabase
      .from('public_sites')
      .select(`${PUBLIC_SITE_SETTINGS_COLUMNS}, service_times`)
      .eq('congregation_id', congregationId)
      .maybeSingle(),
    access.supabase
      .from('public_site_themes')
      .select(
        'id, preset_key, display_name, description, colors, typography, hero_style',
      )
      .eq('is_active', true)
      .in('preset_key', [...PUBLIC_VISUAL_THEME_KEYS])
      .order('sort_order'),
  ])

  let siteResult = siteWithServiceTimesResult
  let serviceTimesSupported = true

  // Expand/contract: a web build a migráció előtt is megnyithatja és mentheti
  // a régi beállításokat. Csak a bizonyítottan hiányzó új oszlopnál használjuk
  // a régi, explicit mezőlistát; jogosultsági hibát soha nem fedünk el.
  if (isMissingServiceTimesColumn(siteWithServiceTimesResult.error)) {
    serviceTimesSupported = false
    siteResult = await access.supabase
      .from('public_sites')
      .select(PUBLIC_SITE_SETTINGS_COLUMNS)
      .eq('congregation_id', congregationId)
      .maybeSingle()
  }

  const site = siteResult.data
  const themes = (themesResult.data ?? []) as PublicSiteThemeOption[]
  const initialThemeId = themes.some((theme) => theme.id === site?.theme_id)
    ? site?.theme_id ?? ''
    : themes[0]?.id ?? ''
  const defaultSlug = site?.slug || suggestSlug(access.congregationName || 'gyulekezet')
  const defaultName = site?.display_name || access.congregationName || 'Gyülekezet'

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 py-4 sm:py-6">
      <header className="card-raised relative overflow-hidden p-5 sm:p-6">
        <div className="absolute right-0 top-0 size-36 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-0 size-28 rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            Weboldal-kezelő
          </p>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <Settings2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-heading text-3xl text-slate-900 sm:text-4xl">Beállítások</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Alapadatok, képek, téma, nyilvános statisztikák és publikálás.
              </p>
            </div>
          </div>
          <div className="mt-4 inline-flex min-h-8 items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
            A változtatások csak mentés után lépnek életbe
          </div>
        </div>
      </header>

      <PublicSiteAdminNav active="settings" canWrite />

      {siteResult.error ? (
        <div role="alert" className="card-raised border-red-200 bg-red-50 p-5 text-red-900">
          <h2 className="font-heading text-lg">A jelenlegi beállítások nem tölthetők be</h2>
          <p className="mt-1 text-sm leading-6 text-red-800">
            A szerkesztőt biztonsági okból nem nyitottuk meg üres adatokkal, így egy
            mentés sem írhatja felül véletlenül a meglévő weboldalt. Frissítsd az oldalt
            később.
          </p>
        </div>
      ) : themesResult.error ? (
        <div role="alert" className="card-raised border-amber-200 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <Palette className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h2 className="font-heading text-lg">A témák most nem tölthetők be</h2>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                A szerkesztő addig nem menthető biztonságosan, amíg a választható témák
                listája nem érhető el. A meglévő beállítások változatlanok maradtak.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <PublicSiteSettingsForm
          initial={{
            slug: site?.slug ?? defaultSlug,
            display_name: site?.display_name ?? defaultName,
            tagline: site?.tagline ?? '',
            hero_image_url: site?.hero_image_url ?? '',
            crest_image_url: site?.crest_image_url ?? '',
            theme_id: initialThemeId,
            custom_primary_color: site?.custom_primary_color ?? '',
            custom_accent_color: site?.custom_accent_color ?? '',
            contact_email: site?.contact_email ?? '',
            contact_phone: site?.contact_phone ?? '',
            address: site?.address ?? '',
            about_html: site?.about_html ?? '',
            ...(serviceTimesSupported
              ? { service_times: site?.service_times ?? [] }
              : {}),
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
      )}
    </div>
  )
}
