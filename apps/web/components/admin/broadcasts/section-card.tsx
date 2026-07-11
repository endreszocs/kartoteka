'use client'

/**
 * Egységes, kinyitható szekció-kártya a Frissítések oldalhoz
 * (2026-07-11 olvashatósági redesign).
 *
 * A korábbi bal-oldali menü + szekció-router helyett az oldal felülről
 * lefelé olvasható: minden szekció egy-egy ilyen kártya, világos címmel,
 * egy mondatos leírással és státusz-jelvényekkel — a másodlagos szekciók
 * összecsukva indulnak, így egyszerre mindig egy dolog dominál.
 */

import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

export function BroadcastSectionCard({
  id,
  icon: Icon,
  title,
  description,
  badges,
  open,
  onToggle,
  children,
}: {
  /** DOM-id a gyorsnavigációs görgetéshez. */
  id: string
  icon: LucideIcon
  title: string
  /** Egy mondat — mindig látszik, összecsukva is elmondja, mi van bent. */
  description: string
  /** Státusz-jelvények a cím mellett (pl. „3 kiküldésre vár”). */
  badges?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const contentId = `${id}-content`
  return (
    <section
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-muted/40 sm:gap-4 sm:px-5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-11">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-heading text-lg leading-tight text-foreground">{title}</span>
            {badges}
          </span>
          <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
            {description}
          </span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={contentId} className="border-t border-border p-4 sm:p-5">
          {children}
        </div>
      )}
    </section>
  )
}
