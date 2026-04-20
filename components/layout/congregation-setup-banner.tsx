'use client'

/**
 * Gyülekezeti setup figyelmeztető banner.
 *
 * Akkor jelenik meg, ha a felhasználó aktív profile_role scope-ja 'congregation'
 * (vagy default lelkészi scope), és a gyülekezet alapadatai hiányosak.
 * Minden oldalon látszik (header alatt), kattintásra megnyitja a wizardot.
 */

import { useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'

import { CongregationSetupWizard } from '@/components/modals/congregation-setup-wizard'

interface Props {
  congregationId: string | null
  missingFields: string[]
}

const FIELD_LABELS: Record<string, string> = {
  nev_hu: 'Magyar név',
  adoszam: 'Adószám',
  megye: 'Megye',
  varos: 'Város / Település',
  cim: 'Cím',
  email: 'E-mail',
  telefon: 'Telefon',
  bank: 'Bank neve',
  iban: 'IBAN',
  cimer_url: 'Címer',
}

export function CongregationSetupBanner({ congregationId, missingFields }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false)

  if (!congregationId || missingFields.length === 0) return null

  const humanList = missingFields.slice(0, 3).map((f) => FIELD_LABELS[f] || f).join(', ')
  const extra = missingFields.length > 3 ? ` + ${missingFields.length - 3} további` : ''

  return (
    <>
      <button
        type="button"
        onClick={() => setWizardOpen(true)}
        className="w-full flex items-center gap-3 border-y border-amber-200/70 bg-gradient-to-r from-amber-50/80 via-amber-100/60 to-orange-50/70 px-4 py-2.5 text-left text-[13px] hover:from-amber-100/80 hover:via-amber-200/60 hover:to-orange-100/70 transition group"
        aria-label="Gyülekezeti alapadatok kitöltése"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm animate-pulse">
          <AlertCircle className="size-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-amber-900">⚠ Gyülekezeti alapadatok hiányoznak</span>
          <span className="block text-[11px] text-amber-800 mt-0.5 truncate">
            Hiányzó: <strong>{humanList}{extra}</strong> — kattints ide a kitöltéshez
          </span>
        </span>
        <ArrowRight className="size-4 text-amber-700 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      <CongregationSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        congregationId={congregationId}
      />
    </>
  )
}
