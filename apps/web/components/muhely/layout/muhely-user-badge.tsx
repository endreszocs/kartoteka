import { Star } from 'lucide-react'
import type { MissionLevel } from '@/lib/missions/gamification'

interface MuhelyUserBadgeProps {
  level: MissionLevel
  points: number
  percent: number
}

export function MuhelyUserBadge({ level, points, percent }: MuhelyUserBadgeProps) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${level.accent} flex items-center justify-center shadow-sm`}>
        <Star className="w-3.5 h-3.5 text-white fill-white" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-slate-700 leading-tight">{level.name}</span>
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${level.accent} transition-all duration-500`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{points} p</span>
        </div>
      </div>
    </div>
  )
}
