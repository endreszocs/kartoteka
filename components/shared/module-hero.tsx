import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type ModuleHeroPillTone =
  | 'neutral'
  | 'emerald'
  | 'teal'
  | 'amber'
  | 'red'
  | 'violet'
  | 'sky'

interface ModuleHeroPill {
  label: string
  icon?: ReactNode
  tone?: ModuleHeroPillTone
}

interface ModuleHeroProps {
  eyebrow: string
  title: string
  description: string
  pills?: ModuleHeroPill[]
  actions?: ReactNode
  className?: string
}

const PILL_TONE_CLASSNAMES: Record<ModuleHeroPillTone, string> = {
  neutral: 'bg-white/82 text-slate-600',
  emerald: 'bg-emerald-50 text-emerald-700',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-700',
  sky: 'bg-sky-50 text-sky-700',
}

export function ModuleHero({
  eyebrow,
  title,
  description,
  pills = [],
  actions,
  className,
}: ModuleHeroProps) {
  return (
    <div className={cn('card-raised relative overflow-hidden p-5 sm:p-6', className)}>
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/30 blur-3xl" />

      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">{eyebrow}</p>
          <h2 className="font-heading text-3xl text-slate-800">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>

          {pills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pills.map((pill) => (
                <span
                  key={`${pill.label}-${pill.tone || 'neutral'}`}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium shadow-sm',
                    PILL_TONE_CLASSNAMES[pill.tone || 'neutral'],
                  )}
                >
                  {pill.icon}
                  {pill.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
