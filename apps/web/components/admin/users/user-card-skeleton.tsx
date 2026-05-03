'use client'

interface UserCardSkeletonProps {
  count?: number
}

export function UserCardSkeleton({ count = 4 }: UserCardSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-raised p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="size-10 shrink-0 rounded-full bg-slate-200/80 animate-pulse" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-1/3 rounded bg-slate-200/80 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-slate-200/60 animate-pulse" />
              <div className="flex gap-2 pt-1">
                <div className="h-5 w-20 rounded-full bg-slate-200/60 animate-pulse" />
                <div className="h-5 w-24 rounded-full bg-slate-200/60 animate-pulse" />
              </div>
            </div>
            <div className="hidden sm:block h-7 w-28 rounded-md bg-slate-200/60 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
