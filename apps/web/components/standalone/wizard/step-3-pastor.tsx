'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { WizardData } from '../welcome-wizard-client'

interface Step3Props {
  data: WizardData
  updateData: (patch: Partial<WizardData>) => void
  onNext: () => void | Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step3Pastor({ data, updateData, onNext, onBack, saving }: Step3Props) {
  const [form, setForm] = useState(data.pastor)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleNext() {
    if (!form.fullName.trim()) {
      toast.error('A neved kötelező')
      return
    }
    updateData({ pastor: form })
    await onNext()
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-50">
          <User className="size-5 text-violet-600" />
        </div>
        <div>
          <h2 className="font-heading text-2xl text-slate-800">
            Személyes adataid
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Ezek szerepelnek majd a hivatalos iratokon mint lelkész neve/adatai.
          </p>
        </div>
      </div>

      {/* Alapadatok */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Teljes neved *</Label>
          <Input
            id="fullName"
            placeholder="pl. Szabó János"
            value={form.fullName}
            onChange={e => update('fullName', e.target.value)}
          />
          <p className="text-xs text-slate-500">
            A hivatalos iratokon így fog megjelenni.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="birthDate">Születési dátum</Label>
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate}
              onChange={e => update('birthDate', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="serviceStartedAt">Szolgálati kezdés (itt)</Label>
            <Input
              id="serviceStartedAt"
              type="date"
              value={form.serviceStartedAt}
              onChange={e => update('serviceStartedAt', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Elérhetőség */}
      <div className="space-y-4 border-t border-slate-100 pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Elérhetőségek
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pastor-phone">Telefonszám</Label>
            <Input
              id="pastor-phone"
              placeholder="+40 740 123 456"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pastor-email">E-mail (munka)</Label>
            <Input
              id="pastor-email"
              type="email"
              placeholder="szabo.janos@erek.ro"
              value={form.email}
              onChange={e => update('email', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Előzmény */}
      <div className="space-y-4 border-t border-slate-100 pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Szolgálati előzmények (opcionális)
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="previousPlaces">Korábbi szolgálati helyek</Label>
          <textarea
            id="previousPlaces"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            placeholder="pl. 2015-2020 Kolozsvár-Alsóváros, segédlelkész"
            value={form.previousPlaces}
            onChange={e => update('previousPlaces', e.target.value)}
          />
          <p className="text-xs text-slate-500">
            Szabadon formázott szöveg. Ez a saját személyes profilodhoz kerül.
          </p>
        </div>
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
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
          {saving ? 'Mentés…' : 'Tovább'}
        </Button>
      </div>
    </div>
  )
}
