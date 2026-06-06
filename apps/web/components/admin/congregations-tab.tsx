'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowUpDown,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  Church,
  Crown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  enterCongregation,
  getCongregationsByDiocese,
  type CongregationByDioceseRow,
  type DioceseGroup,
} from '@/app/(dashboard)/admin/actions'

type SortMode = 'name' | 'members-desc' | 'users-desc'

const ROLE_THEME: Record<
  string,
  { bg: string; text: string; ring: string; icon: React.ComponentType<{ className?: string }> }
> = {
  lelkesz: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', icon: Church },
  konyvelo: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', icon: Calculator },
  esperes: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200', icon: Crown },
  egyhazmegyei_admin: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200', icon: Building2 },
  egyhazmegyei_szamvevo: { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-200', icon: Calculator },
  egyhazkeruleti_admin: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200', icon: ShieldCheck },
  admin: { bg: 'bg-slate-100', text: 'text-slate-800', ring: 'ring-slate-300', icon: ShieldCheck },
  custom: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', ring: 'ring-fuchsia-200', icon: Sparkles },
}

const ROLE_LABEL: Record<string, string> = {
  lelkesz: 'Lelkipásztor',
  konyvelo: 'Könyvelő',
  esperes: 'Esperes',
  egyhazmegyei_admin: 'Egyházmegyei admin',
  egyhazmegyei_szamvevo: 'Egyházmegyei számvevő',
  egyhazkeruleti_admin: 'Egyházkerületi admin',
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

  // Sortolás minden egyházmegye gyülekezetein
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

  function toggleDiocese(id: string) {
    setExpandedDioceses((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    setExpandedDioceses(new Set(sortedDioceses.map((d) => d.id)))
  }

  function collapseAll() {
    setExpandedDioceses(new Set())
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
        <p className="font-semibold text-rose-800">A gyülekezetek betöltése nem sikerült</p>
        <p className="mt-1 text-sm text-rose-700">{error}</p>
        <Button onClick={load} variant="outline" className="mt-3 gap-2">
          <RefreshCw className="size-4" />
          Újrapróbálom
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>Gyülekezetek betöltése…</span>
      </div>
    )
  }

  const totalCongregations = sortedDioceses.reduce((s, d) => s + d.congregations.length, 0)
  const totalUsers = sortedDioceses.reduce(
    (s, d) => s + d.congregations.reduce((s2, c) => s2 + c.users.length, 0),
    0,
  )
  const totalMembers = sortedDioceses.reduce(
    (s, d) => s + d.congregations.reduce((s2, c) => s2 + c.memberCount, 0),
    0,
  )

  return (
    <div className="space-y-5">
      {/* Bevezető info */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 text-emerald-600 mt-0.5" />
          <div>
            <h2 className="font-heading text-lg text-slate-800">Gyülekezetek áttekintése</h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              A gyülekezetek egyházmegyénként csoportosítva, a hozzájuk tartozó felhasználókkal és
              szerepkörökkel. A keresés a gyülekezet, egyházmegye és a felhasználók nevére is
              ráilleszt — sortolhatsz név, tagszám vagy felhasználó-szám szerint.
            </p>
          </div>
        </div>
      </div>

      {/* Stat-csíp */}
      <div className="grid grid-cols-3 gap-3">
        <StatChip label="Egyházmegye" value={sortedDioceses.length} icon={Building2} tone="indigo" />
        <StatChip label="Gyülekezet" value={totalCongregations} icon={Church} tone="emerald" />
        <StatChip label="Felhasználó" value={totalUsers} icon={UserCircle} tone="violet" />
      </div>

      {/* Művelet-sor: keresés + sort + expand/collapse */}
      <div className="card-raised p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Keresés gyülekezet, egyházmegye vagy felhasználó alapján…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
          {totalCongregations} gyülekezet · {totalUsers} felhasználó · {totalMembers.toLocaleString('hu-HU')} tag
        </p>
      </div>

      {/* Egyházmegyék listája */}
      <div className="space-y-3">
        {sortedDioceses.length === 0 ? (
          <div className="card-raised p-8 text-center text-sm text-slate-500 italic">
            {search ? 'Nincs találat a keresésre.' : 'Még nincs egyházmegye a rendszerben.'}
          </div>
        ) : (
          sortedDioceses.map((d) => (
            <DioceseGroupCard
              key={d.id || 'orphan'}
              diocese={d}
              expanded={expandedDioceses.has(d.id)}
              onToggle={() => toggleDiocese(d.id)}
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
}: {
  diocese: DioceseGroup
  expanded: boolean
  onToggle: () => void
}) {
  const totalMembers = diocese.congregations.reduce((s, c) => s + c.memberCount, 0)
  const totalUsers = diocese.congregations.reduce((s, c) => s + c.users.length, 0)

  return (
    <div className="card-raised overflow-hidden">
      {/* Egyházmegye fejléc — kattintható accordion */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 bg-gradient-to-r from-indigo-50/60 via-white to-white hover:from-indigo-100/70 transition text-left"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
          <Building2 className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-base sm:text-lg text-slate-800 truncate">
            {diocese.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {diocese.congregations.length} gyülekezet · {totalUsers} felhasználó · {totalMembers.toLocaleString('hu-HU')} tag
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="size-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="size-5 shrink-0 text-slate-400" />
        )}
      </button>

      {/* Gyülekezetek lista */}
      {expanded && (
        <div className="border-t border-slate-100 p-3 sm:p-4 space-y-2 bg-white">
          {diocese.congregations.length === 0 ? (
            <p className="text-sm text-slate-500 italic px-3 py-2">
              Még nincs gyülekezet ehhez az egyházmegyéhez.
            </p>
          ) : (
            diocese.congregations.map((c, idx) => (
              <CongregationCard key={c.id} index={idx + 1} congregation={c} />
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
}: {
  index: number
  congregation: CongregationByDioceseRow
}) {
  const [enterPending, setEnterPending] = useState(false)

  async function handleEnter() {
    const reason = window.prompt(
      `Miért szeretnél hozzáférést kérni a(z) "${congregation.name}" gyülekezethez?`,
      'Rendszerellenőrzés és támogatás',
    )
    if (reason === null) return
    setEnterPending(true)
    try {
      const result = await enterCongregation(congregation.id, reason)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      if (result.mode === 'approved') {
        toast.success(result.message || 'A hozzáférés aktív. Átirányítalak a gyülekezeti nézetbe.')
        window.location.href = '/dashboard'
        return
      }
      toast.success(result.message || 'A hozzáférési kérelem elküldve.')
    } finally {
      setEnterPending(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 hover:border-emerald-300 hover:shadow-sm transition">
      <div className="flex items-start gap-3 flex-wrap">
        {/* Sorszám + ikon */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 tabular-nums">
            {index}
          </span>
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm">
            <Church className="size-4" />
          </div>
        </div>

        {/* Név + statisztika */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{congregation.name}</p>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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

        <Button
          size="sm"
          variant="outline"
          onClick={handleEnter}
          disabled={enterPending}
          className="gap-1.5"
        >
          {enterPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ExternalLink className="size-3.5" />
          )}
          Hozzáférés
        </Button>
      </div>

      {/* Felhasználók */}
      {congregation.users.length > 0 && (
        <div className="mt-3 pl-2 sm:pl-12 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
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
    <div className="flex items-center gap-2 rounded-lg bg-slate-50/60 px-2.5 py-1.5 text-sm">
      <UserCircle className="size-4 shrink-0 text-slate-400" />
      <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
        <span className="font-medium text-slate-800 truncate">
          {user.full_name || user.email || 'Ismeretlen'}
        </span>
        {user.status === 'pending' && (
          <span className="text-[9px] font-bold uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5">
            Várakozó
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {displayRoles.length === 0 ? (
          <span className="text-[10px] text-slate-400 italic">nincs szerepkör</span>
        ) : (
          displayRoles.map((r, idx) => {
            const theme = ROLE_THEME[r.role] || ROLE_THEME.custom
            const label = r.role === 'custom' ? r.customLabel || 'Egyedi' : ROLE_LABEL[r.role] || r.role
            const Icon = theme.icon
            return (
              <span
                key={idx}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${theme.bg} ${theme.text} ${theme.ring}`}
              >
                <Icon className="size-2.5" />
                {label}
              </span>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Stat-chip
// ─────────────────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: 'indigo' | 'emerald' | 'violet'
}) {
  const tones = {
    indigo: 'from-indigo-50 to-indigo-100/40 ring-indigo-200/60',
    emerald: 'from-emerald-50 to-emerald-100/40 ring-emerald-200/60',
    violet: 'from-violet-50 to-violet-100/40 ring-violet-200/60',
  }[tone]
  const iconBg = {
    indigo: 'bg-indigo-500/10 text-indigo-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    violet: 'bg-violet-500/10 text-violet-600',
  }[tone]
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${tones} p-3 sm:p-4 ring-1`}>
      <div className="flex items-center gap-2">
        <div className={`flex size-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className="font-heading text-xl text-slate-800 tabular-nums">{value}</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sort button
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
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}
