/**
 * Vízjelszerű, halvány református motívum-SVG-k a 3 vizuális témához.
 *
 * Mind a 7 SVG `currentColor`-t használ, így a szülő `color` (vagy CSS-var)
 * határozza meg az árnyalatot. Az `opacity` prop a vízjel-hatáshoz.
 *
 * Használat:
 *   <div style={{ color: 'var(--accent)' }}>
 *     <MotifChurch size={180} opacity={0.05} />
 *   </div>
 *
 * Származás: a Kartotéka Design Handoff `shared/motifs.jsx` portja TSX-be.
 * SSOT a 3 témához (`packages/design-tokens/src/themes.ts`).
 */

import type { CSSProperties } from 'react'

export interface MotifProps {
  size?: number
  opacity?: number
  style?: CSSProperties
  className?: string
}

// ── Templom (Csendes parókia + Zsoltáros contentDecor-ban) ────────────
export function MotifChurch({ size = 200, opacity = 0.06, style, className }: MotifProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 240"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity, ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d="M100 20v18M92 29h16" />
      <path d="M100 38l-14 22h28zM86 60v18l-26 14v94h80V92l-26-14V60" />
      <path d="M60 186h80M82 186v-32h36v32M100 154v32" />
      <circle cx="100" cy="98" r="6" />
      <path d="M97 95v6M94 98h6" />
      <path d="M70 110v40M70 130h6M76 110v40M130 110v40M130 130h-6M124 110v40" />
    </svg>
  )
}

// ── Nyitott Biblia (Csendes parókia contentDecor) ────────────────────
export function MotifBible({ size = 220, opacity = 0.06, style, className }: MotifProps) {
  return (
    <svg
      width={size}
      height={size * 0.68}
      viewBox="0 0 220 150"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      style={{ opacity, ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d="M20 30c25-10 50-10 90 0 40-10 65-10 90 0v95c-25-10-50-10-90 0-40-10-65-10-90 0z" />
      <path d="M110 30v95" />
      <path d="M40 50c15-5 30-5 55 0M40 65c15-5 30-5 55 0M40 80c15-5 30-5 55 0" />
      <path d="M125 50c15-5 30-5 55 0M125 65c15-5 30-5 55 0M125 80c15-5 30-5 55 0" />
      <path d="M105 95v18M97 104h16" />
    </svg>
  )
}

// ── Olajág (Csendes parókia + Zsoltáros contentDecor) ────────────────
export function MotifOlive({ size = 220, opacity = 0.07, style, className }: MotifProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      style={{ opacity, ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d="M30 190C60 130 110 90 200 60" />
      <g>
        {Array.from({ length: 7 }, (_, i) => {
          const t = i / 7
          const x = 30 + (200 - 30) * t + Math.cos(t * 6) * 6
          const y = 190 - Math.pow(t, 0.7) * 130
          const a = -50 + i * 8
          return (
            <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
              <path d="M0 0 Q14 -8 22 -2 Q14 8 0 0z" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// ── Szentlélek galambja (Kerített kert + Zsoltáros sidebarDecor) ─────
export function MotifDove({ size = 200, opacity = 0.06, style, className }: MotifProps) {
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 200 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity, ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d="M20 90c20-8 40-12 65-12 35 0 55-14 75-30 12-10 25-10 35-5-5 10-10 17-20 20-5 30-30 55-70 60-30 4-60 0-85-33z" />
      <path d="M125 65l10-12M105 75l5-8" />
      <circle cx="155" cy="48" r="1.5" fill="currentColor" />
    </svg>
  )
}

// ── Egyszerű kereszt (Csendes parókia contentDecor) ──────────────────
export function MotifCross({ size = 120, opacity = 0.07, style, className }: MotifProps) {
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 120 168"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      style={{ opacity, ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d="M60 10v148M30 50h60" />
    </svg>
  )
}

// ── Négyágú csillag (Zsoltáros contentDecor) ─────────────────────────
export function MotifStar4({ size = 80, opacity = 0.12, style, className }: MotifProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="currentColor"
      style={{ opacity, ...style }}
      className={className}
      aria-hidden="true"
    >
      <path d="M40 6l5 29 29 5-29 5-5 29-5-29L6 40l29-5z" />
    </svg>
  )
}

// ── Geometrikus rács — Kerített kert (sidebarDecor + contentDecor) ───
export function MotifTrellis({ opacity = 0.05, style, className }: Omit<MotifProps, 'size'>) {
  return (
    <svg
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      // pointer-events: none — kritikus! A `position: absolute; inset: 0` SVG
      // overlay különben elfogná a sidebar nav-link click-jeit.
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none', ...style }}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <pattern id="kt-trellis" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M40 10v60M10 40h60" stroke="currentColor" strokeWidth="1" fill="none" />
          <circle cx="40" cy="40" r="2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#kt-trellis)" />
    </svg>
  )
}
