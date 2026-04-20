export default function SegedanyagokLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100/60" />
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-lg bg-slate-100" />
          <div className="h-4 w-72 rounded-lg bg-slate-100/60" />
        </div>
      </div>
      <div className="h-10 rounded-full bg-slate-100/60" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/60 border border-white/50 h-44" />
        ))}
      </div>
    </div>
  )
}
