/**
 * Tagnyilvántartás (members) lista-oldal — `/tagnyilvantartas` route.
 *
 * M8.0a (2026-04-25) — első iteráció lista + detail modal.
 * UI paritás update (2026-04-25 este) — a webes `persons-tab.tsx` mintájára
 * táblázatos megjelenítés, sortolható oszlopokkal, születésnap-ikonnal,
 * hover-szerkesztő akciókkal. A célt az adja, hogy a lelkész ugyanazt
 * a felületet lássa a weben és a desktopon.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Cake,
  ChevronRight,
  Home,
  Pencil,
  Search,
  UserPlus,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Input } from '@kartoteka/ui'
import { PageHero } from '@kartoteka/ui-app'
import {
  SZEMELY_STATUS_FILTER_LABELS,
  SZEMELY_STATUS_FILTER_VALUES,
  type SzemelyListRow,
  type SzemelyStatusFilter,
} from '@kartoteka/validations'

import { MemberCreateDialog } from '../components/member-create-dialog'
import { MemberDetailDialog } from '../components/member-detail-dialog'
import { SzemelyConflictDialog } from '../components/szemely-conflict-dialog'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getLocalOwnProfile } from '../lib/sync'
import { useDataVersion, notifyLocalDataChanged } from '../lib/sync-orchestrator'
import { startSzemelyAutoSync } from '../lib/szemely-write-sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

type SortColumn = 'name' | 'age' | 'address' | 'id'
type SortDir = 'asc' | 'desc'

export function MembersPage() {
  const navigate = useNavigate()
  const dataVersion = useDataVersion()
  const [userId, setUserId] = useState<string | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [rows, setRows] = useState<SzemelyListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SzemelyStatusFilter>('aktiv')
  const [sortCol, setSortCol] = useState<SortColumn>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  type PendingRow = Awaited<
    ReturnType<ReturnType<typeof getTauriSqliteBackend>['listLocalPendingSzemely']>
  >[number]
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([])
  const [conflictRow, setConflictRow] = useState<PendingRow | null>(null)

  // Auth + congregation_id
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!mounted || !data.user) return
        setUserId(data.user.id)
        try {
          const profile = await getLocalOwnProfile(data.user.id)
          if (mounted) setCongregationId(profile?.congregation_id ?? null)
        } catch {
          /* csendes */
        }
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      mounted = false
    }
  }, [])

  // Lista-betöltés (csak lokál, gyors)
  const loadList = useCallback(async () => {
    if (!congregationId) return
    setLoading(true)
    setError(null)
    try {
      const list = await getTauriSqliteBackend().listLocalSzemely({
        congregationId,
        // A search + sort a JS-ben, hogy a webes mintát követhessük
        search: search.trim() || undefined,
        statusFilter,
        orderBy: 'csaladnev-asc',
        limit: 2000,
      })
      setRows(list)
    } catch (err) {
      setError(`Tagnyilvántartás betöltési hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId, search, statusFilter])

  // Lista-újraolvasás: keresés, szűrő VAGY háttér-sync változására (dataVersion)
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadList()
    }, 300)
    return () => clearTimeout(timer)
  }, [loadList, dataVersion])

  // Pending új-tag sorok
  const loadPending = useCallback(async () => {
    if (!congregationId) return
    try {
      const list = await getTauriSqliteBackend().listLocalPendingSzemely(congregationId)
      setPendingRows(list)
    } catch {
      /* csendes */
    }
  }, [congregationId])

  useEffect(() => {
    void loadPending()
  }, [loadPending, dataVersion])

  // Write-sync háttér-task (offline írásokat felküld online-kor)
  useEffect(() => {
    if (!congregationId) return
    startSzemelyAutoSync(congregationId)
  }, [congregationId])

  // Sortolt lista
  const sortedRows = useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      let vA: string | number
      let vB: string | number
      switch (sortCol) {
        case 'name':
          vA = ((a.ferfi === 0 && a.ferjk_nev) || a.csaladnev || '').toLowerCase()
          vB = ((b.ferfi === 0 && b.ferjk_nev) || b.csaladnev || '').toLowerCase()
          break
        case 'age':
          vA = a.sz_datum || '9999'
          vB = b.sz_datum || '9999'
          break
        case 'address':
          vA = (a.c_szcim || '').toLowerCase()
          vB = (b.c_szcim || '').toLowerCase()
          break
        case 'id':
        default:
          vA = a.id
          vB = b.id
      }
      if (vA < vB) return sortDir === 'asc' ? -1 : 1
      if (vA > vB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return out
  }, [rows, sortCol, sortDir])

  const selectedMember =
    selectedId !== null ? rows.find((r) => r.id === selectedId) ?? null : null

  function toggleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // PageHero stats — élő számok
  const heroStats = useMemo(() => {
    const total = rows.length
    const aktiv = rows.filter((r) => r.meghalt !== 1 && r.member_status !== 'törölt').length
    const csaladfo = rows.filter((r) => r.csaladfo === 1).length
    const valaszto = rows.filter((r) => r.voter_eligible === 1).length
    return [
      { label: 'Aktív', value: aktiv > 0 ? aktiv.toLocaleString('hu') : '—' },
      { label: 'Családfők', value: csaladfo > 0 ? csaladfo.toLocaleString('hu') : '—' },
      { label: 'Választók', value: valaszto > 0 ? valaszto.toLocaleString('hu') : '—' },
      { label: 'Összes', value: total > 0 ? total.toLocaleString('hu') : '—' },
    ]
  }, [rows])

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Közösség"
          title="Tagnyilvántartás"
          description="A gyülekezet tagjai. Kattints egy sorra a részletekhez, vagy vegyél fel új tagot. Offline is működik — a szinkron automatikus."
          Icon={Users}
          stats={heroStats}
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/csaladok')}
              className="gap-2"
            >
              <Home className="size-4" />
              Családok
              <ChevronRight className="size-3.5 opacity-60" />
            </Button>
          }
        />

        {/* Toolbar — search + státusz + Új tag (webes persons-tab mintájára) */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex flex-1 items-center gap-3 flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="Keresés név, cím, telefon, e-mail…"
                className="h-10 rounded-xl border-zinc-200 bg-zinc-50 pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.currentTarget.value as SzemelyStatusFilter)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm shadow-sm"
            >
              {SZEMELY_STATUS_FILTER_VALUES.map((v) => (
                <option key={v} value={v}>
                  {SZEMELY_STATUS_FILTER_LABELS[v]}
                </option>
              ))}
            </select>
            <span className="text-sm text-zinc-400">
              {sortedRows.length} / {rows.length} fő
            </span>
          </div>
          {congregationId && (
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-10 shrink-0 gap-2 rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-700"
            >
              <UserPlus className="size-4" />
              Új tag
            </Button>
          )}
        </div>

        {/* Pending új-tag blokk */}
        {pendingRows.length > 0 && (
          <PendingBlock
            pendingRows={pendingRows}
            onConflictClick={(r) => setConflictRow(r as PendingRow)}
          />
        )}

        {/* Hiba-banner */}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* Táblázat */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-sm">Tagok betöltése…</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white/60 p-12 text-center shadow-sm">
            <Search className="mx-auto mb-3 size-12 text-zinc-200" />
            <p className="font-medium text-zinc-500">Nincs a keresésnek megfelelő tag.</p>
            <p className="mt-1 text-xs text-zinc-400">Próbáld más keresőszóval vagy szűrővel.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white/60 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-white/80">
                  <tr>
                    <SortableHeader label="Név" col="name" current={sortCol} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader
                      label="Lakcím"
                      col="address"
                      current={sortCol}
                      dir={sortDir}
                      onClick={toggleSort}
                      hiddenOnMobile
                    />
                    <SortableHeader
                      label="Kor"
                      col="age"
                      current={sortCol}
                      dir={sortDir}
                      onClick={toggleSort}
                      hiddenOnMobile
                    />
                    <th className="p-3 text-left text-xs font-medium text-zinc-500">Státusz</th>
                    <th className="hidden p-3 text-left text-xs font-medium text-zinc-500 lg:table-cell">
                      Foglalkozás
                    </th>
                    <th className="w-10 p-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sortedRows.map((m) => {
                    const name = formatFullName(m)
                    const initials = getInitials(m)
                    const avatarC = getAvatarColors(m)
                    const age = m.sz_datum ? ageFromIso(m.sz_datum) : null
                    const bday = isBirthdayThisMonth(m)
                    const isDeceased = m.meghalt === 1
                    return (
                      <tr
                        key={m.id}
                        className="group cursor-pointer transition-colors duration-150 hover:bg-violet-50/40"
                        onClick={() => setSelectedId(m.id)}
                      >
                        {/* Név + avatar */}
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ backgroundColor: avatarC.bg, color: avatarC.color }}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div
                                className={`flex items-center gap-1.5 truncate font-medium text-zinc-800 ${
                                  isDeceased ? 'italic text-muted-foreground line-through' : ''
                                }`}
                              >
                                {name}
                                {bday && (
                                  <span title="Születésnapos ebben a hónapban">
                                    <Cake className="size-3.5 shrink-0 text-amber-500" />
                                  </span>
                                )}
                                {isDeceased && (
                                  <span className="ml-1 text-[10px] not-italic">†</span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 md:hidden">
                                {age !== null ? `${age} év · ` : ''}
                                {m.c_szcim || ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Lakcím */}
                        <td className="hidden p-3 text-xs text-zinc-500 md:table-cell">
                          {m.c_szcim || '—'}
                        </td>

                        {/* Kor */}
                        <td className="hidden p-3 text-zinc-500 md:table-cell">
                          {age !== null ? `${age} év` : '—'}
                        </td>

                        {/* Státusz-badge */}
                        <td className="p-3">
                          <StatusBadges member={m} />
                        </td>

                        {/* Foglalkozás */}
                        <td className="hidden p-3 text-xs text-zinc-400 lg:table-cell">
                          {m.foglalkozas || '—'}
                        </td>

                        {/* Hover-action: ceruza ikon szerkesztéshez */}
                        <td
                          className="p-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            title="Megnyitás szerkesztéshez"
                            aria-label={`„${name}" tag szerkesztése`}
                            onClick={() => setSelectedId(m.id)}
                            className="rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-violet-100"
                          >
                            <Pencil className="size-3.5 text-violet-500" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modalok */}
        {selectedMember && userId && (
          <MemberDetailDialog
            member={selectedMember}
            userId={userId}
            currentRevision={selectedMember.revision}
            onSaved={() => {
              notifyLocalDataChanged()
            }}
            onClose={() => setSelectedId(null)}
          />
        )}

        {createOpen && userId && congregationId && (
          <MemberCreateDialog
            userId={userId}
            congregationId={congregationId}
            onCreated={() => {
              notifyLocalDataChanged()
            }}
            onClose={() => setCreateOpen(false)}
          />
        )}

        {conflictRow && (
          <SzemelyConflictDialog
            pendingRow={conflictRow}
            onResolved={() => {
              void loadPending()
              void loadList()
            }}
            onClose={() => setConflictRow(null)}
          />
        )}
      </div>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-komponensek
// ─────────────────────────────────────────────────────────────────────────

function SortableHeader({
  label,
  col,
  current,
  dir,
  onClick,
  hiddenOnMobile,
}: {
  label: string
  col: SortColumn
  current: SortColumn
  dir: SortDir
  onClick: (c: SortColumn) => void
  hiddenOnMobile?: boolean
}) {
  const icon = current !== col ? '↕' : dir === 'asc' ? '↑' : '↓'
  return (
    <th
      onClick={() => onClick(col)}
      className={`cursor-pointer select-none p-3 text-left text-xs font-medium text-zinc-500 hover:text-zinc-700 ${
        hiddenOnMobile ? 'hidden md:table-cell' : ''
      }`}
    >
      {label} {icon}
    </th>
  )
}

function StatusBadges({ member: m }: { member: SzemelyListRow }) {
  const badges: Array<{ label: string; tone: string }> = []
  if (m.meghalt === 1) badges.push({ label: 'elhunyt', tone: 'bg-slate-200 text-slate-700' })
  if (m.member_status === 'kitért')
    badges.push({ label: 'kitért', tone: 'bg-amber-100 text-amber-800' })
  if (m.member_status === 'törölt')
    badges.push({ label: 'törölt', tone: 'bg-slate-200 text-slate-700' })
  if (m.isvisible === 0) badges.push({ label: 'rejtett', tone: 'bg-slate-200 text-slate-700' })
  if (m.csaladfo === 1) badges.push({ label: 'családfő', tone: 'bg-amber-100 text-amber-800' })
  if (m.voter_eligible === 1)
    badges.push({ label: 'választó', tone: 'bg-emerald-100 text-emerald-800' })

  if (badges.length === 0) {
    return (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
        aktív
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.tone}`}>
          {b.label}
        </span>
      ))}
    </div>
  )
}

function PendingBlock({
  pendingRows,
  onConflictClick,
}: {
  pendingRows: Array<{
    id: string
    cnp: string
    csaladnev: string | null
    k_nev: string | null
    ferjk_nev: string | null
    ferfi: number
    sync_state: 'pending' | 'conflict'
    sync_error: string | null
    retry_count: number
  }>
  onConflictClick: (r: (typeof pendingRows)[number]) => void
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 shadow-sm">
      <div className="border-b border-amber-200/60 px-4 py-2">
        <p className="text-xs font-medium text-amber-900">
          Szinkronra váró új tagok ({pendingRows.length}) — a rendszer automatikusan
          feltölti, amint online leszel.
        </p>
      </div>
      <ul className="divide-y divide-amber-200/60">
        {pendingRows.map((p) => {
          const name =
            [(p.ferfi === 0 && p.ferjk_nev) || p.csaladnev, p.k_nev]
              .filter(Boolean)
              .join(' ') || '(névtelen)'
          const isConflict = p.sync_state === 'conflict'
          const isClickable = isConflict
          return (
            <li key={p.id}>
              <div
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => onConflictClick(p) : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onConflictClick(p)
                        }
                      }
                    : undefined
                }
                className={`flex items-center gap-3 px-4 py-2 text-sm ${
                  isClickable ? 'cursor-pointer hover:bg-rose-100/60' : ''
                }`}
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    isConflict
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {isConflict ? '⚠ ütközés' : '🕓 várakozik'}
                </span>
                <span className="font-medium">{name}</span>
                <span className="font-mono text-xs text-muted-foreground">CNP: {p.cnp}</span>
                {isConflict && p.sync_error && (
                  <span className="ml-auto text-[11px] italic text-rose-700 line-clamp-1">
                    {p.sync_error}
                  </span>
                )}
                {isConflict && (
                  <span className="ml-2 whitespace-nowrap text-[11px] italic text-rose-600">
                    kattints a feloldáshoz →
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helper-ek
// ─────────────────────────────────────────────────────────────────────────

function getInitials(m: SzemelyListRow): string {
  const first = (m.csaladnev || m.ferjk_nev || '?')[0] ?? '?'
  const second = (m.k_nev || '?')[0] ?? '?'
  return `${first}${second}`.toUpperCase()
}

function getAvatarColors(m: SzemelyListRow): { bg: string; color: string } {
  if (m.ferfi === 1) return { bg: '#dbeafe', color: '#1d4ed8' }
  return { bg: '#fce7f3', color: '#be185d' }
}

function isBirthdayThisMonth(m: SzemelyListRow): boolean {
  if (!m.sz_datum) return false
  const now = new Date()
  const bd = new Date(m.sz_datum)
  if (Number.isNaN(bd.getTime())) return false
  return bd.getMonth() === now.getMonth()
}

function ageFromIso(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 ? age : null
}

function formatFullName(m: SzemelyListRow): string {
  const last = (m.ferfi === 0 && m.ferjk_nev) || m.csaladnev || m.szcs_nev || ''
  const first = m.k_nev || ''
  const combined = [last, first].filter(Boolean).join(' ')
  return combined || '(névtelen)'
}
