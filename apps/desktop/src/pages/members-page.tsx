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
import { Search, Users } from 'lucide-react'

import {
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

import { MemberDetailDialog } from '../components/member-detail-dialog'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getLocalOwnProfile } from '../lib/sync'
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
              A gyülekezet tagjainak listája a lokális adatbázisból. A szerkesztés a
              következő frissítésben jön — most kereshetsz, szűrhetsz, és megnézheted
              a részleteket.
            </p>
          </div>
          <p className="text-xs italic text-muted-foreground">
            {rows.length} tag · offline-mode kompatibilis
          </p>
        </div>

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
