'use client'

import { useMemo, useState } from 'react'
import {
  Building2,
  Castle,
  ChevronDown,
  Church,
  Globe,
  Info,
  Plus,
  Search,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
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
}

export function RoleAssignPopover({
  quickOptions,
  activeKeys,
  showActivationBanner,
  onAssign,
  onAdvanced,
}: RoleAssignPopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<ScopeTarget | null>(null)
  const [selectedRole, setSelectedRole] = useState<ProfileRoleType | null>(null)

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
    <div className="relative">
      <Button
        size="sm"
        onClick={() => {
          if (open) reset()
          else setOpen(true)
        }}
        className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        <Plus className="size-3.5" />
        Új szerepkör
        <ChevronDown className={`size-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={reset} aria-hidden />
          <div className="absolute right-0 top-full mt-2 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden">
            {/* D6 activation banner pending user-nél */}
            {showActivationBanner && !selectedTarget && (
              <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs text-amber-900 flex items-start gap-2">
                <Info className="size-3.5 mt-0.5 shrink-0 text-amber-600" />
                <p className="leading-relaxed">
                  A felhasználó fiókja még nincs aktiválva. A szerepkör hozzáadása egyúttal aktiválja a fiókot is.
                </p>
              </div>
            )}

            <div className="border-b border-slate-100 px-4 py-2.5 bg-indigo-50/50 text-xs font-semibold text-indigo-700 flex items-center justify-between">
              <span>{selectedTarget ? '2. lépés — Szerepkör választása' : '1. lépés — Hova tartozik?'}</span>
              <button
                type="button"
                onClick={reset}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Bezárás"
              >
                <X className="size-4" />
              </button>
            </div>

            {!selectedTarget && (
              <>
                <div className="border-b border-slate-100 p-3">
                  <div className="flex items-center gap-2">
                    <Search className="size-4 text-slate-400" />
                    <Input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Keresés gyülekezet, megye, kerület…"
                      className="h-8 border-0 bg-transparent text-sm focus-visible:ring-0 px-0"
                    />
                  </div>
                </div>
                <div className="max-h-[55vh] overflow-y-auto">
                  {groupedTargets.length === 0 ? (
                    <p className="p-4 text-xs text-slate-400 italic text-center">
                      Nincs találat — próbálkozzon más kereséssel.
                    </p>
                  ) : (
                    groupedTargets.map(([groupLabel, group]) => (
                      <div key={groupLabel} className="py-1">
                        <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          {groupLabel}
                        </p>
                        {group.map((t) => {
                          const Icon = SCOPE_ICONS[t.scope]
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setSelectedTarget(t)}
                              className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 hover:bg-indigo-50 transition"
                            >
                              <Icon className="size-4 shrink-0 text-slate-500" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 truncate">{t.label}</p>
                                {t.hint && (
                                  <p className="text-[11px] text-muted-foreground truncate">{t.hint}</p>
                                )}
                              </div>
                              <ChevronDown className="size-4 -rotate-90 text-slate-300" />
                            </button>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-100 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      reset()
                      onAdvanced()
                    }}
                    className="w-full text-center text-xs text-indigo-600 hover:text-indigo-800 py-1.5 rounded-md hover:bg-indigo-50 transition"
                  >
                    Részletes (egyedi szerep, indoklás) →
                  </button>
                </div>
              </>
            )}

            {selectedTarget && (
              <>
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Kiválasztott cél
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {(() => {
                      const Icon = SCOPE_ICONS[selectedTarget.scope]
                      return <Icon className="size-4 text-slate-600 shrink-0" />
                    })()}
                    <p className="font-semibold text-slate-800 truncate flex-1">
                      {selectedTarget.label}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTarget(null)
                        setSelectedRole(null)
                      }}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Csere
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    Mi lesz a szerepe ezen a hatókörön?
                  </p>
                  {availableRoles.length === 0 ? (
                    <p className="text-xs text-amber-700 italic">
                      Ezen a hatókörön minden lehetséges szerep már ki van osztva ennek a felhasználónak.
                    </p>
                  ) : (
                    availableRoles.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setSelectedRole(r.value)}
                        className={`w-full text-left rounded-xl border-2 px-3 py-2.5 text-sm transition ${
                          selectedRole === r.value
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-indigo-200'
                        }`}
                      >
                        <span className="font-semibold">{r.label}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="border-t border-slate-100 p-3 flex justify-end gap-2 bg-slate-50/30">
                  <Button size="sm" variant="outline" onClick={reset}>
                    Mégse
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAssign}
                    disabled={!selectedRole}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1"
                  >
                    <Plus className="size-3.5" />
                    Hozzáadás
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
