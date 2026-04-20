'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { saveExpense, saveExpenseBatch, saveInternalTransfer } from '@/app/(dashboard)/penzugy/actions'
import { RECEIPT_TYPES, isInventoryCategory, type BankAccount } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface Category {
  id: number
  kod: string
  nev: string
}

interface ExpenseDialogV2Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  bankAccounts: BankAccount[]
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

export function ExpenseDialogV2({ open, onOpenChange, categories, bankAccounts }: ExpenseDialogV2Props) {
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
        toast.error('Válassza ki, melyik bankból történt a kivétel.')
        return
      }
      if (amount <= 0) {
        toast.error('Az összeg pozitív szám kell legyen.')
        return
      }

      setLoading(true)
      const result = await saveInternalTransfer({
        tipus: 'bank_kassza',
        datum,
        forras: selectedBank,
        cel: 'kassza',
        osszeg: amount,
        megjegyzes: note || partner || 'Bankból kivétel',
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('A bankból kivétel sikeresen rögzítve.')
        onOpenChange(false)
      }
      setLoading(false)
      return
    }

    if (!selectedCategory) {
      toast.error('Válasszon kategóriát.')
      return
    }
    if (amount <= 0) {
      toast.error('Az összeg pozitív szám kell legyen.')
      return
    }

    setLoading(true)
    const result = await saveExpense({
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
      toast.error(result.error)
    } else {
      toast.success('Kiadás sikeresen rögzítve.')
      onOpenChange(false)
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
      toast.error('Legalább egy kitöltött kiadási sor szükséges.')
      return
    }

    setLoading(true)
    const result = await saveExpenseBatch(normalizedRows)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${normalizedRows.length} kiadási sor sikeresen mentve.`)
      onOpenChange(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:max-w-6xl xl:max-w-[94vw] 2xl:max-w-[90vw]">
        <div className="border-b border-zinc-100 px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-md">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Kiadás rögzítése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-400">Egyszeri vagy táblázatos bevitel, bankból kivétellel és leltári felismeréssel.</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-6 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === 'single' ? 'default' : 'outline'} className="rounded-full" onClick={() => setMode('single')}>
              Egyesével
            </Button>
            <Button variant={mode === 'table' ? 'default' : 'outline'} className="rounded-full" onClick={() => setMode('table')}>
              Táblázatos bevitel
            </Button>
          </div>

          {mode === 'single' ? (
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Kategória *</Label>
                    <select
                      value={categoryValue}
                      onChange={event => setCategoryValue(event.target.value === SPECIAL_BANK_WITHDRAWAL ? SPECIAL_BANK_WITHDRAWAL : Number(event.target.value) || '')}
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
                    <Label>Dátum *</Label>
                    <Input type="date" value={datum} onChange={event => checkDate(event.target.value)} />
                    {dateBadge && <Badge variant="secondary" className="bg-red-100 text-red-700">{dateBadge}</Badge>}
                  </div>
                </div>

                {isBankWithdrawal ? (
                  <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 p-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Melyik bankból történt a kivétel? *</Label>
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
                      <Label>Összeg (RON) *</Label>
                      <Input type="number" min={0.01} step={0.01} value={amount || ''} onChange={event => setAmount(Number(event.target.value))} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Megjegyzés</Label>
                      <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Pl. napi készpénzfelvétel a bankból." className="min-h-[84px]" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Kedvezményezett / Partner</Label>
                        <Input value={partner} onChange={event => setPartner(event.target.value)} placeholder="Pl. Barkács Kft." />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Összeg (RON) *</Label>
                        <Input type="number" min={0.01} step={0.01} value={amount || ''} onChange={event => setAmount(Number(event.target.value))} />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Iratszám</Label>
                        <Input value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Típus *</Label>
                        <select value={receiptType} onChange={event => setReceiptType(event.target.value as (typeof RECEIPT_TYPES)[number])} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm">
                          {RECEIPT_TYPES.map(type => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Megjegyzés</Label>
                      <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Kiegészítő információ a kiadásról." className="min-h-[84px]" />
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
                  {/* Explicit oszlopszélességek — hogy a beviteli mezők olvashatóak legyenek */}
                  <colgroup>
                    <col style={{ width: '130px' }} />  {/* Dátum */}
                    <col style={{ width: '240px' }} />  {/* Kategória */}
                    <col style={{ width: '240px' }} />  {/* Partner */}
                    <col style={{ width: '120px' }} />  {/* Összeg */}
                    <col style={{ width: '110px' }} />  {/* Iratszám */}
                    <col style={{ width: '130px' }} />  {/* Típus */}
                    <col />                              {/* Megjegyzés — maradék hely */}
                    <col style={{ width: '60px' }} />   {/* Művelet */}
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
                          <Input type="date" value={row.datum} onChange={event => updateBatchRow(row.key, { datum: event.target.value })} className="h-9 text-sm" />
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
                          <Input value={row.partner} onChange={event => updateBatchRow(row.key, { partner: event.target.value })} className="h-9 text-sm" placeholder="Szolgáltató / kedvezményezett" />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" min={0.01} step={0.01} value={row.amount} onChange={event => updateBatchRow(row.key, { amount: event.target.value })} className="h-9 text-sm text-right font-semibold" />
                        </td>
                        <td className="px-2 py-2">
                          <Input value={row.documentNumber} onChange={event => updateBatchRow(row.key, { documentNumber: event.target.value })} className="h-9 text-sm font-mono" />
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
                          <Input value={row.note} onChange={event => updateBatchRow(row.key, { note: event.target.value })} className="h-9 text-sm" placeholder="Megjegyzés (opcionális)" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeBatchRow(row.key)}>
                            <Trash2 className="size-4" />
                          </Button>
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
                <Button variant="outline" className="rounded-xl" onClick={addBatchRow}>
                  <Plus className="mr-2 size-4" />
                  Új sor
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2 border-t border-zinc-100 pt-4">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-red-600 hover:bg-red-700"
              onClick={() => void (mode === 'single' ? handleSingleSubmit() : handleBatchSubmit())}
              disabled={loading || dateBadge.length > 0}
            >
              {loading ? 'Mentés...' : mode === 'single' ? 'Kiadás mentése' : 'Táblázat mentése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
