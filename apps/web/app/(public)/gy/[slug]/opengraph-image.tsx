import { ImageResponse } from 'next/og'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { FALLBACK_THEME, resolveThemeColors } from '@/lib/public-site/theme-presets'

export const alt = 'Gyülekezeti oldal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await loadPublicSiteBySlug(slug)

  const displayName = site?.display_name || 'Kartotéka'
  const tagline = site?.tagline || 'Gyülekezeti oldal'
  const colors = resolveThemeColors(
    site?.theme ?? FALLBACK_THEME,
    site?.custom_primary_color,
    site?.custom_accent_color,
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 60%, ${colors.accentStrong} 100%)`,
          color: 'white',
          padding: '80px',
          fontFamily: 'serif',
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: '90%',
            marginBottom: 24,
          }}
        >
          {displayName}
        </div>
        <div
          style={{
            fontSize: 36,
            opacity: 0.85,
            textAlign: 'center',
            fontStyle: 'italic',
            maxWidth: '80%',
          }}
        >
          {tagline}
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
