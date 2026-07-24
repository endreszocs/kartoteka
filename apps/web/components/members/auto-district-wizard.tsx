'use client'

/**
 * Automatikus körzetesítés — 3 lépéses varázsló (2026-07-24, PR-7 F4.3).
 *
 * 1. Paraméterek → 2. Előnézet (SEMMI írás eddig!) → 3. Alkalmazás.
 * D3 döntések: több presbiter/körzet · lélekszám-kiegyensúlyozás családok
 * szétszakítása nélkül · korosztály-mód · nevek szerkeszthetők · mindenki
 * elosztva (a nem osztható családok okkal listázva, kézzel rendezhetők).
 * Mobil-first: teljes képernyős dialógus, kártya-alapú előnézet.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, MapPin, Sparkles, Users, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  applyDistrictPlan,
  type AutoDistrictInput,
} from '@/app/(dashboard)/tagnyilvantartas/district-auto-actions'
import {
  planDistricts,
  type AutoDistrictParams,
  type DistrictPlan,
} from '@/lib/members/auto-district'

interface AutoDistrictWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A fül által előre betöltött bemenet (nincs dupla lekérdezés) */
  input: AutoDistrictInput | null
  /** Sikeres alkalmazás után hívódik (a fül frissít) */
  onApplied: () => void
}

type Step = 'params' | 'preview' | 'done'

export function AutoDistrictWizard({ open, onOpenChange, input, onApplied }: AutoDistrictWizardProps) {
  const [step, setStep] = useState<Step>('params')
  const [districtCount, setDistrictCount] = useState(3)
  const [mode, setMode] = useState<AutoDistrictParams['mode']>('utca')
  const [balance, setBalance] = useState<AutoDistrictParams['balance']>('lelekszam')
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [plan, setPlan] = useState<DistrictPlan | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [presbytersByDistrict, setPresbytersByDistrict] = useState<Record<string, number[]>>({})
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<{ createdDistricts: number; assignedFamilies: number; assignedSingles: number } | null>(null)

  // Megnyitáskor: alapállapot + default körzetszám = presbiterek száma
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setStep('params')
      setPlan(null)
      setNames({})
      setPresbytersByDistrict({})
      setResult(null)
      if (input && input.presbyters.length > 0) setDistrictCount(input.presbyters.length)
    })
    return () => { cancelled = true }
  }, [open, input])

  const families = input?.families ?? []
  const presbyters = input?.presbyters ?? []

  function handleGeneratePlan() {
    if (families.length === 0) {
      toast.error('Nincs körzetesíthető család — előbb hozz létre családokat.')
      return
    }
    const generated = planDistricts(families, { districtCount, mode, balance, onlyUnassigned })
    if (generated.districts.length === 0) {
      toast.error('A megadott paraméterekkel nem készíthető kiosztás.')
      return
    }
    setPlan(generated)
    setNames(Object.fromEntries(generated.districts.map((d) => [d.key, d.name])))
    setPresbytersByDistrict({})
    setStep('preview')
  }

  function togglePresbyter(districtKey: string, presbyterId: number) {
    setPresbytersByDistrict((prev) => {
      const current = prev[districtKey] || []
      return {
        ...prev,
        [districtKey]: current.includes(presbyterId)
          ? current.filter((id) => id !== presbyterId)
          : [...current, presbyterId],
      }
    })
  }

  /** Egy presbiter csak EGY körzethez tartozhat (presbiter.id_csoport FK) —
   *  másik körzetben már kiválasztott presbiter itt letiltva. */
  const presbyterTakenBy = useMemo(() => {
    const taken = new Map<number, string>()
    for (const [key, ids] of Object.entries(presbytersByDistrict)) {
      for (const id of ids) taken.set(id, key)
    }
    return taken
  }, [presbytersByDistrict])

  async function handleApply() {
    if (!plan) return
    setApplying(true)
    const response = await applyDistrictPlan({
      districts: plan.districts.map((d) => ({
        name: names[d.key]?.trim() || d.name,
        familyIds: d.familyIds,
        // 2026-07-24 (PR-10): a család nélküli személyek is a körzetbe kerülnek
        personIds: d.personIds,
        presbyterIds: presbytersByDistrict[d.key] || [],
      })),
    })
    setApplying(false)
    if (response.error) {
      toast.error(response.error)
      return
    }
    setResult({
      createdDistricts: response.createdDistricts ?? 0,
      assignedFamilies: response.assignedFamilies ?? 0,
      assignedSingles: response.assignedSingles ?? 0,
    })
    setStep('done')
    onApplied()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 grid h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.5rem]">
        <DialogHeader className="border-b border-border px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-cyan-600" />
            Automatikus körzetesítés
          </DialogTitle>
          <DialogDescription>
            {step === 'params' && 'Állítsd be a szempontokat — a terv csak előnézet, semmi nem íródik a jóváhagyásig.'}
            {step === 'preview' && 'Nézd át a javasolt kiosztást: a nevek szerkeszthetők, a presbiterek kioszthatók.'}
            {step === 'done' && 'A körzetesítés elkészült.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {/* ── 1. PARAMÉTEREK ─────────────────────────────────────── */}
          {step === 'params' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-3 text-xs leading-5 text-cyan-900 dark:border-cyan-900/40 dark:bg-cyan-950/30 dark:text-cyan-200">
                {/* 2026-07-24 (PR-10): a TELJES gyülekezet körzetesül — családok ÉS egyedülállók */}
                {families.filter((f) => (f.kind ?? 'csalad') === 'csalad').length} család +{' '}
                {families.filter((f) => f.kind === 'szemely').length} egyedülálló
                ({families.reduce((s, f) => s + Math.max(1, f.memberCount), 0)} fő) ·{' '}
                {presbyters.length} presbiter · {families.filter((f) => f.currentCsoportId == null).length} egység körzet nélkül
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ad-count">Körzetek száma</Label>
                  <Input
                    id="ad-count"
                    type="number"
                    min={1}
                    max={50}
                    value={districtCount}
                    onChange={(e) => setDistrictCount(Math.max(1, Number(e.target.value) || 1))}
                    className="min-h-11 rounded-xl"
                  />
                  {presbyters.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">{presbyters.length} presbiter van — ennyi az ajánlott.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ad-mode">Csoportosítás alapja</Label>
                  <select
                    id="ad-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as AutoDistrictParams['mode'])}
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    <option value="utca">Utcánként (település + utca)</option>
                    <option value="korosztaly">Korosztály szerint (legidősebb felnőtt)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ad-balance">Kiegyensúlyozás</Label>
                  <select
                    id="ad-balance"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value as AutoDistrictParams['balance'])}
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    <option value="lelekszam">Lélekszám szerint (ajánlott)</option>
                    <option value="csaladszam">Családszám szerint</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">A családok sosem szakadnak szét — a hozzárendelés család-szintű.</p>
                </div>
                <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={onlyUnassigned}
                    onChange={(e) => setOnlyUnassigned(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <span>
                    Csak a <strong>körzet nélküli</strong> családok elosztása
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Kikapcsolva MINDEN család újra elosztásra kerül (új körzetekbe).
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ── 2. ELŐNÉZET ────────────────────────────────────────── */}
          {step === 'preview' && plan && (
            <div className="space-y-3">
              {plan.unassigned.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  <strong>{plan.unassigned.length} család nem osztható be automatikusan:</strong>
                  <ul className="mt-1 list-inside list-disc">
                    {plan.unassigned.slice(0, 8).map((u) => (
                      <li key={u.familyId}>{u.displayName} — {u.reason}</li>
                    ))}
                    {plan.unassigned.length > 8 && <li>… és további {plan.unassigned.length - 8}</li>}
                  </ul>
                  Őket a Körzetek fül „Családok&rdquo; gombjával kézzel rendelheted hozzá.
                </div>
              )}

              {plan.districts.map((district) => (
                <div key={district.key} className="card-raised space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Input
                      value={names[district.key] ?? district.name}
                      onChange={(e) => setNames((prev) => ({ ...prev, [district.key]: e.target.value }))}
                      className="min-h-11 max-w-xs rounded-xl font-semibold"
                      aria-label="Körzet neve"
                    />
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {district.familyCount} család</span>
                      {district.singleCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{district.singleCount} egyedülálló</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{district.memberCount} fő</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {district.groupLabels.slice(0, 10).map((label) => (
                      <Badge key={label} variant="outline" className="border-cyan-200 text-[10px] text-cyan-700 dark:border-cyan-800 dark:text-cyan-300">
                        <MapPin className="mr-1 size-3" />{label}
                      </Badge>
                    ))}
                    {district.groupLabels.length > 10 && (
                      <Badge variant="outline" className="text-[10px]">+{district.groupLabels.length - 10}</Badge>
                    )}
                  </div>

                  {presbyters.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Presbiter(ek) — több is választható:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {presbyters.map((p) => {
                          const selectedHere = (presbytersByDistrict[district.key] || []).includes(p.id)
                          const takenElsewhere = !selectedHere && presbyterTakenBy.has(p.id)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={takenElsewhere}
                              onClick={() => togglePresbyter(district.key, p.id)}
                              className={`min-h-9 rounded-full border px-3 text-xs transition ${
                                selectedHere
                                  ? 'border-cyan-500 bg-cyan-500/15 font-semibold text-cyan-700 dark:text-cyan-300'
                                  : takenElsewhere
                                    ? 'cursor-not-allowed border-border text-muted-foreground/50'
                                    : 'border-border hover:border-cyan-300'
                              }`}
                              title={takenElsewhere ? 'Másik körzethez már kiosztva' : undefined}
                            >
                              {selectedHere && <Check className="mr-1 inline size-3" />}
                              {p.nev}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── 3. KÉSZ ────────────────────────────────────────────── */}
          {step === 'done' && result && (
            <div className="py-10 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50">
                <Sparkles className="size-7" />
              </div>
              <p className="font-heading text-lg font-semibold">A körzetesítés elkészült!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.createdDistricts} új körzet · {result.assignedFamilies} család + {result.assignedSingles} egyedülálló hozzárendelve.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Minden kiosztás utólag is módosítható a Körzetek fülön.
              </p>
            </div>
          )}
        </div>

        {/* Lábléc-gombok */}
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {step === 'params' && (
            <>
              <Button type="button" variant="ghost" className="min-h-11 rounded-xl" onClick={() => onOpenChange(false)}>Mégse</Button>
              <Button type="button" className="min-h-11 flex-1 rounded-xl bg-cyan-600 hover:bg-cyan-700" onClick={handleGeneratePlan} disabled={!input}>
                <Wand2 className="mr-1.5 size-4" />
                {input ? 'Terv készítése (előnézet)' : 'Adatok betöltése…'}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button type="button" variant="ghost" className="min-h-11 rounded-xl" onClick={() => setStep('params')}>
                <ArrowLeft className="mr-1 size-4" /> Vissza
              </Button>
              <Button type="button" className="min-h-11 flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={handleApply} disabled={applying}>
                {applying ? 'Alkalmazás…' : 'Kiosztás alkalmazása'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button type="button" className="min-h-11 flex-1 rounded-xl" onClick={() => onOpenChange(false)}>Bezárás</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
