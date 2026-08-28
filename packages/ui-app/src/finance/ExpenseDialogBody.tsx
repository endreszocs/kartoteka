'use client'

/**
 * Kiadás-rögzítő dialog body — Sprint Q F3.1 (v0.7.10).
 *
 * 2026-07-10 (S4-#6): teljes vizuális újratervezés + működés-ellenőrzés.
 *   - Szekciók: „Mi történt?" (kategória + összeg + dátum kiemelten),
 *     „Kinek fizettünk?" (kedvezményezett), „Részletek" (iratszám, típus,
 *     megjegyzés) — halvány elválasztókkal, lépés-számozással.
 *   - Speciális mód (bankból kivétel) feltűnő, lila magyarázó sávot kap:
 *     „Ez nem kiadás — belső átvezetés".
 *   - Látható input-mezők (rounded-lg + border-slate-300 + shadow-sm +
 *     fókusz-gyűrű) — a korábbi shadcn-token-os (border-input/bg-transparent)
 *     áttetsző mezők helyett, egységben az IncomeDialogBody-val.
 *   - Nagy, jobbra igazított összeg-mező RON utótaggal.
 *   - Mobil (375px): 1 oszlopos szekciók, görgethető batch-tábla, min. 40px
 *     érintőfelületek.
 *   - FIX: a dátum-hiba eddig a táblázatos mentést is letiltotta, pedig a
 *     batch-soroknak saját dátumuk van — mostantól csak egyesével módban tilt.
 *   - FIX: batch-mentésnél a hiányos (megkezdett, de érvénytelen) sorok eddig
 *     némán kimaradtak — mostantól hibaüzenet sorolja fel őket.
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
import { localTodayIso } from '@kartoteka/validations'
import { ArrowLeftRight, Building2, Plus, Trash2 } from 'lucide-react'
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
  irattipus: string // #5: szabad szöveges bizonylattípus (Chitanță/Factură/Készpénz/…)
  megjegyzes: string | null
  is_inventory: boolean
}

/**
 * 2026-08-09: a kiadás-sorhoz kapcsolt leltári tétel adatai (a Tétel rögzítő
 * „Leltárba vétel" al-űrlapja). A kiadás összege/dátuma/iratszáma a szerveren
 * kerül át a leltári tételbe — itt csak a leltár-specifikus mezők utaznak.
 */
export interface ExpenseInventoryIntake {
  megnevezes: string
  kategoria: string
  katalogus_kod?: string | null
  hasznalati_ido?: number | null
  helyszin?: string | null
  felelos_nev?: string | null
  megjegyzes?: string | null
}

export interface SaveExpenseBatchRow {
  datum: string
  id_kiadascel: number
  kedvezmenyzett: string | null
  osszeg: number
  iratszam: string | null
  irattipus: string // #5: szabad szöveges bizonylattípus (Chitanță/Factură/Készpénz/…)
  megjegyzes: string | null
  is_inventory: boolean
  /** 2026-08-09: ha megadva, a mentés a kiadással EGYÜTT leltári tételt is rögzít. */
  inventory?: ExpenseInventoryIntake | null
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
    datum: localTodayIso(),
    categoryId: '',
    partner: '',
    amount: '',
    documentNumber: '',
    receiptType: 'Készpénz',
    note: '',
  }
}

// ── Közös stílusok (S4-#6) — látható mezők + rose fókusz-gyűrű ──────────────

const inputClass =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm transition ' +
  'placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25'

const textareaClass =
  'min-h-[80px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition ' +
  'placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25'

const labelClass = 'text-sm font-medium text-slate-700'

/** Szekció-fejléc: számozott kör + cím — a form 3 lépését vizuálisan tagolja. */
function SectionHeading({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
        {step}
      </span>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  )
}

/** Nagy összeg-mező RON utótaggal — jobbra igazítva, kiemelt tipográfiával. */
function AmountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={0.01}
        step={0.01}
        value={value || ''}
        onChange={event => onChange(Number(event.target.value))}
        placeholder="0.00"
        className={
          'h-12 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-14 text-right text-xl font-bold tabular-nums text-slate-800 shadow-sm transition ' +
          'placeholder:font-normal placeholder:text-slate-300 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25'
        }
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
        RON
      </span>
    </div>
  )
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
  const [datum, setDatum] = useState(localTodayIso())
  const [categoryValue, setCategoryValue] = useState<number | '' | SpecialExpenseCategory>('')
  const [partner, setPartner] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [documentNumber, setDocumentNumber] = useState('')
  const [receiptType, setReceiptType] = useState<(typeof RECEIPT_TYPES)[number]>('Készpénz')
  const [note, setNote] = useState('')
  const [selectedBank, setSelectedBank] = useState('')
  const [dateError, setDateError] = useState('')
  const [batchRows, setBatchRows] = useState<BatchExpenseRow[]>([createBatchExpenseRow()])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      setMode('single')
      setLoading(false)
      setDatum(localTodayIso())
      setCategoryValue('')
      setPartner('')
      setAmount(0)
      setDocumentNumber('')
      setReceiptType('Készpénz')
      setNote('')
      setSelectedBank('')
      setDateError('')
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
    const today = localTodayIso()
    setDateError(value > today ? 'Jövőbeli dátum nem engedélyezett.' : '')
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
    // 2026-07-10 (S4-#6 FIX): a megkezdett, de érvénytelen sorok eddig NÉMÁN
    // kimaradtak a mentésből — mostantól hibával jelezzük, melyik sor hiányos.
    const isRowTouched = (row: BatchExpenseRow) =>
      row.categoryId !== '' ||
      row.amount.trim() !== '' ||
      row.partner.trim() !== '' ||
      row.documentNumber.trim() !== '' ||
      row.note.trim() !== ''
    const isRowValid = (row: BatchExpenseRow) => row.categoryId !== '' && Number(row.amount) > 0

    const invalidRowNumbers = batchRows
      .map((row, index) => (isRowTouched(row) && !isRowValid(row) ? index + 1 : null))
      .filter((n): n is number => n !== null)
    if (invalidRowNumbers.length > 0) {
      onToast(
        'error',
        `Hiányos sor: ${invalidRowNumbers.join(', ')}. — kategória és pozitív összeg kötelező (vagy ürítsd ki a sort).`,
      )
      return
    }

    const normalizedRows = batchRows.filter(isRowValid).map(row => {
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

  return (
    <div className="space-y-4 px-4 pb-6 pt-4 sm:px-6">
      {/* Mód-váltó — min. 40px érintőfelület mobilra */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium transition ${
            mode === 'single'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
          }`}
          onClick={() => setMode('single')}
        >
          Egyesével
        </button>
        <button
          type="button"
          className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium transition ${
            mode === 'table'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
          }`}
          onClick={() => setMode('table')}
        >
          Táblázatos bevitel
        </button>
      </div>

      {mode === 'single' ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="divide-y divide-slate-100">
            {/* ── 1. szekció: Mi történt? ─────────────────────────── */}
            <section className="space-y-3 pb-4">
              <SectionHeading step="1" title="Mi történt?" hint="jogcím, összeg, dátum" />

              <div className="space-y-1.5">
                <label className={labelClass}>Kategória (jogcím) *</label>
                <select
                  value={categoryValue}
                  onChange={event =>
                    setCategoryValue(
                      event.target.value === SPECIAL_BANK_WITHDRAWAL
                        ? SPECIAL_BANK_WITHDRAWAL
                        : Number(event.target.value) || '',
                    )
                  }
                  className={inputClass + ' h-11'}
                >
                  <option value="">— Válasszon: mire ment el a pénz? —</option>
                  <option value={SPECIAL_BANK_WITHDRAWAL}>Bankból kivétel (belső átvezetés)</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.kod} — {category.nev}
                    </option>
                  ))}
                </select>
              </div>

              {/* S4-#6: feltűnő magyarázó sáv a speciális módhoz */}
              {isBankWithdrawal && (
                <div className="flex items-start gap-3 rounded-xl border border-violet-300 bg-violet-50 px-4 py-3">
                  <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-violet-600" />
                  <div>
                    <p className="text-sm font-semibold text-violet-900">
                      Ez nem kiadás — belső átvezetés
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-violet-800/80">
                      A pénz a bankszámláról a kasszába kerül. A mentés egy összekapcsolt
                      kiadás–bevétel párt hoz létre, a gyülekezet összkiadását nem növeli.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass}>Összeg *</label>
                  <AmountInput value={amount} onChange={setAmount} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Dátum *</label>
                  <input
                    className={inputClass + ' h-12'}
                    type="date"
                    value={datum}
                    onChange={event => checkDate(event.target.value)}
                  />
                  {dateError && (
                    <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      {dateError}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {isBankWithdrawal ? (
              /* ── Speciális mód: bankból kivétel részletei ──────── */
              <section className="space-y-3 pt-4">
                <SectionHeading step="2" title="Honnan jött a pénz?" />
                <div className="grid gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Melyik bankból történt a kivétel? *</label>
                    <select
                      value={selectedBank}
                      onChange={event => setSelectedBank(event.target.value)}
                      className={inputClass}
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
                    <label className={labelClass}>Megjegyzés</label>
                    <textarea
                      className={textareaClass}
                      value={note}
                      onChange={event => setNote(event.target.value)}
                      placeholder="Pl. napi készpénzfelvétel a bankból."
                    />
                  </div>
                </div>
              </section>
            ) : (
              <>
                {/* ── 2. szekció: Kinek fizettünk? ──────────────────── */}
                <section className="space-y-3 pb-4 pt-4">
                  <SectionHeading step="2" title="Kinek fizettünk?" hint="opcionális" />
                  <div className="space-y-1.5">
                    <label className={labelClass}>Kedvezményezett / Partner</label>
                    <input
                      className={inputClass}
                      value={partner}
                      onChange={event => setPartner(event.target.value)}
                      placeholder="Pl. Barkács Kft., villanyszerelő, Electrica…"
                    />
                    <p className="text-[11px] leading-snug text-slate-500">
                      Kinek vagy milyen cégnek ment ki a pénz — a későbbi visszakereséshez hasznos.
                    </p>
                  </div>
                </section>

                {/* ── 3. szekció: Részletek ─────────────────────────── */}
                <section className="space-y-3 pt-4">
                  <SectionHeading step="3" title="Részletek" hint="bizonylat, megjegyzés" />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={labelClass}>Iratszám</label>
                      <input
                        className={inputClass + ' font-mono'}
                        value={documentNumber}
                        onChange={event => setDocumentNumber(event.target.value)}
                        placeholder="Pl. számla- vagy nyugtaszám"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass}>Bizonylat típusa *</label>
                      <select
                        value={receiptType}
                        onChange={event => setReceiptType(event.target.value as (typeof RECEIPT_TYPES)[number])}
                        className={inputClass}
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
                      className={textareaClass}
                      value={note}
                      onChange={event => setNote(event.target.value)}
                      placeholder="Kiegészítő információ a kiadásról (nem kötelező)."
                    />
                  </div>
                </section>
              </>
            )}
          </div>

          {/* ── Gyors ellenőrzés (jobb oszlop) ──────────────────── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Gyors ellenőrzés</p>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span>Rögzítési mód</span>
                  <strong className="text-right">{isBankWithdrawal ? 'Belső átvezetés (bankból kivétel)' : 'Kiadási tétel'}</strong>
                </div>
                {selectedCategory && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span>Kategória</span>
                    <strong className="text-right">{selectedCategory.nev}</strong>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span>Összeg</span>
                  <strong className={amount > 0 ? 'tabular-nums text-rose-700' : ''}>
                    {amount > 0 ? `${amount.toFixed(2)} RON` : 'Nincs megadva'}
                  </strong>
                </div>
                {isBankWithdrawal && selectedBank && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span>Forrás bankszámla</span>
                    <strong className="text-right">{bankAccounts.find(account => String(account.id) === selectedBank)?.bank_neve || '—'}</strong>
                  </div>
                )}
                {isInventory && !isBankWithdrawal && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                    Ez a kategória leltári tételhez kapcsolódhat, ezért a mentés leltári nyomot is hagyhat.
                  </div>
                )}
                {isBankWithdrawal && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-800">
                    Belső átvezetés: a bankból kikerülő és a kasszába beérkező oldal
                    összekapcsolva, egy mentéssel jön létre.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Batch-tábla — mobilon vízszintesen görgethető */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1280px] table-fixed text-sm">
              <colgroup>
                <col style={{ width: '130px' }} />
                <col style={{ width: '240px' }} />
                <col style={{ width: '240px' }} />
                <col style={{ width: '130px' }} />
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
                  <th className="px-3 py-3 text-right text-xs font-medium">Összeg (RON)</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Iratszám</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Típus</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Megjegyzés</th>
                  <th className="px-3 py-3 text-right text-xs font-medium">
                    <span className="sr-only">Műveletek</span>—
                  </th>
                </tr>
              </thead>
              <tbody>
                {batchRows.map(row => (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className="px-2 py-2">
                      <input
                        className={inputClass + ' px-2'}
                        type="date"
                        value={row.datum}
                        onChange={event => updateBatchRow(row.key, { datum: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.categoryId}
                        onChange={event => updateBatchRow(row.key, { categoryId: Number(event.target.value) || '' })}
                        className={inputClass + ' px-2'}
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
                      <input
                        className={inputClass + ' px-2'}
                        value={row.partner}
                        onChange={event => updateBatchRow(row.key, { partner: event.target.value })}
                        placeholder="Szolgáltató / kedvezményezett"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass + ' px-2 text-right font-semibold tabular-nums'}
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step={0.01}
                        value={row.amount}
                        onChange={event => updateBatchRow(row.key, { amount: event.target.value })}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass + ' px-2 font-mono'}
                        value={row.documentNumber}
                        onChange={event => updateBatchRow(row.key, { documentNumber: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.receiptType}
                        onChange={event => updateBatchRow(row.key, { receiptType: event.target.value as (typeof RECEIPT_TYPES)[number] })}
                        className={inputClass + ' px-2'}
                      >
                        {RECEIPT_TYPES.map(type => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass + ' px-2'}
                        value={row.note}
                        onChange={event => updateBatchRow(row.key, { note: event.target.value })}
                        placeholder="Megjegyzés (opcionális)"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => removeBatchRow(row.key)}
                        title="Sor eltávolítása"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 shrink-0 text-slate-400" />
              Egy mentéssel több kiadási sort rögzíthet. A bankból kivétel opció itt nem batch, hanem egyesével használható.
            </div>
            <button
              type="button"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={addBatchRow}
            >
              <Plus className="size-4" />
              Új sor
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => onClose()}
        >
          Mégse
        </button>
        <button
          type="button"
          className="min-h-[44px] flex-[2] rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void (mode === 'single' ? handleSingleSubmit() : handleBatchSubmit())}
          // S4-#6 FIX: a dátum-hiba csak egyesével módban tilt (a táblázatos
          // soroknak saját dátumuk van).
          disabled={loading || (mode === 'single' && dateError.length > 0)}
        >
          {loading
            ? 'Mentés…'
            : mode === 'table'
              ? 'Táblázat mentése'
              : isBankWithdrawal
                ? 'Belső átvezetés mentése'
                : 'Kiadás mentése'}
        </button>
      </div>
    </div>
  )
}
