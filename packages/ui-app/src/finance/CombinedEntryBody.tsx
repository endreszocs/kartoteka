'use client'

/**
 * Összevont bevétel/kiadás bevitel — egy modal, két fül (Bevétel / Kiadás).
 *
 * Csak KÉSZPÉNZES tételekre (a banki tételeket banki kivonatból importáljuk).
 * Egyszerre több bevétel ÉS több kiadás is rögzíthető; a „Mentés" mindkét fül
 * sorait dátum szerint rendezi és a helyére menti.
 *
 * Belső mozgás (készpénzfelvétel a bankból / készpénzletétel a bankba): ha a
 * sor kategóriája ilyen, megjelenik a BANKSZÁMLA-választó, és a sor belső
 * mozgásként könyvelődik (a kassza ÉS a bank oldalt is rendezi).
 *
 * Mobil-barát: kis/közepes képernyőn kártyák (nincs oldalirányú görgetés).
 */

import { useMemo, useState } from 'react'
import { Plus, Save, Trash2, ArrowLeftRight } from 'lucide-react'
import { formatRon } from './ron-in-words'
import { parseFlexibleDate } from './date-parse'
import { SearchableSelect } from './SearchableSelect'
import type { IncomeCategory, SaveIncomeBatchRow } from './IncomeDialogBody'
import type { ExpenseCategory, SaveExpenseBatchRow } from './ExpenseDialogBody'

export type CombinedToastFn = (type: 'success' | 'error', message: string) => void

/** Irat (bizonylat) típusok — román megnevezéssel, a könyvelési gyakorlat szerint. */
const DOC_TYPES = ['Factură', 'Bon fiscal', 'Chitanță', 'Stat de plată', 'Ordin de plată', 'Altele'] as const

/**
 * Belső mozgás kódok. A készpénzes Tétel-rögzítőben CSAK a kassza↔bank
 * mozgások jelennek meg (bankszámla-választóval). A bank-bank átutalás
 * KI VAN ZÁRVA — az kizárólag a Bank fülön rögzíthető.
 */
const DEPOSIT_KODS = new Set(['400.01', '301.01']) // kassza → bank (letétel)
const WITHDRAW_KODS = new Set(['401.01']) // bank → kassza (felvétel)
const BANKBANK_KODS = new Set(['401.02', '301.02']) // bank ↔ bank — kizárva

function dirOfKod(kod: string | undefined): 'deposit' | 'withdraw' | null {
  if (!kod) return null
  if (DEPOSIT_KODS.has(kod)) return 'deposit'
  if (WITHDRAW_KODS.has(kod)) return 'withdraw'
  return null
}

export interface CombinedBankAccount {
  id: number
  bank_neve: string
}

export interface CombinedInternalTransferPayload {
  tipus: 'kassza_bank' | 'bank_kassza'
  datum: string
  forras: string
  cel: string
  osszeg: number
  megjegyzes: string
}

export interface CombinedEntryBodyProps {
  incomeCategories: IncomeCategory[]
  expenseCategories: ExpenseCategory[]
  bankAccounts: CombinedBankAccount[]
  currentYear: number
  onSaveIncomeBatch: (rows: SaveIncomeBatchRow[]) => Promise<{ error?: string | null }>
  onSaveExpenseBatch: (rows: SaveExpenseBatchRow[]) => Promise<{ error?: string | null }>
  onSaveInternalTransfer: (payload: CombinedInternalTransferPayload) => Promise<{ error?: string | null }>
  onClose: () => void
  onToast: CombinedToastFn
}

type EntryRow = {
  id: string
  datum: string
  categoryId: number | ''
  partner: string
  docType: string
  iratszam: string
  amount: string
  megjegyzes: string
  bankId: number | ''
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const newRow = (): EntryRow => ({
  id: crypto.randomUUID(), datum: todayIso(), categoryId: '', partner: '', docType: '', iratszam: '', amount: '', megjegyzes: '', bankId: '',
})

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function CombinedEntryBody({
  incomeCategories, expenseCategories, bankAccounts, currentYear,
  onSaveIncomeBatch, onSaveExpenseBatch, onSaveInternalTransfer, onClose, onToast,
}: CombinedEntryBodyProps) {
  const [tab, setTab] = useState<'income' | 'expense'>('income')
  const [incomeRows, setIncomeRows] = useState<EntryRow[]>([newRow()])
  const [expenseRows, setExpenseRows] = useState<EntryRow[]>([newRow()])
  const [busy, setBusy] = useState(false)

  const rows = tab === 'income' ? incomeRows : expenseRows
  const setRows = tab === 'income' ? setIncomeRows : setExpenseRows
  const partnerLabel = tab === 'income' ? 'Befizető / forrás' : 'Kedvezményezett'

  // Kód-lookup mindkét fülre (a belső mozgás iránya független a fültől).
  const incomeKod = useMemo(() => new Map<number, string>(incomeCategories.map((c) => [c.id, c.kod] as [number, string])), [incomeCategories])
  const expenseKod = useMemo(() => new Map<number, string>(expenseCategories.map((c) => [c.id, c.kod] as [number, string])), [expenseCategories])
  const dirFor = (tabName: 'income' | 'expense', r: EntryRow): 'deposit' | 'withdraw' | null => {
    if (r.categoryId === '') return null
    return dirOfKod((tabName === 'income' ? incomeKod : expenseKod).get(Number(r.categoryId)))
  }
  const belsoDir = (r: EntryRow) => dirFor(tab, r) // aktuális fül — a megjelenítéshez

  function rowValidIn(tabName: 'income' | 'expense', r: EntryRow): boolean {
    if (!(Number(r.amount) > 0 && r.categoryId !== '' && parseFlexibleDate(r.datum) != null)) return false
    if (dirFor(tabName, r) && r.bankId === '') return false // belső mozgáshoz bankszámla kell
    return true
  }
  const incomeValid = incomeRows.filter((r) => rowValidIn('income', r)).length
  const expenseValid = expenseRows.filter((r) => rowValidIn('expense', r)).length

  // A kategória-lista a bank-bank átutalást NEM tartalmazza (csak a Bank fülön).
  const cats = tab === 'income' ? incomeCategories : expenseCategories
  const categoryOptions = useMemo(
    () => cats.filter((c) => !BANKBANK_KODS.has(c.kod)).map((c) => ({ id: c.id, label: c.nev })),
    [cats],
  )

  const tabTotal = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows])

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((cur) => [...cur, newRow()]) }
  function removeRow(id: string) { setRows((cur) => (cur.length === 1 ? [newRow()] : cur.filter((r) => r.id !== id))) }

  function combinedIratszam(r: EntryRow): string | null {
    const parts = [r.docType.trim(), r.iratszam.trim()].filter(Boolean)
    return parts.length ? parts.join(' ') : null
  }

  async function handleSave() {
    if (incomeValid === 0 && expenseValid === 0) {
      onToast('error', 'Legalább egy érvényes sor szükséges (összeg + kategória + dátum; belső mozgásnál bankszámla is).')
      return
    }

    // Belső mozgás sorok kigyűjtése (mindkét fülről)
    const transfers: CombinedInternalTransferPayload[] = []
    const incomeBatch: SaveIncomeBatchRow[] = []
    const expenseBatch: SaveExpenseBatchRow[] = []

    function pushTransfer(dir: 'deposit' | 'withdraw', datum: string, r: EntryRow) {
      if (dir === 'deposit') {
        transfers.push({ tipus: 'kassza_bank', datum, forras: 'kassza', cel: String(r.bankId), osszeg: Number(r.amount), megjegyzes: r.megjegyzes.trim() || 'Készpénzletétel a bankba' })
      } else {
        transfers.push({ tipus: 'bank_kassza', datum, forras: String(r.bankId), cel: 'kassza', osszeg: Number(r.amount), megjegyzes: r.megjegyzes.trim() || 'Készpénzfelvétel a bankból' })
      }
    }

    for (const r of incomeRows) {
      if (!rowValidIn('income', r)) continue
      const datum = parseFlexibleDate(r.datum)!
      const dir = dirFor('income', r)
      if (dir) { pushTransfer(dir, datum, r); continue }
      incomeBatch.push({
        datum, id_befizetescel: Number(r.categoryId), forrasa: r.partner.trim() || null,
        osszeg: Number(r.amount), iratszam: combinedIratszam(r), irattipus: 'Készpénz',
        fizetettev: Number(datum.slice(0, 4)) || currentYear, megjegyzes: r.megjegyzes.trim() || null,
      })
    }
    for (const r of expenseRows) {
      if (!rowValidIn('expense', r)) continue
      const datum = parseFlexibleDate(r.datum)!
      const dir = dirFor('expense', r)
      if (dir) { pushTransfer(dir, datum, r); continue }
      expenseBatch.push({
        datum, id_kiadascel: Number(r.categoryId), kedvezmenyzett: r.partner.trim() || null,
        osszeg: Number(r.amount), iratszam: combinedIratszam(r), irattipus: 'Készpénz',
        megjegyzes: r.megjegyzes.trim() || null, is_inventory: false,
      })
    }

    incomeBatch.sort((a, b) => a.datum.localeCompare(b.datum))
    expenseBatch.sort((a, b) => a.datum.localeCompare(b.datum))

    setBusy(true)
    try {
      if (incomeBatch.length) {
        const res = await onSaveIncomeBatch(incomeBatch)
        if (res.error) { onToast('error', `Bevétel: ${res.error}`); return }
      }
      if (expenseBatch.length) {
        const res = await onSaveExpenseBatch(expenseBatch)
        if (res.error) { onToast('error', `Kiadás: ${res.error}`); return }
      }
      for (const t of transfers) {
        const res = await onSaveInternalTransfer(t)
        if (res.error) { onToast('error', `Belső mozgás: ${res.error}`); return }
      }
      const parts = []
      if (incomeBatch.length) parts.push(`${incomeBatch.length} bevétel`)
      if (expenseBatch.length) parts.push(`${expenseBatch.length} kiadás`)
      if (transfers.length) parts.push(`${transfers.length} belső mozgás`)
      onToast('success', `Mentve: ${parts.join(', ')} — dátum szerint rendezve.`)
      onClose()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'A mentés nem sikerült.')
    } finally {
      setBusy(false)
    }
  }

  const dateInvalid = (r: EntryRow) => r.datum.trim() !== '' && parseFlexibleDate(r.datum) == null

  // Dátum mező: szabadon beírható szöveg + naptár-választó (natív date input).
  function renderDateField(r: EntryRow) {
    return (
      <div className="flex items-center gap-1">
        <input
          className={`${inputClass} ${dateInvalid(r) ? 'border-red-400' : ''}`}
          value={r.datum}
          placeholder="pl. 2026.01.04"
          onChange={(e) => updateRow(r.id, { datum: e.target.value })}
        />
        <input
          type="date"
          aria-label="Dátum választása naptárból"
          title="Naptár"
          className="h-9 w-9 shrink-0 rounded-md border border-input bg-transparent px-1 text-transparent"
          value={parseFlexibleDate(r.datum) || ''}
          onChange={(e) => { if (e.target.value) updateRow(r.id, { datum: e.target.value }) }}
        />
      </div>
    )
  }

  function renderBankSelect(r: EntryRow) {
    const dir = belsoDir(r)
    if (!dir) return null
    return (
      <div className="mt-1 flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800">
        <ArrowLeftRight className="size-3.5 shrink-0" />
        <span className="shrink-0">{dir === 'deposit' ? 'Melyik bankszámlára:' : 'Melyik bankszámláról:'}</span>
        <select className={inputClass + ' h-7'} value={r.bankId} onChange={(e) => updateRow(r.id, { bankId: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">— Válassz —</option>
          {bankAccounts.map((b) => (<option key={b.id} value={b.id}>{b.bank_neve}</option>))}
        </select>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Kiemelt fülek */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
        <button type="button" onClick={() => setTab('income')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'income' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>
          Bevétel{incomeValid > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{incomeValid}</span>}
        </button>
        <button type="button" onClick={() => setTab('expense')}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${tab === 'expense' ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>
          Kiadás{expenseValid > 0 && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{expenseValid}</span>}
        </button>
      </div>
      <p className="text-xs text-slate-400">Csak készpénzes tételek — a banki tételeket banki kivonatból importáljuk. Készpénzfelvétel/-letétel esetén válaszd ki a bankszámlát is.</p>

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
            {rows.map((r) => {
              const dir = belsoDir(r)
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1.5 w-[160px]">
                    {renderDateField(r)}
                  </td>
                  <td className="px-2 py-1.5 min-w-[180px]">
                    <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
                    {renderBankSelect(r)}
                  </td>
                  <td className="px-2 py-1.5">
                    {dir ? <span className="text-xs text-slate-400">—</span> : <input className={inputClass} value={r.partner} onChange={(e) => updateRow(r.id, { partner: e.target.value })} />}
                  </td>
                  <td className="px-2 py-1.5 w-[130px]">
                    <select className={inputClass} value={r.docType} disabled={!!dir} onChange={(e) => updateRow(r.id, { docType: e.target.value })}>
                      <option value="">—</option>
                      {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 w-[100px]"><input className={inputClass} value={r.iratszam} disabled={!!dir} onChange={(e) => updateRow(r.id, { iratszam: e.target.value })} /></td>
                  <td className="px-2 py-1.5 w-[110px]"><input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={inputClass} value={r.megjegyzes} onChange={(e) => updateRow(r.id, { megjegyzes: e.target.value })} /></td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" aria-label="Sor törlése" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500" onClick={() => removeRow(r.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Kis/közepes képernyő: kártyák */}
      <div className="space-y-3 lg:hidden">
        {rows.map((r, i) => {
          const dir = belsoDir(r)
          return (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{i + 1}. tétel</span>
                <button type="button" aria-label="Sor törlése" className="text-slate-400 hover:text-red-500" onClick={() => removeRow(r.id)}><Trash2 className="size-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-xs text-slate-500">Kategória
                  <SearchableSelect options={categoryOptions} value={r.categoryId} onChange={(id) => updateRow(r.id, { categoryId: id })} />
                </label>
                {dir && (
                  <label className="col-span-2 text-xs text-sky-800">{dir === 'deposit' ? 'Melyik bankszámlára' : 'Melyik bankszámláról'}
                    <select className={inputClass} value={r.bankId} onChange={(e) => updateRow(r.id, { bankId: e.target.value ? Number(e.target.value) : '' })}>
                      <option value="">— Válassz —</option>
                      {bankAccounts.map((b) => (<option key={b.id} value={b.id}>{b.bank_neve}</option>))}
                    </select>
                  </label>
                )}
                <label className="text-xs text-slate-500">Dátum
                  {renderDateField(r)}
                </label>
                <label className="text-xs text-slate-500">Összeg
                  <input className={inputClass + ' text-right'} type="number" min={0} step={0.01} value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} />
                </label>
                {!dir && (
                  <>
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
                  </>
                )}
                <label className="col-span-2 text-xs text-slate-500">Megjegyzés
                  <input className={inputClass} value={r.megjegyzes} onChange={(e) => updateRow(r.id, { megjegyzes: e.target.value })} />
                </label>
              </div>
            </div>
          )
        })}
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
