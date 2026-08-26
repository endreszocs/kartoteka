import { cache } from 'react'
import { z } from 'zod'

import { createPublicServerClient } from '@/lib/supabase/public-server'
import {
  publicServiceTimesSchema,
  type PublicServiceTime,
} from '@/lib/validations/public-site'
import { FALLBACK_THEME, type PublicSiteTheme } from './theme-presets'
import { safePublicHttpsUrl } from './safe-url'

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
  service_times: PublicServiceTime[]
  robots_index: boolean
  show_member_count?: boolean
  show_presbyter_count?: boolean
  show_family_count?: boolean
  show_age_distribution?: boolean
  override_member_count?: number | null
  override_presbyter_count?: number | null
  override_family_count?: number | null
}

const publicSiteSlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/)

const publicSiteRowSchema = z.object({
  id: z.string().uuid(),
  congregation_id: z.string().uuid(),
  slug: publicSiteSlugSchema,
  display_name: z.string(),
  tagline: z.string().nullable(),
  hero_image_url: z.string().nullable(),
  crest_image_url: z.string().nullable(),
  theme_id: z.string().uuid().nullable(),
  custom_primary_color: z.string().nullable(),
  custom_accent_color: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  address: z.string().nullable(),
  about_html: z.string().nullable(),
  // A V1 RPC és a migráció előtti közvetlen olvasás még nem adja vissza.
  // ⚠️ `.nullish()`, nem `.optional()`: az utóbbi a HIÁNYZÓ kulcsot fogadja
  // el, a `null`-t NEM. Ma csak a DB NOT NULL megszorítása miatt biztonságos —
  // egy jövőbeli NULL az EGÉSZ oldalt 404-elné.
  service_times: publicServiceTimesSchema.nullish(),
  robots_index: z.boolean(),
  show_member_count: z.boolean(),
  show_presbyter_count: z.boolean(),
  show_family_count: z.boolean(),
  show_age_distribution: z.boolean(),
  override_member_count: z.number().int().nullable(),
  override_presbyter_count: z.number().int().nullable(),
  override_family_count: z.number().int().nullable(),
})

const PUBLIC_SITE_SAFE_COLUMNS = [
  'id',
  'congregation_id',
  'slug',
  'display_name',
  'tagline',
  'hero_image_url',
  'crest_image_url',
  'theme_id',
  'custom_primary_color',
  'custom_accent_color',
  'contact_email',
  'contact_phone',
  'address',
  'about_html',
  'robots_index',
  'show_member_count',
  'show_presbyter_count',
  'show_family_count',
  'show_age_distribution',
  'override_member_count',
  'override_presbyter_count',
  'override_family_count',
].join(', ')

/**
 * Hiányzó RPC felismerése.
 *
 * ⚠️ A hibakód ÖNMAGÁBAN kevés: a PostgREST proxy néha kód NÉLKÜL, csak
 * üzenettel jelzi a hiányzó függvényt („Could not find the function …",
 * „… does not exist", „schema cache"). Kód-only ellenőrzéssel ilyenkor NEM
 * történne visszaesés, és a látogató 404-et kapna egy létező oldalra.
 * A projekt kanonikus mintája (lib/profiles/officials.ts) is a kettőt együtt
 * nézi.
 */
function isMissingPublicContextRpc(error: {
  code?: string
  message?: string
} | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const uzenet = error.message?.toLowerCase() ?? ''
  return (
    uzenet.includes('could not find the function') ||
    uzenet.includes('does not exist') ||
    uzenet.includes('schema cache')
  )
}

/**
 * A `service_times` oszlop hiánya — és CSAK az.
 *
 * ⚠️ Szűken célzunk: a jogosultsági vagy hálózati hibát SOHA nem kerüljük meg
 * egy szűkebb lekérdezéssel, mert az elfedné a valódi problémát. (Ugyanez a
 * minta él az admin beállítás-oldalon is.)
 */
function isMissingServiceTimesColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  return Boolean(
    error &&
      (error.code === 'PGRST204' || error.code === '42703') &&
      error.message?.includes('service_times'),
  )
}

/** Üres/whitespace szöveg = nincs érték. Egyébként a levágott szöveg. */
function nemUres(ertek: string | null | undefined): string | null {
  const trimmelt = ertek?.trim()
  return trimmelt ? trimmelt : null
}

/**
 * A gyülekezet SAJÁT, mentett címere és elérhetőségei — tartaléknak (2026-08-27).
 *
 * A `public_site_congregation_fallback` RPC ugyanazt a kaput használja, mint a
 * weboldal (publikált oldal + aktív gyülekezet), és a négy mezőn kívül semmit
 * nem ad ki a gyülekezetről.
 *
 * ⚠️ CSAK AKKOR HÍVJUK MEG, ha tényleg hiányzik valami — a teljesen kitöltött
 * weboldal ne fizessen meg egy fölösleges kört minden oldalletöltésnél.
 *
 * ⚠️ HIÁNYZÓ RPC = NÉMA TARTALÉK: a migráció a frontend UTÁN is telepíthető
 * (expand/contract). Ilyenkor a weboldal pontosan úgy viselkedik, mint eddig —
 * nem hibázik és nem is hazudik.
 */
async function loadCongregationFallback(
  supabase: ReturnType<typeof createPublicServerClient>,
  slug: string,
  site: {
    crest_image_url: string | null
    contact_email: string | null
    contact_phone: string | null
    address: string | null
  },
): Promise<{
  crest_image_url: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
} | null> {
  const hianyzik =
    !nemUres(site.crest_image_url) ||
    !nemUres(site.contact_email) ||
    !nemUres(site.contact_phone) ||
    !nemUres(site.address)
  if (!hianyzik) return null

  const { data, error } = await supabase
    .rpc('public_site_congregation_fallback', { p_slug: slug })
    .maybeSingle()

  if (error || !data) return null

  const sor = data as Record<string, unknown>
  return {
    crest_image_url: nemUres(sor.crest_image_url as string | null),
    contact_email: nemUres(sor.contact_email as string | null),
    contact_phone: nemUres(sor.contact_phone as string | null),
    address: nemUres(sor.address as string | null),
  }
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
    const parsedSlug = publicSiteSlugSchema.safeParse(slug)
    if (!parsedSlug.success) return null

    const supabase = createPublicServerClient()

    const v2ContextResult = await supabase
      .rpc('public_site_context_v2', { p_slug: parsedSlug.data })
      .maybeSingle()

    let rawSite = v2ContextResult.data
    let loadError = v2ContextResult.error

    // Expand/contract: a V2 frontend telepíthető a service_times migráció
    // előtt. Ilyenkor a már biztonságos V1 RPC adja vissza a régi mezőket,
    // az alkalomlista pedig becsületesen üres marad.
    if (isMissingPublicContextRpc(v2ContextResult.error)) {
      const v1ContextResult = await supabase
        .rpc('public_site_context', { p_slug: parsedSlug.data })
        .maybeSingle()

      rawSite = v1ContextResult.data
      loadError = v1ContextResult.error

      // Csak a V1 RPC hiányánál lépünk tovább a migráció előtti kompatibilis
      // közvetlen olvasásra. Jogosultsági vagy futási hibát nem kerülünk meg.
      if (isMissingPublicContextRpc(v1ContextResult.error)) {
        console.warn(
          '[public-site] A public_site_context RPC-k még nem érhetők el; átmeneti kompatibilitási olvasás fut.',
        )

        // ⚠️ 2026-08-27 — ITT FUT MA AZ ÉLES RENDSZER. A projekt saját
        // migrációs naplója (migration-docs/sql/_RUN_LOG.md) szerint sem a
        // 2026-07-17-es, sem a 2026-07-18-as publikus-oldal lánc NEM futott
        // le, tehát EGYIK kontextus-RPC sem létezik — a gyülekezeti oldalakat
        // ez az „átmeneti" ág szolgálja ki. Ezért nem elég, ha egy javítás
        // csak az RPC-kben él: itt is meg kell jelennie.
        //
        // A `service_times` oszlopot KÜLÖN próbáljuk: ha még nincs meg (a
        // 2026-08-27-es migráció előtt), a hiányzó oszlop az EGÉSZ lekérdezést
        // megbuktatná — vagyis a gyülekezeti oldal fehér lapra esne.
        const legacyWithServiceTimes = await supabase
          .from('public_sites')
          .select(`${PUBLIC_SITE_SAFE_COLUMNS}, service_times`)
          .eq('slug', parsedSlug.data)
          .eq('is_published', true)
          .maybeSingle()

        if (isMissingServiceTimesColumn(legacyWithServiceTimes.error)) {
          const legacyResult = await supabase
            .from('public_sites')
            .select(PUBLIC_SITE_SAFE_COLUMNS)
            .eq('slug', parsedSlug.data)
            .eq('is_published', true)
            .maybeSingle()

          rawSite = legacyResult.data
          loadError = legacyResult.error
        } else {
          rawSite = legacyWithServiceTimes.data
          loadError = legacyWithServiceTimes.error
        }
      }
    }

    const parsedSite = publicSiteRowSchema.safeParse(rawSite)
    if (loadError || !parsedSite.success) {
      // ⚠️ EDDIG EZ AZ ÚT TELJESEN NÉMA VOLT: a hívó `notFound()`-ot hív, tehát
      // a látogató 404-et lát — akkor is, ha valójában JOGOSULTSÁGI hiba
      // (42501) történt, nem pedig „nincs ilyen gyülekezet". A kettő
      // megkülönböztetése élesben másképp nem derülne ki.
      if (loadError) {
        console.error(
          '[public-site] A gyülekezeti oldal betöltése hibázott (nem „nincs ilyen slug"):',
          loadError.code,
          loadError.message,
        )
      }
      return null
    }
    const site = parsedSite.data

    // Téma betöltése
    let theme: PublicSiteTheme = FALLBACK_THEME
    if (site.theme_id) {
      const { data: themeRow } = await supabase
        .from('public_site_themes')
        .select(
          'id, preset_key, display_name, description, colors, typography, hero_style, border_radius, sort_order, is_active',
        )
        .eq('id', site.theme_id)
        .eq('is_active', true)
        .maybeSingle<PublicSiteThemeRow>()
      if (themeRow) {
        theme = themeRow as PublicSiteTheme
      }
    }

    // ── Gyülekezeti tartalék: címer + elérhetőségek (2026-08-27) ──────────
    //
    // ⛔ MI VOLT A HIBA (Endre élesben látta): a betöltő-képernyőn a Kartotéka
    // termék-logója állt a gyülekezet címere helyett, az elérhetőségeknél
    // pedig „hamarosan felkerülnek". Az adat viszont MEG VOLT — csak nem itt:
    // a setup varázsló a `congregations` táblába írja (ott a címer mező
    // KÖTELEZŐ), a weboldal viszont csak a `public_sites` saját mezőit nézte.
    //
    // ⚠️ MIÉRT ITT, AZ ALKALMAZÁSBAN, ÉS NEM A KONTEXTUS-RPC-BEN:
    // élesben HÁROM különböző úton érkezhet a weboldal-adat (V2 RPC / V1 RPC /
    // közvetlen táblaolvasás), mert a `2026-07-18`-as migráció a produkciós
    // adatbázisban sosem futott le (szerepkör-hiányon hasal el az őre). Ha a
    // tartalékot valamelyik RPC-be építenénk, csak az egyik ágon hatna — és
    // némán pont ott nem, ahol most a rendszer fut. Itt viszont mindhárom ág
    // fölött ugyanaz a szabály érvényesül.
    const tartalek = await loadCongregationFallback(supabase, parsedSlug.data, site)

    return {
      id: site.id,
      congregation_id: site.congregation_id,
      slug: site.slug,
      display_name: site.display_name,
      tagline: site.tagline,
      hero_image_url: safePublicHttpsUrl(site.hero_image_url),
      // A weboldalon megadott érték MINDIG erősebb; a gyülekezeti adat csak
      // tartalék. Az ÜRES SZÖVEG is tartalékot vált ki, nem csak a hiányzó
      // érték — a „mentettem, mégsem látszik" tünet tipikusan üres stringből
      // jön, és a régi kód azt valós értéknek vette.
      crest_image_url:
        safePublicHttpsUrl(site.crest_image_url) ??
        safePublicHttpsUrl(tartalek?.crest_image_url),
      theme,
      custom_primary_color: site.custom_primary_color,
      custom_accent_color: site.custom_accent_color,
      contact_email: nemUres(site.contact_email) ?? tartalek?.contact_email ?? null,
      contact_phone: nemUres(site.contact_phone) ?? tartalek?.contact_phone ?? null,
      address: nemUres(site.address) ?? tartalek?.address ?? null,
      about_html: site.about_html,
      service_times: site.service_times ?? [],
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
  const supabase = createPublicServerClient()

  const { data } = await supabase
    .from('public_posts')
    .select('id, slug, title, excerpt, cover_image_url, published_at')
    .eq('congregation_id', congregationId)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  return (data as PublicPostListItem[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    cover_image_url: safePublicHttpsUrl(row.cover_image_url),
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
  const supabase = createPublicServerClient()

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
    cover_image_url: safePublicHttpsUrl(
      (data as { cover_image_url: string | null }).cover_image_url,
    ),
    published_at: (data as { published_at: string | null }).published_at,
    body_html: (data as { body_html: string }).body_html,
    author_name: null,
  }
}
