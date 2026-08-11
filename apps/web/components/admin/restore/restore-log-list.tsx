'use client'

/**
 * VISSZAÁLLÍTÁS-NAPLÓ. 2026-08-11.
 *
 * MINDEN kísérlet látszik: a sikeres, a sikertelen, a puszta száraz futás és a
 * hibás jelszó-próbálkozás is. A napló CSAK HOZZÁFŰZHETŐ — nincs rajta UPDATE
 * és DELETE policy, tehát a cselekvő nem tudja eltüntetni a nyomát.
 *
 * ⚠️ A LEZÁRATLAN („indult") SOR MAGA A RIASZTÁS: azt jelenti, hogy egy
 *    visszaállítás elkezdődött, de sosem jelentett vissza. Ezért kap külön,
 *    figyelmeztető kiemelést a listában.
 */

import { useCallback, useEffect, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminTable } from '@/components/admin/_shared/admin-table'
import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'

import { listRestoreLogAction } from '@/app/(dashboard)/admin/biztonsagi-mentes/restore-actions'
import type { RestoreLogEntry } from '@/app/(dashboard)/admin/biztonsagi-mentes/restore-shared'

const TIPUS_FELIRAT: Record<string, string> = {
  preview: 'száraz futás',
  restore: 'visszaállítás',
  download: 'letöltés',
  passphrase_fail: 'hibás jelszó',
}

function datumIdo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function allapot(r: RestoreLogEntry): { intent: StatusIntent; felirat: string } {
  if (r.outcome === 'ok') return { intent: 'success', felirat: 'sikeres' }
  if (r.outcome === 'failed') return { intent: 'danger', felirat: 'sikertelen' }
  if (r.outcome === 'rolled_back') return { intent: 'warning', felirat: 'visszagörgetve' }
  // 'indult' + nincs finished_at → soha nem jelentett vissza.
  if (!r.finishedAt) return { intent: 'danger', felirat: 'befejezetlen' }
  return { intent: 'neutral', felirat: r.outcome }
}

function valtozas(r: RestoreLogEntry): string {
  if (!r.diffSummary) return '—'
  const { beszuras, modositas, torles } = r.diffSummary
  return `+${beszuras.toLocaleString('hu-HU')} · ~${modositas.toLocaleString('hu-HU')} · −${torles.toLocaleString('hu-HU')}`
}

export function RestoreLogList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<RestoreLogEntry[]>([])
  const [betolt, setBetolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)

  const load = useCallback(() => {
    setBetolt(true)
    setHiba(null)
    void listRestoreLogAction()
      .then((res) => {
        if (res.success) setRows(res.rows)
        else setHiba(res.error ?? 'A napló nem olvasható.')
      })
      .catch((e: unknown) => setHiba(e instanceof Error ? e.message : 'A napló nem olvasható.'))
      .finally(() => setBetolt(false))
  }, [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => load())
    return () => cancelAnimationFrame(raf)
  }, [load, refreshKey])

  const befejezetlen = rows.filter((r) => r.tipus === 'restore' && !r.finishedAt)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-heading text-base text-foreground">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Visszaállítás-napló
        </h3>
        <Button variant="outline" onClick={load} className="h-11 gap-2" disabled={betolt}>
          <RefreshCw className="size-4" aria-hidden />
          Frissítés
        </Button>
      </div>

      {befejezetlen.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <strong>{befejezetlen.length} befejezetlen visszaállítás</strong> van a naplóban: ezek
          elkezdődtek, de sosem jelentettek vissza. Nézd meg, mi történt az adatokkal — ez a sor
          maga a riasztás.
        </div>
      )}

      {hiba && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {hiba}
        </div>
      )}

      <AdminTable<RestoreLogEntry>
        columns={[
          { key: 'ido', label: 'Időpont' },
          { key: 'tipus', label: 'Művelet' },
          { key: 'gyulekezet', label: 'Gyülekezet', hideBelow: 'sm' },
          { key: 'mentes', label: 'Mentés napja', hideBelow: 'md' },
          { key: 'valtozas', label: '+ / ~ / −', align: 'right', className: 'tabular-nums' },
          { key: 'allapot', label: 'Állapot', align: 'right' },
        ]}
        rows={rows}
        rowKey={(r) => String(r.id)}
        loading={betolt}
        skeletonRows={3}
        minWidthClass="min-w-[720px]"
        renderCell={(r, key) => {
          if (key === 'ido') return datumIdo(r.startedAt)
          if (key === 'tipus') return TIPUS_FELIRAT[r.tipus] ?? r.tipus
          if (key === 'gyulekezet')
            return (
              <span className="font-medium text-foreground">
                {r.congregationNev || '(ismeretlen)'}
              </span>
            )
          if (key === 'mentes') return r.backupRunDate ?? '—'
          if (key === 'valtozas') return valtozas(r)
          if (key === 'allapot') {
            const a = allapot(r)
            return <StatusBadge intent={a.intent}>{a.felirat}</StatusBadge>
          }
          return null
        }}
        renderMobileCard={(r) => {
          const a = allapot(r)
          return (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-foreground">
                  {r.congregationNev || '(ismeretlen)'}
                </p>
                <StatusBadge intent={a.intent}>{a.felirat}</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {datumIdo(r.startedAt)} · {TIPUS_FELIRAT[r.tipus] ?? r.tipus}
                {r.backupRunDate ? ` · mentés: ${r.backupRunDate}` : ''}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{valtozas(r)}</p>
              {r.actorEmail && (
                <p className="mt-0.5 break-all text-xs text-muted-foreground">{r.actorEmail}</p>
              )}
              {r.indoklas && (
                <p className="mt-1 text-xs italic text-muted-foreground">„{r.indoklas}"</p>
              )}
              {r.errorMessage && (
                <p className="mt-1 break-words text-xs text-destructive">{r.errorMessage}</p>
              )}
            </div>
          )
        }}
        empty={
          <AdminEmptyState
            icon={History}
            title="Még nem történt visszaállítás"
            hint="Itt jelenik meg minden kísérlet — a sikeres, a sikertelen és a puszta előnézet is."
            className="py-6"
          />
        }
      />
    </div>
  )
}
