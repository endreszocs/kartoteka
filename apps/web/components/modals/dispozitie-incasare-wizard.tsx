'use client'

/**
 * Hiányzó nyugták UTÓLAGOS BEVÉTELI ELSZÁMOLÁSA (wizard). (Endre, 2026-07-02.)
 *
 * A Nyugtafigyelő „hiányzó nyugták" gombja nyitja. Könyvelői háttér (OMF 2634/2015):
 * a már KIÁLLÍTOTT Chitanță maga a bizonylat → nem külön Dispoziție de încasare-t készítünk
 * (az csak akkor, ha NINCS más bizonylat), hanem minden nyugtát a saját Irat sz.-ával
 * BEVÉTELKÉNT a kasszába (Registrul de casă) könyvelünk, SZEMÉLYHEZ kötve (adomány/
 * egyházfenntartás a taghoz számít) és „utólag elszámolt" megjegyzéssel (látható nyom).
 *
 * Minden hiányzó Irat sz. egy KÜLÖN sor → egy `befizetes` BEVÉTEL a kasszába (bankszamla_id NULL),
 * irattipus='Chitanță', nyugta = a gyülekezeti Irat sz. (így a figyelő „hiányzó" listájáról lekerül),
 * id_szemely = a párosított tag. A `saveIncomeBatch` egy hívásban rögzíti.
 *
 * 3 lépés: 1) tételek (Irat sz. + Kerületi sz. opc. + befizető-kereső + összeg) →
 *          2) könyvelés (dátum + bevétel-jogcím + megjegyzés) → 3) ellenőrzés + mentés.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, ArrowLeft, Check, Coins, Plus, Trash2, Loader2, Search, UserCheck, Info } from 'lucide-react'
import { saveIncomeBatch, searchMembersForFinance } from '@/app/(dashboard)/penzugy/actions'
import type { IncomeBatchRowInput } from '@/lib/validations/finance'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  missingNumbers: number[]
  incomeCategories: Array<{ id: number; nev: string; kod?: string }>
  defaultDate?: string
  onDone?: () => void
}

type Row = {
  id: string
  iratsz: string        // Irat sz. (gyülekezeti) → befizetes.nyugta
  keruleti: string      // Kerületi sz. (opcionális) → befizetes.iratszam
  name: string          // befizető neve (szabad szöveg vagy párosított tag neve)
  personId: number | null // párosított tag → id_szemely
  amount: string
}

type SearchHit = {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  c_szam: string | null
  adrlocality?: { name?: string } | Array<{ name?: string }> | null
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const uid = () => `${Math.random().toString(36).slice(2)}-${Date.now()}`
const ron = (n: number) => `${(Number(n) || 0).toLocaleString('hu-HU')} RON`

function hitName(h: SearchHit) { return `${h.csaladnev || ''} ${h.k_nev || ''}`.trim() }
function hitBirthYear(h: SearchHit): string | null {
  const m = String(h.sz_datum || '').match(/(\d{4})/)
  return m ? m[1] : null
}
function hitLocality(h: SearchHit): string | null {
  const a = h.adrlocality
  const name = Array.isArray(a) ? a[0]?.name : a?.name
  return name || null
}

const STEPS = ['Tételek', 'Könyvelés', 'Ellenőrzés'] as const

// ── Befizető-kereső cella (tag → id_szemely; szabad szöveg is megengedett) ──────────────
function PayerSearchCell({
  value, personId, onType, onPick,
}: {
  value: string
  personId: number | null
  onType: (t: string) => void
  onPick: (p: { id: number; name: string }) => void
}) {
  const [results, setResults] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function handleType(t: string) {
    onType(t)
    if (timer.current) clearTimeout(timer.current)
    if (t.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const rows = (await searchMembersForFinance(t)) as unknown as SearchHit[]
        setResults(rows || [])
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  return (
    <div className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-300">
          {personId != null ? <UserCheck className="size-4 text-emerald-500" /> : <Search className="size-4" />}
        </span>
        <Input
          value={value}
          onChange={(e) => handleType(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Név — itt keres a tagok között"
          className={`h-8 pl-8 ${personId != null ? 'border-emerald-300 bg-emerald-50/40' : ''}`}
        />
        {loading && <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-slate-300" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full min-w-[16rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((h) => {
            const by = hitBirthYear(h)
            const loc = hitLocality(h)
            return (
              <button
                key={h.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick({ id: h.id, name: hitName(h) }); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-emerald-50"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
                  {(h.csaladnev || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{hitName(h)}</span>
                  {(by || loc) && <span className="block truncate text-[11px] text-slate-400">{[by, loc].filter(Boolean).join(' · ')}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function DispozitieIncasareWizard({ open, onOpenChange, missingNumbers, incomeCategories, defaultDate, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [date, setDate] = useState(defaultDate || todayIso())
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [megj, setMegj] = useState('Utólag elszámolt nyugta')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  // Megnyitáskor friss állapot + a hiányzó számokból egy-egy sor.
  useEffect(() => {
    if (!open) return
    setStep(0)
    setDate(defaultDate || todayIso())
    setCategoryId('')
    setMegj('Utólag elszámolt nyugta')
    setBusy(false)
    setRows(
      (missingNumbers.length ? missingNumbers : [0]).map((n) => ({
        id: uid(), iratsz: n ? String(n) : '', keruleti: '', name: '', personId: null, amount: '',
      })),
    )
  }, [open, missingNumbers, defaultDate])

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows])
  const validRows = useMemo(() => rows.filter((r) => r.iratsz.trim() && Number(r.amount) > 0), [rows])

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((cur) => [...cur, { id: uid(), iratsz: '', keruleti: '', name: '', personId: null, amount: '' }]) }
  function removeRow(id: string) { setRows((cur) => (cur.length === 1 ? cur : cur.filter((r) => r.id !== id))) }

  const step1Ok = validRows.length > 0 && rows.every((r) => !r.iratsz.trim() || Number(r.amount) > 0)
  const step2Ok = Boolean(categoryId) && validRows.every((r) => r.name.trim())
  const linkedCount = validRows.filter((r) => r.personId != null).length

  async function handleSave() {
    if (!categoryId) return
    setBusy(true)
    try {
      const year = Number(date.slice(0, 4)) || new Date().getFullYear()
      const batch: IncomeBatchRowInput[] = validRows.map((r) => {
        const iratsz = r.iratsz.trim()
        const note = `${megj.trim() || 'Utólag elszámolt nyugta'}${iratsz ? ` (Chitanță ${iratsz})` : ''}`
        return {
          datum: date,
          id_befizetescel: Number(categoryId),
          forrasa: r.name.trim() || null,
          osszeg: Number(r.amount),
          // Kerületi sz. (opcionális) → iratszam; ha üres, az insert AUTO-hivatkozást tesz.
          iratszam: r.keruleti.trim() || null,
          // Irat sz. (gyülekezeti) → nyugta: ettől kerül le a figyelő „hiányzó" listájáról.
          nyugta: iratsz,
          irattipus: 'Chitanță',
          fizetettev: year,
          megjegyzes: note,
          id_szemely: r.personId ?? null,
          id_csalad: null,
        }
      })
      const res = await saveIncomeBatch(batch)
      if ('error' in res && res.error) {
        toast.error(`A könyvelés nem sikerült — ${res.error}`)
        return
      }
      toast.success(`${batch.length} nyugta utólag bevételként a kasszába könyvelve${linkedCount ? ` · ${linkedCount} személyhez kötve` : ''}.`)
      onDone?.()
      onOpenChange(false)
    } finally {
      setBusy(false)
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
                <DialogTitle className="font-heading text-lg">Hiányzó nyugták utólagos bevételezése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-500">Minden hiányzó Chitanță egy bevétel a kasszába — személyhez kötve, &bdquo;utólag elszámolt&rdquo; nyommal.</p>
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
              <p className="text-sm text-slate-600">
                Add meg minden hiányzó nyugta összegét és befizetőjét. A <strong>befizető keresésekor</strong> a
                taghoz kötjük a tételt (adomány / egyházfenntartás a taghoz számít). A <strong>Kerületi sz.</strong> nem kötelező.
              </p>
              <div className="overflow-visible rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 w-20">Irat sz.</th>
                      <th className="px-3 py-2 w-24">Kerületi sz.</th>
                      <th className="px-3 py-2">Befizető (tag-kereső)</th>
                      <th className="px-3 py-2 text-right w-28">Összeg (RON)</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-1.5 align-top">
                          <Input value={r.iratsz} onChange={(e) => patchRow(r.id, { iratsz: e.target.value })} className="h-8 tabular-nums" />
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <Input value={r.keruleti} onChange={(e) => patchRow(r.id, { keruleti: e.target.value })} placeholder="opc." className="h-8 tabular-nums" />
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <PayerSearchCell
                            value={r.name}
                            personId={r.personId}
                            onType={(t) => patchRow(r.id, { name: t, personId: null })}
                            onPick={(p) => patchRow(r.id, { name: p.name, personId: p.id })}
                          />
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <Input type="number" min={0} inputMode="numeric" value={r.amount} onChange={(e) => patchRow(r.id, { amount: e.target.value })} className="h-8 text-right tabular-nums" />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <button type="button" onClick={() => removeRow(r.id)} className="mt-1 text-slate-300 transition hover:text-rose-500" title="Sor törlése">
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
                <p className="text-sm text-slate-600">
                  Összesen: <strong className="tabular-nums text-emerald-700">{ron(total)}</strong> · {validRows.length} tétel
                  {linkedCount > 0 && <span className="text-emerald-600"> · {linkedCount} személyhez kötve</span>}
                </p>
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
                <label className="text-sm text-slate-600">Bevétel-jogcím (kategória) *
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
              <label className="block text-sm text-slate-600">Megjegyzés (a tételekre kerül — &bdquo;utólag elszámolt&rdquo; nyom)
                <Input value={megj} onChange={(e) => setMegj(e.target.value)} className="mt-1" />
              </label>
              <div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-800">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  A dátum a <strong>könyvelés napja</strong>. Ha a nyugta éve még nyitott, add meg az eredeti dátumot;
                  ha a számadás már lezárt, a mai dátum + a &bdquo;utólag elszámolt&rdquo; megjegyzés a helyes (a nyugta saját száma
                  a megjegyzésben marad).
                </p>
              </div>
              {!step2Ok && (
                <p className="text-xs text-amber-700">Válassz jogcímet, és minden tételhez adj meg befizetőt (az 1. lépésben).</p>
              )}
            </div>
          )}

          {/* 3. lépés — ellenőrzés + mentés */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
                <p className="font-semibold text-emerald-900">{validRows.length} nyugta bevételezése · összesen {ron(total)}</p>
                <p className="mt-0.5 text-emerald-800/80">
                  Dátum: {date} · Jogcím: {incomeCategories.find((c) => c.id === categoryId)?.nev || '—'}
                  {linkedCount > 0 && ` · ${linkedCount} személyhez kötve`}
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                {validRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2">
                    <span className="flex items-center gap-2 text-slate-600">
                      {r.personId != null && <UserCheck className="size-3.5 shrink-0 text-emerald-500" />}
                      Irat sz. <strong className="tabular-nums">{r.iratsz}</strong> — {r.name || <span className="italic text-slate-400">nincs befizető</span>}
                    </span>
                    <span className="tabular-nums font-medium text-slate-800">{ron(Number(r.amount))}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Mentéskor minden tétel <strong>Chitanță-bevételként</strong> a kasszába (Registrul de casă) és a
                számadásba könyvelődik, a nyugta saját Irat sz.-ával — így a Nyugtafigyelő &bdquo;hiányzó&rdquo; listájáról lekerül.
              </p>
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
