import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface AdminEmptyStateProps {
  icon: LucideIcon
  title: string
  /** Rövid magyarázat: mit jelent az üres állapot, mit lehet tenni */
  hint?: string
  /** Opcionális CTA (pl. gomb vagy link) */
  action?: ReactNode
  className?: string
}

/**
 * Egységes üres-állapot az admin listákhoz/táblázatokhoz (2026-07-11 redesign).
 * A "Nincs találat." jellegű egysoros szövegek helyett: ikon + cím + magyarázat,
 * hogy az üres lista megkülönböztethető legyen a hibától és a szűrés-mellélövéstől.
 */
export function AdminEmptyState({ icon: Icon, title, hint, action, className }: AdminEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="mt-3 font-heading text-base text-foreground">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
