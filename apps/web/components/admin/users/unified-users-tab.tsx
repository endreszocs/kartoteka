'use client'

/**
 * Felhasználók és szerepkörök — egyesített admin-nézet
 * (2026-07-11 admin-redesign: token-first, mobil-first).
 *
 * Változások a redesignban:
 *  - A „+ Új szerepkör" popover Dialog lett (nincs többé overflow-clipping).
 *  - Gyors jóváhagyás: BÁRMELY approveAccessRequest-hiba után visszaesünk a
 *    quickApproveUser-re (kerületi admin is tud jóváhagyni); dupla hiba esetén
 *    mindkét üzenet látszik. Az action `info` figyelmeztetése (pl. invite-hiba)
 *    toast-ban jelenik meg.
 *  - A halott „Részletes jóváhagyás" dialog (soha nem nyílt meg) és a
 *    fölösleges betöltéskori getDioceses + listAssignableProfiles hívások
 *    eltávolítva.
 *  - Betöltési hiba: eddig néma volt (üres listának látszott) — most toast +
 *    újrapróbálható hibaállapot.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowDownUp,
  Download,
  Filter,
  LayoutGrid,
  List,
  Search,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  deleteUser,
  getAllUsersWithScope,
  quickApproveUser,
  rejectPendingUser,
  type UserWithScope,
} from '@/app/(dashboard)/admin/actions'
import {
  approveAccessRequest,
  getAccessRequestDocumentUrl,
} from '@/app/(dashboard)/admin/access-requests-actions'
import {
  createProfileRole,
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
import { DeleteUserDialog } from './delete-user-dialog'
import { EmptyState } from './empty-state'
import { RejectPendingDialog } from './reject-pending-dialog'
import { RevokeRoleDialog } from './revoke-role-dialog'
import { UserCard } from './user-card'
import { UserCardSkeleton } from './user-card-skeleton'
import { UserListRow } from './user-list-row'
import type { QuickOption } from './role-assign-popover'

type StatusFilter = 'all' | 'active' | 'pending' | 'rejected' | 'other'
type RoleFilter = 'all' | ProfileRoleType | 'no-role'
type ViewMode = 'grid' | 'list'
type SortBy = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'status'

const SORT_OPTIONS: Array<[SortBy, string]> = [
  ['newest', 'Legújabb regisztráció'],
  ['oldest', 'Legrégebbi regisztráció'],
  ['name-asc', 'Név (A→Z)'],
  ['name-desc', 'Név (Z→A)'],
  ['status', 'Státusz szerint (teendők elöl)'],
]

// Státusz-rendezési prioritás: a teendők (várakozó) legelöl.
const STATUS_SORT_ORDER: Record<string, number> = {
  pending: 0,
  active: 1,
  rejected: 2,
  deleted: 3,
}

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

const STATUS_FILTERS: Array<[StatusFilter, string]> = [
  ['all', 'Mind'],
  ['active', 'Aktív'],
  ['pending', 'Várakozó'],
  ['rejected', 'Elutasítva'],
  ['other', 'Törölt / egyéb'],
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

// Token-alapú select-stílus a rendezéshez/szűrőhöz (dark-safe).
const SELECT_CLS =
  'h-9 rounded-xl border border-border bg-card px-2.5 text-xs text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30'

export function UnifiedUsersTab() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [users, setUsers] = useState<UserWithScope[]>([])
  const [allRoles, setAllRoles] = useState<ProfileRoleRow[]>([])
  const [scopeData, setScopeData] = useState<{
    congregations: CongLite[]
    dioceses: DioceseLite[]
    districts: DistrictLite[]
  }>({ congregations: [], dioceses: [], districts: [] })

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortBy>('newest')

  const [rejectTarget, setRejectTarget] = useState<UserWithScope | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserWithScope | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ row: ProfileRoleRow; user: UserWithScope } | null>(null)
  const [advancedTarget, setAdvancedTarget] = useState<UserWithScope | null>(null)

  const [isPending, startTransition] = useTransition()

  async function reload() {
    const [u, r, s] = await Promise.all([
      getAllUsersWithScope(),
      listProfileRoles(),
      listScopeOptions(),
    ])
    if ('error' in u && u.error) {
      setLoadError(u.error)
      toast.error(`A felhasználók betöltése nem sikerült: ${u.error}`)
    } else if ('data' in u && u.data) {
      setLoadError(null)
      setUsers(u.data)
    }
    if (r.data) setAllRoles(r.data)
    if (s.data) setScopeData(s.data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([getAllUsersWithScope(), listProfileRoles(), listScopeOptions()])
      .then(([u, r, s]) => {
        if (cancelled) return
        if ('error' in u && u.error) {
          setLoadError(u.error)
          toast.error(`A felhasználók betöltése nem sikerült: ${u.error}`)
        } else if ('data' in u && u.data) {
          setUsers(u.data)
        }
        if (r.data) setAllRoles(r.data)
        if (s.data) setScopeData(s.data)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Váratlan hálózati hiba történt.')
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

  // Rendezés a szűrt listán (a megjelenítéshez és az exporthoz is ezt használjuk).
  const displayed = useMemo(() => {
    const arr = [...filtered]
    const name = (u: UserWithScope) => (u.full_name || u.email || '').toLowerCase()
    const ts = (u: UserWithScope) => u.created_at || ''
    switch (sortBy) {
      case 'newest':
        arr.sort((a, b) => ts(b).localeCompare(ts(a)))
        break
      case 'oldest':
        arr.sort((a, b) => ts(a).localeCompare(ts(b)))
        break
      case 'name-asc':
        arr.sort((a, b) => name(a).localeCompare(name(b), 'hu'))
        break
      case 'name-desc':
        arr.sort((a, b) => name(b).localeCompare(name(a), 'hu'))
        break
      case 'status':
        arr.sort(
          (a, b) =>
            (STATUS_SORT_ORDER[a.status || ''] ?? 9) - (STATUS_SORT_ORDER[b.status || ''] ?? 9) ||
            ts(b).localeCompare(ts(a)),
        )
        break
    }
    return arr
  }, [filtered, sortBy])

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
      const displayName = user.full_name || user.email

      // Ha van regisztrációs kérelme, a TELJES jóváhagyást futtatjuk: ez egy
      // lépésben aktivál + hozzárendeli a kért gyülekezetet + megerősíti az
      // emailt (a kérelmet is 'approved'-ra állítja).
      if (user.pendingRequest) {
        const reqRes = await approveAccessRequest({
          id: user.pendingRequest.accessRequestId,
        })
        if (!reqRes.error) {
          if (reqRes.info) {
            // Bugfix 2026-07-11: az action `info` figyelmeztetése (pl. néma
            // invite-hiba) most már eljut az adminhoz.
            toast.warning(`A kérelem jóváhagyva, DE: ${reqRes.info}`, { duration: 12000 })
          } else {
            toast.success(`Jóváhagyva és aktiválva: ${displayName}`)
          }
          await reload()
          return
        }

        // Bugfix 2026-07-11: BÁRMELY kérelem-jóváhagyási hibánál (pl. kerületi
        // admin, akit az approveAccessRequest guardja nem enged; vagy már
        // 'approved' kérelem) visszaesünk a sima aktiválásra — korábban egy
        // törékeny /pending/i regex döntött, és a kerületi admin mindig hibát
        // kapott.
        const fallback = await quickApproveUser(user.id)
        if ('error' in fallback && fallback.error) {
          toast.error(
            `A kérelem jóváhagyása nem sikerült: ${reqRes.error} — A fiók aktiválása is hibázott: ${fallback.error}`,
            { duration: 12000 },
          )
          return
        }
        toast.warning(
          `A fiók aktiválva (${displayName}), de a kérelem teljes jóváhagyása nem sikerült: ${reqRes.error}`,
          { duration: 12000 },
        )
        await reload()
        return
      }

      const res = await quickApproveUser(user.id)
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      if ('info' in res && res.info) {
        toast.info(res.info)
      } else {
        toast.success(`Jóváhagyva és aktiválva: ${displayName}`)
      }
      await reload()
    })
  }

  function handleViewDocument(path: string) {
    // A felugró ablakot SZINKRON nyitjuk (popup-blokkoló elkerülése), majd a
    // rövid életű signed URL megérkezésekor odanavigáljuk.
    const win = window.open('about:blank', '_blank')
    if (!win) {
      toast.error(
        'A böngésző felugróablak-blokkolója megakadályozta a dokumentum megnyitását. Engedélyezze a felugró ablakokat ehhez az oldalhoz.',
      )
      return
    }
    startTransition(async () => {
      const res = await getAccessRequestDocumentUrl(path)
      if (res.error || !res.url) {
        toast.error(res.error || 'A dokumentum nem érhető el.')
        win.close()
        return
      }
      win.location.href = res.url
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
        const rows = displayed.map((u) => {
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
        toast.success(`Excel exportálva: ${displayed.length} felhasználó.`)
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
      {/* Pasztorális bevezető — téma-tokenekből */}
      <div className="rounded-2xl bg-primary/5 p-4 ring-1 ring-primary/15 sm:p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" />
          <div>
            <h2 className="font-heading text-lg text-foreground">Felhasználók és szerepkörök</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Egy felhasználónak több szerepköre is lehet (pl. lelkész egy gyülekezetben +
              esperes egy egyházmegyében). A<strong> „+ Új szerepkör”</strong> gomb két
              kattintással hozzárendel, a <em>Funkciók</em> gomb megmutatja, mit lát és mit
              szerkeszthet a felhasználó a jelenlegi szerepkörei alapján. Egy <em>várakozó</em>{' '}
              fiók szerepkör-kiosztással egyúttal aktiválódik is.
            </p>
          </div>
        </div>
      </div>

      {/* Művelet-sor — mobil-first: kereső felül teljes szélességben, alatta
          a szűrők flex-wrap sorban, legalul a státusz-chipek. */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full min-w-0 lg:max-w-xl lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Keresés név, email, gyülekezet, megye, kerület alapján…"
              aria-label="Keresés a felhasználók között"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground tabular-nums">
              {displayed.length} / {users.length}
            </span>

            {/* Rendezés */}
            <label className="inline-flex items-center gap-1.5">
              <ArrowDownUp className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="sr-only">Rendezés</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className={SELECT_CLS}
                aria-label="Rendezés"
              >
                {SORT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {/* Nézet-váltó: rács / lista */}
            <div className="inline-flex rounded-xl border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Kártya-nézet (rács)"
              >
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">Kártyák</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Lista-nézet"
              >
                <List className="size-3.5" />
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5">
              <Filter className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="sr-only">Szűrés szerepkörre</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className={SELECT_CLS}
                aria-label="Szűrés szerepkörre"
              >
                {ROLE_FILTER_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <Button size="sm" variant="outline" onClick={handleExport} className="min-h-9 gap-2">
              <Download className="size-3.5" />
              Excel export
            </Button>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2 border-t border-border pt-2"
          role="group"
          aria-label="Szűrés státuszra"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Státusz:
          </span>
          {STATUS_FILTERS.map(([key, label]) => {
            const count = counts[key]
            // A "Várakozó" (teendő) chip amberrel kiemelve, ha van mit elbírálni
            // — a piros hibát jelezne, a várakozó fiók viszont teendő.
            const isPendingTodo = key === 'pending' && count > 0
            const cls =
              statusFilter === key
                ? isPendingTodo
                  ? 'bg-amber-500 text-white dark:bg-amber-600'
                  : 'bg-primary text-primary-foreground'
                : isPendingTodo
                  ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800 dark:hover:bg-amber-950/80'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                aria-pressed={statusFilter === key}
                className={`min-h-8 rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cls}`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista / rács */}
      {loading ? (
        <UserCardSkeleton count={6} />
      ) : loadError ? (
        <div className="card-raised">
          <AdminEmptyState
            icon={AlertTriangle}
            title="A felhasználók betöltése nem sikerült"
            hint={loadError}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLoading(true)
                  void reload()
                }}
              >
                Újrapróbálás
              </Button>
            }
          />
        </div>
      ) : displayed.length === 0 ? (
        users.length === 0 ? (
          <EmptyState variant="noUsers" />
        ) : search ? (
          <EmptyState variant="noSearchMatch" searchQuery={search} onClearFilters={clearFilters} />
        ) : (
          <EmptyState variant="filteredEmpty" onClearFilters={clearFilters} />
        )
      ) : viewMode === 'grid' ? (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {displayed.map((u) => (
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
              onReject={() => setRejectTarget(u)}
              onDelete={() => setDeleteTarget(u)}
              onViewDocument={handleViewDocument}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* Oszlop-fejléc (csak desktopon) — a balra igazított sávokhoz illesztve */}
          <div className="hidden items-center gap-3 border-b border-l-[3px] border-border border-l-transparent bg-muted/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:flex">
            <span className="size-9 shrink-0" aria-hidden />
            <span className="flex-1">Felhasználó</span>
            <span className="w-[15rem] shrink-0">Gyülekezet</span>
            <span className="hidden w-[5.5rem] shrink-0 lg:block">Szerepkör</span>
            <span className="shrink-0 pr-1">Műveletek</span>
          </div>
          <div className="divide-y divide-border/60 [&>*:nth-child(even)]:bg-muted/30">
            {displayed.map((u) => (
              <UserListRow
                key={u.id}
                user={u}
                roles={rolesByUser.get(u.id) || []}
                scopeNameMap={scopeNameMap}
                quickOptions={quickOptions}
                isPending={isPending}
                onQuickAssign={(opt) => handleQuickAssign(u, opt)}
                onAdvanced={() => setAdvancedTarget(u)}
                onQuickApprove={() => handleQuickApprove(u)}
                onReject={() => setRejectTarget(u)}
                onDelete={() => setDeleteTarget(u)}
                onViewDocument={handleViewDocument}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modálok */}
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
