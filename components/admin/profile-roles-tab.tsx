'use client'

/**
 * Admin "Multi-role szerepkörök" fül.
 *
 * Itt adhatók ki profile_roles hozzárendelések — csak admin / egyházkerületi
 * admin számára.
 *
 * Fázis 7 MVP (2026-04-18): alap CRUD + szerepkör-sablonok használata.
 * A permissions x-elő UI (custom finomhangolás) külön dialogban, későbbi iteráció.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Building2,
  Check,
  Clock,
  Globe,
  Landmark,
  Loader2,
  Search,
  ShieldOff,
  Sparkles,
  UserPlus,
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
  district: Landmark,
  diocese: Building2,
  congregation: Building2,
}

export function ProfileRolesTab() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ProfileRoleRow[]>([])
  const [users, setUsers] = useState<UserLite[]>([])
  const [congregations, setCongregations] = useState<CongLite[]>([])
  const [dioceses, setDioceses] = useState<DioceseLite[]>([])
  const [districts, setDistricts] = useState<DistrictLite[]>([])
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

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

  const userMap = useMemo(() => {
    const m = new Map<string, UserLite>()
    for (const u of users) m.set(u.id, u)
    return m
  }, [users])

  const scopeNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of congregations) m.set(c.id, c.name)
    for (const d of dioceses) m.set(d.id, d.name)
    for (const d of districts) m.set(d.id, d.name)
    return m
  }, [congregations, dioceses, districts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const user = userMap.get(r.profile_id)
      const searchable = [
        user?.full_name || '',
        user?.email || '',
        r.role,
        r.custom_label || '',
        r.scope,
        r.scope_id ? (scopeNameMap.get(r.scope_id) || '') : '',
      ].join(' ').toLowerCase()
      return searchable.includes(q)
    })
  }, [rows, userMap, scopeNameMap, search])

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
            <h2 className="font-heading text-lg text-slate-800">Multi-role szerepkörök</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Egy felhasználónak több szerepköre is lehet (pl. gyülekezeti lelkész + egyházmegyei
              admin + egyházkerületi admin). A felhasználó a fejlécben lévő profilváltóval
              válthat közöttük. Gyülekezeti scope-ra — a lelkész kivételével — lelkészi jóváhagyás
              szükséges.
            </p>
          </div>
        </div>
      </div>

      {/* Kereső + új gomb */}
      <div className="flex items-center gap-2">
        <div className="flex-1 card-raised p-2 flex items-center gap-2">
          <Search className="size-4 text-slate-400 ml-2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Keresés név / email / szerep / egység alapján..."
            className="h-9 border-0 bg-transparent text-sm focus-visible:ring-0 px-0"
          />
          <span className="text-xs text-slate-400 mr-2">{filtered.length}/{rows.length}</span>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <UserPlus className="size-4" />
          Új szerepkör
        </Button>
      </div>

      {/* Lista */}
      <div className="card-raised divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <p className="p-8 text-sm text-slate-500 text-center italic">
            {search ? 'Nincs találat a keresésre.' : 'Még nincs szerepkör kiosztva.'}
          </p>
        ) : (
          filtered.map((row) => (
            <RoleRow
              key={row.id}
              row={row}
              user={userMap.get(row.profile_id) || null}
              scopeName={row.scope_id ? scopeNameMap.get(row.scope_id) || '—' : ''}
              onRevoke={() => handleRevoke(row)}
              isPending={isPending}
            />
          ))
        )}
      </div>

      {/* Új hozzárendelés modal */}
      <CreateProfileRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
        congregations={congregations}
        dioceses={dioceses}
        districts={districts}
        onSaved={async () => {
          setCreateOpen(false)
          await reload()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Belső komponensek
// ---------------------------------------------------------------------------

function RoleRow({
  row,
  user,
  scopeName,
  onRevoke,
  isPending,
}: {
  row: ProfileRoleRow
  user: UserLite | null
  scopeName: string
  onRevoke: () => void
  isPending: boolean
}) {
  const Icon = SCOPE_ICONS[row.scope]
  const roleLabel = row.role === 'custom' ? row.custom_label || 'Egyedi' : ROLE_LABELS[row.role]
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <div className="rounded-lg bg-slate-50 p-2 shrink-0">
        <Icon className="size-4 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-800 truncate">
            {user?.full_name || user?.email || row.profile_id.slice(0, 8)}
          </p>
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 border">{roleLabel}</Badge>
          <StatusBadge status={row.approval_status as ApprovalStatus} />
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {user?.email} · {SCOPE_LABELS[row.scope]}{scopeName ? ` — ${scopeName}` : ''}
        </p>
      </div>
      {row.approval_status === 'approved' && row.active && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-full border-red-200 text-red-600 hover:bg-red-50 gap-1"
          onClick={onRevoke}
          disabled={isPending}
        >
          <ShieldOff className="size-3.5" />
          Visszavon
        </Button>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const map: Record<ApprovalStatus, { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
    pending: { cls: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
    approved: { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Check },
    rejected: { cls: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
    revoked: { cls: 'bg-slate-200 text-slate-700 border-slate-300', icon: ShieldOff },
  }
  const { cls, icon: Icon } = map[status]
  return (
    <Badge className={`${cls} border gap-1`}>
      <Icon className="size-3" />
      {APPROVAL_STATUS_LABELS[status]}
    </Badge>
  )
}

function CreateProfileRoleDialog({
  open,
  onOpenChange,
  users,
  congregations,
  dioceses,
  districts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  users: UserLite[]
  congregations: CongLite[]
  dioceses: DioceseLite[]
  districts: DistrictLite[]
  onSaved: () => Promise<void>
}) {
  const [profileId, setProfileId] = useState('')
  const [scope, setScope] = useState<ProfileRoleScope>('congregation')
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [role, setRole] = useState<ProfileRoleType>('konyvelo')
  const [customLabel, setCustomLabel] = useState('')
  const [reason, setReason] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  // Szerep-opciók scope szerint
  const roleOptions = useMemo(() => {
    if (scope === 'system') return [{ value: 'admin' as ProfileRoleType, label: 'Rendszergazda' }]
    if (scope === 'district')
      return [
        { value: 'egyhazkeruleti_admin' as ProfileRoleType, label: 'Egyházkerületi admin' },
        { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep (szabadon nevezhető)' },
      ]
    if (scope === 'diocese')
      return [
        { value: 'esperes' as ProfileRoleType, label: 'Esperes' },
        { value: 'egyhazmegyei_admin' as ProfileRoleType, label: 'Egyházmegyei admin' },
        { value: 'egyhazmegyei_szamvevo' as ProfileRoleType, label: 'Egyházmegyei számvevő' },
        { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep (szabadon nevezhető)' },
      ]
    // congregation
    return [
      { value: 'lelkesz' as ProfileRoleType, label: 'Lelkipásztor' },
      { value: 'konyvelo' as ProfileRoleType, label: 'Könyvelő' },
      { value: 'custom' as ProfileRoleType, label: 'Egyedi szerep (pl. titkárnő)' },
    ]
  }, [scope])

  function handleScopeChange(next: ProfileRoleScope) {
    setScope(next)
    setScopeId(null)
    // A scope-hoz illeszkedő default role kiválasztása
    const defaults: Record<ProfileRoleScope, ProfileRoleType> = {
      system: 'admin',
      district: 'egyhazkeruleti_admin',
      diocese: 'egyhazmegyei_admin',
      congregation: 'konyvelo',
    }
    setRole(defaults[next])
  }

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return users.slice(0, 20)
    return users
      .filter((u) => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [users, userSearch])

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
        profileId,
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
      setProfileId('')
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
            Új szerepkör kiosztása
          </DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* User választó */}
          <div>
            <Label>Felhasználó</Label>
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Keresés név / email alapján..."
              className="mt-1"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setProfileId(u.id)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition hover:bg-slate-50 ${
                    profileId === u.id ? 'bg-indigo-50 text-indigo-700' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.full_name || '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                  {profileId === u.id && <Check className="size-4 text-indigo-600 shrink-0" />}
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="p-3 text-sm text-slate-400 italic">Nincs találat.</p>
              )}
            </div>
          </div>

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

          {/* Scope ID (ha nem system) */}
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

          {/* Role */}
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

          {/* Custom label (ha custom) */}
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
              <p className="mt-1 text-xs text-slate-500">
                Alapértelmezetten üres engedélyekkel jön létre — a Szerepkörök lista sorára kattintva
                finomhangolhatók a modul/action szintű jogok (egy következő iterációban).
              </p>
            </div>
          )}

          {/* Indok */}
          <div>
            <Label>Indoklás (opcionális)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Miért kapja ezt a szerepkört?"
              className="mt-1"
            />
          </div>

          {/* Pending figyelmeztetés */}
          {pastorApprovalNeeded && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-800">
              <strong>Lelkészi jóváhagyás szükséges</strong> — a hozzárendelés PENDING állapotban jön létre.
              A gyülekezet lelkésze a saját /profile/kapcsolatok oldalán hagyja jóvá vagy utasítja el.
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Mégse
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !profileId || (scope !== 'system' && !scopeId) || (role === 'custom' && !customLabel.trim())}
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
