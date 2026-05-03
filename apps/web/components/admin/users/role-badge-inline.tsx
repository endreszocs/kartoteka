'use client'

import {
  Building2,
  Castle,
  Check,
  Church,
  Clock,
  Globe,
  ShieldOff,
  X,
  XCircle,
} from 'lucide-react'

import {
  APPROVAL_STATUS_LABELS,
  ROLE_LABELS,
  type ApprovalStatus,
  type ProfileRoleRow,
  type ProfileRoleScope,
} from '@/lib/profile-roles/types'

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Castle,
  diocese: Building2,
  congregation: Church,
}

const STATUS_STYLES: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200 line-through opacity-60',
  revoked: 'bg-slate-100 text-slate-500 border-slate-200 line-through opacity-60',
}

const STATUS_ICON: Record<ApprovalStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  approved: Check,
  rejected: XCircle,
  revoked: ShieldOff,
}

interface RoleBadgeInlineProps {
  row: ProfileRoleRow
  scopeName: string
  onRevoke?: () => void
}

export function RoleBadgeInline({ row, scopeName, onRevoke }: RoleBadgeInlineProps) {
  const ScopeIcon = SCOPE_ICONS[row.scope]
  const roleLabel = row.role === 'custom' ? row.custom_label || 'Egyedi' : ROLE_LABELS[row.role]
  const StatusIconComp = STATUS_ICON[row.approval_status as ApprovalStatus]

  return (
    <div
      className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${STATUS_STYLES[row.approval_status as ApprovalStatus]}`}
    >
      <ScopeIcon className="size-3" />
      <span className="font-semibold">{roleLabel}</span>
      {scopeName && <span className="text-[10px] opacity-75">— {scopeName}</span>}
      <span className="ml-1 inline-flex items-center gap-0.5 opacity-70">
        <StatusIconComp className="size-2.5" />
        {APPROVAL_STATUS_LABELS[row.approval_status as ApprovalStatus]}
      </span>
      {onRevoke && row.approval_status === 'approved' && row.active && (
        <button
          type="button"
          onClick={onRevoke}
          className="ml-1 -mr-1 size-4 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-700 inline-flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Visszavonás"
          aria-label="Szerepkör visszavonása"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
