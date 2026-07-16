import { Sprout } from 'lucide-react'

interface MuhelyLoadingProps {
  title: string
}

export function MuhelyLoading({ title }: MuhelyLoadingProps) {
  return (
    <section className="muhely-loading" aria-live="polite" aria-busy="true" aria-label={title}>
      <div className="muhely-loading-card">
        <div className="muhely-loading-emblem" aria-hidden="true">
          <Sprout strokeWidth={1.7} />
        </div>
        <p className="muhely-loading-kicker">Missziós Műhely</p>
        <p className="muhely-loading-title">{title}</p>
        <div className="muhely-loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="muhely-loading-worktable" aria-hidden="true">
          <span className="muhely-loading-sheet" />
          <span className="muhely-loading-sheet" />
          <span className="muhely-loading-sheet" />
        </div>
      </div>
    </section>
  )
}
