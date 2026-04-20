'use client'

/**
 * Automatikusan megnyitja a DioceseSetupWizard-ot az egyházmegyei dashboard
 * első betöltésekor, ha az egyházmegye alapadatai még hiányoznak.
 *
 * A wizard X-szel bezárható — ekkor a layout-szinten lévő DioceseSetupBanner
 * marad aktív minden oldalon.
 *
 * A szerver oldali page.tsx átadja a `needsSetup` flag-et és a `dioceseId`-t.
 * Ez a komponens csak a first-mount auto-open logikát végzi.
 */

import { useState } from 'react'
import { DioceseSetupWizard } from '@/components/modals/diocese-setup-wizard'

interface Props {
  dioceseId: string | null
  needsSetup: boolean
}

export function DioceseSetupAutoOpen({ dioceseId, needsSetup }: Props) {
  // Az initial state közvetlenül a prop-ból — nincs setState-in-effect.
  // A komponens újrarender-elésekor a state megmarad (user bezárhatta).
  const [open, setOpen] = useState(() => Boolean(needsSetup && dioceseId))

  if (!dioceseId) return null

  return (
    <DioceseSetupWizard
      open={open}
      onOpenChange={setOpen}
      dioceseId={dioceseId}
    />
  )
}
