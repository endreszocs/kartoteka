'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface PageHeroProps {
  eyebrow?: string
  title: string
  description?: string
  Icon: LucideIcon
  actions?: ReactNode
  stats?: Array<{ label: string; value: string }>
}

export function PageHero({ eyebrow, title, description, Icon, actions, stats }: PageHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-card p-5 shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border sm:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--accent2) 30%, transparent)' }} />
        <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full blur-3xl" style={{ background: 'color-mix(in oklab, var(--primary) 25%, transparent)' }} />
      </div>

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.25rem] text-[var(--primary-foreground)] shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem]" style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}>
            <Icon className="size-7" />
          </div>
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-1 font-serif text-[1.8rem] leading-[1.08] text-slate-800 sm:text-[2rem]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-start">
            {actions}
          </div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="relative mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-[1rem] bg-white/85 px-3 py-2 shadow-[0_14px_28px_-22px_rgba(15,74,66,0.35)] ring-1 ring-white/70"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {s.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
