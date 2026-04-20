'use client'

/**
 * Decont (elszámolás) dialog — a Pénzügy hero „Decont" gombja nyitja.
 *
 * A korábbi „Decont" fül helyett ez egy nagyméretű modal, ami a meglévő
 * `DecontTab` komponenst tartalmazza. A felhasználó megtölti a sablont,
 * majd közvetlenül nyomtathat / PDF-be menthet.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ClipboardList } from 'lucide-react'
import { DecontTab } from '@/components/finance/decont-tab'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName: string
}

export function DecontDialog({ open, onOpenChange, congregationName }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[96vw]
          !h-[94vh] !max-h-[94vh]
          overflow-hidden
          border border-violet-200 bg-gradient-to-br from-white via-white to-violet-50/30
          p-0 gap-0 rounded-2xl
          flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-violet-100 bg-white/70 px-6 py-4 sm:px-8 sm:py-4 rounded-t-2xl">
          <DialogTitle className="font-heading text-xl sm:text-2xl text-slate-800 flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
              <ClipboardList className="size-5" />
            </span>
            Decont — Elszámolás
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Egy átvevő által elköltött előleg részletes elszámolása.
            Töltsd ki a sablont, majd nyomtatás vagy PDF-be mentés.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 sm:px-8 sm:py-5">
          <DecontTab congregationName={congregationName} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
