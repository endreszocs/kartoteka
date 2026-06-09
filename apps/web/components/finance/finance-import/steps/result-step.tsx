'use client'

/**
 * 9. lépés — eredmény (KpiCard + cég-lista + hibák).
 *
 * Az `executeFinanceImport` után a wizard ide érkezik. A felhasználó
 * látja az eredményt, a kihagyott sorokat (okokkal), és a cég/intézmény
 * listát az adott évre. Két CTA: "Új import indítása" + "Pénzügy oldalra".
 *
 * 2026-05-03 (Fázis 6): első verzió.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RotateCw,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  DonorResolution,
  FinanceImportResult,
} from '@/app/(dashboard)/penzugy/finance-import-types'

interface ResultStepProps {
  result: FinanceImportResult
  /** A 6. lépésben begyűjtött donor-feloldások — innen a cég-lista */
  donorResolutions: DonorResolution[] | null
  onNewImport: () => void
}

export function ResultStep({
  result,
  donorResolutions,
  onNewImport,
}: ResultStepProps) {
  const [errorsOpen, setErrorsOpen] = useState(true)
  const [companiesOpen, setCompaniesOpen] = useState(true)

  const isSuccess = !result.error && (result.inserted || 0) > 0
  const hasErrors = (result.errors?.length || 0) > 0

  const companies = useMemo(() => {
    if (!donorResolutions) return []
    return donorResolutions
      .filter((d) => d.status === 'company')
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
  }, [donorResolutions])

  return (
    <div className="space-y-4">
      {/* Banner */}
      {result.error ? (
        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50/80 p-6 text-rose-900">
          <p className="flex items-start gap-2 text-base font-semibold">
            <XCircle className="mt-0.5 size-5 shrink-0" />
            Az importálás megakadt
          </p>
          <p className="mt-2 leading-relaxed">{result.error}</p>
          <p className="mt-2 text-sm text-rose-700">
            A már beimportált tételek a Kartotéka-ban megmaradtak — ne nyomd
            meg újra az importot, mert duplikáció keletkezhet. Ellenőrizd a
            tranzakciók fülön, hogy mi került be, és onnan folytasd.
          </p>
        </div>
      ) : isSuccess ? (
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50/80 p-6 text-emerald-900">
          <p className="flex items-start gap-2 text-base font-semibold">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            Az importálás sikeresen lefutott
          </p>
          <p className="mt-2 leading-relaxed">
            {result.inserted} tételt mentettünk el a Kartotéka pénzügyi
            rendszerébe. {result.skipped ? `${result.skipped} sor kimaradt — ` : ''}
            {result.skippedDuplicates
              ? `${result.skippedDuplicates} már létező tételt kihagytunk (duplikáció-védelem) — `
              : ''}
            a részleteket lentebb találod.
          </p>
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-6 text-amber-900">
          <p className="flex items-start gap-2 text-base font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Az import lefutott, de 0 új tétel került be
          </p>
          <p className="mt-2 leading-relaxed">
            {result.skippedDuplicates
              ? `Mind a ${result.skippedDuplicates} tétel már létezett a könyvelésben — a duplikáció-védelem kihagyta őket. Ez normális, ha ugyanazt a fájlt újra importáltad.`
              : 'Lehet, hogy minden sort kihagyott a wizard. Nézd meg a hiba-részleteket lentebb, és ha szükséges, indíts új importot.'}
          </p>
        </div>
      )}

      {/* KPI-k */}
      <div className="grid gap-3 sm:grid-cols-4">
        <ResultKpi
          label="Sikeresen mentve"
          value={result.inserted || 0}
          tone="emerald"
          icon={<CheckCircle2 className="size-4" />}
        />
        <ResultKpi
          label="Duplikátum kihagyva"
          value={result.skippedDuplicates || 0}
          tone={result.skippedDuplicates ? 'violet' : 'slate'}
          icon={<RotateCw className="size-4" />}
        />
        <ResultKpi
          label="Kihagyva / hibás"
          value={result.skipped || 0}
          tone={result.skipped ? 'amber' : 'slate'}
          icon={<AlertTriangle className="size-4" />}
        />
        <ResultKpi
          label="Cég / intézmény"
          value={companies.length}
          tone="violet"
          icon={<Building2 className="size-4" />}
        />
      </div>

      {/* Hibák */}
      {hasErrors && (
        <CollapsibleBlock
          title="Hibás vagy kihagyott sorok"
          subtitle={`${result.errors!.length} hibás tétel — első 50 megjelenítve`}
          tone="amber"
          icon={<AlertTriangle className="size-4" />}
          isOpen={errorsOpen}
          onToggle={() => setErrorsOpen((v) => !v)}
        >
          <ul className="divide-y divide-slate-100">
            {result.errors!.slice(0, 50).map((e, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 px-5 py-2 text-xs text-slate-700"
              >
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                  {e.rowIndex + 1}
                </span>
                <span className="leading-relaxed">{e.reason}</span>
              </li>
            ))}
          </ul>
        </CollapsibleBlock>
      )}

      {/* Cég-lista */}
      {companies.length > 0 && (
        <CollapsibleBlock
          title="Cégek és intézmények az adott évben"
          subtitle="Az ide tartozó tételek `id_szemely = NULL` rekorddal mentek be — a befizetés/kiadás `forrasa` szöveges mezőben tartja a cég nevét"
          tone="violet"
          icon={<Building2 className="size-4" />}
          isOpen={companiesOpen}
          onToggle={() => setCompaniesOpen((v) => !v)}
        >
          <div className="divide-y divide-slate-100">
            {companies.map((c) => (
              <div
                key={c.raw}
                className="flex items-center justify-between gap-3 px-5 py-2"
              >
                <p className="text-sm font-medium text-slate-700">{c.raw}</p>
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                  {c.occurrenceCount} sor
                </span>
              </div>
            ))}
          </div>
        </CollapsibleBlock>
      )}

      {/* CTA-k */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-emerald-100">
        <Button
          type="button"
          onClick={onNewImport}
          variant="outline"
          className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        >
          <RotateCw className="mr-1.5 size-4" />
          Új import indítása
        </Button>
        <Link
          href="/penzugy"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
        >
          <ExternalLink className="size-3.5" />
          Tovább a pénzügyi oldalra
        </Link>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

interface CollapsibleBlockProps {
  title: string
  subtitle?: string
  tone: 'amber' | 'violet' | 'emerald'
  icon: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

function CollapsibleBlock({
  title,
  subtitle,
  tone,
  icon,
  isOpen,
  onToggle,
  children,
}: CollapsibleBlockProps) {
  const toneClass: Record<typeof tone, string> = {
    amber: 'bg-amber-50/80 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50/80 text-violet-700 ring-violet-100',
    emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
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
            <p className="text-sm font-semibold text-slate-800">{title}</p>
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

interface ResultKpiProps {
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'violet' | 'slate'
  icon: React.ReactNode
}

function ResultKpi({ label, value, tone, icon }: ResultKpiProps) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50/80 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50/80 text-violet-700 ring-violet-100',
    slate: 'bg-slate-50/80 text-slate-600 ring-slate-100',
  }
  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${toneClass[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  )
}
