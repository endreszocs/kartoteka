'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpDown,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  Church,
  Crown,
  ExternalLink,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { AdminConfirmDialog } from './admin-confirm-dialog'
import { AdminEmptyState } from './_shared/admin-empty-state'
import { AdminSkeleton } from './_shared/admin-skeleton'
import { StatusBadge, type StatusIntent } from './_shared/status-badge'
import { Input } from '@/components/ui/input'
import {
  enterCongregation,
  getCongregationsByDiocese,
  type CongregationByDioceseRow,
  type DioceseGroup,
} from '@/app/(dashboard)/admin/actions'
// 2026-08-10 (K4 regisztráció-diagnosztika #5): egyházmegye-hozzárendelés /
// javítás — eddig SEMMILYEN felületen nem lehetett a gyülekezet egyházmegyéjét
// beállítani, így az „Egyházmegye nélkül" kosár csak megjelenítette a hibát.
import { assignCongregationDiocese, listAssignableDioceses } from '@/app/(dashboard)/admin/congregation-diocese-actions'
import type { AssignableDiocese } from '@/app/(dashboard)/admin/congregation-diocese-shared'

type SortMode = 'name' | 'members-desc' | 'users-desc'

// Szerepkör → intent + ikon: a StatusBadge-dzsel egységes megjelenés
// (2026-07-11 redesign — korábban kézi ring-pill-ek voltak, dark-pár nélkül).
const ROLE_META: Record<string, { intent: StatusIntent; icon: LucideIcon }> = {
  lelkesz: { intent: 'success', icon: Church },
  konyvelo: { intent: 'warning', icon: Calculator },
  esperes: { intent: 'info', icon: Crown },
  egyhazmegyei_admin: { intent: 'info', icon: Building2 },
  egyhazmegyei_szamvevo: { intent: 'warning', icon: Calculator },
  egyhazkeruleti_admin: { intent: 'info', icon: ShieldCheck },
  egyhazkeruleti_szamvevo: { intent: 'warning', icon: Calculator },
  admin: { intent: 'neutral', icon: ShieldCheck },
  custom: { intent: 'neutral', icon: Sparkles },
}

const ROLE_LABEL: Record<string, string> = {
  lelkesz: 'Lelkipásztor',
  konyvelo: 'Könyvelő',
  esperes: 'Esperes',
  egyhazmegyei_admin: 'Egyházmegyei admin',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevő',
  egyhazkeruleti_admin: 'Egyházkerületi admin',
  egyhazkeruleti_szamvevo: 'Egyházkerületi számvevő',
  admin: 'Rendszergazda',
  custom: 'Egyedi szerep',
}

export function CongregationsTab() {
  const [dioceses, setDioceses] = useState<DioceseGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [expandedDioceses, setExpandedDioceses] = useState<Set<string>>(new Set())
  // 2026-08-10: a hozzárendelhető egyházmegyék (a kerületi adminnál a saját
  // kerületére szűrve) — a gyülekezet-kártyák egyházmegye-választójához.
  const [dioceseOptions, setDioceseOptions] = useState<AssignableDiocese[]>([])
  const [canAssignOrphans, setCanAssignOrphans] = useState(false)

  // 2026-06-07: a hiba most NEM tűnik el csendben (toast után üres lista) —
  // külön hiba-állapot + "Újrapróbálom" gomb, hogy egyértelmű legyen, ha a
  // betöltés sikertelen volt (nem összekeverhető a tényleg üres listával).
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getCongregationsByDiocese()
      .then((res) => {
        if (res.error) {
          setError(res.error)
          return
        }
        if (res.data) {
          setDioceses(res.data)
          setExpandedDioceses(new Set(res.data.map((d) => d.id))) // alapból minden nyitva
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ismeretlen hiba.'))
      .finally(() => setLoading(false))

    // Az egyházmegye-választó opciói — a hiba itt nem blokkolja a listát, csak
    // a hozzárendelő vezérlő marad rejtve (és toastol).
    void listAssignableDioceses()
      .then((res) => {
        if (res.error) {
          toast.error(res.error)
          return
        }
        setDioceseOptions(res.rows || [])
        setCanAssignOrphans(res.accessLevel === 'master' || res.accessLevel === 'admin')
      })
      .catch(() => {
        /* best-effort — a lista attól még használható */
      })
  }, [])

  useEffect(() => {
    // requestAnimationFrame — a setState-t egy frame-re kitoljuk (a synchronous
    // setState-in-effect lint elkerülésére).
    const raf = requestAnimationFrame(() => load())
    return () => cancelAnimationFrame(raf)
  }, [load])

  // Szűrés keresési kifejezésre — gyülekezet név, egyházmegye név, user név/email
  const filteredDioceses = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return dioceses
    return dioceses
      .map((d) => {
        const dioceseMatch = d.name.toLowerCase().includes(q)
        const filteredCongs = d.congregations.filter((c) => {
          if (dioceseMatch) return true
          if (c.name.toLowerCase().includes(q)) return true
          return c.users.some(
            (u) =>
              (u.full_name || '').toLowerCase().includes(q) ||
              (u.email || '').toLowerCase().includes(q),
          )
        })
        return { ...d, congregations: filteredCongs }
      })
      .filter((d) => d.congregations.length > 0)
  }, [dioceses, search])

  // Rendezés minden egyházmegye gyülekezetein
  const sortedDioceses = useMemo(() => {
    const sortFn = (a: CongregationByDioceseRow, b: CongregationByDioceseRow) => {
      if (sortMode === 'members-desc') return b.memberCount - a.memberCount
      if (sortMode === 'users-desc') return b.users.length - a.users.length
      return a.name.localeCompare(b.name, 'hu')
    }
    return filteredDioceses.map((d) => ({
      ...d,
      congregations: [...d.congregations].sort(sortFn),
    }))
  }, [filteredDioceses, sortMode])

  // A stat-chipek MINDIG a teljes rendszert mutatják (nem a szűrt listát) —
  // a szűrt találat-szám külön sorban jelenik meg keresés közben.
  const totals = useMemo(() => {
    const congregations = dioceses.reduce((s, d) => s + d.congregations.length, 0)
    const users = dioceses.reduce(
      (s, d) => s + d.congregations.reduce((s2, c) => s2 + c.users.length, 0),
      0,
    )
    const members = dioceses.reduce(
      (s, d) => s + d.congregations.reduce((s2, c) => s2 + c.memberCount, 0),
      0,
    )
    return { dioceses: dioceses.length, congregations, users, members }
  }, [dioceses])

  function toggleDiocese(id: string) {
    setExpandedDioceses((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    // A TELJES listát nyitja (nem csak a szűrt találatokat) — így a keresés
    // törlése után is minden egyházmegye nyitva marad.
    setExpandedDioceses(new Set(dioceses.map((d) => d.id)))
  }

  function collapseAll() {
    setExpandedDioceses(new Set())
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <p className="font-semibold text-rose-800 dark:text-rose-200">
          A gyülekezetek betöltése nem sikerült
        </p>
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
        <Button onClick={load} variant="outline" className="mt-3 gap-2">
          <RefreshCw className="size-4" />
          Újrapróbálom
        </Button>
      </div>
    )
  }

  if (loading) {
    return <AdminSkeleton rows={6} className="py-4" />
  }

  const filteredCongCount = sortedDioceses.reduce((s, d) => s + d.congregations.length, 0)
  const filteredUserCount = sortedDioceses.reduce(
    (s, d) => s + d.congregations.reduce((s2, c) => s2 + c.users.length, 0),
    0,
  )
  const searching = search.trim().length > 0

  return (
    <div className="space-y-5">
      {/* Bevezető info */}
      <div className="rounded-2xl border border-border bg-muted/40 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" />
          <div>
            <h2 className="font-heading text-lg text-foreground">Gyülekezetek áttekintése</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              A gyülekezetek egyházmegyénként csoportosítva, a hozzájuk tartozó felhasználókkal és
              szerepkörökkel. A keresés a gyülekezet, egyházmegye és a felhasználók nevére is
              ráilleszt — rendezhetsz név, tagszám vagy felhasználó-szám szerint.
            </p>
          </div>
        </div>
      </div>

      {/* Stat-chipek — mindig a teljes rendszer számai */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatChip label="Egyházmegye" value={totals.dioceses} icon={Building2} />
        <StatChip label="Gyülekezet" value={totals.congregations} icon={Church} />
        <StatChip label="Felhasználó" value={totals.users} icon={UserCircle} />
      </div>

      {/* Művelet-sor: keresés + rendezés + expand/collapse */}
      <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3 sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Keresés gyülekezet, egyházmegye vagy felhasználó alapján…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SortButton
              active={sortMode === 'name'}
              onClick={() => setSortMode('name')}
              icon={ArrowDownAZ}
              label="Név"
            />
            <SortButton
              active={sortMode === 'members-desc'}
              onClick={() => setSortMode('members-desc')}
              icon={Users}
              label="Tagszám ↓"
            />
            <SortButton
              active={sortMode === 'users-desc'}
              onClick={() => setSortMode('users-desc')}
              icon={ArrowUpDown}
              label="Felhasználók ↓"
            />
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={expandAll} className="text-xs">
                Mind nyit
              </Button>
              <Button size="sm" variant="outline" onClick={collapseAll} className="text-xs">
                Mind zár
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {searching ? (
            <>
              Találat: {filteredCongCount} gyülekezet · {filteredUserCount} felhasználó
              {' — '}a fenti összesítő a teljes rendszert mutatja.
            </>
          ) : (
            <>
              {totals.congregations} gyülekezet · {totals.users} felhasználó ·{' '}
              {totals.members.toLocaleString('hu-HU')} tag
            </>
          )}
        </p>
      </div>

      {/* Egyházmegyék listája */}
      <div className="space-y-3">
        {sortedDioceses.length === 0 ? (
          searching ? (
            <AdminEmptyState
              icon={Search}
              title="Nincs találat a keresésre"
              hint="Próbálj rövidebb vagy másképp írt gyülekezet-, egyházmegye- vagy felhasználónevet."
              action={
                <Button variant="outline" onClick={() => setSearch('')}>
                  Keresés törlése
                </Button>
              }
            />
          ) : (
            <AdminEmptyState
              icon={Building2}
              title="Még nincs egyházmegye a rendszerben"
              hint="Az egyházmegyék és gyülekezetek a rendszer-inicializálás (seed) során kerülnek be."
            />
          )
        ) : (
          sortedDioceses.map((d) => (
            <DioceseGroupCard
              key={d.id || 'orphan'}
              diocese={d}
              expanded={expandedDioceses.has(d.id)}
              onToggle={() => toggleDiocese(d.id)}
              dioceseOptions={dioceseOptions}
              canAssignOrphans={canAssignOrphans}
              onAssigned={load}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Egyházmegye-csoport kártya (összes gyülekezetével)
// ─────────────────────────────────────────────────────────────────────────

function DioceseGroupCard({
  diocese,
  expanded,
  onToggle,
  dioceseOptions,
  canAssignOrphans,
  onAssigned,
}: {
  diocese: DioceseGroup
  expanded: boolean
  onToggle: () => void
  dioceseOptions: AssignableDiocese[]
  canAssignOrphans: boolean
  onAssigned: () => void
}) {
  const totalMembers = diocese.congregations.reduce((s, c) => s + c.memberCount, 0)
  const totalUsers = diocese.congregations.reduce((s, c) => s + c.users.length, 0)
  // Az „árva" csoport pszeudo-id-ja üres string (admin/actions.ts:348-356).
  const isOrphanGroup = diocese.id === ''

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Egyházmegye fejléc — kattintható accordion (teljes-sáv gomb) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 bg-muted/40 px-4 py-3 text-left transition hover:bg-muted/60 sm:px-5"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[var(--primary-foreground)] shadow-sm"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))' }}
        >
          <Building2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-base text-foreground sm:text-lg">
            {diocese.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {diocese.congregations.length} gyülekezet · {totalUsers} felhasználó · {totalMembers.toLocaleString('hu-HU')} tag
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="size-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Gyülekezetek lista */}
      {expanded && (
        <div className="space-y-2 border-t border-border bg-card p-3 sm:p-4">
          {/* 2026-08-10: az árva csoportnál elmagyarázzuk, MIÉRT baj ez, és
              hogy a javítás itt, soronként történik. */}
          {isOrphanGroup && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="leading-relaxed">
                Ezek a gyülekezetek egyetlen egyházmegyéhez sem tartoznak, ezért nem jelennek meg
                az egyházmegyei és egyházkerületi felületeken, az irat-beküldésük nem értesíti az
                esperesi hivatalt, és a regisztrációs választóban sem választhatók.{' '}
                <b>Rendeld hozzá a helyes egyházmegyét</b> az alábbi sorokban.
              </p>
            </div>
          )}
          {diocese.congregations.length === 0 ? (
            <p className="px-3 py-2 text-sm italic text-muted-foreground">
              Még nincs gyülekezet ehhez az egyházmegyéhez.
            </p>
          ) : (
            diocese.congregations.map((c, idx) => (
              <CongregationCard
                key={c.id}
                index={idx + 1}
                congregation={c}
                dioceseOptions={dioceseOptions}
                assignDisabledReason={
                  isOrphanGroup && !canAssignOrphans
                    ? 'Egyházmegye nélküli gyülekezetet csak a fő rendszergazda rendelhet egyházmegyéhez.'
                    : null
                }
                onAssigned={onAssigned}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Gyülekezet-kártya
// ─────────────────────────────────────────────────────────────────────────

function CongregationCard({
  index,
  congregation,
  dioceseOptions,
  assignDisabledReason,
  onAssigned,
}: {
  index: number
  congregation: CongregationByDioceseRow
  dioceseOptions: AssignableDiocese[]
  /** Ha nem null, az egyházmegye-hozzárendelés itt nem engedélyezett (indoklással). */
  assignDisabledReason: string | null
  onAssigned: () => void
}) {
  const [enterPending, setEnterPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // 2026-08-10: egyházmegye-hozzárendelés / javítás soronként.
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignValue, setAssignValue] = useState(congregation.diocese_id || '')
  const [assignPending, setAssignPending] = useState(false)
  const isOrphan = !congregation.diocese_id

  async function doAssign() {
    if (!assignValue) {
      toast.error('Válassz egyházmegyét.')
      return
    }
    setAssignPending(true)
    try {
      const res = await assignCongregationDiocese(congregation.id, assignValue)
      if (res.error) {
        toast.error(res.error)
        return
      }
      for (const w of res.warnings || []) toast.warning(w, { duration: 8000 })
      toast.success(res.success || 'Az egyházmegye beállítva.')
      setAssignOpen(false)
      onAssigned()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Az egyházmegye beállítása nem sikerült.')
    } finally {
      setAssignPending(false)
    }
  }

  // 2026-06-07: window.prompt helyett szép, indok-mezős dialógus.
  // 2026-07-11: catch-ág — hálózati/szerver-hiba esetén is kap visszajelzést
  // az admin (korábban unhandled rejection volt, nyitva maradó dialógussal).
  async function doEnter(reason?: string) {
    setEnterPending(true)
    try {
      const result = await enterCongregation(congregation.id, (reason || '').trim())
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      setConfirmOpen(false)
      if (result.mode === 'approved') {
        toast.success(result.message || 'A hozzáférés aktív. Átirányítalak a gyülekezeti nézetbe.')
        window.location.href = '/dashboard'
        return
      }
      toast.success(result.message || 'A hozzáférési kérelem elküldve.')
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Nem sikerült elküldeni a hozzáférési kérelmet.',
      )
    } finally {
      setEnterPending(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start gap-3">
        {/* Sorszám + ikon */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">
            {index}
          </span>
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-[var(--primary)]">
            <Church className="size-4" />
          </div>
        </div>

        {/* Név + statisztika */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{congregation.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              {congregation.memberCount.toLocaleString('hu-HU')} tag
            </span>
            <span className="inline-flex items-center gap-1">
              <UserCircle className="size-3" />
              {congregation.users.length} felhasználó
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* 2026-08-10: egyházmegye beállítása / javítása. Árva sornál
              hangsúlyos (default) gomb, egyébként diszkrét „Egyházmegye". */}
          {dioceseOptions.length > 0 && (
            <Button
              size="sm"
              variant={isOrphan ? 'default' : 'ghost'}
              onClick={() => setAssignOpen((v) => !v)}
              aria-expanded={assignOpen}
              disabled={Boolean(assignDisabledReason)}
              title={assignDisabledReason || undefined}
              className="min-h-9 gap-1.5"
            >
              <Landmark className="size-3.5" />
              {isOrphan ? 'Egyházmegye hozzárendelése' : 'Egyházmegye'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={enterPending}
            className="min-h-9 gap-1.5"
          >
            {enterPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ExternalLink className="size-3.5" />
            )}
            Hozzáférés kérése
          </Button>
        </div>
      </div>

      {/* Egyházmegye-választó (mobil-first: 375px-en is egy oszlopba rendeződik) */}
      {assignOpen && (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <label
            htmlFor={`diocese-${congregation.id}`}
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Egyházmegye
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              id={`diocese-${congregation.id}`}
              value={assignValue}
              onChange={(e) => setAssignValue(e.target.value)}
              disabled={assignPending}
              className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!assignValue && (
                <option value="" disabled>
                  — válassz egyházmegyét —
                </option>
              )}
              {dioceseOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.districtName ? ` (${d.districtName})` : ''}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => void doAssign()}
              disabled={assignPending || !assignValue || assignValue === congregation.diocese_id}
              className="min-h-10 shrink-0 gap-1.5"
            >
              {assignPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Mentés
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A mentés a gyülekezet egyházmegye-kötését állítja be, frissíti a legacy szöveges
            „egyházmegye/egyházkerület” mezőket (éves jelentés), és szinkronizálja a gyülekezet
            felhasználóinak egyházmegye/egyházkerület besorolását. A művelet naplózásra kerül.
          </p>
        </div>
      )}

      <AdminConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hozzáférés kérése a gyülekezethez"
        description={
          <>
            Hozzáférést kérsz a(z) <strong>{congregation.name}</strong> gyülekezet adataihoz.
            Ha a gyülekezetnek van lelkésze, ő értesítést kap, és a jóváhagyásáig a kérés
            függőben marad. Ha nincs lelkésze (vagy rendszergazdai God-mód aktív), a
            hozzáférés azonnal, 2 órára nyílik meg, és a rendszer a gyülekezeti nézetbe
            irányít át. Add meg az okot:
          </>
        }
        reasonLabel="A hozzáférés oka"
        reasonPlaceholder="Pl. rendszerellenőrzés és támogatás…"
        reasonDefault="Rendszerellenőrzés és támogatás"
        reasonRequired
        confirmLabel="Hozzáférés kérése"
        loading={enterPending}
        onConfirm={(reason) => doEnter(reason)}
      />

      {/* Felhasználók */}
      {congregation.users.length > 0 && (
        <div className="mt-3 space-y-1.5 pl-2 sm:pl-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Felhasználók ({congregation.users.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {congregation.users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// User-sor (egy gyülekezet user-listájában)
// ─────────────────────────────────────────────────────────────────────────

function UserRow({
  user,
}: {
  user: {
    id: string
    full_name: string | null
    email: string | null
    primaryRole: string | null
    profileRoles: Array<{ role: string; customLabel: string | null }>
    status: string | null
  }
}) {
  // A megjelenítendő szerepkörök: vagy a profile_roles (ha van), vagy a primary
  const displayRoles =
    user.profileRoles.length > 0
      ? user.profileRoles
      : user.primaryRole
        ? [{ role: user.primaryRole, customLabel: null }]
        : []

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
      <UserCircle className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
        <span className="truncate font-medium text-foreground">
          {user.full_name || user.email || 'Ismeretlen'}
        </span>
        {user.status === 'pending' && (
          <StatusBadge intent="warning" className="px-1.5 text-[10px]">
            Várakozó
          </StatusBadge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {displayRoles.length === 0 ? (
          <span className="text-[10px] italic text-muted-foreground">nincs szerepkör</span>
        ) : (
          displayRoles.map((r, idx) => {
            const meta = ROLE_META[r.role] || ROLE_META.custom
            const label = r.role === 'custom' ? r.customLabel || 'Egyedi' : ROLE_LABEL[r.role] || r.role
            return (
              <StatusBadge
                key={idx}
                intent={meta.intent}
                icon={meta.icon}
                className="px-2 text-[10px]"
              >
                {label}
              </StatusBadge>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Stat-chip — token-alapú, 375px-en is olvasható (mobilon oszlopba rendeződik)
// ─────────────────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-2.5 sm:p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--primary)]">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="font-heading text-xl tabular-nums text-foreground">{value}</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Rendezés-gomb (Button primitív, aria-pressed állapottal)
// ─────────────────────────────────────────────────────────────────────────

function SortButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      aria-pressed={active}
      onClick={onClick}
      className="gap-1.5 text-xs"
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  )
}
