/**
 * Iktató oldal — `/iktato` route.
 *
 * Sprint G (2026-04-25) — READ-ONLY desktop-paritás az iktatott iratokra.
 *
 * Funkciók:
 *   - PageHero
 *   - Év-szűrő (utolsó 5 év)
 *   - 4 statisztika-kártya (összes / beérkező / kimenő / nincs elintézve)
 *   - Irány-fülek (Mind / Beérkező / Kimenő)
 *   - Szöveg-keresés (subject, küldő/címzett, tárgykivonat)
 *   - Iratlista táblázatosan (sorszám, irány, kelt, tárgy, küldő/címzett, elintézés)
 *   - „Frissítés most" gomb (full-pull)
 *   - „Új irat" gomb (disabled, hamarosan)
 *
 * Új irat rögzítése (write-flow) Sprint H+-ra kerül.
 */

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  FileStack,
  Inbox,
  Plus,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react'

import { Button, Card, CardContent, Input } from '@kartoteka/ui'
import { OnlineStatePill, PageHero } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLastPullFilingIso,
  getLocalFilingEntries,
  getLocalFilingStats,
  pullFilingOfOwnCongregation,
  type FilingDirection,
  type FilingEntryLocalRow,
  type FilingStats,
} from '../lib/sync'

type DirectionFilter = FilingDirection | 'all'

const DIRECTION_LABELS: Record<DirectionFilter, string> = {
  all: 'Mind',
  incoming: 'Beérkező',
  outgoing: 'Kimenő',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[1]}. ${m[2]}. ${m[3]}.`
}

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [0, 1, 2, 3, 4].map((n) => CURRENT_YEAR - n)

export function IktatoPage() {
  const [user, setUser] = useState<User | null>(null)
  const [year, setYear] = useState<number>(CURRENT_YEAR)
  const [direction, setDirection] = useState<DirectionFilter>('all')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<FilingStats | null>(null)
  const [entries, setEntries] = useState<FilingEntryLocalRow[]>([])
  const [lastPullIso, setLastPullIso] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullSuccess, setPullSuccess] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Auth
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Stats + last pull
  useEffect(() => {
    if (!user) return
    let mounted = true
    void Promise.all([
      getLocalFilingStats(user.id, year).catch(() => null),
      getLastPullFilingIso(user.id).catch(() => null),
    ]).then(([s, lp]) => {
      if (!mounted) return
      setStats(s)
      setLastPullIso(lp)
    })
    return () => {
      mounted = false
    }
  }, [user, year, refreshKey])

  // Lista
  useEffect(() => {
    if (!user) return
    let mounted = true
    void getLocalFilingEntries(user.id, {
      year,
      direction,
      search: search || undefined,
      limit: 200,
    })
      .then((rows) => {
        if (mounted) setEntries(rows)
      })
      .catch(() => {
        if (mounted) setEntries([])
      })
    return () => {
      mounted = false
    }
  }, [user, year, direction, search, refreshKey])

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setPullSuccess(null)
    try {
      const result = await pullFilingOfOwnCongregation(user.id)
      if (result.mode === 'no-congregation') {
        setPullError('Nincs hozzárendelt gyülekezet — a frissítés nem futott le.')
      } else {
        setPullSuccess(`Frissítve: ${result.pulledRows} iktatott irat.`)
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
          eyebrow="Iktató"
          title="Iktatott iratok"
          description="A gyülekezet beérkező és kimenő hivatalos iratai év szerinti sorszámozással. Az adatok offline is elérhetők; új irat rögzítése hamarosan."
          Icon={FileStack}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Új iktatás a következő frissítésben érkezik."
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <Plus className="mr-1 size-3.5" />
                Új irat
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
          <StatCard label="Összes" value={stats?.total ?? 0} icon={FileStack} gradient="from-sky-500 to-blue-600" />
          <StatCard label="Beérkező" value={stats?.incoming ?? 0} icon={Inbox} gradient="from-emerald-500 to-teal-600" />
          <StatCard label="Kimenő" value={stats?.outgoing ?? 0} icon={Send} gradient="from-amber-500 to-orange-600" />
          <StatCard label="Nincs elintézve" value={stats?.pending ?? 0} icon={Clock} gradient="from-rose-500 to-red-600" />
        </div>

        {/* Szűrők: év + irány + keresés */}
        <Card className="card-raised border-0">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
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
                {(Object.keys(DIRECTION_LABELS) as DirectionFilter[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      direction === d
                        ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {DIRECTION_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Keresés tárgyra, küldőre, címzettre, tárgykivonatra…"
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        {entries.length === 0 ? (
          <Card className="card-raised border-0">
            <CardContent className="p-10 text-center">
              <FileStack className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {search
                  ? 'A szűrőknek megfelelő irat nem található.'
                  : 'Nincsen iktatott irat ebben az évben.'}
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
                  <th className="px-4 py-2.5">Sorsz.</th>
                  <th className="px-4 py-2.5">Irány</th>
                  <th className="px-4 py-2.5">Kelt</th>
                  <th className="px-4 py-2.5">Tárgy</th>
                  <th className="px-4 py-2.5">Küldő / Címzett</th>
                  <th className="px-4 py-2.5">Elintézés</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const Icon = e.direction === 'incoming' ? ArrowDownToLine : ArrowUpFromLine
                  const isPending = !e.elintezes_ideje
                  return (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
                        {e.year}/{String(e.sequence_number).padStart(3, '0')}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          e.direction === 'incoming'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          <Icon className="size-3" />
                          {e.direction === 'incoming' ? 'Be' : 'Ki'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(e.kelt)}</td>
                      <td className="px-4 py-2.5 text-slate-800">
                        <div className="font-medium">{e.subject}</div>
                        {e.targykivonat && (
                          <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{e.targykivonat}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{e.sender_or_recipient ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                            <Clock className="size-3" />
                            függőben
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-slate-600">{formatDate(e.elintezes_ideje)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {entries.length === 200 && (
              <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-500">
                Az első 200 találat látszik. Szűkítsd a keresést, hogy a többit is láthasd.
              </div>
            )}
          </Card>
        )}
      </div>
    </DesktopShell>
  )
}

// ──────────────────────────────────────────────────────────────
// Helper komponensek
// ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  icon: typeof FileStack
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
