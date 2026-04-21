import {
  Baby,
  Cross,
  Droplets,
  Heart,
  type LucideIcon,
} from 'lucide-react'

import type { ScopeVitalStats } from '@/lib/dashboard/scope-vital'

type Tone = 'sky' | 'rose' | 'slate' | 'amber'

const toneStyles: Record<Tone, { shell: string; icon: string; value: string }> = {
  sky: {
    shell: 'from-sky-50 to-white',
    icon: 'bg-sky-100 text-sky-600',
    value: 'text-sky-700',
  },
  rose: {
    shell: 'from-rose-50 to-white',
    icon: 'bg-rose-100 text-rose-600',
    value: 'text-rose-700',
  },
  slate: {
    shell: 'from-slate-50 to-white',
    icon: 'bg-slate-100 text-slate-600',
    value: 'text-slate-700',
  },
  amber: {
    shell: 'from-amber-50 to-white',
    icon: 'bg-amber-100 text-amber-600',
    value: 'text-amber-700',
  },
}

interface ScopeVitalStatsSectionProps {
  data: ScopeVitalStats
  /** Egyházmegye-szintű bontás (kerületi nézethez). */
  showDioceseBreakdown?: boolean
  /** Gyülekezetszintű bontás. */
  showCongregationBreakdown?: boolean
  /** Limit a gyülekezet-bontásban. Default: 12. */
  congregationLimit?: number
}

export function ScopeVitalStatsSection({
  data,
  showDioceseBreakdown = false,
  showCongregationBreakdown = true,
  congregationLimit = 12,
}: ScopeVitalStatsSectionProps) {
  const { total, byDiocese, byCongregation, year } = data

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl text-slate-800">
          Anyakönyvi áttekintés — {year}. év
        </h2>
        <p className="text-sm leading-6 text-slate-500">
          A felügyelt gyülekezetekben az év során elvégzett kazuáliák: keresztelők,
          esketések, temetések és konfirmációk. A számokat mind a négy anyakönyvi
          tábla adatából aggregáljuk.
        </p>
      </div>

      {/* KPI kártyák */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          tone="sky"
          icon={Droplets}
          label="Keresztelők"
          value={total.keresztseg}
          hint={`${total.keresztseg === 1 ? '1 új tag' : `${total.keresztseg} új tag`} az évben`}
        />
        <KpiCard
          tone="rose"
          icon={Heart}
          label="Esketések"
          value={total.hazassag}
          hint={`${total.hazassag === 1 ? '1 új házaspár' : `${total.hazassag} házaspár`} hűséget kötött`}
        />
        <KpiCard
          tone="slate"
          icon={Cross}
          label="Temetések"
          value={total.temetes}
          hint={`${total.temetes === 1 ? '1 elköltözött testvér' : `${total.temetes} elköltözött testvér`}`}
        />
        <KpiCard
          tone="amber"
          icon={Baby}
          label="Konfirmáltak"
          value={total.konfirmalas}
          hint={`${total.konfirmalas === 1 ? '1 fiatal' : `${total.konfirmalas} fiatal`} fogadalmat tett`}
        />
      </div>

      {/* Egyházmegyei bontás */}
      {showDioceseBreakdown && byDiocese.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-sky-50/40 px-4 py-3">
            <span className="text-sm font-semibold text-slate-700">
              Egyházmegyei bontás
            </span>
            <span className="text-xs text-slate-500">{byDiocese.length} egyházmegye</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-white/85">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">
                    Egyházmegye
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">
                    Gyülekezet
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">
                    Keresztelő
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">
                    Esketés
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">
                    Temetés
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">
                    Konfirmáció
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">
                    Összesen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byDiocese.map((row) => (
                  <tr
                    key={row.dioceseId || '__none__'}
                    className="hover:bg-slate-50/70"
                  >
                    <td className="p-3 font-medium text-slate-700">{row.dioceseName}</td>
                    <td className="p-3 text-right text-slate-600">
                      {row.congregationCount}
                    </td>
                    <td className="p-3 text-right text-sky-700">{row.keresztseg}</td>
                    <td className="p-3 text-right text-rose-700">{row.hazassag}</td>
                    <td className="p-3 text-right text-slate-600">{row.temetes}</td>
                    <td className="p-3 text-right text-amber-700">{row.konfirmalas}</td>
                    <td className="p-3 text-right font-semibold text-slate-800">
                      {row.total}
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
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/40 px-4 py-3">
            <span className="text-sm font-semibold text-slate-700">
              Top {Math.min(congregationLimit, byCongregation.length)} gyülekezet kazuáliák szerint
            </span>
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
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Keresztelő</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Esketés</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Temetés</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Konfirmáció</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Összesen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byCongregation.slice(0, congregationLimit).map((row) => (
                  <tr key={row.congregationId} className="hover:bg-slate-50/70">
                    <td className="p-3 font-medium text-slate-700">{row.congregationName}</td>
                    {showDioceseBreakdown && (
                      <td className="p-3 text-xs text-slate-500">{row.dioceseName || '—'}</td>
                    )}
                    <td className="p-3 text-right text-sky-700">{row.keresztseg}</td>
                    <td className="p-3 text-right text-rose-700">{row.hazassag}</td>
                    <td className="p-3 text-right text-slate-600">{row.temetes}</td>
                    <td className="p-3 text-right text-amber-700">{row.konfirmalas}</td>
                    <td className="p-3 text-right font-semibold text-slate-800">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {byCongregation.length === 0 && (
        <div className="card-raised p-8 text-center">
          <Cross className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            Erre az évre még nincs anyakönyvi adat a felügyelt gyülekezetekben.
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
  value: number
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
          <p className="mt-1 text-xs text-slate-500 line-clamp-1">{hint}</p>
        </div>
      </div>
    </div>
  )
}
