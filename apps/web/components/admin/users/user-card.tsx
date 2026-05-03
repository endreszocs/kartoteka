'use client'

import { useState } from 'react'
import { Building2, Castle, Church, Settings2, Trash2, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ProfileRoleRow } from '@/lib/profile-roles/types'
import type { UserWithScope } from '@/app/(dashboard)/admin/actions'

import { PendingUserActions } from './pending-user-actions'
import { RoleAssignPopover, type QuickOption } from './role-assign-popover'
import { RoleBadgeInline } from './role-badge-inline'

interface UserCardProps {
  user: UserWithScope
  roles: ProfileRoleRow[]
  scopeNameMap: Map<string, string>
  quickOptions: QuickOption[]
  isPending: boolean
  onQuickAssign: (option: QuickOption) => void
  onAdvanced: () => void
  onRevokeRole: (row: ProfileRoleRow) => void
  onQuickApprove: () => void
  onDetailedApprove: () => void
  onReject: () => void
  onDelete: () => void
}

export function UserCard({
  user,
  roles,
  scopeNameMap,
  quickOptions,
  isPending,
  onQuickAssign,
  onAdvanced,
  onRevokeRole,
  onQuickApprove,
  onDetailedApprove,
  onReject,
  onDelete,
}: UserCardProps) {
  // A popover open-állapota — ha nyitva van, a card-ot fel kell emelni
  // `relative z-50`-re, különben a DOM-szerint későbbi testvér-card-ok
  // saját stacking context-jeikben felülre renderelődnek.
  const [popoverOpen, setPopoverOpen] = useState(false)
  const isActive = user.status === 'active'
  const isUserPending = user.status === 'pending'
  const isRejected = user.status === 'rejected'

  const statusChip = isActive
    ? { label: 'Aktív', cls: 'bg-emerald-100 text-emerald-700' }
    : isUserPending
      ? { label: 'Várakozó', cls: 'bg-amber-100 text-amber-700' }
      : isRejected
        ? { label: 'Elutasítva', cls: 'bg-rose-100 text-rose-700' }
        : { label: user.status || 'Ismeretlen', cls: 'bg-slate-100 text-slate-500' }

  const activeKeys = new Set<string>(
    roles
      .filter((r) => r.approval_status !== 'revoked' && r.approval_status !== 'rejected')
      .map((r) => {
        const scopePart =
          r.scope === 'system'
            ? 'system'
            : r.scope === 'district'
              ? 'district'
              : r.scope === 'diocese'
                ? 'diocese'
                : 'cong'
        return `${scopePart}::${r.scope_id || ''}::${r.role}`
      }),
  )

  return (
    <div
      className={`card-raised p-4 sm:p-5 ${popoverOpen ? 'relative z-50' : 'relative'}`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Users className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 truncate">
              {user.full_name || '(nincs név)'}
            </p>
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.18em] rounded-full px-2 py-0.5 ${statusChip.cls}`}
            >
              {statusChip.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          {user.created_at && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Regisztrált: {new Date(user.created_at).toLocaleString('hu-HU')}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {isUserPending && (
            <PendingUserActions
              isPending={isPending}
              onQuickApprove={onQuickApprove}
              onDetailedApprove={onDetailedApprove}
              onReject={onReject}
            />
          )}
          {!isRejected && (
            <RoleAssignPopover
              quickOptions={quickOptions}
              activeKeys={activeKeys}
              showActivationBanner={isUserPending}
              onAssign={onQuickAssign}
              onAdvanced={onAdvanced}
              onOpenChange={setPopoverOpen}
            />
          )}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onAdvanced}
              disabled={isPending}
              className="gap-1"
            >
              <Settings2 className="size-3.5" />
              Részletes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={isPending}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 gap-1"
            >
              <Trash2 className="size-3.5" />
              Törlés
            </Button>
          </div>
        </div>
      </div>

      {(user.primary_district_name ||
        user.primary_diocese_name ||
        user.primary_congregation_name ||
        roles.length > 0) && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
          {(user.primary_district_name ||
            user.primary_diocese_name ||
            user.primary_congregation_name) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {user.primary_district_name && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-1">
                  <Castle className="size-3" />
                  {user.primary_district_name}
                </span>
              )}
              {user.primary_diocese_name && (
                <>
                  {user.primary_district_name && <span className="text-slate-300">›</span>}
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 px-2.5 py-1">
                    <Building2 className="size-3" />
                    {user.primary_diocese_name}
                  </span>
                </>
              )}
              {user.primary_congregation_name && (
                <>
                  {(user.primary_district_name || user.primary_diocese_name) && (
                    <span className="text-slate-300">›</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1">
                    <Church className="size-3" />
                    {user.primary_congregation_name}
                  </span>
                </>
              )}
            </div>
          )}

          {roles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 mr-1">
                Szerepkörök:
              </span>
              {roles.map((r) => (
                <RoleBadgeInline
                  key={r.id}
                  row={r}
                  scopeName={r.scope_id ? scopeNameMap.get(r.scope_id) || '—' : ''}
                  onRevoke={() => onRevokeRole(r)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
