'use client'

import { Banknote, BarChart3, Baby, ClipboardCheck, Coins, User, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface BottomStatsProps {
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
}

// Sprint S F3 — gradient mező eltávolítva, mind a 7 stat-tile
// `var(--accent)` + `var(--accent2)` témára érzékeny gradient-et kap.
const STATS: StatDef[] = [
  { key: 'men', label: 'Férfiak', Icon: User },
  { key: 'women', label: 'Nők', Icon: UserRound },
  { key: 'children', label: 'Gyermekek', Icon: Baby },
  { key: 'avgAge', label: 'Átlagéletkor', Icon: BarChart3 },
  { key: 'payers', label: 'Fizetők idén', Icon: Coins },
  { key: 'presb', label: 'Presbiterek', Icon: ClipboardCheck },
  { key: 'balance', label: 'Egyenleg', Icon: Banknote },
]

export function BottomStats({
  men,
  women,
  childrenCount,
  avgAge,
  payersCount,
  presbCount,
  balance,
}: BottomStatsProps) {
  const values: Record<string, string> = {
    men: men.toLocaleString('hu'),
    women: women.toLocaleString('hu'),
    children: childrenCount.toLocaleString('hu'),
    avgAge: avgAge > 0 ? `${avgAge} év` : '—',
    payers: payersCount.toLocaleString('hu'),
    presb: presbCount.toLocaleString('hu'),
    balance: `${balance >= 0 ? '+' : ''}${balance.toLocaleString('hu')} RON`,
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-7">
      {STATS.map((stat) => {
        const Icon = stat.Icon
        return (
          <div key={stat.key} className="card-raised relative overflow-hidden p-4 text-center">
            <div
              className="absolute inset-x-6 top-0 h-16 rounded-full blur-2xl"
              style={{ background: 'color-mix(in oklab, var(--accent2) 20%, transparent)' }}
            />
            <div
              className="icon-raised w-9 h-9 mx-auto"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))' }}
            >
              <Icon className="w-4 h-4 text-white" />
            </div>
            <p
              className={`text-lg font-bold mt-2.5 ${
                stat.key === 'balance'
                  ? balance >= 0
                    ? 'text-emerald-600'
                    : 'text-red-600'
                  : 'text-foreground'
              }`}
            >
              {values[stat.key]}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase tracking-wider">
              {stat.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}
