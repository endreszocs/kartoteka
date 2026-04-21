import { BookOpen, Lightbulb, MessageCircle, Users } from 'lucide-react'
import { MuhelyStatCard } from '../shared/muhely-stat-card'

interface MuhelyQuickStatsProps {
  stats: {
    totalMaterials: number
    totalIdeas: number
    totalComments: number
    totalMembers: number
  }
}

export function MuhelyQuickStats({ stats }: MuhelyQuickStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MuhelyStatCard
        icon={BookOpen}
        value={stats.totalMaterials}
        label="segédanyag"
        accent="text-emerald-600 bg-emerald-50"
      />
      <MuhelyStatCard
        icon={Lightbulb}
        value={stats.totalIdeas}
        label="ötlet"
        accent="text-violet-600 bg-violet-50"
      />
      <MuhelyStatCard
        icon={MessageCircle}
        value={stats.totalComments}
        label="hozzászólás"
        accent="text-sky-600 bg-sky-50"
      />
      <MuhelyStatCard
        icon={Users}
        value={stats.totalMembers}
        label="résztvevő"
        accent="text-amber-600 bg-amber-50"
      />
    </div>
  )
}
