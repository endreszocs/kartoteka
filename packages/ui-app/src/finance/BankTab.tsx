'use client'

/**
 * BankTab — banki forgalom (Sprint Q F1, v0.7.2, 2026-04-25).
 *
 * Banki bevételek + kiadások unified lista, hónapok szerint csoportosítva,
 * sortálható, nyitó/záró egyenleg, BCR Excel import wizard, bankszámla
 * kezelés (felvétel/szerkesztés), stornó/szerkesztés gombok.
 *
 * ─── Platform-függetlenség (web + Tauri desktop + jövőbeli iOS) ───
 *
 * Csak pure UI:
 *   - import: react, lucide-react, ./types, ./helpers
 *   - SEMMILYEN platform-API (sonner, next/*, @supabase/*, @tauri-apps/* nincs)
 *   - Adatlekérés callback-eken (web: server action, desktop: Tauri SQLite,
 *     iOS: Tauri SQLite + iOS plugin egyaránt)
 *   - `currentYear` prop-ként → deterministic, tesztelhető
 *
 * iOS-barát megerősítés: opcionális `onConfirm` prop, ha a hívó átad egyet
 * (pl. iOS-en natív alert-controller, desktopon shadcn AlertDialog), az
 * használódik a `window.confirm` helyett. Default fallback: `window.confirm`
 * (desktop WebView2 + iOS WKWebView — funkcionálisan jó, UX nem natív).
 *
 * Callback-ek:
 *   - `onUndoStorno({type, id})` — stornó visszavonás
 *   - `onLoadNyitoEgyenleg(bankszamlaId, eve)` — éves nyitó egyenleg
 *   - `onTransactionChanged()` — sikeres művelet után parent reload
 *   - `onBankImported()` — BCR import után parent reload
 *   - `onBankAccountSaved()` — bankszámla mentés után parent reload
 *   - `onToast(msg, kind)` — UI-feedback
 *
 * Slot-prop-ok (modalok):
 *   - `bcrImportWizardDialogSlot({open, onOpenChange, ..., onImported})`
 *   - `bankAccountDialogSlot({open, onOpenChange, account, congregationId, onSaved})`
 *   - `transactionEditDialogSlot({open, onOpenChange, type, id, initial, categories, onSaved})`
 *   - `stornoConfirmDialogSlot({open, onOpenChange, type, id, summary, isInternalTransfer, onStornoed})`
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  Building2,
  FileSpreadsheet,
  Landmark,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'

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
import type {
  BankAccount,
  BefitetesRow,
  KiadasRow,
  NyitoEgyenlegRow,
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

export type BankToastKind = 'success' | 'error' | 'info' | 'warning'
export type BankTransactionType = 'befizetes' | 'kiadas'

interface BankTransactionRow {
  id: number
  type: 'income' | 'expense'
  datum: string
  osszeg: number
  partner: string
  celNev: string
  iratszam: string
  /** Irattípus (pl. Extr / Chit. / Banki). */
  irattipus: string
  /** Melyik évre szól a bevétel (egyházfenntartás hátralék) — kiadásnál null. */
  fizetettev: number | null
  isBm: boolean
  /** Belső mozgás banki pár nélkül (piros jelzés). */
  unpaired?: boolean
  /** A korábbi „Párosítás" fül hiányosság-jelzései */
  hasMissingPerson: boolean
  hasMissingCategory: boolean
  /** Stornózott: a listában marad, de az összesítőből kimarad. */
  stornozott: boolean
  stornozottIndok: string | null
  idCel: number | null
  megjegyzes?: string | null
  /** A melyik bankszámlán zajlott — szűréshez. */
  bankszamlaId: number | null
}


type BankSortBy = 'datum' | 'jogcim' | 'iratszam' | 'partner' | 'osszeg'
type BankSortDir = 'asc' | 'desc'

export interface BankTabProps {
  // ── Adatok ────────────────────────────────────────────────
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  carryoverBank: number
  bankAccounts: BankAccount[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  szamadasiCellek: { id: string; nev?: string; kod?: string; sorszam: number }[]
  /** Az Import wizard-nak szükséges kategóriák. */
  incomeCategories?: { id: number; kod: string; nev: string }[]
  expenseCategories?: { id: number; kod: string; nev: string }[]
  /** Az aktív gyülekezet ID-ja — bankszámla létrehozáshoz / szerkesztéshez. */
  congregationId?: string
  /** Az aktuális év a nyitó egyenleg cache-hez. Default: új Date(). */
  currentYear?: number
  /** Párosítatlan belső-mozgás sor-azonosítók (banki pár nélkül) — piros jelzéshez. */
  unpairedInternalIds?: Set<number>

  // ── Server-action callback-ek (Promise-alapú) ──────────────
  onUndoStorno?: (args: {
    type: BankTransactionType
    id: number
  }) => Promise<{ success?: boolean; error?: string | null }>
  onLoadNyitoEgyenleg?: (
    bankszamlaId: number,
    eve: number,
  ) => Promise<{ data?: NyitoEgyenlegRow | null; error?: string | null }>

  // ── Reload callback-ek ─────────────────────────────────────
  onTransactionChanged?: () => void | Promise<void>
  onBankImported?: () => void | Promise<void>
  onBankAccountSaved?: () => void | Promise<void>

  // ── UI-feedback callback ───────────────────────────────────
  onToast?: (message: string, kind: BankToastKind) => void

  /** (Szűrt) sorok exportja Excelbe — a web köti be (SheetJS aoa → .xlsx letöltés). */
  onExportXlsx?: (aoa: (string | number)[][], filename: string) => void

  /**
   * Megerősítő dialógus override — opcionális. Ha a hívó átad egy callback-et,
   * az használódik a `window.confirm` helyett (iOS-en natív alert-controller,
   * desktopon shadcn AlertDialog stb.). Ha undefined: `window.confirm` fallback
   * (visszafelé kompatibilis a régi viselkedéssel).
   */
  onConfirm?: (message: string) => boolean | Promise<boolean>

  // ── Slot prop-ok (4 modal) ─────────────────────────────────

  /** BcrImportWizardDialog — Excel banki kivonat → tranzakciók wizard. */
  bcrImportWizardDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    bankAccounts: BankAccount[]
    /** Per-számla import: a wizard erre a számlára legyen előre beállítva. */
    defaultBankAccountId?: number | null
    incomeCategories: { id: number; kod: string; nev: string }[]
    expenseCategories: { id: number; kod: string; nev: string }[]
    onImported: () => void | Promise<void>
  }) => ReactNode

  /** BankAccountDialog — bankszámla felvétel/szerkesztés modal. */
  bankAccountDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    account: BankAccount | null
    congregationId: string
    onSaved: () => void | Promise<void>
  }) => ReactNode

  /** TransactionEditDialog — gyors tranzakció szerkesztő. */
  transactionEditDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    type: BankTransactionType
    id: number | null
    initial?: {
      datum: string
      osszeg: number
      id_cel: number | null
      iratszam: string | null
      megjegyzes: string | null
    }
    categories: { id: number; kod: string; nev: string }[]
    onSaved: () => void | Promise<void>
  }) => ReactNode

  /** StornoConfirmDialog — stornó kötelező indoklással. */
  stornoConfirmDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    type: BankTransactionType
    id: number | null
    summary?: string
    isInternalTransfer?: boolean
    onStornoed: () => void | Promise<void>
  }) => ReactNode
}

export function BankTab({
  incomeRecords,
  expenseRecords,
  carryoverBank,
  bankAccounts,
  bevCelMap,
  kiaCelMap,
  szamadasiCellek,
  incomeCategories = [],
  expenseCategories = [],
  congregationId,
  currentYear: currentYearProp,
  unpairedInternalIds,
  onUndoStorno,
  onLoadNyitoEgyenleg,
  onTransactionChanged,
  onBankImported,
  onBankAccountSaved,
  onToast,
  onExportXlsx,
  onConfirm,
  bcrImportWizardDialogSlot,
  bankAccountDialogSlot,
  transactionEditDialogSlot,
  stornoConfirmDialogSlot,
}: BankTabProps) {
  const currentYear = currentYearProp ?? new Date().getFullYear()

  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<BankSortBy>('datum')
  const [sortDir, setSortDir] = useState<BankSortDir>('desc')
  /** Oszloponkénti szabad-szöveges szűrők (kulcs = oszlop). */
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const setColFilter = (key: string, value: string) =>
    setColFilters((s) => ({ ...s, [key]: value }))
  const [bcrImportOpen, setBcrImportOpen] = useState(false)
  /** Melyik bankszámlára importálunk épp (per-számla import a kártyáról). */
  const [importTargetId, setImportTargetId] = useState<number | null>(null)
  const [bankDialogOpen, setBankDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  /** Éves nyitó egyenleg minden bankszámlához (a bankszamla_nyito_egyenleg táblából). */
  const [nyitoMap, setNyitoMap] = useState<Record<number, NyitoEgyenlegRow | null>>({})
  /** Bankszámla-szintű szűrő: melyik számla forgalmát látjuk. 'all' = összes. */
  const [selectedBankFilter, setSelectedBankFilter] = useState<number | 'all'>('all')

  // Alapértelmezetten az „Összesítő" (selectedBankFilter='all') van kijelölve — a
  // bankszámla-kártyákra kattintva lehet egy adott számlára szűrni.

  // Év eleji nyitó egyenleg lekérdezése minden bankszámlához (aktuális év)
  useEffect(() => {
    if (!onLoadNyitoEgyenleg) return
    let cancelled = false
    if (bankAccounts.length === 0) {
      setNyitoMap({})
      return
    }
    void Promise.all(
      bankAccounts.map((b) =>
        onLoadNyitoEgyenleg(b.id, currentYear).then(
          (res) => [b.id, res.data ?? null] as const,
        ),
      ),
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<number, NyitoEgyenlegRow | null> = {}
      for (const [id, row] of pairs) next[id] = row
      setNyitoMap(next)
    })
    return () => {
      cancelled = true
    }
  }, [bankAccounts, currentYear, onLoadNyitoEgyenleg])

  // ─── Szerkesztés / Stornó state ───────────────────────
  const [editDialog, setEditDialog] = useState<{
    open: boolean
    type: BankTransactionType
    id: number | null
    initial?: {
      datum: string
      osszeg: number
      id_cel: number | null
      iratszam: string | null
      megjegyzes: string | null
    }
  }>({ open: false, type: 'befizetes', id: null })
  const [stornoDialog, setStornoDialog] = useState<{
    open: boolean
    type: BankTransactionType
    id: number | null
    summary?: string
    isInternalTransfer?: boolean
  }>({ open: false, type: 'befizetes', id: null })

  function handleOpenEdit(r: BankTransactionRow) {
    setEditDialog({
      open: true,
      type: r.type === 'income' ? 'befizetes' : 'kiadas',
      id: r.id,
      initial: {
        datum: r.datum,
        osszeg: r.osszeg,
        id_cel: r.idCel,
        iratszam: r.iratszam,
        megjegyzes: r.megjegyzes || null,
      },
    })
  }

  function handleOpenStorno(r: BankTransactionRow) {
    setStornoDialog({
      open: true,
      type: r.type === 'income' ? 'befizetes' : 'kiadas',
      id: r.id,
      summary: `${r.datum?.slice(0, 10)} — ${r.partner} — ${formatCurrency(r.osszeg)} RON — ${r.celNev || 'nincs cél'}`,
      isInternalTransfer: r.isBm,
    })
  }

  async function handleUndoStorno(r: BankTransactionRow) {
    if (!onUndoStorno) return
    if (typeof window === 'undefined') return
    const message = 'Visszavonod a stornót? A tétel ismét bekerül a számításokba.'
    const confirmed = onConfirm ? await onConfirm(message) : window.confirm(message)
    if (!confirmed) return
    const res = await onUndoStorno({
      type: r.type === 'income' ? 'befizetes' : 'kiadas',
      id: r.id,
    })
    if (res.error) {
      onToast?.(res.error, 'error')
      return
    }
    onToast?.('Stornó visszavonva.', 'success')
    if (onTransactionChanged) await onTransactionChanged()
  }

  function handleImportForAccount(accountId: number) {
    setImportTargetId(accountId)
    setBcrImportOpen(true)
  }

  function toggleSort(col: BankSortBy) {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir(col === 'datum' ? 'desc' : 'asc')
    }
  }

  const cellNameMap = useMemo(() => {
    return Object.fromEntries(
      szamadasiCellek.map((cell) => [cell.id, cell.nev || cell.kod || cell.id]),
    ) as Record<string, string>
  }, [szamadasiCellek])

  const bankRows = useMemo(() => {
    const rows: BankTransactionRow[] = []

    incomeRecords.forEach((record) => {
      if (!record.bankszamla_id) return // csak banki tételek (bankszamla_id kitöltve); a kassza a CashbookTab-on

      const cellId = bevCelMap[record.id_befizetescel || 0]
      const cellKod = cellId || ''

      // Bank→személy feltételes logika:
      //   - Járulék (101.01) esetén KELL tudnunk, ki fizetett → ha nincs személy/család, hiányos
      //   - Egyéb bank-bevétel (adomány, bérleti díj, kamat) esetén a személy OPCIONÁLIS
      //     (cég/szervezet átutalásnál a forrasa mező tartalmazza a partnert)
      const requiresPerson = cellKod.startsWith('101.01')
      const hasSomeSource =
        !!record.id_szemely ||
        !!record.id_csalad ||
        !!(record.forrasa && record.forrasa.trim()) ||
        !!record.belso_mozgas_xkey
      const hasMissingPerson = requiresPerson
        ? !record.id_szemely && !record.id_csalad && !record.belso_mozgas_xkey
        : !hasSomeSource

      rows.push({
        id: record.id,
        type: 'income',
        datum: record.datum,
        osszeg: record.osszeg,
        partner: record.forrasa || '-',
        celNev: cellId ? cellNameMap[cellId] || cellId : '',
        iratszam: getTransactionDocumentNumber(record) || '',
        irattipus: record.irattipus || '',
        fizetettev: record.fizetettev ?? null,
        isBm: !!record.belso_mozgas_xkey,
        unpaired: !!record.belso_mozgas_xkey && !!unpairedInternalIds?.has(record.id),
        hasMissingPerson,
        hasMissingCategory: !record.id_befizetescel,
        stornozott: record.stornozott === true,
        stornozottIndok: record.stornozott_indok ?? null,
        idCel: record.id_befizetescel ?? null,
        megjegyzes: record.megjegyzes ?? null,
        bankszamlaId:
          (record as unknown as { bankszamla_id?: number | null }).bankszamla_id ??
          null,
      })
    })

    expenseRecords.forEach((record) => {
      if (!record.bankszamla_id) return // csak banki tételek (bankszamla_id kitöltve); a kassza a CashbookTab-on

      const cellId = kiaCelMap[record.id_kiadascel || 0]

      rows.push({
        id: record.id,
        type: 'expense',
        datum: record.datum,
        osszeg: record.osszeg,
        partner: getExpensePartnerName(record) || '-',
        celNev: cellId ? cellNameMap[cellId] || cellId : '',
        iratszam: getTransactionDocumentNumber(record) || '',
        irattipus: record.irattipus || '',
        fizetettev: null,
        isBm: !!record.belso_mozgas_xkey,
        unpaired: !!record.belso_mozgas_xkey && !!unpairedInternalIds?.has(record.id),
        hasMissingPerson: false, // kiadásnál nem kötelező személy
        hasMissingCategory: !record.id_kiadascel,
        stornozott: record.stornozott === true,
        stornozottIndok: record.stornozott_indok ?? null,
        idCel: record.id_kiadascel ?? null,
        megjegyzes: record.megjegyzes ?? null,
        bankszamlaId:
          (record as unknown as { bankszamla_id?: number | null }).bankszamla_id ??
          null,
      })
    })

    return rows.sort((left, right) => left.datum.localeCompare(right.datum))
  }, [incomeRecords, expenseRecords, bevCelMap, kiaCelMap, cellNameMap, unpairedInternalIds])

  // Bankszámla-szintű szűrés
  const filteredBankRows = useMemo(() => {
    if (selectedBankFilter === 'all') return bankRows
    return bankRows.filter((r) => r.bankszamlaId === selectedBankFilter)
  }, [bankRows, selectedBankFilter])

  const { displayRows, openingBalance, closingBalance, monthIncome, monthExpense } =
    useMemo(() => {
      // A nyitó alap:
      //   - 'all' szűrő: a parent által számolt `carryoverBank` (minden bankszámla)
      //   - 1 bankszámla: a tényleges rögzített éves nyitó RON (ha van)
      const openingBase =
        selectedBankFilter === 'all'
          ? carryoverBank
          : Number(nyitoMap[selectedBankFilter]?.nyito_egyenleg_ron ?? 0)

      let opening = openingBase
      let income = 0
      let expense = 0
      const display: BankTransactionRow[] = []

      filteredBankRows.forEach((row) => {
        const monthIndex = new Date(row.datum).getMonth()

        if (monthFilter !== 'all') {
          if (monthIndex < monthFilter) {
            // Stornózott tételek nem kerülnek a nyitó egyenlegbe sem
            if (!row.stornozott) {
              if (row.type === 'income') {
                opening += row.osszeg
              } else {
                opening -= row.osszeg
              }
            }
            return
          }

          if (monthIndex > monthFilter) {
            return
          }
        }

        // Stornózott tételek láthatók a listában, de a havi összesítőbe nem
        display.push(row)
        if (!row.stornozott) {
          if (row.type === 'income') {
            income += row.osszeg
          } else {
            expense += row.osszeg
          }
        }
      })

      // Sortálás a kiválasztott oszlop szerint
      display.sort((a, b) => {
        let cmp = 0
        switch (sortBy) {
          case 'datum':
            cmp = a.datum.localeCompare(b.datum)
            break
          case 'jogcim':
            cmp = (a.celNev || '').localeCompare(b.celNev || '', 'hu')
            break
          case 'iratszam':
            cmp = (a.iratszam || '').localeCompare(b.iratszam || '', 'hu', {
              numeric: true,
            })
            break
          case 'partner':
            cmp = a.partner.localeCompare(b.partner, 'hu')
            break
          case 'osszeg':
            cmp = a.osszeg - b.osszeg
            break
        }
        return sortDir === 'asc' ? cmp : -cmp
      })

      return {
        displayRows: display,
        openingBalance: opening,
        closingBalance: opening + income - expense,
        monthIncome: income,
        monthExpense: expense,
      }
    }, [
      filteredBankRows,
      carryoverBank,
      monthFilter,
      sortBy,
      sortDir,
      selectedBankFilter,
      nyitoMap,
    ])

  // Oszlop-szűrés a megjelenített sorokon (a KPI-k a havi adatból számolnak).
  const filteredDisplayRows = useMemo(
    () =>
      displayRows.filter((r) =>
        matchesColumnFilters(colFilters, {
          datum: (r.datum || '').slice(0, 10),
          irattipus: r.irattipus,
          iratszam: r.iratszam,
          partner: r.partner,
          jogcim: r.celNev,
          megjegyzes: r.megjegyzes || '',
        }),
      ),
    [displayRows, colFilters],
  )

  // Export-fájlnévhez: a sorok domináns éve.
  const exportYear = useMemo(() => {
    const counts = new Map<number, number>()
    for (const r of bankRows) {
      const y = new Date(r.datum).getFullYear()
      if (Number.isFinite(y)) counts.set(y, (counts.get(y) || 0) + 1)
    }
    let best = ''
    let bestN = 0
    for (const [y, n] of counts) if (n > bestN) { best = String(y); bestN = n }
    return best || 'export'
  }, [bankRows])

  function buildExport() {
    // 2026-07-10 (ÚJ #1): belső mozgásnál az ÉLŐ párosítási státusz megy az exportba
    // (ugyanaz, amit a fül mutat) — NEM a rögzítéskor beégetett, elavulható megjegyzés.
    const lines: FinanceExportLine[] = filteredDisplayRows.map((r) => ({
      datum: r.datum,
      iratszam: r.iratszam,
      irattipus: r.irattipus,
      nev: r.partner,
      type: r.type,
      osszeg: r.osszeg,
      celNev: r.celNev,
      megjegyzes: r.isBm
        ? r.unpaired
          ? '⏳ Várakozik kassza-egyeztetésre — nincs kassza-oldali pár'
          : '✓ Belső mozgás — párosítva'
        : r.megjegyzes || '',
    }))
    return {
      aoa: buildFinanceExportAoa(lines),
      filename: financeExportFilename('Bank', exportYear),
    }
  }

  // Havi csoportosítás — a tranzakciók fülhöz hasonlóan
  const groupedByMonth = useMemo(() => {
    const groups = new Map<
      number,
      {
        label: string
        rows: typeof displayRows
        monthInc: number
        monthExp: number
      }
    >()
    for (const r of filteredDisplayRows) {
      const m = new Date(r.datum).getMonth()
      if (!groups.has(m)) {
        groups.set(m, { label: HU_MONTHS[m], rows: [], monthInc: 0, monthExp: 0 })
      }
      const g = groups.get(m)!
      g.rows.push(r)
      if (r.type === 'income') g.monthInc += r.osszeg
      else g.monthExp += r.osszeg
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0])
  }, [filteredDisplayRows])

  return (
    <div className="space-y-4">
      {bankAccounts.length === 0 && congregationId && (
        <div className="card-raised p-6 sm:p-8 text-center border-2 border-dashed border-slate-200 bg-gradient-to-br from-white to-emerald-50/30">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
            <Landmark className="size-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">
            Még nincs bankszámla
          </h3>
          <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
            Vegyen fel bankszámlát a pénzügyi könyveléshez. Többféle devizát (RON,
            EUR, HUF, stb.) is kezelhet egymás mellett.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingAccount(null)
              setBankDialogOpen(true)
            }}
            className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
          >
            <Plus className="mr-1.5 size-4" />
            Első bankszámla hozzáadása
          </button>
        </div>
      )}

      {bankAccounts.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {/* Összesítő — alapértelmezett szűrő (az összes bankszámla együtt). */}
          <button
            type="button"
            onClick={() => setSelectedBankFilter('all')}
            className={`card-raised flex min-w-[15rem] flex-1 items-start gap-3 p-4 text-left transition ${
              selectedBankFilter === 'all'
                ? 'ring-2 ring-violet-400'
                : 'hover:ring-1 hover:ring-violet-200'
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
              <Landmark className="h-5 w-5 text-violet-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700">Összesítő</p>
              <p className="text-[11px] text-slate-400">
                Az összes bankszámla együtt ({bankAccounts.length})
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-600">
                {currentYear}. január 1. nyitó: {formatCurrency(carryoverBank)} RON
              </p>
            </div>
          </button>

          {/* Bankszámla-kártyák — kattintásra szűrnek; saját import + szerkesztés gombbal. */}
          {bankAccounts.map((account) => {
            const selected = selectedBankFilter === account.id
            const ny = nyitoMap[account.id]
            const valuta = account.valuta || 'RON'
            const isRon = valuta === 'RON'
            return (
              <div
                key={account.id}
                className={`card-raised flex min-w-[15rem] flex-1 flex-col overflow-hidden p-0 transition ${
                  selected ? 'ring-2 ring-violet-400' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedBankFilter(account.id)}
                  className="flex items-start gap-3 p-4 text-left transition hover:bg-violet-50/40"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${account.szin || '#6366f1'}15` }}
                  >
                    <Building2 className="h-5 w-5" style={{ color: account.szin || '#6366f1' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">
                      {account.bank_neve}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {account.iban || 'Nincs IBAN'} · {valuta}
                    </p>
                    {ny ? (
                      <p className="text-[11px] text-slate-600 leading-snug">
                        <span className="font-medium text-slate-700">
                          {currentYear}. január 1. nyitó:
                        </span>{' '}
                        {formatCurrency(Number(ny.nyito_egyenleg_valuta))} {valuta}
                        {!isRon && (
                          <span className="text-slate-500">
                            {' '}
                            ({formatCurrency(Number(ny.nyito_egyenleg_ron))} RON)
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-700 italic">
                        Nyitó egyenleg még nincs rögzítve {currentYear}-re — importálj egy kivonatot.
                      </p>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => handleImportForAccount(account.id)}
                    title={`Banki kivonat importálása ide: ${account.bank_neve}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
                  >
                    <FileSpreadsheet className="size-3.5" />
                    Kivonat importálása
                  </button>
                  {congregationId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAccount(account)
                        setBankDialogOpen(true)
                      }}
                      title="Bankszámla szerkesztése"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* „+" kártya — új bankszámla hozzáadása a számlák sorának végén. */}
          {congregationId && (
            <button
              type="button"
              onClick={() => {
                setEditingAccount(null)
                setBankDialogOpen(true)
              }}
              className="card-raised flex min-w-[12rem] flex-1 flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 p-4 text-slate-400 transition hover:border-emerald-300 hover:text-emerald-600"
            >
              <Plus className="size-6" />
              <span className="text-sm font-medium">Új bankszámla</span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniKpi
          label="Nyito egyenleg"
          value={formatCurrency(openingBalance)}
          color="text-slate-700"
          icon={<Landmark className="h-4 w-4" />}
        />
        <MiniKpi
          label="Bevetel"
          value={`+${formatCurrency(monthIncome)}`}
          color="text-emerald-600"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <MiniKpi
          label="Kiadas"
          value={`-${formatCurrency(monthExpense)}`}
          color="text-red-500"
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <MiniKpi
          label="Zaro egyenleg"
          value={formatCurrency(closingBalance)}
          color={closingBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
          icon={<Landmark className="h-4 w-4" />}
          highlight
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={monthFilter}
          onChange={(event) =>
            setMonthFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
          }
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="all">Minden honap</option>
          {HU_MONTHS.map((name, index) => (
            <option key={index} value={index}>
              {name}
            </option>
          ))}
        </select>

        {bankAccounts.length > 1 && (
          <span className="text-xs text-slate-400">
            A forgalom osszesitett, nem bankszamla-szintu bontasban jelenik meg.
          </span>
        )}

        <span className="text-sm text-slate-400">{displayRows.length} tetel</span>
      </div>

      {displayRows.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <Landmark className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm text-slate-400">
            Nincs banki forgalom{' '}
            {monthFilter !== 'all' ? 'ebben a hónapban' : 'ebben az évben'}.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <FinanceTableToolbar
            values={colFilters}
            onClear={() => setColFilters({})}
            buildExport={onExportXlsx ? buildExport : undefined}
            onDownload={onExportXlsx}
            totalCount={displayRows.length}
            filteredCount={filteredDisplayRows.length}
          />

          {filteredDisplayRows.length === 0 ? (
            <div className="card-raised p-8 text-center">
              <p className="text-sm text-slate-400">Nincs a szűrésnek megfelelő tétel.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedByMonth.map(([monthIdx, group]) => (
            <div key={monthIdx} className="space-y-2">
              {/* Havi elválasztó fejléc */}
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700">{group.label}</span>
                  <span className="text-xs text-slate-500">
                    {group.rows.length} tétel
                  </span>
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

              {/* Havi tábla */}
              <div className="card-raised overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/80">
                      <tr>
                        <BankSortableTh
                          col="datum"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('datum')}
                        >
                          Dátum
                        </BankSortableTh>
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden lg:table-cell">
                          Irattípus
                        </th>
                        <BankSortableTh
                          col="iratszam"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('iratszam')}
                          className="hidden md:table-cell"
                        >
                          Iratszám
                        </BankSortableTh>
                        <BankSortableTh
                          col="partner"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('partner')}
                        >
                          Partner
                        </BankSortableTh>
                        <BankSortableTh
                          col="jogcim"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('jogcim')}
                        >
                          Jogcím
                        </BankSortableTh>
                        <th
                          className="p-2.5 text-center text-xs font-medium text-slate-500 hidden lg:table-cell"
                          title="Melyik évre szól (egyházfenntartói járulék)"
                        >
                          Évre
                        </th>
                        <BankSortableTh
                          col="osszeg"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('osszeg')}
                          align="right"
                        >
                          Bevétel
                        </BankSortableTh>
                        <BankSortableTh
                          col="osszeg"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('osszeg')}
                          align="right"
                        >
                          Kiadás
                        </BankSortableTh>
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden xl:table-cell">
                          Megjegyzés
                        </th>
                        <th className="p-2.5 text-right text-xs font-medium text-slate-500 w-20">
                          Művelet
                        </th>
                      </tr>
                      {/* Oszlop-igazított szűrősor — minden mező a saját oszlopa alatt. */}
                      <tr className="border-b border-slate-100 bg-white/70">
                        <th className="p-1.5 align-top">
                          <ColumnFilterInput value={colFilters.datum || ''} onChange={(v) => setColFilter('datum', v)} ariaLabel="Dátum szűrő" />
                        </th>
                        <th className="p-1.5 align-top hidden lg:table-cell">
                          <ColumnFilterInput value={colFilters.irattipus || ''} onChange={(v) => setColFilter('irattipus', v)} ariaLabel="Irattípus szűrő" />
                        </th>
                        <th className="p-1.5 align-top hidden md:table-cell">
                          <ColumnFilterInput value={colFilters.iratszam || ''} onChange={(v) => setColFilter('iratszam', v)} ariaLabel="Iratszám szűrő" />
                        </th>
                        <th className="p-1.5 align-top">
                          <ColumnFilterInput value={colFilters.partner || ''} onChange={(v) => setColFilter('partner', v)} ariaLabel="Partner szűrő" />
                        </th>
                        <th className="p-1.5 align-top">
                          <ColumnFilterInput value={colFilters.jogcim || ''} onChange={(v) => setColFilter('jogcim', v)} ariaLabel="Jogcím szűrő" />
                        </th>
                        <th className="p-1.5 hidden lg:table-cell" />
                        <th className="p-1.5" />
                        <th className="p-1.5" />
                        <th className="p-1.5 align-top hidden xl:table-cell">
                          <ColumnFilterInput value={colFilters.megjegyzes || ''} onChange={(v) => setColFilter('megjegyzes', v)} ariaLabel="Megjegyzés szűrő" />
                        </th>
                        <th className="p-1.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.rows.map((row) => {
                        const missingItems: string[] = []
                        if (row.hasMissingPerson)
                          missingItems.push('nincs személy/család hozzárendelve')
                        if (row.hasMissingCategory)
                          missingItems.push('nincs költségvetési cél')
                        const hasMissing = missingItems.length > 0
                        const rowBg = row.stornozott
                          ? 'bg-red-50/40 hover:bg-red-50/60'
                          : row.isBm
                            ? 'bg-violet-50/30 hover:bg-violet-50/60'
                            : hasMissing
                              ? 'bg-amber-50/30 hover:bg-amber-50/60'
                              : 'hover:bg-blue-50/30'
                        const rowBorder = row.stornozott
                          ? { borderLeft: '3px solid #dc2626' }
                          : row.isBm
                            ? { borderLeft: '3px solid #7c3aed' }
                            : hasMissing
                              ? { borderLeft: '3px solid #f59e0b' }
                              : undefined
                        const textStorno = row.stornozott
                          ? 'line-through decoration-red-400/80 text-slate-400'
                          : ''
                        return (
                          <tr
                            key={`${row.type}-${row.id}`}
                            className={`transition-colors ${rowBg}`}
                            style={rowBorder}
                          >
                            <td
                              className={`whitespace-nowrap p-2.5 text-xs text-slate-500 ${textStorno}`}
                            >
                              {row.datum?.split('T')[0]}
                            </td>
                            <td
                              className={`hidden p-2.5 text-xs text-slate-400 lg:table-cell ${textStorno}`}
                            >
                              {row.irattipus || '—'}
                            </td>
                            <td
                              className={`hidden p-2.5 text-xs text-slate-400 md:table-cell ${textStorno}`}
                            >
                              {row.iratszam || '—'}
                            </td>
                            <td className="p-2.5 text-xs font-medium">
                              <span
                                className={`${
                                  textStorno ||
                                  (row.hasMissingPerson ? 'text-amber-700' : 'text-slate-700')
                                }`}
                              >
                                {row.hasMissingPerson ? `⚠ ${row.partner}` : row.partner}
                              </span>
                            </td>
                            <td className="p-2.5">
                              <div className="flex items-center gap-1.5">
                                {row.stornozott && (
                                  <span title={`Stornózva: ${row.stornozottIndok || '—'}`}>
                                    <Ban className="h-3.5 w-3.5 shrink-0 text-red-500" />
                                  </span>
                                )}
                                {hasMissing && !row.stornozott && (
                                  <span title={`Hiányos: ${missingItems.join(', ')}`}>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                  </span>
                                )}
                                {row.isBm && (
                                  <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                                )}
                                <span
                                  className={`font-medium ${textStorno} ${
                                    !row.stornozott &&
                                    (row.isBm
                                      ? 'text-violet-700'
                                      : row.hasMissingCategory
                                        ? 'text-amber-700'
                                        : 'text-slate-700')
                                  }`}
                                >
                                  {row.celNev ||
                                    (row.hasMissingCategory ? '⚠ Nincs cél' : '—')}
                                </span>
                              </div>
                              {row.stornozott && row.stornozottIndok && (
                                <p className="text-[10px] text-red-600/90 italic mt-0.5 truncate max-w-[200px]">
                                  Stornó indok: {row.stornozottIndok}
                                </p>
                              )}
                            </td>
                            <td
                              className={`p-2.5 text-center text-xs text-slate-500 hidden lg:table-cell ${textStorno}`}
                            >
                              {row.type === 'income' && row.fizetettev ? row.fizetettev : '—'}
                            </td>
                            <td
                              className={`p-2.5 text-right font-bold text-emerald-600 ${textStorno}`}
                            >
                              {row.type === 'income' ? formatCurrency(row.osszeg) : ''}
                            </td>
                            <td
                              className={`p-2.5 text-right font-bold text-red-500 ${textStorno}`}
                            >
                              {row.type === 'expense' ? formatCurrency(row.osszeg) : ''}
                            </td>
                            <td
                              className={`p-2.5 text-xs hidden xl:table-cell max-w-[180px] truncate ${textStorno}`}
                              title={row.megjegyzes || ''}
                            >
                              {row.isBm ? (
                                row.unpaired ? (
                                  <span className="font-semibold text-red-600">⚠ nincs banki párja</span>
                                ) : (
                                  <span className="text-emerald-600">✓ párosítva</span>
                                )
                              ) : (
                                <span className="text-slate-500">{row.megjegyzes || '—'}</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {!row.stornozott && !row.isBm && (
                                  <button
                                    type="button"
                                    title="Szerkesztés"
                                    onClick={() => handleOpenEdit(row)}
                                    className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                )}
                                {row.stornozott ? (
                                  <button
                                    type="button"
                                    title="Stornó visszavonása"
                                    onClick={() => void handleUndoStorno(row)}
                                    className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                  >
                                    <RotateCcw className="size-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="Stornózás"
                                    onClick={() => handleOpenStorno(row)}
                                    className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <Ban className="size-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}

          {/* Éves összesítő */}
          <div className="card-raised p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Éves összesen</span>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-emerald-600 font-bold">
                +{formatCurrency(monthIncome)}
              </span>
              <span className="text-red-500 font-bold">
                −{formatCurrency(monthExpense)}
              </span>
            </div>
          </div>
            </div>
          )}
        </div>
      )}

      {/* Az évvégi FX átértékelés dialógot a Számadás véglegesítő wizard kezeli;
          a bank-tab nem tartalmazza már (lásd accounting-finalize-wizard-dialog.tsx). */}

      {/* BCR banki kivonat import wizard — Excel fájl → tranzakciók
          kategorizálása → batch import a DB-be (kassza-bank átvezetés is). */}
      {bcrImportWizardDialogSlot?.({
        open: bcrImportOpen,
        onOpenChange: (open) => {
          setBcrImportOpen(open)
          if (!open) setImportTargetId(null)
        },
        bankAccounts,
        defaultBankAccountId: importTargetId,
        incomeCategories,
        expenseCategories,
        onImported: async () => {
          if (onBankImported) await onBankImported()
        },
      })}

      {/* Bankszámla hozzáadás / szerkesztés dialog — közvetlenül a Bank fülről */}
      {congregationId &&
        bankAccountDialogSlot?.({
          open: bankDialogOpen,
          onOpenChange: setBankDialogOpen,
          account: editingAccount,
          congregationId,
          onSaved: async () => {
            if (onBankAccountSaved) await onBankAccountSaved()
          },
        })}

      {/* Szerkesztő — gyors módosítás a leggyakoribb mezőkre */}
      {transactionEditDialogSlot?.({
        open: editDialog.open,
        onOpenChange: (next) => setEditDialog((s) => ({ ...s, open: next })),
        type: editDialog.type,
        id: editDialog.id,
        initial: editDialog.initial,
        categories:
          editDialog.type === 'befizetes' ? incomeCategories : expenseCategories,
        onSaved: async () => {
          if (onTransactionChanged) await onTransactionChanged()
        },
      })}

      {/* Stornó — kötelező indoklással */}
      {stornoConfirmDialogSlot?.({
        open: stornoDialog.open,
        onOpenChange: (next) => setStornoDialog((s) => ({ ...s, open: next })),
        type: stornoDialog.type,
        id: stornoDialog.id,
        summary: stornoDialog.summary,
        isInternalTransfer: stornoDialog.isInternalTransfer,
        onStornoed: async () => {
          if (onTransactionChanged) await onTransactionChanged()
        },
      })}
    </div>
  )
}

function BankSortableTh({
  col,
  sortBy,
  sortDir,
  onClick,
  className,
  align = 'left',
  children,
}: {
  col: BankSortBy
  sortBy: BankSortBy
  sortDir: BankSortDir
  onClick: () => void
  className?: string
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const active = sortBy === col
  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'
  return (
    <th
      className={`p-2.5 text-${align} text-xs font-medium text-slate-500 ${className || ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${
          active ? 'text-violet-700 font-semibold' : ''
        }`}
      >
        {children}
        <span className="text-[10px] opacity-60">{arrow}</span>
      </button>
    </th>
  )
}

function MiniKpi({
  label,
  value,
  color,
  icon,
  highlight,
}: {
  label: string
  value: string
  color: string
  icon: ReactNode
  highlight?: boolean
}) {
  return (
    <div className={`card-raised p-3.5 ${highlight ? 'ring-1 ring-slate-200' : ''}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
      </div>
      <p className={`text-lg font-bold ${color}`}>
        {value} <span className="text-xs font-normal text-slate-400">RON</span>
      </p>
    </div>
  )
}
