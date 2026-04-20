'use client'

/**
 * Kompakt pénzügyi tétel szerkesztő.
 *
 * A teljes IncomeDialogV3 / ExpenseDialogV2 újranyitása helyett
 * egy gyors, fókuszált szerkesztő ablak a leggyakrabban javítandó
 * mezőkhöz: dátum, összeg, jogcím kategória, iratszám, megjegyzés.
 *
 * Véglegesített évre a szerver akció elutasítja a változtatást —
 * akkor a felhasználó javítási kérelmet kell, hogy adjon.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Pencil } from 'lucide-react'
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
import { SearchableCategorySelect } from '@/components/ui/searchable-category-select'
import {
  isLastTransactionOfType,
  updateTransactionBasic,
  type TransactionType,
} from '@/app/(dashboard)/penzugy/edit-storno-actions'

type Category = {
  id: number
  kod: string
  nev: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: TransactionType
  id: number | null
  /** Kiinduló értékek — megjelenítés előtt a parent tölti fel. */
  initial?: {
    datum: string
    osszeg: number
    id_cel: number | null
    iratszam: string | null
    megjegyzes: string | null
  }
  categories: Category[]
  onSaved?: () => void | Promise<void>
}

export function TransactionEditDialog({
  open,
  onOpenChange,
  type,
  id,
  initial,
  categories,
  onSaved,
}: Props) {
  const [datum, setDatum] = useState('')
  const [osszeg, setOsszeg] = useState<number | ''>('')
  const [idCel, setIdCel] = useState<number | null>(null)
  const [iratszam, setIratszam] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [saving, setSaving] = useState(false)
  /** A dátum csak akkor szerkeszthető, ha ez az éven belüli utolsó
   *  (azonos típusú) tétel. Egyéb esetben elrejtjük / lezárjuk. */
  const [dateEditable, setDateEditable] = useState(false)
  const [checkingLast, setCheckingLast] = useState(false)

  useEffect(() => {
    if (!open || !initial) return
    setDatum(initial.datum?.slice(0, 10) || '')
    setOsszeg(initial.osszeg ?? '')
    setIdCel(initial.id_cel ?? null)
    setIratszam(initial.iratszam || '')
    setMegjegyzes(initial.megjegyzes || '')
  }, [open, initial])

  // Megvizsgáljuk, hogy ez az utolsó tétel-e — ettől függ a dátum szerkeszthetősége
  useEffect(() => {
    if (!open || id == null) return
    let cancelled = false
    setCheckingLast(true)
    setDateEditable(false)
    void isLastTransactionOfType({ type, id }).then((res) => {
      if (cancelled) return
      setCheckingLast(false)
      setDateEditable(!!res.isLast)
    })
    return () => {
      cancelled = true
    }
  }, [open, id, type])

  async function handleSave() {
    if (id == null) return
    if (!datum) {
      toast.error('Add meg a dátumot.')
      return
    }
    if (typeof osszeg !== 'number' || osszeg <= 0) {
      toast.error('Az összeg pozitív szám legyen.')
      return
    }
    setSaving(true)
    try {
      const res = await updateTransactionBasic({
        type,
        id,
        // Ha a dátum nem szerkeszthető, NE küldjük (megőrizve az eredeti értéket)
        datum: dateEditable ? datum : undefined,
        osszeg,
        id_cel: idCel,
        iratszam: iratszam.trim() || null,
        megjegyzes: megjegyzes.trim() || null,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Tétel frissítve.')
      onOpenChange(false)
      if (onSaved) await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const typeLabel = type === 'befizetes' ? 'bevétel' : 'kiadás'
  const accentBg = type === 'befizetes'
    ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
    : 'bg-gradient-to-br from-rose-500 to-red-600'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="border-b border-zinc-100 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`icon-raised w-10 h-10 ${accentBg}`}>
                <Pencil className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">
                  {typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} szerkesztése
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Dátum, összeg, jogcím, iratszám és megjegyzés gyors javítása.
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 leading-relaxed">
            Ez egy gyors szerkesztő. Ha partnerrel (személy/család) kapcsolatos
            adatot akarsz módosítani, stornózd a tételt és rögzítsd újra.
          </div>

          <ModalField
            label="Dátum"
            required
            hint={
              checkingLast
                ? 'Ellenőrzés...'
                : dateEditable
                  ? 'Ez az éven belüli utolsó tétel — szabadon módosítható.'
                  : 'A dátum csak az éven belüli utolsó tételnél módosítható (kronológia védelem).'
            }
          >
            <Input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              disabled={!dateEditable || checkingLast}
              className={!dateEditable ? 'bg-slate-50 text-slate-600 cursor-not-allowed' : ''}
            />
            {!dateEditable && !checkingLast && (
              <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700">
                <AlertCircle className="size-3 shrink-0 mt-0.5" />
                <span>
                  Ha tényleg másik dátum kell, stornózd a tételt és rögzítsd
                  újra a helyes dátummal.
                </span>
              </p>
            )}
          </ModalField>

          <ModalField label="Összeg (RON)" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={osszeg}
              onChange={(e) => setOsszeg(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0.00"
            />
          </ModalField>

          <ModalField
            label="Jogcím (kategória)"
            hint="Gépelj a kereséshez — a lista szűrődik. A belső azonosító rejtve van."
          >
            <SearchableCategorySelect
              value={idCel}
              onChange={setIdCel}
              categories={categories}
              placeholder="Válassz jogcímet..."
            />
          </ModalField>

          <ModalField label="Iratszám">
            <Input
              value={iratszam}
              onChange={(e) => setIratszam(e.target.value)}
              placeholder="Pl. 356 vagy CHIT/2024/356"
            />
          </ModalField>

          <ModalField label="Megjegyzés">
            <Textarea
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.target.value)}
              rows={2}
              placeholder="Opcionális belső megjegyzés…"
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
            disabled={saving}
            className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Mentés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
