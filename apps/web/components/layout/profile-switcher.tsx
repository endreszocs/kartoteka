'use client'

/**
 * Profile switcher — a header avatar popover-ben.
 * Mutatja a user aktív kontextusát és a lehetséges többi szerepet, amelyek
 * közül egy kattintással váltani lehet.
 *
 * FÁZIS 4 (2026-04-17).
 */

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Building2, Check, Church, Globe, Landmark, Loader2 } from 'lucide-react'

import { switchActiveProfileRole } from '@/app/(dashboard)/profile/switch-context-action'
import { ROLE_LABELS, type ProfileRoleRow, type ProfileRoleScope } from '@/lib/profile-roles/types'

export interface ProfileSwitcherProps {
  /** Az aktív profile_role ID-ja (null ha nincs kiválasztva — a default-ot használja) */
  activeProfileRoleId: string | null
  /** Az összes approved profile_roles sor */
  profileRoles: ProfileRoleRow[]
  /** A scope + scope_id alapján feloldott név (pl. gyülekezet/egyházmegye neve) */
  scopeNames: Record<string, string>
}

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Landmark,
  diocese: Building2,
  congregation: Church,
}

export function ProfileSwitcher({
  activeProfileRoleId,
  profileRoles,
  scopeNames,
}: ProfileSwitcherProps) {
  const [isPending, startTransition] = useTransition()

  // Csak akkor mutassuk, ha tényleg van váltási lehetőség (több mint 1 szerep)
  if (profileRoles.length <= 1) return null

  const active = profileRoles.find((r) => r.id === activeProfileRoleId) || profileRoles[0]

  function handleSwitch(profileRoleId: string) {
    if (profileRoleId === active.id) return
    startTransition(async () => {
      // 2026-05-25: a server action sikerkor server-side redirect()-tel
      // dob NEXT_REDIRECT signal-t → a böngésző automatikusan navigál.
      // Csak hibakor kapunk vissza return value-t.
      const result = await switchActiveProfileRole(profileRoleId)
      if (result && 'error' in result && result.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="px-3 py-2 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Aktív profil
      </p>
      <ActiveRow row={active} scopeName={resolveScopeName(active, scopeNames)} />
      {profileRoles.length > 1 && (
        <>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Váltás másik szerepre
          </p>
          <div className="space-y-1">
            {profileRoles
              .filter((r) => r.id !== active.id)
              .map((r) => (
                <SwitchButton
                  key={r.id}
                  row={r}
                  scopeName={resolveScopeName(r, scopeNames)}
                  onSwitch={() => handleSwitch(r.id)}
                  disabled={isPending}
                />
              ))}
          </div>
        </>
      )}
    </div>
  )
}

function ActiveRow({ row, scopeName }: { row: ProfileRoleRow; scopeName: string }) {
  const Icon = SCOPE_ICONS[row.scope]
  const label = row.role === 'custom' ? row.custom_label || 'Egyedi szerep' : ROLE_LABELS[row.role]
  return (
    <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2">
      <Icon className="size-4 text-indigo-700 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate">{scopeName}</p>
        <p className="text-xs text-indigo-700 truncate">{label}</p>
      </div>
      <Check className="size-4 text-indigo-600 shrink-0" />
    </div>
  )
}

function SwitchButton({
  row,
  scopeName,
  onSwitch,
  disabled,
}: {
  row: ProfileRoleRow
  scopeName: string
  onSwitch: () => void
  disabled: boolean
}) {
  const Icon = SCOPE_ICONS[row.scope]
  const label = row.role === 'custom' ? row.custom_label || 'Egyedi szerep' : ROLE_LABELS[row.role]
  return (
    <button
      type="button"
      onClick={onSwitch}
      disabled={disabled}
      className="w-full flex items-center gap-2 rounded-xl border border-transparent bg-white/50 px-3 py-2 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40 disabled:opacity-60"
    >
      <Icon className="size-4 text-slate-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700 truncate">{scopeName}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
      {disabled && <Loader2 className="size-4 text-slate-400 animate-spin" />}
    </button>
  )
}

function resolveScopeName(row: ProfileRoleRow, scopeNames: Record<string, string>): string {
  if (row.scope === 'system') return 'Teljes rendszer'
  if (!row.scope_id) return '—'
  return scopeNames[row.scope_id] || '—'
}
