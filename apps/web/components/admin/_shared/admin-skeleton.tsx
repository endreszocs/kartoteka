import { cn } from '@/lib/utils'

interface AdminSkeletonProps {
  /** Hány csík jelenjen meg (alapértelmezés: 4) */
  rows?: number
  className?: string
}

/**
 * Egységes betöltés-állapot az admin listákhoz (2026-07-11 redesign).
 * A kartoteka.css `.kt-skeleton` shimmer-osztályára épül — a korábbi
 * fájlonként eltérő "Betöltés..." szövegek/spinnerek helyett.
 */
export function AdminSkeleton({ rows = 4, className }: AdminSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Betöltés">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="kt-skeleton size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="kt-skeleton h-3.5" style={{ width: `${62 - (i % 3) * 12}%` }} />
            <div className="kt-skeleton h-3" style={{ width: `${38 + (i % 4) * 9}%` }} />
          </div>
        </div>
      ))}
      <span className="sr-only">Betöltés folyamatban…</span>
    </div>
  )
}
