/**
 * Éves Jelentés oldal — `/eves-jelentes` route.
 *
 * Sprint K (2026-04-25) — READ-ONLY desktop-paritás.
 * Status workflow: draft → submitted → received → reviewed → finalized.
 * A `snapshot_data` JSON-mező a részletes éves összesítő (auto-generált).
 */

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  BookCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

import { Button, Card, CardContent } from '@kartoteka/ui'
import { OnlineStatePill, PageHero } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import {
  getLastPullAnnualReportsIso,
  getLocalAnnualReports,
  pullAnnualReportsOfOwnCongregation,
  type AnnualReportLocalRow,
  type AnnualReportStatus,
} from '../lib/sync'

const STATUS_LABELS: Record<AnnualReportStatus, string> = {
  draft: 'Vázlat',
  submitted: 'Beküldve',
  received: 'Befogadva',
  reviewed: 'Áttekintve',
  finalized: 'Lezárva',
}

const STATUS_COLORS: Record<AnnualReportStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-amber-100 text-amber-700',
  received: 'bg-sky-100 text-sky-700',
  reviewed: 'bg-violet-100 text-violet-700',
  finalized: 'bg-emerald-100 text-emerald-700',
}

const STATUS_ICONS: Record<AnnualReportStatus, typeof FileText> = {
  draft: FileText,
  submitted: Send,
  received: ClipboardCheck,
  reviewed: BookCheck,
  finalized: ShieldCheck,
}

function formatCurrency(value: number): string {
  if (!value) return '0 RON'
  return `${Math.round(value).toLocaleString('hu')} RON`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[1]}. ${m[2]}. ${m[3]}.`
}

export function EvesJelentesPage() {
  const [user, setUser] = useState<User | null>(null)
  const [reports, setReports] = useState<AnnualReportLocalRow[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
      getLocalAnnualReports(user.id).catch(() => []),
      getLastPullAnnualReportsIso(user.id).catch(() => null),
    ]).then(([rs, lp]) => {
      if (!mounted) return
      setReports(rs)
      setLastPullIso(lp)
    })
    return () => {
      mounted = false
    }
  }, [user, refreshKey])

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setPullSuccess(null)
    try {
      const result = await pullAnnualReportsOfOwnCongregation(user.id)
      if (result.mode === 'no-congregation') {
        setPullError('Nincs hozzárendelt gyülekezet — a frissítés nem futott le.')
      } else {
        setPullSuccess(`Frissítve: ${result.pulledRows} éves jelentés.`)
        setRefreshKey((k) => k + 1)
      }
    } catch (err) {
      setPullError(errorMessage(err))
    } finally {
      setPulling(false)
    }
  }, [user])

  const lastPullText = lastPullIso ? formatRelativeTime(lastPullIso) : 'még sosem'

  // Stats: hány jelentés van melyik status-ban
  const statusCounts: Record<AnnualReportStatus, number> = {
    draft: 0,
    submitted: 0,
    received: 0,
    reviewed: 0,
    finalized: 0,
  }
  for (const r of reports) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1
  }

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Éves jelentés"
          title="Éves összesítő jelentések"
          description="A gyülekezet éves egyházi statisztikai jelentései a kerület felé. Az adatok offline is elérhetők; új jelentés szerkesztése a webes felületen."
          Icon={BookCheck}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Új jelentés szerkesztése a következő frissítésben érkezik."
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <Plus className="mr-1 size-3.5" />
                Új jelentés
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
            { label: 'Összes jelentés', value: String(reports.length) },
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

        {/* Status-csoportok */}
        {reports.length > 0 && (
          <Card className="card-raised border-0">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {(Object.keys(STATUS_LABELS) as AnnualReportStatus[]).map((s) => {
                  const Icon = STATUS_ICONS[s]
                  const count = statusCounts[s] ?? 0
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <div
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${STATUS_COLORS[s]}`}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                          {STATUS_LABELS[s]}
                        </p>
                        <p className="text-base font-bold text-slate-800">{count}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jelentések lista */}
        {reports.length === 0 ? (
          <Card className="card-raised border-0">
            <CardContent className="p-10 text-center">
              <BookCheck className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Még nincsen éves jelentés a lokális cache-ben.
              </p>
              <p className="text-xs text-slate-400">
                Kattints a „Frissítés most" gombra, ha online vagy.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const isExpanded = expandedId === r.id
              const Icon = STATUS_ICONS[r.status]
              return (
                <Card key={r.id} className="card-raised border-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="w-full text-left transition hover:bg-slate-50/40"
                  >
                    <CardContent className="flex items-start gap-4 p-4">
                      <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${STATUS_COLORS[r.status]}`}>
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-xl text-slate-800">
                            {r.year}. évi jelentés
                          </h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLORS[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                          </span>
                          {r.forwarded_to_kerulet === 1 && (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                              Kerületre továbbítva
                            </span>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                          <Stat label="Tagok" value={r.members_count.toLocaleString('hu')} />
                          <Stat label="Istentiszteletek" value={r.services_count.toLocaleString('hu')} />
                          <Stat label="Bevétel" value={formatCurrency(r.total_income)} />
                        </div>
                      </div>
                      <div className="shrink-0 text-slate-400">
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </div>
                    </CardContent>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/30 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <DetailField label="Beküldés" value={formatDateTime(r.submitted_at)} hint={r.submitted_by ?? undefined} />
                        <DetailField label="Befogadás" value={formatDateTime(r.received_at)} hint={r.received_by ?? undefined} />
                        <DetailField label="Áttekintés" value={formatDateTime(r.reviewed_at)} hint={r.reviewed_by ?? undefined} />
                        <DetailField label="Lezárás" value={formatDateTime(r.finalized_at)} hint={r.finalized_by ?? undefined} />
                        {r.forwarded_to_kerulet === 1 && (
                          <DetailField label="Kerületre továbbítva" value={formatDateTime(r.forwarded_at)} />
                        )}
                        <DetailField label="Utolsó módosítás" value={formatDateTime(r.updated_at)} />
                      </div>

                      {r.pastor_note && (
                        <div className="mt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Lelkészi megjegyzés
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.pastor_note}</p>
                        </div>
                      )}

                      {r.review_notes && (
                        <div className="mt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Áttekintő megjegyzései
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.review_notes}</p>
                        </div>
                      )}

                      {r.snapshot_data && (
                        <div className="mt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Részletes adatok (snapshot)
                          </p>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-violet-700 hover:underline">
                              Snapshot megjelenítése
                            </summary>
                            <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-white/80 p-3 text-[11px] text-slate-700">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(r.snapshot_data!), null, 2)
                                } catch {
                                  return r.snapshot_data
                                }
                              })()}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </DesktopShell>
  )
}

interface StatProps {
  label: string
  value: string
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Wallet className="size-3 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-mono text-sm font-semibold text-slate-700">{value}</p>
      </div>
    </div>
  )
}

interface DetailFieldProps {
  label: string
  value: string
  hint?: string
}

function DetailField({ label, value, hint }: DetailFieldProps) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
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
