'use client'

/**
 * Anyagmozgás rögzítő dialógus (bevétel / kiadás).
 *
 * Egy adott anyag új mozgásának rögzítésére. A dátum, mennyiség, érték,
 * iratszám és magyarázat (kitől vettük be / kinek adtuk ki) bekéri.
 * Automatikusan számolja az értéket mennyiseg × egysegar alapján, de felülbírálható.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ModalField } from '@/components/ui/modal-field'
import {
  createMaterialMovement,
  type MaterialRow,
} from '@/app/(dashboard)/leltar/anyagraktar-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  material: MaterialRow | null
  /** Ha 'bevetel' vagy 'kiadas' van megadva, az adott tipus lesz előre kiválasztva. */
  defaultTipus?: 'bevetel' | 'kiadas'
  onSaved?: () => void | Promise<void>
}

export function MaterialMovementDialog({
  open,
  onOpenChange,
  material,
  defaultTipus = 'bevetel',
  onSaved,
}: Props) {
  const [tipus, setTipus] = useState<'bevetel' | 'kiadas'>(defaultTipus)
  const [datum, setDatum] = useState('')
  const [mennyiseg, setMennyiseg] = useState<number | ''>('')
  const [ertek, setErtek] = useState<number | ''>('')
  const [ertekOverride, setErtekOverride] = useState(false)
  const [iratSzama, setIratSzama] = useState('')
  const [magyarazat, setMagyarazat] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset a megnyitáskor
  useEffect(() => {
    if (!open) return
    setTipus(defaultTipus)
    setDatum(new Date().toISOString().slice(0, 10))
    setMennyiseg('')
    setErtek('')
    setErtekOverride(false)
    setIratSzama('')
    setMagyarazat('')
  }, [open, defaultTipus])

  // Automatikus érték-számítás (mennyiseg × egysegar), ha nincs kézi override
  const computedErtek = useMemo(() => {
    if (typeof mennyiseg !== 'number' || !material?.egysegar) return null
    return Number((mennyiseg * Number(material.egysegar)).toFixed(2))
  }, [mennyiseg, material?.egysegar])

  useEffect(() => {
    if (!ertekOverride && computedErtek != null) {
      setErtek(computedErtek)
    }
  }, [computedErtek, ertekOverride])

  async function handleSave() {
    if (!material) return
    if (!datum) {
      toast.error('Add meg a dátumot.')
      return
    }
    if (typeof mennyiseg !== 'number' || mennyiseg <= 0) {
      toast.error('A mennyiség pozitív szám legyen.')
      return
    }
    setSaving(true)
    try {
      const res = await createMaterialMovement({
        material_id: material.id,
        datum,
        tipus,
        mennyiseg,
        ertek: typeof ertek === 'number' ? ertek : null,
        irat_szama: iratSzama.trim() || null,
        magyarazat: magyarazat.trim() || null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(tipus === 'bevetel' ? 'Bevétel rögzítve.' : 'Kiadás rögzítve.')
      onOpenChange(false)
      if (onSaved) await onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (!material) return null

  const accent = tipus === 'bevetel'
    ? 'from-emerald-500 to-teal-600'
    : 'from-rose-500 to-red-600'
  const Icon = tipus === 'bevetel' ? ArrowDownCircle : ArrowUpCircle

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="border-b border-zinc-100 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`icon-raised w-10 h-10 bg-gradient-to-br ${accent}`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">
                  {tipus === 'bevetel' ? 'Bevételezés' : 'Kiadás'} — {material.nev}
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Mértékegység: {material.mertekegyseg}
                  {material.egysegar != null && ` · Egységár: ${Number(material.egysegar).toFixed(2)} RON`}
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Típus választó — nagy gombokkal */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipus('bevetel')}
              className={`rounded-xl border p-3 text-left transition ${
                tipus === 'bevetel'
                  ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <ArrowDownCircle className="size-4 text-emerald-600 mb-1" />
              <div className="text-sm font-semibold text-slate-800">Bevétel</div>
              <div className="text-[11px] text-slate-500">
                Új tétel átvétele (pl. vásárlás, ajándék)
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTipus('kiadas')}
              className={`rounded-xl border p-3 text-left transition ${
                tipus === 'kiadas'
                  ? 'border-rose-400 bg-rose-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <ArrowUpCircle className="size-4 text-rose-500 mb-1" />
              <div className="text-sm font-semibold text-slate-800">Kiadás</div>
              <div className="text-[11px] text-slate-500">
                Felhasználás (pl. szolgáltatásba, ajándék)
              </div>
            </button>
          </div>

          <ModalField label="Dátum" required>
            <Input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </ModalField>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label={`Mennyiség (${material.mertekegyseg})`} required>
              <Input
                type="number"
                step="0.001"
                min="0.001"
                value={mennyiseg}
                onChange={(e) => setMennyiseg(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
              />
            </ModalField>
            <ModalField
              label="Érték (RON)"
              hint={computedErtek != null && !ertekOverride ? `Autó-számolva (${computedErtek} RON)` : 'Felülbírálható'}
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={ertek}
                onChange={(e) => {
                  setErtek(e.target.value === '' ? '' : Number(e.target.value))
                  setErtekOverride(true)
                }}
                placeholder="0.00"
              />
            </ModalField>
          </div>

          <ModalField
            label="Iratszám"
            hint="Pl. számla sorszám vagy belső bizonylat azonosító."
          >
            <Input
              value={iratSzama}
              onChange={(e) => setIratSzama(e.target.value)}
              placeholder="Pl. 2026/001 vagy számla szám"
            />
          </ModalField>

          <ModalField
            label={tipus === 'bevetel' ? 'Kitől vettük be' : 'Kinek adtuk ki'}
            hint="A hivatalos könyv Magyarázat oszlopába kerül."
          >
            <Textarea
              value={magyarazat}
              onChange={(e) => setMagyarazat(e.target.value)}
              placeholder={tipus === 'bevetel' ? 'Pl. Lidl, egyházmegye, ajándék' : 'Pl. Lelkészi irodának'}
              rows={2}
            />
          </ModalField>
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl"
          >
            Mégse
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || typeof mennyiseg !== 'number' || mennyiseg <= 0}
            className={`rounded-xl text-white ${tipus === 'bevetel' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Rögzítés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
