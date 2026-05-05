'use client'

/**
 * Egyházfenntartás-import — 2. lépés: Áttekintés + felhasználói döntések.
 *
 * 2026-05-06.
 *
 * 4 fülön: Biztos | Bizonytalan | Csak-egyik | Tag-hiány
 * Minden sornál: Importálom / Skipelem / Manuális tag (combobox)
 */

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  UserX,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ParsePreviewResult, PreviewMatchedRow } from '@/app/(dashboard)/penzugy/egyhfenntartas-import-actions'

interface MatchStepProps {
  preview: ParsePreviewResult
  selectedYear: number
  /** Skip-status: clientKey → true (ha skipped) */
  skipped: Set<string>
  onSkipToggle: (clientKey: string) => void
  /** Manuális tag-választás: clientKey → szemelyId */
  manualSelections: Record<string, number>
  onManualSelectionChange: (clientKey: string, szemelyId: number) => void
  onBack: () => void
  onConfirmImport: () => void
  isImporting: boolean
}

type TabId = 'sure' | 'uncertain' | 'only-side' | 'no-tag'

export function MatchStep({
  preview,
  selectedYear,
  skipped,
  onSkipToggle,
  manualSelections,
  onManualSelectionChange,
  onBack,
  onConfirmImport,
  isImporting,
}: MatchStepProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sure')

  const grouped = useMemo(() => groupByCategory(preview.matched), [preview.matched])

  const tabs: Array<{
    id: TabId
    label: string
    color: string
    icon: React.ComponentType<{ className?: string }>
    count: number
  }> = [
    {
      id: 'sure',
      label: 'Biztos egyezés',
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      icon: CheckCircle2,
      count: grouped.sure.length,
    },
    {
      id: 'uncertain',
      label: 'Bizonytalanok',
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      icon: HelpCircle,
      count: grouped.uncertain.length,
    },
    {
      id: 'only-side',
      label: 'Egyik fájlban',
      color: 'text-sky-700 bg-sky-50 border-sky-200',
      icon: AlertTriangle,
      count: grouped.onlySide.length,
    },
    {
      id: 'no-tag',
      label: 'Tag nem található',
      color: 'text-rose-700 bg-rose-50 border-rose-200',
      icon: UserX,
      count: grouped.noTag.length,
    },
  ]

  const importableCount =
    preview.matched.length - skipped.size

  return (
    <div className="space-y-5 p-5 md:p-6">
      <header>
        <h2 className="font-heading text-2xl text-slate-800">
          Áttekintés és döntések ({selectedYear})
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          A két fájlt összevetettük és minden sort párosítottunk a tagnyilvántartással.
          Az alábbi 4 csoportban kell végigmenned. Ha "Skip"-eled, az adott sor nem
          kerül a könyvelésbe.
        </p>
      </header>

      {/* Statisztika kártya */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Sorok az xlsx-ben"
          value={`${preview.matched.filter(m => m.source.xlsxRow).length}`}
          subtitle={`Total: ${preview.stats.xlsxTotal.toLocaleString('hu-HU')} RON`}
        />
        <StatCard
          label="Sorok az xml-ben"
          value={`${preview.matched.filter(m => m.source.xmlRow).length}`}
          subtitle={`Total: ${preview.stats.xmlTotal.toLocaleString('hu-HU')} RON`}
        />
        <StatCard
          label="Cross-match"
          value={`${preview.stats.matchCount}`}
          subtitle={`+ ${preview.stats.uncertainCount} bizonytalan`}
        />
        <StatCard
          label="Tagnyilvántartás"
          value={`${preview.stats.szemelyExactCount + preview.stats.szemelyFuzzyCount}`}
          subtitle={`${preview.stats.szemelyNotFoundCount} nem található`}
        />
      </div>

      {/* Tab nav */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? `${tab.color} font-semibold`
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="size-4" />
              <span className="flex-1 text-left">{tab.label}</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Tab tartalom */}
      <div className="space-y-2">
        {activeTab === 'sure' && (
          <RowList
            rows={grouped.sure}
            skipped={skipped}
            onSkipToggle={onSkipToggle}
            manualSelections={manualSelections}
            onManualSelectionChange={onManualSelectionChange}
            emptyMessage="Még nincs biztos egyezés."
          />
        )}
        {activeTab === 'uncertain' && (
          <RowList
            rows={grouped.uncertain}
            skipped={skipped}
            onSkipToggle={onSkipToggle}
            manualSelections={manualSelections}
            onManualSelectionChange={onManualSelectionChange}
            emptyMessage="Nincs bizonytalan sor."
          />
        )}
        {activeTab === 'only-side' && (
          <RowList
            rows={grouped.onlySide}
            skipped={skipped}
            onSkipToggle={onSkipToggle}
            manualSelections={manualSelections}
            onManualSelectionChange={onManualSelectionChange}
            emptyMessage="Minden sor mindkét fájlban szerepel."
          />
        )}
        {activeTab === 'no-tag' && (
          <RowList
            rows={grouped.noTag}
            skipped={skipped}
            onSkipToggle={onSkipToggle}
            manualSelections={manualSelections}
            onManualSelectionChange={onManualSelectionChange}
            emptyMessage="Minden sorhoz találtunk tagot a tagnyilvántartásban."
          />
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2" disabled={isImporting}>
          <ArrowLeft className="size-4" />
          Vissza
        </Button>
        <Button
          size="lg"
          className="gap-2 rounded-xl px-6"
          onClick={onConfirmImport}
          disabled={isImporting || importableCount === 0}
        >
          {isImporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
          {isImporting
            ? 'Importálás folyamatban…'
            : `${importableCount} tétel importálása`}
        </Button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Helper komponensek
// ──────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: string
  subtitle: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-heading text-2xl text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

interface GroupedRows {
  sure: PreviewMatchedRow[]
  uncertain: PreviewMatchedRow[]
  onlySide: PreviewMatchedRow[]
  noTag: PreviewMatchedRow[]
}

function groupByCategory(matched: PreviewMatchedRow[]): GroupedRows {
  const sure: PreviewMatchedRow[] = []
  const uncertain: PreviewMatchedRow[] = []
  const onlySide: PreviewMatchedRow[] = []
  const noTag: PreviewMatchedRow[] = []

  for (const row of matched) {
    const sourceKind = row.source.kind
    const tagMode = row.szemely.matchMode

    // 'no-tag' priority: ha a tag-egyezés sikertelen vagy bizonytalan, oda kerül
    if (tagMode === 'not-found' || tagMode === 'multiple') {
      noTag.push(row)
      continue
    }

    if (sourceKind === 'match' && (tagMode === 'exact' || tagMode === 'company')) {
      sure.push(row)
      continue
    }
    if (sourceKind === 'uncertain') {
      uncertain.push(row)
      continue
    }
    if (sourceKind === 'only-xlsx' || sourceKind === 'only-xml') {
      onlySide.push(row)
      continue
    }
    // Fallback (match + fuzzy-name)
    sure.push(row)
  }

  return { sure, uncertain, onlySide, noTag }
}

function RowList({
  rows,
  skipped,
  onSkipToggle,
  manualSelections,
  onManualSelectionChange,
  emptyMessage,
}: {
  rows: PreviewMatchedRow[]
  skipped: Set<string>
  onSkipToggle: (k: string) => void
  manualSelections: Record<string, number>
  onManualSelectionChange: (k: string, id: number) => void
  emptyMessage: string
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{emptyMessage}</p>
  }
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <RowCard
          key={row.clientKey}
          row={row}
          isSkipped={skipped.has(row.clientKey)}
          onSkipToggle={() => onSkipToggle(row.clientKey)}
          manualId={manualSelections[row.clientKey]}
          onManualChange={id => onManualSelectionChange(row.clientKey, id)}
        />
      ))}
    </div>
  )
}

function RowCard({
  row,
  isSkipped,
  onSkipToggle,
  manualId,
  onManualChange,
}: {
  row: PreviewMatchedRow
  isSkipped: boolean
  onSkipToggle: () => void
  manualId: number | undefined
  onManualChange: (id: number) => void
}) {
  const fr = row.finalRow
  const sourceKind = row.source.kind
  const tagMode = row.szemely.matchMode

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isSkipped
          ? 'border-slate-200 bg-slate-100 opacity-60'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{fr.forrasa}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span>📅 {fr.datum}</span>
            <span>💰 {fr.osszeg.toLocaleString('hu-HU')} RON</span>
            <span>📋 Iratszám: {fr.iratszam}</span>
            <span>📌 Befizetett év: {fr.fizetettev}</span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <SourceBadge kind={sourceKind} />
            <TagBadge mode={tagMode} />
          </div>

          {row.source.kind === 'uncertain' && row.source.uncertaintyReason && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1 text-xs text-amber-900">
              ⚠️ {row.source.uncertaintyReason}
            </p>
          )}

          {tagMode === 'multiple' && row.szemely.candidates.length > 0 && (
            <div className="mt-2">
              <label className="text-xs text-slate-600">
                Több tag illik — válassz egyet:
              </label>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs"
                value={manualId ?? ''}
                onChange={e => onManualChange(parseInt(e.target.value, 10))}
              >
                <option value="">— Válassz —</option>
                {row.szemely.candidates.map(c => (
                  <option key={c.szemelyId} value={c.szemelyId}>
                    {c.csaladnev} {c.k_nev} {c.cim ? `(szám: ${c.cim})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <Button
          size="sm"
          variant={isSkipped ? 'outline' : 'ghost'}
          onClick={onSkipToggle}
          className="text-xs"
        >
          {isSkipped ? 'Visszaállít' : 'Skip'}
        </Button>
      </div>
    </div>
  )
}

function SourceBadge({ kind }: { kind: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    match: { label: '🟢 Mindkettő', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    uncertain: { label: '🟡 Bizonytalan', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    'only-xlsx': { label: '🔵 Csak xlsx', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    'only-xml': { label: '🟠 Csak xml', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  }
  const m = map[kind] || { label: kind, cls: 'bg-slate-50 text-slate-700 border-slate-200' }
  return <span className={`rounded border px-2 py-0.5 ${m.cls}`}>{m.label}</span>
}

function TagBadge({ mode }: { mode: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    exact: { label: '👤 Tag egyezés', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'fuzzy-name': { label: '👤 Lazább egyezés', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
    multiple: { label: '👥 Több tag', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    'not-found': { label: '❓ Tag nincs', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    company: { label: '🏢 Cég', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  }
  const m = map[mode] || { label: mode, cls: 'bg-slate-50 text-slate-700 border-slate-200' }
  return <span className={`rounded border px-2 py-0.5 ${m.cls}`}>{m.label}</span>
}
