'use client'

/**
 * DebtTab — közös tartozás-megjelenítő (Sprint Q Fázis 2, 2026-04-25, v0.6.1).
 *
 * Egyházfenntartási járulék hátralékai + bérleti díj hátralékok megjelenítése.
 * 100% pure-UI — nincs server action, nincs API hívás. Az adatot a szülő
 * (web `FinanceTabs` vagy desktop `PenzugyDashboardPage`) kalkulálja és
 * propsban átadja.
 *
 * 2026-07-10 (S2-1c): év-szerinti bontás + átlátható nézet.
 *   - Új OPCIONÁLIS `debtRowsByYear` prop: év → tagsoronkénti eredmények.
 *     Ha a szülő átadja, a tábla évoszlopokban (max. utolsó 5 év) mutatja a
 *     hátralékot tagonként; ha nincs, minden pontosan úgy működik, mint eddig
 *     (csak a `currentYear` látszik) — web és desktop visszafelé kompatibilis.
 *   - Összesítő kártyák: Összes kintlévőség / Ebből idén esedékes / Érintett
 *     tagok száma (+ a korábbi Éves járulék és Bérleti hátralék kártya).
 *   - Keresés (név, ékezet-független), év-szűrő, „csak tartozók" kapcsoló.
 *   - Kibontható sor-részletek: évenként Elvárt / Befizetett / Hátralék +
 *     alkalmazott kedvezmény-szabályok.
 *   - CSV-export (Excel-kompatibilis, BOM + pontosvessző) a szűrt listáról —
 *     kliensoldali Blob-letöltés, továbbra sincs server-függés.
 *   - A SZÁMÍTÁSI logika érintetlen (computeJarulekForMemberYear a szülőben,
 *     debtCalcMode két módja változatlan) — csak a megjelenítés változott.
 *
 * Eredeti web fájl: `apps/web/components/finance/debt-tab-v2.tsx` (242 sor).
 * Most átkerült a shared package-be — a web tovább működik (re-export wrapper).
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  User,
  Users,
} from 'lucide-react'

import { formatCurrency, normalizeName } from './helpers'
import {
  RENTAL_TIPUS_LABELS,
  type DebtCalcMode,
  type DebtRow,
  type RentalDebtRow,
} from './types'

export interface DebtTabProps {
  debtRows: DebtRow[]
  yearlyFees: Record<number, number>
  currentYear: number
  debtCalcMode: DebtCalcMode
  rentalDebtRows?: RentalDebtRow[]
  /**
   * 2026-07-10 (S2-1c): opcionális év-szerinti bontás — év → tagsoronkénti
   * eredmények (ugyanaz a DebtRow forma, mint a `debtRows`). Ha a szülő
   * átadja, a tábla évoszlopos nézetben jelenik meg (utolsó max. 5 év).
   * Ha hiányzik, a komponens a régi, egyéves nézetre esik vissza.
   */
  debtRowsByYear?: Record<number, DebtRow[]>
}

/** 2026-07-10 (S2-1c): legfeljebb ennyi évoszlop látszik egyszerre. */
const MAX_YEAR_COLUMNS = 5

/** 2026-07-10 (S2-1c): egy tag összevont, évenkénti sora a fő táblához. */
interface MemberDebtSummary {
  memberId: number
  name: string
  perYear: Map<number, DebtRow>
  /** Pozitív hátralékok összege a látható éveken. */
  visibleDebt: number
}

/**
 * Kiskorú-e a tag a látható évek MINDEGYIKÉBEN? Csak ilyenkor rejtjük el —
 * aki a látható időszak alatt betöltötte a 18-at, marad a listán, mert a
 * felnőtt éveire már járulékköteles (és lehet hátraléka).
 * Az olyan évek, amelyekre nincs sora, nem számítanak (nem cáfolnak).
 */
function isMinorInAllVisibleYears(m: MemberDebtSummary, visibleYears: number[]): boolean {
  const rows = visibleYears.map((y) => m.perYear.get(y)).filter(Boolean) as DebtRow[]
  if (rows.length === 0) return false
  return rows.every((row) => row.status === 'kiskoru')
}

function statusLabel(status: DebtRow['status']): string {
  if (status === 'hatralekos') return 'Hátralékos'
  if (status === 'rendezve') return 'Rendezett'
  // 2026-07-16: a 18 éves törvényi korhatár — NEM azonos a presbitériumi felmentéssel.
  if (status === 'kiskoru') return 'Nem járulékköteles'
  return 'Felmentett'
}

export function DebtTab({
  debtRows,
  yearlyFees,
  currentYear,
  debtCalcMode,
  rentalDebtRows = [],
  debtRowsByYear,
}: DebtTabProps) {
  const yearlyFee = yearlyFees[currentYear] || 0
  // 2026-07-17 (F5, Q6): a debtCalcMode prop megmarad (API-kompat), de a mód-címke
  // kivezetve — mindig 'akkori' számítás fut.
  void debtCalcMode

  // ── 2026-07-10 (S2-1c): szűrő-állapotok ────────────────────────────────
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState<'all' | number>('all')
  const [onlyDebtors, setOnlyDebtors] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  // 2026-07-16: a 18 év alattiak ALAPBÓL rejtve (user-döntés) — a hátralék-lista a
  // beszedendő pénzről szól, és nagy gyülekezetben a tagok fele gyerek lehet.
  const [showMinors, setShowMinors] = useState(false)

  // ── 2026-07-10 (S2-1c): év → sorok map, visszaeséssel a currentYear-re ─
  const byYear = useMemo<Record<number, DebtRow[]>>(() => {
    const map: Record<number, DebtRow[]> = debtRowsByYear ? { ...debtRowsByYear } : {}
    // A currentYear mindig a friss `debtRows`-ból jöjjön (a szülő élőben frissíti).
    map[currentYear] = debtRows
    return map
  }, [debtRowsByYear, debtRows, currentYear])

  /** Az összes elérhető év növekvő sorrendben, az utolsó MAX_YEAR_COLUMNS darab. */
  const allYears = useMemo(
    () =>
      Object.keys(byYear)
        .map(Number)
        .filter((y) => Number.isFinite(y))
        .sort((a, b) => a - b)
        .slice(-MAX_YEAR_COLUMNS),
    [byYear],
  )

  const visibleYears = useMemo(
    () => (yearFilter === 'all' ? allYears : allYears.filter((y) => y === yearFilter)),
    [allYears, yearFilter],
  )

  // ── 2026-07-10 (S2-1c): tagonkénti összevonás az éveken át ─────────────
  const members = useMemo<MemberDebtSummary[]>(() => {
    const map = new Map<number, MemberDebtSummary>()
    for (const year of allYears) {
      for (const row of byYear[year] || []) {
        let m = map.get(row.memberId)
        if (!m) {
          m = { memberId: row.memberId, name: row.name, perYear: new Map(), visibleDebt: 0 }
          map.set(row.memberId, m)
        }
        m.perYear.set(year, row)
        if (row.name) m.name = row.name // a legfrissebb évi név nyerjen
      }
    }
    return Array.from(map.values())
  }, [byYear, allYears])

  // ── 2026-07-10 (S2-1c): keresés + szűrés + rendezés ────────────────────
  const filteredMembers = useMemo(() => {
    const needle = normalizeName(search.trim())
    return members
      .map((m) => ({
        ...m,
        visibleDebt: visibleYears.reduce((sum, y) => {
          const row = m.perYear.get(y)
          return sum + (row && row.debt > 0 ? row.debt : 0)
        }, 0),
      }))
      .filter((m) => {
        if (needle && !normalizeName(m.name).includes(needle)) return false
        if (onlyDebtors && m.visibleDebt <= 0) return false
        // Egy tagot CSAK akkor rejtünk el, ha MINDEN látható évben kiskorú volt.
        // Aki közben betöltötte a 18-at, marad a listán (a felnőtt évei számítanak).
        if (!showMinors && isMinorInAllVisibleYears(m, visibleYears)) return false
        return true
      })
      .sort(
        (a, b) => b.visibleDebt - a.visibleDebt || a.name.localeCompare(b.name, 'hu'),
      )
  }, [members, visibleYears, search, onlyDebtors, showMinors])

  /** Hány tag rejtőzik el a kiskorú-szűrő miatt? (a kapcsoló feliratához) */
  const hiddenMinorCount = useMemo(
    () => members.filter((m) => isMinorInAllVisibleYears(m, visibleYears)).length,
    [members, visibleYears],
  )

  // ── 2026-07-10 (S2-1c): összesítő számok a kártyákhoz ──────────────────
  const totalOutstanding = useMemo(
    () =>
      allYears.reduce(
        (sum, y) =>
          sum +
          (byYear[y] || []).reduce((s, row) => s + (row.debt > 0 ? row.debt : 0), 0),
        0,
      ),
    [byYear, allYears],
  )
  const dueThisYear = useMemo(
    () => (byYear[currentYear] || []).reduce((s, row) => s + (row.debt > 0 ? row.debt : 0), 0),
    [byYear, currentYear],
  )
  const affectedMemberCount = useMemo(() => {
    const ids = new Set<number>()
    for (const y of allYears) {
      for (const row of byYear[y] || []) if (row.debt > 0) ids.add(row.memberId)
    }
    return ids.size
  }, [byYear, allYears])

  /** Oszloponkénti (évenkénti) hátralék-összegek a szűrt listára — lábléc. */
  const filteredYearTotals = useMemo(
    () =>
      visibleYears.map((y) =>
        filteredMembers.reduce((sum, m) => {
          const row = m.perYear.get(y)
          return sum + (row && row.debt > 0 ? row.debt : 0)
        }, 0),
      ),
    [visibleYears, filteredMembers],
  )

  // Bérleti hátralék összesítő (változatlan logika)
  const rentalWithDebt = rentalDebtRows.filter((r) => r.hatralek > 0)
  const totalRentalDebt = rentalWithDebt.reduce((sum, r) => sum + r.hatralek, 0)

  const yearRangeLabel =
    allYears.length > 1 ? `${allYears[0]}–${allYears[allYears.length - 1]}` : String(currentYear)
  const anyFilterActive = search.trim() !== '' || yearFilter !== 'all' || onlyDebtors

  function toggleExpanded(memberId: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  /**
   * 2026-07-10 (S2-1c): a szűrt lista CSV-exportja (Excel-kompatibilis:
   * UTF-8 BOM + pontosvessző elválasztó). Kliensoldali Blob-letöltés,
   * nincs szerver-függés — desktopon (Electron) is működik.
   */
  function exportCsv() {
    const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const header = [
      'Név',
      'Állapot',
      ...visibleYears.flatMap((y) => [`Elvárt ${y}`, `Befizetett ${y}`, `Hátralék ${y}`]),
      'Összes hátralék',
    ]
    // 2026-07-10 (CI-fix): explicit (string | number)[] annotáció — a flatMap
    // vegyes (szám + üres string) visszatérése miatt a TS különben rossz
    // paraméter-típust következtet.
    const lines: Array<Array<string | number>> = filteredMembers.map((m) => {
      const latestRow = displayRow(m, visibleYears)
      return [
        m.name,
        latestRow ? statusLabel(latestRow.status) : '',
        ...visibleYears.flatMap((y): Array<string | number> => {
          const row = m.perYear.get(y)
          return row ? [row.expected, row.paid, row.debt] : ['', '', '']
        }),
        m.visibleDebt,
      ]
    })
    // Az U+FEFF (UTF-8 BOM) előtaggal az Excel helyesen ismeri fel az ékezeteket
    const bom = String.fromCharCode(0xfeff)
    const csv =
      bom + [header, ...lines].map((cols) => cols.map(quote).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tartozasok-${yearFilter === 'all' ? yearRangeLabel : yearFilter}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* 2026-07-10 (S2-1c): összesítő kártyák — kintlévőség-fókusz */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <DebtKpiCard
          color="amber"
          icon={<AlertTriangle className="h-5 w-5 text-white" />}
          value={`${formatCurrency(totalOutstanding)} RON`}
          label={`Összes kintlévőség (${yearRangeLabel})`}
        />
        <DebtKpiCard
          color="rose"
          icon={<AlertTriangle className="h-5 w-5 text-white" />}
          value={`${formatCurrency(dueThisYear)} RON`}
          label={`Ebből idén esedékes (${currentYear})`}
        />
        <DebtKpiCard
          color="sky"
          icon={<Users className="h-5 w-5 text-white" />}
          value={String(affectedMemberCount)}
          label="Érintett tag"
        />
        <DebtKpiCard
          color="blue"
          icon={<User className="h-5 w-5 text-white" />}
          value={`${formatCurrency(yearlyFee)} RON`}
          label={`Éves járulék (${currentYear})`}
        />
        <DebtKpiCard
          color="orange"
          icon={<Building2 className="h-5 w-5 text-white" />}
          value={`${formatCurrency(totalRentalDebt)} RON`}
          label={`Bérleti hátralék${
            rentalWithDebt.length ? ` (${rentalWithDebt.length})` : ''
          }`}
        />
      </div>

      <div className="card-raised flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Tényleges járulékállapot</p>
          <p className="text-xs text-slate-500">
            A lista csak az egyházfenntartási befizetésekkel számol, és figyelembe veszi az éves
            kedvezményeket, a határidős kedvezményt és a felmentéseket is.
          </p>
        </div>
        {/* 2026-07-17 (F5, Q6): a mód-jelvény kivezetve — a rendszer mindig az
            „akkori" (a tartozás évének beállításai szerinti) módon számol. */}
      </div>

      {yearlyFee === 0 && (
        <div className="card-raised p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-300" />
          <p className="text-sm text-slate-500">Az éves járulék összege nincs beállítva.</p>
          <p className="mt-1 text-xs text-slate-400">
            Kérjük, állítsa be a Beállítások menüben a járulék összegét.
          </p>
        </div>
      )}

      {yearlyFee > 0 && members.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">
                  Egyházfenntartási státusz tagonként
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {anyFilterActive
                  ? `${filteredMembers.length} / ${members.length} tag (szűrve)`
                  : `${members.length} tag`}
              </span>
            </div>

            {/* 2026-07-10 (S2-1c): kereső + év-szűrő + csak-tartozók + export
                2026-07-10 (S4-mobil): a kereső 375px-en teljes szélességű, minden
                vezérlő min. 40px-es érintőfelületű (max-sm:min-h-10). */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-auto">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Keresés név szerint…"
                  aria-label="Keresés név szerint"
                  className="w-full max-sm:min-h-10 sm:w-52 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300"
                />
              </div>
              {allYears.length > 1 && (
                <select
                  value={yearFilter === 'all' ? 'all' : String(yearFilter)}
                  onChange={(e) =>
                    setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                  aria-label="Év szűrő"
                  className="max-sm:min-h-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300"
                >
                  <option value="all">Minden év ({yearRangeLabel})</option>
                  {[...allYears].reverse().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
              <label className="inline-flex max-sm:min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                <input
                  type="checkbox"
                  checked={onlyDebtors}
                  onChange={(e) => setOnlyDebtors(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                Csak tartozók
              </label>
              {/* 2026-07-16: a 18 év alattiak alapból rejtve — a kapcsoló csak akkor
                  jelenik meg, ha van is mit mutatni (különben csak zaj). */}
              {hiddenMinorCount > 0 && (
                <label
                  className="inline-flex max-sm:min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm"
                  title="A járulék hivatalosan 18 éves kortól jár, ezért a kiskorúak alapból nem szerepelnek a listán."
                >
                  <input
                    type="checkbox"
                    checked={showMinors}
                    onChange={(e) => setShowMinors(e.target.checked)}
                    className="h-3.5 w-3.5 accent-slate-500"
                  />
                  Kiskorúak is ({hiddenMinorCount})
                </label>
              )}
              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredMembers.length === 0}
                title="A (szűrt) lista letöltése CSV-ben (Excelben megnyitható)"
                className="ml-auto inline-flex max-sm:min-h-10 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export (CSV)
              </button>
            </div>
          </div>

          {/* 2026-07-10 (S4-mobil): min-w — telefonon a sok évoszlopos tábla
              vízszintesen görgethető; tabular-nums az összeg-oszlopokhoz. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm tabular-nums">
              <thead className="border-b border-slate-100 bg-white/85">
                <tr>
                  <th className="w-8 p-3" aria-label="Részletek" />
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Név</th>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Állapot</th>
                  {visibleYears.map((y) => (
                    <th
                      key={y}
                      className={`p-3 text-right text-xs font-medium ${
                        y === currentYear ? 'text-slate-700' : 'text-slate-500'
                      }`}
                    >
                      Hátralék {y}
                    </th>
                  ))}
                  <th className="p-3 text-right text-xs font-medium text-slate-500">
                    Összes hátralék
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.length === 0 && (
                  <tr>
                    <td
                      colSpan={4 + visibleYears.length}
                      className="p-6 text-center text-xs text-slate-400"
                    >
                      Nincs a szűrésnek megfelelő tag.
                    </td>
                  </tr>
                )}
                {filteredMembers.map((m) => {
                  const isOpen = expanded.has(m.memberId)
                  const latestRow = displayRow(m, visibleYears)
                  return (
                    <MemberRows
                      key={m.memberId}
                      member={m}
                      latestRow={latestRow}
                      visibleYears={visibleYears}
                      currentYear={currentYear}
                      isOpen={isOpen}
                      onToggle={() => toggleExpanded(m.memberId)}
                    />
                  )
                })}
              </tbody>
              {filteredMembers.length > 0 && (
                <tfoot className="border-t border-slate-200 bg-slate-50/70">
                  <tr>
                    <td className="p-3" />
                    <td className="p-3 text-xs font-semibold text-slate-600" colSpan={2}>
                      Összesen ({filteredMembers.length} tag)
                    </td>
                    {filteredYearTotals.map((total, i) => (
                      <td
                        key={visibleYears[i]}
                        className={`p-3 text-right text-xs font-semibold ${
                          total > 0 ? 'text-red-500' : 'text-emerald-600'
                        }`}
                      >
                        {formatCurrency(total)} RON
                      </td>
                    ))}
                    <td
                      className={`p-3 text-right text-xs font-bold ${
                        filteredYearTotals.reduce((a, b) => a + b, 0) > 0
                          ? 'text-red-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrency(filteredYearTotals.reduce((a, b) => a + b, 0))} RON
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 2026-07-10 (S2-1c): magyarázó lábléc az évoszlopokhoz */}
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
            {allYears.length > 1
              ? `Az évoszlopok az utolsó ${allYears.length} év hátralékát mutatják (${yearRangeLabel}). A sor elején lévő nyíllal évenkénti részletek nyithatók (elvárt / befizetett / kedvezmények).`
              : 'Jelenleg csak a kiválasztott év adata érhető el. A sor elején lévő nyíllal a részletek nyithatók (elvárt / befizetett / kedvezmények).'}
          </div>
        </div>
      )}

      {yearlyFee > 0 && members.length === 0 && (
        <div className="card-raised p-8 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-300" />
          <p className="text-sm font-medium text-emerald-600">
            Még nincs aktív, számolható járuléksor ehhez az évhez.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Ha vannak látható tagok és beállított éves járulék, itt fog megjelenni a részletes
            lista.
          </p>
        </div>
      )}

      {/* Bérleti hátralék szekció */}
      {rentalDebtRows.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-orange-50/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-semibold text-slate-700">
                Bérleti szerződések — hátralék
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {rentalWithDebt.length > 0
                ? `${rentalWithDebt.length} bérlőnél van hátralék`
                : 'Nincs hátralékos bérlő'}
            </span>
          </div>

          {rentalWithDebt.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-emerald-300" />
              <p className="text-sm font-medium text-emerald-600">
                Minden bérleti díj rendezve az elmúlt 2 évben.
              </p>
            </div>
          ) : (
            // 2026-07-10 (S4-mobil): min-w + tabular-nums — telefonon görgethető tábla.
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm tabular-nums">
                <thead className="border-b border-slate-100 bg-white/85">
                  <tr>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Bérlő</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Leírás</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Típus</th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">Éves díj</th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">
                      Befizetett
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">Hátralék</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentalWithDebt.map((r) => (
                    <tr key={r.contractId} className="hover:bg-orange-50/40">
                      <td className="p-3 font-medium text-slate-700">{r.berlo_nev}</td>
                      <td className="p-3 text-slate-600">
                        <span className="line-clamp-1">{r.leiras}</span>
                      </td>
                      <td className="p-3 text-slate-500 text-xs">{RENTAL_TIPUS_LABELS[r.tipus]}</td>
                      <td className="p-3 text-right text-slate-600">
                        {formatCurrency(r.evesDij)} RON
                      </td>
                      <td className="p-3 text-right text-slate-600">
                        {formatCurrency(r.fizett)} RON
                      </td>
                      <td className="p-3 text-right font-semibold text-red-500">
                        {formatCurrency(r.hatralek)} RON
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
            A hátralékot a rendszer az utolsó 2 évre számolja (szerződés szerinti arányosítással
            és a befizetések dupla-párosításával — személy ID VAGY bérlő neve alapján).
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 2026-07-10 (S2-1c): a fő sorban mutatott állapot-sor kiválasztása — a
 * legutóbbi olyan látható év sora, amelyre van adat.
 */
function displayRow(member: MemberDebtSummary, visibleYears: number[]): DebtRow | null {
  for (let i = visibleYears.length - 1; i >= 0; i--) {
    const row = member.perYear.get(visibleYears[i])
    if (row) return row
  }
  return null
}

/**
 * 2026-07-10 (S2-1c): egy tag fő sora + (kibontva) évenkénti részlet-sor.
 * Külön komponens, hogy a tbody map olvasható maradjon.
 */
function MemberRows({
  member,
  latestRow,
  visibleYears,
  currentYear,
  isOpen,
  onToggle,
}: {
  member: MemberDebtSummary
  latestRow: DebtRow | null
  visibleYears: number[]
  currentYear: number
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="hover:bg-slate-50/70">
        <td className="p-2 text-center">
          {/* 2026-07-10 (S4-mobil): max-sm 40px-es érintőfelület a kibontó nyílnak. */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={`${member.name} évenkénti részletei`}
            className="inline-flex items-center justify-center rounded p-1 max-sm:min-h-10 max-sm:min-w-10 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="p-3 font-medium text-slate-700">{member.name}</td>
        <td className="p-3">
          {latestRow ? (
            <span className={statusClassName(latestRow.status)}>
              {statusLabel(latestRow.status)}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        {visibleYears.map((y) => {
          const row = member.perYear.get(y)
          if (!row) {
            return (
              <td key={y} className="p-3 text-right text-xs text-slate-300">
                nincs adat
              </td>
            )
          }
          return (
            <td
              key={y}
              className={`p-3 text-right ${
                row.debt > 0
                  ? 'font-semibold text-red-500'
                  : row.status === 'felmentett'
                    ? 'text-sky-600'
                    : row.status === 'kiskoru'
                      ? 'text-slate-400'
                      : 'text-emerald-600'
              } ${y === currentYear ? 'bg-slate-50/60' : ''}`}
            >
              {row.status === 'kiskoru' && row.expected === 0
                ? '—'
                : row.status === 'felmentett' && row.expected === 0
                  ? 'felmentve'
                  : `${formatCurrency(row.debt)} RON`}
            </td>
          )
        })}
        <td
          className={`p-3 text-right font-semibold ${
            member.visibleDebt > 0 ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {formatCurrency(member.visibleDebt)} RON
        </td>
      </tr>

      {isOpen && (
        <tr className="bg-slate-50/50">
          <td colSpan={4 + visibleYears.length} className="p-0">
            <div className="px-6 py-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-1.5 pr-3 text-left font-medium">Év</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Elvárt</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Befizetett</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Hátralék</th>
                    <th className="pb-1.5 text-left font-medium">Kedvezmény / szabály</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleYears.map((y) => {
                    const row = member.perYear.get(y)
                    if (!row) {
                      return (
                        <tr key={y}>
                          <td className="py-1.5 pr-3 font-medium text-slate-500">{y}</td>
                          <td colSpan={4} className="py-1.5 text-slate-300">
                            nincs számolható adat erre az évre
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={y}>
                        <td className="py-1.5 pr-3 font-medium text-slate-600">
                          {y}
                          {y === currentYear && (
                            <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                              aktuális
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {formatCurrency(row.expected)} RON
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {formatCurrency(row.paid)} RON
                        </td>
                        <td
                          className={`py-1.5 pr-3 text-right font-semibold ${
                            row.debt > 0 ? 'text-red-500' : 'text-emerald-600'
                          }`}
                        >
                          {formatCurrency(row.debt)} RON
                        </td>
                        <td className="py-1.5 text-slate-500">
                          {row.appliedRules.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {row.appliedRules.map((rule) => (
                                <span
                                  key={rule}
                                  className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700"
                                >
                                  {rule}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">Teljes éves járulék</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

interface DebtKpiCardProps {
  color: 'amber' | 'emerald' | 'sky' | 'blue' | 'orange' | 'rose'
  icon: ReactNode
  value: string
  label: string
}

function DebtKpiCard({ color, icon, value, label }: DebtKpiCardProps) {
  const palette = {
    amber: { gradient: 'from-amber-500 to-orange-500', text: 'text-amber-600' },
    emerald: { gradient: 'from-emerald-500 to-green-600', text: 'text-emerald-600' },
    sky: { gradient: 'from-sky-500 to-cyan-600', text: 'text-sky-600' },
    blue: { gradient: 'from-blue-500 to-indigo-600', text: 'text-blue-600' },
    orange: { gradient: 'from-orange-500 to-red-500', text: 'text-orange-600' },
    // 2026-07-10 (S2-1c): új szín az "Ebből idén esedékes" kártyához
    rose: { gradient: 'from-rose-500 to-red-600', text: 'text-rose-600' },
  } as const

  return (
    <div className="card-raised flex items-center gap-3 p-4">
      <div className={`icon-raised h-10 w-10 bg-gradient-to-br ${palette[color].gradient}`}>
        {icon}
      </div>
      <div>
        <p className={`text-xl font-bold ${palette[color].text}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function statusClassName(status: DebtRow['status']) {
  if (status === 'hatralekos')
    return 'inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600'
  if (status === 'rendezve')
    return 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600'
  // A kiskorú semleges (szürke) — se nem jó hír, se nem rossz, egyszerűen nem érintett.
  if (status === 'kiskoru')
    return 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'
  return 'inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700'
}
