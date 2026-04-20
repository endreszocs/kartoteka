'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  publicSiteSettingsSchema,
  publicPostSchema,
  type PublicSiteSettingsInput,
  type PublicPostInput,
} from '@/lib/validations/public-site'
import { validateSlug } from '@/lib/public-site/slug'
import { sanitizeAboutHtml, markdownToSanitizedHtml } from '@/lib/public-site/sanitize'

interface ActionResult {
  success?: boolean
  error?: string
}

/**
 * Generic hibakezelő: logolja a szerver-oldali hibát de csak egy biztonságos
 * üzenetet ad vissza a kliensnek — nem szivárogtatja a DB struktúrát.
 */
function handleDbError(error: { code?: string; message?: string } | null, context: string): string {
  if (!error) return 'Ismeretlen hiba.'
  console.error(`[${context}]`, error)

  // Unique constraint violation — user-friendly üzenet
  if (error.code === '23505') {
    return 'Ez az adat már létezik (egyediségi feltétel megsértése).'
  }
  // Foreign key violation
  if (error.code === '23503') {
    return 'Érvénytelen hivatkozás. A mentés nem sikerült.'
  }
  // Permission denied
  if (error.code === '42501') {
    return 'Nincs jogosultságod ehhez a művelethez.'
  }
  // Általános generic üzenet
  return 'Adatbázis hiba. Kérjük, próbálja később.'
}

/**
 * A lelkész publikus oldal beállításait mentő akció.
 * Ha még nincs public_sites rekord, létrehozza; egyébként frissíti.
 */
export async function savePublicSiteSettings(
  input: PublicSiteSettingsInput,
): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.profile) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) {
    return { error: 'Nincs aktív gyülekezet.' }
  }

  const parsed = publicSiteSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const slugCheck = validateSlug(parsed.data.slug)
  if (!slugCheck.valid) return { error: slugCheck.error }

  const sanitizedAbout = parsed.data.about_html
    ? sanitizeAboutHtml(parsed.data.about_html)
    : null

  const { supabase } = access

  // Ellenőrizzük, hogy a slug nem foglalt-e más gyülekezet által
  const { data: existing } = await supabase
    .from('public_sites')
    .select('id, congregation_id')
    .eq('slug', parsed.data.slug)
    .maybeSingle()

  if (existing && existing.congregation_id !== congregationId) {
    return { error: 'Ez a slug már foglalt egy másik gyülekezet által.' }
  }

  // Keressük a saját meglévő rekordot
  const { data: mine } = await supabase
    .from('public_sites')
    .select('id')
    .eq('congregation_id', congregationId)
    .maybeSingle()

  const payload = {
    congregation_id: congregationId,
    slug: parsed.data.slug,
    display_name: parsed.data.display_name,
    tagline: parsed.data.tagline || null,
    hero_image_url: parsed.data.hero_image_url || null,
    crest_image_url: parsed.data.crest_image_url || null,
    theme_id: parsed.data.theme_id || null,
    custom_primary_color: parsed.data.custom_primary_color || null,
    custom_accent_color: parsed.data.custom_accent_color || null,
    contact_email: parsed.data.contact_email || null,
    contact_phone: parsed.data.contact_phone || null,
    address: parsed.data.address || null,
    about_html: sanitizedAbout,
    is_published: parsed.data.is_published,
    robots_index: parsed.data.robots_index,
    show_member_count: parsed.data.show_member_count ?? false,
    show_presbyter_count: parsed.data.show_presbyter_count ?? false,
    show_family_count: parsed.data.show_family_count ?? false,
    show_age_distribution: parsed.data.show_age_distribution ?? false,
    override_member_count: parsed.data.override_member_count || null,
    override_presbyter_count: parsed.data.override_presbyter_count || null,
    override_family_count: parsed.data.override_family_count || null,
  }

  if (mine) {
    const { error } = await supabase
      .from('public_sites')
      .update(payload)
      .eq('id', mine.id)
    if (error) return { error: handleDbError(error, 'savePublicSiteSettings.update') }
  } else {
    const { error } = await supabase.from('public_sites').insert(payload)
    if (error) return { error: handleDbError(error, 'savePublicSiteSettings.insert') }
  }

  // Frissítjük a congregations táblán is a redundáns mezőket
  await supabase
    .from('congregations')
    .update({
      public_slug: parsed.data.slug,
      public_site_enabled: parsed.data.is_published,
    })
    .eq('id', congregationId)

  revalidatePath('/publikus-oldal')
  revalidatePath(`/gy/${parsed.data.slug}`)
  return { success: true }
}

/**
 * Poszt mentése / frissítése.
 */
export async function savePublicPost(input: PublicPostInput): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.profile) {
    return { error: 'Nincs bejelentkezett felhasználó.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) {
    return { error: 'Nincs aktív gyülekezet.' }
  }

  const parsed = publicPostSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  // Sanitizáljuk a body_markdown-t HTML-re
  const body_html = markdownToSanitizedHtml(parsed.data.body_markdown)

  const now = new Date().toISOString()
  const publishedAt =
    parsed.data.status === 'published' ? now : null

  const payload = {
    congregation_id: congregationId,
    author_id: access.user.id,
    slug: parsed.data.slug,
    title: parsed.data.title,
    excerpt: parsed.data.excerpt || null,
    cover_image_url: parsed.data.cover_image_url || null,
    body_markdown: parsed.data.body_markdown,
    body_html,
    status: parsed.data.status,
    published_at: publishedAt,
  }

  const { supabase } = access

  if (parsed.data.id) {
    // Frissítés — ha már publikált volt, ne törölje a published_at-et
    const { data: existing } = await supabase
      .from('public_posts')
      .select('status, published_at')
      .eq('id', parsed.data.id)
      .eq('congregation_id', congregationId)
      .maybeSingle()

    if (!existing) return { error: 'A poszt nem található.' }

    const finalPublishedAt =
      parsed.data.status === 'published'
        ? existing.published_at || now
        : existing.published_at

    const { error } = await supabase
      .from('public_posts')
      .update({ ...payload, published_at: finalPublishedAt })
      .eq('id', parsed.data.id)
      .eq('congregation_id', congregationId)

    if (error) return { error: handleDbError(error, 'savePublicPost.update') }
  } else {
    const { error } = await supabase.from('public_posts').insert(payload)
    if (error) return { error: handleDbError(error, 'savePublicPost.insert') }
  }

  revalidatePath('/publikus-oldal/bejegyzesek')

  // Szlugot megkeressük, hogy a publikus oldalt is refreshelhessük
  const { data: site } = await supabase
    .from('public_sites')
    .select('slug')
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (site) {
    revalidatePath(`/gy/${site.slug}`)
    revalidatePath(`/gy/${site.slug}/posts`)
    revalidatePath(`/gy/${site.slug}/posts/${parsed.data.slug}`)
  }

  return { success: true }
}

/**
 * Poszt törlése (hard delete — piszkozatok).
 */
export async function deletePublicPost(postId: string): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { error } = await access.supabase
    .from('public_posts')
    .delete()
    .eq('id', postId)
    .eq('congregation_id', congregationId)

  if (error) return { error: handleDbError(error, 'deletePublicPost') }

  revalidatePath('/publikus-oldal/bejegyzesek')
  return { success: true }
}
