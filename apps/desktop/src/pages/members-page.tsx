/**
 * Tagnyilvántartás (members) lista-oldal — `/tagnyilvantartas` route.
 *
 * M8.0a (2026-04-25) — első iteráció:
 *   - Lokál `szemely_local` listázás (offline-first, OS-M7-ben pull-elve)
 *   - Kereső (csaladnev / k_nev / ferjk_nev / cím / telefon / email — diakritika-toleráns)
 *   - Status-szűrő (mind / aktív / meghalt / rejtett)
 *   - Sortolás (csaladnev asc/desc, sz_datum asc/desc, id desc)
 *   - Sor-kattintás → MemberDetailDialog (read-only)
 *
 * A szerkesztés (M8.0b) és az offline-write (M8.0c) későbbi alfázis. Most
 * a lelkész lát: pasztorális UX, tag-portré-szerű detail-modal.
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Search, UserPlus, Users } from 'lucide-react'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@kartoteka/ui'
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
import {
  runSzemelySyncManually,
  startSzemelyAutoSync,
} from '../lib/szemely-write-sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

type OrderBy = 'csaladnev-asc' | 'csaladnev-desc' | 'sz_datum-asc' | 'sz_datum-desc' | 'id-desc'

export function MembersPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [rows, setRows] = useState<SzemelyListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SzemelyStatusFilter>('aktiv')
  const [orderBy, setOrderBy] = useState<OrderBy>('csaladnev-asc')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  type PendingRow = Awaited<
    ReturnType<ReturnType<typeof getTauriSqliteBackend>['listLocalPendingSzemely']>
  >[number]
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([])
  const [syncing, setSyncing] = useState(false)
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

  // Lista-betöltés
  const loadList = useCallback(async () => {
    if (!congregationId) return
    setLoading(true)
    setError(null)
    try {
      const list = await getTauriSqliteBackend().listLocalSzemely({
        congregationId,
        search: search.trim() || undefined,
        statusFilter,
        orderBy,
        limit: 1000,
      })
      setRows(list)
    } catch (err) {
      setError(`Tagnyilvántartás betöltési hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId, search, statusFilter, orderBy])

  // Debounced search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadList()
    }, 300)
    return () => clearTimeout(timer)
  }, [loadList])

  // Pending új-tag sorok betöltése
  const loadPending = useCallback(async () => {
    if (!congregationId) return
    try {
      const list = await getTauriSqliteBackend().listLocalPendingSzemely(congregationId)
      setPendingRows(list)
    } catch {
      /* csendes — UI-szinten nem kritikus */
    }
  }, [congregationId])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  // Auto-sync a szemely-write-sync-re (csak ha van congregationId)
  useEffect(() => {
    if (!congregationId) return
    startSzemelyAutoSync(congregationId)
    // Mountkor is futtasson egyszer + 30s poll
  }, [congregationId])

  async function handleManualSync() {
    if (!congregationId || syncing) return
    setSyncing(true)
    try {
      const result = await runSzemelySyncManually(congregationId)
      // Ha sikeres volt legalább egy: pull + lista refresh
      if (result.succeeded > 0) {
        await loadList()
      }
      await loadPending()
    } finally {
      setSyncing(false)
    }
  }

  const selectedMember = selectedId !== null ? rows.find((r) => r.id === selectedId) ?? null : null

  return (
    <DesktopShell>
      <main className="mx-auto max-w-5xl space-y-5 p-5">
        {/* Fejléc */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="size-6 text-violet-700" />
              <h1 className="text-2xl font-semibold tracking-tight">Tagnyilvántartás</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              A gyülekezet tagjai. Kattints egy sorra a szerkesztéshez, vagy vegyél
              fel új tagot a jobb oldali gombbal. Offline is működik — a szinkron
              automatikus.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {congregationId && (
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="bg-violet-700 text-white hover:bg-violet-800"
              >
                <UserPlus className="mr-2 size-4" />
                Új tag
              </Button>
            )}
            <p className="text-xs italic text-muted-foreground">
              {rows.length} tag · offline-kompatibilis
            </p>
          </div>
        </div>

        {/* Pending (offline-rögzített új tagok) blokk */}
        {pendingRows.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/60">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
              <div>
                <CardTitle className="text-sm text-amber-900">
                  Szinkronra váró új tagok ({pendingRows.length})
                </CardTitle>
                <CardDescription className="text-xs text-amber-800">
                  Ezek offline-ban rögzített új tagok. A szinkron automatikusan feltölti
                  őket, amint online leszel.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleManualSync}
                disabled={syncing}
                className="border-amber-300 text-amber-900 hover:bg-amber-100"
              >
                <RefreshCw className={`mr-2 size-3 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Szinkronizál…' : 'Sync most'}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-amber-200">
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
                        onClick={isClickable ? () => setConflictRow(p) : undefined}
                        onKeyDown={
                          isClickable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setConflictRow(p)
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
                        <span className="font-mono text-xs text-muted-foreground">
                          CNP: {p.cnp}
                        </span>
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
            </CardContent>
          </Card>
        )}

        {/* Szűrők */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Szűrők</CardTitle>
            <CardDescription className="text-xs">
              Kereshetsz név, cím, telefon vagy e-mail alapján — az ékezetek nem
              számítanak. A status-szűrő alapból „aktív".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="search">Keresés</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="search"
                    type="search"
                    placeholder="Név, cím, telefon, e-mail…"
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status-filter">Státusz</Label>
                <select
                  id="status-filter"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.currentTarget.value as SzemelyStatusFilter)}
                >
                  {SZEMELY_STATUS_FILTER_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {SZEMELY_STATUS_FILTER_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Label htmlFor="orderby">Rendezés:</Label>
              <select
                id="orderby"
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                value={orderBy}
                onChange={(e) => setOrderBy(e.currentTarget.value as OrderBy)}
              >
                <option value="csaladnev-asc">Név A→Z</option>
                <option value="csaladnev-desc">Név Z→A</option>
                <option value="sz_datum-asc">Életkor (idősebb)</option>
                <option value="sz_datum-desc">Életkor (fiatalabb)</option>
                <option value="id-desc">Felvétel dátuma (legújabb)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Hiba */}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-sm">Tagok betöltése…</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nincs találat. Próbáld törölni a szűrőket vagy a kereső-kifejezést.
          </p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {rows.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80"
                    >
                      <MemberRow member={m} />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Detail modal */}
        {selectedMember && userId && (
          <MemberDetailDialog
            member={selectedMember}
            userId={userId}
            currentRevision={selectedMember.revision}
            onSaved={() => {
              void loadList()
            }}
            onClose={() => setSelectedId(null)}
          />
        )}

        {/* Create modal */}
        {createOpen && userId && congregationId && (
          <MemberCreateDialog
            userId={userId}
            congregationId={congregationId}
            onCreated={() => {
              void loadList()
              void loadPending()
            }}
            onClose={() => setCreateOpen(false)}
          />
        )}

        {/* Conflict-resolve modal — a pending-blokkon egy conflict sort kattintva */}
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
      </main>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lista-sor
// ─────────────────────────────────────────────────────────────────────────

function MemberRow({ member: m }: { member: SzemelyListRow }) {
  const fullName = formatFullName(m)
  const initials = `${(m.csaladnev || m.ferjk_nev || '?')[0] ?? '?'}${(m.k_nev || '?')[0] ?? '?'}`.toUpperCase()
  const avatarBg = m.ferfi === 1 ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
  const age = m.sz_datum ? ageFromIso(m.sz_datum) : null
  const isDeceased = m.meghalt === 1

  return (
    <div className="flex w-full items-center gap-3">
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-full font-semibold text-xs ${avatarBg}`}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${isDeceased ? 'text-muted-foreground line-through' : ''}`}>
          {fullName}
          {isDeceased && <span className="ml-2 text-[10px] not-italic">†</span>}
          {m.csaladfo === 1 && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-800">
              családfő
            </span>
          )}
          {m.voter_eligible === 1 && (
            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-normal text-emerald-800">
              választó
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {age !== null && <span className="mr-2">{age} éves</span>}
          {m.c_szcim && <span className="line-clamp-1">{m.c_szcim}</span>}
        </p>
      </div>
      <div className="hidden text-right text-xs text-muted-foreground md:block">
        {m.telefon && <p className="font-mono">{m.telefon}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helper-ek (ageFromIso + formatFullName) — később közös lib-be
// ─────────────────────────────────────────────────────────────────────────

function ageFromIso(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 ? age : null
}

/**
 * Magyar név-formátum: csaladnev (vagy ferjk_nev nőknél) + k_nev.
 * Ha nincs k_nev, csak a csaladnev. Ha semmi, '(névtelen)'.
 */
function formatFullName(m: SzemelyListRow): string {
  const last = (m.ferfi === 0 && m.ferjk_nev) || m.csaladnev || m.szcs_nev || ''
  const first = m.k_nev || ''
  const combined = [last, first].filter(Boolean).join(' ')
  return combined || '(névtelen)'
}
