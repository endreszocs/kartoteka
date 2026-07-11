'use client'

/**
 * Kompakt LISTA-sor a Felhasználók oldal lista-nézetéhez (2026-07-11 redesign).
 *
 * Token-first + mobil-first: 375px-en a műveletek a név alá törnek (flex-wrap),
 * nem hover-only-k és nem lógnak ki. A státusz-színezés a kártya-nézettel közös
 * forrásból jön (user-visuals) — a várakozó amber (teendő), nem piros. A
 * szerepkör-oszlop számlálója title-ben felsorolja a konkrét szerepeket.
 * Egy közös keretes konténerben él (lásd UnifiedUsersTab), zebra-csíkozással.
 */

import { useState } from 'react'
import { Church, Eye, FileText, Trash2 } from 'lucide-react'

import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS, type ProfileRoleRow, type ProfileRoleType } from '@/lib/profile-roles/types'
import type { UserWithScope } from '@/app/(dashboard)/admin/actions'

import { PendingUserActions } from './pending-user-actions'
import { RoleAssignPopover, type QuickOption } from './role-assign-popover'
import { RolePermissionsDialog } from './role-permissions-dialog'
import { AVATAR_GRADIENT, getInitials, getUserStatusMeta } from './user-visuals'

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
  const [permissionsOpen, setPermissionsOpen] = useState(false)

  const isUserPending = user.status === 'pending'
  const isRejected = user.status === 'rejected'
  const isDeleted = user.status === 'deleted'

  const statusMeta = getUserStatusMeta(user.status)

  // A VÁRAKOZÓ (teendő) sorok amber háttér-árnyalattal kiemelve (a zebra fölött
  // — az `!` azért kell, mert a szülő zebra-szelektora erősebb specificitású).
  const rowBg = isUserPending
    ? '!bg-amber-50/70 hover:!bg-amber-100/60 dark:!bg-amber-950/25 dark:hover:!bg-amber-950/40'
    : 'hover:bg-muted/50'

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

  const activeRoles = roles.filter((r) => r.approval_status === 'approved' && r.active)
  const activeRoleCount = activeRoles.length
  // A "N szerep" számláló tooltipje felsorolja, MELYIK szerepekről van szó.
  const roleSummary = activeRoles
    .map((r) => {
      const lbl = r.role === 'custom' ? r.custom_label || 'Egyedi' : ROLE_LABELS[r.role]
      const scopeName = r.scope_id ? scopeNameMap.get(r.scope_id) || '' : ''
      return scopeName ? `${lbl} — ${scopeName}` : lbl
    })
    .join('\n')

  return (
    <div className={`relative ${statusMeta.accent} ${rowBg} px-3 py-2.5 transition-colors`}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Avatar — a kártya-nézettel azonos téma-gradient */}
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-sm ${
            isUserPending ? 'opacity-85' : ''
          }`}
          style={AVATAR_GRADIENT}
        >
          {getInitials(user.full_name, user.email)}
        </div>

        {/* Felhasználó: név + email */}
        <div className="min-w-0 flex-1 basis-36">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.full_name || '(nincs név)'}
            </p>
            <StatusBadge intent={statusMeta.intent} dot className="text-[10px]">
              {statusMeta.label}
            </StatusBadge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>

        {/* Hely (gyülekezet) — balra igazítva, fix sávban (md-től) */}
        <div className="hidden w-[15rem] shrink-0 md:block">
          {user.primary_congregation_name ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs text-foreground ring-1 ring-primary/15">
              <Church className="size-3 shrink-0" />
              <span className="truncate">{user.primary_congregation_name}</span>
            </span>
          ) : (
            <span className="text-xs italic text-muted-foreground/50">—</span>
          )}
        </div>

        {/* Szerep-szám — fix sávban (lg-től), tooltippel */}
        <div className="hidden w-[5.5rem] shrink-0 lg:block">
          {activeRoleCount > 0 ? (
            <span
              className="cursor-help rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border"
              title={roleSummary}
            >
              {activeRoleCount} szerep
            </span>
          ) : (
            <span className="text-xs italic text-muted-foreground/50">—</span>
          )}
        </div>

        {/* Műveletek — mobilon a sor aljára törik (flex-wrap), nem hover-only */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!isRejected && !isDeleted && (
            <RoleAssignPopover
              quickOptions={quickOptions}
              activeKeys={activeKeys}
              showActivationBanner={isUserPending}
              onAssign={onQuickAssign}
              onAdvanced={onAdvanced}
            />
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPermissionsOpen(true)}
            disabled={isPending}
            className="min-h-9 gap-1"
            title="Mit lát és mit tehet a felhasználó"
          >
            <Eye className="size-3.5" />
            <span className="hidden lg:inline">Funkciók</span>
            <span className="sr-only lg:hidden">Funkciók</span>
          </Button>
          {!isDeleted && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onDelete}
              disabled={isPending}
              className="min-h-9 min-w-9 gap-1"
              title="Felhasználó törlése"
            >
              <Trash2 className="size-3.5" />
              <span className="sr-only">Felhasználó törlése</span>
            </Button>
          )}
        </div>
      </div>

      {/* Várakozó: gyors jóváhagyás + kérelem-összegzés egy sorban */}
      {isUserPending && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-2 dark:border-amber-900 sm:pl-12">
          {user.pendingRequest?.requestedRole && (
            <span className="text-[11px] text-amber-900 dark:text-amber-200">
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
              className="inline-flex min-h-9 items-center gap-1 text-[11px] font-medium text-amber-900 underline hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
            >
              <FileText className="size-3" />
              dokumentum
            </button>
          )}
          <div className="ml-auto">
            <PendingUserActions
              isPending={isPending}
              hasRequest={!!user.pendingRequest}
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
