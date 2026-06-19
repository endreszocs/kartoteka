'use client'

/**
 * Általános bevétel-import — párosítás-előnézet lépés (P1-1 / P1-2, 2026-06-19).
 *
 * Korábban az adomány-import egylépéses volt: a több-jelöltes és nem-talált
 * befizetők NÉMÁN, tag-kapcsolat nélkül kerültek be. Ez a lépés a beszúrás ELŐTT
 * megmutatja a párosítást, és engedi a kézi felülbírálást (legördülő + szabad
 * keresés) vagy a sor kihagyását.
 */

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  UserX,
  Building2,
  Ban,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ManualTagSearch } from '@/components/finance/finance-import/shared/manual-tag-search'
import type {
  GeneralPreviewResult,
  GeneralPreviewRow,
} from '@/app/(dashboard)/penzugy/general-income-actions'

type TabId = 'review' | 'sure' | 'company' | 'invalid'

interface GeneralMatchStepProps {
  preview: GeneralPreviewResult
  year: number
  skipped: Set<string>
  onSkipToggle: (clientKey: string) => void
  manualSelections: Record<string, number>
  onManualSelectionChange: (clientKey: string, szemelyId: number) => void
  onBack: () => void
  onConfirm: () => void
  isImporting: boolean
}

export function GeneralMatchStep({
  preview,
  year,
  skipped,
  onSkipToggle,
  manualSelections,
  onManualSelectionChange,
  onBack,
  onConfirm,
  isImporting,
}: GeneralMatchStepProps) {
  const groups = useMemo(() => {
    const review: GeneralPreviewRow[] = []
    const sure: GeneralPreviewRow[] = []
    const company: GeneralPreviewRow[] = []
    const invalid: GeneralPreviewRow[] = []
    for (const r of preview.rows) {
      if (!r.valid) invalid.push(r)
      else if (r.person.matchMode === 'company') company.push(r)
      else if (r.person.matchMode === 'multiple' || r.person.matchMode === 'not-found') review.push(r)
      else sure.push(r)
    }
    return { review, sure, company, invalid }
  }, [preview.rows])

  const [activeTab, setActiveTab] = useState<TabId>(groups.review.length > 0 ? 'review' : 'sure')

  const insertable = preview.rows.filter((r) => r.valid && !skipped.has(r.clientKey)).length
  const s = preview.stats

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; count: number; cls: string }> = [
    { id: 'review', label: 'Áttekintendő', icon: UserX, count: groups.review.length, cls: 'text-rose-700 bg-rose-50 border-rose-200' },
    { id: 'sure', label: 'Biztos egyezés', icon: CheckCircle2, count: groups.sure.length, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { id: 'company', label: 'Cég / egyéb', icon: Building2, count: groups.company.length, cls: 'text-violet-700 bg-violet-50 border-violet-200' },
    { id: 'invalid', label: 'Kihagyott', icon: Ban, count: groups.invalid.length, cls: 'text-slate-600 bg-slate-50 border-slate-200' },
  ]
  const activeRows = groups[activeTab]

  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-heading text-2xl text-slate-800">Párosítás áttekintése ({year})</h2>
        <p className="mt-1 text-sm text-slate-600">
          A beszúrás előtt ellenőrizd a tag-párosítást. Az Áttekintendő csoportban a több
          jelöltes és a nem talált befizetők vannak — ezeket kézzel rendezheted, vagy kihagyhatod.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Érvényes sor" value={s.valid} subtitle={`${s.invalid + s.noCategory} kihagyandó`} />
        <StatCard label="Biztos tag-egyezés" value={s.personExact} subtitle={`${s.personMultiple} több jelölt`} />
        <StatCard label="Tag nem található" value={s.personNotFound} subtitle={`${s.personCompany} cég`} />
        <StatCard label="Beszúrásra jelölt" value={insertable} subtitle={`${s.egyhf} egyházf. · ${s.other} egyéb`} />
      </div>

      {preview.reconcile && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-800">Egyeztetés a könyveléssel</p>
          <p className="mt-1">
            🟢 {preview.reconcile.stats.matchCount} egyezik · 🔵{' '}
            {preview.reconcile.stats.missingFromBooksCount} hiányzik a könyvelésből · 🟠{' '}
            {preview.reconcile.stats.onlyInBooksCount} csak a könyvelésben · 🟡{' '}
            {preview.reconcile.stats.discrepancyCount} eltérés
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${
                isActive ? `${tab.cls} font-semibold` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="size-4" />
              <span className="flex-1 text-left">{tab.label}</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{tab.count}</span>
            </button>
          )
        })}
      </div>

      <div className="space-y-2">
        {activeRows.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nincs sor ebben a csoportban.</p>
        ) : (
          activeRows.map((row) => (
            <GeneralRowCard
              key={row.clientKey}
              row={row}
              isSkipped={skipped.has(row.clientKey)}
              onSkipToggle={() => onSkipToggle(row.clientKey)}
              manualId={manualSelections[row.clientKey]}
              onManualChange={(id) => onManualSelectionChange(row.clientKey, id)}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2" disabled={isImporting}>
          <ArrowLeft className="size-4" />
          Vissza az oszlop-párosításhoz
        </Button>
        <Button size="lg" className="gap-2 rounded-xl px-6" onClick={onConfirm} disabled={isImporting || insertable === 0}>
          {isImporting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {isImporting ? 'Importálás folyamatban…' : `${insertable} tétel importálása`}
        </Button>
      </div>
    </div>
  )
}

function StatCard({ label, value, subtitle }: { label: string; value: number; subtitle: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-heading text-2xl text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

function GeneralRowCard({
  row,
  isSkipped,
  onSkipToggle,
  manualId,
  onManualChange,
}: {
  row: GeneralPreviewRow
  isSkipped: boolean
  onSkipToggle: () => void
  manualId: number | undefined
  onManualChange: (id: number) => void
}) {
  const mode = row.person.matchMode
  const nameQuery = (row.nev.split(/\s+[-–—]\s+/)[0] || row.nev).trim()

  return (
    <div className={`rounded-lg border p-3 transition-colors ${isSkipped ? 'border-slate-200 bg-slate-100 opacity-60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{row.nev || '(névtelen)'}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span>📅 {row.datum}</span>
            <span>💰 {row.osszeg.toLocaleString('hu-HU')} RON</span>
            {row.kod && <span>📊 {row.kod}</span>}
            <span>📌 {row.fizetettev}</span>
          </div>

          <div className="mt-1">
            <MatchBadge mode={mode} valid={row.valid} reason={row.invalidReason} />
          </div>

          {row.valid && mode === 'multiple' && row.person.candidates.length > 0 && (
            <div className="mt-2">
              <label className="text-xs text-slate-600">Több tag illik — válassz egyet:</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs"
                value={manualId ?? ''}
                onChange={(e) => onManualChange(parseInt(e.target.value, 10))}
              >
                <option value="">— Válassz —</option>
                {row.person.candidates.map((c) => (
                  <option key={c.szemelyId} value={c.szemelyId}>
                    {c.csaladnev} {c.k_nev} {c.cim ? `(${c.cim})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {row.valid && mode === 'not-found' && (
            <p className="mt-2 rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1 text-xs text-rose-900">
              ❓ Nem találtunk hozzá tagot. Keresd meg kézzel, vagy a Skip gombbal hagyd ki —
              különben a befizetés <strong>tag-kapcsolat nélkül</strong> kerül be.
            </p>
          )}

          {row.valid && (mode === 'not-found' || mode === 'multiple' || mode === 'company') && (
            <ManualTagSearch
              initialQuery={nameQuery}
              currentId={manualId}
              onPick={(id) => onManualChange(id)}
            />
          )}
        </div>

        {row.valid && (
          <Button size="sm" variant={isSkipped ? 'outline' : 'ghost'} onClick={onSkipToggle} className="text-xs">
            {isSkipped ? 'Visszaállít' : 'Skip'}
          </Button>
        )}
      </div>
    </div>
  )
}

function MatchBadge({ mode, valid, reason }: { mode: string; valid: boolean; reason: string | null }) {
  if (!valid) {
    return (
      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
        ⛔ {reason || 'Érvénytelen / kihagyva'}
      </span>
    )
  }
  const map: Record<string, { label: string; cls: string }> = {
    exact: { label: '👤 Tag egyezés', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    multiple: { label: '👥 Több tag', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    'not-found': { label: '❓ Tag nincs', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    company: { label: '🏢 Cég', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  }
  const m = map[mode] || { label: mode, cls: 'bg-slate-50 text-slate-700 border-slate-200' }
  return <span className={`rounded border px-2 py-0.5 text-xs ${m.cls}`}>{m.label}</span>
}
