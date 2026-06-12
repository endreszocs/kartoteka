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
import { Grid3x3, Home, List, Plus, Search } from 'lucide-react'

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
import { PageHero, FamilyCardModern, type FamilyCardModernData } from '@kartoteka/ui-app'
import { dbSelect } from '../lib/local-db'
import { DesktopFamilyCardPrintDialog } from '../components/family-card-print-dialog'
import {
  runCsaladSyncManually,
  startCsaladAutoSync,
} from '../lib/csalad-write-sync'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import { getLocalOwnProfile } from '../lib/sync'
import { useDataVersion, notifyLocalDataChanged } from '../lib/sync-orchestrator'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

type OrderBy = 'csaladfo-nev-asc' | 'csaladfo-nev-desc' | 'id-desc'

type FamilyRow = Awaited<
  ReturnType<ReturnType<typeof getTauriSqliteBackend>['listLocalCsaladok']>
>[number]

export function FamiliesPage() {
  const dataVersion = useDataVersion()
  const [userId, setUserId] = useState<string | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [rows, setRows] = useState<FamilyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CsaladStatusFilter>('aktiv')
  const [orderBy, setOrderBy] = useState<OrderBy>('csaladfo-nev-asc')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // 2026-06-11 (Endre): modern kártyanézet — avatarokkal (web-azonos komponens).
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    try {
      return window.localStorage.getItem('kartoteka.families.viewMode.desktop') === 'list' ? 'list' : 'cards'
    } catch {
      return 'cards'
    }
  })
  const [cardData, setCardData] = useState<Map<number, FamilyCardModernData>>(new Map())
  const [printFamilyId, setPrintFamilyId] = useState<number | null>(null)

  function changeViewMode(v: 'cards' | 'list') {
    setViewMode(v)
    try {
      window.localStorage.setItem('kartoteka.families.viewMode.desktop', v)
    } catch {
      /* ignore */
    }
  }

  // Auth + congregation_id
  useEffect(() => {
    let mounted = true
    getDesktopUser()
      .then(async (resolvedUser) => {
        if (!mounted || !resolvedUser) return
        setUserId(resolvedUser.id)
        try {
          const profile = await getLocalOwnProfile(resolvedUser.id)
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

  // Lista betöltés — TISZTÁN LOKÁLIS. A háttér-sync orchestrator (Sprint M)
  // gondoskodik az online frissítésről; sikeres pull után a `dataVersion`
  // bumpolódik és ez az effect újrafut.
  const refresh = useCallback(async () => {
    if (!userId || !congregationId) return
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
  }, [userId, congregationId, search, statusFilter, orderBy])

  // Write-sync háttér-task indítása
  useEffect(() => {
    if (userId && congregationId) {
      startCsaladAutoSync()
    }
  }, [userId, congregationId])

  // Lista-reload: keresés/szűrő/sort változására VAGY háttér-sync sikere után
  useEffect(() => {
    if (!userId || !congregationId) return
    const timer = setTimeout(() => {
      void refresh()
    }, 300)
    return () => clearTimeout(timer)
  }, [refresh, dataVersion, userId, congregationId])

  // Kártya-kiegészítés a lokális tükörből: szülők (kep, kor, meghalt) +
  // gyermekek névvel/avatarral — két batch-SQL, a lista-sorok mellé.
  useEffect(() => {
    if (rows.length === 0) {
      setCardData(new Map())
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const parentIds = Array.from(
          new Set(rows.flatMap((r) => [r.ferfi_id, r.no_id].filter((v): v is number => v != null))),
        )
        const csaladIds = rows.map((r) => r.id)
        const ph = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => `?${i + 1 + offset}`).join(',')

        const szemelyek = parentIds.length
          ? await dbSelect<{ id: number; csaladnev: string | null; k_nev: string | null; sz_datum: string | null; meghalt: number; kep: string | null }>(
              `SELECT id, csaladnev, k_nev, sz_datum, meghalt, kep FROM szemely_local WHERE id IN (${ph(parentIds.length)})`,
              parentIds,
            )
          : []
        const gyerekek = await dbSelect<{ id_csalad: number; id: number; csaladnev: string | null; k_nev: string | null; sz_datum: string | null; meghalt: number; kep: string | null }>(
          `SELECT g.id_csalad, s.id, s.csaladnev, s.k_nev, s.sz_datum, s.meghalt, s.kep
             FROM gyerek_local g JOIN szemely_local s ON s.id = g.id_szemely
            WHERE g.id_csalad IN (${ph(csaladIds.length)})
            ORDER BY s.sz_datum`,
          csaladIds,
        )
        if (cancelled) return

        const szemelyById = new Map(szemelyek.map((sz) => [sz.id, sz]))
        const gyerekByCsalad = new Map<number, typeof gyerekek>()
        for (const gy of gyerekek) {
          const list = gyerekByCsalad.get(gy.id_csalad) ?? []
          list.push(gy)
          gyerekByCsalad.set(gy.id_csalad, list)
        }

        const yearNow = new Date().getFullYear()
        const ageOf = (d: string | null) => (d ? yearNow - new Date(d).getFullYear() : null)
        const next = new Map<number, FamilyCardModernData>()
        for (const r of rows) {
          const members: FamilyCardModernData['members'] = []
          const ferfi = r.ferfi_id != null ? szemelyById.get(r.ferfi_id) : undefined
          const no = r.no_id != null ? szemelyById.get(r.no_id) : undefined
          if (ferfi) {
            members.push({ id: ferfi.id, name: `${ferfi.csaladnev ?? ''} ${ferfi.k_nev ?? ''}`.trim() || (r.ferfi_name ?? 'Családfő'), role: 'csaladfo', age: ageOf(ferfi.sz_datum), meghalt: ferfi.meghalt === 1, kepUrl: ferfi.kep })
          } else if (r.ferfi_name) {
            members.push({ id: -1, name: r.ferfi_name, role: 'csaladfo' })
          }
          if (no) {
            members.push({ id: no.id, name: `${no.csaladnev ?? ''} ${no.k_nev ?? ''}`.trim() || (r.no_name ?? 'Házastárs'), role: 'hazastars', age: ageOf(no.sz_datum), meghalt: no.meghalt === 1, kepUrl: no.kep })
          } else if (r.no_name) {
            members.push({ id: -2, name: r.no_name, role: 'hazastars' })
          }
          for (const gy of gyerekByCsalad.get(r.id) ?? []) {
            members.push({ id: gy.id, name: `${gy.csaladnev ?? ''} ${gy.k_nev ?? ''}`.trim() || 'Gyermek', role: 'gyerek', age: ageOf(gy.sz_datum), meghalt: gy.meghalt === 1, kepUrl: gy.kep })
          }
          next.set(r.id, {
            familyId: r.id,
            familyName: ferfi?.csaladnev || no?.csaladnev || r.ferfi_name?.split(' ')[0] || null,
            members,
            street: r.cim_display,
            houseNumber: null,
            districtName: null,
            isActive: r.isaktiv === 1,
            paymentStatus: 'unknown',
          })
        }
        setCardData(next)
      } catch {
        /* a kártya-kiegészítés best-effort — a lista enélkül is él */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [rows])

  const selected = selectedId !== null ? rows.find((r) => r.id === selectedId) ?? null : null

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow={`Tagnyilvántartás · ${rows.length} család · offline-kompatibilis`}
          title="Családok"
          description="A gyülekezet családjainak listája. Kattints egy sorra a családtagok megnézéséhez. Offline is működik — a szinkron automatikus."
          Icon={Home}
          actions={
            congregationId && userId ? (
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)] hover:from-violet-600 hover:to-indigo-700"
              >
                <Plus className="mr-2 size-4" />
                Új család
              </Button>
            ) : null
          }
        />

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
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
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
              {/* Nézet-váltó (web-azonos): kártya az alapértelmezett */}
              <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => changeViewMode('cards')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                    viewMode === 'cards' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Grid3x3 className="size-3.5" /> Kártyák
                </button>
                <button
                  type="button"
                  onClick={() => changeViewMode('list')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
                    viewMode === 'list' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <List className="size-3.5" /> Lista
                </button>
              </div>
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
            Nincs család a gyülekezetben. A háttér-szinkron percenként frissít — várd meg, vagy
            az anyakönyvi / tagnyilvántartási modulból vegyél fel újat.
          </p>
        ) : viewMode === 'cards' ? (
          // 2026-06-11 (Endre): modern kártyanézet — tag-avatarok + gyermek-chipek
          // + kártyán belüli karton-nyomtatás (web-azonos megosztott komponens).
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((f) => {
              const data =
                cardData.get(f.id) ??
                ({
                  familyId: f.id,
                  familyName: f.ferfi_name?.split(' ')[0] || f.no_name?.split(' ')[0] || null,
                  members: [
                    ...(f.ferfi_name ? [{ id: -1, name: f.ferfi_name, role: 'csaladfo' as const }] : []),
                    ...(f.no_name ? [{ id: -2, name: f.no_name, role: 'hazastars' as const }] : []),
                  ],
                  street: f.cim_display,
                  houseNumber: null,
                  districtName: null,
                  isActive: f.isaktiv === 1,
                  paymentStatus: 'unknown' as const,
                } satisfies FamilyCardModernData)
              return (
                <FamilyCardModern
                  key={f.id}
                  data={data}
                  onClick={() => setSelectedId(f.id)}
                  onPrint={() => setPrintFamilyId(f.id)}
                />
              )
            })}
          </div>
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
              notifyLocalDataChanged()
            }}
          />
        )}

        {/* 2026-06-11: családi karton nyomtatás (web-azonos A4 lap) */}
        <DesktopFamilyCardPrintDialog
          open={printFamilyId !== null}
          onOpenChange={(o) => {
            if (!o) setPrintFamilyId(null)
          }}
          familyId={printFamilyId}
          congregationId={congregationId}
        />

        {/* Create dialog */}
        {createOpen && userId && congregationId && (
          <CsaladFormDialog
            mode="create"
            userId={userId}
            congregationId={congregationId}
            onSaved={() => {
              notifyLocalDataChanged()
              // Manuálisan is indítunk egy sync-kört (különben a pending csak
              // 30 s múlva próbálkozik):
              void runCsaladSyncManually()
            }}
            onClose={() => setCreateOpen(false)}
          />
        )}
      </div>
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
