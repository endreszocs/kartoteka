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
  getTransactionPersonInfo,
  isLastTransactionOfType,
  updateTransactionBasic,
  type TransactionType,
} from '@/app/(dashboard)/penzugy/edit-storno-actions'
import { ManualTagSearch } from '@/components/finance/finance-import/shared/manual-tag-search'

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
    /** 2026-07-11 (S11): a számla valutája (RON esetén nincs deviza-blokk). */
    valuta?: string | null
    /** RON-ekvivalens (devizás számlánál szerkeszthető). */
    osszeg_ron?: number | null
    /** Átváltási árfolyam (devizás számlánál). */
    arfolyam?: number | null
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
  // 2026-07-11 (S11): devizás számla — RON-ekvivalens + árfolyam szerkeszthető.
  const [osszegRon, setOsszegRon] = useState<number | ''>('')
  const [arfolyam, setArfolyam] = useState<number | ''>('')
  const valuta = (initial?.valuta || 'RON').toUpperCase()
  const isForeign = valuta !== 'RON'
  const [idCel, setIdCel] = useState<number | null>(null)
  const [iratszam, setIratszam] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [saving, setSaving] = useState(false)
  /** A dátum csak akkor szerkeszthető, ha ez az éven belüli utolsó
   *  (azonos típusú) tétel. Egyéb esetben elrejtjük / lezárjuk. */
  const [dateEditable, setDateEditable] = useState(false)
  const [checkingLast, setCheckingLast] = useState(false)
  // Befizető (tag) — jelenlegi hozzárendelés + új választás.
  // `pendingPerson`: undefined = nincs változás; { id } = új (id) vagy törlés (null).
  const [personNev, setPersonNev] = useState<string | null>(null)
  const [personForrasa, setPersonForrasa] = useState<string | null>(null)
  const [currentSzemelyId, setCurrentSzemelyId] = useState<number | null>(null)
  const [pendingPerson, setPendingPerson] = useState<{ id: number | null } | undefined>(undefined)

  // A jelenlegi tag-hozzárendelés betöltése (csak bevételnél).
  useEffect(() => {
    setPersonNev(null)
    setPersonForrasa(null)
    setCurrentSzemelyId(null)
    setPendingPerson(undefined)
    if (!open || id == null || type !== 'befizetes') return
    let cancelled = false
    void getTransactionPersonInfo({ type, id }).then((res) => {
      if (cancelled) return
      setPersonNev(res.nev ?? null)
      setPersonForrasa(res.forrasa ?? null)
      setCurrentSzemelyId(res.id_szemely ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [open, id, type])

  useEffect(() => {
    if (!open || !initial) return
    setDatum(initial.datum?.slice(0, 10) || '')
    setOsszeg(initial.osszeg ?? '')
    setOsszegRon(typeof initial.osszeg_ron === 'number' ? initial.osszeg_ron : (initial.osszeg ?? ''))
    setArfolyam(typeof initial.arfolyam === 'number' ? initial.arfolyam : '')
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
      // 2026-07-11 (S11): a könyvelés RON-ban — a osszeg_ron-t is elküldjük.
      // RON számlán osszeg_ron == osszeg, arfolyam == 1. Devizásnál a felhasználó
      // által megadott (vagy árfolyamból számolt) tényleges RON-érték + árfolyam megy.
      const ronToSave = !isForeign
        ? osszeg
        : typeof osszegRon === 'number'
          ? osszegRon
          : typeof arfolyam === 'number' && arfolyam > 0
            ? Number((osszeg * arfolyam).toFixed(2))
            : osszeg
      const rateToSave = !isForeign
        ? 1
        : typeof arfolyam === 'number' && arfolyam > 0
          ? arfolyam
          : typeof ronToSave === 'number' && osszeg > 0
            ? Number((ronToSave / osszeg).toFixed(4))
            : null
      const res = await updateTransactionBasic({
        type,
        id,
        // Ha a dátum nem szerkeszthető, NE küldjük (megőrizve az eredeti értéket)
        datum: dateEditable ? datum : undefined,
        osszeg,
        osszeg_ron: ronToSave,
        arfolyam: rateToSave,
        id_cel: idCel,
        iratszam: iratszam.trim() || null,
        megjegyzes: megjegyzes.trim() || null,
        // Tag-hozzárendelés (csak bevételnél, és csak ha a felhasználó módosította).
        ...(type === 'befizetes' && pendingPerson !== undefined
          ? { id_szemely: pendingPerson.id, id_csalad: null }
          : {}),
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
            {type === 'befizetes'
              ? 'A befizetőt (tagot) lent átkötheted vagy hozzárendelheted. Egyéb partner-adat módosításához stornózd a tételt és rögzítsd újra.'
              : 'Ez egy gyors szerkesztő. Ha partnerrel kapcsolatos adatot akarsz módosítani, stornózd a tételt és rögzítsd újra.'}
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

          {/* 2026-07-11 (S11): a felirat a SZÁMLA valutáját mutatja (nem fix RON). */}
          <ModalField label={`Összeg (${valuta})`} required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={osszeg}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value)
                setOsszeg(v)
                // Devizásnál: ha van árfolyam, a RON-értéket frissítjük; RON számlán együtt mozog.
                if (!isForeign) {
                  setOsszegRon(v)
                } else if (typeof v === 'number' && typeof arfolyam === 'number' && arfolyam > 0) {
                  setOsszegRon(Number((v * arfolyam).toFixed(2)))
                }
              }}
              placeholder="0.00"
            />
          </ModalField>

          {/* 2026-07-11 (S11): devizás számlánál a TÉNYLEGES banki átváltás RON-értéke
              és árfolyama kézzel javítható — a bank adói/rése miatt eltérhet a BNR-től. */}
          {isForeign && (
            <div className="grid grid-cols-2 gap-3">
              <ModalField
                label={`Árfolyam (RON / ${valuta})`}
                hint="A tényleges banki átváltás árfolyama."
              >
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={arfolyam}
                  onChange={(e) => {
                    const r = e.target.value === '' ? '' : Number(e.target.value)
                    setArfolyam(r)
                    if (typeof osszeg === 'number' && typeof r === 'number' && r > 0) {
                      setOsszegRon(Number((osszeg * r).toFixed(2)))
                    }
                  }}
                  placeholder="pl. 4.9752"
                />
              </ModalField>
              <ModalField label="Érték RON-ban" hint="A könyvelés ezt az összeget használja.">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={osszegRon}
                  onChange={(e) => {
                    const ron = e.target.value === '' ? '' : Number(e.target.value)
                    setOsszegRon(ron)
                    // A RON-érték kézi javításakor az árfolyamot visszaszámoljuk (tájékoztató).
                    if (typeof ron === 'number' && typeof osszeg === 'number' && osszeg > 0) {
                      setArfolyam(Number((ron / osszeg).toFixed(4)))
                    }
                  }}
                  placeholder="0.00"
                />
              </ModalField>
            </div>
          )}

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

          {type === 'befizetes' && (
            <ModalField
              label="Befizető (tag)"
              hint="Keresd meg és rendeld hozzá a tagot — ékezet nélkül, kereszt-, lánykori vagy férjezett néven is."
            >
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                <p className="text-xs text-slate-600">
                  Jelenleg:{' '}
                  {pendingPerson !== undefined ? (
                    pendingPerson.id ? (
                      <span className="font-medium text-emerald-700">új tag kiválasztva (mentésre vár)</span>
                    ) : (
                      <span className="italic text-slate-400">hozzárendelés törölve (mentésre vár)</span>
                    )
                  ) : personNev ? (
                    <span className="font-medium text-slate-800">{personNev}</span>
                  ) : personForrasa ? (
                    <span className="text-slate-700">
                      {personForrasa} <span className="text-slate-400">(szabad szöveg)</span>
                    </span>
                  ) : (
                    <span className="text-amber-700">nincs tag hozzárendelve</span>
                  )}
                </p>
                <ManualTagSearch
                  initialQuery={personNev || personForrasa || ''}
                  currentId={(pendingPerson !== undefined ? pendingPerson.id : currentSzemelyId) ?? undefined}
                  onPick={(szemelyId) => setPendingPerson({ id: szemelyId })}
                  onClear={() => setPendingPerson({ id: null })}
                />
              </div>
            </ModalField>
          )}

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
