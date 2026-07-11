'use client'

/**
 * Kiosztott szerepkör jelvénye a felhasználó-kártyán (2026-07-11 redesign).
 *
 * A korábbi szerep-szerinti szivárvány-gradientek helyett token-alapú, téma- és
 * dark-kompatibilis megjelenés: a szerep az IKONJÁRÓL ismerhető fel, a státusz
 * a StatusBadge intent-színeiből. A visszavonó X többé nem hover-only — érintő-
 * képernyőn (tablet) is látható és elérhető, min. 36px-es találati felülettel.
 */

import {
  BookOpenCheck,
  Building2,
  Calculator,
  Castle,
  Check,
  Church,
  Clock,
  Crown,
  Globe,
  Landmark,
  Settings,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  APPROVAL_STATUS_LABELS,
  ROLE_LABELS,
  type ApprovalStatus,
  type ProfileRoleRow,
  type ProfileRoleScope,
  type ProfileRoleType,
} from '@/lib/profile-roles/types'

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Castle,
  diocese: Building2,
  congregation: Church,
}

// Szerep-szerinti ikon — vizuálisan azonnal felismerhető
const ROLE_ICONS: Record<ProfileRoleType, React.ComponentType<{ className?: string }>> = {
  admin: ShieldCheck,
  egyhazkeruleti_admin: Landmark,
  egyhazmegyei_admin: BookOpenCheck,
  esperes: Crown,
  egyhazmegyei_szamvevo: Calculator,
  lelkesz: Church,
  konyvelo: Calculator,
  custom: Sparkles,
}

const STATUS_OVERLAY: Record<ApprovalStatus, string> = {
  pending: 'opacity-80',
  approved: '',
  rejected: 'opacity-60 [&_[data-role-label]]:line-through',
  revoked: 'opacity-60 [&_[data-role-label]]:line-through',
}

const STATUS_ICON: Record<ApprovalStatus, LucideIcon> = {
  pending: Clock,
  approved: Check,
  rejected: XCircle,
  revoked: ShieldOff,
}

const STATUS_INTENT: Record<ApprovalStatus, StatusIntent> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  revoked: 'neutral',
}

interface RoleBadgeInlineProps {
  row: ProfileRoleRow
  scopeName: string
  onRevoke?: () => void
}

export function RoleBadgeInline({ row, scopeName, onRevoke }: RoleBadgeInlineProps) {
  const ScopeIcon = SCOPE_ICONS[row.scope]
  const RoleIcon = ROLE_ICONS[row.role] || Settings
  const status = row.approval_status as ApprovalStatus
  const StatusIconComp = STATUS_ICON[status]
  const roleLabel = row.role === 'custom' ? row.custom_label || 'Egyedi szerep' : ROLE_LABELS[row.role]

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 shadow-sm transition hover:shadow-md ${STATUS_OVERLAY[status]}`}
      title={`${roleLabel}${scopeName ? ' — ' + scopeName : ''} (${APPROVAL_STATUS_LABELS[status]})`}
    >
      {/* Bal: szerep-ikon primary-árnyalatú lapkán */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--primary)]">
        <RoleIcon className="size-4" />
      </div>

      {/* Közép: szerep neve + scope */}
      <div className="flex flex-col leading-tight">
        <span data-role-label className="text-[12px] font-bold tracking-tight text-foreground">
          {roleLabel}
        </span>
        {scopeName && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <ScopeIcon className="size-2.5" />
            {scopeName}
          </span>
        )}
      </div>

      {/* Jobb: státusz-jelvény */}
      <StatusBadge
        intent={STATUS_INTENT[status]}
        icon={StatusIconComp}
        className="ml-0.5 px-1.5 text-[9px] uppercase tracking-wide"
      >
        {APPROVAL_STATUS_LABELS[status]}
      </StatusBadge>

      {/* Visszavonás (csak approved + active esetén) — mindig látható, hogy
          érintőképernyőn is felfedezhető legyen (korábban hover-only volt). */}
      {onRevoke && status === 'approved' && row.active && (
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onRevoke}
          className="-my-1 -mr-1.5 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Szerepkör visszavonása"
          aria-label="Szerepkör visszavonása"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
