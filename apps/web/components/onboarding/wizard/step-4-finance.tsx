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
  Calculator,
  Loader2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import {
  WizardSectionCard,
  WizardField,
  WizardInputGrid,
  WizardBanner,
  Input,
} from './_helpers/wizard-ui'
import {
  FeeDiscountsSection,
  type DiscountPeriodSlot,
  type AgeDiscountSlot,
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
  const [pastYears, setPastYears] = useState(data.pastYears)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleNext() {
    if (!Number.isFinite(form.eves_jarulek) || form.eves_jarulek <= 0) {
      toast.error('Az éves alap járulék legyen nagyobb mint 0.')
      return
    }
    if (!/^\d{2}-\d{2}$/.test(form.jarulek_hatarid || '')) {
      toast.error('A járulék határidejét MM-DD formátumban add meg.')
      return
    }
    // Validáció: kedvezményes időszakok mindegyike helyesen kitöltve
    for (const p of discountPeriods) {
      if (!/^\d{2}-\d{2}$/.test(p.hatarid)) {
        toast.error('Minden kedvezményes időszak határidejét MM-DD formátumban add meg.')
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

    updateData({ finance: form, discountPeriods, ageDiscount, pastYears })
    await onNext(form, discountPeriods, ageDiscount, pastYears)
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
        description={`A ${new Date().getFullYear()}. évre vonatkozó éves járulék és a teljes-összegre vonatkozó határidő.`}
      >
        <WizardInputGrid cols={2}>
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

          <WizardField
            id="jarulek_hatarid"
            label="Fizetési határidő (MM-DD)"
            required
            hint="Hónap-Nap formátum (pl. 07-01 = július 1.). Eddig az időpontig fizethet a tag teljes járulékot tartozás nélkül."
          >
            <Input
              id="jarulek_hatarid"
              placeholder="pl. 07-01"
              value={form.jarulek_hatarid}
              onChange={e => update('jarulek_hatarid', e.target.value)}
            />
          </WizardField>
        </WizardInputGrid>

        <WizardField
          id="jarulek_kedvezmenyes"
          label="Általános kedvezményes járulék (RON, opcionális)"
          hint="Ha van egy alapértelmezett kedvezményes összeg (pl. nyugdíjasoknak, diákoknak), itt add meg. A részletes kedvezmény-szabályokat lent állíthatod be."
        >
          <Input
            id="jarulek_kedvezmenyes"
            type="number"
            step="0.01"
            min="0"
            placeholder="pl. 60"
            value={form.jarulek_kedvezmenyes || ''}
            onChange={e =>
              update('jarulek_kedvezmenyes', Number(e.target.value))
            }
          />
        </WizardField>
      </WizardSectionCard>

      {/* Tartozás-számítási mód */}
      <WizardSectionCard
        icon={Calculator}
        iconColor="text-cyan-700"
        iconBg="bg-cyan-50"
        title="Tartozás-számítási mód"
        description="Hogyan számolja a rendszer a régi évek tartozását?"
      >
        <WizardBanner tone="info">
          <p>
            Egy tagnak lehet pl. 2022-es tartozása. A rendszer ezt a 2022-es
            beállítások szerint számolja (&bdquo;akkori&rdquo;), vagy az aktuális
            évi beállítások alapján (&bdquo;aktuális&rdquo;)? Ha nem vagy biztos,
            válaszd az &bdquo;akkori&rdquo;-t — ez a leggyakoribb és legtisztább.
          </p>
        </WizardBanner>

        <div className="grid gap-3 md:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors ${
              form.tartozas_szamitas_mod === 'akkori'
                ? 'border-cyan-500 bg-cyan-50/50'
                : 'border-slate-200 bg-white hover:border-cyan-200'
            }`}
          >
            <input
              type="radio"
              name="tartozas_mode"
              className="mt-1 size-4"
              checked={form.tartozas_szamitas_mod === 'akkori'}
              onChange={() => update('tartozas_szamitas_mod', 'akkori')}
            />
            <span className="text-sm">
              <strong className="block text-slate-800">Akkori év szerint</strong>
              <span className="mt-0.5 block text-xs text-slate-600">
                A 2022-es tartozás a 2022-es beállítások szerint van számolva.
                Ajánlott — ez a hagyományos.
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors ${
              form.tartozas_szamitas_mod === 'aktualis'
                ? 'border-cyan-500 bg-cyan-50/50'
                : 'border-slate-200 bg-white hover:border-cyan-200'
            }`}
          >
            <input
              type="radio"
              name="tartozas_mode"
              className="mt-1 size-4"
              checked={form.tartozas_szamitas_mod === 'aktualis'}
              onChange={() => update('tartozas_szamitas_mod', 'aktualis')}
            />
            <span className="text-sm">
              <strong className="block text-slate-800">Aktuális év szerint</strong>
              <span className="mt-0.5 block text-xs text-slate-600">
                A régi tartozások az aktuális évi járulékkal vannak számolva.
                Egyszerűbb — de figyeld a változások hatását.
              </span>
            </span>
          </label>
        </div>
      </WizardSectionCard>

      {/* Kedvezmények — időszaki + kor */}
      <FeeDiscountsSection
        periods={discountPeriods}
        ageDiscount={ageDiscount}
        onPeriodsChange={setDiscountPeriods}
        onAgeChange={setAgeDiscount}
      />

      {/* Múlt évek — csak akkori módban van értelme */}
      <PastYearsSection
        years={pastYears}
        onChange={setPastYears}
        visible={form.tartozas_szamitas_mod === 'akkori'}
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

