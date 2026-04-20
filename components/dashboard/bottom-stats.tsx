import { User, UserRound, Baby, BarChart3, Coins, ClipboardCheck, Banknote } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface BottomStatsProps {
  men: number
  women: number
  childrenCount: number
  avgAge: number
  payersCount: number
  presbCount: number
  balance: number
}

interface StatDef {
  key: string
  label: string
  Icon: LucideIcon
  gradient: string
}

const stats: StatDef[] = [
  { key: 'men', label: 'Férfiak', Icon: User, gradient: 'from-blue-500 to-blue-600' },
  { key: 'women', label: 'Nők', Icon: UserRound, gradient: 'from-pink-500 to-rose-500' },
  { key: 'children', label: 'Gyermekek', Icon: Baby, gradient: 'from-amber-400 to-amber-500' },
  { key: 'avgAge', label: 'Átlagéletkor', Icon: BarChart3, gradient: 'from-violet-500 to-violet-600' },
  { key: 'payers', label: 'Fizetők idén', Icon: Coins, gradient: 'from-emerald-500 to-emerald-600' },
  { key: 'presb', label: 'Presbiterek', Icon: ClipboardCheck, gradient: 'from-orange-500 to-orange-600' },
  { key: 'balance', label: 'Egyenleg', Icon: Banknote, gradient: 'from-teal-500 to-teal-600' },
]

export function BottomStats({ men, women, childrenCount, avgAge, payersCount, presbCount, balance }: BottomStatsProps) {
  const values: Record<string, string> = {
    men: men.toLocaleString('hu'),
    women: women.toLocaleString('hu'),
    children: childrenCount.toLocaleString('hu'),
    avgAge: `${avgAge} év`,
    payers: payersCount.toLocaleString('hu'),
    presb: presbCount.toLocaleString('hu'),
    balance: `${balance >= 0 ? '+' : ''}${balance.toLocaleString('hu')} RON`,
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-7">
      {stats.map(stat => {
        const Icon = stat.Icon
        return (
          <div key={stat.key} className="card-raised relative overflow-hidden p-4 text-center">
            <div className="absolute inset-x-6 top-0 h-16 rounded-full bg-white/40 blur-2xl" />
            <div className={`icon-raised w-9 h-9 mx-auto bg-gradient-to-br ${stat.gradient}`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <p className={`text-lg font-bold mt-2.5 ${
              stat.key === 'balance' ? (balance >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-slate-800'
            }`}>
              {values[stat.key]}
            </p>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase tracking-wider">{stat.label}</p>
          </div>
        )
      })}
    </div>
  )
}
