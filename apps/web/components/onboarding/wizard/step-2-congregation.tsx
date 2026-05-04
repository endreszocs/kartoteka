'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Church, Landmark, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { getCongregationContext } from '@/app/(setup)/welcome/actions'
import { AddressForm, type AddressValue } from '@/components/ui/address-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { WizardData } from '../welcome-wizard-client'

interface Step2Props {
  data: WizardData
  updateData: (patch: Partial<WizardData>) => void
  onNext: (congregation: WizardData['congregation']) => void | Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step2Congregation({ data, updateData, onNext, onBack, saving }: Step2Props) {
  const [form, setForm] = useState(data.congregation)
  const [dioceseName, setDioceseName] = useState<string | null>(null)
  const [dioceseLoading, setDioceseLoading] = useState(true)

  // Egyházmegye név betöltése — ha van beállítva a profilon / gyülekezeten
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await getCongregationContext()
      if (cancelled) return
      if ('data' in result) {
        setDioceseName(result.data.dioceseName)
      }
      setDioceseLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleNext() {
    if (!form.nev.trim()) {
      toast.error('A gyülekezet neve kötelező')
      return
    }
    if (!form.cim.trim()) {
      toast.error('A gyülekezet címe kötelező')
      return
    }
    updateData({ congregation: form })
    await onNext(form)
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
          <Church className="size-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="font-heading text-2xl text-slate-800">
            Gyülekezeti alapadatok
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Ezek az adatok szerepelnek majd a hivatalos iratokon, nyomtatványokon.
          </p>
        </div>
      </div>

      {/* Egyházmegye (csak olvasható, ha be van állítva) */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100">
            <Landmark className="size-4 text-sky-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
              Egyházmegye
            </p>
            {dioceseLoading ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-sky-900">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Betöltés…</span>
              </p>
            ) : dioceseName ? (
              <p className="mt-1 text-base font-semibold text-sky-900">
                {dioceseName}
              </p>
            ) : (
              <p className="mt-1 text-sm text-sky-900/70 italic">
                Még nincs beállítva — a rendszergazda a gyülekezet hozzárendelésekor
                állítja be.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Hivatalos nevek */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Hivatalos elnevezések
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="nev">Gyülekezet neve (hivatalos) *</Label>
          <Input
            id="nev"
            placeholder="pl. Barátosi Református Egyházközség"
            value={form.nev}
            onChange={e => update('nev', e.target.value)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nev_hu">Magyar név (rövid)</Label>
            <Input
              id="nev_hu"
              placeholder="pl. Barátosi Református"
              value={form.nev_hu}
              onChange={e => update('nev_hu', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nev_ro">Román név</Label>
            <Input
              id="nev_ro"
              placeholder="pl. Parohia Reformată Brateș"
              value={form.nev_ro}
              onChange={e => update('nev_ro', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Jogi azonosítók — Endre kérése (2026-05-04): a "Bejegyzési szám"
          mező eltávolítva, mert ilyen az egyháznál nincs. Marad az Adószám (CUI). */}
      <div className="space-y-4 border-t border-slate-100 pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Jogi azonosító
        </h3>

        <div className="space-y-1.5 md:max-w-sm">
          <Label htmlFor="adoszam">Adószám (CUI)</Label>
          <Input
            id="adoszam"
            placeholder="pl. 12345678"
            value={form.adoszam}
            onChange={e => update('adoszam', e.target.value)}
          />
        </div>
      </div>

      {/* Cím — AddressForm strukturált bevitellel */}
      <div className="space-y-4 border-t border-slate-100 pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Hivatalos cím
        </h3>
        <p className="text-xs text-slate-500">
          A megye és helység a hivatalos romániai adatbázisból választható;
          az irányítószám automatikusan kitöltődik az utca alapján.
        </p>

        <AddressForm
          value={{
            countyId: null,
            localityId: form.adrlocality_id,
            streetId: form.adrstreet_id,
            country: form.country || 'Románia',
            county: form.megye || '',
            locality: form.varos || '',
            street: form.cim || '',
            houseNumber: form.hazszam || '',
            postalcode: form.iranyitoszam || '',
            isForeign: form.isForeign || false,
          }}
          onChange={(v: AddressValue) =>
            setForm(f => ({
              ...f,
              country: v.country,
              megye: v.county,
              varos: v.locality,
              cim: v.street,
              hazszam: v.houseNumber,
              iranyitoszam: v.postalcode,
              adrlocality_id: v.localityId,
              adrstreet_id: v.streetId,
              isForeign: v.isForeign,
            }))
          }
          lang="hu"
        />
      </div>

      {/* Elérhetőségek */}
      <div className="space-y-4 border-t border-slate-100 pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Elérhetőségek
        </h3>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cong-email">E-mail</Label>
            <Input
              id="cong-email"
              type="email"
              placeholder="gyulekezet@erek.ro"
              value={form.email}
              onChange={e => update('email', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cong-telefon">Telefon</Label>
            <Input
              id="cong-telefon"
              placeholder="+40 740 123 456"
              value={form.telefon}
              onChange={e => update('telefon', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cong-web">Weboldal</Label>
            <Input
              id="cong-web"
              placeholder="pl. baratos.erek.ro"
              value={form.web}
              onChange={e => update('web', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Banki adatok */}
      <div className="space-y-4 border-t border-slate-100 pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Banki adatok (opcionális — később is kitölthető)
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="iban">IBAN</Label>
            <Input
              id="iban"
              placeholder="RO49 AAAA 1B31 0075 9384 0000"
              value={form.iban}
              onChange={e => update('iban', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank">Bank neve</Label>
            <Input
              id="bank"
              placeholder="pl. Banca Transilvania"
              value={form.bank}
              onChange={e => update('bank', e.target.value)}
            />
          </div>
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
