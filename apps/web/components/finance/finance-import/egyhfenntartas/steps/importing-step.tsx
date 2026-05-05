'use client'

import { Loader2 } from 'lucide-react'

interface ImportingStepProps {
  totalItems: number
}

export function ImportingStep({ totalItems }: ImportingStepProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <Loader2 className="size-12 animate-spin text-emerald-600" />
      <h2 className="font-heading text-2xl text-slate-800">
        Importálás folyamatban…
      </h2>
      <p className="max-w-md text-sm text-slate-600">
        {totalItems} egyházfenntartási tételt rögzítünk a könyvelésbe. Ez
        egy-két másodpercbe telhet — egy nagy lélegzettel, együtt csendben
        odáig várunk.
      </p>
    </div>
  )
}
