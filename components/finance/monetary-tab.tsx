'use client'

import { ArrowLeftRight, BadgeEuro, Building2, CircleAlert, Landmark, TrendingUp, Wallet } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, TRANSFER_TYPE_LABELS, type BankAccount, type InternalTransferRow } from '@/lib/constants/finance'

interface MonetaryTabProps {
  bankAccounts: BankAccount[]
  internalTransfers: InternalTransferRow[]
  currentYear: number
}

function groupOpeningBalances(bankAccounts: BankAccount[]) {
  return bankAccounts.reduce<Record<string, number>>((acc, account) => {
    const currency = account.valuta || 'RON'
    acc[currency] = (acc[currency] || 0) + (account.nyito_egyenleg || 0)
    return acc
  }, {})
}

export function MonetaryTab({ bankAccounts, internalTransfers, currentYear }: MonetaryTabProps) {
  const currencyCounts = bankAccounts.reduce<Record<string, number>>((acc, account) => {
    const currency = account.valuta || 'RON'
    acc[currency] = (acc[currency] || 0) + 1
    return acc
  }, {})

  const openingBalances = groupOpeningBalances(bankAccounts)
  const exchangeTransfers = internalTransfers.filter((row) => row.tipus === 'valutacsere')
  const averageExchangeRate = exchangeTransfers.length > 0
    ? exchangeTransfers.reduce((sum, row) => sum + (row.arfolyam || 0), 0) / exchangeTransfers.length
    : null

  const latestTransfers = internalTransfers.slice(0, 6)
  const eurAccounts = bankAccounts.filter((account) => account.valuta === 'EUR')
  const ronAccounts = bankAccounts.filter((account) => account.valuta === 'RON')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <BadgeEuro className="size-4 text-violet-600" />
              Pénznemi áttekintés
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Aktív számlák"
                value={bankAccounts.length}
                hint="Összes bankkapcsolat"
                icon={Landmark}
                tone="blue"
              />
              <MetricCard
                label="Valutaváltások"
                value={exchangeTransfers.length}
                hint={`${currentYear}. évben`}
                icon={ArrowLeftRight}
                tone="violet"
              />
              <MetricCard
                label="Átlagárfolyam"
                value={averageExchangeRate ? averageExchangeRate.toFixed(4) : '—'}
                hint="RON / EUR"
                icon={TrendingUp}
                tone="emerald"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys(openingBalances).length > 0 ? (
                Object.entries(openingBalances).map(([currency, amount]) => (
                  <div key={currency} className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.22)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Nyitó egyenleg · {currency}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">
                      {formatCurrency(amount)} <span className="text-base text-slate-400">{currency}</span>
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      {currencyCounts[currency] || 0} aktív bankszámla tartozik ehhez a pénznemhez.
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState message="Még nincs rögzített bankszámla vagy nyitó egyenleg a pénznemi áttekintéshez." />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <Wallet className="size-4 text-amber-600" />
              Gyors állapotkép
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusPill label="RON számlák" value={ronAccounts.length} tone="teal" />
            <StatusPill label="EUR számlák" value={eurAccounts.length} tone="violet" />
            <StatusPill label="Vegyes pénznem" value={Math.max(Object.keys(currencyCounts).length - 2, 0)} tone="amber" />

            <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Jelenlegi korlát</p>
                  <p className="mt-1 leading-relaxed text-amber-700/90">
                    A Monetár modul most a bankszámlák nyitó adatait és a belső valutaváltásokat mutatja.
                    A banki forgalom még nem számlaszintű, ezért itt csak a biztosan követhető pénznemi adatok jelennek meg.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <Building2 className="size-4 text-teal-600" />
              Aktív bankszámlák pénznem szerint
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bankAccounts.length === 0 ? (
              <EmptyState message="A Monetár fül akkor lesz igazán beszédes, ha legalább egy bankszámla aktív a rendszerben." />
            ) : (
              bankAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-col gap-3 rounded-[1.35rem] border border-white/70 bg-white/80 p-4 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.22)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{account.bank_neve}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {account.iban || 'Nincs IBAN rögzítve'} · {account.valuta || 'RON'}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Nyitó egyenleg</p>
                    <p className="mt-1 text-lg font-semibold text-slate-800">
                      {formatCurrency(account.nyito_egyenleg || 0)}{' '}
                      <span className="text-sm font-medium text-slate-400">{account.valuta || 'RON'}</span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <ArrowLeftRight className="size-4 text-rose-600" />
              Legutóbbi belső mozgások
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestTransfers.length === 0 ? (
              <EmptyState message="Ebben az évben még nincs rögzített belső mozgás vagy valutaváltás." />
            ) : (
              <div className="space-y-3">
                {latestTransfers.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="rounded-[1.35rem] border border-white/70 bg-white/82 p-4 shadow-[0_18px_36px_-34px_rgba(15,23,42,0.22)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {TRANSFER_TYPE_LABELS[transfer.tipus]}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {transfer.datum} · {transfer.forras} → {transfer.cel}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-semibold text-slate-800">
                          {formatCurrency(transfer.osszeg)} RON
                        </p>
                        {transfer.tipus === 'valutacsere' && transfer.cel_osszeg !== null && (
                          <p className="mt-1 text-xs text-violet-600">
                            {formatCurrency(transfer.cel_osszeg)} EUR
                            {transfer.arfolyam ? ` · Árfolyam: ${transfer.arfolyam.toFixed(4)}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {transfer.megjegyzes && (
                      <p className="mt-3 rounded-2xl bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-600">
                        {transfer.megjegyzes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'blue' | 'violet' | 'emerald'
}) {
  const toneMap = {
    blue: 'bg-sky-100 text-sky-600',
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
  } as const

  return (
    <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{hint}</p>
        </div>
        <div className={`flex size-11 items-center justify-center rounded-2xl ${toneMap[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  )
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'teal' | 'violet' | 'amber'
}) {
  const toneMap = {
    teal: 'bg-teal-50 text-teal-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
  } as const

  return (
    <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${toneMap[tone]}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-base font-semibold">{value}</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50/75 p-5 text-sm leading-relaxed text-slate-500">
      {message}
    </div>
  )
}
