'use client'

import Image from 'next/image'
import { useState, type CSSProperties } from 'react'

import { shouldBypassPublicImageOptimization } from '@/lib/public-site/public-image'

/**
 * 2026-08-10 — Egységes gyülekezeti címer-megjelenítés.
 *
 * Miért kellett külön komponens:
 *  - a címer korábban MINDENHOL `object-cover`-rel négyzetre volt vágva, a
 *    református pajzs-címerek pedig magas arányúak → levágódott a tetejük;
 *  - törött/eltűnt kép esetén üres lyuk maradt a fejlécben;
 *  - a fix méretű keret miatt nincs layout shift a kép betöltése közben.
 *
 * A keret mindig fix méretű doboz, a kép `object-contain`, hiba vagy hiányzó
 * URL esetén pedig a gyülekezet nevének kezdőbetűje jelenik meg a téma
 * színátmenetén.
 */
export interface PublicCrestProps {
  src?: string | null
  /** A gyülekezet neve — a monogramhoz és az alt szöveghez. */
  name: string
  /** A keret oldalhossza pixelben (fix, layout-shift nélkül). */
  size?: number
  /** Sötét (fotó/tinta) háttéren világos keretet és feliratot használ. */
  tone?: 'surface' | 'onDark'
  /** Dekoratív használat (a név mellette szövegként is szerepel). */
  decorative?: boolean
  /** Pajzs-alakú keret a kerekített négyzet helyett. */
  shape?: 'rounded' | 'shield'
  className?: string
}

export function PublicCrest({
  src,
  name,
  size = 48,
  tone = 'surface',
  decorative = true,
  shape = 'rounded',
  className = '',
}: PublicCrestProps) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  const monogram = name.trim().charAt(0).toUpperCase() || '†'

  const shieldRadius = `${Math.round(size * 0.34)}px ${Math.round(size * 0.34)}px ${Math.round(size * 0.46)}px ${Math.round(size * 0.46)}px / ${Math.round(size * 0.28)}px ${Math.round(size * 0.28)}px ${Math.round(size * 0.72)}px ${Math.round(size * 0.72)}px`

  const frameStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: shape === 'shield' ? shieldRadius : `${Math.round(size * 0.26)}px`,
    padding: Math.max(3, Math.round(size * 0.09)),
    background:
      tone === 'onDark'
        ? 'rgba(255,255,255,0.14)'
        : 'color-mix(in srgb, var(--public-surface, #fff) 92%, white)',
    border:
      tone === 'onDark'
        ? '1px solid rgba(255,255,255,0.34)'
        : '1px solid var(--public-line, rgba(0,0,0,0.1))',
    boxShadow:
      tone === 'onDark'
        ? '0 18px 40px -24px rgba(0,0,0,0.65)'
        : 'var(--public-elev-1, 0 10px 26px -20px rgba(0,0,0,0.35))',
  }

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={frameStyle}
    >
      {showImage ? (
        <Image
          src={src as string}
          alt={decorative ? '' : `${name} címere`}
          fill
          sizes={`${size}px`}
          unoptimized={shouldBypassPublicImageOptimization(src as string)}
          onError={() => setFailed(true)}
          className="object-contain"
          style={{ padding: Math.max(2, Math.round(size * 0.06)) }}
        />
      ) : (
        <span
          aria-hidden={decorative ? 'true' : undefined}
          className="flex h-full w-full items-center justify-center font-semibold text-white"
          style={{
            borderRadius: 'inherit',
            fontFamily: 'var(--public-heading-font, Georgia, serif)',
            fontSize: Math.round(size * 0.46),
            lineHeight: 1,
            background:
              'linear-gradient(140deg, var(--public-primary, #14514b) 0%, color-mix(in srgb, var(--public-primary, #14514b) 62%, var(--public-accent-strong, #8a6a24)) 100%)',
          }}
        >
          {monogram}
        </span>
      )}
    </span>
  )
}
