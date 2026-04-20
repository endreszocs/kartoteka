'use client'

/**
 * Nyugtatömb panel a Kassza fülön.
 *
 * Funkciók:
 *  - Aktív tömb élő státusza (maradék darabszám, progress bar)
 *  - Összes tömb listája (szortírozva, állapot-badge-ekkel)
 *  - "+ Új tömb" gomb → ChitantaTombWizardDialog
 *  - "Éves kimutatás" gomb → ChitantaTombokReportDialog
 *  - Tömb lezárása (manuálisan)
 *
 * A panel maga frissülni képes: a wizard és a lezárás után újra lekéri a
 * listát és az aktív státuszt.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, BookOpen, CheckCircle2, FileText, Loader2, Plus, ReceiptText, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  listChitantaTombok,
  getActiveChitantaTombStatus,
  closeChitantaTomb,
  type ChitantaTomb,
} from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'
import { ChitantaTombWizardDialog } from '@/components/modals/chitanta-tomb-wizard-dialog'
import { ChitantaTombokReportDialog } from '@/components/modals/chitanta-tombok-report-dialog'

type ActiveStatus = {
  id: string
  seria: string
  szam_kezdet: number
  szam_veg: number
  felhasznalt_darabszam: number
  darabszam_ossz: number
  maradek: number
  kovetkezo_szam: number
}

type Props = {
  congregationName: string
  /** Refresh trigger — amikor chitanta kiállítás történik máshol, inkrementálva frissül. */
  refreshKey?: number
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU', { month: 'short', day: '2-digit' })
}

export function ChitantaTombokPanel({ congregationName, refreshKey }: Props) {
  const [loading, setLoading] = useState(true)
  const [tombok, setTombok] = useState<ChitantaTomb[]>([])
  const [active, setActive] = useState<ActiveStatus | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [listRes, activeRes] = await Promise.all([
      listChitantaTombok(),
      getActiveChitantaTombStatus(),
    ])
    setLoading(false)
    if (listRes.data) setTombok(listRes.data)
    if (activeRes.active !== undefined) setActive(activeRes.active)
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => { cancelled = true }
  }, [load, refreshKey])

  async function handleClose(id: string, label: string) {
    if (!confirm(`Biztos lezárod a(z) ${label} tömböt? Ez a tömb többé nem lesz aktív.`)) {
      return
    }
    setClosingId(id)
    const res = await closeChitantaTomb(id)
    setClosingId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(`${label} tömb lezárva.`)
    await load()
  }

  const activePercentage =
    active && active.darabszam_ossz > 0
      ? Math.round((active.felhasznalt_darabszam / active.darabszam_ossz) * 100)
      : 0

  const hasNoActive = !loading && !active
  const runningLow = active && active.maradek > 0 && active.maradek <= 10

  return (
    <div className="space-y-4">
      {/* ─── Fejléc + CTA-k ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
            <ReceiptText className="size-5 text-white" />
          </div>
          <div>
            <h3 className="font-heading text-lg text-slate-800">Nyugtatömbök</h3>
            <p className="text-xs text-slate-500">
              Nyomdai tömbök nyilvántartása, élő követés, éves kimutatás.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-cyan-200 text-cyan-700 hover:bg-cyan-50"
            onClick={() => setReportOpen(true)}
          >
            <FileText className="mr-1 size-3.5" />
            Éves kimutatás
          </Button>
          <Button
            size="sm"
            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setWizardOpen(true)}
          >
            <Plus className="mr-1 size-3.5" />
            Új tömb
          </Button>
        </div>
      </div>

      {/* ─── Aktív tömb élő státusz ─── */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-center text-slate-500 text-sm">
          <Loader2 className="mr-2 size-4 animate-spin" /> Betöltés…
        </div>
      ) : hasNoActive ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 shrink-0 text-amber-700" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-800">
              Nincs aktív nyugtatömb
            </div>
            <p className="text-xs text-amber-700/90 mt-0.5">
              Új nyugta kiállításához először rögzíts be egy tömböt. A készpénzes
              nyugtázás addig nem indítható el automatikusan.
            </p>
          </div>
          <Button
            size="sm"
            className="rounded-xl bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => setWizardOpen(true)}
          >
            <Plus className="mr-1 size-3.5" />
            Tömb rögzítése
          </Button>
        </div>
      ) : active ? (
        <div
          className={`rounded-2xl border p-4 ${
            runningLow
              ? 'border-amber-300 bg-amber-50/60'
              : 'border-emerald-200 bg-emerald-50/50'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen
                  className={`size-4 ${
                    runningLow ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Aktív tömb
                </span>
              </div>
              <div className="mt-1 font-heading text-lg text-slate-800">
                {active.seria} · {active.szam_kezdet.toString().padStart(7, '0')} –{' '}
                {active.szam_veg.toString().padStart(7, '0')}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Következő nyugta nyomdai száma:{' '}
                <strong className="font-mono">
                  {active.kovetkezo_szam.toString().padStart(7, '0')}
                </strong>
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-slate-800">
                {active.maradek}
              </div>
              <p className="text-xs text-slate-600">maradt / {active.darabszam_ossz}</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all ${
                runningLow ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${activePercentage}%` }}
            />
          </div>
          {runningLow && (
            <p className="mt-2 text-xs text-amber-800 font-medium">
              🔔 Hamarosan elfogy a tömb — érdemes már készenlétben tartani egy
              újat.
            </p>
          )}
        </div>
      ) : null}

      {/* ─── Összes tömb listája ─── */}
      {!loading && tombok.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2 bg-slate-50/60">
            <h4 className="text-sm font-semibold text-slate-700">
              Összes tömb ({tombok.length})
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Seria / Blokk</th>
                  <th className="px-3 py-2 text-right">Nyomdai tartomány</th>
                  <th className="px-3 py-2 text-right">Felh. / Össz</th>
                  <th className="px-3 py-2 text-left">Első / Utolsó</th>
                  <th className="px-3 py-2 text-left">Állapot</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tombok.map((t) => {
                  const pct = t.darabszam_ossz
                    ? Math.round((t.felhasznalt_darabszam / t.darabszam_ossz) * 100)
                    : 0
                  return (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-medium">{t.seria}</div>
                        {t.block_nr && (
                          <div className="text-xs text-slate-500">
                            Blokk: {t.block_nr}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {t.szam_kezdet.toString().padStart(7, '0')} –{' '}
                        {t.szam_veg.toString().padStart(7, '0')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div>
                          {t.felhasznalt_darabszam} / {t.darabszam_ossz}
                        </div>
                        <div className="mt-0.5 h-1 w-16 ml-auto rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full ${
                              t.aktiv ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        <div>{formatDateShort(t.elso_hasznalat_datum)}</div>
                        <div>{formatDateShort(t.utolso_hasznalat_datum)}</div>
                      </td>
                      <td className="px-3 py-2">
                        {t.aktiv ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            <CheckCircle2 className="size-3" />
                            Aktív
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            <XCircle className="size-3" />
                            Lezárt
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.aktiv && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700"
                            disabled={closingId === t.id}
                            onClick={() =>
                              handleClose(
                                t.id,
                                `${t.seria} ${t.szam_kezdet}–${t.szam_veg}`,
                              )
                            }
                          >
                            {closingId === t.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              'Lezárás'
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Dialog-ok ─── */}
      <ChitantaTombWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        defaultSeria={active?.seria}
        onCreated={load}
      />
      <ChitantaTombokReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        congregationName={congregationName}
      />
    </div>
  )
}
