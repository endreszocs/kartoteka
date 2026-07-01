'use client'

/**
 * Dispoziție de încasare — hiányzó nyugták utólagos BEVÉTELEZÉSE (wizard). (Endre, 2026-07-02.)
 *
 * A Nyugtafigyelő „hiányzó nyugták" gombja nyitja. Minden hiányzó Irat sz. egy KÜLÖN sor →
 * minden sor egy Dispoziție de încasare → egy `befizetes` BEVÉTEL a KASSZÁBA (bankszamla_id NULL),
 * a nyugta GYÜLEKEZETI sorszámával (Irat sz.), így a figyelő „hiányzó" listájáról lekerül.
 * A tétel a kasszába ÉS a számadásba is bekerül.
 *
 * 3 lépés: 1) tételek (Irat sz. + összeg + befizető) → 2) könyvelés (dátum + bevétel-kategória) →
 * 3) ellenőrzés + mentés.
 */

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, ArrowLeft, Check, Coins, Plus, Trash2, Loader2 } from 'lucide-react'
import { saveDispozitie } from '@/app/(dashboard)/penzugy/dispozitie-actions'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  missingNumbers: number[]
  incomeCategories: Array<{ id: number; nev: string; kod?: string }>
  defaultDate?: string
  onDone?: () => void
}

type Row = { id: string; iratsz: string; name: string; amount: string }

const todayIso = () => new Date().toISOString().slice(0, 10)
const uid = () => `${Math.random().toString(36).slice(2)}-${Date.now()}`
const ron = (n: number) => `${(Number(n) || 0).toLocaleString('hu-HU')} RON`

const STEPS = ['Tételek', 'Könyvelés', 'Ellenőrzés'] as const

export function DispozitieIncasareWizard({ open, onOpenChange, missingNumbers, incomeCategories, defaultDate, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [date, setDate] = useState(defaultDate || todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [cel, setCel] = useState('Hiányzó nyugta utólagos bevételezése')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  // Megnyitáskor friss állapot + a hiányzó számokból egy-egy sor.
  useEffect(() => {
    if (!open) return
    setStep(0)
    setDate(defaultDate || todayIso())
    setCategoryId('')
    setCel('Hiányzó nyugta utólagos bevételezése')
    setBusy(false)
    setRows(
      (missingNumbers.length ? missingNumbers : [0]).map((n) => ({ id: uid(), iratsz: n ? String(n) : '', name: '', amount: '' })),
    )
  }, [open, missingNumbers, defaultDate])

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows])
  const validRows = useMemo(() => rows.filter((r) => r.iratsz.trim() && Number(r.amount) > 0), [rows])

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((cur) => [...cur, { id: uid(), iratsz: '', name: '', amount: '' }]) }
  function removeRow(id: string) { setRows((cur) => (cur.length === 1 ? cur : cur.filter((r) => r.id !== id))) }

  const step1Ok = validRows.length > 0 && rows.every((r) => !r.iratsz.trim() || Number(r.amount) > 0)
  const step2Ok = Boolean(categoryId) && validRows.every((r) => r.name.trim())

  async function handleSave() {
    if (!categoryId) return
    setBusy(true)
    let ok = 0
    const failed: string[] = []
    try {
      for (const r of validRows) {
        const res = await saveDispozitie({
          tipus: 'incasare',
          date,
          name: r.name.trim(),
          tisztseg: '',
          amount: Number(r.amount),
          cel: cel.trim() || 'Hiányzó nyugta utólagos bevételezése',
          categoryId: Number(categoryId),
          iratsz: r.iratsz.trim(),
        })
        if ('error' in res) failed.push(`Irat sz. ${r.iratsz}: ${res.error}`)
        else ok++
      }
    } finally {
      setBusy(false)
    }
    if (ok > 0) toast.success(`${ok} nyugta bevételként a kasszába könyvelve.`)
    if (failed.length) toast.error(`${failed.length} tétel nem sikerült — ${failed[0]}`)
    if (failed.length === 0) {
      onDone?.()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:max-w-3xl">
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Dispoziție de încasare — hiányzó nyugták bevételezése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-500">Minden hiányzó nyugta egy külön bevételi tétel a kasszába (és a számadásba).</p>
              </div>
            </div>
          </DialogHeader>
          {/* Lépés-indikátor */}
          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300' : 'bg-slate-100 text-slate-400'}`}>
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={`text-xs font-medium ${i === step ? 'text-emerald-800' : 'text-slate-400'}`}>{label}</span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          {/* 1. lépés — tételek */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Add meg minden hiányzó nyugta összegét és befizetőjét. Minden sor egy külön bevétel.</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Irat sz.</th>
                      <th className="px-3 py-2">Befizető / forrás</th>
                      <th className="px-3 py-2 text-right">Összeg (RON)</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-1.5 w-24">
                          <Input value={r.iratsz} onChange={(e) => patchRow(r.id, { iratsz: e.target.value })} className="h-8 tabular-nums" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input value={r.name} onChange={(e) => patchRow(r.id, { name: e.target.value })} placeholder="név" className="h-8" />
                        </td>
                        <td className="px-3 py-1.5 w-32">
                          <Input type="number" min={0} inputMode="numeric" value={r.amount} onChange={(e) => patchRow(r.id, { amount: e.target.value })} className="h-8 text-right tabular-nums" />
                        </td>
                        <td className="px-2 py-1.5 w-10">
                          <button type="button" onClick={() => removeRow(r.id)} className="text-slate-300 transition hover:text-rose-500" title="Sor törlése">
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={addRow}><Plus className="mr-1 size-4" /> Új sor</Button>
                <p className="text-sm text-slate-600">Összesen: <strong className="tabular-nums text-emerald-700">{ron(total)}</strong> · {validRows.length} tétel</p>
              </div>
            </div>
          )}

          {/* 2. lépés — könyvelés */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-600">Könyvelési dátum
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
                </label>
                <label className="text-sm text-slate-600">Bevétel-kategória (jogcím) *
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/25"
                  >
                    <option value="">— válassz —</option>
                    {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.kod ? `${c.kod} · ${c.nev}` : c.nev}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm text-slate-600">Közös jogcím (Scopul) — a bizonylatokon
                <Input value={cel} onChange={(e) => setCel(e.target.value)} className="mt-1" />
              </label>
              {!step2Ok && (
                <p className="text-xs text-amber-700">Válassz kategóriát, és minden tételhez adj meg befizetőt (az 1. lépésben).</p>
              )}
            </div>
          )}

          {/* 3. lépés — ellenőrzés + mentés */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
                <p className="font-semibold text-emerald-900">{validRows.length} nyugta bevételezése · összesen {ron(total)}</p>
                <p className="mt-0.5 text-emerald-800/80">Dátum: {date} · Kategória: {incomeCategories.find((c) => c.id === categoryId)?.nev || '—'}</p>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                {validRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-slate-600">Irat sz. <strong className="tabular-nums">{r.iratsz}</strong> — {r.name || <span className="italic text-slate-400">nincs befizető</span>}</span>
                    <span className="tabular-nums font-medium text-slate-800">{ron(Number(r.amount))}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Mentéskor minden tétel Dispoziție de încasare bizonylatként a kasszába (és a számadásba) könyvelődik, a nyugta saját Irat sz.-ával.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <Button variant="ghost" onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))} disabled={busy}>
            {step === 0 ? 'Mégse' : (<><ArrowLeft className="mr-1 size-4" /> Vissza</>)}
          </Button>
          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 0 && !step1Ok) || (step === 1 && !step2Ok)}
            >
              Tovább <ArrowRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={busy || validRows.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> Könyvelés…</> : <><Check className="mr-1.5 size-4" /> Mentés és könyvelés</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
