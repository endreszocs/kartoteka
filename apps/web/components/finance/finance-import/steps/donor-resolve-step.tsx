'use client'

/**
 * 6. lépés — befizetők (donor-stringek) feloldása szemely-ID-re.
 *
 * A `resolveDonors` server action minden egyedi donor-stringet megpróbál
 * a `parseDonorString` segítségével szétbontani (név + cím + cég-flag), és
 * a tagnyilvántartásban quad-lookup-pal megtalálni.
 *
 * 4 státusz:
 *   - resolved   — egyértelmű találat → szemelyId
 *   - ambiguous  — több jelölt → felhasználó választ a candidates-ből
 *   - not-found  — 0 találat → marad text-only (id_szemely = NULL)
 *   - company    — cég/intézmény → automatikus text-only (id_szemely = NULL)
 *
 * 2026-05-03 (Fázis 5): első verzió.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { DonorResolution } from '@/app/(dashboard)/penzugy/finance-import-types'

interface DonorResolveStepProps {
  resolutions: DonorResolution[] | null
  isResolving: boolean
  onResolve: () => void
  /** Felhasználó által választott szemely-ID-k (donorRaw → szemelyId). */
  manualSelections: Record<string, string>
  onManualSelectionChange: (raw: string, szemelyId: string) => void
  onBack: () => void
  onContinue: () => void
}

export function DonorResolveStep({
  resolutions,
  isResolving,
  onResolve,
  manualSelections,
  onManualSelectionChange,
  onBack,
  onContinue,
}: DonorResolveStepProps) {
  const [expanded, setExpanded] = useState({
    resolved: false,
    ambiguous: true,
    notFound: true,
    company: true,
  })

  useEffect(() => {
    if (!resolutions && !isResolving) {
      onResolve()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = useMemo(() => {
    const map = {
      resolved: [] as DonorResolution[],
      ambiguous: [] as DonorResolution[],
      notFound: [] as DonorResolution[],
      company: [] as DonorResolution[],
      unparsed: [] as DonorResolution[],
    }
    if (!resolutions) return map
    for (const r of resolutions) {
      if (r.status === 'resolved') map.resolved.push(r)
      else if (r.status === 'ambiguous') map.ambiguous.push(r)
      else if (r.status === 'not-found') map.notFound.push(r)
      else if (r.status === 'company') map.company.push(r)
      else map.unparsed.push(r)
    }
    return map
  }, [resolutions])

  const stats = useMemo(() => {
    return {
      resolved: grouped.resolved.length,
      ambiguous: grouped.ambiguous.length,
      notFound: grouped.notFound.length + grouped.unparsed.length,
      company: grouped.company.length,
      total: resolutions?.length ?? 0,
    }
  }, [grouped, resolutions])

  // Ambiguous-ok közül hányhoz tartozik már manuális választás
  const ambiguousResolvedManually = grouped.ambiguous.filter(
    (r) => manualSelections[r.raw],
  ).length
  const allAmbiguousResolved = ambiguousResolvedManually === grouped.ambiguous.length

  if (!resolutions && isResolving) {
    return (
      <div className="flex items-center justify-center rounded-[1.5rem] bg-white/85 p-12 ring-1 ring-emerald-100">
        <Loader2 className="size-6 animate-spin text-emerald-600" />
        <p className="ml-3 text-sm font-medium text-slate-600">
          Befizetők azonosítása folyamatban…
        </p>
      </div>
    )
  }

  if (!resolutions) {
    return (
      <div className="rounded-[1.5rem] bg-white/85 p-6 ring-1 ring-emerald-100 text-sm text-slate-600">
        <p>Még nem fut a befizető-feloldás.</p>
        <Button
          type="button"
          onClick={onResolve}
          className="mt-3 rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          <RefreshCw className="mr-1.5 size-4" />
          Befizetők azonosítása
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Statisztika */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DonorStatCard
          label="Egyértelműen feloldva"
          value={stats.resolved}
          tone="emerald"
          icon={<UserCheck className="size-4" />}
        />
        <DonorStatCard
          label="Több jelölt"
          value={stats.ambiguous}
          tone={stats.ambiguous === 0 ? 'emerald' : 'amber'}
          icon={
            stats.ambiguous === 0 ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <HelpCircle className="size-4" />
            )
          }
        />
        <DonorStatCard
          label="Tagnyilv.-ban nincs"
          value={stats.notFound}
          tone="slate"
          icon={<UserX className="size-4" />}
        />
        <DonorStatCard
          label="Cég / intézmény"
          value={stats.company}
          tone="violet"
          icon={<Building2 className="size-4" />}
        />
      </div>

      {/* Ambiguous lista — top prioritás */}
      {grouped.ambiguous.length > 0 && (
        <CollapsibleSection
          title="Több jelölt — válassz közülük"
          tone="amber"
          icon={<HelpCircle className="size-4" />}
          count={grouped.ambiguous.length}
          isOpen={expanded.ambiguous}
          onToggle={() =>
            setExpanded((p) => ({ ...p, ambiguous: !p.ambiguous }))
          }
          subtitle={`${ambiguousResolvedManually} / ${grouped.ambiguous.length} kiválasztva`}
        >
          <div className="divide-y divide-slate-100">
            {grouped.ambiguous.map((r) => (
              <AmbiguousDonorRow
                key={r.raw}
                resolution={r}
                selected={manualSelections[r.raw] || null}
                onSelect={(id) => onManualSelectionChange(r.raw, id)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Not-found lista */}
      {(grouped.notFound.length > 0 || grouped.unparsed.length > 0) && (
        <CollapsibleSection
          title="A tagnyilvántartásban nem találtak"
          tone="slate"
          icon={<UserX className="size-4" />}
          count={grouped.notFound.length + grouped.unparsed.length}
          isOpen={expanded.notFound}
          onToggle={() => setExpanded((p) => ({ ...p, notFound: !p.notFound }))}
          subtitle="Ezekhez a sorokhoz nem rendelünk személyt — csak szöveges forrás-mezőként mennek be"
        >
          <div className="divide-y divide-slate-100">
            {[...grouped.notFound, ...grouped.unparsed].map((r) => (
              <SimpleDonorRow key={r.raw} resolution={r} variant="notFound" />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Cégek listája */}
      {grouped.company.length > 0 && (
        <CollapsibleSection
          title="Cégek és intézmények"
          tone="violet"
          icon={<Building2 className="size-4" />}
          count={grouped.company.length}
          isOpen={expanded.company}
          onToggle={() => setExpanded((p) => ({ ...p, company: !p.company }))}
          subtitle="Ezek az adott évben szállító/befizető szervezetek (id_szemely = NULL)"
        >
          <div className="divide-y divide-slate-100">
            {grouped.company.map((r) => (
              <SimpleDonorRow key={r.raw} resolution={r} variant="company" />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Resolved lista (alapértelmezetten összecsukva) */}
      {grouped.resolved.length > 0 && (
        <CollapsibleSection
          title="Egyértelműen feloldott személyek"
          tone="emerald"
          icon={<UserCheck className="size-4" />}
          count={grouped.resolved.length}
          isOpen={expanded.resolved}
          onToggle={() => setExpanded((p) => ({ ...p, resolved: !p.resolved }))}
          subtitle="Ezek automatikusan a tagnyilvántartás megfelelő rekordjához rendelve"
        >
          <div className="divide-y divide-slate-100">
            {grouped.resolved.map((r) => (
              <SimpleDonorRow key={r.raw} resolution={r} variant="resolved" />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Vissza/Tovább */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="rounded-full text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!allAmbiguousResolved}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          Tovább az előnézethez
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>

      {!allAmbiguousResolved && grouped.ambiguous.length > 0 && (
        <p className="text-center text-xs text-amber-700">
          Még {grouped.ambiguous.length - ambiguousResolvedManually} jelölt
          közül nem választottál — minden ambiguous esetnél válassz vagy lépj
          vissza.
        </p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Collapsible section
// ────────────────────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  tone: 'emerald' | 'amber' | 'slate' | 'violet'
  icon: React.ReactNode
  count: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  subtitle,
  tone,
  icon,
  count,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50/80 text-amber-700 ring-amber-100',
    slate: 'bg-slate-50/80 text-slate-600 ring-slate-100',
    violet: 'bg-violet-50/80 text-violet-700 ring-violet-100',
  }
  return (
    <div className="overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ring-emerald-100">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 transition hover:bg-emerald-50/30"
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClass[tone]}`}
          >
            {icon}
          </span>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">
              {title} <span className="text-slate-400">({count})</span>
            </p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="size-4 text-slate-400" />
        ) : (
          <ChevronRight className="size-4 text-slate-400" />
        )}
      </button>
      {isOpen && <div className="border-t border-emerald-50">{children}</div>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Ambiguous donor sor — candidate-választó dropdown
// ────────────────────────────────────────────────────────────────────────

interface AmbiguousDonorRowProps {
  resolution: DonorResolution
  selected: string | null
  onSelect: (szemelyId: string) => void
}

function AmbiguousDonorRow({
  resolution,
  selected,
  onSelect,
}: AmbiguousDonorRowProps) {
  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{resolution.raw}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {resolution.occurrenceCount} sor · {resolution.candidates?.length || 0}{' '}
            jelölt a tagnyilvántartásban
          </p>
        </div>
        <UserBadge resolved={!!selected} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {resolution.candidates?.map((c) => {
          const isPicked = selected === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`rounded-xl border p-3 text-left transition ${
                isPicked
                  ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_20px_-14px_rgba(5,150,105,0.5)]'
                  : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`text-sm font-semibold ${
                    isPicked ? 'text-emerald-700' : 'text-slate-800'
                  }`}
                >
                  {c.csaladnev || '?'} {c.k_nev || '?'}
                  {c.szcs_nev && (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      (sz: {c.szcs_nev})
                    </span>
                  )}
                </p>
                {isPicked && (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {c.sz_datum && `Született: ${c.sz_datum}`}
                {c.sz_datum && c.ferfi !== null && ' · '}
                {c.ferfi !== null && (c.ferfi ? 'Férfi' : 'Nő')}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Egyszerű donor-sor — resolved/notFound/company-hez
// ────────────────────────────────────────────────────────────────────────

interface SimpleDonorRowProps {
  resolution: DonorResolution
  variant: 'resolved' | 'notFound' | 'company'
}

function SimpleDonorRow({ resolution, variant }: SimpleDonorRowProps) {
  const icon =
    variant === 'resolved' ? (
      <UserCheck className="size-4 text-emerald-600" />
    ) : variant === 'company' ? (
      <Building2 className="size-4 text-violet-600" />
    ) : (
      <UserX className="size-4 text-slate-400" />
    )

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-700">
            {resolution.raw}
          </p>
          <p className="text-[11px] text-slate-500">
            {resolution.occurrenceCount} sor
            {variant === 'resolved' && ' · auto-feloldva'}
            {variant === 'company' && ' · cég/intézmény'}
            {variant === 'notFound' && ' · marad szöveges forrás'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// User-badge (resolved jelző)
// ────────────────────────────────────────────────────────────────────────

function UserBadge({ resolved }: { resolved: boolean }) {
  if (resolved) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 className="size-3" />
        Kiválasztva
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <Search className="size-3" />
      Válassz
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Stat card
// ────────────────────────────────────────────────────────────────────────

interface DonorStatCardProps {
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'slate' | 'violet'
  icon: React.ReactNode
}

function DonorStatCard({ label, value, tone, icon }: DonorStatCardProps) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50/80 text-amber-700 ring-amber-100',
    slate: 'bg-slate-50/80 text-slate-600 ring-slate-100',
    violet: 'bg-violet-50/80 text-violet-700 ring-violet-100',
  }
  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${toneClass[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

