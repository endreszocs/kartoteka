import { ImageResponse } from 'next/og'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'

export const alt = 'Gyülekezeti oldal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { slug: string } }) {
  const site = await loadPublicSiteBySlug(params.slug)

  const displayName = site?.display_name || 'Kartotéka'
  const tagline = site?.tagline || 'Gyülekezeti oldal'
  const primary = site?.custom_primary_color || site?.theme.colors.primary || '#14514b'
  const accent = site?.custom_accent_color || site?.theme.colors.accent || '#d4a04a'

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
          background: `linear-gradient(135deg, ${primary} 0%, ${primary} 60%, ${accent} 100%)`,
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
