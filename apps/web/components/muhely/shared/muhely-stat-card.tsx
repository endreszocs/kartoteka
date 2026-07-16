interface MuhelyStatCardProps {
  icon: React.ElementType
  value: number | string
  label: string
  accent?: string
}

export function MuhelyStatCard({ icon: Icon, value, label, accent = 'text-[#647a52] bg-[#edf2e9]' }: MuhelyStatCardProps) {
  const [textColor, bgColor] = accent.split(' ')
  return (
    <div className="flex items-center gap-3 rounded-[1.1rem_0.8rem_1.2rem_0.9rem] border border-[#ded1be] bg-[#fffdf7] px-4 py-3 shadow-[0_8px_22px_-18px_rgba(58,47,33,0.7)] transition hover:-translate-y-0.5 motion-reduce:transition-none">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${bgColor}`}>
        <Icon className={`w-5 h-5 ${textColor}`} />
      </div>
      <div>
        <div className="font-heading text-xl text-[#26382f]">{value}</div>
        <div className="text-xs text-[#72786f]">{label}</div>
      </div>
    </div>
  )
}
