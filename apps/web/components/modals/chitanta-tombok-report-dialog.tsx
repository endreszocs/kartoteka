'use client'

/**
 * Nyugtatömb éves kimutatás dialog.
 *
 * A Word-minta szerinti táblázat: sorszám, blokkszám, seria, nyomdai
 * kezdet+vég, dátumok, gyülekezeti saját szám tartomány, felhasznált
 * darabszám. Nyomtatható (window.print()).
 */

import { useEffect, useState } from 'react'
import { FileText, Loader2, Printer } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  getChitantaTombokReport,
  type ChitantaTombReport,
} from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName: string
  /** Kezdő év — módosítható a dialogon belül. */
  initialYear?: number
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function ChitantaTombokReportDialog({
  open,
  onOpenChange,
  congregationName,
  initialYear,
}: Props) {
  const thisYear = initialYear ?? new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ChitantaTombReport[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setYear(thisYear)
    })
    return () => { cancelled = true }
  }, [open, thisYear])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      void getChitantaTombokReport(year).then((res) => {
        if (cancelled) return
        setLoading(false)
        if (res.error) {
          setError(res.error)
          setRows([])
        } else {
          setRows(res.data || [])
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, year])

  function handlePrint() {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto p-0">
        <style jsx global>{`
          @media print {
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
            body * {
              visibility: hidden;
            }
            .chitanta-report-printable,
            .chitanta-report-printable * {
              visibility: visible;
            }
            .chitanta-report-printable {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
            }
            .chitanta-report-no-print {
              display: none !important;
            }
          }
        `}</style>

        <div className="border-b border-zinc-100 px-6 pt-6 pb-4 chitanta-report-no-print">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">
                  Nyugtatömb kimutatás — {year}
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {congregationName}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-600">Év:</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 10 }, (_, i) => thisYear - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handlePrint}
              disabled={loading || rows.length === 0}
              className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
            >
              <Printer className="mr-1.5 size-4" />
              Nyomtatás
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 chitanta-report-printable">
          {/* Nyomtatási fejléc — csak nyomtatáskor látszik */}
          <div className="hidden print:block mb-4">
            <h2 className="text-xl font-bold text-center">
              Nyugtatömb kimutatás — {year}
            </h2>
            <p className="text-center text-sm text-slate-700">{congregationName}</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="mr-2 size-4 animate-spin" /> Betöltés…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-4 text-sm text-amber-900 text-center">
              Nincs olyan tömb, amelyet {year}-ban használatba vettek.
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="border border-slate-300 px-2 py-1 text-left">Sorsz.</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Blokkszám</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Seria</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Nyomdai kezdet</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Nyomdai vég</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Első dátum</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Utolsó dátum</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Saját kezdet</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Saját vég</th>
                    <th className="border border-slate-300 px-2 py-1 text-right">Felhasznált</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Állapot</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="even:bg-slate-50">
                      <td className="border border-slate-300 px-2 py-1">{r.sorszam}</td>
                      <td className="border border-slate-300 px-2 py-1">{r.block_nr || '—'}</td>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{r.seria}</td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                        {r.nyomdai_kezdet}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                        {r.nyomdai_veg}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        {formatDate(r.datum_kezdet)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        {formatDate(r.datum_veg)}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                        {r.sajat_kezdet ?? '—'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                        {r.sajat_veg ?? '—'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right">
                        {r.felhasznalt_darabszam} / {r.darabszam_ossz}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">
                        {r.aktiv ? (
                          <span className="text-emerald-700 font-medium">Aktív</span>
                        ) : (
                          <span className="text-slate-500">Lezárt</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-end gap-2 chitanta-report-no-print">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Bezár
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
