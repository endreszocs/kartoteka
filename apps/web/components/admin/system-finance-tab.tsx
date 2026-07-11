'use client'

/**
 * Admin → Rendszer pénzügyei fül.
 *
 * 2026-07-11 előfizetési rendszer: fülekre bontott felület a rendszergazdának:
 *   1. Áttekintés — KPI-k (havi bevétel/költség/profit/aktív előfizetők) + árfolyam-panel
 *   2. Előfizetések — a KÖZPONTI új felület: gyülekezetek aktív felhasználóval,
 *      státusz-vezérléssel (aktiválás/teszt/ingyenes/szüneteltetés), egyedi díj +
 *      felár, sáv-javaslat, gyors bevétel-rögzítés (SubscriptionManager)
 *   3. Könyvelés — bevétel (system_finance_income) + kiadás (system_finance_costs)
 *      egy helyen, egyenleg-összegzéssel (FinanceAccounting)
 *   4. Árazási sávok — tag-szám szerinti díjsávok (szerkeszthető)
 *   5. Tervezés — skálázási előrejelzés (25/50/100/200/500/1000 gyülekezet)
 *
 * Token-alapú színek, mobil-first (375px-en kártya-nézet), touch-target ≥ 44px.
 * Jogosultság: csak `admin` (rendszergazda/master) — a szerver akciók is ellenőrzik.
 */

import { useEffect, useState, useTransition } from 'react'
import {
  Banknote, TrendingUp, TrendingDown, Users, Building2, Plus, Info, BarChart3,
  LayoutDashboard, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import { AdminConfirmDialog } from './admin-confirm-dialog'
import { AdminTable, type AdminTableColumn } from './_shared/admin-table'
import { AdminEmptyState } from './_shared/admin-empty-state'
import { AdminSkeleton } from './_shared/admin-skeleton'
import { StatusBadge } from './_shared/status-badge'

import { FxRatePanel } from './finance/fx-rate-panel'
import { SubscriptionManager } from './finance/subscription-manager'
import { FinanceAccounting } from './finance/finance-accounting'
import {
  SELECT_CLASS, formatRon, PRICING_TIER_TYPE_LABELS, RowActions,
} from './finance/finance-shared'

import {
  deletePricingTier, getScalingForecast, getSystemFinanceSummary,
  getFxRates, listPricingTiers, upsertPricingTier,
  type PricingTierType, type ScalingScenario, type SystemFinanceSummary,
  type SystemPricingTier, type FxRates,
} from '@/app/(dashboard)/admin/system-finance-actions'

// ─────────────────────────────────────────────────────────────────────────
// Fülek
// ─────────────────────────────────────────────────────────────────────────
type FinanceTabValue = 'overview' | 'subscriptions' | 'accounting' | 'tiers' | 'forecast'

const FINANCE_TABS: { value: FinanceTabValue; label: string; icon: LucideIcon }[] = [
  { value: 'overview', label: 'Áttekintés', icon: LayoutDashboard },
  { value: 'subscriptions', label: 'Előfizetések', icon: Building2 },
  { value: 'accounting', label: 'Könyvelés', icon: Wallet },
  { value: 'tiers', label: 'Árazási sávok', icon: Users },
  { value: 'forecast', label: 'Tervezés', icon: BarChart3 },
]

// ─────────────────────────────────────────────────────────────────────────
export function SystemFinanceTab() {
  const [tab, setTab] = useState<FinanceTabValue>('overview')

  // Az Áttekintés + Árazási sávok + Tervezés adatai a konténerben (közösek);
  // az Előfizetések és a Könyvelés a saját adatait tölti a fül aktiválásakor.
  const [summary, setSummary] = useState<SystemFinanceSummary | null>(null)
  const [tiers, setTiers] = useState<SystemPricingTier[]>([])
  const [forecast, setForecast] = useState<ScalingScenario[]>([])
  const [fx, setFx] = useState<FxRates | null>(null)
  const [loading, setLoading] = useState(true)

  const [tierDialogOpen, setTierDialogOpen] = useState(false)
  const [tierEditing, setTierEditing] = useState<SystemPricingTier | null>(null)
  const [deleteTier, setDeleteTier] = useState<{ id: number; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function refreshShared() {
    const [summaryRes, tiersRes, forecastRes, fxRes] = await Promise.all([
      getSystemFinanceSummary(),
      listPricingTiers(),
      getScalingForecast(),
      getFxRates(),
    ])
    if (summaryRes.error) toast.error(`Összegző: ${summaryRes.error}`)
    else if (summaryRes.data) setSummary(summaryRes.data)
    if (tiersRes.error) toast.error(`Árazási sávok: ${tiersRes.error}`)
    else if (tiersRes.data) setTiers(tiersRes.data)
    if (forecastRes.error) toast.error(`Előrejelzés: ${forecastRes.error}`)
    else if (forecastRes.data) setForecast(forecastRes.data)
    if (fxRes.data) setFx(fxRes.data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void refreshShared() })
    return () => { cancelled = true }
  }, [])

  async function handleDeleteTier() {
    if (!deleteTier) return
    setDeleteBusy(true)
    const res = await deletePricingTier(deleteTier.id)
    setDeleteBusy(false)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Törölve.')
      setDeleteTier(null)
      void refreshShared()
    }
  }

  if (loading) {
    return (
      <div className="card-raised p-5">
        <AdminSkeleton rows={6} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <FinanceTabNav tabs={FINANCE_TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-6">
          {summary && <KpiPanel summary={summary} />}
          <FxRatePanel rates={fx} onChanged={() => void refreshShared()} />
        </div>
      )}

      {tab === 'subscriptions' && (
        <SubscriptionManager tiers={tiers} onChanged={() => void refreshShared()} />
      )}

      {tab === 'accounting' && (
        <FinanceAccounting onChanged={() => void refreshShared()} />
      )}

      {tab === 'tiers' && (
        <section className="card-raised space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4" />
              </span>
              <h3 className="font-heading text-lg text-foreground">Árazási sávok — tag-szám szerint</h3>
            </div>
            <Button onClick={() => { setTierEditing(null); setTierDialogOpen(true) }} className="gap-1.5 rounded-xl">
              <Plus className="size-4" />
              Új sáv
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <Info className="mr-1 inline size-3.5 text-primary" />
            Alapelv: <strong>képesség szerinti elosztás</strong> — kis gyülekezet kevesebbet, nagy gyülekezet többet fizet.
          </p>
          <TierTable
            tiers={tiers}
            onEdit={(t) => { setTierEditing(t); setTierDialogOpen(true) }}
            onDelete={(t) => setDeleteTier({ id: t.id, name: t.nev })}
          />
        </section>
      )}

      {tab === 'forecast' && (
        <section className="card-raised space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="size-4" />
            </span>
            <h3 className="font-heading text-lg text-foreground">Skálázási előrejelzés</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            <Info className="mr-1 inline size-3.5 text-primary" />
            <strong>Becsült, tájékoztató értékek.</strong> A számítás az aktív árazási sávok átlagdíjával +
            aktív költségtételekkel (becsült skálázódási felárral) dolgozik — a tényleges összegek eltérhetnek.
          </p>
          <ForecastTable forecast={forecast} />
        </section>
      )}

      {/* ─── DIALÓGUSOK ─── */}
      {tierDialogOpen && (
        <TierEditDialog
          editing={tierEditing}
          onOpenChange={setTierDialogOpen}
          onSaved={() => { setTierDialogOpen(false); void refreshShared() }}
        />
      )}

      <AdminConfirmDialog
        open={!!deleteTier}
        onOpenChange={(o) => !o && setDeleteTier(null)}
        title="Törlés megerősítése"
        tone="danger"
        description={
          deleteTier ? (
            <>Biztosan törlöd a(z) <strong>{deleteTier.name}</strong> árazási sávot? A művelet nem vonható vissza.</>
          ) : null
        }
        confirmLabel="Törlés"
        loading={deleteBusy}
        onConfirm={() => void handleDeleteTier()}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Fül-navigáció (token-alapú, mobilon vízszintesen görgethető)
// ─────────────────────────────────────────────────────────────────────────
function FinanceTabNav({
  tabs,
  active,
  onChange,
}: {
  tabs: { value: FinanceTabValue; label: string; icon: LucideIcon }[]
  active: FinanceTabValue
  onChange: (v: FinanceTabValue) => void
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        role="tablist"
        aria-label="Pénzügyi nézetek"
        className="flex w-max gap-1.5 rounded-2xl bg-muted/60 p-1 ring-1 ring-border md:w-auto"
      >
        {tabs.map((t) => {
          const isActive = active === t.value
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.value)}
              className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
              }`}
            >
              <t.icon className={`size-4 ${isActive ? 'text-primary' : ''}`} />
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// KPI Panel
// ─────────────────────────────────────────────────────────────────────────
function KpiPanel({ summary }: { summary: SystemFinanceSummary }) {
  const profitPositive = summary.monthlyProfitRon >= 0
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      <KpiCard
        label="Havi bevétel"
        value={`${formatRon(summary.monthlyRevenueRon)} RON`}
        sub={`Éves: ${formatRon(summary.annualRevenueRon)} RON`}
        tone="success"
        icon={<TrendingUp className="size-4" />}
      />
      <KpiCard
        label="Havi költség"
        value={`${formatRon(summary.monthlyCostRon)} RON`}
        sub={`Éves: ${formatRon(summary.annualCostRon)} RON`}
        tone="danger"
        icon={<TrendingDown className="size-4" />}
      />
      <KpiCard
        label="Havi profit"
        value={`${formatRon(summary.monthlyProfitRon)} RON`}
        sub={`Éves: ${formatRon(summary.annualProfitRon)} RON`}
        tone={profitPositive ? 'success' : 'danger'}
        icon={<Banknote className="size-4" />}
      />
      <KpiCard
        label="Aktív előfizetők"
        value={`${summary.activeSubscriptions} / ${summary.totalCongregations}`}
        sub={`${summary.congregationsWithoutSubscription} előfizetés nélkül`}
        tone="neutral"
        icon={<Users className="size-4" />}
      />
    </div>
  )
}

const KPI_TONE_CLASSES = {
  success:
    'bg-emerald-50 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/25',
  danger:
    'bg-rose-50 text-rose-800 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-400/25',
  neutral: 'bg-primary/10 text-foreground ring-border',
} as const

function KpiCard({ label, value, sub, tone, icon }: {
  label: string; value: string; sub?: string
  tone: keyof typeof KPI_TONE_CLASSES; icon: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl px-3 py-3 ring-1 ring-inset sm:px-4 ${KPI_TONE_CLASSES[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.14em] opacity-75 sm:text-[11px] sm:tracking-[0.18em]">
          {label}
        </p>
        <span aria-hidden>{icon}</span>
      </div>
      <p className="mt-1 break-words font-heading text-base font-semibold tabular-nums sm:text-xl" title={value}>
        {value}
      </p>
      {sub && <p className="mt-1 break-words text-[11px] tabular-nums opacity-75">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Árazási sávok táblázat
// ─────────────────────────────────────────────────────────────────────────
const TIER_COLUMNS: AdminTableColumn[] = [
  { key: 'nev', label: 'Név' },
  { key: 'tipus', label: 'Típus', hideBelow: 'sm' },
  { key: 'tagok', label: 'Taglétszám', align: 'right', className: 'tabular-nums' },
  { key: 'havi', label: 'Havi RON', align: 'right', className: 'tabular-nums' },
  { key: 'eves', label: 'Éves RON', align: 'right', hideBelow: 'md', className: 'tabular-nums' },
  { key: 'aktiv', label: 'Státusz', align: 'center', hideBelow: 'sm' },
  { key: 'actions', label: <span className="sr-only">Műveletek</span>, align: 'right' },
]

function TierTable({
  tiers,
  onEdit,
  onDelete,
}: {
  tiers: SystemPricingTier[]
  onEdit: (t: SystemPricingTier) => void
  onDelete: (t: SystemPricingTier) => void
}) {
  return (
    <AdminTable
      columns={TIER_COLUMNS}
      rows={tiers}
      rowKey={(t) => String(t.id)}
      empty={
        <AdminEmptyState
          icon={Users}
          title="Nincs árazási sáv"
          hint="Az „Új sáv” gombbal hozhatod létre a tag-szám szerinti díjsávokat."
        />
      }
      renderCell={(t, key) => {
        switch (key) {
          case 'nev':
            return (
              <div className={t.aktiv ? '' : 'opacity-60'}>
                <p className="font-medium text-foreground">{t.nev}</p>
                {t.megjegyzes && <p className="max-w-[240px] truncate text-[11px] text-muted-foreground">{t.megjegyzes}</p>}
              </div>
            )
          case 'tipus':
            return <StatusBadge intent="info">{PRICING_TIER_TYPE_LABELS[t.tipus]}</StatusBadge>
          case 'tagok':
            return <span className="text-muted-foreground">{t.min_tagok}&nbsp;–&nbsp;{t.max_tagok ?? '∞'}</span>
          case 'havi':
            return <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatRon(Number(t.havi_dij_ron))}</span>
          case 'eves':
            return <span className="text-emerald-700 dark:text-emerald-300">{formatRon(Number(t.eves_dij_ron))}</span>
          case 'aktiv':
            return <StatusBadge intent={t.aktiv ? 'success' : 'neutral'}>{t.aktiv ? 'Aktív' : 'Inaktív'}</StatusBadge>
          case 'actions':
            return <RowActions name={t.nev} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
          default:
            return null
        }
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Forecast táblázat
// ─────────────────────────────────────────────────────────────────────────
const FORECAST_COLUMNS: AdminTableColumn[] = [
  { key: 'szam', label: 'Gyülekezet', align: 'right', className: 'tabular-nums' },
  { key: 'bevetel', label: 'Havi bevétel', align: 'right', className: 'tabular-nums' },
  { key: 'koltseg', label: 'Havi költség', align: 'right', className: 'tabular-nums' },
  { key: 'profit', label: 'Havi profit', align: 'right', className: 'tabular-nums' },
  { key: 'eves_profit', label: 'Éves profit', align: 'right', hideBelow: 'md', className: 'tabular-nums' },
  { key: 'margin', label: 'Margin %', align: 'right' },
]

function ForecastTable({ forecast }: { forecast: ScalingScenario[] }) {
  return (
    <AdminTable
      columns={FORECAST_COLUMNS}
      rows={forecast}
      rowKey={(f) => String(f.gyulekezet_szam)}
      minWidthClass="min-w-[520px]"
      empty={
        <AdminEmptyState
          icon={BarChart3}
          title="Nincs előrejelzés"
          hint="Az előrejelzéshez legalább egy aktív árazási sáv és költségtétel szükséges."
        />
      }
      renderCell={(f, key) => {
        switch (key) {
          case 'szam':
            return <span className="font-semibold text-foreground">{f.gyulekezet_szam}</span>
          case 'bevetel':
            return <span className="text-emerald-700 dark:text-emerald-300">{formatRon(f.havi_bevetel_ron)}</span>
          case 'koltseg':
            return <span className="text-rose-700 dark:text-rose-300">{formatRon(f.havi_koltseg_ron)}</span>
          case 'profit':
            return <ProfitValue value={f.havi_profit_ron} />
          case 'eves_profit':
            return <ProfitValue value={f.eves_profit_ron} />
          case 'margin':
            return (
              <StatusBadge intent={f.profit_margin >= 50 ? 'success' : f.profit_margin >= 0 ? 'warning' : 'danger'}>
                {f.profit_margin.toFixed(1)}%
              </StatusBadge>
            )
          default:
            return null
        }
      }}
    />
  )
}

function ProfitValue({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span className={`font-semibold ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
      {positive ? '+' : ''}{formatRon(value)}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Árazási sáv szerkesztő dialógus
// ─────────────────────────────────────────────────────────────────────────
function TierEditDialog({
  editing,
  onOpenChange,
  onSaved,
}: {
  editing: SystemPricingTier | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    nev: editing?.nev || '',
    tipus: (editing?.tipus || 'gyulekezet') as PricingTierType,
    min_tagok: editing?.min_tagok ?? 0,
    max_tagok: (editing?.max_tagok ?? undefined) as number | undefined,
    havi_dij_ron: editing?.havi_dij_ron ?? 0,
    eves_dij_ron: editing?.eves_dij_ron ?? 0,
    aktiv: editing?.aktiv ?? true,
    sorszam: editing?.sorszam ?? 0,
    megjegyzes: editing?.megjegyzes ?? '',
  })
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!form.nev.trim()) { toast.error('Adj meg nevet.'); return }
    startTransition(async () => {
      const res = await upsertPricingTier({
        id: editing?.id,
        nev: form.nev.trim(),
        tipus: form.tipus,
        min_tagok: Number(form.min_tagok),
        max_tagok: form.max_tagok ? Number(form.max_tagok) : null,
        havi_dij_ron: Number(form.havi_dij_ron),
        eves_dij_ron: Number(form.eves_dij_ron),
        aktiv: form.aktiv,
        sorszam: Number(form.sorszam),
        megjegyzes: form.megjegyzes || null,
      })
      if (res.error) toast.error(res.error)
      else {
        toast.success(editing ? 'Frissítve.' : 'Hozzáadva.')
        onSaved()
      }
    })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-foreground">
            {editing ? 'Árazási sáv szerkesztése' : 'Új árazási sáv'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <ModalField label="Név">
            <Input value={form.nev} onChange={(e) => setForm({ ...form, nev: e.target.value })} />
          </ModalField>
          <ModalField label="Típus">
            <select
              value={form.tipus}
              onChange={(e) => setForm({ ...form, tipus: e.target.value as PricingTierType })}
              className={`${SELECT_CLASS} w-full`}
            >
              {(Object.keys(PRICING_TIER_TYPE_LABELS) as PricingTierType[]).map((k) => (
                <option key={k} value={k}>{PRICING_TIER_TYPE_LABELS[k]}</option>
              ))}
            </select>
          </ModalField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModalField label="Min. tagok">
              <Input type="number" value={form.min_tagok} onChange={(e) => setForm({ ...form, min_tagok: Number(e.target.value) })} />
            </ModalField>
            <ModalField label="Max. tagok (üres = ∞)">
              <Input
                type="number"
                value={form.max_tagok ?? ''}
                onChange={(e) => setForm({ ...form, max_tagok: e.target.value ? Number(e.target.value) : undefined })}
              />
            </ModalField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModalField label="Havi díj (RON/hó)">
              <Input type="number" step="0.01" value={form.havi_dij_ron} onChange={(e) => setForm({ ...form, havi_dij_ron: Number(e.target.value) })} />
            </ModalField>
            <ModalField label="Éves díj (RON/év)">
              <Input type="number" step="0.01" value={form.eves_dij_ron} onChange={(e) => setForm({ ...form, eves_dij_ron: Number(e.target.value) })} />
            </ModalField>
          </div>
          <ModalField label="Megjegyzés">
            <Input value={form.megjegyzes || ''} onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })} />
          </ModalField>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.aktiv} onChange={(e) => setForm({ ...form, aktiv: e.target.checked })} />
              Aktív
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sorszám:</span>
              <Input type="number" className="h-9 w-20" value={form.sorszam} onChange={(e) => setForm({ ...form, sorszam: Number(e.target.value) })} />
            </label>
          </div>
        </div>
        <div className="-mx-6 flex justify-end gap-2 border-t border-border px-6 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Mégse</Button>
          <Button onClick={handleSave} disabled={isPending} className="rounded-xl">
            {isPending ? 'Mentés…' : 'Mentés'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
