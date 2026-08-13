'use client'

/**
 * Anyagraktári anyag rögzítő dialógus — új anyag vagy meglévő szerkesztése.
 *
 * A hivatalos Anyagraktárkönyv fejléc-adatait gyűjti össze:
 *   - Anyag megnevezése (kötelező)
 *   - Mértékegység (pl. "db", "csomag", "liter")
 *   - Egységár (RON)
 *   - Kategória (opcionális csoportosítás)
 *   - Megjegyzés
 */

import { useEffect, useState } from 'react'
import { Loader2, Package, Pencil, Plus } from 'lucide-react'
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
  createMaterial,
  updateMaterial,
  type MaterialInput,
  type MaterialRow,
} from '@/app/(dashboard)/leltar/anyagraktar-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ha megadod, szerkesztés mód — egyébként új anyag rögzítése. */
  material?: MaterialRow | null
  onSaved?: (id: string) => void | Promise<void>
}

const COMMON_UNITS = ['db', 'csomag', 'doboz', 'liter', 'kg', 'm', 'ív', 'tömb', 'készlet']

export function MaterialAddDialog({ open, onOpenChange, material, onSaved }: Props) {
  const isEdit = !!material
  const [nev, setNev] = useState('')
  const [megnevezes, setMegnevezes] = useState('')
  const [mertekegyseg, setMertekegyseg] = useState('db')
  const [egysegar, setEgysegar] = useState<number | ''>('')
  const [kategoria, setKategoria] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (material) {
      setNev(material.nev)
      setMegnevezes(material.megnevezes || '')
      setMertekegyseg(material.mertekegyseg || 'db')
      setEgysegar(material.egysegar ?? '')
      setKategoria(material.kategoria || '')
      setMegjegyzes(material.megjegyzes || '')
    } else {
      setNev('')
      setMegnevezes('')
      setMertekegyseg('db')
      setEgysegar('')
      setKategoria('')
      setMegjegyzes('')
    }
  }, [open, material])

  async function handleSave() {
    if (!nev.trim()) {
      toast.error('Az anyag neve kötelező.')
      return
    }
    setSaving(true)
    try {
      const input: MaterialInput = {
        nev: nev.trim(),
        megnevezes: megnevezes.trim() || null,
        mertekegyseg: mertekegyseg.trim() || 'db',
        egysegar: typeof egysegar === 'number' ? egysegar : null,
        kategoria: kategoria.trim() || null,
        megjegyzes: megjegyzes.trim() || null,
      }
      const res = isEdit
        ? await updateMaterial(material!.id, input)
        : await createMaterial(input)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(isEdit ? 'Anyag frissítve.' : 'Anyag rögzítve.')
      onOpenChange(false)
      if (onSaved) {
        const id = isEdit ? material!.id : ((res as { id?: string }).id || '')
        await onSaved(id)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto p-0">
        <div className="border-b border-zinc-100 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600">
                {isEdit ? <Pencil className="w-5 h-5 text-white" /> : <Package className="w-5 h-5 text-white" />}
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">
                  {isEdit ? 'Anyag szerkesztése' : 'Új anyag az Anyagraktárba'}
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  A hivatalos Anyagraktárkönyv fejléc-adatai (név, mértékegység, egységár).
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          <ModalField
            label="Anyag megnevezése"
            required
            hint={`Pl. „Papír A4", „Tisztítószer", „Toner HP 26A".`}
          >
            <Input
              value={nev}
              onChange={(e) => setNev(e.target.value)}
              placeholder="Papír A4"
              maxLength={120}
              autoFocus={!isEdit}
            />
          </ModalField>

          <ModalField
            label="Hosszabb leírás (opcionális)"
            hint="Pl. márkanév, specifikáció."
          >
            <Textarea
              value={megnevezes}
              onChange={(e) => setMegnevezes(e.target.value)}
              placeholder="Pl. Xerox, 80 g/m²"
              rows={2}
            />
          </ModalField>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Mértékegység" required>
              <Input
                value={mertekegyseg}
                onChange={(e) => setMertekegyseg(e.target.value)}
                placeholder="db"
                list="common-units"
                maxLength={20}
              />
              <datalist id="common-units">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </ModalField>
            <ModalField
              label="Egységár (RON)"
              hint="Default érték-számításhoz mozgás rögzítésénél."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={egysegar}
                onChange={(e) => setEgysegar(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
              />
            </ModalField>
          </div>

          <ModalField
            label="Kategória (opcionális)"
            hint="Csoportosítási segéd — pl. Irodaszer, Tisztítószer, Nyomtatvány."
          >
            <Input
              value={kategoria}
              onChange={(e) => setKategoria(e.target.value)}
              placeholder="Irodaszer"
              maxLength={60}
            />
          </ModalField>

          <ModalField label="Megjegyzés">
            <Textarea
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.target.value)}
              placeholder="Opcionális belső megjegyzés…"
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
            disabled={saving || !nev.trim()}
            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {isEdit ? 'Mentés' : <>
              <Plus className="mr-1 size-4" />
              Anyag rögzítése
            </>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
