'use client'

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  Calculator,
  CircleAlert,
  Coins,
  Landmark,
  Save,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  getMonetarySnapshot,
  saveMonetarySnapshot,
  type MonetaryDenomination,
} from '@/app/(dashboard)/penzugy/monetary-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  TRANSFER_TYPE_LABELS,
  formatCurrency,
  type BankAccount,
  type InternalTransferRow,
} from '@/lib/constants/finance'

interface MonetaryTabV2Props {
  expectedCashBalance: number
  currentYear: number
  bankAccounts: BankAccount[]
  internalTransfers: InternalTransferRow[]
}

function formatRon(value: number) {
  return `${formatCurrency(value)} RON`
}

export function MonetaryTabV2({
  expectedCashBalance,
  currentYear,
  bankAccounts,
  internalTransfers,
}: MonetaryTabV2Props) {
  const [denominations, setDenominations] = useState<MonetaryDenomination[]>([])
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const loadSnapshot = useCallback(async () => {
    setLoading(true)
    const result = await getMonetarySnapshot(currentYear)
    if ('error' in result) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    setDenominations(result.denominations)
    setCounts(result.counts)
    setLoading(false)
  }, [currentYear])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadSnapshot()
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadSnapshot])

  const countedTotal = useMemo(
    () =>
      denominations.reduce(
        (sum, denomination) => sum + denomination.value * (counts[denomination.id] || 0),
        0,
      ),
    [counts, denominations],
  )

  const grouped = useMemo(
    () => ({
      bankjegy: denominations.filter((item) => item.category === 'bankjegy'),
      erme: denominations.filter((item) => item.category === 'erme'),
    }),
    [denominations],
  )

  const banknoteCount = useMemo(
    () => grouped.bankjegy.reduce((sum, item) => sum + (counts[item.id] || 0), 0),
    [counts, grouped.bankjegy],
  )
  const coinCount = useMemo(
    () => grouped.erme.reduce((sum, item) => sum + (counts[item.id] || 0), 0),
    [counts, grouped.erme],
  )

  const difference = countedTotal - expectedCashBalance
  const exchangeTransfers = internalTransfers.filter((row) => row.tipus === 'valutacsere')
  const latestTransfers = internalTransfers.slice(0, 4)
  const activeCurrencies = Array.from(new Set(bankAccounts.map((account) => account.valuta || 'RON')))

  function updateCount(denominationId: number, value: string) {
    const parsed = Math.max(0, Math.floor(Number(value) || 0))
    setCounts((current) => ({ ...current, [denominationId]: parsed }))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveMonetarySnapshot(
        currentYear,
        denominations.map((denomination) => ({
          denominationId: denomination.id,
          count: counts[denomination.id] || 0,
        })),
      )

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      toast.success('A monetár ellenőrzés mentve lett.')
      await loadSnapshot()
    })
  }

  if (loading) {
    return (
      <div className="card-raised py-12 text-center text-sm text-slate-400">
        Monetár összeállítása folyamatban...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <Calculator className="size-4 text-teal-600" />
                  Monetár
                </CardTitle>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Bal oldalon adja meg címletenként, mennyi készpénz van ténylegesen a pénztárban vagy a lelkésznél. A rendszer azonnal megmutatja,
                  hogy ez hogyan viszonyul a könyvelt készpénzegyenleghez.
                </p>
              </div>
              <Button
                className="rounded-full bg-teal-600 px-5 hover:bg-teal-700"
                onClick={handleSave}
                disabled={isPending}
              >
                <Save className="mr-2 size-4" />
                {isPending ? 'Mentés...' : 'Monetár mentése'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Szoftver szerint"
                value={formatRon(expectedCashBalance)}
                tone="teal"
                hint="A könyvelt készpénzes tételek alapján"
              />
              <MetricCard
                label="Fizikailag számolt"
                value={formatRon(countedTotal)}
                tone="amber"
                hint="Az itt rögzített címletek összege"
              />
              <MetricCard
                label="Eltérés"
                value={formatRon(Math.abs(difference))}
                tone={difference === 0 ? 'emerald' : difference > 0 ? 'sky' : 'rose'}
                hint={
                  difference === 0
                    ? 'A pénztár pontosan egyezik.'
                    : difference > 0
                      ? 'Többlet látható a kasszában.'
                      : 'Hiány mutatkozik a kasszában.'
                }
              />
            </div>

            <DenominationTable
              title="Bankjegyek és 1 RON"
              icon={<Landmark className="size-4 text-emerald-600" />}
              items={grouped.bankjegy}
              counts={counts}
              onChange={updateCount}
            />

            <DenominationTable
              title="Érmék"
              icon={<Coins className="size-4 text-amber-600" />}
              items={grouped.erme}
              counts={counts}
              onChange={updateCount}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <Wallet className="size-4 text-violet-600" />
                Megjegyzések és háttér
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricBox label="Aktív bankszámlák" value={`${bankAccounts.length} db`} />
                <MetricBox label="Használt pénznemek" value={activeCurrencies.join(', ') || 'RON'} />
                <MetricBox label="Valutacserék" value={`${exchangeTransfers.length} tétel`} />
                <MetricBox label="Költségvetési év" value={`${currentYear}. év`} />
                <MetricBox label="Bankjegyek és 1 RON" value={`${banknoteCount} db`} />
                <MetricBox label="Érmék" value={`${coinCount} db`} />
              </div>

              <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/85 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="space-y-1.5">
                    <p className="font-semibold">Mire való a Monetár?</p>
                    <p className="leading-6 text-amber-800/90">
                      Ez az ellenőrző felület segít egyeztetni a tényleges készpénzt a könyvelt készpénzegyenleggel. Ha eltérés van, a pénztár azonnal további vizsgálatot igényel.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-white/70 bg-white/88 p-4 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.16)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Gyors ellenőrzési rend
                </p>
                <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <li>1. Számolja meg külön a bankjegyeket és külön az érméket.</li>
                  <li>2. Írja be darabra pontosan az egyes címleteket a bal oldali táblába.</li>
                  <li>3. Nézze meg, hogy az eltérés nulla-e, többlet-e vagy hiány.</li>
                  <li>4. Mentse el a pillanatképet, hogy visszakereshető maradjon.</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-800">Legutóbbi belső mozgások</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {latestTransfers.length === 0 ? (
                <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/75 p-4 text-sm text-slate-500">
                  Még nincs rögzített belső mozgás ebben az évben.
                </div>
              ) : (
                latestTransfers.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="rounded-[1.25rem] border border-white/70 bg-white/88 p-3 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.16)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {TRANSFER_TYPE_LABELS[transfer.tipus]}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {transfer.datum} · {transfer.forras} → {transfer.cel}
                        </p>
                      </div>
                      <div className="text-right text-sm font-semibold text-slate-700">
                        {formatRon(transfer.osszeg)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function DenominationTable({
  title,
  icon,
  items,
  counts,
  onChange,
}: {
  title: string
  icon: ReactNode
  items: MonetaryDenomination[]
  counts: Record<number, number>
  onChange: (denominationId: number, value: string) => void
}) {
  const total = items.reduce((sum, item) => sum + item.value * (counts[item.id] || 0), 0)

  return (
    <div className="space-y-4 rounded-[1.45rem] border border-slate-200/70 bg-white/92 p-4 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.14)]">
      <div className="flex items-center gap-2 text-slate-800">
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50/75 p-4 text-sm text-slate-500">
          Ehhez a csoporthoz jelenleg nincs megjeleníthető címlet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[1.2rem] border border-slate-200/70 bg-white/90">
          <table className="min-w-[520px] w-full text-sm">
            <thead className="border-b border-slate-200/70 bg-slate-50/90">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Címlet</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Megnevezés</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Darab</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Összesen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{item.displayValue}</td>
                  <td className="px-4 py-3 text-slate-500">{item.name}</td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={counts[item.id] || 0}
                      onChange={(event) => onChange(item.id, event.target.value)}
                      className="h-10 rounded-xl"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">
                    {formatRon((counts[item.id] || 0) * item.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-[1.3rem] bg-slate-50/85 px-4 py-3 ring-1 ring-slate-200/70">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title} összesen</p>
        <p className="mt-1 text-lg font-semibold text-slate-800">{formatRon(total)}</p>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: 'teal' | 'amber' | 'emerald' | 'sky' | 'rose'
  hint: string
}) {
  const toneClass = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone]

  return (
    <div className={`rounded-[1.35rem] px-4 py-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs opacity-80">{hint}</p>
    </div>
  )
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] bg-slate-50/85 px-4 py-3 ring-1 ring-slate-200/70">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
