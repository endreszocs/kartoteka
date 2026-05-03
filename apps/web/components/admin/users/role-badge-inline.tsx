'use client'

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

// Szerep-szerinti gradient + szöveg-szín. Erős vizuális kategorizálás:
// - rendszergazda → slate-dark (technikai)
// - kerületi admin → violet (vezetői)
// - esperes/megyei → indigo (egyházmegyei)
// - lelkész → emerald (gyülekezeti, leggyakoribb)
// - könyvelő → amber (pénzügyi)
// - számvevő → cyan (audit)
// - egyedi → fuchsia
const ROLE_THEME: Record<
  ProfileRoleType,
  { gradient: string; iconBg: string; iconColor: string; text: string; border: string }
> = {
  admin: {
    gradient: 'from-slate-700 to-slate-900',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-700',
    text: 'text-slate-50',
    border: 'border-slate-700',
  },
  egyhazkeruleti_admin: {
    gradient: 'from-violet-600 to-purple-700',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-700',
    text: 'text-white',
    border: 'border-violet-600',
  },
  egyhazmegyei_admin: {
    gradient: 'from-indigo-500 to-blue-600',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-700',
    text: 'text-white',
    border: 'border-indigo-500',
  },
  esperes: {
    gradient: 'from-indigo-600 to-violet-600',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-700',
    text: 'text-white',
    border: 'border-indigo-600',
  },
  egyhazmegyei_szamvevo: {
    gradient: 'from-cyan-500 to-teal-600',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-700',
    text: 'text-white',
    border: 'border-cyan-500',
  },
  lelkesz: {
    gradient: 'from-emerald-500 to-green-600',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
    text: 'text-white',
    border: 'border-emerald-500',
  },
  konyvelo: {
    gradient: 'from-amber-500 to-orange-500',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
    text: 'text-white',
    border: 'border-amber-500',
  },
  custom: {
    gradient: 'from-fuchsia-500 to-pink-600',
    iconBg: 'bg-fuchsia-100',
    iconColor: 'text-fuchsia-700',
    text: 'text-white',
    border: 'border-fuchsia-500',
  },
}

const STATUS_OVERLAY: Record<ApprovalStatus, string> = {
  pending: 'opacity-70 saturate-50',
  approved: '',
  rejected: 'opacity-50 saturate-0 line-through',
  revoked: 'opacity-50 saturate-0 line-through',
}

const STATUS_ICON: Record<ApprovalStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  approved: Check,
  rejected: XCircle,
  revoked: ShieldOff,
}

const STATUS_TONE: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-white/25 text-white',
  rejected: 'bg-red-100 text-red-800',
  revoked: 'bg-slate-100 text-slate-700',
}

interface RoleBadgeInlineProps {
  row: ProfileRoleRow
  scopeName: string
  onRevoke?: () => void
}

export function RoleBadgeInline({ row, scopeName, onRevoke }: RoleBadgeInlineProps) {
  const ScopeIcon = SCOPE_ICONS[row.scope]
  const RoleIcon = ROLE_ICONS[row.role] || Settings
  const theme = ROLE_THEME[row.role] || ROLE_THEME.custom
  const status = row.approval_status as ApprovalStatus
  const StatusIconComp = STATUS_ICON[status]
  const roleLabel = row.role === 'custom' ? row.custom_label || 'Egyedi szerep' : ROLE_LABELS[row.role]

  return (
    <div
      className={`group relative inline-flex items-center gap-2 rounded-xl border ${theme.border} bg-gradient-to-br ${theme.gradient} px-3 py-1.5 shadow-sm hover:shadow-md transition ${STATUS_OVERLAY[status]}`}
      title={`${roleLabel}${scopeName ? ' — ' + scopeName : ''} (${APPROVAL_STATUS_LABELS[status]})`}
    >
      {/* Bal: szerep-ikon kerek háttéren */}
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${theme.iconBg} ${theme.iconColor}`}>
        <RoleIcon className="size-4" />
      </div>

      {/* Közép: szerep neve + scope */}
      <div className={`flex flex-col leading-tight ${theme.text}`}>
        <span className="text-[12px] font-bold tracking-tight">{roleLabel}</span>
        {scopeName && (
          <span className="text-[10px] font-medium opacity-90 inline-flex items-center gap-1">
            <ScopeIcon className="size-2.5" />
            {scopeName}
          </span>
        )}
      </div>

      {/* Jobb: státusz-chip */}
      <span
        className={`ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_TONE[status]}`}
      >
        <StatusIconComp className="size-2.5" />
        {APPROVAL_STATUS_LABELS[status]}
      </span>

      {/* Visszavonás (csak approved + active esetén, hover-en jelenik meg) */}
      {onRevoke && status === 'approved' && row.active && (
        <button
          type="button"
          onClick={onRevoke}
          className="ml-0.5 -mr-1 size-5 shrink-0 rounded-full bg-white/20 text-white/80 hover:bg-red-500 hover:text-white inline-flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Szerepkör visszavonása"
          aria-label="Szerepkör visszavonása"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
