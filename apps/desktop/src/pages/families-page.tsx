/**
 * Családok lista-oldal — `/csaladok` route (M8.3a, 2026-04-24).
 *
 * A `csalad_local` lokális tükrét listázza. Első iteráció:
 *   - Lista keresővel + status-szűrővel + rendezéssel
 *   - Sor-kattintás → FamilyDetailDialog (read-only szülők + gyerekek)
 *   - Auto-pull a mount-kor (families + gyerek delta)
 *
 * A későbbi M8.3b/c alfázisokban jön: családfő-kijelölés, új család
 * létrehozása, tagok áthelyezése, offline-write.
 */

import { useCallback, useEffect, useState } from 'react'
import { Home, Plus, RefreshCw, Search } from 'lucide-react'

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
  CSALAD_STATUS_FILTER_LABELS,
  CSALAD_STATUS_FILTER_VALUES,
  type CsaladStatusFilter,
} from '@kartoteka/validations'

import { CsaladFormDialog } from '../components/csalad-form-dialog'
import { FamilyDetailDialog } from '../components/family-detail-dialog'
import {
  runCsaladSyncManually,
  startCsaladAutoSync,
} from '../lib/csalad-write-sync'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLocalOwnProfile,
  pullFamiliesOfOwnCongregation,
  pullGyerekOfOwnCongregation,
} from '../lib/sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

type OrderBy = 'csaladfo-nev-asc' | 'csaladfo-nev-desc' | 'id-desc'

type FamilyRow = Awaited<
  ReturnType<ReturnType<typeof getTauriSqliteBackend>['listLocalCsaladok']>
>[number]

export function FamiliesPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [rows, setRows] = useState<FamilyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CsaladStatusFilter>('aktiv')
  const [orderBy, setOrderBy] = useState<OrderBy>('csaladfo-nev-asc')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

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

  // Pull a mount-kor + lista betöltés
  const refresh = useCallback(
    async (triggerPull: boolean) => {
      if (!userId || !congregationId) return
      try {
        if (triggerPull) {
          setSyncing(true)
          await Promise.all([
            pullFamiliesOfOwnCongregation(userId, 'delta').catch(() => null),
            pullGyerekOfOwnCongregation(userId, 'delta').catch(() => null),
          ])
        }
      } finally {
        setSyncing(false)
      }

      setLoading(true)
      setError(null)
      try {
        const list = await getTauriSqliteBackend().listLocalCsaladok({
          congregationId,
          search: search.trim() || undefined,
          statusFilter,
          orderBy,
          limit: 2000,
        })
        setRows(list)
      } catch (err) {
        setError(`Családok betöltési hiba: ${errorMessage(err)}`)
      } finally {
        setLoading(false)
      }
    },
    [userId, congregationId, search, statusFilter, orderBy],
  )

  // Mount: első pull + load + sync-indítás
  useEffect(() => {
    if (userId && congregationId) {
      void refresh(true)
      startCsaladAutoSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, congregationId])

  // Debounced search / filter / order — csak lista-reload, pull nélkül
  useEffect(() => {
    if (!userId || !congregationId) return
    const timer = setTimeout(() => {
      void refresh(false)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, orderBy])

  const selected = selectedId !== null ? rows.find((r) => r.id === selectedId) ?? null : null

  return (
    <DesktopShell>
      <main className="mx-auto max-w-5xl space-y-5 p-5">
        {/* Fejléc */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Home className="size-6 text-violet-700" />
              <h1 className="text-2xl font-semibold tracking-tight">Családok</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              A gyülekezet családjainak listája. Kattints egy sorra a családtagok
              megnézéséhez. Offline is működik — a szinkron automatikus.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => refresh(true)}
                disabled={syncing}
              >
                <RefreshCw className={`mr-2 size-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Szinkron…' : 'Frissítés'}
              </Button>
              {congregationId && userId && (
                <Button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="bg-violet-700 text-white hover:bg-violet-800"
                >
                  <Plus className="mr-2 size-4" />
                  Új család
                </Button>
              )}
            </div>
            <p className="text-xs italic text-muted-foreground">
              {rows.length} család · offline-kompatibilis
            </p>
          </div>
        </div>

        {/* Szűrők */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Szűrők</CardTitle>
            <CardDescription className="text-xs">
              Kereshetsz családfő / anya / cím alapján — az ékezetek nem számítanak.
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
                    placeholder="Családfő, anya neve, cím…"
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
                  onChange={(e) => setStatusFilter(e.currentTarget.value as CsaladStatusFilter)}
                >
                  {CSALAD_STATUS_FILTER_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {CSALAD_STATUS_FILTER_LABELS[v]}
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
                <option value="csaladfo-nev-asc">Név A→Z</option>
                <option value="csaladfo-nev-desc">Név Z→A</option>
                <option value="id-desc">Felvétel (legújabb)</option>
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
            <p className="mt-3 text-sm">Családok betöltése…</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nincs család a gyülekezetben. A „Frissítés" gombbal szinkronizálhatod, vagy
            az anyakönyvi / tagnyilvántartási modulból felvehetsz újat.
          </p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-slate-100">
                {rows.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(f.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80"
                    >
                      <FamilyRowInline family={f} />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Detail dialog */}
        {selected && userId && (
          <FamilyDetailDialog
            userId={userId}
            congregationId={congregationId ?? undefined}
            familyId={selected.id}
            onClose={() => {
              setSelectedId(null)
              void refresh(false)
            }}
          />
        )}

        {/* Create dialog */}
        {createOpen && userId && congregationId && (
          <CsaladFormDialog
            mode="create"
            userId={userId}
            congregationId={congregationId}
            onSaved={() => {
              void refresh(true)
              // Manuálisan is indítunk egy sync-kört (különben a pending csak
              // 30 s múlva próbálkozik):
              void runCsaladSyncManually()
            }}
            onClose={() => setCreateOpen(false)}
          />
        )}
      </main>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lista-sor
// ─────────────────────────────────────────────────────────────────────────

function FamilyRowInline({ family: f }: { family: FamilyRow }) {
  const hasFerfi = f.ferfi_name !== null
  const hasNo = f.no_name !== null
  const headline =
    hasFerfi && hasNo
      ? `${f.ferfi_name} & ${f.no_name}`
      : hasFerfi
        ? f.ferfi_name
        : hasNo
          ? f.no_name
          : '(nincs szülő megadva)'

  return (
    <div className="flex w-full items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-800 font-semibold text-xs">
        👪
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${f.isaktiv === 0 ? 'text-muted-foreground italic' : ''}`}>
          {headline}
          {f.isaktiv === 0 && (
            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] not-italic text-slate-700">
              inaktív
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {f.gyermekek_count > 0 && (
            <span className="mr-2">
              {f.gyermekek_count} gyermek
            </span>
          )}
          {f.cim_display && <span className="line-clamp-1">{f.cim_display}</span>}
        </p>
      </div>
    </div>
  )
}
