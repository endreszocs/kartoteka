'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AlertTriangle, Building2, Eye, FileCheck, FileText, Plus, Printer, Receipt, ShieldCheck, Wallet } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ColorTabs } from '@/components/ui/color-tabs'
import { Button } from '@/components/ui/button'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { FinanceDashboard } from './dashboard-tab'
import { OblioStatusChip } from './oblio-status-chip'
import { FinanceYearSelector } from './finance-year-selector'
// 2026-07-10 (S3 #2): a Monetár fül megszűnt — a lebegő widget vette át
// (jobb alsó sarok, Monetár + Számológép). A MonetaryTabV2-t a widget
// dynamic importtal, kompakt módban mountolja.
import { MonetarFloatingWidget } from './monetar-floating-widget'

// 2026-06-30 (perf): a nehéz, nem-default fülek next/dynamic-kal töltődnek. A
// base-ui Tabs.Panel (keepMounted=false alapérték) az inaktív fület nem rendereli,
// így a dynamic import a fül kódját CSAK a fülre kattintáskor tölti le — a route
// kezdeti JS-bundle-jéből kikerül a ~72KB-os Súgó, az import-varázsló és a nagy
// könyvelő/tranzakció/kassza/bank/költségvetés fül. A Dashboard (default) + a hero
// (OblioStatusChip/YearSelector) statikus marad a gyors első festésért. A viselkedés
// változatlan.
// 2026-07-10 (S3 #2): a Monetár fül lebegő widgetté alakult.
// 2026-08-15 (Endre): az Oblio-ellenőrzés modál KIVEZETVE — a tartalma a
// /dokumentumtar „Számlák egyeztetése" hub „Oblio egyeztetés" fülén él tovább
// (szamlak-egyeztetese-tabs.tsx); a hero gombja és a régi hash/event
// belépési pontok oda navigálnak.
const tabLoading = () => <div className="mt-4 h-64 animate-pulse rounded-2xl bg-slate-100" />
const CashbookTab = dynamic(() => import('./cashbook-tab').then((m) => m.CashbookTab), { ssr: false, loading: tabLoading })
const BankTab = dynamic(() => import('./bank-tab').then((m) => m.BankTab), { ssr: false, loading: tabLoading })
const BudgetTab = dynamic(() => import('./budget-tab').then((m) => m.BudgetTab), { ssr: false, loading: tabLoading })
const AccountingTabV2 = dynamic(() => import('./accounting-tab-v2').then((m) => m.AccountingTabV2), { ssr: false, loading: tabLoading })
const DebtTabV2 = dynamic(() => import('./debt-tab-v2').then((m) => m.DebtTabV2), { ssr: false, loading: tabLoading })
const TransactionsTab = dynamic(() => import('./transactions-tab').then((m) => m.TransactionsTab), { ssr: false, loading: tabLoading })
const RentalTab = dynamic(() => import('./rental-tab').then((m) => m.RentalTab), { ssr: false, loading: tabLoading })
// 2026-08-11 (K5 #5): a Súgó fül a KÖZÖS `FinanceSugoTab` wrappert mountolja
// (`finance-sugo-tab.tsx`) a korábbi, csak-webes `PenzugyHelp` helyett. Az eddigi
// állapotban a wrapper halott kód volt, a web pedig egy külön fejlődő súgó-doksit
// mutatott — így a webről HIÁNYZOTT az élő év végi zárási checklist, amit a desktop
// már mutatott. A webes EREK-szabálykönyv nem veszett el: a wrapperen belüli
// nézetválasztó „EREK szabályok" fülén változatlanul elérhető.
const FinanceSugoTab = dynamic(() => import('./finance-sugo-tab').then((m) => m.FinanceSugoTab), { ssr: false, loading: tabLoading })
const FinanceImportTabs = dynamic(() => import('./finance-import/finance-import-tabs').then((m) => m.FinanceImportTabs), { ssr: false, loading: tabLoading })
import { CombinedEntryDialog } from '@/components/modals/combined-entry-dialog'
import { DecontDialog } from '@/components/modals/decont-dialog'
import { DispozitieDialog } from '@/components/modals/dispozitie-dialog'
import { DispozitieIncasareWizard } from '@/components/modals/dispozitie-incasare-wizard'
import { FinancePrintDialog } from '@/components/finance/finance-print-dialog'
import { OpeningBalancesDialog } from '@/components/finance/opening-balances-dialog'
import { BudgetPrintDialog } from '@/components/finance/budget-print-dialog'
import { calculateBalances } from '@/lib/utils/finance-helpers'
import { computeInternalMovementHealth } from '@/lib/finance/internal-movement-health'
import { InternalMovementWarning } from '@/components/finance/internal-movement-warning'
// 2026-08-17 (kerületi S5): a hatókör KANONIKUS típusa. Itt eddig kézi
// `'congregation' | 'diocese'` unió-másolat állt — pontosan az, ami miatt a
// harmadik szint fordítási hiba nélkül maradhatott volna ki a felületből.
// A mag (`finance-scope-core.ts`) import-mentes, ezért kliens-komponensben is
// biztonságos (a `finance-scope.ts` gazda-modul `server-only` láncot húzna be).
import type { FinanceScope } from '@/lib/auth/finance-scope-core'
import type {
  BealitasRow,
  SzamadasiCel,
  BankAccount,
  BefitetesRow,
  KiadasRow,
  DebtRow,
  DebtCalcMode,
  InternalTransferRow,
  ReceiptHealth,
  RentalContractRow,
  RentalDebtRow,
} from '@/lib/constants/finance'
import {
  BELSO_MOZGAS_ROGZITO_KODS,
  isGyulekezetiKonyvelhetoKod,
} from '@/lib/constants/finance'

interface FinanceTabsProps {
  settings: BealitasRow
  szamadasiCellek: SzamadasiCel[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  bmBevCelIds: { keszpenz: number; banki: number }
  bmKiaCelIds: { keszpenz: number; banki: number }
  bankAccounts: BankAccount[]
  internalTransfers: InternalTransferRow[]
  initialIncome: BefitetesRow[]
  initialExpense: KiadasRow[]
  carryoverCash: number
  carryoverBank: number
  /** 2026-07-17 (F4): az idei rögzített bank-nyitók számlánként (Registru Banca). */
  bankNyitoMap?: Record<number, number>
  congregationName: string
  /** Hivatalos román gyülekezetnév (pl. „Parohia Reformată Brateș") a nyomtatványokhoz. */
  congregationNameRo?: string
  congregationId: string
  /**
   * 2026-08-15 (egyházmegyei terv, 2.1/3): az egyházkerület neve — CSAK megyei
   * hatókörben van értelme (a megye saját nyomtatvány-borítójának felső blokkja
   * az egyházkerületé, ahogy a gyülekezeti íven az egyházmegyéé).
   */
  districtName?: string | null
  /** 2026-08-22 (6. pont): a felettes egyházkerület hivatalos ROMÁN neve
   *  (`districts.nev_ro`) — a MEGYEI borító felső blokkjához. */
  districtNameRo?: string | null
  debtCalcMode: DebtCalcMode
  yearlyFees: Record<number, number>
  debtRows: DebtRow[]
  receiptHealth: ReceiptHealth
  currentYear: number
  /** A hero év-választóban felkínált évek (csak adattal bíró évek + folyó év). */
  availableYears?: number[]
  isGodMode: boolean
  /**
   * 2026-04-18 SCOPE-AWARE: a Pénzügy modul hatóköre. Alapértelmezés:
   * 'congregation'.
   *
   * ⛔ 2026-08-17 (kerületi S5) — MIÉRT A KANONIKUS TÍPUS, ÉS MIÉRT LETT MINDEN
   *    KAPUBÓL `=== 'congregation'`:
   *    Itt eddig kézi `'congregation' | 'diocese'` unió-másolat állt, a kapuk
   *    pedig `scope !== 'diocese'` / `scope === 'diocese'` alakúak voltak. Ezek
   *    a kapuk GYÜLEKEZETI sajátosságokat rejtenek (tag-szintű Tartozások és
   *    Bérleti szerződések fül, Monetár-widget, Számlák egyeztetése, a
   *    pénzügy→leltár híd) — vagyis a „nem-diocese" feltétel a harmadik szintre
   *    IGAZ lett volna, és az egyházkerület MEGKAPTA VOLNA a gyülekezeti
   *    felületet: olyan füleket, amelyek a kerület számára üresek, és olyan
   *    hidat, ami a GYÜLEKEZETI leltárba írna.
   *    Mostantól a típus a kanonikus `FinanceScope` (a `tablesFor` magjából),
   *    a kapuk pedig a GYÜLEKEZETI sajátosságot nevezik meg. A gyülekezeti és
   *    az egyházmegyei viselkedés BYTE-RA azonos maradt: a `congregation` ág
   *    ugyanazt kapja, a `diocese` ág ugyanúgy kimarad.
   */
  scope?: FinanceScope
  /**
   * 2026-08-11 (számvevő-kör): ELLENŐRI (csak olvasható) nézet.
   *
   * `true` az egyházmegyei számvevőnél: a megye könyveit megnézheti, de nem
   * rögzíthet, nem javíthat, nem véglegesíthet. Ilyenkor a rögzítő gombok NEM
   * jelennek meg, és a lap tetején magyarázó sáv áll — hogy ELŐRE tudja, mit
   * nem tehet, ne pedig egy néma, 0 sort érintő mentés vagy nyers RLS-hiba
   * után. A VALÓDI zár a szerver akciókban van (`financeWriteBlock`).
   */
  readOnly?: boolean
  /** Lelkész-barát magyar magyarázat a `readOnly` sávhoz. */
  readOnlyReason?: string | null
  /**
   * 2026-05-25: ha true, a "Rendszergazdai importáló" fül megjelenik a tab-lista
   * VÉGÉN (Súgó után), piros (red-prominent) háttérrel. Jogosultság: god mode,
   * delegated import vagy aktív admin szerepkör — a page.tsx dönti el.
   */
  showAdminImport?: boolean
}

export function FinanceTabs({
  settings, szamadasiCellek, bevCelMap, kiaCelMap,
  bankAccounts, internalTransfers, initialIncome, initialExpense,
  carryoverCash, carryoverBank, bankNyitoMap, congregationName, congregationNameRo, congregationId,
  districtName = null,
  districtNameRo = null,
  currentYear, availableYears, yearlyFees, debtRows: initialDebtRows, receiptHealth: initialReceiptHealth, debtCalcMode, isGodMode,
  scope = 'congregation',
  readOnly = false,
  readOnlyReason = null,
  showAdminImport = false,
}: FinanceTabsProps) {
  // ── 2026-08-17 (kerületi S5): SZINT-FÜGGŐ KAPU EGY HELYEN ──────────────────
  //
  // `gyulekezeti` a GYÜLEKEZETI sajátosságok kapuja. A korábbi kapuk
  // `scope !== 'diocese'` alakúak voltak — ez a harmadik szintre IGAZ, tehát az
  // egyházkerület megkapta volna a tag-szintű füleket (Tartozások, Bérleti
  // szerződések), a Monetár-widgetet, a „Számlák egyeztetése" gombot és a
  // pénzügy→leltár hidat. A név szándékosan azt mondja, AMIT ELDÖNT: nem
  // „nem-megye", hanem „gyülekezet".
  //
  // ⚠️ A `congregation` és a `diocese` viselkedés ettől BYTE-RA változatlan:
  //    `scope === 'congregation'` pontosan ugyanazokra a hívókra igaz, mint
  //    korábban a `scope !== 'diocese'`, EGYETLEN kivétellel — a kerülettel,
  //    ami eddig nem is létezett ezen a felületen.
  const gyulekezeti = scope === 'congregation'

  // Az ellenőri (számvevői) sáv TARTALÉK szövege — akkor látszik, ha a szerver
  // nem adott `readOnlyReason`-t. A megyei ág szövege BETŰRE a korábbi; a
  // kerületi azért külön, mert a kerületben nincs esperes, és a felirat NE
  // küldje a számvevőt rossz ügyintézőhöz.
  const olvasoiTartalekSzoveg =
    scope === 'district'
      ? 'Számvevőként (ellenőrként) az egyházkerület pénzügyi könyveit megtekintheted és kinyomtathatod, de nem rögzíthetsz, nem javíthatsz és nem véglegesíthetsz. A rögzítés az egyházkerületi adminisztrátor feladata.'
      : 'Számvevőként (ellenőrként) az egyházmegye pénzügyi könyveit megtekintheted és kinyomtathatod, de nem rögzíthetsz, nem javíthatsz és nem véglegesíthetsz. A rögzítés az esperes vagy az egyházmegyei adminisztrátor feladata.'

  const [activeTab, setActiveTab] = useState('dashboard')
  const [incomeRecords, setIncomeRecords] = useState(initialIncome)
  const [expenseRecords, setExpenseRecords] = useState(initialExpense)
  const [debtRows, setDebtRows] = useState(initialDebtRows)
  const [receiptHealth, setReceiptHealth] = useState(initialReceiptHealth)
  const [rentalContracts, setRentalContracts] = useState<RentalContractRow[]>([])
  const [rentalDebtRows, setRentalDebtRows] = useState<RentalDebtRow[]>([])
  const [combinedOpen, setCombinedOpen] = useState(false)
  const [decontOpen, setDecontOpen] = useState(false)
  const [dispozitieOpen, setDispozitieOpen] = useState(false)
  // #Endre 2026-07-02: a Nyugtafigyelő „hiányzó nyugták" bevételezése (Dispoziție de încasare wizard).
  const [dispozitieIncasareOpen, setDispozitieIncasareOpen] = useState(false)
  const router = useRouter()
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [budgetPrintOpen, setBudgetPrintOpen] = useState(false)
  const [openingBalancesOpen, setOpeningBalancesOpen] = useState(false)
  // 2026-07-10 (S3 #2): a Monetár lebegő widget nyitottsága — a FinanceTabs
  // vezérli, hogy a bejövő #monetary hash / a 'finance-tab-switch' event is
  // ki tudja nyitni.
  const [monetarWidgetOpen, setMonetarWidgetOpen] = useState(false)
  // 2026-08-15 (Endre): az Oblio-ellenőrzés modál (oblioModalOpen) KIVEZETVE —
  // a „Számlák egyeztetése" hub (/dokumentumtar) vette át; a régi hívóhelyek
  // (hash, custom event) oda navigálnak.

  // Belső-mozgás cél-azonosítók: azok a befizetescel/kiadascel id-k, amelyek 3xx/4xx
  // számadási kódra mutatnak (300.01/301.01/400.01/401.01/402.02). Ezeket a bevétel/kiadás
  // ÖSSZEGBŐL kizárjuk (mint a számadás), akkor is, ha a soron nincs belso_mozgas_xkey.
  const internalCelIds = useMemo(() => {
    // 2026-07-10 (#3 defense-in-depth): a 3xx/4xx mellett a 100-as fejezet
    // (Pénztármaradvány / legacy belső mozgás: 100.01/100.02/100.51/100.52) is
    // belsőnek számít — xkey nélküli ilyen tétel se torzítsa a totálokat.
    const isInternalKod = (kod: string) =>
      /^[34]/.test(kod) || kod === '100' || kod.startsWith('100.')
    const internalIncomeCelIds = new Set<number>()
    const internalExpenseCelIds = new Set<number>()
    for (const [id, kod] of Object.entries(bevCelMap)) {
      if (isInternalKod(String(kod))) internalIncomeCelIds.add(Number(id))
    }
    for (const [id, kod] of Object.entries(kiaCelMap)) {
      if (isInternalKod(String(kod))) internalExpenseCelIds.add(Number(id))
    }
    return { internalIncomeCelIds, internalExpenseCelIds }
  }, [bevCelMap, kiaCelMap])

  const balances = useMemo(() =>
    calculateBalances(incomeRecords, expenseRecords, carryoverCash, carryoverBank, internalCelIds),
    [incomeRecords, expenseRecords, carryoverCash, carryoverBank, internalCelIds]
  )

  // Bérleti szerződések + hátralék betöltése (lazy, client-oldalon)
  async function refreshRentals() {
    const { getRentalContracts, getRentalDebtRows } = await import('@/app/(dashboard)/penzugy/actions')
    const [contractsRes, debtsRes] = await Promise.all([
      getRentalContracts(false),
      getRentalDebtRows(currentYear - 1, currentYear),
    ])
    if (contractsRes.data) setRentalContracts(contractsRes.data)
    if (debtsRes.rows) setRentalDebtRows(debtsRes.rows)
  }

  useEffect(() => {
    void refreshRentals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear])

  // A Tranzakciók fülön a kiadás-soros SPV-ikon kattintása fülváltást küld
  // (custom event, nincs prop-drilling). Lásd `oblio-expense-status-icon.tsx`.
  // 2026-07-10 (S3 #2): a megszűnt monetary fülre irányuló event a widgetet
  // nyitja — a régi hívóhelyek változatlanul működnek.
  // 2026-08-15 (Endre): az oblio_ellenorzes cél a „Számlák egyeztetése" hubra
  // (/dokumentumtar, Oblio egyeztetés fül) navigál — a modál kivezetve.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail !== 'string') return
      if (detail === 'oblio_ellenorzes') { router.push('/dokumentumtar#oblio'); return }
      if (detail === 'monetary' || detail === 'monetar') { setMonetarWidgetOpen(true); return }
      setActiveTab(detail)
    }
    window.addEventListener('finance-tab-switch', handler)
    return () => window.removeEventListener('finance-tab-switch', handler)
  }, [router])

  // Hash-alapú navigáció a sidebar pénzügy almenüből
  // (Sprint Q F1.6, v0.7.6, 2026-04-26).
  // A sidebar a `/penzugy#cashbook` URL-re mutató linkkel vált fülre — a
  // mount-kor és a `hashchange` event-en is olvassuk az URL hash-t, és
  // beállítjuk az activeTab-ot. A hash értékek pontosan a Tabs `value`-ival
  // egyeznek (dashboard, cashbook, bank, transactions, budget, accounting,
  // debt, rental, sugo, admin_import).
  // 2026-07-10 (S3 #2+#4): a monetary/oblio_ellenorzes fül MEGSZŰNT, de a
  // bejövő hash (pl. régi könyvjelző) NEM 404-el: a #monetary / #monetar a
  // lebegő widgetet nyitja, a #oblio_ellenorzes pedig — 2026-08-15 (Endre)
  // óta — a „Számlák egyeztetése" hubra (/dokumentumtar) visz tovább.
  useEffect(() => {
    function applyHashToTab() {
      if (typeof window === 'undefined') return
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) return
      if (hash === 'monetary' || hash === 'monetar') {
        setMonetarWidgetOpen(true)
        // A hash-t kiürítjük, hogy egy ismételt sidebar-kattintás újra
        // hashchange-t váltson ki (különben a második kattintás néma lenne).
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        return
      }
      if (hash === 'oblio_ellenorzes') {
        // A hash-t ELŐBB kiürítjük (replaceState), hogy a böngésző Vissza
        // gombja ne pattogjon vissza ide, majd átnavigálunk a hubra.
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        router.push('/dokumentumtar#oblio')
        return
      }
      // Validáljuk hogy létező fül-érték — egyébként figyelmen kívül hagyjuk.
      const validTabs = [
        'dashboard',
        'cashbook',
        'bank',
        'transactions',
        'budget',
        'accounting',
        'debt',
        'rental',
        'sugo',
        'admin_import',
      ] as const
      if ((validTabs as readonly string[]).includes(hash)) {
        setActiveTab(hash)
      }
    }
    applyHashToTab()
    window.addEventListener('hashchange', applyHashToTab)
    return () => window.removeEventListener('hashchange', applyHashToTab)
    // A router referencia stabil (Next.js useRouter) — a deps miatt szerepel.
  }, [router])

  // Tab váltáskor frissítjük az URL hash-t — így a sidebar mindig az aktív
  // fülön mutat aktív állapotot, és újratöltéskor megmarad a fül.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const currentHash = window.location.hash.replace(/^#/, '')
    if (currentHash === activeTab) return
    // A history.replaceState-tel (NEM pushState) frissítjük — így a Vissza
    // gomb nem ugrik vissza minden fülváltáskor egy lépést.
    const newUrl = `${window.location.pathname}${window.location.search}#${activeTab}`
    window.history.replaceState(null, '', newUrl)
  }, [activeTab])

  async function refreshData() {
    const { initFinance } = await import('@/app/(dashboard)/penzugy/actions')
    const data = await initFinance(currentYear)
    if (data) {
      setIncomeRecords(data.initialIncome)
      setExpenseRecords(data.initialExpense)
      setDebtRows(data.debtRows)
      setReceiptHealth(data.receiptHealth)
    }
    // Bérleti adatok is frissülnek, hogy a hátralék követhesse a befizetéseket
    await refreshRentals()
  }

  // Bevétel kategória opciók (a befizetescel/kiadascel junction táblákban MÁR LÉTEZŐ
  // tételek — ezek a lelkész rendelkezésére álló kategóriák. A név-lookup most már
  // mindig sikerül, mert a szerver MINDEN szintű szamadasicel-t lekér — lásd a
  // 2026-04-18-i javítást actions.ts:450-ben és a diagnosztikát
  // migration-docs/sql/2026-04-18-diagnoszika-szamadasicel.sql-ben.
  // 2026-06-11 (Endre): az AGGREGÁT sorok — pl. "Egyházi tevékenységből származó
  // bevételek (5+...+12)" — és a nem-gyülekezeti szintű tételek NEM könyvelhetők,
  // ezért gyülekezeti módban kiszűrjük őket; a kanonikus belső-mozgás kódok
  // maradnak (a CombinedEntryBody belső-mozgás sor-típusa használja őket).
  // Egyházmegyei módban a viselkedés VÁLTOZATLAN.
  // 2026-06-30 (perf): id→cella index egyszer, hogy az income/expenseCategories
  // ne O(n*m)-ben (.find soronként) keresse a szamadasicel nevét/szintjét.
  const celById = useMemo(() => {
    const m = new Map<string, SzamadasiCel>()
    for (const c of szamadasiCellek) m.set(c.id, c)
    return m
  }, [szamadasiCellek])

  const incomeCategories = useMemo(() => {
    const celIds = Object.entries(bevCelMap)
    return celIds.map(([id, kod]) => {
      const cel = celById.get(kod)
      const nev = (cel?.nev || '').trim()
      return { id: Number(id), kod, nev: nev || kod, szint: cel?.szint }
    }).filter((c) =>
      scope !== 'congregation' ||
      isGyulekezetiKonyvelhetoKod(c.kod, c.szint) ||
      BELSO_MOZGAS_ROGZITO_KODS.has(c.kod),
    ).map(({ id, kod, nev }) => ({ id, kod, nev }))
      .sort((a, b) => a.kod.localeCompare(b.kod))
  }, [bevCelMap, celById, scope])

  // Kiadás kategória opciók — ua. mint incomeCategories
  const expenseCategories = useMemo(() => {
    const celIds = Object.entries(kiaCelMap)
    return celIds.map(([id, kod]) => {
      const cel = celById.get(kod)
      const nev = (cel?.nev || '').trim()
      return { id: Number(id), kod, nev: nev || kod, szint: cel?.szint }
    }).filter((c) =>
      scope !== 'congregation' ||
      isGyulekezetiKonyvelhetoKod(c.kod, c.szint) ||
      BELSO_MOZGAS_ROGZITO_KODS.has(c.kod),
    ).map(({ id, kod, nev }) => ({ id, kod, nev }))
      .sort((a, b) => a.kod.localeCompare(b.kod))
  }, [kiaCelMap, celById, scope])

  // 2026-07-17 (F5, Q6): a mód-chip kivezetve — a rendszer mindig „akkori" módon számol.
  const hasReceiptWarnings = receiptHealth.missingNumbers.length > 0 || receiptHealth.duplicateNumbers.length > 0 || receiptHealth.chronologyIssues.length > 0
  // 2026-07-11 (S7): a hiányzók kettébontva — az ELŐZŐ évből áthozottak külön
  // jelölést kapnak, hogy látszódjon: nem az idei évben maradtak el.
  const prevYearMissing = receiptHealth.prevYearMissingNumbers ?? []
  const prevYearMissingSet = new Set(prevYearMissing)
  const currentYearMissing = receiptHealth.missingNumbers.filter((n) => !prevYearMissingSet.has(n))

  // Belső mozgás párosítás-egészség — párosítatlan kassza↔bank letétel/felvét (red flag).
  // 2026-08-27: a KATEGÓRIAKÓDOT is átadjuk. Enélkül az őr csak a már párosított
  // (belso_mozgas_xkey-vel rendelkező) sorokat látta, és pontosan azokat szűrte ki,
  // amiket jeleznie kellett volna — élesben így maradt néma 7 db kassza→bank letét,
  // amit a banki import sima bevételként hozott be a 301.01 kódra.
  const internalMovementHealth = useMemo(
    () =>
      computeInternalMovementHealth(
        incomeRecords.map((r) => ({
          ...r,
          szamadasicelKod: r.id_befizetescel != null ? bevCelMap[r.id_befizetescel] ?? null : null,
        })),
        expenseRecords.map((r) => ({
          ...r,
          szamadasicelKod: r.id_kiadascel != null ? kiaCelMap[r.id_kiadascel] ?? null : null,
        })),
      ),
    [incomeRecords, expenseRecords, bevCelMap, kiaCelMap],
  )

  return (
    <>
      {/* 2026-08-11 (számvevő-kör): ellenőri nézet magyarázó sávja — a
          dashboard-egyhazmegye/page.tsx `ReadOnlyDioceseNotice` mintájára.
          Enélkül a gombok kattinthatónak LÁTSZANÁNAK, a mentés pedig nyers
          RLS-hibába futna. */}
      {readOnly && (
        <div className="card-raised mb-4 border-sky-200 bg-gradient-to-br from-sky-50/60 via-white to-slate-50/40 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <Eye className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-base text-slate-800 sm:text-lg">
                Ellenőri nézet — mindent látsz, de nem módosíthatsz
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {readOnlyReason ?? olvasoiTartalekSzoveg}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card-raised relative mb-4 overflow-hidden p-5 sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/30 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          {/* 2026-07-11 (S8): a cím + leírás + év-választó VISSZA a BAL oldalra
              (a felhasználó kérése) — a munkavégzés gombjai továbbra is itt, a
              cím alatt. Jobbra csak a tájékoztató chipek maradnak. */}
          <div className="flex flex-col items-start gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Pénzügy</p>
              {/* 2026-07-10 (S4-mobil): kisebb cím 375px-en, sm-től marad a text-3xl. */}
              <h2 className="font-heading text-2xl sm:text-3xl text-slate-800">Áttekintés és költségvetés</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                A bevételek, kiadások, kassza, bank és éves számadás egy helyen, áttekinthetően és barátságosan kezelhető.
              </p>
            </div>

            {/* Költségvetési év választó — a cím alatt, a bal oldalon. */}
            <FinanceYearSelector currentYear={currentYear} availableYears={availableYears} />

            {/* 2026-07-10 (S4-mobil): a gombok wrap-elnek, max-sm:min-h-10 —
                40px-es érintőfelület telefonon. */}
            <div className="flex flex-wrap gap-2">
              {/* 2026-08-11 (számvevő-kör): a RÖGZÍTŐ gombok ellenőri nézetben
                  nem jelennek meg — a nyomtatás/áttekintés viszont marad, mert
                  éppen az az ellenőr dolga. */}
              {!readOnly && (
                <>
                  {/* 2026-08-15 (Endre): a „Tétel rögzítése" a modul FŐ művelete
                      — a hero-sávban kiemelten, a többi gombnál nagyobb súllyal
                      áll. (A Kassza fül párhuzamos „Új tétel" sávja megszűnt: a
                      gomb kétszer jelent meg ugyanarra a műveletre.) */}
                  <Button
                    className="min-h-11 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 text-base font-semibold text-white shadow-lg ring-1 ring-emerald-500/30 transition hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl"
                    onClick={() => setCombinedOpen(true)}
                  >
                    <Plus className="mr-1.5 size-5" />
                    Tétel rögzítése
                  </Button>
                  {/* ⛔ 2026-08-19 (kerületi S5, záró ellenőrzés): a Decont és a
                      Dispoziție GYÜLEKEZETI kapu alá került.
                      MI VOLT A BAJ: mindkét gomb kizárólag a `!readOnly` kapun
                      ment át, scope-szűrés nélkül — miközben a szomszédos
                      „Számlák egyeztetése" ugyanebben a sorban megkapta a
                      `gyulekezeti` kaput. A felsőbb szintű felhasználó tehát
                      megnyitotta a dialógust, kitöltötte, és csak MENTÉSKOR
                      derült ki, hogy a művelet ezen a szinten nem létezik.
                      MIÉRT GYÜLEKEZETI: mindkét bizonylat sorszáma a
                      `penzugyi_bizonylat_sorszam` `congregation_id`-hatókörű
                      számsorából jön, és sem a `decont`, sem a `dispozitie`
                      táblának nincs felső szintű scope-oszlopa (a szerver-akciók
                      ezért zárják ki mindkét felső szintet).
                      ⚠️ Ez a MEGYEI nézetnek is javítás — ott ma is felkínált
                      egy mindig bukó gombot —, a gyülekezetit nem érinti. */}
                  {gyulekezeti && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl max-sm:min-h-10 border-violet-200 bg-violet-50 font-medium text-violet-700 shadow-sm transition hover:bg-violet-100 hover:shadow"
                        onClick={() => setDecontOpen(true)}
                      >
                        <Receipt className="mr-1 size-3.5" />
                        Decont
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl max-sm:min-h-10 border-amber-200 bg-amber-50 font-medium text-amber-700 shadow-sm transition hover:bg-amber-100 hover:shadow"
                        onClick={() => setDispozitieOpen(true)}
                      >
                        <FileText className="mr-1 size-3.5" />
                        Dispoziție
                      </Button>
                    </>
                  )}
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl max-sm:min-h-10 border-blue-200 bg-blue-50 font-medium text-blue-700 shadow-sm transition hover:bg-blue-100 hover:shadow"
                onClick={() => setPrintDialogOpen(true)}
              >
                <Printer className="mr-1 size-3.5" />
                Nyomtatási központ
              </Button>
              {/* Endre 2026-08-15: a két külön gomb („Oblio ellenőrzés" modál +
                  „Dokumentumtár" link) nem volt egyértelmű — egy közös „Számlák
                  egyeztetése" hub lett belőlük a /dokumentumtar oldalon (Oblio
                  egyeztetés + Dokumentumtár + Kifizetetlen számlák fülekkel).
                  Diocese módban rejtve (gyülekezet-szintű funkció).
                  ⛔ 2026-08-17 (kerületi S5): a kapu `!== 'diocese'`-ről
                  `=== 'congregation'`-re változott. A hub (Oblio e-Factura
                  egyeztetés, szállítói számlák, kifizetetlen ablak) a
                  GYÜLEKEZET sajátossága — Endre 2026-08-15-i döntése éppen
                  ezért rejtette el megyei nézetben. A régi alakkal a kerület
                  „nem-megyeként" MEGKAPTA volna ezt a gombot, és egy számára
                  üres/idegen felületre navigált volna. */}
              {gyulekezeti && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl max-sm:min-h-10 border-cyan-200 bg-cyan-50 font-medium text-cyan-700 shadow-sm transition hover:bg-cyan-100 hover:shadow"
                  onClick={() => router.push('/dokumentumtar')}
                >
                  <FileCheck className="mr-1 size-3.5" />
                  Számlák egyeztetése
                </Button>
              )}
              {/* A pénzügyi import fülre most közvetlen elérés van a fülsoron
                  belül a "Rendszergazdai importáló" fülön (rose, első helyen). */}
              {/* Költségvetés nyomtatás gomb áthelyezve a Költségvetés fülre */}
            </div>
          </div>

          {/* 2026-07-11 (S8): jobbra csak a tájékoztató chipek (gyülekezet,
              tartozás-mód, Oblio, god-mode), xl-en jobbra igazítva. */}
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              <Building2 className="size-3.5 text-teal-600" />
              {congregationName}
            </span>
            {/* Oblio e-Factura chip — minden Pénzügy fülön elérhető. Kattintásra
                modal nyílik a kapcsolat-teszttel és beállítással. */}
            <OblioStatusChip />
            {isGodMode && (
              <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 shadow-sm">
                <ShieldCheck className="size-3.5" />
                Rendszergazdai mód aktív
              </span>
            )}
          </div>
        </div>
      </div>

      {hasReceiptWarnings && (
        <div className="card-raised mb-4 border border-red-200 bg-red-50/80 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500 text-white shadow-sm">
              <AlertTriangle className="size-5" />
            </div>
            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold text-red-700">Nyugtafigyelő riasztás</h3>
                <p className="text-sm text-red-600/90">
                  {/* 2026-07-10 (#7): az ellenőrzés az ELŐZŐ év utolsó nyugtájától fut —
                      az évhatáron elmaradt nyugtákat a folyó év hozza át. */}
                  A rendszer {receiptHealth.trackedReceiptCount} készpénzes nyugtát ellenőrzött ebben az évben —
                  a gyülekezet saját sorszáma (Irat sz.) alapján, az előző év utolsó nyugtájától az idei
                  utolsóig — a sorszámozás évhatáron át folytatódik, az elmaradt nyugták itt pótolhatók.
                </p>
              </div>
              {receiptHealth.missingNumbers.length > 0 && (
                <div className="space-y-1.5">
                  {/* 2026-07-11 (S7): külön sor az IDEI és külön az ELŐZŐ évből
                      áthozott hiányzóknak — a lelkész lássa, melyik honnan való. */}
                  {currentYearMissing.length > 0 && (
                    <p className="text-sm text-slate-700">
                      Hiányzó nyugták az idei évből (Irat sz.):{' '}
                      <strong>{currentYearMissing.slice(0, 50).join(', ')}</strong>
                      {currentYearMissing.length > 50 && (
                        <span className="text-slate-500"> … (+{currentYearMissing.length - 50} további)</span>
                      )}
                    </p>
                  )}
                  {prevYearMissing.length > 0 && (
                    <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800">
                      ↪ Az előző{receiptHealth.prevYear ? ` (${receiptHealth.prevYear}.)` : ''} évből
                      áthozott elmaradt nyugták (Irat sz.):{' '}
                      <strong>{prevYearMissing.slice(0, 50).join(', ')}</strong>
                      {prevYearMissing.length > 50 && (
                        <span className="text-amber-600"> … (+{prevYearMissing.length - 50} további)</span>
                      )}{' '}
                      — ezek tavaly maradtak el, a pótlásuk itt, a folyó évben történik.
                    </p>
                  )}
                  {/* #Endre 2026-07-02: a hiányzó nyugták BEVÉTELEK → bevételi elszámolás (Decont
                      de încasări) élő előnézettel; minden hiányzó Irat sz. külön bevételi tétel a
                      KASSZÁBA és a SZÁMADÁSba, a Kerületi sz. a szomszédokból kikövetkeztetve. */}
                  {/* 2026-07-10 (S4-mobil): max-sm:min-h-10 — 40px-es érintőfelület telefonon. */}
                  <button
                    type="button"
                    onClick={() => setDispozitieIncasareOpen(true)}
                    className="inline-flex max-sm:min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
                    title="Megnyitja a bevételi elszámolást a hiányzó nyugtákkal. Minden nyugta külön bevételi tételként a kasszába és a számadásba kerül, élő előnézettel."
                  >
                    Hiányzó nyugták bevételi elszámolása (Decont de încasări)
                  </button>
                </div>
              )}
              {receiptHealth.duplicateNumbers.length > 0 && (
                <p className="text-sm text-slate-700">
                  Ismétlődő nyugtaszámok (Irat sz.):{' '}
                  <strong>{receiptHealth.duplicateNumbers.slice(0, 50).join(', ')}</strong>
                  {receiptHealth.duplicateNumbers.length > 50 && (
                    <span className="text-slate-500"> … (+{receiptHealth.duplicateNumbers.length - 50} további)</span>
                  )}
                </p>
              )}
              {receiptHealth.chronologyIssues.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm text-slate-700">Dátumrendellenességek:</p>
                  {receiptHealth.chronologyIssues.slice(0, 3).map(issue => (
                    <p key={`${issue.previousNumber}-${issue.currentNumber}`} className="text-xs text-slate-600">
                      Nyugta {issue.currentNumber} dátuma ({issue.currentDate}) korábbi, mint a {issue.previousNumber}. nyugtáé ({issue.previousDate}).
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <InternalMovementWarning health={internalMovementHealth} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <ColorTabs
          tabs={[
            { value: 'dashboard', label: 'Áttekintés', color: 'blue' },
            { value: 'cashbook', label: 'Kassza', color: 'emerald' },
            { value: 'bank', label: 'Bank', color: 'violet' },
            { value: 'transactions', label: 'Tranzakciók', color: 'pink' },
            { value: 'budget', label: 'Költségvetés', color: 'amber' },
            { value: 'accounting', label: 'Számadás', color: 'cyan' },
            // Diocese módban ezek a fülek el vannak rejtve (tag-szintűek / gyülekezet-specifikusak)
            // 2026-07-10 (S3 #2+#4): a Monetár fül a lebegő widgetbe, az Oblio
            // ellenőrzés fül a hero-gombból nyíló modálba költözött — a fülsorból
            // mindkettő kikerült.
            // ⛔ 2026-08-17 (kerületi S5): a kapu `=== 'diocese' ? [] : […]`-ról
            // `=== 'congregation' ? […] : []`-ra fordult. A Tartozások (tagi
            // egyházfenntartói járulék) és a Bérleti szerződések a GYÜLEKEZET
            // sajátosságai — a kerületnek nincsenek tagjai és nincs bérbeadója.
            // A régi alakkal a kerület két, számára örökre ÜRES fület kapott
            // volna a fülsorba.
            ...(gyulekezeti ? [
              { value: 'debt', label: 'Tartozások', color: 'orange' },
              { value: 'rental', label: 'Bérleti szerződések', color: 'amber' },
            ] : []),
            { value: 'sugo', label: 'Súgó', color: 'teal' },
            // 2026-05-25: Rendszergazdai importáló a sor VÉGÉN, mindig piros háttérrel
            // (red-prominent: vizuálisan figyelmeztető, hogy a fül veszélyes műveletet rejt).
            // Jogosultság a page.tsx-ben kerül kiértékelésre (god mode / delegated / admin).
            ...(showAdminImport ? [
              { value: 'admin_import', label: 'Rendszergazdai importáló', color: 'red-prominent' as const },
            ] : []),
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />

        <TabsContent value="dashboard" className="mt-4">
          {/* 2026-08-11 (számvevő-kör): ellenőri nézetben nem kínálunk „Rögzítsd
              az első tételt" CTA-t — nem tudja megtenni. */}
          {!readOnly && incomeRecords.length === 0 && expenseRecords.length === 0 && (
            <EmptyFirstRecord
              className="mb-4"
              accent="emerald"
              icon={Wallet}
              title="Még nincs pénzügyi tétel"
              // 2026-08-17 (kerületi S5): a kerületi változat NE „a gyülekezet"
              // nyilvántartásáról beszéljen. A gyülekezeti és a MEGYEI szöveg
              // BETŰRE változatlan (a megyei felirat mai pontatlanságát
              // szándékosan nem javítjuk itt: az a 2. szint viselkedése).
              description={
                scope === 'district'
                  ? 'Kezdd el az egyházkerület pénzügyi nyilvántartását — rögzítsd az első befizetést vagy kiadást. A kassza, bank és számadás innen épül fel.'
                  : 'Kezdd el a gyülekezet pénzügyi nyilvántartását — rögzítsd az első befizetést vagy kiadást. A kassza, bank és számadás innen épül fel.'
              }
              ctaLabel="Rögzítsd az első tételt"
              onCta={() => setCombinedOpen(true)}
              secondaryLabel="Bevétel / kiadás rögzítése"
              onSecondary={() => setCombinedOpen(true)}
            />
          )}
          <FinanceDashboard
            balances={balances}
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            settings={settings}
          />
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <TransactionsTab
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            szamadasiCellek={szamadasiCellek}
            congregationName={congregationName}
            // 2026-08-22 (6. pont): a kísérőív (BORDEROU DE PLĂȚI) fejlécéhez —
            // eddig a végig román íven CSAK a magyar név állt.
            congregationNameRo={congregationNameRo}
            onRefresh={refreshData}
            rentalContracts={rentalContracts}
            bankAccounts={bankAccounts}
            // 2026-07-11 (S6-#1): élő párosítási státusz az exporthoz — a
            // beégetett „Várakozik banki egyeztetésre" helyett (mint a Kassza fülön).
            unpairedInternalIds={internalMovementHealth.unpairedIds}
          />
        </TabsContent>

        <TabsContent value="cashbook" className="mt-4">
          <CashbookTab
            unpairedInternalIds={internalMovementHealth.unpairedIds}
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            carryoverCash={carryoverCash}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            szamadasiCellek={szamadasiCellek}
            congregationName={congregationName}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            // 2026-08-11 (5. kör, P0): a nézett év számadás-zárja — véglegesített
            // évben a Kassza fül nem kínálja fel a tétel-szerkesztést.
            accountingFinalized={!!settings.accounting_finalized}
            onTransactionChanged={refreshData}
            onOpenOpeningBalances={scope === 'congregation' ? () => setOpeningBalancesOpen(true) : undefined}
            // 2026-08-15 (Endre): a Kassza fül kiemelt „Új tétel" sávja MEGSZŰNT
            // — ugyanazt a rögzítőt nyitotta, mint a hero „Tétel rögzítése"
            // gombja, tehát a művelet kétszer jelent meg az oldalon. Az igevers
            // és a bátorítás a rögzítő ablakba költözött (RogzitesBiztato).
          />
        </TabsContent>

        <TabsContent value="bank" className="mt-4">
          <BankTab
            currentYear={currentYear}
            unpairedInternalIds={internalMovementHealth.unpairedIds}
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            carryoverBank={carryoverBank}
            derivedNyitoRon={bankNyitoMap}
            bankAccounts={bankAccounts}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            szamadasiCellek={szamadasiCellek}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            onBankImported={refreshData}
            congregationId={congregationId}
            onBankAccountSaved={refreshData}
            // 2026-08-11 (5. kör, P0-követő): a Bank fül ugyanazt a szerkesztő-
            // dialógust nyitja, mint a Kassza — zárt évben itt is le kell tiltani.
            accountingFinalized={!!settings.accounting_finalized}
            onTransactionChanged={refreshData}
            onOpenOpeningBalances={scope === 'congregation' ? () => setOpeningBalancesOpen(true) : undefined}
          />
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          {/* Költségvetés nyomtatás gomb csak ezen a fülön — átkerült a hero-ból. */}
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl max-sm:min-h-10 border-teal-200 text-teal-700 hover:bg-teal-50"
              onClick={() => setBudgetPrintOpen(true)}
            >
              <Printer className="mr-1 size-3.5" />
              Költségvetés nyomtatás
            </Button>
          </div>
          {/* 2026-07-10 (#2): carryoverCash/Bank — nyitó egyenleg blokk a fülön.
              2026-08-11 (6. kör): `scope`. A SOROK mindkét hatókörben ugyanazok:
              a hivatalos ív MINDEN tétele, pontosan úgy, ahogy a nyomtatványon
              (tulajdonosi döntés: „minden tétel szerepel rajta, nem csak az
              egyházmegyeiek!"). A `scope` már csak a szerkeszthetőséget dönti el:
              gyülekezeti hatókörben az egyházmegyei szintű sorok zárolva, megyei
              hatókörben minden sor szerkeszthető. */}
          <BudgetTab
            szamadasiCellek={szamadasiCellek}
            settings={settings}
            currentYear={currentYear}
            scope={scope}
            carryoverCash={carryoverCash}
            carryoverBank={carryoverBank}
          />
        </TabsContent>

        <TabsContent value="accounting" className="mt-4">
          {/* 2026-07-10 (#2): carryoverCash/Bank — nyitó egyenleg blokk a fülön.
              2026-07-25 (G3): balances — évi összegző hero, a Kassza/Bank/Dashboard
              fülekkel bit-azonos memo lecsorgatva. */}
          <AccountingTabV2
            szamadasiCellek={szamadasiCellek}
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            settings={settings}
            currentYear={currentYear}
            scope={scope}
            carryoverCash={carryoverCash}
            carryoverBank={carryoverBank}
            // Diocese-módban a hero rejtve — a carryover/balances szemantika ott más.
            // ⛔ 2026-08-17 (kerületi S5): `=== 'diocese' ? undefined : balances`
            // helyett `gyulekezeti`. Az évi összegző hero a GYÜLEKEZETI
            // kassza/bank-egyenleg levezetésére épül (nyugtatömb, tagi
            // befizetések, nyitó egyenlegek) — felsőbb szinten a szemantikája
            // más. A régi alakkal a kerület egy olyan összegzőt kapott volna,
            // amit a saját adataira nem így vezetünk le.
            balances={gyulekezeti ? balances : undefined}
            // 2026-08-15: ellenőri nézetben a megyei felküldés-kártya gombjai
            // rejtve (a szerver akció is tiltja — ez a felhasználó kímélete).
            readOnly={readOnly}
          />
        </TabsContent>

        {/* Diocese-ben a tag-szintű és gyülekezet-specifikus fülek nem renderelődnek.
            ⛔ 2026-08-17 (kerületi S5): a kapu `!== 'diocese'`-ről
            `=== 'congregation'`-re változott — PÁRBAN a fenti fülsor-kapuval.
            Ha csak az egyik fordult volna meg, a kerület vagy címke nélküli
            tartalmat, vagy tartalom nélküli címkét kapott volna. */}
        {gyulekezeti && (
          <>
            <TabsContent value="debt" className="mt-4">
              <DebtTabV2
                debtRows={debtRows}
                yearlyFees={yearlyFees}
                currentYear={currentYear}
                debtCalcMode={debtCalcMode}
                rentalDebtRows={rentalDebtRows}
              />
            </TabsContent>

            <TabsContent value="rental" className="mt-4">
              <RentalTab contracts={rentalContracts} onChanged={refreshRentals} />
            </TabsContent>

            {/* 2026-07-10 (S3 #2+#4): a Monetár TabsContent a lebegő widgetbe
                (MonetarFloatingWidget, lásd lentebb), az Oblio-ellenőrzés
                TabsContent a teljes-képernyős modálba költözött. */}
          </>
        )}

        <TabsContent value="sugo" className="mt-4">
          <FinanceSugoTab />
        </TabsContent>

        {/* Rendszergazdai importáló — a tab-lista végén (Súgó után), red-prominent
            háttérrel. Jogosultság: god mode / delegated import / admin szerepkör.
            keepMounted=false: a wizard csak akkor töltődik be, ha aktív a fül,
            így a böngésző nem dolgozik feleslegesen. */}
        {showAdminImport && (
          <TabsContent value="admin_import" className="mt-4">
            <FinanceImportTabs
              congregationId={congregationId}
              congregationName={congregationName}
              showDanger={isGodMode}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Összevont bevétel/kiadás rögzítő modal — egy gomb, két fül */}
      <CombinedEntryDialog
        open={combinedOpen}
        onOpenChange={(open) => { setCombinedOpen(open); if (!open) refreshData() }}
        incomeCategories={incomeCategories}
        expenseCategories={expenseCategories}
        bankAccounts={bankAccounts}
        currentYear={currentYear}
        congregationId={congregationId}
        // 2026-08-22 (5. pont): a rögzítő MOSTANTÓL ismeri a szintet. Enélkül a
        // dialógus `'congregation'`-re esett vissza, és felső szinten is a
        // gyülekezet-specifikus extrákat (család csatolása, járulék-ajánló)
        // kínálta — miközben a befizető-kereső már hatókör-tudatos.
        scope={scope}
        // 2026-08-09: pénzügy→leltár híd — csak gyülekezeti módban (az egyházmegyei
        // könyvelésnek nincs leltár-integrációja).
        // ⛔ 2026-08-17 (kerületi S5): a kapu `!== 'diocese'`-ről
        // `=== 'congregation'`-re változott. Ez a legveszélyesebb a hét kapu
        // közül: a híd a kiadásból leltári tételt gyárt, és a GYÜLEKEZETI
        // leltárba ír. A régi alakkal a kerületi adminisztrátor kiadás-rögzítés
        // közben felajánlva kapta volna a leltárba vételt — az eredmény vagy egy
        // néma 0-soros mentés, vagy egy idegen gyülekezet leltárába csúszott
        // kerületi eszköz lett volna. A kerület saját leltára a Leltár modulban
        // él (`leltar_tetelek.district_id`), nem ezen a hídon át.
        offerExpenseInventory={gyulekezeti}
      />

      {/* Decont (elszámolás) dialog — a hivatalos Elszamolas sablonnal */}
      <DecontDialog
        open={decontOpen}
        onOpenChange={(open) => { setDecontOpen(open); if (!open) refreshData() }}
        congregationName={congregationName}
        // 2026-08-22 (6. pont): a DECONT „Unitate" sávja is kétnyelvű.
        congregationNameRo={congregationNameRo}
        categories={expenseCategories}
      />

      {/* #Endre 2026-07-02: hiányzó nyugták BEVÉTELI ELSZÁMOLÁSA (Decont de încasări) —
          élő előnézettel, kikövetkeztetett Kerületi sz.-mal, több befizetővel nyugtánként */}
      <DispozitieIncasareWizard
        open={dispozitieIncasareOpen}
        onOpenChange={setDispozitieIncasareOpen}
        missingNumbers={receiptHealth.missingNumbers}
        missingReceipts={receiptHealth.missingReceipts}
        congregationName={congregationName}
        // 2026-08-22 (6. pont): a DECONT DE ÎNCASĂRI „Unitate" sávja is kétnyelvű.
        congregationNameRo={congregationNameRo}
        incomeCategories={incomeCategories}
        defaultDate={
          currentYear === new Date().getFullYear()
            ? undefined
            : `${currentYear}-${new Date().toISOString().slice(5, 10)}`
        }
        onDone={refreshData}
      />

      {/* Dispoziție de plată / încasare dialog */}
      <DispozitieDialog
        open={dispozitieOpen}
        onOpenChange={(open) => { setDispozitieOpen(open); if (!open) refreshData() }}
        congregationName={congregationName}
        congregationNameRo={congregationNameRo}
        incomeCategories={incomeCategories}
        expenseCategories={expenseCategories}
        // A kiválasztott (nem folyó) évre álló alapértelmezett dátum, hogy a Dispoziție a
        // megfelelő év készpénzes tételeit listázza + sorszámozzon (pl. 2025 egyeztetésekor).
        defaultDate={
          currentYear === new Date().getFullYear()
            ? undefined
            : `${currentYear}-${new Date().toISOString().slice(5, 10)}`
        }
      />

      <BudgetPrintDialog
        open={budgetPrintOpen}
        onOpenChange={setBudgetPrintOpen}
        cellek={szamadasiCellek}
        settings={settings}
        bevCelMap={bevCelMap}
        kiaCelMap={kiaCelMap}
        incomeRecords={incomeRecords}
        expenseRecords={expenseRecords}
        congregationName={congregationName}
        congregationNameRo={congregationNameRo}
        carryoverCash={carryoverCash}
        carryoverBank={carryoverBank}
        currentYear={currentYear}
        // 2026-08-15 (egyházmegyei terv, 2.1): hatókör-tudatos nyomtatás — a
        // megyei terv-sorok és az évi beállítás a diocese_* táblákból jönnek,
        // a borító pedig a megyei feliratokat kapja.
        scope={scope}
        districtName={districtName}
        districtNameRo={districtNameRo}
      />

      <FinancePrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        income={incomeRecords}
        expense={expenseRecords}
        bankAccounts={bankAccounts}
        cellek={szamadasiCellek}
        bevCelMap={bevCelMap}
        kiaCelMap={kiaCelMap}
        congregationName={congregationName}
        congregationNameRo={congregationNameRo}
        carryoverCash={carryoverCash}
        carryoverBank={carryoverBank}
        bankNyitoMap={bankNyitoMap}
        currentYear={currentYear}
        settings={settings}
        scope={scope}
        districtName={districtName}
        districtNameRo={districtNameRo}
      />

      {/* 2026-07-17 (F4): Induló (nyitó) egyenlegek szerkesztője — a kész
          OpeningBalancesManager eddig elérhetetlen volt a felületről. */}
      {scope === 'congregation' && (
        <OpeningBalancesDialog
          open={openingBalancesOpen}
          onOpenChange={(open) => {
            setOpeningBalancesOpen(open)
            if (!open) {
              // A carryover/bankNyitoMap PROP (nem state) — a refreshData csak a
              // tétel-listákat frissíti, a nyitókhoz szerver-újrarender kell,
              // különben a KPI-k és a Registru Banca a régi nyitóval menne tovább.
              refreshData()
              router.refresh()
            }
          }}
          bankAccounts={bankAccounts}
          congregationId={congregationId}
        />
      )}

      {/* 2026-08-15 (Endre): az Oblio ellenőrzés teljes-képernyős modál
          KIVEZETVE — a tartalma (a MEGLÉVŐ OblioEllenorzesTab wrapper) a
          /dokumentumtar „Számlák egyeztetése" hub „Oblio egyeztetés" fülén
          él tovább (szamlak-egyeztetese-tabs.tsx). */}

      {/* 2026-07-10 (S3 #2): Monetár lebegő widget — csak a /penzugy oldalon
          (a FinanceTabs mountolja), diocese módban rejtve. A meglévő monetár
          propok a monetary-tab-v2 wrapperen át jutnak bele, a teljes
          funkcionalitással (mentés, nyomtatás, törlés) + számológéppel.
          ⛔ 2026-08-17 (kerületi S5): a kapu `!== 'diocese'`-ről
          `=== 'congregation'`-re változott. A Monetár a gyülekezeti
          KÉSZPÉNZKASSZA címletjegyzéke (`congregationName` felirattal, a
          gyülekezeti kassza-egyenleghez mérve) — Endre ezért rejtette el megyei
          nézetben. A kerület „nem-megyeként" megkapta volna, méghozzá a
          gyülekezeti egyenleg-szemantikával. */}
      {gyulekezeti && (
        <MonetarFloatingWidget
          open={monetarWidgetOpen}
          onOpenChange={setMonetarWidgetOpen}
          expectedCashBalance={balances.cashBalance}
          currentYear={currentYear}
          bankAccounts={bankAccounts}
          internalTransfers={internalTransfers}
          congregationName={congregationName}
          // 2026-08-22 (6. pont): a MONETAR fejléce is kétnyelvű.
          congregationNameRo={congregationNameRo}
        />
      )}
    </>
  )
}
