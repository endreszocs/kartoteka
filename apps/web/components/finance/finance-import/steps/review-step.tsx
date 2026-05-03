'use client'

/**
 * 2. lépés — Áttekintés és importálás (egyetlen, hosszú oldal).
 *
 * A szétaprózott 6 lépés (kassza-split, budget-code, donor-resolve, preview)
 * helyett egy átlátható, lelkészbarát egyetlen oldal:
 *   1. Pénzügyi mérleg-csíkok (4 KPI: bevétel / kiadás / cégek / megfeleltetve)
 *   2. Megfeleltetési magyarázat — vizuálisan, ikon + szöveg
 *   3. Tételek listája hónapokra csoportosítva, sor-kártyákon
 *   4. "Megerősítendő befizetők" — csak az ambiguous esetek inline
 *   5. Monetar diagnosztika
 *   6. Ismeretlen kódok kihagyásra (ha vannak)
 *   7. Egy nagy "Importálom mind" gomb
 *
 * 2026-05-03 (átdolgozott v2 — felhasználói visszajelzés alapján).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HandCoins,
  HelpCircle,
  Loader2,
  PlayCircle,
  Sparkles,
  UserCheck,
  UserX,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  BudgetCodeResolution,
  ClassifiedKasszaRow,
  DonorResolution,
  FinanceImportItem,
  KasszaAnalysisResult,
} from '@/app/(dashboard)/penzugy/finance-import-types'
import type { MonetarDiagnostic } from '../helpers/monetar-diagnostic'

interface ReviewStepProps {
  fileName: string
  analysis: KasszaAnalysisResult | null
  budgetCodeResolutions: BudgetCodeResolution[] | null
  donorResolutions: DonorResolution[] | null
  monetarDiagnostic: MonetarDiagnostic | null
  isLoading: boolean
  /** A buildFinanceImportItems által épített tömb */
  items: FinanceImportItem[]
  skippedReasons: Array<{ rowIndex: number; reason: string }>
  /** Felhasználó által skipre állított ismeretlen kódok */
  skippedCodes: Set<string>
  onSkipCodeToggle: (rawKod: string) => void
  /** Manuális ambiguous döntés */
  manualPersonSelections: Record<string, string>
  onManualPersonSelectionChange: (raw: string, szemelyId: string) => void
  isImporting: boolean
  onBack: () => void
  onConfirmImport: () => void
}

export function ReviewStep({
  fileName,
  analysis,
  budgetCodeResolutions,
  donorResolutions,
  monetarDiagnostic,
  isLoading,
  items,
  skippedReasons,
  skippedCodes,
  onSkipCodeToggle,
  manualPersonSelections,
  onManualPersonSelectionChange,
  isImporting,
  onBack,
  onConfirmImport,
}: ReviewStepProps) {
  const [showMore, setShowMore] = useState(false)

  // Loading state
  if (isLoading || !analysis) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[1.75rem] bg-card p-16 ring-1 ring-border">
        <Loader2 className="size-8 animate-spin text-emerald-600" />
        <p className="mt-4 font-serif text-lg text-foreground">
          Egy kis türelmet…
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Áttekintjük a fájl tételeit és összevetjük a tagnyilvántartással.
        </p>
      </div>
    )
  }

  const stats = analysis.stats!
  const totalIncomeAmount = items
    .filter((i) => i.kind === 'income')
    .reduce((s, i) => s + i.osszeg, 0)
  const totalExpenseAmount = items
    .filter((i) => i.kind === 'expense')
    .reduce((s, i) => s + i.osszeg, 0)

  const ambiguous = (donorResolutions || []).filter((d) => d.status === 'ambiguous')
  const companies = (donorResolutions || [])
    .filter((d) => d.status === 'company')
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
  const unknownCodes = (budgetCodeResolutions || []).filter((r) => r.kind === 'unknown')

  const allAmbiguousResolved = ambiguous.every((a) => manualPersonSelections[a.raw])
  const allUnknownHandled = unknownCodes.every((c) => skippedCodes.has(c.rawKod))
  const canImport = items.length > 0 && allAmbiguousResolved && allUnknownHandled

  return (
    <div className="space-y-5">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* HERO — pasztorális köszöntő                                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-[1.75rem] bg-card p-6 shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-border">
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
          style={{ background: 'color-mix(in oklab, var(--accent) 30%, transparent)' }}
        />
        <div
          className="pointer-events-none absolute -left-8 bottom-0 h-32 w-32 rounded-full blur-3xl"
          style={{ background: 'color-mix(in oklab, var(--primary) 25%, transparent)' }}
        />

        <p className="relative text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/80">
          Mit látunk a fájlban
        </p>
        <h2 className="relative mt-2 font-serif text-2xl text-foreground sm:text-[1.65rem]">
          {analysis.rows!.length} sor a Kassza fülön — nézd át, és egy
          gombnyomással mehet
        </h2>
        <p className="relative mt-2 text-sm text-muted-foreground">
          {fileName} · A wizard {items.length} tételt épített fel, ami azonnal
          mehet a könyvelésbe.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 4 KPI KÁRTYA — ezt számol a rendszer                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigKpi
          label="Bevétel"
          value={stats.income}
          subValue={`${totalIncomeAmount.toLocaleString('hu-HU', {
            maximumFractionDigits: 2,
          })} RON`}
          gradient="from-emerald-500 to-green-600"
          icon={<ArrowDownToLine className="size-5" />}
        />
        <BigKpi
          label="Kiadás"
          value={stats.expense}
          subValue={`${totalExpenseAmount.toLocaleString('hu-HU', {
            maximumFractionDigits: 2,
          })} RON`}
          gradient="from-rose-500 to-red-600"
          icon={<ArrowUpFromLine className="size-5" />}
        />
        <BigKpi
          label="Befizetők"
          value={(donorResolutions || []).filter((d) => d.status === 'resolved').length}
          subValue={`tagnyilvántartásból azonosítva`}
          gradient="from-blue-500 to-indigo-600"
          icon={<UserCheck className="size-5" />}
        />
        <BigKpi
          label="Cégek"
          value={companies.length}
          subValue={`szervezet az adott évben`}
          gradient="from-violet-500 to-purple-600"
          icon={<Building2 className="size-5" />}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MEGFELELTETÉSI MAGYARÁZAT — mit csinál a rendszer                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="rounded-[1.75rem] bg-card p-6 ring-1 ring-border">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-serif text-lg text-foreground">
              Hogyan felelteti meg a rendszer
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Az alábbi 4 lépéssel rögzítjük a tételeket. Minden automatikusan
              megy — csak akkor kérdezünk, ha bizonytalan a párosítás.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <ExplainStep
            number={1}
            tone="emerald"
            icon={<ArrowDownToLine className="size-4" />}
            title={`${stats.income} bevételi tétel`}
            description={`A "Bev. - Összeg" oszlop pozitív értékei a "befizetés" táblába kerülnek, a "Bevétel - Költ.vet. név" oszlop kategóriához rendelve.`}
          />
          <ExplainStep
            number={2}
            tone="rose"
            icon={<ArrowUpFromLine className="size-4" />}
            title={`${stats.expense} kiadási tétel`}
            description={`A "Kiad. - Összeg" oszlop pozitív értékei a "kiadás" táblába kerülnek, a "Kiadás - költ.vet. név" oszlop kategóriához rendelve.`}
          />
          <ExplainStep
            number={3}
            tone="blue"
            icon={<UserCheck className="size-4" />}
            title="Befizető-azonosítás"
            description={`A "Név" oszlopban szereplő személyeket a tagnyilvántartásban keressük (családnév + keresztnév + ház- és lánykori név alapján). A férjes-neveket ("Beder Győzőné Elvira") automatikusan szétbontjuk.`}
          />
          <ExplainStep
            number={4}
            tone="violet"
            icon={<Building2 className="size-4" />}
            title="Cég-felismerés"
            description={`A "SRL", "KFT", "S.A." és más céges végződésű forrásokat szervezetként kezeljük — a "befizetés/kiadás" rekordban szöveges forrásként (id_szemely = NULL) jegyezzük.`}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* AMBIGUOUS BEFIZETŐK — csak ha vannak                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {ambiguous.length > 0 && (
        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50/40 p-6">
          <div className="flex items-start gap-3">
            <HelpCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-serif text-lg text-amber-900">
                Erre a {ambiguous.length} befizetőre több jelölt is illik
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Válaszd ki, melyik tagnyilvántartási rekordhoz tartoznak. A
                többi befizetőt automatikusan azonosítottuk.
              </p>
            </div>
            {allAmbiguousResolved && (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            )}
          </div>

          <div className="mt-4 space-y-3">
            {ambiguous.map((d) => (
              <AmbiguousCard
                key={d.raw}
                resolution={d}
                selected={manualPersonSelections[d.raw] || null}
                onSelect={(id) => onManualPersonSelectionChange(d.raw, id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ISMERETLEN KÓDOK — csak ha vannak                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {unknownCodes.length > 0 && (
        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50/40 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-serif text-lg text-amber-900">
                {unknownCodes.length} ismeretlen költségvetési kód
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Ezek a kódok nincsenek a gyülekezet nyilvántartásában. Pipáld ki
                őket a kihagyáshoz, vagy lépj vissza a forrás-fájl javításához.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {unknownCodes.map((c) => (
              <label
                key={c.rawKod}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-card p-3 ring-1 ring-amber-100 transition hover:bg-amber-50/60"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={skippedCodes.has(c.rawKod)}
                    onChange={() => onSkipCodeToggle(c.rawKod)}
                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-mono text-sm font-semibold text-amber-900">
                    {c.rawKod}
                  </span>
                  <span className="text-xs text-amber-700">
                    {c.occurrenceCount} sor
                  </span>
                </div>
                {skippedCodes.has(c.rawKod) && (
                  <span className="text-xs font-semibold text-emerald-700">
                    ✓ Kihagyva
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TÉTELEK CSOPORTOSÍTVA HÓNAPOK SZERINT                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <ItemsByMonth items={items} showMore={showMore} setShowMore={setShowMore} />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CÉGEK LISTÁJA                                                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {companies.length > 0 && (
        <CompaniesList companies={companies} />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MONETAR DIAGNOSZTIKA                                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {monetarDiagnostic && <MonetarPanel diagnostic={monetarDiagnostic} />}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* KIHAGYOTT SOROK ÖSSZEFOGLALÓJA (ha van)                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {skippedReasons.length > 0 && (
        <SkippedReasonsPanel skippedReasons={skippedReasons} />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* IMPORT GOMB                                                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-50 to-teal-50 p-6 ring-1 ring-emerald-200">
        <div className="flex items-start gap-3">
          <PlayCircle className="mt-0.5 size-6 shrink-0 text-emerald-700" />
          <div className="flex-1">
            <p className="font-serif text-xl text-emerald-900">
              {items.length} tétel mehet a könyvelésbe
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Ha minden rendben van, kattints az "Importálom" gombra. A
              műveletet **nem lehet a wizardon belül visszavonni** — később
              csak egyenként, a tranzakciók fülön sztornózhatod.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={isImporting}
            className="rounded-full text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="mr-1.5 size-4" />
            Másik fájlt választok
          </Button>

          <Button
            type="button"
            onClick={onConfirmImport}
            disabled={!canImport || isImporting}
            size="lg"
            className="rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 px-8 text-white shadow-md hover:from-emerald-700 hover:to-teal-700"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Importálok…
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 size-5" />
                Importálom mind ({items.length} tétel)
              </>
            )}
          </Button>
        </div>

        {!canImport && !isImporting && (
          <p className="mt-3 text-center text-xs text-amber-800">
            {!allAmbiguousResolved && 'Választani kell minden ambiguous befizetőre. '}
            {!allUnknownHandled && 'Minden ismeretlen kódot meg kell jelölni. '}
            {items.length === 0 && 'Nincs importálható tétel. '}
          </p>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// BigKpi — gradient ikon + nagy szám
// ════════════════════════════════════════════════════════════════════════

interface BigKpiProps {
  label: string
  value: number
  subValue: string
  gradient: string
  icon: React.ReactNode
}

function BigKpi({ label, value, subValue, gradient, icon }: BigKpiProps) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <div
          className={`flex size-9 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-md`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{subValue}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ExplainStep — magyarázó sor a "Hogyan felelteti meg" panelben
// ════════════════════════════════════════════════════════════════════════

interface ExplainStepProps {
  number: number
  tone: 'emerald' | 'rose' | 'blue' | 'violet'
  icon: React.ReactNode
  title: string
  description: string
}

function ExplainStep({ number, tone, icon, title, description }: ExplainStepProps) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }
  return (
    <div className="flex items-start gap-3 rounded-xl bg-card/40 p-3">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-foreground/5 text-xs font-bold text-muted-foreground">
          {number}
        </span>
        <span className={`flex size-9 items-center justify-center rounded-xl ring-1 ${toneClass[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// AmbiguousCard — ambiguous donor választó
// ════════════════════════════════════════════════════════════════════════

interface AmbiguousCardProps {
  resolution: DonorResolution
  selected: string | null
  onSelect: (id: string) => void
}

function AmbiguousCard({ resolution, selected, onSelect }: AmbiguousCardProps) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{resolution.raw}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {resolution.occurrenceCount} sor a Kasszában ·{' '}
            {resolution.candidates?.length || 0} jelölt
          </p>
        </div>
        {selected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-3" />
            Kiválasztva
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {resolution.candidates?.map((c) => {
          const isPicked = selected === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`rounded-xl border p-3 text-left transition ${
                isPicked
                  ? 'border-emerald-300 bg-emerald-50/80 shadow-md'
                  : 'border-border bg-card hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}
            >
              <p className={`text-sm font-semibold ${isPicked ? 'text-emerald-700' : 'text-foreground'}`}>
                {c.csaladnev || '?'} {c.k_nev || '?'}
                {c.szcs_nev && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (sz: {c.szcs_nev})
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
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

// ════════════════════════════════════════════════════════════════════════
// ItemsByMonth — havonta csoportosított tétel-lista
// ════════════════════════════════════════════════════════════════════════

const HUNGARIAN_MONTHS = [
  'Január',
  'Február',
  'Március',
  'Április',
  'Május',
  'Június',
  'Július',
  'Augusztus',
  'Szeptember',
  'Október',
  'November',
  'December',
]

interface ItemsByMonthProps {
  items: FinanceImportItem[]
  showMore: boolean
  setShowMore: (v: boolean) => void
}

function ItemsByMonth({ items, showMore, setShowMore }: ItemsByMonthProps) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => {
    const map = new Map<string, FinanceImportItem[]>()
    for (const item of items) {
      const key = item.datum.slice(0, 7) // YYYY-MM
      const arr = map.get(key) || []
      arr.push(item)
      map.set(key, arr)
    }
    // Rendezés dátum szerint (régitől frissig)
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  const toggleMonth = (key: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50/40 p-6 text-amber-900">
        <p className="flex items-start gap-2 font-serif text-lg">
          <AlertTriangle className="mt-1 size-5 shrink-0" />
          Nincs importálható tétel
        </p>
        <p className="mt-1 text-sm">
          Ellenőrizd a forrás-fájlt, és lépj vissza, ha szükséges.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.75rem] bg-card p-6 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-lg text-foreground">Importálandó tételek</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Hónapok szerint csoportosítva. Kattints egy hónapra, hogy lásd a
            tételeket.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showMore) {
              setOpenMonths(new Set())
            } else {
              setOpenMonths(new Set(grouped.map(([key]) => key)))
            }
            setShowMore(!showMore)
          }}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          {showMore ? 'Mind csukni' : 'Mind nyitni'}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {grouped.map(([monthKey, monthItems]) => {
          const [year, monthNum] = monthKey.split('-')
          const monthName = HUNGARIAN_MONTHS[parseInt(monthNum, 10) - 1] || monthKey
          const isOpen = openMonths.has(monthKey)
          const incomeCount = monthItems.filter((i) => i.kind === 'income').length
          const expenseCount = monthItems.filter((i) => i.kind === 'expense').length

          return (
            <div
              key={monthKey}
              className="overflow-hidden rounded-xl bg-card/60 ring-1 ring-border"
            >
              <button
                type="button"
                onClick={() => toggleMonth(monthKey)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 transition hover:bg-emerald-50/30"
              >
                <div className="flex items-center gap-3 text-left">
                  {isOpen ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium text-foreground">
                      {monthName} {year}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {monthItems.length} tétel
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {incomeCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      <ArrowDownToLine className="size-3" />
                      {incomeCount}
                    </span>
                  )}
                  {expenseCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      <ArrowUpFromLine className="size-3" />
                      {expenseCount}
                    </span>
                  )}
                </div>
              </button>
              {isOpen && (
                <div className="divide-y divide-border border-t border-border">
                  {monthItems.map((item, idx) => (
                    <ItemRow key={idx} item={item} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ItemRow — egy bevétel/kiadás egy soros kártyán
// ════════════════════════════════════════════════════════════════════════

function ItemRow({ item }: { item: FinanceImportItem }) {
  const isIncome = item.kind === 'income'
  const Icon = isIncome ? ArrowDownToLine : ArrowUpFromLine
  const iconBg = isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
  const amountColor = isIncome ? 'text-emerald-700' : 'text-rose-700'
  const sign = isIncome ? '+' : '−'

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-card/40">
      <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.forrasa || '— névtelen —'}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.datum}
          {item.iratszam && ` · iratszám ${item.iratszam}`}
          {item.szemelyId ? (
            <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-600">
              · <UserCheck className="size-3" /> tag
            </span>
          ) : null}
        </p>
      </div>
      <p className={`shrink-0 font-mono text-sm font-bold ${amountColor}`}>
        {sign}
        {item.osszeg.toLocaleString('hu-HU', { maximumFractionDigits: 2 })} RON
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// CompaniesList — egyedi cégek listája
// ════════════════════════════════════════════════════════════════════════

function CompaniesList({ companies }: { companies: DonorResolution[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-[1.75rem] bg-card ring-1 ring-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 p-6 transition hover:bg-violet-50/30"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md">
            <Building2 className="size-5" />
          </div>
          <div className="text-left">
            <p className="font-serif text-lg text-foreground">
              {companies.length} cég/intézmény az adott évben
            </p>
            <p className="text-sm text-muted-foreground">
              Kattints a teljes listáért — szervezetekhez NEM rendelünk
              tagnyilvántartási rekordot, csak szöveges forrásként mentjük
            </p>
          </div>
        </div>
        {open ? (
          <ChevronDown className="size-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="border-t border-border">
          <div className="divide-y divide-border">
            {companies.map((c) => (
              <div
                key={c.raw}
                className="flex items-center justify-between gap-3 px-6 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="size-4 shrink-0 text-violet-500" />
                  <p className="text-sm font-medium text-foreground">{c.raw}</p>
                </div>
                <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                  {c.occurrenceCount} sor
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// MonetarPanel — kasszaegyenleg-ellenőrzés
// ════════════════════════════════════════════════════════════════════════

function MonetarPanel({ diagnostic }: { diagnostic: MonetarDiagnostic }) {
  const hasWarnings = diagnostic.warnings.length > 0
  const elteres = diagnostic.elteresKasszaval

  return (
    <div
      className={`rounded-[1.75rem] p-6 ring-1 ${
        hasWarnings
          ? 'bg-amber-50/40 ring-amber-200'
          : 'bg-emerald-50/40 ring-emerald-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            hasWarnings ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {hasWarnings ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
        </div>
        <div className="flex-1">
          <p className={`font-serif text-lg ${hasWarnings ? 'text-amber-900' : 'text-emerald-900'}`}>
            Kasszaegyenleg-ellenőrzés
          </p>
          <p className={`mt-1 text-sm ${hasWarnings ? 'text-amber-800' : 'text-emerald-800'}`}>
            {hasWarnings
              ? 'Eltérés található a Monetar fülön szereplő egyenleg és a Kassza-fülből kalkulált záróegyenleg között.'
              : 'A Monetar fülön szereplő egyenleg pontosan stimmel a Kassza-fülből kalkulált záróegyenleggel.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DiagItem
          label="Kalkulált záró-egyenleg"
          value={`${diagnostic.kalkulaltZaroEgyenleg.toFixed(2)} RON`}
        />
        <DiagItem
          label="Monetar kasszaegyenleg"
          value={
            diagnostic.monetarKasszaEgyenleg !== null
              ? `${diagnostic.monetarKasszaEgyenleg.toFixed(2)} RON`
              : 'nincs adat'
          }
        />
        <DiagItem
          label="Eltérés"
          value={
            elteres !== null
              ? `${elteres > 0 ? '+' : ''}${elteres.toFixed(2)} RON`
              : 'n/a'
          }
        />
      </div>

      {hasWarnings && (
        <ul className="mt-4 space-y-1.5 text-xs text-amber-900">
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

function DiagItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// SkippedReasonsPanel — kihagyott sorok bontása
// ════════════════════════════════════════════════════════════════════════

function SkippedReasonsPanel({
  skippedReasons,
}: {
  skippedReasons: Array<{ rowIndex: number; reason: string }>
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of skippedReasons) {
      map.set(r.reason, (map.get(r.reason) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [skippedReasons])

  return (
    <div className="rounded-[1.75rem] bg-card p-6 ring-1 ring-border">
      <div className="flex items-start gap-3">
        <UserX className="mt-0.5 size-5 shrink-0 text-slate-500" />
        <div>
          <p className="font-serif text-lg text-foreground">
            {skippedReasons.length} sor kimarad
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ezek a sorok valamilyen okból nem kerülnek be — pl. üres tétel,
            vagy belső mozgás (Kassza ↔ Bank), ami a v1-ben még nem támogatott.
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {grouped.map(([reason, count]) => (
          <li
            key={reason}
            className="flex items-center justify-between gap-3 rounded-xl bg-card/40 p-3 ring-1 ring-border"
          >
            <span className="text-sm text-foreground">{reason}</span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
