'use client'

import { useEffect, useState } from 'react'
import { DoorOpen, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveFamilyVisit } from '@/app/(dashboard)/tagnyilvantartas/family-actions'

interface FamilyVisitFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: number | null
  /** Opcionális: a familyhez tartozó cím-szöveg a fejlécben (csak kontextushoz) */
  familyLabel?: string | null
  /** Mentés után meghívódik — pl. a Visits-listát frissítheted */
  onSaved?: () => void
}

const FIELD_CLASS = 'bg-white shadow-sm border-slate-300 focus-visible:border-rose-400 focus-visible:ring-rose-300/40'

/**
 * 2026-06-02: Közös családlátogatás-rögzítő dialog.
 * Használható:
 *   - a Családi karton "Családlátogatás" füléről ("Új látogatás" gomb)
 *   - a Munkanapló oldalról (egységes UX)
 *
 * A `saveFamilyVisit` action a `csaladlatogatas` táblába ment, és ha a
 * felhasználó kéri, egyúttal a `munkanaplo` táblába is — egyszerre két
 * helyen jelenik meg.
 */
export function FamilyVisitFormDialog({
  open,
  onOpenChange,
  familyId,
  familyLabel,
  onSaved,
}: FamilyVisitFormDialogProps) {
  const [datum, setDatum] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [alapige, setAlapige] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [toMunkanaplo, setToMunkanaplo] = useState(true)
  const [saving, setSaving] = useState(false)

  // Reset minden megnyitáskor
  useEffect(() => {
    if (!open) return
    const today = new Date().toISOString().split('T')[0]
    setDatum(today)
    setLelkesz('')
    setAlapige('')
    setMegjegyzes('')
    setToMunkanaplo(true)
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!familyId) {
      toast.error('Hiányzó család-azonosító.')
      return
    }
    if (!datum || !lelkesz.trim()) {
      toast.error('A dátum és a lelkész neve kötelező.')
      return
    }
    setSaving(true)
    const result = await saveFamilyVisit({
      familyId,
      datum,
      lelkesz: lelkesz.trim(),
      alapige: alapige.trim() || undefined,
      megjegyzes: megjegyzes.trim() || undefined,
      toMunkanaplo,
    })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(
        toMunkanaplo
          ? 'Családlátogatás rögzítve — megjelenik a munkanaplóban is.'
          : 'Családlátogatás rögzítve.',
      )
      onSaved?.()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!w-[min(560px,calc(100vw-2rem))] !max-w-[min(560px,calc(100vw-2rem))] p-0 overflow-hidden rounded-2xl border-0 bg-transparent shadow-none"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-md transition hover:text-slate-700 hover:bg-white"
            aria-label="Bezárás"
          >
            <X className="size-4" />
          </button>

          {/* Header — rose theme (mint a Visits-fülnek) */}
          <header className="border-b border-slate-100 bg-gradient-to-br from-rose-50/70 via-white to-pink-50/40 px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-md">
                <DoorOpen className="size-5" />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <DialogTitle className="font-heading text-lg text-slate-800">
                  Új családlátogatás
                </DialogTitle>
                {familyLabel && (
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    {familyLabel} család
                  </p>
                )}
              </div>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="visit-datum">Dátum *</Label>
                <Input
                  id="visit-datum"
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  className={FIELD_CLASS}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visit-lelkesz">Lelkész neve *</Label>
                <Input
                  id="visit-lelkesz"
                  value={lelkesz}
                  onChange={(e) => setLelkesz(e.target.value)}
                  placeholder="Pl. Kovács István"
                  className={FIELD_CLASS}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="visit-alapige">Alapige (opcionális)</Label>
              <Input
                id="visit-alapige"
                value={alapige}
                onChange={(e) => setAlapige(e.target.value)}
                placeholder="Pl. Zsolt 23,1"
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="visit-megjegyzes">Megjegyzés (opcionális)</Label>
              <textarea
                id="visit-megjegyzes"
                value={megjegyzes}
                onChange={(e) => setMegjegyzes(e.target.value)}
                placeholder="Rövid leírás a látogatásról, beszélgetés tartalma, kérések…"
                className={'w-full rounded-md border px-3 py-2 text-sm min-h-[80px] resize-y ' + FIELD_CLASS}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rose-200/80 bg-rose-50/60 p-3 hover:bg-rose-50">
              <input
                type="checkbox"
                checked={toMunkanaplo}
                onChange={(e) => setToMunkanaplo(e.target.checked)}
                className="mt-0.5 size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-400"
              />
              <div className="flex-1 text-xs">
                <p className="font-semibold text-rose-900">Munkanaplóba is bejegyezve</p>
                <p className="mt-0.5 text-rose-700/80">
                  A látogatás megjelenik a Munkanapló oldalon „Családlátogatás" kategóriával,
                  hogy a havi jelentésekben is megjelenjen.
                </p>
              </div>
            </label>

            <div className="flex gap-2 border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl bg-slate-50"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Mégse
              </Button>
              <Button
                type="submit"
                className="flex-[1.6] rounded-xl bg-rose-600 hover:bg-rose-700"
                disabled={saving}
              >
                {saving ? 'Mentés…' : 'Látogatás rögzítése'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
