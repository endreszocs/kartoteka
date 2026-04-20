export default function ProfilLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="rounded-2xl bg-white/60 border border-white/50 h-28" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/60 h-20" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white/60 h-64" />
        <div className="rounded-2xl bg-white/60 h-64" />
      </div>
    </div>
  )
}
