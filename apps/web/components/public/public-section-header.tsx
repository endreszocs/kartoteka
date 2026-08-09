import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

interface Props {
  eyebrow?: string
  title: string
  subtitle?: string
  linkHref?: string
  linkLabel?: string
  center?: boolean
  /** Sötét (tinta) sávon álló változat. */
  onDark?: boolean
}

/**
 * 2026-08-10: az „eyebrow" a `public-eyebrow` osztályt kapja, ami a valóban
 * olvasható arany árnyalatot (`--public-accent-ink`) használja. Korábban a
 * kontraszt-kapu miatt itt a primary zöld jelent meg — ettől volt monokróm
 * az egész oldal.
 */
export function PublicSectionHeader({
  eyebrow,
  title,
  subtitle,
  linkHref,
  linkLabel,
  center = false,
  onDark = false,
}: Props) {
  return (
    <div
      className={`mb-9 sm:mb-12 ${center ? 'text-center' : 'flex flex-wrap items-end justify-between gap-x-8 gap-y-4'}`}
    >
      <div className={center ? 'mx-auto max-w-2xl' : 'max-w-2xl'}>
        {eyebrow && (
          <p
            className={`public-eyebrow public-anim-fade-up ${onDark ? 'public-eyebrow-on-dark' : ''}`}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className="public-anim-fade-up public-delay-100 mt-3"
          style={{ color: onDark ? '#fff' : 'var(--public-ink)' }}
        >
          {title}
        </h2>
        <span
          aria-hidden="true"
          className="public-rule-start public-rule public-anim-fade-in public-delay-200 mt-5"
          style={center ? { marginInline: 'auto' } : undefined}
        />
        {subtitle && (
          <p
            className="public-anim-fade-up public-delay-200 mt-5 text-base sm:text-lg"
            style={{ color: onDark ? 'rgba(255,255,255,0.82)' : 'var(--public-muted)' }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {linkHref && linkLabel && !center && (
        <Link
          href={linkHref}
          className="public-link-arrow public-anim-fade-up public-delay-200 text-sm sm:text-base"
          style={onDark ? { color: '#fff' } : undefined}
        >
          {linkLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
