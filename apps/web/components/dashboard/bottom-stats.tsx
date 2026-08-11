import Link from 'next/link'
import { User, UserRound, Baby, BarChart3, Coins, ClipboardCheck, Banknote, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  formatHuDate,
  formatRon,
  type CongregationBalance,
} from '@/lib/dashboard/congregation-balance'

interface BottomStatsProps {
  men: number
  women: number
  childrenCount: number
  avgAge: number
  payersCount: number
  presbCount: number
  /**
   * 2026-08-11 (6. kör): a csempe már NEM egy nyers `number`-t kap.
   *
   * Korábban itt egy 24 havi nettó forgalom érkezett „Egyenleg" felirattal, és
   * a komponensnek esélye sem volt észrevenni, hogy hibás számot rajzol.
   * A diszkriminált unió miatt a hibás/hiányos állapotot MUSZÁJ külön kezelni:
   * nincs olyan ág, amelyben csendben kiírnánk egy hihetőnek látszó összeget.
   */
  balance: CongregationBalance
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
]

/** A csempe belső váza — a 7 doboz pixelre egyforma marad. */
function TileShell({
  Icon,
  gradient,
  children,
}: {
  Icon: LucideIcon
  gradient: string
  children: React.ReactNode
}) {
  return (
    <>
      <div className="absolute inset-x-6 top-0 h-16 rounded-full bg-white/40 blur-2xl" />
      <div className={`icon-raised w-9 h-9 mx-auto bg-gradient-to-br ${gradient}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      {children}
    </>
  )
}

/**
 * PÉNZKÉSZLET csempe — 2026-08-11 (6. kör).
 *
 * A felirat SZÁNDÉKOSAN nem „Egyenleg": az a szó egyszerre jelenthet
 * egyenleget, forgalmi különbözetet és eredményt, és pontosan ez a
 * félreolvashatóság volt a bejelentett hiba gyökere. Amit a csempe mutat:
 * a gyülekezet MAI pénzkészlete = kassza + minden bankszámla, RON-ban.
 * A pontos meghatározás a `title`-ben (egérrel rámutatva) teljes mondatban is
 * ott van, a kassza/bank bontással együtt.
 *
 * Mobil-first: a szám `tabular-nums` + kisebb alap-fokozat, hogy két oszlopos
 * telefon-rácsban se csússzon ki a dobozból.
 */
function BalanceTile({ balance }: { balance: CongregationBalance }) {
  if (!balance.ok) {
    // FAIL LOUDLY. Egy hihetőnek látszó, néma rossz szám helyett látható
    // állapot + kattintható út a javításhoz.
    return (
      <Link
        href="/penzugy"
        title={balance.detail}
        aria-label={`Pénzkészlet: ${balance.short}. ${balance.detail}`}
        className="card-raised relative block overflow-hidden p-4 text-center transition hover:bg-muted/40"
      >
        <TileShell Icon={AlertTriangle} gradient="from-amber-400 to-amber-500">
          <p className="mt-2.5 text-sm font-bold text-amber-600">{balance.short}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Pénzkészlet
          </p>
          <p className="mt-0.5 text-[9px] leading-tight text-amber-600/80">
            kattints a rendezéshez
          </p>
        </TileShell>
      </Link>
    )
  }

  const napja = formatHuDate(balance.asOf)
  const title =
    `A gyülekezet tényleges pénzkészlete ${napja} állapot szerint: ` +
    `kassza ${formatRon(balance.cash)} RON + bank ${formatRon(balance.bank)} RON = ` +
    `${formatRon(balance.total)} RON. A ${balance.year}. évi nyitó egyenlegből és az idén ` +
    `a mai napig könyvelt tételekből számolva, RON-ban, a stornózott és törölt tételek nélkül.` +
    (balance.futureDatedCount > 0
      ? ` Figyelem: ${balance.futureDatedCount} tétel MAI NAP UTÁNI dátummal van könyvelve — ` +
        `azokkal együtt (vagyis a Pénzügy modul teljes évi egyenlege) ${formatRon(balance.yearEndTotal)} RON.`
      : '')

  return (
    <div
      className="card-raised relative overflow-hidden p-4 text-center"
      title={title}
      aria-label={title}
    >
      <TileShell Icon={Banknote} gradient="from-teal-500 to-teal-600">
        <p
          className={`mt-2.5 text-[15px] font-bold tabular-nums sm:text-lg ${
            balance.total >= 0 ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {formatRon(balance.total)} RON
        </p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          Pénzkészlet ma
        </p>
        <p className="mt-0.5 text-[9px] leading-tight text-slate-400">
          {balance.futureDatedCount > 0 ? 'kassza + bank · van későbbi tétel' : 'kassza + bank'}
        </p>
      </TileShell>
    </div>
  )
}

export function BottomStats({ men, women, childrenCount, avgAge, payersCount, presbCount, balance }: BottomStatsProps) {
  const values: Record<string, string> = {
    men: men.toLocaleString('hu'),
    women: women.toLocaleString('hu'),
    children: childrenCount.toLocaleString('hu'),
    avgAge: `${avgAge} év`,
    payers: payersCount.toLocaleString('hu'),
    presb: presbCount.toLocaleString('hu'),
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-7">
      {stats.map(stat => {
        const Icon = stat.Icon
        return (
          <div key={stat.key} className="card-raised relative overflow-hidden p-4 text-center">
            <TileShell Icon={Icon} gradient={stat.gradient}>
              <p className="text-lg font-bold mt-2.5 text-slate-800">{values[stat.key]}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase tracking-wider">{stat.label}</p>
            </TileShell>
          </div>
        )
      })}
      <BalanceTile balance={balance} />
    </div>
  )
}
