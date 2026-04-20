export default function ForumLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100/60" />
        <div className="space-y-2">
          <div className="h-6 w-32 rounded-lg bg-slate-100" />
          <div className="h-4 w-64 rounded-lg bg-slate-100/60" />
        </div>
      </div>
      <div className="h-10 rounded-full bg-slate-100/60" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/60 border border-white/50 h-32" />
        ))}
      </div>
    </div>
  )
}
