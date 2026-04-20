'use client'

import { formatCurrency, getExpensePartnerName, getTransactionDocumentNumber } from '@/lib/constants/finance'
import type { BefitetesRow, KiadasRow, BealitasRow } from '@/lib/constants/finance'
import { Wallet, Landmark, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { TvaPlafonWidget } from './tva-plafon-widget'

interface FinanceDashboardProps {
  balances: { cashBalance: number; bankBalance: number; totalIncome: number; totalExpense: number }
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  settings: BealitasRow
}

export function FinanceDashboard({ balances, incomeRecords, expenseRecords }: FinanceDashboardProps) {
  const netBalance = balances.totalIncome - balances.totalExpense

  const recent = [
    ...incomeRecords.slice(0, 20).map(r => ({ type: 'income' as const, id: r.id, datum: r.datum, osszeg: r.osszeg, label: r.forrasa || '—', iratszam: getTransactionDocumentNumber(r) })),
    ...expenseRecords.slice(0, 20).map(r => ({ type: 'expense' as const, id: r.id, datum: r.datum, osszeg: r.osszeg, label: getExpensePartnerName(r) || '—', iratszam: getTransactionDocumentNumber(r) })),
  ].sort((a, b) => (b.datum || '').localeCompare(a.datum || '')).slice(0, 10)

  return (
    <div className="space-y-4">
      {/* KPI kártyák */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FinKpi icon={<Wallet className="w-5 h-5" />} gradient="from-blue-500 to-indigo-600" label="Kassza egyenleg" value={formatCurrency(balances.cashBalance)} suffix="RON" />
        <FinKpi icon={<Landmark className="w-5 h-5" />} gradient="from-violet-500 to-purple-600" label="Bank egyenleg" value={formatCurrency(balances.bankBalance)} suffix="RON" />
        <FinKpi icon={<TrendingUp className="w-5 h-5" />} gradient="from-emerald-500 to-green-600" label="Bevétel (idén)" value={formatCurrency(balances.totalIncome)} suffix="RON" valueColor="text-emerald-600" />
        <FinKpi icon={<TrendingDown className="w-5 h-5" />} gradient="from-red-400 to-red-500" label="Kiadás (idén)" value={formatCurrency(balances.totalExpense)} suffix="RON" valueColor="text-red-500" />
      </div>

      {/* TVA-plafon figyelő — csak ha van beszámító forgalom, akkor jelenik meg */}
      <TvaPlafonWidget />

      {/* Megjegyzés: az Oblio e-Factura kapcsolat chip-je a Pénzügy hero-ban
          van — minden fülön elérhető. (lásd OblioStatusChip a finance-tabs.tsx-ben) */}

      {/* Egyenleg banner */}
      <div className={`card-raised p-5 flex items-center justify-between ${netBalance >= 0 ? 'bg-emerald-50/50' : 'bg-red-50/50'}`}>
        <div>
          <p className="text-sm text-slate-500">Éves egyenleg</p>
          <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)} RON
          </p>
        </div>
        <div className={`icon-raised w-12 h-12 ${netBalance >= 0 ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-red-400 to-red-500'}`}>
          {netBalance >= 0 ? <TrendingUp className="w-6 h-6 text-white" /> : <TrendingDown className="w-6 h-6 text-white" />}
        </div>
      </div>

      {/* Utolsó tranzakciók */}
      <div className="card-raised p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Legutóbbi mozgások</h3>
        {recent.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {recent.map(r => (
              <div key={`${r.type}-${r.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  {r.type === 'income' ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{r.label}</p>
                  <p className="text-[11px] text-slate-400">{r.datum?.split('T')[0]} {r.iratszam ? `· ${r.iratszam}` : ''}</p>
                </div>
                <span className={`text-sm font-bold ${r.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {r.type === 'income' ? '+' : '-'}{formatCurrency(r.osszeg)} RON
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">Még nincs tranzakció ebben az évben.</p>
        )}
      </div>
    </div>
  )
}

function FinKpi({ icon, gradient, label, value, suffix, valueColor }: {
  icon: React.ReactNode; gradient: string; label: string; value: string; suffix: string; valueColor?: string
}) {
  return (
    <div className="card-raised p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
          <p className={`text-lg sm:text-xl font-bold mt-1.5 ${valueColor || 'text-slate-800'}`}>{value} <span className="text-xs font-normal text-slate-400">{suffix}</span></p>
        </div>
        <div className={`icon-raised w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br ${gradient}`}>
          <span className="text-white">{icon}</span>
        </div>
      </div>
    </div>
  )
}
