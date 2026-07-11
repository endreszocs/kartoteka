'use client'

/**
 * TransactionsTab — közös tranzakciók-lista (Sprint Q Fázis 1, v0.6.3).
 *
 * Bevétel + kiadás unified lista, hónaponként csoportosítva, dátum-fejléccel,
 * kísérőív-nyomtatás gombbal, Oblio-státusz ikonokkal.
 *
 * **Callback-abstraction**:
 *   - `onDeleteTransaction(type, id)` — server-action delete
 *   - `loadOblioMatchedExpenseIds(year)` — SPV match betöltés (web: server action,
 *     desktop: lokális query VAGY üres set)
 *   - `onToast(msg, kind)` — UI-feedback
 *   - `onSwitchTab(tabKey)` — tab váltás (a régi `window.dispatchEvent('finance-tab-switch')`
 *     helyett — pl. a kiadás-soros SPV-ikon kattintás)
 *
 * **Slot props** (modals + icons):
 *   - `oblioStatusIconSlot` — befizetés-soros e-Factura status icon
 *   - `oblioExpenseStatusIconSlot` — kiadás-soros SPV match icon
 *   - `kiseroivPrintDialogSlot` — kísérőív nyomtatási modal
 *   - `oblioInvoiceDialogSlot` — bérleti díj-jellegű befizetésnél a számla-kiállítás
 *
 * Eredeti: 567 sor; itt ~480 sor (kevés boilerplate-tel kevesebb).
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Printer } from 'lucide-react'

import { Badge, Button } from '@kartoteka/ui'

import {
  formatCurrency,
  getExpensePartnerName,
  getTransactionDocumentNumber,
} from './helpers'
import {
  ColumnFilterInput,
  FinanceTableToolbar,
  matchesColumnFilters,
} from './FinanceTableToolbar'
import {
  buildFinanceExportAoa,
  financeExportFilename,
  type FinanceExportLine,
} from './finance-export'
import {
  RENTAL_SZAMADASICEL_CODES,
  type BankAccount,
  type BefitetesRow,
  type KiadasRow,
  type RentalContractRow,
  type SzamadasiCel,
} from './types'

const HU_MONTHS = [
  'Január',
  'Február',
  'Március',
  'Április',
  'Május',
  'Június',
  'Július',
  'Augusztus',
  'Szeptember',
  'Október',
  'November',
  'December',
] as const

export type TransactionType = 'income' | 'expense'
export type TransactionsToastKind = 'success' | 'error' | 'info'

export interface TransactionsTabProps {
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  szamadasiCellek: SzamadasiCel[]
  congregationName: string
  onRefresh: () => void
  rentalContracts?: RentalContractRow[]

  /** 2026-07-10 (ÚJ #8): bankszámlák a kp/banki jelzéshez — a banki tétel chipje
   *  a bankszámla nevét mutatja. Opcionális: nélküle csak a „Kp" jelzés marad el
   *  a név-feloldás (fallback: „Bank"). */
  bankAccounts?: BankAccount[]

  /** Tranzakció törlése (web: deleteTransaction action). */
  onDeleteTransaction?: (
    type: TransactionType,
    id: number,
  ) => Promise<{ success?: boolean; error?: string | null }>

  /** SPV-match-elt kiadás-ID-k betöltése (web: listOblioMatchesAndKiadasok). */
  loadOblioMatchedExpenseIds?: (year: number) => Promise<Set<number>>

  /** UI-feedback. */
  onToast?: (message: string, kind: TransactionsToastKind) => void

  /** (Szűrt) sorok exportja Excelbe — a web köti be (SheetJS aoa → .xlsx letöltés). */
  onExportXlsx?: (aoa: (string | number)[][], filename: string) => void

  /** Tab-váltás (régi `window.dispatchEvent('finance-tab-switch')` helyett). */
  onSwitchTab?: (tabKey: string) => void

  /** Befizetés-sor e-Factura status ikonja. */
  oblioStatusIconSlot?: (params: {
    transactionId: number
    date: string
    partnerName: string | null
    amount: number
    onIssueInvoice?: () => void
  }) => ReactNode

  /** Kiadás-sor SPV match ikonja. */
  oblioExpenseStatusIconSlot?: (params: {
    matched: boolean
    notYetScanned: boolean
    onClick: () => void
  }) => ReactNode

  /** 2026-07-10 (S4 #10): van-e kiválasztott Oblio (KARTOTEKA) mappa.
   *  `false` esetén az SPV-ikon kattintás NEM vált fület (az Oblio ellenőrzés
   *  fül mappa nélkül zsákutca lenne), hanem az `oblioFolderWarningSlot`
   *  figyelmeztetőjét nyitja. `undefined` (pl. desktop-adapter, vagy még fut
   *  az ellenőrzés) = nincs kapuzás, a régi viselkedés marad. */
  oblioFolderReady?: boolean

  /** 2026-07-10 (S4 #10): figyelmeztető dialog, ha nincs Oblio-mappa.
   *  `onFolderPicked` — a web-oldali sikeres mappa-választás után hívandó:
   *  bezárja a figyelmeztetőt és reload nélkül folytatja a megszakított
   *  fülváltást az Oblio ellenőrzésre. */
  oblioFolderWarningSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onFolderPicked: () => void
  }) => ReactNode

  /** Kiadási kísérőív nyomtatási modal. */
  kiseroivPrintDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    expenses: KiadasRow[]
    date: string
    pageNumber: number
    congregationName: string
    kiaCelMap: Record<number, string>
    cellek: SzamadasiCel[]
  }) => ReactNode

  /** Bérleti díj-számla kiállítási modal. */
  oblioInvoiceDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    contract: RentalContractRow | null
  }) => ReactNode

  /** 2026-07-11 (S6-#1): a párosítatlan belső-mozgás sorok id-jai (mint a
   *  CashbookTab-nál) — az export ebből számolja az ÉLŐ párosítási státuszt,
   *  nem a rögzítéskor beégetett „Várakozik banki egyeztetésre" megjegyzésből. */
  unpairedInternalIds?: Set<number>
}

type UnifiedRow = {
  type: TransactionType
  id: number
  datum: string
  /** A tétel a számla saját valutájában (devizás banki tételnél pl. EUR). */
  osszeg: number
  /** 2026-07-11 (S9): RON-ekvivalens — az összesítők/megjelenítés EZT használják
   *  (a könyvelés RON-ban folyik). RON tételnél == osszeg. */
  osszegRon: number
  label: string
  category: string
  /** Kerületi sz. — a kerülettől kapott, nyomtatott szám (iratszam). */
  iratszam: string
  /** Irat sz. — a gyülekezet saját sorszáma (nyugta), csak ha valódi; kiadásnál üres. */
  gyulekezetiSzam: string
  irattipus: string
  megjegyzes: string
  isBm: boolean
  /** 2026-07-11 (S6-#1): ÉLŐ párosítási státusz — true = nincs meg a másik oldal. */
  unpaired: boolean
  /** 2026-07-10 (ÚJ #8): NULL = készpénz (kassza), kitöltve = banki tétel. */
  bankszamlaId: number | null
  /** 2026-07-10 (S3 audit #1): stornózott (érvénytelenített) tétel — a listában
   *  látszik (átlátszóság), de az összesítőkbe NEM számít. */
  stornozott: boolean
  hasMissingPerson: boolean
  hasMissingCategory: boolean
  rawExpense?: KiadasRow
}

/**
 * 2026-07-11 (S9): a tétel-összeg RON-ban (a könyvelés RON-ban folyik). Devizás
 * banki tételnél alatta az EREDETI deviza-összeg is látszik a bankkivonat-
 * egyeztetéshez — pl. „8 890,15" (RON) fölött és „1 788,68 EUR" alatta.
 */
function TxnAmount({ row, valuta }: { row: UnifiedRow; valuta: string }) {
  const isForeign = valuta !== 'RON' && Number(row.osszeg) !== Number(row.osszegRon)
  if (!isForeign) return <>{formatCurrency(row.osszegRon)}</>
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{formatCurrency(row.osszegRon)}</span>
      <span className="text-[10px] font-normal text-slate-400">
        {formatCurrency(row.osszeg)} {valuta}
      </span>
    </span>
  )
}

export function TransactionsTab({
  incomeRecords,
  expenseRecords,
  bevCelMap,
  kiaCelMap,
  szamadasiCellek,
  congregationName,
  onRefresh,
  rentalContracts = [],
  bankAccounts = [],
  onDeleteTransaction,
  loadOblioMatchedExpenseIds,
  onToast,
  onExportXlsx,
  onSwitchTab,
  oblioStatusIconSlot,
  oblioExpenseStatusIconSlot,
  kiseroivPrintDialogSlot,
  oblioInvoiceDialogSlot,
  oblioFolderReady,
  oblioFolderWarningSlot,
  unpairedInternalIds,
}: TransactionsTabProps) {
  const [monthFilter, setMonthFilter] = useState<number | ''>('')
  /** Oszloponkénti szabad-szöveges szűrők (kulcs = oszlop). */
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const setColFilter = (key: string, value: string) =>
    setColFilters((s) => ({ ...s, [key]: value }))
  const [kiseroivDate, setKiseroivDate] = useState<string | null>(null)
  const [invoiceContract, setInvoiceContract] = useState<RentalContractRow | null>(null)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  // 2026-07-10 (S4 #10): "nincs Oblio-mappa" figyelmeztető láthatósága.
  const [oblioFolderWarningOpen, setOblioFolderWarningOpen] = useState(false)

  const [expenseSpvMatchedIds, setExpenseSpvMatchedIds] = useState<Set<number>>(new Set())
  const [spvMatchesLoaded, setSpvMatchesLoaded] = useState(false)

  const dominantYear = useMemo(() => {
    const counts = new Map<number, number>()
    for (const r of [...incomeRecords, ...expenseRecords]) {
      const y = new Date(r.datum).getFullYear()
      if (Number.isFinite(y)) counts.set(y, (counts.get(y) || 0) + 1)
    }
    let best = new Date().getFullYear()
    let bestN = 0
    for (const [y, n] of counts) {
      if (n > bestN) {
        best = y
        bestN = n
      }
    }
    return best
  }, [incomeRecords, expenseRecords])

  useEffect(() => {
    if (!loadOblioMatchedExpenseIds) {
      setSpvMatchesLoaded(true)
      return
    }
    let cancelled = false
    loadOblioMatchedExpenseIds(dominantYear)
      .then((set) => {
        if (cancelled) return
        setExpenseSpvMatchedIds(set)
        setSpvMatchesLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setSpvMatchesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [dominantYear, loadOblioMatchedExpenseIds])

  const rentalCelIds = useMemo(() => {
    const set = new Set<number>()
    for (const [idStr, kod] of Object.entries(bevCelMap)) {
      if ((RENTAL_SZAMADASICEL_CODES as readonly string[]).includes(kod)) {
        set.add(Number(idStr))
      }
    }
    return set
  }, [bevCelMap])

  const rentalByName = useMemo(() => {
    const map = new Map<string, RentalContractRow>()
    const today = new Date().toISOString().slice(0, 10)
    for (const c of rentalContracts) {
      if (c.deleted || !c.aktiv) continue
      if (c.jogi_tipus === 'comodat') continue
      if (c.vege && c.vege < today) continue
      const key = (c.berlo_nev || '').trim().toLowerCase()
      if (key) map.set(key, c)
      const cegKey = (c.ceg_nev || '').trim().toLowerCase()
      if (cegKey && !map.has(cegKey)) map.set(cegKey, c)
    }
    return map
  }, [rentalContracts])

  function findContractForPayment(row: BefitetesRow): RentalContractRow | null {
    if (!row.id_befizetescel || !rentalCelIds.has(row.id_befizetescel)) return null
    const key = (row.forrasa || '').trim().toLowerCase()
    if (!key) return null
    const direct = rentalByName.get(key)
    if (direct) return direct
    for (const [name, contract] of rentalByName.entries()) {
      if (key.includes(name) || name.includes(key)) return contract
    }
    return null
  }

  const incomeContractMap = useMemo(() => {
    const map = new Map<number, RentalContractRow>()
    for (const r of incomeRecords) {
      const c = findContractForPayment(r)
      if (c) map.set(r.id, c)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRecords, rentalCelIds, rentalByName])

  function getCelName(kod: string): string {
    return szamadasiCellek.find((c) => c.id === kod)?.nev || kod
  }

  // 2026-07-10 (ÚJ #8): id → bankszámla feloldó a banki chip nevéhez.
  const bankAccountById = useMemo(() => {
    const map = new Map<number, BankAccount>()
    for (const b of bankAccounts) map.set(b.id, b)
    return map
  }, [bankAccounts])

  const rows: UnifiedRow[] = useMemo(() => {
    const all: UnifiedRow[] = [
      ...incomeRecords.map((r) => ({
        type: 'income' as const,
        id: r.id,
        datum: r.datum,
        osszeg: r.osszeg,
        osszegRon: Number(r.osszeg_ron ?? r.osszeg) || 0,
        label: r.forrasa || '—',
        category: bevCelMap[r.id_befizetescel || 0]
          ? getCelName(bevCelMap[r.id_befizetescel || 0])
          : '—',
        iratszam: getTransactionDocumentNumber(r) || '—',
        gyulekezetiSzam: r.nyugta && r.nyugta !== r.iratszam ? r.nyugta : '',
        irattipus: r.irattipus || '—',
        megjegyzes: r.megjegyzes || '',
        isBm: !!r.belso_mozgas_xkey,
        unpaired: !!r.belso_mozgas_xkey && !!unpairedInternalIds?.has(r.id), // 2026-07-11 (S6-#1)
        bankszamlaId: r.bankszamla_id ?? null, // 2026-07-10 (ÚJ #8)
        stornozott: r.stornozott === true, // 2026-07-10 (S3 audit #1)
        hasMissingPerson: !r.id_szemely && !r.id_csalad && !r.belso_mozgas_xkey,
        hasMissingCategory: !r.id_befizetescel,
      })),
      ...expenseRecords.map((r) => ({
        type: 'expense' as const,
        id: r.id,
        datum: r.datum,
        osszeg: r.osszeg,
        osszegRon: Number(r.osszeg_ron ?? r.osszeg) || 0,
        label: getExpensePartnerName(r) || '—',
        category: kiaCelMap[r.id_kiadascel || 0]
          ? getCelName(kiaCelMap[r.id_kiadascel || 0])
          : '—',
        iratszam: getTransactionDocumentNumber(r) || '—',
        gyulekezetiSzam: '', // kiadásnál nincs külön gyülekezeti sorszám
        irattipus: r.irattipus || '—',
        megjegyzes: r.megjegyzes || '',
        isBm: !!r.belso_mozgas_xkey,
        unpaired: !!r.belso_mozgas_xkey && !!unpairedInternalIds?.has(r.id), // 2026-07-11 (S6-#1)
        bankszamlaId: r.bankszamla_id ?? null, // 2026-07-10 (ÚJ #8)
        stornozott: r.stornozott === true, // 2026-07-10 (S3 audit #1)
        hasMissingPerson: false,
        hasMissingCategory: !r.id_kiadascel,
        rawExpense: r,
      })),
    ]

    let filtered = all
    if (monthFilter !== '') {
      filtered = all.filter((r) => {
        const m = new Date(r.datum).getMonth()
        return m === monthFilter
      })
    }

    return filtered.sort((a, b) => b.datum.localeCompare(a.datum))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRecords, expenseRecords, monthFilter, bevCelMap, kiaCelMap, unpairedInternalIds])

  // Oszloponkénti szabad-szöveges szűrés.
  const filteredRows = useMemo(
    () =>
      rows.filter((r) =>
        matchesColumnFilters(colFilters, {
          datum: (r.datum || '').slice(0, 10),
          irattipus: r.irattipus,
          iratszam: r.iratszam,
          partner: r.label,
          kategoria: r.category,
          megjegyzes: r.megjegyzes,
        }),
      ),
    [rows, colFilters],
  )

  function buildExport() {
    // 2026-07-11 (S6-#1): belső mozgásnál az ÉLŐ párosítási státusz megy az exportba
    // (mint a Kassza fülön) — NEM a rögzítéskor beégetett, elavulható megjegyzés.
    // A rögzítéskori „⏳ Várakozik banki egyeztetésre…" szöveg örökre a megjegyzésben
    // maradt akkor is, ha a banki pár már RÉGEN beérkezett.
    const lines: FinanceExportLine[] = filteredRows.map((r) => ({
      datum: r.datum,
      iratszam: r.iratszam === '—' ? '' : r.iratszam,
      irattipus: r.irattipus === '—' ? '' : r.irattipus,
      nev: r.label === '—' ? '' : r.label,
      type: r.type,
      // 2026-07-11 (S9): a hivatalos RON-formátumú export a RON-ekvivalenst viszi.
      osszeg: r.osszegRon,
      celNev: r.category === '—' ? '' : r.category,
      megjegyzes: r.isBm
        ? r.unpaired
          ? '⏳ Várakozik banki egyeztetésre — nincs banki pár'
          : '✓ Belső mozgás — párosítva'
        : r.megjegyzes,
    }))
    return {
      aoa: buildFinanceExportAoa(lines),
      filename: financeExportFilename('Tranzakciok', dominantYear),
    }
  }

  const expenseDayPageMap = useMemo(() => {
    const days = new Set<string>()
    for (const r of expenseRecords) {
      if (!r.deleted) days.add((r.datum || '').split('T')[0])
    }
    const sorted = [...days].sort()
    const map = new Map<string, number>()
    sorted.forEach((d, i) => map.set(d, i + 1))
    return map
  }, [expenseRecords])

  function handlePrintKiseroiv(date: string) {
    const dayExpenses = expenseRecords
      .filter((r) => !r.deleted && (r.datum || '').split('T')[0] === date)
      .sort((a, b) => a.id - b.id)

    if (dayExpenses.length === 0) {
      onToast?.('Nincs kiadás ezen a napon.', 'error')
      return
    }

    setKiseroivDate(date)
  }

  const kiseroivExpenses = useMemo(() => {
    if (!kiseroivDate) return []
    return expenseRecords
      .filter((r) => !r.deleted && (r.datum || '').split('T')[0] === kiseroivDate)
      .sort((a, b) => a.id - b.id)
  }, [kiseroivDate, expenseRecords])

  const kiseroivPageNum = kiseroivDate ? expenseDayPageMap.get(kiseroivDate) || 1 : 1

  async function handleDelete(type: TransactionType, id: number) {
    if (!onDeleteTransaction) return
    if (typeof window === 'undefined') return
    if (!window.confirm('Biztosan törli ezt a tranzakciót?')) return
    const result = await onDeleteTransaction(type, id)
    if (result.error) {
      onToast?.(result.error, 'error')
    } else {
      onToast?.('Tranzakció törölve.', 'success')
      onRefresh()
    }
  }

  const groupedByMonth = useMemo(() => {
    const groups = new Map<
      number,
      { label: string; rows: typeof rows; monthInc: number; monthExp: number }
    >()

    for (const r of filteredRows) {
      const m = new Date(r.datum).getMonth()
      if (!groups.has(m)) {
        groups.set(m, { label: HU_MONTHS[m], rows: [], monthInc: 0, monthExp: 0 })
      }
      const g = groups.get(m)!
      g.rows.push(r)
      // 2026-07-10 (S3 audit #1): stornózott tétel nem számít a havi összesítőbe.
      if (!r.stornozott) {
        // 2026-07-11 (S9): a havi/éves részösszegek RON-ban (osszegRon).
        if (r.type === 'income') g.monthInc += r.osszegRon
        else g.monthExp += r.osszegRon
      }
    }

    return [...groups.entries()].sort((a, b) => b[0] - a[0])
  }, [filteredRows])

  const expenseDates = useMemo(() => {
    const dates = new Set<string>()
    for (const r of rows) {
      if (r.type === 'expense') dates.add((r.datum || '').split('T')[0])
    }
    return dates
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="card-raised flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <select
          value={monthFilter}
          onChange={(e) =>
            setMonthFilter(e.target.value === '' ? '' : Number(e.target.value))
          }
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="">Minden hónap</option>
          {HU_MONTHS.map((name, i) => (
            <option key={i} value={i}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-400">{rows.length} tétel</span>
      </div>

      {rows.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <p className="text-slate-500">Nincs tranzakció ebben az időszakban.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <FinanceTableToolbar
            values={colFilters}
            onClear={() => setColFilters({})}
            buildExport={onExportXlsx ? buildExport : undefined}
            onDownload={onExportXlsx}
            totalCount={rows.length}
            filteredCount={filteredRows.length}
          />

          {filteredRows.length === 0 ? (
            <div className="card-raised p-8 text-center">
              <p className="text-sm text-slate-400">Nincs a szűrésnek megfelelő tétel.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedByMonth.map(([monthIdx, group]) => (
            <div key={monthIdx} className="space-y-2">
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700">{group.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {group.rows.length} tétel
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-emerald-600 font-semibold">
                    +{formatCurrency(group.monthInc)}
                  </span>
                  <span className="text-red-500 font-semibold">
                    −{formatCurrency(group.monthExp)}
                  </span>
                </div>
              </div>

              <div className="card-raised overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/60 bg-white/60">
                      <tr>
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500">
                          Dátum
                        </th>
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500">
                          Befizető / Partner
                        </th>
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden md:table-cell">
                          Kategória
                        </th>
                        {/* 2026-07-10 (S2 #12): egységes, egyszerű címke. */}
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden lg:table-cell">
                          Irat sz.
                        </th>
                        {/* 2026-07-10 (ÚJ #9): kétoszlopos Bevétel/Kiadás a közös „Összeg" helyett
                            — a CashbookTab mintája szerint. */}
                        <th className="p-2.5 text-right text-xs font-medium text-slate-500">
                          Bevétel
                        </th>
                        <th className="p-2.5 text-right text-xs font-medium text-slate-500">
                          Kiadás
                        </th>
                        <th
                          className="p-2.5 w-8 text-center text-xs font-medium text-slate-500"
                          title="Oblio e-Factura státusz"
                        >
                          <span className="sr-only">Oblio</span>
                          <span aria-hidden>🧾</span>
                        </th>
                        {onDeleteTransaction && <th className="p-2.5 w-20" />}
                      </tr>
                      {/* Oszlop-igazított szűrősor — minden mező a saját oszlopa alatt. */}
                      <tr>
                        <th className="p-1.5 align-top">
                          <ColumnFilterInput value={colFilters.datum || ''} onChange={(v) => setColFilter('datum', v)} ariaLabel="Dátum szűrő" />
                        </th>
                        <th className="p-1.5 align-top">
                          <ColumnFilterInput value={colFilters.partner || ''} onChange={(v) => setColFilter('partner', v)} ariaLabel="Partner szűrő" />
                        </th>
                        <th className="p-1.5 align-top hidden md:table-cell">
                          <ColumnFilterInput value={colFilters.kategoria || ''} onChange={(v) => setColFilter('kategoria', v)} ariaLabel="Kategória szűrő" />
                        </th>
                        <th className="p-1.5 align-top hidden lg:table-cell">
                          <ColumnFilterInput value={colFilters.iratszam || ''} onChange={(v) => setColFilter('iratszam', v)} ariaLabel="Iratszám szűrő" />
                        </th>
                        {/* 2026-07-10 (ÚJ #9): +1 üres cella a Bevétel/Kiadás oszlop-pár miatt. */}
                        <th className="p-1.5" />
                        <th className="p-1.5" />
                        <th className="p-1.5" />
                        {onDeleteTransaction && <th className="p-1.5" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/60">
                      {group.rows.map((r, i) => {
                        const curDate = r.datum?.split('T')[0]
                        const prevDate =
                          i > 0 ? group.rows[i - 1].datum?.split('T')[0] : null
                        const showDateHeader = curDate !== prevDate
                        const hasExpenseOnDay = expenseDates.has(curDate || '')
                        const pageNum = expenseDayPageMap.get(curDate || '')

                        return (
                          <Fragment key={`${r.type}-${r.id}`}>
                            {showDateHeader && (
                              <tr className="bg-secondary/55">
                                {/* 2026-07-10 (ÚJ #9): colSpan 7 → 8 a Bevétel/Kiadás oszlop-pár miatt. */}
                                <td colSpan={8} className="px-2.5 py-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-500">
                                      {curDate}
                                    </span>
                                    {hasExpenseOnDay && kiseroivPrintDialogSlot && (
                                      <button
                                        type="button"
                                        onClick={() => handlePrintKiseroiv(curDate || '')}
                                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                                        title={`Kiadási kísérőív (pg. ${pageNum})`}
                                      >
                                        <Printer className="size-3" />
                                        Kísérőív (pg. {pageNum})
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr className="transition-colors hover:bg-secondary/55">
                              <td className="p-2.5 text-slate-400 text-xs">{curDate}</td>
                              <td className="p-2.5">
                                <div className="flex items-center gap-1">
                                  {(r.hasMissingPerson || r.hasMissingCategory) && (
                                    <span
                                      title={[
                                        r.hasMissingPerson &&
                                          'nincs személy/család hozzárendelve',
                                        r.hasMissingCategory && 'nincs költségvetési cél',
                                      ]
                                        .filter(Boolean)
                                        .join(', ')}
                                    >
                                      <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                                    </span>
                                  )}
                                  <span
                                    className={`truncate max-w-[200px] block font-medium ${
                                      r.hasMissingPerson ? 'text-amber-700' : 'text-slate-700'
                                    }`}
                                  >
                                    {r.label}
                                  </span>
                                </div>
                                {/* 2026-07-10 (ÚJ #8): kp/banki jelző chip — NULL bankszamlaId =
                                    készpénz (zöld „Kp"), kitöltve = banki tétel a bankszámla
                                    nevével (kék, fallback: „Bank"). */}
                                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                  {r.isBm && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] border-violet-200 text-violet-600"
                                    >
                                      BM
                                    </Badge>
                                  )}
                                  {r.bankszamlaId == null ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] border-emerald-200 text-emerald-600"
                                      title="Készpénzes tétel (kassza)"
                                    >
                                      Kp
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] border-sky-200 text-sky-600"
                                      title="Banki tétel"
                                    >
                                      {bankAccountById.get(r.bankszamlaId)?.bank_neve || 'Bank'}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="p-2.5 hidden md:table-cell text-xs">
                                <span
                                  className={
                                    r.hasMissingCategory
                                      ? 'text-amber-700 font-medium'
                                      : 'text-slate-400'
                                  }
                                >
                                  {r.hasMissingCategory ? '⚠ Nincs cél' : r.category}
                                </span>
                              </td>
                              <td className="p-2.5 hidden lg:table-cell text-slate-400 text-xs">
                                <span title="Kerületi sz. — a kerülettől kapott, nyomtatott szám">{r.iratszam}</span>
                                {r.gyulekezetiSzam && (
                                  <span
                                    className="block text-[10px] text-slate-400/80"
                                    title="Irat sz. — a gyülekezet saját sorszáma"
                                  >
                                    Irat sz.: {r.gyulekezetiSzam}
                                  </span>
                                )}
                              </td>
                              {/* 2026-07-10 (ÚJ #9): kétoszlopos Bevétel/Kiadás — a tétel csak a
                                  saját oszlopában jelenik meg, előjel nélkül (CashbookTab-minta). */}
                              <td className="p-2.5 text-right font-bold text-emerald-600">
                                {r.type === 'income' ? (
                                  <TxnAmount row={r} valuta={r.bankszamlaId != null ? (bankAccountById.get(r.bankszamlaId)?.valuta || 'RON') : 'RON'} />
                                ) : (
                                  <span className="font-normal text-slate-300">—</span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-bold text-red-500">
                                {r.type === 'expense' ? (
                                  <TxnAmount row={r} valuta={r.bankszamlaId != null ? (bankAccountById.get(r.bankszamlaId)?.valuta || 'RON') : 'RON'} />
                                ) : (
                                  <span className="font-normal text-slate-300">—</span>
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                {r.type === 'income'
                                  ? oblioStatusIconSlot?.({
                                      transactionId: r.id,
                                      date: (r.datum || '').split('T')[0],
                                      partnerName: r.label === '—' ? null : r.label,
                                      amount: r.osszeg,
                                      onIssueInvoice: incomeContractMap.has(r.id)
                                        ? () => {
                                            setInvoiceContract(
                                              incomeContractMap.get(r.id) || null,
                                            )
                                            setInvoiceDialogOpen(true)
                                          }
                                        : undefined,
                                    })
                                  : oblioExpenseStatusIconSlot?.({
                                      matched: expenseSpvMatchedIds.has(r.id),
                                      notYetScanned: !spvMatchesLoaded,
                                      onClick: () => {
                                        // 2026-07-10 (S4 #10): mappa nélkül a fülváltás
                                        // zsákutca — előbb a figyelmeztető, amiből
                                        // HELYBEN kiválasztható a KARTOTEKA mappa.
                                        if (
                                          oblioFolderReady === false &&
                                          oblioFolderWarningSlot
                                        ) {
                                          setOblioFolderWarningOpen(true)
                                          return
                                        }
                                        onSwitchTab?.('oblio_ellenorzes')
                                      },
                                    })}
                              </td>
                              {onDeleteTransaction && (
                                <td className="p-2.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                                    onClick={() => handleDelete(r.type, r.id)}
                                  >
                                    {'✕'}
                                  </Button>
                                </td>
                              )}
                            </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
            </div>
          )}
        </div>
      )}

      {/* Modalok — slot-prop-on érkeznek */}
      {kiseroivDate &&
        kiseroivPrintDialogSlot?.({
          open: !!kiseroivDate,
          onOpenChange: (open) => {
            if (!open) setKiseroivDate(null)
          },
          expenses: kiseroivExpenses,
          date: kiseroivDate,
          pageNumber: kiseroivPageNum,
          congregationName,
          kiaCelMap,
          cellek: szamadasiCellek,
        })}

      {oblioInvoiceDialogSlot?.({
        open: invoiceDialogOpen,
        onOpenChange: setInvoiceDialogOpen,
        contract: invoiceContract,
      })}

      {/* 2026-07-10 (S4 #10): "nincs Oblio-mappa" figyelmeztető — sikeres
          mappa-választás után reload nélkül folytatjuk a fülváltást. */}
      {oblioFolderWarningSlot?.({
        open: oblioFolderWarningOpen,
        onOpenChange: setOblioFolderWarningOpen,
        onFolderPicked: () => {
          setOblioFolderWarningOpen(false)
          onSwitchTab?.('oblio_ellenorzes')
        },
      })}
    </div>
  )
}
