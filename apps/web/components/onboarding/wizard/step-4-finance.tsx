'use client'

/**
 * Step 4 — Egyházfenntartási járulék (welcome wizard, 2026-05-05).
 *
 * Átdolgozva 2026-05-05:
 *   - Nyitó egyenleg mezők ELTÁVOLÍTVA — a Pénzügy modulban kerülnek beállításra
 *   - Tartozás-számítási mód radio (akkori vs aktualis) hozzáadva
 *   - Kedvezményes időszakok (multi-row) hozzáadva
 *   - Kor-alapú kedvezmény (opcionális) hozzáadva
 *   - 5 visszamenő év beállításai (opcionális, akkordion)
 */

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import {
  WizardSectionCard,
  WizardField,
  Input,
} from './_helpers/wizard-ui'
import {
  FeeDiscountsSection,
  type DiscountPeriodSlot,
  type AgeDiscountSlot,
  type OccupationDiscountSlot,
} from './_helpers/fee-discounts-section'
import {
  PastYearsSection,
  type PastYearSlot,
} from './_helpers/past-years-section'
import type { WizardData } from '../welcome-wizard-client'

interface Step4Props {
  data: WizardData
  updateData: (patch: Partial<WizardData>) => void
  onNext: (
    finance: WizardData['finance'],
    discountPeriods: DiscountPeriodSlot[],
    ageDiscount: AgeDiscountSlot,
    occupationDiscounts: OccupationDiscountSlot[],
    pastYears: PastYearSlot[],
  ) => void | Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step4Finance({
  data,
  updateData,
  onNext,
  onBack,
  saving,
}: Step4Props) {
  const [form, setForm] = useState(data.finance)
  const [discountPeriods, setDiscountPeriods] = useState(data.discountPeriods)
  const [ageDiscount, setAgeDiscount] = useState(data.ageDiscount)
  const [occupationDiscounts, setOccupationDiscounts] = useState(
    data.occupationDiscounts,
  )
  const [pastYears, setPastYears] = useState(data.pastYears)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleNext() {
    if (!Number.isFinite(form.eves_jarulek) || form.eves_jarulek <= 0) {
      toast.error('Az éves alap járulék legyen nagyobb mint 0.')
      return
    }
    // 2026-06-04: a teljes-összegre vonatkozó fizetési határidőt eltávolítottuk
    // (alapértelmezetten egész évben fizethető). A határidő csak a kedvezményes
    // időszakoknál releváns (lentebb, periódusonként). A congregation
    // jarulek_hatarid mezője az alapértelmezett '12-31'-et kapja (egész év).
    // Validáció: kedvezményes időszakok mindegyike helyesen kitöltve
    for (const p of discountPeriods) {
      if (!/^\d{2}-\d{2}$/.test(p.kezdet) || !/^\d{2}-\d{2}$/.test(p.hatarid)) {
        toast.error('Minden kedvezményes időszak kezdő ÉS vég dátumát MM-DD formátumban add meg.')
        return
      }
      if (p.kezdet > p.hatarid) {
        toast.error('A kedvezményes időszak kezdő dátuma ne legyen későbbi, mint a vég dátuma.')
        return
      }
      if (!Number.isFinite(p.kedv_osszeg) || p.kedv_osszeg <= 0) {
        toast.error('A kedvezményes időszak összege legyen nagyobb mint 0.')
        return
      }
    }
    // Kor-alapú kedvezmény — ha bekapcsolva, legyen érvényes érték
    if (ageDiscount.enabled) {
      if (!ageDiscount.kor_tol || ageDiscount.kor_tol < 18) {
        toast.error('A kor-alapú kedvezmény korhatára legyen 18 év vagy magasabb.')
        return
      }
      if (ageDiscount.type === 'percent') {
        if (!ageDiscount.szazalek || ageDiscount.szazalek < 1 || ageDiscount.szazalek > 100) {
          toast.error('A kor-kedvezmény százaléka 1 és 100 között kell legyen.')
          return
        }
      } else {
        if (!ageDiscount.fix_osszeg || ageDiscount.fix_osszeg < 0) {
          toast.error('A kor-kedvezmény fix összege legyen 0 vagy nagyobb.')
          return
        }
      }
    }

    // Foglalkozás-alapú kedvezmény validáció
    for (const o of occupationDiscounts) {
      if (!o.foglalkozasok.trim()) {
        toast.error('Adj meg legalább egy foglalkozást a foglalkozás-alapú kedvezményhez.')
        return
      }
      if (o.mode === 'fix' && (!Number.isFinite(o.fix_osszeg ?? NaN) || (o.fix_osszeg ?? 0) < 0)) {
        toast.error('A foglalkozás-alapú fix kedvezményes összeg legyen 0 vagy nagyobb.')
        return
      }
    }

    updateData({ finance: form, discountPeriods, ageDiscount, occupationDiscounts, pastYears })
    await onNext(form, discountPeriods, ageDiscount, occupationDiscounts, pastYears)
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-100">
          <Wallet className="size-6 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl text-slate-800">
            Egyházfenntartási járulék
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Az aktuális év alapösszege, a kedvezményes időszakok és a tartozás-
            számítási mód. Mind később is módosítható, és az egyéb részletek (kassza
            nyitóegyenleg, bankszámla nyitó stb.) belépés után, a Pénzügy menüben
            állíthatók be.
          </p>
        </div>
      </header>

      {/* Aktuális év — alap járulék */}
      <WizardSectionCard
        icon={Wallet}
        iconColor="text-amber-700"
        iconBg="bg-amber-50"
        title="Aktuális év alapösszege"
        description={`A ${new Date().getFullYear()}. évre vonatkozó teljes éves egyházfenntartási járulék. Alapértelmezetten egész évben fizethető — fizetési határidő csak kedvezményeknél releváns (lent állítható).`}
      >
        <div className="md:max-w-md">
          <WizardField
            id="eves_jarulek"
            label="Éves alap járulék (RON)"
            required
            hint="Családonkénti vagy tagsági teljes éves egyházfenntartás."
          >
            <Input
              id="eves_jarulek"
              type="number"
              step="0.01"
              min="0"
              placeholder="pl. 120"
              value={form.eves_jarulek || ''}
              onChange={e => update('eves_jarulek', Number(e.target.value))}
            />
          </WizardField>
        </div>
      </WizardSectionCard>

      {/* 2026-07-17 (F5, Q6 — user-döntés): a „Tartozás-számítási mód" választó
          KIVEZETVE — a rendszer mindig az „akkori" (a tartozás évének beállításai
          szerinti) módon számol. */}

      {/* Kedvezmények — foglalkozás-alapú + időszaki + kor */}
      <FeeDiscountsSection
        periods={discountPeriods}
        ageDiscount={ageDiscount}
        occupationDiscounts={occupationDiscounts}
        onPeriodsChange={setDiscountPeriods}
        onAgeChange={setAgeDiscount}
        onOccupationChange={setOccupationDiscounts}
      />

      {/* Múlt évek — Q6 után mindig látható (a számítás mindig „akkori" módú) */}
      <PastYearsSection
        years={pastYears}
        onChange={setPastYears}
        visible
      />

      {/* Nav buttons */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2" disabled={saving}>
          <ArrowLeft className="size-4" />
          Vissza
        </Button>
        <Button
          size="lg"
          className="gap-2 rounded-xl px-6"
          onClick={handleNext}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {saving ? 'Mentés…' : 'Tovább'}
        </Button>
      </div>
    </div>
  )
}

