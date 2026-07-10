'use client'

/**
 * CashbookTab — közös kasszanapló (Sprint Q F1, v0.7.1).
 *
 * Készpénzes bevétel + kiadás unified lista, hónapok szerint csoportosítva,
 * sortálható, nyitó/záró egyenleg, nyugta-kiállítás és stornó/szerkesztés gombok.
 *
 * Callback-ek:
 *   - `onAutoIssueChitanta(rowId)` — nyugta auto-kiállítás
 *   - `loadChitantakForBefizetesek(ids)` — meglévő nyugta-map lekérés
 *   - `onUndoStorno({type, id})` — stornó visszavonás
 *   - `onTransactionChanged()` — sikeres művelet után parent reload
 *   - `onToast(msg, kind)` — UI-feedback
 *
 * Slot-prop-ok (modalok és komponensek):
 *   - `chitantaTombokPanelSlot({refreshKey})` — aktív nyugtatömb panel
 *   - `chitantaSilentPrintSlot({chitantaId, onDone})` — közvetlen nyomtatás
 *   - `chitantaTombRequiredDialogSlot({open, onOpenChange, onTombCreated})` — wizard nincs aktív tömb esetén
 *   - `transactionEditDialogSlot({open, onOpenChange, type, id, initial, categories, onSaved})` — szerkesztő modal
 *   - `stornoConfirmDialogSlot({open, onOpenChange, type, id, summary, isInternalTransfer, onStornoed})` — stornó modal
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  ChevronDown,
  ChevronUp,
  Pencil,
  Printer,
  RotateCcw,
  Wallet,
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
import type { BefitetesRow, KiadasRow } from './types'

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

export type CashbookToastKind = 'success' | 'error' | 'info' | 'warning'
export type CashTransactionType = 'befizetes' | 'kiadas'

interface CashRow {
  id: number
  type: 'income' | 'expense'
  datum: string
  osszeg: number
  partner: string
  celNev: string
  /** Kerületi sz. — a kerülettől kapott, előre nyomtatott szám (befizetes.iratszam). */
  iratszam: string
  /** Irat sz. — a gyülekezet saját sorszáma (befizetes.nyugta). Csak akkor van kitöltve,
   *  ha valódi (nem a kerületi számmal tükrözött) gyülekezeti szám; kiadásnál mindig üres. */
  gyulekezetiSzam: string
  /** Irattípus (pl. Készpénz / Chit. / Extr). */
  irattipus: string
  /** Melyik évre szól a befizetés (egyházfenntartói járulék hátralék) — kiadásnál null. */
  fizetettev: number | null
  isBm: boolean
  /** Belső mozgás, aminek NINCS banki párja (piros jelzés); ha isBm és !unpaired → párosítva. */
  unpaired?: boolean
  megjegyzes?: string
  hasMissingPerson: boolean
  hasMissingCategory: boolean
  stornozott: boolean
  stornozottIndok: string | null
  idCel: number | null
}

type CashSortBy = 'datum' | 'jogcim' | 'iratszam' | 'partner' | 'osszeg'
type CashSortDir = 'asc' | 'desc'

export interface ChitantaInfo {
  id: string
  sorozat: string
  szam: number
}

export interface AutoIssueChitantaResult {
  chitantaId?: string | null
  sorozat?: string | null
  nyomdaiSzam?: number | null
  /** Speciális: 'NO_ACTIVE_BLOCK' → wizard kell. */
  errorCode?: string | null
  error?: string | null
  /** Hány nyugta van még a tömbben (warningot indíthat). */
  maradek?: number | null
}

export interface CashbookTabProps {
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  /** Párosítatlan belső-mozgás sor-azonosítók (a kiadas/befizetes id-k, amelyeknek nincs banki
   *  párjuk). Ami NINCS benne, az párosítva van — nem „várakozik". */
  unpairedInternalIds?: Set<number>
  carryoverCash: number
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  szamadasiCellek: { id: string; nev?: string; kod?: string; sorszam: number }[]
  congregationName?: string
  incomeCategories?: { id: number; kod: string; nev: string }[]
  expenseCategories?: { id: number; kod: string; nev: string }[]

  onTransactionChanged?: () => void | Promise<void>

  /** Nyugta auto-kiállítás (web: autoIssueChitantaForBefizetes server action). */
  onAutoIssueChitanta?: (befizetesId: number) => Promise<AutoIssueChitantaResult>

  /** Meglévő nyugta-map lekérés (web: getChitantakForBefizetesek server action). */
  loadChitantakForBefizetesek?: (
    ids: number[],
  ) => Promise<{ data?: Record<number, ChitantaInfo>; error?: string | null }>

  /** Stornó visszavonás. */
  onUndoStorno?: (params: {
    type: CashTransactionType
    id: number
  }) => Promise<{ success?: boolean; error?: string | null }>

  onToast?: (message: string, kind: CashbookToastKind) => void

  /** (Szűrt) sorok exportja Excelbe — a web köti be (SheetJS aoa → .xlsx letöltés). */
  onExportXlsx?: (aoa: (string | number)[][], filename: string) => void

  /** ChitantaTombokPanel — aktív tömb státusz + menedzsment. */
  chitantaTombokPanelSlot?: (params: { refreshKey: number }) => ReactNode

  /** ChitantaSilentPrint — közvetlen nyomtatás. */
  chitantaSilentPrintSlot?: (params: {
    chitantaId: string | null
    onDone: () => void
  }) => ReactNode

  /** ChitantaTombRequiredDialog — wizard nincs aktív tömb esetén. */
  chitantaTombRequiredDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onTombCreated: () => void | Promise<void>
  }) => ReactNode

  /** TransactionEditDialog — szerkesztő modal. */
  transactionEditDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    type: CashTransactionType
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

  /** StornoConfirmDialog — kötelező indoklással. */
  stornoConfirmDialogSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    type: CashTransactionType
    id: number | null
    summary?: string
    isInternalTransfer?: boolean
    onStornoed: () => void | Promise<void>
  }) => ReactNode
}

export function CashbookTab({
  incomeRecords,
  expenseRecords,
  unpairedInternalIds,
  carryoverCash,
  bevCelMap,
  kiaCelMap,
  szamadasiCellek,
  congregationName,
  incomeCategories = [],
  expenseCategories = [],
  onTransactionChanged,
  onAutoIssueChitanta,
  loadChitantakForBefizetesek,
  onUndoStorno,
  onToast,
  onExportXlsx,
  chitantaTombokPanelSlot,
  chitantaSilentPrintSlot,
  chitantaTombRequiredDialogSlot,
  transactionEditDialogSlot,
  stornoConfirmDialogSlot,
}: CashbookTabProps) {
  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<CashSortBy>('datum')
  const [sortDir, setSortDir] = useState<CashSortDir>('desc')
  /** Oszloponkénti szabad-szöveges szűrők (kulcs = oszlop). */
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const setColFilter = (key: string, value: string) =>
    setColFilters((s) => ({ ...s, [key]: value }))

  function toggleSort(col: CashSortBy) {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(col)
      setSortDir(col === 'datum' ? 'desc' : 'asc')
    }
  }

  const [silentPrintChitantaId, setSilentPrintChitantaId] = useState<string | null>(null)
  const [autoIssuingFor, setAutoIssuingFor] = useState<number | null>(null)
  const [tombRefreshKey, setTombRefreshKey] = useState(0)
  /** A Nyugtatömbök panel kinyitva van-e (az 5. KPI-kártyáról nyitható). */
  const [tombokExpanded, setTombokExpanded] = useState(false)

  const [tombRequiredOpen, setTombRequiredOpen] = useState(false)
  const [pendingBefizetesId, setPendingBefizetesId] = useState<number | null>(null)

  const [editDialog, setEditDialog] = useState<{
    open: boolean
    type: CashTransactionType
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
    type: CashTransactionType
    id: number | null
    summary?: string
    isInternalTransfer?: boolean
  }>({ open: false, type: 'befizetes', id: null })

  const [chitantakByBefizetes, setChitantakByBefizetes] = useState<
    Record<number, ChitantaInfo>
  >({})

  function handleOpenEdit(r: CashRow) {
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

  function handleOpenStorno(r: CashRow) {
    setStornoDialog({
      open: true,
      type: r.type === 'income' ? 'befizetes' : 'kiadas',
      id: r.id,
      summary: `${r.datum?.slice(0, 10)} — ${r.partner} — ${formatCurrency(r.osszeg)} RON — ${
        r.celNev || 'nincs cél'
      }`,
      isInternalTransfer: r.isBm,
    })
  }

  async function handleUndoStorno(r: CashRow) {
    if (!onUndoStorno) return
    if (typeof window === 'undefined') return
    if (!window.confirm('Visszavonod a stornót? A tétel ismét bekerül a számításokba.')) return
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

  async function issueChitantaForRow(rowId: number) {
    if (!onAutoIssueChitanta) return
    setAutoIssuingFor(rowId)
    try {
      const result = await onAutoIssueChitanta(rowId)
      if (result.errorCode === 'NO_ACTIVE_BLOCK') {
        setPendingBefizetesId(rowId)
        setTombRequiredOpen(true)
        return
      }
      if (result.error) {
        onToast?.(result.error, 'error')
        return
      }
      if (result.chitantaId) {
        setChitantakByBefizetes((prev) => ({
          ...prev,
          [rowId]: {
            id: result.chitantaId!,
            sorozat: result.sorozat || '',
            szam: result.nyomdaiSzam || 0,
          },
        }))
        setSilentPrintChitantaId(result.chitantaId)
        setTombRefreshKey((k) => k + 1)
        if (typeof result.maradek === 'number' && result.maradek <= 10) {
          onToast?.(
            `Figyelem: csak ${result.maradek} nyugta maradt az aktív tömbben.`,
            'warning',
          )
        }
      }
    } finally {
      setAutoIssuingFor(null)
    }
  }

  async function handleTombCreatedRetry() {
    setTombRefreshKey((k) => k + 1)
    const id = pendingBefizetesId
    setPendingBefizetesId(null)
    if (id != null) {
      onToast?.('Tömb rögzítve — nyugta kiállítása folytatódik.', 'success')
      await issueChitantaForRow(id)
    }
  }

  function getCelName(kod: string): string {
    return szamadasiCellek.find((c) => c.id === kod)?.nev || kod
  }

  const cashIncomeIds = useMemo(
    () =>
      incomeRecords
        // Kassza = nincs bankszámlához kötve (bankszamla_id NULL). Az irattípus
        // (Készpénz / Chit. / stb.) nem megbízható megkülönböztető — importnál „Chit." jön.
        .filter((r) => !r.bankszamla_id)
        .map((r) => r.id),
    [incomeRecords],
  )

  useEffect(() => {
    if (!loadChitantakForBefizetesek) return
    let cancelled = false
    if (cashIncomeIds.length === 0) {
      setChitantakByBefizetes({})
      return
    }
    Promise.resolve()
      .then(async () => {
        const res = await loadChitantakForBefizetesek(cashIncomeIds)
        if (cancelled) return
        if (res.data) setChitantakByBefizetes(res.data)
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      cancelled = true
    }
  }, [cashIncomeIds, loadChitantakForBefizetesek])

  const cashRows: CashRow[] = useMemo(() => {
    const rows: CashRow[] = []
    incomeRecords.forEach((r) => {
      if (r.bankszamla_id) return // csak kassza (bankszamla_id NULL); a bank a BankTab-on
      rows.push({
        id: r.id,
        type: 'income',
        datum: r.datum,
        osszeg: r.osszeg,
        irattipus: r.irattipus || '',
        fizetettev: r.fizetettev ?? null,
        partner: r.forrasa || 'Gyülekezeti tag',
        celNev: bevCelMap[r.id_befizetescel || 0]
          ? getCelName(bevCelMap[r.id_befizetescel || 0])
          : '',
        iratszam: getTransactionDocumentNumber(r) || '',
        // Irat sz. = gyülekezeti saját sorszám (nyugta); csak ha valódi (nem a kerületivel tükrözött).
        gyulekezetiSzam: r.nyugta && r.nyugta !== r.iratszam ? r.nyugta : '',
        isBm: !!r.belso_mozgas_xkey,
        unpaired: !!r.belso_mozgas_xkey && !!unpairedInternalIds?.has(r.id),
        megjegyzes: r.megjegyzes || undefined,
        hasMissingPerson: !r.id_szemely && !r.id_csalad && !r.belso_mozgas_xkey,
        hasMissingCategory: !r.id_befizetescel,
        stornozott: r.stornozott === true,
        stornozottIndok: r.stornozott_indok ?? null,
        idCel: r.id_befizetescel ?? null,
      })
    })
    expenseRecords.forEach((r) => {
      if (r.bankszamla_id) return // csak kassza (bankszamla_id NULL)
      rows.push({
        id: r.id,
        type: 'expense',
        datum: r.datum,
        osszeg: r.osszeg,
        irattipus: r.irattipus || '',
        fizetettev: null,
        partner: getExpensePartnerName(r) || '—',
        celNev: kiaCelMap[r.id_kiadascel || 0]
          ? getCelName(kiaCelMap[r.id_kiadascel || 0])
          : '',
        iratszam: getTransactionDocumentNumber(r) || '',
        gyulekezetiSzam: '', // kiadásnál nincs külön gyülekezeti sorszám
        isBm: !!r.belso_mozgas_xkey,
        unpaired: !!r.belso_mozgas_xkey && !!unpairedInternalIds?.has(r.id),
        megjegyzes: r.megjegyzes || undefined,
        hasMissingPerson: false,
        hasMissingCategory: !r.id_kiadascel,
        stornozott: r.stornozott === true,
        stornozottIndok: r.stornozott_indok ?? null,
        idCel: r.id_kiadascel ?? null,
      })
    })
    return rows.sort((a, b) => a.datum.localeCompare(b.datum))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRecords, expenseRecords, unpairedInternalIds])

  const { displayRows, openingBalance, monthIncome, monthExpense, closingBalance } =
    useMemo(() => {
      let opening = carryoverCash
      let monthInc = 0
      let monthExp = 0
      const display: CashRow[] = []

      cashRows.forEach((r) => {
        const m = new Date(r.datum).getMonth()
        if (monthFilter !== 'all') {
          if (m < monthFilter) {
            if (!r.stornozott) {
              if (r.type === 'income') opening += r.osszeg
              else opening -= r.osszeg
            }
            return
          }
          if (m > monthFilter) return
        }
        display.push(r)
        if (!r.stornozott) {
          if (r.type === 'income') monthInc += r.osszeg
          else monthExp += r.osszeg
        }
      })

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
        closingBalance: opening + monthInc - monthExp,
        monthIncome: monthInc,
        monthExpense: monthExp,
      }
    }, [cashRows, monthFilter, carryoverCash, sortBy, sortDir])

  // Oszlop-szűrés a megjelenített (havi + rendezett) sorokon. A KPI-k (nyitó/záró)
  // a havi adatból számolnak — a szöveges szűrő csak a listát/exportot szűkíti.
  const filteredRows = useMemo(
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
    for (const r of cashRows) {
      const y = new Date(r.datum).getFullYear()
      if (Number.isFinite(y)) counts.set(y, (counts.get(y) || 0) + 1)
    }
    let best = ''
    let bestN = 0
    for (const [y, n] of counts) if (n > bestN) { best = String(y); bestN = n }
    return best || 'export'
  }, [cashRows])

  function buildExport() {
    // 2026-07-10 (ÚJ #1): belső mozgásnál az ÉLŐ párosítási státusz megy az exportba
    // (ugyanaz, amit a fül mutat) — NEM a rögzítéskor beégetett, elavulható megjegyzés
    // ("Várakozik banki egyeztetésre" akkor is, ha a banki pár már beérkezett).
    const lines: FinanceExportLine[] = filteredRows.map((r) => ({
      datum: r.datum,
      iratszam: r.iratszam,
      irattipus: r.irattipus,
      nev: r.partner,
      type: r.type,
      osszeg: r.osszeg,
      celNev: r.celNev,
      megjegyzes: r.isBm
        ? r.unpaired
          ? '⏳ Várakozik banki egyeztetésre — nincs banki pár'
          : '✓ Belső mozgás — párosítva'
        : r.megjegyzes || '',
    }))
    return {
      aoa: buildFinanceExportAoa(lines),
      filename: financeExportFilename('Kassza', exportYear),
    }
  }

  const groupedByMonth = useMemo(() => {
    const groups = new Map<
      number,
      { label: string; rows: typeof displayRows; monthInc: number; monthExp: number }
    >()
    for (const r of filteredRows) {
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
  }, [filteredRows])

  return (
    <div className="space-y-4">
      <div
        className={`grid grid-cols-2 gap-3 ${
          chitantaTombokPanelSlot ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-4'
        }`}
      >
        <MiniKpi
          label="Nyitó egyenleg"
          value={formatCurrency(openingBalance)}
          color="text-slate-700"
          icon={<Wallet className="w-4 h-4" />}
        />
        <MiniKpi
          label="Bevétel"
          value={`+${formatCurrency(monthIncome)}`}
          color="text-emerald-600"
          icon={<ArrowUpRight className="w-4 h-4" />}
        />
        <MiniKpi
          label="Kiadás"
          value={`-${formatCurrency(monthExpense)}`}
          color="text-red-500"
          icon={<ArrowDownRight className="w-4 h-4" />}
        />
        <MiniKpi
          label="Záró egyenleg"
          value={formatCurrency(closingBalance)}
          color={closingBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
          icon={<Wallet className="w-4 h-4" />}
          highlight
        />
        {/* 5. kártya: Nyugtatömbök — kinyitja/becsukja a teljes panelt alatta. */}
        {chitantaTombokPanelSlot && (
          <button
            type="button"
            onClick={() => setTombokExpanded((v) => !v)}
            aria-expanded={tombokExpanded}
            className={`card-raised p-3.5 text-left transition hover:ring-1 hover:ring-emerald-300 ${
              tombokExpanded ? 'ring-1 ring-emerald-300' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-slate-400">
                <Printer className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Nyugtatömbök
              </span>
            </div>
            <p className="text-sm font-bold text-emerald-600 inline-flex items-center gap-1">
              {tombokExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" /> Bezárás
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" /> Megnyitás
                </>
              )}
            </p>
          </button>
        )}
      </div>

      {chitantaTombokPanelSlot && tombokExpanded && (
        <div className="card-raised p-4">
          {chitantaTombokPanelSlot({ refreshKey: tombRefreshKey })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={monthFilter}
          onChange={(e) =>
            setMonthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="all">Minden hónap</option>
          {HU_MONTHS.map((name, i) => (
            <option key={i} value={i}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-400">{displayRows.length} tétel</span>
      </div>

      {displayRows.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <Wallet className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            Nincs készpénzes forgalom{' '}
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

              <div className="card-raised overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                      <tr>
                        <CashSortableTh
                          col="datum"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('datum')}
                        >
                          Dátum
                        </CashSortableTh>
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden lg:table-cell">
                          Irattípus
                        </th>
                        <CashSortableTh
                          col="iratszam"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('iratszam')}
                          className="hidden md:table-cell"
                        >
                          Irat sz. / Kerületi
                        </CashSortableTh>
                        <CashSortableTh
                          col="partner"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('partner')}
                        >
                          Partner
                        </CashSortableTh>
                        <CashSortableTh
                          col="jogcim"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('jogcim')}
                        >
                          Jogcím
                        </CashSortableTh>
                        <th
                          className="p-2.5 text-center text-xs font-medium text-slate-500 hidden lg:table-cell"
                          title="Melyik évre szól (egyházfenntartói járulék)"
                        >
                          Évre
                        </th>
                        <CashSortableTh
                          col="osszeg"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('osszeg')}
                          align="right"
                        >
                          Bevétel
                        </CashSortableTh>
                        <CashSortableTh
                          col="osszeg"
                          sortBy={sortBy}
                          sortDir={sortDir}
                          onClick={() => toggleSort('osszeg')}
                          align="right"
                        >
                          Kiadás
                        </CashSortableTh>
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden xl:table-cell">
                          Megjegyzés
                        </th>
                        <th
                          className="p-2.5 w-12 text-center text-xs font-medium text-slate-500"
                          title="Nyugta"
                        >
                          🧾
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
                      {group.rows.map((r) => (
                        <CashRow
                          key={`${r.type}-${r.id}`}
                          row={r}
                          chitantakByBefizetes={chitantakByBefizetes}
                          autoIssuingFor={autoIssuingFor}
                          onEdit={handleOpenEdit}
                          onStorno={handleOpenStorno}
                          onUndoStorno={handleUndoStorno}
                          onIssueChitanta={issueChitantaForRow}
                          onReprintChitanta={(id) => setSilentPrintChitantaId(id)}
                          // Egy akció-gomb CSAK akkor jelenik meg, ha a hozzá tartozó
                          // callback/slot át van adva. A web mindet átadja (változatlan);
                          // a desktop a részhalmazt adja (a többi gomb rejtve marad).
                          canEdit={!!transactionEditDialogSlot}
                          canStorno={!!stornoConfirmDialogSlot}
                          canUndoStorno={!!onUndoStorno}
                          canChitanta={!!onAutoIssueChitanta}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}

          <div className="card-raised p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Éves összesen</span>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-emerald-600 font-bold">
                +{formatCurrency(monthIncome)}
              </span>
              <span className="text-red-500 font-bold">−{formatCurrency(monthExpense)}</span>
            </div>
          </div>
            </div>
          )}
        </div>
      )}

      {/* Slot-prop-on érkező komponensek */}
      {chitantaSilentPrintSlot?.({
        chitantaId: silentPrintChitantaId,
        onDone: () => setSilentPrintChitantaId(null),
      })}
      {chitantaTombRequiredDialogSlot?.({
        open: tombRequiredOpen,
        onOpenChange: (next) => {
          setTombRequiredOpen(next)
          if (!next) setPendingBefizetesId(null)
        },
        onTombCreated: handleTombCreatedRetry,
      })}
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

      {/* Discard congregationName warning */}
      {congregationName === undefined ? null : null}
    </div>
  )
}

interface CashRowProps {
  row: CashRow
  chitantakByBefizetes: Record<number, ChitantaInfo>
  autoIssuingFor: number | null
  onEdit: (r: CashRow) => void
  onStorno: (r: CashRow) => void
  onUndoStorno: (r: CashRow) => void | Promise<void>
  onIssueChitanta: (id: number) => void | Promise<void>
  onReprintChitanta: (chitantaId: string) => void
  /** Akció-gomb láthatóság — a szülő a callback/slot megléte alapján adja. */
  canEdit: boolean
  canStorno: boolean
  canUndoStorno: boolean
  canChitanta: boolean
}

function CashRow({
  row: r,
  chitantakByBefizetes,
  autoIssuingFor,
  onEdit,
  onStorno,
  onUndoStorno,
  onIssueChitanta,
  onReprintChitanta,
  canEdit,
  canStorno,
  canUndoStorno,
  canChitanta,
}: CashRowProps) {
  const missingItems: string[] = []
  if (r.hasMissingPerson) missingItems.push('nincs személy/család hozzárendelve')
  if (r.hasMissingCategory) missingItems.push('nincs költségvetési cél')
  const hasMissing = missingItems.length > 0
  const rowBg = r.stornozott
    ? 'bg-red-50/40 hover:bg-red-50/60'
    : r.isBm
      ? 'bg-violet-50/30 hover:bg-violet-50/60'
      : hasMissing
        ? 'bg-amber-50/30 hover:bg-amber-50/60'
        : 'hover:bg-blue-50/30'
  const rowBorder = r.stornozott
    ? { borderLeft: '3px solid #dc2626' }
    : r.isBm
      ? { borderLeft: '3px solid #7c3aed' }
      : hasMissing
        ? { borderLeft: '3px solid #f59e0b' }
        : undefined
  const textStorno = r.stornozott ? 'line-through decoration-red-400/80 text-slate-400' : ''

  return (
    <tr className={`transition-colors ${rowBg}`} style={rowBorder}>
      <td className={`p-2.5 text-slate-500 text-xs whitespace-nowrap ${textStorno}`}>
        {r.datum?.split('T')[0]}
      </td>
      <td className={`p-2.5 text-slate-400 text-xs hidden lg:table-cell ${textStorno}`}>
        {r.irattipus || '—'}
      </td>
      {/* 2026-07-10 (ÚJ #3): a gyülekezeti saját szám a FŐ érték, a kerületi a másodlagos.
          Ha nincs külön gyülekezeti szám, a kerületi marad az egyetlen (fő) érték. */}
      <td className={`p-2.5 text-slate-400 text-xs hidden md:table-cell ${textStorno}`}>
        <span title="Irat sz. — a gyülekezet saját sorszáma">
          {r.gyulekezetiSzam || r.iratszam || '—'}
        </span>
        {r.gyulekezetiSzam && r.iratszam && (
          <span
            className="block text-[10px] text-slate-400/80"
            title="Kerületi sz. — a kerülettől kapott, nyomtatott szám"
          >
            Ker. sz.: {r.iratszam}
          </span>
        )}
      </td>
      <td className="p-2.5">
        <span
          className={`font-medium text-xs ${
            textStorno || (r.hasMissingPerson ? 'text-amber-700' : 'text-slate-700')
          }`}
        >
          {r.hasMissingPerson ? `⚠ ${r.partner}` : r.partner}
        </span>
        {r.isBm && (
          <p className="text-[10px] mt-0.5 truncate max-w-[180px]">
            {r.unpaired ? (
              <span className="font-semibold text-red-600">⚠ Nincs banki párja!</span>
            ) : (
              <span className="text-emerald-600">✓ Banki párja megvan</span>
            )}
          </p>
        )}
      </td>
      <td className="p-2.5">
        <div className="flex items-center gap-1.5">
          {r.stornozott && (
            <span title={`Stornózva: ${r.stornozottIndok || '—'}`}>
              <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />
            </span>
          )}
          {hasMissing && !r.stornozott && (
            <span title={`Hiányos: ${missingItems.join(', ')}`}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            </span>
          )}
          {r.isBm && <ArrowLeftRight className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
          <span
            className={`font-medium ${textStorno} ${
              !r.stornozott &&
              (r.isBm
                ? 'text-violet-700'
                : r.hasMissingCategory
                  ? 'text-amber-700'
                  : 'text-slate-700')
            }`}
          >
            {r.celNev || (r.hasMissingCategory ? '⚠ Nincs cél' : '—')}
          </span>
        </div>
        {r.stornozott && r.stornozottIndok && (
          <p className="text-[10px] text-red-600/90 italic mt-0.5 truncate max-w-[200px]">
            Stornó indok: {r.stornozottIndok}
          </p>
        )}
      </td>
      <td className={`p-2.5 text-center text-xs text-slate-500 hidden lg:table-cell ${textStorno}`}>
        {r.type === 'income' && r.fizetettev ? r.fizetettev : '—'}
      </td>
      <td className={`p-2.5 text-right font-bold text-emerald-600 ${textStorno}`}>
        {r.type === 'income' ? formatCurrency(r.osszeg) : ''}
      </td>
      <td className={`p-2.5 text-right font-bold text-red-500 ${textStorno}`}>
        {r.type === 'expense' ? formatCurrency(r.osszeg) : ''}
      </td>
      <td
        className={`p-2.5 text-xs hidden xl:table-cell max-w-[180px] truncate ${textStorno}`}
        title={r.megjegyzes || ''}
      >
        {r.isBm ? (
          r.unpaired ? (
            <span className="font-semibold text-red-600">⚠ nincs banki párja</span>
          ) : (
            <span className="text-emerald-600">✓ párosítva</span>
          )
        ) : (
          <span className="text-slate-500">{r.megjegyzes || '—'}</span>
        )}
      </td>
      <td className="p-2.5">
        <div className="flex items-center justify-end gap-1">
          {canEdit && !r.stornozott && !r.isBm && (
            <button
              type="button"
              title="Szerkesztés"
              onClick={() => onEdit(r)}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {canChitanta && r.type === 'income' && !r.isBm && !r.stornozott ? (
            chitantakByBefizetes[r.id] ? (
              <button
                type="button"
                title={`Nyugta újranyomtatása — ${chitantakByBefizetes[r.id].sorozat} ${
                  chitantakByBefizetes[r.id].szam
                }`}
                onClick={() => onReprintChitanta(chitantakByBefizetes[r.id].id)}
                className="inline-flex items-center justify-center rounded-md bg-emerald-100/70 border border-emerald-200 p-1.5 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 transition-colors"
              >
                <Printer className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                title="Nyugta automatikus kiállítása és nyomtatása"
                disabled={autoIssuingFor === r.id}
                onClick={() => void onIssueChitanta(r.id)}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                <Printer className="size-3.5" />
              </button>
            )
          ) : null}
          {/* Storno mindig az UTOLSÓ ikon (egységesen a Kassza/Bank fülön). */}
          {r.stornozott
            ? canUndoStorno && (
                <button
                  type="button"
                  title="Stornó visszavonása"
                  onClick={() => void onUndoStorno(r)}
                  className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )
            : canStorno && (
                <button
                  type="button"
                  title="Stornózás"
                  onClick={() => onStorno(r)}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Ban className="size-3.5" />
                </button>
              )}
        </div>
      </td>
    </tr>
  )
}

function CashSortableTh({
  col,
  sortBy,
  sortDir,
  onClick,
  className,
  align = 'left',
  children,
}: {
  col: CashSortBy
  sortBy: CashSortBy
  sortDir: CashSortDir
  onClick: () => void
  className?: string
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const active = sortBy === col
  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'
  return (
    <th className={`p-2.5 text-${align} text-xs font-medium text-slate-500 ${className || ''}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${
          active ? 'text-emerald-700 font-semibold' : ''
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
      <div className="flex items-center gap-2 mb-1">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className={`text-lg font-bold ${color}`}>
        {value} <span className="text-xs font-normal text-slate-400">RON</span>
      </p>
    </div>
  )
}
