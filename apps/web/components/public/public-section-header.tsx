import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

interface Props {
  eyebrow?: string
  title: string
  subtitle?: string
  linkHref?: string
  linkLabel?: string
  center?: boolean
}

export function PublicSectionHeader({
  eyebrow,
  title,
  subtitle,
  linkHref,
  linkLabel,
  center = false,
}: Props) {
  return (
    <div
      className={`mb-10 sm:mb-12 ${center ? 'text-center' : 'flex items-end justify-between flex-wrap gap-4'}`}
    >
      <div className={center ? '' : 'max-w-2xl'}>
        {eyebrow && (
          <div
            className="text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3 public-anim-fade-up"
            style={{ color: 'var(--public-accent-on-surface)' }}
          >
            {eyebrow}
          </div>
        )}
        <h2
          className="public-anim-fade-up public-delay-100"
          style={{ color: 'var(--public-ink)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="mt-4 text-base sm:text-lg public-anim-fade-up public-delay-200"
            style={{ color: 'var(--public-muted)' }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {linkHref && linkLabel && !center && (
        <Link
          href={linkHref}
          className="inline-flex items-center gap-1 text-sm sm:text-base font-semibold group public-anim-fade-up public-delay-200"
          style={{ color: 'var(--public-primary-on-surface)' }}
        >
          {linkLabel}
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  )
}
