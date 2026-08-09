import { ImageResponse } from 'next/og'
import { loadPublicSiteBySlug } from '@/lib/public-site/site-loader'
import { FALLBACK_THEME, resolveThemeColors } from '@/lib/public-site/theme-presets'

export const alt = 'Gyülekezeti oldal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const CREST_MIME: Readonly<Record<string, string>> = {
  '\x89PNG': 'image/png',
}

/**
 * 2026-08-10 — a címert BEOLVASSUK és data URI-ként adjuk át a Satorinak.
 *
 * Miért nem elég a nyers URL: ha a Storage-fájl eltűnt vagy lassú, az
 * ImageResponse dobna, és a megosztási kép helyett 500-as válasz menne ki.
 * Így hiba esetén egyszerűen címer nélkül generálódik a kép.
 */
async function loadCrestDataUri(url: string | null): Promise<string | null> {
  if (!url) return null

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } })
    if (!response.ok) return null

    const contentTypeHeader = response.headers.get('content-type') || ''
    if (!contentTypeHeader.startsWith('image/')) return null
    if (contentTypeHeader.includes('svg')) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    // 2 MB felett nem éri meg base64-ben az OG-képbe ágyazni.
    if (buffer.byteLength === 0 || buffer.byteLength > 2_000_000) return null

    const mime =
      CREST_MIME[buffer.subarray(0, 4).toString('latin1')] ||
      contentTypeHeader.split(';')[0]

    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

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
  const crest = await loadCrestDataUri(site?.crest_image_url ?? null)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: `linear-gradient(150deg, ${colors.primary} 0%, ${colors.primaryDeep} 100%)`,
          color: 'white',
          padding: '72px 80px',
          fontFamily: 'serif',
        }}
      >
        {/* Felső sáv: címer + egyházkerületi felirat */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginBottom: 'auto',
          }}
        >
          {crest ? (
            // A Satori (ImageResponse) csak natív <img>-et ismer, next/image-et nem.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={crest}
              width={128}
              height={128}
              alt=""
              style={{
                width: 128,
                height: 128,
                objectFit: 'contain',
                borderRadius: 24,
                background: 'rgba(255,255,255,0.12)',
                padding: 12,
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                width: 128,
                height: 128,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                background: 'rgba(255,255,255,0.14)',
                border: '2px solid rgba(255,255,255,0.32)',
                fontSize: 64,
              }}
            >
              {displayName.charAt(0)}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: colors.accent,
            }}
          >
            Gyülekezeti oldal
          </div>
        </div>

        {/* Arany hajszálvonal */}
        <div
          style={{
            display: 'flex',
            height: 2,
            width: 160,
            marginBottom: 28,
            background: colors.accent,
          }}
        />

        <div
          style={{
            display: 'flex',
            fontSize: displayName.length > 34 ? 68 : 86,
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: '95%',
          }}
        >
          {displayName}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: 34,
            opacity: 0.85,
            fontStyle: 'italic',
            maxWidth: '85%',
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
