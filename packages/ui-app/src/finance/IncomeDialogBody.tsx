'use client'

/**
 * Bevétel-rögzítő dialog body — Sprint Q F3.2 (v0.7.11).
 *
 * 2026-07-10 (S4-#6): teljes vizuális újratervezés + működés-ellenőrzés.
 *   - Szekciók: „Mi történt?" (kategória + összeg + dátum kiemelten),
 *     „Ki fizetett?" (befizető), „Részletek" (iratszám, típus, megjegyzés)
 *     — halvány elválasztókkal, lépés-számozással.
 *   - Speciális mód (bankba letét) feltűnő, égszínkék magyarázó sávot kap:
 *     „Ez nem bevétel — belső átvezetés".
 *   - Látható input-mezők (rounded-lg + border-slate-300 + shadow-sm + fókusz-gyűrű),
 *     nagy, jobbra igazított összeg-mező RON utótaggal.
 *   - Mobil (375px): minden szekció 1 oszlopra esik, a batch-tábla görgethető,
 *     min. 40px érintőfelületek.
 *   - FIX: a „korábbi dátum" figyelmeztetés eddig letiltotta a mentést —
 *     mostantól csak a jövőbeli dátum (valódi hiba) tilt, és az is csak
 *     egyesével módban (a táblázatos soroknak saját dátumuk van).
 *   - FIX: batch-mentésnél a hiányos (megkezdett, de érvénytelen) sorok eddig
 *     némán kimaradtak — mostantól hibaüzenet sorolja fel őket.
 *   - FIX: a „Fizetett év" mező szerkeszthetetlen volt (gépelés közben
 *     visszaugrott) — string state + mentéskori NaN-védett konverzió.
 *
 * A webes `apps/web/components/modals/income-dialog-v3.tsx`-ből kiemelve a
 * sharedba, iOS-future-proof módon (callback prop-pattern + body-pattern).
 * A Dialog shell (DialogContent / DialogHeader / DialogTitle) a webes
 * wrapper-ben marad — ide a tartalom-rész (form + táblázat + akció-gombok)
 * kerül.
 *
 * Működés:
 *   - egyesével: kategória + személy/cég + összeg + iratszám + típus + megjegyzés
 *   - táblázatosan: több sor egyszerre, batch-mentéssel
 *   - speciális mód: bankba letét → belső mozgás (kassza → bank)
 *   - bérleti quick-pick: aktív szerződés választása auto-tölt
 *   - kapcsolt leltári alapeszköz: leltári kategóriáknál checkbox + form
 *
 * Server action-ök callback prop-ként (10):
 *   onSaveIncome, onSaveIncomeBatch, onSaveIncomeWithLinkedInventory,
 *   onSaveInternalTransfer, onGetNextReceiptNumber, onGetLastRecordedDate,
 *   onSearchMembers, onGetFamilyIdForPerson, onCheckReceiptDuplicate,
 *   onGetRentalContracts
 */

import { useEffect, useMemo, useState } from 'react'
import { localTodayIso } from '@kartoteka/validations'
import { ArrowLeftRight, Building2, Landmark, Plus, Search, Trash2, X } from 'lucide-react'
import type { BankAccount, RentalContractRow } from './types'
import {
  RECEIPT_TYPES,
  RENTAL_SZAMADASICEL_MAP,
  RENTAL_TIPUS_LABELS,
  RENTAL_FREQ_LABELS,
} from './types'
import { isInventoryCategory, calculateEvesDij } from './helpers'
import {
  INVENTORY_AMORTIZATION_CATALOG,
  getInventoryAmortizationCatalogEntry,
} from './inventory'

// ── Típusok ──────────────────────────────────────────────────

export interface IncomeCategory {
  id: number
  kod: string
  nev: string
}

export interface IncomeSearchResult {
  id: number
  csaladnev: string
  k_nev: string
}

export interface SaveIncomePayload {
  osszeg: number
  datum: string
  id_befizetescel: number
  id_szemely: number | null
  id_csalad: number | null
  forrasa: string | null
  iratszam: string | null
  irattipus: string // #5: szabad szöveges bizonylattípus (Chitanță/Factură/Készpénz/…)
  fizetettev: number | null
  megjegyzes: string | null
}

export interface SaveIncomeBatchRow {
  datum: string
  id_befizetescel: number
  forrasa: string | null
  osszeg: number
  iratszam: string | null
  irattipus: string // #5: szabad szöveges bizonylattípus (Chitanță/Factură/Készpénz/…)
  fizetettev: number | null
  megjegyzes: string | null
  /** #3 (2026-06-20): gyülekezeti saját sorszám (a kerületi = iratszam mellett) → befizetes.nyugta. */
  nyugta?: string | null
  /** B1 (2026-06-11): a befizetés tag-kapcsolata (kölcsönösen kizáró a családdal). */
  id_szemely?: number | null
  /** B1: családi befizetésnél a család azonosítója. */
  id_csalad?: number | null
  /** P4-30 (audit 2026-08-28): banki bizonylatnál (Ordin de plată) az érintett
   *  bankszámla — enélkül a tétel a KASSZÁBA sorolódott (kassza = bankszamla_id
   *  IS NULL a kanonikus szabály szerint). null = készpénz. */
  bankszamla_id?: number | null
}

export interface SaveLinkedInventoryPayload {
  megnevezes: string
  helyszin: string | null
  felelos_nev: string | null
  katalogus_kod: string | null
  hasznalati_ido: number | null
  megjegyzes: string | null
}

export interface SaveIncomeInternalTransferPayload {
  tipus: 'kassza_bank'
  datum: string
  forras: string
  cel: string
  osszeg: number
  megjegyzes: string
}

export type IncomeToastFn = (
  type: 'success' | 'error' | 'warning',
  message: string,
) => void

export interface IncomeDialogBodyProps {
  open: boolean
  onClose: () => void
  categories: IncomeCategory[]
  bankAccounts: BankAccount[]
  currentYear: number
  yearlyFee: number
  /** Egyetlen bevétel mentése. */
  onSaveIncome: (
    payload: SaveIncomePayload,
  ) => Promise<{ error?: string | null }>
  /** Bevétel + kapcsolt leltári alapeszköz mentése. */
  onSaveIncomeWithLinkedInventory: (
    income: SaveIncomePayload,
    inventory: SaveLinkedInventoryPayload,
  ) => Promise<{ error?: string | null }>
  /** Táblázatos batch-mentés. */
  onSaveIncomeBatch: (
    rows: SaveIncomeBatchRow[],
  ) => Promise<{ error?: string | null }>
  /** Belső mozgás — készpénz letéve a bankba. */
  onSaveInternalTransfer: (
    payload: SaveIncomeInternalTransferPayload,
  ) => Promise<{ error?: string | null }>
  /** Következő iratszám lekérése (year-bound). */
  onGetNextReceiptNumber: (year: number) => Promise<number>
  /** Legutóbbi rögzített dátum (figyelmeztetéshez). */
  onGetLastRecordedDate: () => Promise<string | null>
  /** Tag-keresés a befizető-mezőhöz. */
  onSearchMembers: (query: string) => Promise<IncomeSearchResult[]>
  /** Tagból családi ID lekérése (kapcsolt mentéshez). */
  onGetFamilyIdForPerson: (personId: number) => Promise<number | null>
  /** Iratszám-duplikáció ellenőrzés. */
  onCheckReceiptDuplicate: (documentNumber: string) => Promise<boolean>
  /** Aktív bérleti szerződések listája (quick-pick-hez). */
  onGetRentalContracts: (
    includeArchived: boolean,
  ) => Promise<{ data?: RentalContractRow[] | null; error?: string | null }>
  /** Toast callback — wrapper sonner / Tauri-toast / iOS UIAlertController. */
  onToast: IncomeToastFn
}

type EntryMode = 'single' | 'table'
type SpecialIncomeCategory = '__deposit_to_bank__'

const SPECIAL_BANK_DEPOSIT: SpecialIncomeCategory = '__deposit_to_bank__'

type BatchIncomeRow = {
  key: string
  datum: string
  categoryId: number | ''
  source: string
  amount: string
  documentNumber: string
  receiptType: (typeof RECEIPT_TYPES)[number]
  paidYear: string
  note: string
}

function createBatchIncomeRow(currentYear: number): BatchIncomeRow {
  return {
    key: crypto.randomUUID(),
    datum: localTodayIso(),
    categoryId: '',
    source: '',
    amount: '',
    documentNumber: '',
    receiptType: 'Készpénz',
    paidYear: String(currentYear),
    note: '',
  }
}

// ── Közös stílusok (S4-#6) — látható mezők + emerald fókusz-gyűrű ───────────

const inputClass =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm transition ' +
  'placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25'

const textareaClass =
  'min-h-[80px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition ' +
  'placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25'

const labelClass = 'text-sm font-medium text-slate-700'

/** Szekció-fejléc: számozott kör + cím — a form 3 lépését vizuálisan tagolja. */
function SectionHeading({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
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
          'placeholder:font-normal placeholder:text-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25'
        }
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
        RON
      </span>
    </div>
  )
}

// ── UI komponens ─────────────────────────────────────────────

export function IncomeDialogBody({
  open,
  onClose,
  categories,
  bankAccounts,
  currentYear,
  yearlyFee,
  onSaveIncome,
  onSaveIncomeWithLinkedInventory,
  onSaveIncomeBatch,
  onSaveInternalTransfer,
  onGetNextReceiptNumber,
  onGetLastRecordedDate,
  onSearchMembers,
  onGetFamilyIdForPerson,
  onCheckReceiptDuplicate,
  onGetRentalContracts,
  onToast,
}: IncomeDialogBodyProps) {
  const [mode, setMode] = useState<EntryMode>('single')
  const [loading, setLoading] = useState(false)
  const [datum, setDatum] = useState(localTodayIso())
  const [categoryValue, setCategoryValue] = useState<number | '' | SpecialIncomeCategory>('')
  const [personId, setPersonId] = useState<number | null>(null)
  const [personName, setPersonName] = useState('')
  const [familyId, setFamilyId] = useState<number | null>(null)
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState(yearlyFee || 0)
  const [documentNumber, setDocumentNumber] = useState('')
  const [receiptBadge, setReceiptBadge] = useState('')
  const [receiptType, setReceiptType] = useState<(typeof RECEIPT_TYPES)[number]>('Készpénz')
  // 2026-07-10 (S4-#6 FIX): string state — a Number(...) || currentYear minta
  // gépelés közben visszaugrasztotta az értéket, a mező nem volt szerkeszthető.
  const [paidYear, setPaidYear] = useState(String(currentYear))
  const [note, setNote] = useState('')
  const [selectedBank, setSelectedBank] = useState('')
  const [createInventoryAsset, setCreateInventoryAsset] = useState(false)
  const [inventoryName, setInventoryName] = useState('')
  const [inventoryLocation, setInventoryLocation] = useState('')
  const [inventoryResponsible, setInventoryResponsible] = useState('')
  const [inventoryCatalogCode, setInventoryCatalogCode] = useState('')
  const [inventoryUsefulLife, setInventoryUsefulLife] = useState<number | ''>('')
  const [inventoryNote, setInventoryNote] = useState('')
  // 2026-07-10 (S4-#6 FIX): a korábbi egyetlen dateBadge a "korábbi dátum"
  // FIGYELMEZTETÉSSEL is letiltotta a mentés-gombot — pedig visszadátumozni
  // legitim művelet. Szétválasztva: dateError (jövőbeli dátum → tilt),
  // dateWarning (csak tájékoztat).
  const [dateError, setDateError] = useState('')
  const [dateWarning, setDateWarning] = useState('')
  const [lastRecordedDate, setLastRecordedDate] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<IncomeSearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [batchRows, setBatchRows] = useState<BatchIncomeRow[]>([createBatchIncomeRow(currentYear)])

  // Bérleti quick-pick (B1.7)
  const [rentalContracts, setRentalContracts] = useState<RentalContractRow[]>([])
  const [selectedRentalId, setSelectedRentalId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setMode('single')
      setLoading(false)
      setDatum(localTodayIso())
      setCategoryValue('')
      setPersonId(null)
      setPersonName('')
      setFamilyId(null)
      setSource('')
      setAmount(yearlyFee || 0)
      setDocumentNumber('')
      setReceiptBadge('')
      setReceiptType('Készpénz')
      setPaidYear(String(currentYear))
      setNote('')
      setSelectedBank('')
      setCreateInventoryAsset(false)
      setInventoryName('')
      setInventoryLocation('')
      setInventoryResponsible('')
      setInventoryCatalogCode('')
      setInventoryUsefulLife('')
      setInventoryNote('')
      setDateError('')
      setDateWarning('')
      setSearchQuery('')
      setSearchResults([])
      setShowResults(false)
      setBatchRows([createBatchIncomeRow(currentYear)])
      setSelectedRentalId('')
    })

    onGetNextReceiptNumber(currentYear).then(nextNumber => {
      if (!cancelled) setDocumentNumber(String(nextNumber))
    })
    onGetLastRecordedDate().then(lastDate => {
      if (!cancelled) setLastRecordedDate(lastDate)
    })

    // Bérleti szerződések lekérése a quick-pick-hez (csak aktívak)
    onGetRentalContracts(false).then(result => {
      if (!cancelled && result.data) setRentalContracts(result.data)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentYear, yearlyFee])

  const selectedCategory = useMemo(
    () => (typeof categoryValue === 'number' ? categories.find(category => category.id === categoryValue) || null : null),
    [categories, categoryValue],
  )

  const selectedCatalogEntry = useMemo(
    () => getInventoryAmortizationCatalogEntry(inventoryCatalogCode || null),
    [inventoryCatalogCode],
  )

  const isBankDeposit = categoryValue === SPECIAL_BANK_DEPOSIT
  const shouldOfferInventory = selectedCategory ? isInventoryCategory(selectedCategory.nev) : false

  // Befizető kötelezőségi jelzés (banki átutalásnál gyakran cég a forrás)
  const isBanki = receiptType === 'Banki'
  const isJarulek = (selectedCategory?.kod || '').startsWith('101.01')
  const personRequired = !isBanki || isJarulek

  function updateBatchRow(key: string, patch: Partial<BatchIncomeRow>) {
    setBatchRows(rows => rows.map(row => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addBatchRow() {
    setBatchRows(rows => [...rows, createBatchIncomeRow(currentYear)])
  }

  function removeBatchRow(key: string) {
    setBatchRows(rows => (rows.length === 1 ? rows : rows.filter(row => row.key !== key)))
  }

  function checkDate(value: string) {
    setDatum(value)
    const today = localTodayIso()
    if (value > today) {
      setDateError('Jövőbeli dátum nem engedélyezett.')
      setDateWarning('')
      return
    }
    setDateError('')
    setDateWarning(
      lastRecordedDate && value < lastRecordedDate
        ? `Figyelem: korábbi, mint az utolsó rögzítés (${lastRecordedDate}) — menthető, csak ellenőrizd.`
        : '',
    )
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    setSource(value)
    if (value.trim().length < 2) {
      setShowResults(false)
      return
    }

    const results = await onSearchMembers(value)
    setSearchResults(results)
    setShowResults(true)
  }

  async function selectPerson(result: IncomeSearchResult) {
    const fullName = `${result.csaladnev} ${result.k_nev}`
    setPersonId(result.id)
    setPersonName(fullName)
    setSource(fullName)
    setSearchQuery(fullName)
    setShowResults(false)
    const resolvedFamilyId = await onGetFamilyIdForPerson(result.id)
    setFamilyId(resolvedFamilyId)
    if (!inventoryResponsible) {
      setInventoryResponsible(fullName)
    }
  }

  // ── Bérleti quick-pick (B1.7) ──────────────────────────────
  function handleRentalPick(contractId: string) {
    if (!contractId) {
      clearRentalPick()
      return
    }
    const contract = rentalContracts.find(c => c.id === contractId)
    if (!contract) return

    // Kategória lookup: a 104.04 / 104.05 kódú befizetéscel megkeresése
    const targetKod = RENTAL_SZAMADASICEL_MAP[contract.tipus] // '104.05' vagy '104.04'
    const matchedCategory = categories.find(c => c.kod === targetKod)
    if (!matchedCategory) {
      onToast(
        'warning',
        `Nincs ${targetKod} kódú befizetéskategória beállítva — a kategória mezőt kézzel kell választanod.`,
      )
    } else {
      setCategoryValue(matchedCategory.id)
    }

    // Összeg: havi cikulus → havi díj, éves → éves díj. A user override-olhatja.
    const javasoltOsszeg =
      contract.fizetesi_ciklus === 'havi'
        ? Number(contract.osszeg) // havi díj
        : calculateEvesDij(contract) // éves díj
    setAmount(javasoltOsszeg)

    // Bérlő: ha van id_szemely (tag), beállítjuk a person mezőket;
    // egyébként csak a name kerül a forrasa (source) mezőbe
    if (contract.id_szemely) {
      setPersonId(contract.id_szemely)
      setPersonName(contract.berlo_nev)
      setSearchQuery(contract.berlo_nev)
    } else {
      setPersonId(null)
      setPersonName('')
      setSearchQuery('')
    }
    setSource(contract.berlo_nev)
    setShowResults(false)

    setSelectedRentalId(contractId)
  }

  function clearRentalPick() {
    setSelectedRentalId('')
  }

  async function checkDocumentNumber(value: string) {
    setDocumentNumber(value)
    if (!value.trim()) {
      setReceiptBadge('')
      return
    }
    const isDuplicate = await onCheckReceiptDuplicate(value)
    setReceiptBadge(isDuplicate ? 'Már létezik ilyen iratszám.' : '')
  }

  async function handleSingleSubmit() {
    if (isBankDeposit) {
      if (!selectedBank) {
        onToast('error', 'Válassza ki, melyik bankba lett letéve az összeg.')
        return
      }
      if (amount <= 0) {
        onToast('error', 'Az összeg pozitív szám kell legyen.')
        return
      }

      setLoading(true)
      const result = await onSaveInternalTransfer({
        tipus: 'kassza_bank',
        datum,
        forras: 'kassza',
        cel: selectedBank,
        osszeg: amount,
        megjegyzes: note || source || 'Letéve a bankba',
      })

      if (result.error) {
        onToast('error', result.error)
      } else {
        onToast('success', 'A bankba tett készpénz sikeresen rögzítve.')
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
    if (createInventoryAsset && !inventoryName.trim()) {
      onToast('error', 'A kapcsolt leltári alapeszköz megnevezése kötelező.')
      return
    }

    setLoading(true)
    // 2026-07-10 (S4-#6 FIX): NaN-védett fizetettev-konverzió (üres → null,
    // a server ilyenkor a dátum évét használja).
    const paidYearNum = Number(paidYear)
    const incomePayload: SaveIncomePayload = {
      osszeg: amount,
      datum,
      id_befizetescel: selectedCategory.id,
      id_szemely: personId,
      id_csalad: familyId,
      forrasa: source || null,
      iratszam: documentNumber || null,
      irattipus: receiptType,
      fizetettev: paidYear.trim() && Number.isFinite(paidYearNum) ? paidYearNum : null,
      megjegyzes: note || null,
    }

    const result = createInventoryAsset
      ? await onSaveIncomeWithLinkedInventory(incomePayload, {
          megnevezes: inventoryName.trim(),
          helyszin: inventoryLocation || null,
          felelos_nev: inventoryResponsible || null,
          katalogus_kod: inventoryCatalogCode || null,
          hasznalati_ido: inventoryUsefulLife === '' ? null : Number(inventoryUsefulLife),
          megjegyzes: inventoryNote || null,
        })
      : await onSaveIncome(incomePayload)

    if (result.error) {
      onToast('error', result.error)
    } else {
      onToast(
        'success',
        createInventoryAsset
          ? 'Bevétel és kapcsolt alapeszköz sikeresen rögzítve.'
          : 'Bevétel sikeresen rögzítve.',
      )
      onClose()
    }
    setLoading(false)
  }

  async function handleBatchSubmit() {
    // 2026-07-10 (S4-#6 FIX): a megkezdett, de érvénytelen sorok eddig NÉMÁN
    // kimaradtak a mentésből — mostantól hibával jelezzük, melyik sor hiányos.
    const isRowTouched = (row: BatchIncomeRow) =>
      row.categoryId !== '' ||
      row.amount.trim() !== '' ||
      row.source.trim() !== '' ||
      row.documentNumber.trim() !== '' ||
      row.note.trim() !== ''
    const isRowValid = (row: BatchIncomeRow) => row.categoryId !== '' && Number(row.amount) > 0

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
      const rowPaidYearNum = Number(row.paidYear)
      return {
        datum: row.datum,
        id_befizetescel: Number(row.categoryId),
        forrasa: row.source || null,
        osszeg: Number(row.amount),
        iratszam: row.documentNumber || null,
        irattipus: row.receiptType,
        // S4-#6 FIX: NaN sosem mehet a serverre (Number('') = 0 / Number('x') = NaN)
        fizetettev: row.paidYear.trim() && Number.isFinite(rowPaidYearNum) ? rowPaidYearNum : null,
        megjegyzes: row.note || null,
      }
    })

    if (normalizedRows.length === 0) {
      onToast('error', 'Legalább egy kitöltött bevételi sor szükséges.')
      return
    }

    setLoading(true)
    const result = await onSaveIncomeBatch(normalizedRows)
    if (result.error) {
      onToast('error', result.error)
    } else {
      onToast('success', `${normalizedRows.length} bevételi sor sikeresen mentve.`)
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
          onClick={() => setMode('single')}
          className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium transition ${
            mode === 'single'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
          }`}
        >
          Egyesével
        </button>
        <button
          type="button"
          onClick={() => setMode('table')}
          className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium transition ${
            mode === 'table'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
          }`}
        >
          Táblázatos bevitel
        </button>
      </div>

      {mode === 'single' ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="divide-y divide-slate-100">
            {/* B1.7 — Bérleti szerződés quick-pick (csak ha van aktív szerződés) */}
            {rentalContracts.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Building2 className="size-4 text-amber-700" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Bérleti díj rögzítése
                  </span>
                </div>
                {selectedRentalId ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                    <div className="min-w-0 flex-1">
                      {(() => {
                        const c = rentalContracts.find(r => r.id === selectedRentalId)
                        if (!c) return null
                        return (
                          <>
                            <p className="truncate text-sm font-medium text-slate-800">
                              {c.berlo_nev} — {c.targy || c.leiras.slice(0, 50)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {RENTAL_TIPUS_LABELS[c.tipus]} • {c.osszeg} RON / {RENTAL_FREQ_LABELS[c.fizetesi_ciklus]}
                            </p>
                          </>
                        )
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={clearRentalPick}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Bérleti szerződés kiválasztás törlése"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedRentalId}
                      onChange={e => handleRentalPick(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— Válassz egy aktív bérleti szerződést —</option>
                      {rentalContracts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.berlo_nev} — {c.targy || c.leiras.slice(0, 50)} ({c.osszeg} RON / {RENTAL_FREQ_LABELS[c.fizetesi_ciklus]})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-amber-700/80">
                      A kiválasztás után a kategória, összeg és bérlő automatikusan kitöltődik. Az értékeket utólag módosíthatod.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── 1. szekció: Mi történt? ─────────────────────────── */}
            <section className="space-y-3 pb-4 pt-4 first:pt-0">
              <SectionHeading step="1" title="Mi történt?" hint="jogcím, összeg, dátum" />

              <div className="space-y-1.5">
                <label className={labelClass}>Kategória (jogcím) *</label>
                <select
                  value={categoryValue}
                  onChange={event =>
                    setCategoryValue(
                      event.target.value === SPECIAL_BANK_DEPOSIT
                        ? SPECIAL_BANK_DEPOSIT
                        : Number(event.target.value) || '',
                    )
                  }
                  className={inputClass + ' h-11'}
                >
                  <option value="">— Válasszon: mire érkezett a pénz? —</option>
                  <option value={SPECIAL_BANK_DEPOSIT}>Letéve a bankba (belső átvezetés)</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.kod} — {category.nev}
                    </option>
                  ))}
                </select>
              </div>

              {/* S4-#6: feltűnő magyarázó sáv a speciális módhoz */}
              {isBankDeposit && (
                <div className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3">
                  <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-sky-600" />
                  <div>
                    <p className="text-sm font-semibold text-sky-900">
                      Ez nem bevétel — belső átvezetés
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-sky-800/80">
                      A készpénz a kasszából a bankszámlára kerül. A mentés egy összekapcsolt
                      kiadás–bevétel párt hoz létre, a gyülekezet összbevételét nem növeli.
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
                    type="date"
                    value={datum}
                    onChange={event => checkDate(event.target.value)}
                    className={inputClass + ' h-12'}
                  />
                  {dateError && (
                    <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      {dateError}
                    </span>
                  )}
                  {!dateError && dateWarning && (
                    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      {dateWarning}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {isBankDeposit ? (
              /* ── Speciális mód: bankba letét részletei ─────────── */
              <section className="space-y-3 pt-4">
                <SectionHeading step="2" title="Hová került a pénz?" />
                <div className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Melyik bankba lett letéve? *</label>
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
                      value={note}
                      onChange={event => setNote(event.target.value)}
                      placeholder="Pl. vasárnapi készpénz befizetve a bankba."
                      className={textareaClass}
                    />
                  </div>
                </div>
              </section>
            ) : (
              <>
                {/* ── 2. szekció: Ki fizetett? ──────────────────────── */}
                <section className="relative space-y-2 pb-4 pt-4">
                  <SectionHeading
                    step="2"
                    title="Ki fizetett?"
                    hint={personRequired ? undefined : 'opcionális'}
                  />
                  <div className="space-y-1.5">
                    <label className={labelClass + ' flex flex-wrap items-center gap-2'}>
                      Befizető (személy / cég)
                      {!personRequired && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                          opcionális
                        </span>
                      )}
                      {personRequired && isJarulek && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          járulékhoz kötelező
                        </span>
                      )}
                    </label>
                    {!personRequired && (
                      <p className="text-[11px] leading-snug text-slate-500">
                        Átutalás esetén gyakran cég/szervezet a forrás — elég a nevet beírni,
                        nem kell személyt kiválasztani. Ha tag fizet (pl. járulék), keresd ki a névből.
                      </p>
                    )}
                    <div className="relative">
                      <input
                        value={searchQuery}
                        onChange={event => void handleSearch(event.target.value)}
                        placeholder="Kezdj el gépelni egy nevet, vagy írd be a cég/szervezet nevét…"
                        className={inputClass + ' pl-9'}
                      />
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    </div>
                    {personId ? (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          {personName}
                        </span>
                        <button
                          type="button"
                          className="min-h-[32px] text-xs text-slate-500 underline"
                          onClick={() => {
                            setPersonId(null)
                            setPersonName('')
                            setFamilyId(null)
                          }}
                        >
                          Kapcsolat törlése
                        </button>
                      </div>
                    ) : null}
                    {showResults && searchResults.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                        {searchResults.map(result => {
                          const fullName = `${result.csaladnev} ${result.k_nev}`
                          return (
                            <button
                              key={result.id}
                              type="button"
                              className="flex min-h-[40px] w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                              onClick={() => void selectPerson(result)}
                            >
                              <span>{fullName}</span>
                              <span className="text-xs text-slate-400">ID {result.id}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* ── 3. szekció: Részletek ─────────────────────────── */}
                <section className="space-y-3 pt-4">
                  <SectionHeading step="3" title="Részletek" hint="bizonylat, megjegyzés" />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={labelClass}>Iratszám</label>
                      <input
                        value={documentNumber}
                        onChange={event => void checkDocumentNumber(event.target.value)}
                        placeholder="Pl. 128"
                        className={inputClass + ' font-mono'}
                      />
                      {receiptBadge && (
                        <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          {receiptBadge}
                        </span>
                      )}
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

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={labelClass}>Fizetett év</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={paidYear}
                        onChange={event => setPaidYear(event.target.value)}
                        placeholder={String(currentYear)}
                        className={inputClass}
                      />
                      <p className="text-[11px] text-slate-400">
                        Melyik évre szól a befizetés (pl. tavalyi járulék pótlása).
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelClass}>Megjegyzés</label>
                    <textarea
                      value={note}
                      onChange={event => setNote(event.target.value)}
                      placeholder="Kiegészítő információ a bevételhez (nem kötelező)."
                      className={textareaClass}
                    />
                  </div>

                  {shouldOfferInventory && (
                    <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">Kapcsolt leltári alapeszköz</p>
                          <p className="text-xs text-emerald-700/80">
                            Csak akkor jelenik meg, ha a bevételi kategória leltári tárgy vásárlásához vagy eladásához köthető.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={createInventoryAsset}
                          onChange={event => setCreateInventoryAsset(event.target.checked)}
                          className="size-5 shrink-0 accent-emerald-600"
                        />
                      </div>

                      {createInventoryAsset && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className={labelClass}>Megnevezés *</label>
                            <input
                              value={inventoryName}
                              onChange={event => setInventoryName(event.target.value)}
                              placeholder="Pl. projektor, orgona-alkatrész"
                              className={inputClass}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClass}>Helyszín</label>
                            <input
                              value={inventoryLocation}
                              onChange={event => setInventoryLocation(event.target.value)}
                              placeholder="Pl. imaterem"
                              className={inputClass}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClass}>Felelős személy</label>
                            <input
                              value={inventoryResponsible}
                              onChange={event => setInventoryResponsible(event.target.value)}
                              className={inputClass}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClass}>Amortizációs kód</label>
                            <select
                              value={inventoryCatalogCode}
                              onChange={event => {
                                const value = event.target.value
                                setInventoryCatalogCode(value)
                                const entry = getInventoryAmortizationCatalogEntry(value)
                                if (entry) setInventoryUsefulLife(entry.defEv)
                              }}
                              className={inputClass}
                            >
                              <option value="">— Válasszon —</option>
                              {INVENTORY_AMORTIZATION_CATALOG.map(entry => (
                                <option key={entry.kod} value={entry.kod}>
                                  {entry.kod} — {entry.nev}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className={labelClass}>Használati idő (év)</label>
                            <input
                              type="number"
                              min={1}
                              value={inventoryUsefulLife}
                              onChange={event => setInventoryUsefulLife(Number(event.target.value) || '')}
                              className={inputClass}
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className={labelClass}>Leltári megjegyzés</label>
                            <textarea
                              value={inventoryNote}
                              onChange={event => setInventoryNote(event.target.value)}
                              className={textareaClass + ' min-h-[72px]'}
                            />
                          </div>
                          {selectedCatalogEntry && (
                            <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-600 sm:col-span-2">
                              <strong>{selectedCatalogEntry.kod}</strong> — {selectedCatalogEntry.nev}. Ajánlott használati idő: {selectedCatalogEntry.defEv} év.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                  <strong className="text-right">{isBankDeposit ? 'Belső átvezetés (bankba letét)' : 'Bevételi tétel'}</strong>
                </div>
                {selectedCategory && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span>Kategória</span>
                    <strong className="text-right">{selectedCategory.nev}</strong>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span>Összeg</span>
                  <strong className={amount > 0 ? 'tabular-nums text-emerald-700' : ''}>
                    {amount > 0 ? `${amount.toFixed(2)} RON` : 'Nincs megadva'}
                  </strong>
                </div>
                {isBankDeposit && selectedBank && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                    <span>Cél bankszámla</span>
                    <strong className="text-right">{bankAccounts.find(account => String(account.id) === selectedBank)?.bank_neve || '—'}</strong>
                  </div>
                )}
                {isBankDeposit && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
                    Belső átvezetés: a kasszából kikerülő és a bankba beérkező oldal
                    összekapcsolva, egy mentéssel jön létre.
                  </div>
                )}
                {!isBankDeposit && receiptBadge && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                    {receiptBadge}
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
            <table className="w-full min-w-[1400px] table-fixed text-sm">
              <colgroup>
                <col style={{ width: '130px' }} />
                <col style={{ width: '240px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '90px' }} />
                <col />
                <col style={{ width: '60px' }} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium">Dátum</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Kategória</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Befizető / forrás</th>
                  <th className="px-3 py-3 text-right text-xs font-medium">Összeg (RON)</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Iratszám</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Típus</th>
                  <th className="px-3 py-3 text-left text-xs font-medium">Fiz. év</th>
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
                        type="date"
                        value={row.datum}
                        onChange={event => updateBatchRow(row.key, { datum: event.target.value })}
                        className={inputClass + ' px-2'}
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
                        value={row.source}
                        onChange={event => updateBatchRow(row.key, { source: event.target.value })}
                        className={inputClass + ' px-2'}
                        placeholder="Név vagy forrás"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step={0.01}
                        value={row.amount}
                        onChange={event => updateBatchRow(row.key, { amount: event.target.value })}
                        placeholder="0.00"
                        className={inputClass + ' px-2 text-right font-semibold tabular-nums'}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.documentNumber}
                        onChange={event => updateBatchRow(row.key, { documentNumber: event.target.value })}
                        className={inputClass + ' px-2 font-mono'}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.receiptType}
                        onChange={event =>
                          updateBatchRow(row.key, {
                            receiptType: event.target.value as (typeof RECEIPT_TYPES)[number],
                          })
                        }
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
                        value={row.paidYear}
                        onChange={event => updateBatchRow(row.key, { paidYear: event.target.value })}
                        className={inputClass + ' px-2 text-center'}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.note}
                        onChange={event => updateBatchRow(row.key, { note: event.target.value })}
                        className={inputClass + ' px-2'}
                        placeholder="Megjegyzés (opcionális)"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeBatchRow(row.key)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
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
              <Landmark className="size-4 shrink-0 text-slate-400" />
              A bankba letétet itt nem batch módban, hanem az egyesével rögzítésben, a külön pénztári opcióval lehet használni.
            </div>
            <button
              type="button"
              onClick={addBatchRow}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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
          onClick={onClose}
          className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Mégse
        </button>
        <button
          type="button"
          onClick={() => void (mode === 'single' ? handleSingleSubmit() : handleBatchSubmit())}
          // S4-#6 FIX: csak a valódi dátum-HIBA tilt, és csak egyesével módban
          // (a táblázatos soroknak saját dátumuk van). A figyelmeztetés nem tilt.
          disabled={loading || (mode === 'single' && dateError.length > 0)}
          className="min-h-[44px] flex-[2] rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? 'Mentés…'
            : mode === 'table'
              ? 'Táblázat mentése'
              : isBankDeposit
                ? 'Belső átvezetés mentése'
                : 'Bevétel mentése'}
        </button>
      </div>
    </div>
  )
}
