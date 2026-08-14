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

import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
      <DialogContent className="w-[min(96vw,1100px)] max-w-[calc(100%-2rem)] sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 font-heading text-lg text-foreground sm:text-xl">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--primary)]">
              <Sparkles className="size-5" />
            </span>
            <span className="min-w-0 truncate">Mit lát és mit tehet — {userName}</span>
          </DialogTitle>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </DialogHeader>

        <div className="max-h-[70dvh] space-y-5 overflow-y-auto">
          {/* Aktív szerepkörök listája */}
          {approvedRoles.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Ennek a felhasználónak még nincs jóváhagyott szerepköre. Új
              szerepkört a „+ Új szerepkör” gombbal oszthat ki.
            </div>
          ) : (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                      className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2 ring-1 ring-border"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{roleLabel}</p>
                        <p className="truncate text-xs text-muted-foreground">{scopeName}</p>
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
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Jogosultságok modulonként
              </h3>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                A pipa jelenti, hogy az adott művelet engedélyezett. Ha egy
                felhasználónak több szerepköre van, a jogosultságok összeadódnak
                — vagyis bármelyik szerepben elérhető a művelet, akkor látja /
                szerkesztheti.
              </p>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
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
                          ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20'
                          : 'border-border bg-muted/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="shrink-0 text-base">{mod.emoji ?? '·'}</span>
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {mod.label}
                        </p>
                        {hasAny ? (
                          <StatusBadge intent="success" className="uppercase tracking-wide">
                            Hozzáfér
                          </StatusBadge>
                        ) : (
                          <StatusBadge intent="neutral" className="uppercase tracking-wide">
                            Nem fér hozzá
                          </StatusBadge>
                        )}
                      </div>
                      {hasAny && (
                        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                          {mod.actions.map((a) => {
                            const allowed = hasPermission(merged, mod.key, a)
                            return (
                              <span
                                key={a}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                                  allowed
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-muted text-muted-foreground/70 line-through opacity-70'
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-9">
            Bezárás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
