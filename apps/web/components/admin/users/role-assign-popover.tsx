'use client'

/**
 * Szerepkör-kiosztó — „+ Új szerepkör" (2026-07-11 admin-redesign).
 *
 * KORÁBBAN kézi popover volt (absolute panel + fixed overlay), ami a lista-nézet
 * `overflow-hidden` konténerében CSONKOLÓDOTT (rövid listánál használhatatlan),
 * nem kezelt Escape-et és nem volt fókusz-csapdája. MOST Dialog (@/components/ui/
 * dialog): portálba renderel (nincs clipping, nincs z-index hack), Escape/fókusz
 * a primitívből jön, és 375px-es mobilon is teljes értékű.
 *
 * A kétlépéses tartalom változatlan: 1) hova tartozik? (kereshető, csoportosított
 * cél-lista) → 2) szerep választása a hatókörön.
 */

import { useMemo, useState } from 'react'
import {
  Building2,
  Castle,
  ChevronRight,
  Church,
  Globe,
  Info,
  Plus,
  Search,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { ProfileRoleScope, ProfileRoleType } from '@/lib/profile-roles/types'

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Castle,
  diocese: Building2,
  congregation: Church,
}

export interface QuickOption {
  key: string
  scope: ProfileRoleScope
  scopeId: string | null
  role: ProfileRoleType
  label: string
  hint?: string
}

interface ScopeTarget {
  key: string
  scope: ProfileRoleScope
  scopeId: string | null
  label: string
  hint?: string
  groupLabel: string
}

const ROLE_OPTIONS_BY_SCOPE: Record<ProfileRoleScope, Array<{ value: ProfileRoleType; label: string }>> = {
  system: [{ value: 'admin', label: 'Rendszergazda' }],
  district: [{ value: 'egyhazkeruleti_admin', label: 'Egyházkerületi admin' }],
  diocese: [
    { value: 'esperes', label: 'Esperes' },
    { value: 'egyhazmegyei_admin', label: 'Egyházmegyei admin' },
    { value: 'egyhazmegyei_szamvevo', label: 'Egyházmegyei számvevő' },
  ],
  congregation: [
    { value: 'lelkesz', label: 'Lelkipásztor' },
    { value: 'konyvelo', label: 'Könyvelő' },
  ],
}

interface RoleAssignPopoverProps {
  quickOptions: QuickOption[]
  activeKeys: Set<string>
  showActivationBanner: boolean
  onAssign: (option: QuickOption) => void
  onAdvanced: () => void
  /**
   * Backward-compat: a régi popover-korszakban a szülő z-index-hackhez
   * használta. A Dialog portálba renderel, így már nem szükséges, de a
   * callback-et továbbra is meghívjuk.
   */
  onOpenChange?: (open: boolean) => void
}

export function RoleAssignPopover({
  quickOptions,
  activeKeys,
  showActivationBanner,
  onAssign,
  onAdvanced,
  onOpenChange,
}: RoleAssignPopoverProps) {
  const [open, setOpenState] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<ScopeTarget | null>(null)
  const [selectedRole, setSelectedRole] = useState<ProfileRoleType | null>(null)

  function setOpen(next: boolean) {
    setOpenState(next)
    onOpenChange?.(next)
  }

  const targets = useMemo<ScopeTarget[]>(() => {
    const seen = new Set<string>()
    const out: ScopeTarget[] = []
    for (const opt of quickOptions) {
      const targetKey = `${opt.scope}::${opt.scopeId || ''}`
      if (seen.has(targetKey)) continue
      seen.add(targetKey)
      const groupLabel =
        opt.scope === 'system'
          ? 'Rendszerszint'
          : opt.scope === 'district'
            ? 'Egyházkerületek'
            : opt.scope === 'diocese'
              ? 'Egyházmegyék'
              : 'Gyülekezetek'
      const cleanLabel =
        opt.scope === 'system'
          ? 'Rendszer (globális)'
          : opt.label.replace(/^[^—]+ — /, '')
      out.push({
        key: targetKey,
        scope: opt.scope,
        scopeId: opt.scopeId,
        label: cleanLabel,
        hint: opt.hint,
        groupLabel,
      })
    }
    return out
  }, [quickOptions])

  const filteredTargets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return targets
    return targets.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        (t.hint || '').toLowerCase().includes(q) ||
        t.groupLabel.toLowerCase().includes(q),
    )
  }, [targets, search])

  const groupedTargets = useMemo(() => {
    const groups = new Map<string, ScopeTarget[]>()
    for (const t of filteredTargets) {
      const arr = groups.get(t.groupLabel) || []
      arr.push(t)
      groups.set(t.groupLabel, arr)
    }
    return Array.from(groups.entries())
  }, [filteredTargets])

  const availableRoles = useMemo(() => {
    if (!selectedTarget) return []
    const opts = ROLE_OPTIONS_BY_SCOPE[selectedTarget.scope] || []
    return opts.filter((r) => {
      const scopePart =
        selectedTarget.scope === 'system'
          ? 'system'
          : selectedTarget.scope === 'district'
            ? 'district'
            : selectedTarget.scope === 'diocese'
              ? 'diocese'
              : 'cong'
      const key = `${scopePart}::${selectedTarget.scopeId || ''}::${r.value}`
      return !activeKeys.has(key)
    })
  }, [selectedTarget, activeKeys])

  function reset() {
    setSelectedTarget(null)
    setSelectedRole(null)
    setSearch('')
    setOpen(false)
  }

  function handleAssign() {
    if (!selectedTarget || !selectedRole) return
    const scopePart =
      selectedTarget.scope === 'system'
        ? 'system'
        : selectedTarget.scope === 'district'
          ? 'district'
          : selectedTarget.scope === 'diocese'
            ? 'diocese'
            : 'cong'
    const key = `${scopePart}::${selectedTarget.scopeId || ''}::${selectedRole}`
    const matchingOpt = quickOptions.find((o) => o.key === key)
    if (!matchingOpt) return
    reset()
    onAssign(matchingOpt)
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="min-h-9 gap-1">
        <Plus className="size-3.5" />
        Új szerepkör
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
        <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="gap-0.5 border-b border-border bg-muted/40 px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="font-heading text-base text-foreground">
              Új szerepkör kiosztása
            </DialogTitle>
            <p className="text-xs font-medium text-muted-foreground">
              {selectedTarget ? '2. lépés — Szerepkör választása' : '1. lépés — Hova tartozik?'}
            </p>
          </DialogHeader>

          {/* D6 activation banner pending user-nél */}
          {showActivationBanner && !selectedTarget && (
            <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 sm:px-5">
              <Info className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="leading-relaxed">
                A felhasználó fiókja még nincs aktiválva. A szerepkör hozzáadása egyúttal
                aktiválja a fiókot is.
              </p>
            </div>
          )}

          {!selectedTarget && (
            <>
              <div className="border-b border-border p-3 sm:px-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Keresés gyülekezet, megye, kerület…"
                    aria-label="Keresés a hatókörök között"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="max-h-[min(52vh,26rem)] overflow-y-auto">
                {groupedTargets.length === 0 ? (
                  <p className="p-4 text-center text-xs italic text-muted-foreground">
                    Nincs találat — próbálkozzon más kereséssel.
                  </p>
                ) : (
                  groupedTargets.map(([groupLabel, group]) => (
                    <div key={groupLabel} className="py-1">
                      <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:px-5">
                        {groupLabel}
                      </p>
                      {group.map((t) => {
                        const Icon = SCOPE_ICONS[t.scope]
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setSelectedTarget(t)}
                            className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm transition hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none sm:px-5"
                          >
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground">{t.label}</p>
                              {t.hint && (
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {t.hint}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-border p-2 sm:px-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    reset()
                    onAdvanced()
                  }}
                  className="min-h-9 w-full text-xs text-[var(--primary)]"
                >
                  Részletes (egyedi szerep, indoklás) →
                </Button>
              </div>
            </>
          )}

          {selectedTarget && (
            <>
              <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Kiválasztott cél
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {(() => {
                    const Icon = SCOPE_ICONS[selectedTarget.scope]
                    return <Icon className="size-4 shrink-0 text-muted-foreground" />
                  })()}
                  <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
                    {selectedTarget.label}
                  </p>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setSelectedTarget(null)
                      setSelectedRole(null)
                    }}
                    className="text-xs text-[var(--primary)]"
                  >
                    Csere
                  </Button>
                </div>
              </div>

              <div className="max-h-[min(48vh,22rem)] space-y-2 overflow-y-auto p-4 sm:px-5">
                <p className="text-sm font-medium text-foreground">
                  Mi lesz a szerepe ezen a hatókörön?
                </p>
                {availableRoles.length === 0 ? (
                  <p className="text-xs italic text-amber-700 dark:text-amber-300">
                    Ezen a hatókörön minden lehetséges szerep már ki van osztva ennek a
                    felhasználónak.
                  </p>
                ) : (
                  availableRoles.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setSelectedRole(r.value)}
                      aria-pressed={selectedRole === r.value}
                      className={`w-full rounded-xl border-2 px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selectedRole === r.value
                          ? 'border-[var(--primary)] bg-primary/10 text-foreground shadow-sm'
                          : 'border-border bg-card text-foreground hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))]'
                      }`}
                    >
                      <span className="font-semibold">{r.label}</span>
                    </button>
                  ))
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/30 p-3 sm:px-5">
                <Button size="sm" variant="outline" onClick={reset} className="min-h-9">
                  Mégse
                </Button>
                <Button
                  size="sm"
                  onClick={handleAssign}
                  disabled={!selectedRole}
                  className="min-h-9 gap-1"
                >
                  <Plus className="size-3.5" />
                  Hozzáadás
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
