import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * 2026-08-10 — Egységes üres állapot.
 *
 * Korábban öt helyen öt különböző „Hamarosan…" fogalmazás és ikon élt
 * (kezdőlap, hírek, magazin, alkalmak, filmszerű téma). Egy alig kitöltött
 * oldal is szándékosnak hat, ha mindenhol ugyanaz a pajzs-vízjeles blokk
 * fogad, egy mondattal és EGY konkrét továbblépéssel.
 */
export function PublicEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  className = '',
}: {
  title: string
  description?: string
  actionHref?: string
  actionLabel?: string
  className?: string
}) {
  return (
    <div className={`public-empty public-anim-fade-up ${className}`}>
      {/* Pajzs-körvonal vízjelként — nem ikoncsempe, nem Sparkles */}
      <svg
        width="46"
        height="56"
        viewBox="0 0 46 56"
        fill="none"
        aria-hidden="true"
        className="public-empty-mark mb-3"
      >
        <path
          d="M23 2 44 8v20c0 13-8.6 20.4-21 26C10.6 48.4 2 41 2 28V8L23 2Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M23 16v22M14 25h18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <p
        className="text-[1.15rem] leading-snug"
        style={{
          color: 'var(--public-ink)',
          fontFamily: 'var(--public-heading-font)',
        }}
      >
        {title}
      </p>

      {description && (
        <p
          className="max-w-md text-sm"
          style={{ color: 'var(--public-muted)' }}
        >
          {description}
        </p>
      )}

      {actionHref && actionLabel && (
        <Link href={actionHref} className="public-link-arrow mt-2 text-sm">
          {actionLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
