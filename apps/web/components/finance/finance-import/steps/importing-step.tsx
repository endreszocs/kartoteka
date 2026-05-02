'use client'

/**
 * 8. lépés — importálás folyamatban (progress bar).
 *
 * Egyszerű tájékoztató komponens: a wizard parent-je küldi a
 * `executeFinanceImport` action-t, és a transition alatt itt jelenik meg
 * a "munka folyamatban" üzenet.
 *
 * 2026-05-03 (Fázis 6): első verzió.
 */

import { Loader2, Sparkles } from 'lucide-react'

interface ImportingStepProps {
  totalItems: number
}

export function ImportingStep({ totalItems }: ImportingStepProps) {
  return (
    <div className="rounded-[1.5rem] bg-emerald-50/60 p-10 text-center ring-1 ring-emerald-200">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
        <Loader2 className="size-8 animate-spin" />
      </div>
      <p className="mt-4 text-lg font-semibold text-emerald-800">
        Importálás folyamatban…
      </p>
      <p className="mt-1 text-sm text-emerald-700">
        A wizard {totalItems} tételt küld a könyvelési rendszerbe. Ez néhány
        másodpercig tarthat — kérlek ne zárd be a böngészőt.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-emerald-700/80">
        <Sparkles className="size-3.5" />
        <span>Egy nagy lélegzettel, együtt csendben odáig várunk.</span>
      </div>

      {/* Indeterminate progress bar */}
      <div className="mx-auto mt-6 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full w-1/3 animate-[slide_2s_ease-in-out_infinite] bg-gradient-to-r from-emerald-400 to-teal-500" />
      </div>

      <style jsx>{`
        @keyframes slide {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }
      `}</style>
    </div>
  )
}
