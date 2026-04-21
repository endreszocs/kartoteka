export default function JutalmakLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100/60" />
        <div className="space-y-2">
          <div className="h-6 w-32 rounded-lg bg-slate-100" />
          <div className="h-4 w-64 rounded-lg bg-slate-100/60" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-100/60 h-64" />
        <div className="rounded-2xl bg-slate-100/60 h-96" />
      </div>
    </div>
  )
}
