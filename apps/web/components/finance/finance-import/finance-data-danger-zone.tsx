'use client'

/**
 * Pénzügyi adatok végleges törlése — VESZÉLYZÓNA (teszt-reset).
 *
 * 2026-06-09 — #3 igény. A `wipe_finance_data` RPC-t hívja a `wipeFinanceDataAction`-ön
 * keresztül: CSAK a tranzakciós pénzügyi táblákat üríti (befizetes, kiadas, belsomozgas,
 * oblio_szamlak, chitanta_tombok, monetar, decont, dispozitie). A tagnyilvántartás,
 * kategóriák, bankszámla-konfig és az éves költségvetés ÉRINTETLEN marad.
 *
 * Kétszintű megerősítés:
 *   1. „Megértettem" pipa
 *   2. a gyülekezet pontos nevének begépelése
 */

import { useState, useTransition } from 'react'
import { AlertTriangle, Loader2, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { wipeFinanceDataAction } from '@/app/(dashboard)/admin/wipe-actions'

interface FinanceDataDangerZoneProps {
  congregationId: string
  congregationName: string
}

export function FinanceDataDangerZone({
  congregationId,
  congregationName,
}: FinanceDataDangerZoneProps) {
  const [expanded, setExpanded] = useState(true)
  const [understood, setUnderstood] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [isPending, startTransition] = useTransition()
  const [lastResult, setLastResult] = useState<string | null>(null)

  const canSubmit =
    understood && confirmName.trim() === congregationName.trim() && !isPending

  function handleWipe() {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await wipeFinanceDataAction(congregationId, confirmName.trim())
      if (!res.success) {
        toast.error(res.error || 'A törlés nem sikerült.')
        return
      }
      const total = res.rowsTotal ?? 0
      toast.success(`Pénzügyi adatok törölve — ${total} sor.`)
      setLastResult(
        `Törölve ${total} sor: ${(res.deletedTables ?? [])
          .filter((t) => t.rows > 0)
          .map((t) => `${t.table} (${t.rows})`)
          .join(', ') || '0 tábla'}`,
      )
      setUnderstood(false)
      setConfirmName('')
      setExpanded(false)
    })
  }

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-red-50/60 p-4 md:p-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
          <ShieldAlert className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base text-red-800">
            Veszélyzóna — pénzügyi adatok végleges törlése (teszt-reset)
          </h3>
          <p className="mt-0.5 text-xs text-red-700/80">
            A tagnyilvántartás, kategóriák, bankszámlák és a költségvetés megmaradnak.
            Csak a tranzakciós tételek (befizetés, kiadás, belső mozgás, nyugták, decont,
            dispoziție) törlődnek véglegesen.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-red-700">
          {expanded ? 'Bezár' : 'Megnyit'}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-red-200 pt-4">
          <div className="flex items-start gap-2 rounded-lg bg-white/70 p-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Ez a művelet <strong>visszafordíthatatlan</strong>. A gyülekezet összes
              befizetését, kiadását, belső mozgását, papír-nyugtáját, monetár-pillanatképét,
              decont/dispoziție tételét véglegesen törli. Csak fő rendszergazda végezheti.
            </span>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="size-4 accent-red-600"
            />
            Megértettem, hogy a pénzügyi tranzakciós adatok véglegesen törlődnek.
          </label>

          <div className="space-y-1">
            <label htmlFor="wipe-confirm" className="text-xs font-medium text-slate-600">
              Megerősítésként írd be a gyülekezet pontos nevét:{' '}
              <span className="font-semibold text-slate-800">{congregationName}</span>
            </label>
            <Input
              id="wipe-confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={congregationName}
              className="max-w-md border-red-200 focus-visible:ring-red-400"
              disabled={!understood || isPending}
            />
          </div>

          <Button
            type="button"
            onClick={handleWipe}
            disabled={!canSubmit}
            className="gap-2 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Pénzügyi adatok végleges törlése
          </Button>

          {lastResult && (
            <p className="rounded-lg bg-white/70 p-2 text-xs text-slate-600">{lastResult}</p>
          )}
        </div>
      )}
    </div>
  )
}
