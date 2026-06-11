/**
 * Sírhelyek oldal — `/sirhelyek` route.
 *
 * Sprint I (2026-04-25) — READ-ONLY desktop-paritás (4 tábla mirror).
 * Temető-szűrő → parcella-lista → kattintásra inline részletek (bérletek + elhunytak).
 */

import { Fragment, useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cross,
  Landmark,
  MapPin,
  Plus,
  RefreshCw,
  Users as UsersIcon,
} from 'lucide-react'

import { Button, Card, CardContent } from '@kartoteka/ui'
import { OnlineStatePill, PageHero } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import {
  getLastPullCemeteryIso,
  getLocalCemeteries,
  getLocalCemeteryStats,
  getLocalPlotDetail,
  getLocalPlotsOfCemetery,
  pullCemeteriesOfOwnCongregation,
  type CemeteryLocalRow,
  type CemeteryStats,
  type DeceasedLocalRow,
  type PlotLocalRow,
  type RentalLocalRow,
} from '../lib/sync'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[1]}. ${m[2]}. ${m[3]}.`
}

function isExpiringSoon(lejarata: string | null): boolean {
  if (!lejarata) return false
  const today = new Date()
  const expires = new Date(lejarata)
  if (isNaN(expires.getTime())) return false
  const diffDays = (expires.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= 90
}

export function SirhelyekPage() {
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<CemeteryStats | null>(null)
  const [cemeteries, setCemeteries] = useState<CemeteryLocalRow[]>([])
  const [activeCemeteryId, setActiveCemeteryId] = useState<number | null>(null)
  const [plots, setPlots] = useState<PlotLocalRow[]>([])
  const [expandedPlotId, setExpandedPlotId] = useState<number | null>(null)
  const [plotDetail, setPlotDetail] = useState<{ rentals: RentalLocalRow[]; deceased: DeceasedLocalRow[] } | null>(null)
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

  // Stats + temetők + last pull
  useEffect(() => {
    if (!user) return
    let mounted = true
    void Promise.all([
      getLocalCemeteryStats(user.id).catch(() => null),
      getLocalCemeteries(user.id).catch(() => []),
      getLastPullCemeteryIso(user.id).catch(() => null),
    ]).then(([s, cs, lp]) => {
      if (!mounted) return
      setStats(s)
      setCemeteries(cs)
      setLastPullIso(lp)
      // Auto-select első temető, ha még nincs aktív
      if (cs.length > 0 && activeCemeteryId === null) {
        setActiveCemeteryId(cs[0].id)
      }
    })
    return () => {
      mounted = false
    }
  }, [user, refreshKey, activeCemeteryId])

  // Parcellák az aktív temetőhöz
  useEffect(() => {
    if (activeCemeteryId === null) {
      setPlots([])
      return
    }
    let mounted = true
    void getLocalPlotsOfCemetery(activeCemeteryId)
      .then((rows) => {
        if (mounted) setPlots(rows)
      })
      .catch(() => {
        if (mounted) setPlots([])
      })
    return () => {
      mounted = false
    }
  }, [activeCemeteryId, refreshKey])

  // Detail az expanded parcellához
  useEffect(() => {
    if (expandedPlotId === null) {
      setPlotDetail(null)
      return
    }
    let mounted = true
    void getLocalPlotDetail(expandedPlotId)
      .then((d) => {
        if (mounted) setPlotDetail(d)
      })
      .catch(() => {
        if (mounted) setPlotDetail(null)
      })
    return () => {
      mounted = false
    }
  }, [expandedPlotId])

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setPullSuccess(null)
    try {
      const result = await pullCemeteriesOfOwnCongregation(user.id)
      if (result.mode === 'no-congregation') {
        setPullError('Nincs hozzárendelt gyülekezet — a frissítés nem futott le.')
      } else {
        setPullSuccess(
          `Frissítve: ${result.pulledRows.cemeteries} temető, ${result.pulledRows.plots} sírhely, ${result.pulledRows.rentals} bérlet, ${result.pulledRows.deceased} elhunyt.`,
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
          eyebrow="Sírhelyek"
          title="Temetők és sírhelyek"
          description="A gyülekezet temetői, parcellái, bérletei és elhunytjai. Az adatok offline is elérhetők; új sírhely vagy bérlet rögzítése hamarosan."
          Icon={Cross}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Új sírhely / bérlet rögzítése a következő frissítésben érkezik."
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <Plus className="mr-1 size-3.5" />
                Új tétel
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
          stats={[{ label: 'Utolsó frissítés', value: lastPullText }]}
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

        {/* 5 stat-kártya */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Temetők" value={stats?.cemeteries ?? 0} icon={Landmark} gradient="from-emerald-500 to-teal-600" />
          <StatCard label="Sírhelyek" value={stats?.plots ?? 0} icon={MapPin} gradient="from-sky-500 to-blue-600" />
          <StatCard label="Bérletek" value={stats?.rentals ?? 0} icon={UsersIcon} gradient="from-violet-500 to-purple-600" />
          <StatCard label="Elhunytak" value={stats?.deceased ?? 0} icon={Cross} gradient="from-slate-500 to-slate-700" />
          <StatCard label="Lejár 90 napon belül" value={stats?.rentalsExpiringSoon ?? 0} icon={AlertTriangle} gradient="from-amber-500 to-orange-600" highlight={!!stats?.rentalsExpiringSoon} />
        </div>

        {/* Temető-szűrő */}
        {cemeteries.length > 0 && (
          <Card className="card-raised border-0">
            <CardContent className="flex flex-wrap items-center gap-1.5 p-3">
              {cemeteries.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveCemeteryId(c.id)
                    setExpandedPlotId(null)
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    activeCemeteryId === c.id
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  title={c.cim ?? undefined}
                >
                  <Landmark className="mr-1 inline size-3" />
                  {c.nev}
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Parcella-lista */}
        {plots.length === 0 ? (
          <Card className="card-raised border-0">
            <CardContent className="p-10 text-center">
              <Cross className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {cemeteries.length === 0
                  ? 'Nincsen temető a lokális cache-ben.'
                  : 'A kiválasztott temetőben nincsen parcella.'}
              </p>
              <p className="text-xs text-slate-400">
                Kattints a „Frissítés most" gombra, ha online vagy.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="card-raised border-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Parcella / Sor / Szám</th>
                  <th className="px-4 py-2.5">Állapot</th>
                  <th className="px-4 py-2.5">Típus</th>
                  <th className="px-4 py-2.5">Méret</th>
                  <th className="px-4 py-2.5">Megjegyzés</th>
                </tr>
              </thead>
              <tbody>
                {plots.map((p) => {
                  const isExpanded = expandedPlotId === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/40 ${
                          isExpanded ? 'bg-slate-50/60' : ''
                        }`}
                        onClick={() => setExpandedPlotId(isExpanded ? null : p.id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                          {[p.parcella, p.sor, p.szam].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{p.allapot ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{p.tipus ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{p.meret ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">{p.megjegyzes ?? '—'}</td>
                      </tr>
                      {isExpanded && plotDetail && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <PlotRentals rentals={plotDetail.rentals} />
                              <PlotDeceased deceased={plotDetail.deceased} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DesktopShell>
  )
}

interface StatCardProps {
  label: string
  value: number | string
  icon: typeof Cross
  gradient: string
  highlight?: boolean
}

function StatCard({ label, value, icon: Icon, gradient, highlight }: StatCardProps) {
  return (
    <Card className={`card-raised border-0 overflow-hidden ${highlight ? 'ring-2 ring-amber-200' : ''}`}>
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

function PlotRentals({ rentals }: { rentals: RentalLocalRow[] }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-700">
        <UsersIcon className="size-3.5" />
        Bérletek ({rentals.length})
      </h4>
      {rentals.length === 0 ? (
        <p className="text-xs text-slate-500">Nincsen bérlet.</p>
      ) : (
        <div className="space-y-2">
          {rentals.map((r) => {
            const expSoon = isExpiringSoon(r.lejarata)
            return (
              <div
                key={r.id}
                className={`rounded-lg border px-3 py-2 ${
                  expSoon ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{r.berlo}</p>
                  {expSoon && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white">
                      <AlertTriangle className="size-3" />
                      lejár
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Megváltás: {formatDate(r.megvaltas)}
                  {r.lejarata && (
                    <>
                      {' • '}Lejár: <strong className="text-slate-700">{formatDate(r.lejarata)}</strong>
                    </>
                  )}
                </p>
                {r.tipus && <p className="text-xs text-slate-500">Típus: {r.tipus}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlotDeceased({ deceased }: { deceased: DeceasedLocalRow[] }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
        <Cross className="size-3.5" />
        Elhunytak ({deceased.length})
      </h4>
      {deceased.length === 0 ? (
        <p className="text-xs text-slate-500">Nincsen rögzített elhunyt.</p>
      ) : (
        <div className="space-y-2">
          {deceased.map((d) => (
            <div key={d.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-sm font-medium text-slate-800">
                {d.nev}
                {d.sznev && d.sznev !== d.nev && (
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    (szül.: {d.sznev})
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {d.sz_datum && <>Szül.: {formatDate(d.sz_datum)} • </>}
                {d.hdatum && (
                  <>
                    Halálozás: <strong className="text-slate-700">{formatDate(d.hdatum)}</strong>
                  </>
                )}
              </p>
              {d.tdatum && (
                <p className="text-xs text-slate-500">
                  Temetés: {formatDate(d.tdatum)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
