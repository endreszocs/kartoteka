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

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
import { ManualTagSearch } from '@/components/finance/finance-import/shared/manual-tag-search'
import { shouldResolvePerson } from '@/lib/import/person-scope-config'

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
  /** B1: mely ambiguous befizetők lettek automatikusan elosztva (1×/év szabály). */
  autoDistributedDonors?: Set<string>
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
  autoDistributedDonors,
  isImporting,
  onBack,
  onConfirmImport,
}: ReviewStepProps) {
  const [showMore, setShowMore] = useState(false)
  const [showAutoAssigned, setShowAutoAssigned] = useState(false)

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
  // B1: az „1×/év" szabály alapján AUTOMATIKUSAN hozzárendelt befizetők külön kezelve —
  // ezek nem terhelik a „kézi egyeztetésre váró" listát, csak ellenőrizni kell őket.
  const autoAmbiguous = ambiguous.filter((d) => autoDistributedDonors?.has(d.raw))
  const manualAmbiguous = ambiguous.filter((d) => !autoDistributedDonors?.has(d.raw))

  // A befizető-stringhez tartozó tényleges befizetés-sorok (nyugta/dátum/összeg) — a táblázathoz.
  const paymentsByDonor = new Map<string, ClassifiedKasszaRow[]>()
  for (const r of analysis?.rows || []) {
    if (!r.donorString) continue
    const arr = paymentsByDonor.get(r.donorString) || []
    arr.push(r)
    paymentsByDonor.set(r.donorString, arr)
  }

  // ── DUPLIKÁCIÓ-ŐR: egy tag évente EGYSZER fizet egyházfenntartást (101.01) ──
  // Ha a hozzárendelések alapján ugyanaz a tag 2+ egyházfenntartási befizetést kapna,
  // azt piros figyelmeztetéssel jelezzük (a lelkész véletlenül kétszer rendelte ugyanahhoz).
  const EGYHF_KOD = '101.01'
  const selectedPersonOf = (d: DonorResolution): string | null => {
    if (d.status === 'resolved') return d.szemelyId ?? null
    if (d.status === 'ambiguous') return manualPersonSelections[d.raw] || null
    return null
  }
  // A duplikáció-szabály FINOMÍTVA (felhasználói meglátás alapján):
  //  - Egy donor-string TÖBB egyházfenntartása (családtagok egy néven, RÉSZLETFIZETÉS,
  //    vagy ELŐZŐ ÉVI hátralék) NEM duplikáció — ugyanaz a befizető.
  //  - Az egyházfenntartást FIZETÉSI ÉVENKÉNT (fizetettev) követjük: ha valaki a tavalyi és
  //    az idei járulékot is fizeti, az KÉT KÜLÖN év → legitim.
  //  - Csak az a duplikáció, ha UGYANARRA AZ ÉVRE 2+ KÜLÖNBÖZŐ befizető-string kerül
  //    UGYANAHHOZ a taghoz (valódi téves dupla-hozzárendelés, pl. „Józsa Béla" + „Ifj. Józsa Béla").
  // KÖNYVELÉSI ÉV (accounting year): a tényleges „Befizetett év" (XML-ből, fizetettevOverride),
  // és csak ha az nincs, akkor a könyvelés dátumának éve. Egy 2024-12-31-én kelt, de a 2025-ös
  // évre szóló befizetés (pl. 19. nyugta, Szőcs Endre) így helyesen 2025-nek számít.
  const accYear = (p: { fizetettevOverride?: number | null; datum?: string | null }): string =>
    p.fizetettevOverride != null ? String(p.fizetettevOverride) : (p.datum || '').slice(0, 4)
  const egyhfPaymentsOf = (raw: string) =>
    (paymentsByDonor.get(raw) || []).filter((p) => p.budgetCode === EGYHF_KOD)
  // kulcs: `${szemelyId}|${fizetettev}` → a hozzá tartozó KÜLÖNBÖZŐ befizető-stringek
  const egyhfDonorsByPersonYear = new Map<string, Set<string>>()
  for (const d of donorResolutions || []) {
    const pid = selectedPersonOf(d)
    if (!pid) continue
    const years = new Set(
      egyhfPaymentsOf(d.raw)
        .map((p) => accYear(p))
        .filter(Boolean),
    )
    for (const y of years) {
      const key = `${pid}|${y}`
      const set = egyhfDonorsByPersonYear.get(key) ?? new Set<string>()
      set.add(d.raw)
      egyhfDonorsByPersonYear.set(key, set)
    }
  }
  // Az ütköző (person, év) párok + a hozzájuk tartozó befizető-nevek a figyelmeztetéshez.
  const duplicateConflicts = [...egyhfDonorsByPersonYear.entries()]
    .filter(([, s]) => s.size >= 2)
    .map(([key, s]) => {
      const pid = key.split('|')[0]
      const year = key.split('|')[1]
      const raws = [...s]
      // A tag neve a jelöltekből (a megjelenítéshez)
      let personName = pid
      for (const raw of raws) {
        const d = (donorResolutions || []).find((x) => x.raw === raw)
        const cand = d?.candidates?.find((cc) => cc.id === pid)
        if (cand) {
          personName = `${cand.csaladnev ?? ''} ${cand.k_nev ?? ''}`.trim() || pid
          break
        }
      }
      return { pid, year, raws, personName }
    })
  const duplicateEgyhfPersonIds = new Set(duplicateConflicts.map((c) => c.pid))

  // ── ÉV-ELTÉRÉS ŐR ──
  // A KÖNYVELÉSI ÉV-et nézzük (Befizetett év, ha az XML megadta — különben a dátum éve).
  // Megkeressük a túlnyomó évet, és jelezzük azokat a sorokat, amelyek dátuma ettől eltér,
  // DE NINCS rájuk XML-ből származó „Befizetett év". Ha az XML kimondja az évet (pl. a
  // 2024-12-31-én kelt, de 2025-re szóló 19. nyugta), az SZÁNDÉKOS → nem jelezzük hibának.
  const bookableRows = (analysis?.rows || []).filter((r) => r.kind !== 'skip' && r.datum)
  const yearCounts = new Map<string, number>()
  for (const r of bookableRows) {
    const y = accYear(r)
    if (y) yearCounts.set(y, (yearCounts.get(y) || 0) + 1)
  }
  const predominantYear =
    [...yearCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const yearMismatchRows = predominantYear
    ? bookableRows.filter(
        (r) => r.fizetettevOverride == null && r.datum!.slice(0, 4) !== predominantYear,
      )
    : []
  const companies = (donorResolutions || [])
    .filter((d) => d.status === 'company')
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
  const unknownCodes = (budgetCodeResolutions || []).filter((r) => r.kind === 'unknown')

  // FÁZIS 2b — „Tag nem található", DE személy-köthető kategóriában (egyházfenntartás,
  // adomány, bérlet stb.): a felhasználó KÉZZEL párosíthatja (szabad-szöveges kereső).
  // A cég / kollektív / nem-scope sorok ide NEM kerülnek (nincs fölösleges zaj).
  const notFoundScopeDonors = (donorResolutions || []).filter((d) => {
    if (d.status !== 'not-found' && d.status !== 'unparsed') return false
    const rows = paymentsByDonor.get(d.raw) || []
    return rows.some((r) => r.kind === 'income' && shouldResolvePerson(r.budgetCode))
  })

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
      {/* ÉV-ELTÉRÉS — más évi nyugta az aktuális könyvelési évben            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {yearMismatchRows.length > 0 && predominantYear && (
        <div className="rounded-[1.75rem] border border-orange-300 bg-orange-50/70 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-orange-600" />
            <div className="flex-1">
              <p className="font-serif text-lg text-orange-900">
                {yearMismatchRows.length} tétel NEM a(z) {predominantYear}. évre esik
              </p>
              <p className="mt-1 text-sm text-orange-800">
                Az alábbi tételek <strong>dátuma</strong> eltér a fájl túlnyomó évétől
                ({predominantYear}), és nincs hozzájuk a <strong>bevételek XML-ből</strong> származó
                <strong> Befizetett év</strong> adat. Gyakori eset: egy <strong>év végén</strong> (pl.
                dec. 31.) befizetett, de a <strong>következő évre</strong> szóló járulék. Ha ez a
                helyzet, töltsd fel a
                bevételek XML referenciát is — abból a rendszer a helyes évet veszi (a már egyértelmű
                évűeket nem is jelzi). Ha tényleg más évről van szó, ellenőrizd a forrásban, és ha
                kell, hagyd ki őket az importból.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-orange-900">
                {yearMismatchRows.slice(0, 12).map((r, i) => (
                  <li key={i}>
                    <strong>{r.datum}</strong> · iratszám {r.iratszam || '—'} ·{' '}
                    {typeof r.amount === 'number' ? `${r.amount.toLocaleString('hu-HU')} RON` : '—'}
                    {r.donorString ? ` · ${r.donorString}` : ''}
                  </li>
                ))}
                {yearMismatchRows.length > 12 && (
                  <li className="text-orange-700">… és további {yearMismatchRows.length - 12} tétel.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* DUPLIKÁCIÓ-FIGYELMEZTETÉS — ugyanaz a tag, ugyanaz az év, 2+ név   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {duplicateConflicts.length > 0 && (
        <div className="rounded-[1.75rem] border border-red-300 bg-red-50/70 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="font-serif text-lg text-red-800">
                {duplicateConflicts.length} esetben ugyanaz a tag kétszer fizetne
                egyházfenntartást ugyanarra az évre
              </p>
              <p className="mt-1 text-sm text-red-700">
                Egy személy évente egyszer fizet egyházfenntartást. Az alábbi befizetők
                <strong> ugyanahhoz a taghoz</strong> lettek rendelve. <strong>Nézd meg a
                neveknél a CÍMET:</strong> ha a két befizető máshol lakik (pl. „… - Asztalos 160&rdquo;
                és „… - Templom 235&rdquo;), akkor szinte biztosan KÉT KÜLÖN személyről van szó — ilyenkor
                az egyiket rendeld másik (a saját címén lakó) taghoz, vagy hagyd tag nélkül, ha még
                nincs a nyilvántartásban. Ugyanazon a címen+néven (pl. „Józsa Béla&rdquo; / „Ifj. Józsa
                Béla&rdquo;) lehet apa/fiú is. <em>A részletfizetés és az előző évi (hátralék) befizetés
                ugyanazon a néven NEM számít duplikációnak.</em>
              </p>
              <ul className="mt-3 space-y-2 text-xs text-red-800">
                {duplicateConflicts.slice(0, 10).map((c) => (
                  <li
                    key={`${c.pid}-${c.year}`}
                    className="rounded-lg bg-white/70 p-2.5 ring-1 ring-red-100"
                  >
                    <p className="font-semibold text-red-900">
                      ⚠ <strong>{c.personName}</strong> — {c.year}. évre {c.raws.length} befizető van
                      hozzárendelve:
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {c.raws.map((raw) => {
                        const parts = raw.split(/\s+[-–—]\s+/)
                        const name = parts[0]?.trim() || raw
                        const cim = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null
                        return (
                          <li key={raw} className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-800">{name}</span>
                            {cim ? (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                                📍 {cim}
                              </span>
                            ) : (
                              <span className="text-slate-400">(nincs cím)</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-red-600">
                      Ha a címek eltérnek → két külön személy: rendeld az egyiket a saját címén lakó
                      taghoz (lentebb a Tag nem található / Több tag résznél), vagy hagyd tag nélkül.
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* AMBIGUOUS BEFIZETŐK — KÉZI döntést igénylők (prominens)            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {manualAmbiguous.length > 0 && (
        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50/40 p-6">
          <div className="flex items-start gap-3">
            <HelpCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-serif text-lg text-amber-900">
                Erre a {manualAmbiguous.length} befizetőre kézi döntés kell
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Ezeket az „1×/év&rdquo; automatikus elosztás nem tudta egyértelműen feloldani (minden
                lehetséges tagjuk már más befizetéshez került, vagy nincs megkülönböztető adat).
                Válaszd ki a megfelelő tagnyilvántartási rekordot — a 📍 cím és a befizetés
                részletei segítenek.
              </p>
            </div>
            {manualAmbiguous.every((a) => manualPersonSelections[a.raw]) && (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            )}
          </div>

          <div className="mt-4 space-y-3">
            {manualAmbiguous.map((d) => (
              <AmbiguousCard
                key={d.raw}
                resolution={d}
                payments={paymentsByDonor.get(d.raw) || []}
                selected={manualPersonSelections[d.raw] || null}
                onSelect={(id) => onManualPersonSelectionChange(d.raw, id)}
                autoDistributed={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAG NEM TALÁLHATÓ — kézi párosítás (FÁZIS 2b)                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {notFoundScopeDonors.length > 0 && (
        <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50/40 p-5">
          <div className="flex items-start gap-3">
            <UserX className="mt-0.5 size-5 shrink-0 text-rose-600" />
            <div className="flex-1">
              <p className="font-serif text-lg text-rose-900">
                {notFoundScopeDonors.length} befizetőhöz nem találtunk tagot
              </p>
              <p className="mt-1 text-sm text-rose-800">
                Ezek a befizetők személy-köthető kategóriában vannak (pl. egyházfenntartás, adomány),
                de a tagnyilvántartásban nem találtuk meg őket. Keresd meg kézzel — vagy hagyd üresen,
                ekkor a befizetés tag-kapcsolat nélkül kerül be.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {notFoundScopeDonors.map((d) => {
              const payments = paymentsByDonor.get(d.raw) || []
              const nameQuery = (d.raw.split(/\s+[-–—]\s+/)[0] || d.raw).trim()
              const picked = manualPersonSelections[d.raw]
              return (
                <div key={d.raw} className="rounded-xl bg-card p-4 ring-1 ring-rose-100">
                  <p className="text-sm font-medium text-foreground">{d.raw}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {payments.length} tétel a Kasszában
                    {picked ? ' · ✓ kézzel párosítva' : ''}
                  </p>
                  <DonorPayments payments={payments} />
                  <ManualTagSearch
                    initialQuery={nameQuery}
                    currentId={picked ? Number(picked) : undefined}
                    onPick={(id) => onManualPersonSelectionChange(d.raw, String(id))}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* AUTOMATIKUSAN ELOSZTOTT BEFIZETŐK — összecsukva, ellenőrizhető     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {autoAmbiguous.length > 0 && (
        <div className="rounded-[1.75rem] border border-teal-200 bg-teal-50/40 p-5">
          <button
            type="button"
            onClick={() => setShowAutoAssigned((v) => !v)}
            className="flex w-full items-start gap-3 text-left"
          >
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-600" />
            <div className="flex-1">
              <p className="font-serif text-lg text-teal-900">
                {autoAmbiguous.length} befizetőt automatikusan hozzárendeltünk (1×/év szabály)
              </p>
              <p className="mt-1 text-sm text-teal-800">
                Ahol egy címen/néven több tag is illett, a befizetéseket a „egy személy évente
                egyszer fizet&rdquo; szabály + cím-egyezés alapján KÜLÖN-KÜLÖN taghoz rendeltük, így
                senkinek nem látszik elmaradása. Ezekkel nem kell egyesével foglalkoznod —
                {showAutoAssigned ? ' csukd be, ha rendben.' : ' kattints az ellenőrzéshez.'}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700">
              {showAutoAssigned ? 'Bezár' : 'Ellenőrzés'}
            </span>
          </button>

          {showAutoAssigned && (
            <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-teal-100">
              <table className="min-w-full text-xs">
                <thead className="bg-teal-50/70 text-left text-teal-800">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Befizető (fájl)</th>
                    <th className="px-3 py-2 font-semibold">Befizetés(ek)</th>
                    <th className="px-3 py-2 font-semibold">Hozzárendelt tag — módosítható</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-50">
                  {autoAmbiguous.map((d) => {
                    const selectedId = manualPersonSelections[d.raw] || ''
                    const payments = paymentsByDonor.get(d.raw) || []
                    const isDup = !!selectedId && duplicateEgyhfPersonIds.has(selectedId)
                    return (
                      <tr key={d.raw} className={isDup ? 'bg-red-50/70' : 'bg-white'}>
                        <td className="px-3 py-2 align-top font-medium text-slate-700">
                          {d.raw}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-600">
                          {payments.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {payments.map((p, i) => {
                                const isEgyhf = p.budgetCode === EGYHF_KOD
                                return (
                                  <li key={i} className="flex flex-wrap items-center gap-1">
                                    <span className="font-mono">{p.iratszam || '—'}</span>
                                    <span>· {p.datum ?? '—'} ·</span>
                                    <span className="font-medium">
                                      {typeof p.amount === 'number'
                                        ? `${p.amount.toLocaleString('hu-HU')} RON`
                                        : '—'}
                                    </span>
                                    {p.celNev && (
                                      <span
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                          isEgyhf
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {isEgyhf ? '⛪ ' : ''}
                                        {p.celNev}
                                      </span>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select
                            className={`w-full rounded-md border bg-white p-1.5 text-xs ${
                              isDup ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-300'
                            }`}
                            value={selectedId}
                            onChange={(e) => onManualPersonSelectionChange(d.raw, e.target.value)}
                          >
                            <option value="">— Válassz —</option>
                            {d.candidates?.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.csaladnev || '?'} {c.k_nev || '?'}
                                {c.szcs_nev ? ` (sz: ${c.szcs_nev})` : ''}
                                {c.cim ? ` — 📍 ${c.cim}` : ''}
                              </option>
                            ))}
                          </select>
                          {isDup && (
                            <p className="mt-1 text-[11px] font-semibold text-red-600">
                              ⚠ Ez a tag már fizetett egyházfenntartást erre az évre — válassz másikat!
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
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
              Ha minden rendben van, kattints az „Importálom&rdquo; gombra. A
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
// DonorPayments — egy befizető tételei (év / összeg / nyugta / kategória)
// Az egyeztetéshez: a felhasználó lássa, mit köt épp egy taghoz.
// ════════════════════════════════════════════════════════════════════════

function DonorPayments({ payments }: { payments: ClassifiedKasszaRow[] }) {
  if (!payments || payments.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 rounded-lg bg-slate-50/80 p-2 text-[11px] text-slate-600 ring-1 ring-slate-100">
      {payments.map((p, i) => {
        const ev = p.fizetettevOverride ?? (p.datum ? p.datum.slice(0, 4) : null)
        const isEgyhf = p.budgetCode === '101.01'
        return (
          <li key={i} className="flex flex-wrap items-center gap-1.5">
            {ev && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                {ev}. évre
              </span>
            )}
            <span className="font-semibold text-slate-700">
              {typeof p.amount === 'number' ? `${p.amount.toLocaleString('hu-HU')} RON` : '—'}
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-mono">nyugta {p.iratszam || '—'}</span>
            {p.datum && <span className="text-slate-400">· {p.datum}</span>}
            {p.celNev && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  isEgyhf ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isEgyhf ? '⛪ ' : ''}
                {p.celNev}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ════════════════════════════════════════════════════════════════════════
// AmbiguousCard — ambiguous donor választó
// ════════════════════════════════════════════════════════════════════════

interface AmbiguousCardProps {
  resolution: DonorResolution
  selected: string | null
  onSelect: (id: string) => void
  /** A befizető tételei (az egyeztetéshez — év / összeg / nyugta / kategória). */
  payments?: ClassifiedKasszaRow[]
  /** B1: igaz, ha a kiválasztott jelölt az „1×/év" auto-elosztásból származik. */
  autoDistributed?: boolean
}

function AmbiguousCard({ resolution, selected, onSelect, payments, autoDistributed }: AmbiguousCardProps) {
  // A Kassza-fájlból kinyert utca + házszám — ezt vetjük össze a jelöltek
  // 📍 címével, hogy a felhasználó vizuálisan tudjon dönteni
  const parsedCim =
    resolution.street || resolution.houseNumber
      ? [resolution.street, resolution.houseNumber].filter(Boolean).join(' ')
      : null

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{resolution.raw}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {resolution.occurrenceCount} sor a Kasszában ·{' '}
            {resolution.candidates?.length || 0} jelölt
            {parsedCim && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Kasszában: 📍 {parsedCim}
              </span>
            )}
          </p>
        </div>
        {selected && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              autoDistributed
                ? 'bg-teal-50 text-teal-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            <CheckCircle2 className="size-3" />
            {autoDistributed ? '🔄 Auto-elosztva (ellenőrizd)' : 'Kiválasztva'}
          </span>
        )}
      </div>

      <DonorPayments payments={payments || []} />

      <p className="mt-3 text-xs font-medium text-slate-600">Válaszd ki a megfelelő tagot:</p>
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
              {/* Cím — kulcsfontosságú a vizuális egyeztetéshez */}
              {c.cim && (
                <p className="mt-1 text-[11px] font-medium text-emerald-700">
                  📍 {c.cim}
                </p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {c.sz_datum && `Született: ${c.sz_datum}`}
                {c.sz_datum && c.ferfi !== null && ' · '}
                {c.ferfi !== null && (c.ferfi ? 'Férfi' : 'Nő')}
              </p>
            </button>
          )
        })}
      </div>

      {/* Ha a helyes tag nincs a fenti jelöltek között — szabad-szöveges keresés */}
      <div className="mt-2 border-t border-amber-100 pt-2">
        <ManualTagSearch
          initialQuery={(resolution.raw.split(/\s+[-–—]\s+/)[0] || resolution.raw).trim()}
          currentId={selected ? Number(selected) : undefined}
          onPick={(id) => onSelect(String(id))}
        />
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
