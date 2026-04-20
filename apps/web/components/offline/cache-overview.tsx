'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Database,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { getDb, type SyncMetaRecord } from '@/lib/offline/db'
import { useOnlineStatus } from '@/lib/offline/hooks/use-online-status'
import { getSyncOrchestrator } from '@/lib/offline/sync-orchestrator'
import {
  MODULE_META,
  TABLE_REGISTRY,
  getTablesByModule,
  type ModuleKey,
} from '@/lib/offline/table-registry'
import { isStandaloneMode } from '@/lib/standalone/is-standalone-client'

/**
 * Cache áttekintő — modulonkénti bontás.
 *
 * Minden sync-tracked modul egy összecsukható kártyában:
 *  - Modul neve + ikon
 *  - Összes rekordszám
 *  - Kinyitva: táblánkénti sorok + utolsó sync + hibák
 *
 * A felső KPI-sor (online státusz, összméret, pending) az `OfflineDashboardStats`-ban van.
 */
export function CacheOverview() {
  const isOnline = useOnlineStatus()
  const [rowCounts, setRowCounts] = useState<Record<string, number>>({})
  const [syncMetas, setSyncMetas] = useState<Record<string, SyncMetaRecord>>({})
  const [expanded, setExpanded] = useState<Set<ModuleKey>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [isPending, startTransition] = useTransition()
  // Standalone módban a Dexie sync-orchestrator nem fut — a Teljes szinkron
  // gomb no-op lenne. A havi sync flow kezeli a Supabase-kapcsolatot.
  const standalone = isStandaloneMode()

  // Periodikus frissítés
  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return
    try {
      const db = getDb()
      const counts: Record<string, number> = {}
      const metas: Record<string, SyncMetaRecord> = {}
      for (const entry of TABLE_REGISTRY) {
        counts[entry.dexieTable] = await db.table(entry.dexieTable).count()
        const meta = await db._sync_meta.get(entry.dexieTable)
        if (meta) metas[entry.dexieTable] = meta
      }
      setRowCounts(counts)
      setSyncMetas(metas)
    } catch (e) {
      console.warn('[CacheOverview]', e)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh()
    })
    const interval = window.setInterval(() => void refresh(), 5_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [refresh])

  function toggleModule(module: ModuleKey) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
  }

  function handleFullSync() {
    startTransition(async () => {
      setSyncing(true)
      try {
        const orchestrator = getSyncOrchestrator()
        await orchestrator.pullAll()
        await refresh()
        toast.success('Teljes szinkronizálás kész.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Szinkronizálás sikertelen.')
      } finally {
        setSyncing(false)
      }
    })
  }

  const modules = Array.from(
    new Set(TABLE_REGISTRY.map(t => t.module)),
  ) as ModuleKey[]

  return (
    <div className="card-raised overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-violet-50/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-violet-600" />
          <div>
            <h3 className="font-heading text-lg text-slate-800">
              Modulonkénti cache
            </h3>
            <p className="text-xs text-slate-500">
              A lokális IndexedDB-ben tárolt rekordok. Kattints egy modulra a részletekhez.
            </p>
          </div>
        </div>
        {standalone ? (
          <span
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
            title="Standalone módban a havi sync flow kezeli a Supabase-kapcsolatot."
          >
            <RefreshCw className="mr-1.5 inline-block h-3.5 w-3.5" />
            Havi sync az aktív
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50"
            onClick={handleFullSync}
            disabled={!isOnline || syncing || isPending}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`}
            />
            Teljes szinkron most
          </Button>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {modules.map(module => {
          const meta = MODULE_META[module]
          const tables = getTablesByModule(module)
          const moduleTotal = tables.reduce(
            (sum, t) => sum + (rowCounts[t.dexieTable] || 0),
            0,
          )
          const isExpanded = expanded.has(module)
          const hasErrors = tables.some(t => syncMetas[t.dexieTable]?.lastError)

          return (
            <div key={module}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50/50 ${
                  isExpanded ? 'bg-slate-50/30' : ''
                }`}
                onClick={() => toggleModule(module)}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-${meta.color}-100`}
                >
                  <Database className={`h-4 w-4 text-${meta.color}-600`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    {meta.label}
                    {hasErrors && (
                      <AlertCircle className="h-3 w-3 text-red-500" />
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    <code className="font-mono">{meta.excelFileName}</code>
                    {' • '}
                    {tables.length} tábla
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-800 tabular-nums">
                    {moduleTotal.toLocaleString('hu-HU')}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    rekord
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                )}
              </button>

              {isExpanded && (
                <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/30">
                  {tables.map(table => {
                    const count = rowCounts[table.dexieTable] || 0
                    const meta = syncMetas[table.dexieTable]
                    const lastPull = meta?.lastPullAt
                      ? formatRelativeTime(meta.lastPullAt)
                      : 'Még nem szinkronizált'
                    const error = meta?.lastError

                    return (
                      <div
                        key={table.dexieTable}
                        className="flex items-center gap-3 py-2 pl-14 pr-5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-700">
                            {table.label}
                            <code className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                              {table.dexieTable}
                            </code>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Utolsó sync: {lastPull}
                            {error && (
                              <span className="ml-2 inline-flex items-center gap-1 text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                {error}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              count > 0 ? 'text-slate-800' : 'text-slate-400'
                            }`}
                          >
                            {count.toLocaleString('hu-HU')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    if (diffMs < 60_000) return 'néhány másodperce'
    if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)} perce`
    if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)} órája`
    return new Date(iso).toLocaleDateString('hu-HU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
