'use client'

/**
 * Admin "Felhasználók" tab — v0.9.45 ÚJRAGONDOLT.
 *
 * A felhasználó kérése:
 *   1. Minden felhasználó megjelenjen (status-tól függetlenül)
 *   2. Minden user-nél az egyházkerület, egyházmegye, egyházközség (gyülekezet)
 *   3. Felhasználó törlése a rendszerből
 *   4. Excel export
 *
 * UI:
 *   - Egy teljes user-lista
 *   - Status chip-szűrő (Mind / Aktív / Pending / Egyéb)
 *   - Keresés (név, email, gyülekezet)
 *   - Sortable oszlopok
 *   - Sor-akciók: szerepkör (active-on), Jóváhagyás (pending-en), Törlés
 *   - "Excel export" gomb
 */

import { useState, useEffect, useMemo, useTransition } from 'react'
import {
  Building2,
  Castle,
  Church,
  Download,
  Loader2,
  Search,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  approveUser,
  deleteUser,
  getAllUsersWithScope,
  getDioceses,
  quickApproveUser,
  updateUserRole,
  type UserWithScope,
} from '@/app/(dashboard)/admin/actions'

interface Diocese { id: string; name: string }

const ROLES = [
  { value: 'lelkesz', label: 'Lelkész' },
  { value: 'esperes', label: 'Esperes' },
  { value: 'egyhazmegyei_admin', label: 'Egyházmegyei admin' },
  { value: 'egyhazkeruleti_admin', label: 'Egyházkerületi admin' },
  { value: 'admin', label: 'Rendszergazda' },
  { value: 'konyvelo', label: 'Könyvelő' },
  { value: 'egyhazmegyei_szamvevo', label: 'Egyházmegyei számvevő' },
]

type StatusFilter = 'all' | 'active' | 'pending' | 'other'

export function UsersTab() {
  const [users, setUsers] = useState<UserWithScope[]>([])
  const [dioceses, setDioceses] = useState<Diocese[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()

  // Jóváhagyás állapotok
  const [approveId, setApproveId] = useState<string | null>(null)
  const [selectedDiocese, setSelectedDiocese] = useState('')
  const [approving, setApproving] = useState(false)

  async function reload() {
    const [uRes, dRes] = await Promise.all([getAllUsersWithScope(), getDioceses()])
    if ('data' in uRes && uRes.data) setUsers(uRes.data)
    setDioceses(dRes)
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  // ── Szűrés ──
  const filtered = useMemo(() => {
    let arr = users
    if (statusFilter === 'active') arr = arr.filter((u) => u.status === 'active')
    else if (statusFilter === 'pending') arr = arr.filter((u) => u.status === 'pending')
    else if (statusFilter === 'other')
      arr = arr.filter((u) => u.status !== 'active' && u.status !== 'pending')

    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter((u) => {
        const searchable = [
          u.full_name || '',
          u.email,
          u.primary_congregation_name || '',
          u.primary_diocese_name || '',
          u.primary_district_name || '',
          u.role || '',
          u.profile_roles.map((r) => `${r.role} ${r.scope_name || ''}`).join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return searchable.includes(q)
      })
    }
    return arr
  }, [users, search, statusFilter])

  // Counts
  const counts = useMemo(() => {
    return {
      all: users.length,
      active: users.filter((u) => u.status === 'active').length,
      pending: users.filter((u) => u.status === 'pending').length,
      other: users.filter((u) => u.status !== 'active' && u.status !== 'pending').length,
    }
  }, [users])

  async function handleQuickApprove(u: UserWithScope) {
    if (!confirm(`Biztosan jóváhagyod a felhasználót gyülekezet hozzárendelése nélkül?\n\n${u.full_name || u.email}\n\nA wizard-on a felhasználó később választhat gyülekezetet.`)) return
    const res = await quickApproveUser(u.id)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Felhasználó aktiválva.')
      await reload()
    }
  }

  async function handleApprove(userId: string) {
    if (!selectedDiocese) { toast.error('Válasszon egyházmegyét!'); return }
    setApproving(true)
    const u = users.find((x) => x.id === userId)
    const res = await approveUser(userId, selectedDiocese, u?.full_name || 'Új gyülekezet')
    setApproving(false)
    if ('error' in res && res.error) {
      toast.error(res.error)
    } else {
      toast.success('Felhasználó jóváhagyva!')
      setApproveId(null)
      setSelectedDiocese('')
      await reload()
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const res = await updateUserRole(userId, newRole)
    if ('error' in res && res.error) toast.error(res.error)
    else {
      toast.success('Szerepkör módosítva.')
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      )
    }
  }

  function handleDelete(u: UserWithScope) {
    if (
      !confirm(
        `BIZTOSAN törölni akarod ezt a felhasználót?\n\n${u.full_name || u.email}\nEmail: ${u.email}\n\nEz a művelet VISSZAFORDÍTHATATLAN!\n` +
          'A felhasználó az auth-rendszerből és a profiljából is törlődik. Az értesítések, profile_roles, és minden hozzá kötött adat törlődik.',
      )
    )
      return
    startTransition(async () => {
      const res = await deleteUser(u.id)
      if ('error' in res && res.error) {
        toast.error(res.error)
      } else {
        toast.success('Felhasználó törölve.')
        await reload()
      }
    })
  }

  function handleExport() {
    startTransition(async () => {
      try {
        const XLSX = await import('xlsx')
        const rows = filtered.map((u) => ({
          ID: u.id,
          'Teljes név': u.full_name || '',
          Email: u.email,
          'Elsődleges szerepkör': ROLES.find((r) => r.value === u.role)?.label || u.role || '',
          Státusz: u.status === 'active' ? 'Aktív' : u.status === 'pending' ? 'Várakozó' : u.status || '',
          'Egyházkerület': u.primary_district_name || '',
          'Egyházmegye': u.primary_diocese_name || '',
          'Egyházközség': u.primary_congregation_name || '',
          'További szerepkörök': u.profile_roles
            .map((r) => {
              const roleLbl = r.custom_label || ROLES.find((x) => x.value === r.role)?.label || r.role
              return r.scope_name ? `${roleLbl} (${r.scope_name})` : roleLbl
            })
            .join(' • '),
          Regisztrált: u.created_at ? new Date(u.created_at).toLocaleString('hu-HU') : '',
        }))
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

  if (loading) return <div className="py-12 text-center text-muted-foreground">Betöltés…</div>

  return (
    <div className="space-y-4">
      {/* Művelet-sor: keresés + szűrők + export */}
      <div className="card-raised p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-[16rem] max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Keresés név, email, gyülekezet, megye, kerület alapján..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              {filtered.length} / {users.length}
            </span>
            <Button size="sm" variant="outline" onClick={handleExport} className="gap-2">
              <Download className="size-3.5" />
              Excel export
            </Button>
          </div>
        </div>

        {/* Status-szűrő chip-ek */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Státusz:</span>
          {(
            [
              ['all', `Mind (${counts.all})`],
              ['active', `Aktív (${counts.active})`],
              ['pending', `Várakozó (${counts.pending})`],
              ['other', `Egyéb (${counts.other})`],
            ] as Array<[StatusFilter, string]>
          ).map(([key, label]) => (
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
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card-raised p-8 text-sm text-slate-500 text-center italic">
          Nincs találat a kiválasztott szűrőkre.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              dioceses={dioceses}
              isApproveOpen={approveId === u.id}
              onToggleApprove={() => {
                if (approveId === u.id) setApproveId(null)
                else { setApproveId(u.id); setSelectedDiocese('') }
              }}
              selectedDiocese={selectedDiocese}
              onSelectDiocese={setSelectedDiocese}
              onApprove={() => handleApprove(u.id)}
              onQuickApprove={() => handleQuickApprove(u)}
              approving={approving}
              onRoleChange={(role) => handleRoleChange(u.id, role)}
              onDelete={() => handleDelete(u)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// User-sor
// ──────────────────────────────────────────────────────────────────────────

function UserRow({
  user,
  dioceses,
  isApproveOpen,
  onToggleApprove,
  selectedDiocese,
  onSelectDiocese,
  onApprove,
  onQuickApprove,
  approving,
  onRoleChange,
  onDelete,
}: {
  user: UserWithScope
  dioceses: Diocese[]
  isApproveOpen: boolean
  onToggleApprove: () => void
  selectedDiocese: string
  onSelectDiocese: (id: string) => void
  onApprove: () => void
  onQuickApprove: () => void
  approving: boolean
  onRoleChange: (role: string) => void
  onDelete: () => void
}) {
  const isActive = user.status === 'active'
  const isPending = user.status === 'pending'

  return (
    <div className="card-raised p-4 sm:p-5">
      {/* Fejléc — név + email + status */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <Users className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 truncate">
              {user.full_name || '(nincs név)'}
            </p>
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.18em] rounded-full px-2 py-0.5 ${
                isActive
                  ? 'bg-emerald-100 text-emerald-700'
                  : isPending
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {isActive ? 'Aktív' : isPending ? 'Várakozó' : user.status || 'Ismeretlen'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          {user.created_at && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Regisztrált: {new Date(user.created_at).toLocaleString('hu-HU')}
            </p>
          )}
        </div>

        {/* Akciók a jobb oldalon */}
        <div className="flex flex-col gap-1.5 items-end">
          {isPending && (
            <>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onQuickApprove}
              >
                <UserCheck className="mr-1 size-3.5" />
                Gyors jóváhagyás
              </Button>
              <Button size="sm" variant="outline" onClick={onToggleApprove}>
                {isApproveOpen ? 'Mégse' : 'Részletes jóváhagyás...'}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 size-3.5" />
            Törlés
          </Button>
        </div>
      </div>

      {/* Jóváhagyás form (pending + isApproveOpen) */}
      {isPending && isApproveOpen && (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-200">
          <div>
            <label className="text-xs font-medium">Egyházmegye *</label>
            <select
              value={selectedDiocese}
              onChange={(e) => onSelectDiocese(e.target.value)}
              className="w-full mt-1 rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Válasszon...</option>
              {dioceses.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={onApprove}
            disabled={approving || !selectedDiocese}
          >
            {approving ? 'Jóváhagyás...' : 'Jóváhagyás véglegesítése'}
          </Button>
        </div>
      )}

      {/* Hierarchikus kontextus — csak ha van */}
      {(user.primary_district_name || user.primary_diocese_name || user.primary_congregation_name || user.profile_roles.length > 0) && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
          {/* Elsődleges scope-lánc */}
          {(user.primary_district_name || user.primary_diocese_name || user.primary_congregation_name) && (
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
                  {(user.primary_district_name || user.primary_diocese_name) && <span className="text-slate-300">›</span>}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1">
                    <Church className="size-3" />
                    {user.primary_congregation_name}
                  </span>
                </>
              )}
              {/* Elsődleges szerepkör (active esetén szerkeszthető) */}
              {isActive && (
                <>
                  <span className="text-slate-300">·</span>
                  <select
                    value={user.role || 'lelkesz'}
                    onChange={(e) => onRoleChange(e.target.value)}
                    className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          {/* További (multi-role) szerepkörök */}
          {user.profile_roles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Szerepkörök:</span>
              {user.profile_roles.map((r, idx) => {
                const lbl = r.custom_label || ROLES.find((x) => x.value === r.role)?.label || r.role
                return (
                  <span
                    key={idx}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                      r.approval_status === 'approved'
                        ? 'bg-violet-50 text-violet-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    <strong>{lbl}</strong>
                    {r.scope_name && <span className="opacity-75">— {r.scope_name}</span>}
                    {r.approval_status === 'pending' && <span className="text-[9px] opacity-75">(várakozik)</span>}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
