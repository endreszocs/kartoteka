/**
 * Chitanta Tömbök oldal — a `/penzugy/chitanta-tombok` route.
 *
 * A-M7.1c (2026-04-22) — az első pénzügyi desktop-oldal, **end-to-end**:
 *   - listázás a @kartoteka/core `listChitantaTombokUseCase`-en át
 *     (online-first, offline-fallback a TauriSqliteBackend-ről)
 *   - új tömb rögzítés inline form-mal, @kartoteka/core `createChitantaTombUseCase`
 *   - **source-jelzés** a lelkésznek: friss (szerverről) vagy lokális cache
 *   - teljes loading/success/error/empty state (lelkesz_informalas.md alapelv)
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { AlertCircle, CheckCircle2, Plus, RefreshCw, ReceiptText } from 'lucide-react'

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
  createChitantaTombUseCase,
  getChitantaTombUsageUseCase,
  listChitantaTombokUseCase,
  type ChitantaTombUsage,
  type CreateChitantaTombResult,
  type ListChitantaTombokResult,
} from '@kartoteka/core'
import { computeChitantaTombStatus, type ChitantaTombRow } from '@kartoteka/validations'

import { ActiveChitantaTombPanel } from '../components/active-chitanta-tomb-panel'
import { PageHero } from '@kartoteka/ui-app'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getDesktopUser } from '../lib/desktop-user'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'
import { getLocalOwnProfile } from '../lib/sync'

export function ChitantaTombokPage() {
  const [user, setUser] = useState<User | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)

  const [rows, setRows] = useState<ChitantaTombRow[]>([])
  /** 2026-07-25 (G4): valós elhasználtság a berögzített nyugtaszámokból (online). */
  const [usageMap, setUsageMap] = useState<Record<string, ChitantaTombUsage>>({})
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'supabase' | 'local' | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  // ── Auth + profil betöltés (congregation_id a saját profilból) ──
  useEffect(() => {
    let mounted = true
    getDesktopUser()
      .then(async (resolvedUser) => {
        if (!mounted) return
        setUser(resolvedUser)
        if (resolvedUser) {
          // Profilból olvassuk a congregation_id-t (offline-ban is működik)
          try {
            const profile = await getLocalOwnProfile(resolvedUser.id)
            if (mounted) setCongregationId(profile?.congregation_id ?? null)
          } catch (err) {
            console.warn('[chitanta-tombok] profile read failed:', err)
          }
        }
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      mounted = false
    }
  }, [])

  // ── Lista betöltés (online-first + fallback) ──
  const loadList = useCallback(async () => {
    if (!congregationId) return
    setLoading(true)
    setListError(null)
    try {
      const supabase = getDesktopSupabase()
      const result: ListChitantaTombokResult = await listChitantaTombokUseCase(
        { congregationId },
        { supabase, storage: getTauriSqliteBackend(), runtime: 'desktop' },
      )
      if (result.success) {
        setRows(result.rows)
        setSource(result.source)
        // 2026-07-25 (G4): valós használat — csak online forrásnál számolható;
        // offline-ban a DB-számláló marad (a kártya Math.max-a kezeli).
        if (result.source === 'supabase' && result.rows.length > 0) {
          const usageRes = await getChitantaTombUsageUseCase(
            {
              congregationId,
              tombok: result.rows.map((r) => ({
                id: r.id,
                szam_kezdet: r.szam_kezdet,
                szam_veg: r.szam_veg,
              })),
            },
            { supabase, runtime: 'desktop' },
          )
          if (usageRes.success) setUsageMap(usageRes.usage)
        }
      } else {
        setListError(result.error)
      }
    } catch (err) {
      setListError(`Lista hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId])

  useEffect(() => {
    void loadList()
  }, [loadList])

  // ── Create sikeres → refresh + toast ──
  const handleCreated = useCallback(
    (row: ChitantaTombRow) => {
      setSuccessToast(`Az új tömb (${row.seria} ${row.szam_kezdet}-${row.szam_veg}) elmentve.`)
      setCreateOpen(false)
      void loadList()
      window.setTimeout(() => setSuccessToast(null), 4000)
    },
    [loadList],
  )

  // ── Render ──
  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Pénzügy · Nyugta"
          title="Nyugtatömbök"
          description="A gyülekezet nyomdai chitanta-tömbjei — nyilvántartás, maradék-követés."
          Icon={ReceiptText}
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadList()}
                disabled={loading}
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />
                Frissítés
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={!congregationId}
                className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)] hover:from-violet-600 hover:to-indigo-700"
              >
                <Plus className="mr-1.5 size-4" />
                Új tömb
              </Button>
            </>
          }
        />

        {/* Source-jelzés (alapelv: a lelkész mindenről informálva legyen) */}
        {source && <SourceBadge source={source} count={rows.length} />}

        {/* Aktív tömb panel — a napi bizonylat-kiállítás alapja.
            Deriváljuk a `rows`-ból (nincs dupla query), a `@kartoteka/validations`
            `computeChitantaTombStatus()` segédfn-nel. A-M7.2a (2026-04-22). */}
        {!loading && rows.length > 0 && <ActiveChitantaTombPanel rows={rows} usage={usageMap} />}

        {/* Sikeres rögzítés banner */}
        {successToast && (
          <div
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            <CheckCircle2 className="mr-1.5 inline-block size-4" />
            {successToast}
          </div>
        )}

        {/* Hiba banner */}
        {listError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {listError}
          </div>
        )}

        {/* Create dialog */}
        {createOpen && user && congregationId && (
          <CreateChitantaTombForm
            congregationId={congregationId}
            userId={user.id}
            onCancel={() => setCreateOpen(false)}
            onSuccess={handleCreated}
          />
        )}

        {/* Listázás */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-3 text-sm">Tömbök betöltése…</span>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState onNew={() => setCreateOpen(true)} canCreate={!!congregationId} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <ChitantaTombCard key={row.id} row={row} usage={usageMap[row.id]} />
            ))}
          </div>
        )}
      </div>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Source-badge — "friss / lokális cache" a lelkész informálására
// ─────────────────────────────────────────────────────────────────────────

function SourceBadge({
  source,
  count,
}: {
  source: 'supabase' | 'local'
  count: number
}) {
  if (source === 'supabase') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-xs text-emerald-800">
        <span className="inline-block size-2 animate-pulse rounded-full bg-emerald-500" />
        <span>
          Friss szerveradat — {count} tömb, éppen a Supabase-ből szinkronizálva.
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50/70 px-3 py-1.5 text-xs text-orange-900">
      <span className="inline-block size-2 rounded-full bg-orange-500" />
      <span>
        Lokális gyorsítótárból — {count} tömb. A szerver most nem érhető el; a
        következő hálózati csatlakozáskor frissül.
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────

function EmptyState({
  onNew,
  canCreate,
}: {
  onNew: () => void
  canCreate: boolean
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <ReceiptText className="mx-auto size-10 text-muted-foreground/50" />
        <p className="mt-3 font-medium text-muted-foreground">
          Még nincs rögzített nyugtatömb.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          A nyomdából vásárolt bizonylat-tömböt itt vezesd be, hogy a chitanta-
          kiállításnál a rendszer automatikusan sorszámot válasszon.
        </p>
        {canCreate && (
          <Button type="button" className="mt-4" size="sm" onClick={onNew}>
            <Plus className="mr-1.5 size-4" />
            Első tömb rögzítése
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Egy tömb kártyája
// ─────────────────────────────────────────────────────────────────────────

function ChitantaTombCard({ row, usage }: { row: ChitantaTombRow; usage?: ChitantaTombUsage }) {
  const status = computeChitantaTombStatus(row)
  // 2026-07-25 (G4): a kijelzett elhasználtság = max(DB-számláló, a berögzített
  // kerületi nyugtaszámokból számított érték) — web-paritás.
  const felhasznalt = Math.max(status.felhasznalt_darabszam, usage?.szamitottFelhasznalt ?? 0)
  const maradek = Math.max(0, status.darabszam_ossz - felhasznalt)
  const isAktiv = row.aktiv
  const lowStock = isAktiv && maradek <= 5 && maradek > 0
  const exhausted = isAktiv && maradek === 0

  return (
    <Card className={!isAktiv ? 'opacity-70' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {row.seria} {row.szam_kezdet}–{row.szam_veg}
            </CardTitle>
            <CardDescription className="text-xs">
              {row.block_nr ? `Tömb: ${row.block_nr}` : 'Nincs tömb-szám'} ·{' '}
              {row.vasarlas_datuma}
            </CardDescription>
          </div>
          <StatusPill aktiv={isAktiv} lowStock={lowStock} exhausted={exhausted} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Összesen:</span>
          <span className="font-medium">{status.darabszam_ossz} db</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Felhasznált:</span>
          <span className="font-medium">{felhasznalt} db</span>
        </div>
        {(usage?.anulaltDarab ?? 0) > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>ebből anulált:</span>
            <span>{usage?.anulaltDarab} db</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Maradék:</span>
          <span
            className={`font-semibold ${
              exhausted
                ? 'text-destructive'
                : lowStock
                  ? 'text-amber-700'
                  : 'text-emerald-700'
            }`}
          >
            {maradek} db
          </span>
        </div>
        {isAktiv && status.maradek > 0 && (
          <div className="flex justify-between border-t pt-1.5 text-xs">
            <span className="text-muted-foreground">Következő:</span>
            <span className="font-mono">{status.kovetkezo_szam}</span>
          </div>
        )}
        {row.megjegyzes && (
          <p className="border-t pt-2 text-xs text-muted-foreground">
            {row.megjegyzes}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function StatusPill({
  aktiv,
  lowStock,
  exhausted,
}: {
  aktiv: boolean
  lowStock: boolean
  exhausted: boolean
}) {
  if (!aktiv) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
        Lezárt
      </span>
    )
  }
  if (exhausted) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
        Elfogyott
      </span>
    )
  }
  if (lowStock) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
        Kevés
      </span>
    )
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
      Aktív
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Create form (inline kártya — moduláris design később)
// ─────────────────────────────────────────────────────────────────────────

function CreateChitantaTombForm({
  congregationId,
  userId,
  onCancel,
  onSuccess,
}: {
  congregationId: string
  userId: string
  onCancel: () => void
  onSuccess: (row: ChitantaTombRow) => void
}) {
  const [seria, setSeria] = useState('')
  const [blockNr, setBlockNr] = useState('')
  const [szamKezdet, setSzamKezdet] = useState('')
  const [szamVeg, setSzamVeg] = useState('')
  const [vasarlasDatuma, setVasarlasDatuma] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [vasarlasAra, setVasarlasAra] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const kezdetNum = Number.parseInt(szamKezdet, 10)
    const vegNum = Number.parseInt(szamVeg, 10)
    const araNum = vasarlasAra.trim() ? Number.parseFloat(vasarlasAra) : null

    try {
      const supabase = getDesktopSupabase()
      const result: CreateChitantaTombResult = await createChitantaTombUseCase(
        {
          congregationId,
          seria: seria.trim(),
          block_nr: blockNr.trim() || null,
          szam_kezdet: kezdetNum,
          szam_veg: vegNum,
          vasarlas_datuma: vasarlasDatuma,
          vasarlas_ara: araNum,
          megjegyzes: megjegyzes.trim() || null,
        },
        {
          supabase,
          storage: getTauriSqliteBackend(),
          runtime: 'desktop',
          userId,
        },
      )

      if (result.success) {
        onSuccess(result.row)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(`Mentési hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">Új nyugtatömb rögzítése</CardTitle>
        <CardDescription className="text-xs">
          A nyomdában vásárolt bizonylat-tömb adatait add meg — a rendszer ezt
          követi a kiállításkor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seria">Seria (pl. EREKC24) *</Label>
              <Input
                id="seria"
                required
                maxLength={32}
                value={seria}
                onChange={(e) => setSeria(e.currentTarget.value)}
                disabled={submitting}
                placeholder="EREKC24"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-nr">Tömb-szám (opcionális)</Label>
              <Input
                id="block-nr"
                value={blockNr}
                maxLength={64}
                onChange={(e) => setBlockNr(e.currentTarget.value)}
                disabled={submitting}
                placeholder="pl. 03"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="szam-kezdet">Kezdő szám *</Label>
              <Input
                id="szam-kezdet"
                type="number"
                min={0}
                required
                value={szamKezdet}
                onChange={(e) => setSzamKezdet(e.currentTarget.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="szam-veg">Záró szám *</Label>
              <Input
                id="szam-veg"
                type="number"
                min={0}
                required
                value={szamVeg}
                onChange={(e) => setSzamVeg(e.currentTarget.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vasarlas-datuma">Vásárlás dátuma *</Label>
              <Input
                id="vasarlas-datuma"
                type="date"
                required
                value={vasarlasDatuma}
                onChange={(e) => setVasarlasDatuma(e.currentTarget.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vasarlas-ara">Vásárlás ára RON-ban (opcionális)</Label>
              <Input
                id="vasarlas-ara"
                type="number"
                min={0}
                step={0.01}
                value={vasarlasAra}
                onChange={(e) => setVasarlasAra(e.currentTarget.value)}
                disabled={submitting}
                placeholder="pl. 50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="megjegyzes">Megjegyzés (opcionális)</Label>
            <Input
              id="megjegyzes"
              maxLength={500}
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.currentTarget.value)}
              disabled={submitting}
              placeholder="Pl. közösen vett tömb a kerülettel"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mr-1.5 inline-block size-4" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
            >
              Mégse
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Mentés…' : 'Tömb rögzítése'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
