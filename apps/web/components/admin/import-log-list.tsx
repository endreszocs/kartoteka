'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  History,
  RefreshCw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { listImportLogs, type ImportLogEnriched } from '@/lib/import/import-log'
import type { ImportModule } from '@/lib/import/import-profiles'

const MODULE_LABELS: Record<ImportModule, string> = {
  members: 'Tagnyilvántartás',
  finance: 'Pénzügy',
  registry: 'Anyakönyv',
  worklog: 'Munkanapló',
  filing: 'Iktató',
  inventory: 'Leltár',
}

const MODULE_COLORS: Record<ImportModule, string> = {
  members: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  finance: 'bg-amber-50 text-amber-700 ring-amber-200',
  registry: 'bg-blue-50 text-blue-700 ring-blue-200',
  worklog: 'bg-violet-50 text-violet-700 ring-violet-200',
  filing: 'bg-teal-50 text-teal-700 ring-teal-200',
  inventory: 'bg-slate-100 text-slate-700 ring-slate-200',
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('hu-HU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ImportLogList() {
  const [logs, setLogs] = useState<ImportLogEnriched[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState<ImportModule | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    const result = await listImportLogs({
      module: moduleFilter === 'all' ? undefined : moduleFilter,
      limit: 50,
    })
    setLoading(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    setLogs(result.data || [])
  }, [moduleFilter])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleRefresh() {
    startTransition(() => {
      void load()
    })
  }

  return (
    <div className="card-raised p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-indigo-600" />
          <div>
            <h3 className="font-heading text-lg text-slate-800">Import előzmények</h3>
            <p className="text-xs text-slate-500">
              Az utolsó 50 import futás naplója — ki, mikor, mit, mennyi sort.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value as ImportModule | 'all')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            <option value="all">Minden modul</option>
            {(Object.entries(MODULE_LABELS) as [ImportModule, string][]).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={handleRefresh}
            disabled={isPending || loading}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
            Frissítés
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Betöltés…</div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center">
          <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Még nincs import futás rögzítve.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const isExpanded = expanded.has(log.id)
            const hasErrors = log.errors.length > 0
            const lookupWarnings = (log.lookup_stats?.warnings || []).length
            const unresolved = (log.lookup_stats?.personUnresolved || 0) + (log.lookup_stats?.categoryUnresolved || 0)

            return (
              <div
                key={log.id}
                className="rounded-xl border border-slate-200 bg-white transition hover:shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(log.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50/40"
                >
                  <div className="mt-0.5 shrink-0 text-slate-400">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                          MODULE_COLORS[log.module]
                        }`}
                      >
                        {MODULE_LABELS[log.module]}
                      </span>
                      <span className="text-sm font-medium text-slate-800">
                        {log.file_name}
                      </span>
                      {hasErrors && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">
                          <AlertCircle className="h-3 w-3" />
                          {log.errors.length} hiba
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {log.user_name || '—'}
                      </span>
                      {log.congregation_name && (
                        <span>{log.congregation_name}</span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      {log.total_inserted} beillesztve
                    </span>
                    {log.total_skipped > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertCircle className="h-3 w-3" />
                        {log.total_skipped} kihagyva
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-3 text-xs">
                    {/* Per-sheet bontás */}
                    {log.per_sheet.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 font-semibold text-slate-600">Sheet-enként:</p>
                        <ul className="space-y-1 pl-4">
                          {log.per_sheet.map((s, i) => (
                            <li key={i} className="text-slate-700">
                              <span className="font-medium">{s.sheet}</span>
                              {' → '}
                              <code className="rounded bg-slate-100 px-1 text-[10px]">
                                {s.profile}
                              </code>
                              : {s.inserted} beillesztve, {s.skipped} kihagyva
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Lookup stats */}
                    {(log.lookup_stats?.personResolved || log.lookup_stats?.categoryResolved || unresolved > 0) && (
                      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <LookupStat
                          label="Személy OK"
                          value={log.lookup_stats?.personResolved || 0}
                          tone="emerald"
                        />
                        <LookupStat
                          label="Személy nem"
                          value={log.lookup_stats?.personUnresolved || 0}
                          tone="amber"
                        />
                        <LookupStat
                          label="Kategória OK"
                          value={log.lookup_stats?.categoryResolved || 0}
                          tone="emerald"
                        />
                        <LookupStat
                          label="Kategória nem"
                          value={log.lookup_stats?.categoryUnresolved || 0}
                          tone="amber"
                        />
                      </div>
                    )}

                    {/* Lookup warnings */}
                    {lookupWarnings > 0 && (
                      <details className="mb-3">
                        <summary className="cursor-pointer font-semibold text-slate-600">
                          Lookup figyelmeztetések ({lookupWarnings}):
                        </summary>
                        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto pl-4">
                          {(log.lookup_stats.warnings || []).map((w, i) => (
                            <li key={i} className="text-slate-600">
                              {w}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {/* Errors */}
                    {hasErrors && (
                      <details open>
                        <summary className="cursor-pointer font-semibold text-red-600">
                          Hibák ({log.errors.length}):
                        </summary>
                        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto pl-4">
                          {log.errors.map((e, i) => (
                            <li key={i} className="text-red-700">
                              <span className="font-medium">{e.sheet}</span>
                              {' '}
                              <span className="text-red-500">#{e.row}</span>: {e.message}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// LookupStat mini komponens
// ─────────────────────────────────────────────────────────────────

function LookupStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'emerald' | 'amber'
}) {
  const color =
    tone === 'emerald' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
  return (
    <div className={`rounded-lg ${color} px-2 py-1 text-center`}>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  )
}
