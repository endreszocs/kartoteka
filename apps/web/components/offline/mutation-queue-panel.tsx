'use client'

import { useState, useTransition } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Skull,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { ConflictRecord, MutationEnvelope } from '@/lib/offline/db'
import { useSyncQuery } from '@/lib/offline/hooks/use-sync-query'
import {
  discardMutation,
  retryMutation,
} from '@/lib/offline/mutation-queue'
import { getSyncOrchestrator } from '@/lib/offline/sync-orchestrator'
import { isStandaloneMode } from '@/lib/standalone/is-standalone-client'
import { ConflictDialog } from './conflict-dialog'

/**
 * Mutation queue panel a /offline diagnosztikai oldalon.
 *
 * Megjeleníti:
 *  - Összes pending/failed/syncing/conflict/dead mutation
 *  - Mindegyikhez: tábla, művelet, létrehozás ideje, retry count, hibaüzenet
 *  - Akciók: újrapróba (failed/dead), eldobás, konfliktus-feloldás
 */
export function MutationQueuePanel() {
  const [isPending, startTransition] = useTransition()
  const [openConflict, setOpenConflict] = useState<ConflictRecord | null>(null)
  // Standalone módban a "Push most" gomb no-op (a havi sync flow kezeli a felhőt),
  // ezért elrejtjük, hogy ne generáljunk félreértést.
  const standalone = isStandaloneMode()

  // Kliens-oldali live query: mutation queue + conflicts
  const mutations = useSyncQuery<MutationEnvelope>('_mutation_queue') as
    | MutationEnvelope[]
    | undefined

  const conflicts = useSyncQuery<ConflictRecord>('_conflicts') as
    | ConflictRecord[]
    | undefined

  const unresolvedConflicts = (conflicts || []).filter(c => !c.resolved)

  function handleRetry(id: string) {
    startTransition(async () => {
      await retryMutation(id)
      const orchestrator = getSyncOrchestrator()
      if (orchestrator.isOnline()) {
        void orchestrator.pushAll()
      }
      toast.success('Újra próbálkozás elindítva.')
    })
  }

  function handleDiscard(id: string) {
    if (!confirm('Biztosan eldobod ezt a változtatást? Az adat visszaáll a szerver-oldali állapotra.')) {
      return
    }
    startTransition(async () => {
      await discardMutation(id)
      toast.success('Változtatás eldobva.')
    })
  }

  function handlePushNow() {
    startTransition(async () => {
      const orchestrator = getSyncOrchestrator()
      if (!orchestrator.isOnline()) {
        toast.error('Nincs internetkapcsolat.')
        return
      }
      await orchestrator.pushAll()
    })
  }

  const pendingOrFailedCount = (mutations || []).filter(
    m => m.status === 'pending' || m.status === 'failed',
  ).length

  return (
    <div className="space-y-5">
      {/* Konfliktusok (prioritás) */}
      {unresolvedConflicts.length > 0 && (
        <div className="card-raised overflow-hidden border-red-200">
          <div className="flex items-center justify-between border-b border-red-100 bg-red-50/60 px-5 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h3 className="font-heading text-lg text-slate-800">
                Feloldatlan konfliktusok
              </h3>
            </div>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {unresolvedConflicts.length}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {unresolvedConflicts.map(c => (
              <div
                key={`${c.table}-${c.rowId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-red-50/30"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {c.table}
                    <code className="ml-2 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">
                      id: {c.rowId}
                    </code>
                  </p>
                  <p className="text-xs text-slate-500">
                    Észlelve: {formatRelativeTime(c.detectedAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="rounded-lg bg-red-600 hover:bg-red-700"
                  onClick={() => setOpenConflict(c)}
                  disabled={isPending}
                >
                  Feloldás
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mutation queue */}
      <div className="card-raised overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-violet-50/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-violet-600" />
            <h3 className="font-heading text-lg text-slate-800">
              Feltöltésre váró változtatások
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {pendingOrFailedCount > 0 && !standalone && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50"
                onClick={handlePushNow}
                disabled={isPending}
              >
                <Upload className="mr-1 h-3 w-3" />
                Push most
              </Button>
            )}
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              {mutations?.length || 0}
            </span>
          </div>
        </div>

        {(!mutations || mutations.length === 0) ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-600">
              Nincs várakozó változtatás — mindent szinkronizáltunk.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {mutations.map(m => (
              <MutationRow
                key={m.id}
                mutation={m}
                onRetry={handleRetry}
                onDiscard={handleDiscard}
                disabled={isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Conflict dialog */}
      <ConflictDialog
        open={!!openConflict}
        onOpenChange={open => {
          if (!open) setOpenConflict(null)
        }}
        conflict={openConflict}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Egyedi mutation sor
// ─────────────────────────────────────────────────────────────────

function MutationRow({
  mutation,
  onRetry,
  onDiscard,
  disabled,
}: {
  mutation: MutationEnvelope
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  disabled: boolean
}) {
  const { Icon, color, label } = getStatusVisuals(mutation.status)
  const opLabel = opToLabel(mutation.op)

  return (
    <div className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/60">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">
            {opLabel}
          </span>
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
            {mutation.table}
          </code>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color} bg-opacity-10`}>
            {label}
          </span>
          {mutation.retryCount > 0 && (
            <span className="text-[10px] text-slate-500">
              ({mutation.retryCount}. próbálkozás)
            </span>
          )}
        </div>

        <p className="mt-0.5 text-xs text-slate-500">
          Létrehozva: {formatRelativeTime(mutation.clientTimestamp)}
          {mutation.nextRetryAt && mutation.status === 'failed' && (
            <span className="ml-2">
              • következő próba: {formatRelativeTime(mutation.nextRetryAt, true)}
            </span>
          )}
        </p>

        {mutation.errorMsg && (
          <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
            {mutation.errorMsg}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        {(mutation.status === 'failed' || mutation.status === 'dead') && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-500 hover:text-violet-600"
            onClick={() => onRetry(mutation.id)}
            disabled={disabled}
            title="Újrapróba"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        {mutation.status !== 'syncing' && mutation.status !== 'conflict' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-500 hover:text-red-600"
            onClick={() => onDiscard(mutation.id)}
            disabled={disabled}
            title="Eldob"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

function opToLabel(op: MutationEnvelope['op']): string {
  switch (op) {
    case 'insert':
      return 'Új rekord'
    case 'update':
      return 'Módosítás'
    case 'delete':
      return 'Törlés'
  }
}

function getStatusVisuals(status: MutationEnvelope['status']) {
  switch (status) {
    case 'pending':
      return { Icon: Clock, color: 'text-amber-600', label: 'Várakozik' }
    case 'syncing':
      return { Icon: Upload, color: 'text-sky-600', label: 'Küldés…' }
    case 'failed':
      return { Icon: AlertCircle, color: 'text-red-600', label: 'Sikertelen' }
    case 'conflict':
      return { Icon: AlertTriangle, color: 'text-orange-600', label: 'Konfliktus' }
    case 'dead':
      return { Icon: Skull, color: 'text-slate-600', label: 'Feladva (5 retry)' }
  }
}

function formatRelativeTime(ms: number, future = false): string {
  const diffMs = future ? ms - Date.now() : Date.now() - ms
  const absDiff = Math.abs(diffMs)
  if (absDiff < 60_000) return future ? 'hamarosan' : 'néhány másodperce'
  if (absDiff < 3_600_000) {
    const mins = Math.round(absDiff / 60_000)
    return future ? `${mins} perc múlva` : `${mins} perce`
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.round(absDiff / 3_600_000)
    return future ? `${hrs} óra múlva` : `${hrs} órája`
  }
  try {
    return new Date(ms).toLocaleString('hu-HU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
