'use client'

/**
 * Admin → Rendszer pénzügyei: KÖZÖS segéd-elemek az előfizetési + könyvelési
 * felülethez (2026-07-11 előfizetési rendszer).
 *
 * Itt élnek a formázók, a token-alapú select-osztály, a címke-térképek és a
 * megosztott sor-műveletek (asztali ikon-gombok + mobil kártya-gombok), hogy a
 * fő fül és az al-komponensek egységesek maradjanak.
 */

import { Edit2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { StatusIntent } from '../_shared/status-badge'
import type {
  CostCategory,
  PricingTierType,
  SubscriptionAccessStatus,
  SubscriptionType,
} from '@/app/(dashboard)/admin/system-finance-actions'
import type { IncomeCategory } from '@/app/(dashboard)/admin/system-finance-income-actions'

// ─────────────────────────────────────────────────────────────────────────
// Token-alapú natív select (a dialógusokban/szűrőkben) — szélesség nélkül.
// ─────────────────────────────────────────────────────────────────────────
export const SELECT_CLASS =
  'h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

// ─────────────────────────────────────────────────────────────────────────
// Pénznemek — a bevétel-könyveléshez (RON az alap, a többit RON-ra konvertáljuk).
// ─────────────────────────────────────────────────────────────────────────
export const CURRENCIES = ['RON', 'EUR', 'HUF', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]

// ─────────────────────────────────────────────────────────────────────────
// Formázók
// ─────────────────────────────────────────────────────────────────────────
export function formatRon(v: number): string {
  return v.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatMoney(v: number, currency: string): string {
  return `${formatRon(v)} ${currency}`
}

export function formatDateHu(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('hu-HU')
}

/**
 * A dij_ron mező egysége az előfizetés-típustól függ (system-finance-actions:
 * 'havi' → RON/hó, 'eves' → RON/év) — a felületen mindenhol jelezzük,
 * különben 12x-es félreárazás lehet belőle.
 */
export function dijUnit(tipus: SubscriptionType): string {
  if (tipus === 'havi') return 'RON/hó'
  if (tipus === 'eves') return 'RON/év'
  return 'RON'
}

// ─────────────────────────────────────────────────────────────────────────
// Címke-térképek
// ─────────────────────────────────────────────────────────────────────────
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
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

export const PRICING_TIER_TYPE_LABELS: Record<PricingTierType, string> = {
  gyulekezet: 'Gyülekezeti',
  egyhazmegye: 'Egyházmegyei',
  teszt: 'Teszt (ingyen)',
  kedvezmeny: 'Kedvezményes',
}

export const SUBSCRIPTION_TYPE_LABELS: Record<SubscriptionType, string> = {
  havi: 'Havi',
  eves: 'Éves',
  teszt: 'Teszt',
  kedvezmeny: 'Kedvezményes',
  ingyenes: 'Ingyenes',
}

export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  elofizetes: 'Előfizetés',
  egyszeri: 'Egyszeri',
  adomany: 'Adomány',
  felar: 'Felár',
  egyeb: 'Egyéb',
}

export const INCOME_CATEGORY_INTENT: Record<IncomeCategory, StatusIntent> = {
  elofizetes: 'success',
  egyszeri: 'info',
  adomany: 'info',
  felar: 'warning',
  egyeb: 'neutral',
}

// ─────────────────────────────────────────────────────────────────────────
// Hozzáférés-státusz (access_status) — címke + intent + rövid következmény.
// A 'none' szintetikus érték: nincs előfizetési rekord (biztonságos default).
// ─────────────────────────────────────────────────────────────────────────
export type AccessStatusView = SubscriptionAccessStatus | 'none'

export const ACCESS_STATUS_LABELS: Record<AccessStatusView, string> = {
  active: 'Aktív',
  trial: 'Teszt-időszak',
  free: 'Ingyenes',
  grace: 'Türelmi idő',
  suspended: 'Szüneteltetve',
  none: 'Nincs előfizetés',
}

export function accessStatusIntent(status: AccessStatusView): StatusIntent {
  switch (status) {
    case 'active':
      return 'success'
    case 'trial':
      return 'info'
    case 'grace':
      return 'warning'
    case 'suspended':
      return 'danger'
    case 'free':
    case 'none':
    default:
      return 'neutral'
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sor-műveletek (asztali ikon-gombok + mobil kártya-gombok)
// ─────────────────────────────────────────────────────────────────────────
export function RowActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string
  onEdit: () => void
  onDelete: () => void
}) {
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

export function MobileCardActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string
  onEdit: () => void
  onDelete: () => void
}) {
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
