'use client'

/**
 * Admin → Rendszer pénzügyei: KÖNYVELÉS (bevétel + kiadás egy helyen).
 *
 * A „személyre szabott könyvelés": a BEVÉTEL a system_finance_income
 * (előfizetés / egyszeri / adomány / felár / egyéb), a KIADÁS a meglévő
 * system_finance_costs. Felül egyenleg-összegzés (bevétel − kiadás, RON-ban,
 * pénznemenkénti bontással).
 *
 * A nem-lej bevételeket a szerver a napi árfolyammal RON-ra számolja
 * (osszeg_ron), így az egyenleg mindig lejben összevethető.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Banknote, Plus, TrendingUp, TrendingDown, Scale, X, Filter,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'

import { AdminConfirmDialog } from '../admin-confirm-dialog'
import { AdminTable, type AdminTableColumn } from '../_shared/admin-table'
import { AdminEmptyState } from '../_shared/admin-empty-state'
import { AdminSkeleton } from '../_shared/admin-skeleton'
import { StatusBadge } from '../_shared/status-badge'
import {
  SELECT_CLASS, CURRENCIES, formatRon, formatMoney, formatDateHu,
  COST_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, INCOME_CATEGORY_INTENT,
  RowActions, MobileCardActions, type Currency,
} from './finance-shared'
import {
  listSystemCosts, upsertSystemCost, deleteSystemCost,
  listCongregationsForSubscription,
  type SystemFinanceCost, type CostCategory,
} from '@/app/(dashboard)/admin/system-finance-actions'
import {
  listSystemIncome, upsertSystemIncome, deleteSystemIncome,
  type SystemIncomeRow, type IncomeCategory, type SystemIncomeFilter,
} from '@/app/(dashboard)/admin/system-finance-income-actions'

function costRonValue(c: SystemFinanceCost): number {
  return Number(c.havi_ron) || Number(c.havi_usd) * Number(c.arfolyam_usd)
}

/** A bevétel RON-értéke (a szerver által számolt osszeg_ron, RON esetén az összeg). */
function incomeRon(r: SystemIncomeRow): number {
  if (r.osszeg_ron != null) return Number(r.osszeg_ron)
  if (r.penznem === 'RON') return Number(r.osszeg)
  return 0
}

type DeleteTarget =
  | { kind: 'income'; id: number; name: string }
  | { kind: 'cost'; id: number; name: string }

export function FinanceAccounting({ onChanged }: { onChanged?: () => void }) {
  const [income, setIncome] = useState<SystemIncomeRow[]>([])
  const [costs, setCosts] = useState<SystemFinanceCost[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SystemIncomeFilter>({})

  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false)
  const [incomeEditing, setIncomeEditing] = useState<SystemIncomeRow | null>(null)
  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [costEditing, setCostEditing] = useState<SystemFinanceCost | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function refresh(nextFilter?: SystemIncomeFilter) {
    const f = nextFilter ?? filter
    const [incomeRes, costsRes] = await Promise.all([
      listSystemIncome(f),
      listSystemCosts(),
    ])
    if (incomeRes.error) toast.error(`Bevételek: ${incomeRes.error}`)
    else if (incomeRes.data) setIncome(incomeRes.data)
    if (costsRes.error) toast.error(`Kiadások: ${costsRes.error}`)
    else if (costsRes.data) setCosts(costsRes.data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh({})
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    const res =
      deleteTarget.kind === 'income'
        ? await deleteSystemIncome(deleteTarget.id)
        : await deleteSystemCost(deleteTarget.id)
    setDeleteBusy(false)
    if (res.error) toast.error(res.error)
    else {
      toast.success('Törölve.')
      setDeleteTarget(null)
      void refresh()
      onChanged?.()
    }
  }

  const totals = useMemo(() => {
    const incomeRonTotal = income.reduce((s, r) => s + incomeRon(r), 0)
    const activeCosts = costs.filter((c) => c.aktiv)
    const costRonTotal = activeCosts.reduce((s, c) => s + costRonValue(c), 0)
    // Bevétel pénznemenkénti bontása (eredeti pénznemben)
    const byCurrency = new Map<string, number>()
    for (const r of income) byCurrency.set(r.penznem, (byCurrency.get(r.penznem) || 0) + Number(r.osszeg))
    return {
      incomeRonTotal,
      costRonTotal,
      net: incomeRonTotal - costRonTotal,
      byCurrency: Array.from(byCurrency.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    }
  }, [income, costs])

  if (loading) {
    return (
      <section className="card-raised p-4 sm:p-5">
        <AdminSkeleton rows={6} />
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── EGYENLEG ─── */}
      <BalanceSummary
        incomeRon={totals.incomeRonTotal}
        costRon={totals.costRonTotal}
        net={totals.net}
        byCurrency={totals.byCurrency}
      />

      {/* ─── BEVÉTELEK ─── */}
      <section className="card-raised space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <TrendingUp className="size-4" />
            </span>
            <h3 className="font-heading text-lg text-foreground">Bevételek</h3>
          </div>
          <Button
            onClick={() => { setIncomeEditing(null); setIncomeDialogOpen(true) }}
            className="gap-1.5 rounded-xl"
          >
            <Plus className="size-4" />
            Új bevétel
          </Button>
        </div>

        <IncomeFilters
          filter={filter}
          onChange={(f) => { setFilter(f); void refresh(f) }}
        />

        <IncomeTable
          rows={income}
          onEdit={(r) => { setIncomeEditing(r); setIncomeDialogOpen(true) }}
          onDelete={(r) =>
            setDeleteTarget({ kind: 'income', id: r.id, name: r.megnevezes || INCOME_CATEGORY_LABELS[r.kategoria] })
          }
        />
      </section>

      {/* ─── KIADÁSOK ─── */}
      <section className="card-raised space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              <TrendingDown className="size-4" />
            </span>
            <h3 className="font-heading text-lg text-foreground">Kiadások (havi rendszer-költségek)</h3>
          </div>
          <Button
            onClick={() => { setCostEditing(null); setCostDialogOpen(true) }}
            className="gap-1.5 rounded-xl"
          >
            <Plus className="size-4" />
            Új kiadás
          </Button>
        </div>
        <CostTable
          costs={costs}
          onEdit={(c) => { setCostEditing(c); setCostDialogOpen(true) }}
          onDelete={(c) => setDeleteTarget({ kind: 'cost', id: c.id, name: c.nev })}
        />
      </section>

      {/* ─── DIALÓGUSOK ─── */}
      {incomeDialogOpen && (
        <IncomeEditDialog
          editing={incomeEditing}
          onOpenChange={setIncomeDialogOpen}
          onSaved={() => { setIncomeDialogOpen(false); void refresh(); onChanged?.() }}
        />
      )}
      {costDialogOpen && (
        <CostEditDialog
          editing={costEditing}
          onOpenChange={setCostDialogOpen}
          onSaved={() => { setCostDialogOpen(false); void refresh(); onChanged?.() }}
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
              {deleteTarget.kind === 'income' ? 'bevételt' : 'kiadást'}? A művelet nem vonható vissza.
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
// Egyenleg-összegzés
// ─────────────────────────────────────────────────────────────────────────
function BalanceSummary({
  incomeRon,
  costRon,
  net,
  byCurrency,
}: {
  incomeRon: number
  costRon: number
  net: number
  byCurrency: [string, number][]
}) {
  const positive = net >= 0
  return (
    <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
      <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/40 dark:ring-emerald-400/25">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-800/75 dark:text-emerald-200/75">
            Bevétel összesen
          </p>
          <TrendingUp className="size-4 text-emerald-700 dark:text-emerald-300" />
        </div>
        <p className="mt-1 break-words font-heading text-xl font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
          {formatRon(incomeRon)} RON
        </p>
        {byCurrency.length > 0 && (
          <p className="mt-1 text-[11px] text-emerald-800/70 dark:text-emerald-200/70">
            {byCurrency.map(([cur, sum]) => `${formatRon(sum)} ${cur}`).join(' · ')}
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-rose-50 px-4 py-3 ring-1 ring-inset ring-rose-600/15 dark:bg-rose-950/40 dark:ring-rose-400/25">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.16em] text-rose-800/75 dark:text-rose-200/75">
            Kiadás (havi)
          </p>
          <TrendingDown className="size-4 text-rose-700 dark:text-rose-300" />
        </div>
        <p className="mt-1 break-words font-heading text-xl font-semibold tabular-nums text-rose-800 dark:text-rose-200">
          {formatRon(costRon)} RON
        </p>
        <p className="mt-1 text-[11px] text-rose-800/70 dark:text-rose-200/70">aktív költségtételek</p>
      </div>

      <div
        className={`rounded-2xl px-4 py-3 ring-1 ring-inset ${
          positive
            ? 'bg-emerald-50 ring-emerald-600/15 dark:bg-emerald-950/40 dark:ring-emerald-400/25'
            : 'bg-rose-50 ring-rose-600/15 dark:bg-rose-950/40 dark:ring-rose-400/25'
        }`}
      >
        <div className="flex items-center justify-between">
          <p
            className={`text-[11px] uppercase tracking-[0.16em] ${
              positive ? 'text-emerald-800/75 dark:text-emerald-200/75' : 'text-rose-800/75 dark:text-rose-200/75'
            }`}
          >
            Egyenleg
          </p>
          <Scale className={`size-4 ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`} />
        </div>
        <p
          className={`mt-1 break-words font-heading text-xl font-semibold tabular-nums ${
            positive ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'
          }`}
        >
          {positive ? '+' : ''}{formatRon(net)} RON
        </p>
        <p
          className={`mt-1 text-[11px] ${
            positive ? 'text-emerald-800/70 dark:text-emerald-200/70' : 'text-rose-800/70 dark:text-rose-200/70'
          }`}
        >
          bevétel − havi kiadás
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Bevétel-szűrők
// ─────────────────────────────────────────────────────────────────────────
function IncomeFilters({
  filter,
  onChange,
}: {
  filter: SystemIncomeFilter
  onChange: (f: SystemIncomeFilter) => void
}) {
  const hasFilter = !!(filter.kategoria || filter.from || filter.to)
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-40">
        <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Filter className="size-3" /> Kategória
        </label>
        <select
          value={filter.kategoria ?? ''}
          onChange={(e) => onChange({ ...filter, kategoria: (e.target.value || undefined) as IncomeCategory | undefined })}
          className={`${SELECT_CLASS} w-full`}
        >
          <option value="">Minden kategória</option>
          {(Object.keys(INCOME_CATEGORY_LABELS) as IncomeCategory[]).map((k) => (
            <option key={k} value={k}>{INCOME_CATEGORY_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div className="min-w-0 basis-36">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dátumtól</label>
        <Input type="date" value={filter.from ?? ''} onChange={(e) => onChange({ ...filter, from: e.target.value || undefined })} className="h-10" />
      </div>
      <div className="min-w-0 basis-36">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dátumig</label>
        <Input type="date" value={filter.to ?? ''} onChange={(e) => onChange({ ...filter, to: e.target.value || undefined })} className="h-10" />
      </div>
      {hasFilter && (
        <Button variant="ghost" onClick={() => onChange({})} className="min-h-10 gap-1.5 text-muted-foreground">
          <X className="size-3.5" />
          Szűrők törlése
        </Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Bevétel-táblázat
// ─────────────────────────────────────────────────────────────────────────
const INCOME_COLUMNS: AdminTableColumn[] = [
  { key: 'datum', label: 'Dátum', hideBelow: 'sm' },
  { key: 'kategoria', label: 'Kategória' },
  { key: 'gyulekezet', label: 'Gyülekezet', hideBelow: 'md' },
  { key: 'megnevezes', label: 'Megnevezés', hideBelow: 'lg' },
  { key: 'osszeg', label: 'Összeg', align: 'right', className: 'tabular-nums' },
  { key: 'ron', label: 'RON-érték', align: 'right', hideBelow: 'sm', className: 'tabular-nums' },
  { key: 'actions', label: <span className="sr-only">Műveletek</span>, align: 'right' },
]

function IncomeTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: SystemIncomeRow[]
  onEdit: (r: SystemIncomeRow) => void
  onDelete: (r: SystemIncomeRow) => void
}) {
  const total = rows.reduce((s, r) => s + incomeRon(r), 0)
  return (
    <div className="space-y-3">
      <AdminTable
        columns={INCOME_COLUMNS}
        rows={rows}
        rowKey={(r) => String(r.id)}
        minWidthClass="min-w-[640px]"
        empty={
          <AdminEmptyState
            icon={TrendingUp}
            title="Nincs bevétel"
            hint="Az „Új bevétel” gombbal rögzíthetsz előfizetési díjat, egyszeri kifizetést vagy adományt."
          />
        }
        renderCell={(r, key) => {
          switch (key) {
            case 'datum':
              return <span className="text-muted-foreground">{formatDateHu(r.datum)}</span>
            case 'kategoria':
              return <StatusBadge intent={INCOME_CATEGORY_INTENT[r.kategoria]}>{INCOME_CATEGORY_LABELS[r.kategoria]}</StatusBadge>
            case 'gyulekezet':
              return r.congregation_name
                ? <span className="text-foreground">{r.congregation_name}</span>
                : <span className="text-muted-foreground">általános</span>
            case 'megnevezes':
              return r.megnevezes
                ? <span className="text-foreground">{r.megnevezes}</span>
                : <span className="text-muted-foreground">—</span>
            case 'osszeg':
              return <span className="font-medium text-foreground">{formatMoney(Number(r.osszeg), r.penznem)}</span>
            case 'ron':
              return (
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {r.osszeg_ron != null || r.penznem === 'RON' ? `${formatRon(incomeRon(r))} RON` : '—'}
                </span>
              )
            case 'actions':
              return <RowActions name={r.megnevezes || 'bevétel'} onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
            default:
              return null
          }
        }}
        renderMobileCard={(r) => (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge intent={INCOME_CATEGORY_INTENT[r.kategoria]}>{INCOME_CATEGORY_LABELS[r.kategoria]}</StatusBadge>
                  <span className="text-[11px] text-muted-foreground">{formatDateHu(r.datum)}</span>
                </div>
                {r.congregation_name && <p className="mt-1 truncate text-sm font-medium text-foreground">{r.congregation_name}</p>}
                {r.megnevezes && <p className="text-[11px] text-muted-foreground">{r.megnevezes}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">{formatMoney(Number(r.osszeg), r.penznem)}</p>
                {(r.osszeg_ron != null || r.penznem === 'RON') && r.penznem !== 'RON' && (
                  <p className="text-[11px] tabular-nums text-emerald-700 dark:text-emerald-300">{formatRon(incomeRon(r))} RON</p>
                )}
              </div>
            </div>
            <MobileCardActions name={r.megnevezes || 'bevétel'} onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
          </div>
        )}
      />
      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-4 py-2.5 ring-1 ring-border">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Összesen (RON)
          </span>
          <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatRon(total)} RON
          </span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Kiadás-táblázat (a meglévő system_finance_costs)
// ─────────────────────────────────────────────────────────────────────────
const COST_COLUMNS: AdminTableColumn[] = [
  { key: 'kategoria', label: 'Kategória', hideBelow: 'lg' },
  { key: 'nev', label: 'Megnevezés' },
  { key: 'havi_usd', label: 'Havi USD', align: 'right', hideBelow: 'md', className: 'tabular-nums' },
  { key: 'havi_ron', label: 'Havi RON', align: 'right', className: 'tabular-nums' },
  { key: 'aktiv', label: 'Státusz', align: 'center', hideBelow: 'sm' },
  { key: 'actions', label: <span className="sr-only">Műveletek</span>, align: 'right' },
]

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
  const totalRon = active.reduce((s, c) => s + costRonValue(c), 0)
  return (
    <div className="space-y-3">
      <AdminTable
        columns={COST_COLUMNS}
        rows={costs}
        rowKey={(c) => String(c.id)}
        minWidthClass="min-w-[560px]"
        empty={
          <AdminEmptyState
            icon={Banknote}
            title="Nincs kiadás"
            hint="Az „Új kiadás” gombbal rögzítheted a rendszer havi költségeit (Supabase, Railway, email, stb.)."
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
                  {c.megjegyzes && <p className="max-w-[320px] truncate text-[11px] text-muted-foreground">{c.megjegyzes}</p>}
                </div>
              )
            case 'havi_usd':
              return <span className="text-muted-foreground">{formatRon(Number(c.havi_usd))} USD</span>
            case 'havi_ron':
              return <span className="font-semibold text-rose-700 dark:text-rose-300">{formatRon(costRonValue(c))}</span>
            case 'aktiv':
              return <StatusBadge intent={c.aktiv ? 'success' : 'neutral'}>{c.aktiv ? 'Aktív' : 'Inaktív'}</StatusBadge>
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
                  <StatusBadge intent={c.aktiv ? 'success' : 'neutral'}>{c.aktiv ? 'Aktív' : 'Inaktív'}</StatusBadge>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">{formatRon(costRonValue(c))} RON</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">{formatRon(Number(c.havi_usd))} USD</p>
              </div>
            </div>
            {c.megjegyzes && <p className="mt-1.5 text-xs text-muted-foreground">{c.megjegyzes}</p>}
            <MobileCardActions name={c.nev} onEdit={() => onEdit(c)} onDelete={() => onDelete(c)} />
          </div>
        )}
      />
      {costs.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-4 py-2.5 ring-1 ring-border">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Összesen (aktív)</span>
          <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">{formatRon(totalRon)} RON</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Bevétel-szerkesztő dialógus
// ─────────────────────────────────────────────────────────────────────────
function IncomeEditDialog({
  editing,
  onOpenChange,
  onSaved,
}: {
  editing: SystemIncomeRow | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    congregation_id: editing?.congregation_id ?? '',
    kategoria: (editing?.kategoria || 'egyszeri') as IncomeCategory,
    megnevezes: editing?.megnevezes ?? '',
    osszeg: editing ? String(editing.osszeg) : '',
    penznem: (editing?.penznem || 'RON') as Currency,
    arfolyam: editing?.arfolyam != null ? String(editing.arfolyam) : '',
    datum: editing?.datum || new Date().toISOString().slice(0, 10),
    megjegyzes: editing?.megjegyzes ?? '',
  })
  const [congregations, setCongregations] = useState<Array<{ id: string; name: string; tag_szam: number }>>([])
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    void listCongregationsForSubscription().then((r) => { if (r.data) setCongregations(r.data) })
  }, [])

  function handleSave() {
    const osszeg = Number(form.osszeg)
    if (!Number.isFinite(osszeg) || osszeg <= 0) {
      toast.error('Adj meg érvényes összeget.')
      return
    }
    startTransition(async () => {
      const res = await upsertSystemIncome({
        id: editing?.id,
        congregation_id: form.congregation_id || null,
        kategoria: form.kategoria,
        megnevezes: form.megnevezes.trim() || null,
        osszeg,
        penznem: form.penznem,
        arfolyam: form.arfolyam ? Number(form.arfolyam) : null,
        datum: form.datum,
        megjegyzes: form.megjegyzes.trim() || null,
      })
      if (res.error) toast.error(res.error)
      else {
        toast.success(editing ? 'Frissítve.' : 'Hozzáadva.')
        onSaved()
      }
    })
  }

  const nonRon = form.penznem !== 'RON'

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-foreground">
            {editing ? 'Bevétel szerkesztése' : 'Új bevétel'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModalField label="Kategória">
              <select
                value={form.kategoria}
                onChange={(e) => setForm({ ...form, kategoria: e.target.value as IncomeCategory })}
                className={`${SELECT_CLASS} w-full`}
              >
                {(Object.keys(INCOME_CATEGORY_LABELS) as IncomeCategory[]).map((k) => (
                  <option key={k} value={k}>{INCOME_CATEGORY_LABELS[k]}</option>
                ))}
              </select>
            </ModalField>
            <ModalField label="Dátum">
              <Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} />
            </ModalField>
          </div>
          <ModalField label="Gyülekezet (opcionális)">
            <select
              value={form.congregation_id}
              onChange={(e) => setForm({ ...form, congregation_id: e.target.value })}
              className={`${SELECT_CLASS} w-full`}
            >
              <option value="">— általános (nem gyülekezethez kötött) —</option>
              {congregations.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </ModalField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModalField label="Összeg">
              <Input
                type="number" step="0.01"
                value={form.osszeg}
                onChange={(e) => setForm({ ...form, osszeg: e.target.value })}
                placeholder="Pl. 120"
              />
            </ModalField>
            <ModalField label="Pénznem">
              <select
                value={form.penznem}
                onChange={(e) => setForm({ ...form, penznem: e.target.value as Currency })}
                className={`${SELECT_CLASS} w-full`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </ModalField>
          </div>
          {nonRon && (
            <ModalField label="Árfolyam (opcionális) — üresen a napi árfolyamot használjuk">
              <Input
                type="number" step="0.0001"
                value={form.arfolyam}
                onChange={(e) => setForm({ ...form, arfolyam: e.target.value })}
                placeholder="1 "
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                1 {form.penznem} = ennyi RON. Üresen hagyva a rendszer a napi árfolyammal számol.
              </p>
            </ModalField>
          )}
          <ModalField label="Megnevezés (opcionális)">
            <Input value={form.megnevezes} onChange={(e) => setForm({ ...form, megnevezes: e.target.value })} placeholder="Pl. 2026. évi előfizetési díj" />
          </ModalField>
          <ModalField label="Megjegyzés (opcionális)">
            <Input value={form.megjegyzes} onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })} />
          </ModalField>
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

// ─────────────────────────────────────────────────────────────────────────
// Kiadás-szerkesztő dialógus (a system_finance_costs)
// ─────────────────────────────────────────────────────────────────────────
function CostEditDialog({
  editing,
  onOpenChange,
  onSaved,
}: {
  editing: SystemFinanceCost | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    kategoria: (editing?.kategoria || 'supabase') as CostCategory,
    nev: editing?.nev || '',
    havi_usd: editing?.havi_usd ?? 0,
    havi_ron: (editing?.havi_ron ?? undefined) as number | undefined,
    arfolyam_usd: editing?.arfolyam_usd ?? 4.41,
    aktiv: editing?.aktiv ?? true,
    sorszam: editing?.sorszam ?? 0,
    megjegyzes: editing?.megjegyzes ?? '',
  })
  const [isPending, startTransition] = useTransition()

  const categoryOptions = (Object.keys(COST_CATEGORY_LABELS) as CostCategory[]).filter(
    (k) => k !== 'vercel' || editing?.kategoria === 'vercel',
  )

  function handleSave() {
    if (!form.nev.trim()) { toast.error('Adj meg nevet.'); return }
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
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-foreground">
            {editing ? 'Kiadás szerkesztése' : 'Új kiadás'}
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
              <Input type="number" step="0.01" value={form.havi_usd} onChange={(e) => setForm({ ...form, havi_usd: Number(e.target.value) })} />
            </ModalField>
            <ModalField label="Árfolyam (USD→RON)">
              <Input type="number" step="0.0001" value={form.arfolyam_usd} onChange={(e) => setForm({ ...form, arfolyam_usd: Number(e.target.value) })} />
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
