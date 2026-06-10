/**
 * DesktopChitantaTombRequiredDialog — a `CashbookTab.chitantaTombRequiredDialogSlot`
 * desktop megvalósítása (C-hullám C1c).
 *
 * Akkor jelenik meg, ha a nyugta-kiállítás `NO_ACTIVE_BLOCK` hibát adott (nincs
 * aktív nyugtatömb). A web egy beágyazott tömb-wizardot mutat; a desktopon
 * (egyelőre) a dedikált Nyugtatömbök oldalra irányítunk, ahol a kerülettől
 * kapott tömb rögzíthető — utána a felhasználó visszatér és kiállítja a nyugtát.
 */

import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ScrollText } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A web a tömb-létrehozás után újrapróbálja a kiállítást; a desktop egyelőre
   *  a Nyugtatömbök oldalra navigál, ezért ezt nem használjuk. */
  onTombCreated?: () => void | Promise<void>
}

export function DesktopChitantaTombRequiredDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-600" />
            Nincs aktív nyugtatömb
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-600">
            A nyugta (chitanță) kiállításához aktív nyugtatömb kell. Rögzítsd a kerülettől
            kapott tömböt a <strong>Nyugtatömbök</strong> oldalon (seria + szám-tartomány),
            majd térj vissza a Kassza fülre, és állítsd ki a nyugtát.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                onOpenChange(false)
                navigate('/penzugy/chitanta-tombok')
              }}
            >
              <ScrollText className="mr-1.5 size-4" />
              Nyugtatömbök megnyitása
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
