'use client'

/**
 * Összevont bevétel/kiadás bevitel — egy modal, két fül (Bevétel / Kiadás).
 *
 * Csak KÉSZPÉNZES tételekre (a banki tételeket banki kivonatból importáljuk).
 * Egyszerre több bevétel ÉS több kiadás is rögzíthető; a „Mentés" mindkét fül
 * sorait dátum szerint rendezi és a helyére menti (saveIncomeBatch + saveExpenseBatch).
 *
 * Mobil-barát: kis/közepes képernyőn kártyák (nincs oldalirányú görgetés),
 * nagy képernyőn táblázat. A kategória kereshető (csak megnevezés), a dátum
 * bármilyen formátumban beírható.
 */

import { useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { formatRon } from './ron-in-words'
import { parseFlexibleDate } from './date-parse'
import { SearchableSelect } from './SearchableSelect'
import type { IncomeCategory, SaveIncomeBatchRow } from './IncomeDialogBody'
import type { ExpenseCategory, SaveExpenseBatchRow } from './ExpenseDialogBody'

export type CombinedToastFn = (type: 'success' | 'error', message: string) => void

/** Irat (bizonylat) típusok — román megnevezéssel, a könyvelési gyakorlat szerint. */
const DOC_TYPES = ['Factură', 'Bon fiscal', 'Chitanță', 'Stat de plată', 'Ordin de plată', 'Altele'] as const

export interface CombinedEntryBodyProps {
  incomeCategories: IncomeCategory[]
  expenseCategories: ExpenseCategory[]
  currentYear: number
  onSaveIncomeBatch: (rows: SaveIncomeBatchRow[]) => Promise<{ error?: string | null }>
  onSaveExpenseBatch: (rows: SaveExpenseBatchRow[]) => Promise<{ error?: string | null }>
  onClose: () => void
  onToast: CombinedToastFn
}

type EntryRow = {
  id: string
  datum: string // nyers szöveg, rugalmasan értelmezve
  categoryId: number | ''
  partner: string
  docType: string
  iratszam: string
  amount: string
  megjegyzes: string
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const newRow = (): EntryRow => ({
  id: crypto.randomUUID(), datum: todayIso(), categoryId: '', partner: '', docType: '', iratszam: '', amount: '', megjegyzes: '',
})

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function rowValid(r: EntryRow): boolean {
  return Number(r.amount) > 0 && r.categoryId !== '' && parseFlexibleDate(r.datum) != null
}
function validCount(rows: EntryRow[]): number {
  return rows.filter(rowValid).length
}
/** Az irat-szám és -típus egy mezőbe (pl. „Factură 123"). */
function combinedIratszam(r: EntryRow): string | null {
  const parts = [r.docType.trim(), r.iratszam.trim()].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

export function CombinedEntryBody({
  incomeCategories, expenseCategories, currentYear,
  onSaveIncomeBatch, onSaveExpenseBatch, onClose, onToast,
}: CombinedEntryBodyProps) {
  const [tab, setTab] = useState<'income' | 'expense'>('income')
  const [incomeRows, setIncomeRows] = useState<EntryRow[]>([newRow()])
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>([newRow()])
  const [busy, setBusy] = useState(false)

  const incomeValid = validCount(incomeRows)
  const expenseValid = validCount(expenseRows)

  const rows = tab === 'income' ? incomeRows : expenseRows
  const setRows = tab === 'income' ? setIncomeRows : setExpenseRows
  const categoryOptions = (tab === 'income' ? incomeCategories : expenseCategories).map((c) => ({ id: c.id, label: c.nev }))
  const partnerLabel = tab === 'income' ? 'Befizető / forrás' : 'Kedvezményezett'

  const tabTotal = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows])

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((cur) => [...cur, newRow()]) }
  function removeRow(id: string) { setRows((cur) => (cur.length === 1 ? [newRow()] : cur.filter((r) => r.id !== id))) }

  function buildBatch<T>(src: EntryRow[], map: (r: EntryRow, datum: string) => T): { rows: T[]; badRow?: number } {
    const out: T[] = []
    for (let i = 0; i < src.length; i += 1) {
      const r = src[i]
      if (!(Number(r.amount) > 0 && r.categoryId !== '')) continue
      const datum = parseFlexibleDate(r.datum)
      if (!datum) return { rows: [], badRow: i + 1 }
      out.push(map(r, datum))
    }
    out.sort((a, b) => (a as { datum: string }).datum.localeCompare((b as { datum: string }).datum))
    return { rows: out }
  }

  async function handleSave() {
    if (incomeValid === 0 && expenseValid === 0) {
      onToast('error', 'Legalább egy bevétel vagy kiadás sor szükséges (összeg + kategória + érvényes dátum).')
      return
    }

    const inc = buildBatch<SaveIncomeBatchRow>(incomeRows, (r, datum) => ({
      datum,
      id_befizetescel: Number(r.categoryId),
      forrasa: r.partner.trim() || null,
      osszeg: Number(r.amount),
      iratszam: combinedIratszam(r),
      irattipus: 'Készpénz',
      fizetettev: Number(datum.slice(0, 4)) || currentYear,
      megjegyzes: r.megjegyzes.trim() || null,
    }))
    if (inc.badRow) { onToast('error', `Bevétel ${inc.badRow}. sor: a dátum nem értelmezhető.`); return }

    const exp = buildBatch<SaveExpenseBatchRow>(expenseRows, (r, datum) => ({
      datum,
      id_kiadascel: Number(r.categoryId),
      kedvezmenyzett: r.partner.trim() || null,
      osszeg: Number(r.amount),
      iratszam: combinedIratszam(r),
      irattipus: 'Készpénz',
      megjegyzes: r.megjegyzes.trim() || null,
      is_inventory: false,
    }))
    if (exp.badRow) { onToast('error', `Kiadás ${exp.badRow}. sor: a dátum nem értelmezhető.`); return }

    setBusy(true)
    try {
      if (inc.rows.length > 0) {
        const res = await onSaveIncomeBatch(inc.rows)
        if (res.error) { onToast('error', `Bevétel: ${res.error}`); return }
      }
      if (exp.rows.length > 0) {
        const res = await onSaveExpenseBatch(exp.rows)
        if (res.error) { onToast('error', `Kiadás: ${res.error}`); return }
      }
      onToast('success', `Mentve: ${inc.rows.length} bevétel, ${exp.rows.length} kiadás — dátum szerint rendezve, készpénzbe könyvelve.`)
      onClose()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A mentés nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  const dateInvalid = (r: EntryRow) => r.datum.trim() !== '' && parseFlexibleDate(r.datum) == null

  return (
    <div className="space-y-4">
      {/* Kiemelt fülek */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
        <button
          type="button"
          onClick={() => setTab('income')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'income' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
        >
          Bevétel{incomeValid > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{incomeValid}</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab('expense')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'expense' ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
        >
          Kiadás{expenseValid > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{expenseValid}</span>}
        </button>
      </div>
      <p className="text-xs text-slate-400">Csak készpénzes tételek — a banki tételeket banki kivonatból importáljuk. Mindkét fülre rögzíthetsz; a Mentés egyszerre, dátum szerint rendezve ment.</p>

      {/* Nagy képernyő: táblázat */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Dátum</th>
              <th className="px-2 py-2 text-left">Kategória</th>
              <th className="px-2 py-2 text-left">{partnerLabel}</th>
              <th className="px-2 py-2 text-left">Irattípus</th>
              <th className="px-2 py-2 text-left">Irat sz.</th>
              <th className="px-2 py-2 text-right">Összeg</th>
              <th className="px-2 py-2 text-left">Megjegyzés</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5 w-[120px]">
                  <input className={`${inputClass} ${dateInvalid(r) ? 'border-red-400' : ''}`} value={r.datum} placeholder="pl. 2026.01.04" onChange={(e) => updateRow(r.id, { datum: e.target.value })} />
                </td>
                <td className="px-2 py-1.5 min-w-[180px]">
                  <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
                </td>
                <td className="px-2 py-1.5"><input className={inputClass} value={r.partner} onChange={(e) => updateRow(r.id, { partner: e.target.value })} /></td>
                <td className="px-2 py-1.5 w-[130px]">
                  <select className={inputClass} value={r.docType} onChange={(e) => updateRow(r.id, { docType: e.target.value })}>
                    <option value="">—</option>
                    {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </td>
                <td className="px-2 py-1.5 w-[100px]"><input className={inputClass} value={r.iratszam} onChange={(e) => updateRow(r.id, { iratszam: e.target.value })} /></td>
                <td className="px-2 py-1.5 w-[110px]"><input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input className={inputClass} value={r.megjegyzes} onChange={(e) => updateRow(r.id, { megjegyzes: e.target.value })} /></td>
                <td className="px-2 py-1.5 text-right">
                  <button type="button" aria-label="Sor törlése" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500" onClick={() => removeRow(r.id)}>
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kis/közepes képernyő: kártyák (nincs oldalirányú görgetés) */}
      <div className="space-y-3 lg:hidden">
        {rows.map((r, i) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{i + 1}. tétel</span>
              <button type="button" aria-label="Sor törlése" className="text-slate-400 hover:text-red-500" onClick={() => removeRow(r.id)}><Trash2 className="size-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-xs text-slate-500">Kategória
                <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
              </label>
              <label className="text-xs text-slate-500">Dátum
                <input className={`${inputClass} ${dateInvalid(r) ? 'border-red-400' : ''}`} value={r.datum} placeholder="pl. 2026.01.04" onChange={(e) => updateRow(r.id, { datum: e.target.value })} />
              </label>
              <label className="text-xs text-slate-500">Összeg
                <input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} />
              </label>
              <label className="col-span-2 text-xs text-slate-500">{partnerLabel}
                <input className={inputClass} value={r.partner} onChange={(e) => updateRow(r.id, { partner: e.target.value })} />
              </label>
              <label className="text-xs text-slate-500">Irattípus
                <select className={inputClass} value={r.docType} onChange={(e) => updateRow(r.id, { docType: e.target.value })}>
                  <option value="">—</option>
                  {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
              <label className="text-xs text-slate-500">Irat sz.
                <input className={inputClass} value={r.iratszam} onChange={(e) => updateRow(r.id, { iratszam: e.target.value })} />
              </label>
              <label className="col-span-2 text-xs text-slate-500">Megjegyzés
                <input className={inputClass} value={r.megjegyzes} onChange={(e) => updateRow(r.id, { megjegyzes: e.target.value })} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent" onClick={addRow}>
          <Plus className="size-4" /> Új sor
        </button>
        <div className="text-sm">
          <span className="text-slate-500">{tab === 'income' ? 'Bevételek' : 'Kiadások'} összege:</span>{' '}
          <strong className={tab === 'income' ? 'text-emerald-600' : 'text-red-500'}>{formatRon(tabTotal)} RON</strong>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose} disabled={busy}>Mégse</button>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50" onClick={() => void handleSave()} disabled={busy}>
          <Save className="size-4" /> Mentés ({incomeValid + expenseValid} tétel)
        </button>
      </div>
    </div>
  )
}
