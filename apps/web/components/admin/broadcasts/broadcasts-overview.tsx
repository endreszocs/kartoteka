'use client'

/**
 * Gyors-áttekintő sáv a Frissítések oldal tetején
 * (2026-07-11 olvashatósági redesign).
 *
 * A korábbi teljes képernyős „Áttekintés" lépcső (3 nagy kártya, amelyekre
 * még rá kellett kattintani) helyett egy kompakt sáv: egy pillantásra
 * látszik, van-e teendő (kiküldetlen fejlesztés), és egy koppintással a
 * megfelelő szekcióhoz görget.
 */

import { ArrowRight, Clock, Send, Sparkles, type LucideIcon } from 'lucide-react'

export type BroadcastSectionId = 'changelog' | 'compose' | 'archive'

export function BroadcastsSummaryNav({
  unsentCount,
  broadcastsCount,
  onGo,
}: {
  unsentCount: number
  broadcastsCount: number
  onGo: (s: BroadcastSectionId) => void
}) {
  const items: Array<{
    id: BroadcastSectionId
    icon: LucideIcon
    label: string
    value: string
    highlight?: boolean
  }> = [
    {
      id: 'changelog',
      icon: Sparkles,
      label: 'Következő teendő',
      value:
        unsentCount > 0
          ? `${unsentCount} fejlesztés kiküldésre vár`
          : 'Minden fejlesztés kiküldve',
      highlight: unsentCount > 0,
    },
    {
      id: 'compose',
      icon: Send,
      label: 'Saját üzenet',
      value: 'Új üzenet írása',
    },
    {
      id: 'archive',
      icon: Clock,
      label: 'Előzmények',
      value: `${broadcastsCount} elküldött üzenet`,
    },
  ]

  return (
    <nav aria-label="Frissítések gyorsnavigáció" className="grid gap-2.5 sm:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon
        return (
          // Teljes-kártya gomb (engedélyezett kivétel a nyers <button> alól)
          <button
            key={item.id}
            type="button"
            onClick={() => onGo(item.id)}
            className={`group flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:p-3.5 ${
              item.highlight
                ? 'border-amber-300 bg-amber-50/70 hover:border-amber-400 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:border-amber-700'
                : 'border-border bg-card hover:border-primary/30 hover:shadow-sm'
            }`}
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                item.highlight
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {item.label}
              </span>
              <span
                className={`block text-sm font-medium leading-snug ${
                  item.highlight ? 'text-amber-800 dark:text-amber-300' : 'text-foreground'
                }`}
              >
                {item.value}
              </span>
            </span>
            <ArrowRight
              className={`size-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                item.highlight
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground/50'
              }`}
              aria-hidden
            />
          </button>
        )
      })}
    </nav>
  )
}
