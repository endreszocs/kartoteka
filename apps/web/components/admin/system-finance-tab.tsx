'use client'

/**
 * Admin → Rendszer pénzügyei fül.
 *
 * Ez a nézet a rendszer pénzügyi áttekintését mutatja a rendszergazdának (Endre):
 *   1. KPI panel — havi bevétel, költség, profit, aktív előfizetések, tag-szám átlag
 *   2. Havi költségtételek táblázat (szerkeszthető) — Supabase, Railway, Email-szolgáltató, AI szerver, stb.
 *   3. Árazási sávok táblázat (szerkeszthető) — tag-szám szerint, Endre alapelve szerint
 *   4. Gyülekezet előfizetések (szerkeszthető) — ki fizet mennyit
 *   5. Skálázási előrejelzés — 25/50/100/200/500/1000 gyülekezet szcenáriók
 *
 * Jogosultság: csak `admin` (rendszergazda/master) láthatja — a szerver akciók is ellenőrzik.
 */

import { useEffect, useState, useTransition } from 'react'
import {
  Banknote, TrendingUp, TrendingDown, Users, Building2, Plus, Edit2,
  Trash2, CheckCircle2, XCircle, Info, Settings, BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
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

// ─────────────────────────────────────────────────────────────────────────
export function SystemFinanceTab() {
  const [summary, setSummary] = useState<SystemFinanceSummary | null>(null)
  const [costs, setCosts] = useState<SystemFinanceCost[]>([])
  const [tiers, setTiers] = useState<SystemPricingTier[]>([])
  const [subs, setSubs] = useState<CongregationSubscription[]>([])
  const [forecast, setForecast] = useState<ScalingScenario[]>([])
  const [loading, setLoading] = useState(true)

  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [costEditing, setCostEditing] = useState<SystemFinanceCost | null>(null)
  const [tierDialogOpen, setTierDialogOpen] = useState(false)
  const [tierEditing, setTierEditing] = useState<SystemPricingTier | null>(null)
  const [subDialogOpen, setSubDialogOpen] = useState(false)
  const [subEditing, setSubEditing] = useState<CongregationSubscription | null>(null)

  async function refreshAll() {
    setLoading(true)
    const [summaryRes, costsRes, tiersRes, subsRes, forecastRes] = await Promise.all([
      getSystemFinanceSummary(),
      listSystemCosts(),
      listPricingTiers(),
      listCongregationSubscriptions(),
      getScalingForecast(),
    ])
    if (summaryRes.error) toast.error(`Összegző: ${summaryRes.error}`)
    else if (summaryRes.data) setSummary(summaryRes.data)
    if (costsRes.data) setCosts(costsRes.data)
    if (tiersRes.data) setTiers(tiersRes.data)
    if (subsRes.data) setSubs(subsRes.data)
    if (forecastRes.data) setForecast(forecastRes.data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refreshAll()
    })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">Rendszer pénzügyei betöltése…</div>
  }

  return (
    <div className="space-y-6">
      {/* ─── 1. KPI PANEL ─── */}
      {summary && <KpiPanel summary={summary} />}

      {/* ─── 2. HAVI KÖLTSÉGTÉTELEK ─── */}
      <section className="card-raised p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Banknote className="size-5 text-rose-600" />
            <h3 className="font-heading text-lg text-slate-800">Havi rendszer-költségek</h3>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setCostEditing(null)
              setCostDialogOpen(true)
            }}
            className="rounded-xl bg-rose-600 text-white hover:bg-rose-700 gap-1.5"
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
          onDelete={async (id) => {
            if (!confirm('Biztosan törölni szeretnéd ezt a költségtételt?')) return
            const res = await deleteSystemCost(id)
            if (res.error) toast.error(res.error)
            else {
              toast.success('Törölve.')
              refreshAll()
            }
          }}
        />
      </section>

      {/* ─── 3. ÁRAZÁSI SÁVOK ─── */}
      <section className="card-raised p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-teal-600" />
            <h3 className="font-heading text-lg text-slate-800">Árazási sávok — tag-szám szerint</h3>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setTierEditing(null)
              setTierDialogOpen(true)
            }}
            className="rounded-xl bg-teal-600 text-white hover:bg-teal-700 gap-1.5"
          >
            <Plus className="size-4" />
            Új sáv
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          <Info className="inline size-3.5 mr-1 text-teal-600" />
          Endre alapelve: <strong>képesség szerinti elosztás</strong> — kis gyülekezet kevesebbet, nagy gyülekezet többet fizet.
        </p>
        <TierTable
          tiers={tiers}
          onEdit={(t) => {
            setTierEditing(t)
            setTierDialogOpen(true)
          }}
          onDelete={async (id) => {
            if (!confirm('Biztosan törölni szeretnéd ezt az árazási sávot?')) return
            const res = await deletePricingTier(id)
            if (res.error) toast.error(res.error)
            else {
              toast.success('Törölve.')
              refreshAll()
            }
          }}
        />
      </section>

      {/* ─── 4. GYÜLEKEZETI ELŐFIZETÉSEK ─── */}
      <section className="card-raised p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-indigo-600" />
            <h3 className="font-heading text-lg text-slate-800">Gyülekezeti előfizetések</h3>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSubEditing(null)
              setSubDialogOpen(true)
            }}
            className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 gap-1.5"
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
          onDelete={async (id) => {
            if (!confirm('Biztosan törölni szeretnéd ezt az előfizetést?')) return
            const res = await deleteSubscription(id)
            if (res.error) toast.error(res.error)
            else {
              toast.success('Törölve.')
              refreshAll()
            }
          }}
        />
      </section>

      {/* ─── 5. SKÁLÁZÁSI ELŐREJELZÉS ─── */}
      <section className="card-raised p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-violet-600" />
          <h3 className="font-heading text-lg text-slate-800">Skálázási előrejelzés</h3>
        </div>
        <p className="text-xs text-slate-500">
          <Info className="inline size-3.5 mr-1 text-violet-600" />
          A számítás az aktív árazási sávok átlagdíjával + aktív költségtételekkel (skálázódási felárral) dolgozik.
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
            refreshAll()
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
            refreshAll()
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
            refreshAll()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// KPI Panel
// ─────────────────────────────────────────────────────────────────────────
function KpiPanel({ summary }: { summary: SystemFinanceSummary }) {
  const profitGreen = summary.monthlyProfitRon >= 0
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="Havi bevétel"
        value={`${formatRon(summary.monthlyRevenueRon)} RON`}
        sub={`Éves: ${formatRon(summary.annualRevenueRon)} RON`}
        tone="emerald"
        icon={<TrendingUp className="size-4" />}
      />
      <KpiCard
        label="Havi költség"
        value={`${formatRon(summary.monthlyCostRon)} RON`}
        sub={`Éves: ${formatRon(summary.annualCostRon)} RON`}
        tone="rose"
        icon={<TrendingDown className="size-4" />}
      />
      <KpiCard
        label="Havi profit"
        value={`${formatRon(summary.monthlyProfitRon)} RON`}
        sub={`Éves: ${formatRon(summary.annualProfitRon)} RON`}
        tone={profitGreen ? 'emerald' : 'rose'}
        icon={<Banknote className="size-4" />}
      />
      <KpiCard
        label="Aktív előfizetők"
        value={`${summary.activeSubscriptions} / ${summary.totalCongregations}`}
        sub={`${summary.congregationsWithoutSubscription} előfizetés nélkül`}
        tone="indigo"
        icon={<Users className="size-4" />}
      />
    </div>
  )
}

function KpiCard({ label, value, sub, tone, icon }: {
  label: string; value: string; sub?: string
  tone: 'emerald' | 'rose' | 'indigo'; icon: React.ReactNode
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  }[tone]
  return (
    <div className={`rounded-2xl border px-4 py-3 ${colors}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] opacity-75">{label}</p>
        {icon}
      </div>
      <p className="text-xl font-bold mt-1 font-mono truncate">{value}</p>
      {sub && <p className="text-[11px] mt-1 opacity-75 truncate">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Költségtételek táblázat
// ─────────────────────────────────────────────────────────────────────────
function CostTable({
  costs,
  onEdit,
  onDelete,
}: {
  costs: SystemFinanceCost[]
  onEdit: (c: SystemFinanceCost) => void
  onDelete: (id: number) => void
}) {
  const totalUsd = costs.filter((c) => c.aktiv).reduce((s, c) => s + Number(c.havi_usd), 0)
  const totalRon = costs
    .filter((c) => c.aktiv)
    .reduce((s, c) => s + (Number(c.havi_ron) || Number(c.havi_usd) * Number(c.arfolyam_usd)), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="p-2 text-left font-medium text-slate-600">Kategória</th>
            <th className="p-2 text-left font-medium text-slate-600">Megnevezés</th>
            <th className="p-2 text-right font-medium text-slate-600">Havi USD</th>
            <th className="p-2 text-right font-medium text-slate-600">Árfolyam</th>
            <th className="p-2 text-right font-medium text-slate-600">Havi RON</th>
            <th className="p-2 text-center font-medium text-slate-600">Aktív</th>
            <th className="p-2 text-right font-medium text-slate-600">Művelet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {costs.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">Nincs költségtétel.</td></tr>
          )}
          {costs.map((c) => {
            const ronCalculated = Number(c.havi_ron) || Number(c.havi_usd) * Number(c.arfolyam_usd)
            return (
              <tr key={c.id} className={c.aktiv ? 'hover:bg-slate-50/60' : 'opacity-50 hover:bg-slate-50/60'}>
                <td className="p-2">
                  <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px]">
                    {COST_CATEGORY_LABELS[c.kategoria]}
                  </Badge>
                </td>
                <td className="p-2">
                  <p className="font-medium text-slate-800">{c.nev}</p>
                  {c.megjegyzes && <p className="text-[10px] text-slate-400 truncate max-w-[320px]">{c.megjegyzes}</p>}
                </td>
                <td className="p-2 text-right font-mono">${formatRon(Number(c.havi_usd))}</td>
                <td className="p-2 text-right text-slate-500">{Number(c.arfolyam_usd).toFixed(2)}</td>
                <td className="p-2 text-right font-mono text-rose-700 font-semibold">
                  {formatRon(ronCalculated)}
                </td>
                <td className="p-2 text-center">
                  {c.aktiv ? <CheckCircle2 className="size-4 text-emerald-600 mx-auto" /> : <XCircle className="size-4 text-slate-400 mx-auto" />}
                </td>
                <td className="p-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(c)} className="size-7 p-0">
                      <Edit2 className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(c.id)} className="size-7 p-0 text-rose-600">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
          <tr>
            <td colSpan={2} className="p-2 text-slate-700">Összesen (aktív)</td>
            <td className="p-2 text-right font-mono">${formatRon(totalUsd)}</td>
            <td />
            <td className="p-2 text-right font-mono text-rose-800">{formatRon(totalRon)} RON</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Árazási sávok táblázat
// ─────────────────────────────────────────────────────────────────────────
function TierTable({
  tiers,
  onEdit,
  onDelete,
}: {
  tiers: SystemPricingTier[]
  onEdit: (t: SystemPricingTier) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="p-2 text-left font-medium text-slate-600">Név</th>
            <th className="p-2 text-left font-medium text-slate-600">Típus</th>
            <th className="p-2 text-right font-medium text-slate-600">Tagok min</th>
            <th className="p-2 text-right font-medium text-slate-600">Tagok max</th>
            <th className="p-2 text-right font-medium text-slate-600">Havi RON</th>
            <th className="p-2 text-right font-medium text-slate-600">Éves RON</th>
            <th className="p-2 text-center font-medium text-slate-600">Aktív</th>
            <th className="p-2 text-right font-medium text-slate-600">Művelet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tiers.length === 0 && (
            <tr><td colSpan={8} className="p-6 text-center text-slate-400 italic">Nincs árazási sáv.</td></tr>
          )}
          {tiers.map((t) => (
            <tr key={t.id} className={t.aktiv ? 'hover:bg-slate-50/60' : 'opacity-50 hover:bg-slate-50/60'}>
              <td className="p-2">
                <p className="font-medium text-slate-800">{t.nev}</p>
                {t.megjegyzes && <p className="text-[10px] text-slate-400 truncate max-w-[240px]">{t.megjegyzes}</p>}
              </td>
              <td className="p-2">
                <Badge className="bg-teal-100 text-teal-800 border-0 text-[10px]">
                  {PRICING_TIER_TYPE_LABELS[t.tipus]}
                </Badge>
              </td>
              <td className="p-2 text-right">{t.min_tagok}</td>
              <td className="p-2 text-right">{t.max_tagok ?? '∞'}</td>
              <td className="p-2 text-right font-mono text-emerald-700 font-semibold">{formatRon(Number(t.havi_dij_ron))}</td>
              <td className="p-2 text-right font-mono text-emerald-700">{formatRon(Number(t.eves_dij_ron))}</td>
              <td className="p-2 text-center">
                {t.aktiv ? <CheckCircle2 className="size-4 text-emerald-600 mx-auto" /> : <XCircle className="size-4 text-slate-400 mx-auto" />}
              </td>
              <td className="p-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(t)} className="size-7 p-0">
                    <Edit2 className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(t.id)} className="size-7 p-0 text-rose-600">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Subscription táblázat
// ─────────────────────────────────────────────────────────────────────────
function SubscriptionTable({
  subs,
  onEdit,
  onDelete,
}: {
  subs: CongregationSubscription[]
  onEdit: (s: CongregationSubscription) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="p-2 text-left font-medium text-slate-600">Gyülekezet</th>
            <th className="p-2 text-right font-medium text-slate-600">Tagok</th>
            <th className="p-2 text-left font-medium text-slate-600">Árazási sáv</th>
            <th className="p-2 text-left font-medium text-slate-600">Típus</th>
            <th className="p-2 text-right font-medium text-slate-600">Díj RON</th>
            <th className="p-2 text-left font-medium text-slate-600">Kezdet</th>
            <th className="p-2 text-center font-medium text-slate-600">Aktív</th>
            <th className="p-2 text-right font-medium text-slate-600">Művelet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {subs.length === 0 && (
            <tr><td colSpan={8} className="p-6 text-center text-slate-400 italic">Nincs aktív előfizetés.</td></tr>
          )}
          {subs.map((s) => (
            <tr key={s.id} className={s.aktiv ? 'hover:bg-slate-50/60' : 'opacity-50 hover:bg-slate-50/60'}>
              <td className="p-2">
                <p className="font-medium text-slate-800">{s.congregation_name || s.congregation_id.slice(0, 8)}</p>
                {s.megjegyzes && <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{s.megjegyzes}</p>}
              </td>
              <td className="p-2 text-right font-mono text-slate-600">{s.congregation_tag_szam ?? '?'}</td>
              <td className="p-2">
                <Badge className="bg-teal-50 text-teal-700 border-0 text-[10px]">
                  {s.pricing_tier_nev || '—'}
                </Badge>
              </td>
              <td className="p-2">
                <Badge className="bg-indigo-100 text-indigo-800 border-0 text-[10px]">
                  {SUBSCRIPTION_TYPE_LABELS[s.tipus]}
                </Badge>
              </td>
              <td className="p-2 text-right font-mono">
                {s.dij_ron != null ? formatRon(Number(s.dij_ron)) : '—'}
              </td>
              <td className="p-2 text-slate-500">{s.kezdet}</td>
              <td className="p-2 text-center">
                {s.aktiv ? <CheckCircle2 className="size-4 text-emerald-600 mx-auto" /> : <XCircle className="size-4 text-slate-400 mx-auto" />}
              </td>
              <td className="p-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(s)} className="size-7 p-0">
                    <Edit2 className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)} className="size-7 p-0 text-rose-600">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Forecast táblázat
// ─────────────────────────────────────────────────────────────────────────
function ForecastTable({ forecast }: { forecast: ScalingScenario[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="p-2 text-left font-medium text-slate-600">Gyülekezet</th>
            <th className="p-2 text-right font-medium text-slate-600">Havi bevétel</th>
            <th className="p-2 text-right font-medium text-slate-600">Havi költség</th>
            <th className="p-2 text-right font-medium text-slate-600">Havi profit</th>
            <th className="p-2 text-right font-medium text-slate-600">Éves profit</th>
            <th className="p-2 text-right font-medium text-slate-600">Margin %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {forecast.map((f) => (
            <tr key={f.gyulekezet_szam} className={f.havi_profit_ron >= 0 ? 'hover:bg-emerald-50/30' : 'hover:bg-rose-50/30'}>
              <td className="p-2 font-semibold">{f.gyulekezet_szam}</td>
              <td className="p-2 text-right font-mono text-emerald-700">{formatRon(f.havi_bevetel_ron)}</td>
              <td className="p-2 text-right font-mono text-rose-600">{formatRon(f.havi_koltseg_ron)}</td>
              <td className={`p-2 text-right font-mono font-semibold ${f.havi_profit_ron >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {f.havi_profit_ron >= 0 ? '+' : ''}{formatRon(f.havi_profit_ron)}
              </td>
              <td className={`p-2 text-right font-mono font-semibold ${f.eves_profit_ron >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {f.eves_profit_ron >= 0 ? '+' : ''}{formatRon(f.eves_profit_ron)}
              </td>
              <td className="p-2 text-right">
                <Badge className={f.profit_margin >= 50 ? 'bg-emerald-100 text-emerald-800' : f.profit_margin >= 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}>
                  {f.profit_margin.toFixed(1)}%
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl border-rose-200">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-slate-800">
            {editing ? 'Költségtétel szerkesztése' : 'Új költségtétel'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <ModalField label="Kategória">
            <select
              value={form.kategoria}
              onChange={(e) => setForm({ ...form, kategoria: e.target.value as CostCategory })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {(Object.keys(COST_CATEGORY_LABELS) as CostCategory[]).map((k) => (
                <option key={k} value={k}>{COST_CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </ModalField>
          <ModalField label="Megnevezés">
            <Input value={form.nev} onChange={(e) => setForm({ ...form, nev: e.target.value })} />
          </ModalField>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
              Aktív
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Sorszám:</span>
              <Input
                type="number"
                className="w-20 h-8"
                value={form.sorszam}
                onChange={(e) => setForm({ ...form, sorszam: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end border-t border-slate-100 pt-3 -mx-6 px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Mégse</Button>
          <Button onClick={handleSave} disabled={isPending} className="rounded-xl bg-rose-600 text-white hover:bg-rose-700">
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
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl border-teal-200">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-slate-800">
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
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {(Object.keys(PRICING_TIER_TYPE_LABELS) as PricingTierType[]).map((k) => (
                <option key={k} value={k}>{PRICING_TIER_TYPE_LABELS[k]}</option>
              ))}
            </select>
          </ModalField>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Havi díj RON">
              <Input
                type="number" step="0.01"
                value={form.havi_dij_ron}
                onChange={(e) => setForm({ ...form, havi_dij_ron: Number(e.target.value) })}
              />
            </ModalField>
            <ModalField label="Éves díj RON">
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
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.aktiv}
                onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
              />
              Aktív
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Sorszám:</span>
              <Input
                type="number"
                className="w-20 h-8"
                value={form.sorszam}
                onChange={(e) => setForm({ ...form, sorszam: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end border-t border-slate-100 pt-3 -mx-6 px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Mégse</Button>
          <Button onClick={handleSave} disabled={isPending} className="rounded-xl bg-teal-600 text-white hover:bg-teal-700">
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(640px,96vw)] rounded-2xl border-indigo-200">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-slate-800">
            {editing ? 'Előfizetés szerkesztése' : 'Új előfizetés'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <ModalField label="Gyülekezet">
            <select
              value={form.congregation_id}
              onChange={(e) => setForm({ ...form, congregation_id: e.target.value })}
              disabled={!!editing}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">— válassz —</option>
              {congregations.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.tag_szam} tag)</option>
              ))}
            </select>
          </ModalField>
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Árazási sáv">
              <select
                value={form.pricing_tier_id ?? ''}
                onChange={(e) => setForm({ ...form, pricing_tier_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {(Object.keys(SUBSCRIPTION_TYPE_LABELS) as SubscriptionType[]).map((k) => (
                  <option key={k} value={k}>{SUBSCRIPTION_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </ModalField>
          </div>
          <ModalField label="Egyedi díj RON (opcionális, felülírja a sáv szerintit)">
            <Input
              type="number" step="0.01"
              value={form.dij_ron ?? ''}
              onChange={(e) => setForm({ ...form, dij_ron: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Pl. 50 RON"
            />
          </ModalField>
          <div className="grid grid-cols-2 gap-3">
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.aktiv}
              onChange={(e) => setForm({ ...form, aktiv: e.target.checked })}
            />
            Aktív
          </label>
        </div>
        <div className="flex gap-2 justify-end border-t border-slate-100 pt-3 -mx-6 px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Mégse</Button>
          <Button onClick={handleSave} disabled={isPending} className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">
            {isPending ? 'Mentés…' : 'Mentés'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
