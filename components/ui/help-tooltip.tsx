'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleHelp, ExternalLink, X } from 'lucide-react'
import Link from 'next/link'

interface HelpTooltipProps {
  /** Rövid címsor (pl. modulnév vagy funkció) */
  title: string
  /** 1-3 mondatos barátságos leírás */
  description: string
  /** Opcionális: link a részletesebb súgó-oldalra */
  docsLink?: string
  /** Opcionális: ikon méret (default: sm = 16px) */
  size?: 'xs' | 'sm' | 'md'
  /** Tooltip pozicionálás (default: bottom-left) */
  placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  className?: string
}

const sizeClasses = {
  xs: 'size-3.5',
  sm: 'size-4',
  md: 'size-5',
}

const placementClasses = {
  'bottom-left': 'top-full mt-2 left-0',
  'bottom-right': 'top-full mt-2 right-0',
  'top-left': 'bottom-full mb-2 left-0',
  'top-right': 'bottom-full mb-2 right-0',
}

/**
 * Kérdőjeles segítség-tooltip — a modulok / funkciók mellett.
 *
 * Kattintásra megjelenik egy barátságos popover rövid magyarázattal és
 * opcionálisan egy "Bővebben →" linkkel a részletesebb dokumentációhoz.
 *
 * A popover:
 *  - Outside-click-re bezárul
 *  - Esc-re bezárul
 *  - Framer-motion-nal animált
 */
export function HelpTooltip({
  title,
  description,
  docsLink,
  size = 'sm',
  placement = 'bottom-left',
  className = '',
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Outside click close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Súgó: ${title}`}
        aria-expanded={open}
        data-walkthrough="help-indicator"
      >
        <CircleHelp className={sizeClasses[size]} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: placement.startsWith('top') ? 6 : -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className={`absolute z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl ${placementClasses[placement]}`}
            role="tooltip"
          >
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <h4 className="font-heading text-sm font-semibold text-slate-900">
                {title}
              </h4>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Bezárás"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{description}</p>
            {docsLink && (
              <Link
                href={docsLink}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                Bővebben
                <ExternalLink className="size-3" />
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
