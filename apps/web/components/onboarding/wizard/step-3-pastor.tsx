'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  CalendarDays,
  Loader2,
  User,
  UserCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import {
  WizardSectionCard,
  WizardField,
  WizardInputGrid,
  Input,
} from './_helpers/wizard-ui'
import {
  ServiceHistorySection,
  type ServiceHistorySlot,
} from './_helpers/service-history-section'
import type { WizardData } from '../welcome-wizard-client'

interface Step3Props {
  data: WizardData
  updateData: (patch: Partial<WizardData>) => void
  onNext: (
    pastor: WizardData['pastor'],
    serviceHistory: ServiceHistorySlot[],
  ) => void | Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step3Pastor({
  data,
  updateData,
  onNext,
  onBack,
  saving,
}: Step3Props) {
  const [form, setForm] = useState(data.pastor)
  const [serviceHistory, setServiceHistory] = useState(data.serviceHistory)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleNext() {
    if (!form.fullName.trim()) {
      toast.error('A neved kötelező')
      return
    }
    // Validáció: ha van service-history elem, mindegyikben legyen hely
    const invalid = serviceHistory.find(s => !s.hely.trim())
    if (invalid) {
      toast.error(
        'Minden szolgálati helyhez add meg a helyszín nevét — vagy töröld a felesleges sort.',
      )
      return
    }
    updateData({ pastor: form, serviceHistory })
    await onNext(form, serviceHistory)
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 ring-1 ring-violet-100">
          <User className="size-6 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl text-slate-800">
            Lelkészi adatok
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            A saját személyes adataid. Ezek a saját profilodhoz kerülnek és a
            hivatalos iratokon mint lelkész neve/elérhetősége jelennek meg.
          </p>
        </div>
      </header>

      {/* Alapadatok */}
      <WizardSectionCard
        icon={UserCircle}
        iconColor="text-violet-700"
        iconBg="bg-violet-50"
        title="Alapadatok"
        description="A saját, hivatalos neved, születési dátumod és jelenlegi szolgálati kezdésed."
      >
        <WizardField
          id="fullName"
          label="Teljes neved"
          required
          hint="A hivatalos iratokon (igazolás, bizonylat) így fog megjelenni."
        >
          <Input
            id="fullName"
            placeholder="pl. Szabó János"
            value={form.fullName}
            onChange={e => update('fullName', e.target.value)}
          />
        </WizardField>

        <WizardInputGrid cols={2}>
          <WizardField
            id="birthDate"
            label="Születési dátum"
            hint="Az életkor a kor-alapú kedvezmények kiszámításához is segít."
          >
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate}
              onChange={e => update('birthDate', e.target.value)}
            />
          </WizardField>
          <WizardField
            id="serviceStartedAt"
            label="Szolgálati kezdés (ennél a gyülekezetnél)"
            hint="Mikor lettél lelkész itt?"
          >
            <Input
              id="serviceStartedAt"
              type="date"
              value={form.serviceStartedAt}
              onChange={e => update('serviceStartedAt', e.target.value)}
            />
          </WizardField>
        </WizardInputGrid>
      </WizardSectionCard>

      {/* Saját elérhetőségek */}
      <WizardSectionCard
        icon={AtSign}
        iconColor="text-indigo-700"
        iconBg="bg-indigo-50"
        title="Saját elérhetőségek"
        description="A te saját telefonszámod és e-mail címed (NEM a gyülekezeté)."
      >
        <WizardInputGrid cols={2}>
          <WizardField
            id="pastor-phone"
            label="Saját telefonszám"
            hint="A te közvetlen elérhetőséged (mobil)."
          >
            <Input
              id="pastor-phone"
              placeholder="+40 740 123 456"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
            />
          </WizardField>
          <WizardField
            id="pastor-email"
            label="Saját e-mail (munka)"
            hint="A te közvetlen e-mail címed."
          >
            <Input
              id="pastor-email"
              type="email"
              placeholder="szabo.janos@erek.ro"
              value={form.email}
              onChange={e => update('email', e.target.value)}
            />
          </WizardField>
        </WizardInputGrid>
      </WizardSectionCard>

      {/* Szolgálati előzmények — multi-row */}
      <ServiceHistorySection
        items={serviceHistory}
        onChange={setServiceHistory}
      />

      <div className="flex items-start gap-2 rounded-lg bg-violet-50/40 p-3 text-xs text-violet-900">
        <CalendarDays className="mt-0.5 size-3.5 shrink-0" />
        <span>
          A profilodban később bővítheted a szolgálati előzményeket, hozzáadhatsz
          fotót, könyvtári linket és egyéb információkat.
        </span>
      </div>

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
