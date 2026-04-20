'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  Building2,
  Headphones,
  SearchCheck,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAdminOverview, runQualityCheck } from '@/app/(dashboard)/admin/actions'

interface OverviewData {
  kpis: { congregations: number; activeUsers: number; members: number; pendingUsers: number; pendingTickets: number }
  dioceseStats: { name: string; congregations: number; members: number }[]
  top10: { name: string; members: number }[]
}

interface QualityData {
  data: { congName: string; missingCnp: number; missingGender: number; missingBirthdate: number }[]
  totals: { missingCnp: number; missingGender: number; missingBirthdate: number }
}

type Tone = 'slate' | 'indigo' | 'blue' | 'emerald' | 'amber' | 'rose'

const TONE_STYLES: Record<Tone, { shell: string; icon: string; mini: string; bar: string }> = {
  slate: {
    shell: 'from-slate-50 to-white text-slate-700',
    icon: 'bg-slate-100 text-slate-600',
    mini: 'bg-slate-50 text-slate-700',
    bar: 'bg-slate-400',
  },
  indigo: {
    shell: 'from-indigo-50 to-white text-slate-700',
    icon: 'bg-indigo-100 text-indigo-600',
    mini: 'bg-indigo-50 text-indigo-700',
    bar: 'bg-indigo-500',
  },
  blue: {
    shell: 'from-sky-50 to-white text-slate-700',
    icon: 'bg-sky-100 text-sky-600',
    mini: 'bg-sky-50 text-sky-700',
    bar: 'bg-sky-500',
  },
  emerald: {
    shell: 'from-emerald-50 to-white text-slate-700',
    icon: 'bg-emerald-100 text-emerald-600',
    mini: 'bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-500',
  },
  amber: {
    shell: 'from-amber-50 to-white text-slate-700',
    icon: 'bg-amber-100 text-amber-600',
    mini: 'bg-amber-50 text-amber-700',
    bar: 'bg-amber-500',
  },
  rose: {
    shell: 'from-rose-50 to-white text-slate-700',
    icon: 'bg-rose-100 text-rose-600',
    mini: 'bg-rose-50 text-rose-700',
    bar: 'bg-rose-500',
  },
}

export function OverviewTabRefined() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [quality, setQuality] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [qualityLoading, setQualityLoading] = useState(false)

  useEffect(() => {
    getAdminOverview()
      .then(setOverview)
      .catch(() => toast.error('Hiba az áttekintés betöltésekor'))
      .finally(() => setLoading(false))
  }, [])

  async function handleQualityCheck() {
    setQualityLoading(true)
    try {
      const result = await runQualityCheck()
      setQuality(result)
    } catch {
      toast.error('Hiba a minőségellenőrzés során')
    } finally {
      setQualityLoading(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Betöltés...</div>
  }

  if (!overview) {
    return <div className="py-12 text-center text-muted-foreground">Nem sikerült betölteni.</div>
  }

  const { kpis, dioceseStats, top10 } = overview

  return (
    <div className="mt-4 space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KpiCard
          label="Gyülekezetek"
          value={kpis.congregations}
          hint="Aktív gyülekezeti egység"
          icon={Building2}
          tone="indigo"
        />
        <KpiCard
          label="Aktív felhasználók"
          value={kpis.activeUsers}
          hint="Jóváhagyott fiókok"
          icon={Users}
          tone="blue"
        />
        <KpiCard
          label="Élő tagok"
          value={kpis.members}
          hint="Jelenleg nyilvántartott tag"
          icon={UserCheck}
          tone="emerald"
        />
        <KpiCard
          label="Függő regisztrációk"
          value={kpis.pendingUsers}
          hint="Jóváhagyásra vár"
          icon={UserPlus}
          tone={kpis.pendingUsers > 0 ? 'amber' : 'slate'}
          highlight={kpis.pendingUsers > 0}
        />
        <KpiCard
          label="Nyitott jegyek"
          value={kpis.pendingTickets}
          hint="Támogatási teendő"
          icon={Headphones}
          tone={kpis.pendingTickets > 0 ? 'rose' : 'slate'}
          highlight={kpis.pendingTickets > 0}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.9fr_1fr]">
        {dioceseStats.length > 0 && (
          <Card className="card-raised border-0 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                <Building2 className="size-4 text-indigo-600" />
                Egyházmegyék összesítője
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-3 gap-3 rounded-[1.4rem] bg-slate-50/85 p-3 text-center">
                <MiniSummary label="Összes egyházmegye" value={dioceseStats.length} />
                <MiniSummary label="Gyülekezet" value={dioceseStats.reduce((sum, item) => sum + item.congregations, 0)} />
                <MiniSummary label="Nyilvántartott tag" value={dioceseStats.reduce((sum, item) => sum + item.members, 0)} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 font-medium">Egyházmegye</th>
                      <th className="py-2 font-medium text-right">Gyülekezetek</th>
                      <th className="py-2 font-medium text-right">Tagok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dioceseStats.map((d) => (
                      <tr key={d.name} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 font-medium text-slate-700">{d.name}</td>
                        <td className="py-2.5 text-right text-slate-600">{d.congregations}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-700">{d.members.toLocaleString('hu-HU')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <ShieldAlert className="size-4 text-amber-600" />
              Sürgős figyelmeztetések
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AlertRow
              tone={kpis.pendingUsers > 0 ? 'amber' : 'emerald'}
              label="Regisztrációk"
              value={`${kpis.pendingUsers} várakozik`}
              description={kpis.pendingUsers > 0 ? 'Érdemes jóváhagyni vagy visszajelezni.' : 'Jelenleg nincs függő kérés.'}
            />
            <AlertRow
              tone={kpis.pendingTickets > 0 ? 'rose' : 'emerald'}
              label="Támogatási jegyek"
              value={`${kpis.pendingTickets} nyitott`}
              description={kpis.pendingTickets > 0 ? 'A felhasználók visszajelzésre várnak.' : 'Jelenleg nincs nyitott támogatási jegy.'}
            />
            <AlertRow
              tone="blue"
              label="Felhasználói aktivitás"
              value={`${kpis.activeUsers} aktív fiók`}
              description="A rendszer jelenlegi aktív felhasználói bázisa."
            />
          </CardContent>
        </Card>

        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <Activity className="size-4 text-cyan-600" />
              Rendszerállapot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusMeter
              label="Gyülekezeti lefedettség"
              value={kpis.congregations}
              max={Math.max(kpis.congregations + 4, 10)}
              tone="indigo"
            />
            <StatusMeter
              label="Felhasználói aktivitás"
              value={kpis.activeUsers}
              max={Math.max(kpis.activeUsers + 8, 20)}
              tone="blue"
            />
            <StatusMeter
              label="Adatállomány"
              value={kpis.members}
              max={Math.max(kpis.members + 40, 100)}
              tone="emerald"
            />
          </CardContent>
        </Card>
      </div>

      {top10.length > 0 && (
        <Card className="card-raised border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <Activity className="size-4 text-emerald-600" />
              Legnagyobb gyülekezetek
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 font-medium">#</th>
                    <th className="py-2 font-medium">Gyülekezet</th>
                    <th className="py-2 font-medium text-right">Tagszám</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((item, index) => (
                    <tr key={item.name} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 text-slate-400">{index + 1}.</td>
                      <td className="py-2.5 font-medium text-slate-700">{item.name}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-700">{item.members.toLocaleString('hu-HU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="card-raised border-0 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-800">
            <SearchCheck className="size-4 text-rose-600" />
            Adatminőség ellenőrzés
          </CardTitle>
          <Button size="sm" variant="outline" onClick={handleQualityCheck} disabled={qualityLoading}>
            {qualityLoading ? 'Ellenőrzés...' : 'Minőség ellenőrzés'}
          </Button>
        </CardHeader>
        <CardContent>
          {!quality && <p className="text-sm text-muted-foreground">Kattintson az ellenőrzés gombra.</p>}
          {quality && quality.data.length === 0 && (
            <p className="text-sm font-medium text-green-600">Gratulálunk! Minden rendben!</p>
          )}
          {quality && quality.data.length > 0 && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <MiniSummary label="Hiányzó CNP" value={quality.totals.missingCnp} tone="rose" />
                <MiniSummary label="Hiányzó nem" value={quality.totals.missingGender} tone="amber" />
                <MiniSummary label="Hiányzó szül.dátum" value={quality.totals.missingBirthdate} tone="indigo" />
                <MiniSummary label="Érintett sor" value={quality.data.length} tone="slate" />
                <MiniSummary label="Ellenőrzött egyházmegye" value={overview.dioceseStats.length} tone="emerald" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 font-medium">Gyülekezet</th>
                      <th className="py-2 font-medium text-right">Hiányzó CNP</th>
                      <th className="py-2 font-medium text-right">Hiányzó nem</th>
                      <th className="py-2 font-medium text-right">Hiányzó szül.dátum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quality.data.map((row) => (
                      <tr key={row.congName} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 font-medium text-slate-700">{row.congName}</td>
                        <td className="py-2.5 text-right">{row.missingCnp || '—'}</td>
                        <td className="py-2.5 text-right">{row.missingGender || '—'}</td>
                        <td className="py-2.5 text-right">{row.missingBirthdate || '—'}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 font-bold">
                      <td className="py-2.5">Összesen</td>
                      <td className="py-2.5 text-right">{quality.totals.missingCnp}</td>
                      <td className="py-2.5 text-right">{quality.totals.missingGender}</td>
                      <td className="py-2.5 text-right">{quality.totals.missingBirthdate}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  highlight,
}: {
  label: string
  value: number
  hint: string
  icon: React.ComponentType<{ className?: string }>
  tone: Tone
  highlight?: boolean
}) {
  const styles = TONE_STYLES[tone]

  return (
    <Card className={`overflow-hidden border-0 bg-gradient-to-br ${styles.shell} shadow-[0_24px_50px_-38px_rgba(15,23,42,0.2)]`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${highlight ? 'text-rose-600' : 'text-slate-800'}`}>
              {value.toLocaleString('hu-HU')}
            </p>
            <p className="mt-2 text-xs text-slate-500">{hint}</p>
          </div>
          <div className={`flex size-11 items-center justify-center rounded-2xl ${styles.icon}`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MiniSummary({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: number
  tone?: Tone
}) {
  const styles = TONE_STYLES[tone]

  return (
    <div className={`rounded-[1.2rem] px-3 py-3 ${styles.mini}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{label}</p>
      <p className="mt-1 text-lg font-bold">{value.toLocaleString('hu-HU')}</p>
    </div>
  )
}

function AlertRow({
  label,
  value,
  description,
  tone,
}: {
  label: string
  value: string
  description: string
  tone: Tone
}) {
  const styles = TONE_STYLES[tone]

  return (
    <div className="rounded-[1.2rem] border border-slate-100 bg-white/75 p-4 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles.mini}`}>{value}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </div>
  )
}

function StatusMeter({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: Tone
}) {
  const styles = TONE_STYLES[tone]
  const percentage = Math.max(8, Math.min(100, Math.round((value / Math.max(max, 1)) * 100)))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className="text-sm font-semibold text-slate-800">{value.toLocaleString('hu-HU')}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${styles.bar}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}
