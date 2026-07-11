'use client'

/**
 * Import előzmények — az utolsó 50 import futás naplója (ki, mikor, mit,
 * mennyi sort). 2026-07-11 admin-redesign: AdminTable (mobil kártya-nézettel),
 * részlet-dialógus a futásokra, StatusBadge/AdminEmptyState, token-alapú
 * színek (dark-safe), címkézett modul-szűrő, hibalista-csonkolás jelzése.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminTable } from '@/components/admin/_shared/admin-table'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

const MODULE_FILTER_ITEMS: Record<string, string> = {
  all: 'Minden modul',
  ...MODULE_LABELS,
}

/** A logImportRun futásonként legfeljebb ennyi hibát ment el. */
const ERROR_STORE_LIMIT = 50

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

function moduleBadge(module: ImportModule) {
  return <StatusBadge intent="neutral">{MODULE_LABELS[module] || module}</StatusBadge>
}

function resultBadges(log: ImportLogEnriched) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <StatusBadge intent="success" icon={CheckCircle2}>
        {log.total_inserted} beillesztve
      </StatusBadge>
      {log.total_skipped > 0 && (
        <StatusBadge intent="warning" icon={AlertCircle}>
          {log.total_skipped} kihagyva
        </StatusBadge>
      )}
      {log.errors.length > 0 && (
        <StatusBadge intent="danger" icon={AlertCircle}>
          {log.errors.length} hiba
        </StatusBadge>
      )}
    </span>
  )
}

export function ImportLogList() {
  const [logs, setLogs] = useState<ImportLogEnriched[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState<ImportModule | 'all'>('all')
  const [detail, setDetail] = useState<ImportLogEnriched | null>(null)

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

  return (
    <section className="rounded-2xl border border-border p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <History className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-lg text-foreground">Import előzmények</h3>
            <p className="text-xs text-muted-foreground">
              Az utolsó 50 import futás naplója — ki, mikor, mit, mennyi sort. Egy
              sorra koppintva a részletek is megjelennek.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="import-log-module-filter" className="text-xs text-muted-foreground">
              Modul
            </Label>
            <Select
              items={MODULE_FILTER_ITEMS}
              value={moduleFilter}
              onValueChange={(value) => setModuleFilter((value ?? 'all') as ImportModule | 'all')}
            >
              <SelectTrigger id="import-log-module-filter" className="min-w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MODULE_FILTER_ITEMS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Frissítés
          </Button>
        </div>
      </div>

      <AdminTable
        columns={[
          { key: 'modul', label: 'Modul', className: 'w-32' },
          { key: 'fajl', label: 'Fájl' },
          { key: 'felhasznalo', label: 'Ki futtatta', hideBelow: 'lg' },
          { key: 'idopont', label: 'Időpont', className: 'whitespace-nowrap' },
          { key: 'eredmeny', label: 'Eredmény', align: 'right' },
          { key: 'reszletek', label: <span className="sr-only">Részletek</span>, className: 'w-8' },
        ]}
        rows={logs}
        rowKey={(log) => log.id}
        loading={loading}
        skeletonRows={5}
        minWidthClass="min-w-[640px]"
        onRowClick={(log) => setDetail(log)}
        renderCell={(log, key) => {
          switch (key) {
            case 'modul':
              return moduleBadge(log.module)
            case 'fajl':
              return (
                <span className="block max-w-52 truncate font-medium" title={log.file_name}>
                  {log.file_name}
                </span>
              )
            case 'felhasznalo':
              return <span className="text-muted-foreground">{log.user_name || '—'}</span>
            case 'idopont':
              return (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(log.created_at)}
                </span>
              )
            case 'eredmeny':
              return resultBadges(log)
            case 'reszletek':
              return <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            default:
              return null
          }
        }}
        renderMobileCard={(log) => (
          <button
            type="button"
            onClick={() => setDetail(log)}
            className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:bg-muted/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              {moduleBadge(log.module)}
              <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <p className="mt-1.5 truncate text-sm font-medium text-foreground" title={log.file_name}>
              {log.file_name}
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{log.user_name || '—'}</span>
              <span className="tabular-nums">{formatDateTime(log.created_at)}</span>
            </div>
            <div className="mt-2">{resultBadges(log)}</div>
          </button>
        )}
        empty={
          <AdminEmptyState
            icon={FileSpreadsheet}
            title="Még nincs import futás rögzítve"
            hint="Az első sikeres importálás után itt jelenik meg a futások naplója."
          />
        }
      />

      {/* Részlet-dialógus egy import futásról */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                  {moduleBadge(detail.module)}
                  <span className="break-all">{detail.file_name}</span>
                </DialogTitle>
                <DialogDescription>
                  {detail.user_name || 'Ismeretlen felhasználó'}
                  {detail.congregation_name ? ` · ${detail.congregation_name}` : ''} ·{' '}
                  {formatDateTime(detail.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {/* Összesítés */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge intent="success" icon={CheckCircle2}>
                    {detail.total_inserted} beillesztve
                  </StatusBadge>
                  {detail.total_skipped > 0 && (
                    <StatusBadge intent="warning" icon={AlertCircle}>
                      {detail.total_skipped} kihagyva
                    </StatusBadge>
                  )}
                  {detail.errors.length > 0 && (
                    <StatusBadge intent="danger" icon={AlertCircle}>
                      {detail.errors.length} hiba
                    </StatusBadge>
                  )}
                </div>

                {/* Munkalaponként */}
                {detail.per_sheet.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Munkalaponként
                    </p>
                    <ul className="space-y-1 text-xs text-foreground">
                      {detail.per_sheet.map((s, i) => (
                        <li key={i} className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                          <span className="font-medium">{s.sheet}</span>
                          <span className="text-muted-foreground"> ({s.profile})</span>: {s.inserted}{' '}
                          beillesztve, {s.skipped} kihagyva
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Párosítási statisztika */}
                {(() => {
                  const stats = detail.lookup_stats
                  const unresolved = (stats?.personUnresolved || 0) + (stats?.categoryUnresolved || 0)
                  if (!stats?.personResolved && !stats?.categoryResolved && unresolved === 0) {
                    return null
                  }
                  return (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Párosítás (személyek, kategóriák)
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <LookupStat label="Személy OK" value={stats?.personResolved || 0} tone="success" />
                        <LookupStat label="Személy nem" value={stats?.personUnresolved || 0} tone="warning" />
                        <LookupStat label="Kategória OK" value={stats?.categoryResolved || 0} tone="success" />
                        <LookupStat label="Kategória nem" value={stats?.categoryUnresolved || 0} tone="warning" />
                      </div>
                    </div>
                  )
                })()}

                {/* Párosítási figyelmeztetések */}
                {(detail.lookup_stats?.warnings || []).length > 0 && (
                  <details className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-400/30 dark:bg-amber-950/40">
                    <summary className="cursor-pointer font-semibold text-amber-800 dark:text-amber-200">
                      Párosítási figyelmeztetések ({(detail.lookup_stats.warnings || []).length})
                    </summary>
                    <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto pl-4 text-amber-800 dark:text-amber-200">
                      {(detail.lookup_stats.warnings || []).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Hibák */}
                {detail.errors.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs dark:border-rose-400/30 dark:bg-rose-950/40">
                    <p className="font-semibold text-rose-700 dark:text-rose-300">
                      Hibák ({detail.errors.length})
                    </p>
                    <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto pl-4 text-rose-700 dark:text-rose-300">
                      {detail.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-medium">{e.sheet}</span>{' '}
                          <span className="opacity-70">#{e.row}</span>: {e.message}
                        </li>
                      ))}
                    </ul>
                    {detail.errors.length >= ERROR_STORE_LIMIT && (
                      <p className="mt-1.5 text-[11px] text-rose-600/80 dark:text-rose-300/80">
                        A napló futásonként legfeljebb {ERROR_STORE_LIMIT} hibát tárol — a
                        teljes lista ennél hosszabb lehetett.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
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
  tone: 'success' | 'warning'
}) {
  const color =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center ${color}`}>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  )
}
