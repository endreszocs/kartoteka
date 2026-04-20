export default function MuhelyLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Hero skeleton */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-100/60 to-teal-100/40 h-64 sm:h-80" />

      {/* Content skeleton */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/60 border border-white/50 h-48" />
        ))}
      </div>
    </div>
  )
}
