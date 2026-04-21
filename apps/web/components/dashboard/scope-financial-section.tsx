import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Coins,
  type LucideIcon,
  Wallet,
} from 'lucide-react'

import { formatCurrency } from '@/lib/constants/finance'
import type { ScopeFinancialData } from '@/lib/dashboard/scope-financial'

type Tone = 'emerald' | 'rose' | 'indigo' | 'amber'

const toneStyles: Record<Tone, { shell: string; icon: string; value: string }> = {
  emerald: {
    shell: 'from-emerald-50 to-white',
    icon: 'bg-emerald-100 text-emerald-600',
    value: 'text-emerald-700',
  },
  rose: {
    shell: 'from-rose-50 to-white',
    icon: 'bg-rose-100 text-rose-600',
    value: 'text-rose-700',
  },
  indigo: {
    shell: 'from-indigo-50 to-white',
    icon: 'bg-indigo-100 text-indigo-600',
    value: 'text-indigo-700',
  },
  amber: {
    shell: 'from-amber-50 to-white',
    icon: 'bg-amber-100 text-amber-600',
    value: 'text-amber-700',
  },
}

interface ScopeFinancialSectionProps {
  data: ScopeFinancialData
  /** Ha true, az egyházmegye-szintű bontást is mutatja (kerületi nézethez). */
  showDioceseBreakdown?: boolean
  /** Ha true, a gyülekezetszintű bontást is mutatja. */
  showCongregationBreakdown?: boolean
  /** Limit a részletes táblázat sorszámára. Default: 12. */
  congregationLimit?: number
}

export function ScopeFinancialSection({
  data,
  showDioceseBreakdown = false,
  showCongregationBreakdown = true,
  congregationLimit = 12,
}: ScopeFinancialSectionProps) {
  const { total, byDiocese, byCongregation, year } = data
  const balanceTone: Tone = total.egyenleg >= 0 ? 'indigo' : 'rose'

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl text-slate-800">
          Pénzügyi áttekintés — {year}. év
        </h2>
        <p className="text-sm leading-6 text-slate-500">
          A felügyelt gyülekezetek aggregált bevételei, kiadásai és egyenlege az aktuális
          év szerint. A számokat a {data.total.congregationCount} gyülekezet összesítettjeként mutatjuk.
        </p>
      </div>

      {/* KPI kártyák */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          tone="emerald"
          icon={ArrowUpRight}
          label="Bevétel"
          value={`${formatCurrency(total.bevetel)} RON`}
          hint="Az év során befolyt összes adomány és járulék"
        />
        <KpiCard
          tone="rose"
          icon={ArrowDownRight}
          label="Kiadás"
          value={`${formatCurrency(total.kiadas)} RON`}
          hint="Az év során elkönyvelt összes kiadás"
        />
        <KpiCard
          tone={balanceTone}
          icon={Wallet}
          label="Egyenleg"
          value={`${total.egyenleg >= 0 ? '' : '−'}${formatCurrency(Math.abs(total.egyenleg))} RON`}
          hint={total.egyenleg >= 0 ? 'Pozitív év végi egyenleg' : 'Az év végén hiány mutatkozik'}
        />
      </div>

      {/* Egyházmegyei bontás (kerületi nézethez) */}
      {showDioceseBreakdown && byDiocese.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold text-slate-700">Egyházmegyei bontás</span>
            </div>
            <span className="text-xs text-slate-500">{byDiocese.length} egyházmegye</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-white/85">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Egyházmegye</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Gyülekezet</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Bevétel</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Kiadás</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Egyenleg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byDiocese.map((row) => (
                  <tr key={row.dioceseId || '__none__'} className="hover:bg-slate-50/70">
                    <td className="p-3 font-medium text-slate-700">{row.dioceseName}</td>
                    <td className="p-3 text-right text-slate-600">{row.congregationCount}</td>
                    <td className="p-3 text-right text-emerald-700">
                      {formatCurrency(row.bevetel)} RON
                    </td>
                    <td className="p-3 text-right text-rose-700">
                      {formatCurrency(row.kiadas)} RON
                    </td>
                    <td className={`p-3 text-right font-semibold ${row.egyenleg >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                      {row.egyenleg >= 0 ? '' : '−'}
                      {formatCurrency(Math.abs(row.egyenleg))} RON
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gyülekezetszintű bontás */}
      {showCongregationBreakdown && byCongregation.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-indigo-50/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-semibold text-slate-700">
                Top {Math.min(congregationLimit, byCongregation.length)} gyülekezet bevétel szerint
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {byCongregation.length} gyülekezet összesen
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-white/85">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Gyülekezet</th>
                  {showDioceseBreakdown && (
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Egyházmegye</th>
                  )}
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Bevétel</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Kiadás</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Egyenleg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byCongregation.slice(0, congregationLimit).map((row) => (
                  <tr key={row.congregationId} className="hover:bg-slate-50/70">
                    <td className="p-3 font-medium text-slate-700">{row.congregationName}</td>
                    {showDioceseBreakdown && (
                      <td className="p-3 text-xs text-slate-500">{row.dioceseName || '—'}</td>
                    )}
                    <td className="p-3 text-right text-emerald-700">
                      {formatCurrency(row.bevetel)} RON
                    </td>
                    <td className="p-3 text-right text-rose-700">
                      {formatCurrency(row.kiadas)} RON
                    </td>
                    <td className={`p-3 text-right font-semibold ${row.egyenleg >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                      {row.egyenleg >= 0 ? '' : '−'}
                      {formatCurrency(Math.abs(row.egyenleg))} RON
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {byCongregation.length > congregationLimit && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
              További {byCongregation.length - congregationLimit} gyülekezet adatai a részletes nézetben.
            </div>
          )}
        </div>
      )}

      {byCongregation.length === 0 && (
        <div className="card-raised p-8 text-center">
          <Coins className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            Erre az évre még nincs pénzügyi adat a felügyelt gyülekezetekben.
          </p>
        </div>
      )}
    </section>
  )
}

function KpiCard({
  tone,
  icon: Icon,
  label,
  value,
  hint,
}: {
  tone: Tone
  icon: LucideIcon
  label: string
  value: string
  hint: string
}) {
  const styles = toneStyles[tone]
  return (
    <div className={`card-raised relative overflow-hidden bg-gradient-to-br p-4 ${styles.shell}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-0.5 text-2xl font-bold ${styles.value}`}>{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  )
}
