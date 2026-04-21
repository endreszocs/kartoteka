'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Info, Loader2, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { WizardData } from '../welcome-wizard-client'

interface Step4Props {
  data: WizardData
  updateData: (patch: Partial<WizardData>) => void
  onNext: () => void | Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step4Finance({ data, updateData, onNext, onBack, saving }: Step4Props) {
  const [form, setForm] = useState(data.finance)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleNext() {
    updateData({ finance: form })
    await onNext()
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50">
          <Wallet className="size-5 text-amber-600" />
        </div>
        <div>
          <h2 className="font-heading text-2xl text-slate-800">
            Pénzügyi alapbeállítások
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Ezek az értékek a tartozás-számítás és a számadás alapjai. Később is
            módosíthatók.
          </p>
        </div>
      </div>

      {/* Járulék */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Egyházfenntartási járulék (aktuális év)
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="eves_jarulek">Éves alap járulék (RON)</Label>
            <Input
              id="eves_jarulek"
              type="number"
              step="0.01"
              min="0"
              placeholder="pl. 120"
              value={form.eves_jarulek || ''}
              onChange={e => update('eves_jarulek', Number(e.target.value))}
            />
            <p className="text-xs text-slate-500">
              Családonkénti éves egyházfenntartás.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jarulek_kedvezmenyes">Kedvezményes járulék (RON)</Label>
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
            <p className="text-xs text-slate-500">
              Nyugdíjasok, diákok stb. kedvezményes összege.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="jarulek_hatarid">Járulék határideje</Label>
          <Input
            id="jarulek_hatarid"
            placeholder="pl. 07-01 (július 1.)"
            value={form.jarulek_hatarid}
            onChange={e => update('jarulek_hatarid', e.target.value)}
          />
          <p className="text-xs text-slate-500">
            Formátum: <code>MM-DD</code>. Ezután tartozásnak számít.
          </p>
        </div>
      </div>

      {/* Nyitó egyenlegek */}
      <div className="space-y-4 border-t border-slate-100 pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Nyitó egyenlegek (opcionális)
        </h3>
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Ha ez egy új gyülekezet vagy új év kezdete, add meg a kezdő
              összegeket. Ha folytatod egy korábbi nyilvántartásból, hagyd üresen
              — a Supabase-ről letöltődnek az előzmények.
            </span>
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nyito_keszpenz">Nyitó kassza (RON)</Label>
            <Input
              id="nyito_keszpenz"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={form.nyito_keszpenz || ''}
              onChange={e => update('nyito_keszpenz', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nyito_bank">Nyitó bank (RON)</Label>
            <Input
              id="nyito_bank"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={form.nyito_bank || ''}
              onChange={e => update('nyito_bank', Number(e.target.value))}
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
