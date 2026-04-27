'use client'

/**
 * Kiadás-rögzítő dialog body — Sprint Q F3.1 (v0.7.10).
 *
 * A webes `apps/web/components/modals/expense-dialog-v2.tsx`-ből kiemelve a sharedba,
 * iOS-future-proof módon (callback prop-pattern + body-pattern). A Dialog shell
 * (DialogContent / DialogHeader / DialogTitle) a webes wrapper-ben marad —
 * ide a tartalom-rész (form + táblázat + akció-gombok) kerül.
 *
 * Működés:
 *   - egyesével: kategória + partner + összeg + iratszám + típus + megjegyzés
 *   - táblázatosan: több sor egyszerre, batch-mentéssel
 *   - speciális mód: bankból kivétel → belső mozgás (bank → kassza)
 *
 * Server action-ök callback prop-ként:
 *   onSaveExpense, onSaveExpenseBatch, onSaveInternalTransfer
 */

import { useEffect, useMemo, useState } from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
import type { BankAccount } from './types'
import { RECEIPT_TYPES } from './types'
import { isInventoryCategory } from './helpers'

// ── Típusok ──────────────────────────────────────────────────

export interface ExpenseCategory {
  id: number
  kod: string
  nev: string
}

export interface SaveExpensePayload {
  datum: string
  id_kiadascel: number
  kedvezmenyzett: string | null
  osszeg: number
  iratszam: string | null
  irattipus: (typeof RECEIPT_TYPES)[number]
  megjegyzes: string | null
  is_inventory: boolean
}

export interface SaveExpenseBatchRow {
  datum: string
  id_kiadascel: number
  kedvezmenyzett: string | null
  osszeg: number
  iratszam: string | null
  irattipus: (typeof RECEIPT_TYPES)[number]
  megjegyzes: string | null
  is_inventory: boolean
}

export interface SaveInternalTransferPayload {
  tipus: 'bank_kassza' | 'kassza_bank' | 'bank_bank' | 'valutacsere'
  datum: string
  forras: string
  cel: string
  osszeg: number
  megjegyzes: string
}

export type ExpenseToastFn = (type: 'success' | 'error', message: string) => void

export interface ExpenseDialogBodyProps {
  open: boolean
  onClose: () => void
  categories: ExpenseCategory[]
  bankAccounts: BankAccount[]
  /** Egyetlen kiadás mentése. */
  onSaveExpense: (payload: SaveExpensePayload) => Promise<{ error?: string | null }>
  /** Táblázatos batch-mentés. */
  onSaveExpenseBatch: (rows: SaveExpenseBatchRow[]) => Promise<{ error?: string | null }>
  /** Belső mozgás — bankból kivétel a kasszába. */
  onSaveInternalTransfer: (payload: SaveInternalTransferPayload) => Promise<{ error?: string | null }>
  /** Toast callback — wrapper sonner / Tauri-toast / iOS UIAlertController. */
  onToast: ExpenseToastFn
}

type EntryMode = 'single' | 'table'
type SpecialExpenseCategory = '__bank_withdrawal__'

const SPECIAL_BANK_WITHDRAWAL: SpecialExpenseCategory = '__bank_withdrawal__'

type BatchExpenseRow = {
  key: string
  datum: string
  categoryId: number | ''
  partner: string
  amount: string
  documentNumber: string
  receiptType: (typeof RECEIPT_TYPES)[number]
  note: string
}

function createBatchExpenseRow(): BatchExpenseRow {
  return {
    key: crypto.randomUUID(),
    datum: new Date().toISOString().slice(0, 10),
    categoryId: '',
    partner: '',
    amount: '',
    documentNumber: '',
    receiptType: 'Készpénz',
    note: '',
  }
}

// ── UI komponens ─────────────────────────────────────────────

export function ExpenseDialogBody({
  open,
  onClose,
  categories,
  bankAccounts,
  onSaveExpense,
  onSaveExpenseBatch,
  onSaveInternalTransfer,
  onToast,
}: ExpenseDialogBodyProps) {
  const [mode, setMode] = useState<EntryMode>('single')
  const [loading, setLoading] = useState(false)
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [categoryValue, setCategoryValue] = useState<number | '' | SpecialExpenseCategory>('')
  const [partner, setPartner] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [documentNumber, setDocumentNumber] = useState('')
  const [receiptType, setReceiptType] = useState<(typeof RECEIPT_TYPES)[number]>('Készpénz')
  const [note, setNote] = useState('')
  const [selectedBank, setSelectedBank] = useState('')
  const [dateBadge, setDateBadge] = useState('')
  const [batchRows, setBatchRows] = useState<BatchExpenseRow[]>([createBatchExpenseRow()])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      setMode('single')
      setLoading(false)
      setDatum(new Date().toISOString().slice(0, 10))
      setCategoryValue('')
      setPartner('')
      setAmount(0)
      setDocumentNumber('')
      setReceiptType('Készpénz')
      setNote('')
      setSelectedBank('')
      setDateBadge('')
      setBatchRows([createBatchExpenseRow()])
    })
  }, [open])

  const selectedCategory = useMemo(
    () => (typeof categoryValue === 'number' ? categories.find(category => category.id === categoryValue) || null : null),
    [categories, categoryValue],
  )

  const isBankWithdrawal = categoryValue === SPECIAL_BANK_WITHDRAWAL
  const isInventory = selectedCategory ? isInventoryCategory(selectedCategory.nev) : false

  function checkDate(value: string) {
    setDatum(value)
    const today = new Date().toISOString().slice(0, 10)
    setDateBadge(value > today ? 'Jövőbeli dátum nem engedélyezett.' : '')
  }

  function updateBatchRow(key: string, patch: Partial<BatchExpenseRow>) {
    setBatchRows(rows => rows.map(row => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addBatchRow() {
    setBatchRows(rows => [...rows, createBatchExpenseRow()])
  }

  function removeBatchRow(key: string) {
    setBatchRows(rows => (rows.length === 1 ? rows : rows.filter(row => row.key !== key)))
  }

  async function handleSingleSubmit() {
    if (isBankWithdrawal) {
      if (!selectedBank) {
        onToast('error', 'Válassza ki, melyik bankból történt a kivétel.')
        return
      }
      if (amount <= 0) {
        onToast('error', 'Az összeg pozitív szám kell legyen.')
        return
      }

      setLoading(true)
      const result = await onSaveInternalTransfer({
        tipus: 'bank_kassza',
        datum,
        forras: selectedBank,
        cel: 'kassza',
        osszeg: amount,
        megjegyzes: note || partner || 'Bankból kivétel',
      })

      if (result.error) {
        onToast('error', result.error)
      } else {
        onToast('success', 'A bankból kivétel sikeresen rögzítve.')
        onClose()
      }
      setLoading(false)
      return
    }

    if (!selectedCategory) {
      onToast('error', 'Válasszon kategóriát.')
      return
    }
    if (amount <= 0) {
      onToast('error', 'Az összeg pozitív szám kell legyen.')
      return
    }

    setLoading(true)
    const result = await onSaveExpense({
      datum,
      id_kiadascel: selectedCategory.id,
      kedvezmenyzett: partner || null,
      osszeg: amount,
      iratszam: documentNumber || null,
      irattipus: receiptType,
      megjegyzes: note || null,
      is_inventory: isInventory,
    })

    if (result.error) {
      onToast('error', result.error)
    } else {
      onToast('success', 'Kiadás sikeresen rögzítve.')
      onClose()
    }
    setLoading(false)
  }

  async function handleBatchSubmit() {
    const normalizedRows = batchRows
      .filter(row => row.categoryId !== '' && Number(row.amount) > 0)
      .map(row => {
        const category = categories.find(item => item.id === row.categoryId) || null
        return {
          datum: row.datum,
          id_kiadascel: Number(row.categoryId),
          kedvezmenyzett: row.partner || null,
          osszeg: Number(row.amount),
          iratszam: row.documentNumber || null,
          irattipus: row.receiptType,
          megjegyzes: row.note || null,
          is_inventory: category ? isInventoryCategory(category.nev) : false,
        }
      })

    if (normalizedRows.length === 0) {
      onToast('error', 'Legalább egy kitöltött kiadási sor szükséges.')
      return
    }

    setLoading(true)
    const result = await onSaveExpenseBatch(normalizedRows)
    if (result.error) {
      onToast('error', result.error)
    } else {
      onToast('success', `${normalizedRows.length} kiadási sor sikeresen mentve.`)
      onClose()
    }
    setLoading(false)
  }

  // Style helper-ek (shadcn-radix-tól független, native HTML-re)
  const inputClass =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ' +
    'transition-colors placeholder:text-muted-foreground focus-visible:outline-none ' +
    'focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
  const textareaClass =
    'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ' +
    'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
  const labelClass = 'text-sm font-medium leading-none'

  return (
    <div className="space-y-4 px-6 pb-6 pt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={
            'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium ' +
            (mode === 'single'
              ? 'bg-primary text-primary-foreground shadow'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground')
          }
          onClick={() => setMode('single')}
        >
          Egyesével
        </button>
        <button
          type="button"
          className={
            'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium ' +
            (mode === 'table'
              ? 'bg-primary text-primary-foreground shadow'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground')
          }
          onClick={() => setMode('table')}
        >
          Táblázatos bevitel
        </button>
      </div>

      {mode === 'single' ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>Kategória *</label>
                <select
                  value={categoryValue}
                  onChange={event =>
                    setCategoryValue(
                      event.target.value === SPECIAL_BANK_WITHDRAWAL
                        ? SPECIAL_BANK_WITHDRAWAL
                        : Number(event.target.value) || '',
                    )
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Válasszon —</option>
                  <option value={SPECIAL_BANK_WITHDRAWAL}>Bankból kivétel</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.kod} — {category.nev}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Dátum *</label>
                <input className={inputClass} type="date" value={datum} onChange={event => checkDate(event.target.value)} />
                {dateBadge && (
                  <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    {dateBadge}
                  </span>
                )}
              </div>
            </div>

            {isBankWithdrawal ? (
              <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass}>Melyik bankból történt a kivétel? *</label>
                  <select
                    value={selectedBank}
                    onChange={event => setSelectedBank(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— Válasszon bankszámlát —</option>
                    {bankAccounts.map(account => (
                      <option key={account.id} value={String(account.id)}>
                        {account.bank_neve} ({account.valuta})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Összeg (RON) *</label>
                  <input className={inputClass} type="number" min={0.01} step={0.01} value={amount || ''} onChange={event => setAmount(Number(event.target.value))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Megjegyzés</label>
                  <textarea
                    className={textareaClass + ' min-h-[84px]'}
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    placeholder="Pl. napi készpénzfelvétel a bankból."
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Kedvezményezett / Partner</label>
                    <input className={inputClass} value={partner} onChange={event => setPartner(event.target.value)} placeholder="Pl. Barkács Kft." />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Összeg (RON) *</label>
                    <input className={inputClass} type="number" min={0.01} step={0.01} value={amount || ''} onChange={event => setAmount(Number(event.target.value))} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Iratszám</label>
                    <input className={inputClass} value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Típus *</label>
                    <select
                      value={receiptType}
                      onChange={event => setReceiptType(event.target.value as (typeof RECEIPT_TYPES)[number])}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    >
                      {RECEIPT_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Megjegyzés</label>
                  <textarea
                    className={textareaClass + ' min-h-[84px]'}
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    placeholder="Kiegészítő információ a kiadásról."
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Gyors ellenőrzés</p>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                  <span>Rögzítési mód</span>
                  <strong>{isBankWithdrawal ? 'Bankból kivétel' : 'Kiadási tétel'}</strong>
                </div>
                {selectedCategory && (
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                    <span>Kategória</span>
                    <strong>{selectedCategory.nev}</strong>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                  <span>Összeg</span>
                  <strong>{amount > 0 ? `${amount.toFixed(2)} RON` : 'Nincs megadva'}</strong>
                </div>
                {isInventory && !isBankWithdrawal && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                    Ez a kategória leltári tételhez kapcsolódhat, ezért a mentés leltári nyomot is hagyhat.
                  </div>
                )}
                {isBankWithdrawal && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-violet-700">
                    Itt külön belső mozgás készül: a kiválasztott bankból a kasszába kerül át az összeg.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[1280px] w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: '130px' }} />
                <col style={{ width: '240px' }} />
                <col style={{ width: '240px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '130px' }} />
                <col />
                <col style={{ width: '60px' }} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium">Dátum</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Kategória</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Partner</th>
                  <th className="px-3 py-3 text-right text-xs font-medium">Összeg</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Iratszám</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Típus</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Megjegyzés</th>
                  <th className="px-3 py-3 text-right text-xs font-medium">—</th>
                </tr>
              </thead>
              <tbody>
                {batchRows.map(row => (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className="px-2 py-2">
                      <input className={inputClass + ' text-sm'} type="date" value={row.datum} onChange={event => updateBatchRow(row.key, { datum: event.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.categoryId}
                        onChange={event => updateBatchRow(row.key, { categoryId: Number(event.target.value) || '' })}
                        className="w-full rounded-xl border border-input bg-background px-2 h-9 text-sm"
                      >
                        <option value="">— Válasszon —</option>
                        {categories.map(category => (
                          <option key={category.id} value={category.id}>
                            {category.kod} — {category.nev}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputClass + ' text-sm'} value={row.partner} onChange={event => updateBatchRow(row.key, { partner: event.target.value })} placeholder="Szolgáltató / kedvezményezett" />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputClass + ' text-sm text-right font-semibold'} type="number" min={0.01} step={0.01} value={row.amount} onChange={event => updateBatchRow(row.key, { amount: event.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputClass + ' text-sm font-mono'} value={row.documentNumber} onChange={event => updateBatchRow(row.key, { documentNumber: event.target.value })} />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.receiptType}
                        onChange={event => updateBatchRow(row.key, { receiptType: event.target.value as (typeof RECEIPT_TYPES)[number] })}
                        className="w-full rounded-xl border border-input bg-background px-2 h-9 text-sm"
                      >
                        {RECEIPT_TYPES.map(type => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input className={inputClass + ' text-sm'} value={row.note} onChange={event => updateBatchRow(row.key, { note: event.target.value })} placeholder="Megjegyzés (opcionális)" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 w-9 hover:bg-accent hover:text-accent-foreground"
                        onClick={() => removeBatchRow(row.key)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-slate-400" />
              Egy mentéssel több kiadási sort rögzíthet. A bankból kivétel opció itt nem batch, hanem egyesével használható.
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
              onClick={addBatchRow}
            >
              <Plus className="size-4" />
              Új sor
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-t border-zinc-100 pt-4">
        <button
          type="button"
          className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-input px-4 py-2 text-sm font-medium"
          onClick={() => onClose()}
        >
          Mégse
        </button>
        <button
          type="button"
          className="flex-[2] rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          onClick={() => void (mode === 'single' ? handleSingleSubmit() : handleBatchSubmit())}
          disabled={loading || dateBadge.length > 0}
        >
          {loading ? 'Mentés...' : mode === 'single' ? 'Kiadás mentése' : 'Táblázat mentése'}
        </button>
      </div>
    </div>
  )
}
