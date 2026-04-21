export default function ForumThreadLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="rounded-2xl bg-white/60 border border-white/50 h-64" />
      <div className="flex gap-3">
        <div className="h-10 w-32 rounded-full bg-slate-100" />
        <div className="h-10 w-32 rounded-full bg-slate-100" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white/60 h-24" />
        ))}
      </div>
    </div>
  )
}
