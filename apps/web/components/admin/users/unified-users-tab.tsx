'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Download, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  approveUser,
  deleteUser,
  getAllUsersWithScope,
  getDioceses,
  quickApproveUser,
  rejectPendingUser,
  type UserWithScope,
} from '@/app/(dashboard)/admin/actions'
import {
  createProfileRole,
  listAssignableProfiles,
  listProfileRoles,
  listScopeOptions,
  revokeProfileRole,
} from '@/app/(dashboard)/admin/profile-roles-actions'

import {
  ROLE_LABELS,
  type ProfileRoleRow,
  type ProfileRoleType,
} from '@/lib/profile-roles/types'

import { AdvancedRoleDialog } from './advanced-role-dialog'
import { ApprovePendingDialog } from './approve-pending-dialog'
import { DeleteUserDialog } from './delete-user-dialog'
import { EmptyState } from './empty-state'
import { RejectPendingDialog } from './reject-pending-dialog'
import { RevokeRoleDialog } from './revoke-role-dialog'
import { UserCard } from './user-card'
import { UserCardSkeleton } from './user-card-skeleton'
import type { QuickOption } from './role-assign-popover'

type StatusFilter = 'all' | 'active' | 'pending' | 'rejected' | 'other'
type RoleFilter = 'all' | ProfileRoleType | 'no-role'

interface CongLite {
  id: string
  name: string
  diocese_id: string | null
}
interface DioceseLite {
  id: string
  name: string
  district_id: string | null
}
interface DistrictLite {
  id: string
  name: string
}
interface DioceseSimple {
  id: string
  name: string
}

const STATUS_FILTERS: Array<[StatusFilter, string]> = [
  ['all', 'Mind'],
  ['active', 'Aktív'],
  ['pending', 'Várakozó'],
  ['rejected', 'Elutasítva'],
  ['other', 'Egyéb'],
]

const ROLE_FILTER_OPTIONS: Array<[RoleFilter, string]> = [
  ['all', 'Minden szerepkör'],
  ['no-role', 'Szerepkör nélkül'],
  ['admin', ROLE_LABELS.admin],
  ['egyhazkeruleti_admin', ROLE_LABELS.egyhazkeruleti_admin],
  ['esperes', ROLE_LABELS.esperes],
  ['egyhazmegyei_admin', ROLE_LABELS.egyhazmegyei_admin],
  ['egyhazmegyei_szamvevo', ROLE_LABELS.egyhazmegyei_szamvevo],
  ['lelkesz', ROLE_LABELS.lelkesz],
  ['konyvelo', ROLE_LABELS.konyvelo],
  ['custom', ROLE_LABELS.custom],
]

export function UnifiedUsersTab() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserWithScope[]>([])
  const [allRoles, setAllRoles] = useState<ProfileRoleRow[]>([])
  const [dioceses, setDioceses] = useState<DioceseSimple[]>([])
  const [scopeData, setScopeData] = useState<{
    congregations: CongLite[]
    dioceses: DioceseLite[]
    districts: DistrictLite[]
  }>({ congregations: [], dioceses: [], districts: [] })

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  const [approveTarget, setApproveTarget] = useState<UserWithScope | null>(null)
  const [rejectTarget, setRejectTarget] = useState<UserWithScope | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserWithScope | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ row: ProfileRoleRow; user: UserWithScope } | null>(null)
  const [advancedTarget, setAdvancedTarget] = useState<UserWithScope | null>(null)

  const [isPending, startTransition] = useTransition()

  async function reload() {
    const [u, d, r, s] = await Promise.all([
      getAllUsersWithScope(),
      getDioceses(),
      listProfileRoles(),
      listScopeOptions(),
    ])
    if ('data' in u && u.data) setUsers(u.data)
    setDioceses(d)
    if (r.data) setAllRoles(r.data)
    if (s.data) setScopeData(s.data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getAllUsersWithScope(),
      getDioceses(),
      listProfileRoles(),
      listScopeOptions(),
      // listAssignableProfiles is just to warm up the cache — not used here directly
      listAssignableProfiles(),
    ])
      .then(([u, d, r, s]) => {
        if (cancelled) return
        if ('data' in u && u.data) setUsers(u.data)
        setDioceses(d)
        if (r.data) setAllRoles(r.data)
        if (s.data) setScopeData(s.data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scopeNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of scopeData.congregations) m.set(c.id, c.name)
    for (const d of scopeData.dioceses) m.set(d.id, d.name)
    for (const d of scopeData.districts) m.set(d.id, d.name)
    return m
  }, [scopeData])

  const rolesByUser = useMemo(() => {
    const m = new Map<string, ProfileRoleRow[]>()
    for (const r of allRoles) {
      const arr = m.get(r.profile_id) || []
      arr.push(r)
      m.set(r.profile_id, arr)
    }
    return m
  }, [allRoles])

  const quickOptions = useMemo<QuickOption[]>(() => {
    const opts: QuickOption[] = []
    opts.push({
      key: 'system::admin',
      scope: 'system',
      scopeId: null,
      role: 'admin',
      label: 'Rendszergazda',
      hint: 'Teljes hozzáférés',
    })
    for (const d of scopeData.districts) {
      opts.push({
        key: `district::${d.id}::egyhazkeruleti_admin`,
        scope: 'district',
        scopeId: d.id,
        role: 'egyhazkeruleti_admin',
        label: `Egyházkerületi admin — ${d.name}`,
      })
    }
    for (const d of scopeData.dioceses) {
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
    for (const c of scopeData.congregations) {
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
  }, [scopeData, scopeNameMap])

  const filtered = useMemo(() => {
    let arr = users

    if (statusFilter === 'active') arr = arr.filter((u) => u.status === 'active')
    else if (statusFilter === 'pending') arr = arr.filter((u) => u.status === 'pending')
    else if (statusFilter === 'rejected') arr = arr.filter((u) => u.status === 'rejected')
    else if (statusFilter === 'other')
      arr = arr.filter(
        (u) => u.status !== 'active' && u.status !== 'pending' && u.status !== 'rejected',
      )

    if (roleFilter === 'no-role') {
      arr = arr.filter((u) => {
        const userRoles = rolesByUser.get(u.id) || []
        const hasActive = userRoles.some(
          (r) => r.approval_status === 'approved' && r.active,
        )
        return !hasActive && !u.role
      })
    } else if (roleFilter !== 'all') {
      arr = arr.filter((u) => {
        const userRoles = rolesByUser.get(u.id) || []
        if (userRoles.some((r) => r.role === roleFilter)) return true
        if (u.role === roleFilter) return true
        return false
      })
    }

    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter((u) => {
        const userRoles = rolesByUser.get(u.id) || []
        const roleNames = userRoles
          .map((r) => {
            const lbl =
              r.role === 'custom' ? r.custom_label || 'Egyedi' : ROLE_LABELS[r.role]
            const scopeName = r.scope_id ? scopeNameMap.get(r.scope_id) || '' : ''
            return `${lbl} ${scopeName}`
          })
          .join(' ')
        const searchable = [
          u.full_name || '',
          u.email,
          u.primary_congregation_name || '',
          u.primary_diocese_name || '',
          u.primary_district_name || '',
          u.role || '',
          roleNames,
        ]
          .join(' ')
          .toLowerCase()
        return searchable.includes(q)
      })
    }

    return arr
  }, [users, search, statusFilter, roleFilter, rolesByUser, scopeNameMap])

  const counts = useMemo(() => {
    return {
      all: users.length,
      active: users.filter((u) => u.status === 'active').length,
      pending: users.filter((u) => u.status === 'pending').length,
      rejected: users.filter((u) => u.status === 'rejected').length,
      other: users.filter(
        (u) => u.status !== 'active' && u.status !== 'pending' && u.status !== 'rejected',
      ).length,
    }
  }, [users])

  function handleQuickApprove(user: UserWithScope) {
    startTransition(async () => {
      const res = await quickApproveUser(user.id)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success(`Fiók aktiválva: ${user.full_name || user.email}`)
        await reload()
      }
    })
  }

  function handleDetailedApprove(dioceseId: string, congregationName: string) {
    if (!approveTarget) return
    startTransition(async () => {
      const res = await approveUser(approveTarget.id, dioceseId, congregationName)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success(`Fiók jóváhagyva: ${approveTarget.full_name || approveTarget.email}`)
        setApproveTarget(null)
        await reload()
      }
    })
  }

  function handleReject(reason: string) {
    if (!rejectTarget) return
    startTransition(async () => {
      const res = await rejectPendingUser(rejectTarget.id, reason)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Hozzáférés-kérelem elutasítva.')
        setRejectTarget(null)
        await reload()
      }
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    startTransition(async () => {
      const res = await deleteUser(deleteTarget.id)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Felhasználó törölve.')
        setDeleteTarget(null)
        await reload()
      }
    })
  }

  function handleRevoke(reason: string) {
    if (!revokeTarget) return
    const target = revokeTarget
    startTransition(async () => {
      const res = await revokeProfileRole({ profileRoleId: target.row.id, reason })
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Szerepkör visszavonva.')
        setRevokeTarget(null)
        await reload()
      }
    })
  }

  function handleQuickAssign(user: UserWithScope, opt: QuickOption) {
    startTransition(async () => {
      const res = await createProfileRole({
        profileId: user.id,
        scope: opt.scope,
        scopeId: opt.scopeId,
        role: opt.role,
        customLabel: null,
        reason: undefined,
      })
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      if (res.accountActivated) {
        toast.success(`Szerepkör kiosztva (${opt.label}), és a fiók aktiválva.`)
      } else {
        toast.success(`Szerepkör kiosztva: ${opt.label}`)
      }
      await reload()
    })
  }

  function handleExport() {
    startTransition(async () => {
      try {
        const XLSX = await import('xlsx')
        const rows = filtered.map((u) => {
          const userRoles = rolesByUser.get(u.id) || []
          return {
            ID: u.id,
            'Teljes név': u.full_name || '',
            Email: u.email,
            'Elsődleges szerepkör': u.role
              ? ROLE_LABELS[u.role as ProfileRoleType] || u.role
              : '',
            Státusz:
              u.status === 'active'
                ? 'Aktív'
                : u.status === 'pending'
                  ? 'Várakozó'
                  : u.status === 'rejected'
                    ? 'Elutasítva'
                    : u.status || '',
            Egyházkerület: u.primary_district_name || '',
            Egyházmegye: u.primary_diocese_name || '',
            Egyházközség: u.primary_congregation_name || '',
            'Kiosztott szerepkörök': userRoles
              .filter((r) => r.approval_status === 'approved' && r.active)
              .map((r) => {
                const lbl =
                  r.role === 'custom' ? r.custom_label || 'Egyedi' : ROLE_LABELS[r.role]
                const scopeName = r.scope_id ? scopeNameMap.get(r.scope_id) || '' : ''
                return scopeName ? `${lbl} (${scopeName})` : lbl
              })
              .join(' • '),
            Regisztrált: u.created_at ? new Date(u.created_at).toLocaleString('hu-HU') : '',
          }
        })
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Felhasználók')
        const date = new Date().toISOString().slice(0, 10)
        XLSX.writeFile(wb, `kartoteka-felhasznalok-${date}.xlsx`)
        toast.success(`Excel exportálva: ${filtered.length} felhasználó.`)
      } catch (err) {
        toast.error(`Export hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`)
      }
    })
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setRoleFilter('all')
  }

  return (
    <div className="space-y-5">
      {/* Pasztorális hero */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 text-indigo-600 mt-0.5" />
          <div>
            <h2 className="font-heading text-lg text-slate-800">Felhasználók és szerepkörök</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Egy felhasználónak több szerepköre is lehet (pl. lelkész egy gyülekezetben + esperes egy egyházmegyében). A
              <strong> „+ Új szerepkör”</strong> gomb két kattintással hozzárendel, a részletes jóváhagyáshoz a <em>Részletes</em> gombbal nyithat dialógust. Egy <em>várakozó</em> fiók szerepkör-kiosztással egyúttal aktiválódik is.
            </p>
          </div>
        </div>
      </div>

      {/* Művelet-sor */}
      <div className="card-raised p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-[16rem] max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Keresés név, email, gyülekezet, megye, kerület alapján…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              {filtered.length} / {users.length}
            </span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="rounded-xl border border-slate-200 bg-zinc-50 px-3 py-1.5 text-xs"
              aria-label="Szűrés szerepkörre"
            >
              {ROLE_FILTER_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={handleExport} className="gap-2">
              <Download className="size-3.5" />
              Excel export
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Státusz:
          </span>
          {STATUS_FILTERS.map(([key, label]) => {
            const count = counts[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  statusFilter === key
                    ? 'bg-violet-600 text-white'
                    : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                }`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <UserCardSkeleton count={5} />
      ) : filtered.length === 0 ? (
        users.length === 0 ? (
          <EmptyState variant="noUsers" />
        ) : search ? (
          <EmptyState variant="noSearchMatch" searchQuery={search} onClearFilters={clearFilters} />
        ) : (
          <EmptyState variant="filteredEmpty" onClearFilters={clearFilters} />
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              roles={rolesByUser.get(u.id) || []}
              scopeNameMap={scopeNameMap}
              quickOptions={quickOptions}
              isPending={isPending}
              onQuickAssign={(opt) => handleQuickAssign(u, opt)}
              onAdvanced={() => setAdvancedTarget(u)}
              onRevokeRole={(row) => setRevokeTarget({ row, user: u })}
              onQuickApprove={() => handleQuickApprove(u)}
              onDetailedApprove={() => setApproveTarget(u)}
              onReject={() => setRejectTarget(u)}
              onDelete={() => setDeleteTarget(u)}
            />
          ))}
        </div>
      )}

      {/* Modálok */}
      {approveTarget && (
        <ApprovePendingDialog
          open={!!approveTarget}
          onOpenChange={(o) => !o && setApproveTarget(null)}
          userName={approveTarget.full_name || ''}
          userEmail={approveTarget.email}
          dioceses={dioceses}
          isPending={isPending}
          onConfirm={handleDetailedApprove}
        />
      )}

      {rejectTarget && (
        <RejectPendingDialog
          open={!!rejectTarget}
          onOpenChange={(o) => !o && setRejectTarget(null)}
          userName={rejectTarget.full_name || ''}
          userEmail={rejectTarget.email}
          isPending={isPending}
          onConfirm={handleReject}
        />
      )}

      {deleteTarget && (
        <DeleteUserDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          userName={deleteTarget.full_name || ''}
          userEmail={deleteTarget.email}
          isPending={isPending}
          onConfirm={handleDelete}
        />
      )}

      {revokeTarget && (
        <RevokeRoleDialog
          open={!!revokeTarget}
          onOpenChange={(o) => !o && setRevokeTarget(null)}
          roleLabel={
            revokeTarget.row.role === 'custom'
              ? revokeTarget.row.custom_label || 'Egyedi'
              : ROLE_LABELS[revokeTarget.row.role]
          }
          scopeName={
            revokeTarget.row.scope_id ? scopeNameMap.get(revokeTarget.row.scope_id) || null : null
          }
          userName={revokeTarget.user.full_name || revokeTarget.user.email}
          isPending={isPending}
          onConfirm={handleRevoke}
        />
      )}

      {advancedTarget && (
        <AdvancedRoleDialog
          open={!!advancedTarget}
          onOpenChange={(o) => !o && setAdvancedTarget(null)}
          user={{
            id: advancedTarget.id,
            full_name: advancedTarget.full_name,
            email: advancedTarget.email,
            status: advancedTarget.status,
          }}
          congregations={scopeData.congregations}
          dioceses={scopeData.dioceses}
          districts={scopeData.districts}
          onSaved={async () => {
            setAdvancedTarget(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}
