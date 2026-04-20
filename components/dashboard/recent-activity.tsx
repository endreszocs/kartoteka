import { Badge } from '@/components/ui/badge'
import { formatHuDate } from '@/lib/utils/date'
import { ACTIVITY_TYPE_COLORS } from '@/lib/constants/dashboard'
import { Activity } from 'lucide-react'

interface ActivityRow {
  idopont: string | null
  jellege: string | null
  cim: string | null
  created_at: string
}

interface RecentActivityProps {
  activities: ActivityRow[]
}

function getTypeColor(jellege: string | null): string {
  if (!jellege) return 'bg-slate-100 text-slate-600'
  const lower = jellege.toLowerCase()
  for (const [key, cls] of Object.entries(ACTIVITY_TYPE_COLORS)) {
    if (lower.includes(key)) return cls
  }
  return 'bg-slate-100 text-slate-600'
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <div className="card-raised overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/55 px-5 pb-3 pt-5">
        <div className="icon-raised w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Friss bejegyzések</h3>
          <p className="text-[11px] text-slate-400">Utolsó 10 munkanapló bejegyzés</p>
        </div>
      </div>
      <div className="px-5 pb-5">
        {activities.length > 0 ? (
          <div className="divide-y divide-white/60">
            {activities.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5 first:pt-2 last:pb-0">
                <div className="w-1.5 h-9 rounded-full bg-gradient-to-b from-teal-400 via-cyan-400 to-amber-300 shrink-0 shadow-sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 truncate">{a.cim || '—'}</span>
                    <Badge variant="secondary" className={`text-[10px] shrink-0 border-0 shadow-sm ${getTypeColor(a.jellege)}`}>
                      {a.jellege || '—'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {a.idopont ? formatHuDate(a.idopont) : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4">Nincs friss bejegyzés.</p>
        )}
      </div>
    </div>
  )
}
