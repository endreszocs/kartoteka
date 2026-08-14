'use client'

/**
 * Anyagraktárkönyv — egy anyag részletes mozgáslistája folyamatos egyenleggel.
 *
 * Ez a hivatalos Word/Excel Anyagraktárkönyv (egy lap = egy anyag) digitális
 * megfelelője. A táblázat oszlopai pontosan követik a mintát:
 *   Sorszám | Kelte | Iratszám | Magyarázat | Mennyiség (bev/kia/egyenleg) | Érték (bev/kia/egyenleg)
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  BookOpen,
  Loader2,
  Plus,
  Printer,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  getMaterialBook,
  stornoMaterialMovement,
  type MaterialMovementWithBalance,
  type MaterialRow,
} from '@/app/(dashboard)/leltar/anyagraktar-actions'
import { MaterialMovementDialog } from '@/components/modals/material-movement-dialog'
import { buildAnyagraktarkonyvHtml } from '@/lib/finance/anyagraktar-print'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  materialId: string | null
  congregationName: string
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function fmtNum(n: number, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function MaterialBookDialog({ open, onOpenChange, materialId, congregationName }: Props) {
  const [material, setMaterial] = useState<MaterialRow | null>(null)
  const [movements, setMovements] = useState<MaterialMovementWithBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [movementDialog, setMovementDialog] = useState<{
    open: boolean
    tipus: 'bevetel' | 'kiadas'
  }>({ open: false, tipus: 'bevetel' })
  const [yearFilter, setYearFilter] = useState<'all' | number>('all')
  const [printing, setPrinting] = useState(false)

  const load = useCallback(async () => {
    if (!materialId) return
    setLoading(true)
    try {
      const res = await getMaterialBook(materialId, {
        yearFilter: yearFilter === 'all' ? null : yearFilter,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      setMaterial(res.material || null)
      setMovements(res.movements || [])
    } finally {
      setLoading(false)
    }
  }, [materialId, yearFilter])

  useEffect(() => {
    if (!open || !materialId) return
    void load()
  }, [open, materialId, load])

  // Évek a szűrőhöz
  const availableYears = Array.from(
    new Set(
      movements
        .map((m) => (m.datum ? new Date(m.datum).getFullYear() : null))
        .filter((y): y is number => y !== null && !Number.isNaN(y)),
    ),
  ).sort((a, b) => b - a)

  // Jelenlegi záró egyenleg (az utolsó mozgás)
  const lastMovement = movements[movements.length - 1]
  const keszletMennyiseg = lastMovement?.egyenleg_mennyiseg ?? 0
  const keszletErtek = lastMovement?.egyenleg_ertek ?? 0

  async function handleStorno(id: number) {
    const indok = window.prompt('A stornó indoklása (min. 5 karakter):', '')
    if (!indok) return
    if (indok.trim().length < 5) {
      toast.error('Az indoklás legalább 5 karakter legyen.')
      return
    }
    const res = await stornoMaterialMovement(id, indok.trim())
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Mozgás stornózva.')
    await load()
  }

  async function handlePrint(mode: 'preview' | 'pdf') {
    if (!material) return
    setPrinting(true)
    try {
      const html = buildAnyagraktarkonyvHtml({
        congregationName,
        materials: [{ material, movements }],
        year: yearFilter === 'all' ? null : yearFilter,
      })
      if (mode === 'pdf') {
        await printToPdf(html, `Anyagraktarkonyv_${material.nev.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, {
          orientation: 'landscape',
          margin: [10, 10],
          format: 'a4',
        })
        toast.success('Anyagraktárkönyv PDF letöltve.')
      } else {
        await printToBrowser(html)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'A nyomtatás nem sikerült.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92dvh] overflow-y-auto p-0">
        <div className="border-b border-zinc-100 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="font-heading text-lg">
                  Anyagraktárkönyv
                </DialogTitle>
                {material && (
                  <p className="text-sm text-slate-600 mt-0.5">
                    <strong>{material.nev}</strong>
                    {material.megnevezes && ` · ${material.megnevezes}`}
                    <span className="text-xs text-slate-400 ml-2">
                      Mértékegység: {material.mertekegyseg}
                      {material.egysegar != null && ` · Egységár: ${fmtNum(Number(material.egysegar))} RON`}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Év:</label>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
              >
                <option value="all">Minden év</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMovementDialog({ open: true, tipus: 'bevetel' })}
                className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <ArrowDownCircle className="mr-1 size-3.5" />
                + Bevétel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMovementDialog({ open: true, tipus: 'kiadas' })}
                className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50"
              >
                <ArrowUpCircle className="mr-1 size-3.5" />
                + Kiadás
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePrint('preview')}
                disabled={printing || loading || !material}
                className="rounded-xl"
              >
                <Printer className="mr-1 size-3.5" />
                Nyomtatás
              </Button>
              <Button
                size="sm"
                onClick={() => void handlePrint('pdf')}
                disabled={printing || loading || !material}
                className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              >
                PDF
              </Button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Záró egyenleg kártya */}
          {!loading && material && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="card-raised p-4 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border-emerald-100">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                  Jelenlegi készlet
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {fmtNum(keszletMennyiseg, 3).replace(/[,\.]000$/, '')} {material.mertekegyseg}
                </p>
              </div>
              <div className="card-raised p-4 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 border-blue-100">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                  Készletérték
                </p>
                <p className="mt-1 text-2xl font-bold text-blue-700">
                  {fmtNum(keszletErtek)} RON
                </p>
              </div>
            </div>
          )}

          {/* Mozgások táblázata */}
          <div className="card-raised overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-500">
                <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                Betöltés…
              </div>
            ) : movements.length === 0 ? (
              <div className="p-8 text-center">
                <BookOpen className="mx-auto size-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">
                  Még nincs rögzített mozgás ebben az anyaghoz.
                </p>
                <Button
                  size="sm"
                  onClick={() => setMovementDialog({ open: true, tipus: 'bevetel' })}
                  className="mt-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Plus className="mr-1 size-3.5" />
                  Első bevétel rögzítése
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-1 text-left align-bottom">Sorsz.</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-1 text-left align-bottom">Kelte</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-1 text-left align-bottom">Iratszám</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-1 text-left align-bottom">Magyarázat (Kitől/Kinek)</th>
                      <th colSpan={3} className="border border-slate-200 px-2 py-1 text-center">Mennyiség</th>
                      <th colSpan={3} className="border border-slate-200 px-2 py-1 text-center">Érték (RON)</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-1 align-bottom w-10"></th>
                    </tr>
                    <tr>
                      <th className="border border-slate-200 px-2 py-1 text-right text-[10px] bg-emerald-50/60">Bev.</th>
                      <th className="border border-slate-200 px-2 py-1 text-right text-[10px] bg-rose-50/60">Kia.</th>
                      <th className="border border-slate-200 px-2 py-1 text-right text-[10px] bg-blue-50/60">Egy.</th>
                      <th className="border border-slate-200 px-2 py-1 text-right text-[10px] bg-emerald-50/60">Bev.</th>
                      <th className="border border-slate-200 px-2 py-1 text-right text-[10px] bg-rose-50/60">Kia.</th>
                      <th className="border border-slate-200 px-2 py-1 text-right text-[10px] bg-blue-50/60">Egy.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((mv) => {
                      const isBev = mv.tipus === 'bevetel'
                      const rowClass = mv.stornozott
                        ? 'bg-red-50/40'
                        : 'even:bg-slate-50/30'
                      const textClass = mv.stornozott ? 'line-through text-slate-400' : ''
                      return (
                        <tr key={mv.id} className={rowClass}>
                          <td className={`border border-slate-200 px-2 py-1 text-xs ${textClass}`}>{mv.sorszam}</td>
                          <td className={`border border-slate-200 px-2 py-1 text-xs ${textClass}`}>{formatDateShort(mv.datum)}</td>
                          <td className={`border border-slate-200 px-2 py-1 text-xs ${textClass}`}>{mv.irat_szama || '—'}</td>
                          <td className={`border border-slate-200 px-2 py-1 text-xs ${textClass}`}>
                            {mv.magyarazat || '—'}
                            {mv.stornozott && mv.stornozott_indok && (
                              <p className="text-[10px] text-red-600/90 italic mt-0.5">
                                Stornó: {mv.stornozott_indok}
                              </p>
                            )}
                          </td>
                          <td className={`border border-slate-200 px-2 py-1 text-right font-mono text-xs ${textClass}`}>
                            {isBev && !mv.stornozott ? fmtNum(mv.mennyiseg, 3).replace(/[,\.]000$/, '') : ''}
                          </td>
                          <td className={`border border-slate-200 px-2 py-1 text-right font-mono text-xs ${textClass}`}>
                            {!isBev && !mv.stornozott ? fmtNum(mv.mennyiseg, 3).replace(/[,\.]000$/, '') : ''}
                          </td>
                          <td className={`border border-slate-200 px-2 py-1 text-right font-mono text-xs font-semibold ${mv.stornozott ? 'text-slate-400' : 'text-blue-800'}`}>
                            {fmtNum(mv.egyenleg_mennyiseg, 3).replace(/[,\.]000$/, '')}
                          </td>
                          <td className={`border border-slate-200 px-2 py-1 text-right font-mono text-xs ${textClass}`}>
                            {isBev && !mv.stornozott ? fmtNum(mv.ertek) : ''}
                          </td>
                          <td className={`border border-slate-200 px-2 py-1 text-right font-mono text-xs ${textClass}`}>
                            {!isBev && !mv.stornozott ? fmtNum(mv.ertek) : ''}
                          </td>
                          <td className={`border border-slate-200 px-2 py-1 text-right font-mono text-xs font-semibold ${mv.stornozott ? 'text-slate-400' : 'text-blue-800'}`}>
                            {fmtNum(mv.egyenleg_ertek)}
                          </td>
                          <td className="border border-slate-200 px-1 py-1 text-center">
                            {!mv.stornozott && (
                              <button
                                type="button"
                                title="Stornózás"
                                onClick={() => void handleStorno(mv.id)}
                                className="inline-flex items-center justify-center rounded-md p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Ban className="size-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-end">
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

      {/* Új mozgás dialog */}
      <MaterialMovementDialog
        open={movementDialog.open}
        onOpenChange={(next) => setMovementDialog((s) => ({ ...s, open: next }))}
        material={material}
        defaultTipus={movementDialog.tipus}
        onSaved={load}
      />
    </Dialog>
  )
}
