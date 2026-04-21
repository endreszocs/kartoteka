'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency, getExpensePartnerName, getTransactionDocumentNumber } from '@/lib/constants/finance'
import { HU_MONTHS } from '@/lib/constants/dashboard'
import type { BefitetesRow, KiadasRow } from '@/lib/constants/finance'
import { Wallet, ArrowUpRight, ArrowDownRight, ArrowLeftRight, AlertTriangle, Printer, Pencil, Ban, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { ChitantaSilentPrint } from '@/components/finance/chitanta-silent-print'
import { ChitantaTombokPanel } from '@/components/finance/chitanta-tombok-panel'
import { ChitantaTombRequiredDialog } from '@/components/modals/chitanta-tomb-required-dialog'
import { StornoConfirmDialog } from '@/components/modals/storno-confirm-dialog'
import { TransactionEditDialog } from '@/components/modals/transaction-edit-dialog'
import {
  autoIssueChitantaForBefizetes,
  getChitantakForBefizetesek,
} from '@/app/(dashboard)/penzugy/chitanta-actions'
import { undoStornoTransaction } from '@/app/(dashboard)/penzugy/edit-storno-actions'

interface CashbookTabProps {
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  carryoverCash: number
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  szamadasiCellek: { id: string; nev?: string; kod?: string; sorszam: number }[]
  /** Gyülekezet neve — a nyugtatömb kimutatás fejlécében jelenik meg. */
  congregationName?: string
  /** Bevétel kategóriák — a szerkesztő dialóg dropdown-jához. */
  incomeCategories?: { id: number; kod: string; nev: string }[]
  /** Kiadás kategóriák — a szerkesztő dialóg dropdown-jához. */
  expenseCategories?: { id: number; kod: string; nev: string }[]
  /** Callback, amelyet sikeres szerkesztés / stornó után hívunk, hogy a parent frissítsen. */
  onTransactionChanged?: () => void | Promise<void>
}

interface CashRow {
  id: number
  type: 'income' | 'expense'
  datum: string
  osszeg: number
  partner: string
  celNev: string
  iratszam: string
  isBm: boolean
  megjegyzes?: string
  /** A korábbi „Párosítás" fül hiányosság-jelzései (most már soron belül) */
  hasMissingPerson: boolean
  hasMissingCategory: boolean
  /** Ha stornózva van, a sor láthatóan megjelölve — de a számításokból kimarad. */
  stornozott: boolean
  stornozottIndok: string | null
  /** A kategória ID-ja (szerkesztéshez és frissítéshez). */
  idCel: number | null
}

type CashSortBy = 'datum' | 'jogcim' | 'iratszam' | 'partner' | 'osszeg'
type CashSortDir = 'asc' | 'desc'

export function CashbookTab({ incomeRecords, expenseRecords, carryoverCash, bevCelMap, kiaCelMap, szamadasiCellek, congregationName, incomeCategories = [], expenseCategories = [], onTransactionChanged }: CashbookTabProps) {
  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<CashSortBy>('datum')
  const [sortDir, setSortDir] = useState<CashSortDir>('desc')

  function toggleSort(col: CashSortBy) {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir(col === 'datum' ? 'desc' : 'asc')
    }
  }

  /** A közvetlen (dialog nélküli) nyomtatáshoz — a kassza táblában a már
   *  kiállított nyugtáknál egy kattintásra indul a print. Auto-kiállítás
   *  esetén is ezt használjuk (a chitanta létrejötte után azonnal nyomtat). */
  const [silentPrintChitantaId, setSilentPrintChitantaId] = useState<string | null>(null)
  const [autoIssuingFor, setAutoIssuingFor] = useState<number | null>(null)
  /** A ChitantaTombokPanel frissítéséhez — a nyugta kiállítás (és a lezárás) után inkrementál. */
  const [tombRefreshKey, setTombRefreshKey] = useState(0)
  /** Ha nincs aktív tömb, nyitjuk a felszólító dialogot — és tároljuk, melyik
   *  befizetéshez szerettünk volna nyugtát állítani, hogy a tömb rögzítése után
   *  automatikusan újra lefusson a kiállítás. */
  const [tombRequiredOpen, setTombRequiredOpen] = useState(false)
  const [pendingBefizetesId, setPendingBefizetesId] = useState<number | null>(null)

  // ─── Szerkesztés / Stornó state ─────────────────────────────
  const [editDialog, setEditDialog] = useState<{
    open: boolean
    type: 'befizetes' | 'kiadas'
    id: number | null
    initial?: { datum: string; osszeg: number; id_cel: number | null; iratszam: string | null; megjegyzes: string | null }
  }>({ open: false, type: 'befizetes', id: null })
  const [stornoDialog, setStornoDialog] = useState<{
    open: boolean
    type: 'befizetes' | 'kiadas'
    id: number | null
    summary?: string
    isInternalTransfer?: boolean
  }>({ open: false, type: 'befizetes', id: null })

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
      summary: `${r.datum?.slice(0, 10)} — ${r.partner} — ${formatCurrency(r.osszeg)} RON — ${r.celNev || 'nincs cél'}`,
      isInternalTransfer: r.isBm,
    })
  }

  async function handleUndoStorno(r: CashRow) {
    if (!confirm('Visszavonod a stornót? A tétel ismét bekerül a számításokba.')) return
    const res = await undoStornoTransaction({
      type: r.type === 'income' ? 'befizetes' : 'kiadas',
      id: r.id,
    })
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Stornó visszavonva.')
    if (onTransactionChanged) await onTransactionChanged()
  }

  // A chitanta kiállítás magát egy külön függvénybe emelem, hogy a „retry" is
  // újra hívni tudja a tömb rögzítése után.
  async function issueChitantaForRow(rowId: number) {
    setAutoIssuingFor(rowId)
    try {
      const result = await autoIssueChitantaForBefizetes(rowId)
      // Speciális: nincs aktív tömb → dialogot nyitunk toast helyett
      if ('errorCode' in result && result.errorCode === 'NO_ACTIVE_BLOCK') {
        setPendingBefizetesId(rowId)
        setTombRequiredOpen(true)
        return
      }
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      if (result.chitantaId) {
        setChitantakByBefizetes(prev => ({
          ...prev,
          [rowId]: {
            id: result.chitantaId!,
            sorozat: result.sorozat || '',
            szam: result.nyomdaiSzam || 0,
          },
        }))
        setSilentPrintChitantaId(result.chitantaId)
        setTombRefreshKey(k => k + 1)
        if (typeof result.maradek === 'number' && result.maradek <= 10) {
          toast.warning(`Figyelem: csak ${result.maradek} nyugta maradt az aktív tömbben.`)
        }
      }
    } finally {
      setAutoIssuingFor(null)
    }
  }

  // A dialog wizard sikeres lezárása után → újra lefuttatjuk az eredeti kiállítást
  async function handleTombCreatedRetry() {
    setTombRefreshKey(k => k + 1)
    const id = pendingBefizetesId
    setPendingBefizetesId(null)
    if (id != null) {
      toast.success('Tömb rögzítve — nyugta kiállítása folytatódik.')
      await issueChitantaForRow(id)
    }
  }

  /** Befizetés-ID → meglévő chitanță map. Egyszer fetcheljük, és a sorokon
   *  jelezzük, hogy van-e már kiállított nyugta. */
  const [chitantakByBefizetes, setChitantakByBefizetes] = useState<
    Record<number, { id: string; sorozat: string; szam: number }>
  >({})

  function getCelName(kod: string): string {
    return szamadasiCellek.find(c => c.id === kod)?.nev || kod
  }

  // Készpénzes befizetés-ID-k betöltése (a chitanță map-hez)
  const cashIncomeIds = useMemo(() => {
    return incomeRecords
      .filter(r => r.irattipus && r.irattipus.toLowerCase().includes('készpénz'))
      .map(r => r.id)
  }, [incomeRecords])

  useEffect(() => {
    let cancelled = false
    if (cashIncomeIds.length === 0) {
      setChitantakByBefizetes({})
      return
    }
    Promise.resolve()
      .then(async () => {
        const res = await getChitantakForBefizetesek(cashIncomeIds)
        if (cancelled) return
        if (res.data) setChitantakByBefizetes(res.data)
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      cancelled = true
    }
  }, [cashIncomeIds])

  // Csak készpénzes tételek
  const cashRows: CashRow[] = useMemo(() => {
    const rows: CashRow[] = []

    incomeRecords.forEach(r => {
      if (!r.irattipus || !r.irattipus.toLowerCase().includes('készpénz')) return
      const hasMissingPerson = !r.id_szemely && !r.id_csalad && !r.belso_mozgas_xkey
      const hasMissingCategory = !r.id_befizetescel
      const stornozott = (r as unknown as { stornozott?: boolean }).stornozott === true
      const stornozottIndok = (r as unknown as { stornozott_indok?: string | null }).stornozott_indok ?? null
      rows.push({
        id: r.id, type: 'income', datum: r.datum, osszeg: r.osszeg,
        partner: r.forrasa || 'Gyülekezeti tag',
        celNev: bevCelMap[r.id_befizetescel || 0] ? getCelName(bevCelMap[r.id_befizetescel || 0]) : '',
        iratszam: getTransactionDocumentNumber(r) || '', isBm: !!r.belso_mozgas_xkey, megjegyzes: r.megjegyzes || undefined,
        hasMissingPerson, hasMissingCategory,
        stornozott, stornozottIndok,
        idCel: r.id_befizetescel ?? null,
      })
    })

    expenseRecords.forEach(r => {
      if (!r.irattipus || !r.irattipus.toLowerCase().includes('készpénz')) return
      const hasMissingPerson = false // kiadásoknál nem kötelező személy
      const hasMissingCategory = !r.id_kiadascel
      const stornozott = (r as unknown as { stornozott?: boolean }).stornozott === true
      const stornozottIndok = (r as unknown as { stornozott_indok?: string | null }).stornozott_indok ?? null
      rows.push({
        id: r.id, type: 'expense', datum: r.datum, osszeg: r.osszeg,
        partner: getExpensePartnerName(r) || '—',
        celNev: kiaCelMap[r.id_kiadascel || 0] ? getCelName(kiaCelMap[r.id_kiadascel || 0]) : '',
        iratszam: getTransactionDocumentNumber(r) || '', isBm: !!r.belso_mozgas_xkey, megjegyzes: r.megjegyzes || undefined,
        hasMissingPerson, hasMissingCategory,
        stornozott, stornozottIndok,
        idCel: r.id_kiadascel ?? null,
      })
    })

    return rows.sort((a, b) => a.datum.localeCompare(b.datum))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeRecords, expenseRecords])

  // Hónap szűrés + egyenleg számítás
  const { displayRows, openingBalance, closingBalance, monthIncome, monthExpense } = useMemo(() => {
    let opening = carryoverCash
    let monthInc = 0
    let monthExp = 0
    const display: CashRow[] = []

    cashRows.forEach(r => {
      const m = new Date(r.datum).getMonth()

      if (monthFilter !== 'all') {
        if (m < monthFilter) {
          // Előző hónapok → nyitóegyenlegbe (stornózott tételek kimaradnak)
          if (!r.stornozott) {
            if (r.type === 'income') opening += r.osszeg
            else opening -= r.osszeg
          }
          return
        }
        if (m > monthFilter) return
      }

      // A stornózott sorokat mutatjuk, de a havi összesítőből kihagyjuk
      display.push(r)
      if (!r.stornozott) {
        if (r.type === 'income') monthInc += r.osszeg
        else monthExp += r.osszeg
      }
    })

    // Sortálás a kiválasztott oszlop szerint (default: dátum desc)
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
          cmp = (a.iratszam || '').localeCompare(b.iratszam || '', 'hu', { numeric: true })
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

  // Havi csoportosítás — a tranzakciók fülhöz hasonlóan
  const groupedByMonth = useMemo(() => {
    const groups = new Map<number, {
      label: string
      rows: typeof displayRows
      monthInc: number
      monthExp: number
    }>()
    for (const r of displayRows) {
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
  }, [displayRows])

  return (
    <div className="space-y-4">
      {/* KPI sáv */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniKpi label="Nyitó egyenleg" value={formatCurrency(openingBalance)} color="text-slate-700" icon={<Wallet className="w-4 h-4" />} />
        <MiniKpi label="Bevétel" value={`+${formatCurrency(monthIncome)}`} color="text-emerald-600" icon={<ArrowUpRight className="w-4 h-4" />} />
        <MiniKpi label="Kiadás" value={`-${formatCurrency(monthExpense)}`} color="text-red-500" icon={<ArrowDownRight className="w-4 h-4" />} />
        <MiniKpi label="Záró egyenleg" value={formatCurrency(closingBalance)} color={closingBalance >= 0 ? 'text-emerald-600' : 'text-red-600'} icon={<Wallet className="w-4 h-4" />} highlight />
      </div>

      {/* Nyugtatömb panel — aktív tömb élő státusza + menedzsment */}
      <div className="card-raised p-4">
        <ChitantaTombokPanel
          congregationName={congregationName || ''}
          refreshKey={tombRefreshKey}
        />
      </div>

      {/* Szűrő */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
          <option value="all">Minden hónap</option>
          {HU_MONTHS.map((name, i) => <option key={i} value={i}>{name}</option>)}
        </select>
        <span className="text-sm text-slate-400">{displayRows.length} tétel</span>
        {/* Globális "Új nyugta kiállítás" gomb eltávolítva 2026-04-18 —
            a nyugta a bevétel rögzítésekor automatikusan létrejön, a sor végi
            nyomtató ikonnal pedig újranyomtatható. */}
      </div>

      {/* Tranzakciók — havi csoportosítva (a tranzakciók fülhöz hasonlóan) */}
      {displayRows.length === 0 ? (
        <div className="card-raised p-8 text-center">
          <Wallet className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Nincs készpénzes forgalom {monthFilter !== 'all' ? 'ebben a hónapban' : 'ebben az évben'}.</p>
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
                  <span className="text-emerald-600 font-semibold">+{formatCurrency(group.monthInc)}</span>
                  <span className="text-red-500 font-semibold">−{formatCurrency(group.monthExp)}</span>
                </div>
              </div>

              {/* Havi tábla */}
              <div className="card-raised overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                      <tr>
                        <CashSortableTh col="datum" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('datum')}>Dátum</CashSortableTh>
                        <CashSortableTh col="jogcim" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('jogcim')}>Jogcím</CashSortableTh>
                        <CashSortableTh col="iratszam" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('iratszam')} className="hidden md:table-cell">Iratszám</CashSortableTh>
                        <CashSortableTh col="partner" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('partner')}>Partner</CashSortableTh>
                        <CashSortableTh col="osszeg" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('osszeg')} align="right">Bevétel</CashSortableTh>
                        <CashSortableTh col="osszeg" sortBy={sortBy} sortDir={sortDir} onClick={() => toggleSort('osszeg')} align="right">Kiadás</CashSortableTh>
                        <th className="p-2.5 w-12 text-center text-xs font-medium text-slate-500" title="Nyugta (chitanță)">🧾</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.rows.map(r => {
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
                        <tr key={`${r.type}-${r.id}`} className={`transition-colors ${rowBg}`} style={rowBorder}>
                          <td className={`p-2.5 text-slate-500 text-xs whitespace-nowrap ${textStorno}`}>{r.datum?.split('T')[0]}</td>
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
                              <span className={`font-medium ${textStorno} ${!r.stornozott && (r.isBm ? 'text-violet-700' : r.hasMissingCategory ? 'text-amber-700' : 'text-slate-700')}`}>
                                {r.celNev || (r.hasMissingCategory ? '⚠ Nincs cél' : '—')}
                              </span>
                            </div>
                            {r.stornozott && r.stornozottIndok && (
                              <p className="text-[10px] text-red-600/90 italic mt-0.5 truncate max-w-[200px]">
                                Stornó indok: {r.stornozottIndok}
                              </p>
                            )}
                          </td>
                          <td className={`p-2.5 text-slate-400 text-xs hidden md:table-cell ${textStorno}`}>{r.iratszam || '—'}</td>
                          <td className="p-2.5">
                            <span className={`font-medium text-xs ${textStorno || (r.hasMissingPerson ? 'text-amber-700' : 'text-slate-700')}`}>
                              {r.hasMissingPerson ? `⚠ ${r.partner}` : r.partner}
                            </span>
                            {r.isBm && r.megjegyzes && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[150px]">{r.megjegyzes}</p>}
                          </td>
                          <td className={`p-2.5 text-right font-bold text-emerald-600 ${textStorno}`}>{r.type === 'income' ? formatCurrency(r.osszeg) : ''}</td>
                          <td className={`p-2.5 text-right font-bold text-red-500 ${textStorno}`}>{r.type === 'expense' ? formatCurrency(r.osszeg) : ''}</td>
                          <td className="p-2.5">
                            <div className="flex items-center justify-end gap-1">
                              {/* Szerkesztés — aktív tételre */}
                              {!r.stornozott && !r.isBm && (
                                <button
                                  type="button"
                                  title="Szerkesztés"
                                  onClick={() => handleOpenEdit(r)}
                                  className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              )}
                              {/* Stornó — aktív tételre; vagy visszavonás, ha stornózva van */}
                              {r.stornozott ? (
                                <button
                                  type="button"
                                  title="Stornó visszavonása"
                                  onClick={() => void handleUndoStorno(r)}
                                  className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                >
                                  <RotateCcw className="size-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  title="Stornózás"
                                  onClick={() => handleOpenStorno(r)}
                                  className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Ban className="size-3.5" />
                                </button>
                              )}
                              {/* Nyugta nyomtatás — csak bevételnél, nem belső mozgás, nem stornózott */}
                              {r.type === 'income' && !r.isBm && !r.stornozott && (
                                chitantakByBefizetes[r.id] ? (
                                  <button
                                    type="button"
                                    title={`Nyugta újranyomtatása — ${chitantakByBefizetes[r.id].sorozat} ${chitantakByBefizetes[r.id].szam}`}
                                    onClick={() => setSilentPrintChitantaId(chitantakByBefizetes[r.id].id)}
                                    className="inline-flex items-center justify-center rounded-md bg-emerald-100/70 border border-emerald-200 p-1.5 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 transition-colors"
                                  >
                                    <Printer className="size-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="Nyugta automatikus kiállítása és nyomtatása"
                                    disabled={autoIssuingFor === r.id}
                                    onClick={() => void issueChitantaForRow(r.id)}
                                    className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                  >
                                    <Printer className="size-3.5" />
                                  </button>
                                )
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
              <span className="text-emerald-600 font-bold">+{formatCurrency(monthIncome)}</span>
              <span className="text-red-500 font-bold">−{formatCurrency(monthExpense)}</span>
            </div>
          </div>
        </div>
      )}

      {/* "Nyugta nyomtatási központ" doboz eltávolítva 2026-04-18 — fölösleges volt,
          minden nyugta a sorok végén újranyomtatható a kis nyomtató ikonnal.
          A ChitantaIssueDialog is eltávolítva — a halvány ikonra kattintva
          automatikusan létrejön a chitanta és azonnal nyomtat. */}

      {/* Közvetlen (dialog nélküli) nyomtatás — a kassza sorában lévő zöld
          print gomb aktiválja. Egy kattintásra megy a nyomtatóra. */}
      <ChitantaSilentPrint
        chitantaId={silentPrintChitantaId}
        onDone={() => setSilentPrintChitantaId(null)}
      />

      {/* Ha nincs aktív nyugtatömb — friendly wizard ami visszavezeti a lelkészt
          a tömb rögzítéséhez, majd automatikusan újrapróbálja a kiállítást. */}
      <ChitantaTombRequiredDialog
        open={tombRequiredOpen}
        onOpenChange={(next) => {
          setTombRequiredOpen(next)
          if (!next) setPendingBefizetesId(null)
        }}
        onTombCreated={handleTombCreatedRetry}
      />

      {/* Szerkesztő — gyors módosítás a leggyakoribb mezőkre */}
      <TransactionEditDialog
        open={editDialog.open}
        onOpenChange={(next) => setEditDialog((s) => ({ ...s, open: next }))}
        type={editDialog.type}
        id={editDialog.id}
        initial={editDialog.initial}
        categories={editDialog.type === 'befizetes' ? incomeCategories : expenseCategories}
        onSaved={async () => {
          if (onTransactionChanged) await onTransactionChanged()
        }}
      />

      {/* Stornó — kötelező indoklással */}
      <StornoConfirmDialog
        open={stornoDialog.open}
        onOpenChange={(next) => setStornoDialog((s) => ({ ...s, open: next }))}
        type={stornoDialog.type}
        id={stornoDialog.id}
        summary={stornoDialog.summary}
        isInternalTransfer={stornoDialog.isInternalTransfer}
        onStornoed={async () => {
          if (onTransactionChanged) await onTransactionChanged()
        }}
      />
    </div>
  )
}

/** Kattintható, sortálható oszlopfejléc — nyíl ikonnal jelzi az aktív rendezést. */
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
  children: React.ReactNode
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
        className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${active ? 'text-emerald-700 font-semibold' : ''}`}
      >
        {children}
        <span className="text-[10px] opacity-60">{arrow}</span>
      </button>
    </th>
  )
}

function MiniKpi({ label, value, color, icon, highlight }: { label: string; value: string; color: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`card-raised p-3.5 ${highlight ? 'ring-1 ring-slate-200' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value} <span className="text-xs font-normal text-slate-400">RON</span></p>
    </div>
  )
}
