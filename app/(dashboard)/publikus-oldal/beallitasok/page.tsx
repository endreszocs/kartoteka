import { redirect } from 'next/navigation'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { PublicSiteSettingsForm } from '@/components/admin/public-site/public-site-settings-form'
import { suggestSlug } from '@/lib/public-site/slug'

export default async function PublikusOldalBeallitasokPage() {
  const access = await getEffectiveAccessContext()
  if (!access.user) redirect('/login')
  const congregationId = access.effectiveCongregationId
  if (!congregationId) redirect('/publikus-oldal')

  // Meglévő public_sites rekord (ha van)
  const { data: site } = await access.supabase
    .from('public_sites')
    .select('*')
    .eq('congregation_id', congregationId)
    .maybeSingle()

  // Elérhető témák
  const { data: themes } = await access.supabase
    .from('public_site_themes')
    .select('id, preset_key, display_name, description, colors, typography, hero_style')
    .eq('is_active', true)
    .order('sort_order')

  const defaultSlug = site?.slug || suggestSlug(access.congregationName || 'gyulekezet')
  const defaultName = site?.display_name || access.congregationName || 'Gyülekezet'

  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="font-heading text-3xl text-slate-800">Publikus oldal beállításai</h1>
        <p className="text-sm text-slate-500 mt-1">
          Itt szerkesztheted a gyülekezet publikus weboldalának megjelenését és beállításait.
        </p>
      </header>

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
        themes={themes || []}
      />
    </div>
  )
}
