'use client'

/**
 * RolePermissionsDialog — a user-card "Funkciók" gombjához.
 *
 * Megmutatja, hogy a kiválasztott felhasználó MINDEN approved profile_role-jának
 * milyen jogosultságai vannak modul × akció bontásban. A `mergePermissions`
 * összegez minden szerepet (OR), így a user a végleges, "így néz ki neki a
 * rendszer" képet látja.
 *
 * NEM szerkeszt — csak megjelenít (Endre kérése: "mit lát és mit tud írni
 * és szerkeszteni, mihez nem fér hozzá").
 */

import { Building2, Castle, Check, Church, Globe, Sparkles } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ACTION_LABELS,
  MODULES,
  ROLE_TEMPLATES,
  hasPermission,
  mergePermissions,
} from '@/lib/profile-roles/permissions'
import {
  ROLE_LABELS,
  type ProfileRoleRow,
  type ProfileRoleScope,
} from '@/lib/profile-roles/types'

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Castle,
  diocese: Building2,
  congregation: Church,
}

interface RolePermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  email: string | null
  roles: ProfileRoleRow[]
  scopeNameMap: Map<string, string>
}

export function RolePermissionsDialog({
  open,
  onOpenChange,
  userName,
  email,
  roles,
  scopeNameMap,
}: RolePermissionsDialogProps) {
  const approvedRoles = roles.filter(
    (r) => r.approval_status === 'approved' && r.active,
  )

  // Az összes szerepkör permissions-ja egyesítve (OR-szel) — ez a "ténylegesen
  // látott jogosultság", amit a getEffectiveAccessContext is összeállít.
  const merged = approvedRoles.reduce((acc, r) => {
    const template = r.role === 'custom' ? {} : ROLE_TEMPLATES[r.role] || {}
    const own = mergePermissions(template, r.permissions || {})
    return mergePermissions(acc, own)
  }, {})

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white">
          <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-2">
            <Sparkles className="size-5 text-indigo-600" />
            Mit lát és mit tehet — {userName}
          </DialogTitle>
          {email && (
            <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
          )}
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Aktív szerepkörök listája */}
          {approvedRoles.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm text-amber-900">
              Ennek a felhasználónak még nincs jóváhagyott szerepköre. Új
              szerepkört a "+ Új szerepkör" gombbal oszthat ki.
            </div>
          ) : (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">
                Jelenlegi szerepkörök ({approvedRoles.length})
              </h3>
              <ul className="space-y-1.5">
                {approvedRoles.map((r) => {
                  const Icon = SCOPE_ICONS[r.scope]
                  const roleLabel =
                    r.role === 'custom'
                      ? r.custom_label || 'Egyedi szerep'
                      : ROLE_LABELS[r.role]
                  const scopeName =
                    r.scope === 'system'
                      ? 'Teljes rendszer'
                      : r.scope_id
                        ? scopeNameMap.get(r.scope_id) || '—'
                        : '—'
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <Icon className="size-4 text-slate-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {roleLabel}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {scopeName}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Permissions mátrix — modulok × akciók */}
          {approvedRoles.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">
                Jogosultságok modulonként
              </h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                A pipa jelenti, hogy az adott művelet engedélyezett. Ha egy
                felhasználónak több szerepköre van, a jogosultságok összeadódnak
                — vagyis bármelyik szerepben elérhető a művelet, akkor látja /
                szerkesztheti.
              </p>
              <div className="space-y-2">
                {MODULES.map((mod) => {
                  const allowedActions = mod.actions.filter((a) =>
                    hasPermission(merged, mod.key, a),
                  )
                  const hasAny = allowedActions.length > 0
                  return (
                    <div
                      key={mod.key}
                      className={`rounded-xl border p-3 transition ${
                        hasAny
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-slate-200 bg-slate-50/40'
                      }`}
                    >
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-base shrink-0">
                          {mod.emoji ?? '·'}
                        </span>
                        <p className="text-sm font-semibold text-slate-800 flex-1 min-w-0">
                          {mod.label}
                        </p>
                        {hasAny ? (
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                            Hozzáfér
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">
                            Nem fér hozzá
                          </span>
                        )}
                      </div>
                      {hasAny && (
                        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                          {mod.actions.map((a) => {
                            const allowed = hasPermission(merged, mod.key, a)
                            return (
                              <span
                                key={a}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                                  allowed
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-slate-100 text-slate-400 line-through opacity-60'
                                }`}
                                title={
                                  allowed
                                    ? `${ACTION_LABELS[a]} — engedélyezett`
                                    : `${ACTION_LABELS[a]} — NEM engedélyezett`
                                }
                              >
                                {allowed && <Check className="size-3" />}
                                {ACTION_LABELS[a]}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Bezárás
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
