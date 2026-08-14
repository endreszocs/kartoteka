'use client'

/**
 * Számadás véglegesítő wizard — az éves számadás lezárásának lépései.
 *
 * 5 lépéses wizard a lelkésznek:
 *   1. Áttekintés — terv vs tény összegzés
 *   2. Ellenőrzések — auto check-ek (FX revaluation, nyitó egyenleg, kategóriák, stb.)
 *   3. Presbiteri jegyzőkönyv — 2 opció:
 *        A) Kartotéka jegyzőkönyv összekapcsolás (napirendi pont + határozat szám)
 *        B) Manuális beírás (szám + dátum)
 *   4. Megerősítés — összefoglaló, submit
 *   5. Kész — az egyházmegyének beküldve
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  ScrollText,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  listJegyzokonyvekForFinalization,
  runFinalizationChecks,
  type CheckItem,
  type FinalizationChecksResult,
  type JegyzokonyvForFinalization,
} from '@/app/(dashboard)/penzugy/finalization-actions'
import {
  finalizeAccounting,
  finalizeAndSubmitAccounting,
} from '@/app/(dashboard)/penzugy/actions'
import { formatCurrency } from '@/lib/constants/finance'

type WizardStep = 'overview' | 'checks' | 'jegyzokonyv' | 'confirm' | 'done'

/**
 * 2026-08-11 (P1 #2): a check-lista „Javítás" gombjainak navigációja.
 *
 * Két hiba volt egyszerre, ezért maradt a lelkész mind a 8 gombnál a Pénzügy
 * Dashboard fülön:
 *  1. a szerver `/penzugy?tab=…` URL-t adott, amit a /penzugy oldal SOHA nem
 *     olvasott — a fül-váltás kizárólag `#hash` alapú (finance-tabs.tsx
 *     `applyHashToTab`). Ez a finalization-actions.ts-ben javítva.
 *  2. a wizard UGYANAZON az oldalon fut, tehát a `router.push('/penzugy#bank')`
 *     azonos útvonalra mutat: a Next.js ilyenkor `history.pushState`-et hív,
 *     ami NEM vált ki `hashchange` eseményt → a fül-figyelő némán kimaradna.
 *     (Ugyanezt a csapdát kerüli meg a sidebar-adaptive-v4.tsx is.)
 *
 * Ezért azonos útvonalnál a FinanceTabs már meglévő `finance-tab-switch`
 * CustomEvent-jét küldjük: az a valódi füleket átváltja (és a saját effektje
 * frissíti utána az URL hash-t), a `monetary` a lebegő widgetet nyitja.
 * (Az `oblio_ellenorzes` cél 2026-08-15, Endre óta MÁSIK OLDAL:
 * `/dokumentumtar#oblio` — más útvonal, tehát a sima `router.push` ág viszi.)
 * Más útvonalról (védelmi ág) marad a sima `router.push`, ott a lapváltás
 * úgyis kiolvassa a hash-t.
 */
function navigateToFixTarget(router: ReturnType<typeof useRouter>, url: string) {
  const [path, hash] = url.split('#')
  if (typeof window !== 'undefined' && hash && window.location.pathname === path) {
    window.dispatchEvent(new CustomEvent('finance-tab-switch', { detail: hash }))
    return
  }
  router.push(url)
}

type JkvMode = 'kartoteka' | 'manual'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  /** Összegző adatok az áttekintéshez. */
  summary: {
    totalBudgetIncome: number
    totalActualIncome: number
    totalBudgetExpense: number
    totalActualExpense: number
    budgetedBalance: number
    actualBalance: number
    actualIncome: Record<string, number>
    actualExpense: Record<string, number>
  }
  onFinalized?: () => void | Promise<void>
  /** 2026-04-18 SCOPE-AWARE: 'congregation' (default) vagy 'diocese'.
   *  Diocese módban nincs submitDocument hívás (a diocese_annual_reports egy
   *  lépésben tölti ki a submission+finalization mezőket). */
  scope?: 'congregation' | 'diocese'
}

export function AccountingFinalizeWizard({ open, onOpenChange, year, summary, onFinalized, scope = 'congregation' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<WizardStep>('overview')

  // Ellenőrzések állapota
  const [checksLoading, setChecksLoading] = useState(false)
  const [checks, setChecks] = useState<FinalizationChecksResult | null>(null)

  // Jegyzőkönyv
  const [jkvMode, setJkvMode] = useState<JkvMode>('kartoteka')
  const [jkvList, setJkvList] = useState<JegyzokonyvForFinalization[]>([])
  const [jkvLoading, setJkvLoading] = useState(false)
  const [selectedJkvId, setSelectedJkvId] = useState<string>('')
  const [selectedNapirendiId, setSelectedNapirendiId] = useState<string>('')
  const [manualJkvSzam, setManualJkvSzam] = useState('')
  const [manualDatum, setManualDatum] = useState('')

  // Reset a megnyitáskor — queueMicrotask hogy ne legyen setState synchronously in effect
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setStep('overview')
      setChecks(null)
      setChecksLoading(false)
      setJkvMode('kartoteka')
      setJkvList([])
      setJkvLoading(false)
      setSelectedJkvId('')
      setSelectedNapirendiId('')
      setManualJkvSzam('')
      setManualDatum('')
    })
    return () => { cancelled = true }
  }, [open])

  // Ellenőrzések lefuttatása az `checks` lépés első megjelenítésekor
  useEffect(() => {
    if (step !== 'checks' || checks || checksLoading) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setChecksLoading(true)
      void runFinalizationChecks(year).then((res) => {
        if (cancelled) return
        setChecksLoading(false)
        if (res.error) {
          toast.error(res.error)
          return
        }
        if (res.data) setChecks(res.data)
      })
    })
    return () => { cancelled = true }
  }, [step, year, checks, checksLoading])

  // Jegyzőkönyvek lekérdezése az `jegyzokonyv` lépés első megjelenítésekor
  useEffect(() => {
    if (step !== 'jegyzokonyv' || jkvList.length > 0 || jkvLoading) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setJkvLoading(true)
      void listJegyzokonyvekForFinalization(year).then((res) => {
        if (cancelled) return
        setJkvLoading(false)
        if (res.error) {
          toast.error(res.error)
          return
        }
        if (res.data) {
          setJkvList(res.data)
          // Ha nincs egy sem a Kartotékában, automatikusan manual módra váltunk
          if (res.data.length === 0) setJkvMode('manual')
        }
      })
    })
    return () => { cancelled = true }
  }, [step, year, jkvList.length, jkvLoading])

  const selectedJkv = useMemo(
    () => jkvList.find((j) => j.id === selectedJkvId) || null,
    [jkvList, selectedJkvId],
  )

  const selectedNapirendi = useMemo(() => {
    if (!selectedJkv || !selectedNapirendiId) return null
    return selectedJkv.napirendi_pontok.find((n) => n.id === selectedNapirendiId) || null
  }, [selectedJkv, selectedNapirendiId])

  // A határozat szám (ha a napirendi ponthoz tartozik)
  const matchedHatarozat = useMemo(() => {
    if (!selectedJkv || !selectedNapirendiId) return null
    return selectedJkv.hatarozatok.find((h) => h.napirendi_pont_id === selectedNapirendiId) || null
  }, [selectedJkv, selectedNapirendiId])

  // A végső adatok, amiket a lelkész véglegesít
  const finalJkvSzam = useMemo(() => {
    if (jkvMode === 'manual') return manualJkvSzam.trim() || null
    if (matchedHatarozat) return `${matchedHatarozat.sorszam}/${matchedHatarozat.ev}`
    if (selectedJkv) return `${selectedJkv.ules_sorszam}/${selectedJkv.ev}`
    return null
  }, [jkvMode, manualJkvSzam, matchedHatarozat, selectedJkv])

  const finalDatum = useMemo(() => {
    if (jkvMode === 'manual') return manualDatum || null
    return selectedJkv?.datum || null
  }, [jkvMode, manualDatum, selectedJkv])

  function canGoNext(): boolean {
    if (step === 'overview') return true
    if (step === 'checks') return !!checks && !checks.hasBlocker && !checksLoading
    if (step === 'jegyzokonyv') {
      if (jkvMode === 'kartoteka') {
        return !!selectedJkv && !!selectedNapirendiId
      }
      return !!manualJkvSzam.trim() && !!manualDatum
    }
    return false
  }

  function handleNext() {
    if (step === 'overview') setStep('checks')
    else if (step === 'checks') setStep('jegyzokonyv')
    else if (step === 'jegyzokonyv') setStep('confirm')
  }

  function handleBack() {
    if (step === 'checks') setStep('overview')
    else if (step === 'jegyzokonyv') setStep('checks')
    else if (step === 'confirm') setStep('jegyzokonyv')
  }

  function handleFinalize() {
    startTransition(async () => {
      const snapshot = {
        actualIncome: summary.actualIncome,
        actualExpense: summary.actualExpense,
        totalActualIncome: summary.totalActualIncome,
        totalActualExpense: summary.totalActualExpense,
        actualBalance: summary.actualBalance,
        budgetedBalance: summary.budgetedBalance,
        year,
        jegyzokonyviSzam: finalJkvSzam,
        targyalasDatuma: finalDatum,
        jegyzokonyvForras: jkvMode,
        presbiteri_jegyzokonyv_id: jkvMode === 'kartoteka' ? selectedJkvId : null,
        presbiteri_napirendi_pont_id: jkvMode === 'kartoteka' ? selectedNapirendiId : null,
      }

      // 2026-04-18 SCOPE-AWARE + 2026-07-10 (#4/4): ZÁR-ELŐSZÖR sorrend.
      // - Gyülekezeti mód: finalizeAndSubmitAccounting — EGY szerver-akció:
      //   (1) véglegesítés (lock + kanonikus snapshot a lokális záró-adatokba),
      //   (2) beküldés; beküldési hibánál a zárat szerveroldalon visszavonja.
      //   Korábban előbb küldött, aztán zárt — a zárás bukása beküldött-de-nyitott
      //   (elévülő snapshotú) állapotot hagyott.
      // - Diocese mód: CSAK finalizeAccounting (a diocese_annual_reports egy lépésben submission+finalization)
      if (scope === 'congregation') {
        const result = await finalizeAndSubmitAccounting(
          year,
          { jegyzokonyviSzam: finalJkvSzam, targyalasDatuma: finalDatum },
          snapshot,
        )
        if (result.error) {
          toast.error(result.error)
          return
        }
      } else {
        const result = await finalizeAccounting(year, {
          jegyzokonyviSzam: finalJkvSzam,
          targyalasDatuma: finalDatum,
        })
        if (result.error) {
          toast.error(`Véglegesítés sikertelen: ${result.error}`)
          return
        }
      }

      toast.success(
        scope === 'diocese'
          ? 'Egyházmegyei számadás véglegesítve!'
          : 'Számadás véglegesítve és beküldve az egyházmegyének!',
        { duration: 5000 },
      )
      setStep('done')
      if (onFinalized) await onFinalized()
      setTimeout(() => router.refresh(), 500)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[min(1100px,96vw)]
          !h-[92dvh] !max-h-[92dvh]
          overflow-hidden p-0 gap-0
          border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/20
          rounded-2xl
          flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-violet-100 bg-white/70 px-6 py-4 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
              <ScrollText className="size-5" />
            </span>
            <span>
              Számadás véglegesítése — {year}
              <p className="text-xs text-zinc-400 font-normal mt-0.5">
                5 lépéses ellenőrzött folyamat — a könyvelési gyakorlatnak megfelelően
              </p>
            </span>
          </DialogTitle>

          {/* Progressz */}
          <div className="flex items-center gap-2 mt-3 text-xs overflow-x-auto">
            <StepDot active={step === 'overview'} done={step !== 'overview'}>1. Áttekintés</StepDot>
            <div className="h-px bg-slate-200 flex-1 min-w-[8px]" />
            <StepDot active={step === 'checks'} done={step === 'jegyzokonyv' || step === 'confirm' || step === 'done'}>
              2. Ellenőrzések
            </StepDot>
            <div className="h-px bg-slate-200 flex-1 min-w-[8px]" />
            <StepDot active={step === 'jegyzokonyv'} done={step === 'confirm' || step === 'done'}>
              3. Jegyzőkönyv
            </StepDot>
            <div className="h-px bg-slate-200 flex-1 min-w-[8px]" />
            <StepDot active={step === 'confirm'} done={step === 'done'}>
              4. Megerősítés
            </StepDot>
            <div className="h-px bg-slate-200 flex-1 min-w-[8px]" />
            <StepDot active={step === 'done'} done={false}>5. Kész</StepDot>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* LÉPÉS 1: Áttekintés */}
          {step === 'overview' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="card-raised p-5 bg-gradient-to-br from-violet-50/40 to-white border-violet-100">
                <div className="flex items-start gap-3">
                  <Sparkles className="size-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-heading text-lg text-slate-800">
                      Az éves számadás véglegesítése
                    </h3>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                      A KARTOTEKA végigvezet a véglegesítés 5 lépésén: automatikus
                      ellenőrzések, presbiteri jegyzőkönyv csatolás, és a végső
                      megerősítés. Véglegesítés után a számadás az egyházmegyéhez
                      kerül — a módosítás csak javítási kérelemmel lehetséges.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="card-raised p-4 bg-emerald-50/30 border-emerald-100">
                  <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Bevételi oldal</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tervezett:</span>
                      <span className="font-mono">{formatCurrency(summary.totalBudgetIncome)} RON</span>
                    </div>
                    <div className="flex justify-between border-t border-emerald-100 pt-1">
                      <span className="text-slate-700 font-semibold">Tényleges:</span>
                      <span className="font-mono font-semibold text-emerald-700">
                        {formatCurrency(summary.totalActualIncome)} RON
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Megvalósulás:</span>
                      <span>
                        {summary.totalBudgetIncome > 0
                          ? `${Math.round((summary.totalActualIncome / summary.totalBudgetIncome) * 100)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="card-raised p-4 bg-rose-50/30 border-rose-100">
                  <p className="text-xs uppercase tracking-wide text-rose-700 font-semibold">Kiadási oldal</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tervezett:</span>
                      <span className="font-mono">{formatCurrency(summary.totalBudgetExpense)} RON</span>
                    </div>
                    <div className="flex justify-between border-t border-rose-100 pt-1">
                      <span className="text-slate-700 font-semibold">Tényleges:</span>
                      <span className="font-mono font-semibold text-rose-700">
                        {formatCurrency(summary.totalActualExpense)} RON
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Megvalósulás:</span>
                      <span>
                        {summary.totalBudgetExpense > 0
                          ? `${Math.round((summary.totalActualExpense / summary.totalBudgetExpense) * 100)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-raised p-4 bg-gradient-to-br from-blue-50/40 to-indigo-50/20 border-blue-100">
                <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Éves egyenleg</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Tervezett</p>
                    <p className={`text-xl font-bold font-mono ${summary.budgetedBalance >= 0 ? 'text-sky-700' : 'text-rose-600'}`}>
                      {summary.budgetedBalance >= 0 ? '+' : ''}
                      {formatCurrency(summary.budgetedBalance)} RON
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Tényleges</p>
                    <p className={`text-xl font-bold font-mono ${summary.actualBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {summary.actualBalance >= 0 ? '+' : ''}
                      {formatCurrency(summary.actualBalance)} RON
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LÉPÉS 2: Ellenőrzések */}
          {step === 'checks' && (
            <div className="max-w-3xl mx-auto space-y-3">
              <div className="card-raised p-4 bg-amber-50/30 border-amber-100">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Automatikus ellenőrzések
                    </p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      A rendszer ellenőriz minden fontos feltételt, hogy a számadás
                      pontos és a könyvelési szabályoknak megfelelő legyen.
                      <strong> Piros hiba</strong> → nem tudod véglegesíteni, előbb javítsd.
                      <strong> Sárga figyelmeztetés</strong> → mehet tovább, de érdemes átnézni.
                    </p>
                  </div>
                </div>
              </div>

              {checksLoading && (
                <div className="text-center py-8 text-slate-500">
                  <Loader2 className="inline-block size-6 animate-spin mb-2" />
                  <p className="text-sm">Ellenőrzések futnak…</p>
                </div>
              )}

              {checks && (
                <>
                  {checks.items.map((item) => (
                    <CheckItemCard key={item.key} item={item} onFix={(url) => {
                      onOpenChange(false)
                      navigateToFixTarget(router, url)
                    }} />
                  ))}

                  {checks.hasBlocker && (
                    <div className="rounded-2xl border-2 border-red-300 bg-red-50/50 p-4 text-center">
                      <XCircle className="size-8 text-red-600 mx-auto mb-1" />
                      <p className="font-semibold text-red-900">
                        Hibák találhatók — javítsd őket, mielőtt véglegesítenéd.
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        A &bdquo;Tovább&rdquo; gomb akkor lesz aktív, amikor minden piros hiba javítva.
                      </p>
                    </div>
                  )}
                  {!checks.hasBlocker && checks.hasWarning && (
                    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-4 text-center">
                      <AlertCircle className="size-6 text-amber-700 mx-auto mb-1" />
                      <p className="font-semibold text-amber-900">
                        Van {checks.items.filter((i) => i.status === 'warning').length} figyelmeztetés, de mehetsz tovább.
                      </p>
                    </div>
                  )}
                  {!checks.hasBlocker && !checks.hasWarning && (
                    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/50 p-4 text-center">
                      <CheckCircle2 className="size-8 text-emerald-600 mx-auto mb-1" />
                      <p className="font-semibold text-emerald-900">
                        Minden ellenőrzés zöld — mehet a véglegesítés! 🎉
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* LÉPÉS 3: Jegyzőkönyv */}
          {step === 'jegyzokonyv' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="card-raised p-4 bg-indigo-50/30 border-indigo-100">
                <div className="flex items-start gap-2">
                  <ScrollText className="size-4 text-indigo-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">Presbiteri jegyzőkönyv</p>
                    <p className="text-xs text-slate-600 mt-1">
                      A számadást a presbitérium tárgyalja — a jegyzőkönyvi szám és tárgyalási
                      dátum kerül a hivatalos dokumentumba.
                    </p>
                  </div>
                </div>
              </div>

              {/* Mód választó */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setJkvMode('kartoteka')}
                  disabled={jkvList.length === 0 && !jkvLoading}
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    jkvMode === 'kartoteka'
                      ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 disabled:opacity-50'
                  }`}
                >
                  <FileText className="size-5 text-indigo-600 mb-2" />
                  <p className="font-semibold text-sm text-slate-800">
                    Kartotéka jegyzőkönyv
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ha a presbiteri jegyzőkönyvet a Kartotékában írtad
                    {jkvList.length > 0 ? ` (${jkvList.length} elérhető)` : jkvLoading ? ' (töltés...)' : ' — nincs elérhető'}.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setJkvMode('manual')}
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    jkvMode === 'manual'
                      ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Building2 className="size-5 text-slate-600 mb-2" />
                  <p className="font-semibold text-sm text-slate-800">
                    Manuális beírás
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ha másutt vagy papíron van a jegyzőkönyv — írd be kézzel.
                  </p>
                </button>
              </div>

              {/* Kartotéka mód */}
              {jkvMode === 'kartoteka' && (
                <div className="card-raised p-4 space-y-3">
                  {jkvLoading ? (
                    <div className="text-center py-4">
                      <Loader2 className="inline-block size-5 animate-spin text-slate-400" />
                    </div>
                  ) : jkvList.length === 0 ? (
                    <p className="text-sm text-slate-500 italic text-center py-4">
                      Nincs {year}-re szóló presbiteri jegyzőkönyv a Kartotékában. Válts manuális módra.
                    </p>
                  ) : (
                    <>
                      <div>
                        <Label className="text-sm">Presbiteri jegyzőkönyv kiválasztása</Label>
                        <select
                          value={selectedJkvId}
                          onChange={(e) => {
                            setSelectedJkvId(e.target.value)
                            setSelectedNapirendiId('')
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">— válassz jegyzőkönyvet —</option>
                          {jkvList.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.ev}/{j.ules_sorszam} — {j.datum} {j.hely ? `(${j.hely})` : ''} [{j.allapot}]
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedJkv && (
                        <div>
                          <Label className="text-sm">Napirendi pont (számadás tárgyalása)</Label>
                          <select
                            value={selectedNapirendiId}
                            onChange={(e) => setSelectedNapirendiId(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">— válaszd ki a napirendi pontot —</option>
                            {selectedJkv.napirendi_pontok.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.sorszam}. {n.cim}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-slate-500 mt-1">
                            A számadással kapcsolatos napirendi pont — ha nincs, add hozzá a jegyzőkönyvhöz a Jegyzőkönyvek modulban.
                          </p>
                        </div>
                      )}

                      {selectedJkv && selectedNapirendiId && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Tárgyalás dátuma:</span>
                            <strong className="text-slate-800">{selectedJkv.datum}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Jegyzőkönyvi szám:</span>
                            <strong className="text-slate-800 font-mono">{finalJkvSzam}</strong>
                          </div>
                          {matchedHatarozat ? (
                            <p className="text-[11px] text-emerald-700 italic mt-2 border-t border-emerald-200 pt-2">
                              ✅ Kapcsolt határozat: <strong>{matchedHatarozat.sorszam}/{matchedHatarozat.ev}</strong> — {matchedHatarozat.szoveg.slice(0, 100)}{matchedHatarozat.szoveg.length > 100 ? '…' : ''}
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-700 italic mt-2 border-t border-amber-200 pt-2">
                              ⚠️ Nincs határozat ehhez a napirendi ponthoz — a jegyzőkönyvi szám az ülés sorszáma alapján generálódik.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Manuális mód */}
              {jkvMode === 'manual' && (
                <div className="card-raised p-4 space-y-3">
                  <div>
                    <Label className="text-sm">Jegyzőkönyvi szám *</Label>
                    <Input
                      value={manualJkvSzam}
                      onChange={(e) => setManualJkvSzam(e.target.value)}
                      placeholder="pl. 5/2025 vagy 3-2025/II."
                      className="mt-1"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Ahogy a presbiteri jegyzőkönyvben szerepel.
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm">Tárgyalás dátuma *</Label>
                    <Input
                      type="date"
                      value={manualDatum}
                      onChange={(e) => setManualDatum(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LÉPÉS 4: Megerősítés */}
          {step === 'confirm' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="card-raised p-5 bg-gradient-to-br from-violet-50/50 to-white border-violet-200">
                <h3 className="font-heading text-lg text-slate-800 flex items-center gap-2">
                  <Send className="size-5 text-violet-600" />
                  Utolsó megerősítés
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Ezek az adatok kerülnek a hivatalos számadásba és az egyházmegyéhez:
                </p>

                <div className="mt-4 space-y-2 text-sm bg-white rounded-xl p-4 border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Év:</span>
                    <strong>{year}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tervezett egyenleg:</span>
                    <strong className={`font-mono ${summary.budgetedBalance >= 0 ? 'text-sky-700' : 'text-rose-600'}`}>
                      {formatCurrency(summary.budgetedBalance)} RON
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tényleges egyenleg:</span>
                    <strong className={`font-mono ${summary.actualBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatCurrency(summary.actualBalance)} RON
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2">
                    <span className="text-slate-500">Jegyzőkönyvi szám:</span>
                    <strong className="font-mono">{finalJkvSzam || '—'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tárgyalás dátuma:</span>
                    <strong>{finalDatum || '—'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Jegyzőkönyv forrás:</span>
                    <Badge className={jkvMode === 'kartoteka' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}>
                      {jkvMode === 'kartoteka' ? 'Kartotéka-beli' : 'Manuális'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="card-raised p-4 bg-amber-50/40 border-amber-200">
                <div className="flex items-start gap-2">
                  <Bell className="size-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-semibold mb-1">Mi fog történni a megerősítés után?</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>A számadás véglegesítve lesz, <strong>új tétel rögzítése, stornózás, szerkesztés a {year}. évre letiltva</strong>.</li>
                      <li>Az <strong>egyházmegye csengőn értesítést</strong> kap — az esperes látni fogja a beküldött dokumentumot.</li>
                      <li>Módosítás csak az egyházmegyei <strong>javítási engedéllyel</strong> lehetséges.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LÉPÉS 5: Kész */}
          {step === 'done' && (
            <div className="max-w-xl mx-auto text-center py-10">
              <div className="inline-flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg mb-4">
                <CheckCircle2 className="size-10" />
              </div>
              <h3 className="font-heading text-2xl text-slate-800">
                Számadás véglegesítve! 🎉
              </h3>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-md mx-auto">
                Az egyházmegye csengőn értesítést kap. A {year}. évi számadás mostantól
                lezárt és nem módosítható — kivéve ha javítási kérelmet küldesz az
                egyházmegyének.
              </p>
              <Button
                onClick={() => onOpenChange(false)}
                className="mt-6 rounded-xl bg-violet-600 text-white hover:bg-violet-700"
              >
                Bezárás
              </Button>
            </div>
          )}
        </div>

        {/* Léptető gombok — csak 1-4 lépésre */}
        {step !== 'done' && (
          <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={step === 'overview' ? () => onOpenChange(false) : handleBack}
              disabled={isPending}
              className="rounded-xl"
            >
              {step === 'overview' ? (
                'Mégse'
              ) : (
                <>
                  <ArrowLeft className="mr-1 size-4" />
                  Vissza
                </>
              )}
            </Button>

            {step !== 'confirm' ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext() || isPending}
                className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
              >
                Tovább
                <ArrowRight className="ml-1 size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinalize}
                disabled={isPending}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
              >
                {isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Send className="mr-1 size-4" />
                )}
                Véglegesítés és beküldés
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────
// Segéd komponensek
// ─────────────────────────────────────────────────────────────

function StepDot({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${
        active
          ? 'bg-violet-600 text-white font-semibold'
          : done
            ? 'bg-violet-100 text-violet-700'
            : 'bg-slate-100 text-slate-500'
      }`}
    >
      {done && !active && <CheckCircle2 className="size-2.5" />}
      {children}
    </span>
  )
}

function CheckItemCard({ item, onFix }: { item: CheckItem; onFix: (url: string) => void }) {
  const colors = {
    ok: {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50/40',
      badge: 'bg-emerald-100 text-emerald-800',
      icon: <CheckCircle2 className="size-5 text-emerald-600" />,
    },
    warning: {
      border: 'border-amber-200',
      bg: 'bg-amber-50/40',
      badge: 'bg-amber-100 text-amber-800',
      icon: <AlertCircle className="size-5 text-amber-600" />,
    },
    error: {
      border: 'border-red-300',
      bg: 'bg-red-50/40',
      badge: 'bg-red-100 text-red-800',
      icon: <XCircle className="size-5 text-red-600" />,
    },
  }
  const c = colors[item.status]

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{c.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-slate-800">{item.label}</p>
            <Badge className={c.badge}>
              {item.status === 'ok' ? 'OK' : item.status === 'warning' ? 'Figyelmeztetés' : 'Hiba'}
            </Badge>
            {item.blocking && item.status === 'error' && (
              <Badge variant="outline" className="border-red-300 text-red-700 text-[10px]">
                Blokkol
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
          {item.detail && (
            <p className="text-xs text-slate-700 mt-2 leading-relaxed">{item.detail}</p>
          )}
          {item.fixUrl && item.fixLabel && item.status !== 'ok' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onFix(item.fixUrl!)}
              className="mt-2 rounded-lg text-xs"
            >
              {item.fixLabel} →
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
