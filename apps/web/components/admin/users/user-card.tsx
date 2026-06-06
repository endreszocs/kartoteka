'use client'

import { useState } from 'react'
import { Building2, Castle, Church, Clock, Eye, FileText, Trash2, UserCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ROLE_LABELS, type ProfileRoleRow, type ProfileRoleType } from '@/lib/profile-roles/types'
import type { UserWithScope } from '@/app/(dashboard)/admin/actions'

import { PendingUserActions } from './pending-user-actions'
import { RoleAssignPopover, type QuickOption } from './role-assign-popover'
import { RoleBadgeInline } from './role-badge-inline'
import { RolePermissionsDialog } from './role-permissions-dialog'

// Avatar színe a "legmagasabb" prioritású szerepkör szerint
function pickAvatarTheme(roles: ProfileRoleRow[], primaryRole: string | null) {
  const ROLE_PRIORITY = [
    'admin',
    'egyhazkeruleti_admin',
    'esperes',
    'egyhazmegyei_admin',
    'egyhazmegyei_szamvevo',
    'lelkesz',
    'konyvelo',
  ]
  const activeRoles = new Set([
    ...roles.filter((r) => r.approval_status === 'approved' && r.active).map((r) => r.role),
    ...(primaryRole ? [primaryRole] : []),
  ])
  const top = ROLE_PRIORITY.find((r) => activeRoles.has(r)) || 'lelkesz'
  const themes: Record<string, string> = {
    admin: 'bg-gradient-to-br from-slate-700 to-slate-900 text-white',
    egyhazkeruleti_admin: 'bg-gradient-to-br from-violet-500 to-purple-700 text-white',
    esperes: 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white',
    egyhazmegyei_admin: 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white',
    egyhazmegyei_szamvevo: 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white',
    lelkesz: 'bg-gradient-to-br from-emerald-500 to-green-600 text-white',
    konyvelo: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white',
  }
  return themes[top] || 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
}

function getInitials(name: string | null, email: string | null): string {
  const source = name || email || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]).join('')
  return letters.toUpperCase() || '?'
}

interface UserCardProps {
  user: UserWithScope
  roles: ProfileRoleRow[]
  scopeNameMap: Map<string, string>
  quickOptions: QuickOption[]
  isPending: boolean
  onQuickAssign: (option: QuickOption) => void
  /** Egyedi szerep + indoklás dialóg (a popover-en belüli "Részletes (egyedi szerep)" linkről hívva). */
  onAdvanced: () => void
  onRevokeRole: (row: ProfileRoleRow) => void
  onQuickApprove: () => void
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
  onQuickApprove,
  onReject,
  onDelete,
  onViewDocument,
}: UserCardProps) {
  // A popover open-állapota — ha nyitva van, a card-ot fel kell emelni
  // `relative z-50`-re, különben a DOM-szerint későbbi testvér-card-ok
  // saját stacking context-jeikben felülre renderelődnek.
  const [popoverOpen, setPopoverOpen] = useState(false)
  // Funkciók modal — a "Funkciók" gomb a user szerepköreinek jogosultságait
  // mutatja meg modul × akció bontásban (mit lát, mit írhat, mit szerkeszthet,
  // mihez nem fér hozzá).
  const [permissionsOpen, setPermissionsOpen] = useState(false)
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
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-md font-bold text-base ${pickAvatarTheme(roles, user.role)} ${
            isUserPending ? 'opacity-70 saturate-50' : ''
          }`}
          title={isActive ? 'Aktív felhasználó' : isUserPending ? 'Várakozó felhasználó' : ''}
        >
          {getInitials(user.full_name, user.email)}
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

        {/* Jobb-oldali action-oszlop — letisztított: csak "+ Új szerepkör"
            primary + "Funkciók/Törlés" secondary. A pending-akciók (aktiválás)
            külön banner-be kerültek a card közepére, hogy ne keveredjenek a
            mindennapi műveletekkel. */}
        <div className="flex flex-col items-end gap-1.5 min-w-[160px]">
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
              onClick={() => setPermissionsOpen(true)}
              disabled={isPending}
              className="gap-1"
              title="Mit lát és mit tehet a felhasználó a szerepkörei alapján"
            >
              <Eye className="size-3.5" />
              Funkciók
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

      {/* Várakozó fiók banner — a card közepén kiemelve. A regisztrációs kérelem
          KONTEXTUSA is itt látszik (gyülekezet, szerep, dokumentum), hogy a
          jóváhagyás + aktiválás EGY helyen történjen, és semmi ne felejtődjön el. */}
      {isUserPending && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
          {user.pendingRequest && (
            <div className="rounded-lg border border-amber-200 bg-white/70 p-3">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="size-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-900">Regisztrációs kérelem</p>
                {user.pendingRequest.requestedAt && (
                  <span className="ml-auto text-[11px] text-amber-700/70">
                    {new Date(user.pendingRequest.requestedAt).toLocaleDateString('hu-HU')}
                  </span>
                )}
              </div>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                <RequestField
                  icon={<UserCheck className="size-3.5 text-amber-600" />}
                  label="Kért szerepkör"
                  value={
                    user.pendingRequest.requestedRole
                      ? ROLE_LABELS[user.pendingRequest.requestedRole as ProfileRoleType] ||
                        user.pendingRequest.requestedRole
                      : null
                  }
                />
                <RequestField
                  icon={<Church className="size-3.5 text-emerald-600" />}
                  label="Gyülekezet"
                  value={user.pendingRequest.requestedCongregationName}
                />
                <RequestField
                  icon={<Building2 className="size-3.5 text-teal-600" />}
                  label="Egyházmegye"
                  value={user.pendingRequest.requestedDioceseName}
                />
                <RequestField
                  icon={<Castle className="size-3.5 text-indigo-600" />}
                  label="Egyházkerület"
                  value={user.pendingRequest.requestedDistrictName}
                />
              </div>
              {user.pendingRequest.justification && (
                <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs italic text-amber-900/80">
                  „{user.pendingRequest.justification}”
                </p>
              )}
              {user.pendingRequest.documentPath && onViewDocument && (
                <button
                  type="button"
                  onClick={() => onViewDocument(user.pendingRequest!.documentPath!)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 underline hover:text-amber-900"
                >
                  <FileText className="size-3.5" />
                  Csatolt dokumentum megtekintése
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-amber-900 mr-2">
              <Clock className="size-4 shrink-0 text-amber-600" />
              <p className="text-sm font-semibold">
                {user.pendingRequest ? 'Jóváhagyás és aktiválás:' : 'Várakozó fiók — aktiválás:'}
              </p>
            </div>
            <PendingUserActions
              isPending={isPending}
              onQuickApprove={onQuickApprove}
              onReject={onReject}
            />
          </div>
          <p className="text-[11px] text-amber-800/80 leading-relaxed">
            A jóváhagyás <strong>egy lépésben</strong> aktiválja a fiókot
            {user.pendingRequest ? ' és hozzárendeli a kért gyülekezetet' : ''} — a
            felhasználó utána azonnal beléphet. Külön aktiválásra nincs szükség.
          </p>
        </div>
      )}

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

          {roles.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-700">
                  Kiosztott szerepkörök ({roles.length})
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-indigo-200 to-transparent" />
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
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-xs text-slate-500 italic">
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
        <span className="block text-[10px] uppercase tracking-wide text-amber-700/70">{label}</span>
        <span className="block text-xs font-medium text-slate-800">
          {value || <span className="italic text-slate-400">nincs megadva</span>}
        </span>
      </span>
    </div>
  )
}
