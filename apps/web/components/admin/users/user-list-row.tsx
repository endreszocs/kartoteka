'use client'

/**
 * Kompakt LISTA-sor a Felhasználók oldal lista-nézetéhez (a kártyás rács-nézet
 * sűrűbb alternatívája). Ugyanazokat a műveleteket kínálja, mint a UserCard, de
 * egy soros, jól skennelhető elrendezésben. A részletes regisztrációs kontextus
 * (dokumentum, indoklás) a rács/kártya-nézetben látszik teljesen.
 */

import { useState } from 'react'
import { Church, Eye, FileText, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ROLE_LABELS, type ProfileRoleRow, type ProfileRoleType } from '@/lib/profile-roles/types'
import type { UserWithScope } from '@/app/(dashboard)/admin/actions'

import { PendingUserActions } from './pending-user-actions'
import { RoleAssignPopover, type QuickOption } from './role-assign-popover'
import { RolePermissionsDialog } from './role-permissions-dialog'

function getInitials(name: string | null, email: string | null): string {
  const source = name || email || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]).join('')
  return letters.toUpperCase() || '?'
}

interface UserListRowProps {
  user: UserWithScope
  roles: ProfileRoleRow[]
  scopeNameMap: Map<string, string>
  quickOptions: QuickOption[]
  isPending: boolean
  onQuickAssign: (option: QuickOption) => void
  onAdvanced: () => void
  onQuickApprove: () => void
  onReject: () => void
  onDelete: () => void
  onViewDocument?: (path: string) => void
}

export function UserListRow({
  user,
  roles,
  scopeNameMap,
  quickOptions,
  isPending,
  onQuickAssign,
  onAdvanced,
  onQuickApprove,
  onReject,
  onDelete,
  onViewDocument,
}: UserListRowProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [permissionsOpen, setPermissionsOpen] = useState(false)

  const isActive = user.status === 'active'
  const isUserPending = user.status === 'pending'
  const isRejected = user.status === 'rejected'
  const isDeleted = user.status === 'deleted'

  const statusChip = isActive
    ? { label: 'Aktív', cls: 'bg-emerald-100 text-emerald-700' }
    : isUserPending
      ? { label: 'Várakozó', cls: 'bg-amber-100 text-amber-700' }
      : isRejected
        ? { label: 'Elutasítva', cls: 'bg-rose-100 text-rose-700' }
        : isDeleted
          ? { label: 'Törölve', cls: 'bg-slate-200 text-slate-500' }
          : { label: user.status || 'Ismeretlen', cls: 'bg-slate-100 text-slate-500' }

  const avatarBg = isActive
    ? 'bg-gradient-to-br from-emerald-500 to-green-600'
    : isUserPending
      ? 'bg-gradient-to-br from-amber-400 to-orange-500'
      : isRejected
        ? 'bg-gradient-to-br from-rose-400 to-rose-600'
        : 'bg-gradient-to-br from-slate-300 to-slate-400'

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

  const activeRoleCount = roles.filter(
    (r) => r.approval_status === 'approved' && r.active,
  ).length

  return (
    <div className={`card-raised px-3 py-2.5 ${popoverOpen ? 'relative z-50' : 'relative'}`}>
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm ${avatarBg} ${isUserPending ? 'opacity-80' : ''}`}
        >
          {getInitials(user.full_name, user.email)}
        </div>

        {/* Név + email */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-800">
              {user.full_name || '(nincs név)'}
            </p>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${statusChip.cls}`}
            >
              {statusChip.label}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>

        {/* Gyülekezet + szerep-szám (csak nagyobb képernyőn) */}
        <div className="hidden items-center gap-2 md:flex">
          {user.primary_congregation_name && (
            <span className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
              <Church className="size-3 shrink-0" />
              <span className="truncate">{user.primary_congregation_name}</span>
            </span>
          )}
          {activeRoleCount > 0 && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">
              {activeRoleCount} szerep
            </span>
          )}
        </div>

        {/* Műveletek */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!isRejected && !isDeleted && (
            <RoleAssignPopover
              quickOptions={quickOptions}
              activeKeys={activeKeys}
              showActivationBanner={isUserPending}
              onAssign={onQuickAssign}
              onAdvanced={onAdvanced}
              onOpenChange={setPopoverOpen}
            />
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPermissionsOpen(true)}
            disabled={isPending}
            className="gap-1"
            title="Mit lát és mit tehet a felhasználó"
          >
            <Eye className="size-3.5" />
            <span className="hidden lg:inline">Funkciók</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            disabled={isPending}
            className="gap-1 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            title="Felhasználó törlése"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Várakozó: gyors jóváhagyás + kérelem-összegzés egy sorban */}
      {isUserPending && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-100 pt-2">
          {user.pendingRequest?.requestedRole && (
            <span className="text-[11px] text-amber-800">
              Kér:{' '}
              <strong>
                {ROLE_LABELS[user.pendingRequest.requestedRole as ProfileRoleType] ||
                  user.pendingRequest.requestedRole}
              </strong>
              {user.pendingRequest.requestedCongregationName
                ? ` · ${user.pendingRequest.requestedCongregationName}`
                : ''}
            </span>
          )}
          {user.pendingRequest?.documentPath && onViewDocument && (
            <button
              type="button"
              onClick={() => onViewDocument(user.pendingRequest!.documentPath!)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 underline hover:text-amber-900"
            >
              <FileText className="size-3" />
              dokumentum
            </button>
          )}
          <div className="ml-auto">
            <PendingUserActions
              isPending={isPending}
              onQuickApprove={onQuickApprove}
              onReject={onReject}
            />
          </div>
        </div>
      )}

      <RolePermissionsDialog
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
        userName={user.full_name || user.email || 'Ismeretlen felhasználó'}
        email={user.email || null}
        roles={roles}
        scopeNameMap={scopeNameMap}
      />
    </div>
  )
}
