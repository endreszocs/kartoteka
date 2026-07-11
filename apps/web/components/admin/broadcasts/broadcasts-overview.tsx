'use client'

/**
 * Áttekintő lap — röviden elmagyarázza, mire való minden menüpont, és
 * gyors-belépőket ad. (Kiemelve a broadcasts-tab.tsx-ből, 2026-07-11.)
 */

import { ChevronRight, Clock, Send, Sparkles, type LucideIcon } from 'lucide-react'

export type BroadcastSectionId = 'overview' | 'changelog' | 'compose' | 'archive'

export function BroadcastsOverview({
  entriesCount,
  unsentCount,
  broadcastsCount,
  onGo,
}: {
  entriesCount: number
  unsentCount: number
  broadcastsCount: number
  onGo: (s: BroadcastSectionId) => void
}) {
  const cards: Array<{
    id: BroadcastSectionId
    icon: LucideIcon
    title: string
    body: string
    cta: string
    stat?: string
  }> = [
    {
      id: 'changelog',
      icon: Sparkles,
      title: 'Fejlesztések kiküldése',
      body: 'Az új fejlesztéseket egy kattintással elküldheted a felhasználóknak értesítésként, vagy szép hírlevélbe csomagolva (amit előbb magadnak is letesztelhetsz).',
      cta: 'Fejlesztések megnyitása',
      stat: unsentCount > 0 ? `${unsentCount} kiküldésre vár` : `${entriesCount} bejegyzés`,
    },
    {
      id: 'compose',
      icon: Send,
      title: 'Új üzenet írása',
      body: 'Saját, egyedi üzenetet állíthatsz össze (cím + szöveg), kiválaszthatod a címzetteket, és kiküldheted értesítésként vagy e-mailben is.',
      cta: 'Üzenet írása',
    },
    {
      id: 'archive',
      icon: Clock,
      title: 'Elküldött üzenetek',
      body: 'Itt visszanézheted, mikor, kinek és milyen üzenetet küldtél ki, és hogy az e-mail kézbesítése sikeres volt-e.',
      cta: 'Elküldött üzenetek megnyitása',
      stat: `${broadcastsCount} elküldve`,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          // Teljes-kártya gomb (engedélyezett kivétel a nyers <button> alól)
          <button
            key={c.id}
            type="button"
            onClick={() => onGo(c.id)}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span
              className="flex size-11 items-center justify-center rounded-xl text-[var(--primary-foreground)] shadow-sm"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="flex-1">
              <h3 className="font-heading text-base text-foreground">{c.title}</h3>
              {c.stat && <p className="mt-0.5 text-xs font-medium text-primary">{c.stat}</p>}
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-all group-hover:gap-1.5">
              {c.cta}
              <ChevronRight className="size-4" aria-hidden />
            </span>
          </button>
        )
      })}
    </div>
  )
}
