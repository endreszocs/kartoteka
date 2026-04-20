'use client'

import { Fragment, useState, useMemo, useCallback, useEffect } from 'react'
import { Printer, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { deleteTransaction } from '@/app/(dashboard)/penzugy/actions'
import {
  formatCurrency,
  getExpensePartnerName,
  getTransactionDocumentNumber,
  RENTAL_SZAMADASICEL_CODES,
} from '@/lib/constants/finance'
import { HU_MONTHS } from '@/lib/constants/dashboard'
import type { BefitetesRow, KiadasRow, SzamadasiCel, RentalContractRow } from '@/lib/constants/finance'
import { KiseroivPrintDialog } from '@/components/finance/kiseroiv-print-dialog'
import { OblioStatusIcon } from '@/components/finance/oblio-status-icon'
import { OblioExpenseStatusIcon } from '@/components/finance/oblio-expense-status-icon'
import { OblioIssueInvoiceDialog } from '@/components/modals/oblio-issue-invoice-dialog'
import { listOblioMatchesAndKiadasok } from '@/app/(dashboard)/penzugy/oblio-ellenorzes-actions'
import { toast } from 'sonner'

interface TransactionsTabProps {
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  szamadasiCellek: SzamadasiCel[]
  congregationName: string
  onRefresh: () => void
  /**
   * Aktív bérleti szerződések — ha jelen van, a 104.04 / 104.05 kódú befizetés
   * sorokon felajánljuk a „Számlát kiállít" gombot, ha nincs még Oblio match.
   */
  rentalContracts?: RentalContractRow[]
}

type UnifiedRow = {
  type: 'income' | 'expense'
  id: number
  datum: string
  osszeg: number
  label: string
  category: string
  iratszam: string
  irattipus: string
  isBm: boolean
  /** A korábbi „Párosítás" fül hiányosság-jelzései */
  hasMissingPerson: boolean
  hasMissingCategory: boolean
  /** A nyers kiadás sor (kísérőív nyomtatáshoz) */
  rawExpense?: KiadasRow
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
}: TransactionsTabProps) {
  const [monthFilter, setMonthFilter] = useState<number | ''>('')
  const [kiseroivDate, setKiseroivDate] = useState<string | null>(null)
  const [invoiceContract, setInvoiceContract] = useState<RentalContractRow | null>(null)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)

  /** Kiadás-ID → SPV match (ha van). A `oblio_kiadas_match` tábla alapján,
   *  egyszer betöltve a fül megjelenítésekor. */
  const [expenseSpvMatchedIds, setExpenseSpvMatchedIds] = useState<Set<number>>(new Set())
  const [spvMatchesLoaded, setSpvMatchesLoaded] = useState(false)

  // Az aktuális év a tranzakciók dátumából — a teljesen offline matching-hez
  // (a Tranzakciók fülön minden évi adat látszhat, de itt csak a leggyakoribb
  // évre kérdezünk, amelyik a sorok többségéé).
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
    let cancelled = false
    Promise.resolve()
      .then(async () => {
        const res = await listOblioMatchesAndKiadasok(dominantYear)
        if (cancelled) return
        if (res.matches) {
          setExpenseSpvMatchedIds(new Set(res.matches.map((m) => m.kiadas_id)))
        }
        setSpvMatchesLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setSpvMatchesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [dominantYear])

  /** Bérleti díj-jellegű befizetésekhez tartozó id_befizetescel-ek halmaza. */
  const rentalCelIds = useMemo(() => {
    const set = new Set<number>()
    for (const [idStr, kod] of Object.entries(bevCelMap)) {
      if ((RENTAL_SZAMADASICEL_CODES as readonly string[]).includes(kod)) {
        set.add(Number(idStr))
      }
    }
    return set
  }, [bevCelMap])

  /** Bérlő-név → szerződés gyors lookup (kisbetűsen, ilyenkor a befizetés
   * `forrasa` mezőjét hasonlítjuk hozzá). Csak nem-comodat szerződéseket. */
  const rentalByName = useMemo(() => {
    const map = new Map<string, RentalContractRow>()
    const today = new Date().toISOString().slice(0, 10)
    for (const c of rentalContracts) {
      if (c.deleted || !c.aktiv) continue
      if (c.jogi_tipus === 'comodat') continue
      if (c.vege && c.vege < today) continue
      const key = (c.berlo_nev || '').trim().toLowerCase()
      if (key) map.set(key, c)
      // Cég neve külön kulcsként is — ha a befizetés `forrasa`-ban a cég
      // szerepel
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
    // Lazy fallback: ilike-jellegű — keressük, hogy van-e olyan szerződés,
    // amelynek a bérlő neve szerepel a forrásban (vagy fordítva).
    for (const [name, contract] of rentalByName.entries()) {
      if (key.includes(name) || name.includes(key)) return contract
    }
    return null
  }

  /** Befizetés ID → szerződés map (csak ha 104.04/104.05 + matchel). */
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

  const rows: UnifiedRow[] = useMemo(() => {
    const all: UnifiedRow[] = [
      ...incomeRecords.map((r) => ({
        type: 'income' as const,
        id: r.id,
        datum: r.datum,
        osszeg: r.osszeg,
        label: r.forrasa || '\u2014',
        category: bevCelMap[r.id_befizetescel || 0]
          ? getCelName(bevCelMap[r.id_befizetescel || 0])
          : '\u2014',
        iratszam: getTransactionDocumentNumber(r) || '\u2014',
        irattipus: r.irattipus || '\u2014',
        isBm: !!r.belso_mozgas_xkey,
        // Hiányos adatok jelzése (a régi „Párosítás" fül logikája)
        hasMissingPerson: !r.id_szemely && !r.id_csalad && !r.belso_mozgas_xkey,
        hasMissingCategory: !r.id_befizetescel,
      })),
      ...expenseRecords.map((r) => ({
        type: 'expense' as const,
        id: r.id,
        datum: r.datum,
        osszeg: r.osszeg,
        label: getExpensePartnerName(r) || '\u2014',
        category: kiaCelMap[r.id_kiadascel || 0]
          ? getCelName(kiaCelMap[r.id_kiadascel || 0])
          : '\u2014',
        iratszam: getTransactionDocumentNumber(r) || '\u2014',
        irattipus: r.irattipus || '\u2014',
        isBm: !!r.belso_mozgas_xkey,
        hasMissingPerson: false, // kiadásnál nem kötelező személy
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
  }, [incomeRecords, expenseRecords, monthFilter, bevCelMap, kiaCelMap])

  // Éves kísérőív sorszámozás: minden nap amelyen volt kiadás kap egy sorszámot
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

  // Napi kiadási kísérőív — dialógus megnyitása
  const handlePrintKiseroiv = useCallback(
    (date: string) => {
      const dayExpenses = expenseRecords
        .filter((r) => !r.deleted && (r.datum || '').split('T')[0] === date)
        .sort((a, b) => a.id - b.id)

      if (dayExpenses.length === 0) {
        toast.error('Nincs kiadás ezen a napon.')
        return
      }

      setKiseroivDate(date)
    },
    [expenseRecords],
  )

  // Kísérőív dialógus adatai
  const kiseroivExpenses = useMemo(() => {
    if (!kiseroivDate) return []
    return expenseRecords
      .filter((r) => !r.deleted && (r.datum || '').split('T')[0] === kiseroivDate)
      .sort((a, b) => a.id - b.id)
  }, [kiseroivDate, expenseRecords])

  const kiseroivPageNum = kiseroivDate ? (expenseDayPageMap.get(kiseroivDate) || 1) : 1

  async function handleDelete(type: 'income' | 'expense', id: number) {
    if (!confirm('Biztosan törli ezt a tranzakciót?')) return
    const result = await deleteTransaction(
      type === 'income' ? 'befizetes' : 'kiadas',
      id,
    )
    if (result.error) toast.error(result.error)
    else {
      toast.success('Tranzakció törölve.')
      onRefresh()
    }
  }

  // Sorok hónaponkénti csoportosítása
  const groupedByMonth = useMemo(() => {
    const groups = new Map<
      number,
      { label: string; rows: typeof rows; monthInc: number; monthExp: number }
    >()

    for (const r of rows) {
      const m = new Date(r.datum).getMonth()
      if (!groups.has(m)) {
        groups.set(m, { label: HU_MONTHS[m], rows: [], monthInc: 0, monthExp: 0 })
      }
      const g = groups.get(m)!
      g.rows.push(r)
      if (r.type === 'income') g.monthInc += r.osszeg
      else g.monthExp += r.osszeg
    }

    // Hónapok fordított sorrendben (dec → jan)
    return [...groups.entries()].sort((a, b) => b[0] - a[0])
  }, [rows])

  // Melyik napokon van kiadás (a kísérőív gombhoz)
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
          <p className="text-slate-500">
            Nincs tranzakció ebben az időszakban.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByMonth.map(([monthIdx, group]) => (
            <div key={monthIdx} className="space-y-2">
              {/* Havi elválasztó fejléc */}
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700">
                    {group.label}
                  </span>
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

              {/* Tranzakciós tábla */}
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
                        <th className="p-2.5 text-left text-xs font-medium text-slate-500 hidden lg:table-cell">
                          Iratszám
                        </th>
                        <th className="p-2.5 text-right text-xs font-medium text-slate-500">
                          Összeg
                        </th>
                        <th
                          className="p-2.5 w-8 text-center text-xs font-medium text-slate-500"
                          title="Oblio e-Factura státusz"
                        >
                          <span className="sr-only">Oblio</span>
                          <span aria-hidden>🧾</span>
                        </th>
                        <th className="p-2.5 w-20" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/60">
                      {group.rows.map((r, i) => {
                        const curDate = r.datum?.split('T')[0]
                        const prevDate =
                          i > 0
                            ? group.rows[i - 1].datum?.split('T')[0]
                            : null
                        const showDateHeader = curDate !== prevDate
                        const hasExpenseOnDay = expenseDates.has(curDate || '')
                        const pageNum = expenseDayPageMap.get(curDate || '')

                        return (
                          <Fragment key={`${r.type}-${r.id}`}>
                            {showDateHeader && (
                              <tr className="bg-secondary/55">
                                <td
                                  colSpan={7}
                                  className="px-2.5 py-1.5"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-500">
                                      {curDate}
                                    </span>
                                    {hasExpenseOnDay && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handlePrintKiseroiv(curDate || '')
                                        }
                                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                                        title={`Kiadási kísérőív (pg. ${pageNum})`}
                                      >
                                        <Printer className="size-3" />
                                        Kísérőív (pg.{' '}
                                        {pageNum})
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr className="transition-colors hover:bg-secondary/55">
                              <td className="p-2.5 text-slate-400 text-xs">
                                {curDate}
                              </td>
                              <td className="p-2.5">
                                <div className="flex items-center gap-1">
                                  {(r.hasMissingPerson || r.hasMissingCategory) && (
                                    <span
                                      title={[
                                        r.hasMissingPerson && 'nincs személy/család hozzárendelve',
                                        r.hasMissingCategory && 'nincs költségvetési cél',
                                      ]
                                        .filter(Boolean)
                                        .join(', ')}
                                    >
                                      <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                                    </span>
                                  )}
                                  <span className={`truncate max-w-[200px] block font-medium ${r.hasMissingPerson ? 'text-amber-700' : 'text-slate-700'}`}>
                                    {r.label}
                                  </span>
                                </div>
                                {r.isBm && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] mt-0.5 border-violet-200 text-violet-600"
                                  >
                                    BM
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2.5 hidden md:table-cell text-xs">
                                <span className={r.hasMissingCategory ? 'text-amber-700 font-medium' : 'text-slate-400'}>
                                  {r.hasMissingCategory ? '⚠ Nincs cél' : r.category}
                                </span>
                              </td>
                              <td className="p-2.5 hidden lg:table-cell text-slate-400 text-xs">
                                {r.iratszam}
                              </td>
                              <td
                                className={`p-2.5 text-right font-bold ${
                                  r.type === 'income'
                                    ? 'text-emerald-600'
                                    : 'text-red-500'
                                }`}
                              >
                                {r.type === 'income' ? '+' : '\u2212'}
                                {formatCurrency(r.osszeg)}
                              </td>
                              <td className="p-2.5 text-center">
                                {r.type === 'income' ? (
                                  /* Befizetésnél: Oblio e-Factura ellenőrzés
                                     + bérleti díjnál „+ Számla" gomb.
                                     A nyugta-kiállítás átkerült a Készpénz
                                     fülre — ott logikailag jobban illeszkedik
                                     (nyugta = készpénzes átvétel). */
                                  <OblioStatusIcon
                                    transactionType="befizetes"
                                    transactionId={r.id}
                                    date={(r.datum || '').split('T')[0]}
                                    partnerName={r.label === '\u2014' ? null : r.label}
                                    amount={r.osszeg}
                                    onIssueInvoice={
                                      incomeContractMap.has(r.id)
                                        ? () => {
                                            setInvoiceContract(incomeContractMap.get(r.id) || null)
                                            setInvoiceDialogOpen(true)
                                          }
                                        : undefined
                                    }
                                  />
                                ) : (
                                  /* Kiadásnál: SPV ellenőrzés ikon */
                                  <OblioExpenseStatusIcon
                                    matched={expenseSpvMatchedIds.has(r.id)}
                                    notYetScanned={!spvMatchesLoaded}
                                    onClick={() => {
                                      window.dispatchEvent(
                                        new CustomEvent('finance-tab-switch', {
                                          detail: 'oblio_ellenorzes',
                                        }),
                                      )
                                    }}
                                  />
                                )}
                              </td>
                              <td className="p-2.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                                  onClick={() =>
                                    handleDelete(r.type, r.id)
                                  }
                                >
                                  {'\u2715'}
                                </Button>
                              </td>
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

      {/* Kiadási kísérőív nyomtatási dialógus */}
      {kiseroivDate && (
        <KiseroivPrintDialog
          open={!!kiseroivDate}
          onOpenChange={(open) => { if (!open) setKiseroivDate(null) }}
          expenses={kiseroivExpenses}
          date={kiseroivDate}
          pageNumber={kiseroivPageNum}
          congregationName={congregationName}
          kiaCelMap={kiaCelMap}
          cellek={szamadasiCellek}
        />
      )}

      {/* Számlakiállítási dialógus — bérleti díj-jellegű befizetésről indítható
          a tranzakciók listájáról. Az `OblioIssueInvoiceDialog` újra-használja
          a Bérleti szerződések fülön is működő logikát (közös DTO + Oblio API). */}
      <OblioIssueInvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        contract={invoiceContract}
        onIssued={onRefresh}
      />

      {/* A nyugta-kiállítás (ChitantaIssueDialog) és újranyomtatás
          (ChitantaReprintDialog) ÁTKERÜLT a Készpénz fülre — ott a
          készpénzes befizetéseknél jelenik meg, ahol logikailag is
          a helye van. */}
    </div>
  )
}
