'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Landmark, Plus, Search, Trash2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  saveIncome,
  saveIncomeBatch,
  saveIncomeWithLinkedInventory,
  saveInternalTransfer,
  getNextReceiptNumber,
  getLastRecordedDate,
  searchMembersForFinance,
  getFamilyIdForPerson,
  checkReceiptDuplicate,
  getRentalContracts,
} from '@/app/(dashboard)/penzugy/actions'
import {
  RECEIPT_TYPES,
  isInventoryCategory,
  RENTAL_SZAMADASICEL_MAP,
  RENTAL_TIPUS_LABELS,
  RENTAL_FREQ_LABELS,
  type BankAccount,
  type RentalContractRow,
} from '@/lib/constants/finance'
import { calculateEvesDij } from '@/lib/finance/rental-calculation'
import { INVENTORY_AMORTIZATION_CATALOG, getInventoryAmortizationCatalogEntry } from '@/lib/constants/inventory.next'
import { toast } from 'sonner'

interface Category {
  id: number
  kod: string
  nev: string
}

interface SearchResult {
  id: number
  csaladnev: string
  k_nev: string
}

interface IncomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  bankAccounts: BankAccount[]
  currentYear: number
  yearlyFee: number
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
    datum: new Date().toISOString().slice(0, 10),
    categoryId: '',
    source: '',
    amount: '',
    documentNumber: '',
    receiptType: 'Készpénz',
    paidYear: String(currentYear),
    note: '',
  }
}

export function IncomeDialog({ open, onOpenChange, categories, bankAccounts, currentYear, yearlyFee }: IncomeDialogProps) {
  const [mode, setMode] = useState<EntryMode>('single')
  const [loading, setLoading] = useState(false)
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [categoryValue, setCategoryValue] = useState<number | '' | SpecialIncomeCategory>('')
  const [personId, setPersonId] = useState<number | null>(null)
  const [personName, setPersonName] = useState('')
  const [familyId, setFamilyId] = useState<number | null>(null)
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState(yearlyFee || 0)
  const [documentNumber, setDocumentNumber] = useState('')
  const [receiptBadge, setReceiptBadge] = useState('')
  const [receiptType, setReceiptType] = useState<(typeof RECEIPT_TYPES)[number]>('Készpénz')
  const [paidYear, setPaidYear] = useState(currentYear)
  const [note, setNote] = useState('')
  const [selectedBank, setSelectedBank] = useState('')
  const [createInventoryAsset, setCreateInventoryAsset] = useState(false)
  const [inventoryName, setInventoryName] = useState('')
  const [inventoryLocation, setInventoryLocation] = useState('')
  const [inventoryResponsible, setInventoryResponsible] = useState('')
  const [inventoryCatalogCode, setInventoryCatalogCode] = useState('')
  const [inventoryUsefulLife, setInventoryUsefulLife] = useState<number | ''>('')
  const [inventoryNote, setInventoryNote] = useState('')
  const [dateBadge, setDateBadge] = useState('')
  const [lastRecordedDate, setLastRecordedDate] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
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
      setDatum(new Date().toISOString().slice(0, 10))
      setCategoryValue('')
      setPersonId(null)
      setPersonName('')
      setFamilyId(null)
      setSource('')
      setAmount(yearlyFee || 0)
      setDocumentNumber('')
      setReceiptBadge('')
      setReceiptType('Készpénz')
      setPaidYear(currentYear)
      setNote('')
      setSelectedBank('')
      setCreateInventoryAsset(false)
      setInventoryName('')
      setInventoryLocation('')
      setInventoryResponsible('')
      setInventoryCatalogCode('')
      setInventoryUsefulLife('')
      setInventoryNote('')
      setDateBadge('')
      setSearchQuery('')
      setSearchResults([])
      setShowResults(false)
      setBatchRows([createBatchIncomeRow(currentYear)])
      setSelectedRentalId('')
    })

    getNextReceiptNumber(currentYear).then(nextNumber => {
      if (!cancelled) setDocumentNumber(String(nextNumber))
    })
    getLastRecordedDate().then(lastDate => {
      if (!cancelled) setLastRecordedDate(lastDate)
    })

    // Bérleti szerződések lekérése a quick-pick-hez (csak aktívak)
    getRentalContracts(false).then(result => {
      if (!cancelled && result.data) setRentalContracts(result.data)
    })

    return () => {
      cancelled = true
    }
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
    const today = new Date().toISOString().slice(0, 10)
    if (value > today) {
      setDateBadge('Jövőbeli dátum nem engedélyezett.')
      return
    }
    if (lastRecordedDate && value < lastRecordedDate) {
      setDateBadge(`Figyelem: korábbi, mint ${lastRecordedDate}.`)
      return
    }
    setDateBadge('')
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    setSource(value)
    if (value.trim().length < 2) {
      setShowResults(false)
      return
    }

    const results = await searchMembersForFinance(value)
    setSearchResults(results as SearchResult[])
    setShowResults(true)
  }

  async function selectPerson(result: SearchResult) {
    const fullName = `${result.csaladnev} ${result.k_nev}`
    setPersonId(result.id)
    setPersonName(fullName)
    setSource(fullName)
    setSearchQuery(fullName)
    setShowResults(false)
    const resolvedFamilyId = await getFamilyIdForPerson(result.id)
    setFamilyId(resolvedFamilyId)
    if (!inventoryResponsible) {
      setInventoryResponsible(fullName)
    }
  }

  // ── Bérleti quick-pick (B1.7) ──────────────────────────────
  // A user kiválaszt egy aktív bérleti szerződést, és a form mezők
  // automatikusan kitöltődnek: kategória (104.04 / 104.05), összeg
  // (havi vagy éves díj), bérlő (személy ID vagy név).
  // A user a kiválasztás után még felülbírálhatja az értékeket.

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
      toast.warning(
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
    // A többi mezőt (összeg, kategória, bérlő) NEM töröljük — a user már lehet
    // hogy módosított rajtuk és nem akarja, hogy a clear pusztítson.
  }

  async function checkDocumentNumber(value: string) {
    setDocumentNumber(value)
    if (!value.trim()) {
      setReceiptBadge('')
      return
    }
    const isDuplicate = await checkReceiptDuplicate(value)
    setReceiptBadge(isDuplicate ? 'Már létezik ilyen iratszám.' : '')
  }

  async function handleSingleSubmit() {
    if (isBankDeposit) {
      if (!selectedBank) {
        toast.error('Válassza ki, melyik bankba lett letéve az összeg.')
        return
      }
      if (amount <= 0) {
        toast.error('Az összeg pozitív szám kell legyen.')
        return
      }

      setLoading(true)
      const result = await saveInternalTransfer({
        tipus: 'kassza_bank',
        datum,
        forras: 'kassza',
        cel: selectedBank,
        osszeg: amount,
        megjegyzes: note || source || 'Letéve a bankba',
      })

      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('A bankba tett készpénz sikeresen rögzítve.')
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
    if (createInventoryAsset && !inventoryName.trim()) {
      toast.error('A kapcsolt leltári alapeszköz megnevezése kötelező.')
      return
    }

    setLoading(true)
    const incomePayload = {
      osszeg: amount,
      datum,
      id_befizetescel: selectedCategory.id,
      id_szemely: personId,
      id_csalad: familyId,
      forrasa: source || null,
      iratszam: documentNumber || null,
      irattipus: receiptType,
      fizetettev: paidYear || null,
      megjegyzes: note || null,
    }

    const result = createInventoryAsset
      ? await saveIncomeWithLinkedInventory(incomePayload, {
          megnevezes: inventoryName.trim(),
          helyszin: inventoryLocation || null,
          felelos_nev: inventoryResponsible || null,
          katalogus_kod: inventoryCatalogCode || null,
          hasznalati_ido: inventoryUsefulLife === '' ? null : Number(inventoryUsefulLife),
          megjegyzes: inventoryNote || null,
        })
      : await saveIncome(incomePayload)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(createInventoryAsset ? 'Bevétel és kapcsolt alapeszköz sikeresen rögzítve.' : 'Bevétel sikeresen rögzítve.')
      onOpenChange(false)
    }
    setLoading(false)
  }

  async function handleBatchSubmit() {
    const normalizedRows = batchRows
      .filter(row => row.categoryId !== '' && Number(row.amount) > 0)
      .map(row => ({
        datum: row.datum,
        id_befizetescel: Number(row.categoryId),
        forrasa: row.source || null,
        osszeg: Number(row.amount),
        iratszam: row.documentNumber || null,
        irattipus: row.receiptType,
        fizetettev: row.paidYear ? Number(row.paidYear) : null,
        megjegyzes: row.note || null,
      }))

    if (normalizedRows.length === 0) {
      toast.error('Legalább egy kitöltött bevételi sor szükséges.')
      return
    }

    setLoading(true)
    const result = await saveIncomeBatch(normalizedRows)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${normalizedRows.length} bevételi sor sikeresen mentve.`)
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-md">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Bevétel rögzítése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-400">Egyszeri vagy táblázatos bevitel, banki letéttel és feltételes leltári kapcsolattal.</p>
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
                {/* B1.7 — Bérleti szerződés quick-pick (csak ha van aktív szerződés) */}
                {rentalContracts.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="size-4 text-amber-700" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Bérleti díj rögzítése
                      </span>
                    </div>
                    {selectedRentalId ? (
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
                        <div className="flex-1 min-w-0">
                          {(() => {
                            const c = rentalContracts.find(r => r.id === selectedRentalId)
                            if (!c) return null
                            return (
                              <>
                                <p className="text-sm font-medium text-slate-800 truncate">
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
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
                          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Kategória *</Label>
                    <select
                      value={categoryValue}
                      onChange={event => setCategoryValue(event.target.value === SPECIAL_BANK_DEPOSIT ? SPECIAL_BANK_DEPOSIT : Number(event.target.value) || '')}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">— Válasszon —</option>
                      <option value={SPECIAL_BANK_DEPOSIT}>Letéve a bankba</option>
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
                    {dateBadge && <Badge variant="secondary" className="bg-amber-100 text-amber-800">{dateBadge}</Badge>}
                  </div>
                </div>

                {isBankDeposit ? (
                  <div className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50/80 p-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Melyik bankba lett letéve? *</Label>
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
                      <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Pl. vasárnapi készpénz befizetve a bankba." className="min-h-[84px]" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 relative">
                      {/* Banki bevételnél a személy gyakran opcionális (cég/szervezet átutalás).
                          Készpénzes vagy járulék (101.01) esetén a személy fontos. */}
                      {(() => {
                        const isBanki = receiptType === 'Banki'
                        const selectedCatKod = categories.find((c) => c.id === categoryValue)?.kod || ''
                        const isJarulek = selectedCatKod.startsWith('101.01')
                        const personRequired = !isBanki || isJarulek
                        return (
                          <>
                            <Label className="flex items-center gap-2">
                              Befizető (személy / cég)
                              {!personRequired && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                  opcionális
                                </span>
                              )}
                              {personRequired && isJarulek && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                  járulékhoz kötelező
                                </span>
                              )}
                            </Label>
                            {!personRequired && (
                              <p className="text-[11px] text-slate-500 leading-snug">
                                Átutalás esetén gyakran cég/szervezet a forrás — elég a nevet beírni,
                                nem kell személyt kiválasztani. Ha tag fizet (pl. járulék), keresd ki a névből.
                              </p>
                            )}
                          </>
                        )
                      })()}
                      <div className="relative">
                        <Input value={searchQuery} onChange={event => void handleSearch(event.target.value)} placeholder="Keresés név alapján vagy cég/szervezet beírása..." className="pl-9" />
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      </div>
                      {personId ? (
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary" className="bg-green-100 text-green-700">
                            {personName}
                          </Badge>
                          <button type="button" className="text-xs text-slate-500 underline" onClick={() => { setPersonId(null); setPersonName(''); setFamilyId(null) }}>
                            Kapcsolat törlése
                          </button>
                        </div>
                      ) : null}
                      {showResults && searchResults.length > 0 && (
                        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
                          {searchResults.map(result => {
                            const fullName = `${result.csaladnev} ${result.k_nev}`
                            return (
                              <button
                                key={result.id}
                                type="button"
                                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
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

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Összeg (RON) *</Label>
                        <Input type="number" min={0.01} step={0.01} value={amount || ''} onChange={event => setAmount(Number(event.target.value))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fizetett év</Label>
                        <Input type="number" value={paidYear} onChange={event => setPaidYear(Number(event.target.value) || currentYear)} />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Iratszám</Label>
                        <Input value={documentNumber} onChange={event => void checkDocumentNumber(event.target.value)} />
                        {receiptBadge && <Badge variant="secondary" className="bg-red-100 text-red-700">{receiptBadge}</Badge>}
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
                      <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Kiegészítő információ a bevételhez." className="min-h-[84px]" />
                    </div>

                    {shouldOfferInventory && (
                      <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-emerald-800">Kapcsolt leltári alapeszköz</p>
                            <p className="text-xs text-emerald-700/80">
                              Csak akkor jelenik meg, ha a bevételi kategória leltári tárgy vásárlásához vagy eladásához köthető.
                            </p>
                          </div>
                          <input type="checkbox" checked={createInventoryAsset} onChange={event => setCreateInventoryAsset(event.target.checked)} />
                        </div>

                        {createInventoryAsset && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>Megnevezés *</Label>
                              <Input value={inventoryName} onChange={event => setInventoryName(event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Helyszín</Label>
                              <Input value={inventoryLocation} onChange={event => setInventoryLocation(event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Felelős személy</Label>
                              <Input value={inventoryResponsible} onChange={event => setInventoryResponsible(event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Amortizációs kód</Label>
                              <select
                                value={inventoryCatalogCode}
                                onChange={event => {
                                  const value = event.target.value
                                  setInventoryCatalogCode(value)
                                  const entry = getInventoryAmortizationCatalogEntry(value)
                                  if (entry) setInventoryUsefulLife(entry.defEv)
                                }}
                                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
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
                              <Label>Használati idő (év)</Label>
                              <Input type="number" min={1} value={inventoryUsefulLife} onChange={event => setInventoryUsefulLife(Number(event.target.value) || '')} />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label>Leltári megjegyzés</Label>
                              <Textarea value={inventoryNote} onChange={event => setInventoryNote(event.target.value)} className="min-h-[72px]" />
                            </div>
                            {selectedCatalogEntry && (
                              <div className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-600 sm:col-span-2">
                                <strong>{selectedCatalogEntry.kod}</strong> — {selectedCatalogEntry.nev}. Ajánlott használati idő: {selectedCatalogEntry.defEv} év.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Gyors ellenőrzés</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                      <span>Rögzítési mód</span>
                      <strong>{isBankDeposit ? 'Letéve a bankba' : 'Bevételi tétel'}</strong>
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
                    {isBankDeposit && selectedBank && (
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                        <span>Cél bankszámla</span>
                        <strong>{bankAccounts.find(account => String(account.id) === selectedBank)?.bank_neve || '—'}</strong>
                      </div>
                    )}
                    {!isBankDeposit && receiptBadge && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                        {receiptBadge}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-[1400px] w-full text-sm table-fixed">
                  {/* Explicit oszlopszélességek — hogy a beviteli mezők legyenek olvashatóak */}
                  <colgroup>
                    <col style={{ width: '130px' }} />  {/* Dátum */}
                    <col style={{ width: '240px' }} />  {/* Kategória */}
                    <col style={{ width: '220px' }} />  {/* Befizető / forrás */}
                    <col style={{ width: '120px' }} />  {/* Összeg */}
                    <col style={{ width: '110px' }} />  {/* Iratszám */}
                    <col style={{ width: '130px' }} />  {/* Típus */}
                    <col style={{ width: '90px' }}  />  {/* Fizetett év */}
                    <col />                              {/* Megjegyzés — maradék hely */}
                    <col style={{ width: '60px' }} />   {/* Művelet */}
                  </colgroup>
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium">Dátum</th>
                      <th className="px-3 py-3 text-left text-xs font-medium">Kategória</th>
                      <th className="px-3 py-3 text-left text-xs font-medium">Befizető / forrás</th>
                      <th className="px-3 py-3 text-right text-xs font-medium">Összeg</th>
                      <th className="px-3 py-3 text-left text-xs font-medium">Iratszám</th>
                      <th className="px-3 py-3 text-left text-xs font-medium">Típus</th>
                      <th className="px-3 py-3 text-left text-xs font-medium">Fiz. év</th>
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
                          <Input value={row.source} onChange={event => updateBatchRow(row.key, { source: event.target.value })} className="h-9 text-sm" placeholder="Név vagy forrás" />
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
                          <Input value={row.paidYear} onChange={event => updateBatchRow(row.key, { paidYear: event.target.value })} className="h-9 text-sm text-center" />
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
                  <Landmark className="size-4 text-slate-400" />
                  A bankba letétet itt nem batch módban, hanem az egyesével rögzítésben, a külön pénztári opcióval lehet használni.
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
              className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void (mode === 'single' ? handleSingleSubmit() : handleBatchSubmit())}
              disabled={loading || dateBadge.length > 0}
            >
              {loading ? 'Mentés...' : mode === 'single' ? 'Bevétel mentése' : 'Táblázat mentése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
