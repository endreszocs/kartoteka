'use client'

/**
 * Felhasználó-kártya a rács-nézethez (2026-07-11 admin-redesign).
 *
 * Token-first: a slate/indigo hardkód helyett szemantikus tokenek; a VÁRAKOZÓ
 * állapot amber (teendő), nem piros (a piros az elutasításé/törlésé maradt).
 * Az avatar egységesen téma-gradientes (a lista-nézettel azonos — korábban a
 * két nézet ellentmondó színt adott ugyanannak a felhasználónak).
 * Mobil-first: az akciógombok 375px-en a fejléc alá törnek, nem lógnak ki.
 */

import { useState } from 'react'
import {
  Building2,
  CalendarClock,
  Castle,
  Church,
  Clock,
  Eye,
  FileText,
  Trash2,
  UserCheck,
} from 'lucide-react'

import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS, type ProfileRoleRow, type ProfileRoleType } from '@/lib/profile-roles/types'
import type { UserWithScope } from '@/app/(dashboard)/admin/actions'

import { PendingUserActions } from './pending-user-actions'
import { RoleAssignPopover, type QuickOption } from './role-assign-popover'
import { RoleBadgeInline } from './role-badge-inline'
import { RolePermissionsDialog } from './role-permissions-dialog'
import { AVATAR_GRADIENT, formatRelativeTime, getInitials, getUserStatusMeta } from './user-visuals'

interface UserCardProps {
  user: UserWithScope
  roles: ProfileRoleRow[]
  scopeNameMap: Map<string, string>
  quickOptions: QuickOption[]
  isPending: boolean
  onQuickAssign: (option: QuickOption) => void
  /** Egyedi szerep + indoklás dialóg (a választón belüli "Részletes (egyedi szerep)" linkről hívva). */
  onAdvanced: () => void
  onRevokeRole: (row: ProfileRoleRow) => void
  /** A kétlépéses aktiváló wizard megnyitása (pending fiók fő akciója). */
  onElbiral: () => void
  onReject: () => void
  onDelete: () => void
  /** A regisztrációhoz feltöltött dokumentum megnyitása (signed URL). */
  onViewDocument?: (path: string) => void
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
  onElbiral,
  onReject,
  onDelete,
  onViewDocument,
}: UserCardProps) {
  // Funkciók modal — a "Funkciók" gomb a user szerepköreinek jogosultságait
  // mutatja meg modul × akció bontásban (mit lát, mit írhat, mit szerkeszthet,
  // mihez nem fér hozzá).
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const isActive = user.status === 'active'
  const isUserPending = user.status === 'pending'
  const isRejected = user.status === 'rejected'
  const isDeleted = user.status === 'deleted'

  const statusMeta = getUserStatusMeta(user.status)

  // A várakozó (teendő) kártya finom amber kiemelést kap.
  const cardEmphasis = isUserPending
    ? 'bg-amber-50/50 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900'
    : ''

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
      className={`card-raised relative ${statusMeta.accent} ${cardEmphasis} p-4 transition-shadow hover:shadow-md sm:p-5`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold shadow-md ${
            isUserPending ? 'opacity-80' : ''
          }`}
          style={AVATAR_GRADIENT}
          title={isActive ? 'Aktív felhasználó' : isUserPending ? 'Várakozó felhasználó' : undefined}
        >
          {getInitials(user.full_name, user.email)}
        </div>
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-foreground">
              {user.full_name || '(nincs név)'}
            </p>
            <StatusBadge intent={statusMeta.intent} dot>
              {statusMeta.label}
            </StatusBadge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          {user.created_at && (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              Regisztrált: {new Date(user.created_at).toLocaleString('hu-HU')}
            </p>
          )}
          <p
            className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70"
            title={
              user.lastActiveAt
                ? `Utoljára aktív: ${new Date(user.lastActiveAt).toLocaleString('hu-HU')}`
                : 'A felhasználó még egyszer sem lépett be'
            }
          >
            <CalendarClock className="size-3 shrink-0" aria-hidden />
            Utoljára aktív: {formatRelativeTime(user.lastActiveAt)}
          </p>
        </div>

        {/* Akció-oszlop — mobilon (375px) a fejléc alá törik teljes szélességben,
            sm-től jobbra igazított oszlop. */}
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-col sm:items-end">
          {!isRejected && !isDeleted && (
            <RoleAssignPopover
              quickOptions={quickOptions}
              activeKeys={activeKeys}
              showActivationBanner={isUserPending}
              onAssign={onQuickAssign}
              onAdvanced={onAdvanced}
            />
          )}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPermissionsOpen(true)}
              disabled={isPending}
              className="min-h-9 gap-1"
              title="Mit lát és mit tehet a felhasználó a szerepkörei alapján"
            >
              <Eye className="size-3.5" />
              Funkciók
            </Button>
            {!isDeleted && (
              <Button
                size="sm"
                variant="destructive"
                onClick={onDelete}
                disabled={isPending}
                className="min-h-9 gap-1"
              >
                <Trash2 className="size-3.5" />
                Törlés
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Várakozó fiók banner — a kártya közepén kiemelve. A regisztrációs kérelem
          KONTEXTUSA is itt látszik (gyülekezet, szerep, dokumentum), hogy a
          jóváhagyás + aktiválás EGY helyen történjen, és semmi ne felejtődjön el. */}
      {isUserPending && (
        <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          {user.pendingRequest && (
            <div className="rounded-lg border border-amber-200 bg-card/70 p-3 dark:border-amber-900">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="size-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Regisztrációs kérelem
                </p>
                {user.pendingRequest.requestedAt && (
                  <span className="ml-auto text-[11px] text-amber-800/70 dark:text-amber-300/70">
                    {new Date(user.pendingRequest.requestedAt).toLocaleDateString('hu-HU')}
                  </span>
                )}
              </div>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                <RequestField
                  icon={<UserCheck className="size-3.5 text-amber-600 dark:text-amber-400" />}
                  label="Kért szerepkör"
                  value={
                    user.pendingRequest.requestedRole
                      ? ROLE_LABELS[user.pendingRequest.requestedRole as ProfileRoleType] ||
                        user.pendingRequest.requestedRole
                      : null
                  }
                />
                <RequestField
                  icon={<Church className="size-3.5 text-muted-foreground" />}
                  label="Gyülekezet"
                  value={user.pendingRequest.requestedCongregationName}
                />
                <RequestField
                  icon={<Building2 className="size-3.5 text-muted-foreground" />}
                  label="Egyházmegye"
                  value={user.pendingRequest.requestedDioceseName}
                />
                <RequestField
                  icon={<Castle className="size-3.5 text-muted-foreground" />}
                  label="Egyházkerület"
                  value={user.pendingRequest.requestedDistrictName}
                />
              </div>
              {user.pendingRequest.justification && (
                <p className="mt-2 rounded-md bg-amber-100/60 px-2.5 py-1.5 text-xs italic text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                  „{user.pendingRequest.justification}”
                </p>
              )}
              {user.pendingRequest.documentPath && onViewDocument && (
                <button
                  type="button"
                  onClick={() => onViewDocument(user.pendingRequest!.documentPath!)}
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-amber-900 underline hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
                >
                  <FileText className="size-3.5" />
                  Csatolt dokumentum megtekintése
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold">
                {user.pendingRequest ? 'Kérelem elbírálása:' : 'Várakozó fiók — elbírálás:'}
              </p>
            </div>
            <PendingUserActions
              isPending={isPending}
              onElbiral={onElbiral}
              onReject={onReject}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
            Az <strong>Elbírálás</strong> kétlépéses: előbb a{' '}
            {user.pendingRequest ? 'kérelem' : 'profil'} áttekintése, majd aktiválás és
            szerepkör-kiosztás <strong>egy lépésben</strong> — a felhasználó utána azonnal beléphet.
          </p>
        </div>
      )}

      {(user.primary_district_name ||
        user.primary_diocese_name ||
        user.primary_congregation_name ||
        roles.length > 0) && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {(user.primary_district_name ||
            user.primary_diocese_name ||
            user.primary_congregation_name) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {user.primary_district_name && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground ring-1 ring-border">
                  <Castle className="size-3" />
                  {user.primary_district_name}
                </span>
              )}
              {user.primary_diocese_name && (
                <>
                  {user.primary_district_name && (
                    <span className="text-muted-foreground/50">›</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground ring-1 ring-border">
                    <Building2 className="size-3" />
                    {user.primary_diocese_name}
                  </span>
                </>
              )}
              {user.primary_congregation_name && (
                <>
                  {(user.primary_district_name || user.primary_diocese_name) && (
                    <span className="text-muted-foreground/50">›</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-foreground ring-1 ring-primary/20">
                    <Church className="size-3" />
                    {user.primary_congregation_name}
                  </span>
                </>
              )}
            </div>
          )}

          {roles.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  Kiosztott szerepkörök ({roles.length})
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <RoleBadgeInline
                    key={r.id}
                    row={r}
                    scopeName={r.scope_id ? scopeNameMap.get(r.scope_id) || '—' : ''}
                    onRevoke={() => onRevokeRole(r)}
                  />
                ))}
              </div>
            </div>
          ) : (
            isActive && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground">
                Még nincs szerepköre — a „+ Új szerepkör” gombbal oszthat ki egyet.
              </div>
            )
          )}
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

/** Egy sor a regisztrációs kérelem kontextusából (ikon + címke + érték). */
function RequestField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block text-xs font-medium text-foreground">
          {value || <span className="italic text-muted-foreground/70">nincs megadva</span>}
        </span>
      </span>
    </div>
  )
}
