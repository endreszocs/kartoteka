'use client'

/**
 * Oblio párosítás-diagnosztika dialog — 3 fülre bontva.
 *
 * A párosítatlan XML-eket a legjobb jelölt „összesített pontszáma" szerint
 * 3 kategóriába soroljuk:
 *   - Valószínű találat (70-100%)   — a legjobb név-hasonlóság + kis összeg + dátum eltérés
 *   - Bizonytalan (40-69%)
 *   - Nem valószínű (<40%)
 *
 * Minden fülben lehetőség van:
 *   - Egyesével: „Párosít" (a top jelölttel) vagy „Mellőz" (kihagy)
 *   - Tömegesen: „Párosít összest" vagy „Mellőz összest"
 *
 * A mellőzött XML-ek az eszköz-helyi `localStorage`-be kerülnek — a
 * következő szkenelésnél már nem jelennek meg.
 */

import { useMemo, useState } from 'react'
import { Search, AlertCircle, Link2, Sparkles, X, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { UnmatchedXmlDiag } from '@/lib/finance/oblio/oblio-matcher'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  diagnostics: UnmatchedXmlDiag[]
  /** Kattintásra a manuális párosítás dialog megnyitásához. */
  onManualMatch: (xmlAnafUuid: string) => void
  /** A sorban következő legjobb jelölttel automatikus párosítás egy kattintásra.
   *  (A dialog nem nyit másik modalt — csak elment a DB-be.) */
  onAutoMatch: (xmlAnafUuid: string, kiadasId: number) => Promise<{ success?: boolean; error?: string }>
  /** Egy XML mellőzése — a következő szkenelésnél már nem jelenik meg.
   *  A parent komponens tárolja (localStorage). */
  onDismiss: (xmlAnafUuid: string) => void
}

type ConfidenceTier = 'high' | 'medium' | 'low' | 'nocand'

/** A XML „jóság-pontszáma": a top jelölt alapján. */
function scoreXml(diag: UnmatchedXmlDiag): number {
  if (diag.candidates.length === 0) return -1
  const top = diag.candidates[0]
  if (top.alreadyMatched) return -1
  // Egyszerű súlyozott pontszám 0-100:
  //   - nameSimPct 50%
  //   - amountDelta 30% (invertálva: 0 diff = 100, 5 diff = 0)
  //   - dateDelta 20% (invertálva: 0 nap = 100, 60 nap = 0)
  const nameScore = top.nameSimPct
  const amountScore = Math.max(0, 100 - top.amountDelta * 20) // 5 RON = 0 pont
  const dateScore = top.dateDelta < 0 ? 0 : Math.max(0, 100 - (top.dateDelta / 60) * 100)
  return Math.round(nameScore * 0.5 + amountScore * 0.3 + dateScore * 0.2)
}

function categorize(score: number): ConfidenceTier {
  if (score < 0) return 'nocand'
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function OblioMatchDiagnosticDialog({
  open,
  onOpenChange,
  diagnostics,
  onManualMatch,
  onAutoMatch,
  onDismiss,
}: Props) {
  const [activeTab, setActiveTab] = useState<ConfidenceTier>('high')
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // Csoportosítás score szerint
  const { high, medium, low, nocand } = useMemo(() => {
    const h: Array<{ diag: UnmatchedXmlDiag; score: number }> = []
    const m: Array<{ diag: UnmatchedXmlDiag; score: number }> = []
    const l: Array<{ diag: UnmatchedXmlDiag; score: number }> = []
    const n: Array<{ diag: UnmatchedXmlDiag; score: number }> = []
    for (const d of diagnostics) {
      const score = scoreXml(d)
      const cat = categorize(score)
      const item = { diag: d, score }
      if (cat === 'high') h.push(item)
      else if (cat === 'medium') m.push(item)
      else if (cat === 'low') l.push(item)
      else n.push(item)
    }
    // Legjobb score-ral előre
    h.sort((a, b) => b.score - a.score)
    m.sort((a, b) => b.score - a.score)
    l.sort((a, b) => b.score - a.score)
    return { high: h, medium: m, low: l, nocand: n }
  }, [diagnostics])

  const activeGroup =
    activeTab === 'high' ? high : activeTab === 'medium' ? medium : activeTab === 'low' ? low : nocand

  // Tömeges párosítás: a fülben lévő összes XML-t összerendeli a top jelöltjével
  async function handleBulkMatch() {
    if (activeGroup.length === 0) return
    setBulkProcessing(true)
    let successCount = 0
    const failed: string[] = []
    for (const { diag } of activeGroup) {
      if (!diag.xmlAnafUuid || diag.candidates.length === 0) {
        failed.push(diag.xmlSupplier || '(ismeretlen)')
        continue
      }
      const top = diag.candidates[0]
      if (top.alreadyMatched) continue
      const res = await onAutoMatch(diag.xmlAnafUuid, top.kiadasId)
      if (res.success) successCount++
      else failed.push(`${diag.xmlSupplier || diag.xmlAnafUuid}: ${res.error || 'ismeretlen hiba'}`)
    }
    setBulkProcessing(false)

    if (successCount > 0) toast.success(`${successCount} XML sikeresen párosítva.`)
    if (failed.length > 0) toast.error(`${failed.length} párosítás sikertelen — ellenőrizd a hibákat.`)
  }

  // Tömeges mellőzés: a fülben lévő összeset „ne jelenjen meg többet"
  function handleBulkDismiss() {
    if (activeGroup.length === 0) return
    for (const { diag } of activeGroup) {
      if (diag.xmlAnafUuid) onDismiss(diag.xmlAnafUuid)
    }
    toast.success(`${activeGroup.length} XML mellőzve.`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[96vw]
          !h-[94vh] !max-h-[94vh]
          overflow-hidden
          border border-orange-200 bg-gradient-to-br from-white via-white to-orange-50/30
          p-0 gap-0 rounded-2xl
          flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-orange-100 bg-white/70 px-6 py-4 sm:px-8 sm:py-4 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-sm">
              <Search className="size-5" />
            </span>
            Párosítás-diagnosztika ({diagnostics.length} párosítatlan XML)
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            A párosítatlan XML-ek a legjobb jelölt alapján csoportosítva. A 70%+
            találatok gyakran egy kattintással párosíthatóak tömegesen.
          </DialogDescription>
        </DialogHeader>

        {/* Fül-sáv */}
        <div className="shrink-0 flex items-center gap-1 border-b border-orange-100 bg-white/50 px-4 sm:px-6 overflow-x-auto">
          <TabButton
            active={activeTab === 'high'}
            onClick={() => setActiveTab('high')}
            label="Valószínű"
            sublabel="70-100%"
            count={high.length}
            color="emerald"
          />
          <TabButton
            active={activeTab === 'medium'}
            onClick={() => setActiveTab('medium')}
            label="Bizonytalan"
            sublabel="40-69%"
            count={medium.length}
            color="amber"
          />
          <TabButton
            active={activeTab === 'low'}
            onClick={() => setActiveTab('low')}
            label="Nem valószínű"
            sublabel="<40%"
            count={low.length}
            color="red"
          />
          {nocand.length > 0 && (
            <TabButton
              active={activeTab === 'nocand'}
              onClick={() => setActiveTab('nocand')}
              label="Nincs jelölt"
              sublabel=""
              count={nocand.length}
              color="slate"
            />
          )}
        </div>

        {/* Tömeges akciók */}
        {activeGroup.length > 0 && activeTab !== 'nocand' && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 bg-slate-50/60 border-b border-slate-100">
            <span className="text-xs text-slate-600">
              {activeGroup.length} XML ebben a csoportban:
            </span>
            <Button
              size="sm"
              onClick={handleBulkMatch}
              disabled={bulkProcessing}
              className={`rounded-lg text-white text-xs shadow-sm ${
                activeTab === 'high'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : activeTab === 'medium'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-slate-600 hover:bg-slate-700'
              }`}
            >
              {bulkProcessing ? (
                <>
                  <Loader2 className="mr-1.5 size-3 animate-spin" /> Feldolgozás…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 size-3" />
                  Párosít összest (top jelölttel)
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={handleBulkDismiss}
              disabled={bulkProcessing}
              variant="outline"
              className="rounded-lg text-xs"
            >
              <XCircle className="mr-1.5 size-3" />
              Mellőz összest
            </Button>
            {activeTab === 'low' && (
              <span className="text-[10px] text-red-600 italic">
                ⚠ Alacsony bizalmi szint — csak akkor használd a tömeges párosítást, ha már átnézted a listát.
              </span>
            )}
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-3">
          {activeGroup.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">
              {activeTab === 'high' && 'Nincs valószínű (70%+) párosítatlan XML.'}
              {activeTab === 'medium' && 'Nincs bizonytalan (40-69%) párosítatlan XML.'}
              {activeTab === 'low' && 'Nincs nem valószínű (<40%) párosítatlan XML.'}
              {activeTab === 'nocand' && 'Nincs jelölt-nélküli XML.'}
            </div>
          ) : (
            activeGroup.map(({ diag, score }, i) => (
              <DiagItem
                key={diag.xmlAnafUuid || `unknown-${i}`}
                diag={diag}
                score={score}
                onManualMatch={() => diag.xmlAnafUuid && onManualMatch(diag.xmlAnafUuid)}
                onQuickMatch={async () => {
                  if (!diag.xmlAnafUuid || diag.candidates.length === 0) return
                  const top = diag.candidates[0]
                  if (top.alreadyMatched) {
                    toast.error('A legjobb jelölt már párosítva van egy másik XML-hez.')
                    return
                  }
                  const res = await onAutoMatch(diag.xmlAnafUuid, top.kiadasId)
                  if (res.success) toast.success(`Párosítva: ${diag.xmlSupplier || '(ismeretlen)'}`)
                  else toast.error(res.error || 'Párosítás sikertelen.')
                }}
                onDismiss={() => {
                  if (!diag.xmlAnafUuid) return
                  onDismiss(diag.xmlAnafUuid)
                  toast.success('XML mellőzve — legközelebb nem jelenik meg.')
                }}
              />
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-orange-100 bg-white/70 px-6 py-3 sm:px-8 flex flex-wrap justify-between items-center gap-2">
          <p className="text-xs text-slate-500">
            💡 A mellőzött XML-ek a következő szkenelésnél sem fognak megjelenni.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            <X className="mr-1 size-3.5" /> Bezárás
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TabButton({
  active,
  onClick,
  label,
  sublabel,
  count,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  sublabel: string
  count: number
  color: 'emerald' | 'amber' | 'red' | 'slate'
}) {
  const colorClasses = {
    emerald: active
      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/60'
      : 'border-transparent text-emerald-600 hover:bg-emerald-50/30',
    amber: active
      ? 'border-amber-500 text-amber-700 bg-amber-50/60'
      : 'border-transparent text-amber-600 hover:bg-amber-50/30',
    red: active
      ? 'border-red-500 text-red-700 bg-red-50/60'
      : 'border-transparent text-red-600 hover:bg-red-50/30',
    slate: active
      ? 'border-slate-500 text-slate-700 bg-slate-50/60'
      : 'border-transparent text-slate-500 hover:bg-slate-50/30',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 border-b-2 px-3 sm:px-4 py-2 text-sm font-medium transition-colors ${colorClasses[color]}`}
    >
      <span>{label}</span>
      {sublabel && <span className="text-[10px] opacity-70">({sublabel})</span>}
      <span className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 min-w-[20px] text-[10px] font-bold ${
        active ? 'bg-white/80' : 'bg-slate-200/80'
      }`}>
        {count}
      </span>
    </button>
  )
}

function DiagItem({
  diag,
  score,
  onManualMatch,
  onQuickMatch,
  onDismiss,
}: {
  diag: UnmatchedXmlDiag
  score: number
  onManualMatch: () => void
  onQuickMatch: () => Promise<void>
  onDismiss: () => void
}) {
  const [processing, setProcessing] = useState(false)
  const topCandidate = diag.candidates.find((c) => !c.alreadyMatched) || null
  const scoreColor =
    score >= 70 ? 'text-emerald-700 bg-emerald-100' :
    score >= 40 ? 'text-amber-700 bg-amber-100' :
    score >= 0  ? 'text-red-700 bg-red-100' :
                  'text-slate-500 bg-slate-100'

  return (
    <div className="card-raised border border-slate-200 bg-white p-4 space-y-3">
      {/* XML adatok fej */}
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
          <AlertCircle className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <p className="font-semibold text-slate-800 break-words">
              {diag.xmlSupplier || '(nincs név)'}
            </p>
            {score >= 0 && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${scoreColor}`}>
                {score}% találat
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 flex flex-wrap gap-3 mt-0.5">
            {diag.xmlCui && <span>CUI: <span className="font-mono">{diag.xmlCui}</span></span>}
            {diag.xmlDate && <span>Dátum: <strong>{diag.xmlDate}</strong></span>}
            {diag.xmlAmount !== null && (
              <span>Összeg: <strong>{diag.xmlAmount.toFixed(2)} RON</strong></span>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
          {topCandidate && (
            <Button
              size="sm"
              onClick={async () => {
                setProcessing(true)
                await onQuickMatch()
                setProcessing(false)
              }}
              disabled={processing}
              className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
            >
              {processing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 size-3" />
              )}
              Párosít
            </Button>
          )}
          <Button
            size="sm"
            onClick={onManualMatch}
            variant="outline"
            className="rounded-lg text-xs border-cyan-300 text-cyan-700 hover:bg-cyan-50"
          >
            <Link2 className="mr-1 size-3" />
            Kézi
          </Button>
          <Button
            size="sm"
            onClick={onDismiss}
            variant="outline"
            className="rounded-lg text-xs border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            <XCircle className="mr-1 size-3" />
            Mellőz
          </Button>
        </div>
      </div>

      {/* Jelöltek */}
      {diag.candidates.length === 0 ? (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500">
          Nincs összeg-közeli jelölt. Esetleg: nincs még rögzítve a kiadás, vagy
          az összeg nagyon eltér.
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">
            Top {diag.candidates.length} jelölt:
          </p>
          {diag.candidates.map((c, idx) => {
            const goodAmount = c.amountDelta === 0
            const goodDate = c.dateDelta <= 5
            const goodName = c.nameSimPct >= 70
            return (
              <div
                key={c.kiadasId}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  c.alreadyMatched
                    ? 'border-slate-200 bg-slate-50 opacity-60'
                    : idx === 0
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {idx === 0 && !c.alreadyMatched && (
                        <span className="mr-1.5 inline-flex items-center rounded bg-emerald-600 text-white px-1 py-0.5 text-[9px] font-bold">
                          TOP
                        </span>
                      )}
                      {c.partner}
                      {c.alreadyMatched && (
                        <span className="ml-2 text-[9px] uppercase text-slate-400">
                          (már párosítva)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      <span className="font-mono">#{c.kiadasId}</span>
                      {' · '}
                      {c.date}
                      {' · '}
                      <strong>{c.amount.toFixed(2)} RON</strong>
                      {c.cuiKiadas ? ` · CUI: ${c.cuiKiadas}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Pill ok={goodAmount} label={`±${c.amountDelta.toFixed(2)} RON`} />
                  <Pill ok={goodDate} label={`±${c.dateDelta.toFixed(0)} nap`} />
                  <Pill ok={goodName} label={`${c.nameSimPct}% név`} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {ok && <Sparkles className="size-2.5" />}
      {label}
    </span>
  )
}
