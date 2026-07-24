import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { buildThemeCssVariables } from '@/lib/public-site/theme-presets'
import { PublicSiteHeader } from '@/components/public/public-site-header'
import { PublicSiteFooter } from '@/components/public/public-site-footer'
import { PublicRouteFrame } from './public-route-frame'
import { isMemberPortalAuthEnabled } from './tagi-portal/auth-enabled'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)
  if (!site) return { title: 'Nincs ilyen oldal' }

  return {
    title: site.display_name,
    description: site.tagline || `${site.display_name} gyülekezeti weboldala`,
    robots: site.robots_index ? 'index, follow' : 'noindex, nofollow',
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
  const memberPortalEnabled = isMemberPortalAuthEnabled()
  const publicThemeBase = (
    <>
      <style>{`
        .public-site-root {
          ${cssVariables}
          background-color: var(--public-surface);
          color: var(--public-ink);
          font-family: var(--public-body-font);
          line-height: 1.65;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* Reszponzív tipográfia clamp()-pel */
        .public-site-root h1 {
          font-family: var(--public-heading-font);
          font-weight: 600;
          line-height: 1.08;
          letter-spacing: -0.01em;
          font-size: clamp(2.25rem, 1.6rem + 3.2vw, 4.25rem);
        }
        .public-site-root h2 {
          font-family: var(--public-heading-font);
          font-weight: 600;
          line-height: 1.15;
          letter-spacing: -0.005em;
          font-size: clamp(1.85rem, 1.4rem + 2.2vw, 3rem);
        }
        .public-site-root h3 {
          font-family: var(--public-heading-font);
          font-weight: 600;
          line-height: 1.25;
          font-size: clamp(1.35rem, 1.1rem + 1.2vw, 1.875rem);
        }
        .public-site-root h4 {
          font-family: var(--public-heading-font);
          font-weight: 600;
          line-height: 1.3;
          font-size: clamp(1.1rem, 0.95rem + 0.7vw, 1.35rem);
        }
        .public-site-root p {
          font-size: clamp(0.95rem, 0.85rem + 0.3vw, 1.08rem);
        }

        /* Section spacing — mobilbarát */
        .public-section {
          padding: clamp(3rem, 2rem + 3.5vw, 6rem) 0;
        }

        /* Container */
        .public-container {
          width: 100%;
          max-width: 72rem;
          margin: 0 auto;
          padding-left: clamp(1rem, 0.5rem + 2vw, 2rem);
          padding-right: clamp(1rem, 0.5rem + 2vw, 2rem);
        }

        /* ── Animációk ───────────────────────────── */
        @keyframes public-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes public-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes public-scale-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes public-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes public-shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        @keyframes public-drift {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(2%, -2%); }
          66% { transform: translate(-1%, 1%); }
        }
        @keyframes slideInFromRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        .public-anim-fade-up {
          animation: public-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .public-anim-fade-in {
          animation: public-fade-in 0.8s ease-out both;
        }
        .public-anim-scale-in {
          animation: public-scale-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .public-anim-float {
          animation: public-float 6s ease-in-out infinite;
        }
        .public-anim-drift {
          animation: public-drift 20s ease-in-out infinite;
        }

        /* Stagger delays */
        .public-delay-100 { animation-delay: 0.1s; }
        .public-delay-200 { animation-delay: 0.2s; }
        .public-delay-300 { animation-delay: 0.3s; }
        .public-delay-400 { animation-delay: 0.4s; }
        .public-delay-500 { animation-delay: 0.5s; }

        /* Kártya hover */
        .public-card {
          transition:
            transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.3s ease;
        }
        .public-card:hover {
          transform: translateY(-4px);
          box-shadow:
            0 24px 50px -20px rgba(0, 0, 0, 0.15),
            0 12px 24px -14px rgba(0, 0, 0, 0.08);
        }

        /* Gomb */
        .public-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.875rem 1.75rem;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 0.95rem;
          transition:
            transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s ease,
            background-color 0.25s ease;
          min-height: 44px;
          white-space: nowrap;
        }
        .public-btn-primary {
          background: var(--public-primary);
          color: white;
          box-shadow: 0 10px 24px -12px color-mix(in srgb, var(--public-primary) 70%, transparent);
        }
        .public-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 32px -14px color-mix(in srgb, var(--public-primary) 80%, transparent);
        }
        .public-btn-primary:active {
          transform: translateY(0);
        }
        .public-btn-outline {
          background: transparent;
          color: var(--public-ink);
          border: 1.5px solid color-mix(in srgb, var(--public-ink) 15%, transparent);
        }
        .public-btn-outline:hover {
          border-color: var(--public-primary);
          color: var(--public-primary-on-surface);
          background: color-mix(in srgb, var(--public-primary) 6%, transparent);
        }

        /* Prose */
        .public-prose {
          max-width: 65ch;
          line-height: 1.75;
        }
        .public-prose p { margin: 1.15em 0; }
        .public-prose h2 { margin: 1.8em 0 0.6em; }
        .public-prose h3 { margin: 1.5em 0 0.5em; }
        .public-prose h4 { margin: 1.3em 0 0.4em; }
        .public-prose ul, .public-prose ol { margin: 1em 0; padding-left: 1.5em; }
        .public-prose li { margin: 0.4em 0; }
        .public-prose a {
          color: var(--public-primary-on-surface);
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-thickness: 1.5px;
        }
        .public-prose a:hover {
          color: color-mix(in srgb, var(--public-primary-on-surface) 80%, black);
        }
        .public-prose blockquote {
          border-left: 3px solid var(--public-accent);
          padding-left: 1.25em;
          font-style: italic;
          color: color-mix(in srgb, var(--public-ink) 80%, transparent);
          margin: 1.5em 0;
        }
        .public-prose strong { font-weight: 700; }
        .public-prose img {
          border-radius: var(--public-radius);
          margin: 1.5em 0;
        }

        /* Mobil touch target minimum. A szövegközi linkeket nem méretezzük át. */
        .public-site-root button {
          min-height: 44px;
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .public-anim-fade-up,
          .public-anim-fade-in,
          .public-anim-scale-in,
          .public-anim-float,
          .public-anim-drift {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .public-card {
            transition: none !important;
          }
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

  return (
    <PublicRouteFrame
      publicFooter={<PublicSiteFooter site={site} />}
      publicHeader={publicHeader}
      publicHomePath={`/gy/${site.slug}`}
      publicThemeBase={publicThemeBase}
      memberDashboardPath={`/gy/${site.slug}/tagi-fiok`}
      presetKey={site.theme.preset_key}
    >
      {children}
    </PublicRouteFrame>
  )
}
