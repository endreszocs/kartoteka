/**
 * Anyakönyvi oldal — `/anyakonyv` route.
 *
 * Sprint C+D (2026-04-25) — READ-ONLY desktop-paritás 8 anyakönyvi táblára:
 *   - 4 fő: keresztelés, konfirmáció, házasság, temetés (Sprint C)
 *   - 4 mozgás: beköltözött, elköltözött, áttért, kitért (Sprint D)
 *
 * Funkciók:
 *   - PageHero a webes feel-lel
 *   - 4 fő statisztika-kártya (totál + idén)
 *   - 4 mozgás kompakt összegző (csak ha van adat)
 *   - 8 fül a 8 tábla listájával (legfrissebbek elöl, max 50/tábla)
 *   - „Frissítés most" gomb a manual full-pull-hoz
 *   - „Új rögzítés" gomb (disabled, hamarosan tooltipel)
 *
 * Online-only adat-frissítés (a Pull-gomb): full-pull a Supabase-ből.
 * Offline mód: a meglévő lokális cache látszik (read-only).
 *
 * Új keresztelés / házasság / temetés / mozgás rögzítése Sprint E-re.
 */

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BookMarked,
  CheckCircle2,
  Plus,
  RefreshCw,
  Repeat,
} from 'lucide-react'

import { Button, Card, CardContent } from '@kartoteka/ui'
import { PageHero } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLastPullRegistryIso,
  getLocalAttertek,
  getLocalBekoltozottek,
  getLocalElkoltozottek,
  getLocalEltemetettek,
  getLocalHazasultak,
  getLocalKeresztelesek,
  getLocalKitertek,
  getLocalKonfirmaltak,
  getLocalRegistryStats,
  pullRegistryOfOwnCongregation,
  type AttertLocalRow,
  type BekoltozottLocalRow,
  type ElkoltozottLocalRow,
  type HazassagLocalRow,
  type KeresztsegLocalRow,
  type KitertLocalRow,
  type KonfirmalasLocalRow,
  type RegistryStats,
  type TemetesLocalRow,
} from '../lib/sync'

type RegistryTab =
  | 'keresztseg'
  | 'konfirmalas'
  | 'hazassag'
  | 'temetes'
  | 'bekoltozott'
  | 'elkoltozott'
  | 'attert'
  | 'kitert'

const TAB_LABELS: Record<RegistryTab, string> = {
  keresztseg: 'Kereszteltek',
  konfirmalas: 'Konfirmáltak',
  hazassag: 'Házasultak',
  temetes: 'Eltemetettek',
  bekoltozott: 'Beköltözöttek',
  elkoltozott: 'Elköltözöttek',
  attert: 'Áttértek',
  kitert: 'Kitértek',
}

const TAB_COLORS: Record<RegistryTab, string> = {
  keresztseg: 'from-sky-500 to-blue-600',
  konfirmalas: 'from-violet-500 to-purple-600',
  hazassag: 'from-amber-500 to-orange-600',
  temetes: 'from-slate-500 to-slate-700',
  bekoltozott: 'from-teal-500 to-cyan-600',
  elkoltozott: 'from-orange-500 to-amber-600',
  attert: 'from-emerald-500 to-green-600',
  kitert: 'from-rose-500 to-red-600',
}

export function AnyakonyvPage() {
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<RegistryStats | null>(null)
  const [keresztelesek, setKeresztelesek] = useState<KeresztsegLocalRow[]>([])
  const [konfirmaltak, setKonfirmaltak] = useState<KonfirmalasLocalRow[]>([])
  const [hazasultak, setHazasultak] = useState<HazassagLocalRow[]>([])
  const [eltemetettek, setEltemetettek] = useState<TemetesLocalRow[]>([])
  const [bekoltozottek, setBekoltozottek] = useState<BekoltozottLocalRow[]>([])
  const [elkoltozottek, setElkoltozottek] = useState<ElkoltozottLocalRow[]>([])
  const [attertek, setAttertek] = useState<AttertLocalRow[]>([])
  const [kitertek, setKitertek] = useState<KitertLocalRow[]>([])
  const [activeTab, setActiveTab] = useState<RegistryTab>('keresztseg')
  const [lastPullIso, setLastPullIso] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullSuccess, setPullSuccess] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Auth
  useEffect(() => {
    let mounted = true
    const supabase = getDesktopSupabase()
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Lokális adat-fetch
  useEffect(() => {
    if (!user) return
    let mounted = true

    void Promise.all([
      getLocalRegistryStats(user.id).catch(() => null),
      getLocalKeresztelesek(user.id, 50).catch(() => []),
      getLocalKonfirmaltak(user.id, 50).catch(() => []),
      getLocalHazasultak(user.id, 50).catch(() => []),
      getLocalEltemetettek(user.id, 50).catch(() => []),
      getLocalBekoltozottek(user.id, 50).catch(() => []),
      getLocalElkoltozottek(user.id, 50).catch(() => []),
      getLocalAttertek(user.id, 50).catch(() => []),
      getLocalKitertek(user.id, 50).catch(() => []),
      getLastPullRegistryIso(user.id).catch(() => null),
    ]).then(([s, k1, k2, k3, k4, m1, m2, m3, m4, lp]) => {
      if (!mounted) return
      setStats(s)
      setKeresztelesek(k1)
      setKonfirmaltak(k2)
      setHazasultak(k3)
      setEltemetettek(k4)
      setBekoltozottek(m1)
      setElkoltozottek(m2)
      setAttertek(m3)
      setKitertek(m4)
      setLastPullIso(lp)
    })

    return () => {
      mounted = false
    }
  }, [user, refreshKey])

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setPullSuccess(null)
    try {
      const result = await pullRegistryOfOwnCongregation(user.id)
      if (result.mode === 'no-congregation') {
        setPullError('Nincs hozzárendelt gyülekezet — a frissítés nem futott le.')
      } else {
        const total =
          result.pulledRows.kereszteles +
          result.pulledRows.konfirmacio +
          result.pulledRows.hazassag +
          result.pulledRows.temetes +
          result.pulledRows.bekoltozott +
          result.pulledRows.elkoltozott +
          result.pulledRows.attert +
          result.pulledRows.kitert
        setPullSuccess(`Frissítve: ${total} bejegyzés a 8 anyakönyvi táblából.`)
        setRefreshKey((k) => k + 1)
      }
    } catch (err) {
      setPullError(errorMessage(err))
    } finally {
      setPulling(false)
    }
  }, [user])

  const lastPullText = lastPullIso ? formatRelativeTime(lastPullIso) : 'még sosem'
  const hasMovement =
    (stats?.totals.bekoltozott ?? 0) > 0 ||
    (stats?.totals.elkoltozott ?? 0) > 0 ||
    (stats?.totals.attert ?? 0) > 0 ||
    (stats?.totals.kitert ?? 0) > 0

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Anyakönyv"
          title="Anyakönyvi nyilvántartás"
          description="Keresztelések, konfirmációk, házasságok, temetések és tagmozgások áttekintése. Az adatok offline is elérhetők; új bejegyzés rögzítése hamarosan."
          Icon={BookMarked}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Új bejegyzés rögzítése a következő frissítésben érkezik."
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <Plus className="mr-1 size-3.5" />
                Új rögzítés
              </Button>
              <Button
                size="sm"
                onClick={handlePull}
                disabled={pulling}
                className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)]"
              >
                <RefreshCw className={`mr-1 size-3.5 ${pulling ? 'animate-spin' : ''}`} />
                {pulling ? 'Frissítés…' : 'Frissítés most'}
              </Button>
            </>
          }
          stats={[{ label: 'Utolsó frissítés', value: lastPullText }]}
        />

        {pullError && (
          <Card className="border-red-200 bg-red-50/80">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{pullError}</span>
            </CardContent>
          </Card>
        )}
        {pullSuccess && (
          <Card className="border-emerald-200 bg-emerald-50/80">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>{pullSuccess}</span>
            </CardContent>
          </Card>
        )}

        {/* 4 fő statisztika-kártya */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Kereszteltek" total={stats?.totals.kereszteles ?? 0} thisYear={stats?.thisYear.kereszteles ?? 0} year={stats?.currentYear ?? new Date().getFullYear()} gradient="from-sky-500 to-blue-600" />
          <StatCard label="Konfirmáltak" total={stats?.totals.konfirmacio ?? 0} thisYear={stats?.thisYear.konfirmacio ?? 0} year={stats?.currentYear ?? new Date().getFullYear()} gradient="from-violet-500 to-purple-600" />
          <StatCard label="Házasultak" total={stats?.totals.hazassag ?? 0} thisYear={stats?.thisYear.hazassag ?? 0} year={stats?.currentYear ?? new Date().getFullYear()} gradient="from-amber-500 to-orange-600" />
          <StatCard label="Eltemetettek" total={stats?.totals.temetes ?? 0} thisYear={stats?.thisYear.temetes ?? 0} year={stats?.currentYear ?? new Date().getFullYear()} gradient="from-slate-500 to-slate-700" />
        </div>

        {/* Mozgás-stat összegző (csak ha van adat) */}
        {hasMovement && (
          <Card className="card-raised border-0">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <MovementMini label="Beköltözöttek" total={stats?.totals.bekoltozott ?? 0} thisYear={stats?.thisYear.bekoltozott ?? 0} icon={ArrowDownLeft} color="text-teal-600" />
                <MovementMini label="Elköltözöttek" total={stats?.totals.elkoltozott ?? 0} thisYear={stats?.thisYear.elkoltozott ?? 0} icon={ArrowUpRight} color="text-orange-600" />
                <MovementMini label="Áttértek" total={stats?.totals.attert ?? 0} thisYear={stats?.thisYear.attert ?? 0} icon={Repeat} color="text-emerald-600" />
                <MovementMini label="Kitértek" total={stats?.totals.kitert ?? 0} thisYear={stats?.thisYear.kitert ?? 0} icon={Repeat} color="text-rose-600" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fülek (8 tab, responsive: mobil 2 oszlopos, sm+ wrap) */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {(Object.keys(TAB_LABELS) as RegistryTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                activeTab === t
                  ? `bg-gradient-to-br ${TAB_COLORS[t]} text-white shadow-md`
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Aktív tartalom */}
        {activeTab === 'keresztseg' && <KeresztsegList rows={keresztelesek} />}
        {activeTab === 'konfirmalas' && <KonfirmalasList rows={konfirmaltak} />}
        {activeTab === 'hazassag' && <HazassagList rows={hazasultak} />}
        {activeTab === 'temetes' && <TemetesList rows={eltemetettek} />}
        {activeTab === 'bekoltozott' && <BekoltozottList rows={bekoltozottek} />}
        {activeTab === 'elkoltozott' && <ElkoltozottList rows={elkoltozottek} />}
        {activeTab === 'attert' && <AttertList rows={attertek} />}
        {activeTab === 'kitert' && <KitertList rows={kitertek} />}
      </div>
    </DesktopShell>
  )
}

// ──────────────────────────────────────────────────────────────
// Helper komponensek
// ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  total: number
  thisYear: number
  year: number
  gradient: string
}

function StatCard({ label, total, thisYear, year, gradient }: StatCardProps) {
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800">
              {total.toLocaleString('hu')}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              ebből <strong className="text-slate-700">{thisYear.toLocaleString('hu')}</strong> {year}-ben
            </p>
          </div>
          <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}>
            <BookMarked className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface MovementMiniProps {
  label: string
  total: number
  thisYear: number
  icon: typeof ArrowDownLeft
  color: string
}

function MovementMini({ label, total, thisYear, icon: Icon, color }: MovementMiniProps) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`size-5 shrink-0 ${color}`} />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-base font-bold text-slate-800">
          {total.toLocaleString('hu')}
          <span className="ml-1 text-[11px] font-normal text-slate-500">
            ({thisYear} idén)
          </span>
        </p>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card className="card-raised border-0">
      <CardContent className="p-10 text-center">
        <BookMarked className="mx-auto size-10 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">Még nincsen {label} a lokális cache-ben.</p>
        <p className="text-xs text-slate-400">Kattints a „Frissítés most" gombra, ha online vagy.</p>
      </CardContent>
    </Card>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[1]}. ${m[2]}. ${m[3]}.`
}

function KeresztsegList({ rows }: { rows: KeresztsegLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="keresztelés" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Dátum</th>
            <th className="px-4 py-2.5">Okirat</th>
            <th className="px-4 py-2.5">Lelkész</th>
            <th className="px-4 py-2.5">Keresztszülők</th>
            <th className="px-4 py-2.5">Megjegyzés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                {formatDate(r.datum)}
                {r.munkanaploba === 1 && (
                  <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                    munkanapló
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-slate-700">{r.okirat ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.lelkeszneve ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.keresztszulok ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.megjegyzes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function KonfirmalasList({ rows }: { rows: KonfirmalasLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="konfirmáció" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Dátum</th>
            <th className="px-4 py-2.5">Lelkész</th>
            <th className="px-4 py-2.5">Megjegyzés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(r.datum)}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.lelkeszneve ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.megjegyzes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function HazassagList({ rows }: { rows: HazassagLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="házasság" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Dátum</th>
            <th className="px-4 py-2.5">Házasságlevél</th>
            <th className="px-4 py-2.5">Lelkész</th>
            <th className="px-4 py-2.5">Tanúk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(r.datum)}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.hlevel ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.lelkeszneve ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.tanuk ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function TemetesList({ rows }: { rows: TemetesLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="temetés" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Temetés dátuma</th>
            <th className="px-4 py-2.5">Halálozás</th>
            <th className="px-4 py-2.5">Okirat</th>
            <th className="px-4 py-2.5">Lelkész</th>
            <th className="px-4 py-2.5">Halál oka</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(r.tdatum)}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{formatDate(r.hdatum)}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.okirat ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.lelkeszneve ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.hoka ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────
// Sprint D — 4 mozgás-tábla lista-komponens
// ──────────────────────────────────────────────────────────────

function BekoltozottList({ rows }: { rows: BekoltozottLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="beköltözés" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Dátum</th>
            <th className="px-4 py-2.5">Igazolás</th>
            <th className="px-4 py-2.5">Megjegyzés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(r.mikor)}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.igazolas ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.megjegyzes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function ElkoltozottList({ rows }: { rows: ElkoltozottLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="elköltözés" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Dátum</th>
            <th className="px-4 py-2.5">Külföldre</th>
            <th className="px-4 py-2.5">Megjegyzés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(r.mikor)}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.kulfoldre === 1 ? 'Igen' : 'Nem'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.megjegyzes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function AttertList({ rows }: { rows: AttertLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="áttérés" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Dátum</th>
            <th className="px-4 py-2.5">Honnan (felekezet)</th>
            <th className="px-4 py-2.5">Megjegyzés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(r.mikor)}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.felekezet ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.megjegyzes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function KitertList({ rows }: { rows: KitertLocalRow[] }) {
  if (rows.length === 0) return <EmptyState label="kitérés" />
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Dátum</th>
            <th className="px-4 py-2.5">Hová (felekezet)</th>
            <th className="px-4 py-2.5">Megjegyzés</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{formatDate(r.mikor)}</td>
              <td className="px-4 py-2.5 text-slate-700">{r.felekezet ?? '—'}</td>
              <td className="px-4 py-2.5 text-slate-500">{r.megjegyzes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = now - then
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin < 1) return 'most'
    if (diffMin < 60) return `${diffMin} perce`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr} órája`
    const diffDay = Math.round(diffHr / 24)
    if (diffDay < 30) return `${diffDay} napja`
    return new Date(iso).toLocaleDateString('hu-HU')
  } catch {
    return iso.slice(0, 10)
  }
}
