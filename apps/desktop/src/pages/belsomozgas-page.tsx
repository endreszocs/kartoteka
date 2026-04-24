/**
 * Belső mozgás (internal transfer) oldal — `/penzugy/belsomozgas` route.
 *
 * A-M7.6b (2026-04-24) — a kassza ↔ bank, bank ↔ bank, valutacsere
 * rögzítésére. Egyszerűbb, mint a befizetés/kiadás oldal:
 *
 *   - Típus-választó (kassza_bank, bank_kassza, bank_bank, valutacsere)
 *   - Forrás + cél szövegmező (pl. „Kassza" → „BCR bank")
 *   - Összeg (RON) + valutacsere esetén: cél-összeg + árfolyam
 *   - Lista az év rögzített mozgásaival
 *   - Soft-delete (visszaállítható)
 *
 * Online-only. A belső mozgás a napi kassza-ürítéskor + bank-felvételkor
 * jön elő, nem a mezőn.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  RefreshCw,
  Trash2,
  WifiOff,
} from 'lucide-react'

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
  listInternalTransfersUseCase,
  saveInternalTransferUseCase,
  softDeleteInternalTransferUseCase,
  type ListInternalTransfersResult,
  type SaveInternalTransferResultOrError,
  type SoftDeleteInternalTransferResult,
} from '@kartoteka/core'
import type { BelsomozgasListRow, TransferType } from '@kartoteka/validations'

import { PageHero } from '../components/page-hero'
import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getLocalOwnProfile } from '../lib/sync'

const TYPE_LABELS: Record<TransferType, string> = {
  kassza_bank: 'Kassza → Bank (perselyfölözés)',
  bank_kassza: 'Bank → Kassza (pénzfelvétel)',
  bank_bank: 'Bank → Bank (átutalás)',
  valutacsere: 'Valutacsere (pl. EUR → RON)',
}

const TYPE_SHORT: Record<TransferType, string> = {
  kassza_bank: 'K→B',
  bank_kassza: 'B→K',
  bank_bank: 'B→B',
  valutacsere: 'Cs',
}

// ─────────────────────────────────────────────────────────────────────────
// Fő oldal
// ─────────────────────────────────────────────────────────────────────────

export function BelsomozgasPage() {
  const [user, setUser] = useState<User | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [year, setYear] = useState<number>(() => new Date().getFullYear())
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [refreshKey, setRefreshKey] = useState<number>(0)

  // Auth + congregation_id
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!mounted) return
        setUser(data.user)
        if (data.user) {
          try {
            const profile = await getLocalOwnProfile(data.user.id)
            if (mounted) setCongregationId(profile?.congregation_id ?? null)
          } catch {
            /* csendes */
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

  // Online/offline
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <DesktopShell>
      <main className="mx-auto max-w-5xl space-y-5 p-5 sm:p-6">
        <PageHero
          eyebrow="Pénzügy · Belső mozgás"
          title="Belső mozgás"
          description="Kassza ↔ bank, bank ↔ bank átvezetések és valutacsere rögzítése. A művelet nem érinti a tagok befizetéseit — csak a gyülekezeti pénz belső helyváltoztatását."
          Icon={ArrowLeftRight}
          actions={
            <>
              <Label htmlFor="year-select" className="text-xs text-slate-500">
                Év:
              </Label>
              <select
                id="year-select"
                className="rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-sm shadow-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                value={year}
                onChange={(e) => setYear(Number(e.currentTarget.value))}
              >
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          }
        />

        {!isOnline && (
          <div className="rounded-lg border border-orange-300 bg-orange-50/80 p-3 text-sm text-orange-900">
            <div className="flex items-start gap-3">
              <WifiOff className="mt-0.5 size-5 shrink-0 text-orange-600" />
              <div>
                <p className="font-semibold">Offline munkamenet — belső mozgás rögzítése szünetel.</p>
                <p className="mt-1 text-orange-800">
                  Csatlakozz a hálózatra, és próbáld újra.
                </p>
              </div>
            </div>
          </div>
        )}

        {user && congregationId && (
          <TransferForm
            userId={user.id}
            isOnline={isOnline}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}

        {user && congregationId && (
          <RecentTransfersSection
            userId={user.id}
            year={year}
            refreshKey={refreshKey}
          />
        )}
      </main>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Form
// ─────────────────────────────────────────────────────────────────────────

function TransferForm({
  userId,
  isOnline,
  onSaved,
}: {
  userId: string
  isOnline: boolean
  onSaved: () => void
}) {
  const [datum, setDatum] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [tipus, setTipus] = useState<TransferType>('kassza_bank')
  const [forras, setForras] = useState('')
  const [cel, setCel] = useState('')
  const [osszeg, setOsszeg] = useState('')
  const [celOsszeg, setCelOsszeg] = useState('')
  const [arfolyam, setArfolyam] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Auto-fill a default forrás/cél értékeket a típus alapján
  useEffect(() => {
    if (tipus === 'kassza_bank') {
      if (!forras) setForras('Kassza')
    } else if (tipus === 'bank_kassza') {
      if (!cel) setCel('Kassza')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipus])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    const osszegNum = Number.parseFloat(osszeg)
    if (!Number.isFinite(osszegNum) || osszegNum <= 0) {
      setError('Az összeg pozitív szám legyen.')
      return
    }

    let celOsszegNum: number | null = null
    let arfolyamNum: number | null = null
    if (tipus === 'valutacsere') {
      celOsszegNum = Number.parseFloat(celOsszeg)
      arfolyamNum = Number.parseFloat(arfolyam)
      if (!Number.isFinite(celOsszegNum) || celOsszegNum <= 0) {
        setError('Valutacsere esetén a cél-összeg kötelező és pozitív.')
        return
      }
      if (!Number.isFinite(arfolyamNum) || arfolyamNum <= 0) {
        setError('Valutacsere esetén az árfolyam kötelező és pozitív.')
        return
      }
    }

    setSubmitting(true)
    try {
      const supabase = getDesktopSupabase()
      const profile = await getLocalOwnProfile(userId)
      const congregationId = profile?.congregation_id
      if (!congregationId) {
        setError('Nincs aktív gyülekezet-hozzáférés.')
        return
      }
      const result: SaveInternalTransferResultOrError = await saveInternalTransferUseCase(
        {
          congregationId,
          datum,
          tipus,
          forras: forras.trim(),
          cel: cel.trim(),
          osszeg: osszegNum,
          cel_osszeg: celOsszegNum,
          arfolyam: arfolyamNum,
          megjegyzes: megjegyzes.trim() || null,
        },
        { supabase, runtime: 'desktop', userId },
      )

      if (!result.success) {
        setError(result.error)
        return
      }
      setSuccessMsg(
        `Belső mozgás rögzítve (${TYPE_LABELS[tipus]}, ${osszegNum.toLocaleString('hu')} RON).`,
      )
      setOsszeg('')
      setCelOsszeg('')
      setArfolyam('')
      setMegjegyzes('')
      setTimeout(() => setSuccessMsg(null), 5000)
      onSaved()
    } catch (err) {
      setError(`Váratlan hiba: ${errorMessage(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const formDisabled = !isOnline || submitting
  const isValutacsere = tipus === 'valutacsere'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Új belső mozgás</CardTitle>
        <CardDescription className="text-xs">
          Rögzítsd, mikor viszed a perselypénzt a bankba vagy veszel fel pénzt a bankból a
          kasszába. A tagok befizetéseit ez nem érinti.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Dátum + Típus */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bm-datum">Dátum *</Label>
              <Input
                id="bm-datum"
                type="date"
                required
                value={datum}
                onChange={(e) => setDatum(e.currentTarget.value)}
                disabled={formDisabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bm-tipus">Típus *</Label>
              <select
                id="bm-tipus"
                required
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={tipus}
                onChange={(e) => {
                  const newTipus = e.currentTarget.value as TransferType
                  setTipus(newTipus)
                  // Reset cél/forrás, hogy az auto-fill működjön
                  if (newTipus === 'kassza_bank') {
                    setCel('')
                  } else if (newTipus === 'bank_kassza') {
                    setForras('')
                  }
                }}
                disabled={formDisabled}
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Forrás + cél */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bm-forras">Forrás *</Label>
              <Input
                id="bm-forras"
                required
                maxLength={100}
                value={forras}
                onChange={(e) => setForras(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder={tipus === 'bank_kassza' ? 'pl. BCR bank' : 'pl. Kassza'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bm-cel">Cél *</Label>
              <Input
                id="bm-cel"
                required
                maxLength={100}
                value={cel}
                onChange={(e) => setCel(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder={tipus === 'kassza_bank' ? 'pl. BCR bank' : 'pl. Kassza'}
              />
            </div>
          </div>

          {/* Összeg (+ valutacsere: cél-összeg, árfolyam) */}
          <div className={`grid gap-3 ${isValutacsere ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
            <div className="space-y-1.5">
              <Label htmlFor="bm-osszeg">Összeg (RON) *</Label>
              <Input
                id="bm-osszeg"
                type="number"
                min={0.01}
                step={0.01}
                required
                value={osszeg}
                onChange={(e) => setOsszeg(e.currentTarget.value)}
                disabled={formDisabled}
                placeholder="pl. 500"
              />
            </div>
            {isValutacsere && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="bm-cel-osszeg">Cél-összeg *</Label>
                  <Input
                    id="bm-cel-osszeg"
                    type="number"
                    min={0.01}
                    step={0.01}
                    required
                    value={celOsszeg}
                    onChange={(e) => setCelOsszeg(e.currentTarget.value)}
                    disabled={formDisabled}
                    placeholder="pl. 100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bm-arfolyam">Árfolyam *</Label>
                  <Input
                    id="bm-arfolyam"
                    type="number"
                    min={0.0001}
                    step={0.0001}
                    required
                    value={arfolyam}
                    onChange={(e) => setArfolyam(e.currentTarget.value)}
                    disabled={formDisabled}
                    placeholder="pl. 4.97"
                  />
                </div>
              </>
            )}
          </div>

          {/* Megjegyzés */}
          <div className="space-y-1.5">
            <Label htmlFor="bm-megjegy">Megjegyzés (opcionális)</Label>
            <Input
              id="bm-megjegy"
              maxLength={500}
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.currentTarget.value)}
              disabled={formDisabled}
              placeholder="pl. Vasárnapi persely bevitel"
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
          {successMsg && (
            <div
              role="status"
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              <CheckCircle2 className="mr-1.5 inline-block size-4" />
              {successMsg}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={formDisabled}>
              {submitting ? 'Rögzítés…' : 'Belső mozgás rögzítése'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lista
// ─────────────────────────────────────────────────────────────────────────

function RecentTransfersSection({
  userId,
  year,
  refreshKey,
}: {
  userId: string
  year: number
  refreshKey: number
}) {
  const [rows, setRows] = useState<BelsomozgasListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTipus, setFilterTipus] = useState<TransferType | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState<number | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getDesktopSupabase()
      const profile = await getLocalOwnProfile(userId)
      const congregationId = profile?.congregation_id
      if (!congregationId) {
        setError('Nincs aktív gyülekezet-hozzáférés.')
        return
      }
      const result: ListInternalTransfersResult = await listInternalTransfersUseCase(
        {
          congregationId,
          year,
          tipus: filterTipus ?? undefined,
          orderBy: 'datum-desc',
          limit: 500,
          includeDeleted: false,
        },
        { supabase, runtime: 'desktop' },
      )
      if (result.success) {
        setRows(result.rows)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(`Lista-hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [userId, year, filterTipus])

  useEffect(() => {
    void loadList()
  }, [loadList, refreshKey])

  async function handleDelete(row: BelsomozgasListRow) {
    if (
      !window.confirm(
        `Biztosan törlöd a ${row.datum} dátumú belső mozgást (${row.osszeg.toLocaleString('hu')} RON)?`,
      )
    ) {
      return
    }
    setDeleteSubmitting(row.id)
    try {
      const supabase = getDesktopSupabase()
      const profile = await getLocalOwnProfile(userId)
      const congregationId = profile?.congregation_id
      if (!congregationId) return
      const result: SoftDeleteInternalTransferResult = await softDeleteInternalTransferUseCase(
        { congregationId, transferId: row.id },
        { supabase, runtime: 'desktop' },
      )
      if (!result.success) {
        alert(`Törlés sikertelen: ${result.error}`)
        return
      }
      void loadList()
    } catch (err) {
      alert(`Törlési hiba: ${errorMessage(err)}`)
    } finally {
      setDeleteSubmitting(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Belső mozgások ({year})</CardTitle>
            <CardDescription className="text-xs">
              Az adott év utolsó 500 belső mozgása, dátum szerint csökkenő sorrendben.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadList()}
            disabled={loading}
          >
            <RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />
            Frissítés
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Szűrő */}
        <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3">
          <div className="flex items-center gap-3">
            <Label htmlFor="filter-tipus" className="text-xs">
              Típus:
            </Label>
            <select
              id="filter-tipus"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={filterTipus ?? ''}
              onChange={(e) =>
                setFilterTipus(
                  e.currentTarget.value ? (e.currentTarget.value as TransferType) : null,
                )
              }
            >
              <option value="">Mind</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {filterTipus && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setFilterTipus(null)}
                className="h-7 text-xs"
              >
                Törlés
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lista betöltése…</p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {error}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nincs rögzített belső mozgás {year}. évben.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-800">
                      {TYPE_SHORT[r.tipus]}
                    </span>
                    <span className="ml-2">
                      {r.forras} → {r.cel}
                    </span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {r.datum} · {r.osszeg.toLocaleString('hu')} RON
                    </span>
                  </p>
                  {r.tipus === 'valutacsere' && r.cel_osszeg && r.arfolyam && (
                    <p className="text-xs text-muted-foreground">
                      Cél: {r.cel_osszeg.toLocaleString('hu')} · árfolyam: {r.arfolyam}
                    </p>
                  )}
                  {r.megjegyzes && (
                    <p className="mt-0.5 text-xs italic text-muted-foreground">
                      {r.megjegyzes}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDelete(r)}
                    disabled={deleteSubmitting === r.id}
                    className="border-rose-200 text-rose-800 hover:bg-rose-50"
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    {deleteSubmitting === r.id ? 'Törlés…' : 'Törlés'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
