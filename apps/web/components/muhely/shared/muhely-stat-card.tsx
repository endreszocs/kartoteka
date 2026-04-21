interface MuhelyStatCardProps {
  icon: React.ElementType
  value: number | string
  label: string
  accent?: string
}

export function MuhelyStatCard({ icon: Icon, value, label, accent = 'text-emerald-600 bg-emerald-50' }: MuhelyStatCardProps) {
  const [textColor, bgColor] = accent.split(' ')
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/80 border border-white/70 shadow-sm">
      <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
      <div>
        <div className="text-lg font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}
