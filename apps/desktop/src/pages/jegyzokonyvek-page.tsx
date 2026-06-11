/**
 * Jegyzőkönyvek lista oldal — `/jegyzokonyvek` route.
 *
 * Sprint H (2026-04-25) — READ-ONLY desktop-paritás.
 * Presbiteri és közgyűlési jegyzőkönyvek áttekintése év szerint.
 *
 * Részlet-nézet: `/jegyzokonyvek/:id` (külön oldal).
 */

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Plus,
  RefreshCw,
  ScrollText,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Card, CardContent } from '@kartoteka/ui'
import { OnlineStatePill, PageHero } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import {
  getLastPullMinutesIso,
  getLocalMinutesList,
  getLocalMinutesStats,
  pullMinutesOfOwnCongregation,
  type MinutesLocalRow,
  type MinutesStats,
  type MinutesType,
} from '../lib/sync'

type TypeFilter = MinutesType | 'all'

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: 'Mind',
  presbiteri: 'Presbiteri',
  kozgyulesi: 'Közgyűlési',
}

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [0, 1, 2, 3, 4].map((n) => CURRENT_YEAR - n)

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[1]}. ${m[2]}. ${m[3]}.`
}

export function JegyzokonyvekPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [year, setYear] = useState<number>(CURRENT_YEAR)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [stats, setStats] = useState<MinutesStats | null>(null)
  const [list, setList] = useState<MinutesLocalRow[]>([])
  const [lastPullIso, setLastPullIso] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullSuccess, setPullSuccess] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let mounted = true
    getDesktopUser().then((resolvedUser) => {
      if (mounted) setUser(resolvedUser)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let mounted = true
    void Promise.all([
      getLocalMinutesStats(user.id, year).catch(() => null),
      getLastPullMinutesIso(user.id).catch(() => null),
    ]).then(([s, lp]) => {
      if (!mounted) return
      setStats(s)
      setLastPullIso(lp)
    })
    return () => {
      mounted = false
    }
  }, [user, year, refreshKey])

  useEffect(() => {
    if (!user) return
    let mounted = true
    void getLocalMinutesList(user.id, { year, tipus: typeFilter })
      .then((rows) => {
        if (mounted) setList(rows)
      })
      .catch(() => {
        if (mounted) setList([])
      })
    return () => {
      mounted = false
    }
  }, [user, year, typeFilter, refreshKey])

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setPullSuccess(null)
    try {
      const result = await pullMinutesOfOwnCongregation(user.id)
      if (result.mode === 'no-congregation') {
        setPullError('Nincs hozzárendelt gyülekezet — a frissítés nem futott le.')
      } else {
        setPullSuccess(
          `Frissítve: ${result.pulledRows.jegyzokonyvek} jegyzőkönyv (${result.pulledRows.hatarozatok} határozattal).`,
        )
        setRefreshKey((k) => k + 1)
      }
    } catch (err) {
      setPullError(errorMessage(err))
    } finally {
      setPulling(false)
    }
  }, [user])

  const lastPullText = lastPullIso ? formatRelativeTime(lastPullIso) : 'még sosem'

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Jegyzőkönyvek"
          title="Presbiteri és közgyűlési jegyzőkönyvek"
          description="A gyülekezet hivatalos ülés-jegyzőkönyvei résztvevőkkel, napirendi pontokkal és határozatokkal. Az adatok offline is elérhetők; új jegyzőkönyv rögzítése hamarosan."
          Icon={ScrollText}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Új jegyzőkönyv rögzítése a következő frissítésben érkezik."
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <Plus className="mr-1 size-3.5" />
                Új jegyzőkönyv
              </Button>
              <Button
                size="sm"
                onClick={handlePull}
                disabled={pulling}
                className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)]"
              >
                <RefreshCw className={`mr-1 size-3.5 ${pulling ? 'animate-spin' : ''}`} />
                {pulling ? 'Frissítés…' : 'Frissítés most'}
              </Button>
            </>
          }
          stats={[
            { label: 'Év', value: String(year) },
            { label: 'Utolsó frissítés', value: lastPullText },
          ]}
        />

        {/* DIAGNOSTICS P2-7: egységes online/offline pill a read-only oldalakra */}
        <div className="flex justify-end">
          <OnlineStatePill lastSyncAt={lastPullIso} />
        </div>

        {pullError && (
          <Card className="border-red-200 bg-red-50/80">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{pullError}</span>
            </CardContent>
          </Card>
        )}
        {pullSuccess && (
          <Card className="border-emerald-200 bg-emerald-50/80">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>{pullSuccess}</span>
            </CardContent>
          </Card>
        )}

        {/* 4 stat-kártya */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Összes ülés" value={stats?.total ?? 0} icon={ClipboardList} gradient="from-sky-500 to-blue-600" />
          <StatCard label="Presbiteri" value={stats?.presbiteri ?? 0} icon={Users} gradient="from-violet-500 to-purple-600" />
          <StatCard label="Közgyűlési" value={stats?.kozgyulesi ?? 0} icon={ScrollText} gradient="from-amber-500 to-orange-600" />
          <StatCard label="Határozat (idén)" value={stats?.resolutionsThisYear ?? 0} icon={CheckSquare} gradient="from-emerald-500 to-teal-600" />
        </div>

        {/* Szűrők: év + típus */}
        <Card className="card-raised border-0">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {YEAR_OPTIONS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYear(y)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    year === y
                      ? 'bg-slate-800 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    typeFilter === t
                      ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        {list.length === 0 ? (
          <Card className="card-raised border-0">
            <CardContent className="p-10 text-center">
              <ScrollText className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Nincsen jegyzőkönyv ebben az évben.
              </p>
              <p className="text-xs text-slate-400">
                Kattints a „Frissítés most" gombra, ha online vagy.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {list.map((jk) => (
              <button
                key={jk.id}
                type="button"
                onClick={() => navigate(`/jegyzokonyvek/${jk.id}`)}
                className="card-raised group flex items-start gap-4 p-4 text-left transition hover:-translate-y-0.5"
              >
                <div
                  className={`flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${
                    jk.tipus === 'presbiteri'
                      ? 'from-violet-500 to-purple-600'
                      : 'from-amber-500 to-orange-600'
                  } text-white shadow-sm`}
                >
                  <span className="font-mono text-base font-bold">{jk.ules_sorszam}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        jk.tipus === 'presbiteri'
                          ? 'bg-violet-50 text-violet-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {jk.tipus === 'presbiteri' ? 'Presbiteri' : 'Közgyűlési'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {jk.ev}/{jk.ules_sorszam}. ülés
                    </span>
                    {jk.allapot && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {jk.allapot}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 font-heading text-lg text-slate-800">
                    {formatDate(jk.datum)}
                    {jk.hely && <span className="ml-2 text-sm font-normal text-slate-500">— {jk.hely}</span>}
                  </h3>
                  {jk.elnok_neve && (
                    <p className="mt-1 text-xs text-slate-500">
                      Elnök: <strong className="text-slate-700">{jk.elnok_neve}</strong>
                      {jk.jegyzo_neve && (
                        <>
                          {' • '}Jegyző: <strong className="text-slate-700">{jk.jegyzo_neve}</strong>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-xs text-slate-400 group-hover:text-slate-600">
                  Megnyitás →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </DesktopShell>
  )
}

interface StatCardProps {
  label: string
  value: number | string
  icon: typeof ClipboardList
  gradient: string
}

function StatCard({ label, value, icon: Icon, gradient }: StatCardProps) {
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {typeof value === 'number' ? value.toLocaleString('hu') : value}
            </p>
          </div>
          <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = now - then
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin < 1) return 'most'
    if (diffMin < 60) return `${diffMin} perce`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr} órája`
    const diffDay = Math.round(diffHr / 24)
    if (diffDay < 30) return `${diffDay} napja`
    return new Date(iso).toLocaleDateString('hu-HU')
  } catch {
    return iso.slice(0, 10)
  }
}
