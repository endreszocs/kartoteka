'use client'

import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle, Building2, CalendarRange, Printer, ShieldCheck, Wallet } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { ColorTabs } from '@/components/ui/color-tabs'
import { Button } from '@/components/ui/button'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { FinanceDashboard } from './dashboard-tab'
import { OblioStatusChip } from './oblio-status-chip'
import { CashbookTab } from './cashbook-tab'
import { BankTab } from './bank-tab'
import { BudgetTab } from './budget-tab'
import { AccountingTabV2 } from './accounting-tab-v2'
import { DebtTabV2 } from './debt-tab-v2'
import { TransactionsTab } from './transactions-tab'
import { MonetaryTabV2 } from './monetary-tab-v2'
import { RentalTab } from './rental-tab'
import { OblioEllenorzesTab } from './oblio-ellenorzes-tab'
import { PenzugyHelp } from './penzugy-help'
import { PenzugyImportWizard } from './finance-import/penzugy-import-wizard'
import { slugifyCongregationName } from '@/lib/utils/slugify'
import { CombinedEntryDialog } from '@/components/modals/combined-entry-dialog'
import { DecontDialog } from '@/components/modals/decont-dialog'
import { DispozitieDialog } from '@/components/modals/dispozitie-dialog'
import { FinancePrintDialog } from '@/components/finance/finance-print-dialog'
import { BudgetPrintDialog } from '@/components/finance/budget-print-dialog'
import { calculateBalances } from '@/lib/utils/finance-helpers'
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
  congregationName: string
  congregationId: string
  debtCalcMode: DebtCalcMode
  yearlyFees: Record<number, number>
  debtRows: DebtRow[]
  receiptHealth: ReceiptHealth
  currentYear: number
  isGodMode: boolean
  /** 2026-04-18 SCOPE-AWARE: 'congregation' (default) vagy 'diocese'.
   *  Diocese módban a tag-szintű fülek (debt, monetary, rental, oblio) el vannak rejtve. */
  scope?: 'congregation' | 'diocese'
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
  carryoverCash, carryoverBank, congregationName, congregationId,
  currentYear, yearlyFees, debtRows: initialDebtRows, receiptHealth: initialReceiptHealth, debtCalcMode, isGodMode,
  scope = 'congregation',
  showAdminImport = false,
}: FinanceTabsProps) {
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
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [budgetPrintOpen, setBudgetPrintOpen] = useState(false)

  const balances = useMemo(() =>
    calculateBalances(incomeRecords, expenseRecords, carryoverCash, carryoverBank),
    [incomeRecords, expenseRecords, carryoverCash, carryoverBank]
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
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail === 'string') setActiveTab(detail)
    }
    window.addEventListener('finance-tab-switch', handler)
    return () => window.removeEventListener('finance-tab-switch', handler)
  }, [])

  // Hash-alapú navigáció a sidebar pénzügy almenüből
  // (Sprint Q F1.6, v0.7.6, 2026-04-26).
  // A sidebar a `/penzugy#cashbook` URL-re mutató linkkel vált fülre — a
  // mount-kor és a `hashchange` event-en is olvassuk az URL hash-t, és
  // beállítjuk az activeTab-ot. A hash értékek pontosan a Tabs `value`-ival
  // egyeznek (dashboard, cashbook, bank, transactions, budget, accounting,
  // debt, rental, monetary, oblio_ellenorzes, sugo).
  useEffect(() => {
    function applyHashToTab() {
      if (typeof window === 'undefined') return
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) return
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
        'monetary',
        'oblio_ellenorzes',
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
  }, [])

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
  const incomeCategories = useMemo(() => {
    const celIds = Object.entries(bevCelMap)
    return celIds.map(([id, kod]) => {
      const cel = szamadasiCellek.find(c => c.id === kod)
      const nev = (cel?.nev || '').trim()
      return { id: Number(id), kod, nev: nev || kod }
    }).sort((a, b) => a.kod.localeCompare(b.kod))
  }, [bevCelMap, szamadasiCellek])

  // Kiadás kategória opciók — ua. mint incomeCategories
  const expenseCategories = useMemo(() => {
    const celIds = Object.entries(kiaCelMap)
    return celIds.map(([id, kod]) => {
      const cel = szamadasiCellek.find(c => c.id === kod)
      const nev = (cel?.nev || '').trim()
      return { id: Number(id), kod, nev: nev || kod }
    }).sort((a, b) => a.kod.localeCompare(b.kod))
  }, [kiaCelMap, szamadasiCellek])

  const debtModeLabel = debtCalcMode === 'aktualis' ? 'Aktuális évi besorolás' : 'Akkori évi besorolás'
  const hasReceiptWarnings = receiptHealth.missingNumbers.length > 0 || receiptHealth.duplicateNumbers.length > 0 || receiptHealth.chronologyIssues.length > 0

  return (
    <>
      <div className="card-raised relative mb-4 overflow-hidden p-5 sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/30 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Pénzügy</p>
            <h2 className="font-heading text-3xl text-slate-800">Áttekintés és költségvetés</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              A bevételek, kiadások, kassza, bank és éves számadás egy helyen, áttekinthetően és barátságosan kezelhető.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                <Building2 className="size-3.5 text-teal-600" />
                {congregationName}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
                <CalendarRange className="size-3.5" />
                {currentYear}. költségvetési év
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
                <Wallet className="size-3.5" />
                Tartozásszámítás: {debtModeLabel}
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

          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-xl bg-teal-600 text-white hover:bg-teal-700" onClick={() => setCombinedOpen(true)}>
              + Tétel rögzítése
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => setDecontOpen(true)}>
              Decont
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => setDispozitieOpen(true)}>
              Dispoziție
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setPrintDialogOpen(true)}>
              <Printer className="mr-1 size-3.5" />
              Nyomtatási központ
            </Button>
            {/* A pénzügyi import fülre most közvetlen elérés van a fülsoron
                belül a "Rendszergazdai importáló" fülön (rose, első helyen). */}
            {/* Költségvetés nyomtatás gomb áthelyezve a Költségvetés fülre */}
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
                  A rendszer {receiptHealth.trackedReceiptCount} készpénzes nyugtát ellenőrzött ebben az évben.
                </p>
              </div>
              {receiptHealth.missingNumbers.length > 0 && (
                <p className="text-sm text-slate-700">
                  Hiányzó nyugták: <strong>{receiptHealth.missingNumbers.join(', ')}</strong>
                </p>
              )}
              {receiptHealth.duplicateNumbers.length > 0 && (
                <p className="text-sm text-slate-700">
                  Ismétlődő nyugtaszámok: <strong>{receiptHealth.duplicateNumbers.join(', ')}</strong>
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
            ...(scope === 'diocese' ? [] : [
              { value: 'debt', label: 'Tartozások', color: 'orange' },
              { value: 'rental', label: 'Bérleti szerződések', color: 'amber' },
              { value: 'monetary', label: 'Monetár', color: 'slate' },
              { value: 'oblio_ellenorzes', label: 'Oblio ellenőrzés', color: 'cyan' },
            ]),
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
          {incomeRecords.length === 0 && expenseRecords.length === 0 && (
            <EmptyFirstRecord
              className="mb-4"
              accent="emerald"
              icon={Wallet}
              title="Még nincs pénzügyi tétel"
              description="Kezdd el a gyülekezet pénzügyi nyilvántartását — rögzítsd az első befizetést vagy kiadást. A kassza, bank és számadás innen épül fel."
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
            onRefresh={refreshData}
            rentalContracts={rentalContracts}
          />
        </TabsContent>

        <TabsContent value="cashbook" className="mt-4">
          <CashbookTab
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            carryoverCash={carryoverCash}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            szamadasiCellek={szamadasiCellek}
            congregationName={congregationName}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            onTransactionChanged={refreshData}
          />
        </TabsContent>

        <TabsContent value="bank" className="mt-4">
          <BankTab
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            carryoverBank={carryoverBank}
            bankAccounts={bankAccounts}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            szamadasiCellek={szamadasiCellek}
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
            onBankImported={refreshData}
            congregationId={congregationId}
            onBankAccountSaved={refreshData}
            onTransactionChanged={refreshData}
          />
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          {/* Költségvetés nyomtatás gomb csak ezen a fülön — átkerült a hero-ból. */}
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-teal-200 text-teal-700 hover:bg-teal-50"
              onClick={() => setBudgetPrintOpen(true)}
            >
              <Printer className="mr-1 size-3.5" />
              Költségvetés nyomtatás
            </Button>
          </div>
          <BudgetTab szamadasiCellek={szamadasiCellek} settings={settings} currentYear={currentYear} />
        </TabsContent>

        <TabsContent value="accounting" className="mt-4">
          <AccountingTabV2
            szamadasiCellek={szamadasiCellek}
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            bevCelMap={bevCelMap}
            kiaCelMap={kiaCelMap}
            settings={settings}
            currentYear={currentYear}
            scope={scope}
          />
        </TabsContent>

        {/* Diocese-ben a tag-szintű és gyülekezet-specifikus fülek nem renderelődnek */}
        {scope !== 'diocese' && (
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

            <TabsContent value="monetary" className="mt-4">
              <MonetaryTabV2
                expectedCashBalance={balances.cashBalance}
                currentYear={currentYear}
                bankAccounts={bankAccounts}
                internalTransfers={internalTransfers}
                congregationName={congregationName}
              />
            </TabsContent>

            <TabsContent value="oblio_ellenorzes" className="mt-4" keepMounted>
              <OblioEllenorzesTab
                congregationSlug={slugifyCongregationName(congregationName)}
                congregationName={congregationName}
                currentYear={currentYear}
              />
            </TabsContent>
          </>
        )}

        <TabsContent value="sugo" className="mt-4">
          <PenzugyHelp />
        </TabsContent>

        {/* Rendszergazdai importáló — a tab-lista végén (Súgó után), red-prominent
            háttérrel. Jogosultság: god mode / delegated import / admin szerepkör.
            keepMounted=false: a wizard csak akkor töltődik be, ha aktív a fül,
            így a böngésző nem dolgozik feleslegesen. */}
        {showAdminImport && (
          <TabsContent value="admin_import" className="mt-4">
            <PenzugyImportWizard />
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
      />

      {/* Decont (elszámolás) dialog — a hivatalos Elszamolas sablonnal */}
      <DecontDialog
        open={decontOpen}
        onOpenChange={(open) => { setDecontOpen(open); if (!open) refreshData() }}
        congregationName={congregationName}
        categories={expenseCategories}
      />

      {/* Dispoziție de plată / încasare dialog */}
      <DispozitieDialog
        open={dispozitieOpen}
        onOpenChange={(open) => { setDispozitieOpen(open); if (!open) refreshData() }}
        congregationName={congregationName}
        incomeCategories={incomeCategories}
        expenseCategories={expenseCategories}
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
        carryoverCash={carryoverCash}
        carryoverBank={carryoverBank}
        currentYear={currentYear}
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
        carryoverCash={carryoverCash}
        carryoverBank={carryoverBank}
        currentYear={currentYear}
      />
    </>
  )
}
