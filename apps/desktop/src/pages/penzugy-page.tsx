/**
 * Pénzügy — EGYSÉGES tab-oldal (`/penzugy`, 2026-06-10 B-hullám).
 *
 * A web `finance-tabs.tsx` szerkezetét másolja: KÖZÖS `FinanceHero` + KÖZÖS
 * `ColorTabs` tab-bar + tab-tartalom. Azonos komponens = azonos megjelenés.
 *
 * Az összes adatot EGYSZER tölti be a lokális SQLite-ból (a 4 kész tab közös
 * adatait), és a megosztott komponenseknek prop-on adja át — pontosan, mint a web.
 *
 * Kész tabok (read-only, inline): Áttekintés, Tranzakciók, Számadás, Tartozások.
 * A többi tab (Kassza/Bank/Költségvetés/Bérleti/Monetár/Súgó) az írási út / külön
 * szinkron miatt egyelőre a bal oldali Pénzügy-almenüben érhető el (C-hullám).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

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
  BELSO_MOZGAS_ROGZITO_KODS,
  isGyulekezetiKonyvelhetoKod,
} from '@kartoteka/ui-app'

import {
  undoStornoUseCase,
  autoIssueChitantaForBefizetesUseCase,
  getChitantakForBefizetesekUseCase,
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
import { DesktopCombinedEntryDialog } from '../components/combined-entry-dialog'
import { DesktopStornoConfirmDialog } from '../components/storno-confirm-dialog'
import { DesktopTransactionEditDialog } from '../components/transaction-edit-dialog'
import { ChitantaPrintDialog } from '../components/chitanta-print-dialog'
import { DesktopChitantaTombRequiredDialog } from '../components/chitanta-tomb-required-dialog'
import { DESKTOP_HELP_SECTIONS } from '../lib/desktop-help-sections'

const READY_TABS = ['dashboard', 'cashbook', 'transactions', 'accounting', 'debt']

const TAB_DEFS = [
  { value: 'dashboard', label: 'Áttekintés', color: 'blue' },
  { value: 'cashbook', label: 'Kassza', color: 'emerald' },
  { value: 'bank', label: 'Bank', color: 'violet' },
  { value: 'transactions', label: 'Tranzakciók', color: 'pink' },
  { value: 'budget', label: 'Költségvetés', color: 'amber' },
  { value: 'accounting', label: 'Számadás', color: 'cyan' },
  { value: 'debt', label: 'Tartozások', color: 'orange' },
  { value: 'rental', label: 'Bérleti szerződések', color: 'amber' },
  { value: 'monetary', label: 'Monetár', color: 'slate' },
  { value: 'sugo', label: 'Súgó', color: 'teal' },
]

const EMPTY_BALANCES: FinanceBalances = { cashBalance: 0, bankBalance: 0, totalIncome: 0, totalExpense: 0 }

function readHashTab(): string {
  if (typeof window === 'undefined') return 'dashboard'
  const h = window.location.hash.replace(/^#/, '')
  return TAB_DEFS.some((t) => t.value === h) ? h : 'dashboard'
}

export function PenzugyPage() {
  const [activeTab, setActiveTab] = useState<string>(readHashTab)
  const [loading, setLoading] = useState(true)
  const [year] = useState<number>(() => new Date().getFullYear())

  const [income, setIncome] = useState<BefitetesRow[]>([])
  const [expense, setExpense] = useState<KiadasRow[]>([])
  const [bevCelMap, setBevCelMap] = useState<Record<number, string>>({})
  const [kiaCelMap, setKiaCelMap] = useState<Record<number, string>>({})
  const [szamadasiCellek, setSzamadasiCellek] = useState<SzamadasiCel[]>([])
  const [balances, setBalances] = useState<FinanceBalances>(EMPTY_BALANCES)
  // Előző évi záró kassza-egyenleg (a Kassza-fül nyitó egyenlege).
  const [carryoverCash, setCarryoverCash] = useState(0)
  const [settings, setSettings] = useState<BealitasRow | null>(null)
  const [budgetData, setBudgetData] = useState<Record<string, number>>({})
  const [debtRows, setDebtRows] = useState<DebtRow[]>([])
  const [yearlyFees, setYearlyFees] = useState<Record<number, number>>({})
  const [congregationName, setCongregationName] = useState('')

  // C-hullám C1 — írási út: a „+ Tétel rögzítése" összevont bevitelhez kell a
  // gyülekezet-uuid + user-id (a saveIncome/saveExpense use-case ctx-éhez).
  const [userId, setUserId] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [combinedOpen, setCombinedOpen] = useState(false)
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
    const cur = window.location.hash.replace(/^#/, '')
    if (cur !== activeTab) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${activeTab}`)
    }
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

      const cong = await getLocalOwnCongregation(user.id)
      setCongregationName(cong?.nev_hu || cong?.name || '')

      const [
        befLocal, kiaLocal, prevBefLocal, prevKiaLocal,
        bevMap, kiaMap, cells, beal, budget,
        members, exemptions, discounts, yearSettings, fees,
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
      ])

      const incomeRows = befLocal.map(toBefitetesRow)
      const expenseRows = kiaLocal.map(toKiadasRow)
      const prevBalances = calculateBalances(prevBefLocal.map(toBefitetesRow), prevKiaLocal.map(toKiadasRow), 0, 0)
      const yearBalances = calculateBalances(incomeRows, expenseRows, prevBalances.cashBalance, prevBalances.bankBalance)

      const maintenancePayments: JarulekPaymentLike[] = befLocal
        .filter((b) => (bevMap[b.id_befizetescel] || '').startsWith('101.01'))
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
      setCarryoverCash(prevBalances.cashBalance)
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
  const incomeCategories = useMemo<IncomeCategory[]>(
    () =>
      Object.entries(bevCelMap)
        .map(([id, kod]) => {
          const cel = szamadasiCellek.find((c) => c.id === kod)
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
    [bevCelMap, szamadasiCellek],
  )

  const expenseCategories = useMemo<ExpenseCategory[]>(
    () =>
      Object.entries(kiaCelMap)
        .map(([id, kod]) => {
          const cel = szamadasiCellek.find((c) => c.id === kod)
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
    [kiaCelMap, szamadasiCellek],
  )

  const debtModeLabel = 'akkori évi járulék'

  return (
    <DesktopShell>
      <div>
        <FinanceHero
          congregationName={congregationName}
          currentYear={year}
          debtModeLabel={debtModeLabel}
          onAddEntry={congregationId && userId ? () => setCombinedOpen(true) : undefined}
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
              <p className="text-sm font-medium text-slate-600">Ez a fül hamarosan a webfelülettel megegyező lesz.</p>
              <p className="mt-1 text-xs text-slate-400">
                Jelenleg a bal oldali <strong>Pénzügy</strong> almenüben érhető el (Bevétel, Kiadás, Bank, Nyugta…).
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
          ) : activeTab === 'transactions' ? (
            <TransactionsTab
              incomeRecords={income}
              expenseRecords={expense}
              bevCelMap={bevCelMap}
              kiaCelMap={kiaCelMap}
              szamadasiCellek={szamadasiCellek}
              congregationName={congregationName}
              onRefresh={() => void load()}
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
            />
          ) : activeTab === 'debt' ? (
            <DebtTab debtRows={debtRows} yearlyFees={yearlyFees} currentYear={year} debtCalcMode="akkori" />
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
          bankAccounts={[]}
          currentYear={year}
          congregationId={congregationId}
          userId={userId}
        />
      )}
    </DesktopShell>
  )
}
