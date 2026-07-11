import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type StatusIntent = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const INTENT_CLASSES: Record<StatusIntent, string> = {
  success:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/30',
  warning:
    'bg-amber-50 text-amber-700 ring-amber-600/25 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/30',
  danger:
    'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-400/30',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-400/30',
  neutral: 'bg-muted text-muted-foreground ring-border',
}

interface StatusBadgeProps {
  intent: StatusIntent
  children: ReactNode
  icon?: LucideIcon
  /** Kitöltött pötty a szöveg előtt (ikon helyett) */
  dot?: boolean
  className?: string
}

/**
 * Intent-alapú státusz-jelvény az admin felülethez (2026-07-11 redesign).
 *
 * A színek jelentést hordoznak: success = jóváhagyva/aktív, warning = függőben,
 * danger = elutasítva/hiba/veszélyes, info = tájékoztató, neutral = semleges.
 * Dark módban saját párral rendelkezik, nem szorul a .dark kompat-shimre.
 */
export function StatusBadge({ intent, children, icon: Icon, dot, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        INTENT_CLASSES[intent],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {children}
    </span>
  )
}
