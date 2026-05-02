'use client'

/**
 * 7. lépés — végleges előnézet az importálás előtt.
 *
 * Itt jelenik meg a wizard összefoglalója:
 *   - Importálandó tételek száma kategóriánként
 *   - Skip-okok listája (minden ok és sor-szám)
 *   - Monetar diagnosztika (kasszaegyenleg-ellenőrzés)
 *   - Az első 5-10 példa-tétel a végleges DB-formátumban
 *   - Nagy "Importálok" gomb (visszavonhatatlan művelet figyelmeztetéssel)
 *
 * 2026-05-03 (Fázis 6): első verzió.
 */

import { useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  Loader2,
  PlayCircle,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  FinanceImportItem,
} from '@/app/(dashboard)/penzugy/finance-import-types'
import type { MonetarDiagnostic } from '../helpers/monetar-diagnostic'

interface PreviewStepProps {
  /** A buildFinanceImportItems által épített tömb */
  items: FinanceImportItem[]
  /** Skip-okok (sorszám + ok) */
  skippedReasons: Array<{ rowIndex: number; reason: string }>
  /** Monetar diagnosztika eredménye, vagy null ha nincs Monetar fül */
  monetarDiagnostic: MonetarDiagnostic | null
  isMonetarLoading: boolean
  onMonetarRefresh: () => void
  /** Az első X példa-tétel a kalkulált értékekkel */
  isImporting: boolean
  onBack: () => void
  onConfirmImport: () => void
}

export function PreviewStep({
  items,
  skippedReasons,
  monetarDiagnostic,
  isMonetarLoading,
  onMonetarRefresh,
  isImporting,
  onBack,
  onConfirmImport,
}: PreviewStepProps) {
  useEffect(() => {
    if (!monetarDiagnostic && !isMonetarLoading) {
      onMonetarRefresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = useMemo(() => {
    let income = 0
    let incomeAmount = 0
    let expense = 0
    let expenseAmount = 0
    for (const item of items) {
      if (item.kind === 'income') {
        income++
        incomeAmount += item.osszeg
      } else if (item.kind === 'expense') {
        expense++
        expenseAmount += item.osszeg
      }
    }
    return { income, incomeAmount, expense, expenseAmount }
  }, [items])

  const skippedReasonGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of skippedReasons) {
      map.set(r.reason, (map.get(r.reason) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [skippedReasons])

  const previewItems = items.slice(0, 8)
  const canImport = items.length > 0 && !isImporting

  return (
    <div className="space-y-4">
      {/* Összesítés */}
      <div className="grid gap-3 sm:grid-cols-3">
        <PreviewKpi
          label="Bevételek"
          value={stats.income}
          subValue={`${stats.incomeAmount.toFixed(2)} RON`}
          tone="emerald"
          icon={<TrendingUp className="size-4" />}
        />
        <PreviewKpi
          label="Kiadások"
          value={stats.expense}
          subValue={`${stats.expenseAmount.toFixed(2)} RON`}
          tone="rose"
          icon={<TrendingDown className="size-4" />}
        />
        <PreviewKpi
          label="Kihagyott sorok"
          value={skippedReasons.length}
          subValue="ok-listával lentebb"
          tone="slate"
          icon={<FileWarning className="size-4" />}
        />
      </div>

      {/* Monetar diagnosztika */}
      <MonetarPanel
        diagnostic={monetarDiagnostic}
        isLoading={isMonetarLoading}
        onRefresh={onMonetarRefresh}
      />

      {/* Skip-okok bontása */}
      {skippedReasonGroups.length > 0 && (
        <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FileWarning className="size-4 shrink-0 text-amber-600" />
            Kihagyott sorok bontása
          </p>
          <ul className="mt-3 space-y-1.5">
            {skippedReasonGroups.map(([reason, count]) => (
              <li
                key={reason}
                className="flex items-center justify-between gap-3 rounded-xl bg-amber-50/40 px-3 py-2 text-xs"
              >
                <span className="text-amber-900">{reason}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Példa-tételek táblája */}
      {previewItems.length > 0 && (
        <div className="overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ring-emerald-100">
          <div className="border-b border-emerald-50 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
              Első {previewItems.length} importálandó tétel
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Vizuális ellenőrzés — így fogja a wizard be-INSERT-elni a DB-be.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-3 py-2 font-semibold">Típus</th>
                  <th className="px-3 py-2 font-semibold">Dátum</th>
                  <th className="px-3 py-2 font-semibold">Összeg</th>
                  <th className="px-3 py-2 font-semibold">Forrás / kedv.</th>
                  <th className="px-3 py-2 font-semibold">Cél ID</th>
                  <th className="px-3 py-2 font-semibold">Tag ID</th>
                  <th className="px-3 py-2 font-semibold">Iratszám</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.map((item, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <KindTag kind={item.kind} />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{item.datum}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {item.osszeg.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.forrasa || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">
                      {item.celId || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">
                      {item.szemelyId || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">
                      {item.iratszam || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visszavonhatatlan figyelmeztetés */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5 text-sm text-rose-900">
        <p className="flex items-start gap-2 font-semibold">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Visszavonhatatlan művelet
        </p>
        <p className="mt-1 leading-relaxed">
          Az "Importálok" gomb megnyomása után a fenti tételek azonnal bekerülnek
          a Kartotéka pénzügyi rendszerébe. A wizardon keresztül **nem** lehet
          visszavonni — kézzel kell minden tételt egyenként sztornózni a
          tranzakciók fülön. Ha bármi nem stimmel, lépj vissza, és javítsd a
          forrás-fájlt.
        </p>
      </div>

      {/* Vissza/Importálok */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={isImporting}
          className="rounded-full text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza
        </Button>
        <Button
          type="button"
          onClick={onConfirmImport}
          disabled={!canImport}
          className="rounded-full bg-rose-600 hover:bg-rose-700"
        >
          {isImporting ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              Importálok…
            </>
          ) : (
            <>
              <PlayCircle className="mr-1.5 size-4" />
              Importálom a {items.length} tételt
            </>
          )}
        </Button>
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Nincs importálható tétel
          </p>
          <p className="mt-1 leading-relaxed">
            A wizard egyik sort sem tudta végül felépíteni — ellenőrizd a
            kódfeloldási és befizető-azonosítási lépéseket, vagy lépj vissza,
            és javítsd a forrás-fájlt.
          </p>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

interface MonetarPanelProps {
  diagnostic: MonetarDiagnostic | null
  isLoading: boolean
  onRefresh: () => void
}

function MonetarPanel({ diagnostic, isLoading, onRefresh }: MonetarPanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-[1.5rem] bg-white/85 p-6 ring-1 ring-emerald-100">
        <Loader2 className="size-5 animate-spin text-emerald-600" />
        <p className="ml-3 text-sm font-medium text-slate-600">
          Monetar diagnosztika folyamatban…
        </p>
      </div>
    )
  }

  if (!diagnostic) {
    return (
      <div className="rounded-[1.5rem] bg-white/85 p-5 text-sm text-slate-600 ring-1 ring-emerald-100">
        <p>Monetar diagnosztika még nem fut.</p>
        <Button
          type="button"
          onClick={onRefresh}
          variant="outline"
          size="sm"
          className="mt-2 rounded-full"
        >
          Diagnosztika futtatása
        </Button>
      </div>
    )
  }

  const hasWarnings = diagnostic.warnings.length > 0
  const elteres = diagnostic.elteresKasszaval

  return (
    <div
      className={`rounded-[1.5rem] p-5 ring-1 ${
        hasWarnings
          ? 'bg-amber-50/60 ring-amber-200'
          : 'bg-emerald-50/60 ring-emerald-200'
      }`}
    >
      <p
        className={`flex items-start gap-2 text-sm font-semibold ${
          hasWarnings ? 'text-amber-800' : 'text-emerald-800'
        }`}
      >
        {hasWarnings ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        )}
        Monetar fül diagnosztika
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <DiagItem
          label="Kalkulált záró-egyenleg"
          value={`${diagnostic.kalkulaltZaroEgyenleg.toFixed(2)} RON`}
          tone={hasWarnings ? 'amber' : 'emerald'}
        />
        <DiagItem
          label="Monetar kasszaegyenleg"
          value={
            diagnostic.monetarKasszaEgyenleg !== null
              ? `${diagnostic.monetarKasszaEgyenleg.toFixed(2)} RON`
              : 'nincs adat'
          }
          tone={hasWarnings ? 'amber' : 'emerald'}
        />
        <DiagItem
          label="Eltérés"
          value={
            elteres !== null
              ? `${elteres > 0 ? '+' : ''}${elteres.toFixed(2)} RON`
              : 'n/a'
          }
          tone={
            elteres !== null && Math.abs(elteres) > 0.01 ? 'amber' : 'emerald'
          }
        />
      </div>

      {hasWarnings && (
        <ul className="mt-3 space-y-1.5 text-xs text-amber-900">
          {diagnostic.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span className="leading-relaxed">{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DiagItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'emerald' | 'amber'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-white/70 text-emerald-700 ring-emerald-100'
      : 'bg-white/70 text-amber-700 ring-amber-100'
  return (
    <div className={`rounded-xl px-3 py-2 ring-1 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-bold">{value}</p>
    </div>
  )
}

function KindTag({ kind }: { kind: FinanceImportItem['kind'] }) {
  if (kind === 'income') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <TrendingUp className="size-3" />
        Bev.
      </span>
    )
  }
  if (kind === 'expense') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
        <TrendingDown className="size-3" />
        Kia.
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
      Belső
    </span>
  )
}

interface PreviewKpiProps {
  label: string
  value: number
  subValue: string
  tone: 'emerald' | 'rose' | 'slate'
  icon: React.ReactNode
}

function PreviewKpi({ label, value, subValue, tone, icon }: PreviewKpiProps) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50/80 text-rose-700 ring-rose-100',
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
      <p className="mt-0.5 text-[11px] font-medium opacity-80">{subValue}</p>
    </div>
  )
}
