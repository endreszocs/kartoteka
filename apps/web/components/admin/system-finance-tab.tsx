'use client'

/**
 * Admin → Rendszer pénzügyei fül.
 *
 * Ez a nézet a rendszer pénzügyi áttekintését mutatja a rendszergazdának (Endre):
 *   1. KPI panel — havi bevétel, költség, profit, aktív előfizetések
 *   2. Havi költségtételek táblázat (szerkeszthető) — Supabase, Railway, Email-szolgáltató, AI szerver, stb.
 *   3. Árazási sávok táblázat (szerkeszthető) — tag-szám szerint, Endre alapelve szerint
 *   4. Gyülekezet előfizetések (szerkeszthető, kereshető) — ki fizet mennyit
 *   5. Skálázási előrejelzés — 25/50/100/200/500/1000 gyülekezet szcenáriók
 *
 * 2026-07-11 admin-redesign: token-alapú színek, AdminTable (mobil kártya-nézettel),
 * AdminConfirmDialog a natív confirm() helyett, csendes háttér-frissítés mentés után.
 *
 * Jogosultság: csak `admin` (rendszergazda/master) láthatja — a szerver akciók is ellenőrzik.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Banknote, TrendingUp, TrendingDown, Users, Building2, Plus, Edit2,
  Trash2, Info, BarChart3, Search,
} from 'lucide-react'
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
import {
  deletePricingTier, deleteSubscription, deleteSystemCost,
  getScalingForecast, getSystemFinanceSummary,
  listCongregationsForSubscription, listCongregationSubscriptions,
  listPricingTiers, listSystemCosts,
  upsertCongregationSubscription, upsertPricingTier, upsertSystemCost,
  type CongregationSubscription, type CostCategory, type PricingTierType,
  type ScalingScenario, type SubscriptionType, type SystemFinanceCost,
  type SystemFinanceSummary, type SystemPricingTier,
} from '@/app/(dashboard)/admin/system-finance-actions'

const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  supabase: 'Supabase (DB + Auth + Storage)',
  railway: 'Railway (EU Amsterdam, GDPR)',
  vercel: 'Vercel (elavult)',
  email_service: 'Email szolgáltató (Brevo/Mailjet)',
  storage: 'Tárhely (Cloudflare R2)',
  ai_gpu: 'AI GPU szerver',
  ai_proxy: 'AI proxy',
  ai_monitoring: 'AI monitoring',
  mobile: 'Mobil (Apple/Google)',
  monitoring: 'Monitoring (Sentry)',
  domain: 'Domain',
  egyszeri: 'Egyszeri költség',
  egyeb: 'Egyéb',
}

const PRICING_TIER_TYPE_LABELS: Record<PricingTierType, string> = {
  gyulekezet: 'Gyülekezeti',
  egyhazmegye: 'Egyházmegyei',
  teszt: 'Teszt (ingyen)',
  kedvezmeny: 'Kedvezményes',
}

const SUBSCRIPTION_TYPE_LABELS: Record<SubscriptionType, string> = {
  havi: 'Havi',
  eves: 'Éves',
  teszt: 'Teszt',
  kedvezmeny: 'Kedvezményes',
  ingyenes: 'Ingyenes',
}

function formatRon(v: number): string {
  return v.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateHu(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('hu-HU')
}

/**
 * A dij_ron mező egysége az előfizetés-típustól függ (system-finance-actions:
 * 'havi' → RON/hó, 'eves' → RON/év) — a felületen mindenhol jelezzük,
 * különben 12x-es félreárazás lehet belőle.
 */
function dijUnit(tipus: SubscriptionType): string {
  if (tipus === 'havi') return 'RON/hó'
  if (tipus === 'eves') return 'RON/év'
  return 'RON'
}

/** Natív select-ek egységes, token-alapú stílusa a dialógusokban/szűrőkben (szélesség nélkül). */
const SELECT_CLASS =
  'h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

type DeleteTarget = { kind: 'cost' | 'tier' | 'sub'; id: number; name: string }

const DELETE_KIND_LABELS: Record<DeleteTarget['kind'], string> = {
  cost: 'költségtételt',
  tier: 'árazási sávot',
  sub: 'előfizetést',
}

// ─────────────────────────────────────────────────────────────────────────
export function SystemFinanceTab() {
  const [summary, setSummary] = useState<SystemFinanceSummary | null>(null)
  const [costs, setCosts] = useState<SystemFinanceCost[]>([])
  const [tiers, setTiers] = useState<SystemPricingTier[]>([])
  const [subs, setSubs] = useState<CongregationSubscription[]>([])
  const [forecast, setForecast] = useState<ScalingScenario[]>([])
  // Csak az ELSŐ betöltéskor igaz — mentés/törlés utáni frissítés csendben,
  // a tartalom lecserélése nélkül fut (nincs teljes-oldalas villogás).
  const [loading, setLoading] = useState(true)

  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [costEditing, setCostEditing] = useState<SystemFinanceCost | null>(null)
  const [tierDialogOpen, setTierDialogOpen] = useState(false)
  const [tierEditing, setTierEditing] = useState<SystemPricingTier | null>(null)
  const [subDialogOpen, setSubDialogOpen] = useState(false)
  const [subEditing, setSubEditing] = useState<CongregationSubscription | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function refreshAll() {
    const [summaryRes, costsRes, tiersRes, subsRes, forecastRes] = await Promise.all([
      getSystemFinanceSummary(),
      listSystemCosts(),
      listPricingTiers(),
      listCongregationSubscriptions(),
      getScalingForecast(),
    ])
    if (summaryRes.error) toast.error(`Összegző: ${summaryRes.error}`)
    else if (summaryRes.data) setSummary(summaryRes.data)
    if (costsRes.error) toast.error(`Költségek: ${costsRes.error}`)
    else if (costsRes.data) setCosts(costsRes.data)
    if (tiersRes.error) toast.error(`Árazási sávok: ${tiersRes.error}`)
    else if (tiersRes.data) setTiers(tiersRes.data)
    if (subsRes.error) toast.error(`Előfizetések: ${subsRes.error}`)
    else if (subsRes.data) setSubs(subsRes.data)
    if (forecastRes.error) toast.error(`Előrejelzés: ${forecastRes.error}`)
    else if (forecastRes.data) setForecast(forecastRes.data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refreshAll()
    })
    return () => { cancelled = true }
  }, [])

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    const res =
      deleteTarget.kind === 'cost'
        ? await deleteSystemCost(deleteTarget.id)
        : deleteTarget.kind === 'tier'
          ? await deletePricingTier(deleteTarget.id)
          : await deleteSubscription(deleteTarget.id)
    setDeleteBusy(false)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Törölve.')
      setDeleteTarget(null)
      void refreshAll()
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
    <div className="space-y-6">
      {/* ─── 1. KPI PANEL ─── */}
      {summary && <KpiPanel summary={summary} />}

      {/* ─── 2. HAVI KÖLTSÉGTÉTELEK ─── */}
      <section className="card-raised space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Banknote className="size-4" />
            </span>
            <h3 className="font-heading text-lg text-foreground">Havi rendszer-költségek</h3>
          </div>
          <Button
            onClick={() => {
              setCostEditing(null)
              setCostDialogOpen(true)
            }}
            className="gap-1.5 rounded-xl"
          >
            <Plus className="size-4" />
            Új tétel
          </Button>
        </div>
        <CostTable
          costs={costs}
          onEdit={(c) => {
            setCostEditing(c)
            setCostDialogOpen(true)
          }}
          onDelete={(c) => setDeleteTarget({ kind: 'cost', id: c.id, name: c.nev })}
        />
      </section>

      {/* ─── 3. ÁRAZÁSI SÁVOK ─── */}
      <section className="card-raised space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
            <h3 className="font-heading text-lg text-foreground">Árazási sávok — tag-szám szerint</h3>
          </div>
          <Button
            onClick={() => {
              setTierEditing(null)
              setTierDialogOpen(true)
            }}
            className="gap-1.5 rounded-xl"
          >
            <Plus className="size-4" />
            Új sáv
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          <Info className="mr-1 inline size-3.5 text-primary" />
          Endre alapelve: <strong>képesség szerinti elosztás</strong> — kis gyülekezet kevesebbet, nagy gyülekezet többet fizet.
        </p>
        <TierTable
          tiers={tiers}
          onEdit={(t) => {
            setTierEditing(t)
            setTierDialogOpen(true)
          }}
          onDelete={(t) => setDeleteTarget({ kind: 'tier', id: t.id, name: t.nev })}
        />
      </section>

      {/* ─── 4. GYÜLEKEZETI ELŐFIZETÉSEK ─── */}
      <section className="card-raised space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-4" />
            </span>
            <h3 className="font-heading text-lg text-foreground">Gyülekezeti előfizetések</h3>
          </div>
          <Button
            onClick={() => {
              setSubEditing(null)
              setSubDialogOpen(true)
            }}
            className="gap-1.5 rounded-xl"
          >
            <Plus className="size-4" />
            Új előfizetés
          </Button>
        </div>
        <SubscriptionTable
          subs={subs}
          onEdit={(s) => {
            setSubEditing(s)
            setSubDialogOpen(true)
          }}
          onDelete={(s) =>
            setDeleteTarget({
              kind: 'sub',
              id: s.id,
              name: s.congregation_name || s.congregation_id.slice(0, 8),
            })
          }
        />
      </section>

      {/* ─── 5. SKÁLÁZÁSI ELŐREJELZÉS ─── */}
      <section className="card-raised space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="size-4" />
          </span>
          <h3 className="font-heading text-lg text-foreground">Skálázási előrejelzés</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          <Info className="mr-1 inline size-3.5 text-primary" />
          <strong>Becsült, tájékoztató értékek.</strong> A számítás az aktív árazási sávok
          átlagdíjával + aktív költségtételekkel (becsült skálázódási felárral) dolgozik —
          a tényleges összegek a valós előfizetésektől és szolgáltatói díjaktól függően eltérhetnek.
        </p>
        <ForecastTable forecast={forecast} />
      </section>

      {/* ─── DIALÓGUSOK ─── */}
      {costDialogOpen && (
        <CostEditDialog
          open={costDialogOpen}
          onOpenChange={setCostDialogOpen}
          editing={costEditing}
          onSaved={() => {
            setCostDialogOpen(false)
            void refreshAll()
          }}
        />
      )}
      {tierDialogOpen && (
        <TierEditDialog
          open={tierDialogOpen}
          onOpenChange={setTierDialogOpen}
          editing={tierEditing}
          onSaved={() => {
            setTierDialogOpen(false)
            void refreshAll()
          }}
        />
      )}
      {subDialogOpen && (
        <SubscriptionEditDialog
          open={subDialogOpen}
          onOpenChange={setSubDialogOpen}
          editing={subEditing}
          tiers={tiers}
          onSaved={() => {
            setSubDialogOpen(false)
            void refreshAll()
          }}
        />
      )}

      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Törlés megerősítése"
        tone="danger"
        description={
          deleteTarget ? (
            <>
              Biztosan törlöd a(z) <strong>{deleteTarget.name}</strong>{' '}
              {DELETE_KIND_LABELS[deleteTarget.kind]}? A művelet nem vonható vissza.
            </>
          ) : null
        }
        confirmLabel="Törlés"
        loading={deleteBusy}
        onConfirm={() => void handleDeleteConfirmed()}
      />
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
      {/* break-words (truncate helyett): nagy összegnél a szám vége nem vágódik le */}
      <p className="mt-1 break-words font-heading text-base font-semibold tabular-nums sm:text-xl" title={value}>
        {value}
      </p>
      {sub && <p className="mt-1 break-words text-[11px] tabular-nums opacity-75">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Költségtételek táblázat
// ─────────────────────────────────────────────────────────────────────────
const COST_COLUMNS: AdminTableColumn[] = [
  { key: 'kategoria', label: 'Kategória', hideBelow: 'lg' },
  { key: 'nev', label: 'Megnevezés' },
  { key: 'havi_usd', label: 'Havi USD', align: 'right', className: 'tabular-nums' },
  { key: 'arfolyam', label: 'Árfolyam', align: 'right', hideBelow: 'lg', className: 'tabular-nums' },
  { key: 'havi_ron', label: 'Havi RON', align: 'right', className: 'tabular-nums' },
  { key: 'aktiv', label: 'Státusz', align: 'center' },
  { key: 'actions', label: <span className="sr-only">Műveletek</span>, align: 'right' },
]

function costRonValue(c: SystemFinanceCost): number {
  return Number(c.havi_ron) || Number(c.havi_usd) * Number(c.arfolyam_usd)
}

function CostTable({
  costs,
  onEdit,
  onDelete,
}: {
  costs: SystemFinanceCost[]
  onEdit: (c: SystemFinanceCost) => void
  onDelete: (c: SystemFinanceCost) => void
}) {
  const active = costs.filter((c) => c.aktiv)
  const totalUsd = active.reduce((s, c) => s + Number(c.havi_usd), 0)
  const totalRon = active.reduce((s, c) => s + costRonValue(c), 0)

  return (
    <div className="space-y-3">
      <AdminTable
        columns={COST_COLUMNS}
        rows={costs}
        rowKey={(c) => String(c.id)}
        minWidthClass="min-w-[640px]"
        empty={
          <AdminEmptyState
            icon={Banknote}
            title="Nincs költségtétel"
            hint="Az „Új tétel” gombbal rögzítheted a rendszer havi költségeit (Supabase, Railway, email, stb.)."
          />
        }
        renderCell={(c, key) => {
          switch (key) {
            case 'kategoria':
              return <StatusBadge intent="neutral">{COST_CATEGORY_LABELS[c.kategoria]}</StatusBadge>
            case 'nev':
              return (
                <div className={c.aktiv ? '' : 'opacity-60'}>
                  <p className="font-medium text-foreground">{c.nev}</p>
                  {c.megjegyzes && (
                    <p className="max-w-[320px] truncate text-[11px] text-muted-foreground">{c.megjegyzes}</p>
                  )}
                </div>
              )
            case 'havi_usd':
              return <span className="text-muted-foreground">{formatRon(Number(c.havi_usd))} USD</span>
            case 'arfolyam':
              return <span className="text-muted-foreground">{Number(c.arfolyam_usd).toFixed(2)}</span>
            case 'havi_ron':
              return (
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  {formatRon(costRonValue(c))}
                </span>
              )
            case 'aktiv':
              return (
                <StatusBadge intent={c.aktiv ? 'success' : 'neutral'}>
                  {c.aktiv ? 'Aktív' : 'Inaktív'}
                </StatusBadge>
              )
            case 'actions':
              return <RowActions name={c.nev} onEdit={() => onEdit(c)} onDelete={() => onDelete(c)} />
            default:
              return null
          }
        }}
        renderMobileCard={(c) => (
          <div className={`rounded-xl border border-border bg-card p-3 ${c.aktiv ? '' : 'opacity-70'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{c.nev}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge intent="neutral">{COST_CATEGORY_LABELS[c.kategoria]}</StatusBadge>
                  <StatusBadge intent={c.aktiv ? 'success' : 'neutral'}>
                    {c.aktiv ? 'Aktív' : 'Inaktív'}
                  </StatusBadge>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatRon(costRonValue(c))} RON
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {formatRon(Number(c.havi_usd))} USD
                </p>
              </div>
            </div>
            {c.megjegyzes && <p className="mt-1.5 text-xs text-muted-foreground">{c.megjegyzes}</p>}
            <MobileCardActions name={c.nev} onEdit={() => onEdit(c)} onDelete={() => onDelete(c)} />
          </div>
        )}
      />
      {costs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-4 py-2.5 ring-1 ring-border">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Összesen (aktív)
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatRon(totalRon)} RON
            <span className="ml-2 font-normal text-muted-foreground">({formatRon(totalUsd)} USD)</span>
          </span>
        </div>
      )}
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
                {t.megjegyzes && (
                  <p className="max-w-[240px] truncate text-[11px] text-muted-foreground">{t.megjegyzes}</p>
                )}
              </div>
            )
          case 'tipus':
            return <StatusBadge intent="info">{PRICING_TIER_TYPE_LABELS[t.tipus]}</StatusBadge>
          case 'tagok':
            return (
              <span className="text-muted-foreground">
                {t.min_tagok}&nbsp;–&nbsp;{t.max_tagok ?? '∞'}
              </span>
            )
          case 'havi':
            return (
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {formatRon(Number(t.havi_dij_ron))}
              </span>
            )
          case 'eves':
            return (
              <span className="text-emerald-700 dark:text-emerald-300">
                {formatRon(Number(t.eves_dij_ron))}
              </span>
            )
          case 'aktiv':
            return (
              <StatusBadge intent={t.aktiv ? 'success' : 'neutral'}>
                {t.aktiv ? 'Aktív' : 'Inaktív'}
              </StatusBadge>
            )
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
// Subscription táblázat (kereshető + típus-szűrő)
// ─────────────────────────────────────────────────────────────────────────
const SUB_COLUMNS: AdminTableColumn[] = [
  { key: 'gyulekezet', label: 'Gyülekezet' },
  { key: 'tagok', label: 'Tagok', align: 'right', hideBelow: 'lg', className: 'tabular-nums' },
  { key: 'sav', label: 'Árazási sáv', hideBelow: 'md' },
  { key: 'tipus', label: 'Típus', hideBelow: 'sm' },
  { key: 'dij', label: 'Díj', align: 'right', className: 'tabular-nums' },
  { key: 'kezdet', label: 'Kezdet', hideBelow: 'lg' },
  { key: 'aktiv', label: 'Státusz', align: 'center', hideBelow: 'sm' },
  { key: 'actions', label: <span className="sr-only">Műveletek</span>, align: 'right' },
]

/** A Díj cella: érték + egység (RON/hó vagy RON/év) — a dij_ron a típus szerint értelmeződik. */
function subDijLabel(s: CongregationSubscription): string {
  if (s.dij_ron != null) return `${formatRon(Number(s.dij_ron))} ${dijUnit(s.tipus)}`
  return s.pricing_tier_nev ? 'sáv szerint' : '—'
}

function SubscriptionTable({
  subs,
  onEdit,
  onDelete,
}: {
  subs: CongregationSubscription[]
  onEdit: (s: CongregationSubscription) => void
  onDelete: (s: CongregationSubscription) => void
}) {
  const [query, setQuery] = useState('')
  const [tipusFilter, setTipusFilter] = useState<'' | SubscriptionType>('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return subs.filter((s) => {
      if (tipusFilter && s.tipus !== tipusFilter) return false
      if (!needle) return true
      const hay = `${s.congregation_name ?? ''} ${s.pricing_tier_nev ?? ''} ${s.megjegyzes ?? ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [subs, query, tipusFilter])

  const isFiltering = query.trim() !== '' || tipusFilter !== ''

  return (
    <div className="space-y-3">
      {subs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Keresés gyülekezet szerint…"
              className="h-10 pl-9"
              aria-label="Keresés az előfizetések között"
            />
          </div>
          <select
            value={tipusFilter}
            onChange={(e) => setTipusFilter(e.target.value as '' | SubscriptionType)}
            className={`${SELECT_CLASS} w-auto min-w-36 flex-none`}
            aria-label="Szűrés előfizetés-típus szerint"
          >
            <option value="">Minden típus</option>
            {(Object.keys(SUBSCRIPTION_TYPE_LABELS) as SubscriptionType[]).map((k) => (
              <option key={k} value={k}>{SUBSCRIPTION_TYPE_LABELS[k]}</option>
            ))}
          </select>
        </div>
      )}
      <AdminTable
        columns={SUB_COLUMNS}
        rows={filtered}
        rowKey={(s) => String(s.id)}
        minWidthClass="min-w-[560px]"
        empty={
          isFiltering ? (
            <AdminEmptyState
              icon={Search}
              title="Nincs találat"
              hint="Módosítsd a keresést vagy a típus-szűrőt."
            />
          ) : (
            <AdminEmptyState
              icon={Building2}
              title="Nincs aktív előfizetés"
              hint="Az „Új előfizetés” gombbal rögzítheted, melyik gyülekezet milyen díjat fizet."
            />
          )
        }
        renderCell={(s, key) => {
          switch (key) {
            case 'gyulekezet':
              return (
                <div className={s.aktiv ? '' : 'opacity-60'}>
                  <p className="font-medium text-foreground">
                    {s.congregation_name || s.congregation_id.slice(0, 8)}
                  </p>
                  {s.megjegyzes && (
                    <p className="max-w-[200px] truncate text-[11px] text-muted-foreground">{s.megjegyzes}</p>
                  )}
                </div>
              )
            case 'tagok':
              return <span className="text-muted-foreground">{s.congregation_tag_szam ?? '?'}</span>
            case 'sav':
              return s.pricing_tier_nev ? (
                <StatusBadge intent="neutral">{s.pricing_tier_nev}</StatusBadge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            case 'tipus':
              return <StatusBadge intent="info">{SUBSCRIPTION_TYPE_LABELS[s.tipus]}</StatusBadge>
            case 'dij':
              return <span className="font-medium">{subDijLabel(s)}</span>
            case 'kezdet':
              return <span className="text-muted-foreground">{formatDateHu(s.kezdet)}</span>
            case 'aktiv':
              return (
                <StatusBadge intent={s.aktiv ? 'success' : 'neutral'}>
                  {s.aktiv ? 'Aktív' : 'Inaktív'}
                </StatusBadge>
              )
            case 'actions':
              return (
                <RowActions
                  name={s.congregation_name || 'előfizetés'}
                  onEdit={() => onEdit(s)}
                  onDelete={() => onDelete(s)}
                />
              )
            default:
              return null
          }
        }}
        renderMobileCard={(s) => (
          <div className={`rounded-xl border border-border bg-card p-3 ${s.aktiv ? '' : 'opacity-70'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {s.congregation_name || s.congregation_id.slice(0, 8)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {s.congregation_tag_szam ?? '?'} tag · kezdete: {formatDateHu(s.kezdet)}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                {subDijLabel(s)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge intent="info">{SUBSCRIPTION_TYPE_LABELS[s.tipus]}</StatusBadge>
              {s.pricing_tier_nev && <StatusBadge intent="neutral">{s.pricing_tier_nev}</StatusBadge>}
              <StatusBadge intent={s.aktiv ? 'success' : 'neutral'}>
                {s.aktiv ? 'Aktív' : 'Inaktív'}
              </StatusBadge>
            </div>
            {s.megjegyzes && <p className="mt-1.5 text-xs text-muted-foreground">{s.megjegyzes}</p>}
            <MobileCardActions
              name={s.congregation_name || 'előfizetés'}
              onEdit={() => onEdit(s)}
              onDelete={() => onDelete(s)}
            />
          </div>
        )}
      />
    </div>
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
          hint="Az előrejelzéshez legalább egy aktív árazási sáv és költségtétel szükséges — vagy a lekérés hibázott, ilyenkor a fenti hibaüzenet mutatja az okot."
        />
      }
      renderCell={(f, key) => {
        switch (key) {
          case 'szam':
            return <span className="font-semibold text-foreground">{f.gyulekezet_szam}</span>
          case 'bevetel':
            return (
              <span className="text-emerald-700 dark:text-emerald-300">
                {formatRon(f.havi_bevetel_ron)}
              </span>
            )
          case 'koltseg':
            return (
              <span className="text-rose-700 dark:text-rose-300">{formatRon(f.havi_koltseg_ron)}</span>
            )
          case 'profit':
            return <ProfitValue value={f.havi_profit_ron} />
          case 'eves_profit':
            return <ProfitValue value={f.eves_profit_ron} />
          case 'margin':
            return (
              <StatusBadge
                intent={f.profit_margin >= 50 ? 'success' : f.profit_margin >= 0 ? 'warning' : 'danger'}
              >
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
    <span
      className={`font-semibold ${
        positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
      }`}
    >
      {positive ? '+' : ''}
      {formatRon(value)}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sor-műveletek (asztali ikon-gombok + mobil kártya-gombok)
// ─────────────────────────────────────────────────────────────────────────
function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={onEdit}
        className="size-9 p-0 text-muted-foreground hover:text-foreground"
        aria-label={`${name} szerkesztése`}
        title="Szerkesztés"
      >
        <Edit2 className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        className="size-9 p-0 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        aria-label={`${name} törlése`}
        title="Törlés"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function MobileCardActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="mt-2 flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={onEdit}
        className="min-h-11 flex-1 gap-1.5"
        aria-label={`${name} szerkesztése`}
      >
        <Edit2 className="size-3.5" />
        Szerkesztés
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onDelete}
        className="min-h-11 flex-1 gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        aria-label={`${name} törlése`}
      >
        <Trash2 className="size-3.5" />
        Törlés
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Dialógusok: költség, sáv, subscription
// ─────────────────────────────────────────────────────────────────────────
function CostEditDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: SystemFinanceCost | null
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    kategoria: (editing?.kategoria || 'supabase') as CostCategory,
    nev: editing?.nev || '',
    havi_usd: editing?.havi_usd ?? 0,
    havi_ron: editing?.havi_ron ?? undefined,
    arfolyam_usd: editing?.arfolyam_usd ?? 4.41,
    aktiv: editing?.aktiv ?? true,
    sorszam: editing?.sorszam ?? 0,
    megjegyzes: editing?.megjegyzes ?? '',
  })
  const [isPending, startTransition] = useTransition()

  // Elavult kategóriát (vercel) új tételhez nem kínálunk fel — csak akkor
  // jelenik meg, ha egy meglévő (historikus) tétel már ezt használja.
  const categoryOptions = (Object.keys(COST_CATEGORY_LABELS) as CostCategory[]).filter(
    (k) => k !== 'vercel' || editing?.kategoria === 'vercel',
  )

  function handleSave() {
    if (!form.nev.trim()) {
      toast.error('Adj meg nevet.')
      return
    }
    startTransition(async () => {
      const res = await upsertSystemCost({
        id: editing?.id,
        kategoria: form.kategoria,
        nev: form.nev.trim(),
        havi_usd: Number(form.havi_usd),
        havi_ron: form.havi_ron ? Number(form.havi_ron) : null,
        arfolyam_usd: Number(form.arfolyam_usd),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-foreground">
            {editing ? 'Költségtétel szerkesztése' : 'Új költségtétel'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <ModalField label="Kategória">
            <select
              value={form.kategoria}
              onChange={(e) => setForm({ ...form, kategoria: e.target.value as CostCategory })}
              className={`${SELECT_CLASS} w-full`}
            >
              {categoryOptions.map((k) => (
                <option key={k} value={k}>{COST_CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </ModalField>
          <ModalField label="Megnevezés">
            <Input value={form.nev} onChange={(e) => setForm({ ...form, nev: e.target.value })} />
          </ModalField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModalField label="Havi USD">
              <Input
                type="number" step="0.01"
                value={form.havi_usd}
                onChange={(e) => setForm({ ...form, havi_usd: Number(e.target.value) })}
              />
            </ModalField>
            <ModalField label="Árfolyam (USD→RON)">
              <Input
                type="number" step="0.0001"
                value={form.arfolyam_usd}
                onChange={(e) => setForm({ ...form, arfolyam_usd: Number(e.target.value) })}
              />
            </ModalField>
          </div>
          <ModalField label="Havi RON (opcionális, felülírja az USD alapú számítást)">
            <Input
              type="number" step="0.01"
              value={form.havi_ron ?? ''}
              onChange={(e) => setForm({ ...form, havi_ron: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Automatikus: USD × árfolyam"
            />
          </ModalField>
          <ModalField label="Megjegyzés">
            <Input value={form.megjegyzes || ''} onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })} />
          </ModalField>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
              Aktív
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sorszám:</span>
              <Input
                type="number"
                className="h-9 w-20"
                value={form.sorszam}
                onChange={(e) => setForm({ ...form, sorszam: Number(e.target.value) })}
              />
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

function TierEditDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: SystemPricingTier | null
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    nev: editing?.nev || '',
    tipus: (editing?.tipus || 'gyulekezet') as PricingTierType,
    min_tagok: editing?.min_tagok ?? 0,
    max_tagok: editing?.max_tagok ?? undefined,
    havi_dij_ron: editing?.havi_dij_ron ?? 0,
    eves_dij_ron: editing?.eves_dij_ron ?? 0,
    aktiv: editing?.aktiv ?? true,
    sorszam: editing?.sorszam ?? 0,
    megjegyzes: editing?.megjegyzes ?? '',
  })
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!form.nev.trim()) {
      toast.error('Adj meg nevet.')
      return
    }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <Input
                type="number"
                value={form.min_tagok}
                onChange={(e) => setForm({ ...form, min_tagok: Number(e.target.value) })}
              />
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
              <Input
                type="number" step="0.01"
                value={form.havi_dij_ron}
                onChange={(e) => setForm({ ...form, havi_dij_ron: Number(e.target.value) })}
              />
            </ModalField>
            <ModalField label="Éves díj (RON/év)">
              <Input
                type="number" step="0.01"
                value={form.eves_dij_ron}
                onChange={(e) => setForm({ ...form, eves_dij_ron: Number(e.target.value) })}
              />
            </ModalField>
          </div>
          <ModalField label="Megjegyzés">
            <Input value={form.megjegyzes || ''} onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })} />
          </ModalField>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
              Aktív
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sorszám:</span>
              <Input
                type="number"
                className="h-9 w-20"
                value={form.sorszam}
                onChange={(e) => setForm({ ...form, sorszam: Number(e.target.value) })}
              />
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

function SubscriptionEditDialog({
  open, onOpenChange, editing, tiers, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: CongregationSubscription | null
  tiers: SystemPricingTier[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    congregation_id: editing?.congregation_id || '',
    pricing_tier_id: editing?.pricing_tier_id ?? undefined,
    tipus: (editing?.tipus || 'havi') as SubscriptionType,
    dij_ron: editing?.dij_ron ?? undefined,
    kezdet: editing?.kezdet || new Date().toISOString().slice(0, 10),
    veg: editing?.veg ?? '',
    aktiv: editing?.aktiv ?? true,
    megjegyzes: editing?.megjegyzes ?? '',
  })
  const [congregations, setCongregations] = useState<Array<{ id: string; name: string; tag_szam: number }>>([])
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    void listCongregationsForSubscription().then((r) => {
      if (r.data) setCongregations(r.data)
    })
  }, [])

  function handleSave() {
    if (!form.congregation_id) {
      toast.error('Válassz gyülekezetet.')
      return
    }
    startTransition(async () => {
      const res = await upsertCongregationSubscription({
        id: editing?.id,
        congregation_id: form.congregation_id,
        pricing_tier_id: form.pricing_tier_id ? Number(form.pricing_tier_id) : null,
        tipus: form.tipus,
        dij_ron: form.dij_ron != null && form.dij_ron !== undefined && String(form.dij_ron) !== '' ? Number(form.dij_ron) : null,
        kezdet: form.kezdet,
        veg: form.veg || null,
        aktiv: form.aktiv,
        megjegyzes: form.megjegyzes || null,
      })
      if (res.error) toast.error(res.error)
      else {
        toast.success(editing ? 'Frissítve.' : 'Hozzáadva.')
        onSaved()
      }
    })
  }

  // A dij_ron oszlop a szerveren a típus szerint értelmeződik:
  // 'havi' → RON/hó, 'eves' → RON/év. A címke és a súgó ezt egyértelműsíti,
  // különben éves típusnál 12x-es félreárazás lehet a havinak szánt összegből.
  const egyediDijUnit = dijUnit(form.tipus)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(640px,96vw)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-foreground">
            {editing ? 'Előfizetés szerkesztése' : 'Új előfizetés'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <ModalField label="Gyülekezet">
            <select
              value={form.congregation_id}
              onChange={(e) => setForm({ ...form, congregation_id: e.target.value })}
              disabled={!!editing}
              className={`${SELECT_CLASS} w-full`}
            >
              <option value="">— válassz —</option>
              {congregations.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.tag_szam} tag)</option>
              ))}
            </select>
          </ModalField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModalField label="Árazási sáv">
              <select
                value={form.pricing_tier_id ?? ''}
                onChange={(e) => setForm({ ...form, pricing_tier_id: e.target.value ? Number(e.target.value) : undefined })}
                className={`${SELECT_CLASS} w-full`}
              >
                <option value="">— nincs (egyedi díj) —</option>
                {tiers.filter((t) => t.aktiv).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nev} ({formatRon(Number(t.havi_dij_ron))} RON/hó)
                  </option>
                ))}
              </select>
            </ModalField>
            <ModalField label="Típus">
              <select
                value={form.tipus}
                onChange={(e) => setForm({ ...form, tipus: e.target.value as SubscriptionType })}
                className={`${SELECT_CLASS} w-full`}
              >
                {(Object.keys(SUBSCRIPTION_TYPE_LABELS) as SubscriptionType[]).map((k) => (
                  <option key={k} value={k}>{SUBSCRIPTION_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </ModalField>
          </div>
          <ModalField label={`Egyedi díj (${egyediDijUnit}) — opcionális, felülírja a sáv szerintit`}>
            <Input
              type="number" step="0.01"
              value={form.dij_ron ?? ''}
              onChange={(e) => setForm({ ...form, dij_ron: e.target.value ? Number(e.target.value) : undefined })}
              placeholder={form.tipus === 'eves' ? 'Pl. 600 (egész évre)' : 'Pl. 50'}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              A mező a kiválasztott típus szerint értelmeződik: havi típusnál a havi díjat,{' '}
              <strong>éves típusnál az ÉVES összeget add meg</strong>.
            </p>
          </ModalField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModalField label="Kezdet">
              <Input type="date" value={form.kezdet} onChange={(e) => setForm({ ...form, kezdet: e.target.value })} />
            </ModalField>
            <ModalField label="Vég (opcionális)">
              <Input type="date" value={form.veg || ''} onChange={(e) => setForm({ ...form, veg: e.target.value })} />
            </ModalField>
          </div>
          <ModalField label="Megjegyzés">
            <Input value={form.megjegyzes || ''} onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })} />
          </ModalField>
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={form.aktiv}
              onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
            />
            Aktív
          </label>
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
