import { notFound } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import {
  buildThemeCssVariables,
  resolveThemeColors,
} from '@/lib/public-site/theme-presets'
import { PublicSiteHeader } from '@/components/public/public-site-header'
import { PublicSiteFooter } from '@/components/public/public-site-footer'
import { PublicSiteSplash } from '@/components/public/public-site-splash'
import { PublicRouteFrame } from './public-route-frame'
import { isMemberPortalAuthEnabled } from './tagi-portal/auth-enabled'

// 2026-08-10: a statikus publikus design-rendszer kikerült az inline
// <style>-ból egy cache-elhető CSS-fájlba; inline már csak a
// gyülekezetfüggő CSS-változók mennek ki.
import '../../../../styles/public-site.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) return { title: 'Nincs ilyen oldal' }

  const description =
    site.tagline?.trim() ||
    [site.display_name, site.address?.trim()]
      .filter(Boolean)
      .join(' — ')
      .concat(' · Istentiszteleti rend, hírek és elérhetőség.')

  return {
    title: {
      default: site.display_name,
      template: `%s · ${site.display_name}`,
    },
    description,
    robots: site.robots_index ? 'index, follow' : 'noindex, nofollow',
    alternates: { canonical: `/gy/${site.slug}` },
    // 2026-08-10: gyülekezetenkénti OG/Twitter alapok. A borítóképet a
    // fájl-alapú opengraph-image.tsx adja hozzá automatikusan.
    openGraph: {
      type: 'website',
      locale: 'hu_HU',
      siteName: site.display_name,
      title: site.display_name,
      description,
      url: `/gy/${site.slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: site.display_name,
      description,
    },
  }
}

/**
 * 2026-08-10: a mobil böngésző címsávja korábban a PWA sötét indigóját
 * (#1e1b4b) kapta a krémszínű gyülekezeti oldal fölé is. Innentől a téma
 * saját felületszíne adja a themeColor-t.
 */
export async function generateViewport({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Viewport> {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  const colors = site
    ? resolveThemeColors(
        site.theme,
        site.custom_primary_color,
        site.custom_accent_color,
      )
    : null

  return {
    themeColor: colors?.surface ?? '#faf7f0',
    colorScheme: 'light',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
  }
}

export default async function CongregationSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) notFound()

  const cssVariables = buildThemeCssVariables(
    site.theme,
    site.custom_primary_color,
    site.custom_accent_color,
  )
  const colors = resolveThemeColors(
    site.theme,
    site.custom_primary_color,
    site.custom_accent_color,
  )
  const memberPortalEnabled = isMemberPortalAuthEnabled()
  const publicThemeBase = (
    <>
      <style>{`
        .public-site-root {
          ${cssVariables}
        }

        /*
          2026-08-10 — sotet OS-preferencia eseten a gyoker layout .dark
          osztalyt tesz a html elemre, es a kartoteka.css sotet (#21343a)
          hatteret + amber/teal overlayt rajzol. A publikus oldalnak nincs
          sotet token-keszlete, ezert minden attetszo/kilogo resz (iOS
          overscroll, 404, html hatter) saros sotetzold lett. A publikus
          utvonalon ezert kikapcsoljuk az app-hatteret.
        */
        html:has(.public-site-root),
        body:has(.public-site-root) {
          background-color: ${colors.surface} !important;
          background-image: none !important;
          color-scheme: light;
        }

      `}</style>
    </>
  )

  const publicHeader = (
    <>
      <a
        href="#public-main-content"
        className="fixed left-4 top-3 z-[100000] -translate-y-24 rounded-xl bg-[var(--public-primary)] px-4 py-2 font-semibold text-white shadow-xl transition-transform focus:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--public-primary)] motion-reduce:transition-none"
      >
        Ugrás a fő tartalomra
      </a>
      <PublicSiteHeader
        site={site}
        memberPortalEnabled={memberPortalEnabled}
      />
    </>
  )

  // 2026-08-10: a tartalom Suspense-be kerül, így a fejléc a GYÜLEKEZET
  // címerével és a téma színeivel azonnal kirajzolódik, és csak a
  // tartalomterület villan „töltés" állapotba — a Kartotéka-logós
  // route-loading-screen helyett.
  const publicFallback = (
    <PublicSiteSplash
      crestUrl={site.crest_image_url}
      displayName={site.display_name}
      tagline={site.tagline}
    />
  )

  return (
    <PublicRouteFrame
      publicFooter={<PublicSiteFooter site={site} />}
      publicHeader={publicHeader}
      publicHomePath={`/gy/${site.slug}`}
      publicThemeBase={publicThemeBase}
      publicFallback={publicFallback}
      memberDashboardPath={`/gy/${site.slug}/tagi-fiok`}
      presetKey={site.theme.preset_key}
    >
      {children}
    </PublicRouteFrame>
  )
}
