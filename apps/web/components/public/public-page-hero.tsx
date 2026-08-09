import type { ReactNode } from 'react'

/**
 * 2026-08-10 — Egységes aloldal-fejléc.
 *
 * Korábban a /posts, /rolunk és /magazin külön-külön másolta ugyanazt a
 * gradiens + elmosott lebegő körök mintát, a lapszám-részletoldal pedig
 * teljesen fejléc nélkül indult („kopár" oldal). Innentől mindegyik ezt a
 * komponenst használja: mély tinta-sáv, arany hajszálvonalak, gravírozott
 * minta — dekoratív blur-körök nélkül.
 */
export function PublicPageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string
  title: string
  lead?: string | null
  children?: ReactNode
}) {
  return (
    <section className="public-band relative overflow-hidden">
      <span aria-hidden="true" className="public-band-hairline top-0" />

      <svg
        className="absolute inset-0 h-full w-full opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="page-hero-engrave"
            x="0"
            y="0"
            width="64"
            height="64"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 12v40M20 27h24"
              stroke="white"
              strokeWidth="1"
              strokeLinecap="round"
              fill="none"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#page-hero-engrave)" />
      </svg>

      <div className="public-container relative py-14 sm:py-20 lg:py-24">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="public-eyebrow public-eyebrow-on-dark public-anim-fade-up">
              {eyebrow}
            </p>
          )}
          <h1 className="public-anim-fade-up public-delay-100 mt-4 text-white">
            {title}
          </h1>
          {lead && (
            <p
              className="public-anim-fade-up public-delay-200 mt-5 max-w-2xl text-[clamp(1.02rem,0.95rem+0.5vw,1.3rem)] italic leading-relaxed text-white/85"
              style={{ fontFamily: 'var(--public-heading-font)' }}
            >
              {lead}
            </p>
          )}
          {children}
        </div>
      </div>

      <span aria-hidden="true" className="public-band-hairline bottom-0" />
    </section>
  )
}
