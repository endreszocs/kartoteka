'use client'

/**
 * Admin → Rendszer pénzügyei: ELŐFIZETÉSEK — a központi új felület.
 *
 * Azok a gyülekezetek, amelyekhez van hozzárendelt AKTÍV regisztrált
 * felhasználó (a mag `listCongregationsWithActiveUsers` adja vissza). Minden
 * gyülekezethez egy „Kezelés" panel:
 *   - hozzáférés-státusz vezérlés (Aktiválás / Teszt-időszak / Ingyenes /
 *     Szüneteltetés indoklással) — a lelkész a szünetet a belépéskor látja;
 *   - egyedi díj + felár szerkesztés (tag-szám alapú sáv-javaslattal);
 *   - gyors bevétel rögzítése (egyszeri kifizetés / adomány).
 *
 * BIZTONSÁGOS DEFAULT: a szünet KIZÁRÓLAG explicit admin-döntés. Minden más
 * állapot enged. Admin/master soha nem gating-elhető (ez a mag felelőssége).
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Building2, Search, Settings2, Play, FlaskConical, Gift, PauseCircle,
  ChevronLeft, Wallet, Sparkles, Users2, Info,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'

import { AdminTable, type AdminTableColumn } from '../_shared/admin-table'
import { AdminEmptyState } from '../_shared/admin-empty-state'
import { AdminSkeleton } from '../_shared/admin-skeleton'
import { StatusBadge } from '../_shared/status-badge'
import {
  SELECT_CLASS, CURRENCIES, formatRon, dijUnit,
  SUBSCRIPTION_TYPE_LABELS, ACCESS_STATUS_LABELS, accessStatusIntent,
  type Currency,
} from './finance-shared'
import {
  listCongregationsWithActiveUsers, listCongregationSubscriptions,
  setSubscriptionAccessStatus, upsertCongregationSubscription,
  suggestPricingTierForCongregation,
  type CongregationWithAccess, type CongregationAccessSubscription,
  type CongregationSubscription, type SubscriptionAccessStatus,
  type SubscriptionType, type SystemPricingTier,
} from '@/app/(dashboard)/admin/system-finance-actions'
import {
  upsertSystemIncome, type IncomeCategory,
} from '@/app/(dashboard)/admin/system-finance-income-actions'

// ─────────────────────────────────────────────────────────────────────────
// A státusz-váltó gombok konfigurációja
// ─────────────────────────────────────────────────────────────────────────
interface StatusAction {
  status: SubscriptionAccessStatus
  label: string
  icon: typeof Play
  hint: string
}

const STATUS_ACTIONS: StatusAction[] = [
  { status: 'active', label: 'Aktiválás', icon: Play, hint: 'Teljes hozzáférés, fizető előfizetés.' },
  { status: 'trial', label: 'Teszt-időszak', icon: FlaskConical, hint: 'Ingyenes kipróbálás, teljes hozzáféréssel.' },
  { status: 'free', label: 'Ingyenes', icon: Gift, hint: 'Tartósan ingyenes hozzáférés, díj nélkül.' },
  { status: 'suspended', label: 'Szüneteltetés', icon: PauseCircle, hint: 'A gyülekezet funkciói leállnak.' },
]

function currentStatus(sub: CongregationAccessSubscription | null): SubscriptionAccessStatus | 'none' {
  return sub ? sub.access_status : 'none'
}

/** Rövid díj-összefoglaló egy gyülekezet aktuális előfizetéséből. */
function feeSummary(sub: CongregationAccessSubscription | null): string {
  if (!sub) return '—'
  const parts: string[] = []
  if (sub.dij_ron != null) parts.push(`${formatRon(Number(sub.dij_ron))} ${dijUnit(sub.tipus)}`)
  else if (sub.pricing_tier_nev) parts.push('sáv szerint')
  if (sub.felar_ron != null && Number(sub.felar_ron) > 0) {
    parts.push(`+${formatRon(Number(sub.felar_ron))} felár`)
  }
  return parts.length > 0 ? parts.join(' ') : '—'
}

// ─────────────────────────────────────────────────────────────────────────
const COLUMNS: AdminTableColumn[] = [
  { key: 'gyulekezet', label: 'Gyülekezet' },
  { key: 'tagok', label: 'Tagok', align: 'right', hideBelow: 'lg', className: 'tabular-nums' },
  { key: 'userek', label: 'Felhasználók', align: 'right', hideBelow: 'md', className: 'tabular-nums' },
  { key: 'statusz', label: 'Státusz', align: 'center' },
  { key: 'dij', label: 'Díj + felár', align: 'right', hideBelow: 'sm', className: 'tabular-nums' },
  { key: 'actions', label: <span className="sr-only">Kezelés</span>, align: 'right' },
]

export function SubscriptionManager({
  tiers,
  onChanged,
}: {
  tiers: SystemPricingTier[]
  /** A szülő KPI-jait is frissíti bármely mentés után. */
  onChanged?: () => void
}) {
  const [congs, setCongs] = useState<CongregationWithAccess[]>([])
  const [fullSubs, setFullSubs] = useState<Map<string, CongregationSubscription>>(new Map())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [managingId, setManagingId] = useState<string | null>(null)

  async function refresh() {
    const [listRes, subsRes] = await Promise.all([
      listCongregationsWithActiveUsers(),
      listCongregationSubscriptions(),
    ])
    if (listRes.error) toast.error(`Előfizetések: ${listRes.error}`)
    else if (listRes.data) setCongs(listRes.data)
    // A teljes subscription-adat (kezdet/felár-leírás/megjegyzés) a szerkesztő
    // defaultjaihoz — hogy mentéskor ne írjuk felül a meglévő kezdő dátumot.
    if (subsRes.data) {
      const map = new Map<string, CongregationSubscription>()
      for (const s of subsRes.data) {
        if (!map.has(s.congregation_id)) map.set(s.congregation_id, s)
      }
      setFullSubs(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh()
    })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return congs
    return congs.filter((c) => c.name.toLowerCase().includes(needle))
  }, [congs, query])

  const managing = managingId ? congs.find((c) => c.id === managingId) ?? null : null

  if (loading) {
    return (
      <section className="card-raised p-4 sm:p-5">
        <AdminSkeleton rows={6} />
      </section>
    )
  }

  return (
    <section className="card-raised space-y-3 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-heading text-lg text-foreground">Gyülekezetek előfizetései</h3>
          <p className="text-xs text-muted-foreground">
            Csak azok a gyülekezetek, amelyekhez tartozik aktív regisztrált felhasználó.
          </p>
        </div>
      </div>

      {congs.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Keresés gyülekezet szerint…"
            className="h-10 pl-9"
            aria-label="Keresés a gyülekezetek között"
          />
        </div>
      )}

      <AdminTable
        columns={COLUMNS}
        rows={filtered}
        rowKey={(c) => c.id}
        minWidthClass="min-w-[640px]"
        empty={
          query.trim() ? (
            <AdminEmptyState icon={Search} title="Nincs találat" hint="Módosítsd a keresést." />
          ) : (
            <AdminEmptyState
              icon={Building2}
              title="Nincs kezelhető gyülekezet"
              hint="Akkor jelenik meg itt egy gyülekezet, ha van hozzárendelt aktív regisztrált felhasználója."
            />
          )
        }
        renderCell={(c, key) => {
          const status = currentStatus(c.subscription)
          switch (key) {
            case 'gyulekezet':
              return (
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground lg:hidden">
                    {c.tag_szam} tag · {c.activeUserCount} felhasználó
                  </p>
                </div>
              )
            case 'tagok':
              return <span className="text-muted-foreground">{c.tag_szam}</span>
            case 'userek':
              return <span className="text-muted-foreground">{c.activeUserCount}</span>
            case 'statusz':
              return (
                <StatusBadge intent={accessStatusIntent(status)}>
                  {ACCESS_STATUS_LABELS[status]}
                </StatusBadge>
              )
            case 'dij':
              return <span className="text-foreground">{feeSummary(c.subscription)}</span>
            case 'actions':
              return (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManagingId(c.id)}
                    className="min-h-9 gap-1.5"
                  >
                    <Settings2 className="size-3.5" />
                    Kezelés
                  </Button>
                </div>
              )
            default:
              return null
          }
        }}
        renderMobileCard={(c) => {
          const status = currentStatus(c.subscription)
          return (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users2 className="size-3" />
                    {c.tag_szam} tag · {c.activeUserCount} felhasználó
                  </p>
                </div>
                <StatusBadge intent={accessStatusIntent(status)}>
                  {ACCESS_STATUS_LABELS[status]}
                </StatusBadge>
              </div>
              <p className="mt-1.5 text-sm font-semibold tabular-nums text-foreground">
                {feeSummary(c.subscription)}
              </p>
              <Button
                variant="outline"
                onClick={() => setManagingId(c.id)}
                className="mt-2 min-h-11 w-full gap-1.5"
              >
                <Settings2 className="size-4" />
                Kezelés
              </Button>
            </div>
          )
        }}
      />

      {managing && (
        <ManageDialog
          key={managing.id}
          congregation={managing}
          fullSub={fullSubs.get(managing.id) ?? null}
          tiers={tiers}
          onOpenChange={(o) => { if (!o) setManagingId(null) }}
          onChanged={() => {
            void refresh()
            onChanged?.()
          }}
        />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Kezelő dialógus — egyetlen ablak, belső nézet-váltással (nincs egymásba
// ágyazott modál): áttekintés → szüneteltetés / díj / bevétel.
// ─────────────────────────────────────────────────────────────────────────
type ManageView = 'overview' | 'suspend' | 'pricing' | 'income'

function ManageDialog({
  congregation,
  fullSub,
  tiers,
  onOpenChange,
  onChanged,
}: {
  congregation: CongregationWithAccess
  fullSub: CongregationSubscription | null
  tiers: SystemPricingTier[]
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [view, setView] = useState<ManageView>('overview')

  const status = currentStatus(congregation.subscription)
  const title =
    view === 'suspend' ? 'Szüneteltetés'
      : view === 'pricing' ? 'Díj és felár'
        : view === 'income' ? 'Bevétel rögzítése'
          : congregation.name

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl text-foreground">
            {view !== 'overview' && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setView('overview')}
                className="size-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Vissza"
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            <span className="min-w-0 truncate">{title}</span>
          </DialogTitle>
          {view === 'overview' && (
            <DialogDescription className="leading-relaxed">
              {congregation.tag_szam} tag · {congregation.activeUserCount} aktív felhasználó
            </DialogDescription>
          )}
        </DialogHeader>

        {view === 'overview' && (
          <OverviewView
            congregation={congregation}
            status={status}
            onGoTo={setView}
            onStatusApplied={onChanged}
          />
        )}
        {view === 'suspend' && (
          <SuspendView
            congregationId={congregation.id}
            onDone={() => { onChanged(); setView('overview') }}
          />
        )}
        {view === 'pricing' && (
          <PricingView
            congregation={congregation}
            fullSub={fullSub}
            tiers={tiers}
            onDone={() => { onChanged(); setView('overview') }}
          />
        )}
        {view === 'income' && (
          <IncomeView
            congregation={congregation}
            onDone={() => { onChanged(); setView('overview') }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Áttekintés: státusz-vezérlő + navigáció ─────────────────────────────
function OverviewView({
  congregation,
  status,
  onGoTo,
  onStatusApplied,
}: {
  congregation: CongregationWithAccess
  status: SubscriptionAccessStatus | 'none'
  onGoTo: (v: ManageView) => void
  onStatusApplied: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function applyStatus(next: SubscriptionAccessStatus) {
    if (next === 'suspended') { onGoTo('suspend'); return }
    startTransition(async () => {
      const res = await setSubscriptionAccessStatus(congregation.id, next)
      if (res.error) toast.error(res.error)
      else {
        toast.success(`Státusz: ${ACCESS_STATUS_LABELS[next]}.`)
        onStatusApplied()
      }
    })
  }

  const suspended = status === 'suspended'

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Jelenlegi státusz:</span>
        <StatusBadge intent={accessStatusIntent(status)}>{ACCESS_STATUS_LABELS[status]}</StatusBadge>
      </div>

      {suspended && (
        <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-400/25">
          A gyülekezet funkciói jelenleg <strong>le vannak állítva</strong>. A lelkészek a leállítást a
          belépéskor látják. Aktiválással azonnal visszaáll a hozzáférés.
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hozzáférés-státusz
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STATUS_ACTIONS.map((a) => {
            const isCurrent = status === a.status
            const danger = a.status === 'suspended'
            return (
              <button
                key={a.status}
                type="button"
                disabled={isPending || isCurrent}
                onClick={() => applyStatus(a.status)}
                className={`flex min-h-11 items-start gap-2.5 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                  isCurrent
                    ? 'border-primary/40 bg-primary/10'
                    : danger
                      ? 'border-rose-200 hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-950/30'
                      : 'border-border hover:bg-muted/60'
                }`}
              >
                <a.icon
                  className={`mt-0.5 size-4 shrink-0 ${
                    danger ? 'text-rose-600 dark:text-rose-400' : 'text-primary'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {a.label}
                    {isCurrent && <span className="ml-1 text-[11px] text-muted-foreground">(jelenlegi)</span>}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{a.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
        <Button variant="outline" onClick={() => onGoTo('pricing')} className="min-h-11 justify-start gap-2">
          <Wallet className="size-4 text-primary" />
          Díj és felár szerkesztése
        </Button>
        <Button variant="outline" onClick={() => onGoTo('income')} className="min-h-11 justify-start gap-2">
          <Sparkles className="size-4 text-primary" />
          Bevétel rögzítése
        </Button>
      </div>
    </div>
  )
}

// ─── Szüneteltetés indoklással ───────────────────────────────────────────
function SuspendView({
  congregationId,
  onDone,
}: {
  congregationId: string
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSuspend() {
    startTransition(async () => {
      const res = await setSubscriptionAccessStatus(congregationId, 'suspended', reason.trim() || undefined)
      if (res.error) toast.error(res.error)
      else {
        toast.success('A gyülekezet szüneteltetve.')
        onDone()
      }
    })
  }

  return (
    <div className="space-y-3 py-1">
      <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-400/25">
        A szüneteltetéssel <strong>a gyülekezet minden funkciója leáll</strong>, amíg újra nem
        aktiválod. A lelkészek a leállítást a belépéskor látják.
      </div>
      <ModalField label="Indok (a lelkész számára megjelenhet)">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Pl. lejárt előfizetés, egyeztetés alatt…"
          rows={3}
          disabled={isPending}
        />
      </ModalField>
      <div className="-mx-6 flex justify-end gap-2 border-t border-border px-6 pt-3">
        <Button variant="outline" onClick={onDone} disabled={isPending}>Mégse</Button>
        <Button variant="destructive" onClick={handleSuspend} disabled={isPending} className="gap-2">
          <PauseCircle className="size-4" />
          {isPending ? 'Leállítás…' : 'Szüneteltetés'}
        </Button>
      </div>
    </div>
  )
}

// ─── Díj + felár szerkesztő (sáv-javaslattal) ────────────────────────────
function PricingView({
  congregation,
  fullSub,
  tiers,
  onDone,
}: {
  congregation: CongregationWithAccess
  fullSub: CongregationSubscription | null
  tiers: SystemPricingTier[]
  onDone: () => void
}) {
  const sub = congregation.subscription
  const [form, setForm] = useState({
    tipus: (sub?.tipus || 'havi') as SubscriptionType,
    pricing_tier_id: (sub?.pricing_tier_id ?? undefined) as number | undefined,
    dij_ron: (sub?.dij_ron ?? undefined) as number | undefined,
    felar_ron: (sub?.felar_ron ?? undefined) as number | undefined,
    felar_leiras: fullSub?.felar_leiras ?? '',
    // A kezdő dátumot a teljes sorból vesszük, hogy mentéskor ne írjuk felül.
    kezdet: fullSub?.kezdet || new Date().toISOString().slice(0, 10),
    veg: (sub?.veg ?? fullSub?.veg) || '',
    megjegyzes: fullSub?.megjegyzes ?? '',
  })
  const [isPending, startTransition] = useTransition()
  const [suggestBusy, setSuggestBusy] = useState(false)

  function applySuggestion() {
    setSuggestBusy(true)
    void suggestPricingTierForCongregation(congregation.id).then((r) => {
      setSuggestBusy(false)
      if (r.error) { toast.error(r.error); return }
      const tier = r.data?.tier
      if (!tier) {
        toast.info('Nincs a tag-számhoz illő aktív gyülekezeti sáv.')
        return
      }
      setForm((f) => ({ ...f, pricing_tier_id: tier.id, dij_ron: undefined }))
      toast.success(`Javasolt sáv: ${tier.nev}`)
    })
  }

  function handleSave() {
    startTransition(async () => {
      const res = await upsertCongregationSubscription({
        id: sub?.id,
        congregation_id: congregation.id,
        pricing_tier_id: form.pricing_tier_id ? Number(form.pricing_tier_id) : null,
        tipus: form.tipus,
        dij_ron: form.dij_ron != null && String(form.dij_ron) !== '' ? Number(form.dij_ron) : null,
        felar_ron: form.felar_ron != null && String(form.felar_ron) !== '' ? Number(form.felar_ron) : null,
        felar_leiras: form.felar_leiras.trim() || null,
        kezdet: form.kezdet,
        veg: form.veg || null,
        megjegyzes: form.megjegyzes.trim() || null,
      })
      if (res.error) toast.error(res.error)
      else {
        toast.success('Díj mentve.')
        onDone()
      }
    })
  }

  const activeTiers = tiers.filter((t) => t.aktiv)
  const unit = dijUnit(form.tipus)

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground ring-1 ring-border">
        <span className="flex items-center gap-1.5">
          <Info className="size-3.5 text-primary" />
          Tag-szám: <strong className="text-foreground">{congregation.tag_szam}</strong>
        </span>
        <Button size="sm" variant="ghost" onClick={applySuggestion} disabled={suggestBusy} className="min-h-9 gap-1.5">
          <Sparkles className="size-3.5" />
          {suggestBusy ? 'Keresés…' : 'Javasolt sáv'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModalField label="Árazási sáv">
          <select
            value={form.pricing_tier_id ?? ''}
            onChange={(e) => setForm({ ...form, pricing_tier_id: e.target.value ? Number(e.target.value) : undefined })}
            className={`${SELECT_CLASS} w-full`}
          >
            <option value="">— nincs (egyedi díj) —</option>
            {activeTiers.map((t) => (
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

      <ModalField label={`Egyedi díj (${unit}) — opcionális, felülírja a sáv szerintit`}>
        <Input
          type="number" step="0.01"
          value={form.dij_ron ?? ''}
          onChange={(e) => setForm({ ...form, dij_ron: e.target.value ? Number(e.target.value) : undefined })}
          placeholder={form.tipus === 'eves' ? 'Pl. 600 (egész évre)' : 'Pl. 50'}
        />
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Havi típusnál a havi díjat, <strong>éves típusnál az ÉVES összeget</strong> add meg.
        </p>
      </ModalField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModalField label="Speciális felár (RON/hó)">
          <Input
            type="number" step="0.01"
            value={form.felar_ron ?? ''}
            onChange={(e) => setForm({ ...form, felar_ron: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Pl. 10"
          />
        </ModalField>
        <ModalField label="Felár leírása">
          <Input
            value={form.felar_leiras}
            onChange={(e) => setForm({ ...form, felar_leiras: e.target.value })}
            placeholder="Pl. extra tárhely"
          />
        </ModalField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModalField label="Kezdet">
          <Input type="date" value={form.kezdet} onChange={(e) => setForm({ ...form, kezdet: e.target.value })} />
        </ModalField>
        <ModalField label="Vég (opcionális)">
          <Input type="date" value={form.veg || ''} onChange={(e) => setForm({ ...form, veg: e.target.value })} />
        </ModalField>
      </div>

      <ModalField label="Megjegyzés">
        <Input value={form.megjegyzes} onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })} />
      </ModalField>

      <div className="-mx-6 flex justify-end gap-2 border-t border-border px-6 pt-3">
        <Button variant="outline" onClick={onDone} disabled={isPending}>Mégse</Button>
        <Button onClick={handleSave} disabled={isPending} className="rounded-xl">
          {isPending ? 'Mentés…' : 'Mentés'}
        </Button>
      </div>
    </div>
  )
}

// ─── Gyors bevétel (egyszeri kifizetés / adomány) ────────────────────────
const QUICK_INCOME_CATEGORIES: { value: IncomeCategory; label: string }[] = [
  { value: 'egyszeri', label: 'Egyszeri kifizetés' },
  { value: 'adomany', label: 'Adomány' },
  { value: 'elofizetes', label: 'Előfizetési díj' },
  { value: 'felar', label: 'Felár' },
]

function IncomeView({
  congregation,
  onDone,
}: {
  congregation: CongregationWithAccess
  onDone: () => void
}) {
  const [form, setForm] = useState({
    kategoria: 'egyszeri' as IncomeCategory,
    osszeg: '' as string,
    penznem: 'RON' as Currency,
    datum: new Date().toISOString().slice(0, 10),
    megnevezes: '',
  })
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const osszeg = Number(form.osszeg)
    if (!Number.isFinite(osszeg) || osszeg <= 0) {
      toast.error('Adj meg érvényes összeget.')
      return
    }
    startTransition(async () => {
      const res = await upsertSystemIncome({
        congregation_id: congregation.id,
        kategoria: form.kategoria,
        osszeg,
        penznem: form.penznem,
        datum: form.datum,
        megnevezes: form.megnevezes.trim() || null,
      })
      if (res.error) toast.error(res.error)
      else {
        toast.success('Bevétel rögzítve.')
        onDone()
      }
    })
  }

  return (
    <div className="space-y-3 py-1">
      <p className="text-xs text-muted-foreground">
        A bevétel a(z) <strong className="text-foreground">{congregation.name}</strong> gyülekezethez
        kötve kerül a könyvelésbe. A nem-lej összegeket a rendszer a napi árfolyammal átszámolja RON-ra.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModalField label="Kategória">
          <select
            value={form.kategoria}
            onChange={(e) => setForm({ ...form, kategoria: e.target.value as IncomeCategory })}
            className={`${SELECT_CLASS} w-full`}
          >
            {QUICK_INCOME_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </ModalField>
        <ModalField label="Dátum">
          <Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} />
        </ModalField>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModalField label="Összeg">
          <Input
            type="number" step="0.01"
            value={form.osszeg}
            onChange={(e) => setForm({ ...form, osszeg: e.target.value })}
            placeholder="Pl. 120"
            autoFocus
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
      <ModalField label="Megnevezés (opcionális)">
        <Input
          value={form.megnevezes}
          onChange={(e) => setForm({ ...form, megnevezes: e.target.value })}
          placeholder="Pl. 2026. évi díj készpénzben"
        />
      </ModalField>
      <div className="-mx-6 flex justify-end gap-2 border-t border-border px-6 pt-3">
        <Button variant="outline" onClick={onDone} disabled={isPending}>Mégse</Button>
        <Button onClick={handleSave} disabled={isPending} className="rounded-xl">
          {isPending ? 'Rögzítés…' : 'Rögzítés'}
        </Button>
      </div>
    </div>
  )
}
