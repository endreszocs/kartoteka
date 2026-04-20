'use client'

/**
 * Egyházmegye setup figyelmeztető banner.
 *
 * Akkor jelenik meg, ha a felhasználó aktív profile_role scope-ja 'diocese',
 * és az egyházmegye alapadatai (CIF, cím, bank, esperes, címer, stb.) még
 * hiányoznak. Minden oldalon látszik (header alatt), kattintásra azonnal
 * megnyitja a DioceseSetupWizard-ot.
 *
 * A banner CSAK DIOCESE SCOPE-BAN jelenik meg — más scope-ban (gyülekezet,
 * kerület, admin) rejtett.
 */

import { useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'

import { DioceseSetupWizard } from '@/components/modals/diocese-setup-wizard'

interface Props {
  /** Az aktuális egyházmegye ID-ja. Ha null, a banner nem jelenik meg. */
  dioceseId: string | null
  /** A hiányzó mezők listája (a status action-ből). Ha üres, a banner nem jelenik meg. */
  missingFields: string[]
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Egyházmegye neve',
  cif: 'CIF',
  cim_orszag: 'Ország',
  cim_megye: 'Megye',
  cim_telepules: 'Település',
  cim_iranyitoszam: 'Irányítószám',
  cim_utca: 'Utca',
  email: 'E-mail',
  telefon: 'Telefon',
  bank_nev: 'Bank neve',
  bank_fo_iban: 'IBAN',
  esperes_nev: 'Esperes neve',
  esperes_cim: 'Esperes címe',
  jegyzo_nev: 'Jegyző neve',
  cimer_url: 'Címer',
}

export function DioceseSetupBanner({ dioceseId, missingFields }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false)

  if (!dioceseId || missingFields.length === 0) return null

  const humanList = missingFields.slice(0, 3).map((f) => FIELD_LABELS[f] || f).join(', ')
  const extra = missingFields.length > 3 ? ` + ${missingFields.length - 3} további` : ''

  return (
    <>
      <button
        type="button"
        onClick={() => setWizardOpen(true)}
        className="w-full flex items-center gap-3 border-y border-amber-200/70 bg-gradient-to-r from-amber-50/80 via-amber-100/60 to-orange-50/70 px-4 py-2.5 text-left text-[13px] hover:from-amber-100/80 hover:via-amber-200/60 hover:to-orange-100/70 transition group"
        aria-label="Egyházmegye alapadatok kitöltése"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm animate-pulse">
          <AlertCircle className="size-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-amber-900">⚠ Egyházmegyei alapadatok hiányoznak</span>
          <span className="block text-[11px] text-amber-800 mt-0.5 truncate">
            Hiányzó: <strong>{humanList}{extra}</strong> — kattints ide a kitöltéshez
          </span>
        </span>
        <ArrowRight className="size-4 text-amber-700 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      <DioceseSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        dioceseId={dioceseId}
      />
    </>
  )
}
