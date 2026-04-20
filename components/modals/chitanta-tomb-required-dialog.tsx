'use client'

/**
 * „Nincs aktív nyugtatömb" felszólító dialógus.
 *
 * Ha a lelkész nyugtát akar kiállítani, de nincs még rögzített nyugtatömb,
 * ez a friendly dialóg segít végigvezetni a rögzítésen, majd
 * automatikusan újrapróbálja az eredeti kiállítási szándékot.
 *
 * Használat:
 *   <ChitantaTombRequiredDialog
 *     open={required}
 *     onOpenChange={setRequired}
 *     onTombCreated={async () => {
 *       // újrapróbálja a chitanta kiállítást
 *       await retryPendingChitanta()
 *     }}
 *   />
 */

import { useState } from 'react'
import { AlertCircle, BookOpen, ChevronRight } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ChitantaTombWizardDialog } from '@/components/modals/chitanta-tomb-wizard-dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A wizard sikeres lezárása után hívódik — itt futtasd újra a chitanta kiállítást. */
  onTombCreated?: () => void | Promise<void>
}

export function ChitantaTombRequiredDialog({ open, onOpenChange, onTombCreated }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false)

  function handleStart() {
    setWizardOpen(true)
  }

  async function handleWizardCreated() {
    setWizardOpen(false)
    // Bezárjuk a felszólító dialogot és az eredeti művelet újraindul
    onOpenChange(false)
    if (onTombCreated) await onTombCreated()
  }

  return (
    <>
      <Dialog open={open && !wizardOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md p-0">
          <div className="border-b border-amber-100 bg-amber-50/70 px-6 pt-6 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="icon-raised w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="font-heading text-lg text-amber-900">
                    Nincs aktív nyugtatömb
                  </DialogTitle>
                  <p className="text-xs text-amber-700/80 mt-0.5">
                    A nyugta kiállításához előbb rögzíteni kell egy tömböt.
                  </p>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0">
                  1
                </div>
                <div className="text-sm text-slate-700">
                  <strong>Vedd át</strong> a kerülettől a nyugtatömböt (a megyén
                  keresztül).
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0">
                  2
                </div>
                <div className="text-sm text-slate-700">
                  <strong>Rögzítsd be</strong> a kezdő és záró nyomdai számot, a
                  vásárlás dátumát és árát — a rendszer elindítja a tömb
                  követését.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0">
                  3
                </div>
                <div className="text-sm text-slate-700">
                  A nyugta <strong>automatikusan kiállításra kerül</strong> — a
                  gyülekezeti saját szám év elején 1-től indul.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl"
              >
                Most nem
              </Button>
              <Button
                type="button"
                onClick={handleStart}
                className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 gap-1.5"
              >
                <BookOpen className="size-4" />
                Tömb rögzítése
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* A tényleges wizard — sikeres rögzítés után újraindítjuk az eredeti szándékot */}
      <ChitantaTombWizardDialog
        open={wizardOpen}
        onOpenChange={(next) => {
          setWizardOpen(next)
          // Ha a wizard-ot bezárja a felhasználó mentés nélkül, visszatérünk a felszólító dialogba
        }}
        onCreated={handleWizardCreated}
      />
    </>
  )
}
