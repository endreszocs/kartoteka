'use client'

/**
 * Induló (nyitó) egyenlegek dialógus — 2026-07-17 (F4).
 *
 * A kész OpeningBalancesManager (kassza RON + bankonkénti nyitó valutában +
 * árfolyam, zárt-év védelem) eddig csak a gyülekezet-ablak soha meg nem nyíló
 * „advanced-edit" variánsában ült — innen vált elérhetővé: a Kassza fül nyitó
 * KPI-je és a Bank fül számla-kártyái linkelnek ide, valamint a gyülekezeti
 * setup-varázsló Pénzügyi alap panelje is tartalmazza.
 *
 * A rendszer egy meglévő (Excel-alapú) könyvelésbe illeszkedik: az induló
 * egyenlegeket jellemzően EGYSZER, a legelső költségvetési évre kell megadni —
 * a későbbi évek nyitóját a rendszer az előző évi záróból hozza.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OpeningBalancesManager } from '@/components/congregation/opening-balances-manager'
import type { BankAccount } from '@/lib/constants/finance'

interface OpeningBalancesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bankAccounts: BankAccount[]
  /** A hívó felület gyülekezete — scope-guard a server actionben. */
  congregationId?: string
}

export function OpeningBalancesDialog({ open, onOpenChange, bankAccounts, congregationId }: OpeningBalancesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Induló (nyitó) egyenlegek</DialogTitle>
        </DialogHeader>
        <OpeningBalancesManager
          congregationId={congregationId}
          bankAccounts={bankAccounts.map((b) => ({
            id: b.id,
            bank_neve: b.bank_neve,
            valuta: b.valuta,
            aktiv: b.aktiv,
          }))}
        />
      </DialogContent>
    </Dialog>
  )
}
