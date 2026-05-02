'use client'

/**
 * 4. lépés — sor-szétválasztás (income / expense / internal-transfer / skip).
 *
 * A `analyzeKasszaRows` server action végigfut a Kassza fülön, és minden sort
 * besorol egyik kategóriába. A felhasználó itt látja az aggregált statisztikát
 * + minden kategóriát kategórikusan megnyitható listában.
 *
 * A v1-ben nincs sor-szintű override — Endre csak ránéz a számokra, és ha
 * elfogadhatóak, tovább megy. (A v2-ben ide kerülne egy "kategorizáld át
 * ezt a sort" UI.)
 *
 * 2026-05-03 (Fázis 5): első verzió.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  HandCoins,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  ClassifiedKasszaRow,
  KasszaAnalysisResult,
} from '@/app/(dashboard)/penzugy/finance-import-types'

interface KasszaSplitStepProps {
  analysis: KasszaAnalysisResult | null
  isAnalyzing: boolean
  onAnalyze: () => void
  onBack: () => void
  onContinue: () => void
}

type KasszaKind = ClassifiedKasszaRow['kind']

const KIND_META: Record<
  KasszaKind,
  { label: string; tone: string; icon: React.ReactNode }
> = {
  income: {
    label: 'Bevétel',
    tone: 'text-emerald-700 bg-emerald-50/80 ring-emerald-100',
    icon: <ArrowDownToLine className="size-4" />,
  },
  expense: {
    label: 'Kiadás',
    tone: 'text-rose-700 bg-rose-50/80 ring-rose-100',
    icon: <ArrowUpFromLine className="size-4" />,
  },
  'internal-transfer-in': {
    label: 'Belső mozgás (bank → kassza)',
    tone: 'text-violet-700 bg-violet-50/80 ring-violet-100',
    icon: <HandCoins className="size-4" />,
  },
  'internal-transfer-out': {
    label: 'Belső mozgás (kassza → bank)',
    tone: 'text-amber-700 bg-amber-50/80 ring-amber-100',
    icon: <Coins className="size-4" />,
  },
  skip: {
    label: 'Kihagyott (üres / összesítő)',
    tone: 'text-slate-600 bg-slate-50/80 ring-slate-100',
    icon: <XCircle className="size-4" />,
  },
}

export function KasszaSplitStep({
  analysis,
  isAnalyzing,
  onAnalyze,
  onBack,
  onContinue,
}: KasszaSplitStepProps) {
  const [expanded, setExpanded] = useState<Record<KasszaKind, boolean>>({
    income: false,
    expense: true,
    'internal-transfer-in': true,
    'internal-transfer-out': true,
    skip: false,
  })

  // Auto-trigger az analízis, ha még nincs eredmény
  useEffect(() => {
    if (!analysis && !isAnalyzing) {
      onAnalyze()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groupedRows = useMemo(() => {
    const map: Record<KasszaKind, ClassifiedKasszaRow[]> = {
      income: [],
      expense: [],
      'internal-transfer-in': [],
      'internal-transfer-out': [],
      skip: [],
    }
    if (!analysis?.rows) return map
    for (const row of analysis.rows) {
      map[row.kind].push(row)
    }
    return map
  }, [analysis])

  const stats = analysis?.stats
  const importableCount = stats
    ? stats.income + stats.expense + stats.internalTransferIn + stats.internalTransferOut
    : 0

  if (!analysis && isAnalyzing) {
    return (
      <div className="flex items-center justify-center rounded-[1.5rem] bg-white/85 p-12 ring-1 ring-emerald-100">
        <Loader2 className="size-6 animate-spin text-emerald-600" />
        <p className="ml-3 text-sm font-medium text-slate-600">
          Sorok szétválasztása folyamatban…
        </p>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="rounded-[1.5rem] bg-white/85 p-6 ring-1 ring-emerald-100 text-sm text-slate-600">
        <p>Még nem fut az analízis. Kattints a gombra a folytatáshoz.</p>
        <Button
          type="button"
          onClick={onAnalyze}
          className="mt-3 rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          <RefreshCw className="mr-1.5 size-4" />
          Sorok szétválasztása
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Statisztikai KpiCard-ok */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SplitStatCard
          label="Bevétel"
          value={stats?.income ?? 0}
          tone="emerald"
          icon={<ArrowDownToLine className="size-4" />}
        />
        <SplitStatCard
          label="Kiadás"
          value={stats?.expense ?? 0}
          tone="rose"
          icon={<ArrowUpFromLine className="size-4" />}
        />
        <SplitStatCard
          label="Bank → Kassza"
          value={stats?.internalTransferIn ?? 0}
          tone="violet"
          icon={<HandCoins className="size-4" />}
        />
        <SplitStatCard
          label="Kassza → Bank"
          value={stats?.internalTransferOut ?? 0}
          tone="amber"
          icon={<Coins className="size-4" />}
        />
        <SplitStatCard
          label="Kihagyva"
          value={stats?.skip ?? 0}
          tone="slate"
          icon={<XCircle className="size-4" />}
        />
      </div>

      {/* Importálandó összesen */}
      <div className="rounded-[1.5rem] bg-emerald-50/60 p-5 ring-1 ring-emerald-200">
        <p className="flex items-start gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          Importálandó tételek: {importableCount} sor
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-700">
          A wizard ezeket a sorokat fogja átvinni a Kartotéka pénzügyi
          rendszerébe (bevétel, kiadás vagy belső mozgás kategóriába). A
          kihagyott sorok az üres/összesítő-soroknál maradnak — nem kerülnek be.
        </p>
      </div>

      {/* Csoportonként összecsukható sor-listák */}
      <div className="space-y-3">
        {(Object.keys(KIND_META) as KasszaKind[]).map((kind) => {
          const rows = groupedRows[kind]
          const meta = KIND_META[kind]
          if (rows.length === 0) return null

          const isOpen = expanded[kind]
          const previewCount = 25
          const previewRows = isOpen ? rows.slice(0, previewCount) : []

          return (
            <div
              key={kind}
              className="overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ring-emerald-100"
            >
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 transition hover:bg-emerald-50/40"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.tone}`}
                  >
                    {meta.icon}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                    <p className="text-xs text-slate-500">{rows.length} sor</p>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="size-4 text-slate-400" />
                ) : (
                  <ChevronRight className="size-4 text-slate-400" />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-emerald-50">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          <th className="px-3 py-2 font-semibold">Sor</th>
                          <th className="px-3 py-2 font-semibold">Dátum</th>
                          <th className="px-3 py-2 font-semibold">Iratszám</th>
                          <th className="px-3 py-2 font-semibold">Donor / cél</th>
                          <th className="px-3 py-2 font-semibold">Összeg</th>
                          <th className="px-3 py-2 font-semibold">Kategória</th>
                          <th className="px-3 py-2 font-semibold">Kód</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => (
                          <tr
                            key={row.rowIndex}
                            className="border-t border-slate-100"
                          >
                            <td className="px-3 py-2 text-slate-400">
                              #{row.rowIndex + 1}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {row.datum || '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {row.iratszam || '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {row.donorString || row.skipReason || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">
                              {row.amount !== undefined
                                ? `${row.amount.toFixed(2)} RON`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {row.celNev || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-500">
                              {row.budgetCode || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > previewCount && (
                    <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-2 text-center text-xs text-slate-500">
                      … és további {rows.length - previewCount} sor
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pasztorális tipp */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 text-xs text-emerald-800">
        <p className="leading-relaxed">
          Ha valamelyik sor nem oda került, ahova szerinted való, lépj vissza,
          és nézd meg, hogy a Kassza Excel-ben helyes-e a "Költségvetési szám"
          oszlop az adott sornál. A v1-ben a wizard automatikusan szétválaszt
          — kézi átsorolásra a következő iterációban lesz lehetőség.
        </p>
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
          disabled={importableCount === 0}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          Tovább a kódok feloldásához
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>

      {importableCount === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Nincs importálandó tétel
          </p>
          <p className="mt-1 leading-relaxed">
            A Kassza fülön nem találtunk olyan sort, ami bevétel, kiadás vagy
            belső mozgás lenne. Ellenőrizd, hogy a fájl a megfelelő évre
            vonatkozik-e, és a fejléc-sorrend stimmel-e.
          </p>
        </div>
      )}
    </div>
  )
}

interface SplitStatCardProps {
  label: string
  value: number
  tone: 'emerald' | 'rose' | 'violet' | 'amber' | 'slate'
  icon: React.ReactNode
}

function SplitStatCard({ label, value, tone, icon }: SplitStatCardProps) {
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
