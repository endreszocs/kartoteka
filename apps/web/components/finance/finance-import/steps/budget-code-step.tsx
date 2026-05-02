'use client'

/**
 * 5. lépés — költségvetési kódok feloldása.
 *
 * A `resolveBudgetCodes` server action végigfut a Kassza fülön egyedi
 * költségvetési kódjain (pl. "101.01", "201.13", "400.01", "102,14"), és
 * megpróbálja feloldani a `befizetescel` / `kiadascel` táblákból. A
 * felhasználó itt látja, mely kódok ismertek, mely ismeretlenek.
 *
 * **A v1-ben** új cél (befizetescel/kiadascel) **nem hozható létre** itt —
 * az ismeretlen kódokra a felhasználónak vagy:
 *   - vissza kell lépnie és a forrás-fájlban kijavítani a kódot
 *   - vagy az admin oldalon külön létrehoznia a hiányzó cél-rekordot
 *   - vagy elfogadnia, hogy ezek a sorok kihagyásra kerülnek
 *
 * 2026-05-03 (Fázis 5): első verzió.
 */

import { useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  HandCoins,
  Loader2,
  RefreshCw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { BudgetCodeResolution } from '@/app/(dashboard)/penzugy/finance-import-types'

interface BudgetCodeStepProps {
  resolutions: BudgetCodeResolution[] | null
  isResolving: boolean
  onResolve: () => void
  /** Felhasználó által skipre állított kódok (rawKod-ok set-je) */
  skippedCodes: Set<string>
  onSkipToggle: (rawKod: string) => void
  onBack: () => void
  onContinue: () => void
}

export function BudgetCodeStep({
  resolutions,
  isResolving,
  onResolve,
  skippedCodes,
  onSkipToggle,
  onBack,
  onContinue,
}: BudgetCodeStepProps) {
  useEffect(() => {
    if (!resolutions && !isResolving) {
      onResolve()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    if (!resolutions) {
      return { income: 0, expense: 0, internalTransfer: 0, unknown: 0, totalRows: 0 }
    }
    let income = 0
    let expense = 0
    let internalTransfer = 0
    let unknown = 0
    let totalRows = 0
    for (const r of resolutions) {
      totalRows += r.occurrenceCount
      if (r.kind === 'income') income += r.occurrenceCount
      else if (r.kind === 'expense') expense += r.occurrenceCount
      else if (r.kind === 'internal-transfer') internalTransfer += r.occurrenceCount
      else if (r.kind === 'unknown') unknown += r.occurrenceCount
    }
    return { income, expense, internalTransfer, unknown, totalRows }
  }, [resolutions])

  const unknownItems = useMemo(
    () => (resolutions || []).filter((r) => r.kind === 'unknown'),
    [resolutions],
  )

  const hasUnknown = unknownItems.length > 0
  const allUnknownSkipped = unknownItems.every((r) => skippedCodes.has(r.rawKod))

  if (!resolutions && isResolving) {
    return (
      <div className="flex items-center justify-center rounded-[1.5rem] bg-white/85 p-12 ring-1 ring-emerald-100">
        <Loader2 className="size-6 animate-spin text-emerald-600" />
        <p className="ml-3 text-sm font-medium text-slate-600">
          Kódok feloldása folyamatban…
        </p>
      </div>
    )
  }

  if (!resolutions) {
    return (
      <div className="rounded-[1.5rem] bg-white/85 p-6 ring-1 ring-emerald-100 text-sm text-slate-600">
        <p>Még nem fut a kódfeloldás. Kattints a gombra a folytatáshoz.</p>
        <Button
          type="button"
          onClick={onResolve}
          className="mt-3 rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          <RefreshCw className="mr-1.5 size-4" />
          Kódok feloldása
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Statisztika */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BudgetStatCard
          label="Bevételi kódok (sor)"
          value={stats.income}
          tone="emerald"
          icon={<ArrowDownToLine className="size-4" />}
        />
        <BudgetStatCard
          label="Kiadási kódok (sor)"
          value={stats.expense}
          tone="rose"
          icon={<ArrowUpFromLine className="size-4" />}
        />
        <BudgetStatCard
          label="Belső mozgás kódok"
          value={stats.internalTransfer}
          tone="violet"
          icon={<HandCoins className="size-4" />}
        />
        <BudgetStatCard
          label="Ismeretlen kódok (sor)"
          value={stats.unknown}
          tone={stats.unknown === 0 ? 'emerald' : 'amber'}
          icon={
            stats.unknown === 0 ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )
          }
        />
      </div>

      {/* Ismeretlen kódok figyelmeztetés */}
      {hasUnknown && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Ismeretlen költségvetési kódok ({unknownItems.length} db)
          </p>
          <p className="mt-2 leading-relaxed">
            Az alábbi kódok nincsenek a gyülekezet `befizetescel` /
            `kiadascel` listájában. A v1-ben új cél létrehozása nem
            engedélyezett a wizardban — két lehetőséged van:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
            <li>
              Lépj vissza, és javítsd a forrás-fájlt (a Kassza Excel
              "Költségvetési szám" oszlopában).
            </li>
            <li>
              Hagyd ki ezeket a sorokat (a kapcsolóval lent), és később
              kézzel rögzítsd őket az admin felületen.
            </li>
          </ol>
        </div>
      )}

      {/* Kódok táblázata */}
      <div className="overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ring-emerald-100">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-emerald-100 bg-emerald-50/60 text-left text-xs uppercase tracking-[0.16em] text-emerald-700/80">
                <th className="px-4 py-3 font-semibold">Eredeti kód</th>
                <th className="px-4 py-3 font-semibold">Normalizált</th>
                <th className="px-4 py-3 font-semibold">Kategória</th>
                <th className="px-4 py-3 font-semibold">Cél neve</th>
                <th className="px-4 py-3 text-right font-semibold">Sorok</th>
                <th className="px-4 py-3 font-semibold">Művelet</th>
              </tr>
            </thead>
            <tbody>
              {resolutions.map((r) => {
                const isUnknown = r.kind === 'unknown'
                const isSkipped = skippedCodes.has(r.rawKod)

                return (
                  <tr
                    key={r.rawKod}
                    className={`border-b border-slate-50 last:border-0 ${
                      isUnknown && !isSkipped ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {r.rawKod}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {r.normalizedKod || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <KindBadge kind={r.kind} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.szamadasicelNev || (
                        <span className="text-slate-400 italic">
                          {r.reason || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {r.occurrenceCount}
                    </td>
                    <td className="px-4 py-3">
                      {isUnknown ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={isSkipped}
                            onChange={() => onSkipToggle(r.rawKod)}
                            className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          />
                          Hagyja ki
                        </label>
                      ) : (
                        <span className="text-xs text-emerald-600">
                          ✓ Auto-feloldva
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
          disabled={hasUnknown && !allUnknownSkipped}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          Tovább a befizetők azonosításához
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>

      {hasUnknown && !allUnknownSkipped && (
        <p className="text-center text-xs text-amber-700">
          Minden ismeretlen kódot meg kell jelölni "Hagyja ki"-vel a
          folytatáshoz, vagy menj vissza és javítsd a forrás-fájlt.
        </p>
      )}
    </div>
  )
}

function KindBadge({ kind }: { kind: BudgetCodeResolution['kind'] }) {
  if (kind === 'income') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <ArrowDownToLine className="size-3" />
        Bevétel
      </span>
    )
  }
  if (kind === 'expense') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
        <ArrowUpFromLine className="size-3" />
        Kiadás
      </span>
    )
  }
  if (kind === 'internal-transfer') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
        <HandCoins className="size-3" />
        Belső mozgás
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <AlertTriangle className="size-3" />
      Ismeretlen
    </span>
  )
}

interface BudgetStatCardProps {
  label: string
  value: number
  tone: 'emerald' | 'rose' | 'violet' | 'amber' | 'slate'
  icon: React.ReactNode
}

function BudgetStatCard({ label, value, tone, icon }: BudgetStatCardProps) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50/80 text-rose-700 ring-rose-100',
    violet: 'bg-violet-50/80 text-violet-700 ring-violet-100',
    amber: 'bg-amber-50/80 text-amber-700 ring-amber-100',
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
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
