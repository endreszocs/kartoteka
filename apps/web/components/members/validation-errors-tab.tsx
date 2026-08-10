'use client'

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

import {
  getValidationErrors,
  getValidationStats,
  ignoreError,
  reopenError,
  resolveError,
  runValidation,
  type MveFilters,
  type MveRow,
  type MveStats,
} from '@/app/(dashboard)/tagnyilvantartas/validation-actions'

// ── KPI kártya ──────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  tone: 'red' | 'amber' | 'sky' | 'violet' | 'emerald' | 'slate'
}) {
  const toneClasses: Record<typeof tone, string> = {
    red: 'from-rose-500/15 to-rose-500/5 text-rose-700 ring-rose-200/60',
    amber: 'from-amber-500/15 to-amber-500/5 text-amber-700 ring-amber-200/60',
    sky: 'from-sky-500/15 to-sky-500/5 text-sky-700 ring-sky-200/60',
    violet: 'from-violet-500/15 to-violet-500/5 text-violet-700 ring-violet-200/60',
    emerald: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700 ring-emerald-200/60',
    slate: 'from-slate-500/10 to-slate-500/5 text-slate-700 ring-slate-200/60',
  }
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ring-1 p-4 sm:p-5 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
          <p className="mt-1.5 text-3xl font-heading font-semibold tabular-nums">{value}</p>
        </div>
        <Icon className="h-6 w-6 opacity-70" />
      </div>
    </div>
  )
}

// ── Severity badge ──────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: MveRow['severity'] }) {
  const cfg = {
    critical: { label: 'Kritikus', className: 'bg-rose-100 text-rose-700 hover:bg-rose-100' },
    medium: { label: 'Közepes', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
    warning: { label: 'Figyelmeztetés', className: 'bg-sky-100 text-sky-700 hover:bg-sky-100' },
  }[severity]
  return <Badge className={cfg.className}>{cfg.label}</Badge>
}

function StatusBadge({ status }: { status: MveRow['status'] }) {
  const cfg = {
    open: { label: 'Nyitott', className: 'bg-rose-50 text-rose-700' },
    resolved: { label: 'Javítva', className: 'bg-emerald-50 text-emerald-700' },
    ignored: { label: 'Figyelmen kívül', className: 'bg-slate-100 text-slate-600' },
  }[status]
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
}

function ErrorTypeIcon({ type }: { type: MveRow['error_type'] }) {
  const Icon = {
    missing: AlertCircle,
    format: AlertTriangle,
    logic: ShieldAlert,
    duplicate: Copy,
  }[type]
  return <Icon className="h-4 w-4 text-muted-foreground" />
}

// ── Ignore dialog ───────────────────────────────────────────────────────────

function IgnoreDialog({
  open,
  onOpenChange,
  errorRow,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  errorRow: MveRow | null
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  // 2026-08-11: az indoklás ürítése korábban `useEffect`-ben történt a `open`
  // váltásakor (effect-ben hívott setState → kaszkádoló újrarender). Most
  // ESEMÉNYKEZELŐBEN ürítünk, BEZÁRÁSKOR — a kezdőérték amúgy is üres string,
  // így a legközelebbi nyitáskor ugyanaz a látvány, egy renderrel kevesebbért.
  function handleOpenChange(next: boolean) {
    if (!next) setReason('')
    onOpenChange(next)
  }

  async function handle() {
    if (!errorRow) return
    if (!reason.trim()) {
      toast.error('Az indoklás kötelező.')
      return
    }
    setBusy(true)
    const res = await ignoreError(errorRow.id, reason.trim())
    setBusy(false)
    if (res.ok) {
      toast.success('A hiba figyelmen kívül lett helyezve.')
      onSuccess()
      handleOpenChange(false)
    } else {
      toast.error(res.error || 'Hiba történt.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Hiba figyelmen kívül hagyása</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>{errorRow?.member_name}</strong> — {errorRow?.error_message}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ignore-reason">Indoklás <span className="text-rose-500">*</span></Label>
            <textarea
              id="ignore-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              placeholder="Pl. Külföldön tartózkodik, nincs telefonja…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Mégse
          </Button>
          <Button onClick={handle} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <EyeOff className="mr-2 h-4 w-4" />}
            Figyelmen kívül
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Fő komponens ────────────────────────────────────────────────────────────

export function ValidationErrorsTab() {
  const [stats, setStats] = useState<MveStats | null>(null)
  const [rows, setRows] = useState<MveRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<MveFilters>({ status: 'open', severity: 'all', errorType: 'all' })
  const [search, setSearch] = useState('')
  const [running, startRunning] = useTransition()
  const [ignoreTarget, setIgnoreTarget] = useState<MveRow | null>(null)
  // 2026-06-30 (perf): csak az első `visibleCount` betöltött sort rendereljük a
  // DOM-ba (a betöltött `rows` és a `total` változatlan) — nagy, sok ezer hibás
  // gyülekezetnél a teljes lista egyszerre kirajzolása blokkolná a böngészőt.
  const [visibleCount, setVisibleCount] = useState(100)

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const effectiveFilters = useMemo<MveFilters>(
    () => ({ ...filters, search: debouncedSearch || undefined }),
    [filters, debouncedSearch],
  )

  async function load() {
    setLoading(true)
    const [s, r] = await Promise.all([
      getValidationStats(),
      getValidationErrors(effectiveFilters),
    ])
    setStats(s)
    setRows(r.rows)
    setTotal(r.total)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFilters])

  function handleRun() {
    startRunning(async () => {
      const res = await runValidation()
      if (res.ok) {
        toast.success(
          `Ellenőrzés kész. ${res.total_errors} hiba talált, ${res.inserted} új, ${res.resolved} javítva.`,
        )
        load()
      } else {
        toast.error(res.error || 'Hiba történt.')
      }
    })
  }

  async function handleResolve(errorId: number) {
    const res = await resolveError(errorId)
    if (res.ok) {
      toast.success('Javítottnak jelölve.')
      load()
    } else {
      toast.error(res.error || 'Hiba történt.')
    }
  }

  async function handleReopen(errorId: number) {
    const res = await reopenError(errorId)
    if (res.ok) {
      toast.success('Hiba újra megnyitva.')
      load()
    } else {
      toast.error(res.error || 'Hiba történt.')
    }
  }

  return (
    <div className="space-y-5">
      {/* KPI kártyák */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          icon={ShieldAlert}
          label="Nyitott hibák"
          value={stats?.total_open ?? '—'}
          tone="slate"
        />
        <KpiCard
          icon={AlertCircle}
          label="Kritikus"
          value={stats?.critical ?? '—'}
          tone="red"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Közepes"
          value={stats?.medium ?? '—'}
          tone="amber"
        />
        <KpiCard
          icon={Info}
          label="Figyelmeztetés"
          value={stats?.warning ?? '—'}
          tone="sky"
        />
        <KpiCard
          icon={Copy}
          label="Duplikációk"
          value={stats?.duplicates ?? '—'}
          tone="violet"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Mai javítások"
          value={stats?.resolved_today ?? '—'}
          tone="emerald"
        />
      </div>

      {/* Művelet-sor */}
      <div className="card-raised p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={handleRun} disabled={running} size="sm">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Hibák újraellenőrzése
            </Button>
            {stats?.last_run_at && (
              <span className="text-xs text-muted-foreground">
                Utolsó futás: {new Date(stats.last_run_at).toLocaleString('hu-HU')}
              </span>
            )}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Keresés a hibaüzenetekben…"
              className="pl-9"
            />
          </div>
        </div>

        {/* Szűrők */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(['all', 'open', 'resolved', 'ignored'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilters((f) => ({ ...f, status: s }))}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                (filters.status || 'open') === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'Mind' : s === 'open' ? 'Nyitott' : s === 'resolved' ? 'Javítva' : 'Figyelmen kívül'}
            </button>
          ))}
          <span className="mx-2 self-center text-slate-300">·</span>
          {(['all', 'critical', 'medium', 'warning'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilters((f) => ({ ...f, severity: sev }))}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                (filters.severity || 'all') === sev
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sev === 'all' ? 'Minden súlyosság' : sev === 'critical' ? 'Kritikus' : sev === 'medium' ? 'Közepes' : 'Figyelmeztetés'}
            </button>
          ))}
          <span className="mx-2 self-center text-slate-300">·</span>
          {(['all', 'missing', 'format', 'logic', 'duplicate'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilters((f) => ({ ...f, errorType: t }))}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                (filters.errorType || 'all') === t
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t === 'all' ? 'Minden típus' : t === 'missing' ? 'Hiányzó' : t === 'format' ? 'Formátum' : t === 'logic' ? 'Logikai' : 'Duplikáció'}
            </button>
          ))}
        </div>
      </div>

      {/* Táblázat */}
      <div className="card-raised overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400" />
            <p className="text-sm text-muted-foreground">
              {filters.status === 'open'
                ? 'Nincs nyitott hiba — szép munka!'
                : 'Nincs találat a kiválasztott szűrőkre.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Tag</th>
                  <th className="px-4 py-3 text-left font-semibold">Hiba</th>
                  <th className="px-4 py-3 text-left font-semibold">Súlyosság</th>
                  <th className="px-4 py-3 text-left font-semibold">Állapot</th>
                  <th className="px-4 py-3 text-left font-semibold">Észlelve</th>
                  <th className="px-4 py-3 text-right font-semibold">Műveletek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, visibleCount).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.member_name}</div>
                      {r.duplicate_member_name && (
                        <div className="text-xs text-muted-foreground">↔ {r.duplicate_member_name} (#{r.duplicate_of_member_id})</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <ErrorTypeIcon type={r.error_type} />
                        <div>
                          <div className="text-slate-700">{r.error_message}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">Mező: {r.field_name}</div>
                          {r.status === 'ignored' && r.ignored_reason && (
                            <div className="mt-1 text-xs italic text-muted-foreground">
                              Indok: {r.ignored_reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><SeverityBadge severity={r.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(r.detected_at).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {r.status === 'open' && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => handleResolve(r.id)}>
                              <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" />
                              Javítva
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIgnoreTarget(r)}>
                              <EyeOff className="mr-1 h-4 w-4 text-slate-500" />
                              Figyelmen kívül
                            </Button>
                          </>
                        )}
                        {(r.status === 'resolved' || r.status === 'ignored') && (
                          <Button size="sm" variant="ghost" onClick={() => handleReopen(r.id)}>
                            <Eye className="mr-1 h-4 w-4 text-sky-600" />
                            Újra megnyit
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rows.length > visibleCount && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{visibleCount} / {rows.length} megjelenítve</span>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setVisibleCount((c) => c + 100)}>
              További 100 megjelenítése
            </Button>
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            {rows.length} / {total} sor
          </div>
        )}
      </div>

      {/* Üres állapot — soha nem futott még */}
      {!loading && stats?.total_open === 0 && stats.last_run_at === null && (
        <div className="card-raised p-6 text-center">
          <Info className="mx-auto mb-2 h-8 w-8 text-sky-500" />
          <p className="text-sm text-slate-700">
            Még nem történt ellenőrzés. Indítsa el a "Hibák újraellenőrzése" gombbal!
          </p>
        </div>
      )}

      {/* Ignore dialog */}
      <IgnoreDialog
        open={!!ignoreTarget}
        onOpenChange={(o) => !o && setIgnoreTarget(null)}
        errorRow={ignoreTarget}
        onSuccess={() => {
          setIgnoreTarget(null)
          load()
        }}
      />

      {!loading && rows.length > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          <XCircle className="inline-block h-3 w-3 mr-1" />
          A "Figyelmen kívül" hagyott hibák a következő ellenőrzéskor sem kerülnek vissza, csak a "Mind"
          szűrőben látszanak.
        </div>
      )}
    </div>
  )
}
