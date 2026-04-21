'use client'

import { useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  dismissConflict,
  resolveConflict,
  type ResolutionStrategy,
} from '@/lib/offline/conflict-resolver'
import type { ConflictRecord } from '@/lib/offline/db'

/**
 * Conflict Resolution Dialog — a user ettől jön ki a konfliktusból.
 *
 * Három opció:
 *  - "Enyémet tartom" (keep_local): a lokális változás push-ol
 *     (a szerver friss revision-ével)
 *  - "Övét tartom" (keep_server): a szerver-oldali állapot nyer
 *  - "Mégse" (dismiss): a konfliktust elvetjük, nincs push, nincs overwrite
 *
 * A UI egy diff-table-t mutat, ahol az eltérő mezők kiemelve.
 */
export function ConflictDialog({
  open,
  onOpenChange,
  conflict,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflict: ConflictRecord | null
}) {
  const [isPending, startTransition] = useTransition()
  const [strategy, setStrategy] = useState<ResolutionStrategy | null>(null)

  if (!conflict) return null

  const { localPayload, serverPayload, table, rowId } = conflict

  // Eltérő mezők meghatározása
  const allKeys = new Set([
    ...Object.keys(localPayload),
    ...Object.keys(serverPayload),
  ])
  // Kliens-oldali meta mezőket kihagyjuk (_syncStatus stb.)
  const visibleKeys = Array.from(allKeys)
    .filter(k => !k.startsWith('_') && k !== 'updated_at' && k !== 'revision')
    .sort()

  const differingKeys = visibleKeys.filter(
    k =>
      JSON.stringify(localPayload[k]) !== JSON.stringify(serverPayload[k]),
  )

  function handleResolve(chosen: ResolutionStrategy) {
    setStrategy(chosen)
    startTransition(async () => {
      const result = await resolveConflict({
        table,
        rowId,
        strategy: chosen,
      })
      if ('error' in result) {
        toast.error(result.error)
        setStrategy(null)
        return
      }
      toast.success(
        chosen === 'keep_local'
          ? 'A saját változásod mentve.'
          : 'A szerver-oldali állapot elfogadva.',
      )
      onOpenChange(false)
      setStrategy(null)
    })
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissConflict(table, rowId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-red-500 to-orange-600 px-5 py-4 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <AlertTriangle className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <DialogTitle className="font-heading text-lg text-white">
              Szinkronizációs konfliktus
            </DialogTitle>
            <p className="text-xs text-white/80">
              Egy rekordot mindkét oldalon megváltoztattak. Melyik változatot tartsuk meg?
            </p>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
            <strong>Tábla:</strong> <code className="font-mono">{table}</code>
            &nbsp;•&nbsp;<strong>Sor azonosító:</strong> <code className="font-mono">{rowId}</code>
          </div>

          {differingKeys.length === 0 ? (
            <div className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
              Nincs tényleges eltérés. (Ez egy technikai konfliktus — csak a
              revision száma csúszott el.)
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">
                      Mező
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">
                      Enyém (lokális)
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">
                      Övé (szerver)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {differingKeys.map(key => (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {key}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-red-700">
                        {formatValue(localPayload[key])}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-700">
                        {formatValue(serverPayload[key])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-lg bg-slate-50/60 p-3 text-xs text-slate-600">
            <p className="font-semibold">ℹ️ Mi történik a választással?</p>
            <ul className="mt-1 space-y-0.5 pl-4">
              <li>
                <strong>Enyémet tartom</strong> — a saját változásod feltöltődik a szerverre
                (a szerver-oldali érték felülíródik).
              </li>
              <li>
                <strong>Övét tartom</strong> — a szerver-oldali érték marad, a saját változásod elveszik.
              </li>
              <li>
                <strong>Mégse</strong> — egyelőre eltesszük a konfliktust, később is visszatérhetsz rá.
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={handleDismiss}
            disabled={isPending}
          >
            <X className="mr-1.5 h-4 w-4" />
            Mégse
          </Button>
          <Button
            variant="outline"
            className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => handleResolve('keep_server')}
            disabled={isPending}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Övét tartom (szerver)
          </Button>
          <Button
            className="rounded-xl bg-red-600 hover:bg-red-700"
            onClick={() => handleResolve('keep_local')}
            disabled={isPending}
          >
            {isPending && strategy === 'keep_local' ? (
              <>Mentés...</>
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Enyémet tartom
                <ArrowRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (v === '') return '""'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60)
  const str = String(v)
  return str.length > 60 ? str.slice(0, 60) + '…' : str
}
