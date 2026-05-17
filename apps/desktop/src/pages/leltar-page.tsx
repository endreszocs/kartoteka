/**
 * Leltár oldal — `/leltar` route.
 *
 * Sprint F (2026-04-25) — READ-ONLY desktop-paritás a leltári tételekhez.
 *
 * Funkciók:
 *   - PageHero
 *   - 4 statisztika-kártya (összes / aktív / törölt / össz-érték)
 *   - Kategória-szűrő + szöveg-keresés
 *   - Leltári tétel-lista (max 200/lap, leltári-szám szerint rendezve)
 *   - „Frissítés most" gomb (full-pull)
 *   - „Új tétel" gomb (disabled, hamarosan)
 *
 * Új tétel rögzítése (write-flow) Sprint G+-ra kerül.
 */

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  Archive,
  Boxes,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'

import { Button, Card, CardContent, Input } from '@kartoteka/ui'
import { OnlineStatePill, PageHero } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import {
  getLastPullInventoryIso,
  getLocalInventory,
  getLocalInventoryStats,
  pullInventoryOfOwnCongregation,
  type InventoryItemLocalRow,
  type InventoryStats,
} from '../lib/sync'

const CATEGORY_LABELS: Record<string, string> = {
  alapeszkoz: 'Alapeszközök',
  konyv: 'Könyvek',
  mukincs: 'Műkincsek',
  felszereles: 'Felszerelés',
  liturgikus: 'Liturgikus tárgyak',
  jarmu: 'Járművek',
  ingatlan: 'Ingatlan',
  egyeb: 'Egyéb',
}

function formatCategoryLabel(key: string | null): string {
  if (!key) return 'Besorolatlan'
  return CATEGORY_LABELS[key] ?? key
}

function formatCurrency(value: number): string {
  if (!value) return '0 RON'
  return `${Math.round(value).toLocaleString('hu')} RON`
}

export function LeltarPage() {
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<InventoryStats | null>(null)
  const [items, setItems] = useState<InventoryItemLocalRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
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

  // Stats + last pull (ritka frissítés)
  useEffect(() => {
    if (!user) return
    let mounted = true
    void Promise.all([
      getLocalInventoryStats(user.id).catch(() => null),
      getLastPullInventoryIso(user.id).catch(() => null),
    ]).then(([s, lp]) => {
      if (!mounted) return
      setStats(s)
      setLastPullIso(lp)
    })
    return () => {
      mounted = false
    }
  }, [user, refreshKey])

  // Lista (search + filter változáskor frissül)
  useEffect(() => {
    if (!user) return
    let mounted = true
    void getLocalInventory(user.id, {
      search: search || undefined,
      category: categoryFilter,
      limit: 200,
    })
      .then((rows) => {
        if (mounted) setItems(rows)
      })
      .catch(() => {
        if (mounted) setItems([])
      })
    return () => {
      mounted = false
    }
  }, [user, search, categoryFilter, refreshKey])

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setPullSuccess(null)
    try {
      const result = await pullInventoryOfOwnCongregation(user.id)
      if (result.mode === 'no-congregation') {
        setPullError('Nincs hozzárendelt gyülekezet — a frissítés nem futott le.')
      } else {
        setPullSuccess(`Frissítve: ${result.pulledRows} leltári tétel.`)
        setRefreshKey((k) => k + 1)
      }
    } catch (err) {
      setPullError(errorMessage(err))
    } finally {
      setPulling(false)
    }
  }, [user])

  const lastPullText = lastPullIso ? formatRelativeTime(lastPullIso) : 'még sosem'
  const categories = Object.keys(stats?.byCategory ?? {}).sort()

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Leltár"
          title="Leltári tételek"
          description="A gyülekezet alapeszközei, könyvei, műkincsei és egyéb javai egy helyen. Az adatok offline is elérhetők; új tétel rögzítése hamarosan."
          Icon={Boxes}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Új leltári tétel rögzítése a következő frissítésben érkezik."
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <Plus className="mr-1 size-3.5" />
                Új tétel
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

        {/* DIAGNOSTICS P2-7: egységes online/offline pill a read-only oldalakra */}
        <div className="flex justify-end">
          <OnlineStatePill lastSyncAt={lastPullIso} />
        </div>

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

        {/* 4 stat-kártya */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Összes tétel" value={stats?.total ?? 0} icon={Archive} gradient="from-sky-500 to-blue-600" />
          <StatCard label="Aktív tételek" value={stats?.active ?? 0} icon={Boxes} gradient="from-emerald-500 to-teal-600" />
          <StatCard label="Törölt" value={stats?.deleted ?? 0} icon={Trash2} gradient="from-slate-500 to-slate-700" />
          <StatCard label="Össz-érték" value={formatCurrency(stats?.totalValue ?? 0)} icon={Boxes} gradient="from-amber-500 to-orange-600" isText />
        </div>

        {/* Szűrők */}
        <Card className="card-raised border-0">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Keresés megnevezésre, leltári-számra, helyszínre…"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    categoryFilter === null
                      ? 'bg-slate-800 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Mind
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      categoryFilter === cat
                        ? 'bg-slate-800 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {formatCategoryLabel(cat)}
                    <span className="ml-1.5 opacity-70">({stats?.byCategory[cat] ?? 0})</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        {items.length === 0 ? (
          <Card className="card-raised border-0">
            <CardContent className="p-10 text-center">
              <Archive className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {search || categoryFilter
                  ? 'A szűrőknek megfelelő tétel nem található.'
                  : 'Még nincsen leltári tétel a lokális cache-ben.'}
              </p>
              <p className="text-xs text-slate-400">
                Kattints a „Frissítés most" gombra, ha online vagy.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="card-raised border-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Lelt. szám</th>
                  <th className="px-4 py-2.5">Megnevezés</th>
                  <th className="px-4 py-2.5">Kategória</th>
                  <th className="px-4 py-2.5">Helyszín</th>
                  <th className="px-4 py-2.5">Mennyiség</th>
                  <th className="px-4 py-2.5 text-right">Érték (RON)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{it.leltari_szam ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-800">
                      <div className="font-medium">{it.megnevezes}</div>
                      {it.szerzo && <div className="text-xs text-slate-500">{it.szerzo}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{formatCategoryLabel(it.kategoria)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{it.helyszin ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {it.mennyiseg.toLocaleString('hu')} {it.mertekegyseg ?? 'db'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {it.beszerzes_erteke ? formatCurrency(it.beszerzes_erteke * it.mennyiseg) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 200 && (
              <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-500">
                Az első 200 találat látszik. Szűkítsd a keresést, hogy a többit is láthasd.
              </div>
            )}
          </Card>
        )}
      </div>
    </DesktopShell>
  )
}

// ──────────────────────────────────────────────────────────────
// Helper komponensek
// ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  icon: typeof Archive
  gradient: string
  isText?: boolean
}

function StatCard({ label, value, icon: Icon, gradient, isText }: StatCardProps) {
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className={`mt-1 font-bold text-slate-800 ${isText ? 'text-base' : 'text-2xl'}`}>
              {typeof value === 'number' ? value.toLocaleString('hu') : value}
            </p>
          </div>
          <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
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
