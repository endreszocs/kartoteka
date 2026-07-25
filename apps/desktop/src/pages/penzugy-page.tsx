/**
 * Pénzügy — EGYSÉGES tab-oldal (`/penzugy`, 2026-06-10 B-hullám).
 *
 * A web `finance-tabs.tsx` szerkezetét másolja: KÖZÖS `FinanceHero` + KÖZÖS
 * `ColorTabs` tab-bar + tab-tartalom. Azonos komponens = azonos megjelenés.
 *
 * Az összes adatot EGYSZER tölti be a lokális SQLite-ból (+ online törzsadatok:
 * bankszámlák, belső mozgások), és a megosztott komponenseknek prop-on adja át —
 * pontosan, mint a web.
 *
 * Kész tabok (2026-06-11, paritás #5): Áttekintés, Kassza, Bank, Tranzakciók,
 * Költségvetés, Számadás, Tartozások, Monetár, Súgó. Egyedül a Bérleti
 * szerződések fül vár (webes szerződés-dialóg + Oblio e-Factura kötés).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FileSpreadsheet, Printer } from 'lucide-react'

import {
  FinanceHero,
  ColorTabs,
  FinanceDashboard,
  TransactionsTab,
  AccountingTab,
  DebtTab,
  CashbookTab,
  FinanceSugoTab,
  calculateBalances,
  type BefitetesRow,
  type KiadasRow,
  type SzamadasiCel,
  type BealitasRow,
  type FinanceBalances,
  type DebtRow,
  type JarulekPaymentLike,
  type IncomeCategory,
  type ExpenseCategory,
  type BankAccount,
  type InternalTransferRow,
  BELSO_MOZGAS_ROGZITO_KODS,
  isGyulekezetiKonyvelhetoKod,
} from '@kartoteka/ui-app'

import {
  undoStornoUseCase,
  autoIssueChitantaForBefizetesUseCase,
  getChitantakForBefizetesekUseCase,
  resolveNyitoEgyenlegekUseCase,
} from '@kartoteka/core'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { getDesktopSupabase } from '../lib/supabase'
import { getDesktopUser } from '../lib/desktop-user'
import { getLocalOwnProfile, getLocalOwnCongregation, getLocalMembersOfOwnCongregation } from '../lib/sync'
import { getLocalBefizetesek, getLocalKiadasok, pullBefizetesek, pullKiadasok } from '../lib/finance-sync'
import {
  pullFinanceCategories,
  getLocalBevCelMap,
  getLocalKiaCelMap,
  getLocalSzamadasiCellek,
} from '../lib/finance-categories-sync'
import {
  pullFinanceSettings,
  getLocalBealitas,
  getLocalBudgetData,
  getLocalYearSettings,
  getLocalYearlyFees,
} from '../lib/finance-settings-sync'
import { pullDebtData, getLocalExemptions, getLocalDiscounts } from '../lib/finance-debt-sync'
import { buildDebtRows } from '../lib/finance-debt-compute'
import { toBefitetesRow, toKiadasRow } from '../lib/finance-adapters'
import { enqueueUndoStornoReappend } from '../lib/excel-enqueue'
import { isExcelSetupComplete } from '../lib/excel-setup-flow'
import { isOnlineWithSession } from '../lib/use-session-online'
import { DesktopCombinedEntryDialog } from '../components/combined-entry-dialog'
import { DesktopStornoConfirmDialog } from '../components/storno-confirm-dialog'
import { DesktopTransactionEditDialog } from '../components/transaction-edit-dialog'
import { DesktopBankTab } from '../components/desktop-bank-tab'
import { DesktopOblioTab } from '../components/desktop-oblio-tab'
import { DesktopBudgetTab } from '../components/desktop-budget-tab'
import { DesktopMonetaryTab } from '../components/desktop-monetary-tab'
import { DesktopFinancePrintDialog } from '../components/finance-print-dialog'
import { DesktopBudgetPrintDialog } from '../components/budget-print-dialog'
import { ChitantaPrintDialog } from '../components/chitanta-print-dialog'
import { DesktopChitantaTombRequiredDialog } from '../components/chitanta-tomb-required-dialog'
import { DESKTOP_HELP_SECTIONS } from '../lib/desktop-help-sections'

// 2026-06-11 (paritás #5): Bank / Költségvetés / Monetár is a web-azonos
// megosztott komponenssel renderelődik. Egyedül a Bérleti szerződések fül vár
// még (webes szerződés-dialóg + Oblio e-Factura kötés).
const READY_TABS = ['dashboard', 'cashbook', 'bank', 'transactions', 'budget', 'accounting', 'debt', 'monetary', 'oblio']

const TAB_DEFS = [
  { value: 'dashboard', label: 'Áttekintés', color: 'blue' },
  { value: 'cashbook', label: 'Kassza', color: 'emerald' },
  { value: 'bank', label: 'Bank', color: 'violet' },
  { value: 'transactions', label: 'Tranzakciók', color: 'pink' },
  { value: 'budget', label: 'Költségvetés', color: 'amber' },
  { value: 'accounting', label: 'Számadás', color: 'cyan' },
  { value: 'debt', label: 'Tartozások', color: 'orange' },
  { value: 'oblio', label: 'Oblio ellenőrzés', color: 'cyan' },
  { value: 'rental', label: 'Bérleti szerződések', color: 'amber' },
  { value: 'monetary', label: 'Monetár', color: 'slate' },
  { value: 'sugo', label: 'Súgó', color: 'teal' },
]

const EMPTY_BALANCES: FinanceBalances = { cashBalance: 0, bankBalance: 0, totalIncome: 0, totalExpense: 0 }

/**
 * A fül-azonosító kiolvasása az URL-ből.
 *
 * ⚠️ HashRouter: az ÚTVONAL is a hash-ben van, ezért a teljes hash így néz ki:
 * `#/penzugy#accounting`. A korábbi kód a vezető '#'-et vágta le és az EGÉSZ
 * maradékot ('/penzugy#accounting') hasonlította a fül-nevekhez → sosem talált,
 * mindig a 'dashboard' fülre esett (a /penzugy/szamadas deep-link is).
 * Ezért az UTOLSÓ '#' utáni szegmenst nézzük.
 */
function readHashTab(): string {
  if (typeof window === 'undefined') return 'dashboard'
  const raw = window.location.hash
  const h = raw.slice(raw.lastIndexOf('#') + 1)
  return TAB_DEFS.some((t) => t.value === h) ? h : 'dashboard'
}

export function PenzugyPage() {
  const [activeTab, setActiveTab] = useState<string>(readHashTab)
  const [loading, setLoading] = useState(true)
  // 2026-07-25 (F6.2 review, P1): ÉV-VÁLASZTÓ. A most törölt aloldalakon volt
  // év-dropdown, az egységes oldalon nem — így januárban az ELŐZŐ évi Számadás/
  // Tartozás/Áttekintés elérhetetlenné vált volna (pedig az éves számadás épp
  // akkor készül). A web ugyanezt a FinanceYearSelector-ral adja.
  const [year, setYear] = useState<number>(() => new Date().getFullYear())

  const [income, setIncome] = useState<BefitetesRow[]>([])
  const [expense, setExpense] = useState<KiadasRow[]>([])
  const [bevCelMap, setBevCelMap] = useState<Record<number, string>>({})
  const [kiaCelMap, setKiaCelMap] = useState<Record<number, string>>({})
  const [szamadasiCellek, setSzamadasiCellek] = useState<SzamadasiCel[]>([])
  const [balances, setBalances] = useState<FinanceBalances>(EMPTY_BALANCES)
  // Előző évi záró kassza-egyenleg (a Kassza-fül nyitó egyenlege).
  const [carryoverCash, setCarryoverCash] = useState(0)
  const [bankNyitoMap, setBankNyitoMap] = useState<Record<number, number>>({})
  // Előző évi záró bank-egyenleg (a Bank-fül nyitó egyenlege) — paritás #5.
  const [carryoverBank, setCarryoverBank] = useState(0)
  // Online törzsadatok a Bank/Monetár fülhöz (lokális tükör nélkül): aktív
  // bankszámlák + idei belső mozgások. Offline → üres (a tranzakció-lista a
  // lokális tükörből így is teljes).
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [internalTransfers, setInternalTransfers] = useState<InternalTransferRow[]>([])
  const [settings, setSettings] = useState<BealitasRow | null>(null)
  const [budgetData, setBudgetData] = useState<Record<string, number>>({})
  const [debtRows, setDebtRows] = useState<DebtRow[]>([])
  const [yearlyFees, setYearlyFees] = useState<Record<number, number>>({})
  // 2026-07-10 (S2-#5 paritás): előző évi TÉNY szamadasicel-kódonként — a web
  // getPreviousYearActuals tükre, de a MÁR BETÖLTÖTT lokális előző évi sorokból
  // számolva (offline is működik, nincs külön hálózati kör). A Számadás/
  // Költségvetés fül „Előző évi tény" referencia-oszlopát táplálja.
  const [prevActuals, setPrevActuals] = useState<{
    income: Record<string, number>
    expense: Record<string, number>
  } | null>(null)
  const [congregationName, setCongregationName] = useState('')
  const [congregationNameRo, setCongregationNameRo] = useState('') // hivatalos román név a nyomtatványhoz

  // C-hullám C1 — írási út: a „+ Tétel rögzítése" összevont bevitelhez kell a
  // gyülekezet-uuid + user-id (a saveIncome/saveExpense use-case ctx-éhez).
  const [userId, setUserId] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [combinedOpen, setCombinedOpen] = useState(false)
  // Endre #4 (2026-06-11): nyomtatási központok — web-azonos belépési pontok
  // (hero „Nyomtatás" gomb + Költségvetés-fül gombja).
  const [printOpen, setPrintOpen] = useState(false)
  const [budgetPrintOpen, setBudgetPrintOpen] = useState(false)
  // Page-szintű visszajelzés (pl. sztornó-visszavonás eredménye a Kassza fülről).
  const [pageToast, setPageToast] = useState<
    { kind: 'success' | 'error' | 'info' | 'warning'; msg: string } | null
  >(null)

  // Hash ⇄ activeTab szinkron (mint a web)
  useEffect(() => {
    const onHash = () => setActiveTab(readHashTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // A sidebar almenü hash-linkjei (pl. /penzugy#accounting) react-router
  // navigációval érkeznek — ott nem mindig fut hashchange esemény, ezért a
  // location-változásra is szinkronizálunk (2026-06-11, sidebar-egységesítés).
  const location = useLocation()
  useEffect(() => {
    setActiveTab(readHashTab())
  }, [location])
  useEffect(() => {
    // ⚠️ HashRouter: a `window.location.pathname` NEM az útvonal (az a hash-ben
    // van) — a korábbi replaceState `#dashboard`-ra írta az egész hash-t, így
    // egy újratöltés a Kezdőlapra esett. Csak a hash UTOLSÓ szegmensét cseréljük.
    const raw = window.location.hash
    const cut = raw.lastIndexOf('#')
    const cur = raw.slice(cut + 1)
    if (cur === activeTab) return
    const routePart = cut > 0 ? raw.slice(0, cut) : raw || '#/penzugy'
    window.history.replaceState(null, '', `${routePart}#${activeTab}`)
  }, [activeTab])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const user = await getDesktopUser()
      if (!user) {
        setLoading(false)
        return
      }
      const profile = await getLocalOwnProfile(user.id)
      const congId = profile?.congregation_id ?? null
      if (!congId) {
        setLoading(false)
        return
      }
      setUserId(user.id)
      setCongregationId(congId)

      await Promise.allSettled([
        pullBefizetesek(congId, year),
        pullKiadasok(congId, year),
        pullBefizetesek(congId, year - 1),
        pullKiadasok(congId, year - 1),
        pullFinanceCategories(),
        pullFinanceSettings(congId, year),
        pullDebtData(congId),
      ])

      // 2026-07-10 (S2-#5 perf): a getLocalOwnCongregation eddig KÜLÖN await-ként
      // futott a lokális olvasások előtt — bevonva a párhuzamos hullámba
      // (1 szekvenciális IPC-körrel kevesebb, a viselkedés változatlan).
      const [
        befLocal, kiaLocal, prevBefLocal, prevKiaLocal,
        bevMap, kiaMap, cells, beal, budget,
        members, exemptions, discounts, yearSettings, fees,
        cong,
      ] = await Promise.all([
        getLocalBefizetesek(congId, year),
        getLocalKiadasok(congId, year),
        getLocalBefizetesek(congId, year - 1),
        getLocalKiadasok(congId, year - 1),
        getLocalBevCelMap(),
        getLocalKiaCelMap(),
        getLocalSzamadasiCellek(),
        getLocalBealitas(congId, year),
        getLocalBudgetData(congId, year),
        getLocalMembersOfOwnCongregation(user.id, { onlyVisible: true }),
        getLocalExemptions(congId),
        getLocalDiscounts(congId),
        getLocalYearSettings(congId),
        getLocalYearlyFees(congId),
        getLocalOwnCongregation(user.id),
      ])
      setCongregationName(cong?.nev_hu || cong?.name || '')
      setCongregationNameRo((cong as { nev_ro?: string | null } | null)?.nev_ro || '')

      const incomeRows = befLocal.map(toBefitetesRow)
      const expenseRows = kiaLocal.map(toKiadasRow)

      // 2026-07-10 (#3 defense-in-depth): a belső-mozgás cél-id-k kizárása a
      // bevétel/kiadás TOTÁLOKBÓL — a webes finance-tabs internalCelIds párja.
      // Eddig a desktop e nélkül hívta a calculateBalances-t, így az xkey nélküli
      // 3xx/4xx (és legacy 100.xx) tételek a totálokat torzították.
      const isInternalKod = (kod: string) =>
        /^[34]/.test(kod) || kod === '100' || kod.startsWith('100.')
      const internalIncomeCelIds = new Set<number>()
      const internalExpenseCelIds = new Set<number>()
      for (const [id, kod] of Object.entries(bevMap)) {
        if (isInternalKod(String(kod))) internalIncomeCelIds.add(Number(id))
      }
      for (const [id, kod] of Object.entries(kiaMap)) {
        if (isInternalKod(String(kod))) internalExpenseCelIds.add(Number(id))
      }
      const internalCelIds = { internalIncomeCelIds, internalExpenseCelIds }

      // 2026-07-17 (F4, web-paritás): a rögzített nyitó egyenlegek beszámítása.
      // A web initFinance logikája: ha az IDEI évre van rögzített nyitó, az a bázis;
      // különben az előző évi rögzített nyitó + előző évi nettó forgalom. A desktop
      // eddig FIXEN 0 nyitóval indult → az aggregát kassza/bank-egyenleg hibás volt.
      // Online lekérés, offline-fallback: 0 (a régi viselkedés).
      let recCashPrev = 0, recBankPrev = 0
      let recCashCur: number | null = null, recBankCur: number | null = null
      const bankNyitoCur: Record<number, number> = {}
      try {
        if (await isOnlineWithSession()) {
          const sb = getDesktopSupabase()
          // 5s-os plafon: captive-portal/kiesés esetén ne blokkolja a lokális betöltést.
          const [cashNyRes, bankNyRes] = (await Promise.race([
            Promise.all([
              sb.from('keszpenz_nyito_egyenleg').select('eve, nyito_egyenleg')
                .eq('congregation_id', congId).in('eve', [year - 1, year]),
              sb.from('bankszamla_nyito_egyenleg').select('eve, nyito_egyenleg_ron, bankszamla_id')
                .eq('congregation_id', congId).in('eve', [year - 1, year]),
            ]),
            new Promise<never>((_, reject) =>
              window.setTimeout(() => reject(new Error('nyito-egyenleg lekérés timeout')), 5000),
            ),
          ])) as [
            { data: unknown[] | null; error: { message: string } | null },
            { data: unknown[] | null; error: { message: string } | null },
          ]
          if (cashNyRes.error || bankNyRes.error) {
            console.warn('[penzugy-page] Rögzített nyitó-lekérés hibázott — 0 bázis:', cashNyRes.error?.message || bankNyRes.error?.message)
          }
          for (const r of (cashNyRes.data || []) as { eve: number; nyito_egyenleg: number }[]) {
            if (r.eve === year) recCashCur = (recCashCur ?? 0) + (Number(r.nyito_egyenleg) || 0)
            else recCashPrev += Number(r.nyito_egyenleg) || 0
          }
          for (const r of (bankNyRes.data || []) as { eve: number; nyito_egyenleg_ron: number; bankszamla_id: number }[]) {
            if (r.eve === year) {
              recBankCur = (recBankCur ?? 0) + (Number(r.nyito_egyenleg_ron) || 0)
              if (r.bankszamla_id != null) bankNyitoCur[r.bankszamla_id] = Number(r.nyito_egyenleg_ron) || 0
            } else recBankPrev += Number(r.nyito_egyenleg_ron) || 0
          }
        }
      } catch {
        /* offline / hálózati hiba / timeout — 0 bázissal számolunk, mint eddig */
      }
      // 2026-07-25 (G5, web-paritás): „előző évi záró = következő évi nyitó" —
      // OLVASÁS-ONLY feloldás számlánként. Online ág; hiba/offline esetén a
      // fenti (rögzített sor + fallback) értékek maradnak.
      let resolvedCash: number | null = null
      let resolvedBankTotal: number | null = null
      try {
        if (await isOnlineWithSession()) {
          const sb2 = getDesktopSupabase()
          const resolved = (await Promise.race([
            resolveNyitoEgyenlegekUseCase(
              { congregationId: congId, eve: year },
              { supabase: sb2, runtime: 'desktop' },
            ),
            new Promise<never>((_, reject) =>
              window.setTimeout(() => reject(new Error('nyito-feloldas timeout')), 6000),
            ),
          ])) as Awaited<ReturnType<typeof resolveNyitoEgyenlegekUseCase>>
          if (resolved.success) {
            resolvedCash = resolved.cash.value
            resolvedBankTotal = resolved.bankTotal
            for (const [id, r] of Object.entries(resolved.bank)) {
              bankNyitoCur[Number(id)] = r.value
            }
          }
        }
      } catch (err) {
        console.warn('[penzugy-page] nyitó-feloldás kihagyva:', err)
      }
      if (resolvedCash != null) recCashCur = resolvedCash
      if (resolvedBankTotal != null) recBankCur = resolvedBankTotal
      setBankNyitoMap(bankNyitoCur)
      const prevBalances = calculateBalances(prevBefLocal.map(toBefitetesRow), prevKiaLocal.map(toKiadasRow), recCashPrev, recBankPrev, internalCelIds)
      const yearBalances = calculateBalances(incomeRows, expenseRows, recCashCur ?? prevBalances.cashBalance, recBankCur ?? prevBalances.bankBalance, internalCelIds)

      // 2026-07-10 (S2-#5 paritás): előző évi TÉNY kódonként — a web
      // getPreviousYearActuals (actions.ts) aggregálásának tükre, a már betöltött
      // lokális előző évi sorokból. A belső-mozgás kódok (100.xx/3xx/4xx) a webbel
      // azonosan kizárva. Ha az előző évből nincs lokálisan szinkronizált sor,
      // null marad → a referencia-oszlop nem jelenik meg (nem mutatunk hamis 0-kat).
      const prevIncomeByKod: Record<string, number> = {}
      for (const b of prevBefLocal) {
        const kod = bevMap[b.id_befizetescel]
        if (!kod || isInternalKod(kod)) continue
        prevIncomeByKod[kod] = (prevIncomeByKod[kod] || 0) + (Number(b.osszeg) || 0)
      }
      const prevExpenseByKod: Record<string, number> = {}
      for (const k of prevKiaLocal) {
        const kod = kiaMap[k.id_kiadascel]
        if (!kod || isInternalKod(kod)) continue
        prevExpenseByKod[kod] = (prevExpenseByKod[kod] || 0) + (Number(k.osszeg) || 0)
      }
      setPrevActuals(
        prevBefLocal.length === 0 && prevKiaLocal.length === 0
          ? null
          : { income: prevIncomeByKod, expense: prevExpenseByKod },
      )

      // Paritás #5 — online törzsadatok a Bank/Monetár fülhöz. Hibatűrő:
      // offline vagy lejárt session esetén üres marad (a fülek jelzik).
      let banks: BankAccount[] = []
      let transfers: InternalTransferRow[] = []
      if (await isOnlineWithSession()) {
        try {
          const supabase = getDesktopSupabase()
          const [bankRes, trRes] = await Promise.all([
            supabase
              .from('bankszamlak')
              .select('*')
              .eq('congregation_id', congId)
              .eq('aktiv', true),
            supabase
              .from('belsomozgas')
              .select('id, datum, tipus, forras, cel, osszeg, cel_osszeg, arfolyam, megjegyzes, deleted')
              .eq('congregation_id', congId)
              .or('deleted.eq.false,deleted.is.null')
              .gte('datum', `${year}-01-01`)
              .lte('datum', `${year}-12-31`)
              .order('datum', { ascending: false }),
          ])
          if (!bankRes.error && bankRes.data) banks = bankRes.data as BankAccount[]
          if (!trRes.error && trRes.data) {
            // A web `normalizeInternalTransfers` tükre.
            transfers = (trRes.data as Record<string, unknown>[]).map((row) => ({
              id: Number(row.id),
              datum: typeof row.datum === 'string' ? row.datum : '',
              tipus: String(row.tipus || 'bank_bank') as InternalTransferRow['tipus'],
              forras: typeof row.forras === 'string' ? row.forras : '',
              cel: typeof row.cel === 'string' ? row.cel : '',
              osszeg: Number(row.osszeg) || 0,
              cel_osszeg: row.cel_osszeg == null ? null : Number(row.cel_osszeg) || 0,
              arfolyam: row.arfolyam == null ? null : Number(row.arfolyam) || 0,
              megjegyzes: typeof row.megjegyzes === 'string' ? row.megjegyzes : null,
              deleted: typeof row.deleted === 'boolean' ? row.deleted : null,
            }))
          }
        } catch {
          /* online törzsadat nélkül a lokális nézet él tovább */
        }
      }

      const maintenancePayments: JarulekPaymentLike[] = befLocal
        // 2026-07-25 (F6.2 review, P1): a stornózott befizetés NEM számít fizetettnek
    // (F1-4 web-paritás — a web `.or('stornozott.eq.false,stornozott.is.null')`-lal
    // szűr). Ez a szűrés a most törölt penzugy-tartozasok-page-en már megvolt, az
    // egységes oldalról hiányzott → sztornó után „Rendezett"-nek látszott a tag.
    .filter((b) => !b.stornozott && (bevMap[b.id_befizetescel] || '').startsWith('101.01'))
        .map((b) => ({ id_szemely: b.id_szemely ?? null, id_csalad: b.id_csalad ?? null, datum: b.datum ?? null, fizetettev: b.fizetettev ?? null, osszeg: b.osszeg }))

      const computedDebt = buildDebtRows({
        members: members.map((m) => ({
          id: m.id, csaladnev: m.csaladnev, k_nev: m.k_nev, sz_datum: m.sz_datum,
          foglalkozas: m.foglalkozas, meghalt: m.meghalt, member_status: m.member_status, family_id: m.family_id,
        })),
        maintenancePayments, exemptions, discounts, yearSettings, year, debtCalcMode: 'akkori',
      })

      setIncome(incomeRows)
      setExpense(expenseRows)
      setBevCelMap(bevMap)
      setKiaCelMap(kiaMap)
      setSzamadasiCellek(cells)
      setBalances(yearBalances)
      // 2026-07-17 (F4): az idei rögzített nyitó felülbírálja az előző évi zárót
      // (web initFinance-paritás) — a nyomtatási dialógus és a KPI-k ezt kapják.
      setCarryoverCash(recCashCur ?? prevBalances.cashBalance)
      setCarryoverBank(recBankCur ?? prevBalances.bankBalance)
      setBankAccounts(banks)
      setInternalTransfers(transfers)
      setBudgetData(budget)
      setDebtRows(computedDebt)
      setYearlyFees(fees)
      setSettings(
        beal ?? {
          id: String(year), congregation_id: congId,
          eves_jarulek: cong?.eves_jarulek ?? null, jarulek_kedvezmenyes: cong?.jarulek_kedvezmenyes ?? null,
          jarulek_hatarid: cong?.jarulek_hatarid ?? null, budget_finalized: false, accounting_finalized: false,
          unlock_requested: false, unlock_reason: null, accounting_unlock_requested: false,
          accounting_unlock_reason: null, szamadas_zaro_adatok: null,
        },
      )
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  // Page-toast automatikus eltűntetése pár másodperc után.
  useEffect(() => {
    if (!pageToast) return
    const t = setTimeout(() => setPageToast(null), 5000)
    return () => clearTimeout(t)
  }, [pageToast])

  // Kategória-opciók a „+ Tétel rögzítése" összevont bevitelhez — PONTOSAN a web
  // `finance-tabs.tsx` képlete (bevCelMap/kiaCelMap → {id, kod, nev}, kod szerint
  // rendezve). Így a desktop és a web ugyanazokat a kategóriákat kínálja.
  // 2026-06-11 (Endre): aggregát sorok ("(5+...+12)" típusú kategóriafejek) és
  // nem-gyülekezeti szintű tételek kiszűrve — csak a hivatalos 87 levél +
  // a kanonikus belső-mozgás kódok könyvelhetők (web-azonos szabály).
  // 2026-07-10 (S2-#5 perf): id→cella index EGYSZER (a web finance-tabs 2026-06-30-i
  // perf-javításának tükre) — a kategória-listák ne O(n*m)-ben (.find soronként)
  // keressék a szamadasicel nevét/szintjét.
  const celById = useMemo(() => {
    const m = new Map<string, SzamadasiCel>()
    for (const c of szamadasiCellek) m.set(c.id, c)
    return m
  }, [szamadasiCellek])

  const incomeCategories = useMemo<IncomeCategory[]>(
    () =>
      Object.entries(bevCelMap)
        .map(([id, kod]) => {
          const cel = celById.get(kod)
          const nev = (cel?.nev || '').trim()
          return { id: Number(id), kod, nev: nev || kod, szint: cel?.szint }
        })
        .filter(
          (c) =>
            isGyulekezetiKonyvelhetoKod(c.kod, c.szint) ||
            BELSO_MOZGAS_ROGZITO_KODS.has(c.kod),
        )
        .map(({ id, kod, nev }) => ({ id, kod, nev }))
        .sort((a, b) => a.kod.localeCompare(b.kod)),
    [bevCelMap, celById],
  )

  const expenseCategories = useMemo<ExpenseCategory[]>(
    () =>
      Object.entries(kiaCelMap)
        .map(([id, kod]) => {
          const cel = celById.get(kod)
          const nev = (cel?.nev || '').trim()
          return { id: Number(id), kod, nev: nev || kod, szint: cel?.szint }
        })
        .filter(
          (c) =>
            isGyulekezetiKonyvelhetoKod(c.kod, c.szint) ||
            BELSO_MOZGAS_ROGZITO_KODS.has(c.kod),
        )
        .map(({ id, kod, nev }) => ({ id, kod, nev }))
        .sort((a, b) => a.kod.localeCompare(b.kod)),
    [kiaCelMap, celById],
  )

  // 2026-07-10 (S2-#5 paritás): a shared BudgetTab `loadPreviousActuals`
  // callbackje — a load()-ban kiszámolt lokális aggregátumot adja vissza
  // (nincs külön hálózati/IPC kör). Amíg nincs adat, error-t ad → a shared
  // komponens elrejti a referencia-oszlopot.
  const loadPreviousActuals = useCallback(async () => {
    if (!prevActuals) return { error: 'Nincs lokálisan szinkronizált előző évi adat.' }
    return { actualIncome: prevActuals.income, actualExpense: prevActuals.expense }
  }, [prevActuals])

  const debtModeLabel = 'akkori évi járulék'

  return (
    <DesktopShell>
      <div>
        <FinanceHero
          congregationName={congregationName}
          currentYear={year}
          debtModeLabel={debtModeLabel}
          onAddEntry={congregationId && userId ? () => setCombinedOpen(true) : undefined}
          onPrint={settings ? () => setPrintOpen(true) : undefined}
          // 2026-06-11 (Endre #2): az Excel-könyvelés beállításai eddig
          // „eldugva" éltek — innen egy kattintás a Beállítások → Könyvelés fül.
          extraActions={
            <>
              {/* Év-választó — a betöltés (load) a `year`-re van kötve, tehát
                  váltáskor a teljes oldal újratölt (lokális tükör + online). */}
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">Év</span>
                <select
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="bg-transparent text-sm font-semibold outline-none"
                  aria-label="Költségvetési év"
                >
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            <button
              type="button"
              onClick={() => {
                // 2026-06-12 (Endre #1 Excel-wizard): hiányos előkészítésnél a
                // varázslót nyitjuk a Beállítások-fül helyett — első használatkor
                // így véletlenül se marad ki semmi. (Hibánál a megszokott fül nyílik.)
                void isExcelSetupComplete().then((complete) => {
                  window.dispatchEvent(
                    complete
                      ? new CustomEvent('kartoteka:open-settings', { detail: { tab: 'konyveles' } })
                      : new CustomEvent('kartoteka:open-excel-wizard'),
                  )
                })
              }}
              className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-emerald-200 bg-white px-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              <FileSpreadsheet className="mr-1.5 size-3.5" />
              Excel-könyvelés
            </button>
            </>
          }
        />

        {pageToast && (
          <div
            role={pageToast.kind === 'error' ? 'alert' : 'status'}
            className={`mb-4 rounded-md border px-3 py-2 text-sm ${
              pageToast.kind === 'error'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : pageToast.kind === 'warning'
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'
            }`}
          >
            {pageToast.msg}
          </div>
        )}

        <ColorTabs tabs={TAB_DEFS} active={activeTab} onChange={setActiveTab} />

        <div className="mt-4">
          {activeTab === 'sugo' ? (
            // A Súgó statikus tartalom — a pénzügyi adatok betöltésétől függetlenül
            // azonnal megjelenik. A desktop-specifikus szekciót extraSections-ön adjuk át.
            <FinanceSugoTab
              extraSections={DESKTOP_HELP_SECTIONS}
              onToast={(msg, kind) => setPageToast({ kind, msg })}
            />
          ) : loading || !settings ? (
            <div className="py-12 text-center text-sm text-slate-400">Pénzügyi adatok betöltése…</div>
          ) : !READY_TABS.includes(activeTab) ? (
            <div className="card-raised p-8 text-center">
              <p className="text-sm font-medium text-slate-600">
                A Bérleti szerződések kezelése egyelőre a webes felületen érhető el.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                A szerződés-rögzítés és a bérleti e-Factura számlázás webes szolgáltatásokra épül —
                nyisd meg a Kartotékát a böngészőben (Pénzügy → Bérleti szerződések). A befogadott
                e-Factura ellenőrzés viszont már itt is elérhető az „Oblio ellenőrzés” fülön.
              </p>
            </div>
          ) : activeTab === 'dashboard' ? (
            <FinanceDashboard
              balances={balances}
              incomeRecords={income}
              expenseRecords={expense}
              bevCelMap={bevCelMap}
              kiaCelMap={kiaCelMap}
              settings={settings}
            />
          ) : activeTab === 'cashbook' ? (
            <CashbookTab
              incomeRecords={income}
              expenseRecords={expense}
              carryoverCash={carryoverCash}
              bevCelMap={bevCelMap}
              kiaCelMap={kiaCelMap}
              szamadasiCellek={szamadasiCellek}
              congregationName={congregationName}
              incomeCategories={incomeCategories}
              expenseCategories={expenseCategories}
              onTransactionChanged={() => void load()}
              onToast={(msg, kind) => setPageToast({ kind, msg })}
              // C1c: sztornó-visszavonás bekötve a core undoStornoUseCase-re
              // (a web undoStornoTransaction tükre — belső-mozgás párral).
              onUndoStorno={async ({ type, id }) => {
                const supabase = getDesktopSupabase()
                const result = await undoStornoUseCase(
                  { congregationId, type, id },
                  { supabase, runtime: 'desktop', userId },
                )
                // E3: ha a sztornó tükör-sora az Excel-útvonalon volt, a
                // visszavonás az eredeti sort újra-appendeli (kioltja a tükröt).
                if (result.success) {
                  void enqueueUndoStornoReappend({ type, serverId: id, congregationId })
                }
                return { success: result.success, error: result.success ? null : result.error }
              }}
              // C1b/C1c: a Kassza-fül mind a 4 akciója bekötve — sztornó, sztornó-
              // visszavonás, szerkesztés, nyugta-kiállítás (mind online művelet).
              stornoConfirmDialogSlot={({ open, onOpenChange, type, id, summary, isInternalTransfer, onStornoed }) => (
                <DesktopStornoConfirmDialog
                  open={open}
                  onOpenChange={onOpenChange}
                  type={type}
                  id={id}
                  summary={summary}
                  isInternalTransfer={isInternalTransfer}
                  onStornoed={onStornoed}
                  congregationId={congregationId}
                  userId={userId}
                />
              )}
              // C1c: tétel-szerkesztés a core updateTransactionUseCase-en (a web
              // updateTransactionBasic tükre) — dátum-utolsó védelemmel.
              transactionEditDialogSlot={({ open, onOpenChange, type, id, initial, categories, onSaved }) => (
                <DesktopTransactionEditDialog
                  open={open}
                  onOpenChange={onOpenChange}
                  type={type}
                  id={id}
                  initial={initial}
                  categories={categories}
                  onSaved={onSaved}
                  congregationId={congregationId}
                  userId={userId}
                />
              )}
              // C1c: nyugta (chitanță) auto-kiállítás befizetésből (a web
              // autoIssueChitantaForBefizetes tükre, atomikus next_chitanta_full RPC).
              onAutoIssueChitanta={async (befizetesId) => {
                const r = await autoIssueChitantaForBefizetesUseCase(
                  { congregationId, befizetesId },
                  { supabase: getDesktopSupabase(), runtime: 'desktop', userId },
                )
                return {
                  chitantaId: r.chitantaId ?? null,
                  sorozat: r.sorozat ?? null,
                  nyomdaiSzam: r.nyomdaiSzam ?? null,
                  errorCode: r.errorCode ?? null,
                  error: r.error ?? null,
                  maradek: r.maradek ?? null,
                }
              }}
              // A már kiállított nyugták lekérése — így a kiállított sorok az
              // „újranyomtatás" gombot mutatják (NEM a kiállítás gombot) → nincs dupla nyugta.
              loadChitantakForBefizetesek={async (ids) => {
                const r = await getChitantakForBefizetesekUseCase(
                  { congregationId, befizetesIds: ids },
                  { supabase: getDesktopSupabase(), runtime: 'desktop' },
                )
                return { data: r.data, error: r.error ?? null }
              }}
              // Nyomtatás/újranyomtatás: a meglévő desktop ChitantaPrintDialog (online).
              chitantaSilentPrintSlot={({ chitantaId, onDone }) =>
                chitantaId ? (
                  <ChitantaPrintDialog
                    chitantaId={chitantaId}
                    congregationId={congregationId}
                    onClose={onDone}
                  />
                ) : null
              }
              // Nincs aktív tömb → a Nyugtatömbök oldalra irányító dialógus.
              chitantaTombRequiredDialogSlot={({ open, onOpenChange, onTombCreated }) => (
                <DesktopChitantaTombRequiredDialog
                  open={open}
                  onOpenChange={onOpenChange}
                  onTombCreated={onTombCreated}
                />
              )}
            />
          ) : activeTab === 'bank' ? (
            // Paritás #5: web-azonos Bank-fül. A tranzakciók a lokális tükörből,
            // a bankszámla-törzs + nyitó egyenlegek online-ból jönnek.
            <DesktopBankTab
              incomeRecords={income}
              expenseRecords={expense}
              carryoverBank={carryoverBank}
              derivedNyitoRon={bankNyitoMap}
              bankAccounts={bankAccounts}
              bevCelMap={bevCelMap}
              kiaCelMap={kiaCelMap}
              szamadasiCellek={szamadasiCellek}
              incomeCategories={incomeCategories}
              expenseCategories={expenseCategories}
              congregationId={congregationId}
              userId={userId}
              currentYear={year}
              onTransactionChanged={() => void load()}
              onBankAccountSaved={() => void load()}
              onToast={(msg, kind) => setPageToast({ kind, msg })}
            />
          ) : activeTab === 'budget' ? (
            // Paritás #5: web-azonos Költségvetés-fül (alap + 3 módosítás,
            // véglegesítés + egyházmegyei beküldés). Offline: megtekintés a
            // lokális tükörből; mentés igazolt belépéssel.
            <>
              {/* Web-azonos: a Költségvetés-nyomtatás gomb csak ezen a fülön. */}
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setBudgetPrintOpen(true)}
                  className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-xl border border-teal-200 bg-white px-3 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
                >
                  <Printer className="mr-1 size-3.5" />
                  Költségvetés nyomtatás
                </button>
              </div>
              <DesktopBudgetTab
                szamadasiCellek={szamadasiCellek}
                settings={settings}
                currentYear={year}
                userId={userId}
                // 2026-07-10 (S2-#5 paritás): web-azonos NYITÓ egyenleg blokk +
                // „Előző évi tény" oszlop (lokális tükörből, offline is működik).
                carryoverCash={carryoverCash}
                carryoverBank={carryoverBank}
                loadPreviousActuals={loadPreviousActuals}
                onRefresh={() => void load()}
                onToast={(msg, kind) => setPageToast({ kind, msg })}
              />
            </>
          ) : activeTab === 'monetary' ? (
            // Paritás #5: web-azonos Monetár (címletjegyzék) fül — online adat.
            <DesktopMonetaryTab
              expectedCashBalance={balances.cashBalance}
              currentYear={year}
              bankAccounts={bankAccounts}
              internalTransfers={internalTransfers}
              congregationName={congregationName}
              congregationId={congregationId}
              onToast={(msg, kind) => setPageToast({ kind, msg })}
            />
          ) : activeTab === 'transactions' ? (
            <TransactionsTab
              incomeRecords={income}
              expenseRecords={expense}
              bevCelMap={bevCelMap}
              kiaCelMap={kiaCelMap}
              szamadasiCellek={szamadasiCellek}
              congregationName={congregationName}
              onRefresh={() => void load()}
              // 2026-07-10 (ÚJ #8): kp/banki chip — a már betöltött bankszámla-listából.
              bankAccounts={bankAccounts}
            />
          ) : activeTab === 'accounting' ? (
            <AccountingTab
              szamadasiCellek={szamadasiCellek}
              incomeRecords={income}
              expenseRecords={expense}
              bevCelMap={bevCelMap}
              kiaCelMap={kiaCelMap}
              settings={settings}
              currentYear={year}
              budgetData={budgetData}
              loading={false}
              // 2026-07-10 (S2-#5 paritás): web-azonos NYITÓ egyenleg blokk (EREK
              // 1–3. sor) + „Előző évi tény" oszlop — a lokális tükörből számolva.
              carryoverCash={carryoverCash}
              carryoverBank={carryoverBank}
              prevActualIncome={prevActuals?.income}
              prevActualExpense={prevActuals?.expense}
              // 2026-07-25 (G3 paritás): évi összegző hero — ugyanaz a balances,
              // amiből a Kassza/Bank fülek egyenlege is számolódik.
              balances={balances}
            />
          ) : activeTab === 'debt' ? (
            <DebtTab debtRows={debtRows} yearlyFees={yearlyFees} currentYear={year} debtCalcMode="akkori" />
          ) : activeTab === 'oblio' ? (
            <DesktopOblioTab
              congregationId={congregationId}
              userId={userId}
              currentYear={year}
              expenseCategories={expenseCategories}
              bankAccounts={bankAccounts}
              onToast={(msg, kind) => setPageToast({ kind, msg })}
            />
          ) : null}
        </div>
      </div>

      {/* C-hullám C1 — összevont bevétel/kiadás rögzítő (web-azonos CombinedEntryBody).
          A bezárás után újratöltjük az adatokat, hogy az új tételek azonnal lássanak. */}
      {congregationId && userId && (
        <DesktopCombinedEntryDialog
          open={combinedOpen}
          onOpenChange={(open) => {
            setCombinedOpen(open)
            if (!open) void load()
          }}
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          bankAccounts={bankAccounts}
          currentYear={year}
          congregationId={congregationId}
          userId={userId}
        />
      )}

      {/* Endre #4 — nyomtatási központok (web-azonos megosztott body-k) */}
      {settings && (
        <DesktopFinancePrintDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          income={income}
          expense={expense}
          bankAccounts={bankAccounts}
          cellek={szamadasiCellek}
          bevCelMap={bevCelMap}
          kiaCelMap={kiaCelMap}
          congregationName={congregationName}
          congregationNameRo={congregationNameRo}
          carryoverCash={carryoverCash}
          carryoverBank={carryoverBank}
          bankNyitoMap={bankNyitoMap}
          currentYear={year}
          settings={settings}
          onToast={(msg, kind) => setPageToast({ kind, msg })}
        />
      )}
      {settings && (
        <DesktopBudgetPrintDialog
          open={budgetPrintOpen}
          onOpenChange={setBudgetPrintOpen}
          settings={settings}
          cellek={szamadasiCellek}
          bevCelMap={bevCelMap}
          kiaCelMap={kiaCelMap}
          incomeRecords={income}
          expenseRecords={expense}
          congregationName={congregationName}
          carryoverCash={carryoverCash}
          carryoverBank={carryoverBank}
          currentYear={year}
          onToast={(msg, kind) => setPageToast({ kind, msg })}
        />
      )}
    </DesktopShell>
  )
}
