/**
 * DesktopTransactionEditDialog — a megosztott `CashbookTab.transactionEditDialogSlot`
 * desktop megvalósítása (C-hullám C1c).
 *
 * A web `transaction-edit-dialog.tsx` UX-ének tükre: gyors szerkesztő a
 * leggyakrabban javítandó mezőkhöz — dátum, összeg, jogcím (kategória),
 * iratszám, megjegyzés. A partner (személy/család) itt NEM módosítható; ahhoz
 * a webbel egyezően stornózni + újrarögzíteni kell.
 *
 * Védelem: a DÁTUM csak az éven belüli UTOLSÓ (azonos típusú) tételnél
 * módosítható (`isLastTransactionOfTypeUseCase`) — különben a mező zárolt, és a
 * mentéskor NEM küldjük a dátumot (megőrizve az eredetit). A mentés a core
 * `updateTransactionUseCase`-en megy (online; lezárt évnél a use-case blokkol).
 */

import { useEffect, useState } from 'react'
import { AlertCircle, Pencil } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '@kartoteka/ui'
import { isLastTransactionOfTypeUseCase, updateTransactionUseCase } from '@kartoteka/core'

import { errorMessage } from '../lib/error'
import { enqueueEditExcelRows, fetchEditSnapshot } from '../lib/excel-enqueue'
import { getDesktopSupabase } from '../lib/supabase'

interface Category {
  id: number
  kod: string
  nev: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'befizetes' | 'kiadas'
  id: number | null
  initial?: {
    datum: string
    osszeg: number
    id_cel: number | null
    iratszam: string | null
    megjegyzes: string | null
  }
  categories: Category[]
  onSaved: () => void | Promise<void>
  congregationId: string
  userId: string
}

export function DesktopTransactionEditDialog({
  open,
  onOpenChange,
  type,
  id,
  initial,
  categories,
  onSaved,
  congregationId,
  userId,
}: Props) {
  const [datum, setDatum] = useState('')
  const [osszeg, setOsszeg] = useState<number | ''>('')
  const [idCel, setIdCel] = useState<number | null>(null)
  const [iratszam, setIratszam] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A dátum csak az év utolsó (azonos típusú) tételénél szerkeszthető.
  const [dateEditable, setDateEditable] = useState(false)
  const [checkingLast, setCheckingLast] = useState(false)
  // P0-11 (audit 2026-08-28): optimista zár bázisa — a sor revision-je a
  // dialógus megnyitásakor. A mentés ezt küldi vissza; ha időközben más
  // mentett (web vagy másik gép), a use-case konfliktust jelez.
  const [baseRevision, setBaseRevision] = useState<number | null>(null)

  // Kiinduló értékek betöltése nyitáskor
  useEffect(() => {
    if (!open || !initial) return
    setDatum(initial.datum?.slice(0, 10) || '')
    setOsszeg(initial.osszeg ?? '')
    setIdCel(initial.id_cel ?? null)
    setIratszam(initial.iratszam || '')
    setMegjegyzes(initial.megjegyzes || '')
    setError(null)
  }, [open, initial])

  // Utolsó-tétel ellenőrzés (a dátum szerkeszthetőségéhez)
  useEffect(() => {
    if (!open || id == null) return
    let cancelled = false
    setCheckingLast(true)
    setDateEditable(false)
    setBaseRevision(null)
    void isLastTransactionOfTypeUseCase(
      { congregationId, type, id },
      { supabase: getDesktopSupabase(), runtime: 'desktop' },
    ).then((res) => {
      if (cancelled) return
      setCheckingLast(false)
      setDateEditable(!!res.isLast)
      setBaseRevision(typeof res.revision === 'number' ? res.revision : null)
    })
    return () => {
      cancelled = true
    }
  }, [open, id, type, congregationId])

  async function handleSave() {
    setError(null)
    if (id == null) return
    if (!datum) {
      setError('Add meg a dátumot.')
      return
    }
    if (typeof osszeg !== 'number' || !Number.isFinite(osszeg) || osszeg <= 0) {
      setError('Az összeg pozitív szám legyen.')
      return
    }
    setSaving(true)
    try {
      // E3: a szerkesztés ELŐTTI állapot pillanatképe — a hivatalos Excel
      // append-only tükrözéséhez (régi sor reverzál + új sor append).
      const beforeSnapshot = await fetchEditSnapshot(type, id)

      const result = await updateTransactionUseCase(
        {
          congregationId,
          type,
          id,
          // Ha a dátum nem szerkeszthető, NE küldjük (megőrizve az eredetit).
          datum: dateEditable ? datum : undefined,
          osszeg,
          id_cel: idCel,
          iratszam: iratszam.trim() || null,
          megjegyzes: megjegyzes.trim() || null,
          revision: baseRevision ?? undefined,
        },
        { supabase: getDesktopSupabase(), runtime: 'desktop', userId },
      )
      if (!result.success) {
        setError(result.error)
        return
      }
      if (beforeSnapshot) {
        void enqueueEditExcelRows({
          type,
          serverId: id,
          congregationId,
          before: beforeSnapshot,
        })
      }
      onOpenChange(false)
      await onSaved()
    } catch (err) {
      setError(`Mentési hiba: ${errorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const typeLabel = type === 'befizetes' ? 'Bevétel' : 'Kiadás'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="size-4 text-blue-600" />
            {typeLabel} szerkesztése
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-md border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-800">
            Gyors szerkesztő: dátum, összeg, jogcím, iratszám, megjegyzés. Ha a partnert
            (személy/család) kell módosítani, stornózd a tételt és rögzítsd újra.
          </p>

          {/* Dátum */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-datum" className="text-xs">
              Dátum *
            </Label>
            <Input
              id="edit-datum"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.currentTarget.value)}
              disabled={!dateEditable || checkingLast || saving}
              className={!dateEditable ? 'cursor-not-allowed bg-slate-50 text-slate-600' : ''}
            />
            <p className="text-[11px] text-slate-500">
              {checkingLast
                ? 'Ellenőrzés…'
                : dateEditable
                  ? 'Ez az éven belüli utolsó tétel — a dátum szabadon módosítható.'
                  : 'A dátum csak az éven belüli utolsó tételnél módosítható (kronológia-védelem).'}
            </p>
            {!dateEditable && !checkingLast && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                <AlertCircle className="mt-0.5 size-3 shrink-0" />
                <span>Ha másik dátum kell, stornózd a tételt és rögzítsd újra a helyes dátummal.</span>
              </p>
            )}
          </div>

          {/* Összeg */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-osszeg" className="text-xs">
              Összeg (RON) *
            </Label>
            <Input
              id="edit-osszeg"
              type="number"
              step="0.01"
              min="0"
              value={osszeg}
              onChange={(e) =>
                setOsszeg(e.currentTarget.value === '' ? '' : Number(e.currentTarget.value))
              }
              disabled={saving}
              placeholder="0.00"
            />
          </div>

          {/* Jogcím (kategória) */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-cel" className="text-xs">
              Jogcím (kategória)
            </Label>
            <select
              id="edit-cel"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={idCel ?? ''}
              onChange={(e) => setIdCel(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
              disabled={saving}
            >
              <option value="">— Válassz jogcímet —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nev}
                </option>
              ))}
            </select>
          </div>

          {/* Iratszám */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-iratszam" className="text-xs">
              Iratszám
            </Label>
            <Input
              id="edit-iratszam"
              value={iratszam}
              onChange={(e) => setIratszam(e.currentTarget.value)}
              disabled={saving}
              placeholder="Pl. 356"
            />
          </div>

          {/* Megjegyzés */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-megjegyzes" className="text-xs">
              Megjegyzés
            </Label>
            <Input
              id="edit-megjegyzes"
              maxLength={500}
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.currentTarget.value)}
              disabled={saving}
              placeholder="Opcionális belső megjegyzés…"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-700">
              <AlertCircle className="mr-1 inline-block size-3.5" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Mégse
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {saving ? 'Mentés…' : 'Mentés'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
