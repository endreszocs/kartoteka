'use client'

/**
 * Admin "Szerepkörök" fül — v0.9.38 ÚJRAGONDOLT.
 *
 * Az új koncepció (felhasználó kérése): EGY USER = EGY SOR. Minden sorban
 * látszik a user, alatta inline a kiosztott szerepkörök badge-ekben.
 * A "+ Új szerepkör" gomb egy kompakt popovert nyit, ami egyetlen combobox-szal
 * kínálja az ÖSSZES kombinált opciót:
 *   - Lelkész — Barátosi gyülekezet
 *   - Esperes — Sepsi egyházmegye
 *   - Egyházkerületi admin — EREK
 *   - Rendszergazda
 *   - Könyvelő — Barátosi gyülekezet
 *   ... stb.
 *
 * Két kattintás: 1) "+ Új szerepkör"  2) opció kiválasztása. Custom szerepkör
 * vagy indoklás → a részletes modal (alul) jelenik meg (kevés esetnek).
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Building2,
  Castle,
  Check,
  ChevronDown,
  Church,
  Clock,
  Globe,
  Loader2,
  Plus,
  Search,
  ShieldOff,
  Sparkles,
  UserCircle2,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  createProfileRole,
  listAssignableProfiles,
  listProfileRoles,
  listScopeOptions,
  revokeProfileRole,
} from '@/app/(dashboard)/admin/profile-roles-actions'

import {
  APPROVAL_STATUS_LABELS,
  ROLE_LABELS,
  SCOPE_LABELS,
  type ApprovalStatus,
  type ProfileRoleRow,
  type ProfileRoleScope,
  type ProfileRoleType,
} from '@/lib/profile-roles/types'

interface UserLite { id: string; full_name: string | null; email: string | null; role: string }
interface CongLite { id: string; name: string; diocese_id: string | null }
interface DioceseLite { id: string; name: string; district_id: string | null }
interface DistrictLite { id: string; name: string }

const SCOPE_ICONS: Record<ProfileRoleScope, React.ComponentType<{ className?: string }>> = {
  system: Globe,
  district: Castle,
  diocese: Building2,
  congregation: Church,
}

// ── Kombinált opciók típusa a quick-assign comboboxhoz ──────────────────────
interface QuickOption {
  key: string
  scope: ProfileRoleScope
  scopeId: string | null
  role: ProfileRoleType
  label: string // "Lelkész — Barátosi gyül."
  hint?: string // "Sepsi egyházmegye"
}

export function ProfileRolesTab() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ProfileRoleRow[]>([])
  const [users, setUsers] = useState<UserLite[]>([])
  const [congregations, setCongregations] = useState<CongLite[]>([])
  const [dioceses, setDioceses] = useState<DioceseLite[]>([])
  const [districts, setDistricts] = useState<DistrictLite[]>([])
  const [search, setSearch] = useState('')
  const [advancedDialog, setAdvancedDialog] = useState<{ user: UserLite } | null>(null)
  const [, startTransition] = useTransition()

  async function reload() {
    const [r, u, s] = await Promise.all([
      listProfileRoles(),
      listAssignableProfiles(),
      listScopeOptions(),
    ])
    if (r.data) setRows(r.data)
    if (u.data) setUsers(u.data)
    if (s.data) {
      setCongregations(s.data.congregations)
      setDioceses(s.data.dioceses)
      setDistricts(s.data.districts)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([listProfileRoles(), listAssignableProfiles(), listScopeOptions()])
      .then(([r, u, s]) => {
        if (cancelled) return
        if (r.data) setRows(r.data)
        if (u.data) setUsers(u.data)
        if (s.data) {
          setCongregations(s.data.congregations)
          setDioceses(s.data.dioceses)
          setDistricts(s.data.districts)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Csoportosítás user-szerint: 1 user → összes szerepköre ──
  const rolesByUser = useMemo(() => {
    const m = new Map<string, ProfileRoleRow[]>()
    for (const r of rows) {
      const arr = m.get(r.profile_id) || []
      arr.push(r)
      m.set(r.profile_id, arr)
    }
    return m
  }, [rows])

  const scopeNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of congregations) m.set(c.id, c.name)
    for (const d of dioceses) m.set(d.id, d.name)
    for (const d of districts) m.set(d.id, d.name)
    return m
  }, [congregations, dioceses, districts])

  // ── Kombinált quick-options, scope szerint csoportosítva ──
  const quickOptions = useMemo(() => {
    const opts: QuickOption[] = []
    // System
    opts.push({
      key: 'system::admin',
      scope: 'system',
      scopeId: null,
      role: 'admin',
      label: 'Rendszergazda',
      hint: 'Teljes hozzáférés',
    })
    // Districts
    for (const d of districts) {
      opts.push({
        key: `district::${d.id}::egyhazkeruleti_admin`,
        scope: 'district',
        scopeId: d.id,
        role: 'egyhazkeruleti_admin',
        label: `Egyházkerületi admin — ${d.name}`,
      })
    }
    // Dioceses
    for (const d of dioceses) {
      opts.push({
        key: `diocese::${d.id}::esperes`,
        scope: 'diocese',
        scopeId: d.id,
        role: 'esperes',
        label: `Esperes — ${d.name}`,
      })
      opts.push({
        key: `diocese::${d.id}::egyhazmegyei_admin`,
        scope: 'diocese',
        scopeId: d.id,
        role: 'egyhazmegyei_admin',
        label: `Egyházmegyei admin — ${d.name}`,
      })
      opts.push({
        key: `diocese::${d.id}::egyhazmegyei_szamvevo`,
        scope: 'diocese',
        scopeId: d.id,
        role: 'egyhazmegyei_szamvevo',
        label: `Egyházmegyei számvevő — ${d.name}`,
      })
    }
    // Congregations
    for (const c of congregations) {
      const dioName = c.diocese_id ? scopeNameMap.get(c.diocese_id) : ''
      opts.push({
        key: `cong::${c.id}::lelkesz`,
        scope: 'congregation',
        scopeId: c.id,
        role: 'lelkesz',
        label: `Lelkipásztor — ${c.name}`,
        hint: dioName || undefined,
      })
      opts.push({
        key: `cong::${c.id}::konyvelo`,
        scope: 'congregation',
        scopeId: c.id,
        role: 'konyvelo',
        label: `Könyvelő — ${c.name}`,
        hint: dioName || undefined,
      })
    }
    return opts
  }, [districts, dioceses, congregations, scopeNameMap])

  // ── Kereshető user-lista ──
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const userRoles = rolesByUser.get(u.id) || []
      const roleNames = userRoles.map((r) => {
        const roleLabel = r.role === 'custom' ? r.custom_label || 'Egyedi' : ROLE_LABELS[r.role]
        return `${roleLabel} ${r.scope_id ? scopeNameMap.get(r.scope_id) || '' : ''}`
      }).join(' ')
      const searchable = `${u.full_name || ''} ${u.email || ''} ${u.role} ${roleNames}`.toLowerCase()
      return searchable.includes(q)
    })
  }, [users, search, rolesByUser, scopeNameMap])

  function handleQuickAssign(user: UserLite, opt: QuickOption) {
    startTransition(async () => {
      const result = await createProfileRole({
        profileId: user.id,
        scope: opt.scope,
        scopeId: opt.scopeId,
        role: opt.role,
        customLabel: null,
        reason: undefined,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Szerepkör kiosztva: ${opt.label}`)
      await reload()
    })
  }

  function handleRevoke(row: ProfileRoleRow) {
    const reason = prompt('Miért vonja vissza ezt a szerepkört? (kötelező, min. 5 karakter)')
    if (!reason?.trim()) return
    startTransition(async () => {
      const res = await revokeProfileRole({ profileRoleId: row.id, reason })
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Szerepkör visszavonva.')
      await reload()
    })
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-400 animate-pulse">Szerepkörök betöltése…</div>
  }

  return (
    <div className="space-y-5">
      {/* Info kártya */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 text-indigo-600 mt-0.5" />
          <div>
            <h2 className="font-heading text-lg text-slate-800">Szerepkörök kiosztása</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Egy felhasználónak több szerepköre is lehet (pl. lelkész + esperes).
              Egyetlen kattintással keresd ki a felhasználót, majd a "<strong>+ Új szerepkör</strong>"
              gombra kattintva válaszd ki a szerep + gyülekezet/egyházmegye kombinációt egy
              listából. Gyülekezeti kiosztás esetén a lelkész jóváhagyása szükséges (kivéve a
              lelkipásztori szerepkört).
            </p>
          </div>
        </div>
      </div>

      {/* Kereső */}
      <div className="card-raised p-2 flex items-center gap-2">
        <Search className="size-4 text-slate-400 ml-2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Keresés név / email / szerepkör / gyülekezet alapján..."
          className="h-9 border-0 bg-transparent text-sm focus-visible:ring-0 px-0"
        />
        <span className="text-xs text-slate-400 mr-2">{filteredUsers.length}/{users.length}</span>
      </div>

      {/* User-soros lista */}
      <div className="space-y-2">
        {filteredUsers.length === 0 ? (
          <div className="card-raised p-8 text-sm text-slate-500 text-center italic">
            {search ? 'Nincs találat a keresésre.' : 'Még nincs felhasználó.'}
          </div>
        ) : (
          filteredUsers.map((user) => (
            <UserAssignmentCard
              key={user.id}
              user={user}
              roles={rolesByUser.get(user.id) || []}
              scopeNameMap={scopeNameMap}
              quickOptions={quickOptions}
              onQuickAssign={(opt) => handleQuickAssign(user, opt)}
              onRevoke={handleRevoke}
              onAdvanced={() => setAdvancedDialog({ user })}
            />
          ))
        )}
      </div>

      {/* Részletes (custom + indoklás) modal */}
      {advancedDialog && (
        <CreateProfileRoleDialog
          open={!!advancedDialog}
          onOpenChange={(o) => !o && setAdvancedDialog(null)}
          user={advancedDialog.user}
          congregations={congregations}
          dioceses={dioceses}
          districts={districts}
          onSaved={async () => {
            setAdvancedDialog(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// User card — 1 user 1 sor, szerepkörökkel
// ────────────────────────────────────────────────────────────────────────────

function UserAssignmentCard({
  user,
  roles,
  scopeNameMap,
  quickOptions,
  onQuickAssign,
  onRevoke,
  onAdvanced,
}: {
  user: UserLite
  roles: ProfileRoleRow[]
  scopeNameMap: Map<string, string>
  quickOptions: QuickOption[]
  onQuickAssign: (opt: QuickOption) => void
  onRevoke: (row: ProfileRoleRow) => void
  onAdvanced: () => void
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [popSearch, setPopSearch] = useState('')

  // Aktív szerepkörök ID-i — ezek nem ajánljuk újra
  const activeKeys = new Set(
    roles
      .filter((r) => r.approval_status !== 'revoked' && r.approval_status !== 'rejected')
      .map((r) => `${r.scope === 'system' ? 'system' : r.scope === 'district' ? 'district' : r.scope === 'diocese' ? 'diocese' : 'cong'}::${r.scope_id || ''}::${r.role}`),
  )

  const filteredOptions = useMemo(() => {
    const q = popSearch.trim().toLowerCase()
    return quickOptions
      .filter((o) => !activeKeys.has(o.key)) // már megvan? kihagyjuk
      .filter((o) => !q || o.label.toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [quickOptions, activeKeys, popSearch])

  return (
    <div className="card-raised p-4 sm:p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <UserCircle2 className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">
            {user.full_name || user.email || user.id.slice(0, 8)}
          </p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>

        {/* "+ Új szerepkör" — gyors-kiosztás popover */}
        <div className="relative">
          <Button
            size="sm"
            onClick={() => setPopoverOpen((o) => !o)}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="size-3.5" />
            Új szerepkör
            <ChevronDown className={`size-3.5 transition ${popoverOpen ? 'rotate-180' : ''}`} />
          </Button>

          {popoverOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setPopoverOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 top-full mt-2 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden">
                <div className="border-b border-slate-100 p-3">
                  <div className="flex items-center gap-2">
                    <Search className="size-4 text-slate-400" />
                    <Input
                      autoFocus
                      value={popSearch}
                      onChange={(e) => setPopSearch(e.target.value)}
                      placeholder="Keresés gyülekezet vagy szerep alapján..."
                      className="h-8 border-0 bg-transparent text-sm focus-visible:ring-0 px-0"
                    />
                    <button
                      type="button"
                      onClick={() => setPopoverOpen(false)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-1">
                  {filteredOptions.length === 0 ? (
                    <p className="p-4 text-xs text-slate-400 italic text-center">
                      {popSearch ? 'Nincs találat.' : 'Minden lehetséges szerep már kiosztva.'}
                    </p>
                  ) : (
                    filteredOptions.map((opt) => {
                      const Icon = SCOPE_ICONS[opt.scope]
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setPopoverOpen(false)
                            setPopSearch('')
                            onQuickAssign(opt)
                          }}
                          className="w-full text-left rounded-lg px-3 py-2 text-sm flex items-center gap-3 hover:bg-indigo-50 transition"
                        >
                          <Icon className="size-4 shrink-0 text-slate-500" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 truncate">{opt.label}</p>
                            {opt.hint && (
                              <p className="text-[11px] text-muted-foreground truncate">{opt.hint}</p>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
                <div className="border-t border-slate-100 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPopoverOpen(false)
                      onAdvanced()
                    }}
                    className="w-full text-center text-xs text-indigo-600 hover:text-indigo-800 py-1.5 rounded-md hover:bg-indigo-50 transition"
                  >
                    Részletes (egyedi szerep, indoklás) →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline szerepkörök */}
      {roles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {roles.map((r) => (
            <RoleBadgeInline
              key={r.id}
              row={r}
              scopeName={r.scope_id ? scopeNameMap.get(r.scope_id) || '—' : ''}
              onRevoke={() => onRevoke(r)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Inline szerepkör-badge (a user-card belül)
// ────────────────────────────────────────────────────────────────────────────

function RoleBadgeInline({
  row,
  scopeName,
  onRevoke,
}: {
  row: ProfileRoleRow
  scopeName: string
  onRevoke: () => void
}) {
  const Icon = SCOPE_ICONS[row.scope]
  const roleLabel = row.role === 'custom' ? row.custom_label || 'Egyedi' : ROLE_LABELS[row.role]

  const statusStyles: Record<ApprovalStatus, string> = {
    pending: 'bg-amber-50 text-amber-800 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    rejected: 'bg-red-50 text-red-700 border-red-200 line-through opacity-60',
    revoked: 'bg-slate-100 text-slate-500 border-slate-200 line-through opacity-60',
  }
  const StatusIcon: Record<ApprovalStatus, React.ComponentType<{ className?: string }>> = {
    pending: Clock,
    approved: Check,
    rejected: XCircle,
    revoked: ShieldOff,
  }
  const StatusIconComp = StatusIcon[row.approval_status as ApprovalStatus]

  return (
    <div className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${statusStyles[row.approval_status as ApprovalStatus]}`}>
      <Icon className="size-3" />
      <span className="font-semibold">{roleLabel}</span>
      {scopeName && (
        <span className="text-[10px] opacity-75">— {scopeName}</span>
      )}
      <span className="ml-1 inline-flex items-center gap-0.5 opacity-70">
        <StatusIconComp className="size-2.5" />
        {APPROVAL_STATUS_LABELS[row.approval_status as ApprovalStatus]}
      </span>
      {row.approval_status === 'approved' && row.active && (
        <button
          type="button"
          onClick={onRevoke}
          className="ml-1 -mr-1 size-4 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-700 inline-flex items-center justify-center transition opacity-0 group-hover:opacity-100"
          title="Visszavonás"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Részletes (custom + indoklás) modal — ritkán, de elérhető
// ────────────────────────────────────────────────────────────────────────────

function CreateProfileRoleDialog({
  open,
  onOpenChange,
  user,
  congregations,
  dioceses,
  districts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  user: UserLite
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
  onSaved: () => Promise<void>
}) {
  const [scope, setScope] = useState<ProfileRoleScope>('congregation')
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [role, setRole] = useState<ProfileRoleType>('konyvelo')
  const [customLabel, setCustomLabel] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const roleOptions = useMemo(() => {
    if (scope === 'system') return [{ value: 'admin' as ProfileRoleType, label: 'Rendszergazda' }]
    if (scope === 'district')
      return [
        { value: 'egyhazkeruleti_admin' as ProfileRoleType, label: 'Egyházkerületi admin' },
        { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep' },
      ]
    if (scope === 'diocese')
      return [
        { value: 'esperes' as ProfileRoleType, label: 'Esperes' },
        { value: 'egyhazmegyei_admin' as ProfileRoleType, label: 'Egyházmegyei admin' },
        { value: 'egyhazmegyei_szamvevo' as ProfileRoleType, label: 'Egyházmegyei számvevő' },
        { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep' },
      ]
    return [
      { value: 'lelkesz' as ProfileRoleType, label: 'Lelkipásztor' },
      { value: 'konyvelo' as ProfileRoleType, label: 'Könyvelő' },
      { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep (pl. titkárnő)' },
    ]
  }, [scope])

  function handleScopeChange(next: ProfileRoleScope) {
    setScope(next)
    setScopeId(null)
    const defaults: Record<ProfileRoleScope, ProfileRoleType> = {
      system: 'admin',
      district: 'egyhazkeruleti_admin',
      diocese: 'egyhazmegyei_admin',
      congregation: 'konyvelo',
    }
    setRole(defaults[next])
  }

  const scopeOptions = useMemo(() => {
    if (scope === 'system') return []
    if (scope === 'district') return districts
    if (scope === 'diocese') return dioceses
    if (scope === 'congregation') return congregations
    return []
  }, [scope, congregations, dioceses, districts])

  function handleSave() {
    startTransition(async () => {
      const result = await createProfileRole({
        profileId: user.id,
        scope,
        scopeId: scope === 'system' ? null : scopeId,
        role,
        customLabel: role === 'custom' ? customLabel : null,
        reason: reason.trim() || undefined,
      })
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Szerepkör kiosztva.')
      setScopeId(null)
      setCustomLabel('')
      setReason('')
      await onSaved()
    })
  }

  const pastorApprovalNeeded = scope === 'congregation' && role !== 'lelkesz'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-indigo-100 bg-indigo-50/40">
          <DialogTitle className="font-heading text-xl text-slate-800">
            Részletes szerepkör — {user.full_name || user.email}
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Scope */}
          <div>
            <Label>Hatókör</Label>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['system', 'district', 'diocese', 'congregation'] as ProfileRoleScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleScopeChange(s)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    scope === s
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                  }`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {scope !== 'system' && (
            <div>
              <Label>
                {scope === 'congregation' ? 'Gyülekezet' : scope === 'diocese' ? 'Egyházmegye' : 'Egyházkerület'}
              </Label>
              <select
                value={scopeId || ''}
                onChange={(e) => setScopeId(e.target.value || null)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">-- Válasszon --</option>
                {scopeOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label>Szerepkör</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRoleType)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {role === 'custom' && (
            <div>
              <Label>Egyedi szerepkör neve</Label>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Pl.: Titkárnő, Pénztáros, Segédlelkész"
                className="mt-1"
                maxLength={64}
              />
            </div>
          )}

          <div>
            <Label>Indoklás (opcionális)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Miért kapja ezt a szerepkört?"
              className="mt-1"
            />
          </div>

          {pastorApprovalNeeded && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-800">
              <strong>Lelkészi jóváhagyás szükséges</strong> — a hozzárendelés PENDING állapotban
              jön létre. A gyülekezet lelkésze a saját /profile/kapcsolatok oldalán hagyja jóvá vagy
              utasítja el.
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Mégse
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || (scope !== 'system' && !scopeId) || (role === 'custom' && !customLabel.trim())}
            className="bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Kiosztás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
