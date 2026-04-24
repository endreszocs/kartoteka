/**
 * Pénzügyi áttekintés oldal — `/penzugy/attekintes` route.
 *
 * A-M7.5 (2026-04-24) — egyetlen oldalon a gyülekezet éves pénzügyi képe:
 *   - Év-szűrő (elmúlt 6 év)
 *   - Stat-kártyák: bevétel / kiadás / egyenleg
 *   - Havi bontás (12 hónap, összegek + darabszám)
 *   - Top 5 befizetés-kategória + Top 5 kiadás-kategória
 *
 * Kliens-oldali aggregáció a meglévő `listIncomeUseCase` + `listExpenseUseCase`
 * 500-as listájából. Nincs új backend use-case — a két use-case-t limit 500-zal
 * hívjuk és reduce-oljuk.
 *
 * Online-only; az offline-variáns a chitanta-minta szerint jön később.
 */

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  LayoutDashboard,
  RefreshCw,
  Scale,
  WifiOff,
} from 'lucide-react'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
} from '@kartoteka/ui'
import {
  listExpenseUseCase,
  listIncomeUseCase,
  type ListExpenseResult,
  type ListIncomeResult,
} from '@kartoteka/core'
import type {
  BefizetesListRow,
  KiadasListRow,
} from '@kartoteka/validations'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import {
  getLocalBefizetesek,
  getLocalKiadasok,
  pullBefizetesek,
  pullKiadasok,
} from '../lib/finance-sync'
import { getDesktopSupabase } from '../lib/supabase'
import { getLocalOwnProfile } from '../lib/sync'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'

interface AggregateStat {
  osszeg: number
  count: number
}

interface MonthlyStat {
  month: number // 1-12
  bevetel: number
  kiadas: number
  bevetelDb: number
  kiadasDb: number
}

/**
 * TVA-plafon 2026-ban: 395.000 RON / év. Ha a gyülekezet éves forgalom
 * meghaladja, TVA-kötelezettség áll be (külön regisztráció + negyedéves
 * deklaráció). A figyelmeztetés 4-szintű:
 *   - < 50% (< 197.500 RON): elrejtve (nyugodt)
 *   - 50-75%: sárga tájékoztató
 *   - 75-90%: narancs figyelmeztetés
 *   - > 90%: piros kritikus („hamarosan eléred")
 *   - > 100%: piros „elérted" (külön üzenet)
 *
 * A dashboard konzervatív közelítéssel számol: a teljes éves bevételt
 * nézi (nem csak a `tva_plafonba_szamit=true` kategóriákat). Ez overcounts,
 * de **biztonsági háló** — ha ez alapján nyugodtak vagyunk, biztosan OK
 * a valódi TVA-számítás is. A precíz TVA-elemzés a web app WC-1 moduljában.
 */
const TVA_PLAFON_RON = 395_000

const MONTH_NAMES = [
  'Január',
  'Február',
  'Március',
  'Április',
  'Május',
  'Június',
  'Július',
  'Augusztus',
  'Szeptember',
  'Október',
  'November',
  'December',
]

// ─────────────────────────────────────────────────────────────────────────
// Fő oldal
// ─────────────────────────────────────────────────────────────────────────

export function PenzugyDashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)

  const [year, setYear] = useState<number>(() => new Date().getFullYear())

  const [incomeRows, setIncomeRows] = useState<BefizetesListRow[]>([])
  const [expenseRows, setExpenseRows] = useState<KiadasListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'server' | 'local' | 'mixed'>('server')

  // A-M7.9d — pending lokál sorok aggregátuma (offline-rögzített, sync-re vár)
  const [pendingSummary, setPendingSummary] = useState<{
    incomeCount: number
    incomeAmount: number
    expenseCount: number
    expenseAmount: number
    incomeConflicts: number
    expenseConflicts: number
  } | null>(null)

  const navigate = useNavigate()

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

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

  // Online/offline tracking
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

  // Adatbetöltés — online-first + offline-fallback (A-M7.8d)
  const loadData = useCallback(async () => {
    if (!congregationId) return
    setLoading(true)
    setError(null)

    const supabase = getDesktopSupabase()

    // Online-ág: szerver-lekérdezés + háttér-pull-sync
    if (isOnline) {
      try {
        const [incomeResult, expenseResult] = await Promise.all([
          listIncomeUseCase(
            {
              congregationId,
              year,
              yearField: 'fizetettev',
              orderBy: 'datum-desc',
              limit: 2000,
              includeDeleted: false,
              includeStornozott: false,
            },
            { supabase, runtime: 'desktop' },
          ) as Promise<ListIncomeResult>,
          listExpenseUseCase(
            {
              congregationId,
              year,
              orderBy: 'datum-desc',
              limit: 2000,
              includeDeleted: false,
              includeStornozott: false,
            },
            { supabase, runtime: 'desktop' },
          ) as Promise<ListExpenseResult>,
        ])

        let serverIncomeOk = false
        let serverExpenseOk = false

        if (incomeResult.success) {
          setIncomeRows(incomeResult.rows)
          serverIncomeOk = true
        } else {
          setError(`Bevétel-lista hiba: ${incomeResult.error}`)
        }
        if (expenseResult.success) {
          setExpenseRows(expenseResult.rows)
          serverExpenseOk = true
        } else {
          setError((prev) =>
            prev
              ? `${prev} · Kiadás-lista hiba: ${expenseResult.error}`
              : `Kiadás-lista hiba: ${expenseResult.error}`,
          )
        }

        if (serverIncomeOk && serverExpenseOk) {
          setDataSource('server')
          // Háttér-pull-sync — a lokális cache frissítése, hogy később offline is olvasható legyen
          void pullBefizetesek(congregationId, year)
          void pullKiadasok(congregationId, year)
        } else {
          // Részleges hiba — fallback a lokálisra a hiányzó oldalon
          await loadLocalFallback(congregationId, year, {
            skipIncome: serverIncomeOk,
            skipExpense: serverExpenseOk,
          })
          setDataSource(serverIncomeOk || serverExpenseOk ? 'mixed' : 'local')
        }
      } catch (err) {
        // Hálózati exception — teljes fallback a lokálisra
        await loadLocalFallback(congregationId, year, { skipIncome: false, skipExpense: false })
        setDataSource('local')
        setError(
          `Hálózati hiba (${errorMessage(err)}) — a legutóbb szinkronizált lokális adatokat mutatjuk.`,
        )
      } finally {
        setLoading(false)
      }
    } else {
      // Offline-ág: csak lokális
      await loadLocalFallback(congregationId, year, { skipIncome: false, skipExpense: false })
      setDataSource('local')
      setLoading(false)
    }

    async function loadLocalFallback(
      cid: string,
      y: number,
      opts: { skipIncome: boolean; skipExpense: boolean },
    ) {
      try {
        if (!opts.skipIncome) {
          const localIncome = await getLocalBefizetesek(cid, y)
          setIncomeRows(
            localIncome
              .filter((r) => r.stornozott === 0 && r.deleted === 0)
              .map((r) => localToIncomeRow(r)),
          )
        }
        if (!opts.skipExpense) {
          const localExpense = await getLocalKiadasok(cid, y)
          setExpenseRows(
            localExpense
              .filter((r) => r.stornozott === 0 && r.deleted === 0)
              .map((r) => localToExpenseRow(r)),
          )
        }
      } catch (err) {
        setError(`Lokális adat-hiba: ${errorMessage(err)}`)
      }
    }

    // A-M7.9d — pending sorok aggregálása (mindkét ág végén fut, csendes)
    await loadPendingSummary(congregationId, year)
  }, [congregationId, year, isOnline])

  /**
   * A-M7.9d — Offline rögzített befizetések + kiadások aggregálása.
   * Csendes (a hibát nem mutatjuk a user-nek, csak `null` lesz a banner).
   */
  async function loadPendingSummary(cid: string, y: number) {
    try {
      const backend = getTauriSqliteBackend()
      const [befizetesPending, kiadasPending] = await Promise.all([
        backend.listLocalPendingBefizetes(cid, y),
        backend.listLocalPendingKiadas(cid, y),
      ])

      const incomeAmount = befizetesPending.reduce((sum, r) => sum + (r.osszeg || 0), 0)
      const expenseAmount = kiadasPending.reduce((sum, r) => sum + (r.osszeg || 0), 0)
      const incomeConflicts = befizetesPending.filter((r) => r.sync_state === 'conflict').length
      const expenseConflicts = kiadasPending.filter((r) => r.sync_state === 'conflict').length

      if (befizetesPending.length === 0 && kiadasPending.length === 0) {
        setPendingSummary(null)
        return
      }

      setPendingSummary({
        incomeCount: befizetesPending.length,
        incomeAmount,
        expenseCount: kiadasPending.length,
        expenseAmount,
        incomeConflicts,
        expenseConflicts,
      })
    } catch {
      setPendingSummary(null)
    }
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Aggregációk
  const totalIncome = incomeRows.reduce((sum, r) => sum + (r.osszeg || 0), 0)
  const totalExpense = expenseRows.reduce((sum, r) => sum + (r.osszeg || 0), 0)
  const balance = totalIncome - totalExpense

  // Havi bontás
  const monthlyMap = new Map<number, MonthlyStat>()
  for (let m = 1; m <= 12; m += 1) {
    monthlyMap.set(m, { month: m, bevetel: 0, kiadas: 0, bevetelDb: 0, kiadasDb: 0 })
  }
  for (const r of incomeRows) {
    const d = new Date(r.datum)
    const m = d.getMonth() + 1
    const stat = monthlyMap.get(m)!
    stat.bevetel += r.osszeg || 0
    stat.bevetelDb += 1
  }
  for (const r of expenseRows) {
    const d = new Date(r.datum)
    const m = d.getMonth() + 1
    const stat = monthlyMap.get(m)!
    stat.kiadas += r.osszeg || 0
    stat.kiadasDb += 1
  }
  const monthlyStats = Array.from(monthlyMap.values())
  const maxMonthly = Math.max(
    ...monthlyStats.map((s) => Math.max(s.bevetel, s.kiadas)),
    1,
  )

  // Top kategóriák
  const incomeByCategory = aggregateByCategory(
    incomeRows,
    (r) => r.befizetescel_nev || `Kategória #${r.id_befizetescel}`,
    (r) => r.osszeg || 0,
  )
  const expenseByCategory = aggregateByCategory(
    expenseRows,
    (r) => r.kiadascel_nev || `Kategória #${r.id_kiadascel}`,
    (r) => r.osszeg || 0,
  )
  const topIncome = incomeByCategory.slice(0, 5)
  const topExpense = expenseByCategory.slice(0, 5)

  return (
    <DesktopShell>
      <main className="mx-auto max-w-6xl space-y-5 p-5 sm:p-6">
        {/* Premium fejléc — a webes FinanceTabs-feel */}
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,251,250,0.98)_100%)] p-5 shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-slate-200/70 sm:p-6">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-violet-200/35 blur-3xl" />
            <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-teal-200/30 blur-3xl" />
          </div>
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem]">
                <LayoutDashboard className="size-7" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
                  Pénzügy
                </p>
                <h1 className="mt-1 font-serif text-[1.8rem] leading-[1.08] text-slate-800 sm:text-[2rem]">
                  Pénzügyi áttekintés
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  A gyülekezet éves pénzügyi helyzete: bevétel, kiadás, egyenleg, havi bontás és
                  kategóriák. A sztornózott és törölt sorok nem számítanak bele.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-stretch sm:self-start">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadData()}
                disabled={loading}
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <RefreshCw className={`mr-1.5 size-4 ${loading ? 'animate-spin' : ''}`} />
                Frissítés
              </Button>
            </div>
          </div>
        </div>

        {!isOnline && (
          <div className="rounded-lg border border-orange-300 bg-orange-50/80 p-3 text-sm text-orange-900">
            <div className="flex items-start gap-3">
              <WifiOff className="mt-0.5 size-5 shrink-0 text-orange-600" />
              <div>
                <p className="font-semibold">Offline munkamenet — lokális adatot mutatunk.</p>
                <p className="mt-1 text-orange-800">
                  A legutóbb szinkronizált lokális adatokat látod. Amint visszakapcsolódsz, az
                  oldal frissül a legújabb szerver-adatokkal.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Adat-forrás jelzés (A-M7.8d) */}
        {isOnline && dataSource !== 'server' && !loading && (
          <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            <AlertCircle className="mr-1.5 inline-block size-3.5" />
            {dataSource === 'local'
              ? 'A szerver nem elérhető — lokális adat látszik.'
              : 'Részleges adat: egyes oldalak lokális cache-ből.'}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mr-1.5 inline-block size-4" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-sm">Adatok betöltése…</p>
          </div>
        ) : !user || !congregationId ? (
          <p className="text-sm text-muted-foreground">Nincs aktív gyülekezet.</p>
        ) : (
          <>
            {/* A-M7.9d — Pending sorok aggregátuma (offline-rögzített, sync-re vár) */}
            {pendingSummary && (
              <PendingSummaryBanner
                summary={pendingSummary}
                onIncomeClick={() => navigate('/penzugy/befizetes')}
                onExpenseClick={() => navigate('/penzugy/kiadas')}
              />
            )}

            {/* Stat-kártyák */}
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Bevétel"
                value={totalIncome}
                count={incomeRows.length}
                Icon={ArrowUpRight}
                tone="emerald"
              />
              <StatCard
                title="Kiadás"
                value={totalExpense}
                count={expenseRows.length}
                Icon={ArrowDownRight}
                tone="rose"
              />
              <StatCard
                title="Egyenleg"
                value={balance}
                count={null}
                Icon={Scale}
                tone={balance >= 0 ? 'sky' : 'amber'}
                subtitle={balance >= 0 ? 'Pozitív' : 'Negatív'}
              />
            </div>

            {/* TVA-plafon figyelmeztető */}
            <TvaPlafonWarning totalIncome={totalIncome} year={year} />

            {/* Havi bontás */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Havi bontás — {year}</CardTitle>
                <CardDescription className="text-xs">
                  A 12 hónap bevételének és kiadásának összege. A bar a relatív arányt mutatja.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {monthlyStats.map((stat) => {
                    const hasData = stat.bevetel > 0 || stat.kiadas > 0
                    return (
                      <li key={stat.month} className={`space-y-1 ${!hasData ? 'opacity-40' : ''}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="w-20 font-medium">{MONTH_NAMES[stat.month - 1]}</span>
                          <div className="flex-1 space-y-0.5 px-3">
                            {stat.bevetel > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-full bg-emerald-100">
                                  <div
                                    className="h-2 rounded-full bg-emerald-500"
                                    style={{
                                      width: `${(stat.bevetel / maxMonthly) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="w-28 text-right font-mono text-emerald-800">
                                  +{stat.bevetel.toLocaleString('hu')} RON
                                </span>
                              </div>
                            )}
                            {stat.kiadas > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 rounded-full bg-rose-100">
                                  <div
                                    className="h-2 rounded-full bg-rose-500"
                                    style={{
                                      width: `${(stat.kiadas / maxMonthly) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="w-28 text-right font-mono text-rose-800">
                                  −{stat.kiadas.toLocaleString('hu')} RON
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="w-20 text-right font-mono text-xs text-muted-foreground">
                            {stat.bevetelDb + stat.kiadasDb === 0
                              ? '—'
                              : `${stat.bevetelDb}b / ${stat.kiadasDb}k`}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>

            {/* Top kategóriák */}
            <div className="grid gap-4 md:grid-cols-2">
              <TopCategories
                title="Top bevétel-kategóriák"
                total={totalIncome}
                items={topIncome}
                tone="emerald"
              />
              <TopCategories
                title="Top kiadás-kategóriák"
                total={totalExpense}
                items={topExpense}
                tone="rose"
              />
            </div>
          </>
        )}
      </main>
    </DesktopShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lokál → API-row konverterek (A-M7.8d)
// ─────────────────────────────────────────────────────────────────────────
//
// A lokális SQLite-row shape eltér a szerver-oldali zod-típustól (pl. boolean
// vs integer). Ezek a helperek az összesítő logika kompatibilitását biztosítják.

import type {
  LocalBefizetesRow,
  LocalKiadasRow,
} from '../lib/finance-sync'

function localToIncomeRow(r: LocalBefizetesRow): BefizetesListRow {
  return {
    id: r.id,
    xkey: r.xkey,
    datum: r.datum,
    fizetettev: r.fizetettev,
    osszeg: r.osszeg,
    osszeg_ron: r.osszeg_ron,
    arfolyam: r.arfolyam,
    forrasa: r.forrasa ?? '',
    iratszam: r.iratszam,
    irattipus: r.irattipus,
    nyugta: r.nyugta ?? '',
    is_potlas: r.is_potlas === 1,
    csalad: r.csalad === 1,
    id_csalad: r.id_csalad,
    id_szemely: r.id_szemely,
    id_befizetescel: r.id_befizetescel,
    bankszamla_id: r.bankszamla_id,
    megjegyzes: r.megjegyzes,
    deleted: r.deleted === 1,
    stornozott: r.stornozott === 1,
    stornozott_indok: r.stornozott_indok,
    stornozott_at: r.stornozott_at,
    befizetescel_nev: null, // a lokális cache nem tárolja a join-nevet
    szemely_nev: null,
    bankszamla_nev: null,
    userid: r.userid,
    congregation_id: r.congregation_id,
    revision: r.revision,
    updated_at: r.updated_at,
    created: r.created,
  }
}

function localToExpenseRow(r: LocalKiadasRow): KiadasListRow {
  return {
    id: r.id,
    xkey: r.xkey,
    datum: r.datum,
    osszeg: r.osszeg,
    osszeg_ron: r.osszeg_ron,
    arfolyam: r.arfolyam,
    iratszam: r.iratszam,
    irattipus: r.irattipus,
    nyugta: r.nyugta ?? '',
    is_potlas: r.is_potlas === 1,
    id_kiadascel: r.id_kiadascel,
    bankszamla_id: r.bankszamla_id,
    atvevoid: r.atvevoid,
    atvevo: r.atvevo,
    kedvezmenyezett_cui: r.kedvezmenyezett_cui,
    vonatkozo_idoszak: r.vonatkozo_idoszak,
    megjegyzes: r.megjegyzes,
    deleted: r.deleted === 1,
    stornozott: r.stornozott === 1,
    stornozott_indok: r.stornozott_indok,
    stornozott_at: r.stornozott_at,
    kiadascel_nev: null, // lokális cache nem tárolja
    atvevo_nev: null,
    bankszamla_nev: null,
    userid: r.userid,
    congregation_id: r.congregation_id,
    revision: r.revision,
    updated_at: r.updated_at,
    created: r.created,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// A-M7.9d — Pending sorok aggregátum-bannere
// ─────────────────────────────────────────────────────────────────────────

interface PendingSummary {
  incomeCount: number
  incomeAmount: number
  expenseCount: number
  expenseAmount: number
  incomeConflicts: number
  expenseConflicts: number
}

function PendingSummaryBanner({
  summary,
  onIncomeClick,
  onExpenseClick,
}: {
  summary: PendingSummary
  onIncomeClick: () => void
  onExpenseClick: () => void
}) {
  const totalCount = summary.incomeCount + summary.expenseCount
  const totalConflicts = summary.incomeConflicts + summary.expenseConflicts

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        totalConflicts > 0
          ? 'border-rose-300 bg-rose-50/60 text-rose-900'
          : 'border-amber-300 bg-amber-50/60 text-amber-900'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-base">🕓</span>
        <div className="flex-1">
          <p className="font-semibold">
            {totalConflicts > 0
              ? `${totalCount} offline-rögzített tétel — ebből ${totalConflicts} ütközés feloldásra vár`
              : `${totalCount} offline-rögzített tétel szinkronizálásra vár`}
          </p>
          <p className="mt-1 text-xs opacity-90">
            Az alábbi áttekintés a már szerverre került tételeket mutatja. Az alábbi
            offline-tételek a hálózat-csatlakozáskor automatikusan felmennek.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.incomeCount > 0 && (
              <button
                type="button"
                onClick={onIncomeClick}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white/70 px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50"
              >
                <ArrowUpRight className="size-3.5" />
                {summary.incomeCount} befizetés ·{' '}
                <span className="font-semibold">
                  +{summary.incomeAmount.toLocaleString('hu')} RON
                </span>
                {summary.incomeConflicts > 0 && (
                  <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-800">
                    {summary.incomeConflicts} ütközés
                  </span>
                )}
                <ChevronRight className="size-3" />
              </button>
            )}
            {summary.expenseCount > 0 && (
              <button
                type="button"
                onClick={onExpenseClick}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-white/70 px-3 py-1 text-xs font-medium text-rose-800 transition hover:bg-rose-50"
              >
                <ArrowDownRight className="size-3.5" />
                {summary.expenseCount} kiadás ·{' '}
                <span className="font-semibold">
                  −{summary.expenseAmount.toLocaleString('hu')} RON
                </span>
                {summary.expenseConflicts > 0 && (
                  <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-800">
                    {summary.expenseConflicts} ütközés
                  </span>
                )}
                <ChevronRight className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// TVA-plafon figyelmeztető komponens (A-M7.7)
// ─────────────────────────────────────────────────────────────────────────

function TvaPlafonWarning({ totalIncome, year }: { totalIncome: number; year: number }) {
  const percentage = (totalIncome / TVA_PLAFON_RON) * 100
  const remaining = TVA_PLAFON_RON - totalIncome

  // < 50% — nyugodt, nem mutatjuk
  if (percentage < 50) return null

  let tone: 'yellow' | 'orange' | 'rose' = 'yellow'
  let title = ''
  let message = ''

  if (percentage >= 100) {
    tone = 'rose'
    title = '🚨 TVA-plafon elérve!'
    message = `A ${year}. évi bevételed már meghaladta a 395.000 RON-os TVA-plafont (${totalIncome.toLocaleString('hu')} RON). Ha még nem regisztráltál TVA-fizetőként, sürgősen tedd meg — a könyvelőd / pénzügyi tanácsadód tud segíteni.`
  } else if (percentage >= 90) {
    tone = 'rose'
    title = '⚠ TVA-plafon közel!'
    message = `A ${year}. évi bevételed ${Math.round(percentage)}% (${totalIncome.toLocaleString('hu')} RON / 395.000 RON). Már csak ${remaining.toLocaleString('hu')} RON van a plafonig. Hamarosan TVA-regisztráció lehet szükséges.`
  } else if (percentage >= 75) {
    tone = 'orange'
    title = '⚠ TVA-plafon közeledik'
    message = `A ${year}. évi bevételed ${Math.round(percentage)}% (${totalIncome.toLocaleString('hu')} RON / 395.000 RON). Érdemes kezdeni gondolni a TVA-regisztrációra, ha ez a trend folytatódik.`
  } else {
    tone = 'yellow'
    title = 'TVA-plafon információ'
    message = `A ${year}. évi bevételed ${Math.round(percentage)}% (${totalIncome.toLocaleString('hu')} RON / 395.000 RON). Egyelőre nyugodt, de érdemes figyelemmel kísérni.`
  }

  const toneClasses: Record<typeof tone, { bg: string; border: string; text: string; icon: string; barBg: string; barFill: string }> = {
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-300',
      text: 'text-yellow-900',
      icon: 'text-yellow-700',
      barBg: 'bg-yellow-100',
      barFill: 'bg-yellow-500',
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-300',
      text: 'text-orange-900',
      icon: 'text-orange-700',
      barBg: 'bg-orange-100',
      barFill: 'bg-orange-500',
    },
    rose: {
      bg: 'bg-rose-50',
      border: 'border-rose-300',
      text: 'text-rose-900',
      icon: 'text-rose-700',
      barBg: 'bg-rose-100',
      barFill: 'bg-rose-600',
    },
  }
  const c = toneClasses[tone]
  const clampedPercentage = Math.min(percentage, 100)

  return (
    <div className={`rounded-lg border ${c.bg} ${c.border} p-4`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${c.icon}`} />
        <div className="flex-1 space-y-2">
          <p className={`font-semibold ${c.text}`}>{title}</p>
          <p className={`text-sm ${c.text}`}>{message}</p>
          <div className="space-y-1">
            <div className={`h-2 w-full rounded-full ${c.barBg}`}>
              <div
                className={`h-2 rounded-full ${c.barFill} transition-all`}
                style={{ width: `${clampedPercentage}%` }}
              />
            </div>
            <div className={`flex justify-between text-[11px] font-mono ${c.text} opacity-80`}>
              <span>0 RON</span>
              <span className="font-semibold">{Math.round(percentage)}%</span>
              <span>{TVA_PLAFON_RON.toLocaleString('hu')} RON (plafon)</span>
            </div>
          </div>
          <p className={`text-[11px] italic ${c.text} opacity-70`}>
            Ez a számítás az összes éves bevételt nézi (konzervatív becslés). A valós TVA-alap
            kisebb lehet, mert nem minden kategória számít bele (pl. tagdíj, adomány).
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Stat-kártya komponens
// ─────────────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  count,
  Icon,
  tone,
  subtitle,
}: {
  title: string
  value: number
  count: number | null
  Icon: typeof ArrowUpRight
  tone: 'emerald' | 'rose' | 'sky' | 'amber'
  subtitle?: string
}) {
  const toneClasses: Record<typeof tone, { bg: string; border: string; text: string; icon: string; glow: string }> = {
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-50/80 to-white',
      border: 'border-emerald-200/70',
      text: 'text-emerald-900',
      icon: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
      glow: 'shadow-[0_24px_48px_-30px_rgba(5,150,105,0.4)]',
    },
    rose: {
      bg: 'bg-gradient-to-br from-rose-50/80 to-white',
      border: 'border-rose-200/70',
      text: 'text-rose-900',
      icon: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white',
      glow: 'shadow-[0_24px_48px_-30px_rgba(225,29,72,0.4)]',
    },
    sky: {
      bg: 'bg-gradient-to-br from-sky-50/80 to-white',
      border: 'border-sky-200/70',
      text: 'text-sky-900',
      icon: 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white',
      glow: 'shadow-[0_24px_48px_-30px_rgba(2,132,199,0.4)]',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-50/80 to-white',
      border: 'border-amber-200/70',
      text: 'text-amber-900',
      icon: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
      glow: 'shadow-[0_24px_48px_-30px_rgba(217,119,6,0.4)]',
    },
  }
  const c = toneClasses[tone]

  return (
    <Card className={`${c.bg} ${c.border} ${c.glow} rounded-[1.25rem] border transition hover:scale-[1.01]`}>
      <CardContent className="space-y-2 py-5">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${c.text} opacity-80`}>
            {title}
          </p>
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${c.icon}`}>
            <Icon className="size-4" />
          </div>
        </div>
        <p className={`font-mono text-3xl font-bold leading-tight ${c.text}`}>
          {value.toLocaleString('hu')}{' '}
          <span className="text-base font-normal opacity-70">RON</span>
        </p>
        {count !== null && (
          <p className={`text-xs ${c.text} opacity-70`}>
            {count} darab bejegyzés
          </p>
        )}
        {subtitle && (
          <p className={`text-xs ${c.text} opacity-70 italic`}>
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Top kategóriák komponens
// ─────────────────────────────────────────────────────────────────────────

function TopCategories({
  title,
  total,
  items,
  tone,
}: {
  title: string
  total: number
  items: Array<[string, AggregateStat]>
  tone: 'emerald' | 'rose'
}) {
  const toneClasses: Record<typeof tone, { barBg: string; barFill: string; text: string }> = {
    emerald: {
      barBg: 'bg-emerald-100',
      barFill: 'bg-emerald-500',
      text: 'text-emerald-800',
    },
    rose: {
      barBg: 'bg-rose-100',
      barFill: 'bg-rose-500',
      text: 'text-rose-800',
    },
  }
  const c = toneClasses[tone]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">Nincs adat.</p>
        ) : (
          <ul className="space-y-2">
            {items.map(([name, stat]) => {
              const pct = total > 0 ? Math.round((stat.osszeg / total) * 100) : 0
              return (
                <li key={name} className="text-xs">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className={`font-medium ${c.text}`}>{name}</span>
                    <span className={`font-mono ${c.text}`}>
                      {stat.osszeg.toLocaleString('hu')} RON ({pct}%)
                    </span>
                  </div>
                  <div className={`h-1.5 w-full rounded-full ${c.barBg}`}>
                    <div
                      className={`h-1.5 rounded-full ${c.barFill}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{stat.count} db</p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────

function aggregateByCategory<T>(
  rows: T[],
  keyFn: (r: T) => string,
  valueFn: (r: T) => number,
): Array<[string, AggregateStat]> {
  const map = new Map<string, AggregateStat>()
  for (const r of rows) {
    const key = keyFn(r)
    const cur = map.get(key) || { osszeg: 0, count: 0 }
    cur.osszeg += valueFn(r)
    cur.count += 1
    map.set(key, cur)
  }
  return Array.from(map.entries()).sort((a, b) => b[1].osszeg - a[1].osszeg)
}
