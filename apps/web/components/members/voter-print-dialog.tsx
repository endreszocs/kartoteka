'use client'

/**
 * Választók névjegyzéke — Nyomtatási központ.
 *
 * A pénzügyi nyomtatási központ mintáját követi (finance-print-dialog.tsx):
 *   - Bal oldalon: sz≠rési opciók + akciógombok
 *   - Jobb oldalon: élő iframe előnézet
 *
 * 4 szűrés (jelölőnégyzetek):
 *   1. Előző évre teljesen fizettek  (paidPrevYearSum >= expectedPrevYear)
 *   2. Előző évre részlegesen fizettek (0 < paidPrevYearSum < expectedPrevYear)
 *   3. Erre az évre teljesen fizettek (paidCurrentYearSum >= expectedCurrentYear)
 *   4. Erre az évre részlegesen fizettek (0 < paidCurrentYearSum < expectedCurrentYear)
 *
 * Egy személy akkor kerül a névjegyzékbe, ha LEGALÁBB EGY bekapcsolt kritériumnak megfelel.
 */

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { buildVoterListReport } from '@/lib/members/voter-reporting'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { getVoterPrintContext, type VoterRow } from '@/app/(dashboard)/tagnyilvantartas/voter-actions'
import { toast } from 'sonner'

interface VoterPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  voters: VoterRow[]
  currentYear: number
}

export function VoterPrintDialog({
  open,
  onOpenChange,
  voters,
  currentYear,
}: VoterPrintDialogProps) {
  const [prevFull, setPrevFull] = useState(true)
  const [prevPartial, setPrevPartial] = useState(false)
  const [currFull, setCurrFull] = useState(true)
  const [currPartial, setCurrPartial] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [sendingToPrinter, setSendingToPrinter] = useState(false)
  const [congregationName, setCongregationName] = useState('Gyülekezet')
  const [address, setAddress] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [loadingCtx, setLoadingCtx] = useState(false)

  // Első megnyitáskor — gyülekezet kontextus (fejléchez)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingCtx(true)
    void getVoterPrintContext().then(ctx => {
      if (cancelled) return
      setCongregationName(ctx.congregationName)
      setAddress(ctx.address)
      setPhone(ctx.phone)
      setLoadingCtx(false)
    })
    return () => { cancelled = true }
  }, [open])

  const filteredVoters = useMemo(() => {
    return voters.filter(v => {
      const prevFullMatch = prevFull && v.expectedPrevYear > 0 && v.paidPrevYearSum >= v.expectedPrevYear
      const prevPartialMatch = prevPartial && v.paidPrevYearSum > 0 && (v.expectedPrevYear === 0 || v.paidPrevYearSum < v.expectedPrevYear)
      const currFullMatch = currFull && v.expectedCurrentYear > 0 && v.paidCurrentYearSum >= v.expectedCurrentYear
      const currPartialMatch = currPartial && v.paidCurrentYearSum > 0 && (v.expectedCurrentYear === 0 || v.paidCurrentYearSum < v.expectedCurrentYear)
      return prevFullMatch || prevPartialMatch || currFullMatch || currPartialMatch
    })
  }, [voters, prevFull, prevPartial, currFull, currPartial])

  const report = useMemo(() => {
    const voterData = filteredVoters.map(v => ({
      name: `${v.csaladnev} ${v.nev.replace(v.csaladnev, '').trim()}`.trim() || v.nev,
      occupation: v.foglalkozas || null,
      address: v.lakcim || null,
      settlement: v.lakhely || null,
    }))
    return buildVoterListReport({
      voters: voterData,
      year: currentYear,
      congregationName,
      address,
      phone,
    })
  }, [filteredVoters, currentYear, congregationName, address, phone])

  async function handlePdf() {
    setPrinting(true)
    try {
      await printToPdf(report.html, report.filename, {
        orientation: report.orientation,
        margin: [8, 8],
        format: 'a4',
      })
      toast.success(`${report.title} PDF elkészült.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A PDF mentése nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  async function handleDirectPrint() {
    setSendingToPrinter(true)
    try {
      await printToBrowser(report.html)
      toast.success('Nyomtatási előnézet megnyílt.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A nyomtatás nem sikerült.')
    } finally {
      setSendingToPrinter(false)
    }
  }

  const anyFilter = prevFull || prevPartial || currFull || currPartial

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Választók névjegyzéke — Nyomtatási központ</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 pb-2 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* ── Bal oldal ──────────────────────────── */}
          <div className="space-y-4">
            {/* Évszám + szűrő checkbox-ok */}
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/70">Hivatalos nyomtatvány</p>
                <h3 className="font-heading text-xl text-slate-800">Választók névjegyzéke</h3>
                <p className="text-xs text-slate-500 mt-1">
                  A Kánon I. Rész 3. Fejezete 37 §§. szerinti névjegyzék.
                </p>
              </div>
            </div>

            {/* Szűrők */}
            <div className="card-raised space-y-3 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Kiket számoljon bele?</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Egy személy szerepel a névjegyzékben, ha legalább egy bekapcsolt feltételnek megfelel.
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={prevFull}
                    onChange={e => setPrevFull(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Előző évre ({currentYear - 1}) <strong>teljesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">Befizetés ≥ éves járulék</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={prevPartial}
                    onChange={e => setPrevPartial(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Előző évre ({currentYear - 1}) <strong>részlegesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">0 &lt; befizetés &lt; éves járulék</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={currFull}
                    onChange={e => setCurrFull(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Erre az évre ({currentYear}) <strong>teljesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">Befizetés ≥ éves járulék</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition">
                  <input
                    type="checkbox"
                    checked={currPartial}
                    onChange={e => setCurrPartial(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Erre az évre ({currentYear}) <strong>részlegesen</strong> kifizették
                    </div>
                    <div className="text-[11px] text-slate-400">0 &lt; befizetés &lt; éves járulék</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Összegzés */}
            <div className="card-raised p-4 space-y-2">
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <div><span className="font-semibold text-slate-800">Év:</span> {currentYear} – {currentYear + 1}</div>
                <div><span className="font-semibold text-slate-800">Beleszámítottak száma:</span> {filteredVoters.length}</div>
                <div><span className="font-semibold text-slate-800">Tájolás:</span> A4 álló</div>
                {loadingCtx && <div className="text-[11px] text-blue-600 mt-1">Gyülekezeti adatok betöltése...</div>}
              </div>

              {!anyFilter && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800">
                  Legalább egy szűrőt be kell kapcsolni a névjegyzékhez.
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                  Bezárás
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void handleDirectPrint()}
                  disabled={sendingToPrinter || !anyFilter || filteredVoters.length === 0}
                >
                  {sendingToPrinter ? 'Nyomtatás...' : 'Direkt nyomtatás'}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => void handlePdf()}
                  disabled={printing || !anyFilter || filteredVoters.length === 0}
                >
                  {printing ? 'PDF készül...' : 'PDF-be mentés'}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Jobb oldal: előnézet ──────────────── */}
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100/80 p-3 shadow-inner">
            <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <iframe
                title={report.title}
                srcDoc={report.html}
                className="h-[78vh] min-h-[760px] w-full rounded-[22px] bg-white"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
